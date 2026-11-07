// Bear Hunt UI — the hunt's size sets the rules, the march builder follows it,
// a one-troop rally gives everything to the joins, and
// the hero page's Bear ratio and damage calc sits on the page and hands its
// mix to the builder.
const assert = require('node:assert/strict'), path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
withBrowser({ root: path.resolve('_site') }, async ({ browser, origin }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/bear-hunt/?lang=en');
  await page.waitForFunction(() => window.BH_HUNT && window.BH_MARCHES && document.documentElement.lang === 'en' && window.__BH_I18N_DATA?.en);
  const text = sel => page.locator(sel).first().textContent();
  const joinTotal = () => page.locator('#alloc-join').textContent();

  // Fifteen players: the plan the page has always given.
  assert.equal((await text('[data-i18n="bh.glance.2h"]')).trim(), 'Fill every rally to 15.');
  assert.equal((await text('[data-i18n="bh.glance.3h"]')).trim(), 'Send 6 joins of up to 85,000.');
  assert.equal(await page.locator('[data-i18n="bh.glance.2ps"]').isHidden(), true);
  assert.equal(await page.locator('[data-i18n="bh.glance.3ps"]').isHidden(), true);
  assert.equal(await page.locator('.rally-slots span[data-off]').count(), 0);
  assert.equal(await page.locator('#hunt-rally').getAttribute('placeholder'), '1,360,000', 'the usual rally as ghost ink');

  // Eight players: every other player joins, three bigger joins, the builder follows.
  await page.locator('#hunt-players').fill('8');
  await page.waitForFunction(() => /to 8\./.test(document.querySelector('[data-i18n="bh.glance.2h"]').textContent));
  assert.equal((await text('[data-i18n="bh.glance.3h"]')).trim(), 'Send 3 joins of up to 151,000.');
  assert.equal(await page.locator('[data-i18n="bh.glance.2ps"]').isVisible(), true);
  assert.equal(await page.locator('[data-i18n="bh.glance.2p"]').isHidden(), true);
  assert.equal(await page.locator('[data-i18n="bh.glance.3ps"]').isVisible(), true);
  assert.equal(await page.locator('.rally-slots span[data-off]').count(), 7, 'seven spaces nobody is left to fill');
  assert.match(await text('[data-i18n-html="bh.plan.cap"]'), /151,000/);
  assert.match(await text('[data-i18n="bh.first.count"]'), /^Count the joins free at the start and divide by 7\. 8 players with 3 joins each is 24, enough for 3 full rallies\./);
  assert.equal(await page.locator('#join-queues').inputValue(), '3');
  assert.equal(await page.locator('#join-cap').inputValue(), '151000');
  assert.equal(await page.locator('#march-queues > div').count(), 3, 'three joins drawn');
  assert.equal(await joinTotal(), '151,000');

  // The biggest rally sets the cap.
  await page.locator('#hunt-rally').fill('900000');
  await page.waitForFunction(() => /up to 100,000/.test(document.querySelector('[data-i18n="bh.glance.3h"]').textContent));
  assert.equal(await page.locator('#join-cap').inputValue(), '100000');

  // A one-troop rally: the own rally takes nothing, the joins take the rest.
  await page.locator('#allocator-toggle').click();
  await page.locator('#own-token').check();
  assert.equal(await page.locator('#own-cap').isDisabled(), true);
  assert.equal(await page.locator('#own-priority').isDisabled(), true);
  await page.locator('#march-builder button[type="submit"]').click();
  assert.equal(await page.locator('#alloc-own').textContent(), '1');
  assert.equal(await joinTotal(), '100,000');

  // Kept across a reload.
  await page.reload();
  await page.waitForFunction(() => window.BH_HUNT && window.BH_MARCHES);
  assert.equal(await page.locator('#hunt-players').inputValue(), '8');
  assert.equal(await page.locator('#hunt-rally').inputValue(), '900000');
  assert.equal(await page.locator('#own-token').isChecked(), true);

  // The hero page's Bear calc, Bear job only: no heroes yet, so it asks for them.
  assert.equal(await page.locator('#lead .lead-jobs').count(), 0, 'no job picker on the Bear page');
  assert.equal(await page.locator('#lead details:not(.src)').count(), 1, 'only the joiners, pets and city buffs fold away');
  assert.match(await text('[data-target="lead-finder.status"]'), /Mark the heroes you own/);
  assert.equal(await page.locator('#lead [data-input="overview"] a').getAttribute('href'), '#bonus-overview', 'the overview is filled in on this page');
  assert.equal(await page.locator('#lead [data-input="heroes"] a').getAttribute('href'), '../heroes/#directory');

  // Heroes in the save: the best Bear lead, its troop mix and damage, and the mix offered to the builder.
  await page.evaluate(() => {
    const s = PlayerLedger.shared();
    for (const [key, stars, widget] of [['amadeus', 30, 10], ['petra', 30, 10], ['marlin', 30, 10], ['rosa', 24, 4]]) s.setHero(key, { level: null, stars, widget, skills: null });
    KS_SERVER_AGE.setGeneration(4);
  });
  await page.waitForFunction(() => !document.querySelector('#lead .lead-best').hidden);
  assert.equal(await page.locator('#lead .lead-best .lead-hero-name b').allTextContents().then(t => t.join('/')), 'Amadeus/Petra/Marlin');
  assert.equal(await page.locator('#lead .lead-mix-key').count(), 3, 'the troop mix');
  assert.match(await text('#lead .lead-damage-value'), /\d/, 'the damage per hit');
  await page.waitForFunction(() => !document.getElementById('own-mix').hidden);
  if (await page.locator('#march-builder').isHidden()) await page.locator('#allocator-toggle').click();
  await page.locator('#own-token').uncheck();
  await page.locator('#own-priority').check();
  await page.locator('#own-mix').click();
  const ratio = await page.evaluate(() => ['own-infantry', 'own-cavalry', 'own-archers'].map(id => Number(document.getElementById(id).value)));
  assert.equal(Math.round(ratio.reduce((a, b) => a + b, 0) * 10) / 10, 100, 'the mix fills the rally ratio');
  assert.notDeepEqual(ratio, [5, 15, 80]);

  // Back to a full hunt.
  await page.locator('#hunt-players').fill('15');
  await page.waitForFunction(() => /to 15\./.test(document.querySelector('[data-i18n="bh.glance.2h"]').textContent));

  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert.equal(wide, false, width + 'px: no sideways scroll');
  }
  assert.deepEqual(errors, []);
  console.log('Bear Hunt UI: hunt size, small-group rules, builder follow, one-troop rally, Bear lead calc, reload and widths pass.');
});
