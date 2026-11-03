/* lead-engine.js — which three of your heroes to lead with.
   Plain ES5, no DOM, like js/battle-engine.js and js/combat.js: the Heroes
   page loads it as a script (window.LeadEngine) and .dsh/lead-engine-check.cjs
   requires it in Node.

   You type your Bonus Overview: the account's own troop stats, before any
   hero is seated. A battle report's Bonus Details already include the
   heroes, so they cannot be used to compare one lineup with another. The
   four layers a hero adds on top (KINGSHOT-SOURCES.md, Hero layer):

     attack, defence   overview + ceiling × curve[star index], own type only
     lethality, health (100 + overview) × (1 + widget stat / 100) − 100,
                       widget stat = level / 10 × the widget's top value,
                       own type only, in every role
     skills            js/combat.js: every Expedition skill at its level and
                       the widget's skill in its own role (rally or defender)

   Three jobs are scored:

   - bear: the expected Bear damage of the lead's ideal mix (MATHS.md §1–5):
       D* = √Σ (base_att_t × vsInfantry_t × A_t × SkillMod_t)²
     with every chance skill at its expected value. Only the ranking and
     the ratios mean anything; the scale is arbitrary.
   - rally: your march, as a rally lead, against each stock garrison.
   - garrison: your march, as a garrison lead, against each stock rally.
     Both fights are js/battle-engine.js battles, scored by the edge
     (your share of troops left − theirs), averaged over the opponents.

   The stock opponents live in _data/megafauna.json, one ladder of account
   investment per kingdom generation. */
