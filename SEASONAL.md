# Seasonal events

`/seasonal/` opens the current event. Since 11 November 2026 that is Fantasy Theater, which `/seasonal/fantasy-theater/` also opens; the Halloween candy calculator stays at `/seasonal/halloween-party/`, linked from the foot of the Fantasy Theater page. There is no event listing. The Seasonal navigation, carousel and footer links are unchanged.

## Fantasy Theater

The page is built in Alpine (`js/pages/fantasy-theater.mjs` over `js/fantasy-theater.mjs`), with its data in `_data/seasonal/fantasy_theater.json`. It is English only, like the Halloween page, and nothing is saved: every input is a scenario.

One input, amulets held, gives the expected Fantasy Tokens, the number of full climbs and the expected Fortress runs. The engine solves the best claim policy exactly: a dynamic programme over (floor, pity step) inside a bisection on tokens per amulet, the renewal-reward ratio of a round. A Fanstar is valued at a fifth of a Fortress round's surplus at that rate. With the published odds, best play is to claim only at the top (about 21.6 tokens per amulet); claiming on floors 2 to 5 earns about 18.7.

The pack table divides each pack's whole price by its amulets and by the tokens they earn. The shop plan spends the tokens held plus the amulets' expected tokens: the 500-token Mithril first (optional; it is the cheapest Mithril anywhere), then the best KvK prep points per token while each line's stock lasts. Every line's stock can be overridden. KvK points follow `_data/event_rules.json`; `.dsh/seasonal-theater-check.cjs` holds the two to the same values. The exploration rewards list the milestones that the held amulets reach from the amulets already used. The climb table gives the exact spread of amulets a climb takes (average, median, 90th percentile, worst case).

Sources: explore costs, floor rewards and pause rewards from Kingshot Packs; Fortress explore costs from Kingshot Mastery; odds, prices, stock, packs and the exploration track from the game's own screens (11 November 2026). Fortress floors 2 to 7 are counted at the Theater's rewards, since only floor 8's reward is published.

Run `node --test .dsh/seasonal-theater-check.cjs`, then build and run `node .dsh/seasonal-theater-ui-check.cjs`.

# Halloween candy value

`/seasonal/halloween-party/` opens the Halloween candy calculator.

## User flow

The first screen takes one input: candy held. It immediately shows expected Prankster Points and the expected items from all three chest types. It requires no score, event date, target, purchase history or pass setup. A new visitor sees an explicitly labelled 1,000-candy example; this example is not written to the player save. Replacing it records the player's candy.

Future income expands separately. Players enter remaining door days, gathering/Beast candy, future gem/speedup spending and other income. Gathering and Beast fields are remaining candy, not full caps to be awarded again. A small mission calculator counts today's unclaimed milestones and future stages. It excludes closed stages and excludes today's rewards when current claims are unknown. The full-plan result compares held-candy rewards with all planned rewards, including mission items and selected pack contents.

Purchase comparisons show the pack's own items plus the expected rewards from its candy. Players can compare points, Gems, Forgehammers, shards, Truegold, custom chests, material chests or speedup minutes per currency unit. No universal gem-price score is imposed. Rates use the source's USD/EUR prices without conversion. Every remaining tier is visible, with unlock costs identified. Selecting a later pack adds its missing prerequisite tiers; quantities respect the final pack's remaining allowance. Previously purchased items are not re-added to held candy.

Pass comparisons are separate because they need current points and the in-game reward variant. They value a new unclaimed paid track, including already unlocked rewards and the further attacks its candy enables. Owned passes cannot be selected for another purchase. Top-up bonuses are optional and require known prior top-up points; previously unlocked tiers are treated as collected. Saved free and owned paid tracks are included once their current points, variant and claimed levels are known. Previously claimed levels are excluded. Future daily chests and the shared jackpot remain excluded.

The permanent skin is an optional section. It explains the two independent routes: 12,500 points regardless of rank, or a top-10 finish. It shows the points gap and a conservative candy amount that is sufficient without free attacks. The calculator does not predict final rank.

## Expected value

`_data/seasonal/halloween_party.json` holds the factual tables extracted on 28 October 2026 from https://kingshotpacks.com/halloween-party and its public `CovenClash-f1da1b82.js` module. It includes drop pools, Witch and free-attack distributions, packs, top-up thresholds, ranking brackets, missions and pass variants. The user-corrected skin rule is recorded separately from the source's original restriction.

