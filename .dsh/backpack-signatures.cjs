// Prints the icon signature of every whole tile in backpack fixtures, using the
// adapter's own tile finder in Chromium, so references match what the dock
// computes. Build the site first, then:
//   node .dsh/backpack-signatures.cjs other-a2 other-a3 resources-a
// Tiles are numbered row by row from the top of each screenshot.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve('_site');
const server = http.createServer((q, r) => {
  let f = path.resolve(root, '.' + decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (q.url.startsWith('/fx/')) f = path.resolve('.dsh/import-fixtures', path.basename(q.url));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) return r.writeHead(404).end();
  r.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(r);
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch(), p = await b.newPage();
  await p.goto('http://127.0.0.1:' + server.address().port + '/battle-simulator/?lang=en');
  for (const file of ['/js/screen-import-core.js', '/js/import-adapters/backpack.js']) await p.addScriptTag({ url: file });
  for (const name of process.argv.slice(2)) {
    const out = await p.evaluate(async n => {
      const bm = await createImageBitmap(await (await fetch('/fx/' + n + '.jpg')).blob());
      const c = document.createElement('canvas'); c.width = 360; c.height = Math.round(bm.height * 360 / bm.width);
      const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bm, 0, 0, c.width, c.height);
      const px = ctx.getImageData(0, 0, c.width, c.height), A = ScreenImport.get('backpack-items');
      return A.findTiles(px).map((t, i) => ({ i, sig: A.signature(px, t), match: (A.identify(A.signature(px, t)) || {}).id || null }));
    }, name);
    console.log('== ' + name + ' (' + out.length + ' tiles)');
    out.forEach(t => console.log(t.i, t.match || '-', t.sig));
  }
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
