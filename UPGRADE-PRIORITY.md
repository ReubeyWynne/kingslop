# Upgrade priority

`upgrade-priority/` answers "what do I upgrade next?" from the shared player ledger. The Town Centre level sets the stage, the player's part in the alliance sets the order, and each step names the fact it came from. Like the Town Centre, it is a tool page outside the page ring; the ledger drawer links it.

## Shape

| Piece | Role |
| --- | --- |
| `_data/upgrade_priority.json` | Stages, unlock levels, list weights, role multipliers, pet focus per role, research focus per stage, the system-by-system ladders and their sources |
| `js/upgrade-priority.js` | Pure engine (UMD, requireable in Node): `evaluate(snapshot, { stage })` returns the stage, the saved role and the ranked actions |
| `js/upgrade-priority-page.js` | The `upgrade-priority` interaction module: paints the list, the stage rail, role buttons and dims ladder rungs for a later stage or another role |
| `js/upgrade-priority-data.liquid` | Publishes the rules as `window.UpgradePriorityData` |
| `js/upgrade-goals.js` | Pure goal engine (UMD): `evaluate(snapshot, goal)` and `all(snapshot)` return each goal's state and shortfall; `targets`, `levels` and `current` feed the editor |
| `js/upgrade-goals-page.js` | The `upgrade-goals` interaction module: the goal editor, the goal list and balances recorded in place |
| `css/priority.css` | Page hue (orchid) and layout |

The weights only order the list. They are not game numbers, and changing one never changes a cost or a stat.

## Stages

| Stage | Town Centre | What opens |
| --- | --- | --- |
| Foundation | 1–14 | Rush the Town Centre; construction and research speed |
| Hero gear | 15–21 | Hero gear at TC 15 (confirmed in game by the alliance, 24 October 2026) |
| Governor | 22–29 | Governor gear at TC 22, charms at TC 25; Embassy and Academy to 30 before Truegold |
| Truegold | 30–TG 4 | War Academy from TG 1; troop buildings within a tier of the Town Centre |
| Tempered Truegold | TG 5–TG 10 | T11 in the War Academy at its TG 5 |

A stage can be previewed without saving; the preview changes the stage only, never the save.

## Roles

`preferences.priority.role` is `lead`, `joiner` or `farm` (see [PLAYER-LEDGER.md](PLAYER-LEDGER.md)). Without a saved role the page uses `joiner` and marks it as the default. Roles scale weights (`roleWeights`): a lead raises the Command Center, widgets and the War Academy; a farm drops combat buildings and widgets, halves governor and gear steps, and researches economy.

## Steps and where they come from

Each step defers to the engine the matching page already uses, so the list never contradicts it:

- **Buildings:** `_data/buildings.json` `requires` for the Town Centre's next level. Unmet requirements are blockers (and suppress the Town Centre step); an unknown requirement asks to be recorded. From TG 1, the troop building furthest behind (at least `lagSteps` ladder steps) and, for leads, the Command Center. The War Academy is built, then raised to TG 5 for T11.
- **Heroes:** one core hero per troop type (newest generation, then rarity, then stars), and `HeroSpend.plan` over a roster holding only those core heroes, so shards are never spread across the roster.
- **Hero gear:** `HeroGear.redPlans` on the saved hero gear preferences (build profile, included troops, weights) with the ledger's pieces and bag. The first route is the step; its shortfall is listed. The profile decides which troop goes first, not a fixed rule. `HeroGear.spendable` adds the whole mastery steps the bag already pays for.
- **Governor gear and charms:** `Governor.plan` with the saved goal (`stats` or `score`) and troop focus from `preferences.governor`. Stats are weighted per troop and steps differ in cost, so infantry and archer pieces often end up about two levels above cavalry; the page never advises keeping pieces level. Unknown materials ask to be recorded rather than counting as zero.
- **Pets:** an Advance waiting at a level cap; the role's focus pet (`petFocus`) while it is below the highest pet.
- **Masters:** `MasterSpend` class unlocks and skill levels the bag pays for.
- **Research:** research is not in the ledger yet, so the step follows the stage (`research`).

