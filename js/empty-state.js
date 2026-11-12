/* A tool's teaching empty state: shown while the player's own save lacks the part this tool
   works from (`data-needs`), so a blank tool says what is missing and where to add it. The save
   tells unknown apart from zero, so a confirmed 0 counts as recorded. It stays hidden under a
   guest or shared-link store, and without JavaScript. The include binds to it with Alpine. */
(function (root) {
  'use strict';
  function some(map, test) { return Object.keys(map || {}).some(function (id) { return test(map[id]); }); }
  function known(entry) { return Boolean(entry) && entry.level !== null && entry.level !== undefined; }
  function roster(section) { return function (snapshot) { return !Object.keys((snapshot[section] && snapshot[section].roster) || {}).length; }; }
  var MISSING = {
    inventory: function (snapshot) { return !some(snapshot.inventory, function (entry) { return entry && entry.status === 'confirmed'; }); },
    'hero-gear': function (snapshot) { return !some(snapshot.heroGear && snapshot.heroGear.pieces, known); },
    governor: function (snapshot) { var gear = snapshot.governorGear; return !gear || gear.status !== 'tracked' || !some(gear.pieces, known); },
    heroes: roster('heroes'),
    masters: roster('masters'),
    pets: roster('pets')
  };
  // True when the save lacks this part; an unknown part name is never reported missing.
  function missing(snapshot, needs) { return Object.hasOwn(MISSING, needs) && MISSING[needs](snapshot || {}); }
  var api = { missing: missing, needs: Object.keys(MISSING) };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root || !root.document) return;
  root.EmptyState = api;
  // The include's x-data="emptyState('<needs>')": hidden while the save has that part, on a
  // sheet, or while the save cannot be read.
  root.document.addEventListener('alpine:init', function () {
    root.Alpine.data('emptyState', function (needs) {
      return { get hidden() { var ledger = root.Alpine.store('ledger'); return ledger.guest || !ledger.ready || !missing(ledger.snapshot, needs); } };
    });
  });
})(typeof window === 'undefined' ? null : window);
