# Island compression: measured results

With base64url, three of the five recovered layouts fit the 512-unit chat budget losslessly. The best tested URLs are **118, 1,334, 1,316, 406 and 436 characters** for layouts 8900–8904. The same results are achievable with the dependency-free, deterministic JavaScript reference. Arbitrary complete islands cannot be guaranteed to fit 373 bytes. The editor must retain a full-fidelity export path for larger designs.

The [Unicode follow-up](ISLAND-UNICODE-TRANSPORT.md) revises the transport assumption: four fit the original route with a normalisation-stable alphabet; all five fit the proposed short root route. Kingshot preservation of those characters still needs an in-game copy-back test.

This work implements compression experiments, a reference encoder/decoder, a worker module and tests. It changes no editor code and no files under `docs/research/islands/`. Published 30 October 2026 on `islands`.

## Reproduce and inspect

From the repository root, using Node 24 with Zstandard support:

```sh
node --test .dsh/island-compression/test.mjs
node .dsh/island-compression/benchmark.mjs
node .dsh/island-compression/memory.mjs
node .dsh/island-compression/generate-comparison.mjs
python3 .dsh/island-compression/generate-report.py
```

A full benchmark run replaces its output. `benchmark.mjs --append` measures only fixtures not already present, which was used for the final cap-respecting held-out case. `ISLAND_BENCH_ROUNDS` changes the number of repetitions. Tests and benchmark tools have no npm dependencies. The Node compressor adapters require Node 24; the default browser codec does not.

- [Complete comparison](../.dsh/island-compression/COMPARISON.md): all 126 codec/compressor pairs ranked, with raw body sizes and complete byte/URL sizes for every fixture, plus memory measurements.
- [Machine-readable results](../.dsh/island-compression/results.json) and [CSV](../.dsh/island-compression/results.csv): every size, compression ratio, timing range and round-trip result.
- [Binary format](../.dsh/island-compression/FORMAT.md): complete IC/1 field assignments and decoding rules.
- [Reference API](../.dsh/island-compression/browser.mjs), [worker](../.dsh/island-compression/codec-worker.mjs) and [tests](../.dsh/island-compression/test.mjs).

## Inputs and scope

Read the [engineering proposal](ISLAND-EDITOR-ENGINEERING.md), source catalogue, all five map records, and the research agent's mechanics, status and UX notes before implementing. Checked the newer upstream mechanics/status notes during the session and preserved the subsequent research/asset handoff and source-limit warnings. Source layout SHA-256 is `0e6fa0825aaccce21cef28f7bac324f3b34d47ee0133e228e725cb82effb0a09`. The benchmark records the source hash; a changed snapshot must be reviewed before comparing runs.

The common canonical representation stores a board byte and two independent layers. Each record contains its row-major position, catalogue ID, orientation and variant. It preserves every explicit source piece and surface, including surfaces under structures. It accepts unknown numeric IDs, nonzero directions and nonzero 16-bit variants. Duplicate anchors in a layer are invalid. Footprint collision rules, ownership, clearing progression and acquisition limits are separate concerns. A future model with multiple objects at one anchor, mutable terrain or more variant fields will need a format extension.

The catalogue mapping is a frozen list of 104 slugs, including retired records. It is a public item dictionary, not a layout dictionary. No encoder or decoder contains a recovered layout ID, complete preset, preset delta, server lookup or seeded complete-island generator.

The recovered maps are not five independent player samples. Their names/provenance are source claims. Four include hundreds of placed one-cell decorations; this is different from hundreds of independently chosen large buildings. All recovered directions are zero and no explicit variant field was supplied, so rotation/variant stress comes from synthetic cases.

| Source | Pieces | Surfaces | Repeated arrangement and distribution |
| --- | ---: | ---: | --- |
| 8900 | 1 | 767 | One fountain and a single path family. Long shared edges, repeated rows and sparse changes make spatial prediction very effective. |
| 8901 | 1,237 | 1,655 | Ten piece symbols and three surface symbols. Garden Path 1,255; Pond 210; Meadow 190. Many irregular tree/hedge clusters. |
| 8902 | 1,319 | 1,459 | Nine piece symbols and four surface symbols. Garden Path 908; Pond 304; Paved Road 128; Meadow 119. More irregular mixtures than 8901. |
| 8903 | 249 | 763 | Lush Elegy 188 and Fir 60 plus fountain; Whispering Path 467 and Pond 296. Long coherent boundaries favour conditioned bitplanes. |
| 8904 | 332 | 799 | Lush Elegy 235 and Bush 96 plus fountain; Whispering Path 420 and Pond 379. A small local alphabet and coherent boundaries again favour bitplanes. |

