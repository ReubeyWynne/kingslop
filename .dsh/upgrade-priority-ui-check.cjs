const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
const root = path.resolve('_site'), output = path.resolve('.dsh/priority-preview');
withBrowser({ root }, async ({ browser, origin }) => {
  fs.mkdirSync(output, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.addInitScript(() => { window.moduleErrors = []; document.addEventListener('module:error', e => moduleErrors.push(e.detail)); });
  const steps = () => page.locator('[data-target="upgrade-priority.list"] li h3').allTextContents();

  // An empty save asks for the Town Centre first and still shows the static order.
  await page.goto(origin + '/upgrade-priority/?lang=en');
  await page.waitForFunction(() => document.querySelector('[data-target="upgrade-priority.list"] li'));
  assert.equal((await steps())[0], 'Record your Town Center level');
  assert.equal(await page.locator('.priority-ladder').count(), 6);
  assert.equal(await page.locator('#order-buildings').getAttribute('open'), '');

  // A TC 24 joiner: the Embassy and Barracks block TC 25; governor steps wait for materials.
  await page.evaluate(() => {
    const store = window.PlayerLedger.shared();
    store.setBuildings({ 'town-center': '24', embassy: '23', barracks: '22' });
    store.setHero('jabel', { level: 60, stars: 10, widget: 2, skills: null });
    store.setHero('saul', { level: 60, stars: 8, widget: 0, skills: null });
    store.setBalance('mythic-hero-shard', 200);
    store.setGovernor('gear', { 'inf-1': 30, 'inf-2': 30, 'cav-1': 30, 'cav-2': 30, 'arc-1': 30, 'arc-2': 30 });
    store.setPet('lion', { level: 20, advanced: false });
  });
  await page.waitForFunction(() => /Embassy/.test(document.querySelector('[data-target="upgrade-priority.list"] li h3').textContent));
  let titles = await steps();
  assert.deepEqual(titles.slice(0, 2), ['Raise the Embassy from 23 to 24', 'Raise the Barracks from 22 to 24']);
  assert.ok(titles.some(t => /^Ascend Jabel/.test(t)));
  assert.match(await page.locator('[data-target="upgrade-priority.status"]').textContent(), /24: Governor/);
  assert.equal(await page.locator('#stage-governor').getAttribute('data-state'), 'current');
  assert.equal(await page.locator('[data-role="joiner"]').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#next').textContent(), /Record your governor materials/);
  // With materials known, the governor planner picks the step and says how far the bag goes.
  const bag = { satin: 800000, 'gilded-threads': 8000, 'artisans-vision': 2000 };
  await page.evaluate(bag => { const store = window.PlayerLedger.shared(); Object.entries(bag).forEach(([id, n]) => store.setBalance(id, n)); }, bag);
  await page.waitForFunction(() => /Your materials pay for/.test(document.querySelector('#next').textContent));
  const plan = await page.evaluate(bag => { const s = window.PlayerLedger.shared().snapshot(), state = {}; window.Governor.items('gear').forEach(i => { state[i.id] = s.governorGear.pieces[i.id].level; }); return window.Governor.plan('gear', state, bag, { goal: 'stats', focus: 'all', limit: 60 }).steps; }, bag);
  assert.ok(plan.length > 0);
  assert.match(await page.locator('#next').textContent(), new RegExp('pay for ' + plan.length + ' steps'));
  assert.equal(await page.locator('#order-pets li').first().getAttribute('data-later'), 'false');
  await page.screenshot({ path: path.join(output, 'priority-390.png'), fullPage: true });

  // The role is saved with the player save and changes the order; a preview changes the stage only.
  await page.locator('[data-role="lead"]').click();
  await page.waitForFunction(() => window.PlayerLedger.shared().priority().role === 'lead');
  await page.locator('#stage-tempered button').click();
  assert.equal(await page.locator('#stage-tempered').getAttribute('data-state'), 'preview');
  assert.match(await page.locator('[data-target="upgrade-priority.status"]').textContent(), /Previewing Tempered Truegold/);
  assert.equal(await page.locator('#order-research li[data-later="false"]').count(), 4);
  await page.locator('#stage-tempered button').click();
  assert.equal(await page.locator('#stage-tempered').getAttribute('data-state'), '');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-role="lead"]').getAttribute('aria-pressed') === 'true');

  // A Truegold lead: troop buildings a tier behind, the War Academy, and steps that score.
  await page.evaluate(() => window.PlayerLedger.shared().setBuildings({ 'town-center': 'TG 5', embassy: 'TG 5', academy: '30', barracks: 'TG 3', range: 'TG 5', stable: 'TG 5', 'command-center': 'TG 2', 'war-academy': 'TG 2' }));
  await page.waitForFunction(() => /TG 5: Tempered/.test(document.querySelector('[data-target="upgrade-priority.status"]').textContent));
  titles = await steps();
  assert.equal(titles[0], 'Raise the Barracks from TG 3 to TG 5');
  assert.ok(titles.includes('Raise the War Academy from TG 2 to TG 5'));
  assert.ok(await page.locator('[data-target="upgrade-priority.list"] [data-part="scores"]:visible').count() > 0);
  await page.locator('#next-more summary').click();
  await page.waitForFunction(() => location.hash === '#next-more');

  // Every language and width paints without errors; Arabic runs right to left.
  for (const lang of ['de', 'ar', 'ja']) {
    await page.goto(origin + '/upgrade-priority/?lang=' + lang);
    await page.waitForFunction(() => document.querySelector('[data-target="upgrade-priority.list"] li'));
    await page.waitForFunction(l => document.documentElement.lang === l, lang);
    await page.waitForTimeout(150);
    const text = await page.locator('main').innerText();
    assert.doesNotMatch(text, /priority\.[a-z]/, lang);
    await page.screenshot({ path: path.join(output, 'priority-' + lang + '-390.png'), fullPage: true });
  }
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + '/upgrade-priority/?lang=en');
    await page.waitForFunction(() => document.querySelector('[data-target="upgrade-priority.list"] li'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll at ' + width);
    await page.screenshot({ path: path.join(output, 'priority-en-' + width + '.png'), fullPage: true });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(await page.evaluate(() => window.moduleErrors), []);
  console.log('Upgrade priority UI checks passed. Screenshots in .dsh/priority-preview/.');
}).catch(error => { console.error(error); process.exitCode = 1; });
