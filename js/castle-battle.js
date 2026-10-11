(function () {
  'use strict';
  window.Interactions.register('castle-battle', function (context) {
    var role = 'defense', view = 'heroes', mix = [60, 20, 20];
    var stage = context.targets('stage')[0], lossInput = context.targets('loss-input')[0], gap = context.targets('gap')[0];
    var store = null;
    try { store = window.PlayerLedger.shared(); store.snapshot(); } catch (cause) { store = null; }
    [stage, lossInput, gap].forEach(function (node) { node.disabled = false; });
    context.targets('mixes').forEach(function (node) { node.disabled = false; });
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
    function paintFormation() {
      lossInput.max = String(mix[0] * 10000);
      var state = window.CastleBattle.formation(mix, role === 'defense' ? Number(lossInput.value) : 0);
      if (Number(lossInput.value) > state.start[0]) lossInput.value = String(state.start[0]);
      context.nodes('[data-mix]').forEach(function (node) { node.setAttribute('aria-pressed', String(node.dataset.mix === mix.join(','))); });
      context.nodes('[data-start]').forEach(function (node) { node.textContent = context.api.fmt(state.start[Number(node.dataset.start)]); });
      context.nodes('[data-share]').forEach(function (node) { node.textContent = state.shares[Number(node.dataset.share)].toFixed(1) + '%'; });
      context.targets('loss').forEach(function (node) { node.textContent = context.api.fmt(state.loss); });
      context.targets('attrition').forEach(function (node) { node.hidden = role !== 'defense'; });
      var note = role === 'defense'
        ? 'The target was ' + mix.join(' / ') + '. Removing ' + context.api.fmt(state.loss) + ' infantry leaves ' + context.api.fmt(state.total) + ' active troops and a ' + state.shares.map(function (n) { return n.toFixed(1); }).join(' / ') + ' mix. Replacing the missing infantry restores both the count and the original mix.'
        : role === 'attack'
          ? 'This is a launch composition you can control. Test it against the live garrison; it is not automatically the best counter to the three defending heroes.'
          : 'This is a combined army target. One joiner’s march need not match it: send the types and counts the lead needs to reach the target.';
      context.targets('formation-note').forEach(function (node) { node.textContent = note; });
    }
    function paint() {
      var active = context.root.querySelector('#castle-' + role + '-tab');
      context.root.querySelector('#castle-lesson').setAttribute('aria-labelledby', active.id);
      context.targets('progress').forEach(function (node) { node.hidden = role === 'join' || view !== 'heroes'; });
      context.nodes('[data-view]').forEach(function (node) { node.hidden = node.dataset.view !== view; });
      context.nodes('[data-lineup-role]').forEach(function (node) { node.hidden = node.dataset.lineupRole !== role || node.dataset.lineupStage !== stage.value; });
      context.nodes('[data-joiners]').forEach(function (node) { node.hidden = role !== 'join'; });
      context.nodes('[data-wave-role]').forEach(function (node) { node.hidden = node.dataset.waveRole !== role; });
      context.nodes('[data-wave]').forEach(function (node) { node.hidden = node.dataset.wave !== gap.value; });
      paintCopies(); paintFormation();
    }
    context.listen(context.root, 'tabs:select', function (event) {
      if (event.detail.binding === 'role') role = event.detail.value;
      if (event.detail.binding === 'view') view = event.detail.value;
      paint();
      context.targets('status').forEach(function (node) { node.textContent = (role === 'defense' ? 'Garrison' : role === 'attack' ? 'Rally lead' : 'Joiner') + ' · ' + (view === 'waves' ? 'Rally waves' : view === 'formation' ? 'Formation' : 'Heroes'); });
    });
    if (store) context.cleanup(store.subscribe(paintCopies));
    paint();
    return { refresh: paint, actions: {
      stage: { events: ['change'], run: paint },
      gap: { events: ['change'], run: paint },
      loss: { events: ['input'], run: paintFormation },
      mix: { run: function (node) { mix = node.dataset.mix.split(',').map(Number); paintFormation(); } }
    } };
  });
})();
