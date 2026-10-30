# Character blacklist investigation

The failed game-chat specimen provides a useful seed blacklist: **35 distinct source characters occur in changed spans** before the truncated tail. Removing them leaves 50,829 of the original 50,864 alphabet symbols and keeps all five recovered layouts within the numerical 512-unit root-route budget. This candidate has not passed a game-chat test. Translation may depend on context, so a blacklist is worth testing but is not yet a safe transport rule.

## Observed pattern

The following counts use sequence alignment and exclude the final 38 missing source units. They describe this message, not independent character error probabilities. The ASCII row describes the URL prefix, not an extensive ASCII payload test.

| Source class | Occurrences | Unchanged in alignment | In changed spans |
| --- | ---: | ---: | ---: |
| ASCII prefix | 8 | 8 | 0 |
| Other scripts and punctuation | 88 | 88 | 0 |
| CJK ideographs | 250 | 221 | 29 |
| Hangul syllables | 102 | 102 | 0 |
| Other symbols | 26 | 20 | 6 |

The missing suffix starts at source offset 474. Its characters must not be individually blacklisted merely because that suffix disappeared.

Three patterns are visible:

- Traditional/simplified substitutions: `鈄→钭`, `關→关`, `謫→谪`, `靆→叇`, `隉→陧`, `確→确`. These six pairs match the [OpenCC TSCharacters dictionary](https://github.com/BYVoid/OpenCC/blob/master/data/dictionary/TSCharacters.txt), checked on 30 October 2026. This comparison identifies a pattern; it does not establish that the game uses OpenCC.
- Semantic replacements: `秤→scale`, `胆→gall`, `墻→wall`, `欬→cough`, `漲→rise`, `彬蚤→binflea`, and `訝⬔→surprise`. These go beyond Unicode NFC/NFKC normalisation and could depend on neighbours or language detection. Some remaining substitutions are neither standard simplification nor obvious translations.
- Deleted symbols or symbols inside changed spans: `⤈ ⤅ ⬔ ❒ ⏼ ⌕`. Twenty other symbol occurrences survived, so “all symbols are removed” is not supported.

All 102 comparable Hangul syllable occurrences survived. The other 88 non-Han, non-symbol occurrences also survived. That makes these groups promising for further testing, but it is not exhaustive coverage of their alphabets.

None of the 35 changed characters occurred twice in the comparable source. There are therefore no contradictory repeated-character outcomes, but also **no repeated transformed character with which to establish consistency**. A per-character blacklist has not been proved sufficient. In particular, preserving one occurrence of an ideograph does not establish that another word containing it will survive.

## Seed blacklist

```text
⌕⏼❒⤅⤈⬔䁽原墻彬排摙欬没漲濑皽眘確秤笼罚胆蒂蚤蛀訝謫邧鈄關隉靆駔驦
```

This includes every source character in a changed span, even when a multi-character replacement cannot be unambiguously attributed character by character. It is a conservative blacklist for this one observation. It excludes the 38-unit lost suffix and unchanged characters around inserted spaces.

The fixed study alphabet and its markers are versioned separately from the original transport. Do not overwrite this failure fixture or mutate the v1 alphabet when a later sample reveals new characters; create a new revision. This avoids silently changing the interpretation of earlier links.

## Cost of broader exclusions

These are actual encoded lengths after exact binary round trips, using `dey.ci#` and compact raw IC/1 framing where eligible. The length column lists layouts 8900, 8901, 8902, 8903 and 8904, in that order.

| Candidate | Alphabet size | Bits per unit | Guaranteed compact-byte budget | Actual root URL units |
| --- | ---: | ---: | ---: | --- |
| observed-blacklist-ic1 | 50,829 | 15.6334 | 984 | 46 / 512 / 505 / 156 / 167 |
| no-ideographs-ic1 | 23,262 | 14.5057 | 913 | 49 / 551 / 544 / 167 / 179 |
| no-ideographs-symbols-ic1 | 20,271 | 14.3071 | 901 | 49 / 559 / 551 / 170 / 182 |
| hangul-ic1 | 11,172 | 13.4476 | 847 | 52 / 594 / 586 / 180 / 193 |

The narrow blacklist costs effectively nothing at this size. For the current largest specimen, radix conversion needs at least 50,350 symbols to stay within 504 data units. That permits 514 removals from the original alphabet, or 479 further removals after these 35. This is exact for this specimen and framing, not a guarantee for arbitrary future islands. Removing all CJK ideographs and the six failed symbols reduces the alphabet to 23,262 symbols and makes the two largest layouts 551 and 544 units. Hangul alone reaches only 11,172 symbols; the largest layout becomes 594 units. Broader exclusions therefore trade confidence for capacity and would require further binary compression to recover the largest layouts.

All **84 offline candidate/layout cases** across the 21-layout corpus reconstruct the exact original binary bytes. Four study tests check the generated implementation, exclusions, all round trips, URL serialisation, normalisation stability and corruption rejection. The generated encoder/decoder uses the same reference transport source with only the frozen alphabet import changed. No editor or production decoder was modified.

## Next test

The [new 512-unit specimen](../.dsh/island-compression/unicode/blacklist-layout-8901-root.txt) encodes the same complete 8901 layout while using none of the 35 observed bad characters. Its marker is `^`; the original test specimen used `=`. It is the next useful game trial, not a validated replacement.

Paste it, send it and copy the received message back. Record new changed characters separately. If the remaining characters undergo new translations, expand the observations and run held-out contexts before promoting an alphabet. The [short character-set probe](../.dsh/island-compression/unicode/character-probe.txt) can also isolate ASCII, Hangul, Chinese and symbols without a length-limit confounder. Repeated isolated and neighbouring forms of the same character are needed to test context dependence.

```sh
node .dsh/island-compression/unicode/blacklist-study.mjs
node --test .dsh/island-compression/unicode/blacklist-test.mjs
python3 .dsh/island-compression/unicode/write-blacklist-report.py
node .dsh/island-compression/unicode/blacklist-study.mjs --verify copied-message.txt
```

[Analysis JSON](../.dsh/island-compression/unicode/blacklist-analysis.json) records code points, Unicode names and classification. [Results CSV](../.dsh/island-compression/unicode/blacklist-results.csv) and [results JSON](../.dsh/island-compression/unicode/blacklist-results.json) contain every measured length and correctness result. The actual game transformation stage remains unisolated; the user attributes the observed changes to game chat.
