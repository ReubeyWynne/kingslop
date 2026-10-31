import catalogue from './survivor-alphabets-v1.mjs';
import { toPayload, fromPayload, fail, unwrap, verify, wrap } from '../core.mjs';
export const PROFILES = catalogue.profiles;
export const MAX_BYTES = 65536;
export const MAX_UNITS = 60000;
const tables = Object.fromEntries(Object.entries(PROFILES).map(([name, p]) => {
  let offset = 0;
  return [name, p.ranges.map(([start, end]) => { const row = { start, end, offset }; offset += end - start + 1; return row; })];
}));
function char(profile, value) {
  const rows = tables[profile]; let lo = 0, hi = rows.length - 1;
  while (lo <= hi) { const mid = (lo + hi) >> 1, r = rows[mid]; if (value < r.offset) hi = mid - 1; else if (value > r.offset + r.end - r.start) lo = mid + 1; else return String.fromCharCode(r.start + value - r.offset); }
  fail();
}
function digit(profile, code) {
  const rows = tables[profile]; let lo = 0, hi = rows.length - 1;
  while (lo <= hi) { const mid = (lo + hi) >> 1, r = rows[mid]; if (code < r.start) hi = mid - 1; else if (code > r.end) lo = mid + 1; else return r.offset + code - r.start; }
  fail();
}
export function encodeTransport(bytes, profile = 'east15') {
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_BYTES) fail();
  if (profile === 'base64url') return toPayload(bytes);
  const p = PROFILES[profile]; if (!p) fail();
  if (p.compactIc1) {
    let h; try { h = unwrap(bytes); if (h.compression) return encodeTransport(bytes, p.fallback); verify(h.compressed, h); } catch { return encodeTransport(bytes, p.fallback); }
    bytes = Uint8Array.from([h.crc >>> 24, h.crc >>> 16 & 255, h.crc >>> 8 & 255, h.crc & 255, ...h.compressed]);
  }
  if (p.bits) {
    const firstBits = (bytes.length * 8 + 1) % p.bits || p.bits, result = []; let accumulator = 1, available = 1, needed = firstBits;
    const flush = () => { while (available >= needed) { available -= needed; result.push(char(profile, Math.floor(accumulator / 2 ** available))); accumulator %= 2 ** available; needed = p.bits; } };
    flush(); for (const b of bytes) { accumulator = accumulator * 256 + b; available += 8; flush(); }
    if (available) fail(); return p.marker + result.join('');
  }
  let hex = '1'; for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  let value = BigInt('0x' + hex); const base = BigInt(p.size), result = [];
  while (value) { result.push(char(profile, Number(value % base))); value /= base; }
  return p.marker + result.reverse().join('');
}
export function decodeTransport(payload, { repairNfc = false } = {}) {
  if (typeof payload !== 'string' || !payload.length || payload.length > MAX_UNITS) fail();
  const entry = Object.entries(PROFILES).find(([, p]) => p.marker === payload[0]);
  if (!entry) { const bytes = fromPayload(payload); if (bytes.length > MAX_BYTES) fail(); return bytes; }
  const [name, p] = entry; if (repairNfc && name !== 'dense') payload = payload[0] + payload.slice(1).normalize('NFC');
  const text = payload.slice(1); if (!text.length) fail(); const first = digit(name, text.charCodeAt(0)); if (!first) fail();
  const finish = bytes => {
    if (!p.compactIc1) return bytes;
    if (bytes.length < 4) fail(); const body = bytes.subarray(4), wire = wrap(body);
    const expected = (bytes[0] * 2 ** 24 + bytes[1] * 2 ** 16 + bytes[2] * 256 + bytes[3]) >>> 0;
    if (unwrap(wire).crc !== expected || wire.length > MAX_BYTES) fail(); return wire;
  };
  if (p.bits) {
    const firstBits = Math.floor(Math.log2(first)) + 1, bitLength = firstBits - 1 + (text.length - 1) * p.bits;
    if (bitLength % 8 || bitLength / 8 > MAX_BYTES) fail();
    const out = new Uint8Array(bitLength / 8); let accumulator = first - 2 ** (firstBits - 1), available = firstBits - 1, cursor = 0;
    const flush = () => { while (available >= 8) { available -= 8; out[cursor++] = Math.floor(accumulator / 2 ** available); accumulator %= 2 ** available; } };
    flush(); for (let i = 1; i < text.length; i++) { accumulator = accumulator * 2 ** p.bits + digit(name, text.charCodeAt(i)); available += p.bits; flush(); }
    if (cursor !== out.length || available) fail(); return finish(out);
  }
  const base = BigInt(p.size); let value = BigInt(first);
  for (let i = 1; i < text.length; i++) value = value * base + BigInt(digit(name, text.charCodeAt(i)));
  const hex = value.toString(16); if (hex[0] !== '1' || hex.length % 2 !== 1 || (hex.length - 1) / 2 > MAX_BYTES) fail();
  return finish(Uint8Array.from({ length: (hex.length - 1) / 2 }, (_, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)));
}
export function fragmentPayload(fragment) {
  if (typeof fragment !== 'string' || fragment.length > MAX_UNITS * 9 + 1) fail();
  if (fragment.startsWith('#')) fragment = fragment.slice(1);
  try { return fragment.includes('%') ? decodeURIComponent(fragment) : fragment; } catch { fail(); }
}
export function decodeFragment(fragment, options) { return decodeTransport(fragmentPayload(fragment), options); }
