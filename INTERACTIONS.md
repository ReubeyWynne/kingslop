# Interactions

Every control on the site is an Alpine component. A page's own behaviour is a small controller in `js/pages/<page>.mjs` (`Alpine.data('name', ...)`, `x-data="name"` in the markup); what many pages share lives in the site bundle (`_data/boot.json`, `before`). The arithmetic stays in plain engine modules (`js/*-engine.mjs`), which the controllers call and the Node checks test without a browser. There is no framework beyond Alpine, no module registry and no `data-module` / `data-action` layer.

`js/alpine.mjs` starts Alpine once the dictionary has arrived and every script has run, and provides:

- `$store.i18n.v`, which moves on a language change, and `words` (`t`, `count`, `fmt`, `date`) that read it, so a binding using one repaints.
- `$store.ledger`: `v` (moves on every change to the store the page works on), `snapshot`, `ready`, `guest`, and `store`, the ledger itself (null when storage is blocked). `PlayerLedger.current()` is that store for code outside Alpine: your save, or a guest sheet's copy once `page-sheet.js` has called `PlayerLedger.use(...)`.
- `shared(name, definition)` for one state behind several `x-data` regions.

Load `page-deck.js` and `page-chrome.js` before `common.js` on every page. A page marked `lateBoot` in `_data/pages.json` (home) does not defer its scripts: `_layouts/page.html` inserts them once the page has loaded and painted, so Alpine starts on the next task after the site bundle runs and the bundle's controllers register first.

Hero Gear's page (`js/pages/hero-gear.mjs`) imports `hero-gear-view.mjs`. Its view factory receives the engine, translations, number formatting, text substitution and art URL, and returns HTML without owning state, persistence, workers or listeners; the page places it with `x-html` where it holds no controls.

## Conventions

- Static copy stays `data-i18n`; never bind a node that also has `data-i18n`. Bound text uses `words.t(...)` with an English fallback.
- A controller reads and writes the save through `$store.ledger.store` (or `PlayerLedger.current()`), and sees changes through `$store.ledger.v`.
- Checks find controls through hooks that say what they are (`data-roster`, `data-sheet`, `data-planner`, `data-profile`, `data-answer`, `data-kingdom`, `data-bp`, `data-import`, `data-save`, `data-status`), not through the Alpine attributes.
- Alpine runs a binding at most once per flush, so a field assigned in an effect that a binding also depends on can show a stale view; keep derived values in a getter keyed on its inputs.
- A widget's scope sits inside its page's. Widget names carry a prefix (`tabs…`, `form…`, `transfer…`, `roster…`, `panel…`) so they never shadow the page's own.
- A control pressed before Alpine starts is not heard: `deep-link.js` waits for `alpine:initialized` before it presses buttons, and `widgets.mjs` chooses a tab pressed earlier and announces it again.

## Shared widgets (`js/pages/widgets.mjs`)

| Component | Use |
| --- | --- |
| `x-data="tabs"` with `@keydown="tabsKey($event)"` | A tablist: `role="tab"` buttons with `data-value` and `@click="tabsSelect($el)"`, arrow keys, Home and End (RTL and vertical aware). It sets `aria-selected` and `tabindex` and emits `tabs:select` `{ binding, value }` (from `data-tabs-bind`) for the page to handle. |
| `x-data="ledgerForm"` | Number fields bound to the save: `data-bind="inventory.<id>"` (or `heroGear.parts.ten`) with `:value="formValue(key)" :data-state="formState(key)" @input="formSet($el)" @change="formNormalize()"`. The seal reads `formNote` and `formMark`, from the root's `data-saved-key` and `data-save-failed-key`. Emits `ledger-form:edited` and, on a failed write, `module:error`. |
| `x-data="saveTransfer"` | Download, choose and import the whole player save (`data-status-scope`, `data-import-success`, `data-import-failure`). Emits `player-save:exported`, `player-save:imported` `{ before, after }` and `player-save:rejected`, and `player-status` for the toast. `transferSeal` and `transferSealText` say whether this browser has saved anything. |
| `x-data="resultPanel('<scope>')"` | The toast a `player-status` `{ scope, key }` event writes to, listening on the document. |
| `x-data="troopRoster"` | The troops you own, a row per type, tier and TG, kept as `troop-{type}-t{tier}-tg{tg}` in the save. |

The dock that reads screenshots is `x-data="screenImport"` (`js/pages/screen-import.mjs`, `_includes/screen-import.html`, `SCREENSHOT-IMPORT.md`). The kingdom links, the first-visit guide and the break-point finder are `kingdomContext`, `kingdomTimeline`, `siteGuide` and `heroBreakpoint`.

```html
<section x-data="ledgerForm" data-saved-key="gear.saved" data-save-failed-key="gear.saveFailed">
  <label>Forgehammers
    <input type="number" min="0" max="1000000000" step="1" data-bind="inventory.forgehammer"
      :value="formValue('inventory.forgehammer')" :data-state="formState('inventory.forgehammer')"
      @input="formSet($el)" @change="formNormalize()">
  </label>
  <output role="status" x-text="formNote" :data-state="formMark"></output>
</section>
<details x-data="saveTransfer" data-status-scope="player" data-import-success="gear.loaded" data-import-failure="gear.invalidSave">
  <summary>Manage save</summary>
  <button type="button" data-save="export" @click="transferExport()">Export</button>
  <button type="button" data-save="choose" @click="$refs.file.click()">Import</button>
  <input type="file" accept="application/json,.json" hidden data-save="file" x-ref="file" @change="transferImport($el)">
</details>
<output x-data="resultPanel('player')" @player-status.document="panelHear($event)" x-text="panelText" :hidden="!panelText" role="status" hidden></output>
```

