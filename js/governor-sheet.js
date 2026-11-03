/* The governor page's link (?gov=…&bag=…) for the shared guest sheet (js/page-sheet.js):
   without one it works on the player's save; a link, ?guest or Start blank puts it on a sheet
   of its own that only "Save as mine" writes back. A screenshot read by the import dock lands
   on whichever the page is working on. */
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
  // On your own save the materials say they are saved, not that they stay on the sheet.
  if (!window.PageSheet.current.guest) { var bagForm = document.getElementById('governor-bag'); if (bagForm) bagForm.dataset.savedKey = 'gear.saved'; }

  /* A Governor Profile read by the import dock (js/import-adapters/governor.js) lands on
     whichever store the page works on: values keyed 'gov-cav-1' (gear) and 'gov-cav-1-2' (a
     charm). `before` gets what each held, so the dock can undo. */
  window.Interactions.register('governor-sheet', function (context) {
    var store = context.ledger;
    context.listen(context.root, 'screen-import:sheet', function (event) {
      var values = event.detail.values, before = event.detail.before, now = { gear: store.governor('gear'), charms: store.governor('charms') }, change = { gear: {}, charms: {} };
      Object.keys(values).forEach(function (key) {
        var m = /^gov-([a-z]+-\d)(?:-(\d))?$/.exec(key), value = values[key];
        if (!m) return;
        var kind = m[2] ? 'charms' : 'gear', id = m[2] ? m[1] + '-' + m[2] : m[1];
        before[key] = now[kind][id];
        change[kind][id] = value === null || value === '' ? null : Number(value);
      });
      ['gear', 'charms'].forEach(function (kind) { if (Object.keys(change[kind]).length) store.setGovernor(kind, change[kind]); });
    });
    return {};
  });
})();
