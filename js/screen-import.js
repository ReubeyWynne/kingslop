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

  // Files load in order; each is skipped when what it provides is already on
  // the page (the simulator and hero gear load the OCR side themselves).
  var LAZY = [
    ['ocr-text.js', function () { return window.OcrText; }],
    ['ocr-client.js', function () { return window.OcrClient; }],
    ['screen-import-core.js', function () { return window.ScreenImport; }],
    ['import-adapters/overview.js', function () { return window.ScreenImport.get('overview-resources'); }],
    ['import-adapters/backpack.js', function () { return window.ScreenImport.get('backpack-items'); }],
    ['import-adapters/pets.js', function () { return window.ScreenImport.get('pet-list'); }]
  ];
  var here = document.currentScript && document.currentScript.src;

  // The reading side loads only when a screenshot arrives, so pages that never
  // import pay one small script.
  var loading = null;
  function engine() {
    if (loading) return loading;
    loading = LAZY.reduce(function (chain, entry) {
      return chain.then(function () {
        if (entry[1]()) return null;
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script'), url = new URL(entry[0], here || location.href);
          if (here) url.search = new URL(here).search;
          s.src = url.href; s.onload = resolve; s.onerror = function () { reject(new Error('Could not load ' + entry[0])); };
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
  // survives the page and is sharp enough to check digits against. Adapters
  // give crops in preview pixels, or as fractions of the image.
  function cut(bitmap, crop) {
    if (!bitmap || !crop) return Promise.resolve(null);
    if (crop.unit === 'fraction') crop = { x: crop.x * bitmap.width, y: crop.y * bitmap.height, w: crop.w * bitmap.width, h: crop.h * bitmap.height };
    var scale = 2, w = Math.max(1, Math.round(crop.w * scale)), h = Math.max(1, Math.round(crop.h * scale));
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
    return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
  }

  function blobOf(canvas) {
    return new Promise(function (resolve, reject) { canvas.toBlob(function (b) { if (b) resolve(b); else reject(new Error('Image unavailable')); }, 'image/png'); });
  }

  // What pixel-reading adapters get besides the words: the shot at 360px wide,
  // and a way to read small regions of the original enlarged. Regions are
  // stacked into strips, a band each, so a whole screen costs one or two reads.
  var BAND = 96, GAP = 32, PER_STRIP = 6;

  // Game counts are white glyphs with a dark rim over a coloured tile. Keeping
  // only the near-white, unsaturated pixels leaves clean digits on black.
  function keepWhite(ctx, x, y, w, h) {
    var img = ctx.getImageData(x, y, w, h), d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var lo = Math.min(d[i], d[i + 1], d[i + 2]), hi = Math.max(d[i], d[i + 1], d[i + 2]);
      var v = lo > 185 && hi - lo < 60 ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, x, y);
  }
  function tools(blob, reader) {
    var full = null;
    function bitmap() { return full || (full = createImageBitmap(blob)); }
    return {
      pixels: null,
      load: function () {
        var self = this;
        return bitmap().then(function (bm) {
          var w = 360, h = Math.round(bm.height * w / bm.width), c = document.createElement('canvas');
          c.width = w; c.height = h;
          var ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(bm, 0, 0, w, h);
          self.pixels = ctx.getImageData(0, 0, w, h);
          return self;
        });
      },
      readRegions: function (boxes) {
        return bitmap().then(function (bm) {
          var strips = [];
          for (var i = 0; i < boxes.length; i += PER_STRIP) strips.push(boxes.slice(i, i + PER_STRIP));
          return strips.reduce(function (chain, strip) {
            return chain.then(function (all) {
              var sizes = strip.map(function (b) { var sh = b.h * bm.height; return { sx: b.x * bm.width, sy: b.y * bm.height, sw: b.w * bm.width, sh: sh, w: Math.round(b.w * bm.width * BAND / sh) }; });
              var c = document.createElement('canvas');
              c.width = Math.max.apply(null, sizes.map(function (s) { return s.w; })) + GAP * 2;
              c.height = strip.length * (BAND + GAP) + GAP;
              var ctx = c.getContext('2d');
              ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
              sizes.forEach(function (s, k) {
                var top = GAP + k * (BAND + GAP);
                ctx.drawImage(bm, s.sx, s.sy, s.sw, s.sh, GAP, top, s.w, BAND);
                if (strip[k].ink === 'white') keepWhite(ctx, GAP, top, s.w, BAND);
              });
              return blobOf(c).then(function (png) { return reader.read(png); }).then(function (res) {
                var scale = res.preview && res.preview.height ? c.height / res.preview.height : 1, bands = strip.map(function () { return []; });
                if (res.preview) res.preview.close();
                // Words come back in the detector's (possibly smaller) frame.
                (res.items || []).forEach(function (it) {
                  var ys = (it.poly || []).map(function (p) { return p[1] * scale; });
                  if (!ys.length) return;
                  var cy = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2, k = Math.floor((cy - GAP / 2) / (BAND + GAP));
                  if (k >= 0 && k < bands.length) bands[k].push(it);
                });
                bands.forEach(function (b) { b.sort(function (x, y) { return x.poly[0][0] - y.poly[0][0]; }); });
                return all.concat(bands);
              });
            });
          }, Promise.resolve([]));
        });
      },
      close: function () { if (full) full.then(function (bm) { bm.close(); }, function () {}); }
    };
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

    // Shots taken at different moments disagree (keys 200, then 140 after
    // opening some). The newest file wins: an item a newer shot waiting in the
    // dock also shows starts unticked here, and says what the newer one read.
    function newer(entry, p) {
      var stamp = function (e) { return [e.lastModified || 0, e.added || 0]; }, mine = stamp(entry);
      return reviewable().filter(function (e) {
        if (e === entry) return false;
        var theirs = stamp(e);
        return (theirs[0] > mine[0] || (theirs[0] === mine[0] && theirs[1] > mine[1])) && e.proposals.some(function (q) { return q.id === p.id && valueOf(e, q) !== null; });
      })[0] || null;
    }
    function valueOf(entry, p) { var e = entry.edits[p.id] || {}; return e.value !== undefined ? e.value : p.value; }
    function included(entry, p) {
      var e = entry.edits[p.id] || {};
      if (e.include !== undefined) return e.include;
      return valueOf(entry, p) !== null && !newer(entry, p);
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
          var kit = tools(next.blob, ocr);
          return (claim.adapter.layout === 'grid' ? kit.load() : Promise.resolve(kit)).then(function () {
            return claim.adapter.read(page, kit);
          }).then(function (proposals) {
            kit.close();
            proposals = proposals || [];
            if (!proposals.length) { next.status = 'empty'; if (bitmap) bitmap.close(); return null; }
            return Promise.all(proposals.map(function (p) { return cut(bitmap, p.crop); })).then(function (crops) { return { proposals: proposals, crops: crops }; });
          }).then(function (done) {
            if (!done) return;
            var proposals = done.proposals, crops = done.crops;
            if (bitmap) bitmap.close();
            next.adapter = claim.adapter.id;
            next.sourceType = claim.adapter.sourceType;
            // Review follows the screen top to bottom; values never found go last.
            next.proposals = proposals.map(function (p, i) {
              return { target: p.target || 'inventory', id: p.id, label: p.label, value: p.value, confidence: p.confidence, note: p.note || '', unit: p.unit || (/^speedup-/.test(p.id) ? 'minutes' : 'count'), crop: crops[i], y: p.crop ? p.crop.y : Infinity };
            }).sort(function (a, b) { return a.y - b.y; });
            next.layout = claim.adapter.layout || 'list';
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
    var SCREENS = { 'overview-resources': ['import.screen.resources', 'Overview · Resources'], 'overview-speedups': ['import.screen.speedups', 'Overview · Speedups'], 'backpack-items': ['import.screen.backpack', 'Backpack items'], 'pet-list': ['import.screen.pets', 'Pet List'] };

    function translate(node) {
      node.querySelectorAll('[data-i18n]').forEach(function (n) { n.textContent = tr(n.dataset.i18n, n.textContent); });
    }
    function field(li, name) { return li.querySelector('[data-field="' + name + '"]'); }

    function tiles(entry) {
      var list = target('tiles'), template = target('tile');
      urls.forEach(function (u) { URL.revokeObjectURL(u); }); urls = [];
      Array.from(list.children).forEach(function (li) { if (!entry || !entry.proposals.some(function (p) { return p.id === li.dataset.key; })) li.remove(); });
      list.dataset.layout = entry ? entry.layout || 'list' : 'list';
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
        field(li, 'note').textContent = p.unit === 'minutes' ? tr('import.minutesNote', 'minutes{d}', { d: value === null || value === undefined ? '' : ' · ' + duration(value) }) : p.unit === 'level' ? tr('import.levelNote', 'level') : p.note;
        field(li, 'include').checked = included(entry, p);
        var later = newer(entry, p);
        if (later) field(li, 'note').textContent = tr('import.newer', 'a newer shot reads {v}', { v: api.fmt(valueOf(later, later.proposals.filter(function (q) { return q.id === p.id; })[0])) });
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
      else if (entries.some(function (e) { return e.status === 'empty'; })) status(tr('import.empty', 'No items I track were found on one screenshot. It was skipped.'));
      else if (entries.some(function (e) { return e.status === 'failed'; })) status(tr('import.failed', 'A screenshot couldn’t be read. Try it again, or a clearer shot.'));
      else if (entry) status(checks ? tr('import.check', '{n} values need a look. Everything else is ticked.', { n: api.fmt(checks) }) : tr('import.allSure', 'Everything was read. Check the numbers, then apply.'));
      // Unknown and failed shots are reported once, then dropped from the queue.
      entries.filter(function (e) { return e.status === 'unknown' || e.status === 'failed' || e.status === 'empty'; }).forEach(forget);
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
      // Inventory counts and pet levels go to their own parts of the record.
      var before = ledger.snapshot(), delta = {}, stock = {}, pets = {};
      entry.proposals.forEach(function (p) {
        var value = valueOf(entry, p), include = included(entry, p);
        if (!include || value === null || !Number.isSafeInteger(value) || value < 0) return;
        if (p.target === 'pet') {
          if (value < 1) return;
          var pet = (before.pets && before.pets.roster || {})[p.id];
          pets[p.id] = delta[p.id] = { before: pet ? pet.level : null, after: value };
          return;
        }
        var held = before.inventory[p.id];
        stock[p.id] = delta[p.id] = { before: held && held.status === 'confirmed' ? held.amount : null, after: value };
      });
      if (!Object.keys(delta).length) { status(tr('import.nothing', 'Nothing is ticked to apply.')); return; }
      var record = { id: 'shot-' + entry.hash, sourceType: entry.sourceType, at: new Date().toISOString(), contentHash: entry.hash, confirmation: 'confirmed' };
      if (Object.keys(stock).length) record.inventoryDelta = stock;
      if (Object.keys(pets).length) record.petDelta = pets;
      try {
        ledger.applyImport(record, before.revision);
      } catch (err) {
        status(/already/.test(err.message) ? tr('import.already', '{name} was already applied.', { name: entry.name }) : tr('import.changed', 'Your saved data changed in another tab. Check the numbers and apply again.'));
        if (/already/.test(err.message)) forget(entry).then(render);
        return;
      }
      lastApply = { before: before, name: entry.name };
      // Older shots in the dock lose the items this one just saved; their
      // values are stale now. A shot left with nothing goes too.
      var stamp = function (e) { return [e.lastModified || 0, e.added || 0]; }, mine = stamp(entry);
      var stale = reviewable().filter(function (e) {
        var theirs = stamp(e);
        return e !== entry && (theirs[0] < mine[0] || (theirs[0] === mine[0] && theirs[1] < mine[1]));
      });
      var cleared = Promise.all(stale.map(function (e) {
        e.proposals = e.proposals.filter(function (p) { return !delta[p.id]; });
        return e.proposals.length ? save(e) : forget(e);
      }));
      cleared.then(function () { return forget(entry); }).then(function () {
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
