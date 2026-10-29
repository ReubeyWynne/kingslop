(function (root, factory) {
  var engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  else root.VikingsEngine = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var TYPES = ['infantry', 'cavalry', 'archers'];
  function sum(troops) { return TYPES.reduce(function (n, k) { return n + (troops[k] || 0); }, 0); }
  function capacity(player, queue) { return (player.capacities && player.capacities[queue - 1]) ?? player.marchCapacity; }
  function split(player) {
    var left = {}, rows = [], caps = [], totalCap = 0;
    TYPES.forEach(function (k) { left[k] = player[k]; });
    for (var q = 1; q <= player.marches; q++) { var cap = capacity(player, q); caps.push(cap); totalCap += cap; rows.push({ queue: q, destination: null, infantry: 0, cavalry: 0, archers: 0 }); }
    var deploy = {}, space = totalCap;
    TYPES.forEach(function (k) { deploy[k] = Math.min(left[k], space); space -= deploy[k]; left[k] -= deploy[k]; });
    TYPES.forEach(function (k) {
      var remaining = deploy[k], room = caps.reduce(function (n, cap, i) { return n + cap - sum(rows[i]); }, 0);
      var allocations = rows.map(function (row, i) { var available = caps[i] - sum(row); var exact = room ? remaining * available / room : 0; return { i: i, n: Math.floor(exact), fraction: exact % 1, available: available }; });
      var extra = remaining - allocations.reduce(function (n, a) { return n + a.n; }, 0);
      allocations.slice().sort(function (a, b) { return b.fraction - a.fraction || a.i - b.i; }).forEach(function (a) { if (extra && a.n < a.available) { a.n++; extra--; } });
      allocations.forEach(function (a) { rows[a.i][k] = a.n; });
    });
    return { rows: rows, home: left, deployed: deploy, total: sum(deploy) };
  }
  function emptyHQ() { return { capacity: 0, infantryPercent: 75, cavalryPercent: 25, participants: [] }; }
  function hqRows(hq) {
    if (!hq.participants.length) return [];
    var n = hq.participants.length, base = Math.floor(hq.capacity / n), extra = hq.capacity % n;
    var infTotal = Math.round(hq.capacity * hq.infantryPercent / 100), cavTotal = Math.round(hq.capacity * hq.cavalryPercent / 100);
    cavTotal = Math.min(cavTotal, hq.capacity - infTotal);
    var targets = [infTotal, cavTotal, hq.capacity - infTotal - cavTotal];
    var rows = hq.participants.map(function (p, i) { return { playerId: p.playerId, queue: p.queue, destination: 'hq', total: base + (i < extra ? 1 : 0), infantry: 0, cavalry: 0, archers: 0 }; });
    TYPES.forEach(function (k, at) {
      var target = targets[at], space = rows.reduce(function (n, r) { return n + r.total - sum(r); }, 0);
      var shares = rows.map(function (r, i) { var exact = space ? target * (r.total - sum(r)) / space : 0; return { i: i, n: Math.floor(exact), fraction: exact % 1 }; });
      var extra = target - shares.reduce(function (n, a) { return n + a.n; }, 0);
      shares.slice().sort(function (a, b) { return b.fraction - a.fraction || a.i - b.i; }).forEach(function (a) { if (extra && a.n < rows[a.i].total - sum(rows[a.i])) { a.n++; extra--; } });
      shares.forEach(function (a) { rows[a.i][k] = a.n; });
    });
    return rows;
  }
  function validate(roster, assignments, hq) {
    var errors = [], warnings = [], incoming = {}, byId = {};
    roster.forEach(function (p) { byId[p.id] = p; incoming[p.id] = []; });
    function fail(message) { errors.push(message); }
    Object.keys(assignments).forEach(function (id) {
      var p = byId[id], used = new Set(), totals = { infantry: 0, cavalry: 0, archers: 0 };
      if (!p) { fail('Remove assignments for a player who has left.'); return; }
      var rows = assignments[id];
      if (!Array.isArray(rows) || rows.length > 6) { fail(p.nickname + ': invalid march list.'); return; }
      rows.forEach(function (r) {
        if (!Number.isInteger(r.queue) || r.queue < 1 || r.queue > p.marches || used.has(r.queue)) fail(p.nickname + ': each available queue can be used once.');
        used.add(r.queue);
        TYPES.forEach(function (k) { if (!Number.isSafeInteger(r[k]) || r[k] < 0 || r[k] > 100000000) fail(p.nickname + ': invalid troop count.'); else totals[k] += r[k]; });
        if (sum(r) > capacity(p, r.queue)) fail(p.nickname + ': march ' + r.queue + ' exceeds its capacity.');
        if (r.destination) {
          if (!byId[r.destination] || r.destination === id) fail(p.nickname + ': choose another registered city.');
          else if (sum(r) > 0) incoming[r.destination].push({ playerId: id, queue: r.queue, troops: sum(r) });
        }
      });
      TYPES.forEach(function (k) { if (totals[k] > p[k]) fail(p.nickname + ': assigned ' + k + ' exceed available troops.'); });
    });
    roster.forEach(function (p) {
      if (!p.marchCapacity && !(p.capacities || []).some(Boolean)) warnings.push(p.nickname + ': march capacity is missing.');
      if (!incoming[p.id].length) warnings.push(p.nickname + ': no incoming cover assigned.');
      var used = (assignments[p.id] || []).filter(function (r) { return r.destination && sum(r); }).length;
      if (used < p.marches) warnings.push(p.nickname + ': ' + (p.marches - used) + ' queues unassigned.');
    });
    hq = hq || emptyHQ();
    var seen = new Set();
    hq.participants.forEach(function (entry) {
      if (seen.has(entry.playerId)) fail('HQ: each participant can reserve one queue.');
      seen.add(entry.playerId);
    });
    if (hq.participants.length > 15) fail('HQ: at most 15 participants.');
    if (hq.participants.length && !hq.capacity) fail('HQ: enter the effective garrison capacity.');
    var headquarters = hqRows(hq);
    headquarters.forEach(function (row) {
      var p = byId[row.playerId];
      if (!p || !Number.isInteger(row.queue) || row.queue < 1 || row.queue > p.marches) { fail('HQ: choose a registered player and available queue.'); return; }
      if (row.total > capacity(p, row.queue)) fail(p.nickname + ': HQ share exceeds march capacity.');
      TYPES.forEach(function (k) {
        var other = (assignments[p.id] || []).filter(function (r) { return r.queue !== row.queue && r.destination; }).reduce(function (n, r) { return n + r[k]; }, 0);
        if (other + row[k] > p[k]) fail(p.nickname + ': recall more ' + k + ' before sending the HQ share.');
      });
    });
    return { errors: Array.from(new Set(errors)), warnings: Array.from(new Set(warnings)), incoming: incoming, hq: headquarters };
  }
  // Short enough to paste into game chat: one line per march, exact counts.
  function instructions(snapshot, playerId) {
    var p = snapshot.roster.find(function (p) { return p.id === playerId; });
    if (!p) return '';
    var names = Object.fromEntries(snapshot.roster.map(function (p) { return [p.id, p.nickname]; }));
    function n(x) { return x.toLocaleString('en-US'); }
    function troops(r) { return n(r.infantry) + ' inf / ' + n(r.cavalry) + ' cav / ' + n(r.archers) + ' arc'; }
    var at = snapshot.plan.eventAt ? new Date(snapshot.plan.eventAt) : null;
    var lines = [p.nickname + ' · ' + snapshot.plan.name + (at ? ' · ' + at.toISOString().slice(11, 16) + ' UTC' : '')];
    (snapshot.assignments[playerId] || []).filter(function (r) { return r.destination && sum(r); }).forEach(function (r) { lines.push('M' + r.queue + ' → ' + names[r.destination] + ': ' + troops(r)); });
    var hq = hqRows(snapshot.hq || emptyHQ()).find(function (r) { return r.playerId === playerId; });
    if (hq) lines.push('HQ (waves 10, 20): after wave 9/19 recall M' + hq.queue + ', send ' + troops(hq) + '. Return after the HQ hit.');
    return lines.join('\n');
  }
  /* Vikings opens every fourteen days, on Tuesday and Thursday by the server clock (UTC); R4/R5 pick the hour.
     SCHEDULE.anchor is one known Tuesday. Change it here if the fortnight moves. */
  var DAY = 86400000, SCHEDULE = { anchor: Date.UTC(2026, 9, 27), every: 14, days: [0, 2] };
  // The next `count` event days as UTC midnights, counting today while it lasts.
  function eventDays(now, count) {
    var today = Math.floor(now / DAY) * DAY, start = SCHEDULE.anchor + Math.floor((today - SCHEDULE.anchor) / (SCHEDULE.every * DAY)) * SCHEDULE.every * DAY, out = [];
    for (var cycle = start; out.length < (count || 2); cycle += SCHEDULE.every * DAY) SCHEDULE.days.forEach(function (d) { var day = cycle + d * DAY; if (day >= today && out.length < (count || 2)) out.push(day); });
    return out;
  }
  return { types: TYPES, eventDays: eventDays, schedule: SCHEDULE, sum: sum, capacity: capacity, split: split, emptyHQ: emptyHQ, hqRows: hqRows, validate: validate, instructions: instructions };
});
