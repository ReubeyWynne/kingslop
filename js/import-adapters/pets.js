/* Pet List — the popover from the Pets screen's "Pet List" button: one portrait
   per tamed pet with "Lv. N" across its top. Portraits carry no names, so each
   pet is told by its portrait's colour signature against references taken
   from the owner's screenshot (.dsh/import-fixtures/pet-list.jpg, extracted by
   `node .dsh/import-signatures.cjs pet-list pet-list`). The level is read
   from an enlarged crop of the portrait's top strip.

   Needs the dock's tools: tools.pixels (the shot at 360px wide) and
   tools.readRegions(boxes). */
(function (root, factory) {
  var deps = typeof module === 'object' && module.exports
    ? [require('../ocr-text.js'), require('../screen-import-core.js')]
    : [root.OcrText, root.ScreenImport];
  var api = factory(deps[0], deps[1]);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (T, S) {
  'use strict';

  var REFS = [
    // pet-list, tile 0
    { id: 'lion', label: 'Lion', sig: '734743c86fc8ea7853964ea7c85a65412422764fdab85532765c85b75a55523964866755cb9ca8da7e96a64633635cb9643b97febfecc96953954a54646b97a86a86ca7b96964732a54b65748743543543643975632944a5494485a633864a86b9675473394484463385b533622522411422633633532954' },
    // pet-list, tile 1
    { id: 'grizzly-bear', label: 'Grizzly Bear', sig: '855987a87db8854a98a87d84f95d95963754864864c98c97b64e95fa6e95a74421421532a97fcae95fa6fa6e95b86865311db9fecfecea7e95e85d84a75b98ba8dbaecaecada8c74c74a63743976a87b98b98b98b86a53942831742543654654755865854731621842954743654754865854521520732c85' },
    // pet-list, tile 2
    { id: 'moose', label: 'Moose', sig: '2ad38a655864c97754a99a86a752792ad588975da7da7b86b86b86a7565549b678b86b86b86b86b86975754755666a75a75a75a75754854754643866367965964964643321743643633ba928b643854754421532533422987dba2ad433643533532643543a87cb9cba2ad356422432533432a87ba9ba9cba' },
    // pet-list, tile 3
    { id: 'cheetah', label: 'Cheetah', sig: '478344da3fb4863467988ba7da3b83799686fe5fe5a9549abbadcada3eb4876983983983ed7febed8da4d93da3865321210775eedfecdc8da4da3c93865a97875ba9ccaedbca8c94c82a61677a98986a98ba8ba8ba8a7496185129b876865876986dcbba88527429512ad898a98a98ba8cb9875875976963' },
    // pet-list, tile 4
    { id: 'bison', label: 'Bison', sig: '324334224223224324335223224323223223223111112223224223112224112112112211211111212223101213232212644a76a77855312212212111211854d98ea8743b76745423323212111754744d97522a76533222212212344533b86c87ea8c863232122112117c8333743643854643212111111111' },
    // pet-list, tile 5
    { id: 'lynx', label: 'Lynx', sig: '6a7b95fd9ec8b74964d96eb7d96632585642fc7b74311543543963ea6a85685753fdab74753b98baaa75c85ea7897754766edba86865b85a74a53ea7887876ba9edc987a86b85a63963b84675b98866b98865755865965b74b74685865876987ba8b98a87876b969766a7876a98b98a97876a87dbab98edb' },
    // pet-list, tile 6
    { id: 'gray-wolf', label: 'Gray Wolf', sig: 'ccc556556666445444556667445bbbaaa33455655633356677755655699a778556567666456689aaa445556666333222223dddeeecccaaabbbccc666333444aaaeeefeeffffeeeeeeeeccccbbcbbdddeedeeeccceddeeeedd777999666a99aaa888aaadddcccccc767988aaa999999aaa988888a99aaa334' }
  ];
  var MATCH = 0.085, MARGIN = 0.02, MAX_LEVEL = 100;

  function white(d, i) { return d[i] > 238 && d[i + 1] > 234 && d[i + 2] > 226; }

  // The popover is the tallest near-white block on the screen; its portraits
  // are the square non-white runs inside it.
  function findTiles(px) {
    var w = px.width, h = px.height, d = px.data;
    var bands = S.runs(h, w, 0.4, function (y, x) { return white(d, (y * w + x) * 4); }, 2, h);
    var blocks = [];
    bands.forEach(function (b) {
      var last = blocks[blocks.length - 1];
      if (last && b[0] - last[1] < w * 0.2) last[1] = b[1]; else blocks.push(b.slice());
    });
    var block = blocks.filter(function (b) { return b[1] - b[0] > w * 0.25; }).sort(function (a, b) { return (b[1] - b[0]) - (a[1] - a[0]); })[0];
    if (!block) return [];
    var y0 = block[0], y1 = block[1];
    var span = S.runs(w, y1 - y0, 0.2, function (x, j) { return white(d, ((y0 + j) * w + x) * 4); }, w * 0.3, w);
    if (!span.length) return [];
    var x0 = span[0][0], x1 = span[span.length - 1][1], tiles = [];
    S.runs(y1 - y0, x1 - x0, 0.3, function (i, j) { return !white(d, ((y0 + i) * w + x0 + j) * 4); }, w * 0.1, w * 0.2).forEach(function (r) {
      S.runs(x1 - x0, r[1] - r[0], 0.5, function (i, j) { return !white(d, ((y0 + r[0] + j) * w + x0 + i) * 4); }, w * 0.1, w * 0.2).forEach(function (c) {
        tiles.push({ x: x0 + c[0], y: y0 + r[0], w: c[1] - c[0], h: r[1] - r[0] });
      });
    });
    return tiles;
  }

  // The face, below the level label.
  function signature(px, tile) { return S.signature(px, { x: tile.x + tile.w * 0.1, y: tile.y + tile.h * 0.32, w: tile.w * 0.8, h: tile.h * 0.6 }); }
  function identify(sig) { return S.identify(sig, REFS, MATCH, MARGIN); }

  // "Lv. 70", "Lv.26↑", "LV 5O": the last run of digits (O and l read as
  // digits) that holds at least one real digit.
  function level(words) {
    var runs = (T.normalise(words.join(' ')).match(/[0-9OoIl|]+/g) || []).filter(function (r) { return /\d/.test(r); });
    var n = runs.length ? T.parseCount(runs[runs.length - 1]) : null;
    return n !== null && n >= 1 && n <= MAX_LEVEL ? n : null;
  }

  var adapter = {
    id: 'pet-list',
    sourceType: 'pets',
    layout: 'grid',
    detect: function (p) {
      var text = p.rows.map(function (r) { return T.fold(r.text); }).join(' ');
      return text.indexOf(T.fold('pet list')) !== -1 && text.indexOf(T.fold('adventure')) !== -1 ? 0.8 : 0;
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
      var boxes = found.map(function (f) { var t = f.tile; return S.fraction({ x: t.x + t.w * 0.3, y: t.y, w: t.w * 0.7, h: t.h * 0.3 }, px); });
      return tools.readRegions(boxes).then(function (reads) {
        return found.map(function (f, i) {
          var value = level((reads[i] || []).map(function (it) { return String(it.text || ''); }));
          return {
            target: 'pet', id: f.match.id, label: f.match.label, value: value, unit: 'level',
            confidence: value === null ? 0 : Math.max(0, 0.95 - f.match.dist * 2),
            crop: S.fraction(f.tile, px), note: ''
          };
        });
      });
    },
    findTiles: findTiles, signature: signature, identify: identify, level: level, refs: function () { return REFS.slice(); }
  };

  S.register(adapter);
  return adapter;
});
