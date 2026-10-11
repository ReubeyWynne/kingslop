const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve('_site');
const output = path.resolve('.dsh/castle-preview');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp' };
const server = http.createServer((request, response) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  if (file !== root && !file.startsWith(root + path.sep)) return response.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return response.writeHead(404).end();
  response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const lang of ['en', 'ar']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:' + server.address().port + '/castle-battle/?lang=' + lang);
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
          const clipped = await page.evaluate(() => [...document.querySelectorAll('.castle-tabs,.castle-progress,.castle-hero,.castle-counts,.castle-input-row,.topbar,.ev-switch')].filter(node => node.getClientRects().length && node.scrollWidth > node.clientWidth + 2).map(node => node.className));
          assert.deepEqual(clipped, [], lang + ' ' + view + ' at ' + width);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('#castle-guide').screenshot({ path: path.join(output, lang + '-' + view + '.png') });
      }
      assert.equal(await page.locator('[data-missing="0"]').textContent(), '180,000');
      for (const [index, value] of [[0, '528000'], [1, '236000'], [2, '236000']]) await page.locator('[data-current="' + index + '"]').fill(value);
      assert.equal(await page.locator('[data-missing="0"]').textContent(), '72,000');
      assert.equal(await page.locator('[data-surplus="1"]').textContent(), '36,000');
      assert.match(await page.locator('[data-target="castle-battle.refill-note"]').textContent(), /Adding troops alone cannot restore it/);
      await page.locator('[data-ratio="0"]').fill('70');
      assert.equal(await page.locator('[data-missing="0"]').textContent(), '—');
      assert.match(await page.locator('[data-target="castle-battle.refill-note"]').textContent(), /add to 100/);
      await page.locator('[data-ratio="0"]').fill('60');
      await page.locator('[data-current="0"]').fill('');
      assert.equal(await page.locator('[data-missing="0"]').textContent(), '—');
      await page.locator('[data-current="0"]').fill('600000');
      await page.locator('[data-current="1"]').fill('200000');
      await page.locator('[data-current="2"]').fill('200000');
      assert.match(await page.locator('[data-target="castle-battle.refill-note"]').textContent(), /No refill/);
      await page.locator('#castle-combat-tab').click();
      await page.getByText('Compare leader kits · Gen 2–3 examples', { exact: true }).click();
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
    console.log('Castle Battle: lessons, leader kits, shared roster, refill accounting, invalid input, sources, RTL keyboard and responsive layout passed.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
