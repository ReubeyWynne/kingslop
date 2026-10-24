/* The Heroes page's KvK points: what each owned hero's shards and widgets score when
   spent. The plan and every rate come from HeroSpend and the event rules, the same
   numbers the Town Centre totals use; this file only paints them. */
(function () {
  'use strict';
  var EN = {
    'missing.heroes': 'your heroes', 'missing.stars': '{hero} stars', 'missing.shards': '{hero} shards', 'missing.widgetLevel': '{hero} widget level', 'missing.widgets': '{hero} widgets', 'missing.chest': 'generation {n} widget chests',
    total: '{n} KvK prep points', complete: 'Every hero count this uses is entered.', partial: 'Partial: {names} not entered yet, so the total leaves them out.', more: '{n} more',
    empty: 'Mark the heroes you own, with their stars, to see what their shards and widgets can score.',
    stars: '{from} → {to}', maxed: 'maxed', none: '—', pieces: '{own} own + {general} general', widgetPieces: '{own} own + {general} chest', widgetLevel: 'widget {from} → {to}',
    leftShards: 'Unused general shards: {mythic} mythic, {epic} epic, {rare} rare.', leftWidgets: 'Unused widget chests: {n}.', unknownCount: '?'
  };
  function t(api, key) { return api.tr('spend.' + key, EN[key]); }
  function fill(api, key, values) { return api.fill(t(api, key), values); }
  function stars(api, index) { var at = window.HeroDirectory.stars(index); return api.fmt(at.stars) + '★' + (at.tier ? ' ' + api.fmt(at.tier) + '/6' : ''); }
  function element(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  // A missing fact named for people: "Jabel stars", "your heroes".
  function missing(api, need) { return need.hero ? fill(api, 'missing.' + need.kind, { hero: need.hero.name }) : need.generation ? fill(api, 'missing.' + need.kind, { n: api.fmt(need.generation) }) : t(api, 'missing.' + need.kind); }
  function names(api, ids) {
    var out = ids.slice(0, 3).map(function (id) { var need = window.HeroSpend.missing(id), item = window.EventRuleData.items.find(function (entry) { return entry.id === id; }); return need ? missing(api, need) : item ? api.tr(item.key, item.label) : id; });
    if (ids.length > 3) out.push(fill(api, 'more', { n: api.fmt(ids.length - 3) }));
    return out.join(', ');
  }
  window.HeroPoints = { missing: missing };

  window.Interactions.register('hero-points', function (context) {
    var S = window.HeroSpend, rules = window.EventRules, api = context.api, store = null;
    try { store = context.ledger; store.snapshot(); } catch (cause) { store = null; }
    function put(key, value) { context.targets(key).forEach(function (node) { node.textContent = value; }); }
    function render() {
      if (!store) return;
      var plan = S.plan(store.snapshot()), body = context.targets('rows')[0], total = 0, rows = [];
      Object.keys(plan.heroes).forEach(function (key) { var hero = plan.heroes[key]; rows.push({ hero: hero, points: S.points(rules, 'prep', hero) }); });
      rows.sort(function (a, b) { return b.points.total - a.points.total || a.hero.name.localeCompare(b.hero.name); });
      body.replaceChildren();
      rows.forEach(function (row) {
        var hero = row.hero, tr = element('tr'), name = element('th', '', hero.name), shards = element('td'), widget = element('td'), points = element('td', '', api.fmt(row.points.total));
        name.scope = 'row';
        var change = element('td', '', hero.shards ? (hero.shards.from === 30 ? t(api, 'maxed') : fill(api, 'stars', { from: stars(api, hero.shards.from), to: stars(api, hero.shards.to) })) : t(api, 'unknownCount'));
        if (hero.shards) { shards.append(element('b', '', api.fmt(hero.shards.spend)), element('small', '', fill(api, 'pieces', { own: api.fmt(hero.shards.ownUsed), general: api.fmt(hero.shards.general) }))); }
        else shards.textContent = t(api, 'unknownCount');
        if (hero.widget) widget.append(element('b', '', api.fmt(hero.widget.spend)), element('small', '', fill(api, 'widgetLevel', { from: api.fmt(hero.widget.from), to: api.fmt(hero.widget.to) })), element('small', '', fill(api, 'widgetPieces', { own: api.fmt(hero.widget.ownUsed), general: api.fmt(hero.widget.general) })));
        else widget.textContent = t(api, 'none');
        tr.append(name, points, change, shards, widget); body.appendChild(tr);
        total += row.points.total;
      });
      context.targets('table').forEach(function (node) { node.hidden = !rows.length; });
      context.targets('empty').forEach(function (node) { node.hidden = rows.length > 0; node.textContent = t(api, 'empty'); });
      put('total', fill(api, 'total', { n: api.fmt(total) }));
      put('coverage', plan.unknown.length ? fill(api, 'partial', { names: names(api, plan.unknown) }) : t(api, 'complete'));
      var left = function (id) { var value = plan.items[id].left; return value === null ? t(api, 'unknownCount') : api.fmt(value); };
      put('left', rows.length ? fill(api, 'leftShards', { mythic: left('mythic-hero-shard'), epic: left('epic-hero-shard'), rare: left('rare-hero-shard') }) + ' ' + fill(api, 'leftWidgets', { n: left('hero-widget') }) : '');
    }
    if (store) context.cleanup(store.subscribe(render));
    return { refresh: render };
  });
})();
