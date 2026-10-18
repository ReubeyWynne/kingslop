# Screenshot import

The plan for milestone 6 in [ROADMAP.md](ROADMAP.md): one way to read game
screenshots into the shared player ledger, with one review step and a clear
recipe for adding a new kind of screen. Any agent can pick up the next
unchecked step below; each step is small enough to land as its own commit.

## Decisions already made

These came from the owner in the project thread and are not open questions.

- **Review before apply** stays, with a cut-out of the screenshot next to every
  value. Nothing reaches the ledger until the player confirms it.
- **No long scrolling modal.** Review is a compact grid shaped like the game
  screen it came from: one cut-out and one input per tile. Confident values are
  pre-ticked and quiet; a "Needs a look (n)" filter steps through only the
  unread or doubtful ones.
- **Single inputs, clean DOM hooks.** Review markup comes from a `<template>`
  with `data-field` hooks, reconciled in place, the way `troop-roster` works
  (INTERACTIONS.md). No string-built HTML.
- **Central and minimisable.** One import dock for the whole site. It collapses
  to a small chip ("Import · 2 to review") and its queue survives moving between
  pages.
- **Totals for basic resources.** Bread, wood, stone and iron come from the
  Overview popup's totals. Nobody needs per-denomination resource item counts.
- **Per-item counts for event items** on the backpack "Other" tab: the
  inventory ids in `_data/event_rules.json` that the Town Centre bag shows,
  plus the Gen 1–7 widget chests (`hero-widget-chest-gen{n}`).
- **Speedups by minutes.** The Overview popup's Speedups tab gives exact
  days/hours/minutes per kind, which is what the ledger stores
  (`speedup-{kind}`, minutes). Speedup tiles are not read.
- **The bag has no per-hero items.** Hero-specific shards
  (`hero-shards-{hero}`) and widgets (`hero-widgets-{hero}`) belong to the
  Heroes page and are out of scope here. Do not change hero point scoring;
  another branch owns it.
- **Client-side only.** Keep PaddleOCR.js with the self-hosted `/models/`
  (KINGSHOT-SOURCES.md, "OCR provenance"). No server, no other OCR library.

## Where things stand

| Piece | Today | Problem |
| --- | --- | --- |
| Engine | `js/ocr-worker.js`: PaddleOCR v6 tiny in a module worker, downscale to 800px long side, GPU → wasm fallback | Good. Keep it. |
| Worker client | Written twice: `js/sim.js` (`askWorker`, `killWorker`) and `js/hero-gear.js` (`read`, `killReader`) | Drifted: different backend policy, preview handling and retry. |
| Parsing helpers | Row grouping, text folding and number parsing in `js/sim.js` and again in `js/hero-gear-ocr.js` | Different tolerances; only hero gear handles Arabic/full-width digits. |
| Review | Sim writes straight into the sheet then flags fields; hero gear has a review dialog, include toggles, undo | Two UX models. |
| Ledger | `PlayerLedger` import records accept `sourceType: 'hero-gear'` only (`js/player-ledger.js`, `valid` for `imports`) | Needs any adapter's source type and inventory deltas. |

## Pipeline

```
files ─▶ dock queue (IndexedDB) ─▶ OCR client ─▶ adapter.detect ─▶ adapter.read ─▶ proposals ─▶ review grid ─▶ ledger.applyImport
                                      ▲                                │
                                      └──── crops (adapter.regions) ◀──┘
```

### 1. OCR client — `js/ocr-client.js`

One module owns the worker for every page: lazy creation, request ids, the
120 s hang-breaker, kill-and-reject on silent worker death, `warm()`,
`read(blob)` → `{ items, preview }`, and the "empty read on GPU → retry on
wasm" rule. Backend policy is an option (`backend: 'auto' | 'wasm'`), so hero
gear keeps forcing wasm. Exposed as `window.OcrClient` and via CommonJS for
checks.

### 2. Shared helpers — `js/ocr-text.js`

Pure functions, no DOM: `boxes(items)` (poly → `{x, y, w, h, cx, cy, text}`),
`rows(boxes, tolerance)`, `normalise(text)` (bidi marks, Arabic-Indic and
full-width digits, NBSP), `fold(text)` (lookalike letters), `withinOneEdit`,
`parseCount("8,830")`, `parseShort("207.60M")` → `207600000`,
`parseDuration("17 day(s)20 hr(s)1 min(s)")` → minutes. Sim and hero gear move
onto these; their tests must still pass unchanged.

### 3. Adapter contract — `js/import-adapters/*.js`

