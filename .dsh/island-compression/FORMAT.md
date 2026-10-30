# Experimental format IC/1

This is a complete, executable experimental format, not a commitment to shipping every experimental mode. Decoder behaviour is implemented in the adjacent ES modules. Do not change an assigned ID or reinterpret an existing field after publication; use a new version for incompatible changes.

## Canonical value

`{ board, pieces, surfaces }`, with one byte of board variant and two independent arrays. Every record is `[position, catalogueId, orientation, variant]`. Positions are integers 0–3599, with column `position % 60` and row `floor(position / 60)`. IDs and variants are integers 0–65535; orientation is 0–3. Records are sorted by position, and duplicate anchors within a layer are rejected. Cross-layer overlap is preserved. Identity, insertion order and object property order have no wire meaning.

The catalogue namespace for IC/1 is the zero-based array in `catalogue-v1.json`, alphabetically sorted once at creation. Freeze that array. Future IDs must be explicitly allocated without reassigning old entries. Numeric IDs unknown to a renderer are retained by the codec. Board 0 means the common 60 × 60 coordinate domain, not a verified cactus-free terrain definition. The codec preserves other board bytes without inventing their terrain.

## Envelope

| Field | Encoding |
| --- | --- |
| Magic | bytes `49 43` in hexadecimal (`IC`) |
| Version | byte `01`, implicitly selecting catalogue namespace v1 |
| Compression | byte: 0 plain, 1 zlib-wrapped Deflate, 2 Brotli, 3 Zstandard, 4 raw Deflate, 5 deterministic LZ block |
| Body length | unsigned base-128 varint, maximum 4,000,000 |
| Body checksum | CRC-32/ISO-HDLC, polynomial `0xedb88320`, initial/final XOR `0xffffffff`, big-endian four bytes |
| Encoded body | remaining bytes, consumed completely by the selected decoder |

Modes 2–4 are comparative Node adapters. The browser reference accepts 0, 1 and 5. A decoder without a supported compression method rejects it explicitly. There is no implicit catalogue fetch, preset ID, seeded layout generator or network dependency.

An unsigned varint stores seven low-order bits per byte, least-significant group first, with the high bit indicating continuation. Reject redundant leading zero groups, more than four bytes, truncation or a value above the field's limit. Unless otherwise specified, bit fields are written most-significant bit first. Varint bytes may start at an unaligned bit offset. Only the final byte of a structural body or separately framed position stream has zero padding; reject nonzero padding and unused whole bytes.

The envelope costs 9–12 bytes. The chat limit applies to the complete envelope. Encode it using unpadded, canonical ASCII base64url; reject padding, other characters, impossible lengths and nonzero unused base64 bits. Add the 14-character `dey.ci/island#` prefix outside the binary format.

## Structural body

Begin with format ID and board byte, both varints. Formats 0–16 then contain the pieces layer and the surfaces layer. Each layer begins with a flags varint: bit 0 means that orientation fields exist, and bit 1 means that variant fields exist. Omitted values are zero. No other flag bits are allowed.

| ID | Name | Layer encoding |
| ---: | --- | --- |
| 0 | fixed | Record count, then 12-bit position and 7-bit catalogue ID. ID 127 escapes to a varint ID of at least 127. Follow with optional 2-bit orientation and variant varint. |
| 1 | delta | Record count, then varint gap from previous position plus one, starting with previous position −1; each record then stores its symbol. |
| 2 | groups-sparse | Symbol groups using position method 0. |
| 3 | groups-rice | Symbol groups using position method 1. |
| 4 | groups-rle | Symbol groups using position method 2. |
| 5 | groups-bitmap | Symbol groups using position method 3. |
| 6 | groups-quadtree | Symbol groups using position method 4. |
| 7 | groups-rows | Symbol groups using position method 5. |
| 8 | groups-geometry | Symbol groups using position method 6. |
| 9 | groups-adaptive | For each symbol group, choose the smallest framed position stream, including exact horizontal/vertical symmetry alternatives. |
| 10 | grid-rle | Local symbol palette and RLE of the full row-major symbol grid. |
| 11 | grid-palette | Local palette and fixed-width symbol indices for all 3,600 cells. |
| 12 | grid-blocks | Local palette, then 36 blocks of 10 × 10 cells, each with a smaller palette. |
| 13 | grid-rows | Local palette, dictionary of complete 60-cell rows and 60 dictionary indices. |
| 14 | context-pairs | Arithmetic-coded symbols conditioned on the already decoded left and upper symbols. |
| 15 | context-ranks | Arithmetic-coded predictor ranks conditioned on neighbourhood equality/emptiness. |
| 16 | context-bitplanes | Arithmetic-coded binary palette planes conditioned on nearby bits and the preceding plane. |
| 17 | layer-hybrid | Special framing described below. |

