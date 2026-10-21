// Records what the production OCR worker reads from fixture screenshots, for
// the node adapter checks. Build the site first, then:
//   node .dsh/import-record.cjs overview-resources other-a1 ...
// writes .dsh/import-fixtures/<name>.items.json and prints the rows.
const fs = require('fs'), path = require('path'), http = require('http');
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
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('http://127.0.0.1:' + server.address().port + '/battle-simulator/?lang=en');
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
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
