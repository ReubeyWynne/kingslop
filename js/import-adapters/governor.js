/* Governor Profile — the governor in the middle, three gear cards a side with three charms
   under each. Levels are pictures there, not text, so the screen is known by its cards
   (GovernorOCR.find, against the site's gear art) and read by matching that art and the
   charms' (GovernorOCR.read); no words are read at all.

   Each piece gives four proposals, its gear and its three charms, with the card or the charm
   as the cut-out. They target the governor page's sheet (`sheet: 'governor'`), never the
   save: the page answers 'screen-import:sheet' the way the battle simulator does.

   Needs the dock's tools: tools.pixels (the shot at 360px wide) and tools.blob. */
(function (root, factory) {
  var deps = typeof module === 'object' && module.exports
    ? [require('../governor-ocr.js'), require('../screen-import-core.js'), require('../../_data/governor.json')]
    : [root.GovernorOCR, root.ScreenImport, root.GovernorData];
  var here = typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : null;
  var api = factory(deps[0], deps[1], deps[2], here ? new URL('../../img/governor/', here).href : '../img/governor/');
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (O, S, data, art) {
  'use strict';

  var SLOTS = { hat: 'Hat', amulet: 'Amulet', armour: 'Armour', trousers: 'Trousers', ring: 'Ring', staff: 'Staff' };
  var TIERS = { green: 'Green', blue: 'Blue', purple: 'Purple', gold: 'Gold', red: 'Red' };
  // Read at up to this width; the reader trims the frame and works at GovernorOCR.WIDTH.
  var LARGEST = 2400;
  var gearArt = null, charmArt = null;

  function picture(src) {
    return new Promise(function (resolve, reject) { var img = new Image(); img.onload = function () { resolve(img); }; img.onerror = reject; img.src = src; });
  }
  function canvasOf(source, width, height) {
    var c = document.createElement('canvas'); c.width = width; c.height = height;
    c.getContext('2d', { willReadFrequently: true }).drawImage(source, 0, 0, width, height);
    return c;
  }
  function pixelsOf(canvas) { return canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height); }
  function load(src) { return picture(src).then(function (img) { return pixelsOf(canvasOf(img, img.naturalWidth, img.naturalHeight)); }); }
  // Every card each piece can show, once per visit: enough to know the screen.
  function loadGear() {
    if (gearArt) return gearArt;
    var jobs = [], out = {}, looks = {};
    data.gear.levels.forEach(function (row) { looks[row.tier + '-' + row.grade] = true; });
    data.gear.pieces.forEach(function (piece) {
      out[piece.id] = {};
      Object.keys(looks).forEach(function (look) {
        jobs.push(load(art + 'gear/' + piece.id + '-' + look + '.webp').then(function (px) { out[piece.id][look] = px; }));
      });
    });
    gearArt = Promise.all(jobs).then(function () { return O.prepare({ gear: out }); }, function (err) { gearArt = null; throw err; });
    return gearArt;
  }
  // Then every charm, only once a shot is known to be a profile.
  function loadAll() {
    if (charmArt) return charmArt;
    var jobs = [], out = {};
    data.troops.forEach(function (troop) {
      out[troop] = {};
      data.charms.levels.forEach(function (row, i) {
        jobs.push(load(art + 'charms/' + troop + '-' + (i + 1) + '.webp').then(function (px) { out[troop][i + 1] = px; }));
      });
    });
    charmArt = Promise.all([loadGear(), Promise.all(jobs)]).then(function (both) {
      var charms = O.prepare({ gear: {}, charms: out }).charms;
      return { prepared: true, gear: both[0].gear, charms: charms };
    }, function (err) { charmArt = null; throw err; });
    return charmArt;
  }
  function crop(image, box, pad) {
    var x = Math.max(0, box.x0 - pad), y = Math.max(0, box.y0 - pad), w = Math.min(image.width, box.x1 + pad) - x, h = Math.min(image.height, box.y1 + pad) - y;
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').putImageData(new ImageData(image.data, image.width, image.height), -x, -y, x, y, w, h);
    return new Promise(function (resolve) { c.toBlob(resolve, 'image/png'); });
  }

  // A gear level as the game names it: Purple T1 2★.
  function gearName(value, tr) {
    if (value === 0) return tr('gov.notCrafted', 'not crafted');
    var row = data.gear.levels[value - 1];
    if (!row) return '';
    return tr('gov.tier.' + row.tier, TIERS[row.tier]) + (row.grade ? ' T' + row.grade : '') + ' ' + row.stars + '★';
  }

  // The order the profile is laid out in: row by row, left card then right.
  var ORDER = [];
  O.LEFT.forEach(function (left, row) { ORDER.push(left, O.RIGHT[row]); });

  var adapter = {
    id: 'governor-profile',
    sourceType: 'governor',
    sheet: 'governor',
    layout: 'pieces',
    // A profile shot is portrait from a phone or landscape from an emulator, so the shape
    // says nothing; the art loads before the first probe.
    probe: function (px) { return px ? loadGear().then(function (gear) { return O.find(px, gear); }) : 0; },
    detect: function () { return 0; },
    note: function (p, value, tr) {
      if (p.unit !== 'governor-gear' || value === null || value === undefined) return null;
      return gearName(value, tr);
    },
    read: function (p, tools) {
      if (!tools || !tools.blob) return [];
      return Promise.all([createImageBitmap(tools.blob), loadAll()]).then(function (both) {
        var bitmap = both[0], scale = Math.min(1, LARGEST / bitmap.width);
        var canvas = canvasOf(bitmap, Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
        bitmap.close();
        var result = O.read(pixelsOf(canvas), both[1]), out = [], jobs = [];
        ORDER.forEach(function (id, n) {
          var piece = data.gear.pieces.filter(function (x) { return x.id === id; })[0], name = SLOTS[piece.slot], gear = result.gear[id];
          var common = { target: 'sheet', sheet: 'governor', min: 0 };
          out.push(Object.assign({ id: 'gov-' + id, label: name, value: gear.level, confidence: gear.level === null ? 0 : gear.confidence, unit: 'governor-gear', max: data.gear.levels.length, y: n * 4, box: gear.box, pad: 0 }, common));
          [1, 2, 3].forEach(function (c) {
            var charm = result.charms[id + '-' + c];
            out.push(Object.assign({ id: 'gov-' + id + '-' + c, label: name + ' · ' + c, named: true, value: charm.level, confidence: charm.level === null ? 0 : charm.confidence, unit: 'level', max: data.charms.levels.length, y: n * 4 + c, box: charm.box, pad: 3 }, common));
          });
        });
        out.forEach(function (q) { jobs.push(q.box ? crop(result.image, q.box, q.pad).then(function (blob) { q.crop = blob; }) : null); });
        return Promise.all(jobs).then(function () { out.forEach(function (q) { delete q.box; delete q.pad; }); return out; });
      });
    }
  };

  if (S) S.register(adapter);
  return adapter;
});
