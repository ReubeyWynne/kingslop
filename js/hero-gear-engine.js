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
    // Bear first, as on Governor gear: troops 1:1:3, and lethality only, because defence and
    // health never move a bear fight (see sim.army.bearNote). Health pieces still count through
    // their red milestones' attack.
    bear: { inf: [1, 0], cav: [1, 0], arc: [3, 0] },
    garrison: { inf: [1, 1.8], cav: [0.6, 0.5], arc: [1.1, 0.8] },
    equal: { inf: [1, 1], cav: [1, 1], arc: [1, 1] }
  };
  // Saves and links from before Bear first replaced Archer rally lead.
  var RENAMED = { rally: 'bear' };

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
    return { version: 1, pieces: pieces, resources: emptyCost(), included: { inf: true, cav: true, arc: true }, weights: copy(PROFILES.growth), profile: 'growth', reforge: true, hammerReforge: false, troop: 'inf', mode: 'optimise', view: 'gear', selected: 'inf-helm', goal: 'mithril', target: 120, targetMastery: 11 };
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
    var profile = RENAMED[input.profile] || input.profile;
    if (profile === 'custom' || PROFILES[profile]) s.profile = profile;
    if (RENAMED[input.profile]) s.weights = copy(PROFILES[profile]);
    if (TYPES.indexOf(input.troop) >= 0) s.troop = input.troop;
    if (['milestones', 'plan', 'optimise', 'split'].indexOf(input.mode) >= 0) s.mode = input.mode;
    if (input.view === 'plan') s.view = 'plan';
    if (s.pieces[input.selected]) s.selected = input.selected;
    if (['red', 'mithril', 'level'].indexOf(input.goal) >= 0) s.goal = input.goal;
    s.reforge = !!input.reforge;
    s.hammerReforge = !!input.hammerReforge;
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
    return { routes: frontier.slice(0, 3), scale: scale, baseline: total(state.pieces, state) };
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
  function nearbyMilestones(input) {
    var state = normaliseState(input), routes = [];
    Object.keys(state.pieces).forEach(function (id) {
      if (!state.included[id.split('-')[0]]) return;
      var from = state.pieces[id], to = milestone(from, 'mithril');
      if (!to) return;
      var costs = cost(from, to), shortfall = gap(costs, state.resources);
      var gain = score(id, to, state.weights) - score(id, from, state.weights);
      if (gain <= 0) return;
      var refund = 0;
      if (state.reforge) Object.keys(state.pieces).forEach(function (other) {
        if (other !== id && state.included[other.split('-')[0]] && state.pieces[other].quality !== 'red')
          refund += CUM[state.pieces[other].level];
      });
      routes.push({ id: id, from: from, to: to, costs: costs, gap: shortfall, gain: gain, reforgeXpAvailable: refund });
    });
    return routes.sort(function (a, b) {
      var aMissing = RES.filter(function (r) { return a.gap[r] > 0; }).length;
      var bMissing = RES.filter(function (r) { return b.gap[r] > 0; }).length;
      return aMissing - bMissing || a.gap.xp - b.gap.xp || b.gain - a.gain;
    }).slice(0, 3);
  }
  // Look-ahead after the greedy search. A layout is read as one class per piece (quality, mastery
  // and red tier, which fix its hammers, spare mythic gear and mithril) plus a level; given the
  // classes, levels are filled from the XP by stat per XP, which is exact for a linear score.
  // Starting from the greedy answer, it tries every other class for each piece and every pair
  // of small changes on two pieces (one gives up hammers or mythic, the other takes them), keeps
  // the best improvement and repeats until none is left. Nothing goes below where `start` is.
  function tierOf(p) { return p.quality === 'red' ? Math.min(5, Math.floor((p.level - 100) / 20)) : 0; }
  function polish(ids, start, bag, init, weights) {
    var opts = ids.map(function (id) {
      var from = start[id], tier = tierOf(from), own = splitClasses(from.quality === 'epic').filter(function (c) { return c.quality === from.quality && c.mastery === from.mastery && c.tier === tier; })[0];
      return splitClasses(from.quality === 'epic').filter(function (c) {
        if (c.mastery < from.mastery || c.hi < from.level) return false;
        if (from.quality === 'red') return c.quality === 'red' && c.tier >= tier;
        return true;
      }).map(function (c) {
        c.low = score(id, { quality: c.quality, level: c.lo, mastery: c.mastery }, weights);
        c.high = score(id, { quality: c.quality, level: c.hi, mastery: c.mastery }, weights);
        c.slope = c.hi > c.lo ? (c.high - c.low) / (c.hi - c.lo) : 0;
        c.start = Math.max(c.lo, from.level);
        c.xp = CUM[c.start] - CUM[from.level];
        c.dh = c.hammers - (own ? own.hammers : 0); c.dm = c.mythic - (own ? own.mythic : 0); c.dt = c.mithril - (own ? own.mithril : 0);
        return c;
      }).filter(function (c) { return c.dh >= 0 && c.dm >= 0 && c.dt >= 0; });
    });
    function evaluate(pick) {
      var h = 0, m = 0, t = 0, left = bag.xp;
      for (var i = 0; i < pick.length; i++) { var c = pick[i]; h += c.dh; m += c.dm; t += c.dt; left -= c.xp; }
      if (h > bag.hammers || m > bag.mythic || t > bag.mithril || left < 0) return null;
      var levels = pick.map(function (c) { return c.start; });
      for (;;) {
        var best = -1, ratio = -1;
        for (var j = 0; j < pick.length; j++) {
          var need = XP[levels[j] + 1];
          if (levels[j] >= pick[j].hi || need > left) continue;
          var r = need ? pick[j].slope / need : Infinity;
          if (r > ratio) { ratio = r; best = j; }
        }
        if (best < 0 || ratio <= 0) break;
        left -= XP[levels[best] + 1]; levels[best]++;
      }
      var value = 0;
      pick.forEach(function (c, k) { value += c.low + c.slope * (levels[k] - c.lo); });
      return { value: value, levels: levels };
    }
    var pick = ids.map(function (id, i) {
      var p = init[id], tier = tierOf(p);
      return opts[i].filter(function (c) { return c.quality === p.quality && c.mastery === p.mastery && c.tier === tier; })[0] || opts[i][0];
    });
    if (pick.some(function (c) { return !c; })) return null;
    var now = evaluate(pick);
    if (!now) return null;
    function near(i) { return opts[i].filter(function (c) { return Math.abs(c.mastery - pick[i].mastery) <= 2 && Math.abs(c.tier - pick[i].tier) <= 1 && c !== pick[i]; }); }
    for (var sweep = 0; sweep < 30; sweep++) {
      var move = null;
      ids.forEach(function (id, i) {
        opts[i].forEach(function (c) {
          if (c === pick[i]) return;
          var trial = pick.slice(); trial[i] = c;
          var got = evaluate(trial);
          if (got && got.value > (move ? move.got.value : now.value) + 1e-9) move = { trial: trial, got: got };
        });
      });
      for (var a = 0; a < ids.length; a++) {
        var na = near(a);
        for (var b = a + 1; b < ids.length; b++) {
          var nb = near(b);
          for (var x = 0; x < na.length; x++) for (var y = 0; y < nb.length; y++) {
            var trial = pick.slice(); trial[a] = na[x]; trial[b] = nb[y];
            var got = evaluate(trial);
            if (got && got.value > (move ? move.got.value : now.value) + 1e-9) move = { trial: trial, got: got };
          }
        }
      }
      if (!move) break;
      pick = move.trial; now = move.got;
    }
    var out = {};
    ids.forEach(function (id, i) { out[id] = { quality: pick[i].quality, level: now.levels[i], mastery: pick[i].mastery }; });
    return out;
  }
  // Reforging mastery gives back half the Forgehammers it took (rounded down), never the spare
  // mythic gear; red gear cannot be reforged at all, for XP or hammers.
  function masteryHammers(m) { return 5 * m * (m + 1); }
  function hammerBack(p) { return Math.floor(masteryHammers(p.mastery) / 2); }
  function optimise(input, required) {
    var state = normaliseState(input), original = copy(state.pieces), baseline = total(original, state), best;
    // Each run frees some resources first. XP reforge frees every non-red piece's XP. With hammer
    // reforge allowed, runs also reset the mastery of one piece, one troop, or every piece; a reset
    // that doesn't pay is simply beaten by a run without it.
    var resettable = Object.keys(original).filter(function (id) { return state.included[id.split('-')[0]] && original[id].quality !== 'red' && original[id].mastery > 0; });
    var resets = [[]];
    if (state.hammerReforge && resettable.length) {
      resettable.forEach(function (id) { resets.push([id]); });
      TYPES.forEach(function (type) { var some = resettable.filter(function (id) { return id.split('-')[0] === type; }); if (some.length > 1) resets.push(some); });
      if (resettable.length > 1) resets.push(resettable);
    }
    var modes = [];
    (state.reforge ? [false, true] : [false]).forEach(function (reforge) { resets.forEach(function (reset) { modes.push({ reforge: reforge, reset: reset }); }); });
    modes.forEach(function (mode) {
      var reforge = mode.reforge;
      [1, 0.5, 2].forEach(function (power) {
        var pieces = copy(original), bag = copy(state.resources), refund = 0, reset = {};
        if (reforge) Object.keys(pieces).forEach(function (id) {
          var p = pieces[id];
          if (state.included[id.split('-')[0]] && p.quality !== 'red') { refund += CUM[p.level]; p.level = 0; }
        });
        mode.reset.forEach(function (id) { bag.hammers += hammerBack(pieces[id]); pieces[id].mastery = 0; reset[id] = true; });
        bag.xp += refund;
        var startPieces = copy(pieces), startBag = copy(bag);
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
        if (!best || value > best.score + 1e-8) best = { pieces: pieces, remaining: bag, refund: refund, reset: reset, score: value, startPieces: startPieces, startBag: startBag };
      });
    });
    // Look ahead from the greedy winner, within what that run started from.
    if (best && !required && !(input && input.greedyOnly)) {
      var ids = Object.keys(original).filter(function (id) { return state.included[id.split('-')[0]]; });
      var better = polish(ids, best.startPieces, best.startBag, best.pieces, state.weights);
      if (better) {
        var tried = copy(best.pieces); Object.keys(better).forEach(function (id) { tried[id] = better[id]; });
        var triedScore = total(tried, state);
        if (triedScore > best.score + 1e-8) {
          var left = copy(best.startBag);
          ids.forEach(function (id) { var c = cost(best.startPieces[id], tried[id]); RES.forEach(function (r) { left[r] -= c[r]; }); });
          best.pieces = tried; best.score = triedScore; best.remaining = left;
        }
      }
    }
    if (!best && required) return null;
    if (!best) best = { pieces: original, remaining: copy(state.resources), refund: 0, reset: {}, score: baseline };
    best.baseline = baseline;
    best.gain = best.score - baseline;
    // A reset piece rebuilt to where it was changes nothing, so it is put back as it was.
    Object.keys(best.reset).forEach(function (id) {
      var p = best.pieces[id];
      if (p.mastery !== original[id].mastery || p.level < original[id].level) return;
      var rebuilt = cost({ quality: original[id].quality, level: 0, mastery: 0 }, { quality: original[id].quality, level: 0, mastery: original[id].mastery });
      delete best.reset[id];
      RES.forEach(function (r) { best.remaining[r] += rebuilt[r]; });
      best.remaining.hammers -= hammerBack(original[id]);
    });
    best.changes = Object.keys(original).filter(function (id) { return JSON.stringify(original[id]) !== JSON.stringify(best.pieces[id]); });
    best.refund = 0; best.hammerRefund = 0;
    best.spent = emptyCost();
    best.details = best.changes.map(function (id) {
      var slot = id.split('-')[1], before = stats(original[id], slot), after = stats(best.pieces[id], slot), reforged = best.pieces[id].level < original[id].level;
      var refund = reforged ? CUM[original[id].level] - CUM[best.pieces[id].level] : 0, hammerRefund = best.reset[id] ? hammerBack(original[id]) : 0;
      var start = copy(original[id]);
      if (reforged) start.level = best.pieces[id].level;
      if (hammerRefund || best.reset[id]) start.mastery = 0;
      var costs = cost(start, best.pieces[id]);
      best.refund += refund; best.hammerRefund += hammerRefund;
      RES.forEach(function (r) { best.spent[r] += costs[r]; });
      return { id: id, from: original[id], to: best.pieces[id], costs: costs, refund: refund, hammerRefund: hammerRefund, reforged: reforged, before: before, after: after, delta: { core: after.core - before.core, attack: after.attack - before.attack, defense: after.defense - before.defense }, gain: score(id, best.pieces[id], state.weights) - score(id, original[id], state.weights) };
    });
    return best;
  }

  function strategyComparison(input) {
    var state = normaliseState(input), now = optimise(state), options = nearbyMilestones(state).slice(0, 1);
    var alternatives = options.map(function (route) {
      var afterPiece = now.pieces[route.id], afterTarget = milestone(afterPiece, 'mithril');
      var afterSpendGap = afterTarget ? gap(cost(afterPiece, afterTarget), now.remaining) : emptyCost();
      var withReforge = copy(state);
      withReforge.reforge = true;
      var reforgeNow = optimise(withReforge, route);
      var needed = copy(route.gap);
      var future = copy(state);
      RES.forEach(function (r) { future.resources[r] += needed[r]; });
      var futurePlan = optimise(future, route);
      var futureBest = optimise(future);
      return {
        id: route.id, from: route.from, to: route.to, costs: route.costs, gap: needed, afterSpendGap: afterSpendGap,
        milestoneGain: route.gain,
        reforgeNow: reforgeNow && reforgeNow.score > now.baseline + 1e-8 ? reforgeNow : null,
        futurePlan: futurePlan,
        futureBestScore: futureBest.score,
        beatsCurrentPlan: !!futurePlan && futurePlan.score > now.score + 1e-8,
        optimalAtThreshold: !!futurePlan && futurePlan.score >= futureBest.score - 1e-8
      };
    });
    return { now: now, alternatives: alternatives };
  }
  // Best split: what a troop set's invested resources would buy if spent from scratch.
  // A piece's quality, red milestone tier and mastery fix its hammer, mythic and mithril
  // cost; inside that class the stat rises linearly with level while XP per level rises,
  // so levels are filled greedily by stat per XP. Every class combination that fits is
  // searched (with a value bound), so mastery, ascension and milestone choices are exact;
  // XP levels can sit a level or two from the true optimum.
  var IMBUE_MYTHIC = [0, 3, 8, 13, 23, 33], IMBUE_MITHRIL = [0, 10, 30, 60, 100, 150];
  function zeroPiece(p) { return { quality: p.quality === 'epic' ? 'epic' : 'mythic', level: 0, mastery: 0 }; }
  function invested(p) { return cost(zeroPiece(p), p); }
  function splitClasses(epic) {
    var out = [];
    if (epic) out.push({ quality: 'epic', mastery: 0, tier: 0, lo: 0, hi: 80 });
    else {
      for (var m = 0; m <= 20; m++) out.push({ quality: 'mythic', mastery: m, tier: 0, lo: 0, hi: 100 });
      for (var k = 0; k <= 5; k++) for (var n = 10 + k; n <= 20; n++) out.push({ quality: 'red', mastery: n, tier: k, lo: 100 + 20 * k, hi: k < 5 ? 119 + 20 * k : 200 });
    }
    out.forEach(function (c) {
      c.hammers = 5 * c.mastery * (c.mastery + 1);
      c.mythic = (c.mastery > 10 ? (c.mastery - 10) * (c.mastery - 9) / 2 : 0) + (c.quality === 'red' ? 2 + IMBUE_MYTHIC[c.tier] : 0);
      c.mithril = c.quality === 'red' ? IMBUE_MITHRIL[c.tier] : 0;
    });
    return out;
  }
  function fillLevels(picks, xp) {
    var levels = picks.map(function (c) { return c.lo; }), left = xp;
    picks.forEach(function (c) { left -= CUM[c.lo]; });
    if (left < 0) return null;
    for (;;) {
      var best = -1, ratio = -1;
      picks.forEach(function (c, i) {
        if (levels[i] >= c.hi || XP[levels[i] + 1] > left) return;
        var r = XP[levels[i] + 1] ? c.slope / XP[levels[i] + 1] : Infinity;
        if (r > ratio) { ratio = r; best = i; }
      });
      if (best < 0) return levels;
      left -= XP[levels[best] + 1]; levels[best]++;
    }
  }
  function bestSet(ids, pieces, weights) {
    var budget = emptyCost();
    ids.forEach(function (id) { var c = invested(pieces[id]); RES.forEach(function (r) { budget[r] += c[r]; }); });
    var options = ids.map(function (id) {
      return splitClasses(pieces[id].quality === 'epic').filter(function (c) { return c.hammers <= budget.hammers && c.mythic <= budget.mythic && c.mithril <= budget.mithril && CUM[c.lo] <= budget.xp; }).map(function (c) {
        c.low = score(id, { quality: c.quality, level: c.lo, mastery: c.mastery }, weights);
        c.high = score(id, { quality: c.quality, level: c.hi, mastery: c.mastery }, weights);
        c.slope = (c.high - c.low) / (c.hi - c.lo);
        return c;
      });
    });
    var rest = [0];
    for (var i = ids.length - 1; i >= 0; i--) rest.unshift(rest[0] + Math.max.apply(null, options[i].map(function (c) { return c.high; })));
    var current = ids.reduce(function (sum, id) { return sum + score(id, pieces[id], weights); }, 0);
    var best = { score: current, pieces: ids.map(function (id) { return normalisePiece(pieces[id]); }) }, chosen = [];
    (function search(i, hammers, mythic, mithril, xp, bound) {
      if (i === ids.length) {
        var levels = fillLevels(chosen, budget.xp);
        if (!levels) return;
        var value = chosen.reduce(function (sum, c, j) { return sum + c.low + c.slope * (levels[j] - c.lo); }, 0);
        if (value > best.score + 1e-9) best = { score: value, pieces: chosen.map(function (c, j) { return { quality: c.quality, level: levels[j], mastery: c.mastery }; }) };
        return;
      }
      options[i].forEach(function (c) {
        if (hammers + c.hammers > budget.hammers || mythic + c.mythic > budget.mythic || mithril + c.mithril > budget.mithril || xp + CUM[c.lo] > budget.xp) return;
        if (bound + c.high + rest[i + 1] <= best.score + 1e-9) return;
        chosen[i] = c;
        search(i + 1, hammers + c.hammers, mythic + c.mythic, mithril + c.mithril, xp + CUM[c.lo], bound + c.high);
      });
    })(0, 0, 0, 0, 0, 0);
    return { budget: budget, current: current, score: best.score, pieces: ids.map(function (id, j) {
      return { id: id, from: normalisePiece(pieces[id]), to: best.pieces[j], fromCost: invested(pieces[id]), toCost: invested(best.pieces[j]) };
    }) };
  }
  function bestSplit(input) {
    var state = normaliseState(input);
    return TYPES.filter(function (type) { return state.included[type]; }).map(function (type) {
      var result = bestSet(SLOTS.map(function (slot) { return type + '-' + slot; }), state.pieces, state.weights);
      result.type = type;
      return result;
    });
  }
  // How close the gear is to what its own investment could be. Every resource already put
  // into the included pieces is the budget; with { bag: true } the materials in the bag join
  // it, which is what the gear could be after this round of upgrades. The greedy search of
  // Spend now gets the whole budget from four starts: every piece back at level 0, each troop's
  // own exact best split, the gear as it is with its XP free to move (reforge), and the gear
  // as it is. From each start it spends whatever that start left over, across all troops, and
  // the best layout wins. Epic pieces stay epic. The current gear is a candidate too, so the
  // share never passes 100%.
  function optimal(input, options) {
    var state = normaliseState(input), budget = emptyCost(), counted = function (id) { return state.included[id.split('-')[0]]; };
    var bag = options && options.bag ? copy(state.resources) : emptyCost();
    Object.keys(state.pieces).forEach(function (id) {
      if (!counted(id)) return;
      var spent = invested(state.pieces[id]);
      RES.forEach(function (r) { budget[r] += spent[r]; });
    });
    RES.forEach(function (r) { budget[r] += bag[r]; });
    var zero = copy(state.pieces), split = copy(state.pieces);
    Object.keys(zero).forEach(function (id) { if (counted(id)) zero[id] = zeroPiece(state.pieces[id]); });
    bestSplit(state).forEach(function (set) { set.pieces.forEach(function (p) { split[p.id] = copy(p.to); }); });
    var quick = !!(options && options.quick);
    var free = copy(state); free.resources = bag; free.reforge = true; free.hammerReforge = false; free.greedyOnly = quick;
    var starts = [zero, split, optimise(free).pieces, copy(state.pieces)];
    var current = total(state.pieces, state), best = { score: current, pieces: copy(state.pieces) };
    starts.forEach(function (start) {
      var left = copy(budget), fits = true;
      Object.keys(start).forEach(function (id) {
        if (!counted(id)) return;
        var used = invested(start[id]);
        RES.forEach(function (r) { left[r] -= used[r]; });
      });
      RES.forEach(function (r) { if (left[r] < 0) fits = false; });
      if (!fits) return;
      var fresh = copy(state); fresh.pieces = start; fresh.resources = left; fresh.reforge = false; fresh.hammerReforge = false; fresh.greedyOnly = quick;
      var search = optimise(fresh);
      if (search.score > best.score + 1e-8) best = { score: search.score, pieces: search.pieces };
    });
    var pieces = best.pieces;
    Object.keys(state.pieces).forEach(function (id) { if (!counted(id)) pieces[id] = copy(state.pieces[id]); });
    return {
      budget: budget, current: current, score: best.score, share: best.score > 0 ? Math.min(1, current / best.score) : 1, pieces: pieces,
      changes: Object.keys(pieces).filter(function (id) { return JSON.stringify(pieces[id]) !== JSON.stringify(state.pieces[id]); })
    };
  }
  // Which priority profile the gear already fits best: its share of optimal under each one
  // (greedy only, without the look-ahead, to keep six searches quick).
  function profileFit(input) {
    var state = normaliseState(input), out = {};
    Object.keys(PROFILES).forEach(function (name) {
      var trial = copy(state); trial.weights = copy(PROFILES[name]);
      out[name] = optimal(trial, { quick: true }).share;
    });
    return out;
  }
  // A share link carries the twelve pieces and the priorities, nothing from the bag:
  // gear=m100.10-r120.11-… in troop then slot order, and w=<profile> or six custom weights.
  var LINK_QUALITY = { e: 'epic', m: 'mythic', r: 'red' };
  function encodeLink(input) {
    var state = normaliseState(input), ids = Object.keys(defaults().pieces);
    var gear = ids.map(function (id) { var p = state.pieces[id]; return p.quality.charAt(0) + p.level + '.' + p.mastery; }).join('-');
    var w = PROFILES[state.profile] ? state.profile : TYPES.map(function (type) { return state.weights[type].join(','); }).join(',');
    return { gear: gear, w: w };
  }
  function readLink(search) {
    var params = new URLSearchParams(search || ''), gear = params.get('gear');
    if (gear === null) return null;
    var ids = Object.keys(defaults().pieces), tokens = gear.split('-'), pieces = {};
    if (tokens.length !== ids.length) return { invalid: true };
    for (var i = 0; i < ids.length; i++) {
      var m = /^([emr])(\d{1,3})\.(\d{1,2})$/.exec(tokens[i]);
      if (!m) return { invalid: true };
      var raw = { quality: LINK_QUALITY[m[1]], level: Number(m[2]), mastery: Number(m[3]) }, p = normalisePiece(raw);
      if (JSON.stringify(p) !== JSON.stringify(raw)) return { invalid: true };
      pieces[ids[i]] = p;
    }
    var out = { pieces: pieces }, w = params.get('w');
    if (w && RENAMED[w]) w = RENAMED[w];
    if (w && PROFILES[w]) { out.profile = w; out.weights = copy(PROFILES[w]); }
    else if (w && /^[\d.]+(,[\d.]+){5}$/.test(w)) {
      var values = w.split(',').map(Number);
      if (values.every(function (v) { return Number.isFinite(v) && v <= 100; })) {
        out.profile = 'custom';
        out.weights = {};
        TYPES.forEach(function (type, t) { out.weights[type] = values.slice(t * 2, t * 2 + 2); });
      }
    }
    return out;
  }
  /* What the bag can actually spend on the gear you have, for event points. Forgehammers
     only score as whole mastery steps (to 20, not on epic gear) and mithril only as red
     milestone imbuements, each paid with the XP, hammers and spare mythic gear it needs.
     Steps are taken greedily by the points they spend, so mithril routes come first;
     hammers score the same wherever they go, so the rest only loses part of a step. */
  function spendable(pieces, bag) {
    var now = {}, left = emptyCost(), spent = emptyCost(), steps = 0;
    Object.keys(pieces || {}).forEach(function (id) { now[id] = normalisePiece(pieces[id]); });
    RES.forEach(function (r) { left[r] = number(bag && bag[r], 1e9); });
    for (;;) {
      var best = null;
      Object.keys(now).forEach(function (id) {
        var p = now[id], options = [];
        if (p.quality !== 'epic' && p.mastery < 20) options.push(normalisePiece({ quality: p.quality, level: p.level, mastery: p.mastery + 1 }));
        var next = milestone(p, 'mithril'); if (next) options.push(next);
        options.forEach(function (to) {
          var c = cost(p, to), gain = kvkPoints(c);
          if (!gain || !affordable(c, left)) return;
          var load = RES.reduce(function (sum, r) { return sum + c[r] / Math.max(1, left[r]); }, 0);
          if (!best || gain > best.gain || gain === best.gain && load < best.load) best = { id: id, to: to, cost: c, gain: gain, load: load };
        });
      });
      if (!best) break;
      now[best.id] = best.to; steps++;
      RES.forEach(function (r) { left[r] -= best.cost[r]; spent[r] += best.cost[r]; });
    }
    return { spent: spent, left: left, pieces: now, steps: steps, points: kvkPoints(spent) };
  }
  var api = { XP: XP, CUM: CUM, TYPES: TYPES, SLOTS: SLOTS, RES: RES, KVK_RATES: KVK_RATES, kvkPoints: kvkPoints, spendable: spendable, MILESTONES: MILESTONES, PROFILES: PROFILES, defaults: defaults, normaliseState: normaliseState, normalisePiece: normalisePiece, cap: cap, cost: cost, target: target, milestone: milestone, gap: gap, affordable: affordable, stats: stats, score: score, total: total, redPlans: redPlans, nearbyMilestones: nearbyMilestones, optimise: optimise, strategyComparison: strategyComparison, encodeLink: encodeLink, readLink: readLink, invested: invested, bestSet: bestSet, bestSplit: bestSplit, optimal: optimal, profileFit: profileFit };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HeroGear = api;
})(typeof window !== 'undefined' ? window : globalThis);
