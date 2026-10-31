from pathlib import Path
import json
p=Path(__file__).resolve().parent
a=json.loads((p/'blacklist-analysis.json').read_text());r=json.loads((p/'blacklist-results.json').read_text())
table=[]
for group,n in a['byClass'].items():table.append(f"| {group} | {n['total']} | {n.get('unchanged',0)} | {n.get('changed',0)} |")
scenarios=[]
for item in a['scenarios']:
 cases=[x for x in r['measurements'] if x['profile']==item['profile'] and x['layout'].startswith('kingshot-')]
 scenarios.append(f"| {item['profile']} | {item['alphabetSize']:,} | {item['bitsPerUnit']:.4f} | {item['guaranteedCompactBytesWithRoot']} | {' / '.join(str(x['rootRouteUnits']) for x in cases)} |")
text=f'''# Character blacklist investigation

**Status: diagnostic only; not a proposed production transport.** The second user return also failed: 505 units instead of 512, with one ideograph replaced by an asterisk and seven symbols deleted. Both tested alphabets failed. No predictive rule for unseen characters or arbitrary strings has been identified. Further character-by-character blacklist iteration is not a useful validation plan, and no further user paste batches are requested.

The failed game-chat specimen provides a useful seed blacklist: **35 distinct source characters occur in changed spans** before the truncated tail. Removing them leaves 50,829 of the original 50,864 alphabet symbols and keeps all five recovered layouts within the numerical 512-unit root-route budget. This candidate failed the second game-chat trial. The size advantage is retained here as a diagnostic result; it does not establish a predictive character filter.

## Observed pattern

The following counts use sequence alignment and exclude the final 38 missing source units. They describe this message, not independent character error probabilities. The ASCII row describes the URL prefix, not an extensive ASCII payload test.

| Source class | Occurrences | Unchanged in alignment | In changed spans |
| --- | ---: | ---: | ---: |
{chr(10).join(table)}

The missing suffix starts at source offset 474. Its characters must not be individually blacklisted merely because that suffix disappeared.

Three patterns are visible:

- Traditional/simplified substitutions: `鈄→钭`, `關→关`, `謫→谪`, `靆→叇`, `隉→陧`, `確→确`. These six pairs match the [OpenCC TSCharacters dictionary](https://github.com/BYVoid/OpenCC/blob/master/data/dictionary/TSCharacters.txt), checked on 30 October 2026. This comparison identifies a pattern; it does not establish that the game uses OpenCC.
- Semantic replacements: `秤→scale`, `胆→gall`, `墻→wall`, `欬→cough`, `漲→rise`, `彬蚤→binflea`, and `訝⬔→surprise`. These go beyond Unicode NFC/NFKC normalisation and could depend on neighbours or language detection. Some remaining substitutions are neither standard simplification nor obvious translations.
- Deleted symbols or symbols inside changed spans: `⤈ ⤅ ⬔ ❒ ⏼ ⌕`. Twenty other symbol occurrences survived, so “all symbols are removed” is not supported.

All 102 comparable Hangul syllable occurrences survived. The other 88 non-Han, non-symbol occurrences also survived. That makes these groups promising for further testing, but it is not exhaustive coverage of their alphabets.

None of the 35 changed characters occurred twice in the comparable source. There are therefore no contradictory repeated-character outcomes, but also **no repeated transformed character with which to establish consistency**. A per-character blacklist has not been proved sufficient. In particular, preserving one occurrence of an ideograph does not establish that another word containing it will survive.

## Seed blacklist

```text
{a['observedBlacklist']}
```

This includes every source character in a changed span, even when a multi-character replacement cannot be unambiguously attributed character by character. It is a conservative blacklist for this one observation. It excludes the 38-unit lost suffix and unchanged characters around inserted spaces.

The fixed study alphabet and its markers are versioned separately from the original transport. Do not overwrite this failure fixture or mutate the v1 alphabet when a later sample reveals new characters; create a new revision. This avoids silently changing the interpretation of earlier links.

## Cost of broader exclusions

These are actual encoded lengths after exact binary round trips, using `dey.ci#` and compact raw IC/1 framing where eligible. The length column lists layouts 8900, 8901, 8902, 8903 and 8904, in that order.

| Candidate | Alphabet size | Bits per unit | Guaranteed compact-byte budget | Actual root URL units |
| --- | ---: | ---: | ---: | --- |
{chr(10).join(scenarios)}

The narrow blacklist costs effectively nothing at this size. For the current largest specimen, radix conversion needs at least 50,350 symbols to stay within 504 data units. That permits 514 removals from the original alphabet, or 479 further removals after these 35. This is exact for this specimen and framing, not a guarantee for arbitrary future islands. Removing all CJK ideographs and the six failed symbols reduces the alphabet to 23,262 symbols and makes the two largest layouts 551 and 544 units. Hangul alone reaches only 11,172 symbols; the largest layout becomes 594 units. Broader exclusions therefore trade confidence for capacity and would require further binary compression to recover the largest layouts.

All **84 offline candidate/layout cases** across the 21-layout corpus reconstruct the exact original binary bytes. Five study tests check the generated implementation, exclusions, all round trips, URL serialisation, normalisation stability and corruption rejection. The generated encoder/decoder uses the same reference transport source with only the frozen alphabet import changed. No editor or production decoder was modified.

## Historical specimens and validation limit

The [new 512-unit specimen](../.dsh/island-compression/unicode/blacklist-layout-8901-root.txt) encodes the same complete 8901 layout while using none of the 35 observed bad characters. Its marker is `^`; the original test specimen used `=`. It was tested and failed. The [returned text](../.dsh/island-compression/unicode/returned-blacklist-v1-game-message.txt) and [analysis](../.dsh/island-compression/unicode/blacklist-v1-game-return-analysis.json) preserve that result.

The second return preserved 504 source characters, replaced `㞗` with `*`, and deleted `⌞ ⍏ ⏣ ⥏ ♙ ⤸ ⌐`. Its tail survived. This narrows the observation but does not establish an allowed character class or bound future failures. Asterisk masking is consistent with content filtering, but the implementation is unknown.

Per-character successes cannot prove an arbitrary string safe if the game also applies substring filters, language detection or translation. A larger blacklist would fit these samples numerically but would still overfit observed failures. A production Unicode format needs documented or recovered transformation/validation rules, or a substantially smaller alphabet with a bounded test and context model. Even a complete character sweep would not prove context-independent behaviour. Until then, retain the binary codecs, use base64url as the conservative transport candidate and offer larger exports rather than claiming a universal single-message format. The old short probes and v1 codecs remain for reproducibility, not as requests for more user testing.

```sh
node .dsh/island-compression/unicode/blacklist-study.mjs
node --test .dsh/island-compression/unicode/blacklist-test.mjs
python3 .dsh/island-compression/unicode/write-blacklist-report.py
node .dsh/island-compression/unicode/blacklist-study.mjs --verify copied-message.txt
```

[Analysis JSON](../.dsh/island-compression/unicode/blacklist-analysis.json) records code points, Unicode names and classification. [Results CSV](../.dsh/island-compression/unicode/blacklist-results.csv) and [results JSON](../.dsh/island-compression/unicode/blacklist-results.json) contain every measured length and correctness result. The actual game transformation stage remains unisolated; the user attributes the observed changes to game chat.
'''
(p.parents[2]/'docs/ISLAND-CHARACTER-BLACKLIST.md').write_text(text)
