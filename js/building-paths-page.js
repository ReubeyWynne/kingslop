/* Building requirements: a goal (one or more {building, level}) answered at once with every upgrade it takes,
   from BuildingPathsEngine.plan over the levels the reader has given. A level they have not given
   is assumed at the least their city can hold. The goal is a strip of building tiles; the plan is
   one card per building with its art, its level and the level it must reach. Tapping a level opens
   one small grid of levels (no long select), so the answer sharpens one building at a time.

   Levels are the shared save's buildings.levels (any building, numbered copies as house-1), so the
   Town Centre and Upgrade priority see them. ?guest, or a link carrying levels (have=), runs on a
   copy held in memory instead: the address bar then follows every edit and nothing reaches the
   save. The guest switch beside the goal reloads the page into or out of it. The goals and the
   construction speed settings ride in the address and, outside guest mode, are kept on this
   device (bh:building-goals, bh:construction) so the page opens as it was left. */
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
    function stored(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (ignored) { return null; } }
    function keep(key, value) { if (!guest) try { localStorage.setItem(key, JSON.stringify(value)); } catch (ignored) {} }
    var lastGoals = Array.isArray(stored('bh:building-goals')) ? E.goals(D, stored('bh:building-goals').map(function (x) { return Array.isArray(x) ? { building: x[0], level: x[1] } : null; })) : [];
    var goals = link.goals.length ? link.goals : lastGoals.length ? lastGoals : [{ building: 'town-center', level: null }];
    // Construction speed: the Bonus Overview figure or its parts, the boosts running when an upgrade
    // starts, and Pan's Master Architect level (from the save's Masters when it is not set here).
    var cs = { mode: 'overview', overview: null, vip: 0, saul: 0, research: null, wolf: 0, position: '', groundWorks: false, kvk: false, doubleTime: false, pan: null };
    if (link.speed !== null || link.doubleTime || link.pan !== null) Object.assign(cs, { overview: link.speed, doubleTime: link.doubleTime, pan: link.pan });
    else {
      var savedSpeed = stored('bh:construction');
      if (savedSpeed && typeof savedSpeed === 'object') Object.keys(cs).forEach(function (k) { if (k in savedSpeed) cs[k] = savedSpeed[k]; });
      else cs.overview = Number(stored('bh:construction-speed')) || null;
    }
    if (cs.pan === null && store) try {
      var architect = ((((store.snapshot().masters || {}).roster || {}).pan || {}).skills || [])[2];
      if (architect > 0) cs.pan = Math.min(5, architect);
    } catch (ignored) {}

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
    function duration(s) {
      var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), parts = [];
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
    function boosts() {
      var b = E.boost(cs), out = [];
      if (b.speed) out.push('+' + api.fmt(b.speed) + '%');
      if (b.doubleTime) out.push(t('doubleTime', 'Double Time'));
      if (b.pan) out.push(t('panShort', 'Pan −{h}h', { h: api.fmt(b.pan) }));
      return out.join(' · ');
    }
    function timeText(total, steps) {
      var text = duration(E.timed(steps, E.boost(cs)).time) + (total.unverified.time ? '†' : ''), list = boosts();
      return list ? t('timeWith', '{time} with {boosts}', { time: text, boosts: list }) : t('timeBase', '{time} base time, before construction speed', { time: text });
    }
    function stepTime(steps) { return duration(E.timed(steps, E.boost(cs)).time); }
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
      keep('bh:building-goals', goals.map(function (g) { return [g.building, g.level]; }));
    }

    // The construction speed panel: a choice of where the base figure comes from, then one row of
    // chips per boost. Every chip is a button; the two figures are number fields.
    function chip(key, value, text, on, label) {
      var b = el('button', '', text);
      b.type = 'button'; b.dataset.key = key; b.dataset.value = String(value);
      b.setAttribute('data-action', 'building-paths.set'); b.setAttribute('aria-pressed', String(on));
      if (label) b.setAttribute('aria-label', label);
      return b;
    }
    function group(name, chips) { var box = one('speedMode').parentNode.querySelector('[data-boost="' + name + '"]'); box.textContent = ''; chips.forEach(function (c) { box.appendChild(c); }); }
    function fillSpeed() {
      var none = t('none', 'none'), mode = one('speedMode');
      mode.textContent = '';
      mode.appendChild(chip('mode', 'overview', t('speedFrom', 'Bonus Overview'), cs.mode !== 'parts'));
      mode.appendChild(chip('mode', 'parts', t('speedAddUp', 'Add it up'), cs.mode === 'parts'));
      one('overview').hidden = cs.mode === 'parts'; one('parts').hidden = cs.mode !== 'parts';
      if (document.activeElement !== one('speed')) one('speed').value = cs.overview === null ? '' : String(cs.overview);
      var research = one('parts').querySelector('[data-field="research"]');
      if (document.activeElement !== research) research.value = cs.research === null ? '' : String(cs.research);
      group('vip', [chip('vip', 0, '—', !cs.vip, none), chip('vip', 4, 'VIP 4–8 · +10%', cs.vip === 4), chip('vip', 9, 'VIP 9+ · +20%', cs.vip === 9)]);
      group('saul', E.BOOST.saul.map(function (p, i) { return chip('saul', i, i ? '+' + api.fmt(p) + '%' : '—', (cs.saul || 0) === i, i ? t('skillLevel', 'level {n}', { n: i }) + ', +' + p + '%' : none); }));
      group('wolf', E.BOOST.wolf.map(function (p, i) { return chip('wolf', i, i ? '+' + api.fmt(p) + '%' : '—', (cs.wolf || 0) === i, i ? t('skillLevel', 'level {n}', { n: i }) + ', +' + p + '%' : none); }));
      var minister = api.tr('town.training.minister', 'Chief Minister');
      group('position', [chip('position', '', '—', !cs.position, none), chip('position', 'minister', minister + ' · +10%', cs.position === 'minister'),
        chip('position', 'highKing', minister + ' + ' + api.tr('town.training.highKing', 'High King') + ' · +15%†', cs.position === 'highKing')]);
      group('toggles', [['groundWorks', t('groundWorks', 'Ground Works') + ' · +10%'], ['kvk', 'KvK · +5%'], ['doubleTime', t('doubleTime', 'Double Time') + ' · −20%']].map(function (x) {
        var b = chip(x[0], '', x[1], !!cs[x[0]]); b.setAttribute('data-action', 'building-paths.toggle'); return b;
      }));
      group('pan', E.BOOST.pan.map(function (h, i) { return chip('pan', i, i ? '−' + api.fmt(h) + 'h' : '—', (cs.pan || 0) === i, i ? t('skillLevel', 'level {n}', { n: i }) + ', −' + h + 'h' : none); }));
      fillSpeedSum();
    }
    function fillSpeedSum() { var list = boosts(); one('speedSum').textContent = list ? '(' + list + ')' : ''; }
    function speedChanged() { keep('bh:construction', cs); fillSpeed(); render(); }

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
      } else if (goals.length > 1) {
        var drop = el('button', 'reqs-drop', t('removeFromGoal', 'Remove from goal'));
        drop.type = 'button'; drop.setAttribute('data-action', 'building-paths.drop');
        extra.appendChild(drop);
      }
      list.filter(function (id) { return tiers.length < 2 || tier(id) === picking.tier; }).forEach(function (id) { grid.appendChild(choice(id, E.building(D, k).single ? levelName(k, id) : E.short(id))); });
    }
    function openPicker(kind, k, value, index, fromTile) {
      picking = { kind: kind, building: k, value: value, index: index, fromTile: !!fromTile };
      one('pickerTitle').textContent = kind === 'goal' ? t('goalLevel', '{building} goal level', { building: name(k) }) : t('yourLevel', 'Your {building} level', { building: name(k) });
      var box = one('pickerArt'); box.textContent = ''; box.appendChild(art(k));
      fillPicker();
      var dialog = one('picker');
      if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); } else dialog.setAttribute('open', '');
      var on = dialog.querySelector('.reqs-grid [aria-pressed="true"], .reqs-picker-extra [aria-pressed="true"]');
      (on || dialog.querySelector('.reqs-grid button')).focus();
    }
    function choose(value) {
      if (!picking) return;
      var p = picking;
      closePicker();
      if (p.kind === 'goal') { goals[p.index].level = value; fillGoals(); render(); }
      else setLevel(p.building, value === '' ? null : value);
      if (p.fromTile) return;
      var again = one('summary').querySelector('.reqs-lv[data-kind="' + p.kind + '"][data-building="' + p.building + '"]');
      if (again) again.focus();
    }
    function closePicker() {
      var dialog = one('picker'), back = picking;
      picking = null;
      if (typeof dialog.close === 'function' && dialog.open) dialog.close(); else dialog.removeAttribute('open');
      if (back && back.fromTile) { var tile = one('picks').querySelector('.reqs-pick[data-building="' + back.building + '"]'); if (tile) tile.focus(); }
      else if (back) {
        var again = one('summary').querySelector('.reqs-lv[data-kind="' + back.kind + '"][data-building="' + back.building + '"]');
        if (again) again.focus();
      }
    }

    function address(withLevels) {
      var b = E.boost(cs), state = { goals: goals, speed: b.speed, doubleTime: b.doubleTime, pan: cs.pan || 0 };
      if (withLevels) { var h = have(), named = E.involved(D, goals); state.have = {}; named.forEach(function (k) { if (h[k] !== undefined) state.have[k] = h[k]; }); }
      return E.encode(state);
    }
    function syncAddress() {
      var kept = new URLSearchParams(location.search);
      ['b', 'to', 'goal', 'have', 'speed', 'dt', 'pan'].forEach(function (k) { kept.delete(k); });
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
        one('time').textContent = timeText(result.total, result.steps.map(function (x) { return x.step; }));
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
          if (sub.time) costs.appendChild(el('li', 'reqs-run-time', stepTime(part) + (sub.unverified.time ? '†' : '')));
          body.appendChild(costs);
        }
        li.appendChild(body);
        rows.appendChild(li);
      });
      (result.runs || []).forEach(function (r) {
        var li = el('li', '', name(r.building) + ' ' + levelName(r.building, r.from) + arrow() + levelName(r.building, r.level));
        li.appendChild(el('small', '', ' · ' + stepTime(r.steps)));
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
    fillGoals();
    fillSpeed();

    return {
      refresh: function () { fillGoals(); render(); },
      actions: {
        // A tile opens its goal level at once: a new building joins the goal first, one already
        // in it can be removed from the grid.
        pick: { run: function (node) {
          var k = node.dataset.building, at = goals.findIndex(function (g) { return g.building === k; });
          if (at < 0) { goals.push({ building: k, level: null }); at = goals.length - 1; fillGoals(); render(); }
          openPicker('goal', k, goals[at].level, at, true);
        } },
        drop: { run: function () {
          if (!picking || goals.length < 2) return;
          var index = picking.index;
          closePicker();
          goals.splice(index, 1);
          fillGoals(); render();
        } },
        open: { run: function (node) { openPicker(node.dataset.kind, node.dataset.building, node.dataset.value, node.dataset.index === undefined ? null : Number(node.dataset.index)); } },
        // A TG tab shows that tier's levels; tapping it again (a double tap) takes the TG level itself.
        tier: { run: function (node) {
          if (!picking) return;
          var n = Number(node.dataset.tier);
          if (n && picking.tier === n && E.levels(D, picking.building).indexOf('TG ' + n) >= 0) return choose('TG ' + n);
          picking.tier = n; fillPicker();
          var tab = one('tiers').querySelector('[data-tier="' + n + '"]');
          if (tab) tab.focus();
        } },
        choose: { run: function (node) { choose(node.dataset.level); } },
        close: { run: closePicker },
        guest: { run: function () {
          // Guest mode is chosen before the page's modules mount, so the switch reloads the
          // page into or out of it with the same goals; leaving drops the link's levels.
          var kept = new URLSearchParams(location.search);
          ['b', 'to', 'goal', 'have', 'speed', 'dt', 'pan', 'guest'].forEach(function (k) { kept.delete(k); });
          var rest = kept.toString();
          location.assign(location.pathname + '?' + (rest ? rest + '&' : '') + address(false) + (guest ? '' : '&guest') + location.hash);
        } },
        set: { run: function (node) {
          var k = node.dataset.key, v = node.dataset.value;
          cs[k] = k === 'mode' || k === 'position' ? v : Number(v);
          speedChanged();
        } },
        toggle: { run: function (node) { cs[node.dataset.key] = !cs[node.dataset.key]; speedChanged(); } },
        number: { events: ['change', 'input'], run: function (node) {
          var n = Number(node.value);
          cs[node.dataset.field] = node.value !== '' && isFinite(n) && n >= 0 && n <= 1000 ? n : null;
          keep('bh:construction', cs); render(); fillSpeedSum();
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
