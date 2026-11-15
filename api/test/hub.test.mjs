import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { environment } from './database.mjs';

function call(env, path, method = 'GET', value, code) {
  return worker.fetch(new Request(`https://hub.example${path}`, {
    method, headers: { ...(code ? { Authorization: `Bearer ${code}` } : {}), ...(value ? { 'Content-Type': 'application/json' } : {}) },
    ...(value ? { body: JSON.stringify(value) } : {})
  }), env);
}
async function create(env) {
  const response = await call(env, '/v1/hubs', 'POST', { name: 'Test alliance', ownerName: 'Owner' });
  assert.equal(response.status, 201);
  return response.json();
}
async function join(env, hub, name = 'Ranger') {
  const response = await call(env, `/v1/hubs/${hub.hub.id}/leaders`, 'POST', { name }, hub.codes.invite);
  assert.equal(response.status, 201);
  return response.json();
}

test('creating a hub returns three short codes and stores only their hashes', async () => {
  const env = environment(), hub = await create(env);
  assert.equal(new Set(Object.values(hub.codes)).size, 3);
  for (const code of Object.values(hub.codes)) assert.match(code, /^[A-Za-z0-9_-]{22}$/);
  const stored = env.sql.prepare('SELECT token_hash FROM hub_tokens').all();
  assert.equal(stored.length, 3);
  assert.ok(stored.every(row => row.token_hash.length === 64 && !Object.values(hub.codes).includes(row.token_hash)));
  for (const [code, access] of [[hub.codes.owner, 'owner'], [hub.codes.invite, 'invite'], [hub.codes.member, 'member']]) {
    const response = await call(env, '/v1/hubs/access', 'GET', undefined, code);
    assert.deepEqual(await response.json(), { hubId: hub.hub.id, access });
  }
  assert.equal((await call(env, '/v1/hubs/access', 'GET', undefined, 'a'.repeat(22))).status, 404);
  assert.equal((await call(env, '/v1/hubs/access')).status, 401);
  env.sql.close();
});

test('hub input is bounded and rejects unknown fields', async () => {
  const env = environment();
  for (const payload of [{ name: '', ownerName: 'x' }, { name: 'x', ownerName: '' }, { name: 'x' }, { name: 'x'.repeat(81), ownerName: 'x' }, { name: 'x', ownerName: 'x', accountId: 'no' }]) {
    assert.equal((await call(env, '/v1/hubs', 'POST', payload)).status, 400);
  }
  env.sql.close();
});

test('each role sees only what it should', async () => {
  const env = environment(), hub = await create(env), path = `/v1/hubs/${hub.hub.id}`;
  const waiting = await join(env, hub, 'Waiting R4'), approved = await join(env, hub, 'Approved R4');
  assert.equal((await call(env, `${path}/leaders/${approved.leader.id}/approve`, 'POST', undefined, hub.codes.owner)).status, 200);

  const owner = await (await call(env, path, 'GET', undefined, hub.codes.owner)).json();
  assert.equal(owner.access, 'owner');
  assert.deepEqual(owner.leaders.map(l => [l.name, l.status]), [['Waiting R4', 'waiting'], ['Approved R4', 'approved']]);
  assert.equal(owner.hub.revision, 1);

  const r4 = await (await call(env, path, 'GET', undefined, approved.code)).json();
  assert.equal(r4.access, 'r4');
  assert.deepEqual(r4.leaders, [{ id: approved.leader.id, name: 'Approved R4' }]);
  assert.equal(r4.me.status, 'approved');
  assert.equal(r4.hub.revision, undefined);

  const wait = await (await call(env, path, 'GET', undefined, waiting.code)).json();
  assert.equal(wait.access, 'waiting');
  assert.equal(wait.leaders, undefined);
  assert.deepEqual(wait.hub, { id: hub.hub.id, name: 'Test alliance', ownerName: 'Owner' });

  const member = await (await call(env, path, 'GET', undefined, hub.codes.member)).json();
  assert.equal(member.access, 'member');
  assert.equal(member.leaders, undefined);
  assert.ok(!JSON.stringify([owner, r4, wait, member]).includes('token_hash'));
  assert.equal((await call(env, '/v1/hubs/access', 'GET', undefined, waiting.code).then(r => r.json())).access, 'waiting');
  assert.equal((await call(env, '/v1/hubs/access', 'GET', undefined, approved.code).then(r => r.json())).access, 'r4');
  env.sql.close();
});

