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
