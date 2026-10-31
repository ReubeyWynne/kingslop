/* The island plan: integer rows and columns on a square grid, pieces on one layer and
   surfaces (paths, water) on the layer beneath. Pure: no DOM, no storage, no drawing.
   Every edit goes through edit(), which keeps one undo step per gesture. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.IslandModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function create(catalogue, size) {
    var N = size || 60;
    var bySlug = {};
    catalogue.forEach(function (p) { bySlug[p.slug] = p; });
    var pieces = new Map();   // id -> { id, slug, r, c, w, h }
    var surfaces = new Map(); // r * N + c -> slug
    var occ = new Int32Array(N * N).fill(-1);
    var nextId = 1;
    var undo = [], redo = [];
    var open = null;          // the snapshot taken when the current gesture began

    function def(slug) { return bySlug[slug]; }
    function isSurface(slug) { return !!bySlug[slug] && bySlug[slug].kind === 'surface'; }
    function inside(r, c) { return r >= 0 && c >= 0 && r < N && c < N; }
    function mark(p, id) { for (var y = p.r; y < p.r + p.h; y++) for (var x = p.c; x < p.c + p.w; x++) occ[y * N + x] = id; }

    function fits(w, h, r, c, ignore) {
      for (var y = r; y < r + h; y++) for (var x = c; x < c + w; x++) {
        if (!inside(y, x)) return false;
        var o = occ[y * N + x];
        if (o !== -1 && o !== ignore) return false;
      }
      return true;
    }
    // Where a w×h footprint covering (r, c) fits, trying the centred spot first; null if nowhere.
    function anchorFor(w, h, r, c, ignore) {
      var r0 = r - Math.floor(h / 2), c0 = c - Math.floor(w / 2), best = null, bestD = Infinity;
      for (var dr = 0; dr < h; dr++) for (var dc = 0; dc < w; dc++) {
        var ar = r - dr, ac = c - dc;
        if (!fits(w, h, ar, ac, ignore)) continue;
        var d = Math.abs(ar - r0) + Math.abs(ac - c0);
        if (d < bestD) { bestD = d; best = { r: ar, c: ac }; }
      }
      return best;
    }

    function snapshot() {
      return { pieces: Array.from(pieces.values(), function (p) { return [p.r * N + p.c, p.slug, p.w, p.h]; }), surfaces: Array.from(surfaces) };
    }
    function restore(s) {
      pieces = new Map(); surfaces = new Map(s.surfaces); occ.fill(-1); nextId = 1;
      s.pieces.forEach(function (e) {
        var p = { id: nextId++, slug: e[1], r: Math.floor(e[0] / N), c: e[0] % N, w: e[2], h: e[3] };
        pieces.set(p.id, p); mark(p, p.id);
      });
    }

    // One gesture, one undo step. Nested begin() calls join the open step.
    function begin() { if (!open) open = snapshot(); }
    function end() {
      if (!open) return false;
      var before = open, changed = JSON.stringify(before) !== JSON.stringify(snapshot());
      open = null;
      if (changed) { undo.push(before); if (undo.length > 200) undo.shift(); redo.length = 0; }
      return changed;
    }
    function cancel() { if (open) { restore(open); open = null; } }
    function edit(fn) { begin(); var out = fn(); end(); return out; }

    function addPiece(slug, r, c, w, h) {
      var d = def(slug);
      if (!d || isSurface(slug)) return null;
      w = w || d.w; h = h || d.h;
      if (!fits(w, h, r, c, -1)) return null;
      var p = { id: nextId++, slug: slug, r: r, c: c, w: w, h: h };
      pieces.set(p.id, p); mark(p, p.id);
      return p;
    }
    function removePiece(id) {
      var p = pieces.get(id);
      if (!p) return false;
      mark(p, -1); pieces.delete(id);
      return true;
    }
    function movePiece(id, r, c) {
      var p = pieces.get(id);
      if (!p || !fits(p.w, p.h, r, c, id)) return false;
      mark(p, -1); p.r = r; p.c = c; mark(p, id);
      return true;
    }
    // A turn swaps the footprint. Square pieces keep theirs; no direction is stored yet.
    function turnPiece(id) {
      var p = pieces.get(id);
      if (!p || p.w === p.h || !fits(p.h, p.w, p.r, p.c, id)) return false;
      mark(p, -1); var w = p.w; p.w = p.h; p.h = w; mark(p, id);
      return true;
    }
    // A one-cell brush: a surface goes under whatever is there, a piece only onto free ground.
    function paint(slug, r, c) {
      if (!inside(r, c)) return false;
      if (isSurface(slug)) {
        if (surfaces.get(r * N + c) === slug) return false;
        surfaces.set(r * N + c, slug); return true;
      }
      var d = def(slug);
      if (!d || d.w !== 1 || d.h !== 1) return false;
      return !!addPiece(slug, r, c);
    }
    // Clearing a cell takes the piece on it first, then the surface under it.
    function clear(r, c) {
      if (!inside(r, c)) return false;
      var hit = occ[r * N + c];
      if (hit !== -1) return removePiece(hit);
      return surfaces.delete(r * N + c);
    }

    function counts() {
      var n = {};
      pieces.forEach(function (p) { n[p.slug] = (n[p.slug] || 0) + 1; });
      surfaces.forEach(function (s) { n[s] = (n[s] || 0) + 1; });
      return n;
    }

    // Saved form: version, pieces as [cell, slug, turned], surfaces as [cell, slug].
    function toJSON() {
      return {
        v: 1,
        pieces: Array.from(pieces.values(), function (p) { return [p.r * N + p.c, p.slug, p.w === def(p.slug).w ? 0 : 1]; }),
        surfaces: Array.from(surfaces)
      };
    }
    // Loads a plan or an example. Unknown slugs and pieces that don't fit are dropped and counted.
    function load(data) {
      pieces = new Map(); surfaces = new Map(); occ.fill(-1); nextId = 1;
      undo.length = 0; redo.length = 0; open = null;
      var dropped = 0;
      (data && data.surfaces || []).forEach(function (e) {
        if (isSurface(e[1]) && e[0] >= 0 && e[0] < N * N) surfaces.set(e[0], e[1]); else dropped++;
      });
      (data && data.pieces || []).forEach(function (e) {
        var d = def(e[1]);
        if (!d || isSurface(e[1]) || !(e[0] >= 0 && e[0] < N * N)) { dropped++; return; }
        var turned = e[2] === 1;
        if (!addPiece(e[1], Math.floor(e[0] / N), e[0] % N, turned ? d.h : d.w, turned ? d.w : d.h)) dropped++;
      });
      return dropped;
    }

    return {
      size: N, def: def, isSurface: isSurface, inside: inside,
      get pieces() { return pieces; },
      get surfaces() { return surfaces; },
      pieceAt: function (r, c) { return inside(r, c) && occ[r * N + c] !== -1 ? pieces.get(occ[r * N + c]) : null; },
      fits: fits, anchorFor: anchorFor,
      begin: begin, end: end, cancel: cancel, edit: edit,
      place: function (slug, r, c, w, h) { return addPiece(slug, r, c, w, h); },
      remove: removePiece, move: movePiece, turn: turnPiece, paint: paint, clear: clear,
      undo: function () { if (!undo.length) return false; redo.push(snapshot()); restore(undo.pop()); return true; },
      redo: function () { if (!redo.length) return false; undo.push(snapshot()); restore(redo.pop()); return true; },
      get canUndo() { return undo.length > 0; },
      get canRedo() { return redo.length > 0; },
      counts: counts, toJSON: toJSON, load: load
    };
  }

  return { create: create };
});
