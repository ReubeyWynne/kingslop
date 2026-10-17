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
      assert.equal(await page.locator('[data-target="town-centre.coverage"]').textContent(), 'Partial estimate. Missing counts or levels are excluded.');
      const missing = page.locator('#missing-details');
      assert.equal(await missing.evaluate(node => node.open), false);
      assert.equal(await missing.locator('li').count(), await page.evaluate(() => TownCentre.best(PlayerLedger.shared().snapshot(), 'prep').unknown.length));
      await missing.locator('summary').click();
      assert.match(await missing.textContent(), /General speedups/);
      assert.match(await missing.textContent(), /Governor charm levels and materials/);
      assert.doesNotMatch(await missing.textContent(), /\d+ more/);
      await missing.locator('summary').click();

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
      assert.equal(await missing.locator('li').count(), await page.evaluate(() => TownCentre.best(PlayerLedger.shared().snapshot(), 'sg').unknown.length));

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

      // Buildings: a level per building, and Truegold scores only what those levels can take.
      await page.locator('[aria-controls="town-buildings"]').click();
      assert.equal(await page.locator('#town-buildings').isVisible(), true);
      assert.equal(await page.locator('#town-buildings [data-building]').count(), 9);
      assert.match(await page.locator('[data-target="town-inventory.buildingSpend"]').textContent(), /Set your building levels/);
      await edit('#town-buildings [data-count="truegold"]'); await dialog.locator('[data-field="count"]').fill('1000'); await done();
      await page.evaluate(() => { const store = PlayerLedger.shared(); for (const id of ['embassy', 'barracks', 'range', 'stable', 'command-center', 'infirmary', 'war-academy']) store.setBuilding(id, 'TG 3'); store.setBuilding('academy', '30'); for (const id of ['bread', 'wood', 'stone', 'iron']) store.setBalance(id, 1e9); });
      await edit('#town-buildings [data-building="town-center"]');
      assert.equal(await dialog.locator('select[data-field="building"] option').count(), 81, 'not set, then 1 to TG 10');
      await dialog.locator('select[data-field="building"]').selectOption('TG 2');
      await dialog.locator('[data-action="town-inventory.buildingStep"][data-step="1"]').click();
      assert.equal((await ledger()).buildings.levels['town-center'], 'TG2-1');
      await dialog.locator('select[data-field="building"]').selectOption('TG 3');
      assert.match(await dialog.locator('[data-target="town-inventory.buildingPlan"]').textContent(), /reach TG3-3: 3 steps, 840 Truegold/);
      await done();
      assert.equal(await page.locator('[data-building="town-center"] [data-level]').textContent(), 'TG 3');
      assert.match(await page.locator('[data-target="town-inventory.buildingSpend"]').textContent(), /840 of 1,000 Truegold/);
      assert.equal(await page.evaluate(() => TownCentre.best(PlayerLedger.shared().snapshot(), 'prep').lines.find(l => l.id === 'truegold').points), 840 * 2000);
      await edit('#town-buildings [data-building="war-academy"]');
      await dialog.locator('[data-action="town-inventory.clear"]').click();
      assert.equal((await ledger()).buildings.levels['war-academy'], undefined);
      await done();
      assert.equal(await page.locator('[data-building="war-academy"]').getAttribute('data-state'), 'unknown');

      // Troops: training facts on tiles, the capacity buff as a switch, and the troop day they score on.
      await page.locator('[aria-controls="town-troops"]').click();
      assert.equal(await page.locator('#town-troops [data-training]').count(), 9);
      assert.equal(await page.locator('#town-troops [data-target="town-inventory.troopResult"]').isHidden(), true);
      assert.match(await page.locator('[data-target="town-inventory.troopPlan"]').textContent(), /Set your training speed/);
      await edit('#town-troops [data-training="speed"]'); await dialog.locator('[data-field="training"]').fill('150'); await done();
      await edit('#town-troops [data-training="capacity"]'); await dialog.locator('[data-field="training"]').fill('1000'); await done();
      await edit('#town-troops [data-training="inf"]'); await dialog.locator('select[data-field="tier"]').selectOption('10'); await done();
      assert.deepEqual((await ledger()).training.facts, { speed: 150, capacity: 1000, inf: 10 });
      assert.equal(await page.locator('[data-training="speed"] [data-amount]').textContent(), '150%');
      assert.equal(await page.locator('[data-training="inf"] [data-amount]').textContent(), 'T10');
      const troopText = key => page.locator('[data-target="town-inventory.' + key + '"]').textContent();
      const troopRows = () => page.locator('[data-target="town-inventory.troopLines"] tr').evaluateAll(rows => rows.map(row => Array.from(row.children, cell => cell.textContent)));
      assert.match(await troopText('troopTitle'), /, day 4$/);
      assert.deepEqual((await troopRows())[0], ['T10 troops, pre-trained', '1,000', '39', '39,000']);
      assert.equal(await troopText('troopPlan'), '');
      await page.locator('#town-troops [data-action="town-inventory.buff"]').click();
      assert.equal((await ledger()).preferences.training.buff, true);
      assert.equal(await page.locator('#town-troops [data-action="town-inventory.buff"]').getAttribute('aria-pressed'), 'true');
      assert.deepEqual((await troopRows())[0], ['T10 troops, tripled batch', '3,000', '39', '117,000']);
      assert.equal(await troopText('troopTakes'), '2d 2h 40m', '3,000 T10 at 152 s each, 150% faster');
      assert.match(await troopText('troopStartAt'), /\d\d:\d\d UTC$/);
      assert.equal(await troopText('troopSpeed'), '150%');
      // Buffs: a castle position speeds up the batch; Mobilize only the KvK prep day's speedup training.
      assert.equal(await page.locator('[data-training="position"]').getAttribute('data-state'), 'off');
      await edit('#town-troops [data-training="position"]'); await dialog.locator('[data-field="training"]').fill('50'); await done();
      await edit('#town-troops [data-training="mobilize"]'); await dialog.locator('[data-field="training"]').fill('25'); await done();
      assert.equal(await page.locator('[data-training="position"] [data-amount]').textContent(), '+50%');
      assert.equal(await troopText('troopTakes'), '1d 18h 14m', '3,000 T10 at 152 s each, 200% faster');
      assert.equal(await troopText('troopSpeed'), '200%', 'Mobilize adds nothing outside KvK prep');
      await page.locator('[data-value="prep"][data-action="tabs.select"]').click();
      assert.match(await troopText('troopTitle'), /KvK prep, day 4$/);
      assert.equal(await troopText('troopSpeed'), '200%, 225% on the day');
      for (const id of ['position', 'mobilize']) { await edit('#town-troops [data-training="' + id + '"]'); await dialog.locator('[data-action="town-inventory.clear"]').click(); await done(); }
      assert.equal(await troopText('troopSpeed'), '150%');
      assert.equal(await page.evaluate(() => TownCentre.best(PlayerLedger.shared().snapshot(), 'prep').lines.find(l => l.id === 'troops-batch-t10').points), 3000 * 60);
      await page.locator('#town-troops [data-action="town-inventory.buff"]').click();
      assert.equal((await ledger()).preferences.training, undefined);
      await edit('#town-troops [data-training="capacity"]'); await dialog.locator('[data-action="town-inventory.clear"]').click(); await done();
      assert.equal(await page.locator('[data-training="capacity"]').getAttribute('data-state'), 'unknown');

      // Persisted, and the governor page reads the same save.
      await page.reload(); await page.waitForFunction(() => document.querySelector('.town-daybar'));
      assert.equal(await page.locator('#town-bag [data-count="mithril"] [data-amount]').textContent(), '10');
      assert.equal(await page.locator('[data-building="town-center"] [data-level]').textContent(), 'TG 3');
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
    console.log('Town Centre UI: bag tiles, speedups, building levels and Truegold, troop training, heroes, hero gear per troop, the governor profile, event totals, persistence, shared save, deep links, RTL and widths pass.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