## Deep links

Every disclosure is addressable by its URL. A `#id` link opens the disclosure it names and scrolls to it, and opening one writes its id to the address bar, so a reader can copy the link from wherever they are. The address is the state: there is no router, no `pushState` history and no query-string scheme. `js/deep-link.js` is loaded on every page by the layout, after the page scripts, starts only once the page has booted (so a custom button it presses is already wired), and reads only markup:

| Markup | Link |
| --- | --- |
| `<details id="exact-model">` | `#exact-model` opens it |
| `<details data-deep-link="hero-petra">` | `#hero-petra` opens it; use this when the id belongs to the card or section around the details |
| `<button aria-expanded aria-controls="panel" data-deep-link="march-builder">` | `#march-builder` presses the button; the button stays the owner of its panel |
| `<section data-collapse id="marches">` | `#marches` opens the section (common.js) |
| `<div id="castle-combat" role="tabpanel">` with one `role="tab"` button controlling it | `#castle-combat` selects the tab |

Calculators carry their state in the query string on purpose, because the address is the thing they share: Hero Gear's `?gear=`, the governor page's `?gov=` (see `GOVERNOR-GEAR.md`), Building requirements' `?goal=…&have=…` (see `BUILDING-REQUIREMENTS.md`), and the roster pages' `?h=`, `?m=` and `?pets=`. Each goes through the shared guest sheet (see [Sheets](#sheets)), reads its link once on load and rewrites it with `replaceState`, never `pushState`.

A panel controlled by several tabs has no link of its own; selecting one of its tabs clears a hash that still points into another panel of the same tablist, so a reload does not reopen the panel the reader left.

Opening a target also opens every linked disclosure and tab around it, so `#prep-day-2` opens its section and then the day. Opening a section keeps a hash that already points inside it, closing a disclosure clears a hash that points inside it, and writes use `history.replaceState`, so toggling never fills the back button. `hashchange` and a click on a link to the current hash both reveal again.

Rules for new markup:

- Give every static `details` a stable, readable English id: what the panel answers, in two or three words (`why-14`, `governor-day-3`, `charm-costs`). Ids are public URLs; once shipped, do not rename them.
- A custom disclosure keeps `aria-expanded` and `aria-controls` on its button and adds `data-deep-link`; its page script owns the opening, the link module only presses the button.
- Do not write page-specific `hashchange` or `location.hash` handlers for disclosures. If a pattern is not covered, extend `deep-link.js` instead.
- Panels rendered by script after boot may carry ids; the module hears their `toggle` events, but a link to them only opens once they exist.

## Sheets

Every calculator with a link shares one guest mode, `js/page-sheet.js`. A page calls `PageSheet.define({ keys, read, write, blank, of, load, same? })` before discovery: the query keys its link owns, how to read and write that link, an empty sheet, the sheet a store holds, and how to put a sheet into a store (`mine` is true when it is your save). `?guest` or a readable link then configures a memoized in-memory store, which every module on the page uses: controllers, ledger forms, save transfer, screenshot import and undo. Plain `?guest` and an unreadable link start from a copy of the save; a readable link starts with only what it carries. `PlayerLedger.shared()` is never replaced, so consumers that need persistent kingdom facts can still read it.

The `$store.sheet` Alpine store drives the controls in `_includes/page-sheet.html`: `part="notice"` (one row at the top of every planner: the Guest mode switch, Copy share link and Start blank, then, on a shared, blank or changed sheet or an unreadable link, a line with Save as mine and Load mine), `part="confirm"` (the dialog before a sheet replaces your save) and `part="bar"` (both in a root of their own, for a page with no planner). Every calculator places the notice part the same way, at the top of its planner, so the controls look and sit alike on each page. The guest switch (`data-sheet="guest"`) reloads into or out of guest mode. A copied link keeps what else the address holds for the page, such as Building requirements' goal and speed, but not the language. On a sheet the address carries the link unless the sheet still matches your save; on your save the address stays clean. Save as mine keeps any balance the sheet has not counted. Styles are `css/page-sheet.css`. Users: Hero gear, Governor gear, Building requirements' levels, and Heroes, Masters and Pets through `js/roster-sheets.js`. Vikings is separate: its links are server-backed alliance plans.

Event points use one scorer and table, `js/event-points.js` (`forItems` for items and speedup minutes, `forGovernor`, `forPets`, `table`, `most`), styled by `css/event-points.css`: a column per event, each cell the best day's points with every tied day under them. Inventory is read by one rule, `PlayerLedger.confirmed(snapshot, id)`.

Every calculator ends with the same two sections, from `_includes/page-notes.html` and styled by `css/page-notes.css`: **How it works** (`part="how"`: the page's own folds first, captured into `own`, then the shared folds How event points score, Links and guest mode, and Your save and backups) and **Sources & confidence** (`part="sources"`: a Checked chip, the page's confidence note, one row per source from the page's data with the day it was checked, marked when it is more than 30 days older than the page, then any extra credits and the art line). The answer ends with `part="pointer"`, one quiet line linking down to both. One mark, ◇, flags a figure with a single source on every page. Dates are `<time datetime data-local-date>`, which `js/i18n.js` formats in the reader's language. Users: Governor gear, Hero gear, Building requirements, Heroes, Masters and Pets.

Run the ledger and gear domain checks locally. The browser checks in `.dsh/` run against a built `_site` (see `.github/workflows/site-check.yml` for the list); the engines have Node tests that need no browser.
