/* Reads a Governor Profile screenshot into the page's sheet. The reading itself lives in
   governor-ocr.js; this loads the picture and the page's own art into canvases, then shows
   each piece's cut-out beside what was read before anything changes. Nothing leaves the
   device, and the save is never touched: "use these" writes the sheet like any other edit. */
(function () {
  'use strict';
  var EN = {
    reading: 'Reading the screenshot…', failed: 'That picture could not be opened.',
    notProfile: 'That does not look like a Governor Profile. Open your profile in game, screenshot the whole screen, and try again.',
    summary: 'Check each piece against your screenshot.', doubts: '{n} marked ◇ look unsure: check those first.',
    after: 'Anything wrong can be fixed afterwards by tapping the piece.', applied: 'Levels read from the screenshot.',
    doubt: '◇', 'slot.hat': 'Hat', 'slot.amulet': 'Amulet', 'slot.armour': 'Armour', 'slot.trousers': 'Trousers', 'slot.ring': 'Ring', 'slot.staff': 'Staff'
  };
  var ORDER = ['cav-1', 'cav-2', 'inf-1', 'inf-2', 'arc-1', 'arc-2'], SURE = 0.4, MAX_WIDTH = 1080;
  var templates = null;
  function picture(src) {
    return new Promise(function (resolve, reject) { var img = new Image(); img.onload = function () { resolve(img); }; img.onerror = reject; img.src = src; });
  }
  function pixels(img, width) {
    var scale = Math.min(1, (width || img.naturalWidth) / img.naturalWidth), canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
    var ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { canvas: canvas, image: ctx.getImageData(0, 0, canvas.width, canvas.height) };
  }
  // Every card each piece can show and every charm, once per visit.
  function loadTemplates(G, art) {
    if (templates) return templates;
    var jobs = [], out = { gear: {}, charms: {} }, looks = {};
    G.data.gear.levels.forEach(function (row) { looks[row.tier + '-' + row.grade] = true; });
    G.items('gear').forEach(function (piece) {
      out.gear[piece.id] = {};
      Object.keys(looks).forEach(function (look) { jobs.push(picture(art + 'gear/' + piece.id + '-' + look + '.webp').then(function (img) { out.gear[piece.id][look] = pixels(img).image; })); });
    });
    ['inf', 'cav', 'arc'].forEach(function (troop) {
      out.charms[troop] = {};
      for (var level = 1; level <= G.max('charms'); level++) (function (level) { jobs.push(picture(art + 'charms/' + troop + '-' + level + '.webp').then(function (img) { out.charms[troop][level] = pixels(img).image; })); })(level);
    });
    templates = Promise.all(jobs).then(function () { return window.GovernorOCR.prepare(out); }, function (cause) { templates = null; throw cause; });
    return templates;
  }
  window.Interactions.register('governor-read', function (context) {
    var G = window.Governor, store = context.ledger, api = context.api, root = context.root, reading = null;
    var art = root.dataset.art || '../img/governor/', dialog = context.targets('dialog')[0];
    var view = window.GovernorView.create(G, api, art, { emptyGemLabel: '', stars: '[data-part="stars"]' });
    function t(key) { return api.tr((/^slot\./.test(key) ? 'gov.' : 'gov.read.') + key, EN[key]); }
    function el(tag, text, cls) { var node = document.createElement(tag); if (text !== undefined && text !== null) node.textContent = text; if (cls) node.className = cls; return node; }
    function img(src, size) { var node = el('img'); node.src = src; node.alt = ''; node.width = size; node.height = size; return node; }
    function status(text) { context.targets('status').forEach(function (node) { node.textContent = text; }); }
    function piece(id) { return G.data.gear.pieces.find(function (p) { return p.id === id; }); }
    // The card and its charm strip as they are in the screenshot.
    function cutout(canvas, box) {
      var side = box.x1 - box.x0, x0 = Math.max(0, box.x0 - side * 0.08), y0 = Math.max(0, box.y0), w = Math.min(canvas.width - x0, side * 1.16), h = Math.min(canvas.height - y0, side * 1.42);
      var out = el('canvas', null, 'gov-read-shot'); out.width = 116; out.height = 142;
      out.getContext('2d').drawImage(canvas, x0, y0, w, h, 0, 0, 116, 142);
      return out;
    }
    function row(id, result, canvas) {
      var p = piece(id), gear = result.gear[id], li = el('li', null, 'gov-read-row'), doubts = 0;
      li.dataset.item = id;
      li.appendChild(gear.box ? cutout(canvas, gear.box) : el('span', '?', 'gov-read-shot'));
      var ours = el('div', null, 'gov-read-ours'), card = el('span', null, 'gov-card'), stars = el('span', null, 'gov-stars');
      stars.dataset.part = 'stars'; card.append(img(art + 'gear/' + id + '-green-0.webp', 160), stars); view.paintCard(card, id, gear.level);
      var gems = el('span', null, 'gov-gems');
      [1, 2, 3].forEach(function (c) {
        var charm = result.charms[id + '-' + c], gem = el('span', null, 'gov-gem');
        gem.append(img(art + 'charms/' + p.troop + '-1.webp', 72), el('b')); view.paintGem(gem, p.troop, charm.level);
        if (charm.confidence < SURE) { gem.dataset.doubt = 'true'; doubts++; }
        gems.appendChild(gem);
      });
      var text = el('p', null, 'gov-read-text');
      text.append(el('span', t('slot.' + p.slot), 'gov-read-name'), el('span', view.levelName('gear', gear.level) + (gear.confidence < SURE ? ' ' + t('doubt') : ''), gear.confidence < SURE ? 'gov-read-level gov-read-doubt' : 'gov-read-level'));
      text.appendChild(el('span', [1, 2, 3].map(function (c) { var charm = result.charms[id + '-' + c]; return (charm.level === null ? '—' : api.fmt(charm.level)) + (charm.confidence < SURE ? t('doubt') : ''); }).join(' · '), 'gov-read-charms'));
      if (gear.confidence < SURE) doubts++;
      ours.append(card, gems);
      li.append(ours, text);
      li.dataset.doubt = String(doubts > 0);
      return { node: li, doubts: doubts };
    }
    function review(result, canvas) {
      var rows = ORDER.map(function (id) { return row(id, result, canvas); }), doubts = rows.reduce(function (n, r) { return n + r.doubts; }, 0);
      context.targets('rows').forEach(function (list) { list.replaceChildren.apply(list, rows.map(function (r) { return r.node; })); });
      context.targets('summary').forEach(function (node) { node.textContent = t('summary') + ' ' + (doubts ? api.fill(t('doubts'), { n: api.fmt(doubts) }) + ' ' : '') + t('after'); });
      if (dialog && !dialog.open) dialog.showModal();
    }
    function read(file) {
      if (!file) return;
      status(t('reading'));
      var url = URL.createObjectURL(file);
      Promise.all([picture(url), loadTemplates(G, art)]).then(function (both) {
        var shot = pixels(both[0], MAX_WIDTH), result = window.GovernorOCR.read(shot.image, both[1]);
        if (result.found < 3) { status(t('notProfile')); return; }
        reading = result; status('');
        review(result, shot.canvas);
      }).catch(function () { status(t('failed')); }).then(function () { URL.revokeObjectURL(url); });
    }
    if (dialog) context.listen(dialog, 'close', function () { context.targets('file').forEach(function (input) { input.value = ''; }); });
    return { actions: {
      pick: { run: function () { var input = context.targets('file')[0]; if (input) input.click(); } },
      file: { events: ['change'], run: function (input) { read(input.files && input.files[0]); } },
      cancel: { run: function () { reading = null; if (dialog) dialog.close(); } },
      use: { run: function () {
        if (!reading) return;
        var gear = {}, charms = {};
        Object.keys(reading.gear).forEach(function (id) { if (reading.gear[id].level !== null) gear[id] = reading.gear[id].level; });
        Object.keys(reading.charms).forEach(function (id) { if (reading.charms[id].level !== null) charms[id] = reading.charms[id].level; });
        if (Object.keys(gear).length) store.setGovernor('gear', gear);
        if (Object.keys(charms).length) store.setGovernor('charms', charms);
        reading = null; status(t('applied'));
        if (dialog) dialog.close();
      } }
    } };
  });
})();
