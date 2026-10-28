/* Building requirements: a goal (one or more {building, level}) answered at once with every upgrade it takes,
   from BuildingPathsEngine.plan over the levels the reader has given. A level they have not given
   is assumed at the least their city can hold. The goal is a strip of building tiles; the plan is
   one card per building with its art, its level and the level it must reach. Tapping a level opens
   one small grid of levels (no long select), so the answer sharpens one building at a time.

   Levels are the shared save's buildings.levels (any building, numbered copies as house-1), so the
   Town Centre and Upgrade priority see them. ?guest, or a link carrying levels (have=), runs on a
   copy held in memory instead: the address bar then follows every edit and nothing reaches the
   save. The guest switch beside the goal reloads the page into or out of it. The goals and
   construction speed live in the address only. */
(function () {
  'use strict';
  var E = window.BuildingPathsEngine, D = window.BuildingPaths;
  var PLANNED = ['town-center', 'embassy', 'barracks', 'range', 'stable', 'command-center', 'infirmary', 'war-academy', 'academy'];
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
    var goals = link.goals.length ? link.goals : [{ building: 'town-center', level: null }], speed = link.speed;
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

    function art(k) {
      var img = el('img');
      img.src = '../img/buildings/' + E.split(k).id + '.webp'; img.alt = ''; img.width = 128; img.height = 128; img.loading = 'lazy'; img.decoding = 'async';
      return img;
    }
    // A level as a button that opens the level grid: kind 'have' (the reader's own, '?' while
    // assumed) or 'goal' (a goal's level).
    function levelButton(kind, k, text, label, extra) {
      var button = el('button', 'reqs-lv', text);
      button.type = 'button'; button.dataset.kind = kind; button.dataset.building = k;
      button.setAttribute('data-action', 'building-paths.open');
      button.setAttribute('aria-label', label);
      Object.keys(extra || {}).forEach(function (x) { button.dataset[x] = extra[x]; });
      return button;
    }

    // The level after the one the save holds, else the second level on the path.
    function nextLevel(k) {
      var list = E.levels(D, k), saved = have()[k], at = saved ? list.indexOf(saved) : -1;
      return list[Math.min(list.length - 1, Math.max(1, at + 1))];
    }
    // The goal tiles: pressed for each goal, with the goal level on its badge.
    function fillGoals() {
      goals.forEach(function (g) { if (!g.level || E.levels(D, g.building).indexOf(g.level) < 0) g.level = nextLevel(g.building); });
      one('picks').querySelectorAll('.reqs-pick').forEach(function (tile) {
        var g = goals.find(function (x) { return x.building === tile.dataset.building; });
        tile.disabled = false;
        tile.setAttribute('aria-pressed', String(!!g));
        tile.querySelector('.reqs-badge').textContent = g ? E.short(g.level) : '';
      });
      one('guest').setAttribute('aria-checked', String(guest));
    }

    // The level grid. Up to 30 levels show at once; past that, one tab for levels 1–30 (and 30-1…30-4)
    // and one per TG, so every level is two taps away at most and nothing scrolls.
    var picking = null;
    function tier(id) { var m = /^TG ?(\d+)/.exec(id); return m ? Number(m[1]) : 0; }
    function fillPicker() {
      var k = picking.building, list = E.levels(D, k).slice(1), now = picking.value, tiers = [], grid = one('grid'), bar = one('tiers'), extra = one('pickerExtra');
      list.forEach(function (id) { if (tiers.indexOf(tier(id)) < 0) tiers.push(tier(id)); });
      if (picking.tier === undefined) picking.tier = now && now !== '0' ? tier(now) : 0;
      bar.textContent = ''; grid.textContent = ''; extra.textContent = '';
      bar.hidden = tiers.length < 2;
      if (tiers.length > 1) tiers.forEach(function (n) {
        var tab = el('button', '', n ? 'TG' + n : '1–30');
        tab.type = 'button'; tab.dataset.tier = n; tab.setAttribute('aria-pressed', String(n === picking.tier));
        tab.setAttribute('data-action', 'building-paths.tier');
        bar.appendChild(tab);
      });
      function choice(value, text, cls) {
        var button = el('button', cls || '', text);
        button.type = 'button'; button.dataset.level = value; button.setAttribute('aria-pressed', String(value === now));
        button.setAttribute('data-action', 'building-paths.choose');
        return button;
      }
      if (picking.kind === 'have') {
        extra.appendChild(choice('', t('unsureShort', 'not sure'), 'reqs-wide'));
        extra.appendChild(choice('0', levelName(k, '0'), 'reqs-wide'));
      }
      list.filter(function (id) { return tiers.length < 2 || tier(id) === picking.tier; }).forEach(function (id) { grid.appendChild(choice(id, E.building(D, k).single ? levelName(k, id) : E.short(id))); });
    }
    function openPicker(kind, k, value, index) {
      picking = { kind: kind, building: k, value: value, index: index };
      one('pickerTitle').textContent = kind === 'goal' ? t('goalLevel', '{building} goal level', { building: name(k) }) : t('yourLevel', 'Your {building} level', { building: name(k) });
      var box = one('pickerArt'); box.textContent = ''; box.appendChild(art(k));
      fillPicker();
      var dialog = one('picker');
      if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); } else dialog.setAttribute('open', '');
      var on = dialog.querySelector('.reqs-grid [aria-pressed="true"], .reqs-picker-extra [aria-pressed="true"]');
      (on || dialog.querySelector('.reqs-grid button')).focus();
    }
    function closePicker() {
      var dialog = one('picker'), back = picking;
      picking = null;
      if (typeof dialog.close === 'function' && dialog.open) dialog.close(); else dialog.removeAttribute('open');
      if (back) {
        var again = one('summary').querySelector('.reqs-lv[data-kind="' + back.kind + '"][data-building="' + back.building + '"]');
        if (again) again.focus();
      }
    }

    function address(withLevels) {
      var state = { goals: goals, speed: speed };
      if (withLevels) { var h = have(), keep = E.involved(D, goals); state.have = {}; keep.forEach(function (k) { if (h[k] !== undefined) state.have[k] = h[k]; }); }
      return E.encode(state);
    }
    function syncAddress() {
      var kept = new URLSearchParams(location.search);
      ['b', 'to', 'goal', 'have', 'speed'].forEach(function (k) { kept.delete(k); });
      var rest = kept.toString().replace(/(^|&)guest=(&|$)/, '$1guest$2');
      try { history.replaceState(history.state, '', location.pathname + '?' + (rest ? rest + '&' : '') + address(guest) + location.hash); } catch (ignored) {}
    }

    function render() {
      var levels = have(), result = E.plan(D, goals, levels), head = one('headline'), rows = one('summary'), steps = one('steps');
      if (result.state === 'unknown') return;
      var mine = {}, goalName = result.goals.map(function (g) { mine[g.building] = true; return name(g.building) + ' ' + levelName(g.building, g.level); }).join(' + ');
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
      var keys = [], want = result.want || {}, involved = E.involved(D, goals);
      (result.runs || []).forEach(function (r) { if (keys.indexOf(r.building) < 0 && !mine[r.building]) keys.push(r.building); });
      involved.forEach(function (k) { if (levels[k] !== undefined && keys.indexOf(k) < 0 && !mine[k]) keys.push(k); });
      result.goals.forEach(function (g) { keys.push(g.building); });
      keys.forEach(function (k) {
        var li = el('li', 'reqs-run'), at = result.current[k] || '0', to = want[k], body = el('div', 'reqs-run-body');
        var part = E.steps(D, k, at, to || at), goalAt = goals.findIndex(function (g) { return g.building === k; });
        li.dataset.state = !to || E.rank(to) <= E.rank(at) ? 'done' : levels[k] === undefined ? 'assumed' : 'known';
        var box = el('span', 'reqs-art'); box.appendChild(art(k)); li.appendChild(box);
        var head = el('p', 'reqs-run-head');
        head.appendChild(el('b', 'reqs-run-name', name(k)));
        if (goalAt >= 0) { li.dataset.goal = ''; head.appendChild(el('span', 'reqs-tag', t('goalTag', 'goal'))); }
        body.appendChild(head);
        var pick = el('p', 'reqs-run-levels'), known = levels[k] !== undefined;
        pick.appendChild(levelButton('have', k, levelName(k, known ? levels[k] : at) + (known ? '' : '?'), t('yourLevel', 'Your {building} level', { building: name(k) }) + ': ' + (known ? levelName(k, levels[k]) : t('unsure', 'not sure ({level})', { level: levelName(k, at) })), { value: known ? levels[k] : '' }));
        if (goalAt >= 0) {
          pick.appendChild(el('span', 'reqs-arrow', li.dataset.state === 'done' ? '✓' : arrow().trim()));
          pick.appendChild(levelButton('goal', k, levelName(k, goals[goalAt].level), t('goalLevel', '{building} goal level', { building: name(k) }) + ': ' + levelName(k, goals[goalAt].level), { value: goals[goalAt].level, index: String(goalAt) }));
          pick.lastChild.classList.add('reqs-lv-goal');
        } else pick.appendChild(el('span', 'reqs-arrow', li.dataset.state === 'done' ? '✓' : arrow().trim() + ' ' + levelName(k, to)));
        body.appendChild(pick);
        if (part.length) {
          var sub = E.total(part), costs = el('ul', 'reqs-cost reqs-cost-small');
          costList(costs, sub, true);
          if (sub.time) costs.appendChild(el('li', 'reqs-run-time', duration(sub.time) + (sub.unverified.time ? '†' : '')));
          body.appendChild(costs);
        }
        li.appendChild(body);
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
      add.hidden = guest || !store || !result.goals.some(function (g) { return PLANNED.indexOf(g.building) >= 0; }) || result.state === 'met';
      one('guestBanner').hidden = !guest;
      one('saveNote').textContent = guest ? t('guestNote', 'Guest mode: levels stay on this page.') : store ? t('savedNote', 'Levels you set are saved on this device, and the Town Centre and Upgrade priority use them.') : '';
      syncAddress();
    }

    function copy(text) {
      var url = new URL(location.pathname + '?' + text, location.href).href;
      function done() { say(t('copied', 'Link copied.')); }
      try { navigator.clipboard.writeText(url).then(done, function () { say(url); }); } catch (ignored) { say(url); }
    }

    if (store && store.subscribe) context.cleanup(store.subscribe(function () { render(); }));
    one('picker').addEventListener('close', function () { picking = null; });
    // A tap on the backdrop (the dialog box itself, outside its content) closes the grid.
    one('picker').addEventListener('click', function (event) { if (event.target === event.currentTarget) closePicker(); });
    ['speed', 'guest'].forEach(function (k) { one(k).disabled = false; });
    if (speed) one('speed').value = String(speed);
    fillGoals();

    return {
      refresh: function () { fillGoals(); render(); },
      actions: {
        pick: { run: function (node) {
          var k = node.dataset.building, at = goals.findIndex(function (g) { return g.building === k; });
          if (at < 0) goals.push({ building: k, level: null });
          else if (goals.length > 1) goals.splice(at, 1);
          else return openPicker('goal', k, goals[at].level, at);
          fillGoals(); render();
        } },
        open: { run: function (node) { openPicker(node.dataset.kind, node.dataset.building, node.dataset.value, node.dataset.index === undefined ? null : Number(node.dataset.index)); } },
        tier: { run: function (node) { if (!picking) return; picking.tier = Number(node.dataset.tier); fillPicker(); var first = one('grid').querySelector('button'); if (first) first.focus(); } },
        choose: { run: function (node) {
          if (!picking) return;
          var p = picking, value = node.dataset.level;
          closePicker();
          if (p.kind === 'goal') { goals[p.index].level = value; fillGoals(); render(); }
          else setLevel(p.building, value === '' ? null : value);
          var again = one('summary').querySelector('.reqs-lv[data-kind="' + p.kind + '"][data-building="' + p.building + '"]');
          if (again) again.focus();
        } },
        close: { run: closePicker },
        guest: { run: function () {
          // Guest mode is chosen before the page's modules mount, so the switch reloads the
          // page into or out of it with the same goals; leaving drops the link's levels.
          var kept = new URLSearchParams(location.search);
          ['b', 'to', 'goal', 'have', 'speed', 'guest'].forEach(function (k) { kept.delete(k); });
          var rest = kept.toString();
          location.assign(location.pathname + '?' + (rest ? rest + '&' : '') + address(false) + (guest ? '' : '&guest') + location.hash);
        } },
        speed: { events: ['change'], run: function (node) {
          var n = Number(node.value);
          speed = node.value !== '' && isFinite(n) && n > 0 && n <= 1000 ? n : null;
          try { if (!guest) { if (speed) localStorage.setItem('bh:construction-speed', String(speed)); else localStorage.removeItem('bh:construction-speed'); } } catch (ignored) {}
          render();
        } },
        copy: { run: function () { copy(address(false)); } },
        copyLevels: { run: function () { copy(address(true)); } },
        addGoal: { run: function () {
          var mineNow = E.goals(D, goals).filter(function (g) { return PLANNED.indexOf(g.building) >= 0; });
          var list = store.priority().goals.filter(function (g) { return !(g.kind === 'building' && mineNow.some(function (m) { return m.building === g.target; })); });
          mineNow.forEach(function (g) { list.push({ kind: 'building', target: g.building, level: g.level }); });
          try { store.setPriorityGoals(list); say(t('goalAdded', 'Added to your goals on Upgrade priority.')); } catch (cause) { say(t('saveFailed', 'Could not save that.')); }
        } }
      }
    };
  });
}());
