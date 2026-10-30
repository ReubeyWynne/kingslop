const assert = require('node:assert/strict'), path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
const root = path.resolve('_site');
withBrowser({ root }, async ({ browser, origin }) => {
  const tile = page => page.locator('[data-count="bread"] [data-amount]').textContent().then(t => t.replace(/\s/g, ' '));
  const open = async page => {
    await page.goto(origin + '/town-centre/?lang=en'); await page.waitForFunction(() => document.querySelector('.town-daybar'));
    await page.evaluate(() => PlayerLedger.shared().setBalance('bread', 1580000000));
    await page.waitForFunction(() => document.querySelector('[data-count="bread"] [data-amount]').textContent !== '?');
  };

  // A German browser reading English: English words, German numbers.
  const de = await browser.newContext({ locale: 'de-DE', reducedMotion: 'reduce' }), page = await de.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
  assert.equal(await page.locator('#lang-btn').getAttribute('aria-label'), 'Language');
  assert.equal(await tile(page), '1,58 Mrd.', 'numbers follow the browser when the text is another language');
  assert.equal(await page.locator('[data-count="bread"] [data-amount]').getAttribute('title'), '1.580.000.000');

  // Picking a format beside the language overrides it, and it is remembered.
  await page.locator('#lang-btn').click();
  const select = page.locator('#number-format');
  assert.equal(await select.inputValue(), 'auto');
  assert.match(await select.locator('option[value="auto"]').textContent(), /^Automatic · 1\.234\.567,89$/);
  await select.selectOption('en-GB');
  assert.equal(await tile(page), '1.58bn');
  assert.equal(await page.locator('#lang-menu').isVisible(), true, 'choosing a format keeps the menu open');
  await page.reload(); await page.waitForFunction(() => document.querySelector('.town-daybar'));
  assert.equal(await tile(page), '1.58bn', 'the choice survives a reload');
  await page.locator('#lang-btn').click();
  await page.locator('#number-format').selectOption('auto');
  assert.equal(await tile(page), '1,58 Mrd.');
  assert.deepEqual(errors, []);
  await de.close();

  // A browser already in the text's language keeps the site's own format.
  const us = await browser.newContext({ locale: 'en-US', reducedMotion: 'reduce' }), usPage = await us.newPage();
  await open(usPage);
  assert.equal(await tile(usPage), '1.58bn');
  await us.close();

  console.log('Number format: English text with German numbers from the browser, a picked format that persists, Automatic restored, and a same-language browser left on the site format pass.');
});
