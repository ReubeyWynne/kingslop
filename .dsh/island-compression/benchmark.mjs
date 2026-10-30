import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { corpus, sourceLayouts, catalogue } from './corpus.mjs';
import { FORMATS, encodeStructural, decodeStructural, groupDiagnostics } from './structural.mjs';
import { COMPRESSORS, compress, decode, best } from './node-codec.mjs';
import { encodePayload, decodePayload } from './browser.mjs';
import { wrap, PREFIX, fromPayload } from './core.mjs';
const rounds = Number(process.env.ISLAND_BENCH_ROUNDS ?? 3);
const median = a => [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];
function timed(fn) { const samples = []; let value; for (let i = 0; i < rounds; i++) { const start = performance.now(); value = fn(); samples.push(performance.now() - start); } return { value, ms: median(samples), min: Math.min(...samples), max: Math.max(...samples) }; }
const result = process.argv.includes('--append') ? JSON.parse(fs.readFileSync(new URL('results.json', import.meta.url))) : { environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0].model, rounds, timestamp: new Date().toISOString(), sourceSha256: sourceLayouts().sourceSha256, prefix: PREFIX, prefixLength: PREFIX.length, byteBudget: 373, urlBudget: 512 }, layouts: [], measurements: [], winners: [], reference: [], groups: {} };
for (const fixture of corpus().filter(f => !result.layouts.some(l => l.name === f.name))) {
  const { name, split, layout } = fixture, jsonBytes = Buffer.byteLength(JSON.stringify(layout));
  result.layouts.push({ name, split, pieces: layout.pieces.length, surfaces: layout.surfaces.length, symbols: new Set([...layout.pieces, ...layout.surfaces].map(r => r.slice(1).join(','))).size, jsonBytes });
  result.groups[name] = groupDiagnostics(layout).map(g => ({ ...g, slug: catalogue[g.symbol[0]] ?? `unknown-${g.symbol[0]}` }));
  for (const format of FORMATS) {
    const encoded = timed(() => encodeStructural(layout, format)), body = encoded.value;
    assert.deepEqual(decodeStructural(body), layout);
    for (const compressor of COMPRESSORS) {
      const c = timed(() => { const c = compress(body, compressor); return wrap(body, c.bytes, c.method); });
      const d = timed(() => decode(c.value)); assert.deepEqual(d.value, layout);
      const wire = c.value, payload = Buffer.from(wire).toString('base64url'), url = PREFIX + payload;
      result.measurements.push({ layout: name, format, compressor, rawBytes: body.length, wireBytes: wire.length, payloadChars: payload.length, urlChars: url.length, fits: url.length <= 512, ratioToJson: wire.length / jsonBytes, ratioToStructural: wire.length / body.length, structuralEncodeMs: encoded.ms, encodeMs: encoded.ms + c.ms, decodeMs: d.ms, encodeMinMs: encoded.min + c.min, encodeMaxMs: encoded.max + c.max, decodeMinMs: d.min, decodeMaxMs: d.max, roundTrip: true });
    }
  }
  const ms = result.measurements.filter(m => m.layout === name), ordered = [...ms].sort((a, b) => a.wireBytes - b.wireBytes);
  const portable = ordered.find(m => ['none', 'deflate', 'lz-block'].includes(m.compressor) && ['delta', 'groups-adaptive', 'grid-rle', 'grid-palette', 'grid-blocks', 'grid-rows', 'context-pairs', 'context-ranks', 'context-bitplanes', 'layer-hybrid'].includes(m.format));
  const oracle = ordered[0], adaptive = best(layout, true); assert.deepEqual(decode(adaptive.wire), layout);
  result.winners.push({ layout: name, best: oracle, portable, portablePayload: Buffer.from(adaptive.wire).toString('base64url') });
  for (const nativeCompression of [false, true]) {
    const times = [], decodes = []; let payload;
    for (let i = 0; i < rounds; i++) { const start = performance.now(); payload = await encodePayload(layout, { nativeCompression }); times.push(performance.now() - start); const d = performance.now(); assert.deepEqual(await decodePayload(payload), layout); decodes.push(performance.now() - d); }
    result.reference.push({ layout: name, nativeCompression, wireBytes: fromPayload(payload).length, urlChars: PREFIX.length + payload.length, fits: PREFIX.length + payload.length <= 512, encodeMs: median(times), decodeMs: median(decodes), payload });
  }
  console.log(`${name}: best ${oracle.wireBytes} B / ${oracle.urlChars} chars (${oracle.format}, ${oracle.compressor}); portable ${portable.wireBytes} B / ${portable.urlChars} chars`);
  fs.writeFileSync(new URL('results.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
}
const columns = Object.keys(result.measurements[0]);
fs.writeFileSync(new URL('results.csv', import.meta.url), columns.join(',') + '\n' + result.measurements.map(r => columns.map(k => r[k]).join(',')).join('\n') + '\n');
console.log(`Verified ${result.measurements.length} codec/layout combinations.`);
