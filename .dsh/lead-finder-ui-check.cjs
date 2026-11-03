// Lead finder UI — the Heroes page's "Your best leads": roster and Bonus
// Overview in, ranked lineups out, the overview kept in the shared save.
const assert = require('node:assert/strict'), path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
withBrowser({ root: path.resolve('_site') }, async ({ browser, origin }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const status = () => page.locator('[data-target="lead-finder.status"]').textContent();
  const rows = () => page.locator('.lead-row').count();
  await page.goto(origin + '/heroes/?lang=en#leads');
  await page.waitForFunction(() => !document.querySelector('.lead-jobs').disabled);
  assert.match(await status(), /Mark the heroes you own/);
  assert.equal(await rows(), 0);
  await page.evaluate(() => {
    const s = PlayerLedger.shared();
    for (const [key, stars, widget] of [['amadeus', 30, 10], ['petra', 30, 10], ['marlin', 30, 10], ['rosa', 24, 6], ['jabel', 24, 0]]) s.setHero(key, { level: null, stars, widget, skills: null });
    KS_SERVER_AGE.setGeneration(4);
  });
  await page.waitForFunction(() => document.querySelectorAll('.lead-row').length === 4);
  assert.match(await status(), /typical generation 4 Bonus Overview \(250% everywhere\)/);
  assert.equal(await page.locator('.lead-row').first().locator('.lead-hero b').allTextContents().then(t => t.join('/')), 'Amadeus/Petra/Marlin');
  assert.equal(await page.locator('.lead-foes').isHidden(), true, 'no opponents for the Bear');

  // Typing a whole troop row saves it as the Bonus Overview, not as report stats.
  await page.locator('#bonus-overview summary').click();
  for (const [stat, value] of [['attack', 300], ['lethality', 280], ['defense', 300], ['health', 270]]) await page.locator(`[data-stat="arc.${stat}"]`).fill(String(value));
  await page.waitForFunction(() => (PlayerLedger.shared().combat().overview.arc || {}).health === 270);
  assert.deepEqual(await page.evaluate(() => PlayerLedger.shared().combat().stats), {});
  assert.match(await status(), /missing Infantry, Cavalry/);

  // A rally ranks against the four stock opponents.
  await page.locator('input[value="rally"]').check();
  await page.waitForFunction(() => /Ranked from/.test(document.querySelector('[data-target="lead-finder.status"]').textContent) && document.querySelectorAll('.lead-row .lead-chip').length === 16);
  assert.equal(await page.locator('.lead-foes').isVisible(), true);
  assert.deepEqual(await page.locator('.lead-row').first().locator('.lead-chip').allTextContents().then(t => t.map(x => x.replace(/ \d+%$/, ''))), ['Manta ray', 'Great white', 'Orca', 'Blue whale']);

  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-stat="arc.health"]').value === '270');
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const wide = await page.evaluate(() => [...document.querySelectorAll('#leads, #leads *')].filter(el => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1).map(el => el.className || el.tagName));
    assert.deepEqual(wide, [], `nothing overflows at ${width}px`);
  }
  assert.deepEqual(errors, []);
  await context.close();
  console.log('Lead finder UI: empty state, roster ranking, Bonus Overview save, rally opponents, reload and widths pass.');
});
