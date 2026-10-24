/* Savings: how fast each inventory balance grows, learned from the ledger's inventory history,
   and what the player's goals can reach by the next KvK prep or Strongest Governor.
   - A rate is gross income: the rises between readings over the days they span. A fall is
     spending, kept apart and never netted off as a loss. Spending inside one interval hides
     income, so a rate errs low, which keeps a projection on the safe side.
   - Only readings in the last WINDOW_DAYS before an item's latest count. A reading from a
     save file, a legacy migration or a reset is not income: it restarts the chain.
   - Nothing is shown until an item has MIN_INTERVALS intervals over at least MIN_DAYS days.
   - A projection assumes nothing more is spent on the item and starts from today. Each goal
     is projected alone against the whole bag, as UpgradeGoals counts it. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./event-rules.js'));
  else root.UpgradeSavings = factory(root.EventRules);
})(typeof window === 'object' ? window : globalThis, function (rules) {
  'use strict';
  var DAY = 864e5, WINDOW_DAYS = 28, MIN_DAYS = 3, MIN_INTERVALS = 2, BREAKS = ['file', 'legacy', 'reset'], EVENTS = ['prep', 'sg'];

  // One item's rate from its history entries (oldest first, as PlayerLedger.history(id) returns them).
  function rate(entries) {
    var out = { id: entries.length ? entries[0].id : null, intervals: 0, days: 0, gained: 0, spent: 0, perDay: null, enough: false, from: null, to: null };
    if (!entries.length) return out;
    var last = Date.parse(entries[entries.length - 1].at), cutoff = last - WINDOW_DAYS * DAY, prev = null;
    entries.forEach(function (entry) {
      var at = Date.parse(entry.at);
      if (!(at >= cutoff)) return;
      if (prev === null || entry.before === null || BREAKS.includes(entry.source)) { prev = at; if (out.from === null) out.from = at; return; }
      var delta = entry.after - entry.before;
      out.days += (at - prev) / DAY; out.intervals += 1; prev = at; out.to = at;
      if (delta > 0) out.gained += delta; else out.spent -= delta;
    });
    out.enough = out.intervals >= MIN_INTERVALS && out.days >= MIN_DAYS;
    if (out.enough) out.perDay = out.gained / out.days;
    return out;
  }
  // Every item's rate, keyed by inventory id, from the whole history.
  function rates(history) {
    var by = {}, out = {};
    history.forEach(function (entry) { (by[entry.id] = by[entry.id] || []).push(entry); });
    Object.keys(by).forEach(function (id) { out[id] = rate(by[id]); });
    return out;
  }

  // The next opening of day 1 of KvK prep and of Strongest Governor, soonest first. Today counts.
  function next(now) {
    return EVENTS.map(function (event) { var at = rules.opens(event, 1, now); return { event: event, at: at, days: Math.max(0, Math.ceil((at - now) / DAY)) }; })
      .sort(function (a, b) { return a.at - b.at; });
  }

  // A goal's projection to `at`: covered (the bag covers it now), reached (on `on`), short (lines left over),
  // rate (a short line has no rate yet), unknown (a balance, level or cost is missing) or skip (met, cap, gone).
  function project(result, rateOf, at, now) {
    var out = { goal: result.goal, state: null, on: null, lines: [] };
    if (result.state === 'ready') { out.state = 'covered'; return out; }
    if (result.state !== 'short' && result.state !== 'unknown') { out.state = result.state === 'record' ? 'unknown' : 'skip'; return out; }
    var days = Math.max(0, (at - now) / DAY), slowest = 0, missing = false, unknown = result.state === 'unknown' || result.beyond || result.record.length > 0;
    result.lines.forEach(function (l) {
      if (l.have === null) { unknown = true; return; }
      if (!l.short) return;
      var ids = [l.id].concat(l.pool ? [l.pool] : []), known = ids.every(function (id) { return rateOf[id] && rateOf[id].enough; });
      var perDay = known ? ids.reduce(function (sum, id) { return sum + rateOf[id].perDay; }, 0) : null;
      var line = { id: l.id, pool: l.pool || null, name: l.name, short: l.short, perDay: perDay, gain: null, left: null, days: null };
      if (perDay === null) missing = true;
      else {
        line.gain = Math.floor(perDay * days); line.left = Math.max(0, l.short - line.gain);
        line.days = perDay > 0 ? Math.ceil(l.short / perDay) : null;
        slowest = line.days === null ? Infinity : Math.max(slowest, line.days);
      }
      out.lines.push(line);
    });
    if (unknown) out.state = 'unknown';
    else if (missing) out.state = 'rate';
    else if (out.lines.every(function (line) { return line.left === 0; })) { out.state = 'reached'; out.on = Math.floor(now / DAY) * DAY + slowest * DAY; }
    else out.state = 'short';
    return out;
  }
  function all(results, history, at, now) {
    var rateOf = rates(history);
    return results.map(function (r) { return project(r, rateOf, at, now); });
  }
  return { WINDOW_DAYS: WINDOW_DAYS, MIN_DAYS: MIN_DAYS, MIN_INTERVALS: MIN_INTERVALS, EVENTS: EVENTS.slice(), rate: rate, rates: rates, next: next, project: project, all: all };
});
