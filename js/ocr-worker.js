/* ocr-worker.js — the Battle Simulator's OCR engine, off the main thread.
   PaddleOCR.js/ONNX Runtime/OpenCV are megabytes of JavaScript plus a wasm
   session compile; running them on the page thread froze the tab for seconds
   on a phone (and the whole image decode + inference with it). This worker owns
   all of it: js/sim.js only posts the picked File and waits for recognised
   words, so the page stays interactive and the model warm-up never blocks.

   The engine module comes from jsdelivr (ESM, no bundler needed); the ~6 MB
   model pair is self-hosted at /models/ because the upstream Baidu bucket sends
   broken CORS headers. Model URLs are resolved from this file's own location so
   the worker works at any page depth, and are absolute because a worker's
   relative fetches resolve against the worker script, not the page.

   Protocol — one request, one reply, matched by id:
     in : { id, type: 'warm' }                  → { id, ok: true }
     in : { id, type: 'predict', blob: File }   → { id, ok: true, items, metrics }
     any failure                                → { id, ok: false, error }
   'predict' implies 'warm'; both share one engine promise. While the models
   download, unsolicited { progress: { loaded, total } } messages (no id) say
   how far it has got; a device that has them cached sends none. */
'use strict';

// ── Worker environment stubs ──────────────────────────
// PaddleOCR.js's bitmapToSourceMat() builds its Mat through
// document.createElement("canvas"), and OpenCV's imread() dereferences
// HTMLImageElement in an instanceof check before the OffscreenCanvas branch it
// should take. Neither global exists in a worker — the stubs are enough, and
// the OffscreenCanvas path then runs unchanged.
globalThis.document = {
  createElement: function () { return new OffscreenCanvas(1, 1); }
};
globalThis.HTMLImageElement = function HTMLImageElement() {};
globalThis.HTMLCanvasElement = function HTMLCanvasElement() {};

var PADDLE_ESM = 'https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm';

// PP-OCRv6 tiny det rescales its input so the long side is 960 before it runs —
// anything larger is thrown away inside OpenCV. So downscaling here first is
// free in accuracy terms and enormous in cost:
//   a 1440x3216 phone shot spent ~520ms of the detection phase on an OpenCV
//   resize of 4.6MP, and built an 18.5MB Mat on the way — enough to exhaust the
//   wasm heap on a phone, where the read simply failed. Downscaled, the same
//   shot infers in ~190ms off a 1.6MB Mat.
// DET_SIDE is pinned into the detector's own config below so the pre-resize and
// the model's resize cannot drift apart.
var DET_SIDE = 800;

function modelsUrl(file) {
  return new URL('../models/' + file, self.location.href).href;
}

// The models are fetched here rather than by the engine, into Cache Storage, so
// the page can show the download's progress and only ever warns about it on a
// device that doesn't have them yet. Bump the cache name when a model changes.
// Anything missing (no fetch, no caches, a failed request) leaves the engine to
// fetch the plain URLs itself, as it always did.
var MODEL_CACHE = 'ocr-models-v6-tiny';
var MODEL_FILES = ['det-v6-tiny.tar', 'rec-v6-tiny.tar'];
var modelsPromise = null;

function readWithProgress(response, tick) {
  if (!response.body || !response.body.getReader) return response.blob();
  var reader = response.body.getReader(), chunks = [];
  function pump() {
    return reader.read().then(function (step) {
      if (step.done) return new Blob(chunks);
      chunks.push(step.value);
      tick(step.value.byteLength);
      return pump();
    });
  }
  return pump();
}

