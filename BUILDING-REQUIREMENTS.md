# Building requirements

`buildings/` answers "what does it take to get this building to that level?", such as Town Center 2 → 3 (House 1 at level 2, 860 wood with the House steps). Like Upgrade priority, it is a tool page outside the page ring, linked from the ledger menu and the Town Centre's Buildings shelf. Nothing on it loads on home.

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

`plan(data, goal, have)` takes a goal `{ building, level }` and the levels the reader has given.

1. **Quick answer first.** The goal building is assumed one level below the goal. Every other building is assumed at the least the city can hold: the closure of what the goal building's current level, and each level given, needed on the way. So a goal answers at once with nothing entered, and an assumption never adds work the reader's own city already proves done.
2. **What it takes.** From there the plan raises each building until every step up to the goal has its prerequisites, recursively, and lists every step. A step goes once its prerequisites are reached; prerequisites go before the goal building, in the order first named. A step whose prerequisite no source lists stays as blocked rather than dropped.
3. **Refining.** Each building in the plan has its own level picker, marked "assumed" until the reader sets it. A level set high enough stays listed with a tick, so it can be set back; "not sure" forgets it. Construction speed (%) is optional; without it times are base times.

Totals add every step's cost and base time. Saul's resource discount and Double Time are not applied.

## Save, guest mode and links

Levels set here are the shared save's `buildings.levels` (see `PLAYER-LEDGER.md`), so the Town Centre and Upgrade priority read them. A goal on one of the nine planner buildings can be added to Upgrade priority's goals.

`?guest` runs the page on a copy of the save held in memory, as Hero Gear's guest mode does: nothing reaches `localStorage`. The address carries the goal and speed (`?b=town-center&to=TG2&speed=40`), so **Copy link** sends the goal and each reader sees it against their own levels. **Copy link with these levels** adds `have=embassy:TG1-2,house-1:2`, and such a link opens in guest mode, starting from those levels alone, so the sender's save never shows and the reader's is never touched. In guest mode the address follows every edit. The construction speed is kept in `localStorage` (`bh:construction-speed`) outside guest mode, as a per-device convenience.

## Checks

- `node .dsh/building-paths-check.cjs`: the generated paths, ranks, the Town Center 3 answer, assumptions, ordering against prerequisites to TG 8, links, page wiring and every `reqs.*` and building name key in all 17 dictionaries.
- `node .dsh/building-paths-ui-check.cjs` (after a Jekyll build): the quick answer, refining into the save, adding a goal, guest links that leave the save alone, the met state, speed, every language at 320px, screenshots in `.dsh/buildings-preview/`.
