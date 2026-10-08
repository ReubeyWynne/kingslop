# Product roadmap — unified player state, heroes, governor progression

**Status:** committed direction  
**Scope:** Kingshot, Demystified static site  
**Last grounded:** 2026-10-08

## Product direction

The site needs one cohesive player experience, not a collection of calculators with similar-looking forms. The existing hero-gear tool becomes a first-class consumer of the player inventory: its resources, gear state and screenshot imports are part of the same local player ledger used by events and future governor tools.

Interaction code should move toward a declarative, HTML-led style inspired by hypertext/HTMX/Alpine/Datastar—not a new framework dependency and not server rendering. Static HTML remains the source of truth; small JavaScript modules discover explicit attributes, react to events and update bounded DOM regions. A page should compose capabilities instead of accumulating another large page controller.

## Repo reality

This roadmap extends the current site; it does not propose a new application.

- The site is a static Jekyll/GitHub Pages tool suite. Pages and their navigation are described by `_data/nav.json` and `_data/pages.json`; shared page behaviour lives in `js/common.js`.
- Hero data already exists in `_data/heroes.json`.
- `hero-gear/` is the established optimiser pattern: resource inputs, a saved local ledger, JSON export/import, an upgrade engine (`js/hero-gear-engine.js`) and screenshot import (`js/hero-gear-ocr.js` + `js/ocr-worker.js`).
- `events/` and `js/kvk.js` already model the 28-day cycle, KvK prep, Strongest Governor, Alliance Brawl and their point-bearing items. Governor gear and governor charms are already recognised as scoring actions, but the page does not know a player's holdings.
- The repository is deliberately client-side. Player data must remain local-first; there is no server account or shared database to introduce.

The product gap is a **shared, versioned player ledger** and a **small declarative UI layer**. All player-facing tools read and write the same state through explicit modules.

## Delivery order

| Milestone | Deliverable | Repo-native implementation | Done when |
|---|---|---|---|
| 1. Unified player ledger | One local player state for inventory, hero gear, governor equipment and import history | New store module under `js/`; versioned schema; migration from the current hero-gear save; shared export/import | Existing hero-gear users retain their state, manual edits survive reload, and every tool sees the same confirmed balances |
| 2. Shared interaction layer | Attribute-led modules and common UI contracts | Evolve `js/common.js` into a module discovery/event boundary; use page markup to declare controllers, actions, bindings and targets | A new tool can compose state, import, disclosure and result modules without another monolithic page script |
| 3. Event availability calculator | Personal available-point totals for KvK Prep, Strongest Governor and Brawl | Extract the hard-coded event mapping in `js/kvk.js` into a reusable rules module and bind it to the ledger | A player can see spendable points by event/day, the inventory actions behind them, and target shortfall |
| 4. Hero directory | Searchable hero reference plus role explainers | New `heroes/` page using `_data/heroes.json`; companion role metadata keyed by hero ID | Every hero is filterable by generation/troop; role explainers cover garrison lead, joiner, offensive/rally lead and Bear Hunt |
| 5. Governor gear + charms optimiser | Governor-progression planner integrated with inventory and events | New `governor-gear/` page plus dedicated engine and ledger adapters; reuse shared components and interaction patterns | Given current state, resources and objective, the tool returns an explainable plan and its event-point consequence |
| 6. Screenshot import | Multi-layout screenshot import into the same ledger | Generalise the existing browser-side worker/OCR approach; screenshot-type adapters for backpack, hero gear and governor views | Imports produce a reviewable delta, corrections are retained, and duplicate uploads cannot inflate balances |
| 7. Cross-event planning | Spend-now versus reserve decisions | Reservation rules and what-if allocation view built on the common event rules and ledger | A player can reserve items for a KvK/SG target and see what remains safe to spend elsewhere |

## Milestone 1 — unified player ledger

**Implementation:** shared ledger and hero-gear integration are prepared for review. `js/player-ledger.js` owns versioned inventory, equipment facts, preferences and confirmed import history. Legacy saves are migrated without deleting the original; hero gear reads/writes shared balances, exports the whole player save, accepts both save formats and observes cross-tab changes. Governor sections remain explicitly unsupported. See [PLAYER-LEDGER.md](PLAYER-LEDGER.md) for the contract, recovery behaviour and checks. The next deliverable is milestone 2's shared interaction layer.


Define the data contract before adding more screens. It should include:

- Schema version and update timestamp.
- Inventory balances keyed by stable item identifiers, not display labels.
- Hero-gear state: each piece, enhancement/mastery state and upgrade resources.
- Governor gear and charm state as separate typed sections.
- Import records: source type, timestamp, item delta, content hash and confirmation state.
- Provenance for manual versus screenshot-derived values.
- Explicit unknown/unsupported states. An unreadable item is never zero.

The current hero-gear save is an input to a one-time, reversible migration. Hero gear must no longer remain a separate local island: its resource bag reads from the ledger and its save/export controls operate on the unified player state. Keep hero-gear-specific optimisation preferences separate from inventory facts.

