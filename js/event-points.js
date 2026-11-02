/* One event points table for the gear pages: what a plan scores on its best day of KvK prep,
   Strongest Governor and Alliance Brawl. Hero gear counts the Forgehammers and mithril it
   spends; Governor gear its gear and charm score gains, on separate rows. Every rate comes
   from the event rules (_data/event_rules.json), so these match the Event Cycle page. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./event-rules.js'));
  else root.EventPoints = factory(root.EventRules);
})(typeof window === 'object' ? window : globalThis, function (rules) {
  'use strict';
  var EVENTS = ['prep', 'sg', 'brawl'];
  var NAMES = { prep: ['ks.today.kickerPrep', 'KvK prep'], sg: ['ks.governor.title', 'Strongest Governor'], brawl: ['ks.brawl.title', 'Alliance Brawl'] };
  var EN = { day: 'day {n}', none: 'not scored', unpublished: 'The event scores it, but its points aren’t published.', unknown: 'not known' };

  function better(best, cell) { return !best || (cell.points !== null && (best.points === null || cell.points > best.points)); }
  /* Items spent, { forgehammer: 300, mithril: 10 }: each event's best day, or null when no day
     of it scores any of them. */
  function forItems(amounts) {
    var out = {};
    EVENTS.forEach(function (event) {
      var best = null;
      rules.days(event).forEach(function (day) {
        var points = 0, scores = false;
        day.rows.forEach(function (row) { (row.items || []).forEach(function (item) {
          if (!Object.hasOwn(amounts, item.id)) return;
          scores = true; points += (amounts[item.id] || 0) * item.rate;
        }); });
        if (scores && better(best, { points: points })) best = { day: day.day, points: points };
      });
      out[event] = best;
    });
    return out;
  }
  /* A governor score gain of one kind ('gear' or 'charms'): each event's best day. A day that
     scores the kind without a published rate shows as { day, points: null } only when no day
     of that event has a rate; a gain of null (a level without a published score) gives null
     points on every day that scores. */
  function forGovernor(kind, gain) {
    var out = {};
    EVENTS.forEach(function (event) {
      var best = null;
      rules.days(event).forEach(function (day) {
        day.rows.forEach(function (row) {
          if (rules.governorKind(row) !== kind) return;
          var rate = rules.rate(row), cell = { day: day.day, points: rate === null || gain === null || gain === undefined ? null : gain * rate, unpublished: rate === null };
          if (better(best, cell)) best = cell;
        });
      });
      out[event] = best;
    });
    return out;
  }
  // rows: [{ label, cells }] → a table: one column per event, the points and the day under them.
  function table(api, rows, className) {
    function t(key) { return api.tr('gear.points' + key.charAt(0).toUpperCase() + key.slice(1), EN[key]); }
    function el(tag, text, cls) { var node = document.createElement(tag); if (text !== undefined && text !== null) node.textContent = text; if (cls) node.className = cls; return node; }
    var tableNode = el('table', null, 'event-points' + (className ? ' ' + className : '')), head = el('tr'), body = el('tbody'), unpublished = false;
    head.appendChild(el('td'));
    EVENTS.forEach(function (event) { var th = el('th', api.tr(NAMES[event][0], NAMES[event][1])); th.scope = 'col'; head.appendChild(th); });
    var thead = el('thead'); thead.appendChild(head);
    rows.forEach(function (row) {
      var tr = el('tr'), th = el('th', row.label); th.scope = 'row'; tr.appendChild(th);
      EVENTS.forEach(function (event) {
        var cell = row.cells[event], td = el('td');
        if (!cell) { td.textContent = '—'; td.title = t('none'); td.dataset.points = 'none'; }
        else {
          if (cell.points === null) { td.appendChild(el('b', '?')); td.title = cell.unpublished ? t('unpublished') : t('unknown'); td.dataset.points = 'unknown'; if (cell.unpublished) unpublished = true; }
          else { td.appendChild(el('b', api.fmt(Math.round(cell.points)))); td.dataset.points = String(Math.round(cell.points)); }
          td.appendChild(el('small', api.fill(t('day'), { n: api.fmt(cell.day) })));
        }
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    tableNode.append(thead, body);
    var wrap = el('div', null, 'event-points-wrap'); wrap.appendChild(tableNode);
    if (unpublished) wrap.appendChild(el('p', '? ' + t('unpublished'), 'event-points-note'));
    return wrap;
  }
  return { EVENTS: EVENTS, forItems: forItems, forGovernor: forGovernor, table: table };
});
