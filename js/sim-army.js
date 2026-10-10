/* ═══════════════════════════════════════════════════════════
   The simulator's army cards (battle-simulator/, INTERACTIONS.md)

   A `sim-army` interaction module on the console. The sheet's inputs live
   in edit dialogs; the cards show what they hold, a tile per troop type.
   It knows the markup only:

     [data-show="id …"][data-format="count|pct|tier"]  mirrors those inputs
     [data-action="sim-army.edit"][data-dialog][data-troop]  opens a dialog
                                                         at that troop's tab
     [data-action="sim-army.close"]                      closes its dialog
     [data-troop-panel] inside a dialog                  one per troop tab
     data-view on the root                               the phone's view
     [data-target="sim-army.peek"]                        the shown headline,
     [data-peek] / [data-action="sim-army.answer"]        copied; opens Answer

   The tabs module picks the tab; this module shows the matching panel. The
   simulator fires `sim:paint` after every repaint and `sim:mode` on a mode
   switch, so a screenshot read, a restore or a player-save load reaches the
   tiles without input events.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  window.Interactions.register('sim-army', function (context) {
    var api = context.api;

    function value(id) {
      var node = document.getElementById(id);
      var v = node ? parseFloat(node.value) : NaN;
      return isFinite(v) ? v : 0;
    }

    function pct(v) {
      var locale = (window.I18N && window.I18N.locale) || 'en-GB';
      return v.toLocaleString(locale, { maximumFractionDigits: 1 }) + '%';
    }

    var FORMATS = {
      count: function (ids) {
        var n = Math.max(0, Math.floor(value(ids[0])));
        return n > 0 ? api.fmt(n) : api.tr('sim.army.none', 'none');
      },
      pct: function (ids) { return pct(Math.max(0, value(ids[0]))); },
      tier: function (ids) { return 'T' + value(ids[0]) + ' · TG' + value(ids[1]); }
    };

    function render() {
      context.nodes('[data-show]').forEach(function (node) {
        var format = FORMATS[node.dataset.format];
        if (format) node.textContent = format(node.dataset.show.trim().split(/\s+/));
      });
      // A troop type the march leaves out reads dimmer on its tile.
      context.nodes('.army-tile').forEach(function (tile) {
        var count = tile.querySelector('[data-format="count"]');
        var ids = count ? count.dataset.show.trim().split(/\s+/) : null;
        tile.toggleAttribute('data-empty', !!ids && value(ids[0]) <= 0);
      });
      // The active fight's headline: the first one not in a hidden block.
      var headline = context.nodes('[data-peek]').filter(function (node) {
        return !node.closest('[hidden]') && node.textContent.trim();
      })[0];
      context.targets('peek').forEach(function (peek) {
        peek.innerHTML = headline ? headline.innerHTML : '';
        peek.closest('button').hidden = !headline;
      });
    }

    function panels(dialog, troop) {
      dialog.querySelectorAll('[data-troop-panel]').forEach(function (panel) {
        panel.hidden = panel.dataset.troopPanel !== troop;
      });
    }

    context.listen(context.root, 'tabs:select', function (event) {
      var detail = event.detail || {};
      if (detail.binding === 'view') context.root.dataset.view = detail.value;
      if (detail.binding !== 'troop') return;
      var dialog = event.target.closest('dialog');
      if (dialog) panels(dialog, detail.value);
    });
    context.listen(context.root, 'sim:paint', render);
    context.listen(context.root, 'sim:mode', render);
    context.listen(context.root, 'input', render);
    context.listen(context.root, 'change', render);

    // A tap on the backdrop closes a dialog, like its done button. The
    // backdrop's clicks land on the dialog itself, outside its box.
    context.nodes('dialog').forEach(function (dialog) {
      context.listen(dialog, 'click', function (event) {
        if (event.target !== dialog) return;
        var box = dialog.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
      });
    });

    return {
      refresh: render,
      actions: {
        edit: { run: function (node) {
          var dialog = document.getElementById(node.dataset.dialog);
          if (!dialog || typeof dialog.showModal !== 'function') return;
          var troop = node.dataset.troop;
          if (troop) {
            var tab = dialog.querySelector('[role="tab"][data-value="' + troop + '"]');
            if (tab && tab.getAttribute('aria-selected') !== 'true') tab.click();
            panels(dialog, troop);
          }
          dialog.showModal();
        } },
        answer: { run: function () {
          var tab = context.root.querySelector('[data-tabs-bind="view"] [data-value="answer"]');
          if (!tab) return;
          tab.click();
          tab.closest('[role="tablist"]').scrollIntoView({ block: 'start', behavior: 'instant' });
          tab.focus({ preventScroll: true });
        } },
        close: { run: function (node) {
          var dialog = node.closest('dialog');
          if (dialog) dialog.close();
        } }
      }
    };
  });
})();
