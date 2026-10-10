// Steps every ASCII scene frame by frame in Chromium (DESIGN.md, "Animation quality").
//
//   node .dsh/ascii-capture.cjs            check every scene in the built _site
//   node .dsh/ascii-capture.cjs --frames   also write each frame to .dsh/ascii-preview/
//
// Every CSS animation is paused and moved to the same timestamp, one authored
// frame at a time, so the PNGs are the exact frames a visitor sees, not a
// lossy screen recording. Look at them before pushing a change to a scene.
// The check fails when a scene overflows a phone screen, an emblem leaves the
// centre of its rail, or a scene that should move holds a single frame.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve('_site');
const output = path.resolve('.dsh/ascii-preview');
const writeFrames = process.argv.includes('--frames');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

// [name, page, selector, seconds per authored frame, frames in one loop]
const scenes = [
  ['campfire', '/', '.ascii-home-hero .ascii-campfire', 1 / 12, 72],
  ['hearth', '/bear-hunt/', '.ascii-hearth', 1 / 6, 36],
  ['bear', '/bear-hunt/', '.ascii-mini--bear', 0.2, 36],
  ['hunt-march', '/bear-hunt/', '.ascii-march-band', 1 / 8, 96],
  ['forge', '/bear-hunt/', '.ascii-rewards-intro .ascii-forge', 0.1, 24],
  ['charm', '/vikings-vengeance/', '.ascii-mini--charm', 0.2, 32],
  ['march', '/vikings-vengeance/', '.ascii-march-band', 1 / 8, 96],
  ['banner', '/swordland-showdown/', '.ascii-mini--banner', 0.15, 24],
  ['crown', '/vip-calculator/', '.ascii-mini--crown', 0.25, 32],
  ['dice', '/battle-simulator/', '.ascii-mini--dice', 0.224, 25],
  ['moon', '/events/', '.ascii-mini--moon', 0.7, 28],
  ['helm', '/heroes/', '.ascii-mini--helm', 0.25, 32],
  ['seal', '/governor-gear/', '.ascii-mini--seal', 0.25, 32],
];

const server = http.createServer((request, response) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  if (!file.startsWith(root)) { response.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const failures = [];
  let browser;
  try {
    browser = await chromium.launch();
    for (const width of [320, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
      for (const [name, url, selector, period, count] of scenes) {
        const page = await context.newPage();
        await page.goto(base + url + '?lang=en', { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        await page.addStyleTag({ content: '.topbar, .toc { visibility: hidden !important; }' });
        // Open the collapsed section the scene sits in.
        await page.evaluate(selector => {
          document.querySelector(selector)?.closest('section')?.querySelector('.section-toggle[aria-expanded="false"]')?.click();
        }, selector);
        const scene = page.locator(selector).first();
        await scene.scrollIntoViewIfNeeded();
        await page.evaluate(() => document.getAnimations().forEach(animation => animation.pause()));

        const fit = await scene.evaluate(element => {
          const box = element.getBoundingClientRect();
          const rail = element.closest('.ascii-motif-rail');
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
        await page.close();
      }
      await context.close();
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log(`ASCII scenes: ${scenes.length} scenes stepped at 320px and 390px` + (writeFrames ? `; frames in ${path.relative(process.cwd(), output)}` : ''));
})().catch(error => { console.error(error); process.exit(1); });
