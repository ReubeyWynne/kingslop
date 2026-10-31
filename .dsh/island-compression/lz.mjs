import { fail, MAX_BODY } from './core.mjs';
const hash = (a, p) => Math.imul(((a[p] << 24) ^ (a[p + 1] << 16) ^ (a[p + 2] << 8) ^ a[p + 3]) >>> 0, 2654435761) >>> 16;
export function lzEncode(a) {
  const out = [], heads = new Int32Array(65536).fill(-1), prev = new Int32Array(a.length).fill(-1);
  const add = p => { if (p + 3 >= a.length) return; const h = hash(a, p); prev[p] = heads[h]; heads[h] = p; };
  const length = n => { while (n >= 255) { out.push(255); n -= 255; } out.push(n); };
  let p = 0, anchor = 0;
  while (p + 4 <= a.length) {
    let best = 0, distance = 0, q = heads[hash(a, p)], tries = 0;
    while (q >= 0 && p - q <= 65535 && tries++ < 64) {
      let n = 0; while (p + n < a.length && a[q + n] === a[p + n] && n < 65535) n++;
      if (n > best && n >= 4) { best = n; distance = p - q; } q = prev[q];
    }
    if (best < 4) { add(p++); continue; }
    const literals = p - anchor; out.push((Math.min(literals, 15) << 4) | Math.min(best - 4, 15)); if (literals >= 15) length(literals - 15);
    for (let i = anchor; i < p; i++) out.push(a[i]); out.push(distance & 255, distance >> 8); if (best >= 19) length(best - 19);
    const end = p + best; while (p < end) add(p++); anchor = p;
  }
  const literals = a.length - anchor; out.push(Math.min(literals, 15) << 4); if (literals >= 15) length(literals - 15); for (let i = anchor; i < a.length; i++) out.push(a[i]);
  return Uint8Array.from(out);
}
export function lzDecode(a, expected) {
  if (!Number.isInteger(expected) || expected < 0 || expected > MAX_BODY) fail();
  const out = new Uint8Array(expected); let p = 0, cursor = 0, terminal = false;
  const byte = () => { if (p >= a.length) fail(); return a[p++]; };
  const length = n => { if (n === 15) { let v; do { v = byte(); n += v; if (n > expected) fail(); } while (v === 255); } return n; };
  while (p < a.length) {
    const token = byte(), literals = length(token >> 4); if (p + literals > a.length || cursor + literals > expected) fail(); out.set(a.subarray(p, p + literals), cursor); p += literals; cursor += literals;
    if (p === a.length) { if (token & 15) fail(); terminal = true; break; }
    const distance = byte() | (byte() << 8), match = length(token & 15) + 4; if (!distance || distance > cursor || cursor + match > expected) fail();
    for (let i = 0; i < match; i++) { out[cursor] = out[cursor - distance]; cursor++; }
  }
  if (!terminal || cursor !== expected) fail(); return out;
}
