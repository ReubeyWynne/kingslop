# Community screenshot corpus

22 additional real-game image crops: 15 English and 7 Japanese. These are
research fixtures for the shared screenshot import work in PR #108. They are
not a claim of language support or passing OCR regressions.

`manifest.json` records the source page, original image URL, observed screenshot
language, pixel dimensions and SHA-256 of every file. Original image bytes are
retained, including publisher annotations and watermarks. Game imagery belongs
to its respective rights holders; these are not site assets or a separately
licensed image collection.

## Coverage

| Language | Images | Screens |
| --- | ---: | --- |
| English | 15 | Hero gear details/overview, mastery, enhancement, ascension, reforge, imbuement, backpack Gear tab |
| Japanese | 7 | Resources overview, arena opponent, hero enhancement/mastery/widget, governor gear overview/upgrade |

All images are publisher crops, not full phone screenshots. Most omit navigation,
headers or rows; the Japanese Resources crop contains only the first two resource
rows. Do not invent absent values, treat absence as zero, or feed these into a
full-screen geometry regression expecting a complete layout. The arena image is
an auxiliary/unsupported-screen candidate. The tiny gear strip and red-gear
result crops are useful for small-region and rejection tests.

The TOPUPlive article is translated into French, Portuguese and German, but its
actual screenshots are English. Counting article languages as OCR coverage would
be wrong. No verified Arabic/RTL, Korean, Portuguese or French game capture is
included. Full-height Overview Speedups and overlapping Other-tab scrolls in
non-English languages remain the highest-priority gaps.

## Using these with PR #108

1. Pick a screen supported by the current adapter. Inspect the original crop.
2. Run the production worker and retain its raw boxes/text separately, using the
   active branch's `.dsh/import-record.cjs` where compatible. These files do not
   automatically join the existing recorded-read test suite.
3. Manually transcribe visible fields into expected data and review them before
   adding parser assertions. There is no recorded OCR or ground truth yet.
4. Test routing on full phone captures separately. These crops cannot establish
   viewport, RTL layout or scroll-stitching support.

This corpus adds files only and can be cherry-picked into the active OCR branch
without changing the parser or its current fixtures.
