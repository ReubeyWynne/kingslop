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

  function setSectionOpen(section, open) {
    if (!section) return;
    var button = section.querySelector(':scope > h2 .section-toggle');
    var body = section.querySelector(':scope > .section-body');
    if (!button || !body) return;

    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    body.hidden = !open;
    if (open) section.removeAttribute('data-collapsed');
    else section.setAttribute('data-collapsed', '');
  }

  function sectionForHash(hash) {
    if (!hash || hash.length < 2) return null;
    var target = document.getElementById(hash.slice(1));
    if (!target) return null;
    if (target.matches && target.matches('section[data-collapse]')) return target;
    return target.closest ? target.closest('section[data-collapse]') : null;
  }

  function wireSections() {
    var sections = Array.prototype.slice.call(document.querySelectorAll('section[data-collapse]'));
    if (!sections.length) return;

    var mobile = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
    sections.forEach(function (section) {
      setSectionOpen(section, !mobile);
      var button = section.querySelector(':scope > h2 .section-toggle');
      if (!button) return;
      button.addEventListener('click', function () {
        setSectionOpen(section, button.getAttribute('aria-expanded') !== 'true');
      });
    });

    function openHash(hash) {
      var section = sectionForHash(hash);
      if (section) setSectionOpen(section, true);
    }

    openHash(window.location.hash);

    var toc = document.getElementById('toc');
    if (toc) {
      toc.addEventListener('click', function (event) {
        var link = event.target.closest && event.target.closest('a[href^="#"]');
        if (link) openHash(link.getAttribute('href'));
      });
    }

    window.addEventListener('hashchange', function () {
      openHash(window.location.hash);
    });
  }

  function numberValue(id, fallback) {
    var el = document.getElementById(id);
    if (!el) return fallback;
    var n = Number(el.value);
    return isFinite(n) ? n : fallback;
  }

  function formatNumber(n) {
    return Math.max(0, Math.round(n)).toLocaleString(undefined);
  }

  function wireAllocator() {
    var root = document.getElementById('archer-allocator');
    if (!root) return;

    var inputs = Array.prototype.slice.call(root.querySelectorAll('input'));
    var ownOut = document.getElementById('alloc-own');
    var joinOut = document.getElementById('alloc-join');
    var homeOut = document.getElementById('alloc-home');
    var note = document.getElementById('alloc-note');

    function render() {
      var total = Math.max(0, numberValue('archer-total', 0));
      var queues = Math.min(6, Math.max(1, Math.round(numberValue('join-queues', 6))));
      var joinCap = Math.max(0, numberValue('join-cap', 85000));
      var ownCap = Math.max(0, numberValue('own-cap', 130000));
      var reserve = Math.max(0, numberValue('own-reserve', 0));
      var joinArcherCap = joinCap * 0.80;

      var own = 0;
      var eachJoin = 0;

      if (reserve > 0) {
        own = Math.min(total, ownCap, reserve);
        eachJoin = Math.min(joinArcherCap, Math.max(0, total - own) / queues);
      } else {
        var equal = total / (queues + 1);

        if (equal <= ownCap && equal <= joinArcherCap) {
          own = equal;
          eachJoin = equal;
        } else if (ownCap < equal) {
          own = ownCap;
          eachJoin = Math.min(joinArcherCap, Math.max(0, total - own) / queues);
        } else {
          eachJoin = joinArcherCap;
          own = Math.min(ownCap, Math.max(0, total - eachJoin * queues));
        }
      }

      var used = own + eachJoin * queues;
      var home = Math.max(0, total - used);

      ownOut.textContent = formatNumber(own);
      joinOut.textContent = formatNumber(eachJoin);
      homeOut.textContent = formatNumber(home);

      if (reserve > 0) {
        note.innerHTML = t('Own rally: {own} archers. Each join queue gets {join}. Then add cavalry evenly, followed by infantry, so the join marches stay the same total size.')
          .replace('{own}', '<b>' + formatNumber(own) + '</b>')
          .replace('{join}', '<b>' + formatNumber(eachJoin) + '</b>');
      } else {
        note.innerHTML = t('Each join queue gets {join} archers. Then add cavalry evenly, followed by infantry, so the join marches stay the same total size.')
          .replace('{join}', '<b>' + formatNumber(eachJoin) + '</b>');
      }
    }

    inputs.forEach(function (input) {
      input.addEventListener('input', render);
      input.addEventListener('change', render);
    });
    render();
    document.addEventListener('i18n:change', render);
  }

  var HEROES = {
    amadeus: { name: 'Amadeus', type: 'inf', why: 'Three offensive skills plus an offensive rally widget. Recommended infantry lead through Generation VII.' },
    helga: { name: 'Helga', type: 'inf', why: 'Two offensive skills plus an offensive widget. Use her when Amadeus is unavailable or significantly less developed.' },
    zoe: { name: 'Zoe', type: 'inf', why: 'Strong free-to-play infantry stats, but Sundering Wounds does not work on the Bear, so part of her kit is wasted here.' },
    alcar: { name: 'Alcar', type: 'inf', why: 'High infantry damage and an enemy-damage-taken effect. He favours a more infantry-heavy formation, so compare him with Amadeus using your own setup.' },

    jabel: { name: 'Jabel', type: 'cav', why: 'Two offensive skills and the strongest cavalry stats available in Generation I.' },
    hilde: { name: 'Hilde', type: 'cav', why: 'Generation-II cavalry stats and some offensive value, but part of her kit is defensive and adds no Bear damage.' },
    petra: { name: 'Petra', type: 'cav', why: 'An offensive widget, strong cavalry stats and a first-skill interaction with unusually high expected value against the Bear.' },
    margot: { name: 'Margot', type: 'cav', why: 'Higher cavalry stats and two offensive skills. Her widget is defensive, so Petra usually stays ahead.' },
    thrud: { name: 'Thrud', type: 'cav', why: 'An offensive widget and several damage effects, although some of her kit ramps up or applies awkwardly over a ten-round Bear fight.' },
    ava: { name: 'Ava', type: 'cav', why: 'Generation-VII cavalry stats, an offensive widget and three offensive skills, including an enemy-damage-taken effect. Recommended cavalry lead in Generation VII.' },

    saul: { name: 'Saul', type: 'arc', why: 'The strongest archer stats available in Generation I, making him the recommended archer lead for that generation.' },
    marlin: { name: 'Marlin', type: 'arc', why: 'An offensive widget, two all-troop offensive skills and a large stat increase over Saul. Recommended from Generation II.' },
    rosa: { name: 'Rosa', type: 'arc', why: 'An offensive widget, higher archer stats and a 30% archer attack skill. Recommended from Generation IV until Yang arrives.' },
    vivian: { name: 'Vivian', type: 'arc', why: 'Higher Generation-V archer stats and three offensive skills, but two ramp slowly across the ten rounds. In our model she remains close to Rosa rather than clearly overtaking her.' },
    yang: { name: 'Yang', type: 'arc', why: 'Three offensive skills, an offensive widget and high archer stats. Recommended from Generation VI.' },
    weewoo: { name: 'Wee & Woo', type: 'arc', why: 'Generation-VII archer stats and three offensive skills. They are close to Yang, but Yang’s widget keeps her ahead in our current model.' },

    chenko: { name: 'Chenko', type: 'cav', whyJoin: 'Raises attack by 25%. A simple, reliable shared offensive skill.' },
    yeonwoo: { name: 'Yeonwoo', type: 'inf', whyJoin: 'Raises attack by 25%. It shares an effect family with Chenko, so their bonuses add together.' },
    amane: { name: 'Amane', type: 'arc', whyJoin: 'Raises attack by 25% in a different effect family from Chenko and Yeonwoo, so it multiplies with their shared attack stack.' },
    margotJoin: { name: 'Margot', key: 'margot', type: 'cav', whyJoin: 'Raises attack by 25% in the same effect family as Amane. Another strong shared offensive option from Generation IV.' },
    vivianJoin: { name: 'Vivian', key: 'vivian', type: 'arc', whyJoin: 'Raises enemy damage taken by 25%. It uses a different effect family from the common attack bonuses, so it multiplies with them.' },
    avaJoin: { name: 'Ava', key: 'ava', type: 'cav', whyJoin: 'Reduces enemy defence in its own effect family. Strong shared value when Ava is not leading the rally.' },
    weewooJoin: { name: 'Wee & Woo', key: 'weewoo', type: 'arc', whyJoin: 'Their first skill splits its bonus between attack and lethality. Those effect families multiply, giving slightly more combined value than a flat 25% bonus.' }
  };

  var LEADER_BY_GEN = {
    1: { inf: ['amadeus', 'helga'], cav: ['jabel'], arc: ['saul'] },
    2: { inf: ['amadeus', 'helga', 'zoe'], cav: ['jabel', 'hilde'], arc: ['marlin', 'saul'] },
    3: { inf: ['amadeus', 'helga', 'zoe'], cav: ['petra', 'jabel', 'hilde'], arc: ['marlin', 'saul'] },
    4: { inf: ['amadeus', 'alcar', 'helga'], cav: ['petra', 'margot', 'jabel'], arc: ['rosa', 'marlin'] },
    5: { inf: ['amadeus', 'alcar', 'helga'], cav: ['petra', 'thrud', 'margot'], arc: ['rosa', 'vivian', 'marlin'] },
    6: { inf: ['amadeus', 'alcar', 'helga'], cav: ['petra', 'thrud', 'margot'], arc: ['yang', 'rosa', 'vivian'] },
    7: { inf: ['amadeus', 'alcar', 'helga'], cav: ['ava', 'petra', 'thrud'], arc: ['yang', 'weewoo', 'rosa'] }
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

  function typeLabel(type) {
    return t(type === 'inf' ? 'Infantry' : type === 'cav' ? 'Cavalry' : 'Archer');
  }

  function heroPortrait(key, compact) {
    var hero = HEROES[key];
    return '<img class="hero-explorer-portrait' + (compact ? ' compact' : '') + '" src="' + heroImage(key) + '" alt="" width="256" height="256" loading="lazy" decoding="async">';
  }

  function wireHeroExplorer() {
    var mount = document.querySelector('#heroes .hero-permission');
    if (!mount) return;

    mount.innerHTML =
      '<div class="hero-explorer" id="hero-explorer">' +
        '<div class="hero-age-row">' +
          '<label for="server-generation"><b>' + i18nText('Your server generation') + '</b><small>' + i18nText('Saved on this device for use by other tools.') + '</small></label>' +
          '<select id="server-generation"><option value="" ' + i18nAttr('Choose generation…') + '>Choose generation…</option>' +
            [1,2,3,4,5,6,7].map(function (g) { return '<option value="' + g + '">' + i18nText('Generation ') + g + '</option>'; }).join('') +
          '</select>' +
        '</div>' +
        '<div id="hero-generation-content" hidden>' +
          '<div class="hero-explorer-block">' +
            '<h3>' + i18nText('Recommended leader lineup') + '</h3>' +
            '<p class="hero-explorer-help">' + i18nText('Assuming similar development. Tap a slot to see the alternatives and why each is recommended.') + '</p>' +
            '<div class="leader-lineup" id="leader-lineup"></div>' +
            '<div class="leader-alts" id="leader-alts" hidden></div>' +
          '</div>' +
          '<div class="hero-explorer-block joiner-explorer">' +
            '<h3>' + i18nText('Recommended first heroes for join marches') + '</h3>' +
            '<p class="hero-explorer-help">' + i18nText('Only the first hero matters here. Tap a hero to see what their first skill adds. If none of the approved options is available, send the march without a hero.') + '</p>' +
            '<div class="joiner-icons" id="joiner-icons"></div>' +
            '<div class="joiner-explain" id="joiner-explain" hidden></div>' +
            '<details class="hero-backups"><summary>' + i18nText('Other options and alliance rules') + '</summary><p id="hero-backup-copy"></p></details>' +
          '</div>' +
        '</div>' +
      '</div>';
    refreshI18n(mount);

    var select = document.getElementById('server-generation');
    var content = document.getElementById('hero-generation-content');
    var lineup = document.getElementById('leader-lineup');
    var alts = document.getElementById('leader-alts');
    var joiners = document.getElementById('joiner-icons');
    var joinerExplain = document.getElementById('joiner-explain');
    var backupCopy = document.getElementById('hero-backup-copy');
    var latest = 7;
    var activeSlot = null;

    function generationValue() {
      var n = Number(select.value);
      return isFinite(n) && n >= 1 ? Math.min(latest, Math.round(n)) : null;
    }

    function renderAlternates(slot, generation) {
      activeSlot = slot;
      var keys = LEADER_BY_GEN[generation][slot] || [];
      if (!keys.length) { alts.hidden = true; return; }
      alts.hidden = false;
      alts.innerHTML = '<h4>' + typeLabel(slot) + ' ' + t('options') + '</h4>' +
        keys.map(function (key, index) {
          var hero = HEROES[key];
          return '<article class="leader-alt' + (index === 0 ? ' recommended' : '') + '">' +
            heroPortrait(key, true) +
            '<div><p class="leader-alt-name"><b>' + hero.name + '</b>' + (index === 0 ? '<span>' + i18nText('recommended') + '</span>' : '') + '</p>' +
            '<p>' + i18nText(hero.why) + '</p></div>' +
          '</article>';
        }).join('');
      refreshI18n(alts);

      Array.prototype.forEach.call(lineup.querySelectorAll('.leader-slot'), function (button) {
        button.classList.toggle('active', button.getAttribute('data-slot') === slot);
      });
    }

    function render(generation) {
      if (!generation || !LEADER_BY_GEN[generation]) {
        content.hidden = true;
        return;
      }
      content.hidden = false;
      activeSlot = null;
      alts.hidden = true;

      var slots = ['inf', 'cav', 'arc'];
      lineup.innerHTML = slots.map(function (slot) {
        var key = LEADER_BY_GEN[generation][slot][0];
        var hero = HEROES[key];
        return '<button class="leader-slot" type="button" data-slot="' + slot + '" aria-label="' + typeLabel(slot) + ': ' + hero.name + '. ' + t('Show alternatives') + '">' +
          '<span class="leader-slot-type">' + typeLabel(slot) + '</span>' +
          heroPortrait(key, false) +
          '<strong>' + hero.name + '</strong>' +
          '<span class="leader-slot-hint">' + t('alternatives') + '</span>' +
        '</button>';
      }).join('');

      var sKeys = JOINER_S_BY_GEN[generation] || [];
      joiners.innerHTML = sKeys.map(function (key) {
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

    lineup.addEventListener('click', function (event) {
      var button = event.target.closest && event.target.closest('.leader-slot');
      if (!button) return;
      var generation = generationValue();
      var slot = button.getAttribute('data-slot');
      if (activeSlot === slot && !alts.hidden) {
        alts.hidden = true;
        activeSlot = null;
        button.classList.remove('active');
        return;
      }
      renderAlternates(slot, generation);
    });

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

    document.addEventListener('i18n:change', function () {
      var generation = generationValue();
      var slot = activeSlot;
      var showAlternates = !alts.hidden;
      render(generation);
      if (showAlternates && slot && generation) renderAlternates(slot, generation);
    });
  }

  function init() {
    wireSections();
    wireAllocator();
    wireHeroExplorer();
  }

  if (window.I18N && window.I18N.onReady) window.I18N.onReady(init);
  else init();
})();