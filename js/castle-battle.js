(function () {
  'use strict';
  window.Interactions.register('castle-battle', function (context) {
    var role = 'defense', view = 'event';
    var stage = context.targets('stage')[0], capacity = context.targets('capacity')[0];
    var store = null;
    try { store = window.PlayerLedger.shared(); store.snapshot(); } catch (cause) { store = null; }
    stage.disabled = false;
    context.targets('refill-controls').forEach(function (node) { node.disabled = false; });
    function paintCopies() {
      var roster = {};
      try { roster = store ? store.heroes().roster : {}; } catch (cause) { roster = {}; }
      var known = Object.keys(roster).length > 0;
      context.nodes('[data-copy-for]').forEach(function (node) {
        var copy = roster[node.dataset.copyFor], parts = [];
        node.hidden = !known;
        if (!known) return;
        if (!copy) { node.textContent = 'Not recorded in your roster'; return; }
        if (copy.stars !== null && copy.stars !== undefined) parts.push(Math.floor(copy.stars / 6) + '★' + (copy.stars % 6 ? ' ' + copy.stars % 6 + '/6' : ''));
        parts.push(copy.skills ? 'Skills ' + copy.skills.join(' / ') : 'Skills not recorded');
        if (copy.widget !== null && copy.widget !== undefined) parts.push('Widget ' + copy.widget);
        node.textContent = 'Your copy · ' + parts.join(' · ');
      });
    }
    function values(selector) {
      return context.nodes(selector).map(function (node) { return node.value.trim() === '' ? NaN : Number(node.value); });
    }
    function paintRefill() {
      var note;
      try {
        var state = window.CastleBattle.refill(capacity.value.trim() === '' ? NaN : Number(capacity.value), values('[data-ratio]'), values('[data-current]'));
        [['target-count', state.target], ['missing', state.missing], ['surplus', state.surplus]].forEach(function (row) {
          context.nodes('[data-' + row[0] + ']').forEach(function (node) { node.textContent = context.api.fmt(row[1][Number(node.getAttribute('data-' + row[0]))]); });
        });
        var names = ['infantry', 'cavalry', 'archers'];
        var request = state.missing.map(function (n, t) { return n ? context.api.fmt(n) + ' ' + names[t] : ''; }).filter(Boolean).join(', ');
        if (state.overflow) note = 'Current troops exceed target capacity by ' + context.api.fmt(state.overflow) + '. Check capacity and current counts before requesting reinforcements.';
        else if (state.excess) note = 'There are ' + context.api.fmt(state.free) + ' free spaces, but ' + context.api.fmt(state.needed) + ' troops are missing from the target: ' + request + '. Reaching that target also requires replacing ' + context.api.fmt(state.excess) + ' surplus troops. Adding troops alone cannot restore it.';
        else if (state.needed) note = 'There are ' + context.api.fmt(state.free) + ' free spaces. To restore this target, send ' + request + '. Use the missing counts, rather than repeating the opening mixed preset.';
        else note = 'The current counts match the target. No refill is needed for this composition.';
      } catch (cause) {
        context.nodes('[data-target-count],[data-missing],[data-surplus]').forEach(function (node) { node.textContent = '—'; });
        note = cause.message;
      }
      context.targets('refill-note').forEach(function (node) { node.textContent = note; });
    }
    function paint() {
      context.nodes('[data-view]').forEach(function (node) { node.hidden = node.dataset.view !== view; });
      context.nodes('[data-lineup-role]').forEach(function (node) { node.hidden = node.dataset.lineupRole !== role || node.dataset.lineupStage !== stage.value; });
      context.root.querySelector('#castle-leaders').setAttribute('aria-labelledby', 'castle-' + role + '-tab');
      paintCopies();
    }
    context.listen(context.root, 'tabs:select', function (event) {
      if (event.detail.binding === 'role') role = event.detail.value;
      if (event.detail.binding === 'view') view = event.detail.value;
      paint();
      context.targets('status').forEach(function (node) { node.textContent = view === 'event' ? 'The event' : view === 'formation' ? 'Troops' : view === 'joiners' ? 'Joiners' : 'Combat'; });
    });
    context.listen(context.root, 'click', function (event) {
      var link = event.target.closest('a[href^="#castle-evidence"]');
      if (link) context.root.querySelector('#castle-evidence').open = true;
    });
    if (store) context.cleanup(store.subscribe(paintCopies));
    paint(); paintRefill();
    return { refresh: paint, actions: { stage: { events: ['change'], run: paint }, refill: { events: ['input', 'change'], run: paintRefill } } };
  });
})();
