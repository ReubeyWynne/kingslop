const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const E = require('../js/hero-gear-engine.js');
const root = path.resolve('_site');
const output = path.resolve('.dsh/gear-preview');
const key = 'bh:hero-gear:v1';
const server = http.createServer((request, response) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return response.writeHead(404).end();
  response.setHeader('Content-Type', { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' }[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});
const workerBody = "importScripts('hero-gear-engine.js' + self.location.search);self.onmessage=e=>setTimeout(()=>self.postMessage({ok:true,result:self.HeroGear.strategyComparison(e.data)}),400);";
function fixture() {
  const state = E.defaults();
  state.mode = 'optimise'; state.view = 'plan';
  state.included = { inf:false, cav:false, arc:true };
  state.resources = { xp:0, hammers:30, mythic:0, mithril:0 };
  for (const slot of E.SLOTS) state.pieces['arc-' + slot] = { quality:'mythic', level:69, mastery:2 };
  return state;
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless:true });
  const url = 'http://127.0.0.1:' + server.address().port + '/hero-gear/?lang=en';
  fs.mkdirSync(output, { recursive:true });
  let page;
  async function open(state, options = {}) {
    page = await browser.newPage({ viewport:options.desktop ? { width:1280,height:900 } : { width:390,height:844 }, reducedMotion:'reduce' });
    await page.addInitScript(({ state, key, failConstructor }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state));
      const NativeWorker = window.Worker;
      window.__searches = []; window.__terminated = 0; window.__constructorFailed = false;
      window.Worker = class extends NativeWorker {
        constructor(url, options) {
          if (failConstructor && String(url).includes('hero-gear-worker') && !window.__constructorFailed) {
            window.__constructorFailed = true; throw new Error('Unavailable worker');
          }
          super(url, options); this.gearSearch = String(url).includes('hero-gear-worker');
        }
        postMessage(data) { if (this.gearSearch) window.__searches.push(JSON.parse(JSON.stringify(data))); super.postMessage(data); }
        terminate() { if (this.gearSearch) window.__terminated++; super.terminate(); }
      };
    }, { state, key, failConstructor:options.failConstructor });
    let requests = 0;
    await page.route('**/js/hero-gear-worker.js**', route => route.fulfill({ contentType:'text/javascript', body:options.failFirst && requests++ === 0 ? 'self.onmessage=()=>self.postMessage({ok:false});' : workerBody }));
    await page.goto(url);
    await page.locator('#gear-rows .gear-row').first().waitFor({ state:'attached' });
  }
  async function ready() { await page.locator('#gear-apply-result').waitFor(); }
  async function saved() { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), key); }
  try {
    await open(fixture(), { desktop:true });
    await page.waitForFunction(() => window.__searches.length === 1);
    assert.ok(['true', 'false'].includes(await page.locator('#gear-results').getAttribute('aria-busy')), 'worker may finish before busy-state assertion');
    assert.equal(await page.locator('#gear-run').isVisible(), false);
    await ready();
    assert.equal(await page.locator('[data-result-troop="arc"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#gear-record-hint').isVisible(), true);
    assert.equal(await page.locator('#gear-apply-result').getAttribute('aria-describedby'), 'gear-record-hint');
    assert.equal(await page.locator('.gear-change[data-direction="same"][data-changed="true"]').first().evaluate(el => getComputedStyle(el).opacity), '1');
    assert.equal(await page.locator('.gear-change').count(), 1, 'unchanged pieces do not create comparison rows');
    assert.equal(await page.locator('.gear-change .gear-item').count(), 2);
    assert.match(await page.locator('.gear-kept').textContent(), /unchanged/);
    await page.locator('#gear-mode-plan').click(); await page.locator('#gear-mode-optimise').click();
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.__searches.length), 1, 'valid results survive tab navigation');
    await page.locator('#gear-parts100').fill('20');
    await page.waitForFunction(() => window.__searches.length === 2);
    assert.equal(await page.locator('#gear-apply-result').count(), 0, 'old recommendations disappear on edit');
    await page.locator('#gear-parts100').fill('50');
    await page.waitForFunction(() => window.__searches.length === 3);
    await ready();
    const latest = await saved(); const expected = E.optimise(latest);
    assert.equal(await page.evaluate(() => window.__searches.at(-1).resources.xp), 5000);
    assert.ok(await page.evaluate(() => window.__terminated >= 2));
    await page.locator('#gear-apply-result').click();
    assert.deepEqual((await saved()).resources, expected.remaining, 'only the latest budget can be recorded');
    assert.deepEqual((await saved()).pieces, expected.pieces);
    await page.locator('#gear-undo').click();
    await ready(); assert.deepEqual((await saved()).resources, latest.resources);
    await page.reload(); await ready();
    assert.equal(await page.evaluate(() => window.__searches.length), 1, 'saved Spend now recalculates after reload');
    await page.close();

    const mobile = fixture(); mobile.view = 'gear';
    await open(mobile);
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.__searches.length), 0, 'hidden mobile Plan does not start a search');
    await page.locator('#gear-view-plan').click();
    await page.waitForFunction(() => window.__searches.length === 1);
    await page.locator('#gear-view-gear').click();
    assert.equal(await page.evaluate(() => window.__terminated), 1, 'leaving mobile Plan cancels work');
    await page.locator('#gear-view-plan').click();
    await page.screenshot({ path:path.join(output, 'mobile-calculating.png') });
    await ready();
    assert.equal(await page.evaluate(() => window.__searches.length), 2);
    await page.locator('#gear-view-gear').click(); await page.locator('#gear-view-plan').click();
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.__searches.length), 2, 'returning to mobile Plan uses current results');
    await page.locator('#gear-profile').selectOption('custom');
    assert.equal(await page.locator('#gear-settings').evaluate(el => el.open), true);
    assert.equal(await page.locator('#gear-weights input').first().evaluate(el => el === document.activeElement), true);
    await page.close();

    for (const options of [{ failFirst:true }, { failConstructor:true }]) {
      await open(fixture(), options);
      await page.locator('#gear-run').waitFor();
      assert.match(await page.locator('#gear-search-status').textContent(), /could not calculate/);
      assert.equal(await page.locator('#gear-results').getAttribute('aria-busy'), 'false');
      const before = await saved(); const count = await page.evaluate(() => window.__searches.length);
      await page.locator('#gear-mode-plan').click(); await page.locator('#gear-mode-optimise').click();
      await page.waitForTimeout(350);
      assert.equal(await page.evaluate(() => window.__searches.length), count, 'failed calculations do not retry in a loop');
      if (options.failFirst) await page.screenshot({ path:path.join(output, 'mobile-retry.png') });
      await page.locator('#gear-run').click(); await ready();
      assert.deepEqual((await saved()).pieces, before.pieces); assert.deepEqual((await saved()).resources, before.resources);
      await page.close();
    }

    for (const empty of ['budget', 'troops', 'weights']) {
      const state = fixture();
      if (empty === 'budget') state.resources = E.defaults().resources;
      if (empty === 'troops') state.included.arc = false;
      if (empty === 'weights') state.weights.arc = [0,0];
      await open(state); await page.locator('.gear-empty').waitFor();
      if (empty === 'budget') {
        assert.match(await page.locator('.gear-empty').textContent(), /add resources/);
        await page.screenshot({ path:path.join(output, 'mobile-empty-budget.png') });
        await page.locator('.gear-empty [data-mode="plan"]').click();
        assert.equal(await page.locator('#gear-mode-plan').getAttribute('aria-selected'), 'true');
      } else if (empty === 'troops') {
        await page.locator('.gear-empty [data-view="gear"]').click();
        assert.equal(await page.locator('.gear-editor').isVisible(), true);
      } else {
        await page.locator('.gear-empty [data-show-weights]').click();
        assert.equal(await page.locator('#gear-settings').evaluate(el => el.open), true);
      }
      await page.close();
    }
    for (const kind of ['ascension', 'mithril', 'mastery']) {
      const state = fixture();
      for (const slot of E.SLOTS) state.pieces['arc-' + slot] = { quality:'epic', level:80, mastery:0 };
      const from = kind === 'ascension' ? { quality:'mythic', level:100, mastery:10 } : { quality:'red', level:120, mastery:11 };
      const to = { quality:'red', level:kind === 'mithril' ? 160 : 120, mastery:kind === 'mithril' ? 13 : kind === 'mastery' ? 12 : 11 };
      state.pieces['arc-helm'] = from; state.resources = E.cost(from, to);
      await open(state); await ready();
      const row = page.locator('.gear-change[data-checkpoint="' + kind + '"]');
      assert.equal(await row.count(), 1);
      assert.equal(await row.locator('.gear-item').count(), 2);
      assert.equal(await row.locator('.gear-item').first().getAttribute('data-quality'), from.quality);
      assert.equal(await row.locator('.gear-item').last().getAttribute('data-quality'), 'red');
      assert.equal(await row.locator('.gear-item-level').last().textContent(), '+' + (to.level - 100));
      assert.equal(await row.locator('.gear-item-mastery').last().textContent(), String(to.mastery));
      assert.match(await row.locator('.gear-item').last().getAttribute('aria-label'), /Red.*Mastery/);
      assert.equal(await row.locator('.gear-checkpoint-label').isVisible(), true);
      assert.equal(await page.locator('.gear-change').count(), 1);
      const points=state.resources.hammers*4000+state.resources.mithril*40000;
      assert.equal(await row.locator('.gear-kvk-points').getAttribute('data-kvk-points'),String(points));
      assert.equal(await page.locator('#gear-results > .gear-kvk-summary').getAttribute('data-kvk-points'),String(points));
      await page.screenshot({ path:path.join(output, 'mobile-red-' + kind + '.png') });
      await page.setViewportSize({ width:1280,height:900 });
      await page.screenshot({ path:path.join(output, 'desktop-red-' + kind + '.png') });
      await page.locator('#gear-mode-plan').click();
      if (kind !== 'mastery') {
        assert.ok(await page.locator('.gear-route[data-checkpoint] .gear-item[data-quality="red"]').count() > 0);
        await page.setViewportSize({ width:390,height:844 });
        await page.screenshot({ path:path.join(output, 'mobile-saving-' + kind + '.png') });
      }
      await page.close();
    }
    console.log('Automatic Spend now, cached tab navigation, debounced edits, cancelled searches, latest-result recording, undo/reload, mobile visibility, worker failure/retry, empty states, custom weights and mastery-only highlighting passed. Shared before/after rarity frames, enhancement/mastery overlays, changed-only rows and ascension/mithril/mastery checkpoint treatments passed.');
  } catch (error) {
    if (page && !page.isClosed()) await page.screenshot({ path:path.join(output, 'interaction-failure.png'), fullPage:true });
    fs.writeFileSync(path.join(output, 'interaction-failure.txt'), error.stack); throw error;
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
