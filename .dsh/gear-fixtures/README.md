# Hero overview fixtures

Six original Kingshot screenshots supplied for this feature on 6 October 2026,
and `zoe-arrow.jpg` on 31 October 2026.
They contain game screens without player/account identifiers. Game artwork is
published by Century Games. The browser test reads these files through the
production local PaddleOCR worker, with no recognised-word stubs.

| File | Troop | Helm | Gloves | Chest | Boots |
| --- | --- | --- | --- | --- | --- |
| zoe.jpg | Infantry | mythic +69 / mastery 2 | red +20 / mastery 11 | mythic +100 / mastery 6 | mythic +72 / mastery 3 |
| marlin.jpg | Archer | mythic +100 / mastery 6 | mythic +69 / mastery 2 | mythic +69 / mastery 2 | mythic +100 / mastery 6 |
| petra.jpg | Cavalry | mythic +63 / mastery 2 | mythic +39 / mastery 1 | mythic +40 / mastery 1 | mythic +63 / mastery 1 |
| jabel.jpg | Cavalry | epic +0 / mastery 0 | mythic +0 / mastery 0 | mythic +0 / mastery 0 | mythic +0 / mastery 0 |
| diana.jpg | Archer | mythic +0 / mastery 0 | mythic +0 / mastery 0 | mythic +0 / mastery 0 | epic +0 / mastery 0 |
| zoe-arrow.jpg | Infantry | mythic +61 / mastery 3 | red +35 / mastery 11 | mythic +100 / mastery 7 | mythic +65 / mastery 3 |
| howard.jpg | Infantry | mythic +0 / mastery 0 | mythic +0 / mastery 0 | mythic +0 / mastery 0 | mythic +0 / mastery 0 |

Red enhancement is stored as total level 100 + its displayed enhancement.
The troop badge's 16 × 16 luminance signatures in `js/hero-gear-ocr.js` are
extracted from Zoe, Marlin and Petra's helm badges. No hero name is required;
unknown badges leave troop assignment empty for review. Exclusive widgets below
the hero are excluded by the four-piece layout detection.

In `zoe-arrow.jpg` the green upgrade arrow covers the top of the 5 in the red
gloves' +35, so the reader sees +3 and a hook. It cannot tell which digit is
hidden, so the check expects that level flagged for a look rather than read.
