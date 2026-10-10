(function () {
  'use strict';
  var M = window.Interactions;
  function status(context, key) { context.emit('player-status', { scope: context.root.dataset.statusScope || 'player', key: key }); }
  M.register('ledger-form', function (context) {
    var store = window.PlayerLedger.shared();
    function render() {
      var snapshot = store.snapshot();
      context.nodes('[data-bind]').forEach(function (node) {
        var key = node.dataset.bind, amount = null;
        if (key.startsWith('inventory.')) { var entry = snapshot.inventory[key.slice(10)]; amount = entry && entry.status === 'confirmed' ? entry.amount : null; }
        else if (/^heroGear\.parts\.(ten|hundred)$/.test(key)) {
          var xp = snapshot.inventory['hero-gear-xp'];
          if (xp && xp.status === 'confirmed') { var parts = snapshot.heroGear.parts || { ten: Math.floor(xp.amount % 100 / 10), hundred: Math.floor(xp.amount / 100) }; amount = parts[key.split('.')[2]]; }
        } else return;
        node.dataset.state = amount === null ? 'unknown' : 'confirmed';
        if (node.matches('input')) node.value = amount === null ? '' : amount;
        else node.textContent = amount === null ? (node.dataset.unknown || '—') : context.api.fmt(amount);
      });
    }
    context.cleanup(store.subscribe(render));
    return { refresh: render, actions: { set: { events: ['input'], run: function (node) {
      if (!node.matches('input[type="number"]') || !node.validity.valid) return;
      var key = node.dataset.bind, amount = node.value === '' ? null : Number(node.value);
      try {
        if (key && key.startsWith('inventory.')) store.setBalance(key.slice(10), amount);
        else if (key && /^heroGear\.parts\.(ten|hundred)$/.test(key)) { if (amount === null) return; store.setHeroGearPart(key.split('.')[2], amount); }
        else return;
      } catch (cause) {
        render(); context.targets('save').forEach(function (node) { node.textContent = context.api.tr(context.root.dataset.saveFailedKey, ''); }); throw cause;
      }
      context.targets('save').forEach(function (node) { node.textContent = context.api.tr(context.root.dataset.savedKey, ''); }); context.emit('ledger-form:edited', { binding: key, amount: amount });
    } }, normalize: { events: ['change'], run: render } } };
  });
  M.register('save-transfer', function (context) {
    var store = window.PlayerLedger.shared(), sequence = 0;
    return { dispose: function () { sequence++; }, actions: {
      export: { run: function () {
        var url = URL.createObjectURL(new Blob([store.exportJSON()], { type: 'application/json' })), link = document.createElement('a');
        link.href = url; link.download = 'kingshot-player.json'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        context.emit('player-save:exported', {});
      } },
      choose: { run: function () { var file = context.targets('file')[0]; if (file) file.click(); } },
      import: { events: ['change'], run: async function (node) {
        var file = node.files[0], token = ++sequence; node.value = ''; if (!file) return;
        try {
          var before = store.snapshot();
          if (file.size > 1024 * 1024) throw new Error('Too large');
          var data = JSON.parse(await file.text()); if (token !== sequence || !context.root.isConnected) return;
          var after = store.importJSON(data, window.HeroGear, before.revision);
          status(context, context.root.dataset.importSuccess); context.emit('player-save:imported', { before: before, after: after });
        } catch (cause) { if (token === sequence && context.root.isConnected) { status(context, context.root.dataset.importFailure); context.emit('player-save:rejected', { message: cause.message }); } }
      } }
    } };
  });
  M.register('tabs', function (context) {
    function buttons() { return context.nodes('[role="tab"][data-value]'); }
    function select(button) {
      buttons().forEach(function (node) { var active = node === button; node.setAttribute('aria-selected', String(active)); node.tabIndex = active ? 0 : -1; });
      context.emit('tabs:select', { binding: context.root.dataset.tabsBind, value: button.dataset.value });
    }
    context.listen(context.root, 'keydown', function (event) {
      var nodes = buttons(), index = nodes.indexOf(event.target), vertical = context.root.getAttribute('aria-orientation') === 'vertical';
      var forward = vertical ? 'ArrowDown' : 'ArrowRight', back = vertical ? 'ArrowUp' : 'ArrowLeft';
      if (index < 0 || ![forward, back, 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      var rtl = !vertical && document.documentElement.dir === 'rtl', step = event.key === forward ? 1 : -1;
      if (rtl) step *= -1;
      var next = event.key === 'Home' ? 0 : event.key === 'End' ? nodes.length - 1 : (index + step + nodes.length) % nodes.length;
      select(nodes[next]); nodes[next].focus();
    });
    return { actions: { select: { run: select } } };
  });
  M.register('disclosure', function (context) {
    if (context.root.matches('details')) context.listen(context.root, 'toggle', function () { context.emit('disclosure:change', { open: context.root.open }); });
    return { actions: { toggle: { run: function (button) {
      var panel = context.targets('panel')[0]; if (!panel) return;
      panel.hidden = !panel.hidden; button.setAttribute('aria-expanded', String(!panel.hidden)); context.emit('disclosure:change', { open: !panel.hidden });
    } } } };
  });
  // Troops you own, by type, tier and TG, kept in the shared player save.
  // Markup supplies the rows' homes ([data-troop-type] > rows target), a
  // <template> row (fields marked data-field) and the copy keys; the module
  // keys each row by its ledger id and reconciles in place, so a field being
  // typed into is never replaced under the cursor.
  M.register('troop-roster', function (context) {
    var store = window.PlayerLedger.shared(), Ledger = window.PlayerLedger, pending = {};
    function translate(node) {
      node.querySelectorAll('[data-i18n]').forEach(function (n) { n.textContent = context.api.tr(n.dataset.i18n, n.textContent); });
      node.querySelectorAll('[data-i18n-attr]').forEach(function (n) { n.setAttribute(n.dataset.i18nAttr, context.api.tr(n.dataset.i18nKey, n.getAttribute(n.dataset.i18nAttr) || '')); });
    }
    function parse(key) { var m = /^troop-(inf|cav|arc)-t(\d+)-tg(\d)$/.exec(key); return m && { type: m[1], tier: +m[2], tg: +m[3] }; }
    function rows() {
      var list = {};
      store.combat().troops.forEach(function (row) { list[Ledger.troopId(row.type, row.tier, row.tg)] = row.amount; });
      Object.keys(pending).forEach(function (key) { if (!Object.hasOwn(list, key)) list[key] = null; });
      return list;
    }
    function home(type) { return context.nodes('[data-troop-type="' + type + '"]')[0]; }
    function field(li, name) { return li.querySelector('[data-field="' + name + '"]'); }
    function render() {
      var list = rows(), template = context.targets('row')[0], total = 0, any = false;
      Ledger.TROOP_TYPES.forEach(function (type) {
        var place = home(type), box = place && place.querySelector('[data-target~="troop-roster.rows"]');
        if (!box || !template) return;
        var keys = Object.keys(list).filter(function (key) { return parse(key).type === type; }).sort(function (a, b) { var x = parse(a), y = parse(b); return y.tier - x.tier || y.tg - x.tg; });
        Array.from(box.children).forEach(function (li) { if (!keys.includes(li.dataset.key)) li.remove(); });
        keys.forEach(function (key, i) {
          var at = parse(key), li = box.querySelector('[data-key="' + key + '"]');
          if (!li) { li = template.content.firstElementChild.cloneNode(true); li.dataset.key = key; translate(li); }
          field(li, 'tier').value = String(at.tier);
          field(li, 'tg').value = String(at.tg);
          var input = field(li, 'amount');
          if (document.activeElement !== input) input.value = list[key] === null ? '' : String(list[key]);
          if (box.children[i] !== li) box.insertBefore(li, box.children[i] || null);
          if (list[key] !== null) { total += list[key]; any = true; }
        });
      });
      context.targets('total').forEach(function (node) {
        node.textContent = any ? context.api.fill(context.api.tr(context.root.dataset.totalKey, '{troops} troops'), { troops: context.api.fmt(total) }) : context.api.tr(context.root.dataset.emptyKey, '');
      });
    }
    function write(list) { store.setCombat({ troops: list }, 'manual'); }
    context.cleanup(store.subscribe(render));
    return { refresh: render, actions: {
      add: { run: function (button) {
        var place = button.closest('[data-troop-type]'), type = place && place.dataset.troopType, list = rows(), lowest = 11, used = {};
        if (!type) return;
        Object.keys(list).forEach(function (key) { var at = parse(key); if (at.type === type) { used[key] = true; lowest = Math.min(lowest, at.tier); } });
        var start = Object.keys(used).length ? lowest - 1 : 10, key = null;
        for (var step = 0; step < 11 && !key; step++) {
          var tier = ((start - 1 - step + 22) % 11) + 1;
          for (var tg = 0; tg < 6 && !key; tg++) if (!used[Ledger.troopId(type, tier, tg)]) key = Ledger.troopId(type, tier, tg);
        }
        if (!key) return;
        pending[key] = true; render();
        var li = place.querySelector('[data-key="' + key + '"]');
        if (li) field(li, 'amount').focus();
      } },
      set: { events: ['input'], run: function (input) {
        if (!input.validity.valid) return;
        var at = parse(input.closest('[data-key]').dataset.key), amount = input.value === '' ? null : Number(input.value);
        if (amount !== null && !(Number.isSafeInteger(amount) && amount >= 0)) return;
        if (amount === null) pending[Ledger.troopId(at.type, at.tier, at.tg)] = true;
        write([{ type: at.type, tier: at.tier, tg: at.tg, amount: amount }]);
        context.emit('troop-roster:edited', { type: at.type, tier: at.tier, tg: at.tg, amount: amount });
      } },
      move: { events: ['change'], run: function (select) {
        var li = select.closest('[data-key]'), from = parse(li.dataset.key), list = rows();
        var to = { type: from.type, tier: +field(li, 'tier').value, tg: +field(li, 'tg').value }, key = Ledger.troopId(to.type, to.tier, to.tg);
        if (key === li.dataset.key) return;
        var amount = list[li.dataset.key], there = Object.hasOwn(list, key) ? list[key] : null;
        if (amount !== null && there !== null) amount += there; else if (amount === null) amount = there;
        delete pending[li.dataset.key];
        if (amount === null) { pending[key] = true; render(); return; }
        write([{ type: from.type, tier: from.tier, tg: from.tg, amount: null }, { type: to.type, tier: to.tier, tg: to.tg, amount: amount }]);
      } },
      remove: { run: function (button) {
        var key = button.closest('[data-key]').dataset.key, at = parse(key);
        delete pending[key];
        if (rows()[key] === null) { render(); return; }
        write([{ type: at.type, tier: at.tier, tg: at.tg, amount: null }]);
      } }
    } };
  });
  M.register('result-panel', function (context) {
    var message;
    function render() {
      if (!message) return;
      context.targets('message').forEach(function (node) { node.hidden = !message.key; node.textContent = message.key ? context.api.fill(context.api.tr(message.key, message.fallback || message.key), message.values || {}) : ''; });
    }
    context.listen(document, context.root.dataset.resultEvent || 'player-status', function (event) {
      if (!event.detail || event.detail.scope !== (context.root.dataset.statusScope || 'player')) return;
      message = event.detail; render(); context.emit('result-panel:updated', { key: message.key });
    });
    return { refresh: render };
  });
})();
