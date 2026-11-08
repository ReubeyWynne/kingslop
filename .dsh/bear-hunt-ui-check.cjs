// Bear Hunt UI — the hunt's size sets the rules and their pictures, the march
// builder follows it, a one-troop rally gives everything to the joins, and the
// Leading switch brings in the hero page's Bear ratio and damage calc, which
// hands its mix to the builder.
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
  assert.equal(await page.locator('[data-cap="on"] .cap-bar i').count(), 15, 'with the cap, the leader and all 14 joiners fit');
  assert.equal(await page.locator('[data-cap="off"] .cap-bar i[data-out]').count(), 5, 'without it, five are left out');
  assert.equal((await text('[data-i18n="bh.cap.out"]')).trim(), '5 left out');
  assert.match((await text('[data-i18n="bh.cap.gain"]')).trim(), /^\+\d+% damage$/);
  assert.equal(await page.locator('.plan-joiners img').count(), 3, 'the joiner heroes, before a generation is set');
  assert.equal(await page.locator('.plan-joins i').count(), 6, 'a bar for each join');
  assert.match(await text('[data-i18n="bh.run.first2"]'), /^With 15 players, open 7 rallies,/);
  assert.equal(await page.locator('.ascii-march-band').count(), 0, 'no march animation');
  assert.equal(await page.locator('#sqrt details.hunt-maths').count(), 1, 'the maths folds away');
  assert.equal(await page.locator('#rewards').count(), 1, 'old links still land');
  assert.equal(await page.locator('.brackets').count(), 0, 'no rewards ladder');
  assert.equal(await page.locator('#hunt-rally').getAttribute('placeholder'), '1,360,000', 'the usual rally as ghost ink');

  // Eight players: every other player joins, three bigger joins, the builder follows.
  await page.locator('#hunt-players').fill('8');
  await page.waitForFunction(() => /to 8\./.test(document.querySelector('[data-i18n="bh.glance.2h"]').textContent));
  assert.equal((await text('[data-i18n="bh.glance.3h"]')).trim(), 'Send 3 joins of up to 151,000.');
  assert.equal(await page.locator('[data-cap="on"] .cap-bar i').count(), 8, 'the leader and seven joiners');
  assert.equal(await page.locator('[data-cap="off"] .cap-bar i[data-out]').count(), 3);
  assert.equal(await page.locator('.plan-joins i').count(), 3, 'three bigger joins');
  assert.match(await text('[data-i18n="bh.why.first2"]'), /^Count the joins free at the start and divide by 7, rounding up so nobody's joins sit idle\. 8 players with 3 joins each is 24, so open 4 rallies\./);
  assert.equal(await page.locator('#join-queues').inputValue(), '3');
  assert.equal(await page.locator('#join-cap').inputValue(), '151000');
  assert.equal(await page.locator('#march-queues > div').count(), 3, 'three joins drawn');
  assert.equal(await joinTotal(), '151,000');

  // The biggest rally sets the cap.
  await page.locator('#hunt-rally').fill('900000');
  await page.waitForFunction(() => /up to 100,000/.test(document.querySelector('[data-i18n="bh.glance.3h"]').textContent));
  assert.equal(await page.locator('#join-cap').inputValue(), '100000');

  // The lead finder is always there. A one-troop rally takes nothing, the joins take the rest.
  assert.equal(await page.locator('#lead').isVisible(), true);
  assert.equal(await page.locator('#own-even').isChecked(), true, 'your rally starts the same as a join');
  await page.locator('#allocator-toggle').click();
  assert.equal(await page.locator('#own-ratio').isHidden(), true);
  await page.locator('#own-token').check();
  assert.equal(await page.locator('#own-cap').isDisabled(), true);
  await page.locator('#march-builder button[type="submit"]').click();
  assert.equal(await page.locator('#alloc-own').textContent(), '1');
  assert.equal(await joinTotal(), '100,000');

  // Kept across a reload.
  await page.reload();
  await page.waitForFunction(() => window.BH_HUNT && window.BH_MARCHES);
  assert.equal(await page.locator('#hunt-players').inputValue(), '8');
  assert.equal(await page.locator('#hunt-rally').inputValue(), '900000');
  assert.equal(await page.locator('#own-token').isChecked(), true);

  // The hero page's Bear calc, Bear job only. No heroes yet, so it asks for them.
  assert.equal(await page.locator('#lead .lead-best-panel, #lead .lead-list').count(), 0, 'no report panel or runners-up');
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
  await page.waitForFunction(() => document.querySelectorAll('.plan-joiners img').length === 4, null, { timeout: 5000 });
  await page.waitForFunction(() => !document.querySelector('#lead .lead-best').hidden);
  assert.equal(await page.locator('#lead .lead-best .lead-hero-name b').allTextContents().then(t => t.join('/')), 'Amadeus/Petra/Marlin');
  assert.equal(await page.locator('#lead .lead-mix-key').count(), 3, 'the troop mix');
  assert.match(await text('#lead .lead-damage-value'), /\d/, 'the damage per hit');
  await page.waitForFunction(() => !document.getElementById('own-mix').hidden);
  if (await page.locator('#march-builder').isHidden()) await page.locator('#allocator-toggle').click();
  await page.locator('#own-priority').check();
  assert.equal(await page.locator('#own-ratio').isVisible(), true);
  assert.equal(await page.locator('#own-cap').isDisabled(), false);
  await page.locator('#own-mix').click();
  const ratio = await page.evaluate(() => ['own-infantry', 'own-cavalry', 'own-archers'].map(id => Number(document.getElementById(id).value)));
  assert.equal(Math.round(ratio.reduce((a, b) => a + b, 0) * 10) / 10, 100, 'the mix fills the rally ratio');
  assert.notDeepEqual(ratio, [5, 15, 80]);
  await page.locator('#march-builder button[type="submit"]').click();
  assert.equal(await page.locator('#alloc-own').textContent(), '130,000', 'a leader fills their own rally first');
  await page.reload();
  await page.waitForFunction(() => window.BH_HUNT && window.BH_MARCHES);
  assert.equal(await page.locator('#own-priority').isChecked(), true, 'the choice is kept');

  // Back to a full hunt.
  await page.locator('#hunt-players').fill('15');
  await page.waitForFunction(() => /to 15\./.test(document.querySelector('[data-i18n="bh.glance.2h"]').textContent));

  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert.equal(wide, false, width + 'px: no sideways scroll');
  }
  assert.deepEqual(errors, []);
  console.log('Bear Hunt UI: hunt size, plan pictures, builder follow, your-rally choice, Bear lead calc always shown, reload and widths pass.');
});