(function (root) {
  'use strict';

  var TYPES = ['inf', 'cav', 'arc'];
  // Expedition skill levels a star unlocks (KingShot Battle Helper,
  // STAR_TO_MAX_SKILL_LVL): a hero's levels unless the roster says lower.
  var STAR_SKILLS = [[1, 0, 0], [2, 2, 0], [3, 3, 3], [4, 4, 4], [5, 5, 5], [5, 5, 5]];
  var BEAR_ROUNDS = 10;
  var PER_TYPE = 4;

  function num(x) { x = +x; return isFinite(x) ? x : 0; }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  // A roster entry turned into what a fight needs: star index, widget level,
  // skill levels. Null when the hero cannot lead (no star yet).
  function copyOf(key, entry, data) {
    var hero = data.heroes[key];
    if (!hero || !entry || entry.stars === null || entry.stars === undefined) return null;
    var stars = clamp(entry.stars | 0, 0, 30);
    var cap = STAR_SKILLS[Math.floor(stars / 6)];
    var levels = [0, 1, 2].map(function (i) {
      var own = entry.skills && entry.skills[i] != null ? entry.skills[i] | 0 : cap[i];
      return clamp(Math.min(own, cap[i]), 0, 5);
    });
    return { key: key, type: hero.type, stars: stars, widget: data.widgets[key] ? clamp(entry.widget | 0, 0, 10) : 0, levels: levels };
  }

  // The hero's own stat line, attack and defence alike.
  function statLine(copy, data) { return data.heroes[copy.key].ceiling * data.curve[copy.stars] / 100; }
  function widgetStat(copy, data) { var w = data.widgets[copy.key]; return w && copy.widget ? w.maxPct * copy.widget / 10 : 0; }

  // Bonus Overview plus a lineup → the four Bonus Details rows the battle
  // engine fights with. overview is { inf: { attack, lethality, defense, health }, … }.
  function panel(overview, lineup, data) {
    var out = { atk: [0, 0, 0], let: [0, 0, 0], def: [0, 0, 0], hea: [0, 0, 0] };
    TYPES.forEach(function (type, t) {
      var row = (overview && overview[type]) || {};
      var atk = num(row.attack), def = num(row.defense), leth = num(row.lethality), hea = num(row.health), g = 0;
      lineup.forEach(function (copy) {
        if (!copy || copy.type !== type) return;
        var line = statLine(copy, data);
        atk += line; def += line; g += widgetStat(copy, data);
      });
      out.atk[t] = atk; out.def[t] = def;
      out.let[t] = (100 + leth) * (1 + g / 100) - 100;
      out.hea[t] = (100 + hea) * (1 + g / 100) - 100;
    });
    return out;
  }

  function skillsOf(lineup, role, data) {
    return root.CombatSkills.side(data, { role: role, heroes: lineup.filter(Boolean).map(function (c) { return { key: c.key, levels: c.levels, widget: c.widget }; }) });
  }

  // How often a skill is up across the Bear's ten rounds.
  function uptime(skill) {
    if (skill.kind === 'perRound' || skill.kind === 'perAttack') {
      var c = clamp(num(skill.chance), 0, 1), turns = Math.max(1, skill.turns | 0);
      return 1 - Math.pow(1 - c, turns);
    }
    if (skill.kind === 'everyN') {
      var every = Math.max(1, skill.every | 0), offset = skill.offset | 0, turns2 = Math.max(1, skill.turns | 0), up = 0;
      for (var r = 0; r < BEAR_ROUNDS; r++) if (r >= offset && (r - offset) % every < turns2) up++;
      return up / BEAR_ROUNDS;
    }
    return 1;
  }

  // The expected SkillMod per troop type against the Bear. Only the
  // attacker's families count: damage up and enemy defence down.
  function bearMod(skills) {
    var mod = [1, 1, 1];
    TYPES.forEach(function (type, t) {
      var sums = {};
      skills.forEach(function (s) {
        var up = uptime(s);
        s.effects.forEach(function (e) {
          var fam = (e.code >= 200 ? 2 : 0) + (e.code % 100 >= 10 ? 1 : 0);
          if (fam !== 0 && fam !== 3) return;
          if (e.troops && e.troops.indexOf(t) < 0) return;
          if (e.vs && e.vs.indexOf(0) < 0) return;
          sums[e.code] = (sums[e.code] || 0) + e.pct * up;
        });
      });
      Object.keys(sums).forEach(function (code) { mod[t] *= 1 + sums[code] / 100; });
    });
    return mod;
  }

  // Expected Bear damage of a lineup at the lead's ideal mix, and that mix.
  function bear(overview, lineup, troops, data) {
    var E = root.BattleEngine, p = panel(overview, lineup, data), mod = bearMod(skillsOf(lineup, 'rally', data));
    var terms = TYPES.map(function (type, t) {
      var tier = troops.tier[t], tg = troops.tg[t];
      // Archers deal +10% to the all-infantry Bear, and again from T7 / TG3.
      var vs = t === 2 ? 1.1 * (E.hasSecondSkill(tier, tg) ? 1.1 : 1) : 1;
      return E.baseAtk(t, tier, tg) * vs * (1 + p.atk[t] / 100) * (1 + p.let[t] / 100) * mod[t];
    });
    var sq = terms.reduce(function (s, x) { return s + x * x; }, 0);
    return { score: Math.sqrt(sq) / 1000, mix: terms.map(function (x) { return x * x / sq; }), panel: p };
  }

  // A stock opponent at one generation, as a battle side.
  function opponent(foe, gen, job, data) {
    var stock = data.megafauna, at = String(clamp(gen | 0, 1, stock.generations.length));
    var lineup = stock.lineups[at][job === 'rally' ? 'garrison' : 'rally'].map(function (key) {
      return copyOf(key, { stars: foe.stars, widget: foe.widget }, data);
    });
    var pct = stock.overview[at] * foe.overview, row = { attack: pct, lethality: pct, defense: pct, health: pct };
    var p = panel({ inf: row, cav: row, arc: row }, lineup, data);
    var troop = stock.troops[at], tg = clamp(troop.tg + foe.tg, 0, 8);
    return { side: { atk: p.atk, let: p.let, def: p.def, hea: p.hea, tier: [troop.tier, troop.tier, troop.tier], tg: [tg, tg, tg], skills: skillsOf(lineup, job === 'rally' ? 'defender' : 'rally', data) }, lineup: lineup };
  }

  function split(total, mix) {
    var n = mix.map(function (f) { return Math.round(total * f); });
    n[2] = Math.max(0, total - n[0] - n[1]);
    return n;
  }

  // Your lineup against every stock opponent of your generation.
  function fight(overview, lineup, troops, job, gen, data, opts) {
    var E = root.BattleEngine, stock = data.megafauna, p = panel(overview, lineup, data);
    var role = job === 'rally' ? 'rally' : 'defender';
    var mixes = stock.mix[job], total = Math.max(1, num(opts && opts.total) || stock.total);
    var you = { atk: p.atk, let: p.let, def: p.def, hea: p.hea, tier: troops.tier, tg: troops.tg, skills: skillsOf(lineup, role, data), n: split(total, mixes.you) };
    var battles = (opts && opts.battles) || 24, edge = 0;
    var rows = stock.foes.map(function (foe) {
      var them = opponent(foe, gen, job, data).side;
      them.n = split(total, mixes.them);
      var r = E.run(you, them, battles, E.seedOf([foe.id, gen, job]));
      var mine = (r.a[0] + r.a[1] + r.a[2]) / total, theirs = (r.b[0] + r.b[1] + r.b[2]) / total;
      edge += mine - theirs;
      return { id: foe.id, win: r.win, left: mine, foeLeft: theirs };
    });
    return { score: edge / rows.length, foes: rows, panel: p };
  }

  // Your owned heroes that can lead, the strongest few of each troop type
  // by their own stat line (a type with none leaves its seat empty).
  function candidates(roster, data, perType) {
    var keep = perType || PER_TYPE, by = { inf: [], cav: [], arc: [] };
    Object.keys(roster || {}).forEach(function (key) {
      var copy = copyOf(key, roster[key], data);
      if (copy) by[copy.type].push(copy);
    });
    TYPES.forEach(function (type) {
      by[type].sort(function (a, b) { return statLine(b, data) + widgetStat(b, data) - statLine(a, data) - widgetStat(a, data) || (a.key < b.key ? -1 : 1); });
      by[type] = by[type].slice(0, keep);
      if (!by[type].length) by[type].push(null);
    });
    return by;
  }

  // Every lineup of one hero per troop type from the candidates.
  function lineups(by) {
    var out = [];
    by.inf.forEach(function (i) { by.cav.forEach(function (c) { by.arc.forEach(function (a) { if (i || c || a) out.push([i, c, a]); }); }); });
    return out;
  }

  // The whole ranking for one job. opts: { overview, roster, troops, gen,
  // total, battles, perType }. Returns lineups best first.
  function rank(job, opts, data) {
    var list = lineups(candidates(opts.roster, data, opts.perType));
    var scored = list.map(function (lineup) {
      var r = job === 'bear' ? bear(opts.overview, lineup, opts.troops, data) : fight(opts.overview, lineup, opts.troops, job, opts.gen, data, opts);
      r.lineup = lineup;
      return r;
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored;
  }

  var api = {
    TYPES: TYPES, STAR_SKILLS: STAR_SKILLS, copyOf: copyOf, statLine: statLine, widgetStat: widgetStat, panel: panel,
    uptime: uptime, bearMod: bearMod, bear: bear, opponent: opponent, fight: fight, candidates: candidates, lineups: lineups, rank: rank
  };
  if (typeof module !== 'undefined' && module.exports) {
    root.BattleEngine = root.BattleEngine || require('./battle-engine.js');
    root.CombatSkills = root.CombatSkills || require('./combat.js');
    module.exports = api;
  }
  root.LeadEngine = api;
})(typeof self !== 'undefined' ? self : this);
