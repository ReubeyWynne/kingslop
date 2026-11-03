// The one event points table every calculator uses (js/event-points.js): items, speedups,
// governor score and pet score each on their best days, ties listed together.
// Run: node .dsh/event-points-check.cjs
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const P = require(path.join(root, 'js/event-points.js'));
const pets = JSON.parse(fs.readFileSync(path.join(root, '_data/pets.json'), 'utf8'));
const pages = JSON.parse(fs.readFileSync(path.join(root, '_data/pages.json'), 'utf8'));

// Items: shards and widgets score on different days, so each is its own row.
const shards = P.forItems({ 'mythic-hero-shard': 10 }), widgets = P.forItems({ 'hero-widget': 1 });
assert.deepEqual([shards.prep.points, shards.prep.days], [30400, [2, 3]]);
assert.deepEqual([widgets.prep.points, widgets.prep.days], [8000, [4, 5]]);
assert.equal(P.forItems({ 'masters-manuscript': 5 }).sg, null, 'an event that never scores an item has no cell');
// Speedups score per whole minute at the best row that takes their kind.
assert.equal(P.forItems({}, { construction: 10.9 }).prep.points - P.forItems({}, { construction: 0 }).prep.points, 300);

// Pets: Pet Advancement score through the event rules matches pets.json's published points.
for (const profile of Object.values(pets.profiles)) for (const row of profile.levels) {
  if (!row.advance) continue;
  const cells = P.forPets(row.score), want = pets.points[String(row.level)];
  assert.deepEqual([cells.prep.points, cells.sg.points, cells.brawl.points], [want.kvk, want.sg, want.brawl], 'pet Advance at ' + row.level);
}

// Every calculator that shows event points loads the shared table and its styles.
for (const key of ['gear', 'governor', 'buildings', 'heroes', 'masters', 'pets']) {
  assert.ok(pages[key].scripts.some(s => s.endsWith('js/event-points.js')), key + ' loads js/event-points.js');
  assert.ok(pages[key].css.some(s => s.endsWith('css/event-points.css')), key + ' loads css/event-points.css');
}
console.log('Event points: items, speedups, ties, pet score and page wiring pass.');
