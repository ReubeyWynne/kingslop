# Agent instructions — Bear Hunt, Demystified (dey.ci)

Working conventions for agents editing this repo. Short and normative. The site is a
static multi-page site: the home page (`index.html`) plus one directory per event
(`bear-hunt/`, `vikings-vengeance/`, `swordland-showdown/`, each with its own
`index.html`). All user-facing copy lives in the `i18n/<lang>.js` dictionaries
(`en.js` is the source of truth); the HTML text is the English fallback.

## Copy rules

### 1. Never gender the player

The guide speaks to **you** — the player. When writing or editing copy:

- Use the **second person** ("you / your") or gender-neutral constructions. Never use
  "he / she / his / her" (or their equivalents) for a player, a rally lead, a joiner,
  or any human in the described scenario — the reader's gender is never assumed.
  Example voice: "once you're back from your 5th rally as lead, you can still squeeze
  into 1–2 rallies as a joiner…".
- Gendered pronouns are fine **only** when they refer to a **named hero** (heroes have
  fixed in-game genders: "she's such a good leader" for Ava, "he knocks Saul to B" for
  Marlin) or to the bear easter-egg character.
- Some languages cannot express a gender-neutral second person grammatically (Arabic
  most sharply; Russian/Polish partly). Keep those languages' existing grammatical
  conventions. The rule is "no player is assumed to be male or female" — not "strip
  all gender out of the grammar".

### 2. Copy changes propagate to every dictionary

`en.js` and the matching HTML fallback text (on the home page or the event page that
uses the key) are the source of truth. When copy changes,
update the same key in **all 16 translated dictionaries** (`es`, `pt-BR`, `de`, `fr`,
`it`, `ru`, `pl`, `tr`, `zh-Hans`, `zh-Hant`, `ko`, `ja`, `th`, `id`, `vi`, `ar`) to
the corrected meaning — a stale translation that contradicts the English is worse than
an English fallback. Missing keys fall back to English (see `i18n/README.md`), but do
not rely on that for corrections. Non-English edits are AI-pass translations; flag
them for native review.

### 3. Preserve the voice and the format

Keep the site's manuscript voice: lower-case cadence, em-dashes, bold key numbers,
"the maths", "our server". In translations, keep HTML tags/classes/ids byte-identical
and never alter numbers, math symbols (`√ × ÷ ≈ Σ ∝ ≤ →`), `{n}`, or proper nouns
(Bear Hunt, Forgehammer, Frakinator, MadNess, player names).

## Mechanics

- Fonts: body `Alegreya` (400/700 + true italic); display `Cinzel Decorative`
  (400/700/900) for titles — h1/h2 and the topnav `.brand` — via `--display`, and
  `Cinzel` (variable 400–900, no italic) for mid display — h3/h4, numerals — via
  `--display-2`. (An old "Bear Tilde" `@font-face` hack once patched the ASCII
  tilde in the previous Fell/Pirata faces; the current faces don't need it — don't
  resurrect it.) Small display roles (TOC, tags, labels, table
  data) render in the body serif. Cinzel has **no italic** — never italicise display
  text. Emphasis is **bold**, not italic; italic is reserved for the marginal-gloss
  voice (`.note`, `.gen-gloss`, `.egg-note`, `.forge-n`, `.paw-trophy`, `.rev`,
  `.d-formula`).
- **Build model (Jekyll, GH Pages):** `_config.yml` + `_layouts/page.html` +
  `_includes/{head,topbar,foot}.html` template every page's chrome — the
  `<head>` (meta, canonical/hreflang, favicon, fonts), the lang resolver
  script, the topbar (brand, `.ev-switch`, language menu, `.ledger`),
  skip link, dust, footer nav. Per-page content files are `---\nlayout: page\nself: <key>\n---\n` + their TOC + `<main>` only. `_data/pages.json` (per-page identity/meta/swipe) and `_data/nav.json` (order + labels) drive all of it — the swipe-ring and every nav are one `_data` edit, never per-page. **Local work is `jekyll build` then serve `_site/`**; the `.dsh` page checks run against `_site/`. Never paste chrome (head/nav/lang-menu) into a page content file — it belongs in the layout/includes.
