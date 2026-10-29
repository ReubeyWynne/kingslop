const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
withBrowser({ root: path.resolve('_site') }, async ({ browser, origin }) => {
  const out = path.resolve('.dsh/vikings-preview'); fs.mkdirSync(out, { recursive: true });
  for (const width of [320, 390, 768, 1280]) for (const lang of ['en', 'ar']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' }), page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + '/vikings-vengeance/?lang=' + lang);
    await page.getByRole('button', { name: 'Try an example' }).click();
    await page.getByRole('heading', { name: 'Rowan · your marches' }).waitFor();
    assert.equal(await page.locator('#my-plan .vv-march').count(), 3);
    assert(await page.locator('#my-plan').getByText('HQ · waves 10 & 20', { exact: true }).isVisible());
    await page.getByRole('tab', { name: 'Alliance', exact: true }).click();
    await page.locator('.vv-roster').getByRole('button', { name: 'Rowan', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.locator('dialog [data-queue]').count(), 3);
    assert(await page.evaluate(() => document.querySelector('dialog').getBoundingClientRect().width <= innerWidth));
    await page.getByRole('button', { name: 'Save city marches' }).click();
    await page.getByRole('button', { name: 'Review and publish' }).click();
    await page.getByRole('button', { name: 'Publish plan', exact: true }).click();
    assert(await page.getByText(/Published revision 1/).isVisible());
    await page.getByRole('tab', { name: 'My plan', exact: true }).click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    assert(await page.locator('main img').evaluateAll(images => images.every(image => !image.offsetParent || image.complete && image.naturalWidth > 0)));
    await page.screenshot({ path: path.join(out, lang + '-' + width + '.png'), fullPage: true });
    await context.close();
  }
  const context = await browser.newContext({ javaScriptEnabled: false }), page = await context.newPage();
  await page.goto(origin + '/vikings-vengeance/');
  assert(await page.locator('#vikings-guide').isVisible());
  await page.locator('#online summary').click();
  assert(await page.locator('#online p').first().isVisible());
  await context.close();
});
