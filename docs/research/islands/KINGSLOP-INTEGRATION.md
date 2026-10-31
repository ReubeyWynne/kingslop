# Kingslop integration notes

These notes describe the repository at the branch base, `30c98e5`, and the parallel [editor engineering proposal](../../ISLAND-EDITOR-ENGINEERING.md) inspected on 30 October 2026. Recheck the current files before implementation because other work is active.

## Existing entry points

| Concern | Existing files | Reuse or extension |
| --- | --- | --- |
| Page layout and asset loading | `_layouts/page.html`, `_includes/head.html`, `_data/pages.json` | Add island-specific scripts, styles and data through the existing page configuration |
| Navigation and home deck | `_data/nav.json`, `_data/pages.json`, `js/page-deck.js` | Add the island page through the existing page/deck model |
| Interaction modules | `INTERACTIONS.md`, `js/interactions.js`, `js/player-modules.js` | Native controls with explicit `data-module`, `data-action`, `data-target` contracts |
| Shared player state | `js/player-ledger.js` | Add an explicit schema extension if island ownership becomes confirmed player data; do not add arbitrary bindings |
| Imported/shared copies | Store selection described in `INTERACTIONS.md` | Keep a viewed or edited shared design separate from the player's persistent save until they choose to adopt it |
| Save import/export | `save-transfer` capability in `js/player-modules.js` | Preserve validation, revision checks and undo behaviour if this becomes part of whole-player state |
| Kingdom progression | `js/kingdom-progression.js`, `_data/kingdom_progression.json` | Reuse shared kingdom context only when island unlock rules are verified |
| Localisation | `i18n/en.js`, the other dictionaries, `_data/langs.json` | Translate UI copy using existing conventions; source English catalogue labels need separate name provenance |
| Disclosures and links | `js/deep-link.js`, `INTERACTIONS.md` | Stable IDs and `data-deep-link`; avoid a page-specific hash handler that conflicts with a future design share payload |
| Game art sourcing | Existing `img/` hierarchy and source notes elsewhere in the repo | Review research art before promoting a selected subset to production |
| Visual and motion rules | `DESIGN.md`, `AGENTS.md`, `css/ascii.css`, `.dsh/build-ascii.py` | Follow the existing palette, mobile layout and generated ASCII animation workflow |

## Boundaries worth keeping

Use integer grid state and pure placement operations independently of the renderer. The specialised editor can use a canvas while labels, search, filters, inspector fields, save actions and reference tables remain semantic HTML. Avoid a board made from 3,600 interactive DOM controls.

The existing site uses classic scripts and an explicit module registry. The engineering proposal suggests internal ES modules. Resolve that loading boundary during implementation rather than replacing the site-wide interaction system as part of an island feature.

A layout is a proposed arrangement. Ownership is a confirmed player fact. A clearing state is progression. A legal-placement mask is a game rule. These four things should not overwrite each other through a shared import or a decorative template.

The source's `cells_rle` field is a role-binding map, not a terrain mask. A proposed chat codec should encode the Kingslop layout model, not assume that copying this field carries legal terrain state. The engineering proposal already owns chat limits and codec design; this research does not change those decisions.

## Asset loading

Use the supplied 128px icon derivatives for a compact catalogue and fetch large sprites only when needed. The research manifest preserves full-resolution source URLs and original hashes. A complete source catalogue is not an instruction to preload it.

The road rules need their corresponding recovered road/water/hedge/fence images, including pivots and frame dimensions. The atlas metadata supplied with this research preserves each image's original dimensions and its packed rectangle. Packing pixels does not replace the placement metadata in `garden_road_rules.json`.

The source's animated WebP references are recorded for provenance. They do not authorise adding animated game sprites to Kingslop. Any authored island animation still follows `AGENTS.md`; this research adds no running animation.

## Implementation verification

Before enforcing game legality, resolve the board mask, orientation and collision gaps in `OPEN-QUESTIONS.md`. Then use representative small and dense layouts to check collision behaviour, layer ordering, undo, reload and codec fidelity. Validate actual phone gestures and image decode cost. Do not infer phone usability or frame rate from the desktop screenshots in this pack.

The research validator checks data and artifact integrity only. Product browser checks and any applicable repository checks belong to the implementation change.
