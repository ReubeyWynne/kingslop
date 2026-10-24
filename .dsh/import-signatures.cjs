// Prints the signature of every whole tile an adapter finds in its fixtures,
// using the adapter's own tile finder in Chromium, so references match what
// the dock computes. Build the site first, then:
//   node .dsh/import-signatures.cjs backpack-items other-a2 other-a3 resources-a
//   node .dsh/import-signatures.cjs pet-list pet-list
// Tiles are numbered row by row from the top of each screenshot.
const path = require('node:path');
const { withBrowser } = require('./lib/browser-harness.cjs');
const root = path.resolve('_site');
withBrowser({ root, mounts: { '/fx/': path.resolve('.dsh/import-fixtures') } }, async ({ browser: b, origin }) => {
  const p = await b.newPage();
  await p.goto(origin + '/battle-simulator/?lang=en');
  for (const file of ['/js/screen-import-core.js', '/js/import-adapters/backpack.js', '/js/import-adapters/pets.js']) await p.addScriptTag({ url: file });
  const [adapter, ...names] = process.argv.slice(2);
  for (const name of names) {
    const out = await p.evaluate(async ([n, id]) => {
      const bm = await createImageBitmap(await (await fetch('/fx/' + n + '.jpg')).blob());
      const c = document.createElement('canvas'); c.width = 360; c.height = Math.round(bm.height * 360 / bm.width);
      const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bm, 0, 0, c.width, c.height);
      const px = ctx.getImageData(0, 0, c.width, c.height), A = ScreenImport.get(id);
      return A.findTiles(px).map((t, i) => ({ i, sig: A.signature(px, t), match: ((m) => m ? m.id + '@' + m.dist.toFixed(3) : null)(A.identify(A.signature(px, t))) }));
    }, [name, adapter]);
    console.log('== ' + name + ' (' + out.length + ' tiles)');
    out.forEach(t => console.log(t.i, t.match || '-', t.sig));
  }
}).catch(e => { console.error(e); process.exitCode = 1; });
