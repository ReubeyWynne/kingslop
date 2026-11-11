// Fantasy Theater maths (js/fantasy-theater.mjs) against hand-checked figures and the event
// rules' KvK prep values. Run: node --test .dsh/seasonal-theater-check.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/fantasy-theater.mjs').default;
const rules = require('../_data/event_rules.json');
const D = T.data;
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, a + ' ≉ ' + b);

test('odds are complete', () => {
  near(D.floorsClimbed.reduce((n, r) => n + r.chance, 0), 1, 1e-9);
  near(D.fanstars.reduce((n, r) => n + r.chance, 0), 1, 1e-9);
  assert.equal(D.ascentByAttempt.at(-1), 1);
  near(T.fanstarsPerClimb, 1.5, 1e-9);
});

test('a climb to floor 7 costs 527 amulets on average and 1,115 at worst', () => {
  const c = T.climb();
  near(c.mean, 526.85, 0.01);
  assert.equal(c.max, 5 * (5 + 8 + 20 + 30 + 60 + 100));
  assert.ok(c.median <= c.p90 && c.p90 <= c.max);
  assert.equal(T.climb(D.fortress).max, 5 * (3 + 7 + 14 + 20 + 40 + 70 + 100));
});

test('best play earns about 21.6 tokens per amulet and claims only at the top', () => {
  const best = T.tokensPerAmulet();
  near(best, 21.61, 0.01);
  for (const floor of [2, 3, 4, 5, 6]) assert.ok(T.tokensPerAmulet(floor) < best, 'claiming at ' + floor + ' is worse');
  near(T.tokensPerAmulet(7), best, 1e-6);
  assert.ok(T.tokensPerAmulet(2) > D.pauseTokensPerAmulet);
});

test('pack prices per 1,000 tokens', () => {
  const p = Object.fromEntries(T.packs(T.tokensPerAmulet()).map(x => [x.id, x.perThousand]));
  near(p.rare, 3.85, 0.01); near(p.epic, 4.21, 0.01); near(p.mythic, 4.63, 0.01);
});

test('shop KvK points match the event rules', () => {
  const pts = rules.legacy.PTS, n = s => Number(String(s).replace(/[^0-9]/g, ''));
  assert.equal(D.items.truegold.kvkPoints, n(pts.Truegold));
  assert.equal(D.items.mithril.kvkPoints, n(pts.Mithril));
  assert.equal(D.items.forgehammer.kvkPoints, n(pts.Forgehammer));
  assert.equal(D.items.emblem.kvkPoints, n(pts['Master emblem']));
  assert.equal(D.items.speedup.kvkPoints, 60 * n(pts.Building));
});

test('spending respects stock, mithril first, and never overspends', () => {
  const a = T.spend(480);
  assert.equal(a.buys[0].id, 'truegold'); assert.equal(a.buys[0].count, 2); assert.ok(a.left < 10);
  const b = T.spend(5000);
  assert.deepEqual(b.buys.map(x => [x.id, x.count]).slice(0, 2), [['mithril', 6], ['truegold', 10]]);
  const c = T.spend(5000, { 1: 2 });
  assert.equal(c.buys[0].count, 2);
  const d = T.spend(5000, {}, false);
  assert.equal(d.buys[0].id, 'truegold');
  for (const r of [a, b, c, d]) assert.ok(r.left >= 0);
});

test('exploration rewards between two counts', () => {
  assert.deepEqual(T.track(192, 600).map(m => m.at), [200, 500]);
  assert.equal(T.track(0, 6000).length, D.track.length);
});
