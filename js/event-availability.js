/* Bounded DOM adapter; inventory, transfer and disclosure remain shared modules. */
(function () {
  'use strict';
  window.Interactions.register('event-availability', function (context) {
    var engine = window.EventRules, store = context.ledger, held = Object.create(null);
    var calculator = window.TownCentre.forLedger(store);
    var event = context.targets('event')[0], day = context.targets('day')[0], target = context.targets('target')[0], all = context.targets('all')[0];
    function text(key, fallback) { return context.api.tr('ks.available.' + key, fallback); }
    function put(key, value) { context.targets(key).forEach(function (node) { node.textContent = value; }); }
    function lineName(line) {
      if (line.kind === 'speedup') return context.api.fill(context.api.tr('town.missingSpeedup', '{kind} speedups'), { kind: context.api.tr('town.speedup.' + line.id.slice(8), line.id.slice(8)) });
      if (line.kind === 'governor') return context.api.tr(line.id === 'governor-gear' ? 'town.govGear' : 'town.govCharms', line.id);
      if (line.kind === 'troops') return context.api.fill(context.api.tr('town.troopLine.' + line.training, 'T{tier} troops'), { tier: context.api.fmt(line.tier) });
      return line.id;
    }
    function dayOptions() {
      var previous = Number(day.value) || 1;
      day.replaceChildren();
      engine.days(event.value).forEach(function (entry) {
        var option = document.createElement('option'); option.value = entry.day;
        option.textContent = context.api.tr('ks.today.day', 'day') + ' ' + context.api.fmt(entry.day); day.appendChild(option);
      });
      day.value = Math.min(previous, day.options.length);
    }
    function render() {
      var goal = target.value === '' ? null : Number(target.value);
      if (!target.validity.valid) goal = null;
      var result = calculator.available(event.value, Number(day.value), held, goal);
      put('total', context.api.fmt(result.total));
      put('reserved', context.api.fmt(result.reservedPoints));
      put('shortfall', result.shortfall === null ? '—' : context.api.fmt(result.shortfall));
      put('coverage', text(result.complete ? 'known' : 'partial'));
      context.nodes('[data-item]').forEach(function (row) {
        var item = result.items.find(function (item) { return item.id === row.dataset.item; });
        row.dataset.eligible = String(item.eligible);
        row.hidden = !item.eligible && !all.checked;
        row.querySelector('[data-rate]').textContent = item.eligible ? context.api.fmt(item.rate) : '—';
        row.querySelector('[data-points]').textContent = !item.eligible ? '—' : item.points === null ? text('unknown') : context.api.fmt(item.points);
        var reserve = row.querySelector('[data-held]');
        if (reserve) {
          reserve.disabled = item.amount === null; reserve.max = item.amount === null ? 0 : item.amount;
          held[item.id] = item.reserved || 0; reserve.value = item.reserved || 0;
        }
      });
      var additional = context.targets('additional')[0];
      if (additional) {
        additional.replaceChildren();
        result.lines.filter(function (line) { return !result.items.some(function (item) { return item.id === line.id; }); }).forEach(function (line) {
          var li = document.createElement('li');
          li.textContent = lineName(line) + ' · ' + context.api.fmt(line.points);
          additional.appendChild(li);
        });
      }
      var unquantified = context.targets('unquantified')[0]; unquantified.replaceChildren();
      result.unquantified.forEach(function (row) {
        var li = document.createElement('li'); li.textContent = row.label + ' · ' + row.points; unquantified.appendChild(li);
      });
      context.emit('event-availability:calculated', result);
    }
    dayOptions();
    context.cleanup(store.subscribe(render));
    return { refresh: function () { dayOptions(); render(); }, actions: {
      select: { events: ['change'], run: function (node) { if (node === event) dayOptions(); render(); } },
      target: { events: ['input'], run: render },
      showAll: { events: ['change'], run: render },
      reserve: { events: ['input', 'change'], run: function (node, event) {
        if (node.validity.valid) { held[node.dataset.held] = node.value === '' ? 0 : Number(node.value); render(); }
        else if (event.type === 'change') render();
      } }
    } };
  });
})();
