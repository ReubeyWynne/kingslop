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
const partialStore = Ledger.create(storage());
const partial = E.defaults();
const partialRecord = { id: 'gear-' + 'b'.repeat(64), sourceType: 'hero-gear', at: new Date().toISOString(), contentHash: 'b'.repeat(64), confirmation: 'confirmed', itemDelta: { 'inf-helm': { before: null, after: { quality: 'mythic', level: null, mastery: 0 } }, 'inf-boots': { before: null, after: { quality: 'mythic', level: 0, mastery: 0 } } } };
partialStore.writeHeroGear(partial, E, { source: 'screenshot', records: [partialRecord] });
assert.equal(partialStore.snapshot().heroGear.pieces['inf-helm'].level, null);
assert.equal(partialStore.snapshot().heroGear.pieces['inf-boots'].level, 0);
assert.equal(partialStore.heroGear(E).pieces['inf-helm'].level, 0);
assert.equal(partialStore.balance('forgehammer').amount, null);
const partStore = Ledger.create(storage({ [Ledger.LEGACY_KEY]: original }));
partStore.setHeroGearPart('ten', 7);
assert.equal(partStore.balance('hero-gear-xp').amount, 12379);
assert.deepEqual(partStore.heroGear(E).parts, { ten: 7, hundred: 123, remainder: 9 });
assert.equal(partStore.balance('forgehammer').amount, 71);
const unchangedParts = partStore.exportJSON();
assert.throws(() => partStore.setHeroGearPart('hundred', 10000000));
assert.equal(partStore.exportJSON(), unchangedParts);

