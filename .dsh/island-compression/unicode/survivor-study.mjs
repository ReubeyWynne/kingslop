import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { decode } from '../node-codec.mjs';
const dir = new URL('.', import.meta.url);
if (process.argv[2] !== '--verify') { const r = spawnSync('python3', [new URL('survivor-study.py', dir).pathname], { encoding: 'utf8' }); if (r.status) throw new Error(r.stderr); }
const { encodeTransport, decodeTransport, decodeFragment } = await import('./survivor-transport-v1.mjs'), prior = JSON.parse(fs.readFileSync(new URL('../results.json', dir)));
if (process.argv[2] === '--verify') {
  try { const text = fs.readFileSync(process.argv[3] ?? 0, 'utf8').trim(), bytes = decodeFragment(text.slice(text.indexOf('#'))), layout = decode(bytes); console.log(JSON.stringify({ units: text.length, wireBytes: bytes.length, pieces: layout.pieces.length, surfaces: layout.surfaces.length, exactBinaryMatches: prior.reference.filter(f => !f.nativeCompression && Buffer.from(f.payload, 'base64url').equals(Buffer.from(bytes))).map(f => f.layout) }, null, 2)); } catch (e) { console.error('Invalid or changed payload: ' + e.message); process.exitCode = 1; }
} else {
  const records = [], evidence = JSON.parse(fs.readFileSync(new URL('survivor-evidence.json', dir))), allowed = new Set(evidence.alphabet919);
  for (const f of prior.reference.filter(f => !f.nativeCompression)) {
    const bytes = Uint8Array.from(Buffer.from(f.payload, 'base64url'));
    for (const profile of ['survivors512-ic1','survivors867-ic1','survivors919-ic1']) {
      const payload = encodeTransport(bytes, profile); assert.deepEqual(decodeTransport(payload), bytes); assert([...payload.slice(1)].every(c => allowed.has(c)));
      for (const prefix of ['dey.ci/island#','dey.ci#']) assert.deepEqual(decodeFragment(new URL('https://' + prefix + payload).hash), bytes);
      assert.equal(payload.normalize('NFC'), payload); assert.equal(payload.normalize('NFKC'), payload);
      records.push({ layout: f.layout, profile, originalWireBytes: bytes.length, originalRouteUnits: 14 + payload.length, rootRouteUnits: 7 + payload.length, originalFits: 14 + payload.length <= 512, rootFits: 7 + payload.length <= 512, exactBinaryRoundTrip: true });
      if (f.layout === 'kingshot-8903' && profile === 'survivors919-ic1') fs.writeFileSync(new URL('survivor919-layout-8903-root.txt', dir), 'dey.ci#' + payload);
    }
  }
  fs.writeFileSync(new URL('survivor-results.json', dir), JSON.stringify({ observedAlphabetSize: evidence.observedSurvivors, newlyEncodedGameValidation: false, measurements: records }, null, 2) + '\n');
  const cols = Object.keys(records[0]); fs.writeFileSync(new URL('survivor-results.csv', dir), cols.join(',') + '\n' + records.map(r => cols.map(c => r[c]).join(',')).join('\n') + '\n');
  console.log(`Verified ${records.length} offline survivor-alphabet layout round trips.`); console.log(records.filter(r => r.layout.startsWith('kingshot-')));
}
