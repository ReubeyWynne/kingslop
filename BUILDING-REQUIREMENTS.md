# Building requirements

`buildings/` answers "what does it take to get this building to that level?", such as Town Center 2 → 3 (House 1 at level 2, 860 wood with the House steps). It is a tool in the page ring, after Pets, with its own sandstone hue and a keep-and-hoist cover (DESIGN.md), a card on home, and a link on the Town Centre's Buildings shelf. Its data and scripts load only on this page.

## Shape

| Piece | Role |
| --- | --- |
| `_data/building_paths.json` | Every level of the 20 upgradable buildings: `needs` (`[building, level]`, a numbered copy such as House 1 as a third item, a single-level building such as the Hero Hall with no level), `cost` of that one step, base `time` in seconds, `unverified` cells, `sources`. Generated with `_data/buildings.json` by `python3 .dsh/build-buildings.py` |
| `js/building-paths-data.liquid` | Publishes it as `window.BuildingPaths`, on this page only |
| `js/building-paths.js` | Pure engine (UMD): `plan`, `rank`, `encode`/`decode` for links |
| `js/building-paths-page.js` | The `building-paths` interaction module, plus guest mode |
| `css/buildings.css` | Page hue (terracotta) and layout |

`_data/buildings.json` stays the planner's table (nine buildings, two-source costs only). This file keeps every prerequisite and every cost, and names a cell only one source gives in `unverified`; the page marks those with †. Houses, the Clinic, the resource buildings, the Barricade and Defense Tower and every level past TG 8 are Kingshot Optimizer only.

## The plan

`plan(data, goals, have)` takes one goal `{ building, level }` or several, and the levels the reader has given. Several goals make one plan: their prerequisites are shared and each step is counted once, prerequisites go first and the goal buildings last, in the order given. Two goals on one building keep the higher level; a goal already met drops out, and the plan is `met` when all are.

1. **Quick answer first.** Each goal building is assumed one level below its goal. Every other building is assumed at the least the city can hold: the closure of what the goal building's current level, and each level given, needed on the way. So a goal answers at once with nothing entered, and an assumption never adds work the reader's own city already proves done.
2. **What it takes.** From there the plan raises each building until every step up to the goal has its prerequisites, recursively, and lists every step. A step goes once its prerequisites are reached; prerequisites go before the goal building, in the order first named. A step whose prerequisite no source lists stays as blocked rather than dropped.
3. **Refining.** Each building in the plan is one card: its art, the reader's level (dashed and marked `?` while assumed), the level it must reach, and that run's cost and time. Tapping a level opens one small grid of levels in place of a long select: buildings past level 30 get a tab for 1–30 and one per TG, so any level is at most two taps away and the grid never scrolls on a phone. A level set high enough stays listed with a tick, so it can be set back; "not sure" forgets it. Construction speed (%) is optional; without it times are base times.

The goal is a row of building tiles (all 20, art from `img/buildings/`, see its `SOURCES.md`): a tap adds or removes a goal, and the tile badge shows its goal level, set from the goal's own card. The answer (headline, totals, time) is pinned to the foot of the screen while the cards scroll under it.

Totals add every step's cost and base time. Saul's resource discount and Double Time are not applied.

## Save, guest mode and links

Levels set here are the shared save's `buildings.levels` (see `PLAYER-LEDGER.md`), so the Town Centre and Upgrade priority read them. A goal on one of the nine planner buildings can be added to Upgrade priority's goals.

The **Guest mode** switch above the goal tiles reloads the page with `?guest`, which runs it on a copy of the save held in memory, as Hero Gear's guest mode does: nothing reaches `localStorage`; switching off reloads without it. The address carries the goals and speed (`?goal=town-center:TG2,barracks:TG2&speed=40`; the first links' `?b=town-center&to=TG2` still open), so **Copy link** sends the goal and each reader sees it against their own levels. **Copy link with these levels** adds `have=embassy:TG1-2,house-1:2`, and such a link opens in guest mode, starting from those levels alone, so the sender's save never shows and the reader's is never touched. In guest mode the address follows every edit. The construction speed is kept in `localStorage` (`bh:construction-speed`) outside guest mode, as a per-device convenience.

## Checks

- `node .dsh/building-paths-check.cjs`: the generated paths, ranks, the Town Center 3 answer, assumptions, ordering against prerequisites to TG 8, several goals sharing prerequisites, links old and new, page wiring and every `reqs.*` and building name key in all 17 dictionaries.
- `node .dsh/building-paths-ui-check.cjs` (after a Jekyll build): the quick answer in view at once, no selects, every card with its art, the level grid fitting a phone without scrolling, refining into the save, a second goal tile added and removed, the guest switch both ways, adding to Upgrade priority's goals, guest links that leave the save alone, the met state, speed, every language at 320px, screenshots in `.dsh/buildings-preview/`.
