// The island plan model and the generated island data. Run: node --test .dsh/island-check.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const Model = require(path.join(root, 'js/island-model.js'));

function load(file, name) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox);
  return sandbox.window[name];
}
const DATA = load('js/island-data.js', 'ISLAND_DATA');
const EXAMPLES = load('js/island-examples.js', 'ISLAND_EXAMPLES');
const fresh = () => { const m = Model.create(DATA.pieces, DATA.size); m.load({ pieces: [[27 * 60 + 27, 'build_7000', 0]], surfaces: [] }); return m; };

test('pieces never overlap and stay on the board', () => {
  const m = fresh();
  assert.equal(m.place('build_7005', 27, 27), null, 'onto the Fountain');
  assert.equal(m.place('build_7005', 58, 58), null, 'off the edge');
  assert.ok(m.place('build_7005', 20, 20));
  assert.equal(m.place('build_7035', 21, 21), null);
  assert.equal(m.pieceAt(22, 22).slug, 'build_7005');
});

test('what fits a tapped cell covers that cell, centred where it can be', () => {
  const m = fresh();
  assert.deepEqual(m.anchorFor(3, 3, 10, 10, -1), { r: 9, c: 9 });
  // Beside the Fountain the footprint slides away from it but still covers the cell.
  const a = m.anchorFor(3, 3, 26, 29, -1);
  assert.ok(a && a.r + 2 >= 26 && a.r <= 26 && a.c <= 29 && a.c + 2 >= 29 && a.r + 3 <= 27);
  assert.equal(m.anchorFor(3, 3, 29, 29, -1), null, 'inside the Fountain');
});

test('turn swaps a footprint only when there is room', () => {
  const m = fresh();
  const dock = DATA.pieces.find(p => p.w !== p.h);
  if (!dock) return; // every current footprint is square
  const p = m.place(dock.slug, 5, 5);
  assert.ok(m.turn(p.id));
  assert.deepEqual([p.w, p.h], [dock.h, dock.w]);
});

test('one gesture is one undo step, and a cancelled stroke leaves nothing', () => {
  const m = fresh();
  m.begin(); for (let c = 0; c < 10; c++) m.paint('garden_path', 5, c); m.end();
  assert.equal(m.counts().garden_path, 10);
  assert.ok(m.undo());
  assert.equal(m.counts().garden_path, undefined);
  assert.ok(m.redo());
  assert.equal(m.counts().garden_path, 10);
  m.begin(); m.paint('pond', 6, 1); m.cancel();
  assert.equal(m.counts().pond, undefined);
  assert.equal(m.edit(() => m.paint('garden_path', 5, 1)), false, 'painting the same surface again is not a change');
});

test('surfaces sit under pieces; clearing takes the piece first', () => {
  const m = fresh();
  m.paint('garden_path', 10, 10);
  assert.ok(m.place('build_7035', 10, 10));
  m.clear(10, 10);
  assert.equal(m.pieceAt(10, 10), null);
  assert.equal(m.surfaces.get(610), 'garden_path');
  m.clear(10, 10);
  assert.equal(m.surfaces.has(610), false);
});

test('a lifted piece moves only to free ground', () => {
  const m = fresh();
  const a = m.place('build_7005', 10, 10), b = m.place('build_7006', 10, 20);
  assert.equal(m.move(a.id, 10, 19), false);
  assert.ok(m.move(a.id, 11, 11), 'overlapping its own old cells is fine');
  assert.equal(m.pieceAt(10, 10), null);
  assert.equal(m.pieceAt(11, 11).id, a.id);
  assert.ok(b);
});

test('saved plans round-trip, and unknown pieces are dropped and counted', () => {
  const m = fresh();
  m.place('build_7005', 3, 3); m.paint('pond', 40, 40);
  const saved = JSON.parse(JSON.stringify(m.toJSON()));
  const n = Model.create(DATA.pieces, 60);
  assert.equal(n.load(saved), 0);
  assert.deepEqual(n.toJSON(), saved);
  assert.equal(n.load({ pieces: [[0, 'no_such_piece', 0]], surfaces: [[-1, 'pond'], [5, 'build_7005']] }), 3);
});