const combatDisk = storage(), combatStore = Ledger.create(combatDisk);
assert.deepEqual(combatStore.combat(), { stats: {}, provenance: {}, troops: [] });
const legacyV1 = Ledger.empty(); delete legacyV1.combat;
assert.doesNotThrow(() => Ledger.validate(legacyV1));
combatStore.setBalance('forgehammer', 12);
combatStore.setCombat({ stats: { inf: { attack: 250.5, lethality: 163, defense: 250, health: 163 } }, troops: [{ type: 'inf', tier: 10, tg: 2, amount: 120000 }, { type: 'arc', tier: 9, tg: 0, amount: 5000 }, { type: 'arc', tier: 10, tg: 0, amount: 80000 }] }, 'screenshot');
const fight = Ledger.create(combatDisk).combat();
assert.equal(fight.stats.inf.attack, 250.5);
assert.equal(fight.provenance.inf.source, 'screenshot');
assert.equal(fight.stats.cav, undefined);
assert.deepEqual(fight.troops.map(t => [t.type, t.tier, t.tg, t.amount]), [['inf', 10, 2, 120000], ['arc', 10, 0, 80000], ['arc', 9, 0, 5000]]);
assert.equal(combatStore.balance(Ledger.troopId('inf', 10, 2)).amount, 120000);
assert.equal(combatStore.balance('forgehammer').amount, 12);
combatStore.setCombat({ troops: [{ type: 'arc', tier: 9, tg: 0, amount: null }] });
assert.equal(combatStore.combat().troops.length, 2);
assert.equal(Object.hasOwn(combatStore.snapshot().inventory, Ledger.troopId('arc', 9, 0)), false);
assert.equal(combatStore.combat().stats.inf.health, 163);
const combatBefore = combatStore.exportJSON();
assert.throws(() => combatStore.setCombat({ stats: { inf: { attack: -1, lethality: 0, defense: 0, health: 0 } } }));
assert.throws(() => combatStore.setCombat({ stats: { foe: { attack: 1, lethality: 0, defense: 0, health: 0 } } }));
assert.throws(() => combatStore.setCombat({ troops: [{ type: 'inf', tier: 12, tg: 0, amount: 1 }] }));
assert.throws(() => combatStore.setCombat({ troops: [{ type: 'inf', tier: 10, tg: 0, amount: 1.5 }] }));
assert.equal(combatStore.exportJSON(), combatBefore);
for (const mutate of [
  data => { data.combat.stats.inf.attack = 'x'; },
  data => { delete data.combat.provenance.inf; },
  data => { data.combat.stats.inf.speed = 1; },
  data => { data.combat.provenance.cav = { source: 'manual', at: data.updatedAt }; }
]) {
  const data = JSON.parse(combatBefore); mutate(data);
  assert.throws(() => Ledger.create(storage()).importJSON(data, E));
}
const combatCopy = Ledger.create(storage());
combatCopy.importJSON(combatBefore, E);
assert.deepEqual(combatCopy.combat().stats, combatStore.combat().stats);
assert.equal(combatCopy.combat().troops.length, 2);
const heroStore = Ledger.create(storage());
assert.deepEqual(heroStore.heroes(), { roster: {}, provenance: {}, shards: {}, widgets: {} });
assert.equal(heroStore.snapshot().heroes, undefined);
heroStore.setBalance('forgehammer', 7);
heroStore.setHero('amadeus', { level: 80, stars: 27, widget: 6, skills: [5, 4, 5] });
heroStore.setHero('seth', {});
heroStore.setBalance(Ledger.heroShardId('amadeus'), 34);
heroStore.setBalance(Ledger.heroShardId('zoe'), 9);
heroStore.setBalance('mythic-hero-shard', 120);
heroStore.setBalance(Ledger.heroWidgetId('amadeus'), 3);
const owned = heroStore.heroes();
assert.deepEqual(owned.roster.amadeus, { level: 80, stars: 27, widget: 6, skills: [5, 4, 5] });
assert.deepEqual(owned.roster.seth, { level: null, stars: null, widget: null, skills: null });
assert.deepEqual(owned.shards, { amadeus: 34, zoe: 9 });
assert.deepEqual(owned.widgets, { amadeus: 3 });
assert.equal(owned.provenance.amadeus.source, 'manual');
assert.equal(heroStore.balance('forgehammer').amount, 7);
const heroRevision = heroStore.snapshot().revision;
heroStore.setHero('amadeus', { level: 80, stars: 27, widget: 6, skills: [5, 4, 5] });
assert.equal(heroStore.snapshot().revision, heroRevision + 1);
assert.deepEqual(heroStore.heroes().provenance.amadeus, owned.provenance.amadeus);
heroStore.setHero('seth', null);
assert.equal(Object.hasOwn(heroStore.heroes().roster, 'seth'), false);
assert.equal(heroStore.heroes().shards.amadeus, 34);
// Widgets are per hero, like shards; choose-a-hero chests are per generation.
heroStore.setBalance(Ledger.heroWidgetId('amadeus'), 12);
assert.equal(heroStore.heroes().widgets.amadeus, 12);
assert.equal(Object.hasOwn(heroStore.heroes().shards, 'amadeus') && !Object.hasOwn(heroStore.heroes().widgets, 'jabel'), true);
assert.equal(Ledger.widgetChestId(3), 'hero-widget-chest-gen3');
const heroBefore = heroStore.exportJSON();
for (const bad of [{ level: 0 }, { level: 201 }, { stars: 31 }, { stars: 2.5 }, { widget: 11 }, { skills: [] }, { skills: [6] }, { skills: [1, 1, 1, 1] }, { power: 1 }]) assert.throws(() => heroStore.setHero('helga', bad));
assert.throws(() => heroStore.setHero('Helga', {}));
assert.equal(heroStore.exportJSON(), heroBefore);
for (const mutate of [
  data => { data.heroes.roster.amadeus.level = '80'; },
  data => { delete data.heroes.provenance.amadeus; },
  data => { data.heroes.roster.amadeus.power = 1; },
  data => { data.heroes.provenance.zoe = { source: 'manual', at: data.updatedAt }; }
]) {
  const data = JSON.parse(heroBefore); mutate(data);
  assert.throws(() => Ledger.create(storage()).importJSON(data, E));
}
const heroCopy = Ledger.create(storage());
heroCopy.importJSON(heroBefore, E);
assert.deepEqual(heroCopy.heroes(), heroStore.heroes());
// Building levels: the game's level ids, one provenance entry each; null forgets a level.
const buildingStore = Ledger.create(storage());
assert.deepEqual(buildingStore.buildings(), { levels: {}, provenance: {} });
assert.equal(buildingStore.snapshot().buildings, undefined);
for (const level of ['0', '1', '30', '30-4', 'TG 1', 'TG3-2', 'TG 10']) assert.ok(Ledger.buildingLevel(level), level);
for (const level of ['31', 'TG 11', 'TG3-5', 'TG10-1', 'TG1', 3, null]) assert.equal(Ledger.buildingLevel(level), false, String(level));
buildingStore.setBuilding('town-center', 'TG 3'); buildingStore.setBuilding('war-academy', '0');
assert.deepEqual(buildingStore.buildings().levels, { 'town-center': 'TG 3', 'war-academy': '0' });
const buildingRevision = buildingStore.snapshot().revision;
buildingStore.setBuilding('town-center', 'TG 3');
assert.equal(buildingStore.buildings().provenance['town-center'].source, 'manual');
assert.throws(() => buildingStore.setBuilding('town-center', 'TG 11'));
assert.throws(() => buildingStore.setBuilding('Town Center', '1'));
buildingStore.setBuilding('war-academy', null);
assert.equal(Object.hasOwn(buildingStore.buildings().levels, 'war-academy'), false);
assert.ok(buildingStore.snapshot().revision > buildingRevision);
const buildingBefore = buildingStore.exportJSON();
for (const mutate of [data => { data.buildings.levels['town-center'] = 'TG 12'; }, data => { delete data.buildings.provenance['town-center']; }]) {
  const data = JSON.parse(buildingBefore); mutate(data); assert.throws(() => Ledger.validate(data));
}
// Set every building at once, and keep upgrade priorities with the save.
buildingStore.setBuildings({ embassy: 'TG 2', barracks: 'TG 2', 'war-academy': null });
assert.deepEqual(buildingStore.buildings().levels, { 'town-center': 'TG 3', embassy: 'TG 2', barracks: 'TG 2' });
assert.throws(() => buildingStore.setBuildings({ embassy: 'TG 11' }));
buildingStore.setBuildingPriorities({ tiers: { infirmary: 0, 'command-center': 2 }, order: ['range', 'barracks', 'stable'] });
buildingStore.setBuildingPriorities({ tiers: { range: 1 } });
assert.deepEqual(buildingStore.snapshot().preferences.buildings, { tiers: { infirmary: 0, 'command-center': 2, range: 1 }, order: ['range', 'barracks', 'stable'] });
assert.throws(() => buildingStore.setBuildingPriorities({ tiers: { range: 4 } }));
assert.throws(() => buildingStore.setBuildingPriorities({ order: ['range', 'range'] }));
// The upgrade priority page's role travels with the save; null forgets it.
assert.deepEqual(buildingStore.priority(), { role: null, goals: [] });
buildingStore.setPriorityRole('lead');
assert.deepEqual(buildingStore.priority(), { role: 'lead', goals: [] });
assert.throws(() => buildingStore.setPriorityRole('whale'));
for (const bad of [{ role: 'whale' }, { role: 'lead', extra: 1 }, 'lead']) {
  const data = JSON.parse(buildingStore.exportJSON()); data.preferences.priority = bad; assert.throws(() => Ledger.validate(data));
}
buildingStore.setPriorityRole(null);
assert.equal(buildingStore.snapshot().preferences.priority, undefined);
// Goals travel with the role in preferences.priority; each is absent when unset.
const goalList = [{ kind: 'building', target: 'town-center', level: 'TG 5' }, { kind: 'hero', target: 'amadeus', level: 24 }, { kind: 'hero-gear', target: 'inf-helm', level: 140 }, { kind: 'governor-gear', target: 'arc-1', level: 40 }, { kind: 'governor-charm', target: 'cav-2-3', level: 12 }, { kind: 'pet', target: 'gray-wolf', level: 50 }, { kind: 'master', target: 'valora', level: 40 }];
buildingStore.setPriorityGoals(goalList);
assert.deepEqual(buildingStore.priority(), { role: null, goals: goalList });
buildingStore.setPriorityRole('farm');
assert.deepEqual(buildingStore.snapshot().preferences.priority, { goals: goalList, role: 'farm' }, 'setting the role keeps the goals');
for (const bad of [
  [{ kind: 'building', target: 'town-center', level: 'TG 11' }], [{ kind: 'building', target: 'town-center', level: '0' }], [{ kind: 'hero', target: 'amadeus', level: 31 }],
  [{ kind: 'hero-gear', target: 'inf-ring', level: 10 }], [{ kind: 'governor-gear', target: 'arc-1', level: 59 }], [{ kind: 'governor-charm', target: 'arc-1', level: 5 }],
  [{ kind: 'pet', target: 'gray-wolf', level: 0 }], [{ kind: 'master', target: 'valora', level: 1.5 }], [{ kind: 'research', target: 'x', level: 1 }],
  [{ kind: 'pet', target: 'gray-wolf', level: 10, note: 'x' }], [{ kind: 'pet', target: 'gray-wolf', level: 10 }, { kind: 'pet', target: 'gray-wolf', level: 20 }],
  Array.from({ length: 21 }, (_, i) => ({ kind: 'pet', target: 'pet-' + String.fromCharCode(97 + i), level: 10 }))
]) {
  assert.throws(() => buildingStore.setPriorityGoals(bad), JSON.stringify(bad[0]));
  const data = JSON.parse(buildingStore.exportJSON()); data.preferences.priority.goals = bad; assert.throws(() => Ledger.validate(data));
}
{ const data = JSON.parse(buildingStore.exportJSON()); data.preferences.priority = {}; assert.throws(() => Ledger.validate(data), 'an empty section is never stored'); }
{ const data = JSON.parse(buildingStore.exportJSON()); data.preferences.priority.goals = []; assert.throws(() => Ledger.validate(data), 'an empty goal list is never stored'); }
buildingStore.setPriorityGoals([]);
assert.deepEqual(buildingStore.snapshot().preferences.priority, { role: 'farm' });
buildingStore.setPriorityRole(null);
assert.equal(buildingStore.snapshot().preferences.priority, undefined);
buildingStore.setPriorityRole('joiner');
const buildingBefore2 = buildingStore.exportJSON();
const buildingCopy = Ledger.create(storage());
buildingCopy.importJSON(buildingBefore2, E);
assert.deepEqual(buildingCopy.snapshot().preferences.buildings, buildingStore.snapshot().preferences.buildings);
assert.deepEqual(buildingCopy.buildings(), buildingStore.buildings());
// Training facts: speed %, capacity per batch and a tier per camp, each with provenance; the capacity buff is a preference.
const trainingStore = Ledger.create(storage());
assert.deepEqual(trainingStore.training(), { facts: {}, provenance: {}, buff: false, position: null, highKing: false, mobilize: false });
trainingStore.setTraining('speed', 182.5); trainingStore.setTraining('capacity', 1150); trainingStore.setTraining('arc', 11); trainingStore.setTrainingBuff(true);
assert.deepEqual(trainingStore.training().facts, { speed: 182.5, capacity: 1150, arc: 11 });
assert.equal(trainingStore.training().buff, true);
trainingStore.setTrainingPlan('position', 'minister'); trainingStore.setTrainingPlan('mobilize', true);
assert.deepEqual(trainingStore.snapshot().preferences.training, { buff: true, position: 'minister', mobilize: true });
trainingStore.setTrainingPlan('position', null); trainingStore.setTrainingPlan('mobilize', false);
assert.deepEqual(trainingStore.snapshot().preferences.training, { buff: true });
for (const [key, value] of [['inf', 0], ['inf', 12], ['inf', 10.5], ['capacity', 0], ['capacity', 1.5], ['speed', -1], ['march', 1]]) assert.throws(() => trainingStore.setTraining(key, value), key + ' ' + value);
const trainingBefore = trainingStore.exportJSON();
for (const mutate of [data => { data.training.facts.inf = 12; }, data => { delete data.training.provenance.arc; }, data => { data.preferences.training.buff = 'yes'; }, data => { data.preferences.training.gems = 3000; }, data => { data.preferences.training.position = 'king'; }, data => { data.preferences.training.mobilize = false; }]) {
  const data = JSON.parse(trainingBefore); mutate(data); assert.throws(() => Ledger.validate(data));
}
const trainingCopy = Ledger.create(storage());
trainingCopy.importJSON(trainingBefore, E);
assert.deepEqual(trainingCopy.training(), trainingStore.training());
trainingStore.setTraining('arc', null); trainingStore.setTrainingBuff(false);
assert.deepEqual(Object.keys(trainingStore.training().facts), ['speed', 'capacity']);
assert.equal(trainingStore.snapshot().preferences.training, undefined);
// Backpack screenshots: inventory deltas with screenshot provenance, no repeats.
const bagDisk = storage(), bag = Ledger.create(bagDisk);
bag.setBalance('bread', 5);
const bagRecord = { id: 'bag-' + 'c'.repeat(64), sourceType: 'backpack', at: new Date().toISOString(), contentHash: 'c'.repeat(64), confirmation: 'confirmed', inventoryDelta: { bread: { before: 5, after: 805510000 }, 'speedup-general': { before: null, after: 25681 } } };
const bagRevision = bag.snapshot().revision;
bag.applyImport(bagRecord, bagRevision);
assert.equal(bag.balance('bread').amount, 805510000);
assert.deepEqual({ source: bag.balance('speedup-general').provenance.source, importId: bag.balance('speedup-general').provenance.importId }, { source: 'screenshot', importId: bagRecord.id });
assert.throws(() => bag.applyImport(Object.assign({}, bagRecord, { id: 'bag-other' })), /already confirmed/);
assert.throws(() => bag.applyImport(Object.assign({}, bagRecord, { contentHash: 'd'.repeat(64), id: 'bag-d' }), bagRevision), /changed/);
assert.throws(() => bag.applyImport(Object.assign({}, bagRecord, { sourceType: 'mystery', contentHash: 'e'.repeat(64), id: 'bag-e' })));
assert.throws(() => bag.applyImport(Object.assign({}, bagRecord, { contentHash: 'f'.repeat(64), id: 'bag-f', inventoryDelta: { bread: { before: 1, after: -2 } } })));
assert.equal(Ledger.validate(JSON.parse(bagDisk.getItem(Ledger.KEY))).imports.length, 1, 'a backpack record survives validation on reload');
// Pet List screenshots: levels mark pets tamed; an Advance survives only at the same level.
bag.setPet('lion', { level: 70, advanced: true });
bag.setPet('lynx', { level: 30, advanced: true });
const petRecord = { id: 'pets-' + 'a'.repeat(64), sourceType: 'pets', at: new Date().toISOString(), contentHash: 'a'.repeat(64), confirmation: 'confirmed', petDelta: { lion: { before: 70, after: 70 }, lynx: { before: 30, after: 40 }, bison: { before: null, after: 60 } } };
bag.applyImport(petRecord, bag.snapshot().revision);
assert.deepEqual(bag.pets().roster, { lion: { level: 70, advanced: true }, lynx: { level: 40, advanced: false }, bison: { level: 60, advanced: false } });
assert.deepEqual({ source: bag.pets().provenance.bison.source, importId: bag.pets().provenance.bison.importId }, { source: 'screenshot', importId: petRecord.id });
assert.throws(() => bag.applyImport(Object.assign({}, petRecord, { contentHash: 'b'.repeat(64), id: 'pets-b', petDelta: { lion: { before: 70, after: 101 } } })));
assert.equal(Ledger.validate(JSON.parse(bagDisk.getItem(Ledger.KEY))).imports.length, 2, 'a pet record survives validation on reload');
// Inventory history: confirmed balance changes are recorded beside the save, unknowns are not.
const historyDisk = storage(), historyStore = Ledger.create(historyDisk);
historyStore.setBalance('truegold', 120);
historyStore.setBalance('truegold', 120);
historyStore.setBalance('truegold', 95, 'screenshot');
historyStore.setBalance('truegold', null);
historyStore.setBalance('truegold', 140);
historyStore.setBuilding('town-center', 'TG 3');
assert.deepEqual(historyStore.history('truegold').map(e => [e.before, e.after, e.source]), [[null, 120, 'manual'], [120, 95, 'screenshot'], [null, 140, 'manual']]);
assert.equal(historyStore.history().length, 3, 'only inventory changes are recorded');
// Old entries fold into one reading per item per day; a broken history never blocks a save.
const old = { schemaVersion: 1, entries: [
  { at: '2026-01-02T01:00:00.000Z', id: 'forgehammer', before: 10, after: 40, source: 'manual' },
  { at: '2026-01-02T05:00:00.000Z', id: 'forgehammer', before: 40, after: 70, source: 'screenshot' },
  { at: '2026-01-03T05:00:00.000Z', id: 'forgehammer', before: 70, after: 20, source: 'manual' }] };
