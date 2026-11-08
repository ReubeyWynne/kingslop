const assert = require('node:assert/strict');
const { plan, MIN_PLAYERS, QUEUES } = require('../js/bear-hunt-plan.js');

// Fifteen players is the plan the page has always given: 14 joiners, 6 joins, a cap of rally ÷ 16.
const full = plan(15, 1360000);
assert.deepEqual(
  { joiners: full.joiners, fill: full.fill, divisor: full.divisor, joins: full.joins, cap: full.cap, first: full.first, full: full.full },
  { joiners: 14, fill: 15, divisor: 16, joins: 6, cap: 85000, first: 7, full: true });
assert.equal(Math.round(full.hits * 100) / 100, 2.33);

// More players never change a rally: it still takes 14.
assert.equal(plan(40, 1360000).joiners, 14);
assert.equal(plan(40, 1360000).joins, 6);

// Eight players: everyone else joins, three joins reach all seven rallies, and they get bigger.
const eight = plan(8, 1360000);
assert.deepEqual({ joiners: eight.joiners, joins: eight.joins, divisor: eight.divisor, cap: eight.cap, full: eight.full }, { joiners: 7, joins: 3, divisor: 9, cap: 151000, full: false });

// Blank or silly input falls back rather than breaking the page.
assert.equal(plan(undefined, 0).players, 15);
assert.equal(plan(undefined, 0).cap, 0);
assert.equal(plan(1, 1360000).players, MIN_PLAYERS);

for (let p = MIN_PLAYERS; p <= 60; p++) {
  const r = plan(p, 2000000);
  assert.equal(r.joiners, Math.min(14, p - 1), p + ': joiners');
  assert.ok(r.joins >= 1 && r.joins <= Math.min(QUEUES, r.joiners), p + ': joins in range');
  // The joins reach every rally at the turnover full rallies give (14 ÷ 6 hits every five minutes).
  assert.ok(r.joins * 14 / 6 >= r.joiners - 1e-9, p + ': joins reach every rally');
  assert.ok((r.joins - 1) * 14 / 6 < r.joiners, p + ': no spare join');
  assert.ok(r.cap * r.divisor <= 2000000, p + ': cap fits the rally');
  assert.ok(r.first >= 1 && r.first <= p, p + ': first group');
  if (p > 2) assert.ok(r.cap >= plan(p + 1, 2000000).cap, p + ': fewer players never shrink the cap');
}
console.log('Bear Hunt plan: 15-player plan, small groups and 56 group sizes checked.');