Each adapter registers itself with `ScreenImport.register(adapter)`:

```js
{
  id: 'overview-resources',          // stable, used in import records
  sourceType: 'backpack',            // ledger import record source
  detect(page) -> 0..1,              // page = { items, rows, width, height, bitmap }; cheap, text or pixels
  regions(page) -> [{ key, x, y, w, h, scale }] | null,  // optional crops to re-read enlarged
  read(page, crops) -> proposals     // see below
}
```

A proposal is one reviewable value:

```js
{ target: 'inventory', id: 'bread', value: 597910000, confidence: 0.9,
  crop: { x, y, w, h }, label: 'Bread', note: 'Items 207.60M · In stock 597.91M' }
```

`value: null` means unread (never a guess). The router reads a file once, asks
every registered adapter to `detect`, and hands it to the best score above
0.5. A file nobody claims is reported as "Not a screen I know" in the dock.

Small text rendered at 800px is unreadable (backpack counts are ~10px tall
after the downscale). Adapters that need small text use `regions` to cut the
original-resolution image into enlarged strips, as `HeroGearOCR.overview`
already does for gear labels. Compose several crops into one bitmap per
worker call to keep reads few.

### 4. Review grid — `screen-import` module

Markup lives in `_includes/screen-import.html`, included once by
`_layouts/page.html`. It is a module (`data-module="screen-import"`) with:

- `[data-target="screen-import.chip"]`: the minimised state, a count of files
  waiting and values to check.
- `[data-target="screen-import.sheet"]`: one screenshot's proposals at a time,
  laid out in the screen's own grid.
- `<template data-target="screen-import.tile">` containing
  `img[data-field="crop"]`, `input[data-field="value"]`,
  `input[type=checkbox][data-field="include"]`, `[data-field="label"]`.
- Actions: `screen-import.pick`, `.paste`, `.next`, `.prev`, `.needsLook`,
  `.apply`, `.undo`, `.minimise`, `.discard`.

Pick, paste (clipboard image) and drop all add to the queue. Low-confidence
and unread tiles carry `data-state="doubt"`; the "Needs a look" filter hides
the rest. Every disclosure gets a stable id and deep link (AGENTS.md).

### 5. Queue that survives navigation — `js/import-queue.js`

The worker dies with the page, so the dock persists its state in IndexedDB
(database `bh-screen-import`): each file's blob, SHA-256, status (`queued`,
`reading`, `review`, `applied`, `failed`), proposals and the player's edits.
On load the module restores the chip and resumes any `queued`/`reading` file.
Wrap every IndexedDB call; with storage unavailable the dock still works for
the current page and says so.

### 6. Ledger commit

Generalise import records in `js/player-ledger.js`: `sourceType` from an
allow-list (`hero-gear`, `backpack`), and an `inventoryDelta`
(`{ id: { before, after } }`) beside the existing `itemDelta`. Add
`applyImport(record, expectedRevision)` that writes balances with
`provenance: { source: 'screenshot', importId }`, rejects a repeat
`contentHash`, and supports the existing one-step undo. Keep saves written by
the current schema valid. Update PLAYER-LEDGER.md and
`.dsh/player-ledger-check.cjs`.

### 7. Conflicts between screenshots

- **Overlapping scrolls** of the same tab: stitch by matching the tile
  sequence (icon id + count) at the overlap; never add a tile twice.
- **Different moments**: the same item read with different counts (keys 200
  in one shot, 140 in a later one) → the newest file wins (`lastModified`,
  then upload order), and review shows the older value struck through.
- **Covered tiles** (a video overlay, a tooltip): unread, not guessed.

## Adapters, in order

1. **Overview: Resources** (`overview-resources`). Text rows "Bread 207.60M
   597.91M". Detect by the title "Overview: Resources & Speedups" plus the
   "In Stock" header. Writes `bread`, `wood`, `stone`, `iron`. Default value:
   **In Stock + Items**, matching the Town Centre note "Record your bag and
   warehouse totals"; the review note shows both figures. Rounding: the
   popup's M/K precision is accepted as is. Gold and Governor Stamina rows are
   ignored for now.
2. **Overview: Speedups** (`overview-speedups`). Rows "General Speedup 17
   day(s)20 hr(s)1 min(s)". Only valid with the Day(s) box ticked (the other
   boxes change the unit); detect the tick, otherwise parse the unit from the
   text. Maps General, Soldier Training → training, Construction, Research,
   Learning, Soldier Healing → healing to `speedup-{kind}` minutes.
