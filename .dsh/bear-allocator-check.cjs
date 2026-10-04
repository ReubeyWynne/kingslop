const assert = require('node:assert/strict');
const { allocate } = require('../js/bear-allocator.js');
const base = { infantry: 29750, cavalry: 89250, archers: 476000, queues: 6, joinCap: 85000, ownCap: 130000 };
const equal = allocate(base);
assert.deepEqual(equal.own, { infantry: 4250, cavalry: 12750, archers: 68000, total: 85000 });
assert.deepEqual(equal.join, equal.own);
const priority = allocate({ ...base, priority: true });
assert.deepEqual(priority.own, { infantry: 6500, cavalry: 19500, archers: 104000, total: 130000 });
assert.deepEqual(priority.join, { infantry: 3875, cavalry: 11625, archers: 62000, total: 77500 });
const custom = allocate({ infantry: 1000000, cavalry: 1000000, archers: 1000000, queues: 6, joinCap: 85000, ownCap: 100000, priority: true, ratio: { infantry: 20, cavalry: 30, archers: 50 } });
assert.deepEqual(custom.own, { infantry: 20000, cavalry: 30000, archers: 50000, total: 100000 });
assert.equal(custom.join.total, 85000);
assert.throws(() => allocate({ ...base, priority: true, ratio: { infantry: 5, cavalry: 15, archers: 70 } }), RangeError);
const onlyArchers = allocate({ ...base, infantry: 0, cavalry: 0, archers: 595000 });
assert.equal(onlyArchers.join.total, 85000);
assert.equal(onlyArchers.home.archers, 0);
assert.deepEqual(allocate({ ...base, infantry: 0, cavalry: 0, archers: 0 }).own, { infantry: 0, cavalry: 0, archers: 0, total: 0 });
assert.equal(allocate({ ...base, queues: 0 }).join.total, 0);
let seed = 20261004;
function random(maximum) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % maximum; }
for (let i = 0; i < 2000; i++) {
  const input = { infantry: random(1000000), cavalry: random(1000000), archers: random(1000000), queues: random(7), joinCap: random(150000), ownCap: random(200000), priority: !!random(2) };
  const result = allocate(input);
  for (const type of ['infantry', 'cavalry', 'archers']) {
    assert.equal(result.own[type] + input.queues * result.join[type] + result.home[type], input[type]);
    for (const n of [result.own[type], result.join[type], result.home[type]]) { assert.ok(Number.isInteger(n)); assert.ok(n >= 0); }
  }
  assert.ok(result.own.total <= input.ownCap);
  assert.ok(result.join.total <= input.joinCap);
  assert.equal(result.own.total, result.own.infantry + result.own.cavalry + result.own.archers);
  assert.equal(result.join.total, result.join.infantry + result.join.cavalry + result.join.archers);
}
console.log('Allocation cases and 2,000 conservation/capacity checks passed.');
