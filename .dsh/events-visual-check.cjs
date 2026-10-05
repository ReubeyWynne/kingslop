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
  for (const key of ['ks.hero.h1', 'ks.today.brawlMeta', 'ks.today.selected', 'ks.today.preview', 'ks.today.copyFailed', 'ks.today.priorities', 'ks.today.save', 'ks.today.sideRun', 'ks.today.includeLink']) assert.ok(dictionaries[lang][key], lang + ': ' + key);
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
      assert.equal(await page.locator('#ks-copy-link').isChecked(), false, lang + ': site link defaults off');
      for (const d of [21, 22, 20, 26, 1]) {
        if (d !== 21) await page.locator('[data-cycle-day="' + d + '"]').click();
        if (d === 21) await page.locator('#ks-copy-link').check();
        assert.equal(await page.locator('#ks-copy-link').isChecked(), true, lang + ': site-link choice survives day changes');
        assert.equal(await page.locator('.copy-link-option span').textContent(), dictionaries[lang]['ks.today.includeLink']);
        const option = await page.locator('.copy-link-option').boundingBox();
        assert.ok(option.height >= 44, lang + ': site-link tap size');
        const metrics = await page.locator('#today').evaluate(el => ({ overflow: el.scrollWidth > el.clientWidth + 1, pageOverflow: document.documentElement.scrollWidth > innerWidth + 1, images: [...el.querySelectorAll('img')].every(img => img.complete && img.naturalWidth > 0), direction: document.documentElement.dir }));
        assert.equal(metrics.overflow, false, lang + ': today overflow ' + d);
        assert.equal(metrics.pageOverflow, false, lang + ': page overflow ' + d);
        assert.equal(metrics.images, true, lang + ': missing icons ' + d);
        assert.equal(metrics.direction, lang === 'ar' ? 'rtl' : 'ltr');
        const selector = await page.locator('.cycle-controls').boundingBox();
        const card = await page.locator('#ks-card').boundingBox();
        assert.ok(selector.y + selector.height <= card.y, lang + ': selector below event ' + d);
        assert.ok(selector.height <= 72, lang + ': oversized selector ' + d);
        const buttons = [];
        for (const id of ['ks-prev', 'ks-next', 'ks-today']) {
          const bounds = await page.locator('#' + id).boundingBox();
          assert.ok(bounds.width >= 44 && bounds.height >= 44, lang + ': selector tap size ' + id);
          buttons.push(bounds);
        }
        assert.ok(buttons.every(bounds => Math.abs(bounds.y - buttons[0].y) <= 1), lang + ': selector buttons wrap');
        const copy = await page.locator('#ks-copy-btn').boundingBox();
        const tasks = await page.locator('.today-value').boundingBox();
        assert.ok(copy.y >= tasks.y + tasks.height, lang + ': copy interrupts tasks ' + d);
        assert.equal(await page.locator('#ks-copy-btn').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', lang + ': prominent copy background');
        if (d >= 22 && d <= 26) {
          assert.ok(await page.locator('#ks-card .tpts').count() > 0, lang + ': missing KvK item scores');
          assert.ok((await page.locator('#ks-card .today-meta').allTextContents()).includes(dictionaries[lang]['ks.today.units']), lang + ': missing scoring units');
          assert.equal(await page.locator('#ks-card').innerText().then(text => /200[,.\s]?000/.test(text)), false, lang + ': fixed chest target');
        }
        if (d === 20) {
          const reminders = await page.locator('.today-actions').innerText();
          assert.ok(reminders.includes(dictionaries[lang]['ks.today.intelTomorrow']), lang + ': missing advance intel reminder');
          assert.ok(reminders.includes(dictionaries[lang]['ks.today.prepPlan']), lang + ': missing prep planning reminder');
        }
        const first = d <= 7 ? 1 : d <= 14 ? 8 : d <= 20 ? 15 : d >= 22 ? 22 : null;
        assert.equal(await page.locator('.week-jumps [aria-pressed="true"]').count(), first ? 1 : 0);
        if (first) assert.equal(await page.locator('.week-jumps [aria-pressed="true"]').getAttribute('data-jump'), String(first));
        report.push({ lang, width, day: d, ...metrics });
        for (const label of await page.locator('#today [data-i18n], .events-heading [data-i18n]').all()) {
          const key = await label.getAttribute('data-i18n');
          if (key === 'ks.today.title') continue;
          assert.equal(await label.textContent(), dictionaries[lang][key] ?? dictionaries.en[key], lang + ': ' + key);
        }
        if (lang === 'en' || lang === 'ar') {
          if (d === 21) {
            await page.locator('#ks-copy-preview summary').click();
            await page.locator('.copy-box').screenshot({ path: path.join(output, 'copy-link-' + lang + '-' + width + '.png') });
          }
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
      await page.locator('#ks-prev').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#ks-cycle [aria-pressed="true"]').getAttribute('data-cycle-day'), '28');
      assert.equal(await page.locator('#ks-prev').evaluate(el => document.activeElement === el), true);
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
          if (d >= 22 && d <= 26) {
            assert.ok(await page.locator('#ks-card .tpts').count() > 0, 'KvK day ' + d + ': missing item scores');
            const reference = page.locator('#days .day').nth(d - 22);
            assert.ok(await reference.locator('.pt .pts').count() > 0, 'KvK day ' + d + ': missing scoring table');
            assert.equal(await page.locator('#ks-card, #days').allTextContents().then(texts => /200[,.\s]?000/.test(texts.join(' '))), false, 'KvK day ' + d + ': fixed reward total');
          }
          if (d === 22) assert.equal(await page.locator('#ks-card .trow').filter({ hasText: 'Tempered TG' }).locator('.tpts').textContent(), '30,000');
          if (d === 25) {
            assert.equal(await page.locator('#ks-card .trow').filter({ hasText: 'Mithril' }).locator('.tpts').textContent(), '40,000');
            assert.equal(await page.locator('#ks-card .trow').filter({ hasText: 'Troop' }).locator('.tpts').textContent(), '75 (T11)');
          }
          let withoutLink;
          for (const includeLink of [false, true, false]) {
            await page.locator('#ks-copy-link').setChecked(includeLink);
            const parts = page.locator('#ks-copy-parts button');
            const count = Math.max(1, await parts.count());
            const messages = [];
            for (let n = 0; n < count; n++) {
              if (await parts.count()) await parts.nth(n).click();
              const message = await page.locator('#ks-copy-out').inputValue();
              messages.push(message);
              assert.ok(message.length <= 512, 'day ' + d + ': message limit');
              assert.equal(await page.locator('#ks-copy-meta b').textContent(), String(message.length));
              for (const line of message.split('\n')) assert.ok(displayCells(line) <= 28, 'day ' + d + ': line too wide: ' + line);
              await page.locator('#ks-copy-btn').click();
              await page.waitForFunction(() => !document.getElementById('ks-copy-btn').disabled);
              assert.equal(await page.evaluate(() => window.copiedMessages.at(-1)), message);
              assert.equal(await page.locator('#ks-copy-status').textContent(), dictionaries.en['ks.today.copied']);
            }
            const combined = messages.join('\n');
            if (withoutLink === undefined) withoutLink = combined;
            assert.equal(combined, withoutLink + (includeLink ? '\nhttps://dey.ci/events/' : ''), 'day ' + d + ': optional canonical link');
          }
        }
        await page.locator('#ks-copy-link').focus();
        await page.keyboard.press('Space');
        assert.equal(await page.locator('#ks-copy-link').isChecked(), true);
        await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('denied'); }; document.execCommand = () => false; });
        await page.locator('#ks-copy-btn').click();
        await page.waitForFunction(() => document.getElementById('ks-copy-preview').open);
        assert.equal(await page.locator('#ks-copy-status').textContent(), dictionaries.en['ks.today.copyFailed']);
        await page.route('**/i18n/ar.js*', async route => {
          const response = await route.fetch();
          await new Promise(resolve => setTimeout(resolve, 250));
          await route.fulfill({ response });
        });
        // switchTo sets lang before the dictionary arrives; the change event
        // fires after applying it and repainting the page's dynamic controls.
        await page.evaluate(() => new Promise(resolve => {
          document.addEventListener('i18n:change', () => resolve(), { once: true });
          window.I18N.switchTo('ar');
        }));
        assert.equal(await page.evaluate(() => window.I18N.lang), 'ar');
        assert.equal(await page.locator('#ks-cycle [aria-pressed="true"]').getAttribute('data-cycle-day'), '28');
        assert.equal(await page.locator('#ks-copy-link').isChecked(), true, 'site-link choice survives language change');
        assert.equal(await page.locator('.copy-link-option span').textContent(), dictionaries.ar['ks.today.includeLink']);
        assert.ok((await page.locator('#ks-copy-out').inputValue()).endsWith('https://dey.ci/events/'));
      }
      assert.deepEqual(errors, [], lang + ': browser errors');
      await page.close();
    }
  } finally {
    fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify(report, null, 2));
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
  console.log('Passed 100 layout checks across 17 languages, copy placement, optional canonical site links and message limits for all 28 days, KvK task display, day 20 reminders, navigation, UTC rollover, clipboard success/failure and RTL.');
})().catch(error => { console.error(error); process.exitCode = 1; });
