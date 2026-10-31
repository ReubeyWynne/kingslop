/* common.js — shared formatting, page registration and boot order. */
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
  // A big amount in the reader's own short form: 1.58B, 1,58 Mrd., 15.8億, 15.8亿.
  // Below a million the full figure is short enough and stays exact.
  var cf = null, cfLocale = '';
  function compact(n) {
    if (!isFinite(n) || Math.abs(n) < 1e6) return fmt(n);
    var loc = getLocale();
    if (loc !== cfLocale) { cf = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 2 }); cfLocale = loc; }
    return cf.format(n);
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

  var page = document.documentElement.getAttribute('data-page') || 'home';
  var navigation = window.PageDeck.create({ fmt: fmt });
  var chrome = window.PageChrome.create(navigation);

  function boot() {
    chrome.wireSections();
    chrome.wireProgress();
    chrome.wireToc();
    chrome.wireFrontLayer();
    navigation.wire();
    chrome.wireTopbar();

    // Language change: let the page repaint (BH.fmt reformats itself)
    document.addEventListener('i18n:change', function () {
      pageCfg.onChange();
      if (window.Interactions) window.Interactions.refresh();
    });

    // Page toys (calculators)
    if (window.Interactions) window.Interactions.start(BH);
    pageCfg.boot(BH);

    // The page in front of the reader is whole now — only then spend bytes on
    // the pages the swipe can reach (page-deck.js).
    navigation.scheduleWarm();
  }

  var BH = {
    get page() { return page; },
    fmt: fmt,
    compact: compact,
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
    window.I18N.onReady(function () {
      // Page scripts must configure dependencies and register before discovery.
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
      else boot();
    });
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    setTimeout(boot, 0);
  }
})();
