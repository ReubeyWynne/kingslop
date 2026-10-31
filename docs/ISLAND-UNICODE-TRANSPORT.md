# Unicode island transport experiments

**Game-chat validation failed.** The user-returned specimen has 506 UTF-16 units instead of 512 and cannot decode. Changes include `秤 → scale`, `胆 → gall`, `墻 → wall`, traditional/simplified substitutions, removed symbols and a missing tail. The user attributes this to game chat; the exact input/send/display/copy stage is not independently isolated. The wide assigned alphabet is not recommended for lossless sharing. The size table below describes offline encoding only.

Four recovered layouts fit the original `dey.ci/island#` format using assigned, normalisation-stable BMP characters and a generic compact IC/1 header. The fifth needs 519 UTF-16 units. With the shorter `dey.ci#` prefix, **all five fit**, at 46, 512, 505, 156 and 167 units. That shorter route would need a homepage fragment dispatcher in the future editor; no application route was changed here.

The original 373-byte limit belongs to base64url, not to UTF-16 game chat. These experiments revise that transport assumption without discarding any placement or referencing a preset. All sizes below count actual encoded JavaScript string lengths, including the prefix and a one-unit transport marker. Every transport uses the same original binary codec output, or reconstructs that output byte for byte through the documented compact-header rule.

The [blacklist investigation](ISLAND-CHARACTER-BLACKLIST.md) records two failed game returns. Its candidate excluding the first 35 observed changed characters also failed. Empirical blacklist iteration is not a production validation strategy; the offline size results remain diagnostic only.

The [observed-survivor study](ISLAND-SURVIVOR-ALPHABETS.md) pools 919 distinct payload characters that returned unchanged across those two trials, with no observed failures for those characters. It implements 512-, 867- and 919-symbol candidates from that finite evidence; the smaller-alphabet path does not require a fresh Unicode census.

## Measured recovered layouts

| Layout | Base64url, original route | CJK/Hangul 15-bit, original route | Assigned BMP + compact IC/1, original route | Assigned BMP + compact IC/1, root route | Dense BMP diagnostic, original route |
| --- | ---: | ---: | ---: | ---: | ---: |
| 8900 | 118 | 57 | 53 | 46 | 55 |
| 8901 | 1334 | 544 | 519 | 512 | 512 |
| 8902 | 1316 | 536 | 512 | 505 | 505 |
| 8903 | 406 | 172 | 163 | 156 | 163 |
| 8904 | 436 | 184 | 174 | 167 | 174 |

The practical profiles contain no surrogate pairs, controls, format characters, private-use or unassigned characters. The 50,864-character assigned alphabet also excludes combining marks, conjoining Hangul jamo and characters changed by NFC or NFKC. It includes uncommon scripts and RTL letters, so visual order and font coverage can be awkward even when the underlying text survives. **Normalisation stability is not proof that Kingshot accepts or preserves it.**

The 63,319-character dense profile reaches 512 and 505 units on the two largest layouts without compacting their headers, but includes private-use, unassigned, combining and normalisation-sensitive characters. NFC changes both large specimens; NFKC changes all five recovered dense specimens. It is a diagnostic upper-bound experiment, not the recommended transport.

## Why Unicode helps

Base64url stores six bits per UTF-16 unit. A 16,384-character BMP alphabet stores 14; a 32,768-character alphabet stores 15. Each BMP character still consumes one unit. Non-BMP emoji require two units and are a poor choice for this purpose.

The fixed alphabets are versioned in [alphabets-v1.json](../.dsh/island-compression/unicode/alphabets-v1.json), generated once from Unicode 15.0.0 and stored as explicit ranges. The runtime does not regenerate them from its own Unicode tables. The decoder uses range searches rather than allocating a 50,000-entry string dictionary.

| Transport | Alphabet size | Bits per data unit | Guaranteed byte capacity with original prefix |
| --- | ---: | ---: | ---: |
| base64url | 64 | 6 | 373 |
| han14 (`!`) | 16,384 | 14 | 869 |
| east15 (`~`) | 32,768 | 15 | 931 |
| assigned (`$`) | 50,864 | 15.634 | 971 |
| dense (`*`, diagnostic) | 63,319 | 15.950 | 990 |

The Unicode profiles reserve one marker unit, leaving 497 data units after the original 14-unit route prefix. A leading binary sentinel preserves byte length and leading zero bytes. Capacities account for both. The assigned profile with the root prefix has 504 data units and holds 984 bytes; compact IC/1 reconstructs six more header bytes at this size, which is enough for the original 990-byte largest specimen.

## Reversible header compaction

`:` selects east15 with compact raw IC/1; `=` selects assigned with compact raw IC/1. Only valid, uncompressed IC/1 envelopes are eligible. Store the original four checksum bytes followed by the complete structural body. The marker fixes the public IC/1 magic, version and compression method; body byte count fixes the original length varint. Decode rebuilds the envelope and verifies its CRC before returning the original bytes. This saves five bytes for small bodies and six for the recovered large bodies.

There is no omitted layout information, reduced checksum or preset knowledge. Compressed IC/1 envelopes and arbitrary non-IC bytes fall back to the ordinary profile. Encoder order, alphabet ordering, numeric framing and fallback rules are deterministic. The original binary encoder and decoder were not modified.

## URL and clipboard behaviour

