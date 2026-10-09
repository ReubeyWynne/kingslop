const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve('_site');
const nav = require('../_data/nav.json');
const pages = require('../_data/pages.json');
const tokens = nav.map(entry => pages[entry.self].token);
const output = path.resolve('.dsh/deck-preview');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((request, response) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  if (file !== root && !file.startsWith(root + path.sep)) return response.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return response.writeHead(404).end();
  response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});
async function selected(page, token) {
  await page.waitForFunction(token => {
    const card = document.querySelector('.deck-card.is-selected');
    const viewport = document.querySelector('.deck-viewport');
    return card?.dataset.page === token && Math.abs(card.offsetLeft + card.offsetWidth / 2 - viewport.scrollLeft - viewport.clientWidth / 2) < 2;
  }, token);
}
async function fits(page) {
  const geometry = await page.locator('.deck-card.is-selected').evaluate(card => {
    const r = card.getBoundingClientRect();
    const art = card.querySelector('.deck-ascii').getBoundingClientRect();
    const title = card.querySelector('.deck-card-title').getBoundingClientRect();
    const copy = card.querySelector('.deck-card-copy').getBoundingClientRect();
    return {
      x: Math.abs((art.left + art.right) / 2 - (r.left + r.right) / 2),
      y: Math.abs((art.top + art.bottom) / 2 - (r.top + r.bottom) / 2),
      titleClear: title.bottom <= art.top + 1,
      copyClear: copy.top >= art.bottom - 1,
      clipped: [...card.querySelectorAll('.deck-card-title,.deck-card-copy,.deck-card-lede')].some(el => el.scrollWidth > el.clientWidth + 2)
    };
  });
  assert.ok(geometry.x < 1 && geometry.y < 1, JSON.stringify(geometry));
  assert.ok(geometry.titleClear && geometry.copyClear && !geometry.clipped, JSON.stringify(geometry));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const origin = 'http://127.0.0.1:' + server.address().port;
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin + '/?lang=en');
      await page.waitForFunction(() => document.querySelector('#ledger-btn').getAttribute('aria-controls') === 'page-deck');
      await page.locator('#ledger-btn').click();
      for (const token of tokens) {
        await selected(page, token);
        await fits(page);
        assert.equal(await page.locator('.deck-card.is-selected .deck-ascii > *').count() > 0, true);
        assert.deepEqual(await page.locator('.deck-ascii > *,.ascii-ambient > span').evaluateAll(elements => [...new Set(elements.flatMap(el => ['', '::before', '::after'].map(pseudo => getComputedStyle(el, pseudo || null).animationName)))]), ['none']);
        await page.screenshot({ path: path.join(output, `${viewport.width}-${token}.png`) });
        await page.locator('.deck-next').click();
      }
      await selected(page, 'home');
      await page.locator('.deck-prev').click();
      await selected(page, 'gear');
      await page.keyboard.press('Home');
      await selected(page, 'home');
      await page.locator('[data-deck-group="tools"]').click();
      await selected(page, 'vip');
      await page.keyboard.press('ArrowRight');
      await selected(page, 'sim');
      assert.equal(await page.locator('.deck-card.is-selected').evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#ledger-btn').evaluate(el => el === document.activeElement), true);
      assert.equal(await page.locator('html').getAttribute('data-page'), 'home');
      assert.deepEqual(errors, []);
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(origin + '/?lang=en');
    await page.waitForFunction(() => document.querySelector('#ledger-btn').getAttribute('aria-controls') === 'page-deck');
    await page.locator('#ledger-btn').click();
    await selected(page, 'home');
    await page.waitForTimeout(1100);
    const flameBefore = await page.locator('.deck-card.is-selected .ascii-campfire .flame').evaluate(el => getComputedStyle(el, '::before').content);
    await page.waitForTimeout(180);
    const flameAfter = await page.locator('.deck-card.is-selected .ascii-campfire .flame').evaluate(el => getComputedStyle(el, '::before').content);
    assert.notEqual(flameBefore, flameAfter);
    assert.equal(await page.locator('.deck-card.is-selected .ascii-campfire .flame').evaluate(el => getComputedStyle(el).transform), 'none');
    assert.match(await page.locator('.deck-card.is-selected .ascii-campfire .flame').evaluate(el => getComputedStyle(el, '::before').animationTimingFunction), /steps/);
    // A jump across several cards moves the ground straight from the old
    // page's colour to the new one: no stop at the cards it passes, and no
    // dip in brightness on the way (a cross-fade of two washes used to pulse).
    const ground = () => page.locator('#page-deck .deck-ground').evaluate(el => {
      const c = document.createElement('canvas').getContext('2d');
      c.fillStyle = getComputedStyle(el).backgroundColor; c.fillRect(0, 0, 1, 1);
      return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3);
    });
    const lightness = rgb => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    const start = await ground();
    const trail = [];
    const picked = new Set();
    await page.locator('[data-deck-group="tools"]').click();
    for (let i = 0; i < 30; i++) {
      trail.push(await ground());
      picked.add(await page.locator('.deck-card.is-selected').getAttribute('data-page'));
      await page.waitForTimeout(40);
    }
    await selected(page, 'vip');
    await page.waitForTimeout(1000);
    const end = await ground();
    assert.deepEqual([...picked], ['vip']);
    assert.notDeepEqual(start, end);
    assert.ok(trail.some(rgb => rgb.join() !== start.join() && rgb.join() !== end.join()), 'the ground blends');
    const floor = Math.min(lightness(start), lightness(end)) - 1.5;
    assert.ok(trail.every(rgb => lightness(rgb) >= floor), JSON.stringify({ start, end, trail }));
    // The deck is a ring: past either end it carries on into a copy of the
    // covers and settles back on the real one without a visible jump.
    await page.keyboard.press('Home');
    await selected(page, 'home');
    const startLeft = await page.locator('.deck-viewport').evaluate(el => el.scrollLeft);
    await page.locator('.deck-prev').click();
    await page.waitForTimeout(900);
    await selected(page, 'gear');
    const ring = await page.evaluate(() => {
      const v = document.querySelector('.deck-viewport');
      const c = v.scrollLeft + v.clientWidth / 2;
      const at = [...v.querySelectorAll('.deck-card')].sort((a, b) => Math.abs(a.offsetLeft + a.offsetWidth / 2 - c) - Math.abs(b.offsetLeft + b.offsetWidth / 2 - c))[0];
      return { copy: at.classList.contains('deck-copy'), page: at.dataset.page, copies: v.querySelectorAll('.deck-copy[inert][aria-hidden="true"]').length / v.querySelectorAll('.deck-card:not(.deck-copy)').length };
    });
    assert.deepEqual(ring, { copy: false, page: 'gear', copies: 2 });
    await page.locator('.deck-next').click();
    await selected(page, 'home');
    assert.ok(Math.abs(await page.locator('.deck-viewport').evaluate(el => el.scrollLeft) - startLeft) < 2);
    await page.locator('[data-deck-group="tools"]').click();
    await selected(page, 'vip');
    assert.equal(await page.locator('.deck-card.is-selected .ascii-mini--crown').evaluate(el => getComputedStyle(el, '::before').animationPlayState), 'running');
    assert.equal(await page.locator('.deck-card:not(.is-selected) .ascii-mini--bear').first().evaluate(el => getComputedStyle(el, '::before').animationPlayState), 'paused');
    // Covers keep their own colours whichever is selected, and the ring's
    // copies of the selected cover run with it.
    const covers = () => page.locator('.deck-card').evaluateAll(cards => cards.map(card => getComputedStyle(card.querySelector('.deck-card-title')).color + getComputedStyle(card).borderTopColor));
    const vipCovers = await covers();
    await page.keyboard.press('Home');
    await selected(page, 'home');
    await page.waitForTimeout(800);
    assert.deepEqual(await covers(), vipCovers);
    assert.deepEqual(await page.locator('.deck-card.is-running').evaluateAll(cards => cards.map(card => card.dataset.page)), ['home', 'home', 'home']);
    for (const lang of ['de', 'ar']) {
      await page.goto(origin + '/?lang=' + lang);
      await page.waitForFunction(() => document.querySelector('#ledger-btn').getAttribute('aria-controls') === 'page-deck');
      await page.locator('#ledger-btn').click();
      for (const token of tokens) {
        await selected(page, token); await fits(page);
        await page.locator('.deck-next').click();
      }
    }
    await page.evaluate(() => document.documentElement.style.fontSize = '200%');
    await selected(page, 'home');
    await fits(page);
    await page.close();
    console.log('Deck geometry, native scrolling, keyboard, colour interpolation, translations and reduced motion passed.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });

