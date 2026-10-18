const assert = require('node:assert/strict');
const T = require('../js/ocr-text.js');
const word = (text, x, y, w = 40, h = 20) => ({ text, poly: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] });

// Rows: words on one line join left to right; the next line starts a new row.
const rows = T.rows(T.boxes([word('597.91M', 300, 102), word('Bread', 60, 100), word('207.60M', 180, 98), word('Wood', 60, 160), word('', 0, 0), { text: 'x' }]));
assert.deepEqual(rows.map(r => r.text), ['Bread 207.60M 597.91M', 'Wood']);

assert.equal(T.normalise('٨٬٨٣٠'.replace('٬', ',')), '8,830');
assert.equal(T.normalise('１２ hr'), '12 hr');
assert.equal(T.fold('Letha1ity'), 'iethaiity');
assert.equal(T.wordIn(T.fold('lnfantry Attack'), ['Infantry', 'Cavalry']), 'Infantry');
assert.equal(T.wordIn(T.fold('Cavalyr'), ['Cavalry']), null, 'two edits is not a match');

assert.equal(T.parseCount('8,830'), 8830);
assert.equal(T.parseCount('87.542'), 87542);
assert.equal(T.parseCount('1 100'), 1100);
assert.equal(T.parseCount('35'), 35);
assert.equal(T.parseCount('2;632'), 2632, 'a misread thousands comma');
assert.equal(T.parseCount('1O0'), 100, 'a letter O inside a count reads as zero');
assert.equal(T.parseCount('12.5'), null);
assert.equal(T.parseCount('Lv. 2'), null);

assert.equal(T.parseShort('207.60M'), 207600000);
assert.equal(T.parseShort('6.47K'), 6470);
assert.equal(T.parseShort('104.68 M'), 104680000);
assert.equal(T.parseShort('1,084'), 1084);
assert.equal(T.parseShort('1.2B'), 1200000000);
assert.equal(T.parseShort('M'), null);

assert.equal(T.parseDuration('17 day(s)20 hr(s)1 min(s)'), 17 * 1440 + 20 * 60 + 1);
assert.equal(T.parseDuration('8 day(s)10 min(s)'), 8 * 1440 + 10);
assert.equal(T.parseDuration('12 hr(s)'), 720);
assert.equal(T.parseDuration('8d 10h 45m'), 8 * 1440 + 645);
assert.equal(T.parseDuration('5 minutes'), 5);
assert.equal(T.parseDuration('General Speedup'), null);

console.log('OCR text helpers: rows, normalising, fuzzy labels, counts, rounded amounts and durations passed.');
