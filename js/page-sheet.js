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

   and marks up the notice, tools and confirm dialog from _includes/page-sheet.html inside a
   root that lists `page-sheet` among its modules. The `page-sheet` module paints them, keeps
   the address in step, copies the link, and saves, loads or blanks the sheet. */
(function (root) {
  'use strict';
  var Ledger = root.PlayerLedger, config = null, sheet = null, memo = null;
  var EN = {
    sourceLink: 'A shared sheet.', sourceSame: 'Your save.', sourceBlank: 'A blank sheet.', sourceChanged: 'Changed on this page only.',
    untouched: 'Your save is untouched.', saveHint: 'Edits here stay on this page until you save them.',
    linkInvalid: 'That link could not be read, so this is a copy of your save.',
    copied: 'Link copied', liveHint: 'Changes save as you go.'
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
      shareURL: function (value) { return new URL(location.pathname + '?' + encoded(value), location.href).href; },
      go: go
    };
    if (sheet.guest) root.Interactions.configure({ ledger: guestStore });
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

  if (root.Interactions) root.Interactions.register('page-sheet', function (context) {
    if (!config) return {};
    var store = context.ledger, ui = context.api, copiedTimer = null;
    function t(key) { return ui.tr('gov.sheet.' + key, EN[key]); }
    function put(key, text) { context.targets(key).forEach(function (node) { node.textContent = text; }); }
    function show(key, on) { context.targets(key).forEach(function (node) { node.hidden = !on; }); }
    function render() {
      // On your own save there is nothing to say: edits save as they go. The notice is for a sheet.
      show('notice', sheet.guest);
      if (!sheet.guest) {
        put('source', t('sourceSame')); put('hint', ui.tr('gear.sheet.liveHint', EN.liveHint));
        show('loadMine', false); show('saveMine', false); show('blank', true);
        return;
      }
      var now = config.of(store), own = mineStore(), mine = own ? config.of(own) : null, blank = encoded(now) === encoded(config.blank());
      var matches = !!mine && config.same(now, mine), hasOwn = !!mine && encoded(mine) !== encoded(config.blank());
      put('source', sheet.invalid ? t('linkInvalid') : matches && hasOwn ? t('sourceSame') : blank ? t('sourceBlank') : sheet.link ? t('sourceLink') : t('sourceChanged'));
      put('hint', matches ? t('saveHint') : t('untouched'));
      show('loadMine', true); show('saveMine', !matches && !blank); show('blank', !blank);
      // The address carries the sheet, so a reload or a copied address opens the same one.
      var rest = kept(false), address = location.pathname + '?' + [rest, matches ? '' : encoded(now)].filter(Boolean).join('&');
      address = address.replace(/\?$/, '') + location.hash;
      try { if (address !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', address); } catch (ignored) {}
    }
    context.cleanup(store.subscribe(render));
    if (sheet.guest) { var own = mineStore(); if (own) context.cleanup(own.subscribe(render)); }
    // The button says it copied for a moment, so no note lingers; without a clipboard the link
    // shows in a field, selected.
    function copy(button) {
      var url = sheet.shareURL(config.of(store)), field = context.targets('link')[0], label = button.dataset.label || button.textContent;
      button.dataset.label = label;
      function fallback() { if (!field) return; field.hidden = false; field.value = url; field.focus(); field.select(); }
      function done() {
        button.textContent = t('copied'); button.dataset.copied = 'true'; put('status', t('copied'));
        clearTimeout(copiedTimer);
        copiedTimer = setTimeout(function () { button.textContent = label; delete button.dataset.copied; put('status', ''); }, 2500);
      }
      if (field) field.hidden = true;
      if (!navigator.clipboard || !navigator.clipboard.writeText) { fallback(); return; }
      navigator.clipboard.writeText(url).then(done, fallback);
    }
    context.cleanup(function () { clearTimeout(copiedTimer); });
    return { refresh: render, actions: {
      copy: { run: copy },
      blank: { run: function () { go(config.blank()); } },
      loadMine: { run: function () { go(null); } },
      saveMine: { run: function () { var dialog = context.targets('confirm')[0]; if (dialog && !dialog.open) dialog.showModal(); } },
      cancel: { run: function () { var dialog = context.targets('confirm')[0]; if (dialog) dialog.close(); } },
      confirm: { run: function () {
        var dialog = context.targets('confirm')[0];
        try { config.load(Ledger.shared(), config.of(store), true); }
        catch (cause) { put('hint', ui.tr('gear.saveFailed', 'Could not save.')); return; }
        if (dialog) dialog.close();
        go(null);
      } }
    } };
  });

  var api = { define: define, current: null };
  root.PageSheet = api;
})(window);
