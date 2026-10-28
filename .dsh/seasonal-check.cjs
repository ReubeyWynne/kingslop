const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/halloween-engine.js');
const L = require('../js/player-ledger.js');
const D = E.data;
function facts() { return Object.assign(E.blank(), { points: 10000, candy: 1000, daysLeft: 3 }); }
function storage() { const data = new Map(); return { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }; }
test('source distributions and variants are complete', () => {
  for (const pool of [...Object.values(D.chests), D.witchHits, D.freeAttacks, ...D.doors.houses.map(h => h.candy)]) assert.equal(pool.reduce((n, v) => n + v.chance, 0), 100);
  assert.equal(D.doors.houses.reduce((n, v) => n + v.weight, 0), 100);
  assert.equal(D.passThresholds.length, 21);
  for (const v of D.passVariants) assert.equal(v.levels.length, 21);
  assert.equal(D.milestoneCandy.reduce((a, b) => a + b), 1700);
});
test('uses current points and held candy, without re-adding past purchases', () => {
  const f = facts(), p = E.plan(); f.packs.fill(1); f.packs[6] = 3;
  assert.equal(E.budget(f, p).total, 1000);
  assert.equal(E.budget(f, p).pointGap, 2500);
  assert.equal(E.budget(f, p).paidCandy, 25000);
  f.points = 13000; assert.equal(E.budget(f, p).pointGap, 0);
});
test('unknown and zero are distinct and caps use remaining balance', () => {
  const f = facts(), p = E.plan(); p.gathering = 3000; p.beasts = 4000;
  assert.deepEqual(E.budget(f, p).missing, ['gathering', 'beasts']);
  f.gatheringCollected = 2990; f.beastsCollected = 0;
  assert.equal(E.budget(f, p).total, 5010);
  f.candy = null; assert.ok(E.budget(f, p).missing.includes('candy'));
});
test('conversions round complete ten-candy units', () => {
  const f = facts(), p = E.plan(); p.gems = 1999; p.speedupMinutes = 239;
  assert.equal(E.budget(f, p).total, 1020);
});
test('remaining mission claims exclude previous rewards and closed days', () => {
  const f = facts(), p = E.plan(); f.missions[5] = 3; p.missions[5] = 5;
  assert.equal(E.budget(f, p).total, 1800);
  p.missions[4] = 5; f.missions[4] = 0;
  assert.ok(E.budget(f, p).errors.includes('missionClosed'));
  f.missions[4] = null; assert.ok(E.budget(f, p).missing.includes('missions'));
});
test('packs require known counts, unlock order and remaining limits', () => {
  const f = facts(), p = E.plan(); p.packs[1] = 1;
  assert.ok(E.budget(f, p).errors.includes('packUnknown'));
  f.packs.fill(0); assert.ok(E.budget(f, p).errors.includes('packOrder'));
  f.packs[0] = 1; assert.deepEqual(E.budget(f, p).errors, []);
  assert.equal(E.budget(f, p).total, 2000); assert.equal(E.budget(f, p).packs.cents, 499);
  f.packs[1] = 1; assert.ok(E.budget(f, p).errors.includes('packLimit'));
  f.packs.fill(1); f.packs[6] = 2; p.packs.fill(0); p.packs[6] = 1;
  assert.deepEqual(E.budget(f, p).errors, []); p.packs[6] = 2; assert.ok(E.budget(f, p).errors.includes('packLimit'));
});
test('passes cannot be repurchased and variant requires age and Town Center', () => {
  const f = facts(), p = E.plan(); p.tracks[0] = true;
  assert.ok(E.budget(f, p).errors.includes('trackUnknown'));
  f.tracks[0] = true; assert.ok(E.budget(f, p).errors.includes('trackOwned'));
  assert.equal(E.variant(null, 30), null); assert.equal(E.variant(200, null), null);
  assert.equal(E.variant(200, 29).fromDay, 1); assert.equal(E.variant(500, 30).fromDay, 449);
});
test('unknown pass claims exclude rewards; known unclaimed levels feed candy back', () => {
  const f = facts(), p = E.plan(); f.candy = 0; f.tracks[0] = true; f.kingdomDay = 1; f.townCenter = 20;
  const unknown = E.simulate(f, p, 12); assert.equal(unknown.points, 10000); assert.ok(unknown.missing.includes('passClaims'));
  f.claimedPass = [0, 0, 0]; const fresh = E.simulate(f, p, 12);
  assert.ok(fresh.passCandy > 0); assert.ok(fresh.points > 10000);
  f.claimedPass = [21, 21, 0]; const collected = E.simulate(f, p, 12);
  assert.equal(collected.passCandy, 0); assert.equal(collected.points, 10000);
});
test('seeded forecasts are repeatable, respect current points and do not mutate facts', () => {
  const f = facts(), p = E.plan(), before = JSON.stringify(f);
  const a = E.forecast(f, p, 20), b = E.forecast(f, p, 20);
  assert.deepEqual(a, b); assert.equal(JSON.stringify(f), before);
  assert.ok(a.low >= 10100 && a.high >= a.median && a.median >= a.low); assert.equal(a.chance, 0);
  p.target = 10001; assert.equal(E.forecast(f, p, 20).chance, 1);
});
test('pity uses paid attacks and reaches certainty at forty', () => {
  assert.equal(E.pityChance(12), .002); assert.equal(E.pityChance(13), .038); assert.equal(E.pityChance(40), 1);
});
test('remaining doors cannot exceed event or door days; ended events cannot forecast', () => {
  const f = facts(), p = E.plan(); f.doorDaysLeft = 2; p.doors = 3;
  assert.ok(E.budget(f, p).errors.includes('doorLimit'));
  f.daysLeft = 0; assert.ok(E.budget(f, p).errors.includes('ended')); assert.throws(() => E.forecast(f, p, 10));
});
test('top-up rewards are incremental and excluded when progress is unknown', () => {
  const f = facts(), p = E.plan(); f.packs.fill(0); f.packs[0] = 1; p.packs[1] = 1;
  const without = E.incrementalRewards(f, p); f.topUpPoints = 0;
  assert.equal(E.incrementalRewards(f, p).Gems - without.Gems, 1000);
  f.topUpPoints = 2500; assert.equal(E.incrementalRewards(f, p).Gems, without.Gems);
});
test('seasonal save round-trips, keeps occurrences separate and rejects malformed data', () => {
  const store = L.create(storage()), f = facts(); store.setBalance('forgehammer', 42);
  const before = store.snapshot().inventory; store.setSeasonal('halloween-2026', f);
  const next = L.create(storage()); next.importJSON(store.exportJSON());
  assert.deepEqual(next.seasonal('halloween-2026'), f); assert.equal(next.seasonal('halloween-2027'), null);
  assert.deepEqual(store.snapshot().inventory, before);
  assert.throws(() => store.setSeasonal('halloween-2026', { ...f, packs: [99] }));
  assert.throws(() => store.setSeasonal('halloween-2026', { ...f, unknown: 1 }));
  const revision = store.snapshot().revision; store.setBalance('forgehammer', 43);
  assert.throws(() => store.setSeasonal('halloween-2026', f, revision));
  store.setSeasonal('halloween-2026', null); assert.equal(store.seasonal('halloween-2026'), null);
  assert.equal(L.validate(L.empty()).schemaVersion, 1);
});
test('candy EV needs only candy and returns no invented rewards below one paid hit', () => {
  for (const amount of [0, 19]) { const v = E.candyValue(amount); assert.equal(v.points, 0); assert.ok(Object.values(v.rewards).every(n => n === 0)); }
  const a = E.candyValue(1000), b = E.candyValue(1000);
  assert.deepEqual(a, b); assert.ok(a.points > 100 && a.points < 150); assert.equal(a.hits, a.points / 2);
  assert.ok(a.rewards.Gems > 0 && a.rewards.Forgehammer > 0);
});
test('rare item EV uses chest probabilities rather than random item drops', () => {
  const value = E.candyValue(20, { witchRemaining: 15, samples: 1000 });
  assert.ok(Math.abs(value.rewards.Forgehammer / value.hits - .02) < 1e-9);
  assert.ok(Math.abs(value.rewards.Gems / value.hits - 260.5) < 1e-9);
  const pity = E.candyValue(20, { pity: 39 }); assert.ok(pity.points >= 8 && pity.freeHits >= 3);
});
test('remaining mission income counts today once and excludes closed stages', () => {
  const input = { doors: 0, gathering: 0, beasts: 0, gems: 0, speedupMinutes: 0, other: 0, eventDay: 6, missionClaimed: 3, missionTarget: 5 };
  assert.equal(E.futureIncome(input).candy, 2500);
  input.missionClaimed = null; assert.equal(E.futureIncome(input).candy, 1700);
  input.eventDay = 8; assert.equal(E.futureIncome(input).candy, 0);
  input.eventDay = 0; input.doors = 2; assert.equal(E.futureIncome(input).candy, Math.round(2 * E.doorDaily()));
});
test('purchase selection adds only missing unlock tiers and respects the last pack limit', () => {
  assert.deepEqual(E.purchaseSequence(2, [0, 0, 0, 1, 0, 0, 0], 3), [0, 0, 1, 1, 0, 0, 0]);
  assert.deepEqual(E.purchaseSequence(6, [0, 0, 0, 0, 0, 0, 3], 1), [0, 0, 0, 0, 0, 0, 1]);
});
test('pass comparison includes already unlocked unclaimed rewards and spends pass candy', () => {
  const purchased = E.candyValue(0, { points: 10000, passes: [{ track: 'witchbane', variant: D.passVariants[0].id, claimed: 0 }] });
  assert.equal(purchased.passCandy, 1000); assert.ok(purchased.points > 100); assert.ok(purchased.rewards['Mythic General Hero Shard'] > 0);
  const claimed = E.candyValue(0, { points: 10000, passes: [{ track: 'witchbane', variant: D.passVariants[0].id, claimed: 21 }] });
  assert.equal(claimed.points, 0); assert.equal(claimed.passCandy, 0);
});
test('existing owned tracks use saved claimed levels and points', () => {
  const f = facts(); f.passVariant = D.passVariants[0].id; f.tracks = [true, false]; f.claimedPass = [21, 0, null];
  const progress = E.progressOptions(f); assert.deepEqual(progress.options.passes.map(p => [p.track, p.claimed]), [['free', 21], ['witchbane', 0]]);
  assert.ok(E.candyValue(0, progress.options).passCandy > 0);
  f.claimedPass[1] = 21; assert.equal(E.candyValue(0, E.progressOptions(f).options).passCandy, 0);
  f.claimedPass[1] = null; assert.ok(E.progressOptions(f).missing.includes('witchbane claimed level'));
});
test('existing collection and stage progress bound future income', () => {
  const f = facts(); f.gatheringCollected = 2990; f.beastsCollected = 3900; f.doorDaysLeft = 1; f.missions[5] = 3;
  const p = { gathering: 3000, beasts: 4000, doors: 7, gems: 0, speedupMinutes: 0, other: 0, eventDay: 1, missionClaimed: 0, missionTarget: 5 };
  const remaining = E.remainingIncome(f, p); assert.equal(remaining.gathering, 10); assert.equal(remaining.beasts, 100); assert.equal(remaining.doors, 1); assert.equal(remaining.eventDay, 6); assert.equal(remaining.missionClaimed, 3);
  assert.equal(E.futureIncome(remaining).lines.find(l => l.id === 'missions').candy, 2500);
  const store = L.create(storage()); f.passVariant = 1; store.setSeasonal('halloween-2026', f); const copy = L.create(storage()); copy.importJSON(store.exportJSON()); assert.equal(copy.seasonal('halloween-2026').passVariant, 1);
});
test('event day derives both event and door days without a second day count', () => {
  const f = E.blank(); assert.equal(E.eventTiming(f).doorDaysLeft, null);
  f.daysLeft = 8; assert.deepEqual(E.eventTiming(f), { day: 1, daysLeft: 8, doorDaysLeft: 7 });
  f.daysLeft = 3; assert.equal(E.eventTiming(f).doorDaysLeft, 2);
  f.doorsDoneToday = true; assert.equal(E.eventTiming(f).doorDaysLeft, 1);
  f.daysLeft = 1; assert.equal(E.eventTiming(f).doorDaysLeft, 0);
  f.daysLeft = 3; f.doorsDoneToday = false;
  const plan = { dailyDoors: true, doors: 0, gathering: 0, beasts: 0, gems: 0, speedupMinutes: 0, other: 0, eventDay: 0, missionClaimed: null, missionTarget: 0 };
  assert.equal(E.remainingIncome(f, plan).doors, 2);
});
test('overall item value includes fixed pack items and does not price candy twice', () => {
  assert.equal(E.valueRewards({ Gems: 2500, Truegold: 60, 'Halloween Custom Chest': 15 }).gems, 83875);
  const pack = E.data.packs[1], fixed = Object.fromEntries(pack.items.map(item => [item.name, item.amount]));
  assert.equal(E.valueRewards(fixed).gems, 92875);
  assert.ok(E.valueRewards(fixed).unpriced.includes("Jack-o'-Jitters Avatar Frame"));
  assert.deepEqual(E.valueRewards({ Gems: 100, 'Halloween Candy': 1000 }), { gems: 100, unpriced: [] });
  const candy = E.candyValue(1000).rewards, total = E.mergeRewards(fixed, candy);
  assert.ok(Math.abs(E.valueRewards(total).gems - E.valueRewards(fixed).gems - E.valueRewards(candy).gems) < 1e-6);
});
