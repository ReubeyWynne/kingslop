(function (root) {
  'use strict';
  function formation(mix, loss, total) {
    total = total === undefined ? 1000000 : Number(total);
    if (!Array.isArray(mix) || mix.length !== 3 || mix.some(function (n) { return !Number.isFinite(n) || n < 0; }) || mix.reduce(function (a, b) { return a + b; }, 0) !== 100 || !Number.isSafeInteger(total) || total <= 0) throw new Error('Invalid formation');
    var start = [Math.round(total * mix[0] / 100), Math.round(total * mix[1] / 100), 0];
    start[2] = total - start[0] - start[1];
    loss = Number(loss);
    if (!Number.isFinite(loss) || loss < 0) throw new Error('Invalid depletion');
    loss = Math.min(start[0], Math.floor(loss));
    var active = start.slice(); active[0] -= loss;
    var remaining = active.reduce(function (a, b) { return a + b; }, 0);
    return { start: start, active: active, loss: loss, total: remaining, shares: active.map(function (n) { return remaining ? n / remaining * 100 : 0; }) };
  }
  var api = { formation: formation };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CastleBattle = api;
})(typeof window !== 'undefined' ? window : this);
