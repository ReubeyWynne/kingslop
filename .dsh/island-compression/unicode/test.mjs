import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rng } from '../corpus.mjs';
import { encodeTransport, decodeTransport, decodeFragment, PROFILES, MAX_BYTES, MAX_UNITS } from './transport.mjs';
const profiles = ['base64url', ...Object.keys(PROFILES)];
test('All lengths, leading zero bytes and random bytes round trip', () => {
  const r = rng(917028);
  for (const n of [...Array.from({ length: 256 }, (_, i) => i), 511, 512, 931, 976, 990, 2048]) {
    const bytes = Uint8Array.from({ length: n }, () => Math.floor(r() * 256)); if (n) bytes[0] = 0;
    for (const p of profiles) { if (!n && p === 'base64url') continue; const s = encodeTransport(bytes, p); assert.deepEqual(decodeTransport(s), bytes); assert.equal(encodeTransport(bytes, p), s); }
  }
});
test('Frozen alphabets are unique BMP scalars and match their declared sizes', () => {
  for (const [name, p] of Object.entries(PROFILES)) {
    const chars = p.ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCharCode(a + i)));
    assert.equal(chars.length, p.size); assert.equal(new Set(chars).size, p.size);
    for (const c of chars) { assert.equal(c.length, 1); assert(!/[\p{Cc}\p{Cf}\p{Cs}\s#%"'<>\\`]/u.test(c), name); }
    if (name !== 'dense') { const joined = chars.join(''); assert.equal(joined.normalize('NFC'), joined); assert.equal(joined.normalize('NFKC'), joined); assert.equal(joined.normalize('NFD').normalize('NFC'), joined); }
  }
});
test('Every persisted layout survives transport and URL serialisation', () => {
  const result = JSON.parse(fs.readFileSync(new URL('../results.json', import.meta.url)));
  for (const f of result.reference.filter(f => !f.nativeCompression)) {
    const bytes = Uint8Array.from(Buffer.from(f.payload, 'base64url'));
    for (const p of profiles) { const payload = encodeTransport(bytes, p), u = new URL('https://dey.ci/island#' + payload); assert.deepEqual(decodeFragment(u.hash), bytes); assert.deepEqual(decodeFragment('#' + encodeURIComponent(payload)), bytes); }
  }
});
test('Canonical decompositions can be repaired for the stable alphabets', () => {
  const bytes = Uint8Array.from({ length: 990 }, (_, i) => (i * 79) & 255);
  for (const p of ['han14', 'east15', 'assigned']) { const s = encodeTransport(bytes, p); for (const form of ['NFD', 'NFKD']) assert.deepEqual(decodeTransport(s.normalize(form), { repairNfc: true }), bytes); }
});
test('Reject invalid framing, unknown symbols, surrogates, malformed escaping and oversized values', () => {
  for (const s of ['', '!', '~', '$', '*', '!一', '~㐀', '*\u0021', '~\ud800', '~\udc00', '~😀', '~#', '~%', '%%', 'A'.repeat(MAX_UNITS + 1)]) assert.throws(() => decodeTransport(s), s);
  for (const s of ['#%', '#%GG', '#%ED%A0%80', '#%2525']) assert.throws(() => decodeFragment(s));
  assert.throws(() => encodeTransport(new Uint8Array(MAX_BYTES + 1))); assert.throws(() => encodeTransport(new Uint8Array(), 'unknown'));
  assert.throws(() => decodeTransport('~' + '䯿'.repeat(MAX_UNITS)));
});
test('Compact IC/1 frames reconstruct exactly and reject every character mutation or truncation', () => {
  const result = JSON.parse(fs.readFileSync(new URL('../results.json', import.meta.url))), fixture = result.reference.find(f => f.layout === 'kingshot-8902' && !f.nativeCompression), bytes = Uint8Array.from(Buffer.from(fixture.payload, 'base64url'));
  const payload = encodeTransport(bytes, 'assigned-ic1'); assert.equal(payload[0], '='); assert.equal(payload.length + 14, 512); assert.deepEqual(decodeTransport(payload), bytes);
  for (let i = 1; i < payload.length; i++) { const altered = payload.slice(0, i) + (payload[i] === '一' ? '丁' : '一') + payload.slice(i + 1); assert.throws(() => decodeTransport(altered)); assert.throws(() => decodeTransport(payload.slice(0, i))); }
  const corrupt = bytes.slice(); corrupt[corrupt.length - 1] ^= 1; const fallback = encodeTransport(corrupt, 'assigned-ic1'); assert.equal(fallback[0], '$'); assert.deepEqual(decodeTransport(fallback), corrupt);
});
