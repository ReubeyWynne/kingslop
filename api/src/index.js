import Engine from '../../js/vikings-engine.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const PLAN_FIELDS = ['name', 'eventAt', 'difficulty', 'notes', 'closed'];
const PLAYER_FIELDS = ['nickname', 'availability', 'infantry', 'cavalry', 'archers', 'marchCapacity', 'marches', 'notes', 'capacities'];
const MAX_BODY = 8192;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function requireValue(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message);
}

function text(value, name, max, required = false) {
  requireValue(typeof value === 'string' && value.length <= max, `${name} must be text of at most ${max} characters.`);
  const result = value.trim();
  requireValue(!required || result.length > 0, `${name} is required.`);
  return result;
}

function integer(value, name, min, max) {
  requireValue(Number.isSafeInteger(value) && value >= min && value <= max, `${name} must be an integer between ${min} and ${max}.`);
  return value;
}

async function body(request, fields) {
  requireValue(request.headers.get('content-type')?.split(';')[0].trim() === 'application/json', 'Send application/json.', 415);
  const chunks = [];
  let size = 0;
  const reader = request.body?.getReader();
  requireValue(reader, 'A JSON body is required.');
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      requireValue(size <= MAX_BODY, 'Request body is too large.', 413);
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new HttpError(400, 'Invalid JSON.'); }
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'Send a JSON object.');
  requireValue(Object.keys(value).every(key => fields.includes(key)), 'Only Vikings planning fields are accepted.');
  return value;
}

function planInput(value, previous = {}) {
  const merged = { eventAt: null, difficulty: null, notes: '', closed: false, ...previous, ...value };
  const name = text(merged.name, 'name', 80, true);
  const notes = text(merged.notes, 'notes', 2000);
  requireValue(typeof merged.closed === 'boolean', 'closed must be true or false.');
  const difficulty = merged.difficulty === null ? null : integer(merged.difficulty, 'difficulty', 1, 100);
  let eventAt = merged.eventAt;
  if (eventAt !== null) {
    requireValue(typeof eventAt === 'string' && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(eventAt) && Number.isFinite(Date.parse(eventAt)), 'eventAt must be an ISO timestamp with a timezone, or null.');
    eventAt = new Date(eventAt).toISOString();
  }
  return { name, notes, difficulty, eventAt, closed: merged.closed };
}

function playerInput(value) {
  const merged = { availability: 'unknown', infantry: 0, cavalry: 0, archers: 0, marchCapacity: 0, marches: 5, notes: '', ...value };
  requireValue(['online', 'offline', 'unknown'].includes(merged.availability), 'Invalid availability.');
  if (merged.capacities != null) {
    requireValue(Array.isArray(merged.capacities) && merged.capacities.length === merged.marches, 'Provide one capacity per queue.');
    merged.capacities.forEach(cap => integer(cap, 'queue capacity', 0, 10000000));
  }
  return {
    capacities: merged.capacities ?? null,
    nickname: text(merged.nickname, 'nickname', 40, true), availability: merged.availability,
    infantry: integer(merged.infantry, 'infantry', 0, 100000000),
    cavalry: integer(merged.cavalry, 'cavalry', 0, 100000000),
    archers: integer(merged.archers, 'archers', 0, 100000000),
    marchCapacity: integer(merged.marchCapacity, 'marchCapacity', 0, 10000000),
    marches: integer(merged.marches, 'marches', 1, 6), notes: text(merged.notes, 'notes', 300)
  };
}

function secret() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
}

function json(value, status = 200) {
  return Response.json(value, { status });
}

function planView(row) {
  return { id: row.id, name: row.name, eventAt: row.event_at, difficulty: row.difficulty, notes: row.notes, closed: Boolean(row.closed), revision: row.revision, rosterRevision: row.roster_revision || 0, createdAt: row.created_at, updatedAt: row.updated_at, expiresAt: row.expires_at };
}

