import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { environment } from './database.mjs';
import E from '../../js/vikings-engine.js';
async function call(s, suffix = '', method = 'GET', value, code = s.codes?.manage) {
  const r = await worker.fetch(new Request('https://vikings.example/v1/plans' + (s.path || '') + suffix, { method, headers: { ...(code ? { authorization: 'Bearer ' + code } : {}), ...(value ? { 'content-type': 'application/json' } : {}) }, ...(value ? { body: JSON.stringify(value) } : {}) }), s.env);
  return { status: r.status, data: r.status === 204 ? null : await r.json() };
}
async function setup() {
  const s = { env: environment() }, r = await call(s, '', 'POST', { name: 'Vikings' });
  s.path = '/' + r.data.plan.id; s.codes = r.data.codes; s.players = [];
  for (const nickname of ['A', 'B', 'C']) s.players.push((await call(s, '/registrations', 'POST', { nickname, infantry: 600, cavalry: 300, archers: 100, marchCapacity: 500, marches: 2 })).data);
  return s;
}
async function board(s) { return (await call(s, '/board')).data; }
function revisions(b) { return { revision: b.revision, rosterRevision: b.rosterRevision, planRevision: b.planRevision }; }
// The first march goes to destination and the second to C: a player sends one march to each city.
async function assign(s, index, destination) { const p = s.players[index].registration; return call(s, '/assignments/' + p.id, 'PUT', { ...revisions(await board(s)), marches: E.split(p).rows.map((r, i) => ({ ...r, destination: i ? s.players[2].registration.id : destination })) }); }

