/* The words of the Heroes page's KvK points, shared with Town Centre: the panel's English
   copy (spend.* keys), hero stars, and missing facts named for people. The panel itself is
   js/pages/hero-points.mjs. */
(function () {
  'use strict';
  var EN = {
    'missing.heroes': 'your heroes', 'missing.stars': '{hero} stars', 'missing.shards': '{hero} shards', 'missing.widgetLevel': '{hero} widget level', 'missing.widgets': '{hero} widgets', 'missing.chest': 'generation {n} widget chests',
    total: '{n} KvK prep points', more: '{n} more',
    empty: 'Mark the heroes you own, with their stars, to see what their shards and widgets can score.',
    stars: '{from} → {to}', maxed: 'maxed', none: '—', pieces: '{own} own + {general} general', widgetPieces: '{own} own + {general} chest', widgetLevel: 'widget {from} → {to}',
    eventShards: 'Shards', eventWidgets: 'Widgets', leftShards: 'Unused general shards: {mythic} mythic, {epic} epic, {rare} rare.', leftWidgets: 'Unused widget chests: {n}.', keptMythic: 'Mythic general shards are kept for your next new hero.', unknownCount: '?'
  };
  function t(api, key) { return api.tr('spend.' + key, EN[key]); }
  function fill(api, key, values) { return api.fill(t(api, key), values); }
  function stars(api, index) { var at = window.HeroDirectory.stars(index); return api.fmt(at.stars) + '★' + (at.tier ? ' ' + api.fmt(at.tier) + '/6' : ''); }
  // A missing fact named for people: "Jabel stars", "your heroes".
  function missing(api, need) { return need.hero ? fill(api, 'missing.' + need.kind, { hero: need.hero.name }) : need.generation ? fill(api, 'missing.' + need.kind, { n: api.fmt(need.generation) }) : t(api, 'missing.' + need.kind); }
  function names(api, ids) {
    var out = ids.slice(0, 3).map(function (id) { var need = window.HeroSpend.missing(id), item = window.EventRuleData.items.find(function (entry) { return entry.id === id; }); return need ? missing(api, need) : item ? api.tr(item.key, item.label) : id; });
    if (ids.length > 3) out.push(fill(api, 'more', { n: api.fmt(ids.length - 3) }));
    return out.join(', ');
  }
  window.HeroPoints = { missing: missing, names: names, stars: stars, t: t, fill: fill };
})();
