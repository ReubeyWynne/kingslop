const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');
const root = path.resolve('_site');
const output = path.resolve('.dsh/events-preview');
const langs = ['en', 'es', 'pt-BR', 'de', 'fr', 'it', 'ru', 'pl', 'tr', 'zh-Hans', 'zh-Hant', 'ko', 'ja', 'th', 'id', 'vi', 'ar'];
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const dictionaries = {};
for (const lang of langs) {
  const scope = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'i18n', lang + '.js'), 'utf8'), scope);
  dictionaries[lang] = scope.window.__BH_I18N_DATA[lang];
  for (const key of ['ks.hero.h1', 'ks.today.brawlMeta', 'ks.today.selected', 'ks.today.preview', 'ks.today.copyFailed', 'ks.today.priorities', 'ks.today.save', 'ks.today.sideRun']) assert.ok(dictionaries[lang][key], lang + ': ' + key);
}
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((request, response) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});
function displayCells(line) {
  return [...line.replace(/<item_icon_[A-Za-z0-9_]+>/g, 'x')].reduce((n, char) => {
    const cp = char.codePointAt(0);
    if (cp === 0x200d || cp >= 0xfe00 && cp <= 0xfe0f) return n;
    return n + (cp >= 0x2600 && cp <= 0x27bf || cp >= 0x2e80 && cp <= 0xa4cf || cp >= 0xac00 && cp <= 0xd7af || cp >= 0xff00 && cp <= 0xff60 || cp >= 0x1f000 ? 2 : 1);
  }, 0);
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  const report = [];
  try {
    browser = await chromium.launch();
    const context = await browser.newContext();
    for (const [lang, width] of [...langs.map(lang => [lang, 320]), ['en', 390], ['en', 1280], ['ar', 1280]]) {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(() => {
        const OriginalDate = Date;
        window.testNow = OriginalDate.parse('2026-10-04T12:00:00Z');
        window.Date = class extends OriginalDate {
          constructor(...args) { super(...(args.length ? args : [window.testNow])); }
          static now() { return window.testNow; }
        };
        window.copiedMessages = [];
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedMessages.push(text); } }, configurable: true });
      });
      await page.goto('http://127.0.0.1:' + server.address().port + '/events/?lang=' + lang, { waitUntil: 'networkidle' });
      await page.waitForFunction(lang => document.documentElement.lang === lang && document.querySelectorAll('#ks-cycle button').length === 28, lang);
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('#ks-cycle [aria-pressed="true"]').getAttribute('data-cycle-day'), '21');
      assert.equal(await page.locator('.reference-body:visible').count(), 0);
      assert.equal(await page.locator('#ks-copy-btn').isVisible(), true);
      for (const d of [21, 22, 1]) {
        if (d !== 21) await page.locator('[data-cycle-day="' + d + '"]').click();
        const metrics = await page.locator('#today').evaluate(el => ({ overflow: el.scrollWidth > el.clientWidth + 1, pageOverflow: document.documentElement.scrollWidth > innerWidth + 1, images: [...el.querySelectorAll('img')].every(img => img.complete && img.naturalWidth > 0), direction: document.documentElement.dir }));
        assert.equal(metrics.overflow, false, lang + ': today overflow ' + d);
        assert.equal(metrics.pageOverflow, false, lang + ': page overflow ' + d);
        assert.equal(metrics.images, true, lang + ': missing icons ' + d);
        assert.equal(metrics.direction, lang === 'ar' ? 'rtl' : 'ltr');
        report.push({ lang, width, day: d, ...metrics });
        for (const label of await page.locator('#today [data-i18n], .events-heading [data-i18n]').all()) {
          const key = await label.getAttribute('data-i18n');
          if (key === 'ks.today.title') continue;
          assert.equal(await label.textContent(), dictionaries[lang][key] ?? dictionaries.en[key], lang + ': ' + key);
        }
        if (lang === 'en' || lang === 'ar') {
          await page.evaluate(() => scrollTo(0, 0));
          await page.screenshot({ path: path.join(output, lang + '-' + width + '-day-' + d + '-viewport.png') });
          await page.screenshot({ path: path.join(output, lang + '-' + width + '-day-' + d + '.png'), fullPage: true, style: '.topbar, .toc { visibility: hidden !important; }' });
        }
      }
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      assert.equal(await page.locator('#ks-cycle [aria-pressed="true"]').getAttribute('data-cycle-day'), '1');
      await page.locator('#ks-prev').click();
      assert.equal(await page.locator('#ks-cycle [aria-pressed="true"]').getAttribute('data-cycle-day'), '28');
      await page.locator('#ks-next').click();
      assert.equal(await page.locator('#ks-cycle [aria-pressed="true"]').getAttribute('data-cycle-day'), '1');
      await page.locator('#ks-today').click();
      assert.equal(await page.locator('#ks-cycle [aria-pressed="true"]').getAttribute('data-cycle-day'), '21');
      await page.evaluate(() => { window.testNow += 86400000; window.dispatchEvent(new Event('focus')); });
      assert.equal(await page.locator('#ks-cycle [aria-pressed="true"]').getAttribute('data-cycle-day'), '22');
      await page.locator('#brawl .reference-toggle').click();
      assert.equal(await page.locator('#brawl-body').isVisible(), true);
      assert.equal(await page.locator('[data-i18n="ks.brawl.stance"]').textContent(), dictionaries[lang]['ks.brawl.stance']);
      await page.locator('#brawl .reference-toggle').click();
      await page.evaluate(() => { location.hash = 'brawl'; });
      await page.waitForFunction(() => !document.getElementById('brawl-body').hidden);
      if (lang === 'en' && width === 1280) {
        for (let d = 1; d <= 28; d++) {
          await page.locator('[data-cycle-day="' + d + '"]').click();
          const parts = page.locator('#ks-copy-parts button');
          const count = Math.max(1, await parts.count());
          for (let n = 0; n < count; n++) {
            if (await parts.count()) await parts.nth(n).click();
            const message = await page.locator('#ks-copy-out').inputValue();
            assert.ok(message.length <= 512, 'day ' + d + ': message limit');
            for (const line of message.split('\n')) assert.ok(displayCells(line) <= 28, 'day ' + d + ': line too wide: ' + line);
            await page.locator('#ks-copy-btn').click();
            await page.waitForFunction(() => !document.getElementById('ks-copy-btn').disabled);
            assert.equal(await page.evaluate(() => window.copiedMessages.at(-1)), message);
            assert.equal(await page.locator('#ks-copy-status').textContent(), dictionaries.en['ks.today.copied']);
          }
        }
        await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('denied'); }; document.execCommand = () => false; });
        await page.locator('#ks-copy-btn').click();
        await page.waitForFunction(() => document.getElementById('ks-copy-preview').open);
        assert.equal(await page.locator('#ks-copy-status').textContent(), dictionaries.en['ks.today.copyFailed']);
        await page.evaluate(() => window.I18N.switchTo('ar'));
        await page.waitForFunction(() => window.I18N.lang === 'ar');
        assert.equal(await page.locator('#ks-cycle [aria-pressed="true"]').getAttribute('data-cycle-day'), '28');
      }
      assert.deepEqual(errors, [], lang + ': browser errors');
      await page.close();
    }
  } finally {
    fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify(report, null, 2));
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
  console.log('Passed 60 layout checks across 17 languages, all 28 copy days, navigation, UTC rollover, clipboard success/failure and RTL.');
})().catch(error => { console.error(error); process.exitCode = 1; });
