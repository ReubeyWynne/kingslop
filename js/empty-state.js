/* A tool's teaching empty state: shown while the player's own save lacks the part this tool
   works from (`data-needs`), so a blank tool says what is missing and where to add it. The save
   tells unknown apart from zero, so a confirmed 0 counts as recorded. It stays hidden under a
   guest or shared-link store, and without JavaScript. */
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
  if (!root || !root.Interactions) return;
  root.EmptyState = api;
  root.Interactions.register('empty-state', function (context) {
    var node = context.root, needs = node.dataset.needs, store = null;
    try { store = context.ledger === root.PlayerLedger.shared() ? context.ledger : null; if (store) store.snapshot(); } catch (cause) { store = null; }
    function render() { node.hidden = !store || !missing(store.snapshot(), needs); }
    if (store) context.cleanup(store.subscribe(render));
    render();
    return { refresh: render };
  });
})(typeof window === 'undefined' ? null : window);
