# Town Centre

`town-centre/` is one view over the whole shared player ledger: event items, speedups, resources, hero gear and governor gear and charms, plus the KvK prep, Strongest Governor and Alliance Brawl points that inventory can score. It adds no ledger schema; every value is an ordinary inventory balance or an existing typed section, so hero gear, governor gear and events see each edit.

## Inventory

| Shelf | Ledger | Written by |
| --- | --- | --- |
| Bag | `inventory[id]` for every `_data/event_rules.json` item | `ledger-form` |
| Speedups | `inventory['speedup-{kind}']` in minutes; kinds `general`, `construction`, `research`, `training`, `learning`, `healing` | `town-speedups` (days, hours, minutes) |
| Resources | `inventory.bread`, `wood`, `stone`, `iron` | `ledger-form` |
| Hero gear | `inventory['hero-gear-xp']`, `['spare-mythic-gear']`, `heroGear.pieces` | `ledger-form`, `town-hero-gear` via `writeHeroGear` |
| Governor | governor materials, `governorGear`, `governorCharms` | `ledger-form`, `town-governor` via `setGovernor` |

Blank is unknown and zero is a confirmed zero, as everywhere else. A hero gear piece cannot be returned to unknown here, because the hero gear adapter has no delete.

## Points

`js/town-centre-engine.js` is pure and requireable in Node. It reads every rate from the event rules rows rather than copying them:

- **Items:** `EventRules.calculate` for the day.
- **Speedups:** rows whose label names speedups. Minutes × the row's rate. General speedups count on every speedup row; healing only on rows that take every kind (“all kinds” or a bare “1 min speedups”). Each kind counts once per day.
- **Governor score:** “Governor Gear/Charm max score +1” rows. The score gain is `Governor.plan(kind, levels, materials, { goal: 'score' })`, the same greedy planner as the governor page, × the row's rate. Unknown levels or materials make it unknown.
- Everything else (training, gathering, intel missions, roulette, pet advancement, prep day 5's unrated governor gear row) is listed for the day but not counted.

An event's headline total puts each holding on the day it scores most, because inventory is spent once; it is never the sum of the days. A missing count marks the total partial.

## Checks

`node .dsh/town-centre-check.cjs` covers the arithmetic, page wiring and dictionaries. `node .dsh/town-centre-ui-check.cjs` runs against a built `_site` and covers edits on each shelf, totals, persistence, the shared save with the governor page, shelf deep links, Arabic and three widths.