The machine-readable `groups` section provides per-symbol counts, bounding boxes, run counts, exact symmetry reductions and measured adaptive position-method choices for further inspection.

### What is legitimately omitted

The source `rle:3600x255` is an empty role-binding grid, not fixed terrain or a legal-placement mask. The codec does not use it to reconstruct surfaces. No placed path, pond, hedge, tree or fountain is omitted as “default terrain”. The 3,479 separate terrain/tree rendering records do not establish a clearing-state rule. World-origin conversion, catalogue footprints and deterministic road adjacency can be fixed renderer rules; authored placements and explicit visual variants still require data.

Names, source tags, editor display settings, null seeds and empty role metadata are outside the declared visual placement value. If the product later promises to share ownership, levels, clearing progress or arbitrary source editor state, these measurements do not cover that extra state. Connection sprites derived solely from neighbours need not be stored; a user-selected visual variant does.

The research agent found three source layouts above the catalogue's 500-path limit. These experiments retain all those placements. They do not silently delete excess tiles or reinterpret source limits as a licence to omit data.

## Best measured sizes

“Best tested” means the smallest actual envelope among 18 structural modes × 7 compression choices. It is not a proof of the smallest possible encoding. “Reference” is the actual default deterministic browser-module encoder, including its generic high-alphabet latency filter. Every URL includes the 14-character prefix, the complete envelope, CRC and unpadded base64url. The limit is 512 characters, equivalent to at most 373 binary bytes. With `https://`, the budget is 367 bytes.

| Layout | Pieces / surfaces | Canonical JSON bytes | Best wire bytes | Best URL chars | Reference URL chars | Reference fits |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| kingshot-8900 | 1 / 767 | 11338 | 78 | 118 | 118 | Yes |
| kingshot-8901 | 1237 / 1655 | 39942 | 990 | 1334 | 1334 | No |
| kingshot-8902 | 1319 / 1459 | 38550 | 976 | 1316 | 1316 | No |
| kingshot-8903 | 249 / 763 | 14372 | 294 | 406 | 406 | Yes |
| kingshot-8904 | 332 / 799 | 15936 | 316 | 436 | 436 | Yes |
| empty | 0 / 0 | 37 | 14 | 33 | 34 | Yes |
| sparse-25 | 25 / 0 | 352 | 79 | 120 | 120 | Yes |
| independent-100 | 100 / 0 | 1390 | 321 | 442 | 481 | Yes |
| dense-decorations | 2091 / 0 | 28762 | 50 | 81 | 90 | Yes |
| paths-grid | 0 / 1480 | 20258 | 37 | 64 | 65 | Yes |
| borders-diagonals | 0 / 352 | 4834 | 41 | 69 | 69 | Yes |
| symmetric-garden | 1032 / 0 | 15196 | 86 | 129 | 138 | Yes |
| repeated-rows | 0 / 3600 | 49326 | 50 | 81 | 81 | Yes |
| random-binary-surface | 0 / 1817 | 24931 | 467 | 637 | 637 | No |
| random-six-surfaces | 0 / 3600 | 49947 | 1236 | 1662 | 1662 | No |
| random-dual-layers | 3600 / 3600 | 98213 | 14555 | 19421 | 27056 | No |
| heldout-meandering-paths | 0 / 575 | 7959 | 134 | 193 | 193 | Yes |
| heldout-offset-motifs | 896 / 0 | 12286 | 93 | 138 | 162 | Yes |
| heldout-irregular-districts | 287 / 3056 | 45773 | 659 | 893 | 893 | No |
| heldout-rotated-variants | 324 / 0 | 4442 | 277 | 384 | 504 | Yes |
| heldout-cap-surfaces | 0 / 1000 | 13734 | 539 | 733 | 733 | No |

Canonical JSON is a compact control representation, not the baseline from which production savings should be advertised. The complete comparison also gives raw binary body sizes; `results.csv` includes wire/JSON and wire/structural ratios. Envelope overhead can make the latter exceed 1.