test('only the invite link joins, only the owner approves, and codes never cross hubs', async () => {
  const env = environment(), hub = await create(env), other = await create(env), path = `/v1/hubs/${hub.hub.id}`;
  for (const code of [hub.codes.owner, hub.codes.member]) assert.equal((await call(env, `${path}/leaders`, 'POST', { name: 'x' }, code)).status, 403);
  assert.equal((await call(env, `${path}/leaders`, 'POST', { name: '' }, hub.codes.invite)).status, 400);
  assert.equal((await call(env, `${path}/leaders`, 'POST', { name: 'x', rank: 'R5' }, hub.codes.invite)).status, 400);
  const one = await join(env, hub, 'One'), two = await join(env, hub, 'Two');
  for (const code of [hub.codes.invite, hub.codes.member, one.code]) assert.equal((await call(env, `${path}/leaders/${two.leader.id}/approve`, 'POST', undefined, code)).status, 403);
  assert.equal((await call(env, `${path}/leaders/${two.leader.id}/approve`, 'POST', undefined, hub.codes.owner)).status, 200);
  assert.equal((await call(env, `${path}/leaders/${two.leader.id}/approve`, 'POST', undefined, hub.codes.owner)).status, 404);
  assert.equal((await call(env, `/v1/hubs/${other.hub.id}`, 'GET', undefined, hub.codes.owner)).status, 401);
  assert.equal((await call(env, `${path}/leaders/${one.leader.id}`, 'DELETE', undefined, two.code)).status, 403);
  assert.equal((await call(env, path, 'PATCH', { name: 'Nope', revision: 1 }, two.code)).status, 403);
  assert.equal((await call(env, path, 'DELETE', undefined, two.code)).status, 403);
  assert.equal((await call(env, `${path}/rotate`, 'POST', { role: 'member' }, two.code)).status, 403);
  assert.equal((await call(env, `${path}/handover`, 'POST', {}, two.code)).status, 403);
  env.sql.close();
});

test('the owner removes an R4, who can also leave, and their code stops working', async () => {
  const env = environment(), hub = await create(env), path = `/v1/hubs/${hub.hub.id}`;
  const one = await join(env, hub, 'One'), two = await join(env, hub, 'Two');
  assert.equal((await call(env, `${path}/leaders/${one.leader.id}`, 'DELETE', undefined, hub.codes.owner)).status, 204);
  assert.equal((await call(env, path, 'GET', undefined, one.code)).status, 401);
  assert.equal((await call(env, `/v1/hubs/access`, 'GET', undefined, one.code)).status, 404);
  assert.equal((await call(env, `${path}/leaders/${two.leader.id}`, 'DELETE', undefined, two.code)).status, 204);
  assert.equal((await call(env, path, 'GET', undefined, two.code)).status, 401);
  assert.equal(env.sql.prepare('SELECT count(*) AS n FROM hub_leaders').get().n, 0);
  assert.equal(env.sql.prepare("SELECT count(*) AS n FROM hub_tokens WHERE role = 'leader'").get().n, 0);
  env.sql.close();
});

test('rotating replaces the invite or member link, and handing over replaces the owner link', async () => {
  const env = environment(), hub = await create(env), path = `/v1/hubs/${hub.hub.id}`;
  const approved = await join(env, hub, 'Kept');
  await call(env, `${path}/leaders/${approved.leader.id}/approve`, 'POST', undefined, hub.codes.owner);
  const invite = await (await call(env, `${path}/rotate`, 'POST', { role: 'invite' }, hub.codes.owner)).json();
  assert.equal((await call(env, `${path}/leaders`, 'POST', { name: 'Late' }, hub.codes.invite)).status, 401);
  assert.equal((await call(env, `${path}/leaders`, 'POST', { name: 'New' }, invite.code)).status, 201);
  assert.equal((await call(env, path, 'GET', undefined, approved.code)).status, 200);
  const member = await (await call(env, `${path}/rotate`, 'POST', { role: 'member' }, hub.codes.owner)).json();
  assert.equal((await call(env, path, 'GET', undefined, hub.codes.member)).status, 401);
  assert.equal((await call(env, path, 'GET', undefined, member.code)).status, 200);
  assert.equal((await call(env, `${path}/rotate`, 'POST', { role: 'owner' }, hub.codes.owner)).status, 400);
  const owner = await (await call(env, `${path}/handover`, 'POST', {}, hub.codes.owner)).json();
  assert.equal((await call(env, path, 'GET', undefined, hub.codes.owner)).status, 401);
  assert.equal((await call(env, path, 'GET', undefined, owner.code)).status, 200);
  assert.equal(env.sql.prepare("SELECT count(*) AS n FROM hub_tokens WHERE role = 'owner'").get().n, 1);
  env.sql.close();
});

