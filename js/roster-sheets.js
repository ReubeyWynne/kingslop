/* Share links and guest sheets for the roster pages: Heroes, Masters and Pets.

   Each page describes its link to the shared guest sheet (js/page-sheet.js): the roster it
   holds and the inventory its points read. A link opens on a sheet of its own, ?guest on a
   copy of your save, and Save as mine replaces that page's roster with the sheet's; a balance
   the sheet has not counted keeps your number.

     heroes   ?h=amadeus.80.27.6.545,…&hi=hero-shards-amadeus:34,…   level.stars.widget.skills
     masters  ?m=valora.29.1.3.2.0.,…&mi=master-emblems-valora:10,…   affinity.ready.4 skills
     pets     ?pets=gray-wolf.20a,cheetah.35                         level, a when advanced

   An empty field is unread. A link that names something the save would refuse (an unknown
   hero, a level past the cap) is unreadable as a whole. */
(function (root) {
  'use strict';
  var Ledger = root.PlayerLedger, page = document.documentElement.getAttribute('data-page');
  function num(text) { return text === '' || text === undefined ? null : /^\d{1,4}$/.test(text) ? Number(text) : NaN; }
  function list(text) { return text ? text.split(',') : []; }
  function field(value) { return value === null || value === undefined ? '' : String(value); }

  // A balance list, id:amount, for the inventory ids a page reads.
  function readItems(text, wanted) {
    var out = {};
    list(text).forEach(function (pair) {
      var at = pair.lastIndexOf(':'), id = pair.slice(0, at), n = Number(pair.slice(at + 1));
      if (at < 1 || !wanted(id) || !/^\d{1,10}$/.test(pair.slice(at + 1))) throw new Error('item');
      out[id] = n;
    });
    return out;
  }
  function writeItems(items) { return Object.keys(items).sort().filter(function (id) { return items[id] !== null; }).map(function (id) { return id + ':' + items[id]; }).join(','); }
  function heldItems(store, wanted) {
    var inventory = store.snapshot().inventory, out = {};
    Object.keys(inventory).forEach(function (id) { if (wanted(id)) { var n = Ledger.confirmed({ inventory: inventory }, id); if (n !== null) out[id] = n; } });
    return out;
  }

  var PAGES = {
    heroes: {
      keys: ['h', 'hi'],
      known: function () { return (root.HeroCatalogue || []).map(function (hero) { return hero.key; }); },
      items: function (id) { return /^(hero-shards-|hero-widgets-|hero-widget-chest-gen)/.test(id) || ['mythic-hero-shard', 'epic-hero-shard', 'rare-hero-shard', 'hero-widget'].includes(id); },
      roster: function (store) { return store.heroes().roster; },
      set: function (store, key, record) { store.setHero(key, record, 'manual'); },
      parse: function (parts) {
        var skills = parts[4] ? parts[4].split('').map(Number) : null;
        return { level: num(parts[1]), stars: num(parts[2]), widget: num(parts[3]), skills: skills };
      },
      format: function (key, r) { return [key, field(r.level), field(r.stars), field(r.widget), r.skills && r.skills.every(function (n) { return n !== null; }) ? r.skills.join('') : ''].join('.'); }
    },
    masters: {
      keys: ['m', 'mi'],
      known: function () { return ((root.MasterData || {}).masters || []).map(function (master) { return master.id; }); },
      items: function (id) { return /^master-emblems-/.test(id) || id === 'general-master-emblem' || id === 'masters-manuscript'; },
      roster: function (store) { return store.masters().roster; },
      set: function (store, key, record) { store.setMaster(key, record, 'manual'); },
      parse: function (parts) { return { affinity: num(parts[1]), ready: parts[2] === '1', skills: [3, 4, 5, 6].map(function (i) { return num(parts[i]); }) }; },
      format: function (key, r) { return [key, field(r.affinity), r.ready ? '1' : ''].concat((r.skills || []).map(field)).join('.'); }
    },
    pets: {
      keys: ['pets'],
      known: function () { return ((root.PetData || {}).pets || []).map(function (pet) { return pet.id; }); },
      items: function () { return false; },
      roster: function (store) { return store.pets().roster; },
      set: function (store, key, record) { store.setPet(key, record, 'manual'); },
      parse: function (parts) { var m = /^(\d{0,3})(a?)$/.exec(parts[1] || ''); if (!m) throw new Error('pet'); return { level: num(m[1]), advanced: m[2] === 'a' }; },
      format: function (key, r) { return key + '.' + field(r.level) + (r.advanced ? 'a' : ''); }
    }
  };
  var spec = PAGES[page];
  if (!spec || !root.PageSheet) return;
  var rosterKey = spec.keys[0], itemKey = spec.keys[1];

  // Replace a store's roster with the sheet's, and set the balances it counted.
  function load(store, sheet, mine) {
    var now = spec.roster(store);
    Object.keys(now).forEach(function (key) { if (!Object.hasOwn(sheet.roster, key)) spec.set(store, key, null); });
    Object.keys(sheet.roster).forEach(function (key) { spec.set(store, key, sheet.roster[key]); });
    Object.keys(sheet.items).forEach(function (id) { store.setBalance(id, sheet.items[id]); });
  }
  function read(search) {
    var params = new URLSearchParams(search);
    if (!spec.keys.some(function (key) { return params.has(key); })) return null;
    try {
      var known = spec.known(), sheet = { roster: {}, items: itemKey ? readItems(params.get(itemKey), spec.items) : {} };
      list(params.get(rosterKey)).forEach(function (entry) {
        var parts = entry.split('.');
        if (!parts[0] || Object.hasOwn(sheet.roster, parts[0]) || !known.includes(parts[0])) throw new Error('entry');
        sheet.roster[parts[0]] = spec.parse(parts);
      });
      // The save is the judge: a sheet it would refuse is no sheet at all.
      var memory = {}, scratch = Ledger.create({ getItem: function (key) { return memory[key] || null; }, setItem: function (key, value) { memory[key] = String(value); } }, null);
      load(scratch, sheet, false);
      return sheet;
    } catch (cause) { return { invalid: true }; }
  }
  function write(sheet) {
    var out = {};
    out[rosterKey] = Object.keys(sheet.roster).sort().map(function (key) { return spec.format(key, sheet.roster[key]); }).join(',');
    if (itemKey) out[itemKey] = writeItems(sheet.items);
    return out;
  }

  root.PageSheet.define({
    keys: spec.keys,
    read: read,
    write: write,
    blank: function () { return { roster: {}, items: {} }; },
    of: function (store) { return { roster: spec.roster(store), items: heldItems(store, spec.items) }; },
    load: load,
    // Saving keeps a balance the sheet has not counted, so one it lacks is no change.
    same: function (sheet, own) {
      var items = Object.assign({}, own.items, sheet.items);
      return JSON.stringify(write(sheet)) === JSON.stringify(write({ roster: own.roster, items: items }));
    }
  });
})(window);