## Codec ranking

These are the first 15 fixed codec/compressor pairs ranked by total wire bytes across the five recovered layouts. The complete comparison ranks all 126. A fixed pair must encode every fixture; it cannot select another pair for an individual layout. The reference selector can select another representation and compression method because the payload records the choice.

| Rank | Structural codec | Compressor | Recovered total bytes | Recovered fits | Corpus fits | Median encode ms | Median decode ms |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | context-ranks | none | 2691 | 3 / 5 | 12 / 21 | 1.60 | 2.71 |
| 2 | context-ranks | lz-block | 2709 | 3 / 5 | 12 / 21 | 1.66 | 2.47 |
| 3 | context-ranks | brotli11 | 2711 | 3 / 5 | 12 / 21 | 2.64 | 2.62 |
| 4 | context-ranks | brotli5 | 2711 | 3 / 5 | 12 / 21 | 1.64 | 2.68 |
| 5 | context-ranks | deflate-raw | 2716 | 3 / 5 | 12 / 21 | 1.64 | 2.57 |
| 6 | layer-hybrid | none | 2723 | 3 / 5 | 13 / 21 | 12.05 | 1.38 |
| 7 | layer-hybrid | lz-block | 2737 | 3 / 5 | 13 / 21 | 12.07 | 1.45 |
| 8 | context-ranks | zstd9 | 2740 | 3 / 5 | 12 / 21 | 1.66 | 2.54 |
| 9 | layer-hybrid | brotli11 | 2743 | 3 / 5 | 13 / 21 | 13.41 | 1.54 |
| 10 | layer-hybrid | brotli5 | 2743 | 3 / 5 | 13 / 21 | 12.08 | 1.54 |
| 11 | context-ranks | deflate | 2746 | 3 / 5 | 12 / 21 | 1.65 | 2.68 |
| 12 | layer-hybrid | deflate-raw | 2748 | 3 / 5 | 13 / 21 | 12.10 | 1.58 |
| 13 | layer-hybrid | zstd9 | 2772 | 3 / 5 | 13 / 21 | 12.08 | 2.34 |
| 14 | layer-hybrid | deflate | 2778 | 3 / 5 | 13 / 21 | 12.10 | 1.39 |
| 15 | context-pairs | none | 3106 | 1 / 5 | 9 / 21 | 0.70 | 1.15 |

### What worked and what failed

The first 14 structural modes cover compact fixed records, sorted delta/varints, sparse grouped occupancy, Rice codes, RLE, bitmaps, quadtrees, repeated-row dictionaries, automatic geometry, full-grid local palettes and 10 × 10 regional palettes. Deflate, raw Deflate, Brotli qualities 5 and 11, Zstandard level 9 and a small deterministic LZ block codec are compared on the same bodies. Compressor framing and the common envelope are included.

Simple geometry alone does not solve the recovered corpus. For 8900 it needs a 201-byte body, compared with 69 bytes for neighbour-conditioned bitplanes. For the dense layouts, individual small rectangles and points cost too much. A quadtree's axis-aligned boundaries often cut repeated paths into many nodes. A group bitmap needs 450 bytes **per distinct ID/orientation/variant**, so its worst case is disastrous even though it is good for one dense binary mask. Per-group adaptive selection avoids that expansion.

The geometric encoder detects filled rectangles, axis-aligned lines and both diagonals. It uses actual primitive bit costs and compares the complete result with explicit sparse/Rice/run/bitmap/row/quadtree alternatives. Borders become several line primitives. Mirrored groups are used only after exact equality checks; reflection never changes orientation or variant implicitly. Repeated rows transmit their contents and row references. This vocabulary generalises without a preset ID. A dedicated perimeter/path grammar was considered but not assigned: the current generic components already encode these families, while the remaining gaps involve irregular symbol choices.

The main gain came from three adaptive arithmetic models. They code each layer's local palette using its neighbours. Relative predictor ranks describe repetitions such as “same as the left/upper cell” across different object IDs. Conditioned bitplanes describe coherent surface and hedge boundaries. Model counts start from the same uniform state for every input and adapt only to the current payload. No corpus-trained weights or map-specific dictionary are used.

