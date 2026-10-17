/* What your buildings can actually take. Event points for Truegold and Tempered Truegold
   are paid per piece spent on a building upgrade, so a piece only scores if a recorded
   building still has a step it can pay for. One plan serves the Town Centre totals and its
   Buildings shelf, so both count the same spendable pieces.

   Costs and prerequisites come from _data/buildings.json (.dsh/build-buildings.py), which
   publishes a cost cell only where two sources agree and stops at TG 8. A step is paid
   whole, with every resource it lists, and only once its prerequisites are met in the plan:
   the Town Centre level it needs, and the Embassy, troop building or Academy it names.
   Two goals share that rule. 'priority' (the default) follows the player's own upgrade
   priorities: each building is Lead, Keep up, Spare or Skip, with a tie-break order. Lead
   buildings climb lowest level first; a Keep up building jumps the queue once it falls a
   whole TG tier (five steps) behind the Town Centre, and otherwise waits for Lead; Spare
   only takes what nothing else can use; Skip never upgrades for its own sake. A step that
   needs a prerequisite upgrades that prerequisite first, whatever its priority, so the troop
   buildings pull the Town Centre and Embassy up with them. 'points' ignores priorities and
   takes the cheapest Truegold step anywhere, which is the most Truegold the buildings can
   take: the maximum points. Unknown levels or balances count as nothing and are listed, so
   a total is never inflated. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../_data/buildings.json'));
  else root.BuildingSpend = factory(root.BuildingData);
})(typeof window === 'object' ? window : globalThis, function (data) {
  'use strict';
  var ITEMS = ['truegold', 'tempered-truegold'], RESOURCES = ['bread', 'wood', 'stone', 'iron'], COSTS = RESOURCES.concat(ITEMS);
  var BUILDINGS = ((data && data.buildings) || []).map(function (building) { return { id: building.id, name: building.name, rows: building.levels }; });
  // Priority tiers: 1 Lead, 2 Keep up, 3 Spare, 0 Skip.
  var TIERS = [1, 2, 3, 0], KEEP_UP = 5;
  var DEFAULT_TIERS = { 'town-center': 1, embassy: 1, barracks: 1, range: 1, stable: 1, 'command-center': 2, 'war-academy': 2, infirmary: 3, academy: 3 };
  var AT = {};
  BUILDINGS.forEach(function (building) { AT[building.id] = {}; building.rows.forEach(function (row, at) { AT[building.id][row.id] = at; }); });
  function confirmed(snapshot, id) { var entry = snapshot.inventory && Object.hasOwn(snapshot.inventory, id) ? snapshot.inventory[id] : null; return entry && entry.status === 'confirmed' ? entry.amount : null; }
  // A ledger level as an index into the building's rows; -1 is not built, undefined is not a level of this building.
  function index(id, level) { return level === '0' ? -1 : Object.hasOwn(AT[id] || {}, level) ? AT[id][level] : undefined; }
  function level(id, at) { return at < 0 ? '0' : BUILDINGS.find(function (b) { return b.id === id; }).rows[at].id; }
  // The levels a page can offer: not built (except the Town Centre, which every account has) and then every step.
  function options(id) { var building = BUILDINGS.find(function (b) { return b.id === id; }); return building ? (id === 'town-center' ? [] : ['0']).concat(building.rows.map(function (row) { return row.id; })) : []; }
  // The player's priorities, filled in with the defaults: { tiers: {id: tier}, order: [ids] }.
  function priorities(snapshot) {
    var saved = (snapshot && snapshot.preferences && snapshot.preferences.buildings) || {}, tiers = {}, order = [];
    BUILDINGS.forEach(function (b) { tiers[b.id] = saved.tiers && Object.hasOwn(saved.tiers, b.id) ? saved.tiers[b.id] : Object.hasOwn(DEFAULT_TIERS, b.id) ? DEFAULT_TIERS[b.id] : 1; });
    (saved.order || []).forEach(function (id) { if (Object.hasOwn(AT, id) && !order.includes(id)) order.push(id); });
    BUILDINGS.forEach(function (b) { if (!order.includes(b.id)) order.push(b.id); });
    return { tiers: tiers, order: order };
  }
  // Every building's level on one ladder (the Town Centre's), so a War Academy at TG 1 and a Town Centre at TG 1 compare equal.
  function rank(id, at) { return at < 0 ? -1 : AT['town-center'][BUILDINGS.find(function (b) { return b.id === id; }).rows[at].id]; }
  /* The level picked for every building at once: the same id where the building has it,
     else its top level when the pick is above it, else not built. */
  function clamp(id, level) {
    var list = options(id);
    if (list.includes(level)) return level;
    var want = level === '0' ? -1 : AT['town-center'][level], top = list[list.length - 1];
    return want > AT['town-center'][top] ? top : list[0];
  }
  function plan(snapshot, settings) {
    var goal = settings && settings.goal === 'points' ? 'points' : 'priority', prefs = priorities(snapshot), sequence = [];
    var levels = (snapshot.buildings && snapshot.buildings.levels) || {}, unknown = [], at = {}, buildings = {}, have = {}, spent = {}, beyond = false;
    function note(id) { if (!unknown.includes(id)) unknown.push(id); }
    BUILDINGS.forEach(function (building) {
      var i = Object.hasOwn(levels, building.id) ? index(building.id, levels[building.id]) : undefined;
      if (i === undefined) note('building-' + building.id);
      else { at[building.id] = i; buildings[building.id] = { id: building.id, name: building.name, from: level(building.id, i), to: level(building.id, i), steps: 0, truegold: 0, tempered: 0, unverified: false }; }
    });
    // With no buildings recorded nothing can be spent yet, which is unknown rather than zero.
    if (!Object.keys(at).length) unknown = ['buildings'];
    else RESOURCES.forEach(function (id) { if (confirmed(snapshot, id) === null) note(id); });
    COSTS.forEach(function (id) { have[id] = confirmed(snapshot, id) || 0; spent[id] = 0; });
    function met(row) { return (row.requires || []).every(function (need) { return Object.hasOwn(at, need.building) && at[need.building] >= AT[need.building][need.level]; }); }
    function affordable(row) { return Object.keys(row.cost).every(function (id) { return row.cost[id] <= have[id] - spent[id]; }); }
    var ROWS = {}; BUILDINGS.forEach(function (b) { ROWS[b.id] = b.rows; });
    // The step a building wants next, or the prerequisite step it is waiting on.
    function chain(id, seen) {
      var row = ROWS[id][at[id] + 1];
      if (!row) return null;
      if (!row.cost) { beyond = true; return null; }
      var needs = row.requires || [];
      for (var i = 0; i < needs.length; i++) {
        var need = needs[i];
        if (!Object.hasOwn(at, need.building)) return null;
        if (at[need.building] < AT[need.building][need.level]) return seen.includes(need.building) ? null : chain(need.building, seen.concat(id));
      }
      return affordable(row) ? { building: BUILDINGS.find(function (b) { return b.id === id; }), row: row } : null;
    }
    function queue(id) {
      var tier = prefs.tiers[id], lag = Object.hasOwn(at, 'town-center') ? rank('town-center', at['town-center']) - rank(id, at[id]) : 0;
      return tier === 2 && lag >= KEEP_UP ? 0 : tier === 1 ? 1 : tier === 2 ? 2 : 3;
    }
    function priorityPick() {
      var list = prefs.order.filter(function (id) { return Object.hasOwn(at, id) && prefs.tiers[id] !== 0; });
      list.sort(function (a, b) { return queue(a) - queue(b) || rank(a, at[a]) - rank(b, at[b]) || prefs.order.indexOf(a) - prefs.order.indexOf(b); });
      for (var i = 0; i < list.length; i++) { var step = chain(list[i], []); if (step) return step; }
      return null;
    }
    function cheapestPick() {
      var pick = null;
      BUILDINGS.forEach(function (building) {
        if (!Object.hasOwn(at, building.id)) return;
        var row = building.rows[at[building.id] + 1];
        if (!row) return;
        // Past TG 8 no second source has the costs yet, so the plan stops there.
        if (!row.cost) { beyond = true; return; }
        if (!met(row) || !affordable(row)) return;
        var gold = row.cost.truegold || 0, tempered = row.cost['tempered-truegold'] || 0;
        if (!pick || gold < pick.gold || gold === pick.gold && tempered < pick.tempered) pick = { building: building, row: row, gold: gold, tempered: tempered };
      });
      return pick;
    }
    for (;;) {
      var pick = goal === 'points' ? cheapestPick() : priorityPick();
      if (!pick) break;
      var id = pick.building.id, entry = buildings[id], gold = pick.row.cost.truegold || 0, tempered = pick.row.cost['tempered-truegold'] || 0;
      Object.keys(pick.row.cost).forEach(function (cost) { spent[cost] += pick.row.cost[cost]; });
      at[id]++; entry.to = pick.row.id; entry.steps++; entry.truegold += gold; entry.tempered += tempered;
      if (pick.row.unverified) entry.unverified = true;
      sequence.push({ building: id, level: pick.row.id });
    }
    if (beyond) note('buildings-past-tg8');
    var items = {};
    ITEMS.forEach(function (id) {
      var pool = confirmed(snapshot, id);
      items[id] = { amount: pool === null ? null : spent[id], pool: pool, left: pool === null ? null : pool - spent[id], unknown: unknown.slice() };
    });
    var resources = {}; RESOURCES.forEach(function (id) { resources[id] = spent[id]; });
    return { goal: goal, buildings: buildings, items: items, resources: resources, unknown: unknown, recorded: Object.keys(at).length, sequence: sequence, priorities: prefs };
  }
  // What an unknown id from the plan asks for, so pages can name it: { kind, building }.
  function missing(id) {
    if (id === 'buildings') return { kind: 'buildings', building: null };
    if (id === 'buildings-past-tg8') return { kind: 'pastTG8', building: null };
    var m = /^building-([a-z-]+)$/.exec(id), building = m && BUILDINGS.find(function (b) { return b.id === m[1]; });
    return building ? { kind: 'building', building: building } : null;
  }
  return { ITEMS: ITEMS.slice(), RESOURCES: RESOURCES.slice(), BUILDINGS: BUILDINGS, data: data, TIERS: TIERS.slice(), DEFAULT_TIERS: Object.assign({}, DEFAULT_TIERS), KEEP_UP: KEEP_UP, index: index, options: options, clamp: clamp, priorities: priorities, plan: plan, missing: missing };
});
