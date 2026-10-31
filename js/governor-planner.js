/* Bounded DOM adapter for the governor answer. Arithmetic lives in governor-engine.js;
   levels, choices and materials live in the page's own sheet (governor-sheet.js), and the
   profile beside it (governor-profile.js) edits them. The answer is where each piece ends
   up and one bill, never a queue of single steps: "with what I have" spends the bag by the
   chosen troop profile, "cost to reach" prices a target for every piece or one troop. */
(function () {
  'use strict';
  var EN = {
    'slot.hat': 'Hat', 'slot.amulet': 'Amulet', 'slot.armour': 'Armour', 'slot.trousers': 'Trousers', 'slot.ring': 'Ring', 'slot.staff': 'Staff',
    'profileNote.bear': 'Archers first: Bear Hunt runs every two days and pays back in hammers. Infantry keeps level with cavalry for Vikings, Alliance Championship and the rest.',
    'profileNote.custom': 'Your own weights: each troop\'s gains count that many times. A troop at 0 stays where it is.',
    'profileNote.score': 'The most governor score for the materials, for an event day.',
    billSpend: 'Spends', billReach: 'Needs', spendLeft: '{n} left', needShort: '{n} short', needEnough: 'enough', needUnknown: 'not counted',
    stays: 'stays', notSet: 'not set', scoreGain: '+{n} governor score', scoreNone: 'No published score for one of these levels.',
    eventRow: '{kind} on {event} day {day}: about {points} points', kindGear: 'Gear', kindCharms: 'Charms',
    nothing: 'Nothing the materials can pay for yet. Count them, or set the level of each piece.',
    unset: '{n} not set and left out. Tap a piece to set it.', bagUnknown: 'Materials not counted count as none.',
    reached: 'Everything set is already there.', unverified: 'Includes a step only one table lists (◇).',
    pieceTroop: '{slot} · {troop}'
  };
  var EVENTS = { prep: ['ks.today.kickerPrep', 'KvK prep'], sg: ['ks.governor.title', 'Strongest Governor'], brawl: ['ks.brawl.title', 'Alliance Brawl'] };
  var TROOPS = { inf: 'Infantry', cav: 'Cavalry', arc: 'Archer' };
  var ORDER = ['cav-1', 'cav-2', 'inf-1', 'inf-2', 'arc-1', 'arc-2'];
  window.Interactions.register('governor-planner', function (context) {
    var G = window.Governor, store = context.ledger, api = context.api, root = context.root;
    var mode = 'spend', reachTroop = 'all', art = root.dataset.art || '../img/governor/';
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
      G.data.materials.forEach(function (m) { var entry = snapshot.inventory[m.id]; if (entry && entry.status === 'confirmed') out[m.id] = entry.amount; else { out[m.id] = null; unknown = true; } });
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
      text.appendChild(el('span', from === null ? t('notSet') : from === to ? view.levelName('gear', from) + ' · ' + t('stays') : view.levelName('gear', from) + ' → ' + view.levelName('gear', to), 'gov-row-gear'));
      var gems = el('span', null, 'gov-row-charms');
      [1, 2, 3].forEach(function (c) {
        var cid = id + '-' + c, a = charms.from[cid], b = charms.to[cid], gem = el('span', null, 'gov-gem'), wrap = el('span', null, 'gov-row-charm');
        gem.appendChild(img(art + 'charms/' + p.troop + '-1.webp', 72)); view.paintGem(gem, p.troop, b);
        wrap.append(gem, el('span', a === null ? '—' : a === b ? api.fmt(a) : api.fmt(a) + '→' + api.fmt(b)));
        wrap.dataset.moved = String(a !== b); gems.appendChild(wrap);
      });
      text.appendChild(gems);
      li.append(card, text);
      return li;
    }
    function bill(cost, amounts, need) {
      return G.data.materials.map(function (m) {
        var cell = el('div'), have = amounts[m.id], n = cost[m.id] || 0;
        cell.dataset.material = m.id;
        cell.title = api.tr(m.key, m.label) + ': ' + api.fmt(n);
        cell.append(img(art + m.id + '.webp', 40, 'gov-icon gov-icon-lg'), el('strong', api.compact(n)));
        if (!need) cell.appendChild(el('small', have === null ? t('needUnknown') : fill('spendLeft', { n: api.compact(Math.max(0, have - n)) })));
        else { var short = have === null ? null : Math.max(0, n - have); cell.appendChild(el('small', short === null ? t('needUnknown') : short > 0 ? fill('needShort', { n: api.compact(short) }) : t('needEnough'), short > 0 ? 'gov-short' : '')); }
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
      context.targets('rows').forEach(function (list) { list.replaceChildren.apply(list, ORDER.map(function (id) { return row(id, result.gear, result.charms); })); });
      put('billTitle', t(mode === 'spend' ? 'billSpend' : 'billReach'));
      context.targets('bill').forEach(function (strip) { strip.replaceChildren.apply(strip, bill(cost, materials.amounts, mode === 'reach')); });
      var steps = result.gear.steps + result.charms.steps;
      put('score', steps && scoreKnown ? fill('scoreGain', { n: api.fmt(scoreTotal) }) : '');
      context.targets('events').forEach(function (list) {
        list.replaceChildren();
        if (!steps || !scoreKnown) return;
        ['gear', 'charms'].forEach(function (kind) {
          if (!result[kind].score) return;
          var best = {};
          G.events(kind, result[kind].score).forEach(function (r) { if (!best[r.event] || r.rate > best[r.event].rate) best[r.event] = r; });
          Object.keys(best).forEach(function (event) { var r = best[event]; list.appendChild(el('li', fill('eventRow', { kind: t(kind === 'gear' ? 'kindGear' : 'kindCharms'), event: api.tr(EVENTS[event][0], EVENTS[event][1]), day: api.fmt(r.day), points: api.fmt(Math.round(r.points)) }))); });
        });
      });
      var unset = ORDER.filter(function (id) { return gear[id] === null && (mode === 'spend' || reachTroop === 'all' || piece(id).troop === reachTroop); }).length;
      if (!steps) notes.push(t(mode === 'spend' ? 'nothing' : 'reached'));
      if (unset) notes.push(fill('unset', { n: api.fmt(unset) }));
      if (mode === 'spend' && materials.unknown) notes.push(t('bagUnknown'));
      if (steps && !scoreKnown) notes.push(t('scoreNone'));
      if (result.gear.unverified || result.charms.unverified) notes.push(t('unverified'));
      context.targets('notes').forEach(function (node) { node.hidden = !notes.length; node.textContent = notes.join(' '); });
      context.targets('spendPanel').forEach(function (node) { node.hidden = mode !== 'spend'; });
      context.targets('reachPanel').forEach(function (node) { node.hidden = mode !== 'reach'; });
      context.nodes('[data-action="governor-planner.profile"]').forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.value === options.profile)); });
      put('profileNote', t('profileNote.' + options.profile));
      // The weights behind the preset are on show; typing one makes them custom weights.
      var weights = G.weights(options);
      context.targets('weights').forEach(function (node) { node.hidden = !weights; });
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
    function write(fn) { try { fn(); } catch (cause) { render(); throw cause; } }
    return { refresh: function () { labelOptions(); render(); }, actions: {
      profile: { run: function (button) {
        // Custom starts from the weights on show, so a tweak is one number away.
        var now = prefs(), seed = button.dataset.value === 'custom' && now.profile !== 'custom' && G.weights(now);
        write(function () { if (seed) store.setGovernorPreference('weights', [seed.inf, seed.cav, seed.arc].join(':')); store.setGovernorPreference('profile', button.dataset.value); });
      } },
      weight: { events: ['change'], run: function (input) {
        var weights = G.weights(prefs()) || { inf: 1, cav: 1, arc: 1 }, n = Math.round(Number(input.value) * 10) / 10;
        if (input.value !== '' && Number.isFinite(n)) weights[input.dataset.troop] = Math.min(10, Math.max(0, n));
        write(function () { store.setGovernorPreference('weights', [weights.inf, weights.cav, weights.arc].join(':')); store.setGovernorPreference('profile', 'custom'); });
      } },
      option: { events: ['change'], run: function (select) { write(function () { store.setGovernorPreference(select.dataset.option, Number(select.value)); }); } },
      reachTroop: { events: ['change'], run: function (select) { reachTroop = select.value; render(); } }
    } };
  });
})();
