/* The site-wide screenshot import dock (SCREENSHOT-IMPORT.md), an Alpine controller:
   x-data="screenImport" on #screen-import in _includes/screen-import.html, which is on every page.
   The dock stays hidden until there is something to read: a pick, a paste anywhere on the page,
   or a [data-screen-import] button a page offers. Each screenshot is read once, claimed by a
   screen adapter (js/screen-import-core.js) and reviewed as a grid of cut-outs with one input each.
   Nothing reaches the player ledger until "apply", and the work in progress survives moving
   between pages (js/import-queue.js). The OCR engine and the adapters load on first use.

   The queue's entries hold blobs and bitmaps, so they live outside Alpine's reactive data; `rev`
   moves whenever they change and the getters that lay out the dock read it. */
import { Alpine, words } from '../alpine.mjs';

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
    ['import-adapters/battle-report.js', function () { return window.ScreenImport.get('battle-report'); }],
    ['import-adapters/bonus-overview.js', function () { return window.ScreenImport.get('bonus-overview'); }],
    ['governor-data.js', function () { return window.GovernorData; }],
    ['governor-ocr.js', function () { return window.GovernorOCR; }],
    ['import-adapters/governor.js', function () { return window.ScreenImport.get('governor-profile'); }]
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
  // A big count beside its exact box, the way the reader says it: 1.58B, 1,58 Mrd., 15.8億.
  function compact(n) { return number(n, { notation: 'compact', maximumFractionDigits: 2 }); }

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

const tr = (key, fallback, vars) => words.t(key, fallback, vars);
const fmt = n => words.fmt(n);
const SCREENS = { 'overview-resources': ['import.screen.resources', 'Overview · Resources'], 'overview-speedups': ['import.screen.speedups', 'Overview · Speedups'], 'backpack-items': ['import.screen.backpack', 'Backpack items'], 'pet-list': ['import.screen.pets', 'Pet List'], 'hero-gear': ['import.screen.gear', 'Hero gear'], 'battle-report': ['import.screen.battle', 'Battle report'], 'governor-profile': ['import.screen.governor', 'Governor Profile'] };
const QUALITY = { epic: ['import.quality.epic', 'epic'], mythic: ['import.quality.mythic', 'mythic'], red: ['import.quality.red', 'red'] };
const OPEN = {
  'battle-report': ['import.openSheet', 'Apply this on the battle simulator.'],
  governor: ['import.openGovernor', 'Apply this on the governor gear page.'],
  'bonus-overview': ['import.openOverview', 'Apply this on the Heroes page.']
};
// Five screens that fill most of the save, ticked off from its import history: an undone apply
// leaves no record, so its row unticks too. The Overview shots are told apart by what they saved,
// since both are 'backpack' records.
const BASICS = ['bread', 'wood', 'stone', 'iron'], BAG = ['resources', 'speedups', 'backpack'], RECIPES = ['resources', 'speedups', 'backpack', 'gear', 'pets'];
function covered(record) {
  const stock = Object.keys(record.inventoryDelta || {}), out = [];
  if (stock.some(id => BASICS.indexOf(id) !== -1)) out.push('resources');
  if (stock.some(id => /^speedup-/.test(id))) out.push('speedups');
  if (record.sourceType === 'backpack' && stock.some(id => BASICS.indexOf(id) === -1 && !/^speedup-/.test(id))) out.push('backpack');
  if (record.sourceType === 'hero-gear') out.push('gear');
  if (record.sourceType === 'pets') out.push('pets');
  return out;
}
// A hero gear piece's ticked fields; the fields left out keep their saved value. A red piece's
// level is reviewed as its +N.
function gearDelta(before, fields) {
  const out = {};
  Object.keys(fields).forEach(id => {
    const old = before.heroGear.pieces[id] || null, base = old || { quality: null, level: null, mastery: null }, f = fields[id];
    const quality = f.quality || base.quality;
    out[id] = { before: old, after: { quality, level: f.level !== undefined ? f.level + (quality === 'red' ? 100 : 0) : base.level, mastery: f.mastery !== undefined ? f.mastery : base.mastery } };
  });
  return out;
}
const sheetHost = name => document.querySelector('[data-screen-import-sheet~="' + name + '"]');
const stamp = e => [e.lastModified || 0, e.added || 0];

