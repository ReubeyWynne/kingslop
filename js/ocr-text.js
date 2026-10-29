/* ocr-text.js — pure helpers for turning recognised words into values.
   Every screenshot reader shares these: word boxes from the engine's polygons,
   visual rows, digit and lookalike folding, and the game's number formats.
   No DOM; loaded as a page script (window.OcrText) or required by checks. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OcrText = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // One box per recognised word: its bounds, centre and trimmed text. Words
  // without text or a polygon are dropped.
  function boxes(items) {
    var out = [];
    (items || []).forEach(function (it) {
      if (!it) return;
      var text = String(it.text || '').trim();
      var points = it.poly || it.box || it.points || [];
      if (!text || !points.length) return;
      var xs = points.map(function (p) { return p[0]; });
      var ys = points.map(function (p) { return p[1]; });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
      var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, text: text });
    });
    return out;
  }

  // The median word height sets the row tolerance: a fixed pixel figure is
  // wrong the moment the screenshot isn't the size it was tuned on.
  function rowTolerance(list) {
    if (!list.length) return 8;
    var hs = list.map(function (b) { return b.h; }).sort(function (a, b) { return a - b; });
    return Math.max(8, hs[Math.floor(hs.length / 2)] * 0.55);
  }

  // Group boxes into visual rows, top to bottom, each row's words left to right.
  // `near(row, box)` decides membership; the default compares the box centre to
  // the row's running mean centre within the median-height tolerance.
  function rows(list, near) {
    var sorted = list.slice().sort(function (a, b) { return a.cy - b.cy || a.x - b.x; });
    var tol = rowTolerance(sorted);
    near = near || function (row, b) { return Math.abs(b.cy - row.cy) <= tol; };
    var out = [];
    sorted.forEach(function (b) {
      var row = out.length ? out[out.length - 1] : null;
      if (row && near(row, b)) {
        row.items.push(b);
        row.cy = (row.cy * (row.items.length - 1) + b.cy) / row.items.length;
      } else {
        out.push({ cy: b.cy, y: b.y, h: b.h, items: [b] });
      }
    });
    out.forEach(function (row) {
      row.items.sort(function (a, b) { return a.cx - b.cx; });
      row.text = row.items.map(function (b) { return b.text; }).join(' ');
    });
    return out;
  }

  // Bidi marks out, Arabic-Indic / Persian / full-width digits to Latin ones,
  // accents stripped, non-breaking spaces to spaces.
  function normalise(value) {
    return String(value || '').replace(/[‎‏‪-‮⁦-⁩؜]/g, '')
      .replace(/[٠-٩۰-۹０-９]/g, function (digit) {
        var code = digit.charCodeAt(0);
        return String(code >= 0x06f0 && code <= 0x06f9 ? code - 0x06f0 : code >= 0xff10 && code <= 0xff19 ? code - 0xff10 : code - 0x0660);
      }).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[  ]/g, ' ');
  }

  // OCR misreads a letter here and there ("lnfantry", "Letha1ity"). Fold the
  // usual digit/letter lookalikes and keep the spaces: both the row and the
  // wanted words go through the same fold, so exact matches stay exact.
  function fold(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
      .replace(/[1li]/g, 'i').replace(/0/g, 'o').replace(/5/g, 's')
      .replace(/\s+/g, ' ').trim();
  }

  function withinOneEdit(a, b) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    var i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length > b.length) i++;
      else if (a.length < b.length) j++;
      else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  }

  // Which of `list`'s words this (already folded) text carries: as a run of
  // text anywhere, or as a single misspelt token of five letters or more.
  function wordIn(folded, list) {
    var i, j;
    for (i = 0; i < list.length; i++) if (folded.indexOf(fold(list[i])) !== -1) return list[i];
    var tokens = folded.split(' ');
    for (i = 0; i < tokens.length; i++) {
      if (tokens[i].length < 5) continue;
      for (j = 0; j < list.length; j++) {
        if (withinOneEdit(tokens[i], fold(list[j]))) return list[j];
      }
    }
    return null;
  }

  // A whole count as the game prints it: "8,830", "87.542", "1 100", "35".
  // OCR sometimes reads the thousands comma as ";", ":" or "'". Returns null
  // for anything that isn't a count.
  function parseCount(text) {
    var t = normalise(text).replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').trim();
    if (!/^\d{1,3}(?:[,.;:' ]\d{3})*$|^\d+$/.test(t)) return null;
    return parseInt(t.replace(/\D/g, ''), 10);
  }

  // A rounded amount: "207.60M", "6.47K", "3.85M", "1,084", "1.2B", "1.05T".
  var SCALE = { k: 1e3, m: 1e6, b: 1e9, g: 1e9, t: 1e12 };
  function parseShort(text) {
    var t = normalise(text).replace(/\s+/g, '');
    var m = t.match(/^(\d+(?:[.,]\d+)*)([KkMmBbGgTt]?)$/);
    if (!m) return null;
    var digits = m[1], scale = m[2] ? SCALE[m[2].toLowerCase()] : 1;
    if (scale === 1) return parseCount(digits);
    var n = parseFloat(digits.replace(/,(?=\d{1,2}$)/, '.').replace(/,/g, ''));
    return isFinite(n) ? Math.round(n * scale) : null;
  }

  // A duration in the game's words: "17 day(s)20 hr(s)1 min(s)", "12 hr(s)",
  // "8d 10h 45m". Returns whole minutes, or null when nothing parses.
  function parseDuration(text) {
    var t = normalise(text).toLowerCase().replace(/[()]/g, '');
    var re = /(\d+(?:[.,]\d+)?)\s*(days?|d|hrs?|hours?|h|mins?|minutes?|m|secs?|s)(?![a-z])/g;
    var total = 0, found = false, hit;
    while ((hit = re.exec(t)) !== null) {
      var n = parseFloat(hit[1].replace(',', '.')), unit = hit[2][0];
      found = true;
      total += unit === 'd' ? n * 1440 : unit === 'h' ? n * 60 : unit === 'm' ? n : n / 60;
    }
    return found ? Math.round(total) : null;
  }

  return {
    boxes: boxes, rows: rows, rowTolerance: rowTolerance, normalise: normalise, fold: fold,
    withinOneEdit: withinOneEdit, wordIn: wordIn,
    parseCount: parseCount, parseShort: parseShort, parseDuration: parseDuration
  };
});
