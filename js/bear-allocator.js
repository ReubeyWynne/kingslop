(function (root) {
  'use strict';

  var LIMIT = 1000000000000;
  var TYPES = ['infantry', 'cavalry', 'archers'];

  function count(value) {
    value = Number(value);
    return isFinite(value) ? Math.min(LIMIT, Math.max(0, Math.floor(value))) : 0;
  }

  function total(march) {
    return march.infantry + march.cavalry + march.archers;
  }

  function empty() {
    return { infantry: 0, cavalry: 0, archers: 0 };
  }

  function split(stock, joinLimit, ownLimit, queues) {
    if (!queues) return { own: Math.min(stock, ownLimit), join: 0 };
    var equal = Math.floor(stock / (queues + 1));
    var join = Math.min(joinLimit, equal);
    var own = Math.min(ownLimit, equal);
    var rest = stock - own - queues * join;
    var extra = Math.min(joinLimit - join, Math.floor(rest / queues));
    join += extra;
    own += Math.min(ownLimit - own, stock - own - queues * join);
    return { own: own, join: join };
  }

  function allocate(options) {
    var stock = {};
    TYPES.forEach(function (type) { stock[type] = count(options[type]); });
    var queues = Math.min(6, count(options.queues));
    var joinCap = count(options.joinCap);
    var ownCap = count(options.ownCap);
    var own = empty();
    var join = empty();
    var priority = !!options.priority;
    var ratio = priority && options.ratio || { infantry: 5, cavalry: 15, archers: 80 };
    if (priority && (TYPES.some(function (type) { return !isFinite(ratio[type]) || ratio[type] < 0 || ratio[type] > 100; }) || Math.abs(TYPES.reduce(function (sum, type) { return sum + Number(ratio[type]); }, 0) - 100) > 0.000001)) {
      throw new RangeError('Own rally percentages must add up to 100');
    }

    function takeOwn(type, amount) {
      var used = Math.min(stock[type], Math.max(0, amount), ownCap - total(own));
      own[type] += used;
      stock[type] -= used;
    }

    if (priority || !queues) {
      var ownArchers = Math.floor(ownCap * Number(ratio.archers) / 100);
      var ownCavalry = Math.floor(ownCap * Number(ratio.cavalry) / 100);
      takeOwn('archers', ownArchers);
      takeOwn('cavalry', ownCavalry);
      takeOwn('infantry', ownCap - ownArchers - ownCavalry);
      ['archers', 'cavalry', 'infantry'].forEach(function (type) { takeOwn(type, ownCap - total(own)); });
      if (queues) {
        join.archers = Math.min(Math.floor(stock.archers / queues), Math.floor(joinCap * 0.8));
        stock.archers -= join.archers * queues;
      }
    } else {
      var archers = split(stock.archers, Math.floor(joinCap * 0.8), Math.floor(Math.min(ownCap, joinCap) * 0.8), queues);
      own.archers = archers.own;
      join.archers = archers.join;
      stock.archers -= own.archers + queues * join.archers;
    }

    if (queues) {
      var presetCavalry = Math.floor(joinCap * 0.15);
      var presetInfantry = joinCap - Math.floor(joinCap * 0.8) - presetCavalry;
      if (join.archers === Math.floor(joinCap * 0.8) && stock.cavalry >= queues * presetCavalry && stock.infantry >= queues * presetInfantry) {
        join.cavalry = presetCavalry;
        join.infantry = presetInfantry;
        stock.cavalry -= queues * join.cavalry;
        stock.infantry -= queues * join.infantry;
        if (!priority) {
          takeOwn('archers', Math.max(0, Math.floor(ownCap * 0.8) - own.archers));
          var remaining = ownCap - total(own);
          var ownPresetCavalry = Math.floor(ownCap * 0.15);
          var ownPresetInfantry = ownCap - Math.floor(ownCap * 0.8) - ownPresetCavalry;
          if (own.archers === Math.floor(ownCap * 0.8) && stock.cavalry >= ownPresetCavalry && stock.infantry >= ownPresetInfantry) {
            takeOwn('cavalry', ownPresetCavalry);
            takeOwn('infantry', ownPresetInfantry);
          } else {
            takeOwn('cavalry', remaining);
            takeOwn('infantry', ownCap - total(own));
          }
        }
      } else {
        ['cavalry', 'infantry'].forEach(function (type) {
          var share = split(stock[type], joinCap - total(join), priority ? 0 : ownCap - total(own), queues);
          own[type] += share.own;
          join[type] += share.join;
          stock[type] -= share.own + queues * share.join;
        });
      }
    }

    if (queues && stock.archers > 0) {
      var extraArchers = split(stock.archers, joinCap - total(join), ownCap - total(own), queues);
      own.archers += extraArchers.own;
      join.archers += extraArchers.join;
      stock.archers -= extraArchers.own + queues * extraArchers.join;
    }

    own.total = total(own);
    join.total = total(join);
    return { own: own, join: join, home: stock, queues: queues, priority: priority };
  }

  var api = { allocate: allocate };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BH_BEAR_ALLOCATOR = api;
})(typeof window === 'object' ? window : this);