function playerView(row) {
  return { id: row.id, nickname: row.nickname, availability: row.availability, infantry: row.infantry, cavalry: row.cavalry, archers: row.archers, marchCapacity: row.march_capacity, marches: row.marches, capacities: row.capacities ? JSON.parse(row.capacities) : null, notes: row.notes, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function access(request, env, planId) {
  const code = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  requireValue(code && TOKEN.test(code), 'A valid access code is required.', 401);
  const token = await env.DB.prepare('SELECT role, registration_id FROM access_tokens WHERE token_hash = ? AND plan_id = ?').bind(await digest(code), planId).first();
  requireValue(token, 'A valid access code is required.', 401);
  const plan = await env.DB.prepare('SELECT * FROM plans WHERE id = ? AND expires_at > ?').bind(planId, new Date().toISOString()).first();
  requireValue(plan, 'This plan has expired or was deleted.', 404);
  return { token, plan };
}

function manager(token) { requireValue(token.role === 'manage', 'A management code is required.', 403); }

async function limit(binding, key) {
  requireValue(binding, 'Rate limiting is not configured.', 503);
  requireValue((await binding.limit({ key })).success, 'Too many requests. Try again shortly.', 429);
}

async function route(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/health' && request.method === 'GET') {
    await env.DB.prepare('SELECT id FROM plans LIMIT 1').first();
    return json({ ok: true, service: 'kingslop-vikings', version: 1 });
  }
  if (!url.pathname.startsWith('/v1/')) {
    requireValue(['GET', 'HEAD'].includes(request.method), 'Method not allowed.', 405);
    return env.ASSETS.fetch(request);
  }
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  await limit(env.REQUEST_LIMIT, ip);
  if (url.pathname === '/v1/plans' && request.method === 'POST') {
    await limit(env.CREATE_LIMIT, ip);
    const input = planInput(await body(request, PLAN_FIELDS));
    const id = crypto.randomUUID(), now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
    const codes = { manage: secret(), join: secret(), view: secret() };
    const tokenStatements = await Promise.all(Object.entries(codes).map(async ([role, code]) => env.DB.prepare('INSERT INTO access_tokens (token_hash, plan_id, role) VALUES (?, ?, ?)').bind(await digest(code), id, role)));
    await env.DB.batch([
      env.DB.prepare('INSERT INTO plans (id, name, event_at, difficulty, notes, closed, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, input.name, input.eventAt, input.difficulty, input.notes, Number(input.closed), now, now, expiresAt),
      env.DB.prepare('INSERT INTO planning_boards (plan_id) VALUES (?)').bind(id),
      ...tokenStatements
    ]);
    return json({ plan: { id, ...input, revision: 1, createdAt: now, updatedAt: now, expiresAt }, codes }, 201);
  }
  const planning = url.pathname.match(/^\/v1\/plans\/([^/]+)\/(board|status|assignments|hq|publish|rotate)(?:\/([^/]+))?$/);
  if (planning) return planningRoute(request, env, planning);
  const match = url.pathname.match(/^\/v1\/plans\/([^/]+)(?:\/registrations(?:\/([^/]+))?)?$/);
  requireValue(match && UUID.test(match[1]) && (!match[2] || UUID.test(match[2])), 'Endpoint not found.', 404);
  const planId = match[1], registrationId = match[2], registrations = url.pathname.includes('/registrations');
  const { plan, token } = await access(request, env, planId);
  if (!registrations && request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM registrations WHERE plan_id = ? ORDER BY created_at, id').bind(planId).all();
    const board = await env.DB.prepare('SELECT * FROM planning_boards WHERE plan_id = ?').bind(planId).first();
    return json({ plan: planView(plan), registrations: rows.results.map(playerView), access: token.role, registrationId: token.registration_id, publicationRevision: board?.publication_revision || 0 });
  }
  if (!registrations && request.method === 'PATCH') {
    manager(token);
    const input = await body(request, [...PLAN_FIELDS, 'revision']);
    integer(input.revision, 'revision', 1, Number.MAX_SAFE_INTEGER);
    const next = planInput(input, planView(plan));
    const result = await env.DB.prepare('UPDATE plans SET name = ?, event_at = ?, difficulty = ?, notes = ?, closed = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ? AND expires_at > ?').bind(next.name, next.eventAt, next.difficulty, next.notes, Number(next.closed), new Date().toISOString(), planId, input.revision, new Date().toISOString()).run();
    requireValue(result.meta.changes === 1, 'This plan changed. Reload before saving.', 409);
    return json({ plan: planView(await env.DB.prepare('SELECT * FROM plans WHERE id = ?').bind(planId).first()) });
  }
  if (!registrations && request.method === 'DELETE') {
    manager(token);
    await env.DB.prepare('DELETE FROM plans WHERE id = ?').bind(planId).run();
    return new Response(null, { status: 204 });
  }
  if (registrations && !registrationId && request.method === 'POST') {
    requireValue(['join', 'manage'].includes(token.role), 'An invitation or management code is required.', 403);
    requireValue(!plan.closed, 'Registration is closed.', 409);
    const input = playerInput(await body(request, PLAYER_FIELDS));
    const id = crypto.randomUUID(), editCode = secret(), now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO registrations (id, plan_id, nickname, availability, infantry, cavalry, archers, march_capacity, marches, notes, created_at, updated_at, capacities) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, planId, input.nickname, input.availability, input.infantry, input.cavalry, input.archers, input.marchCapacity, input.marches, input.notes, now, now, input.capacities ? JSON.stringify(input.capacities) : null),
      env.DB.prepare('INSERT INTO access_tokens (token_hash, plan_id, role, registration_id) VALUES (?, ?, ?, ?)').bind(await digest(editCode), planId, 'registration', id)
    ]);
    return json({ registration: { id, ...input, revision: 1, createdAt: now, updatedAt: now }, editCode }, 201);
  }
  if (registrations && registrationId && ['PUT', 'DELETE'].includes(request.method)) {
    requireValue(token.role === 'manage' || (token.role === 'registration' && token.registration_id === registrationId), 'You cannot edit this registration.', 403);
    requireValue(!plan.closed || token.role === 'manage', 'Registration is closed.', 409);
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM registrations WHERE id = ? AND plan_id = ?').bind(registrationId, planId).run();
      return new Response(null, { status: 204 });
    }
    const input = await body(request, [...PLAYER_FIELDS, 'revision']);
    integer(input.revision, 'revision', 1, Number.MAX_SAFE_INTEGER);
    const next = playerInput(input);
    const result = await env.DB.prepare('UPDATE registrations SET nickname = ?, availability = ?, infantry = ?, cavalry = ?, archers = ?, march_capacity = ?, marches = ?, notes = ?, capacities = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND plan_id = ? AND revision = ? AND EXISTS (SELECT 1 FROM plans WHERE id = ? AND expires_at > ? AND (closed = 0 OR ? = 1))').bind(next.nickname, next.availability, next.infantry, next.cavalry, next.archers, next.marchCapacity, next.marches, next.notes, next.capacities ? JSON.stringify(next.capacities) : null, new Date().toISOString(), registrationId, planId, input.revision, planId, new Date().toISOString(), Number(token.role === 'manage')).run();
    requireValue(result.meta.changes === 1, 'This registration changed. Reload before saving.', 409);
    return json({ registration: playerView(await env.DB.prepare('SELECT * FROM registrations WHERE id = ?').bind(registrationId).first()) });
  }
  throw new HttpError(405, 'Method not allowed.');
}


