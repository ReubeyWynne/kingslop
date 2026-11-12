/* The governor page's link (?gov=…&bag=…) for the shared guest sheet (js/page-sheet.js):
   without one it works on the player's save; a link, ?guest or Start blank puts it on a sheet
   of its own that only "Save as mine" writes back. The page's controllers
   (js/pages/governor-planner.mjs) work on whichever the page is on. */
(function () {
  'use strict';
  var G = window.Governor, Ledger = window.PlayerLedger;
  var MATERIALS = G.data.materials.map(function (m) { return m.id; });

  // The sheet a store holds, in the shape the link uses.
  function sheetOf(store) {
    var snapshot = store.snapshot(), bag = {};
    MATERIALS.forEach(function (id) { bag[id] = Ledger.confirmed(snapshot, id); });
    return { gear: store.governor('gear', snapshot), charms: store.governor('charms', snapshot), bag: bag, prefs: Object.assign({}, snapshot.preferences.governor || {}) };
  }
  function known(levels) { var out = {}; Object.keys(levels).forEach(function (id) { if (levels[id] !== null && levels[id] !== undefined) out[id] = levels[id]; }); return out; }
  /* Replace the governor part of a store with a sheet; other facts in the store stay. Saving
     to the player's own store keeps a material the sheet has not counted. */
  function load(store, sheet, keepUncounted) {
    store.resetGovernor();
    ['gear', 'charms'].forEach(function (kind) { var levels = known(sheet[kind] || {}); if (Object.keys(levels).length) store.setGovernor(kind, levels); });
    MATERIALS.forEach(function (id) {
      var n = sheet.bag && Number.isSafeInteger(sheet.bag[id]) ? sheet.bag[id] : null;
      if (n !== null || !keepUncounted) store.setBalance(id, n);
    });
    var prefs = sheet.prefs || {};
    Object.keys(prefs).forEach(function (key) { store.setGovernorPreference(key, prefs[key]); });
  }
  function query(sheet) { var e = G.encodeLink(sheet); return Object.keys(e).map(function (key) { return key + '=' + e[key]; }).join('&'); }

  window.PageSheet.define({
    keys: ['gov', 'bag', 'p', 'w', 'g', 'f', 'gt', 'ct'],
    read: G.readLink,
    write: G.encodeLink,
    blank: function () { return { gear: {}, charms: {}, bag: {}, prefs: {} }; },
    of: sheetOf,
    load: load,
    // A material the sheet has not counted would keep the saved number, so it does not count as a change.
    same: function (sheet, own) {
      var compared = Object.assign({}, sheet, { bag: Object.assign({}, sheet.bag) });
      MATERIALS.forEach(function (id) { if (compared.bag[id] === null) compared.bag[id] = own.bag[id]; });
      return query(compared) === query(own);
    }
  });
})();
