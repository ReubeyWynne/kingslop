# Hero gear: reference mining and implementation

Inspected on 6 October 2026, against reference version 1.15.0 (14 September 2026).
Requested URL `https://kingshotoptimiser.com/hero-gear/` returned HTTP 502. The
matching live tool is `https://kingshotoptimizer.com/hero-gear/`.

## What was inspected

| Source | Information extracted |
| --- | --- |
| [Hero Gear](https://kingshotoptimizer.com/hero-gear/) | Resource inputs, twelve slots, presets, exclusions, build profiles, optimise/plan modes, reforge and near-miss analysis |
| [XP costs](https://kingshotoptimizer.com/hero-gear/references/xp-costs/) | Incremental and cumulative enhancement costs, epic/mythic/red limits |
| [Forgehammer costs](https://kingshotoptimizer.com/hero-gear/references/forgehammer-costs/) | Mastery costs and consumed mythic pieces |
| [Imbuement costs](https://kingshotoptimizer.com/hero-gear/references/imbuement-costs/) | Ascension, mastery gates, mithril, consumed mythic pieces, expedition/conquest bonuses |
| [How it works](https://kingshotoptimizer.com/hero-gear/how-it-works/) | Weighted stat score, coupled resource allocation, bundled milestone jumps, irreversible resources |
| `/assets/app-DS55M3Wa.js` | Full 201-entry incremental XP table, cumulative mastery formula, profile weights, resource conversion values, slot names, storage model, API boundary |
| `/assets/HeroGearTool-tYjmyNhH.js` | UI orchestration, reforge eligibility, result application, near-miss request, server-based optimisation |
| `/assets/calculator-BwOX7yob.js` | Cost arithmetic, ascension and milestone charges, enhancement caps from mastery |
| `/assets/stat-formulas-Cp_lGYd6.js` | Quality base stats and enhancement slopes |
| `/assets/HeroGearImbuementTable.vue_vue_type_script_setup_true_lang-C4b3cShT.js` | Slot-specific milestone bonuses |

These are public browser assets, not the game client's internal data. This is
reference mining, not a claim of independently datamining the game itself.
The reference site's original code and prose are not included in this repository.
The engine, search, interface and gear screenshot parser are new implementations;
game cost values and profile weights are attributed to the reference above.

## Mechanical data

There are four transferable pieces per troop type: helm and boots grant lethality;
gloves and chest grant health. The planner tracks one set for Infantry, Cavalry and
Archer. Exclusive hero widgets are a different progression system.

| Quality | Enhancement levels | Core stat before mastery |
| --- | --- | --- |
| Epic | 0–80 | `9 + 0.21 × level` percent |
| Mythic | 0–100 | `15 + 0.35 × level` percent |
| Red | 100–200 | `50 + 0.5 × (level − 100)` percent |

Mastery multiplies the core stat by `1 + 0.1 × mastery`. Each mastery level `m`
costs `10 × m` Forgehammers. Above mastery 10, it additionally costs `m − 10`
spare mythic pieces. Cumulative mastery 0→10 is 550 hammers; 0→20 is 2,100
hammers and 55 mythic pieces.

| Target | Required mastery | Mithril at this step | Mythic pieces at this step |
| --- | --- | --- | --- |
| Red ascension | 10 | 0 | 2 |
| Red +20 / level 120 | 11 | 10 | 3 |
| Red +40 / level 140 | 12 | 20 | 5 |
| Red +60 / level 160 | 13 | 30 | 5 |
| Red +80 / level 180 | 14 | 40 | 10 |
| Red +100 / level 200 | 15 | 50 | 10 |

Mastery costs are **additional** to this table. For example, mythic level 100 /
mastery 10 → red +20 / mastery 11 costs 52,650 XP, 110 hammers, **6** mythic
pieces (2 ascension + 1 mastery + 3 imbuement), and 10 mithril.
Red +20 / mastery 11 → red +40 / mastery 12 costs 74,100 XP, 120 hammers,
7 mythic pieces and 20 mithril.

XP checkpoints: level 80 = 34,820; 100 = 73,320; 120 = 125,970;
140 = 200,070; 160 = 293,170; 180 = 414,770; 200 = 574,370.
The public table charges zero XP at 101 and at imbuement levels
120/140/160/180/200. The planner explicitly tracks red quality at level 100,
so ascension is charged once even before the first red enhancement.
This convention matches the published browser cost table; verify the displayed
level convention on real in-game screenshots when testing imports.

Milestone expedition bonuses are separate from mastery: helm/chest receive
attack +20 at 120, defence +30 at 160 and attack +50 at 200; gloves/boots
receive defence +20, attack +30 and defence +50. Levels 140 and 180 also grant
conquest bonuses, which the expedition optimisation score excludes.

## Profiles and search

Weights are `[lethality, health]` per troop, sourced from the public profile data.
They express user priorities, not predicted damage percentages.

| Profile | Infantry | Cavalry | Archer |
| --- | --- | --- | --- |
| Early growth | 0.7, 1.5 | 0.4, 0.2 | 1.4, 0.7 |
| Early combat | 0.7, 1.5 | 1.2, 0.4 | 1.3, 0.6 |
| Generation 4+ | 1.1, 1.5 | 1.2, 0.4 | 1.2, 0.6 |
| Equal stats | 1, 1 | 1, 1 | 1, 1 |

The reference optimiser is server-backed: the browser posts heroes, resource
budgets, settings and weights; it does not publish the complete optimisation
implementation. Our static site uses an independent deterministic search in a
worker. It evaluates incremental XP, mastery, paired XP/mastery changes and
bundled red milestones including prerequisite mastery. It runs three resource
cost sensitivity passes and retains the highest weighted score. When XP reforge
is enabled, it also compares against the keep-current-XP paths. Excluded troop
sets are untouched. Mastery never decreases; red gear is not reforged. The score
adds weighted health/lethality and expedition attack/defence milestones.

This is a heuristic with exact cost arithmetic. It is not guaranteed to find a
global optimum or reproduce the reference recommendations. We do not call their
optimisation service. Town-center/server-age restrictions, named build slots,
extra marches, purchase simulation and the reference near-miss API are outside
this first implementation. Calculations assume the relevant gear system is
unlocked and count whole levels; partial XP already invested is not subtracted.

## Visual interface and artwork

The forge uses four illustrated gear tiles with enhancement/mastery readouts.
Tapping a tile opens its editing dialog; desktop keeps the upgrade ledger next
to the grid. Mobile switches between Gear and Plan rather than stacking the
editor and all results. Resource rows show exact costs, saved quantities,
shortfalls and individual progress bars. An affordable milestone can be marked
done with resource subtraction and one-step undo. The chosen mobile view is
saved alongside the existing ledger, with backward-compatible defaults.

Game gear/resource artwork is served locally; no generated assets are
included. `img/hero-gear/SOURCES.md` lists the original URLs and lossless
conversion details. The surrounding interface retains the site's fonts, flat
surfaces, hairline rules and restrained signal colour.

## Screenshot import and local state

The simulator's existing `js/ocr-worker.js` supplies PaddleOCR words and polygons
using the existing self-hosted models. A new parser reads gear detail screenshots,
recognising English level/mastery labels and slot aliases. A review dialog allows
troop/slot/quality assignment and numeric correction for each image. Unknown
values preserve saved inputs. Duplicate target slots and incompatible
quality/level combinations are rejected. No values apply before review.

The initial import supports detail screenshots, not an automatic four-icon hero
overview parser. Icon-only mastery numbers and non-English labels may need manual
entry. Real in-game screenshots were not supplied for accuracy validation.
The UI integration test stubs OCR word delivery; parser fixtures match the real
worker's `poly` item format. The recognition engine itself is reused unchanged.

Only the structured ledger is saved in `localStorage['bh:hero-gear:v1']`.
Screenshots remain on-device, and temporary preview URLs are revoked on close.
Resources, twelve pieces, exclusions, priorities, mode, mobile view, selected piece, targets,
reforge choice and XP-part counts persist. Unavailable storage is reported;
JSON export/import provides a fallback. Applying an upgrade plan updates local
levels and subtracts its resource costs; reset, import and apply offer one-step
undo during the session. There is no account, server persistence or screenshot
upload service.

## Verification

`node .dsh/hero-gear-check.cjs` checks cumulative checkpoints, complete milestone
costs, mastery gates, exclusions, 40 search budget-conservation cases, parser
fixtures, and dictionary coverage. `node .dsh/hero-gear-visual-check.cjs` checks
the rendered UI, local persistence, worker search, application/undo, review flow,
five screen widths and seventeen language layouts. New tool copy is in the
English dictionary; untranslated keys use the existing English fallback.
The sixteen new navigation translations are AI-pass and need native review.

The local environment has no Ruby/Jekyll installation. A temporary LiquidJS
renderer is used only for local UI checks. The repository's GitHub Actions
Jekyll build is the authoritative production-template build.
