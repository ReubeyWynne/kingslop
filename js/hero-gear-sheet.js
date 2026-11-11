/* The hero gear page's link (?gear=…&w=…) for the shared guest sheet (js/page-sheet.js): it
   carries the twelve pieces and the priorities; ?guest, a link or Start blank work on a copy of
   the ledger that only Save as mine writes back. Pieces and priority replace yours there; a
   material the sheet left at 0 keeps your number, since a link never carries the bag. The page
   itself is js/pages/hero-gear.mjs. */
(function () {
  'use strict';
  var E = window.HeroGear;
  function copy(s) { return JSON.parse(JSON.stringify(s)); }
  var sheet = window.PageSheet.define({
    keys: ['gear', 'w'],
    read: E.readLink,
    write: E.encodeLink,
    blank: E.defaults,
    of: function (store) { return store.heroGear(E); },
    load: function (store, value, mine) {
      if (!mine) { store.writeHeroGear(Object.assign(E.defaults(), value), E, { source: 'manual' }); return; }
      var own = store.heroGear(E), next = Object.assign({}, own, copy(value), { resources: copy(own.resources), parts: own.parts });
      E.RES.forEach(function (r) { if (value.resources[r] > 0) next.resources[r] = value.resources[r]; });
      if (value.resources.xp > 0) next.parts = copy(value.parts);
      store.writeHeroGear(next, E, { source: 'manual' });
    },
    // The same gear and priority, and no material that saving would change.
    same: function (value, own) {
      var a = E.encodeLink(value), b = E.encodeLink(own);
      return a.gear === b.gear && a.w === b.w && E.RES.every(function (r) { return !(value.resources[r] > 0) || value.resources[r] === own.resources[r]; });
    }
  });
  window.HeroGearSheet = { guest: sheet.guest };
}());
