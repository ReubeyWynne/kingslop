/* battle-engine.mjs — the battle model behind the Battle Simulator page.
   An ES module with no DOM: the build bundles it into the pages that list it
   (window.BattleEngine, for the page's classic scripts) and into the sweep
   worker (js/sim-worker.mjs), and the .dsh checks require it in Node.

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
   into effects by js/combat.mjs. Their codes fall into four families, and one
   hit's SkillMod is
     (damage up × enemy defence down) ÷ (their defence up × their damage down)
   where each family multiplies its codes' (1 + summed % / 100). A side with
   no skills and no Truegold troops fights exactly as before. */

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
// A skill as js/combat.mjs hands it over: { kind, chance, every, offset,
// turns, special, dodgePct, effects: [{ code, pct, troops, vs }] }, troops
// and vs as type indexes. The family of a code: 10x damage up, 11x defence
// up, 20x enemy damage down, 21x enemy defence down.
function family(code) { return (code >= 200 ? 2 : 0) + (code % 100 >= 10 ? 1 : 0); }
// The kinds that roll. anyAttack (Petra's Evil Eye, Zoe's Infinite Arsenal) rolls on each
// troop type's attack in a turn, and one success holds the effect for every attack that
// turn: 50% three times is an 87.5% chance a turn (Strat Game Sloth, 2026-11-12).
var CHANCE = { perRound: true, perAttack: true, anyAttack: true };
var LATE_CODE = 211;
function mask(list) {
  if (!list) return null;
  var m = [false, false, false];
  list.forEach(function (i) { m[i] = true; });
  return m;
}
function compile(raw) {
  var list = (raw || []).map(function (sk) {
    var vsTerror = sk.special === 'vsTerror';
    var fx = (sk.effects || []).map(function (e) {
      return { code: e.code, fam: family(e.code), pct: +e.pct || 0, troops: mask(e.troops) || [true, true, true], vs: mask(e.vs), vsTerror: vsTerror, chance: CHANCE[sk.kind] === true };
    });
    return {
      kind: sk.kind || 'passive', chance: pos(sk.chance), every: Math.max(1, sk.every | 0), offset: sk.offset | 0,
      turns: Math.max(0, sk.turns | 0), special: sk.special || '', dodgePct: sk.dodgePct, fx: fx,
      on: [0, 1, 2].map(function (t) { return fx.some(function (e) { return e.troops[t]; }); })
    };
  });
  // Chance skills sharing a code don't stack: only one of them is ever
  // active and the duplicates are dead. Keep the strongest (pct × its chance
  // a turn; an any-attack skill rolls once for each of the three troop types).
  var keep = {};
  list.forEach(function (sk) {
    sk.fx.forEach(function (e) {
      if (!e.chance) return;
      var v = e.pct * (sk.kind === 'anyAttack' ? 1 - Math.pow(1 - sk.chance, 3) : sk.chance);
      if (!keep[e.code] || v > keep[e.code].v) keep[e.code] = { v: v, e: e };
    });
  });
  list.forEach(function (sk) {
    sk.fx = sk.fx.filter(function (e) { return !e.chance || keep[e.code].e === e; });
    sk.on = [0, 1, 2].map(function (t) { return sk.fx.some(function (e) { return e.troops[t]; }); });
    // Enemy damage taken up (211) does nothing on a battle's first turn (Strat Game Sloth,
    // 2026-11-12, measured on the Bear): the Bear's first round uses this list instead.
    sk.fxFirst = sk.fx.filter(function (e) { return e.code !== LATE_CODE; });
  });
  return list.filter(function (sk) { return sk.fx.length || sk.special === 'dodge'; });
}

// One code's live effects: fixed (passive or scheduled) ones add, and the
// one chance effect per code left after compile adds to them.
function add(sums, e) {
  var s = sums[e.code] || (sums[e.code] = { fixed: 0, chance: 0 });
  if (e.chance) s.chance = Math.max(s.chance, e.pct); else s.fixed += e.pct;
}
function product(sums) {
  var f = 1;
  for (var code in sums) f *= 1 + (sums[code].fixed + sums[code].chance) / 100;
  return f;
}

// One family's factor for a hit: (1 + one code's % / 100) per code, multiplied
// across codes. `own` is the troop type the effect must cover, `enemy` the
// type it must be aimed at when it names one.
function factor(fx, fam, own, enemy, terror) {
  var sums = {};
  for (var i = 0; i < fx.length; i++) {
    var e = fx[i];
    if (e.fam !== fam || !e.troops[own] || (e.vs && !e.vs[enemy]) || (e.vsTerror && !terror)) continue;
    add(sums, e);
  }
  return product(sums);
}

