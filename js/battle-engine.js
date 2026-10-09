/* battle-engine.js — the battle model behind the Battle Simulator page.
   Plain ES5, no DOM: the page loads it as a script (window.BattleEngine), the
   sweep worker loads it with importScripts (self.BattleEngine), and the .dsh
   check requires it in Node (module.exports).

   The model is the one the Frakinator simulates (its Theory-crafting tab,
   MATHS.md §6) and the SoS engine it was reverse-engineered from
   (request-laurent/sos.battle Fight.java, KINGSHOT-SOURCES.md §1):

     A_t = base_att_t · (1 + attack%) · (1 + lethality%)
     D_t = base_hea_t · (1 + defense%) · (1 + health%)
     engaged army = √(N_t · N₀),  N₀ = min(total troops of the two sides)
     dead per round = ceil(army · A / D / 100 · (1 − 0.0001 · round))

   Both sides strike at once every round. Each troop type hits the front-most
   enemy type still standing — infantry, then cavalry, then archers. On top
   sit KingShot's troop skills (in-game skill text, KINGSHOT-SOURCES.md):
   every type deals +10% to the type it counters (infantry → cavalry →
   archers → infantry), and from T7 the second skills join in — infantry take
   10% less from cavalry (Bands of Steel), cavalry have a 20% chance a round
   to ride past the infantry onto the archers (Ambusher), archers a 10% chance
   to strike twice (Volley). The two chance skills are why the same fight can
   end differently, and why the sweep simulates many battles per mix. Heroes
   are not modelled — the same omission the Frakinator makes for the four
   hero-less Mystic Trial rooms. */
