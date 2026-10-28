# Halloween candy value

Both `/seasonal/` and `/seasonal/halloween-party/` open the Halloween candy calculator. There is no intermediate event listing while Halloween is the only seasonal event. The existing Seasonal navigation, carousel and footer links remain in place.

## User flow

The first screen takes one input: candy held. It immediately shows expected Prankster Points and the expected items from all three chest types. It requires no score, event date, target, purchase history or pass setup. A new visitor sees an explicitly labelled 1,000-candy example; this example is not written to the player save. Replacing it records the player's candy.

Future income expands separately. Players enter remaining door days, gathering/Beast candy, future gem/speedup spending and other income. Gathering and Beast fields are remaining candy, not full caps to be awarded again. A small mission calculator counts today's unclaimed milestones and future stages. It excludes closed stages and excludes today's rewards when current claims are unknown. The full-plan result compares held-candy rewards with all planned rewards, including mission items and selected pack contents.

Purchase comparisons show the pack's own items plus the expected rewards from its candy. Players can compare points, Gems, Forgehammers, shards, Truegold, custom chests, material chests or speedup minutes per currency unit. No universal gem-price score is imposed. Rates use the source's USD/EUR prices without conversion. Every remaining tier is visible, with unlock costs identified. Selecting a later pack adds its missing prerequisite tiers; quantities respect the final pack's remaining allowance. Previously purchased items are not re-added to held candy.

Pass comparisons are separate because they need current points and the in-game reward variant. They value a new unclaimed paid track, including already unlocked rewards and the further attacks its candy enables. Owned passes cannot be selected for another purchase. Top-up bonuses are optional and require known prior top-up points; previously unlocked tiers are treated as collected. Free-track rewards, already owned pass rewards, future daily chests and the shared jackpot are excluded from candy-only EV.

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
