(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.PlayerLedger = api;
    var instance;
    api.shared = function () {
      if (!instance) instance = api.create(root.localStorage, root);
      return instance;
    };
  }
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  var KEY = 'bh:player-ledger:v1', LEGACY = 'bh:hero-gear:v1';
  /* Inventory history: every confirmed balance change, kept beside the save so income can be
     learned and projected later. Each entry is { at, id, before, after, source }; `before` is
     null when the balance was unknown. A change to unknown is not a reading and is skipped.
     Entries in the last FULL_DAYS stay whole; older ones fold into one per item per UTC day
     (first `before`, last `after`), and at most MAX_ENTRIES are kept. A history that cannot
     be read or written never blocks a save. */
  var HISTORY = 'bh:player-history:v1', FULL_DAYS = 28, MAX_ENTRIES = 8000;
  var ITEMS = { xp: 'hero-gear-xp', hammers: 'forgehammer', mythic: 'spare-mythic-gear', mithril: 'mithril' };
  var PREFS = ['included', 'weights', 'profile', 'reforge', 'troop', 'mode', 'view', 'selected', 'goal', 'target', 'targetMastery'];
  var TYPES = ['inf', 'cav', 'arc'], STATS = ['attack', 'lethality', 'defense', 'health'];
  var PIECES = ['inf', 'cav', 'arc'].flatMap(function (troop) { return ['helm', 'gloves', 'chest', 'boots'].map(function (slot) { return troop + '-' + slot; }); });
  // Governor equipment is tracked by level index: 0 is not crafted (or no charm), then one step per tier star or charm level.
  var GOVERNOR = {
    gear: { section: 'governorGear', field: 'pieces', max: 58, ids: ['inf', 'cav', 'arc'].flatMap(function (troop) { return [troop + '-1', troop + '-2']; }) },
    charms: { section: 'governorCharms', field: 'slots', max: 22, ids: ['inf', 'cav', 'arc'].flatMap(function (troop) { return ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3'].map(function (slot) { return troop + '-' + slot; }); }) }
  };
  // Heroes you own: level, star index (6 × stars + tier, as in _data/heroes.json), widget level and Expedition skill levels.
  // Unread fields stay null. Per-hero shards are ordinary inventory balances keyed hero-shards-{hero}.
  var HERO = { fields: ['level', 'stars', 'widget', 'skills'], level: 200, stars: 30, widget: 10, skill: 5, skills: 3 };
  /* Masters you have unlocked: affinity level (0–100), whether the affinity bar is full and the
     next class waits on emblems (only at levels 9, 19 … 99), and the four skill levels (0 for not
     learned yet; null for unread). Per-master emblems are inventory balances keyed
     master-emblems-{master}; general-master-emblem is the wildcard any master can use. */
  var MASTER = { fields: ['affinity', 'ready', 'skills'], affinity: 100, skill: 20, skills: 4 };
  /* Pets you have tamed: level (1–100, null for unread) and whether the Advance at that level is done
     (only at levels 10, 20 … 100, where the level cap breaks). The skill level is the number of Advances. */
  var PET = { fields: ['level', 'advanced'], level: 100 };
  var GOVERNOR_PREFS = { goal: ['stats', 'score'], focus: ['all', 'inf', 'cav', 'arc'], profile: ['bear', 'offence', 'defence', 'custom', 'score', 'even'], weights: /^\d{1,3}:\d{1,3}:\d{1,3}$/, gearTarget: 58, charmTarget: 22 };
  // Training facts: the Bonus Overview training speed (%) without temporary buffs, troops per batch in one camp, and the highest tier each camp trains.
  var TRAINING = ['speed', 'capacity', 'inf', 'cav', 'arc'];
  /* Training plans: the capacity buff, the castle position you hold (Noble Advisor or Chief
     Minister, never both), whether your kingdom holds the High King, and whether your king uses
     Mobilize on event days. Each is absent when off. */
  var TRAINING_PLANS = { buff: [true], position: ['advisor', 'minister'], highKing: [true], mobilize: [true] };
  var PRIORITY_ROLES = ['lead', 'joiner', 'farm'];
  /* Upgrade goals the player sets: a kind, the thing it targets and the level wanted. Building
     targets use the game's level ids; heroes the star index (6 × stars + tier); hero gear its
     enhancement level; governor gear and charms their level index; pets their level; masters
     their affinity. One goal per target. */
  var GOALS = { max: 20, kinds: { building: null, hero: 30, 'hero-gear': 200, 'governor-gear': 58, 'governor-charm': 22, pet: 100, master: 100 } };
  function goal(value) {
    if (!(object(value) && same(Object.keys(value).sort(), ['kind', 'level', 'target']) && Object.hasOwn(GOALS.kinds, value.kind))) return false;
    if (value.kind === 'building') return id(value.target) && buildingLevel(value.level) && value.level !== '0';
    var target = value.kind === 'hero' ? heroKey(value.target) : value.kind === 'hero-gear' ? PIECES.includes(value.target)
      : value.kind === 'governor-gear' ? GOVERNOR.gear.ids.includes(value.target) : value.kind === 'governor-charm' ? GOVERNOR.charms.ids.includes(value.target) : id(value.target);
    return target && Number.isSafeInteger(value.level) && value.level >= 1 && value.level <= GOALS.kinds[value.kind];
  }
  function goals(list) {
    return Array.isArray(list) && list.length <= GOALS.max && list.every(goal) && new Set(list.map(function (g) { return g.kind + '|' + g.target; })).size === list.length;
  }
  function trainingFact(key, value) { return key === 'speed' ? percent(value) : key === 'capacity' ? count(value) && value >= 1 : Number.isSafeInteger(value) && value >= 1 && value <= 11; }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function valid(ok) { if (!ok) throw new Error('Invalid player ledger'); }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  // Resources run to hundreds of billions and beyond; specific fields cap themselves lower.
  function count(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 1e15; }
  function timestamp(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
  function id(value) { return typeof value === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(value); }
  function percent(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000; }
  function troopId(type, tier, tg) { return 'troop-' + type + '-t' + tier + '-tg' + tg; }
  function heroKey(value) { return typeof value === 'string' && /^[a-z][a-z0-9]{0,39}$/.test(value); }
  function heroShardId(hero) { return 'hero-shards-' + hero; }
  // Widgets are hero-specific items, so each hero with a widget keeps its own unspent count.
  function heroWidgetId(hero) { return 'hero-widgets-' + hero; }
  // Choose-a-hero widget chests open into any widget hero of their generation.
  function widgetChestId(generation) { return 'hero-widget-chest-gen' + generation; }
  // Building levels use the game's ids: 0 (not built), 1…30, 30-1…30-4, TG 1, TG1-1…TG1-4, … TG 10.
  function buildingLevel(value) { return typeof value === 'string' && /^(?:0|[1-9]|[12][0-9]|30|30-[1-4]|TG [1-9]|TG 10|TG[1-9]-[1-4])$/.test(value); }
  function upTo(value, max, min) { return value === null || count(value) && value >= (min || 0) && value <= max; }
  function hero(value) {
    return object(value) && same(Object.keys(value).sort(), HERO.fields.slice().sort()) && upTo(value.level, HERO.level, 1) && upTo(value.stars, HERO.stars) && upTo(value.widget, HERO.widget) &&
      (value.skills === null || Array.isArray(value.skills) && value.skills.length >= 1 && value.skills.length <= HERO.skills && value.skills.every(function (level) { return upTo(level, HERO.skill, 1); }));
  }
  function masterRecord(value) {
    return object(value) && same(Object.keys(value).sort(), MASTER.fields.slice().sort()) && upTo(value.affinity, MASTER.affinity) && typeof value.ready === 'boolean' &&
      (!value.ready || value.affinity !== null && value.affinity % 10 === 9) &&
      Array.isArray(value.skills) && value.skills.length === MASTER.skills && value.skills.every(function (level) { return upTo(level, MASTER.skill); });
  }
  function petRecord(value) {
    return object(value) && same(Object.keys(value).sort(), PET.fields.slice().sort()) && upTo(value.level, PET.level, 1) && typeof value.advanced === 'boolean' &&
      (!value.advanced || value.level !== null && value.level % 10 === 0);
  }
  function masterEmblemId(master) { return 'master-emblems-' + master; }
  function troopKey(key) {
    var m = /^troop-(inf|cav|arc)-t([1-9]|1[01])-tg([0-5])$/.exec(key);
    return m ? { type: m[1], tier: +m[2], tg: +m[3] } : null;
  }
  function provenance(value) {
    return object(value) && ['manual', 'legacy', 'screenshot', 'plan', 'reset', 'file'].includes(value.source) && timestamp(value.at) && (value.importId === undefined || id(value.importId));
  }
  function piece(value) {
    return object(value) && (value.quality === null || ['epic', 'mythic', 'red'].includes(value.quality)) && (value.level === null || count(value.level) && value.level <= (value.quality === 'epic' ? 80 : value.quality === 'mythic' ? 100 : 200)) && (value.mastery === null || count(value.mastery) && value.mastery <= 20) && (value.quality !== 'epic' || value.mastery === null || value.mastery === 0) && (value.quality !== 'red' || (value.level === null || value.level >= 100) && (value.mastery === null || value.mastery >= (value.level === null || value.level < 120 ? 10 : 10 + Math.floor((value.level - 100) / 20))));
  }
  function kingdomProfile(value) {
    return object(value) && same(Object.keys(value).sort(), ['generation', 'position', 'truegold', 'warAcademy']) &&
      (value.position === null || id(value.position)) && (value.generation === null || Number.isInteger(value.generation) && value.generation >= 1 && value.generation <= 99) &&
      (value.truegold === null || [0, 3, 5, 8, 10].includes(value.truegold)) && (value.warAcademy === null || typeof value.warAcademy === 'boolean');
  }
  var SEASONAL_COUNTS = ['points', 'candy', 'todayPoints', 'gatheringCollected', 'beastsCollected', 'topUpPoints'];
  var SEASONAL_LIMITS = { daysLeft: 8, doorDaysLeft: 7, kingdomDay: 10000, pity: 39, pumpkinRemaining: 10, witchRemaining: 15, townCenter: 30 };
  function seasonalRecord(value) {
    if (!object(value)) return false;
    var fields = SEASONAL_COUNTS.concat(Object.keys(SEASONAL_LIMITS), ['packs', 'tracks', 'claimedPass', 'missions']);
    if (!same(Object.keys(value).filter(function (key) { return key !== 'passVariant' && key !== 'doorsDoneToday'; }).sort(), fields.sort())) return false;
    if (value.doorsDoneToday !== undefined && typeof value.doorsDoneToday !== 'boolean') return false;
    if (value.passVariant !== undefined && value.passVariant !== null && ![1, 2, 3, 65, 66].includes(value.passVariant)) return false;
    if (!SEASONAL_COUNTS.every(function (key) { return upTo(value[key], 10000000); })) return false;
    if (!Object.keys(SEASONAL_LIMITS).every(function (key) { return upTo(value[key], SEASONAL_LIMITS[key], ['kingdomDay', 'townCenter', 'pumpkinRemaining'].includes(key) ? 1 : 0); })) return false;
    if (!Array.isArray(value.packs) || value.packs.length !== 7 || !value.packs.every(function (n, i) { return upTo(n, i === 6 ? 3 : 1); })) return false;
    if (!Array.isArray(value.tracks) || value.tracks.length !== 2 || !value.tracks.every(function (n) { return n === null || typeof n === 'boolean'; })) return false;
    return Array.isArray(value.claimedPass) && value.claimedPass.length === 3 && value.claimedPass.every(function (n) { return upTo(n, 21); }) &&
      Array.isArray(value.missions) && value.missions.length === 7 && value.missions.every(function (n) { return upTo(n, 5); });
  }
  function empty() {
    return { format: 'kingshot-player', schemaVersion: 1, revision: 0, updatedAt: new Date().toISOString(), inventory: {}, heroGear: { pieces: {}, provenance: {}, parts: null }, governorGear: { status: 'unsupported', pieces: {} }, governorCharms: { status: 'unsupported', slots: {} }, combat: { stats: {}, provenance: {} }, imports: [], preferences: { heroGear: {} }, migration: null };
  }
  // A confirmed screenshot import. Hero gear records carry equipment deltas;
  // every source may carry inventory deltas ({ id: { before, after } }).
  var IMPORT_SOURCES = ['hero-gear', 'backpack', 'pets'];
  function importRecord(record) {
    if (!(object(record) && id(record.id) && IMPORT_SOURCES.includes(record.sourceType) && timestamp(record.at) && /^[a-f0-9]{64}$/.test(record.contentHash) && record.confirmation === 'confirmed')) return false;
    var gear = record.itemDelta === undefined ? {} : record.itemDelta, stock = record.inventoryDelta === undefined ? {} : record.inventoryDelta, pets = record.petDelta === undefined ? {} : record.petDelta;
    if (!object(gear) || !object(stock) || !object(pets) || (record.sourceType === 'hero-gear' && !object(record.itemDelta))) return false;
    var petLevel = function (level) { return count(level) && level >= 1 && level <= PET.level; };
    if (!Object.keys(pets).every(function (key) { var delta = pets[key]; return id(key) && object(delta) && (delta.before === null || petLevel(delta.before)) && petLevel(delta.after); })) return false;
    return Object.keys(gear).every(function (key) { var delta = gear[key]; return PIECES.includes(key) && object(delta) && (delta.before === null || piece(delta.before)) && piece(delta.after); }) &&
      Object.keys(stock).every(function (key) { var delta = stock[key]; return id(key) && object(delta) && (delta.before === null || count(delta.before)) && count(delta.after); });
  }
  /* The history section of a save file: { schemaVersion: 1, entries }, each entry as recorded.
     Another schema version or a malformed entry rejects the whole file. */
  function validHistory(value) {
    valid(object(value) && value.schemaVersion === 1 && Array.isArray(value.entries) && value.entries.length <= MAX_ENTRIES);
    value.entries.forEach(function (entry) { valid(historyEntry(entry)); });
    return value;
  }
  function historyEntry(entry) {
    return object(entry) && same(Object.keys(entry).sort(), ['after', 'at', 'before', 'id', 'source']) && timestamp(entry.at) && id(entry.id) && (entry.before === null || count(entry.before)) && count(entry.after) &&
      (entry.source === null || ['manual', 'legacy', 'screenshot', 'plan', 'reset', 'file'].includes(entry.source));
  }
  function validate(value) {
    valid(object(value) && value.format === 'kingshot-player' && value.schemaVersion === 1 && Number.isSafeInteger(value.revision) && value.revision >= 0 && timestamp(value.updatedAt));
    valid(object(value.inventory) && Object.keys(value.inventory).length <= 500);
    Object.keys(value.inventory).forEach(function (key) {
      var entry = value.inventory[key];
      valid(id(key) && object(entry));
      valid(entry.status === 'confirmed' ? count(entry.amount) && provenance(entry.provenance) : ['unknown', 'unsupported'].includes(entry.status) && entry.amount === null && entry.provenance === null);
    });
    valid(object(value.heroGear) && object(value.heroGear.pieces) && object(value.heroGear.provenance));
    Object.keys(value.heroGear.pieces).forEach(function (key) { valid(PIECES.includes(key) && piece(value.heroGear.pieces[key]) && provenance(value.heroGear.provenance[key])); });
    Object.keys(value.heroGear.provenance).forEach(function (key) { valid(Object.hasOwn(value.heroGear.pieces, key)); });
    var parts = value.heroGear.parts, xp = value.inventory[ITEMS.xp];
    if (parts !== null) valid(object(parts) && count(parts.ten) && count(parts.hundred) && count(parts.remainder) && parts.remainder < 10 && xp && xp.status === 'confirmed' && parts.ten * 10 + parts.hundred * 100 + parts.remainder === xp.amount);
    Object.keys(GOVERNOR).forEach(function (kind) {
      var spec = GOVERNOR[kind], section = value[spec.section];
      valid(object(section) && ['unsupported', 'tracked'].includes(section.status) && object(section[spec.field]));
      var keys = Object.keys(section[spec.field]);
      if (section.status === 'unsupported') return valid(!keys.length && section.provenance === undefined);
      valid(object(section.provenance) && same(Object.keys(section.provenance).sort(), keys.slice().sort()));
      keys.forEach(function (key) { var item = section[spec.field][key]; valid(spec.ids.includes(key) && object(item) && Object.keys(item).length === 1 && count(item.level) && item.level <= spec.max && provenance(section.provenance[key])); });
    });
    if (value.combat !== undefined) {
      valid(object(value.combat) && object(value.combat.stats) && object(value.combat.provenance));
      Object.keys(value.combat.stats).forEach(function (type) {
        var row = value.combat.stats[type];
        valid(TYPES.includes(type) && object(row) && Object.keys(row).length === STATS.length && STATS.every(function (key) { return percent(row[key]); }) && provenance(value.combat.provenance[type]));
      });
      Object.keys(value.combat.provenance).forEach(function (type) { valid(Object.hasOwn(value.combat.stats, type)); });
    }
    if (value.heroes !== undefined) {
      valid(object(value.heroes) && object(value.heroes.roster) && object(value.heroes.provenance) && same(Object.keys(value.heroes.roster).sort(), Object.keys(value.heroes.provenance).sort()));
      Object.keys(value.heroes.roster).forEach(function (key) { valid(heroKey(key) && hero(value.heroes.roster[key]) && provenance(value.heroes.provenance[key])); });
    }
    if (value.buildings !== undefined) {
      valid(object(value.buildings) && object(value.buildings.levels) && object(value.buildings.provenance) && same(Object.keys(value.buildings.levels).sort(), Object.keys(value.buildings.provenance).sort()));
      Object.keys(value.buildings.levels).forEach(function (key) { valid(id(key) && buildingLevel(value.buildings.levels[key]) && provenance(value.buildings.provenance[key])); });
    }
    if (value.masters !== undefined) {
      valid(object(value.masters) && object(value.masters.roster) && object(value.masters.provenance) && same(Object.keys(value.masters.roster).sort(), Object.keys(value.masters.provenance).sort()));
      Object.keys(value.masters.roster).forEach(function (key) { valid(heroKey(key) && masterRecord(value.masters.roster[key]) && provenance(value.masters.provenance[key])); });
    }
    if (value.pets !== undefined) {
      valid(object(value.pets) && object(value.pets.roster) && object(value.pets.provenance) && same(Object.keys(value.pets.roster).sort(), Object.keys(value.pets.provenance).sort()));
      Object.keys(value.pets.roster).forEach(function (key) { valid(id(key) && petRecord(value.pets.roster[key]) && provenance(value.pets.provenance[key])); });
    }
    if (value.training !== undefined) {
      valid(object(value.training) && object(value.training.facts) && object(value.training.provenance) && same(Object.keys(value.training.facts).sort(), Object.keys(value.training.provenance).sort()));
      Object.keys(value.training.facts).forEach(function (key) { valid(TRAINING.includes(key) && trainingFact(key, value.training.facts[key]) && provenance(value.training.provenance[key])); });
    }
    if (value.seasonal !== undefined) {
      valid(object(value.seasonal) && Object.keys(value.seasonal).length <= 24);
      Object.keys(value.seasonal).forEach(function (key) { valid(id(key) && seasonalRecord(value.seasonal[key])); });
    }
    valid(object(value.preferences) && object(value.preferences.heroGear));
    if (value.preferences.kingdom !== undefined) valid(kingdomProfile(value.preferences.kingdom));
    if (value.preferences.training !== undefined) valid(object(value.preferences.training) && Object.keys(value.preferences.training).every(function (key) { return Object.hasOwn(TRAINING_PLANS, key) && TRAINING_PLANS[key].includes(value.preferences.training[key]); }));
    valid(Object.keys(value.preferences).every(function (key) { return key === 'heroGear' || key === 'governor' || key === 'training' || key === 'kingdom' || key === 'buildings' || key === 'priority'; }) && Object.keys(value.preferences.heroGear).every(function (key) { return PREFS.includes(key); }));
    if (value.preferences.governor !== undefined) {
      var gov = value.preferences.governor;
      valid(object(gov) && Object.keys(gov).every(function (key) { return Object.hasOwn(GOVERNOR_PREFS, key); }));
      Object.keys(gov).forEach(function (key) { var rule = GOVERNOR_PREFS[key]; valid(Array.isArray(rule) ? rule.includes(gov[key]) : rule instanceof RegExp ? typeof gov[key] === 'string' && rule.test(gov[key]) : count(gov[key]) && gov[key] <= rule); });
    }
    if (value.preferences.buildings !== undefined) {
      var order = value.preferences.buildings;
      valid(object(order) && Object.keys(order).every(function (key) { return key === 'tiers' || key === 'order'; }));
      if (order.tiers !== undefined) valid(object(order.tiers) && Object.keys(order.tiers).every(function (key) { return id(key) && [0, 1, 2, 3].includes(order.tiers[key]); }));
      if (order.order !== undefined) valid(Array.isArray(order.order) && order.order.length <= 50 && order.order.every(id) && new Set(order.order).size === order.order.length);
    }
    if (value.preferences.priority !== undefined) {
      var priority = value.preferences.priority;
      valid(object(priority) && Object.keys(priority).length && Object.keys(priority).every(function (key) { return key === 'role' || key === 'goals'; }));
      if (priority.role !== undefined) valid(PRIORITY_ROLES.includes(priority.role));
      if (priority.goals !== undefined) valid(goals(priority.goals) && priority.goals.length);
    }
    var prefs = value.preferences.heroGear;
    if (prefs.included !== undefined) valid(object(prefs.included) && ['inf', 'cav', 'arc'].every(function (key) { return typeof prefs.included[key] === 'boolean'; }));
    if (prefs.weights !== undefined) valid(object(prefs.weights) && ['inf', 'cav', 'arc'].every(function (key) { return Array.isArray(prefs.weights[key]) && prefs.weights[key].length === 2 && prefs.weights[key].every(function (n) { return Number.isFinite(n) && n >= 0 && n <= 100; }); }));
    ['profile', 'troop', 'mode', 'view', 'selected', 'goal'].forEach(function (key) { if (prefs[key] !== undefined) valid(typeof prefs[key] === 'string' && prefs[key].length <= 80); });
    if (prefs.reforge !== undefined) valid(typeof prefs.reforge === 'boolean');
    if (prefs.target !== undefined) valid(count(prefs.target) && prefs.target <= 200);
    if (prefs.targetMastery !== undefined) valid(count(prefs.targetMastery) && prefs.targetMastery <= 20);
    valid(Array.isArray(value.imports) && value.imports.length <= 1000);
    var hashes = new Set(), ids = new Set();
    value.imports.forEach(function (record) {
      valid(importRecord(record) && !ids.has(record.id) && !hashes.has(record.contentHash));
      ids.add(record.id); hashes.add(record.contentHash);
    });
    valid(value.migration === null || object(value.migration) && value.migration.from === LEGACY && timestamp(value.migration.at));
    return copy(value);
  }
  function create(storage, events) {
    var listeners = [], current, stored, oldStored;
    function read() {
      var raw = storage.getItem(KEY);
      if (raw !== null) {
        if (current && raw === stored) return current;
        var saved = validate(JSON.parse(raw));
        stored = raw;
        return current = saved;
      }
      var old = storage.getItem(LEGACY);
      if (current && stored === null && old === oldStored) return current;
      if (old === null) { stored = null; oldStored = null; return current = empty(); }
      var input = legacy(JSON.parse(old)), next = empty(), facts = { source: 'legacy', at: next.updatedAt };
      Object.keys(ITEMS).forEach(function (key) { next.inventory[ITEMS[key]] = { amount: input.resources[key], status: 'confirmed', provenance: copy(facts) }; });
      PIECES.forEach(function (key) { next.heroGear.pieces[key] = copy(input.pieces[key]); next.heroGear.provenance[key] = copy(facts); });
      PREFS.forEach(function (key) { if (input[key] !== undefined) next.preferences.heroGear[key] = copy(input[key]); });
      var xp = input.resources.xp, parts = input.parts;
      next.heroGear.parts = parts && count(parts.ten) && count(parts.hundred) && count(parts.remainder) && parts.remainder < 10 && parts.ten * 10 + parts.hundred * 100 + parts.remainder === xp ? copy(parts) : { ten: Math.floor(xp % 100 / 10), hundred: Math.floor(xp / 100), remainder: xp % 10 };
      next.migration = { from: LEGACY, at: next.updatedAt }; next.revision = 1;
      next = validate(next);
      var encoded = JSON.stringify(next);
      storage.setItem(KEY, encoded);
      stored = encoded;
      return current = next;
    }
    function readHistory() {
      try {
        var raw = storage.getItem(HISTORY), value = raw === null ? null : JSON.parse(raw);
        return value && value.schemaVersion === 1 && Array.isArray(value.entries) ? value : { schemaVersion: 1, entries: [] };
      } catch (cause) { return { schemaVersion: 1, entries: [] }; }
    }
    function fold(entries, now) {
      var cutoff = now - FULL_DAYS * 864e5, out = [], days = {};
      entries.forEach(function (entry) {
        if (Date.parse(entry.at) >= cutoff) { out.push(entry); return; }
        var key = entry.id + '|' + entry.at.slice(0, 10), kept = days[key];
        if (kept) { kept.after = entry.after; kept.at = entry.at; kept.source = entry.source; }
        else { days[key] = Object.assign({}, entry); out.push(days[key]); }
      });
      out.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
      return out.slice(-MAX_ENTRIES);
    }
    function record(before, after) {
      var changes = [];
      Object.keys(after.inventory).forEach(function (key) {
        var next = after.inventory[key], last = before.inventory[key];
        if (next.status !== 'confirmed') return;
        var was = last && last.status === 'confirmed' ? last.amount : null;
        if (was === next.amount) return;
        changes.push({ at: after.updatedAt, id: key, before: was, after: next.amount, source: next.provenance ? next.provenance.source : null });
      });
      if (!changes.length) return;
      try {
        var log = readHistory();
        log.entries = fold(log.entries.concat(changes), Date.parse(after.updatedAt));
        storage.setItem(HISTORY, JSON.stringify(log));
      } catch (cause) { /* the save itself already succeeded */ }
    }
    // Recorded balance changes, oldest first; `key` limits them to one inventory id.
    function history(key) { return readHistory().entries.filter(function (entry) { return key === undefined || entry.id === key; }).map(copy); }
    // A history carried in a save file replaces this one; it is folded and capped like a live one.
    function writeHistory(log) {
      try { storage.setItem(HISTORY, JSON.stringify({ schemaVersion: 1, entries: fold(log.entries.map(copy), Date.now()) })); } catch (cause) { /* the save itself already succeeded */ }
    }
    function notify() {
      listeners.slice().forEach(function (listener) { listener(copy(current)); });
      if (events && events.dispatchEvent && typeof CustomEvent === 'function') events.dispatchEvent(new CustomEvent('player-ledger:change', { detail: copy(current) }));
    }
    function snapshot() { current = read(); return copy(current); }
    function commit(next, expected, log) {
      var latest = read();
      if (latest.revision !== expected) throw new Error('Player ledger changed in another tool');
      next.revision = latest.revision + 1;
      next.updatedAt = new Date().toISOString();
      next = validate(next);
      var encoded = JSON.stringify(next);
      storage.setItem(KEY, encoded);
      stored = encoded;
      current = next;
      if (log) writeHistory(log); else record(latest, next);
      notify();
      return copy(next);
    }
    function transaction(edit, expected) {
      var next = snapshot();
      if (expected !== undefined && next.revision !== expected) throw new Error('Player ledger changed in another tool');
      edit(next);
      return commit(next, next.revision);
    }
    function balance(key) { var entry = snapshot().inventory[key]; return entry ? copy(entry) : { amount: null, status: 'unknown', provenance: null }; }
    function setBalance(key, amount, source) {
      valid(id(key) && (amount === null || count(amount)));
      return transaction(function (next) {
        next.inventory[key] = amount === null ? { amount: null, status: 'unknown', provenance: null } : { amount: amount, status: 'confirmed', provenance: { source: source || 'manual', at: new Date().toISOString() } };
        if (key === ITEMS.xp) next.heroGear.parts = null;
      });
    }
    function setHeroGearPart(key, amount) {
      valid(['ten', 'hundred'].includes(key) && count(amount) && amount <= 1e7);
      return transaction(function (next) {
        var entry = next.inventory[ITEMS.xp], xp = entry && entry.status === 'confirmed' ? entry.amount : 0;
        var parts = next.heroGear.parts || { ten: Math.floor(xp % 100 / 10), hundred: Math.floor(xp / 100), remainder: xp % 10 };
        parts[key] = amount;
        xp = parts.ten * 10 + parts.hundred * 100 + parts.remainder;
        valid(count(xp) && xp <= 1e9);
        next.heroGear.parts = parts;
        next.inventory[ITEMS.xp] = { amount: xp, status: 'confirmed', provenance: { source: 'manual', at: new Date().toISOString() } };
      });
    }
    function combat() {
      var value = snapshot(), section = value.combat || { stats: {}, provenance: {} }, troops = [];
      Object.keys(value.inventory).forEach(function (key) {
        var at = troopKey(key), entry = value.inventory[key];
        if (at && entry.status === 'confirmed') troops.push({ type: at.type, tier: at.tier, tg: at.tg, amount: entry.amount, provenance: copy(entry.provenance) });
      });
      troops.sort(function (a, b) { return TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || b.tier - a.tier || b.tg - a.tg; });
      return { stats: copy(section.stats), provenance: copy(section.provenance), troops: troops };
    }
    function setCombat(input, source, expected) {
      input = input || {};
      var stats = input.stats || {}, troops = input.troops || [];
      Object.keys(stats).forEach(function (type) { valid(TYPES.includes(type) && object(stats[type]) && STATS.every(function (key) { return percent(stats[type][key]); })); });
      troops.forEach(function (row) { valid(object(row) && troopKey(troopId(row.type, row.tier, row.tg)) && (row.amount === null || count(row.amount))); });
      return transaction(function (next) {
        var facts = { source: source || 'manual', at: new Date().toISOString() };
        if (!next.combat) next.combat = { stats: {}, provenance: {} };
        Object.keys(stats).forEach(function (type) {
          next.combat.stats[type] = {}; STATS.forEach(function (key) { next.combat.stats[type][key] = stats[type][key]; });
          next.combat.provenance[type] = copy(facts);
        });
        troops.forEach(function (row) {
          // A cleared row is forgotten, not stored as unknown: a missing troop key already means unknown.
          if (row.amount === null) delete next.inventory[troopId(row.type, row.tier, row.tg)];
          else next.inventory[troopId(row.type, row.tier, row.tg)] = { amount: row.amount, status: 'confirmed', provenance: copy(facts) };
        });
      }, expected);
    }
    function heroes() {
      var value = snapshot(), section = value.heroes || { roster: {}, provenance: {} }, shards = {}, widgets = {};
      Object.keys(value.inventory).forEach(function (key) {
        var m = /^hero-(shards|widgets)-([a-z][a-z0-9]{0,39})$/.exec(key), entry = value.inventory[key];
        if (m && entry.status === 'confirmed') (m[1] === 'shards' ? shards : widgets)[m[2]] = entry.amount;
      });
      return { roster: copy(section.roster), provenance: copy(section.provenance), shards: shards, widgets: widgets };
    }
    // A record marks the hero as owned (missing fields stay unread); null forgets it, which is the same as not owned.
    function setHero(key, record, source, expected) {
      valid(heroKey(key));
      var next = null;
      if (record !== null) {
        valid(object(record) && Object.keys(record).every(function (field) { return HERO.fields.includes(field); }));
        next = { level: null, stars: null, widget: null, skills: null };
        HERO.fields.forEach(function (field) { if (record[field] !== undefined) next[field] = copy(record[field]); });
        valid(hero(next));
      }
      return transaction(function (value) {
        if (!value.heroes) value.heroes = { roster: {}, provenance: {} };
        if (next === null) { delete value.heroes.roster[key]; delete value.heroes.provenance[key]; return; }
        if (same(value.heroes.roster[key], next)) return;
        value.heroes.roster[key] = next; value.heroes.provenance[key] = { source: source || 'manual', at: new Date().toISOString() };
      }, expected);
    }
    function masters() {
      var value = snapshot(), section = value.masters || { roster: {}, provenance: {} }, emblems = {};
      Object.keys(value.inventory).forEach(function (key) {
        var m = /^master-emblems-([a-z][a-z0-9]{0,39})$/.exec(key), entry = value.inventory[key];
        if (m && entry.status === 'confirmed') emblems[m[1]] = entry.amount;
      });
      return { roster: copy(section.roster), provenance: copy(section.provenance), emblems: emblems };
    }
    // A record marks the master as unlocked (missing fields stay unread); null forgets it, which is the same as locked.
    function setMaster(key, record, source, expected) {
      valid(heroKey(key));
      var next = null;
      if (record !== null) {
        valid(object(record) && Object.keys(record).every(function (field) { return MASTER.fields.includes(field); }));
        next = { affinity: null, ready: false, skills: [null, null, null, null] };
        MASTER.fields.forEach(function (field) { if (record[field] !== undefined) next[field] = copy(record[field]); });
        // The bar can only be full and waiting at a class gate, so any other level clears it.
        valid(typeof next.ready === 'boolean');
        if (next.ready && (next.affinity === null || next.affinity % 10 !== 9)) next.ready = false;
        valid(masterRecord(next));
      }
      return transaction(function (value) {
        if (!value.masters) value.masters = { roster: {}, provenance: {} };
        if (next === null) { delete value.masters.roster[key]; delete value.masters.provenance[key]; return; }
        if (same(value.masters.roster[key], next)) return;
        value.masters.roster[key] = next; value.masters.provenance[key] = { source: source || 'manual', at: new Date().toISOString() };
      }, expected);
    }
    function pets() {
      var section = snapshot().pets || { roster: {}, provenance: {} };
      return { roster: copy(section.roster), provenance: copy(section.provenance) };
    }
    // A record marks the pet as tamed (missing fields stay unread); null forgets it.
    function setPet(key, record, source, expected) {
      valid(id(key));
      var next = null;
      if (record !== null) {
        valid(object(record) && Object.keys(record).every(function (field) { return PET.fields.includes(field); }));
        next = { level: null, advanced: false };
        PET.fields.forEach(function (field) { if (record[field] !== undefined) next[field] = copy(record[field]); });
        // The Advance only exists at a level cap, so any other level clears it.
        valid(typeof next.advanced === 'boolean');
        if (next.advanced && (next.level === null || next.level % 10 !== 0)) next.advanced = false;
        valid(petRecord(next));
      }
      return transaction(function (value) {
        if (!value.pets) value.pets = { roster: {}, provenance: {} };
        if (next === null) { delete value.pets.roster[key]; delete value.pets.provenance[key]; return; }
        if (same(value.pets.roster[key], next)) return;
        value.pets.roster[key] = next; value.pets.provenance[key] = { source: source || 'manual', at: new Date().toISOString() };
      }, expected);
    }
    function buildings() {
      var section = snapshot().buildings || { levels: {}, provenance: {} };
      return { levels: copy(section.levels), provenance: copy(section.provenance) };
    }
    // A level records the building; null forgets it, which is the same as not counted yet.
    function setBuilding(key, level, source, expected) {
      valid(id(key) && (level === null || buildingLevel(level)));
      return transaction(function (value) {
        if (!value.buildings) value.buildings = { levels: {}, provenance: {} };
        if (level === null) { delete value.buildings.levels[key]; delete value.buildings.provenance[key]; return; }
        if (value.buildings.levels[key] === level) return;
        value.buildings.levels[key] = level; value.buildings.provenance[key] = { source: source || 'manual', at: new Date().toISOString() };
      }, expected);
    }
    // Several levels in one write, as when every building is set to the same level.
    function setBuildings(levels, source, expected) {
      valid(object(levels) && Object.keys(levels).every(function (key) { return id(key) && (levels[key] === null || buildingLevel(levels[key])); }));
      return transaction(function (value) {
        if (!value.buildings) value.buildings = { levels: {}, provenance: {} };
        var facts = { source: source || 'manual', at: new Date().toISOString() };
        Object.keys(levels).forEach(function (key) {
          if (levels[key] === null) { delete value.buildings.levels[key]; delete value.buildings.provenance[key]; }
          else if (value.buildings.levels[key] !== levels[key]) { value.buildings.levels[key] = levels[key]; value.buildings.provenance[key] = copy(facts); }
        });
      }, expected);
    }
    // Upgrade priorities: tiers {building: 1 lead, 2 keep up, 3 spare, 0 skip} and a tie-break order.
    function setBuildingPriorities(change) {
      valid(object(change) && Object.keys(change).every(function (key) { return key === 'tiers' || key === 'order'; }));
      return transaction(function (next) {
        var current = Object.assign({}, next.preferences.buildings);
        if (change.tiers) current.tiers = Object.assign({}, current.tiers, change.tiers);
        if (change.order) current.order = change.order.slice();
        next.preferences.buildings = current;
      });
    }
    // The account's part in its alliance, which the upgrade priority page orders by; null forgets it.
    function priority() { var saved = snapshot().preferences.priority || {}; return { role: saved.role || null, goals: copy(saved.goals || []) }; }
    // Each part of preferences.priority is absent when unset, and the section when both are.
    function writePriority(next, key, value) {
      var section = Object.assign({}, next.preferences.priority);
      if (value === null) delete section[key]; else section[key] = value;
      if (Object.keys(section).length) next.preferences.priority = section; else delete next.preferences.priority;
    }
    function setPriorityRole(role) {
      valid(role === null || PRIORITY_ROLES.includes(role));
      return transaction(function (next) { writePriority(next, 'role', role); });
    }
    // The whole goal list, in the player's order; an empty list forgets it.
    function setPriorityGoals(list, expected) {
      valid(goals(list));
      return transaction(function (next) { writePriority(next, 'goals', list.length ? copy(list) : null); }, expected);
    }
    function seasonal(occurrence) {
      valid(id(occurrence));
      return copy((snapshot().seasonal || {})[occurrence] || null);
    }
    function setSeasonal(occurrence, record, expected) {
      valid(id(occurrence) && (record === null || seasonalRecord(record)));
      return transaction(function (value) {
        value.seasonal = Object.assign({}, value.seasonal);
        if (record === null) delete value.seasonal[occurrence]; else value.seasonal[occurrence] = copy(record);
        if (!Object.keys(value.seasonal).length) delete value.seasonal;
      }, expected);
    }
    function kingdom() {
      return copy(snapshot().preferences.kingdom || { position: null, generation: null, truegold: null, warAcademy: null });
    }
    function setKingdom(profile, expected) {
      valid(kingdomProfile(profile));
      return transaction(function (value) { value.preferences.kingdom = copy(profile); }, expected);
    }
    function training() {
      var value = snapshot(), section = value.training || { facts: {}, provenance: {} };
      var plans = value.preferences.training || {};
      return { facts: copy(section.facts), provenance: copy(section.provenance), buff: Boolean(plans.buff), position: plans.position || null, highKing: Boolean(plans.highKing), mobilize: Boolean(plans.mobilize) };
    }
    // A value records the fact; null forgets it, which is the same as not counted yet.
    function setTraining(key, fact, source, expected) {
      valid(TRAINING.includes(key) && (fact === null || trainingFact(key, fact)));
      return transaction(function (value) {
        if (!value.training) value.training = { facts: {}, provenance: {} };
        if (fact === null) { delete value.training.facts[key]; delete value.training.provenance[key]; return; }
        if (value.training.facts[key] === fact) return;
        value.training.facts[key] = fact; value.training.provenance[key] = { source: source || 'manual', at: new Date().toISOString() };
      }, expected);
    }
    // Plans, not facts: the 3,000-gem capacity buff, your castle position, the High King and Mobilize. null or false turns one off.
    function setTrainingPlan(key, plan) {
      valid(Object.hasOwn(TRAINING_PLANS, key) && (plan === null || plan === false || TRAINING_PLANS[key].includes(plan)));
      return transaction(function (value) {
        var plans = Object.assign({}, value.preferences.training);
        if (plan === null || plan === false) delete plans[key]; else plans[key] = plan;
        if (Object.keys(plans).length) value.preferences.training = plans; else delete value.preferences.training;
      });
    }
    function setTrainingBuff(on) { valid(typeof on === 'boolean'); return setTrainingPlan('buff', on); }
    function governorSpec(kind) { valid(Object.hasOwn(GOVERNOR, kind)); return GOVERNOR[kind]; }
    function governor(kind, known) {
      var spec = governorSpec(kind), section = (known || snapshot())[spec.section], levels = {};
      spec.ids.forEach(function (id) { levels[id] = section.status === 'tracked' && Object.hasOwn(section[spec.field], id) ? section[spec.field][id].level : null; });
      return levels;
    }
    function setGovernor(kind, levels, source) {
      var spec = governorSpec(kind);
      valid(object(levels) && Object.keys(levels).every(function (id) { return spec.ids.includes(id) && (levels[id] === null || count(levels[id]) && levels[id] <= spec.max); }));
      return transaction(function (next) {
        var section = next[spec.section], facts = { source: source || 'manual', at: new Date().toISOString() };
        if (section.status !== 'tracked') { section.status = 'tracked'; section[spec.field] = {}; section.provenance = {}; }
        Object.keys(levels).forEach(function (id) {
          if (levels[id] === null) { delete section[spec.field][id]; delete section.provenance[id]; }
          else if (!Object.hasOwn(section[spec.field], id) || section[spec.field][id].level !== levels[id]) { section[spec.field][id] = { level: levels[id] }; section.provenance[id] = copy(facts); }
        });
      });
    }
    function setGovernorPreference(key, value) {
      valid(Object.hasOwn(GOVERNOR_PREFS, key));
      return transaction(function (next) { next.preferences.governor = Object.assign({}, next.preferences.governor); next.preferences.governor[key] = value; });
    }
    function resetGovernor(expected) {
      return transaction(function (next) {
        var blank = empty();
        next.governorGear = blank.governorGear; next.governorCharms = blank.governorCharms; delete next.preferences.governor;
      }, expected);
    }
    function legacy(input, engine) {
      valid(object(input) && input.version === 1 && object(input.pieces) && object(input.resources));
      PIECES.forEach(function (key) { valid(piece(input.pieces[key]) && input.pieces[key].quality !== null && input.pieces[key].level !== null && input.pieces[key].mastery !== null); });
      Object.keys(ITEMS).forEach(function (key) { valid(count(input.resources[key])); });
      var normal = engine ? engine.normaliseState(input) : copy(input);
      normal.parts = input.parts || null;
      return normal;
    }
    function project(value, engine) {
      var result = engine.normaliseState(Object.assign(engine.defaults(), value.preferences.heroGear));
      Object.keys(value.heroGear.pieces).forEach(function (key) { result.pieces[key] = engine.normalisePiece(value.heroGear.pieces[key]); });
      Object.keys(ITEMS).forEach(function (key) { var entry = value.inventory[ITEMS[key]]; result.resources[key] = entry && entry.status === 'confirmed' ? entry.amount : 0; });
      var xp = result.resources.xp;
      result.parts = value.heroGear.parts || { ten: Math.floor(xp % 100 / 10), hundred: Math.floor(xp / 100), remainder: xp % 10 };
      return result;
    }
    function writeHeroGear(input, engine, options) {
      options = options || {};
      var next = snapshot(), before = project(next, engine), normal = engine.normaliseState(input), at = new Date().toISOString();
      var source = options.source || 'manual';
      if (options.expectedRevision !== undefined && options.expectedRevision !== next.revision) throw new Error('Player ledger changed in another tool');
      var facts = { source: source, at: at };
      Object.keys(ITEMS).forEach(function (key) {
        if (options.all || options.resource === key || normal.resources[key] !== before.resources[key]) next.inventory[ITEMS[key]] = { amount: normal.resources[key], status: 'confirmed', provenance: copy(facts) };
      });
      var xpEntry = next.inventory[ITEMS.xp];
      if (xpEntry && xpEntry.status === 'confirmed') {
        var xp = xpEntry.amount, supplied = input.parts;
        next.heroGear.parts = supplied && count(supplied.ten) && count(supplied.hundred) && count(supplied.remainder) && supplied.remainder < 10 && supplied.ten * 10 + supplied.hundred * 100 + supplied.remainder === xp ? copy(supplied) : { ten: Math.floor(xp % 100 / 10), hundred: Math.floor(xp / 100), remainder: xp % 10 };
      }
      PIECES.forEach(function (key) {
        if (options.all || options.piece === key || !same(normal.pieces[key], before.pieces[key])) { next.heroGear.pieces[key] = copy(normal.pieces[key]); next.heroGear.provenance[key] = copy(facts); }
      });
      PREFS.forEach(function (key) { next.preferences.heroGear[key] = copy(normal[key]); });
      if (options.records) options.records.forEach(function (record) {
        if (next.imports.some(function (old) { return old.contentHash === record.contentHash; })) throw new Error('Screenshot already confirmed');
        next.imports.push(copy(record));
        Object.keys(record.itemDelta).forEach(function (key) { next.heroGear.pieces[key] = copy(record.itemDelta[key].after); next.heroGear.provenance[key] = { source: 'screenshot', at: at, importId: record.id }; });
      });
      return commit(next, next.revision);
    }
    // Apply one reviewed screenshot: its inventory balances and pet levels
    // become confirmed facts with screenshot provenance, and the record joins the history. The
    // same file (by content hash) can never be applied twice.
    function applyImport(record, expected) {
      valid(importRecord(record));
      return transaction(function (next) {
        if (next.imports.some(function (old) { return old.contentHash === record.contentHash || old.id === record.id; })) throw new Error('Screenshot already confirmed');
        var at = new Date().toISOString();
        next.imports.push(copy(record));
        Object.keys(record.inventoryDelta || {}).forEach(function (key) {
          next.inventory[key] = { amount: record.inventoryDelta[key].after, status: 'confirmed', provenance: { source: 'screenshot', at: at, importId: record.id } };
          if (key === ITEMS.xp) next.heroGear.parts = null;
        });
        // A pet's level marks it tamed; its Advance survives only at the same level.
        Object.keys(record.petDelta || {}).forEach(function (key) {
          if (!next.pets) next.pets = { roster: {}, provenance: {} };
          var old = next.pets.roster[key], level = record.petDelta[key].after;
          next.pets.roster[key] = { level: level, advanced: !!(old && old.advanced && old.level === level) };
          next.pets.provenance[key] = { source: 'screenshot', at: at, importId: record.id };
        });
        Object.keys(record.itemDelta || {}).forEach(function (key) { next.heroGear.pieces[key] = copy(record.itemDelta[key].after); next.heroGear.provenance[key] = { source: 'screenshot', at: at, importId: record.id }; });
      }, expected);
    }
    function migrate() { return snapshot(); }
    // The whole save with its inventory history, as exported; importJSON restores both, so undo can too.
    function backup() { var out = snapshot(); out.history = { schemaVersion: 1, entries: readHistory().entries.filter(historyEntry) }; return out; }
    function importJSON(input, engine, expected) {
      var data = typeof input === 'string' ? JSON.parse(input) : input;
      if (data && data.format === 'kingshot-player') {
        // The file's history travels beside the save, never inside it. Files exported before it
        // was included have none: the local history is kept and the import recorded as a change.
        var save = Object.assign({}, data), log = save.history;
        delete save.history;
        if (log !== undefined) validHistory(log);
        var next = validate(save), old = snapshot();
        if (expected !== undefined && expected !== old.revision) throw new Error('Player ledger changed in another tool');
        return commit(next, old.revision, log);
      }
      return writeHeroGear(legacy(data, engine), engine, { all: true, source: 'file', expectedRevision: expected });
    }
    if (events && events.addEventListener) events.addEventListener('storage', function (event) {
      if ((event.key === KEY || event.key === null) && (!event.storageArea || event.storageArea === storage)) { try { current = read(); notify(); } catch (error) { if (events.dispatchEvent && typeof CustomEvent === 'function') events.dispatchEvent(new CustomEvent('player-ledger:error', { detail: error.message })); } }
    });
    return { seasonal: seasonal, setSeasonal: setSeasonal, kingdom: kingdom, setKingdom: setKingdom, snapshot: snapshot, balance: balance, setBalance: setBalance, setHeroGearPart: setHeroGearPart, combat: combat, setCombat: setCombat, heroes: heroes, setHero: setHero, masters: masters, setMaster: setMaster, pets: pets, setPet: setPet, buildings: buildings, setBuilding: setBuilding, setBuildings: setBuildings, setBuildingPriorities: setBuildingPriorities, priority: priority, setPriorityRole: setPriorityRole, setPriorityGoals: setPriorityGoals, training: training, setTraining: setTraining, setTrainingPlan: setTrainingPlan, setTrainingBuff: setTrainingBuff, governor: governor, setGovernor: setGovernor, setGovernorPreference: setGovernorPreference, resetGovernor: resetGovernor, subscribe: function (listener) { listeners.push(listener); return function () { listeners = listeners.filter(function (item) { return item !== listener; }); }; }, migrate: migrate, heroGear: function (engine) { return project(snapshot(), engine); }, writeHeroGear: writeHeroGear, applyImport: applyImport, importJSON: importJSON, history: history, backup: backup, exportJSON: function () { return JSON.stringify(backup(), null, 2); } };
  }
  return { KEY: KEY, LEGACY_KEY: LEGACY, ITEMS: copy(ITEMS), GOVERNOR: copy(GOVERNOR), TROOP_TYPES: TYPES.slice(), TRAINING: TRAINING.slice(), COMBAT_STATS: STATS.slice(), HERO: copy(HERO), MASTER: copy(MASTER), PET: copy(PET), troopId: troopId, masterEmblemId: masterEmblemId, heroShardId: heroShardId, heroWidgetId: heroWidgetId, widgetChestId: widgetChestId, buildingLevel: buildingLevel, IMPORT_SOURCES: IMPORT_SOURCES.slice(), empty: empty, seasonalRecord: seasonalRecord, validate: validate, validHistory: validHistory, HISTORY_KEY: HISTORY, GOALS: copy(GOALS), goal: goal, create: create };
});
