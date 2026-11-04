/* lead-engine.js — which three of your heroes to lead with.
   Plain ES5, no DOM, like js/battle-engine.js and js/combat.js: the Heroes
   page loads it as a script (window.LeadEngine) and .dsh/lead-engine-check.cjs
   requires it in Node.

   You type your Bonus Overview: the account's own troop stats, before any
   hero is seated. A battle report's Bonus Details already include the
   heroes, so they cannot be used to compare one lineup with another. The
   four layers a hero adds on top (KINGSHOT-SOURCES.md, Hero layer):

     attack, defence   overview + ceiling × curve[star index] + red gear
                       milestones, own type only
     lethality, health overview + widget stat + hero gear, own type only,
                       widget stat = level / 10 × the widget's top value
                       (added, not multiplied), in every role
     hero gear         the saved set for the hero's troop type
                       (js/hero-gear-engine.js HeroGear.stats): helm and boots
                       add lethality, gloves and chest health

   Checked against the game's own Hero Stats block (Expedition) for three
   heroes, to the hundredth, and against battle reports from three accounts:
   Bonus Details = (100 + overview + Squads' + Hero Stats + Town Centre TG)
   × (1 + the lead's widget skills in their role) − 100, every row within 0.2.
     town centre       a flat bonus by Truegold level, every type, every march
                       (TG2 +4 attack/defence; TG4 +4, +9 lethality/health;
                       TG5 +8, +12); masters are already in the overview
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

   Around the lineup, three more things a march carries:

     joiners           up to four first skills, js/combat.js's joiner rule
     city buffs        their own layer, (1 + (own − enemy down) / 100)
     pets              another layer, the same way (_data/combat.json layers)

   Each layer multiplies the stat's (1 + % / 100); an enemy debuff only
   cancels a buff in its own layer. Against the Bear only your own attack
   and lethality layers count: its defence is fixed and no debuff lands.

   The stock opponents live in _data/megafauna.json, one ladder of account
   investment per kingdom generation, each with its joiners, pets and city
   buffs. */
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

  // Hero gear by troop type from the save's pieces ('inf-helm' …): what a hero of
  // that type wears. Pieces not recorded add nothing.
  function gearLayer(pieces) {
    var G = root.HeroGear, out = {};
    TYPES.forEach(function (type) {
      var sum = { atk: 0, def: 0, let: 0, hea: 0 };
      if (G && pieces) ['helm', 'gloves', 'chest', 'boots'].forEach(function (slot) {
        var piece = pieces[type + '-' + slot];
        if (!piece) return;
        var s = G.stats(piece, slot);
        sum[slot === 'helm' || slot === 'boots' ? 'let' : 'hea'] += s.core;
        sum.atk += s.attack; sum.def += s.defense;
      });
      out[type] = sum;
    });
    return out;
  }

  // The Town Centre's Truegold level adds attack, defence, lethality and health to every troop
  // type in every march, and the Bonus Overview leaves it out. Read off three accounts' reports
  // against their Bonus Overviews (KINGSHOT-SOURCES.md, 2026-11-04): only these levels are
  // known, so any other level adds nothing and says so (known: false).
  var TOWN_TG = { 2: [4, 0], 4: [4, 9], 5: [8, 12] };
  function townLevel(level) { var m = /^TG ?(\d+)/.exec(String(level || '')); return m ? Number(m[1]) : 0; }
  function townLayer(level) {
    var tg = townLevel(level), row = TOWN_TG[tg];
    return { atk: row ? row[0] : 0, def: row ? row[0] : 0, let: row ? row[1] : 0, hea: row ? row[1] : 0, tg: tg, known: tg === 0 || Boolean(row) };
  }

  // Bonus Overview plus a lineup → the four Bonus Details rows the battle
  // engine fights with. overview is { inf: { attack, lethality, defense, health }, … }
  // with the Squads' row already added; gear is gearLayer's, worn by the seated hero;
  // town is townLayer's, on every type whoever is seated.
  function panel(overview, lineup, data, gear, town) {
    var out = { atk: [0, 0, 0], let: [0, 0, 0], def: [0, 0, 0], hea: [0, 0, 0] };
    TYPES.forEach(function (type, t) {
      var row = (overview && overview[type]) || {};
      var M = town || {};
      var atk = num(row.attack) + num(M.atk), def = num(row.defense) + num(M.def), leth = num(row.lethality) + num(M.let), hea = num(row.health) + num(M.hea);
      lineup.forEach(function (copy) {
        if (!copy || copy.type !== type) return;
        var line = statLine(copy, data), w = widgetStat(copy, data), g = (gear && gear[type]) || {};
        atk += line + num(g.atk); def += line + num(g.def);
        leth += w + num(g.let); hea += w + num(g.hea);
      });
      out.atk[t] = atk; out.def[t] = def; out.let[t] = leth; out.hea[t] = hea;
    });
    return out;
  }

  // The widget skills seated in a role, as the battle report's Bonus Details show them:
  // code 102 (attack up) and 101 (lethality up) multiply their row,
  // (100 + row) × (1 + Σ / 100) − 100. The battle engine already counts them as
  // skills, so this is for showing a report's numbers, not for scoring.
  function reportPanel(p, lineup, role, data) {
    var sums = { 101: 0, 102: 0 }, out = { atk: p.atk.slice(), let: p.let.slice(), def: p.def.slice(), hea: p.hea.slice() };
    lineup.forEach(function (copy) {
      var w = copy && data.widgets[copy.key], lvl = copy ? copy.widget : 0;
      if (!w || !lvl || w.skill.role !== role || !Object.hasOwn(sums, w.skill.code)) return;
      sums[w.skill.code] += data.widgetSkill.maxPct * data.widgetSkill.byLevel[lvl];
    });
    for (var t = 0; t < 3; t++) {
      out.atk[t] = (100 + out.atk[t]) * (1 + sums[102] / 100) - 100;
      out.let[t] = (100 + out.let[t]) * (1 + sums[101] / 100) - 100;
    }
    return out;
  }

  // The lineup's skills plus the joiners' first skills, for one role.
  function skillsOf(lineup, role, data, joiners) {
    return root.CombatSkills.side(data, {
      role: role,
      heroes: lineup.filter(Boolean).map(function (c) { return { key: c.key, levels: c.levels, widget: c.widget }; }),
      joiners: (joiners || []).filter(function (j) { return j && j.key; })
    });
  }

  // Your pets' skills as layer percentages. pets is { id: level }; a pet's
  // skill steps every ten levels along its ladder. Only pets the kingdom has
  // reached by `gen` count when gen is given.
  var LAYER_KEYS = ['attack', 'defense', 'lethality', 'health', 'enemyAttack', 'enemyDefense', 'enemyLethality', 'enemyHealth'];
  function blank() { var out = {}; LAYER_KEYS.forEach(function (k) { out[k] = 0; }); return out; }
  function petLevelPct(pet, level) {
    level = num(level);
    if (level <= 0 || !pet.values.length) return 0;
    return pet.values[clamp(Math.ceil(level / 10) - 1, 0, pet.values.length - 1)];
  }
  function petLayer(pets, data, gen) {
    var out = blank();
    (data.pets || []).forEach(function (pet) {
      if (gen && pet.generation > gen) return;
      var pct = petLevelPct(pet, pets && pets[pet.id]);
      if (!pct) return;
      var key = pet.side === 'enemy' ? 'enemy' + pet.stat.charAt(0).toUpperCase() + pet.stat.slice(1) : pet.stat;
      out[key] = Math.max(out[key], pct);
    });
    return out;
  }
  function cityLayer(city) {
    var out = blank();
    Object.keys(city || {}).forEach(function (k) { if (Object.hasOwn(out, k)) out[k] = num(city[k]); });
    return out;
  }

  // The panel with the city and pet layers of both sides. foe is null for
  // the Bear, where only your attack and lethality layers count.
  var LAYER_STAT = { atk: 'attack', let: 'lethality', def: 'defense', hea: 'health' };
  var LAYER_DOWN = { atk: 'enemyAttack', let: 'enemyLethality', def: 'enemyDefense', hea: 'enemyHealth' };
  function layered(p, own, foe) {
    var out = { atk: p.atk.slice(), let: p.let.slice(), def: p.def.slice(), hea: p.hea.slice() };
    Object.keys(LAYER_STAT).forEach(function (field) {
      if (!foe && (field === 'def' || field === 'hea')) return;
      var factor = 1;
      ['city', 'pet'].forEach(function (layer) {
        var mine = own[layer] || blank(), theirs = foe ? foe[layer] || blank() : blank();
        factor *= 1 + (num(mine[LAYER_STAT[field]]) - num(theirs[LAYER_DOWN[field]])) / 100;
      });
      for (var t = 0; t < 3; t++) out[field][t] = (100 + out[field][t]) * factor - 100;
    });
    return out;
  }

  // You, as the page holds you: { overview, troops, joiners, city, pets }
  // with city and pets already turned into layers.
  function layersOf(you) { return { city: you.city || blank(), pet: you.pets || blank() }; }

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
  // attacker's families count: damage up and enemy defence down. Within a code,
  // fixed effects (passive or scheduled) add; chance effects never stack with each
  // other, so the code takes the largest one that procs: the expected maximum.
  function bearMod(skills) {
    var mod = [1, 1, 1];
    TYPES.forEach(function (type, t) {
      var fixed = {}, chances = {};
      skills.forEach(function (s) {
        var up = uptime(s), chance = s.kind === 'perRound' || s.kind === 'perAttack';
        s.effects.forEach(function (e) {
          var fam = (e.code >= 200 ? 2 : 0) + (e.code % 100 >= 10 ? 1 : 0);
          if (fam !== 0 && fam !== 3) return;
          if (e.troops && e.troops.indexOf(t) < 0) return;
          if (e.vs && e.vs.indexOf(0) < 0) return;
          if (chance) (chances[e.code] = chances[e.code] || []).push({ pct: e.pct, up: up });
          else fixed[e.code] = (fixed[e.code] || 0) + e.pct * up;
        });
      });
      var codes = {};
      Object.keys(fixed).concat(Object.keys(chances)).forEach(function (c) { codes[c] = true; });
      Object.keys(codes).forEach(function (code) {
        var miss = 1, best = 0;
        (chances[code] || []).sort(function (a, b) { return b.pct - a.pct; }).forEach(function (c) { best += c.pct * c.up * miss; miss *= 1 - c.up; });
        mod[t] *= 1 + ((fixed[code] || 0) + best) / 100;
      });
    });
    return mod;
  }

  // Expected Bear damage of a lineup at the lead's ideal mix, and that mix.
  function bear(you, lineup, data) {
    var E = root.BattleEngine, troops = you.troops;
    var p = layered(panel(you.overview, lineup, data, you.gear, you.town), layersOf(you), null);
    var mod = bearMod(skillsOf(lineup, 'rally', data, you.joiners));
    var terms = TYPES.map(function (type, t) {
      var tier = troops.tier[t], tg = troops.tg[t];
      // Archers deal +10% to the all-infantry Bear, and again from T7 / TG3.
      var vs = t === 2 ? 1.1 * (E.hasSecondSkill(tier, tg) ? 1.1 : 1) : 1;
      return E.baseAtk(t, tier, tg) * vs * (1 + p.atk[t] / 100) * (1 + p.let[t] / 100) * mod[t];
    });
    var sq = terms.reduce(function (s, x) { return s + x * x; }, 0);
    return { score: Math.sqrt(sq) / 1000, mix: terms.map(function (x) { return x * x / sq; }), panel: p };
  }

  // A stock opponent at one generation: its lineup, stats, joiners, pets and city.
  function opponent(foe, gen, job, data) {
    var stock = data.megafauna, at = String(clamp(gen | 0, 1, stock.generations.length));
    var theirJob = job === 'rally' ? 'garrison' : 'rally';
    var lineup = stock.lineups[at][theirJob].map(function (key) {
      return copyOf(key, { stars: foe.stars, widget: foe.widget }, data);
    });
    var pct = stock.overview[at] * foe.overview, row = { attack: pct, lethality: pct, defense: pct, health: pct };
    var troop = stock.troops[at], tg = clamp(troop.tg + foe.tg, 0, 8);
    var joiners = (stock.joiners[theirJob][at] || []).map(function (key) { return { key: key, level: foe.joinerLevel }; });
    var pets = {};
    (data.pets || []).forEach(function (pet) { pets[pet.id] = Math.min(foe.petLevel || 0, pet.maxLevel); });
    return {
      overview: { inf: row, cav: row, arc: row }, lineup: lineup, joiners: joiners,
      troops: { tier: [troop.tier, troop.tier, troop.tier], tg: [tg, tg, tg] },
      city: cityLayer(foe.city), pets: petLayer(pets, data, +at),
      role: theirJob === 'rally' ? 'rally' : 'defender'
    };
  }

  // One side ready for the battle engine, its layers set against the other.
  function battleSide(who, lineup, role, against, data) {
    var p = layered(panel(who.overview, lineup, data, who.gear, who.town), layersOf(who), layersOf(against));
    return { atk: p.atk, let: p.let, def: p.def, hea: p.hea, tier: who.troops.tier, tg: who.troops.tg, skills: skillsOf(lineup, role, data, who.joiners) };
  }

  function split(total, mix) {
    var n = mix.map(function (f) { return Math.round(total * f); });
    n[2] = Math.max(0, total - n[0] - n[1]);
    return n;
  }

  // Your lineup against every stock opponent of your generation.
  function fight(you, lineup, job, gen, data, opts) {
    var E = root.BattleEngine, stock = data.megafauna;
    var role = job === 'rally' ? 'rally' : 'defender';
    var mixes = stock.mix[job], total = Math.max(1, num(opts && opts.total) || stock.total);
    var battles = (opts && opts.battles) || 24, edge = 0;
    var rows = stock.foes.map(function (foe) {
      var them = opponent(foe, gen, job, data);
      var a = battleSide(you, lineup, role, them, data), b = battleSide(them, them.lineup, them.role, you, data);
      a.n = split(total, mixes.you); b.n = split(total, mixes.them);
      var r = E.run(a, b, battles, E.seedOf([foe.id, gen, job]));
      var mine = (r.a[0] + r.a[1] + r.a[2]) / total, theirs = (r.b[0] + r.b[1] + r.b[2]) / total;
      edge += mine - theirs;
      return { id: foe.id, win: r.win, left: mine, foeLeft: theirs };
    });
    return { score: edge / rows.length, foes: rows };
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

  // The whole ranking for one job. you: { overview, troops, joiners, city,
  // pets }; opts: { roster, gen, total, battles, perType }. Best first.
  function rank(job, you, data, opts) {
    var list = lineups(candidates(opts.roster, data, opts.perType));
    var scored = list.map(function (lineup) {
      var r = job === 'bear' ? bear(you, lineup, data) : fight(you, lineup, job, opts.gen, data, opts);
      r.lineup = lineup;
      return r;
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored;
  }

  var api = {
    TYPES: TYPES, STAR_SKILLS: STAR_SKILLS, copyOf: copyOf, statLine: statLine, widgetStat: widgetStat, gearLayer: gearLayer, townLayer: townLayer, TOWN_TG: TOWN_TG, panel: panel, reportPanel: reportPanel,
    uptime: uptime, bearMod: bearMod, bear: bear, opponent: opponent, fight: fight, candidates: candidates, lineups: lineups, rank: rank,
    LAYER_KEYS: LAYER_KEYS, blank: blank, petLevelPct: petLevelPct, petLayer: petLayer, cityLayer: cityLayer, layered: layered, battleSide: battleSide
  };
  if (typeof module !== 'undefined' && module.exports) {
    root.BattleEngine = root.BattleEngine || require('./battle-engine.js');
    root.CombatSkills = root.CombatSkills || require('./combat.js');
    root.HeroGear = root.HeroGear || require('./hero-gear-engine.js');
    module.exports = api;
  }
  root.LeadEngine = api;
})(typeof self !== 'undefined' ? self : this);
