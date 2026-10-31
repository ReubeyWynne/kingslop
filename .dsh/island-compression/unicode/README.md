# Unicode transport follow-up

Both supplied game-chat trials failed; no predictive transformation rule has been established. `game-failure.json` records 506 returned units instead of 512, semantic substitutions, deleted symbols and truncation. Its decoder rejects the result. Offline size tables do not establish a usable chat transport.

[Measured report](../../../docs/ISLAND-UNICODE-TRANSPORT.md) · [CSV](results.csv) · [Format](FORMAT.md)

The original binary codecs stay unchanged. These transports encode their complete output with more bits per UTF-16 unit. Compact profiles reconstruct the original raw IC/1 header from fixed format rules and the transmitted body/checksum. No layout is inferred from a preset.

```sh
node --test .dsh/island-compression/unicode/test.mjs
node .dsh/island-compression/unicode/benchmark.mjs
node .dsh/island-compression/unicode/make-browser-probe.mjs
python3 .dsh/island-compression/unicode/generate-report.py
node .dsh/island-compression/unicode/verify-paste.mjs copied-message.txt
```

There are 147 measured cases: 21 layouts × seven transport profiles, with original and root route fragments checked. Seven tests pass. `results.json` includes normalisation checks; `results.csv` contains actual lengths and timings. `browser-observations.json` records the exact browser/clipboard test boundary. The user-returned wide-alphabet specimen fails decoding; other character sets remain unverified.

`layout-8901-root.txt` is a complete 8901 layout, exactly 512 UTF-16 units, using `dey.ci#` and the assigned compact profile. `layout-8902.txt` is a complete 8902 layout, exactly 512 units, keeping `dey.ci/island#`. The short root route requires a future homepage fragment dispatcher; no application code was changed.

`paste-sample.txt` is an exact 512-unit CJK/Hangul stress string with a diagnostic checksum, not an island. The other specimens are in `paste-samples.json`. Paste a specimen into Kingshot, send it, copy the received message and check the returned text. Successful visual display alone does not establish lossless preservation.

`browser-probe.html` is a self-contained generated browser harness. It includes the actual codec source and can run without a server. The cloud browser's URL policy prevented running it through a data URL in this session; static HTTPS specimen reading and clipboard checks were used instead. Do not describe this as a completed native-browser codec benchmark.

## Blacklist study

[Character analysis and measured trade-offs](../../../docs/ISLAND-CHARACTER-BLACKLIST.md) isolates the 35 changed code points before the truncated suffix. The generated v1 blacklist transport excludes them and preserves all 21 corpus layouts in 84 offline cases. Its game trial failed with eight further changed characters. No further user blacklist-testing batches are requested.

```sh
node .dsh/island-compression/unicode/blacklist-study.mjs
node --test .dsh/island-compression/unicode/blacklist-test.mjs
python3 .dsh/island-compression/unicode/write-blacklist-report.py
node .dsh/island-compression/unicode/blacklist-study.mjs --verify copied-message.txt
```

Do not overwrite the original failure fixture or remap the v1 alphabet after later trials; create a new revision. `blacklist-transport-v1.mjs` is generated from the existing transport implementation with only its alphabet import changed. No production decoder or editor route is modified.

## Observed survivors

[Survivor-alphabet report](../../../docs/ISLAND-SURVIVOR-ALPHABETS.md) counts 919 distinct unchanged payload code points from the existing two returns. It implements a 512-symbol control, an 867-symbol letters/numbers subset and all 919 survivors. All 63 offline corpus cases reconstruct the original binary bytes. The alphabet is frozen separately from earlier profiles; new encoded combinations remain game-unverified. No further user paste batch is requested.

```sh
node .dsh/island-compression/unicode/survivor-study.mjs
node --test .dsh/island-compression/unicode/survivor-test.mjs
python3 .dsh/island-compression/unicode/write-survivor-report.py
```
