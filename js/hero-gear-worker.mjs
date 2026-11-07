/* hero-gear-worker.mjs — the Hero gear planner's search, off the page thread. The build
   bundles it with the engine into js/hero-gear-worker.js, a classic worker script. */
import { optimise, optimal, profileFit } from './hero-gear-engine.mjs';

self.onmessage = function (event) {
  // The answer first; then, in a second message, which profile the gear fits best.
  try { self.postMessage({ ok: true, result: { now: optimise(event.data), optimal: optimal(event.data), planned: optimal(event.data, { bag: true }) } }); }
  catch (error) { self.postMessage({ ok: false, error: String(error.message || error) }); return; }
  try { self.postMessage({ ok: true, fit: profileFit(event.data) }); } catch (ignored) {}
};
