'use strict';
importScripts('hero-gear-engine.js' + self.location.search);
self.onmessage = function (event) {
  try { self.postMessage({ ok: true, result: event.data && event.data.kind === 'split' ? self.HeroGear.bestSplit(event.data.state) : self.HeroGear.strategyComparison(event.data) }); }
  catch (error) { self.postMessage({ ok: false, error: String(error.message || error) }); }
};
