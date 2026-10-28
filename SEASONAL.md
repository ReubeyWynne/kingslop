# Seasonal events

`/seasonal/` lists calendar events separately from the recurring 28-day Event Cycle. Its first planner is `/seasonal/halloween-party/` for Halloween 2026. Seasonal dates are not inferred from the recurring clock; players enter the remaining days from their in-game timer.

## Source and rules

`_data/seasonal/halloween_party.json` contains factual tables extracted on 28 October 2026 from https://kingshotpacks.com/halloween-party and its public `CovenClash-f1da1b82.js` module. This is a community calculator source, not independent confirmation of the game. The module URL and retrieval date are recorded in the data. No source UI or simulator implementation is copied.

The tables include three chest distributions, Witch visit and free-attack distributions, seven pack tiers, five top-up thresholds, ranking brackets, ten mission variants across seven stages, and five server-age pass variants with 21 levels on three tracks. Static reference tables and browser data consume the same JSON through Liquid.

The new pure engine implements the source model independently. Paid attacks cost 20 candy and score 2 points; free attacks score points too. A Pumpkin takes ten hits. Its defeat can summon a Witch. Paid hits on either target advance the pity counter. Free hits do not advance it, following the source's stated assumption. The source's candy-rain average is also an assumption. Forecasts exclude the shared jackpot because pot size and other players' wins are not known.

## Progress and plans

The optional `seasonal` section of the shared player save holds validated progress by occurrence ID (`halloween-2026`). Existing saves remain valid. Save export/import, revision checks, storage failure handling and cross-tab notifications use the existing ledger. Each occurrence has separate state; the planner never rolls progress forward into another year.

Saved fields are current points and candy, remaining event and door days, today's points, collected gathering/Beast candy, purchase counts, owned pass tracks, claimed pass levels, claimed mission milestones, top-up progress, kingdom age, Town Center and attack progress. Null means unknown and zero means confirmed zero. The Town Center input uses the shared building level when no event-specific value is recorded. A shared hero generation is not converted into a guessed kingdom age.

Target points, future spending, additional purchases and intended milestones are temporary what-if inputs. They do not deduct inventory or write holdings. Reload resets them. Importing progress retains the open temporary plan, which is recalculated and validated against the imported facts.

Held candy is authoritative. Past packs and previously claimed rewards do not generate more candy. New pack purchases require known purchase counts, earlier tiers unlocked, and remaining allowance. Mission plans count only milestones after the claimed count and reject closed stages. Gathering and Beast plans clamp to remaining caps. Unknown source progress excludes the corresponding planned income and marks the budget partial.

Top-up rewards are incremental: previously earned thresholds are excluded and are assumed to have been collected. The planner does not recover previously unlocked but unclaimed top-up rewards. The daily chest display reports the remaining points and hits for today; future daily chests are not added to forecast rewards.

## Forecast

The worker runs 200 reproducible seeded simulations on explicit request. It starts at the current points, held/planned candy, known attack progress and claimed pass levels. Newly claimable candy on active pass tracks feeds back into attacks. Other newly claimable pass rewards and random chest drops are counted separately from planned purchase and mission rewards. Unknown pass claims or unknown age/Town Center variants exclude those pass rewards.

Results show the median, 10th–90th percentile finish, and fraction reaching the points target. A purchase scenario also runs a matched scenario without additional purchases for comparison. Editing progress or plans cancels the worker and clears stale results. A bounded simulation reports that its limit was reached instead of presenting a truncated forecast as a complete result.

The range is conditional on completing planned candy income and on the source model. Door income uses its expected value, so the percentile range does not include uncertainty in door rewards. No jackpot, final rank, live account reading or automatic purchase is modelled. The permanent skin has two independent routes: 12,500 points regardless of rank, or a top-10 finish. This corrects the source calculator’s top-500 restriction, following the user’s event clarification on 28 October 2026.

## UI and verification

Pages use the existing layout, page deck, shared save controls and declarative modules. The navigation labels are translated in all dictionaries. The first event's guide and planner copy is explicitly English (`lang="en"`, `dir="ltr"`), following the Castle guide's existing pattern; selecting another site language preserves progress and the open scenario. Full planner translation is separate work.

All reference disclosures have stable IDs and use the shared deep-link handler. The page reuses the existing moon scene without changing generated animations.

Run:

```
node --test .dsh/seasonal-check.cjs
node .dsh/player-ledger-check.cjs
node --test .dsh/page-deck-check.cjs
jekyll build
node .dsh/seasonal-ui-check.cjs
```

The UI check accepts `SITE_ROOT` for an alternate build location and uses the shared browser harness. It exercises the worker, incremental purchases, reloads, shared Town Center fallback, cross-tab updates, save import/export, nested deep links, navigation and 320/768/1920px layouts. CI runs both seasonal checks.
