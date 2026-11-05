/* The Heroes page's break-point finder: two heroes of one troop type, each at its
   own stars, widget and skills, and how far either has to be built to catch the
   other. LeadEngine does the maths (js/lead-engine.js: score, walker); this file
   reads the choices and the account, walks a few scores at a time, and paints
   two star-by-widget tables. */
(function () {
  'use strict';
  var EN = {
    'side.a': 'First hero', 'side.b': 'Second hero',
    sameHero: 'Pick two different heroes.',
    working: 'Comparing… {n}%',
    'account.mineNote': 'Your saved Bonus Overview, troops, gear, Truegold and pets. {missing}',
    'account.typical': 'Typical generation {n} stats ({pct}%) where your Bonus Overview is not saved.',
    'account.stock': '{name} at generation {n}: {stars}★ teammates, widgets at {widget}, TG{tg}.',
    team: 'Beside {team}, with {joiners}.', noJoiners: 'no joiners', joinersList: 'joiners {list}', and: ' and ',
    'verdict.bear.ahead': '{winner} does {n}% more Bear damage than {loser}.',
    'verdict.fight.ahead': '{winner} keeps {n} points more of the army than {loser} on average.',
    'verdict.level': '{a} and {b} are level.',
    'catch.title': 'When {hero} catches {rival} as set',
    'catch.any': '{hero} matches {rival} from {stars} with widget {widget}.',
    'catch.bare': '{hero} matches {rival} from {stars} without a widget.',
    'catch.bareToo': 'Without a widget, from {stars}.',
    'catch.never': 'Even at 5★ with every widget level, {hero} does not catch {rival}.',
    'catch.always': '{hero} matches {rival} from 0★ with no widget.',
    noWidget: '{hero} has no widget; only the stars count.',
    starN: '{n}★', tier: '{n}/6', w: 'W{n}', yes: '✓', no: '—'
  };
  var PREFS = 'ks.hero-breakpoint.v1', LEAD_PREFS = 'ks.lead-finder.v1';
  var STATS = ['attack', 'lethality', 'defense', 'health'], TYPES = ['inf', 'cav', 'arc'], CHUNK = 3;

  window.Interactions.register('hero-breakpoint', function (context) {
    var api = context.api, L = window.LeadEngine, data = window.LeadData, store = null, ticket = 0;
    try { store = context.ledger; store.snapshot(); } catch (cause) { store = null; }
    function t(key) { return api.tr('bp.' + key, EN[key]); }
    function fill(key, values) { return api.fill(t(key), values); }
    function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
    function put(key, text) { context.targets(key).forEach(function (node) { node.textContent = text; }); }
    function field(side, name, slot) {
      return context.targets('field').filter(function (n) { return n.dataset.side === side && n.dataset.field === name && (slot === undefined || n.dataset.skill === String(slot)); })[0];
    }
    function read(key) { try { var v = JSON.parse(localStorage.getItem(key) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (cause) { return {}; } }
    function write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (cause) { /* kept for this visit */ } }
    function roster() { try { return store ? store.heroes().roster : {}; } catch (cause) { return {}; } }
    function combat() { try { return store ? store.combat() : { overview: {}, troops: [] }; } catch (cause) { return { overview: {}, troops: [] }; } }
    function stockGen(gen) { return Math.max(1, Math.min(data.megafauna.generations.length, gen | 0)); }

    // ---- The two heroes ------------------------------------------------------
    function newestOf(type, not) {
      var best = null;
      Object.keys(data.heroes).forEach(function (key) {
        var h = data.heroes[key];
        if (h.type !== type || key === not) return;
        if (!best || h.generation > data.heroes[best].generation || (h.generation === data.heroes[best].generation && h.ceiling > data.heroes[best].ceiling)) best = key;
      });
      return best;
    }
    // A fresh visit starts from your strongest owned hero that a newer one of its type
    // could replace, against the newest of that type; nothing owned starts with archers.
    function defaults() {
      var owned = roster(), pick = null;
      Object.keys(owned).forEach(function (key) {
        var copy = L.copyOf(key, owned[key], data);
        if (!copy || newestOf(copy.type) === key) return;
        if (!pick || L.statLine(copy, data) > L.statLine(pick, data)) pick = copy;
      });
      var a = pick ? pick.key : (function () { var top = newestOf('arc'); return Object.keys(data.heroes).filter(function (k) { return data.heroes[k].type === 'arc' && data.heroes[k].ceiling >= 200 && k !== top; }).sort(function (x, y) { return data.heroes[y].generation - data.heroes[x].generation; })[0]; })();
      return { a: a, b: newestOf(data.heroes[a].type, a) };
    }
    function investment(key) {
      var mine = roster()[key];
      if (mine && mine.stars !== null && mine.stars !== undefined) return { stars: mine.stars | 0, widget: mine.widget | 0, skills: mine.skills || null };
      return { stars: 24, widget: data.widgets[key] ? 4 : 0, skills: null };
    }
    function setHero(side, key) {
      var inv = investment(key);
      field(side, 'key').value = key;
      field(side, 'stars').value = String(inv.stars);
      field(side, 'widget').value = String(data.widgets[key] ? Math.min(10, inv.widget) : 0);
      [0, 1, 2].forEach(function (i) { field(side, 'skill', i).value = inv.skills && inv.skills[i] != null ? String(inv.skills[i]) : ''; });
    }
    // The second hero lists only the first one's troop type.
    function narrow() {
      var type = data.heroes[field('a', 'key').value].type, b = field('b', 'key');
      Array.prototype.forEach.call(b.querySelectorAll('optgroup'), function (g) { var off = g.dataset.troop !== type; g.hidden = off; g.disabled = off; });
      if (data.heroes[b.value].type !== type || b.value === field('a', 'key').value) setHero('b', newestOf(type, field('a', 'key').value));
      ['a', 'b'].forEach(function (side) {
        var key = field(side, 'key').value, widget = field(side, 'widget');
        widget.disabled = !data.widgets[key];
        if (!data.widgets[key]) widget.value = '0';
      });
    }
    function copyOf(side) {
      var key = field(side, 'key').value, skills = [0, 1, 2].map(function (i) { var v = field(side, 'skill', i).value; return v === '' ? null : Number(v); });
      return L.copyOf(key, { stars: Number(field(side, 'stars').value), widget: Number(field(side, 'widget').value), skills: skills.some(function (v) { return v !== null; }) ? skills.map(function (v) { return v === null ? 5 : v; }) : null }, data);
    }
    function remember() {
      var v = { job: job(), account: context.targets('account')[0].value, gen: context.targets('gen')[0].value };
      ['a', 'b'].forEach(function (side) {
        v[side] = { key: field(side, 'key').value, stars: field(side, 'stars').value, widget: field(side, 'widget').value, skills: [0, 1, 2].map(function (i) { return field(side, 'skill', i).value; }) };
      });
      write(PREFS, v);
    }
    function restore() {
      var v = read(PREFS), d = defaults();
      ['a', 'b'].forEach(function (side) {
        var saved = v[side];
        if (saved && data.heroes[saved.key]) {
          field(side, 'key').value = saved.key;
          field(side, 'stars').value = String(Math.max(0, Math.min(30, saved.stars | 0)));
          field(side, 'widget').value = String(Math.max(0, Math.min(10, saved.widget | 0)));
          [0, 1, 2].forEach(function (i) { var s = saved.skills && saved.skills[i]; field(side, 'skill', i).value = s === '' || s === undefined || s === null ? '' : String(Math.max(0, Math.min(5, s | 0))); });
        } else setHero(side, d[side]);
      });
      context.targets('job').forEach(function (n) { n.checked = n.value === (v.job || 'bear'); });
      var hasOverview = Object.keys(combat().overview || {}).length > 0;
      context.targets('account')[0].value = v.account || (hasOverview ? 'mine' : 'dolphin');
      // Your kingdom's generation when the page knows it, else the newest hero you own,
      // else the newer of the two heroes.
      var owned = roster(), ownedGen = 0;
      Object.keys(owned).forEach(function (key) { if (data.heroes[key] && L.copyOf(key, owned[key], data)) ownedGen = Math.max(ownedGen, data.heroes[key].generation); });
      var gen = v.gen || (window.KS_SERVER_AGE && window.KS_SERVER_AGE.getGeneration()) || ownedGen || Math.max(data.heroes[field('a', 'key').value].generation, data.heroes[field('b', 'key').value].generation);
      context.targets('gen')[0].value = String(stockGen(gen));
      narrow();
    }
    function job() { return (context.targets('job').filter(function (n) { return n.checked; })[0] || {}).value || 'bear'; }

    // ---- The account ---------------------------------------------------------
    // Yours: the lead finder's sources, read the same way (js/lead-finder.js).
    function mine(gen, which) {
      var saved = combat(), typical = data.megafauna.overview[String(gen)], rows = saved.overview || {}, out = {}, missing = [];
      function whole(row) { return row && STATS.every(function (k) { return typeof row[k] === 'number'; }); }
      var squads = whole(rows.squads) ? rows.squads : null;
      TYPES.forEach(function (type) {
        if (whole(rows[type])) { out[type] = {}; STATS.forEach(function (k) { out[type][k] = rows[type][k] + (squads ? squads[k] : 0); }); }
        else { missing.push(type); out[type] = { attack: typical, lethality: typical, defense: typical, health: typical }; }
      });
      var best = null;
      (saved.troops || []).forEach(function (row) { if (!best || row.tier > best.tier || (row.tier === best.tier && row.tg > best.tg)) best = row; });
      var stock = data.megafauna.troops[String(gen)], tier = best ? best.tier : stock.tier, tg = best ? best.tg : stock.tg;
      var prefs = read(LEAD_PREFS), joiners = prefs.joiners && Array.isArray(prefs.joiners[which])
        ? prefs.joiners[which].filter(function (j) { return j && data.heroes[j.key]; }).map(function (j) { return { key: j.key, level: Math.max(1, Math.min(5, j.level | 0)) }; })
        : (data.megafauna.joiners[which][String(gen)] || []).map(function (key) { return { key: key, level: 5 }; });
      var levels = {}, pieces = {}, town = null, city = {};
      try { var pets = store ? store.pets().roster : {}; Object.keys(pets).forEach(function (id) { levels[id] = pets[id].level; }); } catch (cause) { /* no pets */ }
      try { pieces = store ? store.snapshot().heroGear.pieces : {}; } catch (cause) { pieces = {}; }
      try { town = store ? store.buildings().levels['town-center'] : null; } catch (cause) { town = null; }
      Object.keys(prefs.city || {}).forEach(function (k) { city[k] = Number(prefs.city[k]) || 0; });
      // Your strongest owned hero in each other seat; a type you own none of takes the
      // Dolphin's meta hero for the generation, so no seat is left empty.
      var by = L.candidates(roster(), data, 1), dolphin = L.stockAccount(data.megafauna.foes[1], gen, which, data);
      return {
        account: {
          overview: out, troops: { tier: [tier, tier, tier], tg: [tg, tg, tg] }, joiners: joiners,
          city: L.cityLayer(city), pets: prefs.usePets === false ? L.blank() : L.petLayer(levels, data),
          gear: L.gearLayer(pieces), town: L.townLayer(town)
        },
        lineup: TYPES.map(function (type, i) { return by[type][0] || dolphin.lineup[i]; }),
        note: fill('account.mineNote', { missing: missing.length ? fill('account.typical', { n: api.fmt(gen), pct: api.fmt(typical) }) : '' }).trim()
      };
    }
    function account(gen, which) {
      var id = context.targets('account')[0].value;
      if (id === 'mine') return mine(gen, which);
      var foe = data.megafauna.foes.filter(function (f) { return f.id === id; })[0] || data.megafauna.foes[1];
      var acc = L.stockAccount(foe, gen, which, data), kit = L.loadout(foe, gen, data);
      var stars = Math.floor(kit.stars / 6) + (kit.stars % 6 ? ' ' + (kit.stars % 6) + '/6' : '');
      return { account: acc, lineup: acc.lineup, note: fill('account.stock', { name: api.tr('leads.foe.' + foe.id, foe.name), n: api.fmt(gen), stars: stars, widget: api.fmt(kit.widget), tg: api.fmt(kit.tg) }) };
    }

    // ---- Painting --------------------------------------------------------------
    function starsText(s) { var whole = Math.floor(s / 6), tier = s % 6; return fill('starN', { n: api.fmt(whole) }) + (tier ? ' ' + fill('tier', { n: api.fmt(tier) }) : ''); }
    function label(copy) { return data.heroes[copy.key].name + ' ' + starsText(copy.stars) + (copy.widget ? ' ' + fill('w', { n: api.fmt(copy.widget) }) : ''); }
    function face(side, copy) {
      var node = context.targets('face').filter(function (n) { return n.dataset.side === side; })[0];
      if (!node) return;
      var img = el('img'); img.src = '../img/heroes/' + copy.key + '.webp'; img.alt = ''; img.width = 56; img.height = 56; img.loading = 'lazy'; img.decoding = 'async';
      node.replaceChildren(img, el('b', '', data.heroes[copy.key].name));
    }
    // One block: the sentence, then the 0★–4★ rows of six tiers and the 5★ cell.
    function grid(side, hero, rival, r) {
      var block = context.targets('grid').filter(function (n) { return n.dataset.grid === side; })[0];
      var names = { hero: data.heroes[hero.key].name, rival: label(rival) };
      block.replaceChildren(el('p', 'lead-kicker', fill('catch.title', names)));
      var first = L.firstBreak(r.widgets), line;
      if (!first.any) line = fill('catch.never', names);
      else if (first.any.stars === 0 && first.any.widget === 0) line = fill('catch.always', names);
      else if (first.bare && first.bare.stars === first.any.stars) line = fill('catch.bare', { hero: names.hero, rival: names.rival, stars: starsText(first.bare.stars) });
      else {
        line = fill('catch.any', { hero: names.hero, rival: names.rival, stars: starsText(first.any.stars), widget: api.fmt(first.any.widget) });
        if (first.bare) line += ' ' + fill('catch.bareToo', { stars: starsText(first.bare.stars) });
      }
      block.appendChild(el('p', 'bp-line', line));
      if (!r.top) block.appendChild(el('p', 'lead-answer-note', fill('noWidget', { hero: names.hero })));
      var table = el('table', 'bp-grid'), head = el('tr'), body = el('tbody');
      head.appendChild(el('td'));
      for (var tier = 0; tier < 6; tier++) { var th = el('th', '', tier ? fill('tier', { n: api.fmt(tier) }) : '—'); th.scope = 'col'; head.appendChild(th); }
      var thead = el('thead'); thead.appendChild(head); table.appendChild(thead);
      for (var whole = 0; whole <= 5; whole++) {
        var tr = el('tr'), rh = el('th', '', fill('starN', { n: api.fmt(whole) })); rh.scope = 'row';
        tr.appendChild(rh);
        for (var step = 0; step < (whole < 5 ? 6 : 1); step++) {
          var s = whole * 6 + step, w = r.widgets[s], td = el('td', '', w === null ? t('no') : w === 0 ? t('yes') : fill('w', { n: api.fmt(w) }));
          td.dataset.state = w === null ? 'no' : w === 0 ? 'yes' : 'widget';
          td.style.setProperty('--need', String(w === null ? 0 : 1 - w / 11));
          if (first.any && s === first.any.stars) td.dataset.first = '';
          td.title = starsText(s);
          tr.appendChild(td);
        }
        body.appendChild(tr);
      }
      table.appendChild(body);
      block.appendChild(table);
    }
    function verdict(which, a, b, sa, sb) {
      var na = label(a), nb = label(b), diff;
      if (which === 'bear') {
        diff = Math.abs(sa / sb - 1) * 100;
        if (diff < 0.05) return fill('verdict.level', { a: na, b: nb });
        return fill('verdict.bear.ahead', { winner: sa > sb ? na : nb, loser: sa > sb ? nb : na, n: api.fmt(Math.round(diff * 10) / 10) });
      }
      diff = Math.abs(sa - sb) * 100;
      if (diff < 0.05) return fill('verdict.level', { a: na, b: nb });
      return fill('verdict.fight.ahead', { winner: sa > sb ? na : nb, loser: sa > sb ? nb : na, n: api.fmt(Math.round(diff * 10) / 10) });
    }
    function teamLine(lineup, type, acc) {
      var team = lineup.filter(function (c, i) { return c && TYPES[i] !== type; }).map(label);
      var joiners = acc.joiners && acc.joiners.length ? fill('joinersList', { list: acc.joiners.map(function (j) { return data.heroes[j.key].name + ' ' + api.fmt(j.level); }).join(', ') }) : t('noJoiners');
      return fill('team', { team: team.join(t('and')), joiners: joiners });
    }

    function run() {
      var mine = ticket += 1, which = job(), gen = stockGen(Number(context.targets('gen')[0].value) || 4);
      narrow(); remember();
      var a = copyOf('a'), b = copyOf('b'), result = context.targets('result')[0];
      face('a', a); face('b', b);
      if (a.key === b.key) { result.hidden = true; put('status', t('sameHero')); return; }
      var acc = account(gen, which);
      put('accountNote', acc.note);
      var opts = {}, you = acc.account, lineup = acc.lineup;
      // B against A as set, then A against B as set: two walks, a few scores per tick.
      var walks = [L.walker(which, you, lineup, a, b.key, gen, data, opts), L.walker(which, you, lineup, b, a.key, gen, data, opts)];
      var sa = L.score(which, you, L.seated(lineup, a), gen, data, opts), sb = L.score(which, you, L.seated(lineup, b), gen, data, opts);
      var at = 0, chunk = which === 'bear' ? 400 : CHUNK;
      (function step() {
        if (mine !== ticket) return;
        for (var i = 0; i < chunk && at < 2; i++) if (!walks[at].next()) at += 1;
        if (at < 2) { put('status', fill('working', { n: api.fmt(Math.round((at + walks[at].progress()) * 50)) })); setTimeout(step, 0); return; }
        put('status', '');
        put('verdict', verdict(which, a, b, sa, sb));
        put('team', teamLine(lineup, a.type, you));
        grid('b', b, a, walks[0].result());
        grid('a', a, b, walks[1].result());
        result.hidden = false;
      })();
    }

    context.targets('controls').forEach(function (node) { node.disabled = false; });
    restore();
    context.listen(document, 'ks:server-age-change', function () {
      var gen = window.KS_SERVER_AGE && window.KS_SERVER_AGE.getGeneration();
      if (gen) context.targets('gen')[0].value = String(stockGen(gen));
      run();
    });
    if (store) context.cleanup(store.subscribe(function () { run(); }));
    run();
    return {
      refresh: run,
      actions: {
        run: { events: ['change'], run: run },
        pick: { events: ['change'], run: function (node) { setHero(node.dataset.side, node.value); run(); } }
      }
    };
  });
})();
