const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const Castle = require('../js/castle-battle-engine.js');
const data = JSON.parse(fs.readFileSync(path.join(root, '_data/castle_battle.json')));
const heroes = JSON.parse(fs.readFileSync(path.join(root, '_data/heroes.json'))).heroes;
test('infantry depletion changes the live ratio without changing back-row counts', () => {
  const state = Castle.formation([60, 20, 20], 180000);
  assert.deepEqual(state.active, [420000, 200000, 200000]);
  assert.equal(state.total, 820000);
  assert.ok(Math.abs(state.shares[0] - 51.21951219512195) < 0.000001);
  assert.equal(state.shares[1], state.shares[2]);
});
test('complete frontline depletion and refill preserve count accounting', () => {
  const spent = Castle.formation([40, 20, 40], 900000);
  assert.equal(spent.loss, 400000);
  assert.deepEqual(spent.active, [0, 200000, 400000]);
  assert.deepEqual(Castle.formation([40, 20, 40], 0).active, [400000, 200000, 400000]);
  assert.deepEqual(Castle.formation([100, 0, 0], 1000000).shares, [0, 0, 0]);
});
test('invalid mixes cannot produce plausible looking lessons', () => {
  for (const mix of [[60, 20, 30], [-10, 50, 60], [NaN, 20, 80], [60, 40]]) assert.throws(() => Castle.formation(mix, 0));
  assert.throws(() => Castle.formation([60, 20, 20], -1));
});
test('each progression has both roles and every candidate uses the shared Gen 1–3 data', () => {
  for (const stage of data.stages) for (const role of ['defense', 'attack']) {
    const lineup = data.lineups.filter(row => row.stage === stage.id && row.role === role);
    assert.equal(lineup.length, 1);
    assert.deepEqual(lineup[0].heroes.map(key => heroes.find(hero => hero.key === key).type), ['inf', 'cav', 'arc']);
    for (const key of lineup[0].heroes) assert.ok(heroes.find(hero => hero.key === key).generation <= 3);
  }
  for (const candidate of data.joiners) assert.ok(heroes.find(hero => hero.key === candidate.id).skills[0]);
});
