const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const Castle = require('../js/castle-battle-engine.js');
const data = JSON.parse(fs.readFileSync(path.join(root, '_data/castle_battle.json')));
const heroes = JSON.parse(fs.readFileSync(path.join(root, '_data/heroes.json'))).heroes;
test('a depleted infantry row needs an infantry refill, not the opening mix', () => {
  const state = Castle.refill(1000000, [60, 20, 20], [420000, 200000, 200000]);
  assert.deepEqual(state.missing, [180000, 0, 0]);
  assert.deepEqual(state.surplus, [0, 0, 0]);
  assert.equal(state.free, state.needed);
  const mixed = Castle.refill(1000000, [60, 20, 20], [528000, 236000, 236000]);
  assert.equal(mixed.free, 0);
  assert.deepEqual(mixed.missing, [72000, 0, 0]);
  assert.deepEqual(mixed.surplus, [0, 36000, 36000]);
});
test('surplus, overflow, empty and exact garrisons preserve capacity accounting', () => {
  for (const current of [[0, 0, 0], [600000, 200000, 200000], [600000, 300000, 300000], [400000, 200000, 300000]]) {
    const state = Castle.refill(1000000, [60, 20, 20], current);
    assert.equal(state.needed - state.excess, 1000000 - state.total);
    assert.equal(state.free - state.overflow, 1000000 - state.total);
  }
  assert.equal(Castle.refill(1000000, [60, 20, 20], [600000, 200000, 200000]).needed, 0);
});
test('small capacities round without negative counts or losing a troop', () => {
  for (const capacity of [1, 2, 7, 101]) {
    for (const mix of [[33.33, 33.33, 33.34], [50, 50, 0], [100, 0, 0]]) {
      const state = Castle.refill(capacity, mix, [0, 0, 0]);
      assert.equal(state.target.reduce((a, b) => a + b, 0), capacity);
      assert.ok(state.target.every(n => Number.isSafeInteger(n) && n >= 0));
    }
  }
});
test('invalid input cannot leave plausible results', () => {
  for (const mix of [[60, 20, 30], [-10, 50, 60], [NaN, 20, 80], [60, 40]]) assert.throws(() => Castle.refill(1000000, mix, [0, 0, 0]));
  for (const capacity of [0, -1, 1.5, NaN, Infinity, 10000001]) assert.throws(() => Castle.refill(capacity, [60, 20, 20], [0, 0, 0]));
  for (const current of [[-1, 0, 0], [0.5, 0, 0], [NaN, 0, 0], [1, 2]]) assert.throws(() => Castle.refill(1000000, [60, 20, 20], current));
});
test('leader examples and joiner effects use shared hero data with direct sources', () => {
  for (const stage of data.stages) for (const role of ['defense', 'attack']) {
    const lineup = data.lineups.filter(row => row.stage === stage.id && row.role === role);
    assert.equal(lineup.length, 1);
    assert.deepEqual(lineup[0].heroes.map(key => heroes.find(hero => hero.key === key).type), ['inf', 'cav', 'arc']);
    for (const key of lineup[0].heroes) assert.ok(heroes.find(hero => hero.key === key).generation <= 3);
  }
  for (const candidate of data.joiners) {
    assert.ok(heroes.find(hero => hero.key === candidate.id).skills[0]);
    assert.equal(new URL(candidate.source).hostname, 'kingshotoptimizer.com');
  }
});
