// The Island page (island/, js/pages/island.mjs and js/island-board.mjs), after `npm run build`:
// open ground offers what fits, a staged piece places on ✓, its card counts and turns and removes,
// the catalogue filters by kind and name, a brush paints, and the preset carousel swaps the board
// and comes back to your plan. Keyboard only, so the board's camera never matters.
const assert = require('node:assert/strict'), path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');

withBrowser({ root: path.resolve('_site') }, async ({ browser, origin }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(origin + '/island/');
  const cv = page.locator('.island-board > canvas'), key = async (k, n = 1) => { for (let i = 0; i < n; i++) await cv.press(k); };
  await page.locator('.island-presets li').first().waitFor();
  assert.equal(await page.locator('.island-hint').innerText(), 'Tap open ground to see what fits there');
  assert.equal(await page.locator('.island-undo').isDisabled(), true);

  // Open ground: what fits, then stage and place.
  await cv.focus(); await key('ArrowUp', 8); await key('Enter');
  assert(await page.locator('.island-pop').isVisible());
  assert(await page.locator('.island-pop .island-piece').count() > 0);
  const name = await page.locator('.island-pop .island-piece span').first().textContent();
  await page.locator('.island-pop .island-piece').first().click();
  assert(await page.locator('.island-confirm').isVisible());
  await page.getByRole('button', { name: 'Place it' }).click();
  assert.match(await page.locator('.island-hint').innerText(), new RegExp('^' + name + ' placed'));
  assert.equal(await page.locator('.island-undo').isDisabled(), false);

  // Its card: you own, remove, undo.
  await cv.focus(); await key('Enter');
  assert.equal(await page.locator('.island-card h3').textContent(), name);
  assert.equal(await page.locator('.island-strip').isVisible(), false);
  await page.getByRole('button', { name: 'One more' }).click();
  assert.equal(await page.locator('.island-own output').innerText(), '1');
  assert.equal(await page.evaluate(() => Object.keys(PlayerLedger.shared().snapshot().inventory).some(k => k.startsWith('island-piece-'))), true);
  await page.locator('.island-card .island-act', { hasText: 'Remove' }).click();
  assert.match(await page.locator('.island-hint').innerText(), / removed · ↶ brings it back$/);
  await page.locator('.island-undo').click();
  await cv.focus(); await key('Enter');
  assert.equal(await page.locator('.island-card h3').textContent(), name, 'undo brings it back');
  await page.locator('.island-card .island-close').click();

  // The catalogue: kinds and search, then a brush that paints.
  await page.locator('.island-all').click();
  assert(await page.locator('dialog.island-sheet').evaluate(d => d.open));
  await page.locator('.island-kinds [role=tab]', { hasText: 'Paths & water' }).click();
  assert.equal(await page.locator('.island-kinds [aria-selected=true]').textContent(), 'Paths & water');
  await page.locator('.island-search input').fill('zzz');
  assert.equal(await page.locator('.island-sheet .island-empty').innerText(), 'Nothing by that name.');
  await page.locator('.island-search input').fill('pond');
  await page.locator('.island-sheet .island-piece').first().click();
  assert.equal(await page.locator('dialog.island-sheet').evaluate(d => d.open), false);
  assert.match(await page.locator('.island-brush').innerText(), /Pond[\s\S]*0 \/ 500 · 0 gems · drag to paint/);
  await cv.focus(); await key('ArrowDown', 12); await key('Enter');
  assert.match(await page.locator('.island-brush').innerText(), /1 \/ 500 · 200 gems/);
  await key('Escape');
  assert.equal(await page.locator('.island-brush').isVisible(), false);

  // Presets: the carousel swaps the board, keeps a copy, and goes back to yours.
  await page.locator('.island-owner-name').click();
  await page.locator('.island-deck-card').nth(2).waitFor();
  assert.equal(await page.locator('.island-deck-card[aria-current=true] b').textContent(), 'Your plan');
  await page.locator('.island-deck-card').nth(2).click();
  const preset = await page.locator('.island-deck-card').nth(2).locator('b').textContent();
  assert.equal(await page.locator('.island-owner-name').textContent(), preset + ' ▾');
  assert(await page.locator('.island-owner').evaluate(n => n.classList.contains('loose-leaf')));
  await page.locator('.island-owner button', { hasText: 'Back to mine' }).click();
  assert.equal(await page.locator('.island-owner').textContent(), 'Your plan ▾ Saved');
  await page.locator('.island-deck .island-close').click();
  assert.equal(await page.locator('.island-deck').isVisible(), false);

  // Full screen is the default; the page shows the presets and what's yours.
  assert.equal(await page.locator('.island-full').getAttribute('aria-pressed'), 'true');
  await page.locator('.island-full').click();
  assert.equal(await page.locator('.island-full').textContent(), 'Full screen');
  assert(await page.locator('.island-presets .island-preset').count() >= 9);
  assert.equal(await page.locator('#island-owned .note').innerText(), '1 kind of piece marked as yours.');
  assert.deepEqual(errors, []);
});