// A side's state for one round: the effects live this round, the Truegold
// rolls, and what the enemy's hits left on each of its troop types.
function roundState() {
  return { timed: [], pity: {}, out: [1, 1, 1], inc: [1, 1, 1], terror: [0, 0, 0], F: null, FT: null };
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

// Start of a round: passives, per-round, any-attack and pity rolls, every-N
// skills, and whatever an earlier round's skill still holds. round counts from
// 1; the every-N skills count from 0 the way the helper's engine does. alive is
// the side's troops per type: an any-attack skill rolls once per type attacking.
// A side with lateEnemyHurt (the Bear's attacker) leaves 211 out of round 1.
function begin(f, st, round, rand, alive) {
  var first = round === 1 && f.lateEnemyHurt;
  var fx = [], key = first ? 'first:' : '';
  st.timed = st.timed.filter(function (x) { return x.until >= round; });
  st.timed.forEach(function (x) { if (x.from <= round) { push(fx, x.fx); key += x.id + ','; } });
  for (var i = 0; i < f.skills.length; i++) {
    var sk = f.skills[i], on = false;
    if (sk.special === 'dodge' || sk.kind === 'perAttack') continue;
    if (sk.kind === 'passive') on = true;
    else if (sk.kind === 'perRound') on = rand() < sk.chance;
    else if (sk.kind === 'anyAttack') { for (var a = 0; a < 3; a++) if (alive[a] > 0 && rand() < sk.chance) on = true; }
    else if (sk.kind === 'everyN') on = (round - 1) % sk.every === sk.offset;
    else if (sk.kind === 'pity') {
      var fails = st.pity[i] || 0;
      on = rand() < Math.min(1, sk.chance * (1 + fails));
      st.pity[i] = on ? 0 : fails + 1;
    }
    if (!on) continue;
    push(fx, first ? sk.fxFirst : sk.fx);
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
// type. A damage-up effect rides this hit; Sophia's terror holds the
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
      if (e.fam === 0 && e.troops[t] && (!e.vs || e.vs[g])) {
        sums = sums || {};
        add(sums, e);
      } else if (e.fam !== 0) {
        st.timed.push({ id: i + '.' + j, fx: [e], from: round + 1, until: round + Math.max(1, sk.turns) });
      }
    }
  }
  return sums ? product(sums) : 1;
}

