# Translations

The site is translated **client-side, with zero build step** — it stays a plain static
GitHub Pages site. A tiny loader (`../js/i18n.js`) injects one `<script>` tag per language
(a one-line wrapper around a JSON body) and swaps the text in place. Script tags are
**not CORS-restricted**, so the pages work when opened straight from disk (`file://`) —
no local server, no CORS errors.

## How it works

1. **`<head>` resolver** (the same inline script in every page's `index.html` — home,
   bear-hunt, vikings-vengeance, swordland-showdown) picks the language **before
   first paint** in this order: `?lang=` URL param → saved choice (`localStorage
   "bh_lang"`) → browser language → English. It sets `<html lang>` (and `dir` for RTL
   languages) immediately.
2. **`i18n.js`** loads `i18n/<lang>.js` by appending a `<script>` tag, then applies it.
   The dictionary path resolves from `i18n.js`'s own URL (not the document), so it
   finds `/i18n/<lang>.js` from any page depth — a document-relative path would 404
   from the event subdirectories:
   - `data-i18n="key"` — replaces `textContent`
   - `data-i18n-html="key"` — replaces `innerHTML` (keep tags/classes byte-identical)
   - `data-i18n-key="key" data-i18n-attr="a b"` — sets attributes only, never text
     (used for `aria-label`, `title`, meta `content`, and the flag-picker button/menu)
   - `data-i18n-n="8"` — substitutes `{n}` in template keys (e.g. `rewards.forgeAria`)
3. **`common.js`** reads every user-visible string (easter eggs, toasts) from the
   active dictionary via `window.I18N.tr(key, fallback)`, formats calculator numbers
   with the active locale (page scripts use `BH.fmt`), and re-paints on the
   `i18n:change` event. Page toys (calculators, page eggs) register through
   `window.BH.registerPage(...)` from `bear-hunt.js` / `vikings.js` / `swordland.js`.
4. The topbar flag dropdown (`#lang-btn` + `#lang-menu`) switches live and remembers
   the choice. It is a custom listbox with inline SVG flags (flag emojis render as
   letter-pairs on Windows, so the flags are real SVG).

## Files

| File | Language |
|---|---|
| `en.js` | English (source of truth — edit this first) |
| `es.js` | Spanish |
| `pt-BR.js` | Portuguese (Brazil) |
| `de.js` | German |
| `fr.js` | French |
| `it.js` | Italian |
| `ru.js` | Russian |
| `pl.js` | Polish |
| `tr.js` | Turkish |
| `zh-Hans.js` | Simplified Chinese |
| `zh-Hant.js` | Traditional Chinese |
| `ko.js` | Korean |
| `ja.js` | Japanese |
| `th.js` | Thai |
| `id.js` | Indonesian |
| `vi.js` | Vietnamese |
| `ar.js` | Arabic (first RTL language) |

Each file is exactly:

```js
window.__BH_I18N_DATA = window.__BH_I18N_DATA || {};
window.__BH_I18N_DATA["en"] = {
  …the JSON body…
};
```

## Adding a language

1. Copy `en.js` → `i18n/<code>.js`, translate every value, and make sure the `<code>`
   inside the wrapper's brackets matches the filename (`["<code>"] =`).
2. Keep **every key** identical (456 today) — a missing key falls back to English.
3. Keep all HTML tags, classes and ids byte-identical; translate only the text inside.
4. Never alter numbers, math symbols (`√ × ÷ ≈ Σ ∝ ≤ →`), `{n}`, or proper nouns
   (Bear Hunt, Forgehammer, Frakinator, [2129]MadNess, player names).
5. Register the code on **every page** (home + the three event pages, in each
   `index.html`):
   - one `<li role="option" tabindex="-1" data-lang="<code>">` in `#lang-menu`,
     with its flag SVG (viewBox `0 0 50 30` — 5:3, matching the other flags)
     and the native language name
   - one `<link rel="alternate" hreflang="<code>" href="https://dey.ci/<page>/?lang=<code>">`
     per page (the home links use `https://dey.ci/?lang=<code>`)
   - add `<code>` to the `CANON` map in the inline `<head>` script (and any base-code
     alias like `pt` → `pt-BR`)
   - add the `Intl` locale to `LOCALES` in `i18n.js`
   - if the language is RTL, add it to the `DIRS` map in the inline `<head>` script
     **and** in `i18n.js` (e.g. `{ ar: 'rtl' }`) — this is what flips the page direction

## Voice rules

- **Never gender the player.** Copy speaks to *you* — use the second person or
  gender-neutral constructions ("you can field 5–6 marches", "once you're back from
  your 5th rally as lead…"). Gendered pronouns are fine **only** for named heroes
  (fixed in-game genders) and the bear easter-egg character. Where a language's
  grammar forces a gender (Arabic 2nd person; Russian/Polish partly), keep that
  language's existing conventions — the rule is "no player is assumed male or
  female", not "strip gender out of the grammar". Apply this rule consistently across every language.
- **Changes propagate.** `en.js` is the source of truth; a copy change lands in all
  16 translated dictionaries, not just English. A stale translation that contradicts
  the corrected English is worse than the English fallback.

## Notes

- **Local files / CORS:** dictionaries are loaded with `<script>` tags rather than
  `fetch`, so opening `index.html` directly from disk works with no server and no CORS
  errors.
- **Caching:** the dictionary is the same URL on every page of a language, so it is
  pinned to the build stamp (`window.__BH_BUILD`, set by the layout from `site.time`):
  the browser downloads `i18n/<lang>.js?v=<build>` once and every page after that is a
  cache hit, with a deploy re-fetching it once — the same 10-minute staleness window as
  the CSS and HTML on GH Pages. On `localhost`/`file://` the stamp is dropped for a
  per-request `?_=<timestamp>` instead, so an edit while authoring is never hidden by
  the cache (matching the old `fetch(..., { cache: 'no-cache' })` behaviour).
- **SEO:** Google indexes the default English page (`https://dey.ci/`). The `?lang=` URLs
  are declared via `hreflang` but are primarily for in-app/in-game sharing. If per-language
  SEO ever matters, generate static `/<code>/index.html` copies at build time instead.
- **Fonts:** `Alegreya` (body, incl. Cyrillic) + `Cinzel`/`Cinzel Decorative` (display,
  Roman inscriptional, Latin only) cover Latin + Cyrillic; CJK and Thai fall back to
  system serif fonts. Acceptable for a first pass — a `Noto Sans SC/TH` addition to the
  Google Fonts link would polish those scripts. Arabic uses **Amiri** (body) + **Aref
  Ruqaa** (display) via `html[lang="ar"]` overrides.
- **Easter eggs:** alliance in-jokes are translated except names. The typed secret words
  (`frak`, `madness`, `bear`) stay English — they only trigger from Latin keyboard input.
- **Numbers:** calculator output uses `Intl.NumberFormat` per locale (e.g. `60.000` in
  Spanish/German, `60,000` in English). Static math in the copy keeps dot decimals as
  universal notation.
- **RTL (Arabic):** `ar` is the first right-to-left language. `styles.css` mirrors the
  few hard-coded directionals with logical properties (`inset-inline-*`), and
  `html[lang="ar"]` swaps in Amiri + Aref Ruqaa and neutralises `letter-spacing`,
  italics and tight heading line-heights (Arabic letters join, have no case/italics,
  and clip under Latin heading metrics). Arabic copy uses `←` where English uses `→`
  for progressions, wraps formulas in `<span dir="ltr">`, and `ar-u-nu-latn` keeps
  calculator digits Western (matching the Latin digits used throughout the copy).
