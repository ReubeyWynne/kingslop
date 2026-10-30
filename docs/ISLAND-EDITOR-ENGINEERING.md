# Island designer engineering proposal

Status: proposal, 30 October 2026. Separate from the evidence-gathering agent's docs/research/islands work. No editor code is implemented here.

## Priorities

Build a fast, fluid **cactus-free** Kingshot island editor first, without assuming the other island variants are identical. The reference research reports a 60 × 60 grid, 104 catalogue records (87 building records and 17 surfaces/decorations) and road adjacency rules. Confirm the exact playable mask and cactus-free constraints before implementing placement.

- Design on a phone first. Keep the board dominant, with a compact bottom object palette, category/search filters, thumb-reachable rotate/duplicate/delete/undo and a collapsible inspector. Avoid modal dialogs during placement.
- Tap to select, tap an empty cell to place, and drag a selected item with a ghost, snapping to cells. Offer pan with one finger when no item is active and pinch zoom with two; distinguish movement from taps with a small movement threshold. Verify behaviour on a real phone before locking gestures.
- Preview footprint and collisions before release, with a clear legal/illegal indicator. Never silently displace existing buildings. Support fast repeated placement for roads and tiles, rectangular paint/erase, undo/redo, and zoom-to-fit.
- Show building art and a readable footprint label in the palette. Avoid long textual tables before users can interact with the board. Progressive disclosure for stats, limits and advanced operations.
- Make keyboard access and pointer/touch semantics intentional: native controls for tool settings; Pointer Events with capture for the drawing surface; Escape/cancel, undo shortcuts and explicit zoom buttons. Reduced-motion mode should have a usable static view.
- Don't mix separate concepts: catalogue items, owned items, legal placement, effective buff limits and clearing/terrain progression. Do not label all catalogue items obtainable.

## Static architecture

Use the repo's existing Jekyll/static page layout and CSS conventions, with island-only JS/CSS/data loads. No API or mandatory server-side state. Keep the view as semantic HTML around one specialised renderer, not a huge DOM tree of interactive buttons for 3,600 tiles.

Suggested bounded modules (plain browser ES modules, not a runtime framework):

- `model`: canonical grid coordinates, item instances, orientations, terrain/playability mask, occupancy lookup and pure immutable edit operations.
- `catalogue`: normalised item IDs, footprints, rotations and metadata; generated from sourced research, not copied UI code.
- `rules`: validation, area limits, collisions, road neighbours, and documented cactus-free assumptions.
- `commands`: place/move/rotate/erase/paint, transaction batching, bounded undo/redo.
- `input`: pointer gestures, screen-to-cell hit-testing, keyboard and touch action semantics.
- `render`: viewport clipping, deterministic depth order, image caches, overlays and dirty-region scheduling.
- `persistence`: versioned local save and import/export, separate from share codec.
- `share-codec`: versioned compact binary wire format with round-trip and invalid-input tests.

Prefer a canvas renderer for large, frequently changing isometric scenery and sprites, with normal HTML for palette, inspector, actions and accessibility. Canvas is not 'static hypermedia' itself; the static hypermedia boundary is a pre-rendered, crawlable page, linkable state and native document UI. An SVG renderer is viable only after measuring item count and mobile hit-test performance. No requestAnimationFrame polling: schedule one render on invalidation, and coalesce pointer updates per frame.

Use a spatial occupancy grid and asset bounds for selection rather than scanning full catalogue on each move. Precompute geometry, orientation footprints, isometric projections, atlas positions and adjacency sprites. Load only visible assets or an appropriate atlas. Keep rendering independent from placement calculations. Ensure device-pixel-ratio clamping, offscreen culling and measured low-end Android performance. Never render the entire board into thousands of absolutely positioned DOM elements.

Coordinate projection (adjust orientation to art): `px=(col-row)*tileWidth/2`; `py=(col+row)*tileHeight/2`. Inverse hit-testing needs an explicit policy at diamond edges, tall sprite overlaps and elevations. Store integer grid coordinates only, never projected pixels.

