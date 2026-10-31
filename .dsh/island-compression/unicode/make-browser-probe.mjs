import fs from 'node:fs';
import { crc32 } from '../core.mjs';
import { decode } from '../node-codec.mjs';
import { encodeTransport } from './transport.mjs';
import { rng } from '../corpus.mjs';
const dir = new URL('.', import.meta.url), prior = JSON.parse(fs.readFileSync(new URL('../results.json', dir)));
const fixtures = prior.reference.filter(f => !f.nativeCompression && f.layout.startsWith('kingshot')).map(f => ({ name: f.layout, payload: f.payload, canonicalCrc: crc32(new TextEncoder().encode(JSON.stringify(decode(Buffer.from(f.payload, 'base64url'))))) }));
const random = rng(940152), bytes = Uint8Array.from({ length: 931 }, () => Math.floor(random() * 256)); bytes.set([85, 84, 1]);
const checksum = crc32(bytes.subarray(0, -4)); bytes.set([checksum >>> 24, checksum >>> 16 & 255, checksum >>> 8 & 255, checksum & 255], bytes.length - 4);
const actual8901 = fixtures.find(f => f.name === 'kingshot-8901');
const rootLink = 'dey.ci#' + encodeTransport(Uint8Array.from(Buffer.from(actual8901.payload, 'base64url')), 'assigned-ic1');
if (rootLink.length !== 512) throw new Error('Expected exact-length root layout specimen');
fs.writeFileSync(new URL('layout-8901-root.txt', dir), rootLink);
const actual8902 = fixtures.find(f => f.name === 'kingshot-8902');
const actualLink = 'dey.ci/island#' + encodeTransport(Uint8Array.from(Buffer.from(actual8902.payload, 'base64url')), 'assigned-ic1');
if (actualLink.length !== 512) throw new Error('Expected exact-length complete layout specimen');
fs.writeFileSync(new URL('layout-8902.txt', dir), actualLink);
const sample = 'dey.ci/island#' + encodeTransport(bytes, 'east15');
if (sample.length !== 512) throw new Error('Expected exact-length stress sample');
fs.writeFileSync(new URL('paste-sample.txt', dir), sample);
fs.writeFileSync(new URL('paste-samples.json', dir), JSON.stringify({ stress: { profile: 'east15', url: sample, utf16Units: sample.length, codePoints: [...sample].length, bytes: bytes.length, content: 'UT/1 diagnostic bytes with CRC-32, not an island layout', crc32: checksum.toString(16).padStart(8, '0') }, recovered: fixtures.flatMap(f => ['east15', 'assigned', 'dense', 'east15-ic1', 'assigned-ic1'].map(profile => { const url = 'dey.ci/island#' + encodeTransport(Uint8Array.from(Buffer.from(f.payload, 'base64url')), profile); return { layout: f.name, profile, url, utf16Units: url.length }; })) }, null, 2) + '\n');
const module = name => fs.readFileSync(new URL(name, dir), 'utf8').replace(/^import .+;\n/gm, '').replace(/^export /gm, '');
const alphabet = fs.readFileSync(new URL('alphabets-v1.mjs', dir), 'utf8').replace(/^export default /, 'const catalogue = ');
const bundle = ['../core.mjs', '../arithmetic.mjs', '../structural.mjs', '../lz.mjs', '../browser.mjs'].map(module).join('\n') + '\n' + alphabet + '\n' + module('transport.mjs');
const probe = `
const fixtures = ${JSON.stringify(fixtures)};
const sample = ${JSON.stringify(sample)};
const check = (condition, label) => { if (!condition) throw new Error(label); };
document.querySelector('#stress').value = sample;
document.querySelector('#run').addEventListener('click', async () => {
  const report = { userAgent: navigator.userAgent, rows: [], alphabetChecks: [], failures: [] };
  try {
    for (const f of fixtures) {
      const bytes = fromPayload(f.payload), layout = await decodePayload(f.payload);
      check(crc32(new TextEncoder().encode(JSON.stringify(layout))) === f.canonicalCrc, 'Decoded canonical value differs');
      check(await encodePayload(layout) === f.payload, 'Cross-engine deterministic binary differs');
      for (const profile of ['base64url', ...Object.keys(PROFILES)]) {
        const payload = encodeTransport(bytes, profile), url = new URL('https://dey.ci/island#' + payload), decoded = decodeFragment(url.hash);
        check(decoded.length === bytes.length && decoded.every((b, i) => b === bytes[i]), 'Unicode or URL round trip differs');
        const canonical = await decodePayload(toPayload(decoded)); check(crc32(new TextEncoder().encode(JSON.stringify(canonical))) === f.canonicalCrc, 'Transport canonical value differs');
        report.rows.push({ layout: f.name, profile, units: 14 + payload.length, encodedHrefUnits: url.href.length, nfcUnchanged: payload.normalize('NFC') === payload, nfkcUnchanged: payload.normalize('NFKC') === payload, roundTrip: true });
      }
    }
    for (const [name, p] of Object.entries(PROFILES)) { const text = p.ranges.map(([a, b]) => Array.from({length:b-a+1},(_,i)=>String.fromCharCode(a+i)).join('')).join(''); report.alphabetChecks.push({profile:name, characters:text.length, nfcStable:text.normalize('NFC')===text, nfkcStable:text.normalize('NFKC')===text}); }
    report.stress = { units: sample.length, codePoints: [...sample].length, restored: decodeFragment(new URL('https://' + sample).hash).length === 931 };
  } catch (e) { report.failures.push(e.message); }
  document.querySelector('#result').textContent = JSON.stringify(report, null, 2);
  document.querySelector('#status').textContent = report.failures.length ? 'FAIL' : 'PASS: ' + report.rows.length + ' browser transport cases and five full binary re-encodes';
});
document.querySelector('#check').addEventListener('click', () => { const value = document.querySelector('#returned').value; document.querySelector('#comparison').textContent = value === sample ? 'Exact 512-unit match' : 'Mismatch: received ' + value.length + ' units'; });
`;
const html = '<!doctype html><html lang="en"><meta charset="utf-8"><title>Island Unicode transport probe</title><style>body{font:16px system-ui;max-width:1000px;margin:2rem auto;padding:1rem}textarea{display:block;width:100%;height:8rem;margin:1rem 0}button{padding:.6rem 1rem}pre{white-space:pre-wrap;word-break:break-all}</style><h1>Island Unicode transport probe</h1><p>Local diagnostic only. No game messages or external writes.</p><button id="run">Run browser tests</button><p id="status">Not run</p><label>512-unit stress sample<textarea id="stress" readonly></textarea></label><label>Chat field<textarea id="returned" maxlength="512"></textarea></label><button id="check">Check returned link</button><p id="comparison"></p><pre id="result"></pre><script type="module">'+bundle+'\n'+probe+'</script></html>';
fs.writeFileSync(new URL('browser-probe.html', dir), html);
fs.writeFileSync(new URL('browser-probe.mjs', dir), bundle + '\n' + probe);
console.log('Wrote standalone browser probe and exact 512-unit sample.');
