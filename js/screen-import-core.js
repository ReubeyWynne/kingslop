/* screen-import-core.js — the adapter registry behind the shared screenshot
   import (SCREENSHOT-IMPORT.md). Pure: no DOM, no worker. Adapters register
   here; the dock reads a file once, builds a `page` and asks `route` which
   adapter claims it.

   page     = { items, rows, width, height }   (coordinates in the read's preview)
   adapter  = { id, sourceType, detect(page) → 0..1, probe?(pixels) → 0..1,
                read(page, tools) → proposals | Promise<proposals> }
   proposal = { target: 'inventory' | 'pet' | 'gear' | 'sheet', id, value | null,
                confidence 0..1, crop: { x, y, w, h } | Blob, label, note,
                y?, max?, min?, step?, side?, group?, cols?, named? }
   Proposals sharing a group were read from one row: review shows its
   cut-out once, with the values side by side under it, each cols sixths
   wide in the 'table' layout. named says the cut-out already names the
   value, so its label is left to screen readers.
   A 'gear' proposal also carries piece ('inf-helm'), field ('level' or
   'mastery') and quality; a red piece's level is shown as its +N. A 'sheet'
   proposal names the page sheet it fills (sheet: 'battle-report') and the
   field's id; it never reaches the player save. */
(function (root, factory) {
  var api = factory(root.OcrText || (typeof require === 'function' ? require('./ocr-text.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScreenImport = api;
})(typeof window !== 'undefined' ? window : globalThis, function (T) {
  'use strict';

  var adapters = [];

  // Below this, a value is shown as needing a look in review.
  var DOUBT = 0.75;

  function register(adapter) {
    if (!adapter || !adapter.id || typeof adapter.detect !== 'function' || typeof adapter.read !== 'function') throw new Error('Invalid screen adapter');
    adapters = adapters.filter(function (a) { return a.id !== adapter.id; });
    adapters.push(adapter);
    return adapter;
  }

  function page(read) {
    var boxes = T.boxes(read.items);
    return { items: read.items || [], boxes: boxes, rows: T.rows(boxes), width: read.width || 0, height: read.height || 0 };
  }

  // The adapter that claims this page most strongly, or null when none is sure.
  function route(p) {
    var best = null, score = 0.5;
    adapters.forEach(function (a) {
      var s = 0;
      try { s = Number(a.detect(p)) || 0; } catch (e) { s = 0; }
      if (s > score) { best = a; score = s; }
    });
    return best ? { adapter: best, score: score } : null;
  }

  // Some screens are known by their pixels before any reading: an adapter
  // with probe(pixels) → 0..1 claims a shot outright, and the dock skips the
  // whole-screen read (pixels: the shot at 360px wide, ImageData-like). A probe
  // that needs art first may answer with a promise; then so does this.
  function probe(pixels) {
    var scores = adapters.map(function (a) {
      if (typeof a.probe !== 'function') return 0;
      try { return a.probe(pixels); } catch (e) { return 0; }
    });
    function best(list) {
      var top = null, score = 0.5;
      list.forEach(function (s, i) { s = Number(s) || 0; if (s > score) { top = adapters[i]; score = s; } });
      return top ? { adapter: top, score: score } : null;
    }
    if (!scores.some(function (s) { return s && typeof s.then === 'function'; })) return best(scores);
    return Promise.all(scores.map(function (s) { return Promise.resolve(s).catch(function () { return 0; }); })).then(best);
  }

  // The bounds of a row's words, padded a little, as the cut-out for review.
  function rowCrop(rows, width) {
    var items = [].concat.apply([], rows.map(function (r) { return r.items; }));
    var y0 = Math.min.apply(null, items.map(function (b) { return b.y; }));
    var y1 = Math.max.apply(null, items.map(function (b) { return b.y + b.h; }));
    var pad = Math.round((y1 - y0) * 0.3);
    var top = Math.max(0, y0 - pad);
    return { x: 0, y: top, w: width, h: y1 + pad - top };
  }

  // Icons and portraits carry no text, so screens that show them are told
  // apart by colour: `area` (pixels of an ImageData-like `px`) is sampled as
  // a GRID_W × GRID_H grid of mean RGB, one hex digit per channel, row by row.
  var GRID_W = 10, GRID_H = 8;
  function signature(px, area) {
    var w = px.width, d = px.data, out = [];
    for (var gy = 0; gy < GRID_H; gy++) for (var gx = 0; gx < GRID_W; gx++) {
      var sx = Math.floor(area.x + area.w * gx / GRID_W), ex = Math.max(sx + 1, Math.floor(area.x + area.w * (gx + 1) / GRID_W));
      var sy = Math.floor(area.y + area.h * gy / GRID_H), ey = Math.max(sy + 1, Math.floor(area.y + area.h * (gy + 1) / GRID_H));
      var sum = [0, 0, 0], n = 0;
      for (var y = sy; y < ey; y++) for (var x = sx; x < ex; x++) { var i = (y * w + x) * 4; sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; n++; }
      out.push(Math.round(sum[0] / n / 17), Math.round(sum[1] / n / 17), Math.round(sum[2] / n / 17));
    }
    return out.map(function (v) { return v.toString(16); }).join('');
  }
  function distance(a, b) {
    var total = 0;
    for (var i = 0; i < a.length; i++) total += Math.abs(parseInt(a[i], 16) - parseInt(b[i], 16));
    return total / a.length / 15;
  }
  // The closest reference ({ id, label, sig }), if it is within `match` and
  // clearly closer (by `margin`) than the next-closest id.
  function identify(sig, refs, match, margin) {
    var best = {};
    refs.forEach(function (ref) {
      var dist = distance(sig, ref.sig);
      if (!best[ref.id] || dist < best[ref.id].dist) best[ref.id] = { id: ref.id, label: ref.label, dist: dist };
    });
    var ranked = Object.keys(best).map(function (id) { return best[id]; }).sort(function (a, b) { return a.dist - b.dist; });
    if (!ranked.length || ranked[0].dist > match) return null;
    if (ranked[1] && ranked[1].dist - ranked[0].dist < margin) return null;
    return ranked[0];
  }

  // Runs along one axis where more than `share` of the cross-section hits;
  // only runs between `min` and `max` long are kept.
  function runs(count, length, share, hit, min, max) {
    var out = [], start = -1;
    for (var i = 0; i <= count; i++) {
      var n = 0;
      if (i < count) for (var j = 0; j < length; j++) if (hit(i, j)) n++;
      var on = i < count && n / length > share;
      if (on && start < 0) start = i;
      if (!on && start >= 0) { if (i - start >= min && i - start <= max) out.push([start, i]); start = -1; }
    }
    return out;
  }

  function fraction(box, px) { return { x: box.x / px.width, y: box.y / px.height, w: box.w / px.width, h: box.h / px.height, unit: 'fraction' }; }

  return {
    register: register, route: route, probe: probe, page: page, rowCrop: rowCrop, DOUBT: DOUBT,
    signature: signature, identify: identify, runs: runs, fraction: fraction,
    adapters: function () { return adapters.slice(); },
    get: function (id) { return adapters.filter(function (a) { return a.id === id; })[0] || null; }
  };
});
