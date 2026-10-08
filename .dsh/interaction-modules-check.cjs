const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const markup = `<!doctype html><html><body>
<section id="ledger" data-module="ledger-form" data-saved-key="saved" data-save-failed-key="failed">
<input id="hammers" type="number" min="0" max="1000000000" step="1" data-bind="inventory.forgehammer" data-action="ledger-form.set ledger-form.normalize">
<input id="parts" type="number" min="0" max="10000000" step="1" data-bind="heroGear.parts.ten" data-action="ledger-form.set ledger-form.normalize">
<output id="amount" data-bind="inventory.forgehammer"></output><output data-target="ledger-form.save"></output>
<section id="nested" data-module="ledger-form"><input id="mithril" type="number" min="0" step="1" data-bind="inventory.mithril" data-action="ledger-form.set"></section>
</section>
<details id="save" data-module="save-transfer disclosure" data-import-success="loaded" data-import-failure="invalid"><summary>Save</summary><button id="export" data-action="save-transfer.export">Export</button><button id="choose" data-action="save-transfer.choose">Import</button><input id="file" type="file" data-action="save-transfer.import" data-target="save-transfer.file"></details>
<output id="result" data-module="result-panel" data-target="result-panel.message" hidden></output>
<div id="tabs" data-module="tabs" data-tabs-bind="mode" role="tablist"><button role="tab" data-value="one" data-action="tabs.select" aria-selected="true">One</button><button role="tab" data-value="two" data-action="tabs.select" aria-selected="false" tabindex="-1">Two</button></div>
<div id="disclosure" data-module="disclosure"><button id="toggle" data-action="disclosure.toggle" aria-expanded="false">Toggle</button><p id="panel" data-target="disclosure.panel" hidden>Panel</p></div>
<script src="/js/player-ledger.js"></script><script src="/js/interactions.js"></script><script src="/js/player-modules.js"></script>
<script>window.errors=[];document.addEventListener('module:error',e=>errors.push(e.detail));window.testAPI={fmt:n=>new Intl.NumberFormat('en-GB').format(n),tr:(key,fallback)=>({saved:'Saved',failed:'Failed',loaded:'Loaded',invalid:'Invalid'})[key]||fallback,fill:(text)=>text};Interactions.start(testAPI);</script>
</body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === '/') return res.writeHead(200, { 'Content-Type': 'text/html' }).end(markup);
  const file = path.resolve('.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(path.resolve('js') + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': 'text/javascript' }); fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:' + server.address().port);
    assert.equal(await page.locator('#hammers').inputValue(), '');
    assert.equal(await page.locator('#amount').textContent(), '—');
    await page.evaluate(() => { window.edits = []; document.addEventListener('ledger-form:edited', e => edits.push(e.detail)); Interactions.start(testAPI); });
    await page.locator('#hammers').fill('1234');
    assert.equal(await page.locator('#amount').textContent(), '1,234');
    assert.equal(await page.evaluate(() => edits.length), 1, 'boot twice does not duplicate actions');
    await page.locator('#mithril').fill('12');
    assert.equal(await page.evaluate(() => edits.length), 2, 'nested roots receive one action');
    await page.locator('#hammers').fill('-1');
    assert.equal(await page.evaluate(() => PlayerLedger.shared().balance('forgehammer').amount), 1234);
    await page.locator('#hammers').press('Tab');
    assert.equal(await page.locator('#hammers').inputValue(), '1234');
    await page.locator('#hammers').fill('');
    assert.equal(await page.evaluate(() => PlayerLedger.shared().balance('forgehammer').amount), null);
    await page.locator('#parts').fill('7');
    assert.equal(await page.evaluate(() => PlayerLedger.shared().balance('hero-gear-xp').amount), 70);
    await page.evaluate(() => { window.selections = []; document.addEventListener('tabs:select', e => selections.push(e.detail)); });
    await page.locator('#tabs button').first().focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#tabs button').last().getAttribute('aria-selected'), 'true');
    await page.evaluate(() => document.documentElement.dir = 'rtl'); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#tabs button').first().getAttribute('aria-selected'), 'true');
    await page.locator('#toggle').click();
    assert.equal(await page.locator('#panel').isVisible(), true);
    assert.equal(await page.locator('#toggle').getAttribute('aria-expanded'), 'true');
    await page.evaluate(() => { document.dispatchEvent(new CustomEvent('player-status', { detail: { scope: 'other', key: 'loaded' } })); });
    assert.equal(await page.locator('#result').isVisible(), false);
    await page.locator('#save summary').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
    const backup = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(download.suggestedFilename(), 'kingshot-player.json');
    assert.equal(backup.inventory.mithril.amount, 12);
    backup.inventory.mithril.amount = 19;
    await page.locator('#file').setInputFiles({ name: 'player.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await page.waitForFunction(() => PlayerLedger.shared().balance('mithril').amount === 19);
    assert.equal(await page.locator('#result').textContent(), 'Loaded');
    backup.schemaVersion = 99;
    await page.locator('#file').setInputFiles({ name: 'future.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await page.waitForFunction(() => document.getElementById('result').textContent === 'Invalid');
    assert.equal(await page.evaluate(() => PlayerLedger.shared().balance('mithril').amount), 19);
    await page.evaluate(() => {
      const node = document.createElement('div'); node.id = 'dynamic'; node.dataset.module = 'ledger-form';
      node.innerHTML = '<output data-bind="inventory.mithril"></output>'; document.body.append(node);
    });
    await page.waitForFunction(() => document.querySelector('#dynamic output').textContent === '19');
    await page.evaluate(() => { window.detached = document.getElementById('dynamic'); detached.remove(); });
    await page.waitForTimeout(0);
    await page.evaluate(() => PlayerLedger.shared().setBalance('mithril', 20));
    assert.equal(await page.evaluate(() => detached.textContent), '19', 'removed modules unsubscribe');
    await page.evaluate(() => { const node = document.createElement('div'); node.id = 'late'; node.dataset.module = 'later'; document.body.append(node); Interactions.register('later', c => ({ refresh: () => { c.root.textContent = 'Mounted'; } })); });
    await page.waitForFunction(() => document.getElementById('late').textContent === 'Mounted');
    assert.deepEqual(await page.evaluate(() => errors), []);
    await page.evaluate(() => Interactions.destroy());
    await page.locator('#mithril').fill('25');
    assert.equal(await page.evaluate(() => PlayerLedger.shared().balance('mithril').amount), 20);
    console.log('Module isolation, idempotent boot, bindings, unknown/invalid inputs, RTL tabs, disclosure, scoped results, save transfer, dynamic discovery and cleanup passed.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