function downloadModels(cache, urls) {
  return Promise.all(urls.map(function (url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('model download failed: HTTP ' + r.status);
      return r;
    });
  })).then(function (responses) {
    // A compressed transfer's length isn't the bytes the body yields; the bar
    // then runs without a total.
    var total = responses.reduce(function (sum, r) {
      var n = Number(r.headers.get('content-length'));
      return sum === null || !n || r.headers.get('content-encoding') ? null : sum + n;
    }, 0);
    var loaded = 0;
    var tick = function (n) {
      loaded += n;
      self.postMessage({ progress: { loaded: loaded, total: total && Math.max(total, loaded) } });
    };
    self.postMessage({ progress: { loaded: 0, total: total } });
    return Promise.all(responses.map(function (r, i) {
      return readWithProgress(r, tick).then(function (blob) {
        return cache.put(urls[i], new Response(blob)).catch(function () {}).then(function () { return blob; });
      });
    })).then(function (blobs) {
      // The last word always has a total, so the page knows the download is over.
      self.postMessage({ progress: { loaded: loaded, total: loaded } });
      return blobs;
    });
  });
}

function loadModels() {
  var urls = MODEL_FILES.map(modelsUrl);
  if (typeof fetch !== 'function' || !self.caches) return Promise.resolve(urls);
  if (modelsPromise) return modelsPromise;
  var p = caches.open(MODEL_CACHE).then(function (cache) {
    return Promise.all(urls.map(function (url) { return cache.match(url); })).then(function (hits) {
      if (hits.every(Boolean)) return Promise.all(hits.map(function (r) { return r.blob(); }));
      return downloadModels(cache, urls);
    });
  }).then(function (blobs) {
    return blobs.map(function (blob) { return URL.createObjectURL(blob); });
  });
  modelsPromise = p;
  p.catch(function () { if (modelsPromise === p) modelsPromise = null; });
  return p.catch(function () { return urls; });
}

// Resample a decoded bitmap, degrading instead of failing: a browser that
// accepts the resize options gives the good filter; one that ignores them (or
// refuses the crop overload outright, as some mobile engines do) gets an
// OffscreenCanvas resample; one with neither gets null, and the detector does
// its own resize — slower, but never a failed read.
function shrink(bitmap, w, h) {
  return createImageBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, {
    resizeWidth: w,
    resizeHeight: h,
    resizeQuality: 'high'
  }).then(function (out) {
    if (out.width === w && out.height === h) return out;
    out.close();
    return viaCanvas(bitmap, w, h);
  }, function () {
    return viaCanvas(bitmap, w, h);
  }).catch(function () { return null; });
}

function viaCanvas(bitmap, w, h) {
  var canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  return canvas.transferToImageBitmap();
}

// One decode, then a native resample of the decoded bitmap — no full-size
// canvas, no getImageData, and none of it on the page thread. Images already
// within the detector's budget are passed through untouched.
function fitForDetector(blob) {
  return createImageBitmap(blob).then(function (full) {
    var side = Math.max(full.width, full.height);
    if (side <= DET_SIDE) return full;
    var scale = DET_SIDE / side;
    return shrink(full, Math.round(full.width * scale), Math.round(full.height * scale))
      .then(function (small) {
        if (!small) return full;
        full.close();
        return small;
      });
  });
}

// Compiling the det/rec pipelines — WebGPU shader compilation above all — is a
// one-off that would otherwise land on the user's first read, which is exactly
// the read that hitched hardest. A blank bitmap with a few bars pushes it
// through the whole pipeline here instead, while the page is idle.
function warmPipelines(ocr) {
  var canvas = new OffscreenCanvas(64, 64);
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#000';
  ctx.fillRect(4, 20, 56, 7);
  ctx.fillRect(4, 34, 40, 7);
  var bitmap = canvas.transferToImageBitmap();
  var done = function () { bitmap.close(); };
  return ocr.predict(bitmap).then(done, done);
}

var enginePromise = null;
var engineKind = new URL(self.location.href).searchParams.get('backend') === 'wasm' ? 'wasm' : 'auto';

