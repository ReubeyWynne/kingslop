/* One guest mode and share link for every calculator (see INTERACTIONS.md, "Sheets").

   Without a link a calculator works on the player's save, and edits save as they go. A link
   carrying the page's own query keys, ?guest, or Start blank puts the page on a sheet: an
   in-memory copy of the ledger that the address keeps carrying and that only "Save as mine"
   writes back. The page describes its link once, before the page's modules mount:

     PageSheet.define({
       keys: ['gov', 'bag'],                 // the query keys its link owns (old ones too)
       read: function (search) {},           // a sheet, { invalid: true }, or null without a link
       write: function (sheet) {},           // { key: 'encoded value' } for the address
       blank: function () {},                // a sheet with nothing on it
       of: function (store) {},              // the sheet a store holds
       load: function (store, sheet, mine) {}, // put a sheet into a store; mine when it is your save
       same: function (sheet, own) {}        // optional: does the sheet match your save
     });

   and marks up the notice, tools and confirm dialog from _includes/page-sheet.html. They bind
   to the Alpine store $store.sheet, which keeps the address in step, copies the link, and
   saves, loads or blanks the sheet. */
(function (root) {
  'use strict';
  var Ledger = root.PlayerLedger, config = null, sheet = null, memo = null, repaint = [];
  var EN = {
    sourceLink: 'A shared sheet.', sourceSame: 'Your save.', sourceBlank: 'A blank sheet.', sourceChanged: 'Changed on this page only.',
    untouched: 'Your save is untouched.', saveHint: 'Edits here stay on this page until you save them.',
    linkInvalid: 'That link could not be read, so this is a copy of your save.',
    copy: 'Copy share link', copied: 'Link copied', liveHint: 'Changes save as you go.'
  };

  function query(encoded) { return Object.keys(encoded).filter(function (key) { return encoded[key] !== undefined && encoded[key] !== null && encoded[key] !== ''; }).map(function (key) { return key + '=' + encoded[key]; }).join('&'); }
  // Everything in the address that is not this page's link: a language, a mode, and ?guest
  // unless the caller is leaving guest mode.
  function kept(dropGuest) {
    var params = new URLSearchParams(location.search);
    config.keys.forEach(function (key) { params.delete(key); });
    if (dropGuest) params.delete('guest');
    return params.toString().replace(/(^|&)guest=(?=&|$)/, '$1guest');
  }
  function mineStore() { try { var own = Ledger.shared(); own.snapshot(); return own; } catch (ignored) { return null; } }
  function encoded(value) { return query(config.write(value)); }

  function define(options) {
    if (config) throw new Error('PageSheet is defined once per page');
    config = Object.assign({ same: function (a, b) { return encoded(a) === encoded(b); } }, options);
    var link = config.read(location.search), params = new URLSearchParams(location.search);
    sheet = {
      guest: params.has('guest') || !!link,
      link: link && !link.invalid ? link : null,
      invalid: !!(link && link.invalid),
      // The store the page works on: your save, or the sheet's own copy.
      store: function () { return sheet.guest ? guestStore() : Ledger.shared(); },
      // The link carries the sheet and whatever else the address holds for the page (a goal, a
      // speed), but not your language or guest mode: the reader opens it in their own.
      shareURL: function (value) {
        var rest = new URLSearchParams(kept(true)); rest.delete('lang');
        return new URL(location.pathname + '?' + [rest.toString(), encoded(value)].filter(Boolean).join('&'), location.href).href;
      },
      go: go,
      // Repaint after the page changed something its link depends on outside the store.
      sync: function () { repaint.forEach(function (fn) { fn(); }); }
    };
    if (sheet.guest) root.PlayerLedger.use(guestStore);
    api.current = sheet;
    return sheet;
  }
  /* The sheet's store, made once: a copy of your save for plain ?guest or a link that could
     not be read, an empty ledger holding only the link for a link that could. */
  function guestStore() {
    if (memo) return memo;
    var memory = {};
    if (!sheet.link) try { memory[Ledger.KEY] = JSON.stringify(Ledger.shared().snapshot()); } catch (ignored) {}
    memo = Ledger.create({ getItem: function (key) { return key in memory ? memory[key] : null; }, setItem: function (key, value) { memory[key] = String(value); } }, null);
    if (sheet.link) config.load(memo, sheet.link, false);
    return memo;
  }
  // Reload on another sheet (null for your own save), keeping the language and the hash.
  function go(value) {
    var search = [kept(true), value ? encoded(value) : ''].filter(Boolean).join('&');
    location.assign(location.pathname + (search ? '?' + search : '') + location.hash);
  }
  // Reload as a guest on a copy of your save.
  function enter() { location.assign(location.pathname + '?' + [kept(true), 'guest'].filter(Boolean).join('&') + location.hash); }

  /* The controls from _includes/page-sheet.html, as the Alpine store $store.sheet. `v` changes
     whenever the page's store, your save or something the link depends on changes. */
  if (root.document) root.document.addEventListener('alpine:init', function () {
    var Alpine = root.Alpine, copiedTimer = null;
    function store() { return sheet.store(); }
    function t(key) { Alpine.store('i18n').v; return root.BH.tr('gov.sheet.' + key, EN[key]); }
    function dialog() { return root.document.querySelector('[data-sheet="dialog"]'); }
    Alpine.store('sheet', {
      v: 0, copied: false, link: '', saveFailed: false,
      get ready() { return !!config; },
      get guest() { return !!config && sheet.guest; },
      // What the notice says and which buttons it offers. On your own save there is nothing to
      // say: edits save as they go. The notice is for a sheet.
      get state() {
        this.v; Alpine.store('i18n').v;
        if (!config) return { source: '', hint: '', loadMine: false, saveMine: false, blank: false };
        if (!sheet.guest) return { source: t('sourceSame'), hint: root.BH.tr('gear.sheet.liveHint', EN.liveHint), loadMine: false, saveMine: false, blank: true };
        var now = config.of(store()), own = mineStore(), mine = own ? config.of(own) : null, blank = encoded(now) === encoded(config.blank());
        var matches = !!mine && config.same(now, mine), hasOwn = !!mine && encoded(mine) !== encoded(config.blank());
        return {
          source: sheet.invalid ? t('linkInvalid') : matches && hasOwn ? t('sourceSame') : blank ? t('sourceBlank') : sheet.link ? t('sourceLink') : t('sourceChanged'),
          hint: this.saveFailed ? root.BH.tr('gear.saveFailed', 'Could not save.') : matches ? t('saveHint') : t('untouched'),
          loadMine: true, saveMine: !matches && !blank, blank: !blank, matches: matches, now: now
        };
      },
      label(key) { return t(key); },
      // The button says it copied for a moment, so no note lingers; without a clipboard the
      // link shows in a field, selected.
      copy(field) {
        var self = this, url = sheet.shareURL(config.of(store()));
        function fallback() { self.link = url; if (field) root.setTimeout(function () { field.focus(); field.select(); }); }
        function done() {
          self.copied = true;
          clearTimeout(copiedTimer);
          copiedTimer = setTimeout(function () { self.copied = false; }, 2500);
        }
        self.link = '';
        if (!root.navigator.clipboard || !root.navigator.clipboard.writeText) { fallback(); return; }
        root.navigator.clipboard.writeText(url).then(done, fallback);
      },
      toggleGuest() { if (sheet.guest) go(null); else enter(); },
      blank() { go(config.blank()); },
      loadMine() { go(null); },
      saveMine() { var node = dialog(); if (node && !node.open) node.showModal(); },
      cancel() { var node = dialog(); if (node) node.close(); },
      confirm() {
        var node = dialog();
        try { config.load(Ledger.shared(), config.of(store()), true); }
        catch (cause) { this.saveFailed = true; return; }
        if (node) node.close();
        go(null);
      }
    });
    if (!config) return;
    var state = Alpine.store('sheet'), bump = function () { state.v++; };
    repaint.push(bump);
    try { store().subscribe(bump); } catch (ignored) {}
    if (sheet.guest) { var own = mineStore(); if (own) own.subscribe(bump); }
    // The address carries the sheet, so a reload or a copied address opens the same one.
    Alpine.effect(function () {
      var now = state.state;
      if (!sheet.guest) return;
      var rest = kept(false), address = location.pathname + '?' + [rest, now.matches ? '' : encoded(now.now)].filter(Boolean).join('&');
      address = address.replace(/\?$/, '') + location.hash;
      try { if (address !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', address); } catch (ignored) {}
    });
  });

  var api = { define: define, current: null };
  root.PageSheet = api;
})(window);
