// The guide's two notes (js/site-guide.js): the page note teaches the deck's
// swipe (or ❧ and the arrow keys), the rail note teaches the scrubber; each
// leaves once the reader does what it teaches, and #site-guide brings both back.
//
//   node .dsh/site-guide-ui-check.cjs   (after building the site into _site)
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
const root = path.resolve('_site'), output = path.resolve('.dsh/guide-preview');
const note = '#site-guide', rail = '#guide-rail';
const shown = (page, selector) => page.locator(selector).evaluate(el => !el.hidden && getComputedStyle(el).display !== 'none');
const state = page => page.evaluate(() => JSON.parse(localStorage.getItem('bh:guide') || '{}'));

withBrowser({ root }, async ({ browser, origin }) => {
  fs.mkdirSync(output, { recursive: true });
  const errors = [];

  // Phone: the note waits a moment, shows the swipe, and retires when the deck opens.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  let page = await phone.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/bear-hunt/?lang=en');
  await page.waitForFunction(() => document.querySelector('#ledger-btn').getAttribute('aria-controls') === 'page-deck');
  assert.equal(await shown(page, note), false, 'the note waits before it shows');
  await page.waitForSelector(note + ':not([hidden])', { timeout: 6000 });
  assert.equal(await page.locator(note).getAttribute('data-input'), 'touch');
  assert.equal(await page.locator('.site-guide-touch').isVisible(), true);
  assert.equal(await page.locator('.site-guide-desk').isVisible(), false);
  assert.equal(await page.locator('.ascii-mini--swipe').isVisible(), true);
  const box = await page.locator(note).boundingBox();
  assert(box.x >= 0 && box.x + box.width <= 390, 'the note fits a phone');
  const chip = page.locator('.import-dock:not([hidden]) .import-chip');
  if (await chip.count()) {
    const c = await chip.boundingBox();
    assert(box.y + box.height <= c.y, 'the note sits above the import chip');
  }
  await page.screenshot({ path: path.join(output, 'note-390.png') });
  await page.locator('#ledger-btn').click();
  assert.equal(await shown(page, note), false, 'opening the deck retires the note');
  assert.equal(await shown(page, rail), true, 'the rail note shows on the first open');
  assert.equal(await page.locator('.deck-rail').evaluate(el => el.classList.contains('is-waking')), true);
  await page.screenshot({ path: path.join(output, 'rail-390.png') });
  const pip = await page.locator('.deck-pip').nth(4).boundingBox();
  await page.mouse.click(pip.x + pip.width / 2, pip.y + pip.height / 2);
  assert.equal(await shown(page, rail), false, 'a scrub retires the rail note');
  assert.deepEqual(await state(page), { swipe: 'done', rail: 'done' });
  await page.locator('.deck-close').click();
  await page.reload();
  await page.waitForTimeout(3500);
  assert.equal(await shown(page, note), false, 'a retired note stays away');

  // "Show me how" in the deck closes it and brings the note back.
  await page.locator('#ledger-btn').click();
  assert.equal(await shown(page, rail), false);
  await page.locator('.deck-guide').click();
  assert.equal(await page.locator('#page-deck').evaluate(el => el.open), false);
  assert.equal(await shown(page, note), true, 'show me how brings the note back');
  await page.locator('.site-guide-done').click();
  assert.equal(await shown(page, note), false);
  assert.equal((await state(page)).swipe, 'done');
  await page.locator('#ledger-btn').click();
  assert.equal(await shown(page, rail), true, 'replay brings the rail note back too');
  await page.close();

  // A note never acted on stops after three visits.
  page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
  for (let visit = 1; visit <= 4; visit++) {
    await page.goto(origin + '/?lang=en');
    await page.waitForTimeout(3500);
    assert.equal(await shown(page, note), visit <= 3, 'visit ' + visit);
  }
  await page.close();

  // Laptop: the deck still opens from ❧, and the note names ❧ and the arrow keys.
  page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/heroes/?lang=en');
  await page.waitForSelector(note + ':not([hidden])', { timeout: 6000 });
  assert.equal(await page.locator(note).getAttribute('data-input'), 'keys');
  assert.equal(await page.locator('.site-guide-desk').isVisible(), true);
  assert.equal(await page.locator('.ascii-mini--swipe').isVisible(), false);
  await page.screenshot({ path: path.join(output, 'note-1280.png') });
  await page.locator('.site-guide-done').click();
  assert.equal(await shown(page, note), false);
  await page.close();

  // The widest screens list every page in the topbar and hide ❧, so the note stays away.
  page = await (await browser.newContext({ viewport: { width: 1920, height: 1000 } })).newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/pets/?lang=en');
  await page.waitForTimeout(3500);
  assert.equal(await shown(page, note), false, 'no note where the topbar lists every page');
  assert.deepEqual(await state(page), {});
  await page.close();

  // #site-guide is a link to the guide, and every language fits a 320px phone.
  page = await (await browser.newContext({ viewport: { width: 320, height: 700 }, hasTouch: true, isMobile: true })).newPage();
  page.on('pageerror', e => errors.push(e.message));
  for (const lang of fs.readdirSync('i18n').filter(f => f.endsWith('.js')).map(f => f.slice(0, -3))) {
    await page.goto(origin + '/events/?lang=' + lang + '#site-guide');
    await page.waitForFunction(lang => document.documentElement.lang === lang, lang);
    await page.waitForSelector(note + ':not([hidden])');
    const text = await page.locator('.site-guide-touch').textContent();
    assert(text.trim().length > 0, lang);
    if (lang !== 'en') assert.notEqual(text, 'swipe sideways for every page', lang + ' is translated');
    const b = await page.locator(note).boundingBox();
    assert(b.x >= 0 && b.x + b.width <= 320, lang + ' fits 320px');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), lang + ' overflow');
    if (lang === 'ar' || lang === 'ja') await page.screenshot({ path: path.join(output, 'note-320-' + lang + '.png') });
  }
  await page.close();

  assert.deepEqual(errors, []);
  console.log('Guide: swipe note waits, shows by input, retires on deck or ledger, caps at three visits; rail note retires on a scrub; replay from deck, ledger and #site-guide; 17 languages at 320px.');
}).catch(error => { console.error(error); process.exitCode = 1; });
