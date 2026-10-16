const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve('_site'), output = path.resolve('.dsh/town-preview');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep) && file !== root) return res.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return res.writeHead(404).end();
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
});
const num = text => Number(String(text).replace(/[^0-9]/g, '')) || 0;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port, browser = await chromium.launch({ headless: true });
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const width of [320, 390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' }), page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const ledger = () => page.evaluate(() => PlayerLedger.shared().snapshot());
      const prep = () => page.locator('[data-event-total="prep"]').textContent().then(num);
      await page.goto(origin + '/town-centre/?lang=en'); await page.waitForFunction(() => document.querySelector('.town-daybar'));
      assert.equal(await prep(), 0);
      assert.equal(await page.locator('.town-days li').count(), 5);
      assert.match(await page.locator('[data-target="town-centre.coverage"]').textContent(), /^Partial/);

      // Bag counts write the shared ledger and score on their best day.
      await page.locator('#town-bag input[data-bind="inventory.mithril"]').fill('10');
      assert.equal((await ledger()).inventory.mithril.amount, 10);
      assert.equal(await prep(), 400000);
      assert.match(await page.locator('[data-rate="mithril"]').textContent(), /40,000/);

      // Speedups: days, hours and minutes are stored as minutes and score per minute.
      await page.locator('[aria-controls="town-speedups"]').click();
      assert.equal(await page.locator('#town-speedups').isVisible(), true);
      assert.equal(await page.locator('#town-bag').isVisible(), false);
      const general = page.locator('[data-speedup="speedup-general"]');
      await general.locator('[data-unit="d"]').fill('1'); await general.locator('[data-unit="h"]').fill('2'); await general.locator('[data-unit="m"]').fill('90');
      await general.locator('[data-unit="m"]').blur();
      assert.equal((await ledger()).inventory['speedup-general'].amount, 1440 + 120 + 90);
      assert.equal(await general.locator('[data-unit="h"]').inputValue(), '3');
      assert.equal(await general.locator('[data-unit="m"]').inputValue(), '30');
      assert.equal(await prep(), 400000 + 1650 * 30);

      // Days are choices: the selected day lists its lines.
      await page.locator('.town-daybar[data-day="1"]').click();
      assert.equal(await page.locator('.town-daybar[data-day="1"]').getAttribute('aria-pressed'), 'true');
      assert.match(await page.locator('[data-target="town-centre.lines"]').textContent(), /General/);
      await page.locator('.town-events [data-value="sg"]').click();
      assert.equal(await page.locator('.town-days li').count(), 7);

      // Hero gear pieces go through the hero gear adapter.
      await page.locator('[aria-controls="town-hero-gear"]').click();
      const helm = page.locator('[data-piece="inf-helm"]');
      await helm.locator('[data-field="quality"]').selectOption('red');
      await helm.locator('[data-field="level"]').fill('120'); await helm.locator('[data-field="level"]').blur();
      const piece = (await ledger()).heroGear.pieces['inf-helm'];
      assert.equal(piece.quality, 'red'); assert.equal(piece.level, 120); assert.ok(piece.mastery >= 11);
      assert.equal(await helm.getAttribute('data-state'), 'set');
      assert.equal((await ledger()).heroGear.pieces['cav-helm'], undefined, 'other pieces stay unknown');

      // Governor levels and materials score through the governor planner.
      await page.locator('[aria-controls="town-governor"]').click();
      await page.locator('select[data-item="inf-1-1"]').selectOption('0');
      await page.locator('#town-governor input[data-bind="inventory.charm-guide"]').fill('5');
      await page.locator('#town-governor input[data-bind="inventory.charm-design"]').fill('5');
      assert.equal((await ledger()).governorCharms.slots['inf-1-1'].level, 0);
      const before = num(await page.locator('[data-event-total="sg"]').textContent());
      assert.ok(before >= 400000 + 625 * 70, 'charm score counts in Strongest Governor');
      assert.match(await page.locator('[data-target="town-governor.gain"]').textContent(), /625 charm score/);

      // Persisted, and the governor page reads the same save.
      await page.reload(); await page.waitForFunction(() => document.querySelector('.town-daybar'));
      assert.equal(await page.locator('#town-bag input[data-bind="inventory.mithril"]').inputValue(), '10');
      const other = await context.newPage(); await other.goto(origin + '/governor-gear/?lang=en');
      await other.waitForFunction(() => !document.querySelector('.gov-board').disabled);
      assert.equal(await other.locator('#governor-bag input[data-bind="inventory.charm-guide"]').inputValue(), '5');
      await other.close();

      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, 'no sideways scroll at ' + width);
      await page.screenshot({ path: path.join(output, `town-${width}.png`), fullPage: true });
      assert.deepEqual(errors, []);
      await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } }), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/town-centre/?lang=ar'); await page.waitForFunction(() => document.querySelector('.town-daybar'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    await page.goto(origin + '/town-centre/#town-governor'); await page.waitForTimeout(300);
    assert.equal(await page.locator('#town-governor').isVisible(), true, 'a shelf link selects its tab');
    assert.deepEqual(errors, []);
    await context.close();
    console.log('Town Centre UI: bag, speedups, hero gear, governor, event totals, persistence, shared save, deep links, RTL and widths pass.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
