// Alliance hubs. The R5 owns a hub, R4s join through one shared invite link and wait for the
// owner's approval, and members read through one member link. Codes work like the Vikings
// ones: random, stored only as hashes, sent in the Authorization header.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
import { STARTER_TASKS, STARTER_ROLES } from './hub-tasks.js';
import Cadence from '../../js/hub-engine.mjs';
const HUB_FIELDS = ['name', 'ownerName'];
const SECTIONS = ['rules', 'notes', 'times'];

function hubView(row, owner) {
  const view = { id: row.id, name: row.name, ownerName: row.owner_name };
  return owner ? { ...view, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at, expiresAt: row.expires_at } : view;
}

function sectionView(row) { return { body: row.body, revision: row.revision, editedBy: row.edited_by, editedAt: row.edited_at }; }

// The owner sees every R4 with their state; an approved R4 sees who else is approved.
function leaderView(row, owner) {
  const view = { id: row.id, name: row.name };
  return owner ? { ...view, status: row.status, createdAt: row.created_at, approvedAt: row.approved_at, lastSeenAt: row.last_seen_at } : view;
}

export async function hubRoute(request, env, url, ip, k) {
  const { HttpError, requireValue, text, integer, body, secret, digest, json, bearer, nowIso, KEEP_MS, limit } = k;

  const starterTasks = (hubId, now) => STARTER_TASKS.map(([name, pub, cadence], i) => env.DB.prepare('INSERT INTO hub_tasks (id, hub_id, name, is_public, position, created_at, cadence) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), hubId, name, Number(pub), i + 1, now, cadence ? JSON.stringify(cadence) : null));

  // The starter roles, over the starter tasks made just before them in the same batch.
  const starterRoles = (hubId, now) => STARTER_ROLES.flatMap(([name, tasks], i) => {
    const id = crypto.randomUUID();
    return [env.DB.prepare('INSERT INTO hub_roles (id, hub_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, hubId, name, i + 1, now),
      ...tasks.map(task => env.DB.prepare('INSERT INTO hub_role_tasks (role_id, task_id) SELECT ?, id FROM hub_tasks WHERE hub_id = ? AND name = ?').bind(id, hubId, task))];
  });

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

  // Messages to copy into game chat: written and kept by the owner and approved R4s.
  async function templatesRoute([, hubId, templateId]) {
    requireValue(UUID.test(hubId) && (!templateId || UUID.test(templateId)), 'Endpoint not found.', 404);
    const state = await access(hubId), { token, hub } = state;
    requireValue(token.role === 'owner' || kind(state) === 'r4', 'Only the owner and approved R4s can write messages.', 403);
    const by = token.role === 'owner' ? hub.owner_name : state.leader.name, now = nowIso();
    // A task is optional; when given it must be one of this hub's.
    const taskOf = async value => {
      if (value === null) return null;
      requireValue(typeof value === 'string' && UUID.test(value) && await env.DB.prepare('SELECT 1 AS ok FROM hub_tasks WHERE id = ? AND hub_id = ?').bind(value, hubId).first(), 'Choose one of this hub’s tasks.', 404);
      return value;
    };
    if (!templateId && request.method === 'POST') {
      const input = await body(request, ['title', 'body', 'taskId'], 'Message'), last = await env.DB.prepare('SELECT max(position) AS n FROM hub_templates WHERE hub_id = ?').bind(hubId).first(), id = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO hub_templates (id, hub_id, task_id, title, body, position, edited_by, edited_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, hubId, await taskOf(input.taskId ?? null), text(input.title, 'title', 60, true), text(input.body, 'body', 1000, true), (last.n || 0) + 1, by, now, now).run();
      return json({ id }, 201);
    }
    if (templateId) {
      const row = await env.DB.prepare('SELECT * FROM hub_templates WHERE id = ? AND hub_id = ?').bind(templateId, hubId).first();
      requireValue(row, 'Message not found.', 404);
      if (request.method === 'PUT') {
        const input = await body(request, ['title', 'body', 'taskId'], 'Message');
        await env.DB.prepare('UPDATE hub_templates SET title = ?, body = ?, task_id = ?, edited_by = ?, edited_at = ? WHERE id = ?').bind('title' in input ? text(input.title, 'title', 60, true) : row.title, 'body' in input ? text(input.body, 'body', 1000, true) : row.body, 'taskId' in input ? await taskOf(input.taskId) : row.task_id, by, now, templateId).run();
        return json({ ok: true });
      }
      if (request.method === 'DELETE') { await env.DB.prepare('DELETE FROM hub_templates WHERE id = ?').bind(templateId).run(); return new Response(null, { status: 204 }); }
    }
    throw new HttpError(405, 'Method not allowed.');
  }

  // Roles: named bundles of tasks. The owner shapes them; an owner or approved R4 enlists, which takes every task in the
  // role, and steps back, which drops them. A role has no holders of its own: whoever holds all its tasks covers it.
  async function rolesRoute([, hubId, roleId, segment, target]) {
    requireValue(UUID.test(hubId) && (!roleId || UUID.test(roleId)) && (!target || ['me', 'owner'].includes(target) || UUID.test(target)), 'Endpoint not found.', 404);
    const state = await access(hubId), { token } = state, isOwner = token.role === 'owner', leader = kind(state) === 'r4';
    const tasksOf = async value => {
      requireValue(Array.isArray(value) && value.length <= 40 && new Set(value).size === value.length && value.every(id => typeof id === 'string' && UUID.test(id)), 'Choose tasks from this hub.');
      for (const id of value) requireValue(await env.DB.prepare('SELECT 1 AS ok FROM hub_tasks WHERE id = ? AND hub_id = ?').bind(id, hubId).first(), 'Choose tasks from this hub.', 404);
      return value;
    };
    const link = (id, ids) => ids.map(task => env.DB.prepare('INSERT INTO hub_role_tasks (role_id, task_id) VALUES (?, ?)').bind(id, task));
    if (!roleId && request.method === 'POST') {
      owner(token);
      const input = await body(request, ['name', 'taskIds'], 'Role'), ids = await tasksOf(input.taskIds ?? []), last = await env.DB.prepare('SELECT max(position) AS n FROM hub_roles WHERE hub_id = ?').bind(hubId).first(), id = crypto.randomUUID();
      await env.DB.batch([env.DB.prepare('INSERT INTO hub_roles (id, hub_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, hubId, text(input.name, 'name', 40, true), (last.n || 0) + 1, nowIso()), ...link(id, ids)]);
      return json({ id }, 201);
    }
    requireValue(roleId, 'Endpoint not found.', 404);
    const role = await env.DB.prepare('SELECT * FROM hub_roles WHERE id = ? AND hub_id = ?').bind(roleId, hubId).first();
    requireValue(role, 'Role not found.', 404);
    if (!segment && request.method === 'PUT') {
      owner(token);
      const input = await body(request, ['name', 'taskIds'], 'Role'), ids = 'taskIds' in input ? await tasksOf(input.taskIds) : null;
      await env.DB.batch([env.DB.prepare('UPDATE hub_roles SET name = ? WHERE id = ?').bind('name' in input ? text(input.name, 'name', 40, true) : role.name, roleId), ...(ids ? [env.DB.prepare('DELETE FROM hub_role_tasks WHERE role_id = ?').bind(roleId), ...link(roleId, ids)] : [])]);
      return json({ ok: true });
    }
    if (!segment && request.method === 'DELETE') { owner(token); await env.DB.prepare('DELETE FROM hub_roles WHERE id = ?').bind(roleId).run(); return new Response(null, { status: 204 }); }
    if (segment === 'enlist' && ['PUT', 'DELETE'].includes(request.method)) {
      requireValue(isOwner || leader, 'Only the owner and approved R4s can take roles.', 403);
      const own = isOwner ? 'owner' : state.leader.id, holder = target === 'me' ? own : target;
      requireValue(isOwner || holder === own, 'You can only change your own roles.', 403);
      if (holder !== 'owner') requireValue(await env.DB.prepare("SELECT 1 AS ok FROM hub_leaders WHERE id = ? AND hub_id = ? AND status = 'approved'").bind(holder, hubId).first(), 'That R4 is not on this hub.', 404);
      const ids = (await env.DB.prepare('SELECT task_id FROM hub_role_tasks WHERE role_id = ?').bind(roleId).all()).results.map(r => r.task_id);
      await env.DB.batch(ids.map(task => request.method === 'PUT'
        ? env.DB.prepare("INSERT INTO hub_claims (task_id, holder, label, created_at) VALUES (?, ?, '', ?) ON CONFLICT (task_id, holder) DO NOTHING").bind(task, holder, nowIso())
        : env.DB.prepare('DELETE FROM hub_claims WHERE task_id = ? AND holder = ?').bind(task, holder)));
      return request.method === 'PUT' ? json({ ok: true }) : new Response(null, { status: 204 });
    }
    throw new HttpError(405, 'Method not allowed.');
  }

  // A cadence and a duty rule from a request body, checked: `cadence` null clears it, and a field left out stays as it was.
  function cadenceInput(input) {
    const out = {};
    if ('cadence' in input) { const problem = Cadence.validate(input.cadence); requireValue(problem === null, problem); out.cadence = input.cadence === null ? null : JSON.stringify(input.cadence); }
    if ('dutyRule' in input) { requireValue(['usual', 'claim'].includes(input.dutyRule), 'dutyRule must be usual or claim.'); out.dutyRule = input.dutyRule; }
    return out;
  }
  // Tasks and who holds them. The owner shapes the list and can put anyone on a task; an approved R4 takes
  // and drops their own claims.
  async function tasksRoute([, hubId, taskId, segment, target]) {
    requireValue(UUID.test(hubId) && (!taskId || taskId === 'template' || UUID.test(taskId)) && (!target || (segment === 'claims' ? ['me', 'owner'].includes(target) || UUID.test(target) : !Number.isNaN(Cadence.parse(target)))), 'Endpoint not found.', 404);
    const state = await access(hubId), { token, hub } = state, isOwner = token.role === 'owner', leader = kind(state) === 'r4';
    const find = async () => { const row = await env.DB.prepare('SELECT * FROM hub_tasks WHERE id = ? AND hub_id = ?').bind(taskId, hubId).first(); requireValue(row, 'Task not found.', 404); return row; };
    if (!taskId && request.method === 'POST') {
      owner(token);
      const input = await body(request, ['name', 'note', 'public', 'cadence', 'dutyRule'], 'Task'), plan = cadenceInput(input);
      requireValue(input.public === undefined || typeof input.public === 'boolean', 'public must be true or false.');
      const last = await env.DB.prepare('SELECT max(position) AS n FROM hub_tasks WHERE hub_id = ?').bind(hubId).first(), id = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO hub_tasks (id, hub_id, name, note, is_public, position, created_at, cadence, duty_rule) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, hubId, text(input.name, 'name', 60, true), text(input.note ?? '', 'note', 300), Number(input.public ?? false), (last.n || 0) + 1, nowIso(), plan.cadence ?? null, plan.dutyRule ?? 'usual').run();
      return json({ id }, 201);
    }
    if (taskId === 'template' && request.method === 'POST' && !segment) {
      owner(token);
      await body(request, [], 'Task');
      requireValue((await env.DB.prepare('SELECT count(*) AS n FROM hub_tasks WHERE hub_id = ?').bind(hubId).first()).n === 0, 'This hub already has tasks.', 409);
      await env.DB.batch([...starterTasks(hubId, nowIso()), ...starterRoles(hubId, nowIso())]);
      return json({ ok: true }, 201);
    }
    if (taskId && taskId !== 'template' && !segment && request.method === 'PATCH') {
      owner(token);
      const task = await find(), input = await body(request, ['name', 'note', 'public', 'cadence', 'dutyRule'], 'Task'), plan = cadenceInput(input);
      requireValue(input.public === undefined || typeof input.public === 'boolean', 'public must be true or false.');
      await env.DB.prepare('UPDATE hub_tasks SET name = ?, note = ?, is_public = ?, cadence = ?, duty_rule = ? WHERE id = ?').bind('name' in input ? text(input.name, 'name', 60, true) : task.name, 'note' in input ? text(input.note, 'note', 300) : task.note, 'public' in input ? Number(input.public) : task.is_public, 'cadence' in input ? plan.cadence : task.cadence, plan.dutyRule ?? task.duty_rule, taskId).run();
      return json({ ok: true });
    }
    if (taskId && taskId !== 'template' && !segment && request.method === 'DELETE') {
      owner(token); await find();
      await env.DB.prepare('DELETE FROM hub_tasks WHERE id = ?').bind(taskId).run();
      return new Response(null, { status: 204 });
    }
    if (taskId && taskId !== 'template' && segment === 'claims' && ['PUT', 'DELETE'].includes(request.method)) {
      requireValue(isOwner || leader, 'Only the owner and approved R4s can hold tasks.', 403);
      await find();
      const own = isOwner ? 'owner' : state.leader.id, holder = target === 'me' ? own : target;
      requireValue(isOwner || holder === own, 'You can only change your own claims.', 403);
      if (holder !== 'owner') requireValue(await env.DB.prepare("SELECT 1 AS ok FROM hub_leaders WHERE id = ? AND hub_id = ? AND status = 'approved'").bind(holder, hubId).first(), 'That R4 is not on this hub.', 404);
      if (request.method === 'DELETE') { await env.DB.prepare('DELETE FROM hub_claims WHERE task_id = ? AND holder = ?').bind(taskId, holder).run(); return new Response(null, { status: 204 }); }
      const input = await body(request, ['label'], 'Task'), label = text(input.label ?? '', 'label', 40);
      await env.DB.prepare('INSERT INTO hub_claims (task_id, holder, label, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (task_id, holder) DO UPDATE SET label = excluded.label').bind(taskId, holder, label, nowIso()).run();
      return json({ ok: true });
    }
    if (taskId && taskId !== 'template' && segment === 'duties' && request.method === 'PUT') {
      // Take a date, hand it on (the owner), put it back, or mark it done.
      requireValue(isOwner || leader, 'Only the owner and approved R4s can take dates.', 403);
      const task = await find(), input = await body(request, ['taker', 'done'], 'Task');
      requireValue(input.taker !== undefined || input.done !== undefined, 'Say who takes it, or whether it is done.');
      requireValue(input.done === undefined || typeof input.done === 'boolean', 'done must be true or false.');
      requireValue(Cadence.upcoming(task.cadence ? JSON.parse(task.cadence) : null, Date.now()).includes(target), 'That task is not due on that date.', 404);
      const own = isOwner ? 'owner' : state.leader.id, row = await env.DB.prepare('SELECT * FROM hub_duties WHERE task_id = ? AND date = ?').bind(taskId, target).first();
      let taker = row ? row.taker : null;
      if (input.taker !== undefined) {
        requireValue(typeof input.taker === 'string', 'taker must be me, none or an R4.');
        if (input.taker === 'me') taker = own;
        else if (input.taker === 'none') { requireValue(isOwner || !taker || taker === own, 'Only the owner can take a date from someone else.', 403); taker = null; }
        else {
          requireValue(isOwner, 'Only the owner can give a date to someone else.', 403);
          if (input.taker !== 'owner') requireValue(await env.DB.prepare("SELECT 1 AS ok FROM hub_leaders WHERE id = ? AND hub_id = ? AND status = 'approved'").bind(input.taker, hubId).first(), 'That R4 is not on this hub.', 404);
          taker = input.taker;
        }
      }
      const done = input.done === undefined ? Number(row ? row.done : 0) : Number(input.done);
      if (taker === null && !done) await env.DB.prepare('DELETE FROM hub_duties WHERE task_id = ? AND date = ?').bind(taskId, target).run();
      else await env.DB.prepare('INSERT INTO hub_duties (task_id, date, taker, done) VALUES (?, ?, ?, ?) ON CONFLICT (task_id, date) DO UPDATE SET taker = excluded.taker, done = excluded.done').bind(taskId, target, taker, done).run();
      return json({ ok: true });
    }
    throw new HttpError(405, 'Method not allowed.');
  }

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
    await env.DB.batch([env.DB.prepare('INSERT INTO hubs (id, name, owner_name, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, name, ownerName, now, now, expiresAt), ...tokens, ...starterTasks(id, now), ...starterRoles(id, now)]);
    return json({ hub: hubView(await env.DB.prepare('SELECT * FROM hubs WHERE id = ?').bind(id).first(), true), codes }, 201);
  }
  const roles = url.pathname.match(/^\/v1\/hubs\/([^/]+)\/roles(?:\/([^/]+)(?:\/(enlist)\/([^/]+))?)?$/);
  if (roles) return rolesRoute(roles);
  const templates = url.pathname.match(/^\/v1\/hubs\/([^/]+)\/templates(?:\/([^/]+))?$/);
  if (templates) return templatesRoute(templates);
  const tasks = url.pathname.match(/^\/v1\/hubs\/([^/]+)\/tasks(?:\/([^/]+)(?:\/(claims|duties)\/([^/]+))?)?$/);
  if (tasks) return tasksRoute(tasks);
  const match = url.pathname.match(/^\/v1\/hubs\/([^/]+)(?:\/(leaders|rotate|handover|sections)(?:\/([^/]+?)(?:\/(approve))?)?)?$/);
  requireValue(match && UUID.test(match[1]) && (!match[3] || match[2] === 'sections' || UUID.test(match[3])), 'Endpoint not found.', 404);
  const [, hubId, part, leaderId, step] = match;
  const state = await access(hubId), { token, hub } = state, isOwner = token.role === 'owner';

  if (!part) {
    if (request.method === 'GET') {
      const result = { hub: hubView(hub, isOwner), access: kind(state) };
      if (isOwner) result.leaders = (await env.DB.prepare('SELECT * FROM hub_leaders WHERE hub_id = ? ORDER BY created_at, rowid').bind(hubId).all()).results.map(row => leaderView(row, true));
      else if (kind(state) === 'r4') result.leaders = (await env.DB.prepare("SELECT * FROM hub_leaders WHERE hub_id = ? AND status = 'approved' ORDER BY created_at, rowid").bind(hubId).all()).results.map(row => leaderView(row, false));
      // The written pages are for everyone who has any link.
      const rows = (await env.DB.prepare('SELECT * FROM hub_sections WHERE hub_id = ?').bind(hubId).all()).results;
      result.sections = Object.fromEntries(SECTIONS.map(name => { const row = rows.find(r => r.section === name); return [name, row ? sectionView(row) : { body: '', revision: 0, editedBy: null, editedAt: null }]; }));
      // Leaders see every task and who holds it; everyone else sees the public tasks somebody holds.
      const leadership = isOwner || kind(state) === 'r4';
      const taskRows = (await env.DB.prepare('SELECT * FROM hub_tasks WHERE hub_id = ? ORDER BY position, rowid').bind(hubId).all()).results;
      const claimRows = (await env.DB.prepare('SELECT c.* FROM hub_claims c JOIN hub_tasks t ON t.id = c.task_id WHERE t.hub_id = ? ORDER BY c.created_at, c.rowid').bind(hubId).all()).results;
      const named = new Map((await env.DB.prepare('SELECT id, name FROM hub_leaders WHERE hub_id = ?').bind(hubId).all()).results.map(r => [r.id, r.name]));
      named.set('owner', hub.owner_name);
      result.tasks = taskRows.map(t => ({ id: t.id, name: t.name, note: t.note, public: Boolean(t.is_public), ...(leadership ? { cadence: t.cadence ? JSON.parse(t.cadence) : null, cadenceText: Cadence.describe(t.cadence ? JSON.parse(t.cadence) : null), dutyRule: t.duty_rule } : {}), holders: claimRows.filter(c => c.task_id === t.id && named.has(c.holder)).map(c => leadership ? { id: c.holder, name: named.get(c.holder), label: c.label } : { name: named.get(c.holder), label: c.label }) }))
        .filter(t => leadership || (t.public && t.holders.length));
      if (leadership) {
        // Dates are worked out here from each cadence; a stored row only says who took a date or that it is done.
        const dutyRows = (await env.DB.prepare('SELECT d.* FROM hub_duties d JOIN hub_tasks t ON t.id = d.task_id WHERE t.hub_id = ?').bind(hubId).all()).results, now = Date.now();
        result.duties = taskRows.flatMap(t => Cadence.upcoming(t.cadence ? JSON.parse(t.cadence) : null, now).map(date => {
          const row = dutyRows.find(d => d.task_id === t.id && d.date === date), holders = claimRows.filter(c => c.task_id === t.id && named.has(c.holder)).map(c => named.get(c.holder));
          const taker = row && row.taker && named.has(row.taker) ? { id: row.taker, name: named.get(row.taker) } : null;
          const owners = taker ? [taker.name] : t.duty_rule === 'usual' ? holders : [];
          return { taskId: t.id, task: t.name, date, taker, owners, unowned: !owners.length, done: Boolean(row && row.done) };
        })).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
      }
      if (leadership) {
        const links = (await env.DB.prepare('SELECT rt.* FROM hub_role_tasks rt JOIN hub_roles r ON r.id = rt.role_id WHERE r.hub_id = ?').bind(hubId).all()).results;
        result.roles = (await env.DB.prepare('SELECT * FROM hub_roles WHERE hub_id = ? ORDER BY position, rowid').bind(hubId).all()).results.map(r => ({ id: r.id, name: r.name, taskIds: taskRows.filter(t => links.some(l => l.role_id === r.id && l.task_id === t.id)).map(t => t.id) }));
      }
      if (leadership) result.templates = (await env.DB.prepare('SELECT * FROM hub_templates WHERE hub_id = ? ORDER BY position, rowid').bind(hubId).all()).results.map(t => ({ id: t.id, title: t.title, body: t.body, taskId: t.task_id, editedBy: t.edited_by, editedAt: t.edited_at }));
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
  if (part === 'sections' && leaderId && !step && request.method === 'PUT') {
    // The owner and approved R4s write the rules, notes and event times; the last name stays on the page.
    requireValue(SECTIONS.includes(leaderId), 'Endpoint not found.', 404);
    requireValue(isOwner || kind(state) === 'r4', 'Only the owner and approved R4s can edit this.', 403);
    const input = await body(request, ['body', 'revision'], 'Hub');
    integer(input.revision, 'revision', 0, Number.MAX_SAFE_INTEGER);
    const written = text(input.body, 'body', 4000), by = isOwner ? hub.owner_name : state.leader.name, now = nowIso();
    const result = input.revision === 0
      ? await env.DB.prepare('INSERT INTO hub_sections (hub_id, section, body, edited_by, edited_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (hub_id, section) DO NOTHING').bind(hubId, leaderId, written, by, now).run()
      : await env.DB.prepare('UPDATE hub_sections SET body = ?, revision = revision + 1, edited_by = ?, edited_at = ? WHERE hub_id = ? AND section = ? AND revision = ?').bind(written, by, now, hubId, leaderId, input.revision).run();
    requireValue(result.meta.changes === 1, 'Someone saved this first. Reload before saving.', 409);
    return json({ section: sectionView(await env.DB.prepare('SELECT * FROM hub_sections WHERE hub_id = ? AND section = ?').bind(hubId, leaderId).first()) });
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
