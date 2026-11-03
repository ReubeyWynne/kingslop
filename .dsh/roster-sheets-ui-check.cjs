// Share links and guest sheets on Heroes, Masters and Pets (js/roster-sheets.js on the shared
// js/page-sheet.js): a link opens on a sheet and never touches the save, the copied link opens
// the same sheet, Save as mine writes it back, and an unreadable link opens a copy of the save.
// Run after a Jekyll build: node .dsh/roster-sheets-ui-check.cjs
const assert = require('node:assert/strict'), path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
const root = path.resolve('_site');

const PAGES = [
  { page: 'heroes', link: '?lang=en&h=amadeus.80.27.6.545&hi=hero-shards-amadeus:34', section: 'heroes', id: 'amadeus',
    record: { level: 80, stars: 27, widget: 6, skills: [5, 4, 5] }, item: ['hero-shards-amadeus', 34], bad: '?lang=en&h=nobody.1' },
  { page: 'masters', link: '?lang=en&m=valora.29.1.3.2.0.&mi=master-emblems-valora:10', section: 'masters', id: 'valora',
    record: { affinity: 29, ready: true, skills: [3, 2, 0, null] }, item: ['master-emblems-valora', 10], bad: '?lang=en&m=valora.500' },
  { page: 'pets', link: '?lang=en&pets=gray-wolf.20a', section: 'pets', id: 'gray-wolf',
    record: { level: 20, advanced: true }, item: null, bad: '?lang=en&pets=gray-wolf.20x' }
];

withBrowser({ root }, async ({ browser, origin }) => {
  const errors = [];
  for (const p of PAGES) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(p.page + ': ' + e.message));
    const open = async query => { await page.goto(origin + '/' + p.page + '/' + query); await page.waitForFunction(() => window.Interactions && document.querySelector('[data-target="page-sheet.source"]').textContent !== ''); };
    const own = () => page.evaluate(s => PlayerLedger.shared()[s]().roster, p.section);
    const onPage = () => page.evaluate(s => Interactions.ledger()[s]().roster, p.section);
    const notice = () => page.locator('[data-target="page-sheet.notice"]');

    // Your own save: no notice, and the link tools.
    await open('?lang=en');
    assert.equal(await notice().isHidden(), true, p.page + ': no notice on your own save');
    assert.equal(await page.locator('[data-action="page-sheet.copy"]').isVisible(), true);

    // A link opens on a sheet of its own.
    await open(p.link);
    await page.waitForFunction(() => document.querySelector('[data-target="page-sheet.source"]').textContent !== '');
    assert.match(await page.locator('[data-target="page-sheet.source"]').textContent(), /A shared sheet\./, p.page);
    assert.deepEqual((await onPage())[p.id], p.record, p.page + ': the page works on the link');
    assert.deepEqual(await own(), {}, p.page + ': the save is untouched');
    if (p.item) assert.equal(await page.evaluate(id => PlayerLedger.confirmed(Interactions.ledger().snapshot(), id), p.item[0]), p.item[1]);

    // Copying it gives a link that opens the same sheet.
    await page.locator('[data-action="page-sheet.copy"]').click();
    await page.locator('[data-action="page-sheet.copy"][data-copied]').waitFor();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    await page.goto(copied); await page.waitForFunction(() => window.Interactions && document.querySelector('[data-target="page-sheet.source"]').textContent !== '');
    assert.deepEqual((await onPage())[p.id], p.record, p.page + ': the copied link round-trips');

    // Save as mine writes it to the save and returns to it.
    await page.locator('[data-action="page-sheet.saveMine"]').click();
    await Promise.all([page.waitForNavigation(), page.locator('[data-action="page-sheet.confirm"]').click()]);
    await page.waitForFunction(() => window.Interactions && document.querySelector('[data-target="page-sheet.source"]').textContent !== '');
    assert.deepEqual((await own())[p.id], p.record, p.page + ': Save as mine writes the sheet');
    assert.doesNotMatch(page.url(), /[?&](h|m|pets)=/);
    assert.equal(await notice().isHidden(), true);

    // ?guest starts from a copy of your save that matches it, so there is nothing to save yet.
    await open('?lang=en&guest');
    await page.waitForFunction(() => document.querySelector('[data-target="page-sheet.source"]').textContent !== '');
    assert.match(await page.locator('[data-target="page-sheet.source"]').textContent(), /Your save\./);
    assert.equal(await page.locator('[data-action="page-sheet.saveMine"]').isHidden(), true);

    // An unreadable link opens a copy of your save and says so.
    await open(p.bad);
    await page.waitForFunction(() => document.querySelector('[data-target="page-sheet.source"]').textContent !== '');
    assert.match(await page.locator('[data-target="page-sheet.source"]').textContent(), /could not be read/, p.page);
    assert.deepEqual((await onPage())[p.id], p.record);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('Roster sheets: links, copy, Save as mine, guest and unreadable links pass on Heroes, Masters and Pets.');
});
