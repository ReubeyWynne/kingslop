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
