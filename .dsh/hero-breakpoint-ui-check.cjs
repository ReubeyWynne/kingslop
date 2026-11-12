// Break-point finder UI — the Heroes page's "When does one hero overtake another?":
// two heroes of one troop type in, two star-by-widget tables out.
const assert = require('node:assert/strict'), path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
withBrowser({ root: path.resolve('_site') }, async ({ browser, origin }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const field = (side, name, slot) => page.locator(`#breakpoint [data-side="${side}"][data-field="${name}"]${slot === undefined ? '' : `[data-skill="${slot}"]`}`);
  const verdict = () => page.locator('[data-bp="verdict"]').textContent();
  const ready = (re) => page.waitForFunction(r => { const res = document.querySelector('[data-bp="result"]'); return !res.hidden && new RegExp(r).test(document.querySelector('[data-bp="verdict"]').textContent) && !document.querySelector('[data-bp="status"]').textContent; }, re.source, { timeout: 30000 });
  await page.goto(origin + '/heroes/?lang=en#breakpoint');
  await page.waitForFunction(() => !document.querySelector('.bp-hero').disabled);
  await ready(/./);
  assert.equal(await page.locator('#breakpoint .bp-grid').count(), 2, 'one table each way');

  // Any two heroes of one type: the second list offers only the first one's type.
  await field('a', 'key').selectOption('marlin');
  assert.deepEqual(await field('b', 'key').evaluate(s => [...s.querySelectorAll('optgroup')].filter(g => !g.disabled).map(g => g.dataset.troop)), ['arc']);
  await field('b', 'key').selectOption('rosa');
  await field('a', 'stars').selectOption('30'); await field('a', 'widget').selectOption('10');
  await field('b', 'stars').selectOption('24'); await field('b', 'widget').selectOption('4');
  await page.locator('[data-bp="account"]').selectOption('whale');
  await page.locator('[data-bp="gen"]').selectOption('4');
  await ready(/(Marlin 5★ W10|Rosa 4★ W4) \+[\d.]+% Bear damage|Level/);
  assert.match(await page.locator('[data-grid="b"] .lead-kicker').textContent(), /Rosa catches Marlin 5★ W10/);
  assert.match(await page.locator('[data-grid="b"] .bp-line').textContent(), /^from \d★/);
  assert.equal(await page.locator('[data-grid="b"] tbody td').count(), 31, 'every star step from 0★ to 5★');
  assert.equal(await page.locator('[data-grid="b"] td[data-first]').count(), 1, 'the first break marked');

  // Switching the first hero's type moves the second to that type; a hero without a widget greys the widget out.
  await field('a', 'key').selectOption('amadeus');
  await ready(/Amadeus|Level/);
  assert.equal(await page.evaluate(() => LeadData.heroes[document.querySelector('[data-side="b"][data-field="key"]').value].type), 'inf');
  await field('b', 'key').selectOption('howard');
  await page.waitForFunction(() => /Howard/.test(document.querySelector('[data-grid="b"] .lead-kicker').textContent));
  assert.equal(await field('b', 'widget').isDisabled(), true, 'no widget to pick');
  assert.doesNotMatch(await page.locator('[data-grid="b"] tbody').textContent(), /W\d/, 'a widgetless hero needs no widget level');

  // Rally fights; the skill boxes change only the hero as set.
  await field('b', 'key').selectOption('alcar');
  await page.locator('#breakpoint label:has(input[value="rally"])').click();
  await ready(/army kept|Level/);
  const before = await verdict();
  await field('a', 'skill', 0).selectOption('0');
  await ready(/army kept|Level/);
  assert.notEqual(await verdict(), before, 'a skill level changes the verdict');

  // Choices come back after a reload.
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('.bp-hero').disabled);
  assert.equal(await field('a', 'key').inputValue(), 'amadeus');
  assert.equal(await field('a', 'skill', 0).inputValue(), '0');
  assert.equal(await page.locator('#breakpoint input[value="rally"]').isChecked(), true);
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const wide = await page.evaluate(() => [...document.querySelectorAll('#breakpoint, #breakpoint *')].filter(el => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1).map(el => el.className || el.tagName));
    assert.deepEqual(wide, [], `nothing overflows at ${width}px`);
  }
  assert.deepEqual(errors, []);
  await context.close();
  console.log('Break-point finder UI: same-type pairs, both tables, widgetless heroes, rally fights, skills, reload and widths pass.');
});
