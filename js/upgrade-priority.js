/* What to upgrade next. Reads the shared player save and returns the account's stage, from
   its Town Centre level, and a ranked list of next steps across buildings, research, heroes,
   hero gear, governor gear and charms, pets and masters.

   Every step is a fact from the save meeting a rule from _data/upgrade_priority.json:
   - Buildings: the Town Centre's next step and whatever its prerequisites in
     _data/buildings.json still need; from TG 1 the troop buildings and the Command Center
     once they fall a whole TG tier (five steps) behind it, and the War Academy, which opens
     T11 at its own TG 5.
   - Heroes: one core hero per troop type, the newest generation you own (legendary first,
     then stars). Star steps and widget levels are HeroSpend.plan's for the core alone, so
     general shards go to the core first.
   - Hero gear: the gear page's own forward planner (HeroGear.redPlans) under the player's
     saved profile weights; Forgehammer mastery steps are HeroGear.spendable's.
   - Governor: the governor page's planner (Governor.plan) under the saved goal and troop
     focus, never a fixed troop order or "keep them level".
   - Pets: an Advance waiting at a level cap; then the role's focus pet if it is not yet
     your highest.
   - Masters: the classes and skill levels MasterSpend.plan says your emblems and
     manuscripts pay for.
   - Research is not in the save, so each stage names its research focus.
   Each step's weight comes from its stage and the role (lead, joiner or farm); it only
   orders the list. A step whose materials score in KvK prep or Strongest Governor is marked
   `scores`, so the page can say to spend it then. Unknown facts become "record" steps and
   never count as zero. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../_data/upgrade_priority.json'), require('../_data/buildings.json'), require('../_data/heroes.json').heroes, require('../_data/pets.json'), require('../_data/governor.json'), require('./hero-spend.js'), require('./master-spend.js'), require('./hero-gear-engine.js'), require('./governor-engine.js'));
  else root.UpgradePriority = factory(root.UpgradePriorityData, root.BuildingData, root.HeroCatalogue, root.PetData, root.GovernorData, root.HeroSpend, root.MasterSpend, root.HeroGear, root.Governor);
})(typeof window === 'object' ? window : globalThis, function (rules, buildingData, catalogue, petData, governorData, heroSpend, masterSpend, heroGear, governor) {
  'use strict';
  var BUILDINGS = (buildingData && buildingData.buildings) || [];
  var LADDER = [];
  var TC = BUILDINGS.find(function (b) { return b.id === 'town-center'; });
  if (TC) TC.levels.forEach(function (row) { LADDER.push(row.id); });
  var TYPES = ['inf', 'arc', 'cav'], TROOP_BUILDING = { inf: 'barracks', arc: 'range', cav: 'stable' };
  var RARITY = { legendary: 3, epic: 2, rare: 1 };
  function find(id) { return BUILDINGS.find(function (b) { return b.id === id; }) || null; }
  // A level id on the Town Centre's ladder: -1 not built, null unknown or not a level.
  function rank(level) { if (level === '0') return -1; var at = LADDER.indexOf(level); return at < 0 ? null : at; }
  function confirmed(snapshot, id) { var entry = snapshot.inventory && Object.hasOwn(snapshot.inventory, id) ? snapshot.inventory[id] : null; return entry && entry.status === 'confirmed' ? entry.amount : null; }
  function levels(snapshot) { return (snapshot.buildings && snapshot.buildings.levels) || {}; }
  function stageAt(level) {
    var at = rank(level);
    if (at === null || at < 0) return null;
    return rules.stages.find(function (stage) { return at >= rank(stage.from) && at <= rank(stage.to); }) || null;
  }
  function stageIndex(id) { return rules.stages.findIndex(function (stage) { return stage.id === id; }); }
  function role(value) { return rules.roles.includes(value) ? value : 'joiner'; }
  function weight(kind, stage, who) {
    var base = (rules.weights[kind] || {})[stage] || 0, scale = (rules.roleWeights[who] || {})[kind];
    return Math.round(base * (scale === undefined ? 1 : scale));
  }
  function starText(index) { var stars = Math.floor(index / 6), tier = index % 6; return { stars: stars, tier: tier }; }

  function buildingSteps(snapshot, add) {
    var have = levels(snapshot), tc = have['town-center'];
    var at = tc === undefined ? null : rank(tc);
    if (at === null) { add('record', { what: 'town-center' }, 'town-centre/#town-buildings'); return; }
    var next = TC.levels[at + 1], blocked = [];
    if (next) {
      var blockers = [];
      (next.requires || []).forEach(function (need) {
        var mine = have[need.building];
        if (mine === undefined) { blockers.push({ building: need.building, level: need.level, unknown: true }); return; }
        if (rank(mine) === null || rank(mine) < rank(need.level)) blockers.push({ building: need.building, level: need.level, from: mine });
      });
      blockers.forEach(function (b) {
        if (b.unknown) add('tc-blocker', { building: b.building, level: b.level, next: next.id, unknown: true }, 'town-centre/#town-buildings');
        else add('tc-blocker', { building: b.building, level: b.level, from: b.from, next: next.id }, 'town-centre/#town-buildings', { scores: Boolean(next.cost && next.cost.truegold) });
      });
      blocked = blockers.map(function (b) { return b.building; });
      if (!blockers.length) add('tc-next', { from: tc, level: next.id, truegold: next.cost ? next.cost.truegold || 0 : 0 }, 'town-centre/#town-buildings', { scores: Boolean(next.cost && next.cost.truegold) });
    }
    if (at < rank(rules.unlocks.warAcademy)) return;
    // From TG 1: troop buildings and the Command Center a whole TG tier behind the Town Centre.
    var lagging = [];
    TYPES.forEach(function (type) {
      var id = TROOP_BUILDING[type], mine = have[id];
      if (mine === undefined) { add('record', { what: id }, 'town-centre/#town-buildings'); return; }
      if (!blocked.includes(id) && rank(mine) !== null && at - rank(mine) >= rules.lagSteps) lagging.push({ id: id, from: mine, behind: at - rank(mine) });
    });
    lagging.sort(function (a, b) { return b.behind - a.behind; }).slice(0, 1).forEach(function (b) { add('troop-lag', { building: b.id, from: b.from, level: tc }, 'town-centre/#town-buildings', { scores: true }); });
    var cc = have['command-center'];
    if (cc !== undefined && !blocked.includes('command-center') && rank(cc) !== null && at - rank(cc) >= rules.lagSteps) add('command-center', { from: cc, level: tc }, 'town-centre/#town-buildings', { scores: true });
    var wa = have['war-academy'];
    if (wa === undefined) add('record', { what: 'war-academy' }, 'town-centre/#town-buildings');
    else if (wa === '0') add('war-academy', { build: true }, 'town-centre/#town-buildings');
    else if (at >= rank(rules.unlocks.t11) && rank(wa) !== null && rank(wa) < rank(rules.unlocks.t11)) add('war-academy', { from: wa, level: rules.unlocks.t11 }, 'town-centre/#town-buildings', { scores: true });
  }

  // One hero per troop type: newest generation, then rarity, then stars.
  function core(snapshot) {
    var roster = (snapshot.heroes && snapshot.heroes.roster) || {}, out = {};
    (catalogue || []).forEach(function (hero) {
      if (!Object.hasOwn(roster, hero.key) || !TYPES.includes(hero.type)) return;
      var copy = roster[hero.key], best = out[hero.type];
      var key = [hero.generation, RARITY[hero.rarity] || 0, copy.stars || 0];
      if (!best || key[0] > best.rank[0] || key[0] === best.rank[0] && (key[1] > best.rank[1] || key[1] === best.rank[1] && key[2] > best.rank[2])) out[hero.type] = { hero: hero, copy: copy, rank: key };
    });
    return out;
  }
  /* Star steps and widget levels for the core alone: HeroSpend shares general shards across
     every owned hero because it counts what can score; guidance spends them on the core first. */
  function heroSteps(snapshot, add) {
    var roster = (snapshot.heroes && snapshot.heroes.roster) || {};
    if (!Object.keys(roster).length) { add('record', { what: 'heroes' }, 'town-centre/#town-heroes'); return; }
    var picks = core(snapshot), only = {};
    TYPES.forEach(function (type) { if (picks[type]) only[picks[type].hero.key] = roster[picks[type].hero.key]; });
    var plan = heroSpend ? heroSpend.plan(Object.assign({}, snapshot, { heroes: Object.assign({}, snapshot.heroes, { roster: only }) })) : { heroes: {} };
    TYPES.forEach(function (type) {
      var pick = picks[type];
      if (!pick) return;
      var entry = plan.heroes[pick.hero.key] || {};
      if (pick.copy.stars === null || pick.copy.stars === undefined) { add('record', { what: 'hero-stars', hero: pick.hero.name }, 'town-centre/#town-heroes'); return; }
      if (entry.shards && entry.shards.to > entry.shards.from) add('hero-stars', { hero: pick.hero.name, type: type, from: starText(entry.shards.from), to: starText(entry.shards.to) }, 'heroes/#kvk-points', { scores: true });
      if (entry.widget && entry.widget.to > entry.widget.from) add('hero-widget', { hero: pick.hero.name, type: type, from: entry.widget.from, to: entry.widget.to }, 'heroes/#kvk-points', { scores: true });
    });
  }

  /* The gear page's own forward planner (HeroGear.redPlans) with the player's saved profile
     weights, so the step here is the one the gear page recommends. */
  function gearSteps(snapshot, add) {
    var pieces = (snapshot.heroGear && snapshot.heroGear.pieces) || {}, known = {};
    Object.keys(pieces).forEach(function (id) { if (pieces[id] && pieces[id].level !== null && pieces[id].level !== undefined) known[id] = pieces[id]; });
    if (!Object.keys(known).length || !heroGear) { add('record', { what: 'hero-gear' }, 'town-centre/#town-hero-gear'); return; }
    var bag = { xp: confirmed(snapshot, 'hero-gear-xp'), hammers: confirmed(snapshot, 'forgehammer'), mythic: confirmed(snapshot, 'spare-mythic-gear'), mithril: confirmed(snapshot, 'mithril') };
    var state = heroGear.normaliseState(Object.assign(heroGear.defaults(), (snapshot.preferences && snapshot.preferences.heroGear) || {}));
    Object.keys(known).forEach(function (id) { if (Object.hasOwn(state.pieces, id)) state.pieces[id] = heroGear.normalisePiece(known[id]); });
    heroGear.RES.forEach(function (r) { state.resources[r] = bag[r] || 0; });
    var route = heroGear.redPlans(state).routes[0];
    if (route) {
      var short = heroGear.RES.filter(function (r) { return route.gap[r] > 0; }).map(function (r) { return { id: r, amount: route.gap[r] }; });
      add('gear-next', { id: route.id, type: route.id.split('-')[0], slot: route.id.split('-')[1], level: route.to.level, short: short, profile: state.profile }, 'hero-gear/', { scores: true });
    }
    if (bag.xp === null || bag.hammers === null || bag.mythic === null) return;
    var spend = heroGear.spendable(known, { xp: bag.xp, hammers: bag.hammers, mythic: bag.mythic, mithril: bag.mithril || 0 });
    if (spend.steps) add('gear-spend', { steps: spend.steps, hammers: spend.spent.hammers, mithril: spend.spent.mithril }, 'hero-gear/#kvk-points', { scores: true });
  }

  /* The governor page's planner (Governor.plan) with the saved troop profile (Bear first
     unless another is saved): the affordable step with the most weighted gain for the share
     of the bag it uses. */
  function governorSteps(snapshot, at, add) {
    if (!governor) return;
    var prefs = Object.assign({}, (snapshot.preferences && snapshot.preferences.governor) || {});
    var kinds = at >= rank(rules.unlocks.governorCharms) ? ['gear', 'charms'] : ['gear'], recorded = false;
    kinds.forEach(function (kind) {
      var section = kind === 'gear' ? snapshot.governorGear : snapshot.governorCharms, field = kind === 'gear' ? 'pieces' : 'slots';
      if (!section || section.status !== 'tracked') { if (!recorded) add('record', { what: 'governor' }, 'town-centre/#town-governor'); recorded = true; return; }
      var state = {};
      governor.items(kind).forEach(function (item) { var entry = section[field][item.id]; state[item.id] = entry && entry.level !== null && entry.level !== undefined ? entry.level : null; });
      var materials = {}, unknown = false;
      governor.data[kind].materials.forEach(function (id) { var n = confirmed(snapshot, id); if (n === null) unknown = true; materials[id] = n || 0; });
      if (unknown) { if (!recorded) add('record', { what: 'governor-materials' }, 'town-centre/#town-governor'); recorded = true; return; }
      var plan = governor.plan(kind, state, materials, { profile: prefs.profile, goal: prefs.goal, limit: 60 });
      if (!plan.steps.length) return;
      var first = plan.steps[0], item = governor.items(kind).find(function (i) { return i.id === first.id; });
      var piece = kind === 'gear' ? item : governorData.gear.pieces.find(function (p) { return p.id === item.piece; });
      add(kind === 'gear' ? 'governor-gear' : 'governor-charms', { id: first.id, troop: first.troop, slot: piece ? piece.slot : null, from: first.from, to: first.to, steps: plan.steps.length, goal: plan.goal }, 'governor-gear/#governor-planner', { scores: true });
    });
  }

  function petSteps(snapshot, who, add) {
    var roster = (snapshot.pets && snapshot.pets.roster) || {}, tamed = Object.keys(roster);
    if (!tamed.length) { add('record', { what: 'pets' }, 'pets/#cage'); return; }
    var pets = (petData && petData.pets) || [];
    pets.forEach(function (pet) {
      var copy = roster[pet.id];
      if (!copy || copy.level === null || copy.level >= pet.maxLevel || copy.level % 10 || copy.advanced) return;
      add('pet-advance', { pet: pet.name, level: copy.level }, 'pets/#advances', { scores: true });
    });
    var focus = (rules.petFocus[who] || []).find(function (id) { return Object.hasOwn(roster, id); });
    if (!focus) return;
    var top = Math.max.apply(null, tamed.map(function (id) { return roster[id].level || 0; })), mine = roster[focus].level || 0;
    var pet = pets.find(function (p) { return p.id === focus; });
    if (pet && mine < top && mine < pet.maxLevel) add('pet-focus', { pet: pet.name, level: mine, top: top }, 'pets/#cage');
  }

  function masterSteps(snapshot, add) {
    if (!masterSpend) return;
    var plan = masterSpend.plan(snapshot);
    Object.keys(plan.masters || {}).forEach(function (id) {
      var entry = plan.masters[id], master = masterSpend.find(id);
      if (!master) return;
      if (entry.emblems && entry.emblems.spend) add('master-class', { master: master.name, className: entry.emblems.className }, 'masters/#kvk-points', { scores: true });
      if (entry.manuscripts && entry.manuscripts.spend) add('master-skills', { master: master.name, manuscripts: entry.manuscripts.spend }, 'masters/#kvk-points', { scores: true });
    });
  }

  /* settings.role picks the weights (default the saved role, else joiner); settings.stage
     previews another stage when the Town Centre is unknown or the player wants to look ahead. */
  function evaluate(snapshot, settings) {
    settings = settings || {};
    var saved = snapshot.preferences && snapshot.preferences.priority && snapshot.preferences.priority.role;
    var who = role(settings.role || saved), tc = levels(snapshot)['town-center'];
    var own = tc === undefined ? null : stageAt(tc);
    var stage = settings.stage && stageIndex(settings.stage) >= 0 ? rules.stages[stageIndex(settings.stage)] : own;
    var actions = [];
    function add(kind, params, href, extra) {
      var id = stage ? stage.id : 'foundation', w = kind === 'record' ? weight(kind, id, who) + (params.what === 'town-center' ? 70 : 0) : weight(kind, id, who);
      if (!w) return;
      actions.push({ kind: kind, params: params, href: href, scores: Boolean(extra && extra.scores), weight: w });
    }
    var at = tc === undefined ? null : rank(tc), level = at === null ? -1 : at;
    buildingSteps(snapshot, add);
    if (stage) add('research', { focus: who === 'farm' && stageIndex(stage.id) >= stageIndex('gear') ? 'economy' : rules.research[stage.id] }, '');
    heroSteps(snapshot, add);
    if (level >= rank(rules.unlocks.heroGear)) gearSteps(snapshot, add);
    if (level >= rank(rules.unlocks.governorGear)) governorSteps(snapshot, level, add);
    petSteps(snapshot, who, add);
    masterSteps(snapshot, add);
    actions.sort(function (a, b) { return b.weight - a.weight; });
    return { stage: stage ? stage.id : null, own: own ? own.id : null, townCenter: tc === undefined ? null : tc, role: who, roleSaved: rules.roles.includes(saved) ? saved : null, actions: actions };
  }
  // The ladder rungs that apply at a stage and role, per system.
  function ladders(stage, who) {
    var at = stage ? stageIndex(stage) : 0;
    return rules.ladders.filter(function (ladder) { return !ladder.stage || stageIndex(ladder.stage) <= at; }).map(function (ladder) {
      return { id: ladder.id, titleKey: ladder.titleKey, href: ladder.href, rungs: ladder.rungs.filter(function (rung) { return (!rung.stage || stageIndex(rung.stage) <= at) && (!rung.role || rung.role === who); }) };
    });
  }
  return { rules: rules, rank: rank, stageAt: stageAt, core: core, evaluate: evaluate, ladders: ladders, starText: starText };
});
