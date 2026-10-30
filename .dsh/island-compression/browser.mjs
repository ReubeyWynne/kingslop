import { wrap, unwrap, verify, fromPayload, toPayload, fail } from './core.mjs';
import { encodeStructural, decodeStructural } from './structural.mjs';
async function transform(bytes, mode, length) {
  const stream = mode === 'encode' ? new CompressionStream('deflate') : new DecompressionStream('deflate');
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader(), chunks = []; let n = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; n += value.length; if (n > length) { await reader.cancel(); fail(); } chunks.push(value); } } finally { reader.releaseLock(); }
  const out = new Uint8Array(n); let p = 0; for (const c of chunks) { out.set(c, p); p += c.length; } return out;
}
export async function encodePayload(layout) {
  let best;
  for (const format of ['delta', 'groups-adaptive', 'grid-rle', 'grid-palette', 'grid-blocks', 'grid-rows', 'context-pairs', 'context-ranks', 'context-bitplanes']) {
    const body = encodeStructural(layout, format);
    const plain = wrap(body); if (!best || plain.length < best.length) best = plain;
    if (typeof CompressionStream !== 'undefined') {
      const compressed = await transform(body, 'encode', 110000), wire = wrap(body, compressed, 1);
      if (wire.length < best.length) best = wire;
    }
  }
  return toPayload(best);
}
export async function decodePayload(payload) {
  const h = unwrap(fromPayload(payload)); if (h.compression > 1) fail();
  const body = h.compression ? await transform(h.compressed, 'decode', h.length) : h.compressed;
  return decodeStructural(verify(body, h));
}
