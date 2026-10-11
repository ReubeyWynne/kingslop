# Castle Battle fieldbook

The page at `/castle-battle/` uses one role and one lesson at a time. Gen 2, developing Gen 3 and developed Gen 3 are comparison scenarios, not saved server settings or automatic recommendations.

## Content contract

- Hero effects and level values come from `_data/heroes.json` and `_data/hero_roles.json`. Saved stars, widget level and Expedition skills are read from the existing player ledger without modifying it.
- `_data/castle_battle.json` owns the editorial comparisons. These explain kit differences; they do not supply simulator multipliers or claim a numerically optimal lineup.
- The official Combat FAQ confirms simultaneous rounds, normal frontline targeting, squad skills working without matching troops, independent hero effects and the shared rally/garrison member skills. https://centurygames.helpshift.com/hc/en/140-kingshot/faq/9125-combat-faq-1783436100/
- Keep skill eligibility, selection and duplicate interactions separate. The FAQ’s four member skills do not establish all tie-breaking or stacking rules.
- The formation buttons are illustrative test candidates. No community ratio is treated as a proven optimum.
- Infantry depletion changes both active count and composition. The small exercise isolates infantry removal; it does not predict casualty categories or real battle losses.
- A wave’s capture objective and depletion objective are distinct. Net depletion also depends on reinforcement between hits. The existing troop-only simulator does not rank full hero lineups or reproduce the casualty lifecycle of a real wave.
- Report player names and screenshots are not part of this page.

The lesson body is English in this first pass. Shared navigation has all 17 language entries, and the controls follow the existing RTL-aware tabs module. Translate the lesson body after its mechanics and wording are settled.

## Checks

`node --test .dsh/castle-battle-check.cjs .dsh/page-deck-check.cjs`

`node .dsh/ascii-style-check.cjs`

After the Jekyll build, `node .dsh/castle-battle-ui-check.cjs` checks progression, shared roster details, formation accounting, keyboard direction and width constraints in English and Arabic. CI retains phone screenshots in the `preview-castle` artifact.

The new navigation entry reuses the existing banner scene. No generated frames or authored animation changed. The desktop navigation threshold moves to 1800px to accommodate the additional entry; smaller widths retain the existing ledger drawer.