historyDisk.setItem('bh:player-history:v1', JSON.stringify(old));
historyStore.setBalance('forgehammer', 25);
assert.deepEqual(historyStore.history('forgehammer').map(e => [e.at.slice(0, 10), e.before, e.after]), [['2026-01-02', 10, 70], ['2026-01-03', 70, 20], [new Date().toISOString().slice(0, 10), null, 25]]);
historyDisk.setItem('bh:player-history:v1', '{not json');
historyStore.setBalance('forgehammer', 30);
assert.equal(historyStore.balance('forgehammer').amount, 30);
assert.deepEqual(historyStore.history('forgehammer').map(e => [e.before, e.after]), [[25, 30]]);
// The history travels with the save: export carries it, import replaces it, undo restores it.
const file = JSON.parse(historyStore.exportJSON());
assert.deepEqual(file.history, { schemaVersion: 1, entries: historyStore.history() });
const moved = Ledger.create(storage());
moved.setBalance('forgehammer', 999);
moved.importJSON(file, E);
assert.deepEqual(moved.history(), historyStore.history(), 'the file history replaces the local one; the import itself is not a reading');
assert.equal(moved.snapshot().history, undefined, 'the history never lands inside the save');
assert.equal(moved.balance('forgehammer').amount, 30);
// A file exported before the history was included keeps the local history and records the import.
const older = JSON.parse(historyStore.exportJSON()); delete older.history;
const kept = Ledger.create(storage());
kept.setBalance('forgehammer', 5);
kept.importJSON(older, E);
assert.deepEqual(kept.history('forgehammer').map(e => [e.before, e.after]), [[null, 5], [5, 30]]);
// Undo through a backup restores the save and its history together.
const undoStore = Ledger.create(storage());
undoStore.setBalance('truegold', 10);
const backup = undoStore.backup();
undoStore.importJSON(file, E);
undoStore.importJSON(backup, E);
assert.equal(undoStore.balance('truegold').amount, 10);
assert.deepEqual(undoStore.history().map(e => [e.id, e.before, e.after]), [['truegold', null, 10]]);
// A malformed or future history rejects the whole file and leaves the save alone.
const untouched = moved.exportJSON();
for (const mutate of [
  data => { data.history.schemaVersion = 2; },
  data => { data.history = []; },
  data => { data.history.entries[0].after = -1; },
  data => { data.history.entries[0].before = '3'; },
  data => { data.history.entries[0].at = 'yesterday'; },
  data => { data.history.entries[0].source = 'guess'; },
  data => { data.history.entries[0].extra = 1; },
  data => { data.history.entries = Array.from({ length: 8001 }, () => data.history.entries[0]); }
]) { const bad = JSON.parse(untouched); mutate(bad); assert.throws(() => moved.importJSON(bad, E)); assert.equal(moved.exportJSON(), untouched); }
// An unreadable local history exports empty rather than blocking the export.
const unreadDisk = storage(), unread = Ledger.create(unreadDisk);
unread.setBalance('truegold', 1);
unreadDisk.setItem('bh:player-history:v1', '{not json');
assert.deepEqual(JSON.parse(unread.exportJSON()).history, { schemaVersion: 1, entries: [] });
console.log('Player ledger migration, persistence, import validation, provenance, duplicate screenshots, backpack and pet imports, undo, revision, combat stat, troop, hero roster, building level, training, inventory history and history export checks passed.');
