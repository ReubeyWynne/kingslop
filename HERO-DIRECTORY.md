# Hero directory

Milestone 4 adds `heroes/` to the shared navigation and tools index. All 34 hero identities, generations, troop types, rarities and Expedition skill ladders are rendered directly from `_data/heroes.json`. Canonical IDs and numerical values are preserved. No second hero list or generated browser catalogue is introduced.

## Role data and evidence

`_data/hero_roles.json` is companion metadata keyed by existing hero IDs. It records a review date, source links, portrait filenames, paraphrased skill notes and individual recommendations with a role, confidence, reason and source. All 34 heroes have portraits and skill notes. Heroes without reviewed recommendations remain visible.

The six role filters separate garrison leads, defensive joiners, offensive rally leads, offensive joiners, Bear Hunt leads and Bear Hunt joiners. Role explainers distinguish the stat source/full kit from the slot-1 first-skill contribution. Recommendations are alternatives to compare, not rankings or an account-specific optimal lineup.

Evidence labels are deliberately explicit:

- **Skill fit:** recorded widget or first-skill alignment. Widget alignment alone cannot prove the best developed lineup.
- **Community advice:** a linked guide supports the example. This is not an independent official verification.
- **Alliance policy:** the existing Bear Hunt permission list governs the recommendation.
- **Conditional:** Hilde's Bear participation requires checking the alliance policy.

Defender-widget heroes are candidates for garrison leadership; rally-widget heroes are candidates for offensive leadership. The Bear list includes those damage-oriented candidates and a sourced generation-2 Zoe alternative. Defensive widget skills are not claimed to improve Bear damage. Garrison joiner examples are Saul, Gordon, Howard, Fahd, Quinn and Eric. Bear joiner options retain the existing alliance choices, including Petra's duplicate caveat and Amadeus's leader priority. No new numerical combat weights or tier scores are added.

Catalogue snapshot: **2026-09-11**. Role-source review: **2026-10-08**. Generation-2 index-27 values are corrected to 199.02% using Kingshot Data progression tables, corroborated by the shared curve. The original comparison payload still contains 192.02%; the correction preserves this provenance and is not independently verified in-game. Star values are not used to rank heroes. Canonical names, skill labels and progression values remain in their recorded source language, with this limitation visible next to the skills.

Sources consulted:

