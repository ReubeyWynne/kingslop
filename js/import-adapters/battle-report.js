/* Battle report — the Battle Details screen of a battle report. Each Bonus
   Details row ("+30.5%  Infantry Attack  +23.0%") holds your value left of its
   label and the opponent's right of it (the colours only say which is higher).
   The troop counts sit in one row under the six troop icons, yours then
   theirs ("70,500 30,000 49,500 60,000 45,000 45,000"); a "Troops" row gives
   each side's total when the report doesn't split it.

   Proposals target the battle simulator's sheet, not the player save: each
   carries the sheet field's id ('sim-atk-inf', 'sim-foe-n-cav') and
   `sheet: 'battle-report'`. A side's total, when it is all the report gives,
   is 'sim-n-total' or 'sim-foe-n-total'; the simulator shares it out in the
   mix already typed. The row is the cut-out for both of its values. */
(function (root, factory) {
  var deps = typeof module === 'object' && module.exports
    ? [require('../ocr-text.js'), require('../screen-import-core.js')]
    : [root.OcrText, root.ScreenImport];
  var api = factory(deps[0], deps[1]);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (T, S) {
  'use strict';

  var TYPES = [{ key: 'inf', block: 'Infantry' }, { key: 'cav', block: 'Cavalry' }, { key: 'arc', block: 'Archer' }];
  var STATS = [{ key: 'atk', ocr: 'Attack' }, { key: 'let', ocr: 'Lethality' }, { key: 'def', ocr: 'Defense' }, { key: 'hea', ocr: 'Health' }];
  var BLOCKS = TYPES.map(function (t) { return t.block; }), STATS_EN = STATS.map(function (s) { return s.ocr; });
  var TROOPS = 'Troops';

  var PCT = /[+\-]?\d+(?:[.,]\d+)?\s*%/g;
  function pctValue(s) { return parseFloat(String(s).replace(',', '.')); }

  // A troop count: a whole number, grouped in thousands or not ("12,345",
  // "12.345", "12 345" with a narrow space, "1234"). Never a percentage, a
  // decimal, or the 10 of "T10" or "Lv.10": group 1 eats the character before.
  var COUNT = /(^|[^0-9A-Za-z.,])(\d{1,3}(?:[,.  ]\d{3})+|\d+)(?![\d%.,]|\s*%)/g;
  function countHits(text) {
    var hits = [], hit;
    COUNT.lastIndex = 0;
    while ((hit = COUNT.exec(text)) !== null) hits.push({ index: hit.index + hit[1].length, value: parseInt(hit[2].replace(/[^0-9]/g, ''), 10) });
    return hits;
  }

  // The last hit before the label is yours, the first after it is theirs.
  // With no label position, the first and last hits.
  function sides(hits, at) {
    var left = null, right = null;
    if (at === -1) {
      left = hits[0] || null;
      right = hits.length > 1 ? hits[hits.length - 1] : null;
    } else {
      hits.forEach(function (h) { if (h.index < at) left = h; else if (!right) right = h; });
      if (!left && !right) left = hits[0] || null;
    }
    return { left: left, right: right };
  }

  // Both columns of every troop-type stat row and troop row.
  // Returns { values: { 'L|Block|Stat': n, … }, snippets: { 'Block|Stat': row } }.
  function parseItems(items) {
    var rows = T.rows(T.boxes(items)), out = {}, snippets = {};
    function put(label, pair, value) {
      if (pair.left && isFinite(value(pair.left))) out['L|' + label] = value(pair.left);
      if (pair.right && isFinite(value(pair.right))) out['R|' + label] = value(pair.right);
    }
    rows.forEach(function (r) {
      var joined = r.text, folded = T.fold(joined);
      var block = T.wordIn(folded, BLOCKS), stat = T.wordIn(folded, STATS_EN), label;
      if (!stat) {
        var counts = countHits(joined);
        // The counts sit in one row under the six troop icons: yours, then
        // theirs, each infantry, cavalry, archer. The Troop Power Comparison
        // rows above name a type over a bar and hold no counts.
        if (!block && counts.length === 6 && !/[a-z]{3}/i.test(joined.replace(/lv/ig, '')) && !snippets.icons) {
          snippets.icons = r;
          TYPES.forEach(function (t, i) {
            out['L|' + t.block + '|' + TROOPS] = counts[i].value;
            out['R|' + t.block + '|' + TROOPS] = counts[i + 3].value;
            snippets[t.block + '|' + TROOPS] = r;
          });
          return;
        }
        // A totals row says "Troops"; power, kills and losses rows are not troops.
        if (block || !T.wordIn(folded, [TROOPS]) || snippets[TROOPS] || /power|kill|loss|lost|injur|wound|surviv/.test(joined.toLowerCase())) return;
        if (!counts.length) return;
        snippets[TROOPS] = r;
        put(TROOPS, sides(counts, joined.search(/troop/i)), function (h) { return h.value; });
        return;
      }
      if (!block) return;
      label = block + '|' + stat;
      if (snippets[label]) return; // the topmost row wins
      // Joining the row first survives the OCR splitting "+457.5" and "%"
      // apart; searching from the label survives it fusing two numbers.
      snippets[label] = r;
      var hits = [], hit;
      PCT.lastIndex = 0;
      while ((hit = PCT.exec(joined)) !== null) hits.push(hit);
      if (hits.length) put(label, sides(hits, joined.search(new RegExp(block, 'i'))), function (h) { return pctValue(h[0]); });
    });
    return { values: out, snippets: snippets };
  }

  var adapter = {
    id: 'battle-report',
    sourceType: 'battle-report',
    layout: 'list',
    sheet: 'battle-report',
    // Two or more stat rows with a percentage make a Bonus Details sheet.
    detect: function (p) {
      var hits = p.rows.filter(function (r) { var f = T.fold(r.text); return T.wordIn(f, BLOCKS) && T.wordIn(f, STATS_EN) && /\d\s*%/.test(r.text); }).length;
      return hits >= 2 ? 0.85 : 0;
    },
    read: function (p) {
      var parsed = parseItems(p.items), v = parsed.values, out = [];
      // The counts' cut-out reaches up over the troop icons they sit under.
      function crop(label) {
        var r = parsed.snippets[label];
        if (!r || !p.width) return null;
        var y0 = Math.min.apply(null, r.items.map(function (b) { return b.y; })), y1 = Math.max.apply(null, r.items.map(function (b) { return b.y + b.h; }));
        var pad = (y1 - y0) * 0.5, top = Math.max(0, y0 - (r === parsed.snippets.icons ? (y1 - y0) * 5 : pad));
        return { x: 0, y: top, w: p.width, h: Math.min(p.height || Infinity, y1 + pad) - top };
      }
      function add(side, label, id, kind, name) {
        var value = v[side + '|' + label];
        if (value === undefined) return;
        var c = crop(label), row = parsed.snippets[label];
        out.push({
          // Values from one row of the report share its cut-out in review.
          group: row === parsed.snippets.icons ? 'icons' : label,
          target: 'sheet', sheet: 'battle-report', id: id, side: side === 'L' ? 'you' : 'foe', label: name,
          value: kind === 'count' ? Math.round(value) : Math.round(value * 10) / 10, unit: kind === 'count' ? 'count' : 'percent',
          step: kind === 'count' ? 1 : 0.1, min: kind === 'count' ? 0 : -100, confidence: 0.9, crop: c,
          y: c ? c.y : Infinity
        });
      }
      TYPES.forEach(function (t) {
        ['L', 'R'].forEach(function (side) {
          var prefix = side === 'L' ? 'sim-' : 'sim-foe-';
          add(side, t.block + '|' + TROOPS, prefix + 'n-' + t.key, 'count', t.block + ' troops');
          STATS.forEach(function (s) { add(side, t.block + '|' + s.ocr, prefix + s.key + '-' + t.key, 'percent', t.block + ' ' + s.ocr); });
        });
      });
      // A total only where the report gives no split for that side.
      ['L', 'R'].forEach(function (side) {
        var split = TYPES.some(function (t) { return v[side + '|' + t.block + '|' + TROOPS] !== undefined; });
        if (!split) add(side, TROOPS, side === 'L' ? 'sim-n-total' : 'sim-foe-n-total', 'count', 'All troops');
      });
      return out;
    },
    parseItems: parseItems
  };

  S.register(adapter);
  return adapter;
});
