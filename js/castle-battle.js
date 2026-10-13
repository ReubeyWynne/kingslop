(function () {
  'use strict';
  window.Interactions.register('castle-battle', function (context) {
    var role = 'defense', view = 'event';
    var stage = context.targets('stage')[0];
    var store = null;
    try { store = window.PlayerLedger.shared(); store.snapshot(); } catch (cause) { store = null; }
    stage.disabled = false;
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
    if (store) context.cleanup(store.subscribe(paintCopies));
    paint();
    return { refresh: paint, actions: { stage: { events: ['change'], run: paint } } };
  });
})();