- [Catalogue audit](KINGSHOT-SOURCES.md), including the source mappings for `_data/heroes.json`.
- [Kingshot.net hero-stat comparison](https://kingshot.net/hero-stat-comparison), the catalogue's stat source; no new stat data was scraped or substituted.
- [Daryl's Advanced Rally Guide](https://kingshotguides.com/guide/advanced-rally-guide/) for caller/participant mechanics.
- [Garrison guide](https://heaven-guardian.com/kingshot-garrison-guide/) for defensive joiner examples and stat-source checks.
- [Kingshot Wiki's beginner Bear Hunt guide](https://kingshotwiki.com/beginner-bear-hunt-guide/) for role distinctions, offensive widgets and Zoe as an alternative.
- [Existing Bear Hunt policy](bear-hunt/index.html) for approved and conditional joiners. Source disagreements on chance-skill stacking are not resolved into a new universal numeric rule; the local policy remains explicit.

## Filtering and shared context

The DOM is the catalogue view. A scoped `hero-directory` module reads static attributes and uses the pure `HeroDirectory.matches` predicate to combine name, troop, exact generation, role and maximum server generation. It updates hidden states and a localized result count; skills use the existing `disclosure` module.

Server generation reuses `KS_SERVER_AGE` and its existing key/event. It means the highest available generation, not the generation of a particular selected hero. It is shared across tools and tabs. Reset clears the directory filters but retains the server limit; selecting Unspecified clears that shared preference. Later server generations beyond the documented catalogue remain valid and show all documented heroes. The directory does not write player inventory or infer unlock dates from calendar age.

Without JavaScript, every hero, source link, reason, role explainer and native skills disclosure remains available. Filter controls are disabled until enhancement. UI copy uses the separate `directory.*` namespace so existing Bear Hunt `heroes.*` strings remain unchanged. All 17 dictionaries include the new copy.

## Integration and validation

Canonical navigation order is Home → Event Cycle → Bear Hunt → Vikings → Swordland → VIP → Simulator → Heroes → Gear → Home. Shared header, drawer, footer and page deck derive their links from `_data/nav.json`. Page metadata updates both adjacent swipe links. Home's tools list includes Heroes and the previously absent Gear link in the same order.

The ninth navigation entry raises the desktop strip threshold to 1600px and adjusts the common masthead width allowance. The drawer remains available below it. Styling follows flat manuscript sections, logical spacing and one page signal hue.

`.dsh/hero-directory-check.cjs` checks catalogue coverage, metadata referential integrity, reason/widget consistency, source/confidence labels, combined filters, conditional choices, the complete navigation cycle and all translation keys. `.dsh/hero-directory-ui-check.cjs` checks the actual Jekyll page, live filtering, saved/shared/cross-tab generation, future generations, native disclosure, all 34 portrait paths and first-skill notes, navigation/home links, static fallback and 17 languages at 320/390/768/1280/1600/1920px. Existing event, ledger, module, gear and OCR CI checks remain enabled.

## Completion pass · 2026-10-08

All 34 canonical heroes have local 256×256 WebP portraits, individual official-wiki links and paraphrased notes for every Expedition skill. Notes preserve fixed proc chances, turn timing, damage multipliers and troop scope. Quinn’s two Expedition names, Petra’s Attack label and Diana’s Beast/Terror march scope are corrected against the wiki. Wiki spelling variants remain in the field notes without changing canonical IDs. Olive’s bread-gathering effect is corroborated by Kingshot Optimizer’s in-game skill listing and Kingshot.net’s Bread Gathering Speed label; her note links the supporting listing because the official wiki has a broken resource placeholder. Three generation-2 star-ladder entries change as documented above; no combat formulas change.

Quinn and Eric are defensive-joiner candidates inferred from their official first skills; this is not an official lineup recommendation. Existing Bear policy and conditional recommendations are retained.

The roster is ordered by generation and drawn as portrait tiles (portrait, name, troop) under generation rank lines; short generations pair up from 651px. Each tile is a native `details[name="hero-dossier"]`, so one dossier is open at a time; it spans the full row with role tags, first skill, recommendations and the skill ladder, and `#hero-<id>` links open it. Closed dossier bodies are `display: none` so they never lay out at tile width. The page has its own ASCII helm emblem in the hero and on the deck cover. Core source notes remain English and carry an explicit language marker. The event inventory defaults to items scoring on the selected day, with an all-items switch; hidden counts are retained. Save tools describe one shared backup, and gear reset is labelled as gear-scoped.

## Collection pass · 2026-10-10

The directory reads and writes the shared player ledger. Each dossier opens with a "Your copy" form: owned, level, stars (0★ to 5★ in sixths), widget level for heroes with a widget, every Expedition skill level and the hero's own shards. A strip under the filters edits the general mythic, epic and rare shards and widget parts that the event planner already counts. Tiles show your level and stars; once anything is recorded, heroes you do not own are dimmed, and a Collection filter shows owned or missing heroes. The count line adds how many you own.

The roster is now one band per generation with the rank in a narrow gutter, so each short generation is a single row of tiles. Generation 1 is split into Legendary, Epic and Rare bands; every band orders infantry, cavalry, archers (`HeroDirectory.compare`). Tiles carry a troop mark on the portrait instead of a text line. From 651px generation 1's tiers sit side by side and the later generations pair up; filters sit on one row. The role shortlist note moved to the roles section and the server note became the server field's tooltip. At 390px the directory is about 30% shorter.
