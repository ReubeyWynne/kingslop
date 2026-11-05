# Prose standard

Our copy's worst problem is structural rather than stylistic. Most notes on the site try to explain how their piece fits into everything else: which page saved the data, what feeds what, why the alternative won't work, what happens later. Every piece does this, so the same explanations turn up on every page and the one thing the reader needed is buried among them. Rewording doesn't fix that. Cutting does.

## Show, don't tell

The interface explains itself through its visual motifs: a dashed drop zone, a saved mark, a disabled control, a filled or empty row, a ruled table. Copy never describes how our site works, including what saves where, what a filter or setting does, what another tool picks up, or what happens after a click. If a reader can't tell, fix the motif rather than adding a sentence.

The exception is the game. Telling the reader which game screen to take a screenshot of, or which rows to copy, is about something we can't show, so it's allowed.

## The motifs

These are in `css/motifs.css`. A page opts in by putting the class or attribute on its own markup, and then the sentence it replaces goes.

| Motif | Markup | Replaces |
| --- | --- | --- |
| Saved seal | `<output class="seal">`, with `data-state="failed"` when saving fails | "Saved on this device" |
| Ghost ink | `input.ghost`, with the assumed value as its placeholder | "Using a typical … until you enter yours" |
| Unknown row | `tr[data-unknown]` | "Add your Squads' row", "blank means not counted yet" |
| Open-ended total | `output[data-open]`, followed by a `ul.unknowns` of what it's waiting for | "The total leaves out … until you enter them" |

The Heroes page uses all four. The rest of the catalogue (shared-by dots, a guest-mode frame, the ink-well affordance, best-day marks, source marks, the example stamp, undo in the toast and the share-link preview) comes with each page's own pass.

## One job per line

Every line of copy answers the question the reader has at that exact spot, and nothing else.

- A heading or button names the action: "Fill this in from screenshots".
- A note under a field tells the reader where the value comes from or what to do: "Copy the Military rows of your Bonus Overview."
- A status or warning says what's wrong right now and how to fix it: "Add your Squads' row. Until then, every lineup scores low."

If a line does none of these, cut it.

## What to cut

1. **Another component's mechanics.** A drop zone doesn't explain how the game's popup scrolls or pages, and a table doesn't explain the import panel. Each component describes only itself. Mechanics described second-hand are usually wrong, too.
2. **How it fits.** Don't say which page saves what, where data comes from, what else uses a setting, or which other tool shares it. If that matters, it goes in the page's one "How it works" disclosure, written once.
3. **Why not the alternative.** "Not a battle report, because…" answers a question nobody at that field asked. Put the reason in the method if it's needed at all.
4. **What the interface already shows.** Four joiner slots don't need "up to four joiners". A Saved indicator doesn't need a sentence about saving, and the review step doesn't need announcing before the reader gets to it.
5. **Warnings in advance.** A runtime message that appears when the Squads' row is missing makes a standing note about the Squads' row redundant. Warn when the problem happens.
6. **Facts that live elsewhere.** Each fact has one home. The Bear Hunt page explains the joiner rule, the hero directory explains roles, and the method disclosure explains the maths. Everything else points to them or leaves the fact out.
7. **Ingredient lists.** "Your overview plus hero stars, widgets and the hero gear saved on the Hero Gear page, your Town Centre's Truegold, city buffs and pets" is the formula, not the label. Name only what the reader needs in order to recognise the number.

## The test

Cover the line and ask whether the reader would do anything differently without it. If they wouldn't, delete it. Then read what's left aloud. It should sound like one person helping another, in whole sentences with ordinary contractions, and it should almost always be shorter than what you started with.

## Before and after

| Before | After |
|---|---|
| Use the Military rows of your Bonus Overview, not a battle report. A report already includes the heroes you sent, so it cannot compare one lineup with another. The Squads' row adds to every troop type. | Copy the Military rows of your Bonus Overview. |
| **Read Bonus Overview screenshots.** Pick, drop or paste them. The popup scrolls, so two shots cover all sixteen rows. You check each value before it fills the table. | **Fill this in from screenshots.** |
| Bonus Details for this lineup before joiners: your overview plus hero stars, widgets and the hero gear saved on the Hero Gear page, your Town Centre's Truegold, city buffs and pets. The Bear damage uses these. | Before joiners, with your hero gear and Truegold. |
| Set your server's generation to hide heroes you cannot use yet. Other tools share this setting; resetting filters keeps it. | Hides heroes your server doesn't have yet. |
| The Bear rewards damage. A caller uses the full kit; a joiner brings troops and a useful first skill. Defensive bonuses do not add Bear damage. Follow your alliance's joiner list and duplicate rules. | Look for damage. Defensive skills and widgets do nothing to the Bear. |

In the first row, the battle report reason moved to the lead finder's "How the ranking works", where the reader who wants the mechanism will look. The Squads' row warning was already shown when the row is empty.

## Translations

A cut changes what a string says, so its translations are now longer than the English and carry the removed material. Every pass lists the keys it changed so they can be re-translated. A stale translation that says more than the English is still accurate, but it brings back the noise this pass removed.