## Share links and compression

A user-supplied Kingshot chat maximum-length specimen contains 379 Unicode code points, 131 non-BMP emoji, 510 UTF-16 code units and 772 UTF-8 bytes. This is **consistent with** a 512 UTF-16-code-unit message cap (two units spare), but does not independently prove the cap, or whether URL auto-linking and fragment preservation have the same limit. All-ASCII base64url costs one UTF-16 unit per character. The compact prefix `dey.ci/island#` is 14 characters, leaving 498 payload characters and at most 373 encoded binary bytes; `https://dey.ci/island#` is 22 characters, leaving 490 and at most 367 bytes. A user tested pasting a full 512-character ASCII URL into Kingshot chat successfully. Kingshot chat does not make URLs clickable, so prefer `dey.ci/island#` for the in-game copy action (498 payload characters, up to 373 decoded bytes), with a full `https://` URL as the regular external sharing option. Reserve payload space for version and metadata. Actual copy/paste preservation of a scheme-less URL containing a fragment should still be checked in-game.

Never compress raw JSON or thousands of empty cells. Instead encode only placed instances plus relevant road/surface cells, with a stable versioned catalogue ID dictionary. First candidate:

1. Header: format version, board variant, flags, counts and checksum.
2. Structures: sort by location; encode small catalogue index, 12-bit grid index (0..3599), rotation (2 bits), optional variant and delta positions; run-length or varint for repeated IDs and small deltas.
3. Roads/surfaces: use 3,600-bit (450-byte) masks only if density justifies them. Sparse runs, region rectangles or a small alphabet over paths may beat a raw full-board bitmap. Encode road families separately when required.
4. Apply a deflate/brotli-style final compressor only if benchmarks show a gain; browser CompressionStream support and binary overhead need testing. Prefer a deterministic custom structural codec first, then evaluate Brotli/WASM only if savings justify cost.
5. URL-safe Base64 without padding. Validate byte length, decoded counts, catalogue IDs and bounds. Include a small corruption check. Reject untrusted oversized payloads before allocation.

Import must preserve unknown future catalogue IDs where possible, or give a precise compatibility warning. Full-fidelity larger layouts should be downloadable as a local file. Never silently truncate a shared design to meet chat length; show byte/character usage and offer export when above budget.

### Initial capacity examples (illustrative, not measured)

- A fixed 3-byte record (12-bit position, compact ID and rotation) can encode 100 objects in 300 bytes *before header and surfaces*.
- If instances need 4 bytes, a 300-byte data budget carries only 75 instances.
- A full 60 × 60 one-bit occupancy mask is 450 bytes before encoding, already too large for the chat budget; use sparsity and repeated patterns.

Create a representative corpus: empty island, a handful of buildings, dense decorative island, many roads, path-heavy layout, and a near-full island. Measure `encode -> decode` exact equality and final **URL character** count. Set the shared-chat threshold only after in-game verification.

## Test and delivery gates

- Pure tests: grid/inverse projection at boundaries, rotated footprint collision, terrain legality, undo/redo, road autotiling and invalid imports.
- Property-based/random round-trip tests for codec and deterministic serialization.
- Performance: sustained pan/pinch on a budget Android phone; report long tasks, memory, image decode and first interactive paint. Avoid claiming specific frame rates without measurements.
- Browser UI checks: 320px viewport, landscape, reduced motion, pointer cancellation, pinch during selection, browser back/forward, reload persistence, chat link import, and no accidental page scroll while manipulating the board.
- Keep this proposal in a separate file; do not change docs/research/islands files being written by the research agent.

## Decisions pending research

- Exact cactus-free playable mask and whether cleared trees have persistent impact.
- Item placement/orientation semantics, tall-sprite layering and collision dimensions.
- Which source assets may be redistributed; prefer factual datasets and licensed/original assets.
- Whether sharing needs only visible layout or also user ownership, progression and other state.
- Kingshot chat's actual clickable URL limit and behaviour with fragment identifiers.
