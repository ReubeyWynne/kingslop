/* Bonus Overview — the city's Bonus Overview popup, Military section. Plain
   text rows, one value each, readable at the detector's 800px:

     "Squads' Attack 162.4%"      applies to every troop type
     "Infantry Lethality 205.2%"  one troop type only

   The popup scrolls, so one shot rarely holds all sixteen rows; each shot
   offers only the rows it shows. The other Military rows (march queue,
   capacities, speeds) are left alone.

   Proposals target the Heroes page's lead finder sheet (`sheet:
   'bonus-overview'`), keyed 'ov-{squads|inf|cav|arc}-{stat}'. The page writes
   them into its Bonus Overview table and saves whole rows to the player save. */
(function (root, factory) {
  var deps = typeof module === 'object' && module.exports
    ? [require('../ocr-text.js'), require('../screen-import-core.js')]
    : [root.OcrText, root.ScreenImport];
  var api = factory(deps[0], deps[1]);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (T, S) {
  'use strict';

  var ROWS = [
    { key: 'squads', words: ['Squads', 'Squad'], label: 'Squads\'' },
    { key: 'inf', words: ['Infantry'], label: 'Infantry' },
    { key: 'cav', words: ['Cavalry'], label: 'Cavalry' },
    { key: 'arc', words: ['Archer', 'Archers'], label: 'Archer' }
  ];
  var STATS = [
    { key: 'attack', words: ['Attack'], label: 'Attack' },
    { key: 'defense', words: ['Defense', 'Defence'], label: 'Defense' },
    { key: 'lethality', words: ['Lethality'], label: 'Lethality' },
    { key: 'health', words: ['Health'], label: 'Health' }
  ];
  var PCT = /(\d+(?:[.,]\d+)?)\s*%/g;

  function folded(row) { return T.fold(row.text); }
  // The popup's title; the battle report has none, so this keeps the two apart.
  function titled(p) { return p.rows.some(function (r) { return /bonus overview/.test(folded(r)); }); }
  // "Squads' Attack" is only ever on this popup. A merged "Squads'Lethality" folds to two words.
  function row(r) {
    var f = folded(r).replace(/squads(?=[a-z])/, 'squads ');
    var who = ROWS.filter(function (x) { return T.wordIn(f, x.words); })[0];
    var stat = STATS.filter(function (x) { return T.wordIn(f, x.words); })[0];
    return who && stat ? { who: who, stat: stat } : null;
  }
  function lastPercent(text) {
    var hit, last = null;
    PCT.lastIndex = 0;
    while ((hit = PCT.exec(T.normalise(text))) !== null) last = parseFloat(hit[1].replace(',', '.'));
    return last;
  }

  var adapter = {
    id: 'bonus-overview',
    sourceType: 'bonus-overview',
    layout: 'table',
    sheet: 'bonus-overview',
    // Above the battle report's 0.85: both have "Infantry Attack 218.5%" rows.
    detect: function (p) {
      var hits = p.rows.filter(function (r) { return row(r) && lastPercent(r.text) !== null; });
      if (!hits.length) return 0;
      if (titled(p)) return 0.95;
      return hits.some(function (r) { return row(r).who.key === 'squads'; }) ? 0.9 : 0;
    },
    read: function (p) {
      var seen = {}, out = [];
      p.rows.forEach(function (r) {
        var at = row(r), value = lastPercent(r.text);
        if (!at || value === null) return;
        var id = 'ov-' + at.who.key + '-' + at.stat.key;
        if (seen[id]) return; // the topmost row wins
        seen[id] = true;
        var crop = S.rowCrop([r], p.width);
        out.push({
          target: 'sheet', sheet: 'bonus-overview', id: id, label: at.who.label + ' ' + at.stat.label,
          value: Math.round(value * 10) / 10, unit: 'percent', step: 0.1, min: 0, max: 100000,
          confidence: 0.9, crop: crop, y: crop.y, group: id, cols: 1
        });
      });
      return out;
    }
  };

  S.register(adapter);
  return adapter;
});
