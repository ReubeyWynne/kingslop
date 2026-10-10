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
        ctx.fillText('12,345            Infantry                   23,456', 5, 125);
        const poly = (x, y, width = 80) => [[x, y], [x + width, y], [x + width, y + 16], [x, y + 16]];
        const items = [
          { text: '+411.5%', poly: poly(5, 30) }, { text: 'Infantry Attack', poly: poly(150, 30, 200) },
          { text: '+220%', poly: poly(400, 30) }, { text: 'Infantry Lethality', poly: poly(150, 70, 200) },
          { text: '+230%', poly: poly(400, 70) }, { text: '12,345', poly: poly(5, 110) },
          { text: 'Infantry', poly: poly(150, 110, 200) }, { text: '23,456', poly: poly(400, 110) }
        ];
        const preview = message.type === 'predict' ? await createImageBitmap(canvas) : null;
        setTimeout(() => this.onmessage({ data: { id: message.id, ok: true, preview, items: window.unreadable ? [] : items } }), 5);
      }
      terminate() {}
    };
  });
}
async function upload(page) {
  const buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  await page.locator('#sim-ocr-file').setInputFiles({ name: 'report.png', mimeType: 'image/png', buffer });
  await page.waitForFunction(() => document.getElementById('sim-review-dialog').open && !document.getElementById('sim-ocr-btn').disabled);
}
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
      await upload(page);
      assert.equal(await page.locator('#sim-atk-inf').inputValue(), '411.5');
      assert.equal(await page.locator('#sim-let-inf').inputValue(), '163');
      assert.equal(await page.locator('#sim-n-inf').inputValue(), '12345');
      assert.equal(await page.locator('#sim-foe-n-inf').inputValue(), '23456');
      assert.equal(await page.locator('.sim-review-snippet').count(), 3);
      assert.equal(await page.locator('#sim-review-fields input').count(), 10);
      assert.equal(await page.locator('#sim-review-fields input[data-ocr="missing"]').count(), 5);
      await page.locator('[data-source="sim-let-inf"]').fill('333.3');
      assert.equal(await page.locator('#sim-let-inf').inputValue(), '333.3');
      assert.equal(await page.locator('#sim-review-fields input[data-ocr="missing"]').count(), 4);
      await page.locator('#sim-review-tab-cav').click();
      assert.equal(await page.locator('[data-source$="-cav"]').count(), 10);
      await page.locator('#sim-review-tab-inf').click();
      assert.ok(await page.evaluate(() => document.getElementById('sim-review-dialog').scrollWidth <= document.getElementById('sim-review-dialog').clientWidth + 1));
      await page.screenshot({ path: path.join(output, 'review-' + lang + '-' + width + '.png') });
      await page.locator('#sim-review-dialog .sim-dialog-head button').click();
      assert.ok(await page.evaluate(() => !document.getElementById('sim-review-dialog').open));
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
      await page.locator('#sim-ocr-review-btn').click();
      assert.equal(await page.locator('#sim-review-fields input').count(), 2);
      await page.locator('#sim-review-dialog .sim-dialog-head button').click();
      await page.evaluate(() => { window.unreadable = true; });
      await upload(page);
      assert.equal(await page.locator('#sim-atk-inf').inputValue(), '411.5');
      assert.equal(await page.locator('#sim-review-fields input[data-ocr="missing"]').count(), 2);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('Simulator OCR review, corrections, unreadable images, worker/fallback sweep, progress, mobile and RTL layouts passed.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
