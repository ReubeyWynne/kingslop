const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
const API = 'https://kingslop.reubeycw.workers.dev';
(async () => {
  // The real Worker and migrations, on node:sqlite, stand in for the deployed API.
  const { default: worker } = await import('../api/src/index.js'), { environment } = await import('../api/test/database.mjs');
  const env = environment();
  await withBrowser({ root: path.resolve('_site') }, async ({ browser, origin }) => {
    const out = path.resolve('.dsh/vikings-preview'); fs.mkdirSync(out, { recursive: true });
    env.ALLOWED_ORIGINS = origin;
    async function device(width = 390) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.route(API + '/**', async route => {
        const r = route.request(), body = r.method() === 'GET' ? undefined : r.postDataBuffer() || undefined;
        const res = await worker.fetch(new Request(r.url(), { method: r.method(), headers: r.headers(), body }), env);
        await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
      });
      return context;
    }
    const dialog = page => page.locator('dialog.vv-dialog');

    for (const width of [320, 390, 768, 1280]) for (const lang of ['en', 'ar']) {
      const context = await device(width), page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(origin + '/vikings-vengeance/?lang=' + lang);
      assert(await page.locator('.vv-next strong').isVisible());
      await page.getByRole('button', { name: 'See an example alliance plan' }).click();
      await page.getByRole('heading', { name: 'Rowan’s marches' }).waitFor();
      assert.equal(await page.locator('#my-plan .vv-march').count(), 4);
      assert(await page.locator('#my-plan').getByText('HQ · waves 10 & 20', { exact: true }).isVisible());
      await page.getByRole('tab', { name: 'Alliance', exact: true }).click();
      await page.locator('.vv-rows .vv-row', { hasText: 'Rowan' }).click();
      await dialog(page).waitFor();
      assert.equal(await page.locator('dialog [data-queue]').count(), 3);
      assert(await page.evaluate(() => document.querySelector('dialog.vv-dialog').getBoundingClientRect().width <= innerWidth));
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('button', { name: 'Publish marches' }).click();
      await page.getByRole('button', { name: 'Publish', exact: true }).click();
      assert(await page.getByText(/Published v1/).isVisible());
      await page.getByRole('tab', { name: 'My plan', exact: true }).click();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      assert(await page.locator('main img').evaluateAll(images => images.every(image => !image.offsetParent || image.complete && image.naturalWidth > 0)));
      await page.screenshot({ path: path.join(out, lang + '-' + width + '.png'), fullPage: true });
      await context.close();
    }

    // A leader creates a plan, invites a player on another device, publishes, and both come back to it.
    const errors = [], lead = await device(), L = await lead.newPage(); L.on('pageerror', e => errors.push(e.message));
    await L.goto(origin + '/vikings-vengeance/');
    await L.getByRole('button', { name: 'Create an alliance plan' }).first().click();
    assert.equal(await dialog(L).locator('[name=day]').count(), 4);
    await dialog(L).locator('[name=time]').fill('20:00');
    await L.getByRole('button', { name: 'Create plan' }).click();
    assert.equal(await L.locator('.vv-event h2').textContent(), 'Vikings');
    assert(await L.locator('.vv-when').getByText(/20:00 UTC/).isVisible());
    for (const name of ['Rowan', 'Ash']) {
      await L.getByRole('button', { name: 'Add a player' }).click();
      const d = dialog(L);
      await d.locator('[name=nickname]').fill(name);
      for (const k of ['infantry', 'cavalry', 'archers']) await d.locator(`[name=${k}]`).fill('100000');
      await d.locator('[name=marchCapacity]').fill('150000'); await d.locator('[name=marches]').fill('2');
      await d.getByRole('button', { name: 'Save player' }).click();
    }
    await L.getByRole('button', { name: 'Invite players' }).click();
    await dialog(L).locator('[data-action="vikings.copy"]').first().waitFor();
    const links = await dialog(L).locator('[data-action="vikings.copy"]').evaluateAll(nodes => nodes.map(n => n.dataset.value.match(/https?:\S+/)[0]));
    const [join, view] = links;
    assert.match(join, /\/vv\/#join-[A-Za-z0-9_-]{22}$/); assert.match(view, /\/vv\/#view-[A-Za-z0-9_-]{22}$/);
    await dialog(L).locator('[data-action="vikings.closeDialog"]').click();
    const local = url => url.replace(/^https?:\/\/[^/]+/, origin);
    let again = await lead.newPage(); await again.goto(origin + '/vikings-vengeance/');
    await again.getByText('Cities covered').waitFor(); await again.close();

    const player = await device(), P = await player.newPage(); P.on('pageerror', e => errors.push(e.message));
    await P.goto(local(join));
    assert.equal(new URL(P.url()).hash, '', 'the code leaves the address bar');
    const signup = P.locator('[data-target="vikings.personal"] form');
    await signup.locator('[name=nickname]').fill('Willow');
    for (const k of ['infantry', 'cavalry', 'archers']) await signup.locator(`[name=${k}]`).fill('90000');
    await signup.locator('[name=marchCapacity]').fill('150000'); await signup.locator('[name=marches]').fill('2');
    await signup.getByRole('button', { name: 'Join this event' }).click();
    await dialog(P).getByRole('heading', { name: 'Signed up' }).waitFor();
    assert(await P.evaluate(() => JSON.parse(localStorage.getItem('bh:vikings-links:v1')).some(r => r.role === 'registration' && /^[A-Za-z0-9_-]{22}$/.test(r.code))));
    again = await player.newPage(); await again.goto(origin + '/vikings-vengeance/');
    await again.locator('#my-plan').getByRole('heading', { name: 'You’re signed up' }).waitFor(); await again.close();
    again = await player.newPage(); await again.goto(local(join));
    await again.locator('#my-plan').getByRole('heading', { name: 'You’re signed up' }).waitFor(); await again.close();

    await L.reload(); await L.getByText('Cities covered').waitFor();
    const names = ['Rowan', 'Ash', 'Willow'];
    for (let i = 0; i < 3; i++) {
      await L.locator('.vv-rows .vv-row', { hasText: names[i] }).click();
      const d = dialog(L); await d.getByRole('button', { name: 'Even split' }).click();
      for (let q = 1; q <= 2; q++) await d.locator(`[name=destination-${q}]`).selectOption({ label: names[(i + q) % 3] });
      await d.getByRole('button', { name: 'Save', exact: true }).click(); await d.waitFor({ state: 'hidden' });
    }
    await L.getByRole('button', { name: 'Publish marches' }).click();
    await L.getByRole('button', { name: 'Publish', exact: true }).click();
    await L.getByText(/Published v1/).waitFor();
    await L.screenshot({ path: path.join(out, 'leader-390.png'), fullPage: true });

    again = await player.newPage(); await again.goto(origin + '/vikings-vengeance/');
    await again.getByRole('heading', { name: 'Your marches' }).waitFor();
    assert.equal(await again.locator('#my-plan .vv-march').count(), 2);
    await again.screenshot({ path: path.join(out, 'player-390.png'), fullPage: true });

    // A viewing link shows the plan once and is not remembered.
    const viewer = await device(), V = await viewer.newPage();
    await V.goto(local(view)); await V.getByRole('heading', { name: 'Whose marches?' }).waitFor();
    again = await viewer.newPage(); await again.goto(origin + '/vikings-vengeance/'); await again.waitForTimeout(300);
    assert(await again.getByRole('button', { name: 'Create an alliance plan' }).first().isVisible());
    assert.equal(await again.locator('.vv-event').isVisible(), false);

    // Switching plan keeps it listed, and the next visit waits for a choice.
    await L.getByRole('button', { name: 'Switch plan' }).click(); await L.reload();
    await L.getByRole('heading', { name: 'Your plans' }).waitFor();
    await L.locator('.vv-rows .vv-row').first().click(); await L.getByText('Cities covered').waitFor();
    assert.deepEqual(errors, []);

    const context = await browser.newContext({ javaScriptEnabled: false }), page = await context.newPage();
    await page.goto(origin + '/vikings-vengeance/', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    assert(await page.locator('#vikings-guide').isVisible());
    await page.locator('#online summary').click();
    assert(await page.locator('#online p').first().isVisible());
    await context.close();
  });
  env.sql.close();
})().catch(error => { console.error(error); process.exit(1); });
