// Next-step lines on the tool pages (js/next-step.js), after a Jekyll build: each page shows only
// its own kinds of UpgradePriority.evaluate steps, in the priority page's words, links back to the
// whole order, follows the save live, hides under hero gear guest mode and without JavaScript,
// and reads in three languages and at 320px. Screenshots in .dsh/next-step-preview/.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
const root = path.resolve('_site'), output = path.resolve('.dsh/next-step-preview');
const PAGES = ['town-centre', 'heroes', 'hero-gear', 'governor-gear', 'pets', 'masters'];
withBrowser({ root }, async ({ browser, origin }) => {
  fs.mkdirSync(output, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.addInitScript(() => { window.moduleErrors = []; document.addEventListener('module:error', e => moduleErrors.push(e.detail)); });
  const hint = () => page.locator('.next-step');
  const titles = () => page.locator('.next-step-list li b').allTextContents();
  // What the line should say: the engine's steps of the page's kinds, in the shared words.
  const expected = () => page.evaluate(() => {
    const root = document.querySelector('.next-step'), kinds = root.dataset.kinds.split(' ');
    const words = window.UpgradePriorityWords(window.BH), result = window.UpgradePriority.evaluate(window.PlayerLedger.shared().snapshot());
    return result.actions.filter(s => { const k = s.kind === 'record' ? 'record:' + s.params.what : s.kind; return k === 'record:town-center' || kinds.includes(k); }).slice(0, 2).map(s => words.words(s)[0]);
  });
  async function open(dir, lang) {
    await page.goto(origin + '/' + dir + '/?lang=' + (lang || 'en'));
    // English pages boot once the dictionary arrives after first paint, which can follow load.
    await page.evaluate(() => new Promise(resolve => window.I18N.onReady(resolve)));
    await page.waitForFunction(() => window.UpgradePriority && document.querySelector('.next-step') && (document.querySelector('.next-step').hidden || document.querySelector('.next-step-list li')));
  }

  // An empty save asks for the Town Centre first on every page, since the stage depends on it,
  // then for the page's own facts.
  const empty = { 'town-centre': [], heroes: ['Record your heroes'], 'hero-gear': [], 'governor-gear': [], pets: ['Record your pets'], masters: [] };
  for (const dir of PAGES) {
    await open(dir);
    assert.ok(await hint().isVisible(), dir + ' shows a line on an empty save');
    assert.deepEqual(await titles(), ['Record your Town Center level'].concat(empty[dir]), dir);
    assert.match(await page.locator('.next-step-more').getAttribute('href'), /^\.\.\/upgrade-priority\/#next$/, dir);
  }
  await page.locator('.next-step-more').click();
  await page.waitForURL(/\/upgrade-priority\/#next$/);

  // A TC 24 joiner: each page shows its own steps and no other page's.
  await page.evaluate(() => {
    const store = window.PlayerLedger.shared();
    store.setBuildings({ 'town-center': '24', embassy: '23', barracks: '22' });
    store.setHero('jabel', { level: 60, stars: 10, widget: 2, skills: null });
    store.setBalance('mythic-hero-shard', 200);
    store.setGovernor('gear', { 'inf-1': 30, 'inf-2': 30, 'cav-1': 30, 'cav-2': 30, 'arc-1': 30, 'arc-2': 30 });
    store.setPet('lion', { level: 20, advanced: false });
    store.setMaster('valora', { affinity: 29, ready: true, skills: [3, 2, 0, 0] });
    store.setBalance(window.PlayerLedger.masterEmblemId('valora'), 100000);
    store.setBalance('general-master-emblem', 0);
    store.setBalance('masters-manuscript', 0);
  });
  const want = {
    'town-centre': [/^Raise the Embassy from 23 to 24$/, /^Raise the Barracks from 22 to 24$/],
    heroes: [/^Ascend Jabel from /],
    'hero-gear': [/^Record your hero gear$/],
    'governor-gear': [/^Record your governor materials$/],
    pets: [/^Advance Lion$/],
    masters: [/^Unlock Valora's next class: /]
  };
  for (const dir of PAGES) {
    await open(dir);
    const shown = await titles();
    assert.deepEqual(shown, await expected(), dir + ' follows the engine');
    want[dir].forEach((re, at) => assert.match(shown[at] || '', re, dir));
    assert.equal(await page.locator('.next-step-list li').count(), shown.length);
    assert.ok(shown.length <= 2, dir + ' keeps it short');
    await hint().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, dir + '-390.png') });
  }

  // The line follows the save without a reload: governor materials, then hero gear.
  await open('governor-gear');
  await page.evaluate(() => { const store = window.PlayerLedger.shared(); Object.entries({ satin: 800000, 'gilded-threads': 8000, 'artisans-vision': 2000 }).forEach(([id, n]) => store.setBalance(id, n)); });
  await page.waitForFunction(() => /^Raise the /.test(document.querySelector('.next-step-list li b').textContent));
  assert.deepEqual(await titles(), await expected());
  await open('hero-gear');
  await page.evaluate(() => {
    const store = window.PlayerLedger.shared(), gear = store.heroGear(window.HeroGear);
    Object.keys(gear.pieces).forEach(k => { gear.pieces[k] = window.HeroGear.normalisePiece({ quality: 'mythic', level: 100, mastery: 10 }); });
    store.writeHeroGear(gear, window.HeroGear, { all: true });
    [['hero-gear-xp', 60000], ['forgehammer', 500], ['spare-mythic-gear', 6], ['mithril', 10]].forEach(([id, n]) => store.setBalance(id, n));
  });
  await page.waitForFunction(() => /^Take the /.test(document.querySelector('.next-step-list li b').textContent));
  assert.deepEqual(await titles(), await expected());
  // A pet whose Advance is done drops off; a page with nothing due hides the line.
  await open('pets');
  await page.evaluate(() => window.PlayerLedger.shared().setPet('lion', { level: 20, advanced: true }));
  await page.waitForFunction(() => document.querySelector('.next-step').hidden);

  // Guest mode works on a copy of the save, so the line is not about it.
  await page.goto(origin + '/hero-gear/?guest&lang=en');
  await page.waitForFunction(() => window.UpgradePriority && document.querySelector('#gear-guest-banner') && !document.querySelector('#gear-guest-banner').hidden);
  await page.waitForTimeout(150);
  assert.equal(await hint().isVisible(), false, 'hidden in guest mode');

  // Languages: the label comes from the dictionary, no key leaks, Arabic rules on the right.
  for (const lang of ['de', 'ar', 'ja']) {
    await open('heroes', lang);
    await page.waitForFunction(l => document.documentElement.lang === l, lang);
    await page.waitForTimeout(150);
    const text = await hint().innerText();
    assert.doesNotMatch(text, /priority\.[a-z]/, lang);
    assert.equal(await page.locator('.next-step-label').textContent(), await page.evaluate(l => window.__BH_I18N_DATA[l]['priority.hint.label'], lang), lang);
    assert.deepEqual(await titles(), await expected(), lang);
    if (lang === 'ar') assert.equal(await hint().evaluate(n => getComputedStyle(n).borderRightStyle), 'solid');
    await hint().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'heroes-' + lang + '-390.png') });
  }

  // 320px: no sideways scroll on any page with the line showing.
  await page.setViewportSize({ width: 320, height: 800 });
  for (const dir of PAGES) {
    await open(dir);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll on ' + dir);
  }
  await open('town-centre');
  await hint().scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'town-centre-320.png') });
  assert.deepEqual(errors, []);
  assert.deepEqual(await page.evaluate(() => window.moduleErrors), []);

  // Without JavaScript the line stays hidden.
  const still = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } }), plain = await still.newPage();
  for (const dir of PAGES) {
    await plain.goto(origin + '/' + dir + '/');
    assert.equal(await plain.locator('.next-step').isVisible(), false, dir + ' without JavaScript');
  }
  console.log('Next-step lines checked on ' + PAGES.length + ' pages. Screenshots in .dsh/next-step-preview/.');
}).catch(error => { console.error(error); process.exitCode = 1; });
