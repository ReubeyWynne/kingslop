import { Writer, Reader, fail } from './core.mjs';
const HALF = 0x80000000, QUARTER = 0x40000000, FULL = 0x100000000;
class Encoder {
  constructor() { this.low = 0; this.high = FULL - 1; this.pending = 0; this.w = new Writer(); }
  bit(b) { this.w.bit(b); while (this.pending) { this.w.bit(1 - b); this.pending--; } }
  symbol(lo, hi, total) {
    const range = this.high - this.low + 1;
    this.high = this.low + Math.floor(range * hi / total) - 1; this.low += Math.floor(range * lo / total);
    for (;;) {
      if (this.high < HALF) this.bit(0);
      else if (this.low >= HALF) { this.bit(1); this.low -= HALF; this.high -= HALF; }
      else if (this.low >= QUARTER && this.high < 3 * QUARTER) { this.pending++; this.low -= QUARTER; this.high -= QUARTER; }
      else break;
      this.low *= 2; this.high = this.high * 2 + 1;
    }
  }
  end() { this.pending++; this.bit(this.low < QUARTER ? 0 : 1); return this.w.end(); }
}
class Decoder {
  constructor(a) { this.low = 0; this.high = FULL - 1; this.a = a; this.p = 0; this.code = 0; for (let i = 0; i < 32; i++) this.code = this.code * 2 + this.bit(); }
  bit() { if (this.p > this.a.length * 8 + 32) fail(); const v = this.p < this.a.length * 8 ? (this.a[this.p >> 3] >> (7 - (this.p & 7))) & 1 : 0; this.p++; return v; }
  target(total) { return Math.floor(((this.code - this.low + 1) * total - 1) / (this.high - this.low + 1)); }
  symbol(lo, hi, total) {
    const range = this.high - this.low + 1;
    this.high = this.low + Math.floor(range * hi / total) - 1; this.low += Math.floor(range * lo / total);
    for (;;) {
      if (this.high < HALF) {}
      else if (this.low >= HALF) { this.code -= HALF; this.low -= HALF; this.high -= HALF; }
      else if (this.low >= QUARTER && this.high < 3 * QUARTER) { this.code -= QUARTER; this.low -= QUARTER; this.high -= QUARTER; }
      else break;
      this.low *= 2; this.high = this.high * 2 + 1; this.code = this.code * 2 + this.bit();
    }
  }
}
function model(models, context, alphabet) {
  if (!models.has(context)) models.set(context, { counts: new Uint16Array(alphabet).fill(1), total: alphabet });
  return models.get(context);
}
function update(m, s) {
  m.counts[s] += 4; m.total += 4;
  if (m.total >= 4096) { m.total = 0; for (let i = 0; i < m.counts.length; i++) { m.counts[i] = (m.counts[i] + 1) >> 1; m.total += m.counts[i]; } }
}
function codeSymbol(coder, m, value, decode) {
  let lo = 0, s = value;
  if (decode) { const target = coder.target(m.total); s = 0; while (s < m.counts.length && lo + m.counts[s] <= target) lo += m.counts[s++]; if (s >= m.counts.length) fail(); }
  else for (let i = 0; i < s; i++) lo += m.counts[i];
  coder.symbol(lo, lo + m.counts[s], m.total); update(m, s); return s;
}
function process(cells, alphabet, mode, coder, decode) {
  const out = new Uint16Array(3600), models = new Map();
  if (mode < 2) {
    for (let p = 0; p < 3600; p++) {
      const x = p % 60, left = x ? out[p - 1] : 0, up = p >= 60 ? out[p - 60] : 0, diagonal = x && p >= 60 ? out[p - 61] : 0;
      let context, order;
      if (!mode) context = left * alphabet + up;
      else { context = +(left === up) | (+(left === diagonal) << 1) | (+(left === 0) << 2) | (+(up === 0) << 3) | (+(diagonal === 0) << 4); order = [...new Set([left, up, diagonal, 0])]; for (let s = 0; s < alphabet; s++) if (!order.includes(s)) order.push(s); }
      const m = model(models, context, alphabet), s = codeSymbol(coder, m, decode ? 0 : mode ? order.indexOf(cells[p]) : cells[p], decode);
      out[p] = mode ? order[s] : s;
    }
  } else {
    const bits = Math.ceil(Math.log2(alphabet));
    for (let plane = bits - 1; plane >= 0; plane--) {
      const mask = new Uint8Array(3600);
      for (let p = 0; p < 3600; p++) {
        const x = p % 60, context = (x ? mask[p - 1] : 0) | ((p >= 60 ? mask[p - 60] : 0) << 1) | ((x && p >= 60 ? mask[p - 61] : 0) << 2) | ((x < 59 && p >= 60 ? mask[p - 59] : 0) << 3) | (((out[p] >> (plane + 1)) & 1) << 4) | (plane << 5);
        mask[p] = codeSymbol(coder, model(models, context, 2), decode ? 0 : (cells[p] >> plane) & 1, decode); out[p] |= mask[p] << plane;
      }
    }
    if (out.some(s => s >= alphabet)) fail();
  }
  return out;
}
export function arithmeticEncode(cells, alphabet, mode) { const c = new Encoder(); process(cells, alphabet, mode, c, false); return c.end(); }
export function arithmeticDecode(a, alphabet, mode) {
  const out = process(null, alphabet, mode, new Decoder(a), true), check = arithmeticEncode(out, alphabet, mode);
  if (check.length !== a.length || check.some((b, i) => b !== a[i])) fail(); return out;
}