(function (root) {
  'use strict';

  // ── The troop table (KINGSHOT-SOURCES.md §1, kingshotcalculator.com
  // troop-base-stats) — per type, tier 1–11 × TG 0–5 (tier-major). Defense
  // and lethality are 10 for every troop and cancel out of every ratio, so
  // only attack and health are kept.
  var ATK = [
    [63, 66, 69, 72, 76, 80, 94, 98, 103, 108, 113, 119, 132, 137, 144, 151, 159, 167, 172, 179, 188, 197, 207, 217,
      206, 214, 225, 236, 248, 260, 243, 253, 265, 279, 293, 307, 287, 298, 313, 329, 346, 363, 339, 353, 370, 389, 408, 429,
      400, 416, 437, 459, 482, 506, 472, 491, 515, 541, 568, 597, 566, 589, 618, 649, 681, 716],
    [189, 197, 206, 217, 228, 239, 283, 294, 309, 324, 341, 358, 397, 413, 434, 455, 478, 502, 516, 537, 563, 592, 621, 652,
      619, 644, 676, 710, 745, 782, 730, 759, 797, 837, 879, 923, 862, 896, 941, 988, 1038, 1090, 1017, 1058, 1111, 1166, 1224, 1286,
      1200, 1248, 1310, 1376, 1445, 1517, 1416, 1473, 1546, 1624, 1705, 1790, 1699, 1767, 1855, 1948, 2045, 2148],
    [252, 262, 275, 289, 303, 319, 378, 393, 413, 433, 455, 478, 529, 550, 578, 607, 637, 669, 688, 716, 751, 789, 828, 870,
      825, 858, 901, 946, 993, 1043, 974, 1013, 1064, 1117, 1173, 1231, 1149, 1195, 1255, 1317, 1383, 1452, 1356, 1410, 1481, 1555, 1633, 1714,
      1600, 1664, 1747, 1835, 1926, 2023, 1888, 1964, 2062, 2165, 2273, 2387, 2266, 2357, 2474, 2598, 2728, 2865]
  ];
  var HEA = [
    [189, 197, 206, 217, 228, 239, 283, 294, 309, 324, 341, 358, 397, 413, 434, 455, 478, 502, 516, 537, 563, 592, 621, 652,
      619, 644, 676, 710, 745, 782, 730, 759, 797, 837, 879, 923, 862, 896, 941, 988, 1038, 1090, 1017, 1058, 1111, 1166, 1224, 1286,
      1200, 1248, 1310, 1376, 1445, 1517, 1416, 1473, 1546, 1624, 1705, 1790, 1699, 1767, 1855, 1948, 2045, 2148],
    [63, 66, 69, 72, 76, 80, 94, 98, 103, 108, 113, 119, 132, 137, 144, 151, 159, 167, 172, 179, 188, 197, 207, 217,
      206, 214, 225, 236, 248, 260, 243, 253, 265, 279, 293, 307, 287, 298, 313, 329, 346, 363, 339, 353, 370, 389, 408, 429,
      400, 416, 437, 459, 482, 506, 472, 491, 515, 541, 568, 597, 566, 589, 618, 649, 681, 716],
    [47, 49, 51, 54, 57, 59, 71, 74, 78, 81, 85, 90, 99, 103, 108, 114, 119, 125, 129, 134, 141, 148, 155, 163,
      155, 161, 169, 178, 187, 196, 183, 190, 200, 210, 220, 231, 215, 224, 235, 247, 259, 272, 254, 264, 277, 291, 306, 321,
      300, 312, 328, 344, 361, 379, 354, 368, 387, 406, 426, 448, 390, 406, 426, 447, 470, 493]
  ];
  var TIERS = 11, TGS = 6;

  function row(tier, tg) {
    tier = Math.min(TIERS, Math.max(1, tier | 0));
    tg = Math.min(TGS - 1, Math.max(0, tg | 0));
    return (tier - 1) * TGS + tg;
  }
  function baseAtk(t, tier, tg) { return ATK[t][row(tier, tg)]; }
  function baseHea(t, tier, tg) { return HEA[t][row(tier, tg)]; }

  // The second troop skill arrives with the T7 troops. The same line the
  // Frakinator draws for the archers' extra ×1.1 ("T>6 and TG3+"), kept
  // identical to the bear panel's rule so the two can never disagree.
  function hasSecondSkill(tier, tg) { return tier >= 7 || tg >= 3; }

  var COUNTER = 1.1;        // +10% damage to the type you counter
  var BANDS = 1.1;          // infantry: +10% defence against cavalry
  var AMBUSH = 0.2;         // cavalry: chance a round to strike the archers
  var VOLLEY = 0.1;         // archers: chance a round to strike twice
  var FATIGUE = 0.0001;     // −0.01% per round (Fight.java)
  var MAX_ROUNDS = 3000;

  // Countered type per attacker: infantry beats cavalry, cavalry beats
  // archers, archers beat infantry.
  var BEATS = [1, 2, 0];

  function pos(x) { x = +x; return isFinite(x) && x > 0 ? x : 0; }

  // A side, as typed: counts, tier/TG and the four Bonus Details stats per
  // type. Returns the fighting numbers the round loop needs.
  function prepare(side) {
    var f = { n: [0, 0, 0], A: [0, 0, 0], D: [0, 0, 0], s2: [false, false, false] };
    for (var t = 0; t < 3; t++) {
      var tier = (side.tier && side.tier[t]) || 10;
      var tg = (side.tg && side.tg[t]) || 0;
      f.n[t] = Math.floor(pos(side.n && side.n[t]));
      f.A[t] = baseAtk(t, tier, tg) * (1 + pos(side.atk && side.atk[t]) / 100) * (1 + pos(side.let && side.let[t]) / 100);
      f.D[t] = baseHea(t, tier, tg) * (1 + pos(side.def && side.def[t]) / 100) * (1 + pos(side.hea && side.hea[t]) / 100);
      f.s2[t] = hasSecondSkill(tier, tg);
    }
    return f;
  }

  // Seeded generator (mulberry32): the same inputs give the same answer, so
  // a re-run or a shared link never contradicts the last one.
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Is any chance skill live? If not, every battle of this match-up is the
  // same battle and one simulation is the whole answer.
  function random(a, b) {
    return (a.s2[1] && a.n[1] > 0) || (a.s2[2] && a.n[2] > 0) ||
      (b.s2[1] && b.n[1] > 0) || (b.s2[2] && b.n[2] > 0);
  }

  function strike(att, def, nAtt, nDef, armyMin, round, rand, kills) {
    var fatigue = 1 - FATIGUE * round;
    for (var t = 0; t < 3; t++) {
      var n = nAtt[t];
      if (n <= 0) continue;
      var target = nDef[0] > 0 ? 0 : nDef[1] > 0 ? 1 : nDef[2] > 0 ? 2 : -1;
      if (target < 0) return;
      if (t === 1 && att.s2[1] && target === 0 && nDef[2] > 0 && rand() < AMBUSH) target = 2;
      var a = att.A[t] * (BEATS[t] === target ? COUNTER : 1);
      var d = def.D[target] * (t === 1 && target === 0 && def.s2[0] ? BANDS : 1);
      if (d <= 0) continue;
      var dead = Math.ceil(Math.sqrt(n * armyMin) * a / d / 100 * fatigue);
      if (t === 2 && att.s2[2] && rand() < VOLLEY) dead *= 2;
      kills[target] += dead;
    }
  }

  // One battle, attacker a against defender b. Returns who is left.
  function battle(a, b, rand) {
    var na = a.n.slice(), nb = b.n.slice();
    var totA = na[0] + na[1] + na[2], totB = nb[0] + nb[1] + nb[2];
    var armyMin = Math.min(totA, totB);
    var round = 0;
    if (totA > 0 && totB > 0) {
      var ka = [0, 0, 0], kb = [0, 0, 0];
      while (round < MAX_ROUNDS) {
        round++;
        ka[0] = ka[1] = ka[2] = kb[0] = kb[1] = kb[2] = 0;
        strike(a, b, na, nb, armyMin, round, rand, kb);
        strike(b, a, nb, na, armyMin, round, rand, ka);
        totA = totB = 0;
        for (var t = 0; t < 3; t++) {
          na[t] = Math.max(0, na[t] - ka[t]);
          nb[t] = Math.max(0, nb[t] - kb[t]);
          totA += na[t];
          totB += nb[t];
        }
        if (totA === 0 || totB === 0) break;
      }
    }
    return { win: totB === 0 && totA > 0, rounds: round, a: na, b: nb };
  }

  // Many battles of one match-up: the win chance and the mean survivors.
  function run(sideA, sideB, battles, seed) {
    var a = prepare(sideA), b = prepare(sideB);
    var count = random(a, b) ? Math.max(1, battles | 0) : 1;
    var rand = rng(seed || 1);
    var wins = 0, rounds = 0, la = [0, 0, 0], lb = [0, 0, 0];
    for (var i = 0; i < count; i++) {
      var r = battle(a, b, rand);
      if (r.win) wins++;
      rounds += r.rounds;
      for (var t = 0; t < 3; t++) { la[t] += r.a[t]; lb[t] += r.b[t]; }
    }
    for (var k = 0; k < 3; k++) { la[k] /= count; lb[k] /= count; }
    return {
      win: wins / count, rounds: rounds / count, a: la, b: lb,
      startA: a.n.slice(), startB: b.n.slice(), battles: count, random: count > 1
    };
  }

  // Every mix on a grid of `step`, inside the infantry/cavalry windows,
  // for a march of `total` troops. Fractions are rounded to the step so the
  // grid is exact; archers take the remainder.
  function grid(opts) {
    var step = Math.max(0.01, +opts.step || 0.05);
    var k = Math.round(1 / step);
    var out = [];
    for (var i = 0; i <= k; i++) {
      for (var j = 0; i + j <= k; j++) {
        var fi = i / k, fc = j / k;
        if (fi < (opts.minInf || 0) - 1e-9 || fi > (opts.maxInf == null ? 1 : opts.maxInf) + 1e-9) continue;
        if (fc < (opts.minCav || 0) - 1e-9 || fc > (opts.maxCav == null ? 1 : opts.maxCav) + 1e-9) continue;
        out.push([i, j, k - i - j]);
      }
    }
    return { k: k, cells: out };
  }

  function split(total, cell, k) {
    var ni = Math.round(total * cell[0] / k), nc = Math.round(total * cell[1] / k);
    return [ni, nc, Math.max(0, total - ni - nc)];
  }

  // The sweep: every mix of your march against the same opponent. `onCell`
  // (optional) is called after each mix, so a caller can report progress.
  function sweep(sideA, sideB, opts, onCell) {
    var g = grid(opts);
    var total = Math.floor(pos(opts.total));
    var res = [];
    for (var c = 0; c < g.cells.length; c++) {
      var cell = g.cells[c];
      var a = {
        n: split(total, cell, g.k), tier: sideA.tier, tg: sideA.tg,
        atk: sideA.atk, let: sideA.let, def: sideA.def, hea: sideA.hea
      };
      var r = run(a, sideB, opts.battles, (opts.seed || 1) + c * 7919);
      res.push({ cell: cell, f: [cell[0] / g.k, cell[1] / g.k, cell[2] / g.k], n: a.n, win: r.win, left: r.a[0] + r.a[1] + r.a[2], foe: r.b[0] + r.b[1] + r.b[2], rounds: r.rounds });
      if (onCell) onCell(c + 1, g.cells.length);
    }
    return { k: g.k, total: total, cells: res };
  }

  // The best mix: highest win chance, then the most troops left standing,
  // then the fewest enemies left (for a mix that cannot win yet).
  function best(cells) {
    var top = null;
    cells.forEach(function (c) {
      if (!top || c.win > top.win + 1e-9 ||
        (Math.abs(c.win - top.win) <= 1e-9 && (c.left > top.left || (c.left === top.left && c.foe < top.foe)))) top = c;
    });
    return top;
  }

  // A stable seed from the inputs, so identical fights share one answer.
  function seedOf(obj) {
    var s = JSON.stringify(obj), h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  var api = {
    TIERS: TIERS, TGS: TGS,
    baseAtk: baseAtk, baseHea: baseHea, hasSecondSkill: hasSecondSkill,
    prepare: prepare, battle: battle, run: run, grid: grid, sweep: sweep, best: best,
    rng: rng, seedOf: seedOf
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BattleEngine = api;
})(typeof self !== 'undefined' ? self : this);
