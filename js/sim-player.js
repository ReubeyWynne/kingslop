/* ═══════════════════════════════════════════════════════════
   The simulator ↔ the shared player save (PLAYER-LEDGER.md)

   A `sim-player` interaction module on the console. It knows nothing of
   the simulator's code — only the markup:

     [data-player-stat="attack"][data-troop="inf"]   your Bonus Details
     [data-player-march="amount|tier|tg"][data-troop] your march rows
     [data-action="sim-player.load|sim-player.save"]  the two buttons
     [data-target="sim-player.status"]                the status line
     data-sheet-key on the root                       the sheet's own save

   Loading writes field values and fires the fields' own input/change
   events, so the simulator repaints and remembers exactly as if typed.
   Only the fight modes show the controls: a bear report's left column is
   the rally lead's, not yours. On a first visit (no sheet save yet) and in
   a fight mode, it fills the sheet once from the player save.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  window.Interactions.register('sim-player', function (context) {
    var store = window.PlayerLedger.shared(), note = null, filled = false;

    function stats() { return context.nodes('[data-player-stat][data-troop]'); }
    function march(troop, part) { return context.nodes('[data-player-march="' + part + '"][data-troop="' + troop + '"]')[0]; }
    function status() { return context.targets('status')[0]; }
    function visible() { var s = status(); return !!s && !s.closest('[hidden]'); }

    function put(node, value) {
      if (!node || node.value === String(value)) return;
      node.value = String(value);
      node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    }

    // Your stats per type, and the best tier you own per type: a march
    // fights at one tier per type. Returns whether the save had anything.
    function load() {
      var data = store.combat(), any = false;
      stats().forEach(function (node) {
        var row = data.stats[node.dataset.troop];
        if (row) { any = true; put(node, row[node.dataset.playerStat]); }
      });
      window.PlayerLedger.TROOP_TYPES.forEach(function (troop) {
        var best = data.troops.filter(function (row) { return row.type === troop; })[0];
        if (!best) return;
        any = true;
        put(march(troop, 'tier'), best.tier);
        put(march(troop, 'tg'), best.tg);
        put(march(troop, 'amount'), best.amount);
      });
      return any;
    }

    // Your stats (when any are entered), and each march row as the troops
    // you have at that tier.
    function save() {
      var bag = {}, troops = [], entered = false;
      stats().forEach(function (node) {
        var v = parseFloat(node.value), troop = node.dataset.troop;
        v = isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
        if (v > 0) entered = true;
        (bag[troop] = bag[troop] || {})[node.dataset.playerStat] = v;
      });
      window.PlayerLedger.TROOP_TYPES.forEach(function (troop) {
        var n = Math.floor(parseFloat((march(troop, 'amount') || {}).value));
        if (isFinite(n) && n > 0) troops.push({ type: troop, tier: +march(troop, 'tier').value, tg: +march(troop, 'tg').value, amount: n });
      });
      if (!entered) bag = {};
      if (!troops.length && !entered) return false;
      store.setCombat({ stats: bag, troops: troops }, 'manual');
      return true;
    }

    function paint() {
      var line = status();
      if (!line) return;
      var data = store.combat(), types = Object.keys(data.stats).length, troops = 0;
      data.troops.forEach(function (row) { troops += row.amount; });
      context.nodes('[data-action~="sim-player.load"]').forEach(function (b) { b.disabled = !types && !troops; });
      // Four states, four keys on the status line: neither, stats only, troops only, both.
      var key = types && troops ? 'hasKey' : types ? 'hasStatsKey' : troops ? 'hasTroopsKey' : 'emptyKey';
      var text = context.api.fill(context.api.tr(line.dataset[key], ''), { types: context.api.fmt(types), troops: context.api.fmt(troops) });
      if (note) text += ' ' + context.api.tr(line.dataset[note + 'Key'], '');
      line.textContent = text;
    }

    function firstFill() {
      if (filled) return;
      filled = true;
      var key = context.root.dataset.sheetKey, own = null;
      try { own = key ? localStorage.getItem(key) : null; } catch (e) { own = null; }
      if (own === null && visible()) load();
    }

    context.cleanup(store.subscribe(paint));
    return {
      refresh: function () { firstFill(); paint(); },
      actions: {
        load: { run: function () { if (load()) { note = 'loaded'; paint(); } } },
        save: { run: function () {
          var ok = false;
          try { ok = save(); } catch (e) { ok = false; }
          note = ok ? 'saved' : 'failed';
          paint();
        } }
      }
    };
  });
})();
