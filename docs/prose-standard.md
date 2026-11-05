# Prose standard

Write the copy the way a teammate would say it in alliance chat if they were patient and knew the game. Short is still the goal. Natural doesn't mean longer; it means the reader never has to rebuild the sentence in their head.

This applies to every English string in `i18n/en.js` and the matching fallbacks in the HTML and scripts. The voice rules in [i18n/README.md](../i18n/README.md) still hold: speak to *you*, never gender the player, and propagate changes.

## Why the clipped style tires people

Most of our bad copy is correct. It tires the reader because it hands them facts and leaves them to work out how the facts connect and what to do about them. Readability research and the big public style guides (GOV.UK content design, the Microsoft Writing Style Guide, plainlanguage.gov, Nielsen Norman Group's work on how people scan) agree on a few causes:

- **Missing connectives.** Words like *so*, *because*, *but*, *then* and *once* carry the logic. Strip them out and every sentence lands as an unrelated fact.
- **Flat rhythm.** Three or four sentences of the same short length in a row read like a list of rules or a telegram. Varying the length is what makes text sound spoken.
- **Uncontracted words.** *Cannot*, *does not* and *it is* sound like a contract. People say *can't*, *doesn't* and *it's*.
- **Facts with no instruction.** "The Squads' row adds to every troop type" leaves the reader asking *so what?* Say what to do: "so fill that in too".
- **Objects doing the acting.** "A report cannot compare one lineup with another" makes a screenshot the subject of an argument. Make the reader or the action the subject.
- **Narrating the reader.** "You check each value before it fills the table" describes the reader in the present tense, like stage directions. Use the future, or put it as a promise: "you'll check every number before it goes in".
- **Verb lists and labels.** "Pick, drop or paste them" and "Rally and garrison: your lineup fights…" are interface specs, not sentences.

## The rules

1. **Lead with what the reader wants**, then the reason. One idea per sentence, and link the ideas with plain connectives.
2. **Vary the length.** Mix a short sentence with a longer one. Never three short ones in a row, and nothing over about 30 words, because a phone shows a long sentence as a wall.
3. **Contract**: *can't, don't, isn't, won't, it's, you'll*. Keep the full form only for emphasis, and then bold it.
4. **Turn every fact into a reason or an instruction.** If the reader can't act on it, cut it or attach it to something they can.
5. **People and actions are subjects**, not screens, reports or features.
6. **Name the one action most people take.** "Add them here, or paste them" beats listing every input method.
7. **No semicolons in UI copy.** Use *and*, *but*, *so*, or a full stop.
8. **Labels stay in labels.** Don't open a sentence with "Thing: …". Write "For the Bear, …" or "This leaves out …" instead. Chips, table headers and legends can stay terse.
9. **Titles are verbs about the reader's goal**, not the site's machinery: "Fill this in from screenshots", not "Read Bonus Overview screenshots", where *read* could mean either of you.
10. **Read it aloud.** If you wouldn't say it to someone at the next desk, rewrite it.

## Before and after

| Before | After |
|---|---|
| Use the Military rows of your Bonus Overview, not a battle report. A report already includes the heroes you sent, so it cannot compare one lineup with another. The Squads' row adds to every troop type. | Take these from the Military rows of your Bonus Overview. A battle report won't work, because its numbers already include the heroes you sent. The Squads' row counts for every troop type, so fill that in too. |
| **Read Bonus Overview screenshots.** Pick, drop or paste them. The popup scrolls, so two shots cover all sixteen rows. You check each value before it fills the table. | **Fill this in from screenshots.** Add them here, or paste them. The popup scrolls, so it takes two shots to catch all sixteen rows, and you'll check every number before it goes in. |
| Rally and garrison: your lineup fights each stock opponent of your kingdom's generation, both sides at 100,000 troops in the usual mixes, 24 battles a fight. | For rallies and garrisons, each lineup fights every stock opponent from your kingdom's generation 24 times, with both sides at 100,000 troops in the usual mixes. |
| The Bear rewards damage. A caller uses the full kit; a joiner brings troops and a useful first skill. Defensive bonuses do not add Bear damage. | The Bear is all about damage, so defensive bonuses don't help. A caller uses all three heroes' kits, while a joiner brings troops and one useful first skill. |
| No items I track were found on one screenshot. It was skipped. | I skipped one screenshot because it had nothing I track. |
| Avoid duplicate Petras in one rally; follow the alliance policy. | One Petra per rally is plenty, because a second wastes a spot. Follow your alliance's rule on who sends her. |

## The check

`node .dsh/prose-check.cjs` reads `i18n/en.js` and flags the patterns a script can see: uncontracted negatives (`stiff`), three short sentences in a row (`choppy`), a verb list used as an instruction (`verbList`), semicolons, label-colon openers (`labelColon`) and sentences over 32 words (`long`). It only looks at strings of eight words or more that end like a sentence, so chips and labels are left alone.

Older copy that already broke a rule is listed in `.dsh/prose-baseline.json` and only warns. New or edited strings must pass, so the baseline only shrinks. When you fix an old string, run `node .dsh/prose-check.cjs --update` to drop it from the baseline. `--report` lists everything, baseline included, and is the place to find the next strings to rewrite.

The script can't tell whether a fact has an instruction attached or whether the reader is the subject. That part is still on whoever writes and reviews the copy.

## Translations

Rewrites under this standard change tone, not meaning, so an older translation isn't wrong, just stiffer. Each prose pass lists the keys it touched so they can be re-translated for tone by a fluent speaker, rather than machine-rewritten in bulk.
