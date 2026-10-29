const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const PLAN_FIELDS = ['name', 'eventAt', 'difficulty', 'notes', 'closed'];
const PLAYER_FIELDS = ['nickname', 'availability', 'infantry', 'cavalry', 'archers', 'marchCapacity', 'marches', 'notes'];
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
  return {
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
  return { id: row.id, name: row.name, eventAt: row.event_at, difficulty: row.difficulty, notes: row.notes, closed: Boolean(row.closed), revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at, expiresAt: row.expires_at };
}

function playerView(row) {
  return { id: row.id, nickname: row.nickname, availability: row.availability, infantry: row.infantry, cavalry: row.cavalry, archers: row.archers, marchCapacity: row.march_capacity, marches: row.marches, notes: row.notes, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at };
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
      ...tokenStatements
    ]);
    return json({ plan: { id, ...input, revision: 1, createdAt: now, updatedAt: now, expiresAt }, codes }, 201);
  }
  const match = url.pathname.match(/^\/v1\/plans\/([^/]+)(?:\/registrations(?:\/([^/]+))?)?$/);
  requireValue(match && UUID.test(match[1]) && (!match[2] || UUID.test(match[2])), 'Endpoint not found.', 404);
  const planId = match[1], registrationId = match[2], registrations = url.pathname.includes('/registrations');
  const { plan, token } = await access(request, env, planId);
  if (!registrations && request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM registrations WHERE plan_id = ? ORDER BY created_at, id').bind(planId).all();
    return json({ plan: planView(plan), registrations: rows.results.map(playerView), access: token.role, registrationId: token.registration_id });
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
      env.DB.prepare('INSERT INTO registrations (id, plan_id, nickname, availability, infantry, cavalry, archers, march_capacity, marches, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, planId, input.nickname, input.availability, input.infantry, input.cavalry, input.archers, input.marchCapacity, input.marches, input.notes, now, now),
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
    const result = await env.DB.prepare('UPDATE registrations SET nickname = ?, availability = ?, infantry = ?, cavalry = ?, archers = ?, march_capacity = ?, marches = ?, notes = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND plan_id = ? AND revision = ? AND EXISTS (SELECT 1 FROM plans WHERE id = ? AND expires_at > ? AND (closed = 0 OR ? = 1))').bind(next.nickname, next.availability, next.infantry, next.cavalry, next.archers, next.marchCapacity, next.marches, next.notes, new Date().toISOString(), registrationId, planId, input.revision, planId, new Date().toISOString(), Number(token.role === 'manage')).run();
    requireValue(result.meta.changes === 1, 'This registration changed. Reload before saving.', 409);
    return json({ registration: playerView(await env.DB.prepare('SELECT * FROM registrations WHERE id = ?').bind(registrationId).first()) });
  }
  throw new HttpError(405, 'Method not allowed.');
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
