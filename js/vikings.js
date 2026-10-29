(function () {
  'use strict';
  var E = window.VikingsEngine;
  var ROOT = document.querySelector('[data-vikings-api]')?.dataset.vikingsApi || 'https://kingslop.reubeycw.workers.dev';
  var KEY = 'bh:vikings-local:v1', LINKS = 'bh:vikings-links:v1', SESSION = 'bh:vikings-session:v1', LAST = 'bh:vikings-last:v1', TIME = 'bh:vikings-time:v1';
  var TYPES = E.types, LABELS = { infantry: 'Infantry', cavalry: 'Cavalry', archers: 'Archers' };
  var SYMBOLS = { infantry: 'inf', cavalry: 'cav', archers: 'arc' }, ART = { infantry: 'barracks', cavalry: 'stable', archers: 'range' };
  // Short links name their role so a player can tell them apart in chat; the server decides the role from the code.
  var PREFIX = { manage: 'lead', join: 'join', view: 'view', registration: 'me' }, ROLES = { manage: 'Leader', join: 'Invitation', view: 'Viewing', registration: 'Player' };
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, CODE = /^(?:[A-Za-z0-9_-]{22}|[A-Za-z0-9_-]{43})$/, DAY = 86400000;
  function read(key, storage) { try { return JSON.parse((storage || localStorage).getItem(key)); } catch (_) { return null; } }
  function write(key, value, storage) { try { (storage || localStorage).setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } }
  function drop(key, storage) { try { (storage || localStorage).removeItem(key); } catch (_) {} }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function button(text, action, props, cls) { var n = el('button', cls || '', text); n.type = 'button'; n.dataset.action = 'vikings.' + action; Object.assign(n.dataset, props || {}); return n; }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function total(p) { return E.sum(p); }
  function id() { if (crypto.randomUUID) return crypto.randomUUID(); var b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128; var h = Array.from(b, function (n) { return n.toString(16).padStart(2, '0'); }).join(''); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20); }
  function localState(name) { return { plan: { id: id(), name: name || 'My Vikings plan', eventAt: null, difficulty: null, notes: '', closed: false }, roster: [], assignments: {}, hq: E.emptyHQ(), published: null, publicationRevision: 0, revision: 1, rosterRevision: 0, planRevision: 1, access: 'manage', local: true }; }
  function dayLabel(ms) { return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function utcDay(ms) { return Math.floor(ms / DAY) * DAY; }
  function until(ms) { var d = Math.round((utcDay(ms) - utcDay(Date.now())) / DAY); return d === 0 ? 'today' : d === 1 ? 'tomorrow' : d > 1 ? 'in ' + d + ' days' : d === -1 ? 'yesterday' : -d + ' days ago'; }
  function utcTime(ms) { return new Date(ms).toISOString().slice(11, 16); }
  function utcWhen(iso) { var t = Date.parse(iso); return dayLabel(t) + ' ' + utcTime(t) + ' UTC'; }
  function short(n) { return n >= 1e6 ? +(n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n); }
  function localWhen(iso) { return new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }

  window.Interactions.register('vikings', function (context) {
    var root = context.root, api = context.api, state = null, credential = null, selected = null, mode = 'my-plan', lastRefresh = null, busy = false, dialogDirty = false, timer = null, disposed = false, filter = '';
    function one(key) { return context.targets(key)[0]; }
    function fmt(n) { return api.fmt(n); }
    function say(message, error) { one('message').textContent = message; one('message').dataset.error = error ? 'true' : 'false'; if (one('dialog').open) one('dialogMessage').textContent = error ? message : ''; }
    function persist() {
      if (state && state.local && !state.example && !write(KEY, state)) say('This browser can’t save. Export the plan.', true);
      if (credential) write(SESSION, credential, sessionStorage);
    }
    function name(playerId, roster) { var p = (roster || (state && state.roster) || []).find(function (r) { return r.id === playerId; }); return p ? p.nickname : 'Player removed'; }
    function isManager() { return state && state.access === 'manage'; }
    function shareUrl(role, code) { return new URL('../vv/#' + PREFIX[role] + '-' + code, location.href).href; }

    /* Plans this device created or joined. Opening an invitation or viewing link never adds one. */
    function links() { var saved = read(LINKS); return Array.isArray(saved) ? saved.filter(function (r) { return r && UUID.test(r.planId) && CODE.test(r.code); }) : []; }
    function remember(c) {
      if (!c || !['manage', 'registration'].includes(c.role)) return false;
      var list = links().filter(function (r) { return r.planId !== c.planId || r.role !== c.role; });
      list.unshift({ planId: c.planId, code: c.code, role: c.role, codes: c.codes, name: state ? state.plan.name : c.name, eventAt: state ? state.plan.eventAt : c.eventAt });
      return write(LINKS, list.slice(0, 20));
    }
    function forget(planId) { write(LINKS, links().filter(function (r) { return r.planId !== planId; })); }
    function ownFor(planId) { return links().find(function (r) { return r.planId === planId; }); }

    async function copy(value, done) {
      try { await navigator.clipboard.writeText(value); say(done || 'Copied.'); }
      catch (_) { modal('Copy this text', function (body) { var area = el('textarea', 'vv-link'); area.value = value; area.readOnly = true; area.rows = 5; body.appendChild(area); area.select(); }); }
    }
    async function request(path, method, data, token) {
      var controller = new AbortController(), timeout = setTimeout(function () { controller.abort(); }, 20000);
      try {
        var response = await fetch(ROOT + path, { method: method || 'GET', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal, headers: Object.assign({}, token || (credential && credential.code) ? { Authorization: 'Bearer ' + (token || credential.code) } : {}, data ? { 'Content-Type': 'application/json' } : {}), body: data ? JSON.stringify(data) : undefined });
        var result = response.status === 204 ? null : await response.json();
        if (!response.ok) { var error = new Error((result && result.error) || 'The service could not save this change.'); error.status = response.status; throw error; }
        return result;
      } catch (cause) { if (cause.name === 'AbortError') throw new Error('Timed out. Refresh to check whether it saved.'); throw cause; }
      finally { clearTimeout(timeout); }
    }
    async function run(fn) {
      if (busy) return;
      busy = true; root.setAttribute('aria-busy', 'true'); root.querySelectorAll('[data-mutation]').forEach(function (n) { n.disabled = true; });
      try { await fn(); }
      catch (cause) { say(cause.status === 409 ? cause.message + ' Your open editor has been kept.' : cause.message || 'The service is unavailable. Your last loaded plan is still here.', true); }
      finally { busy = false; root.removeAttribute('aria-busy'); root.querySelectorAll('[data-mutation]').forEach(function (n) { n.disabled = false; }); }
    }
    async function load(quiet) {
      var planId = credential.planId;
      var data = await request('/v1/plans/' + planId), board = await request('/v1/plans/' + planId + '/board');
      if (disposed || credential.planId !== planId) return;
      state = { plan: board.plan || data.plan, roster: board.roster || data.registrations, access: data.access, registrationId: data.registrationId, local: false, ...board };
      credential.role = data.access;
      if (state.registrationId) selected = state.registrationId;
      lastRefresh = new Date(); persist(); render();
      if (!quiet) say('Plan refreshed.');
    }
    // Open a link or a remembered plan. A link to a plan this device already leads or joined opens that instead.
    async function open(c, fromLink) {
      if (!c.planId) { var found = await request('/v1/access', 'GET', null, c.code); c = { planId: found.planId, code: c.code, role: found.access }; }
      var own = ['join', 'view'].includes(c.role) ? ownFor(c.planId) : null;
      credential = own ? Object.assign({}, own) : c; selected = null; filter = '';
      try { await load(true); }
      catch (cause) {
        if (cause.status === 401 || cause.status === 404) { if (!fromLink) forget(c.planId); credential = null; state = null; drop(SESSION, sessionStorage); render(); throw new Error(fromLink ? 'This link no longer works. Ask your leader for a new one.' : 'That plan has ended.'); }
        throw cause;
      }
      if (remember(credential)) write(LAST, credential.planId);
      say('');
      mode = state.access === 'manage' ? 'alliance-plan' : 'my-plan';
      render();
      if (own) say('Opened your ' + (own.role === 'manage' ? 'leader' : 'player') + ' view of this plan.');
    }
    function tab(next) {
      mode = next;
      root.querySelectorAll('[role=tab]').forEach(function (n) { n.setAttribute('aria-selected', String(n.dataset.tab === next)); });
      ['my-plan', 'alliance-plan', 'vikings-guide'].forEach(function (key) { document.getElementById(key).hidden = key !== next; });
    }
    function modal(title, build) {
      var dialog = one('dialog'), body = one('dialogBody'); body.replaceChildren(); document.getElementById('vv-dialog-title').textContent = title; dialogDirty = false; one('dialogMessage').textContent = '';
      build(body); if (!dialog.open) dialog.showModal();
    }
    function close() { one('dialog').close(); dialogDirty = false; }
    function form(body, kind) { var n = el('form'); n.dataset.action = 'vikings.submit'; n.dataset.kind = kind; body.appendChild(n); return n; }
    function field(container, title, key, value, type, options) {
      var label = el('label', '', title), input;
      if (type === 'select') { input = el('select'); (options || []).forEach(function (o) { var opt = el('option', '', o[1]); opt.value = o[0]; input.appendChild(opt); }); }
      else input = el(type === 'textarea' ? 'textarea' : 'input');
      if (input.tagName === 'INPUT') input.type = type || 'text';
      input.name = key; input.value = value == null ? '' : String(value);
      if (type === 'number') { input.min = '0'; input.max = '100000000'; input.step = '1'; input.inputMode = 'numeric'; }
      label.appendChild(input); container.appendChild(label); return input;
    }
    function submit(form, title) { var b = el('button', 'vv-primary', title); b.type = 'submit'; b.dataset.mutation = ''; form.appendChild(b); return b; }
    function symbol(k) { var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), use = document.createElementNS(svg.namespaceURI, 'use'); svg.setAttribute('class', 'vv-symbol'); svg.setAttribute('aria-hidden', 'true'); use.setAttribute('href', '#troop-' + SYMBOLS[k]); svg.appendChild(use); return svg; }
    function counts(p) {
      var row = el('div', 'vv-counts');
      TYPES.forEach(function (k) { var span = el('span'); span.appendChild(symbol(k)); span.appendChild(document.createTextNode(' ' + fmt(p[k] || 0))); span.setAttribute('aria-label', fmt(p[k] || 0) + ' ' + LABELS[k]); row.appendChild(span); });
      return row;
    }
    function art(kind, size) { var img = el('img'); img.src = '../img/buildings/' + kind + '.webp'; img.alt = ''; img.width = img.height = size || 64; img.loading = 'lazy'; return img; }
    function hqMark() { var n = el('span', 'vv-hq-mark', 'HQ'); n.setAttribute('aria-hidden', 'true'); return n; }
    function marchRow(row, destination, container, note) {
      var n = el('div', 'vv-march'); n.appendChild(el('span', 'vv-queue', row.queue)); n.appendChild(row.destination === 'hq' ? hqMark() : art('town-center', 48));
      var info = el('div', 'vv-march-main'), head = el('div', 'vv-march-head'); head.appendChild(el('strong', '', destination)); head.appendChild(el('span', 'vv-total', fmt(total(row)))); info.appendChild(head); info.appendChild(counts(row));
      if (note) info.appendChild(el('p', 'vv-caption', note));
      n.appendChild(info); container.appendChild(n); return n;
    }
    function expected() { return { revision: state.revision, rosterRevision: state.rosterRevision, planRevision: state.planRevision }; }
    function playerFields(form, p) {
      var grid = el('div', 'vv-form-grid'); form.appendChild(grid);
      var nickname = field(grid, 'In-game name', 'nickname', p.nickname || ''); nickname.required = true; nickname.maxLength = 40; nickname.autocomplete = 'nickname';
      field(grid, 'Expect to be', 'availability', p.availability || 'unknown', 'select', [['unknown', 'Unsure'], ['online', 'Online'], ['offline', 'Offline']]);
      var troops = el('div', 'vv-troop-inputs'); form.appendChild(troops);
      TYPES.forEach(function (k) { var input = field(troops, LABELS[k], k, p[k], 'number'); input.required = true; input.placeholder = 'Not entered'; input.parentElement.prepend(art(ART[k], 56)); });
      grid = el('div', 'vv-form-grid'); form.appendChild(grid);
      var cap = field(grid, 'March capacity', 'marchCapacity', p.marchCapacity, 'number'); cap.max = '10000000'; cap.required = true;
      var q = field(grid, 'Queues', 'marches', p.marches || 5, 'number'); q.min = '1'; q.max = '6'; q.required = true;
      var more = el('details', 'vv-more'); more.appendChild(el('summary', '', 'More')); var extra = el('div', 'vv-form-grid'); more.appendChild(extra); form.appendChild(more);
      if (p.notes || (p.capacities && p.capacities.length)) more.open = true;
      var notes = field(extra, 'Notes (optional)', 'notes', p.notes || '', 'textarea'); notes.maxLength = 300; notes.parentElement.classList.add('vv-wide');
      var caps = field(extra, 'Capacity per march, e.g. 120000, 110000', 'capacities', (p.capacities || []).join(', ')); caps.parentElement.classList.add('vv-wide');
      var foot = el('div', 'vv-actions'); foot.appendChild(button('Use my saved troop counts', 'savedTroops')); form.appendChild(foot);
    }
    function fromForm(form) {
      var data = Object.fromEntries(new FormData(form));
      ['infantry', 'cavalry', 'archers', 'marchCapacity', 'marches'].forEach(function (k) { data[k] = Number(data[k]); });
      data.capacities = data.capacities.trim() ? data.capacities.split(',').map(function (n) { return Number(n.trim()); }) : null;
      if (data.capacities && (data.capacities.length !== data.marches || data.capacities.some(function (n) { return !Number.isInteger(n) || n < 0 || n > 10000000; }))) throw new Error('Enter one valid capacity for every queue.');
      return data;
    }
    function playerEditor(playerId) {
      var p = playerId ? state.roster.find(function (r) { return r.id === playerId; }) : { nickname: '', infantry: null, cavalry: null, archers: null, marchCapacity: null, marches: 5 };
      if (!p) return;
      modal(playerId ? 'Edit ' + p.nickname : 'Add a player', function (body) {
        var f = form(body, 'player'); f.dataset.id = playerId || ''; playerFields(f, p); submit(f, 'Save player');
        if (playerId && isManager()) f.appendChild(button('Remove this registration', 'removePlayer', { id: playerId }, 'vv-danger'));
      });
    }
    function eventEditor() {
      modal(state ? 'Event settings' : 'New plan', function (body) {
        var f = form(body, 'event'), p = state ? state.plan : {}, days = E.eventDays(Date.now(), 4), at = p.eventAt ? Date.parse(p.eventAt) : null;
        var chosen = at !== null ? new Date(at).toISOString().slice(0, 10) : new Date(days[0]).toISOString().slice(0, 10);
        var fieldset = el('fieldset', 'vv-days'); fieldset.appendChild(el('legend', '', 'Event day'));
        var options = days.map(function (d) { return new Date(d).toISOString().slice(0, 10); });
        if (!options.includes(chosen)) options.unshift(chosen);
        options.forEach(function (day) { var label = el('label', 'vv-chip'), radio = el('input'); radio.type = 'radio'; radio.name = 'day'; radio.value = day; radio.checked = day === chosen; radio.required = true; label.append(radio, el('span', '', dayLabel(Date.parse(day + 'T00:00:00Z')))); fieldset.appendChild(label); });
        f.appendChild(fieldset);
        var grid = el('div', 'vv-form-grid'); f.appendChild(grid);
        var time = field(grid, 'Start time (UTC)', 'time', at !== null ? utcTime(at) : read(TIME) || '', 'time'); time.required = true;
        var local = el('p', 'vv-caption vv-local-time vv-wide'); local.dataset.target = 'vikings.localTime'; grid.appendChild(local);
        var n = field(grid, 'Plan name', 'name', p.name || ''); n.maxLength = 80; n.placeholder = 'Vikings'; n.parentElement.classList.add('vv-wide');
        var more = el('details', 'vv-more'); more.appendChild(el('summary', '', 'More')); var extra = el('div', 'vv-form-grid'); more.appendChild(extra); f.appendChild(more);
        var d = field(extra, 'Difficulty (optional)', 'difficulty', p.difficulty, 'number'); d.min = '1'; d.max = '100';
        if (state) field(extra, 'Sign-ups', 'closed', p.closed ? 'true' : 'false', 'select', [['false', 'Open'], ['true', 'Locked']]);
        var notes = field(extra, 'Notes for the alliance', 'notes', p.notes || '', 'textarea'); notes.maxLength = 2000; notes.parentElement.classList.add('vv-wide');
        submit(f, state ? 'Save event' : 'Create plan');
        localTime(f);
      });
    }
    function localTime(f) {
      var out = f.querySelector('.vv-local-time'), day = f.elements.day && (f.querySelector('[name=day]:checked') || {}).value, time = f.elements.time && f.elements.time.value;
      if (!out) return;
      out.textContent = day && time ? localWhen(day + 'T' + time + ':00Z') + ' your time' : '';
    }
    function assignmentEditor(playerId) {
      var p = state.roster.find(function (r) { return r.id === playerId; }); if (!p) return;
      modal(p.nickname, function (body) {
        var top = el('div', 'vv-editor-top'); top.appendChild(counts(p)); top.appendChild(button('Edit', 'editPlayer', { id: p.id }, 'vv-quiet')); body.appendChild(top);
        var check = E.validate(state.roster, state.assignments, state.hq), incoming = check.incoming[p.id] || [];
        var cover = el('div', 'vv-cover-in'); cover.appendChild(el('span', 'vv-label', 'Covered by'));
        if (!incoming.length) cover.appendChild(el('span', 'vv-dim', 'nobody yet'));
        incoming.forEach(function (r) { cover.appendChild(button(name(r.playerId) + ' ' + fmt(r.troops), 'assign', { id: r.playerId }, 'vv-quiet')); });
        body.appendChild(cover);
        var f = form(body, 'assignments'); f.dataset.id = p.id;
        var rows = state.assignments[p.id] || E.split(p).rows, hq = E.hqRows(state.hq).find(function (r) { return r.playerId === p.id; });
        var grid = el('div', 'vv-sends'), head = el('div', 'vv-sends-head'); head.appendChild(el('span')); head.appendChild(el('span', '', 'Sends to')); TYPES.forEach(function (k) { var c = el('span'); c.appendChild(symbol(k)); c.setAttribute('aria-label', LABELS[k]); head.appendChild(c); }); grid.appendChild(head);
        var targets = [['', '—']].concat(state.roster.filter(function (r) { return r.id !== p.id; }).map(function (r) { return [r.id, r.nickname]; }));
        for (var q = 1; q <= p.marches; q++) {
          var row = rows.find(function (r) { return r.queue === q; }) || { queue: q, destination: null, infantry: 0, cavalry: 0, archers: 0 };
          var box = el('div', 'vv-send'); box.dataset.queue = q;
          var tag = el('span', 'vv-send-q'); tag.appendChild(el('strong', '', String(q))); tag.appendChild(el('small', '', hq && hq.queue === q ? 'HQ' : short(E.capacity(p, q)))); box.appendChild(tag);
          var select = el('select'); select.name = 'destination-' + q; select.setAttribute('aria-label', 'March ' + q + ' destination'); targets.forEach(function (o) { var opt = el('option', '', o[1]); opt.value = o[0]; select.appendChild(opt); }); select.value = row.destination || ''; box.appendChild(select);
          TYPES.forEach(function (k) { var input = el('input'); input.type = 'number'; input.name = k + '-' + q; input.min = '0'; input.max = '100000000'; input.step = '1'; input.inputMode = 'numeric'; input.required = true; input.value = row[k]; input.setAttribute('aria-label', 'March ' + q + ' ' + LABELS[k]); box.appendChild(input); });
          grid.appendChild(box);
        }
        f.appendChild(grid);
        var foot = el('div', 'vv-actions'); submit(foot, 'Save'); foot.appendChild(button('Even split', 'fillMarches', { id: p.id })); f.appendChild(foot);
      });
    }
    function hqEditor() {
      modal('HQ · waves 10 and 20', function (body) {
        var f = form(body, 'hq'), grid = el('div', 'vv-form-grid'); f.appendChild(grid);
        var cap = field(grid, 'HQ capacity', 'capacity', state.hq.capacity, 'number'); cap.required = true; cap.parentElement.classList.add('vv-wide');
        var inf = field(grid, 'Infantry %', 'infantryPercent', state.hq.infantryPercent, 'number'); inf.max = '100'; inf.required = true;
        var cav = field(grid, 'Cavalry %', 'cavalryPercent', state.hq.cavalryPercent, 'number'); cav.max = '100'; cav.required = true;
        f.appendChild(el('p', 'vv-label', 'Who sends, and which march'));
        state.roster.forEach(function (p) {
          var entry = state.hq.participants.find(function (e) { return e.playerId === p.id; }), row = el('div', 'vv-hq-pick'), label = el('label'), check = el('input');
          check.type = 'checkbox'; check.name = 'participant'; check.value = p.id; check.checked = !!entry; label.append(check, el('span', '', p.nickname)); row.appendChild(label);
          var queues = Array.from({ length: p.marches }, function (_, i) { return [String(i + 1), 'March ' + (i + 1)]; }); var s = field(row, '', 'queue-' + p.id, entry ? entry.queue : 1, 'select', queues); s.setAttribute('aria-label', p.nickname + ' HQ march'); f.appendChild(row);
        });
        submit(f, 'Save HQ plan');
      });
    }
    function snapshot() { return state.local ? { plan: state.plan, roster: state.roster, assignments: state.assignments, hq: state.hq } : state.published; }
    function pending() { return isManager() && (!state.published || state.published.sourceRevision !== state.revision || state.published.rosterRevision !== state.rosterRevision || state.published.planRevision !== state.planRevision); }

    function next() {
      var line = one('next'); line.replaceChildren(); line.hidden = !!(state && state.plan.eventAt);
      if (line.hidden) return;
      // Tuesday and Thursday of one fortnight are alternatives; a later fortnight is the one after.
      var days = E.eventDays(Date.now(), 2), pair = days[1] - days[0] <= 2 * DAY;
      line.appendChild(el('span', 'vv-label', 'Next Vikings'));
      line.appendChild(el('strong', '', pair ? dayLabel(days[0]) + ' or ' + dayLabel(days[1]) : dayLabel(days[0])));
      line.appendChild(el('span', 'vv-dim', until(days[0]) + (pair ? '' : ' · then ' + dayLabel(days[1]))));
    }
    function bar() {
      var event = one('event'); event.replaceChildren(); event.hidden = !state; if (!state) return;
      var head = el('div', 'vv-bar-head'), tag = el('p', 'vv-label', state.example ? 'Example' : state.local ? 'Leader · draft' : ROLES[state.access] + (state.access === 'registration' ? ' · ' + name(state.registrationId) : ''));
      var text = el('div'); text.appendChild(tag); text.appendChild(el('h2', '', state.plan.name)); head.appendChild(text);
      head.appendChild(button('Switch plan', 'leave', {}, 'vv-quiet')); event.appendChild(head);
      var when = el('p', 'vv-when');
      if (state.plan.eventAt) { var t = Date.parse(state.plan.eventAt); when.appendChild(el('strong', '', localWhen(state.plan.eventAt))); when.appendChild(el('span', 'vv-dim', utcTime(t) + ' UTC · ' + until(t))); }
      else { var d = E.eventDays(Date.now(), 1)[0]; when.appendChild(el('strong', '', 'No start time')); when.appendChild(el('span', 'vv-dim', 'next window ' + dayLabel(d))); if (isManager()) when.appendChild(button('Set time', 'settings', {}, 'vv-inline')); }
      event.appendChild(when);
      var status = el('p', 'vv-status'), parts = [];
      parts.push(state.publicationRevision ? 'Published v' + state.publicationRevision : state.local ? 'Not shared yet' : 'Not published');
      if (state.plan.closed) parts.push('sign-ups locked');
      if (lastRefresh) parts.push('checked ' + lastRefresh.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
      status.textContent = parts.join(' · ');
      if (pending() && state.publicationRevision) status.appendChild(el('strong', 'vv-flag', 'Changes waiting to publish'));
      event.appendChild(status);
      if (state.plan.notes) event.appendChild(el('p', 'vv-notes', state.plan.notes));
    }
    function joinForm(body) {
      body.appendChild(el('h2', '', 'Sign up'));
      if (state.plan.closed) { body.appendChild(el('p', 'vv-flag', 'Sign-ups are closed. Ask your leader to add you.')); return; }
      var f = form(body, 'player'); f.dataset.id = ''; playerFields(f, { nickname: '', infantry: null, cavalry: null, archers: null, marchCapacity: null, marches: 5 }); submit(f, 'Join this event');
    }
    function picker(body, view) {
      body.appendChild(el('h2', '', 'Whose marches?'));
      if (view.roster.length > 8) { var search = el('input', 'vv-search'); search.type = 'search'; search.placeholder = 'Find a player'; search.value = filter; search.setAttribute('aria-label', 'Find a player'); search.dataset.action = 'vikings.filter'; body.appendChild(search); }
      var grid = el('div', 'vv-pick'); grid.dataset.target = 'vikings.pickList'; body.appendChild(grid); pickList(grid, view);
    }
    function pickList(grid, view) {
      grid.replaceChildren();
      view.roster.filter(function (p) { return !filter || p.nickname.toLowerCase().includes(filter.toLowerCase()); }).forEach(function (p) { var b = button('', 'selectPlayer', { id: p.id }, 'vv-pick-item'); b.appendChild(el('strong', '', p.nickname)); b.appendChild(el('span', 'vv-dim', fmt(total(p)))); grid.appendChild(b); });
    }
    function personal() {
      var body = one('personal'); body.replaceChildren();
      one('start').hidden = !!state; one('calculator').hidden = !!state;
      if (!state) return;
      if (state.access === 'join') { joinForm(body); return; }
      var view = snapshot(), me = state.registrationId;
      if (!view || !view.roster.length) {
        body.appendChild(el('h2', '', me ? 'You’re signed up' : 'No marches yet'));
        body.appendChild(el('p', 'vv-lede', isManager() ? (state.roster.length ? 'Set marches in Alliance, then publish.' : 'Invite or add players in Alliance.') : 'Marches appear here once your leader publishes.'));
        if (me) { var mine = state.roster.find(function (r) { return r.id === me; }); if (mine) { body.appendChild(counts(mine)); var a = el('div', 'vv-actions'); a.appendChild(button('Edit my details', 'editPlayer', { id: me })); a.appendChild(button('Copy my link', 'copyPrivate')); body.appendChild(a); } }
        if (isManager()) body.appendChild(button(state.roster.length ? 'Open Alliance' : 'Add players', 'tab', { tab: 'alliance-plan' }, 'vv-primary'));
        return;
      }
      if (!view.roster.some(function (r) { return r.id === selected; })) selected = null;
      if (!selected) { picker(body, view); return; }
      var p = view.roster.find(function (r) { return r.id === selected; });
      var head = el('div', 'vv-heading'); head.appendChild(el('h2', '', selected === me ? 'Your marches' : p.nickname + '’s marches'));
      if (!me) head.appendChild(button('Another player', 'choosePlayer', {}, 'vv-quiet')); body.appendChild(head);
      var rows = (view.assignments[p.id] || []).filter(function (r) { return r.destination && total(r); });
      var used = { infantry: 0, cavalry: 0, archers: 0 }; rows.forEach(function (r) { TYPES.forEach(function (k) { used[k] += r[k]; }); });
      var home = {}; TYPES.forEach(function (k) { home[k] = Math.max(0, p[k] - used[k]); });
      body.appendChild(el('p', 'vv-lede', rows.length ? fmt(total(used)) + ' troops out in ' + rows.length + (rows.length === 1 ? ' march' : ' marches') + (total(home) ? ' · ' + fmt(total(home)) + ' stay home' : ' · none stay home') : 'No city marches assigned yet.'));
      var list = el('div', 'vv-marches'); rows.forEach(function (r) { marchRow(r, name(r.destination, view.roster), list); }); body.appendChild(list);
      if (total(home) && rows.length) { var stay = el('div', 'vv-home'); stay.appendChild(el('span', 'vv-label', 'Stays home')); stay.appendChild(counts(home)); body.appendChild(stay); }
      var headquarters = E.hqRows(view.hq || E.emptyHQ()).find(function (r) { return r.playerId === p.id; });
      if (headquarters) {
        var hq = el('div', 'vv-hq'); hq.appendChild(el('p', 'vv-label', 'HQ · waves 10 & 20'));
        marchRow({ queue: headquarters.queue, destination: 'hq', infantry: headquarters.infantry, cavalry: headquarters.cavalry, archers: headquarters.archers }, 'Alliance HQ', hq, 'After wave 9 and 19: recall march ' + headquarters.queue + ', send this, return it after the hit.');
        body.appendChild(hq);
      }
      var actions = el('div', 'vv-actions'); actions.appendChild(button('Copy for game chat', 'copyInstructions', {}, 'vv-primary'));
      if (me) { actions.appendChild(button('Edit my details', 'editPlayer', { id: me })); actions.appendChild(button('Copy my link', 'copyPrivate')); }
      body.appendChild(actions);
      var section = el('div', 'vv-section'); section.appendChild(el('h3', '', 'Covering your city'));
      var cover = []; Object.keys(view.assignments).forEach(function (sender) { (view.assignments[sender] || []).forEach(function (r) { if (r.destination === p.id && total(r)) cover.push([name(sender, view.roster), total(r)]); }); });
      if (!cover.length) section.appendChild(el('p', 'vv-caption', 'Nobody yet.'));
      else { var ul = el('ul', 'vv-cover'); cover.forEach(function (c) { var li = el('li'); li.appendChild(el('span', '', c[0])); li.appendChild(el('span', 'vv-total', fmt(c[1]))); ul.appendChild(li); }); section.appendChild(ul); }
      body.appendChild(section);
      var checks = el('div', 'vv-section'); checks.appendChild(el('h3', '', 'Before the first wave'));
      var checkKey = 'bh:vikings-prep:' + state.plan.id + ':' + p.id, checked = read(checkKey) || {};
      ['Guard station set', 'City marches sent', 'Incoming cover agreed', 'HQ instructions checked'].forEach(function (label, i) { var n = el('label', 'vv-check'), input = el('input'); input.type = 'checkbox'; input.checked = !!checked[i]; input.dataset.action = 'vikings.checklist'; input.dataset.key = checkKey; input.dataset.index = i; n.append(input, document.createTextNode(label)); checks.appendChild(n); }); body.appendChild(checks);
    }
    function playerRow(p, view, check, manage) {
      var assignments = view.assignments || {}, sent = (assignments[p.id] || []).filter(function (r) { return r.destination && total(r); }).length, incoming = check ? check.incoming[p.id] : [];
      if (!check) Object.keys(assignments).forEach(function (s) { (assignments[s] || []).forEach(function (r) { if (r.destination === p.id && total(r)) incoming.push(r); }); });
      var b = button('', manage ? 'assign' : 'selectPlayer', { id: p.id }, 'vv-row'); b.appendChild(art('town-center', 44));
      var main = el('span', 'vv-row-main'), top = el('span', 'vv-row-top'); top.appendChild(el('strong', '', p.nickname)); top.appendChild(el('span', 'vv-avail', p.availability === 'unknown' ? 'Unsure' : p.availability === 'online' ? 'Online' : 'Offline')); main.appendChild(top);
      main.appendChild(el('span', 'vv-dim', fmt(total(p)) + ' troops · sends ' + sent + '/' + p.marches + ' · ' + incoming.length + ' covering'));
      if (manage) { var gaps = []; if (!incoming.length) gaps.push('No cover'); if (sent < p.marches) gaps.push(p.marches - sent + ' free ' + (p.marches - sent === 1 ? 'queue' : 'queues')); if (!p.marchCapacity && !(p.capacities || []).some(Boolean)) gaps.push('No capacity'); if (gaps.length) main.appendChild(el('span', 'vv-gap', gaps.join(' · '))); }
      b.appendChild(main); b.appendChild(el('span', 'vv-chevron', '›')); return b;
    }
    function tally(container, items) { var dl = el('dl', 'vv-tally'); items.forEach(function (i) { var d = el('div'); d.appendChild(el('dt', '', i[0])); d.appendChild(el('dd', i[2] ? 'vv-short' : '', i[1])); dl.appendChild(d); }); container.appendChild(dl); }
    function alliance() {
      var body = one('alliance'); body.replaceChildren();
      if (!state) { body.appendChild(el('p', 'vv-lede', 'No plan open.')); body.appendChild(button('Create an alliance plan', 'create', {}, 'vv-primary')); return; }
      if (!isManager()) {
        var view = state.published;
        if (!view) { body.appendChild(el('p', 'vv-lede', 'Not published yet.')); return; }
        body.appendChild(el('h2', '', 'Cities')); var list = el('div', 'vv-rows'); view.roster.forEach(function (p) { list.appendChild(playerRow(p, view, null, false)); }); body.appendChild(list); return;
      }
      var check = E.validate(state.roster, state.assignments, state.hq), queues = state.roster.reduce(function (n, p) { return n + p.marches; }, 0);
      var sent = state.roster.reduce(function (n, p) { return n + (state.assignments[p.id] || []).filter(function (r) { return r.destination && total(r); }).length; }, 0);
      var covered = state.roster.filter(function (p) { return check.incoming[p.id].length; }).length;
      tally(body, [['Players', String(state.roster.length)], ['Marches set', sent + '/' + queues, sent < queues], ['Cities covered', covered + '/' + state.roster.length, covered < state.roster.length], ['HQ', state.hq.participants.length ? state.hq.participants.length + '/15' : '—', !state.hq.participants.length]]);
      var actions = el('div', 'vv-actions vv-lead');
      var publish = button(state.publicationRevision ? 'Publish changes' : 'Publish marches', 'publish', {}, 'vv-primary'); publish.disabled = !!check.errors.length || !state.roster.length || (state.publicationRevision && !pending()); actions.appendChild(publish);
      if (state.local) { if (!state.example) actions.appendChild(button('Invite players', 'enable', {}, 'vv-secondary')); }
      else actions.appendChild(button('Invite & share links', 'share', {}, 'vv-secondary'));
      body.appendChild(actions);
      if (check.errors.length) { var errs = el('ul', 'vv-problems'); check.errors.forEach(function (m) { errs.appendChild(el('li', '', m)); }); body.appendChild(errs); }
      var h = el('div', 'vv-heading'); h.appendChild(el('h2', '', 'Cities')); h.appendChild(button('Add a player', 'addPlayer', {}, 'vv-quiet')); body.appendChild(h);
      if (!state.roster.length) body.appendChild(el('p', 'vv-caption', state.local ? 'No players yet.' : 'No sign-ups yet.'));
      var rows = el('div', 'vv-rows'); state.roster.forEach(function (p) { rows.appendChild(playerRow(p, state, check, true)); }); body.appendChild(rows);
      var hq = el('div', 'vv-section vv-hq-section'), hqHead = el('div', 'vv-hq-head'); hqHead.appendChild(hqMark()); var hqText = el('div'); hqText.appendChild(el('h3', '', 'HQ · waves 10 & 20'));
      hqText.appendChild(el('p', 'vv-dim', state.hq.participants.length ? state.hq.participants.length + ' players · ' + fmt(state.hq.capacity) + ' troops · ' + state.hq.infantryPercent + '/' + state.hq.cavalryPercent + '/' + (100 - state.hq.infantryPercent - state.hq.cavalryPercent) : 'No HQ transfer arranged')); hqHead.appendChild(hqText); hq.appendChild(hqHead);
      if (state.roster.length) hq.appendChild(button(state.hq.participants.length ? 'Change HQ plan' : 'Arrange HQ', 'hq', {}, 'vv-quiet')); body.appendChild(hq);
      if (check.warnings.length) { var gaps = el('details', 'vv-gaps'); gaps.id = 'plan-gaps'; gaps.appendChild(el('summary', '', check.warnings.length + (check.warnings.length === 1 ? ' gap' : ' gaps') + ' to review')); var ul = el('ul', 'vv-problems'); check.warnings.forEach(function (m) { ul.appendChild(el('li', '', m)); }); gaps.appendChild(ul); body.appendChild(gaps); }
      var tools = el('details', 'vv-tools'); tools.id = 'plan-tools'; tools.appendChild(el('summary', '', 'Plan tools')); var t = el('div', 'vv-actions');
      t.appendChild(button('Event settings', 'settings')); t.appendChild(button('Export plan', 'export')); if (state.local) t.appendChild(button('Import a plan file', 'import')); if (!state.local) t.appendChild(button('Refresh', 'refresh'));
      if (!state.local) t.appendChild(button('Delete shared plan', 'deletePlan', {}, 'vv-danger')); else if (!state.example) t.appendChild(button('Discard this draft', 'discard', {}, 'vv-danger'));
      tools.appendChild(t); body.appendChild(tools);
    }
    function remembered() {
      var body = one('remembered'); body.replaceChildren(); if (state) return;
      var saved = links(), local = read(KEY);
      if (!saved.length && !(local && local.local)) return;
      body.appendChild(el('h2', '', 'Your plans'));
      var list = el('div', 'vv-rows');
      saved.forEach(function (p, i) {
        var b = button('', 'restore', { index: i }, 'vv-row'); var main = el('span', 'vv-row-main'), top = el('span', 'vv-row-top'); top.appendChild(el('strong', '', p.name || 'Vikings plan')); top.appendChild(el('span', 'vv-avail', ROLES[p.role])); main.appendChild(top);
        main.appendChild(el('span', 'vv-dim', p.eventAt ? localWhen(p.eventAt) + ' · ' + until(Date.parse(p.eventAt)) : 'No start time')); b.appendChild(main); b.appendChild(el('span', 'vv-chevron', '›')); list.appendChild(b);
      });
      if (local && local.local) { var b = button('', 'openLocal', {}, 'vv-row'), main = el('span', 'vv-row-main'), top = el('span', 'vv-row-top'); top.appendChild(el('strong', '', local.plan.name)); top.appendChild(el('span', 'vv-avail', 'Draft')); main.appendChild(top); main.appendChild(el('span', 'vv-dim', local.roster.length + ' players · only on this device')); b.appendChild(main); b.appendChild(el('span', 'vv-chevron', '›')); list.appendChild(b); }
      body.appendChild(list);
      if (saved.length) body.appendChild(button('Forget these', 'forget', {}, 'vv-quiet'));
    }
    function render() {
      root.classList.toggle('vv-active', !!state);
      next(); bar(); personal(); alliance(); remembered(); tab(mode);
    }
    function shareText(role, code) {
      var url = shareUrl(role, code), when = state.plan.eventAt ? utcWhen(state.plan.eventAt) : '';
      if (role === 'join') return 'Vikings' + (when ? ' ' + when : '') + ': sign up for city cover here ' + url;
      if (role === 'view') return 'Vikings' + (when ? ' ' + when : '') + ' marches are up. Find your name: ' + url;
      return url;
    }
    function share() {
      modal('Links', function (body) {
        var codes = (credential && credential.codes) || {};
        [['join', 'Sign-up', 'for alliance chat'], ['view', 'Marches', 'after you publish'], ['manage', 'Leader', 'keep private']].forEach(function (row) {
          var role = row[0], code = role === 'manage' ? credential.code : codes[role];
          var line = el('div', 'vv-share'), text = el('div'); text.appendChild(el('strong', '', row[1])); text.appendChild(el('span', 'vv-dim', row[2])); line.appendChild(text);
          var a = el('div', 'vv-share-actions');
          if (code) { a.appendChild(button('Copy', 'copy', { value: shareText(role, code) }, role === 'join' ? 'vv-primary' : 'vv-secondary')); if (role !== 'manage') a.appendChild(button('Replace', 'rotate', { role: role }, 'vv-quiet')); }
          else a.appendChild(button('New link', 'rotate', { role: role }, 'vv-secondary'));
          line.appendChild(a); body.appendChild(line);
        });
      });
    }
    function exportFile() {
      var data = state.local ? state : { ...state, access: 'manage', local: true };
      data = { ...data }; delete data.registrationId;
      var blob = new Blob([JSON.stringify({ format: 'kingslop-vikings', version: 1, state: data }, null, 2)], { type: 'application/json' });
      var a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'vikings-plan.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      say('Exported.');
    }
    async function enable() {
      var created = await request('/v1/plans', 'POST', { name: state.plan.name, eventAt: state.plan.eventAt, difficulty: state.plan.difficulty, notes: state.plan.notes, closed: false });
      var local = clone(state), map = {};
      credential = { planId: created.plan.id, code: created.codes.manage, codes: created.codes, role: 'manage' }; write(SESSION, credential, sessionStorage);
      state = { plan: created.plan, roster: [], assignments: {}, hq: E.emptyHQ(), access: 'manage', local: false };
      if (!remember(credential)) say('This browser can’t save. Copy your leader link.', true); else write(LAST, credential.planId);
      try {
        for (var p of local.roster) {
          var payload = { ...p }; ['id', 'revision', 'createdAt', 'updatedAt'].forEach(function (k) { delete payload[k]; });
          var registration = await request('/v1/plans/' + credential.planId + '/registrations', 'POST', payload);
          map[p.id] = registration.registration.id;
        }
        await load(true);
        for (var oldId of Object.keys(local.assignments)) {
          var marches = local.assignments[oldId].map(function (r) { return { ...r, destination: r.destination ? map[r.destination] : null }; });
          await request('/v1/plans/' + credential.planId + '/assignments/' + map[oldId], 'PUT', { ...expected(), marches: marches }); await load(true);
        }
        if (local.hq.participants.length) { var hq = { ...local.hq, participants: local.hq.participants.map(function (p) { return { playerId: map[p.playerId], queue: p.queue }; }) }; await request('/v1/plans/' + credential.planId + '/hq', 'PUT', { ...expected(), hq: hq }); await load(true); }
        mode = 'alliance-plan'; render(); share(); say('Sign-ups are open. Post the sign-up link in alliance chat.');
      } catch (cause) { await load(true).catch(function () {}); share(); throw new Error('The shared plan was created, but some draft details were not copied. Keep its leader link and review the roster. Your local backup remains available. ' + cause.message); }
    }
    async function submitForm(f) {
      if (!f.reportValidity()) return;
      var kind = f.dataset.kind, data;
      if (kind === 'event') {
        var raw = Object.fromEntries(new FormData(f)), eventAt = new Date(raw.day + 'T' + raw.time + ':00Z').toISOString();
        data = { name: raw.name.trim() || 'Vikings', eventAt: eventAt, difficulty: raw.difficulty ? Number(raw.difficulty) : null, notes: raw.notes || '' };
        if (state) data.closed = raw.closed === 'true';
        write(TIME, raw.time);
        if (!state) { state = localState(data.name); Object.assign(state.plan, data); write(LAST, 'local'); mode = 'alliance-plan'; }
        else if (state.local) { Object.assign(state.plan, data); state.planRevision++; }
        else { await request('/v1/plans/' + state.plan.id, 'PATCH', { ...data, closed: data.closed, revision: state.plan.revision }); await load(true); remember(credential); }
        persist(); close(); render(); say('Event saved.');
      } else if (kind === 'player') {
        data = fromForm(f); var playerId = f.dataset.id, previous = state.roster.find(function (p) { return p.id === playerId; });
        if (state.local) {
          if (!previous && state.roster.length >= 120) throw new Error('A plan can hold at most 120 players.');
          if (previous) Object.assign(previous, data, { revision: (previous.revision || 1) + 1 }); else state.roster.push({ ...data, id: id(), revision: 1 }); state.rosterRevision++;
        } else {
          var response = await request('/v1/plans/' + state.plan.id + '/registrations' + (playerId ? '/' + playerId : ''), playerId ? 'PUT' : 'POST', { ...data, ...(previous ? { revision: previous.revision } : {}) });
          if (state.access === 'join') {
            credential = { planId: state.plan.id, code: response.editCode, role: 'registration' };
            await load(true);
            var kept = remember(credential); if (kept) write(LAST, credential.planId);
            close(); mode = 'my-plan'; render();
            modal('Signed up', function (body) {
              body.appendChild(el('p', '', kept ? 'This page opens your plan next time. On another device, use your link.' : 'Copy your link to come back to your plan.'));
              var a = el('div', 'vv-actions'); a.appendChild(button('Copy my link', 'copyPrivate', {}, 'vv-primary')); if (kept) a.appendChild(button('Don’t remember', 'forgetThis', {}, 'vv-quiet')); body.appendChild(a);
            });
            persist(); return;
          }
          await load(true);
        }
        persist(); close(); render(); say('Player saved.');
      } else if (kind === 'assignments') {
        var rows = [];
        f.querySelectorAll('[data-queue]').forEach(function (box) { var queue = Number(box.dataset.queue), row = { queue: queue, destination: f.elements['destination-' + queue].value || null }; TYPES.forEach(function (k) { row[k] = Number(f.elements[k + '-' + queue].value); }); rows.push(row); });
        var assignments = { ...state.assignments, [f.dataset.id]: rows }, check = E.validate(state.roster, { [f.dataset.id]: rows }, E.emptyHQ()); if (check.errors.length) throw new Error(check.errors[0]);
        if (state.local) { state.assignments = assignments; state.revision++; }
        else { await request('/v1/plans/' + state.plan.id + '/assignments/' + f.dataset.id, 'PUT', { ...expected(), marches: rows }); await load(true); }
        persist(); close(); render(); say('Saved.');
      } else if (kind === 'hq') {
        data = new FormData(f); var hq = { capacity: Number(data.get('capacity')), infantryPercent: Number(data.get('infantryPercent')), cavalryPercent: Number(data.get('cavalryPercent')), participants: data.getAll('participant').map(function (pid) { return { playerId: pid, queue: Number(data.get('queue-' + pid)) }; }) };
        if (hq.infantryPercent + hq.cavalryPercent > 100 || hq.participants.length > 15) throw new Error('Use a ratio up to 100% and at most 15 participants.');
        if (state.local) { state.hq = hq; state.revision++; } else { await request('/v1/plans/' + state.plan.id + '/hq', 'PUT', { ...expected(), hq: hq }); await load(true); }
        persist(); close(); render(); say('HQ saved.');
      } else if (kind === 'open') {
        var c = parseLink(f.elements.link.value); if (!c) throw new Error('Paste the whole link, starting with https.');
        close(); await open(c, true);
      }
    }
    function parseLink(value) {
      var text = String(value || '').trim(), short = /#(?:lead|join|view|me)-([A-Za-z0-9_-]{22}|[A-Za-z0-9_-]{43})\s*$/.exec(text), long = /#access=([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})\s*$/.exec(text);
      if (short) return { planId: null, code: short[1] };
      if (long && UUID.test(long[1])) return { planId: long[1], code: long[2] };
      return null;
    }
    async function savedTroops() {
      var troops; try { troops = context.ledger.combat().troops; } catch (_) { throw new Error('Your player save could not be read. Enter the counts manually.'); }
      var totals = { infantry: null, cavalry: null, archers: null }, map = { inf: 'infantry', cav: 'cavalry', arc: 'archers' };
      troops.forEach(function (p) { if (map[p.type] && Number.isFinite(p.amount)) totals[map[p.type]] = (totals[map[p.type]] || 0) + p.amount; });
      if (TYPES.every(function (k) { return totals[k] === null; })) throw new Error('There are no confirmed troop counts in your save yet.');
      var f = one('dialog').open ? one('dialogBody').querySelector('form') : one('personal').querySelector('form') || one('calculatorForm');
      TYPES.forEach(function (k) { if (f.elements[k]) f.elements[k].value = totals[k] === null ? '' : totals[k]; });
      say('Filled in from your saved troops.');
    }
    function demo() {
      lastRefresh = null; var day = E.eventDays(Date.now(), 1)[0]; state = localState('Vikings'); state.example = true; state.plan.eventAt = new Date(day + 20 * 3600000).toISOString();
      ['Rowan', 'Ash', 'Fern', 'Willow'].forEach(function (nickname, i) { state.roster.push({ id: id(), nickname: nickname, availability: i === 3 ? 'offline' : 'online', infantry: 240000, cavalry: 160000, archers: 120000, marchCapacity: 180000, marches: 3, capacities: null, notes: '', revision: 1 }); });
      state.roster.forEach(function (p, i) { state.assignments[p.id] = E.split(p).rows.map(function (r, q) { return { ...r, destination: state.roster[(i + q + 1) % 4].id }; }); });
      state.hq = { capacity: 300000, infantryPercent: 75, cavalryPercent: 25, participants: state.roster.slice(0, 3).map(function (p) { return { playerId: p.id, queue: 1 }; }) };
      selected = state.roster[0].id; credential = null; mode = 'my-plan'; render(); say('Example plan. Nothing is saved.');
    }
    function waves() {
      var body = one('waves');
      for (var w = 1; w <= 20; w++) { var kind = [10, 20].includes(w) ? 'hq' : [7, 14, 17].includes(w) ? 'online' : 'city'; var b = button(String(w), 'wave', { wave: w, kind: kind }); b.setAttribute('aria-pressed', w === 1 ? 'true' : 'false'); b.appendChild(el('small', '', kind === 'online' ? 'On' : kind === 'hq' ? 'HQ' : 'City')); body.appendChild(b); }
    }
    function home() { say(''); state = null; credential = null; selected = null; lastRefresh = null; drop(SESSION, sessionStorage); close(); mode = 'my-plan'; render(); }
    context.listen(one('dialog'), 'input', function (event) { dialogDirty = true; var f = event.target.form; if (f && f.dataset.kind === 'event') localTime(f); });
    context.listen(one('dialog'), 'change', function (event) { var f = event.target.form; if (f && f.dataset.kind === 'event') localTime(f); });
    context.listen(one('dialog'), 'close', function () { dialogDirty = false; });
    context.listen(root, 'keydown', function (event) { var tabs = Array.from(root.querySelectorAll('[role=tab]')), at = tabs.indexOf(event.target); if (at < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); var next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (at + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; tabs[next].click(); tabs[next].focus(); });
    function schedule(delay) {
      clearTimeout(timer); timer = setTimeout(function () {
        if (disposed) return;
        if (!credential || !state || state.local || document.hidden || one('dialog').open || busy || root.querySelector('#my-plan form:focus-within')) return schedule(30000);
        run(async function () { try { var status = await request('/v1/plans/' + state.plan.id + '/status'); var signature = [state.plan.revision, state.plan.rosterRevision || 0, state.publicationRevision || 0, isManager() ? state.revision : 0].join(':'); if (status.signature !== signature) await load(true); else { lastRefresh = new Date(); bar(); } schedule(30000); } catch (cause) { say('Offline. Showing the last copy.', true); schedule(90000); } });
      }, delay);
    }
    context.cleanup(function () { disposed = true; clearTimeout(timer); });
    function action(fn, events) { return { events: events || ['click'], run: function (node, event) { return run(function () { return fn(node, event); }); } }; }
    var actions = {
      tab: { run: function (node) { tab(node.dataset.tab); } },
      calculate: { events: ['submit'], preventDefault: true, run: function (f) { return run(function () {
        if (!f.reportValidity()) return; var p = Object.fromEntries(new FormData(f)); Object.keys(p).forEach(function (k) { p[k] = Number(p[k]); });
        var result = E.split(p), answer = one('split'); answer.replaceChildren(); answer.appendChild(el('p', 'vv-lede', fmt(result.total) + ' troops out in ' + result.rows.length + ' marches' + (total(result.home) ? ' · ' + fmt(total(result.home)) + ' stay home' : '')));
        var list = el('div', 'vv-marches'); result.rows.forEach(function (r) { marchRow(r, 'March ' + r.queue, list); }); answer.appendChild(list);
        if (total(result.home)) { var stay = el('div', 'vv-home'); stay.appendChild(el('span', 'vv-label', 'Stays home')); stay.appendChild(counts(result.home)); answer.appendChild(stay); }
      }); } },
      submit: { events: ['submit'], preventDefault: true, run: function (f) { return run(function () { return submitForm(f); }); } },
      closeDialog: { run: function () { close(); } },
      create: action(function () { if (state) throw new Error('Switch plan before creating another.'); eventEditor(); }),
      settings: action(eventEditor),
      demo: action(demo),
      open: action(function () { modal('Open a plan link', function (body) { var f = form(body, 'open'); var input = field(f, 'Link from your leader', 'link', '', 'url'); input.required = true; input.placeholder = 'https://dey.ci/vv/#join-…'; submit(f, 'Open plan'); }); }),
      addPlayer: action(function () { playerEditor(null); }),
      editPlayer: action(function (node) { playerEditor(node.dataset.id); }),
      assign: action(function (node) { assignmentEditor(node.dataset.id); }),
      hq: action(hqEditor),
      fillMarches: action(function (node) { var p = state.roster.find(function (p) { return p.id === node.dataset.id; }), f = one('dialogBody').querySelector('form'); E.split(p).rows.forEach(function (r) { TYPES.forEach(function (k) { f.elements[k + '-' + r.queue].value = r[k]; }); }); dialogDirty = true; }),
      selectPlayer: { run: function (node) { selected = node.dataset.id; personal(); tab('my-plan'); } },
      choosePlayer: { run: function () { selected = null; personal(); } },
      filter: { events: ['input'], run: function (node) { filter = node.value; var view = snapshot(); if (view) pickList(one('pickList'), view); } },
      savedTroops: action(savedTroops),
      enable: action(enable), share: action(share),
      copy: action(function (node) { return copy(node.dataset.value, 'Copied.'); }),
      copyPrivate: action(function () { return copy(shareUrl('registration', credential.code), 'Copied. Keep it to yourself.'); }),
      copyInstructions: action(function () { return copy(E.instructions(snapshot(), selected), 'Your marches are copied.'); }),
      forgetThis: action(function () { forget(credential.planId); drop(LAST); close(); say('Forgotten on this device.'); }),
      restore: action(async function (node) { var c = links()[Number(node.dataset.index)]; if (!c) throw new Error('This saved plan is no longer available.'); await open(Object.assign({}, c), false); }),
      openLocal: action(function () { var local = read(KEY); if (!local || !local.local) throw new Error('The local draft is no longer on this device.'); state = local; credential = null; write(LAST, 'local'); mode = 'alliance-plan'; render(); }),
      forget: action(function () { drop(LINKS); drop(LAST); remembered(); say('Forgotten.'); }),
      rotate: action(function (node) { var role = node.dataset.role; modal('Replace the ' + (role === 'join' ? 'sign-up' : 'marches') + ' link?', function (body) { body.appendChild(el('p', '', 'The old link stops working.')); body.appendChild(button('Replace link now', 'confirmRotate', { role: role }, 'vv-primary')); }); }),
      confirmRotate: action(async function (node) { var result = await request('/v1/plans/' + state.plan.id + '/rotate', 'POST', { role: node.dataset.role }); credential.codes = credential.codes || {}; credential.codes[result.role] = result.code; remember(credential); persist(); share(); }),
      publish: action(function () { var check = E.validate(state.roster, state.assignments, state.hq); if (check.errors.length) throw new Error(check.errors[0]); modal('Publish?', function (body) { if (check.warnings.length) { body.appendChild(el('p', 'vv-label', 'Still open')); var list = el('ul', 'vv-problems'); check.warnings.forEach(function (warning) { list.appendChild(el('li', '', warning)); }); body.appendChild(list); } body.appendChild(button(check.warnings.length ? 'Publish with these gaps' : 'Publish', 'confirmPublish', {}, 'vv-primary')); }); }),
      confirmPublish: action(async function () {
        var check = E.validate(state.roster, state.assignments, state.hq); if (check.errors.length) throw new Error(check.errors[0]);
        if (state.local) { state.published = { plan: clone(state.plan), roster: clone(state.roster), assignments: clone(state.assignments), hq: clone(state.hq), sourceRevision: state.revision, rosterRevision: state.rosterRevision, planRevision: state.planRevision }; state.publicationRevision++; }
        else { await request('/v1/plans/' + state.plan.id + '/publish', 'POST', expected()); await load(true); }
        persist(); close(); render(); say('Published.');
      }),
      removePlayer: action(function (node) { modal('Remove ' + name(node.dataset.id) + '?', function (body) { body.appendChild(el('p', '', 'Their marches and link go too.')); body.appendChild(button('Remove player', 'confirmRemove', { id: node.dataset.id }, 'vv-danger')); }); }),
      confirmRemove: action(async function (node) { if (state.local) { state.roster = state.roster.filter(function (p) { return p.id !== node.dataset.id; }); delete state.assignments[node.dataset.id]; state.rosterRevision++; state.revision++; } else { await request('/v1/plans/' + state.plan.id + '/registrations/' + node.dataset.id, 'DELETE'); await load(true); } persist(); close(); render(); }),
      deletePlan: action(function () { modal('Delete this shared plan?', function (body) { body.appendChild(el('p', '', 'Removes it for everyone.')); body.appendChild(button('Delete for everyone', 'confirmDelete', {}, 'vv-danger')); }); }),
      confirmDelete: action(async function () { await request('/v1/plans/' + state.plan.id, 'DELETE'); forget(state.plan.id); drop(LAST); home(); say('Shared plan deleted.'); }),
      discard: action(function () { modal('Discard this draft?', function (body) { body.appendChild(el('p', '', 'It only exists on this device.')); body.appendChild(button('Discard draft', 'confirmDiscard', {}, 'vv-danger')); }); }),
      confirmDiscard: action(function () { drop(KEY); drop(LAST); home(); say('Draft discarded.'); }),
      refresh: action(async function () { if (state.local) { render(); return; } await load(); }),
      export: action(exportFile),
      import: action(function () { if (!state.local) throw new Error('Switch to a local draft before importing.'); modal('Import a plan file', function (body) { var input = el('input'); input.type = 'file'; input.accept = '.json,application/json'; input.dataset.action = 'vikings.importFile'; body.appendChild(input); body.appendChild(el('p', 'vv-caption', 'Replaces this draft.')); }); }),
      importFile: action(async function (input) {
        var file = input.files[0]; if (!file || file.size > 300000) throw new Error('Choose a Vikings JSON export under 300 KB.');
        var data = JSON.parse(await file.text()); if (data.format !== 'kingslop-vikings' || data.version !== 1 || !data.state || !Array.isArray(data.state.roster) || data.state.roster.length > 120) throw new Error('This is not a supported Vikings export.');
        var value = data.state; if (!value.plan || !UUID.test(value.plan.id) || typeof value.plan.name !== 'string' || !value.assignments || !value.hq || !Array.isArray(value.hq.participants)) throw new Error('Invalid plan data.');
        value.roster.forEach(function (p) { if (!UUID.test(p.id) || typeof p.nickname !== 'string' || ![...TYPES, 'marchCapacity', 'marches'].every(function (k) { return Number.isInteger(p[k]) && p[k] >= 0 && p[k] <= 100000000; }) || p.marches < 1 || p.marches > 6) throw new Error('Invalid player in this export.'); });
        var check = E.validate(value.roster, value.assignments, value.hq); if (check.errors.length) throw new Error(check.errors[0]);
        state = { ...localState(), plan: value.plan, roster: value.roster, assignments: value.assignments, hq: value.hq }; credential = null; selected = null; write(LAST, 'local'); persist(); close(); render(); say('Plan file imported.');
      }, ['change']),
      // Leaving shows this device's plans; it forgets nothing. The next visit opens the plan list until one is chosen.
      leave: action(function () { write(LAST, 'none'); home(); }),
      checklist: { events: ['change'], run: function (node) { var data = read(node.dataset.key) || {}; data[node.dataset.index] = node.checked; write(node.dataset.key, data); } },
      wave: { run: function (node) { one('waves').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === node)); }); one('waveDetail').textContent = node.dataset.kind === 'hq' ? 'HQ wave ' + node.dataset.wave + ': send the agreed share after the preceding city wave resolves. Return to city cover after the HQ hit.' : node.dataset.kind === 'online' ? 'Wave ' + node.dataset.wave + ': online cities only. Check the in-game Members tab and follow any agreed cover rotations.' : 'Wave ' + node.dataset.wave + ': city reinforcements stay in their assigned towns. Check cover before the hit.'; } }
    };
    one('calculatorForm').querySelector('[type=submit]').disabled = false;
    waves();
    /* Which plan to open: a link just followed, this tab's last plan, then the plan this device last led or joined. */
    var initial = window.VikingsAccess || read(SESSION, sessionStorage), last = read(LAST), saved = links();
    var mine = last === 'none' || last === 'local' ? null : saved.find(function (r) { return r.planId === last; }) || (last === null ? saved[0] : null);
    render();
    if (initial && CODE.test(initial.code) && (initial.planId === null || UUID.test(initial.planId))) run(function () { return open(Object.assign({}, initial), !!initial.fromLink); });
    else if (mine) run(function () { say('Opening ' + (mine.name || 'your plan') + '…'); return open(Object.assign({}, mine), false); });
    else {
      var local = last === 'none' ? null : read(KEY); if (local && local.local && Array.isArray(local.roster)) { state = local; mode = 'alliance-plan'; }
      render();
    }
    schedule(30000);
    return { actions: actions, refresh: function () { if (!one('dialog').open) render(); } };
  });
})();
