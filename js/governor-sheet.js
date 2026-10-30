/* The governor page works on its own sheet, never on the player's save: an in-memory store
   that starts from the link when there is one, else from a copy of the save. The address
   carries the sheet whenever it differs from the save, so it can be shared as it stands, and
   only "Save as mine" writes the save. A screenshot read by the import dock lands here too. */
(function () {
  'use strict';
  var G = window.Governor, Ledger = window.PlayerLedger;
  var link = G.readLink(location.search), sheetStore = null;
  var MATERIALS = G.data.materials.map(function (m) { return m.id; });
  var KEPT_OUT = ['gov', 'bag', 'p', 'g', 'f', 'gt', 'ct'];
  var EN = {
    sourceLink: 'A shared sheet.', sourceSame: 'Your save.', sourceBlank: 'A blank sheet.', sourceChanged: 'Changed on this page only.',
    untouched: 'Your save is untouched.', saveHint: 'Edits here stay on this page until you save them.',
    linkInvalid: 'That link could not be read, so this is a copy of your save.',
    copied: 'link copied', saved: 'Saved as yours.'
  };
  function mine() { try { return Ledger.shared().snapshot(); } catch (ignored) { return null; } }

  window.Interactions.configure({ ledger: function () {
    if (sheetStore) return sheetStore;
    var memory = {}, saved = link && !link.invalid ? null : mine();
    if (saved) memory[Ledger.KEY] = JSON.stringify(saved);
    sheetStore = Ledger.create({ getItem: function (key) { return key in memory ? memory[key] : null; }, setItem: function (key, value) { memory[key] = String(value); } }, null);
    if (link && !link.invalid) load(sheetStore, link);
    return sheetStore;
  } });

  // The sheet a store holds, in the shape the link uses.
  function sheetOf(store, snapshot) {
    snapshot = snapshot || store.snapshot();
    var bag = {};
    MATERIALS.forEach(function (id) { var entry = snapshot.inventory[id]; bag[id] = entry && entry.status === 'confirmed' ? entry.amount : null; });
    return { gear: store.governor('gear', snapshot), charms: store.governor('charms', snapshot), bag: bag, prefs: Object.assign({}, snapshot.preferences.governor || {}) };
  }
  function known(levels) { var out = {}; Object.keys(levels).forEach(function (id) { if (levels[id] !== null && levels[id] !== undefined) out[id] = levels[id]; }); return out; }
  /* Replace the governor part of a store with a sheet; other facts in the store stay. Saving
     to the player's own store keeps a material the sheet has not counted. */
  function load(store, sheet, keepUncounted) {
    store.resetGovernor();
    ['gear', 'charms'].forEach(function (kind) { var levels = known(sheet[kind] || {}); if (Object.keys(levels).length) store.setGovernor(kind, levels); });
    MATERIALS.forEach(function (id) {
      var n = sheet.bag && Number.isSafeInteger(sheet.bag[id]) ? sheet.bag[id] : null;
      if (n !== null || !keepUncounted) store.setBalance(id, n);
    });
    var prefs = sheet.prefs || {};
    Object.keys(prefs).forEach(function (key) { store.setGovernorPreference(key, prefs[key]); });
  }
  function query(encoded) { return Object.keys(encoded).map(function (key) { return key + '=' + encoded[key]; }).join('&'); }
  function kept() { var params = new URLSearchParams(location.search); KEPT_OUT.forEach(function (key) { params.delete(key); }); return params.toString(); }
  function same(a, b) { return query(G.encodeLink(a)) === query(G.encodeLink(b)); }
  function empty(sheet) { return !/[^.]/.test(G.encodeLink(sheet).gov) && !G.encodeLink(sheet).bag; }

  window.Interactions.register('governor-sheet', function (context) {
    var store = context.ledger, api = context.api, copiedTimer = null;
    function t(key) { return api.tr('gov.sheet.' + key, EN[key]); }
    function put(key, text) { context.targets(key).forEach(function (node) { node.textContent = text; }); }
    function shareURL(sheet) { return new URL(location.pathname + '?' + query(G.encodeLink(sheet)), location.href).href; }
    function render() {
      var sheet = sheetOf(store), saved = mine(), own = saved ? sheetOf(store, saved) : null, blank = empty(sheet);
      // A material the sheet has not counted would keep the saved number, so it does not count as a change.
      var compared = own ? Object.assign({}, sheet, { bag: Object.assign({}, sheet.bag) }) : sheet;
      if (own) MATERIALS.forEach(function (id) { if (compared.bag[id] === null) compared.bag[id] = own.bag[id]; });
      var matches = own && same(compared, own), hasOwn = own && !empty(own);
      var source = link && link.invalid ? t('linkInvalid') : matches && hasOwn ? t('sourceSame') : blank ? t('sourceBlank') : link && !link.invalid ? t('sourceLink') : t('sourceChanged');
      put('source', source);
      put('hint', matches ? t('saveHint') : t('untouched'));
      context.targets('loadMine').forEach(function (node) { node.hidden = !hasOwn || matches; });
      context.targets('saveMine').forEach(function (node) { node.hidden = matches || blank; });
      context.targets('blank').forEach(function (node) { node.hidden = blank; });
      var rest = kept(), address = location.pathname + '?' + (rest ? rest + '&' : '');
      if (!matches) address += query(G.encodeLink(sheet));
      address = address.replace(/[?&]$/, '') + location.hash;
      try { if (address !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', address); } catch (ignored) {}
    }
    context.cleanup(store.subscribe(render));
    try { context.cleanup(Ledger.shared().subscribe(render)); } catch (ignored) {}
    /* A Governor Profile read by the import dock (js/import-adapters/governor.js) lands here,
       on the sheet: values keyed 'gov-cav-1' (gear) and 'gov-cav-1-2' (a charm). `before`
       gets what each held, so the dock can undo. */
    context.listen(context.root, 'screen-import:sheet', function (event) {
      var values = event.detail.values, before = event.detail.before, now = { gear: store.governor('gear'), charms: store.governor('charms') }, change = { gear: {}, charms: {} };
      Object.keys(values).forEach(function (key) {
        var m = /^gov-([a-z]+-\d)(?:-(\d))?$/.exec(key), value = values[key];
        if (!m) return;
        var kind = m[2] ? 'charms' : 'gear', id = m[2] ? m[1] + '-' + m[2] : m[1];
        before[key] = now[kind][id];
        change[kind][id] = value === null || value === '' ? null : Number(value);
      });
      ['gear', 'charms'].forEach(function (kind) { if (Object.keys(change[kind]).length) store.setGovernor(kind, change[kind]); });
    });
    function copy(button) {
      var url = shareURL(sheetOf(store)), field = context.targets('link')[0], label = button.dataset.label || button.textContent;
      button.dataset.label = label;
      function fallback() { if (!field) return; field.hidden = false; field.value = url; field.focus(); field.select(); }
      function done() { button.textContent = t('copied'); clearTimeout(copiedTimer); copiedTimer = setTimeout(function () { button.textContent = label; }, 2500); }
      if (field) field.hidden = true;
      if (!navigator.clipboard || !navigator.clipboard.writeText) { fallback(); return; }
      navigator.clipboard.writeText(url).then(done, fallback);
    }
    return { refresh: render, actions: {
      copy: { run: copy },
      blank: { run: function () { load(store, { gear: {}, charms: {}, bag: {}, prefs: {} }); } },
      loadMine: { run: function () { var saved = mine(); if (saved) load(store, sheetOf(store, saved)); } },
      saveMine: { run: function () { var dialog = context.targets('confirm')[0]; if (dialog && !dialog.open) dialog.showModal(); } },
      cancel: { run: function () { var dialog = context.targets('confirm')[0]; if (dialog) dialog.close(); } },
      confirm: { run: function () {
        var dialog = context.targets('confirm')[0], own = Ledger.shared(), sheet = sheetOf(store);
        load(own, sheet, true);
        if (dialog) dialog.close();
        context.emit('player-status', { scope: 'governor', key: 'gov.sheet.saved', fallback: EN.saved });
      } }
    } };
  });
})();
