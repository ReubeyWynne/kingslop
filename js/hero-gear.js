(function () {
  'use strict';
  var E = window.HeroGear, BH, state, previous, result, running = false, revision = 0;
  var STORAGE = 'bh:hero-gear:v1', imports = [], reader, readerSequence = 0, readerPending = {};
  var scriptURL = new URL(document.currentScript.src);
  var base = new URL('./', scriptURL);
  var art = new URL('../img/hero-gear/', base), troopArt = { inf: 'infantry', cav: 'cavalry', arc: 'archer' };
  var resourceArt = { xp: 'xp-part-100', hammers: 'forgehammer', mythic: 'mythic-gear', mithril: 'mithril' };
  var parts = { ten: 0, hundred: 0 };
  function workerURL(filename) { var url = new URL(filename, base); url.search = scriptURL.search; return url; }
  function partsTotal() { return Math.min(1e9, parts.ten * 10 + parts.hundred * 100); }
  function partsFromXP(xp) { xp = Math.max(0, Math.floor(Number(xp) || 0)); return { ten: Math.floor((xp % 100) / 10), hundred: Math.floor(xp / 100) }; }
  function syncXP() { state.resources.xp = partsTotal(); }
  function el(id) { return document.getElementById('gear-' + id); }
  function tr(key) { return BH.tr('gear.' + key, key); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return BH.fmt(n); }
  function copy(s) { return JSON.parse(JSON.stringify(s)); }
  function name(id) { var p = id.split('-'); return tr(p[0]) + ' · ' + tr(p[1]); }
  function quality(q) { return tr(q === 'mythic' ? 'mythicQuality' : q); }
  function image(filename, cls) { return '<img class="' + cls + '" src="' + new URL(filename + '.webp', art).href + '" alt="" width="256" height="256">'; }
  function gearImage(id, cls) { var p = id.split('-'); return image(troopArt[p[0]] + '-' + p[1], cls); }
  function levelLabel(p) { return '+' + (p.quality === 'red' ? p.level - 100 : p.level); }
  function pieceLabel(p) { return quality(p.quality) + ' ' + (p.quality === 'red' ? '+' + (p.level - 100) : p.level) + ' · ' + tr('mastery') + ' ' + p.mastery; }
  function note(key) { el('status').hidden = false; el('status').textContent = tr(key); }
  function persist() {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(Object.assign({}, state, { parts: parts })));
      el('save').textContent = tr('saved');
    } catch (error) { el('save').textContent = tr('saveFailed'); }
  }
  function changed() {
    revision++;
    result = null;
    el('results').textContent = '';
    persist();
    paintAnswer();
  }
  function numberInput(id, key, p, max) {
    return '<label><span>' + esc(tr(key)) + '</span><input type="number" inputmode="numeric" min="' + (key === 'level' && p.quality === 'red' ? 100 : 0) + '" max="' + max + '" step="1" data-piece="' + id + '" data-field="' + key + '" value="' + p[key] + '" aria-label="' + esc(name(id) + ' · ' + tr(key)) + '"' + (key === 'mastery' && p.quality === 'epic' ? ' disabled' : '') + '></label>';
  }
  function paintView() {
    el('forge').dataset.view = state.view;
    el('views').querySelectorAll('[data-view]').forEach(function (button) {
      var active = button.dataset.view === state.view;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    });
  }
  function paintEdit() {
    var id = state.selected, p = state.pieces[id];
    el('edit-title').textContent = name(id);
    el('edit-fields').innerHTML = '<div class="gear-edit-art">' + gearImage(id, 'gear-art') + '<span>' + esc(pieceLabel(p)) + '</span></div><div class="gear-edit-inputs"><label><span>' + esc(tr('quality')) + '</span><select data-piece="' + id + '" data-field="quality">' + ['epic','mythic','red'].map(function (q) { return '<option value="' + q + '"' + (q === p.quality ? ' selected' : '') + '>' + esc(quality(q)) + '</option>'; }).join('') + '</select></label>' + numberInput(id, 'level', p, E.cap(p)) + numberInput(id, 'mastery', p, 20) + '</div>';
  }
  function editPiece(id) { if (id) selectPiece(id); paintEdit(); el('edit-dialog').showModal(); }
  function paintEditor() {
    el('troops').querySelectorAll('[data-troop]').forEach(function (button) {
      var active = button.dataset.troop === state.troop;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    el('editor-panel').setAttribute('aria-labelledby', 'gear-tab-' + state.troop);
    el('include').checked = state.included[state.troop];
    el('rows').innerHTML = E.SLOTS.map(function (slot) {
      var id = state.troop + '-' + slot, p = state.pieces[id];
      return '<button type="button" class="gear-row" data-select="' + id + '" data-selected="' + (state.selected === id) + '" aria-pressed="' + (state.selected === id) + '" aria-label="' + esc(name(id) + ' · ' + pieceLabel(p)) + '">' + gearImage(id, 'gear-art') + '<span class="gear-piece-info"><span class="gear-slot">' + esc(tr(slot)) + '</span><strong class="gear-level">' + levelLabel(p) + '</strong><span class="gear-rarity gear-rarity-' + p.quality + '">' + esc(quality(p.quality)) + '</span><small>' + esc(tr('mastery')) + ' ' + p.mastery + '</small></span></button>';
    }).join('');
    el('selected').innerHTML = Object.keys(state.pieces).map(function (id) { return '<option value="' + id + '"' + (id === state.selected ? ' selected' : '') + '>' + esc(name(id)) + '</option>'; }).join('');
    el('profile').value = state.profile;
    el('reforge').checked = state.reforge;
    el('weights').innerHTML = E.TYPES.map(function (type) {
      return '<div class="gear-weight-row"><span>' + esc(tr(type)) + '</span>' + [0, 1].map(function (i) {
        var label = tr(i ? 'health' : 'lethality');
        return '<label><span>' + esc(label) + '</span><input type="number" min="0" max="100" step="0.1" inputmode="decimal" data-weight="' + type + '" data-stat="' + i + '" value="' + state.weights[type][i] + '" aria-label="' + esc(tr(type) + ' · ' + label) + '"></label>';
      }).join('') + '</div>';
    }).join('');
  }
  function costTable(costs) {
    var gaps = E.gap(costs, state.resources);
    return '<div class="gear-cost-ledger" role="list">' + E.RES.map(function (r) {
      var progress = costs[r] ? Math.min(100, state.resources[r] / costs[r] * 100) : 100;
      return '<div class="gear-cost-row" data-cost-resource="' + r + '" role="listitem">' + image(resourceArt[r], 'gear-resource-art') + '<div class="gear-cost-info"><span>' + esc(tr(r)) + '</span><progress max="100" value="' + progress + '" aria-label="' + esc(tr(r)) + '"></progress><small>' + esc(tr('have')) + ' ' + fmt(state.resources[r]) + '</small></div><div class="gear-cost-numbers"><strong>' + fmt(costs[r]) + '</strong><small class="' + (gaps[r] ? 'gear-short' : 'gear-ready') + '">' + (gaps[r] ? fmt(gaps[r]) + ' ' + esc(tr('missingShort')) : esc(tr('readyShort'))) + '</small></div></div>';
    }).join('') + '</div>';
  }
  function paintPreview(from, to) {
    el('preview').innerHTML = '<button type="button" data-view="plan" class="gear-preview-button">' + gearImage(state.selected, 'gear-preview-art') + '<span><strong>' + esc(name(state.selected)) + '</strong><span>' + levelLabel(from) + (to ? ' → ' + levelLabel(to) : '') + '</span></span><span class="gear-preview-link">' + esc(tr('viewPlan')) + ' →</span></button>';
  }
  function nextTarget() {
    var p = state.pieces[state.selected];
    return state.mode === 'plan' ? E.target(p, state.target, state.targetMastery, state.target > 100) : E.milestone(p, state.goal);
  }
  function statText(delta) {
    return ['core', 'attack', 'defense'].filter(function (key) { return Math.abs(delta[key]) > .01; }).map(function (key) {
      return '+' + (Math.abs(delta[key]) < 10 ? delta[key].toFixed(1) : Math.round(delta[key])) + ' ' + tr(key);
    }).join(' · ') || tr('noStatChange');
  }
  function costText(costs) {
    return E.RES.filter(function (r) { return costs[r]; }).map(function (r) { return fmt(costs[r]) + ' ' + tr(r); }).join(' · ') || tr('noCost');
  }
  function planCards() {
    return Object.keys(state.pieces).filter(function (id) { return state.included[id.split('-')[0]]; }).map(function (id) {
      var from = state.pieces[id], to = E.target(from, state.target, state.targetMastery, state.target > 100);
      if (!to || (to.level === from.level && to.mastery === from.mastery && to.quality === from.quality)) return '';
      var slot = id.split('-')[1], before = E.stats(from, slot), after = E.stats(to, slot), delta = { core: after.core - before.core, attack: after.attack - before.attack, defense: after.defense - before.defense }, costs = E.cost(from, to), gap = E.gap(costs, state.resources), ready = E.affordable(costs, state.resources);
      return '<article class="gear-plan-card' + (ready ? ' gear-plan-ready' : '') + (id === state.selected ? ' gear-plan-selected' : '') + '"><button type="button" class="gear-plan-select" data-select="' + id + '"><span class="gear-plan-art">' + gearImage(id, 'gear-art') + '</span><span class="gear-plan-main"><strong>' + esc(name(id)) + '</strong><span class="gear-plan-destination">' + esc(pieceLabel(from)) + ' → ' + esc(pieceLabel(to)) + '</span><span class="gear-plan-stats">' + esc(statText(delta)) + '</span></span><span class="gear-plan-state">' + (ready ? esc(tr('ready')) : esc(tr('saving'))) + '</span></button><div class="gear-plan-cost"><span>' + esc(costText(costs)) + '</span><small>' + (ready ? esc(tr('costReady')) : esc(tr('missingShort')) + ': ' + esc(costText(gap))) + '</small></div></article>';
    }).filter(Boolean).join('');
  }
  function planOutput() {
    var cards = planCards();
    return '<div class="gear-plan-intro"><h3>' + esc(tr('planTitle')) + '</h3><p class="gear-gloss">' + esc(tr('planHint')) + '</p></div><div class="gear-plan-cards">' + (cards || '<p class="gear-gloss">' + esc(tr('planEmpty')) + '</p>') + '</div>';
  }
  function paintAnswer() {
    var isOptimise = state.mode === 'optimise', isPlan = state.mode === 'plan';
    el('modes').querySelectorAll('[data-mode]').forEach(function (button) {
      var active = button.dataset.mode === state.mode;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    });
    el('answer-panel').setAttribute('aria-labelledby', 'gear-mode-' + state.mode);
    el('piece-select').hidden = isOptimise;
    el('goals').hidden = isOptimise || isPlan;
    el('targets').hidden = !isPlan;
    el('target-presets').hidden = !isPlan;
    el('optimise-panel').hidden = !isOptimise;
    el('milestone-out').hidden = isOptimise;
    el('target').value = state.target;
    el('target-mastery').value = state.targetMastery;
    el('goals').querySelectorAll('[data-goal]').forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.goal === state.goal)); });
    if (isOptimise) { paintPreview(state.pieces[state.selected], null); return; }
    if (isPlan) { paintPreview(state.pieces[state.selected], nextTarget()); el('milestone-out').innerHTML = planOutput(); return; }
    var from = state.pieces[state.selected], to = nextTarget(), out = el('milestone-out');
    paintPreview(from, to);
    if (!to) { out.innerHTML = '<p class="gear-gloss">' + esc(tr(from.quality === 'epic' ? 'epicBlocked' : state.goal === 'red' ? 'alreadyRed' : 'maxed')) + '</p>' + nearList(); return; }
    var costs = E.cost(from, to), ready = E.affordable(costs, state.resources);
    out.innerHTML = '<h3>' + esc(name(state.selected)) + '</h3><button type="button" class="gear-upgrade" data-edit-piece="' + state.selected + '" aria-label="' + esc(tr('editPiece')) + '">' + gearImage(state.selected, 'gear-upgrade-art') + '<span><span class="gear-upgrade-levels">' + levelLabel(from) + ' <span>→</span> ' + levelLabel(to) + '</span><small>' + esc(tr('mastery')) + ' ' + from.mastery + ' → ' + to.mastery + '</small><small>' + esc(quality(from.quality)) + (from.quality !== to.quality ? ' → ' + esc(quality(to.quality)) : '') + '</small></span></button>' + costTable(costs) +
      (ready ? '<p class="gear-gloss">' + esc(tr('ready')) + '</p><button type="button" id="gear-apply-milestone" class="gear-primary">' + esc(tr('applyMilestone')) + '</button>' : '') +
      '<details class="gear-cost-note"><summary>' + esc(tr('costIncludes')) + '</summary><p class="gear-gloss">' + esc(tr('includesMastery')) + '</p><p class="gear-gloss">' + esc(tr('applyHint')) + '</p></details>' + (isPlan ? '' : nearList());
  }
  function nearList() {
    var candidates = Object.keys(state.pieces).filter(function (id) { return state.included[id.split('-')[0]]; }).map(function (id) {
      var to = E.milestone(state.pieces[id], state.goal);
      if (!to) return null;
      var costs = E.cost(state.pieces[id], to), gap = E.gap(costs, state.resources);
      var distance = E.RES.reduce(function (sum, r) { return sum + gap[r] / Math.max(1, costs[r]); }, 0);
      return { id: id, to: to, gap: gap, distance: distance };
    }).filter(Boolean).sort(function (a, b) { return a.distance - b.distance || a.id.localeCompare(b.id); });
    return '<details class="gear-near-list"><summary>' + esc(tr('comparePieces')) + '</summary>' + candidates.map(function (c) {
      var missing = E.RES.filter(function (r) { return c.gap[r]; }).map(function (r) { return fmt(c.gap[r]) + ' ' + tr(r); }).join(' · ');
      return '<button type="button" class="gear-near-piece" data-select="' + c.id + '"><span>' + esc(name(c.id)) + ' → ' + (c.to.quality === 'red' ? '+' + (c.to.level - 100) : c.to.level) + '</span><span>' + esc(missing || tr('readyShort')) + '</span></button>';
    }).join('') + '</details>';
  }
  function paint() {
    E.RES.forEach(function (r) { if (el(r)) el(r).value = state.resources[r]; });
    el('parts10').value = parts.ten;
    el('parts100').value = parts.hundred;
    paintParts();
    paintEditor(); paintAnswer(); paintView();
  }
  function paintParts() { el('xp-total').textContent = fmt(partsTotal()); }
  function selectPiece(id) {
    state.selected = id; state.troop = id.split('-')[0];
    persist(); paintEditor(); paintAnswer();
  }
  function applyState(next) {
    previous = { state: copy(state), parts: copy(parts) };
    state = E.normaliseState(next);
    if (next.parts) parts = { ten: Math.min(1e7, Math.max(0, Math.floor(Number(next.parts.ten) || 0))), hundred: Math.min(1e7, Math.max(0, Math.floor(Number(next.parts.hundred) || 0))) };
    else parts = partsFromXP(state.resources.xp);
    syncXP();
    changed(); paint(); el('undo').hidden = false;
  }
  function paintResults() {
    if (!result) return;
    var percent = result.baseline > 0 ? 100 * result.gain / result.baseline : 0;
    var summary = BH.fill(tr('gain'), { n: percent.toFixed(2) });
    var details = result.details || result.changes.map(function (id) { return { id: id, from: state.pieces[id], to: result.pieces[id], costs: E.cost(state.pieces[id], result.pieces[id]), delta: { core: 0, attack: 0, defense: 0 }, gain: 0 }; });
    el('results').innerHTML = '<h3>' + esc(result.changes.length ? tr('recommendationTitle') : tr('noUpgrades')) + '</h3>' + (result.changes.length ?
      '<p class="gear-result-lede">' + esc(summary) + '. ' + esc(tr('recommendationHint')) + '</p><div class="gear-result-list">' + details.map(function (detail) {
        return '<article class="gear-result"><div class="gear-result-head"><strong>' + esc(name(detail.id)) + '</strong><span>' + esc(pieceLabel(detail.from)) + ' → ' + esc(pieceLabel(detail.to)) + '</span></div><p>' + esc(tr('spend')) + ': ' + (detail.reforged ? esc(tr('reforged')) : esc(costText(detail.costs))) + '</p><p>' + esc(tr('impact')) + ': ' + esc(statText(detail.delta)) + '</p></article>';
      }).join('') + '</div><p class="gear-gloss">' + esc(tr('remaining')) + ': ' + E.RES.map(function (r) { return fmt(result.remaining[r]) + ' ' + esc(tr(r)); }).join(' · ') + '</p>' +
      (result.refund ? '<p class="gear-gloss">' + esc(tr('refunded')) + ': ' + fmt(result.refund) + ' XP</p>' : '') + '<p class="gear-gloss">' + esc(tr('applyHint')) + '</p><button type="button" id="gear-apply-result" class="gear-primary">' + esc(tr('applyResult')) + '</button>' : '<p class="gear-gloss">' + esc(tr('noUpgradesHint')) + '</p>');
  }
  function run() {
    if (running) return;
    running = true;
    el('run').disabled = true;
    el('run').textContent = tr('running');
    var currentRevision = revision, worker;
    function done() { running = false; el('run').disabled = false; el('run').textContent = tr('run'); if (worker) worker.terminate(); }
    var timer = setTimeout(function () { done(); note('runFailed'); }, 60000);
    try {
      worker = new Worker(workerURL('hero-gear-worker.js'));
      worker.onmessage = function (event) {
        clearTimeout(timer); done();
        if (currentRevision !== revision) { note('stale'); return; }
        if (!event.data.ok) { note('runFailed'); return; }
        result = event.data.result; paintResults();
      };
      worker.onerror = function () { clearTimeout(timer); done(); note('runFailed'); };
      worker.postMessage(state);
    } catch (error) { clearTimeout(timer); done(); note('runFailed'); }
  }
  function killReader() {
    if (reader) reader.terminate(); reader = null;
    Object.keys(readerPending).forEach(function (id) { readerPending[id].reject(new Error('Reader unavailable')); });
    readerPending = {};
  }
  function read(file) {
    return new Promise(function (resolve, reject) {
      var id = ++readerSequence, timer = setTimeout(function () { killReader(); }, 120000);
      readerPending[id] = {
        resolve: function (res) { clearTimeout(timer); resolve(res); },
        reject: function (error) { clearTimeout(timer); reject(error); }
      };
      try {
        if (!reader) {
          reader = new Worker(workerURL('ocr-worker.js'), { type: 'module' });
          reader.onmessage = function (event) {
            var response = event.data, waiting = readerPending[response.id];
            if (response.preview) response.preview.close();
            if (!waiting) return;
            delete readerPending[response.id];
            if (response.ok) waiting.resolve(response); else waiting.reject(new Error(response.error));
          };
          reader.onerror = killReader; reader.onmessageerror = killReader;
        }
        reader.postMessage({ id: id, type: 'predict', blob: file });
      } catch (error) { killReader(); }
    });
  }
  function clearImports() {
    imports.forEach(function (item) { URL.revokeObjectURL(item.url); }); imports = [];
    el('import-review').textContent = ''; el('read-status').textContent = ''; el('apply-import').disabled = true;
    el('images').value = '';
  }
  function importItem(item, index) {
    function input(key, max) { return '<label><span>' + esc(tr(key)) + '</span><input type="number" min="0" max="' + max + '" step="1" data-import-index="' + index + '" data-import-field="' + key + '" value="' + (item[key] === null ? '' : item[key]) + '" placeholder="' + esc(tr('unread')) + '"></label>'; }
    function select(key, values) { return '<label><span>' + esc(tr(key)) + '</span><select data-import-index="' + index + '" data-import-field="' + key + '">' + values.map(function (v) { return '<option value="' + v + '"' + (item[key] === v ? ' selected' : '') + '>' + esc(v === '' ? tr('chooseTroop') : v === 'mythic' ? tr('mythicQuality') : tr(v)) + '</option>'; }).join('') + '</select></label>'; }
    return '<div class="gear-import-item"><div class="gear-import-source"><img src="' + esc(item.url) + '" alt="' + esc(item.filename) + '"><label class="gear-include"><input type="checkbox" checked data-import-index="' + index + '" data-import-field="included"><span>' + esc(tr('includeImport')) + '</span></label></div><div class="gear-import-fields">' + select('troop', item.overview ? [''].concat(E.TYPES) : E.TYPES) + select('slot', E.SLOTS) + select('quality', ['keep','epic','mythic','red']) + input('level', 200) + input('mastery', 20) + '<p class="gear-gloss">' + esc(item.filename) + '</p><p class="gear-gloss">' + esc(tr(item.failed ? 'readFailed' : item.level === null && item.mastery === null ? 'readEmpty' : 'readReview')) + '</p></div></div>';
  }
  async function readImages() {
    var files = Array.from(el('images').files || []);
    clearImports();
    if (!files.length) return;
    if (files.length > 12 || files.some(function (file) { return !file.type.startsWith('image/') || file.size > 20 * 1024 * 1024; })) { el('read-status').textContent = tr('imageLimit'); return; }
    el('images').disabled = true;
    el('close-import').disabled = true;
    el('cancel-import').disabled = true;
    try {
      for (var i = 0; i < files.length; i++) {
        el('read-status').textContent = BH.fill(tr('reading'), { n: i + 1, total: files.length });
        var pieces;
        try { pieces = await window.HeroGearOCR.overview(files[i], read); }
        catch (error) { pieces = null; }
        try {
          if (!pieces) pieces = [window.HeroGearOCR.parse((await read(files[i])).items)];
        } catch (error) { pieces = [{ level: null, mastery: null, failed: true }]; }
        pieces.forEach(function (parsed) {
          var item = Object.assign({}, parsed, { troop: parsed.overview ? parsed.troop || '' : parsed.troop || state.troop, slot: parsed.slot || state.selected.split('-')[1], quality: parsed.quality || 'keep', filename: files[i].name, url: URL.createObjectURL(parsed.preview || files[i]), included: true });
          delete item.preview;
          imports.push(item);
          el('import-review').insertAdjacentHTML('beforeend', importItem(item, imports.length - 1));
        });
      }
      el('read-status').textContent = tr('readReview');
      el('apply-import').disabled = false;
    } finally {
      el('images').disabled = false; el('close-import').disabled = false; el('cancel-import').disabled = false;
    }
  }
  function tabKeys(container, attr) {
    container.addEventListener('keydown', function (event) {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      var buttons = Array.from(container.querySelectorAll('[' + attr + ']')), index = buttons.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault();
      var rtl = document.documentElement.dir === 'rtl';
      var step = event.key === 'ArrowRight' ? (rtl ? -1 : 1) : (rtl ? 1 : -1);
      var next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + step + buttons.length) % buttons.length;
      buttons[next].click(); buttons[next].focus();
    });
  }
  function boot(api) {
    BH = api; state = E.defaults();
    try {
      var saved = localStorage.getItem(STORAGE);
      if (saved) {
        var input = JSON.parse(saved);
        if (input.version !== 1) throw new Error('Unknown save');
        state = E.normaliseState(input);
        if (input.parts) parts = { ten: Math.min(1e7, Math.max(0, Math.floor(Number(input.parts.ten) || 0))), hundred: Math.min(1e7, Math.max(0, Math.floor(Number(input.parts.hundred) || 0))) };
        else parts = partsFromXP(state.resources.xp);
      }
    } catch (error) { note('loadFailed'); }
    syncXP();
    paint(); persist();
    document.addEventListener('input', function (event) {
      var node = event.target;
      if (node.dataset.resourcePart) {
        parts[node.dataset.resourcePart] = Math.min(1e7, Math.max(0, Math.floor(Number(node.value) || 0)));
        syncXP(); paintParts(); revision++; result = null; el('results').textContent = ''; persist(); paintAnswer(); return;
      } else if (node.dataset.resource) state.resources[node.dataset.resource] = Math.min(1e9, Math.max(0, Math.floor(Number(node.value) || 0)));
      else if (node.dataset.piece && node.dataset.field !== 'quality') {
        state.pieces[node.dataset.piece] = E.normalisePiece(Object.assign({}, state.pieces[node.dataset.piece], { [node.dataset.field]: Number(node.value) }));
        paintEditor();
        el('edit-fields').querySelector('.gear-edit-art span').textContent = pieceLabel(state.pieces[node.dataset.piece]);
      } else if (node.dataset.weight) {
        state.profile = 'custom'; el('profile').value = 'custom';
        state.weights[node.dataset.weight][Number(node.dataset.stat)] = Math.min(100, Math.max(0, Number(node.value) || 0));
      } else if (node.id === 'gear-target') state.target = Math.min(200, Math.max(0, Math.floor(Number(node.value) || 0)));
      else if (node.id === 'gear-target-mastery') state.targetMastery = Math.min(20, Math.max(0, Math.floor(Number(node.value) || 0)));
      else return;
      revision++; result = null; el('results').textContent = ''; persist();
      if (node.id !== 'gear-target' && node.id !== 'gear-target-mastery') paintAnswer();
      else {
        var value = node.value; paintAnswer(); node.value = value;
      }
    });
    document.addEventListener('change', function (event) {
      var node = event.target;
      if (node.dataset.piece) {
        if (node.dataset.field === 'quality') state.pieces[node.dataset.piece] = E.normalisePiece(Object.assign({}, state.pieces[node.dataset.piece], { quality: node.value }));
        changed(); paintEditor();
        if (node.dataset.field === 'quality') paintEdit();
        else node.value = state.pieces[node.dataset.piece][node.dataset.field];
      } else if (node.dataset.resourcePart) { node.value = parts[node.dataset.resourcePart]; }
      else if (node.dataset.resource) node.value = state.resources[node.dataset.resource];
      else if (node.id === 'gear-include') { state.included[state.troop] = node.checked; changed(); }
      else if (node.id === 'gear-reforge') { state.reforge = node.checked; changed(); }
      else if (node.id === 'gear-profile') {
        state.profile = node.value;
        if (E.PROFILES[node.value]) state.weights = copy(E.PROFILES[node.value]);
        changed(); paintEditor();
      } else if (node.id === 'gear-selected') selectPiece(node.value);
    });
    el('forge').addEventListener('click', function (event) {
      var button = event.target.closest('button'); if (!button) return;
      if (button.dataset.troop) selectPiece(button.dataset.troop + '-' + state.selected.split('-')[1]);
      else if (button.dataset.select && button.classList.contains('gear-row')) editPiece(button.dataset.select);
      else if (button.dataset.select) selectPiece(button.dataset.select);
      else if (button.dataset.editPiece) editPiece(button.dataset.editPiece);
      else if (button.dataset.targetLevel) { state.target = Number(button.dataset.targetLevel); state.targetMastery = Math.max(state.targetMastery, state.target > 100 ? 10 + Math.floor((state.target - 100) / 20) : 0); persist(); paintAnswer(); }
      else if (button.dataset.view) { state.view = button.dataset.view; persist(); paintView(); }
      else if (button.dataset.mode) { state.mode = button.dataset.mode; persist(); paintAnswer(); }
      else if (button.dataset.goal) { state.goal = button.dataset.goal; persist(); paintAnswer(); }
      else if (button.id === 'gear-apply-result' && result) {
        var next = copy(state); next.pieces = result.pieces; next.resources = result.remaining;
        applyState(next); note('applied');
      } else if (button.id === 'gear-apply-milestone') {
        var target = nextTarget(); if (!target) return;
        var costs = E.cost(state.pieces[state.selected], target); if (!E.affordable(costs, state.resources)) return;
        var updated = copy(state); updated.pieces[state.selected] = target;
        E.RES.forEach(function (r) { updated.resources[r] -= costs[r]; });
        applyState(updated); note('applied');
      }
    });
    tabKeys(el('troops'), 'data-troop'); tabKeys(el('modes'), 'data-mode'); tabKeys(el('views'), 'data-view');
    el('edit').addEventListener('click', function () { editPiece(); });
    el('close-edit').addEventListener('click', function () { el('edit-dialog').close(); });
    el('edit-dialog').addEventListener('close', function () {
      paintEditor(); paintAnswer();
      var button = document.querySelector('.gear-row[data-select="' + state.selected + '"]');
      if (button && button.getClientRects().length) button.focus();
      else { button = document.querySelector('.gear-upgrade'); if (button) button.focus(); }
    });
    el('run').addEventListener('click', run);
    el('undo').addEventListener('click', function () { if (!previous) return; state = previous.state; parts = previous.parts; previous = null; changed(); paint(); el('undo').hidden = true; note('undone'); });
    el('export').addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(Object.assign({}, state, { parts: parts }), null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = 'kingshot-hero-gear.json'; link.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
    el('load').addEventListener('click', function () { el('save-file').click(); });
    el('save-file').addEventListener('change', async function () {
      var file = this.files[0]; this.value = ''; if (!file) return;
      try {
        if (file.size > 1024 * 1024) throw new Error('Too large');
        var data = JSON.parse(await file.text());
        if (data.version !== 1 || !data.pieces || !data.resources || Object.keys(E.defaults().pieces).some(function (id) { return !data.pieces[id]; })) throw new Error('Invalid save');
        applyState(data); note('loaded');
      } catch (error) { note('invalidSave'); }
    });
    el('reset').addEventListener('click', function () { el('reset-dialog').showModal(); });
    el('cancel-reset').addEventListener('click', function () { el('reset-dialog').close(); });
    el('confirm-reset').addEventListener('click', function () { applyState(Object.assign(E.defaults(), { parts: { ten: 0, hundred: 0 } })); el('reset-dialog').close(); note('resetDone'); });
    el('import').addEventListener('click', function () { clearImports(); el('import-dialog').showModal(); });
    ['close-import', 'cancel-import'].forEach(function (id) { el(id).addEventListener('click', function () { el('import-dialog').close(); clearImports(); }); });
    el('import-dialog').addEventListener('cancel', function (event) { if (el('images').disabled) event.preventDefault(); else clearImports(); });
    el('images').addEventListener('change', readImages);
    el('import-review').addEventListener('input', function (event) {
      var node = event.target, i = node.dataset.importIndex, field = node.dataset.importField;
      if (i === undefined || !field) return;
      imports[i][field] = field === 'included' ? node.checked : field === 'level' || field === 'mastery' ? (node.value === '' ? null : Math.max(0, Math.min(field === 'level' ? 200 : 20, Math.floor(Number(node.value) || 0)))) : node.value;
    });
    el('apply-import').addEventListener('click', function () {
      var next = copy(state), seen = {}, invalid = false;
      imports.forEach(function (item) {
        if (!item.included) return;
        var id = item.troop + '-' + item.slot;
        if (!next.pieces[id]) { invalid = true; return; }
        if (seen[id]) invalid = true; seen[id] = true;
        var old = next.pieces[id], p = Object.assign({}, old);
        if (item.quality !== 'keep') p.quality = item.quality;
        if (item.level !== null) p.level = item.level;
        if (item.mastery !== null) p.mastery = item.mastery;
        if ((p.quality === 'epic' && (p.level > 80 || p.mastery > 0)) || (p.quality === 'mythic' && p.level > 100) || (p.quality === 'red' && p.level < 100)) invalid = true;
        next.pieces[id] = E.normalisePiece(p);
      });
      if (invalid) { el('read-status').textContent = tr('overviewConflict'); return; }
      if (!Object.keys(seen).length) { el('read-status').textContent = tr('includeOne'); return; }
      applyState(next); el('import-dialog').close(); clearImports(); note('imported');
    });
  }
  window.BH.registerPage({ boot: boot, onChange: function () { if (!state) return; paint(); persist(); paintResults(); } });
})();
