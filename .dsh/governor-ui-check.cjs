const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
const root = path.resolve('_site'), output = path.resolve('.dsh/governor-preview');
withBrowser({ root }, async ({ browser, origin }) => {
  fs.mkdirSync(output, { recursive: true });

  for (const width of [320, 390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' }), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const ready = () => page.waitForFunction(() => document.querySelectorAll('.gov-row').length === 6);
    const target = key => page.locator('[data-planner="' + key + '"]');
    const profile = key => page.locator('[data-profile="' + key + '"]');
    const tile = id => page.locator('.gov-piece[data-gov="' + id + '"]');
    const row = id => page.locator('.gov-row[data-item="' + id + '"]');
    await page.goto(origin + '/governor-gear/?lang=en'); await ready();
    // An unset piece shows as unknown ink rather than a note.
    assert.equal(await page.locator('.gov-piece-level[data-tally="unknown"]').count(), 6);
    assert.equal(await page.locator('.gov-row-gear[data-tally="unknown"]').count(), 6);
    assert.equal(await page.locator('#governor-bag input[data-tally="blank"]').count(), await page.locator('#governor-bag input').count());
    assert.equal(await tile('cav-1').locator('.gov-piece-name').textContent(), 'Hat');
    await page.fill('[data-bind="inventory.satin"]', '20000'); await page.fill('[data-bind="inventory.gilded-threads"]', '200'); await page.fill('[data-bind="inventory.artisans-vision"]', '0');
    assert.equal(await page.getAttribute('[data-bind="inventory.artisans-vision"]', 'data-tally'), 'zero');
    assert.equal(await page.getAttribute('[data-bind="inventory.satin"]', 'data-tally'), null);
    assert.equal(await page.getAttribute('#governor-bag output.seal', 'data-state'), 'saved');
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
    await dialog.locator('[data-profile="close"]').click();
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
    assert.equal(await page.locator('select[data-planner=\"profile\"]').inputValue(), 'bear');
    assert.match(await target('score').textContent(), /^\+[\d,]+ governor score$/);
    // Event points: gear and charms on their own rows, one column per event, as on Hero gear.
    assert.deepEqual(await target('events').locator('tbody th').allTextContents(), ['Gear', 'Charms']);
    assert.deepEqual(await target('events').locator('thead th').allTextContents(), ['KvK prep', 'Strongest Governor', 'Alliance Brawl']);
    const gearPoints = target('events').locator('tbody tr').first().locator('td');
    assert.match(await gearPoints.nth(0).textContent(), /^[\d,]+day 5$/, 'KvK prep day 5 scores gear at 36 a point');
    assert.equal(await gearPoints.nth(1).getAttribute('data-points'), 'none', 'Strongest Governor does not score gear');
    assert.match(await gearPoints.nth(2).textContent(), /^[\d,]+days 5, 6$/);
    // The profiles are Hero gear's, in its order, plus Event score.
    assert.deepEqual(await page.locator('select[data-planner="profile"] option').evaluateAll(o => o.map(n => n.value)), ['bear', 'growth', 'combat', 'gen4', 'garrison', 'equal', 'score', 'custom']);
    assert.equal(await page.locator('[data-planner="bill"] > div').count(), 5);
    assert.equal(await page.locator('.gov-result').evaluate(n => getComputedStyle(n).overflowY), 'visible', 'no box that scrolls');
    // Bear first shows its weights in the Advanced fold; typing one makes them custom weights, which travel in the link.
    await target('weightsFold').locator('summary').click();
    const weights = () => page.locator('[data-planner="weight"]').evaluateAll(nodes => nodes.map(n => n.dataset.troop + ' ' + n.value));
    assert.deepEqual(await weights(), ['inf 2.2', 'cav 1.6', 'arc 4.2']);
    await page.fill('[data-planner="weight"][data-troop="cav"]', '0');
    await page.locator('[data-planner="weight"][data-troop="cav"]').dispatchEvent('change');
    // On your own save the weights are kept there; a share link carries them as w=.
    await page.waitForFunction(() => window.Governor.encodeLink({ gear: {}, charms: {}, bag: {}, prefs: window.PlayerLedger.shared().snapshot().preferences.governor || {} }).w === '2.2_0_4.2');
    assert.equal(await page.locator('select[data-planner=\"profile\"]').inputValue(), 'custom');
    assert.deepEqual(await page.locator('.gov-row[data-moved="true"]').evaluateAll(rows => rows.map(r => r.dataset.item).filter(id => /^cav/.test(id))), [], 'a troop at 0 stays where it is');
    await page.fill('[data-planner="weight"][data-troop="inf"]', '1.5');
    await page.locator('[data-planner="weight"][data-troop="inf"]').dispatchEvent('change');
    await page.waitForFunction(() => window.Governor.encodeLink({ gear: {}, charms: {}, bag: {}, prefs: window.PlayerLedger.shared().snapshot().preferences.governor || {} }).w === '1.5_0_4.2');
    await page.selectOption('select[data-planner="profile"]', 'score');
    assert.equal(await target('weightsFold').isHidden(), true, 'event score has no weights');
    await page.selectOption('select[data-planner="profile"]', 'custom');
    assert.equal(await target('weightsFold').evaluate(node => node.open), true, 'choosing Custom opens the weights, as on Hero gear');
    assert.deepEqual(await weights(), ['inf 1.5', 'cav 0', 'arc 4.2'], 'custom weights are kept');
    await page.click('[role="tab"][data-value="reach"]');
    await target('reachTroop').selectOption('arc');
    await target('gearTarget').selectOption('4');
    assert.equal(await target('billTitle').textContent(), 'Needs');
    assert.match(await row('arc-1').locator('.gov-row-gear').textContent(), /→ Blue 0★ 1★|→ Blue 1★/);
    assert.equal(await row('inf-1').getAttribute('data-moved'), 'false');
    assert.equal(await page.locator('.gov-row-gear[data-tally="unknown"]').count(), 1);
    await page.click('[role="tab"][data-value="spend"]');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, 'no sideways scroll at ' + width);
    await page.screenshot({ path: path.join(output, width + '.png'), fullPage: true });
    await page.reload(); await ready();
    assert.equal(await tile('inf-1').getAttribute('data-state'), 'empty');
    assert.equal(await tile('arc-2').getAttribute('data-state'), 'unset');
    assert.equal(await tile('cav-2').getAttribute('data-state'), 'empty');
    assert.equal(await page.locator('select[data-planner=\"profile\"]').inputValue(), 'custom');
    assert.equal(await page.locator('[data-bind="inventory.satin"]').inputValue(), '20000');
    // Without a link the page works on your save: edits save as you go and the address stays clean.
    const sheet = key => page.locator('[data-sheet="' + key + '"]');
    assert.doesNotMatch(page.url(), /gov=/);
    assert.equal(await page.evaluate(() => PlayerLedger.shared().governor('gear')['inf-1']), 0);
    assert.equal(await page.evaluate(() => PlayerLedger.shared().balance('satin').amount), 20000);
    assert.equal(await sheet('source').textContent(), 'Your save.');
    assert.equal(await sheet('hint').textContent(), 'Changes save as you go.');
    assert.ok(await sheet('saveMine').isHidden()); assert.ok(await sheet('loadMine').isHidden());
    // Copy share link carries the governor, bag and priority.
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    await page.locator('[data-sheet="copy"]').click();
    await page.waitForFunction(() => document.querySelector('[data-sheet="copy"]').textContent === 'Link copied');
    const shared = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(shared, /[?&]gov=[^&]{24}/); assert.match(shared, /[?&]bag=20000\.200\.0\.\.(&|$)/);
    // Start blank opens a sheet of its own; Load mine goes back to your save.
    await Promise.all([page.waitForNavigation(), sheet('blank').click()]); await ready();
    assert.equal(await tile('inf-1').getAttribute('data-state'), 'unset');
    assert.equal(await sheet('source').textContent(), 'A blank sheet.');
    assert.match(page.url(), /gov=\.{24}(&|#|$)/); assert.doesNotMatch(page.url(), /bag=/);
    await tile('inf-1').click(); await dialog.locator('.gov-edit-gear [data-step="1"]').click(); await dialog.locator('[data-profile="close"]').click();
    assert.equal(await page.evaluate(() => PlayerLedger.shared().governor('gear')['inf-1']), 0, 'a sheet leaves the save');
    assert.equal(await sheet('source').textContent(), 'A shared sheet.');
    await Promise.all([page.waitForNavigation(), sheet('loadMine').click()]); await ready();
    assert.equal(await tile('inf-1').getAttribute('data-state'), 'empty');
    assert.doesNotMatch(page.url(), /gov=/);
    // Someone else opening the link sees the sheet, not their own save, and can keep it.
    const visitor = await browser.newContext({ viewport: { width, height: 900 } }), guest = await visitor.newPage();
    await guest.goto(origin + '/hero-gear/?lang=en'); await guest.locator('#gear-mithril').fill('7');
    await guest.goto(shared); await guest.waitForFunction(() => document.querySelectorAll('.gov-row').length === 6);
    assert.equal(await guest.locator('[data-sheet="source"]').textContent(), 'A shared sheet.');
    assert.equal(await guest.locator('.gov-piece[data-gov="cav-2"]').getAttribute('data-state'), 'empty');
    assert.equal(await guest.locator('select[data-planner=\"profile\"]').inputValue(), 'custom', 'the profile travels in the link');
    assert.equal(await guest.locator('[data-planner="weight"][data-troop="cav"]').inputValue(), '0', 'and its weights');
    assert.equal(await guest.locator('[data-bind="inventory.satin"]').inputValue(), '20000');
    assert.equal(await guest.evaluate(() => PlayerLedger.shared().governor('gear')['cav-2']), null);
    await guest.locator('[data-sheet="saveMine"]').click();
    await Promise.all([guest.waitForNavigation(), guest.locator('[data-sheet="confirm"]').click()]);
    await guest.waitForFunction(() => document.querySelectorAll('.gov-row').length === 6);
    assert.equal(await guest.evaluate(() => PlayerLedger.shared().governor('gear')['inf-1']), 0, 'save as mine writes the sheet');
    assert.equal(await guest.evaluate(() => PlayerLedger.shared().balance('satin').amount), 20000);
    assert.equal(await guest.evaluate(() => PlayerLedger.shared().balance('mithril').amount), 7, 'other facts in the save stay');
    assert.equal(await guest.locator('[data-sheet="source"]').textContent(), 'Your save.');
    assert.doesNotMatch(guest.url(), /gov=/);
    await guest.goto(origin + '/governor-gear/?lang=en&gov=nonsense'); await guest.waitForFunction(() => document.querySelectorAll('.gov-row').length === 6);
    assert.match(await guest.locator('[data-sheet="source"]').textContent(), /could not be read/);
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
    assert.equal(await page.locator('#screen-import [data-import="screen"]').textContent(), 'Governor Profile');
    assert.equal(await page.locator('#screen-import .import-grid').getAttribute('data-layout'), 'pieces');
    assert.deepEqual(await page.locator('#screen-import .import-tile').evaluateAll(nodes => nodes.slice(0, 8).map(n => n.dataset.key)), ['gov-cav-1', 'gov-cav-1-1', 'gov-cav-1-2', 'gov-cav-1-3', 'gov-cav-2', 'gov-cav-2-1', 'gov-cav-2-2', 'gov-cav-2-3'], 'laid out as the profile is, row by row');
    assert.equal(await tile('gov-cav-1').locator('[data-field="note"]').textContent(), 'Purple 0★');
    assert.equal(await tile('gov-arc-1').locator('[data-field="note"]').textContent(), 'Purple 1★');
    assert.deepEqual(await Promise.all(['gov-cav-1-1', 'gov-cav-1-2', 'gov-cav-1-3', 'gov-inf-2-3'].map(key => tile(key).locator('[data-field="value"]').inputValue())), ['3', '2', '2', '3']);
    assert.equal(await page.locator('#screen-import .import-tile[data-state="doubt"]').count(), 0, 'a clean screenshot needs no second look');
    assert.equal(await page.locator('#screen-import .import-tile img:not([hidden])').count(), 24, 'every value shows its cut-out');
    await page.locator('#screen-import').screenshot({ path: path.join(output, 'read-390.png') });
    await page.click('#screen-import [data-import="apply"]');
    // Say what the dock and the sheet show if the reading never lands.
    await page.waitForFunction(() => document.querySelector('.gov-piece[data-gov="cav-1"] [data-part="level"]').textContent === 'Purple 0★').catch(async error => {
      const seen = await page.evaluate(() => ({ status: document.querySelector('#screen-import [data-import="status"]').textContent, cav1: document.querySelector('.gov-piece[data-gov="cav-1"] [data-part="level"]').textContent, url: location.search }));
      throw new Error('the reading never reached the sheet: ' + JSON.stringify(seen) + ' errors ' + JSON.stringify(errors) + '\n' + error.message);
    });
    assert.equal(await page.locator('[data-charm="cav-1-1"] b').textContent(), '3');
    assert.equal(await page.locator('[data-charm="cav-2-1"] b').textContent(), '2');
    assert.equal(await page.locator('.gov-piece[data-gov="arc-1"] [data-part="level"]').textContent(), 'Purple 1★');
    assert.notEqual(await page.evaluate(() => PlayerLedger.shared().governor('gear')['cav-1']), null, 'on your own governor the reading is saved');
    // Undo puts it back.
    await page.click('#screen-import [data-import="undo"]');
    await page.waitForFunction(() => document.querySelector('.gov-piece[data-gov="cav-1"]').dataset.state === 'unset');
    assert.equal(await page.evaluate(() => PlayerLedger.shared().governor('gear')['cav-1']), null);
    assert.deepEqual(errors, []);
    await context.close();
  }
  {
    // Gear and charms are marked applied apart: each writes its own levels and spends its own materials, and can be undone.
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } }), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/governor-gear/?lang=en'); await page.waitForFunction(() => document.querySelectorAll('.gov-row').length === 6);
    const button = kind => page.locator('[data-planner="apply"][data-kind="' + kind + '"]');
    assert.ok(await page.locator('[data-planner="applied"]').isHidden(), 'nothing to apply before anything is set');
    await page.locator('.gov-fill select[data-kind="gear"]').selectOption('0');
    await page.evaluate(() => { const s = PlayerLedger.shared(); s.setGovernor('charms', Object.fromEntries(Object.keys(s.governor('charms')).map(id => [id, 0]))); });
    for (const [id, n] of [['satin', '20000'], ['gilded-threads', '200'], ['artisans-vision', '0'], ['charm-guide', '400'], ['charm-design', '400']]) await page.fill('[data-bind="inventory.' + id + '"]', n);
    await page.waitForFunction(() => document.querySelector('[data-planner="apply"][data-kind="charms"]').hidden === false);
    assert.equal(await button('gear').textContent(), 'Mark gear applied');
    assert.equal(await button('charms').textContent(), 'Mark charms applied');
    const planned = await page.evaluate(() => [...document.querySelectorAll('.gov-row')].map(r => r.querySelector('.gov-row-gear').textContent));
    await button('gear').click();
    await page.waitForFunction(() => document.querySelector('[data-planner="apply"][data-kind="gear"]').dataset.state === 'applied');
    const saved = await page.evaluate(() => { const s = PlayerLedger.shared(); return { gear: s.governor('gear'), charms: s.governor('charms'), satin: s.balance('satin').amount, guide: s.balance('charm-guide').amount }; });
    assert.ok(Object.values(saved.gear).some(level => level > 0), 'the planned gear levels are saved');
    assert.ok(saved.satin < 20000, 'the gear materials are spent');
    assert.ok(Object.values(saved.charms).every(level => level === 0), 'charms are untouched');
    assert.equal(saved.guide, 400, 'charm materials are untouched');
    assert.equal(await button('gear').textContent(), 'Gear applied. Undo');
    assert.equal(await button('charms').textContent(), 'Mark charms applied');
    await button('charms').click();
    await page.waitForFunction(() => PlayerLedger.shared().balance('charm-guide').amount < 400);
    assert.equal(await button('gear').textContent(), 'Gear applied. Undo', 'applying charms keeps the gear undo');
    await page.reload(); await page.waitForFunction(() => document.querySelectorAll('.gov-row').length === 6);
    assert.ok(Object.values(await page.evaluate(() => PlayerLedger.shared().governor('gear'))).some(level => level > 0), 'kept on this device');
    await page.goto(origin + '/governor-gear/?lang=en'); await page.waitForFunction(() => document.querySelectorAll('.gov-row').length === 6);
    // A fresh page has nothing to undo, so the gear spend is final there; undo is checked on the page that applied it.
    await page.evaluate(() => { const s = PlayerLedger.shared(); s.setGovernor('gear', Object.fromEntries(Object.keys(s.governor('gear')).map(id => [id, 0]))); s.setBalance('satin', 20000); s.setBalance('gilded-threads', 200); s.setBalance('artisans-vision', 0); });
    await page.waitForFunction(() => document.querySelector('[data-planner="apply"][data-kind="gear"]').hidden === false);
    await button('gear').click();
    await page.waitForFunction(() => document.querySelector('[data-planner="apply"][data-kind="gear"]').dataset.state === 'applied');
    await button('gear').click();
    await page.waitForFunction(() => PlayerLedger.shared().balance('satin').amount === 20000 && PlayerLedger.shared().balance('gilded-threads').amount === 200);
    assert.ok(Object.values(await page.evaluate(() => PlayerLedger.shared().governor('gear'))).every(level => level === 0), 'undo puts the gear back');
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.gov-row')].map(r => r.querySelector('.gov-row-gear').textContent)), planned, 'the same plan is offered again');
    assert.equal(await button('gear').textContent(), 'Mark gear applied');
    await page.screenshot({ path: path.join(output, 'applied-390.png'), fullPage: true });
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
  console.log('Governor gear UI: the shared profile and its editor, set all, the answer under Bear first and custom weights and by target, no inner scroll, saving as you go, the share link, start blank, load mine, save as mine from a link, reading a dropped screenshot, gear and charms applied apart, RTL and widths pass.');
}).catch(error => { console.error(error); process.exitCode = 1; });
