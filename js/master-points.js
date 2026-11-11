/* The words of the Masters page's KvK points, shared with Town Centre: the panel's English
   copy (masterPoints.* keys) and missing facts named for people. The panel itself is
   js/pages/master-points.mjs. */
(function () {
  'use strict';
  var EN = {
    'missing.masters': 'your masters', 'missing.affinity': '{master} affinity', 'missing.skills': '{master} skill levels', 'missing.emblems': '{master} emblems',
    total: '{n} KvK prep points', complete: 'Every master count this uses is entered.', partial: 'The total leaves out {names} until you enter them.', more: '{n} more',
    empty: 'Mark the masters you have unlocked, with their affinity and skill levels, to see what their emblems and manuscripts can score.',
    none: '—', classStep: '→ {name}', emblemPieces: '{own} own + {general} general', skillSteps: '{n} skill levels', learning: '{n} learning XP',
    eventEmblems: 'Emblems', eventManuscripts: 'Manuscripts', left: 'Unused: {general} general emblems, {manuscripts} manuscripts.', unknownCount: '?'
  };
  function t(api, key) { return api.tr('masterPoints.' + key, EN[key]); }
  function fill(api, key, values) { return api.fill(t(api, key), values); }
  // A missing fact named for people: "Valora affinity", "your masters".
  function missing(api, need) { return need.master ? fill(api, 'missing.' + need.kind, { master: need.master.name }) : t(api, 'missing.' + need.kind); }
  function names(api, ids) {
    var out = ids.slice(0, 3).map(function (id) { var need = window.MasterSpend.missing(id), item = window.EventRuleData.items.find(function (entry) { return entry.id === id; }); return need ? missing(api, need) : item ? api.tr(item.key, item.label) : id === window.MasterSpend.GENERAL ? api.tr('masters.generalEmblem', 'General Master Emblems') : id; });
    if (ids.length > 3) out.push(fill(api, 'more', { n: api.fmt(ids.length - 3) }));
    return out.join(', ');
  }
  window.MasterPoints = { missing: missing, names: names, t: t, fill: fill };
})();
