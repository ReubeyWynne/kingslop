# Town Centre

`town-centre/` is one view over the whole shared player ledger: event items, speedups, resources, hero gear and governor gear and charms, building levels, troop training, plus the KvK prep, Strongest Governor and Alliance Brawl points that inventory can score. Every value is an ordinary inventory balance or a typed ledger section (building levels are `buildings.levels` and training facts are `training.facts`, see `PLAYER-LEDGER.md`), so hero gear, governor gear and events see each edit.

It is not an event page, so it is not in the page ring: no deck card, no cover animation and no swipe neighbours. The deck has one fixed Town Centre button beside close, and the ledger lists it under the tools. The inventory comes first and the points it can score follow.

## Inventory

Every shelf is a grid of tiles painted from the ledger; tapping one opens a single edit dialog (`town-inventory`), so the page has no blocks of bare fields.

| Shelf | Ledger | Edited as |
| --- | --- | --- |
| Bag | `inventory[id]` for every `_data/event_rules.json` item | count |
| Speedups | `inventory['speedup-{kind}']` in minutes; kinds `general`, `construction`, `research`, `training`, `learning`, `healing` | days, hours, minutes |
| Resources | `inventory.bread`, `wood`, `stone`, `iron` | count |
| Buildings | `buildings.levels` for the nine buildings in `_data/buildings.json`, plus `inventory.truegold` and `tempered-truegold` | a level picker with − and + steppers, written through `setBuilding` |
| Troops | `training.facts`: training speed (%), training capacity (troops per batch in one camp) and the highest tier each camp trains (`inf`, `cav`, `arc`, T1–T11); `preferences.training.buff` for the 3,000-gem capacity buff | a number for speed and capacity, a tier picker per camp, written through `setTraining`; the buff is a switch on the shelf, written through `setTrainingBuff` |
| Heroes | `heroes.roster` and hero shards: the Heroes page roster itself (`_includes/heroes/roster.html` and the `hero-directory` module), without its shard bag, which is on the Bag shelf | the hero's "Your copy" form, written through `setHero` |
| Hero gear | `heroGear.pieces`: one set of four (helm, gloves, chest, boots) per troop type, behind troop tabs; plus gear XP, spare mythic gear, Forgehammers and Mithril | quality chips and level/mastery steppers, written through `writeHeroGear` |
| Governor | `governorGear` (one set of six for the account) and `governorCharms` (three per piece), laid out as the in-game governor profile; plus the five materials | gear and charm steppers, written through `setGovernor` |

Hero gear and governor gear are separate sections and never share a model: hero gear belongs to a troop type, governor gear to the account. Blank is unknown and zero is a confirmed zero, as everywhere else. A hero gear piece cannot be returned to unknown here, because the hero gear adapter has no delete.

## Points

`js/town-centre-engine.js` is pure and requireable in Node. It reads every rate from the event rules rows rather than copying them:

