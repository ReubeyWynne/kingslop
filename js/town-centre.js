/* Bounded DOM adapters for the Town Centre. Arithmetic lives in town-centre-engine.js;
   every count lives in the shared player ledger, so the hero gear, governor and event
   pages see each edit made here. */
(function () {
  'use strict';
  var EN = {
    dayTitle: '{event}, day {day}', dayLabel: 'Day {n}', dayEmpty: 'No recorded inventory scores on this day.',
    complete: 'All required counts entered.', partial: 'Partial estimate. Missing counts or levels are excluded.',
    alsoNone: 'No other activities listed.', planEmpty: 'Record your inventory to see the best days.',
    planRow: '{item}: day {day}, {points} points', topRate: 'best {rate} each · {event} day {day}', topRateMinute: 'best {rate} a minute · {event} day {day}', noRate: 'No rate per item.',
    scoreGain: '+{n} score', govGear: 'Governor gear score', govCharms: 'Governor charm score',
    gainBoth: 'Available upgrades: +{gear} gear score · +{charms} charm score.', gainUnknown: 'Enter levels and materials to estimate upgrades.',
    missingDetails: 'Missing details',
    missingSpeedup: '{kind} speedups',
    missingGovGear: 'Governor gear levels and materials',
    missingGovCharms: 'Governor charm levels and materials',
    pieces: '{n} of 12 pieces set', partialScore: '{n}*',
    'speedup.general': 'General', 'speedup.construction': 'Construction', 'speedup.research': 'Research', 'speedup.training': 'Training', 'speedup.learning': 'Learning', 'speedup.healing': 'Healing',
    'unit.d': 'd', 'unit.h': 'h', 'unit.m': 'm',
    heroAmount: '{n} usable', heroGearPieces: 'your hero gear',
    buildings: 'your buildings', buildingNamed: '{building} level', pastTG8: 'building costs past TG 8 (not verified yet)', notBuilt: 'not built',
    buildingTo: 'can reach {level}', buildingStuck: 'nothing it can take yet',
    buildingSpend: 'Following your priorities, your buildings take {gold} of {goldHave} Truegold and {tempered} of {temperedHave} Tempered Truegold, worth {points} KvK prep points.',
    buildingSpendMax: 'Spending for points only, they could take {gold} Truegold and {tempered} Tempered Truegold, worth {points} points.',
    buildingMax: 'Truegold follows your building priorities. Spending it for points only would score up to {points} ({extra} more).',
    setAllPick: 'choose a level', 'tier.1': 'Lead', 'tier.2': 'Keep up', 'tier.3': 'Spare', 'tier.0': 'Skip', moveUp: 'move {building} up', moveDown: 'move {building} down', tierFor: '{building} priority',
    buildingSpendUnknown: 'Set your building levels to see how much Truegold they can take.',
    buildingPlan: 'With what you have counted, this can reach {level}: {steps} steps, {gold} Truegold and {tempered} Tempered Truegold.',
    buildingPlanNone: 'Nothing more goes here in this plan. Your Truegold and resources pay for cheaper steps first, and each step waits for its Town Centre level, its prerequisites and every resource it costs.',
    'troopLine.batch': 'T{tier} troops, pre-trained', 'troopLine.training': 'T{tier} troops, training speedups', 'troopLine.general': 'T{tier} troops, general speedups',
    'training-tiers': 'the tier each camp trains', 'training-capacity': 'training capacity', 'training-speed': 'training speed', troopRate: 'T{tier} troop points for this event', troopCost: 'T{tier} training costs (not verified yet)',
    speedPercent: '{n}%', tierLabel: 'T{n}', batchOf: 'batch of {n}',
    speedUnit: 'training speed, %', speedHint: 'Bonus Overview, Training Speed, without the temporary buffs below.',
    positionHint: 'Noble Advisor or Chief Minister, never both. Each gives more while your kingdom holds the High King, which ends before KvK.',
    buffOff: '—', buffPercent: '+{n}%', planOn: 'on',
    capacityUnit: 'troops per batch', capacityHint: 'How many troops one camp trains at once, without the capacity buff.',
    tierHint: 'T10 and T11 Truegold troops train in the same time for the same cost as plain T10 and T11.',
    troopTitle: 'Best troop day: {event}, day {day}', 'troopLine.batchBuff': 'T{tier} troops, tripled batch',
    speedSame: '{n}%', speedSplit: '{batch}%, {day}% on the day', troopNoStart: 'set your training speed and capacity',
    troopUnchecked: 'T{tier} costs are not checked against your resources yet.',
    troopPlanNone: 'Set your training speed, capacity and camp tiers to see what you can train for a troop day.'
  };
  var EVENTS = { prep: ['ks.today.kickerPrep', 'KvK prep'], sg: ['ks.governor.title', 'Strongest Governor'], brawl: ['ks.brawl.title', 'Alliance Brawl'] };
  function t(api, key) { return api.tr('town.' + key, EN[key]); }
  function fill(api, key, values) { return api.fill(t(api, key), values); }
  function eventName(api, event) { return api.tr(EVENTS[event][0], EVENTS[event][1]); }
  function duration(api, minutes) {
    var d = Math.floor(minutes / 1440), h = Math.floor(minutes % 1440 / 60), m = minutes % 60, out = [];
    if (d) out.push(api.fmt(d) + t(api, 'unit.d'));
    if (h) out.push(api.fmt(h) + t(api, 'unit.h'));
    if (m || !out.length) out.push(api.fmt(m) + t(api, 'unit.m'));
    return out.join(' ');
  }
  function buildingName(api, building) { return api.tr('town.building.' + building.id, building.name); }
  function name(api, id) {
    var item = window.EventRuleData.items.find(function (entry) { return entry.id === id; });
    if (item) return api.tr(item.key, item.label);
    if (/^speedup-/.test(id)) return t(api, 'speedup.' + id.slice(8));
    if (id === 'governor-gear') return t(api, 'govGear');
    if (id === 'governor-charms') return t(api, 'govCharms');
    if (id === 'hero-gear-xp') return api.tr('gear.xpTotal', 'XP total');
    if (id === 'spare-mythic-gear') return api.tr('gear.mythic', 'Spare mythic gear');
    if (id === 'hero-gear-pieces') return t(api, 'heroGearPieces');
    var site = window.BuildingSpend.missing(id);
    if (site) return site.kind === 'building' ? fill(api, 'buildingNamed', { building: buildingName(api, site.building) }) : t(api, site.kind);
    var troop = /^troops-(batch|training|general)-t(\d+)$/.exec(id);
    if (troop) return fill(api, 'troopLine.' + troop[1], { tier: troop[2] });
    var train = window.TroopSpend.missing(id);
    if (train) return train.tier === null ? t(api, train.kind) : fill(api, train.kind === 'rate' ? 'troopRate' : 'troopCost', { tier: train.tier });
    var need = window.HeroSpend.missing(id);
    if (need) return window.HeroPoints.missing(api, need);
    return id;
  }
  // Training time from seconds, rounded up to the minute so a batch is never started too late.
  function seconds(api, secs) { return duration(api, Math.ceil(secs / 60)); }
  function amount(api, line) { return line.kind === 'speedup' ? duration(api, line.amount) : line.kind === 'governor' ? fill(api, 'scoreGain', { n: api.fmt(line.amount) }) : line.kind === 'usable' ? fill(api, 'heroAmount', { n: api.fmt(line.amount) }) : api.fmt(line.amount); }
  function confirmed(snapshot, id) { var entry = snapshot.inventory[id]; return entry && entry.status === 'confirmed' ? entry.amount : null; }
  function element(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }

  window.Interactions.register('town-centre', function (context) {
    var T = window.TownCentre, store = window.PlayerLedger.shared(), api = context.api, root = context.root;
    var event = 'prep', chosen = { prep: null, sg: null, brawl: null };
    function put(key, value) { context.targets(key).forEach(function (node) { node.textContent = value; }); }
    function render() {
      var snapshot = store.snapshot(), results = {};
      Object.keys(EVENTS).forEach(function (key) {
        results[key] = T.best(snapshot, key);
        root.querySelectorAll('[data-event-total="' + key + '"]').forEach(function (node) { node.textContent = api.fmt(results[key].total); node.dataset.partial = String(!results[key].complete); });
      });
      var result = results[event];
      var mine = T.buildingPoints(result.buildings, event), most = T.buildingPoints(result.buildingsMax, event);
      context.targets('buildingMax').forEach(function (node) { node.hidden = most <= mine; node.textContent = most > mine ? fill(api, 'buildingMax', { points: api.fmt(most), extra: api.fmt(most - mine) }) : ''; });
      put('coverage', t(api, result.complete ? 'complete' : 'partial'));
      context.targets('missingDisclosure').forEach(function (node) { node.hidden = result.complete; });
      var missing = context.targets('missing')[0]; missing.replaceChildren();
      result.unknown.forEach(function (id) {
        var label = /^speedup-/.test(id) ? fill(api, 'missingSpeedup', { kind: name(api, id) }) : id === 'governor-gear' ? t(api, 'missingGovGear') : id === 'governor-charms' ? t(api, 'missingGovCharms') : name(api, id);
        missing.appendChild(element('li', '', label));
      });

      var top = Math.max.apply(null, result.days.map(function (day) { return day.total; }).concat([1]));
      if (!chosen[event]) chosen[event] = result.days.reduce(function (best, day) { return day.total > best.total ? day : best; }, result.days[0]).day;
      var list = context.targets('days')[0]; list.replaceChildren();
      result.days.forEach(function (day) {
        var item = element('li'), button = element('button', 'town-daybar');
        button.type = 'button'; button.dataset.action = 'town-centre.day'; button.dataset.day = day.day;
        button.setAttribute('aria-pressed', String(day.day === chosen[event]));
        button.style.setProperty('--share', (day.total / top).toFixed(3));
        button.append(element('span', 'town-daybar-label', fill(api, 'dayLabel', { n: api.fmt(day.day) })), element('span', 'town-daybar-rule'), element('output', '', api.fmt(day.total)));
        item.appendChild(button); list.appendChild(item);
      });

      var selected = result.days[chosen[event] - 1];
      put('dayTitle', fill(api, 'dayTitle', { event: eventName(api, event), day: api.fmt(selected.day) }));
      var body = context.targets('lines')[0]; body.replaceChildren();
      selected.lines.forEach(function (line) {
        var row = element('tr');
        row.append(element('th', '', name(api, line.id)), element('td', '', amount(api, line)), element('td', '', api.fmt(line.rate)), element('td', '', api.fmt(line.points)));
        row.firstChild.scope = 'row'; body.appendChild(row);
      });
      context.targets('dayEmpty').forEach(function (node) { node.hidden = selected.lines.length > 0; node.textContent = t(api, 'dayEmpty'); });
      var also = context.targets('also')[0]; also.replaceChildren();
      selected.unquantified.forEach(function (row) { also.appendChild(element('li', '', row.label + ' · ' + row.points)); });
      if (!selected.unquantified.length) also.appendChild(element('li', '', t(api, 'alsoNone')));

      var plan = context.targets('plan')[0]; plan.replaceChildren();
      result.lines.forEach(function (line) { plan.appendChild(element('li', '', fill(api, 'planRow', { item: name(api, line.id), day: api.fmt(line.day), points: api.fmt(line.points) }))); });
      if (!result.lines.length) plan.appendChild(element('li', '', t(api, 'planEmpty')));
      context.emit('town-centre:calculated', { event: event, results: results });
    }
    context.listen(root, 'tabs:select', function (e) {
      if (e.detail.binding === 'town-event' && Object.hasOwn(EVENTS, e.detail.value)) { event = e.detail.value; render(); }
    });
    context.cleanup(store.subscribe(render));
    return { refresh: render, actions: {
      day: { run: function (button) { chosen[event] = Number(button.dataset.day); render(); } }
    } };
  });

  /* Every shelf: tiles paint the ledger, and one dialog edits whatever was tapped.
     Hero gear is a set of four per troop type; governor gear is one set of six
     with three charms each, laid out as the in-game governor profile. */
  window.Interactions.register('town-inventory', function (context) {
    var H = window.HeroGear, G = window.Governor, T = window.TownCentre, B = window.BuildingSpend, R = window.TroopSpend, store = window.PlayerLedger.shared(), api = context.api, root = context.root;
    var dialog = context.targets('dialog')[0], editing = null, art = '../img/governor/';
    var UNIT = { d: 1440, h: 60, m: 1 }, TROOPS = { inf: 'Infantry', cav: 'Cavalry', arc: 'Archer' };
    function target(key) { return context.targets(key)[0]; }
    function put(key, value) { context.targets(key).forEach(function (node) { node.textContent = value; }); }
    function part(node, key) { return node.querySelector('[data-part="' + key + '"]'); }
    function setSrc(img, src) { if (img && img.getAttribute('src') !== src) img.setAttribute('src', src); }
    function quality(q) { return api.tr(q === 'mythic' ? 'gear.mythicQuality' : 'gear.' + q, q.charAt(0).toUpperCase() + q.slice(1)); }
    function govState(index) { return index === null || index === undefined ? 'unset' : index === 0 ? 'empty' : 'set'; }
    function govLevelName(index) {
      if (index === null || index === undefined) return api.tr('gov.notSet', 'not set');
      if (!index) return api.tr('gov.notCrafted', 'not crafted');
      var d = G.describe('gear', index);
      return api.tr('gov.tier.' + d.tier, d.tier) + (d.grade ? ' T' + api.fmt(d.grade) : '') + ' ' + api.fmt(d.stars) + '★';
    }
    function tileName(node) { var label = node.querySelector('.town-tile-name'); return label ? label.textContent : ''; }
    function paintHero(node, piece) {
      node.dataset.quality = piece ? piece.quality : '';
      part(node, 'level').textContent = piece ? '+' + api.fmt(piece.quality === 'red' ? piece.level - 100 : piece.level) : '';
      part(node, 'mastery').textContent = piece ? api.fmt(piece.mastery) : '';
      part(node, 'mastery-wrap').hidden = !piece || piece.quality === 'epic';
      part(node, 'band').textContent = piece ? quality(piece.quality) : api.tr('gov.notSet', 'not set');
    }
    function paintCard(card, id, index) {
      var d = index ? G.describe('gear', index) : { tier: 'green', grade: 0, stars: 0 };
      card.dataset.state = govState(index);
      setSrc(card.querySelector('img'), art + 'gear/' + id + '-' + d.tier + '-' + d.grade + '.webp');
      part(card, 'stars').textContent = '★'.repeat(index ? d.stars : 0);
    }
    function paintGem(gem, troop, level) {
      gem.dataset.state = govState(level);
      setSrc(gem.querySelector('img'), art + 'charms/' + troop + '-' + Math.max(1, level || 1) + '.webp');
      var label = gem.querySelector('b'); if (label) label.textContent = level ? api.fmt(level) : '';
    }
    function score(kind, levels) {
      var sum = 0, partial = false, any = false;
      Object.keys(levels).forEach(function (id) { if (levels[id] === null) return; any = true; var s = G.score(kind, levels[id]); if (s === null) partial = true; else sum += s; });
      return !any ? '—' : partial ? fill(api, 'partialScore', { n: api.fmt(sum) }) : api.fmt(sum);
    }
    function levelName(level) { return level === '0' ? t(api, 'notBuilt') : level; }
    function renderBuildings(snapshot, plan) {
      var levels = (snapshot.buildings && snapshot.buildings.levels) || {};
      context.nodes('[data-building]').forEach(function (tile) {
        var id = tile.dataset.building, level = Object.hasOwn(levels, id) ? levels[id] : null, step = plan.buildings[id];
        tile.dataset.state = level === null ? 'unknown' : 'confirmed';
        tile.querySelector('[data-level]').textContent = level === null ? '?' : level === '0' ? '—' : level;
        tile.querySelector('[data-building-plan]').textContent = !step ? '' : step.steps ? fill(api, 'buildingTo', { level: step.to }) : t(api, 'buildingStuck');
      });
      var gold = plan.items.truegold, tempered = plan.items['tempered-truegold'], most = B.plan(snapshot, { goal: 'points' });
      function amount(item) { return item.amount === null ? '—' : api.fmt(item.amount); }
      var text = !plan.recorded ? t(api, 'buildingSpendUnknown') : fill(api, 'buildingSpend', {
        gold: amount(gold), goldHave: gold.pool === null ? '?' : api.fmt(gold.pool),
        tempered: amount(tempered), temperedHave: tempered.pool === null ? '?' : api.fmt(tempered.pool), points: api.fmt(T.buildingPoints(plan, 'prep'))
      });
      if (plan.recorded && T.buildingPoints(most, 'prep') > T.buildingPoints(plan, 'prep')) text += ' ' + fill(api, 'buildingSpendMax', { gold: amount(most.items.truegold), tempered: amount(most.items['tempered-truegold']), points: api.fmt(T.buildingPoints(most, 'prep')) });
      put('buildingSpend', text);
      renderPriorities(plan.priorities);
    }
    function buildingName(id) { var b = B.BUILDINGS.find(function (entry) { return entry.id === id; }); return api.tr('town.building.' + id, b ? b.name : id); }
    // One row per building in tie-break order: art, name, priority and move buttons.
    function renderPriorities(prefs) {
      var list = target('priorities'); if (!list) return;
      list.replaceChildren();
      prefs.order.forEach(function (id, at) {
        var row = element('li', 'town-priority'), art = element('img'), name = element('span', 'town-priority-name', buildingName(id));
        art.src = '../img/buildings/' + id + '.webp'; art.width = 32; art.height = 32; art.alt = '';
        var select = element('select'); select.dataset.tierFor = id; select.dataset.action = 'town-inventory.priority';
        select.setAttribute('aria-label', fill(api, 'tierFor', { building: buildingName(id) }));
        B.TIERS.forEach(function (tier) { var option = element('option', '', t(api, 'tier.' + tier)); option.value = String(tier); select.appendChild(option); });
        select.value = String(prefs.tiers[id]);
        var up = element('button', '', '↑'), down = element('button', '', '↓');
        [[up, -1, 'moveUp'], [down, 1, 'moveDown']].forEach(function (spec) {
          spec[0].type = 'button'; spec[0].dataset.action = 'town-inventory.move'; spec[0].dataset.moveFor = id; spec[0].dataset.step = spec[1];
          spec[0].setAttribute('aria-label', fill(api, spec[2], { building: buildingName(id) }));
          spec[0].disabled = spec[1] < 0 ? at === 0 : at === prefs.order.length - 1;
        });
        row.append(art, name, select, up, down); list.appendChild(row);
      });
    }
    /* Troops: the training facts on their tiles, and the troop day the event points below
       found best for the selected event. */
    var troopResult = null, troopEvent = 'prep';
    function percentText(n) { return new Intl.NumberFormat(document.documentElement.lang || undefined, { maximumFractionDigits: 2 }).format(n); }
    function trainingText(key, fact) { return fact === undefined ? '?' : key === 'speed' ? fill(api, 'speedPercent', { n: new Intl.NumberFormat(document.documentElement.lang || undefined, { maximumFractionDigits: 2 }).format(fact) }) : key === 'capacity' ? api.fmt(fact) : fill(api, 'tierLabel', { n: fact }); }
    function renderTroops(snapshot) {
      var training = snapshot.training || { facts: {} }, facts = training.facts || {}, buff = Boolean(snapshot.preferences.training && snapshot.preferences.training.buff);
      var size = Object.hasOwn(facts, 'capacity') ? facts.capacity * (buff ? R.BUFF : 1) : null;
      var plans = snapshot.preferences.training || {}, buffs = R.speeds(facts, plans, troopEvent);
      context.nodes('[data-training]').forEach(function (tile) {
        var key = tile.dataset.training, fact = Object.hasOwn(facts, key) ? facts[key] : undefined;
        if (key === 'position') {
          tile.dataset.state = plans.position ? 'confirmed' : 'off';
          tile.querySelector('[data-amount]').textContent = plans.position ? fill(api, 'buffPercent', { n: percentText(buffs.position) }) : t(api, 'buffOff');
          return;
        }
        tile.dataset.state = fact === undefined ? 'unknown' : 'confirmed';
        tile.querySelector('[data-amount]').textContent = trainingText(key, fact);
        var note = tile.querySelector('[data-camp-plan]');
        if (note) note.textContent = fact !== undefined && size !== null ? fill(api, 'batchOf', { n: api.fmt(size) }) : '';
      });
      context.nodes('[data-plan]').forEach(function (tile) {
        var on = Boolean(plans[tile.dataset.plan]);
        tile.setAttribute('aria-pressed', String(on)); tile.dataset.state = on ? 'on' : 'off';
        tile.querySelector('[data-amount]').textContent = !on ? t(api, 'buffOff') : tile.dataset.plan === 'mobilize' ? fill(api, 'buffPercent', { n: percentText(R.BUFFS.mobilize) }) : t(api, 'planOn');
      });
      context.nodes('[data-action="town-inventory.buff"]').forEach(function (tile) {
        tile.setAttribute('aria-pressed', String(buff)); tile.dataset.state = buff ? 'on' : 'off';
        tile.querySelector('[data-buff]').textContent = '×' + api.fmt(buff ? R.BUFF : 1);
      });
      if (!troopResult) troopResult = T.best(snapshot, troopEvent).troops;
      // The result: the best troop day as a ledger, with when to start the batch above its lines.
      var found = troopResult, plan = found && found.plan, text = [], shown = Boolean(plan && plan.troops);
      target('troopResult').hidden = !shown;
      if (shown) {
        put('troopTitle', fill(api, 'troopTitle', { event: eventName(api, troopEvent), day: api.fmt(found.day) }));
        var start = '—';
        if (plan.batch.seconds) {
          var opens = window.EventRules.opens(troopEvent, found.day, Date.now()), at = new Date(opens - plan.batch.seconds * 1000);
          start = at.toLocaleString(document.documentElement.lang || undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }) + ' UTC';
        }
        put('troopStartAt', start);
        put('troopTakes', plan.batch.seconds ? seconds(api, plan.batch.seconds) : t(api, 'troopNoStart'));
        var speed = plan.speed;
        put('troopSpeed', speed.batch === null ? '?' : speed.batch === speed.day ? fill(api, 'speedSame', { n: percentText(speed.batch) }) : fill(api, 'speedSplit', { batch: percentText(speed.batch), day: percentText(speed.day) }));
        var body = target('troopLines');
        body.replaceChildren.apply(body, plan.lines.filter(function (line) { return line.troops; }).map(function (line) {
          var row = document.createElement('tr'), head = document.createElement('th');
          head.scope = 'row'; head.textContent = fill(api, 'troopLine.' + (line.group === 'batch' && plan.buff ? 'batchBuff' : line.group), { tier: line.tier });
          row.append(head);
          [line.troops, line.rate, line.points].forEach(function (n) { var cell = document.createElement('td'); cell.textContent = api.fmt(n); row.append(cell); });
          return row;
        }));
        put('troopCount', api.fmt(plan.troops)); put('troopPoints', api.fmt(plan.points));
        plan.unverified.forEach(function (id) { text.push(fill(api, 'troopUnchecked', { tier: R.missing(id).tier })); });
      } else text.push(t(api, 'troopPlanNone'));
      put('troopPlan', text.join(' '));
    }
    context.listen(document, 'town-centre:calculated', function (e) {
      troopEvent = e.detail.event; troopResult = e.detail.results[troopEvent].troops;
      renderTroops(store.snapshot());
    });
    function render() {
      var snapshot = store.snapshot(), pieces = snapshot.heroGear.pieces, set = 0, plan = B.plan(snapshot);
      renderBuildings(snapshot, plan);
      renderTroops(snapshot);
      var gear = store.governor('gear'), charms = store.governor('charms');
      context.nodes('[data-count]').forEach(function (tile) {
        var amount = confirmed(snapshot, tile.dataset.count);
        tile.dataset.state = amount === null ? 'unknown' : 'confirmed';
        tile.querySelector('[data-amount]').textContent = amount === null ? '?' : api.fmt(amount);
      });
      context.nodes('[data-duration]').forEach(function (tile) {
        var minutes = confirmed(snapshot, tile.dataset.duration);
        tile.dataset.state = minutes === null ? 'unknown' : 'confirmed';
        tile.querySelector('[data-amount]').textContent = minutes === null ? '?' : duration(api, minutes);
      });
      context.nodes('[data-piece]').forEach(function (tile) {
        var piece = Object.hasOwn(pieces, tile.dataset.piece) ? pieces[tile.dataset.piece] : null;
        if (piece) set++;
        tile.dataset.state = piece ? 'set' : 'unset';
        paintHero(tile.querySelector('.town-gear-item'), piece);
      });
      put('pieces', fill(api, 'pieces', { n: api.fmt(set) }));
      context.nodes('[data-gov]').forEach(function (tile) {
        var id = tile.dataset.gov;
        tile.dataset.state = govState(gear[id]);
        paintCard(tile.querySelector('.town-gov-card'), id, gear[id]);
        tile.querySelectorAll('[data-charm]').forEach(function (gem) { paintGem(gem, id.split('-')[0], charms[gem.dataset.charm]); });
        tile.setAttribute('aria-label', tileName(tile) + ': ' + govLevelName(gear[id]));
      });
      put('gearScore', score('gear', gear)); put('charmScore', score('charms', charms));
      var gearGain = T.governorGain(snapshot, 'gear').score, charmGain = T.governorGain(snapshot, 'charms').score;
      put('gain', gearGain === null && charmGain === null ? t(api, 'gainUnknown') : fill(api, 'gainBoth', { gear: gearGain === null ? '—' : api.fmt(gearGain), charms: charmGain === null ? '—' : api.fmt(charmGain) }));
      renderDialog(snapshot, gear, charms, plan);
    }
    function value(input, next) { if (input !== document.activeElement) input.value = next === null || next === undefined ? '' : next; }
    function rateText(id) {
      var top = T.topRate(id);
      if (!top) return t(api, 'noRate');
      return fill(api, /^speedup-/.test(id) ? 'topRateMinute' : 'topRate', { rate: api.fmt(top.rate), event: eventName(api, top.event), day: api.fmt(top.day) });
    }
    function renderDialog(snapshot, gear, charms, plan) {
      if (!dialog || !editing) return;
      dialog.querySelectorAll('[data-panel]').forEach(function (panel) { panel.hidden = panel.dataset.panel !== editing.type; });
      target('clear').hidden = editing.type === 'hero';
      if (editing.type === 'count') {
        value(dialog.querySelector('[data-field="count"]'), confirmed(snapshot, editing.id));
        put('rate', rateText(editing.id));
      } else if (editing.type === 'duration') {
        var minutes = confirmed(snapshot, editing.id), inputs = dialog.querySelectorAll('[data-unit]');
        var typing = Array.from(inputs).some(function (input) { return input === document.activeElement; });
        var parts = minutes === null ? null : { d: Math.floor(minutes / 1440), h: Math.floor(minutes % 1440 / 60), m: minutes % 60 };
        if (!typing) inputs.forEach(function (input) { input.value = parts ? parts[input.dataset.unit] : ''; });
        put('durationRate', rateText(editing.id));
      } else if (editing.type === 'hero') {
        var piece = Object.hasOwn(snapshot.heroGear.pieces, editing.id) ? snapshot.heroGear.pieces[editing.id] : null;
        var view = target('heroArt'), troop = editing.id.split('-')[0], slot = editing.id.split('-')[1];
        setSrc(view.querySelector('img'), '../img/hero-gear/' + { inf: 'infantry', cav: 'cavalry', arc: 'archer' }[troop] + '-' + slot + '.webp');
        paintHero(view, piece);
        dialog.querySelectorAll('[data-quality][data-action]').forEach(function (chip) { chip.setAttribute('aria-pressed', String(!!piece && piece.quality === chip.dataset.quality)); });
        var level = dialog.querySelector('input[data-field="level"]'), mastery = dialog.querySelector('input[data-field="mastery"]');
        value(level, piece ? piece.level : null); value(mastery, piece ? piece.mastery : null);
        level.max = piece && piece.quality === 'epic' ? 80 : piece && piece.quality === 'mythic' ? 100 : 200;
        target('masteryRow').hidden = !!piece && piece.quality === 'epic';
      } else if (editing.type === 'training') {
        var facts = (snapshot.training && snapshot.training.facts) || {}, input = dialog.querySelector('[data-field="training"]'), speed = editing.id === 'speed';
        input.step = speed ? 'any' : '1'; input.min = speed ? '0' : '1'; input.inputMode = speed ? 'decimal' : 'numeric';
        value(input, Object.hasOwn(facts, editing.id) ? facts[editing.id] : null);
        put('trainingUnit', t(api, speed ? 'speedUnit' : 'capacityUnit')); put('trainingHint', t(api, speed ? 'speedHint' : 'capacityHint'));
      } else if (editing.type === 'position') {
        dialog.querySelector('select[data-field="position"]').value = (snapshot.preferences.training && snapshot.preferences.training.position) || '';
        put('positionHint', t(api, 'positionHint'));
      } else if (editing.type === 'tier') {
        var tiers = (snapshot.training && snapshot.training.facts) || {};
        dialog.querySelector('select[data-field="tier"]').value = Object.hasOwn(tiers, editing.id) ? String(tiers[editing.id]) : '';
        put('tierHint', t(api, 'tierHint'));
      } else if (editing.type === 'building') {
        var select = dialog.querySelector('select[data-field="building"]'), options = B.options(editing.id);
        var level = snapshot.buildings && Object.hasOwn(snapshot.buildings.levels, editing.id) ? snapshot.buildings.levels[editing.id] : '';
        if (select.dataset.options !== editing.id) {
          var blank = element('option', '', api.tr('gov.notSet', 'not set')); blank.value = '';
          select.replaceChildren(blank);
          options.forEach(function (id) { var option = element('option', '', levelName(id)); option.value = id; select.appendChild(option); });
          select.dataset.options = editing.id;
        }
        select.value = level;
        var step = plan.buildings[editing.id];
        put('buildingPlan', !step ? '' : step.steps ? fill(api, 'buildingPlan', { level: step.to, steps: api.fmt(step.steps), gold: api.fmt(step.truegold), tempered: api.fmt(step.tempered) }) : t(api, 'buildingPlanNone'));
      } else if (editing.type === 'gov') {
        var id = editing.id, index = gear[id];
        paintCard(target('govArt'), id, index);
        put('govLevel', govLevelName(index));
        dialog.querySelector('select[data-level="gear"]').value = index === null ? '' : String(index);
        dialog.querySelectorAll('select[data-charm-slot]').forEach(function (select) { var level = charms[id + '-' + select.dataset.charmSlot]; select.value = level === null ? '' : String(level); });
        dialog.querySelectorAll('.town-gov-gem[data-charm-slot]').forEach(function (gem) { paintGem(gem, id.split('-')[0], charms[id + '-' + gem.dataset.charmSlot]); });
      }
    }
    function labelOptions() {
      var all = target('setAllLevel');
      if (all) {
        var keep = all.value, blank = element('option', '', t(api, 'setAllPick')); blank.value = '';
        all.replaceChildren(blank);
        B.options('town-center').forEach(function (id) { var option = element('option', '', id); option.value = id; all.appendChild(option); });
        if (keep) all.value = keep;
      }
      if (!dialog) return;
      Array.from(dialog.querySelector('select[data-level="gear"]').options).forEach(function (option) { if (Number(option.value) > 0) option.textContent = govLevelName(Number(option.value)); });
    }
    function write(fn) { try { fn(); } catch (cause) { render(); throw cause; } }
    function writePiece(change) {
      var snapshot = store.snapshot(), old = Object.hasOwn(snapshot.heroGear.pieces, editing.id) ? snapshot.heroGear.pieces[editing.id] : null;
      var next = Object.assign({ quality: 'mythic', level: 0, mastery: 0 }, old || {}, change), state = store.heroGear(H);
      state.pieces[editing.id] = H.normalisePiece(next);
      write(function () { store.writeHeroGear(state, H, { piece: editing.id }); });
    }
    function writeGov(kind, id, level) { var change = {}; change[id] = level; write(function () { store.setGovernor(kind, change); }); }
    context.listen(root, 'tabs:select', function (e) {
      if (e.detail.binding === 'town-shelf') context.nodes('[data-shelf]').forEach(function (panel) { panel.hidden = panel.dataset.shelf !== e.detail.value; });
      else if (e.detail.binding === 'town-troop') context.nodes('[data-troop-board]').forEach(function (board) { board.hidden = board.dataset.troopBoard !== e.detail.value; });
    });
    if (dialog) {
      context.listen(dialog, 'close', function () { editing = null; });
      context.listen(dialog, 'click', function (event) { if (event.target === dialog) dialog.close(); });
    }
    context.cleanup(store.subscribe(render));
    return { refresh: function () { labelOptions(); render(); }, actions: {
      edit: { run: function (tile) {
        if (!dialog) return;
        editing = tile.dataset.count ? { type: 'count', id: tile.dataset.count } : tile.dataset.duration ? { type: 'duration', id: tile.dataset.duration } : tile.dataset.piece ? { type: 'hero', id: tile.dataset.piece } : tile.dataset.building ? { type: 'building', id: tile.dataset.building } : tile.dataset.training ? { type: tile.dataset.training === 'position' ? 'position' : /^(speed|capacity)$/.test(tile.dataset.training) ? 'training' : 'tier', id: tile.dataset.training } : { type: 'gov', id: tile.dataset.gov };
        var name = tileName(tile);
        if (editing.type === 'hero') name = api.tr('gear.' + editing.id.split('-')[0], TROOPS[editing.id.split('-')[0]]) + ' · ' + name;
        put('title', name);
        render();
        if (!dialog.open) dialog.showModal();
        var first = dialog.querySelector('[data-panel="' + editing.type + '"] input, [data-panel="' + editing.type + '"] select');
        if (first && editing.type !== 'hero') first.focus();
      } },
      close: { run: function () { dialog.close(); } },
      count: { events: ['input'], run: function (input) {
        if (!editing || !input.validity.valid) return;
        write(function () { store.setBalance(editing.id, input.value === '' ? null : Number(input.value)); });
      } },
      duration: { events: ['input'], run: function () {
        if (!editing) return;
        var inputs = Array.from(dialog.querySelectorAll('[data-unit]')), minutes = 0;
        if (!inputs.every(function (input) { return input.validity.valid; })) return;
        var blank = inputs.every(function (input) { return input.value === ''; });
        inputs.forEach(function (input) { minutes += (Number(input.value) || 0) * UNIT[input.dataset.unit]; });
        if (!blank && !(Number.isSafeInteger(minutes) && minutes <= 1e9)) return;
        write(function () { store.setBalance(editing.id, blank ? null : minutes); });
      } },
      settle: { events: ['change'], run: function (input) { input.blur(); render(); } },
      quality: { run: function (chip) { if (editing) writePiece({ quality: chip.dataset.quality }); } },
      piece: { events: ['change'], run: function (input) {
        if (!editing || !input.validity.valid || input.value === '') { render(); return; }
        var change = {}; change[input.dataset.field] = Number(input.value); input.blur(); writePiece(change);
      } },
      step: { run: function (button) {
        if (!editing) return;
        var input = dialog.querySelector('input[data-field="' + button.dataset.field + '"]'), change = {};
        change[button.dataset.field] = Math.max(0, (Number(input.value) || 0) + Number(button.dataset.step));
        writePiece(change);
      } },
      training: { events: ['input'], run: function (input) {
        if (!editing || !input.validity.valid) return;
        var fact = input.value === '' ? null : Number(input.value);
        if (fact !== null && (editing.id === 'capacity' ? !Number.isSafeInteger(fact) || fact < 1 || fact > 1e9 : !(fact >= 0 && fact <= 100000))) return;
        write(function () { store.setTraining(editing.id, fact); });
      } },
      tier: { events: ['change'], run: function (select) {
        if (!editing) return;
        write(function () { store.setTraining(editing.id, select.value === '' ? null : Number(select.value)); });
      } },
      buff: { run: function () { write(function () { store.setTrainingBuff(!store.training().buff); }); } },
      plan: { run: function (tile) { write(function () { store.setTrainingPlan(tile.dataset.plan, !store.training()[tile.dataset.plan]); }); } },
      position: { events: ['change'], run: function (select) { write(function () { store.setTrainingPlan('position', select.value || null); }); } },
      buildingLevel: { events: ['change'], run: function (select) {
        if (!editing) return;
        write(function () { store.setBuilding(editing.id, select.value === '' ? null : select.value); });
      } },
      buildingStep: { run: function (button) {
        if (!editing) return;
        var options = B.options(editing.id), levels = store.buildings().levels, now = Object.hasOwn(levels, editing.id) ? options.indexOf(levels[editing.id]) : -1;
        var next = Math.min(options.length - 1, Math.max(0, now + Number(button.dataset.step)));
        if (now !== -1 && next === now) return;
        write(function () { store.setBuilding(editing.id, options[now === -1 ? 0 : next]); });
      } },
      setAll: { run: function () {
        var level = target('setAllLevel').value, levels = {};
        if (!level) return;
        B.BUILDINGS.forEach(function (b) { levels[b.id] = B.clamp(b.id, level); });
        write(function () { store.setBuildings(levels); });
      } },
      priority: { events: ['change'], run: function (select) {
        var change = {}; change[select.dataset.tierFor] = Number(select.value);
        write(function () { store.setBuildingPriorities({ tiers: change }); });
      } },
      move: { run: function (button) {
        var order = B.priorities(store.snapshot()).order, at = order.indexOf(button.dataset.moveFor), to = at + Number(button.dataset.step);
        if (at < 0 || to < 0 || to >= order.length) return;
        order.splice(to, 0, order.splice(at, 1)[0]);
        write(function () { store.setBuildingPriorities({ order: order }); });
        var again = root.querySelector('[data-move-for="' + button.dataset.moveFor + '"][data-step="' + button.dataset.step + '"]');
        if (again && !again.disabled) again.focus();
      } },
      govLevel: { events: ['change'], run: function (select) {
        if (!editing) return;
        writeGov(select.dataset.level, select.dataset.charmSlot ? editing.id + '-' + select.dataset.charmSlot : editing.id, select.value === '' ? null : Number(select.value));
      } },
      govStep: { run: function (button) {
        if (!editing) return;
        var slot = button.dataset.charmSlot, kind = slot ? 'charms' : 'gear', id = slot ? editing.id + '-' + slot : editing.id;
        var now = store.governor(kind)[id], next = Math.min(G.max(kind), Math.max(0, (now || 0) + Number(button.dataset.step)));
        if (now !== null && next === now) return;
        writeGov(kind, id, next);
      } },
      clear: { run: function () {
        if (!editing) return;
        if (editing.type === 'gov') { var change = {}; change[editing.id] = null; var charms = {}; [1, 2, 3].forEach(function (c) { charms[editing.id + '-' + c] = null; }); write(function () { store.setGovernor('gear', change); store.setGovernor('charms', charms); }); }
        else if (editing.type === 'building') write(function () { store.setBuilding(editing.id, null); });
        else if (editing.type === 'position') write(function () { store.setTrainingPlan('position', null); });
        else if (editing.type === 'training' || editing.type === 'tier') write(function () { store.setTraining(editing.id, null); });
        else if (editing.type !== 'hero') write(function () { store.setBalance(editing.id, null); });
      } }
    } };
  });
})();
