/* What the masters bag can actually be spent on. Event points for Master Emblems and
   Master's Manuscripts are paid per piece consumed, so a piece only scores if an unlocked
   master still has a step it can pay for. One plan serves the Town Centre totals and the
   Masters page, so both count the same spendable pieces.

   Costs come from _data/masters.json (.dsh/build-masters.py):
   - Emblems: a master's next affinity class (levels 10, 20 … 100) costs its own emblems.
     It is only payable once the affinity bar is full at level 9, 19 … 99, which the
     player marks (`ready`), because affinity points are not tracked. General Master
     Emblems turn into any master's emblems; converting scores nothing, spending does.
     Own emblems pay first and general ones are shared by HeroSpend.allocate, the same
     grouped knapsack that shares general hero shards.
   - Manuscripts: each skill level costs its manuscripts and needs its requirement (an
     affinity level, or a total of the master's four skill levels). Level 1 of a skill is
     free once affinity allows it. Steps are paid whole, cheapest first across every
     master, which is the same rule as the building plan's points ceiling. A class the
     emblems pay for counts first, so the skills it opens can take manuscripts too.
   Special Research, the large emblem sink from affinity 100, is left out until its emblem
   cost per research is confirmed. Unknown levels or balances count as nothing and are
   listed, so a total is never inflated. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../_data/masters.json'), require('./player-ledger.js'), require('./hero-spend.js'));
  else root.MasterSpend = factory(root.MasterData, root.PlayerLedger, root.HeroSpend);
})(typeof window === 'object' ? window : globalThis, function (data, ledger, heroSpend) {
  'use strict';
  var EMBLEM = 'master-emblem', GENERAL = 'general-master-emblem', MANUSCRIPT = 'masters-manuscript', ITEMS = [EMBLEM, MANUSCRIPT];
  var MASTERS = ((data && data.masters) || []).map(function (master) { return { id: master.id, name: master.name, unlockDay: master.unlockDay, verified: master.verified, classes: master.affinity.classes, skills: master.skills }; });
  var emblemId = ledger.masterEmblemId;
  function confirmed(snapshot, id) { var entry = snapshot.inventory && Object.hasOwn(snapshot.inventory, id) ? snapshot.inventory[id] : null; return entry && entry.status === 'confirmed' ? entry.amount : null; }
  function find(id) { return MASTERS.find(function (master) { return master.id === id; }) || null; }
  // The class a master stands in at an affinity level, 0 before level 1 and 11 (Kindred Soul) at 100. The talent level is the same number.
  function classAt(master, affinity) { return affinity === null ? null : master.classes.filter(function (entry) { return entry.level <= affinity; }).length; }
  // The class waiting at the next gate: level 9 waits on level 10's class, and so on.
  function gate(master, affinity) { return affinity !== null && affinity % 10 === 9 ? master.classes.find(function (entry) { return entry.level === affinity + 1; }) || null : null; }
  function total(levels) { return levels.reduce(function (sum, level) { return sum + level; }, 0); }
  // Can the skill take its next level? Needs the affinity or total skill level that level names.
  function open(master, affinity, levels, at) {
    var skill = master.skills[at], level = levels[at];
    if (level >= skill.max) return false;
    var need = skill.levels[level].requires;
    return !need || (need.affinity === undefined || affinity >= need.affinity) && (need.total === undefined || total(levels) >= need.total);
  }
  function plan(snapshot) {
    var roster = (snapshot.masters && snapshot.masters.roster) || {}, unknown = [], masters = {}, items = {};
    var owned = MASTERS.filter(function (master) { return Object.hasOwn(roster, master.id); });
    function note(id, item) { if (!unknown.includes(id)) unknown.push(id); if (item && !items[item].unknown.includes(id)) items[item].unknown.push(id); }
    // With no masters recorded nothing can be spent yet, which is unknown rather than zero.
    ITEMS.forEach(function (id) { items[id] = { amount: 0, pool: 0, used: 0, left: 0, unknown: [] }; });
    if (!owned.length) ITEMS.forEach(function (id) { note('masters', id); });
    owned.forEach(function (master) {
      var copy = roster[master.id];
      masters[master.id] = { id: master.id, name: master.name, affinity: copy.affinity, talent: classAt(master, copy.affinity), emblems: null, manuscripts: null };
      if (copy.affinity === null) { note('master-affinity-' + master.id, EMBLEM); note('master-affinity-' + master.id, MANUSCRIPT); }
    });

    // Emblems: one class advancement per master whose bar is full, own emblems first, then general ones shared.
    var waiting = owned.filter(function (master) { var copy = roster[master.id]; return copy.ready && gate(master, copy.affinity); });
    var general = confirmed(snapshot, GENERAL);
    if (general === null && waiting.length) note(GENERAL, EMBLEM);
    var groups = waiting.map(function (master) {
      var own = confirmed(snapshot, emblemId(master.id));
      if (own === null) note(emblemId(master.id), EMBLEM);
      return { totals: [0, gate(master, roster[master.id].affinity).emblems], own: own || 0, shared: true };
    });
    var picks = heroSpend.allocate(general || 0, groups), used = 0;
    waiting.forEach(function (master, at) {
      var cost = groups[at].totals[1], step = picks[at].steps, next = gate(master, roster[master.id].affinity);
      masters[master.id].emblems = { from: roster[master.id].affinity, to: roster[master.id].affinity + step, className: next.name, cost: cost, spend: step ? cost : 0, own: groups[at].own, ownUsed: step ? cost - picks[at].general : 0, general: picks[at].general };
      items[EMBLEM].amount += step ? cost : 0; used += picks[at].general;
    });
    items[EMBLEM].used = used;
    if (general === null) items[EMBLEM].pool = items[EMBLEM].left = null;
    else { items[EMBLEM].pool = general; items[EMBLEM].left = general - used; }

    // Manuscripts: whole skill levels, cheapest first across every master, each once its requirement is met.
    var pool = confirmed(snapshot, MANUSCRIPT), left = pool || 0, state = [];
    if (pool === null && owned.length) note(MANUSCRIPT, MANUSCRIPT);
    owned.forEach(function (master) {
      var copy = roster[master.id];
      if (copy.affinity === null) return;
      if (copy.skills.some(function (level) { return level === null; })) { note('master-skills-' + master.id, MANUSCRIPT); return; }
      var levels = copy.skills.map(function (level, at) { return Math.min(level, master.skills[at].max); });
      // A class the emblems pay for raises affinity first, so its skill gates open in the same plan.
      var reached = masters[master.id].emblems ? masters[master.id].emblems.to : copy.affinity;
      state.push({ master: master, affinity: reached, from: levels.slice(), levels: levels, spend: 0, learningXp: 0 });
    });
    for (;;) {
      var best = null;
      state.forEach(function (entry) {
        entry.levels.forEach(function (level, at) {
          if (!open(entry.master, entry.affinity, entry.levels, at)) return;
          var step = entry.master.skills[at].levels[level];
          if (!best || step.manuscripts < best.step.manuscripts) best = { entry: entry, at: at, step: step };
        });
      });
      if (!best || best.step.manuscripts > left) break;
      left -= best.step.manuscripts; best.entry.levels[best.at]++;
      best.entry.spend += best.step.manuscripts; best.entry.learningXp += best.step.learningXp;
    }
    state.forEach(function (entry) {
      masters[entry.master.id].manuscripts = { from: entry.from, to: entry.levels.slice(), spend: entry.spend, learningXp: entry.learningXp };
      items[MANUSCRIPT].amount += entry.spend;
    });
    items[MANUSCRIPT].used = items[MANUSCRIPT].amount;
    if (pool === null) items[MANUSCRIPT].pool = items[MANUSCRIPT].left = null;
    else { items[MANUSCRIPT].pool = pool; items[MANUSCRIPT].left = left; }
    return { masters: masters, items: items, unknown: unknown, owned: owned.length };
  }
  /* The snapshot an event calculator should score: the emblem and manuscript balances become
     the pieces the plan can consume, so rates and days stay with the event rules. */
  function budget(snapshot, known) {
    var result = known || plan(snapshot), inventory = Object.assign({}, snapshot.inventory);
    ITEMS.forEach(function (id) { inventory[id] = { amount: result.items[id].amount, status: 'confirmed', provenance: null }; });
    return Object.assign({}, snapshot, { inventory: inventory });
  }
  // Points one master's spendable pieces score in an event, each kind on its best day.
  function points(rules, event, entry) {
    var emblem = heroSpend.rate(rules, event, EMBLEM), manuscript = heroSpend.rate(rules, event, MANUSCRIPT);
    var fromEmblems = entry.emblems && emblem ? entry.emblems.spend * emblem.rate : 0, fromManuscripts = entry.manuscripts && manuscript ? entry.manuscripts.spend * manuscript.rate : 0;
    return { emblems: fromEmblems, manuscripts: fromManuscripts, total: fromEmblems + fromManuscripts, emblemDay: emblem && emblem.day, manuscriptDay: manuscript && manuscript.day };
  }
  // What an unknown id from the plan asks for, so pages can name it: { kind, master }.
  function missing(id) {
    if (id === 'masters') return { kind: 'masters', master: null };
    var m = /^master-(affinity|skills|emblems)-([a-z][a-z0-9]*)$/.exec(id), master = m && find(m[2]);
    return master ? { kind: m[1], master: master } : null;
  }
  return { EMBLEM: EMBLEM, GENERAL: GENERAL, MANUSCRIPT: MANUSCRIPT, ITEMS: ITEMS.slice(), MASTERS: MASTERS, emblemId: emblemId, find: find, classAt: classAt, gate: gate, open: open, plan: plan, budget: budget, points: points, missing: missing };
});
