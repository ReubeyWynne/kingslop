/* screen-import-core.js — the adapter registry behind the shared screenshot
   import (SCREENSHOT-IMPORT.md). Pure: no DOM, no worker. Adapters register
   here; the dock reads a file once, builds a `page` and asks `route` which
   adapter claims it.

   page     = { items, rows, width, height }   (coordinates in the read's preview)
   adapter  = { id, sourceType, detect(page) → 0..1, read(page) → proposals }
   proposal = { target: 'inventory', id, value | null, confidence 0..1,
                crop: { x, y, w, h }, label, note } */
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

  // The bounds of a row's words, padded a little, as the cut-out for review.
  function rowCrop(rows, width) {
    var items = [].concat.apply([], rows.map(function (r) { return r.items; }));
    var y0 = Math.min.apply(null, items.map(function (b) { return b.y; }));
    var y1 = Math.max.apply(null, items.map(function (b) { return b.y + b.h; }));
    var pad = Math.round((y1 - y0) * 0.3);
    var top = Math.max(0, y0 - pad);
    return { x: 0, y: top, w: width, h: y1 + pad - top };
  }

  return {
    register: register, route: route, page: page, rowCrop: rowCrop, DOUBT: DOUBT,
    adapters: function () { return adapters.slice(); },
    get: function (id) { return adapters.filter(function (a) { return a.id === id; })[0] || null; }
  };
});
