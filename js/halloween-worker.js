self.window = self;
importScripts('seasonal-data.js', 'halloween-engine.js');
self.onmessage = function (event) {
  var input = event.data, E = self.Halloween, data = E.data, cache = new Map(), compareSamples;
  function send(part, result) { self.postMessage({ id: input.id, part: part, result: result }); }
  function value(candy, options) { var key = JSON.stringify([candy, options]); if (!cache.has(key)) cache.set(key, E.candyValue(candy, Object.assign({}, options, { samples: compareSamples }))); return cache.get(key); }
  function topUp(points) {
    var out = {};
    if (input.topUpPoints !== null) data.topUps.filter(function (tier) { return tier.points > input.topUpPoints && tier.points <= input.topUpPoints + points; }).forEach(function (tier) { tier.rewards.forEach(function (item) { out[item.name] = (out[item.name] || 0) + item.amount; }); });
    return out;
  }
  function items(list, count) { var out = {}; list.forEach(function (item) { out[item.name] = (out[item.name] || 0) + item.amount * count; }); return out; }
  function difference(after, before, direct) { var out = Object.assign({}, direct); new Set(Object.keys(after).concat(Object.keys(before))).forEach(function (key) { out[key] = (out[key] || 0) + (after[key] || 0) - (before[key] || 0); }); return out; }
  try {
    var held = E.candyValue(input.candy, input.options); send('held', held);
    var future = E.futureIncome(input.future);
    compareSamples = Math.min(2000, Math.max(100, Math.floor(2000000 / (Math.floor((input.candy + future.candy + 50000) / 20) + 1))));
    var baseCandy = input.candy + future.candy, base = value(baseCandy, input.options);
    var counts = input.selected, direct = Object.assign({}, future.rewards), selectedCandy = 0, cents = 0, topUps = 0;
    data.packs.forEach(function (pack, i) { var n = counts[i]; if (!n) return; selectedCandy += n * pack.candy; cents += Math.round(pack['price' + input.currency] * 100) * n; topUps += pack.topUpPoints * n; direct = E.mergeRewards(direct, items(pack.items, n)); });
    var selectedPasses = input.passes.filter(function (p) { return p.selected; });
    selectedPasses.forEach(function (pass) { var spec = data.passes.find(function (p) { return p.id === pass.track; }); cents += Math.round(spec['price' + input.currency] * 100); topUps += spec.topUpPoints; });
    direct = E.mergeRewards(direct, topUp(topUps));
    var total = value(baseCandy + selectedCandy, Object.assign({}, input.options, { points: input.points || 0, passes: selectedPasses }));
    total = Object.assign({}, total, { rewards: E.mergeRewards(total.rewards, direct) });
    send('total', { held: input.candy, future: future, purchaseCandy: selectedCandy, cents: cents, value: total });
    var offers = data.packs.map(function (pack, i) {
      if (input.next >= 0 && i < input.next || i === 6 && input.next === 6 && !input.remaining) return null;
      var result = value(baseCandy + pack.candy, input.options), rewards = difference(result.rewards, base.rewards, E.mergeRewards(items(pack.items, 1), topUp(pack.topUpPoints)));
      var unlockCents = data.packs.slice(Math.max(0, input.next), i + 1).reduce(function (n, p) { return n + Math.round(p['price' + input.currency] * 100); }, 0);
      return { index: i, candy: pack.candy, cents: Math.round(pack['price' + input.currency] * 100), points: result.points - base.points, rewards: rewards, unlockCents: unlockCents };
    }).filter(Boolean);
    send('offers', offers);
    var passes = input.points === null || input.variant === null ? [] : data.passes.map(function (spec) {
      var pass = { track: spec.id, variant: input.variant, claimed: 0 }, result = value(baseCandy, Object.assign({}, input.options, { points: input.points, passes: [pass] }));
      return { id: spec.id, label: spec.label, cents: Math.round(spec['price' + input.currency] * 100), points: result.points - base.points, candy: result.passCandy, rewards: difference(result.rewards, base.rewards, topUp(spec.topUpPoints)) };
    });
    send('passes', passes);
  } catch (cause) { send('error', cause.message); }
};