Steps that spend scoring materials are marked: they score in KvK prep and Strongest Governor, and the timing section points to the Town Centre and Event Cycle counts.

## War Academy

The War Academy opens at TG 1. Its Truegold research (Truegold Battalion, then lethality and health, then attack, defence and Legionaries) leads to T11 when the War Academy itself reaches TG 5. Gold runs out before Truegold Dust in the guides' budgets, so the ladder flags it. The research tables are not in the ledger yet, so the page cannot count research levels; it only orders them.

## Sources

The order follows community guides checked on 23 October 2026, listed in `_data/upgrade_priority.json` `sources` and cited on every ladder rung. They are fan sites and often disagree; research order, early Truegold on troop buildings and pet order vary most. Where they disagree, the page follows the one that fits the role, and the numbers behind each step come from the tables the other tools already use.

## Goals

`preferences.priority.goals` (see [PLAYER-LEDGER.md](PLAYER-LEDGER.md)) holds the player's own targets: a building level (the Town Centre or any other), hero stars, a hero gear piece's level, a governor gear piece or charm level, a pet level or a master's affinity. The editor offers one goal per target, starting at the level after the one the save holds; picking the same target again replaces its level. The section `#goals` lists each with what it still needs, from the planner the matching page uses:

| Goal | Cost from | Pays with |
| --- | --- | --- |
| Building | `_data/buildings.json` through `BuildingSpend.index`: every step to the target and, recursively, every prerequisite step those rows name | Bread, wood, stone, iron, Truegold, Tempered Truegold |
| Hero stars | `HeroSpend.STAR_STEPS` | The hero's own shards, then general shards of its rarity (never for Amadeus and Helga) |
| Hero gear | `HeroGear.target` and `HeroGear.cost`, including the mastery a red level needs | Gear XP, Forgehammers, spare mythic gear, mithril |
| Governor gear, charms | `Governor.cost` | Satin, Gilded Threads, Artisan's Vision; Charm Guides and Designs |
| Pet | `PetPlan.cost`, with the Advance at the target done | Pet Food, Growth Manuals, Nutrient Potions, Promotion Medallions |
| Master | The emblem price of every class advancement on the way (`MasterSpend`'s classes) | The master's emblems, then general emblems; affinity gifts are not in the save and are not counted |

Blank is never zero. A goal whose own level the save does not hold asks for it and links the tool that records it. A balance the save does not hold leaves that line's shortfall unknown, names it, and offers an input to record it in place; the pool of general shards or emblems is asked for only when own pieces fall short. An unrecorded prerequisite building, a step past TG 8 (no published cost) or a single-source step is said, and such a goal is never called covered. States: `met`, `ready` (the bag covers it), `short`, `unknown`, `record`, `cap` (past the item's cap, such as an epic piece past 80) and `gone` (a target the site no longer lists, kept so it can be removed).

## Inventory history

The ledger keeps a silent history of confirmed inventory changes (`bh:player-history:v1`, see [PLAYER-LEDGER.md](PLAYER-LEDGER.md#inventory-history)), and the save file carries it. Nothing reads it yet. It is the base for later steps: savings rates per item and projections to the next KvK prep, which can then say when a goal's shortfall will be met.

## Checks

- `node .dsh/upgrade-priority-check.cjs`: stages, blockers, core heroes, gear and governor picks matching `HeroGear.redPlans` and `Governor.plan`, role effects, rule shapes, page wiring and every `priority.*` key in all 17 dictionaries with matching placeholders.
- `node .dsh/upgrade-goals-check.cjs`: each goal kind's shortfall against its planner, prerequisite chains, unknown levels and balances, caps, the export round trip, page wiring and every `priority.goal*` and `priority.item.*` key in all 17 dictionaries.
- `node .dsh/upgrade-priority-ui-check.cjs` (after a Jekyll build): the page in a browser, empty and filled saves, role and preview, adding, replacing and removing goals and recording a balance in place, three languages and three widths, screenshots in `.dsh/priority-preview/`.
