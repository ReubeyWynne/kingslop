/* ocr-client.js — the one page-side client for js/ocr-worker.js.
   Every screenshot reader on the site talks to the OCR engine through this:
   one lazily created worker per client, requests matched by id, a hang-breaker,
   and the GPU → wasm retry. Pages never build the worker themselves.

   var ocr = OcrClient.create({ backend: 'wasm' });   // or 'auto' (default)
   ocr.warm()                       → Promise
   ocr.read(blob, { useful })       → Promise<{ items, metrics, preview }>
   ocr.close()                      → drops the worker and fails reads in flight

   `preview` is an ImageBitmap of what the detector saw (or null); the caller owns
   it and must close() it. A failed read rejects with an Error whose `preview`
   carries the same, so the page can still show which shot it was. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OcrClient = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  // Long enough that a slow phone on a cold model download is never cut off —
  // this is a hang-breaker, not a deadline.
  var TIMEOUT_MS = 120000;

  // Resolved once, while this script is the one executing: the worker sits
  // beside it and inherits its cache-busting query.
  var here = (function () {
    var doc = root.document;
    var script = doc && doc.currentScript;
    return script && script.src ? script.src : null;
  })();

  function workerUrl(backend, base) {
    var url = new URL('ocr-worker.js', base || here || (root.location && root.location.href));
    if (base || here) url.search = new URL(base || here).search;
    if (backend === 'wasm') url.searchParams.set('backend', 'wasm');
    return url.href;
  }

  function closeBitmap(bitmap) {
    if (bitmap && typeof bitmap.close === 'function') bitmap.close();
  }

  function create(options) {
    options = options || {};
    var backend = options.backend === 'wasm' ? 'wasm' : 'auto';
    var timeout = options.timeout || TIMEOUT_MS;
    var Worker = options.Worker || root.Worker;
    var worker = null, seq = 0, pending = {};

    // Drop the worker and fail everything in flight. A worker that a phone kills
    // for memory never replies and never fires an error, so this is the only way
    // the page learns it is gone.
    function kill(err) {
      var waiting = pending;
      pending = {};
      Object.keys(waiting).forEach(function (id) { waiting[id].reject(err); });
      if (worker) {
        try { worker.terminate(); } catch (e) { /* already gone */ }
        worker = null;
      }
    }

    function start() {
      if (worker) return worker;
      worker = new Worker(workerUrl(backend, options.base), { type: 'module' });
      worker.onmessage = function (e) {
        var m = e.data || {}, p = pending[m.id];
        if (!p) { closeBitmap(m.preview); return; }
        delete pending[m.id];
        if (m.ok) {
          p.resolve(m);
        } else {
          var err = new Error(m.error || 'ocr failed');
          err.preview = m.preview || null;
          p.reject(err);
        }
      };
      worker.onerror = function (e) { kill(new Error((e && e.message) || 'ocr worker error')); };
      worker.onmessageerror = function () { kill(new Error('ocr worker message error')); };
      return worker;
    }

    function ask(type, blob) {
      return new Promise(function (resolve, reject) {
        var id = ++seq;
        var timer = setTimeout(function () {
          delete pending[id];
          var err = new Error('ocr worker timed out');
          kill(err);
          reject(err);
        }, timeout);
        pending[id] = {
          resolve: function (v) { clearTimeout(timer); resolve(v); },
          reject: function (e) { clearTimeout(timer); reject(e); }
        };
        try {
          start().postMessage({ id: id, type: type, blob: blob });
        } catch (e) {
          clearTimeout(timer);
          delete pending[id];
          kill(e);
          reject(e);
        }
      });
    }

    function once(blob) {
      return ask('predict', blob).then(function (m) {
        return { items: m.items || [], metrics: m.metrics || null, preview: m.preview || null };
      });
    }

    // A phone's GPU can run the engine without throwing and still hand back
    // nothing usable — only the caller can tell, so it passes `useful`. When the
    // first read is useless, drop the GPU for the session and read once more on
    // wasm; the better of the two reads is returned, the other's preview closed.
    function read(blob, opts) {
      var useful = opts && opts.useful;
      return once(blob).then(function (first) {
        if (!useful || backend === 'wasm' || useful(first)) return first;
        return ask('useWasm')
          .then(function () { backend = 'wasm'; return once(blob); })
          .then(function (second) {
            if (useful(second)) { closeBitmap(first.preview); return second; }
            closeBitmap(second.preview);
            return first;
          }, function () { return first; });
      });
    }

    return {
      warm: function () { return ask('warm').then(function () { return true; }); },
      read: read,
      close: function () { kill(new Error('Reader closed')); },
      get backend() { return backend; }
    };
  }

  return { create: create, workerUrl: workerUrl, TIMEOUT_MS: TIMEOUT_MS };
});
