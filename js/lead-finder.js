/* The Heroes page's lead finder: your owned heroes ranked as a Bear, rally or
   garrison lead. LeadEngine does the maths (js/lead-engine.js); this file reads
   the roster, Bonus Overview and pets from the save, keeps joiners and city
   buffs in this browser, and paints the ranking. */
(function () {
  'use strict';
  var EN = {
    noHeroes: 'Mark the heroes you own, with their stars, in the roster above.',
    ready: 'Ranked from your {n} heroes that have stars.',
    working: 'Fighting {done} of {total} lineups…',
    best: 'best', no: 'No.', ofBest: '{n}% of your best', mix: 'Ideal mix {inf} / {cav} / {arc}',
    wins: 'Wins against {n} of {total}', kept: '{n}% of your troops left',
    'bestTitle.bear': 'Your best Bear lead', 'bestTitle.rally': 'Your best rally lead', 'bestTitle.garrison': 'Your best garrison lead',
    ahead: '{n}% more Bear damage than your next lineup', tie: 'Level with your next lineup', only: 'Your only lineup',
    beats: 'Beats {n} of {total} opponents', mixTitle: 'Send this troop mix',
    mixNote: 'The split that gets the most damage out of these three heroes and your stats.',
    damageTitle: 'Estimated Bear damage', damageNote: '{n} = 1/15 of a {cap} rally{est}{valora}. One hit can land about 20% either side.', valora: ', Valora +{n}%', estimated: ' (estimated: 15 × joiner cap)',
    troops: '{n} troops',
    railTitle: 'Against each opponent', railNote: 'Win chance over repeated fights, and how much of your army is still standing.', win: '{n}%', empty: 'empty seat',
    foesNote: 'Generation {n} accounts, {total} troops a side.',
    kit: 'At generation {gen}: {stars}★ heroes, widgets at {widget}, {pct}% Bonus Overview, TG{tg}, {gear} hero gear, level {joiners} joiners, pets at {pets}, {city}.',
    'gear.epic': 'epic {n}', 'gear.mythic': 'mythic {n}', 'gear.red': 'red {n}',
    'city.0': 'no city buffs', 'city.ad': 'attack and defence city buffs at I', 'city.10': 'every city buff at I', 'city.20': 'every city buff at II',
    saved: 'Saved', saveFailed: 'Could not save',
    joinersFor: 'Joiners for the {job}', noPets: 'No pets in your save yet. Add them on the Pets page.', petsOff: 'Pets are left out.',
    pet: '{name} {level}: {stat}{pct}%', 'petStat.attack': 'attack +', 'petStat.defense': 'defence +', 'petStat.lethality': 'lethality +', 'petStat.health': 'health +',
    'petStat.enemyLethality': 'enemy lethality −', 'petStat.enemyHealth': 'enemy health −',
    'input.heroes': 'Heroes', 'input.overview': 'Bonus Overview', 'input.gear': 'Hero gear', 'input.town': 'Town Centre',
    'input.valora': 'Valora', 'input.troops': 'Troop tier', 'input.rally': 'Rally capacity', 'input.pets': 'Pets', est: 'Estimate', partOf: '{what}: {types}'
  };
  var PREFS = 'ks.lead-finder.v1';
  var STATS = ['attack', 'lethality', 'defense', 'health'], TYPES = ['inf', 'cav', 'arc'], TOP = 5, CHUNK = 4;

  window.Interactions.register('lead-finder', function (context) {
    var api = context.api, L = window.LeadEngine, I = window.LeadInputs, data = window.LeadData, store = null, job = 'bear', ticket = 0, saveTimer = null, inputs = null;
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
    // The Bear rally's capacity: yours as typed, else 15 × the joiner cap saved on the Bear Hunt
    // page (85k unless changed), since an alliance sets that cap so a full rally holds 15 marches.
    function rallyCap() {
      if (prefs.rallyCap > 0) return { cap: prefs.rallyCap, estimated: false };
      var join = 85000;
      try { var bh = JSON.parse(localStorage.getItem('bh:bear-allocator:v1') || 'null'); if (bh && Number(bh['join-cap']) > 0) join = Number(bh['join-cap']); } catch (cause) { /* the usual cap */ }
      return { cap: join * 15, estimated: true };
    }
    // Valora's Hunter Instinct talent from the Masters save: it adds to your own Damage Points.
    function valoraOf() { try { return L.valoraPoints(store ? store.masters().roster.valora : null); } catch (cause) { return 0; } }
    function cityOf() { var out = {}; Object.keys(prefs.city || {}).forEach(function (k) { out[k] = Number(prefs.city[k]) || 0; }); return out; }
    // Hero gear saved on the Hero Gear page, by troop type; nothing saved adds nothing.
    function gearOf() {
      try { return L.gearLayer(store ? store.snapshot().heroGear.pieces : {}); } catch (cause) { return L.gearLayer({}); }
    }
    // The Town Centre's Truegold level from the Buildings page: a bonus every march gets that the Bonus Overview leaves out.
    function townOf() {
      try { return L.townLayer(store ? store.buildings().levels['town-center'] : null); } catch (cause) { return L.townLayer(null); }
    }
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
      context.targets('rallyCap').forEach(function (input) {
        input.placeholder = api.fmt(rallyCap().cap);
        if (input !== document.activeElement) input.value = prefs.rallyCap ? String(prefs.rallyCap) : '';
      });
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
      var cap = context.targets('rallyCap')[0];
      if (cap) { if (cap.value !== '' && cap.validity.valid && Number(cap.value) > 0) prefs.rallyCap = Number(cap.value); else delete prefs.rallyCap; }
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
    // The Squads' row adds to every troop type; a type not typed in full takes the
    // generation's typical total instead.
    function overview(gen) {
      var rows = typed(), typical = data.megafauna.overview[String(gen)], out = {}, missing = [];
      function whole(row) { return row && STATS.every(function (k) { return row[k] !== null && row[k] !== undefined; }); }
      var squads = whole(rows.squads) ? rows.squads : null;
      TYPES.forEach(function (type) {
        var row = rows[type];
        if (whole(row)) { out[type] = {}; STATS.forEach(function (k) { out[type][k] = row[k] + (squads ? squads[k] : 0); }); }
        else { missing.push(type); out[type] = { attack: typical, lethality: typical, defense: typical, health: typical }; }
      });
      return { rows: out, missing: missing, typical: typical, noSquads: !squads && missing.length < 3 };
    }

    function load() {
      var saved = combat().overview || {};
      context.targets('stat').forEach(function (input) {
        if (input === document.activeElement) return;
        // A row not saved yet keeps what is typed (or read from a screenshot) so far.
        var at = input.dataset.stat.split('.'), row = saved[at[0]];
        if (row && row[at[1]] !== undefined) input.value = row[at[1]];
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
      ['squads'].concat(TYPES).forEach(function (type) { var row = rows[type] || {}; if (STATS.every(function (k) { return row[k] !== null && row[k] !== undefined; })) whole[type] = row; });
      if (!Object.keys(whole).length) return;
      var state = 'saved';
      try { store.setCombat({ overview: whole }, 'manual'); put('saved', t('saved')); }
      catch (cause) { state = 'failed'; put('saved', t('saveFailed')); }
      context.targets('saved').forEach(function (node) { node.dataset.state = state; });
    }

    // The table shows what the ranking assumes: a troop type it fills with the
    // generation's typical stats carries them as ghost values in its blank boxes,
    // and a row it still needs (a part-typed type, or the Squads' row once any
    // type is in) is marked unknown.
    function paintOverview(ov) {
      var rows = typed();
      context.targets('stat').forEach(function (input) {
        var type = input.dataset.stat.split('.')[0], assumed = ov.missing.indexOf(type) !== -1;
        input.classList.toggle('ghost', assumed);
        input.placeholder = assumed ? api.fmt(ov.typical) : '?';
      });
      context.root.querySelectorAll('.lead-stats-table tbody tr').forEach(function (tr) {
        var input = tr.querySelector('[data-stat]'), type = input && input.dataset.stat.split('.')[0], row = rows[type] || {};
        var some = STATS.some(function (k) { return row[k] !== null && row[k] !== undefined; });
        var unknown = type === 'squads' ? ov.noSquads : ov.missing.indexOf(type) !== -1 && some;
        if (unknown) tr.dataset.unknown = ''; else delete tr.dataset.unknown;
      });
    }
    // What the ranking is worked out from (js/lead-inputs.js): a chip for each
    // input, solid when it's in, ◇ when a typical value stands in, dashed when missing.
    function inputLabel(id) { return t('input.' + id); }
    function assessInputs() {
      var facts = I.gather(store, { overview: typed(), usePets: prefs.usePets !== false, rallyTyped: prefs.rallyCap > 0, tierPicked: tierPicked });
      inputs = I.assess(job, facts, { townKnown: L.TOWN_TG });
      context.targets('inputs').forEach(function (list) { I.paint(list, inputs, { self: 'heroes', label: inputLabel }); });
      return inputs;
    }
    function names(ids) { return ids.map(inputLabel).join(' · '); }
    function estMark(id) {
      var box = el('details', 'src'), summary = el('summary');
      box.id = id; box.dataset.src = 'est';
      summary.setAttribute('aria-label', t('est'));
      box.append(summary, el('span', 'motif-names', names(inputs.estimated)));
      return box;
    }
    // A result short of a core input keeps a dashed frame; what it stands in
    // for is named under its ◇, and what it leaves out follows as ? marks.
    function paintConfidence(best) {
      if (inputs.provisional) best.dataset.provisional = ''; else delete best.dataset.provisional;
      context.targets('estMark').forEach(function (node) { node.hidden = !inputs.estimated.length; if (node.hidden) node.open = false; });
      put('estNames', names(inputs.estimated));
      context.targets('unknowns').forEach(function (list) {
        list.replaceChildren.apply(list, inputs.open.map(function (id) {
          // Gear saved for some troop types names the ones still missing.
          var item = inputs.items.filter(function (i) { return i.id === id; })[0], some = item.missing && item.missing.length && item.missing.length < TYPES.length;
          return el('li', '', some ? fill('partOf', { what: inputLabel(id), types: item.missing.map(function (type) { return api.tr('sim.calc.' + type, type); }).join(', ') }) : inputLabel(id));
        }));
        list.hidden = !inputs.open.length;
      });
    }

    // Each tier's loadout at your generation, under its summary.
    function cityKey(c) { return !c.attack ? 'city.0' : !c.lethality ? 'city.ad' : c.attack >= 20 ? 'city.20' : 'city.10'; }
    function paintKits(gen) {
      data.megafauna.foes.forEach(function (foe) {
        var kit = L.loadout(foe, gen, data), at = String(Math.max(1, Math.min(gen | 0, data.megafauna.generations.length)));
        var stars = Math.floor(kit.stars / 6) + (kit.stars % 6 ? ' ' + (kit.stars % 6) + '/6' : '');
        document.querySelectorAll('[data-foe-kit="' + foe.id + '"]').forEach(function (node) {
          node.textContent = fill('kit', {
            gen: api.fmt(+at), stars: stars, widget: api.fmt(kit.widget), pct: api.fmt(Math.round(data.megafauna.overview[at] * kit.overview)),
            tg: api.fmt(kit.tg), gear: fill('gear.' + kit.gear.quality, { n: api.fmt(kit.gear.level) }), joiners: api.fmt(kit.joinerLevel),
            pets: api.fmt(kit.petLevel), city: t(cityKey(kit.city))
          });
        });
      });
    }
    function foeName(id) { var foe = data.megafauna.foes.filter(function (f) { return f.id === id; })[0]; return foe ? foe.name : id; }
    function heroName(copy) { return copy ? data.heroes[copy.key].name : t('empty'); }
    function stars(copy) { var s = Math.floor(copy.stars / 6), tier = copy.stars % 6; return api.fmt(s) + '★' + (tier ? ' ' + api.fmt(tier) + '/6' : '') + (copy.widget ? ' · W' + api.fmt(copy.widget) : ''); }
    var SVG = 'http://www.w3.org/2000/svg';
    // The spread of simulated hunts: 24 bins from the 1st to the 99th percentile, the 80% band lit.
    function histogram(sorted, lo, hi) {
      var E = window.BattleEngine, a = E.quantile(sorted, 0.01), b = E.quantile(sorted, 0.99), bins = 24, width = (b - a) / bins || 1, counts = [];
      for (var i = 0; i < bins; i++) counts.push(0);
      sorted.forEach(function (x) { if (x >= a && x <= b) counts[Math.min(bins - 1, Math.floor((x - a) / width))]++; });
      var top = Math.max.apply(null, counts) || 1, box = el('div', 'lead-hist');
      box.setAttribute('role', 'img');
      box.setAttribute('aria-label', fill('damageBand', { lo: api.compact(lo), hi: api.compact(hi) }));
      counts.forEach(function (c, i) {
        var from = a + i * width, to = from + width, bar = el('span', 'lead-hist-bar');
        bar.style.setProperty('--h', String(c / top));
        if (to > lo && from < hi) bar.dataset.band = '';
        bar.title = fill('damageBin', { n: api.fmt(Math.round(c / sorted.length * 1000) / 10), lo: api.compact(from), hi: api.compact(to) });
        box.appendChild(bar);
      });
      return box;
    }
    function mark(symbol, className) {
      var svg = document.createElementNS(SVG, 'svg'), use = document.createElementNS(SVG, 'use');
      if (className) svg.setAttribute('class', className);
      svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
      use.setAttribute('href', '#' + symbol); svg.appendChild(use);
      return svg;
    }
    // The roster's own portrait: troop mark top left, widget top right, five stars
    // with the tier as six notches along the foot.
    function portrait(copy, type) {
      var frame = el('span', 'directory-portrait lead-portrait');
      if (copy) {
        var img = el('img'); img.src = '../img/heroes/' + copy.key + '.webp'; img.alt = ''; img.width = 70; img.height = 70; img.loading = 'lazy'; img.decoding = 'async';
        frame.appendChild(img);
      } else frame.appendChild(el('span', 'lead-seat'));
      frame.appendChild(mark('troop-' + type, 'hero-troop-mark'));
      if (copy && copy.widget) {
        var widget = el('span', 'hero-portrait-widget'); widget.setAttribute('aria-hidden', 'true');
        widget.append(mark('hero-widget-mark'), el('b', '', api.fmt(copy.widget)));
        frame.appendChild(widget);
      }
      if (copy) {
        var foot = el('span', 'hero-portrait-stars'), row = el('span', 'hero-star-row'), notches = el('span', 'hero-star-tier'), s = Math.floor(copy.stars / 6), tier = copy.stars % 6;
        foot.setAttribute('aria-hidden', 'true');
        for (var i = 0; i < 5; i++) { var star = el('i', '', '★'); if (i < s) star.dataset.on = ''; row.appendChild(star); }
        for (var n = 0; n < 6; n++) { var step = el('i'); if (n < tier) step.dataset.on = ''; notches.appendChild(step); }
        foot.append(row, notches); frame.appendChild(foot);
      }
      return frame;
    }
    // A lineup as three roster tiles, infantry → cavalry → archers; an empty seat stays dashed.
    function lineupNode(lineup, className) {
      var names = el('span', 'lead-heroes' + (className ? ' ' + className : ''));
      lineup.forEach(function (copy, i) {
        var part = el('span', 'lead-hero' + (copy ? '' : ' lead-hero-empty'));
        part.dataset.troop = TYPES[i];
        part.appendChild(portrait(copy, TYPES[i]));
        var label = el('span', 'lead-hero-name');
        label.append(el('b', '', heroName(copy)), el('small', '', copy ? stars(copy) : api.tr('sim.calc.' + TYPES[i], TYPES[i])));
        part.appendChild(label);
        names.appendChild(part);
      });
      return names;
    }
    function sign(x) { var r = Math.round(x * 10) / 10; return (r < 0 ? '−' : '+') + api.fmt(Math.abs(r)) + '%'; }
    function rail(r, big) {
      var node = el('span', 'lead-rail' + (big ? ' lead-rail-big' : ''));
      r.foes.forEach(function (f) {
        var cell = el('span', 'lead-cell');
        cell.dataset.win = f.win >= 0.5 ? 'yes' : 'no';
        cell.style.setProperty('--win', String(f.win));
        cell.append(el('span', '', api.tr('leads.foe.' + f.id, foeName(f.id))), el('b', '', fill('win', { n: pct(f.win) })));
        if (big) cell.appendChild(el('small', '', fill('kept', { n: pct(f.left) })));
        node.appendChild(cell);
      });
      return node;
    }
    function wonOf(r) { return r.foes.filter(function (f) { return f.win >= 0.5; }).length; }

    // The best lineup gets the dossier treatment; the next four follow as a ranked list.
    function paintBest(r, next, you) {
      var best = context.targets('best')[0];
      best.hidden = false;
      best.dataset.job = job;
      paintConfidence(best);
      put('bestTitle', t('bestTitle.' + job));
      if (job === 'bear') {
        var lead = next ? r.score / next.score - 1 : 0;
        put('verdict', !next ? t('only') : lead < 0.005 ? t('tie') : fill('ahead', { n: api.fmt(Math.round(lead * 1000) / 10) }));
      } else put('verdict', fill('beats', { n: api.fmt(wonOf(r)), total: api.fmt(r.foes.length) }));
      context.targets('trio')[0].replaceChildren(lineupNode(r.lineup, 'lead-heroes-big'));
      var answer = context.targets('answer')[0];
      answer.replaceChildren();
      if (job === 'bear') {
        answer.appendChild(el('p', 'lead-kicker', t('mixTitle')));
        var bar = el('span', 'lead-mix'), legend = el('span', 'lead-mix-legend');
        TYPES.forEach(function (type, i) {
          var part = el('span', 'lead-mix-part'); part.dataset.troop = type; part.style.setProperty('--part', String(r.mix[i]));
          bar.appendChild(part);
          var key = el('span', 'lead-mix-key'); key.dataset.troop = type;
          key.append(mark('troop-' + type), el('b', '', api.fmt(Math.round(r.mix[i] * 100)) + '%'), el('span', '', api.tr('sim.calc.' + type, type)));
          legend.appendChild(key);
        });
        answer.append(bar, legend, el('p', 'lead-answer-note', t('mixNote')));
        var rc = rallyCap(), march = Math.floor(rc.cap / 15), counts = TYPES.map(function (type, i) { return Math.round(march * r.mix[i]); });
        var damage = el('div', 'lead-damage');
        var sim = L.hunt(you, r.lineup, counts, data, { hunts: 2000, pointsPct: valoraOf() });
        var lo = window.BattleEngine.quantile(sim.totals, 0.1), hi = window.BattleEngine.quantile(sim.totals, 0.9);
        // Anything left out only adds damage, so the number stays open until it's in.
        var value = el('output', 'lead-damage-value', api.compact(sim.mean)), headline = el('div', 'lead-damage-head');
        if (inputs.open.length) value.dataset.open = '';
        headline.appendChild(value);
        if (inputs.estimated.length) headline.appendChild(estMark('lead-damage-est'));
        damage.append(el('p', 'lead-kicker', t('damageTitle')), headline, histogram(sim.totals, lo, hi), el('p', 'lead-damage-band', fill('damageBand', { lo: api.compact(lo), hi: api.compact(hi) })));
        var split = el('span', 'lead-damage-split');
        TYPES.forEach(function (type, i) { var part = el('span'); part.dataset.troop = type; part.append(mark('troop-' + type), el('span', '', api.fmt(counts[i]))); split.appendChild(part); });
        damage.append(split, el('p', 'lead-answer-note', fill('damageNote', { n: fill('troops', { n: api.fmt(march) }), cap: api.fmt(rc.cap), est: rc.estimated ? t('estimated') : '', valora: valoraOf() ? fill('valora', { n: api.fmt(valoraOf()) }) : '' })));
        answer.appendChild(damage);
      } else {
        answer.appendChild(el('p', 'lead-kicker', t('railTitle')));
        answer.append(rail(r, true), el('p', 'lead-answer-note', t('railNote')));
      }
      var p = L.reportPanel(L.layered(L.panel(you.overview, r.lineup, data, you.gear, you.town), { city: you.city, pet: you.pets }, { city: L.blank(), pet: L.blank() }), r.lineup, job === 'garrison' ? 'defender' : 'rally', data);
      var body = context.targets('panel')[0];
      body.replaceChildren();
      TYPES.forEach(function (type, i) {
        var tr = el('tr'), th = el('th', '', api.tr('sim.calc.' + type, type)); th.scope = 'row';
        if (inputs.typeShort(type)) tr.dataset.unknown = '';
        tr.appendChild(th);
        ['atk', 'let', 'def', 'hea'].forEach(function (field) { tr.appendChild(el('td', '', sign(p[field][i]))); });
        body.appendChild(tr);
      });
    }

    function paint(results, gen, you) {
      var list = context.targets('list')[0];
      list.replaceChildren();
      var top = results[0];
      paintBest(top, results[1], you);
      context.targets('nextTitle').forEach(function (node) { node.hidden = results.length < 2; });
      results.slice(1, TOP).forEach(function (r, at) {
        var li = el('li', 'lead-row');
        var rank = el('span', 'lead-rank'); rank.append(el('small', '', t('no')), el('b', '', api.fmt(at + 2)));
        li.appendChild(rank);
        li.appendChild(lineupNode(r.lineup));
        var detail = el('span', 'lead-detail'), score = el('span', 'lead-score');
        if (job === 'bear') {
          var share = r.score / top.score, bar = el('span', 'lead-bar');
          bar.style.setProperty('--share', String(share));
          score.append(el('b', '', fill('ofBest', { n: pct(share) })), el('small', '', fill('mix', { inf: pct(r.mix[0]), cav: pct(r.mix[1]), arc: pct(r.mix[2]) })));
          detail.append(score, bar);
        } else {
          score.appendChild(el('b', '', fill('wins', { n: api.fmt(wonOf(r)), total: api.fmt(r.foes.length) })));
          detail.append(score, rail(r));
        }
        li.appendChild(detail);
        list.appendChild(li);
      });
      context.targets('foes').forEach(function (node) { node.hidden = job === 'bear' || !results.length; });
      put('foesNote', fill('foesNote', { n: api.fmt(gen), total: api.fmt(data.megafauna.total) }));
      paintKits(gen);
    }
    function clear() {
      context.targets('list')[0].replaceChildren();
      context.targets('best').concat(context.targets('nextTitle'), context.targets('foes')).forEach(function (n) { n.hidden = true; });
    }

    function run() {
      var mine = ticket += 1, owned = roster(), gen = generation(owned);
      job = (context.targets('job').filter(function (n) { return n.checked; })[0] || {}).value || 'bear';
      troopsDefault(gen);
      var ov = overview(gen), by = L.candidates(owned, data), list = L.lineups(by);
      assessInputs();
      if (!list.length) { paintExtras(gen); clear(); put('status', t('noHeroes')); return; }
      paintOverview(ov);
      var ready = fill('ready', { n: api.fmt(Object.keys(owned).filter(function (k) { return L.copyOf(k, owned[k], data); }).length) });
      paintExtras(gen);
      var you = { overview: ov.rows, troops: troops(), joiners: joinersOf(gen), city: L.cityLayer(cityOf()), pets: petsOf(), gear: gearOf(), town: townOf() }, opts = { gen: gen };
      if (job === 'bear') {
        var scored = list.map(function (lineup) { var r = L.bear(you, lineup, data); r.lineup = lineup; return r; });
        scored.sort(function (a, b) { return b.score - a.score; });
        put('status', ready);
        paint(scored, gen, you);
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
        put('status', ready);
        paint(done, gen, you);
      })();
    }

    // Bonus Overview screenshots read by the import dock (js/import-adapters/bonus-overview.js)
    // arrive as 'ov-{row}-{stat}'; `before` gets what each box held, so the dock can undo.
    context.listen(context.root, 'screen-import:sheet', function (event) {
      var values = event.detail.values, before = event.detail.before, boxes = {};
      context.targets('stat').forEach(function (input) { boxes['ov-' + input.dataset.stat.replace('.', '-')] = input; });
      Object.keys(values).forEach(function (key) {
        var input = boxes[key];
        if (!input) return;
        before[key] = input.value === '' ? null : Number(input.value);
        input.value = values[key] === null || values[key] === undefined ? '' : String(values[key]);
      });
      var details = document.getElementById('bonus-overview'); if (details) details.open = true;
      save(); run();
    });
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