// SkillMod for type t striking type g, with the Truegold rolls folded in.
function skillMod(fa, sa, fd, sd, t, g, round, rand) {
  var extra = onAttack(fa, sa, sd, t, g, round, rand);
  var F = sa.FT && sd.terror[g] >= round ? sa.FT : sa.F;
  var up = F[0][t][g] * F[3][g][g] * extra;
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
  return f.gold || f.dodge > 0 || f.skills.some(function (sk) { return CHANCE[sk.kind] === true || sk.kind === 'pity'; });
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
      if (live) { begin(a, sa, round, rand, na); begin(b, sb, round, rand, nb); }
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

// ── The Bear. Bear Hunt is ten rounds against 5,000 special infantry that
// never fall and never strike back, so every round is the kill law above with
// N₀ = 5,000 and the same Bear: what changes round to round is only the skill,
// Truegold, volley and fatigue rolls. Damage is the deaths the march deals.
// No source publishes the Bear's stats (both community sims keep them
// server-side), so its defence is the one number set from outside: fitted to
// the hunts logged in _data/bear-reports.json (players' own hits, and the
// Frakinator's battle-engine Bear), a level-5 trap. .dsh/bear-reports-check.cjs
// refits it from every entry and fails when this drifts. Skills flagged
// bear: false (Zoe's Sundering Wound) do nothing here.
var BEAR = { troops: 5000, rounds: 10, def: 62.1 };

function bearSide(side) {
  var s = {};
  for (var k in side) s[k] = side[k];
  s.skills = (side.skills || []).filter(function (sk) { return sk.bear !== false; });
  var f = prepare(s);
  f.lateEnemyHurt = true;
  return f;
}
function bearFoe() {
  var f = prepare({ n: [BEAR.troops, 0, 0], skills: [] });
  f.D = [BEAR.def, BEAR.def, BEAR.def];
  f.s2 = [false, false, false];
  f.tg = [0, 0, 0];
  f.gold = false;
  f.live = false;
  return f;
}
// One Bear hunt: damage dealt per troop type over the ten rounds.
function hunt(a, bear, rand) {
  var na = a.n.slice(), nb = bear.n.slice(), out = [0, 0, 0], kills = [0, 0, 0];
  var armyMin = Math.min(na[0] + na[1] + na[2], BEAR.troops);
  var sa = roundState(), sb = roundState();
  for (var round = 1; round <= BEAR.rounds; round++) {
    if (a.live) begin(a, sa, round, rand, na);
    begin(bear, sb, round, rand, nb);
    for (var t = 0; t < 3; t++) {
      if (na[t] <= 0) continue;
      var one = [na[0] * (t === 0), na[1] * (t === 1), na[2] * (t === 2)];
      kills[0] = 0;
      strike(a, bear, one, nb, armyMin, round, rand, kills, sa, sb);
      out[t] += kills[0];
    }
  }
  return out;
}
// Many hunts: every total (for the histogram), the mean per type, and the
// mean. pointsPct is Valora's Hunter Instinct, on your own Damage Points.
function bearHunt(side, hunts, seed, pointsPct) {
  var a = bearSide(side), bear = bearFoe(), rand = rng(seed || 1);
  var count = a.live || (a.s2[2] && a.n[2] > 0) ? Math.max(1, hunts | 0) : 1;
  var scale = 1 + pos(pointsPct) / 100, totals = new Array(count), byType = [0, 0, 0], sum = 0;
  for (var i = 0; i < count; i++) {
    var d = hunt(a, bear, rand), tot = (d[0] + d[1] + d[2]) * scale;
    totals[i] = tot;
    sum += tot;
    for (var t = 0; t < 3; t++) byType[t] += d[t] * scale / count;
  }
  totals.sort(function (x, y) { return x - y; });
  return { mean: sum / count, byType: byType, totals: totals, hunts: count };
}
// The Bear's expected damage, worked out exactly instead of simulated: the same skills,
// rules and kill law as hunt() above, so bearHunt()'s mean converges on it (the only gap is
// the kill law's rounding up, a troop or so per attack). This is the one Bear model: the
// lead finder ranks lineups and picks the ideal mix with it, and the damage card samples
// the same thing with bearHunt() for the spread.
//
// The Bear never strikes back or falls, so every round is independent of the last except
// through the skills: each round's damage is a sum over the attacking types, and its
// expectation needs only the chance of each skill being live that round. Skills roll
// independently, so the round's SkillMod is averaged over every on/off combination of the
// random skills (a handful), which keeps the per-code rule (fixed add, one chance) exact.
//
// roots[t] is the expected damage of type t per √(n_t × armyMin): damage = roots[t] ×
// √(n_t × min(march, 5,000)). So the best split of a march is f_t ∝ roots[t]², and a
// march's damage at that split is √(N × armyMin × Σ roots²). An any-attack skill's chance
// depends on how many types attack; roots uses the types the side sends (n > 0).
function bearExpect(side, pointsPct) {
  var a = bearSide(side), bear = bearFoe();
  var n = a.n, armyMin = Math.min(n[0] + n[1] + n[2], BEAR.troops);
  var present = [0, 1, 2].filter(function (t) { return n[t] > 0; });
  var det = [], rand = [], hit = [];
  a.skills.forEach(function (sk) {
    if (sk.special === 'dodge') return;
    if (sk.kind === 'passive' || sk.kind === 'everyN') det.push(sk);
    else if (sk.kind === 'perAttack') hit.push(sk);
    else rand.push(sk);
  });
  var terrorBy = hit.filter(function (sk) { return sk.special === 'terrorOnHit'; });
  var pity = rand.map(function () { return [1]; });
  var roots = [0, 0, 0];
  for (var round = 1; round <= BEAR.rounds; round++) {
    var first = round === 1;
    var fixed = [];
    det.forEach(function (sk) {
      var on = sk.kind === 'passive';
      if (!on) for (var r0 = Math.max(1, round - Math.max(1, sk.turns) + 1); r0 <= round; r0++) if ((r0 - 1) % sk.every === sk.offset) on = true;
      if (on) push(fixed, first ? sk.fxFirst : sk.fx);
    });
    // Each random skill's chance of being live this round.
    var p = rand.map(function (sk, i) {
      var held = Math.min(Math.max(1, sk.turns), round);
      if (sk.kind === 'pity') {
        var dist = pity[i], on = 0, next = [];
        dist.forEach(function (w, fails) {
          var c = Math.min(1, sk.chance * (1 + fails));
          on += w * c;
          next[0] = (next[0] || 0) + w * c;
          next[fails + 1] = (next[fails + 1] || 0) + w * (1 - c);
        });
        pity[i] = next;
        return on;
      }
      var c = sk.kind === 'anyAttack' ? 1 - Math.pow(1 - sk.chance, present.length) : sk.chance;
      return 1 - Math.pow(1 - c, held);
    });
    // Expected family factors per attacking type, with and without terror on the Bear.
    var EU = [0, 0, 0], EUT = [0, 0, 0];
    for (var mask = 0; mask < (1 << rand.length); mask++) {
      var w = 1, fx = fixed.slice();
      for (var i = 0; i < rand.length; i++) {
        if (mask & (1 << i)) { w *= p[i]; push(fx, first ? rand[i].fxFirst : rand[i].fx); } else w *= 1 - p[i];
      }
      if (!w) continue;
      for (var t = 0; t < 3; t++) {
        EU[t] += w * factor(fx, 0, t, 0, false) * factor(fx, 3, 0, 0, false);
        EUT[t] += w * factor(fx, 0, t, 0, true) * factor(fx, 3, 0, 0, true);
      }
    }
    present.forEach(function (t) {
      // Terror from this type's own roll, an earlier type's this round, or last round's.
      var mine = hit.filter(function (sk) { return sk.on[t]; });
      var miss = 1;
      terrorBy.forEach(function (sk) {
        present.forEach(function (u) { if (sk.on[u]) { if (round > 1) miss *= 1 - sk.chance; if (u < t) miss *= 1 - sk.chance; } });
      });
      var before = 1 - miss, mod = 0;
      for (var m = 0; m < (1 << mine.length); m++) {
        var pw = 1, sums = null, terror = false;
        for (var j = 0; j < mine.length; j++) {
          if (!(m & (1 << j))) { pw *= 1 - mine[j].chance; continue; }
          pw *= mine[j].chance;
          if (mine[j].special === 'terrorOnHit') terror = true;
          mine[j].fx.forEach(function (e) {
            if (e.fam === 0 && e.troops[t] && (!e.vs || e.vs[0])) { sums = sums || {}; add(sums, e); }
          });
        }
        var pT = terror ? 1 : before;
        mod += pw * (sums ? product(sums) : 1) * (pT * EUT[t] + (1 - pT) * EU[t]);
      }
      // Truegold's damage roll and the archers' volley, both independent of the skills.
      var tg = a.tg[t], out = 1;
      if (t === 1 && tg >= 3) { var cav = truegoldStep(TRUEGOLD.cav, tg); out = 1 + cav[1] * cav[2]; }
      if (t === 2 && tg >= 3) { var arc = truegoldStep(TRUEGOLD.arc, tg); out = 1 + arc[1] * (arc[2] + (tg >= 8 ? TRUEGOLD.arcTg8 : 0)); }
      var volley = t === 2 && a.s2[2] ? 1 + VOLLEY : 1;
      var atk = a.A[t] * (BEATS[t] === 0 ? COUNTER : 1);
      roots[t] += atk / bear.D[0] / 100 * mod * out * volley * (1 - FATIGUE * round);
    });
  }
  var scale = 1 + pos(pointsPct) / 100, byType = [0, 1, 2].map(function (t) { roots[t] *= scale; return roots[t] * Math.sqrt(n[t] * armyMin); });
  return { mean: byType[0] + byType[1] + byType[2], byType: byType, roots: roots };
}

// The share of hunts at or under a damage, read off sorted totals.
function quantile(sorted, q) {
  if (!sorted.length) return 0;
  var at = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[at];
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

export { TIERS, TGS, MAX_TG, TG_HIGH, TRUEGOLD, baseAtk, baseHea, hasSecondSkill, family, factor,
  compile, dead, prepare, battle, run, grid, sweep, best, rng, seedOf, BEAR, bearHunt, bearExpect, quantile };

// The same exports as one object: what the page's classic scripts read as window.BattleEngine
// and what require() returns to the CommonJS checks, until neither needs it.
const api = { TIERS, TGS, MAX_TG, TG_HIGH, TRUEGOLD, baseAtk, baseHea, hasSecondSkill, family,
  factor, compile, dead, prepare, battle, run, grid, sweep, best, rng, seedOf, BEAR, bearHunt,
  bearExpect, quantile };
export { api as default, api as 'module.exports' };
