/* The Beast Cage: every pet's pen, the care you give the ones you have tamed, and the
   "Your pet" form saved in the shared ledger (pets.roster). The pen's scene is chosen by
   mood through data attributes; CSS does all of the drawing. Moods are worked out from
   the clock (PetCare) when the page opens, after each action, once a minute and whenever
   the tab comes back into view. A reaction (a pat, a meal, a refusal) shows for a moment.

   pet-advances paints the KvK points table from the same ledger section. */
(function () {
  'use strict';
  var EN = {
    count: '{n} pets', owned: '{n} tamed', needs: '{n} need you', lv: 'Lv {n}',
    'mood.asleep': 'Asleep.', 'mood.hungry': 'Hungry.', 'mood.lonely': 'Lonely.', 'mood.delighted': 'Delighted.', 'mood.content': 'Content.', 'mood.restless': 'Restless.',
    'why.asleep': 'Night has fallen. A pat wakes it.', 'why.hungry': 'Its belly is rumbling.', 'why.lonely': 'It has not had a pat in a while.',
    'why.delighted': 'Well fed and well loved.', 'why.content': 'All is well in the pen.', 'why.restless': 'A snack and a pat would help.',
    'react.full': 'Too full to eat.', fed: 'Fed {ago}.', patted: 'Patted {ago}.',
    ago: { now: 'just now', min: '{n} min ago', hour: '{n} h ago' },
    next: 'Next Advance at level {level}: {cost}. Worth {points} KvK prep points.', nextOnly: 'Next Advance at level {level}: {cost}.', top: 'Every Advance is done.',
    tomax: 'To level {max} with every Advance: {cost}, {n} Advances, {points} KvK prep points.', unread: 'Enter its level to see what comes next.',
    'm.petFood': '{n} Pet Food', 'm.growthManual': '{n} Growth Manuals', 'm.nutrientPotion': '{n} Nutrient Potions', 'm.promotionMedallion': '{n} Promotion Medallions', free: 'nothing more',
    skillNow: 'skill level {n}', total: '{points} KvK prep points from your next Advances', none: 'Tame a pet and enter its level to count its Advances.',
    unknownPets: 'Unread levels: {names}.', allRead: 'Every tamed pet counted.'
  };
  function t(api, key) { var path = key.split('.'), fallback = EN; path.forEach(function (part) { fallback = fallback && fallback[part]; }); return api.tr('pets.' + key, typeof fallback === 'string' ? fallback : key); }
  function costText(api, cost) {
    var parts = window.PetPlan.KEYS.filter(function (key) { return cost[key] > 0; }).map(function (key) { return api.fill(t(api, 'm.' + key), { n: api.fmt(cost[key]) }); });
    return parts.length ? parts.join(', ') : t(api, 'free');
  }
  function shared() { try { var store = window.PlayerLedger.shared(); store.snapshot(); return store; } catch (cause) { return null; } }

  window.Interactions.register('pet-den', function (context) {
    var api = context.api, Plan = window.PetPlan, Care = window.PetCare, store = shared(), mine = { roster: {} }, storage = null, den = {}, timers = {};
    try { storage = window.localStorage; den = Care.load(storage); } catch (cause) { storage = null; }
    var records = context.nodes('[data-pet].pet-card').map(function (node) {
      return { node: node, id: node.dataset.pet, pet: Plan.find(node.dataset.pet), pen: node.querySelector('[data-pen]'), owned: node.querySelector('[data-field="owned"]'),
        care: node.querySelector('[data-target~="pet-den.care"]'), form: node.querySelector('[data-target~="pet-den.form"]') };
    });
    records.forEach(function (record) { record.owned.disabled = !store; if (record.form) record.form.disabled = !store; });
    function find(node, name) { return Array.from(node.querySelectorAll('[data-target~="pet-den.' + name + '"]')); }
    function ago(ms) {
      var minutes = Math.floor(ms / 60000);
      if (minutes < 1) return t(api, 'ago.now');
      return minutes < 60 ? api.fill(t(api, 'ago.min'), { n: api.fmt(minutes) }) : api.fill(t(api, 'ago.hour'), { n: api.fmt(Math.floor(minutes / 60)) });
    }
    function paintCare(record, now) {
      var tamed = Object.hasOwn(mine.roster, record.id);
      record.care.hidden = !tamed;
      if (!tamed) { record.pen.dataset.mood = 'content'; return null; }
      if (!den[record.id]) den[record.id] = Care.fresh(now);
      var care = den[record.id], mood = Care.mood(care, now, new Date(now).getHours()), level = Care.level(care, now);
      record.pen.dataset.mood = mood;
      find(record.node, 'mood').forEach(function (node) { node.textContent = t(api, 'mood.' + mood); });
      find(record.node, 'why').forEach(function (node) { if (!record.reacting) node.textContent = t(api, 'why.' + mood); });
      record.node.querySelectorAll('[data-meter]').forEach(function (bar) {
        var value = Math.round(level[bar.dataset.meter]);
        bar.setAttribute('aria-valuenow', value);
        bar.firstElementChild.style.width = value + '%';
        bar.toggleAttribute('data-low', value < 25);
      });
      return mood;
    }
    function paintMine(record) {
      var copy = mine.roster[record.id] || null, pet = record.pet;
      record.node.dataset.owned = String(Boolean(copy));
      record.owned.checked = Boolean(copy);
      var skill = Plan.skillLevel(copy);
      record.node.querySelectorAll('.pet-ladder [data-level]').forEach(function (cell) { cell.toggleAttribute('data-reached', skill !== null && Number(cell.dataset.level) <= skill); });
      find(record.node, 'advanced').forEach(function (node) { node.hidden = !copy || copy.level === null || copy.level % 10 !== 0; });
      var next = Plan.nextAdvance(pet, copy), max = Plan.toMax(pet, copy);
      find(record.node, 'next').forEach(function (node) {
        if (!copy) { node.textContent = ''; return; }
        if (copy.level === null) { node.textContent = t(api, 'unread'); return; }
        node.textContent = !next ? t(api, 'top') : api.fill(t(api, 'next'), { level: api.fmt(next.level), cost: costText(api, next.cost), points: api.fmt(next.cost.kvk) });
      });
      find(record.node, 'tomax').forEach(function (node) {
        node.textContent = copy && max && max.advances ? api.fill(t(api, 'tomax'), { max: api.fmt(pet.maxLevel), cost: costText(api, max), n: api.fmt(max.advances), points: api.fmt(max.kvk) }) : '';
      });
      if (!record.form) return;
      record.form.querySelectorAll('[data-field]').forEach(function (input) {
        if (input === document.activeElement && input.type !== 'checkbox') return;
        if (input.dataset.field === 'advanced') { input.checked = Boolean(copy && copy.advanced); input.disabled = !copy; }
        else { input.value = copy && copy.level !== null ? copy.level : ''; input.disabled = !copy; }
      });
    }
    function render() {
      try { mine = store ? store.pets() : mine; } catch (cause) { mine = { roster: {} }; }
      var now = Date.now(), owned = 0, needy = 0;
      records.forEach(function (record) {
        paintMine(record);
        var mood = paintCare(record, now);
        if (mood) { owned++; if (mood === 'hungry' || mood === 'lonely') needy++; }
      });
      context.root.toggleAttribute('data-collection', owned > 0);
      context.root.querySelectorAll('[data-number]').forEach(function (node) { node.textContent = api.fmt(Number(node.dataset.number)); });
      var text = api.fill(t(api, 'count'), { n: api.fmt(records.length) });
      if (owned) text += ' · ' + api.fill(t(api, 'owned'), { n: api.fmt(owned) });
      if (needy) text += ' · ' + api.fill(t(api, 'needs'), { n: api.fmt(needy) });
      context.targets('count').forEach(function (node) { node.textContent = text; });
      persist();
    }
    function persist() { if (storage) try { Care.save(storage, den); } catch (cause) { /* storage full or blocked: the care lasts for this visit */ } }
    // A reaction shows on the pen for a moment, then the mood's own marks come back.
    function react(record, kind, message) {
      clearTimeout(timers[record.id]);
      record.pen.dataset.react = kind;
      record.reacting = Boolean(message);
      if (message) find(record.node, 'why').forEach(function (node) { node.textContent = message; });
      timers[record.id] = setTimeout(function () { delete record.pen.dataset.react; record.reacting = false; render(); }, 2400);
    }
    function act(node, kind) {
      var record = records.filter(function (item) { return item.node.contains(node); })[0];
      if (!record || !Object.hasOwn(mine.roster, record.id)) return;
      var now = Date.now(), result = (kind === 'feed' ? Care.feed : Care.pat)(den[record.id] || Care.fresh(now), now);
      den[record.id] = result.record;
      render();
      react(record, result.react, result.react === 'full' ? t(api, 'react.full') : null);
    }
    function number(input) { return input.value === '' ? null : Number(input.value); }
    function edit(input) {
      var record = records.filter(function (item) { return item.node.contains(input); })[0];
      if (!record || !store || (input.type === 'number' && !input.validity.valid)) return;
      var field = input.dataset.field, saved = record.node.querySelector('[data-target~="pet-den.saved"]');
      try {
        if (field === 'owned') store.setPet(record.id, input.checked ? (mine.roster[record.id] || {}) : null);
        else {
          var copy = Object.assign({ level: null, advanced: false }, mine.roster[record.id]);
          if (field === 'advanced') copy.advanced = input.checked; else copy.level = number(input);
          store.setPet(record.id, copy);
        }
        if (saved) saved.textContent = api.tr('gear.saved', '');
      } catch (cause) {
        if (saved) saved.textContent = api.tr('gear.saveFailed', '');
        render(); throw cause;
      }
    }
    // One dossier open at a time; the opened one is brought into view as the pens reflow.
    records.forEach(function (record) {
      var dossier = record.node.querySelector('.pet-dossier');
      context.listen(dossier, 'toggle', function () {
        if (!dossier.open) return;
        records.forEach(function (other) { var d = other.node.querySelector('.pet-dossier'); if (d !== dossier && d.open) d.open = false; });
        var top = record.node.getBoundingClientRect().top;
        if (top < 0 || top > window.innerHeight * 0.6) record.node.scrollIntoView({ block: 'start' });
      });
    });
    context.listen(context.root, 'change', function (event) {
      var input = event.target.closest && event.target.closest('.pet-card [data-field]');
      if (input) try { edit(input); } catch (cause) { context.emit('module:error', { module: 'pet-den', message: cause.message }); }
    });
    context.listen(document, 'visibilitychange', function () { if (!document.hidden) render(); });
    var tick = setInterval(render, 60000);
    context.cleanup(function () { clearInterval(tick); Object.keys(timers).forEach(function (id) { clearTimeout(timers[id]); }); });
    if (store) context.cleanup(store.subscribe(render));
    render();
    return {
      refresh: render,
      actions: {
        pat: { events: ['click'], run: function (node) { act(node, 'pat'); } },
        feed: { events: ['click'], run: function (node) { act(node, 'feed'); } }
      }
    };
  });

  window.Interactions.register('pet-advances', function (context) {
    var api = context.api, Plan = window.PetPlan, store = shared();
    function render() {
      var roster = {};
      try { roster = store ? store.pets().roster : {}; } catch (cause) { roster = {}; }
      var rows = [], total = 0, unread = [];
      Plan.PETS.forEach(function (pet) {
        if (!Object.hasOwn(roster, pet.id)) return;
        var copy = roster[pet.id];
        if (copy.level === null) { unread.push(pet.name); return; }
        var next = Plan.nextAdvance(pet, copy), max = Plan.toMax(pet, copy);
        total += next ? next.cost.kvk : 0;
        rows.push({ pet: pet, copy: copy, next: next, max: max });
      });
      var body = context.targets('rows')[0];
      if (body) {
        body.replaceChildren();
        rows.forEach(function (row) {
          var tr = document.createElement('tr'), th = document.createElement('th');
          th.scope = 'row'; th.lang = 'en'; th.textContent = row.pet.name;
          var small = document.createElement('small'); small.textContent = api.fill(t(api, 'lv'), { n: api.fmt(row.copy.level) }) + ' · ' + api.fill(t(api, 'skillNow'), { n: api.fmt(Plan.skillLevel(row.copy)) });
          th.appendChild(small);
          var cells = [row.next ? api.fill(t(api, 'lv'), { n: api.fmt(row.next.level) }) : '—', row.next ? api.fmt(row.next.cost.kvk) : '—', api.fmt(row.max.advances)];
          tr.appendChild(th);
          cells.forEach(function (text) { var td = document.createElement('td'); td.textContent = text; tr.appendChild(td); });
          body.appendChild(tr);
        });
      }
      context.targets('table').forEach(function (node) { node.hidden = !rows.length; });
      context.targets('total').forEach(function (node) { node.textContent = rows.length ? api.fill(t(api, 'total'), { points: api.fmt(total) }) : '—'; });
      context.targets('coverage').forEach(function (node) {
        node.textContent = !rows.length && !unread.length ? t(api, 'none') : unread.length ? api.fill(t(api, 'unknownPets'), { names: unread.join(', ') }) : t(api, 'allRead');
      });
      context.root.querySelectorAll('[data-number]').forEach(function (node) { node.textContent = api.fmt(Number(node.dataset.number)); });
    }
    if (store) context.cleanup(store.subscribe(render));
    render();
    return { refresh: render };
  });
})();
