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
  var PIECES = ['inf', 'cav', 'arc'].flatMap(function (troop) { return ['helm', 'gloves', 'chest', 'boots'].map(function (slot) { return troop + '-' + slot; }); });
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function valid(ok) { if (!ok) throw new Error('Invalid player ledger'); }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function count(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 1e9; }
  function timestamp(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
  function id(value) { return typeof value === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(value); }
  function provenance(value) {
    return object(value) && ['manual', 'legacy', 'screenshot', 'plan', 'reset', 'file'].includes(value.source) && timestamp(value.at) && (value.importId === undefined || id(value.importId));
  }
  function piece(value) {
    return object(value) && (value.quality === null || ['epic', 'mythic', 'red'].includes(value.quality)) && (value.level === null || count(value.level) && value.level <= (value.quality === 'epic' ? 80 : value.quality === 'mythic' ? 100 : 200)) && (value.mastery === null || count(value.mastery) && value.mastery <= 20) && (value.quality !== 'epic' || value.mastery === null || value.mastery === 0) && (value.quality !== 'red' || (value.level === null || value.level >= 100) && (value.mastery === null || value.mastery >= (value.level === null || value.level < 120 ? 10 : 10 + Math.floor((value.level - 100) / 20))));
  }
  function empty() {
    return { format: 'kingshot-player', schemaVersion: 1, revision: 0, updatedAt: new Date().toISOString(), inventory: {}, heroGear: { pieces: {}, provenance: {}, parts: null }, governorGear: { status: 'unsupported', pieces: {} }, governorCharms: { status: 'unsupported', slots: {} }, imports: [], preferences: { heroGear: {} }, migration: null };
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
    valid(object(value.governorGear) && value.governorGear.status === 'unsupported' && object(value.governorGear.pieces) && !Object.keys(value.governorGear.pieces).length);
    valid(object(value.governorCharms) && value.governorCharms.status === 'unsupported' && object(value.governorCharms.slots) && !Object.keys(value.governorCharms.slots).length);
    valid(object(value.preferences) && object(value.preferences.heroGear));
    valid(Object.keys(value.preferences).every(function (key) { return key === 'heroGear'; }) && Object.keys(value.preferences.heroGear).every(function (key) { return PREFS.includes(key); }));
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
    return { snapshot: snapshot, balance: balance, setBalance: setBalance, subscribe: function (listener) { listeners.push(listener); return function () { listeners = listeners.filter(function (item) { return item !== listener; }); }; }, migrate: migrate, heroGear: function (engine) { return project(snapshot(), engine); }, writeHeroGear: writeHeroGear, importJSON: importJSON, exportJSON: function () { return JSON.stringify(snapshot(), null, 2); } };
  }
  return { KEY: KEY, LEGACY_KEY: LEGACY, ITEMS: copy(ITEMS), empty: empty, validate: validate, create: create };
});