The ledger stays local to the browser. Export/import ships with it from day one.

## Milestone 2 — declarative interaction architecture

Use a small DOM-oriented convention, not an SPA framework and not a generic virtual DOM.

- HTML declares module roots (`data-module`), actions (`data-action`), targets (`data-target`) and state/binding keys (`data-bind` or equivalent).
- Modules are narrowly scoped: ledger form, resource field, import review, result panel, tabs, optimisation run, and so on.
- Modules communicate through named browser events and the shared store—not direct calls between page-sized scripts.
- Each action updates a bounded target region and emits a semantic event; another tool can listen without importing its controller.
- The static page remains meaningful before enhancement. JavaScript adds persistence, calculation, import and live results.
- Keep domain logic pure and separate from DOM wiring, following the existing `hero-gear-engine.js` pattern.

The goal is an HTMX/Alpine/Datastar *feel*: inspectable markup, local behaviour and composable fragments—while remaining compatible with the static GitHub Pages deployment.

## Milestone 3 — event calculator

`js/kvk.js` already contains the useful domain foundation: the 28-day cycle, day-specific Strongest Governor tasks, Brawl/Officer/Armament runs, KvK prep matrix and normalised tracked item labels. Extract those rules without changing their current output first.

The calculator must distinguish:

- **Available now:** confirmed ledger inventory.
- **Eligible today:** items that score in the selected event/day.
- **Reserved:** confirmed inventory withheld for another target.
- **Potential but unquantified:** building, research, training or score-change actions where the ledger cannot safely infer capacity.

The first release is arithmetic, not an optimiser: totals by event and a target shortfall. Allocation optimisation belongs only in milestone 7 once overlap and reserve semantics are proven.

## Milestone 4 — hero directory

The existing `_data/heroes.json` is the canonical hero catalogue. Extend it or add a companion role map keyed by hero ID; do not create a second hero list.

Directory content must separate **role explanation** from **hero recommendation**:

- Explain what the role contributes, when it matters and who supplies the relevant skill.
- Label lead, joiner, defence/garrison, rally/offence and Bear Hunt guidance.
- Filter recommendations by generation/server context and troop type.
- State alternatives and confidence/source status where evidence is incomplete.

This ships as a directory first. Per-hero deep pages are optional follow-up work.

## Milestone 5 — governor gear and charms

Governor progression deserves its own domain model. Hero-gear levels, mastery, parts and mithril cannot be repurposed as governor gear/charm facts. It should nevertheless feel like the same product:

- a ledger-backed resource view;
- editable current state;
- profile/objective selection;
- an explainable upgrade path, never a black-box score;
- shared import/review, reset and export affordances;
- the same module/action/binding vocabulary as hero gear and events.

Objectives include event points, garrison/defence, offensive/rally use and general progression. Each recommendation shows required resources, known governor score/stat effect and event opportunity cost.

Do not present unverified governor costs, charm tables or combat weights as exact. Add them only with a cited source and data version.

## Milestone 6 — screenshot import

The hero-gear screenshot importer proves that client-side import is viable, but its gear-tile detection is specialised. Preserve it as an adapter while building a generic import shell.

Every adapter follows the same pipeline:

1. Identify a supported screenshot layout.
2. Detect item tiles and capture icon/count regions.
3. Match against a controlled item catalogue and parse counts.
4. Attach confidence per row and display the source crop.
5. Review a delta against the unified ledger; apply only confirmed rows.
6. Record a content hash and import record to prevent duplication.

Start with one stable backpack screen and the high-value event items already tracked in `js/kvk.js`, then governor materials. Add hero-gear and governor screen adapters behind the same review UI. Expand formats only after errors are recoverable.

## Cohesion rules

- **One player state:** no tool owns a private copy of inventory facts.
- **One import experience:** source selection, confidence, review, undo and history work consistently everywhere.
- **One interaction grammar:** the same attributes, events, target updates and status messaging work across the site.
- **One visual language:** `DESIGN.md` remains binding—mobile-first, manuscript grammar, one signal hue per page and no SaaS-card treatment.
- **One integration checklist:** a new top-level page updates static navigation, footer/home card order, swipe/keyboard chain and the existing i18n propagation requirements together.

## Explicit non-goals

- No login, backend database or automatic cloud sync.
- No silent OCR writes.
- No “best hero” or governor recommendation that ignores role, generation and uncertainty.
- No duplicated event-point tables per page.
- No arbitrary numeric data: gameplay costs and point rules stay grounded or are labelled unsupported.

## Sequencing rationale

The unified ledger is first because it makes hero gear, manual inventory and event calculations mutually useful from the outset. The declarative layer immediately afterwards prevents every new page from becoming another large imperative script. The hero directory is a content/data extension of assets already present. Governor optimisation then reuses the same ledger and interaction grammar. Screenshot import remains later because it is the least reliable input path and needs the review and provenance infrastructure already in place.

