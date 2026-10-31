# Unicode transport v1

This transport wraps the original IC/1 bytes. It changes neither the layout model nor the catalogue. Alphabet markers and ranges are immutable once assigned. `alphabets-v1.mjs` is the browser runtime form of `alphabets-v1.json`; both freeze the same explicit ranges.

| Marker | Profile | Encoding |
| --- | --- | --- |
| none | base64url | Original unpadded IC/1 base64url; its valid envelopes begin with `SUMB`. |
| `!` | han14 | 14-bit CJK alphabet, 16,384 symbols. |
| `~` | east15 | 15-bit CJK/Hangul alphabet, 32,768 symbols. |
| `$` | assigned | Radix 50,864, assigned NFC/NFKC-stable letters, numbers, punctuation and symbols. |
| `*` | dense | Radix 63,319. Diagnostic only; normalisation-sensitive and includes private-use/unassigned characters. |
| `:` | east15-ic1 | east15 with compact uncompressed IC/1 framing. |
| `=` | assigned-ic1 | assigned with compact uncompressed IC/1 framing. |

A digit maps to the code point at its zero-based position in the alphabet ranges, in increasing code-point order. Every symbol is one BMP scalar and one UTF-16 unit. No alphabet contains percent, whitespace, controls, format characters, surrogates or the selected forbidden URL delimiters. The assigned alphabets also omit combining marks, conjoining jamo, private-use and unassigned characters. The dense profile intentionally does not make those last guarantees.

Treat input bytes as a big-endian integer and prepend a single high sentinel bit. The result for `n` bytes is `2^(8n) + byteValue`. Express this integer as the shortest big-endian digit sequence in the profile's radix, then prepend the one-unit marker. An empty byte array is sentinel value one. A leading zero digit is forbidden.

The 14/15-bit implementations perform the same conversion with a bounded Number accumulator. Their first digit uses `(8*n+1) mod k` bits, taking `k` when the remainder is zero; subsequent digits use `k`. There is no terminal padding. The other profiles use native BigInt division/multiplication.

Decode the shortest nonzero digit sequence to an integer. Its bit length must be one modulo eight. Remove the leading sentinel, retain every remaining byte including leading zero bytes, and reject oversized values. In the power-of-two path this is checked from the first digit's bit length; in the BigInt path the hexadecimal representation must be `1` followed by an even number of hex digits. Unknown symbols and malformed framing are errors. Imports are limited to 40,000 text units and 65,536 decoded bytes before any IC/1 decompression limits apply.

## Compact IC/1

For `:` and `=`, only a canonical IC/1 envelope with compression method zero and a valid checksum is eligible. Its transmitted bytes are the original four-byte big-endian CRC-32 followed by the entire uncompressed structural body. The alphabet and sentinel conversion then operate on that byte array.

Decode reconstructs IC/1 magic `49 43`, version `01`, compression `00`, canonical body-length varint, original checksum and complete body. The body length is transmitted implicitly through the sentinel-framed byte count. Check the checksum before returning the reconstructed envelope, and enforce the final byte limit. The result must equal the original wire bytes, not just decode to a similar layout.

Encoding a non-eligible envelope, a compressed IC/1 envelope or arbitrary bytes falls back to `~` for requested `east15-ic1` and `$` for requested `assigned-ic1`. The actual marker always identifies the actual grammar. The decoder does not guess or look up a layout.

## URLs and normalisation

The normal share prefix is `dey.ci/island#` (14 UTF-16 units). The optional short prefix is `dey.ci#` (seven). Neither prefix belongs to the encoded digit sequence. The short prefix needs application routing support; this experiment does not implement it.

URL serializers percent-encode the UTF-8 form of non-ASCII fragment text. Decode that percent encoding once, then decode the transport. Never convert plus to space and never percent-decode twice. Construct in-game copy text from the raw Unicode payload; serialised `href` is much longer.

The default decoder preserves exact text and rejects changed checksums. An explicit `{ repairNfc: true }` option applies NFC before decoding non-dense profiles, permitting canonical decomposition to be repaired. This cannot recover truncated or filtered characters. Dense is never silently normalised. The game round-trip test must compare exact copied text and reconstructed bytes before relying on any repair option.