async function boardState(env, planId) {
  await env.DB.prepare('INSERT OR IGNORE INTO planning_boards (plan_id) SELECT id FROM plans WHERE id = ? AND expires_at > ?').bind(planId, new Date().toISOString()).run();
  const results = await env.DB.batch([
    env.DB.prepare('SELECT * FROM plans WHERE id = ?').bind(planId),
    env.DB.prepare('SELECT * FROM planning_boards WHERE plan_id = ?').bind(planId),
    env.DB.prepare('SELECT * FROM registrations WHERE plan_id = ? ORDER BY created_at, id').bind(planId),
    env.DB.prepare('SELECT registration_id, marches FROM assignment_drafts WHERE plan_id = ?').bind(planId)
  ]);
  const rows = results.map(result => result.results);
  requireValue(rows[0][0] && rows[1][0], 'This plan has expired or was deleted.', 404);
  const plan = planView(rows[0][0]);
  requireValue(plan.expiresAt > new Date().toISOString(), 'This plan has expired or was deleted.', 404);
  return { plan, board: rows[1][0], roster: rows[2].map(playerView), assignments: Object.fromEntries(rows[3].map(r => [r.registration_id, JSON.parse(r.marches)])), hq: JSON.parse(rows[1][0].hq) };
}

function expected(value) {
  for (const key of ['revision', 'rosterRevision', 'planRevision']) integer(value[key], key, key === 'rosterRevision' ? 0 : 1, Number.MAX_SAFE_INTEGER);
}

