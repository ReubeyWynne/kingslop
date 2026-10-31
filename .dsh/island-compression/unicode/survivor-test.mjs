import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { encodeTransport, decodeTransport, decodeFragment, PROFILES, MAX_BYTES } from './survivor-transport-v1.mjs';
const dir = new URL('.', import.meta.url), evidence = JSON.parse(fs.readFileSync(new URL('survivor-evidence.json', dir))), prior = JSON.parse(fs.readFileSync(new URL('../results.json', dir)));
test('The evidence pool excludes prefixes, unknown suffixes and all observed failures', () => {
  assert.equal(evidence.observedSurvivors, 919); assert.equal(new Set(evidence.alphabet919).size, 919); assert.equal(evidence.alphabet867.length, 867); assert.equal(evidence.alphabet512.length, 512); assert.deepEqual(evidence.conflictingCharacters, []);
  for (const item of evidence.evidence) { assert(item.unchangedObservations > 0); assert.equal(item.failedObservations, 0); assert(item.occurrences.some(r => r.unchanged)); }
  const failed = JSON.parse(fs.readFileSync(new URL('game-failure.json', dir))).observedChanges.flatMap(r => r.originalStart < 474 ? [...r.original] : []);
  const second = JSON.parse(fs.readFileSync(new URL('blacklist-v1-game-return-analysis.json', dir))).changes.flatMap(r => [...r.original]);
  for (const c of [...failed, ...second]) assert(!evidence.alphabet919.includes(c));
});
test('The module reuses the reference grammar and raises its bound for smaller radices', () => {
  const expected = fs.readFileSync(new URL('transport.mjs', dir), 'utf8').replace("'./alphabets-v1.mjs'", "'./survivor-alphabets-v1.mjs'").replace('MAX_UNITS = 40000', 'MAX_UNITS = 60000'); assert.equal(fs.readFileSync(new URL('survivor-transport-v1.mjs', dir), 'utf8'), expected);
  for (const name of ['survivors512', 'survivors867', 'survivors919']) {
    const p = PROFILES[name], chars = p.ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCharCode(a + i)));
    assert.equal(chars.length, p.size); assert(chars.every(c => evidence.alphabet919.includes(c)));
    if (name !== 'survivors919') assert(chars.every(c => /[\p{L}\p{N}]/u.test(c)));
  }
});
test('All three alphabets preserve every corpus layout and both URL routes', () => {
  for (const f of prior.reference.filter(f => !f.nativeCompression)) for (const name of ['survivors512-ic1', 'survivors867-ic1', 'survivors919-ic1']) {
    const bytes = Uint8Array.from(Buffer.from(f.payload, 'base64url')), payload = encodeTransport(bytes, name); assert.deepEqual(decodeTransport(payload), bytes);
    for (const prefix of ['dey.ci#', 'dey.ci/island#']) assert.deepEqual(decodeFragment(new URL('https://' + prefix + payload).hash), bytes);
    assert.equal(payload.normalize('NFC'), payload); assert.equal(payload.normalize('NFKC'), payload);
  }
});
test('Fixed-width framing preserves leading zeros and its full binary size bound', () => {
  for (const n of [0, 1, 8, 9, 128, 931, 976, MAX_BYTES]) { const bytes = new Uint8Array(n); if (n) bytes[n - 1] = 255; assert.deepEqual(decodeTransport(encodeTransport(bytes, 'survivors512')), bytes); }
  assert.throws(() => encodeTransport(new Uint8Array(MAX_BYTES + 1), 'survivors512'));
});
