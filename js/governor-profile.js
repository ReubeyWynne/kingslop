/* The governor profile (_includes/governor/profile.html), shared by the governor page and the
   Town Centre: paints the six pieces and their charms from whichever store the page gives it,
   edits one piece in a dialog, and sets every piece at once. Arithmetic lives in
   governor-engine.js, art and level names in governor-view.js. */
(function () {
  'use strict';
  var EN = {
    'slot.hat': 'Hat', 'slot.amulet': 'Amulet', 'slot.armour': 'Armour', 'slot.trousers': 'Trousers', 'slot.ring': 'Ring', 'slot.staff': 'Staff',
    pieceTroop: '{slot} · {troop}', tileLabel: '{name}: {level}. Charms: {charms}.',
    statGear: '+{n}% attack & defence', charmTotal: '+{n}% health & lethality from these three',
    nextGear: 'Next: {level}', nextMax: 'Fully upgraded.', nextUnset: 'Pick the level you see in game.'
  };
  var TROOPS = { inf: 'Infantry', cav: 'Cavalry', arc: 'Archer' };
  window.Interactions.register('governor-profile', function (context) {
    var G = window.Governor, store = context.ledger, api = context.api, root = context.root, editing = null;
    var art = root.dataset.art || '../img/governor/';
    var view = window.GovernorView.create(G, api, art, { emptyGemLabel: '', stars: '[data-part="stars"]' });
    var dialog = context.targets('dialog')[0];
    function t(key) { return api.tr('gov.' + key, EN[key]); }
    function fill(key, values) { return api.fill(t(key), values); }
    function put(key, value) { context.targets(key).forEach(function (node) { node.textContent = value; }); }
    function piece(id) { return G.data.gear.pieces.find(function (p) { return p.id === id; }); }
    function name(id) { var p = piece(id); return fill('pieceTroop', { slot: t('slot.' + p.slot), troop: api.tr('gear.' + p.troop, TROOPS[p.troop]) }); }
    function pct(n) { return new Intl.NumberFormat((window.I18N && window.I18N.locale) || 'en-GB', { maximumFractionDigits: 2 }).format(n); }
    function el(tag, text, cls) { var node = document.createElement(tag); if (text !== undefined && text !== null) node.textContent = text; if (cls) node.className = cls; return node; }
    function costLine(cost) {
      var line = el('span', null, 'gov-costs');
      Object.keys(cost).filter(function (id) { return cost[id]; }).forEach(function (id) {
        var chip = el('span', null, 'gov-cost'), img = el('img', null, 'gov-icon'), m = G.data.materials.find(function (x) { return x.id === id; });
        img.src = art + id + '.webp'; img.alt = ''; img.width = 24; img.height = 24;
        chip.append(img, el('span', api.fmt(cost[id]))); chip.title = api.tr(m.key, m.label); line.appendChild(chip);
      });
      return line;
    }
    function score(kind, levels) {
      var values = Object.keys(levels).filter(function (id) { return levels[id] !== null; }).map(function (id) { return G.score(kind, levels[id]); });
      return !values.length || values.includes(null) ? '—' : api.fmt(values.reduce(function (a, b) { return a + b; }, 0));
    }
    function renderDialog(gear, charms) {
      if (!dialog || !editing) return;
      var index = gear[editing], troop = editing.split('-')[0];
      put('editTitle', name(editing));
      context.targets('editCard').forEach(function (node) { view.paintCard(node, editing, index); });
      put('editLevel', view.levelName('gear', index));
      put('editStat', index ? fill('statGear', { n: pct(G.stat('gear', index)) }) : '');
      context.targets('editNext').forEach(function (node) {
        node.replaceChildren();
        if (index === null || index >= G.max('gear')) { node.textContent = t(index === null ? 'nextUnset' : 'nextMax'); return; }
        node.append(el('span', fill('nextGear', { level: view.levelName('gear', index + 1) }) + (G.verified('gear', index + 1) ? '' : ' ◇')), costLine(G.data.gear.levels[index].cost));
      });
      var select = dialog.querySelector('select[data-level="gear"]');
      select.dataset.item = editing; select.value = index === null ? '' : String(index);
      var total = 0;
      dialog.querySelectorAll('[data-charm-row]').forEach(function (row) {
        var id = editing + '-' + row.dataset.charmRow, level = charms[id], charm = row.querySelector('select');
        charm.dataset.item = id; charm.value = level === null ? '' : String(level);
        view.paintGem(row.querySelector('.gov-gem'), troop, level);
        if (level) total += G.stat('charms', level);
      });
      put('editCharmStat', total ? fill('charmTotal', { n: pct(total) }) : '');
    }
    function render() {
      var gear = store.governor('gear'), charms = store.governor('charms');
      context.nodes('[data-gov]').forEach(function (tile) {
        var id = tile.dataset.gov, index = gear[id], levels = [];
        tile.dataset.state = view.state(index);
        view.paintCard(tile.querySelector('.gov-card'), id, index);
        tile.querySelector('[data-part="level"]').textContent = view.levelName('gear', index);
        tile.querySelectorAll('[data-charm]').forEach(function (gem) {
          var level = charms[gem.dataset.charm];
          view.paintGem(gem, tile.dataset.troop, level);
          levels.push(level === null ? '—' : api.fmt(level));
        });
        tile.setAttribute('aria-label', fill('tileLabel', { name: name(id), level: view.levelName('gear', index), charms: levels.join(', ') }));
      });
      put('gearScore', score('gear', gear)); put('charmScore', score('charms', charms));
      renderDialog(gear, charms);
    }
    function labelOptions() {
      context.nodes('select[data-level="gear"], select[data-kind="gear"]').forEach(function (select) {
        Array.from(select.options).forEach(function (option) { if (Number(option.value) > 0) option.textContent = view.levelName('gear', Number(option.value)); });
      });
    }
    function write(fn) { try { fn(); } catch (cause) { render(); throw cause; } }
    function set(kind, id, level) { var change = {}; change[id] = level; write(function () { store.setGovernor(kind, change); }); }
    if (dialog) {
      context.listen(dialog, 'close', function () { editing = null; });
      context.listen(dialog, 'click', function (event) { if (event.target === dialog) dialog.close(); });
    }
    context.cleanup(store.subscribe(render));
    return { refresh: function () { labelOptions(); render(); }, actions: {
      edit: { run: function (tile) {
        if (!dialog) return;
        editing = tile.dataset.gov; render();
        if (!dialog.open) dialog.showModal();
      } },
      close: { run: function () { if (dialog) dialog.close(); } },
      level: { events: ['change'], run: function (select) {
        if (select.dataset.item) set(select.dataset.level, select.dataset.item, select.value === '' ? null : Number(select.value));
      } },
      step: { run: function (button) {
        var select = button.parentNode.querySelector('select'), kind = select.dataset.level;
        if (!select.dataset.item) return;
        var now = select.value === '' ? null : Number(select.value), next = Math.min(G.max(kind), Math.max(0, (now || 0) + Number(button.dataset.step)));
        if (now !== null && next === now) return;
        set(kind, select.dataset.item, next);
      } },
      // Applies as soon as a level is picked, then returns to its prompt.
      fill: { events: ['change'], run: function (select) {
        if (select.value === '') return;
        var kind = select.dataset.kind, level = Number(select.value), change = {};
        G.items(kind).forEach(function (item) { change[item.id] = level; });
        select.value = '';
        write(function () { store.setGovernor(kind, change); });
      } }
    } };
  });
})();
