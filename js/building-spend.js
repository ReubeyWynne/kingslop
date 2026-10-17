/* What your buildings can actually take. Event points for Truegold and Tempered Truegold
   are paid per piece spent on a building upgrade, so a piece only scores if a recorded
   building still has a step it can pay for. One plan serves the Town Centre totals and its
   Buildings shelf, so both count the same spendable pieces.

   Costs and prerequisites come from _data/buildings.json (.dsh/build-buildings.py), which
   publishes a cost cell only where two sources agree and stops at TG 8. A step is paid
   whole, with every resource it lists, and only once its prerequisites are met in the plan:
   the Town Centre level it needs, and the Embassy, troop building or Academy it names.
   Steps are taken cheapest Truegold first, so free steps come first and what is left over
   is less than any step still open. Unknown levels or balances count as nothing and are
   listed, so a total is never inflated. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../_data/buildings.json'));
  else root.BuildingSpend = factory(root.BuildingData);
})(typeof window === 'object' ? window : globalThis, function (data) {
  'use strict';
  var ITEMS = ['truegold', 'tempered-truegold'], RESOURCES = ['bread', 'wood', 'stone', 'iron'], COSTS = RESOURCES.concat(ITEMS);
  var BUILDINGS = ((data && data.buildings) || []).map(function (building) { return { id: building.id, name: building.name, rows: building.levels }; });
  var AT = {};
  BUILDINGS.forEach(function (building) { AT[building.id] = {}; building.rows.forEach(function (row, at) { AT[building.id][row.id] = at; }); });
  function confirmed(snapshot, id) { var entry = snapshot.inventory && Object.hasOwn(snapshot.inventory, id) ? snapshot.inventory[id] : null; return entry && entry.status === 'confirmed' ? entry.amount : null; }
  // A ledger level as an index into the building's rows; -1 is not built, undefined is not a level of this building.
  function index(id, level) { return level === '0' ? -1 : Object.hasOwn(AT[id] || {}, level) ? AT[id][level] : undefined; }
  function level(id, at) { return at < 0 ? '0' : BUILDINGS.find(function (b) { return b.id === id; }).rows[at].id; }
  // The levels a page can offer: not built (except the Town Centre, which every account has) and then every step.
  function options(id) { var building = BUILDINGS.find(function (b) { return b.id === id; }); return building ? (id === 'town-center' ? [] : ['0']).concat(building.rows.map(function (row) { return row.id; })) : []; }
  function plan(snapshot) {
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
    for (;;) {
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
      if (!pick) break;
      var id = pick.building.id, entry = buildings[id];
      Object.keys(pick.row.cost).forEach(function (cost) { spent[cost] += pick.row.cost[cost]; });
      at[id]++; entry.to = pick.row.id; entry.steps++; entry.truegold += pick.gold; entry.tempered += pick.tempered;
      if (pick.row.unverified) entry.unverified = true;
    }
    if (beyond) note('buildings-past-tg8');
    var items = {};
    ITEMS.forEach(function (id) {
      var pool = confirmed(snapshot, id);
      items[id] = { amount: pool === null ? null : spent[id], pool: pool, left: pool === null ? null : pool - spent[id], unknown: unknown.slice() };
    });
    var resources = {}; RESOURCES.forEach(function (id) { resources[id] = spent[id]; });
    return { buildings: buildings, items: items, resources: resources, unknown: unknown, recorded: Object.keys(at).length };
  }
  // What an unknown id from the plan asks for, so pages can name it: { kind, building }.
  function missing(id) {
    if (id === 'buildings') return { kind: 'buildings', building: null };
    if (id === 'buildings-past-tg8') return { kind: 'pastTG8', building: null };
    var m = /^building-([a-z-]+)$/.exec(id), building = m && BUILDINGS.find(function (b) { return b.id === m[1]; });
    return building ? { kind: 'building', building: building } : null;
  }
  return { ITEMS: ITEMS.slice(), RESOURCES: RESOURCES.slice(), BUILDINGS: BUILDINGS, data: data, index: index, options: options, plan: plan, missing: missing };
});
