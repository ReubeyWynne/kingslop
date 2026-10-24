const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { withBrowser } = require('./lib/browser-harness.cjs');

const root = path.resolve('_site');
const output = path.resolve('.dsh/visual-preview');
const langs = ['en', 'es', 'pt-BR', 'de', 'fr', 'it', 'ru', 'pl', 'tr', 'zh-Hans', 'zh-Hant', 'ko', 'ja', 'th', 'id', 'vi', 'ar'];
const diagrams = ['rally-anatomy', 'march-composition', 'hunt-opening'];
const screenshotStyle = '.topbar, .toc { visibility: hidden !important; }';

fs.mkdirSync(output, { recursive: true });
const dictionaries = {};
for (const lang of langs) {
  const scope = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'i18n', lang + '.js'), 'utf8'), scope);
  dictionaries[lang] = scope.window.__BH_I18N_DATA[lang];
  assert.ok(dictionaries[lang]['bh.opening.rallying'], lang + ': missing rallying label');
  assert.equal(dictionaries[lang]['bh.opening.gathering'], undefined, lang + ': stale gathering label');
}

withBrowser({ root }, async ({ browser, origin: base }) => {
  const report = [];
  const failures = [];
  try {
    const context = await browser.newContext();
    for (const [lang, width] of [...langs.map(lang => [lang, 320]), ['en', 390], ['en', 1280], ['ar', 1280]]) {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(base + '/bear-hunt/?lang=' + lang, { waitUntil: 'networkidle' });
      await page.waitForFunction(lang => document.documentElement.lang === lang && window.__BH_I18N_DATA?.[lang], lang);
      await page.evaluate(() => document.fonts.ready);
      for (const section of ['marches', 'timing']) {
        const toggle = page.locator('#' + section + ' .section-toggle');
        if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
      }
      for (const name of diagrams) {
        const figure = page.locator('.' + name);
        await figure.scrollIntoViewIfNeeded();
        const metrics = await figure.evaluate(el => {
          const bounds = el.getBoundingClientRect();
          const outside = [...el.querySelectorAll('*')].filter(node => {
            const box = node.getBoundingClientRect();
            return box.width > 0 && (box.left < bounds.left - 1 || box.right > bounds.right + 1 || node.scrollWidth > node.clientWidth + 1 && node.clientWidth > 0 && !['svg', 'use', 'path'].includes(node.tagName));
          }).map(node => node.className?.baseVal ?? node.className ?? node.tagName);
          return { outside, images: [...el.querySelectorAll('img')].every(img => img.complete && img.naturalWidth > 0), direction: document.documentElement.dir };
        });
        await figure.screenshot({ path: path.join(output, lang + '-' + width + '-' + name + '.png'), style: screenshotStyle });
        report.push({ lang, width, name, ...metrics });
        if (metrics.outside.length || !metrics.images || metrics.direction !== (lang === 'ar' ? 'rtl' : 'ltr')) failures.push({ lang, width, name, ...metrics });
        for (const label of await figure.locator('[data-i18n]').all()) {
          const key = await label.getAttribute('data-i18n');
          const expected = dictionaries[lang][key];
          if (!expected || await label.textContent() !== expected) failures.push({ lang, width, name, key, problem: 'translation mismatch' });
        }
      }
      const figure = page.locator('.march-composition');
      const button = page.locator('#allocator-toggle');
      assert.equal(await page.locator('#march-queues > div').count(), 6);
      await button.click();
      assert.equal(await page.locator('#march-builder').isVisible(), true);
      await page.locator('#own-priority').check();
      assert.equal(await page.locator('#own-ratio').isVisible(), true);
      await page.locator('#march-builder').screenshot({ path: path.join(output, lang + '-' + width + '-allocator-inputs.png'), style: screenshotStyle });
      const inputOverflow = await figure.evaluate(el => el.scrollWidth > el.clientWidth + 1);
      if (inputOverflow) failures.push({ lang, width, problem: 'allocator input overflow' });
      await page.locator('#march-builder button[type="submit"]').click();
      assert.equal(await page.locator('#march-builder').isVisible(), false);
      const formatted = await page.evaluate(() => ({ own: window.BH.fmt(130000), join: window.BH.fmt(77500), archers: window.BH.fmt(104000) }));
      assert.equal(await page.locator('#alloc-own').textContent(), formatted.own);
      assert.equal(await page.locator('#alloc-join').textContent(), formatted.join);
      assert.equal(await page.locator('#own-arc').textContent(), formatted.archers);
      assert.equal(await page.locator('#march-queues > div').count(), 6);
      assert.equal(await button.innerText(), dictionaries[lang]['bh.alloc.edit']);
      await figure.screenshot({ path: path.join(output, lang + '-' + width + '-allocator-priority.png'), style: screenshotStyle });
      if (await figure.evaluate(el => el.scrollWidth > el.clientWidth + 1)) failures.push({ lang, width, problem: 'allocator result overflow' });
      await button.click();
      await page.locator('#join-queues').fill('3');
      await page.locator('#own-infantry').fill('20');
      await page.locator('#own-cavalry').fill('30');
      await page.locator('#own-archers').fill('40');
      await page.locator('#march-builder button[type="submit"]').click();
      assert.equal(await page.locator('#march-builder').isVisible(), true);
      assert.equal(await page.locator('#own-archers').evaluate(el => el.validity.customError), true);
      await page.locator('#own-archers').fill('50');
      await page.locator('#march-builder button[type="submit"]').click();
      assert.equal(await page.locator('#march-builder').isVisible(), false);
      assert.equal(await page.locator('#march-queues > div').count(), 3);
      if (lang === 'en' || lang === 'ar') {
        const other = lang === 'en' ? 'ar' : 'en';
        await page.evaluate(code => window.I18N.switchTo(code), other);
        await page.waitForFunction(([code, text]) => window.I18N.lang === code && document.getElementById('allocator-toggle').textContent.trim() === text, [other, dictionaries[other]['bh.alloc.edit']]);
        assert.equal(await page.locator('#join-queues').inputValue(), '3');
        assert.equal(await page.locator('#own-infantry').inputValue(), '20');
        assert.equal(await page.locator('#alloc-own').textContent(), await page.evaluate(() => window.BH.fmt(130000)));
        await page.evaluate(code => window.I18N.switchTo(code), lang);
        await page.waitForFunction(([code, text]) => window.I18N.lang === code && document.getElementById('allocator-toggle').textContent.trim() === text, [lang, dictionaries[lang]['bh.alloc.edit']]);
      }
      await button.click();
      await page.locator('#own-priority').uncheck();
      assert.equal(await page.locator('#own-ratio').isVisible(), false);
      for (const id of ['infantry-total', 'cavalry-total', 'archer-total']) await page.locator('#' + id).fill('0');
      await page.locator('#join-queues').fill('0');
      await page.locator('#march-builder button[type="submit"]').click();
      assert.equal(await page.locator('#march-builder').isVisible(), false);
      assert.equal(await page.locator('#march-queues > div').count(), 0);
      assert.equal(await page.locator('#alloc-own').textContent(), await page.evaluate(() => window.BH.fmt(0)));
      const flow = await page.locator('.opening-scene').first().evaluate(el => [...el.children].filter(node => node.classList.contains('opening-entity')).map(node => node.getBoundingClientRect().left));
      if (lang === 'ar' ? flow[0] <= flow[1] : flow[0] >= flow[1]) failures.push({ lang, width, problem: 'march flow direction' });
      if (errors.length) failures.push({ lang, width, errors });
      await page.close();
    }
  } finally {
    fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ report, failures }, null, 2));
  }
  assert.equal(failures.length, 0, JSON.stringify(failures, null, 2));
  console.log('Passed ' + report.length + ' diagram checks across all 17 languages, mobile and desktop, including RTL.');
}).catch(error => { console.error(error); process.exitCode = 1; });