3. **Backpack: Other** (`backpack-other`). A 4-column tile grid. Find tiles by
   their rounded rarity frames (orange, purple, blue, green, grey), identify
   each by icon signature against reference crops for the event items only,
   read the bottom-right count from an enlarged crop. Unmatched icons are
   skipped silently. Reference signatures are extracted from the fixtures by a
   script in `.dsh/` and stored in the adapter, like `BADGES` in
   `js/hero-gear-ocr.js`. Items needed: truegold, tempered-truegold,
   truegold-dust, masters-manuscript, mythic/epic/rare-hero-shard,
   advanced/common-taming-mark, mithril, forgehammer,
   hero-widget-chest-gen1..7 (confirm which of these appear on the Other tab;
   truegold may live on Resources).
4. **Hero gear move-over.** Port `HeroGearOCR` detail and overview readers
   onto the adapter contract and the shared review grid, then delete the
   hero-gear page's own dialog and worker client.
5. **Battle report move-over.** Port the sim's `parseItems` to an adapter
   whose proposals target the sheet's fields; switch the sim from fill-then-flag
   to review-before-apply.
6. Later, not planned in detail: Backpack Gear tab (all hero gear in one
   screen), Heroes roster (portrait matching and star counting), governor gear.

## Steps

Each step lands as its own commit with its checks passing.

- [x] 1. Write this plan; add fixtures in `.dsh/import-fixtures/`.
- [x] 2. `js/ocr-client.js`; move `js/sim.js` and `js/hero-gear.js` onto it.
  Extend `.dsh/ocr-backend-check.cjs` to cover the client (stub worker).
- [x] 3. `js/ocr-text.js` with node tests (`.dsh/ocr-text-check.cjs`);
  move the sim and hero-gear parsers onto it.
- [x] 4. Ledger: generalised import records + `applyImport` + checks.
- [x] 5. `ScreenImport` registry and router (`js/screen-import-core.js`);
  `overview-resources` and `overview-speedups` adapters
  (`js/import-adapters/overview.js`), checked in node against recorded
  production reads (`.dsh/screen-import-check.cjs`). To record reads for a new
  fixture: build the site, then `node .dsh/import-record.cjs <fixture-name>`.
  The real-worker browser check comes with the dock (step 6).
- [x] 6. Dock UI: `_includes/screen-import.html` (in the layout),
  `css/screen-import.css`, the `screen-import` module in `js/screen-import.js`
  (loads the OCR side on first use), English keys `import.*` in `i18n/en.js`
  (other languages fall back). Pages open it with `data-screen-import="pick"`
  (Town Centre's "read screenshots"); a pasted image anywhere also opens it.
  Browser check through the real worker: `.dsh/screen-import-ui-check.cjs`,
  previews in `.dsh/import-preview/`, CI group `import`.
- [x] 7. IndexedDB queue (`js/import-queue.js`); reviews and unread files
  resume on the next page.
- [ ] 8. `backpack-other` adapter: tile finder, icon signatures, count crops,
  stitching and newest-wins.
- [ ] 9. Hero gear onto the shared dock; remove its private dialog.
- [ ] 10. Battle simulator onto the shared dock with review-before-apply.
- [ ] 11. Update ROADMAP.md milestone 6, PLAYER-LEDGER.md, INTERACTIONS.md
  and HERO-GEAR-SOURCES.md.

## Fixtures

`.dsh/import-fixtures/` holds the owner's screenshots (1440 × 3216 phone,
English, re-encoded at JPEG quality 80):

| File | Screen | Notes |
| --- | --- | --- |
| overview-resources.jpg | Overview, Resources tab | Bread 207.60M / 597.91M, Wood 208.99M / 557.27M, Stone 8.07M / 104.68M, Iron 51.85M / 74.32M, Gold — / 3.85M, Governor Stamina 6.32K / 6.47K |
| overview-speedups.jpg | Overview, Speedups tab, Day(s) ticked | General 17d 20h 1m, Training 8d 0h 10m, Construction 8d 22h 25m, Research 7d 6h 52m, Learning 0d 12h 0m, Healing 8d 10h 45m |
| other-a1..a3.jpg | Other tab, three scrolls, first session | a1 ends with keys 200 and ? chests 3,735 |
| other-b1.jpg | Other tab, top, later | keys 140, ? chests 3,605 |
| other-c1..c4.jpg | Other tab, four scrolls, later session | top to bottom, each overlapping the next |

The full set (heroes roster, gear tab, resources and speedups tiles, a
tooltip) is in the project's shared files under `ocr-import/screenshots/`.
One resources shot with a video overlay was left out because it shows a
person.