test('every role sees the live marches, and only management can change them', async () => {
  const s = await setup(); assert.equal((await assign(s, 0, s.players[1].registration.id)).status, 200);
  const live = (await board(s)).assignments;
  for (const code of [s.codes.view, s.codes.join, s.players[0].editCode]) {
    const b = (await call(s, '/board', 'GET', undefined, code)).data;
    assert.deepEqual(b.assignments, live); assert.equal(b.roster.length, 3);
    assert.equal((await call(s, '/assignments/' + s.players[0].registration.id, 'PUT', { ...revisions(b), marches: [] }, code)).status, 403);
  }
  s.env.sql.close();
});
test('sign-ups arriving do not block a leader, but a stale march save does', async () => {
  const s = await setup(), old = await board(s), p = s.players[0];
  await call(s, '/registrations/' + p.registration.id, 'PUT', { nickname: 'Changed', infantry: 600, cavalry: 300, archers: 100, marchCapacity: 500, marches: 2, revision: 1 }, p.editCode);
  assert.equal((await board(s)).rosterRevision, old.rosterRevision + 1);
  assert.equal((await call(s, '/assignments/' + p.registration.id, 'PUT', { ...revisions(old), marches: [] })).status, 200);
  assert.equal((await call(s, '/assignments/' + p.registration.id, 'PUT', { ...revisions(old), marches: [] })).status, 409);
  const before = await board(s); await call(s, '/registrations/' + p.registration.id, 'DELETE');
  assert.equal((await board(s)).rosterRevision, before.rosterRevision + 1);
  assert.equal((await call(s, '/publish', 'POST', revisions(before))).status, 409);
  s.env.sql.close();
});
test('a room rolls on to its next event, resetting sign-ups but keeping troops', async () => {
  const s = await setup(), real = Date.now;
  try {
    Date.now = () => Date.parse('2026-10-29T12:00:00Z');
    const plan = (await call(s, '')).data.plan;
    assert.equal((await call(s, '', 'PATCH', { eventDay: 'tue', eventTime: '20:00', revision: plan.revision })).status, 200);
    let b = await board(s); assert.equal(b.plan.eventAt, '2026-11-03T20:00:00.000Z');
    const p = s.players[0], q = s.players[1];
    assert.equal((await call(s, '/registrations/' + p.registration.id, 'PUT', { nickname: 'A', infantry: 640, cavalry: 300, archers: 100, marchCapacity: 500, marches: 2, attending: true, revision: 1 }, p.editCode)).status, 200);
    assert.equal((await call(s, '/registrations/' + q.registration.id, 'PUT', { nickname: 'B', infantry: 600, cavalry: 300, archers: 100, marchCapacity: 500, marches: 2, attending: false, revision: 1 }, q.editCode)).status, 200);
    b = await board(s); assert.deepEqual(b.roster.map(r => r.attending), [true, false, null]);
    const edited = await call(s, '/registrations/' + p.registration.id, 'PUT', { nickname: 'A', infantry: 650, cavalry: 300, archers: 100, marchCapacity: 500, marches: 2, revision: 2 }, p.editCode);
    assert.equal(edited.data.registration.attending, true, 'leaving attending out keeps the answer');
    Date.now = () => Date.parse('2026-11-03T23:30:00Z');
    b = await board(s); assert.equal(b.plan.eventAt, '2026-11-17T20:00:00.000Z');
    assert.deepEqual(b.roster.map(r => r.attending), [null, null, null]); assert.equal(b.roster[0].infantry, 650);
  } finally { Date.now = real; }
  s.env.sql.close();
});
test('using a room keeps it alive', async () => {
  const s = await setup(), real = Date.now;
  try {
    Date.now = () => real() + 50 * 86400000;
    assert.equal((await call(s, '', 'GET', undefined, s.codes.view)).status, 200);
    Date.now = () => real() + 100 * 86400000;
    assert.equal((await call(s, '', 'GET', undefined, s.codes.view)).status, 200);
    Date.now = () => real() + 170 * 86400000;
    assert.equal((await call(s, '', 'GET', undefined, s.codes.view)).status, 404);
  } finally { Date.now = real; }
  s.env.sql.close();
});
test('a concurrent roster write after validation prevents publication atomically', async () => {
  const s = await setup(), old = await board(s), prepare = s.env.DB.prepare.bind(s.env.DB);
  s.env.DB.prepare = query => { if (query.includes('SET published = ?')) s.env.sql.prepare('UPDATE registrations SET infantry = infantry + 1 WHERE id = ?').run(s.players[0].registration.id); return prepare(query); };
  assert.equal((await call(s, '/publish', 'POST', revisions(old))).status, 409);
  assert.equal((await call(s, '/board', 'GET', undefined, s.codes.view)).data.published, null);
  s.env.sql.close();
});
test('invalid queues, destinations, counts and unknown fields cannot enter assignments', async () => {
  const s = await setup(), p = s.players[0].registration, other = s.players[1].registration.id;
  const valid = { queue: 1, destination: other, infantry: 100, cavalry: 0, archers: 0 };
  for (const marches of [[{ ...valid, queue: 3 }], [{ ...valid, destination: p.id }], [{ ...valid, infantry: 601 }], [{ ...valid, infantry: -1 }], [{ ...valid, gear: {} }], [valid, valid]]) {
    const r = await call(s, '/assignments/' + p.id, 'PUT', { ...revisions(await board(s)), marches }); assert.equal(r.status, 400, JSON.stringify(r));
  }
  assert.deepEqual((await board(s)).assignments, {}); s.env.sql.close();
});
test('HQ reuses queues across phases while respecting the troops still in other city marches', async () => {
  const s = await setup(); await assign(s, 0, s.players[1].registration.id);
  const hq = { capacity: 500, infantryPercent: 75, cavalryPercent: 25, participants: [{ playerId: s.players[0].registration.id, queue: 1 }] };
  assert.equal((await call(s, '/hq', 'PUT', { ...revisions(await board(s)), hq })).status, 200);
  const bad = await call(s, '/publish', 'POST', revisions(await board(s))); assert.equal(bad.status, 400); assert.match(bad.data.error, /recall more infantry/);
  hq.capacity = 400; await call(s, '/hq', 'PUT', { ...revisions(await board(s)), hq });
  assert.equal((await call(s, '/publish', 'POST', revisions(await board(s)))).status, 200); s.env.sql.close();
});
test('link rotation revokes the previous invitation without touching other credentials', async () => {
  const s = await setup(), rotated = await call(s, '/rotate', 'POST', { role: 'join' }); assert.equal(rotated.status, 200);
  assert.equal((await call(s, '', 'GET', undefined, s.codes.join)).status, 401);
  assert.equal((await call(s, '', 'GET', undefined, rotated.data.code)).status, 200);
  assert.equal((await call(s, '', 'GET', undefined, s.codes.view)).status, 200);
  assert.equal((await call(s, '/rotate', 'POST', { role: 'manage' })).status, 400); s.env.sql.close();
});
test('per-queue capacities survive registration and constrain assignments', async () => {
  const s = await setup(), p = s.players[0].registration, data = { ...p, capacities: [100, 500] };
  for (const k of ['id', 'createdAt', 'updatedAt']) delete data[k];
  assert.equal((await call(s, '/registrations/' + p.id, 'PUT', data, s.players[0].editCode)).status, 200);
  assert.deepEqual((await board(s)).roster.find(player => player.id === p.id).capacities, [100, 500]);
  assert.equal((await call(s, '/assignments/' + p.id, 'PUT', { ...revisions(await board(s)), marches: [{ queue: 1, destination: s.players[1].registration.id, infantry: 101, cavalry: 0, archers: 0 }] })).status, 400); s.env.sql.close();
});

test('the lightweight signature changes with roster and march revisions for every role', async () => {
  const s = await setup(), before = (await call(s, '/status')).data.signature;
  assert.equal((await call(s, '/status')).data.signature, before);
  await call(s, '/registrations', 'POST', { nickname: 'Third' });
  const after = (await call(s, '/status')).data.signature; assert.notEqual(after, before);
  const viewer = (await call(s, '/status', 'GET', undefined, s.codes.view)).data.signature;
  assert.equal((await assign(s, 0, s.players[1].registration.id)).status, 200);
  assert.notEqual((await call(s, '/status', 'GET', undefined, s.codes.view)).data.signature, viewer);
  s.env.sql.close();
});

test('a garrison capacity is optional and survives edits that leave it out', async () => {
  const s = await setup(), p = s.players[0].registration;
  assert.equal((await board(s)).roster.find(player => player.id === p.id).garrisonCapacity, null);
  await call(s, '/registrations/' + p.id, 'PUT', { nickname: 'A', infantry: 600, cavalry: 300, archers: 100, marchCapacity: 500, marches: 2, garrisonCapacity: 900000, revision: 1 }, s.players[0].editCode);
  await call(s, '/registrations/' + p.id, 'PUT', { nickname: 'A', infantry: 640, cavalry: 300, archers: 100, marchCapacity: 500, marches: 2, revision: 2 }, s.players[0].editCode);
  assert.equal((await board(s)).roster.find(player => player.id === p.id).garrisonCapacity, 900000);
});
