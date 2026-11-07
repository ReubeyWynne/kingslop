/* bear-hunt.js — Bear Hunt page interactions. */
(function () {
  'use strict';

  function dynamicKey(source) {
    var hash = 2166136261;
    for (var i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
    return 'bh.dynamic.' + (hash >>> 0).toString(36);
  }

  function t(source) {
    return window.I18N && window.I18N.tr ? window.I18N.tr(dynamicKey(source), source) : source;
  }

  function i18nAttr(source) {
    return 'data-i18n="' + dynamicKey(source) + '"';
  }

  function i18nText(source) {
    var safe = source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return '<span ' + i18nAttr(source) + '>' + safe + '</span>';
  }

  function refreshI18n(root) {
    if (window.I18N && window.I18N.refresh) window.I18N.refresh(root);
  }

  function numberValue(id, fallback) {
    var el = document.getElementById(id);
    if (!el) return fallback;
    var n = Number(el.value);
    return isFinite(n) ? n : fallback;
  }

  function formatNumber(n) {
    return Math.max(0, Math.round(n)).toLocaleString((window.I18N && window.I18N.locale) || 'en-GB');
  }

  /* The hunt: how many players turn up and the biggest rally's capacity.
     js/bear-hunt-plan.js works out the rest, and every sentence marked
     data-i18n-vars="hunt" carries the numbers (js/bind.js). */
  var HUNT_KEY = 'bh:hunt:v1';
  var DEFAULT_RALLY = 1360000;
  var huntGuest = /(?:^|[?&])guest(?:=|&|$)/.test(location.search);

  function huntPlan(players, rally) {
    return window.BH_HUNT_PLAN.plan(isFinite(players) ? players : 15, isFinite(rally) && rally > 0 ? rally : DEFAULT_RALLY);
  }

  function huntField(name) { return document.getElementById('hunt-' + name); }

  function readHunt() {
    var players = huntField('players'), rally = huntField('rally');
    return huntPlan(players ? parseFloat(players.value) : NaN, rally ? parseFloat(rally.value) : NaN);
  }

  (function restoreHunt() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(HUNT_KEY) || 'null'); } catch (ignored) { saved = null; }
    if (!saved || typeof saved !== 'object') return;
    ['players', 'rally'].forEach(function (name) {
      var field = huntField(name), value = saved[name];
      if (field && typeof value === 'string' && value !== '' && isFinite(Number(value))) field.value = value;
    });
  })();

  if (window.BH && window.BH.group && window.BH_HUNT_PLAN) {
    window.BH.group('hunt', {
      inputs: ['players', 'rally'],
      values: function (v, BH) {
        var p = huntPlan(v.players, v.rally), cap = p.cap;
        var hits = Math.round(p.hits * 100) / 100;
        var locale = (window.I18N && window.I18N.locale) || 'en-GB';
        return {
          players: BH.fmt(p.players), joiners: BH.fmt(p.joiners), fill: BH.fmt(p.fill), divisor: BH.fmt(p.divisor),
          joins: BH.fmt(p.joins), marches: BH.fmt(p.marches), marches2: BH.fmt(p.marches + 1),
          cap: BH.fmt(cap), hits: hits.toLocaleString(locale, { maximumFractionDigits: 2 }),
          first: BH.fmt(p.first), open: BH.fmt(p.players * p.joins),
          capInf: BH.fmt(cap * 0.05), capCav: BH.fmt(cap * 0.15), capArc: BH.fmt(cap * 0.8),
          totInf: BH.fmt(cap * 0.05 * p.joins), totCav: BH.fmt(cap * 0.15 * p.joins), totArc: BH.fmt(cap * 0.8 * p.joins)
        };
      }
    });
  }

  // What the numbers alone can't change: which lines apply, and which of the
  // rally's fourteen spaces anyone is left to fill.
  function paintHunt(plan) {
    window.BH_HUNT = plan;
    document.dispatchEvent(new CustomEvent('bh:hunt', { detail: plan }));
    Array.prototype.forEach.call(document.querySelectorAll('[data-hunt-when]'), function (node) {
      var when = node.getAttribute('data-hunt-when');
      node.hidden = when === 'small' ? plan.full : when === 'full' ? !plan.full : when === 'few' ? plan.joins >= window.BH_HUNT_PLAN.QUEUES : false;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.rally-slots span'), function (slot, i) {
      if (i < plan.joiners) slot.removeAttribute('data-off'); else slot.setAttribute('data-off', '');
    });
    // One bar for each join you send, as tall as the cap: smaller hunts send fewer, bigger joins.
    Array.prototype.forEach.call(document.querySelectorAll('.plan-joins'), function (row) {
      while (row.children.length < plan.joins) row.appendChild(document.createElement('i'));
      while (row.children.length > plan.joins) row.removeChild(row.lastChild);
      row.style.setProperty('--tall', String(Math.min(1, 8 / plan.divisor)));
    });
  }

  function wireHunt(allocator) {
    var fields = [huntField('players'), huntField('rally')];
    if (!fields[0] || !fields[1] || !window.BH_HUNT_PLAN) return;
    function save() {
      if (huntGuest) return;
      try { localStorage.setItem(HUNT_KEY, JSON.stringify({ players: fields[0].value, rally: fields[1].value })); } catch (ignored) { /* private mode */ }
    }
    fields.forEach(function (field) {
      field.addEventListener('input', function () {
        if (!field.validity.valid) return;
        var plan = readHunt();
        paintHunt(plan);
        save();
        if (allocator) allocator.follow(plan);
      });
    });
    // The usual rally as ghost ink, in the reader's own number format.
    function ghost() { fields[1].placeholder = window.BH && window.BH.fmt ? window.BH.fmt(DEFAULT_RALLY) : formatNumber(DEFAULT_RALLY); }
    ghost();
    document.addEventListener('i18n:change', ghost);
    var plan = readHunt();
    paintHunt(plan);
    if (allocator && !allocator.restored) allocator.follow(plan);
  }

  function wireAllocator() {
    var root = document.getElementById('march-builder');
    var button = document.getElementById('allocator-toggle');
    if (!root || !button || !window.BH_BEAR_ALLOCATOR) return null;
    var modes = Array.prototype.slice.call(document.querySelectorAll('input[name="march-mode"]'));
    var token = document.getElementById('own-token');
    var ownCap = document.getElementById('own-cap');
    var ratio = document.getElementById('own-ratio');
    var ratios = Array.prototype.slice.call(ratio.querySelectorAll('input'));
    var personalized = false;
    var result;
    /* The troops you enter are kept on this device, like the simulator's sheet (bh:sim:v1),
       so a reload or a later visit opens on your own marches. ?guest never writes. */
    var KEY = 'bh:bear-allocator:v1';
    var guest = /(?:^|[?&])guest(?:=|&|$)/.test(location.search);
    var fields = Array.prototype.slice.call(root.querySelectorAll('input[id]'));
    function leading() { return modes.some(function (input) { return input.checked && input.value === 'lead'; }); }

    function restore() {
      var saved = null;
      try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (ignored) { saved = null; }
      if (!saved || typeof saved !== 'object') return false;
      // Saves from before the switch kept a "fill my own rally first" box.
      var mode = saved.mode || (saved['own-priority'] ? 'lead' : 'join');
      modes.forEach(function (input) { input.checked = input.value === mode; });
      fields.forEach(function (field) {
        var value = saved[field.id];
        if (field.type === 'checkbox') { if (typeof value === 'boolean') field.checked = value; }
        else if (typeof value === 'string' && value !== '' && isFinite(Number(value))) field.value = value;
      });
      return true;
    }

    function save() {
      if (guest) return;
      var out = {};
      fields.forEach(function (field) { out[field.id] = field.type === 'checkbox' ? field.checked : field.value; });
      out.mode = leading() ? 'lead' : 'join';
      try { localStorage.setItem(KEY, JSON.stringify(out)); } catch (ignored) { /* private mode, full storage */ }
    }

    function label(key, fallback) {
      return window.I18N && window.I18N.tr ? window.I18N.tr(key, fallback) : fallback;
    }

    function format(n) {
      return window.BH && window.BH.fmt ? window.BH.fmt(n) : formatNumber(n);
    }

    function open(show) {
      root.hidden = !show;
      button.setAttribute('aria-expanded', show ? 'true' : 'false');
      if (show) document.getElementById('infantry-total').focus();
    }

    // Joining: your rally can go with one troop. Leading: your rally fills first, at its own ratio,
    // and the lead finder shows your best lead.
    function showRatio() {
      var lead = leading();
      Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (node) { node.hidden = node.getAttribute('data-mode') !== (lead ? 'lead' : 'join'); });
      token.disabled = lead;
      ownCap.disabled = token.checked && !lead;
      ratios.forEach(function (input) { input.disabled = !lead; input.setCustomValidity(''); });
    }

    function read() {
      return {
        infantry: numberValue('infantry-total', 0),
        cavalry: numberValue('cavalry-total', 0),
        archers: numberValue('archer-total', 0),
        queues: numberValue('join-queues', 6),
        joinCap: numberValue('join-cap', 85000),
        ownCap: token.checked && !leading() ? 1 : numberValue('own-cap', 130000),
        priority: leading(),
        ratio: { infantry: numberValue('own-infantry', 5), cavalry: numberValue('own-cavalry', 15), archers: numberValue('own-archers', 80) }
      };
    }

    function stack(node, march, maximum) {
      var bar = node.querySelector('.march-stack');
      bar.style.height = (100 * march.total / maximum) + '%';
      ['archers', 'cavalry', 'infantry'].forEach(function (type, index) {
        bar.children[index].style.height = (march.total ? 100 * march[type] / march.total : 0) + '%';
      });
      node.querySelector('.march-total').textContent = format(march.total);
    }

    function render() {
      var maximum = Math.max(result.own.total, result.join.total, 1);
      stack(document.getElementById('march-own'), result.own, maximum);
      var queues = document.getElementById('march-queues');
      queues.innerHTML = '';
      for (var i = 0; i < result.queues; i++) {
        var node = document.createElement('div');
        var number = document.createElement('b');
        number.textContent = format(i + 1);
        node.appendChild(number);
        var bar = document.createElement('div');
        bar.className = 'march-bar';
        var strips = document.createElement('div');
        strips.className = 'march-stack';
        for (var j = 0; j < 3; j++) strips.appendChild(document.createElement('span'));
        bar.appendChild(strips);
        node.appendChild(bar);
        var size = document.createElement('b');
        size.className = 'march-total';
        node.appendChild(size);
        stack(node, result.join, maximum);
        queues.appendChild(node);
      }
      var suffix = { infantry: 'inf', cavalry: 'cav', archers: 'arc' };
      Object.keys(suffix).forEach(function (type) {
        document.getElementById('own-' + suffix[type]).textContent = format(result.own[type]);
        document.getElementById('join-' + suffix[type]).textContent = format(result.join[type]);
      });
      document.getElementById('alloc-own').textContent = format(result.own.total);
      document.getElementById('alloc-join').textContent = format(result.join.total);
      document.getElementById('home-inf').textContent = format(result.home.infantry);
      document.getElementById('home-cav').textContent = format(result.home.cavalry);
      document.getElementById('alloc-home').textContent = format(result.home.archers);
      document.getElementById('home-total').textContent = format(result.home.infantry + result.home.cavalry + result.home.archers);
      var sample = document.getElementById('march-sample');
      if (personalized) ['data-example', 'data-i18n-key', 'data-i18n-attr'].forEach(function (name) { sample.removeAttribute(name); });
      var text = button.querySelector('[data-i18n]');
      var key = personalized ? 'bh.alloc.edit' : 'bh.alloc.open';
      text.setAttribute('data-i18n', key);
      text.textContent = label(key, personalized ? 'Edit troops' : 'Use my troops');
      window.BH_MARCHES = result;
      document.dispatchEvent(new CustomEvent('bh:marches', { detail: result }));
    }

    button.hidden = false;
    button.addEventListener('click', function () { open(root.hidden); });
    // The switch redraws the marches straight away; a ratio that doesn't add up waits for the reader.
    modes.forEach(function (input) {
      input.addEventListener('change', function () {
        showRatio();
        save();
        try { result = window.BH_BEAR_ALLOCATOR.allocate(read()); render(); } catch (ignored) { /* waits */ }
      });
    });
    token.addEventListener('change', showRatio);
    ratios.forEach(function (input) { input.addEventListener('input', function () { ratios.forEach(function (field) { field.setCustomValidity(''); }); }); });
    root.addEventListener('input', save);
    root.addEventListener('change', save);
    root.addEventListener('submit', function (event) {
      event.preventDefault();
      var options = read();
      if (options.priority && Math.abs(options.ratio.infantry + options.ratio.cavalry + options.ratio.archers - 100) > 0.000001) {
        ratios[2].setCustomValidity(label('bh.alloc.ratioError', 'The three percentages must add up to 100.'));
      }
      if (!root.reportValidity()) return;
      result = window.BH_BEAR_ALLOCATOR.allocate(options);
      personalized = true;
      render();
      open(false);
      button.focus();
    });
    var restored = restore();
    showRatio();
    personalized = restored;
    try { result = window.BH_BEAR_ALLOCATOR.allocate(read()); }
    catch (ignored) {
      // A saved ratio that does not add up to 100: show the equal split until it is fixed.
      result = window.BH_BEAR_ALLOCATOR.allocate(Object.assign(read(), { priority: false }));
    }
    render();
    document.addEventListener('i18n:change', render);

    // The lead finder below works out a leader's best troop mix; a leader can fill
    // their own rally with it.
    var mixButton = document.getElementById('own-mix'), mix = null;
    function percent(n) { return Math.round(n * 1000) / 10; }
    document.addEventListener('lead-finder:mix', function (event) {
      var m = event.detail && event.detail.mix;
      if (!mixButton || !m || m.length !== 3) return;
      var inf = percent(m[0]), cav = percent(m[1]);
      mix = { infantry: inf, cavalry: cav, archers: Math.round((100 - inf - cav) * 10) / 10 };
      document.getElementById('own-mix-value').textContent = [mix.infantry, mix.cavalry, mix.archers].map(function (n) { return n.toLocaleString((window.I18N && window.I18N.locale) || 'en-GB'); }).join(' / ');
      mixButton.hidden = false;
    });
    if (mixButton) mixButton.addEventListener('click', function () {
      if (!mix) return;
      document.getElementById('own-infantry').value = String(mix.infantry);
      document.getElementById('own-cavalry').value = String(mix.cavalry);
      document.getElementById('own-archers').value = String(mix.archers);
      ratios.forEach(function (field) { field.setCustomValidity(''); });
      save();
    });

    // The hunt above sets how many joins to send and how big: a change there
    // carries into the builder, and a first visit starts from it.
    function follow(hunt) {
      document.getElementById('join-queues').value = String(hunt.joins);
      if (hunt.cap) document.getElementById('join-cap').value = String(hunt.cap);
      save();
      try { result = window.BH_BEAR_ALLOCATOR.allocate(read()); render(); } catch (ignored) { /* a ratio that doesn't add up waits for the reader */ }
    }
    return { follow: follow, restored: restored };
  }

  var HEROES = {
    chenko: { name: 'Chenko', type: 'cav', whyJoin: 'Raises attack by 25%. A simple, reliable shared offensive skill.' },
    yeonwoo: { name: 'Yeonwoo', type: 'inf', whyJoin: 'Raises attack by 25%. It shares an effect family with Chenko, so their bonuses add together.' },
    amane: { name: 'Amane', type: 'arc', whyJoin: 'Raises attack by 25% in a different effect family from Chenko and Yeonwoo, so it multiplies with their shared attack stack.' },
    margotJoin: { name: 'Margot', key: 'margot', type: 'cav', whyJoin: 'Raises attack by 25% in the same effect family as Amane. Another strong shared offensive option from Generation IV.' },
    vivianJoin: { name: 'Vivian', key: 'vivian', type: 'arc', whyJoin: 'Raises enemy damage taken by 25%. It uses a different effect family from the common attack bonuses, so it multiplies with them.' },
    avaJoin: { name: 'Ava', key: 'ava', type: 'cav', whyJoin: 'Reduces enemy defence in its own effect family. Strong shared value when Ava is not leading the rally.' },
    weewooJoin: { name: 'Wee & Woo', key: 'weewoo', type: 'arc', whyJoin: 'Their first skill splits its bonus between attack and lethality. Those effect families multiply, giving slightly more combined value than a flat 25% bonus.' }
  };

  var JOINER_S_BY_GEN = {
    1: ['chenko', 'yeonwoo', 'amane'],
    2: ['chenko', 'yeonwoo', 'amane'],
    3: ['chenko', 'yeonwoo', 'amane'],
    4: ['chenko', 'yeonwoo', 'amane', 'margotJoin'],
    5: ['chenko', 'yeonwoo', 'amane', 'margotJoin', 'vivianJoin'],
    6: ['chenko', 'yeonwoo', 'amane', 'margotJoin', 'vivianJoin'],
    7: ['avaJoin', 'weewooJoin']
  };

  var APPROVED_BACKUPS = {
    1: ['Amadeus when he is not your lead'],
    2: ['Amadeus if available'],
    3: ['Amadeus if available'],
    4: ['Amadeus if available', 'Rosa'],
    5: ['Amadeus if available', 'Rosa'],
    6: ['Amadeus if available', 'Rosa', 'Yang'],
    7: ['Earlier recommended joiners remain usable', 'Rosa', 'Yang', 'one Petra per rally']
  };

  function heroImage(key) {
    var hero = HEROES[key];
    var file = hero && hero.key ? hero.key : key;
    return '../img/heroes/' + file + '.webp';
  }

  function heroPortrait(key, compact) {
    var hero = HEROES[key];
    return '<img class="hero-explorer-portrait' + (compact ? ' compact' : '') + '" src="' + heroImage(key) + '" alt="" width="256" height="256" loading="lazy" decoding="async">';
  }

  function wireHeroExplorer() {
    var mount = document.querySelector('.hero-permission');
    if (!mount) return;

    mount.innerHTML =
      '<div class="hero-explorer" id="hero-explorer">' +
        '<div class="hero-age-row">' +
          '<label for="server-generation"><b>' + i18nText('Your server generation') + '</b></label>' +
          '<select id="server-generation"><option value="" ' + i18nAttr('Choose generation…') + '>Choose generation…</option>' +
            [1,2,3,4,5,6,7].map(function (g) { return '<option value="' + g + '">' + i18nText('Generation ') + g + '</option>'; }).join('') +
          '</select>' +
        '</div>' +
        '<div id="hero-generation-content" hidden>' +
          '<div class="hero-explorer-block joiner-explorer">' +
            '<h3>' + i18nText('Recommended first heroes for join marches') + '</h3>' +
            '<div class="joiner-icons" id="joiner-icons"></div>' +
            '<div class="joiner-explain" id="joiner-explain" hidden></div>' +
            '<p class="hero-explorer-help hero-backups" id="hero-backup-copy"></p>' +
          '</div>' +
        '</div>' +
      '</div>';
    refreshI18n(mount);

    var select = document.getElementById('server-generation');
    var content = document.getElementById('hero-generation-content');
    var joiners = document.getElementById('joiner-icons');
    var joinerExplain = document.getElementById('joiner-explain');
    var backupCopy = document.getElementById('hero-backup-copy');
    var latest = 7;

    function generationValue() {
      var n = Number(select.value);
      return isFinite(n) && n >= 1 ? Math.min(latest, Math.round(n)) : null;
    }

    function render(generation) {
      if (!generation || !JOINER_S_BY_GEN[generation]) {
        content.hidden = true;
        return;
      }
      content.hidden = false;
      joiners.innerHTML = JOINER_S_BY_GEN[generation].map(function (key) {
        var hero = HEROES[key];
        return '<button class="joiner-icon" type="button" data-hero="' + key + '" aria-label="' + hero.name + ': ' + t('show recommendation details') + '">' +
          heroPortrait(key, true) + '<span>' + hero.name + '</span>' +
        '</button>';
      }).join('');
      joinerExplain.hidden = true;
      joinerExplain.innerHTML = '';

      var backups = APPROVED_BACKUPS[generation] || [];
      var base = backups.length ? backups.map(i18nText).join(' · ') + '. ' : '';
      backupCopy.innerHTML = base + i18nText('Hilde is excluded from the default list because alliance policies vary. Use her only if your alliance allows her. If no approved hero is available, send no hero.');
      refreshI18n(backupCopy);
    }

    joiners.addEventListener('click', function (event) {
      var button = event.target.closest && event.target.closest('.joiner-icon');
      if (!button) return;
      var key = button.getAttribute('data-hero');
      var hero = HEROES[key];
      if (!hero) return;
      Array.prototype.forEach.call(joiners.querySelectorAll('.joiner-icon'), function (item) {
        item.classList.toggle('active', item === button);
      });
      joinerExplain.hidden = false;
      joinerExplain.innerHTML = '<div class="joiner-explain-head">' + heroPortrait(key, true) + '<b>' + hero.name + '</b></div><p>' + i18nText(hero.whyJoin) + '</p>';
      refreshI18n(joinerExplain);
    });

    select.addEventListener('change', function () {
      var generation = generationValue();
      if (generation && window.KS_SERVER_AGE) window.KS_SERVER_AGE.setGeneration(generation);
      render(generation);
    });

    document.addEventListener('ks:server-age-change', function (event) {
      var generation = event.detail && event.detail.generation;
      if (!generation) return;
      generation = Math.min(latest, generation);
      if (select.value !== String(generation)) select.value = String(generation);
      render(generation);
    });

    var stored = window.KS_SERVER_AGE && window.KS_SERVER_AGE.getGeneration();
    if (stored) {
      stored = Math.min(latest, stored);
      select.value = String(stored);
      render(stored);
    }

    document.addEventListener('i18n:change', function () { render(generationValue()); });
  }

  function init() {
    wireHunt(wireAllocator());
    wireHeroExplorer();
  }

  if (window.I18N && window.I18N.onReady) window.I18N.onReady(init);
  else init();
})();