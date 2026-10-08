# Event availability

Milestone 3 adds a personal point budget to `events/#availability`. It reads the same confirmed inventory as hero gear. Inventory edits persist; export/import uses the shared player save.

## Single rule source

`_data/event_rules.json` contains the original guide rows for KvK Prep, Strongest Governor and Alliance Brawl, plus the extracted alliance matrix, display rates, themes, run schedules and copy-task arrays formerly in `js/kvk.js`. Liquid renders the reference tables from these rows. `js/event-data.liquid` emits `/js/event-data.js` for the browser; `js/event-rules.js` consumes that data and is also directly requireable in Node.

The older SG card/copy task arrays intentionally retain their original narrower coverage; reference rows contain some additional actions. No rates were researched or changed during this extraction. The original arrays have a preservation digest in the rule checks. Existing Brawl cards still read the reference DOM; its rendered task/rate pairs are unchanged.

The source annotation records the extraction date, not a new independent verification of current game rules. The existing page footer links the community sources. Always confirm tasks, unlocked tiers and rewards in the game.

## Counts and units

All new inventory IDs below represent individual material counts, not score increments or completed actions:

| Stable ID | Unit |
|---|---|
| `truegold` | One Truegold |
| `tempered-truegold` | One Tempered Truegold |
| `truegold-dust` | One Truegold Dust |
| `master-emblem` | One Master Emblem |
| `masters-manuscript` | One Master's Manuscript |
| `mythic-hero-shard` | One Mythic hero shard |
| `epic-hero-shard` | One Epic hero shard |
| `rare-hero-shard` | One Rare hero shard |
| `advanced-taming-mark` | One Advanced Taming Mark |
| `common-taming-mark` | One Common Taming Mark |
| `hero-widget` | One Widget |
| `mithril` | One Mithril; existing shared hero-gear balance |
| `forgehammer` | One Forgehammer; existing shared hero-gear balance |

Blank is unknown; explicitly entered zero is confirmed zero. Unknown eligible amounts are excluded and make the budget partial. Ineligible holdings remain in the ledger and contribute no points for the selected day. Shard rarities are separate; gear XP and spare mythic gear are not hero shards. Counts are capped at 1 billion by the ledger; rates and totals remain safe integers.

The calculation is `(confirmed amount − withheld amount) × points per item` per eligible item. The shortfall is `max(0, target − known spendable points)`. A blank/invalid target has no shortfall calculation. A partial budget's shortfall is against known points only.

Ownership does not prove that a corresponding building, research, gear, pet or hero upgrade is possible. Item totals are conditional inventory budgets. Roulette, missions, gathering, troop training, speedups, governor score changes and other action rows remain **potential but unquantified**: no safe conversion from stored facts to executable capacity is available. They are listed with the original guide's units/rates and excluded from arithmetic. Governor materials cannot be treated as governor score increments.

## Withholding

The calculator supports manual withholding as an ephemeral what-if input. It neither deducts inventory nor persists reservations into the player save. Withheld amounts survive event/day and language changes within the open calculator; reload clears them. Unknown balances disable withholding. If confirmed inventory decreases, withholding clamps to the remaining amount. Invalid edits retain the prior scenario on blur. This is not milestone 7's shared reservation/allocation system.

Each event/day reuses the same holdings. Daily totals are alternative budgets and must not be added together as though inventory were replenished. Day 6 of Brawl is the finale spanning into Sunday, as in the reference guide.

## Modules and verification

`event-availability` owns event/day/target/withholding controls and bounded result regions. Nested `ledger-form` fields own confirmed inventory writes. `save-transfer`, `disclosure` and `result-panel` provide the existing shared save controls and status messages. Store subscriptions update same-page and cross-tab calculations; locale refresh preserves the open scenario. `event-availability:calculated` emits the pure result. No private inventory copy or new ledger schema is introduced.

`.dsh/event-rules-check.cjs` checks event-specific totals, unknown versus zero, reserves, target shortfall, unsupported days, invalid counts, extracted-rule preservation, canonical reference bindings and translation keys. `.dsh/event-availability-check.cjs` runs against Jekyll output and checks actual ledger edits, cross-tab hero-gear synchronization, save transfer, reload semantics, all reference task/rate pairs, all 28 clock days and 17 languages at 320/768px. CI also runs the existing ledger, hero-gear, OCR and module checks.
