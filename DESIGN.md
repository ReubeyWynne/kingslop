---
name: Kingshot, Demystified — dey.ci
description: The Night-Scout's Ledger — Kingshot alliance events, demystified in a dark manuscript voice with one signal hue per event.
colors:
  void: "#0B0E16"
  void-2: "#121726"
  navy: "#1A2B47"
  ink: "#F1E3C2"
  ink-dim: "#C7BC9D"
  ink-muted: "#9D957F"
  amber: "#F5C851"
  amber-dim: "#D3A33E"
  oxblood: "#8C3030"
  hunt-moss: "#AEC878"
  forge-ember: "#E08A3C"
  duel-crimson: "#E05555"
  enemy-steel: "#4E74CB"
  court-amethyst: "#C5A3EE"
  campaign-gold: "#D9B25A"
  campaign-gold-dim: "#A9823B"
  crown-gold: "#F0CE7A"
  crown-gold-dim: "#C69A4E"
typography:
  display:
    fontFamily: "'Cinzel Decorative', 'Cinzel', serif"
    fontWeight: 700
  headline:
    fontFamily: "'Cinzel', 'Georgia', serif"
    fontWeight: 600
  body:
    fontFamily: "'Alegreya', 'Georgia', serif"
    fontWeight: 400
  label:
    fontFamily: "'Alegreya', 'Georgia', serif"
    fontWeight: 700
    letterSpacing: "0.14em"
    textTransform: "uppercase"
rounded:
  none: "0"
  sm: "1px"
  md: "2px"
  lg: "3px"
spacing:
  s: "clamp(1rem, 0.9rem + 0.5vw, 1.3rem)"
  m: "clamp(1.5rem, 1.35rem + 0.75vw, 2rem)"
  l: "clamp(2.2rem, 2rem + 1vw, 3rem)"
  xl: "clamp(4rem, 3.2rem + 4vw, 6rem)"
  measure: "46rem"
components:
  tag-lead:
    textColor: "{colors.amber}"
    typography: "{typography.label}"
  tag-you:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
  rule-num:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.void}"
    rounded: "{rounded.none}"
  toc-active:
    textColor: "{colors.amber}"
  detail-summary:
    textColor: "{colors.amber}"
    typography: "{typography.label}"
  hero-portrait:
    backgroundColor: "{colors.void-2}"
    border: "1px solid {colors.amber-dim}"
    rounded: "{rounded.md}"
  input-field:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  lang-menu:
    backgroundColor: "{colors.void-2}"
    border: "1px solid {colors.ink-muted}"
    rounded: "{rounded.lg}"
---

# Design System: Kingshot, Demystified — dey.ci

## Overview

**Creative North Star: "The Night-Scout's Ledger"**

The site is a scout's field ledger read by lamplight on a dark night — the ground is a near-black navy (`#0B0E16`), the prose is warm parchment ivory, and every event gets exactly one glowing signal hue that lights the way: gold for the home court, moss for the hunt, amber for the forge, crimson for the duel, amethyst for the court, gold for the campaign. You read it like marginalia on a campaign report — rules, proofs, and disclosures set as manuscript notes, not boxes.

It is deliberately **printed, not digitized**: sharp letterpress edges (1–3px radii, never round), ruled data-viz drawn in the world's own grammar (bars, wave rails, bracket ranks, square rule cells), a recurring ❧ fleuron as the brand mark, and drifting ember "dust" motes behind the content. Density is high but the voice stays low — copy reads as a companion explaining the event, with the exact maths tucked behind a disclosure prompt so the page never feels like a chore. **Mobile is the primary target**: the layout, fluid type, and the 46rem measure are all built to be read one-handed during a live event, then scale up gracefully.

**Key Characteristics:**
- Ink-on-night: parchment ivory prose on a near-black navy ground, one signal hue per event.
- Printed, not digitized: sharp 1–3px letterpress edges, never rounded cards.
- Manuscript voice: bold for emphasis, italic only for the marginal-gloss voice; display faces never italic.
- Ruled data-viz: bars, wave rails, and bracket ranks drawn in the manuscript grammar.
- Flat paper: depth by tonal layering and hairlines; shadows only for things that lift off the page.
- The ❧ fleuron: opens active nav, tags, rank titles, and disclosure prompts.

