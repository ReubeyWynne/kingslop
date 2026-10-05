const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve('_site');
const output = path.resolve('.dsh/remaining-pages-preview');
const langs = ['en', 'es', 'pt-BR', 'de', 'fr', 'it', 'ru', 'pl', 'tr', 'zh-Hans', 'zh-Hant', 'ko', 'ja', 'th', 'id', 'vi', 'ar'];
const routes = ['', 'vikings-vengeance/', 'swordland-showdown/', 'vip-calculator/', 'battle-simulator/'];
const first = ['top', 'routine', 'checklist', 'calc', 'console'];
const layoutFailures = [];
for (const lang of langs) {
  const scope = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'i18n', lang + '.js'), 'utf8'), scope);
  for (const key of ['home.hero.h1', 'home.hero.lede', 'sw.hero.lede', 'sw.hero.chip1', 'sw.hero.chip2', 'sw.hero.chip3']) assert.ok(scope.window.__BH_I18N_DATA[lang][key], lang + ': ' + key);
}
fs.mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };
const server = http.createServer((request, response) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  if (file !== root && !file.startsWith(root + path.sep)) return response.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return response.writeHead(404).end();
  response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});
async function setRange(page, id, value) {
  await page.locator(id).evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
}
async function overflow(page, message) {
  const bad = await page.evaluate(() => [...document.querySelectorAll('main, main section, main .calc, main .sim-report, main .vip-out, main .vip-ref')].filter(el => el.getClientRects().length && el.scrollWidth > el.clientWidth + 2).map(el => el.id || el.className));
  if (bad.length) {
    await page.screenshot({ path: path.join(output, 'failure-' + message.replace(/[^a-z0-9]+/gi, '-') + '.png'), fullPage: true });
    console.error(JSON.stringify(await page.locator('main section').evaluateAll(els => els.filter(el => el.scrollWidth > el.clientWidth + 2).map(el => ({ id: el.id, client: el.clientWidth, scroll: el.scrollWidth, nodes: [...el.querySelectorAll('*')].filter(node => node.getClientRects().length && (node.getBoundingClientRect().right > el.getBoundingClientRect().right + 1 || node.scrollWidth > node.clientWidth + 2)).map(node => ({ tag: node.tagName, id: node.id, className: node.className, client: node.clientWidth, scroll: node.scrollWidth, width: node.getBoundingClientRect().width, right: node.getBoundingClientRect().right })) })))));
  }
  if (bad.length) layoutFailures.push({ message, elements: bad });
  if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)) layoutFailures.push({ message, elements: ['page'] });
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  const report = [];
  try {
    browser = await chromium.launch();
    const origin = 'http://127.0.0.1:' + server.address().port;
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    for (const [lang, width] of [...langs.map(lang => [lang, 320]), ...[390, 768, 1280].flatMap(width => [['en', width], ['ar', width]])]) {
      for (const [i, route] of routes.entries()) {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.setViewportSize({ width, height: 900 });
        await page.goto(origin + '/' + route + '?lang=' + lang, { waitUntil: 'networkidle' });
        assert.deepEqual(errors, [], lang + ' ' + route + ': initial script errors');
        await page.waitForFunction(() => !!window.BH && !!window.I18N);
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.evaluate(() => document.documentElement.lang), lang);
        assert.equal(await page.evaluate(() => document.documentElement.dir), lang === 'ar' ? 'rtl' : 'ltr');
        const ids = await page.locator('main [id]').evaluateAll(els => els.map(el => el.id));
        assert.equal(new Set(ids).size, ids.length, route + ': duplicate IDs');
        const sections = await page.locator('main > section').evaluateAll(els => els.map(el => el.id));
        assert.equal(sections[i === 0 ? 0 : 1], first[i]);
        const buttons = page.locator('.section-toggle');
        for (const button of await buttons.all()) {
          assert.equal(await button.getAttribute('aria-expanded'), width > 760 ? 'true' : 'false');
          await button.click();
          await button.click();
          const bounds = await button.boundingBox();
          assert.ok(bounds.height >= 44 && bounds.width >= 44);
        }
        await overflow(page, lang + ' ' + route + ' ' + width);
        if (route === 'vikings-vengeance/' && ['en', 'ar'].includes(lang) && width === 390) {
          await page.screenshot({ path: path.join(output, 'vikings-collapsed-' + lang + '-390.png'), fullPage: true });
        }
        if (width <= 760 && await buttons.count()) {
          const href = await page.locator('.toc a').evaluateAll(links => links.find(a => document.querySelector(a.getAttribute('href') + '[data-collapse]'))?.getAttribute('href'));
          await page.evaluate(() => { window.testHashDone = false; window.addEventListener('hashchange', () => { window.testHashDone = true; }, { once: true }); });
          await page.locator('.toc a[href="' + href + '"]').click();
          await page.waitForFunction(() => window.testHashDone);
          assert.equal(await page.locator(href + ' .section-toggle').getAttribute('aria-expanded'), 'true');
          await page.locator(href + ' .section-toggle').focus();
          await page.keyboard.press('Enter');
          assert.equal(await page.locator(href + ' .section-toggle').getAttribute('aria-expanded'), 'false');
          await page.keyboard.press('Space');
          assert.equal(await page.locator(href + ' .section-toggle').getAttribute('aria-expanded'), 'true');
        }
        await page.evaluate(() => document.querySelectorAll('.section-toggle[aria-expanded="false"]').forEach(b => b.click()));
        await overflow(page, lang + ' ' + route + ' expanded ' + width);
        if (!route) {
          assert.equal(await page.locator('main .event-card[href]').count(), 6);
          assert.equal(await page.locator('.event-ghost').count(), 0);
          assert.ok(!(await page.locator('main').innerText()).includes('undefined'));
        }
        if (route === 'vip-calculator/') {
          assert.equal(await page.locator('#vip-out .vip-row').count(), 7);
          const before = await page.locator('#vip-headline').innerText();
          await page.locator('#vip-days').fill('0');
          assert.equal(await page.locator('#vip-out').isVisible(), false);
          await page.locator('#vip-days').fill('120');
          assert.equal(await page.locator('#vip-headline').innerText(), before);
          await setRange(page, '#vip-level', '12');
          assert.equal(await page.locator('#vip-xp').isDisabled(), true);
          assert.equal(await page.locator('#vip-out').isVisible(), false);
          await setRange(page, '#vip-level', '5');
          assert.equal(await page.locator('#vip-xp').isDisabled(), false);
        }
        if (route === 'swordland-showdown/') {
          await setRange(page, '#sw-occ', '55');
          assert.equal(await page.locator('#sw-total').innerText(), await page.evaluate(() => BH.fmt(165000)));
          await setRange(page, '#sw-kill', '2000000');
          assert.equal(await page.locator('#sw-total').innerText(), await page.evaluate(() => BH.fmt(181000)));
        }
        if (route === 'vikings-vengeance/') {
          await setRange(page, '#vv-cities', '0');
          assert.ok((await page.locator('#vv-outline').innerText()).includes('0'));
          await setRange(page, '#vv-cities', '6');
          assert.ok((await page.locator('#vv-outline').innerText()).includes('6'));
        }
        if (route === 'battle-simulator/') {
          await page.locator('#sim-atk-inf').fill('333');
          for (const mode of ['mystic', 'pve', 'bear-damage', 'bear-ratio']) {
            await page.locator('.mode-rail a[data-mode="' + mode + '"]').click();
            assert.equal(await page.locator('#sim-load').isVisible(), mode.startsWith('bear'));
            assert.equal(await page.locator('.sim-panel:visible').count(), 1);
            assert.ok(page.url().includes('lang=' + lang));
            await overflow(page, lang + ' simulator mode ' + mode);
            if (mode === 'mystic') {
              assert.ok(await page.locator('#sim-rooms').evaluate(table => {
                const headers = table.querySelector('.sim-head').children;
                return [...table.querySelectorAll('.sim-row')].every(row =>
                  Math.abs(row.querySelector('.room-ratio').getBoundingClientRect().right - headers[2].getBoundingClientRect().right) < 1 &&
                  Math.abs(row.querySelector('.room-alt').getBoundingClientRect().right - headers[3].getBoundingClientRect().right) < 1);
              }), lang + ': Mystic headers align with their values');
            }
            if (mode === 'mystic' && ['en', 'ar'].includes(lang) && [390, 1280].includes(width)) {
              await page.locator('#sim-rooms').screenshot({ path: path.join(output, 'mystic-rooms-' + lang + '-' + width + '.png') });
            }
          }
          assert.equal(await page.locator('#sim-atk-inf').inputValue(), '333');
          await page.goBack();
          assert.equal(await page.locator('.mode-rail [aria-current]').getAttribute('data-mode'), 'bear-damage');
        }
        if (['en', 'ar'].includes(lang) && [390, 1280].includes(width)) {
          await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
          await page.screenshot({ path: path.join(output, (route.split('/')[0] || 'home') + '-' + lang + '-' + width + '.png'), fullPage: true });
        }
        assert.deepEqual(errors, [], lang + ' ' + route);
        report.push({ lang, route, width });
        await page.close();
      }
    }
    const page = await context.newPage();
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(origin + '/vip-calculator/?lang=en#table', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('#table .section-toggle').getAttribute('aria-expanded'), 'true');
    await page.locator('#vip-xp').fill('23456');
    await page.locator('#table .section-toggle').click();
    await page.evaluate(() => I18N.switchTo('ar'));
    await page.waitForFunction(() => document.documentElement.lang === 'ar' && I18N.t['home.hero.lede'].includes('فعاليات'));
    assert.equal(await page.locator('#vip-xp').inputValue(), '23456');
    assert.equal(await page.locator('#table .section-toggle').getAttribute('aria-expanded'), 'false');
    const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
    for (const route of routes) {
      const p = await noJs.newPage();
      await p.goto(origin + '/' + route);
      assert.equal(await p.locator('.section-body[hidden]').count(), 0);
      await overflow(p, route + ' no JavaScript');
      await p.close();
    }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(output, 'layout-failures.json'), JSON.stringify(layoutFailures, null, 2));
    assert.deepEqual(layoutFailures, [], 'remaining-page layout failures');
    console.log(report.length + ' remaining-page layout and interaction checks passed');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
