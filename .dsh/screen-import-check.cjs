// Screen adapters against words the production OCR worker read from the
// owner's screenshots (.dsh/import-fixtures/*.items.json, recorded through
// js/ocr-client.js on wasm). Node only; the browser dock has its own check.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const S = require('../js/screen-import-core.js');
require('../js/import-adapters/overview.js');
const load = name => S.page(JSON.parse(fs.readFileSync('.dsh/import-fixtures/' + name + '.items.json', 'utf8')));
const values = proposals => Object.fromEntries(proposals.map(p => [p.id, p.value]));

const res = load('overview-resources');
assert.equal(S.route(res).adapter.id, 'overview-resources');
const resRead = S.route(res).adapter.read(res);
assert.deepEqual(values(resRead), { bread: 805510000, wood: 766260000, stone: 112750000, iron: 126170000 });
assert.ok(resRead.every(p => p.confidence >= S.DOUBT && p.crop && p.crop.h > 0 && p.crop.y < res.height));
assert.equal(resRead[0].note, '207.60M + 597.91M');

const spd = load('overview-speedups');
assert.equal(S.route(spd).adapter.id, 'overview-speedups');
assert.deepEqual(values(S.route(spd).adapter.read(spd)), {
  'speedup-training': 8 * 1440 + 10,
  'speedup-healing': 8 * 1440 + 10 * 60 + 45,
  'speedup-construction': 8 * 1440 + 22 * 60 + 25,
  'speedup-research': 7 * 1440 + 6 * 60 + 52,
  'speedup-learning': 12 * 60,
  'speedup-general': 17 * 1440 + 20 * 60 + 1
});

assert.equal(S.route(S.page({ items: [{ text: 'Infantry Attack +12%', poly: [[0, 0], [99, 0], [99, 20], [0, 20]] }] })), null, 'an unknown screen is not claimed');
console.log('Screen import: routing, Overview resource totals and speedup minutes from recorded production reads passed.');
