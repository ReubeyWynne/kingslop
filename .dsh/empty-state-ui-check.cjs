// Teaching empty states on the tool pages (js/empty-state.js), after a Jekyll build: each tool with
// nothing to work from shows one line naming the missing part of the save, a screenshot reader only
// where an import adapter fills that part, and a link to where it is filled in by hand. It treats a
// confirmed zero as recorded, follows the save live, hides without JavaScript, and reads in every language and at 320px. Screenshots in .dsh/empty-state-preview/.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { withBrowser } = require('./lib/browser-harness.cjs');
const root = path.resolve('_site'), output = path.resolve('.dsh/empty-state-preview');
const EmptyState = require('../js/empty-state.js');

// Each tool: the part it needs, its line, whether it reads screenshots, where "Fill it in" goes,
// and how a player records that part.
const TOOLS = {
  'town-centre': { needs: 'inventory', key: 'empty.town', line: "Count what's in your bag to see the event points it can score.", import: true, fill: '#town-bag', section: '#town-points' },
  heroes: { needs: 'heroes', key: 'empty.heroes', line: 'Add your heroes to see your KvK points.', import: false, fill: '../town-centre/#town-heroes', section: '#kvk-points' },
  masters: { needs: 'masters', key: 'empty.masters', line: 'Add your masters to see your KvK points.', import: false, fill: '../town-centre/#town-masters', section: '#kvk-points' },
  pets: { needs: 'pets', key: 'empty.pets', line: 'Tame your pets to plan their Advances.', import: true, fill: '#cage', section: '#advances' }
};
const PAGES = Object.keys(TOOLS), KEYS = ['empty.import', 'empty.fill'].concat(PAGES.map(dir => TOOLS[dir].key));

// The rule itself, without a browser: unknown is missing, a confirmed zero is not.
const blank = { inventory: {}, heroGear: { pieces: {} }, governorGear: { status: 'unsupported', pieces: {} } };
assert.deepEqual(EmptyState.needs.sort(), ['governor', 'hero-gear', 'heroes', 'inventory', 'masters', 'pets']);
EmptyState.needs.forEach(need => assert.equal(EmptyState.missing(blank, need), true, need + ' is missing from a blank save'));
assert.equal(EmptyState.missing(blank, 'nothing'), false, 'an unknown part is never missing');
assert.equal(EmptyState.missing({ inventory: { forgehammer: { status: 'unknown', amount: null } } }, 'inventory'), true, 'an unknown count is not recorded');
assert.equal(EmptyState.missing({ inventory: { forgehammer: { status: 'confirmed', amount: 0 } } }, 'inventory'), false, 'a confirmed zero is recorded');
assert.equal(EmptyState.missing({ heroGear: { pieces: { 'inf-helm': { level: null } } } }, 'hero-gear'), true);
assert.equal(EmptyState.missing({ heroGear: { pieces: { 'inf-helm': { level: 0 } } } }, 'hero-gear'), false);
assert.equal(EmptyState.missing({ governorGear: { status: 'tracked', pieces: {} } }, 'governor'), true, 'a cleared governor is missing');
assert.equal(EmptyState.missing({ governorGear: { status: 'tracked', pieces: { 'inf-1': { level: 0 } } } }, 'governor'), false, 'not crafted is recorded');
['heroes', 'masters', 'pets'].forEach(section => assert.equal(EmptyState.missing({ [section]: { roster: { x: {} }, provenance: { x: {} } } }, section), false, section));

// Every dictionary carries every key, with no tags or placeholders to keep in step.
for (const file of fs.readdirSync('i18n').filter(f => f.endsWith('.js'))) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join('i18n', file), 'utf8'), sandbox);
  const lang = file.slice(0, -3), dict = sandbox.window.__BH_I18N_DATA[lang];
  KEYS.forEach(key => assert.ok(typeof dict[key] === 'string' && dict[key].trim(), lang + ' has ' + key));
}