// Import + session build happen once, inside this worker. `worker: false` is
// deliberate: this file *is* the worker, so the pipeline runs directly here
// rather than the library spawning a second one.
function createEngine(backend) {
  return Promise.all([import(PADDLE_ESM), loadModels()]).then(function (got) {
    var m = got[0], models = got[1];
    return m.PaddleOCR.create({
      worker: false,
      textDetectionModelName: 'PP-OCRv6_tiny_det',
      textRecognitionModelName: 'PP-OCRv6_tiny_rec',
      textDetectionModelAsset: { url: models[0] },
      textRecognitionModelAsset: { url: models[1] },
      textDetLimitSideLen: DET_SIDE,
      textDetLimitType: 'max',
      ortOptions: { backend: backend }
    });
  });
}

function loadEngine() {
  if (enginePromise) return enginePromise;
  var p = createEngine(engineKind);
  enginePromise = p;
  // A failed load must not poison later attempts (offline, quota, one bad
  // session build) — clear the cache so the next request retries.
  p.catch(function () { if (enginePromise === p) enginePromise = null; });
  return p;
}

// A phone's GPU is the least predictable part of this stack: ORT's WebGPU
// backend can build a session and then fail on the run, which a desktop's
// software rasteriser never does. When the engine fails, give up on the GPU for
// the rest of the session (freeing its memory first — that matters most on the
// device where it just failed) and come back on wasm. Coarser and several times
// slower, but it is the path that always works.
function fallBackToWasm() {
  var previous = enginePromise;
  enginePromise = null;
  engineKind = 'wasm';
  var freed = previous
    ? previous.then(function (ocr) { return ocr.dispose ? ocr.dispose() : null; }, function () { return null; })
    : Promise.resolve(null);
  return freed.then(loadEngine);
}

// The bitmap handed to the detector is the library's to dispose of, so the
// preview is a separate clone of it — cheap (one native copy of the downscaled
// bitmap) and safe to transfer to the page afterwards.
function runPredict(ocr, blob) {
  return fitForDetector(blob).then(function (bitmap) {
    return createImageBitmap(bitmap).then(function (preview) {
      return ocr.predict(bitmap).then(
        function (res) {
          var first = res && res[0];
          return {
            ok: true,
            preview: preview,
            items: (first && first.items) || [],
            metrics: (first && first.metrics) || null
          };
        },
        function (err) {
          // A shot we couldn't read still tells the user which one they gave us.
          return { ok: false, preview: preview, error: String((err && err.message) || err) };
        }
      );
    });
  });
}

self.onmessage = function (e) {
  var msg = e.data || {};
  var id = msg.id;

  // The page is waiting on this reply: every path must produce exactly one, or
  // the read hangs and the button stays dead. Transfers the preview when there
  // is one, and still answers if it can't.
  var reply = function (out) {
    out.id = id;
    try {
      self.postMessage(out, out.preview ? [out.preview] : []);
    } catch (err) {
      out.preview = null;
      self.postMessage(out);
    }
  };
  var fail = function (err) { reply({ ok: false, error: String((err && err.message) || err) }); };

  if (msg.type === 'warm') {
    loadEngine().then(warmPipelines).then(function () { reply({ ok: true }); }, fail);
  } else if (msg.type === 'useWasm') {
    // The page found a read useless even though nothing threw — the one failure
    // the worker cannot see for itself, because it doesn't know which words
    // matter. Drop the GPU for the rest of the session.
    if (engineKind === 'wasm' && enginePromise) { reply({ ok: true }); return; }
    fallBackToWasm().then(function () { reply({ ok: true }); }, fail);
  } else if (msg.type === 'predict') {
    loadEngine()
      .then(function (ocr) { return runPredict(ocr, msg.blob); })
      .then(function (out) {
        // `ok: false` here means the engine itself threw — a shot we can't
        // decode never gets this far. On a phone that is usually the GPU, so
        // retry once on wasm rather than hand the user a failure they can't act
        // on. If wasm fails too, that answer stands.
        if (out.ok || engineKind === 'wasm') return out;
        return fallBackToWasm().then(function (wasmOcr) { return runPredict(wasmOcr, msg.blob); });
      })
      .then(reply, fail);
  }
};
