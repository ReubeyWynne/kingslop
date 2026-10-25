// Every language carries every Hero gear string, with English's placeholders and markup, and the
// page never shows a key name (mythicQuality, weightedGain) or overflows a 320px phone.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { withBrowser } = require('./lib/browser-harness.cjs');
const langs = JSON.parse(fs.readFileSync('_data/langs.json', 'utf8')).map(l => l.h).filter(h => fs.existsSync('i18n/' + h + '.js'));
const dict = lang => { const sandbox = { window: {} }; vm.runInNewContext(fs.readFileSync('i18n/' + lang + '.js', 'utf8'), sandbox); return sandbox.window.__BH_I18N_DATA[lang]; };
const en = dict('en');
const keys = Object.keys(en).filter(k => k.startsWith('gear.'));
const holes = s => (s.match(/\{\w+\}/g) || []).sort().join();
const tags = s => (s.match(/<[^>]+>/g) || []).join('');
assert.equal(langs.length, 17, 'every language');
langs.forEach(lang => {
  const d = dict(lang);
  keys.forEach(k => {
    assert.ok(typeof d[k] === 'string' && d[k].trim(), lang + ' ' + k);
    assert.equal(holes(d[k]), holes(en[k]), lang + ' ' + k + ' placeholders');
    assert.equal(tags(d[k]), tags(en[k]), lang + ' ' + k + ' markup');
  });
});
// A missing string falls back to its key, so a camelCase key name on the page is a missing string.
const names = new Set(keys.map(k => k.slice(5)).filter(k => /[a-z][A-Z]/.test(k)));
const gear = 'gear=m69.2-r120.11-m100.6-m72.3-m20.20-m100.0-r160.13-e80.0-r200.20-r200.20-r200.20-r200.20&w=growth';
async function check(page, label) {
  const found = await page.evaluate(names => {
    const out = [];
    const walk = document.createTreeWalker(document.querySelector('.gear-main'), NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) { const el = walk.currentNode.parentElement; if (el.getClientRects().length) out.push(walk.currentNode.textContent); }
    document.querySelectorAll('.gear-main [aria-label]').forEach(el => out.push(el.getAttribute('aria-label')));
    return out.flatMap(t => t.split(/[^A-Za-z]+/)).filter(w => names.includes(w));
  }, [...names]);
  assert.deepEqual(found, [], label + ' shows key names');
  const wide = await page.evaluate(() => [...document.querySelectorAll('.gear-main *')]
    .filter(el => el.getClientRects().length && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible' && !el.closest('svg, .gear-table-wrap'))
    .map(el => (el.id || el.className || el.tagName) + ': ' + el.textContent.trim().slice(0, 40)));
  assert.deepEqual(wide, [], label + ' text overflows its box');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label + ' scrolls sideways');
}
withBrowser({ root: path.resolve('_site') }, async ({ browser, origin }) => {
  const page = await browser.newPage({ viewport: { width: 320, height: 900 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  for (const lang of langs) {
    await page.goto(origin + '/hero-gear/?lang=' + lang + '&' + gear);
    await page.waitForFunction(() => document.querySelectorAll('#gear-rows .gear-row').length === 4);
    await check(page, lang + ' gear');
    await page.locator('#gear-view-plan').click();
    for (const mode of ['plan', 'optimise', 'milestones', 'split']) {
      await page.locator('#gear-mode-' + mode).click();
      if (mode === 'optimise') await page.locator('.gear-result-troops button').first().waitFor();
      if (mode === 'split') await page.locator('.gear-split').first().waitFor();
      await check(page, lang + ' ' + mode);
    }
    for (const tab of ['settings', 'theory']) {
      await page.locator('#gear-page-' + tab).click();
      await page.evaluate(() => document.querySelectorAll('.gear-main details').forEach(d => { d.open = true; }));
      await check(page, lang + ' ' + tab);
    }
  }
  assert.deepEqual(errors, []);
  console.log('Hero gear strings checked in ' + langs.length + ' languages at 320px');
});