Percent-encoding does not destroy the Unicode payload. A URL serializer writes its UTF-8 bytes as `%XX`, and the importer must apply `decodeURIComponent` to the fragment once before Unicode decoding. None of the alphabets contains `%`; no plus-to-space conversion is used. The original 512-unit stress sample serialises as a 4,496-unit HTTPS URL, so the in-game copy action must construct the raw Unicode text rather than copying `location.href` or `anchor.href`.

The browser connector loaded the static HTTPS specimens and preserved both the exact 512-unit stress string and the complete 512-unit 8901 root specimen through its clipboard write/read API. The latter remained unchanged under NFC and NFKC in the control runtime. Read-only DOM-scope URL inspection restored all 16 static specimens after percent-encoding. The controller performed normalisation comparisons. See [browser-observations.json](../.dsh/island-compression/unicode/browser-observations.json) for the precise boundary.

The standalone executable browser probe is provided, but was not run in this cloud browser: the browser policy rejected `data:` navigation. Testing continued with static HTTPS content and the permitted clipboard API. No full native-browser codec or physical Android performance claim follows from those checks.

The supplied user game-chat trial failed; other alphabets remain unverified. [Failure fixture](../.dsh/island-compression/unicode/game-failure.json) records the exact edits and [returned text](../.dsh/island-compression/unicode/returned-game-message.txt). The next step is a short labelled character-set probe, not another full-size payload. The decisive test is **paste, send, copy the received message back, then compare bytes and decoded layout**. A message that merely looks intact is insufficient. Test the actual game after its filters and transport, not only the input field. No game message was sent by this session.

## Tests and timings

All **147 transport/layout cases** across the existing 21-layout corpus reconstruct the original binary bytes exactly and decode to the original canonical layout. Original and shortened route fragments both survive URL serialisation tests. Seven automated tests cover random bytes and lengths, leading zeros, complete alphabets, NFC/NFKC stability, canonical-decomposition repair, malformed input, size bounds, compact-header fallback, and every character mutation/truncation of the compact 8902 specimen.

Transport-only times for the largest recovered binary layout use medians of seven Node v24.22.1 runs. Decode timings include the byte equality assertion. They exclude binary layout compression, alphabet module loading and rendering. BigInt radix conversion is slower than fixed-width packing, especially for large exports; no mobile timings were measured.

| Profile | Encode ms | Decode + equality ms |
| --- | ---: | ---: |
| han14 | 0.087 | 0.160 |
| east15 | 0.079 | 0.096 |
| assigned | 0.444 | 0.229 |
| dense | 0.474 | 0.209 |
| assigned-ic1 | 0.665 | 0.282 |

[Full measurements](../.dsh/island-compression/unicode/results.csv) record actual UTF-16 lengths, code-point counts, UTF-8 bytes, percent-encoded URL lengths, timing and correctness. [Detailed JSON](../.dsh/island-compression/unicode/results.json) adds normalisation results. The browser modules use native BigInt for non-power-of-two alphabets; no external service or runtime package is required.

## Paste specimens and reproduction

- [Complete 8901, root route, exactly 512 units](../.dsh/island-compression/unicode/layout-8901-root.txt): normalisation-stable assigned alphabet and compact IC/1.
- [Complete 8902, original route, exactly 512 units](../.dsh/island-compression/unicode/layout-8902.txt): the same transport without shortening the route.
- [CJK/Hangul stress specimen, exactly 512 units](../.dsh/island-compression/unicode/paste-sample.txt): 931 diagnostic bytes with checksum `eac6d773`; this one is not a layout.
- [Standalone browser probe](../.dsh/island-compression/unicode/browser-probe.html), generated from the actual reference modules.

Save copied game text to a UTF-8 file and run:

```sh
node .dsh/island-compression/unicode/verify-paste.mjs copied-message.txt
node --test .dsh/island-compression/unicode/test.mjs
node .dsh/island-compression/unicode/benchmark.mjs
node .dsh/island-compression/unicode/make-browser-probe.mjs
python3 .dsh/island-compression/unicode/generate-report.py
```

The verifier checks the checksum and reports exact matches against the original recovered binary layouts, including piece and surface counts. It accepts the root or original route and percent-encoded fragments. It does not silently normalise away a changed game message.

## What changes in the earlier conclusion

The earlier report's 373-byte limit and two-surface counting example were ASCII/base64url limits. The 500+500 surface fixture now fits comfortably with Unicode. Neither was a universal proof about a 512-unit UTF-16 message.

A universal arbitrary-island guarantee is still impossible. Six surface families with 500 cells each and 600 empty cells have `3600! / ((500!)^6 * 600!)` arrangements, about **10061.41 bits**, requiring at least **1258 bytes** for some arrangement. All six families have a recovered per-type cap of 500. This exceeds even the idealised 8,080 bits available after the seven-unit root prefix, before a real alphabet, marker or checksum. Exact terrain/availability constraints remain unresolved, so this is a counting result over the stated grid model.

The root alias saves seven units, but routing should not be chosen around an unvalidated transport. The wide assigned alphabet failed the supplied game round trip. No further empirical blacklist trials are requested. A production profile needs actual game filtering rules or a bounded small-alphabet validation strategy; a short successful probe alone would not establish arbitrary-string safety. No remaining Unicode profile is validated. Keep base64url as the conservative fallback candidate. Do not choose the dense diagnostic alphabet merely to make the table pass.