A symbol is an ID varint followed by a 2-bit orientation when enabled and a variant varint when enabled. Symbol groups and palettes are sorted lexicographically by ID, orientation, then variant. Groups never merge different orientations or variants.

A grouped layer stores its group count. Each group stores its symbol, method/symmetry code varint, representative count, byte length and that many bytes of position stream. The low three code bits select position method 0–6; bit 3 enables reflection across column 29.5; bit 4 enables reflection across row 29.5. Reconstruct reflected copies with `x -> 59-x` and `y -> 59-y`, deduplicate within that reflection expansion, and validate the combined layer. The encoder only selects reflection when exact expansion equals the original group, including its symbol.

| Position method | Decoding rule |
| ---: | --- |
| 0 | Read one gap varint per representative, with previous position initially −1. |
| 1 | Read a 4-bit Rice parameter `k`, 0–11. For each gap, count zero bits until a one, then read `k` remainder bits. Gap = quotient × 2^k + remainder. |
| 2 | Read run count. Each run stores gap after previous run end and positive length, both varints. Row boundaries are ordinary adjacent indices. |
| 3 | Read 3,600 bits in row-major order. One means present. |
| 4 | Decode a padded 64 × 64 quadtree. Token `0` is empty, `10` is full, `11` splits into top-left, top-right, bottom-left, bottom-right. A full node crossing the 60 × 60 extent is invalid. A unit node cannot split. |
| 5 | Read a dictionary count, 1–60. Each dictionary row stores a cell count and increasing 6-bit column indices. Read 60 dictionary indices with `ceil(log2(dictionaryCount))` bits each. |
| 6 | Read primitive count. Each primitive stores a 2-bit opcode and 12-bit start. Opcode 0 is a point. Opcode 1 adds 6-bit width−1 and height−1. Opcodes 2 and 3 add a 6-bit length−1 for diagonals with grid steps `(1,1)` and `(−1,1)`. Reject out-of-range coordinates and overlapping expanded points. |

Geometry construction is greedy and deterministic. Replace points only when actual bit savings are positive: a point costs 14 bits, a rectangle costs 26 bits, and a diagonal costs 20 bits. Compare complete framed bytes against all other group methods before selecting it. Borders are represented by their line/rectangle components. Axis paths become runs; arbitrary paths use points or entropy coding. A dedicated perimeter or path opcode has not been assigned.

A grid palette stores its size and symbols; index zero is empty and palette entry `i` has grid index `i+1`. Index width is `ceil(log2(paletteSize+1))`. RLE stores run count followed by symbol index and positive run length. Blocks store local palette size, global indices using the global index width, then 100 local indices. Row dictionaries store row count, 60 global indices per dictionary row, then 60 row references. Reject palette indices outside their declared ranges.

Arithmetic modes store a byte length and a framed stream after their palette. If the palette has more than 63 entries, length zero selects a fixed-width palette grid instead. For at most 63 entries, even empty grids use a nonempty stream. The arithmetic alphabet includes the empty symbol. Exactly 3,600 symbols, or `3600 * ceil(log2(alphabetSize))` binary observations, are decoded.

