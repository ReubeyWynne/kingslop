/* The words for an upgrade priority step: its title and its reason, from the step's kind and
   the facts it carries, and the tool that does it. Shared by the upgrade priority page and the
   next-step lines on the tool pages, so a step reads the same wherever it shows. */
(function () {
  'use strict';
  var TOOLS = [['town-centre/', 'town.nav', 'Town Centre'], ['heroes/', 'directory.nav', 'Heroes'], ['hero-gear/', 'ev.switch.gear', 'Gear'], ['governor-gear/', 'gov.nav', 'Governor'], ['pets/', 'pets.nav', 'Pets'], ['masters/', 'masters.nav', 'Masters']];
  window.UpgradePriorityWords = function (api) {
    function t(key, fallback) { return api.tr('priority.' + key, fallback || key); }
    function tpl(key, vars) { return api.fill(t(key), vars); }
    function building(id) { var b = window.BuildingData.buildings.find(function (x) { return x.id === id; }); return api.tr('town.building.' + id, b ? b.name : id); }
    // Every dictionary has both the simulator's troop names and the gear page's.
    function troop(type) { return api.tr('sim.calc.' + type, api.tr('gear.' + type, type)); }
    function stars(at) { return api.fmt(at.stars) + '★' + (at.tier ? ' ' + api.fmt(at.tier) + '/6' : ''); }
    function govLevel(index) {
      var row = window.GovernorData.gear.levels[index - 1];
      return api.tr('gov.tier.' + row.tier, row.tier) + (row.grade ? ' T' + api.fmt(row.grade) : '') + ' ' + api.fmt(row.stars) + '★';
    }
    function profile(id) { return api.tr('gear.' + (id === 'rally' || id === 'garrison' ? id + 'Profile' : id), id); }
    function govPiece(p) { return api.fill(api.tr('gov.pieceTroop', '{slot} · {troop}'), { slot: api.tr('gov.slot.' + p.slot, p.slot), troop: troop(p.troop) }); }
    // Title and reason for one step, from its kind and the facts it carries.
    function words(step) {
      var p = step.params;
      switch (step.kind) {
        case 'record':
          if (p.what === 'hero-stars') return [tpl('a.recordStars', { hero: p.hero }), t('a.recordWhy')];
          if (window.BuildingData.buildings.some(function (b) { return b.id === p.what; })) return [tpl('a.recordBuilding', { building: building(p.what) }), t(p.what === 'town-center' ? 'a.recordTcWhy' : 'a.recordWhy')];
          return [t('a.record.' + p.what), t('a.recordWhy')];
        case 'tc-blocker':
          return p.unknown ? [tpl('a.recordBuilding', { building: building(p.building) }), tpl('a.blockerWhy', { level: p.next })]
            : [tpl('a.blocker', { building: building(p.building), level: p.level, from: p.from }), tpl('a.blockerWhy', { level: p.next })];
        case 'tc-next':
          return [tpl('a.tcNext', { level: p.level }), p.truegold ? tpl('a.tcNextGold', { n: api.fmt(p.truegold) }) : t('a.tcNextWhy')];
        case 'troop-lag': return [tpl('a.lag', { building: building(p.building), from: p.from }), tpl('a.lagWhy', { level: p.level })];
        case 'command-center': return [tpl('a.lag', { building: building('command-center'), from: p.from }), tpl('a.ccWhy', { level: p.level })];
        case 'war-academy': return p.build ? [t('a.waBuild'), t('a.waBuildWhy')] : [tpl('a.wa', { level: p.level, from: p.from }), t('a.waWhy')];
        case 'research': return [t('a.research.' + p.focus), t('a.researchWhy')];
        case 'hero-stars': return [tpl('a.stars', { hero: p.hero, from: stars(p.from), to: stars(p.to) }), tpl('a.starsWhy', { hero: p.hero, troop: troop(p.type) })];
        case 'hero-widget': return [tpl('a.widget', { hero: p.hero, from: api.fmt(p.from), to: api.fmt(p.to) }), t('a.widgetWhy')];
        case 'gear-next': return [tpl('a.gearNext', { troop: troop(p.type), slot: api.tr('gear.' + p.slot, p.slot), level: api.fmt(p.level) }), p.short.length
          ? tpl('a.gearNextShort', { profile: profile(p.profile), short: p.short.map(function (r) { return api.fmt(r.amount) + ' ' + (r.id === 'xp' ? t('res.xp') : api.tr('gear.' + r.id, r.id)); }).join(', ') })
          : tpl('a.gearNextReady', { profile: profile(p.profile) })];
        case 'gear-spend': return [tpl('a.hammers', { n: api.fmt(p.steps) }), t('a.hammersWhy')];
        case 'governor-gear': return [tpl('a.gov', { piece: govPiece(p), level: govLevel(p.to) }), tpl('a.govWhy.' + p.goal, { n: api.fmt(p.steps) })];
        case 'governor-charms': return [tpl('a.charm', { piece: govPiece(p), level: api.fmt(p.to) }), tpl('a.govWhy.' + p.goal, { n: api.fmt(p.steps) })];
        case 'pet-advance': return [tpl('a.advance', { pet: p.pet }), tpl('a.advanceWhy', { level: api.fmt(p.level) })];
        case 'pet-focus': return [tpl('a.petFocus', { pet: p.pet }), tpl('a.petFocusWhy', { level: api.fmt(p.level), top: api.fmt(p.top) })];
        case 'master-class': return [tpl('a.masterClass', { master: p.master, name: p.className }), t('a.masterClassWhy')];
        case 'master-skills': return [tpl('a.masterSkills', { master: p.master, n: api.fmt(p.manuscripts) }), t('a.masterSkillsWhy')];
      }
      return [step.kind, ''];
    }
    function tool(href) { return TOOLS.find(function (entry) { return href.indexOf(entry[0]) === 0; }); }
    return { t: t, tpl: tpl, words: words, tool: tool };
  };
})();