withBrowser({ root }, async ({ browser, origin }) => {
  fs.mkdirSync(output, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.addInitScript(() => { window.moduleErrors = []; document.addEventListener('module:error', e => moduleErrors.push(e.detail)); });
  const note = () => page.locator('.empty-state');
  async function open(dir, lang) {
    await page.goto(origin + '/' + dir + '/?lang=' + (lang || 'en'));
    await page.waitForFunction(l => window.EmptyState && document.documentElement.lang === l && window.__BH_I18N_DATA && window.__BH_I18N_DATA[l], lang || 'en');
    await page.waitForTimeout(150);
  }

  // An empty save: every tool says what it is missing, inside the section it would fill.
  for (const dir of PAGES) {
    const tool = TOOLS[dir];
    await open(dir);
    assert.equal(await note().count(), 1, dir + ' has one empty state');
    assert.ok(await note().isVisible(), dir + ' shows it on an empty save');
    assert.equal(await note().getAttribute('data-needs'), tool.needs, dir);
    assert.ok(await page.locator(tool.section + ' .empty-state').count(), dir + ' puts it in ' + tool.section);
    assert.equal((await page.locator('.empty-state-line').textContent()).trim(), tool.line, dir);
    assert.equal(await page.locator('.empty-state [data-screen-import="pick"]').count(), tool.import ? 1 : 0, dir + (tool.import ? ' reads screenshots' : ' has no adapter, so no import'));
    assert.equal(await page.locator('.empty-state a').getAttribute('href'), tool.fill, dir);
    assert.equal((await page.locator('.empty-state a').textContent()).trim(), 'Fill it in', dir);
    await note().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, dir + '-390.png') });
  }

  // "Import a screenshot" opens the dock and asks for a file.
  await open('town-centre');
  await Promise.all([page.waitForEvent('filechooser'), page.locator('.empty-state button').click()]);
  assert.equal(await page.locator('#screen-import').getAttribute('data-open'), 'true', 'the dock opens');

  // "Fill it in" lands on the shelf, selected: on the page, and from another page.
  await open('town-centre');
  await page.locator('[aria-controls="town-speedups"]').click();
  await page.locator('.empty-state a').click();
  await page.waitForFunction(() => location.hash === '#town-bag' && !document.getElementById('town-bag').hidden);
  await open('heroes');
  await page.locator('.empty-state a').click();
  await page.waitForURL(/\/town-centre\/#town-heroes$/);
  await page.waitForFunction(() => !document.getElementById('town-heroes').hidden);
  await open('pets');
  await page.locator('.empty-state a').click();
  await page.waitForFunction(() => location.hash === '#cage');

  // Recording the part hides the note without a reload; a confirmed zero counts.
  const record = {
    'town-centre': () => window.PlayerLedger.shared().setBalance('forgehammer', 0),
    heroes: () => window.PlayerLedger.shared().setHero('jabel', { level: 60, stars: 10, widget: 2, skills: null }),
    masters: () => window.PlayerLedger.shared().setMaster('valora', { affinity: 29, ready: true, skills: [3, 2, 0, 0] }),
    pets: () => window.PlayerLedger.shared().setPet('lion', { level: 20, advanced: false })
  };
  for (const dir of PAGES) {
    await open(dir);
    assert.ok(await note().isVisible(), dir + ' still empty');
    await page.evaluate(record[dir]);
    await page.waitForFunction(() => document.querySelector('.empty-state').hidden);
    await page.reload();
    await page.waitForFunction(() => window.EmptyState);
    await page.waitForTimeout(150);
    assert.equal(await note().isVisible(), false, dir + ' stays hidden once recorded');
  }
  // Hero gear, like Governor gear, has its own screenshot box and sheet bar instead of a note.
  await page.evaluate(() => localStorage.clear());
  await page.goto(origin + '/hero-gear/?lang=en');
  await page.waitForFunction(() => document.querySelectorAll('.gear-row').length === 4);
  assert.equal(await note().count(), 0, 'hero gear carries no empty state');

  // Every language: the words come from the dictionary and no key leaks; Arabic rules on the right.
  const langs = fs.readdirSync('i18n').filter(f => f.endsWith('.js')).map(f => f.slice(0, -3));
  for (const lang of langs) {
    await open('pets', lang);
    const want = await page.evaluate(l => ['empty.pets', 'empty.import', 'empty.fill'].map(k => window.__BH_I18N_DATA[l][k]), lang);
    assert.equal((await page.locator('.empty-state-line').textContent()).trim(), want[0], lang);
    assert.equal((await page.locator('.empty-state button').textContent()).trim(), want[1], lang);
    assert.equal((await page.locator('.empty-state a').textContent()).trim(), want[2], lang);
    assert.doesNotMatch(await note().innerText(), /empty\.[a-z]/i, lang);
    if (lang === 'ar') assert.equal(await note().evaluate(n => getComputedStyle(n).borderRightStyle), 'solid');
    if (['de', 'ar', 'ja'].includes(lang)) { await note().scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, 'pets-' + lang + '-390.png') }); }
  }

  // 320px: no sideways scroll, and both ways stay tappable.
  await page.setViewportSize({ width: 320, height: 800 });
  for (const dir of PAGES) {
    await open(dir, 'de');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll on ' + dir);
    for (const way of await page.locator('.empty-state-ways > *').all()) assert.ok((await way.boundingBox()).height >= 44, dir + ' tap target');
  }
  await open('town-centre');
  await note().scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'town-centre-320.png') });
  assert.deepEqual(errors, []);
  assert.deepEqual(await page.evaluate(() => window.moduleErrors), []);

  // Without JavaScript the note stays hidden.
  const still = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } }), plain = await still.newPage();
  for (const dir of PAGES) {
    await plain.goto(origin + '/' + dir + '/');
    assert.equal(await plain.locator('.empty-state').isVisible(), false, dir + ' without JavaScript');
  }
  console.log('Empty states checked on ' + PAGES.length + ' pages in ' + langs.length + ' languages. Screenshots in .dsh/empty-state-preview/.');
}).catch(error => { console.error(error); process.exitCode = 1; });
