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
  var GOVERNOR_PREFS = { goal: ['stats', 'score'], focus: ['all', 'inf', 'cav', 'arc'], gearTarget: 58, charmTarget: 22 };
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function valid(ok) { if (!ok) throw new Error('Invalid player ledger'); }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function count(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 1e9; }
  function timestamp(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
  function id(value) { return typeof value === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(value); }
  function percent(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000; }
  function troopId(type, tier, tg) { return 'troop-' + type + '-t' + tier + '-tg' + tg; }
  function heroKey(value) { return typeof value === 'string' && /^[a-z][a-z0-9]{0,39}$/.test(value); }
  function heroShardId(hero) { return 'hero-shards-' + hero; }
  function upTo(value, max, min) { return value === null || count(value) && value >= (min || 0) && value <= max; }
  function hero(value) {
    return object(value) && same(Object.keys(value).sort(), HERO.fields.slice().sort()) && upTo(value.level, HERO.level, 1) && upTo(value.stars, HERO.stars) && upTo(value.widget, HERO.widget) &&
      (value.skills === null || Array.isArray(value.skills) && value.skills.length >= 1 && value.skills.length <= HERO.skills && value.skills.every(function (level) { return upTo(level, HERO.skill, 1); }));
  }
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
  function empty() {
    return { format: 'kingshot-player', schemaVersion: 1, revision: 0, updatedAt: new Date().toISOString(), inventory: {}, heroGear: { pieces: {}, provenance: {}, parts: null }, governorGear: { status: 'unsupported', pieces: {} }, governorCharms: { status: 'unsupported', slots: {} }, combat: { stats: {}, provenance: {} }, imports: [], preferences: { heroGear: {} }, migration: null };
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
    valid(object(value.preferences) && object(value.preferences.heroGear));
    valid(Object.keys(value.preferences).every(function (key) { return key === 'heroGear' || key === 'governor'; }) && Object.keys(value.preferences.heroGear).every(function (key) { return PREFS.includes(key); }));
    if (value.preferences.governor !== undefined) {
      var gov = value.preferences.governor;
      valid(object(gov) && Object.keys(gov).every(function (key) { return Object.hasOwn(GOVERNOR_PREFS, key); }));
      Object.keys(gov).forEach(function (key) { var rule = GOVERNOR_PREFS[key]; valid(Array.isArray(rule) ? rule.includes(gov[key]) : count(gov[key]) && gov[key] <= rule); });
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
      valid(object(record) && id(record.id) && !ids.has(record.id) && record.sourceType === 'hero-gear' && timestamp(record.at) && /^[a-f0-9]{64}$/.test(record.contentHash) && !hashes.has(record.contentHash) && record.confirmation === 'confirmed' && object(record.itemDelta));
      ids.add(record.id); hashes.add(record.contentHash);
      Object.keys(record.itemDelta).forEach(function (key) { var delta = record.itemDelta[key]; valid(PIECES.includes(key) && object(delta) && (delta.before === null || piece(delta.before)) && piece(delta.after)); });
    });
    valid(value.migration === null || object(value.migration) && value.migration.from === LEGACY && timestamp(value.migration.at));
    return copy(value);
  }
  function create(storage, events) {
    var listeners = [], current;
    function read() {
      var raw = storage.getItem(KEY);
      if (raw !== null) return validate(JSON.parse(raw));
      var old = storage.getItem(LEGACY);
      if (old === null) return empty();
      var input = legacy(JSON.parse(old)), next = empty(), facts = { source: 'legacy', at: next.updatedAt };
      Object.keys(ITEMS).forEach(function (key) { next.inventory[ITEMS[key]] = { amount: input.resources[key], status: 'confirmed', provenance: copy(facts) }; });
      PIECES.forEach(function (key) { next.heroGear.pieces[key] = copy(input.pieces[key]); next.heroGear.provenance[key] = copy(facts); });
      PREFS.forEach(function (key) { if (input[key] !== undefined) next.preferences.heroGear[key] = copy(input[key]); });
      var xp = input.resources.xp, parts = input.parts;
      next.heroGear.parts = parts && count(parts.ten) && count(parts.hundred) && count(parts.remainder) && parts.remainder < 10 && parts.ten * 10 + parts.hundred * 100 + parts.remainder === xp ? copy(parts) : { ten: Math.floor(xp % 100 / 10), hundred: Math.floor(xp / 100), remainder: xp % 10 };
      next.migration = { from: LEGACY, at: next.updatedAt }; next.revision = 1;
      next = validate(next);
      storage.setItem(KEY, JSON.stringify(next));
      return next;
    }
    function notify() {
      listeners.slice().forEach(function (listener) { listener(copy(current)); });
      if (events && events.dispatchEvent && typeof CustomEvent === 'function') events.dispatchEvent(new CustomEvent('player-ledger:change', { detail: copy(current) }));
    }
    function snapshot() { current = read(); return copy(current); }
    function commit(next, expected) {
      var latest = read();
      if (latest.revision !== expected) throw new Error('Player ledger changed in another tool');
      next.revision = latest.revision + 1;
      next.updatedAt = new Date().toISOString();
      next = validate(next);
      storage.setItem(KEY, JSON.stringify(next));
      current = next;
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
        valid(count(xp));
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
      var value = snapshot(), section = value.heroes || { roster: {}, provenance: {} }, shards = {};
      Object.keys(value.inventory).forEach(function (key) {
        var m = /^hero-shards-([a-z][a-z0-9]{0,39})$/.exec(key), entry = value.inventory[key];
        if (m && entry.status === 'confirmed') shards[m[1]] = entry.amount;
      });
      return { roster: copy(section.roster), provenance: copy(section.provenance), shards: shards };
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
    function governorSpec(kind) { valid(Object.hasOwn(GOVERNOR, kind)); return GOVERNOR[kind]; }
    function governor(kind) {
      var spec = governorSpec(kind), section = snapshot()[spec.section], levels = {};
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
    function migrate() { return snapshot(); }
    function importJSON(input, engine, expected) {
      var data = typeof input === 'string' ? JSON.parse(input) : input;
      if (data && data.format === 'kingshot-player') {
        var next = validate(data), old = snapshot();
        if (expected !== undefined && expected !== old.revision) throw new Error('Player ledger changed in another tool');
        return commit(next, old.revision);
      }
      return writeHeroGear(legacy(data, engine), engine, { all: true, source: 'file', expectedRevision: expected });
    }
    if (events && events.addEventListener) events.addEventListener('storage', function (event) {
      if ((event.key === KEY || event.key === null) && (!event.storageArea || event.storageArea === storage)) { try { current = read(); notify(); } catch (error) { if (events.dispatchEvent && typeof CustomEvent === 'function') events.dispatchEvent(new CustomEvent('player-ledger:error', { detail: error.message })); } }
    });
    return { snapshot: snapshot, balance: balance, setBalance: setBalance, setHeroGearPart: setHeroGearPart, combat: combat, setCombat: setCombat, heroes: heroes, setHero: setHero, governor: governor, setGovernor: setGovernor, setGovernorPreference: setGovernorPreference, resetGovernor: resetGovernor, subscribe: function (listener) { listeners.push(listener); return function () { listeners = listeners.filter(function (item) { return item !== listener; }); }; }, migrate: migrate, heroGear: function (engine) { return project(snapshot(), engine); }, writeHeroGear: writeHeroGear, importJSON: importJSON, exportJSON: function () { return JSON.stringify(snapshot(), null, 2); } };
  }
  return { KEY: KEY, LEGACY_KEY: LEGACY, ITEMS: copy(ITEMS), GOVERNOR: copy(GOVERNOR), TROOP_TYPES: TYPES.slice(), COMBAT_STATS: STATS.slice(), HERO: copy(HERO), troopId: troopId, heroShardId: heroShardId, empty: empty, validate: validate, create: create };
});