- **Items:** `EventRules.calculate` for the day.
- **Speedups:** rows whose label names speedups. Minutes × the row's rate. General speedups count on every speedup row; healing only on rows that take every kind (“all kinds” or a bare “1 min speedups”). Each kind counts once per day.
- **Governor score:** “Governor Gear/Charm max score +1” rows. The score gain is `Governor.plan(kind, levels, materials, { goal: 'score' })`, the same greedy planner as the governor page, × the row's rate. Unknown levels or materials make it unknown.
- **Hero shards and widgets:** `js/hero-spend.js` (`HeroSpend.plan`) counts only the pieces owned heroes can consume, and `HeroSpend.budget` hands that count to `EventRules.calculate` in place of the raw balance. See the Heroes page section of `HERO-DIRECTORY.md`; both pages use the same plan.
- **Forgehammers and mithril:** `HeroGear.spendable` (in `js/hero-gear-engine.js`) plans what the saved hero gear can take: whole mastery steps up to 20 (never on epic gear) and red milestone imbuements, each paid with the XP, hammers and spare mythic gear it needs, mithril routes first. Only those amounts score. No saved pieces, or unknown XP or spare mythic gear, count as nothing and are listed. The hero gear page's KvK section shows the same figure.
- **Truegold and Tempered Truegold:** `js/building-spend.js` (`BuildingSpend.plan`) upgrades the recorded buildings one whole step at a time, cheapest Truegold first, paying every resource the step lists and only once its Town Centre level and named prerequisites (Embassy, troop building, Academy) are met in the plan. Only the Truegold and Tempered Truegold those steps consume score. An unset building or an uncounted resource counts as nothing and is listed; a prerequisite on an unset building blocks the step. Prerequisites on buildings outside the table (Sawmill, Houses, Hero Hall and so on) are assumed met. Costs stop at TG 8, so a building at TG 8 lists "costs past TG 8" as not counted. Saul's resource discount is not applied, so the plan never overstates what resources can pay for.
- **Troops:** `js/troop-spend.js` (`TroopSpend.plan`) scores the days with troop rows. Each tier's rate is that day's "T{n} troop" row, or for a tier the row does not name (KvK prep T1–T3, Strongest Governor's "T10 → T1" row) the KvK or Strongest Governor rate both sources in `_data/troops.json` give. Each camp with a tier set adds one batch at your capacity (three times it with the buff), trained before the day without speedups and collected on it. Then training speedups, then general speedups, train troops on the day in the camps that score most per second of speedup, at `seconds × 100 / (100 + speed)` a troop; capacity does not limit these, so the buff adds nothing on the day. Every troop is paid from the resources the building plan leaves, the batch first. An unset fact or uncounted resource counts as nothing and is listed, and a tier with no rate on a day (Strongest Governor T4, T5 and T11) scores nothing there and is listed. T11 costs come from one source only, so they are flagged and do not limit the plan. The shelf names the selected event's best troop day and how long before it to start the batch.
- **Speedups spent once:** troops trained with a speedup kind share a group with that kind's minutes, so the headline total spends each kind on the one day it scores most, as minutes or as troops.
- Everything else (gathering, intel missions, roulette, pet advancement, prep day 5's unrated governor gear row) is listed for the day but not counted.

An event's headline total puts each holding on the day it scores most, because inventory is spent once; it is never the sum of the days. A missing count marks the total partial.

## Checks

`node .dsh/town-centre-check.cjs` covers the arithmetic, page wiring and dictionaries. `node .dsh/town-centre-ui-check.cjs` runs against a built `_site` and covers edits on each shelf (including training facts and the buff), totals, persistence, the shared save with the governor page, shelf deep links, Arabic and three widths.

## Building data

`_data/buildings.json` is generated by `python3 .dsh/build-buildings.py [research/progression]` from the progression research draft in the project files (Kingshot Optimizer, Kingshot Data, KS h5joy). It keeps the Town Center, Embassy, Barracks, Range, Stable, Command Center, Infirmary, War Academy and Academy up to TG 8 and publishes a cost cell only where two sources agree; one-source cells are named in the row's `unverified` and do not limit the plan. That leaves the Infirmary's resource costs (only the optimizer has them; KS h5joy confirms its Truegold) and a handful of disputed cells (Town Center 11 and 27 Stone, Barracks, Range and Stable 30 Iron). Levels past TG 8 keep their ids with no cost until a second source covers them.

## Troop data

`_data/troops.json` is generated by `python3 .dsh/build-troops.py [research/troops]` from the troop tables Kingshot Optimizer and Kingshot Guide load for their troop calculators, saved in the project files. It keeps tiers 1–11 (the Truegold variants of T10 and T11 train in the same time for the same cost) and publishes a cell only where both agree: every training time, every cost to T10 except Archer T10 Bread (1,743 or 1,740) and Cavalry T7 Wood (231 or 2,231), and the KvK prep and Strongest Governor rates except Strongest Governor T4, T5 and T11. T11 costs differ entirely (Kingshot Guide has round placeholders), so they are unverified. The Truegold Training research that cuts T11 cost is not applied, and nor are training cost discounts, so the plan never overstates what resources can pay for.
