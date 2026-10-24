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
  // the page.
  var LAZY = [
    ['ocr-text.js', function () { return window.OcrText; }],
    ['ocr-client.js', function () { return window.OcrClient; }],
    ['screen-import-core.js', function () { return window.ScreenImport; }],
    ['import-adapters/overview.js', function () { return window.ScreenImport.get('overview-resources'); }],
    ['import-adapters/backpack.js', function () { return window.ScreenImport.get('backpack-items'); }],
    ['import-adapters/pets.js', function () { return window.ScreenImport.get('pet-list'); }],
    ['hero-gear-ocr.js', function () { return window.HeroGearOCR; }],
    ['import-adapters/hero-gear.js', function () { return window.ScreenImport.get('hero-gear'); }],
    ['import-adapters/battle-report.js', function () { return window.ScreenImport.get('battle-report'); }]
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
  // give crops in preview pixels, as fractions of the image, or as a ready
  // image blob.
  function cut(bitmap, crop) {
    if (typeof Blob !== 'undefined' && crop instanceof Blob) return Promise.resolve(crop);
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
  // Adapters that crop for themselves get the file and readWasm(blob), a read
  // on the WASM engine for tiny labels.
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
  function tools(blob, reader, wasm, selected) {
    var full = null;
    function bitmap() { return full || (full = createImageBitmap(blob)); }
    return {
      pixels: null,
      blob: blob,
      selected: selected,
      readWasm: function (png) {
        return wasm().read(png).then(function (res) { if (res.preview) res.preview.close(); return res; }, function (err) { if (err && err.preview) err.preview.close(); throw err; });
      },
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
              return blobOf(c).then(function (png) { return reader().read(png); }).then(function (res) {
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

  // Every number in the dock is written the way the page's language writes
  // it: 805,510,000 · 805.510.000 · 805 510 000.
  function locale() { return (window.I18N && window.I18N.locale) || 'en-GB'; }
  function number(n, options) { return new Intl.NumberFormat(locale(), options).format(n); }

  function duration(minutes) {
    var d = Math.floor(minutes / 1440), h = Math.floor(minutes % 1440 / 60), m = minutes % 60;
    return [d && number(d) + 'd', h && number(h) + 'h', (m || (!d && !h)) && number(m) + 'm'].filter(Boolean).join(' ');
  }

  // The review boxes are text rather than type=number, which never groups
  // digits. A box shows its value in the page's format and reads typed numbers
  // back the same way, with or without the separators. Its min, max and step
  // attributes become a custom validity, so the box still refuses what a number
  // box would.
  function places(step) { var tail = String(step || 1).split('.')[1]; return tail ? tail.length : 0; }
  function shown(value, step) { return value === null || value === undefined ? '' : number(value, { maximumFractionDigits: places(step) }); }
  function parse(text) {
    var parts = new Intl.NumberFormat(locale()).formatToParts(1234567.5), sign = function (type) { var hit = parts.filter(function (x) { return x.type === type; })[0]; return hit ? hit.value : null; };
    var group = sign('group'), decimal = sign('decimal') || '.', digits = {};
    for (var i = 0; i < 10; i++) digits[number(i)] = String(i);
    var plain = Array.from(text.trim()).map(function (c) { return digits[c] || c; }).join('').replace(/[\s\u00a0\u202f]/g, '');
    if (group) plain = plain.split(group).join('');
    plain = plain.split(decimal).join('.').replace(/^[\u2212\u2013]/, '-');
    return /^-?\d+(\.\d+)?$/.test(plain) ? Number(plain) : NaN;
  }
  // The box's value: a number, null when empty, undefined when it refuses it.
  function boxValue(input, message) {
    var text = input.value.trim(), n = text === '' ? null : parse(text);
    var min = input.getAttribute('min'), max = input.getAttribute('max'), step = Number(input.getAttribute('step')) || 1;
    var ok = n === null || (isFinite(n) && (min === null || n >= Number(min)) && (max === null || n <= Number(max)) && Math.abs(n / step - Math.round(n / step)) < 1e-9);
    input.setCustomValidity(ok ? '' : message);
    return ok ? n : undefined;
  }

  M.register('screen-import', function (context) {
    var api = context.api, root = context.root;
    var queue = null, entries = [], current = 0, ocr = null, small = null, busy = false, lastApply = null, urls = [];
    var download = null, done = 0;
    var ledger = context.ledger;

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

    function downloading(p) { download = p.total && p.loaded >= p.total ? null : p; progress(); }
    function reader() { return ocr || (ocr = window.OcrClient.create({ onProgress: downloading })); }
    function wasm() { return small || (small = window.OcrClient.create({ backend: 'wasm', onProgress: downloading })); }
    // The piece last chosen on the hero gear page, for a gear shot whose troop
    // badge didn't read.
    function selectedGear() {
      try { return ledger ? ledger.snapshot().preferences.heroGear.selected || null : null; } catch (e) { return null; }
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
      var kit = null, bitmap = null;
      return engine().then(function () {
        var S = window.ScreenImport;
        kit = tools(next.blob, reader, wasm, selectedGear());
        // A screen known by its pixels skips the whole-screen read.
        // An image the page can't decode still goes to the reader.
        return kit.load().catch(function () { return null; }).then(function () {
          var known = kit.pixels && S.probe(kit.pixels);
          if (known) return { claim: known, page: S.page({ items: [] }) };
          return reader().read(next.blob, { useful: function (res) { return !!S.route(S.page({ items: res.items })); } }).then(function (res) {
            bitmap = res.preview;
            var page = S.page({ items: res.items, width: bitmap ? bitmap.width : 0, height: bitmap ? bitmap.height : 0 });
            var claim = S.route(page);
            return claim ? { claim: claim, page: page } : null;
          });
        }).then(function (found) {
          if (!found) { next.status = 'unknown'; return null; }
          var claim = found.claim;
          return Promise.resolve(claim.adapter.read(found.page, kit)).then(function (proposals) {
            proposals = proposals || [];
            if (!proposals.length) { next.status = 'empty'; return null; }
            return Promise.all(proposals.map(function (p) { return cut(bitmap, p.crop); })).then(function (crops) {
              next.adapter = claim.adapter.id;
              next.sourceType = claim.adapter.sourceType;
              // Review follows the screen top to bottom; values never found go last.
              next.proposals = proposals.map(function (p, i) {
                var item = { target: p.target || 'inventory', id: p.id, label: p.label, value: p.value, confidence: p.confidence, note: p.note || '', unit: p.unit || (/^speedup-/.test(p.id) ? 'minutes' : 'count'), crop: crops[i], y: typeof p.y === 'number' ? p.y : p.crop && typeof p.crop.y === 'number' ? p.crop.y : Infinity };
                ['max', 'min', 'step', 'side', 'sheet', 'group', 'cols', 'named'].forEach(function (k) { if (p[k] !== undefined) item[k] = p[k]; });
                if (p.target === 'gear') { item.piece = p.piece; item.field = p.field; item.quality = p.quality; }
                return item;
              }).sort(function (a, b) { return a.y - b.y; });
              next.layout = claim.adapter.layout || 'list';
              next.status = 'review';
            });
          });
        });
      }).then(function () {
        if (kit) kit.close();
        if (bitmap) bitmap.close();
      }).catch(function (err) {
        if (kit) kit.close();
        if (bitmap) bitmap.close();
        if (err && err.preview) err.preview.close();
        next.status = 'failed';
        if (window.console && console.error) console.error('[screen-import]', (err && err.message) || err);
      }).then(function () {
        busy = false;
        done++;
        if (next.status === 'review') current = reviewable().indexOf(next);
        return save(next);
      }).then(work);
    }

    // ── review ─────────────────────────────────────────
    var SCREENS = { 'overview-resources': ['import.screen.resources', 'Overview · Resources'], 'overview-speedups': ['import.screen.speedups', 'Overview · Speedups'], 'backpack-items': ['import.screen.backpack', 'Backpack items'], 'pet-list': ['import.screen.pets', 'Pet List'], 'hero-gear': ['import.screen.gear', 'Hero gear'], 'battle-report': ['import.screen.battle', 'Battle report'] };
    var QUALITY = { epic: ['import.quality.epic', 'epic'], mythic: ['import.quality.mythic', 'mythic'], red: ['import.quality.red', 'red'] };

    function note(p, value) {
      if (p.unit === 'minutes') return tr('import.minutesNote', 'minutes{d}', { d: value === null || value === undefined ? '' : ' · ' + duration(value) });
      if (p.unit === 'level') return tr('import.levelNote', 'level');
      if (p.side) return (p.side === 'you' ? tr('import.side.you', 'you') : tr('import.side.foe', 'opponent')) + (p.unit === 'percent' ? ' · %' : '');
      if (p.unit === 'gear-level' || p.unit === 'gear-mastery') {
        var q = QUALITY[p.quality], field = p.unit === 'gear-level' ? tr('import.gearLevel', 'enhancement') : tr('import.gearMastery', 'forge mastery');
        return q ? field + ' · ' + tr(q[0], q[1]) : field;
      }
      return p.note;
    }

    function translate(node) {
      node.querySelectorAll('[data-i18n]').forEach(function (n) { n.textContent = tr(n.dataset.i18n, n.textContent); });
    }
    function field(li, name) { return li.querySelector('[data-field="' + name + '"]'); }

    function tiles(entry) {
      var list = target('tiles'), template = target('tile');
      urls.forEach(function (u) { URL.revokeObjectURL(u); }); urls = [];
      var keys = entry ? entry.proposals.map(function (p) { return p.id; }).concat(entry.proposals.map(function (p) { return p.group ? 'crop:' + p.group : null; })) : [];
      Array.from(list.children).forEach(function (li) { if (keys.indexOf(li.dataset.key) === -1) li.remove(); });
      list.dataset.layout = entry ? entry.layout || 'list' : 'list';
      if (!entry) return;
      var doubts = doubtful(entry), at = 0;
      function place(li) { if (list.children[at] !== li) list.insertBefore(li, list.children[at] || null); at++; }
      function show(img, blob) {
        if (blob) { var url = URL.createObjectURL(blob); urls.push(url); img.src = url; img.hidden = false; } else { img.removeAttribute('src'); img.hidden = true; }
      }
      entry.proposals.forEach(function (p, i) {
        // Values read from one row (a stat's two sides, the troop counts) sit
        // side by side under its cut-out, shown once as a row of its own.
        var prev = entry.proposals[i - 1], follows = !!(p.group && prev && prev.group === p.group);
        if (p.group && !follows) {
          var row = list.querySelector('[data-key="crop:' + p.group + '"]');
          if (!row) { row = document.createElement('li'); row.className = 'import-crop'; row.dataset.key = 'crop:' + p.group; row.appendChild(document.createElement('img')).alt = ''; }
          show(row.firstChild, p.crop);
          row.hidden = !p.crop;
          row.dataset.state = entry.proposals.some(function (q) { return q.group === p.group && doubts.indexOf(q) !== -1; }) ? 'doubt' : 'sure';
          place(row);
        }
        var li = list.querySelector('[data-key="' + p.id + '"]');
        if (!li) { li = template.content.firstElementChild.cloneNode(true); li.dataset.key = p.id; translate(li); }
        var edit = entry.edits[p.id] || {}, value = edit.value !== undefined ? edit.value : p.value;
        li.dataset.group = p.group ? 'cell' : 'own';
        if (p.cols) li.dataset.cols = String(p.cols); else delete li.dataset.cols;
        show(field(li, 'crop'), p.group ? null : p.crop);
        // A cut-out that names the value leaves its label to screen readers.
        var label = field(li, 'label');
        label.textContent = tr('import.item.' + p.id, p.label);
        label.classList.toggle('import-hidden', !!p.named);
        var input = field(li, 'value');
        input.placeholder = tr('import.unread', 'not read');
        if (p.max !== undefined) input.setAttribute('max', String(p.max)); else input.removeAttribute('max');
        input.setAttribute('min', p.min !== undefined ? String(p.min) : '0');
        input.setAttribute('step', p.step !== undefined ? String(p.step) : '1');
        input.inputMode = places(p.step) || p.min < 0 ? 'decimal' : 'numeric';
        if (document.activeElement !== input) input.value = shown(value, p.step);
        boxValue(input, tr('import.badNumber', 'Enter a number this box can take.'));
        field(li, 'note').textContent = note(p, value);
        field(li, 'include').checked = included(entry, p);
        var later = newer(entry, p);
        if (later) field(li, 'note').textContent = tr('import.newer', 'a newer shot reads {v}', { v: shown(valueOf(later, later.proposals.filter(function (q) { return q.id === p.id; })[0]), p.step) });
        li.dataset.state = doubts.indexOf(p) !== -1 ? 'doubt' : 'sure';
        place(li);
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
      if (waiting.length) progress();
      else if (entries.some(function (e) { return e.status === 'unknown'; })) status(tr('import.unknown', 'One screenshot isn’t a screen I can read yet. It was skipped. Email it to screenshots@dey.ci to have it added.'));
      else if (entries.some(function (e) { return e.status === 'empty'; })) status(tr('import.empty', 'No items I track were found on one screenshot. It was skipped. If it shows items that should count, email it to screenshots@dey.ci.'));
      else if (entries.some(function (e) { return e.status === 'failed'; })) status(tr('import.failed', 'A screenshot couldn’t be read. Try it again, or a clearer shot.'));
      else if (entry) status(checks ? tr('import.check', '{n} values need a look. Everything else is ticked.', { n: api.fmt(checks) }) : tr('import.allSure', 'Everything was read. Check the numbers, then apply.'));
      if (!waiting.length) { done = 0; progress(); }
      // Unknown and failed shots are reported once, then dropped from the queue.
      entries.filter(function (e) { return e.status === 'unknown' || e.status === 'failed' || e.status === 'empty'; }).forEach(forget);
    }

    // While shots wait: the model download on a device that doesn't have the
    // models yet, then which shot is being read. Repainted on every download
    // step without touching the tiles.
    function progress() {
      var bar = target('progress'), waiting = entries.filter(function (e) { return e.status === 'queued' || e.status === 'reading'; }).length;
      bar.hidden = !waiting;
      if (!waiting) return;
      var total = done + waiting, mb = function (bytes) { return number(bytes / 1e6, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 }); };
      if (download) {
        status(download.total
          ? tr('import.downloadingOf', 'Downloading the reading models, once per device: {loaded} of {total}.', { loaded: mb(download.loaded), total: mb(download.total) })
          : tr('import.downloading', 'Downloading the reading models, once per device: {loaded}.', { loaded: mb(download.loaded) }));
        bar.max = download.total || 1;
        if (download.total) bar.value = download.loaded; else bar.removeAttribute('value');
      } else {
        status(tr('import.readingOf', 'Reading screenshot {i} of {n}…', { i: api.fmt(done + 1), n: api.fmt(total) }));
        // One shot has no steps to show, so its bar just says it is working.
        bar.max = total;
        if (total > 1) bar.value = done; else bar.removeAttribute('value');
      }
    }

    function edit(node) {
      var entry = reviewable()[current], li = node.closest('[data-key]');
      if (!entry || !li) return;
      var e = entry.edits[li.dataset.key] || (entry.edits[li.dataset.key] = {});
      if (node.dataset.field === 'value') {
        var p = entry.proposals.filter(function (q) { return q.id === li.dataset.key; })[0], n = boxValue(node, tr('import.badNumber', 'Enter a number this box can take.'));
        if (n === undefined) return;
        e.value = n;
        node.value = shown(n, p && p.step);
        if (e.include === undefined) e.include = e.value !== null;
      } else e.include = node.checked;
      e.touched = true;
      save(entry);
      render();
    }

    // A hero gear piece's ticked fields; the fields left out keep their saved
    // value. A red piece's level is reviewed as its +N.
    function gearDelta(before, fields) {
      var out = {};
      Object.keys(fields).forEach(function (id) {
        var old = before.heroGear.pieces[id] || null, base = old || { quality: null, level: null, mastery: null }, f = fields[id];
        var quality = f.quality || base.quality;
        out[id] = { before: old, after: { quality: quality, level: f.level !== undefined ? f.level + (quality === 'red' ? 100 : 0) : base.level, mastery: f.mastery !== undefined ? f.mastery : base.mastery } };
      });
      return out;
    }

    // A ticked number the box refuses, if any.
    function invalidInput() {
      return Array.from(target('tiles').querySelectorAll('[data-field="value"]')).filter(function (input) {
        var li = input.closest('[data-key]'), box = li && li.querySelector('[data-field="include"]');
        return box && box.checked && input.value !== '' && !input.validity.valid;
      })[0] || null;
    }

    // A page's own sheet (the battle simulator's Bonus Details) takes a shot's
    // values when it is open: it marks itself [data-screen-import-sheet] and
    // answers 'screen-import:sheet' { values, before } by writing the values
    // and filling `before` with what they replaced. Nothing reaches the
    // player save.
    function sheetHost(name) { return document.querySelector('[data-screen-import-sheet~="' + name + '"]'); }
    function applySheet(entry) {
      var name = entry.proposals[0].sheet, host = sheetHost(name), values = {}, n = 0;
      if (!host) { status(tr('import.openSheet', 'Open the battle simulator to apply this report. It waits here until then.')); return; }
      entry.proposals.forEach(function (p) {
        var value = valueOf(entry, p);
        if (!included(entry, p) || value === null || !isFinite(value)) return;
        values[p.id] = value; n++;
      });
      if (!n) { status(tr('import.nothing', 'Nothing is ticked to apply.')); return; }
      var detail = { values: values, before: {} };
      host.dispatchEvent(new CustomEvent('screen-import:sheet', { bubbles: true, detail: detail }));
      lastApply = { sheet: name, before: detail.before, name: entry.name };
      forget(entry).then(function () {
        render();
        status(tr('import.applied', 'Saved {n} values from {name}.', { n: api.fmt(n), name: entry.name }));
        context.emit('screen-import:applied', { sheet: name, values: values });
      });
    }

    function apply() {
      var entry = reviewable()[current];
      if (!entry || !ledger) return;
      // A number the box refuses is never applied as the value read before it.
      var bad = invalidInput();
      if (bad) { status(tr('import.invalid', 'One value can’t be saved. Fix the marked number, or untick it.')); if (bad.reportValidity) bad.reportValidity(); return; }
      if (entry.proposals.some(function (p) { return p.target === 'sheet'; })) return applySheet(entry);
      // Inventory counts, pet levels and gear pieces go to their own parts of the record.
      var before = ledger.snapshot(), applied = {}, stock = {}, pets = {}, gear = {};
      entry.proposals.forEach(function (p) {
        var value = valueOf(entry, p), include = included(entry, p);
        if (!include || value === null || !Number.isSafeInteger(value) || value < 0) return;
        if (p.target === 'gear') {
          var f = gear[p.piece] || (gear[p.piece] = { quality: p.quality });
          f[p.field] = value;
          applied[p.id] = true;
          return;
        }
        if (p.target === 'pet') {
          if (value < 1) return;
          var pet = (before.pets && before.pets.roster || {})[p.id];
          pets[p.id] = { before: pet ? pet.level : null, after: value };
          applied[p.id] = true;
          return;
        }
        var held = before.inventory[p.id];
        stock[p.id] = { before: held && held.status === 'confirmed' ? held.amount : null, after: value };
        applied[p.id] = true;
      });
      var n = Object.keys(applied).length;
      if (!n) { status(tr('import.nothing', 'Nothing is ticked to apply.')); return; }
      var record = { id: 'shot-' + entry.hash, sourceType: entry.sourceType, at: new Date().toISOString(), contentHash: entry.hash, confirmation: 'confirmed' };
      if (Object.keys(stock).length) record.inventoryDelta = stock;
      if (Object.keys(pets).length) record.petDelta = pets;
      if (Object.keys(gear).length || entry.sourceType === 'hero-gear') record.itemDelta = gearDelta(before, gear);
      try {
        ledger.applyImport(record, before.revision);
      } catch (err) {
        var already = /already/.test(err.message), moved = /changed/.test(err.message);
        status(already ? tr('import.already', '{name} was already applied.', { name: entry.name }) : moved ? tr('import.changed', 'Your saved data changed in another tab. Check the numbers and apply again.') : tr('import.invalid', 'One value can’t be saved. Fix the marked number, or untick it.'));
        if (already) forget(entry).then(render);
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
        e.proposals = e.proposals.filter(function (p) { return !applied[p.id]; });
        return e.proposals.length ? save(e) : forget(e);
      }));
      cleared.then(function () { return forget(entry); }).then(function () {
        render();
        status(tr('import.applied', 'Saved {n} values from {name}.', { n: api.fmt(n), name: entry.name }));
        context.emit('screen-import:applied', { record: record });
      });
    }

    function undo() {
      if (lastApply && lastApply.sheet) {
        var host = sheetHost(lastApply.sheet);
        if (!host) { status(tr('import.openSheet', 'Open the battle simulator to apply this report. It waits here until then.')); return; }
        host.dispatchEvent(new CustomEvent('screen-import:sheet', { bubbles: true, detail: { values: lastApply.before, before: {} } }));
        status(tr('import.undone', 'Undone. {name} can be applied again.', { name: lastApply.name }));
        lastApply = null;
        render();
        return;
      }
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
    context.cleanup(function () { urls.forEach(function (u) { URL.revokeObjectURL(u); }); if (ocr) ocr.close(); if (small) small.close(); });

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
