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
  assert.equal(await page.locator('.lead-best').isHidden(), true, 'no best lineup before the roster');
  await page.evaluate(() => {
    const s = PlayerLedger.shared();
    for (const [key, stars, widget] of [['amadeus', 30, 10], ['petra', 30, 10], ['marlin', 30, 10], ['rosa', 24, 4], ['jabel', 24, 0]]) s.setHero(key, { level: null, stars, widget, skills: null });
    KS_SERVER_AGE.setGeneration(4);
  });
  await page.waitForFunction(() => document.querySelectorAll('.lead-row').length === 3);
  assert.match(await status(), /typical generation 4 Bonus Overview \(250% everywhere\)/);
  assert.equal(await page.locator('.lead-best .lead-hero-name b').allTextContents().then(t => t.join('/')), 'Amadeus/Petra/Marlin', 'the best lineup leads the dossier');
  assert.equal(await page.locator('.lead-best .hero-star-row').first().locator('[data-on]').count(), 5, 'roster stars on the portrait');
  assert.match(await page.locator('[data-target="lead-finder.verdict"]').textContent(), /more Bear damage|Level with/);
  assert.equal(await page.locator('[data-target="lead-finder.panel"] tr').count(), 3, 'report panel per troop type');
  assert.match(await page.locator('[data-target="lead-finder.panel"] tr').first().locator('td').first().textContent(), /^\+\d/);
  assert.equal(await page.locator('.lead-foes').isHidden(), true, 'no opponents for the Bear');
  // The best Bear lineup's damage for one march of 1/15 of the rally capacity, estimated from the joiner cap until typed.
  assert.match(await page.locator('.lead-damage').textContent(), /85,000 troops = 1\/15 of a 1,275,000 rally \(estimated/);
  const damageAt = () => page.locator('.lead-damage-value').textContent();
  assert.equal(await page.locator('.lead-hist-bar').count(), 24, 'a 24-bin histogram');
  assert.ok(await page.locator('.lead-hist-bar[data-band]').count() >= 8, 'the 80% band lit');
  assert.match(await page.locator('.lead-damage-band').textContent(), /^80% of hits land between \S+ and \S+$/);
  const estimated = await damageAt();
  await page.locator('#bonus-overview summary').click();
  await page.locator('[data-target="lead-finder.rallyCap"]').fill('1800000');
  await page.locator('[data-target="lead-finder.rallyCap"]').press('Tab');
  await page.waitForFunction(() => /120,000 troops = 1\/15 of a 1,800,000 rally\./.test(document.querySelector('.lead-damage .lead-answer-note').textContent));
  assert.notEqual(await damageAt(), estimated, 'a bigger rally, a bigger march, more damage');
  const noValora = await damageAt();
  await page.evaluate(() => PlayerLedger.shared().setMaster('valora', { affinity: 90, ready: true, skills: [0, 0, 0, 0] }));
  await page.waitForFunction(() => /Valora \+24%/.test(document.querySelector('.lead-damage .lead-answer-note').textContent));
  assert.notEqual(await damageAt(), noValora, 'Valora\'s talent adds to the damage');
  await page.locator('#bonus-overview summary').click();

  // Typing a whole troop row saves it as the Bonus Overview, not as report stats.
  await page.locator('#bonus-overview summary').click();
  for (const [stat, value] of [['attack', 300], ['lethality', 280], ['defense', 300], ['health', 270]]) await page.locator(`[data-stat="arc.${stat}"]`).fill(String(value));
  await page.waitForFunction(() => (PlayerLedger.shared().combat().overview.arc || {}).health === 270);
  assert.deepEqual(await page.evaluate(() => PlayerLedger.shared().combat().stats), {});
  assert.match(await status(), /missing Infantry, Cavalry/);
  assert.match(await status(), /Add your Squads' row/);

  // A Bonus Overview screenshot from the import dock fills the table, Squads' row included.
  const held = await page.evaluate(() => {
    const detail = { values: { 'ov-squads-attack': 162.4, 'ov-squads-defense': 173, 'ov-squads-lethality': 58.9, 'ov-squads-health': 50.9, 'ov-inf-attack': 218.5 }, before: {} };
    document.querySelector('[data-screen-import-sheet~="bonus-overview"]').dispatchEvent(new CustomEvent('screen-import:sheet', { bubbles: true, detail }));
    return detail.before;
  });
  assert.equal(held['ov-squads-attack'], null, 'the dock learns what each box held');
  await page.waitForFunction(() => (PlayerLedger.shared().combat().overview.squads || {}).health === 50.9);
  assert.equal(await page.locator('[data-stat="inf.attack"]').inputValue(), '218.5', 'a part-read row stays in its boxes');
  assert.doesNotMatch(await status(), /Add your Squads' row/);

  // A rally ranks against the four stock opponents.
  await page.locator('#leads label:has(input[value="rally"])').click();
  await page.waitForFunction(() => /Ranked from/.test(document.querySelector('[data-target="lead-finder.status"]').textContent) && document.querySelectorAll('#leads .lead-cell').length === 16);
  assert.equal(await page.locator('.lead-foes').isVisible(), true);
  assert.deepEqual(await page.locator('.lead-best .lead-cell > span').allTextContents(), ['F2P', 'Dolphin', 'Whale', 'Kraken']);

  // Joiners start from the job's usual list; city buffs and pets move the ranking's numbers.
  await page.locator('#lead-extras summary').click();
  assert.deepEqual(await page.locator('[data-joiner][data-field="key"]').evaluateAll(s => s.map(x => x.value)), ['chenko', 'yeonwoo', 'amane', 'amadeus']);
  assert.match(await page.locator('[data-target="lead-finder.joinersTitle"]').textContent(), /Rally lead/);
  assert.match(await page.locator('[data-target="lead-finder.pets"]').textContent(), /No pets in your save/);
  await page.locator('#leads label:has(input[value="bear"])').click();
  await page.waitForFunction(() => document.querySelectorAll('.lead-row').length === 3 && document.querySelector('.lead-mix'));
  assert.deepEqual(await page.locator('[data-joiner][data-field="key"]').evaluateAll(s => s.map(x => x.value)), ['chenko', 'yeonwoo', 'amane', 'margot'], 'the Bear keeps its own joiners');
  const mixOf = () => page.locator('.lead-mix-legend').textContent();
  const before = await mixOf();
  await page.locator('[data-joiner="3"][data-field="key"]').selectOption('');
  await page.locator('[data-city="attack"]').selectOption('20');
  await page.evaluate(() => PlayerLedger.shared().setPet('giant-rhino', { level: 60, advanced: false }));
  await page.waitForFunction(() => /Giant Rhino 60: attack \+6%/.test(document.querySelector('[data-target="lead-finder.pets"]').textContent));
  assert.equal(typeof before, 'string');
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('ks.lead-finder.v1')));
  assert.deepEqual(prefs.joiners.bear.map(j => j.key), ['chenko', 'yeonwoo', 'amane']);
  assert.equal(prefs.city.attack, 20);
  assert.equal(prefs.rallyCap, 1800000, 'the rally capacity is remembered');
  await page.locator('[data-action="lead-finder.resetJoiners"]').click();
  await page.waitForFunction(() => document.querySelector('[data-joiner="3"][data-field="key"]').value === 'margot');

  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-stat="arc.health"]').value === '270');
  assert.equal(await page.locator('[data-city="attack"]').inputValue(), '20', 'city buffs come back');
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const wide = await page.evaluate(() => [...document.querySelectorAll('#leads, #leads *')].filter(el => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1).map(el => el.className || el.tagName));
    assert.deepEqual(wide, [], `nothing overflows at ${width}px`);
  }
  assert.deepEqual(errors, []);
  await context.close();
  console.log('Lead finder UI: empty state, roster ranking, Bonus Overview save, rally opponents, joiners, city buffs, pets, reload and widths pass.');
});
