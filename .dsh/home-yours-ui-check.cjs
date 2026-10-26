// Home's own corner (js/home-yours.js), after a Jekyll build: hidden on an empty save, then once
// the save holds something it shows today on the 28-day clock, the first upgrade step of any
// kind, and what the save is holding, each linking to its page; it follows the save live, and
// reads in every language at 320px. Its scripts and styles stay off first paint: an empty save
// never fetches them, and a save fetches them once the page has loaded. Screenshots in .dsh/home-preview/.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
const root = path.resolve('_site'), output = path.resolve('.dsh/home-preview');
withBrowser({ root }, async ({ browser, origin }) => {
  fs.mkdirSync(output, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.addInitScript(() => { localStorage.setItem('bh:guide', JSON.stringify({ swipe: 'done', rail: 'done', door: 'done' })); window.moduleErrors = []; document.addEventListener('module:error', e => moduleErrors.push(e.detail)); });
  const yours = page.locator('#yours');
  async function open(lang) {
    await page.goto(origin + '/?lang=' + (lang || 'en'));
    await page.waitForFunction(lang => document.documentElement.lang === lang && window.PlayerLedger && window.Interactions, lang || 'en');
  }

  // A first visit sees the plain guide list.
  await open();
  assert.equal(await yours.isVisible(), false, 'hidden on an empty save');
  assert.equal(await page.evaluate(() => Boolean(window.UpgradePriority || document.querySelector('script[src*="home-yours"], link[rel=stylesheet][href*="next-step.css"]'))), false, 'an empty save fetches none of the corner');

  // Something in the save brings the corner, live.
  await page.evaluate(() => window.PlayerLedger.shared().setBuildings({ 'town-center': '24', embassy: '23', barracks: '22' }));
  await page.waitForFunction(() => window.UpgradePriority && document.querySelector('script[src*="home-yours"]'));
  assert.equal(await yours.isVisible(), false, 'buildings alone are not holdings');
  await page.evaluate(() => { const s = window.PlayerLedger.shared(); s.setHero('jabel', { level: 60, stars: 10, widget: 2, skills: null }); s.setBalance('mythic-hero-shard', 200); s.setPet('lion', { level: 20, advanced: false }); });
  await page.waitForSelector('#yours:not([hidden])');
  const day = await page.evaluate(() => { const n = new Date(), since = Math.floor((Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) - EventRules.EPOCH) / EventRules.DAY_MS); return (since % 28 + 28) % 28 + 1; });
  assert.match(await page.locator('[data-target="home-yours.today"]').textContent(), new RegExp('^day ' + day + ' of 28 · \\S'));
  assert.equal(await page.locator('#yours a[href="events/"]').count(), 1);
  assert.equal(await page.locator('[data-target="home-yours.held"]').textContent(), 'items: 1 · heroes: 1 · pets: 1');
  assert.equal(await page.locator('#yours a[href="town-centre/"]').count(), 1);
  // The next step is the priority page's first steps, whatever their kind.
  const want = await page.evaluate(() => { const w = UpgradePriorityWords(BH); return UpgradePriority.evaluate(PlayerLedger.shared().snapshot()).actions.slice(0, 2).map(s => w.words(s)[0]); });
  assert.ok(want.length, 'the engine has a step');
  assert.ok(await page.locator('#yours .next-step').isVisible());
  assert.deepEqual(await page.locator('#yours .next-step-list li b').allTextContents(), want);
  assert.equal(await page.locator('#yours .next-step-more').getAttribute('href'), 'upgrade-priority/#next');
  await page.screenshot({ path: path.join(output, 'yours-390.png'), fullPage: true });
  // A returning player's corner holds its place from first paint, so the guide list is not shoved.
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('#events');
  const early = await page.locator('#events').evaluate(el => el.getBoundingClientRect().top + scrollY);
  await page.waitForSelector('#yours:not([hidden]) .next-step:not([hidden])');
  const late = await page.locator('#events').evaluate(el => el.getBoundingClientRect().top + scrollY);
  assert.ok(late - early < 200, 'the corner held most of its space: shift ' + (late - early) + 'px');

  // Every language fills the corner and fits a 320px phone.
  await page.setViewportSize({ width: 320, height: 700 });
  for (const lang of fs.readdirSync('i18n').filter(f => f.endsWith('.js')).map(f => f.slice(0, -3))) {
    await open(lang);
    await page.waitForSelector('#yours:not([hidden])');
    const held = await page.locator('[data-target="home-yours.held"]').textContent();
    if (lang !== 'en') assert.notEqual(held, 'items: 1 · heroes: 1 · pets: 1', lang + ' is translated');
    assert.ok((await page.locator('[data-target="home-yours.today"]').textContent()).trim(), lang);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), lang + ' overflow');
    if (lang === 'ar' || lang === 'ja') await page.locator('#yours').screenshot({ path: path.join(output, 'yours-320-' + lang + '.png') });
  }

  // Clearing the save takes the corner away again.
  await open();
  await page.evaluate(() => localStorage.removeItem('bh:player-ledger:v1'));
  await open();
  assert.equal(await yours.isVisible(), false, 'hidden again once the save is cleared');
  // A save with nothing to hold gives back the held space.
  await page.evaluate(() => window.PlayerLedger.shared().setBuildings({ 'town-center': '24' }));
  await open();
  await page.waitForLoadState('networkidle'); // the corner's scripts follow the page's load
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('has-save')), false, 'an empty save gives back the space');
  assert.deepEqual(await page.evaluate(() => window.moduleErrors), []);
  assert.deepEqual(errors, []);
  console.log('Home: hidden on an empty save; once it holds something, today on the clock, the first upgrade steps of any kind and the holdings, live; 17 languages at 320px.');
}).catch(error => { console.error(error); process.exitCode = 1; });
