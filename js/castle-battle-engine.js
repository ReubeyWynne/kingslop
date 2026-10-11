(function (root) {
  'use strict';
  function refill(capacity, mix, current) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0 || capacity > 10000000) throw new Error('Enter a capacity between 1 and 10,000,000.');
    if (!Array.isArray(mix) || mix.length !== 3 || mix.some(function (n) { return !Number.isFinite(n) || n < 0 || n > 100; }) || Math.abs(mix.reduce(function (a, b) { return a + b; }, 0) - 100) > 0.000001) throw new Error('The three target percentages must add to 100.');
    if (!Array.isArray(current) || current.length !== 3 || current.some(function (n) { return !Number.isSafeInteger(n) || n < 0 || n > 10000000; })) throw new Error('Enter whole, non-negative current troop counts up to 10,000,000.');
    var exact = mix.map(function (n) { return capacity * n / 100; });
    var target = exact.map(Math.floor);
    var remainder = capacity - target.reduce(function (a, b) { return a + b; }, 0);
    var order = [0, 1, 2].sort(function (a, b) { return (exact[b] - target[b]) - (exact[a] - target[a]); });
    for (var i = 0; i < remainder; i++) target[order[i % 3]]++;
    var total = current.reduce(function (a, b) { return a + b; }, 0);
    var missing = target.map(function (n, t) { return Math.max(0, n - current[t]); });
    var surplus = target.map(function (n, t) { return Math.max(0, current[t] - n); });
    return { target: target, current: current.slice(), total: total, free: Math.max(0, capacity - total), overflow: Math.max(0, total - capacity), missing: missing, surplus: surplus, needed: missing.reduce(function (a, b) { return a + b; }, 0), excess: surplus.reduce(function (a, b) { return a + b; }, 0) };
  }
  var api = { refill: refill };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CastleBattle = api;
})(typeof window !== 'undefined' ? window : this);
