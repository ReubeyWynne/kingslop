const assert = require('node:assert/strict');
const Ledger = require('../js/player-ledger.js');
const E = require('../js/hero-gear-engine.js');
function storage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
const fixture = E.defaults();
fixture.resources = { xp: 12349, hammers: 71, mythic: 9, mithril: 22 };
fixture.parts = { ten: 4, hundred: 123, remainder: 9 };
fixture.pieces['arc-helm'] = { quality: 'red', level: 120, mastery: 11 };
const original = JSON.stringify(fixture);
const disk = storage({ [Ledger.LEGACY_KEY]: original });
const store = Ledger.create(disk);
store.migrate(E);
assert.deepEqual(store.heroGear(E), fixture);
assert.equal(disk.getItem(Ledger.LEGACY_KEY), original);
const firstOtherTool = Ledger.create(storage({ [Ledger.LEGACY_KEY]: original }));
firstOtherTool.setBalance('training-speedup-minute', 20);
assert.equal(firstOtherTool.heroGear(E).resources.hammers, 71);
const migrated = store.exportJSON();
store.migrate(E);
assert.equal(store.exportJSON(), migrated);
assert.equal(store.balance('forgehammer').provenance.source, 'legacy');
assert.equal(store.balance('unreadable-item').amount, null);
assert.equal(store.snapshot().governorGear.status, 'unsupported');
assert.equal(store.snapshot().governorCharms.status, 'unsupported');
const fresh = Ledger.create(storage());
fresh.writeHeroGear(E.defaults(), E);
assert.equal(fresh.balance('forgehammer').status, 'unknown');
assert.deepEqual(fresh.snapshot().heroGear.pieces, {});
fresh.writeHeroGear(E.defaults(), E, { resource: 'hammers' });
assert.equal(fresh.balance('forgehammer').amount, 0);
assert.equal(fresh.balance('mithril').amount, null);
store.setBalance('training-speedup-minute', 480);
const changed = store.heroGear(E);
changed.resources.hammers = 53;
changed.profile = 'garrison'; changed.weights = E.PROFILES.garrison;
store.writeHeroGear(changed, E);
assert.equal(Ledger.create(disk).heroGear(E).resources.hammers, 53);
assert.equal(store.balance('training-speedup-minute').amount, 480);
assert.equal(store.balance('forgehammer').provenance.source, 'manual');
assert.equal(store.balance('mithril').provenance.source, 'legacy');
assert.equal(store.snapshot().preferences.heroGear.resources, undefined);
assert.equal(store.snapshot().preferences.heroGear.pieces, undefined);
store.setBalance('hero-gear-xp', 217);
assert.deepEqual(store.heroGear(E).parts, { ten: 1, hundred: 2, remainder: 7 });
const exported = store.exportJSON(), imported = Ledger.create(storage());
imported.importJSON(exported, E);
const a = store.snapshot(), b = imported.snapshot();
delete a.revision; delete b.revision; delete a.updatedAt; delete b.updatedAt;
assert.deepEqual(b, a);
const before = store.exportJSON();
for (const mutate of [
  data => { data.schemaVersion = 2; },
  data => { data.inventory.forgehammer.amount = -1; },
  data => { data.inventory.forgehammer.amount = '52'; },
  data => { data.inventory.forgehammer.provenance = null; },
  data => { data.inventory.forgehammer = { amount: 0, status: 'unknown', provenance: null }; },
  data => { data.heroGear.pieces['arc-helm'].level = 220; },
  data => { data.heroGear.parts = { ten: 0, hundred: 0, remainder: 0 }; },
  data => { data.preferences.heroGear.resources = { hammers: 99 }; },
  data => { data.governorGear.pieces.helm = { level: 100 }; }
]) {
  const bad = JSON.parse(before); mutate(bad);
  assert.throws(() => store.importJSON(bad, E));
  assert.equal(store.exportJSON(), before);
}
const corrupt = storage({ [Ledger.KEY]: '{bad', [Ledger.LEGACY_KEY]: original });
assert.throws(() => Ledger.create(corrupt).migrate(E));
assert.equal(corrupt.getItem(Ledger.KEY), '{bad');
const future = JSON.parse(before); future.schemaVersion = 99;
const futureDisk = storage({ [Ledger.KEY]: JSON.stringify(future) });
assert.throws(() => Ledger.create(futureDisk).snapshot());
assert.equal(JSON.parse(futureDisk.getItem(Ledger.KEY)).schemaVersion, 99);
const brokenLegacy = JSON.parse(original); brokenLegacy.pieces['inf-helm'].level = -1;
const brokenDisk = storage({ [Ledger.LEGACY_KEY]: JSON.stringify(brokenLegacy) });
assert.throws(() => Ledger.create(brokenDisk).migrate(E));
assert.equal(brokenDisk.getItem(Ledger.KEY), null);
const limited = storage({ [Ledger.LEGACY_KEY]: original });
limited.setItem = () => { throw new Error('Quota'); };
assert.throws(() => Ledger.create(limited).migrate(E), /Quota/);
assert.equal(limited.getItem(Ledger.LEGACY_KEY), original);
assert.equal(limited.getItem(Ledger.KEY), null);
const stale = store.snapshot().revision;
Ledger.create(disk).setBalance('forgehammer', 999);
assert.throws(() => store.writeHeroGear(changed, E, { expectedRevision: stale }), /another tool/);
assert.equal(store.balance('forgehammer').amount, 999);
assert.throws(() => store.importJSON(exported, E, stale), /another tool/);
let notifications = 0;
const unsubscribe = store.subscribe(() => notifications++);
store.setBalance('mithril', 30);
unsubscribe(); store.setBalance('mithril', 31);
assert.equal(notifications, 1);
const screenshot = store.heroGear(E), snapshot = store.snapshot();
screenshot.pieces['inf-helm'] = { quality: 'mythic', level: 42, mastery: 2 };
const record = { id: 'gear-' + 'a'.repeat(64), sourceType: 'hero-gear', at: new Date().toISOString(), contentHash: 'a'.repeat(64), confirmation: 'confirmed', itemDelta: { 'inf-helm': { before: snapshot.heroGear.pieces['inf-helm'], after: screenshot.pieces['inf-helm'] } } };
store.writeHeroGear(screenshot, E, { source: 'screenshot', records: [record] });
assert.equal(store.snapshot().imports.length, 1);
assert.equal(store.snapshot().heroGear.provenance['inf-helm'].importId, record.id);
const confirmed = store.exportJSON();
assert.throws(() => store.writeHeroGear(screenshot, E, { source: 'screenshot', records: [record] }), /already confirmed/);
assert.equal(store.exportJSON(), confirmed);
store.importJSON(snapshot, E);
assert.equal(store.snapshot().imports.length, 0);
assert.deepEqual(store.snapshot().heroGear.pieces['inf-helm'], snapshot.heroGear.pieces['inf-helm']);
store.writeHeroGear(E.defaults(), E, { all: true, source: 'reset' });
assert.equal(store.balance('training-speedup-minute').amount, 480);
assert.equal(store.balance('forgehammer').amount, 0);
assert.equal(disk.getItem(Ledger.LEGACY_KEY), original);
console.log('Player ledger migration, persistence, import validation, provenance, duplicate screenshots, undo and revision checks passed.');