test('every preset loads whole, ours with the Fountain in the middle, and one is crazy golf', () => {
  assert.ok(EXAMPLES.length >= 9);
  for (const ex of EXAMPLES) {
    const m = Model.create(DATA.pieces, 60);
    assert.equal(m.load({ pieces: ex.pieces.map(e => [e[0], e[1], 0]), surfaces: ex.surfaces }), 0, ex.slug);
    // Layout 8902 has no Fountain in the source data; ours always have one.
    if (ex.authored) assert.equal(m.pieceAt(29, 29)?.slug, 'build_7000', ex.slug);
    assert.ok(ex.pieces.filter(e => e[1] === 'build_7000').length <= 1, ex.slug);
    assert.deepEqual(m.over(), {}, ex.slug + ' stays inside every limit');
  }
  const golf = EXAMPLES.find(e => e.slug === 'crazy-golf');
  assert.ok(golf && golf.authored);
  assert.ok(golf.pieces.some(e => e[1] === 'build_7008'), 'a windmill');
  const pins = golf.pieces.filter(e => e[1] === 'build_7039' || e[1] === 'streetlight').length;
  assert.equal(golf.pieces.filter(e => e[1] === 'build_7039').length, 5, 'five banners, the most an island holds');
  assert.ok(pins >= 8, 'a pin on every green');
});

test('limits: decorations and ponds 500, event buildings one or their buff count, paths open', () => {
  const by = Object.fromEntries(DATA.pieces.map(p => [p.slug, p]));
  assert.equal(by.tree_fir.limit, 500);
  assert.equal(by.lush_elegy.limit, 500);
  assert.equal(by.streetlight.limit, 500);
  assert.equal(by.pond.limit, 500);
  assert.equal(by.pond.gems * by.pond.limit, 100000);
  assert.equal(by.garden_path.limit, 0);
  assert.equal(by.meadow.limit, 0);
  assert.equal(by.build_7008.limit, 1, 'Windmill');
  assert.equal(by.build_7039.limit, 5, 'Banner of Hope counts five for its buff');
  for (const p of DATA.pieces) if (p.kind === 'building' || p.kind === 'decor') assert.ok(p.limit >= 1, p.slug);
});

test('a full piece cannot be placed or painted, and undo gives the room back', () => {
  const m = fresh();
  assert.ok(m.edit(() => m.place('build_7008', 10, 10)));
  assert.equal(m.room('build_7008'), 0);
  assert.equal(m.place('build_7008', 40, 40), null, 'a second windmill');
  m.undo();
  assert.equal(m.room('build_7008'), 1);
  m.begin();
  for (let c = 0; c < 60; c++) for (let r = 0; r < 9; r++) m.paint('pond', r, c);
  m.end();
  assert.equal(m.count('pond'), 500, 'ponds stop at 500');
  assert.equal(m.paint('pond', 50, 50), false);
  assert.ok(m.clear(0, 0));
  assert.equal(m.count('pond'), 499);
  for (let c = 0; c < 60; c++) for (let r = 40; r < 60; r++) m.paint('garden_path', r, c);
  assert.equal(m.count('garden_path'), 1200, 'paths have no cap');
  // A loaded plan keeps what it has and reports the excess.
  const old = Model.create(DATA.pieces, 60);
  assert.equal(old.load({ pieces: [[0, 'build_7008', 0], [10 * 60, 'build_7008', 0]], surfaces: [] }), 0);
  assert.deepEqual(old.over(), { build_7008: [2, 1] });
});

test('generated data has art for every piece but surfaces', () => {
  for (const p of DATA.pieces) {
    if (p.kind !== 'surface') assert.ok(fs.existsSync(path.join(root, 'img/island', p.id + '.webp')), p.slug);
    assert.ok(p.w >= 1 && p.h >= 1 && /^#[0-9a-f]{6}$/i.test(p.swatch), p.slug);
  }
});
