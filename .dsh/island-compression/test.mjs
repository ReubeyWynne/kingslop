import test from 'node:test';
import assert from 'node:assert/strict';
import * as z from 'node:zlib';
import { corpus, rng } from './corpus.mjs';
import { FORMATS, encodeStructural, decodeStructural, encodeHybrid } from './structural.mjs';
import { COMPRESSORS, encode, decode, best } from './node-codec.mjs';
import { canonical, crc32, fromPayload, toPayload, wrap, Writer, MAX_WIRE } from './core.mjs';
import { encodePayload, decodePayload } from './browser.mjs';
const fixtures = corpus();
test('Every fixture round trips through all structural and compression modes', () => {
  for (const f of fixtures) for (const mode of FORMATS) {
    const body = encodeStructural(f.layout, mode); assert.deepEqual(decodeStructural(body), f.layout, `${f.name}/${mode}`);
    for (const compressor of COMPRESSORS) assert.deepEqual(decode(encode(f.layout, mode, compressor)), f.layout, `${f.name}/${mode}/${compressor}`);
  }
});
test('Deterministic encoding ignores insertion order and preserves unknown IDs', async () => {
  for (const f of fixtures) {
    const shuffled = { ...f.layout, pieces: [...f.layout.pieces].reverse(), surfaces: [...f.layout.surfaces].reverse() };
    assert.deepEqual(encodeHybrid(f.layout), encodeHybrid(shuffled));
    const payload = await encodePayload(f.layout); assert.equal(payload, await encodePayload(shuffled)); assert.deepEqual(await decodePayload(payload), f.layout);
  }
  const layout = { board: 255, pieces: [[3599, 65535, 3, 65535], [0, 104, 0, 1]], surfaces: [[3599, 127, 2, 256]] };
  assert.deepEqual(await decodePayload(await encodePayload(layout)), canonical(layout));
});
test('Fixed-seed property corpus with arbitrary directions, variants and layers', () => {
  const random = rng(816267);
  for (let i = 0; i < 120; i++) {
    const l = { board: i % 256, pieces: [], surfaces: [] };
    for (const layer of ['pieces', 'surfaces']) {
      const used = new Set(), count = Math.floor(random() * (i % 12 ? 90 : 3600));
      for (let j = 0; j < count; j++) { let p; do { p = Math.floor(random() * 3600); } while (used.has(p)); used.add(p); l[layer].push([p, Math.floor(random() * (i % 2 ? 104 : 65536)), Math.floor(random() * 4), Math.floor(random() * (i % 3 ? 8 : 65536))]); }
    }
    const c = canonical(l);
    for (const mode of FORMATS) assert.deepEqual(decodeStructural(encodeStructural(l, mode)), c);
  }
});
test('Reject invalid model bounds, duplicates and types', () => {
  for (const record of [[3600, 0, 0, 0], [-1, 0, 0, 0], [0, 65536, 0, 0], [0, 0, 4, 0], [0, 0, 0, -1], [0, 0, 0, 1.5], [0, 0, 0], ['0', 0, 0, 0]]) assert.throws(() => encodeHybrid({ board: 0, pieces: [record], surfaces: [] }));
  assert.throws(() => canonical({ board: 0, pieces: [[0, 0, 0, 0], [0, 1, 0, 0]], surfaces: [] }));
});
test('Reject malformed base64url, unsupported versions, corruptions and truncation', async () => {
  for (const s of ['', 'A', 'AB', '+++', '___=', 'a b', '😿', 'A'.repeat(Math.ceil(MAX_WIRE * 4 / 3) + 1)]) assert.throws(() => fromPayload(s));
  const random = rng(928);
  for (let i = 0; i < 2000; i++) { const bytes = Uint8Array.from({ length: Math.floor(random() * 180) }, () => Math.floor(random() * 256)); assert.throws(() => decode(bytes)); try { decodeStructural(bytes); } catch (e) { assert(e instanceof Error); } }
  for (const f of fixtures.filter(f => f.split === 'recovered')) {
    const wire = best(f.layout, true).wire;
    for (let i = 0; i < wire.length; i++) { const corrupt = wire.slice(); corrupt[i] ^= 1; assert.throws(() => decode(corrupt)); assert.throws(() => decode(wire.slice(0, i))); }
  }
  const wire = encode(fixtures[0].layout, 'delta', 'none'); const v = wire.slice(); v[2] = 2; assert.throws(() => decode(v));
  assert.throws(() => decode(new Uint8Array(MAX_WIRE + 1)));
  const body = encodeHybrid(fixtures[0].layout), w = new Writer(); w.bytes([73, 67, 1, 0]); w.u(4000001); w.bits(crc32(body), 32); w.bytes(body); assert.throws(() => decode(w.end()));
});
test('Bounded decompression, trailing data and valid-checksum malformed bodies', async () => {
  const body = encodeHybrid(fixtures[1].layout);
  for (const compressor of COMPRESSORS.filter(c => c !== 'none')) {
    const wire = encode(fixtures[1].layout, 'groups-adaptive', compressor), extra = Uint8Array.from([...wire, 0, 1, 2]); assert.throws(() => decode(extra));
  }
  const bomb = z.deflateSync(new Uint8Array(1000000)), w = new Writer(); w.bytes([73, 67, 1, 1]); w.u(20); w.bits(0, 32); w.bytes(bomb);
  assert.throws(() => decode(w.end())); await assert.rejects(() => decodePayload(toPayload(w.end())));
  const garbage = Uint8Array.from([255, 255, 255, 255, 255]); assert.throws(() => decode(wrap(garbage)));
  const withTrailing = Uint8Array.from([...body, 0]); assert.throws(() => decode(wrap(withTrailing)));
  const r = rng(817); for (let i = 0; i < 1000; i++) { const b = body.slice(); b[Math.floor(r() * b.length)] ^= 1 << Math.floor(r() * 8); try { const d = decode(wrap(b)); canonical(d); } catch (e) { assert(e instanceof Error); } }
});
test('Web CompressionStream round trips and decodes Node zlib streams', async () => {
  for (const f of fixtures) {
    const payload = await encodePayload(f.layout, { nativeCompression: true }); assert.deepEqual(await decodePayload(payload), f.layout);
    assert.deepEqual(await decodePayload(toPayload(best(f.layout, true).wire)), f.layout);
  }
  const wire = encode(fixtures[0].layout, 'delta', 'deflate'); await assert.rejects(() => decodePayload(toPayload(Uint8Array.from([...wire, 0]))));
});
test('Deterministic LZ blocks handle overlapping matches and reject invalid references', async () => {
  const { lzEncode, lzDecode } = await import('./lz.mjs');
  for (const a of [new Uint8Array(), new Uint8Array(50000), Uint8Array.from({ length: 65540 }, (_, i) => i % 251), Uint8Array.from({ length: 9000 }, (_, i) => i * 73 % 256)]) {
    const b = lzEncode(a); assert.deepEqual(lzDecode(b, a.length), a); assert.deepEqual(lzEncode(a), b); assert.throws(() => lzDecode(Uint8Array.from([...b, 0]), a.length));
  }
  for (const a of [[0, 0, 0], [0, 1, 0], [255], [240, 255, 255]]) assert.throws(() => lzDecode(Uint8Array.from(a), 5));
});
test('Worker module encodes and decodes without DOM or Node dependencies', async () => {
  const { Worker } = await import('node:worker_threads');
  const workerUrl = new URL('codec-worker.mjs', import.meta.url).href;
  const worker = new Worker(`const {parentPort} = require('node:worker_threads'); globalThis.self = {postMessage: value => parentPort.postMessage(value)}; import(${JSON.stringify(workerUrl)}).then(() => {parentPort.on('message',data => self.onmessage({data}));parentPort.postMessage({ready:true});});`, { eval: true });
  const message = () => new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); });
  try {
    await message(); const layout = fixtures[3].layout;
    const encoded = message(); worker.postMessage({ requestId: 1, operation: 'encode', layout }); const e = await encoded; assert.equal(e.requestId, 1); assert(e.value);
    const decoded = message(); worker.postMessage({ requestId: 2, operation: 'decode', payload: e.value }); assert.deepEqual((await decoded).value, layout);
    const invalid = message(); worker.postMessage({ requestId: 3, operation: 'decode', payload: '+' }); assert((await invalid).error);
  } finally { await worker.terminate(); }
});