`Halloween.candyValue(candy, options)` runs seeded target/free-attack simulations. It records Pumpkin hits, Pumpkin kills and Witch hits, then applies the exact expected reward vector of each chest pool. It does not simulate individual rare drops, so a rare item's fractional EV does not turn into an arbitrary zero from a small sample. Returned points are the arithmetic mean, not a median or a target success percentage.

Free hits score points but do not advance pity, following the source's stated assumption. Paid hits on either target advance it. Pass candy feeds back into attacks when a new pass is included. Reward variants and claimed levels are explicit options. Maximum input is bounded at two million candy per calculation. Sample counts adapt to the workload; results are estimates, labelled as such. Pack comparisons use matched seeds and the same sample count for their baseline and candidate values. All costs and expected rewards are incremental from held plus planned future candy, before selected purchases.

`halloween-worker.js` sends held-candy EV first, then the full plan and purchase comparisons. New input cancels superseded work, and results are marked as updating without collapsing the layout. Owned candy EV does not change when future income is edited. The full event reference is a separate disclosure with stable deep links.

## Save and presentation

The shared ledger's optional `seasonal.halloween-2026` record retains candy, score, purchase counts and existing progress fields. Export/import, revisions and cross-tab updates continue to use the shared save. Future income, currency, comparison metric and selected purchases are temporary scenarios; they never deduct inventory. Old records remain readable.

The page uses the requested purple, green and orange Halloween palette. Purple defines the background and secondary accents, green marks expected rewards, and orange marks candy and money. This is the explicit Halloween exception documented in DESIGN.md. No new animations are authored.

The calculator and reference copy is English, marked `lang="en"` and `dir="ltr"`; navigation labels remain translated. Changing the site's language preserves the calculator. Both URL aliases load the same include and worker.

## Verification

Run `node --test .dsh/seasonal-check.cjs`, `node .dsh/player-ledger-check.cjs`, `node --test .dsh/page-deck-check.cjs`, then build Jekyll and run `node .dsh/seasonal-ui-check.cjs`. The browser check accepts `SITE_ROOT` for an alternate build directory.

The checks cover candy-only EV, sub-attack balances, rare-item expectations, pity, mission income, prerequisite pack purchases, pass candy feedback, automatic recalculation, per-item rates, full-plan comparisons, unchanged inventory, save round-trips, cross-tab updates, nested reference links, both URL aliases, and phone/tablet/desktop layouts. CI runs the seasonal tests and browser check.

## Existing progress

The compact progress values beside the candy answer open a focused editor for score, event day, pass ownership/claims, or collected income. They use the shared save automatically. Pass variants are retained across reloads in the optional `passVariant` field; older records remain valid. Where the kingdom age is saved, a known shared Town Center level also resolves the variant. Owned pass candy feeds back into the EV and is retained in the baseline for purchase comparisons.

Future plans respect saved gathering/Beast caps, remaining door days, current event day and claimed mission milestones. The remaining-known-rewards shortcut fills only sources with known saved progress. Unknown claims are excluded rather than re-awarded.

## Whole-pack comparison and artwork

The comparison table displays every remaining tier's overall item EV, gem-equivalent EV per currency unit, and points per currency unit at once. Each card shows every fixed reward with its original game icon and quantity, then separates fixed-item value, candy-derived expected value and any top-up bonus. `valueRewards` prices the entire reward vector, rather than just the candy. Cosmetics are displayed and explicitly unpriced.

Reference item weights were extracted from the same Kingshot Packs public item catalogue (`index-cda25e45.js`) on 28 October 2026 and are stored in the event data with their source. These are comparison weights, not cash or resale prices. Secured resources use the source's per-unit resource prices; alternate 5-minute healing/1,000-XP labels use their corresponding source item value. Candy itself is not separately priced after its rewards have been valued.

The event day is the only day count entered. Event and Trick or Treat remaining days derive from their respective configured durations. A saved “today's doors done” flag subtracts today's door visit. The remaining-door count is displayed, not entered again. Legacy saved door limits are still respected.

Artwork is locally served, original game artwork. `img/seasonal/SOURCES.md` records the source URLs. Small event, currency, chest and material icons identify rewards; no raster artwork or animations were generated.

## Item grids

Expected rewards, the full plan, pack contents, combined pack and pass items, and the item value assumptions are grids of items, not tables. Each item is its cut-out icon with the count set on its corner, green for rewards and ivory for gem weights, and the name beneath. No tile, frame or fill is drawn. The remaining packs form a ruled grid: EV per currency unit is the large figure, with price and points per unit beneath. The best rate carries a green rule, and each entry links to its pack card. The heading, candy entry, points headline, inputs and chapters are unchanged. Icon provenance and the reconstructed icons are described in `img/seasonal/SOURCES.md`.
