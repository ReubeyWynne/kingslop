# Governor gear and charms

`governor-gear/` plans governor gear and charm upgrades on a sheet of its own, so an R4 can answer someone else's question and send them the link without touching their own save. It is milestone 5 of [ROADMAP.md](ROADMAP.md).

## Data

`_data/governor.json` holds both tables, checked on 9 October 2026:

- **Gear:** 58 steps per piece, Green 0★ to Red T6 3★, costed in Satin, Gilded Threads and Artisan's Vision. Six pieces, two per troop, share one table; each gives attack and defence to its troop.
- **Charms:** 22 levels per charm, costed in Charm Guides and Charm Designs. Eighteen charms, three on each gear piece, share one table; each gives health and lethality.

Each row is the price of one step, the cumulative stat once it is reached, the governor score at that level and the `sources` that agree on its materials. The tables were compared row by row across Kingshot Data, KS h5joy, Kingshot Scout, the Kingshot wiki, KingShot Guide and Kingshot Optimizer. Every row agrees across at least two of them, except gear Red T6 3★, which only Kingshot Optimizer lists; the page marks it ◇. Rows where a single table disagrees with the rest (KingShot Guide's Blue 2★ to Purple 1★, h5joy from Red T2 3★) were left out of that row's sources.

Governor score comes from Kingshot Data, which rounds to three significant figures. It has no score for gear Red T6 3★ or charm level 22, so plans that reach them show no score.

Set bonuses appear in only one table and are not modelled.

## Planner

`js/governor-engine.js` is pure and runs under Node for checks. Levels are indices: 0 is not crafted (or no charm), and index n is the nth table row.

- **plan:** one step at a time, the affordable next level with the most gain for the share of the starting bag it uses. Gain is the stat rise weighted by the troop profile, or the governor score rise for the score profile. Ties go to the heavier troop, then the lower level, then table order. Gear and charms use different materials, so they are planned separately. Unset pieces are left out, never treated as zero.
- **Troop profiles** (`profiles` in `_data/governor.json`), Bear first by default:

  | Profile | Infantry | Cavalry | Archer | For |
  | --- | --- | --- | --- | --- |
  | `bear` | 0.25 | 0.35 | 1 | low and mid spenders: Bear Hunt every two days pays back in hammers, and their defensive role is joining turrets |
  | `defence` | 1 | 0.5 | 0.7 | turret and garrison holders |
  | `even` | 1 | 1 | 1 | levelling everything |
  | `score` | — | — | — | the most governor score, for an event day |

  The bear weights follow the Bear Hunt page's 5 / 15 / 80 formation, softened so infantry still moves. An older save's `goal: 'score'` reads as the score profile; without one, the planner used no weights and infantry won every tie because it is first in the table.
- **toTarget:** materials to bring every set piece, or one troop's (`{ troop }`), to a level, the levels that reaches, and what is still missing from known balances.
- **events:** event days in `_data/event_rules.json` that score "Governor Gear/Charm max score +1", with the score gain multiplied by that day's rate. These are estimates.

`js/governor-planner.js` is the answer's DOM adapter, registered as the `governor-planner` module; `js/governor-profile.js` is the shared profile (see Page). Materials use `ledger-form`.

## Sheet and links

The page never edits the player's save. `js/governor-sheet.js` configures a memoized in-memory store before discovery, as Hero Gear's guest mode does, and every module on the page (planner, materials, screenshot import) uses it. The sheet starts from the link when there is one, else from a copy of the save.

`Governor.encodeLink(sheet)` and `Governor.readLink(search)` carry a sheet in the address: `gov=` is 24 characters, one per gear piece then one per charm in table order (`0`–`9`, `a`–`z`, `A`–`Z` for the level, `.` for not set); `bag=` holds the five materials in table order joined by `.` (blank is not counted); `p`, `gt` and `ct` carry the troop profile and targets only when they differ from the defaults. A link that cannot be read falls back to the copy of the save and says so. In-game chat takes 512 UTF-16 units; the fullest possible sheet is 143 characters with `https://dey.ci`, and `governor-check` keeps it under 160 so later additions still leave room.

Whenever the sheet differs from the save, every edit rewrites the address with `replaceState`, so the address is always the share link; when it matches, the address is clean. The strip above the materials says which it is (a shared sheet, your save, a blank sheet, or changed on this page only) and offers copy link, start blank, load mine and save as mine. Save as mine asks first, then replaces the governor levels and choices in the save; a material the sheet has not counted keeps the saved number. The page carries no next-step note and no empty state, since both are about the save.

## Page

One column on a phone, two on a wide screen, no tabs between the gear and the answer and no box that scrolls, so a screenshot holds both.

- **The governor** is `_includes/governor/profile.html` with `js/governor-profile.js` and `css/governor-profile.css`, the same component the Town Centre's Governor shelf uses: the in-game arrangement (hat, armour and ring on the left; amulet, trousers and staff on the right; gear and charm score between), each piece as its card with stars, its level, and three charms drawn with the game's charm art, where shape is the level and colour the troop (green infantry, blue cavalry, yellow archer), the level number small beside each. Tapping a piece opens one editor for the piece and its charms. "All gear" and "All charms" sit right under the board and apply as soon as a level is picked. The module writes whatever store the page gives it: the sheet here, the save on the Town Centre.
- **The answer** asks one of two questions. "With what I have" spends the bag by the chosen troop profile; "Cost to reach" prices a gear and a charm target for every piece or one troop. Either way it shows each piece once, gear from → to and each charm from → to (pieces that do not move are dimmed), then one bill: what it spends and leaves, or what it needs and what is still short, the governor score gained and roughly what that is worth on the best event day for gear and for charms. There is no step queue.

Art is game artwork listed in [img/governor/SOURCES.md](img/governor/SOURCES.md); each gear card is the zero-star art for its tier and grade, and the stars are drawn on it.

## Ledger

Saved levels live in `governorGear.pieces` and `governorCharms.slots` of the shared ledger, with provenance per item. A section stays `unsupported` until the first level is set. Planner choices live in `preferences.governor`. See [PLAYER-LEDGER.md](PLAYER-LEDGER.md).

## Checks

- `node .dsh/governor-check.cjs`: table shape and totals, plans and troop profiles, targets, event rates, sheet links, ledger validation, dictionaries and that every card and gem image exists.
- `node .dsh/governor-ui-check.cjs` after a Jekyll build: the shared profile and its editor, charm art, set all, the answer under Bear first and Even, cost to reach for one troop, no inner scroll, the sheet in the address, a visitor opening the link, save as mine, start blank, load mine, an unreadable link, RTL and phone widths.

Page copy is English in every language, like hero gear; navigation, the home card and the deck cover are translated into all 17.
