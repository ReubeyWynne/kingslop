import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { encodeTransport, decodeTransport, decodeFragment, PROFILES } from './transport.mjs';
import { decode } from '../node-codec.mjs';
const prior = JSON.parse(fs.readFileSync(new URL('../results.json', import.meta.url)));
const rows = [], rounds = 7, median = a => [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];
for (const f of prior.reference.filter(f => !f.nativeCompression)) {
  const bytes = Uint8Array.from(Buffer.from(f.payload, 'base64url')), layout = decode(bytes);
  for (const profile of ['base64url', ...Object.keys(PROFILES)]) {
    const enc = [], dec = []; let payload;
    for (let i = 0; i < rounds; i++) { const t = performance.now(); payload = encodeTransport(bytes, profile); enc.push(performance.now() - t); const d = performance.now(); assert.deepEqual(decodeTransport(payload), bytes); dec.push(performance.now() - d); }
    const rootUrl = 'dey.ci#' + payload; assert.deepEqual(decodeFragment(new URL('https://' + rootUrl).hash), bytes);
    const url = 'dey.ci/island#' + payload, full = new URL('https://' + url), fragment = full.hash;
    assert.deepEqual(decodeFragment(fragment), bytes); assert.deepEqual(decode(decodeTransport(payload)), layout);
    const normalization = Object.fromEntries(['NFC', 'NFD', 'NFKC', 'NFKD'].map(form => { const s = payload.normalize(form); let decoded = false, repaired = false; try { decoded = Buffer.from(decodeTransport(s)).equals(Buffer.from(bytes)); } catch {} try { repaired = Buffer.from(decodeTransport(s, { repairNfc: true })).equals(Buffer.from(bytes)); } catch {} return [form, { unchanged: s === payload, utf16Units: s.length, decoded, repaired }]; }));
    rows.push({ layout: f.layout, profile, wireBytes: bytes.length, payloadUnits: payload.length, urlUtf16Units: url.length, codePoints: [...url].length, utf8Bytes: Buffer.byteLength(url), serialisedHrefUnits: full.href.length, serialisedFragmentUnits: fragment.length - 1, fits: url.length <= 512, rootUtf16Units: rootUrl.length, rootFits: rootUrl.length <= 512, encodeMs: median(enc), decodeWithEqualityMs: median(dec), normalization, exactRoundTrip: true });
  }
}
const result = { environment: { node: process.version, unicode: process.versions.unicode, rounds, prefixUnits: 14, payloadUnits: 498, profileMarkerUnits: 1, newBinaryCompression: false, originalResultsSha256: crypto.createHash('sha256').update(fs.readFileSync(new URL('../results.json', import.meta.url))).digest('hex'), alphabetSha256: crypto.createHash('sha256').update(fs.readFileSync(new URL('alphabets-v1.json', import.meta.url))).digest('hex') }, profiles: PROFILES, measurements: rows };
fs.writeFileSync(new URL('results.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
const columns = ['layout', 'profile', 'wireBytes', 'payloadUnits', 'urlUtf16Units', 'codePoints', 'utf8Bytes', 'serialisedHrefUnits', 'fits', 'rootUtf16Units', 'rootFits', 'encodeMs', 'decodeWithEqualityMs', 'exactRoundTrip'];
fs.writeFileSync(new URL('results.csv', import.meta.url), columns.join(',') + '\n' + rows.map(r => columns.map(c => r[c]).join(',')).join('\n') + '\n');
for (const name of prior.layouts.filter(f => f.split === 'recovered').map(f => f.name)) console.log(name, Object.fromEntries(rows.filter(r => r.layout === name).map(r => [r.profile, r.urlUtf16Units])));
console.log(`Verified ${rows.length} transport/layout cases and their percent-encoded URL fragments.`);
