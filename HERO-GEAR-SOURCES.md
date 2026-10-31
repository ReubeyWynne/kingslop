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

Gear screenshots go through the site-wide import panel
([SCREENSHOT-IMPORT.md](SCREENSHOT-IMPORT.md)); the page's "read screenshots"
button opens it. The `hero-gear` adapter (`js/import-adapters/hero-gear.js`)
wraps `js/hero-gear-ocr.js`, and `js/ocr-worker.js` supplies PaddleOCR words
and polygons using the existing self-hosted models. A hero overview is known by
its tile frames before any reading, so the panel skips the whole-screen read;
the tile labels are read on the WASM engine. Detail screens use English level/mastery
labels and slot aliases. Hero overviews are detected locally from connected
orange/red/purple regions, repeated tile dimensions, two aligned rows and
mirrored columns, with the space between the columns clear of tile frames
(the Backpack's item grid shows the same frames edge to edge). Border samples
identify mythic/red/epic rarity; the layout assigns helm, gloves, chest and
boots. The centred exclusive widget is excluded.

Troop identification compares the four corner badges against 16 × 16 luminance
signatures extracted from the supplied Zoe, Marlin and Petra screenshots. Small
position shifts are compared; three confident agreeing badges are required.
An unknown badge falls back to the piece last selected on the gear page and
flags the piece's values for a look. Hero names and their language are not
needed.

Each detected tile is cropped from the original-resolution image. Its enhancement
and mastery bands are filtered to their white/yellow glyphs, with glyph size,
position and baseline checks removing item-art shapes. The resulting bands are
enlarged into separate rows and passed to the unchanged production OCR worker.
Unread labels retry their original-colour crops to retain anti-aliased glyph
edges. Absent label pixels read as zero; a present label without recognised
numbers or a reader failure leaves the field unread. Red enhancement
is converted to total level `100 + displayed enhancement`, while `Lv.` in the
lower band is mastery. Each piece gives two review tiles, enhancement (a red
piece shows its +N) and forge mastery, each with the piece's crop, one input
and an include tick. Each screenshot applies on its own; where two waiting shots
show the same piece, the newer file wins. Unticked fields preserve saved values,
and a number the input refuses (enhancement over 100, or 80 for epic) blocks
the apply instead of being dropped. No values apply before review, and the
panel's undo restores the gear from before the last apply. This planner stores
one transferable set per troop, not per hero.

Six original supplied screenshots are test fixtures in `.dsh/gear-fixtures/`.
The browser test reads all 24 pieces through the actual worker and the import
panel without word stubs, checks every field, the WASM backend, review-before-
apply, refused values, unlevelled imports, resource preservation and undo. A
detail screen read is also covered with stubbed words. Current overview detection targets the portrait gear
screen and three supported rarities; other crops/layouts and unread labels still
need manual review. The underlying recognition engine is reused unchanged.

Only the structured ledger is saved in `localStorage['bh:hero-gear:v1']`.
Screenshots remain on-device; shots waiting for review are kept in the
browser's IndexedDB until applied or skipped.
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

## Visual budget routes — 7 October 2026

The forward planner compares independent red destinations at total levels 120,
160 and 200 (game +20, +60, +100), the expedition bonus milestones. It never
requests a numeric target from the player. Each destination preserves already
invested mastery and includes all missing enhancement, mastery, ascension and
intervening imbuements in its cost. Levels 140 and 180 remain included in costs;
their conquest bonuses are outside the expedition score.

For one piece, weighted gain is the change in `core × coreWeight + attack ×
lethalityWeight + defence × healthWeight`. Core means lethality for helms/boots,
health for gloves/chests. These are additive priority points, not predicted
battle damage. Each profile's weights are visible and editable. New rally
weights are infantry `[0.7,1.2]`, cavalry `[0.6,0.4]`, archer `[1.8,0.8]`;
garrison weights are infantry `[1,1.8]`, cavalry `[0.6,0.5]`, archer `[1.1,0.8]`.
Those two presets implement the owner's requested role preferences; they are
planning choices, not mined game constants or validated combat optima.

The page shows weighted gain as a percentage of the current loadout's total
weighted score across included troops, so a route, a plan and a milestone all
share one denominator: `gain ÷ Σ score(current piece)`.

Each resource uses a common reference `scale[r] = max(bag[r], baseline[r])`,
where baseline is 52,650 XP, 550 hammers, 6 mythic pieces and 10 mithril. These
are comparison scales, not exchange prices. A route's cost load is
`Σ(cost[r] / scale[r])`; displayed efficiency is weighted gain divided by that
load. All displayed routes share the same denominators, making their ratios
comparable. A future budget is `bag[r] + t × scale[r]` for every resource. A
route first fits at `t = max(0, max((cost[r] - bag[r]) / scale[r]))`. At each
unlock threshold, choose the affordable route with greatest weighted gain,
breaking ties by efficiency and then piece ID. Display the first three changes
in that winner. This gives increasing budget alternatives, each starting from
the original gear, rather than a cumulative purchase queue. Actual collection
rates may differ; entering a different bag recalculates the recommendations.
This planner intentionally prioritises absolute impact within a budget; its
displayed efficiency is separate and is not claimed to be the optimiser's
greedy ranking. The spend-now optimiser retains its multi-pass local search.

With the owner's Zoe/Marlin/Petra gear and an empty bag, the growth profile
first recommends archer helm 120 (52,650 XP / 450 hammers / 6 mythic / 10
mithril), then infantry gloves 160 at a larger saving budget. Rally and garrison
presets produce different frontiers. Tests assert this change, per-resource
affordability, consistent efficiency denominators, exclusions and no mutation.

Cavalry catch-up advice appears when its summed core stats are below 65% of the
weaker included infantry/archer set. The threshold is an explicit interface
heuristic, not a game mechanic or hidden score adjustment. Role annotations are
advice requested by the owner; gear stats themselves have no role restriction.

Spend-now results use net per-piece XP refunds. A downgrade can also receive
mastery, whose cost must still be shown. Sum positive XP costs as spending,
negative XP differences as recoverable XP, and all mastery costs independently;
`bag + recovered XP - spending = remaining` is checked for every resource.
This avoids charging for a full reset/rebuild when the final level is the same.
Item saves retain sub-10 XP remainders, and the resource ledger is authoritative
when migrating older saves whose item counts disagree with the XP total.

## Your save, sheets and links — 16 and 31 October 2026

Without a link the planner works on the saved player ledger and every edit saves
as it goes. A link (`?gear=…`), `?guest` or Start blank opens a sheet of its own:
a ledger held in memory, seeded from the link or from a copy of the save.
`hero-gear.js` swaps it in for `PlayerLedger.shared()` before the shared modules
mount, so the bag fields, backups, screenshot import, reset and undo all act on
the sheet, and nothing typed there reaches `localStorage` until Save as mine.

On your save there is no bar: edits save as you go. On a sheet one slim notice
above the workspace says which it is (a shared sheet, a blank sheet or an
unreadable link, "Your save is untouched.") with Save as mine and Load mine
beside it. **Copy share link** and **Start blank** are small links under your
gear. **Copy share link** copies `?gear=…&w=…`. `gear` lists the twelve pieces in troop
then slot order as quality letter, total level and mastery (`m100.10`, `r120.11`,
`e80.0`); `w` is a profile name or six custom weights. A link carries no
resources, so a shared link never shows the sender's bag. On a sheet the address
bar follows every edit, so it is always the shareable link. Malformed or
impossible pieces reject the whole link, and the sheet starts blank with that
said in the notice. **Load mine** goes back to your save, **Start blank** opens a
link of blank gear, and **Save as mine** asks first, then writes the sheet's
pieces, build profile and weights to your save; a material the sheet left at 0
keeps your number. Governor gear works the same way.

## Best split — 16 October 2026

**Best split** compares each included troop set with the best gear the same
resources could have bought. The budget is what the set has absorbed: the cost of
every piece from mythic (or epic) level 0, mastery 0 to its current state, counting
XP, Forgehammers, spare mythic gear and mithril separately. Epic pieces stay epic.

A piece's quality, red milestone tier and mastery fix its hammer, mythic and
mithril cost (`5m(m+1)` hammers; `(m-10)(m-9)/2` mythic above mastery 10; 2 mythic
to ascend; 0/3/8/13/23/33 imbuement mythic and 0/10/30/60/100/150 mithril by tier).
Inside a class the weighted score rises linearly with level and XP per level never
falls, so levels are filled greedily by score per XP. A depth-first search tries
every class combination the budget can pay for, pruned by an upper bound, so
mastery, ascension and milestone choices are exact. Integer XP rounding can leave
levels a step or two from the true optimum; the check compares two-piece cases with
brute force and allows 0.3%. The current gear is always a candidate, so the best
split never scores lower. Over-investment is the per-piece excess of current
hammers or mithril over the best split. Those resources cannot be refunded in game;
the view guides future spending. The score uses the profile weights and excludes
conquest bonuses, so a deliberate conquest build will read as over-invested.

## One page, as on Governor gear — 31 October 2026

The page shares its frame with Governor gear through `css/sheet.css`: the title
and lede, the "This sheet" bar, then your gear on the left and the answer on the
right, then folds. The left column is "Read a hero gear screenshot" (a
`data-screen-import="pick"` box that also takes a drop), the troop tabs, the four
pieces and the materials strip. The right column is "The answer": the four modes
as one boxed row of tabs, then the priority (build profile), the six weights and
reforge in place (hidden under Piece costs, which does not weigh), then the
result. On phones the Gear and Plan tabs still split the two columns.

What used to be the Settings and Theory tabs are folds under the workspace: how
the planner works, ranking, KvK points, cost includes, best split, the maths and
sources, and your save and backups. The shipped ids still work: a link to
`#how-it-works`, `#ranking`, `#kvk-points`, `#cost-includes`,
`#best-split-method`, `#maths`, `#maths-sources` or `#save-backups` opens its
fold, and `#weights` lands on the weights. Without JavaScript the folds open
as usual.

## Cards, one answer and % of optimal — 31 October 2026

The modes and nested tabs are gone. **Your gear** is three troop cards, each a
2×2 grid of its pieces; a card opens that troop laid out as the game does (helm
and chest on the left, gloves and boots on the right, its share of optimal in
the middle) with its "count in the answer" box. A piece opens one sheet: its
quality, level and mastery, then what its next steps cost (ascend to red first,
then the next mithril use), each with "mark this upgrade done" when the bag pays
for it. That replaces the Piece costs mode.

**% of optimal** (`HeroGear.optimal`) is shown twice:

- Under your gear, without the bag: every resource already invested in the
  counted pieces is the budget, and the gear is compared with the best layout of
  that budget. "Show optimal gear" swaps the cards to that layout and lists each
  moved piece as now → optimal.
- At the top of the answer, with the bag added to the budget: your gear now →
  after Spend now, so a player sees how far off they were and how close this
  round of upgrades gets them.

The best layout is found by the same greedy search as Spend now (`optimise`),
which spends the budget from four starts: every piece at level 0, each troop's
exact best split (`bestSplit`, which pools within a troop), the gear as it is
with its XP free to move, and the gear as it is. From each start it spends what
that start left, across all troops; the best result counts, and the gear itself
is a candidate, so the share never passes 100%. Greedy from level 0 alone
scored below some real gear (704 vs 745 on the supplied six-overview set), which
is why the other starts are there. Shares are rounded down to a tenth so gear
short of optimal never reads 100%.

The priority (build profile) and XP reforge sit in the answer above Spend now.
The worker also scores the gear's share of optimal under every profile
(`profileFit`) and, when another profile fits better than the chosen one, offers
it in one line with a "Use it" button. Custom weights are the Advanced fold
(`#weights`). **Worth saving for** lists `redPlans` routes, red a little out of
reach ranked by gain per cost, with what each is short; a route opens its
piece's sheet. Old links to `#best-split-method` open "How % of optimal works".

**Hammer reforge** (Advanced, off by default; from the site owner, 31 October
2026): reforging a piece's mastery gives back half the Forgehammers it took,
rounded down, and none of the spare mythic gear. Red gear can't be reforged for
XP or hammers. Spend now then also tries resetting the mastery of each single
piece, each troop and every piece before its greedy search, and keeps a reset
only where it scores better; the result shows "↓ N hammers back" on the piece.
% of optimal is unchanged: it already treats everything invested as free to
place.
