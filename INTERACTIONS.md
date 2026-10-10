# Declarative interactions

The layout loads `interactions.js` and `player-modules.js` before page scripts. `common.js` starts module discovery with the normal `BH` API before booting the page and refreshes modules after a language change. Existing page controllers remain compatible.

## Markup contract

| Attribute | Meaning |
| --- | --- |
| `data-module="ledger-form tabs"` | Named capabilities mounted once on this root |
| `data-action="ledger-form.set"` | An explicit module/action name; never JavaScript or an expression |
| `data-bind="inventory.forgehammer"` | A binding understood by the ledger-form capability |
| `data-target="save-transfer.file"` | A target qualified by its owning capability |

A module owns nodes whose nearest `data-module` ancestor is its root. Nested roots are isolated. Multiple modules may share a root, with qualified action and target names. A target may be the root itself. Delegated actions work for newly inserted controls. MutationObserver discovers inserted module roots and disposes detached roots; module lists on existing roots are static.

Static markup stays meaningful: native forms, labels, details, tabs and output elements remain the source of truth. Modules add persistence and live behaviour. There is no framework, expression evaluator, arbitrary property setter, virtual DOM or innerHTML rendering contract.

## Capabilities

- **ledger-form:** confirmed inventory fields, explicit unknown values, derived hero XP-part fields and formatted output. Only valid numeric input is committed. Empty inventory input marks the balance unknown; blank XP-part input retains its previous value until a number is entered. Change normalises the visible input back to saved facts. Writes update the shared ledger and emit `ledger-form:edited`.
- **save-transfer:** whole-player JSON download, file selection, validated import and rejection. It captures the ledger revision before reading a file, so a later edit cannot be silently replaced by a stale import. Superseded imports and detached roots cannot commit. Legacy hero saves use the existing pure `HeroGear` engine when present; unified saves have no engine dependency. Successful import emits `player-save:imported` with before/after snapshots, allowing an independent consumer to offer undo.
- **tabs:** click, Home/End and directional keyboard selection, with RTL and vertical orientation support. It updates only its tabs' ARIA selection/tabindex and emits `tabs:select`; the consumer handles domain selection and panel content.
- **disclosure:** native details change events or an explicit toggle action for a bounded panel. Custom controls update `aria-expanded` and emit `disclosure:change`.
- **troop-roster:** the troops you own, one row per type, tier and TG, in the shared ledger (`troop-{type}-t{tier}-tg{tg}` inventory). Markup supplies each type's home (`data-troop-type` with a `troop-roster.rows` target), a `<template data-target="troop-roster.row">` whose fields carry `data-field="tier|tg|amount"`, a `troop-roster.total` output and the copy keys (`data-total-key`, `data-empty-key`). Rows are keyed by ledger id and reconciled in place, so a field being typed into is never replaced. `add` opens a row at the next free tier, `set` commits a whole count (blank forgets the row), `move` re-keys a row when its tier or TG changes (merging into an existing row), and `remove` forgets it. Edits emit `troop-roster:edited`.
- **result-panel:** scoped semantic status messages, translated and formatted through `BH`, written as text to its targets. A null key clears the result. Locale changes refresh the latest message.

The battle simulator composes `troop-roster` with its own `sim-player` module (`js/sim-player.js`), which reads and writes your stats and march through `data-player-stat` and `data-player-march` attributes and fires the fields' own input events, so the simulator controller stays unaware of the ledger.

Its `sim-army` module (`js/sim-army.js`) turns the sheet into army cards. A tile carries `data-action="sim-army.edit"`, `data-dialog` (the dialog's id) and `data-troop`; it opens that dialog at the troop's tab, and the dialog's `tabs` module picks which `[data-troop-panel]` shows. Inside a tile, `[data-show="id …"][data-format="count|pct|tier"]` mirrors the named inputs, repainted on input, on the simulator's `sim:paint` and `sim:mode` events, and on a language switch. `sim-army.close` closes its dialog, a `tabs:select` with binding `view` sets the root's `data-view` for the phone layout, and `sim-army.answer` opens the Answer view from the `[data-target="sim-army.peek"]` line, which mirrors the first visible `[data-peek]` headline.

Its `sim-run` module (`js/sim-run.js`) is the sweep's run meter. The sweep fires `sim:sweep` on the console with `{ phase, done, of, battles, planned, ms }` (phase `start`, `progress`, `done` or `fail`); the module fills `[data-target="sim-run.bar"]`, a `<progress>` with one step per mix, and `[data-target="sim-run.meter"]`, the live line of battles fought out of the plan, the rate and the time left, then the totals once it is done. The root's `data-run` (`running` or `done`) shows the loader while a sweep runs.

Hero gear composes these capabilities in its existing markup. Resource persistence, file export/import, tab keyboard handling and status output no longer live in its page controller. Optimisation, gear editing and the specialised screenshot review remain domain-specific consumers of the ledger and semantic events.

## Example

```html
<section data-module="ledger-form" data-saved-key="gear.saved" data-save-failed-key="gear.saveFailed">
  <label>Forgehammers
    <input type="number" min="0" max="1000000000" step="1"
      data-bind="inventory.forgehammer"
      data-action="ledger-form.set ledger-form.normalize">
  </label>
  <output data-bind="inventory.forgehammer"></output>
  <output data-target="ledger-form.save" role="status"></output>
</section>
<details data-module="save-transfer disclosure" data-status-scope="player"
  data-import-success="gear.loaded" data-import-failure="gear.invalidSave">
  <summary>Manage save</summary>
  <button type="button" data-action="save-transfer.export">Export</button>
  <button type="button" data-action="save-transfer.choose">Import</button>
  <input type="file" accept="application/json,.json" hidden
    data-target="save-transfer.file" data-action="save-transfer.import">
</details>
<output data-module="result-panel" data-target="result-panel.message"
  data-status-scope="player" role="status" hidden></output>
```

A new tool can use these controls without a new page controller. It adds only its domain-specific calculation and listens for ledger or semantic events. Page labels use the existing i18n conventions; the module layer introduces no new product copy.

## Extension API

`BH.modules` exposes the same registry as `window.Interactions`. Register capabilities before boot or later:

```js
BH.modules.register('example', function (context) {
  context.listen(document, 'example:result', function (event) {
    context.targets('value').forEach(function (node) {
      node.textContent = event.detail.value;
    });
  });
  return {
    actions: {
      run: {
        events: ['click'],
        run: function (node, event) {
          context.emit('example:requested', { id: node.dataset.id });
        }
      }
    }
  };
});
```

`context.nodes(selector)` and `context.targets(key)` stay within ownership boundaries. `context.listen` tracks listener cleanup; `context.cleanup(fn)` tracks subscriptions. An instance may return `refresh` and `dispose`. Action failures emit `module:error` with the module name and message; one failed module does not prevent other roots from mounting. `Interactions.destroy()` removes delegated listeners, observers and module subscriptions.

Run the ledger and gear domain checks locally. CI also runs `.dsh/interaction-modules-check.cjs` in Chromium, covering nested roots, idempotent start, unknown/invalid bindings, RTL tabs, disclosure, scoped messages, export/import, dynamic discovery and cleanup, followed by the existing hero-gear visual/OCR/interaction checks.
