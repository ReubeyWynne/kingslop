/* sim-worker.js — runs the Battle Simulator's mix sweep off the page thread.
   One message in ({ id, you, foe, opts }), progress messages while it runs,
   one result out. The engine is the same file the page uses. */
/* global importScripts, BattleEngine */
importScripts('battle-engine.js');

self.onmessage = function (e) {
  var m = e.data || {};
  try {
    var last = 0;
    var result = BattleEngine.sweep(m.you, m.foe, m.opts, function (done, of) {
      // About twenty progress lines a sweep — enough to move, not to flood.
      if (done === of || done - last >= Math.max(1, Math.floor(of / 20))) {
        last = done;
        self.postMessage({ id: m.id, type: 'progress', done: done, of: of });
      }
    });
    self.postMessage({ id: m.id, type: 'done', result: result });
  } catch (err) {
    self.postMessage({ id: m.id, type: 'error', error: String((err && err.message) || err) });
  }
};
