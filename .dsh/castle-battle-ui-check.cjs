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
      assert.match(await page.locator('[data-lineup-role="defense"][data-lineup-stage="mature"] [data-copy-for="eric"]').textContent(), /4★ · Skills 5 \/ 4 \/ 3 · Widget 6/);
      for (const role of ['defense', 'attack', 'join']) {
        await page.locator('#castle-' + role + '-tab').click();
        for (const stage of ['older', 'mixed', 'mature']) {
          if (role !== 'join') await page.locator('[data-target="castle-battle.stage"]').selectOption(stage);
          for (const view of ['heroes', 'formation', 'waves']) {
            await page.locator('#castle-' + view + '-tab').click();
            assert.equal(await page.locator('[data-view]:visible').count(), 1);
            assert.equal(await page.locator('#castle-lesson').getAttribute('aria-labelledby'), 'castle-' + role + '-tab');
            for (const width of [320, 390, 768, 1920]) {
              await page.setViewportSize({ width, height: 900 });
              const clipped = await page.evaluate(() => [...document.querySelectorAll('.castle-tabs,.castle-progress,.castle-hero,.castle-wave,.castle-counts,.topbar,.ev-switch')].filter(node => node.getClientRects().length && node.scrollWidth > node.clientWidth + 2).map(node => node.className));
              assert.deepEqual(clipped, [], lang + ' ' + role + ' ' + view + ' at ' + width);
              assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            }
          }
        }
      }
      await page.locator('#castle-defense-tab').click();
      await page.locator('#castle-formation-tab').click();
      await page.locator('[data-mix="60,20,20"]').click();
      await page.locator('[data-target="castle-battle.loss-input"]').fill('180000');
      assert.equal(await page.locator('[data-share="0"]').textContent(), '51.2%');
      await page.locator('#castle-attack-tab').click();
      assert.equal(await page.locator('[data-share="0"]').textContent(), '60.0%');
      await page.locator('#castle-defense-tab').click();
      assert.equal(await page.locator('[data-share="0"]').textContent(), '51.2%');
      await page.locator('#castle-waves-tab').click();
      await page.locator('[data-target="castle-battle.gap"]').selectOption('large');
      assert.equal(await page.locator('[data-wave="large"]').isVisible(), true);
      await page.locator('#castle-heroes-tab').focus();
      await page.keyboard.press(lang === 'ar' ? 'ArrowLeft' : 'ArrowRight');
      assert.equal(await page.locator('#castle-formation-tab').getAttribute('aria-selected'), 'true');
      await page.locator('#castle-heroes-tab').click();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#castle-guide').screenshot({ path: path.join(output, lang + '.png') });
      assert.deepEqual(await page.evaluate(() => window.castleErrors), []);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('Castle Battle: progression, roles, shared roster, depletion, keyboard direction and responsive layout passed.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
