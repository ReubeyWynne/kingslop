'use strict';
importScripts('hero-gear-engine.js' + self.location.search);
self.onmessage = function (event) {
  try { self.postMessage({ ok: true, result: self.HeroGear.strategyComparison(event.data) }); }
  catch (error) { self.postMessage({ ok: false, error: String(error.message || error) }); }
};
