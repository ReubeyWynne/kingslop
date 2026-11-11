// The Fantasy Theater page in a browser: both URLs, the amulet answer, the shop plan, the
// stock override and the layout at phone and desktop widths.
// Run after a build: node .dsh/seasonal-theater-ui-check.cjs   (SITE_ROOT for another build)
const assert = require('node:assert/strict');
const path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
withBrowser({ root: path.resolve(process.env.SITE_ROOT || '_site') }, async ({ browser, origin }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [], failures = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
  page.on('response', response => { if (new URL(response.url()).origin === origin && response.status() >= 400) failures.push(response.url()); });
  const headline = () => page.locator('.theater-page .candy-headline strong').textContent();
  for (const url of ['/seasonal/', '/seasonal/fantasy-theater/']) {
    await page.goto(origin + url + '?lang=en');
    // The static calculation table has rows before Alpine runs, so wait for the pack rows Alpine draws.
    await page.waitForFunction(() => window.Alpine && document.querySelector('#price tbody tr'));
    await page.waitForFunction(() => document.querySelector('.theater-page .candy-headline strong').textContent === '21,614', null, { timeout: 5000 }).catch(() => {});
    assert.equal(await headline(), '21,614', 'headline on ' + url + '; page errors: ' + JSON.stringify(errors));
    assert.equal(await page.locator('.theater-page .candy-value').getAttribute('data-example'), 'Example');
  }
  await page.fill('#held-amulets', '0');
  await page.waitForFunction(() => document.querySelector('.theater-page .candy-headline strong').textContent === '0');
  assert.equal(await page.locator('.theater-page .candy-value').getAttribute('data-example'), null);
  await page.locator('#shop input[type="number"]').first().fill('5000');
  await page.waitForFunction(() => document.querySelector('.theater-buys li'));
  assert.match(await page.locator('.theater-buys li').first().textContent(), /6 ×\s*Mithril/);
  assert.match(await page.locator('.candy-income-total').first().textContent(), /640,000/);
  await page.locator('#shop-lines > summary').click();
  const mithril = page.locator('input.theater-left[aria-label="Left: Mithril, Gold row"]');
  await mithril.fill('2'); await mithril.dispatchEvent('change');
  await page.waitForFunction(() => /2 ×\s*Mithril/.test(document.querySelector('.theater-buys li').textContent));
  const ids = await page.evaluate(() => [...document.querySelectorAll('main [id]')].map(n => n.id)); assert.equal(ids.length, new Set(ids).size);
  for (const id of await page.evaluate(() => [...document.querySelectorAll('main details')].map(d => d.id))) assert.ok(id, 'every disclosure has an id');
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll at ' + width);
  }
  assert.deepEqual(errors, []); assert.deepEqual(failures, []);
  await context.close();
  console.log('Fantasy Theater: both URLs, amulet value, shop plan, stock override and layout passed.');
}).catch(error => { console.error(error); process.exitCode = 1; });
