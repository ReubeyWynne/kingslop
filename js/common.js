/* common.js — shared chrome for every page (home, bear-hunt, vikings-vengeance,
   swordland-showdown, vip-calculator).
   The pages are fully readable without this file; it only adds a scroll progress
   bar, section highlighting, the cracktro depth pull (front layer), the language
   picker, the event switcher, keyboard/swipe navigation between events, and a
   functional toast for genuine feedback (e.g. copy confirmation). It also warms
   two neighbouring pages once the browser is idle, so a swipe (or an arrow
   key) lands on a page that is already in cache — the cross-document view
   transition that carries the move is in css/events.css. A committed swipe
   hands the frame straight to that move: the card under the finger is the
   destination's cover, the two documents cross-fade through each other, and
   nothing is drawn in between. No dependencies, no data collected.
   i18n: all user-visible strings come from i18n/<lang>.js via window.I18N;
   numbers format per the active locale. Page-specific toys register through
   window.BH.registerPage(...) and live in the per-page files (bear-hunt.js,
   vikings.js, swordland.js, kvk.js, vip.js). */
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
    if (t && t.closest && t.closest('input, select, textarea, [contenteditable], #lang-menu, #lang-btn, #ledger, #toc')) return;
    var url = neighbor(e.key === 'ArrowLeft' ? -1 : 1);
    if (url) { e.preventDefault(); window.location.href = url; }
  });

  // Swipe: full-page horizontal drag with a preview panel and a commit bar.
  // Horizontal intent requires |dx| > |dy| before the peek activates, so
  // reading a long page never triggers it (overscroll-behavior-x: none in
  // events.css keeps the browser's edge-swipe from fighting us). Drags
  // starting on form controls or the TOC rail are ignored. The preview
  // follows the finger in both directions: past ~14% of the viewport it
  // springs fully open so its content is readable, and it stays fully in
  // only while the finger holds it there — pull back and it re-parks at
  // the finger. Committing is deliberate and positional: releasing while
  // still holding at/past ~38% navigates; every other release springs
  // back, so short or fast drags never navigate on their own.
  //
  // What a commit does is a dissolve, not a turn. The card the finger was
  // holding is the destination's own cover and it is already on screen; the
  // release hands the frame to the page move, which cross-fades this document
  // into the next with the card riding along inside it, and the arriving page
  // is told so by one flag (bh:fold → data-entry="fold", stamped by
  // head.html). Nothing is drawn in between — see the fold rules in
  // css/events.css for why a drawn frame is exactly what flashed.
  var peek = null;
  var peekMain = null;
  var peekHint = null;
  // OPEN_FRAC: how far the finger must travel (fraction of viewport width)
  // before the preview springs fully open — the content is readable long
  // before the release point. COMMIT_FRAC: releasing while still holding
  // at/past this navigates; any release below it springs back.
  var OPEN_FRAC = 0.14;
  var COMMIT_FRAC = 0.38;
  // FAILSAFE: a committed swipe must never leave the reader holding a card
  // over a page that did not move (a dead link, a load they stopped).
  var FAILSAFE = 1500;
  var committing = false;
  // g.opened is a live view of "the finger is at/past OPEN_FRAC right now",
  // recomputed on every move — never a one-way latch.
  var g = { startX: null, startY: null, active: false, opened: false, dir: 0 };
  var peekHintText = '';

  function makePeek() {
    peek = document.createElement('div');
    peek.className = 'swipe-peek';
    peek.setAttribute('aria-hidden', 'true');
    peek.innerHTML =
      '<span class="peek-kicker"></span>' +
      '<h3 class="peek-title"></h3>' +
      '<p class="peek-lede"></p>' +
      '<span class="peek-hint"></span>';
    document.body.appendChild(peek);
    peekMain = document.querySelector('main');
    peekHint = peek.querySelector('.peek-hint');
  }

  function peekData(dir) {
    var d = document.documentElement;
    var p = dir === 1 ? 'next' : 'prev';
    return {
      url: d.getAttribute('data-' + p + '-url') || '',
      page: d.getAttribute('data-' + p + '-page') || '',
      title: d.getAttribute('data-' + p + '-title') || '',
      lede: d.getAttribute('data-' + p + '-lede') || '',
      kicker: dir === 1 ? tr('ev.peek.next', 'next event') : tr('ev.peek.prev', 'previous event')
    };
  }

  function setPeekHint(text) {
    if (!peekHint || peekHintText === text) return;
    peekHintText = text;
    peekHint.textContent = text;
  }

  function showPeek(dir) {
    if (!peek) makePeek();
    var d = peekData(dir);
    peek.className = 'swipe-peek ' + (dir === 1 ? 'next' : 'prev');
    // The panel wears the destination page's theme (events.css groups the
    // page-theme tokens with .swipe-peek[data-page=…]) so the card reads as
    // the page being navigated to, not the page you're on.
    if (d.page) peek.setAttribute('data-page', d.page);
    else peek.removeAttribute('data-page');
    peek.querySelector('.peek-kicker').textContent = d.kicker;
    peek.querySelector('.peek-title').textContent = d.title;
    peek.querySelector('.peek-lede').textContent = d.lede;
    setPeekHint(tr('ev.peek.dismiss', 'pull back to dismiss'));
    document.body.classList.add('swiping');
  }

  function positionPeek(dx) {
    if (!peek) return;
    // The panel is parked off-screen (translateX ±100%); the finger pulls it
    // toward full reveal with slight resistance, capped so it never blocks.
    var px = dx * 0.7;
    if (g.dir === 1) {
      peek.style.transform = 'translateX(calc(100% + ' + Math.min(0, px) + 'px))';
    } else {
      peek.style.transform = 'translateX(calc(-100% + ' + Math.max(0, px) + 'px))';
    }
  }

  function openPeek() {
    if (!peek) return;
    // Spring the preview fully open — readable well before the natural
    // release point. Fires only on a clean crossing into the open zone,
    // while the finger holds at/past OPEN_FRAC. If the finger pulls back
    // below it, touchmove drops .snap and re-parks the panel at the
    // finger, so the spring never fights a reversal.
    peek.classList.add('snap');
    peek.style.transform = 'translateX(0)';
  }

  function parallaxMain(dx) {
    if (peekMain) peekMain.style.transform = 'translateX(' + (dx * 0.12) + 'px)';
  }

  function resetPeek() {
    // Add the spring (events.css .snap transition), clear the drag transform,
    // then drop the class once the spring has settled.
    if (peek) { peek.classList.add('snap'); peek.style.transform = ''; }
    if (peekMain) { peekMain.classList.add('snap'); peekMain.style.transform = ''; }
    document.body.classList.remove('swiping');
    setTimeout(function () {
      if (peek) peek.classList.remove('snap');
      if (peekMain) peekMain.classList.remove('snap');
    }, 400);
  }

  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    // A committed swipe has already left the reader's hand: the cover is on
    // its way to the frame and the navigation follows it, so a stray finger
    // in that window must not start a second drag on top.
    if (committing) return;
    var t = e.target;
    if (t && t.closest && t.closest('input, select, textarea, [contenteditable], #ledger, #toc')) return;
    var touch = e.touches[0];
    g.startX = touch.clientX;
    g.startY = touch.clientY;
    g.active = false;
    g.opened = false;
    g.dir = 0;
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (g.startX === null) return;
    var touch = e.touches[0];
    var dx = touch.clientX - g.startX;
    var dy = touch.clientY - g.startY;
    if (!g.active) {
      if (Math.abs(dx) < 10) return;
      if (Math.abs(dy) > Math.abs(dx)) { g.startX = null; return; } // vertical intent
      g.dir = dx < 0 ? 1 : -1;
      if (!neighbor(g.dir)) { g.startX = null; return; } // nowhere to go
      g.active = true;
      showPeek(g.dir);
      // A leftover release spring (resetPeek clears .snap after 400 ms) must
      // never rubber-band a drag that starts inside that window.
      if (peek) peek.classList.remove('snap');
      if (peekMain) peekMain.classList.remove('snap');
    }
    if (g.active) {
      e.preventDefault(); // horizontal drag: never a click, never a scroll
      var vw = document.documentElement.clientWidth || window.innerWidth;
      // Drive the preview from the live drag, in both directions, at every
      // stage. "opened" means "|dx| is at/past OPEN_FRAC right now": while
      // the finger holds there the panel stays fully in; pulling back below
      // re-parks it at the finger instead of leaving it locked open.
      if (Math.abs(dx) >= vw * OPEN_FRAC) {
        if (!g.opened) { g.opened = true; openPeek(); }
      } else {
        if (g.opened) {
          g.opened = false;
          // Reversal: drop the spring so the panel snaps back to the finger
          // instantly — the transition must never fight the pull-back.
          if (peek) peek.classList.remove('snap');
          if (peekMain) peekMain.classList.remove('snap');
        }
        positionPeek(dx);
      }
      parallaxMain(dx);
      setPeekHint(Math.abs(dx) >= vw * COMMIT_FRAC
        ? tr('ev.peek.release', 'release to open')
        : tr('ev.peek.dismiss', 'pull back to dismiss'));
    }
  }, { passive: false });

  function finishDrag(e) {
    if (!g.active) { g.startX = null; return; }
    var touch = e.changedTouches[0];
    var dx = touch.clientX - g.startX;
    var vw = document.documentElement.clientWidth || window.innerWidth;
    // Position-only, held-on-release commit: navigate only when the finger
    // lifts while still at/past the commit bar. Any release below it —
    // however fast the flick — springs back via resetPeek, so a short swipe
    // can never navigate, and pulling back before lifting always cancels.
    var url = Math.abs(dx) >= vw * COMMIT_FRAC ? neighbor(g.dir) : '';
    if (url) {
      // The card has done its work: it is the destination's cover, it is
      // already on screen, and the reader has just told us to take it. So
      // nothing else is drawn — the page move cross-fades this document into
      // the next one with the card riding along inside it (css/events.css,
      // data-entry="fold"), and the reader watches the cover they were holding
      // dissolve into the page it was promising.
      //
      // The earlier version spread that cover to the whole frame first, and
      // that is what made the move flash: a full-frame cover is a flat field
      // about 40% darker than either page, so the screen dimmed and came back
      // over ~660ms of layered motion. Both pages are the same night; fading
      // one into the other is nearly invisible by comparison.
      //
      // The flag is this page's own address, left for the arriving page to
      // read once and delete — the one thing the move needs to say.
      committing = true;
      try { sessionStorage.setItem('bh:fold', location.href.split(/[?#]/)[0]); } catch (err) { /* private mode: the move falls back to the plain one */ }
      // The page behind the card was pulled off its rest position by the drag
      // (parallaxMain), and this document is about to become the outgoing half
      // of a cross-fade: left where the finger put it, its text would sit a
      // dozen-odd pixels off the incoming page's for the whole dissolve, which
      // reads as a smear rather than a dissolve. So it settles on the same
      // spring the card does, under cover of the fade.
      if (peekMain) { peekMain.classList.add('snap'); peekMain.style.transform = ''; }
      window.location.href = url;
      // Only the failure path reaches this: the reader keeps the page they
      // were on rather than a card held over a page that never moved.
      window.setTimeout(function () { committing = false; resetPeek(); }, FAILSAFE);
    } else {
      resetPeek();
    }
    g.startX = null;
    g.active = false;
    g.opened = false;
    g.dir = 0;
  }
  document.addEventListener('touchend', finishDrag, { passive: true });
  document.addEventListener('touchcancel', function () {
    if (g.active) { resetPeek(); g.startX = null; g.active = false; g.opened = false; g.dir = 0; }
  }, { passive: true });
  // A back gesture can hand this very document back out of bfcache, fold and
  // all — the turn happened on a page the reader has since left, so the page
  // they return to must be whole and ready for the next swipe.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    committing = false;
    if (peek) peek.style.removeProperty('--fold');
    resetPeek();
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
    wireTopbar();
    // Event chrome — the preview panel and swipe handles are created lazily
    // on the first drag; no persistent affordances, so nothing to wire.

    // Language change: let the page repaint (BH.fmt reformats itself)
    document.addEventListener('i18n:change', function () {
      pageCfg.onChange();
    });

    // Page toys (calculators)
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
