self.window = self;
importScripts('seasonal-data.js', 'halloween-engine.js');
self.onmessage = function (event) {
  try {
    var facts = event.data.facts, plan = event.data.plan, result = self.Halloween.forecast(facts, plan, 200);
    if (plan.packs.some(Boolean) || plan.tracks.some(Boolean)) {
      var baseline = JSON.parse(JSON.stringify(plan)); baseline.packs.fill(0); baseline.tracks.fill(false);
      var withoutPurchases = self.Halloween.forecast(facts, baseline, 200);
      result.withoutPurchases = withoutPurchases.median;
    }
    self.postMessage({ result: result });
  }
  catch (cause) { self.postMessage({ error: cause.message }); }
};
