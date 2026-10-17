/* Pure Town Centre arithmetic: what the whole ledger can score in each event.
   Bag items come from the shared event rules; speedups and governor score are read
   from the same rule rows, so no rate is copied here. Hero shards and widgets count
   only the pieces an owned hero can consume (HeroSpend), the same plan the Heroes page
   shows; forgehammers and mithril only what your hero gear can take (HeroGear.spendable);
   Truegold and Tempered Truegold only what your buildings can take (BuildingSpend);
   governor score only what the governor planner can buy with your materials. Inventory is spent once, so an event's best total puts each holding on the
   day it scores most. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../_data/event_rules.json'), require('./event-rules.js'), require('./governor-engine.js'), require('./hero-spend.js'), require('./hero-gear-engine.js'), require('./building-spend.js'));
  else root.TownCentre = factory(root.EventRuleData, root.EventRules, root.Governor, root.HeroSpend, root.HeroGear, root.BuildingSpend);
})(typeof window === 'object' ? window : globalThis, function (data, rules, governor, heroes, gearEngine, buildingSpend) {
  'use strict';
  // Speedup balances are minutes. General speedups can pay for any timer, so they score wherever a speedup row does.
  var SPEEDUPS = ['general', 'construction', 'research', 'training', 'learning', 'healing'].map(function (kind) { return { id: 'speedup-' + kind, kind: kind }; });
  var RESOURCES = ['bread', 'wood', 'stone', 'iron'];
  var GOVERNOR_ROWS = { gear: /^governor gear max score \+1$/i, charms: /^governor charm max score \+1$/i };
  function rate(row) { var value = Number(String(row.points).replace(/,/g, '')); return Number.isSafeInteger(value) && value > 0 ? value : null; }
  function confirmed(snapshot, id) { var entry = snapshot.inventory && Object.hasOwn(snapshot.inventory, id) ? snapshot.inventory[id] : null; return entry && entry.status === 'confirmed' ? entry.amount : null; }
  function speedupKinds(label) {
    var l = String(label).toLowerCase();
    if (!/speedup/.test(l)) return null;
    if (/all kinds/.test(l) || /^1 ?m(in)? speedups$/.test(l.trim())) return SPEEDUPS.map(function (s) { return s.kind; });
    var kinds = ['general'];
    if (/construction/.test(l)) kinds.push('construction');
    if (/research/.test(l)) kinds.push('research');
    if (/training/.test(l)) kinds.push('training');
    if (/learning|master/.test(l)) kinds.push('learning');
    return kinds;
  }
  function governorKind(label) { return Object.keys(GOVERNOR_ROWS).find(function (kind) { return GOVERNOR_ROWS[kind].test(String(label).trim()); }) || null; }
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
  function context(snapshot) { return { score: { gear: governorGain(snapshot, 'gear'), charms: governorGain(snapshot, 'charms') }, heroes: heroes.plan(snapshot), gear: heroGearSpend(snapshot), buildings: buildingSpend.plan(snapshot) }; }
  // The snapshot events score: hero pieces, gear materials and Truegold replaced by what can be spent.
  function budget(snapshot, shared) {
    var out = heroes.budget(snapshot, shared.heroes);
    [shared.gear.items, shared.buildings.items].forEach(function (items) {
      Object.keys(items).forEach(function (id) { var amount = items[id].amount; if (amount !== null) out.inventory[id] = { amount: amount, status: 'confirmed', provenance: null }; });
    });
    return out;
  }
  function usable(shared, id) { return [shared.heroes.items, shared.gear.items, shared.buildings.items].reduce(function (found, items) { return found || (Object.hasOwn(items, id) ? items[id] : null); }, null); }
  function day(snapshot, event, number, known) {
    var shared = known || context(snapshot), score = shared.score;
    var base = rules.calculate(budget(snapshot, shared), event, number, null, null), selected = rules.rules(event, number);
    var lines = [], unknown = base.unknown.slice(), unquantified = [], counted = Object.create(null);
    base.items.forEach(function (item) {
      var spend = usable(shared, item.id);
      if (item.eligible && spend) spend.unknown.forEach(function (id) { if (!unknown.includes(id)) unknown.push(id); });
      if (item.eligible && item.points !== null && (!spend || item.amount > 0)) lines.push({ kind: spend ? 'usable' : 'item', id: item.id, amount: item.amount, rate: item.rate, points: item.points });
    });
    selected.rows.forEach(function (row) {
      if (row.items) return;
      var kinds = speedupKinds(row.label), gov = governorKind(row.label), each = rate(row);
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
    lines.sort(function (a, b) { return b.points - a.points; });
    return { event: event, day: number, lines: lines, total: lines.reduce(function (sum, line) { return sum + line.points; }, 0), unknown: unknown, complete: !unknown.length, unquantified: unquantified };
  }
  // Each holding on the day it scores most. Days are alternatives, so this is not the sum of the days.
  function best(snapshot, event) {
    var shared = context(snapshot), days = rules.days(event).map(function (entry) { return day(snapshot, event, entry.day, shared); });
    var top = Object.create(null), unknown = Object.create(null);
    days.forEach(function (result) {
      result.unknown.forEach(function (id) { unknown[id] = true; });
      result.lines.forEach(function (line) { if (!top[line.id] || line.rate > top[line.id].rate) top[line.id] = Object.assign({ day: result.day }, line); });
    });
    var lines = Object.keys(top).map(function (id) { return top[id]; }).sort(function (a, b) { return b.points - a.points; });
    return { event: event, days: days, lines: lines, total: lines.reduce(function (sum, line) { return sum + line.points; }, 0), unknown: Object.keys(unknown), complete: !Object.keys(unknown).length, governor: shared.score, heroes: shared.heroes, gear: shared.gear, buildings: shared.buildings };
  }
  // The highest rate any event day pays for one unit, for labelling inventory rows.
  function topRate(id) {
    var out = null;
    Object.keys(data.events).forEach(function (event) {
      data.events[event].forEach(function (entry) {
        entry.rows.forEach(function (row) {
          var each = null;
          if (row.items) row.items.forEach(function (item) { if (item.id === id) each = item.rate; });
          else if (/^speedup-/.test(id) && (speedupKinds(row.label) || []).includes(id.slice(8))) each = rate(row);
          if (each && (!out || each > out.rate)) out = { event: event, day: entry.day, rate: each };
        });
      });
    });
    return out;
  }
  return { SPEEDUPS: SPEEDUPS, RESOURCES: RESOURCES, speedupKinds: speedupKinds, governorKind: governorKind, governorGain: governorGain, heroGearSpend: heroGearSpend, context: context, day: day, best: best, topRate: topRate };
});
