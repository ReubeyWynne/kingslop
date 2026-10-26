/* i18n.js — tiny dictionary loader for Bear Hunt, Demystified.
   Loads i18n/<lang>.js (a one-line JS wrapper around a JSON body)
   via <script> tags, applies it to the [data-i18n*] attributes,
   drives the topbar language switcher, and exposes window.I18N for
   common.js (locale-aware number formatting, translated easter eggs).
   Script tags are not CORS-restricted, so dictionaries load even
   when the page is opened directly from disk (file://) — no server,
   no CORS errors. No dependencies, no data collected. */
(function () {
  'use strict';

  // The dictionaries live in /i18n/ at the site root, but this file is
  // loaded from any page depth (/, /bear-hunt/, …). Resolve the directory
  // from the loader's own URL rather than the document, so every page
  // finds the same /i18n/<code>.js — a document-relative "i18n/…" path
  // would 404 from the event subdirectories.
  function dictBase() {
    var s = document.currentScript;
    var src = s && s.src;
    if (!src) {
      var tags = document.getElementsByTagName('script');
      for (var i = 0; i < tags.length; i++) {
        if ((tags[i].src || '').indexOf('i18n.js') !== -1) { src = tags[i].src; break; }
      }
    }
    // This loader now lives in js/ at the site root, one level below the
    // dictionaries — strip ".../js/i18n.js" back to the site root so every
    // page finds the same /i18n/<code>.js.
    return src ? src.replace(/\/js\/i18n\.js[^/]*$/, '/') : '';
  }
  var DICT_BASE = dictBase();

  var KEY = 'bh_lang';
  var LOCALES = { en: 'en-GB', es: 'es-ES', 'pt-BR': 'pt-BR', de: 'de-DE', fr: 'fr-FR', it: 'it-IT', ru: 'ru-RU', pl: 'pl-PL', tr: 'tr-TR', 'zh-Hans': 'zh-Hans-CN', 'zh-Hant': 'zh-Hant-TW', ko: 'ko-KR', ja: 'ja-JP', th: 'th-TH', id: 'id-ID', vi: 'vi-VN', ar: 'ar-u-nu-latn' };
  // RTL languages (Arabic is the first). Default stays LTR.
  var DIRS = { ar: 'rtl' };

  var lang = window.__BH_LANG || 'en';
  var t = {};                 // active dictionary
  var ready = false;
  var pending = [];

  function tr(key, fallback) {
    return (t && t[key] != null) ? t[key] : fallback;
  }

  // Substitution for template keys. `{n}` comes from the element's own
  // data-i18n-n (rewards.forgeAria and friends). Every other token comes from
  // the value provider named by data-i18n-vars (js/bind.js), which is read at
  // paint time and never cached — so a live figure can sit inside a translated
  // sentence while the dictionary carries neither its value nor an id.
  function varsFor(name) {
    var reg = window.__BH_VARS;
    return (reg && typeof reg[name] === 'function') ? reg[name]() : null;
  }

  function substitute(str, el) {
    if (str.indexOf('{') === -1) return str;
    var vals = { n: el.getAttribute('data-i18n-n') || '' };
    var group = el.getAttribute('data-i18n-vars');
    if (group) {
      var provided = varsFor(group);
      if (provided) {
        for (var k in provided) {
          if (Object.prototype.hasOwnProperty.call(provided, k)) vals[k] = provided[k];
        }
      }
    }
    var out = str;
    for (var key in vals) {
      if (!Object.prototype.hasOwnProperty.call(vals, key)) continue;
      if (out.indexOf('{' + key + '}') === -1) continue;
      out = out.replace(new RegExp('\\{' + key + '\\}', 'g'), vals[key]);
    }
    return out;
  }

  // Two strings are the same if they differ only in the whitespace the source
  // file needed and the dictionary string did not. Comparing this way lets the
  // common case do nothing at all: the HTML fallback is the English copy, so
  // for an English reader every assignment below would be a no-op rewrite —
  // except that rewriting a node is never free. The dictionary arrives after
  // the page has painted, so each assignment is a post-paint mutation that
  // reflows the reader's screen; measured on the arrivals, that was 174
  // mutations and two layout shifts happening after first paint, which is
  // visible as the text twitching just as the page appears.
  function same(a, b) {
    function norm(s) { return String(s).replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim(); }
    return norm(a) === norm(b);
  }

  var KEYSEL = '[data-i18n], [data-i18n-html], [data-i18n-key]';

  function applyNode(el) {
    var key = el.getAttribute('data-i18n-html') || el.getAttribute('data-i18n') || el.getAttribute('data-i18n-key');
    if (!key || t[key] == null) return;
    var val = substitute(t[key], el);
    var attrList = el.getAttribute('data-i18n-attr');
    if (attrList) {
      var attrs = attrList.split(/\s+/);
      for (var a = 0; a < attrs.length; a++) {
        if (attrs[a] && el.getAttribute(attrs[a]) !== val) el.setAttribute(attrs[a], val);
      }
      return; // attribute-only elements keep their own text (options, ❦, svg…)
    }
    if (el.hasAttribute('data-i18n-html')) {
      if (!same(el.innerHTML, val)) el.innerHTML = val;
    } else if (el.hasAttribute('data-i18n')) {
      if (!same(el.textContent, val)) el.textContent = val;
    }
  }

  function apply() {
    var nodes = document.querySelectorAll(KEYSEL);
    for (var i = 0; i < nodes.length; i++) applyNode(nodes[i]);
    document.documentElement.lang = lang;
    document.documentElement.dir = DIRS[lang] || 'ltr';
  }

  // Repaint the region a group owns (js/bind.js) after its inputs moved: the
  // tokens are re-read from the provider, so the figures follow the inputs
  // without re-walking the document — and without any code holding a reference
  // to a node a repaint is about to replace.
  function refresh(root) {
    if (!root || root === document) { apply(); return; }
    if (root.nodeType === 1 && root.matches && root.matches(KEYSEL)) applyNode(root);
    var nodes = root.querySelectorAll ? root.querySelectorAll(KEYSEL) : [];
    for (var i = 0; i < nodes.length; i++) applyNode(nodes[i]);
  }

  // The dictionary is the same URL on every page of a language, so it must be
  // cacheable: it is the heaviest thing a page pulls (73 KB of English, more
  // in other languages) and it sits behind i18n.js in the queue, so an
  // uncached dictionary is most of the wait between two pages. Pinned to the
  // build stamp (window.__BH_BUILD, set by the layout) the browser downloads
  // it once per language per deploy, and every page after that is a hit.
  // Opened locally — localhost or file:// — the stamp is dropped for a
  // per-request one, so a dictionary edit is never hidden by the cache.
  function dictURL(code) {
    var local = location.protocol === 'file:' ||
      /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(location.hostname);
    var stamp = local ? '_=' + Date.now()
      : (window.__BH_BUILD ? 'v=' + window.__BH_BUILD : '');
    return DICT_BASE + 'i18n/' + code + '.js' + (stamp ? '?' + stamp : '');
  }

  function loadDict(code, done) {
    var s = document.createElement('script');
    s.src = dictURL(code);
    s.onload = function () {
      t = (window.__BH_I18N_DATA && window.__BH_I18N_DATA[code]) || {};
      done(true);
    };
    s.onerror = function () {
      // Leave `t` alone: the caller decides what a missing dictionary means,
      // and the page must never be left holding an empty one.
      done(false);
    };
    document.head.appendChild(s);
  }

  function dispatch(name) {
    var evt = document.createEvent('Event');
    evt.initEvent(name, false, false);
    document.dispatchEvent(evt);
  }

  function finish() {
    ready = true;
    var i;
    for (i = 0; i < pending.length; i++) pending[i]();
    pending = [];
    dispatch('i18n:ready');
    dispatch('i18n:change');
  }

  function switchTo(code) {
    if (!code || (code === lang && ready)) return;
    var wasLang = lang;
    var wasDict = t;
    lang = code;
    document.documentElement.lang = lang;
    document.documentElement.dir = DIRS[lang] || 'ltr';
    loadDict(lang, function (ok) {
      if (!ok) {
        // The dictionary never arrived. A page whose copy is in one language
        // while <html lang> and the number formatter claim another is worse
        // than not switching: put everything back and leave the reader's saved
        // choice untouched, so the next page load can try again.
        lang = wasLang;
        t = wasDict;
        apply();
        dispatch('i18n:change');
        return;
      }
      try { localStorage.setItem(KEY, lang); } catch (e) { /* private mode */ }
      apply();
      dispatch('i18n:change');
    });
  }

  // Public API for app.js. Getters keep lang/locale/t live across switches.
  window.I18N = {
    get lang() { return lang; },
    get locale() { return LOCALES[lang] || lang; },
    get t() { return t; },
    tr: tr,
    switchTo: switchTo,
    refresh: refresh,
    onReady: function (cb) { if (ready) cb(); else pending.push(cb); }
  };

  loadDict(lang, function (ok) {
    if (!ok && lang !== 'en') {
      // This page falls back to English — the HTML fallback IS the English
      // copy — but the reader's saved language stays as they chose it, so the
      // next page load tries again instead of silently changing their mind.
      lang = 'en';
    }
    apply();
    finish();
  });
})();
