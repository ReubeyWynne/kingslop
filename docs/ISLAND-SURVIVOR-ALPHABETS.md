# Alphabets from observed surviving characters

We already have **919 distinct payload characters that returned unchanged**, with no observed changed occurrence of those characters. A 256-symbol proposal was unnecessarily restrictive. The existing evidence supports a 512-symbol control alphabet, an 867-symbol letters/numbers alphabet and the full 919-symbol alphabet without asking for a fresh Unicode census.

This is positive evidence from the two supplied game-chat returns. It is not proof that every new combination will pass the game. The failed wide-alphabet messages remain failed; their unchanged spans are still useful observations.

## Counting the existing evidence

The extractor aligns each original specimen with its returned text. It counts only positions after the URL prefix and transport marker. It excludes the first trial's missing 38-unit tail because missing suffix characters cannot be individually classified. A character with any observed changed occurrence would be removed even if it survived elsewhere.

| Trial | Unchanged payload occurrences | Distinct unchanged payload characters | Changed payload occurrences | Excluded tail units |
| --- | ---: | ---: | ---: | ---: |
| 1 | 431 | 429 | 35 | 38 |
| 2 | 496 | 494 | 8 | 0 |

The first trial contributes 429 distinct unchanged characters, the second 494, with four characters shared between them: `429 + 494 − 4 = 919`. There are **no observed conflicts**. The total unchanged payload occurrence count is 927, including repeats. Two of the distinct survivors are ASCII payload letters; the URL prefixes themselves are not being counted as alphabet evidence.

[The evidence JSON](../.dsh/island-compression/unicode/survivor-evidence.json) records every survivor, Unicode name, source-message position and observation count. The original and returned fixture hashes are included. These are observations of exact code points, not a claim that a whole Unicode block or language is safe.

## Implemented candidates

The alphabets and their ordering are frozen in `survivor-alphabets-v1.mjs`. They are public symbol dictionaries, not layout dictionaries. Existing binary codec output is encoded unchanged, with the existing generic raw IC/1 header compaction when eligible. The generated transport reuses `transport.mjs` with its alphabet import and input-size bound changed; the layout encoder and decoder are untouched.

| Candidate | Alphabet construction | Generic marker | Compact IC/1 marker |
| --- | --- | --- | --- |
| survivors512 | 512 observed letters/numbers; most repeated observations first, then code-point order | `.` | `?` |
| survivors867 | All 867 observed letters/numbers, omitting symbols and punctuation | `,` | `/` |
| survivors919 | Every one of the 919 observed survivors | U+007C (vertical bar) | `;` |

Digits are finally sorted by code point. The 512 selection rule is deterministic and supports simple nine-bit packing; it is not a predictive safety ranking. The other two profiles use radix conversion. The 867 candidate allows a comparison without symbols or punctuation at a small density cost. None of these profiles introduces an unobserved character into the payload alphabet.

## Actual capacity

Capacities below include the one-unit transport marker and binary-length sentinel. They are transported-byte capacities. Generic raw IC/1 compaction can reconstruct another five or six envelope bytes from its fixed rules. Base64url with the original route holds 373 complete wire bytes.

| Symbols | Bits per data unit | Bytes with `dey.ci/island#` | Bytes with `dey.ci#` | Evidence |
| --- | ---: | ---: | ---: | --- |
| 512 | 9.000 | 559 | 566 | observed subset |
| 867 | 9.760 | 606 | 614 | observed subset |
| 919 | 9.844 | 611 | 620 | observed pool |
| 1,024 | 10.000 | 621 | 629 | capacity calculation only; not a tested alphabet |
| 2,048 | 11.000 | 683 | 692 | capacity calculation only; not a tested alphabet |

Only **105 additional surviving characters** are needed to reach 1,024. That is a small targeted collection task rather than a test of the entire BMP. The 1,024/2,048 rows are capacity calculations, not implemented or validated alphabet claims. No new game paste batch is requested in this change.

## Measured recovered layouts

Every cell below is the actual number of UTF-16 units in a root-route URL, after encoding and exact binary reconstruction. Three profiles were measured on all 21 layouts, giving 63 offline round trips.

| Layout | 512 symbols | 867 letters/numbers | 919 symbols |
| --- | ---: | ---: | ---: |
| 8900 | 73 | 68 | 68 |
| 8901 | 883 | 815 | 808 |
| 8902 | 871 | 804 | 797 |
| 8903 | 265 | 245 | 243 |
| 8904 | 284 | 263 | 260 |

All three candidates fit 16 of the 21 corpus layouts with the root route. The two large recovered layouts still exceed 512 units; a 919-symbol alphabet cannot carry their current roughly 1 KB binary encodings in a single message. This does not erase the benefit over base64url for smaller and medium-sized layouts.

[CSV](../.dsh/island-compression/unicode/survivor-results.csv) and [JSON](../.dsh/island-compression/unicode/survivor-results.json) record both route lengths, original wire sizes and every round-trip result. Four automated tests verify extraction, exclusions, generated implementation equivalence, all corpus cases, both URL routes, NFC/NFKC stability and the fixed-width codec's full 65,536-byte bound. The text limit is 60,000 units for these smaller radices so the binary bound can actually round trip.

## Reproduction and use

```sh
node .dsh/island-compression/unicode/survivor-study.mjs
node --test .dsh/island-compression/unicode/survivor-test.mjs
python3 .dsh/island-compression/unicode/write-survivor-report.py
node .dsh/island-compression/unicode/survivor-study.mjs --verify copied-message.txt
```

[The 919-symbol reference specimen](../.dsh/island-compression/unicode/survivor919-layout-8903-root.txt) encodes the complete 8903 layout in 243 units. It uses only observed survivors, but the newly encoded message itself has not been sent through the game. It is supplied for reproducibility, not as another required test.

Keep the two source-return pairs and v1 alphabets immutable. New observations should produce a new revision, preserving decoding of old codes. The next useful validation concerns new combinations of this finite observed pool, and narrowly targeted expansion if desired. It does not require verifying all 50,000 characters or guessing a comprehensive blacklist.
