/* Pure governor gear and charm arithmetic. Levels are indices: 0 is nothing yet,
   index n is the nth row of the sourced table, and each row's cost buys that step. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../_data/governor.json'), require('../_data/event_rules.json'));
  else root.Governor = factory(root.GovernorData, root.EventRuleData);
})(typeof window === 'object' ? window : globalThis, function (data, rules) {
  'use strict';
  var KINDS = { gear: data.gear.pieces, charms: data.charms.slots };
  var SCORE_ROW = { gear: /^governor gear max score \+1$/i, charms: /^governor charm max score \+1$/i };
  function spec(kind) { if (!Object.hasOwn(KINDS, kind)) throw new Error('Unsupported governor kind'); return data[kind]; }
  function max(kind) { return spec(kind).levels.length; }
  function row(kind, index) { return index > 0 ? spec(kind).levels[index - 1] : null; }
  function level(kind, index) {
    if (!Number.isInteger(index) || index < 0 || index > max(kind)) throw new Error('Unsupported governor level');
    return index;
  }
  function items(kind) { return KINDS[kind]; }
  function stat(kind, index) { var entry = row(kind, level(kind, index)); return entry ? entry.stat : 0; }
  function score(kind, index) { var entry = row(kind, level(kind, index)); return entry ? entry.score : 0; }
  function verified(kind, index) { var entry = row(kind, index); return !entry || entry.sources.length >= 2; }
  function zero(kind) { var bag = {}; spec(kind).materials.forEach(function (id) { bag[id] = 0; }); return bag; }
  function add(total, cost) { Object.keys(cost).forEach(function (id) { total[id] += cost[id]; }); return total; }
  // Materials for every step after `from` up to and including `to`.
  function cost(kind, from, to) {
    level(kind, from); level(kind, to);
    var total = zero(kind);
    for (var i = from + 1; i <= to; i++) add(total, row(kind, i).cost);
    return total;
  }
  function current(kind, state, id) { var value = state && Object.hasOwn(state, id) ? state[id] : null; return value === null ? null : level(kind, value); }
  // Totals to bring every known item up to `target`. Unknown items are listed, never assumed to be at zero.
  function toTarget(kind, state, target, bag) {
    level(kind, target);
    var total = zero(kind), unknown = [], unverified = false, steps = 0, scoreGain = 0, scoreKnown = true;
    items(kind).forEach(function (item) {
      var from = current(kind, state, item.id);
      if (from === null) { unknown.push(item.id); return; }
      if (from >= target) return;
      add(total, cost(kind, from, target)); steps += target - from;
      for (var i = from + 1; i <= target; i++) if (!verified(kind, i)) unverified = true;
      if (score(kind, target) === null || (from && score(kind, from) === null)) scoreKnown = false; else scoreGain += score(kind, target) - score(kind, from);
    });
    var missing = zero(kind);
    Object.keys(total).forEach(function (id) { var have = bag && Number.isSafeInteger(bag[id]) ? bag[id] : null; missing[id] = have === null ? null : Math.max(0, total[id] - have); });
    return { kind: kind, target: target, cost: total, missing: missing, steps: steps, unknown: unknown, unverified: unverified, score: scoreKnown ? scoreGain : null };
  }
  function affordable(price, bag) { return Object.keys(price).every(function (id) { return price[id] <= bag[id]; }); }
  /* Greedy, explainable plan: at each step take the affordable next level with the most
     value for the share of the starting bag it uses. Value is the stat gain for the
     focused troops, or the governor score gain when the goal is event score. */
  function plan(kind, state, bag, options) {
    options = options || {};
    var goal = options.goal === 'score' ? 'score' : 'stats', focus = options.focus || 'all', limit = options.limit || 60;
    var left = zero(kind), start = zero(kind), levels = {}, steps = [];
    Object.keys(left).forEach(function (id) {
      var have = bag && Number.isSafeInteger(bag[id]) && bag[id] >= 0 ? bag[id] : 0;
      left[id] = have; start[id] = Math.max(1, have);
    });
    items(kind).forEach(function (item) { levels[item.id] = current(kind, state, item.id); });
    while (steps.length < limit) {
      var best = null;
      items(kind).forEach(function (item, order) {
        var from = levels[item.id];
        if (from === null || from >= max(kind) || focus !== 'all' && item.troop !== focus) return;
        var next = row(kind, from + 1), price = next.cost;
        if (!affordable(price, left)) return;
        var gain = goal === 'score' ? (next.score === null || (from && row(kind, from).score === null) ? null : next.score - score(kind, from)) : next.stat - stat(kind, from);
        if (gain === null || gain <= 0) return;
        var share = Object.keys(price).reduce(function (sum, id) { return sum + price[id] / start[id]; }, 0);
        var value = gain / Math.max(share, 1e-9);
        if (!best || value > best.value + 1e-12 || Math.abs(value - best.value) <= 1e-12 && (from < best.from || from === best.from && order < best.order)) best = { item: item, from: from, value: value, gain: gain, price: price, order: order };
      });
      if (!best) break;
      Object.keys(best.price).forEach(function (id) { left[id] -= best.price[id]; });
      levels[best.item.id] = best.from + 1;
      var scoreGain = row(kind, best.from + 1).score === null || (best.from && row(kind, best.from).score === null) ? null : score(kind, best.from + 1) - score(kind, best.from);
      steps.push({ id: best.item.id, troop: best.item.troop, from: best.from, to: best.from + 1, cost: best.price, stat: stat(kind, best.from + 1) - stat(kind, best.from), score: scoreGain, verified: verified(kind, best.from + 1) });
    }
    var scoreTotal = steps.every(function (step) { return step.score !== null; }) ? steps.reduce(function (sum, step) { return sum + step.score; }, 0) : null;
    var spent = zero(kind); steps.forEach(function (step) { add(spent, step.cost); });
    return { kind: kind, goal: goal, focus: focus, steps: steps, levels: levels, spent: spent, left: left, score: scoreTotal, truncated: steps.length >= limit };
  }
  // Event days that score governor score gains, with the points a score gain would be worth.
  function events(kind, gain) {
    if (!Object.hasOwn(SCORE_ROW, kind)) throw new Error('Unsupported governor kind');
    var out = [];
    Object.keys(rules.events).forEach(function (event) {
      rules.events[event].forEach(function (day) {
        day.rows.forEach(function (entry) {
          var rate = Number(entry.points);
          if (!SCORE_ROW[kind].test(entry.label) || !Number.isFinite(rate)) return;
          out.push({ event: event, day: day.day, rate: rate, points: gain === null || gain === undefined ? null : gain * rate });
        });
      });
    });
    return out;
  }
  function describe(kind, index) {
    level(kind, index);
    if (!index) return { index: 0 };
    var entry = row(kind, index);
    return kind === 'gear' ? { index: index, tier: entry.tier, grade: entry.grade, stars: entry.stars } : { index: index, level: entry.level };
  }
  return { data: data, max: max, items: items, stat: stat, score: score, verified: verified, cost: cost, toTarget: toTarget, plan: plan, events: events, describe: describe };
});
