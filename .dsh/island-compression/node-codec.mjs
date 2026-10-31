import { lzEncode, lzDecode } from './lz.mjs';
import * as z from 'node:zlib';
import { wrap, unwrap, verify, MAX_BODY, fail } from './core.mjs';
import { encodeStructural, decodeStructural, encodeHybrid } from './structural.mjs';
export const COMPRESSORS = ['none', 'deflate', 'brotli5', 'brotli11', 'zstd9', 'deflate-raw', 'lz-block'];
export function compress(body, name) {
  if (name === 'lz-block') return { bytes: lzEncode(body), method: 5 };
  if (name === 'none') return { bytes: body, method: 0 };
  if (name === 'deflate') return { bytes: z.deflateSync(body, { level: 9 }), method: 1 };
  if (name.startsWith('brotli')) return { bytes: z.brotliCompressSync(body, { params: { [z.constants.BROTLI_PARAM_QUALITY]: name === 'brotli11' ? 11 : 5, [z.constants.BROTLI_PARAM_SIZE_HINT]: body.length, [z.constants.BROTLI_PARAM_LGWIN]: 16 } }), method: 2 };
  if (name === 'zstd9') return { bytes: z.zstdCompressSync(body, { params: { [z.constants.ZSTD_c_compressionLevel]: 9 } }), method: 3 };
  if (name === 'deflate-raw') return { bytes: z.deflateRawSync(body, { level: 9 }), method: 4 };
  fail();
}
export function encode(layout, format, compressor) {
  const body = format === 'hybrid' ? encodeHybrid(layout) : encodeStructural(layout, format), c = compress(body, compressor);
  return wrap(body, c.bytes, c.method);
}
export function decode(wire) {
  const h = unwrap(wire), options = { maxOutputLength: Math.min(MAX_BODY, Math.max(1, h.length)), info: true };
  let body;
  if (h.compression === 5) body = lzDecode(h.compressed, h.length);
  else if (!h.compression) body = h.compressed;
  else {
    const fn = [null, z.inflateSync, z.brotliDecompressSync, z.zstdDecompressSync, z.inflateRawSync][h.compression];
    const result = fn(h.compressed, options); if (result.engine.bytesWritten !== h.compressed.length) fail(); body = result.buffer;
  }
  return decodeStructural(verify(body, h));
}
export function best(layout, browserOnly = false) {
  let best;
  for (const format of ['delta', 'groups-adaptive', 'grid-rle', 'grid-palette', 'grid-blocks', 'grid-rows', 'context-pairs', 'context-ranks', 'context-bitplanes', 'layer-hybrid']) {
    const body = encodeStructural(layout, format);
    for (const compressor of browserOnly ? ['none', 'deflate', 'lz-block'] : COMPRESSORS) {
      const c = compress(body, compressor), wire = wrap(body, c.bytes, c.method);
      if (!best || wire.length < best.wire.length) best = { format, compressor, wire };
    }
  }
  return best;
}
