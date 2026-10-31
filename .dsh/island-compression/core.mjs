export const PREFIX = 'dey.ci/island#';
export const MAX_BODY = 4000000;
export const MAX_WIRE = 4100000;
export const fail = () => { throw new Error('Invalid or unsupported island payload'); };
export class Writer {
  constructor() { this.a = []; this.byte = 0; this.used = 0; }
  bit(v) { this.byte = this.byte * 2 + v; if (++this.used === 8) { this.a.push(this.byte); this.byte = this.used = 0; } }
  bits(v, n) { for (let i = n - 1; i >= 0; i--) this.bit((v >>> i) & 1); }
  u(v) { do { const b = v % 128; v = Math.floor(v / 128); this.bits(b | (v ? 128 : 0), 8); } while (v); }
  bytes(a) { for (const b of a) this.bits(b, 8); }
  end() { return Uint8Array.from(this.used ? [...this.a, this.byte << (8 - this.used)] : this.a); }
}
export class Reader {
  constructor(a) { this.a = a; this.p = 0; }
  bits(n) { if (this.p + n > this.a.length * 8) fail(); let v = 0; while (n--) { v = v * 2 + ((this.a[this.p >> 3] >> (7 - (this.p & 7))) & 1); this.p++; } return v; }
  u(max = 65535) { let v = 0, m = 1; for (let i = 0; i < 4; i++) { const b = this.bits(8); v += (b & 127) * m; if (v > max) fail(); if (!(b & 128)) { if (i && !b) fail(); return v; } m *= 128; } fail(); }
  bytes(n) { if (!Number.isInteger(n) || n < 0 || n > MAX_BODY) fail(); return Uint8Array.from({ length: n }, () => this.bits(8)); }
  end() { if (this.a.length * 8 - this.p > 7) fail(); while (this.p < this.a.length * 8) if (this.bits(1)) fail(); }
}
export function canonical(layout) {
  if (!layout || !Number.isInteger(layout.board) || layout.board < 0 || layout.board > 255) fail();
  const layers = ['pieces', 'surfaces'].map(key => {
    if (!Array.isArray(layout[key]) || layout[key].length > 3600) fail();
    const a = layout[key].map(r => {
      if (!Array.isArray(r) || r.length !== 4 || !r.every(Number.isInteger)) fail();
      const [p, id, dir, variant] = r;
      if (p < 0 || p >= 3600 || id < 0 || id > 65535 || dir < 0 || dir > 3 || variant < 0 || variant > 65535) fail();
      return [...r];
    }).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < a.length; i++) if (a[i][0] === a[i - 1][0]) fail();
    return a;
  });
  return { board: layout.board, pieces: layers[0], surfaces: layers[1] };
}
export function crc32(a) {
  let c = 0xffffffff;
  for (const b of a) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}
export function wrap(body, compressed = body, compression = 0) {
  if (body.length > MAX_BODY || compressed.length > MAX_WIRE - 16) fail();
  const w = new Writer(); w.bytes([73, 67, 1, compression]); w.u(body.length); w.bits(crc32(body), 32); w.bytes(compressed); return w.end();
}
export function unwrap(wire) {
  if (!(wire instanceof Uint8Array) || wire.length > MAX_WIRE) fail();
  const r = new Reader(wire); if (r.bits(16) !== 0x4943 || r.bits(8) !== 1) fail();
  const compression = r.bits(8); if (compression > 5) fail();
  const length = r.u(MAX_BODY), crc = r.bits(32); const compressed = r.bytes(wire.length - r.p / 8); r.end();
  return { compression, length, crc, compressed };
}
export function verify(body, h) { if (body.length !== h.length || crc32(body) !== h.crc) fail(); return body; }
export function toPayload(a) {
  let s = ''; for (const b of a) s += String.fromCharCode(b);
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function fromPayload(s) {
  if (typeof s !== 'string' || s.length > Math.ceil(MAX_WIRE * 4 / 3) || !/^[A-Za-z0-9_-]+$/.test(s) || s.length % 4 === 1) fail();
  let a; try { a = Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0)); } catch { fail(); }
  if (toPayload(a) !== s) fail(); return a;
}
export const urlLength = a => PREFIX.length + toPayload(a).length;
