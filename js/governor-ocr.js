/* Reads a Governor Profile screenshot. The profile shows levels as pictures, not text: each
   gear card's art and frame give its tier and grade, gold marks on its lower left corner its
   stars, and each charm's colour its troop and its outline its level. So this matches
   against the same game art the page draws (img/governor), and needs no OCR model.

   Pure and requireable in Node: images are { width, height, data } RGBA, as canvas
   ImageData gives them. read(image, templates) returns, per gear piece and charm, the level,
   how sure the match is (0–1) and where it was found, so a review can show the cut-out. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../_data/governor.json'));
  else root.GovernorOCR = factory(root.GovernorData);
})(typeof window === 'object' ? window : globalThis, function (data) {
  'use strict';
  // The in-game arrangement: left column top to bottom, then the right column.
  var LEFT = ['cav-1', 'inf-1', 'arc-1'], RIGHT = ['cav-2', 'inf-2', 'arc-2'];
  var GEMS = { inf: [70, 140], cav: [170, 225], arc: [35, 70] };
  var CELL = 24;

  function hsv(r, g, b) {
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h = 0;
    if (d) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, s: max ? d / max : 0, v: max / 255 };
  }
  // The profile's backdrop is a soft teal: a mid-saturated blue-green of middling brightness.
  function backdrop(r, g, b) { var c = hsv(r, g, b); return c.h >= 178 && c.h <= 218 && c.s >= 0.1 && c.s <= 0.64 && c.v >= 0.3 && c.v <= 0.97; }
  function px(image, x, y) { var i = (y * image.width + x) * 4; return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]]; }

  // Connected runs of `test` pixels inside a box, as bounding boxes with their pixel counts.
  function blobs(image, box, test, step) {
    step = step || 1;
    var w = Math.ceil((box.x1 - box.x0) / step), h = Math.ceil((box.y1 - box.y0) / step), seen = new Uint8Array(w * h), mask = new Uint8Array(w * h), out = [];
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) { var p = px(image, box.x0 + i * step, box.y0 + j * step); mask[j * w + i] = test(p[0], p[1], p[2]) ? 1 : 0; }
    for (var start = 0; start < w * h; start++) {
      if (!mask[start] || seen[start]) continue;
      var stack = [start], b = { x0: w, y0: h, x1: 0, y1: 0, n: 0 }; seen[start] = 1;
      while (stack.length) {
        var k = stack.pop(), x = k % w, y = (k - x) / w;
        b.n++; if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
        [k - 1, k + 1, k - w, k + w].forEach(function (n, at) {
          if (n < 0 || n >= w * h || at === 0 && x === 0 || at === 1 && x === w - 1) return;
          if (mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
        });
      }
      out.push({ x0: box.x0 + b.x0 * step, y0: box.y0 + b.y0 * step, x1: box.x0 + (b.x1 + 1) * step, y1: box.y0 + (b.y1 + 1) * step, n: b.n * step * step });
    }
    return out;
  }

  /* The six cards: near-square blocks that are not backdrop, in the outer thirds of the
     screen, three a side, above the player panel. A notification dot can sit on a card's
     upper right corner, so a card's side is measured across its lower part and the square
     is taken from its lower left. A card that touches the governor's cape merges with it and
     is missed; the profile is mirror symmetric, so it is placed opposite its partner. */
  function cards(image) {
    var W = image.width, H = image.height, step = Math.max(1, Math.round(W / 360)), rows = [[], []];
    [[0, Math.round(W * 0.34)], [Math.round(W * 0.66), W]].forEach(function (span, side) {
      rows[side] = blobs(image, { x0: span[0], y0: Math.round(H * 0.1), x1: span[1], y1: Math.round(H * 0.72) }, function (r, g, b) { return !backdrop(r, g, b); }, step)
        .filter(function (b) { var w = b.x1 - b.x0, h = b.y1 - b.y0; return w >= W * 0.1 && w <= W * 0.24 && h >= W * 0.1 && h <= W * 0.24 && b.n >= 0.6 * w * h; })
        .map(function (b) {
          var y = Math.round(b.y1 - (b.y1 - b.y0) * 0.2), x0 = b.x0, x1 = b.x1;
          while (x0 < x1 && backdrop.apply(null, px(image, x0, y))) x0++;
          while (x1 > x0 && backdrop.apply(null, px(image, x1 - 1, y))) x1--;
          var size = Math.min(x1 - x0, b.y1 - b.y0);
          return { x0: x0, y0: b.y1 - size, x1: x0 + size, y1: b.y1 };
        });
    });
    // Pair the two sides into rows by height; a card with no partner is mirrored across.
    var all = rows[0].map(function (c) { return { c: c, side: 0 }; }).concat(rows[1].map(function (c) { return { c: c, side: 1 }; })).sort(function (a, b) { return a.c.y0 - b.c.y0; });
    var grouped = [];
    all.forEach(function (entry) {
      var size = entry.c.x1 - entry.c.x0, row = grouped.find(function (g) { return Math.abs(g.y - entry.c.y0) < size * 0.4 && !g[entry.side]; });
      if (!row) { row = { y: entry.c.y0 }; grouped.push(row); }
      row[entry.side] = entry.c;
    });
    function mirror(c) { return { x0: W - c.x1, y0: c.y0, x1: W - c.x0, y1: c.y1 }; }
    var found = {};
    grouped.slice(0, 3).forEach(function (row, at) {
      var left = row[0] || mirror(row[1]), right = row[1] || mirror(row[0]);
      found[LEFT[at]] = Object.assign(left, { guessed: !row[0] });
      found[RIGHT[at]] = Object.assign(right, { guessed: !row[1] });
    });
    return found;
  }

  // A region scaled to n×n RGB, averaging the pixels that fall in each cell.
  function sample(image, box, n, alpha) {
    var out = new Float32Array(n * n * 4), w = (box.x1 - box.x0) / n, h = (box.y1 - box.y0) / n;
    for (var j = 0; j < n; j++) for (var i = 0; i < n; i++) {
      var sum = [0, 0, 0, 0], count = 0;
      for (var y = Math.floor(box.y0 + j * h); y < Math.max(Math.floor(box.y0 + j * h) + 1, Math.floor(box.y0 + (j + 1) * h)); y++)
        for (var x = Math.floor(box.x0 + i * w); x < Math.max(Math.floor(box.x0 + i * w) + 1, Math.floor(box.x0 + (i + 1) * w)); x++) {
          if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
          var p = px(image, x, y); sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; sum[3] += alpha ? p[3] : 255; count++;
        }
      for (var c = 0; c < 4; c++) out[(j * n + i) * 4 + c] = count ? sum[c] / count : 0;
    }
    return out;
  }
  /* How unlike a card is to a template: the mean colour distance over the template's opaque
     cells. The whole card leaves out the upper right (a notification dot) and the lower left
     (the stars); the badge is the upper left alone, where a grade shows as T1, T2…. */
  var WHOLE = function (i, j, n) { return !(i >= n * 0.72 && j <= n * 0.28 || i <= n * 0.3 && j >= n * 0.55); };
  var BADGE = function (i, j, n) { return i < n * 0.45 && j < n * 0.32; };
  function distance(a, b, n, region) {
    var sum = 0, count = 0;
    for (var j = 0; j < n; j++) for (var i = 0; i < n; i++) {
      if (!region(i, j, n)) continue;
      var k = (j * n + i) * 4; if (b[k + 3] < 230) continue;
      sum += Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]); count++;
    }
    return count ? sum / count / 765 : 1;
  }
  // Stars: bright gold marks stacked in the card's lower left corner.
  function stars(image, card) {
    var side = card.x1 - card.x0, box = { x0: card.x0, y0: Math.round(card.y0 + side * 0.4), x1: Math.round(card.x0 + side * 0.28), y1: card.y1 };
    var marks = blobs(image, box, function (r, g, b) { return r > 225 && g > 180 && b < 120 && g - b > 110; }, 1)
      .filter(function (b) { var w = b.x1 - b.x0, h = b.y1 - b.y0; return w >= side * 0.06 && h >= side * 0.06 && w <= side * 0.22 && h <= side * 0.22; });
    return Math.min(3, marks.length);
  }
  function gearLevel(tier, grade, starCount) {
    var levels = data.gear.levels;
    for (var i = 0; i < levels.length; i++) if (levels[i].tier === tier && levels[i].grade === grade && levels[i].stars === starCount) return i + 1;
    return null;
  }
  // A charm's outline, letterboxed into a CELL×CELL mask so a tall charm stays tall.
  function outline(mask, w, h) {
    var out = new Float32Array(CELL * CELL), scale = CELL / Math.max(w, h), ox = (CELL - w * scale) / 2, oy = (CELL - h * scale) / 2;
    for (var j = 0; j < CELL; j++) for (var i = 0; i < CELL; i++) {
      var x = Math.floor((i + 0.5 - ox) / scale), y = Math.floor((j + 0.5 - oy) / scale);
      out[j * CELL + i] = x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0;
    }
    return out;
  }
  /* A mark's silhouette: everything the outside cannot reach without crossing the mark, so
     the charm's inner detail and compression noise inside it do not change its shape. */
  function shapeOf(image, box, test) {
    var w = box.x1 - box.x0, h = box.y1 - box.y0, mask = new Float32Array(w * h), out = new Uint8Array(w * h), stack = [];
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) { var p = px(image, box.x0 + x, box.y0 + y); mask[y * w + x] = test(p) ? 1 : 0; }
    for (var e = 0; e < w * h; e++) { var ex = e % w, ey = (e - ex) / w; if ((ex === 0 || ey === 0 || ex === w - 1 || ey === h - 1) && !mask[e]) { out[e] = 1; stack.push(e); } }
    while (stack.length) {
      var k = stack.pop(), kx = k % w;
      [kx > 0 ? k - 1 : -1, kx < w - 1 ? k + 1 : -1, k - w, k + w].forEach(function (n) { if (n >= 0 && n < w * h && !out[n] && !mask[n]) { out[n] = 1; stack.push(n); } });
    }
    for (var i = 0; i < w * h; i++) mask[i] = out[i] ? 0 : 1;
    return outline(mask, w, h);
  }
  function overlap(a, b) { var both = 0, either = 0; for (var i = 0; i < a.length; i++) { both += Math.min(a[i], b[i]); either += Math.max(a[i], b[i]); } return either ? both / either : 0; }
  // A template's opaque extent.
  function extent(image) {
    var x0 = image.width, y0 = image.height, x1 = 0, y1 = 0;
    for (var y = 0; y < image.height; y++) for (var x = 0; x < image.width; x++) if (px(image, x, y)[3] > 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { x0: x0, y0: y0, x1: x1 + 1, y1: y1 + 1 };
  }
  /* How unlike a mark is to a charm: the template laid over the mark's own backdrop, both
     stretched to the same LOOK×LOOK grid. Charms that share an outline differ inside: a
     gold or stone base, a silver frame, a facet pattern. */
  var LOOK = 12;
  function look(seen, art, ground) {
    var sum = 0;
    for (var k = 0; k < LOOK * LOOK * 4; k += 4) {
      var a = art[k + 3] / 255;
      for (var c = 0; c < 3; c++) sum += Math.abs(seen[k + c] - (art[k + c] * a + ground[c] * (1 - a)));
    }
    return sum / (LOOK * LOOK * 765);
  }
  function troopOf(image, box) {
    var hues = [];
    for (var y = box.y0; y < box.y1; y++) for (var x = box.x0; x < box.x1; x++) { var p = px(image, x, y), c = hsv(p[0], p[1], p[2]); if (c.s > 0.5 && c.v > 0.5) hues.push(c.h); }
    if (!hues.length) return null;
    hues.sort(function (a, b) { return a - b; });
    var h = hues[Math.floor(hues.length / 2)];
    return Object.keys(GEMS).find(function (t) { return h >= GEMS[t][0] && h <= GEMS[t][1]; }) || null;
  }
  /* The three charms under a card: the three biggest marks that are not backdrop, left to
     right. Each carries the backdrop just around it, which a glow or the screen's darker
     edges shift, for laying the templates over. */
  function gems(image, card) {
    var side = card.x1 - card.x0, box = { x0: Math.max(0, Math.round(card.x0 - side * 0.05)), y0: Math.round(card.y1 + side * 0.02), x1: Math.min(image.width, Math.round(card.x1 + side * 0.05)), y1: Math.min(image.height, Math.round(card.y1 + side * 0.5)) };
    var test = function (r, g, b) { return !backdrop(r, g, b); };
    return blobs(image, box, test, 1)
      .filter(function (b) { var w = b.x1 - b.x0, h = b.y1 - b.y0; return w >= side * 0.12 && h >= side * 0.12 && w <= side * 0.45 && h <= side * 0.45; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 3).sort(function (a, b) { return a.x0 - b.x0; })
      .map(function (b) {
        var ring = [[], [], []];
        for (var y = b.y0 - 2; y < b.y1 + 2; y++) for (var x = b.x0 - 2; x < b.x1 + 2; x++) {
          if (x < 0 || y < 0 || x >= image.width || y >= image.height || x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1) continue;
          var p = px(image, x, y); if (!backdrop(p[0], p[1], p[2])) continue;
          for (var c = 0; c < 3; c++) ring[c].push(p[c]);
        }
        b.ground = ring.map(function (list) { list.sort(function (m, n) { return m - n; }); return list.length ? list[list.length >> 1] : 160; });
        b.test = test;
        return b;
      });
  }

  /* templates: { gear: { 'cav-1': { 'purple-0': image, … }, … }, charms: { inf: { 1: image, … }, … } },
     the page's own art. Samples and outlines are worked out once per template set. */
  function prepare(templates) {
    if (templates.prepared) return templates;
    var gear = {}, charms = {};
    Object.keys(templates.gear).forEach(function (id) {
      gear[id] = Object.keys(templates.gear[id]).map(function (key) { var t = templates.gear[id][key], parts = key.split('-'); return { tier: parts[0], grade: Number(parts[1]), sample: sample(t, { x0: 0, y0: 0, x1: t.width, y1: t.height }, 20, true) }; });
    });
    Object.keys(templates.charms).forEach(function (troop) {
      charms[troop] = Object.keys(templates.charms[troop]).map(function (level) { var t = templates.charms[troop][level], box = extent(t); return { level: Number(level), shape: shapeOf(t, box, function (p) { return p[3] > 128; }), art: sample(t, box, LOOK, true) }; });
    });
    return { prepared: true, gear: gear, charms: charms };
  }
  /* A reading is sure (near 1) when its match is close and clearly ahead of the runner-up,
     and doubtful near 0; a card placed opposite its partner counts for less. `found` is the
     cards seen: under six means this is likely not a Governor Profile. */
  function read(image, templates) {
    var prepared = prepare(templates), found = cards(image), result = { gear: {}, charms: {}, found: Object.keys(found).filter(function (id) { return !found[id].guessed; }).length };
    LEFT.concat(RIGHT).forEach(function (id) {
      var card = found[id], troop = id.split('-')[0];
      if (!card) { result.gear[id] = { level: null, confidence: 0, box: null }; [1, 2, 3].forEach(function (c) { result.charms[id + '-' + c] = { level: null, confidence: 0, box: null }; }); return; }
      /* The tier from the whole card (art and frame), then the grade from its badge among
         that tier's cards. Sure when each match is clearly ahead of its runner-up. */
      var seen = sample(image, card, 20, false), tiers = {};
      prepared.gear[id].forEach(function (t) { var d = distance(seen, t.sample, 20, WHOLE); if (!tiers[t.tier] || d < tiers[t.tier]) tiers[t.tier] = d; });
      var byTier = Object.keys(tiers).sort(function (a, b) { return tiers[a] - tiers[b]; }), tier = byTier[0];
      var grades = prepared.gear[id].filter(function (t) { return t.tier === tier; }).map(function (t) { return { grade: t.grade, d: distance(seen, t.sample, 20, BADGE) }; }).sort(function (a, b) { return a.d - b.d; });
      var starCount = stars(image, card), level = gearLevel(tier, grades[0].grade, starCount);
      var tierSure = Math.min(1, (1 - tiers[tier] / 0.25) * Math.min(1, ((byTier[1] ? tiers[byTier[1]] : 1) - tiers[tier]) / 0.05));
      var gradeSure = grades[1] ? Math.min(1, (grades[1].d - grades[0].d) / 0.04) : 1;
      var confidence = Math.max(0, Math.min(tierSure, gradeSure)) * (card.guessed ? 0.8 : 1);
      if (level === null) confidence = 0;
      result.gear[id] = { level: level, tier: tier, grade: grades[0].grade, stars: starCount, confidence: Math.round(confidence * 100) / 100, box: card };
      var marks = gems(image, card);
      [1, 2, 3].forEach(function (c) {
        var mark = marks[c - 1], key = id + '-' + c;
        if (!mark) { result.charms[key] = { level: null, confidence: 0, box: null }; return; }
        // Outline and look together: outlines alone repeat across levels, looks blur at this size.
        var shape = shapeOf(image, mark, function (p) { return mark.test(p[0], p[1], p[2]); }), colour = troopOf(image, mark);
        var seenLook = sample(image, mark, LOOK, false), scored = prepared.charms[troop].map(function (t) { var d = look(seenLook, t.art, mark.ground); return { level: t.level, d: d, score: overlap(shape, t.shape) - 2 * d }; }).sort(function (a, b) { return b.score - a.score; });
        var top = scored[0], second = scored[1], sure = Math.max(0, Math.min(1, (1 - top.d / 0.2) * Math.min(1, (top.score - second.score) / 0.08)));
        if (colour !== troop) sure = Math.min(sure, 0.3);
        result.charms[key] = { level: top.level, confidence: Math.round(sure * 100) / 100, troop: colour, box: mark };
      });
    });
    return result;
  }
  return { read: read, prepare: prepare, cards: cards, LEFT: LEFT, RIGHT: RIGHT };
});
