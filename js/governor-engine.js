/* Pure governor gear and charm arithmetic. Levels are indices: 0 is nothing yet,
   index n is the nth row of the sourced table, and each row's cost buys that step. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../_data/governor.json'), require('./event-rules.js'));
  else root.Governor = factory(root.GovernorData, root.EventRules);
})(typeof window === 'object' ? window : globalThis, function (data, rules) {
  'use strict';
  var KINDS = { gear: data.gear.pieces, charms: data.charms.slots };
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
  function toTarget(kind, state, target, bag, options) {
    level(kind, target);
    var troop = options && options.troop && options.troop !== 'all' ? options.troop : null;
    var total = zero(kind), unknown = [], unverified = false, steps = 0, scoreGain = 0, scoreKnown = true, levels = {};
    items(kind).forEach(function (item) {
      var from = current(kind, state, item.id);
      levels[item.id] = from;
      if (troop && item.troop !== troop) return;
      if (from === null) { unknown.push(item.id); return; }
      if (from >= target) return;
      levels[item.id] = target;
      add(total, cost(kind, from, target)); steps += target - from;
      for (var i = from + 1; i <= target; i++) if (!verified(kind, i)) unverified = true;
      if (score(kind, target) === null || (from && score(kind, from) === null)) scoreKnown = false; else scoreGain += score(kind, target) - score(kind, from);
    });
    var missing = zero(kind);
    Object.keys(total).forEach(function (id) { var have = bag && Number.isSafeInteger(bag[id]) ? bag[id] : null; missing[id] = have === null ? null : Math.max(0, total[id] - have); });
    return { kind: kind, target: target, troop: troop || 'all', cost: total, missing: missing, steps: steps, levels: levels, unknown: unknown, unverified: unverified, score: scoreKnown ? scoreGain : null };
  }
  function affordable(price, bag) { return Object.keys(price).every(function (id) { return price[id] <= bag[id]; }); }
  /* Troop profiles weigh each step's stat gain by its troop; "score" ranks by governor score.
     An older save's goal of score reads as the score profile. */
  var PROFILES = data.profiles;
  function profileOf(options) {
    var name = options.profile || (options.goal === 'score' ? 'score' : 'bear');
    if (name !== 'score' && !Object.hasOwn(PROFILES, name)) throw new Error('Unsupported governor profile');
    return name;
  }
  /* Greedy, explainable plan: at each step take the affordable next level with the most
     value for the share of the starting bag it uses. Value is the stat gain weighted by the
     profile's troop weights, or the governor score gain for the score profile. Ties go to
     the heavier troop, then the lower level, then table order, never to table order alone. */
  function plan(kind, state, bag, options) {
    options = options || {};
    var profile = profileOf(options), goal = profile === 'score' ? 'score' : 'stats', weights = PROFILES[profile] || { inf: 1, cav: 1, arc: 1 };
    var focus = options.focus || 'all', limit = options.limit || 60;
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
        var gain = goal === 'score' ? (next.score === null || (from && row(kind, from).score === null) ? null : next.score - score(kind, from)) : (next.stat - stat(kind, from)) * weights[item.troop];
        if (gain === null || gain <= 0) return;
        var share = Object.keys(price).reduce(function (sum, id) { return sum + price[id] / start[id]; }, 0);
        var value = gain / Math.max(share, 1e-9), weight = weights[item.troop];
        if (!best || value > best.value + 1e-12 || Math.abs(value - best.value) <= 1e-12 && (weight > best.weight || weight === best.weight && (from < best.from || from === best.from && order < best.order))) best = { item: item, from: from, value: value, gain: gain, price: price, order: order, weight: weight };
      });
      if (!best) break;
      Object.keys(best.price).forEach(function (id) { left[id] -= best.price[id]; });
      levels[best.item.id] = best.from + 1;
      var scoreGain = row(kind, best.from + 1).score === null || (best.from && row(kind, best.from).score === null) ? null : score(kind, best.from + 1) - score(kind, best.from);
      steps.push({ id: best.item.id, troop: best.item.troop, from: best.from, to: best.from + 1, cost: best.price, stat: stat(kind, best.from + 1) - stat(kind, best.from), score: scoreGain, verified: verified(kind, best.from + 1) });
    }
    var scoreTotal = steps.every(function (step) { return step.score !== null; }) ? steps.reduce(function (sum, step) { return sum + step.score; }, 0) : null;
    var spent = zero(kind); steps.forEach(function (step) { add(spent, step.cost); });
    return { kind: kind, goal: goal, profile: profile, focus: focus, steps: steps, levels: levels, spent: spent, left: left, score: scoreTotal, truncated: steps.length >= limit };
  }
  // Event days that score governor score gains, with the points a score gain would be worth.
  function events(kind, gain) {
    spec(kind);
    var out = [];
    Object.keys(rules.data.events).forEach(function (event) {
      rules.days(event).forEach(function (day) {
        day.rows.forEach(function (entry) {
          var rate = rules.rate(entry);
          if (rules.governorKind(entry) !== kind || rate === null) return;
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
  /* A sheet in the address. gov= holds one character per gear piece, then one per charm
     (0-9, a-z, A-Z for the level, "." for not set); bag= the materials in table order joined
     by "." (blank is not counted); p, gt and ct the troop profile and targets when they differ
     from the defaults. A sheet is { gear, charms, bag, prefs }, each keyed by id. */
  var DIGITS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', BAG_MAX = 1e9;
  var PREFS = { profile: ['p', Object.keys(PROFILES).concat('score')], gearTarget: ['gt', 'gear'], charmTarget: ['ct', 'charms'] };
  function prefDefaults() { return { profile: 'bear', gearTarget: max('gear'), charmTarget: max('charms') }; }
  function encodeLink(sheet) {
    var out = { gov: ['gear', 'charms'].map(function (kind) {
      return items(kind).map(function (item) { var value = sheet[kind] && sheet[kind][item.id]; return Number.isInteger(value) ? DIGITS[level(kind, value)] : '.'; }).join('');
    }).join('') };
    var bag = data.materials.map(function (m) { var n = sheet.bag && sheet.bag[m.id]; return Number.isSafeInteger(n) && n >= 0 && n <= BAG_MAX ? String(n) : ''; });
    if (bag.some(Boolean)) out.bag = bag.join('.');
    var own = sheet.prefs || {}, prefs = Object.assign(prefDefaults(), own.goal === 'score' ? { profile: 'score' } : {}, own), defaults = prefDefaults();
    Object.keys(PREFS).forEach(function (key) { if (prefs[key] !== undefined && prefs[key] !== defaults[key]) out[PREFS[key][0]] = String(prefs[key]); });
    return out;
  }
  // The sheet a query string carries: null without gov=, { invalid: true } when it cannot be read.
  function readLink(search) {
    var params = new URLSearchParams(search), gov = params.get('gov');
    if (gov === null) return null;
    var invalid = { invalid: true }, gearCount = items('gear').length, charmCount = items('charms').length;
    if (gov.length !== gearCount + charmCount) return invalid;
    var sheet = { gear: {}, charms: {}, bag: {}, prefs: {} };
    for (var i = 0; i < gov.length; i++) {
      var kind = i < gearCount ? 'gear' : 'charms', item = items(kind)[i < gearCount ? i : i - gearCount], ch = gov.charAt(i), value = DIGITS.indexOf(ch);
      if (ch === '.') value = null; else if (value < 0 || value > max(kind)) return invalid;
      sheet[kind][item.id] = value;
    }
    var bag = params.has('bag') ? params.get('bag').split('.') : [];
    if (bag.length && bag.length !== data.materials.length) return invalid;
    for (var b = 0; b < data.materials.length; b++) {
      var text = bag[b] || '';
      if (text && (!/^\d{1,10}$/.test(text) || Number(text) > BAG_MAX)) return invalid;
      sheet.bag[data.materials[b].id] = text ? Number(text) : null;
    }
    var keys = Object.keys(PREFS);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k], rule = PREFS[key], raw = params.get(rule[0]);
      if (raw === null) continue;
      if (Array.isArray(rule[1])) { if (!rule[1].includes(raw)) return invalid; sheet.prefs[key] = raw; }
      else { var n = Number(raw); if (!/^\d+$/.test(raw) || n < 1 || n > max(rule[1])) return invalid; sheet.prefs[key] = n; }
    }
    return sheet;
  }
  return { data: data, max: max, items: items, stat: stat, score: score, verified: verified, cost: cost, toTarget: toTarget, plan: plan, profiles: function () { return Object.keys(PROFILES).concat('score'); }, events: events, describe: describe, prefDefaults: prefDefaults, encodeLink: encodeLink, readLink: readLink };
});
