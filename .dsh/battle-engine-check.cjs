// Battle engine check — js/battle-engine.js, the model behind the simulator's
// Mystic Trial sweep and battle mode. Pins the troop table, the kill formula,
// the troop skills, determinism and the sweep grid.
const assert = require('node:assert/strict');
const E = require('../js/battle-engine.js');

const stats = v => ({ atk: [v, v, v], let: [v, v, v], def: [v, v, v], hea: [v, v, v] });
const side = (n, tier, v) => Object.assign({ n, tier: [tier, tier, tier], tg: [0, 0, 0] }, stats(v));

// The troop table: attack 1 : 3 : 4 and health 3 : 1 : ¾ per tier, so
// attack × health is the same for all three types (KINGSHOT-SOURCES.md §1).
for (let tier = 1; tier <= E.TIERS; tier++) {
  for (let tg = 0; tg < E.TGS; tg++) {
    const a = [0, 1, 2].map(t => E.baseAtk(t, tier, tg));
    const h = [0, 1, 2].map(t => E.baseHea(t, tier, tg));
    assert.ok(Math.abs(a[1] / a[0] / 3 - 1) < 0.02 && Math.abs(a[2] / a[0] / 4 - 1) < 0.02, `attack ratio T${tier} TG${tg}`);
    assert.equal(h[0], a[1], `infantry health mirrors cavalry attack T${tier} TG${tg}`);
    assert.equal(h[1], a[0], `cavalry health mirrors infantry attack T${tier} TG${tg}`);
  }
}
assert.deepEqual([E.baseAtk(0, 6, 0), E.baseHea(0, 6, 0)], [243, 730]);
assert.deepEqual([E.baseAtk(2, 11, 5), E.baseHea(2, 11, 5)], [2865, 493]);
assert.deepEqual([E.baseAtk(0, 99, 99), E.baseAtk(0, 0, -1)], [E.baseAtk(0, 11, 5), E.baseAtk(0, 1, 0)], 'tier and TG clamp to the table');

// Second troop skills arrive with T7 (or TG3), the bear panel's line.
assert.equal(E.hasSecondSkill(6, 0), false);
assert.equal(E.hasSecondSkill(7, 0), true);
assert.equal(E.hasSecondSkill(6, 3), true);

// Factors: A = base attack × (1 + atk)(1 + let), D = base health × (1 + def)(1 + hea).
const f = E.prepare(side([100, 0, 0], 6, 100));
assert.equal(f.A[0], 243 * 4);
assert.equal(f.D[0], 730 * 4);
assert.deepEqual(E.prepare({ n: [-5, 'x', 2.7] }).n, [0, 0, 2], 'counts are whole and never negative');

// One round by hand: infantry vs infantry, T6, equal stats, 10,000 a side.
// dead = ceil(√(10000 · 10000) · 243/730 / 100 · (1 − 0.0001)) = ceil(33.28…) = 34.
{
  const a = E.prepare(side([10000, 0, 0], 6, 0));
  const r = E.battle(a, a, () => 0.5);
  assert.equal(r.win, false, 'a mirror fight is no win for the attacker');
  assert.deepEqual(r.a, r.b, 'a mirror fight is symmetric');
  const first = Math.ceil(Math.sqrt(10000 * 10000) * 243 / 730 / 100 * (1 - 0.0001));
  assert.equal(first, 34);
}

// Without a chance skill (T6 troops) the same fight always ends the same
// way, so it is fought once and the seed changes nothing.
{
  const archers = side([0, 0, 5000], 6, 0), infantry = side([5000, 0, 0], 6, 0);
  const r1 = E.run(archers, infantry, 50, 1), r2 = E.run(archers, infantry, 50, 99);
  assert.equal(r1.random, false);
  assert.equal(r1.battles, 1, 'a fight with no chance skill is fought once');
  assert.deepEqual(r1, r2, 'deterministic fights ignore the seed');
}

// Stronger stats win; the result is stable for a seed.
{
  const strong = side([50000, 50000, 50000], 10, 300), weak = side([50000, 50000, 50000], 10, 200);
  const r = E.run(strong, weak, 100, 7);
  assert.equal(r.random, true, 'T10 troops carry the chance skills');
  assert.equal(r.win, 1);
  assert.deepEqual(E.run(strong, weak, 100, 7), r, 'same seed, same answer');
  assert.equal(E.run(weak, strong, 100, 7).win, 0);
  assert.ok(r.a.every(x => x >= 0) && r.b.every(x => x === 0));
}

// More troops win at equal stats (the √N law favours the bigger army).
assert.equal(E.run(side([60000, 30000, 30000], 10, 200), side([50000, 25000, 25000], 10, 200), 100, 3).win, 1);

// The sweep grid: a 5% step covers 231 mixes; the windows narrow it.
assert.equal(E.grid({ step: 0.05 }).cells.length, 231);
assert.equal(E.grid({ step: 0.1 }).cells.length, 66);
assert.ok(E.grid({ step: 0.05, minInf: 0.3, maxInf: 0.7, minCav: 0.05, maxCav: 0.3 }).cells.every(c => c[0] >= 6 && c[0] <= 14 && c[1] >= 1 && c[1] <= 6));
assert.equal(E.grid({ step: 0.05, minInf: 0.9, minCav: 0.2 }).cells.length, 0);

// A sweep keeps the total, and the best mix is the top win chance.
{
  const you = side([0, 0, 0], 10, 220), foe = side([70000, 30000, 50000], 10, 230);
  const s = E.sweep(you, foe, { total: 150000, step: 0.1, battles: 20, seed: 5 });
  assert.equal(s.cells.length, 66);
  assert.ok(s.cells.every(c => c.n[0] + c.n[1] + c.n[2] === 150000));
  const top = E.best(s.cells);
  assert.ok(s.cells.every(c => c.win <= top.win));
  assert.ok(top.win > 0, 'some mix beats this stage');
  assert.ok(s.cells.some(c => c.win === 0), 'and some mix loses it');
}

{
  const you = side([0, 0, 0], 6, 220), foe = side([1000, 1000, 1000], 6, 200);
  const progress = [];
  const s = E.sweep(you, foe, { total: 3000, step: 0.1, battles: 50 }, (done, of, battles) => progress.push({ done, of, battles }));
  assert.equal(s.battles, s.cells.length);
  assert.deepEqual(progress.at(-1), { done: 66, of: 66, battles: 66 });
  const random = E.sweep(side([0, 0, 0], 10, 220), side([1000, 1000, 1000], 10, 200), { total: 3000, step: 0.1, battles: 20 });
  assert.equal(random.battles, random.cells.length * 20);
}

assert.equal(E.seedOf({ a: 1 }), E.seedOf({ a: 1 }));
assert.notEqual(E.seedOf({ a: 1 }), E.seedOf({ a: 2 }));

console.log('battle engine ok');
