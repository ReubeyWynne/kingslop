// Steps every ASCII scene frame by frame in Chromium (DESIGN.md, "Animation quality").
//
//   node .dsh/ascii-capture.cjs            check every scene in the built _site
//   node .dsh/ascii-capture.cjs --frames   also write each frame to .dsh/ascii-preview/
//   node .dsh/ascii-capture.cjs --frames --only=moon,march   just those scenes
//
// Every CSS animation is paused and moved to the same timestamp, one authored
// frame at a time, so the PNGs are the exact frames a visitor sees, not a
// lossy screen recording. Look at them before pushing a change to a scene.
// The check fails when a scene overflows a phone screen, an emblem leaves the
// centre of its rail, or a scene that should move holds a single frame.
const fs = require('node:fs');
const path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');

const root = path.resolve('_site');
const output = path.resolve('.dsh/ascii-preview');
const writeFrames = process.argv.includes('--frames');
// --only=march,hearth steps just the scenes whose names start with those words.
const only = (process.argv.find(arg => arg.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);

// [name, page, selector, seconds per authored frame, frames in one loop]
const scenes = [
  ['campfire', '/', '.ascii-home-hero .ascii-campfire', 1 / 12, 72],
  ['hearth', '/bear-hunt/', '.ascii-hearth', 1 / 6, 36],
  ['aurora', '/bear-hunt/', '.ascii-mini--aurora', 1 / 6, 178],
  ['sky', '/bear-hunt/', '.ascii-march-band', 1 / 8, 288],
  ['forge', '/bear-hunt/', '.ascii-rewards-intro .ascii-forge', 0.1, 24],
  ['charm', '/vikings-vengeance/', '.ascii-mini--charm', 0.2, 32],
  ['march', '/vikings-vengeance/', '.ascii-march-band', 1 / 8, 96],
  ['banner', '/swordland-showdown/', '.ascii-mini--banner', 0.15, 24],
  ['castle', '/castle-battle/', '.castle-heading .ascii-mini--castle', 1 / 12, 733],
  ['castle-card', '/castle-battle/', '.deck-card.is-selected .ascii-mini--castle', 1 / 12, 733],
  ['crown', '/vip-calculator/', '.ascii-mini--crown', 0.25, 32],
  ['dice', '/battle-simulator/', '.ascii-mini--dice', 0.224, 25],
  ['moon', '/events/', '.ascii-mini--moon', 19.6 / 112, 112],
  ['moon-card', '/events/', '.deck-card.is-selected .ascii-mini--moon', 19.6 / 112, 112],
  ['helm', '/heroes/', '.ascii-mini--helm', 0.25, 32],
  ['seal', '/governor-gear/', '.ascii-mini--seal', 0.25, 32],
  ['tome', '/masters/', '.ascii-mini--tome', 1 / 6, 48],
  ['keep', '/buildings/', '.ascii-mini--keep', 0.15, 40],
  ['pet', '/pets/', '.ascii-motif-rail .ascii-mini--pet', 1.2 / 16, 16],
  ['portrait', '/pets/', '#pet-grizzly-bear .ascii-mini--pet', 1 / 8, 71],
];

withBrowser({ root }, async ({ browser, origin: base }) => {
  const failures = [];

  for (const width of [320, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
    for (const [name, url, selector, period, count] of scenes.filter(scene =>
      (!process.argv.includes('--moon') || scene[0].startsWith('moon')) &&
      (!process.argv.includes('--castle') || scene[0].startsWith('castle')) &&
      (!only.length || only.some(prefix => scene[0].startsWith(prefix))))) {
      const page = await context.newPage();
      // These are the baked frames: the live pet (js/pet-live.js) is kept off so they show.
      await page.route('**/js/pet-live.js*', route => route.abort());
      await page.goto(base + url + '?lang=en', { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      if (name.endsWith('-card')) {
        await page.waitForFunction(() => document.querySelector('#ledger-btn').getAttribute('aria-controls') === 'page-deck');
        await page.locator('#ledger-btn').click();
        await page.waitForFunction(token => document.querySelector('.deck-card.is-selected')?.dataset.page === token, name === 'castle-card' ? 'castle' : 'kvksg');
      }
      await page.addStyleTag({ content: '.topbar, .toc { visibility: hidden !important; }' });
      if (url === '/vikings-vengeance/') {
        await page.getByRole('tab', { name: 'Guide', exact: true }).click();
      }
      // Open the collapsed section the scene sits in.
      await page.evaluate(selector => {
        document.querySelector(selector)?.closest('section')?.querySelector('.section-toggle[aria-expanded="false"]')?.click();
      }, selector);
      const scene = page.locator(selector).first();
      await scene.scrollIntoViewIfNeeded();
      await page.evaluate(() => document.getAnimations().forEach(animation => animation.pause()));

      const fit = await scene.evaluate(element => {
        const box = element.getBoundingClientRect();
        const rail = element.closest('.ascii-motif-rail, .deck-ascii');
        const railBox = rail && rail.getBoundingClientRect();
        return { left: box.left, right: box.right, width: innerWidth, skew: railBox ? (box.left - railBox.left) - (railBox.right - box.right) : 0 };
      });
      if (fit.left < -0.5 || fit.right > fit.width + 0.5) failures.push(`${name} @${width}px: overflows the screen (${fit.left.toFixed(1)} to ${fit.right.toFixed(1)})`);
      if (Math.abs(fit.skew) > 1) failures.push(`${name} @${width}px: sits ${fit.skew.toFixed(1)}px off the centre of its rail`);

      const box = await scene.boundingBox();
      const clip = { x: Math.max(0, box.x - 8), y: box.y - 8, width: Math.min(width - Math.max(0, box.x - 8), box.width + 16), height: box.height + 16 };
      const dir = path.join(output, `${width}`, name);
      if (writeFrames) fs.mkdirSync(dir, { recursive: true });
      const seen = new Set();
      for (let i = 0; i < count; i++) {
        // The middle of each authored frame, so rounding never lands on a boundary.
        const time = (i + 0.5) * period * 1000;
        await page.evaluate(time => document.getAnimations().forEach(animation => { animation.currentTime = time; }), time);
        const image = await page.screenshot({ clip, path: writeFrames ? path.join(dir, String(i).padStart(3, '0') + '.png') : undefined });
        seen.add(image.toString('base64'));
      }
      if (seen.size < 2) failures.push(`${name} @${width}px: holds one frame for the whole loop`);
      if (name.startsWith('moon') || name.startsWith('castle')) {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const still = await scene.evaluate((element, layers) => layers.map(pseudo => ({
          animation: getComputedStyle(element, pseudo).animationName,
          content: getComputedStyle(element, pseudo).content
        })), ['::before', '::after']);
        if (name.startsWith('castle')) {
          const layers = await scene.locator('.castle-smoke, .castle-lamps, .castle-siege').evaluateAll(elements => elements.map(element => ({
            animation: getComputedStyle(element, '::before').animationName,
            content: getComputedStyle(element, '::before').content
          })));
          still.push(...layers);
        }
        if (still.some(layer => layer.animation !== 'none' || layer.content === 'none')) failures.push(`${name} @${width}px: missing reduced-motion still`);
      }
      await page.close();
    }
    await context.close();
  }

  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(`ASCII scenes: ${scenes.length} scenes stepped at 320px and 390px` + (writeFrames ? `; frames in ${path.relative(process.cwd(), output)}` : ''));
}).catch(error => { console.error(error); process.exitCode = 1; });

