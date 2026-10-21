// Screen adapters against words the production OCR worker read from the
// owner's screenshots (.dsh/import-fixtures/*.items.json, recorded through
// js/ocr-client.js on wasm). Node only; the browser dock has its own check.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const S = require('../js/screen-import-core.js');
require('../js/import-adapters/overview.js');
require('../js/import-adapters/backpack.js');
const pets = require('../js/import-adapters/pets.js');
require('../js/import-adapters/hero-gear.js');
const report = require('../js/import-adapters/battle-report.js');
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
// The Pet List's labels fold "l" to "i" like every row; routing must still find it.
assert.equal(S.route(S.page(JSON.parse(fs.readFileSync('.dsh/import-fixtures/pet-list.items.json', 'utf8')))).adapter.id, 'pet-list');
assert.deepEqual(['Lv. 70', 'Lv.26↑', 'LV 5O', 'Lv.', 'Lv. 700'].map(t => pets.level([t])), [70, 26, 50, null, null]);
// A battle report's Bonus Details: your value left of each label, theirs right.
const poly = (x, y, w = 80) => [[x, y], [x + w, y], [x + w, y + 16], [x, y + 16]];
// The owner's report (.dsh/import-fixtures/battle-report.jpg): the troop
// power bars above hold no counts; the counts sit under the six troop icons.
const sheet = load('battle-report');
assert.equal(S.route(sheet).adapter.id, 'battle-report');
const sheetRead = S.route(sheet).adapter.read(sheet), want = {};
for (const [type, mine, lethal] of [['inf', 30.5, 167.5], ['cav', 30.5, 155.8], ['arc', 30.5, 183.2]]) {
  Object.assign(want, { ['sim-atk-' + type]: mine, ['sim-def-' + type]: mine, ['sim-let-' + type]: lethal, ['sim-hea-' + type]: lethal });
  Object.assign(want, { ['sim-foe-atk-' + type]: 23, ['sim-foe-def-' + type]: 23, ['sim-foe-let-' + type]: 205, ['sim-foe-hea-' + type]: 205 });
}
Object.assign(want, { 'sim-n-inf': 70500, 'sim-n-cav': 30000, 'sim-n-arc': 49500, 'sim-foe-n-inf': 60000, 'sim-foe-n-cav': 45000, 'sim-foe-n-arc': 45000 });
assert.deepEqual(values(sheetRead), want, 'every Bonus Details cell and troop count of a real report');
assert.ok(sheetRead.every(p => p.target === 'sheet' && p.sheet === 'battle-report' && p.crop && p.crop.w === sheet.width));
assert.equal(new Set(sheetRead.map(p => p.group)).size, 13, 'twelve stat rows and one row of counts, each reviewed under one cut-out');
const totals = S.page({ width: 500, height: 100, items: [
  { text: '+10%', poly: poly(5, 10) }, { text: 'Cavalry Defense', poly: poly(150, 10, 200) }, { text: '+20%', poly: poly(400, 10) },
  { text: '+11%', poly: poly(5, 40) }, { text: 'Cavalry Health', poly: poly(150, 40, 200) }, { text: '+21%', poly: poly(400, 40) },
  { text: '50,000', poly: poly(5, 70) }, { text: 'Troops', poly: poly(150, 70, 200) }, { text: '60,000', poly: poly(400, 70) }
] });
assert.deepEqual(values(report.read(totals)), { 'sim-def-cav': 10, 'sim-foe-def-cav': 20, 'sim-hea-cav': 11, 'sim-foe-hea-cav': 21, 'sim-n-total': 50000, 'sim-foe-n-total': 60000 });
console.log('Screen import: routing (Overview, Pet List, battle reports), Overview resource totals, speedup minutes and pet levels from recorded production reads, and a real battle report’s cells, counts and totals passed.');
