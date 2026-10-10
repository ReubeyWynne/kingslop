/* sim-worker.js — runs the Battle Simulator's mix sweep off the page thread.
   One message in ({ id, you, foe, opts }), progress messages while it runs,
   one result out. The engine is the same file the page uses. */
/* global importScripts, BattleEngine */
importScripts('battle-engine.js');

self.onmessage = function (e) {
  var m = e.data || {};
  try {
    var last = performance.now();
    var result = BattleEngine.sweep(m.you, m.foe, m.opts, function (done, of, battles) {
      var now = performance.now();
      if (done === 1 || done === of || now - last >= 100) {
        last = now;
        self.postMessage({ id: m.id, type: 'progress', done: done, of: of, battles: battles });
      }
    });
    self.postMessage({ id: m.id, type: 'done', result: result });
  } catch (err) {
    self.postMessage({ id: m.id, type: 'error', error: String((err && err.message) || err) });
  }
};
