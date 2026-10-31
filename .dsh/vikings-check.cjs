const test = require('node:test'), assert = require('node:assert/strict'), E = require('../js/vikings-engine.js');
test('city splits conserve troops over 500 unequal-capacity rosters', () => {
  let seed = 17; const random = n => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
  for (let i = 0; i < 500; i++) {
    const p = { infantry: random(1000000), cavalry: random(1000000), archers: random(1000000), marches: 1 + random(6), marchCapacity: random(200000) };
    p.capacities = Array.from({ length: p.marches }, () => random(200000)); const split = E.split(p);
    assert.equal(split.total, Math.min(E.sum(p), p.capacities.reduce((a, b) => a + b, 0)));
    for (const k of E.types) assert.equal(split.rows.reduce((n, r) => n + r[k], 0) + split.home[k], p[k]);
    split.rows.forEach((r, at) => { assert(E.sum(r) <= p.capacities[at]); E.types.forEach(k => assert(Number.isInteger(r[k]) && r[k] >= 0)); });
    if (split.home.infantry) assert.equal(split.deployed.cavalry + split.deployed.archers, 0);
    if (split.home.cavalry) assert.equal(split.deployed.archers, 0);
  }
});
test('HQ rounding preserves the exact cap and troop totals for every participant count', () => {
  for (const capacity of [1, 100, 1000001, 2500003]) for (let n = 1; n <= 15; n++) {
    const rows = E.hqRows({ capacity, infantryPercent: 75, cavalryPercent: 25, participants: Array.from({ length: n }, (_, i) => ({ playerId: 'p' + i, queue: 1 })) });
    assert.equal(rows.reduce((n, r) => n + E.sum(r), 0), capacity);
    assert.equal(rows.reduce((n, r) => n + r.infantry, 0), Math.round(capacity * .75));
    assert(Math.max(...rows.map(E.sum)) - Math.min(...rows.map(E.sum)) <= 1);
  }
});
test('coverage gaps are explicit and impossible HQ shares block publishing', () => {
  const roster = [{ id: 'a', nickname: 'A', infantry: 100, cavalry: 50, archers: 0, marches: 1, marchCapacity: 150 }];
  const check = E.validate(roster, {}, E.emptyHQ()); assert.equal(check.errors.length, 0); assert(check.warnings.some(x => /cover/.test(x)));
  assert(E.validate(roster, {}, { capacity: 200, infantryPercent: 75, cavalryPercent: 25, participants: [{ playerId: 'a', queue: 1 }] }).errors.some(x => /capacity/.test(x)));
});
test('event days follow the fortnightly Tuesday and Thursday schedule', () => {
  const day = s => Date.parse(s + 'T00:00:00Z'), iso = list => list.map(n => new Date(n).toISOString().slice(0, 10));
  assert.deepEqual(iso(E.eventDays(day('2026-10-29') + 5e6)), ['2026-11-03', '2026-11-05']);
  assert.deepEqual(iso(E.eventDays(day('2026-11-03') + 5e6)), ['2026-11-03', '2026-11-05']);
  assert.deepEqual(iso(E.eventDays(day('2026-11-05') + 8e7)), ['2026-11-05', '2026-11-17']);
  assert.deepEqual(iso(E.eventDays(day('2026-11-06'), 3)), ['2026-11-17', '2026-11-19', '2026-12-01']);
  assert.deepEqual(iso(E.eventDays(day('2026-10-21'))), ['2026-10-22', '2026-11-03']);
  // Strongest Governor (cycle days 8–14) and KvK prep (22–28) weeks on the event-rules wheel.
  const R = require('../js/event-rules.js');
  for (let t = day('2026-08-17'); t < day('2027-08-17'); t += 864e5) { const cycle = Math.floor((t - R.EPOCH) / 864e5) % 28 + 1; const event = E.eventDays(t, 1)[0] === t; assert.equal(event, [9, 11, 23, 25].includes(cycle), new Date(t).toISOString()); }
  for (let t = day('2026-01-01'); t < day('2027-06-01'); t += 9e6) { const [a, b] = E.eventDays(t); assert(a >= Math.floor(t / 864e5) * 864e5 && b > a && [2, 4].includes(new Date(a).getUTCDay())); }
});
test('a room’s event rolls on three hours after its start, on its own weekday', () => {
  const at = (day, time, now) => new Date(E.nextEvent(day, time, Date.parse(now))).toISOString();
  assert.equal(at('tue', '20:00', '2026-10-29T12:00:00Z'), '2026-11-03T20:00:00.000Z');
  assert.equal(at('thu', '02:00', '2026-10-29T12:00:00Z'), '2026-11-05T02:00:00.000Z');
  assert.equal(at('tue', '20:00', '2026-11-03T22:59:00Z'), '2026-11-03T20:00:00.000Z');
  assert.equal(at('tue', '20:00', '2026-11-03T23:01:00Z'), '2026-11-17T20:00:00.000Z');
  assert.equal(E.nextEvent('wed', '20:00', Date.now()), null); assert.equal(E.nextEvent('tue', '25:00', Date.now()), null);
});
test('troops given in thousands split into whole thousands and still conserve', () => {
  let seed = 5; const random = n => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
  for (let i = 0; i < 300; i++) {
    const p = { infantry: random(900) * 1000, cavalry: random(900) * 1000, archers: random(900) * 1000, marches: 1 + random(6), marchCapacity: (1 + random(200)) * 1000 };
    const split = E.split(p);
    for (const k of E.types) assert.equal(split.rows.reduce((n, r) => n + r[k], 0) + split.home[k], p[k]);
    split.rows.forEach(r => { assert(E.sum(r) <= p.marchCapacity); E.types.forEach(k => assert.equal(r[k] % 1000, 0)); });
  }
  const rows = E.hqRows({ capacity: 300000, infantryPercent: 75, cavalryPercent: 25, participants: Array.from({ length: 7 }, (_, i) => ({ playerId: 'p' + i, queue: 1 })) });
  assert.equal(rows.reduce((n, r) => n + E.sum(r), 0), 300000); rows.forEach(r => E.types.forEach(k => assert.equal(r[k] % 1000, 0)));
});
test('a player sends at most one march to each city', () => {
  const roster = [{ id: 'a', nickname: 'A', infantry: 100, cavalry: 0, archers: 0, marchCapacity: 50, marches: 2 }, { id: 'b', nickname: 'B', infantry: 0, cavalry: 0, archers: 0, marchCapacity: 50, marches: 1 }, { id: 'c', nickname: 'C', infantry: 0, cavalry: 0, archers: 0, marchCapacity: 50, marches: 1 }];
  const twice = [{ queue: 1, destination: 'b', infantry: 50, cavalry: 0, archers: 0 }, { queue: 2, destination: 'b', infantry: 50, cavalry: 0, archers: 0 }];
  assert(E.validate(roster, { a: twice }, E.emptyHQ()).errors.some(x => /different city/.test(x)));
  twice[1].destination = 'c';
  assert.deepEqual(E.validate(roster, { a: twice }, E.emptyHQ()).errors, []);
});