Brotli/Deflate improve many repetitive sequences, especially synthetic motifs and row dictionaries. They do not improve the five winning context-coded source bodies: those streams already contain little easy byte repetition. Brotli quality 11 is a useful size oracle, but it does not bring either dense recovered layout close to 373 bytes. Its added encoder/decoder delivery cost and runtime are therefore unjustified for this use case. Zstandard also fails to change that conclusion. No runtime WASM dependency was added or measured.

The two-layer hybrid tries different raw representations for pieces and surfaces. It correctly models their different needs but did not beat the complete-layout winner in the recovered corpus. Child framing and duplicated palette/empty-layer metadata can cancel its savings. A production revision could use direct per-layer frames if a broader corpus justifies it.

The deterministic LZ block is a useful middle ground: it captures encoded motifs and row repetitions without relying on browser compressor output stability. It helps the synthetic repeated/rotated cases, while the best recovered bodies stay uncompressed. It adds a 256 KiB hash-head table and a four-byte previous-link entry per input byte during encoding; decoding needs only its bounded output buffer and overlap copies.

| Synthetic family | Observed result and explanation |
| --- | --- |
| empty | Headers dominate. Raw beats framing a general compressor in the reference selector. |
| sparse-25 | Sorted position gaps and per-record symbols are cheaper than a grid or feature dictionary. |
| independent-100 | Independent IDs, directions and variants limit reuse. It still fits; the regular anchor spacing makes this easier than 100 random anchors. |
| dense-decorations | The repeated decoration sequence compresses well with dictionary/LZ mechanisms despite over 2,000 anchors. |
| paths-grid | A few repeated full rows encode the path network with very few bytes. |
| borders-diagonals | Actual-cost geometry selects lines/rectangles and both diagonal directions. It encodes the shape parameters, not a named pattern. |
| symmetric-garden | Exact reflected groups and repeating row/sequence structure reduce storage; symbols must match exactly before reflection is allowed. |
| repeated-rows | Repeated symbolic rows and predictor ranks generalise to a dense multicolour board. |
| random-binary-surface | Independent occupancy destroys spatial prediction. One bitmap is already 450 bytes before headers. |
| random-six-surfaces | Six irregular surface choices have high entropy even though positions and variants cost nothing. |
| random-dual-layers | This is a deliberately extreme anchor stress test with random IDs, rotations and variants, not a legal game island. Catalogue footprints and limits are not enforced. |
| heldout-meandering-paths | Neighbour-conditioned bitplanes encode connected random walks better than lists of short runs. |
| heldout-offset-motifs | The offset repeated motif is present in the payload. Generic row dictionaries plus LZ work without a motif ID. |
| heldout-irregular-districts | Neighbour prediction handles the zones, but random holes and rotated trees keep it above budget. |
| heldout-rotated-variants | Symmetry of position alone is insufficient because directions and variants differ. Encoded row reuse plus deterministic LZ narrowly fits. |
| heldout-cap-surfaces | 500 cells of each of two surface families, with all other cells empty. Random placement exceeds the budget even while respecting the recovered per-type counts. |

The first four held-out families were declared in the corpus before examining their results. The final cap-respecting case was added after freezing the codec implementations and required no codec change. They check generalisation to different constructions, but they are synthetic, reproducible tests, not independent real-player validation. There is no evidence here for what percentage of ordinary player islands would fit. Sparse plans, 100 independently labelled anchors on regular spacing, repetitive gardens and coherent paths fit; arbitrary irregular decoration does not reliably fit.

## Capacity limits

A binary 60 × 60 authored surface has 2^3600 possible states. Any lossless code that accepts all of them needs at least 3,600 bits for some state: 450 bytes before headers. A fixed dictionary or clever feature detector cannot make all such states fit a 2,984-bit envelope. Repetition makes selected layouts smaller; it cannot remove this counting limit.

The result also holds without relying on unlimited placement. For 500 Garden Path cells, 500 Paved Road cells and 2,600 empty cells, the number of arrangements is `3600! / (500! * 500! * 2600!)`. Its logarithm is about 4,057.28 bits, so at least one arrangement needs **508 bytes before headers**. Those counts match the recovered catalogue limits, though exact game terrain/availability is still unresolved. The final random fixture uses 539 bytes and a 733-character URL, reasonably close to this limit.

