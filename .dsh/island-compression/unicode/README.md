# Unicode transport follow-up

The supplied wide-alphabet game-chat trial failed. `game-failure.json` records 506 returned units instead of 512, semantic substitutions, deleted symbols and truncation. Its decoder rejects the result. Offline size tables do not establish a usable chat transport.

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
