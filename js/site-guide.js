(function () {
  'use strict';
  // The guide: two notes that teach the page deck, each shown until the reader
  // does what it teaches. The page note says a sideways swipe (or ❧ and the
  // arrow keys) opens every page; it retires when the deck or the ledger opens,
  // or on "got it". The rail note sits over the deck's rail and retires on the
  // first scrub. A note that is never acted on stops after SHOWINGS visits.
  // "Show me how" in the deck (or a link to #site-guide) brings both back.
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
    var note = context.root;
    var rail = document.getElementById('guide-rail');
    var railBar = document.querySelector('.deck-rail');
    var ledgerBtn = document.getElementById('ledger-btn');
    var deck = document.getElementById('page-deck');
    var touch = window.matchMedia('(hover: none) and (pointer: coarse)');
    var state = load();
    var timer = 0;
    var replaying = false;

    function due(name) { return !state[name] || (state[name] !== 'done' && state[name] < SHOWINGS); }
    function count(name) { if (state[name] !== 'done') { state[name] = (state[name] || 0) + 1; save(state); } }
    function retire(name) { state[name] = 'done'; save(state); }

    function input() { note.setAttribute('data-input', touch.matches ? 'touch' : 'keys'); }
    // Where ❧ is hidden (the widest screens), the topbar already lists every page.
    function needed() { return !!(deck && ledgerBtn && ledgerBtn.getClientRects().length); }
    function showNote() {
      if (!needed() || deck.open) return;
      input();
      note.hidden = false;
    }
    function hideNote() { window.clearTimeout(timer); note.hidden = true; }
    function retireNote() { retire('swipe'); hideNote(); }

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

    function replay() {
      delete state.swipe;
      delete state.rail;
      save(state);
      if (ledgerBtn && ledgerBtn.getAttribute('aria-expanded') === 'true' && !(deck && deck.open)) ledgerBtn.click();
      if (deck && deck.open) { replaying = true; showRail(); return; }
      if (needed()) count('swipe');
      showNote();
    }

    context.listen(document, 'deck:open', function () {
      retireNote();
      if (due('rail')) { count('rail'); showRail(); }
    });
    context.listen(document, 'deck:close', function () {
      hideRail();
      if (replaying) { replaying = false; if (needed()) count('swipe'); showNote(); }
    });
    context.listen(document, 'deck:scrub', function () { if (rail && !rail.hidden) { retire('rail'); hideRail(); } });
    // Where the deck cannot open (no dialog support), ❧ opens the ledger; that teaches it too.
    if (ledgerBtn) context.listen(ledgerBtn, 'click', function () { retireNote(); });
    context.listen(document, 'click', function (e) {
      var link = e.target.closest && e.target.closest('[data-guide-replay]');
      if (!link) return;
      e.preventDefault();
      replay();
    });
    context.listen(touch, 'change', input);

    if (location.hash === '#site-guide') replay();
    else if (due('swipe')) {
      timer = window.setTimeout(function () { if (needed()) { count('swipe'); showNote(); } }, DELAY);
    }
    context.cleanup(function () { window.clearTimeout(timer); });

    return {
      actions: {
        dismiss: { run: function () { retireNote(); } }
      }
    };
  });
})();
