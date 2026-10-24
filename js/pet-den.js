/* The Beast Cage: every pet's pen, the care you give the ones you have tamed, and the
   "Your pet" form saved in the shared ledger (pets.roster). The pen's scene is chosen by
   mood through data attributes; CSS does all of the drawing. Moods are worked out from
   the clock (PetCare) when the page opens, after each action, once a minute and whenever
   the tab comes back into view. A tamed pet is cared for by hand: rub it back and forth,
   or stroke it with a finger or a held button, to pet it; drag the food from its bowl
   onto it to feed it. The food follows the pointer a whole character cell at a time.
   From the keyboard, the pen and the bowl are buttons. A reaction shows for a moment.

   pet-advances paints the KvK points table from the same ledger section. */
(function () {
  'use strict';
  var EN = {
    count: '{n} pets', owned: '{n} tamed', needs: '{n} need you', lv: 'Lv {n}',
    'mood.asleep': 'Asleep', 'mood.hungry': 'Hungry', 'mood.lonely': 'Lonely', 'mood.delighted': 'Delighted', 'mood.content': 'Content', 'mood.restless': 'Restless', pat: 'Pet',
    next: 'Next Advance at level {level}: {cost}. Worth {points} KvK prep points.', nextOnly: 'Next Advance at level {level}: {cost}.', top: 'Every Advance is done.',
    tomax: 'To level {max} with every Advance: {cost}, {n} Advances, {points} KvK prep points.', unread: 'Enter its level to see what comes next.',
    'm.petFood': '{n} Pet Food', 'm.growthManual': '{n} Growth Manuals', 'm.nutrientPotion': '{n} Nutrient Potions', 'm.promotionMedallion': '{n} Promotion Medallions', free: 'nothing more',
    skillNow: 'skill level {n}', total: '{points} KvK prep points from your next Advances', none: 'Tame a pet and enter its level to count its Advances.',
    unknownPets: 'Unread levels: {names}.', allRead: 'Every tamed pet counted.',
    'bond.new': 'Getting acquainted', 'bond.familiar': 'Familiar', 'bond.close': 'Close companion', 'bond.trusted': 'Trusted friend',
    bondDays: 'Care days: {n}', bondHint: 'Grows with care on different days. Never lost when you are away.',
    'spot.head': 'Head', 'spot.cheeks': 'Cheeks', 'spot.chin': 'Chin', favourite: 'Favourite spot: {spot}',
    explore: 'Use Up and Down to explore head, cheeks and chin; Enter to stroke.'
  };
  function t(api, key) { return api.tr('pets.' + key, EN[key] || key); }
  function costText(api, cost) {
    var parts = window.PetPlan.KEYS.filter(function (key) { return cost[key] > 0; }).map(function (key) { return api.fill(t(api, 'm.' + key), { n: api.fmt(cost[key]) }); });
    return parts.length ? parts.join(', ') : t(api, 'free');
  }
  function shared(context) { try { var store = context.ledger; store.snapshot(); return store; } catch (cause) { return null; } }

  window.Interactions.register('pet-den', function (context) {
    var api = context.api, Plan = window.PetPlan, Care = window.PetCare, editor = window.RosterEditor, store = shared(context), mine = { roster: {} }, storage = null, den = {}, timers = {};
    try { storage = window.localStorage; den = Care.load(storage); } catch (cause) { storage = null; }
    var records = context.nodes('[data-pet].pet-card').map(function (node) {
      return { node: node, id: node.dataset.pet, pet: Plan.find(node.dataset.pet), pen: node.querySelector('[data-pen]'), owned: node.querySelector('[data-field="owned"]'),
        care: node.querySelector('[data-target~="pet-den.care"]'), form: node.querySelector('[data-target~="pet-den.form"]'),
        stroke: node.querySelector('[data-target~="pet-den.stroke"]'), food: node.querySelector('[data-target~="pet-den.food"]') };
    });
    records.forEach(function (record) { record.owned.disabled = !store; if (record.form) record.form.disabled = !store; });
    function find(node, name) { return Array.from(node.querySelectorAll('[data-target~="pet-den.' + name + '"]')); }
    function paintCare(record, now) {
      var tamed = Object.hasOwn(mine.roster, record.id);
      record.care.hidden = !tamed;
      record.stroke.hidden = !tamed;
      if (!tamed) { record.pen.dataset.mood = 'content'; record.visited = false; clearTimeout(timers[record.id]); delete record.pen.dataset.react; record.pen.removeAttribute('data-favourite'); record.pen.removeAttribute('data-welcome'); return null; }
      if (!den[record.id]) den[record.id] = Care.fresh(now);
      var care = den[record.id], mood = Care.mood(care, now, new Date(now).getHours()), level = Care.level(care, now);
      record.pen.dataset.mood = mood;
      record.stroke.setAttribute('aria-label', t(api, 'pat') + ' · ' + t(api, 'mood.' + mood) + (record.spot ? ' · ' + t(api, 'spot.' + record.spot) : ''));
      record.stroke.setAttribute('aria-description', t(api, 'explore'));
      var bond = Care.bond(care), label = t(api, 'bond.' + Care.stage(care));
      find(record.node, 'bond').forEach(function (node) {
        node.textContent = label + (bond.days ? ' · ' + api.fill(t(api, 'bondDays'), { n: api.fmt(bond.days) }) : '');
        node.title = t(api, 'bondHint');
      });
      find(record.node, 'favourite').forEach(function (node) {
        var spot = Care.SPOTS.filter(function (spot) { return Care.favourite(record.id, spot); })[0];
        node.hidden = !bond.favourite;
        var text = api.fill(t(api, 'favourite'), { spot: t(api, 'spot.' + spot) });
        if (node.textContent !== text) node.textContent = text;
      });
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
    function react(record, kind, favourite, welcome) {
      clearTimeout(timers[record.id]);
      record.pen.dataset.react = kind;
      record.pen.toggleAttribute('data-favourite', Boolean(favourite));
      record.pen.toggleAttribute('data-welcome', Boolean(welcome));
      timers[record.id] = setTimeout(function () { delete record.pen.dataset.react; record.pen.removeAttribute('data-favourite'); record.pen.removeAttribute('data-welcome'); render(); }, 2400);
    }
    function recordOf(node) { return editor.recordOf(records, node); }
    function act(record, kind, spot) {
      if (!record || !Object.hasOwn(mine.roster, record.id)) return;
      var now = Date.now(), result = (kind === 'feed' ? Care.feed : Care.pat)(den[record.id] || Care.fresh(now), now);
      var favourite = kind === 'pat' && Care.favourite(record.id, spot);
      den[record.id] = result.react === 'full' ? result.record : Care.befriend(result.record, now, favourite);
      render();
      react(record, result.react, favourite);
    }
    // Petting is a rub: three turns back and forth over the pet, each at least a tenth of
    // its width, or, with a finger or a held button, half its width of stroking. Keep
    // going and it counts again.
    var strokes = {};
    function stroke(event) {
      var surface = event.target.closest && event.target.closest('[data-target~="pet-den.stroke"]'), touch = strokes[event.pointerId];
      if (!surface || surface.hidden) { delete strokes[event.pointerId]; return; }
      if (!touch || touch.surface !== surface) touch = strokes[event.pointerId] = { surface: surface, x: event.clientX, dir: 0, run: 0, travel: 0, turns: 0, zones: { head: 0, cheeks: 0, chin: 0 } };
      var dx = event.clientX - touch.x, width = surface.getBoundingClientRect().width;
      touch.x = event.clientX;
      if (!dx || !width) return;
      var dir = dx > 0 ? 1 : -1;
      if (dir !== touch.dir) { if (touch.run >= width / 10) touch.turns++; touch.dir = dir; touch.run = 0; }
      touch.run += Math.abs(dx); touch.travel += Math.abs(dx);
      var box = surface.getBoundingClientRect(), record = recordOf(surface), x = (event.clientX - box.left) / box.width, y = (event.clientY - box.top) / box.height;
      var zone = Care.spot(y);
      if (record.pen.petCareSpots) {
        var near = record.pen.petCareSpots.map(function (p) { return { name: p.name, distance: Math.hypot((x - p.x) / 0.18, (y - p.y) / 0.14) }; }).sort(function (a, b) { return a.distance - b.distance; })[0];
        zone = near && near.distance <= 1 ? near.name : null;
      }
      if (zone) touch.zones[zone] += Math.abs(dx);
      var held = event.pointerType !== 'mouse' || event.buttons > 0;
      if (touch.turns >= 3 || (held && touch.travel >= width / 2)) {
        var spot = Care.SPOTS.filter(function (name) { return touch.zones[name] >= touch.travel * 0.6; })[0];
        touch.turns = 0; touch.travel = 0; touch.zones = { head: 0, cheeks: 0, chin: 0 };
        act(recordOf(surface), 'pat', spot);
      }
    }
    function unstroke(event) { delete strokes[event.pointerId]; }
    // Feeding: the food leaves its bowl under the pointer, steps cell by cell, and is
    // eaten if it is let go over the pet; otherwise it drops back into the bowl.
    var carry = null;
    function cell(food) { var glyph = food.firstElementChild.getBoundingClientRect(); return { w: glyph.width || 8, h: glyph.height || 16 }; }
    function lift(event) {
      var food = event.target.closest && event.target.closest('[data-target~="pet-den.food"]');
      if (!food || carry || event.button > 0) return;
      event.preventDefault();
      carry = { food: food, record: recordOf(food), id: event.pointerId, x: event.clientX, y: event.clientY, size: cell(food), moved: false };
      try { food.setPointerCapture(event.pointerId); } catch (cause) { /* already released */ }
      food.toggleAttribute('data-carried', true);
    }
    function over(record, event) {
      var box = record.pen.getBoundingClientRect();
      return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    }
    function move(event) {
      if (!carry || event.pointerId !== carry.id) return;
      var dx = Math.round((event.clientX - carry.x) / carry.size.w), dy = Math.round((event.clientY - carry.y) / carry.size.h);
      if (dx || dy) carry.moved = true;
      carry.food.style.setProperty('--cx', dx);
      carry.food.style.setProperty('--cy', dy);
      carry.record.pen.toggleAttribute('data-sniff', over(carry.record, event));
    }
    function drop(event) {
      if (!carry || event.pointerId !== carry.id) return;
      var done = carry;
      carry = null;
      done.food.removeAttribute('data-carried');
      done.food.style.removeProperty('--cx');
      done.food.style.removeProperty('--cy');
      done.record.pen.removeAttribute('data-sniff');
      if (event.type === 'pointerup' && done.moved && over(done.record, event)) act(done.record, 'feed');
    }
    function edit(input) {
      var record = recordOf(input);
      if (!record || !store || (input.type === 'number' && !input.validity.valid)) return;
      var field = input.dataset.field, saved = record.node.querySelector('[data-target~="pet-den.saved"]');
      editor.save(api, saved, render, function () {
        if (field === 'owned') store.setPet(record.id, input.checked ? (mine.roster[record.id] || {}) : null);
        else {
          var copy = Object.assign({ level: null, advanced: false }, mine.roster[record.id]);
          if (field === 'advanced') copy.advanced = input.checked; else copy.level = editor.number(input);
          store.setPet(record.id, copy);
        }
      });
    }
    editor.dossiers(context, records, '.pet-dossier');
    editor.onChange(context, 'pet-den', '.pet-card [data-field]', edit);
    ['pointermove', 'pointerdown'].forEach(function (type) { context.listen(context.root, type, stroke); });
    ['pointerup', 'pointercancel', 'pointerout'].forEach(function (type) { context.listen(context.root, type, unstroke); });
    context.listen(context.root, 'pointerdown', lift);
    context.listen(context.root, 'pointermove', move);
    context.listen(context.root, 'pointerup', drop);
    context.listen(context.root, 'pointercancel', drop);
    function greet(record) {
      if (document.hidden || !Object.hasOwn(mine.roster, record.id)) return;
      var box = record.pen.getBoundingClientRect();
      if (box.bottom <= 0 || box.top >= window.innerHeight) return;
      var visited = record.visited;
      record.visited = true;
      var now = Date.now(), result = Care.visit(den[record.id] || Care.fresh(now), now);
      den[record.id] = result.record; persist();
      if (!visited && result.welcome && Care.mood(result.record, now, new Date(now).getHours()) !== 'asleep' && !record.pen.dataset.react) react(record, 'pet', false, true);
    }
    var observer = new IntersectionObserver(function (entries) { entries.forEach(function (entry) { if (entry.isIntersecting) greet(recordOf(entry.target)); }); });
    records.forEach(function (record) { observer.observe(record.pen); });
    context.listen(context.root, 'keydown', function (event) {
      var surface = event.target.closest && event.target.closest('[data-target~="pet-den.stroke"]');
      if (!surface || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
      event.preventDefault();
      var record = recordOf(surface), at = Care.SPOTS.indexOf(record.spot);
      record.spot = Care.SPOTS[(at + (event.key === 'ArrowDown' ? 1 : at < 0 ? 0 : 2)) % 3];
      paintCare(record, Date.now());
    });
    context.listen(document, 'visibilitychange', function () {
      if (document.hidden) records.forEach(function (record) { record.visited = false; });
      else { render(); records.forEach(greet); }
    });
    context.cleanup(function () { observer.disconnect(); });
    var tick = setInterval(function () { render(); records.forEach(greet); }, 60000);
    context.cleanup(function () { clearInterval(tick); Object.keys(timers).forEach(function (id) { clearTimeout(timers[id]); }); });
    if (store) context.cleanup(store.subscribe(function () { render(); records.forEach(greet); }));
    render();
    records.forEach(greet);
    return {
      refresh: render,
      actions: {
        // Only a keyboard press (a click with no pointer behind it) pets or feeds outright.
        pat: { events: ['click'], run: function (node, event) { if (!event.detail) { var record = recordOf(node); if (record) act(record, 'pat', record.spot || 'head'); } } },
        feed: { events: ['click'], run: function (node, event) { if (!event.detail) act(recordOf(node), 'feed'); } }
      }
    };
  });

  window.Interactions.register('pet-advances', function (context) {
    var api = context.api, Plan = window.PetPlan, store = shared(context);
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
