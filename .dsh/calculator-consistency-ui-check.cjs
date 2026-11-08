// Calculator pages share one fold, one icon size per role and a contents rail that ends in How it works · Sources.
const assert = require('node:assert/strict'), path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
const pages = ['hero-gear', 'governor-gear', 'buildings', 'heroes', 'masters', 'pets'];
withBrowser({ root: path.resolve('_site') }, async ({ browser, origin }) => {
  const errors = [];
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' }), page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    const foldSizes = new Set();
    for (const self of pages) {
      await page.goto(origin + '/' + self + '/?lang=en');
      const rail = await page.locator('#toc a').evaluateAll(a => a.map(x => x.getAttribute('href')));
      assert.deepEqual(rail.slice(-2), ['#how', '#sources'], self + ': the rail ends with How it works · Sources');
      for (const href of rail) assert.equal(await page.locator(href).count(), 1, self + ': ' + href + ' exists');
      assert.equal(await page.locator('.gear-advanced, .gov-advanced').count(), 0, self + ': no page-specific fold class');
      const folds = await page.locator('main details.fold > summary, .notes-folds > details > summary').evaluateAll(s => s.map(x => { const c = getComputedStyle(x); return [c.fontSize, c.fontWeight, c.textTransform, c.letterSpacing].join(' '); }));
      folds.forEach(f => foldSizes.add(f));
      const tiles = await page.locator('.sheet-strip img, .gear-bag img, .gov-bag img, .master-bag img, .gear-cost-strip img').evaluateAll(i => i.filter(x => x.getClientRects().length).map(x => Math.round(x.getBoundingClientRect().width)));
      tiles.forEach(w => assert.equal(w, 40, self + ' at ' + width + ': a tile icon is 40px, not ' + w));
    }
    assert.equal(foldSizes.size, 1, 'one fold style at ' + width + ': ' + [...foldSizes].join(' | '));
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('Calculator consistency: one fold style, 40px tile icons and a rail ending in How it works · Sources on ' + pages.length + ' pages at 2 widths pass.');
}).catch(e => { console.error(e); process.exitCode = 1; });
