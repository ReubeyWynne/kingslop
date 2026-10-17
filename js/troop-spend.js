/* What your camps can train for a troop day. Event points for troops are paid per troop
   collected on the day, so a troop only scores if it can be trained and paid for. One plan
   serves the Town Centre totals and its Troops shelf, so both count the same troops.

   Times and costs come from _data/troops.json (.dsh/build-troops.py), which publishes a
   cell only where two sources agree. Each camp (Barracks, Stable, Range) trains its own
   troop type at the highest tier you set for it. Two kinds of troops score:
   - A pre-trained batch: one full batch per camp, started before the day so it finishes
     without speedups and is collected on the day. The 3,000-gem capacity buff triples the
     batch. It does not change training speed, and it adds nothing to training on the day.
   - Troops trained on the day with training speedups, then general speedups. Capacity
     does not limit these, because a batch can be finished and restarted.
   Training speed is the Bonus Overview figure without temporary buffs, plus the buffs you
   record: the KvK troop buff or the High King's (only one applies, so the larger counts) and
   a castle position, which you hold both when the batch starts and on the day, and Mobilize,
   which runs on KvK prep day 4 only and so speeds up only that day's speedup training.
   Every troop is paid for with the resources left after the building plan, the batch
   first, then the camps that score most per second of speedup. A cost cell only one source
   has (all of T11) is listed as unverified and does not limit the plan. Unknown facts or
   balances count as nothing and are listed, so a total is never inflated. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../_data/troops.json'));
  else root.TroopSpend = factory(root.TroopData);
})(typeof window === 'object' ? window : globalThis, function (data) {
  'use strict';
  var RESOURCES = ['bread', 'wood', 'stone', 'iron'], SPEEDUPS = ['training', 'general'], BUFF = 3, BUFF_GEMS = 3000, BUFFS = ['kvk', 'king', 'position', 'mobilize'];
  var TYPES = ((data && data.types) || []).map(function (type) { return { id: type.id, name: type.name, camp: type.camp }; });
  var TIERS = {};
  ((data && data.tiers) || []).forEach(function (row) { TIERS[row.tier] = row; });
  function confirmed(snapshot, id) { var entry = snapshot.inventory && Object.hasOwn(snapshot.inventory, id) ? snapshot.inventory[id] : null; return entry && entry.status === 'confirmed' ? entry.amount : null; }
  // Seconds one troop takes at this training speed (Bonus Overview %, so 100 halves the time).
  function seconds(tier, speed) { return TIERS[tier].seconds * 100 / (100 + speed); }
  // Whole troops a number of seconds pays for, without floating-point drift.
  function within(secs, tier, speed) { return Math.floor(secs * (100 + speed) / (100 * TIERS[tier].seconds) + 1e-9); }
  function affordable(cost, left) { return RESOURCES.reduce(function (most, id) { return cost[id] ? Math.min(most, Math.floor(left[id] / cost[id])) : most; }, Infinity); }
  function pay(cost, left, spent, troops) { RESOURCES.forEach(function (id) { if (cost[id]) { left[id] -= cost[id] * troops; spent[id] += cost[id] * troops; } }); }
  /* Training speed (%) for the batch and for the day's speedup training, or null while the
     base speed is unknown. A buff you have not recorded adds nothing. */
  function speeds(facts, event) {
    function buff(id) { return Object.hasOwn(facts, id) ? facts[id] : 0; }
    if (!Object.hasOwn(facts, 'speed')) return { base: null, batch: null, day: null };
    var batch = facts.speed + Math.max(buff('kvk'), buff('king')) + buff('position');
    return { base: facts.speed, batch: batch, day: batch + (event === 'prep' ? buff('mobilize') : 0) };
  }
  /* rates: points per troop by tier for the day ({ 10: 60 }); a tier without a rate scores
     nothing and is listed. used: resources another plan already spends ({ bread: … }).
     event: the troop day's event, which decides whether Mobilize applies. */
  function plan(snapshot, rates, used, event) {
    var section = snapshot.training || { facts: {} }, facts = section.facts || {}, buff = Boolean(snapshot.preferences && snapshot.preferences.training && snapshot.preferences.training.buff);
    var speed = speeds(facts, event), capacity = Object.hasOwn(facts, 'capacity') ? facts.capacity : null;
    var unknown = [], unverified = [], left = {}, spent = {}, lines = [], camps = [];
    function note(list, id) { if (!list.includes(id)) list.push(id); }
    rates = rates || {}; used = used || {};
    TYPES.forEach(function (type) {
      if (!Object.hasOwn(facts, type.id)) return;
      var tier = facts[type.id], rate = Object.hasOwn(rates, tier) ? rates[tier] : null, cost = TIERS[tier].cost[type.id];
      if (rate === null) note(unknown, 'troops-t' + tier + '-rate');
      if (RESOURCES.some(function (id) { return !Object.hasOwn(cost, id); })) note(unverified, 'troops-t' + tier + '-cost');
      camps.push({ type: type.id, tier: tier, rate: rate || 0, cost: cost });
    });
    var size = capacity === null ? null : capacity * (buff ? BUFF : 1);
    var result = { camps: camps, speed: speed, buff: buff, gems: buff ? BUFF_GEMS : 0, batch: { size: size, seconds: null, troops: 0, points: 0 }, speedups: {}, lines: lines, resources: spent, unknown: unknown, unverified: unverified, troops: 0, points: 0 };
    // With no camp tier recorded nothing can be trained yet, which is unknown rather than zero.
    if (!camps.length) { unknown.unshift('training-tiers'); SPEEDUPS.forEach(function (kind) { result.speedups[kind] = { minutes: null, used: 0, troops: 0, points: 0 }; }); return result; }
    RESOURCES.forEach(function (id) { var have = confirmed(snapshot, id); if (have === null) note(unknown, id); left[id] = Math.max(0, (have || 0) - (used[id] || 0)); spent[id] = 0; });
    if (capacity === null) note(unknown, 'training-capacity');
    if (speed.base === null) note(unknown, 'training-speed');
    function add(group, camp, troops) {
      if (!troops) return;
      pay(camp.cost, left, spent, troops);
      var line = lines.find(function (l) { return l.group === group && l.tier === camp.tier && l.rate === camp.rate; });
      if (!line) { line = { group: group, tier: camp.tier, rate: camp.rate, troops: 0, points: 0 }; lines.push(line); }
      line.troops += troops; line.points += troops * camp.rate;
      result.troops += troops; result.points += troops * camp.rate;
    }
    // The batch: one per camp, highest rate first so scarce resources go where they score most.
    var byRate = camps.slice().sort(function (a, b) { return b.rate - a.rate || b.tier - a.tier; });
    if (size !== null) byRate.forEach(function (camp) {
      if (!camp.rate) return;
      var troops = Math.min(size, affordable(camp.cost, left));
      add('batch', camp, troops);
      result.batch.troops += troops; result.batch.points += troops * camp.rate;
    });
    // How long the slowest camp needs, so the batch can be started early enough.
    if (size !== null && speed.batch !== null) result.batch.seconds = Math.ceil(Math.max.apply(null, camps.map(function (camp) { return size * seconds(camp.tier, speed.batch); })));
    // Speedups: training first, then general, each into the camps that score most per second.
    var bySpeed = camps.filter(function (camp) { return camp.rate; }).sort(function (a, b) { return b.rate / TIERS[b.tier].seconds - a.rate / TIERS[a.tier].seconds || b.tier - a.tier; });
    SPEEDUPS.forEach(function (kind) {
      var minutes = confirmed(snapshot, 'speedup-' + kind), out = { minutes: minutes, used: 0, troops: 0, points: 0 };
      result.speedups[kind] = out;
      if (minutes === null) { note(unknown, 'speedup-' + kind); return; }
      if (speed.day === null) return;
      var secs = minutes * 60;
      bySpeed.forEach(function (camp) {
        var troops = Math.min(within(secs, camp.tier, speed.day), affordable(camp.cost, left));
        if (!troops) return;
        secs -= troops * seconds(camp.tier, speed.day);
        add(kind, camp, troops);
        out.troops += troops; out.points += troops * camp.rate;
      });
      out.used = Math.min(minutes, Math.ceil((minutes * 60 - secs) / 60 - 1e-9));
    });
    return result;
  }
  // Points per troop by tier for one event day: a "T{n} troop" rule row wins, and a tier it
  // does not name takes the cross-checked rate in _data/troops.json for that event, if any.
  var POINTS = { prep: 'kvk', sg: 'sg' };
  function rates(rows, event) {
    var troopRows = rows.filter(function (row) { return !row.items && /\btroops?\b/i.test(row.label); }), out = {};
    if (!troopRows.length) return null;
    Object.keys(TIERS).forEach(function (tier) {
      var row = troopRows.find(function (r) { return new RegExp('^T' + tier + ' troop$', 'i').test(r.label.trim()); });
      var value = row ? Number(String(row.points).replace(/,/g, '')) : POINTS[event] ? TIERS[tier].points[POINTS[event]] : undefined;
      if (Number.isSafeInteger(value) && value > 0) out[tier] = value;
    });
    return { rows: troopRows, rates: out };
  }
  /* The batch for one troop day, with and without the capacity buff, and the latest time to
     start each so it is ready when the day opens (opensAt, ms). The buff is worth buying only
     for this batch: start it before the day, collect it on the day. */
  function batch(snapshot, rates, used, opensAt, event) {
    function run(buff) {
      var copy = JSON.parse(JSON.stringify(snapshot));
      copy.preferences = Object.assign({}, copy.preferences); if (buff) copy.preferences.training = { buff: true }; else delete copy.preferences.training;
      var out = plan(copy, rates, used, event), b = out.batch;
      return { size: b.size, troops: b.troops, points: b.points, seconds: b.seconds, start: b.seconds === null ? null : opensAt - b.seconds * 1000 };
    }
    var buffed = run(true), plain = run(false), probe = plan(snapshot, rates, used, event);
    return { opens: opensAt, buffed: buffed, plain: plain, gems: BUFF_GEMS, extra: buffed.points - plain.points, unknown: probe.unknown.filter(function (id) { return !/^speedup-/.test(id); }) };
  }
  // What an unknown or unverified id from the plan asks for, so pages can name it: { kind, tier }.
  function missing(id) {
    if (id === 'training-tiers' || id === 'training-capacity' || id === 'training-speed') return { kind: id, tier: null };
    var m = /^troops-t(\d+)-(rate|cost)$/.exec(id);
    return m ? { kind: m[2], tier: Number(m[1]) } : null;
  }
  return { RESOURCES: RESOURCES.slice(), SPEEDUPS: SPEEDUPS.slice(), BUFF: BUFF, BUFF_GEMS: BUFF_GEMS, BUFFS: BUFFS.slice(), TYPES: TYPES, TIERS: TIERS, data: data, seconds: seconds, speeds: speeds, plan: plan, batch: batch, rates: rates, missing: missing };
});
