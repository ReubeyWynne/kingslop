// Unit inputs (js/unit-input.js): which unit a figure shows in, and how typed
// text with or without a suffix becomes the raw whole number.
const assert = require('node:assert/strict');
const U = require('../js/unit-input.js');
assert.deepEqual([0, 950, 1000, 1500, 805510000, 805512345, 2e9, null].map(n => U.pick('count', n)), ['1', '1', 'k', 'k', 'm', '1', 'b', '1']);
assert.deepEqual([90, 120, 1650, 1440, 25681, 4320].map(n => U.pick('duration', n)), ['min', 'hr', 'min', 'day', 'min', 'day']);
assert.equal(U.format('count', 805510000, 'm'), '805.51');
assert.equal(U.format('duration', 4320, 'day'), '3');
assert.deepEqual([['1.2m', '1'], ['805.51', 'm'], ['2,632', '1'], ['1,5', 'k'], ['3', 'b'], ['', 'm'], ['abc', '1'], ['5x', '1']].map(([t, u]) => U.parse('count', t, u)), [1200000, 805510000, 2632, 1500, 3e9, null, NaN, NaN]);
assert.deepEqual([['3d', 'min'], ['90 min', 'day'], ['27.5h', 'min'], ['2', 'hr'], ['1', 'day']].map(([t, u]) => U.parse('duration', t, u)), [4320, 90, 1650, 120, 1440]);
console.log('Unit inputs: unit choice, formatting and typed figures with and without suffixes passed.');
