// Building requirements in a browser (after a Jekyll build): a quick answer with nothing saved,
// pinned in view; refining one building at a time through the level grid (no selects) into the
// shared save; goal tiles for several goals in one plan; the guest switch and links (the first
// ?b=&to= form included); the met state;
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
    await page.waitForFunction(() => !document.querySelector('.reqs-pick').disabled && document.querySelector('.reqs-headline').textContent);
  };
  // A level is set through the grid: open it from the card, pick the tier tab past 30, tap the level.
  const choose = async (kind, building, level) => {
    await page.locator(`.reqs-lv[data-kind="${kind}"][data-building="${building}"]`).click();
    await page.locator('.reqs-picker[open]').waitFor();
    if (level !== '' && level !== '0' && await page.locator('.reqs-tiers').isVisible()) {
      await page.locator(`.reqs-tiers [data-tier="${(/^TG ?(\d+)/.exec(level) || [0, 0])[1]}"]`).click();
    }
    await page.locator(`.reqs-picker button[data-level="${level}"]`).click();
    await page.locator('.reqs-picker[open]').waitFor({ state: 'detached' }).catch(() => {});
    await page.waitForFunction(() => !document.querySelector('.reqs-picker').open);
  };
  const headline = () => page.locator('.reqs-headline').innerText();
  const saved = () => page.evaluate(() => PlayerLedger.shared().snapshot().buildings?.levels || {});

  // Nothing saved: the goal answers at once, every prerequisite assumed.
  await open('?lang=en&goal=town-center:3');
  assert.equal(await headline(), 'Town Center 3 · upgrades: 3');
  assert.match(page.url(), /goal=town-center:3$/);
  assert.equal(await page.locator('.reqs-run[data-state="assumed"]').count(), 2);
  assert.equal(await page.locator('main select').count(), 0, 'no long selects');
  assert.equal(await page.locator('.reqs-run .reqs-art img').count(), await page.locator('.reqs-run').count(), 'every card shows its building');
  assert(await page.evaluate(() => document.querySelector('.reqs-headline').getBoundingClientRect().bottom <= innerHeight), 'the answer is in view at once');
  await choose('have', 'house-1', '2');
  await page.waitForFunction(() => document.querySelector('.reqs-headline').textContent === 'Town Center 3 · upgrades: 1');
  assert.deepEqual(await saved(), { 'house-1': '2' });
  assert.equal(await page.locator('.reqs-run[data-state="done"]').count(), 1, 'a level set high enough stays listed, ticked');
  await page.screenshot({ path: path.join(output, 'en-390.png'), fullPage: true });

  // The level grid fits a phone screen without scrolling, TG tiers included.
  await page.locator('.reqs-lv[data-kind="goal"][data-building="town-center"]').click();
  assert(await page.evaluate(() => { const d = document.querySelector('.reqs-picker'); return d.scrollHeight <= d.clientHeight + 1; }), 'the grid does not scroll');
  await page.locator('.reqs-tiers [data-tier="3"]').click();
  assert.equal(await page.locator('.reqs-grid button').count(), 5);
  await page.screenshot({ path: path.join(output, 'en-390-grid.png') });
  // Tapping a TG tab again (a double tap) takes that TG level itself.
  await page.locator('.reqs-tiers [data-tier="4"]').dblclick();
  await page.waitForFunction(() => !document.querySelector('.reqs-picker').open);
  await page.waitForFunction(() => location.search.includes('goal=town-center:TG4'));

  // A saved level fills the goal and the plan; "not sure" forgets it again.
  await choose('goal', 'town-center', '15');
  await choose('have', 'town-center', '14');
  await page.waitForFunction(() => /Town Center 15 · upgrades: \d+/.test(document.querySelector('.reqs-headline').textContent));
  assert.equal((await saved())['town-center'], '14');
  await choose('have', 'embassy', '14');
  await choose('have', 'stable', '14');
  await page.waitForFunction(() => document.querySelector('.reqs-headline').textContent === 'Town Center 15 · upgrades: 1');
  await page.locator('[data-action="building-paths.addGoal"]').click();
  assert.deepEqual(await page.evaluate(() => PlayerLedger.shared().priority().goals), [{ kind: 'building', target: 'town-center', level: '15' }]);
  await choose('have', 'stable', '');
  assert.equal((await saved()).stable, undefined);

  // A tile opens its goal level at once; with one goal there is nothing to remove.
  await page.locator('.reqs-pick[data-building="town-center"]').click();
  await page.locator('.reqs-picker[open]').waitFor();
  assert.equal(await page.locator('.reqs-picker [data-action="building-paths.drop"]').count(), 0);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.reqs-picker').open);
  // A second goal tile joins the same plan with its level picked straight from the grid, rides in
  // the link, and is removed from the same grid.
  await page.locator('.reqs-pick[data-building="barracks"]').click();
  await page.locator('.reqs-picker[open]').waitFor();
  await page.locator('.reqs-picker button[data-level="15"]').click();
  await page.waitForFunction(() => !document.querySelector('.reqs-picker').open);
  await page.waitForFunction(() => /^Town Center 15 \+ Barracks 15 · upgrades: \d+$/.test(document.querySelector('.reqs-headline').textContent));
  assert.match(page.url(), /goal=town-center:15,barracks:15/);
  assert.equal(await page.locator('.reqs-run').last().locator('.reqs-run-name').innerText(), 'Barracks');
  await page.screenshot({ path: path.join(output, 'en-390-two-goals.png'), fullPage: true });
  assert.equal(await page.locator('.reqs-pick[data-building="barracks"] .reqs-badge').innerText(), '15');
  await page.locator('.reqs-pick[data-building="barracks"]').click();
  await page.locator('.reqs-picker[open] [data-action="building-paths.drop"]').click();
  await page.waitForFunction(() => !document.querySelector('.reqs-picker').open);
  assert.equal(await page.locator('.reqs-pick[aria-pressed="true"]').count(), 1);
  assert.match(page.url(), /goal=town-center:15$/);

  // The guest switch reloads into guest mode with the same goal, and back out.
  await page.locator('[data-action="building-paths.guest"]').click();
  await page.waitForURL(/guest/);
  await open(page.url().slice(page.url().indexOf('/buildings/') + '/buildings/'.length));
  assert.equal(await page.locator('[data-action="building-paths.guest"]').getAttribute('aria-checked'), 'true');
  assert.ok(await page.locator('[data-target="building-paths.guestBanner"]').isVisible());
  await choose('have', 'embassy', '20');
  await page.waitForFunction(() => location.search.includes('embassy:20'));
  assert.equal((await saved()).embassy, '14', 'guest edits stay off the save');
  await page.locator('[data-action="building-paths.guest"]').click();
  await page.waitForURL(url => !/guest/.test(url.search));
  await page.waitForFunction(() => document.querySelector('[data-action="building-paths.guest"]').getAttribute('aria-checked') === 'false');

  // A link with levels opens in guest mode and never touches the save.
  const before = await saved();
  await open('?lang=en&goal=barracks:TG3&have=town-center:TG1,barracks:TG1');
  assert.ok(await page.locator('[data-target="building-paths.guestBanner"]').isVisible());
  assert.ok(await page.locator('[data-target="building-paths.addGoal"]').isHidden());
  await choose('have', 'embassy', 'TG 2');
  await page.waitForFunction(() => location.search.includes('embassy:TG2'));
  assert.deepEqual(await saved(), before);
  // A plain link uses the reader's own levels.
  await open('?lang=en&goal=town-center:15');
  assert.ok(await page.locator('[data-target="building-paths.guestBanner"]').isHidden());
  assert.equal(await headline(), 'Town Center 15 · upgrades: 5', 'the stable forgotten above is assumed again');
  await choose('have', 'town-center', '15');
  await page.waitForFunction(() => document.querySelector('.reqs-headline').textContent === 'Your Town Center 15 is already done.');

  // Construction speed shortens the time and rides in the link.
  await open('?lang=en&b=town-center&to=20&speed=100');
  assert.match(await page.locator('.reqs-time').innerText(), /at \+100% construction speed/);

  // Every language at phone width: translated, no sideways scroll.
  await page.setViewportSize({ width: 320, height: 800 });
  for (const lang of fs.readdirSync('i18n').filter(f => f.endsWith('.js')).map(f => f.slice(0, -3))) {
    await open('?lang=' + lang + '&goal=town-center:TG2,barracks:TG2');
    await page.waitForFunction(lang => document.documentElement.lang === lang, lang);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), lang + ' overflows at 320');
    if (lang !== 'en') assert.doesNotMatch(await page.locator('#top h1').innerText(), /Building requirements/i, lang);
    if (['en', 'pt-BR', 'ar'].includes(lang)) await page.screenshot({ path: path.join(output, lang + '-320.png'), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await open('?lang=en&goal=town-center:TG2,barracks:TG2');
  await page.screenshot({ path: path.join(output, 'en-1280.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('building requirements UI ok');
});
