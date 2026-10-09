/* Bounded DOM adapter for the governor planner. Arithmetic lives in governor-engine.js;
   levels, preferences and materials live in the shared player ledger. */
(function () {
  'use strict';
  var EN = {
    'tier.green': 'Green', 'tier.blue': 'Blue', 'tier.purple': 'Purple', 'tier.gold': 'Gold', 'tier.red': 'Red',
    notCrafted: 'not crafted', lv: 'Lv {n}', piece: 'Piece', charm: 'charm', itemGear: '{troop} piece {n}', itemCharm: '{troop} piece {n} · charm {c}',
    stepStats: '+{n}% stats', stepScore: '+{n} score', singleSource: 'only one table lists this step',
    planEmpty: 'Nothing your bag can pay for yet. Add materials, or set the level of each piece you own.',
    planUnknown: '{n} not set and left out. Set them in “Your levels” to include them.',
    planLimit: 'Showing the first {n} upgrades.', bagUnknown: 'Materials you have not entered count as none.',
    eventRow: '{event}, day {day}: about {points} points', eventNone: 'No event day in the guide scores this yet.', eventUnknown: 'One step has no published score, so the points are not shown.',
    targetUnknown: '{n} not set and left out of this total.', targetDone: 'Everything you have set is already there.', targetUnverified: 'Includes a step only one table lists (◇).',
    resetDone: 'Governor levels cleared. Your materials stay in the bag.'
  };
  var EVENTS = { prep: ['ks.today.kickerPrep', 'KvK prep'], sg: ['ks.governor.title', 'Strongest Governor'], brawl: ['ks.brawl.title', 'Alliance Brawl'] };
  var TROOPS = { inf: 'Infantry', cav: 'Cavalry', arc: 'Archer' };
  window.Interactions.register('governor-planner', function (context) {
    var G = window.Governor, store = window.PlayerLedger.shared(), kind = 'gear', api = context.api;
    function t(key) { return api.tr('gov.' + key, EN[key]); }
    function fill(key, values) { return api.fill(t(key), values); }
    function troop(id) { return api.tr('gear.' + id, TROOPS[id]); }
    function itemName(id) {
      var parts = id.split('-');
      return parts.length === 2 ? fill('itemGear', { troop: troop(parts[0]), n: parts[1] }) : fill('itemCharm', { troop: troop(parts[0]), n: parts[1], c: parts[2] });
    }
    function levelName(which, index) {
      if (which === 'charms') return fill('lv', { n: api.fmt(index) });
      if (!index) return t('notCrafted');
      var d = G.describe('gear', index);
      return t('tier.' + d.tier) + (d.grade ? ' T' + api.fmt(d.grade) : '') + ' ' + api.fmt(d.stars) + '★';
    }
    function materialName(id) { var item = G.data.materials.find(function (m) { return m.id === id; }); return api.tr(item.key, item.label); }
    function el(tag, text, cls) { var node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; }
    function prefs() { return Object.assign({ goal: 'stats', focus: 'all', gearTarget: G.max('gear'), charmTarget: G.max('charms') }, store.snapshot().preferences.governor || {}); }
    function bag(snapshot, which) {
      var out = {}, unknown = false;
      G.data.materials.forEach(function (m) {
        var entry = snapshot.inventory[m.id];
        if (entry && entry.status === 'confirmed') out[m.id] = entry.amount;
        else { out[m.id] = null; if (G.data[which].materials.includes(m.id)) unknown = true; }
      });
      return { amounts: out, unknown: unknown };
    }
    function pct(n) { return new Intl.NumberFormat((window.I18N && window.I18N.locale) || 'en-GB', { maximumFractionDigits: 2 }).format(n); }
    function labelOptions() {
      context.nodes('select[data-level="gear"], [data-target~="governor-planner.fillGear"], [data-target~="governor-planner.gearTarget"]').forEach(function (select) {
        Array.from(select.options).forEach(function (option) { if (option.value !== '' && Number(option.value) > 0) option.textContent = levelName('gear', Number(option.value)); });
      });
    }
    function put(key, value) { context.targets(key).forEach(function (node) { node.textContent = value; }); }
    function note(key, text) { context.targets(key).forEach(function (node) { node.hidden = !text; node.textContent = text || ''; }); }
    function render() {
      var snapshot = store.snapshot(), options = prefs(), materials = bag(snapshot, kind);
      ['gear', 'charms'].forEach(function (which) {
        var levels = store.governor(which);
        context.nodes('select[data-level="' + which + '"]').forEach(function (select) { var value = levels[select.dataset.item]; select.value = value === null ? '' : String(value); });
      });
      ['goal', 'focus', 'gearTarget', 'charmTarget'].forEach(function (key) { context.targets(key).forEach(function (select) { select.value = String(options[key]); }); });
      var state = store.governor(kind), result = G.plan(kind, state, materials.amounts, { goal: options.goal, focus: options.focus, limit: 40 });
      var unset = G.items(kind).filter(function (item) { return state[item.id] === null && (options.focus === 'all' || item.troop === options.focus); }).length;
      put('count', api.fmt(result.steps.length));
      put('score', result.score === null ? '—' : api.fmt(result.score));
      var notes = [];
      if (!result.steps.length) notes.push(t('planEmpty'));
      if (unset) notes.push(fill('planUnknown', { n: api.fmt(unset) }));
      if (result.truncated) notes.push(fill('planLimit', { n: api.fmt(result.steps.length) }));
      if (materials.unknown) notes.push(t('bagUnknown'));
      note('status', notes.join(' '));
      context.targets('steps').forEach(function (list) {
        list.replaceChildren();
        result.steps.forEach(function (step) {
          var li = el('li'), head = el('p', itemName(step.id), 'gov-step-item');
          li.appendChild(head);
          li.appendChild(el('p', levelName(kind, step.from) + ' → ' + levelName(kind, step.to) + (step.verified ? '' : ' ◇'), 'gov-step-level'));
          var gain = options.goal === 'score' && step.score !== null ? fill('stepScore', { n: api.fmt(step.score) }) : fill('stepStats', { n: pct(step.stat) });
          li.appendChild(el('p', gain + ' · ' + Object.keys(step.cost).filter(function (id) { return step.cost[id]; }).map(function (id) { return api.fmt(step.cost[id]) + ' ' + materialName(id); }).join(' · '), 'gov-step-cost'));
          if (!step.verified) li.title = t('singleSource');
          list.appendChild(li);
        });
      });
      context.targets('spent').forEach(function (body) {
        body.replaceChildren();
        Object.keys(result.spent).forEach(function (id) {
          var tr = el('tr'); tr.appendChild(el('th', materialName(id))); tr.firstChild.scope = 'row';
          tr.appendChild(el('td', api.fmt(result.spent[id]))); tr.appendChild(el('td', materials.amounts[id] === null ? '—' : api.fmt(result.left[id]))); body.appendChild(tr);
        });
      });
      context.targets('events').forEach(function (list) {
        list.replaceChildren();
        var rows = G.events(kind, result.score), best = {};
        rows.forEach(function (row) { if (!best[row.event] || row.rate > best[row.event].rate) best[row.event] = row; });
        var keys = Object.keys(best);
        if (!keys.length) list.appendChild(el('li', t('eventNone')));
        else if (result.score === null) list.appendChild(el('li', t('eventUnknown')));
        else keys.forEach(function (event) {
          var row = best[event];
          list.appendChild(el('li', fill('eventRow', { event: api.tr(EVENTS[event][0], EVENTS[event][1]), day: api.fmt(row.day), points: api.fmt(row.points) })));
        });
      });
      var target = G.toTarget(kind, state, kind === 'gear' ? options.gearTarget : options.charmTarget, materials.amounts);
      context.targets('target').forEach(function (body) {
        body.replaceChildren();
        Object.keys(target.cost).forEach(function (id) {
          var tr = el('tr'); tr.appendChild(el('th', materialName(id))); tr.firstChild.scope = 'row';
          tr.appendChild(el('td', api.fmt(target.cost[id]))); tr.appendChild(el('td', target.missing[id] === null ? '—' : api.fmt(target.missing[id]))); body.appendChild(tr);
        });
      });
      var targetNotes = [];
      if (target.unknown.length) targetNotes.push(fill('targetUnknown', { n: api.fmt(target.unknown.length) }));
      else if (!target.steps) targetNotes.push(t('targetDone'));
      if (target.unverified) targetNotes.push(t('targetUnverified'));
      note('targetNote', targetNotes.join(' '));
      context.emit('governor-planner:planned', { kind: kind, plan: result, target: target });
    }
    function refresh() { labelOptions(); render(); }
    context.targets('controls').forEach(function (node) { node.disabled = false; });
    context.listen(context.root, 'tabs:select', function (event) {
      if (event.detail.binding !== 'governor-kind') return;
      kind = event.detail.value === 'charms' ? 'charms' : 'gear'; render();
    });
    context.cleanup(store.subscribe(render));
    function write(fn) { try { fn(); } catch (cause) { render(); throw cause; } }
    return { refresh: refresh, actions: {
      level: { events: ['change'], run: function (node) {
        var change = {}; change[node.dataset.item] = node.value === '' ? null : Number(node.value);
        write(function () { store.setGovernor(node.dataset.level, change); });
      } },
      fill: { run: function (button) {
        var which = button.dataset.kind, select = context.targets(which === 'gear' ? 'fillGear' : 'fillCharms')[0];
        if (!select || select.value === '') return;
        var change = {}; G.items(which).forEach(function (item) { change[item.id] = Number(select.value); });
        write(function () { store.setGovernor(which, change); });
      } },
      option: { events: ['change'], run: function (node) {
        var key = node.dataset.option, value = key === 'goal' || key === 'focus' ? node.value : Number(node.value);
        write(function () { store.setGovernorPreference(key, value); });
      } },
      reset: { run: function () {
        write(function () { store.resetGovernor(); });
        context.emit('player-status', { scope: 'governor', key: 'gov.resetDone', fallback: EN.resetDone });
      } }
    } };
  });
})();
