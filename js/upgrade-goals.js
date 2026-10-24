/* Goals the player sets on the upgrade priority page (preferences.priority.goals) and what
   each still needs from the bag. Every cost comes from the planner the matching page uses:
   - Buildings: _data/buildings.json through BuildingSpend's level ladder. Every step up to the
     target is paid whole, and so is every prerequisite step its rows name, recursively, so a
     Town Centre goal counts the Embassy and troop buildings it drags up too. Steps past TG 8
     have no published cost and are flagged, never counted as free.
   - Heroes: HeroSpend's star steps; the hero's own shards first, then general shards of its
     rarity (never for Amadeus and Helga, who take only their own).
   - Hero gear: HeroGear.target and HeroGear.cost, so mastery a red level requires is included.
   - Governor gear and charms: Governor.cost over the sourced table.
   - Pets: PetPlan.cost, with the Advance at the target level done.
   - Masters: the emblems each class advancement on the way costs (MasterSpend's classes);
     own emblems first, then general ones. Affinity itself comes from gifts, which the save
     does not hold.
   A level the save does not hold makes the goal ask for it. A balance it does not hold leaves
   that line's shortfall unknown and names the balance to record: blank is never zero. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./building-spend.js'), require('./hero-spend.js'), require('./hero-gear-engine.js'), require('./governor-engine.js'), require('./pet-plan.js'), require('./master-spend.js'), require('./player-ledger.js'));
  else root.UpgradeGoals = factory(root.BuildingSpend, root.HeroSpend, root.HeroGear, root.Governor, root.PetPlan, root.MasterSpend, root.PlayerLedger);
})(typeof window === 'object' ? window : globalThis, function (buildingSpend, heroSpend, heroGear, governor, petPlan, masterSpend, ledger) {
  'use strict';
  var KINDS = ['building', 'hero', 'hero-gear', 'governor-gear', 'governor-charm', 'pet', 'master'];
  var BUILDING_COSTS = ['bread', 'wood', 'stone', 'iron', 'truegold', 'tempered-truegold'];
  var GEAR_ITEMS = ledger.ITEMS;
  var PET_ITEMS = { petFood: 'pet-food', growthManual: 'growth-manual', nutrientPotion: 'nutrient-potion', promotionMedallion: 'promotion-medallion' };
  function confirmed(snapshot, id) { var entry = snapshot.inventory && Object.hasOwn(snapshot.inventory, id) ? snapshot.inventory[id] : null; return entry && entry.status === 'confirmed' ? entry.amount : null; }
  // One shortfall line. `unknown` lists the balances to record before the line can be counted.
  function line(snapshot, id, need) {
    var have = confirmed(snapshot, id);
    return { id: id, name: { kind: 'item', id: id }, need: need, have: have, short: have === null ? null : Math.max(0, need - have), unknown: have === null ? [id] : [] };
  }
  // Own pieces first, then a shared pool (general shards or emblems). The pool is only asked for when own pieces fall short.
  function pooled(snapshot, own, pool, need, name) {
    var mine = confirmed(snapshot, own), shared = pool ? confirmed(snapshot, pool) : 0, have = null, unknown = [];
    if (mine === null) unknown.push(own);
    else if (mine >= need || !pool) have = mine;
    else if (shared === null) unknown.push(pool);
    else have = mine + shared;
    return { id: own, pool: pool, name: name, need: need, have: have, short: have === null ? null : Math.max(0, need - have), unknown: unknown };
  }
  function result(goal, state, extra) { return Object.assign({ goal: goal, state: state, from: null, lines: [], includes: [], record: [], beyond: false, unverified: false }, extra); }
  // The state once the lines are known: unknown while any balance or cost is missing, else short or ready.
  function settle(goal, from, lines, extra) {
    extra = Object.assign({ from: from, lines: lines.filter(function (l) { return l.need > 0; }) }, extra);
    var unknown = extra.lines.some(function (l) { return l.have === null; }) || extra.beyond || (extra.record && extra.record.length);
    var short = extra.lines.some(function (l) { return l.short > 0; });
    return result(goal, short ? 'short' : unknown ? 'unknown' : 'ready', extra);
  }

  function building(snapshot, goal) {
    var rows = {}, levels = (snapshot.buildings && snapshot.buildings.levels) || {};
    buildingSpend.BUILDINGS.forEach(function (b) { rows[b.id] = b.rows; });
    if (!rows[goal.target]) return result(goal, 'gone');
    var want = buildingSpend.index(goal.target, goal.level);
    if (want === undefined || want < 0) return result(goal, 'cap');
    if (!Object.hasOwn(levels, goal.target) || buildingSpend.index(goal.target, levels[goal.target]) === undefined) return result(goal, 'record', { record: [goal.target] });
    var at = {};
    Object.keys(levels).forEach(function (id) { if (rows[id]) { var i = buildingSpend.index(id, levels[id]); if (i !== undefined) at[id] = i; } });
    if (at[goal.target] >= want) return result(goal, 'met', { from: levels[goal.target] });
    var need = {}, wants = {}, done = {}, queue = [goal.target], record = [], beyond = false, unverified = false;
    BUILDING_COSTS.forEach(function (id) { need[id] = 0; });
    wants[goal.target] = want;
    while (queue.length) {
      var id = queue.shift();
      if (!Object.hasOwn(at, id)) { if (!record.includes(id)) record.push(id); continue; }
      var start = Object.hasOwn(done, id) ? done[id] : at[id];
      for (var i = start + 1; i <= wants[id]; i++) {
        var row = rows[id][i];
        if (!row.cost) beyond = true;
        else Object.keys(row.cost).forEach(function (cost) { if (Object.hasOwn(need, cost)) need[cost] += row.cost[cost]; });
        if (row.unverified) unverified = true;
        (row.requires || []).forEach(function (req) {
          var n = rows[req.building] ? buildingSpend.index(req.building, req.level) : undefined;
          if (n === undefined || Object.hasOwn(wants, req.building) && wants[req.building] >= n) return;
          wants[req.building] = n; queue.push(req.building);
        });
      }
      done[id] = Math.max(start, wants[id]);
    }
    var includes = Object.keys(wants).filter(function (id) { return id !== goal.target && Object.hasOwn(at, id) && wants[id] > at[id]; })
      .map(function (id) { return { building: id, from: levels[id], level: rows[id][wants[id]].id }; });
    var lines = BUILDING_COSTS.map(function (id) { return line(snapshot, id, need[id]); });
    return settle(goal, levels[goal.target], lines, { includes: includes, record: record, beyond: beyond, unverified: unverified });
  }

  function hero(snapshot, goal) {
    var entry = heroSpend.HEROES.find(function (h) { return h.key === goal.target; });
    if (!entry) return result(goal, 'gone');
    var roster = (snapshot.heroes && snapshot.heroes.roster) || {}, copy = roster[goal.target];
    if (!copy || copy.stars === null || copy.stars === undefined) return result(goal, 'record', { record: [goal.target] });
    if (copy.stars >= goal.level) return result(goal, 'met', { from: copy.stars });
    var need = heroSpend.STAR_STEPS.slice(copy.stars, goal.level).reduce(function (sum, n) { return sum + n; }, 0);
    var pool = heroSpend.EXCLUSIVE.includes(goal.target) ? null : heroSpend.SHARD_ITEM[entry.rarity] || null;
    return settle(goal, copy.stars, [pooled(snapshot, heroSpend.shardId(goal.target), pool, need, { kind: 'shards', hero: entry.name, general: Boolean(pool) })]);
  }

  function gear(snapshot, goal) {
    var piece = snapshot.heroGear && snapshot.heroGear.pieces && snapshot.heroGear.pieces[goal.target];
    if (!piece || piece.level === null || piece.quality === null) return result(goal, 'record', { record: [goal.target] });
    var from = heroGear.normalisePiece(piece);
    if (from.level >= goal.level) return result(goal, 'met', { from: from.level });
    var to = heroGear.target(from, goal.level, 0, false);
    if (!to) return result(goal, 'cap', { from: from.level });
    var cost = heroGear.cost(from, to);
    return settle(goal, from.level, heroGear.RES.map(function (r) { return line(snapshot, GEAR_ITEMS[r], cost[r]); }), { mastery: to.mastery > from.mastery ? to.mastery : null });
  }

  function governorGoal(snapshot, goal) {
    var kind = goal.kind === 'governor-gear' ? 'gear' : 'charms', section = kind === 'gear' ? snapshot.governorGear : snapshot.governorCharms;
    var entry = section && section.status === 'tracked' && section[kind === 'gear' ? 'pieces' : 'slots'][goal.target];
    if (!entry || entry.level === null || entry.level === undefined) return result(goal, 'record', { record: [goal.target] });
    if (goal.level > governor.max(kind)) return result(goal, 'cap', { from: entry.level });
    if (entry.level >= goal.level) return result(goal, 'met', { from: entry.level });
    var cost = governor.cost(kind, entry.level, goal.level), unverified = false;
    for (var i = entry.level + 1; i <= goal.level; i++) if (!governor.verified(kind, i)) unverified = true;
    return settle(goal, entry.level, governor.data[kind].materials.map(function (id) { return line(snapshot, id, cost[id]); }), { unverified: unverified });
  }

  function pet(snapshot, goal) {
    var entry = petPlan.find(goal.target);
    if (!entry) return result(goal, 'gone');
    var copy = snapshot.pets && snapshot.pets.roster && snapshot.pets.roster[goal.target];
    if (!copy || copy.level === null) return result(goal, 'record', { record: [goal.target] });
    if (goal.level > entry.maxLevel) return result(goal, 'cap', { from: copy.level });
    var cost = petPlan.cost(entry, copy, goal.level);
    if (copy.level >= goal.level && !cost.advances) return result(goal, 'met', { from: copy.level });
    return settle(goal, copy.level, petPlan.KEYS.map(function (key) { return line(snapshot, PET_ITEMS[key], cost[key]); }), { advances: cost.advances });
  }

  function master(snapshot, goal) {
    var entry = masterSpend.find(goal.target);
    if (!entry) return result(goal, 'gone');
    var copy = snapshot.masters && snapshot.masters.roster && snapshot.masters.roster[goal.target];
    if (!copy || copy.affinity === null) return result(goal, 'record', { record: [goal.target] });
    if (copy.affinity >= goal.level) return result(goal, 'met', { from: copy.affinity });
    var classes = entry.classes.filter(function (c) { return c.level > copy.affinity && c.level <= goal.level; });
    var need = classes.reduce(function (sum, c) { return sum + c.emblems; }, 0);
    return settle(goal, copy.affinity, [pooled(snapshot, masterSpend.emblemId(goal.target), masterSpend.GENERAL, need, { kind: 'emblems', master: entry.name, general: true })], { classes: classes.length });
  }

  var BY_KIND = { building: building, hero: hero, 'hero-gear': gear, 'governor-gear': governorGoal, 'governor-charm': governorGoal, pet: pet, master: master };
  // What one goal still needs: { goal, state, from, lines, includes, record, beyond, unverified }.
  // state is met, ready (the bag covers it), short, unknown (a balance or cost is missing), record (its level is not in the save), cap or gone.
  function evaluate(snapshot, goal) { return BY_KIND[goal.kind](snapshot, goal); }
  function all(snapshot) {
    var saved = snapshot.preferences && snapshot.preferences.priority && snapshot.preferences.priority.goals;
    return (saved || []).map(function (goal) { return evaluate(snapshot, goal); });
  }
  // What each kind can target and the levels it offers, for the goal editor.
  function targets(kind) {
    if (kind === 'building') return buildingSpend.BUILDINGS.map(function (b) { return { id: b.id, name: b.name }; });
    if (kind === 'hero') return heroSpend.HEROES.map(function (h) { return { id: h.key, name: h.name }; });
    if (kind === 'hero-gear') return heroGear.TYPES.flatMap(function (type) { return heroGear.SLOTS.map(function (slot) { return { id: type + '-' + slot, troop: type, slot: slot }; }); });
    if (kind === 'governor-gear') return governor.items('gear').map(function (i) { return { id: i.id, troop: i.troop, slot: i.slot }; });
    if (kind === 'governor-charm') return governor.items('charms').map(function (i) { return { id: i.id, troop: i.troop, piece: i.piece }; });
    if (kind === 'pet') return petPlan.PETS.map(function (p) { return { id: p.id, name: p.name }; });
    if (kind === 'master') return masterSpend.MASTERS.map(function (m) { return { id: m.id, name: m.name }; });
    return [];
  }
  function levels(kind, target) {
    function range(from, to) { var out = []; for (var i = from; i <= to; i++) out.push(i); return out; }
    if (kind === 'building') return buildingSpend.options(target).filter(function (id) { return id !== '0'; });
    if (kind === 'hero') return range(1, heroSpend.STAR_STEPS.length);
    if (kind === 'hero-gear') return range(1, 200);
    if (kind === 'governor-gear') return range(1, governor.max('gear'));
    if (kind === 'governor-charm') return range(1, governor.max('charms'));
    if (kind === 'pet') { var p = petPlan.find(target); return range(1, p ? p.maxLevel : 100); }
    if (kind === 'master') return range(1, 100);
    return [];
  }
  // Where a target stands in the save, in its goal's units, or null when the save does not hold it.
  function current(snapshot, kind, target) {
    var held = null;
    if (kind === 'building') held = snapshot.buildings && snapshot.buildings.levels ? snapshot.buildings.levels[target] : null;
    else if (kind === 'hero') held = snapshot.heroes && snapshot.heroes.roster && snapshot.heroes.roster[target] ? snapshot.heroes.roster[target].stars : null;
    else if (kind === 'hero-gear') held = snapshot.heroGear && snapshot.heroGear.pieces && snapshot.heroGear.pieces[target] ? snapshot.heroGear.pieces[target].level : null;
    else if (kind === 'governor-gear' || kind === 'governor-charm') {
      var section = kind === 'governor-gear' ? snapshot.governorGear : snapshot.governorCharms, items = section && (section.pieces || section.slots);
      held = section && section.status === 'tracked' && items && items[target] ? items[target].level : null;
    } else if (kind === 'pet') held = snapshot.pets && snapshot.pets.roster && snapshot.pets.roster[target] ? snapshot.pets.roster[target].level : null;
    else if (kind === 'master') held = snapshot.masters && snapshot.masters.roster && snapshot.masters.roster[target] ? snapshot.masters.roster[target].affinity : null;
    return held === undefined ? null : held;
  }
  return { KINDS: KINDS.slice(), evaluate: evaluate, all: all, targets: targets, levels: levels, current: current };
});
