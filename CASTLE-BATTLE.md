# Castle Battle explainer

`/castle-battle/` opens with the event, then offers Combat, Joiners and Troops lessons. Leader-kit examples sit inside the combat lesson; they are Gen 2–3 comparisons, not the definition of Castle Battle.

## Editorial decisions

- Open with communication and assigned roles. Caller, rally lead, garrison lead and joiner duties are alliance assignments; join requirements can be strict. Reserve lead accounts for their jobs, prioritise available high-tier troops for the castle, and explain role-specific account building.
- Teach occupation, turret pressure, preparation, capture, holding and retaking before hero selection.
- Treat attacking and defending as two sides of combat: both deal damage and both benefit from survival. Bear-only joiner prescriptions are insufficient for Castle.
- Include Gordon, Saul, Fahd and Eric as PvP survival contributions, with Chenko and Amane as damage support. Howard is a fallback, not an automatically superior garrison option. Explain scope and stacking with hero-specific sources.
- Distinguish the garrison's displayed captain from its active bonus and skill sources. Do not replace that distinction with “highest power player leads everything.”
- Remove the generic strength-gap selector and “Rally waves” lesson. Explain actual arrival arithmetic and how ownership and reinforcements change the next fight.
- Remove the preset ratio/depletion toy. The refill tool accepts target capacity, target percentages and current counts. It reports deficits, surplus and capacity conflicts. It does not simulate combat or prescribe a meta ratio.
- Retain shared hero data and saved roster display without changing the ledger.

## Copy and layout

Follow the Bear and Swordland pages: short instructions, ruled examples, and secondary detail behind fleuron disclosures. Each tab has a few spaced chapters. Keep headings literal and brief; avoid slogans, repeated caveats and paragraph-length summaries. Sources remain at the foot of the page, with exact formulae and report checklists available on demand. The refill result should name the missing troops in one short instruction.

## Evidence audit · 11 October 2026

| Source | Used for | Limit |
| --- | --- | --- |
| [Century Games Castle Battle](https://centurygames.helpshift.com/hc/en/140-kingshot/faq/9047-castle-battle-1783425489/) | Event objective, turrets and map preparation | Local wording does not explicitly say consecutive; live rules take priority. |
| [Kingdom of Power duration](https://centurygames.helpshift.com/hc/en/140-kingshot/faq/8352-how-long-do-i-have-to-attack-the-king-s-castle-to-be-the-winner-during-the-battle-phase-of-kingdom-of-power/) | Current five-hour window and 2½-hour consecutive early win | Older indexed variants still show six / three. Do not mix those versions. |
| [Official Combat FAQ](https://centurygames.helpshift.com/hc/en/140-kingshot/faq/9125-combat-faq-1783436100/) | Targeting, turns, casualties, skill scope, four member skills and garrison bonus source | Does not fully specify joiner tie-breaking or the overlapping defensive roles. |
| [Sloth's published combat guide](https://kingshotoptimizer.com/guides/kingshot-combat-guide/) | Combat interpretation and rally contributions | Does not replace a hero-specific interaction test. |
| Kingshot Optimizer hero analyses linked from `_data/castle_battle.json` | Hero-specific tested behavior | Authored by Sloth/Zebrave, crediting joint testing with Frak. Tooltip values and effective behavior are distinct. |
| [Petra](https://kingshotoptimizer.com/heroes/petra/) / [Marlin](https://kingshotoptimizer.com/heroes/marlin/) | Duplicate first-skill interactions | Do not generalize to every chance skill or later-generation exception. |
| Existing `MATHS.md`, `KINGSHOT-SOURCES.md` and `js/battle-engine.js` | Frakinator model provenance and stat factors | Community model, not official code; the site's simulator omits heroes. |

Direct video links use the chapters verified from the creator's video description:

- [Rally Mechanics Demystified](https://www.youtube.com/watch?v=5RrphiHLzxU): 01:10 contributions; 03:25 selection; 08:30 overlapping defensive roles; 14:46 offensive joiners; 16:42 defensive joiners.
- [Combat breakdown](https://www.youtube.com/watch?v=6_oGKp3YfiE).

Full transcripts were unavailable during this audit. Mechanical claims are grounded in the creator's published analysis, official rules and the repository's existing Frakinator extraction; chapter descriptions alone are not treated as proof of unseen details. This revision deliberately avoids publishing an unverified exact skill-selection tie-break or garrison-role manipulation recipe. Inspect the actual rally window.

Community SEO guide consensus is not evidence. Do not reintroduce a universal ratio, classify all survival joiners as defense-only, or claim four chance skills produce four independent buffs without a specific test.

## Validation

`node --test .dsh/castle-battle-check.cjs .dsh/page-deck-check.cjs`

`node .dsh/ascii-style-check.cjs`

After the Jekyll build, `node .dsh/castle-battle-ui-check.cjs` checks all lessons, leader examples, saved roster updates, refill accounting, invalid input, source disclosures, RTL keyboard handling and widths from 320 to 1920 pixels. It captures each lesson on a phone viewport in English and Arabic chrome. The lesson body remains English and explicitly uses LTR direction within Arabic page chrome. Tab keys follow their nearest direction attribute so mixed-language sections preserve visual order.

No authored animation changed. The navigation integration reuses the existing banner scene.

## Player screenshots and Gen 4 additions

The supplied march screenshot marks Gordon with the green rally banner. The Amadeus Skills screenshot places Battle Ready beneath the right-hand Expedition flag. Use these as UI identification examples; the banner shows eligibility, not proof of selection among the four shared skills. Original screenshots are retained under `img/castle/`.

[Sloth's Margot analysis](https://kingshotoptimizer.com/heroes/margot/) verifies the third-skill cavalry extra attack, squad-wide dodge and defender-lethality widget. [Alcar analysis](https://kingshotoptimizer.com/heroes/alcar/) explains infantry damage and defensive support in the Gen 4 60/40 setup. Together these explain why the formation needs the relevant leader kit. The low-cavalry offensive response is included as a possible alliance call supplied by the user, not a fixed Gen 4 counter ratio or guaranteed result; [Sloth's later Luna analysis](https://kingshotoptimizer.com/heroes/luna/) also identifies a 50/0/50 response to Gen 8 Liz 60/40 garrisons. Do not conflate those generations or invent a universal counter.