For 100 arbitrary distinct anchor positions with 104 independently chosen IDs and four orientations, the counting bound is about 1,524.65 bits, or 191 bytes, before framing and variants. At 200 anchors it is about 2,849.34 bits, or 357 bytes, leaving almost no envelope/metadata headroom even for an ideal entropy coder. At 300 it reaches about 4,094.49 bits, or 512 bytes. These calculations ignore footprint/ownership restrictions and are capacity examples, not predictions of legal island sizes.

Random variants or orientations cost additional entropy. Conversely, thousands of placements can fit when their arrangement is predictable. A placement-count limit would therefore be misleading. The editor should show actual encoded length and never discard objects to meet the chat cap.

## Runtime, memory and browser path

Measured on AMD EPYC 9V74 80-Core Processor, Linux x64, Node v24.22.1. Candidate timings use the median of 3 runs. Structural encoding and compression/wrapping are timed separately and their medians added. Candidate decode timing excludes the equality assertion. The reference API timing below measures the complete selection and base64 encoding; its decode timing includes the round-trip equality assertion. These are desktop/cloud measurements, not low-end Android measurements. Three samples describe this experiment; they are not a performance study.

| Layout | Reference wire bytes | Full selection + encode ms | Decode + equality ms |
| --- | ---: | ---: | ---: |
| kingshot-8900 | 78 | 17.76 | 1.59 |
| kingshot-8901 | 990 | 53.95 | 5.33 |
| kingshot-8902 | 976 | 56.50 | 4.84 |
| kingshot-8903 | 294 | 22.56 | 2.07 |
| kingshot-8904 | 316 | 22.17 | 2.32 |
| empty | 15 | 4.06 | 0.02 |
| sparse-25 | 79 | 15.14 | 0.08 |
| independent-100 | 350 | 34.07 | 0.14 |
| dense-decorations | 57 | 28.70 | 0.95 |
| paths-grid | 38 | 17.61 | 0.77 |
| borders-diagonals | 41 | 16.39 | 0.26 |
| symmetric-garden | 93 | 23.22 | 0.55 |
| repeated-rows | 50 | 45.03 | 4.31 |
| random-binary-surface | 467 | 24.10 | 0.99 |
| random-six-surfaces | 1236 | 54.09 | 5.04 |
| random-dual-layers | 20281 | 38.27 | 6.25 |
| heldout-meandering-paths | 134 | 13.06 | 1.23 |
| heldout-offset-motifs | 111 | 18.32 | 0.51 |
| heldout-irregular-districts | 659 | 55.26 | 4.68 |
| heldout-rotated-variants | 367 | 24.11 | 0.35 |
| heldout-cap-surfaces | 539 | 34.41 | 2.58 |

The high-entropy dual-layer case initially took about 1.7 seconds when every expensive group/context candidate was tried. A generic filter now skips those candidates when either layer has more than 128 distinct symbols, reducing the measured default selection to about 38 ms. It trades some compression for bounded practical search time. It contains no layout-name checks. The exhaustive candidate table still measures the skipped codecs independently and exposes their poor cases.

The default module graph is **27,838 source bytes**, or **8,119 gzip bytes** when concatenated without minification; the frozen catalogue is 1,667 bytes separately. This count includes experimental decoders and encoder code, not just a hand-pruned decoder. It is a transport-size measurement, not a published bundled asset. An editor can import these modules only on the island route. The arithmetic decoder re-encodes its output to validate termination, which adds CPU but prevents ignored malformed tails.

The core uses ES modules, typed arrays, integer-safe Number arithmetic and base64 APIs. It has no DOM dependency. The default plain/LZ path needs neither CompressionStream nor WASM. Optional native compression uses `CompressionStream('deflate')`/`DecompressionStream('deflate')`; unsupported methods are rejected, with no external service fallback. The worker reference keeps share-code search away from pointer/input processing. Encoding on every drag is unnecessary; compute it on explicit share or a debounced background task.

Node's Web CompressionStream implementation and a worker-thread bridge passed interoperability tests. A browser executable and physical Android device were not available in this environment, so actual Chromium/WebKit/Firefox execution, low-end Android latency and browser heap profiling remain validation gates. No mobile timings or frame-rate claims are inferred from these results.

Memory was measured in 50 fresh processes. Each captures encoding and decoding together with the corpus and V8. The table below shows process RSS, not codec-only allocation; the JSON also includes retained heap and external-memory deltas. Garbage collection and page allocation make small deltas noisy.

