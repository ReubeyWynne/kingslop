# Research status

Completed 30 October 2026 for the public-site investigation and asset capture. Current-game verification gaps remain in OPEN-QUESTIONS.md. Research only; implementation planning continues separately.

## Published checkpoints

1. Created `islands` from main before investigating and committed the scope.
2. Published the 104-piece source catalogue, CSV, terrain, road rules and five game-labelled layouts.
3. Published 186 static piece images, evidence captures, the UX audit, chest coordinates and reconstructed route fixtures. Preserved the parallel engineering proposal when the branch moved during publication.
4. Added recovered road neighbour offsets, source model observations and the warning that the map's 255 values do not describe legal terrain.
5. Added five lossless atlases containing 275 tile/chest frames, a derived piece index, source provenance, integration notes, ordered evidence questions, retrieval/validation scripts and HANDOFF.md.

## Validation

- The research validator passed: 104 catalogue records, five map records, 3,479 terrain records, 55 distinct chests, 186 piece images and 275 packed frames.
- All ten road families cover all 256 neighbour masks. All rule sprite references have metadata and packed image frames.
- Source hashes, derivative file hashes, image decoding, atlas bounds and exact RGBA frame hashes passed.
- Both research helper scripts passed Python syntax compilation.
- Repository generated ASCII checks and ASCII style checks passed; no animation or product code was changed.
- Desktop site interactions and the first two one-Reservoir route steps were inspected live. Phone gestures and the source share-code round trip were not verified.

## Decisions still needing evidence

- Cactus-free board definition and exact playable mask.
- Clearing state, building gap/access rules, rotation and connection behaviour in the game.
- Current availability and unresolved English labels for catalogue entries.
- Source art reuse basis before promotion to production.
- Chest/game progression mechanics if those become later tools.

## Collaboration

Start with HANDOFF.md. The parallel proposal at docs/ISLAND-EDITOR-ENGINEERING.md was read and preserved. Research writes remain within docs/research/islands/. Keep new planning or implementation changes separate, preserve upstream work and do not rewrite branch history.
