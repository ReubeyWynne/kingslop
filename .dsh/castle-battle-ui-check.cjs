const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
const root = path.resolve('_site');
const output = path.resolve('.dsh/castle-preview');
withBrowser({ root }, async ({ browser, origin }) => {
  fs.mkdirSync(output, { recursive: true });

  for (const lang of ['en', 'ar']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/castle-battle/?lang=' + lang);
    await page.waitForFunction(() => !document.querySelector('[data-target="castle-battle.stage"]').disabled);
    await page.evaluate(() => {
      window.castleErrors = [];
      document.addEventListener('module:error', event => window.castleErrors.push(event.detail));
      PlayerLedger.shared().setHero('eric', { stars: 24, skills: [5, 4, 3], widget: 6 });
    });
    assert.equal(await page.locator('[data-view]:visible').getAttribute('data-view'), 'event');
    for (const view of ['event', 'combat', 'joiners', 'formation']) {
      await page.locator('#castle-' + view + '-tab').click();
      assert.equal(await page.locator('[data-view]:visible').count(), 1);
      assert.equal(await page.locator('[data-view]:visible').getAttribute('data-view'), view);
      for (const width of [320, 390, 768, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        const clipped = await page.evaluate(() => [...document.querySelectorAll('.castle-tabs,.castle-progress,.castle-hero,.topbar,.ev-switch')].filter(node => node.getClientRects().length && node.scrollWidth > node.clientWidth + 2).map(node => node.className));
        assert.deepEqual(clipped, [], lang + ' ' + view + ' at ' + width);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#castle-guide').screenshot({ path: path.join(output, lang + '-' + view + '.png') });
    }
    await page.locator('#castle-joiners-tab').click();
    await page.getByText('Find it in game', { exact: true }).click();
    await page.locator('.castle-screens').evaluate(async node => {
      await Promise.all([...node.querySelectorAll('img')].map(async img => {
        img.loading = 'eager';
        await img.decode();
        if (!img.naturalWidth) throw new Error('Missing joiner screenshot');
      }));
    });
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    await page.locator('.castle-screens').screenshot({ path: path.join(output, lang + '-joiner-screens.png') });
    await page.locator('#castle-formation-tab').click();
    await page.getByText('Gen 4: the 60 / 40 garrison', { exact: true }).click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.locator('#castle-formation .castle-chapter').first().screenshot({ path: path.join(output, lang + '-gen4.png') });
    await page.locator('#castle-combat-tab').click();
    await page.getByText('Leader kits · Gen 2–3', { exact: true }).click();
    for (const role of ['defense', 'attack']) {
      await page.locator('#castle-' + role + '-tab').click();
      for (const stage of ['older', 'mixed', 'mature']) {
        await page.locator('[data-target="castle-battle.stage"]').selectOption(stage);
        assert.equal(await page.locator('[data-lineup-role]:visible').count(), 1);
        assert.equal(await page.locator('#castle-leaders').getAttribute('aria-labelledby'), 'castle-' + role + '-tab');
      }
    }
    await page.locator('#castle-defense-tab').click();
    assert.match(await page.locator('[data-lineup-role="defense"][data-lineup-stage="mature"] [data-copy-for="eric"]').textContent(), /4★ · Skills 5 \/ 4 \/ 3 · Widget 6/);
    await page.setViewportSize({ width: 320, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.locator('#castle-event-tab').click();
    await page.locator('#castle-event a[href="#castle-evidence-event"]').first().click();
    assert.equal(await page.locator('#castle-evidence').getAttribute('open'), '');
    await page.locator('#castle-event-tab').focus();
    assert.equal(await page.locator('#castle-guide').getAttribute('dir'), 'ltr');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#castle-combat-tab').getAttribute('aria-selected'), 'true');
    assert.deepEqual(await page.evaluate(() => window.castleErrors), []);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Castle Battle: lessons, leader kits, shared roster, sources, RTL keyboard and responsive layout passed.');
}).catch(error => { console.error(error); process.exitCode = 1; });
