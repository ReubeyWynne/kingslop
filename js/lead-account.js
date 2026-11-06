/* lead-account.js — your account for LeadEngine, read from the save.
   Plain ES5, no DOM. The Heroes page's lead finder and the Bear Hunt page's
   damage estimate both score lineups from the same save, so they read it
   here: one reading, one set of stand-ins. .dsh/lead-account-check.cjs
   requires it in Node.

   store is the PlayerLedger (or anything with the same readers); any reader
   can throw or be missing, and each value then falls back to what an empty
   save gives. prefs are the lead finder's own choices (ks.lead-finder.v1):
   joiners, city buffs, the pets switch and a typed rally capacity. */
(function (root) {
  'use strict';

  var TYPES = ['inf', 'cav', 'arc'], STATS = ['attack', 'lethality', 'defense', 'health'];
  var PREFS = 'ks.lead-finder.v1', BEAR_ALLOCATOR = 'bh:bear-allocator:v1';

  function attempt(fn, fallback) { try { var v = fn(); return v === undefined || v === null ? fallback : v; } catch (cause) { return fallback; } }
  function L() { return root.LeadEngine; }

  // The lead finder's choices, kept in this browser. Storage can be blocked.
  function prefs(storage) {
    storage = storage || attempt(function () { return root.localStorage; }, null);
    var v = attempt(function () { return JSON.parse(storage.getItem(PREFS) || '{}'); }, {});
    if (!v || typeof v !== 'object') v = {};
    if (!v.joiners || typeof v.joiners !== 'object') v.joiners = {};
    return v;
  }

  function roster(store) { return attempt(function () { return store.heroes().roster; }, {}); }
  function combat(store) { return attempt(function () { return store.combat(); }, { overview: {}, troops: [] }); }

  // The kingdom's generation: the server age if it's set, else your newest hero's, else 4.
  // The stock opponents stop at the last generation they know.
  function generation(owned, data, serverGen) {
    var last = data.megafauna.generations.length;
    if (serverGen) return Math.max(1, Math.min(last, serverGen | 0));
    var top = 0;
    Object.keys(owned || {}).forEach(function (key) { if (data.heroes[key]) top = Math.max(top, data.heroes[key].generation); });
    return top || 4;
  }

  // The Bonus Overview: rows as typed or saved. The Squads' row adds to every troop type;
  // a type not filled in full takes the generation's typical total instead.
  function overview(rows, gen, data) {
    rows = rows || {};
    var typical = data.megafauna.overview[String(gen)], out = {}, missing = [];
    function whole(row) { return row && STATS.every(function (k) { return row[k] !== null && row[k] !== undefined; }); }
    var squads = whole(rows.squads) ? rows.squads : null;
    TYPES.forEach(function (type) {
      var row = rows[type];
      if (whole(row)) { out[type] = {}; STATS.forEach(function (k) { out[type][k] = row[k] + (squads ? squads[k] : 0); }); }
      else { missing.push(type); out[type] = { attack: typical, lethality: typical, defense: typical, health: typical }; }
    });
    return { rows: out, missing: missing, typical: typical, noSquads: !squads && missing.length < 3 };
  }

  // Your best saved troops, else the generation's usual tier and Truegold.
  function troopTier(store, gen, data) {
    var best = null;
    (combat(store).troops || []).forEach(function (row) { if (!best || row.tier > best.tier || (row.tier === best.tier && row.tg > best.tg)) best = row; });
    var stock = data.megafauna.troops[String(gen)];
    return { tier: best ? best.tier : stock.tier, tg: best ? best.tg : stock.tg, saved: !!best };
  }
  function troops(tier, tg) { return { tier: [tier, tier, tier], tg: [tg, tg, tg] }; }

  function gear(store) { return attempt(function () { return L().gearLayer(store.snapshot().heroGear.pieces); }, null) || L().gearLayer({}); }
  function town(store) { return attempt(function () { return L().townLayer(store.buildings().levels['town-center']); }, null) || L().townLayer(null); }
  // Valora's Hunter Instinct talent: it adds to your own Damage Points.
  function valora(store) { return attempt(function () { return L().valoraPoints(store.masters().roster.valora); }, 0); }
  function petLevels(store) {
    var levels = {};
    attempt(function () { var r = store.pets().roster; Object.keys(r).forEach(function (id) { levels[id] = r[id].level; }); return levels; }, levels);
    return levels;
  }
  function pets(store, data, on) { return on === false ? L().blank() : L().petLayer(petLevels(store), data); }
  function city(p) { var out = {}; Object.keys((p && p.city) || {}).forEach(function (k) { out[k] = Number(p.city[k]) || 0; }); return out; }

  // The four joiners: the ones you picked for this job, else the generation's usual four at level 5.
  function usualJoiners(job, gen, data) { return (data.megafauna.joiners[job][String(gen)] || []).map(function (key) { return { key: key, level: 5 }; }); }
  function joiners(p, job, gen, data) {
    var saved = p && p.joiners && p.joiners[job];
    return Array.isArray(saved) ? saved.filter(function (j) { return j && data.heroes[j.key]; }).map(function (j) { return { key: j.key, level: Math.max(1, Math.min(5, j.level | 0)) }; }) : usualJoiners(job, gen, data);
  }

  // The Bear rally's capacity: as typed in the lead finder, else 15 × the joiner cap saved on
  // the Bear Hunt page (85k unless changed), since an alliance sets that cap so a full rally holds 15 marches.
  function rallyCap(p, storage) {
    if (p && p.rallyCap > 0) return { cap: p.rallyCap, estimated: false };
    storage = storage || attempt(function () { return root.localStorage; }, null);
    var join = 85000, bh = attempt(function () { return JSON.parse(storage.getItem(BEAR_ALLOCATOR) || 'null'); }, null);
    if (bh && Number(bh['join-cap']) > 0) join = Number(bh['join-cap']);
    return { cap: join * 15, estimated: true };
  }

  // Everything LeadEngine needs, from the save alone. opts: { job, prefs, rows, tier, tg, serverGen }.
  function read(store, data, opts) {
    opts = opts || {};
    var p = opts.prefs || prefs(), job = opts.job || 'bear', owned = roster(store);
    var gen = generation(owned, data, opts.serverGen);
    var ov = overview(opts.rows || combat(store).overview, gen, data);
    var tt = troopTier(store, gen, data);
    return {
      gen: gen, owned: owned, overview: ov, prefs: p,
      you: {
        overview: ov.rows, troops: troops(opts.tier || tt.tier, opts.tg === undefined ? tt.tg : opts.tg),
        joiners: joiners(p, job, gen, data), city: L().cityLayer(city(p)), pets: pets(store, data, p.usePets),
        gear: gear(store), town: town(store)
      },
      troopsSaved: tt.saved, valora: valora(store)
    };
  }

  var api = {
    PREFS: PREFS, prefs: prefs, roster: roster, combat: combat, generation: generation, overview: overview, troopTier: troopTier, troops: troops,
    gear: gear, town: town, valora: valora, petLevels: petLevels, pets: pets, city: city, usualJoiners: usualJoiners, joiners: joiners, rallyCap: rallyCap, read: read
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LeadAccount = api;
})(typeof self !== 'undefined' ? self : this);
