import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { decode } from '../node-codec.mjs';
const dir = new URL('.', import.meta.url);
if (process.argv[2] === '--verify') {
  const { decodeFragment } = await import('./blacklist-transport-v1.mjs');
  const text = fs.readFileSync(process.argv[3] ?? 0, 'utf8').trim(), bytes = decodeFragment(text.slice(text.indexOf('#'))), layout = decode(bytes);
  const prior = JSON.parse(fs.readFileSync(new URL('../results.json', dir)));
  console.log(JSON.stringify({ utf16Units: text.length, wireBytes: bytes.length, pieces: layout.pieces.length, surfaces: layout.surfaces.length, exactBinaryMatches: prior.reference.filter(f => !f.nativeCompression && Buffer.from(f.payload, 'base64url').equals(Buffer.from(bytes))).map(f => f.layout) }, null, 2));
} else {
  const { spawnSync } = await import('node:child_process');
  const generated = spawnSync('python3', [new URL('blacklist-study.py', dir).pathname], { encoding: 'utf8' }); if (generated.status) throw new Error(generated.stderr);
  const { encodeTransport, decodeTransport, decodeFragment } = await import('./blacklist-transport-v1.mjs');
  const prior = JSON.parse(fs.readFileSync(new URL('../results.json', dir))), analysis = JSON.parse(fs.readFileSync(new URL('blacklist-analysis.json', dir))), profiles = ['observed-blacklist-ic1', 'no-ideographs-ic1', 'no-ideographs-symbols-ic1', 'hangul-ic1'], measurements = [];
  for (const f of prior.reference.filter(f => !f.nativeCompression)) {
    const bytes = Uint8Array.from(Buffer.from(f.payload, 'base64url'));
    for (const profile of profiles) {
      const payload = encodeTransport(bytes, profile); assert.deepEqual(decodeTransport(payload), bytes);
      for (const prefix of ['dey.ci/island#', 'dey.ci#']) { const url = prefix + payload; assert.deepEqual(decodeFragment(new URL('https://' + url).hash), bytes); }
      if (profile === 'observed-blacklist-ic1') assert([...payload.slice(1)].every(c => !analysis.observedBlacklist.includes(c)));
      measurements.push({ layout: f.layout, profile, wireBytes: bytes.length, originalRouteUnits: 14 + payload.length, rootRouteUnits: 7 + payload.length, originalFits: 14 + payload.length <= 512, rootFits: 7 + payload.length <= 512, exactBinaryRoundTrip: true, nfcStable: payload.normalize('NFC') === payload, nfkcStable: payload.normalize('NFKC') === payload });
      if (f.layout === 'kingshot-8901' && profile === 'observed-blacklist-ic1') fs.writeFileSync(new URL('blacklist-layout-8901-root.txt', dir), 'dey.ci#' + payload);
    }
  }
  const result = { provenance: 'Offline generalisation study. No candidate has been tested through game chat. Generated transport reuses transport.mjs unchanged except for its frozen alphabet import.', sourceCodecSha256: crypto.createHash('sha256').update(fs.readFileSync(new URL('transport.mjs', dir))).digest('hex'), measurements };
  fs.writeFileSync(new URL('blacklist-results.json', dir), JSON.stringify(result, null, 2) + '\n');
  const cols = Object.keys(measurements[0]); fs.writeFileSync(new URL('blacklist-results.csv', dir), cols.join(',') + '\n' + measurements.map(r => cols.map(c => r[c]).join(',')).join('\n') + '\n');
  console.log(`Verified ${measurements.length} lossless offline candidate/layout cases.`);
  for (const n of prior.layouts.filter(f => f.split === 'recovered').map(f => f.name)) console.log(n, Object.fromEntries(measurements.filter(r => r.layout === n).map(r => [r.profile, r.rootRouteUnits])));
}
