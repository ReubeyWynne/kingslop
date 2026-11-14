// The Battle Simulator's march fields several tiers per troop type: the dialog adds and removes
// tier rows, the army tile sums them and names each tier, and the fight takes them as one army.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
const root = path.resolve('_site');
const output = path.resolve('.dsh/sim-preview');
withBrowser({ root }, async ({ browser, origin }) => {
  fs.mkdirSync(output, { recursive: true });
  for (const width of [320, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/battle-simulator/?mode=battle&lang=en');
    await page.waitForFunction(() => document.getElementById('sim-fight-headline').textContent.trim());
    const headline = () => page.locator('#sim-fight-headline').textContent();
    const before = await headline();
    await page.locator('.army-tile[data-troop="arc"]').first().click();
    const dialog = page.locator('#sim-edit-you');
    await dialog.waitFor();
    const panel = dialog.locator('#sim-edit-you-arc');
    assert.equal(await panel.locator('.sim-tier-row:visible').count(), 1, 'one tier row to start');
    await panel.locator('.roster-add').click();
    assert.equal(await panel.locator('.sim-tier-row:visible').count(), 2);
    assert.equal(await page.inputValue('#sim-tier2-arc'), '9', 'the new row starts a tier down');
    await page.fill('#sim-n2-arc', '20000');
    await page.screenshot({ path: path.join(output, 'tiers-' + width + '.png') });
    await panel.locator('.roster-add').click();
    assert.equal(await panel.locator('.roster-add').isHidden(), true, 'three rows at most');
    await panel.locator('.sim-tier-row:visible .roster-remove').last().click();
    assert.equal(await panel.locator('.sim-tier-row:visible').count(), 2);
    await dialog.locator('.sim-dialog-head button').click();
    const tile = page.locator('.army-tile[data-troop="arc"]').first();
    assert.equal(await tile.locator('.army-tier').textContent(), 'T10 · TG0 + T9 · TG0');
    assert.match(await tile.locator('.army-count b').textContent(), /70,000/);
    await page.waitForFunction(b => document.getElementById('sim-fight-headline').textContent !== b, before);
    // Taking the row away again puts the fight back where it was.
    await tile.click();
    await panel.locator('.sim-tier-row:visible .roster-remove').click();
    await dialog.locator('.sim-dialog-head button').click();
    await page.waitForFunction(b => document.getElementById('sim-fight-headline').textContent === b, before);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Simulator tier rows: add, remove, tile totals and the fight pass.');
});