The arithmetic coder uses a 32-bit inclusive interval, initially `[0, 2^32-1]`, with integer subdivisions computed through exact JavaScript Number arithmetic. Products stay below 2^53. Renormalisation uses the standard half/quarter interval cases. Missing terminal look-ahead bits are zero, limited to 32 bits. Every context starts with count 1 for each possible symbol. Add 4 to the observed count; when total reaches 4,096, replace every count with `ceil(count/2)`. The termination bit and pending complements are specified by `Encoder.end()` in `arithmetic.mjs`. The decoder re-encodes its result and requires byte equality to reject invalid termination and ignored trailing arithmetic data.

For mode 14, context is `left * alphabetSize + upper`, using zero beyond the board edge. Mode 15 constructs the ordered unique predictors `[left, upper, upperLeft, 0]`, then appends remaining symbols in numeric order. It codes the selected symbol's rank. The five context bits are left==upper, left==upperLeft, left==0, upper==0 and upperLeft==0. Mode 16 processes palette bitplanes high to low. Its context bits are left, upper, upper-left and upper-right bits in the current plane, the same cell's next-higher bit, and the plane index shifted left five bits. See the executable reference for exact edge handling.

Format 17 stores two length-prefixed complete child structural bodies, one per original layer, without the ordinary layer flags at its root. Each child has board 0, places its records in the pieces layer and has no surfaces. Child format 17 is forbidden, so recursion depth is at most one. Child length is at most 100,000 bytes. The encoder tries the production modes except format 17 for each child and selects the smallest raw child. The root still competes with all whole-layout modes, including compression overhead.

## Deterministic LZ block

Compression method 5 is a small LZ4-style block grammar, implemented here without claiming interchangeability with standard LZ4 framing. Tokens have a literal-length nibble followed by a match-length-minus-four nibble. Length 15 extends by bytes, adding each byte and continuing while it is 255. Copy the literal bytes, then read a nonzero little-endian 16-bit backward offset and the match extension. Matches may overlap. The terminal token ends immediately after its literals and must have match nibble zero. Require a terminal token, exact output length and complete input consumption.

The encoder hashes four-byte sequences into 65,536 heads, searches at most 64 preceding hash-chain candidates within distance 65,535, and greedily selects the longest match of at least four bytes and at most 65,535 bytes. Earlier chain traversal wins equal lengths. It inserts every consumed position into the chain and emits a final literal token, including an empty one after a terminal match. These rules define deterministic output.

## Selection and robustness

`browser.mjs:encodePayload` tries production structural modes in their declared order. For each body, it compares plain and deterministic LZ envelopes and replaces the winner only on a strict byte reduction. The default encoder therefore produces identical bytes for the same canonical input. More than 128 distinct symbols in either layer skips expensive grouped/context candidates and the nested layer search. This is a generic latency trade-off, not a hard-coded layout test.

Optional `{ nativeCompression: true }` also compares CompressionStream Deflate. Valid streams are portable, but exact compressed bytes across browser implementations are not promised. The default decoder supports these streams. The catalogue, arithmetic model and LZ rules require no browser compression API.

Reject malformed syntax, unknown envelope versions/compression modes, oversized wire data, oversized declared bodies, truncated input, invalid padding, count overflow, invalid coordinates, duplicate anchors, invalid references, unsupported nested hybrids, checksum mismatch and decompression beyond the declared bound. The public browser API caps base64 input before allocating the byte buffer. Node adapters cap native decompression output and check consumed input. Web decompression cancels when emitted bytes exceed the declared bound; an engine may allocate an internal output chunk before that cancellation.

CRC is accidental corruption detection, not authentication. Resource limits bound input and loops; they are not proof against every engine bug or denial-of-service input. The maximum experimental envelope is 4,100,000 bytes because deliberately bad group-bitmap experiments need up to about 3.3 MB. Production imports should impose a substantially smaller policy limit; chat-only paste accepts at most 498 payload characters. A 7,200-anchor layout never needs the multi-megabyte experimental representation when the production selector is used.
