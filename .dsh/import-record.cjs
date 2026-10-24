// Records what the production OCR worker reads from fixture screenshots, for
// the node adapter checks. Build the site first, then:
//   node .dsh/import-record.cjs overview-resources other-a1 ...
// writes .dsh/import-fixtures/<name>.items.json and prints the rows.
const fs = require('fs'), path = require('path');
const { withBrowser } = require('./lib/browser-harness.cjs');
const root = path.resolve('_site');
withBrowser({ root, mounts: { '/fx/': path.resolve('.dsh/import-fixtures') } }, async ({ browser: b, origin }) => {
  const p = await b.newPage();
  await p.goto(origin + '/battle-simulator/?lang=en');
  // Pages load the OCR side only when a screenshot arrives; load it here.
  for (const src of ['/js/ocr-text.js', '/js/ocr-client.js']) await p.addScriptTag({ url: src });
  for (const name of process.argv.slice(2)) {
    const out = await p.evaluate(async n => {
      const blob = await (await fetch('/fx/' + n + '.jpg')).blob();
      const c = window.__c || (window.__c = OcrClient.create({ backend: 'wasm' }));
      const res = await c.read(blob);
      const w = res.preview && res.preview.width, h = res.preview && res.preview.height;
      return { items: res.items.map(i => ({ text: i.text, poly: i.poly.map(p => p.map(v => Math.round(v * 10) / 10)) })), w, h, rows: OcrText.rows(OcrText.boxes(res.items)).map(r => Math.round(r.cy) + ': ' + r.text) };
    }, name);
    fs.writeFileSync('.dsh/import-fixtures/' + name + '.items.json', JSON.stringify({ width: out.w, height: out.h, items: out.items }) + '\n'); console.log('== ' + name, out.w + 'x' + out.h); console.log(out.rows.join('\n'));
  }
}).catch(e => { console.error(e); process.exitCode = 1; });