test('only the owner renames or deletes, stale renames are refused, and a delete clears everything', async () => {
  const env = environment(), hub = await create(env), path = `/v1/hubs/${hub.hub.id}`;
  await join(env, hub);
  assert.equal((await call(env, path, 'PATCH', { name: 'Renamed', revision: 1 }, hub.codes.owner)).status, 200);
  assert.equal((await call(env, path, 'PATCH', { name: 'Stale', revision: 1 }, hub.codes.owner)).status, 409);
  assert.equal((await call(env, path, 'PATCH', { name: 'Member', revision: 2 }, hub.codes.member)).status, 403);
  assert.equal((await call(env, path, 'DELETE', undefined, hub.codes.invite)).status, 403);
  assert.equal((await call(env, path, 'DELETE', undefined, hub.codes.owner)).status, 204);
  assert.equal((await call(env, path, 'GET', undefined, hub.codes.owner)).status, 401);
  for (const table of ['hubs', 'hub_leaders', 'hub_tokens']) assert.equal(env.sql.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
  env.sql.close();
});

test('the invite link cannot flood a hub', async () => {
  const env = environment(), hub = await create(env), path = `/v1/hubs/${hub.hub.id}`;
  for (let i = 0; i < 20; i++) await join(env, hub, `R4 ${i}`);
  const full = await call(env, `${path}/leaders`, 'POST', { name: 'One too many' }, hub.codes.invite);
  assert.equal(full.status, 409);
  assert.match((await full.json()).error, /waiting for approval/);
  const approved = env.sql.prepare('SELECT id FROM hub_leaders').all();
  for (const row of approved) await call(env, `${path}/leaders/${row.id}/approve`, 'POST', undefined, hub.codes.owner);
  assert.equal((await call(env, `${path}/leaders`, 'POST', { name: 'Room again' }, hub.codes.invite)).status, 201);
  env.sql.close();
});

test('an unused hub expires, and the daily cleanup deletes it', async () => {
  const env = environment(), hub = await create(env), path = `/v1/hubs/${hub.hub.id}`;
  env.sql.prepare("UPDATE hubs SET expires_at = '2000-01-01T00:00:00.000Z'").run();
  assert.equal((await call(env, path, 'GET', undefined, hub.codes.owner)).status, 404);
  assert.equal((await call(env, '/v1/hubs/access', 'GET', undefined, hub.codes.owner)).status, 404);
  await worker.scheduled({}, env);
  assert.equal(env.sql.prepare('SELECT count(*) AS n FROM hubs').get().n, 0);
  assert.equal(env.sql.prepare('SELECT count(*) AS n FROM hub_tokens').get().n, 0);
  env.sql.close();
});

test('using a hub keeps it alive, at most one write a day', async () => {
  const env = environment(), hub = await create(env), path = `/v1/hubs/${hub.hub.id}`;
  const soon = new Date(Date.now() + 5 * 86400000).toISOString();
  env.sql.prepare('UPDATE hubs SET expires_at = ?').run(soon);
  assert.equal((await call(env, path, 'GET', undefined, hub.codes.member)).status, 200);
  assert.ok(env.sql.prepare('SELECT expires_at FROM hubs').get().expires_at > new Date(Date.now() + 59 * 86400000).toISOString());
  env.sql.close();
});

test('the owner and approved R4s write the rules, notes and times; everyone with a link reads them', async () => {
  const env = environment(), hub = await create(env), path = `/v1/hubs/${hub.hub.id}`;
  const waiting = await join(env, hub, 'Waiting'), approved = await join(env, hub, 'Approved');
  await call(env, `${path}/leaders/${approved.leader.id}/approve`, 'POST', undefined, hub.codes.owner);
  const read = async code => (await (await call(env, path, 'GET', undefined, code)).json()).sections;
  assert.deepEqual(await read(hub.codes.member), { rules: { body: '', revision: 0, editedBy: null, editedAt: null }, notes: { body: '', revision: 0, editedBy: null, editedAt: null }, times: { body: '', revision: 0, editedBy: null, editedAt: null } });

  const first = await call(env, `${path}/sections/rules`, 'PUT', { body: 'No attacking allies.', revision: 0 }, approved.code);
  assert.equal(first.status, 200);
  assert.deepEqual({ ...(await first.json()).section, editedAt: null }, { body: 'No attacking allies.', revision: 1, editedBy: 'Approved', editedAt: null });
  const second = await call(env, `${path}/sections/rules`, 'PUT', { body: 'Be kind.', revision: 1 }, hub.codes.owner);
  assert.equal((await second.json()).section.editedBy, 'Owner');
  for (const code of [hub.codes.owner, hub.codes.invite, hub.codes.member, waiting.code, approved.code]) {
    if (code === hub.codes.invite) assert.equal((await call(env, path, 'GET', undefined, code)).status, 200);
    else assert.equal((await read(code)).rules.body, 'Be kind.');
  }

  assert.equal((await call(env, `${path}/sections/rules`, 'PUT', { body: 'Stale', revision: 1 }, approved.code)).status, 409);
  assert.equal((await call(env, `${path}/sections/rules`, 'PUT', { body: 'Again', revision: 0 }, approved.code)).status, 409);
  for (const code of [hub.codes.member, hub.codes.invite, waiting.code]) assert.equal((await call(env, `${path}/sections/notes`, 'PUT', { body: 'No', revision: 0 }, code)).status, 403);
  assert.equal((await call(env, `${path}/sections/secret`, 'PUT', { body: 'No', revision: 0 }, hub.codes.owner)).status, 404);
  assert.equal((await call(env, `${path}/sections/notes`, 'PUT', { body: 'x'.repeat(4001), revision: 0 }, hub.codes.owner)).status, 400);
  assert.equal((await call(env, `${path}/sections/notes`, 'PUT', { body: 'x', revision: 0, extra: 1 }, hub.codes.owner)).status, 400);
  assert.equal((await call(env, `${path}/sections/times`, 'PUT', { body: '', revision: 0 }, hub.codes.owner)).status, 200);

  assert.equal((await call(env, path, 'DELETE', undefined, hub.codes.owner)).status, 204);
  assert.equal(env.sql.prepare('SELECT count(*) AS n FROM hub_sections').get().n, 0);
  env.sql.close();
});

async function tasksOf(env, hub, code) { return (await (await call(env, `/v1/hubs/${hub.hub.id}`, 'GET', undefined, code)).json()).tasks; }

test('a new hub starts with the sixteen tasks, public ones first, and the owner can restore them once', async () => {
  const env = environment(), hub = await create(env), path = `/v1/hubs/${hub.hub.id}`;
  const all = await tasksOf(env, hub, hub.codes.owner);
  assert.equal(all.length, 16);
  assert.deepEqual(all.slice(0, 3).map(t => t.name), ['Alliance Championship Signups', 'Swordland Signups', 'Tri-Alliance Signups']);
  assert.equal(all.filter(t => t.public).length, 8);
  assert.equal((await tasksOf(env, hub, hub.codes.member)).length, 0, 'members see public tasks only once somebody holds them');
  assert.equal((await call(env, `${path}/tasks/template`, 'POST', {}, hub.codes.owner)).status, 409);
  for (const task of all) await call(env, `${path}/tasks/${task.id}`, 'DELETE', undefined, hub.codes.owner);
  assert.equal((await tasksOf(env, hub, hub.codes.owner)).length, 0);
  assert.equal((await call(env, `${path}/tasks/template`, 'POST', {}, hub.codes.member)).status, 403);
  assert.equal((await call(env, `${path}/tasks/template`, 'POST', {}, hub.codes.owner)).status, 201);
  assert.equal((await tasksOf(env, hub, hub.codes.owner)).length, 16);
  env.sql.close();
});

test('claims: several holders per task, labels, R4s change only their own, the owner assigns anyone', async () => {
  const env = environment(), hub = await create(env), path = `/v1/hubs/${hub.hub.id}`;
  const bran = await join(env, hub, 'Bran'), cara = await join(env, hub, 'Cara'), waiting = await join(env, hub, 'Waiting');
  for (const r of [bran, cara]) await call(env, `${path}/leaders/${r.leader.id}/approve`, 'POST', undefined, hub.codes.owner);
  const tasks = await tasksOf(env, hub, hub.codes.owner), bear = tasks.find(t => t.name === 'Bear Management'), nap = tasks.find(t => t.name === 'NAP Enforcer');

  assert.equal((await call(env, `${path}/tasks/${bear.id}/claims/me`, 'PUT', { label: 'Trap 1' }, bran.code)).status, 200);
  assert.equal((await call(env, `${path}/tasks/${bear.id}/claims/me`, 'PUT', { label: 'Trap 2' }, cara.code)).status, 200);
  assert.equal((await call(env, `${path}/tasks/${bear.id}/claims/me`, 'PUT', { label: 'Trap 3 (Academy)' }, hub.codes.owner)).status, 200);
  assert.equal((await call(env, `${path}/tasks/${nap.id}/claims/${cara.leader.id}`, 'PUT', {}, hub.codes.owner)).status, 200);
  const held = (await tasksOf(env, hub, hub.codes.owner)).find(t => t.id === bear.id);
  assert.deepEqual(held.holders.map(h => [h.name, h.label]), [['Bran', 'Trap 1'], ['Cara', 'Trap 2'], ['Owner', 'Trap 3 (Academy)']]);
  assert.deepEqual(held.holders.map(h => h.id), [bran.leader.id, cara.leader.id, 'owner']);

  // Changing a label keeps one claim per holder.
  await call(env, `${path}/tasks/${bear.id}/claims/me`, 'PUT', { label: 'Trap 4' }, bran.code);
  assert.equal((await tasksOf(env, hub, bran.code)).find(t => t.id === bear.id).holders.length, 3);

  // R4s cannot touch someone else's claim, and the others cannot hold tasks.
  assert.equal((await call(env, `${path}/tasks/${bear.id}/claims/${cara.leader.id}`, 'DELETE', undefined, bran.code)).status, 403);
  assert.equal((await call(env, `${path}/tasks/${bear.id}/claims/owner`, 'PUT', {}, bran.code)).status, 403);
  assert.equal((await call(env, `${path}/tasks/${bear.id}/claims/${bran.leader.id}`, 'DELETE', undefined, bran.code)).status, 204);
  for (const code of [hub.codes.member, hub.codes.invite, waiting.code]) assert.equal((await call(env, `${path}/tasks/${bear.id}/claims/me`, 'PUT', {}, code)).status, 403);
  assert.equal((await call(env, `${path}/tasks/${bear.id}/claims/${waiting.leader.id}`, 'PUT', {}, hub.codes.owner)).status, 404, 'only approved R4s hold tasks');
  assert.equal((await call(env, `${path}/tasks/${bear.id}/claims/me`, 'PUT', { label: 'x'.repeat(41) }, bran.code)).status, 400);

  // Members see only public tasks that somebody holds, with names and labels but no ids.
  const seen = await tasksOf(env, hub, hub.codes.member);
  assert.deepEqual(seen.map(t => t.name), ['Bear Management']);
  assert.deepEqual(seen[0].holders, [{ name: 'Cara', label: 'Trap 2' }, { name: 'Owner', label: 'Trap 3 (Academy)' }]);
  assert.ok(!JSON.stringify(await tasksOf(env, hub, waiting.code)).includes(nap.id));

  // A removed R4 takes their claims with them.
  await call(env, `${path}/leaders/${cara.leader.id}`, 'DELETE', undefined, hub.codes.owner);
  assert.equal(env.sql.prepare('SELECT count(*) AS n FROM hub_claims WHERE holder = ?').get(cara.leader.id).n, 0);
  assert.deepEqual((await tasksOf(env, hub, hub.codes.owner)).find(t => t.id === nap.id).holders, []);
  env.sql.close();
});

test('only the owner adds, edits and removes tasks; names are bounded and a hub holds forty', async () => {
  const env = environment(), hub = await create(env), path = `/v1/hubs/${hub.hub.id}`, r4 = await join(env, hub, 'Bran');
  await call(env, `${path}/leaders/${r4.leader.id}/approve`, 'POST', undefined, hub.codes.owner);
  for (const code of [r4.code, hub.codes.member, hub.codes.invite]) assert.equal((await call(env, `${path}/tasks`, 'POST', { name: 'Nope' }, code)).status, 403);
  for (const payload of [{ name: '' }, { name: 'x'.repeat(61) }, { name: 'x', public: 'yes' }, { name: 'x', note: 'n'.repeat(301) }, { name: 'x', owner: 1 }]) assert.equal((await call(env, `${path}/tasks`, 'POST', payload, hub.codes.owner)).status, 400);
  const made = await (await call(env, `${path}/tasks`, 'POST', { name: 'Trap rota', note: 'Mon to Fri', public: true }, hub.codes.owner)).json();
  assert.equal((await call(env, `${path}/tasks/${made.id}`, 'PATCH', { name: 'Hijacked' }, r4.code)).status, 403);
  assert.equal((await call(env, `${path}/tasks/${made.id}`, 'PATCH', { note: 'Weekends too' }, hub.codes.owner)).status, 200);
  const edited = (await tasksOf(env, hub, hub.codes.owner)).find(t => t.id === made.id);
  assert.deepEqual([edited.name, edited.note, edited.public], ['Trap rota', 'Weekends too', true]);
  assert.equal((await call(env, `${path}/tasks/${made.id}`, 'DELETE', undefined, r4.code)).status, 403);
  assert.equal((await call(env, `${path}/tasks/${made.id}`, 'DELETE', undefined, hub.codes.owner)).status, 204);
  assert.equal((await call(env, `${path}/tasks/${made.id}`, 'PATCH', { name: 'Gone' }, hub.codes.owner)).status, 404);
  for (let i = 0; i < 24; i++) assert.equal((await call(env, `${path}/tasks`, 'POST', { name: 'Extra ' + i }, hub.codes.owner)).status, 201);
  const over = await call(env, `${path}/tasks`, 'POST', { name: 'One too many' }, hub.codes.owner);
  assert.equal(over.status, 409); assert.match((await over.json()).error, /40 tasks/);
  const other = await create(env);
  assert.equal((await call(env, `/v1/hubs/${other.hub.id}/tasks/${made.id}`, 'PATCH', { name: 'x' }, other.codes.owner)).status, 404);
  env.sql.close();
});

// Sunday 15 November 2026, noon UTC: wheel day 7, the start of a Swordland Sunday.
async function onTheDay(fn) {
  const real = Date.now; Date.now = () => Date.parse('2026-11-15T12:00:00Z');
  try { return await fn(); } finally { Date.now = real; }
}
const dutiesOf = async (env, hub, code) => (await (await call(env, `/v1/hubs/${hub.hub.id}`, 'GET', undefined, code)).json()).duties;

test('the starter tasks fall due on the right days, for leaders only', () => onTheDay(async () => {
  const env = environment(), hub = await create(env);
  const duties = await dutiesOf(env, hub, hub.codes.owner);
  const dates = name => duties.filter(d => d.task === name).map(d => d.date);
  assert.deepEqual(dates('Swordland Signups'), ['2026-11-26', '2026-12-10']);
  assert.deepEqual(dates('Tri-Alliance Signups'), ['2026-11-26']);
  assert.deepEqual(dates('Vikings HQ Management'), ['2026-11-19', '2026-12-03']);
  assert.deepEqual(dates('Alliance Championship Signups'), ['2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07']);
  assert.deepEqual(dates('Sanctuary Reward Distribution'), ['2026-11-20', '2026-11-27', '2026-12-04', '2026-12-11']);
  assert.deepEqual(duties.map(d => d.date), [...duties.map(d => d.date)].sort());
  assert.ok(duties.every(d => d.unowned && !d.done && d.taker === null));
  const tasks = await tasksOf(env, hub, hub.codes.owner);
  assert.deepEqual(tasks.find(t => t.name === 'Tri-Alliance Signups').cadence, { type: 'wheel', days: [18] });
  assert.equal(tasks.find(t => t.name === 'Vikings HQ Management').cadenceText, 'Vikings, Thursdays');
  assert.equal(tasks.find(t => t.name === 'Bear Management').cadence, null);
  const member = await (await call(env, `/v1/hubs/${hub.hub.id}`, 'GET', undefined, hub.codes.member)).json();
  assert.equal(member.duties, undefined);
  assert.ok(!JSON.stringify(member).includes('cadence'));
  env.sql.close();
}));

test('an untaken date falls to the task holders unless the task must be claimed each time', () => onTheDay(async () => {
  const env = environment(), hub = await create(env), path = `/v1/hubs/${hub.hub.id}`, bran = await join(env, hub, 'Bran');
  await call(env, `${path}/leaders/${bran.leader.id}/approve`, 'POST', undefined, hub.codes.owner);
  const sanctuary = (await tasksOf(env, hub, hub.codes.owner)).find(t => t.name === 'Sanctuary Reward Distribution');
  await call(env, `${path}/tasks/${sanctuary.id}/claims/me`, 'PUT', {}, bran.code);
  const next = async () => (await dutiesOf(env, hub, hub.codes.owner)).find(d => d.task === 'Sanctuary Reward Distribution' && d.date === '2026-11-20');
  assert.deepEqual([(await next()).owners, (await next()).unowned], [['Bran'], false]);
  assert.equal((await call(env, `${path}/tasks/${sanctuary.id}`, 'PATCH', { dutyRule: 'claim' }, hub.codes.owner)).status, 200);
  assert.deepEqual([(await next()).owners, (await next()).unowned], [[], true]);
  assert.equal((await call(env, `${path}/tasks/${sanctuary.id}`, 'PATCH', { dutyRule: 'sometimes' }, hub.codes.owner)).status, 400);
  env.sql.close();
}));

test('taking, handing on, releasing and finishing a date, with who may do what', () => onTheDay(async () => {
  const env = environment(), hub = await create(env), path = `/v1/hubs/${hub.hub.id}`;
  const bran = await join(env, hub, 'Bran'), cara = await join(env, hub, 'Cara'), waiting = await join(env, hub, 'Waiting');
  for (const r of [bran, cara]) await call(env, `${path}/leaders/${r.leader.id}/approve`, 'POST', undefined, hub.codes.owner);
  const task = (await tasksOf(env, hub, hub.codes.owner)).find(t => t.name === 'Swordland Signups'), at = `${path}/tasks/${task.id}/duties/2026-11-26`;
  const row = async code => (await dutiesOf(env, hub, code)).find(d => d.task === 'Swordland Signups' && d.date === '2026-11-26');

  assert.equal((await call(env, at, 'PUT', { taker: 'me' }, bran.code)).status, 200);
  assert.deepEqual((await row(hub.codes.owner)).taker, { id: bran.leader.id, name: 'Bran' });
  assert.deepEqual((await row(cara.code)).owners, ['Bran']);
  // Others cannot take it off Bran, only the owner can; an R4 can put back their own.
  assert.equal((await call(env, at, 'PUT', { taker: 'none' }, cara.code)).status, 403);
  assert.equal((await call(env, at, 'PUT', { taker: cara.leader.id }, bran.code)).status, 403);
  assert.equal((await call(env, at, 'PUT', { taker: cara.leader.id }, hub.codes.owner)).status, 200);
  assert.equal((await row(hub.codes.owner)).taker.name, 'Cara');
  assert.equal((await call(env, at, 'PUT', { done: true }, bran.code)).status, 200);
  assert.equal((await row(hub.codes.owner)).done, true);
  assert.equal((await call(env, at, 'PUT', { taker: 'none' }, cara.code)).status, 200);
  assert.equal(env.sql.prepare('SELECT count(*) AS n FROM hub_duties').get().n, 1, 'a done date keeps its row');
  assert.equal((await call(env, at, 'PUT', { done: false }, cara.code)).status, 200);
  assert.equal(env.sql.prepare('SELECT count(*) AS n FROM hub_duties').get().n, 0, 'a date back at its default has no row');

  for (const code of [hub.codes.member, hub.codes.invite, waiting.code]) assert.equal((await call(env, at, 'PUT', { taker: 'me' }, code)).status, 403);
  assert.equal((await call(env, at, 'PUT', {}, bran.code)).status, 400);
  assert.equal((await call(env, at, 'PUT', { taker: 'me', extra: 1 }, bran.code)).status, 400);
  assert.equal((await call(env, at, 'PUT', { done: 'yes' }, bran.code)).status, 400);
  assert.equal((await call(env, at, 'PUT', { taker: waiting.leader.id }, hub.codes.owner)).status, 404);
  assert.equal((await call(env, `${path}/tasks/${task.id}/duties/2026-11-30`, 'PUT', { taker: 'me' }, bran.code)).status, 404, 'a date the task is not due');
  assert.equal((await call(env, `${path}/tasks/${task.id}/duties/2027-11-29`, 'PUT', { taker: 'me' }, bran.code)).status, 404, 'beyond four weeks');
  assert.equal((await call(env, `${path}/tasks/${task.id}/duties/tomorrow`, 'PUT', { taker: 'me' }, bran.code)).status, 404);

  // A removed R4 gives their dates back; deleting a task takes its dates; old dates are swept.
  await call(env, at, 'PUT', { taker: 'me' }, bran.code);
  await call(env, `${path}/leaders/${bran.leader.id}`, 'DELETE', undefined, hub.codes.owner);
  assert.deepEqual([(await row(hub.codes.owner)).taker, (await row(hub.codes.owner)).unowned], [null, true]);
  await call(env, at, 'PUT', { done: true }, cara.code);
  env.sql.prepare("INSERT INTO hub_duties (task_id, date, done) VALUES (?, '2026-01-01', 1)").run(task.id);
  await worker.scheduled({}, env);
  assert.deepEqual(env.sql.prepare('SELECT date FROM hub_duties').all().map(r => r.date), ['2026-11-26']);
  await call(env, `${path}/tasks/${task.id}`, 'DELETE', undefined, hub.codes.owner);
  assert.equal(env.sql.prepare('SELECT count(*) AS n FROM hub_duties').get().n, 0);
  env.sql.close();
}));

test('cadences are validated when a task is made or changed, and null clears one', () => onTheDay(async () => {
  const env = environment(), hub = await create(env), path = `/v1/hubs/${hub.hub.id}`, owner = hub.codes.owner;
  const made = await call(env, `${path}/tasks`, 'POST', { name: 'Trap rota', cadence: { type: 'every', weeks: 2, from: '2026-11-02' }, dutyRule: 'claim' }, owner);
  assert.equal(made.status, 201);
  const id = (await made.json()).id, find = async () => (await tasksOf(env, hub, owner)).find(t => t.id === id);
  assert.deepEqual([(await find()).cadenceText, (await find()).dutyRule], ['Every 2 weeks on Mondays from 2026-11-02', 'claim']);
  assert.deepEqual((await dutiesOf(env, hub, owner)).filter(d => d.taskId === id).map(d => d.date), ['2026-11-16', '2026-11-30']);
  for (const cadence of [{ type: 'daily' }, { type: 'weekly', weekday: 9 }, { type: 'wheel', days: [0] }, 'Fridays', { type: 'date', date: '2026-02-30' }]) assert.equal((await call(env, `${path}/tasks/${id}`, 'PATCH', { cadence }, owner)).status, 400);
  assert.equal((await call(env, `${path}/tasks/${id}`, 'PATCH', { name: 'Trap rota 2' }, owner)).status, 200);
  assert.equal((await find()).cadenceText, 'Every 2 weeks on Mondays from 2026-11-02', 'a field left out stays');
  assert.equal((await call(env, `${path}/tasks/${id}`, 'PATCH', { cadence: { type: 'date', date: '2026-12-05' } }, owner)).status, 200);
  assert.deepEqual((await dutiesOf(env, hub, owner)).filter(d => d.taskId === id).map(d => d.date), ['2026-12-05']);
  assert.equal((await call(env, `${path}/tasks/${id}`, 'PATCH', { cadence: null }, owner)).status, 200);
  assert.deepEqual([(await find()).cadence, (await dutiesOf(env, hub, owner)).filter(d => d.taskId === id).length], [null, 0]);
  assert.equal((await call(env, `${path}/tasks`, 'POST', { name: 'Bad', cadence: { type: 'weekly' } }, owner)).status, 400);
  env.sql.close();
}));

test('messages: the owner and approved R4s write them, nobody else reads them, and a task is optional', async () => {
  const env = environment(), hub = await create(env), path = `/v1/hubs/${hub.hub.id}`, owner = hub.codes.owner;
  const bran = await join(env, hub, 'Bran'), waiting = await join(env, hub, 'Waiting');
  await call(env, `${path}/leaders/${bran.leader.id}/approve`, 'POST', undefined, owner);
  const swordland = (await tasksOf(env, hub, owner)).find(t => t.name === 'Swordland Signups');
  const read = async code => (await (await call(env, path, 'GET', undefined, code)).json()).templates;

  const made = await call(env, `${path}/templates`, 'POST', { title: 'Swordland call', body: 'SWORDLAND {date}\nAsk {holder}', taskId: swordland.id }, bran.code);
  assert.equal(made.status, 201);
  const id = (await made.json()).id;
  assert.deepEqual((await read(owner)).map(t => [t.title, t.taskId, t.editedBy]), [['Swordland call', swordland.id, 'Bran']]);
  assert.equal((await call(env, `${path}/templates`, 'POST', { title: 'Loose', body: 'Hello' }, owner)).status, 201);
  assert.equal((await read(bran.code)).length, 2);
  for (const code of [hub.codes.member, hub.codes.invite, waiting.code]) {
    assert.equal((await call(env, `${path}/templates`, 'POST', { title: 'No', body: 'No' }, code)).status, 403);
    assert.equal((await call(env, `${path}/templates/${id}`, 'DELETE', undefined, code)).status, 403);
    assert.equal((await read(code)), undefined);
  }

  assert.equal((await call(env, `${path}/templates/${id}`, 'PUT', { body: 'SWORDLAND {date}\nSign up with {holder}' }, owner)).status, 200);
  const edited = (await read(owner)).find(t => t.id === id);
  assert.deepEqual([edited.body, edited.title, edited.taskId, edited.editedBy], ['SWORDLAND {date}\nSign up with {holder}', 'Swordland call', swordland.id, 'Owner']);
  assert.equal((await call(env, `${path}/templates/${id}`, 'PUT', { taskId: null }, bran.code)).status, 200);
  assert.equal((await read(owner)).find(t => t.id === id).taskId, null);

  for (const payload of [{ title: '', body: 'x' }, { title: 'x', body: '' }, { title: 'x'.repeat(61), body: 'x' }, { title: 'x', body: 'x'.repeat(1001) }, { title: 'x', body: 'x', extra: 1 }, { title: 'x', body: 'x', taskId: 'nope' }]) assert.equal((await call(env, `${path}/templates`, 'POST', payload, owner)).status, payload.taskId ? 404 : 400);
  const other = await create(env), otherTask = (await tasksOf(env, other, other.codes.owner))[0];
  assert.equal((await call(env, `${path}/templates`, 'POST', { title: 'x', body: 'x', taskId: otherTask.id }, owner)).status, 404, 'a task from another hub');
  assert.equal((await call(env, `/v1/hubs/${other.hub.id}/templates/${id}`, 'PUT', { title: 'x' }, other.codes.owner)).status, 404);

  // Removing a task keeps its messages; removing an R4 or the message itself behaves as expected.
  await call(env, `${path}/templates/${id}`, 'PUT', { taskId: swordland.id }, owner);
  await call(env, `${path}/tasks/${swordland.id}`, 'DELETE', undefined, owner);
  assert.equal((await read(owner)).find(t => t.id === id).taskId, null);
  assert.equal((await call(env, `${path}/templates/${id}`, 'DELETE', undefined, bran.code)).status, 204);
  assert.equal((await call(env, `${path}/templates/${id}`, 'DELETE', undefined, owner)).status, 404);
  for (let i = 0; i < 39; i++) assert.equal((await call(env, `${path}/templates`, 'POST', { title: 'T' + i, body: 'x' }, owner)).status, 201);
  const full = await call(env, `${path}/templates`, 'POST', { title: 'One too many', body: 'x' }, owner);
  assert.equal(full.status, 409); assert.match((await full.json()).error, /40 messages/);
  assert.equal((await call(env, path, 'DELETE', undefined, owner)).status, 204);
  assert.equal(env.sql.prepare('SELECT count(*) AS n FROM hub_templates').get().n, 0);
  env.sql.close();
});
