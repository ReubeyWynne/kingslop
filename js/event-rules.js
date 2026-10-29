/* Pure event arithmetic. Counts are inventory budgets, not inferred upgrade capacity. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../_data/event_rules.json'));
  else root.EventRules = factory(root.EventRuleData);
})(typeof window === 'object' ? window : globalThis, function (data) {
  'use strict';
  function days(event) { if (!Object.hasOwn(data.events, event)) throw new Error('Unsupported event'); return data.events[event]; }
  function rules(event, day) {
    var list = days(event);
    if (!Number.isInteger(day) || day < 1 || day > list.length) throw new Error('Unsupported event day');
    return list[day - 1];
  }
  function speedupKinds(row) { return row.scoring && row.scoring.type === 'speedup' ? row.scoring.kinds.slice() : null; }
  function governorKind(row) { return row.scoring && row.scoring.type === 'governor' ? row.scoring.kind : null; }
  function rate(row) { return row.scoring && Number.isSafeInteger(row.scoring.rate) && row.scoring.rate > 0 ? row.scoring.rate : null; }
  function tasks(event, group) {
    var key = { sg: 'SG_TASKS', armament: 'ARM_TASKS', officer: 'OFF_TASKS' }[event];
    if (!key) throw new Error('Unsupported task event');
    var index = event === 'sg' ? group - 1 : group, rows = data.legacy[key][index], ids = data.legacyTaskIds[key][index];
    if (!rows || !ids) throw new Error('Unsupported task group');
    return rows.map(function (row, i) { return Object.assign({ id: ids[i], label: row[0], points: row[1] }, data.tasks[ids[i]]); });
  }
  /* The 28-day wheel runs on UTC and every kingdom turns it together: cycle day 1 is Monday
     2026-08-17 (the anchor js/kvk.js counts from). Brawl days are cycle days 1–6, Strongest
     Governor 8–14 and KvK prep 22–26. */
  var CYCLE = 28, EPOCH = Date.UTC(2026, 7, 17), DAY_MS = 86400000, OFFSET = { brawl: 0, sg: 7, prep: 21 };
  function cycleDay(event, day) { rules(event, day); return OFFSET[event] + day; }
  // When this event day next opens (00:00 UTC), counting from the start of the UTC day holding `now`.
  function opens(event, day, now) {
    var since = Math.floor((now - EPOCH) / DAY_MS), today = (since % CYCLE + CYCLE) % CYCLE + 1;
    return EPOCH + (since + ((cycleDay(event, day) - today) % CYCLE + CYCLE) % CYCLE) * DAY_MS;
  }
  function count(value) { if (!Number.isSafeInteger(value) || value < 0 || value > 1e15) throw new Error('Invalid inventory count'); return value; }
  function calculate(snapshot, event, day, held, target) {
    var selected = rules(event, day), rates = Object.create(null), total = 0, reservedPoints = 0, unknown = [];
    selected.rows.forEach(function (row) { (row.items || []).forEach(function (item) {
      if (Object.hasOwn(rates, item.id)) throw new Error('Duplicate scoring item');
      rates[item.id] = item.rate;
    }); });
    if (target !== null && target !== undefined) count(target);
    var items = data.items.map(function (item) {
      var entry = Object.hasOwn(snapshot.inventory || {}, item.id) ? snapshot.inventory[item.id] : null;
      var amount = entry && entry.status === 'confirmed' ? count(entry.amount) : null;
      var rate = rates[item.id] || 0, requested = held && Object.hasOwn(held, item.id) ? count(held[item.id]) : 0;
      var reserved = amount === null ? null : Math.min(requested, amount);
      var points = amount === null ? null : (amount - reserved) * rate;
      if (rate && amount === null) unknown.push(item.id);
      if (points !== null) { total += points; reservedPoints += reserved * rate; }
      return { id: item.id, label: item.label, eligible: !!rate, rate: rate, amount: amount, reserved: reserved, points: points };
    });
    return { event: event, day: day, items: items, total: total, reservedPoints: reservedPoints, inventoryPoints: total + reservedPoints,
      unknown: unknown, complete: !unknown.length, shortfall: target === null || target === undefined ? null : Math.max(0, target - total),
      unquantified: selected.rows.filter(function (row) { return !row.items; }) };
  }
  return { data: data, days: days, rules: rules, calculate: calculate, speedupKinds: speedupKinds, governorKind: governorKind, rate: rate, tasks: tasks, CYCLE: CYCLE, EPOCH: EPOCH, DAY_MS: DAY_MS, cycleDay: cycleDay, opens: opens };
});
