// Bear Hunt UI — the hunt's size sets the rules, the march builder follows it,
// a one-troop rally gives everything to the joins, and the damage estimate
// scores the save's best Bear lead with those marches.
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
  await page.evaluate(() => document.querySelectorAll('.section-toggle[aria-expanded="false"]').forEach(b => b.click()));
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

  // No heroes: the estimate asks for them, every input shown as a chip.
  const chips = () => page.locator('.hunt-damage .inputs li').evaluateAll(list => Object.fromEntries(list.map(li => [li.dataset.input, li.dataset.have])));
  assert.match(await text('[data-target="bear-damage.status"]'), /Mark the heroes you own/);
  assert.equal(await page.locator('[data-target="bear-damage.result"]').isHidden(), true);
  assert.deepEqual(await chips(), { heroes: 'no', overview: 'est', gear: 'no', town: 'no', valora: 'no', troops: 'est', pets: 'no' });
  assert.equal(await page.locator('.hunt-damage [data-input="gear"] a').getAttribute('href'), '../hero-gear/');
  assert.equal(await page.locator('.hunt-damage [data-input="overview"] a').getAttribute('href'), '../heroes/#bonus-overview');

  // Heroes in the save: the best Bear lead, a hit per march, the hunt's total and its tier.
  await page.evaluate(() => {
    const s = PlayerLedger.shared();
    for (const [key, stars, widget] of [['amadeus', 30, 10], ['petra', 30, 10], ['marlin', 30, 10], ['rosa', 24, 4]]) s.setHero(key, { level: null, stars, widget, skills: null });
    KS_SERVER_AGE.setGeneration(4);
  });
  await page.waitForFunction(() => !document.querySelector('[data-target="bear-damage.result"]').hidden);
  assert.equal(await text('[data-target="bear-damage.lead"]'), 'Leading with Amadeus, Petra, Marlin');
  assert.match(await text('[data-target="bear-damage.own"]'), / a hit × 0$/, 'a one-troop rally adds no hits of its own');
  assert.match(await text('[data-target="bear-damage.join"]'), / a hit × 42$/, 'one join in each of the 7 other rallies, six times');
  assert.equal(await page.locator('.hunt-damage').getAttribute('data-provisional'), '', 'provisional without gear, Town Centre or Valora');
  assert.equal(await page.locator('[data-target="bear-damage.total"]').getAttribute('data-open'), '');
  assert.match(await text('#hunt-damage-est .motif-names'), /Other rally leaders/);
  assert.equal(await page.locator('.brackets li[data-reached]').count(), 1, 'the tier the total reaches');

  // Back to a full hunt: 14 joins every five minutes, so more join hits.
  const before = await text('[data-target="bear-damage.total"]');
  await page.locator('#hunt-players').fill('15');
  await page.waitForFunction(() => / × 84$/.test(document.querySelector('[data-target="bear-damage.join"]').textContent));
  assert.notEqual(await text('[data-target="bear-damage.total"]'), before);

  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert.equal(wide, false, width + 'px: no sideways scroll');
  }
  assert.deepEqual(errors, []);
  console.log('Bear Hunt UI: hunt size, small-group rules, builder follow, one-troop rally, damage estimate, reload and widths pass.');
});
