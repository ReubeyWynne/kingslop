const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve('_site'), output = path.resolve('.dsh/governor-preview');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep) && file !== root) return res.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return res.writeHead(404).end();
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port, browser = await chromium.launch({ headless: true });
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const width of [320, 390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' }), page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const ready = () => page.waitForFunction(() => !document.querySelector('.gov-gear-levels').disabled);
      const target = key => page.locator('[data-target="governor-planner.' + key + '"]');
      await page.goto(origin + '/governor-gear/?lang=en'); await ready();
      assert.equal(await target('count').textContent(), '0');
      assert.match(await target('status').textContent(), /6 not set/);
      await page.fill('[data-bind="inventory.satin"]', '20000'); await page.fill('[data-bind="inventory.gilded-threads"]', '200'); await page.fill('[data-bind="inventory.artisans-vision"]', '0');
      await target('fillGear').selectOption('0'); await page.click('[data-action="governor-planner.fill"][data-kind="gear"]');
      await page.selectOption('select[data-item="arc-2"]', '');
      await page.waitForFunction(() => document.querySelectorAll('.gov-steps li').length > 0);
      const steps = await page.locator('.gov-steps li .gov-step-item').allTextContents();
      assert.deepEqual(steps.slice(0, 2), ['Infantry piece 1', 'Infantry piece 2']);
      assert.ok(!steps.includes('Archer piece 2'));
      assert.match(await page.locator('.gov-steps li .gov-step-level').first().textContent(), /not crafted → Green 0★/);
      assert.match(await target('events').textContent(), /Alliance Brawl, day 5: about [\d,]+ points/);
      assert.equal(await page.locator('[data-target="governor-planner.spent"] tr').count(), 3);
      await target('focus').selectOption('cav');
      await page.waitForFunction(() => [...document.querySelectorAll('.gov-steps .gov-step-item')].every(n => n.textContent.startsWith('Cavalry')));
      await page.click('[role="tab"][data-value="charms"]');
      await page.waitForFunction(() => document.querySelector('[data-target="governor-planner.count"]').textContent === '0');
      assert.match(await target('status').textContent(), /not set/);
      await page.click('[role="tab"][data-value="gear"]');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, 'no sideways scroll at ' + width);
      await page.screenshot({ path: path.join(output, width + '.png'), fullPage: true });
      await page.reload(); await ready();
      assert.equal(await page.locator('select[data-item="inf-1"]').inputValue(), '0');
      assert.equal(await page.locator('select[data-item="arc-2"]').inputValue(), '');
      assert.equal(await target('focus').inputValue(), 'cav');
      assert.equal(await page.locator('[data-bind="inventory.satin"]').inputValue(), '20000');
      const other = await context.newPage(); await other.goto(origin + '/hero-gear/?lang=en');
      await other.locator('#gear-mithril').fill('7');
      await page.click('[data-action="governor-planner.reset"]');
      await page.waitForFunction(() => document.querySelector('select[data-item="inf-1"]').value === '');
      assert.match(await page.locator('#governor-save [data-target="result-panel.message"]').textContent(), /cleared/);
      assert.equal(await page.evaluate(() => PlayerLedger.shared().balance('mithril').amount), 7);
      assert.deepEqual(errors, []);
      await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } }), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/governor-gear/?lang=ar'); await page.waitForFunction(() => !document.querySelector('.gov-gear-levels').disabled);
    assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    await page.goto(origin + '/?lang=en'); await page.waitForFunction(() => window.BH);
    assert.equal(await page.locator('a.event-card[href="governor-gear/"]').count(), 1);
    assert.deepEqual(errors, []);
    await context.close();
    console.log('Governor gear UI: planning, focus, tabs, persistence, shared bag, reset, RTL and widths pass.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
