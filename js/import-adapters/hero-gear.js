/* Hero gear — a hero's overview (four gear tiles in two columns, each with its
   enhancement across the top and forge mastery along the bottom) or one
   piece's detail screen. The overview is known by its tile frames before any
   reading (HeroGearOCR.detect), so the dock skips the whole-screen read and
   each tile's two labels are read on their own, on the WASM engine: they are
   tiny crops, where the GPU path gains nothing and fails most. A detail
   screen is read as words (HeroGearOCR.parse).

   Each piece gives two proposals, enhancement and forge mastery, grouped
   under its tile so the review shows the piece once with both values. A red
   piece's level is shown as its +N; one whose last digit hides under the upgrade arrow
   is flagged for a look. A troop the badge didn't settle falls
   back to the piece last chosen on the hero gear page, flagged for a look.

   Needs the dock's tools: tools.pixels, tools.blob, tools.readWasm(blob) and
   tools.selected ('inf-helm' or null). */
(function (root, factory) {
  var deps = typeof module === 'object' && module.exports
    ? [require('../hero-gear-ocr.js'), require('../screen-import-core.js')]
    : [root.HeroGearOCR, root.ScreenImport];
  var api = factory(deps[0], deps[1]);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (G, S) {
  'use strict';

  var TROOPS = { inf: 'Infantry', cav: 'Cavalry', arc: 'Archer' };
  var SLOTS = { helm: 'Helm', gloves: 'Gloves', chest: 'Chest', boots: 'Boots' };
  var QUALITY = { epic: 'epic', mythic: 'mythic', red: 'red' };

  // Hero overviews are portrait shots; detect() finds the four framed tiles.
  function overview(px) { return !!px && px.height >= px.width * 1.2 && px.height <= px.width * 3.5 && !!G.detect(px); }

  function proposals(piece, i, guessed) {
    var id = piece.troop + '-' + piece.slot, red = piece.quality === 'red';
    var label = TROOPS[piece.troop] + ' ' + SLOTS[piece.slot];
    var sure = piece.failed || guessed ? 0.5 : 0.95;
    var level = piece.level === null || piece.level === undefined ? null : piece.level - (red ? 100 : 0);
    var mastery = piece.mastery === null || piece.mastery === undefined ? null : piece.mastery;
    var common = { target: 'gear', piece: id, quality: piece.quality || null, label: label, named: true, crop: piece.preview || null, group: id, groupLabel: label + (QUALITY[piece.quality] ? ' · ' + QUALITY[piece.quality] : '') };
    return [
      Object.assign({ id: 'gear-' + id + '-level', field: 'level', value: level, max: piece.quality === 'epic' ? 80 : 100, unit: 'gear-level', confidence: level === null ? 0 : piece.levelClipped ? 0.5 : sure, y: i * 2 }, common),
      Object.assign({ id: 'gear-' + id + '-mastery', field: 'mastery', value: mastery, max: 20, unit: 'gear-mastery', confidence: mastery === null ? 0 : sure, y: i * 2 + 1 }, common)
    ];
  }

  var adapter = {
    id: 'hero-gear',
    sourceType: 'hero-gear',
    layout: 'gear',
    probe: function (px) { return overview(px) ? 0.9 : 0; },
    // A detail screen names its slot and prints a level.
    detect: function (p) { var g = G.parse(p.items); return g.slot && g.level !== null ? 0.7 : 0; },
    read: function (p, tools) {
      var chosen = tools && tools.selected ? String(tools.selected).split('-') : [];
      var start = tools && tools.blob && tools.readWasm && overview(tools.pixels)
        ? G.overview(tools.blob, tools.readWasm).catch(function () { return null; })
        : Promise.resolve(null);
      return start.then(function (pieces) {
        if (!pieces) pieces = p.items && p.items.length ? [G.parse(p.items)] : [];
        var out = [];
        pieces.forEach(function (piece, i) {
          var guessed = !piece.troop || !piece.slot;
          piece = Object.assign({}, piece, { troop: piece.troop || chosen[0], slot: piece.slot || chosen[1] });
          if (!TROOPS[piece.troop] || !SLOTS[piece.slot]) return;
          out = out.concat(proposals(piece, i, guessed));
        });
        return out;
      });
    }
  };

  S.register(adapter);
  return adapter;
});