function hqInput(value) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(k => ['capacity', 'infantryPercent', 'cavalryPercent', 'participants'].includes(k)), 'Invalid HQ fields.');
  integer(value.capacity, 'HQ capacity', 0, 100000000);
  integer(value.infantryPercent, 'infantry percent', 0, 100);
  integer(value.cavalryPercent, 'cavalry percent', 0, 100);
  requireValue(value.infantryPercent + value.cavalryPercent <= 100, 'HQ percentages cannot exceed 100.');
  requireValue(Array.isArray(value.participants) && value.participants.length <= 15, 'HQ supports at most 15 participants.');
  for (const p of value.participants) {
    requireValue(p && Object.keys(p).every(k => ['playerId', 'queue'].includes(k)) && UUID.test(p.playerId), 'Invalid HQ participant.');
    integer(p.queue, 'queue', 1, 6);
  }
  return value;
}

async function planningRoute(request, env, match) {
  const [, planId, action, playerId] = match;
  requireValue(UUID.test(planId) && (!playerId || UUID.test(playerId)), 'Endpoint not found.', 404);
  const { token, plan } = await access(request, env, planId);
  if (action === 'status' && request.method === 'GET' && !playerId) {
    const board = await env.DB.prepare('SELECT revision, publication_revision FROM planning_boards WHERE plan_id = ?').bind(planId).first();
    return json({ signature: [plan.revision, plan.roster_revision, board?.publication_revision || 0, token.role === 'manage' ? board?.revision || 1 : 0].join(':') });
  }
  if (action === 'board' && request.method === 'GET' && !playerId) {
    const state = await boardState(env, planId);
    const common = { publicationRevision: state.board.publication_revision, publishedAt: state.board.published_at, published: state.board.published ? JSON.parse(state.board.published) : null };
    if (token.role !== 'manage') return json(common);
    return json({ ...common, plan: state.plan, roster: state.roster, revision: state.board.revision, rosterRevision: state.plan.rosterRevision, planRevision: state.plan.revision, assignments: state.assignments, hq: state.hq });
  }
  manager(token);
  if (action === 'rotate' && request.method === 'POST' && !playerId) {
    const input = await body(request, ['role']);
    requireValue(['join', 'view'].includes(input.role), 'Only invitation and viewing links can be rotated.');
    const code = secret();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM access_tokens WHERE plan_id = ? AND role = ?').bind(planId, input.role),
      env.DB.prepare('INSERT INTO access_tokens (token_hash, plan_id, role) VALUES (?, ?, ?)').bind(await digest(code), planId, input.role)
    ]);
    return json({ role: input.role, code });
  }
  const isAssignment = action === 'assignments' && request.method === 'PUT' && playerId;
  const isHQ = action === 'hq' && request.method === 'PUT' && !playerId;
  const isPublish = action === 'publish' && request.method === 'POST' && !playerId;
  requireValue(isAssignment || isHQ || isPublish, 'Method not allowed.', 405);
  const input = await body(request, ['revision', 'rosterRevision', 'planRevision', ...(isAssignment ? ['marches'] : isHQ ? ['hq'] : [])]);
  expected(input);
  const state = await boardState(env, planId);
  requireValue(state.board.revision === input.revision && state.plan.rosterRevision === input.rosterRevision && state.plan.revision === input.planRevision, 'The roster or plan changed. Refresh before saving.', 409);
  if (isAssignment) {
    requireValue(state.roster.some(p => p.id === playerId), 'Player not found.', 404);
    requireValue(Array.isArray(input.marches) && input.marches.length <= 6, 'Provide at most six marches.');
    input.marches.forEach(r => requireValue(r && Object.keys(r).every(k => ['queue', 'destination', 'infantry', 'cavalry', 'archers'].includes(k)) && (r.destination === null || UUID.test(r.destination)), 'Invalid march fields.'));
    const check = Engine.validate(state.roster, { [playerId]: input.marches }, Engine.emptyHQ());
    requireValue(!check.errors.length, check.errors[0]);
    const result = await env.DB.prepare(`INSERT INTO assignment_drafts (plan_id, registration_id, marches)
      SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM planning_boards b JOIN plans p ON p.id = b.plan_id WHERE p.id = ? AND b.revision = ? AND p.roster_revision = ? AND p.revision = ? AND p.expires_at > ?)
      ON CONFLICT (plan_id, registration_id) DO UPDATE SET marches = excluded.marches`).bind(planId, playerId, JSON.stringify(input.marches), planId, input.revision, input.rosterRevision, input.planRevision, new Date().toISOString()).run();
    requireValue(result.meta.changes > 0, 'The roster or plan changed. Refresh before saving.', 409);
  } else if (isHQ) {
    const hq = hqInput(input.hq);
    requireValue(hq.participants.every(p => state.roster.some(r => r.id === p.playerId && p.queue <= r.marches)), 'HQ participants must be registered players with an available queue.');
    requireValue(new Set(hq.participants.map(p => p.playerId)).size === hq.participants.length, 'Choose each HQ participant once.');
    const result = await env.DB.prepare(`UPDATE planning_boards SET hq = ?, revision = revision + 1 WHERE plan_id = ? AND revision = ? AND EXISTS (SELECT 1 FROM plans WHERE id = ? AND roster_revision = ? AND revision = ? AND expires_at > ?)`)
      .bind(JSON.stringify(hq), planId, input.revision, planId, input.rosterRevision, input.planRevision, new Date().toISOString()).run();
    requireValue(result.meta.changes === 1, 'The roster or plan changed. Refresh before saving.', 409);
  } else {
    const check = Engine.validate(state.roster, state.assignments, state.hq);
    requireValue(state.roster.length > 0, 'Register at least one player before publishing.');
    requireValue(!check.errors.length, check.errors[0]);
    const snapshot = { plan: state.plan, roster: state.roster, assignments: state.assignments, hq: state.hq, sourceRevision: state.board.revision, rosterRevision: state.plan.rosterRevision, planRevision: state.plan.revision };
    const result = await env.DB.prepare(`UPDATE planning_boards SET published = ?, publication_revision = publication_revision + 1, published_at = ? WHERE plan_id = ? AND revision = ? AND EXISTS (SELECT 1 FROM plans WHERE id = ? AND roster_revision = ? AND revision = ? AND expires_at > ?)`)
      .bind(JSON.stringify(snapshot), new Date().toISOString(), planId, input.revision, planId, input.rosterRevision, input.planRevision, new Date().toISOString()).run();
    requireValue(result.meta.changes === 1, 'The roster or plan changed. Refresh before publishing.', 409);
  }
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin');
    const allowed = !origin || origin === new URL(request.url).origin || (env.ALLOWED_ORIGINS || '').split(',').includes(origin);
    let response;
    try {
      requireValue(allowed, 'Origin is not allowed.', 403);
      response = request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : await route(request, env);
    } catch (error) {
      if (error instanceof HttpError) response = json({ error: error.message }, error.status);
      else if (/registration_limit/.test(error.message)) response = json({ error: 'This plan has reached its 120-player limit.' }, 409);
      else if (/registration_expired/.test(error.message)) response = json({ error: 'This plan has expired.' }, 404);
      else if (/registration_closed/.test(error.message)) response = json({ error: 'Registration is closed.' }, 409);
      else response = json({ error: 'The Vikings service is unavailable. Try again shortly.' }, 503);
    }
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    headers.set('Vary', 'Origin');
    if (origin && allowed) headers.set('Access-Control-Allow-Origin', origin);
    if (request.method === 'OPTIONS' && allowed) {
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    }
    if (response.status === 429) headers.set('Retry-After', '60');
    return new Response(response.body, { status: response.status, headers });
  },
  async scheduled(controller, env) {
    await env.DB.prepare('DELETE FROM plans WHERE id IN (SELECT id FROM plans WHERE expires_at <= ? ORDER BY expires_at LIMIT 100)').bind(new Date().toISOString()).run();
  }
};
