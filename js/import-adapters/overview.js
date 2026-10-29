/* Overview: Resources & Speedups — the backpack's summary popup (the chart
   button beside "Backpack"). Pure text rows, readable at the detector's 800px:

     Resources tab   "Bread 207.60M 597.91M"           (Items, In Stock)
     Speedups tab    "General Speedup 17 day(s)20 hr(s)1 min(s)"

   The right-hand In Stock column is already the total (bag items included),
   so each resource takes that figure; speedups become minutes per kind. */
(function (root, factory) {
  var deps = typeof module === 'object' && module.exports
    ? [require('../ocr-text.js'), require('../screen-import-core.js')]
    : [root.OcrText, root.ScreenImport];
  var api = factory(deps[0], deps[1]);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (T, S) {
  'use strict';

  var RESOURCES = [
    { id: 'bread', words: ['Bread'] },
    { id: 'wood', words: ['Wood'] },
    { id: 'stone', words: ['Stone'] },
    { id: 'iron', words: ['Iron'] }
  ];
  // Checked in order: "Soldier Training Speedup" must not fall to a looser match.
  var SPEEDUPS = [
    { id: 'speedup-training', words: ['Training'] },
    { id: 'speedup-healing', words: ['Healing'] },
    { id: 'speedup-construction', words: ['Construction'] },
    { id: 'speedup-research', words: ['Research'] },
    { id: 'speedup-learning', words: ['Learning'] },
    { id: 'speedup-general', words: ['General'] }
  ];

  function folded(row) { return T.fold(row.text); }
  function isOverview(p) {
    return p.rows.some(function (r) { var f = folded(r); return f.indexOf('overview') !== -1 && f.indexOf('speedup') !== -1; });
  }
  function hasRow(p, word) {
    return p.rows.some(function (r) { return folded(r).indexOf(word) !== -1; });
  }

  // The first row naming the thing, from the header row down.
  function labelRow(p, words) {
    for (var i = 0; i < p.rows.length; i++) if (T.wordIn(folded(p.rows[i]), words)) return i;
    return -1;
  }

  // Rounded amounts on a row, left to right: "207.60M", "597.91M".
  function amounts(row) {
    return row.items.map(function (b) { return T.parseShort(b.text); }).filter(function (n) { return n !== null; });
  }

  function format(n) {
    return n >= 1e12 ? (n / 1e12).toFixed(2) + 'T' : n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(2) + 'K' : String(n);
  }

  var resources = {
    id: 'overview-resources',
    sourceType: 'backpack',
    detect: function (p) {
      if (!isOverview(p)) return 0;
      return hasRow(p, 'stock') && labelRow(p, ['Bread']) !== -1 ? 0.95 : 0;
    },
    read: function (p) {
      return RESOURCES.map(function (spec) {
        var i = labelRow(p, spec.words);
        var proposal = { target: 'inventory', id: spec.id, value: null, confidence: 0, label: spec.words[0], crop: null, note: '' };
        if (i === -1) return proposal;
        var row = p.rows[i], found = amounts(row);
        proposal.crop = S.rowCrop([row], p.width);
        // Two figures are Items then In Stock, and In Stock is the total. One
        // alone can't be placed in its column with certainty, so it is offered
        // as the total but flagged.
        if (found.length >= 2) {
          proposal.value = found[found.length - 1];
          proposal.confidence = 0.9;
          proposal.note = format(found[found.length - 1]);
        } else if (found.length === 1) {
          proposal.value = found[0];
          proposal.confidence = 0.5;
          proposal.note = format(found[0]);
        }
        return proposal;
      });
    }
  };

  var speedups = {
    id: 'overview-speedups',
    sourceType: 'backpack',
    detect: function (p) {
      if (!isOverview(p)) return 0;
      var timed = p.rows.filter(function (r) { return T.parseDuration(r.text) !== null && T.wordIn(folded(r), ['General', 'Construction', 'Research']); });
      return timed.length ? 0.95 : 0;
    },
    read: function (p) {
      var used = {};
      return SPEEDUPS.map(function (spec) {
        var proposal = { target: 'inventory', id: spec.id, value: null, confidence: 0, label: spec.words[0], crop: null, note: '' };
        for (var i = 0; i < p.rows.length; i++) {
          if (used[i] || !T.wordIn(folded(p.rows[i]), spec.words)) continue;
          var minutes = T.parseDuration(p.rows[i].text);
          if (minutes === null) continue;
          used[i] = true;
          // A label that wraps ("Soldier Training / Speedup") leaves its second
          // line just below; it belongs in the cut-out too.
          var parts = [p.rows[i]], next = p.rows[i + 1];
          if (next && T.parseDuration(next.text) === null && /^speedups?$/.test(folded(next))) parts.push(next);
          proposal.crop = S.rowCrop(parts, p.width);
          proposal.value = minutes;
          proposal.confidence = 0.9;
          break;
        }
        return proposal;
      });
    }
  };

  S.register(resources);
  S.register(speedups);
  return { resources: resources, speedups: speedups };
});
