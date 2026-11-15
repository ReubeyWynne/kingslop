// Alliance hubs. The R5 owns a hub, R4s join through one shared invite link and wait for the
// owner's approval, and members read through one member link. Codes work like the Vikings
// ones: random, stored only as hashes, sent in the Authorization header.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HUB_FIELDS = ['name', 'ownerName'];

function hubView(row, owner) {
  const view = { id: row.id, name: row.name, ownerName: row.owner_name };
  return owner ? { ...view, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at, expiresAt: row.expires_at } : view;
}

// The owner sees every R4 with their state; an approved R4 sees who else is approved.
function leaderView(row, owner) {
  const view = { id: row.id, name: row.name };
  return owner ? { ...view, status: row.status, createdAt: row.created_at, approvedAt: row.approved_at, lastSeenAt: row.last_seen_at } : view;
}

export async function hubRoute(request, env, url, ip, k) {
  const { HttpError, requireValue, text, integer, body, secret, digest, json, bearer, nowIso, KEEP_MS, limit } = k;

  async function access(hubId) {
    const token = await env.DB.prepare('SELECT role, leader_id FROM hub_tokens WHERE token_hash = ? AND hub_id = ?').bind(await digest(bearer(request)), hubId).first();
    requireValue(token, 'A valid access code is required.', 401);
    const hub = await env.DB.prepare('SELECT * FROM hubs WHERE id = ? AND expires_at > ?').bind(hubId, nowIso()).first();
    requireValue(hub, 'This hub has expired or was deleted.', 404);
    const now = Date.now(), keep = now + KEEP_MS;
    if (Date.parse(hub.expires_at) < keep - 86400000) await env.DB.prepare('UPDATE hubs SET expires_at = ? WHERE id = ?').bind(new Date(keep).toISOString(), hubId).run();
    let leader = null;
    if (token.role === 'leader') {
      leader = await env.DB.prepare('SELECT * FROM hub_leaders WHERE id = ? AND hub_id = ?').bind(token.leader_id, hubId).first();
      requireValue(leader, 'A valid access code is required.', 401);
      if (Date.parse(leader.last_seen_at) < now - 86400000) await env.DB.prepare('UPDATE hub_leaders SET last_seen_at = ? WHERE id = ?').bind(nowIso(), leader.id).run();
    }
    return { token, hub, leader };
  }
  const owner = token => requireValue(token.role === 'owner', 'The owner link is required.', 403);
  const kind = ({ token, leader }) => token.role === 'leader' ? (leader.status === 'approved' ? 'r4' : 'waiting') : token.role;

  if (url.pathname === '/v1/hubs/access' && request.method === 'GET') {
    // A link carries only its code; the code's hash names the hub it opens.
    const row = await env.DB.prepare('SELECT t.hub_id, t.role, l.status FROM hub_tokens t JOIN hubs h ON h.id = t.hub_id LEFT JOIN hub_leaders l ON l.id = t.leader_id WHERE t.token_hash = ? AND h.expires_at > ?').bind(await digest(bearer(request)), nowIso()).first();
    requireValue(row, 'This link has expired, was replaced or was deleted.', 404);
    return json({ hubId: row.hub_id, access: row.role === 'leader' ? (row.status === 'approved' ? 'r4' : 'waiting') : row.role });
  }
  if (url.pathname === '/v1/hubs' && request.method === 'POST') {
    await limit(env.CREATE_LIMIT, ip);
    const input = await body(request, HUB_FIELDS, 'Hub');
    const name = text(input.name, 'name', 80, true), ownerName = text(input.ownerName, 'ownerName', 40, true);
    const id = crypto.randomUUID(), now = nowIso(), expiresAt = new Date(Date.now() + KEEP_MS).toISOString();
    const codes = { owner: secret(), invite: secret(), member: secret() };
    const tokens = await Promise.all(Object.entries(codes).map(async ([role, code]) => env.DB.prepare('INSERT INTO hub_tokens (token_hash, hub_id, role) VALUES (?, ?, ?)').bind(await digest(code), id, role)));
    await env.DB.batch([env.DB.prepare('INSERT INTO hubs (id, name, owner_name, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, name, ownerName, now, now, expiresAt), ...tokens]);
    return json({ hub: hubView(await env.DB.prepare('SELECT * FROM hubs WHERE id = ?').bind(id).first(), true), codes }, 201);
  }
  const match = url.pathname.match(/^\/v1\/hubs\/([^/]+)(?:\/(leaders|rotate|handover)(?:\/([^/]+?)(?:\/(approve))?)?)?$/);
  requireValue(match && UUID.test(match[1]) && (!match[3] || UUID.test(match[3])), 'Endpoint not found.', 404);
  const [, hubId, part, leaderId, step] = match;
  const state = await access(hubId), { token, hub } = state, isOwner = token.role === 'owner';

  if (!part) {
    if (request.method === 'GET') {
      const result = { hub: hubView(hub, isOwner), access: kind(state) };
      if (isOwner) result.leaders = (await env.DB.prepare('SELECT * FROM hub_leaders WHERE hub_id = ? ORDER BY created_at, rowid').bind(hubId).all()).results.map(row => leaderView(row, true));
      else if (kind(state) === 'r4') result.leaders = (await env.DB.prepare("SELECT * FROM hub_leaders WHERE hub_id = ? AND status = 'approved' ORDER BY created_at, rowid").bind(hubId).all()).results.map(row => leaderView(row, false));
      if (state.leader) result.me = { ...leaderView(state.leader, true) };
      return json(result);
    }
    if (request.method === 'PATCH') {
      owner(token);
      const input = await body(request, [...HUB_FIELDS, 'revision'], 'Hub');
      integer(input.revision, 'revision', 1, Number.MAX_SAFE_INTEGER);
      const name = 'name' in input ? text(input.name, 'name', 80, true) : hub.name, ownerName = 'ownerName' in input ? text(input.ownerName, 'ownerName', 40, true) : hub.owner_name;
      const result = await env.DB.prepare('UPDATE hubs SET name = ?, owner_name = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ? AND expires_at > ?').bind(name, ownerName, nowIso(), hubId, input.revision, nowIso()).run();
      requireValue(result.meta.changes === 1, 'This hub changed. Reload before saving.', 409);
      return json({ hub: hubView(await env.DB.prepare('SELECT * FROM hubs WHERE id = ?').bind(hubId).first(), true) });
    }
    if (request.method === 'DELETE') {
      owner(token);
      await env.DB.prepare('DELETE FROM hubs WHERE id = ?').bind(hubId).run();
      return new Response(null, { status: 204 });
    }
    throw new HttpError(405, 'Method not allowed.');
  }

  if (part === 'leaders' && !leaderId && request.method === 'POST') {
    // The shared R4 invite: a name is typed, a private code comes back, and the owner approves.
    requireValue(token.role === 'invite', 'The R4 invite link is required.', 403);
    await limit(env.CREATE_LIMIT, ip);
    const input = await body(request, ['name'], 'R4');
    const name = text(input.name, 'name', 40, true), id = crypto.randomUUID(), code = secret(), now = nowIso();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO hub_leaders (id, hub_id, name, status, created_at, last_seen_at) VALUES (?, ?, ?, 'waiting', ?, ?)").bind(id, hubId, name, now, now),
      env.DB.prepare("INSERT INTO hub_tokens (token_hash, hub_id, role, leader_id) VALUES (?, ?, 'leader', ?)").bind(await digest(code), hubId, id)
    ]);
    return json({ leader: { id, name, status: 'waiting' }, code }, 201);
  }
  if (part === 'leaders' && leaderId && step === 'approve' && request.method === 'POST') {
    owner(token);
    const result = await env.DB.prepare("UPDATE hub_leaders SET status = 'approved', approved_at = ? WHERE id = ? AND hub_id = ? AND status = 'waiting'").bind(nowIso(), leaderId, hubId).run();
    requireValue(result.meta.changes === 1, 'This R4 is not waiting for approval.', 404);
    return json({ leader: leaderView(await env.DB.prepare('SELECT * FROM hub_leaders WHERE id = ?').bind(leaderId).first(), true) });
  }
  if (part === 'leaders' && leaderId && !step && request.method === 'DELETE') {
    // The owner removes anyone; an R4 can leave on their own.
    requireValue(isOwner || (token.role === 'leader' && token.leader_id === leaderId), 'You cannot remove this R4.', 403);
    await env.DB.prepare('DELETE FROM hub_leaders WHERE id = ? AND hub_id = ?').bind(leaderId, hubId).run();
    return new Response(null, { status: 204 });
  }
  if (part === 'rotate' && !leaderId && request.method === 'POST') {
    owner(token);
    const input = await body(request, ['role'], 'Hub');
    requireValue(['invite', 'member'].includes(input.role), 'Only the invite and member links can be replaced.');
    const code = secret();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM hub_tokens WHERE hub_id = ? AND role = ?').bind(hubId, input.role),
      env.DB.prepare('INSERT INTO hub_tokens (token_hash, hub_id, role) VALUES (?, ?, ?)').bind(await digest(code), hubId, input.role)
    ]);
    return json({ role: input.role, code });
  }
  if (part === 'handover' && !leaderId && request.method === 'POST') {
    // A new owner link; the old one stops working.
    owner(token);
    await body(request, [], 'Hub');
    const code = secret();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM hub_tokens WHERE hub_id = ? AND role = 'owner'").bind(hubId),
      env.DB.prepare("INSERT INTO hub_tokens (token_hash, hub_id, role) VALUES (?, ?, 'owner')").bind(await digest(code), hubId)
    ]);
    return json({ role: 'owner', code });
  }
  throw new HttpError(405, 'Method not allowed.');
}
