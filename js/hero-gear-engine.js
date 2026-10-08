(function (root) {
  'use strict';

  var XP = [0,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100,105,110,115,120,125,130,135,140,145,150,160,170,180,190,200,210,220,230,240,250,270,290,310,330,350,370,390,410,430,450,470,490,510,530,550,570,590,610,630,650,680,710,740,770,800,830,860,890,920,950,990,1030,1070,1110,1150,1190,1230,1270,1310,1350,1400,1450,1500,1550,1600,1650,1700,1750,1800,1850,1900,1950,2000,2050,2100,2150,2200,2250,2300,2350,2400,0,2500,2550,2600,2650,2700,2750,2800,2850,2900,2950,3000,3050,3100,3150,3200,3250,3300,3350,0,3450,3500,3550,3600,3650,3700,3750,3800,3850,3900,3950,4000,4050,4100,4150,4200,4250,4300,4350,0,4450,4500,4550,4600,4650,4700,4750,4800,4850,4900,4950,5000,5050,5100,5150,5200,5250,5300,5350,0,5500,5600,5700,5800,5900,6000,6100,6200,6300,6400,6500,6600,6700,6800,6900,7000,7100,7200,7300,0,7500,7600,7700,7800,7900,8000,8100,8200,8300,8400,8500,8600,8700,8800,8900,9000,9100,9200,9300,0];
  var CUM = [0];
  XP.slice(1).forEach(function (n, i) { CUM[i + 1] = CUM[i] + n; });
  var TYPES = ['inf', 'cav', 'arc'];
  var SLOTS = ['helm', 'gloves', 'chest', 'boots'];
  var RES = ['xp', 'hammers', 'mythic', 'mithril'];
  var KVK_RATES = { hammers: 4000, mithril: 40000 };
  var MILESTONES = [120, 140, 160, 180, 200];
  var MYTHIC = [3, 5, 5, 10, 10];
  var PROFILES = {
    growth: { inf: [0.7, 1.5], cav: [0.4, 0.2], arc: [1.4, 0.7] },
    combat: { inf: [0.7, 1.5], cav: [1.2, 0.4], arc: [1.3, 0.6] },
    gen4: { inf: [1.1, 1.5], cav: [1.2, 0.4], arc: [1.2, 0.6] },
    rally: { inf: [0.7, 1.2], cav: [0.6, 0.4], arc: [1.8, 0.8] },
    garrison: { inf: [1, 1.8], cav: [0.6, 0.5], arc: [1.1, 0.8] },
    equal: { inf: [1, 1], cav: [1, 1], arc: [1, 1] }
  };

  function number(n, max) { return Math.min(max, Math.max(0, Math.floor(Number(n) || 0))); }
  function emptyCost() { return { xp: 0, hammers: 0, mythic: 0, mithril: 0 }; }
  function kvkPoints(costs) { costs = costs || {}; return number(costs.hammers, 1e9) * KVK_RATES.hammers + number(costs.mithril, 1e9) * KVK_RATES.mithril; }
  function copy(x) { return JSON.parse(JSON.stringify(x)); }
  function statType(slot) { return slot === 'helm' || slot === 'boots' ? 0 : 1; }
  function masteryNeeded(level) { return level < 120 ? (level >= 100 ? 10 : 0) : 10 + Math.floor((level - 100) / 20); }
  function cap(p) { return p.quality === 'epic' ? 80 : p.quality === 'red' ? 200 : 100; }
  function normalisePiece(p) {
    p = p || {};
    var quality = ['epic', 'mythic', 'red'].indexOf(p.quality) >= 0 ? p.quality : 'mythic';
    var level = number(p.level, quality === 'epic' ? 80 : quality === 'red' ? 200 : 100);
    if (quality === 'red') level = Math.max(100, level);
    var mastery = quality === 'epic' ? 0 : number(p.mastery, 20);
    if (quality === 'red') mastery = Math.max(masteryNeeded(level), mastery);
    return { quality: quality, level: level, mastery: mastery };
  }
  function defaults() {
    var pieces = {};
    TYPES.forEach(function (type) { SLOTS.forEach(function (slot) { pieces[type + '-' + slot] = normalisePiece(); }); });
    return { version: 1, pieces: pieces, resources: emptyCost(), included: { inf: true, cav: true, arc: true }, weights: copy(PROFILES.growth), profile: 'growth', reforge: false, troop: 'inf', mode: 'plan', view: 'gear', selected: 'inf-helm', goal: 'mithril', target: 120, targetMastery: 11 };
  }
  function normaliseState(input) {
    var s = defaults();
    if (!input || input.version !== 1) return s;
    Object.keys(s.pieces).forEach(function (id) { s.pieces[id] = normalisePiece(input.pieces && input.pieces[id]); });
    RES.forEach(function (r) { s.resources[r] = number(input.resources && input.resources[r], 1e9); });
    TYPES.forEach(function (type) {
      s.included[type] = !input.included || input.included[type] !== false;
      if (input.weights && Array.isArray(input.weights[type])) s.weights[type] = [0, 1].map(function (i) { var w = Number(input.weights[type][i]); return Number.isFinite(w) ? Math.min(100, Math.max(0, w)) : s.weights[type][i]; });
    });
    if (input.profile === 'custom' || PROFILES[input.profile]) s.profile = input.profile;
    if (TYPES.indexOf(input.troop) >= 0) s.troop = input.troop;
    if (['milestones', 'plan', 'optimise'].indexOf(input.mode) >= 0) s.mode = input.mode;
    if (input.view === 'plan') s.view = 'plan';
    if (s.pieces[input.selected]) s.selected = input.selected;
    if (['red', 'mithril', 'level'].indexOf(input.goal) >= 0) s.goal = input.goal;
    s.reforge = !!input.reforge;
    s.target = number(input.target, 200);
    s.targetMastery = number(input.targetMastery, 20);
    return s;
  }
  function cost(from, to) {
    from = normalisePiece(from);
    to = normalisePiece(to);
    if (to.level < from.level || to.mastery < from.mastery || (from.quality === 'red' && to.quality !== 'red')) throw new RangeError('Downgrade');
    if (from.quality === 'epic' && to.quality !== 'epic') throw new RangeError('Epic ascension');
    var result = emptyCost();
    result.xp = CUM[to.level] - CUM[from.level];
    result.hammers = 5 * (to.mastery * (to.mastery + 1) - from.mastery * (from.mastery + 1));
    for (var m = from.mastery + 1; m <= to.mastery; m++) result.mythic += Math.max(0, m - 10);
    if (from.quality !== 'red' && to.quality === 'red') result.mythic += 2;
    MILESTONES.forEach(function (level, i) {
      if (from.level < level && to.level >= level) {
        result.mithril += (i + 1) * 10;
        result.mythic += MYTHIC[i];
      }
    });
    return result;
  }
  function target(from, level, mastery, red) {
    from = normalisePiece(from);
    if (from.quality === 'epic' && (red || level > 80)) return null;
    level = Math.max(from.level, number(level, 200));
    var quality = from.quality === 'red' || red || level > 100 ? 'red' : from.quality;
    var required = quality === 'red' ? masteryNeeded(level) : 0;
    return normalisePiece({ quality: quality, level: level, mastery: Math.max(from.mastery, number(mastery, 20), required) });
  }
  function milestone(from, goal) {
    from = normalisePiece(from);
    if (from.quality === 'epic') return null;
    if (goal === 'red') return from.quality === 'red' ? null : target(from, 100, 10, true);
    var next = MILESTONES.find(function (l) { return l > from.level; });
    return next ? target(from, next, masteryNeeded(next), true) : null;
  }
  function gap(costs, bag) {
    var out = emptyCost();
    RES.forEach(function (r) { out[r] = Math.max(0, costs[r] - (bag[r] || 0)); });
    return out;
  }
  function affordable(costs, bag) { return RES.every(function (r) { return costs[r] <= bag[r]; }); }
  function stats(p, slot) {
    p = normalisePiece(p);
    var base = p.quality === 'epic' ? 9 + p.level * 0.21 : p.quality === 'red' ? 50 + (p.level - 100) * 0.5 : 15 + p.level * 0.35;
    var result = { core: base * (1 + p.mastery * 0.1), attack: 0, defense: 0 };
    if (p.quality === 'red') {
      var attackFirst = slot === 'helm' || slot === 'chest';
      if (p.level >= 120) result[attackFirst ? 'attack' : 'defense'] += 20;
      if (p.level >= 160) result[attackFirst ? 'defense' : 'attack'] += 30;
      if (p.level >= 200) result[attackFirst ? 'attack' : 'defense'] += 50;
    }
    return result;
  }
  function score(id, piece, weights) {
    var parts = id.split('-'), s = stats(piece, parts[1]), w = weights[parts[0]];
    return s.core * w[statType(parts[1])] + s.attack * w[0] + s.defense * w[1];
  }
  function total(pieces, state) {
    return Object.keys(pieces).reduce(function (sum, id) { return sum + (state.included[id.split('-')[0]] ? score(id, pieces[id], state.weights) : 0); }, 0);
  }
  function redPlans(input) {
    var state = normaliseState(input), units = { xp: 52650, hammers: 550, mythic: 6, mithril: 10 };
    var scale = emptyCost(), routes = [];
    RES.forEach(function (r) { scale[r] = Math.max(units[r], state.resources[r]); });
    Object.keys(state.pieces).forEach(function (id) {
      var from = state.pieces[id], slot = id.split('-')[1];
      if (!state.included[id.split('-')[0]] || from.quality === 'epic') return;
      [120, 160, 200].forEach(function (level) {
        if (from.level >= level) return;
        var to = target(from, level, from.mastery, true), costs = cost(from, to);
        var before = stats(from, slot), after = stats(to, slot), gain = score(id, to, state.weights) - score(id, from, state.weights);
        var load = RES.reduce(function (sum, r) { return sum + costs[r] / scale[r]; }, 0);
        var distance = RES.reduce(function (max, r) { return Math.max(max, (costs[r] - state.resources[r]) / scale[r]); }, 0);
        if (gain > 0) routes.push({ id: id, from: from, to: to, costs: costs, gap: gap(costs, state.resources), gain: gain, efficiency: gain / Math.max(load, 1e-12), distance: distance, delta: { core: after.core - before.core, attack: after.attack - before.attack, defense: after.defense - before.defense } });
      });
    });
    var thresholds = routes.map(function (route) { return route.distance; }).sort(function (a, b) { return a - b; });
    var frontier = [], last;
    thresholds.forEach(function (distance) {
      var available = routes.filter(function (route) { return route.distance <= distance + 1e-10; });
      available.sort(function (a, b) { return b.gain - a.gain || b.efficiency - a.efficiency || a.id.localeCompare(b.id); });
      var winner = available[0];
      if (winner && winner !== last) { frontier.push(winner); last = winner; }
    });
    return { routes: frontier.slice(0, 3), scale: scale };
  }
  function candidates(p) {
    var out = [], levels = [p.level], max = cap(p);
    if (p.level < max) levels.push(p.level + 1);
    if (p.quality === 'mythic') {
      [20, 40, 60, 80, 100].forEach(function (l) { if (l > p.level) levels.push(l); });
      levels.push(101);
    }
    if (p.quality !== 'epic') MILESTONES.forEach(function (l) { if (l > p.level) levels.push(l); });
    levels.forEach(function (l) {
      [p.mastery, Math.min(20, p.mastery + 1)].forEach(function (m) {
        var to = target(p, l, m, l > 100);
        if (to && (to.level !== p.level || to.mastery !== p.mastery || to.quality !== p.quality)) out.push(to);
      });
    });
    return out;
  }
  function optimise(input) {
    var state = normaliseState(input), original = copy(state.pieces), baseline = total(original, state), best;
    var modes = state.reforge ? [false, true] : [false];
    modes.forEach(function (reforge) {
      [1, 0.5, 2].forEach(function (power) {
        var pieces = copy(original), bag = copy(state.resources), refund = 0;
        if (reforge) Object.keys(pieces).forEach(function (id) {
          var p = pieces[id];
          if (state.included[id.split('-')[0]] && p.quality !== 'red') { refund += CUM[p.level]; p.level = 0; }
        });
        bag.xp += refund;
        var budget = copy(bag);
        for (var iteration = 0; iteration < 2700; iteration++) {
          var winner = null;
          Object.keys(pieces).forEach(function (id) {
            if (!state.included[id.split('-')[0]]) return;
            var p = pieces[id], before = score(id, p, state.weights);
            candidates(p).forEach(function (to) {
              var costs = cost(p, to);
              if (!affordable(costs, bag)) return;
              var gain = score(id, to, state.weights) - before;
              if (gain <= 0) return;
              var share = RES.reduce(function (sum, r) { return sum + costs[r] / Math.max(1, budget[r]); }, 0);
              var merit = gain / Math.pow(Math.max(1e-12, share), power);
              if (!winner || merit > winner.merit) winner = { id: id, to: to, costs: costs, merit: merit };
            });
          });
          if (!winner) break;
          pieces[winner.id] = winner.to;
          RES.forEach(function (r) { bag[r] -= winner.costs[r]; });
        }
        var value = total(pieces, state);
        if (value < baseline - 1e-8) return;
        if (!best || value > best.score + 1e-8) best = { pieces: pieces, remaining: bag, refund: refund, score: value };
      });
    });
    if (!best) best = { pieces: original, remaining: copy(state.resources), refund: 0, score: baseline };
    best.baseline = baseline;
    best.gain = best.score - baseline;
    best.changes = Object.keys(original).filter(function (id) { return JSON.stringify(original[id]) !== JSON.stringify(best.pieces[id]); });
    best.refund = 0;
    best.spent = emptyCost();
    best.details = best.changes.map(function (id) {
      var slot = id.split('-')[1], before = stats(original[id], slot), after = stats(best.pieces[id], slot), reforged = best.pieces[id].level < original[id].level;
      var refund = reforged ? CUM[original[id].level] - CUM[best.pieces[id].level] : 0;
      var start = copy(original[id]);
      if (reforged) start.level = best.pieces[id].level;
      var costs = cost(start, best.pieces[id]);
      best.refund += refund;
      RES.forEach(function (r) { best.spent[r] += costs[r]; });
      return { id: id, from: original[id], to: best.pieces[id], costs: costs, refund: refund, reforged: reforged, before: before, after: after, delta: { core: after.core - before.core, attack: after.attack - before.attack, defense: after.defense - before.defense }, gain: score(id, best.pieces[id], state.weights) - score(id, original[id], state.weights) };
    });
    return best;
  }

  var api = { XP: XP, CUM: CUM, TYPES: TYPES, SLOTS: SLOTS, RES: RES, KVK_RATES: KVK_RATES, kvkPoints: kvkPoints, MILESTONES: MILESTONES, PROFILES: PROFILES, defaults: defaults, normaliseState: normaliseState, normalisePiece: normalisePiece, cap: cap, cost: cost, target: target, milestone: milestone, gap: gap, affordable: affordable, stats: stats, score: score, redPlans: redPlans, optimise: optimise };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HeroGear = api;
})(typeof window !== 'undefined' ? window : globalThis);
