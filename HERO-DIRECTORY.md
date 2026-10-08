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

Catalogue snapshot: **2026-09-11**. Role-source review: **2026-10-08**. The generation-2 star-ladder anomaly remains unverified and is not used to rank heroes. Canonical names, skill labels and progression values remain in their recorded source language, with this limitation visible next to the skills.

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

All 34 canonical heroes have local 256×256 WebP portraits, individual official-wiki links and paraphrased notes for every Expedition skill. Notes preserve fixed proc chances, turn timing, damage multipliers and troop scope. Percentages remain the existing catalogue level ladders. Quinn’s two Expedition names, Petra’s Attack label and Diana’s Beast/Terror march scope are corrected against the wiki. Wiki spelling variants remain in the field notes without changing canonical IDs. Olive’s wiki gathering-resource placeholder is explicitly unresolved. No star-ladder values or combat formulas change.

Quinn and Eric are defensive-joiner candidates inferred from their official first skills; this is not an official lineup recommendation. Existing Bear policy and conditional recommendations are retained.

The roster is ordered by generation, uses a two-column ruled layout on larger screens and keeps skill/recommendation dossiers in native disclosures. Core source notes remain English and carry an explicit language marker. The event inventory defaults to items scoring on the selected day, with an all-items switch; hidden counts are retained. Save tools describe one shared backup, and gear reset is labelled as gear-scoped.
