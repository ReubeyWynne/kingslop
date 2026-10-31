import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { encodeTransport, decodeTransport, decodeFragment, PROFILES } from './blacklist-transport-v1.mjs';
const dir = new URL('.', import.meta.url), analysis = JSON.parse(fs.readFileSync(new URL('blacklist-analysis.json', dir))), prior = JSON.parse(fs.readFileSync(new URL('../results.json', dir))), names = ['observed-blacklist-ic1', 'no-ideographs-ic1', 'no-ideographs-symbols-ic1', 'hangul-ic1'];
test('Study reuses the reference implementation with only its alphabet import changed', () => {
  const expected = fs.readFileSync(new URL('transport.mjs', dir), 'utf8').replace("'./alphabets-v1.mjs'", "'./blacklist-alphabets-v1.mjs'"); assert.equal(fs.readFileSync(new URL('blacklist-transport-v1.mjs', dir), 'utf8'), expected);
  assert.equal(analysis.observedBlacklist.length, 35); assert(analysis.allChangedCharactersSeenOnlyOnce); assert.deepEqual(analysis.charactersBothChangedAndUnchanged, []);
});
test('Every candidate reconstructs every original binary layout exactly', () => {
  for (const f of prior.reference.filter(f => !f.nativeCompression)) {
    const bytes = Uint8Array.from(Buffer.from(f.payload, 'base64url'));
    for (const profile of names) {
      const payload = encodeTransport(bytes, profile); assert.deepEqual(decodeTransport(payload), bytes); assert.deepEqual(decodeFragment(new URL('https://dey.ci#' + payload).hash), bytes);
      assert.equal(payload.normalize('NFC'), payload); assert.equal(payload.normalize('NFKC'), payload);
      if (profile === 'observed-blacklist-ic1') for (const c of payload.slice(1)) assert(!analysis.observedBlacklist.includes(c));
    }
  }
});
test('Generated alphabets exclude their declared character classes', () => {
  for (const [name, p] of Object.entries(PROFILES)) for (const [a, b] of p.ranges) for (let cp = a; cp <= b; cp++) {
    const c = String.fromCharCode(cp); assert(!analysis.observedBlacklist.includes(c));
    if (name.startsWith('hangul')) assert(cp >= 0xac00 && cp <= 0xd7a3);
    if (name.startsWith('no-ideographs')) assert(!/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u.test(c));
    if (name.startsWith('no-ideographs-symbols')) assert(!/\p{S}/u.test(c));
  }
});
test('New 512-unit specimen preserves the complete largest recovered layout', () => {
  const text = fs.readFileSync(new URL('blacklist-layout-8901-root.txt', dir), 'utf8'); assert.equal(text.length, 512); assert.equal(text[7], '^');
  const bytes = decodeFragment(text.slice(text.indexOf('#'))), f = prior.reference.find(f => !f.nativeCompression && f.layout === 'kingshot-8901'); assert(Buffer.from(bytes).equals(Buffer.from(f.payload, 'base64url')));
  const p = text.slice(7); for (let i = 1; i < p.length; i += 13) { const altered = p.slice(0, i) + (p[i] === '一' ? '丁' : '一') + p.slice(i + 1); assert.throws(() => decodeTransport(altered)); }
});
test('The returned blacklist-v1 game specimen also fails closed', () => {
  const original = fs.readFileSync(new URL('blacklist-layout-8901-root.txt', dir), 'utf8'), returned = fs.readFileSync(new URL('returned-blacklist-v1-game-message.txt', dir), 'utf8');
  assert.equal(original.length, 512); assert.equal(returned.length, 505); assert.notEqual(returned, original); assert.throws(() => decodeFragment(returned.slice(returned.indexOf('#'))));
});
