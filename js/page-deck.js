(function () {
  'use strict';
  function create(api) {
    var fmt = api.fmt;

    // ── Event navigation — switcher, keyboard, swipe ───────
    var page = document.documentElement.getAttribute('data-page') || 'home';
    var prevUrl = document.documentElement.getAttribute('data-prev-url') || '';
    var nextUrl = document.documentElement.getAttribute('data-next-url') || '';

    function neighbor(dir) { return dir === 1 ? nextUrl : prevUrl; }

    // Keyboard: ← previous event, → next event (never while typing, inside the
    // language menu, or focused on the lang button / TOC rail).
    document.addEventListener('keydown', function (e) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var t = e.target;
      if (t && t.closest && t.closest('input, select, textarea, [contenteditable], #lang-menu, #lang-btn, #ledger, #toc, #page-deck')) return;
      var url = neighbor(e.key === 'ArrowLeft' ? -1 : 1);
      if (url) { e.preventDefault(); window.location.href = url; }
    });

    var deck = document.getElementById('page-deck');
    var cards = deck ? Array.prototype.slice.call(deck.querySelectorAll('.deck-card')) : [];
    var groups = deck ? Array.prototype.slice.call(deck.querySelectorAll('[data-deck-group]')) : [];
    var viewport = deck ? deck.querySelector('.deck-viewport') : null;
    var rail = deck ? deck.querySelector('.deck-rail') : null;
    var pips = rail ? Array.prototype.slice.call(rail.querySelectorAll('.deck-pip')) : [];
    var position = 0;
    var targetPosition = null;
    var suppressUntil = 0;
    var returnFocus = null;
    var gesture = null;
    var announceTimer = 0;
    var warmingCard = '';
    var navigatingDeck = false;

    function wrap(n) { return (n % cards.length + cards.length) % cards.length; }

    // The page this tab came from, remembered per tab and marked on the rail.
    // A reload is not a visit, so it keeps the page from before.
    var lastPage = '';
    function rememberVisit() {
      try {
        var was = sessionStorage.getItem('bh:here');
        lastPage = sessionStorage.getItem('bh:last') || '';
        if (was && was !== page) { lastPage = was; sessionStorage.setItem('bh:last', was); }
        sessionStorage.setItem('bh:here', page);
      } catch (e) { lastPage = ''; }
    }
    rememberVisit();

    // The deck is a ring. A full copy of the covers sits on either side of the
    // real ones, so a swipe past either end keeps going; once the strip settles
    // on a copy it is moved, instantly and invisibly, to the matching real cover.
    var before = [];
    var after = [];
    function copyCard(card) {
      var copy = card.cloneNode(true);
      copy.classList.add('deck-copy');
      copy.classList.remove('is-selected');
      copy.removeAttribute('aria-current');
      copy.setAttribute('aria-hidden', 'true');
      copy.setAttribute('tabindex', '-1');
      copy.inert = true;
      return copy;
    }
    function buildRing() {
      if (cards.length < 2 || typeof viewport.insertBefore !== 'function' || typeof cards[0].cloneNode !== 'function') return;
      after = cards.map(function (card) { return viewport.appendChild(copyCard(card)); });
      before = cards.map(function (card) { return viewport.insertBefore(copyCard(card), cards[0]); });
    }
    // The deck keeps one fixed order, the ledger's, every time it opens. The
    // page you came from is only marked on the rail, never moved.
    function markLastPage() {
      var here = cards.findIndex(function (card) { return card.hasAttribute('aria-current'); });
      var last = cards.findIndex(function (card) { return card.getAttribute('data-page') === lastPage; });
      pips.forEach(function (pip, i) { pip.classList.toggle('is-last', i === last && i !== here); });
    }

    // Cover centres are measured once per layout, not on every scroll event:
    // reading them right after a selection change forced a style and layout
    // pass in the middle of a fling.
    var centres = null;
    function measureDeck() { centres = null; }
    function centreOf(el) {
      if (!centres) centres = new Map();
      var c = centres.get(el);
      if (c === undefined) { c = el.offsetLeft + el.offsetWidth / 2; centres.set(el, c); }
      return c;
    }
    function viewCentre() { return viewport.scrollLeft + viewport.clientWidth / 2; }
    function copiesOf(i) { return [before[i], cards[i], after[i]].filter(Boolean); }
    function nearestCopy(i) {
      var c = viewCentre();
      return copiesOf(i).reduce(function (best, el) { return Math.abs(centreOf(el) - c) < Math.abs(centreOf(best) - c) ? el : best; });
    }
    function centred() {
      var c = viewCentre();
      var best = { index: 0, el: cards[0], distance: Infinity };
      cards.forEach(function (card, i) {
        copiesOf(i).forEach(function (el) {
          var d = Math.abs(centreOf(el) - c);
          if (d < best.distance) best = { index: i, el: el, distance: d };
        });
      });
      return best;
    }
    function scrollToCard(el, instant) {
      viewport.scrollTo({ left: el.offsetLeft - (viewport.clientWidth - el.offsetWidth) / 2, behavior: instant ? 'instant' : 'auto' });
    }

    // The selected cover and the cover on either side of it run their
    // scenes, so a cover is already moving when a swipe brings it in. Only
    // the copy of each that sits beside the selected one runs, never every
    // copy in the ring, and the window moves one cover at a time: each
    // crossing starts one scene and stops one.
    var running = [];
    function runScene(index, anchor) {
      var at = centreOf(anchor || nearestCopy(index));
      var next = [-1, 0, 1].map(function (d) {
        return copiesOf(wrap(index + d)).reduce(function (best, el) { return Math.abs(centreOf(el) - at) < Math.abs(centreOf(best) - at) ? el : best; });
      });
      running.forEach(function (el) { if (next.indexOf(el) < 0) el.classList.remove('is-running'); });
      next.forEach(function (el) { if (running.indexOf(el) < 0) el.classList.add('is-running'); });
      running = next;
    }

    function selectDeck(index, anchor) {
      position = index;
      // CSS keys the ground and the accent off this attribute rather than a
      // :has() rule: :has() made every text change in the deck (the position
      // label at each stop) restyle the whole dialog.
      deck.setAttribute('data-selected', cards[index].getAttribute('data-page'));
      cards.forEach(function (card, i) {
        card.classList.toggle('is-selected', i === index);
        card.tabIndex = i === index ? 0 : -1;
      });
      runScene(index, anchor);
      var at = index;
      pips.forEach(function (pip, i) { pip.classList.toggle('is-selected', i === at); });
      if (rail) rail.setAttribute('aria-valuenow', String(at + 1));
      groups.forEach(function (button) {
        button.setAttribute('aria-pressed', cards[index].getAttribute('data-group') === button.getAttribute('data-deck-group') ? 'true' : 'false');
      });
    }

    function announceDeck() {
      var card = cards[position];
      var label = deck.querySelector('.deck-position');
      var title = card.querySelector('.deck-card-title').textContent;
      var text = title + ' · ' + fmt(position + 1) + ' / ' + fmt(cards.length);
      if (rail) rail.setAttribute('aria-valuetext', title);
      // Rewrite the label's text in place: inserting a new text node re-checks
      // every :has() rule above it (the home page's hover themes sit on
      // <html>), which restyled the whole document at each stop.
      if (label.firstChild && label.firstChild.nodeType === 3 && !label.firstChild.nextSibling) label.firstChild.data = text;
      else label.textContent = text;
      var c = navigator.connection;
      if (warmingCard !== card.href && !(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || '')))) {
        warmingCard = card.href;
        if (!card.hasAttribute('aria-current')) warmNeighbour(card.href);
      }
    }

    function browseDeck(index, focusCard, instant) {
      index = wrap(index);
      targetPosition = index;
      var to = instant ? cards[index] : nearestCopy(index);
      selectDeck(index, to);
      scrollToCard(to, instant);
      announceDeck();
      if (focusCard) cards[index].focus({ preventScroll: true });
    }

    // Selection follows the cover in the centre while the strip moves, so the
    // ground drifts with the finger and nothing changes when it comes to rest.
    // Covers keep their own colours, so only the ground moves. A jump from a
    // button or key holds its target rather than passing through the covers
    // on the way.
    // Where the browser reports scrollend, the strip settles only on that
    // event. A quiet-time timer can fire while a fling is still coasting
    // (a busy frame delays the next scroll event), and settling then stopped
    // the strip dead on the nearest cover: the stickiness on long swipes.
    var hasScrollEnd = 'onscrollend' in window;
    function syncDeckScroll() {
      if (!deck.open) return;
      if (targetPosition === null) {
        var at = centred();
        if (at.index !== position) selectDeck(at.index, at.el);
      }
      window.clearTimeout(announceTimer);
      announceTimer = hasScrollEnd ? 0 : window.setTimeout(finishDeckScroll, 180);
    }

    function finishDeckScroll() {
      window.clearTimeout(announceTimer);
      announceTimer = 0;
      if (!deck.open) { targetPosition = null; return; }
      if (gesture && gesture.inDeck) return;
      var at = centred();
      // A jump interrupted on its way (a relayout, a tap on the strip) finishes
      // at its own card rather than wherever the strip happened to stop.
      if (targetPosition !== null && at.index !== targetPosition) at = { index: targetPosition, el: null };
      if (at.el !== cards[at.index] || Math.abs(centreOf(cards[at.index]) - viewCentre()) > 1) scrollToCard(cards[at.index], true);
      targetPosition = null;
      if (at.index !== position || !cards[at.index].classList.contains('is-selected')) selectDeck(at.index, cards[at.index]);
      else runScene(at.index, cards[at.index]);
      announceDeck();
    }

    function openDeck() {
      if (!deck || !cards.length || typeof deck.showModal !== 'function') return false;
      if (deck.open) return true;
      returnFocus = document.activeElement;
      var ledger = document.getElementById('ledger');
      var ledgerBtn = document.getElementById('ledger-btn');
      var langMenu = document.getElementById('lang-menu');
      if (ledger) ledger.hidden = true;
      if (langMenu) langMenu.hidden = true;
      if (ledgerBtn) { ledgerBtn.setAttribute('aria-expanded', 'true'); ledgerBtn.classList.add('open'); }
      var langBtn = document.getElementById('lang-btn');
      if (langBtn) { langBtn.setAttribute('aria-expanded', 'false'); langBtn.classList.remove('open'); }
      navigatingDeck = false;
      // While the deck is open, touch only marks a drag; the strip scrolls
      // natively. A passive listener never makes that scroll wait for script.
      document.removeEventListener('touchmove', trackTouch, { passive: false });
      document.addEventListener('touchmove', trackTouch, { passive: true });
      deck.showModal();
      document.documentElement.classList.add('deck-open');
      markLastPage();
      measureDeck();
      browseDeck(Math.max(0, cards.findIndex(function (card) { return card.hasAttribute('aria-current'); })), false, true);
      document.dispatchEvent(new CustomEvent('deck:open'));
      return true;
    }

    function cleanDeck() {
      window.clearTimeout(announceTimer);
      document.removeEventListener('touchmove', trackTouch, { passive: true });
      document.addEventListener('touchmove', trackTouch, { passive: false });
      targetPosition = null;
      gesture = null;
      document.documentElement.classList.remove('deck-open');
      var btn = document.getElementById('ledger-btn');
      if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.classList.remove('open'); }
      if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
      returnFocus = null;
      document.dispatchEvent(new CustomEvent('deck:close'));
    }

    function closeDeck() {
      if (!deck || !deck.open) return;
      deck.close();
      cleanDeck();
    }

    document.addEventListener('touchstart', function (e) {
      gesture = null;
      if (!deck || !cards.length || e.touches.length !== 1) return;
      var t = e.target;
      if (deck.open && !t.closest('.deck-viewport')) return;
      if (!deck.open && t.closest && t.closest('a, button, input, select, textarea, dialog, [role="dialog"], [contenteditable], #ledger, #toc, .toc, [role="slider"], [data-swipe-ignore]')) return;
      var touch = e.touches[0];
      gesture = { x: touch.clientX, y: touch.clientY, inDeck: deck.open, active: false };
      if (deck.open) targetPosition = null;
    }, { passive: true });

    function trackTouch(e) {
      if (!gesture || e.touches.length !== 1) { gesture = null; return; }
      var dx = e.touches[0].clientX - gesture.x;
      var dy = e.touches[0].clientY - gesture.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;
      if (Math.abs(dy) >= Math.abs(dx) && !gesture.active) { gesture = null; return; }
      if (Math.abs(dx) < Math.abs(dy) * 1.2 && !gesture.active) return;
      if (gesture.inDeck) {
        gesture.active = true;
        suppressUntil = performance.now() + 200;
        return;
      }
      if (!gesture.active) {
        if (!openDeck()) { gesture = null; return; }
        gesture.active = true;
      }
      if (e.cancelable) e.preventDefault();
    }
    document.addEventListener('touchmove', trackTouch, { passive: false });

    document.addEventListener('touchend', function (e) {
      if (!gesture) return;
      var g = gesture;
      gesture = null;
      // A release that moves nothing gets no scrollend, so settle after a
      // pause; any scroll that does follow clears this and waits for its end.
      if (g.inDeck) { window.clearTimeout(announceTimer); announceTimer = window.setTimeout(finishDeckScroll, 180); }
      if (!g.active) return;
      suppressUntil = performance.now() + 200;
      if (!g.inDeck && e.changedTouches.length) {
        var dx = e.changedTouches[0].clientX - g.x;
        browseDeck(position + (dx < 0 ? 1 : -1));
      }
    }, { passive: true });

    document.addEventListener('touchcancel', function () { gesture = null; }, { passive: true });

    function wireDeck() {
      if (!deck || !cards.length || typeof deck.showModal !== 'function') return;
      buildRing();
      deck.querySelector('.deck-close').addEventListener('click', closeDeck);
      deck.addEventListener('cancel', function (e) { e.preventDefault(); closeDeck(); });
      deck.addEventListener('close', cleanDeck);
      viewport.addEventListener('scroll', syncDeckScroll, { passive: true });
      viewport.addEventListener('scrollend', finishDeckScroll);
      deck.addEventListener('click', function (e) {
        if (performance.now() < suppressUntil && e.detail !== 0) { e.preventDefault(); return; }
        var card = e.target.closest('.deck-card'), missed = false;
        // A tap in the strip that misses every card (the gap beside one, or a card still sliding
        // into place) is meant for the card in the middle, not for closing the deck.
        if (!card && e.target.closest('.deck-viewport')) {
          var middle = deck.querySelector('.deck-card.is-selected'), box = middle && middle.getBoundingClientRect();
          if (box && e.clientY >= box.top && e.clientY <= box.bottom) { card = middle; missed = true; }
        }
        if (card) {
          if (card.hasAttribute('aria-current')) { e.preventDefault(); closeDeck(); return; }
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          navigatingDeck = true;
          document.documentElement.setAttribute('data-entry', 'deck');
          try { sessionStorage.setItem('bh:deck', new URL(card.href).pathname); } catch (err) {}
          if (missed) location.assign(card.href);
          return;
        }
        if (!e.target.closest('button, .deck-rail')) closeDeck();
      });
      deck.addEventListener('keydown', function (e) {
        if (e.altKey || e.metaKey || e.ctrlKey) return;
        var delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (delta) { e.preventDefault(); browseDeck((targetPosition === null ? position : targetPosition) + delta, true); }
        else if (e.key === 'Home' || e.key === 'End') {
          e.preventDefault();
          browseDeck(e.key === 'Home' ? 0 : cards.length - 1, true);
        }
      });
      deck.querySelector('.deck-prev').addEventListener('click', function () { browseDeck((targetPosition === null ? position : targetPosition) - 1); });
      deck.querySelector('.deck-next').addEventListener('click', function () { browseDeck((targetPosition === null ? position : targetPosition) + 1); });
      groups.forEach(function (button) {
        button.addEventListener('click', function () {
          browseDeck(cards.findIndex(function (card) { return card.getAttribute('data-group') === button.getAttribute('data-deck-group'); }));
        });
      });
      if (rail) wireRail();
      window.addEventListener('resize', function () {
        measureDeck();
        if (deck.open) browseDeck(position, false, true);
      });
      // Covers are sized in rem, so a text-size change moves them without
      // resizing the window; keep the selected one centred.
      if (typeof ResizeObserver === 'function') {
        new ResizeObserver(function () { measureDeck(); if (deck.open) browseDeck(position, false, true); }).observe(cards[0]);
      }
      document.addEventListener('i18n:change', function () {
        if (deck.open) { syncDeckScroll(); announceDeck(); }
      });
    }

    // The rail: one mark per page, in ledger order. A touch on it jumps to the
    // mark under the finger and sliding along it scrubs through the ledger,
    // each step straight to its cover rather than gliding past the ones
    // between. Keys step and clamp like any slider, and keep focus on it.
    function wireRail() {
      var scrubbing = null;
      function scrubTo(x) {
        var at = 0;
        var best = Infinity;
        pips.forEach(function (pip, i) {
          var r = pip.getBoundingClientRect();
          var d = Math.abs(r.left + r.width / 2 - x);
          if (d < best) { best = d; at = i; }
        });
        var current = targetPosition === null ? position : targetPosition;
        if (current !== at) browseDeck(at, false, true);
      }
      function stop() { scrubbing = null; rail.classList.remove('is-scrubbing'); }
      rail.addEventListener('pointerdown', function (e) {
        if (e.button > 0) return;
        scrubbing = e.pointerId;
        if (rail.setPointerCapture) rail.setPointerCapture(e.pointerId);
        rail.classList.add('is-scrubbing');
        rail.dispatchEvent(new CustomEvent('deck:scrub', { bubbles: true }));
        scrubTo(e.clientX);
      });
      rail.addEventListener('pointermove', function (e) { if (scrubbing === e.pointerId) scrubTo(e.clientX); });
      rail.addEventListener('pointerup', stop);
      rail.addEventListener('pointercancel', stop);
      rail.addEventListener('lostpointercapture', stop);
      rail.addEventListener('keydown', function (e) {
        if (e.altKey || e.metaKey || e.ctrlKey) return;
        var at = targetPosition === null ? position : targetPosition;
        var to = { ArrowLeft: at - 1, ArrowDown: at - 1, ArrowRight: at + 1, ArrowUp: at + 1, PageDown: at - 3, PageUp: at + 3, Home: 0, End: cards.length - 1 }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        e.stopPropagation();
        to = Math.max(0, Math.min(cards.length - 1, to));
        rail.dispatchEvent(new CustomEvent('deck:scrub', { bubbles: true }));
        if (to !== at) browseDeck(to);
      });
    }

    window.addEventListener('pagehide', function () {
      if (deck && deck.open && !navigatingDeck) closeDeck();
    });
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) rememberVisit();
      if (e.persisted && deck && deck.open) closeDeck();
      navigatingDeck = false;
      document.documentElement.removeAttribute('data-entry');
    });

    // ── Neighbour warm-up — the other half of the swipe ────
    // The two pages a swipe can reach are known before the finger moves. Once
    // this page is whole and the browser is idle, each neighbour is fetched and
    // read the way the browser will read it: what it asks for is what the swipe
    // will need, so its sheets and toys are prefetched too (this page's own are
    // already in the cache, and anything off-origin is left alone). Both the
    // document and its assets then answer the navigation out of cache, and the
    // cross-document transition has nothing to wait for.
    //
    // Idle, and on the far side of boot, on purpose: a speculative download must
    // never take a byte from the page in front of the reader. Skipped where a
    // download is unwelcome — an explicit data-saver, or a 2G-class connection.
    var warmed = false;
    var prefetched = {};
    function prefetch(url, as) {
      if (!url || prefetched[url]) return;
      prefetched[url] = true;
      var link = document.createElement('link');
      link.rel = 'prefetch';
      if (as) link.as = as;
      link.href = url;
      document.head.appendChild(link);
    }
    function warmNeighbour(href) {
      if (!href) return;
      // The ring's URLs are the page-relative ones the layout wrote, so resolve
      // once here: the fetch, and every asset path lifted out of the neighbour's
      // own markup, hang off this absolute URL.
      var url;
      try { url = new URL(href, location.href).href; } catch (e) { return; }
      fetch(url, { priority: 'low' }).then(function (r) {
        return r.ok ? r.text() : '';
      }).then(function (html) {
        if (!html) return;
        var mine = {};
        [].slice.call(document.querySelectorAll('link[rel="stylesheet"][href], script[src]')).forEach(function (el) {
          mine[el.href || el.src] = true;   // links expose href, scripts src
        });
        // The tags are read straight off the markup rather than through
        // DOMParser: building a whole neighbour document only to read its
        // head was a long task of its own on a phone, for a few attributes
        // the layout always writes the same way.
        var tags = html.match(/<(?:link|script)\b[^>]*>/gi) || [];
        tags.forEach(function (tag) {
          var isLink = /^<link/i.test(tag);
          if (isLink && !/\srel=["']?stylesheet\b/i.test(tag)) return;
          var m = tag.match(isLink ? /\shref=(?:"([^"]*)"|'([^']*)')/i : /\ssrc=(?:"([^"]*)"|'([^']*)')/i);
          if (!m) return;
          var abs;
          try { abs = new URL((m[1] != null ? m[1] : m[2]).replace(/&amp;/g, '&'), url).href; } catch (e) { return; }
          if (abs.indexOf(location.origin + '/') !== 0 || mine[abs]) return;
          prefetch(abs, isLink ? 'style' : 'script');
        });
      }).catch(function () { /* a neighbour that will not load is not this page's problem */ });
    }
    function warmNeighbours() {
      if (warmed) return;
      warmed = true;
      var c = navigator.connection;
      if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return;
      warmNeighbour(prevUrl);
      warmNeighbour(nextUrl);
    }
    function scheduleWarm() {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(warmNeighbours, { timeout: 2500 });
      } else if (document.readyState === 'complete') {
        // boot can run after the load event (a slow dictionary) — a listener
        // registered now would never fire
        window.setTimeout(warmNeighbours, 400);
      } else {
        window.addEventListener('load', function () { window.setTimeout(warmNeighbours, 400); });
      }
    }

    // ── Scroll restore — come back to where you were ───────
    var SCROLL_KEY = 'bh_scroll_' + page;
    function saveScroll() {
      try { sessionStorage.setItem(SCROLL_KEY, String(window.scrollY || document.documentElement.scrollTop || 0)); } catch (e) { /* private mode */ }
    }
    window.addEventListener('pagehide', saveScroll);
    function restoreScroll() {
      if (location.hash) return;
      var s = null;
      try { s = sessionStorage.getItem(SCROLL_KEY); } catch (e) { /* private mode */ }
      // 'instant', not a plain scrollTo: html carries scroll-behavior: smooth, and
      // that applies to scripted scrolls too. With it, arriving at a page the
      // reader had scrolled painted the top and then glided ~500ms down to where
      // they had been — motion on top of the page move, which is exactly the kind
      // of thing that reads as a jolt. The destination should simply *be* at that
      // position when it appears.
      if (s) window.scrollTo({ top: parseInt(s, 10) || 0, left: 0, behavior: 'instant' });
    }
    // common.js calls this at parse time — not in boot(), which waits for the
    // dictionary. It arrives asynchronously, so restoring from there put the reader at the top
    // of the page, painted it, and then moved them down. common.js runs at the end
    // of the body, so the document already has its height and setting the
    // position here is part of the page's first paint instead of a correction.
    restoreScroll();

    function bindTrigger(ledgerBtn) {
      if (deck && typeof deck.showModal === 'function') {
        var compact = window.matchMedia('(max-width: 1799px)');
        function syncLedgerTrigger() {
          ledgerBtn.setAttribute('aria-controls', compact.matches ? 'page-deck' : 'ledger');
          ledgerBtn.setAttribute('aria-haspopup', compact.matches ? 'dialog' : 'true');
        }
        syncLedgerTrigger();
        compact.addEventListener('change', syncLedgerTrigger);
        function showCompactDeck(e) {
          if (!compact.matches) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          openDeck();
        }
        ledgerBtn.addEventListener('click', showCompactDeck);
        ledgerBtn.addEventListener('keydown', function (e) {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') showCompactDeck(e);
        });
      }
    }

    return { wire: wireDeck, bindTrigger: bindTrigger, scheduleWarm: scheduleWarm };
  }
  window.PageDeck = { create: create };
})();
