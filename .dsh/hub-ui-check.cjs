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

    // Tasks: the R4 takes Bear Management for one trap, the R5 takes another and gives an internal task to the R4.
    assert.equal(await O.locator('#tasks .hub-task').count(), 16);
    await R.locator('#tasks .hub-task', { hasText: 'Bear Management' }).getByRole('button', { name: 'Take Bear Management' }).click();
    await R.locator('#tasks .hub-task[data-mine=true]', { hasText: 'Bear Management' }).waitFor();
    await R.getByRole('button', { name: 'Change or drop Bear Management' }).click();
    await dialog(R).locator('[name=label]').fill('Trap 2');
    await R.getByRole('button', { name: 'Save', exact: true }).click();
    await R.locator('#tasks .hub-task', { hasText: 'Bran (Trap 2)' }).waitFor();
    await O.locator('#hub-tools summary').click(); await O.getByRole('button', { name: 'Refresh' }).click();
    await O.locator('#tasks .hub-task', { hasText: 'Bran (Trap 2)' }).waitFor();
    await O.getByRole('button', { name: 'Edit Bear Management' }).click();
    await dialog(O).locator('[name=holder-owner]').check();
    await dialog(O).locator('[name=label-owner]').fill('Trap 1');
    await O.getByRole('button', { name: 'Save', exact: true }).click();
    await O.locator('#tasks .hub-task', { hasText: 'Bear Management' }).getByText('Bran (Trap 2) · Ada (Trap 1)').waitFor();
    await O.getByRole('button', { name: 'Edit AFK Maintenance' }).click();
    await dialog(O).locator('[name^=holder-]:not([name=holder-owner])').first().check();
    await O.getByRole('button', { name: 'Save', exact: true }).click();
    await O.locator('#tasks .hub-task', { hasText: 'AFK Maintenance' }).getByText('Bran').waitFor();
    assert(await O.locator('#tasks .hub-task', { hasText: 'AFK Maintenance' }).getByText('Leaders only').isVisible());
    assert(await O.locator('#tasks .hub-task[data-nobody=true]').count() >= 13, 'the R5 sees every task nobody holds');
    await M.reload(); await M.locator('#tasks').waitFor();
    assert.equal(await M.locator('#tasks-title').textContent(), 'Who to ask');
    assert.equal(await M.locator('#tasks .hub-task').count(), 1, 'members see public tasks somebody holds');
    assert.match(await M.locator('#tasks .hub-task').textContent(), /Bear Management[\s\S]*Bran \(Trap 2\) · Ada \(Trap 1\)/);
    assert.equal(await M.getByRole('button', { name: /^(Take|Mine|Edit|Open)/ }).count(), 0);
    assert.equal(await M.locator('#duties').count(), 0, 'members see no duties');

    // Coming up: the R4 takes a Sanctuary Friday and finishes it; the R5 gives Bear Management a weekly day and the list grows.
    await O.locator('#hub-tools summary').click(); await O.getByRole('button', { name: 'Refresh' }).click();
    await O.locator('#duties').waitFor();
    assert(await O.locator('#duties .hub-task', { hasText: 'Sanctuary Reward Distribution' }).count() >= 4, 'every Friday for four weeks');
    await R.reload();
    const friday = R.locator('#duties .hub-task', { hasText: 'Sanctuary Reward Distribution' }).first();
    await friday.getByRole('button', { name: /^Take Sanctuary Reward Distribution/ }).click();
    await R.locator('#duties .hub-task[data-mine=true]', { hasText: 'Sanctuary Reward Distribution' }).first().waitFor();
    await R.locator('#duties .hub-task[data-mine=true]').first().getByRole('button', { name: /^Open/ }).click();
    await dialog(R).locator('[name=done]').check();
    await R.getByRole('button', { name: 'Save', exact: true }).click();
    await R.locator('#duties .hub-task[data-done=true]').first().waitFor();
    await O.locator('#hub-tools summary').click(); await O.getByRole('button', { name: 'Refresh' }).click();
    await O.locator('#duties .hub-task[data-done=true]', { hasText: 'Bran' }).first().waitFor();
    const before = await O.locator('#duties .hub-task').count();
    await O.getByRole('button', { name: 'Edit Bear Management' }).click();
    await dialog(O).locator('[name=cadenceType]').selectOption('wheel');
    await dialog(O).locator('[name=days]').fill('40');
    await O.getByRole('button', { name: 'Save', exact: true }).click();
    await dialog(O).locator('.vv-dialog-message', { hasText: 'Pick days' }).waitFor();
    await dialog(O).locator('[name=cadenceType]').selectOption('weekly');
    await dialog(O).locator('[name=weekday]').selectOption('3');
    await dialog(O).locator('[name=dutyRule]').selectOption('claim');
    await O.getByRole('button', { name: 'Save', exact: true }).click();
    await O.locator('#tasks .hub-task', { hasText: 'Bear Management' }).getByText('Every Wednesday').waitFor();
    assert(await O.locator('#duties .hub-task', { hasText: 'Bear Management' }).count() >= 4);
    assert(await O.locator('#duties .hub-task[data-nobody=true]', { hasText: 'Bear Management' }).first().isVisible(), 'a date that must be claimed shows nobody yet');
    assert(await O.locator('#duties .hub-task').count() > before);
    await O.locator('#duties .hub-task', { hasText: 'Bear Management' }).first().getByRole('button', { name: /^Open/ }).click();
    await dialog(O).locator('[name=taker]').selectOption({ label: 'Ada' });
    await O.getByRole('button', { name: 'Save', exact: true }).click();
    await O.locator('#duties .hub-task[data-mine=true]', { hasText: 'Bear Management' }).first().waitFor();

    // Messages: today's Event Cycle card is there to copy; the R5 writes one about a task and the gaps fill in; a member sees none.
    await O.locator('#messages .hub-message').first().waitFor();
    assert(/Event Cycle · day \d+/.test(await O.locator('#messages .hub-message').first().innerText()));
    assert.equal(await M.locator('#messages').count(), 0, 'members have no messages');
    await O.getByRole('button', { name: 'Add a message' }).click();
    await dialog(O).locator('[name=title]').fill('Sanctuary reminder');
    await dialog(O).locator('[name=taskId]').selectOption({ label: 'Bear Management' });
    await dialog(O).locator('[name=body]').fill('{task} falls to {holder}. {oops}');
    assert(/Bear Management falls to/.test(await dialog(O).locator('.hub-copytext').innerText()), 'the draft shows the gaps filled');
    await O.getByRole('button', { name: 'Save', exact: true }).click();
    const note = O.locator('#messages .hub-message', { hasText: 'Sanctuary reminder' });
    await note.waitFor();
    assert(/Still to fill: \{oops\}/.test(await note.innerText()), 'an unknown gap is flagged');
    await note.getByRole('button', { name: /^Edit/ }).click();
    await dialog(O).locator('[name=body]').fill('{task}: {holder}');
    await O.getByRole('button', { name: 'Save', exact: true }).click();
    await O.locator('#messages .hub-message', { hasText: 'Bear Management:' }).waitFor();
    await O.locator('#messages .hub-message').nth(1).getByRole('button', { name: /^Copy /, exact: false }).click();
    // Without clipboard rights the text comes up to copy by hand; either way it is the filled message.
    await O.locator('.vv-message:has-text("Copied"), dialog[open] textarea.vv-link').first().waitFor();
    if (await dialog(O).locator('textarea.vv-link').count()) { assert(/^Bear Management: /.test(await dialog(O).locator('textarea.vv-link').inputValue())); await O.keyboard.press('Escape'); }
    await O.locator('#messages .hub-message').nth(1).getByRole('button', { name: /^Edit/ }).click();
    await dialog(O).getByRole('button', { name: 'Remove', exact: true }).click();
    await dialog(O).getByRole('button', { name: 'Remove', exact: true }).click();
    await O.locator('#messages .hub-message', { hasText: 'Sanctuary reminder' }).waitFor({ state: 'detached' });

    // The member sees the R4's notes after a reload; the R5 removes the R4, whose sign-in then stops working.
    await M.reload(); await M.locator('#notes .hub-text').waitFor();
    await O.locator('#leaders').getByRole('button', { name: 'Remove Bran' }).click();
    await dialog(O).getByRole('button', { name: 'Remove', exact: true }).click();
    await O.locator('#leaders').getByText('No R4s yet.').waitFor();
    assert.equal(await O.locator('#tasks .hub-task', { hasText: 'Bran' }).count(), 0, 'a removed R4 holds nothing');
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
      await page.keyboard.press('Escape'); await page.screenshot({ path: path.join(out, 'owner-390.png'), fullPage: true });
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log('hub UI ok');
  });
})().catch(e => { console.error(e); process.exit(1); });
