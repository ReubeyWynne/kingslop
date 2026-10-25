(function () {
  'use strict';
  // The guide: two notes that teach the page deck, then a short door card.
  // The page note says a sideways swipe (or ❧ and the arrow keys) opens every
  // page; it retires when the deck or the ledger opens, or on "got it". The rail
  // note sits under the deck's rail and retires on the first scrub. The door card
  // asks the kingdom's generation and the player's role, saved where the site
  // already keeps them, and offers three ways in; it follows "got it", or comes
  // on a later visit, and retires on a way in or "just looking". Anything never
  // acted on stops after SHOWINGS visits. "Show me how" in the deck (or a link to
  // #site-guide) brings all three back.
  var KEY = 'bh:guide';
  var SHOWINGS = 3;
  var DELAY = 3000;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode: the guide just shows again */ }
  }

  window.Interactions.register('site-guide', function (context) {
    var note = context.targets('swipe')[0];
    var door = context.targets('door')[0];
    var rail = document.getElementById('guide-rail');
    var railBar = document.querySelector('.deck-rail');
    var ledgerBtn = document.getElementById('ledger-btn');
    var deck = document.getElementById('page-deck');
    var touch = window.matchMedia('(hover: none) and (pointer: coarse)');
    var age = window.KS_SERVER_AGE;
    var state = load();
    var timer = 0;
    var replaying = false;

    function due(name) { return !state[name] || (state[name] !== 'done' && state[name] < SHOWINGS); }
    function count(name) { if (state[name] !== 'done') { state[name] = (state[name] || 0) + 1; save(state); } }
    function retire(name) { state[name] = 'done'; save(state); }
    function t(key, fallback) { return context.api.tr('guide.door.' + key, fallback); }

    function input() { note.setAttribute('data-input', touch.matches ? 'touch' : 'keys'); }
    // Where ❧ is hidden (the widest screens), the topbar already lists every page.
    function needed() { return !!(deck && ledgerBtn && ledgerBtn.getClientRects().length); }
    function showNote() {
      if (!needed() || deck.open) return;
      input();
      door.hidden = true;
      note.hidden = false;
    }
    function hideNote() { window.clearTimeout(timer); note.hidden = true; }
    function retireNote() { retire('swipe'); hideNote(); }

    // The door asks only what the save does not know yet; a player who has
    // already set both has found their way in.
    function known() { return age.getGeneration() !== null && context.ledger.priority().role !== null; }
    function paintDoor() {
      var generation = age.getGeneration();
      var role = context.ledger.priority().role;
      context.targets('generation').forEach(function (node) { node.value = generation === null ? '' : String(generation); });
      context.targets('role').forEach(function (node) { node.setAttribute('aria-pressed', String(node.dataset.doorRole === role)); });
    }
    function showDoor() {
      if (deck && deck.open) return;
      paintDoor();
      context.targets('saved')[0].textContent = '';
      note.hidden = true;
      door.hidden = false;
    }
    function retireDoor() { retire('door'); door.hidden = true; }
    function saved(ok) { context.targets('saved')[0].textContent = ok ? t('saved', 'Saved.') : t('saveFailed', 'Could not save. Check browser storage.'); }

    function showRail() {
      if (!rail) return;
      rail.hidden = false;
      if (deck) deck.setAttribute('data-guide', 'rail');
      if (railBar && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        railBar.classList.remove('is-waking');
        void railBar.offsetWidth;
        railBar.classList.add('is-waking');
      }
    }
    function hideRail() {
      if (rail) rail.hidden = true;
      if (deck) deck.removeAttribute('data-guide');
      if (railBar) railBar.classList.remove('is-waking');
    }

    // The page note first, where it is needed; otherwise the door.
    function start() {
      if (needed()) { count('swipe'); showNote(); } else { count('door'); showDoor(); }
    }
    function replay() {
      delete state.swipe;
      delete state.rail;
      delete state.door;
      save(state);
      if (ledgerBtn && ledgerBtn.getAttribute('aria-expanded') === 'true' && !(deck && deck.open)) ledgerBtn.click();
      if (deck && deck.open) { replaying = true; showRail(); return; }
      start();
    }

    context.listen(document, 'deck:open', function () {
      retireNote();
      door.hidden = true;
      if (due('rail')) { count('rail'); showRail(); }
    });
    context.listen(document, 'deck:close', function () {
      hideRail();
      if (replaying) { replaying = false; start(); }
    });
    context.listen(document, 'deck:scrub', function () { if (rail && !rail.hidden) { retire('rail'); hideRail(); } });
    // Where the deck cannot open (no dialog support), ❧ opens the ledger; that teaches it too.
    if (ledgerBtn) context.listen(ledgerBtn, 'click', function () { if (!note.hidden) retireNote(); });
    context.listen(document, 'click', function (e) {
      var link = e.target.closest && e.target.closest('[data-guide-replay]');
      if (!link) return;
      e.preventDefault();
      replay();
    });
    context.listen(touch, 'change', input);
    context.listen(document, 'ks:kingdom-change', function () { if (!door.hidden) paintDoor(); });

    if (location.hash === '#site-guide') replay();
    else {
      if (state.door !== 'done' && known()) retire('door');
      var next = needed() && due('swipe') ? 'swipe' : due('door') ? 'door' : null;
      if (next) timer = window.setTimeout(function () {
        if (next === 'swipe' && !needed()) next = due('door') ? 'door' : null;
        if (!next) return;
        count(next);
        if (next === 'swipe') showNote(); else showDoor();
      }, DELAY);
    }
    context.cleanup(function () { window.clearTimeout(timer); });

    return {
      actions: {
        dismiss: { run: function () {
          retireNote();
          if (due('door')) { count('door'); showDoor(); }
        } },
        generation: { events: ['change'], run: function (node) {
          try { if (node.value === '') age.clear(); else age.setGeneration(Number(node.value)); saved(window.KingdomProgression.writable()); } catch (cause) { saved(false); }
        } },
        role: { run: function (node) {
          try { context.ledger.setPriorityRole(node.dataset.doorRole); saved(true); } catch (cause) { saved(false); }
          paintDoor();
        } },
        go: { run: function () { retire('door'); } },
        skip: { run: function () { retireDoor(); } }
      }
    };
  });
})();
