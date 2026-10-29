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
    const local = url => url.replace(/^https?:\/\/[^/]+/, origin);
    // A unit input's value is the whole count; what the box shows is in its unit.
    const raw = locator => locator.evaluate(n => n.value);

    for (const width of [320, 390, 768, 1280]) for (const lang of ['en', 'ar']) {
      const context = await device(width), page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(origin + '/vikings-vengeance/?lang=' + lang);
      assert(await page.locator('.vv-next strong').isVisible());
      await page.getByRole('button', { name: 'See an example' }).click();
      await page.getByText('Marches set').waitFor();
      assert.equal(await page.locator('#alliance-plan > div > .vv-rows .vv-row').count(), 4);
      await page.locator('.vv-rows .vv-row', { hasText: 'Rowan' }).click();
      await dialog(page).waitFor();
      assert.equal(await page.locator('dialog [data-queue]').count(), 3);
      assert(await page.evaluate(() => { const r = document.querySelector('dialog.vv-dialog').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && Math.abs(r.left - (innerWidth - r.right)) < 2; }), 'dialog is centred');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('tab', { name: 'My plan', exact: true }).click();
      await page.locator('#my-plan').getByRole('heading', { name: 'Rowan', exact: true }).waitFor();
      assert.equal(await page.locator('#my-plan .vv-march').count(), 4);
      assert(await page.locator('#my-plan .vv-march .vv-total').first().textContent().then(t => /k$/.test(t)));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      assert(await page.locator('main img').evaluateAll(images => images.every(image => !image.offsetParent || image.complete && image.naturalWidth > 0)));
      await page.screenshot({ path: path.join(out, lang + '-' + width + '.png'), fullPage: true });
      await context.close();
    }

    // Troop counts start in thousands, and another unit keeps the count.
    {
      const context = await device(), page = await context.newPage(); await page.goto(origin + '/vikings-vengeance/');
      const box = page.locator('[data-target="vikings.calculatorForm"] [name=infantry]'), unit = box.locator('xpath=following-sibling::select');
      assert.equal(await unit.inputValue(), 'k');
      await box.fill('240'); assert.equal(await raw(box), '240000');
      await unit.selectOption('m'); assert.equal(await raw(box), '240000');
      assert.equal(await box.evaluate(n => Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').get.call(n)), '0.24');
      await context.close();
    }

    // A leader opens a room, players sign up in thousands on their own devices, and each comes back to it.
    const errors = [], lead = await device(), L = await lead.newPage(); L.on('pageerror', e => errors.push(e.message));
    await L.goto(origin + '/vikings-vengeance/');
    await L.getByRole('button', { name: 'Set up your alliance' }).first().click();
    await dialog(L).locator('[name=time]').fill('20:00');
    await L.getByRole('button', { name: 'Set up', exact: true }).click();
    await dialog(L).locator('[data-action="vikings.copy"]').first().waitFor();
    const [join, view] = await dialog(L).locator('[data-action="vikings.copy"]').evaluateAll(nodes => nodes.map(n => n.dataset.value.match(/https?:\S+/)[0]));
    assert.match(join, /\/vv\/#join-[A-Za-z0-9_-]{22}$/); assert.match(view, /\/vv\/#view-[A-Za-z0-9_-]{22}$/);
    assert.equal(await L.locator('.vv-event h2').textContent(), 'Vikings');
    assert(await L.locator('.vv-when').getByText(/20:00 UTC/).isVisible());
    await dialog(L).locator('[data-action="vikings.closeDialog"]').click();
    // The leader signs up on the leader link, not a second link.
    await L.getByRole('tab', { name: 'My plan', exact: true }).click();
    const own = L.locator('[data-target="vikings.personal"] form');
    await own.locator('[name=nickname]').fill('Lead');
    for (const k of ['infantry', 'cavalry', 'archers']) await own.locator(`[name=${k}]`).fill('60');
    await own.locator('[name=marchCapacity]').fill('100'); await own.locator('[name=marches]').fill('2');
    await own.getByRole('button', { name: 'I’m in' }).click();
    await L.getByRole('heading', { name: 'Your marches' }).waitFor();
    // The leader link names no player; the leader's own sign-up is a player link kept beside it.
    assert(await L.evaluate(() => { const r = JSON.parse(localStorage.getItem('bh:vikings-links:v1')); return r.length === 2 && r.some(x => x.role === 'manage' && !x.id && !x.self) && r.some(x => x.role === 'registration' && x.id); }));
    await L.getByRole('tab', { name: 'Alliance', exact: true }).click();
    let again = await lead.newPage(); await again.goto(origin + '/vikings-vengeance/');
    await again.getByText('Marches set').waitFor(); await again.close();

    const players = {};
    for (const nickname of ['Rowan', 'Ash', 'Willow']) {
      const context = await device(), page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      if (nickname === 'Willow') {
        // Willow has troops in her save: the sign-up starts from them and writes changes back.
        await page.goto(origin + '/vikings-vengeance/');
        await page.evaluate(() => window.PlayerLedger.shared().setCombat({ troops: [{ type: 'inf', tier: 10, tg: 0, amount: 300000 }] }, 'manual'));
        assert.equal(await raw(page.locator('[data-target="vikings.calculatorForm"] [name=infantry]')), '300000');
      }
      await page.goto(local(join));
      if (nickname === 'Willow') {
        assert.equal(await raw(page.locator('[data-target="vikings.personal"] [name=infantry]')), '300000');
        assert(await page.locator('[data-target="vikings.personal"]').getByText('Synced with your saved troops').isVisible());
      }
      assert.equal(new URL(page.url()).hash, '', 'the code leaves the address bar');
      const signup = page.locator('[data-target="vikings.personal"] form');
      await signup.locator('[name=nickname]').fill(nickname);
      for (const k of ['infantry', 'cavalry', 'archers']) await signup.locator(`[name=${k}]`).fill('90');
      await signup.locator('[name=marchCapacity]').fill('150'); await signup.locator('[name=marches]').fill('2');
      await signup.getByRole('button', { name: 'I’m in' }).click();
      await dialog(page).getByRole('heading', { name: 'You’re in' }).waitFor();
      assert(await page.evaluate(() => JSON.parse(localStorage.getItem('bh:vikings-links:v1')).some(r => r.role === 'registration' && /^[A-Za-z0-9_-]{22}$/.test(r.code))));
      players[nickname] = context;
    }
    const willowSave = await players.Willow.pages()[0].evaluate(() => window.PlayerLedger.shared().combat().troops[0].amount);
    assert.equal(willowSave, 90000, 'a one-tier save follows the sign-up');
    const guest = await players.Willow.newPage(); await guest.goto(origin + '/vikings-vengeance/?guest');
    await guest.getByText('Guest mode: your saved troops').first().waitFor({ state: 'attached' });
    await guest.close();
    const stored = env.sql.prepare("SELECT infantry, march_capacity, attending FROM registrations WHERE nickname = 'Willow'").get();
    assert.deepEqual({ ...stored }, { infantry: 90000, march_capacity: 150000, attending: 1 });
    again = await players.Willow.newPage(); await again.goto(origin + '/vikings-vengeance/');
    await again.getByRole('heading', { name: 'Your marches' }).waitFor();
    await again.getByRole('button', { name: 'Can’t make it' }).click();
    await again.getByRole('heading', { name: /^You’re out for/ }).waitFor(); await again.close();

    await L.reload(); await L.getByText('Marches set').waitFor();
    assert.equal(await L.locator('#alliance-plan > div > .vv-rows .vv-row').count(), 3);
    const names = ['Rowan', 'Ash'];
    for (let i = 0; i < 2; i++) {
      await L.locator('.vv-rows .vv-row', { hasText: names[i] }).first().click();
      const d = dialog(L); await d.getByRole('button', { name: 'Even split' }).click();
      assert.equal(await d.locator('[name=infantry-1]').inputValue(), '45');
      await d.locator('[name=destination-1]').selectOption({ label: names[1 - i] });
      await d.getByRole('button', { name: 'Save', exact: true }).click(); await d.waitFor({ state: 'hidden' });
    }
    await L.screenshot({ path: path.join(out, 'leader-390.png'), fullPage: true });

    // Marches are live: no publishing step.
    again = await players.Rowan.newPage(); await again.goto(origin + '/vikings-vengeance/');
    await again.getByRole('heading', { name: 'Your marches' }).waitFor();
    assert.equal(await again.locator('#my-plan .vv-march').count(), 1);
    await again.screenshot({ path: path.join(out, 'player-390.png'), fullPage: true });

    // After the event, sign-ups reset and last time's troops are waiting.
    const real = Date.now; Date.now = () => real() + 15 * 86400000;
    try {
      again = await players.Ash.newPage(); await again.goto(origin + '/vikings-vengeance/');
      await again.getByRole('heading', { name: /^In for / }).waitFor();
      assert.equal(await raw(again.locator('[data-target="vikings.personal"] [name=infantry]')), '90000');
    } finally { Date.now = real; }

    // A viewing link shows the room once and is not remembered.
    const viewer = await device(), V = await viewer.newPage();
    await V.goto(local(view)); await V.getByRole('heading', { name: 'Whose marches?' }).waitFor();
    again = await viewer.newPage(); await again.goto(origin + '/vikings-vengeance/'); await again.waitForTimeout(300);
    assert(await again.getByRole('button', { name: 'Set up your alliance' }).first().isVisible());
    assert.equal(await again.locator('.vv-event').isVisible(), false);

    // A leader removes a player straight from the list.
    await L.bringToFront(); await L.reload(); await L.getByText('Marches set').waitFor();
    const before = await L.locator('#alliance-plan > div > .vv-rows .vv-row').count();
    await L.getByRole('button', { name: 'Remove Ash' }).click();
    await dialog(L).getByRole('button', { name: 'Remove', exact: true }).click(); await dialog(L).waitFor({ state: 'hidden' });
    await L.waitForFunction(n => document.querySelectorAll('#alliance-plan > div > .vv-rows .vv-row').length === n - 1, before);

    // Switching keeps the room listed, and the next visit waits for a choice.
    await L.getByRole('button', { name: 'Switch' }).click(); await L.reload();
    await L.getByRole('heading', { name: 'Your alliances' }).waitFor();
    await L.locator('.vv-rows .vv-row').first().click(); await L.getByText('Marches set').waitFor();
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
