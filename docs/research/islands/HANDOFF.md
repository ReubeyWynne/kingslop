# Handoff to the island editor work

The public island-tool research and asset capture are complete for this pass. The branch was created before investigation and updated in checkpoints. The parallel [engineering proposal](../../ISLAND-EDITOR-ENGINEERING.md) remains separate and was preserved as it changed.

## Ready to use

- 104 catalogue records, with a derived local-art index and CSV. Ten records are marked retired. Labels retain their evidence instead of silently presenting every fallback as an in-game name.
- 186 static art files: 92 icons and 94 sprites. Original source URLs, dimensions and PNG hashes are retained for full-resolution retrieval.
- Five lossless tile atlases containing 275 frames: all 271 public autotile assets plus four extra surface/chest images. Every named sprite used by the 10 road families is present. Every one of the 256 neighbour masks matches a rule in each family.
- Five game-labelled map records and an index of all 13 source templates. Companion-authored showcases were not adopted as Kingslop designs.
- Terrain records for 3,479 trees, 55 community chest coordinates and numerical examples of the source route heuristic.
- Desktop evidence captures, a catalogue contact sheet, UX findings, mechanics notes, integration notes, a provenance manifest and retrieval/validation scripts.

## The facts most likely to change implementation

1. The recovered maps do not define the cactus-free legal-placement mask. Their 3,600 values of 255 are empty role bindings. The terrain file has tree drawing records and no clearing-area groups. Keep this unresolved rather than silently declaring the board legal everywhere.
2. A building's placement limit and effect limit are different. Many source records permit unlimited placement but cap contributing effects. The source editor discards effect limits and gap flags from its live model, so it is not a validator for all the game rules in its own catalogue.
3. Facilities and surfaces occupy separate layers in the source. Road connections also use family/group compatibility and building connection points. Equal-slug adjacency is insufficient.
4. Sprite placement requires the source frame/pivot metadata. The atlas rectangles only say where pixels are stored. The 128px icons are for the palette; use the larger sprites for the board when appropriate.
5. Chest routing is an alternating nearest-target Manhattan heuristic. Its source locations are explicitly unverified. It excludes clearing effort and rewards, and opened flags do not remove chests from the route. This should not become a gameplay optimiser by changing the label.

## What to read next

| Need | File |
| --- | --- |
| Source behaviour and exact coordinate/road conventions | [MECHANICS.md](MECHANICS.md) |
| UI findings and observed workflow inventory | [UX-AUDIT.md](UX-AUDIT.md) |
| Art inventory and original-file retrieval | [ASSETS.md](ASSETS.md) |
| Existing site boundaries and integration points | [KINGSLOP-INTEGRATION.md](KINGSLOP-INTEGRATION.md) |
| Evidence needed before enforcing game rules | [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) |
| Current completion and validation record | [STATUS.md](STATUS.md) |

The first editor can use the catalogue, art and provisional grid model while the board legality and rotation rules are checked. The planning conversation owns that scope decision. This pack does not implement a page, change the player save, or replace the engineering proposal.

## Verification boundary

The source calculations, labels and geometry were recovered and checked for internal consistency. Desktop interactions were inspected live. The asset hashes, image decodes, atlas pixels, rule references and numeric fixtures pass the included validator. Current game rules, phone gestures, public-link publishing and a source share-code round trip were not independently verified.

Web search returned errors. Supplementary direct-source checks did not produce an island-specific mechanics table. The exact sources and outcomes are recorded in `data/sources.json`; `OPEN-QUESTIONS.md` names the evidence needed to close each consequential gap.
