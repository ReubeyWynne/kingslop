(function () {
  'use strict';
  var E = window.VikingsEngine;
  var ROOT = document.querySelector('[data-vikings-api]')?.dataset.vikingsApi || 'https://kingslop.reubeycw.workers.dev';
  var ALLIANCE = 'bh:vikings-alliance:v1', LINKS = 'bh:vikings-links:v1', LAST = 'bh:vikings-last:v1', TIME = 'bh:vikings-time:v1';
  var TYPES = E.types, LABELS = { infantry: 'Infantry', cavalry: 'Cavalry', archers: 'Archers' };
  var SYMBOLS = { infantry: 'inf', cavalry: 'cav', archers: 'arc' }, ART = { infantry: 'barracks', cavalry: 'stable', archers: 'range' };
  // Short links name their role so a player can tell them apart in chat; the server decides the role from the code.
  var PREFIX = { manage: 'lead', join: 'join', view: 'view', registration: 'me' }, ROLES = { manage: 'Leader', join: 'Member', view: 'Viewer', registration: 'Member' };
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, CODE = /^(?:[A-Za-z0-9_-]{22}|[A-Za-z0-9_-]{43})$/, DAY = 86400000, K = 1000;
  function read(key, storage) { try { return JSON.parse((storage || localStorage).getItem(key)); } catch (_) { return null; } }
  function write(key, value, storage) { try { (storage || localStorage).setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } }
  function drop(key, storage) { try { (storage || localStorage).removeItem(key); } catch (_) {} }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function button(text, action, props, cls) { var n = el('button', cls || '', text); n.type = 'button'; n.dataset.action = 'vikings.' + action; Object.assign(n.dataset, props || {}); return n; }
  function total(p) { return E.sum(p); }
  function id() { if (crypto.randomUUID) return crypto.randomUUID(); var b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128; var h = Array.from(b, function (n) { return n.toString(16).padStart(2, '0'); }).join(''); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20); }
  function dayLabel(ms) { return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function utcDay(ms) { return Math.floor(ms / DAY) * DAY; }
  function until(ms) { var d = Math.round((utcDay(ms) - utcDay(Date.now())) / DAY); return d === 0 ? 'today' : d === 1 ? 'tomorrow' : d > 1 ? 'in ' + d + ' days' : d === -1 ? 'yesterday' : -d + ' days ago'; }
  function utcTime(ms) { return new Date(ms).toISOString().slice(11, 16); }
  function utcWhen(iso) { var t = Date.parse(iso); return dayLabel(t) + ' ' + utcTime(t) + ' UTC'; }
  function localWhen(iso) { return new Date(iso).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' }); }
  // Troops show as 240k or 1.2M. A player's own counts use the site's unit inputs (js/unit-input.js), thousands
  // until they pick another unit; the leader's march editor works in thousands.
  function kfmt(n) { n = n || 0; return n >= 1e6 ? +(n / 1e6).toFixed(2) + 'M' : n >= K ? Math.round(n / K).toLocaleString() + 'k' : String(n); }
  var GUEST = new URLSearchParams(location.search).has('guest');
  function toK(n) { return n == null || n === '' ? '' : +(n / K).toFixed(1); }
  function fromK(v) { return Math.round(Number(v) * K); }

  window.Interactions.register('vikings', function (context) {
    var root = context.root, state = null, credential = null, pending = null, mode = 'my-plan', busy = false, timer = null, disposed = false;
    function one(key) { return context.targets(key)[0]; }
    function say(message, error) { one('message').textContent = message; one('message').dataset.error = error ? 'true' : 'false'; if (one('dialog').open) one('dialogMessage').textContent = error ? message : ''; }
    function persist() { return !!credential && write(ALLIANCE, Object.assign({}, credential, { name: state ? state.plan.name : credential.name })); }
    function name(playerId) { var p = ((state && state.roster) || []).find(function (r) { return r.id === playerId; }); return p ? p.nickname : 'Player removed'; }
    function isManager() { return state && state.access === 'manage'; }
    function shareUrl(role, code) { return new URL('../vv/#' + PREFIX[role] + '-' + code, location.href).href; }
    function me() { return state && state.registrationId ? state.roster.find(function (r) { return r.id === state.registrationId; }) : null; }

    /* One alliance per device, held by the strongest link opened for it: a leader link also signs up and views,
       a sign-up link also views. The device's own sign-up rides beside it as `player`. */
    var RANK = { view: 1, join: 2, registration: 2, manage: 3 };
    function stored() {
      var c = read(ALLIANCE);
      if (c && UUID.test(c.planId) && CODE.test(c.code) && RANK[c.role]) return c;
      // Saved by an earlier version as a list of links: keep the leader link if there was one, with this device's sign-up.
      var old = read(LINKS); if (!Array.isArray(old)) return null;
      old = old.filter(function (o) { return o && UUID.test(o.planId) && CODE.test(o.code) && RANK[o.role]; });
      var pick = old.find(function (o) { return o.role === 'manage'; }) || old.find(function (o) { return o.role === 'registration'; }); if (!pick) return null;
      var own = old.find(function (o) { return o.planId === pick.planId && o.role === 'registration'; });
      c = { planId: pick.planId, code: pick.code, role: pick.role, codes: pick.codes, name: pick.name, player: own ? { id: own.id || null, code: own.code } : pick.self ? { id: pick.self, code: null } : null };
      write(ALLIANCE, c); drop(LINKS); drop(LAST); return c;
    }
    // Reads use the player's own code when there is one, so a member sees their own troops in full.
    function readToken() { return credential.role !== 'manage' && credential.player && credential.player.code ? credential.player.code : credential.code; }

    async function copy(value, done) {
      try { await navigator.clipboard.writeText(value); say(done || 'Copied.'); }
      catch (_) { modal('Copy', function (body) { var area = el('textarea', 'vv-link'); area.value = value; area.readOnly = true; area.rows = 4; body.appendChild(area); area.select(); }); }
    }
    async function request(path, method, data, token) {
      var controller = new AbortController(), timeout = setTimeout(function () { controller.abort(); }, 20000);
      try {
        var response = await fetch(ROOT + path, { method: method || 'GET', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal, headers: Object.assign({}, token || (credential && credential.code) ? { Authorization: 'Bearer ' + (token || credential.code) } : {}, data ? { 'Content-Type': 'application/json' } : {}), body: data ? JSON.stringify(data) : undefined });
        var result = response.status === 204 ? null : await response.json();
        if (!response.ok) { var error = new Error((result && result.error) || 'That didn’t save. Try again.'); error.status = response.status; throw error; }
        return result;
      } catch (cause) { if (cause.name === 'AbortError') throw new Error('Timed out. Refresh to check whether it saved.'); throw cause; }
      finally { clearTimeout(timeout); }
    }
    async function run(fn) {
      if (busy) return;
      busy = true; root.setAttribute('aria-busy', 'true'); root.querySelectorAll('[data-mutation]').forEach(function (n) { n.disabled = true; });
      try { await fn(); }
      catch (cause) { say(cause.message || 'Can’t reach the planner. Showing the last copy.', true); }
      finally { busy = false; root.removeAttribute('aria-busy'); root.querySelectorAll('[data-mutation]').forEach(function (n) { n.disabled = false; }); }
    }
    async function load() {
      var planId = credential.planId, token = readToken(), data, board;
      try { data = await request('/v1/plans/' + planId, 'GET', null, token); board = await request('/v1/plans/' + planId + '/board', 'GET', null, token); }
      catch (cause) {
        // A sign-up the leader removed takes its code with it; carry on with the alliance link.
        if (cause.status === 401 && token !== credential.code) { credential.player = null; persist(); return load(); }
        throw cause;
      }
      if (disposed || credential.planId !== planId) return;
      if (credential.player && !credential.player.id) credential.player.id = data.registrationId || null;
      state = { plan: board.plan || data.plan, roster: board.roster || data.registrations, assignments: board.assignments || {}, hq: board.hq || E.emptyHQ(), revision: board.revision, rosterRevision: board.rosterRevision, planRevision: board.planRevision, publicationRevision: board.publicationRevision || 0, access: credential.role, registrationId: null };
      var mine = credential.player && credential.player.id;
      if (mine && state.roster.some(function (p) { return p.id === mine; })) state.registrationId = mine;
      else if (mine && credential.role === 'manage') credential.player = null;
      persist(); render();
    }
    // Open a link or the alliance saved here. A link never lowers what this device holds for that alliance.
    async function open(c, fromLink, confirmed) {
      if (!c.planId || !c.role) { var found = await request('/v1/access', 'GET', null, c.code); c = { planId: found.planId, code: c.code, role: found.access }; }
      var have = stored();
      if (have && have.planId !== c.planId && fromLink && !confirmed) {
        pending = c;
        modal('Open another alliance?', function (body) {
          body.appendChild(el('p', '', 'This phone keeps one alliance. ' + (have.name || 'The one here') + ' will be forgotten on it.'));
          var a = foot(body); a.appendChild(button('Keep ' + (have.name || 'mine'), 'keepCurrent', {}, 'vv-quiet')); a.appendChild(button('Open it', 'confirmSwitch', {}, 'vv-primary'));
        });
        return;
      }
      var next = c;
      if (have && have.planId === c.planId) {
        next = Object.assign({}, have);
        if (c.role === 'registration') { if (!next.player || next.player.code !== c.code) next.player = { id: null, code: c.code }; }
        else if (RANK[c.role] > RANK[have.role] || (have.role === 'registration' && c.role === 'join')) { next.code = c.code; next.role = c.role; if (c.codes) next.codes = c.codes; }
      } else if (c.role === 'registration') next = { planId: c.planId, code: c.code, role: 'registration', player: { id: null, code: c.code } };
      credential = next;
      try { await load(); }
      catch (cause) {
        if (cause.status === 401 || cause.status === 404) { if (!fromLink) drop(ALLIANCE); credential = null; state = null; render(); throw new Error(fromLink ? 'This link no longer works. Ask your leader for a new one.' : 'That alliance plan has expired.'); }
        throw cause;
      }
      if (!persist()) say('This browser can’t save, so keep your link.', true); else say('');
      mode = state.access === 'manage' || state.access === 'view' ? 'alliance-plan' : 'my-plan'; render();
    }
    function tab(next) {
      // Viewers only see the alliance.
      var viewer = !!state && state.access === 'view'; document.getElementById('vv-my-tab').hidden = viewer; if (viewer && next === 'my-plan') next = 'alliance-plan';
      mode = next;
      root.querySelectorAll('[role=tab]').forEach(function (n) { n.setAttribute('aria-selected', String(n.dataset.tab === next)); });
      ['my-plan', 'alliance-plan', 'vikings-guide'].forEach(function (key) { document.getElementById(key).hidden = key !== next; });
    }
    function modal(title, build) {
      var dialog = one('dialog'), body = one('dialogBody'); body.replaceChildren(); document.getElementById('vv-dialog-title').textContent = title; one('dialogMessage').textContent = '';
      build(body); if (!dialog.open) dialog.showModal();
    }
    function close() { one('dialog').close(); }
    function form(body, kind) { var n = el('form'); n.dataset.action = 'vikings.submit'; n.dataset.kind = kind; body.appendChild(n); return n; }
    function field(container, title, key, value, type, options) {
      var label = el('label', '', title), input;
      if (type === 'select') { input = el('select'); (options || []).forEach(function (o) { var opt = el('option', '', o[1]); opt.value = o[0]; input.appendChild(opt); }); }
      else input = el(type === 'textarea' ? 'textarea' : 'input');
      if (input.tagName === 'INPUT') input.type = type || 'text';
      input.name = key; input.value = value == null ? '' : String(value);
      if (type === 'number') { input.min = '0'; input.step = '1'; input.inputMode = 'numeric'; }
      label.appendChild(input); container.appendChild(label); return input;
    }
    // A march-editor count in thousands: the leader types 80 and sees "k" beside it.
    function scaled(input, value) { input.type = 'number'; input.min = '0'; input.step = 'any'; input.inputMode = 'decimal'; input.dataset.scaled = ''; input.value = toK(value); return input; }
    // A player's own count, in the unit they pick beside it.
    function kField(container, title, key, value, picture) {
      var label = el('label', 'vv-k'); if (picture) label.appendChild(picture); label.appendChild(el('span', '', title));
      var wrap = el('span', 'vv-k-input'), input = el('input'); input.name = key; input.min = '0'; input.dataset.unitInput = 'count'; input.dataset.unitDefault = 'k'; input.placeholder = '—'; input.value = value == null ? '' : String(value);
      wrap.appendChild(input); label.appendChild(wrap); container.appendChild(label); return input;
    }
    function count(f, key) { var v = f.elements[key].value; return v === '' ? NaN : Number(v); }
    // Dialog footers end with the affirmative action: right in LTR, left in RTL.
    function foot(container) { var a = el('div', 'vv-actions vv-foot'); container.appendChild(a); return a; }
    function ask(body, text, label, act, data, kind) { body.appendChild(el('p', '', text)); var a = foot(body); a.appendChild(button('Cancel', 'closeDialog', {}, 'vv-quiet')); a.appendChild(button(label, act, data || {}, kind)); }
    function submit(form, title) { var b = el('button', 'vv-primary', title); b.type = 'submit'; b.dataset.mutation = ''; form.appendChild(b); return b; }
    function symbol(k) { var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), use = document.createElementNS(svg.namespaceURI, 'use'); svg.setAttribute('class', 'vv-symbol'); svg.setAttribute('aria-hidden', 'true'); use.setAttribute('href', '#troop-' + SYMBOLS[k]); svg.appendChild(use); return svg; }
    function counts(p) {
      var row = el('div', 'vv-counts');
      TYPES.forEach(function (k) { var span = el('span'); span.appendChild(symbol(k)); span.appendChild(document.createTextNode(' ' + kfmt(p[k]))); span.setAttribute('aria-label', kfmt(p[k]) + ' ' + LABELS[k]); row.appendChild(span); });
      return row;
    }
    function art(kind, size) { var img = el('img'); img.src = '../img/buildings/' + kind + '.webp'; img.alt = ''; img.width = img.height = size || 64; img.loading = 'lazy'; return img; }
    function hqMark() { var n = el('span', 'vv-hq-mark', 'HQ'); n.setAttribute('aria-hidden', 'true'); return n; }
    function marchRow(row, destination, container, note) {
      var n = el('div', 'vv-march'); n.appendChild(el('span', 'vv-queue', row.queue)); n.appendChild(row.destination === 'hq' ? hqMark() : art('town-center', 48));
      var info = el('div', 'vv-march-main'), head = el('div', 'vv-march-head'); head.appendChild(el('strong', '', destination)); head.appendChild(el('span', 'vv-total', kfmt(total(row)))); info.appendChild(head); info.appendChild(counts(row));
      if (note) info.appendChild(el('p', 'vv-caption', note));
      n.appendChild(info); container.appendChild(n); return n;
    }
    function expected() { return { revision: state.revision, rosterRevision: state.rosterRevision, planRevision: state.planRevision }; }
    function when() { return state.plan.eventAt ? dayLabel(Date.parse(state.plan.eventAt)) : 'the next Vikings'; }
    var ONLINE = [['unknown', 'Not sure'], ['online', 'Yes'], ['offline', 'No']];

    /* Troops, march size and marches, all quick to change. */
    function playerFields(form, p, withName, own) {
      if (own) { var save = fromSave(); form.dataset.own = ''; if (save) { p = Object.assign({}, p); TYPES.forEach(function (k) { if (save.totals[k] !== null) p[k] = save.totals[k]; }); } }
      var grid = el('div', 'vv-form-grid'); form.appendChild(grid);
      if (withName) { var nick = field(grid, 'In-game name', 'nickname', p.nickname || ''); nick.required = true; nick.maxLength = 40; nick.autocomplete = 'nickname'; }
      else { var hidden = el('input'); hidden.type = 'hidden'; hidden.name = 'nickname'; hidden.value = p.nickname; form.appendChild(hidden); }
      field(grid, 'Online for it?', 'availability', p.availability || 'unknown', 'select', ONLINE);
      var troops = el('div', 'vv-troop-inputs'); form.appendChild(troops);
      TYPES.forEach(function (k) { kField(troops, LABELS[k], k, p[k], art(ART[k], 48)).required = true; });
      var row = el('div', 'vv-form-grid'); form.appendChild(row);
      kField(row, 'March size', 'marchCapacity', p.marchCapacity).required = true;
      var q = field(row, 'Marches', 'marches', p.marches || 5, 'number'); q.min = '1'; q.max = '6'; q.required = true;
      if (own) { var tools = el('div', 'vv-troop-tools'); syncNote(tools); form.appendChild(tools); }
    }
    function fromForm(form) {
      var data = Object.fromEntries(new FormData(form));
      TYPES.concat('marchCapacity').forEach(function (k) { data[k] = count(form, k); });
      data.marches = Number(data.marches);
      return data;
    }
    function fullPlayer(p, data) { return Object.assign({ nickname: p.nickname, availability: p.availability, infantry: p.infantry, cavalry: p.cavalry, archers: p.archers, marchCapacity: p.marchCapacity, marches: p.marches, notes: p.notes || '', capacities: p.capacities || null }, data); }
    async function savePlayer(p, data) {
      if (state.example) { Object.assign(p, data); render(); return; }
      var token = !isManager() && credential.player && p.id === state.registrationId ? credential.player.code : undefined;
      await request('/v1/plans/' + state.plan.id + '/registrations/' + p.id, 'PUT', Object.assign(fullPlayer(p, data), { revision: p.revision }), token);
      await load();
    }
    function playerEditor(playerId, title, own) {
      var p = state.roster.find(function (r) { return r.id === playerId; }) || { nickname: '', marches: 5 };
      modal(title || (playerId ? p.nickname : 'Add a player'), function (body) {
        var f = form(body, 'player'); f.dataset.id = playerId || ''; playerFields(f, p, true, own);
        var a = foot(f); if (playerId && isManager()) a.appendChild(button('Remove', 'removePlayer', { id: playerId }, 'vv-danger')); submit(a, 'Save');
      });
    }
    function roomEditor() {
      var p = state ? state.plan : {};
      modal(state ? 'Settings' : 'Set up Vikings', function (body) {
        var f = form(body, 'room'), grid = el('div', 'vv-form-grid'); f.appendChild(grid);
        var n = field(grid, 'Alliance', 'name', p.name || ''); n.maxLength = 80; n.placeholder = '[TAG] Vikings'; n.parentElement.classList.add('vv-wide');
        var days = el('fieldset', 'vv-days vv-wide'); days.appendChild(el('legend', '', 'Day'));
        var upcoming = E.eventDays(Date.now(), 4);
        [['tue', 2], ['thu', 4]].forEach(function (d) { var label = el('label', 'vv-chip'), radio = el('input'), first = upcoming.find(function (t) { return new Date(t).getUTCDay() === d[1]; }); radio.type = 'radio'; radio.name = 'day'; radio.value = d[0]; radio.required = true; radio.checked = (p.eventDay || 'tue') === d[0]; label.append(radio, el('span', '', dayLabel(first))); days.appendChild(label); });
        grid.appendChild(days);
        var time = field(grid, 'Start (UTC)', 'time', p.eventTime || read(TIME) || '', 'time'); time.required = true;
        if (state) field(grid, 'Sign-ups', 'closed', p.closed ? 'true' : 'false', 'select', [['false', 'Open'], ['true', 'Closed']]);
        else submit(grid, 'Set up').classList.add('vv-grid-submit');
        grid.appendChild(el('p', 'vv-caption vv-local-time vv-wide'));
        if (state) submit(foot(f), 'Save');
        localTime(f);
      });
    }
    function localTime(f) { var out = f.querySelector('.vv-local-time'), time = f.elements.time && f.elements.time.value; if (out) out.textContent = time ? localWhen('2026-01-01T' + time + ':00Z') + ' your time' : ''; }
    function assignmentEditor(playerId) {
      var p = state.roster.find(function (r) { return r.id === playerId; }); if (!p) return;
      modal(p.nickname, function (body) {
        var top = el('div', 'vv-editor-top'); top.appendChild(counts(p)); var tools = el('span', 'vv-actions vv-tight'); tools.appendChild(button('Edit', 'editPlayer', { id: p.id }, 'vv-quiet')); tools.appendChild(button('Remove', 'removePlayer', { id: p.id }, 'vv-danger')); top.appendChild(tools); body.appendChild(top);
        var check = E.validate(state.roster, state.assignments, state.hq), incoming = check.incoming[p.id] || [];
        var cover = el('div', 'vv-cover-in'); cover.appendChild(el('span', 'vv-label', 'Covered by'));
        if (!incoming.length) cover.appendChild(el('span', 'vv-dim', 'nobody yet'));
        incoming.forEach(function (r) { cover.appendChild(button(name(r.playerId) + ' ' + kfmt(r.troops), 'assign', { id: r.playerId }, 'vv-quiet')); });
        body.appendChild(cover);
        var f = form(body, 'assignments'); f.dataset.id = p.id;
        var rows = state.assignments[p.id] || E.split(p).rows, hq = E.hqRows(state.hq).find(function (r) { return r.playerId === p.id; });
        var bar = el('div', 'vv-send-bar'), status = el('p', 'vv-send-status'); status.setAttribute('aria-live', 'polite'); bar.appendChild(status); f.appendChild(bar);
        var targets = [['', 'Not sent']].concat(state.roster.filter(function (r) { return r.id !== p.id && r.attending !== false; }).map(function (r) { return [r.id, r.nickname + (r.attending ? '' : ' (not answered)')]; }));
        var list = el('div', 'vv-sends');
        for (var q = 1; q <= p.marches; q++) {
          var row = rows.find(function (r) { return r.queue === q; }) || { queue: q, destination: null, infantry: 0, cavalry: 0, archers: 0 };
          var box = el('div', 'vv-send'); box.dataset.queue = q;
          var head = el('div', 'vv-send-head'), title = el('strong', '', 'March ' + q); head.appendChild(title);
          if (hq && hq.queue === q) head.appendChild(el('span', 'vv-avail', 'HQ'));
          head.appendChild(el('span', 'vv-send-cap')); box.appendChild(head);
          var select = el('select'); select.name = 'destination-' + q; select.setAttribute('aria-label', 'March ' + q + ' goes to'); targets.forEach(function (o) { var opt = el('option', '', o[1]); opt.value = o[0]; select.appendChild(opt); });
          if (row.destination && !targets.some(function (t) { return t[0] === row.destination; })) { var gone = el('option', '', name(row.destination) + ' (out)'); gone.value = row.destination; select.appendChild(gone); }
          select.value = row.destination || ''; box.appendChild(select);
          TYPES.forEach(function (k) {
            var label = el('label', 'vv-send-troop'), wrap = el('span', 'vv-k-input'), input = scaled(el('input'), row[k]); input.name = k + '-' + q; input.required = true; input.setAttribute('aria-label', 'March ' + q + ' ' + LABELS[k]);
            label.appendChild(symbol(k)); wrap.appendChild(input); wrap.appendChild(el('span', 'vv-k-unit', 'k')); label.appendChild(wrap); box.appendChild(label);
          });
          var meter = el('span', 'vv-meter'); meter.setAttribute('aria-hidden', 'true'); meter.appendChild(el('span')); box.appendChild(meter);
          list.appendChild(box);
        }
        f.appendChild(list);
        var a = foot(f); a.appendChild(button('Even split', 'fillMarches', { id: p.id })); submit(a, 'Save');
        sends(f);
      });
    }
    // Live totals while the leader types: each march against its size, and what stays home.
    function sends(f) {
      var p = state.roster.find(function (r) { return r.id === f.dataset.id; }); if (!p) return;
      var used = { infantry: 0, cavalry: 0, archers: 0 };
      f.querySelectorAll('[data-queue]').forEach(function (box) {
        var q = Number(box.dataset.queue), sum = 0, cap = E.capacity(p, q);
        TYPES.forEach(function (k) { var v = f.elements[k + '-' + q].value, n = v === '' ? 0 : fromK(v); used[k] += n; sum += n; });
        box.querySelector('.vv-send-cap').textContent = kfmt(sum) + ' / ' + kfmt(cap);
        box.querySelector('.vv-meter span').style.width = (cap ? Math.min(100, sum / cap * 100) : 0) + '%';
        box.dataset.over = String(sum > cap);
      });
      var short = TYPES.filter(function (k) { return used[k] > p[k]; }), home = TYPES.reduce(function (n, k) { return n + Math.max(0, p[k] - used[k]); }, 0);
      var line = f.querySelector('.vv-send-status'); line.textContent = kfmt(total(used)) + ' out · ' + kfmt(home) + ' home';
      line.dataset.error = String(!!short.length); if (short.length) line.textContent += ' · more ' + short.map(function (k) { return LABELS[k].toLowerCase(); }).join(' and ') + ' than they have';
    }
    function hqEditor() {
      modal('HQ · waves 10 and 20', function (body) {
        var f = form(body, 'hq'), grid = el('div', 'vv-form-grid'); f.appendChild(grid);
        var cap = kField(grid, 'HQ capacity', 'capacity', state.hq.capacity); cap.required = true; cap.closest('label').classList.add('vv-wide');
        var inf = field(grid, 'Infantry %', 'infantryPercent', state.hq.infantryPercent, 'number'); inf.max = '100'; inf.required = true;
        var cav = field(grid, 'Cavalry %', 'cavalryPercent', state.hq.cavalryPercent, 'number'); cav.max = '100'; cav.required = true;
        f.appendChild(el('p', 'vv-label', 'Who sends, and which march'));
        state.roster.filter(function (p) { return p.attending !== false; }).forEach(function (p) {
          var entry = state.hq.participants.find(function (e) { return e.playerId === p.id; }), row = el('div', 'vv-hq-pick'), label = el('label'), check = el('input');
          check.type = 'checkbox'; check.name = 'participant'; check.value = p.id; check.checked = !!entry; label.append(check, el('span', '', p.nickname)); row.appendChild(label);
          var queues = Array.from({ length: p.marches }, function (_, i) { return [String(i + 1), 'March ' + (i + 1)]; }); var s = field(row, '', 'queue-' + p.id, entry ? entry.queue : 1, 'select', queues); s.setAttribute('aria-label', p.nickname + ' HQ march'); f.appendChild(row);
        });
        submit(foot(f), 'Save');
      });
    }

    function next() {
      var line = one('next'); line.replaceChildren(); line.hidden = !!state;
      if (line.hidden) return;
      // Tuesday and Thursday of one fortnight are alternatives; a later fortnight is the one after.
      var days = E.eventDays(Date.now(), 2), pair = days[1] - days[0] <= 2 * DAY;
      line.appendChild(el('span', 'vv-label', 'Next Vikings'));
      line.appendChild(el('strong', '', pair ? dayLabel(days[0]) + ' or ' + dayLabel(days[1]) : dayLabel(days[0])));
      line.appendChild(el('span', 'vv-dim', until(days[0]) + (pair ? '' : ' · then ' + dayLabel(days[1]))));
    }
    function bar() {
      var event = one('event'); event.replaceChildren(); event.hidden = !state; if (!state) return;
      var head = el('div', 'vv-bar-head'), text = el('div'), mine = me();
      text.appendChild(el('p', 'vv-label', state.example ? 'Example' : ROLES[state.access] + (mine ? ' · ' + mine.nickname : '')));
      text.appendChild(el('h2', '', state.plan.name)); head.appendChild(text);
      head.appendChild(button('Leave', 'leave', {}, 'vv-quiet')); event.appendChild(head);
      var line = el('p', 'vv-when');
      if (state.plan.eventAt) { var t = Date.parse(state.plan.eventAt); line.appendChild(el('strong', '', utcWhen(state.plan.eventAt))); line.appendChild(el('span', 'vv-dim', localWhen(state.plan.eventAt) + ' your time · ' + until(t))); }
      else { line.appendChild(el('strong', '', 'No day set')); if (isManager()) line.appendChild(button('Set it', 'settings', {}, 'vv-inline')); }
      event.appendChild(line);
    }
    // Are you in for this one? Last time's troops are already filled in.
    function answer(body, p) {
      var f = form(body, 'answer'); f.dataset.id = p ? p.id : '';
      playerFields(f, p || { marches: 5 }, !p, true);
      var a = el('div', 'vv-actions'); submit(a, 'I’m in');
      if (p) { var out = button('Not this time', 'notIn', {}, 'vv-secondary'); out.dataset.mutation = ''; a.appendChild(out); }
      f.appendChild(a);
    }
    // Signed up, nothing set yet: show what you're bringing and the empty queues, so the tab has the same shape it will have.
    function waiting(body, p) {
      var lede = el('p', 'vv-lede', isManager() ? 'Not set yet.' : 'Not set yet. Your leader will fill these in before ' + when() + '.');
      body.appendChild(lede);
      if (isManager()) { var a = el('div', 'vv-actions'); a.appendChild(button('Set my marches', 'assign', { id: p.id }, 'vv-primary')); body.appendChild(a); }
      var list = el('div', 'vv-marches');
      for (var q = 1; q <= (p.marches || 0); q++) {
        var n = el('div', 'vv-march vv-march-empty'), info = el('div', 'vv-march-main'), head = el('div', 'vv-march-head');
        n.appendChild(el('span', 'vv-queue', q)); n.appendChild(el('span', 'vv-slot'));
        head.appendChild(el('strong', '', 'Not set')); head.appendChild(el('span', 'vv-dim', 'up to ' + kfmt((p.capacities && p.capacities[q - 1]) || p.marchCapacity)));
        info.appendChild(head); n.appendChild(info); list.appendChild(n);
      }
      body.appendChild(list);
    }
    function marchesFor(body, p, mine) {
      var rows = (state.assignments[p.id] || []).filter(function (r) { return r.destination && total(r); });
      var used = { infantry: 0, cavalry: 0, archers: 0 }; rows.forEach(function (r) { TYPES.forEach(function (k) { used[k] += r[k]; }); });
      var home = {}; TYPES.forEach(function (k) { home[k] = Math.max(0, p[k] - used[k]); });
      if (!rows.length) { waiting(body, p); return; }
      body.appendChild(el('p', 'vv-lede', kfmt(total(used)) + ' out' + (total(home) ? ' · ' + kfmt(total(home)) + ' stay home' : '')));
      var list = el('div', 'vv-marches'); rows.forEach(function (r) { marchRow(r, name(r.destination), list); }); body.appendChild(list);
      var headquarters = E.hqRows(state.hq || E.emptyHQ()).find(function (r) { return r.playerId === p.id; });
      if (headquarters) {
        var hq = el('div', 'vv-hq'); hq.appendChild(el('p', 'vv-label', 'HQ · waves 10 & 20'));
        marchRow({ queue: headquarters.queue, destination: 'hq', infantry: headquarters.infantry, cavalry: headquarters.cavalry, archers: headquarters.archers }, 'Alliance HQ', hq, 'After wave 9 and 19: recall march ' + headquarters.queue + ', send this, return it after the hit.');
        body.appendChild(hq);
      }
      var actions = el('div', 'vv-actions'); actions.appendChild(button('Copy for game chat', 'copyInstructions', {}, 'vv-primary')); body.appendChild(actions);
      // Members see who covers them; how many troops is the sender's and the leader's business.
      var cover = []; Object.keys(state.assignments).forEach(function (sender) { (state.assignments[sender] || []).forEach(function (r) { if (r.destination === p.id && (r.infantry == null || total(r))) cover.push([name(sender), r.infantry == null ? null : total(r)]); }); });
      var section = el('div', 'vv-section'); section.appendChild(el('h3', '', 'Covering your city'));
      if (!cover.length) section.appendChild(el('p', 'vv-caption', 'Nobody yet.'));
      else { var ul = el('ul', 'vv-cover'); cover.forEach(function (c) { var li = el('li'); li.appendChild(el('span', '', c[0])); if (c[1] !== null) li.appendChild(el('span', 'vv-total', kfmt(c[1]))); ul.appendChild(li); }); section.appendChild(ul); }
      body.appendChild(section);
    }
    // The same tab for everyone who can sign up, leaders included.
    function personal() {
      var body = one('personal'); body.replaceChildren();
      one('start').hidden = !!state; one('calculator').hidden = !!state;
      if (!state || state.access === 'view') return;
      var mine = me();
      if (!mine) {
        body.appendChild(el('h2', '', 'In for ' + when() + '?'));
        if (state.access === 'registration') { body.appendChild(el('p', 'vv-flag', 'You’re no longer on the list. Ask your leader for the sign-up link.')); return; }
        if (state.plan.closed && !isManager()) { body.appendChild(el('p', 'vv-flag', 'Sign-ups are closed. Ask your leader to add you.')); return; }
        answer(body, null); return;
      }
      if (mine.attending === null) { body.appendChild(el('h2', '', 'In for ' + when() + '?')); body.appendChild(el('p', 'vv-lede', 'Your troops from last time. Change anything that’s moved.')); answer(body, mine); return; }
      if (mine.attending === false) {
        body.appendChild(el('h2', '', 'You’re out for ' + when())); var a = el('div', 'vv-actions'), back = button('I’m in after all', 'imIn', {}, 'vv-primary'); back.dataset.mutation = ''; a.appendChild(back); body.appendChild(a); return;
      }
      body.appendChild(el('h2', '', 'Your marches'));
      marchesFor(body, mine, true);
      var bring = el('div', 'vv-section'), top = el('div', 'vv-heading'); top.appendChild(el('h3', '', 'You’re bringing')); top.appendChild(button('Edit', 'editMine', {}, 'vv-quiet')); bring.appendChild(top);
      bring.appendChild(counts(mine)); bring.appendChild(el('p', 'vv-caption', mine.marches + ' marches' + (mine.capacities && mine.capacities.length ? '' : ' · up to ' + kfmt(mine.marchCapacity) + ' each'))); body.appendChild(bring);
      var leave = el('div', 'vv-actions'), out = button('Can’t make it', 'notIn', {}, 'vv-secondary'); out.dataset.mutation = ''; leave.appendChild(out); body.appendChild(leave);
    }
    function ago(iso) {
      var t = Date.parse(iso); if (!t) return '';
      var m = Math.max(0, Math.round((Date.now() - t) / 60000));
      return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago';
    }
    function routes(p) { return (state.assignments[p.id] || []).filter(function (r) { return r.destination && (r.infantry == null || total(r)); }); }
    // Who sends where, without troop counts: what members and viewers see of the alliance.
    function routeRow(p) {
      var line = el('div', 'vv-row vv-route' + (p.id === state.registrationId ? ' vv-mine' : '')), main = el('span', 'vv-row-main'), top = el('span', 'vv-row-top');
      line.appendChild(art('town-center', 40));
      top.appendChild(el('strong', '', p.nickname)); if (p.availability === 'offline') top.appendChild(el('span', 'vv-avail', 'Offline')); main.appendChild(top);
      var to = routes(p).map(function (r) { return name(r.destination); }), from = state.roster.filter(function (o) { return o.id !== p.id && routes(o).some(function (r) { return r.destination === p.id; }); }).map(function (o) { return o.nickname; });
      main.appendChild(el('span', 'vv-dim', (to.length ? 'Sends to ' + to.join(', ') : 'No marches yet') + (from.length ? ' · covered by ' + from.join(', ') : '')));
      line.appendChild(main); return line;
    }
    function playerRow(p, check, manage) {
      var sent = (state.assignments[p.id] || []).filter(function (r) { return r.destination && total(r); }).length, incoming = check.incoming[p.id] || [];
      var b = button('', 'assign', { id: p.id }, 'vv-row'); b.appendChild(art('town-center', 40));
      var main = el('span', 'vv-row-main'), top = el('span', 'vv-row-top'); top.appendChild(el('strong', '', p.nickname)); if (p.availability === 'offline') top.appendChild(el('span', 'vv-avail', 'Offline'));
      // Two players can share a name; when each last saved tells a leader which entry is which.
      if (p.updatedAt) { var stamp = el('span', 'vv-avail', ago(p.updatedAt)); stamp.title = 'Signed up ' + new Date(p.createdAt).toLocaleString() + ', last saved ' + new Date(p.updatedAt).toLocaleString(); top.appendChild(stamp); }
      main.appendChild(top);
      main.appendChild(el('span', 'vv-dim', kfmt(total(p)) + ' · sends ' + sent + '/' + p.marches + ' · covered by ' + incoming.length));
      if (manage && p.attending) { var gaps = []; if (!incoming.length) gaps.push('no cover'); if (sent < p.marches) gaps.push(p.marches - sent + ' free'); if (gaps.length) main.appendChild(el('span', 'vv-gap', gaps.join(' · '))); }
      b.appendChild(main); b.appendChild(el('span', 'vv-chevron', '›'));
      if (!manage || state.example) return b;
      var line = el('div', 'vv-row-line'), x = button('×', 'removePlayer', { id: p.id }, 'vv-row-x'); x.setAttribute('aria-label', 'Remove ' + p.nickname); x.title = 'Remove';
      line.appendChild(b); line.appendChild(x); return line;
    }
    function tally(container, items) { var dl = el('dl', 'vv-tally'); items.forEach(function (i) { var d = el('div'); d.appendChild(el('dt', '', i[0])); d.appendChild(el('dd', i[2] ? 'vv-short' : '', i[1])); dl.appendChild(d); }); container.appendChild(dl); }
    function group(body, title, id, people, check) {
      var d = el('details', 'vv-gaps'); d.id = id; d.appendChild(el('summary', '', title + ' · ' + people.length));
      var list = el('div', 'vv-rows vv-faint'); people.forEach(function (p) { list.appendChild(playerRow(p, check, true)); }); d.appendChild(list); body.appendChild(d);
    }
    function alliance() {
      var body = one('alliance'); body.replaceChildren();
      if (!state) { body.appendChild(button('Set up your alliance', 'create', {}, 'vv-primary')); return; }
      var inn = state.roster.filter(function (p) { return p.attending; }), waiting = state.roster.filter(function (p) { return p.attending === null; }), out = state.roster.filter(function (p) { return p.attending === false; });
      if (!isManager()) {
        body.appendChild(el('h2', '', 'In for ' + when()));
        var list = el('div', 'vv-rows'); inn.forEach(function (p) { list.appendChild(routeRow(p)); }); body.appendChild(list);
        if (!inn.length) body.appendChild(el('p', 'vv-caption', 'Nobody yet.'));
        return;
      }
      var check = E.validate(inn, state.assignments, state.hq);
      var queues = inn.reduce(function (n, p) { return n + p.marches; }, 0), sent = inn.reduce(function (n, p) { return n + (state.assignments[p.id] || []).filter(function (r) { return r.destination && total(r); }).length; }, 0);
      tally(body, [['In', String(inn.length)], ['Not yet', String(waiting.length), waiting.length > 0], ['Out', String(out.length)], ['Marches set', sent + '/' + queues, sent < queues]]);
      var codes = (credential && credential.codes) || {}, actions = el('div', 'vv-actions vv-lead');
      if (codes.join) actions.appendChild(button('Copy sign-up message', 'copy', { value: shareText('join', codes.join) }, 'vv-primary'));
      if (!state.example) actions.appendChild(button('Links', 'share', {}, 'vv-secondary'));
      if (actions.childNodes.length) body.appendChild(actions);
      if (check.errors.length) { var errs = el('ul', 'vv-problems'); check.errors.forEach(function (m) { errs.appendChild(el('li', '', m)); }); body.appendChild(errs); }
      var h = el('div', 'vv-heading'); h.appendChild(el('h2', '', 'In')); h.appendChild(button('Add a player', 'addPlayer', {}, 'vv-quiet')); body.appendChild(h);
      if (!inn.length) body.appendChild(el('p', 'vv-caption', 'Nobody yet.'));
      var rows = el('div', 'vv-rows'); inn.forEach(function (p) { rows.appendChild(playerRow(p, check, true)); }); body.appendChild(rows);
      if (waiting.length) group(body, 'Not answered yet', 'not-answered', waiting, check);
      if (out.length) group(body, 'Out', 'sitting-out', out, check);
      var hq = el('div', 'vv-section vv-hq-section'), hqHead = el('div', 'vv-hq-head'); hqHead.appendChild(hqMark()); var hqText = el('div'); hqText.appendChild(el('h3', '', 'HQ · waves 10 & 20'));
      hqText.appendChild(el('p', 'vv-dim', state.hq.participants.length ? state.hq.participants.length + ' players · ' + kfmt(state.hq.capacity) + ' · ' + state.hq.infantryPercent + '/' + state.hq.cavalryPercent + '/' + (100 - state.hq.infantryPercent - state.hq.cavalryPercent) : 'Not set')); hqHead.appendChild(hqText); hq.appendChild(hqHead);
      if (inn.length) hq.appendChild(button(state.hq.participants.length ? 'Change' : 'Set up', 'hq', {}, 'vv-quiet')); body.appendChild(hq);
      var tools = el('details', 'vv-tools'); tools.id = 'room-tools'; tools.appendChild(el('summary', '', 'More')); var t = el('div', 'vv-actions');
      t.appendChild(button('Settings', 'settings')); if (!state.example) { t.appendChild(button('Refresh', 'refresh')); t.appendChild(button('Delete', 'deletePlan', {}, 'vv-danger')); }
      tools.appendChild(t); body.appendChild(tools);
    }
    function render() {
      root.classList.toggle('vv-active', !!state);
      next(); bar(); personal(); alliance(); tab(mode);
    }
    function shareText(role, code) {
      var url = shareUrl(role, code);
      if (role === 'join') return 'Vikings' + (state.plan.eventAt ? ' ' + utcWhen(state.plan.eventAt) : '') + ': in? Tap and confirm your troops ' + url;
      if (role === 'view') return 'Vikings marches: ' + url;
      return url;
    }
    function share() {
      modal('Links', function (body) {
        var codes = (credential && credential.codes) || {};
        [['join', 'Sign-up', 'for alliance chat'], ['view', 'Viewing', 'who goes where'], ['manage', 'Leader', 'for R4s']].forEach(function (row) {
          var role = row[0], code = role === 'manage' ? credential.code : codes[role];
          var line = el('div', 'vv-share'), text = el('div'); text.appendChild(el('strong', '', row[1])); text.appendChild(el('span', 'vv-dim', row[2])); line.appendChild(text);
          var a = el('div', 'vv-share-actions');
          if (code) { if (role !== 'manage') a.appendChild(button('Replace', 'rotate', { role: role }, 'vv-quiet')); a.appendChild(button('Copy', 'copy', { value: shareText(role, code) }, role === 'join' ? 'vv-primary' : 'vv-secondary')); }
          else a.appendChild(button('New link', 'rotate', { role: role }, 'vv-secondary'));
          line.appendChild(a); body.appendChild(line);
        });
      });
    }
    async function submitForm(f) {
      if (!f.reportValidity()) return;
      var kind = f.dataset.kind, data;
      if (kind === 'room') {
        var raw = Object.fromEntries(new FormData(f));
        data = { name: raw.name.trim() || 'Vikings', eventDay: raw.day, eventTime: raw.time };
        if (state) data.closed = raw.closed === 'true';
        write(TIME, raw.time);
        if (state && state.example) { Object.assign(state.plan, data, { eventAt: new Date(E.nextEvent(data.eventDay, data.eventTime, Date.now())).toISOString() }); close(); render(); return; }
        if (state) { await request('/v1/plans/' + state.plan.id, 'PATCH', Object.assign(data, { revision: state.plan.revision })); await load(); close(); say('Saved.'); return; }
        var created = await request('/v1/plans', 'POST', Object.assign(data, { eventAt: null, closed: false }));
        credential = { planId: created.plan.id, code: created.codes.manage, codes: created.codes, role: 'manage', player: null };
        await load(); if (!persist()) say('This browser can’t save. Copy your leader link.', true);
        mode = 'alliance-plan'; render(); share(); return;
      }
      if (kind === 'player' || kind === 'answer') {
        data = fromForm(f); var playerId = f.dataset.id, previous = state.roster.find(function (p) { return p.id === playerId; });
        if (kind === 'answer') data.attending = true;
        var note = f.dataset.own !== undefined && !state.example ? syncBack(data) : '';
        if (state.example) {
          if (previous) Object.assign(previous, data); else state.roster.push(Object.assign({ id: id(), attending: true, revision: 1, notes: '', capacities: null }, data));
          close(); render(); say('Saved.'); return;
        }
        if (previous) { await savePlayer(previous, data); close(); say(note || (kind === 'answer' ? 'You’re in.' : 'Saved.')); return; }
        var response = await request('/v1/plans/' + state.plan.id + '/registrations', 'POST', Object.assign({ notes: '' }, data, { attending: true }));
        if (kind === 'answer') { credential.player = { id: response.registration.id, code: response.editCode }; persist(); await load(); close(); mode = 'my-plan'; render(); say(note || 'You’re in.'); return; }
        await load(); close(); say('Added.'); return;
      }
      if (kind === 'assignments') {
        var rows = [];
        f.querySelectorAll('[data-queue]').forEach(function (box) { var queue = Number(box.dataset.queue), row = { queue: queue, destination: f.elements['destination-' + queue].value || null }; TYPES.forEach(function (k) { row[k] = fromK(f.elements[k + '-' + queue].value); }); rows.push(row); });
        var check = E.validate(state.roster, { [f.dataset.id]: rows }, E.emptyHQ()); if (check.errors.length) throw new Error(check.errors[0]);
        if (state.example) { state.assignments[f.dataset.id] = rows; close(); render(); say('Saved.'); return; }
        await request('/v1/plans/' + state.plan.id + '/assignments/' + f.dataset.id, 'PUT', Object.assign(expected(), { marches: rows })); await load(); close(); say('Saved.'); return;
      }
      if (kind === 'hq') {
        data = new FormData(f); var hq = { capacity: count(f, 'capacity'), infantryPercent: Number(data.get('infantryPercent')), cavalryPercent: Number(data.get('cavalryPercent')), participants: data.getAll('participant').map(function (pid) { return { playerId: pid, queue: Number(data.get('queue-' + pid)) }; }) };
        if (hq.infantryPercent + hq.cavalryPercent > 100 || hq.participants.length > 15) throw new Error('Use a ratio up to 100% and at most 15 players.');
        if (state.example) { state.hq = hq; close(); render(); return; }
        await request('/v1/plans/' + state.plan.id + '/hq', 'PUT', Object.assign(expected(), { hq: hq })); await load(); close(); say('Saved.'); return;
      }
      if (kind === 'open') { var c = parseLink(f.elements.link.value); if (!c) throw new Error('Paste the whole link, starting with https.'); close(); await open(c, true); }
    }
    function parseLink(value) {
      var text = String(value || '').trim(), short = /#(?:lead|join|view|me)-([A-Za-z0-9_-]{22}|[A-Za-z0-9_-]{43})\s*$/.exec(text), long = /#access=([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})\s*$/.exec(text);
      if (short) return { planId: null, code: short[1] };
      if (long && UUID.test(long[1])) return { planId: long[1], code: long[2] };
      return null;
    }
    /* Your own troops follow the save on this device: read from it, and written back where the save has one tier
       of that troop. Guest mode (?guest) leaves the save alone. */
    function fromSave() {
      if (GUEST) return null;
      var troops; try { troops = context.ledger.combat().troops; } catch (_) { return null; }
      var out = { totals: {}, rows: {} }, any = false, map = { inf: 'infantry', cav: 'cavalry', arc: 'archers' };
      TYPES.forEach(function (k) { out.totals[k] = null; out.rows[k] = []; });
      troops.forEach(function (t) { var k = map[t.type]; if (!k || !Number.isFinite(t.amount)) return; out.totals[k] = (out.totals[k] || 0) + t.amount; out.rows[k].push(t); any = true; });
      return any ? out : null;
    }
    function syncBack(data) {
      var save = fromSave(), list = [], tiers = []; if (!save) return '';
      TYPES.forEach(function (k) {
        if (save.totals[k] === null || data[k] === save.totals[k]) return;
        if (save.rows[k].length === 1) { var t = save.rows[k][0]; list.push({ type: t.type, tier: t.tier, tg: t.tg, amount: data[k] }); } else tiers.push(LABELS[k].toLowerCase());
      });
      if (list.length) try { context.ledger.setCombat({ troops: list }, 'manual'); } catch (_) { return 'Your save couldn’t be updated.'; }
      return tiers.length ? 'Your save splits ' + tiers.join(' and ') + ' by tier, so change it there too.' : '';
    }
    function syncNote(container) {
      var line = el('p', 'vv-caption vv-sync'), here = location.pathname + location.search.replace(/[?&]guest(=[^&]*)?/, '').replace(/^&/, '?');
      if (GUEST) { line.appendChild(document.createTextNode('Guest mode: your saved troops aren’t used. ')); var back = el('a', '', 'Leave guest mode'); back.href = here; line.appendChild(back); }
      else if (fromSave()) { line.appendChild(document.createTextNode('Synced with your saved troops. ')); var go = el('a', '', 'Guest mode'); go.href = location.pathname + '?guest'; line.appendChild(go); }
      else return null;
      container.appendChild(line); return line;
    }
    function fillCalculator() {
      var f = one('calculatorForm'), save = fromSave(); if (!save) return;
      TYPES.forEach(function (k) { if (save.totals[k] !== null && document.activeElement !== f.elements[k]) f.elements[k].value = save.totals[k]; });
    }
    function demo() {
      credential = null;
      var plan = { id: id(), name: 'Vikings', eventDay: 'tue', eventTime: '20:00', closed: false };
      plan.eventAt = new Date(E.nextEvent('tue', '20:00', Date.now())).toISOString();
      state = { plan: plan, roster: [], assignments: {}, hq: E.emptyHQ(), access: 'manage', example: true };
      [['Rowan', true], ['Ash', true], ['Fern', true], ['Willow', true], ['Hazel', null], ['Birch', false]].forEach(function (r, i) { state.roster.push({ id: id(), nickname: r[0], attending: r[1], availability: i === 3 ? 'offline' : 'online', infantry: 240000, cavalry: 160000, archers: 120000, marchCapacity: 180000, marches: 3, capacities: null, notes: '', revision: 1 }); });
      var inn = state.roster.slice(0, 4);
      inn.forEach(function (p, i) { state.assignments[p.id] = E.split(p).rows.map(function (r, q) { return Object.assign({}, r, { destination: inn[(i + q + 1) % 4].id }); }); });
      state.hq = { capacity: 300000, infantryPercent: 75, cavalryPercent: 25, participants: inn.slice(0, 3).map(function (p) { return { playerId: p.id, queue: 1 }; }) };
      state.registrationId = state.roster[0].id; mode = 'alliance-plan'; render(); say('Example. You’re Rowan. Nothing is saved.');
    }
    function waves() {
      var body = one('waves');
      for (var w = 1; w <= 20; w++) { var kind = [10, 20].includes(w) ? 'hq' : [7, 14, 17].includes(w) ? 'online' : 'city'; var b = button(String(w), 'wave', { wave: w, kind: kind }); b.setAttribute('aria-pressed', w === 1 ? 'true' : 'false'); b.appendChild(el('small', '', kind === 'online' ? 'On' : kind === 'hq' ? 'HQ' : 'City')); body.appendChild(b); }
    }
    function home() { say(''); state = null; credential = null; pending = null; close(); mode = 'my-plan'; render(); }
    async function attend(value) { var mine = me(); if (!mine) return; await savePlayer(mine, { attending: value }); say(value ? 'You’re in.' : 'Marked out.'); }
    context.listen(one('dialog'), 'input', function (event) { var f = event.target.form; if (f && f.dataset.kind === 'room') localTime(f); if (f && f.dataset.kind === 'assignments') sends(f); });
    context.listen(root, 'keydown', function (event) { var tabs = Array.from(root.querySelectorAll('[role=tab]')), at = tabs.indexOf(event.target); if (at < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); var to = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (at + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; tabs[to].click(); tabs[to].focus(); });
    function schedule(delay) {
      clearTimeout(timer); timer = setTimeout(function () {
        if (disposed) return;
        if (!credential || !state || state.example || document.hidden || one('dialog').open || busy || root.querySelector('#my-plan form:focus-within')) return schedule(30000);
        run(async function () { try { var status = await request('/v1/plans/' + state.plan.id + '/status'); var signature = [state.plan.revision, state.plan.rosterRevision || 0, state.publicationRevision || 0, state.revision || 1, state.plan.eventAt || ''].join(':'); if (status.signature !== signature) await load(); schedule(30000); } catch (cause) { say('Offline. Showing the last copy.', true); schedule(90000); } });
      }, delay);
    }
    context.cleanup(function () { disposed = true; clearTimeout(timer); });
    function action(fn, events) { return { events: events || ['click'], run: function (node, event) { return run(function () { return fn(node, event); }); } }; }
    var actions = {
      tab: { run: function (node) { tab(node.dataset.tab); } },
      calculate: { events: ['submit'], preventDefault: true, run: function (f) { return run(function () {
        if (!f.reportValidity()) return; var raw = Object.fromEntries(new FormData(f)), p = { marches: Number(raw.marches) }; TYPES.concat('marchCapacity').forEach(function (k) { p[k] = count(f, k); });
        var result = E.split(p), box = one('split'); box.replaceChildren(); box.appendChild(el('p', 'vv-lede', kfmt(result.total) + ' out' + (total(result.home) ? ' · ' + kfmt(total(result.home)) + ' stay home' : '')));
        var list = el('div', 'vv-marches'); result.rows.forEach(function (r) { marchRow(r, 'March ' + r.queue, list); }); box.appendChild(list);
      }); } },
      submit: { events: ['submit'], preventDefault: true, run: function (f) { return run(function () { return submitForm(f); }); } },
      closeDialog: { run: function () { close(); } },
      create: action(function () { if (state) throw new Error('Switch first.'); roomEditor(); }),
      settings: action(roomEditor),
      demo: action(demo),
      open: action(function () { modal('Open a link', function (body) { var f = form(body, 'open'); var input = field(f, 'Link from your leader', 'link', '', 'url'); input.required = true; input.placeholder = 'https://dey.ci/vv/#join-…'; submit(foot(f), 'Open'); }); }),
      addPlayer: action(function () { playerEditor(null); }),
      editPlayer: action(function (node) { playerEditor(node.dataset.id); }),
      editMine: action(function () { playerEditor(state.registrationId, 'My troops', true); }),
      notIn: action(function () { return attend(false); }),
      imIn: action(function () { return attend(true); }),
      assign: action(function (node) { assignmentEditor(node.dataset.id); }),
      hq: action(hqEditor),
      fillMarches: action(function (node) { var p = state.roster.find(function (r) { return r.id === node.dataset.id; }), f = one('dialogBody').querySelector('form'); E.split(p).rows.forEach(function (r) { TYPES.forEach(function (k) { f.elements[k + '-' + r.queue].value = toK(r[k]); }); }); sends(f); }),
      share: action(share),
      copy: action(function (node) { return copy(node.dataset.value, 'Copied.'); }),
      copyInstructions: action(function () { return copy(E.instructions(state, state.registrationId), 'Copied.'); }),
      confirmSwitch: action(async function () { var c = pending; pending = null; close(); if (c) await open(c, true, true); }),
      keepCurrent: action(async function () { pending = null; close(); var c = stored(); if (c && !state) await open(c, false); }),
      rotate: action(function (node) { var role = node.dataset.role; modal('Replace the ' + (role === 'join' ? 'sign-up' : 'marches') + ' link?', function (body) { ask(body, 'The old link stops working.', 'Replace', 'confirmRotate', { role: role }, 'vv-primary'); }); }),
      confirmRotate: action(async function (node) { var result = await request('/v1/plans/' + state.plan.id + '/rotate', 'POST', { role: node.dataset.role }); credential.codes = credential.codes || {}; credential.codes[result.role] = result.code; persist(); render(); share(); }),
      removePlayer: action(function (node) { modal('Remove ' + name(node.dataset.id) + '?', function (body) { ask(body, 'Their troops, marches and link go too.', 'Remove', 'confirmRemove', { id: node.dataset.id }, 'vv-danger'); }); }),
      confirmRemove: action(async function (node) { if (state.example) { state.roster = state.roster.filter(function (p) { return p.id !== node.dataset.id; }); delete state.assignments[node.dataset.id]; close(); render(); return; } await request('/v1/plans/' + state.plan.id + '/registrations/' + node.dataset.id, 'DELETE'); await load(); close(); }),
      deletePlan: action(function () { modal('Delete ' + state.plan.name + '?', function (body) { ask(body, 'Removes it for everyone.', 'Delete for everyone', 'confirmDelete', {}, 'vv-danger'); }); }),
      confirmDelete: action(async function () { await request('/v1/plans/' + state.plan.id, 'DELETE'); drop(ALLIANCE); home(); say('Deleted.'); }),
      refresh: action(load),
      // Leaving forgets the alliance on this phone only; any sign-up stays on the alliance's list.
      leave: action(function () { if (state && state.example) { home(); return; } modal('Leave ' + state.plan.name + '?', function (body) { ask(body, 'It’s forgotten on this phone. Your sign-up stays on the list.', 'Leave', 'confirmLeave', {}, 'vv-primary'); }); }),
      confirmLeave: action(function () { drop(ALLIANCE); home(); }),
      wave: { run: function (node) { one('waves').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === node)); }); one('waveDetail').textContent = node.dataset.kind === 'hq' ? 'HQ wave ' + node.dataset.wave + ': send the agreed share after the wave before it. Return after the hit.' : node.dataset.kind === 'online' ? 'Wave ' + node.dataset.wave + ': online cities only.' : 'Wave ' + node.dataset.wave + ': every city.'; } }
    };
    one('calculatorForm').querySelector('[type=submit]').disabled = false;
    syncNote(one('calcUnits')); fillCalculator();
    try { context.cleanup(context.ledger.subscribe(function () { fillCalculator(); })); } catch (_) { /* no save on this page */ }
    waves();
    /* A link just followed wins; otherwise the alliance this phone keeps. */
    var initial = window.VikingsAccess, mine = stored();
    render();
    // The head script hides the start screen while a remembered plan opens, so the page doesn't jump.
    function settle() { document.documentElement.classList.remove('vv-opening'); }
    if (initial && CODE.test(initial.code) && (initial.planId === null || UUID.test(initial.planId))) run(async function () { try { await open(Object.assign({}, initial), !!initial.fromLink); } finally { settle(); } });
    else if (mine) run(async function () { try { await open(Object.assign({}, mine), false); } finally { settle(); } });
    else settle();
    schedule(30000);
    return { actions: actions, refresh: function () { if (!one('dialog').open) render(); } };
  });
})();
