// Building requirements in a browser (after a Jekyll build): a quick answer with nothing saved,
// refining one building at a time into the shared save, guest mode and links, the met state,
// every language at phone width, screenshots in .dsh/buildings-preview/.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
const root = path.resolve('_site'), output = path.resolve('.dsh/buildings-preview');
withBrowser({ root }, async ({ browser, origin }) => {
  fs.mkdirSync(output, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.addInitScript(() => document.addEventListener('module:error', e => { throw new Error(e.detail.module + ': ' + e.detail.message); }));
  const open = async query => {
    await page.goto(origin + '/buildings/' + query);
    await page.waitForFunction(() => !document.querySelector('[data-target="building-paths.building"]').disabled && document.querySelector('.reqs-headline').textContent);
  };
  const headline = () => page.locator('.reqs-headline').innerText();
  const saved = () => page.evaluate(() => PlayerLedger.shared().snapshot().buildings?.levels || {});

  // Nothing saved: the goal answers at once, every prerequisite assumed.
  await open('?lang=en&b=town-center&to=3');
  assert.equal(await headline(), 'Town Center 3 · upgrades: 3');
  assert.match(page.url(), /b=town-center&to=3$/);
  assert.equal(await page.locator('.reqs-run[data-state="assumed"]').count(), 2);
  await page.locator('select[data-building="house-1"]').selectOption('2');
  await page.waitForFunction(() => document.querySelector('.reqs-headline').textContent === 'Town Center 3 · upgrades: 1');
  assert.deepEqual(await saved(), { 'house-1': '2' });
  assert.equal(await page.locator('.reqs-run[data-state="done"]').count(), 1, 'a level set high enough stays listed, ticked');
  await page.screenshot({ path: path.join(output, 'en-390.png'), fullPage: true });

  // A saved level fills the goal and the plan; "not sure" forgets it again.
  await page.locator('[data-target="building-paths.level"]').selectOption('15');
  await page.locator('select[data-building="town-center"]').selectOption('14');
  await page.waitForFunction(() => /Town Center 15 · upgrades: \d+/.test(document.querySelector('.reqs-headline').textContent));
  assert.equal((await saved())['town-center'], '14');
  await page.locator('select[data-building="embassy"]').selectOption('14');
  await page.locator('select[data-building="stable"]').selectOption('14');
  await page.waitForFunction(() => document.querySelector('.reqs-headline').textContent === 'Town Center 15 · upgrades: 1');
  await page.locator('[data-action="building-paths.addGoal"]').click();
  assert.deepEqual(await page.evaluate(() => PlayerLedger.shared().priority().goals), [{ kind: 'building', target: 'town-center', level: '15' }]);
  await page.locator('select[data-building="stable"]').selectOption('');
  assert.equal((await saved()).stable, undefined);

  // A link with levels opens in guest mode and never touches the save.
  const before = await saved();
  await open('?lang=en&b=barracks&to=TG3&have=town-center:TG1,barracks:TG1');
  assert.ok(await page.locator('[data-target="building-paths.guestBanner"]').isVisible());
  assert.ok(await page.locator('[data-target="building-paths.addGoal"]').isHidden());
  await page.locator('select[data-building="embassy"]').selectOption('TG 2');
  await page.waitForFunction(() => location.search.includes('embassy:TG2'));
  assert.deepEqual(await saved(), before);
  // A plain link uses the reader's own levels.
  await open('?lang=en&b=town-center&to=15');
  assert.ok(await page.locator('[data-target="building-paths.guestBanner"]').isHidden());
  assert.equal(await headline(), 'Town Center 15 · upgrades: 5', 'the stable forgotten above is assumed again');
  await page.locator('select[data-building="town-center"]').selectOption('15');
  await page.waitForFunction(() => document.querySelector('.reqs-headline').textContent === 'Your Town Center 15 is already done.');

  // Construction speed shortens the time and rides in the link.
  await open('?lang=en&b=town-center&to=20&speed=100');
  assert.match(await page.locator('.reqs-time').innerText(), /at \+100% construction speed/);

  // Every language at phone width: translated, no sideways scroll.
  await page.setViewportSize({ width: 320, height: 800 });
  for (const lang of fs.readdirSync('i18n').filter(f => f.endsWith('.js')).map(f => f.slice(0, -3))) {
    await open('?lang=' + lang + '&b=town-center&to=TG2');
    await page.waitForFunction(lang => document.documentElement.lang === lang, lang);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), lang + ' overflows at 320');
    if (lang !== 'en') assert.doesNotMatch(await page.locator('#top h1').innerText(), /Building requirements/i, lang);
    if (['en', 'pt-BR', 'ar'].includes(lang)) await page.screenshot({ path: path.join(output, lang + '-320.png'), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await open('?lang=en&b=town-center&to=TG2');
  await page.screenshot({ path: path.join(output, 'en-1280.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('building requirements UI ok');
});
