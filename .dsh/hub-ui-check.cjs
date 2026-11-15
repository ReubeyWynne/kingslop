const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
const API = 'https://kingslop.reubeycw.workers.dev';
(async () => {
  // The real Worker and migrations, on node:sqlite, stand in for the deployed API.
  const { default: worker } = await import('../api/src/index.js'), { environment } = await import('../api/test/database.mjs');
  const env = environment();
  await withBrowser({ root: path.resolve('_site') }, async ({ browser, origin }) => {
    const out = path.resolve('.dsh/hub-preview'); fs.mkdirSync(out, { recursive: true });
    env.ALLOWED_ORIGINS = origin;
    const errors = [];
    async function device(width = 390) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.route(API + '/**', async route => {
        const r = route.request(), body = r.method() === 'GET' ? undefined : r.postDataBuffer() || undefined;
        const res = await worker.fetch(new Request(r.url(), { method: r.method(), headers: r.headers(), body }), env);
        await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
      });
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      return { context, page };
    }
    const dialog = page => page.locator('dialog.vv-dialog');
    const local = url => url.replace(/^https?:\/\/[^/]+/, origin);
    const fits = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

    // The R5 sets up an alliance, writes the rules, and copies the three links.
    const owner = await device(), O = owner.page;
    await O.goto(origin + '/hub/');
    assert(await O.locator('#start').isVisible());
    await O.getByRole('button', { name: 'Set up your alliance' }).click();
    await dialog(O).locator('[name=name]').fill('[TST] Test alliance');
    await dialog(O).locator('[name=ownerName]').fill('Ada');
    await O.getByRole('button', { name: 'Set up', exact: true }).click();
    await O.getByRole('heading', { name: '[TST] Test alliance', level: 1 }).waitFor();
    assert(await O.locator('#rules').getByText('No rules written yet.').isVisible());
    await O.locator('#rules').getByRole('button', { name: 'Write' }).click();
    await dialog(O).locator('[name=body]').fill('No attacking allies.\nBe online for Vikings.');
    await O.getByRole('button', { name: 'Save', exact: true }).click();
    await O.locator('#rules .hub-text').waitFor();
    assert.match(await O.locator('#rules').textContent(), /No attacking allies\.\s+Be online for Vikings\.[\s\S]*Edited by Ada/);
    await O.getByRole('button', { name: 'Links', exact: true }).click();
    const [ownerLink, invite, member] = await dialog(O).locator('[data-copy]').evaluateAll(nodes => nodes.map(n => n.dataset.copy.match(/https?:\S+/)[0]));
    assert.match(ownerLink, /\/hub\/#own-[A-Za-z0-9_-]{22}$/); assert.match(invite, /\/hub\/#r4-[A-Za-z0-9_-]{22}$/); assert.match(member, /\/hub\/#ally-[A-Za-z0-9_-]{22}$/);
    await O.locator('dialog .vv-dialog-head button').click();

    // A member reads it and can change nothing.
    const reader = await device(), M = reader.page;
    await M.goto(local(member));
    await M.getByRole('heading', { name: '[TST] Test alliance', level: 1 }).waitFor();
    assert(!M.url().includes('#ally-'), 'the code leaves the address bar');
    assert.match(await M.locator('#rules').textContent(), /No attacking allies/);
    assert.equal(await M.getByRole('button', { name: /^(Write|Edit)$/ }).count(), 0);
    assert.equal(await M.locator('#leaders').count(), 0);
    assert.equal(await M.getByRole('button', { name: 'Links', exact: true }).count(), 0);

    // An R4 asks to join through the shared invite and waits.
    const ranger = await device(), R = ranger.page;
    await R.goto(local(invite));
    await R.getByRole('heading', { name: 'Join the leaders' }).waitFor();
    await R.locator('.hub-join [name=name]').fill('Bran');
    await R.getByRole('button', { name: 'Ask to join' }).click();
    await R.getByText('Waiting for Ada to let you in.').waitFor();
    assert.equal(await R.getByRole('button', { name: /^(Write|Edit)$/ }).count(), 0);

    // The R5 lets them in; the R4's phone now edits the notes, with their name on it.
    await O.locator('#hub-tools summary').click(); await O.getByRole('button', { name: 'Refresh' }).click();
    await O.locator('#leaders').getByText('Bran').waitFor();
    await O.locator('#leaders').getByRole('button', { name: 'Let in' }).click();
    await O.locator('#leaders .hub-leader[data-status=approved]').waitFor();
    await R.reload();
    await R.locator('#notes').getByRole('button', { name: 'Write' }).click();
    await dialog(R).locator('[name=body]').fill('Rally at 20:00 UTC.');
    await R.getByRole('button', { name: 'Save', exact: true }).click();
    await R.locator('#notes .hub-text').waitFor();
    assert.match(await R.locator('#notes').textContent(), /Rally at 20:00 UTC\.[\s\S]*Edited by Bran/);
    assert(await R.getByRole('button', { name: 'Copy my sign-in link' }).isVisible());
    assert.equal(await R.getByRole('button', { name: 'Links', exact: true }).count(), 0, 'an R4 cannot see the owner links');

    // The member sees the R4's notes after a reload; the R5 removes the R4, whose sign-in then stops working.
    await M.reload(); await M.locator('#notes .hub-text').waitFor();
    await O.locator('#leaders').getByRole('button', { name: 'Remove Bran' }).click();
    await dialog(O).getByRole('button', { name: 'Remove', exact: true }).click();
    await O.locator('#leaders').getByText('No R4s yet.').waitFor();
    await R.reload();
    await R.locator('.vv-message', { hasText: 'no longer works' }).waitFor();
    assert(await R.locator('#start').isVisible());

    // The pages fit every width, in both directions.
    for (const width of [320, 390, 768, 1280]) for (const lang of ['en', 'ar']) {
      const { context, page } = await device(width);
      await page.goto(origin + '/hub/?lang=' + lang);
      assert(await page.locator('#start').isVisible()); assert(await fits(page));
      await page.goto('about:blank');
      await page.goto(origin + '/hub/?lang=' + lang + '#ally-' + member.split('#ally-')[1]);
      await page.locator('#rules .hub-text').waitFor(); assert(await fits(page));
      assert(await page.locator('main img').evaluateAll(images => images.every(image => !image.offsetParent || image.complete && image.naturalWidth > 0)));
      await page.screenshot({ path: path.join(out, lang + '-' + width + '.png'), fullPage: true });
      await context.close();
    }
    {
      const { context, page } = await device(390);
      await page.goto(origin + '/hub/' + '#own-' + ownerLink.split('#own-')[1]);
      await page.getByRole('button', { name: 'Links', exact: true }).click();
      assert(await page.evaluate(() => { const r = document.querySelector('dialog.vv-dialog').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && Math.abs(r.left - (innerWidth - r.right)) < 2; }), 'the dialog is centred');
      await page.screenshot({ path: path.join(out, 'owner-links-390.png') });
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log('hub UI ok');
  });
})().catch(e => { console.error(e); process.exit(1); });
