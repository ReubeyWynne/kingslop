(function (root) {
  'use strict';
  var ALIASES = {
    helm: /\b(helm(?:et)?|faceplate|armet)\b/i,
    gloves: /\b(gloves?|bracers?|gauntlets?)\b/i,
    chest: /\b(chest|shroud|leatherwear|breastplate|armor|armour)\b/i,
    boots: /\b(boots?|greaves|riders)\b/i
  };
  function parse(items) {
    var boxes = (items || []).map(function (item) {
      var text = String(item.text || '').trim(), points = item.poly || item.box || item.points || [];
      var xs = points.map(function (p) { return p[0]; }), ys = points.map(function (p) { return p[1]; });
      return { text: text, x: xs.length ? Math.min.apply(null, xs) : 0, y: ys.length ? (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2 : 0, h: ys.length ? Math.max.apply(null, ys) - Math.min.apply(null, ys) : 20 };
    }).filter(function (b) { return b.text; }).sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    var rows = [];
    boxes.forEach(function (box) {
      var row = rows[rows.length - 1];
      if (row && Math.abs(row.y - box.y) < Math.max(5, Math.min(row.h, box.h) * 0.65)) row.boxes.push(box);
      else rows.push({ y: box.y, h: box.h, boxes: [box] });
    });
    var lines = rows.map(function (row) { return row.boxes.sort(function (a, b) { return a.x - b.x; }).map(function (b) { return b.text; }).join(' '); });
    var full = lines.join('\n'), out = { level: null, mastery: null, quality: null, slot: null, troop: null, text: full };
    Object.keys(ALIASES).forEach(function (slot) { if (ALIASES[slot].test(full)) out.slot = out.slot ? 'ambiguous' : slot; });
    if (out.slot === 'ambiguous') out.slot = null;
    if (/\binfantry\b/i.test(full)) out.troop = 'inf';
    else if (/\bcavalry\b/i.test(full)) out.troop = 'cav';
    else if (/\b(archer|archery)\b/i.test(full)) out.troop = 'arc';
    if (/\b(red|ascended)\b/i.test(full)) out.quality = 'red';
    else if (/\bmythic\b/i.test(full)) out.quality = 'mythic';
    else if (/\bepic\b/i.test(full)) out.quality = 'epic';
    lines.forEach(function (line) {
      var mastery = line.match(/(?:mastery|forge\s*(?:level|mastery))\s*(?:lv\.?|level)?\s*[:+\-]?\s*(\d{1,2})(?!\d)/i);
      if (mastery && Number(mastery[1]) <= 20 && !/→|->/.test(line)) out.mastery = Number(mastery[1]);
      if (/mastery|forge|\d\s*\/\s*\d|%|→|->/i.test(line)) return;
      var red = line.match(/(?:lv\.?|level|enhancement)\s*[:.]?\s*\+\s*(\d{1,3})(?!\d)/i);
      if (red && Number(red[1]) <= 100) { out.level = 100 + Number(red[1]); out.quality = 'red'; return; }
      var level = line.match(/(?:enhancement\s*(?:level)?|lv\.?|level)\s*[:.]?\s*(\d{1,3})(?!\d)/i);
      if (level && Number(level[1]) <= 200) out.level = Number(level[1]);
    });
    if (out.level > 100) out.quality = 'red';
    return out;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { parse: parse };
  else root.HeroGearOCR = { parse: parse };
})(typeof window !== 'undefined' ? window : globalThis);