- File layout: CSS lives in `css/` — shared `styles.css` (tokens, base, manuscript
  components) + `events.css` (event switcher, swipe preview, page themes, shared
  ruled rows and checklist); per-page sheets are `css/home.css`, `css/vikings.css`,
  `css/swordland.css` (bear-hunt has none — its components are the shared base).
  JS lives in `js/` — shared `js/i18n.js` (dictionary loader — resolves `/i18n/`
  from its own URL, so it works from any page depth) + `js/common.js` (chrome:
  topbar, ledger, language menu, scrollspy, progress, swipe/keyboard paging, the
  parchment toast helper `BH.showNote`); per-page toys live in
  `js/bear-hunt.js`, `js/vikings.js`, `js/swordland.js`, `js/kvk.js`, `js/sim.js`
  and register via
  `window.BH.registerPage(...)`. `_data/pages.json` references these as
  `css/…`/`js/…` (root-relative from the page's depth: `../css/…` from subdirs).
- The TOC scrollspy and front-layer observer in `js/common.js` pick up new sections
  (`<section class="section" id="…">` + matching `.toc a[href="#…"]`) automatically.
- **Mobile page deck:** `_includes/page-deck.html` renders one themed cover per
  `_data/nav.json` entry using `_data/pages.json` for identity and the nav entries for translated ledes.
  The compact ledger button opens the same native modal dialog as a horizontal
  swipe. `js/common.js` carries the opening drag into the carousel: slow drags
  track the finger, release velocity from the last 100 ms feeds an exponential coast (400 ms
  decay, at most four additional cards),
  and the deck settles without navigating. Touch catches momentum; only a card
  tap follows its real link. Group buttons jump within the stable nav order.
  Forms, links, buttons and TOC rails retain their own gestures. Escape, the
  close button and background taps dismiss; focus and reading position return.
  Reduced motion retains direct dragging but settles instantly. Keyboard arrows
  browse within the dialog; outside it, the existing neighbour shortcuts remain.
- **Paging and prefetch:** idle neighbour prefetch remains data-saver / 2G aware.
  A settled deck cover also warms its destination. Keep `@view-transition {
  navigation: auto; }` at top level in `css/events.css`. A deck link writes its
  target pathname to `sessionStorage['bh:deck']`; `head.html` consumes it for
  a dissolve even when the target is outside the neighbour ring. Reduced motion
  neutralises transition animations. Keep the departing deck visible through `pagehide` for transition capture;
  `pageshow` closes it on history restore. Ordinary departures still close it. Dictionaries remain pinned to `window.__BH_BUILD`.
  Run `node --test .dsh/page-deck-check.cjs` for gesture, modal and translation checks.
- A new event page = one directory with a front-matter `index.html` (its TOC +
  `<main>` body only), a `data-page` theme block + dust rules in `css/events.css`,
  a per-page CSS file for bespoke components, a per-page JS file registering its
  toys (one `window.BH.registerPage({ boot, onChange })` call), and one row each
  in `_data/nav.json` + `_data/pages.json` so
  the navs, ledger, footer, swipe ring and neighbour prefetch pick it up (no
  per-page nav edits).
  Then `jekyll build` and re-run `.dsh/kvk-check.js` and `.dsh/i18n-check.js`
  against `_site/` (the second one catches a plain `data-i18n` whose dictionary
  value carries markup, and any `.md` that reached the build).
- Docs: `MATHS.md` is the formula source of truth; `KINGSHOT-SOURCES.md` is the
  mined KingShot reference (the Frakinator's acknowledged sources: engine canon,
  unit stats, buffs, OCR decision) — read it before claiming new gameplay facts;
  `i18n/README.md` is the translation playbook.