| Fixture | Codec | Baseline RSS MiB | Peak RSS MiB | Added peak MiB |
| --- | --- | ---: | ---: | ---: |
| kingshot-8901 | delta + none | 60.0 | 60.6 | 0.0 |
| kingshot-8901 | groups-bitmap + none | 58.4 | 62.4 | 3.6 |
| kingshot-8901 | context-ranks + none | 58.4 | 65.1 | 6.0 |
| kingshot-8901 | production + none | 58.0 | 72.3 | 13.6 |
| kingshot-8901 | delta + deflate | 57.8 | 59.0 | 0.8 |
| kingshot-8901 | delta + brotli11 | 58.3 | 59.9 | 1.3 |
| kingshot-8901 | delta + lz-block | 58.7 | 60.6 | 1.2 |
| random-dual-layers | delta + none | 58.3 | 64.9 | 6.3 |
| random-dual-layers | groups-bitmap + none | 58.4 | 265.4 | 206.3 |
| random-dual-layers | context-ranks + none | 58.7 | 64.3 | 5.2 |
| random-dual-layers | production + none | 58.2 | 70.9 | 12.3 |
| random-dual-layers | delta + deflate | 58.1 | 64.5 | 6.0 |
| random-dual-layers | delta + brotli11 | 57.9 | 65.6 | 7.4 |
| random-dual-layers | delta + lz-block | 58.3 | 65.5 | 6.9 |

The native compressors allocate memory outside JavaScript. Byte counts alone do not reveal those costs. The intentionally bad group-bitmap test also allocates multi-megabyte bodies; it is never selected for the high-entropy production case. No claim is made that desktop RSS predicts Android heap usage.

## Correctness and decoding rules

All 2,646 fixture/codec/compressor combinations round-trip exactly. Tests also cover 120 fixed-seed random layouts, arbitrary IDs/directions/variants, insertion-order determinism, cross-layer overlap, model bounds, duplicate anchors, malformed base64url, unsupported envelope versions, a bit flip in every byte and every truncation of the five reference source payloads, random byte inputs, recomputed-checksum malformed bodies, decompression bombs, trailing data and overlapping LZ copies. Browser API and worker-path tests use the same canonical value and independently compare reconstructed records.

IC/1 records magic, version, compression method, decoded length and CRC-32. Its body selects an explicit structural grammar, board byte, layer flags and palette/group records. Base64url is unpadded and canonical. Counts, coordinates, palettes, geometric expansion, recursive depth, output lengths and input consumption are bounded. The browser reference supports compression IDs 0, 1 and 5; Node supplies comparative IDs 2–4. Unknown catalogue IDs survive but do not magically become renderable. CRC detects accidental corruption and is not authentication.

The complete [format document](../.dsh/island-compression/FORMAT.md) specifies each bit/varint, palette order, Rice code, quadtree traversal, symmetry expansion, arithmetic update, LZ rule and tie break. The experimental import ceiling is deliberately larger than any useful share because pathological bitmap candidates need multi-megabyte frames. Production should impose a smaller import-policy ceiling, and chat paste should reject more than 498 payload characters before decoding.

## Recommendation and next experiments

Use the deterministic structural/context/LZ selector as the production starting point, behind a worker and a versioned module boundary. Keep the editor's canonical layout separate from the wire format. Keep native Deflate as an optional measured optimisation; exact native compressed-byte stability across engines is not promised. Do not ship Brotli/Zstandard/WASM solely for chat sharing: none changes the recovered-layout fit result.

Show the actual URL length and offer a lossless file export when it exceeds the chat cap. Longer external URLs can also carry the same envelope, subject to their own practical limits. Do not report a universal capacity, pick a placement-count ceiling or silently simplify a design. The result here is three recovered fits and two substantial misses, not a near-success for every layout.

The most valuable next work is a consented corpus of real player islands, followed by actual low-end Android/desktop-browser tests of the worker and decoder. Additional engineering experiments should compare direct per-layer framing, a specialised path-chain code against the arithmetic models, row-to-row transforms with byte-aligned probability models, succinct/enumerative occupancy coding near catalogue caps, palette ordering optimised for bitplanes, and Brotli-style byte modelling without a large decoder. Each must beat this report's full envelope sizes on new held-out inputs. The two dense recovered layouts need roughly a further 62% reduction to fit; reducing a few header bytes will not solve them.
