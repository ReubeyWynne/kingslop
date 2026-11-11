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
  // Heroes, Masters and Pets open on the planner frame: yours beside the answer, two tabs on a phone.
  const rosters = { heroes: ['#kvk-points', () => PlayerLedger.shared().setHero('jabel', { level: 60 })], masters: ['#kvk-points', () => PlayerLedger.shared().setMaster('valora', { affinity: 29 })], pets: ['#advances', () => PlayerLedger.shared().setPet('lion', { level: 20 })] };
  for (const [self, [answer, record]] of Object.entries(rosters)) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }), page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + '/' + self + '/?lang=en');
    await page.waitForFunction(() => document.getElementById('planner').dataset.view);
    assert.equal(await page.locator('#planner').getAttribute('data-view'), 'mine', self + ': an empty save opens on its own half');
    assert.equal(await page.locator('.sheet-shelf-empty').isVisible(), true, self + ': the empty shelf says where to start');
    assert.equal(await page.locator(answer).isVisible(), false, self + ': the answer waits behind its tab');
    await page.evaluate(record);
    await page.waitForFunction(() => document.querySelector('.sheet-shelf-empty').offsetParent === null);
    assert.equal(await page.locator('#planner').getAttribute('data-view'), 'mine', self + ': an edit never moves the reader');
    await page.reload(); await page.waitForFunction(() => document.getElementById('planner').dataset.view);
    assert.equal(await page.locator('#planner').getAttribute('data-view'), 'answer', self + ': a save with something in it opens on the answer');
    await page.locator('.sheet-views [data-value="mine"]').click();
    // One roster per page, and it is your half: no chips and no second grid.
    const grid = { heroes: '[x-data="heroRoster"]', masters: '[data-module~="master-directory"]', pets: '[data-module~="pet-den"]' }[self];
    assert.equal(await page.locator('.sheet-chip').count(), 0, self + ': no chips beside the roster');
    assert.equal(await page.locator(grid).count(), 1, self + ': one grid');
    assert.equal(await page.locator('[data-half="mine"] ' + grid).isVisible(), true, self + ': the grid is your half');
    await page.goto(origin + '/' + self + '/?lang=en' + answer); await page.waitForFunction(() => document.getElementById('planner').dataset.view);
    assert.equal(await page.locator('#planner').getAttribute('data-view'), 'answer', self + ': a link into the answer opens it');
    await page.setViewportSize({ width: 1280, height: 900 });
    const [mine, ans] = await page.locator('[data-half]').evaluateAll(n => n.map(x => x.getBoundingClientRect()));
    assert(mine.width > 300 && ans.width > 300 && Math.abs(mine.top - ans.top) < 2 && ans.left > mine.right, self + ': the halves sit side by side on a wide screen');
    await context.close();
  }
  // Two heading sizes: the planner's halves share one, and page sections share the other.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage(), half = new Set(), section = new Set();
  for (const self of ['hero-gear', 'governor-gear', 'heroes', 'masters', 'pets']) {
    await page.goto(origin + '/' + self + '/?lang=en');
    (await page.locator('.sheet-side > h2, .sheet-answer > h2').evaluateAll(h => h.map(x => getComputedStyle(x).fontSize))).forEach(v => half.add(v));
    (await page.locator('main > .section:not(.sheet-console):not(.hero) > h2').evaluateAll(h => h.map(x => getComputedStyle(x).fontSize))).forEach(v => section.add(v));
  }
  assert.equal(half.size, 1, 'one heading size inside planners: ' + [...half]);
  assert.equal(section.size, 1, 'one heading size for page sections: ' + [...section]);
  // Number rules (common.js tileText): tiles shorten from 10,000 with the exact
  // figure as the title, ? for not entered, — for a cost of nothing; tables never shorten.
  assert.deepEqual(await page.evaluate(() => [4332, 48213, 1580000000, null, 0].map(n => BH.tileText(n, true)).concat([BH.tileText(0)])), [
    { text: '4,332', title: '' }, { text: '48.2k', title: '48,213' }, { text: '1.58bn', title: '1,580,000,000' },
    { text: '?', title: '' }, { text: '\u2014', title: '' }, { text: '0', title: '' }]);
  await page.goto(origin + '/buildings/?lang=en');
  assert.deepEqual(await page.locator('table b').evaluateAll(b => b.map(x => x.textContent).filter(t => /\d[a-z]/i.test(t))), [], 'no table shortens a figure');
  // On a sheet (?guest), the KvK points read the sheet's copy, never your save.
  for (const [self, record] of [['heroes', () => Interactions.ledger().setHero('jabel', { level: 60, stars: 8 })], ['masters', () => Interactions.ledger().setMaster('valora', { affinity: 29 })]]) {
    await page.goto(origin + '/' + self + '/?lang=en&guest', { waitUntil: 'networkidle' });
    await page.evaluate(record);
    await page.waitForFunction(() => document.querySelectorAll('#kvk-points .hero-points-table tbody tr').length === 1);
    assert.equal(await page.evaluate(s => Object.keys((PlayerLedger.shared().snapshot()[s] || {}).roster || {}).length, self), 0, self + ': a sheet never writes your save');
  }
  await context.close();
  assert.deepEqual(errors, []);
  console.log('Calculator consistency: one fold style, 40px tile icons, two heading sizes, a rail ending in How it works · Sources on ' + pages.length + ' pages at 2 widths, the planner frame on Heroes, Masters and Pets, KvK points on a sheet, and the number rules pass.');
}).catch(e => { console.error(e); process.exitCode = 1; });