## Colors

One warm signal hue per event, receding ink-on-night neutrals, and a rubrication red for failure. The signal's rarity is the point — it marks what's active, not decoration.

### Primary
- **Antique Gold** (`#F5C851`, dim `#D3A33E`): the one signal on the home page — active nav, key numbers, highlights (`.hl`), rule-cell numerals, disclosure prompts, focus states, the progress fill. Dimmed for secondary signal use.
- **The Per-Event Signals** (each page's `--amber` pair, one hue per world): **Moss-Verdigris** `#AEC878` (Bear Hunt — the hunt signal), **Ember Orange** `#E08A3C` (Vikings — the forge), **Duel Crimson** `#E05555` (Swordland — your side), **Amethyst** `#C5A3EE` (VIP — the court), **Campaign Gold** `#D9B25A` (dim `#A9823B`, KVK — the campaign of kings), with the **Strongest Governor** sections stepping up to a brighter **Crown Gold** `#F0CE7A` (dim `#C69A4E`).

### Secondary
- **Enemy Steel-Blue** (`#4E74CB`, dim `#3C5CA6`): the other side in Swordland; **Battle Red** (`#E05555`) is the enemy kingdom in KVK. Used sparingly to name the opponent.

### Neutral
- **Navy-Black Night** (`#0B0E16`): the ground — page background, `--void`.
- **One Step Up** (`#121726`): `--void-2`, fields and raised surfaces behind content.
- **Kingshot Deep Navy** (`#1A2B47`): `--navy`, the deep accent.
- **Parchment Ivory** (`#F1E3C2`): `--ink`, the prose color.
- **Dim Ivory** (`#C7BC9D`): `--ink-dim`, secondary text.
- **Muted Ivory** (`#9D957F`): `--ink-muted`, tertiary (≥5.4:1 on void).
- **Rubrication Red** (`#8C3030`): `--oxblood`, failure marks and rubrication — never for the primary signal.

### Named Rules
**The One Signal Rule.** Each event wears exactly one signal hue (its `--amber`). Everything active is that hue; everything else recedes to ink on night. The signal's rarity is the point — it lights the way without shouting.

**The Ink-On-Night Rule.** Prose is parchment ivory on navy-black night. Never put gray text on a colored background; never use pure black or pure white.

## Typography

**Display Font:** Cinzel Decorative (with Cinzel, serif fallback) — `--display`
**Mid Display Font:** Cinzel (variable 400–900, with Georgia serif fallback) — `--display-2`
**Body Font:** Alegreya (400/700, true italic; with Georgia serif fallback) — `--body`
**Arabic override:** Amiri body + Aref Ruqaa display (via `html[lang="ar"]`)

**Character:** Roman inscriptional letterforms for display (Cinzel has **no italic**), a warm serif for prose — a manuscript read aloud in a tavern, set in stone and ink. Latin + Cyrillic covered by Alegreya/Cinzel; CJK and Thai fall back to system serif.

### Hierarchy
- **Display** (Cinzel Decorative, 700, `clamp(2.25rem, 1.05rem + 6vw, 4.8rem)` `--step-4`): page h1 heroes, `~0.03em` tracking, calibrated to fit "DEMYSTIFIED" on a 320px phone.
- **Headline** (Cinzel, 600–700, `--step-2`/`--step-3`): h2/h3, numerals, rank titles, bar values.
- **Title** (Cinzel, `--step-1`): rule numerals and key readouts.
- **Body** (Alegreya, 400, `--step-0`/`--step-1`): prose, at ≤46rem measure.
- **Label** (Alegreya 700, `--step--1`, `0.08–0.22em` tracking, uppercase): chips, tags, calc titles, gen headers, disclosure prompts — the marginalia voice.

### Named Rules
**The Manuscript Voice Rule.** Emphasis is **bold**, never italic. Italic is reserved for the marginal-gloss voice (`.note`, `.gen-gloss`, `.egg-note`, `.forge-n`, `.paw-trophy`, `.rev`, `.d-formula`).

**The Display Never Italics Rule.** Cinzel has no italic — never italicise display or headline text.

**The Small-Caps Label Rule.** Labels, tags, and prompts are uppercase with wide letter-spacing; body copy stays lower-case and unhurried.

## Layout

A single centered measure column on a dark field. Everything runs inside a **46rem** (`--maxw`) prose column, so each event reads like a ruled ledger page. The page is **mobile-first**: fluid type (`--step--1`…`--step-4`), a 3rem sticky topbar with a scroll progress fill, and a TOC scrollspy rail that tracks the active section (amber + ❧).

- **Rhythm:** fluid spacing scale `--space-s/m/l/xl` (clamps that grow gently with the viewport). Sections breathe with `--space-xl` vertical padding.
- **Topbar:** 3rem, `--chrome` translucent, brand "KINGSHOT · DEMYSTIFIED" + event switcher (`.ev-switch`) + language picker; a 3px amber progress fill along the bottom. Laid out as three CSS-grid tracks — `minmax(0, 1fr) auto minmax(0, 1fr)` — with the brand in track 1, the switcher in track 2 and the controls in track 3 (`justify-self: end`), so the switcher sits on the bar's true centre line rather than wherever `space-between` left it. Equal outer tracks mean the bar's centre is a real constraint: a track that runs out clips its own item, so nothing can spill over the controls.
- **Sections:** each `<section>` carries an `h2::before` marker and alternates accent (`section.front`), so the ledger has visible chapters.
- **Responsive:** ~700px breakpoint trims the brand note and tightens the rail; the event switcher holds the centre only from **1240px up**, and below that the bar drops to two tracks (masthead + controls) with the ❧ ledger drawer carrying the same links — the drawer is the compact bar's navigation, not just a phone affordance. Everything is fluid down to 320px.

### Named Rules
**The Measure Rule.** Prose never exceeds 46rem. If a line would, the layout breaks, not the measure.

**The Strip Budget Rule.** The event switcher has a fixed width budget and the masthead gives way first: seven uppercase labels at the full label step are ~864px, which cannot hold a centre line on any laptop, so the strip's type is capped (`min(--step--1, 0.85rem)`) and the brand's size is capped by the room left beside it — full size above ~1740px, scaling to ~16px at 1280px. The cap is sized for the **widest strip any language produces** (550–664px: Turkish's is the longest, English's the shortest), so a long translation shrinks the masthead in every language rather than clipping it in one. Adding an eighth link, lengthening a label, or raising the strip's type re-breaks the centre line; size the strip first, then the brand.

## Elevation & Depth

**Flat paper, lift only what floats.** The system is fundamentally flat ink-on-night: depth comes from **tonal layering** (void → void-2 fields → hairline borders), not shadows. Box-shadows and colored glows are reserved exclusively for things that physically lift off the page or carry the active signal.

- **Flat surfaces** — cards, sections, ruled data-viz: no drop shadow, depth by layering and hairlines.
- **Floating layers** (the only things with drop shadows): hero portraits, the language menu, egg-note slips, and the swipe preview.
- **The signal glow** — amber `--signal-glow`/`--signal-halo`: a zero-offset inner glow + outer halo on active signal elements (hero portraits on hover). This is the "dark-glow" the detector flags; it is the system's intent, used only on the signal.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. A shadow or glow appears only as a response to state (hover, elevation, focus) or on a genuine float — never as ambient decoration.

**The Thin-Line + Lift Rule.** Where a float exists, the hairline border (1px signal/dim) and the wide dark shadow come as a pair — a defined edge *and* a soft lift together, never one alone.

## Shapes

Sharp and letterpress-engraved. Radius is a whisper — 1–3px — and never rounds into a card. Inputs are squared ink lines (radius 0).

- **Radius scale:** `none` 0 (inputs, rule cells), `sm` 1px (flags), `md` 2px (hero portraits, tags, chips, tier badges), `lg` 3px (the language menu).
- **Rule cells:** square (radius 0) amber numerals `3.8rem` that stamp each rule.
- **Clipping:** `html`/`body` use overflow clipping for the dust field — the detector's clipping finding notes that positioned popovers must escape this clip deliberately.

### Named Rules
**The Sharp Edge Rule.** Radius stays 1–3px. Never round a card, a button, or a field — the world is printed, not pillowed.

## Components

The system's "buttons" are **margin prompts, not button chrome** — controls read like marginalia that respond on hover, never like SaaS UI.

### Buttons / Disclosure Prompts
- **Style:** no button box. A disclosure is an uppercase letter-spaced prompt in amber, opened by a ❧ fleuron, with a hairline underline that appears on hover (`details summary`).
- **Shape:** radius 0; underline-only, no fill, no border box.
- **Hover / Focus:** color shifts amber → ink; the ❧ prompt is the affordance.

### Cards / Containers
- **Corner Style:** cardless — the `.cards` grid has no box; cards are `h3` + prose with a `.tag` header.
- **Background:** none (transparent on void); depth is the void-2 field behind, not a card.
- **Shadow Strategy:** none at rest (see Elevation).
- **Border:** hairlines only where a rule is being drawn (1px signal line), never a full card outline.
- **Internal Padding:** `--space-l` gaps between cards, fluid.

### Inputs / Fields
- **Style:** transparent background, `1px` bottom ink-muted rule, radius 0 — an ink line, not a field.
- **Focus:** the bottom rule turns amber; no outline, no fill.
- **Range:** amber accent-color, thin, wide.

### Navigation
- **Topbar:** Cinzel Decorative brand + event switcher (body serif, uppercase) + language picker; amber active + progress fill.
- **TOC rail:** scrollspy links, uppercase `--step--1`; active = amber + "❧ " prefix.
- **Language menu:** void-2 surface, `1px` ink-muted border, `3px` radius, `0 10px 28px` float shadow; hover/selected = amber.

### Signature Components
- **Rule cells** — square amber numerals (`3.8rem`) stamping each of the "four rules"; a reversed oxblood cell (`.rev`) marks the failure/rubrication case.
- **The ❧ Fleuron** — the brand mark: opens active TOC links, lead/you tags, rank titles, and disclosure prompts.
- **Ruled data-viz** — sqrt bars (`.bar-fill`), timing wave rails (`.seg`), and reward bracket ranks (`.brackets`) drawn in the manuscript grammar, dim-to-full-signal brightness by rank.
- **Hero portraits** — `4.4rem`, `1px` amber-dim border, `2px` radius, inset signal glow + `0 6px 18px` float; hover lifts with a `0 0 22px` signal halo.
- **The Dust** — drifting ember motes per theme (gold fireflies, ember sparks, crimson motes, candlelight, survey motes) behind the content.
- **The Forge stamp** — a small hammer icon + italic count marking Forgehammer rewards.

## Animation style

All authored animations must use the site's distinct ASCII character-grid style. The campfire is the reference. `.dsh/build-ascii.py` samples a procedural flame field offline into 72 stepped frames that loop seamlessly, adds sparse flicker patches that only ever add hot glyphs, and adds sparks that climb cell by cell. Every other scene follows the same approach.

**The scenes.** Each has one job and one place:

| Scene | Where | What moves |
| --- | --- | --- |
| Campfire | home hero, Home deck cover | flame frames, coal glyphs, cell-stepped sparks |
| Hearth | above every page footer | the campfire's own flame field, sampled small |
| Forge | Bear Hunt rewards, Hero Gear cover, screenshot-reading loader | three hand-drawn hammer poses, a hot bar, cell-stepped sparks |
| Moon | Event Cycle hero and cover | a 28-frame lunar cycle, the 28-day clock |
| Bear, charm, banner, crown, dice | the hero of their page and its deck cover | a bear that blinks and sniffs, a longship's sea rolling past and its shields catching the light, a glint along a crown's band, cloth ripple in four glyph heights, two dice tumbling over their corners and landing in a puff of dust |
| Helm | Heroes hero and deck cover | wind running back through a Spartan helm's horsehair crest, the dome catching light |
| March | Bear Hunt and Vikings bands, Vikings cover | a column walking in step, one cell per pose, with a pennant bearer |
| Ambient twinkles | behind every page and the page deck | glyphs waking at fixed places |

**The pipeline.** `.dsh/build-ascii.py` writes `css/ascii-frames.css` and `_includes/ascii/campfire.html`. Never hand-edit either file. `css/ascii.css` holds layout, colour and placement. `node .dsh/ascii-style-check.cjs` enforces the rules below, and CI also fails when the committed frames differ from the generator's output.

- Animate by changing complete character frames or sparse glyph layers with CSS `steps(1, end)`. Preserve a coherent silhouette and a fixed monospace grid.
- Sparks and other moving marks may jump between integer character cells (`ch`/`em`) with stepped timing. Ambient twinkles change glyphs at fixed positions.
- Never skew, rotate, stretch, squash, scale, bend, bob, bounce or smoothly drift the artwork or its glyph layers. Do not use animated transforms or scroll-driven scaling as a substitute for ASCII frames.
- Use HTML and CSS for runtime animation. Offline generators may produce frames; JavaScript must not drive animation through frame loops, timers, Web Animations or canvas.
- Smooth background colour interpolation is explicitly allowed. It must blend colours rather than flash between palettes; this does not permit smooth deformation or movement of ASCII artwork.
- Centre navigation scenes within their cards and keep headings and descriptions clear of the art. Fixed placement and responsive sizing must preserve character proportions.
- The page deck is a ring: swiping past either end carries on into the other. Each cover keeps its own page's colour, and covers look the same whether or not they are selected. Selection follows the cover in the centre while the strip moves, so the ground drifts with the finger and nothing changes when the strip comes to rest; a jump from a button or key goes straight to its target. Only the selected cover's scene runs, together with the ring's copies of it. Touch handling in the open deck is passive and the strip pans sideways only, so nothing holds up native scrolling. The ground changes colour as a single `background-color` transition on its own empty, full-screen layer (`.deck-ground`), which interpolates directly, never dims on the way, and never makes the browser redraw the header, buttons or glow; fading the dialog's own background did, and Android Chrome then showed frames with the dialog missing. The header and buttons switch accent at once rather than fading. Selection is a `data-selected` attribute on the dialog, not a `:has()` rule, and the position label is rewritten in place, so a stop does not restyle the whole page. Deck links have no tap highlight. Do not cross-fade stacked colour layers by opacity: at the midpoint both are half transparent and the whole screen pulses darker. The twinkles stay small and quiet.
- Draw rotation as poses. A hammer swing, for example, is three hand-drawn frames on a fixed grip, never one drawing rasterised or transformed at an angle.
- Respect `prefers-reduced-motion` and retain a legible static ASCII frame when animation is disabled.

### Animation quality

Following the rules is not enough; a scene also has to look good frame by frame. These are the bar every scene is held to. The items marked *(checked)* fail CI.

- **Look at every frame before you push.** Build the site and run `node .dsh/ascii-capture.cjs --frames`. It pauses every animation and steps it one authored frame at a time, writing exact PNGs to `.dsh/ascii-preview/`. Read the whole loop, not just frame 0. *(checked: a scene that overflows a 320px screen, leaves the centre of its rail, or holds one frame for its whole loop fails)*
- **Walks plant their feet.** A walking figure advances exactly as far per pose as its planted foot recedes, so the foot stays on one ground cell from contact to contact and nothing moonwalks. Every leg pose is a real walk pose: contact, push-off, passing, reach. No crossed `X` legs, and no pose that only one figure in a crowd is in. *(checked in `march()`)*
- **Crowds move in step.** Figures in a band share one walk phase. Out-of-step legs on repeated figures read as flicker, not a column.
- **Travelling figures step at 6 fps or more.** A one-cell jump at 3 fps reads as a stutter. Ambient scenes (a moon's phases, a blink) may be slower. *(checked)*
- **Poses keep their pivot and their parts.** A posed rotation keeps the pivot glyph (a hammer's grip) on the same cell in every pose, and a part (the hammer's head) keeps its size from pose to pose. Impact effects start at the point of contact. *(the forge's grip is checked in `forge()`)*
- **Rigid parts stay rigid.** A straight part (a handle, a pole, a spear) is drawn in every pose as one glyph run repeated at a constant step. Switching runs part-way (`` `. `` then `` `-- ``) draws a curve, and the part reads as bending. Effects never draw across the object that makes them: sparks fly around the hammer, not over its handle. *(both checked in `forge()`)*
- **Emblems read at a glance.** Each emblem is the thing it names in its most familiar silhouette: a crown is a band with points and jewels, the Vikings charm is a longship under a striped sail with shields on the rail, the helm is a crested Spartan helm in profile, a die shows its top and front faces. Draw anything that faces the viewer symmetrical about the centre column, and check it from across the room at 9px before animating it.
- **Every frame fits its box.** No frame may be wider or taller than the `ch`/`em` box `css/ascii.css` gives the scene, so nothing is clipped. Art sits on the box's rows deliberately: a figure stands on a ground row, not floating with a gap below. *(checked)*
- **Single strokes only.** Drawings are raw strings; a `\\` there draws two backslashes. *(checked)*
- **One signal hue.** Scenes take colour from the page's tokens (`--amber`, `--amber-dim`, `--ink-dim`, `--ink-muted`), so a scene never brings another page's colour along. Only the fire scenes keep a literal fire palette. *(checked)*
- **Every mark belongs to the drawing.** A twitch, flick or glint changes glyphs on the part that moves, inside the silhouette. A glyph that blinks on outside the outline reads as a rendering fault. Embers glow where the fire is, not under the logs.
- **Saturation needs texture.** A sampled field that saturates (a flame's base) becomes a flat row of `@`. Move the sampling window or cap the ramp until the densest row still varies.
- **Repetition needs rhythm.** A tiled band repeats on a period that divides its tile (ground included, so seams vanish) and carries a landmark, such as a pennant bearer, so it reads as a procession rather than wallpaper.

## Do's and Don'ts

### Do:
- **Do** use the one event signal hue (`--amber`) for everything active and let ink-on-night carry the rest.
- **Do** keep prose at ≤46rem measure and the type fluid down to a 320px phone — mobile is the primary reader.
- **Do** use bold for emphasis and reserve italic for the marginal-gloss voice.
- **Do** draw numbers and ranks as ruled data-viz (bars, rails, brackets) that dim to full signal by rank.
- **Do** use the ❧ fleuron as the mark that opens active nav, tags, rank titles, and disclosures.
- **Do** keep radius at 1–3px and square the rule cells and fields.

### Don't:
- **Don't** use more than one signal hue on a page — the enemy/misc colors (steel-blue, battle red) only name the other side.
- **Don't** put gray text on a colored background, or use pure black/white.
- **Don't** nest cards or wrap content in boxes — depth is tonal layering and hairlines, not card chrome.
- **Don't** add ambient drop shadows or glows to flat surfaces — lift only what floats.
- **Don't** italicise display or headline text (Cinzel has no italic).
- **Don't** break the 46rem measure to fit more on a line.

## Hero directory integration

The directory adds a ninth navigation entry. The desktop strip now starts at 1600px, with a 62rem masthead width allowance; the shared drawer carries navigation below that width. The complete strip and directory are checked in all 17 languages at phone, tablet and desktop widths. The directory is a roster, not a scroll: heroes sit as portrait tiles under Bear Hunt-style generation rank lines (short generations pair up from 651px), rarity reads as border brightness (legendary full signal, epic dim, rare muted), and tapping a tile opens one dossier at a time across the full row on a void-2 field. A single parchment signal hue throughout.
