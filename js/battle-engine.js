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
     dead per round = ceil(army · A / D / 100 · SkillMod · (1 − 0.0001 · round))

   Both sides strike at once every round. Each troop type hits the front-most
   enemy type still standing — infantry, then cavalry, then archers. On top
   sit KingShot's troop skills (in-game skill text, KINGSHOT-SOURCES.md):
   every type deals +10% to the type it counters (infantry → cavalry →
   archers → infantry), and from T7 the second skills join in — infantry take
   10% less from cavalry (Bands of Steel), cavalry have a 20% chance a round
   to ride past the infantry onto the archers (Ambusher), archers a 10% chance
   to strike twice (Volley). The two chance skills are why the same fight can
   end differently, and why the sweep simulates many battles per mix.

   Truegold troops add their own chance skills from TG3, stronger from TG5
   and TG8 (_data/combat.json troopSkills, KINGSHOT-SOURCES.md, KingShot
   Battle Helper). Heroes and joiners enter as `side.skills`, already turned
   into effects by js/combat.js. Their codes fall into four families, and one
   hit's SkillMod is
     (damage up × enemy defence down) ÷ (their defence up × their damage down)
   where each family multiplies its codes' (1 + summed % / 100). A side with
   no skills and no Truegold troops fights exactly as before. */
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
  var TIERS = 11, TGS = 6, MAX_TG = 8;
  // TG6–TG8 are not in the table: TG0 × the step's multiplier, the KingShot
  // Battle Helper's rule (_data/combat.json tgStatMultiplier, unverified).
  var TG_HIGH = [1.328, 1.395, 1.464];

  function row(tier, tg) {
    tier = Math.min(TIERS, Math.max(1, tier | 0));
    tg = Math.min(TGS - 1, Math.max(0, tg | 0));
    return (tier - 1) * TGS + tg;
  }
  function stat(table, t, tier, tg) {
    tg = Math.min(MAX_TG, Math.max(0, tg | 0));
    return tg < TGS ? table[t][row(tier, tg)] : Math.round(table[t][row(tier, 0)] * TG_HIGH[tg - TGS]);
  }
  function baseAtk(t, tier, tg) { return stat(ATK, t, tier, tg); }
  function baseHea(t, tier, tg) { return stat(HEA, t, tier, tg); }

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

  // Truegold troop skills (_data/combat.json troopSkills). Each is rolled once
  // a round per troop type: infantry may take less damage, cavalry may deal
  // double, archers may deal half again more. TG8 adds a flat 4% (infantry
  // defence, archer attack), a second chance for cavalry to take half
  // damage, and tops up the infantry and archer rolls.
  var TRUEGOLD = {
    inf: [[3, 0.25, 0.36], [5, 0.375, 0.36]], infTg8: 0.10,
    cav: [[3, 0.10, 1.00], [5, 0.15, 1.00]], cavTg8: [0.10, 0.50],
    arc: [[3, 0.20, 0.50], [5, 0.30, 0.50]], arcTg8: 0.25,
    flatTg8: 4
  };
  function truegoldStep(steps, tg) {
    return tg >= steps[1][0] ? steps[1] : tg >= steps[0][0] ? steps[0] : null;
  }

  // Countered type per attacker: infantry beats cavalry, cavalry beats
  // archers, archers beat infantry.
  var BEATS = [1, 2, 0];

  function pos(x) { x = +x; return isFinite(x) && x > 0 ? x : 0; }

  // A side, as typed: counts, tier/TG and the four Bonus Details stats per
  // type. Returns the fighting numbers the round loop needs.
  function prepare(side) {
    var f = { n: [0, 0, 0], A: [0, 0, 0], D: [0, 0, 0], s2: [false, false, false], tg: [0, 0, 0] };
    var gold = side.truegold !== false;
    for (var t = 0; t < 3; t++) {
      var tier = (side.tier && side.tier[t]) || 10;
      var tg = Math.min(MAX_TG, Math.max(0, (side.tg && side.tg[t]) | 0));
      var flat = gold && tg >= 8 ? TRUEGOLD.flatTg8 : 0;
      f.n[t] = Math.floor(pos(side.n && side.n[t]));
      f.A[t] = baseAtk(t, tier, tg) * (1 + (pos(side.atk && side.atk[t]) + (t === 2 ? flat : 0)) / 100) * (1 + pos(side.let && side.let[t]) / 100);
      f.D[t] = baseHea(t, tier, tg) * (1 + (pos(side.def && side.def[t]) + (t === 0 ? flat : 0)) / 100) * (1 + pos(side.hea && side.hea[t]) / 100);
      f.s2[t] = hasSecondSkill(tier, tg);
      f.tg[t] = gold ? tg : 0;
    }
    f.skills = compile(side.skills);
    f.dodge = Math.min(1, f.skills.reduce(function (sum, sk) { return sum + (sk.special === 'dodge' ? pos(sk.dodgePct) / 100 : 0); }, 0));
    f.gold = f.tg.some(function (tg, i) { return tg >= 3 && f.n[i] > 0; });
    f.live = f.skills.length > 0 || f.gold;
    f.cache = {};
    return f;
  }

  // ── Skills ────────────────────────────────────────────
  // A skill as js/combat.js hands it over: { kind, chance, every, offset,
  // turns, special, dodgePct, effects: [{ code, pct, troops, vs }] }, troops
  // and vs as type indexes. The family of a code: 10x damage up, 11x defence
  // up, 20x enemy damage down, 21x enemy defence down.
  function family(code) { return (code >= 200 ? 2 : 0) + (code % 100 >= 10 ? 1 : 0); }
  function mask(list) {
    if (!list) return null;
    var m = [false, false, false];
    list.forEach(function (i) { m[i] = true; });
    return m;
  }
  function compile(list) {
    return (list || []).map(function (sk) {
      var vsTerror = sk.special === 'vsTerror';
      var fx = (sk.effects || []).map(function (e) {
        return { code: e.code, fam: family(e.code), pct: +e.pct || 0, troops: mask(e.troops) || [true, true, true], vs: mask(e.vs), vsTerror: vsTerror };
      });
      return {
        kind: sk.kind || 'passive', chance: pos(sk.chance), every: Math.max(1, sk.every | 0), offset: sk.offset | 0,
        turns: Math.max(0, sk.turns | 0), special: sk.special || '', dodgePct: sk.dodgePct, fx: fx,
        on: [0, 1, 2].map(function (t) { return fx.some(function (e) { return e.troops[t]; }); })
      };
    }).filter(function (sk) { return sk.fx.length || sk.special === 'dodge'; });
  }

  // One family's factor for a hit: (1 + summed % / 100) per code, multiplied
  // across codes. `own` is the troop type the effect must cover, `enemy` the
  // type it must be aimed at when it names one.
  function factor(fx, fam, own, enemy, terror) {
    var sums = null;
    for (var i = 0; i < fx.length; i++) {
      var e = fx[i];
      if (e.fam !== fam || !e.troops[own] || (e.vs && !e.vs[enemy]) || (e.vsTerror && !terror)) continue;
      sums = sums || {};
      sums[e.code] = (sums[e.code] || 0) + e.pct;
    }
    var f = 1;
    for (var code in sums) f *= 1 + sums[code] / 100;
    return f;
  }

  // A side's state for one round: the effects live this round, the Truegold
  // rolls, and what the enemy's hits left on each of its troop types.
  function roundState() {
    return { timed: [], pity: {}, out: [1, 1, 1], inc: [1, 1, 1], hurt: [0, 0, 0], terror: [0, 0, 0], F: null, FT: null };
  }

  // Every family factor for this round's effects, by [family][own][enemy],
  // once a round rather than once a hit. FT is the same against a
  // terrorised target, kept only when a terror skill is live.
  function table() { return [0, 1, 2, 3].map(function () { return [[1, 1, 1], [1, 1, 1], [1, 1, 1]]; }); }
  function fill(F, fx, terror) {
    for (var fam = 0; fam < 4; fam++)
      for (var own = 0; own < 3; own++)
        for (var en = 0; en < 3; en++) F[fam][own][en] = factor(fx, fam, own, en, terror);
  }

  // Start of a round: passives, per-round and pity rolls, every-N skills, and
  // whatever an earlier round's skill still holds. round counts from 1; the
  // every-N skills count from 0 the way the helper's engine does.
  function begin(f, st, round, rand) {
    var fx = [], key = '';
    st.timed = st.timed.filter(function (x) { return x.until >= round; });
    st.timed.forEach(function (x) { if (x.from <= round) { push(fx, x.fx); key += x.id + ','; } });
    for (var i = 0; i < f.skills.length; i++) {
      var sk = f.skills[i], on = false;
      if (sk.special === 'dodge' || sk.kind === 'perAttack') continue;
      if (sk.kind === 'passive') on = true;
      else if (sk.kind === 'perRound') on = rand() < sk.chance;
      else if (sk.kind === 'everyN') on = (round - 1) % sk.every === sk.offset;
      else if (sk.kind === 'pity') {
        var fails = st.pity[i] || 0;
        on = rand() < Math.min(1, sk.chance * (1 + fails));
        st.pity[i] = on ? 0 : fails + 1;
      }
      if (!on) continue;
      push(fx, sk.fx);
      key += i + ',';
      if (sk.turns > 1) st.timed.push({ id: 't' + i, fx: sk.fx, from: round + 1, until: round + sk.turns - 1 });
    }
    // The same effects make the same tables, and rounds repeat a few
    // combinations, so each is built once a match-up and kept on the side.
    var hit = f.cache[key];
    if (!hit) {
      hit = f.cache[key] = { F: table(), FT: null };
      fill(hit.F, fx, false);
      if (fx.some(function (e) { return e.vsTerror; })) fill(hit.FT = table(), fx, true);
    }
    st.F = hit.F;
    st.FT = hit.FT;
    st.hurt[0] = st.hurt[1] = st.hurt[2] = 0;
    for (var t = 0; t < 3; t++) {
      st.out[t] = 1;
      st.inc[t] = 1;
      var tg = f.tg[t];
      if (tg < 3) continue;
      if (t === 0) {
        var inf = truegoldStep(TRUEGOLD.inf, tg);
        if (rand() < inf[1]) st.inc[0] = 1 - inf[2] - (tg >= 8 ? TRUEGOLD.infTg8 : 0);
      } else if (t === 1) {
        var cav = truegoldStep(TRUEGOLD.cav, tg);
        if (rand() < cav[1]) st.out[1] = 1 + cav[2];
        if (tg >= 8 && rand() < TRUEGOLD.cavTg8[0]) st.inc[1] = 1 - TRUEGOLD.cavTg8[1];
      } else {
        var arc = truegoldStep(TRUEGOLD.arc, tg);
        if (rand() < arc[1]) st.out[2] = 1 + arc[2] + (tg >= 8 ? TRUEGOLD.arcTg8 : 0);
      }
    }
  }
  function push(into, fx) { for (var i = 0; i < fx.length; i++) into.push(fx[i]); }

  // The skills one attack rolls for: per-attack chances on the attacking
  // type. A damage-up effect rides this hit; Petra's mark raises the damage
  // the target takes for the rest of the round; Sophia's terror holds the
  // target through the next round; anything else holds the side for its turns.
  function onAttack(f, st, foe, t, g, round, rand) {
    var sums = null;
    for (var i = 0; i < f.skills.length; i++) {
      var sk = f.skills[i];
      if (sk.kind !== 'perAttack' || !sk.on[t]) continue;
      if (rand() >= sk.chance) continue;
      if (sk.special === 'terrorOnHit') foe.terror[g] = round + 1;
      for (var j = 0; j < sk.fx.length; j++) {
        var e = sk.fx[j];
        if (sk.special === 'debuffTargetOnHit') { if (e.fam === 3) foe.hurt[g] += e.pct; continue; }
        if (e.fam === 0 && e.troops[t] && (!e.vs || e.vs[g])) {
          sums = sums || {};
          sums[e.code] = (sums[e.code] || 0) + e.pct;
        } else if (e.fam !== 0) {
          st.timed.push({ id: i + '.' + j, fx: [e], from: round + 1, until: round + Math.max(1, sk.turns) });
        }
      }
    }
    var x = 1;
    for (var code in sums) x *= 1 + sums[code] / 100;
    return x;
  }

  // SkillMod for type t striking type g, with the Truegold rolls folded in.
  function skillMod(fa, sa, fd, sd, t, g, round, rand) {
    var extra = onAttack(fa, sa, sd, t, g, round, rand);
    var F = sa.FT && sd.terror[g] >= round ? sa.FT : sa.F;
    var up = F[0][t][g] * F[3][g][g] * (1 + sd.hurt[g] / 100) * extra;
    var down = sd.F[1][g][t] * sd.F[2][t][t];
    return up / down * sa.out[t] * sd.inc[g];
  }

  // Deaths from one attack, the engine's single kill law.
  function dead(n, armyMin, a, d, mod, round) {
    return Math.ceil(Math.sqrt(n * armyMin) * a / d / 100 * mod * (1 - FATIGUE * round));
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
      (b.s2[1] && b.n[1] > 0) || (b.s2[2] && b.n[2] > 0) || chancy(a) || chancy(b);
  }
  function chancy(f) {
    return f.gold || f.dodge > 0 || f.skills.some(function (sk) { return sk.kind === 'perRound' || sk.kind === 'perAttack' || sk.kind === 'pity'; });
  }

  function strike(att, def, nAtt, nDef, armyMin, round, rand, kills, sa, sd) {
    var live = att.live || def.live;
    for (var t = 0; t < 3; t++) {
      var n = nAtt[t];
      if (n <= 0) continue;
      var target = nDef[0] > 0 ? 0 : nDef[1] > 0 ? 1 : nDef[2] > 0 ? 2 : -1;
      if (target < 0) return;
      if (t === 1 && att.s2[1] && target === 0 && nDef[2] > 0 && rand() < AMBUSH) target = 2;
      if (def.dodge > 0 && rand() < def.dodge) continue;
      var a = att.A[t] * (BEATS[t] === target ? COUNTER : 1);
      var d = def.D[target] * (t === 1 && target === 0 && def.s2[0] ? BANDS : 1);
      if (d <= 0) continue;
      var mod = live ? skillMod(att, sa, def, sd, t, target, round, rand) : 1;
      var lost = dead(n, armyMin, a, d, mod, round);
      if (t === 2 && att.s2[2] && rand() < VOLLEY) lost *= 2;
      kills[target] += lost;
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
      var live = a.live || b.live, sa = roundState(), sb = roundState();
      while (round < MAX_ROUNDS) {
        round++;
        ka[0] = ka[1] = ka[2] = kb[0] = kb[1] = kb[2] = 0;
        if (live) { begin(a, sa, round, rand); begin(b, sb, round, rand); }
        strike(a, b, na, nb, armyMin, round, rand, kb, sa, sb);
        strike(b, a, nb, na, armyMin, round, rand, ka, sb, sa);
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
    var res = [], battles = 0;
    for (var c = 0; c < g.cells.length; c++) {
      var cell = g.cells[c];
      var a = {
        n: split(total, cell, g.k), tier: sideA.tier, tg: sideA.tg,
        atk: sideA.atk, let: sideA.let, def: sideA.def, hea: sideA.hea,
        skills: sideA.skills, truegold: sideA.truegold
      };
      var r = run(a, sideB, opts.battles, (opts.seed || 1) + c * 7919);
      res.push({ cell: cell, f: [cell[0] / g.k, cell[1] / g.k, cell[2] / g.k], n: a.n, win: r.win, left: r.a[0] + r.a[1] + r.a[2], foe: r.b[0] + r.b[1] + r.b[2], rounds: r.rounds });
      battles += r.battles;
      if (onCell) onCell(c + 1, g.cells.length, battles);
    }
    return { k: g.k, total: total, cells: res, battles: battles };
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
    TIERS: TIERS, TGS: TGS, MAX_TG: MAX_TG, TG_HIGH: TG_HIGH, TRUEGOLD: TRUEGOLD,
    baseAtk: baseAtk, baseHea: baseHea, hasSecondSkill: hasSecondSkill,
    family: family, factor: factor, compile: compile, dead: dead,
    prepare: prepare, battle: battle, run: run, grid: grid, sweep: sweep, best: best,
    rng: rng, seedOf: seedOf
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BattleEngine = api;
})(typeof self !== 'undefined' ? self : this);
