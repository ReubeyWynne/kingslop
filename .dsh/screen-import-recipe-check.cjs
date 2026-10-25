// The screenshot recipe in the import dock, in Chromium, without the OCR
// worker: a link opens the dock at the recipe, its five rows tick off from the
// save's import history (and untick when an apply is undone), Town Centre is
// offered once the bag's three screens are in, a finished recipe folds to its
// count, a shot under review hides the recipe, and the rows fit a 320px phone
// in every direction the site is written.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
const root = path.resolve('_site');
const output = path.resolve('.dsh/import-preview');

const RECORDS = {
  resources: { sourceType: 'backpack', inventoryDelta: { bread: { before: null, after: 597910000 }, wood: { before: null, after: 557270000 } } },
  speedups: { sourceType: 'backpack', inventoryDelta: { 'speedup-general': { before: null, after: 25681 } } },
  backpack: { sourceType: 'backpack', inventoryDelta: { forgehammer: { before: null, after: 28 } } },
  gear: { sourceType: 'hero-gear', itemDelta: {} },
  pets: { sourceType: 'pets', petDelta: { lion: { before: null, after: 70 } } }
};

withBrowser({ root }, async ({ browser, origin: base }) => {
  fs.mkdirSync(output, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const dock = page.locator('#screen-import');
  const recipe = dock.locator('#screenshot-recipe');
  const state = () => recipe.locator('[data-recipe]').evaluateAll(list => list.map(li => li.dataset.recipe + ':' + li.dataset.done));
  const count = () => recipe.locator('[data-target~="screen-import.recipeCount"]').textContent();
  const apply = (names, start) => page.evaluate(({ names, records, start }) => {
    const store = PlayerLedger.shared();
    names.forEach((name, i) => {
      const n = start + i;
      store.applyImport(Object.assign({ id: 'shot-check-' + n, at: new Date().toISOString(), contentHash: n.toString(16).padStart(64, '0'), confirmation: 'confirmed' }, records[name]), store.snapshot().revision);
    });
  }, { names, records: RECORDS, start });

  try {
    // A link opens the dock at the recipe, from any page.
    await page.goto(base + '/events/?lang=en#screenshot-recipe');
    await recipe.waitFor({ state: 'visible', timeout: 15000 });
    assert.equal(await dock.locator('[data-target~="screen-import.chip"]').getAttribute('aria-expanded'), 'true', 'the link presses the dock open');
    assert.equal(await recipe.locator('#import-recipe-title').textContent(), 'Five screenshots and the tools know you');
    assert.deepEqual(await state(), ['resources:false', 'speedups:false', 'backpack:false', 'gear:false', 'pets:false']);
    assert.equal(await count(), '0 of 5');
    assert.equal(await recipe.locator('[data-target~="screen-import.recipeNext"]').isHidden(), true, 'Town Centre waits for the bag');
    const pictures = await recipe.locator('img').evaluateAll(list => Promise.all(list.map(img => img.decode().then(() => img.naturalWidth, () => 0))));
    assert.equal(pictures.length, 5);
    assert.ok(pictures.every(w => w > 0), 'every row shows its in-game screen');
    await page.screenshot({ path: path.join(output, 'recipe-empty-390.png') });

    // Rows tick from the history, on the page they were applied on.
    await apply(['resources', 'speedups'], 1);
    await page.reload();
    await recipe.waitFor({ state: 'visible' });
    assert.deepEqual(await state(), ['resources:true', 'speedups:true', 'backpack:false', 'gear:false', 'pets:false'], 'the Overview tabs are told apart by what they saved');
    assert.equal(await recipe.locator('[data-recipe="resources"] [data-field="state"]').textContent(), 'saved');
    assert.equal(await count(), '2 of 5');
    assert.equal(await recipe.locator('[data-target~="screen-import.recipeNext"]').isHidden(), true);

    // The third bag screen brings the Town Centre link.
    await apply(['backpack'], 3);
    await page.reload();
    await recipe.waitFor({ state: 'visible' });
    assert.equal(await count(), '3 of 5');
    const next = recipe.locator('[data-target~="screen-import.recipeNext"]');
    assert.equal(await next.isVisible(), true, 'after the first three, the dock links to Town Centre');
    assert.match(await next.locator('a').getAttribute('href'), /town-centre\/$/);
    await page.screenshot({ path: path.join(output, 'recipe-three-390.png') });

    // A shot waiting for review comes first; the recipe steps aside, then
    // returns ticked when the shot is applied in the dock.
    await page.evaluate(() => window.ImportQueue.open().then(q => q.put({
      id: 'recipecheck00001', hash: 'f'.repeat(64), name: 'pet-list.jpg', added: Date.now(), lastModified: Date.now(), blob: new Blob(['x'], { type: 'image/png' }),
      status: 'review', adapter: 'pet-list', sourceType: 'pets', layout: 'list', edits: {},
      proposals: [{ target: 'pet', id: 'lion', label: 'Lion', value: 70, confidence: 0.95, note: '', unit: 'level', crop: null, y: 0 }]
    })));
    await page.goto(base + '/heroes/?lang=en');
    await dock.locator('.import-chip', { hasText: '1 to review' }).waitFor({ timeout: 15000 });
    await dock.locator('.import-chip').click();
    await dock.locator('.import-tile[data-key="lion"]').waitFor();
    assert.equal(await recipe.isHidden(), true, 'a review hides the recipe');
    await dock.locator('[data-action~="screen-import.apply"]').click();
    await dock.locator('[data-target~="screen-import.status"]', { hasText: 'Saved 1 values' }).waitFor();
    await recipe.waitFor({ state: 'visible' });
    assert.equal(await recipe.locator('[data-recipe="pets"]').getAttribute('data-done'), 'true', 'an apply ticks its row at once');
    assert.equal(await count(), '4 of 5');
    await dock.locator('[data-action~="screen-import.undo"]').click();
    assert.equal(await recipe.locator('[data-recipe="pets"]').getAttribute('data-done'), 'false', 'undo takes the tick back');

    // All five: the recipe folds to its count.
    await apply(['gear', 'pets'], 4);
    await page.goto(base + '/town-centre/?lang=en#screenshot-recipe');
    await recipe.waitFor({ state: 'visible' });
    assert.equal(await count(), '5 of 5');
    assert.equal(await recipe.locator('[data-target~="screen-import.recipeList"]').isHidden(), true, 'a finished recipe folds');
    assert.equal(await next.locator('a').getAttribute('aria-current'), 'page');

    // Every language carries the recipe, and the rows fit a small phone.
    for (const lang of ['de', 'ar', 'th']) {
      const fresh = await browser.newContext({ viewport: { width: 320, height: 640 }, reducedMotion: 'reduce' });
      const p = await fresh.newPage();
      p.on('pageerror', e => errors.push(lang + ': ' + e.message));
      await p.goto(base + '/vip-calculator/?lang=' + lang + '#screenshot-recipe');
      const r = p.locator('#screenshot-recipe');
      await r.waitFor({ state: 'visible', timeout: 15000 });
      await p.waitForFunction(() => document.documentElement.lang && document.querySelector('#import-recipe-title').textContent !== 'Five screenshots and the tools know you');
      const fit = await p.evaluate(() => {
        const sheet = document.querySelector('#screen-import .import-sheet').getBoundingClientRect();
        const rows = Array.from(document.querySelectorAll('#screenshot-recipe [data-recipe]')).map(li => li.getBoundingClientRect());
        return { sheet: sheet.left >= 0 && sheet.right <= innerWidth + 1, rows: rows.every(b => b.left >= sheet.left - 1 && b.right <= sheet.right + 1), page: document.documentElement.scrollWidth <= innerWidth + 1, count: document.querySelector('#screenshot-recipe [data-target~="screen-import.recipeCount"]').textContent };
      });
      assert.deepEqual([fit.sheet, fit.rows, fit.page], [true, true, true], lang + ' recipe fits 320px');
      assert.ok(fit.count.length > 0, lang + ' recipe counts');
      await p.screenshot({ path: path.join(output, 'recipe-' + lang + '-320.png') });
      await fresh.close();
    }

    assert.deepEqual(errors, []);
    console.log('screen-import recipe: ok');
  } finally {
    await context.close();
  }
});
