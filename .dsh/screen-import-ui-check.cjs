// The site-wide screenshot import dock in Chromium, through the production OCR
// worker and the owner's Overview screenshots: pick, read, review, correct,
// apply, undo, and a review that survives moving to another page.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve('_site');
const output = path.resolve('.dsh/import-preview');
const fixture = name => path.resolve('.dsh/import-fixtures', name + '.jpg');
const server = http.createServer((request, response) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return response.writeHead(404).end();
  response.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});
(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(base + '/town-centre/?lang=en');
    assert.equal(await page.locator('#screen-import').isHidden(), true, 'the dock stays out of the way until there is something to read');
    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-screen-import="pick"]').click();
    await (await chooser).setFiles([fixture('overview-resources'), fixture('overview-speedups')]);
    // A device without the models downloads them once, with a bar that says how far it has got.
    await page.locator('#screen-import [data-target~="screen-import.status"]', { hasText: 'Downloading the reading models' }).waitFor({ timeout: 120000 });
    assert.equal(await page.locator('#screen-import [data-target~="screen-import.progress"]').isVisible(), true, 'the download shows its progress');
    await page.screenshot({ path: path.join(output, 'downloading-390.png') });
    await page.locator('.import-tile').first().waitFor({ timeout: 240000 });
    await page.locator('#screen-import [data-target~="screen-import.count"]', { hasText: '2 to review' }).waitFor({ timeout: 240000 });
    await page.screenshot({ path: path.join(output, 'review-resources-390.png') });
    const tiles = () => page.locator('.import-tile').evaluateAll(list => Promise.all(list.map(async li => {
      // A freshly rendered cut-out may still be decoding.
      const img = li.querySelector('img');
      await img.decode().catch(() => {});
      return { key: li.dataset.key, value: li.querySelector('[data-field="value"]').value, state: li.dataset.state, crop: img.naturalWidth > 0 };
    })));
    const first = await tiles();
    const screen = await page.locator('[data-target~="screen-import.screen"]').textContent();
    const resources = screen.includes('Resources') ? first : null;
    // Either shot may finish first; walk to the resources one.
    if (!resources) await page.locator('[data-action~="screen-import.next"]').click();
    const res = Object.fromEntries((await tiles()).map(t => [t.key, t]));
    assert.deepEqual(Object.keys(res), ['bread', 'wood', 'stone', 'iron']);
    assert.equal(res.bread.value, '805,510,000', 'values are grouped the way the page language writes them');
    assert.ok(Object.values(res).every(t => t.state === 'sure' && t.crop), 'every value carries its cut-out');

    // Correct one value, untick another, apply.
    await page.locator('.import-tile[data-key="wood"] [data-field="value"]').fill('766,000,000');
    await page.locator('.import-tile[data-key="wood"] [data-field="value"]').press('Enter');
    assert.equal(await page.locator('.import-tile[data-key="wood"] [data-field="value"]').inputValue(), '766,000,000', 'a typed number is read with its separators');
    await page.locator('.import-tile[data-key="iron"] [data-field="include"]').uncheck();
    await page.locator('[data-action~="screen-import.apply"]').click();
    await page.locator('[data-target~="screen-import.status"]', { hasText: 'Saved 3 values' }).waitFor();
    const balances = await page.evaluate(() => { const s = PlayerLedger.shared(); return ['bread', 'wood', 'stone', 'iron'].map(id => s.balance(id)); });
    assert.deepEqual(balances.map(b => b.amount), [805510000, 766000000, 112750000, null]);
    assert.equal(balances[0].provenance.source, 'screenshot');

    // The speedups shot waits on the next page, review and all.
    await page.goto(base + '/events/?lang=en');
    await page.locator('#screen-import .import-chip', { hasText: '1 to review' }).waitFor({ timeout: 30000 });
    await page.locator('#screen-import .import-chip').click();
    await page.screenshot({ path: path.join(output, 'review-speedups-390.png') });
    const spd = Object.fromEntries((await tiles()).map(t => [t.key, t.value]));
    assert.equal(spd['speedup-general'], (17 * 1440 + 20 * 60 + 1).toLocaleString('en-GB'));
    assert.equal(spd['speedup-learning'], '720');
    await page.locator('[data-action~="screen-import.apply"]').click();
    await page.locator('[data-target~="screen-import.status"]', { hasText: 'Saved 6 values' }).waitFor();
    assert.equal(await page.evaluate(() => PlayerLedger.shared().balance('speedup-healing').amount), 8 * 1440 + 645);
    await page.locator('[data-action~="screen-import.undo"]').click();
    assert.equal(await page.evaluate(() => PlayerLedger.shared().balance('speedup-healing').amount), null, 'undo restores the save before the apply');

    // A file already applied is refused before it is read again.
    await page.locator('#screen-import [data-target~="screen-import.files"]').setInputFiles(fixture('overview-resources'));
    await page.locator('[data-target~="screen-import.status"]', { hasText: 'already applied' }).waitFor();

    // The models are on this device now: later reads say which shot they are on, not that a download is coming.
    const said = [];
    await page.exposeFunction('importStatus', text => said.push(text));
    await page.evaluate(() => { const node = document.querySelector('[data-target~="screen-import.status"]'); new MutationObserver(() => window.importStatus(node.textContent)).observe(node, { childList: true, characterData: true, subtree: true }); });

    // Backpack tiles: icons matched to event items, counts read enlarged. The
    // two shots come from different moments; the later file wins.
    await page.locator('#screen-import [data-target~="screen-import.files"]').setInputFiles([fixture('other-a2'), fixture('other-c2')]);
    await page.locator('#screen-import .import-chip', { hasText: '2 to review' }).waitFor({ timeout: 240000 });
    const backpack = async () => Object.fromEntries((await tiles()).map(t => [t.key, t.value]));
    const screens = {};
    for (let i = 0; i < 2; i++) {
      const read = await backpack();
      screens[read['masters-manuscript']] = { read, include: await page.locator('.import-tile[data-key="masters-manuscript"] [data-field="include"]').isChecked(), note: await page.locator('.import-tile[data-key="masters-manuscript"] [data-field="note"]').textContent() };
      if (i === 0) { await page.screenshot({ path: path.join(output, 'review-backpack-390.png') }); await page.locator('[data-action~="screen-import.next"]').click(); }
    }
    assert.ok(said.some(text => /Reading screenshot 1 of 2/.test(text)), 'reading says which shot it is on');
    assert.ok(!said.some(text => /Downloading/.test(text)), 'a device with the models cached is not warned about a download');
    assert.deepEqual(screens['3,102'].read, { 'masters-manuscript': '3,102', 'advanced-taming-mark': '4', 'common-taming-mark': '63', mithril: '4', forgehammer: '209' });
    assert.deepEqual(screens['2,632'].read, { 'masters-manuscript': '2,632', 'advanced-taming-mark': '4', 'common-taming-mark': '60', mithril: '4', forgehammer: '201', 'mythic-hero-shard': '316', 'epic-hero-shard': '74', 'rare-hero-shard': '5' });
    assert.equal(screens['3,102'].include, false, 'an item a newer shot also shows starts unticked');
    assert.match(screens['3,102'].note, /newer shot reads 2,632/);
    assert.equal(screens['2,632'].include, true);
    // Applying the newer shot settles the older one: every item it showed was
    // superseded, so it leaves the dock rather than writing stale counts.
    if ((await backpack())['masters-manuscript'] !== '2,632') await page.locator('[data-action~="screen-import.next"]').click();
    await page.locator('[data-action~="screen-import.apply"]').click();
    await page.locator('[data-target~="screen-import.status"]', { hasText: 'Saved 8 values' }).waitFor();
    assert.equal(await page.locator('.import-tile').count(), 0, 'the superseded shot left the dock');
    assert.deepEqual(await page.evaluate(() => ['masters-manuscript', 'common-taming-mark', 'forgehammer', 'mythic-hero-shard'].map(id => PlayerLedger.shared().balance(id).amount)), [2632, 60, 201, 316]);

    // Gen widget chests look alike; the S2 and S3 badges and the contents tell them apart.
    await page.locator('#screen-import [data-target~="screen-import.files"]').setInputFiles(fixture('other-d1'));
    await page.locator('.import-tile[data-key="hero-widget-chest-gen1"]').waitFor({ timeout: 240000 });
    assert.deepEqual(await backpack(), { 'hero-widget-chest-gen3': '4', 'hero-widget-chest-gen2': '4', 'hero-widget-chest-gen1': '34' });
    await page.locator('[data-action~="screen-import.discard"]').click();

    // Pet List: portraits told apart by colour, levels read from their corners.
    await page.locator('#screen-import [data-target~="screen-import.files"]').setInputFiles(fixture('pet-list'));
    await page.locator('.import-tile[data-key="lion"]').waitFor({ timeout: 240000 });
    await page.screenshot({ path: path.join(output, 'review-pets-390.png') });
    assert.deepEqual(await backpack(), { lion: '70', 'grizzly-bear': '26', moose: '50', cheetah: '50', bison: '60', lynx: '40', 'gray-wolf': '50' });
    await page.locator('[data-action~="screen-import.apply"]').click();
    await page.locator('[data-target~="screen-import.status"]', { hasText: 'Saved 7 values' }).waitFor();
    assert.deepEqual(await page.evaluate(() => PlayerLedger.shared().pets().roster.bison), { level: 60, advanced: false });

    const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const wide = await desktop.newPage();
    await wide.goto(base + '/town-centre/?lang=de');
    await wide.locator('#screen-import [data-target~="screen-import.files"]').setInputFiles(fixture('overview-speedups'));
    await wide.locator('.import-tile').first().waitFor({ timeout: 240000 });
    assert.equal(await wide.locator('.import-tile[data-key="speedup-general"] [data-field="value"]').inputValue(), '25.681', 'German groups digits with a full stop');
    await wide.screenshot({ path: path.join(output, 'review-1280.png') });
    await desktop.close();
    assert.deepEqual(errors, []);
    console.log('Screenshot import dock: real reads of both Overview tabs and three Backpack Other shots (icons, Gen widget chests, counts, newest wins), a Pet List (portraits, levels), cut-outs, correction, untick, apply, undo, duplicate refusal and a review carried to another page passed.');
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    throw error;
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
