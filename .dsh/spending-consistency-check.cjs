const assert = require('node:assert/strict');
const Ledger = require('../js/player-ledger.js');
const Gear = require('../js/hero-gear-engine.js');
const Town = require('../js/town-centre-engine.js');
const Rules = require('../js/event-rules.js');
const HeroSpend = require('../js/hero-spend.js');
const BuildingSpend = require('../js/building-spend.js');
const MasterSpend = require('../js/master-spend.js');

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

const disk = storage(), store = Ledger.create(disk);
const empty = Town.available(store.snapshot(), 'prep', 2);
for (const id of ['mythic-hero-shard', 'epic-hero-shard', 'rare-hero-shard', 'masters-manuscript']) {
  assert.equal(empty.items.find(item => item.id === id).points, null, id);
}
store.setBalance('advanced-taming-mark', 0);
assert.equal(Town.available(store.snapshot(), 'prep', 3).items.find(item => item.id === 'advanced-taming-mark').points, 0);
const partialStore = Ledger.create(storage());
partialStore.setHero('jabel', { stars: 24 });
partialStore.setHero('amadeus', {});
partialStore.setBalance('hero-shards-jabel', 60);
partialStore.setBalance('mythic-hero-shard', 200);
const partial = Town.available(partialStore.snapshot(), 'prep', 2);
assert.ok(partial.items.find(item => item.id === 'mythic-hero-shard').points > 0);
assert.ok(partial.unknownItems['mythic-hero-shard'].includes('hero-stars-amadeus'));
store.setBalance('mithril', 10);
assert.equal(Town.available(store.snapshot(), 'prep', 4).total, 0);
assert(Town.available(store.snapshot(), 'prep', 4).unknown.includes('hero-gear-pieces'));
store.setBalance('forgehammer', 200);
store.setBalance('hero-gear-xp', 1000000);
store.setBalance('spare-mythic-gear', 10);
const gear = store.heroGear(Gear);
gear.pieces['inf-helm'] = Gear.normalisePiece({ quality: 'mythic', level: 100, mastery: 10 });
store.writeHeroGear(gear, Gear, { piece: 'inf-helm' });
const before = store.exportJSON();
for (const event of Object.keys(Rules.data.events)) {
  for (const day of Rules.days(event)) {
    const snapshot = store.snapshot();
    assert.equal(Town.available(snapshot, event, day.day).total, Town.day(snapshot, event, day.day).total);
  }
}
const full = Town.available(store.snapshot(), 'prep', 4, {}, 1000000);
assert.equal(full.total, 840000);
assert.equal(full.items.find(item => item.id === 'forgehammer').usable, 110);
const held = Town.available(store.snapshot(), 'prep', 4, { mithril: 2 }, 1000000);
assert.equal(held.total, 440000);
assert.equal(held.items.find(item => item.id === 'mithril').usable, 0);
assert.equal(held.reservedPoints, 400000);
assert.equal(held.shortfall, 560000);
assert.equal(Town.available(store.snapshot(), 'prep', 4, { forgehammer: 100 }).total, 0);
assert.equal(store.exportJSON(), before);
for (const amount of [-1, 1.5, NaN, Infinity, 1000000001]) {
  assert.throws(() => Town.available(store.snapshot(), 'prep', 4, { mithril: amount }));
  assert.throws(() => Town.available(store.snapshot(), 'prep', 4, {}, amount));
}
assert.equal(Town.available(store.snapshot(), 'prep', 4, { mithril: 99 }).items.find(item => item.id === 'mithril').reserved, 10);

const calls = { heroes: 0, gear: 0, buildings: 0, masters: 0 };
const originals = [];
for (const [api, key, count] of [[HeroSpend, 'plan', 'heroes'], [Gear, 'spendable', 'gear'], [BuildingSpend, 'plan', 'buildings'], [MasterSpend, 'plan', 'masters']]) {
  const original = api[key];
  originals.push(() => { api[key] = original; });
  api[key] = function (...args) { calls[count]++; return original(...args); };
}
try {
  const calculator = Town.forLedger(store);
  assert.equal(calculator, Town.forLedger(store));
  const first = calculator.all();
  calculator.all(); calculator.context(); calculator.day('prep', 4);
  calculator.available('prep', 4, {}, 1000000);
  calculator.available('prep', 4, {}, 2000000);
  assert.deepEqual(calls, { heroes: 1, gear: 1, buildings: 2, masters: 1 });
  Ledger.create(disk).setBalance('mithril', 20);
  assert.notEqual(calculator.all().results, first.results);
  assert.equal(calculator.snapshot().inventory.mithril.amount, 20);
  assert.deepEqual(calls, { heroes: 2, gear: 2, buildings: 4, masters: 2 });
  const other = Ledger.create(storage());
  assert.equal(Town.forLedger(other).day('prep', 4).total, 0);
  assert.notEqual(Town.forLedger(other), calculator);
} finally {
  originals.forEach(restore => restore());
}
console.log('Shared spending: page consistency, whole-upgrade reservations, immutable inventory, revision invalidation and reused plans pass.');