Alpine.data('screenImport', () => {
  let self = null, root = null;
  let queue = null, entries = [], current = 0, ocr = null, small = null, busy = false, lastApply = null, download = null, done = 0;
  const urls = new Map();
  const ledger = () => Alpine.store('ledger').store;
  const raw = Alpine.raw;

  function status(key, fallback, vars) { self.msg = key ? { key, fallback, vars } : null; }
  function emit(name, detail) { root.dispatchEvent(new CustomEvent(name, { bubbles: true, detail })); }
  function open(expanded) { self.visible = true; self.expanded = expanded; }
  function urlOf(blob) {
    if (!blob) return null;
    if (!urls.has(blob)) urls.set(blob, URL.createObjectURL(blob));
    return urls.get(blob);
  }
  function reviewable() { return entries.filter(e => e.status === 'review'); }
  function waiting() { return entries.filter(e => e.status === 'queued' || e.status === 'reading'); }
  function doubtful(entry) {
    const S = window.ScreenImport, doubt = S ? S.DOUBT : 0.75;
    return entry.proposals.filter(p => { const edit = entry.edits[p.id]; return !(edit && edit.touched) && (p.value === null || p.confidence < doubt); });
  }
  function valueOf(entry, p) { const e = entry.edits[p.id] || {}; return e.value !== undefined ? e.value : p.value; }
  // Shots taken at different moments disagree (keys 200, then 140 after opening some). The newest
  // file wins: an item a newer shot waiting in the dock also shows starts unticked here, and says
  // what the newer one read.
  function newer(entry, p) {
    const mine = stamp(entry);
    return reviewable().filter(e => {
      if (e === entry) return false;
      const theirs = stamp(e);
      return (theirs[0] > mine[0] || (theirs[0] === mine[0] && theirs[1] > mine[1])) && e.proposals.some(q => q.id === p.id && valueOf(e, q) !== null);
    })[0] || null;
  }
  function included(entry, p) {
    const e = entry.edits[p.id] || {};
    if (e.include !== undefined) return e.include;
    return valueOf(entry, p) !== null && !newer(entry, p);
  }

  function downloading(p) { download = p.total && p.loaded >= p.total ? null : p; progress(); }
  function reader() { return ocr || (ocr = window.OcrClient.create({ onProgress: downloading })); }
  function wasm() { return small || (small = window.OcrClient.create({ backend: 'wasm', onProgress: downloading })); }
  // The piece last chosen on the hero gear page, for a gear shot whose troop badge didn't read.
  function selectedGear() {
    try { const s = ledger(); return s ? s.snapshot().preferences.heroGear.selected || null : null; } catch (e) { return null; }
  }
  function save(entry) { return queue ? queue.put(raw(entry)).catch(() => {}) : Promise.resolve(); }
  function forget(entry) {
    entries = entries.filter(e => e !== entry);
    entry.proposals.forEach(p => { if (p.crop && urls.has(p.crop)) { URL.revokeObjectURL(urls.get(p.crop)); urls.delete(p.crop); } });
    return queue ? queue.remove(entry.id).catch(() => {}) : Promise.resolve();
  }

  // ── reading ────────────────────────────────────────
  function add(files) {
    files = Array.from(files || []).filter(f => f && /^image\//.test(f.type));
    if (!files.length) return Promise.resolve();
    open(true);
    return Promise.all(files.map(file => sha256(file).then(hash => {
      if (entries.some(e => e.hash === hash)) return null;
      const s = ledger();
      if (s && s.snapshot().imports.some(r => r.contentHash === hash)) { status('import.already', '{name} was already applied.', { name: file.name || '' }); return null; }
      const entry = { id: hash.slice(0, 16), hash, name: file.name || tr('import.pasted', 'Pasted screenshot'), added: Date.now(), lastModified: file.lastModified || Date.now(), blob: file, status: 'queued', proposals: [], edits: {} };
      entries.push(entry);
      return save(entry);
    }))).then(() => { render(); return work(); });
  }

  function work() {
    if (busy) return Promise.resolve();
    const next = entries.filter(e => e.status === 'queued' || e.status === 'reading')[0];
    if (!next) { render(); return Promise.resolve(); }
    busy = true;
    next.status = 'reading';
    render();
    let kit = null, bitmap = null;
    return engine().then(() => {
      const S = window.ScreenImport;
      kit = tools(next.blob, reader, wasm, selectedGear());
      // A screen known by its pixels skips the whole-screen read. An image the page can't decode
      // still goes to the reader.
      return kit.load().catch(() => null).then(() => Promise.resolve(kit.pixels ? S.probe(kit.pixels) : null)).then(known => {
        if (known) return { claim: known, page: S.page({ items: [] }) };
        return reader().read(next.blob, { useful: res => !!S.route(S.page({ items: res.items })) }).then(res => {
          bitmap = res.preview;
          const page = S.page({ items: res.items, width: bitmap ? bitmap.width : 0, height: bitmap ? bitmap.height : 0 });
          const claim = S.route(page);
          return claim ? { claim, page } : null;
        });
      }).then(found => {
        if (!found) { next.status = 'unknown'; return null; }
        const claim = found.claim;
        return Promise.resolve(claim.adapter.read(found.page, kit)).then(proposals => {
          proposals = proposals || [];
          if (!proposals.length) { next.status = 'empty'; return null; }
          return Promise.all(proposals.map(p => cut(bitmap, p.crop))).then(crops => {
            next.adapter = claim.adapter.id;
            next.sourceType = claim.adapter.sourceType;
            // Review follows the screen top to bottom; values never found go last.
            next.proposals = proposals.map((p, i) => {
              const item = { target: p.target || 'inventory', id: p.id, label: p.label, value: p.value, confidence: p.confidence, note: p.note || '', unit: p.unit || (/^speedup-/.test(p.id) ? 'minutes' : 'count'), crop: crops[i], y: typeof p.y === 'number' ? p.y : p.crop && typeof p.crop.y === 'number' ? p.crop.y : Infinity };
              ['max', 'min', 'step', 'side', 'sheet', 'group', 'groupLabel', 'cols', 'named'].forEach(k => { if (p[k] !== undefined) item[k] = p[k]; });
              if (p.target === 'gear') { item.piece = p.piece; item.field = p.field; item.quality = p.quality; }
              return item;
            }).sort((a, b) => a.y - b.y);
            next.layout = claim.adapter.layout || 'list';
            next.status = 'review';
          });
        });
      });
    }).then(() => {
      if (kit) kit.close();
      if (bitmap) bitmap.close();
    }).catch(err => {
      if (kit) kit.close();
      if (bitmap) bitmap.close();
      if (err && err.preview) err.preview.close();
      next.status = 'failed';
      if (window.console && console.error) console.error('[screen-import]', (err && err.message) || err);
    }).then(() => {
      busy = false;
      done++;
      if (next.status === 'review') current = reviewable().indexOf(next);
      return save(next);
    }).then(work);
  }

  // ── review ─────────────────────────────────────────
  function note(p, value, entry) {
    const S = window.ScreenImport, own = S && entry && S.get(entry.adapter);
    const said = own && own.note ? own.note(p, value, (key, fallback) => tr(key, fallback)) : null;
    if (said !== null && said !== undefined) return said;
    if (p.unit === 'minutes') return tr('import.minutesNote', 'minutes{d}', { d: value === null || value === undefined ? '' : ' · ' + duration(value) });
    if (p.unit === 'level') return tr('import.levelNote', 'level');
    if (p.side) return (p.side === 'you' ? tr('import.side.you', 'you') : tr('import.side.foe', 'opponent')) + (p.unit === 'percent' ? ' · %' : '');
    if (p.unit === 'gear-level' || p.unit === 'gear-mastery') {
      const q = QUALITY[p.quality], field = p.unit === 'gear-level' ? tr('import.gearLevel', 'enhancement') : tr('import.gearMastery', 'forge mastery');
      return q && !p.group ? field + ' · ' + tr(q[0], q[1]) : field;
    }
    if (p.unit === 'count' && typeof value === 'number' && value >= 1e6) return compact(value) + (p.note ? ' · ' + p.note : '');
    return p.note;
  }

  // While shots wait: the model download on a device that doesn't have the models yet, then
  // which shot is being read.
  function progress() {
    const count = waiting().length;
    self.bar = { hidden: !count, max: 1, value: null };
    if (!count) return;
    const total = done + count, mb = bytes => number(bytes / 1e6, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 });
    if (download) {
      if (download.total) status('import.downloadingOf', 'Downloading the reading models: {loaded} of {total}.', { loaded: mb(download.loaded), total: mb(download.total) });
      else status('import.downloading', 'Downloading the reading models: {loaded}.', { loaded: mb(download.loaded) });
      self.bar = { hidden: false, max: download.total || 1, value: download.total ? download.loaded : null };
    } else {
      status('import.readingOf', 'Reading screenshot {i} of {n}…', { i: done + 1, n: total });
      // One shot has no steps to show, so its bar just says it is working.
      self.bar = { hidden: false, max: total, value: total > 1 ? done : null };
    }
    self.rev++;
  }

  function render() {
    const list = reviewable(), wait = waiting();
    if (current >= list.length) current = Math.max(0, list.length - 1);
    const entry = list[current] || null, checks = list.reduce((n, e) => n + doubtful(e).length, 0);
    if (!entries.length && !lastApply && !self.expanded) self.visible = false;
    if (wait.length) progress();
    else if (entries.some(e => e.status === 'unknown')) status('import.unknown', 'I can’t read that screen yet. Email it to screenshots@dey.ci and I’ll add it.');
    else if (entries.some(e => e.status === 'empty')) status('import.empty', 'No items I track were found. If they should count, email the screenshot to screenshots@dey.ci.');
    else if (entries.some(e => e.status === 'failed')) status('import.failed', 'I couldn’t read a screenshot. Try it again, or try a clearer one.');
    else if (entry) status(checks ? 'import.check' : 'import.allSure', checks ? '{n} values need a look.' : 'Everything was read. Check the numbers, then apply.', checks ? { n: checks } : undefined);
    if (!wait.length) { done = 0; self.bar = { hidden: true, max: 1, value: null }; }
    // Unknown and failed shots are reported once, then dropped from the queue.
    entries.filter(e => e.status === 'unknown' || e.status === 'failed' || e.status === 'empty').forEach(forget);
    self.rev++;
  }

  function openSheet(name) { const say = OPEN[name] || OPEN['battle-report']; status(say[0], say[1]); self.rev++; }
  function applySheet(entry) {
    const name = entry.proposals[0].sheet, host = sheetHost(name), values = {};
    let n = 0;
    if (!host) { openSheet(name); return; }
    entry.proposals.forEach(p => {
      const value = valueOf(entry, p);
      if (!included(entry, p) || value === null || !isFinite(value)) return;
      values[p.id] = value; n++;
    });
    if (!n) { status('import.nothing', 'Nothing is ticked to apply.'); self.rev++; return; }
    const detail = { values, before: {} };
    host.dispatchEvent(new CustomEvent('screen-import:sheet', { bubbles: true, detail }));
    lastApply = { sheet: name, before: detail.before, name: entry.name };
    forget(entry).then(() => {
      render();
      status('import.applied', 'Saved {n} values from {name}.', { n, name: entry.name });
      emit('screen-import:applied', { sheet: name, values });
    });
  }

  function apply() {
    const entry = reviewable()[current], s = ledger();
    if (!entry || !s) return;
    // A number the box refuses is never applied as the value read before it.
    const bad = Array.from(root.querySelectorAll('[data-field="value"]')).filter(input => {
      const li = input.closest('[data-key]'), box = li && li.querySelector('[data-field="include"]');
      return box && box.checked && input.value !== '' && !input.validity.valid;
    })[0] || null;
    if (bad) { status('import.invalid', 'One value can’t be saved. Fix the marked number, or untick it.'); self.rev++; if (bad.reportValidity) bad.reportValidity(); return; }
    if (entry.proposals.some(p => p.target === 'sheet')) return applySheet(entry);
    // Inventory counts, pet levels and gear pieces go to their own parts of the record.
    const before = s.snapshot(), applied = {}, stock = {}, pets = {}, gear = {};
    entry.proposals.forEach(p => {
      const value = valueOf(entry, p), include = included(entry, p);
      if (!include || value === null || !Number.isSafeInteger(value) || value < 0) return;
      if (p.target === 'gear') {
        const f = gear[p.piece] || (gear[p.piece] = { quality: p.quality });
        f[p.field] = value;
        applied[p.id] = true;
        return;
      }
      if (p.target === 'pet') {
        if (value < 1) return;
        const pet = (before.pets && before.pets.roster || {})[p.id];
        pets[p.id] = { before: pet ? pet.level : null, after: value };
        applied[p.id] = true;
        return;
      }
      const held = before.inventory[p.id];
      stock[p.id] = { before: held && held.status === 'confirmed' ? held.amount : null, after: value };
      applied[p.id] = true;
    });
    const n = Object.keys(applied).length;
    if (!n) { status('import.nothing', 'Nothing is ticked to apply.'); self.rev++; return; }
    const record = { id: 'shot-' + entry.hash, sourceType: entry.sourceType, at: new Date().toISOString(), contentHash: entry.hash, confirmation: 'confirmed' };
    if (Object.keys(stock).length) record.inventoryDelta = stock;
    if (Object.keys(pets).length) record.petDelta = pets;
    if (Object.keys(gear).length || entry.sourceType === 'hero-gear') record.itemDelta = gearDelta(before, gear);
    // Undo restores the save and its history, so an undone shot leaves no history behind.
    const backup = s.backup ? s.backup() : before;
    try {
      s.applyImport(record, before.revision);
    } catch (err) {
      const already = /already/.test(err.message), moved = /changed/.test(err.message);
      if (already) status('import.already', '{name} was already applied.', { name: entry.name });
      else if (moved) status('import.changed', 'Your saved data changed in another tab. Check the numbers and apply again.');
      else status('import.invalid', 'One value can’t be saved. Fix the marked number, or untick it.');
      self.rev++;
      if (already) forget(entry).then(render);
      return;
    }
    lastApply = { before: backup, name: entry.name };
    // Older shots in the dock lose the items this one just saved; their values are stale now. A
    // shot left with nothing goes too.
    const mine = stamp(entry);
    const stale = reviewable().filter(e => { const theirs = stamp(e); return e !== entry && (theirs[0] < mine[0] || (theirs[0] === mine[0] && theirs[1] < mine[1])); });
    Promise.all(stale.map(e => {
      e.proposals = e.proposals.filter(p => !applied[p.id]);
      return e.proposals.length ? save(e) : forget(e);
    })).then(() => forget(entry)).then(() => {
      render();
      status('import.applied', 'Saved {n} values from {name}.', { n, name: entry.name });
      emit('screen-import:applied', { record });
    });
  }

  return {
    ...words,
    // The dock as it shows: hidden until there is something to read; `msg` is the status line.
    rev: 0, visible: false, expanded: false, filter: 'all', msg: null, bar: { hidden: true, max: 1, value: null },

    init() {
      self = this; root = this.$root;
      // A page's own [data-screen-import] button opens the dock.
      document.addEventListener('click', event => {
        const opener = event.target.closest && event.target.closest('[data-screen-import]');
        if (!opener) return;
        event.preventDefault();
        open(true); render();
        if (opener.dataset.screenImport === 'pick') this.$refs.files.click();
      });
      // A page's own upload area ([data-screen-import-drop]) takes dropped screenshots straight to the dock.
      const dropZone = event => event.target && event.target.closest && event.target.closest('[data-screen-import-drop]');
      const hasFiles = event => event.dataTransfer && Array.from(event.dataTransfer.types || []).indexOf('Files') >= 0;
      document.addEventListener('dragover', event => {
        const zone = dropZone(event);
        if (!zone || !hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        zone.dataset.dragging = 'true';
      });
      document.addEventListener('dragleave', event => {
        const zone = dropZone(event);
        if (zone && !zone.contains(event.relatedTarget)) delete zone.dataset.dragging;
      });
      document.addEventListener('drop', event => {
        const zone = dropZone(event);
        if (!zone) return;
        event.preventDefault();
        delete zone.dataset.dragging;
        add(event.dataTransfer && event.dataTransfer.files);
      });
      // A screenshot pasted anywhere on the site goes to the dock, unless the reader is pasting into a text field.
      document.addEventListener('paste', event => {
        if (event.target && event.target.closest && event.target.closest('input, textarea, [contenteditable]')) return;
        const files = Array.from((event.clipboardData && event.clipboardData.files) || []).filter(f => /^image\//.test(f.type));
        if (!files.length) return;
        event.preventDefault();
        add(files);
      });
      window.ImportQueue.open().then(q => { queue = q; return q.all(); }).then(saved => {
        entries = saved.filter(e => e.status !== 'applied').concat(entries.filter(e => !saved.some(s => s.id === e.id)));
        if (entries.length && !this.expanded) { this.visible = true; open(false); }
        render();
        work();
      });
    },

    // ── what the dock shows ──
    get entry() { this.rev; return reviewable()[current] || null; },
    get reading() { this.rev; return waiting().length > 0; },
    get statusText() { this.rev; const m = this.msg; return m ? tr(m.key, m.fallback, m.vars && Object.fromEntries(Object.entries(m.vars).map(([k, v]) => [k, typeof v === 'number' ? fmt(v) : v]))) : ''; },
    get countText() {
      this.rev;
      const list = reviewable();
      return waiting().length ? tr('import.reading', 'reading…') : list.length ? tr('import.toReview', '{n} to review', { n: fmt(list.length) }) : '';
    },
    get screenText() { const e = this.entry; if (!e) return ''; const s = SCREENS[e.adapter] || [null, e.adapter]; return s[0] ? tr(s[0], s[1]) : s[1]; },
    get positionText() { this.rev; const n = reviewable().length; return this.entry ? tr('import.position', '{i} of {n}', { i: fmt(current + 1), n: fmt(n) }) : ''; },
    get doubts() { const e = this.entry; return e ? doubtful(e).length : 0; },
    get needsLookText() { return tr('import.needsLook', 'needs a look ({n})', { n: fmt(this.doubts) }); },
    get needsLookHidden() { return !this.doubts && this.filter !== 'doubt'; },
    get undoHidden() { this.rev; return !lastApply; },
    get layout() { const e = this.entry; return e ? e.layout || 'list' : 'list'; },

    // The recipe: which of the five screens the save's import history already covers.
    get recipe() {
      this.$store.ledger.v; this.rev;
      const have = {};
      try { const s = ledger(); (s ? s.snapshot().imports : []).forEach(r => covered(r).forEach(k => { have[k] = true; })); } catch (e) { /* none yet */ }
      const n = RECIPES.filter(k => have[k]).length;
      return { have, hidden: !!this.entry || this.reading, listHidden: n === RECIPES.length, count: tr('import.recipe.count', '{i} of {n}', { i: fmt(n), n: fmt(RECIPES.length) }), nextHidden: !BAG.every(k => have[k]) };
    },

    // The review grid: a row for each cut-out and each value, in screen order.
    get tiles() {
      this.rev;
      const entry = this.entry;
      if (!entry) return [];
      const doubts = doubtful(entry), rows = [];
      entry.proposals.forEach((p, i) => {
        // Values read from one row (a stat's two sides, the troop counts) sit side by side under
        // its cut-out, shown once as a row of its own.
        const prev = entry.proposals[i - 1], follows = !!(p.group && prev && prev.group === p.group);
        if (p.group && !follows) {
          rows.push({ key: 'crop:' + p.group, crop: true, src: urlOf(p.crop), label: p.groupLabel || '', hidden: !p.crop && !p.groupLabel, state: entry.proposals.some(q => q.group === p.group && doubts.indexOf(q) !== -1) ? 'doubt' : 'sure' });
        }
        const edit = entry.edits[p.id] || {}, value = edit.value !== undefined ? edit.value : p.value, later = newer(entry, p);
        const laterProposal = later && later.proposals.filter(q => q.id === p.id)[0];
        rows.push({
          key: p.id, crop: false, group: p.group ? 'cell' : 'own', cols: p.cols ? String(p.cols) : null,
          src: p.group ? null : urlOf(p.crop),
          // A cut-out that names the value leaves its label to screen readers.
          label: tr('import.item.' + p.id, p.label), hideLabel: !!p.named,
          note: later ? tr('import.newer', 'a newer shot reads {v}', { v: shown(valueOf(later, laterProposal), p.step) }) : note(p, value, entry),
          placeholder: tr('import.unread', 'not read'), max: p.max, min: p.min !== undefined ? p.min : 0, step: p.step !== undefined ? p.step : 1,
          inputMode: places(p.step) || p.min < 0 ? 'decimal' : 'numeric',
          value: shown(value, p.step), include: included(entry, p), state: doubts.indexOf(p) !== -1 ? 'doubt' : 'sure'
        });
      });
      return rows;
    },
    // A review box shows its value in the page's format; one being typed in keeps what is typed.
    syncBox(input, row) {
      if (row.max !== undefined) input.setAttribute('max', String(row.max)); else input.removeAttribute('max');
      input.setAttribute('min', String(row.min)); input.setAttribute('step', String(row.step));
      if (document.activeElement !== input) input.value = row.value;
      boxValue(input, tr('import.badNumber', 'Enter a number this box can take.'));
    },

    // ── actions ──
    toggle() { open(!this.expanded); render(); },
    pick() { this.$refs.files.click(); },
    add(input) { const files = Array.from(input.files || []); input.value = ''; return add(files); },
    editBox(node, row) {
      const entry = reviewable()[current];
      if (!entry) return;
      const e = entry.edits[row.key] || (entry.edits[row.key] = {});
      if (node.dataset.field === 'value') {
        const p = entry.proposals.filter(q => q.id === row.key)[0], n = boxValue(node, tr('import.badNumber', 'Enter a number this box can take.'));
        if (n === undefined) return;
        e.value = n;
        node.value = shown(n, p && p.step);
        if (e.include === undefined) e.include = e.value !== null;
      } else e.include = node.checked;
      e.touched = true;
      save(entry);
      render();
    },
    needsLook() { this.filter = this.filter !== 'doubt' ? 'doubt' : 'all'; render(); },
    prev() { const n = reviewable().length; if (n) { current = (current - 1 + n) % n; render(); } },
    next() { const n = reviewable().length; if (n) { current = (current + 1) % n; render(); } },
    discard() { const entry = reviewable()[current]; if (entry) forget(entry).then(render); },
    apply,
    undo() {
      if (lastApply && lastApply.sheet) {
        const host = sheetHost(lastApply.sheet);
        if (!host) { openSheet(lastApply.sheet); return; }
        host.dispatchEvent(new CustomEvent('screen-import:sheet', { bubbles: true, detail: { values: lastApply.before, before: {} } }));
        status('import.undone', 'Undone.');
        lastApply = null;
        render();
        return;
      }
      const s = ledger();
      if (!lastApply || !s) return;
      try { s.importJSON(lastApply.before, null, s.snapshot().revision); } catch (err) { status('import.changed', 'Your saved data changed in another tab. Check the numbers and apply again.'); this.rev++; return; }
      status('import.undone', 'Undone.');
      lastApply = null;
      render();
    }
  };
});
