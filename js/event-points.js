/* One event points table for every calculator: what a plan scores on its best day of KvK prep,
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
  var EN = { day: 'day {n}', days: 'days {days}', none: 'not scored', unpublished: 'The event scores it, but its points aren’t published.', unknown: 'not known' };

  function better(best, cell) { return !best || (cell.points !== null && (best.points === null || cell.points > best.points)); }
  // A day that pays the same as the best so far joins it, so ties read "days 1, 2, 5".
  function keep(best, cell) {
    if (better(best, cell)) return Object.assign({}, cell, { days: [cell.day] });
    if (best.points !== null && cell.points === best.points && best.days.indexOf(cell.day) < 0) best.days.push(cell.day);
    return best;
  }
  /* Items spent, { forgehammer: 300, mithril: 10 }, and optionally minutes of speedups used,
     { construction: 600 }: each event's best day, or null when no day of it scores any of them.
     A minute scores at the best speedup row of that day that takes its kind. */
  function forItems(amounts, speedups) {
    var out = {};
    speedups = speedups || {};
    EVENTS.forEach(function (event) {
      var best = null;
      rules.days(event).forEach(function (day) {
        var points = 0, scores = false, rates = {};
        day.rows.forEach(function (row) {
          (row.items || []).forEach(function (item) {
            if (!Object.hasOwn(amounts, item.id)) return;
            scores = true; points += (amounts[item.id] || 0) * item.rate;
          });
          var kinds = rules.speedupKinds(row), rate = rules.rate(row);
          if (kinds && rate) kinds.forEach(function (kind) { if (Object.hasOwn(speedups, kind)) rates[kind] = Math.max(rates[kind] || 0, rate); });
        });
        Object.keys(rates).forEach(function (kind) { scores = true; points += Math.floor(speedups[kind] || 0) * rates[kind]; });
        if (scores && points > 0) best = keep(best, { day: day.day, points: points });
        else if (scores && !best) best = { day: day.day, days: [day.day], points: 0 };
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
          best = keep(best, cell);
        });
      });
      out[event] = best;
    });
    return out;
  }
  // The most any row scores in any event, for a one-line summary above a folded table.
  function most(rows) {
    var top = null;
    rows.forEach(function (row) { EVENTS.forEach(function (event) { var cell = row.cells[event]; if (cell && cell.points !== null && (top === null || cell.points > top)) top = cell.points; }); });
    return top;
  }
  /* rows: [{ label, cells }] → a table: one column per event, the points and the day under them.
     options.compact shows big totals short (1.58M), with the whole figure as the cell's title. */
  function table(api, rows, className, options) {
    options = options || {};
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
          else {
            var whole = Math.round(cell.points), shown = options.compact && api.compact ? api.compact(whole) : api.fmt(whole);
            td.appendChild(el('b', shown)); td.dataset.points = String(whole);
            if (shown !== api.fmt(whole)) td.title = api.fmt(whole);
          }
          var days = cell.days || [cell.day];
          td.appendChild(el('small', days.length > 1 ? api.fill(t('days'), { days: days.map(function (d) { return api.fmt(d); }).join(', ') }) : api.fill(t('day'), { n: api.fmt(cell.day) })));
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
  return { EVENTS: EVENTS, forItems: forItems, forGovernor: forGovernor, most: most, table: table };
});
