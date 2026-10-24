/* The upgrade priority page's goals: the player's own targets (preferences.priority.goals)
   and what each still needs, from UpgradeGoals over the shared save. The editor picks a kind,
   a target and a level; one goal per target, so a new level replaces the old one. A balance a
   goal needs and the save does not hold can be recorded in place; blank stays unknown. */
(function () {
  'use strict';
  var TOOLS = { building: ['town-centre/#town-buildings', 'town.nav', 'Town Centre'], hero: ['town-centre/#town-heroes', 'town.nav', 'Town Centre'], 'hero-gear': ['hero-gear/', 'ev.switch.gear', 'Gear'], 'governor-gear': ['governor-gear/#governor-planner', 'gov.nav', 'Governor'], 'governor-charm': ['governor-gear/#governor-planner', 'gov.nav', 'Governor'], pet: ['pets/#cage', 'pets.nav', 'Pets'], master: ['masters/', 'masters.nav', 'Masters'] };
  window.Interactions.register('upgrade-goals', function (context) {
    var api = context.api, engine = window.UpgradeGoals, store = null, painted = false;
    try { store = context.ledger; store.snapshot(); } catch (cause) { store = null; }
    function t(key, fallback) { return api.tr('priority.' + key, fallback || key); }
    function tpl(key, vars) { return api.fill(t(key), vars); }
    function one(key) { return context.targets(key)[0]; }
    function troop(type) { return api.tr('gear.' + type, type); }
    function building(id) { var b = window.BuildingData.buildings.find(function (x) { return x.id === id; }); return api.tr('town.building.' + id, b ? b.name : id); }
    function govPiece(id) {
      var p = window.GovernorData.gear.pieces.find(function (x) { return x.id === id; });
      return p ? api.fill(api.tr('gov.pieceTroop', '{slot} · {troop}'), { slot: api.tr('gov.slot.' + p.slot, p.slot), troop: troop(p.troop) }) : id;
    }
    function govLevel(index) {
      var row = window.GovernorData.gear.levels[index - 1];
      return row ? api.tr('gov.tier.' + row.tier, row.tier) + (row.grade ? ' T' + api.fmt(row.grade) : '') + ' ' + api.fmt(row.stars) + '★' : api.fmt(index);
    }
    function stars(index) { var s = Math.floor(index / 6), tier = index % 6; return api.fmt(s) + '★' + (tier ? ' ' + api.fmt(tier) + '/6' : ''); }
    // The goal's subject and a level in its own units.
    function subject(kind, id) {
      var found = engine.targets(kind).find(function (x) { return x.id === id; });
      if (kind === 'building') return building(id);
      if (kind === 'hero-gear') return found ? troop(found.troop) + ' · ' + api.tr('gear.' + found.slot, found.slot) : id;
      if (kind === 'governor-gear') return govPiece(id);
      if (kind === 'governor-charm') return found ? tpl('goal.charm', { piece: govPiece(found.piece), n: api.fmt(Number(id.slice(-1))) }) : id;
      return found ? found.name : id;
    }
    function level(kind, value) {
      if (kind === 'building') return String(value);
      if (kind === 'hero') return stars(value);
      if (kind === 'governor-gear') return govLevel(value);
      if (kind === 'master') return tpl('goal.affinity', { n: api.fmt(value) });
      return tpl('goal.lv', { n: api.fmt(value) });
    }
    function item(name) {
      if (name.kind === 'shards') return tpl(name.general ? 'item.shardsGeneral' : 'item.shards', { hero: name.hero });
      if (name.kind === 'emblems') return tpl('item.emblems', { master: name.master });
      return t('item.' + name.id);
    }
    function option(value, text) { var node = document.createElement('option'); node.value = value; node.textContent = text; return node; }
    function fillSelect(select, values, keep) {
      var was = keep ? select.value : '';
      select.textContent = '';
      values.forEach(function (v) { select.appendChild(option(v[0], v[1])); });
      if (values.some(function (v) { return v[0] === was; })) select.value = was;
    }
    // A new target offers the level after the one the save holds.
    function editor(fresh) {
      var kind = one('kind').value, target = one('target'), lv = one('level'), values;
      fillSelect(target, engine.targets(kind).map(function (x) { return [x.id, subject(kind, x.id)]; }), true);
      values = engine.levels(kind, target.value);
      fillSelect(lv, values.map(function (v) { return [String(v), level(kind, v)]; }), !fresh);
      if (!fresh || !store) return;
      var held = engine.current(store.snapshot(), kind, target.value), at = held === null ? -1 : values.findIndex(function (v) { return String(v) === String(held); });
      if (at >= 0 && at + 1 < values.length) lv.value = String(values[at + 1]);
    }
    function goals() { return store ? store.priority().goals : []; }
    function say(key) { one('saved').textContent = t(key); }
    function save(list) {
      try { store.setPriorityGoals(list); say('saved'); return true; } catch (cause) { say('saveFailed'); render(); return false; }
    }
    function figures(l) {
      if (l.have === null) return tpl('goal.needUnknown', { need: api.fmt(l.need) });
      return tpl(l.short ? 'goal.needShort' : 'goal.needCovered', { need: api.fmt(l.need), have: api.fmt(l.have), short: api.fmt(l.short) });
    }
    function lineNode(l) {
      var node = one('line').content.firstElementChild.cloneNode(true);
      node.dataset.state = l.have === null ? 'unknown' : l.short ? 'short' : 'covered';
      node.querySelector('[data-part="item"]').textContent = item(l.name);
      node.querySelector('[data-part="figures"]').textContent = figures(l);
      var slot = node.querySelector('[data-part="record"]'), proto = slot.firstElementChild;
      l.unknown.forEach(function (id) {
        var label = proto.cloneNode(true), input = label.querySelector('input');
        label.hidden = false;
        label.querySelector('span').textContent = tpl('goal.have', { item: id === l.pool ? t('item.' + id) : item(l.name) });
        input.dataset.item = id;
        slot.appendChild(label);
      });
      proto.remove();
      return node;
    }
    function goalNode(r, at) {
      var g = r.goal, node = one('item').content.firstElementChild.cloneNode(true), lines = node.querySelector('[data-part="lines"]');
      var unknown = r.lines.some(function (l) { return l.have === null; }), notes = [];
      node.dataset.state = r.state;
      node.querySelector('[data-part="title"]').textContent = tpl('goal.title', { what: subject(g.kind, g.target), level: level(g.kind, g.level) });
      var state = r.state === 'short' && (unknown || r.beyond || r.record.length) ? 'shortSoFar' : r.state;
      node.querySelector('[data-part="state"]').textContent = r.state === 'met' || r.state === 'cap' ? tpl('goal.state.' + state, { level: level(g.kind, r.from) }) : t('goal.state.' + state);
      r.lines.forEach(function (l) { lines.appendChild(lineNode(l)); });
      if (!r.lines.length) lines.remove();
      if (r.includes.length) notes.push(tpl('goal.includes', { list: r.includes.map(function (b) { return tpl('goal.includeOne', { building: building(b.building), from: b.from, level: b.level }); }).join(', ') }));
      r.record.filter(function (id) { return !(r.state === 'record' && id === g.target); }).forEach(function (id) { notes.push(tpl('goal.recordOther', { what: building(id) })); });
      if (r.mastery) notes.push(tpl('goal.mastery', { n: api.fmt(r.mastery) }));
      if (r.beyond) notes.push(t('goal.beyond'));
      if (r.unverified) notes.push(t('goal.unverified'));
      if (g.kind === 'master' && r.state !== 'met' && r.state !== 'record') notes.push(t('goal.affinityNote'));
      node.querySelector('[data-part="notes"]').textContent = notes.join(' ');
      node.querySelector('[data-part="notes"]').hidden = !notes.length;
      var link = node.querySelector('[data-part="link"]'), tool = TOOLS[g.kind];
      if (r.state === 'record' || r.record.length) { link.href = '../' + tool[0]; link.textContent = api.fill(t('openIn'), { tool: api.tr(tool[1], tool[2]) }); } else link.remove();
      node.querySelector('[data-part="remove"]').dataset.at = String(at);
      node.querySelector('[data-part="remove"]').setAttribute('aria-label', tpl('goal.removeOne', { goal: subject(g.kind, g.target) }));
      return node;
    }
    function render() {
      var snapshot = store ? store.snapshot() : { inventory: {}, preferences: {} }, results = engine.all(snapshot), list = one('list');
      context.nodes('select, button[type="submit"]').forEach(function (node) { node.disabled = !store; });
      editor(!painted); painted = true;
      list.textContent = '';
      results.forEach(function (r, at) { list.appendChild(goalNode(r, at)); });
      one('empty').hidden = Boolean(results.length);
      one('full').hidden = results.length < window.PlayerLedger.GOALS.max;
    }
    if (store) context.cleanup(store.subscribe(render));
    return { refresh: render, actions: {
      kind: { events: ['change'], run: function () { one('target').value = ''; editor(true); } },
      target: { events: ['change'], run: function () { editor(true); } },
      add: { events: ['submit'], preventDefault: true, run: function () {
        if (!store) return;
        var kind = one('kind').value, target = one('target').value, raw = one('level').value;
        if (!target || !raw) return;
        var goal = { kind: kind, target: target, level: kind === 'building' ? raw : Number(raw) }, list = goals();
        var at = list.findIndex(function (g) { return g.kind === kind && g.target === target; });
        if (at >= 0) list[at] = goal; else if (list.length < window.PlayerLedger.GOALS.max) list.push(goal); else return;
        save(list);
      } },
      // Focus moves to the goal that took its place, else the one before, else the editor.
      remove: { run: function (node) {
        var at = Number(node.dataset.at), list = goals();
        list.splice(at, 1);
        if (!save(list)) return;
        var left = context.nodes('[data-part="remove"]');
        (left[at] || left[at - 1] || one('kind')).focus();
      } },
      // A balance recorded from a goal's line; blank leaves it unknown, never zero.
      balance: { events: ['change'], run: function (node) {
        if (!store || node.value === '' || !node.validity.valid) return;
        try { store.setBalance(node.dataset.item, Number(node.value)); say('saved'); } catch (cause) { say('saveFailed'); }
      } }
    } };
  });
})();
