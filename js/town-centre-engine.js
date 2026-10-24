/* Pure Town Centre arithmetic: what the whole ledger can score in each event.
   Bag items come from the shared event rules; speedups and governor score are read
   from the same rule rows, so no rate is copied here. Hero shards and widgets count
   only the pieces an owned hero can consume (HeroSpend), the same plan the Heroes page
   shows; forgehammers and mithril only what your hero gear can take (HeroGear.spendable);
   Truegold and Tempered Truegold only what your buildings can take (BuildingSpend);
   governor score only what the governor planner can buy with your materials; troops only
   what your camps can train with the speedups and resources left (TroopSpend); master
   emblems and manuscripts only what your masters can take (MasterSpend). Inventory
   is spent once, so an event's best total puts each holding on the day it scores most. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../_data/event_rules.json'), require('./event-rules.js'), require('./governor-engine.js'), require('./hero-spend.js'), require('./hero-gear-engine.js'), require('./building-spend.js'), require('./troop-spend.js'), require('./master-spend.js'));
  else root.TownCentre = factory(root.EventRuleData, root.EventRules, root.Governor, root.HeroSpend, root.HeroGear, root.BuildingSpend, root.TroopSpend, root.MasterSpend);
})(typeof window === 'object' ? window : globalThis, function (data, rules, governor, heroes, gearEngine, buildingSpend, troopSpend, masterSpend) {
  'use strict';
  // Speedup balances are minutes. General speedups can pay for any timer, so they score wherever a speedup row does.
  var SPEEDUPS = ['general', 'construction', 'research', 'training', 'learning', 'healing'].map(function (kind) { return { id: 'speedup-' + kind, kind: kind }; });
  var RESOURCES = ['bread', 'wood', 'stone', 'iron'];
  var rate = rules.rate, speedupKinds = rules.speedupKinds, governorKind = rules.governorKind;
  function confirmed(snapshot, id) { var entry = snapshot.inventory && Object.hasOwn(snapshot.inventory, id) ? snapshot.inventory[id] : null; return entry && entry.status === 'confirmed' ? entry.amount : null; }
  // Score the bag's governor materials could add, spending them for score. Unknown levels or materials make it unknown.
  function governorGain(snapshot, kind) {
    var section = kind === 'gear' ? snapshot.governorGear : snapshot.governorCharms, field = kind === 'gear' ? 'pieces' : 'slots';
    var levels = {}, any = false, bag = {}, missing = false;
    governor.items(kind).forEach(function (item) {
      var entry = section && section.status === 'tracked' && Object.hasOwn(section[field] || {}, item.id) ? section[field][item.id] : null;
      levels[item.id] = entry ? entry.level : null; if (entry) any = true;
    });
    governor.data[kind].materials.forEach(function (id) { var have = confirmed(snapshot, id); if (have === null) missing = true; bag[id] = have || 0; });
    if (!any || missing) return { kind: kind, score: null, steps: 0 };
    var plan = governor.plan(kind, levels, bag, { goal: 'score', limit: 2000 });
    return { kind: kind, score: plan.score, steps: plan.steps.length };
  }
  // Everything a day needs that does not depend on the day: governor score gains and the hero spending plan.
  /* Forgehammers and mithril the saved hero gear can absorb, paid with the XP, hammers and
     spare mythic gear in the bag. An unknown hammer or mithril count stays unknown; unknown
     XP or spare mythic gear, or no saved pieces, count as nothing and are listed. */
  var GEAR = { hammers: 'forgehammer', mithril: 'mithril' }, GEAR_BAG = { xp: 'hero-gear-xp', hammers: 'forgehammer', mythic: 'spare-mythic-gear', mithril: 'mithril' };
  function heroGearSpend(snapshot) {
    var pieces = (snapshot.heroGear && snapshot.heroGear.pieces) || {}, bag = {}, missing = [], items = {};
    Object.keys(GEAR_BAG).forEach(function (r) { bag[r] = confirmed(snapshot, GEAR_BAG[r]); if (bag[r] === null && (r === 'xp' || r === 'mythic')) missing.push(GEAR_BAG[r]); });
    if (!Object.keys(pieces).length) missing.push('hero-gear-pieces');
    var plan = gearEngine.spendable(pieces, { xp: bag.xp || 0, hammers: bag.hammers || 0, mythic: bag.mythic || 0, mithril: bag.mithril || 0 });
    Object.keys(GEAR).forEach(function (r) { items[GEAR[r]] = { amount: bag[r] === null ? null : plan.spent[r], unknown: bag[r] === null ? [] : missing.slice() }; });
    return { items: items, plan: plan };
  }
  function context(snapshot) { return { score: { gear: governorGain(snapshot, 'gear'), charms: governorGain(snapshot, 'charms') }, heroes: heroes.plan(snapshot), gear: heroGearSpend(snapshot), buildings: buildingSpend.plan(snapshot), buildingsMax: buildingSpend.plan(snapshot, { goal: 'points' }), masters: masterSpend.plan(snapshot) }; }
  /* Points a building plan's Truegold and Tempered Truegold score in an event, each on its
     best day. Totals follow the player's priorities; the points-only plan is the ceiling. */
  function buildingPoints(plan, event) {
    var total = 0;
    buildingSpend.ITEMS.forEach(function (id) {
      var amount = plan.items[id].amount, best = 0;
      rules.days(event).forEach(function (entry) { entry.rows.forEach(function (row) { (row.items || []).forEach(function (item) { if (item.id === id && item.rate > best) best = item.rate; }); }); });
      total += (amount || 0) * best;
    });
    return total;
  }
  // The snapshot events score: hero pieces, gear materials, Truegold and master items replaced by what can be spent.
  function budget(snapshot, shared) {
    var out = heroes.budget(snapshot, shared.heroes);
    [shared.gear.items, shared.buildings.items, shared.masters.items].forEach(function (items) {
      Object.keys(items).forEach(function (id) { var amount = items[id].amount; if (amount !== null) out.inventory[id] = { amount: amount, status: 'confirmed', provenance: null }; });
    });
    return out;
  }
  function usable(shared, id) { return [shared.heroes.items, shared.gear.items, shared.buildings.items, shared.masters.items].reduce(function (found, items) { return found || (Object.hasOwn(items, id) ? items[id] : null); }, null); }
  function day(snapshot, event, number, known) {
    var shared = known || context(snapshot), score = shared.score;
    var base = rules.calculate(budget(snapshot, shared), event, number, null, null), selected = rules.rules(event, number);
    var lines = [], unknown = base.unknown.slice(), unknownItems = Object.create(null), unquantified = [], counted = Object.create(null), troops = troopSpend.rates(selected.rows, event), trained = null;
    function note(id) { if (!unknown.includes(id)) unknown.push(id); }
    base.items.forEach(function (item) {
      var spend = usable(shared, item.id);
      unknownItems[item.id] = item.eligible ? (item.amount === null ? [item.id] : []).concat(spend ? spend.unknown : []) : [];
      if (item.eligible && spend) spend.unknown.forEach(function (id) { if (!unknown.includes(id)) unknown.push(id); });
      if (item.eligible && item.points !== null && (!spend || item.amount > 0)) lines.push({ kind: spend ? 'usable' : 'item', id: item.id, amount: item.amount, rate: item.rate, points: item.points });
    });
    selected.rows.forEach(function (row) {
      if (row.items || troops && troops.rows.includes(row)) return;
      var kinds = speedupKinds(row), gov = governorKind(row), each = rate(row);
      if (kinds && each) kinds.forEach(function (kind) {
        var id = 'speedup-' + kind; if (counted[id]) return; counted[id] = true;
        var amount = confirmed(snapshot, id);
        if (amount === null) unknown.push(id); else lines.push({ kind: 'speedup', id: id, amount: amount, rate: each, points: amount * each });
      });
      else if (gov && each) {
        var gain = score[gov].score;
        if (gain === null) unknown.push('governor-' + gov); else lines.push({ kind: 'governor', id: 'governor-' + gov, amount: gain, rate: each, points: gain * each });
      } else unquantified.push(row);
    });
    /* Troops: a pre-trained batch, then what the training and general speedups can train with
       the resources the buildings leave. Troops trained with speedups share a group with those
       speedups, so the best total spends each speedup on one day. */
    if (troops) {
      trained = troopSpend.plan(snapshot, troops.rates, shared.buildings.resources, event);
      trained.unknown.forEach(note);
      trained.lines.forEach(function (line) {
        var group = line.group === 'batch' ? 'troops-batch' : 'speedup-' + line.group;
        lines.push({ kind: 'troops', id: 'troops-' + line.group + '-t' + line.tier, group: group, training: line.group, tier: line.tier, amount: line.troops, rate: line.rate, points: line.points });
      });
    }
    lines.sort(function (a, b) { return b.points - a.points; });
    return { event: event, day: number, lines: lines, total: lines.reduce(function (sum, line) { return sum + line.points; }, 0), unknown: unknown, unknownItems: unknownItems, complete: !unknown.length, unquantified: unquantified, troops: trained };
  }
  /* Each holding on the day it scores most. Days are alternatives, so this is not the sum of
     the days. Lines that spend the same holding share a group (a speedup kind and the troops
     it trains), and a group is taken whole from the one day it scores most. */
  function best(snapshot, event, known, knownDays) {
    var shared = known || context(snapshot), days = knownDays || rules.days(event).map(function (entry) { return day(snapshot, event, entry.day, shared); });
    var top = Object.create(null), unknown = Object.create(null);
    days.forEach(function (result) {
      result.unknown.forEach(function (id) { unknown[id] = true; });
      var groups = Object.create(null);
      result.lines.forEach(function (line) {
        var key = line.group || line.id, group = groups[key] || (groups[key] = { points: 0, rate: 0, lines: [] });
        group.points += line.points; group.rate = Math.max(group.rate, line.rate); group.lines.push(Object.assign({ day: result.day }, line));
      });
      Object.keys(groups).forEach(function (key) {
        var group = groups[key], old = top[key];
        if (!old || group.points > old.points || group.points === old.points && group.rate > old.rate) top[key] = group;
      });
    });
    var lines = [].concat.apply([], Object.keys(top).map(function (key) { return top[key].lines; })).sort(function (a, b) { return b.points - a.points; });
    return { event: event, days: days, lines: lines, total: lines.reduce(function (sum, line) { return sum + line.points; }, 0), unknown: Object.keys(unknown), complete: !Object.keys(unknown).length, governor: shared.score, heroes: shared.heroes, gear: shared.gear, buildings: shared.buildings, buildingsMax: shared.buildingsMax, masters: shared.masters, troops: troopDay(days) };
  }
  // The troop plan of the day whose troops score most, for the Troops shelf.
  function troopDay(days) { return days.reduce(function (found, result) { return result.troops && (!found || result.troops.points > found.plan.points) ? { day: result.day, plan: result.troops } : found; }, null); }
  // The highest rate any event day pays for one unit, for labelling inventory rows.
  function topRate(id) {
    if (/^hero-widget-chest-gen[1-7]$/.test(id)) id = heroes.WIDGET_ITEM;
    if (id === masterSpend.GENERAL) id = masterSpend.EMBLEM;
    var out = null;
    Object.keys(data.events).forEach(function (event) {
      data.events[event].forEach(function (entry) {
        entry.rows.forEach(function (row) {
          var each = null;
          if (row.items) row.items.forEach(function (item) { if (item.id === id) each = item.rate; });
          else if (/^speedup-/.test(id) && (speedupKinds(row) || []).includes(id.slice(8))) each = rate(row);
          if (each && (!out || each > out.rate)) out = { event: event, day: entry.day, rate: each };
        });
      });
    });
    return out;
  }
  var calculators = new WeakMap();
  function forLedger(store) {
    if (calculators.has(store)) return calculators.get(store);
    var saved, shared, days, results, availability;
    function refresh() {
      var next = store.snapshot();
      if (!saved || next.revision !== saved.revision || next.updatedAt !== saved.updatedAt) {
        saved = next;
        shared = context(saved);
        days = Object.create(null);
        results = Object.create(null);
        availability = Object.create(null);
      }
      return saved;
    }
    function selected(event, number) {
      refresh();
      var key = event + ':' + number;
      if (!Object.hasOwn(days, key)) days[key] = day(saved, event, number, shared);
      return days[key];
    }
    function eventBest(event) {
      refresh();
      if (!Object.hasOwn(results, event)) {
        var list = rules.days(event).map(function (entry) { return selected(event, entry.day); });
        results[event] = best(saved, event, shared, list);
      }
      return results[event];
    }
    var calculator = {
      snapshot: refresh,
      context: function () { refresh(); return shared; },
      day: selected,
      best: eventBest,
      available: function (event, number, held, target) {
        refresh();
        var key = JSON.stringify([event, number, Object.keys(held || {}).sort().map(function (id) { return [id, held[id]]; })]);
        if (!Object.hasOwn(availability, key)) availability[key] = available(saved, event, number, held, null, { original: selected(event, number) });
        if (target !== null && target !== undefined && (!Number.isSafeInteger(target) || target < 0 || target > 1e9)) throw new Error('Invalid point target');
        return Object.assign({}, availability[key], { shortfall: target === null || target === undefined ? null : Math.max(0, target - availability[key].total) });
      },
      all: function () {
        refresh();
        Object.keys(data.events).forEach(eventBest);
        return { snapshot: saved, context: shared, results: results };
      }
    };
    calculators.set(store, calculator);
    return calculator;
  }
  function available(snapshot, event, number, held, target, known) {
    held = held || {};
    var inventory = Object.assign({}, snapshot.inventory), reserved = Object.create(null);
    Object.keys(held).forEach(function (id) {
      var count = held[id];
      if (!Number.isSafeInteger(count) || count < 0 || count > 1e9) throw new Error('Invalid reservation');
      var amount = confirmed(snapshot, id);
      reserved[id] = amount === null ? 0 : Math.min(count, amount);
      if (amount !== null) inventory[id] = Object.assign({}, inventory[id], { amount: amount - reserved[id] });
    });
    if (target !== null && target !== undefined && (!Number.isSafeInteger(target) || target < 0 || target > 1e9)) throw new Error('Invalid point target');
    var original = known && known.original || day(snapshot, event, number);
    var remaining = Object.values(reserved).some(function (n) { return n > 0; }) ? day(Object.assign({}, snapshot, { inventory: inventory }), event, number) : original;
    var rates = Object.create(null), lines = Object.create(null);
    rules.rules(event, number).rows.forEach(function (row) {
      (row.items || []).forEach(function (item) { rates[item.id] = item.rate; });
    });
    remaining.lines.forEach(function (line) { lines[line.id] = line; });
    var items = data.items.map(function (item) {
      var amount = confirmed(snapshot, item.id), line = lines[item.id];
      return {
        id: item.id, label: item.label, eligible: Object.hasOwn(rates, item.id), rate: rates[item.id] || 0,
        amount: amount, reserved: reserved[item.id] || 0, usable: line ? line.amount : 0,
        points: line && line.points > 0 ? line.points : (remaining.unknownItems[item.id] || []).length ? null : 0
      };
    });
    return Object.assign({}, remaining, {
      items: items, inventoryPoints: original.total, reservedPoints: Math.max(0, original.total - remaining.total),
      shortfall: target === null || target === undefined ? null : Math.max(0, target - remaining.total)
    });
  }
  return { SPEEDUPS: SPEEDUPS, RESOURCES: RESOURCES, speedupKinds: speedupKinds, governorKind: governorKind, governorGain: governorGain, heroGearSpend: heroGearSpend, context: context, buildingPoints: buildingPoints, day: day, best: best, topRate: topRate, forLedger: forLedger, available: available };
});

