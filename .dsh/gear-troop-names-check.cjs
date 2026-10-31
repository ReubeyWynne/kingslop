// Hero gear names troops and slots in every language, never by their codes (cav, helm), and every
// dictionary carries the gear page's troop and slot names that other pages borrow.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { withBrowser } = require('./lib/browser-harness.cjs');
const E = require('../js/hero-gear-engine.js');
const langs = JSON.parse(fs.readFileSync('_data/langs.json', 'utf8')).map(l => l.h).filter(h => fs.existsSync('i18n/' + h + '.js'));
const dict = lang => { const sandbox = { window: {} }; vm.runInNewContext(fs.readFileSync('i18n/' + lang + '.js', 'utf8'), sandbox); return sandbox.window.__BH_I18N_DATA[lang]; };
const codes = E.TYPES.concat(E.SLOTS);
assert.equal(langs.length, 17, 'every language');
langs.forEach(lang => {
  const d = dict(lang);
  codes.forEach(code => assert.ok(typeof d['gear.' + code] === 'string' && d['gear.' + code].trim() && d['gear.' + code] !== code, lang + ' gear.' + code));
  E.TYPES.forEach(type => assert.ok(d['sim.calc.' + type], lang + ' sim.calc.' + type));
});
// Text the page builds from troop and slot codes: troop cards and their tiles, the troop view,
// weight rows, troop roles, % of optimal's comparisons, Spend now's tiles and Worth saving for.
const raw = new RegExp('(^|[^A-Za-z])(' + codes.join('|') + ')([^A-Za-z]|$)');
const shown = page => page.evaluate(() => [...document.querySelectorAll('.gear-card-open, .gear-card .gear-row, #gear-detail h3, #gear-detail .gear-row, .gear-weight-grid > span, #gear-roles strong, .gear-result-grid > *, .gear-kept, .gear-route')]
  .filter(el => el.getClientRects().length).map(el => el.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean));
const gear = 'gear=m69.2-r120.11-m100.6-m72.3-m20.20-m100.0-r160.13-e80.0-r200.20-r200.20-r200.20-r200.20&w=growth';
withBrowser({ root: path.resolve('_site') }, async ({ browser, origin }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  for (const lang of langs) {
    const d = dict(lang);
    await page.goto(origin + '/hero-gear/?lang=' + lang + '&' + gear);
    await page.waitForFunction(() => document.querySelectorAll('.gear-card .gear-row').length === 12 && document.querySelector('#gear-optimal .gear-headline'), null, { timeout: 90000 });
    assert.match(await page.locator('[data-open="cav"]').textContent(), new RegExp('^' + d['gear.cav']), lang + ' cavalry card');
    let texts = await shown(page);
    if (await page.locator('#gear-show-optimal').count()) { await page.locator('#gear-show-optimal').check(); texts = texts.concat(await shown(page)); await page.locator('#gear-show-optimal').uncheck(); }
    await page.locator('[data-open="arc"]').click();
    await page.locator('#gear-detail .gear-board').waitFor();
    texts = texts.concat(await shown(page));
    assert.ok(texts.some(t => t.includes(d['gear.chest'])), lang + ' names a slot');
    assert.deepEqual(texts.filter(t => raw.test(t)), [], lang + ' shows a troop or slot code');
  }
  assert.deepEqual(errors, []);
  console.log('Hero gear troop and slot names checked in ' + langs.length + ' languages');
});
