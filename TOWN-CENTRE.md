# Town Centre

`town-centre/` is one view over the whole shared player ledger: event items, speedups, resources, hero gear and governor gear and charms, plus the KvK prep, Strongest Governor and Alliance Brawl points that inventory can score. It adds no ledger schema; every value is an ordinary inventory balance or an existing typed section, so hero gear, governor gear and events see each edit.

It is not an event page, so it is not in the page ring: no deck card, no cover animation and no swipe neighbours. The deck has one fixed Town Centre button beside close, and the ledger lists it under the tools. The inventory comes first and the points it can score follow.

## Inventory

Every shelf is a grid of tiles painted from the ledger; tapping one opens a single edit dialog (`town-inventory`), so the page has no blocks of bare fields.

| Shelf | Ledger | Edited as |
| --- | --- | --- |
| Bag | `inventory[id]` for every `_data/event_rules.json` item | count |
| Speedups | `inventory['speedup-{kind}']` in minutes; kinds `general`, `construction`, `research`, `training`, `learning`, `healing` | days, hours, minutes |
| Resources | `inventory.bread`, `wood`, `stone`, `iron` | count |
| Heroes | `heroes.roster` and hero shards: the Heroes page roster itself (`_includes/heroes/roster.html` and the `hero-directory` module), without its shard bag, which is on the Bag shelf | the hero's "Your copy" form, written through `setHero` |
| Hero gear | `heroGear.pieces`: one set of four (helm, gloves, chest, boots) per troop type, behind troop tabs; plus gear XP, spare mythic gear, Forgehammers and Mithril | quality chips and level/mastery steppers, written through `writeHeroGear` |
| Governor | `governorGear` (one set of six for the account) and `governorCharms` (three per piece), laid out as the in-game governor profile; plus the five materials | gear and charm steppers, written through `setGovernor` |

Hero gear and governor gear are separate sections and never share a model: hero gear belongs to a troop type, governor gear to the account. Blank is unknown and zero is a confirmed zero, as everywhere else. A hero gear piece cannot be returned to unknown here, because the hero gear adapter has no delete.

## Points

`js/town-centre-engine.js` is pure and requireable in Node. It reads every rate from the event rules rows rather than copying them:

- **Items:** `EventRules.calculate` for the day.
- **Speedups:** rows whose label names speedups. Minutes × the row's rate. General speedups count on every speedup row; healing only on rows that take every kind (“all kinds” or a bare “1 min speedups”). Each kind counts once per day.
- **Governor score:** “Governor Gear/Charm max score +1” rows. The score gain is `Governor.plan(kind, levels, materials, { goal: 'score' })`, the same greedy planner as the governor page, × the row's rate. Unknown levels or materials make it unknown.
- Everything else (training, gathering, intel missions, roulette, pet advancement, prep day 5's unrated governor gear row) is listed for the day but not counted.

An event's headline total puts each holding on the day it scores most, because inventory is spent once; it is never the sum of the days. A missing count marks the total partial.

## Checks

`node .dsh/town-centre-check.cjs` covers the arithmetic, page wiring and dictionaries. `node .dsh/town-centre-ui-check.cjs` runs against a built `_site` and covers edits on each shelf, totals, persistence, the shared save with the governor page, shelf deep links, Arabic and three widths.
