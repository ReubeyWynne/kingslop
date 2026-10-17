# Kingdom progression

`/kingdom-timeline/` is a generic, manually selected progression guide. It has no kingdom-number lookup, creation-date inference, automatic advancement or date prediction. The chapter order is illustrative; each chapter supplies editable defaults, not verified observations for a particular kingdom.

`_data/kingdom_progression.json` supplies the static chapter list, starting profiles, guide links and sources. Jekyll emits the same catalogue as `/js/kingdom-data.js`. The first catalogue covers generations 1–7, Truegold 3/5/8 and War Academy. Players can enter later generations and TG10 directly.

## Shared context

The player ledger owns `preferences.kingdom`, accessed through `store.kingdom()` and `store.setKingdom(profile, expectedRevision)`. Old saves without it remain valid. Its complete shape is:

```json
{"position":null,"generation":null,"truegold":null,"warAcademy":null}
```

`position` is a chapter ID or null; `generation` is 1–99 or null; `truegold` is 0/3/5/8/10 or null; `warAcademy` is a boolean or null. Null means unknown, not locked. Zero Truegold means not unlocked. These are kingdom availability settings, separate from the heroes, building levels and inventory actually owned by the player. Corrections clear the selected chapter but retain other unlock settings. Selecting a chapter replaces the whole progression profile, including when moving backwards. Clearing progression retains all unrelated player data.

`KingdomProgression.get/set/blank` is the browser interface. `availability(requirements, profile?)` is the shared resolver for minimum generation/Truegold requirements and the War Academy flag. It returns `available`, `upcoming` or `unknown`; a known unmet requirement wins over unknown requirements. Callers must not treat unknown as locked. It does not determine ownership, personal prerequisites, upgrade affordability or event-day eligibility.

`js/server-age.js` keeps `KS_SERVER_AGE` as a compatibility adapter over the ledger. Its generation setters preserve independent Truegold/War Academy settings and clear the chapter. A valid old `ks_server_age` preference migrates only its generation when the ledger has no progression setting. The legacy key is removed only after a successful ledger write. Invalid legacy data and corrupt player saves are not replaced. A cleared profile is explicit, so reload cannot restore an old generation. Unified save import/export includes progression; importing an older save clears the context rather than inventing unlocks.

Ledger subscriptions keep the context indicator, timeline and existing hero controls in sync, including across tabs and after save imports. `ks:server-age-change` retains the legacy generation payload; `ks:kingdom-change` carries the full profile. Neither event is emitted for unrelated inventory edits. Failed writes are surfaced without displaying an unsaved selection as saved.

## UI scope

The shared layout includes a compact link to the progression editor on every page. The timeline is also linked from the ledger drawer. It is deliberately outside the page-deck ring, like the Town Centre, to avoid adding another item to the desktop strip.

Both the Heroes page and Town Centre use the existing shared hero directory. They default to the saved generation and offer a local “Show upcoming heroes” checkbox. Upcoming heroes are labelled; this browsing override does not change saved progression. Resetting the ordinary directory filters retains the kingdom setting. Existing calculators, spending totals, saved heroes and building levels are unchanged in this slice. Future consumers should use `availability()` rather than derive every feature from hero generation.

All new UI keys are provided in the 17 dictionaries. Static chapters remain readable without JavaScript; persistence controls are disabled. The page uses the manuscript layout and an independent pale-blue signal without introducing new animation.

## Verification

- `node .dsh/kingdom-progression-check.cjs`: legacy migration, old/corrupt saves, unknown versus locked unlocks, independent corrections, unrelated fact preservation, revisions, import/export and cross-tab events.
- Build Jekyll, then `node .dsh/kingdom-progression-ui-check.cjs`: actual chapter selection, corrections, both-tab hero scope, preview, reload, save import, blocked writes, no-JavaScript rendering and 17 languages at 320/768px. Screenshots are written to `.dsh/kingdom-preview/`.
- The existing ledger, hero directory, Town Centre, spending and navigation checks remain applicable. Site check runs the new domain and browser checks.
