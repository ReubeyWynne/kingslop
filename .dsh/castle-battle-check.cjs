const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, '_data/castle_battle.json')));
const heroes = JSON.parse(fs.readFileSync(path.join(root, '_data/heroes.json'))).heroes;
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
