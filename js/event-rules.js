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
  function count(value) { if (!Number.isSafeInteger(value) || value < 0 || value > 1e9) throw new Error('Invalid inventory count'); return value; }
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
  function labelToItemId(label) {
    var l = String(label).toLowerCase();
    if (/truck|beast|terror|rally and hunt|wilderness/.test(l)) return 'free';
    if (/tempered truegold|temp tg/.test(l)) return 'Tempered TG';
    if (/mithril/.test(l)) return 'Mithril';
    if (/widget/.test(l)) return 'Widget gear';
    if (/forgehammer|hammer/.test(l)) return 'Forgehammer';
    if (/governor charm|charm/.test(l)) return 'Gov charm';
    if (/governor gear|gear max score|gov gear/.test(l)) return 'Gov gear';
    if (/master emblem/.test(l)) return 'Master emblem';
    if (/mythic|epic|rare|hero shard|shard/.test(l)) return 'Hero shard';
    if (/roulette/.test(l)) return 'Hero roulette';
    if (/taming mark|pet advancement|pet refinement|pets/.test(l)) return 'Pets advance';
    if (/intel mission/.test(l)) return 'Intel missions';
    if (/truegold dust/.test(l)) return null; // dust is not a tracked material
    if (/t10|t11|t[0-9] troop|troop training|training/.test(l)) return 'Troop';
    if (/construction/.test(l)) return 'Building';
    if (/research/.test(l)) return 'Research';
    if (/gather/.test(l)) return 'Gathering';
    if (/truegold/.test(l)) return 'Truegold';
    if (/master\u2019s manuscript|manuscript/.test(l)) return null;
    return null;
  }  return { data: data, days: days, rules: rules, calculate: calculate, labelToItemId: labelToItemId, CYCLE: CYCLE, EPOCH: EPOCH, DAY_MS: DAY_MS, cycleDay: cycleDay, opens: opens };
});
