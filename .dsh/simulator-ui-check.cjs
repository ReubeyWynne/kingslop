const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve('_site');
const output = path.resolve('.dsh/sim-preview');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png' };
const server = http.createServer((request, response) => {
  let file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return response.writeHead(404).end();
  response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});
async function fixtures(page) {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class {
      constructor(url, options) {
        if (!String(url).includes('ocr-worker')) {
          if (window.blockSimWorker) throw new Error('Worker unavailable');
          return new NativeWorker(url, options);
        }
      }
      async postMessage(message) {
        const canvas = document.createElement('canvas');
        canvas.width = 500; canvas.height = 200;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#162337'; ctx.fillRect(0, 0, 500, 200);
        ctx.font = '16px sans-serif'; ctx.fillStyle = '#f1e3c2';
        ctx.fillText('+411.5%    Infantry Attack             +220%', 5, 45);
        ctx.fillText('                  Infantry Lethality         +230%', 5, 85);
        ctx.fillText('70,500  30,000  49,500   60,000  45,000  45,000', 5, 125);
        const poly = (x, y, width = 80) => [[x, y], [x + width, y], [x + width, y + 16], [x, y + 16]];
        const items = [
          { text: '+411.5%', poly: poly(5, 30) }, { text: 'Infantry Attack', poly: poly(150, 30, 200) },
          { text: '+220%', poly: poly(400, 30) }, { text: 'Infantry Lethality', poly: poly(150, 70, 200) },
          { text: '+230%', poly: poly(400, 70) },
          ...['70,500', '30,000', '49,500', '60,000', '45,000', '45,000'].map((text, i) => ({ text, poly: poly(5 + i * 80, 110, 70) }))
        ];
        const preview = message.type === 'predict' ? await createImageBitmap(canvas) : null;
        setTimeout(() => this.onmessage({ data: { id: message.id, ok: true, preview, items: window.unreadable ? [] : items } }), 5);
      }
      terminate() {}
    };
  });
}
// The simulator's button hands the shot to the site-wide import panel, which
// reviews it before anything reaches the sheet.
async function upload(page, name = 'report.png') {
  const buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#sim-ocr-btn').click()]);
  await chooser.setFiles({ name, mimeType: 'image/png', buffer });
}
const raw = (page, id) => page.evaluate(id => document.getElementById(id).value, id);
const tiles = page => page.locator('#screen-import .import-tile').evaluateAll(list => Object.fromEntries(list.map(li => [li.dataset.key, li.querySelector('[data-field="value"]').value])));
(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  try {
    for (const [lang, width] of [['en', 320], ['en', 390], ['en', 1280], ['ar', 320]]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await fixtures(page);
      await page.goto('http://127.0.0.1:' + server.address().port + '/battle-simulator/?mode=battle&lang=' + lang);
      await page.waitForFunction(() => document.getElementById('sim-fight-headline').textContent.trim());
      const atkBefore = await raw(page, 'sim-atk-inf');
      await upload(page);
      await page.locator('#screen-import .import-chip', { hasText: '1 to review' }).waitFor();
      assert.equal(await page.locator('#screen-import [data-target="screen-import.screen"]').textContent(), 'Battle report');
      assert.deepEqual(await tiles(page), { 'sim-atk-inf': '411.5', 'sim-foe-atk-inf': '220', 'sim-foe-let-inf': '230', 'sim-n-inf': '70500', 'sim-foe-n-inf': '60000', 'sim-n-cav': '30000', 'sim-foe-n-cav': '45000', 'sim-n-arc': '49500', 'sim-foe-n-arc': '45000' });
      assert.equal(await page.locator('#screen-import .import-tile [data-field="crop"]:not([hidden])').count(), 3, 'each row of the report shows its cut-out once');
      assert.equal(await page.locator('#screen-import .import-tile[data-group="follow"]').count(), 6);
      assert.equal(await page.locator('#screen-import [data-key="sim-foe-atk-inf"] [data-field="label"]').isHidden(), true, 'the second side names only its side');
      assert.equal(await page.locator('#screen-import #screenshot-help').getAttribute('open'), null, 'the instructions start folded');
      assert.equal(await raw(page, 'sim-atk-inf'), atkBefore, 'review comes before the sheet changes');
      const lethality = page.locator('#screen-import [data-key="sim-foe-let-inf"] [data-field="value"]');
      await lethality.fill('333.3'); await lethality.dispatchEvent('change');
      assert.ok(await page.evaluate(() => { const box = document.querySelector('#screen-import .import-sheet').getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1; }));
      await page.screenshot({ path: path.join(output, 'review-' + lang + '-' + width + '.png') });
      await page.locator('#screen-import [data-action="screen-import.apply"]').click();
      await page.locator('#screen-import [data-target="screen-import.status"]', { hasText: 'Saved 9 values' }).waitFor();
      assert.equal(await raw(page, 'sim-atk-inf'), '411.5');
      assert.equal(await raw(page, 'sim-let-inf'), '163', 'a value the report lacks keeps the sheet');
      assert.equal(await raw(page, 'sim-foe-let-inf'), '333.3', 'the correction is what lands');
      assert.equal(await raw(page, 'sim-n-inf'), '70500');
      assert.equal(await raw(page, 'sim-foe-n-inf'), '60000');
      await page.locator('#screen-import [data-target="screen-import.chip"]').click();
      if (width <= 860) await page.locator('#sim-view-answer').click();
      await page.locator('.sweep-settings summary').click();
      await page.locator('#sim-sw-step').selectOption('0.1');
      await page.locator('#sim-sw-battles').selectOption('20');
      if (width === 390) await page.evaluate(() => { window.blockSimWorker = true; });
      await page.locator('#sim-sweep-btn').click();
      await page.waitForFunction(() => {
        const p = document.getElementById('sim-sweep-progress');
        return !p.hidden && p.value === p.max && !document.getElementById('sim-sweep-result').hidden;
      });
      assert.equal(await page.locator('#sim-answer').getAttribute('aria-busy'), null);
      assert.ok((await page.locator('#sim-sweep-metrics').textContent()).includes(lang === 'ar' ? '1,320' : '1,320'));
      assert.equal(await page.locator('#sim-sweep-btn').isDisabled(), false);
      assert.equal(await page.locator('#sim-sweep-status').isHidden(), true);
      // An edit after a sweep re-runs it; the old answer stays up, dimmed.
      await page.evaluate(() => {
        const input = document.getElementById('sim-foe-n-cav');
        input.value = String(Number(input.value) + 500);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.waitForFunction(() => document.getElementById('sim-sweep-result').hasAttribute('data-stale'));
      await page.waitForFunction(() => !document.getElementById('sim-sweep-result').hasAttribute('data-stale') && !document.getElementById('sim-answer').hasAttribute('aria-busy'));
      await page.locator('.sweep-settings summary').click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(output, 'answer-' + lang + '-' + width + '.png') });
      await page.locator('[data-mode="bear-ratio"]').first().click();
      if (width <= 860) await page.locator('#sim-view-armies').click();
      // Undo puts back what the report replaced.
      await page.locator('#screen-import [data-target="screen-import.chip"]').click();
      await page.locator('#screen-import [data-action="screen-import.undo"]').click();
      assert.equal(await raw(page, 'sim-atk-inf'), atkBefore);
      await page.locator('#screen-import [data-target="screen-import.chip"]').click();
      await page.evaluate(() => { window.unreadable = true; });
      await upload(page, 'blank.png');
      await page.locator('#screen-import [data-target="screen-import.status"]', { hasText: 'isn’t a screen I can read' }).waitFor();
      assert.equal(await raw(page, 'sim-atk-inf'), atkBefore, 'an unreadable shot changes nothing');
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('Simulator battle reports through the import panel (review, correction, apply, undo), unreadable images, worker/fallback sweep, progress, mobile and RTL layouts passed.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
