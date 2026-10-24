/* The upgrade priority page: paints UpgradePriority.evaluate over the shared save. The stage
   comes from the saved Town Centre level and can be previewed without saving; the role is a
   ledger preference (`preferences.priority.role`), so it travels with the player save. */
(function () {
  'use strict';
  var SHOWN = 5;
  var TOOLS = [['town-centre/', 'town.nav', 'Town Centre'], ['heroes/', 'directory.nav', 'Heroes'], ['hero-gear/', 'ev.switch.gear', 'Gear'], ['governor-gear/', 'gov.nav', 'Governor'], ['pets/', 'pets.nav', 'Pets'], ['masters/', 'masters.nav', 'Masters']];
  window.Interactions.register('upgrade-priority', function (context) {
    var api = context.api, engine = window.UpgradePriority, preview = null, store = null;
    try { store = window.PlayerLedger.shared(); store.snapshot(); } catch (cause) { store = null; }
    function t(key, fallback) { return api.tr('priority.' + key, fallback || key); }
    function tpl(key, vars) { return api.fill(t(key), vars); }
    function building(id) { var b = window.BuildingData.buildings.find(function (x) { return x.id === id; }); return api.tr('town.building.' + id, b ? b.name : id); }
    function troop(type) { return api.tr('gear.' + type, type); }
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
    function item(step, n) {
      var node = context.targets('item')[0].content.firstElementChild.cloneNode(true), text = words(step), link = node.querySelector('[data-part="link"]');
      node.dataset.kind = step.kind;
      node.querySelector('.rule-num').textContent = api.fmt(n);
      node.querySelector('[data-part="title"]').textContent = text[0];
      node.querySelector('[data-part="why"]').textContent = text[1];
      node.querySelector('[data-part="scores"]').hidden = !step.scores;
      var target = step.href && tool(step.href);
      if (target) { link.href = '../' + step.href; link.textContent = api.fill(t('openIn'), { tool: api.tr(target[1], target[2]) }); } else link.remove();
      return node;
    }
    function fill(list, steps, from) {
      list.textContent = '';
      steps.forEach(function (step, at) { list.appendChild(item(step, from + at + 1)); });
    }
    function render() {
      var snapshot = store ? store.snapshot() : { inventory: {}, preferences: {} };
      var result = engine.evaluate(snapshot, { stage: preview });
      var status = context.targets('status')[0];
      status.removeAttribute('data-i18n');
      if (!store) status.textContent = t('saveFailed');
      else if (result.townCenter === null) status.textContent = t('tcUnknown');
      else status.textContent = tpl('tcKnown', { level: result.townCenter, stage: t('stage.' + result.own) });
      if (preview && preview !== result.own) status.textContent += ' ' + tpl('previewing', { stage: t('stage.' + preview) });
      context.targets('stage').forEach(function (node) {
        var id = node.dataset.stage, button = node.querySelector('button');
        node.dataset.state = id === result.own ? 'current' : id === result.stage ? 'preview' : '';
        button.disabled = false;
        button.setAttribute('aria-pressed', String(id === result.stage));
      });
      context.targets('role').forEach(function (node) {
        node.disabled = !store;
        node.setAttribute('aria-pressed', String(node.dataset.role === result.role));
        node.dataset.default = String(!result.roleSaved && node.dataset.role === result.role);
      });
      fill(context.targets('list')[0], result.actions.slice(0, SHOWN), 0);
      var rest = result.actions.slice(SHOWN), more = context.targets('more')[0];
      more.hidden = !rest.length;
      fill(context.targets('rest')[0], rest, SHOWN);
      var label = context.targets('moreLabel')[0]; label.removeAttribute('data-i18n'); label.textContent = tpl('moreN', { n: api.fmt(rest.length) });
      var at = engine.rules.stages.findIndex(function (s) { return s.id === (result.stage || 'foundation'); });
      function later(stage) { return Boolean(stage) && engine.rules.stages.findIndex(function (s) { return s.id === stage; }) > at; }
      context.targets('ladder').forEach(function (ladder) {
        ladder.dataset.later = String(later(ladder.dataset.stage));
        ladder.querySelectorAll('li').forEach(function (rung) { rung.dataset.later = String(later(rung.dataset.stage) || Boolean(rung.dataset.role) && rung.dataset.role !== result.role); });
      });
    }
    if (store) context.cleanup(store.subscribe(render));
    context.listen(document, 'ks:kingdom-change', render);
    return { refresh: render, actions: {
      preview: { run: function (node) {
        var snapshot = store ? store.snapshot() : null, own = snapshot && snapshot.buildings && snapshot.buildings.levels ? engine.stageAt(snapshot.buildings.levels['town-center'] || '') : null;
        preview = node.dataset.stage === (own && own.id) || node.dataset.stage === preview ? null : node.dataset.stage;
        render();
      } },
      role: { run: function (node) {
        var saved = context.targets('saved')[0];
        try { store.setPriorityRole(node.dataset.role); saved.textContent = t('saved'); } catch (cause) { saved.textContent = t('saveFailed'); render(); }
      } }
    } };
  });
})();
