import { lzEncode, lzDecode } from './lz.mjs';
import { wrap, unwrap, verify, fromPayload, toPayload, fail } from './core.mjs';
import { encodeStructural, decodeStructural, productionModes } from './structural.mjs';
async function transform(bytes, mode, length) {
  const stream = mode === 'encode' ? new CompressionStream('deflate') : new DecompressionStream('deflate');
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader(), chunks = []; let n = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; n += value.length; if (n > length) { await reader.cancel(); fail(); } chunks.push(value); } } finally { reader.releaseLock(); }
  const out = new Uint8Array(n); let p = 0; for (const c of chunks) { out.set(c, p); p += c.length; } return out;
}
export async function encodePayload(layout, { nativeCompression = false } = {}) {
  let best;
  for (const format of productionModes(layout)) {
    const body = encodeStructural(layout, format);
    const plain = wrap(body); if (!best || plain.length < best.length) best = plain;
    const lz = wrap(body, lzEncode(body), 5); if (lz.length < best.length) best = lz;
    if (nativeCompression && typeof CompressionStream !== 'undefined') {
      const compressed = await transform(body, 'encode', 110000), wire = wrap(body, compressed, 1);
      if (wire.length < best.length) best = wire;
    }
  }
  return toPayload(best);
}
export async function decodePayload(payload) {
  const h = unwrap(fromPayload(payload)); if (h.compression > 1 && h.compression !== 5) fail();
  const body = h.compression === 5 ? lzDecode(h.compressed, h.length) : h.compression ? await transform(h.compressed, 'decode', h.length) : h.compressed;
  return decodeStructural(verify(body, h));
}
