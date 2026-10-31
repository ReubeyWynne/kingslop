'use strict';
importScripts('hero-gear-engine.js' + self.location.search);
self.onmessage = function (event) {
  // The answer first; then, in a second message, which profile the gear fits best.
  try { self.postMessage({ ok: true, result: { now: self.HeroGear.optimise(event.data), optimal: self.HeroGear.optimal(event.data), planned: self.HeroGear.optimal(event.data, { bag: true }) } }); }
  catch (error) { self.postMessage({ ok: false, error: String(error.message || error) }); return; }
  try { self.postMessage({ ok: true, fit: self.HeroGear.profileFit(event.data) }); } catch (ignored) {}
};
