(function () {
  'use strict';
  function create(navigation) {
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
          // Script-set smooth scrolling ignores the reduced-motion CSS, so ask.
          var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          toc.scrollTo({ left: target, behavior: still ? 'auto' : 'smooth' });
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
    // Number format, beside the language: Automatic, then each culture named in
    // the page's language with a sample of how it writes numbers.
    var NUMBER_LOCALES = ['en-GB', 'en-US', 'en-IN', 'es-ES', 'es-MX', 'pt-BR', 'de-DE', 'fr-FR', 'it-IT', 'ru-RU', 'pl-PL', 'tr-TR', 'zh-Hans-CN', 'zh-Hant-TW', 'ko-KR', 'ja-JP', 'th-TH', 'id-ID', 'vi-VN', 'ar-u-nu-latn', 'ar-EG'];
    function wireNumbers(select) {
      var I = window.I18N;
      if (!select || !I || typeof I.setNumbers !== 'function') return;
      function sample(code) { try { return new Intl.NumberFormat(code).format(1234567.89); } catch (e) { return ''; } }
      function named(code) {
        try { return new Intl.DisplayNames([I.lang], { type: 'language' }).of(code.replace(/-u-.*$/, '')) || code; } catch (e) { return code; }
      }
      function fill() {
        var list = NUMBER_LOCALES.slice(), browser = I.autoLocale();
        if (list.indexOf(browser) === -1) list.unshift(browser);
        var options = [['auto', I.tr('ui.numbers.auto', 'Automatic') + ' · ' + sample(browser)]].concat(list.map(function (code) { return [code, named(code) + ' · ' + sample(code)]; }));
        select.textContent = '';
        options.forEach(function (o) {
          var option = document.createElement('option');
          option.value = o[0]; option.textContent = o[1];
          select.appendChild(option);
        });
        select.value = I.numbers;
        if (select.value !== I.numbers) select.value = 'auto';
      }
      select.addEventListener('change', function () { I.setNumbers(select.value); });
      document.addEventListener('i18n:change', fill);
      fill();
    }

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
        wireNumbers(document.getElementById('number-format'));
      }

      var ledgerBtn = document.getElementById('ledger-btn');
      var ledger = document.getElementById('ledger');
      if (ledgerBtn && ledger) {
        navigation.bindTrigger(ledgerBtn);
        disclosure(ledgerBtn, ledger, {
          items: 'a',
          initial: function () { return ledger.querySelector('a.active'); }
        });
      }
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

      document.addEventListener('click', function (event) {
        var link = event.target.closest && event.target.closest('a[href^="#"]');
        if (link) openHash(link.getAttribute('href'));
      });

      window.addEventListener('hashchange', function () {
        openHash(window.location.hash);
      });
    }

    return { wireSections: wireSections, wireProgress: wireProgress, wireToc: wireToc, wireFrontLayer: wireFrontLayer, wireTopbar: wireTopbar };
  }
  window.PageChrome = { create: create };
})();
