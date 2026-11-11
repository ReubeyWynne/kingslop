/* Bounded DOM adapter for the governor answer. Arithmetic lives in governor-engine.mjs;
   levels, choices and materials live in the page's own sheet (governor-sheet.js), and the
   profile beside it (js/pages/governor-profile.mjs) edits them. The answer is where each piece ends
   up and one bill, never a queue of single steps: "with what I have" spends the bag by the
   chosen troop profile, "cost to reach" prices a target for every piece or one troop. */
(function () {
  'use strict';
  var EN = {
    'slot.hat': 'Hat', 'slot.amulet': 'Amulet', 'slot.armour': 'Armour', 'slot.trousers': 'Trousers', 'slot.ring': 'Ring', 'slot.staff': 'Staff',
    'profileNote.bear': 'Archers first: Bear Hunt runs every two days and pays back in hammers. Infantry keeps level with cavalry for Vikings, Alliance Championship and the rest.',
    'profileNote.custom': 'Your own weights: each troop\'s gains count that many times. A troop at 0 stays where it is.',
    'profileNote.score': 'The most governor score for the materials, for an event day.',
    billSpend: 'Spends', billReach: 'Needs', spendLeft: '{n} left', needShort: '{n} short', needEnough: 'enough',
    stays: 'stays', notSet: 'not set', scoreGain: '+{n} governor score', scoreNone: 'No published score for one of these levels.',
    kindGear: 'Gear', kindCharms: 'Charms',
    nothing: 'Nothing the materials can pay for yet. Count them, or set the level of each piece.',
    bagUnknown: 'Materials not counted count as none.',
    reached: 'Everything set is already there.', unverified: 'Includes a step only one table lists (◇).',
    pieceTroop: '{slot} · {troop}',
    applyGear: 'Mark gear applied', applyCharms: 'Mark charms applied', undoGear: 'Gear applied. Undo', undoCharms: 'Charms applied. Undo'
  };
  var TROOPS = { inf: 'Infantry', cav: 'Cavalry', arc: 'Archer' };
  var ORDER = ['cav-1', 'cav-2', 'inf-1', 'inf-2', 'arc-1', 'arc-2'];
  window.Interactions.register('governor-planner', function (context) {
    var G = window.Governor, store = context.ledger, api = context.api, root = context.root;
    var mode = 'spend', reachTroop = 'all', last = null, undo = {}, art = root.dataset.art || '../img/governor/';
    var view = window.GovernorView.create(G, api, art, { emptyGemLabel: '', stars: '[data-part="stars"]' });
    function t(key) { return api.tr((/^slot\./.test(key) ? 'gov.' : 'gov.answer.') + key, EN[key]); }
    function fill(key, values) { return api.fill(t(key), values); }
    function el(tag, text, cls) { var node = document.createElement(tag); if (text !== undefined && text !== null) node.textContent = text; if (cls) node.className = cls; return node; }
    function img(src, size, cls) { var node = el('img', null, cls); node.src = src; node.alt = ''; node.width = size; node.height = size; return node; }
    function put(key, value) { context.targets(key).forEach(function (node) { node.textContent = value; }); }
    function piece(id) { return G.data.gear.pieces.find(function (p) { return p.id === id; }); }
    function prefs() {
      var saved = store.snapshot().preferences.governor || {};
      var out = Object.assign(G.prefDefaults(), saved.goal === 'score' ? { profile: 'score' } : {}, saved);
      var retired = { even: '1:1:1', defence: '1:0.5:0.7' };
      if (Object.hasOwn(retired, out.profile)) { out.weights = out.weights || retired[out.profile]; out.profile = 'custom'; }
      return out;
    }
    function bag() {
      var snapshot = store.snapshot(), out = {}, unknown = false;
      G.data.materials.forEach(function (m) { out[m.id] = window.PlayerLedger.confirmed(snapshot, m.id); if (out[m.id] === null) unknown = true; });
      return { amounts: out, unknown: unknown };
    }
    // One row per piece: the card it ends on, gear from → to, and each charm from → to.
    function row(id, gear, charms) {
      var p = piece(id), from = gear.from[id], to = gear.to[id], li = el('li', null, 'gov-row');
      li.dataset.item = id;
      li.dataset.moved = String(from !== to || [1, 2, 3].some(function (c) { return charms.from[id + '-' + c] !== charms.to[id + '-' + c]; }));
      var card = el('span', null, 'gov-card'); card.appendChild(img(art + 'gear/' + id + '-green-0.webp', 160)); view.paintCard(card, id, to);
      var text = el('span', null, 'gov-row-text');
      text.appendChild(el('span', fill('pieceTroop', { slot: t('slot.' + p.slot), troop: api.tr('gear.' + p.troop, TROOPS[p.troop]) }), 'gov-row-name'));
      var gearText = el('span', from === null ? t('notSet') : from === to ? view.levelName('gear', from) + ' · ' + t('stays') : view.levelName('gear', from) + ' → ' + view.levelName('gear', to), 'gov-row-gear');
      if (from === null) gearText.dataset.tally = 'unknown';
      text.appendChild(gearText);
      var gems = el('span', null, 'gov-row-charms');
      [1, 2, 3].forEach(function (c) {
        var cid = id + '-' + c, a = charms.from[cid], b = charms.to[cid], gem = el('span', null, 'gov-gem'), wrap = el('span', null, 'gov-row-charm');
        gem.appendChild(img(art + 'charms/' + p.troop + '-1.webp', 72)); view.paintGem(gem, p.troop, b);
        wrap.append(gem, el('span', a === null ? '?' : a === b ? api.fmt(a) : api.fmt(a) + '→' + api.fmt(b)));
        wrap.dataset.moved = String(a !== b); gems.appendChild(wrap);
      });
      text.appendChild(gems);
      li.append(card, text);
      return li;
    }
    function tileLine(key, n, cls) {
      var out = api.tileText(n), line = el('small', fill(key, { n: out.text }), cls);
      if (out.title) line.title = fill(key, { n: out.title });
      return line;
    }
    function bill(cost, amounts, need) {
      return G.data.materials.map(function (m) {
        var cell = el('div'), have = amounts[m.id], n = cost[m.id] || 0;
        cell.dataset.material = m.id;
        cell.title = api.tr(m.key, m.label) + ': ' + api.fmt(n);
        cell.append(img(art + m.id + '.webp', 40, 'gov-icon gov-icon-lg'), api.tile(el('strong'), n, true));
        // What is left or short reads like the cost: ? until the bag is counted.
        if (!need) cell.appendChild(tileLine('spendLeft', have === null ? null : Math.max(0, have - n), 'sheet-left'));
        else { var short = have === null ? null : Math.max(0, n - have); cell.appendChild(short === 0 ? el('small', t('needEnough')) : tileLine('needShort', short, short > 0 ? 'sheet-short' : '')); }
        return cell;
      });
    }
    function render() {
      var gear = store.governor('gear'), charms = store.governor('charms'), options = prefs(), materials = bag();
      var result = {}, notes = [], scoreTotal = 0, scoreKnown = true, cost = {};
      ['gear', 'charms'].forEach(function (kind) {
        var state = kind === 'gear' ? gear : charms;
        if (mode === 'spend') {
          var plan = G.plan(kind, state, materials.amounts, { profile: options.profile, weights: options.weights, limit: 1000 });
          result[kind] = { from: state, to: plan.levels, cost: plan.spent, score: plan.score, steps: plan.steps.length, unverified: plan.steps.some(function (s) { return !s.verified; }) };
        } else {
          var target = G.toTarget(kind, state, kind === 'gear' ? options.gearTarget : options.charmTarget, materials.amounts, { troop: reachTroop });
          result[kind] = { from: state, to: target.levels, cost: target.cost, score: target.score, steps: target.steps, unverified: target.unverified };
        }
        Object.keys(result[kind].cost).forEach(function (id) { cost[id] = result[kind].cost[id]; });
        if (result[kind].score === null) scoreKnown = false; else scoreTotal += result[kind].score;
      });
      last = { result: result, amounts: materials.amounts };
      context.targets('rows').forEach(function (list) { list.replaceChildren.apply(list, ORDER.map(function (id) { return row(id, result.gear, result.charms); })); });
      put('billTitle', t(mode === 'spend' ? 'billSpend' : 'billReach'));
      context.targets('bill').forEach(function (strip) { strip.replaceChildren.apply(strip, bill(cost, materials.amounts, mode === 'reach')); });
      var steps = result.gear.steps + result.charms.steps;
      put('score', steps && scoreKnown ? fill('scoreGain', { n: api.fmt(scoreTotal) }) : '');
      // Gear and charms score on different days, so each has its own row.
      context.targets('events').forEach(function (node) {
        node.replaceChildren();
        if (!steps || !window.EventPoints) return;
        var rows = ['gear', 'charms'].map(function (kind) {
          return { label: t(kind === 'gear' ? 'kindGear' : 'kindCharms'), cells: window.EventPoints.forGovernor(kind, result[kind].score) };
        });
        node.appendChild(window.EventPoints.table(api, rows, 'gov-event-points'));
      });
      // Gear and charms are marked applied apart; an apply stays undoable until either side of it changes.
      var anyApply = false;
      context.nodes('[data-action="governor-planner.apply"]').forEach(function (button) {
        var kind = button.dataset.kind, back = undoable(kind), show = back || result[kind].steps > 0;
        button.hidden = !show; anyApply = anyApply || show;
        button.textContent = t(back ? (kind === 'gear' ? 'undoGear' : 'undoCharms') : (kind === 'gear' ? 'applyGear' : 'applyCharms'));
        button.dataset.state = back ? 'applied' : 'planned';
      });
      context.targets('applied').forEach(function (node) { node.hidden = !anyApply; });
      if (!steps) notes.push(t(mode === 'spend' ? 'nothing' : 'reached'));
      if (mode === 'spend' && materials.unknown) notes.push(t('bagUnknown'));
      if (steps && !scoreKnown) notes.push(t('scoreNone'));
      if (result.gear.unverified || result.charms.unverified) notes.push(t('unverified'));
      context.targets('notes').forEach(function (node) { node.hidden = !notes.length; node.textContent = notes.join(' '); });
      context.targets('spendPanel').forEach(function (node) { node.hidden = mode !== 'spend'; });
      context.targets('reachPanel').forEach(function (node) { node.hidden = mode !== 'reach'; });
      context.targets('profile').forEach(function (select) { if (document.activeElement !== select) select.value = options.profile; });
      var note = Object.hasOwn(EN, 'profileNote.' + options.profile) ? t('profileNote.' + options.profile) : '';
      context.targets('profileNote').forEach(function (node) { node.textContent = note; node.hidden = !note; });
      // The weights behind the preset are in the Advanced fold; typing one makes them custom weights.
      var weights = G.weights(options);
      context.targets('weightsFold').forEach(function (node) { node.hidden = !weights || mode !== 'spend'; });
      context.nodes('[data-action="governor-planner.weight"]').forEach(function (input) { if (weights && document.activeElement !== input) input.value = String(weights[input.dataset.troop]); });
      ['gearTarget', 'charmTarget'].forEach(function (key) { context.targets(key).forEach(function (select) { select.value = String(options[key]); }); });
      context.targets('reachTroop').forEach(function (select) { select.value = reachTroop; });
      root.dataset.mode = mode;
    }
    function labelOptions() {
      context.targets('gearTarget').forEach(function (select) { Array.from(select.options).forEach(function (option) { option.textContent = view.levelName('gear', Number(option.value)); }); });
    }
    context.listen(root, 'tabs:select', function (event) {
      if (event.detail.binding !== 'governor-mode') return;
      mode = event.detail.value === 'reach' ? 'reach' : 'spend'; render();
    });
    context.cleanup(store.subscribe(render));
    // What one kind holds now: its levels and the bag of its own materials.
    function held(kind) {
      var snapshot = store.snapshot(), bag = {};
      G.data[kind].materials.forEach(function (id) { bag[id] = window.PlayerLedger.confirmed(snapshot, id); });
      return { levels: store.governor(kind, snapshot), bag: bag };
    }
    function undoable(kind) { return !!undo[kind] && JSON.stringify(held(kind)) === JSON.stringify(undo[kind].after); }
    function write(fn) { try { fn(); } catch (cause) { render(); throw cause; } }
    return { refresh: function () { labelOptions(); render(); }, actions: {
      profile: { events: ['change'], run: function (select) {
        // Custom starts from the weights on show, so a tweak is one number away.
        var now = prefs(), seed = select.value === 'custom' && now.profile !== 'custom' && G.weights(now);
        write(function () { if (seed) store.setGovernorPreference('weights', [seed.inf, seed.cav, seed.arc].join(':')); store.setGovernorPreference('profile', select.value); });
        // As on Hero gear: choosing Custom opens the weights.
        if (select.value === 'custom') context.targets('weightsFold').forEach(function (fold) { fold.open = true; fold.scrollIntoView({ block: 'nearest' }); var input = fold.querySelector('input'); if (input) input.focus({ preventScroll: true }); });
      } },
      weight: { events: ['change'], run: function (input) {
        // A change that lands after another profile was picked (the field losing focus) is not an edit.
        var shown = G.weights(prefs()), n = Math.round(Number(input.value) * 10) / 10;
        if (!shown || shown[input.dataset.troop] === n) return;
        var weights = shown;
        if (input.value !== '' && Number.isFinite(n)) weights[input.dataset.troop] = Math.min(10, Math.max(0, n));
        write(function () { store.setGovernorPreference('weights', [weights.inf, weights.cav, weights.arc].join(':')); store.setGovernorPreference('profile', 'custom'); });
      } },
      option: { events: ['change'], run: function (select) { write(function () { store.setGovernorPreference(select.dataset.option, Number(select.value)); }); } },
      reachTroop: { events: ['change'], run: function (select) { reachTroop = select.value; render(); } },
      apply: { run: function (button) {
        var kind = button.dataset.kind;
        if (undoable(kind)) { var back = undo[kind]; delete undo[kind]; write(function () { store.applyGovernor(kind, back.before.levels, back.before.bag, 'manual'); }); return; }
        if (!last || !last.result[kind].steps) return;
        var planned = last.result[kind], before = held(kind), bag = {};
        G.data[kind].materials.forEach(function (id) { var have = before.bag[id]; if (have !== null) bag[id] = Math.max(0, have - (planned.cost[id] || 0)); });
        write(function () { store.applyGovernor(kind, planned.to, bag); });
        undo[kind] = { before: before, after: held(kind) };
        render();
      } }
    } };
  });
})();
