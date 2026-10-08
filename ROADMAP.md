# Product roadmap — player state, heroes, governor progression

**Status:** committed direction  
**Scope:** Kingshot, Demystified static site  
**Last grounded:** 2026-10-08

## Repo reality

This roadmap extends the current site; it does not propose a new application.

- The site is a static Jekyll/GitHub Pages tool suite. Pages and their navigation are described by `_data/nav.json` and `_data/pages.json`; shared page behaviour lives in `js/common.js`.
- Hero data already exists in `_data/heroes.json`.
- `hero-gear/` is the established optimiser pattern: resource inputs, a saved local ledger, JSON export/import, an upgrade engine (`js/hero-gear-engine.js`) and screenshot import (`js/hero-gear-ocr.js` + `js/ocr-worker.js`).
- `events/` and `js/kvk.js` already model the 28-day cycle, KvK prep, Strongest Governor, Alliance Brawl and their point-bearing items. Governor gear and governor charms are already recognised as scoring actions, but the page does not know a player's holdings.
- The repository is deliberately client-side. Player data must remain local-first; there is no server account or shared database to introduce.

The product gap is therefore a **shared, versioned player ledger**. New tools read it; no page becomes another disconnected calculator.

## Delivery order

| Milestone | Deliverable | Repo-native implementation | Done when |
|---|---|---|---|
| 1. Shared player ledger | One local player state for inventory, governor equipment and import history | New small store module under `js/`; versioned schema; migration guard; JSON export/import compatible with the hero-gear ledger | Manual edits survive reload, can be exported/restored, and a corrupt or older save cannot silently overwrite good data |
| 2. Event availability calculator | Personal “available points” totals for KvK Prep, Strongest Governor and Brawl | Refactor the hard-coded event mapping in `js/kvk.js` into a reusable rules module; bind it to the ledger; retain the existing day/cycle UI | A player can see spendable points by event/day, the inventory actions behind them, and the shortfall to a chosen target |
| 3. Hero directory | Searchable hero reference plus role explainers | New `heroes/` page using `_data/heroes.json`; add role metadata rather than duplicating hero facts; follow the existing page/layout/i18n/nav conventions | Every hero is filterable by generation and troop; role pages explain garrison lead, joiner, offensive/rally lead and Bear Hunt with assumptions and substitutions |
| 4. Governor gear + charms optimiser | A separate governor-progression planner | New `governor-gear/` page and dedicated engine; reuse the interaction contract of `hero-gear/` (resource bag, current state, plan, manual correction, save/export/import), not its hero-gear maths | Given current gear/charm state, materials and an objective, the tool returns a ranked next-action plan and its event-point consequence |
| 5. Backpack screenshot import | Multi-screenshot import into the player ledger | New generic inventory-import flow using the existing browser-side worker/OCR approach; screenshot-type detection, item recognition, confidence and review before apply | Multiple supported backpack screenshots produce a reviewable delta; users can reject/correct rows; duplicate uploads do not inflate counts |
| 6. Cross-event planning | “Spend now vs reserve” decisions | Extend the event calculator with reservation rules and a what-if allocation view | A player can reserve items for a specified KvK/SG target and see what remains safe to spend in Brawl or other active events |

## Milestone 1 — shared player ledger

Define the data contract before adding more screens. It should include:

- Schema version and update timestamp.
- Inventory balances keyed by stable item identifiers, not display labels.
- Governor gear and charm state as separate typed sections.
- Import records: source type, timestamp, item delta, content hash and whether the user confirmed it.
- A minimal provenance field for manual versus screenshot-derived values.
- Explicit unknown/unsupported states. Do not treat an unreadable item as zero.

Keep the ledger local to the browser, as the existing hero-gear planner does. Provide export/import from day one. Cross-tool sharing must go through the ledger; hero gear can remain a distinct saved model until a deliberate migration is warranted.

## Milestone 2 — event calculator

`js/kvk.js` already contains the useful domain foundation: the 28-day cycle, day-specific Strongest Governor tasks, Brawl/Officer/Armament runs, KvK prep matrix, and normalised tracked item labels. Extract those rules without changing their current output first.

The calculator must distinguish:

- **Available now:** points represented by confirmed ledger inventory.
- **Eligible today:** items that score in the currently selected event/day.
- **Reserved:** confirmed inventory withheld for another target.
- **Potential but unquantified:** actions such as building, research, training or gear-score changes where the ledger cannot safely infer capacity.

The first release is arithmetic, not an optimiser: totals by event and a target shortfall. Allocation optimisation belongs only in milestone 6 once item overlap and reserve semantics are proven.

## Milestone 3 — hero directory

The existing `_data/heroes.json` is the canonical hero catalogue. Extend it or add a companion role map keyed by hero ID; do not create a second hero list.

Directory content must separate **role explanation** from **hero recommendation**:

- Explain what the role contributes, when it matters, and who supplies the relevant skill.
- Label whether advice is for lead, joiner, defence/garrison, rally/offence or Bear Hunt.
- Filter recommendations by generation/server context and troop type.
- State alternatives and confidence/source status where the evidence is incomplete.

This ships as a directory first. Per-hero deep pages are optional follow-up work, not a prerequisite.

## Milestone 4 — governor gear and charms

Governor progression deserves its own model. Hero-gear levels, mastery, parts and mithril cannot be repurposed as governor gear/charm data.

Adopt the parts of the current hero-gear experience that users already understand:

- resource entry and visible totals;
- editable current state;
- profile/objective selection;
- an explainable upgrade path rather than a black-box score;
- local save, reset, export/import and screenshot-assisted entry.

Objectives should include at minimum event points, garrison/defence, offensive/rally use and general progression. Each recommendation must show its required resources, resulting governor score/stat effect where known, and whether it consumes items valuable in a scheduled event.

Do not present unverified governor costs, charm tables or combat weights as exact. Add them only with a cited source and a data version.

## Milestone 5 — screenshot import

The hero-gear screenshot importer proves the approach, but it is specialised to gear tiles and must not be stretched into backpack recognition.

Build inventory import as a pipeline:

1. Identify a supported screenshot layout.
2. Detect item tiles and capture icon/count regions.
3. Match to a controlled item catalogue and parse counts.
4. Attach confidence per row and show the source crop.
5. Review a delta against the ledger; apply only confirmed rows.
6. Record a content hash and import record to prevent accidental duplication.

Start with one stable backpack screen and a small, high-value item catalogue: the event-tracked items already in `js/kvk.js`, then governor materials. Expand formats only after the review UI makes mistakes recoverable.

## Navigation, localisation and visual rules

Any new top-level page must update the static navigation, footer/home card order and swipe/keyboard chain together; the current navigation proposal identifies these as separate integration points. New text follows the repository’s existing i18n propagation rules. New UI follows `DESIGN.md`: mobile-first, manuscript grammar, a single signal hue per page and no SaaS-card treatment.

## Explicit non-goals

- No login, backend database or automatic cloud sync.
- No silent OCR writes.
- No “best hero” or governor recommendation that ignores role, generation and uncertainty.
- No duplicated event points tables per page.
- No arbitrary numeric data: gameplay costs and point rules stay grounded or are labelled unsupported.

## Sequencing rationale

The shared ledger and event calculator are first because they turn the existing event rules into personalised answers immediately, even with manual entry. The hero directory is largely a content/data extension of assets already present. Governor optimisation then shares a proven planner interaction model. Screenshot import is deliberately later: it is valuable, but it is the least reliable input path and should feed a ledger and review process that already exist.
