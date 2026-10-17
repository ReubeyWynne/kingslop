const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve('_site'), output = path.resolve('.dsh/town-preview');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
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

      // Bag tiles open one dialog; counts write the shared ledger and score on their best day.
      const dialog = page.locator('.town-dialog');
      const edit = async selector => { await page.locator(selector).click(); await dialog.waitFor({ state: 'visible' }); };
      const done = async () => { await dialog.locator('[data-action="town-inventory.close"]').click(); await dialog.waitFor({ state: 'hidden' }); };
      assert.equal(await page.locator('#town-bag input').count(), 0, 'the shelf is tiles, not fields');
      await edit('#town-bag [data-count="mithril"]');
      await dialog.locator('[data-field="count"]').fill('10');
      assert.equal((await ledger()).inventory.mithril.amount, 10);
      assert.match(await dialog.locator('[data-target="town-inventory.rate"]').textContent(), /40,000/);
      await done();
      assert.equal(await page.locator('#town-bag [data-count="mithril"] [data-amount]').textContent(), '10');
      // Mithril only scores when hero gear can take it, so with no gear saved it adds nothing yet.
      assert.equal(await prep(), 0);
      assert.ok(await page.evaluate(() => TownCentre.best(PlayerLedger.shared().snapshot(), 'prep').unknown.includes('hero-gear-pieces')), 'missing gear is listed, not zero');
      assert.equal(await page.locator('#town-bag [data-count="hero-widget"]').count(), 0, 'no single widget item');
      assert.equal(await page.locator('#town-bag [data-count^="hero-widget-chest-gen"]').count(), 7);
      assert.equal(await page.locator('#town-bag [data-count^="hero-widget-chest-gen"] .town-rate').count(), 0);
      const chestIcons = page.locator('#town-bag [data-count^="hero-widget-chest-gen"] img');
      assert.equal(await chestIcons.count(), 7);
      for (const icon of await chestIcons.all()) {
        await icon.scrollIntoViewIfNeeded();
        assert.equal(await icon.evaluate(async img => { await img.decode(); return img.naturalWidth > 0; }), true);
      }
      await edit('#town-bag [data-count="hero-widget-chest-gen3"]');
      await dialog.locator('[data-field="count"]').fill('2');
      assert.equal((await ledger()).inventory['hero-widget-chest-gen3'].amount, 2);
      assert.match(await dialog.locator('[data-target="town-inventory.rate"]').textContent(), /best 8,000 each · KvK prep day 4/);
      await done();
      assert.equal(await prep(), 0, 'chests cannot score without an eligible owned hero');

      // Speedups: days, hours and minutes are stored as minutes and score per minute.
      await page.locator('[aria-controls="town-speedups"]').click();
      assert.equal(await page.locator('#town-speedups').isVisible(), true);
      assert.equal(await page.locator('#town-bag').isVisible(), false);
      await edit('[data-duration="speedup-general"]');
      await dialog.locator('[data-unit="d"]').fill('1'); await dialog.locator('[data-unit="h"]').fill('2'); await dialog.locator('[data-unit="m"]').fill('90');
      await dialog.locator('[data-unit="m"]').blur();
      assert.equal((await ledger()).inventory['speedup-general'].amount, 1440 + 120 + 90);
      assert.equal(await dialog.locator('[data-unit="h"]').inputValue(), '3');
      assert.equal(await dialog.locator('[data-unit="m"]').inputValue(), '30');
      await done();
      assert.equal(await page.locator('[data-duration="speedup-general"] [data-amount]').textContent(), '1d 3h 30m');
      assert.equal(await prep(), 1650 * 30);
      const healingIcon = page.locator('[data-duration="speedup-healing"] img');
      await healingIcon.scrollIntoViewIfNeeded();
      assert.equal(await healingIcon.evaluate(async img => { await img.decode(); return img.naturalWidth > 0; }), true);
      await edit('[data-duration="speedup-healing"]');
      await dialog.locator('[data-action="town-inventory.clear"]').click();
      assert.equal((await ledger()).inventory['speedup-healing'].status, 'unknown');
      await done();

      // Days are choices: the selected day lists its lines.
      await page.locator('.town-daybar[data-day="1"]').click();
      assert.equal(await page.locator('.town-daybar[data-day="1"]').getAttribute('aria-pressed'), 'true');
      assert.match(await page.locator('[data-target="town-centre.lines"]').textContent(), /General/);
      await page.locator('.town-events [data-value="sg"]').click();
      assert.equal(await page.locator('.town-days li').count(), 7);

      // Hero gear: one set of four per troop type, behind troop tabs; writes go through the hero gear adapter.
      await page.locator('[aria-controls="town-hero-gear"]').click();
      assert.equal(await page.locator('[data-troop-board="inf"]').isVisible(), true);
      assert.equal(await page.locator('[data-troop-board="cav"]').isVisible(), false);
      await page.locator('.town-troops [data-value="cav"]').click();
      assert.equal(await page.locator('[data-troop-board="cav"]').isVisible(), true);
      assert.equal(await page.locator('[data-troop-board="inf"]').isVisible(), false);
      await page.locator('.town-troops [data-value="inf"]').click();
      await edit('[data-piece="inf-helm"]');
      await dialog.locator('[data-action="town-inventory.quality"][data-quality="red"]').click();
      await dialog.locator('input[data-field="level"]').fill('120'); await dialog.locator('input[data-field="level"]').blur();
      await dialog.locator('[data-action="town-inventory.step"][data-field="level"][data-step="1"]').click();
      let piece = (await ledger()).heroGear.pieces['inf-helm'];
      assert.equal(piece.quality, 'red'); assert.equal(piece.level, 121); assert.ok(piece.mastery >= 11);
      assert.equal(await dialog.locator('[data-action="town-inventory.clear"]').isVisible(), false);
      await done();
      assert.equal(await page.locator('[data-piece="inf-helm"]').getAttribute('data-state'), 'set');
      assert.equal(await page.locator('[data-piece="inf-helm"] [data-part="level"]').textContent(), '+21');
      assert.equal((await ledger()).heroGear.pieces['cav-helm'], undefined, 'other pieces stay unknown');

      // Governor: one set of six laid out as the profile; levels and materials score through the governor planner.
      await page.locator('[aria-controls="town-governor"]').click();
      assert.equal(await page.locator('.town-gov-piece').count(), 6);
      await edit('[data-count="charm-guide"]'); await dialog.locator('[data-field="count"]').fill('5'); await done();
      await edit('[data-count="charm-design"]'); await dialog.locator('[data-field="count"]').fill('5'); await done();
      await edit('[data-gov="inf-1"]');
      await dialog.locator('[data-action="town-inventory.govStep"][data-charm-slot="1"][data-step="-1"]').click();
      assert.equal((await ledger()).governorCharms.slots['inf-1-1'].level, 0);
      await dialog.locator('select[data-level="gear"]').selectOption('3');
      assert.equal((await ledger()).governorGear.pieces['inf-1'].level, 3);
      await done();
      assert.equal(await page.locator('[data-gov="inf-1"]').getAttribute('data-state'), 'set');
      assert.match(await page.locator('[data-target="town-inventory.gain"]').textContent(), /625 charm score/);
      const sg = num(await page.locator('[data-event-total="sg"]').textContent());
      assert.ok(sg >= 625 * 70, 'charm score counts in Strongest Governor');

      // Heroes: the Heroes page roster, writing the same save.
      await page.locator('.town-rail [data-value="heroes"]').click();
      assert.equal(await page.locator('#town-heroes .directory-hero').count(), 34);
      await page.locator('#town-heroes #hero-chenko summary').click();
      await page.locator('#hero-chenko [data-field="owned"]').check();
      await page.locator('#hero-chenko [data-field="level"]').fill('40'); await page.locator('#hero-chenko [data-field="level"]').press('Tab');
      assert.equal((await ledger()).heroes.roster.chenko.level, 40);
      assert.match(await page.locator('#hero-chenko [data-target~="hero-directory.badge"]').textContent(), /40/);
      assert.equal(await page.locator('#town-heroes .hero-bag').count(), 0, 'shards stay on the bag shelf');
      await page.locator('#town-heroes #hero-chenko summary').click(); await page.locator('#town-heroes #hero-amadeus summary').click();
      await page.locator('#hero-amadeus [data-field="widgets"]').fill('3'); await page.locator('#hero-amadeus [data-field="widgets"]').press('Tab');
      assert.equal((await ledger()).inventory['hero-widgets-amadeus'].amount, 3, 'each hero keeps its own widget count');
      assert.equal(await page.locator('#hero-chenko [data-field="widgets"]').count(), 0, 'no widget count for heroes without a widget');
      await page.locator('#town-heroes #hero-amadeus summary').click(); await page.locator('#town-heroes #hero-chenko summary').click();
      await page.locator('#hero-chenko [data-field="stars"]').selectOption('15'); await page.locator('#hero-chenko [data-field="shards"]').fill('7'); await page.locator('#hero-chenko [data-field="shards"]').press('Tab');
      assert.equal(await page.locator('#hero-chenko .hero-star-row [data-on]').count(), 2, 'two stars on the portrait');
      assert.equal(await page.locator('#hero-chenko .hero-star-tier [data-on]').count(), 3, 'three tier notches');
      assert.equal(await page.locator('#hero-chenko [data-portrait="shards"] b').textContent(), '7');
      assert.equal(await page.evaluate(() => new Set([...document.querySelectorAll('#town-heroes .hero-filter-row > label')].map(l => Math.round(l.getBoundingClientRect().top))).size), 1, 'filters on one line at ' + width);

      // Persisted, and the governor page reads the same save.
      await page.reload(); await page.waitForFunction(() => document.querySelector('.town-daybar'));
      assert.equal(await page.locator('#town-bag [data-count="mithril"] [data-amount]').textContent(), '10');
      const other = await context.newPage(); await other.goto(origin + '/governor-gear/?lang=en');
      await other.waitForFunction(() => !document.querySelector('.gov-board').disabled);
      assert.equal(await other.locator('#governor-bag input[data-bind="inventory.charm-guide"]').inputValue(), '5');
      assert.equal(await other.locator('.gov-tile[data-item="inf-1"]').getAttribute('data-state'), 'set');
      await other.close();
      const roster = await context.newPage(); await roster.goto(origin + '/heroes/?lang=en');
      await roster.waitForFunction(() => document.querySelector('#hero-chenko').dataset.owned === 'true');
      await roster.close();

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
    // Not a card in the ring: one fixed button in the deck, and the inventory leads.
    assert.equal(await page.locator('.deck-card[data-page="town"]').count(), 0);
    assert.equal(await page.locator('.deck-town').getAttribute('aria-current'), 'page');
    assert.ok(await page.evaluate(() => document.querySelector('#town-inventory').compareDocumentPosition(document.querySelector('#town-points')) & Node.DOCUMENT_POSITION_FOLLOWING), 'points follow the inventory');
    await page.goto(origin + '/town-centre/#hero-chenko'); await page.waitForTimeout(300);
    assert.equal(await page.locator('#hero-chenko .hero-dossier').evaluate(node => node.open && !!node.offsetParent), true, 'a hero link opens the Heroes shelf');
    assert.deepEqual(errors, []);
    await context.close();
    console.log('Town Centre UI: bag tiles, speedups, heroes, hero gear per troop, the governor profile, event totals, persistence, shared save, deep links, RTL and widths pass.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
