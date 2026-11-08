/* ═══════════════════════════════════════════════════════════
   The planner frame (css/sheet.css, INTERACTIONS.md)

   Two interaction modules for a calculator laid out as yours beside the answer:

   planner        on the frame's section. Its `tabs` row (data-tabs-bind="view")
                  picks which half a phone shows; the choice sets the root's
                  data-view ("mine" or "answer"). It opens on the answer when the
                  shelf holds anything at first paint, and a link into either half
                  opens that one.
   roster-shelf   [data-shelf="heroes|masters|pets"], one [data-key] chip per entry
                  in the static markup. It shows the chips the save owns, writes
                  each chip's level into its [data-line], shows
                  [data-target="roster-shelf.empty"] when none are owned and fires
                  `roster-shelf:paint` with { owned } on the root.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var M = window.Interactions;
  if (!M) return;

  M.register('roster-shelf', function (context) {
    var root = context.root, kind = root.dataset.shelf;
    function roster() {
      try {
        var store = context.ledger;
        if (!store) return {};
        return (kind === 'masters' ? store.masters() : kind === 'pets' ? store.pets() : store.heroes()).roster || {};
      } catch (cause) { return {}; }
    }
    function paint() {
      var mine = roster(), owned = 0, api = context.api;
      root.querySelectorAll('[data-key]').forEach(function (chip) {
        var copy = mine[chip.dataset.key], line = chip.querySelector('[data-line]');
        chip.hidden = !copy;
        if (!copy) return;
        owned++;
        var level = kind === 'masters' ? copy.affinity : copy.level;
        if (line) line.textContent = level === null || level === undefined ? '' : api.fill(api.tr('directory.lvl', 'Lv {n}'), { n: api.fmt(level) });
      });
      context.targets('empty').forEach(function (node) { node.hidden = owned > 0; });
      context.emit('roster-shelf:paint', { owned: owned });
    }
    if (context.ledger && context.ledger.subscribe) context.cleanup(context.ledger.subscribe(paint));
    paint();
    return { refresh: paint };
  });

  M.register('planner', function (context) {
    var root = context.root, chosen = false;
    function show(view) {
      root.dataset.view = view;
      root.querySelectorAll('.sheet-views [role="tab"][data-value]').forEach(function (tab) {
        var on = tab.dataset.value === view;
        tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on ? 0 : -1;
      });
    }
    // A link to anything inside one half opens that half on a phone.
    function follow() {
      var id = decodeURIComponent(location.hash.slice(1)), target = id && document.getElementById(id);
      if (!target || !root.contains(target)) return false;
      var half = target.closest('[data-half]');
      if (half) { chosen = true; show(half.dataset.half); }
      return Boolean(half);
    }
    context.listen(root, 'tabs:select', function (event) {
      if (event.detail.binding !== 'view') return;
      chosen = true; show(event.detail.value);
      var tabs = root.querySelector('.sheet-views');
      if (tabs && tabs.getBoundingClientRect().top < 0) tabs.scrollIntoView({ block: 'start' });
    });
    // The first paint picks the opening half; later edits never move the reader.
    context.listen(root, 'roster-shelf:paint', function (event) { if (chosen) return; chosen = true; show(event.detail.owned ? 'answer' : 'mine'); });
    context.listen(window, 'hashchange', follow);
    if (!follow()) show(root.dataset.view || 'mine');
    return {};
  });
})();
