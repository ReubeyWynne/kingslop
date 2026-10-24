/* The Masters page's KvK points: what each unlocked master's emblems and manuscripts score
   when spent. The plan and every rate come from MasterSpend and the event rules, the same
   numbers the Town Centre totals use; this file only paints them. */
(function () {
  'use strict';
  var EN = {
    'missing.masters': 'your masters', 'missing.affinity': '{master} affinity', 'missing.skills': '{master} skill levels', 'missing.emblems': '{master} emblems',
    total: '{n} KvK prep points', complete: 'Every master count this uses is entered.', partial: 'Partial: {names} not entered yet, so the total leaves them out.', more: '{n} more',
    empty: 'Mark the masters you have unlocked, with their affinity and skill levels, to see what their emblems and manuscripts can score.',
    none: '—', classStep: '→ {name}', emblemPieces: '{own} own + {general} general', skillSteps: '{n} skill levels', learning: '{n} learning XP',
    left: 'Unused: {general} general emblems, {manuscripts} manuscripts.', unknownCount: '?'
  };
  function t(api, key) { return api.tr('masterPoints.' + key, EN[key]); }
  function fill(api, key, values) { return api.fill(t(api, key), values); }
  function element(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  // A missing fact named for people: "Valora affinity", "your masters".
  function missing(api, need) { return need.master ? fill(api, 'missing.' + need.kind, { master: need.master.name }) : t(api, 'missing.' + need.kind); }
  function names(api, ids) {
    var out = ids.slice(0, 3).map(function (id) { var need = window.MasterSpend.missing(id), item = window.EventRuleData.items.find(function (entry) { return entry.id === id; }); return need ? missing(api, need) : item ? api.tr(item.key, item.label) : id === window.MasterSpend.GENERAL ? api.tr('masters.generalEmblem', 'General Master Emblems') : id; });
    if (ids.length > 3) out.push(fill(api, 'more', { n: api.fmt(ids.length - 3) }));
    return out.join(', ');
  }
  window.MasterPoints = { missing: missing };

  window.Interactions.register('master-points', function (context) {
    var S = window.MasterSpend, rules = window.EventRules, api = context.api, store = null;
    try { store = context.ledger; store.snapshot(); } catch (cause) { store = null; }
    function put(key, value) { context.targets(key).forEach(function (node) { node.textContent = value; }); }
    function render() {
      if (!store) return;
      var plan = S.plan(store.snapshot()), body = context.targets('rows')[0], total = 0, rows = [];
      Object.keys(plan.masters).forEach(function (id) { var entry = plan.masters[id]; rows.push({ entry: entry, points: S.points(rules, 'prep', entry) }); });
      rows.sort(function (a, b) { return b.points.total - a.points.total || S.MASTERS.findIndex(function (m) { return m.id === a.entry.id; }) - S.MASTERS.findIndex(function (m) { return m.id === b.entry.id; }); });
      body.replaceChildren();
      rows.forEach(function (row) {
        var entry = row.entry, tr = element('tr'), name = element('th', '', entry.name), emblems = element('td'), books = element('td');
        name.scope = 'row';
        if (entry.emblems && entry.emblems.spend) emblems.append(element('b', '', api.fmt(entry.emblems.spend)), element('small', '', fill(api, 'classStep', { name: entry.emblems.className })), element('small', '', fill(api, 'emblemPieces', { own: api.fmt(entry.emblems.ownUsed), general: api.fmt(entry.emblems.general) })));
        else emblems.textContent = t(api, 'none');
        if (entry.manuscripts) {
          var steps = entry.manuscripts.to.reduce(function (sum, level, at) { return sum + level - entry.manuscripts.from[at]; }, 0);
          books.append(element('b', '', api.fmt(entry.manuscripts.spend)), element('small', '', fill(api, 'skillSteps', { n: api.fmt(steps) })));
          if (entry.manuscripts.learningXp) books.append(element('small', '', fill(api, 'learning', { n: api.fmt(entry.manuscripts.learningXp) })));
        } else books.textContent = t(api, 'unknownCount');
        tr.append(name, element('td', '', api.fmt(row.points.total)), emblems, books); body.appendChild(tr);
        total += row.points.total;
      });
      context.targets('table').forEach(function (node) { node.hidden = !rows.length; });
      context.targets('empty').forEach(function (node) { node.hidden = rows.length > 0; node.textContent = t(api, 'empty'); });
      put('total', fill(api, 'total', { n: api.fmt(total) }));
      put('coverage', plan.unknown.length ? fill(api, 'partial', { names: names(api, plan.unknown) }) : t(api, 'complete'));
      var left = function (value) { return value === null ? t(api, 'unknownCount') : api.fmt(value); };
      put('left', rows.length ? fill(api, 'left', { general: left(plan.items[S.EMBLEM].left), manuscripts: left(plan.items[S.MANUSCRIPT].left) }) : '');
    }
    if (store) context.cleanup(store.subscribe(render));
    return { refresh: render };
  });
})();
