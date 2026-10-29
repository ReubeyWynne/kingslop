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
