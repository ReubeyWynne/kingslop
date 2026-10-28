(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../_data/seasonal/halloween_party.json'));
  else root.Halloween = factory(root.SeasonalData);
})(typeof window === 'object' ? window : globalThis, function (data) {
  'use strict';
  var r = data.rules, tracks = ['free', 'witchbane', 'pranksterbane'];
  function blank() {
    var out = {};
    ['points', 'candy', 'todayPoints', 'gatheringCollected', 'beastsCollected', 'topUpPoints', 'daysLeft', 'doorDaysLeft', 'kingdomDay', 'pity', 'pumpkinRemaining', 'witchRemaining', 'townCenter'].forEach(function (key) { out[key] = null; });
    out.packs = Array(7).fill(null); out.tracks = [null, null]; out.claimedPass = [null, null, null]; out.missions = Array(7).fill(null);
    return out;
  }
  function plan() { return { target: r.skinPoints, gems: 0, speedupMinutes: 0, gathering: 0, beasts: 0, doors: 0, other: 0, packs: Array(7).fill(0), tracks: [false, false], missions: Array(7).fill(0), currency: 'USD' }; }
  function integer(n, max) { return Number.isSafeInteger(n) && n >= 0 && n <= max; }
  function assert(ok) { if (!ok) throw new Error('Invalid seasonal plan'); }
  function validate(facts, p) {
    assert(integer(p.target, 10000000) && p.target > 0);
    ['gems', 'speedupMinutes', 'other'].forEach(function (key) { assert(integer(p[key], 10000000)); });
    assert(integer(p.gathering, r.gatheringCap) && integer(p.beasts, r.beastCap) && integer(p.doors, 7));
    assert(['USD', 'EUR'].includes(p.currency));
    assert(Array.isArray(p.packs) && p.packs.length === 7 && p.packs.every(function (n, i) { return integer(n, i === 6 ? 3 : 1); }));
    assert(Array.isArray(p.tracks) && p.tracks.length === 2 && p.tracks.every(function (n) { return typeof n === 'boolean'; }));
    assert(Array.isArray(p.missions) && p.missions.length === 7 && p.missions.every(function (n) { return integer(n, 5); }));
    assert(facts && Array.isArray(facts.packs) && Array.isArray(facts.missions));
  }
  function variant(day, tc) { if (day === null || (day >= 70 && tc === null)) return null; if (tc !== undefined && tc < 30) return data.passVariants[0]; return data.passVariants.filter(function (v) { return v.fromDay <= day; }).slice(-1)[0] || data.passVariants[0]; }
  function missions(day) {
    return Array.from({ length: 7 }, function (_, i) { return data.missions.filter(function (m) { return m.stage === i + 1 && m.fromDay <= (day || 1); }).slice(-1)[0]; });
  }
  function sumCandy(n) { return data.milestoneCandy.slice(0, n).reduce(function (a, b) { return a + b; }, 0); }
  function doorDaily() {
    var d = data.doors, average = function (h) { return h.candy.reduce(function (n, v) { return n + v.amount * v.chance / 100; }, 0) + h.rainChance * d.candyRainAverage; };
    var own = d.houses.reduce(function (n, h) { return n + h.weight / 100 * (average(h) + h.visitors * d.sharePerVisitor); }, 0);
    var shared = d.houses.filter(function (h) { return h.visitors > 0; }), weight = shared.reduce(function (n, h) { return n + h.weight; }, 0);
    return own + 2 * shared.reduce(function (n, h) { return n + h.weight / weight * average(h); }, 0);
  }
  function packPlan(f, p) {
    var candy = 0, cents = 0, topUp = 0, errors = [], rewards = {};
    data.packs.forEach(function (pack, i) {
      var n = p.packs[i], owned = f.packs[i];
      if (!n) return;
      if (owned === null) errors.push('packUnknown');
      else if (owned + n > (pack.purchaseLimit || 1)) errors.push('packLimit');
      if (f.packs.slice(0, i).some(function (v, j) { return v === null || v + p.packs[j] < 1; })) errors.push('packOrder');
      candy += pack.candy * n; cents += Math.round(pack['price' + p.currency] * 100) * n; topUp += pack.topUpPoints * n;
      pack.items.forEach(function (item) { add(rewards, item.name, item.amount * n); });
    });
    data.passes.forEach(function (pass, i) {
      if (!p.tracks[i]) return;
      if (f.tracks[i] === null) errors.push('trackUnknown');
      else if (f.tracks[i]) errors.push('trackOwned');
      cents += Math.round(pass['price' + p.currency] * 100); topUp += pass.topUpPoints;
    });
    return { candy: candy, cents: cents, topUp: topUp, errors: Array.from(new Set(errors)), rewards: rewards };
  }
  function budget(f, p) {
    validate(f, p);
    var packs = packPlan(f, p), lines = [], missing = [], errors = packs.errors.slice();
    function line(id, amount, estimate) { lines.push({ id: id, candy: amount, estimate: Boolean(estimate) }); }
    line('held', f.candy || 0); if (f.candy === null) missing.push('candy');
    line('gems', Math.floor(p.gems / r.conversions.gemsPerTenCandy) * 10);
    line('speedups', Math.floor(p.speedupMinutes * 60 / r.conversions.speedupSecondsPerTenCandy) * 10);
    ['gathering', 'beasts'].forEach(function (key) {
      var collected = f[key + 'Collected'], cap = r[key === 'beasts' ? 'beastCap' : 'gatheringCap'];
      if (p[key] && collected === null) missing.push(key); else line(key, Math.min(p[key], cap - Math.min(cap, collected || 0)));
    });
    if (p.doors > (f.doorDaysLeft === null ? 7 : f.doorDaysLeft)) errors.push('doorLimit');
    if (p.doors && f.doorDaysLeft === null) missing.push('doors'); else line('doors', Math.round(p.doors * doorDaily()), true);
    var missionCandy = 0;
    p.missions.forEach(function (n, i) { if (!n) return; if (f.missions[i] === null) missing.push('missions'); else missionCandy += Math.max(0, sumCandy(n) - sumCandy(f.missions[i])); });
    line('missions', missionCandy); line('packs', packs.candy); line('other', p.other);
    var pointGap = f.points === null ? null : Math.max(0, p.target - f.points);
    if (f.points === null) missing.push('points');
    if (f.daysLeft === null) missing.push('daysLeft');
    if (f.daysLeft === 0) errors.push('ended');
    if (f.daysLeft !== null && p.doors > f.daysLeft) errors.push('doorLimit');
    p.missions.forEach(function (n, i) { if (f.daysLeft !== null && i + 1 < 9 - f.daysLeft && f.missions[i] !== null && n > f.missions[i]) errors.push('missionClosed'); });
    return { lines: lines, total: lines.reduce(function (n, v) { return n + v.candy; }, 0), estimated: lines.some(function (v) { return v.estimate && v.candy; }), pointGap: pointGap, paidCandy: pointGap === null ? null : Math.ceil(pointGap / r.attackPoints) * r.attackCandy, missing: Array.from(new Set(missing)), errors: errors, packs: packs };
  }
  function pityChance(n) { return n <= r.pity.flatThrough ? r.pity.base : n >= r.pity.certainAt ? 1 : Math.min(1, r.pity.base + r.pity.step * (n - r.pity.flatThrough)); }
  function add(out, name, amount) { out[name] = (out[name] || 0) + amount; }
  function rng(seed) { var n = seed >>> 0; return function () { n += 0x6D2B79F5; var t = Math.imul(n ^ n >>> 15, 1 | n); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function pick(list, random) { var n = random() * 100; for (var i = 0; i < list.length; i++) { n -= list[i].chance; if (n < 0) return list[i]; } return list[list.length - 1]; }
  function simulate(f, p, seed) {
    var b = budget(f, p); assert(!b.errors.length && f.points !== null && f.candy !== null && f.daysLeft > 0);
    var random = rng(seed), candy = b.total, points = f.points, pity = f.pity || 0, pumpkin = f.pumpkinRemaining || r.pumpkinHits, witch = f.witchRemaining || 0, free = 0, hits = 0, reward = {}, passCandy = 0;
    var v = variant(f.kingdomDay, f.townCenter), claims = f.claimedPass.slice(), active = [true, f.tracks[0] === true || p.tracks[0], f.tracks[1] === true || p.tracks[1]];
    var missing = b.missing.slice();
    if (!v && active.some(Boolean)) missing.push('passVariant');
    if (v && active.some(function (on, i) { return on && claims[i] === null; })) missing.push('passClaims');
    function pass() {
      if (!v) return;
      tracks.forEach(function (track, i) {
        if (!active[i]) return;
        if (claims[i] === null) return;
        while (claims[i] < data.passThresholds.length && points >= data.passThresholds[claims[i]]) {
          v.levels[claims[i]][track].forEach(function (item) { if (item.name === 'Halloween Candy') { candy += item.amount; passCandy += item.amount; } else add(reward, item.name, item.amount); });
          claims[i]++;
        }
      });
    }
    pass();
    while ((candy >= r.attackCandy || free > 0) && hits < 100000) {
      var paid = !free;
      if (paid) candy -= r.attackCandy; else free--;
      points += r.attackPoints; hits++;
      var pool = witch ? data.chests.witch : data.chests.pumpkin;
      var item = pick(pool, random); add(reward, item.name, item.amount);
      if (witch) witch--; else if (!--pumpkin) {
        var kill = pick(data.chests.pumpkinKill, random); add(reward, kill.name, kill.amount); pumpkin = r.pumpkinHits;
        if (random() < r.witchChance) witch = pick(data.witchHits, random).hits;
      }
      if (paid && random() < pityChance(++pity)) { free += pick(data.freeAttacks, random).attacks; pity = 0; }
      pass();
    }
    return { points: points, hits: hits, candy: candy, rewards: reward, passCandy: passCandy, missing: Array.from(new Set(missing)), truncated: hits >= 100000 };
  }
  function forecast(f, p, samples) {
    samples = samples || 200; assert(integer(samples, 1000) && samples >= 10);
    var runs = [], rewards = {}, passCandy = 0, wins = 0, missing = [], truncated = false;
    for (var i = 0; i < samples; i++) {
      var run = simulate(f, p, 20261028 + i * 7919); runs.push(run.points); passCandy += run.passCandy; missing = run.missing; truncated = truncated || run.truncated;
      if (run.points >= p.target) wins++;
      Object.keys(run.rewards).forEach(function (key) { add(rewards, key, run.rewards[key] / samples); });
    }
    runs.sort(function (a, b) { return a - b; });
    return { low: runs[Math.floor(samples * .1)], median: runs[Math.floor(samples * .5)], high: runs[Math.floor(samples * .9)], chance: wins / samples, rewards: rewards, passCandy: passCandy / samples, missing: missing, truncated: truncated, samples: samples };
  }
  function incrementalRewards(f, p) {
    var b = budget(f, p), rewards = Object.assign({}, b.packs.rewards);
    p.missions.forEach(function (n, i) { if (f.missions[i] !== null) for (var j = f.missions[i]; j < n; j++) data.missionRewards[j].filter(function (v) { return v.name !== 'Halloween Candy'; }).forEach(function (v) { add(rewards, v.name, v.amount); }); });
    if (f.topUpPoints !== null) data.topUps.filter(function (t) { return t.points > f.topUpPoints && t.points <= f.topUpPoints + b.packs.topUp; }).forEach(function (t) { t.rewards.forEach(function (v) { add(rewards, v.name, v.amount); }); });
    return rewards;
  }
  function rewardMean(pool) {
    var out = {};
    pool.forEach(function (item) { add(out, item.name, item.amount * item.chance / 100); });
    return out;
  }
  function candyValue(candy, options) {
    options = options || {}; assert(integer(candy, 2000000));
    var samples = options.samples || Math.min(2000, Math.max(100, Math.floor(1500000 / (Math.floor(candy / r.attackCandy) + 1))));
    assert(integer(samples, 4000) && samples >= 10);
    var passList = options.passes || [], startPoints = options.points || 0;
    passList.forEach(function (pass) { assert(tracks.includes(pass.track) && data.passVariants.some(function (v) { return v.id === pass.variant; }) && integer(pass.claimed, 21)); });
    var totals = { pumpkin: 0, pumpkinKill: 0, witch: 0 }, passRewards = {}, points = 0, freeHits = 0, passCandy = 0, finishes = [];
    for (var sample = 0; sample < samples; sample++) {
      var random = rng(20261028 + sample * 7919), remaining = candy, pity = options.pity || 0, pumpkin = options.pumpkinRemaining || r.pumpkinHits, witch = options.witchRemaining || 0;
      var free = 0, hits = 0, claimed = passList.map(function (p) { return p.claimed; });
      function claimPasses() {
        passList.forEach(function (pass, index) {
          var v = data.passVariants.find(function (entry) { return entry.id === pass.variant; });
          while (claimed[index] < data.passThresholds.length && startPoints + hits * r.attackPoints >= data.passThresholds[claimed[index]]) {
            v.levels[claimed[index]][pass.track].forEach(function (item) {
              if (item.name === I_NAME) { remaining += item.amount; passCandy += item.amount / samples; }
              else add(passRewards, item.name, item.amount / samples);
            });
            claimed[index]++;
          }
        });
      }
      if (passList.length) claimPasses();
      while (remaining >= r.attackCandy || free > 0) {
        var paid = free === 0;
        if (paid) remaining -= r.attackCandy; else { free--; freeHits += 1 / samples; }
        hits++;
        if (witch) { totals.witch += 1 / samples; witch--; }
        else {
          totals.pumpkin += 1 / samples;
          if (!--pumpkin) { totals.pumpkinKill += 1 / samples; pumpkin = r.pumpkinHits; if (random() < r.witchChance) witch = pick(data.witchHits, random).hits; }
        }
        if (paid && random() < pityChance(++pity)) { free += pick(data.freeAttacks, random).attacks; pity = 0; }
        if (passList.length) claimPasses();
      }
      points += hits * r.attackPoints / samples; finishes.push(hits * r.attackPoints);
    }
    var rewards = Object.assign({}, passRewards);
    Object.keys(totals).forEach(function (chest) { var mean = rewardMean(data.chests[chest]); Object.keys(mean).forEach(function (name) { add(rewards, name, mean[name] * totals[chest]); }); });
    finishes.sort(function (a, b) { return a - b; });
    return { candy: candy, points: points, hits: points / r.attackPoints, freeHits: freeHits, rewards: rewards, passCandy: passCandy, chests: totals, low: finishes[Math.floor(samples * .1)], high: finishes[Math.floor(samples * .9)], samples: samples };
  }
  var I_NAME = 'Halloween Candy';
  function futureIncome(input) {
    var out = { candy: 0, rewards: {}, lines: [] };
    function line(id, amount, estimate) { assert(Number.isFinite(amount) && amount >= 0); out.lines.push({ id: id, candy: amount, estimate: Boolean(estimate) }); out.candy += amount; }
    ['doors', 'gathering', 'beasts', 'gems', 'speedupMinutes', 'other', 'eventDay', 'missionTarget'].forEach(function (key) { assert(integer(input[key], key === 'eventDay' ? 8 : key === 'missionTarget' ? 5 : 10000000)); });
    assert(input.doors <= 7 && input.gathering <= r.gatheringCap && input.beasts <= r.beastCap);
    assert(input.missionClaimed === null || integer(input.missionClaimed, 5));
    line('doors', Math.round(input.doors * doorDaily()), true); line('gathering', input.gathering); line('beasts', input.beasts);
    line('gems', Math.floor(input.gems / r.conversions.gemsPerTenCandy) * 10);
    line('speedups', Math.floor(input.speedupMinutes * 60 / r.conversions.speedupSecondsPerTenCandy) * 10);
    var missionCandy = 0;
    if (input.eventDay) {
      for (var day = input.eventDay; day <= 7; day++) {
        var first = day === input.eventDay ? input.missionClaimed : 0;
        if (first === null) continue;
        for (var milestone = first; milestone < input.missionTarget; milestone++) {
          missionCandy += data.milestoneCandy[milestone];
          data.missionRewards[milestone].filter(function (item) { return item.name !== I_NAME; }).forEach(function (item) { add(out.rewards, item.name, item.amount); });
        }
      }
    }
    line('missions', missionCandy); line('other', input.other); return out;
  }
  function mergeRewards(a, b) { var out = Object.assign({}, a); Object.keys(b).forEach(function (key) { add(out, key, b[key]); }); return out; }
  function purchaseSequence(next, selected, lastRemaining) {
    assert(integer(next, 7) && integer(lastRemaining, 3)); assert(Array.isArray(selected) && selected.length === 7 && selected.every(function (n, i) { return integer(n, i === 6 ? 3 : 1); }));
    var counts = selected.slice(), highest = -1;
    counts.forEach(function (n, i) { if (n) highest = i; if (i < next) counts[i] = 0; });
    for (var i = next; i < highest; i++) counts[i] = 1;
    counts[6] = Math.min(counts[6], next === 6 ? lastRemaining : 3);
    return counts;
  }
  return { candyValue: candyValue, futureIncome: futureIncome, mergeRewards: mergeRewards, purchaseSequence: purchaseSequence, data: data, blank: blank, plan: plan, budget: budget, packPlan: packPlan, variant: variant, missions: missions, doorDaily: doorDaily, pityChance: pityChance, simulate: simulate, forecast: forecast, incrementalRewards: incrementalRewards };
});
