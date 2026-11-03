/* The Heroes page's lead finder: your owned heroes ranked as a Bear, rally or
   garrison lead. LeadEngine does the maths (js/lead-engine.js); this file reads
   the roster, Bonus Overview and pets from the save, keeps joiners and city
   buffs in this browser, and paints the ranking. */
(function () {
  'use strict';
  var EN = {
    noHeroes: 'Mark the heroes you own, with their stars, in the roster above.',
    noOverview: 'Using a typical generation {n} Bonus Overview ({pct}% everywhere) until you enter yours.',
    partial: 'Your Bonus Overview is missing {types}; those use a typical {pct}%.',
    ready: 'Ranked from your {n} heroes that have stars.',
    working: 'Fighting {done} of {total} lineups…',
    best: 'best', ofBest: '{n}% of your best', mix: 'Ideal mix {inf} / {cav} / {arc}',
    wins: 'Wins against {n} of {total}', win: '{n}%', empty: 'empty seat',
    foesNote: 'Generation {n} accounts, both sides at {total} troops. Win chance per opponent:',
    saved: 'Saved', saveFailed: 'Could not save',
    joinersFor: 'Joiners for the {job}', noPets: 'No pets in your save yet. Add them on the Pets page.', petsOff: 'Pets are left out.',
    pet: '{name} {level}: {stat}{pct}%', 'petStat.attack': 'attack +', 'petStat.defense': 'defence +', 'petStat.lethality': 'lethality +', 'petStat.health': 'health +',
    'petStat.enemyLethality': 'enemy lethality −', 'petStat.enemyHealth': 'enemy health −'
  };
  var PREFS = 'ks.lead-finder.v1';
  var STATS = ['attack', 'lethality', 'defense', 'health'], TYPES = ['inf', 'cav', 'arc'], TOP = 5, CHUNK = 4;

  window.Interactions.register('lead-finder', function (context) {
    var api = context.api, L = window.LeadEngine, data = window.LeadData, store = null, job = 'bear', ticket = 0, saveTimer = null;
    try { store = context.ledger; store.snapshot(); } catch (cause) { store = null; }
    function t(key) { return api.tr('leads.' + key, EN[key]); }
    function fill(key, values) { return api.fill(t(key), values); }
    function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
    function put(key, text) { context.targets(key).forEach(function (node) { node.textContent = text; }); }
    function pct(x) { return api.fmt(Math.round(x * 100)); }
    context.targets('controls').forEach(function (node) { node.disabled = false; });

    // Joiners, city buffs and the pets switch: choices, not game facts, so
    // they stay in this browser. Storage can be blocked; the page still works.
    function readPrefs() { try { var v = JSON.parse(localStorage.getItem(PREFS) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (cause) { return {}; } }
    function writePrefs(v) { try { localStorage.setItem(PREFS, JSON.stringify(v)); } catch (cause) { /* kept for this visit */ } }
    var prefs = readPrefs();
    if (!prefs.joiners || typeof prefs.joiners !== 'object') prefs.joiners = {};
    function usualJoiners(gen) { return (data.megafauna.joiners[job][String(gen)] || []).map(function (key) { return { key: key, level: 5 }; }); }
    function joinersOf(gen) {
      var saved = prefs.joiners[job];
      return Array.isArray(saved) ? saved.filter(function (j) { return j && data.heroes[j.key]; }).map(function (j) { return { key: j.key, level: Math.max(1, Math.min(5, j.level | 0)) }; }) : usualJoiners(gen);
    }
    function cityOf() { var out = {}; Object.keys(prefs.city || {}).forEach(function (k) { out[k] = Number(prefs.city[k]) || 0; }); return out; }
    function petsOf() {
      if (prefs.usePets === false) return L.blank();
      var levels = {};
      try { var roster = store ? store.pets().roster : {}; Object.keys(roster).forEach(function (id) { levels[id] = roster[id].level; }); } catch (cause) { /* no pets */ }
      return L.petLayer(levels, data);
    }
    function paintExtras(gen) {
      var list = joinersOf(gen), jobLabel = api.tr('leads.job.' + job, job);
      put('joinersTitle', api.fill(t('joinersFor'), { job: jobLabel }));
      context.targets('joiner').forEach(function (select) {
        var slot = list[Number(select.dataset.joiner)];
        if (select.dataset.field === 'key') select.value = slot ? slot.key : '';
        else select.value = String(slot ? slot.level : 5);
      });
      var city = cityOf();
      context.targets('city').forEach(function (select) { select.value = String(city[select.dataset.city] || 0); });
      context.targets('usePets').forEach(function (box) { box.checked = prefs.usePets !== false; });
      var levels = {};
      try { var roster = store ? store.pets().roster : {}; Object.keys(roster).forEach(function (id) { levels[id] = roster[id].level; }); } catch (cause) { /* no pets */ }
      var lines = data.pets.filter(function (pet) { return L.petLevelPct(pet, levels[pet.id]) > 0; }).map(function (pet) {
        var key = pet.side === 'enemy' ? 'enemy' + pet.stat.charAt(0).toUpperCase() + pet.stat.slice(1) : pet.stat;
        return api.fill(t('pet'), { name: api.tr('pets.name.' + pet.id, pet.name), level: api.fmt(levels[pet.id]), stat: t('petStat.' + key), pct: api.fmt(L.petLevelPct(pet, levels[pet.id])) });
      });
      put('pets', prefs.usePets === false ? t('petsOff') : lines.length ? lines.join(' · ') : t('noPets'));
    }
    function readExtras() {
      var list = [0, 1, 2, 3].map(function () { return { key: '', level: 5 }; });
      context.targets('joiner').forEach(function (select) { var slot = list[Number(select.dataset.joiner)]; if (select.dataset.field === 'key') slot.key = select.value; else slot.level = Number(select.value) || 5; });
      prefs.joiners[job] = list.filter(function (j) { return j.key; });
      prefs.city = {};
      context.targets('city').forEach(function (select) { if (Number(select.value)) prefs.city[select.dataset.city] = Number(select.value); });
      prefs.usePets = context.targets('usePets').every(function (box) { return box.checked; });
      writePrefs(prefs);
    }

    function roster() { try { return store ? store.heroes().roster : {}; } catch (cause) { return {}; } }
    function combat() { try { return store ? store.combat() : { overview: {}, troops: [] }; } catch (cause) { return { overview: {}, troops: [] }; } }
    function generation(owned) {
      // The stock opponents stop at the last generation they know.
      var last = data.megafauna.generations.length, gen = window.KS_SERVER_AGE && window.KS_SERVER_AGE.getGeneration();
      if (gen) return Math.max(1, Math.min(last, gen | 0));
      var top = 0;
      Object.keys(owned).forEach(function (key) { if (data.heroes[key]) top = Math.max(top, data.heroes[key].generation); });
      return top || 4;
    }

    // The typed rows; a type with any blank uses the generation's typical stats.
    function typed() {
      var rows = {};
      context.targets('stat').forEach(function (input) {
        var at = input.dataset.stat.split('.');
        if (!rows[at[0]]) rows[at[0]] = {};
        rows[at[0]][at[1]] = input.value === '' || !input.validity.valid ? null : Number(input.value);
      });
      return rows;
    }
    function overview(gen) {
      var rows = typed(), typical = data.megafauna.overview[String(gen)], out = {}, missing = [];
      TYPES.forEach(function (type) {
        var row = rows[type] || {}, whole = STATS.every(function (k) { return row[k] !== null && row[k] !== undefined; });
        if (whole) out[type] = row;
        else { missing.push(type); out[type] = { attack: typical, lethality: typical, defense: typical, health: typical }; }
      });
      return { rows: out, missing: missing, typical: typical };
    }

    function load() {
      var saved = combat().overview || {};
      context.targets('stat').forEach(function (input) {
        if (input === document.activeElement) return;
        var at = input.dataset.stat.split('.'), row = saved[at[0]];
        input.value = row && row[at[1]] !== undefined ? row[at[1]] : '';
      });
    }
    // Troop tier and Truegold: the best you have saved, else the generation's usual.
    var tierPicked = false;
    function troopsDefault(gen) {
      if (tierPicked) return;
      var best = null;
      (combat().troops || []).forEach(function (row) { if (!best || row.tier > best.tier || (row.tier === best.tier && row.tg > best.tg)) best = row; });
      var stock = data.megafauna.troops[String(gen)];
      context.targets('tier')[0].value = String(best ? best.tier : stock.tier);
      context.targets('tg')[0].value = String(best ? best.tg : stock.tg);
    }
    function troops() {
      var tier = Number(context.targets('tier')[0].value) || 10, tg = Number(context.targets('tg')[0].value) || 0;
      return { tier: [tier, tier, tier], tg: [tg, tg, tg] };
    }

    function save() {
      if (!store) return;
      var rows = typed(), whole = {};
      TYPES.forEach(function (type) { var row = rows[type] || {}; if (STATS.every(function (k) { return row[k] !== null && row[k] !== undefined; })) whole[type] = row; });
      if (!Object.keys(whole).length) return;
      try { store.setCombat({ overview: whole }, 'manual'); put('saved', t('saved')); }
      catch (cause) { put('saved', t('saveFailed')); }
    }

    function foeName(id) { var foe = data.megafauna.foes.filter(function (f) { return f.id === id; })[0]; return foe ? foe.name : id; }
    function heroName(copy) { return copy ? data.heroes[copy.key].name : t('empty'); }
    function stars(copy) { var s = Math.floor(copy.stars / 6), tier = copy.stars % 6; return api.fmt(s) + '★' + (tier ? ' ' + api.fmt(tier) + '/6' : '') + (copy.widget ? ' · W' + api.fmt(copy.widget) : ''); }
    function lineupNode(lineup) {
      var names = el('span', 'lead-heroes');
      lineup.forEach(function (copy, i) {
        var part = el('span', 'lead-hero' + (copy ? '' : ' lead-hero-empty'));
        part.dataset.troop = TYPES[i];
        part.appendChild(el('b', '', heroName(copy)));
        if (copy) part.appendChild(el('small', '', stars(copy)));
        names.appendChild(part);
      });
      return names;
    }

    function paint(results, gen) {
      var list = context.targets('list')[0];
      list.replaceChildren();
      var top = results[0];
      results.slice(0, TOP).forEach(function (r, at) {
        var li = el('li', 'lead-row');
        li.appendChild(lineupNode(r.lineup));
        var detail = el('span', 'lead-detail');
        if (job === 'bear') {
          var share = r.score / top.score, bar = el('span', 'lead-bar');
          bar.style.setProperty('--share', String(share));
          detail.append(bar, el('b', '', at ? fill('ofBest', { n: pct(share) }) : t('best')), el('small', '', fill('mix', { inf: pct(r.mix[0]), cav: pct(r.mix[1]), arc: pct(r.mix[2]) })));
        } else {
          var won = r.foes.filter(function (f) { return f.win >= 0.5; }).length, chips = el('span', 'lead-chips');
          r.foes.forEach(function (f) {
            var chip = el('span', 'lead-chip', api.tr('leads.foe.' + f.id, foeName(f.id)) + ' ' + fill('win', { n: pct(f.win) }));
            chip.dataset.win = f.win >= 0.5 ? 'yes' : 'no';
            chips.appendChild(chip);
          });
          detail.append(el('b', '', fill('wins', { n: api.fmt(won), total: api.fmt(r.foes.length) })), chips);
        }
        li.appendChild(detail);
        list.appendChild(li);
      });
      context.targets('foes').forEach(function (node) { node.hidden = job === 'bear' || !results.length; });
      put('foesNote', fill('foesNote', { n: api.fmt(gen), total: api.fmt(data.megafauna.total) }));
    }

    function run() {
      var mine = ticket += 1, owned = roster(), gen = generation(owned);
      job = (context.targets('job').filter(function (n) { return n.checked; })[0] || {}).value || 'bear';
      troopsDefault(gen);
      var ov = overview(gen), by = L.candidates(owned, data), list = L.lineups(by);
      if (!list.length) { paintExtras(gen); context.targets('list')[0].replaceChildren(); context.targets('foes').forEach(function (n) { n.hidden = true; }); put('status', t('noHeroes')); return; }
      var note = ov.missing.length === 3 ? fill('noOverview', { n: api.fmt(gen), pct: api.fmt(ov.typical) })
        : ov.missing.length ? fill('partial', { types: ov.missing.map(function (type) { return api.tr('sim.calc.' + type, type); }).join(', '), pct: api.fmt(ov.typical) }) : '';
      var ready = fill('ready', { n: api.fmt(Object.keys(owned).filter(function (k) { return L.copyOf(k, owned[k], data); }).length) });
      paintExtras(gen);
      var you = { overview: ov.rows, troops: troops(), joiners: joinersOf(gen), city: L.cityLayer(cityOf()), pets: petsOf() }, opts = { gen: gen };
      if (job === 'bear') {
        var scored = list.map(function (lineup) { var r = L.bear(you, lineup, data); r.lineup = lineup; return r; });
        scored.sort(function (a, b) { return b.score - a.score; });
        put('status', (note ? note + ' ' : '') + ready);
        paint(scored, gen);
        return;
      }
      // A fight takes a few milliseconds per lineup, so they run a few at a time.
      var done = [], at = 0;
      (function step() {
        if (mine !== ticket) return;
        for (var i = 0; i < CHUNK && at < list.length; i++, at++) {
          var r = L.fight(you, list[at], job, gen, data, opts); r.lineup = list[at]; done.push(r);
        }
        if (at < list.length) { put('status', fill('working', { done: api.fmt(at), total: api.fmt(list.length) })); setTimeout(step, 0); return; }
        done.sort(function (a, b) { return b.score - a.score; });
        put('status', (note ? note + ' ' : '') + ready);
        paint(done, gen);
      })();
    }

    if (store) context.cleanup(store.subscribe(function () { load(); run(); }));
    context.listen(document, 'ks:server-age-change', run);
    load(); run();
    return {
      refresh: function () { load(); run(); },
      actions: {
        run: { events: ['change'], run: function (node) { if (node && node.matches && node.matches('select')) tierPicked = true; run(); } },
        extras: { events: ['change'], run: function () { readExtras(); run(); } },
        resetJoiners: { run: function () { delete prefs.joiners[job]; writePrefs(prefs); run(); } },
        edit: { events: ['input'], run: function () { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); run(); } }
      }
    };
  });
})();
