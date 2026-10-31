/* combat.js — heroes and joiners turned into battle-engine skills.
   Plain ES5, no DOM, like js/battle-engine.js: the page loads it as a script
   (window.CombatSkills) and the .dsh checks require it in Node.

   The data is _data/combat.json (window.CombatData on the page): each hero's
   skills with how they trigger and their top-level values, and each
   exclusive gear's skill. This file only scales and selects:

   - A skill at level L (1–5) carries L⁄5 of its top value. A chance that
     scales (Amadeus's Unrighteous Strike, 8/16/24/32/40%) scales the same
     way; a value marked `fixed` does not.
   - Exclusive gear adds its skill, 15% × the level's step (Lv2/4/6/8/10 →
     ⅓ … 1), only in its own role: a rally widget in a rally, a defender
     widget in a garrison. Its flat stats are already on the battle report.
   - Joiners give only their first skill. Four count: the highest skill
     levels, join order breaking ties (kingshotsim.com, Rally & troops).
     A second copy of the same chance skill still takes a place but never
     rolls twice: four Jabels are one roll.
   - The leaders' own stats and gear are already in the report's Bonus
     Details, so only their skills are added here. */
(function (root) {
  'use strict';

  var TYPES = ['inf', 'cav', 'arc'];
  var MAX_JOINERS = 4;

  function index(list) {
    return list ? list.map(function (t) { return TYPES.indexOf(t); }).filter(function (i) { return i >= 0; }) : undefined;
  }

  function level(v) { return Math.max(0, Math.min(5, v | 0)); }

  // One hero skill at one level, in the engine's shape; null when it does
  // nothing in a fight.
  function skill(row, lvl) {
    if (!lvl || row.combat === false) return null;
    var k = lvl / 5, tr = row.trigger || {};
    var out = {
      kind: tr.kind || 'passive', chance: tr.chance == null ? undefined : tr.chance * (tr.chanceScales ? k : 1),
      every: tr.every, offset: tr.offset, turns: tr.turns, special: row.special,
      effects: (row.effects || []).map(function (e) {
        return { code: e.code, pct: e.pct * (e.fixed ? 1 : k), troops: index(e.troops), vs: index(e.vs) };
      })
    };
    if (row.special === 'dodge') out.dodgePct = row.dodgePct * k;
    return out.effects.length || out.dodgePct ? out : null;
  }

  // A hero's exclusive gear skill, live only in its own role.
  function widget(data, key, lvl, role) {
    var w = data.widgets[key];
    lvl = Math.max(0, Math.min(10, lvl | 0));
    if (!w || !lvl || w.skill.role !== role) return null;
    var pct = data.widgetSkill.maxPct * data.widgetSkill.byLevel[lvl];
    return pct ? { kind: 'passive', effects: [{ code: w.skill.code, pct: pct }] } : null;
  }

  // A leader: every skill at its level, plus the exclusive gear's skill.
  // levels is [sk1, sk2, sk3]; a missing level is 5.
  function leader(data, hero, role) {
    var rows = data.heroSkills[hero.key] || [];
    var out = [];
    rows.forEach(function (row) {
      var i = +row.slot.slice(2) - 1;
      var lv = hero.levels && hero.levels[i] != null ? level(hero.levels[i]) : 5;
      var s = skill(row, lv);
      if (s) out.push(s);
    });
    var w = widget(data, hero.key, hero.widget, role);
    if (w) out.push(w);
    return out;
  }

  // The joiners that give a skill, in the order the game picks them.
  function chosen(joiners) {
    return joiners
      .map(function (j, at) { return { key: j.key, level: j.level == null ? 5 : level(j.level), at: at }; })
      .filter(function (j) { return j.key && j.level > 0; })
      .sort(function (a, b) { return b.level - a.level || a.at - b.at; })
      .slice(0, MAX_JOINERS);
  }

  function joinerSkills(data, joiners) {
    var out = [], rolled = {};
    chosen(joiners).forEach(function (j) {
      var row = (data.heroSkills[j.key] || []).filter(function (r) { return r.slot === 'sk1'; })[0];
      var s = row && skill(row, j.level);
      if (!s) return;
      var chance = s.kind === 'perRound' || s.kind === 'perAttack';
      if (chance && rolled[j.key]) return;
      if (chance) rolled[j.key] = true;
      out.push(s);
    });
    return out;
  }

  // Everything one side brings: role is rally, defender or solo. Joiners
  // only count in a rally or a reinforced garrison.
  function side(data, opts) {
    var role = opts.role || 'solo';
    var out = [];
    (opts.heroes || []).forEach(function (h) { if (h && h.key) out = out.concat(leader(data, h, role)); });
    if (role !== 'solo') out = out.concat(joinerSkills(data, opts.joiners || []));
    return out;
  }

  var api = { side: side, leader: leader, joiners: chosen, joinerSkills: joinerSkills, skill: skill, widget: widget, MAX_JOINERS: MAX_JOINERS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CombatSkills = api;
})(typeof self !== 'undefined' ? self : this);
