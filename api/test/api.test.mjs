import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { environment } from './database.mjs';

function call(env, path, method = 'GET', value, code, headers = {}) {
  return worker.fetch(new Request(`https://vikings.example${path}`, {
    method, headers: { ...(code ? { Authorization: `Bearer ${code}` } : {}), ...(value ? { 'Content-Type': 'application/json' } : {}), ...headers },
    ...(value ? { body: JSON.stringify(value) } : {})
  }), env);
}
async function create(env) {
  const response = await call(env, '/v1/plans', 'POST', { name: 'Thursday Vikings' });
  assert.equal(response.status, 201);
  return response.json();
}
async function register(env, plan, nickname = 'Deyci') {
  const response = await call(env, `/v1/plans/${plan.plan.id}/registrations`, 'POST', { nickname, infantry: 150000, marches: 5 }, plan.codes.join);
  assert.equal(response.status, 201);
  return response.json();
}

test('health checks the database and never includes secrets', async () => {
  const env = environment();
  const response = await call(env, '/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'kingslop-vikings', version: 1 });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  env.sql.close();
});

test('secret roles protect every write, and player codes cannot edit another registration or plan', async () => {
  const env = environment(), plan = await create(env), path = `/v1/plans/${plan.plan.id}`;
  assert.equal(new Set(Object.values(plan.codes)).size, 3);
  for (const code of Object.values(plan.codes)) assert.match(code, /^[A-Za-z0-9_-]{22}$/);
  const stored = env.sql.prepare('SELECT token_hash FROM access_tokens').all();
  assert.ok(stored.every(row => row.token_hash.length === 64 && !Object.values(plan.codes).includes(row.token_hash)));
  assert.equal((await call(env, path)).status, 401);
  assert.equal((await call(env, path, 'GET', undefined, 'a'.repeat(43))).status, 401);
  assert.equal((await call(env, path, 'PATCH', { closed: true, revision: 1 }, plan.codes.join)).status, 403);
  assert.equal((await call(env, `${path}/registrations`, 'POST', { nickname: 'x' }, plan.codes.view)).status, 403);
  assert.equal((await call(env, path, 'DELETE', undefined, plan.codes.view)).status, 403);
  const one = await register(env, plan), two = await register(env, plan, 'Another player');
  assert.equal((await call(env, `${path}/registrations/${two.registration.id}`, 'PUT', { nickname: 'Hijacked', revision: 1 }, one.editCode)).status, 403);
  assert.equal((await call(env, `${path}/registrations/${two.registration.id}`, 'DELETE', undefined, one.editCode)).status, 403);
  assert.equal((await call(env, path, 'PATCH', { name: 'Hijacked', revision: 1 }, one.editCode)).status, 403);
  const other = await create(env);
  assert.equal((await call(env, `/v1/plans/${other.plan.id}`, 'GET', undefined, plan.codes.manage)).status, 401);
  const board = await (await call(env, path, 'GET', undefined, one.editCode)).json();
  assert.equal(board.registrationId, one.registration.id);
  assert.equal(board.registrations.length, 2);
  assert.ok(!JSON.stringify(board).includes('token_hash'));
  assert.ok(!JSON.stringify(board).includes(plan.codes.manage));
  env.sql.close();
});

test('only bounded Vikings data is accepted, including streaming body limits', async () => {
  const env = environment();
  for (const payload of [{ name: 'x', inventory: {} }, { name: 'x', heroGear: {} }, { name: 'x', notes: 'a'.repeat(2001) }, { name: '' }, { name: 'x', eventAt: 'tomorrow' }]) {
    assert.equal((await call(env, '/v1/plans', 'POST', payload)).status, 400);
  }
  assert.equal((await call(env, '/v1/plans', 'POST', { name: 'x'.repeat(9000) })).status, 413);
  const invalid = await worker.fetch(new Request('https://vikings.example/v1/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }), env);
  assert.equal(invalid.status, 400);
  const plan = await create(env);
  for (const payload of [{ nickname: 'x', infantry: -1 }, { nickname: 'x', marches: 7 }, { nickname: 'x', infantry: 0.5 }, { nickname: 'x', accountId: 'no' }]) {
    assert.equal((await call(env, `/v1/plans/${plan.plan.id}/registrations`, 'POST', payload, plan.codes.join)).status, 400);
  }
  env.sql.close();
});

test('revision checks reject stale saves and closed registration blocks player changes', async () => {
  const env = environment(), plan = await create(env), path = `/v1/plans/${plan.plan.id}`;
  const player = await register(env, plan), row = `${path}/registrations/${player.registration.id}`;
  assert.equal((await call(env, row, 'PUT', { nickname: 'Updated', revision: 1 }, player.editCode)).status, 200);
  assert.equal((await call(env, row, 'PUT', { nickname: 'Stale', revision: 1 }, player.editCode)).status, 409);
  assert.equal((await call(env, path, 'PATCH', { closed: true, revision: 1 }, plan.codes.manage)).status, 200);
  assert.equal((await call(env, path, 'PATCH', { name: 'Stale', revision: 1 }, plan.codes.manage)).status, 409);
  assert.equal((await call(env, `${path}/registrations`, 'POST', { nickname: 'Late' }, plan.codes.join)).status, 409);
  assert.equal((await call(env, row, 'PUT', { nickname: 'Late', revision: 2 }, player.editCode)).status, 409);
  assert.equal((await call(env, row, 'DELETE', undefined, player.editCode)).status, 409);
  assert.equal((await call(env, row, 'PUT', { nickname: 'Leader correction', revision: 2 }, plan.codes.manage)).status, 200);
  env.sql.close();
});

test('deletion cascades to registrations and their credentials; expiry denies access before cleanup', async () => {
  const env = environment(), plan = await create(env), path = `/v1/plans/${plan.plan.id}`;
  const player = await register(env, plan);
  assert.equal((await call(env, `${path}/registrations/${player.registration.id}`, 'DELETE', undefined, player.editCode)).status, 204);
  assert.equal(env.sql.prepare("SELECT count(*) AS total FROM access_tokens WHERE role = 'registration'").get().total, 0);
  await register(env, plan);
  env.sql.prepare('UPDATE plans SET expires_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', plan.plan.id);
  assert.equal((await call(env, path, 'GET', undefined, plan.codes.manage)).status, 404);
  await worker.scheduled({}, env);
  for (const table of ['plans', 'registrations', 'access_tokens']) assert.equal(env.sql.prepare(`SELECT count(*) AS total FROM ${table}`).get().total, 0);
  const next = await create(env);
  await register(env, next);
  assert.equal((await call(env, `/v1/plans/${next.plan.id}`, 'DELETE', undefined, next.codes.manage)).status, 204);
  for (const table of ['plans', 'registrations', 'access_tokens']) assert.equal(env.sql.prepare(`SELECT count(*) AS total FROM ${table}`).get().total, 0);
  env.sql.close();
});

test('the SQL player cap is atomic and failed batches do not leave credentials behind', async () => {
  const env = environment(), plan = await create(env), path = `/v1/plans/${plan.plan.id}`;
  for (let i = 0; i < 120; i++) await register(env, plan, `Player ${i}`);
  const response = await call(env, `${path}/registrations`, 'POST', { nickname: 'Overflow' }, plan.codes.join);
  assert.equal(response.status, 409);
  assert.equal(env.sql.prepare('SELECT count(*) AS total FROM registrations').get().total, 120);
  assert.equal(env.sql.prepare('SELECT count(*) AS total FROM access_tokens').get().total, 123);
  env.sql.close();
});

test('CORS rejects unapproved sites and rate limits fail closed', async () => {
  const env = environment();
  const response = await call(env, '/v1/plans', 'OPTIONS', undefined, undefined, { Origin: 'https://dey.ci' });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://dey.ci');
  assert.equal((await call(env, '/v1/plans', 'POST', { name: 'x' }, undefined, { Origin: 'https://elsewhere.example' })).status, 403);
  env.CREATE_LIMIT = { async limit() { return { success: false }; } };
  assert.equal((await call(env, '/v1/plans', 'POST', { name: 'x' })).status, 429);
  assert.equal(env.sql.prepare('SELECT count(*) AS total FROM plans').get().total, 0);
  delete env.REQUEST_LIMIT;
  assert.equal((await call(env, '/v1/plans', 'POST', { name: 'x' })).status, 503);
  env.sql.close();
});

test('a short link code alone resolves its plan and role, and stops once replaced or deleted', async () => {
  const env = environment(), plan = await create(env), joined = await register(env, plan);
  assert.match(joined.editCode, /^[A-Za-z0-9_-]{22}$/);
  for (const [role, code] of [...Object.entries(plan.codes), ['registration', joined.editCode]]) {
    const response = await call(env, '/v1/access', 'GET', undefined, code);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { planId: plan.plan.id, access: role });
  }
  assert.equal((await call(env, '/v1/access')).status, 401);
  assert.equal((await call(env, '/v1/access', 'GET', undefined, 'a'.repeat(22))).status, 404);
  assert.equal((await call(env, '/v1/access', 'GET', undefined, 'a'.repeat(30))).status, 401);
  const rotated = await (await call(env, `/v1/plans/${plan.plan.id}/rotate`, 'POST', { role: 'join' }, plan.codes.manage)).json();
  assert.equal((await call(env, '/v1/access', 'GET', undefined, plan.codes.join)).status, 404);
  assert.equal((await call(env, '/v1/access', 'GET', undefined, rotated.code)).status, 200);
  env.sql.prepare("UPDATE plans SET expires_at = '2000-01-01T00:00:00.000Z'").run();
  assert.equal((await call(env, '/v1/access', 'GET', undefined, plan.codes.manage)).status, 404);
  env.sql.close();
});

test('codes issued before short links keep working', async () => {
  const env = environment(), plan = await create(env), legacy = 'L'.repeat(43);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(legacy))), n => n.toString(16).padStart(2, '0')).join('');
  env.sql.prepare("INSERT INTO access_tokens (token_hash, plan_id, role) VALUES (?, ?, 'view')").run(hash, plan.plan.id);
  assert.equal((await call(env, `/v1/plans/${plan.plan.id}`, 'GET', undefined, legacy)).status, 200);
  assert.deepEqual(await (await call(env, '/v1/access', 'GET', undefined, legacy)).json(), { planId: plan.plan.id, access: 'view' });
  env.sql.close();
});
