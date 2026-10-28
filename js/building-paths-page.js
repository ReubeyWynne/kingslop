/* Building requirements: a goal ({building, level}) answered at once with every upgrade it takes,
   from BuildingPathsEngine.plan over the levels the reader has given. A level they have not given
   is assumed at the least their city can hold, and each building in the plan carries its own
   level picker, so the answer sharpens one building at a time.

   Levels are the shared save's buildings.levels (any building, numbered copies as house-1), so the
   Town Centre and Upgrade priority see them. ?guest, or a link carrying levels (have=), runs on a
   copy held in memory instead: the address bar then follows every edit and nothing reaches the
   save. The goal and construction speed live in the address only. */
(function () {
  'use strict';
  var E = window.BuildingPathsEngine, D = window.BuildingPaths;
  var GOALS = ['town-center', 'embassy', 'barracks', 'range', 'stable', 'command-center', 'infirmary', 'war-academy', 'academy'];
  var NAMES = { 'hero-hall': 'Hero Hall', watchtower: 'Watchtower' };
  var ICONS = { bread: 'img/items/bread.webp', wood: 'img/items/wood.webp', stone: 'img/items/stone.webp', iron: 'img/items/iron.webp', truegold: 'img/kingshot/truegold.png', 'tempered-truegold': 'img/items/tempered-truegold.webp' };
  var link = E.decode(D, location.search), params = new URLSearchParams(location.search);
  var guest = params.has('guest') || link.have !== null, guestLedger = null;

  if (guest) {
    window.Interactions.configure({ ledger: function () {
      if (guestLedger) return guestLedger;
      var Ledger = window.PlayerLedger, memory = {};
      if (link.have === null) try { memory[Ledger.KEY] = JSON.stringify(Ledger.shared().snapshot()); } catch (ignored) {}
      guestLedger = Ledger.create({ getItem: function (key) { return key in memory ? memory[key] : null; }, setItem: function (key, value) { memory[key] = String(value); } }, null);
      if (link.have && Object.keys(link.have).length) guestLedger.setBuildings(link.have, 'manual');
      return guestLedger;
    } });
  }

  window.Interactions.register('building-paths', function (context) {
    var api = context.api, store = null;
    try { store = context.ledger; store.snapshot(); } catch (cause) { store = null; }
    var memory = {};   // levels when no store can be read (storage blocked): this visit only
    var goal = { building: link.building || 'town-center', level: link.level || null }, speed = link.speed;
    if (speed === null) try { speed = Number(localStorage.getItem('bh:construction-speed')) || null; } catch (ignored) {}

    function one(key) { return context.targets(key)[0]; }
    function t(key, fallback, vars) { var text = api.tr('reqs.' + key, fallback); return vars ? api.fill(text, vars) : text; }
    function el(tag, cls, text) { var node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; }
    function have() {
      if (!store) return Object.assign({}, memory);
      var levels = (store.snapshot().buildings || {}).levels || {}, out = {};
      Object.keys(levels).forEach(function (k) { if (E.building(D, k)) out[k] = levels[k]; });
      return out;
    }
    function setLevel(k, value) {
      if (!store) { if (value === null) delete memory[k]; else memory[k] = value; return render(); }
      try { store.setBuilding(k, value, 'manual'); } catch (cause) { say(t('saveFailed', 'Could not save that level.')); }
      if (!store.subscribe) render();
    }
    function name(k) {
      var part = E.split(k), b = E.building(D, k), base = api.tr('town.building.' + part.id, (b && b.name) || NAMES[part.id] || part.id);
      return part.n ? t('numbered', '{building} {n}', { building: base, n: api.fmt(part.n) }) : base;
    }
    function levelName(k, id) {
      var b = E.building(D, k);
      if (b && b.single) return id === '0' ? t('notBuilt', 'not built') : t('built', 'built');
      return id === '0' ? t('notBuilt', 'not built') : id;
    }
    function compact(n) {
      try { return new Intl.NumberFormat((window.I18N && window.I18N.locale) || 'en-GB', { notation: 'compact', maximumFractionDigits: n >= 1e6 ? 2 : 1 }).format(n); } catch (ignored) { return api.fmt(n); }
    }
    function duration(seconds) {
      var s = E.atSpeed(seconds, speed || 0), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), parts = [];
      if (d) parts.push(t('days', '{n}d', { n: api.fmt(d) }));
      if (h) parts.push(t('hours', '{n}h', { n: api.fmt(h) }));
      if (m && !d) parts.push(t('minutes', '{n}m', { n: api.fmt(m) }));
      if (!parts.length) parts.push(t('seconds', '{n}s', { n: api.fmt(s % 60) }));
      return parts.join(' ');
    }
    function item(r) { return api.tr('priority.item.' + r, r); }
    function costList(list, total, small) {
      list.textContent = '';
      total.resources.forEach(function (r) {
        var li = el('li'), img = el('img');
        img.src = '../' + ICONS[r]; img.alt = ''; img.width = small ? 18 : 28; img.height = small ? 18 : 28; img.loading = 'lazy';
        li.appendChild(img);
        li.appendChild(el('b', '', compact(total.cost[r]) + (total.unverified[r] ? '†' : '')));
        li.appendChild(el('span', 'reqs-res', item(r)));
        li.title = api.fmt(total.cost[r]) + ' ' + item(r);
        list.appendChild(li);
      });
    }
    function timeText(total) {
      var text = duration(total.time) + (total.unverified.time ? '†' : '');
      return speed ? t('timeAt', '{time} at +{speed}% construction speed', { time: text, speed: api.fmt(speed) }) : t('timeBase', '{time} base time, before construction speed', { time: text });
    }
    function arrow() { return document.documentElement.dir === 'rtl' ? ' ← ' : ' → '; }
    function say(text) { one('copied').textContent = text; }

    function levelSelect(k, value, assumedAt) {
      var select = el('select'), b = E.building(D, k), unsure = el('option', '', t('unsure', 'not sure ({level})', { level: levelName(k, assumedAt) }));
      unsure.value = '';
      select.appendChild(unsure);
      select.appendChild(Object.assign(el('option', '', levelName(k, '0')), { value: '0' }));
      (b ? b.levels : []).forEach(function (l) { select.appendChild(Object.assign(el('option', '', levelName(k, l.id)), { value: l.id })); });
      select.value = value === undefined ? '' : value;
      select.dataset.building = k;
      select.setAttribute('data-action', 'building-paths.have');
      select.setAttribute('aria-label', t('yourLevel', 'Your {building} level', { building: name(k) }));
      return select;
    }

    function fillGoal() {
      var select = one('level'), b = E.building(D, goal.building), saved = have()[goal.building];
      one('building').value = goal.building;
      select.textContent = '';
      b.levels.forEach(function (l, i) { if (i || b.levels.length === 1) select.appendChild(Object.assign(el('option', '', l.id), { value: l.id })); });
      if (!goal.level || E.levels(D, goal.building).indexOf(goal.level) < 0) {
        var list = E.levels(D, goal.building), at = saved ? list.indexOf(saved) : -1;
        goal.level = list[Math.min(list.length - 1, Math.max(1, at + 1))];
      }
      select.value = goal.level;
    }

    function address(withLevels) {
      var state = { building: goal.building, level: goal.level, speed: speed };
      if (withLevels) { var h = have(), keep = E.involved(D, goal); state.have = {}; keep.forEach(function (k) { if (h[k] !== undefined) state.have[k] = h[k]; }); }
      return E.encode(state);
    }
    function syncAddress() {
      var kept = new URLSearchParams(location.search);
      ['b', 'to', 'have', 'speed'].forEach(function (k) { kept.delete(k); });
      var rest = kept.toString().replace(/(^|&)guest=(&|$)/, '$1guest$2');
      try { history.replaceState(history.state, '', location.pathname + '?' + (rest ? rest + '&' : '') + address(guest) + location.hash); } catch (ignored) {}
    }

    function render() {
      if (!E.building(D, goal.building)) return;
      var levels = have(), result = E.plan(D, goal, levels), head = one('headline'), rows = one('summary'), steps = one('steps');
      var goalName = name(goal.building) + ' ' + levelName(goal.building, goal.level);
      rows.textContent = ''; steps.textContent = '';
      if (result.state === 'met') {
        head.textContent = t('met', 'Your {goal} is already done.', { goal: goalName });
        costList(one('total'), result.total); one('time').textContent = '';
      } else {
        head.textContent = t('headline', '{goal} · upgrades: {n}', { goal: goalName, n: api.fmt(result.total.steps) });
        costList(one('total'), result.total);
        one('time').textContent = timeText(result.total);
      }
      // One row per building the plan raises, plus any level the reader gave that the goal's
      // path names, so a level set too high can be set back. Prerequisites first, the goal last.
      var keys = [], want = result.want || {}, involved = E.involved(D, goal);
      (result.runs || []).forEach(function (r) { if (keys.indexOf(r.building) < 0 && r.building !== goal.building) keys.push(r.building); });
      involved.forEach(function (k) { if (levels[k] !== undefined && keys.indexOf(k) < 0 && k !== goal.building) keys.push(k); });
      keys.push(goal.building);
      keys.forEach(function (k) {
        var li = el('li', 'reqs-run'), at = result.current[k] || '0', to = want[k], row = el('div', 'reqs-run-head');
        var mine = E.steps(D, k, at, to || at);
        li.dataset.state = !to || E.rank(to) <= E.rank(at) ? 'done' : levels[k] === undefined ? 'assumed' : 'known';
        row.appendChild(el('b', 'reqs-run-name', name(k)));
        var pick = el('span', 'reqs-run-levels');
        pick.appendChild(levelSelect(k, levels[k], at));
        pick.appendChild(el('span', 'reqs-arrow', li.dataset.state === 'done' ? '✓' : arrow().trim() + ' ' + levelName(k, to)));
        row.appendChild(pick);
        li.appendChild(row);
        if (li.dataset.state === 'assumed') li.appendChild(el('small', 'reqs-assumed', t('assumed', 'assumed: the least your city can have. Set yours to sharpen the plan.')));
        if (mine.length) {
          var sub = E.total(mine);
          var costs = el('ul', 'reqs-cost reqs-cost-small');
          costList(costs, sub, true);
          li.appendChild(costs);
          if (sub.time) li.appendChild(el('small', 'reqs-run-time', duration(sub.time) + (sub.unverified.time ? '†' : '')));
        }
        rows.appendChild(li);
      });
      (result.runs || []).forEach(function (r) {
        var li = el('li', '', name(r.building) + ' ' + levelName(r.building, r.from) + arrow() + levelName(r.building, r.level));
        li.appendChild(el('small', '', ' · ' + duration(r.total.time)));
        steps.appendChild(li);
      });
      (result.blocked || []).forEach(function (b) { steps.appendChild(el('li', 'reqs-blocked', name(b.building) + ' ' + b.level + ' · ' + t('blocked', 'no source lists what this step needs'))); });
      var flag = one('flag'), any = Object.keys(result.total.unverified || {}).length;
      flag.hidden = !any;
      flag.textContent = any ? t('oneSource', '† Only one source gives this figure.') : '';
      var add = one('addGoal');
      add.hidden = guest || !store || GOALS.indexOf(goal.building) < 0 || result.state === 'met';
      one('guestBanner').hidden = !guest;
      one('guestEnter').hidden = guest;
      one('guestEnter').href = '?' + address(false) + '&guest';
      one('guestLeave').href = '?' + address(false);
      one('saveNote').textContent = guest ? t('guestNote', 'Guest mode: levels stay on this page.') : store ? t('savedNote', 'Levels you set are saved on this device, and the Town Centre and Upgrade priority use them.') : '';
      syncAddress();
    }

    function copy(text) {
      var url = new URL(location.pathname + '?' + text, location.href).href;
      function done() { say(t('copied', 'Link copied.')); }
      try { navigator.clipboard.writeText(url).then(done, function () { say(url); }); } catch (ignored) { say(url); }
    }

    if (store && store.subscribe) context.cleanup(store.subscribe(function () { render(); }));
    ['building', 'level', 'speed'].forEach(function (k) { one(k).disabled = false; });
    if (speed) one('speed').value = String(speed);
    fillGoal();

    return {
      refresh: function () { fillGoal(); render(); },
      actions: {
        goal: { events: ['change'], run: function (node) {
          if (node === one('building')) { goal.building = node.value; goal.level = null; fillGoal(); }
          else goal.level = node.value;
          render();
        } },
        have: { events: ['change'], run: function (node) { setLevel(node.dataset.building, node.value === '' ? null : node.value); } },
        speed: { events: ['change'], run: function (node) {
          var n = Number(node.value);
          speed = node.value !== '' && isFinite(n) && n > 0 && n <= 1000 ? n : null;
          try { if (!guest) { if (speed) localStorage.setItem('bh:construction-speed', String(speed)); else localStorage.removeItem('bh:construction-speed'); } } catch (ignored) {}
          render();
        } },
        copy: { run: function () { copy(address(false)); } },
        copyLevels: { run: function () { copy(address(true)); } },
        addGoal: { run: function () {
          var goals = store.priority().goals.filter(function (g) { return !(g.kind === 'building' && g.target === goal.building); });
          goals.push({ kind: 'building', target: goal.building, level: goal.level });
          try { store.setPriorityGoals(goals); say(t('goalAdded', 'Added to your goals on Upgrade priority.')); } catch (cause) { say(t('saveFailed', 'Could not save that.')); }
        } }
      }
    };
  });
}());
