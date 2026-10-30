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
  var GEMS = { inf: [70, 150], cav: [176, 208], arc: [38, 66] };
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

  /* The profile is laid out in proportion to the screen's width: at 720px wide each card is
     103px square, the top and bottom cards sit 68px in, the middle ones 20px, the right
     column mirrors the left, and the rows start 175 and 345px below the first. Only how far
     down the first row sits changes from phone to phone. */
  var WIDTH = 720, SIDE = 103, OUTER = 68, INNER = 20, ROWS = [0, 175, 345];
  function layout(y) {
    var out = {};
    LEFT.forEach(function (id, r) {
      var x = r === 1 ? INNER : OUTER, top = y + ROWS[r];
      out[id] = { x0: x, y0: top, x1: x + SIDE, y1: top + SIDE };
      out[RIGHT[r]] = { x0: WIDTH - x - SIDE, y0: top, x1: WIDTH - x, y1: top + SIDE };
    });
    return out;
  }
  /* The game's own part of a screenshot: emulator frames, black bars and a dark status bar
     come off, then it is scaled to WIDTH so every distance below holds. */
  function dark(p) { return Math.max(p[0], p[1], p[2]) < 78; }
  function content(image) {
    var W = image.width, H = image.height, run = null, start = null, y0 = 0, y1 = H;
    // Columns of the game show its pale blue backdrop somewhere; frames and bars never do.
    function backed(x) { var n = 0, all = 0; for (var y = 0; y < H; y += 4) { all++; var p = px(image, x, y); if (backdrop(p[0], p[1], p[2])) n++; } return n / all > 0.12; }
    for (var x = 0; x <= W; x++) {
      if (x < W && backed(x)) { if (start === null) start = x; }
      else if (start !== null) { if (!run || x - start > run[1] - run[0]) run = [start, x]; start = null; }
    }
    if (!run || run[1] - run[0] < W * 0.25) run = [0, W];
    function row(y) { var n = 0, all = 0; for (var x = run[0]; x < run[1]; x += 4) { all++; if (dark(px(image, x, y))) n++; } return n / all; }
    while (y0 < y1 - 1 && row(y0) > 0.9) y0++;
    while (y1 - 1 > y0 && row(y1 - 1) > 0.9) y1--;
    return { x0: run[0], y0: y0, x1: run[1], y1: y1 };
  }
  // A box of an image resampled to `width` wide: averaged when shrinking, blended when growing.
  function resize(image, box, width) {
    var scale = width / (box.x1 - box.x0), height = Math.max(1, Math.round((box.y1 - box.y0) * scale)), data = new Uint8ClampedArray(width * height * 4), step = 1 / scale;
    for (var j = 0; j < height; j++) for (var i = 0; i < width; i++) {
      var sx = box.x0 + i * step, sy = box.y0 + j * step, o = (j * width + i) * 4, c;
      if (step > 1) {
        var sum = [0, 0, 0, 0], n = 0;
        for (var y = Math.floor(sy); y < Math.min(box.y1, Math.floor(sy + step)); y++) for (var x = Math.floor(sx); x < Math.min(box.x1, Math.floor(sx + step)); x++) { var p = px(image, x, y); sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; sum[3] += p[3]; n++; }
        for (c = 0; c < 4; c++) data[o + c] = n ? sum[c] / n : 0;
      } else {
        var fx = Math.max(box.x0, Math.min(box.x1 - 1.001, sx + step / 2 - 0.5)), fy = Math.max(box.y0, Math.min(box.y1 - 1.001, sy + step / 2 - 0.5)), ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
        var p00 = px(image, ix, iy), p10 = px(image, Math.min(box.x1 - 1, ix + 1), iy), p01 = px(image, ix, Math.min(box.y1 - 1, iy + 1)), p11 = px(image, Math.min(box.x1 - 1, ix + 1), Math.min(box.y1 - 1, iy + 1));
        for (c = 0; c < 4; c++) data[o + c] = (p00[c] * (1 - ax) + p10[c] * ax) * (1 - ay) + (p01[c] * (1 - ax) + p11[c] * ax) * ay;
      }
    }
    return { width: width, height: height, data: data };
  }
  // How unlike a box is to the nearest of a piece's cards, sampled n×n.
  function nearest(image, box, cardsOf, n) {
    var seen = sample(image, box, n, false), best = 1;
    cardsOf.forEach(function (t) { var d = distance(seen, t['sample' + n], n, WHOLE); if (d < best) best = d; });
    return best;
  }
  /* Where the cards are: the first row's height that makes all six look most like cards,
     coarse then fine, then each card nudged a few pixels to sit square on its art. */
  function locate(image, prepared) {
    var best = null, ids = LEFT.concat(RIGHT);
    function fit(y, n) { var boxes = layout(y), sum = 0; ids.forEach(function (id) { sum += nearest(image, boxes[id], prepared.gear[id], n); }); return sum / ids.length; }
    var sum = 0, count = 0;
    for (var y = 0; y + ROWS[2] + SIDE <= image.height; y += 4) { var f = fit(y, 10); sum += f; count++; if (!best || f < best.fit) best = { y: y, fit: f }; }
    if (!best) return null;
    for (var dy = -4; dy <= 4; dy++) { var g = fit(best.y + dy, 20); if (dy === -4 || g < best.fine) { best.fine = g; best.at = best.y + dy; } }
    var boxes = layout(best.at), out = { fit: best.fine, depth: best.fit / (sum / count), cards: {} };
    ids.forEach(function (id) {
      var home = boxes[id], pick = { box: home, d: nearest(image, home, prepared.gear[id], 20) };
      for (var oy = -6; oy <= 6; oy += 2) for (var ox = -6; ox <= 6; ox += 2) {
        var box = { x0: home.x0 + ox, y0: home.y0 + oy, x1: home.x1 + ox, y1: home.y1 + oy };
        if (box.x0 < 0 || box.y0 < 0 || box.x1 > image.width || box.y1 > image.height) continue;
        var d = nearest(image, box, prepared.gear[id], 20); if (d < pick.d) pick = { box: box, d: d };
      }
      out.cards[id] = pick.box;
    });
    return out;
  }
  /* The six boxes are cards when they look like cards (FIT) and much more so than the rest
     of the screen does (DEPTH: the best fit over the average fit). The Governor Gear screen
     and other screens fail one or the other. */
  var FIT = 0.17, DEPTH = 0.62;

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
  // The yellow of stars and grade badges, which no card art or frame uses near them.
  function gold(p) { var c = hsv(p[0], p[1], p[2]); return c.h >= 40 && c.h <= 65 && c.s > 0.55 && c.v > 0.78; }
  function golden(image, card, x0, y0, x1, y1) {
    var side = card.x1 - card.x0, n = 0;
    for (var y = Math.round(card.y0 + side * y0); y < Math.round(card.y0 + side * y1); y++) for (var x = Math.round(card.x0 + side * x0); x < Math.round(card.x0 + side * x1); x++) if (gold(px(image, x, y))) n++;
    return n * (SIDE * SIDE) / (side * side);
  }
  /* Stars: gold marks stacked up from the card's lower left corner, each a star apart, about
     a sixth of the card across. Each mark of star size counts once. */
  function stars(image, card) {
    var side = card.x1 - card.x0, box = { x0: card.x0, y0: Math.round(card.y0 + side * 0.3), x1: Math.round(card.x0 + side * 0.26), y1: card.y1 };
    // Stacked stars can touch and read as one tall blob: it counts once per star-height.
    var count = 0;
    blobs(image, box, function (r, g, b) { return gold([r, g, b]); }, 1).forEach(function (m) {
      var w = (m.x1 - m.x0) / side, h = (m.y1 - m.y0) / side;
      if (w >= 0.06 && h >= 0.06 && w <= 0.26 && h <= 0.8 && m.n * SIDE * SIDE / (side * side) >= 40) count += Math.max(1, Math.round(h / Math.max(w, 0.14)));
    });
    return Math.min(3, count);
  }
  // The grade badge: gold "T1", "T2"… in the card's upper left; no badge is grade 0.
  function badged(image, card) { return golden(image, card, 0, 0, 0.36, 0.24) >= 40; }
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
  /* A charm's size on screen, as a share of its card's side (box with its rim), for the
     levels seen in players' screenshots. The site's charm art is not drawn to one scale, so
     size can only come from the game; a level not measured yet pays a flat toll instead. */
  /* Charm outlines as the game draws them, CELL×CELL, one bit per cell in hex, averaged from
     players' original screenshots. `node .dsh/governor-ocr-check.cjs --signatures` derives
     them again from .dsh/governor-fixtures, re-saved copies, within a few cells.
     The site's charm art differs from the game's at this size, so a level seen in a
     screenshot is matched against these; the rest against the art. */
  var SEEN = {
    1: '000000000000000800000c00000e00000f00001f80003f80023fc0077fc00ffff00ffff01ffff81ffff83ffffc3ffffc3ffffc7ffffe7ffffe7ffffe3ffff803ff80000000000000',
    2: '00000001ffc003fff001fff001fff819fff81ffff81ffff81ffff81ffff81ffff81ffff81ffff81ffff81ffff81ffff81ffff81ffff81ffff81ffff80ffff00ffff007ff80000000',
    3: '000000003c0000ff0001ff8003ffc007ffc00ffff01ffff83ffffc3ffffc7ffffe7ffffe7ffffe7ffffe3ffffc3ffffc1ffff80ffff003ffc003ffc001ff8000ff00003c00000000',
    4: '00000007ff000ffff01ffff87ffffe7ffffe7ffffe7ffffe7ffffe7ffffe7ffffe7ffffe7ffffe7ffffe7ffffe7ffffe7ffffe7ffffe7ffffe7ffffc3ffff81ffff00fffe0000000',
    5: '000000000000000400000e00000f00018f80031fc0003fe00c7ff80ffff81ffffc1ffffc1ffffc1ffffc3ffffc3ffffc3ffffe3ffffe7ffffe3ffffc1fffe000fe00000000000000',
    6: '000000000000003c0000ef0001cf80038fe00f0ff01e3ff8187ffc01fffe73fffe7ffffc3ffffc3ffffc3ffffc3ffff81ffff81ffff81ffff80ffff00ffff00fffe007ffe0000000'
  };
  function unpack(hex) { var out = new Float32Array(CELL * CELL); for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.charAt(i >> 2), 16) >> (3 - (i & 3)) & 1; return out; }
  var OUTLINES = {};
  Object.keys(SEEN).forEach(function (level) { OUTLINES[level] = unpack(SEEN[level]); });
  var SIZES = { 1: [0.286, 0.252], 2: [0.226, 0.267], 3: [0.291, 0.291], 4: [0.262, 0.262], 5: [0.29, 0.27], 6: [0.28, 0.265] };
  function sizeOff(level, mark, card) {
    var size = SIZES[level], side = card.x1 - card.x0;
    if (!size) return 0.12;
    return 3 * (Math.abs((mark.x1 - mark.x0) / side - size[0]) + Math.abs((mark.y1 - mark.y0) / side - size[1]));
  }
  function grey(image, box) {
    var sum = 0, n = 0;
    for (var y = box.y0; y < box.y1; y++) for (var x = box.x0; x < box.x1; x++) { var p = px(image, x, y); sum += hsv(p[0], p[1], p[2]).s; n++; }
    return n > 0 && sum / n < 0.15;
  }
  /* The three charms under a card sit in fixed slots: centred at 18%, 50% and 82% across it,
     just below it, each about a third of its width. Whatever is behind them (the backdrop, a
     glow, the governor's cape or beard) varies, so a charm is found by its own colour: the
     piece's troop colour, saturated, joined into one region nearest the slot's middle. Its
     box grows a pixel for the dark rim. It carries the slot's edge colour for laying the
     templates over, and its own test for its outline. */
  var SLOTS = [0.175, 0.495, 0.825], SLOT = 0.36;
  function hueTest(troop) {
    var range = GEMS[troop];
    return function (r, g, b) { var c = hsv(r, g, b); return c.s > 0.42 && c.v > 0.35 && c.h >= range[0] && c.h <= range[1]; };
  }
  function gems(image, card, troop) {
    var side = card.x1 - card.x0, test = hueTest(troop);
    return SLOTS.map(function (at) {
      var cx = card.x0 + side * at, box = { x0: Math.max(0, Math.round(cx - side * SLOT / 2)), y0: Math.round(card.y1), x1: Math.min(image.width, Math.round(cx + side * SLOT / 2)), y1: Math.min(image.height, Math.round(card.y1 + side * SLOT)) };
      if (box.y1 - box.y0 < 4) return null;
      var edge = [[], [], []];
      for (var x = box.x0; x < box.x1; x++) [box.y0, box.y1 - 1].forEach(function (y) { var p = px(image, x, y); for (var c = 0; c < 3; c++) edge[c].push(p[c]); });
      var ground = edge.map(function (list) { list.sort(function (m, n) { return m - n; }); return list[list.length >> 1]; });
      var mid = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
      var marks = blobs(image, box, test, 1).filter(function (m) { return m.n >= side * side * 0.006; }).sort(function (m, n) {
        var dm = Math.hypot((m.x0 + m.x1) / 2 - mid.x, (m.y0 + m.y1) / 2 - mid.y), dn = Math.hypot((n.x0 + n.x1) / 2 - mid.x, (n.y0 + n.y1) / 2 - mid.y);
        return (dm - Math.sqrt(m.n)) - (dn - Math.sqrt(n.n));
      });
      if (!marks.length) return { empty: true, slot: box, ground: ground };
      var mark = marks[0];
      marks.slice(1).forEach(function (m) {
        var near = m.x0 >= mark.x0 - 3 && m.x1 <= mark.x1 + 3 && m.y0 >= mark.y0 - 3 && m.y1 <= mark.y1 + 3;
        if (near) { mark.x0 = Math.min(mark.x0, m.x0); mark.y0 = Math.min(mark.y0, m.y0); mark.x1 = Math.max(mark.x1, m.x1); mark.y1 = Math.max(mark.y1, m.y1); mark.n += m.n; }
      });
      mark.x0 = Math.max(0, mark.x0 - 1); mark.y0 = Math.max(0, mark.y0 - 1); mark.x1 = Math.min(image.width, mark.x1 + 1); mark.y1 = Math.min(image.height, mark.y1 + 1);
      mark.ground = ground; mark.test = test;
      return mark;
    });
  }

  /* templates: { gear: { 'cav-1': { 'purple-0': image, … }, … }, charms: { inf: { 1: image, … }, … } },
     the page's own art. Samples and outlines are worked out once per template set. */
  function prepare(templates) {
    if (templates.prepared) return templates;
    var gear = {}, charms = {};
    Object.keys(templates.gear).forEach(function (id) {
      gear[id] = Object.keys(templates.gear[id]).map(function (key) { var t = templates.gear[id][key], parts = key.split('-'); var all = { x0: 0, y0: 0, x1: t.width, y1: t.height }; return { tier: parts[0], grade: Number(parts[1]), sample10: sample(t, all, 10, true), sample20: sample(t, all, 20, true) }; });
    });
    Object.keys(templates.charms || {}).forEach(function (troop) {
      charms[troop] = Object.keys(templates.charms[troop]).map(function (level) { var t = templates.charms[troop][level], box = extent(t); return { level: Number(level), shape: shapeOf(t, box, function (p) { return p[3] > 128; }), art: sample(t, box, LOOK, true) }; });
    });
    return { prepared: true, gear: gear, charms: charms };
  }
  /* A reading is sure when its match is close and clearly ahead of the runner-up. Raw margins
     run 0–1 with right readings from about 0.45; they are scaled so that point lands on the
     import dock's doubt line (0.75), and a card placed opposite its partner counts for less.
     `found` is the cards seen rather than placed. */
  var SURE = 0.45, DOUBT = 0.75, TWINS = { 1: 5, 5: 1 };
  function calibrate(raw) { return Math.round(Math.min(1, Math.max(0, raw) * DOUBT / SURE) * 100) / 100; }
  /* Is this a Governor Profile at all? The card search alone, which needs only the gear
     templates: 0..1, for the import dock's probe. */
  function find(image, templates) {
    var prepared = prepare(templates), place = locate(resize(image, content(image), WIDTH), prepared);
    return place && place.fit <= FIT && place.depth <= DEPTH ? 0.9 : 0;
  }
  function read(image, templates) {
    var prepared = prepare(templates), frame = content(image), shot = resize(image, frame, WIDTH), place = locate(shot, prepared);
    var result = { gear: {}, charms: {}, image: shot, frame: frame, fit: place ? Math.round(place.fit * 1000) / 1000 : 1, depth: place ? Math.round(place.depth * 1000) / 1000 : 1, found: place && place.fit <= FIT && place.depth <= DEPTH ? 6 : 0 };
    LEFT.concat(RIGHT).forEach(function (id) {
      var card = result.found ? place.cards[id] : null, troop = id.split('-')[0];
      if (!card) { result.gear[id] = { level: null, confidence: 0, box: null }; [1, 2, 3].forEach(function (c) { result.charms[id + '-' + c] = { level: null, confidence: 0, box: null }; }); return; }
      image = shot;
      /* The tier from the whole card (art and frame), then the grade from its badge among
         that tier's cards. Sure when each match is clearly ahead of its runner-up. */
      var seen = sample(image, card, 20, false), tiers = {};
      prepared.gear[id].forEach(function (t) { var d = distance(seen, t.sample20, 20, WHOLE); if (!tiers[t.tier] || d < tiers[t.tier]) tiers[t.tier] = d; });
      var byTier = Object.keys(tiers).sort(function (a, b) { return tiers[a] - tiers[b]; }), tier = byTier[0];
      var badge = badged(image, card), grades = prepared.gear[id].filter(function (t) { return t.tier === tier && (badge ? t.grade > 0 : t.grade === 0); }).map(function (t) { return { grade: t.grade, d: distance(seen, t.sample20, 20, BADGE) + distance(seen, t.sample20, 20, WHOLE) }; }).sort(function (a, b) { return a.d - b.d; });
      var starCount = stars(image, card), level = gearLevel(tier, grades[0].grade, starCount);
      var tierSure = Math.min(1, (1 - tiers[tier] / 0.25) * Math.min(1, ((byTier[1] ? tiers[byTier[1]] : 1) - tiers[tier]) / 0.05));
      var gradeSure = grades[1] ? Math.min(1, (grades[1].d - grades[0].d) / 0.04) : 1;
      var confidence = Math.max(0, Math.min(tierSure, gradeSure));
      if (level === null) confidence = 0;
      result.gear[id] = { level: level, tier: tier, grade: grades[0].grade, stars: starCount, confidence: calibrate(confidence), box: card };
      var marks = gems(image, card, troop);
      [1, 2, 3].forEach(function (c) {
        var mark = marks[c - 1], key = id + '-' + c;
        if (!mark) { result.charms[key] = { level: null, confidence: 0, box: null }; return; }
        // No troop colour in the slot: an empty socket is a grey triangle; anything else is unread.
        if (mark.empty) { var socket = grey(image, mark.slot); result.charms[key] = { level: socket ? 0 : null, confidence: socket ? 0.8 : 0, troop: null, box: mark.slot }; return; }
        var colour = troop;
        // Outline and look together: outlines alone repeat across levels, looks blur at this size.
        var shape = shapeOf(image, mark, function (p) { return mark.test(p[0], p[1], p[2]); }), seenLook = sample(image, mark, LOOK, false), scored = prepared.charms[troop].map(function (t) { var d = look(seenLook, t.art, mark.ground); return { level: t.level, d: d, score: overlap(shape, OUTLINES[t.level] || t.shape) - 2 * d - sizeOff(t.level, mark, card) }; }).sort(function (a, b) { return b.score - a.score; });
        var top = scored[0], second = scored[1], sure = Math.max(0, Math.min(1, (1 - top.d / 0.2) * Math.min(1, (top.score - second.score) / 0.08)));
        if (colour !== troop) sure = Math.min(sure, 0.3);
        // Levels 1 and 5 share an outline at this size and a re-saved JPEG can swap them: a close call between them is always checked.
        if (TWINS[top.level] === second.level && top.score - second.score < 0.15) sure = Math.min(sure, 0.4);
        result.charms[key] = { level: top.level, confidence: calibrate(sure), troop: colour, box: mark, outline: shape };
      });
    });
    return result;
  }
  return { read: read, find: find, prepare: prepare, content: content, outlines: function (o) { OUTLINES = o; }, LEFT: LEFT, RIGHT: RIGHT, WIDTH: WIDTH };
});
