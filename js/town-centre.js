/* Bounded DOM adapters for the Town Centre. Arithmetic lives in town-centre-engine.js;
   every count lives in the shared player ledger, so the hero gear, governor and event
   pages see each edit made here. */
(function () {
  'use strict';
  var EN = {
    dayTitle: '{event}, day {day}', dayLabel: 'Day {n}', dayEmpty: 'Nothing you have counted scores on this day yet.',
    complete: 'Every count this event uses is entered.', partial: 'Partial: {names} not entered yet, so the total leaves them out.',
    more: '{n} more', alsoNone: 'Nothing else listed for this day.', planEmpty: 'Count some items to see where each one scores most.',
    planRow: '{item}: day {day}, {points} points', topRate: 'best {rate} each · {event} day {day}', topRateMinute: 'best {rate} a minute · {event} day {day}', noRate: 'no event scores this by the piece',
    scoreGain: '+{n} score', govGear: 'Governor gear score', govCharms: 'Governor charm score',
    gainBoth: 'Your materials could add {gear} gear score and {charms} charm score.', gainUnknown: 'Set your levels and count your materials to see the score they could add.',
    pieces: '{n} of 12 pieces set', partialScore: '{n}*',
    'speedup.general': 'General', 'speedup.construction': 'Construction', 'speedup.research': 'Research', 'speedup.training': 'Training', 'speedup.learning': 'Learning', 'speedup.healing': 'Healing',
    'unit.d': 'd', 'unit.h': 'h', 'unit.m': 'm'
  };
  var EVENTS = { prep: ['ks.today.kickerPrep', 'KvK prep'], sg: ['ks.governor.title', 'Strongest Governor'], brawl: ['ks.brawl.title', 'Alliance Brawl'] };
  function t(api, key) { return api.tr('town.' + key, EN[key]); }
  function fill(api, key, values) { return api.fill(t(api, key), values); }
  function eventName(api, event) { return api.tr(EVENTS[event][0], EVENTS[event][1]); }
  function duration(api, minutes) {
    var d = Math.floor(minutes / 1440), h = Math.floor(minutes % 1440 / 60), m = minutes % 60, out = [];
    if (d) out.push(api.fmt(d) + t(api, 'unit.d'));
    if (h) out.push(api.fmt(h) + t(api, 'unit.h'));
    if (m || !out.length) out.push(api.fmt(m) + t(api, 'unit.m'));
    return out.join(' ');
  }
  function name(api, id) {
    var item = window.EventRuleData.items.find(function (entry) { return entry.id === id; });
    if (item) return api.tr(item.key, item.label);
    if (/^speedup-/.test(id)) return t(api, 'speedup.' + id.slice(8));
    if (id === 'governor-gear') return t(api, 'govGear');
    if (id === 'governor-charms') return t(api, 'govCharms');
    return id;
  }
  function amount(api, line) { return line.kind === 'speedup' ? duration(api, line.amount) : line.kind === 'governor' ? fill(api, 'scoreGain', { n: api.fmt(line.amount) }) : api.fmt(line.amount); }
  function confirmed(snapshot, id) { var entry = snapshot.inventory[id]; return entry && entry.status === 'confirmed' ? entry.amount : null; }
  function element(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }

  window.Interactions.register('town-centre', function (context) {
    var T = window.TownCentre, store = window.PlayerLedger.shared(), api = context.api, root = context.root;
    var event = 'prep', chosen = { prep: null, sg: null, brawl: null };
    function put(key, value) { context.targets(key).forEach(function (node) { node.textContent = value; }); }
    function rates() {
      root.querySelectorAll('[data-rate]').forEach(function (node) {
        var top = T.topRate(node.dataset.rate);
        node.textContent = top ? fill(api, /^speedup-/.test(node.dataset.rate) ? 'topRateMinute' : 'topRate', { rate: api.fmt(top.rate), event: eventName(api, top.event), day: api.fmt(top.day) }) : t(api, 'noRate');
      });
    }
    function render() {
      var snapshot = store.snapshot(), results = {};
      Object.keys(EVENTS).forEach(function (key) {
        results[key] = T.best(snapshot, key);
        root.querySelectorAll('[data-event-total="' + key + '"]').forEach(function (node) { node.textContent = api.fmt(results[key].total); node.dataset.partial = String(!results[key].complete); });
      });
      var result = results[event];
      var names = result.unknown.slice(0, 3).map(function (id) { return name(api, id); });
      if (result.unknown.length > 3) names.push(fill(api, 'more', { n: api.fmt(result.unknown.length - 3) }));
      put('coverage', result.complete ? t(api, 'complete') : fill(api, 'partial', { names: names.join(', ') }));

      var top = Math.max.apply(null, result.days.map(function (day) { return day.total; }).concat([1]));
      if (!chosen[event]) chosen[event] = result.days.reduce(function (best, day) { return day.total > best.total ? day : best; }, result.days[0]).day;
      var list = context.targets('days')[0]; list.replaceChildren();
      result.days.forEach(function (day) {
        var item = element('li'), button = element('button', 'town-daybar');
        button.type = 'button'; button.dataset.action = 'town-centre.day'; button.dataset.day = day.day;
        button.setAttribute('aria-pressed', String(day.day === chosen[event]));
        button.style.setProperty('--share', (day.total / top).toFixed(3));
        button.append(element('span', 'town-daybar-label', fill(api, 'dayLabel', { n: api.fmt(day.day) })), element('span', 'town-daybar-rule'), element('output', '', api.fmt(day.total)));
        item.appendChild(button); list.appendChild(item);
      });

      var selected = result.days[chosen[event] - 1];
      put('dayTitle', fill(api, 'dayTitle', { event: eventName(api, event), day: api.fmt(selected.day) }));
      var body = context.targets('lines')[0]; body.replaceChildren();
      selected.lines.forEach(function (line) {
        var row = element('tr');
        row.append(element('th', '', name(api, line.id)), element('td', '', amount(api, line)), element('td', '', api.fmt(line.rate)), element('td', '', api.fmt(line.points)));
        row.firstChild.scope = 'row'; body.appendChild(row);
      });
      context.targets('dayEmpty').forEach(function (node) { node.hidden = selected.lines.length > 0; node.textContent = t(api, 'dayEmpty'); });
      var also = context.targets('also')[0]; also.replaceChildren();
      selected.unquantified.forEach(function (row) { also.appendChild(element('li', '', row.label + ' · ' + row.points)); });
      if (!selected.unquantified.length) also.appendChild(element('li', '', t(api, 'alsoNone')));

      var plan = context.targets('plan')[0]; plan.replaceChildren();
      result.lines.forEach(function (line) { plan.appendChild(element('li', '', fill(api, 'planRow', { item: name(api, line.id), day: api.fmt(line.day), points: api.fmt(line.points) }))); });
      if (!result.lines.length) plan.appendChild(element('li', '', t(api, 'planEmpty')));
      context.emit('town-centre:calculated', { event: event, results: results });
    }
    context.listen(root, 'tabs:select', function (e) {
      if (e.detail.binding === 'town-event' && Object.hasOwn(EVENTS, e.detail.value)) { event = e.detail.value; render(); }
      else if (e.detail.binding === 'town-shelf') root.querySelectorAll('[data-shelf]').forEach(function (panel) { panel.hidden = panel.dataset.shelf !== e.detail.value; });
    });
    context.cleanup(store.subscribe(render));
    return { refresh: function () { rates(); render(); }, actions: {
      day: { run: function (button) { chosen[event] = Number(button.dataset.day); render(); } }
    } };
  });

  // Speedups are stored as minutes per kind and edited as days, hours and minutes.
  window.Interactions.register('town-speedups', function (context) {
    var store = window.PlayerLedger.shared(), api = context.api;
    function render(force) {
      var snapshot = store.snapshot();
      context.nodes('[data-speedup]').forEach(function (row) {
        if (!force && row.contains(document.activeElement)) return;
        var minutes = confirmed(snapshot, row.dataset.speedup), parts = minutes === null ? null : { d: Math.floor(minutes / 1440), h: Math.floor(minutes % 1440 / 60), m: minutes % 60 };
        row.dataset.state = minutes === null ? 'unknown' : 'confirmed';
        row.querySelectorAll('[data-unit]').forEach(function (input) { input.value = parts ? parts[input.dataset.unit] : ''; });
      });
    }
    function saved(key) { context.targets('save').forEach(function (node) { node.textContent = api.tr(key, ''); }); }
    context.cleanup(store.subscribe(function () { render(false); }));
    return { refresh: function () { render(true); }, actions: {
      set: { events: ['input'], run: function (node) {
        var row = node.closest('[data-speedup]'), inputs = Array.from(row.querySelectorAll('[data-unit]'));
        if (!inputs.every(function (input) { return input.validity.valid; })) return;
        var blank = inputs.every(function (input) { return input.value === ''; }), minutes = 0;
        inputs.forEach(function (input) { minutes += (Number(input.value) || 0) * { d: 1440, h: 60, m: 1 }[input.dataset.unit]; });
        if (!blank && !(Number.isSafeInteger(minutes) && minutes <= 1e9)) return;
        try { store.setBalance(row.dataset.speedup, blank ? null : minutes); } catch (cause) { saved('gear.saveFailed'); render(true); throw cause; }
        saved('gear.saved');
      } },
      normalize: { events: ['change'], run: function () { render(true); } }
    } };
  });

  // Hero gear pieces, written through the same adapter the hero gear page uses.
  window.Interactions.register('town-hero-gear', function (context) {
    var H = window.HeroGear, store = window.PlayerLedger.shared(), api = context.api;
    function render() {
      var pieces = store.snapshot().heroGear.pieces, set = 0;
      context.nodes('[data-piece]').forEach(function (row) {
        var piece = Object.hasOwn(pieces, row.dataset.piece) ? pieces[row.dataset.piece] : null;
        if (piece) set++;
        row.dataset.state = piece ? 'set' : 'unset';
        row.querySelectorAll('[data-field]').forEach(function (field) {
          var value = piece ? piece[field.dataset.field] : null;
          field.value = value === null || value === undefined ? '' : value;
          if (field.dataset.field === 'mastery') field.disabled = !!piece && piece.quality === 'epic';
          if (field.dataset.field === 'level') field.max = piece && piece.quality === 'epic' ? 80 : piece && piece.quality === 'mythic' ? 100 : 200;
        });
      });
      context.targets('count').forEach(function (node) { node.textContent = fill(api, 'pieces', { n: api.fmt(set) }); });
    }
    context.cleanup(store.subscribe(render));
    return { refresh: render, actions: { set: { events: ['change'], run: function (node) {
      var row = node.closest('[data-piece]'), id = row.dataset.piece, value = {};
      row.querySelectorAll('[data-field]').forEach(function (field) { value[field.dataset.field] = field.value; });
      if (!node.validity.valid || node.dataset.field === 'quality' && node.value === '' || value.quality === '' && value.level === '' && value.mastery === '') { render(); return; }
      var state = store.heroGear(H);
      state.pieces[id] = H.normalisePiece({ quality: value.quality || 'mythic', level: Number(value.level) || 0, mastery: Number(value.mastery) || 0 });
      try { store.writeHeroGear(state, H, { piece: id }); } catch (cause) { render(); throw cause; }
    } } } };
  });

  // Governor gear and charm levels, the same ledger section the governor planner edits.
  window.Interactions.register('town-governor', function (context) {
    var G = window.Governor, T = window.TownCentre, store = window.PlayerLedger.shared(), api = context.api;
    function total(kind, levels) {
      var sum = 0, partial = false;
      Object.keys(levels).forEach(function (id) { var score = levels[id] === null ? null : G.score(kind, levels[id]); if (score === null) partial = true; else sum += score; });
      return partial ? fill(api, 'partialScore', { n: api.fmt(sum) }) : api.fmt(sum);
    }
    function render() {
      var snapshot = store.snapshot(), levels = { gear: store.governor('gear'), charms: store.governor('charms') };
      context.nodes('select[data-level]').forEach(function (select) { var value = levels[select.dataset.level][select.dataset.item]; select.value = value === null ? '' : String(value); });
      context.targets('gearScore').forEach(function (node) { node.textContent = total('gear', levels.gear); });
      context.targets('charmScore').forEach(function (node) { node.textContent = total('charms', levels.charms); });
      var gear = T.governorGain(snapshot, 'gear').score, charms = T.governorGain(snapshot, 'charms').score;
      context.targets('gain').forEach(function (node) {
        node.textContent = gear === null && charms === null ? t(api, 'gainUnknown') : fill(api, 'gainBoth', { gear: gear === null ? '—' : api.fmt(gear), charms: charms === null ? '—' : api.fmt(charms) });
      });
    }
    context.cleanup(store.subscribe(render));
    return { refresh: render, actions: { set: { events: ['change'], run: function (node) {
      var change = {}; change[node.dataset.item] = node.value === '' ? null : Number(node.value);
      try { store.setGovernor(node.dataset.level, change); } catch (cause) { render(); throw cause; }
    } } } };
  });
})();
