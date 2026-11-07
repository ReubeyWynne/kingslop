/* lead-inputs.js — what a lineup's result is worked out from, and how sure it is.
   Plain ES5, no page of its own: the Heroes page's lead finder uses it today,
   and any other page that scores lineups from the save (a Bear Hunt formation
   tool, say) can use it the same way. .dsh/lead-inputs-check.cjs requires it
   in Node.

   gather(store, choices) reads the save once into plain facts. assess(job,
   facts) turns them into the inputs a job needs, each one:

     yes   saved, so the result uses it
     est   stood in for: a typical or usual value takes its place
     no    missing: the result leaves it out, which only ever lowers it

   An input is core when leaving it out moves the answer a lot (the Bonus
   Overview, hero gear, the Town Centre's Truegold, Valora for the Bear) and
   minor when it moves it a little. Any core input that isn't yes makes the
   result provisional. paint(list, inputs, opts) draws the inputs as the
   site's input chips (css/motifs.css, "Inputs"), each linking to where the
   value is filled in. */
(function (root) {
  'use strict';

  var TYPES = ['inf', 'cav', 'arc'], STATS = ['attack', 'lethality', 'defense', 'health'];
  var SLOTS = ['helm', 'gloves', 'chest', 'boots'];
  // Where each input is filled in: a page and the anchor on it.
  var WHERE = {
    heroes: { page: 'heroes', hash: 'directory' },
    overview: { page: 'heroes', hash: 'bonus-overview' },
    gear: { page: 'hero-gear', hash: '' },
    town: { page: 'town-centre', hash: 'town-buildings' },
    valora: { page: 'masters', hash: 'master-valora' },
    troops: { page: 'heroes', hash: 'bonus-overview' },
    rally: { page: 'heroes', hash: 'bonus-overview' },
    pets: { page: 'pets', hash: 'cage' }
  };
  var LABELS = {
    heroes: 'Heroes', overview: 'Bonus Overview', gear: 'Hero gear', town: 'Town Centre',
    valora: 'Valora', troops: 'Troop tier', rally: 'Rally capacity', pets: 'Pets'
  };

  function whole(row) { return !!row && STATS.every(function (k) { return typeof row[k] === 'number' && isFinite(row[k]); }); }
  function attempt(fn, fallback) { try { var v = fn(); return v === undefined ? fallback : v; } catch (cause) { return fallback; } }

  // The save, read once. choices are the reader's own settings on the page:
  // overview (rows typed so far, which may not be saved yet), usePets,
  // rallyTyped and tierPicked.
  function gather(store, choices) {
    choices = choices || {};
    var snap = attempt(function () { return store.snapshot(); }, null);
    var roster = attempt(function () { return store.heroes().roster; }, {}) || {};
    var combat = attempt(function () { return store.combat(); }, {}) || {};
    var overview = choices.overview || combat.overview || {};
    var pieces = (snap && snap.heroGear && snap.heroGear.pieces) || {};
    var gear = {};
    TYPES.forEach(function (type) { gear[type] = SLOTS.filter(function (slot) { return !!pieces[type + '-' + slot]; }).length; });
    var levels = attempt(function () { return store.buildings().levels; }, {}) || {};
    var masters = attempt(function () { return store.masters().roster; }, {}) || {};
    var pets = attempt(function () { return store.pets().roster; }, {}) || {};
    var town = Object.prototype.hasOwnProperty.call(levels, 'town-center') ? levels['town-center'] : null;
    return {
      heroes: Object.keys(roster).filter(function (k) { return roster[k] && roster[k].stars !== null && roster[k].stars !== undefined; }).length,
      overview: { types: TYPES.filter(function (t) { return whole(overview[t]); }), squads: whole(overview.squads) },
      gear: gear,
      town: town === null || town === undefined ? null : String(town),
      valora: masters.valora && masters.valora.affinity !== null && masters.valora.affinity !== undefined ? masters.valora : null,
      pets: Object.keys(pets).filter(function (id) { return pets[id] && pets[id].level > 0; }).length,
      usePets: choices.usePets !== false,
      troops: !!choices.tierPicked || (combat.troops || []).length > 0,
      rally: !!choices.rallyTyped
    };
  }

  // Truegold levels whose Town Centre bonus is known (js/lead-engine.mjs TOWN_TG).
  function townState(level, known) {
    if (level === null) return 'no';
    var m = /^TG ?(\d+)/.exec(level);
    if (!m) return 'yes';
    return !known || known[m[1]] ? 'yes' : 'est';
  }

  // The inputs a job is worked out from, in the order a reader fills them.
  // opts.townKnown: the Truegold levels with a known bonus ({ 2: …, 4: … }).
  function assess(job, facts, opts) {
    opts = opts || {};
    var bear = job === 'bear', items = [];
    function add(id, have, core, extra) { items.push(Object.assign({ id: id, have: have, core: core }, extra || {})); }
    add('heroes', facts.heroes > 0 ? 'yes' : 'no', true);
    var ov = facts.overview, all = ov.types.length === TYPES.length && ov.squads;
    add('overview', all ? 'yes' : 'est', true, { missing: TYPES.filter(function (t) { return ov.types.indexOf(t) === -1; }).concat(ov.squads ? [] : ['squads']) });
    var bare = TYPES.filter(function (t) { return !facts.gear[t]; });
    add('gear', bare.length ? 'no' : 'yes', true, { missing: bare });
    add('town', townState(facts.town, opts.townKnown), true);
    if (bear) add('valora', facts.valora ? 'yes' : 'no', true);
    add('troops', facts.troops ? 'yes' : 'est', false);
    if (bear) add('rally', facts.rally ? 'yes' : 'est', false);
    if (facts.usePets) add('pets', facts.pets > 0 ? 'yes' : 'no', false);
    var short = items.filter(function (i) { return i.have !== 'yes'; });
    return {
      items: items,
      // Something the answer depends on is stood in for or missing.
      provisional: items.some(function (i) { return i.core && i.have !== 'yes'; }),
      // What's left out entirely: filling these in only raises the result.
      open: short.filter(function (i) { return i.have === 'no' && i.id !== 'heroes'; }).map(function (i) { return i.id; }),
      // What's stood in for by a typical value.
      estimated: short.filter(function (i) { return i.have === 'est'; }).map(function (i) { return i.id; }),
      // Whether a troop type's numbers lean on a stand-in or leave something out.
      typeShort: function (type) { return ov.types.indexOf(type) === -1 || !facts.gear[type] || townState(facts.town, opts.townKnown) !== 'yes'; }
    };
  }

  // An input's link from the page it's shown on: an anchor on the same page,
  // otherwise the page beside it. here lists inputs a page fills in itself
  // (the Bear Hunt page carries its own Bonus Overview), linked in place.
  function href(id, self, here) {
    var at = WHERE[id];
    if (!at) return '#';
    if (at.page === self || (here && here.indexOf(id) !== -1)) return '#' + at.hash;
    return '../' + at.page + '/' + (at.hash ? '#' + at.hash : '');
  }

  // The chips: list is a <ul class="inputs">; opts.self is the page's own
  // folder name, opts.label(id) its translated name for an input.
  function paint(list, result, opts) {
    opts = opts || {};
    var doc = list.ownerDocument;
    list.replaceChildren();
    result.items.forEach(function (item) {
      var li = doc.createElement('li'), a = doc.createElement('a');
      li.dataset.have = item.have;
      li.dataset.input = item.id;
      if (item.core) li.dataset.core = '';
      a.href = href(item.id, opts.self, opts.here);
      a.textContent = opts.label ? opts.label(item.id) : LABELS[item.id];
      li.appendChild(a);
      list.appendChild(li);
    });
  }

  var api = { TYPES: TYPES, LABELS: LABELS, WHERE: WHERE, gather: gather, assess: assess, href: href, paint: paint };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LeadInputs = api;
})(typeof self !== 'undefined' ? self : this);
