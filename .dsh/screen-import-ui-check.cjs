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
    await page.locator('.import-tile').first().waitFor({ timeout: 240000 });
    await page.locator('#screen-import [data-target~="screen-import.count"]', { hasText: '2 to review' }).waitFor({ timeout: 240000 });
    await page.screenshot({ path: path.join(output, 'review-resources-390.png') });
    const tiles = () => page.locator('.import-tile').evaluateAll(list => list.map(li => ({ key: li.dataset.key, value: li.querySelector('[data-field="value"]').value, state: li.dataset.state, crop: li.querySelector('img').naturalWidth > 0 })));
    const first = await tiles();
    const screen = await page.locator('[data-target~="screen-import.screen"]').textContent();
    const resources = screen.includes('Resources') ? first : null;
    // Either shot may finish first; walk to the resources one.
    if (!resources) await page.locator('[data-action~="screen-import.next"]').click();
    const res = Object.fromEntries((await tiles()).map(t => [t.key, t]));
    assert.deepEqual(Object.keys(res), ['bread', 'wood', 'stone', 'iron']);
    assert.equal(res.bread.value, '805510000');
    assert.ok(Object.values(res).every(t => t.state === 'sure' && t.crop), 'every value carries its cut-out');

    // Correct one value, untick another, apply.
    await page.locator('.import-tile[data-key="wood"] [data-field="value"]').fill('766000000');
    await page.locator('.import-tile[data-key="wood"] [data-field="value"]').press('Enter');
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
    assert.equal(spd['speedup-general'], String(17 * 1440 + 20 * 60 + 1));
    assert.equal(spd['speedup-learning'], '720');
    await page.locator('[data-action~="screen-import.apply"]').click();
    await page.locator('[data-target~="screen-import.status"]', { hasText: 'Saved 6 values' }).waitFor();
    assert.equal(await page.evaluate(() => PlayerLedger.shared().balance('speedup-healing').amount), 8 * 1440 + 645);
    await page.locator('[data-action~="screen-import.undo"]').click();
    assert.equal(await page.evaluate(() => PlayerLedger.shared().balance('speedup-healing').amount), null, 'undo restores the save before the apply');

    // A file already applied is refused before it is read again.
    await page.locator('#screen-import [data-target~="screen-import.files"]').setInputFiles(fixture('overview-resources'));
    await page.locator('[data-target~="screen-import.status"]', { hasText: 'already applied' }).waitFor();

    const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const wide = await desktop.newPage();
    await wide.goto(base + '/town-centre/?lang=en');
    await wide.locator('#screen-import [data-target~="screen-import.files"]').setInputFiles(fixture('overview-speedups'));
    await wide.locator('.import-tile').first().waitFor({ timeout: 240000 });
    await wide.screenshot({ path: path.join(output, 'review-1280.png') });
    await desktop.close();
    assert.deepEqual(errors, []);
    console.log('Screenshot import dock: real reads of both Overview tabs, cut-outs, correction, untick, apply, undo, duplicate refusal and a review carried to another page passed.');
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    throw error;
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
