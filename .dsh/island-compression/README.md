# Island compression experiments

[Read the report](../../docs/ISLAND-COMPRESSION.md), [complete measurements](COMPARISON.md) and [IC/1 format](FORMAT.md).

This directory is isolated from the application and the research agent's files. It contains 18 structural encodings, seven compression choices, 21 benchmark layouts, a browser-native reference and automated tests. No npm install is needed. Comparative native compressors require Node 24 with Zstandard support.

```sh
node --test .dsh/island-compression/test.mjs
node .dsh/island-compression/benchmark.mjs
node .dsh/island-compression/memory.mjs
node .dsh/island-compression/generate-comparison.mjs
python3 .dsh/island-compression/generate-report.py
```

`results.json` records every measurement and the source snapshot hash. `results.csv` and `COMPARISON.md` contain all sizes, final URL lengths and candidate timings. `memory-results.json` records 50 isolated process measurements. `test.log` records the final test run. Benchmark timing uses three repetitions by default; set `ISLAND_BENCH_ROUNDS` to change that. The final cap-respecting held-out case was measured with `benchmark.mjs --append` after freezing the codec; a fresh full run measures all 21 cases together.

## Reference API

```js
import { encodePayload, decodePayload } from './browser.mjs';

const layout = {
  board: 0,
  pieces: [[1647, 0, 0, 0]],
  surfaces: [[1098, 1, 0, 0]]
};

const payload = await encodePayload(layout);
const url = `dey.ci/island#${payload}`;
const reconstructed = await decodePayload(payload);
```

The sample numeric IDs illustrate the wire API; use the frozen `catalogue-v1.json` mapping for actual object choices. Records are `[position, catalogueId, orientation, variant]`; positions are `row * 60 + column`. Preserve the mapping's indices. Unknown numeric IDs survive encoding, but a renderer needs a compatible catalogue to display them.

The default encoder uses deterministic plain JavaScript with no DOM, compression API or network dependency. `{ nativeCompression: true }` also tries native Deflate when available, with no promise of identical compressed bytes across browser engines. `codec-worker.mjs` exposes encode/decode through `{ requestId, operation, layout, payload, nativeCompression }` messages. It replies with `{ requestId, value }` or `{ requestId, error }`.

Browser modules are `core.mjs`, `structural.mjs`, `arithmetic.mjs`, `lz.mjs`, `browser.mjs` and optionally `codec-worker.mjs`. The Node adapters and corpus loader are benchmark tools. Web APIs were tested through Node; real browsers and low-end Android remain explicit validation gates. The benchmark does not claim mobile performance.

The canonical model supports one anchor per layer per cell, independent overlapping piece/surface layers, four directions and 16-bit variants. It covers the complete recovered visual placement data. Ownership, clearing progression, editor metadata and unknown future model fields are outside this value. The source role-binding grid is not authored terrain. No explicit placement is reconstructed through a preset or omitted as a default.
