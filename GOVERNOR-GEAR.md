# Governor gear and charms

`governor-gear/` plans governor gear and charm upgrades from the shared player ledger. It is milestone 5 of [ROADMAP.md](ROADMAP.md).

## Data

`_data/governor.json` holds both tables, checked on 9 October 2026:

- **Gear:** 58 steps per piece, Green 0★ to Red T6 3★, costed in Satin, Gilded Threads and Artisan's Vision. Six pieces, two per troop, share one table; each gives attack and defence to its troop.
- **Charms:** 22 levels per charm, costed in Charm Guides and Charm Designs. Eighteen charms, three on each gear piece, share one table; each gives health and lethality.

Each row is the price of one step, the cumulative stat once it is reached, the governor score at that level and the `sources` that agree on its materials. The tables were compared row by row across Kingshot Data, KS h5joy, Kingshot Scout, the Kingshot wiki, KingShot Guide and Kingshot Optimizer. Every row agrees across at least two of them, except gear Red T6 3★, which only Kingshot Optimizer lists; the page marks it ◇. Rows where a single table disagrees with the rest (KingShot Guide's Blue 2★ to Purple 1★, h5joy from Red T2 3★) were left out of that row's sources.

Governor score comes from Kingshot Data, which rounds to three significant figures. It has no score for gear Red T6 3★ or charm level 22, so plans that reach them show no score.

Set bonuses appear in only one table and are not modelled.

## Planner

`js/governor-engine.js` is pure and runs under Node for checks. Levels are indices: 0 is not crafted (or no charm), and index n is the nth table row.

- **plan:** one step at a time, the affordable next level with the most gain for the share of the starting bag it uses. Gain is the stat rise for the chosen troops, or the governor score rise. Gear and charms use different materials, so they are planned separately. Unset pieces are left out, never treated as zero.
- **toTarget:** materials to bring every set piece to a level, and what is still missing from known balances.
- **events:** event days in `_data/event_rules.json` that score "Governor Gear/Charm max score +1", with the score gain multiplied by that day's rate. These are estimates.

`js/governor-planner.js` is the DOM adapter, registered as the `governor-planner` module. Materials use `ledger-form`; backups use `save-transfer`.

## Page

The page is a ruled ledger in the site's own style: one band per troop (cavalry: hat, amulet; infantry: armour, trousers; archer: ring, staff) with that troop's totals, two pieces to a band, each shown as its game art, its level and its three charm levels as square rule cells. Tapping a piece opens a dialog with steppers for the piece and its charms. The plan sits beside the board on a wide screen and behind a tab on a phone, with "Spend now" (back-to-back steps on one piece shown as one upgrade) and "Cost to reach". Art is game artwork listed in [img/governor/SOURCES.md](img/governor/SOURCES.md); each gear card is the zero-star art for its tier and grade, and the level text carries the stars. Nothing on the page copies the game's own frames, glows or layout.

## Ledger

Levels live in `governorGear.pieces` and `governorCharms.slots` of the shared ledger, with provenance per item. A section stays `unsupported` until the first level is set. Planner choices live in `preferences.governor`. See [PLAYER-LEDGER.md](PLAYER-LEDGER.md).

## Checks

- `node .dsh/governor-check.cjs`: table shape and totals, plans, targets, event rates, ledger validation, dictionaries and that every card and gem image exists.
- `node .dsh/governor-ui-check.cjs` after a Jekyll build: profile tiles, the edit dialog, planning, troop focus, tabs, persistence, the shared bag, reset, RTL and phone widths.

Page copy is English in every language, like hero gear; navigation, the home card and the deck cover are translated into all 17.
