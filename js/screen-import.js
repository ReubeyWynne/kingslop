/* screen-import.js — the site-wide screenshot import dock (SCREENSHOT-IMPORT.md).
   Markup: _includes/screen-import.html, on every page. The dock stays hidden
   until there is something to read: a pick, a paste anywhere on the page, or a
   [data-screen-import] button a page offers. Each screenshot is read once,
   claimed by a screen adapter (js/screen-import-core.js) and reviewed as a grid
   of cut-outs with one input each. Nothing reaches the player ledger until
   "apply", and the work in progress survives moving between pages
   (js/import-queue.js). The OCR engine and the adapters load on first use. */
(function () {
  'use strict';
  var M = window.Interactions;
  if (!M) return;

  var LAZY = ['ocr-text.js', 'ocr-client.js', 'screen-import-core.js', 'import-adapters/overview.js'];
  var GLOBALS = ['OcrText', 'OcrClient', 'ScreenImport', null];
  var here = document.currentScript && document.currentScript.src;

  // The reading side loads only when a screenshot arrives, so pages that never
  // import pay one small script.
  var loading = null;
  function engine() {
    if (loading) return loading;
    loading = LAZY.reduce(function (chain, file, i) {
      return chain.then(function () {
        if (GLOBALS[i] && window[GLOBALS[i]]) return null;
        if (!GLOBALS[i] && window.ScreenImport && window.ScreenImport.get('overview-resources')) return null;
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script'), url = new URL(file, here || location.href);
          if (here) url.search = new URL(here).search;
          s.src = url.href; s.onload = resolve; s.onerror = function () { reject(new Error('Could not load ' + file)); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve()).catch(function (e) { loading = null; throw e; });
    return loading;
  }

  function sha256(blob) {
    return blob.arrayBuffer().then(function (buf) { return crypto.subtle.digest('SHA-256', buf); }).then(function (hash) {
      return Array.from(new Uint8Array(hash)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }

  // A cut-out of the read's preview at twice its size, as a PNG blob, so it
  // survives the page and is sharp enough to check digits against.
  function cut(bitmap, crop) {
    if (!bitmap || !crop) return Promise.resolve(null);
    var scale = 2, w = Math.max(1, Math.round(crop.w * scale)), h = Math.max(1, Math.round(crop.h * scale));
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
    return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
  }

  function duration(minutes) {
    var d = Math.floor(minutes / 1440), h = Math.floor(minutes % 1440 / 60), m = minutes % 60;
    return [d && d + 'd', h && h + 'h', (m || (!d && !h)) && m + 'm'].filter(Boolean).join(' ');
  }

  M.register('screen-import', function (context) {
    var api = context.api, root = context.root;
    var queue = null, entries = [], current = 0, ocr = null, busy = false, lastApply = null, urls = [];
    var ledger = window.PlayerLedger && window.PlayerLedger.shared();

    function tr(key, fallback, vars) { var text = api.tr(key, fallback); return vars ? api.fill(text, vars) : text; }
    function target(key) { return context.targets(key)[0]; }
    function open(expanded) {
      root.hidden = false;
      target('sheet').hidden = !expanded;
      target('chip').setAttribute('aria-expanded', String(expanded));
      root.dataset.open = String(expanded);
    }
    function status(text) { target('status').textContent = text || ''; }

    function reviewable() { return entries.filter(function (e) { return e.status === 'review'; }); }
    function doubtful(entry) {
      var S = window.ScreenImport, doubt = S ? S.DOUBT : 0.75;
      return entry.proposals.filter(function (p) { var edit = entry.edits[p.id]; return !(edit && edit.touched) && (p.value === null || p.confidence < doubt); });
    }

    function save(entry) { return queue ? queue.put(entry).catch(function () {}) : Promise.resolve(); }
    function forget(entry) { entries = entries.filter(function (e) { return e !== entry; }); return queue ? queue.remove(entry.id).catch(function () {}) : Promise.resolve(); }

    // ── reading ────────────────────────────────────────
    function add(files) {
      files = Array.from(files || []).filter(function (f) { return f && /^image\//.test(f.type); });
      if (!files.length) return Promise.resolve();
      open(true);
      return Promise.all(files.map(function (file) {
        return sha256(file).then(function (hash) {
          if (entries.some(function (e) { return e.hash === hash; })) return null;
          if (ledger && ledger.snapshot().imports.some(function (r) { return r.contentHash === hash; })) {
            status(tr('import.already', '{name} was already applied.', { name: file.name || '' }));
            return null;
          }
          var entry = { id: hash.slice(0, 16), hash: hash, name: file.name || tr('import.pasted', 'Pasted screenshot'), added: Date.now(), lastModified: file.lastModified || Date.now(), blob: file, status: 'queued', proposals: [], edits: {} };
          entries.push(entry);
          return save(entry);
        });
      })).then(function () { render(); return work(); });
    }

    function work() {
      if (busy) return Promise.resolve();
      var next = entries.filter(function (e) { return e.status === 'queued' || e.status === 'reading'; })[0];
      if (!next) { render(); return Promise.resolve(); }
      busy = true;
      next.status = 'reading';
      render();
      return engine().then(function () {
        var S = window.ScreenImport;
        if (!ocr) ocr = window.OcrClient.create();
        return ocr.read(next.blob, { useful: function (res) { return !!S.route(S.page({ items: res.items })); } }).then(function (res) {
          var bitmap = res.preview;
          var page = S.page({ items: res.items, width: bitmap ? bitmap.width : 0, height: bitmap ? bitmap.height : 0 });
          var claim = S.route(page);
          if (!claim) { next.status = 'unknown'; if (bitmap) bitmap.close(); return; }
          var proposals = claim.adapter.read(page);
          return Promise.all(proposals.map(function (p) { return cut(bitmap, p.crop); })).then(function (crops) {
            if (bitmap) bitmap.close();
            next.adapter = claim.adapter.id;
            next.sourceType = claim.adapter.sourceType;
            // Review follows the screen top to bottom; values never found go last.
            next.proposals = proposals.map(function (p, i) {
              return { id: p.id, label: p.label, value: p.value, confidence: p.confidence, note: p.note || '', unit: /^speedup-/.test(p.id) ? 'minutes' : 'count', crop: crops[i], y: p.crop ? p.crop.y : Infinity };
            }).sort(function (a, b) { return a.y - b.y; });
            next.status = 'review';
          });
        });
      }).catch(function (err) {
        if (err && err.preview) err.preview.close();
        next.status = 'failed';
        if (window.console && console.error) console.error('[screen-import]', (err && err.message) || err);
      }).then(function () {
        busy = false;
        if (next.status === 'review') current = reviewable().indexOf(next);
        return save(next);
      }).then(work);
    }

    // ── review ─────────────────────────────────────────
    var SCREENS = { 'overview-resources': ['import.screen.resources', 'Overview · Resources'], 'overview-speedups': ['import.screen.speedups', 'Overview · Speedups'] };

    function translate(node) {
      node.querySelectorAll('[data-i18n]').forEach(function (n) { n.textContent = tr(n.dataset.i18n, n.textContent); });
    }
    function field(li, name) { return li.querySelector('[data-field="' + name + '"]'); }

    function tiles(entry) {
      var list = target('tiles'), template = target('tile');
      urls.forEach(function (u) { URL.revokeObjectURL(u); }); urls = [];
      Array.from(list.children).forEach(function (li) { if (!entry || !entry.proposals.some(function (p) { return p.id === li.dataset.key; })) li.remove(); });
      if (!entry) return;
      var doubts = doubtful(entry);
      entry.proposals.forEach(function (p, i) {
        var li = list.querySelector('[data-key="' + p.id + '"]');
        if (!li) { li = template.content.firstElementChild.cloneNode(true); li.dataset.key = p.id; translate(li); }
        var edit = entry.edits[p.id] || {}, value = edit.value !== undefined ? edit.value : p.value;
        var img = field(li, 'crop');
        if (p.crop) { var url = URL.createObjectURL(p.crop); urls.push(url); img.src = url; img.hidden = false; } else { img.removeAttribute('src'); img.hidden = true; }
        field(li, 'label').textContent = tr('import.item.' + p.id, p.label);
        var input = field(li, 'value');
        if (document.activeElement !== input) input.value = value === null || value === undefined ? '' : String(value);
        input.placeholder = tr('import.unread', 'not read');
        field(li, 'note').textContent = p.unit === 'minutes' ? tr('import.minutesNote', 'minutes{d}', { d: value === null || value === undefined ? '' : ' · ' + duration(value) }) : p.note;
        field(li, 'include').checked = edit.include !== undefined ? edit.include : value !== null;
        li.dataset.state = doubts.indexOf(p) !== -1 ? 'doubt' : 'sure';
        if (list.children[i] !== li) list.insertBefore(li, list.children[i] || null);
      });
    }

    function render() {
      var list = reviewable(), waiting = entries.filter(function (e) { return e.status === 'queued' || e.status === 'reading'; });
      if (current >= list.length) current = Math.max(0, list.length - 1);
      var entry = list[current] || null, checks = list.reduce(function (n, e) { return n + doubtful(e).length; }, 0);
      target('count').textContent = waiting.length ? tr('import.reading', 'reading…') : list.length ? tr('import.toReview', '{n} to review', { n: api.fmt(list.length) }) : '';
      if (!entries.length && !lastApply && root.dataset.open !== 'true') root.hidden = true;
      target('shot').hidden = !entry;
      target('undo').hidden = !lastApply;
      if (entry) {
        var screen = SCREENS[entry.adapter] || [null, entry.adapter];
        target('screen').textContent = screen[0] ? tr(screen[0], screen[1]) : screen[1];
        target('name').textContent = entry.name;
        target('position').textContent = tr('import.position', '{i} of {n}', { i: api.fmt(current + 1), n: api.fmt(list.length) });
        var doubts = doubtful(entry).length;
        target('needsLook').textContent = tr('import.needsLook', 'needs a look ({n})', { n: api.fmt(doubts) });
        target('needsLook').hidden = !doubts && root.dataset.filter !== 'doubt';
      }
      tiles(entry);
      if (waiting.length) status(tr('import.readingStatus', 'Reading {n} screenshot(s)… the first read downloads about 14 MB of models, once per device.', { n: api.fmt(waiting.length) }));
      else if (entries.some(function (e) { return e.status === 'unknown'; })) status(tr('import.unknown', 'One screenshot isn’t a screen I can read yet. It was skipped.'));
      else if (entries.some(function (e) { return e.status === 'failed'; })) status(tr('import.failed', 'A screenshot couldn’t be read. Try it again, or a clearer shot.'));
      else if (entry) status(checks ? tr('import.check', '{n} values need a look. Everything else is ticked.', { n: api.fmt(checks) }) : tr('import.allSure', 'Everything was read. Check the numbers, then apply.'));
      // Unknown and failed shots are reported once, then dropped from the queue.
      entries.filter(function (e) { return e.status === 'unknown' || e.status === 'failed'; }).forEach(forget);
    }

    function edit(node) {
      var entry = reviewable()[current], li = node.closest('[data-key]');
      if (!entry || !li) return;
      var e = entry.edits[li.dataset.key] || (entry.edits[li.dataset.key] = {});
      if (node.dataset.field === 'value') {
        if (node.value !== '' && !node.validity.valid) return;
        e.value = node.value === '' ? null : Number(node.value);
        if (e.include === undefined) e.include = e.value !== null;
      } else e.include = node.checked;
      e.touched = true;
      save(entry);
      render();
    }

    function apply() {
      var entry = reviewable()[current];
      if (!entry || !ledger) return;
      var before = ledger.snapshot(), delta = {};
      entry.proposals.forEach(function (p) {
        var e = entry.edits[p.id] || {}, value = e.value !== undefined ? e.value : p.value, include = e.include !== undefined ? e.include : value !== null;
        if (!include || value === null || !Number.isSafeInteger(value) || value < 0) return;
        var held = before.inventory[p.id];
        delta[p.id] = { before: held && held.status === 'confirmed' ? held.amount : null, after: value };
      });
      if (!Object.keys(delta).length) { status(tr('import.nothing', 'Nothing is ticked to apply.')); return; }
      var record = { id: 'shot-' + entry.hash, sourceType: entry.sourceType, at: new Date().toISOString(), contentHash: entry.hash, confirmation: 'confirmed', inventoryDelta: delta };
      try {
        ledger.applyImport(record, before.revision);
      } catch (err) {
        status(/already/.test(err.message) ? tr('import.already', '{name} was already applied.', { name: entry.name }) : tr('import.changed', 'Your saved data changed in another tab. Check the numbers and apply again.'));
        if (/already/.test(err.message)) forget(entry).then(render);
        return;
      }
      lastApply = { before: before, name: entry.name };
      forget(entry).then(function () {
        render();
        status(tr('import.applied', 'Saved {n} values from {name}.', { n: api.fmt(Object.keys(delta).length), name: entry.name }));
        context.emit('screen-import:applied', { record: record });
      });
    }

    function undo() {
      if (!lastApply || !ledger) return;
      try { ledger.importJSON(lastApply.before, null, ledger.snapshot().revision); } catch (err) { status(tr('import.changed', 'Your saved data changed in another tab. Check the numbers and apply again.')); return; }
      status(tr('import.undone', 'Undone. {name} can be applied again.', { name: lastApply.name }));
      lastApply = null;
      render();
    }

    // ── wiring ─────────────────────────────────────────
    context.listen(document, 'click', function (event) {
      var opener = event.target.closest && event.target.closest('[data-screen-import]');
      if (!opener) return;
      event.preventDefault();
      open(true); render();
      if (opener.dataset.screenImport === 'pick') target('files').click();
    });
    // A screenshot pasted anywhere on the site goes to the dock, unless the
    // reader is pasting into a text field.
    context.listen(document, 'paste', function (event) {
      if (event.target && event.target.closest && event.target.closest('input, textarea, [contenteditable]')) return;
      var files = Array.from((event.clipboardData && event.clipboardData.files) || []).filter(function (f) { return /^image\//.test(f.type); });
      if (!files.length) return;
      event.preventDefault();
      add(files);
    });

    window.ImportQueue.open().then(function (q) {
      queue = q;
      return q.all();
    }).then(function (saved) {
      entries = saved.filter(function (e) { return e.status !== 'applied'; }).concat(entries.filter(function (e) { return !saved.some(function (s) { return s.id === e.id; }); }));
      if (entries.length) { root.hidden = false; open(false); }
      render();
      work();
    });
    context.cleanup(function () { urls.forEach(function (u) { URL.revokeObjectURL(u); }); if (ocr) ocr.close(); });

    return { refresh: function () { if (!root.hidden) render(); }, actions: {
      toggle: { run: function () { open(target('sheet').hidden); render(); } },
      pick: { run: function () { target('files').click(); } },
      add: { events: ['change'], run: function (node) { var files = Array.from(node.files || []); node.value = ''; return add(files); } },
      edit: { events: ['change'], run: edit },
      needsLook: { run: function (node) { var on = root.dataset.filter !== 'doubt'; root.dataset.filter = on ? 'doubt' : 'all'; node.setAttribute('aria-pressed', String(on)); render(); } },
      prev: { run: function () { var n = reviewable().length; if (n) { current = (current - 1 + n) % n; render(); } } },
      next: { run: function () { var n = reviewable().length; if (n) { current = (current + 1) % n; render(); } } },
      discard: { run: function () { var entry = reviewable()[current]; if (entry) forget(entry).then(render); } },
      apply: { run: apply },
      undo: { run: undo }
    } };
  });
})();
