/* common.js — shared chrome, page registration and the swipe-open page deck. */
(function () {
  'use strict';

  function getLocale() {
    return (window.I18N && window.I18N.locale) || 'en-GB';
  }
  function tr(key, fallback) {
    return (window.I18N && window.I18N.tr) ? window.I18N.tr(key, fallback) : fallback;
  }

  // A count inside a sentence needs a form for none and one as well as many —
  // "1 days from today" and "0 days from today" are both wrong. Dictionaries
  // carry `<key>Today` and `<key>One` beside the plural `<key>`; fallbacks are
  // given in the same order (none, one, many) so an English default is always
  // right even before a translation adds the two branches. Missing keys fall
  // back to the plural, so calling this is never worse than calling tr().
  function trCount(key, n, fallbacks) {
    var i = n < 1 ? 0 : n === 1 ? 1 : 2;
    return tr(key + (i === 0 ? 'Today' : i === 1 ? 'One' : ''), fallbacks[i]);
  }

  var nf = null;
  var nfLocale = '';

  function fmt(n) {
    if (!isFinite(n)) return '\u2014';
    // Built on first use for the active locale rather than on i18n:change:
    // anything painting during the switch — a group's `{tokens}`, resolved by
    // i18n.js before that event fires — must already format in the new locale.
    var loc = getLocale();
    if (loc !== nfLocale) { nf = new Intl.NumberFormat(loc); nfLocale = loc; }
    return nf.format(Math.round(n));
  }
  function mult(n) {
    return n.toLocaleString(getLocale(), { maximumFractionDigits: 1, minimumFractionDigits: 0 }) + '\u00D7';
  }

  // A translated sentence with live figures in it: `{token}` in the dictionary
  // value, the values here. One helper rather than a `.replace(/\{…\}/g, …)`
  // chain at each call site — several had dropped the /g or disagreed on
  // whether `{n}` should be locale-formatted, and the same helper is what
  // js/bind.js uses to paint a declared group.
  function fill(str, vars) {
    if (!vars || str.indexOf('{') === -1) return str;
    var out = str;
    for (var k in vars) {
      if (!Object.prototype.hasOwnProperty.call(vars, k)) continue;
      if (out.indexOf('{' + k + '}') === -1) continue;
      out = out.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
    }
    return out;
  }

  function tpl(key, fallback, vars) {
    return fill(tr(key, fallback), vars);
  }

  // ── Page registration ──────────────────────────────────
  // Page files call BH.registerPage({ boot, onChange }) before boot runs
  // (boot waits for the active dictionary, which loads asynchronously, or
  // for DOMContentLoaded when i18n is missing entirely). Page files supply
  // only what's theirs: their page toys.
  var pageCfg = {
    boot: function () {},
    onChange: function () {}
  };

  // A single parchment slip, reused — functional feedback only (e.g. the
  // copy confirmation on the Event Cycle page). Fixed bottom-centre so the
  // toast lands the same place every time.
  var note = null;
  function showNote(line) {
    if (note && note.parentNode) note.parentNode.removeChild(note);
    var el = document.createElement('div');
    note = el;
    el.className = 'egg-note';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = line;
    el.style.left = '0';
    el.style.right = '0';
    el.style.bottom = '24vh';
    el.style.margin = '0 auto';
    document.body.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 4400);
  }

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
  var position = 0;
  var step = 1;
  var frame = 0;
  var suppressUntil = 0;
  var returnFocus = null;
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var gesture = null;
  var wheelTimer = 0;
  var warmingCard = '';
  var navigatingDeck = false;
  var deckTheme = '';

  function wrap(n) { return (n % cards.length + cards.length) % cards.length; }

  function paintDeck() {
    var selected = wrap(Math.round(position));
    var selectedCard = cards[selected];
    var theme = selectedCard.getAttribute('data-page');
    if (theme !== deckTheme) {
      deckTheme = theme;
      var palette = window.getComputedStyle(selectedCard);
      deck.style.setProperty('--deck-accent', palette.getPropertyValue('--amber').trim());
      ['--amber', '--amber-dim', '--signal-line'].forEach(function (token) {
        deck.style.setProperty(token, palette.getPropertyValue(token).trim());
      });
      deck.setAttribute('data-selected-page', theme);
    }
    cards.forEach(function (card, i) {
      var delta = wrap(i - position + cards.length / 2) - cards.length / 2;
      var distance = Math.abs(delta);
      card.style.transform = 'translateX(calc(-50% + ' + (delta * step) + 'px)) scale(' + (1 - Math.min(distance, 2) * 0.065) + ')';
      card.style.opacity = String(Math.max(0, 1 - Math.max(0, distance - 1) * 0.65));
      card.style.zIndex = String(cards.length - Math.round(distance));
      card.classList.toggle('is-selected', i === selected);
      card.tabIndex = i === selected ? 0 : -1;
      card.inert = distance > 1.7;
    });
    groups.forEach(function (button) {
      button.setAttribute('aria-pressed', cards[selected].getAttribute('data-group') === button.getAttribute('data-deck-group') ? 'true' : 'false');
    });
  }

  function measureDeck() {
    if (!deck || !deck.open || !cards.length) return;
    step = cards[0].offsetWidth + Math.min(24, deck.clientWidth * 0.045);
    paintDeck();
  }

  function stopDeck() {
    var moving = !!frame;
    window.cancelAnimationFrame(frame);
    frame = 0;
    window.clearTimeout(wheelTimer);
    wheelTimer = 0;
    return moving;
  }

  function announceDeck() {
    var i = wrap(Math.round(position));
    var card = cards[i];
    deck.querySelector('.deck-position').textContent = card.querySelector('.deck-card-title').textContent + ' · ' + fmt(i + 1) + ' / ' + fmt(cards.length);
    var c = navigator.connection;
    if (warmingCard !== card.href && !(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || '')))) {
      warmingCard = card.href;
      if (!card.hasAttribute('aria-current')) warmNeighbour(card.href);
    }
  }

  function settleDeck(target, velocity, focusCard) {
    stopDeck();
    var from = position;
    var distance = target - from;
    function done() {
      frame = 0;
      position = wrap(target);
      paintDeck();
      announceDeck();
      if (focusCard) cards[wrap(Math.round(position))].focus({ preventScroll: true });
    }
    if (motion.matches || Math.abs(distance) < 0.001) { done(); return; }
    var duration = velocity && distance * velocity > 0
      ? 3 * Math.abs(distance / velocity)
      : 300;
    var began = performance.now();
    function tick(now) {
      var t = Math.min(1, (now - began) / duration);
      position = from + distance * (1 - Math.pow(1 - t, 3));
      paintDeck();
      if (t < 1) frame = window.requestAnimationFrame(tick);
      else done();
    }
    frame = window.requestAnimationFrame(tick);
  }

  function coastDeck(velocity) {
    stopDeck();
    if (motion.matches || Math.abs(velocity * step) < 0.18) {
      settleDeck(Math.round(position), 0);
      return;
    }
    var from = position;
    var decayTime = Math.min(400, Math.min(4, cards.length - 1) / Math.abs(velocity));
    var began = performance.now();
    function tick(now) {
      var decay = Math.exp(-(now - began) / decayTime);
      position = from + velocity * decayTime * (1 - decay);
      paintDeck();
      if (Math.abs(velocity * step * decay) > 0.08) frame = window.requestAnimationFrame(tick);
      else settleDeck(Math.round(position), velocity * decay);
    }
    frame = window.requestAnimationFrame(tick);
  }

  function openDeck() {
    if (!deck || !cards.length || typeof deck.showModal !== 'function') return false;
    if (deck.open) return true;
    returnFocus = document.activeElement;
    position = Math.max(0, cards.findIndex(function (card) { return card.hasAttribute('aria-current'); }));
    var ledger = document.getElementById('ledger');
    var ledgerBtn = document.getElementById('ledger-btn');
    var langMenu = document.getElementById('lang-menu');
    if (ledger) ledger.hidden = true;
    if (langMenu) langMenu.hidden = true;
    if (ledgerBtn) { ledgerBtn.setAttribute('aria-expanded', 'true'); ledgerBtn.classList.add('open'); }
    var langBtn = document.getElementById('lang-btn');
    if (langBtn) { langBtn.setAttribute('aria-expanded', 'false'); langBtn.classList.remove('open'); }
    navigatingDeck = false;
    deck.showModal();
    document.documentElement.classList.add('deck-open');
    measureDeck();
    announceDeck();
    return true;
  }

  function cleanDeck() {
    stopDeck();
    gesture = null;
    document.documentElement.classList.remove('deck-open');
    var btn = document.getElementById('ledger-btn');
    if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.classList.remove('open'); }
    if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }

  function closeDeck() {
    if (!deck || !deck.open) return;
    deck.close();
    cleanDeck();
  }

  function sampleGesture(x) {
    var now = performance.now();
    gesture.samples.push({ x: x, time: now });
    gesture.samples = gesture.samples.filter(function (sample) { return now - sample.time <= 100; });
  }

  document.addEventListener('touchstart', function (e) {
    if (!deck || !cards.length || e.touches.length !== 1) {
      if (gesture && gesture.active && deck.open) settleDeck(Math.round(position), 0);
      gesture = null;
      return;
    }
    var t = e.target;
    if (!deck.open && t.closest && t.closest('a, button, input, select, textarea, dialog, [role="dialog"], [contenteditable], #ledger, #toc, .toc, [role="slider"], [data-swipe-ignore]')) return;
    if (deck.open && t.closest && t.closest('button')) return;
    var caught = deck.open && stopDeck();
    if (caught) suppressUntil = performance.now() + 400;
    var touch = e.touches[0];
    gesture = { x: touch.clientX, y: touch.clientY, start: position, active: false, caught: caught, samples: [] };
    sampleGesture(touch.clientX);
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!gesture || e.touches.length !== 1) return;
    var touch = e.touches[0];
    var dx = touch.clientX - gesture.x;
    var dy = touch.clientY - gesture.y;
    sampleGesture(touch.clientX);
    if (!gesture.active) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;
      if (Math.abs(dy) >= Math.abs(dx)) {
        if (gesture.caught && deck.open) settleDeck(Math.round(position), 0);
        gesture = null;
        return;
      }
      if (Math.abs(dx) < Math.abs(dy) * 1.2) return;
      if (!deck.open) {
        if (!openDeck()) { gesture = null; return; }
        gesture.start = position;
      }
      gesture.active = true;
    }
    if (e.cancelable) e.preventDefault();
    position = gesture.start - dx / step;
    paintDeck();
  }, { passive: false });

  document.addEventListener('touchend', function (e) {
    if (!gesture) return;
    var g = gesture;
    sampleGesture(e.changedTouches[0].clientX);
    gesture = null;
    if (!g.active) {
      if (g.caught) { suppressUntil = performance.now() + 400; settleDeck(Math.round(position), 0); }
      return;
    }
    suppressUntil = performance.now() + 400;
    var first = g.samples[0];
    var last = g.samples[g.samples.length - 1];
    var elapsed = last.time - first.time;
    var velocity = elapsed > 0 ? -(last.x - first.x) / elapsed / step : 0;
    coastDeck(velocity);
  }, { passive: true });

  document.addEventListener('touchcancel', function () {
    if (gesture && deck.open) {
      suppressUntil = performance.now() + 400;
      settleDeck(Math.round(position), 0);
    }
    gesture = null;
  }, { passive: true });

  function wireDeck() {
    if (!deck || !cards.length || typeof deck.showModal !== 'function') return;
    deck.querySelector('.deck-close').addEventListener('click', closeDeck);
    deck.addEventListener('cancel', function (e) { e.preventDefault(); closeDeck(); });
    deck.addEventListener('close', cleanDeck);
    deck.addEventListener('click', function (e) {
      if (performance.now() < suppressUntil && e.detail !== 0) { e.preventDefault(); return; }
      var card = e.target.closest('.deck-card');
      if (card) {
        if (frame) { e.preventDefault(); stopDeck(); settleDeck(Math.round(position), 0); return; }
        if (card.hasAttribute('aria-current')) { e.preventDefault(); closeDeck(); return; }
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        navigatingDeck = true;
        document.documentElement.setAttribute('data-entry', 'deck');
        try { sessionStorage.setItem('bh:deck', new URL(card.href).pathname); } catch (err) {}
        return;
      }
      if (!e.target.closest('button')) closeDeck();
    });
    deck.addEventListener('keydown', function (e) {
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      var delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (delta) { e.preventDefault(); settleDeck(Math.round(position) + delta, 0, true); }
      else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        settleDeck(e.key === 'Home' ? 0 : cards.length - 1, 0, true);
      }
    });
    deck.querySelector('.deck-prev').addEventListener('click', function () { settleDeck(Math.round(position) - 1, 0); });
    deck.querySelector('.deck-next').addEventListener('click', function () { settleDeck(Math.round(position) + 1, 0); });
    groups.forEach(function (button) {
      button.addEventListener('click', function () {
        var i = cards.findIndex(function (card) { return card.getAttribute('data-group') === button.getAttribute('data-deck-group'); });
        var delta = wrap(i - position + cards.length / 2) - cards.length / 2;
        settleDeck(position + delta, 0);
      });
    });
    deck.querySelector('.deck-viewport').addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      stopDeck();
      position += e.deltaX * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? step : 1) / step;
      paintDeck();
      wheelTimer = window.setTimeout(function () { settleDeck(Math.round(position), 0); }, 120);
    }, { passive: false });
    window.addEventListener('resize', function () {
      if (!deck.open) return;
      gesture = null;
      stopDeck();
      position = Math.round(position);
      measureDeck();
      announceDeck();
    });
    motion.addEventListener('change', function () {
      if (deck.open && motion.matches) settleDeck(Math.round(position), 0);
    });
    document.addEventListener('i18n:change', function () {
      if (deck.open) { measureDeck(); announceDeck(); }
    });
  }

  window.addEventListener('pagehide', function () {
    if (deck && deck.open && !navigatingDeck) closeDeck();
  });
  window.addEventListener('pageshow', function (e) {
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
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var mine = {};
      [].slice.call(document.querySelectorAll('link[rel="stylesheet"][href], script[src]')).forEach(function (el) {
        mine[el.href || el.src] = true;   // links expose href, scripts src
      });
      [].slice.call(doc.querySelectorAll('link[rel="stylesheet"][href], script[src]')).forEach(function (el) {
        var abs;
        try { abs = new URL(el.getAttribute('href') || el.getAttribute('src'), url).href; } catch (e) { return; }
        if (abs.indexOf(location.origin + '/') !== 0 || mine[abs]) return;
        prefetch(abs, el.tagName === 'LINK' ? 'style' : 'script');
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
  // Here, at parse time — not in boot(). boot() waits for the dictionary, which
  // arrives asynchronously, so restoring from there put the reader at the top
  // of the page, painted it, and then moved them down. This file is the last
  // thing in the body, so the document already has its height and setting the
  // position here is part of the page's first paint instead of a correction.
  restoreScroll();

  // ── Chrome wiring ──────────────────────────────────────
  // One function per thing that happens to every page. Each runs once, on
  // boot, and touches only its own part of the document — so boot() reads as
  // the list of what runs, not as the place it all lives.

  // Scroll progress bar.
  function wireProgress() {
    var fill = document.getElementById('progress');
    var doc = document.documentElement;
    function paint() {
      if (!fill) return;
      var max = doc.scrollHeight - doc.clientHeight;
      // scaleX, not width: a percentage width dirties layout on every scroll
      // event, while a transform only moves an already-painted layer.
      fill.style.transform = 'scaleX(' + (max > 0 ? doc.scrollTop / max : 0) + ')';
    }
    window.addEventListener('scroll', paint, { passive: true });
    paint();
  }

  // TOC: mark the section at the read position, keep its chip in view, and let
  // the rail scroll sideways with the wheel.
  function wireToc() {
    var toc = document.getElementById('toc');
    var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.toc a'));
    var sections = tocLinks
      .map(function (a) { return document.querySelector(a.getAttribute('href')); })
      .filter(Boolean);

    function revealActive() {
      if (!toc) return;
      var active = toc.querySelector('a.active');
      if (!active) return;
      var r = toc.getBoundingClientRect();
      var a = active.getBoundingClientRect();
      if (a.left < r.left || a.right > r.right) {
        var rtl = document.documentElement.dir === 'rtl';
        var delta = rtl ? (a.right - r.right) : (a.left - r.left);
        var target = toc.scrollLeft + (rtl ? -delta : delta) - (toc.clientWidth - active.offsetWidth) / 2;
        toc.scrollTo({ left: target, behavior: 'smooth' });
      }
    }

    if (toc) {
      toc.addEventListener('wheel', function (e) {
        if (toc.scrollWidth > toc.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          toc.scrollLeft += (document.documentElement.dir === 'rtl' ? -1 : 1) * e.deltaY;
        }
      }, { passive: false });
    }

    if ('IntersectionObserver' in window && tocLinks.length && sections.length) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var id = entry.target.id;
            tocLinks.forEach(function (a) {
              a.classList.toggle('active', a.getAttribute('href') === '#' + id);
            });
            revealActive();
          }
        });
      }, { rootMargin: '-20% 0px -70% 0px' });
      sections.forEach(function (s) { io.observe(s); });
    }
  }

  // Cracktro depth pull — the section at the read position is the FRONT
  // layer: it alone gets the caret and full brightness. Same observer
  // geometry as the TOC, so the front layer is always the active section.
  function wireFrontLayer() {
    var contentSections = Array.prototype.slice.call(document.querySelectorAll('main .section'));
    if (!('IntersectionObserver' in window) || !contentSections.length) return;
    var front = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          contentSections.forEach(function (s) { s.classList.remove('front'); });
          entry.target.classList.add('front');
        }
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    contentSections.forEach(function (s) { front.observe(s); });
    var hero = document.querySelector('main .hero');
    if (hero) hero.classList.add('front');
  }

  // Home — hover (or focus) an event card and the page previews that event's
  // world: events.css animates every themed token into the destination palette
  // and the dust dissolves into its motes. The ghost card carries no
  // data-hover-page, so it never shifts anything.
  function wireHomePreview() {
    var rootEl = document.documentElement;
    Array.prototype.slice.call(document.querySelectorAll('.event-card[data-hover-page]'))
      .forEach(function (card) {
        var hoverPage = card.getAttribute('data-hover-page');
        function on() { rootEl.setAttribute('data-hover', hoverPage); }
        function off() { rootEl.removeAttribute('data-hover'); }
        card.addEventListener('mouseenter', on);
        card.addEventListener('mouseleave', off);
        card.addEventListener('focusin', on);
        card.addEventListener('focusout', off);
      });
  }

  // ── The two topbar disclosures ─────────────────────────
  // The language dropdown and the ledger drawer are one widget: a trigger
  // that opens a panel, aria-expanded on the trigger, hidden on the panel,
  // focus into the list and back to the trigger, arrows within it, Esc and
  // outside-click to close. Only what a row *means* differs — the picker
  // chooses a language, the ledger follows a link — so that is the one thing
  // each caller supplies.
  function disclosure(btn, panel, opts) {
    var items = Array.prototype.slice.call(panel.querySelectorAll(opts.items));
    var open = false;

    function set(now, focusList) {
      open = now;
      btn.setAttribute('aria-expanded', now ? 'true' : 'false');
      panel.hidden = !now;
      btn.classList.toggle('open', now);
      if (now && focusList && items.length) {
        (opts.initial() || items[0]).focus();
      }
    }

    btn.addEventListener('click', function () { set(!open, true); });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        set(true, true);
      }
    });
    panel.addEventListener('keydown', function (e) {
      var i = items.indexOf(document.activeElement);
      if (i === -1) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[(i + 1) % items.length].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[(i + items.length - 1) % items.length].focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        set(false);
        btn.focus();
      } else if (opts.activate && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        opts.activate(items[i]);
      }
    });
    if (opts.activate) {
      panel.addEventListener('click', function (e) {
        var item = e.target.closest(opts.items);
        if (item) opts.activate(item);
      });
    }
    document.addEventListener('click', function (e) {
      if (open && !btn.contains(e.target) && !panel.contains(e.target)) set(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open) {
        set(false);
        btn.focus();
      }
    });

    return { close: function () { set(false); }, items: items };
  }

  // The topbar's own two: the language picker (a flag dropdown, so real flags
  // render everywhere — Windows shows letter-pairs instead of flag emojis) and
  // the ledger (the ❧ directory drawer; its rows are links, so they navigate
  // on their own).
  function wireTopbar() {
    var langBtn = document.getElementById('lang-btn');
    var langMenu = document.getElementById('lang-menu');
    if (langBtn && langMenu) {
      function syncPicker() {
        var current = (window.I18N && window.I18N.lang) || 'en';
        var active = null;
        picker.items.forEach(function (opt) {
          var isSel = opt.getAttribute('data-lang') === current;
          opt.setAttribute('aria-selected', isSel ? 'true' : 'false');
          if (isSel) active = opt;
        });
        if (active) {
          var old = langBtn.querySelector('.flag');
          var fresh = active.querySelector('.flag').cloneNode(true);
          if (old && old.parentNode === langBtn) langBtn.replaceChild(fresh, old);
        }
      }

      function pick(code) {
        picker.close();
        langBtn.focus();
        if (window.I18N && typeof window.I18N.switchTo === 'function') {
          window.I18N.switchTo(code);
        } else {
          syncPicker();
        }
      }

      var picker = disclosure(langBtn, langMenu, {
        items: '[role="option"]',
        initial: function () { return langMenu.querySelector('[aria-selected="true"]'); },
        activate: function (opt) { pick(opt.getAttribute('data-lang')); }
      });
      document.addEventListener('i18n:change', syncPicker);
      syncPicker();
    }

    var ledgerBtn = document.getElementById('ledger-btn');
    var ledger = document.getElementById('ledger');
    if (ledgerBtn && ledger) {
      if (deck && typeof deck.showModal === 'function') {
        var compact = window.matchMedia('(max-width: 1439px)');
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
      disclosure(ledgerBtn, ledger, {
        items: 'a',
        initial: function () { return ledger.querySelector('a.active'); }
      });
    }
  }

  // ── Boot — everything above is inert until the active dictionary is
  //    applied (i18n.js loads first), or the DOM is ready without i18n. ──
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

    document.addEventListener('click', function (event) {
      var link = event.target.closest && event.target.closest('a[href^="#"]');
      if (link) openHash(link.getAttribute('href'));
    });

    window.addEventListener('hashchange', function () {
      openHash(window.location.hash);
    });
  }

  function boot() {
    wireSections();
    wireProgress();
    wireToc();
    wireFrontLayer();
    wireHomePreview();
    wireDeck();
    wireTopbar();

    // Language change: let the page repaint (BH.fmt reformats itself)
    document.addEventListener('i18n:change', function () {
      pageCfg.onChange();
      if (window.Interactions) window.Interactions.refresh();
    });

    // Page toys (calculators)
    if (window.Interactions) window.Interactions.start(BH);
    pageCfg.boot(BH);

    // The page in front of the reader is whole now — only then spend bytes on
    // the pages the swipe can reach (see "Neighbour warm-up" above).
    scheduleWarm();
  }

  var BH = {
    get page() { return page; },
    fmt: fmt,
    mult: mult,
    tr: tr,
    trCount: trCount,
    tpl: tpl,
    fill: fill,
    showNote: showNote,
    modules: window.Interactions,
    registerPage: function (cfg) {
      if (!cfg) return;
      if (cfg.boot) pageCfg.boot = cfg.boot;
      if (cfg.onChange) pageCfg.onChange = cfg.onChange;
    }
  };
  window.BH = BH;

  if (window.I18N) {
    window.I18N.onReady(boot);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    setTimeout(boot, 0);
  }
})();

