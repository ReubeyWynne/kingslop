(function () {
  'use strict';
  var E = window.VikingsEngine;
  var ROOT = document.querySelector('[data-vikings-api]')?.dataset.vikingsApi || 'https://kingslop.reubeycw.workers.dev';
  var KEY = 'bh:vikings-local:v1', LINKS = 'bh:vikings-links:v1', SESSION = 'bh:vikings-session:v1';
  var TYPES = E.types, LABELS = { infantry: 'Infantry', cavalry: 'Cavalry', archers: 'Archers' };
  var SYMBOLS = { infantry: 'inf', cavalry: 'cav', archers: 'arc' };
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  function read(key, storage) { try { return JSON.parse((storage || localStorage).getItem(key)); } catch (_) { return null; } }
  function write(key, value, storage) { try { (storage || localStorage).setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function button(text, action, props) { var n = el('button', '', text); n.type = 'button'; n.dataset.action = 'vikings.' + action; Object.assign(n.dataset, props || {}); return n; }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function total(p) { return E.sum(p); }
  function id() { if (crypto.randomUUID) return crypto.randomUUID(); var b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128; var h = Array.from(b, function (n) { return n.toString(16).padStart(2, '0'); }).join(''); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20); }
  function localState(name) { return { plan: { id: id(), name: name || 'My Vikings plan', eventAt: null, difficulty: null, notes: '', closed: false }, roster: [], assignments: {}, hq: E.emptyHQ(), published: null, publicationRevision: 0, revision: 1, rosterRevision: 0, planRevision: 1, access: 'manage', local: true }; }

  window.Interactions.register('vikings', function (context) {
    var root = context.root, api = context.api, state = null, credential = null, selected = null, mode = 'my-plan', lastRefresh = null, busy = false, dialogDirty = false, timer = null, disposed = false;
    function one(key) { return context.targets(key)[0]; }
    function fmt(n) { return api.fmt(n); }
    function say(message, error) { one('message').textContent = message; one('message').dataset.error = error ? 'true' : 'false'; if (one('dialog').open) one('dialogMessage').textContent = error ? message : ''; }
    function persist() {
      if (state && state.local && !state.example && !write(KEY, state)) say('Storage is unavailable. Export this plan before leaving.', true);
      if (credential) write(SESSION, credential, sessionStorage);
    }
    function name(playerId, roster) { var p = (roster || (state && state.roster) || []).find(function (r) { return r.id === playerId; }); return p ? p.nickname : 'Player removed'; }
    function isManager() { return state && state.access === 'manage'; }
    function link(code) { var u = new URL(location.pathname, location.origin); u.hash = 'access=' + state.plan.id + '.' + code; return u.href; }
    async function copy(value) {
      try { await navigator.clipboard.writeText(value); say('Copied.'); }
      catch (_) { modal('Copy this text', function (body) { var area = el('textarea', 'vv-link'); area.value = value; area.readOnly = true; area.rows = 5; body.appendChild(area); area.select(); }); }
    }
    async function request(path, method, data, token) {
      var controller = new AbortController(), timeout = setTimeout(function () { controller.abort(); }, 20000);
      try {
        var response = await fetch(ROOT + path, { method: method || 'GET', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal, headers: Object.assign({}, token || (credential && credential.code) ? { Authorization: 'Bearer ' + (token || credential.code) } : {}, data ? { 'Content-Type': 'application/json' } : {}), body: data ? JSON.stringify(data) : undefined });
        var result = response.status === 204 ? null : await response.json();
        if (!response.ok) { var error = new Error((result && result.error) || 'The service could not save this change.'); error.status = response.status; throw error; }
        return result;
      } catch (cause) { if (cause.name === 'AbortError') throw new Error('The request timed out. Refresh before trying again to check whether it was saved.'); throw cause; }
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
      if (state.registrationId) selected = state.registrationId;
      lastRefresh = new Date(); persist(); render();
      if (!quiet) say('Plan refreshed.');
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
    function submit(form, title) { var b = el('button', 'vv-primary', title); b.type = 'submit'; b.dataset.mutation = ''; form.appendChild(b); }
    function counts(p) {
      var row = el('div', 'vv-counts');
      TYPES.forEach(function (k) { var span = el('span'); span.appendChild(symbol(k)); span.appendChild(document.createTextNode(' ' + fmt(p[k] || 0))); span.setAttribute('aria-label', fmt(p[k] || 0) + ' ' + LABELS[k]); row.appendChild(span); });
      return row;
    }
    function symbol(k) { var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), use = document.createElementNS(svg.namespaceURI, 'use'); svg.setAttribute('class', 'vv-symbol'); svg.setAttribute('aria-hidden', 'true'); use.setAttribute('href', '#troop-' + SYMBOLS[k]); svg.appendChild(use); return svg; }
    function art(kind, size) { var img = el('img'); img.src = '../img/buildings/' + kind + '.webp'; img.alt = ''; img.width = img.height = size || 64; img.loading = 'lazy'; return img; }
    function marchRow(row, destination, container) {
      var n = el('div', 'vv-march'); n.appendChild(el('span', 'vv-queue', row.queue)); n.appendChild(art('town-center', 48)); var info = el('div'); info.appendChild(el('strong', '', destination)); info.appendChild(counts(row)); n.appendChild(info); container.appendChild(n);
    }
    function expected() { return { revision: state.revision, rosterRevision: state.rosterRevision, planRevision: state.planRevision }; }
    function playerFields(form, p) {
      var grid = el('div', 'vv-form-grid'); form.appendChild(grid);
      var nickname = field(grid, 'Nickname', 'nickname', p.nickname || ''); nickname.required = true; nickname.maxLength = 40;
      field(grid, 'Expected availability', 'availability', p.availability || 'unknown', 'select', [['unknown', 'Unsure'], ['online', 'Online'], ['offline', 'Offline']]);
      var troops = el('div', 'vv-troop-inputs'); form.appendChild(troops);
      TYPES.forEach(function (k) { var input = field(troops, LABELS[k], k, p[k], 'number'); input.required = true; input.parentElement.prepend(symbol(k)); });
      grid = el('div', 'vv-form-grid'); form.appendChild(grid);
      var cap = field(grid, 'March capacity', 'marchCapacity', p.marchCapacity, 'number'); cap.max = '10000000'; cap.required = true;
      var q = field(grid, 'Queues', 'marches', p.marches || 5, 'number'); q.min = '1'; q.max = '6'; q.required = true;
      var notes = field(grid, 'Notes (optional)', 'notes', p.notes || '', 'textarea'); notes.maxLength = 300; notes.parentElement.classList.add('vv-wide');
      var caps = field(grid, 'Capacity for each queue (optional, comma separated)', 'capacities', (p.capacities || []).join(', ')); caps.parentElement.classList.add('vv-wide');
      form.appendChild(el('p', 'vv-caption', 'Only these Vikings details are shared. A blank troop count is unknown; enter 0 if you have none.'));
    }
    function fromForm(form) {
      var data = Object.fromEntries(new FormData(form));
      ['infantry', 'cavalry', 'archers', 'marchCapacity', 'marches'].forEach(function (k) { data[k] = Number(data[k]); });
      data.capacities = data.capacities.trim() ? data.capacities.split(',').map(function (n) { return Number(n.trim()); }) : null;
      if (data.capacities && (data.capacities.length !== data.marches || data.capacities.some(function (n) { return !Number.isInteger(n) || n < 0 || n > 10000000; }))) throw new Error('Enter one valid capacity for every queue.');
      return data;
    }
    function playerEditor(playerId, joining) {
      var p = playerId ? state.roster.find(function (r) { return r.id === playerId; }) : { nickname: '', infantry: null, cavalry: null, archers: null, marchCapacity: null, marches: 5 };
      if (!p) return;
      modal(joining ? 'Join this event' : playerId ? 'Edit ' + p.nickname : 'Add a player', function (body) {
        var f = form(body, 'player'); f.dataset.id = playerId || ''; playerFields(f, p); submit(f, joining ? 'Join this event' : 'Save player');
        if (!playerId) f.appendChild(button('Use my saved troop counts', 'savedTroops'));
        if (playerId && isManager()) f.appendChild(button('Remove this registration', 'removePlayer', { id: playerId }));
      });
    }
    function eventEditor() {
      modal(state ? 'Event settings' : 'Create an alliance plan', function (body) {
        var f = form(body, 'event'), grid = el('div', 'vv-form-grid'), p = state ? state.plan : {};
        f.appendChild(grid);
        var n = field(grid, 'Event name', 'name', p.name || ''); n.required = true; n.maxLength = 80; n.parentElement.classList.add('vv-wide');
        var date = p.eventAt ? new Date(p.eventAt) : null;
        field(grid, 'Start time (your timezone)', 'eventAt', date ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '', 'datetime-local');
        var d = field(grid, 'Difficulty (optional)', 'difficulty', p.difficulty, 'number'); d.min = '1'; d.max = '100';
        var notes = field(grid, 'Alliance notes', 'notes', p.notes || '', 'textarea'); notes.maxLength = 2000; notes.parentElement.classList.add('vv-wide');
        if (state) field(grid, 'Roster edits', 'closed', p.closed ? 'true' : 'false', 'select', [['false', 'Open'], ['true', 'Locked']]);
        f.appendChild(el('p', 'vv-caption', state ? 'Locking stops sign-ups and player edits. You can still correct registrations.' : 'Start locally. Enable shared sign-ups when you are ready to invite players.'));
        submit(f, state ? 'Save event' : 'Create local plan');
      });
    }
    function assignmentEditor(playerId) {
      var p = state.roster.find(function (r) { return r.id === playerId; }); if (!p) return;
      modal(p.nickname + ' · city marches', function (body) {
        var f = form(body, 'assignments'); f.dataset.id = p.id;
        var rows = state.assignments[p.id] || E.split(p).rows;
        for (var q = 1; q <= p.marches; q++) {
          var row = rows.find(function (r) { return r.queue === q; }) || { queue: q, destination: null, infantry: 0, cavalry: 0, archers: 0 };
          var box = el('div', 'vv-editor-row'); box.dataset.queue = q;
          var targets = [['', 'Not assigned']].concat(state.roster.filter(function (r) { return r.id !== p.id; }).map(function (r) { return [r.id, r.nickname]; }));
          field(box, 'March ' + q + ' · cap ' + fmt(E.capacity(p, q)), 'destination-' + q, row.destination || '', 'select', targets);
          var inputs = el('div', 'vv-troop-inputs'); TYPES.forEach(function (k) { var input = field(inputs, LABELS[k], k + '-' + q, row[k], 'number'); input.required = true; }); box.appendChild(inputs); f.appendChild(box);
        }
        submit(f, 'Save city marches'); f.appendChild(button('Fill with an even troop split', 'fillMarches', { id: p.id }));
        f.appendChild(el('p', 'vv-caption', 'The split uses all troop types while capacity remains. Choose a destination for each march. HQ transfers are set separately.'));
      });
    }
    function hqEditor() {
      modal('HQ · waves 10 and 20', function (body) {
        var f = form(body, 'hq'), grid = el('div', 'vv-form-grid'); f.appendChild(grid);
        field(grid, 'Effective garrison capacity', 'capacity', state.hq.capacity, 'number').required = true;
        var inf = field(grid, 'Infantry %', 'infantryPercent', state.hq.infantryPercent, 'number'); inf.max = '100'; inf.required = true;
        var cav = field(grid, 'Cavalry %', 'cavalryPercent', state.hq.cavalryPercent, 'number'); cav.max = '100'; cav.required = true;
        f.appendChild(el('p', 'vv-caption', 'Choose up to 15 players and the queue each will transfer after city waves 9 and 19. The remainder of the ratio is archers.'));
        state.roster.forEach(function (p) {
          var entry = state.hq.participants.find(function (e) { return e.playerId === p.id; }), row = el('div', 'vv-editor-row'), label = el('label'), check = el('input');
          check.type = 'checkbox'; check.name = 'participant'; check.value = p.id; check.checked = !!entry; label.append(check, document.createTextNode(p.nickname)); row.appendChild(label);
          var queues = Array.from({ length: p.marches }, function (_, i) { return [String(i + 1), 'Queue ' + (i + 1)]; }); field(row, 'Reserved queue', 'queue-' + p.id, entry ? entry.queue : 1, 'select', queues); f.appendChild(row);
        });
        submit(f, 'Save HQ plan');
      });
    }
    function snapshot() { return state.local ? { plan: state.plan, roster: state.roster, assignments: state.assignments, hq: state.hq } : state.published; }
    function personal() {
      var body = one('personal'); body.replaceChildren();
      one('calculator').hidden = !!state; one('entry').hidden = !!state;
      if (!state) return;
      if (state.access === 'join') { body.appendChild(el('h2', '', 'Join ' + state.plan.name)); body.appendChild(el('p', '', 'Add your troop counts and expected availability. Your private edit link will reopen your registration.')); body.appendChild(button('Join this event', 'join')); return; }
      if (state.registrationId) {
        var actions = el('div', 'vv-actions'); actions.appendChild(button('Edit my details', 'editPlayer', { id: state.registrationId })); actions.appendChild(button('Copy my private edit link', 'copyPrivate')); body.appendChild(actions);
      }
      var view = snapshot();
      if (!view || !view.roster.length) { body.appendChild(el('p', '', isManager() ? 'Add players and arrange their marches in Alliance.' : 'The leader has not published assignments yet.')); return; }
      if (!view.roster.some(function (r) { return r.id === selected; })) selected = null;
      if (!selected) {
        var grid = el('div', 'vv-roster'); view.roster.forEach(function (p) { grid.appendChild(city(p, false, 'selectPlayer', view)); }); body.appendChild(el('h2', '', 'Whose instructions?')); body.appendChild(grid); return;
      }
      var p = view.roster.find(function (r) { return r.id === selected; });
      var head = el('div', 'vv-heading'); head.appendChild(el('h2', '', p.nickname + ' · your marches')); if (!state.registrationId) head.appendChild(button('Choose another player', 'choosePlayer')); body.appendChild(head);
      var rows = (view.assignments[p.id] || []).filter(function (r) { return r.destination; });
      if (!rows.length) body.appendChild(el('p', 'vv-caption', 'No city destinations assigned yet.'));
      rows.forEach(function (r) { marchRow(r, name(r.destination, view.roster), body); });
      var used = { infantry: 0, cavalry: 0, archers: 0 }; rows.forEach(function (r) { TYPES.forEach(function (k) { used[k] += r[k]; }); });
      var home = {}; TYPES.forEach(function (k) { home[k] = Math.max(0, p[k] - used[k]); });
      body.appendChild(el('p', 'vv-caption', fmt(total(used)) + ' assigned to cities · ' + fmt(total(home)) + ' left at home / unassigned')); body.appendChild(counts(home));
      var headquarters = E.hqRows(view.hq).find(function (r) { return r.playerId === p.id; });
      if (headquarters) {
        var hq = el('div', 'vv-hq'); hq.appendChild(el('strong', '', 'HQ · waves 10 & 20')); hq.appendChild(counts(headquarters));
        hq.appendChild(el('p', '', 'After city wave 9 or 19 resolves, recall queue ' + headquarters.queue + ' and send this HQ share. Return to your city destination after the HQ hit.')); body.appendChild(hq);
      }
      body.appendChild(button('Copy my instructions', 'copyInstructions'));
      var section = el('div', 'vv-section'); section.appendChild(el('h3', '', 'Cover for your city'));
      var cover = []; Object.keys(view.assignments).forEach(function (sender) { (view.assignments[sender] || []).forEach(function (r) { if (r.destination === p.id && total(r)) cover.push(name(sender, view.roster) + ' · ' + fmt(total(r))); }); });
      section.appendChild(el('p', '', cover.length ? cover.join(' · ') : 'No incoming cover assigned. Agree cover before emptying your city.')); body.appendChild(section);
      var checks = el('div', 'vv-section'); checks.appendChild(el('h3', '', 'Before the first wave'));
      var checkKey = 'bh:vikings-prep:' + state.plan.id + ':' + p.id, checked = read(checkKey) || {};
      ['Guard station set', 'City marches sent', 'Incoming cover agreed', 'HQ instructions checked'].forEach(function (label, i) { var n = el('label', 'vv-check'), input = el('input'); input.type = 'checkbox'; input.checked = !!checked[i]; input.dataset.action = 'vikings.checklist'; input.dataset.key = checkKey; input.dataset.index = i; n.append(input, document.createTextNode(label)); checks.appendChild(n); }); body.appendChild(checks);
    }
    function city(p, manage, action, view) {
      var n = el('div', 'vv-city'); n.appendChild(art('town-center')); var info = el('div'); info.appendChild(button(p.nickname, action || (manage ? 'assign' : 'selectPlayer'), { id: p.id }));
      info.appendChild(el('p', '', p.availability === 'unknown' ? 'Availability unsure' : 'Expects to be ' + p.availability));
      var assignments = (view || state).assignments || {}, used = (assignments[p.id] || []).filter(function (r) { return r.destination && total(r); }).length;
      info.appendChild(el('p', '', fmt(total(p)) + ' troops · ' + used + '/' + p.marches + ' queues assigned'));
      if (manage) info.appendChild(button('Details', 'editPlayer', { id: p.id })); n.appendChild(info); return n;
    }
    function render() {
      var event = one('event'); event.replaceChildren(); event.hidden = !state;
      if (state) {
        event.appendChild(el('p', 'vv-label', state.example ? 'Example · local only' : state.local ? 'Local draft · only on this device' : ({ manage: 'Leader', join: 'Invitation', view: 'Viewing', registration: 'Player' }[state.access])));
        event.appendChild(el('h2', '', state.plan.name)); event.appendChild(button('Switch plan', 'leave'));
        if (state.plan.eventAt) { var date = new Date(state.plan.eventAt); event.appendChild(el('p', 'vv-caption', date.toLocaleString() + ' · ' + date.toISOString().slice(11, 16) + ' UTC')); }
        var pub = state.publicationRevision ? 'Published revision ' + state.publicationRevision : 'Not published';
        if (isManager() && state.published && (state.published.sourceRevision !== state.revision || state.published.rosterRevision !== state.rosterRevision || state.published.planRevision !== state.planRevision)) pub += ' · changes waiting to publish';
        if (lastRefresh) pub += ' · refreshed ' + lastRefresh.toLocaleTimeString();
        event.appendChild(el('p', 'vv-caption', pub + (state.plan.closed ? ' · roster locked' : '')));
        if (state.plan.notes) event.appendChild(el('p', '', state.plan.notes));
      }
      personal(); alliance(); remembered(); tab(mode);
    }
    function alliance() {
      var tools = one('tools'), body = one('alliance'); tools.replaceChildren(); body.replaceChildren();
      if (!state) { body.appendChild(el('p', '', 'Create a local plan, then invite your alliance when it is ready.')); body.appendChild(button('Create an alliance plan', 'create')); return; }
      tools.appendChild(button('Refresh', 'refresh'));
      if (!isManager()) {
        var view = state.published;
        if (!view) { body.appendChild(el('p', '', 'The leader has not published a plan yet.')); return; }
        var cities = el('div', 'vv-roster'); view.roster.forEach(function (p) { cities.appendChild(city(p, false, 'selectPlayer', view)); }); body.appendChild(cities); return;
      }
      tools.appendChild(button('Add a player', 'addPlayer')); tools.appendChild(button('Event settings', 'settings'));
      if (state.local) { if (!state.example) tools.appendChild(button('Enable shared sign-ups', 'enable')); }
      else tools.appendChild(button('Share links', 'share'));
      tools.appendChild(button('Export plan', 'export')); tools.appendChild(button('Import local plan', 'import')); tools.appendChild(button('Close this plan', 'leave'));
      var grid = el('div', 'vv-roster'); state.roster.forEach(function (p) { grid.appendChild(city(p, true)); }); body.appendChild(grid);
      if (!state.roster.length) body.appendChild(el('p', '', 'Add players to start arranging city cover. Tap a player to set their march destinations.'));
      if (!state.roster.length) return;
      var hq = el('div', 'vv-section'); hq.appendChild(el('h3', '', 'HQ · waves 10 & 20')); hq.appendChild(button('Arrange HQ participants', 'hq'));
      if (state.hq.participants.length) { hq.appendChild(el('p', 'vv-caption', state.hq.participants.length + ' participants · ' + fmt(state.hq.capacity) + ' troops · ' + state.hq.infantryPercent + '/' + state.hq.cavalryPercent + '/' + (100 - state.hq.infantryPercent - state.hq.cavalryPercent))); }
      body.appendChild(hq);
      var check = E.validate(state.roster, state.assignments, state.hq), cover = el('div', 'vv-section'); cover.appendChild(el('h3', '', 'Incoming city cover'));
      state.roster.forEach(function (p) { var row = el('div', 'vv-city'); row.appendChild(art('town-center')); var info = el('div'); info.appendChild(button(p.nickname, 'incoming', { id: p.id })); var incoming = check.incoming[p.id]; info.appendChild(el('p', '', incoming.length ? incoming.map(function (r) { return name(r.playerId) + ' · ' + fmt(r.troops); }).join(' / ') : 'No incoming marches')); row.appendChild(info); cover.appendChild(row); }); body.appendChild(cover);
      var problems = el('div', 'vv-section'); problems.appendChild(el('h3', '', check.errors.length ? 'Fix before publishing' : 'Review before publishing'));
      var list = el('ul', 'vv-problems'); check.errors.concat(check.warnings).forEach(function (message) { list.appendChild(el('li', '', message)); }); problems.appendChild(list);
      if (!check.errors.length && !check.warnings.length) problems.appendChild(el('p', 'vv-caption', 'All queues have destinations and every city has assigned cover. Check the plan against your alliance’s needs.'));
      var b = button('Review and publish', 'publish'); b.className = 'vv-primary'; b.disabled = !!check.errors.length; problems.appendChild(b); body.appendChild(problems);
    }
    function remembered() {
      var body = one('remembered'); body.replaceChildren(); if (state) return;
      var saved = read(LINKS); if (!Array.isArray(saved) || !saved.length) return;
      body.appendChild(el('h2', '', 'Saved links on this device'));
      saved.forEach(function (p, i) { body.appendChild(button(p.name + ' · ' + p.role, 'restore', { index: i })); });
      body.appendChild(button('Forget saved links', 'forget'));
    }
    function share() {
      modal('Event links', function (body) {
        var codes = (credential && credential.codes) || {};
        [['manage', 'Management · keep private'], ['join', 'Invitation · allows sign-ups'], ['view', 'Published plan · viewing only']].forEach(function (pair) {
          var code = pair[0] === 'manage' ? credential.code : codes[pair[0]];
          var section = el('div', 'vv-section'); section.appendChild(el('h3', '', pair[1]));
          if (code) { var input = el('input', 'vv-link'); input.readOnly = true; input.value = link(code); input.setAttribute('aria-label', pair[1]); section.appendChild(input); section.appendChild(button('Copy link', 'copy', { value: link(code) })); }
          else section.appendChild(el('p', 'vv-caption', 'Only the original creation response contains this link. Replace it to create a new one.'));
          if (pair[0] !== 'manage') section.appendChild(button('Replace this link', 'rotate', { role: pair[0] }));
          body.appendChild(section);
        });
        body.appendChild(button('Remember management access on this device', 'remember')); body.appendChild(button('Delete shared plan', 'deletePlan'));
        body.appendChild(el('p', 'vv-caption', 'Save the management link. Lost management access cannot be recovered. Anyone you forward it to can manage the plan.'));
      });
    }
    function saveRemembered() {
      if (!credential) return;
      var links = read(LINKS); if (!Array.isArray(links)) links = [];
      links = links.filter(function (r) { return r.planId !== credential.planId || r.code !== credential.code; });
      links.unshift({ planId: credential.planId, code: credential.code, name: state.plan.name, role: state.access });
      if (!write(LINKS, links.slice(0, 20))) throw new Error('Storage is unavailable. Keep a copy of your private link.');
      say('Private link remembered on this device.');
    }
    function exportFile() {
      var data = state.local ? state : { ...state, access: 'manage', local: true };
      data = { ...data }; delete data.registrationId;
      var blob = new Blob([JSON.stringify({ format: 'kingslop-vikings', version: 1, state: data }, null, 2)], { type: 'application/json' });
      var a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'vikings-plan.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      say('Exported planning data. Private access links are kept separate.');
    }
    async function enable() {
      var created = await request('/v1/plans', 'POST', { name: state.plan.name, eventAt: state.plan.eventAt, difficulty: state.plan.difficulty, notes: state.plan.notes, closed: false });
      var local = clone(state), map = {}, newCredential = { planId: created.plan.id, code: created.codes.manage, codes: created.codes };
      credential = newCredential; write(SESSION, credential, sessionStorage);
      state = { plan: created.plan, roster: [], assignments: {}, hq: E.emptyHQ(), access: 'manage', local: false };
      saveRemembered();
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
        share(); say('Shared sign-ups enabled. The local draft is still saved as a backup.');
      } catch (cause) { await load(true).catch(function () {}); share(); throw new Error('The shared plan was created, but some draft details were not copied. Keep its management link and review the roster. Your local backup remains available. ' + cause.message); }
    }
    async function submitForm(f) {
      if (!f.reportValidity()) return;
      var kind = f.dataset.kind, data;
      if (kind === 'event') {
        data = Object.fromEntries(new FormData(f)); data.eventAt = data.eventAt ? new Date(data.eventAt).toISOString() : null; data.difficulty = data.difficulty ? Number(data.difficulty) : null; data.closed = data.closed === 'true';
        if (!state) { state = localState(data.name); Object.assign(state.plan, data); }
        else if (state.local) { Object.assign(state.plan, data); state.planRevision++; }
        else { await request('/v1/plans/' + state.plan.id, 'PATCH', { ...data, revision: state.plan.revision }); await load(true); }
        persist(); close(); mode = 'alliance-plan'; render();
      } else if (kind === 'player') {
        data = fromForm(f); var playerId = f.dataset.id, previous = state.roster.find(function (p) { return p.id === playerId; });
        if (state.local) {
          if (!previous && state.roster.length >= 120) throw new Error('A plan can hold at most 120 players.');
          if (previous) Object.assign(previous, data, { revision: (previous.revision || 1) + 1 }); else state.roster.push({ ...data, id: id(), revision: 1 }); state.rosterRevision++;
        } else {
          var response = await request('/v1/plans/' + state.plan.id + '/registrations' + (playerId ? '/' + playerId : ''), playerId ? 'PUT' : 'POST', { ...data, ...(previous ? { revision: previous.revision } : {}) });
          if (state.access === 'join') { credential = { planId: state.plan.id, code: response.editCode }; }
          await load(true);
          if (response.editCode && state.access === 'registration') {
            close(); modal('Your registration is saved', function (body) { body.appendChild(el('p', '', 'Keep this private link to edit your details and return to your assignments.')); var input = el('input', 'vv-link'); input.readOnly = true; input.value = link(credential.code); body.appendChild(input); body.appendChild(button('Copy private edit link', 'copyPrivate')); body.appendChild(button('Remember on this device', 'remember')); }); persist(); render(); return;
          }
        }
        persist(); close(); render(); say('Player saved.');
      } else if (kind === 'assignments') {
        var rows = [];
        f.querySelectorAll('[data-queue]').forEach(function (box) { var queue = Number(box.dataset.queue), row = { queue: queue, destination: f.elements['destination-' + queue].value || null }; TYPES.forEach(function (k) { row[k] = Number(f.elements[k + '-' + queue].value); }); rows.push(row); });
        var assignments = { ...state.assignments, [f.dataset.id]: rows }, check = E.validate(state.roster, { [f.dataset.id]: rows }, E.emptyHQ()); if (check.errors.length) throw new Error(check.errors[0]);
        if (state.local) { state.assignments = assignments; state.revision++; }
        else { await request('/v1/plans/' + state.plan.id + '/assignments/' + f.dataset.id, 'PUT', { ...expected(), marches: rows }); await load(true); }
        persist(); close(); render(); say('City marches saved to the draft.');
      } else if (kind === 'hq') {
        data = new FormData(f); var hq = { capacity: Number(data.get('capacity')), infantryPercent: Number(data.get('infantryPercent')), cavalryPercent: Number(data.get('cavalryPercent')), participants: data.getAll('participant').map(function (pid) { return { playerId: pid, queue: Number(data.get('queue-' + pid)) }; }) };
        if (hq.infantryPercent + hq.cavalryPercent > 100 || hq.participants.length > 15) throw new Error('Use a ratio up to 100% and at most 15 participants.');
        if (state.local) { state.hq = hq; state.revision++; } else { await request('/v1/plans/' + state.plan.id + '/hq', 'PUT', { ...expected(), hq: hq }); await load(true); }
        persist(); close(); render(); say('HQ draft saved. Review any troop conflicts before publishing.');
      } else if (kind === 'open') {
        var url; try { url = new URL(f.elements.link.value); } catch (_) { throw new Error('Paste a complete Vikings access link.'); }
        var parts = /^#access=([a-f0-9-]+)\.([A-Za-z0-9_-]{43})$/.exec(url.hash); if (!parts || !UUID.test(parts[1])) throw new Error('This link does not contain a valid plan and access code.');
        credential = { planId: parts[1], code: parts[2] }; await load(true); close(); mode = state.access === 'manage' ? 'alliance-plan' : 'my-plan'; render();
      }
    }
    async function savedTroops() {
      var troops; try { troops = context.ledger.combat().troops; } catch (_) { throw new Error('Your player save could not be read. Enter the counts manually.'); }
      var totals = { infantry: null, cavalry: null, archers: null }, map = { inf: 'infantry', cav: 'cavalry', arc: 'archers' };
      troops.forEach(function (p) { if (map[p.type] && Number.isFinite(p.amount)) totals[map[p.type]] = (totals[map[p.type]] || 0) + p.amount; });
      if (TYPES.every(function (k) { return totals[k] === null; })) throw new Error('There are no confirmed troop counts in your save yet.');
      var f = one('dialog').open ? one('dialogBody').querySelector('form') : one('calculatorForm');
      TYPES.forEach(function (k) { if (f.elements[k]) f.elements[k].value = totals[k] === null ? '' : totals[k]; });
      say('Saved troop counts loaded for review. Missing types remain blank. Nothing has been uploaded.');
    }
    function demo() {
      state = localState('Thursday Vikings · example'); state.example = true;
      ['Rowan', 'Ash', 'Fern', 'Willow'].forEach(function (nickname, i) { state.roster.push({ id: id(), nickname: nickname, availability: i === 3 ? 'offline' : 'online', infantry: 240000, cavalry: 160000, archers: 120000, marchCapacity: 180000, marches: 3, capacities: null, notes: '', revision: 1 }); });
      state.roster.forEach(function (p, i) { state.assignments[p.id] = E.split(p).rows.map(function (r, q) { return { ...r, destination: state.roster[(i + q + 1) % 4].id }; }); });
      state.hq = { capacity: 300000, infantryPercent: 75, cavalryPercent: 25, participants: state.roster.slice(0, 3).map(function (p) { return { playerId: p.id, queue: 1 }; }) };
      selected = state.roster[0].id; credential = null; mode = 'my-plan'; render(); say('Example data. Your own saved plan and player save are unchanged.');
    }
    function waves() {
      var body = one('waves');
      for (var w = 1; w <= 20; w++) { var kind = [10, 20].includes(w) ? 'hq' : [7, 14, 17].includes(w) ? 'online' : 'city'; var b = button(String(w), 'wave', { wave: w, kind: kind }); b.setAttribute('aria-pressed', w === 1 ? 'true' : 'false'); b.appendChild(el('small', '', kind === 'online' ? 'On' : kind === 'hq' ? 'HQ' : 'City')); body.appendChild(b); }
    }
    context.listen(one('dialog'), 'input', function () { dialogDirty = true; });
    context.listen(one('dialog'), 'close', function () { dialogDirty = false; });
    context.listen(root, 'keydown', function (event) { var tabs = Array.from(root.querySelectorAll('[role=tab]')), at = tabs.indexOf(event.target); if (at < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); var next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (at + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; tabs[next].click(); tabs[next].focus(); });
    function schedule(delay) {
      clearTimeout(timer); timer = setTimeout(function () {
        if (disposed) return;
        if (!credential || !state || state.local || document.hidden || one('dialog').open || busy) return schedule(30000);
        run(async function () { try { var status = await request('/v1/plans/' + state.plan.id + '/status'); var signature = [state.plan.revision, state.plan.rosterRevision || 0, state.publicationRevision || 0, isManager() ? state.revision : 0].join(':'); if (status.signature !== signature) await load(true); schedule(30000); } catch (cause) { say('Could not refresh. Showing the last loaded plan; try Refresh when connected.', true); schedule(90000); } });
      }, delay);
    }
    context.cleanup(function () { disposed = true; clearTimeout(timer); });
    function action(fn, events) { return { events: events || ['click'], run: function (node, event) { return run(function () { return fn(node, event); }); } }; }
    var actions = {
      tab: { run: function (node) { tab(node.dataset.tab); } },
      calculate: { events: ['submit'], preventDefault: true, run: function (f) { return run(function () {
        if (!f.reportValidity()) return; var p = Object.fromEntries(new FormData(f)); Object.keys(p).forEach(function (k) { p[k] = Number(p[k]); });
        var result = E.split(p), answer = one('split'); answer.replaceChildren(); answer.appendChild(el('p', 'vv-result-head', fmt(result.total) + ' troops deployed'));
        result.rows.forEach(function (r) { marchRow(r, 'March ' + r.queue + ' · ' + fmt(total(r)), answer); });
        answer.appendChild(el('p', 'vv-caption', fmt(total(result.home)) + ' troops remain home')); if (total(result.home)) answer.appendChild(counts(result.home));
      }); } },
      submit: { events: ['submit'], preventDefault: true, run: function (f) { return run(function () { return submitForm(f); }); } },
      closeDialog: { run: function () { close(); } },
      create: action(function () { if (state) throw new Error('Close the current plan before creating another.'); eventEditor(); }),
      settings: action(eventEditor),
      demo: action(demo),
      open: action(function () { modal('Open an access link', function (body) { var f = form(body, 'open'); var input = field(f, 'Vikings link', 'link', '', 'url'); input.required = true; submit(f, 'Open plan'); }); }),
      addPlayer: action(function () { playerEditor(null, false); }), join: action(function () { if (state.plan.closed) throw new Error('Registration is locked.'); playerEditor(null, true); }),
      editPlayer: action(function (node) { playerEditor(node.dataset.id, false); }),
      assign: action(function (node) { assignmentEditor(node.dataset.id); }),
      hq: action(hqEditor),
      fillMarches: action(function (node) { var p = state.roster.find(function (p) { return p.id === node.dataset.id; }), f = one('dialogBody').querySelector('form'); E.split(p).rows.forEach(function (r) { TYPES.forEach(function (k) { f.elements[k + '-' + r.queue].value = r[k]; }); }); dialogDirty = true; }),
      selectPlayer: { run: function (node) { selected = node.dataset.id; personal(); tab('my-plan'); } },
      choosePlayer: { run: function () { selected = null; personal(); } },
      incoming: action(function (node) { modal('Cover for ' + name(node.dataset.id), function (body) { Object.keys(state.assignments).forEach(function (sender) { var rows = state.assignments[sender].filter(function (r) { return r.destination === node.dataset.id; }); if (rows.length) body.appendChild(button(name(sender) + ' · edit incoming marches', 'assign', { id: sender })); }); }); }),
      savedTroops: action(savedTroops),
      enable: action(enable), share: action(share),
      copy: action(function (node) { return copy(node.dataset.value); }),
      copyPrivate: action(function () { return copy(link(credential.code)); }),
      copyInstructions: action(function () { return copy(E.instructions(snapshot(), selected)); }),
      remember: action(saveRemembered),
      restore: action(async function (node) { var saved = read(LINKS), c = saved && saved[Number(node.dataset.index)]; if (!c || !UUID.test(c.planId)) throw new Error('This saved link is invalid.'); credential = c; await load(true); mode = state.access === 'manage' ? 'alliance-plan' : 'my-plan'; render(); }),
      forget: action(function () { localStorage.removeItem(LINKS); remembered(); }),
      rotate: action(function (node) { var role = node.dataset.role; modal('Replace ' + (role === 'join' ? 'invitation' : 'viewing') + ' link?', function (body) { body.appendChild(el('p', '', 'The old link will stop working. Share the replacement with anyone who needs access.')); body.appendChild(button('Replace link now', 'confirmRotate', { role: role })); }); }),
      confirmRotate: action(async function (node) { var result = await request('/v1/plans/' + state.plan.id + '/rotate', 'POST', { role: node.dataset.role }); credential.codes = credential.codes || {}; credential.codes[result.role] = result.code; persist(); share(); }),
      publish: action(function () { var check = E.validate(state.roster, state.assignments, state.hq); if (check.errors.length) throw new Error(check.errors[0]); modal('Publish these instructions?', function (body) { body.appendChild(el('p', '', 'Players will see this version until you publish another.')); var list = el('ul', 'vv-problems'); check.warnings.forEach(function (warning) { list.appendChild(el('li', '', warning)); }); body.appendChild(list); body.appendChild(button(check.warnings.length ? 'Publish with these gaps' : 'Publish plan', 'confirmPublish')); }); }),
      confirmPublish: action(async function () {
        var check = E.validate(state.roster, state.assignments, state.hq); if (check.errors.length) throw new Error(check.errors[0]);
        if (state.local) { state.published = { plan: clone(state.plan), roster: clone(state.roster), assignments: clone(state.assignments), hq: clone(state.hq), sourceRevision: state.revision, rosterRevision: state.rosterRevision, planRevision: state.planRevision }; state.publicationRevision++; }
        else { await request('/v1/plans/' + state.plan.id + '/publish', 'POST', expected()); await load(true); }
        persist(); close(); render(); say('Instructions published.');
      }),
      removePlayer: action(function (node) { modal('Remove ' + name(node.dataset.id) + '?', function (body) { body.appendChild(el('p', '', 'Their private edit link and draft marches will be removed. Review incoming destinations and HQ before publishing again.')); body.appendChild(button('Remove player', 'confirmRemove', { id: node.dataset.id })); }); }),
      confirmRemove: action(async function (node) { if (state.local) { state.roster = state.roster.filter(function (p) { return p.id !== node.dataset.id; }); delete state.assignments[node.dataset.id]; state.rosterRevision++; state.revision++; } else { await request('/v1/plans/' + state.plan.id + '/registrations/' + node.dataset.id, 'DELETE'); await load(true); } persist(); close(); render(); }),
      deletePlan: action(function () { modal('Delete this shared plan?', function (body) { body.appendChild(el('p', '', 'This removes the shared roster, assignments and all access links. Export the plan first if you need a copy.')); body.appendChild(button('Delete the shared plan permanently', 'confirmDelete')); }); }),
      confirmDelete: action(async function () { await request('/v1/plans/' + state.plan.id, 'DELETE'); var links = read(LINKS) || []; write(LINKS, links.filter(function (r) { return r.planId !== state.plan.id; })); state = null; credential = null; selected = null; sessionStorage.removeItem(SESSION); close(); mode = 'my-plan'; render(); say('Shared plan deleted.'); }),
      refresh: action(async function () { if (state.local) { render(); return; } await load(); }),
      export: action(exportFile),
      import: action(function () { if (!state.local) throw new Error('Close this shared plan and create a local plan before importing.'); modal('Import a local plan', function (body) { var input = el('input'); input.type = 'file'; input.accept = '.json,application/json'; input.dataset.action = 'vikings.importFile'; body.appendChild(input); body.appendChild(el('p', 'vv-caption', 'This replaces the current local draft. Export it first if you need to keep it.')); }); }),
      importFile: action(async function (input) {
        var file = input.files[0]; if (!file || file.size > 300000) throw new Error('Choose a Vikings JSON export under 300 KB.');
        var data = JSON.parse(await file.text()); if (data.format !== 'kingslop-vikings' || data.version !== 1 || !data.state || !Array.isArray(data.state.roster) || data.state.roster.length > 120) throw new Error('This is not a supported Vikings export.');
        var value = data.state; if (!value.plan || !UUID.test(value.plan.id) || typeof value.plan.name !== 'string' || !value.assignments || !value.hq || !Array.isArray(value.hq.participants)) throw new Error('Invalid plan data.');
        value.roster.forEach(function (p) { if (!UUID.test(p.id) || typeof p.nickname !== 'string' || ![...TYPES, 'marchCapacity', 'marches'].every(function (k) { return Number.isInteger(p[k]) && p[k] >= 0 && p[k] <= 100000000; }) || p.marches < 1 || p.marches > 6) throw new Error('Invalid player in this export.'); });
        var check = E.validate(value.roster, value.assignments, value.hq); if (check.errors.length) throw new Error(check.errors[0]);
        state = { ...localState(), plan: value.plan, roster: value.roster, assignments: value.assignments, hq: value.hq }; credential = null; selected = null; persist(); close(); render(); say('Local plan imported.');
      }, ['change']),
      leave: action(function () { state = null; credential = null; selected = null; sessionStorage.removeItem(SESSION); close(); mode = 'my-plan'; render(); }),
      checklist: { events: ['change'], run: function (node) { var data = read(node.dataset.key) || {}; data[node.dataset.index] = node.checked; write(node.dataset.key, data); } },
      wave: { run: function (node) { one('waves').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === node)); }); one('waveDetail').textContent = node.dataset.kind === 'hq' ? 'HQ wave ' + node.dataset.wave + ': send the agreed share after the preceding city wave resolves. Return to city cover after the HQ hit.' : node.dataset.kind === 'online' ? 'Wave ' + node.dataset.wave + ': online cities only. Check the in-game Members tab and follow any agreed cover rotations.' : 'Wave ' + node.dataset.wave + ': city reinforcements stay in their assigned towns. Check cover before the hit.'; } }
    };
    waves();
    var initial = window.VikingsAccess || read(SESSION, sessionStorage);
    if (initial && UUID.test(initial.planId) && /^[A-Za-z0-9_-]{43}$/.test(initial.code)) {
      credential = initial; run(async function () { await load(true); mode = state.access === 'manage' ? 'alliance-plan' : 'my-plan'; render(); }).catch(function () {});
    } else {
      var local = read(KEY); if (local && local.local && Array.isArray(local.roster)) state = local;
      if (state) mode = 'alliance-plan'; render();
    }
    schedule(30000);
    return { actions: actions, refresh: function () { if (!one('dialog').open) render(); } };
  });
})();
