const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
const E = require('../js/hero-gear-engine.js');
const root = path.resolve('_site');
const output = path.resolve('.dsh/gear-preview');
const key = 'bh:hero-gear:v1';
const workerBody = "importScripts('hero-gear-engine.js' + self.location.search);self.onmessage=e=>setTimeout(()=>self.postMessage({ok:true,result:{now:self.HeroGear.optimise(e.data),optimal:self.HeroGear.optimal(e.data),planned:self.HeroGear.optimal(e.data,{bag:true})}}),400);";
function fixture() {
  const state = E.defaults();
  state.reforge = false; state.view = 'plan';
  state.included = { inf:false, cav:false, arc:true };
  state.resources = { xp:0, hammers:30, mythic:0, mithril:0 };
  for (const slot of E.SLOTS) state.pieces['arc-' + slot] = { quality:'mythic', level:69, mastery:2 };
  return state;
}
withBrowser({ root }, async ({ browser, origin }) => {
  const url = origin + '/hero-gear/?lang=en';
  fs.mkdirSync(output, { recursive:true });
  let page;
  async function open(state, options = {}) {
    const context = await browser.newContext({ viewport:options.desktop ? { width:1280,height:900 } : { width:390,height:844 }, reducedMotion:'reduce' });
    page = await context.newPage();
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
    await page.locator('.gear-card .gear-row').first().waitFor({ state:'attached' });
  }
  async function ready() { await page.locator('#gear-apply-result').waitFor(); }
  async function saved() { return page.evaluate(() => window.PlayerLedger.shared().heroGear(window.HeroGear)); }
  try {
    await open(fixture(), { desktop:true });
    await page.waitForFunction(() => window.__searches.length === 1);
    assert.ok(['true', 'false'].includes(await page.locator('#gear-results').getAttribute('aria-busy')), 'worker may finish before busy-state assertion');
    assert.equal(await page.locator('#gear-run').isVisible(), false);
    await ready();
    // % of optimal comes from the same search: everything invested in archers, spent again.
    assert.match(await page.locator('#gear-optimal .gear-headline').textContent(), /^\d+(\.\d)?%of optimal for what you’ve put in$/);
    // The answer counts the bag too: your gear now, then after Spend now.
    assert.match(await page.locator('#gear-plan-share .gear-headline').textContent(), /^\d+(\.\d)?%→\d+(\.\d)?%$/);
    assert.equal(await page.locator('#gear-record-hint').isVisible(), true);
    assert.equal(await page.locator('#gear-apply-result').getAttribute('aria-describedby'), 'gear-record-hint');
    assert.equal(await page.locator('.gear-change[data-direction="same"][data-changed="true"]').first().evaluate(el => getComputedStyle(el).opacity), '1');
    assert.equal(await page.locator('.gear-change').count(), 1, 'unchanged pieces do not create comparison rows');
    assert.equal(await page.locator('.gear-change .gear-item').count(), 2);
    await page.locator('[data-open="arc"]').click(); await page.locator('#gear-detail .gear-back').click();
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.__searches.length), 1, 'valid results survive opening a troop');
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
    await page.context().close();

    // On a phone the answer sits under your gear and searches straight away; the weights are an Advanced fold.
    await open(fixture());
    await page.waitForFunction(() => window.__searches.length === 1);
    await page.screenshot({ path:path.join(output, 'mobile-calculating.png') });
    await ready();
    assert.equal(await page.locator('#weights').evaluate(el => el.open), false, 'weights start folded away');
    await page.locator('#weights > summary').click();
    await page.locator('#gear-profile').selectOption('custom');
    assert.equal(await page.locator('#weights').evaluate(el => el.open), true, 'custom weights stay in view');
    // A piece's sheet carries its next steps; one the bag can pay for is marked done there.
    await page.context().close();
    const step = fixture(); step.resources = E.cost(step.pieces['arc-helm'], E.milestone(step.pieces['arc-helm'], 'red'));
    await open(step); await ready();
    await page.locator('#gear-view-gear').click();
    await page.locator('.gear-card [data-select="arc-helm"]').click();
    await page.locator('#gear-edit-dialog .gear-step[data-goal="red"] [data-apply-goal]').click();
    assert.equal((await saved()).pieces['arc-helm'].quality, 'red');
    assert.deepEqual((await saved()).resources, { xp:0, hammers:0, mythic:0, mithril:0 });
    await page.context().close();

    for (const options of [{ failFirst:true }, { failConstructor:true }]) {
      await open(fixture(), options);
      await page.locator('#gear-run').waitFor();
      assert.match(await page.locator('#gear-search-status').textContent(), /couldn’t be worked out/);
      assert.equal(await page.locator('#gear-results').getAttribute('aria-busy'), 'false');
      const before = await saved(); const count = await page.evaluate(() => window.__searches.length);
      await page.locator('#gear-view-gear').click();
      await page.locator('[data-open="arc"]').click(); await page.locator('#gear-detail .gear-back').click();
      await page.locator('#gear-view-plan').click();
      await page.waitForTimeout(350);
      assert.equal(await page.evaluate(() => window.__searches.length), count, 'failed calculations do not retry in a loop');
      if (options.failFirst) await page.screenshot({ path:path.join(output, 'mobile-retry.png') });
      await page.locator('#gear-run').click(); await ready();
      assert.deepEqual((await saved()).pieces, before.pieces); assert.deepEqual((await saved()).resources, before.resources);
      await page.context().close();
    }

    for (const empty of ['budget', 'troops', 'weights']) {
      const state = fixture();
      if (empty === 'budget') state.resources = E.defaults().resources;
      if (empty === 'troops') state.included.arc = false;
      if (empty === 'weights') state.weights.arc = [0,0];
      await open(state); await page.locator('.gear-empty').waitFor();
      if (empty === 'budget') {
        assert.match(await page.locator('.gear-empty').textContent(), /Enter your materials/);
        await page.screenshot({ path:path.join(output, 'mobile-empty-budget.png') });
      } else if (empty === 'troops') {
        assert.match(await page.locator('.gear-empty').textContent(), /troop/, 'says no troop is counted');
      } else {
        await page.locator('.gear-empty [data-show-weights]').click();
        assert.equal(await page.locator('#weights').evaluate(el => el.open), true, 'the empty answer opens the weights');
      }
      await page.context().close();
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
      assert.equal(await page.locator('#gear-results .gear-kvk-summary').getAttribute('data-kvk-points'),String(points));
      await page.screenshot({ path:path.join(output, 'mobile-red-' + kind + '.png') });
      await page.setViewportSize({ width:1280,height:900 });
      await page.screenshot({ path:path.join(output, 'desktop-red-' + kind + '.png') });
      await page.context().close();
    }
    await open(fixture(), { desktop: true }); await ready();
    const legacySave = await page.evaluate(key => localStorage.getItem(key), key);
    await page.evaluate(() => window.PlayerLedger.shared().setBalance('forgehammer', 123));
    assert.equal(await page.locator('#gear-hammers').inputValue(), '123');
    assert.equal(await page.locator('#gear-apply-result').count(), 0);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), legacySave);
    const sibling = await page.context().newPage();
    await sibling.goto(url);
    await sibling.locator('.gear-card .gear-row').first().waitFor({ state: 'attached' });
    await sibling.evaluate(() => window.PlayerLedger.shared().setBalance('mithril', 17));
    await page.waitForFunction(() => document.getElementById('gear-mithril').value === '17');
    await page.locator('#save-backups summary').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#gear-export').click()]);
    assert.equal(download.suggestedFilename(), 'kingshot-player.json');
    const backup = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(backup.inventory.forgehammer.amount, 123);
    assert.equal(backup.inventory.mithril.amount, 17);
    const originalBackup = JSON.stringify(backup);
    backup.schemaVersion = 2;
    await page.locator('#gear-save-file').setInputFiles({ name: 'future.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await page.waitForFunction(() => document.getElementById('gear-status').textContent === window.__BH_I18N_DATA.en['gear.invalidSave']);
    assert.equal(await page.locator('#gear-hammers').inputValue(), '123');
    await page.evaluate(() => window.PlayerLedger.shared().setBalance('forgehammer', 5));
    await page.locator('#gear-save-file').setInputFiles({ name: 'player.json', mimeType: 'application/json', buffer: Buffer.from(originalBackup) });
    await page.waitForFunction(() => document.getElementById('gear-hammers').value === '123');
    await page.locator('#gear-undo').click();
    assert.equal(await page.locator('#gear-hammers').inputValue(), '5');
    await page.reload();
    await page.locator('.gear-card .gear-row').first().waitFor({ state: 'attached' });
    assert.equal(await page.locator('#gear-hammers').inputValue(), '5');
    await sibling.close(); await page.context().close();
    console.log('Automatic Spend now, results kept across the troop view, debounced edits, cancelled searches, latest-result recording, undo/reload, a piece’s next step marked done, worker failure/retry, empty states, folded custom weights and mastery-only highlighting passed. Shared before/after rarity frames, enhancement/mastery overlays, changed-only rows and ascension/mithril/mastery checkpoint treatments passed.');
  } catch (error) {
    if (page && !page.isClosed()) await page.screenshot({ path:path.join(output, 'interaction-failure.png'), fullPage:true });
    fs.writeFileSync(path.join(output, 'interaction-failure.txt'), error.stack); throw error;
  }
}).catch(error => { console.error(error); process.exitCode = 1; });

