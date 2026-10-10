/* Bounded DOM adapter for the governor planner. Arithmetic lives in governor-engine.js;
   levels, preferences and materials live in the shared player ledger. The page lays the
   six pieces out as the in-game profile does; this module paints them and the plan. */
(function () {
  'use strict';
  var EN = {
    'tier.green': 'Green', 'tier.blue': 'Blue', 'tier.purple': 'Purple', 'tier.gold': 'Gold', 'tier.red': 'Red',
    'slot.hat': 'Hat', 'slot.amulet': 'Amulet', 'slot.armour': 'Armour', 'slot.trousers': 'Trousers', 'slot.ring': 'Ring', 'slot.staff': 'Staff',
    notSet: 'not set', notCrafted: 'not crafted', noCharm: 'no charm', lv: 'Lv {n}',
    pieceTroop: '{slot} · {troop}', charmOf: '{slot} · charm {c}', tileLabel: '{name}: {level}. Charms: {charms}.',
    statGear: '+{n}% attack & defence', charmTotal: '+{n}% health & lethality from these three',
    nextGear: 'Next: {level}', nextMax: 'Fully upgraded.', nextUnset: 'Pick the level you see in game.',
    stepStats: '+{n}% stats', stepRun: '{n} steps', stepScore: '+{n} score', singleSource: 'only one table lists this step',
    planEmpty: 'Nothing your bag can pay for yet. Add materials, or set the level of each piece you own.',
    planUnknown: '{n} not set and left out. Tap a piece to set it.',
    planLimit: 'Showing the first {n} upgrades.', bagUnknown: 'Materials you have not entered count as none.',
    eventRow: '{event}, day {day}: about {points} points', eventNone: 'No event day in the guide scores this yet.', eventUnknown: 'One step has no published score, so the points are not shown.',
    spentLeft: '{n} left', needMissing: '{n} still to find', needEnough: 'you have enough', needUnknown: 'count not entered',
    targetUnknown: '{n} not set and left out of this total.', targetDone: 'Everything you have set is already there.', targetUnverified: 'Includes a step only one table lists (◇).',
    resetDone: 'Governor levels cleared. Your materials stay in the bag.'
  };
  var EVENTS = { prep: ['ks.today.kickerPrep', 'KvK prep'], sg: ['ks.governor.title', 'Strongest Governor'], brawl: ['ks.brawl.title', 'Alliance Brawl'] };
  var TROOPS = { inf: 'Infantry', cav: 'Cavalry', arc: 'Archer' };
  window.Interactions.register('governor-planner', function (context) {
    var G = window.Governor, store = window.PlayerLedger.shared(), api = context.api, root = context.root;
    var kind = 'gear', mode = 'spend', editing = null, art = root.dataset.art || '../img/governor/';
    function t(key) { return api.tr('gov.' + key, EN[key]); }
    function fill(key, values) { return api.fill(t(key), values); }
    function troop(id) { return api.tr('gear.' + id, TROOPS[id]); }
    function pieceOf(id) { var key = id.split('-').slice(0, 2).join('-'); return G.data.gear.pieces.find(function (p) { return p.id === key; }); }
    function slotName(id) { return t('slot.' + pieceOf(id).slot); }
    function itemName(id) {
      var parts = id.split('-');
      return parts.length === 2 ? fill('pieceTroop', { slot: slotName(id), troop: troop(parts[0]) }) : fill('charmOf', { slot: slotName(id), c: parts[2] });
    }
    function levelName(which, index) {
      if (index === null || index === undefined) return t('notSet');
      if (which === 'charms') return index ? fill('lv', { n: api.fmt(index) }) : t('noCharm');
      if (!index) return t('notCrafted');
      var d = G.describe('gear', index);
      return t('tier.' + d.tier) + (d.grade ? ' T' + api.fmt(d.grade) : '') + ' ' + api.fmt(d.stars) + '★';
    }
    function material(id) { return G.data.materials.find(function (m) { return m.id === id; }); }
    function materialName(id) { var item = material(id); return api.tr(item.key, item.label); }
    function el(tag, text, cls) { var node = document.createElement(tag); if (text !== undefined && text !== null) node.textContent = text; if (cls) node.className = cls; return node; }
    function icon(id, cls) { var img = el('img', null, cls || 'gov-icon'); img.src = art + id + '.webp'; img.alt = ''; img.width = 24; img.height = 24; return img; }
    function prefs() { return Object.assign({ goal: 'stats', focus: 'all', gearTarget: G.max('gear'), charmTarget: G.max('charms') }, store.snapshot().preferences.governor || {}); }
    function bag(snapshot, which) {
      var out = {}, unknown = false;
      G.data.materials.forEach(function (m) {
        var entry = snapshot.inventory[m.id];
        if (entry && entry.status === 'confirmed') out[m.id] = entry.amount;
        else { out[m.id] = null; if (G.data[which].materials.includes(m.id)) unknown = true; }
      });
      return { amounts: out, unknown: unknown };
    }
    function pct(n) { return new Intl.NumberFormat((window.I18N && window.I18N.locale) || 'en-GB', { maximumFractionDigits: 2 }).format(n); }
    function setSrc(img, src) { if (img && img.getAttribute('src') !== src) img.setAttribute('src', src); }
    function gearArt(id, index) { var d = index ? G.describe('gear', index) : { tier: 'green', grade: 0 }; return art + 'gear/' + id + '-' + d.tier + '-' + d.grade + '.webp'; }
    function charmArt(id, level) { return art + 'charms/' + id.split('-')[0] + '-' + Math.max(1, level || 1) + '.webp'; }
    function state(index) { return index === null || index === undefined ? 'unset' : index === 0 ? 'empty' : 'set'; }
    // A card is the piece art for its tier and grade; the level line beside it carries the stars.
    function paintCard(card, id, index) {
      card.dataset.state = state(index);
      card.dataset.tier = index ? G.describe('gear', index).tier : '';
      setSrc(card.querySelector('img'), gearArt(id, index));
    }
    function paintGem(gem, id, level) {
      gem.dataset.state = state(level);
      setSrc(gem.querySelector('img'), charmArt(id, level));
      var label = gem.querySelector('b'); if (label) label.textContent = level ? api.fmt(level) : '·';
    }
    function card(id, index, which) {
      var wrap;
      if (which === 'gear') { wrap = el('span', null, 'gov-card'); var img = el('img'); img.alt = ''; img.width = 160; img.height = 160; wrap.appendChild(img); paintCard(wrap, id, index); }
      else { wrap = el('span', null, 'gov-gem'); var gem = el('img'); gem.alt = ''; gem.width = 72; gem.height = 72; wrap.appendChild(gem); paintGem(wrap, id, index); }
      return wrap;
    }
    function sum(list) { return list.reduce(function (a, b) { return a + b; }, 0); }
    function labelOptions() {
      context.nodes('select[data-level="gear"], [data-target~="governor-planner.fillGear"], [data-target~="governor-planner.gearTarget"]').forEach(function (select) {
        Array.from(select.options).forEach(function (option) { if (option.value !== '' && Number(option.value) > 0) option.textContent = levelName('gear', Number(option.value)); });
      });
    }
    function put(key, value) { context.targets(key).forEach(function (node) { node.textContent = value; }); }
    function note(key, text) { context.targets(key).forEach(function (node) { node.hidden = !text; node.textContent = text || ''; }); }
    function costLine(cost) {
      var line = el('span', null, 'gov-costs');
      Object.keys(cost).filter(function (id) { return cost[id]; }).forEach(function (id) {
        var chip = el('span', null, 'gov-cost'); chip.appendChild(icon(id)); chip.appendChild(el('span', api.fmt(cost[id]))); chip.title = materialName(id); line.appendChild(chip);
      });
      return line;
    }
    function renderProfile(gear, charms) {
      context.nodes('.gov-tile').forEach(function (tile) {
        var id = tile.dataset.item, index = gear[id];
        tile.dataset.state = state(index);
        paintCard(tile.querySelector('.gov-card'), id, index);
        tile.querySelector('[data-part="level"]').textContent = levelName('gear', index);
        var levels = [];
        tile.querySelectorAll('[data-charm]').forEach(function (gem) { var level = charms[gem.dataset.charm]; levels.push(level === null ? '—' : api.fmt(level)); paintGem(gem, gem.dataset.charm, level); });
        tile.setAttribute('aria-label', fill('tileLabel', { name: itemName(id), level: levelName('gear', index), charms: levels.join(', ') }));
      });
      context.nodes('[data-troop-stat]').forEach(function (out) {
        var which = out.dataset.kind, ids = G.items(which).filter(function (item) { return item.troop === out.dataset.troopStat; }).map(function (item) { return item.id; });
        var source = which === 'gear' ? gear : charms, known = ids.filter(function (id) { return source[id] !== null; });
        out.textContent = known.length ? '+' + pct(sum(known.map(function (id) { return G.stat(which, source[id]); }))) + '%' : '—';
        out.dataset.partial = String(known.length > 0 && known.length < ids.length);
      });
      [['gearScore', 'gear', gear], ['charmScore', 'charms', charms]].forEach(function (entry) {
        var values = Object.keys(entry[2]).filter(function (id) { return entry[2][id] !== null; }).map(function (id) { return G.score(entry[1], entry[2][id]); });
        put(entry[0], !values.length || values.includes(null) ? '—' : api.fmt(sum(values)));
      });
    }
    function renderDialog(gear, charms) {
      var dialog = context.targets('dialog')[0];
      if (!dialog || !editing) return;
      var index = gear[editing], troopId = editing.split('-')[0];
      put('editTitle', itemName(editing));
      context.targets('editCard').forEach(function (node) { paintCard(node, editing, index); });
      put('editLevel', levelName('gear', index));
      put('editStat', index ? fill('statGear', { n: pct(G.stat('gear', index)) }) : '');
      var next = index === null ? t('nextUnset') : index >= G.max('gear') ? t('nextMax') : null;
      context.targets('editNext').forEach(function (node) {
        node.replaceChildren();
        if (next) { node.textContent = next; return; }
        node.appendChild(el('span', fill('nextGear', { level: levelName('gear', index + 1) }) + (G.verified('gear', index + 1) ? '' : ' ◇')));
        node.appendChild(costLine(G.data.gear.levels[index].cost));
      });
      var gearSelect = dialog.querySelector('select[data-level="gear"]');
      gearSelect.dataset.item = editing; gearSelect.value = index === null ? '' : String(index);
      var total = 0;
      dialog.querySelectorAll('[data-charm-row]').forEach(function (row) {
        var id = editing + '-' + row.dataset.charmRow, level = charms[id], select = row.querySelector('select');
        select.dataset.item = id; select.value = level === null ? '' : String(level);
        select.setAttribute('aria-label', itemName(id));
        if (level) total += G.stat('charms', level);
      });
      put('editCharmStat', total ? fill('charmTotal', { n: pct(total) }) : '');
      dialog.dataset.troop = troopId;
    }
    // Back-to-back steps on one item read as one upgrade: from where it starts to where it ends.
    function runs(steps) {
      return steps.reduce(function (out, step) {
        var last = out[out.length - 1];
        if (last && last.id === step.id && last.to === step.from) {
          last.to = step.to; last.stat += step.stat; last.verified = last.verified && step.verified; last.count += 1;
          last.score = last.score === null || step.score === null ? null : last.score + step.score;
          Object.keys(step.cost).forEach(function (id) { last.cost[id] = (last.cost[id] || 0) + step.cost[id]; });
        } else out.push(Object.assign({}, step, { cost: Object.assign({}, step.cost), count: 1 }));
        return out;
      }, []);
    }
    function renderSpend(state, materials, options) {
      var result = G.plan(kind, state, materials.amounts, { goal: options.goal, focus: options.focus, limit: 40 });
      var unset = G.items(kind).filter(function (item) { return state[item.id] === null && (options.focus === 'all' || item.troop === options.focus); }).length;
      put('count', api.fmt(result.steps.length));
      put('score', result.score === null ? '—' : '+' + api.fmt(result.score));
      var notes = [];
      if (!result.steps.length) notes.push(t('planEmpty'));
      if (unset) notes.push(fill('planUnknown', { n: api.fmt(unset) }));
      if (result.truncated) notes.push(fill('planLimit', { n: api.fmt(result.steps.length) }));
      if (materials.unknown) notes.push(t('bagUnknown'));
      note('status', notes.join(' '));
      context.targets('steps').forEach(function (list) {
        list.replaceChildren();
        runs(result.steps).forEach(function (step) {
          var li = el('li'), button = el('button', null, 'gov-step'), text = el('span', null, 'gov-step-text');
          button.type = 'button'; button.dataset.action = 'governor-planner.edit'; button.dataset.item = pieceOf(step.id).id;
          button.appendChild(card(step.id, step.to, kind));
          text.appendChild(el('span', itemName(step.id), 'gov-step-item'));
          text.appendChild(el('span', levelName(kind, step.from) + ' → ' + levelName(kind, step.to) + (step.verified ? '' : ' ◇'), 'gov-step-level'));
          var gain = options.goal === 'score' && step.score !== null ? fill('stepScore', { n: api.fmt(step.score) }) : fill('stepStats', { n: pct(step.stat) });
          var foot = el('span', null, 'gov-step-foot'); foot.appendChild(el('span', gain, 'gov-step-gain'));
          if (step.count > 1) foot.appendChild(el('span', fill('stepRun', { n: api.fmt(step.count) }), 'gov-step-run')); foot.appendChild(costLine(step.cost));
          text.appendChild(foot); button.appendChild(text);
          if (!step.verified) button.title = t('singleSource');
          li.appendChild(button); list.appendChild(li);
        });
      });
      context.targets('spent').forEach(function (strip) {
        strip.replaceChildren();
        G.data[kind].materials.forEach(function (id) {
          var cell = el('div'); cell.appendChild(icon(id, 'gov-icon gov-icon-lg'));
          cell.appendChild(el('strong', api.fmt(result.spent[id])));
          cell.appendChild(el('small', materials.amounts[id] === null ? t('needUnknown') : fill('spentLeft', { n: api.fmt(result.left[id]) })));
          cell.title = materialName(id); strip.appendChild(cell);
        });
      });
      context.targets('events').forEach(function (list) {
        list.replaceChildren();
        var rows = G.events(kind, result.score), best = {};
        rows.forEach(function (row) { if (!best[row.event] || row.rate > best[row.event].rate) best[row.event] = row; });
        var keys = Object.keys(best);
        if (!keys.length) list.appendChild(el('li', t('eventNone')));
        else if (result.score === null) list.appendChild(el('li', t('eventUnknown')));
        else keys.forEach(function (event) {
          var row = best[event];
          list.appendChild(el('li', fill('eventRow', { event: api.tr(EVENTS[event][0], EVENTS[event][1]), day: api.fmt(row.day), points: api.fmt(row.points) })));
        });
      });
      return result;
    }
    function renderReach(state, materials, options) {
      var level = kind === 'gear' ? options.gearTarget : options.charmTarget, target = G.toTarget(kind, state, level, materials.amounts);
      context.nodes('.gov-target label[data-kind]').forEach(function (label) { label.hidden = label.dataset.kind !== kind; });
      context.targets('targetCard').forEach(function (node) {
        if (kind === 'gear') { node.className = 'gov-card gov-target-card'; node.replaceChildren(el('img')); node.firstChild.alt = ''; paintCard(node, 'inf-1', level); }
        else { node.className = 'gov-gem gov-target-card'; node.replaceChildren(el('img')); node.firstChild.alt = ''; paintGem(node, 'inf-1-1', level); }
      });
      context.targets('target').forEach(function (strip) {
        strip.replaceChildren();
        Object.keys(target.cost).forEach(function (id) {
          var cell = el('div'), have = materials.amounts[id], need = target.cost[id], bar = el('progress');
          cell.appendChild(icon(id, 'gov-icon gov-icon-lg'));
          cell.appendChild(el('strong', api.fmt(need)));
          bar.max = Math.max(1, need); bar.value = have === null ? 0 : Math.min(have, need); cell.appendChild(bar);
          var missing = target.missing[id];
          cell.appendChild(el('small', missing === null ? t('needUnknown') : missing > 0 ? fill('needMissing', { n: api.fmt(missing) }) : t('needEnough'), missing > 0 ? 'gov-short' : ''));
          cell.title = materialName(id); strip.appendChild(cell);
        });
      });
      var notes = [];
      if (target.unknown.length) notes.push(fill('targetUnknown', { n: api.fmt(target.unknown.length) }));
      else if (!target.steps) notes.push(t('targetDone'));
      if (target.unverified) notes.push(t('targetUnverified'));
      note('targetNote', notes.join(' '));
      return target;
    }
    function render() {
      var snapshot = store.snapshot(), options = prefs(), materials = bag(snapshot, kind);
      var gear = store.governor('gear'), charms = store.governor('charms');
      renderProfile(gear, charms);
      renderDialog(gear, charms);
      ['gearTarget', 'charmTarget'].forEach(function (key) { context.targets(key).forEach(function (select) { select.value = String(options[key]); }); });
      context.nodes('[data-action="governor-planner.choose"]').forEach(function (button) { button.setAttribute('aria-pressed', String(options[button.dataset.option] === button.dataset.value)); });
      context.targets('spendPanel').forEach(function (node) { node.hidden = mode !== 'spend'; });
      context.targets('reachPanel').forEach(function (node) { node.hidden = mode !== 'reach'; });
      var state = kind === 'gear' ? gear : charms;
      var plan = renderSpend(state, materials, options), target = renderReach(state, materials, options);
      context.emit('governor-planner:planned', { kind: kind, plan: plan, target: target });
    }
    function refresh() { labelOptions(); render(); }
    context.targets('controls').forEach(function (node) { node.disabled = false; });
    context.listen(root, 'tabs:select', function (event) {
      var binding = event.detail.binding, value = event.detail.value;
      if (binding === 'governor-kind') kind = value === 'charms' ? 'charms' : 'gear';
      else if (binding === 'governor-mode') mode = value === 'reach' ? 'reach' : 'spend';
      else if (binding === 'governor-view') { root.dataset.view = value === 'plan' ? 'plan' : 'profile'; return; }
      else return;
      render();
    });
    var dialog = context.targets('dialog')[0];
    if (dialog) {
      context.listen(dialog, 'close', function () { editing = null; });
      context.listen(dialog, 'click', function (event) { if (event.target === dialog) dialog.close(); });
    }
    context.cleanup(store.subscribe(render));
    function write(fn) { try { fn(); } catch (cause) { render(); throw cause; } }
    return { refresh: refresh, actions: {
      edit: { run: function (node) {
        if (!dialog) return;
        editing = pieceOf(node.dataset.item).id; render();
        if (!dialog.open) dialog.showModal();
      } },
      close: { run: function () { if (dialog) dialog.close(); } },
      level: { events: ['change'], run: function (node) {
        if (!node.dataset.item) return;
        var change = {}; change[node.dataset.item] = node.value === '' ? null : Number(node.value);
        write(function () { store.setGovernor(node.dataset.level, change); });
      } },
      step: { run: function (button) {
        var select = button.parentNode.querySelector('select'), which = select.dataset.level;
        if (!select.dataset.item) return;
        var now = select.value === '' ? 0 : Number(select.value), next = Math.min(G.max(which), Math.max(0, now + Number(button.dataset.step)));
        if (select.value !== '' && next === now) return;
        var change = {}; change[select.dataset.item] = next;
        write(function () { store.setGovernor(which, change); });
      } },
      fill: { run: function (button) {
        var which = button.dataset.kind, select = context.targets(which === 'gear' ? 'fillGear' : 'fillCharms')[0];
        if (!select || select.value === '') return;
        var change = {}; G.items(which).forEach(function (item) { change[item.id] = Number(select.value); });
        write(function () { store.setGovernor(which, change); });
      } },
      choose: { run: function (button) {
        var key = button.dataset.option, value = button.dataset.value;
        write(function () { store.setGovernorPreference(key, value); });
      } },
      option: { events: ['change'], run: function (node) {
        var key = node.dataset.option, value = key === 'goal' || key === 'focus' ? node.value : Number(node.value);
        write(function () { store.setGovernorPreference(key, value); });
      } },
      reset: { run: function () {
        write(function () { store.resetGovernor(); });
        context.emit('player-status', { scope: 'governor', key: 'gov.resetDone', fallback: EN.resetDone });
      } }
    } };
  });
})();
