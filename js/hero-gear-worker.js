'use strict';
importScripts('hero-gear-engine.js');
self.onmessage = function (event) {
  try { self.postMessage({ ok: true, result: self.HeroGear.optimise(event.data) }); }
  catch (error) { self.postMessage({ ok: false, error: String(error.message || error) }); }
};
