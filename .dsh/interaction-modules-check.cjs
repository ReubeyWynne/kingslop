const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
const vm = require('node:vm');

function checkDependencies() {
  const errors = [], roots = [], selected = {}, persistent = {};
  let reads = 0, cleaned = 0, passive = 0;
  const shared = () => { throw new Error('Storage blocked'); };
  const document = {
    nodeType: 9, body: {}, querySelectorAll: () => roots,
    addEventListener() {}, removeEventListener() {}
  };
  const scope = {
    document, window: { PlayerLedger: { shared } },
    CustomEvent: class { constructor(name, options) { this.type = name; this.detail = options.detail; } },
    MutationObserver: class { observe() {} disconnect() {} }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/interactions.js'), 'utf8'), scope);
  const modules = scope.window.Interactions;
  const root = name => ({
    getAttribute: key => key === 'data-module' ? name : null,
    dispatchEvent: event => errors.push(event.detail), isConnected: true
  });
  roots.push(root('passive'), root('dependent'));
  modules.register('passive', context => { passive++; context.cleanup(() => cleaned++); });
  modules.register('dependent', context => {
    context.cleanup(() => cleaned++);
    assert.equal(context.ledger, selected);
  });
  modules.configure({ ledger: () => { reads++; return selected; } });
  assert.equal(reads, 0, 'configuration does not resolve storage');
  modules.start({});
  assert.equal(reads, 1, 'only ledger consumers resolve the provider');
  assert.equal(scope.window.PlayerLedger.shared, shared, 'configuration preserves the persistent accessor');
  assert.equal(modules.ledger(), selected, 'controllers use the same selected store');
  assert.throws(() => modules.configure({ ledger: persistent }), /before start/);
  assert.equal(passive, 1);
  assert.deepEqual(errors, []);
  modules.destroy();
  assert.equal(cleaned, 2);
  modules.configure({ ledger: undefined });
  modules.start({});
  assert.equal(passive, 2, 'a storage failure leaves independent modules mounted');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].module, 'dependent');
  assert.equal(errors[0].message, 'Storage blocked');
  assert.equal(cleaned, 3, 'a failed factory releases its subscriptions');
  modules.destroy();
  scope.window.PlayerLedger.shared = () => persistent;
  assert.equal(modules.ledger(), persistent, 'the default accessor stays lazy');
  modules.configure({ ledger: selected });
  assert.equal(modules.ledger(), selected, 'a store instance can be injected directly');
  console.log('Lazy ledger selection, persistent accessor compatibility, module-local storage failures and cleanup passed.');
}

function checkBootOrder() {
  const source = fs.readFileSync(path.join(__dirname, '../js/common.js'), 'utf8');
  for (const cached of [true, false]) {
    const calls = [], events = {};
    const document = {
      readyState: cached ? 'loading' : 'complete', documentElement: { getAttribute: () => null },
      addEventListener: (name, listener) => { events[name] = listener; }
    };
    let ready;
    const scope = {
      document,
      window: {
        PageDeck: { create: () => { calls.push('navigation'); return { wire: () => calls.push('deck'), scheduleWarm: () => calls.push('warm') }; } },
        PageChrome: { create: () => {
          calls.push('chrome');
          return Object.fromEntries(['wireSections', 'wireProgress', 'wireToc', 'wireFrontLayer', 'wireTopbar'].map(key => [key, () => calls.push(key)]));
        } },
        I18N: { onReady: callback => { ready = callback; if (cached) callback(); } },
        Interactions: { start: () => calls.push('modules'), refresh: () => calls.push('refresh') }
      }
    };
    vm.runInNewContext(source, scope);
    assert.deepEqual(calls, ['navigation', 'chrome']);
    scope.window.BH.registerPage({ boot: () => calls.push('page'), onChange: () => calls.push('change') });
    if (cached) { document.readyState = 'interactive'; events.DOMContentLoaded(); } else ready();
    assert.deepEqual(calls, ['navigation', 'chrome', 'wireSections', 'wireProgress', 'wireToc', 'wireFrontLayer', 'deck', 'wireTopbar', 'modules', 'page', 'warm']);
    events['i18n:change']();
    assert.deepEqual(calls.slice(-2), ['change', 'refresh']);
  }
  console.log('Cached and late dictionary boot order, configuration before discovery, and language refresh order passed.');
}

checkDependencies();
checkBootOrder();
if (process.argv.includes('--pure')) process.exit(0);
const markup = `<!doctype html><html><head><meta charset="utf-8"></head><body>
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
withBrowser({ mounts: { '/js/': path.resolve('js') }, pages: { '/': markup } }, async ({ browser, origin }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(origin);
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
}).catch(error => { console.error(error); process.exitCode = 1; });
