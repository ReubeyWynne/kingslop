/* Backpack tiles — the item grid on any Backpack tab. The tiles carry no names,
   only an icon and a count, so items are told apart by their icons: each full
   tile's icon is sampled into a small colour signature and compared with
   references taken from the owner's screenshots (.dsh/import-fixtures/,
   extracted by .dsh/import-signatures.cjs). Only the event items the Town
   Centre bag tracks have references; every other tile is passed over quietly.
   Counts are too small to read at the detector's 800px, so the matched tiles'
   count corners are cut from the original image and read once more, enlarged,
   keeping only the counts' white glyphs.

   Signatures and matching are the core's (js/screen-import-core.js).
   Needs the dock's tools: tools.pixels (the shot at 360px wide, ImageData-like)
   and tools.readRegions(boxes) → Promise<items per box>, boxes as fractions of
   the image. */
(function (root, factory) {
  var deps = typeof module === 'object' && module.exports
    ? [require('../ocr-text.js'), require('../screen-import-core.js')]
    : [root.OcrText, root.ScreenImport];
  var api = factory(deps[0], deps[1]);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (T, S) {
  'use strict';

  // The panel the tiles sit on, and how far a pixel must be from it to count
  // as tile. Sampled from 1440px phone captures; tolerant of JPEG noise.
  var PANEL = [221, 203, 183], OFF_PANEL = 45;

  // Icon signatures (ScreenImport.signature): 10 × 8 cells of mean RGB, one hex digit per
  // channel, row by row. Extracted from the fixtures by
  // `node .dsh/import-signatures.cjs backpack-items …`; the comment names the tile they came from.
  var REFS = [
    // other-a2, tile 14
    { id: 'masters-manuscript', label: "Master's Manuscript", sig: 'd82d82d82862a84a71b71d82d82d82d82d82d8245757a986da2b92a72c72e83e83a7346b47c57d68caa6db3cb5e93e9356746b997a9679b69fbb6ca3e9497546b789986cb3dd469e6ae983b7355646b78aba4cb579c59d7bda73752a8377657c57d68c58f58d58bc84651764971a82986779a969aa555ea5' },
    // other-a2, tile 22
    { id: 'advanced-taming-mark', label: 'Advanced Taming Mark', sig: 'd82d72864987765853a62d82d82d82d82a63a86a86a86986876853d82d82d83975a86b84b84a73a84865b72e83a63876b96db7c94da5da5974863e93963655974db9b84db8da4db8974c83a73655975db7a83eb8c93db8976a74c84545765a84a83db6b94a85876964ea5544655865754753754765544753' },
    // other-a2, tile 23
    { id: 'common-taming-mark', label: 'Common Taming Mark', sig: '37b37b37b37b37b37a36836837b37b38c38c38c37946766667777737b38c38c38c36966767777799a99936838c39c37a667777889aaa99999966738b39d468668999bcc9aaabbaab88847938b56777899adde99abbcabc99a468479677999889acd89a9ac78a78956838b45677778856757868a678788467' },
    // other-a2, tile 29
    { id: 'mithril', label: 'Mithril', sig: 'd82d82d82d82d82986cddabb877d82d82d82d82b72963deeacc9ac9abc72e83e83b74bbc9acbcdabbabc998d83e93e93b97aab9ab8ab9bcacbaa9c83e94e93ba9bccbddaccbddacbabac83e94975aab89948a9bb8bd7bd477e94ea48774897896ac9bc9cd8abb84ea4ea567769a58a79aacdacd975ea5fa5' },
    // other-a2, tile 30
    { id: 'forgehammer', label: 'Forgehammer', sig: 'd82d82986ddcedda97b72d82d82d82d82b72ba9a96ccceedcbaa74d82d82e83a86aa8db4cb5ddcedcdcb864d83c83bbab97eb4ec5ca5bb9ccb665653c83987dcbba7c93a97edc998433443e94b83876ddcccbeedccb655443543ea4ea4a63864cbaddc998443443b73fa5d94a74c85532776555443653ea5' },
    // other-a3, tile 1
    { id: 'mythic-hero-shard', label: 'Mythic hero shard', sig: 'd82d82d82b62b62b61d82d82d82d82d82d82b72ea7fc9ea5b73b62b72d82e83e83b62ea6eb6eb6eb5ea5d84d82e93e93962d94eb5eb5eb5ea5c84d83e93a62b72ea4ea4ea5ea4ea4b62c83b73e93ea4ea4ea4ea4ea4ea4e94c84b62d83ea3ea3ea3ea3e93d83c95d94c84842d82e93e93e93d84852b84fa5' },
    // other-a3, tile 2
    { id: 'epic-hero-shard', label: 'Epic hero shard', sig: '76d76d76c65a66a65a76c76d76d76d87d87d66bcbfdcfb9e87c76b66b87d87d87d76bcafcafcafc9fb9f98d76b87d87d549a8eb9fb9fb9fb8f98d77c87c65a86cb8fb8fb8fb8fa8f75c77c76ba7fa7fa7fa7fa7fa7fa7f97e87c65b96e96e96e96e96e96e86e98d87c77b43886e86e86e86e87e54876b98e' },
    // other-a3, tile 3
    { id: 'rare-hero-shard', label: 'Rare hero shard', sig: '37b37b37b37a37a26937b37b37b37b38c38c37a9debef8cf59c48a37a38c38c38c48b8cf9df8cf8cf7cf6be37b39c39c2686be7cf7cf7cf7cf6bd38b38c37a48b7cf7cf7cf7cf7cf48c38b38b6bf6cf6cf6cf6cf6cf6cf6bf49b37a5ae6bf6bf6bf6bf5bf5ae6bd49b38b2575ae5bf5bf5bf6be36837a4ad' },
    // resources-a, tile 0
    { id: 'truegold', label: 'Truegold', sig: 'd82d82d72a62852751751851961d82d82a62862a74b85ca6dc8963852c72b73b85b83b83b84c94c95ca5ca6a84a73864975b96edbfecfdafc8ca6a74a74975864974dc9fd9ec8eb7c96a74963b96864864cb8ec9ec8da6b95b73a73864b97753b96ec8eb7ca6b96b84b84653ca7b96a85da7da6b95a84b84' },
    // other-d1, tile 8
    { id: 'hero-widget-chest-gen1', label: 'Gen 1 widget chest', sig: 'c71973b94568679ee789946cdc5c82852457ee78bc48fcb8dc937faa9b9455627dab8bc89bcba9fe8bcbccbcb646938f689ed6ec6ed6ca7a98a99a7446938d755657657548337555987b85766567754653975642853a85997877b74854c95a74874743862b96998a86d95976976a86766b88bbc8ce78b98a' },
    // other-d1, tile 7
    { id: 'hero-widget-chest-gen2', label: 'Gen 2 widget chest', sig: 'a94763aa566756aee79aa36cdc5b83b92543a8368848fbb9dd847f9a9b94a71752c818859bcbb9fe8ccbddbcc735828e578ed6dc6ec6ba798798897456938d755a85658657779775bbbd84765567974973875776973cb8cb9c83b74754ba5973863877863a97999b96a95766556a96b85b88bcc8ce68b88a' },
    // other-d1, tile 6
    { id: 'hero-widget-chest-gen3', label: 'Gen 3 widget chest', sig: '994763aa556756aed79aa36ccb5c93b92433b8267848fba9dd837f999ba4a71752b719969bcba9fe8ccbdcbdc735828e579ed6dc6ed6b96a86988a7446838d755643853656961c91b91d83666557853961851862c91eb2a72b82754766874a72a84b84b72c82988b96963975976b94a74966bcc9ce68b88a' }
  ];
  var MATCH = 0.085, MARGIN = 0.02;

  function off(d, i) { return Math.abs(d[i] - PANEL[0]) + Math.abs(d[i + 1] - PANEL[1]) + Math.abs(d[i + 2] - PANEL[2]) > OFF_PANEL; }

  // Whole tiles only: a row cut by the scroll edge is shorter than a tile and
  // is left for the overlapping screenshot to supply.
  function findTiles(px) {
    var w = px.width, h = px.height, d = px.data, x0 = Math.round(w * 0.06), x1 = Math.round(w * 0.94);
    var rows = S.runs(h, x1 - x0, 0.12, function (y, j) { return off(d, (y * w + x0 + j) * 4); }, w * 0.17, w * 0.23);
    var tiles = [];
    rows.forEach(function (r) {
      var cols = S.runs(w, r[1] - r[0], 0.3, function (x, j) { return off(d, ((r[0] + j) * w + x) * 4); }, w * 0.15, w * 0.25);
      cols.forEach(function (c) { tiles.push({ x: c[0], y: r[0], w: c[1] - c[0], h: r[1] - r[0] }); });
    });
    return tiles;
  }

  // The icon's middle, clear of the count (bottom right) and of the
  // denomination or timer labels some tiles print across the top.
  function signature(px, tile) {
    return S.signature(px, { x: tile.x + tile.w * 0.14, y: tile.y + tile.h * 0.16, w: tile.w * 0.72, h: tile.h * 0.5 });
  }
  function identify(sig) { return S.identify(sig, REFS, MATCH, MARGIN); }
  var fraction = S.fraction;

  var adapter = {
    id: 'backpack-items',
    sourceType: 'backpack',
    layout: 'grid',
    detect: function (p) {
      var text = p.rows.map(function (r) { return T.fold(r.text); }).join(' ');
      if (text.indexOf('overview') !== -1) return 0;
      return text.indexOf('backpack') !== -1 && text.indexOf('speedups') !== -1 && text.indexOf('other') !== -1 ? 0.8 : 0;
    },
    read: function (p, tools) {
      if (!tools || !tools.pixels || !tools.readRegions) return [];
      var px = tools.pixels, seen = {}, found = [];
      findTiles(px).forEach(function (tile) {
        var match = identify(signature(px, tile));
        if (!match || seen[match.id]) return;
        seen[match.id] = true;
        found.push({ tile: tile, match: match });
      });
      if (!found.length) return [];
      var boxes = found.map(function (f) {
        var t = f.tile;
        var box = fraction({ x: t.x + t.w * 0.28, y: t.y + t.h * 0.64, w: t.w * 0.74, h: t.h * 0.34 }, px);
        box.ink = 'white';
        return box;
      });
      return tools.readRegions(boxes).then(function (reads) {
        return found.map(function (f, i) {
          var words = (reads[i] || []).map(function (it) { return String(it.text || ''); });
          var text = words.join('').replace(/\s+/g, '');
          var value = T.parseCount(text);
          if (value === null) { var digits = text.match(/\d[\d,.]*\d|\d/); value = digits ? T.parseCount(digits[0]) : null; }
          return {
            target: 'inventory', id: f.match.id, label: f.match.label, value: value,
            confidence: value === null ? 0 : Math.max(0, 0.95 - f.match.dist * 2),
            crop: fraction(f.tile, px), note: ''
          };
        });
      });
    },
    findTiles: findTiles, signature: signature, identify: identify, refs: function () { return REFS.slice(); }
  };

  S.register(adapter);
  return adapter;
});
