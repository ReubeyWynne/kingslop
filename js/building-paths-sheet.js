/* The buildings page's levels on the shared guest sheet (js/page-sheet.js). A link carrying
   levels (have=) or ?guest runs on a copy held in memory, the address carries the levels of the
   buildings the goal involves, and Save as mine writes them to your save. The goal and
   construction speed are the page's own (js/pages/building-paths.mjs) and ride in the address
   either way; the page tells the sheet its goals so the address names the right buildings. */
(function () {
  'use strict';
  var E = window.BuildingPathsEngine, D = window.BuildingPaths;
  var link = E.decode(D, location.search), goals = link.goals;
  function haveOf(levels) { var out = {}; E.involved(D, goals).forEach(function (k) { if (levels[k] !== undefined) out[k] = levels[k]; }); return out; }
  var sheet = window.PageSheet.define({
    keys: ['have'],
    read: function (search) { var have = E.decode(D, search).have; return have === null ? null : { levels: have }; },
    write: function (value) { var text = E.encode({ have: haveOf(value.levels) }).replace(/^goal=[^&]*&?/, ''); return text ? { have: text.slice('have='.length) } : {}; },
    blank: function () { return { levels: {} }; },
    of: function (store) { return { levels: Object.assign({}, (store.snapshot().buildings || {}).levels) }; },
    load: function (store, value) { if (Object.keys(value.levels).length) store.setBuildings(value.levels, 'manual'); }
  });
  window.BuildingPathsSheet = {
    link: link, guest: sheet.guest,
    // The goals changed: the address carries the levels of the buildings they involve.
    sync: function (next) { goals = next; sheet.sync(); }
  };
}());
