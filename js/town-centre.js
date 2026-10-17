/* Bounded DOM adapters for the Town Centre. Arithmetic lives in town-centre-engine.js;
   every count lives in the shared player ledger, so the hero gear, governor and event
   pages see each edit made here. */
(function () {
  'use strict';
  var EN = {
    dayTitle: '{event}, day {day}', dayLabel: 'Day {n}', dayEmpty: 'No recorded inventory scores on this day.',
    complete: 'All required counts entered.', partial: 'Partial: missing {names}.',
    more: '{n} more', alsoNone: 'No other activities listed.', planEmpty: 'Record your inventory to see the best days.',
    planRow: '{item}: day {day}, {points} points', topRate: 'best {rate} each · {event} day {day}', topRateMinute: 'best {rate} a minute · {event} day {day}', noRate: 'No rate per item.',
    scoreGain: '+{n} score', govGear: 'Governor gear score', govCharms: 'Governor charm score',
    gainBoth: 'Available upgrades: +{gear} gear score · +{charms} charm score.', gainUnknown: 'Enter levels and materials to estimate upgrades.',
    pieces: '{n} of 12 pieces set', partialScore: '{n}*',
    'speedup.general': 'General', 'speedup.construction': 'Construction', 'speedup.research': 'Research', 'speedup.training': 'Training', 'speedup.learning': 'Learning', 'speedup.healing': 'Healing',
    'unit.d': 'd', 'unit.h': 'h', 'unit.m': 'm',
    heroAmount: '{n} usable', heroGearPieces: 'your hero gear'
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
    if (id === 'hero-gear-xp') return api.tr('gear.xpTotal', 'XP total');
    if (id === 'spare-mythic-gear') return api.tr('gear.mythic', 'Spare mythic gear');
    if (id === 'hero-gear-pieces') return t(api, 'heroGearPieces');
    var need = window.HeroSpend.missing(id);
    if (need) return window.HeroPoints.missing(api, need);
    return id;
  }
  function amount(api, line) { return line.kind === 'speedup' ? duration(api, line.amount) : line.kind === 'governor' ? fill(api, 'scoreGain', { n: api.fmt(line.amount) }) : line.kind === 'usable' ? fill(api, 'heroAmount', { n: api.fmt(line.amount) }) : api.fmt(line.amount); }
  function confirmed(snapshot, id) { var entry = snapshot.inventory[id]; return entry && entry.status === 'confirmed' ? entry.amount : null; }
  function element(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }

  window.Interactions.register('town-centre', function (context) {
    var T = window.TownCentre, store = window.PlayerLedger.shared(), api = context.api, root = context.root;
    var event = 'prep', chosen = { prep: null, sg: null, brawl: null };
    function put(key, value) { context.targets(key).forEach(function (node) { node.textContent = value; }); }
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
    });
    context.cleanup(store.subscribe(render));
    return { refresh: render, actions: {
      day: { run: function (button) { chosen[event] = Number(button.dataset.day); render(); } }
    } };
  });

  /* Every shelf: tiles paint the ledger, and one dialog edits whatever was tapped.
     Hero gear is a set of four per troop type; governor gear is one set of six
     with three charms each, laid out as the in-game governor profile. */
  window.Interactions.register('town-inventory', function (context) {
    var H = window.HeroGear, G = window.Governor, T = window.TownCentre, store = window.PlayerLedger.shared(), api = context.api, root = context.root;
    var dialog = context.targets('dialog')[0], editing = null, art = '../img/governor/';
    var UNIT = { d: 1440, h: 60, m: 1 }, TROOPS = { inf: 'Infantry', cav: 'Cavalry', arc: 'Archer' };
    function target(key) { return context.targets(key)[0]; }
    function put(key, value) { context.targets(key).forEach(function (node) { node.textContent = value; }); }
    function part(node, key) { return node.querySelector('[data-part="' + key + '"]'); }
    function setSrc(img, src) { if (img && img.getAttribute('src') !== src) img.setAttribute('src', src); }
    function quality(q) { return api.tr(q === 'mythic' ? 'gear.mythicQuality' : 'gear.' + q, q.charAt(0).toUpperCase() + q.slice(1)); }
    function govState(index) { return index === null || index === undefined ? 'unset' : index === 0 ? 'empty' : 'set'; }
    function govLevelName(index) {
      if (index === null || index === undefined) return api.tr('gov.notSet', 'not set');
      if (!index) return api.tr('gov.notCrafted', 'not crafted');
      var d = G.describe('gear', index);
      return api.tr('gov.tier.' + d.tier, d.tier) + (d.grade ? ' T' + api.fmt(d.grade) : '') + ' ' + api.fmt(d.stars) + '★';
    }
    function tileName(node) { var label = node.querySelector('.town-tile-name'); return label ? label.textContent : ''; }
    function paintHero(node, piece) {
      node.dataset.quality = piece ? piece.quality : '';
      part(node, 'level').textContent = piece ? '+' + api.fmt(piece.quality === 'red' ? piece.level - 100 : piece.level) : '';
      part(node, 'mastery').textContent = piece ? api.fmt(piece.mastery) : '';
      part(node, 'mastery-wrap').hidden = !piece || piece.quality === 'epic';
      part(node, 'band').textContent = piece ? quality(piece.quality) : api.tr('gov.notSet', 'not set');
    }
    function paintCard(card, id, index) {
      var d = index ? G.describe('gear', index) : { tier: 'green', grade: 0, stars: 0 };
      card.dataset.state = govState(index);
      setSrc(card.querySelector('img'), art + 'gear/' + id + '-' + d.tier + '-' + d.grade + '.webp');
      part(card, 'stars').textContent = '★'.repeat(index ? d.stars : 0);
    }
    function paintGem(gem, troop, level) {
      gem.dataset.state = govState(level);
      setSrc(gem.querySelector('img'), art + 'charms/' + troop + '-' + Math.max(1, level || 1) + '.webp');
      var label = gem.querySelector('b'); if (label) label.textContent = level ? api.fmt(level) : '';
    }
    function score(kind, levels) {
      var sum = 0, partial = false, any = false;
      Object.keys(levels).forEach(function (id) { if (levels[id] === null) return; any = true; var s = G.score(kind, levels[id]); if (s === null) partial = true; else sum += s; });
      return !any ? '—' : partial ? fill(api, 'partialScore', { n: api.fmt(sum) }) : api.fmt(sum);
    }
    function render() {
      var snapshot = store.snapshot(), pieces = snapshot.heroGear.pieces, set = 0;
      var gear = store.governor('gear'), charms = store.governor('charms');
      context.nodes('[data-count]').forEach(function (tile) {
        var amount = confirmed(snapshot, tile.dataset.count);
        tile.dataset.state = amount === null ? 'unknown' : 'confirmed';
        tile.querySelector('[data-amount]').textContent = amount === null ? '?' : api.fmt(amount);
      });
      context.nodes('[data-duration]').forEach(function (tile) {
        var minutes = confirmed(snapshot, tile.dataset.duration);
        tile.dataset.state = minutes === null ? 'unknown' : 'confirmed';
        tile.querySelector('[data-amount]').textContent = minutes === null ? '?' : duration(api, minutes);
      });
      context.nodes('[data-piece]').forEach(function (tile) {
        var piece = Object.hasOwn(pieces, tile.dataset.piece) ? pieces[tile.dataset.piece] : null;
        if (piece) set++;
        tile.dataset.state = piece ? 'set' : 'unset';
        paintHero(tile.querySelector('.town-gear-item'), piece);
      });
      put('pieces', fill(api, 'pieces', { n: api.fmt(set) }));
      context.nodes('[data-gov]').forEach(function (tile) {
        var id = tile.dataset.gov;
        tile.dataset.state = govState(gear[id]);
        paintCard(tile.querySelector('.town-gov-card'), id, gear[id]);
        tile.querySelectorAll('[data-charm]').forEach(function (gem) { paintGem(gem, id.split('-')[0], charms[gem.dataset.charm]); });
        tile.setAttribute('aria-label', tileName(tile) + ': ' + govLevelName(gear[id]));
      });
      put('gearScore', score('gear', gear)); put('charmScore', score('charms', charms));
      var gearGain = T.governorGain(snapshot, 'gear').score, charmGain = T.governorGain(snapshot, 'charms').score;
      put('gain', gearGain === null && charmGain === null ? t(api, 'gainUnknown') : fill(api, 'gainBoth', { gear: gearGain === null ? '—' : api.fmt(gearGain), charms: charmGain === null ? '—' : api.fmt(charmGain) }));
      renderDialog(snapshot, gear, charms);
    }
    function value(input, next) { if (input !== document.activeElement) input.value = next === null || next === undefined ? '' : next; }
    function rateText(id) {
      var top = T.topRate(id);
      if (!top) return t(api, 'noRate');
      return fill(api, /^speedup-/.test(id) ? 'topRateMinute' : 'topRate', { rate: api.fmt(top.rate), event: eventName(api, top.event), day: api.fmt(top.day) });
    }
    function renderDialog(snapshot, gear, charms) {
      if (!dialog || !editing) return;
      dialog.querySelectorAll('[data-panel]').forEach(function (panel) { panel.hidden = panel.dataset.panel !== editing.type; });
      target('clear').hidden = editing.type === 'hero';
      if (editing.type === 'count') {
        value(dialog.querySelector('[data-field="count"]'), confirmed(snapshot, editing.id));
        put('rate', rateText(editing.id));
      } else if (editing.type === 'duration') {
        var minutes = confirmed(snapshot, editing.id), inputs = dialog.querySelectorAll('[data-unit]');
        var typing = Array.from(inputs).some(function (input) { return input === document.activeElement; });
        var parts = minutes === null ? null : { d: Math.floor(minutes / 1440), h: Math.floor(minutes % 1440 / 60), m: minutes % 60 };
        if (!typing) inputs.forEach(function (input) { input.value = parts ? parts[input.dataset.unit] : ''; });
        put('durationRate', rateText(editing.id));
      } else if (editing.type === 'hero') {
        var piece = Object.hasOwn(snapshot.heroGear.pieces, editing.id) ? snapshot.heroGear.pieces[editing.id] : null;
        var view = target('heroArt'), troop = editing.id.split('-')[0], slot = editing.id.split('-')[1];
        setSrc(view.querySelector('img'), '../img/hero-gear/' + { inf: 'infantry', cav: 'cavalry', arc: 'archer' }[troop] + '-' + slot + '.webp');
        paintHero(view, piece);
        dialog.querySelectorAll('[data-quality][data-action]').forEach(function (chip) { chip.setAttribute('aria-pressed', String(!!piece && piece.quality === chip.dataset.quality)); });
        var level = dialog.querySelector('input[data-field="level"]'), mastery = dialog.querySelector('input[data-field="mastery"]');
        value(level, piece ? piece.level : null); value(mastery, piece ? piece.mastery : null);
        level.max = piece && piece.quality === 'epic' ? 80 : piece && piece.quality === 'mythic' ? 100 : 200;
        target('masteryRow').hidden = !!piece && piece.quality === 'epic';
      } else if (editing.type === 'gov') {
        var id = editing.id, index = gear[id];
        paintCard(target('govArt'), id, index);
        put('govLevel', govLevelName(index));
        dialog.querySelector('select[data-level="gear"]').value = index === null ? '' : String(index);
        dialog.querySelectorAll('select[data-charm-slot]').forEach(function (select) { var level = charms[id + '-' + select.dataset.charmSlot]; select.value = level === null ? '' : String(level); });
        dialog.querySelectorAll('.town-gov-gem[data-charm-slot]').forEach(function (gem) { paintGem(gem, id.split('-')[0], charms[id + '-' + gem.dataset.charmSlot]); });
      }
    }
    function labelOptions() {
      if (!dialog) return;
      Array.from(dialog.querySelector('select[data-level="gear"]').options).forEach(function (option) { if (Number(option.value) > 0) option.textContent = govLevelName(Number(option.value)); });
    }
    function write(fn) { try { fn(); } catch (cause) { render(); throw cause; } }
    function writePiece(change) {
      var snapshot = store.snapshot(), old = Object.hasOwn(snapshot.heroGear.pieces, editing.id) ? snapshot.heroGear.pieces[editing.id] : null;
      var next = Object.assign({ quality: 'mythic', level: 0, mastery: 0 }, old || {}, change), state = store.heroGear(H);
      state.pieces[editing.id] = H.normalisePiece(next);
      write(function () { store.writeHeroGear(state, H, { piece: editing.id }); });
    }
    function writeGov(kind, id, level) { var change = {}; change[id] = level; write(function () { store.setGovernor(kind, change); }); }
    context.listen(root, 'tabs:select', function (e) {
      if (e.detail.binding === 'town-shelf') context.nodes('[data-shelf]').forEach(function (panel) { panel.hidden = panel.dataset.shelf !== e.detail.value; });
      else if (e.detail.binding === 'town-troop') context.nodes('[data-troop-board]').forEach(function (board) { board.hidden = board.dataset.troopBoard !== e.detail.value; });
    });
    if (dialog) {
      context.listen(dialog, 'close', function () { editing = null; });
      context.listen(dialog, 'click', function (event) { if (event.target === dialog) dialog.close(); });
    }
    context.cleanup(store.subscribe(render));
    return { refresh: function () { labelOptions(); render(); }, actions: {
      edit: { run: function (tile) {
        if (!dialog) return;
        editing = tile.dataset.count ? { type: 'count', id: tile.dataset.count } : tile.dataset.duration ? { type: 'duration', id: tile.dataset.duration } : tile.dataset.piece ? { type: 'hero', id: tile.dataset.piece } : { type: 'gov', id: tile.dataset.gov };
        var name = tileName(tile);
        if (editing.type === 'hero') name = api.tr('gear.' + editing.id.split('-')[0], TROOPS[editing.id.split('-')[0]]) + ' · ' + name;
        put('title', name);
        render();
        if (!dialog.open) dialog.showModal();
        var first = dialog.querySelector('[data-panel="' + editing.type + '"] input');
        if (first && editing.type !== 'hero') first.focus();
      } },
      close: { run: function () { dialog.close(); } },
      count: { events: ['input'], run: function (input) {
        if (!editing || !input.validity.valid) return;
        write(function () { store.setBalance(editing.id, input.value === '' ? null : Number(input.value)); });
      } },
      duration: { events: ['input'], run: function () {
        if (!editing) return;
        var inputs = Array.from(dialog.querySelectorAll('[data-unit]')), minutes = 0;
        if (!inputs.every(function (input) { return input.validity.valid; })) return;
        var blank = inputs.every(function (input) { return input.value === ''; });
        inputs.forEach(function (input) { minutes += (Number(input.value) || 0) * UNIT[input.dataset.unit]; });
        if (!blank && !(Number.isSafeInteger(minutes) && minutes <= 1e9)) return;
        write(function () { store.setBalance(editing.id, blank ? null : minutes); });
      } },
      settle: { events: ['change'], run: function (input) { input.blur(); render(); } },
      quality: { run: function (chip) { if (editing) writePiece({ quality: chip.dataset.quality }); } },
      piece: { events: ['change'], run: function (input) {
        if (!editing || !input.validity.valid || input.value === '') { render(); return; }
        var change = {}; change[input.dataset.field] = Number(input.value); input.blur(); writePiece(change);
      } },
      step: { run: function (button) {
        if (!editing) return;
        var input = dialog.querySelector('input[data-field="' + button.dataset.field + '"]'), change = {};
        change[button.dataset.field] = Math.max(0, (Number(input.value) || 0) + Number(button.dataset.step));
        writePiece(change);
      } },
      govLevel: { events: ['change'], run: function (select) {
        if (!editing) return;
        writeGov(select.dataset.level, select.dataset.charmSlot ? editing.id + '-' + select.dataset.charmSlot : editing.id, select.value === '' ? null : Number(select.value));
      } },
      govStep: { run: function (button) {
        if (!editing) return;
        var slot = button.dataset.charmSlot, kind = slot ? 'charms' : 'gear', id = slot ? editing.id + '-' + slot : editing.id;
        var now = store.governor(kind)[id], next = Math.min(G.max(kind), Math.max(0, (now || 0) + Number(button.dataset.step)));
        if (now !== null && next === now) return;
        writeGov(kind, id, next);
      } },
      clear: { run: function () {
        if (!editing) return;
        if (editing.type === 'gov') { var change = {}; change[editing.id] = null; var charms = {}; [1, 2, 3].forEach(function (c) { charms[editing.id + '-' + c] = null; }); write(function () { store.setGovernor('gear', change); store.setGovernor('charms', charms); }); }
        else if (editing.type !== 'hero') write(function () { store.setBalance(editing.id, null); });
      } }
    } };
  });
})();
