/* bear-hunt.js — Bear Hunt page interactions. */
(function () {
  'use strict';

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
        note.innerHTML = 'Reserved <b>' + formatNumber(own) + '</b> archers for your own rally, then split the remainder evenly across ' + queues + ' join queues. Each capped ' + formatNumber(joinCap) + ' join targets at most <b>' + formatNumber(joinArcherCap) + '</b> archers at 5/15/80.';
      } else {
        note.innerHTML = 'Auto mode equalises archers across your own rally and ' + queues + ' join queues until a cap binds. Each capped ' + formatNumber(joinCap) + ' join targets at most <b>' + formatNumber(joinArcherCap) + '</b> archers at 5/15/80.';
      }
    }

    inputs.forEach(function (input) {
      input.addEventListener('input', render);
      input.addEventListener('change', render);
    });
    render();
  }

  wireSections();
  wireAllocator();
})();