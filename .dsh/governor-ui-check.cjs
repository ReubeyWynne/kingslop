const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
const root = path.resolve('_site'), output = path.resolve('.dsh/governor-preview');
withBrowser({ root }, async ({ browser, origin }) => {
  fs.mkdirSync(output, { recursive: true });

  for (const width of [320, 390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' }), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const ready = () => page.waitForFunction(() => document.querySelectorAll('.gov-row').length === 6);
    const target = key => page.locator('[data-target="governor-planner.' + key + '"]');
    const profile = key => page.locator('[data-target="governor-profile.' + key + '"]');
    const tile = id => page.locator('.gov-piece[data-gov="' + id + '"]');
    const row = id => page.locator('.gov-row[data-item="' + id + '"]');
    await page.goto(origin + '/governor-gear/?lang=en'); await ready();
    assert.match(await target('notes').textContent(), /6 not set/);
    assert.equal(await tile('cav-1').locator('.gov-piece-name').textContent(), 'Hat');
    await page.fill('[data-bind="inventory.satin"]', '20000'); await page.fill('[data-bind="inventory.gilded-threads"]', '200'); await page.fill('[data-bind="inventory.artisans-vision"]', '0');
    // Set all sits under the profile and applies on pick.
    await page.locator('.gov-fill select[data-kind="gear"]').selectOption('0');
    assert.equal(await tile('inf-1').getAttribute('data-state'), 'empty');
    assert.equal(await page.locator('.gov-fill select[data-kind="gear"]').inputValue(), '');
    // Edit one piece in the shared editor: clear it, then step another up and back.
    await tile('arc-2').click();
    const dialog = profile('dialog'), gearLevel = dialog.locator('select[data-level="gear"]');
    assert.ok(await dialog.evaluate(node => node.open));
    assert.equal(await profile('editTitle').textContent(), 'Staff · Archer');
    await gearLevel.selectOption('');
    await dialog.locator('[data-action="governor-profile.close"]').click();
    assert.equal(await tile('arc-2').getAttribute('data-state'), 'unset');
    await tile('cav-2').click();
    await dialog.locator('.gov-edit-gear [data-step="1"]').click();
    await page.waitForFunction(() => document.querySelector('.gov-piece[data-gov="cav-2"] [data-part="level"]').textContent === 'Green 0★');
    assert.match(await profile('editNext').textContent(), /Next: Green 1★/);
    await dialog.locator('.gov-edit-gear [data-step="-1"]').click();
    await dialog.locator('[data-charm-row="2"] [data-step="1"]').click();
    await page.waitForFunction(() => document.querySelector('[data-charm="cav-2-2"]').dataset.state === 'set');
    assert.match(await page.locator('[data-charm="cav-2-2"] img').getAttribute('src'), /charms\/cav-1\.webp$/, 'charm art carries the troop colour and level shape');
    await dialog.locator('[data-charm-row="2"] select').selectOption('');
    await page.keyboard.press('Escape');
    assert.ok(!(await dialog.evaluate(node => node.open)));
    // The answer: where each piece ends up and one bill, Bear first by default.
    await page.waitForFunction(() => document.querySelector('.gov-row[data-item="arc-1"]').dataset.moved === 'true');
    assert.match(await row('arc-1').locator('.gov-row-gear').textContent(), /^not crafted → /);
    assert.equal(await row('arc-2').locator('.gov-row-gear').textContent(), 'not set');
    assert.equal(await page.locator('[data-action="governor-planner.profile"][data-value="bear"]').getAttribute('aria-pressed'), 'true');
    assert.match(await target('score').textContent(), /^\+[\d,]+ governor score$/);
    assert.match(await target('events').textContent(), /Gear on Alliance Brawl day 5: about [\d,]+ points/);
    assert.equal(await page.locator('[data-target="governor-planner.bill"] > div').count(), 5);
    assert.equal(await page.locator('.gov-result').evaluate(n => getComputedStyle(n).overflowY), 'visible', 'no box that scrolls');
    // Bear first shows its weights; typing one makes them custom weights, which travel in the link.
    const weights = () => page.locator('[data-action="governor-planner.weight"]').evaluateAll(nodes => nodes.map(n => n.dataset.troop + ' ' + n.value));
    assert.deepEqual(await weights(), ['inf 1', 'cav 1', 'arc 3']);
    await page.fill('[data-action="governor-planner.weight"][data-troop="cav"]', '0');
    await page.locator('[data-action="governor-planner.weight"][data-troop="cav"]').dispatchEvent('change');
    // On your own save the weights are kept there; a share link carries them as w=.
    await page.waitForFunction(() => window.Governor.encodeLink({ gear: {}, charms: {}, bag: {}, prefs: window.PlayerLedger.shared().snapshot().preferences.governor || {} }).w === '1_0_3');
    assert.equal(await page.locator('[data-action="governor-planner.profile"][data-value="custom"]').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await page.locator('.gov-row[data-moved="true"]').evaluateAll(rows => rows.map(r => r.dataset.item).filter(id => /^cav/.test(id))), [], 'a troop at 0 stays where it is');
    await page.fill('[data-action="governor-planner.weight"][data-troop="inf"]', '1.5');
    await page.locator('[data-action="governor-planner.weight"][data-troop="inf"]').dispatchEvent('change');
    await page.waitForFunction(() => window.Governor.encodeLink({ gear: {}, charms: {}, bag: {}, prefs: window.PlayerLedger.shared().snapshot().preferences.governor || {} }).w === '1.5_0_3');
    await page.click('[data-action="governor-planner.profile"][data-value="score"]');
    assert.equal(await target('weights').isHidden(), true, 'event score has no weights');
    await page.click('[data-action="governor-planner.profile"][data-value="custom"]');
    assert.deepEqual(await weights(), ['inf 1.5', 'cav 0', 'arc 3'], 'custom weights are kept');
    await page.click('[role="tab"][data-value="reach"]');
    await target('reachTroop').selectOption('arc');
    await target('gearTarget').selectOption('4');
    assert.equal(await target('billTitle').textContent(), 'Needs');
    assert.match(await row('arc-1').locator('.gov-row-gear').textContent(), /→ Blue 0★ 1★|→ Blue 1★/);
    assert.equal(await row('inf-1').getAttribute('data-moved'), 'false');
    assert.match(await target('notes').textContent(), /1 not set/);
    await page.click('[role="tab"][data-value="spend"]');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, 'no sideways scroll at ' + width);
    await page.screenshot({ path: path.join(output, width + '.png'), fullPage: true });
    await page.reload(); await ready();
    assert.equal(await tile('inf-1').getAttribute('data-state'), 'empty');
    assert.equal(await tile('arc-2').getAttribute('data-state'), 'unset');
    assert.equal(await tile('cav-2').getAttribute('data-state'), 'empty');
    assert.equal(await page.locator('[data-action="governor-planner.profile"][data-value="custom"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-bind="inventory.satin"]').inputValue(), '20000');
    // Without a link the page works on your save: edits save as you go and the address stays clean.
    const sheet = key => page.locator('[data-target="governor-sheet.' + key + '"]');
    assert.doesNotMatch(page.url(), /gov=/);
    assert.equal(await page.evaluate(() => PlayerLedger.shared().governor('gear')['inf-1']), 0);
    assert.equal(await page.evaluate(() => PlayerLedger.shared().balance('satin').amount), 20000);
    assert.equal(await sheet('source').textContent(), 'Your save.');
    assert.equal(await sheet('hint').textContent(), 'Changes save as you go.');
    assert.ok(await sheet('saveMine').isHidden()); assert.ok(await sheet('loadMine').isHidden());
    // Copy share link carries the governor, bag and priority.
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    await page.locator('[data-action="governor-sheet.copy"]').click();
    await page.waitForFunction(() => document.querySelector('[data-action="governor-sheet.copy"]').textContent === 'Link copied');
    const shared = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(shared, /[?&]gov=[^&]{24}/); assert.match(shared, /[?&]bag=20000\.200\.0\.\.(&|$)/);
    // Start blank opens a sheet of its own; Load mine goes back to your save.
    await Promise.all([page.waitForNavigation(), sheet('blank').click()]); await ready();
    assert.equal(await tile('inf-1').getAttribute('data-state'), 'unset');
    assert.equal(await sheet('source').textContent(), 'A blank sheet.');
    assert.match(page.url(), /gov=\.{24}(&|#|$)/); assert.doesNotMatch(page.url(), /bag=/);
    await tile('inf-1').click(); await dialog.locator('.gov-edit-gear [data-step="1"]').click(); await dialog.locator('[data-action="governor-profile.close"]').click();
    assert.equal(await page.evaluate(() => PlayerLedger.shared().governor('gear')['inf-1']), 0, 'a sheet leaves the save');
    assert.equal(await sheet('source').textContent(), 'A shared sheet.');
    await Promise.all([page.waitForNavigation(), sheet('loadMine').click()]); await ready();
    assert.equal(await tile('inf-1').getAttribute('data-state'), 'empty');
    assert.doesNotMatch(page.url(), /gov=/);
    // Someone else opening the link sees the sheet, not their own save, and can keep it.
    const visitor = await browser.newContext({ viewport: { width, height: 900 } }), guest = await visitor.newPage();
    await guest.goto(origin + '/hero-gear/?lang=en'); await guest.locator('#gear-mithril').fill('7');
    await guest.goto(shared); await guest.waitForFunction(() => document.querySelectorAll('.gov-row').length === 6);
    assert.equal(await guest.locator('[data-target="governor-sheet.source"]').textContent(), 'A shared sheet.');
    assert.equal(await guest.locator('.gov-piece[data-gov="cav-2"]').getAttribute('data-state'), 'empty');
    assert.equal(await guest.locator('[data-action="governor-planner.profile"][data-value="custom"]').getAttribute('aria-pressed'), 'true', 'the profile travels in the link');
    assert.equal(await guest.locator('[data-action="governor-planner.weight"][data-troop="cav"]').inputValue(), '0', 'and its weights');
    assert.equal(await guest.locator('[data-bind="inventory.satin"]').inputValue(), '20000');
    assert.equal(await guest.evaluate(() => PlayerLedger.shared().governor('gear')['cav-2']), null);
    await guest.locator('[data-action="governor-sheet.saveMine"]').click();
    await Promise.all([guest.waitForNavigation(), guest.locator('[data-action="governor-sheet.confirm"]').click()]);
    await guest.waitForFunction(() => document.querySelectorAll('.gov-row').length === 6);
    assert.equal(await guest.evaluate(() => PlayerLedger.shared().governor('gear')['inf-1']), 0, 'save as mine writes the sheet');
    assert.equal(await guest.evaluate(() => PlayerLedger.shared().balance('satin').amount), 20000);
    assert.equal(await guest.evaluate(() => PlayerLedger.shared().balance('mithril').amount), 7, 'other facts in the save stay');
    assert.equal(await guest.locator('[data-target="governor-sheet.source"]').textContent(), 'Your save.');
    assert.doesNotMatch(guest.url(), /gov=/);
    await guest.goto(origin + '/governor-gear/?lang=en&gov=nonsense'); await guest.waitForFunction(() => document.querySelectorAll('.gov-row').length === 6);
    assert.match(await guest.locator('[data-target="governor-sheet.source"]').textContent(), /could not be read/);
    await visitor.close();
    assert.deepEqual(errors, []);
    await context.close();
  }
  {
    // A Governor Profile screenshot goes through the site's import dock and lands on the governor.
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } }), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/governor-gear/?lang=en'); await page.waitForFunction(() => document.querySelectorAll('.gov-row').length === 6);
    // The page's own upload area: a pick opens the dock's file picker, a drop goes straight to the dock.
    const drop = page.locator('.gov-left .gov-drop[data-screen-import="pick"][data-screen-import-drop]');
    assert.equal(await drop.count(), 1, 'the governor page has its own way in for a screenshot');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), drop.click()]);
    assert.ok(chooser.isMultiple(), 'the pick is the dock\'s own picker');
    await page.keyboard.press('Escape');
    const png = fs.readFileSync(path.resolve('.dsh/governor-fixtures/profile-purple.png')).toString('base64');
    const dropped = await page.evaluateHandle(png => { const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0)), t = new DataTransfer(); t.items.add(new File([bytes], 'profile.png', { type: 'image/png' })); return t; }, png);
    await drop.dispatchEvent('dragover', { dataTransfer: dropped });
    assert.equal(await drop.getAttribute('data-dragging'), 'true', 'the area answers a drag');
    await drop.dispatchEvent('drop', { dataTransfer: dropped });
    assert.equal(await drop.getAttribute('data-dragging'), null);
    await page.waitForFunction(() => document.querySelectorAll('#screen-import .import-tile').length === 24, null, { timeout: 60000 });
    const tile = key => page.locator('#screen-import .import-tile[data-key="' + key + '"]');
    assert.equal(await page.locator('#screen-import [data-target="screen-import.screen"]').textContent(), 'Governor Profile');
    assert.equal(await page.locator('#screen-import .import-grid').getAttribute('data-layout'), 'pieces');
    assert.deepEqual(await page.locator('#screen-import .import-tile').evaluateAll(nodes => nodes.slice(0, 8).map(n => n.dataset.key)), ['gov-cav-1', 'gov-cav-1-1', 'gov-cav-1-2', 'gov-cav-1-3', 'gov-cav-2', 'gov-cav-2-1', 'gov-cav-2-2', 'gov-cav-2-3'], 'laid out as the profile is, row by row');
    assert.equal(await tile('gov-cav-1').locator('[data-field="note"]').textContent(), 'Purple 0★');
    assert.equal(await tile('gov-arc-1').locator('[data-field="note"]').textContent(), 'Purple 1★');
    assert.deepEqual(await Promise.all(['gov-cav-1-1', 'gov-cav-1-2', 'gov-cav-1-3', 'gov-inf-2-3'].map(key => tile(key).locator('[data-field="value"]').inputValue())), ['3', '2', '2', '3']);
    assert.equal(await page.locator('#screen-import .import-tile[data-state="doubt"]').count(), 0, 'a clean screenshot needs no second look');
    assert.equal(await page.locator('#screen-import .import-tile img:not([hidden])').count(), 24, 'every value shows its cut-out');
    await page.locator('#screen-import').screenshot({ path: path.join(output, 'read-390.png') });
    await page.click('#screen-import [data-action="screen-import.apply"]');
    // Say what the dock and the sheet show if the reading never lands.
    await page.waitForFunction(() => document.querySelector('.gov-piece[data-gov="cav-1"] [data-part="level"]').textContent === 'Purple 0★').catch(async error => {
      const seen = await page.evaluate(() => ({ status: document.querySelector('#screen-import [data-target="screen-import.status"]').textContent, cav1: document.querySelector('.gov-piece[data-gov="cav-1"] [data-part="level"]').textContent, url: location.search }));
      throw new Error('the reading never reached the sheet: ' + JSON.stringify(seen) + ' errors ' + JSON.stringify(errors) + '\n' + error.message);
    });
    assert.equal(await page.locator('[data-charm="cav-1-1"] b').textContent(), '3');
    assert.equal(await page.locator('[data-charm="cav-2-1"] b').textContent(), '2');
    assert.equal(await page.locator('.gov-piece[data-gov="arc-1"] [data-part="level"]').textContent(), 'Purple 1★');
    assert.notEqual(await page.evaluate(() => PlayerLedger.shared().governor('gear')['cav-1']), null, 'on your own governor the reading is saved');
    // Undo puts it back.
    await page.click('#screen-import [data-action="screen-import.undo"]');
    await page.waitForFunction(() => document.querySelector('.gov-piece[data-gov="cav-1"]').dataset.state === 'unset');
    assert.equal(await page.evaluate(() => PlayerLedger.shared().governor('gear')['cav-1']), null);
    assert.deepEqual(errors, []);
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } }), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/governor-gear/?lang=ar'); await page.waitForFunction(() => document.querySelectorAll('.gov-row').length === 6);
  assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  await page.goto(origin + '/?lang=en'); await page.waitForFunction(() => window.BH);
  assert.equal(await page.locator('a.event-card[href="governor-gear/"]').count(), 1);
  assert.deepEqual(errors, []);
  await context.close();
  console.log('Governor gear UI: the shared profile and its editor, set all, the answer under Bear first and custom weights and by target, no inner scroll, saving as you go, the share link, start blank, load mine, save as mine from a link, reading a dropped screenshot, RTL and widths pass.');
}).catch(error => { console.error(error); process.exitCode = 1; });
