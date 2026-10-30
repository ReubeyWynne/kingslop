# Research status

Updated 30 October 2026. Investigation in progress. This branch contains research, not the planned Kingslop page.

## Published checkpoint

- Branch created first from main; scope published immediately.
- Inspected the live island editor and its tutorial through browser accessibility.
- Recovered the public release asset manifest (1,925 assets) and island factual datasets.
- Published the 104-piece catalogue, CSV index, terrain reference, road connection rules and five game-labelled map records.
- Eight Companion-authored showcase layouts are indexed, not copied as Kingslop templates.

## Important findings for planning now

- This page is a spatial editor with a 60 × 60 island, not primarily an upgrade optimiser.
- The catalogue has 87 building records plus 17 surface/decoration records. Do not read that as 87 currently obtainable buildings.
- Separate build limits from effect limits. The browser displays unlimited placement for many buildings despite an effect limit of one.
- Catalogue fields include names, geometry, build/effect limits and base prosperity. They do not include per-level upgrade costs or complete buff tables.
- The terrain source explicitly calls drawing scale and offset approximate. Its area_groups is empty. Do not derive clearing costs from its tree tiers without another source.
- Chest-route progress is described by the live tutorial as session-only and separate from the saved layout.
- Web search is returning errors in this session; independent mechanics verification remains open.

## Second checkpoint

- Added MECHANICS.md with coordinate conversions, route behaviour, confidence levels and missing game rules.
- Added UX-AUDIT.md with observed workflows and questions for the Kingslop design.
- Extracted 55 chest coordinate pairs and reconstructed one/two-Reservoir route fixtures.
- Collected 186 static images (92 icons and 94 sprites), with original URLs and hashes. Review copies are WebP, bounded to 128px icons and 512px sprites.
- Captured chest-route and generator screenshots, plus a contact sheet of 91 active catalogue entries with available icons.
- Public share links require sign-in. Code sharing is offered without sign-in; a clipboard payload could not be recovered in this browser, so import/export interoperability is not verified.

## Third checkpoint

- Preserved the parallel editor engineering proposal while publishing the second checkpoint.
- Recovered road neighbour bit offsets and source matching rules.
- Important for the cactus-free editor: all five game-labelled maps use 3,600 cells of value 255 for an empty role-binding grid. This is not a legal-placement mask. No cactus-specific restriction was recovered.
- The source importer discards effect limits, prosperity and gap flags from its live model. Do not assume the source enforces every field in its catalogue.

## Next work

Finish supplementary-source checks, asset verification and retrieval helpers, Kingslop integration notes, and a concise handoff with the unresolved gameplay questions.

## Collaboration

Read README.md and this file first. Planning can proceed alongside this work. Preserve unrelated commits; all research edits remain within docs/research/islands/.
