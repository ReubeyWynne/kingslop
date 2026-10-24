(function () {
  'use strict';
  var E = window.HeroGear, BH, state, previous, result, running = false, revision = 0, planIndex = 0, resultTroop = 'inf', strategyResult = null;
  var searchWorker, searchTimer, searchDelay, searchFailed = false;
  var activePage = 'planner', splitResult = null, splitRevision = -1, splitWorker = null;
  var ledger, ledgerRevision = 0, saving = false;
  var scriptURL = new URL(document.currentScript.src);
  var base = new URL('./', scriptURL);
  var view = window.HeroGearView.create({
    engine: E, tr: tr, fmt: fmt,
    art: new URL('../img/hero-gear/', base),
    fill: function (text, values) { return BH.fill(text, values); }
  });
  var parts = { ten: 0, hundred: 0, remainder: 0 };
  var params = new URLSearchParams(location.search), link = E.readLink(location.search);
  var guest = params.has('guest') || !!link, linkFailed = !!(link && link.invalid);
  ['gear-settings', 'theory'].forEach(function (id) { document.getElementById(id).hidden = true; });
  if (guest) {
    var guestLedger;
    window.Interactions.configure({ ledger: function () {
      if (guestLedger) return guestLedger;
      var Ledger = window.PlayerLedger, memory = {};
      if (!link) try { memory[Ledger.KEY] = JSON.stringify(Ledger.shared().snapshot()); } catch (ignored) {}
      var store = Ledger.create({ getItem: function (key) { return key in memory ? memory[key] : null; }, setItem: function (key, value) { memory[key] = String(value); } }, null);
      if (link && !link.invalid) store.writeHeroGear(Object.assign(E.defaults(), link), E, { source: 'manual' });
      guestLedger = store;
      return store;
    } });
    var forge = document.getElementById('gear-forge');
    forge.dataset.guest = 'true';
    forge.dataset.savedKey = 'gear.guestSaved';
    document.getElementById('gear-save').setAttribute('data-i18n', 'gear.guestSaved');
  }
  function workerURL(filename) { var url = new URL(filename, base); url.search = scriptURL.search; return url; }
  function partsTotal() { return Math.min(1e9, parts.ten * 10 + parts.hundred * 100 + (parts.remainder || 0)); }
  function partsFromXP(xp) { xp = Math.max(0, Math.floor(Number(xp) || 0)); return { ten: Math.floor((xp % 100) / 10), hundred: Math.floor(xp / 100), remainder: xp % 10 }; }
  function readParts(input) {
    var saved = input.parts || {}, xp = state.resources.xp;
    parts = { ten: Math.min(1e7, Math.max(0, Math.floor(Number(saved.ten) || 0))), hundred: Math.min(1e7, Math.max(0, Math.floor(Number(saved.hundred) || 0))), remainder: Math.min(9, Math.max(0, Math.floor(Number(saved.remainder) || 0))) };
    if (partsTotal() !== xp) parts = partsFromXP(xp);
  }
  function syncXP() { state.resources.xp = partsTotal(); }
  function el(id) { return document.getElementById('gear-' + id); }
  function tr(key) { return BH.tr('gear.' + key, key); }
  function fmt(n) { return BH.fmt(n); }
  function copy(s) { return JSON.parse(JSON.stringify(s)); }
  function keptParams() { var kept = new URLSearchParams(location.search); ['guest', 'gear', 'w'].forEach(function (key) { kept.delete(key); }); return kept.toString(); }
  function linkQuery() { var l = E.encodeLink(state); return 'gear=' + l.gear + '&w=' + l.w; }
  function shareURL() { return new URL(location.pathname + '?' + linkQuery(), location.href).href; }
  function syncAddress() {
    if (!guest) return;
    var kept = keptParams();
    try { history.replaceState(history.state, '', location.pathname + '?' + (kept ? kept + '&' : '') + linkQuery() + location.hash); } catch (ignored) {}
  }
  function paintGuest() {
    var kept = keptParams();
    el('guest-banner').hidden = !guest;
    el('guest-enter').hidden = guest;
    el('guest-enter').href = location.pathname + '?' + (kept ? kept + '&' : '') + 'guest';
    el('guest-leave').href = location.pathname + (kept ? '?' + kept : '');
  }
  // A copied link is confirmed on the button itself for a moment, so no note lingers below the gear.
  var shareReset;
  function shareLink() {
    var url = shareURL(), field = el('link'), button = el('share');
    function fallback() { field.hidden = false; field.value = url; field.focus(); field.select(); note('linkSelect'); }
    field.hidden = true;
    if (!navigator.clipboard || !navigator.clipboard.writeText) { fallback(); return; }
    navigator.clipboard.writeText(url).then(function () {
      note(null);
      clearTimeout(shareReset);
      button.textContent = tr('linkCopiedShort'); button.dataset.copied = 'true';
      el('share-status').textContent = tr('linkCopied');
      shareReset = setTimeout(function () { button.textContent = tr('share'); delete button.dataset.copied; el('share-status').textContent = ''; }, 2500);
    }, fallback);
  }
  function paintTheory() {
    el('cost-units').textContent = view.costText(E.redPlans(state).scale);
    el('kvk-formula').textContent = BH.fill(tr('kvkFormula'), { hammers: fmt(E.KVK_RATES.hammers), mithril: fmt(E.KVK_RATES.mithril) });
    // The same spending plan the Town Centre scores: what this bag can actually put into this gear.
    var spend = E.spendable(state.pieces, state.resources);
    el('kvk-bag').textContent = BH.fill(tr('kvkBag'), { hammers: fmt(spend.spent.hammers), mithril: fmt(spend.spent.mithril), points: fmt(spend.points) });
    el('roles').innerHTML = E.TYPES.map(function (type) { return '<li><strong>' + view.esc(tr(type)) + '</strong> ' + view.esc(view.roleText(type)) + '</li>'; }).join('');
  }
  function paintPage() {
    el('views').querySelectorAll('[role="tab"]').forEach(function (button) {
      var value = button.dataset.value, active = activePage === 'planner' ? value === 'planner' || value === state.view : value === activePage;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    });
    ['planner', 'settings'].forEach(function (page) { el(page).hidden = page !== activePage; });
    document.getElementById('theory').hidden = activePage !== 'theory';
  }
  function showPage(page) { activePage = page; note(null); paintPage(); if (page === 'planner') scheduleSearch(0); else cancelSearch(); }
  function note(key) { document.dispatchEvent(new CustomEvent('player-status', { detail: { scope: 'hero-gear', key: key ? 'gear.' + key : null } })); }
  function persist(options) {
    try {
      saving = true;
      var saved = ledger.writeHeroGear(Object.assign({}, state, { parts: parts }), E, Object.assign({ expectedRevision: ledgerRevision }, options));
      ledgerRevision = saved.revision;
      el('save').textContent = tr(guest ? 'guestSaved' : 'saved');
      syncAddress();
      return true;
    } catch (error) {
      el('save').textContent = tr('saveFailed');
      try { var restored = ledger.heroGear(E); state = E.normaliseState(restored); readParts(restored); ledgerRevision = ledger.snapshot().revision; paint(); } catch (ignored) {}
      return false;
    } finally { saving = false; }
  }
  function changed(options) {
    cancelSearch();
    revision++;
    planIndex = 0;
    searchFailed = false;
    result = null;
    strategyResult = null;
    el('results').textContent = '';
    el('opportunities').textContent = '';
    note(null);
    var saved = persist(options);
    paintAnswer(); paintTheory();
    return saved;
  }
  function paintView() {
    el('forge').dataset.view = state.view;
    paintPage();
    scheduleSearch(0);
  }
  function paintEdit() {
    var id = state.selected, p = state.pieces[id];
    el('edit-title').textContent = view.name(id);
    el('edit-fields').innerHTML = view.editorFields(id, p);
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
      return '<button type="button" class="gear-row" data-select="' + id + '" data-selected="' + (state.selected === id) + '" aria-pressed="' + (state.selected === id) + '" aria-label="' + view.esc(view.name(id) + ' · ' + view.pieceLabel(p)) + '">' + view.gearItem(id, p) + view.pieceInfo(slot, p) + '</button>';
    }).join('');
    el('selected').innerHTML = Object.keys(state.pieces).map(function (id) { return '<option value="' + id + '"' + (id === state.selected ? ' selected' : '') + '>' + view.esc(view.name(id)) + '</option>'; }).join('');
    el('profile').value = state.profile;
    el('reforge').checked = state.reforge;
    el('weights').innerHTML = '<div class="gear-weight-row gear-weight-head" aria-hidden="true">' +
      '<span>' +
      '</span>' +
      '<span>' + view.esc(tr('lethality')) + '</span>' +
      '<span>' + view.esc(tr('health')) + '</span>' +
      '</div>' +
      E.TYPES.map(function (type) {
      return '<div class="gear-weight-row"><span>' + view.esc(tr(type)) + '</span>' + [0, 1].map(function (i) {
        var label = tr(i ? 'health' : 'lethality');
        return '<label>' +
          '<input type="number" min="0" max="100" step="0.1" inputmode="decimal" data-weight="' + type + '" data-stat="' + i + '" value="' + state.weights[type][i] + '" aria-label="' + view.esc(tr(type) + ' · ' + label) + '">' +
          '</label>';
      }).join('') + '</div>';
    }).join('');
  }
  function paintPreview(from, to) {
    el('preview').innerHTML = view.preview(state.selected, from, to);
  }
  function nextTarget() {
    var p = state.pieces[state.selected];
    return E.milestone(p, state.goal);
  }
  function planOutput() {
    var forecast = E.redPlans(state);
    planIndex = Math.min(planIndex, Math.max(0, forecast.routes.length - 1));
    return view.planOutput(state, forecast, planIndex);
  }
  function paintSplit() {
    var out = el('milestone-out');
    if (splitResult && splitRevision === revision) { out.innerHTML = view.splitOutput(splitResult); return; }
    out.innerHTML = '<p class="gear-search-status" role="status">' + view.esc(tr('calculatingSplit')) + '</p>';
    if (splitWorker) return;
    var at = revision;
    function done(sets) {
      splitWorker = null;
      if (at === revision) { splitResult = sets; splitRevision = at; }
      if (state.mode === 'split') paintSplit();
    }
    try {
      var worker = splitWorker = new Worker(workerURL('hero-gear-worker.js'));
      worker.onmessage = function (event) { worker.terminate(); done(event.data && event.data.ok ? event.data.result : E.bestSplit(copy(state))); };
      worker.onerror = function () { worker.terminate(); done(E.bestSplit(copy(state))); };
      worker.postMessage({ kind: 'split', state: copy(state) });
    } catch (error) { done(E.bestSplit(copy(state))); }
  }
  function paintAnswer() {
    var isOptimise = state.mode === 'optimise', isPlan = state.mode === 'plan', isSplit = state.mode === 'split';
    el('modes').querySelectorAll('[data-mode]').forEach(function (button) {
      var active = button.dataset.mode === state.mode;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    });
    el('answer-panel').setAttribute('aria-labelledby', 'gear-mode-' + state.mode);
    el('piece-select').hidden = isOptimise || isPlan || isSplit;
    el('goals').hidden = isOptimise || isPlan || isSplit;
    el('optimise-panel').hidden = !isOptimise;
    el('milestone-out').hidden = isOptimise;
    el('goals').querySelectorAll('[data-goal]').forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.goal === state.goal)); });
    if (isOptimise) { paintPreview(state.pieces[state.selected], null); scheduleSearch(250); return; }
    cancelSearch();
    if (isSplit) { paintPreview(state.pieces[state.selected], null); paintSplit(); return; }
    if (isPlan) { paintPreview(state.pieces[state.selected], nextTarget()); el('milestone-out').innerHTML = planOutput(); return; }
    var from = state.pieces[state.selected], to = nextTarget(), out = el('milestone-out');
    paintPreview(from, to);
    if (!to) { out.innerHTML = '<p class="gear-gloss">' + view.esc(tr(from.quality === 'epic' ? 'epicBlocked' : state.goal === 'red' ? 'alreadyRed' : 'maxed')) + '</p>' +
      view.nearList(state); return; }
    var costs = E.cost(from, to), ready = E.affordable(costs, state.resources);
    out.innerHTML = '<h3>' + view.esc(view.name(state.selected)) + '</h3>' +
      '<button type="button" class="gear-upgrade" data-edit-piece="' + state.selected + '" aria-label="' + view.esc(tr('editPiece')) + '">' + view.gearImage(state.selected, 'gear-upgrade-art') + '<span>' +
      '<span class="gear-upgrade-levels">' + view.levelLabel(from) + ' <span>→</span> ' + view.levelLabel(to) + '</span>' +
      '<small>' + view.esc(tr('mastery')) + ' ' + from.mastery + ' → ' + to.mastery + '</small>' +
      '<small>' + view.esc(view.quality(from.quality)) + (from.quality !== to.quality ? ' → ' + view.esc(view.quality(to.quality)) : '') + '</small>' +
      '</span>' +
      '</button>' +
      view.kvkScore(costs, true) + view.costTable(costs, state.resources) + view.kvkNote() +
      (ready ? '<p class="gear-gloss">' + view.esc(tr('ready')) + '</p>' +
        '<button type="button" id="gear-apply-milestone" class="gear-primary">' + view.esc(tr('applyMilestone')) + '</button>' : '') +
      view.theoryLink('cost-includes', 'costIncludes') + (isPlan ? '' : view.nearList(state));
  }
  function paint() {
    paintEditor(); paintAnswer(); paintView(); paintTheory();
  }
  function selectPiece(id) {
    state.selected = id; state.troop = id.split('-')[0];
    persist(); paintEditor(); paintAnswer();
  }
  function applyState(next, options) {
    previous = { state: copy(state), parts: copy(parts), ledger: ledger.snapshot() };
    state = E.normaliseState(next);
    readParts(next);
    syncXP();
    var saved = changed(options); paint(); el('undo').hidden = !saved;
    return saved;
  }
  function paintOpportunities(comparison) {
    var host = el('opportunities');
    if (!host) return;
    var alternatives = comparison && comparison.alternatives || [], baseline = comparison && comparison.now ? comparison.now.baseline : 0;
    var cards = alternatives.filter(function (r) {
      return E.RES.some(function (key) { return r.gap[key] > 0; }) || r.reforgeNow;
    }).map(function (r) {
      var missing = E.RES.filter(function (key) { return r.gap[key] > 0; })
        .map(function (key) { return fmt(r.gap[key]) + ' ' + tr(key + 'Unit'); }).join(' · ');
      var delayed = r.afterSpendGap && E.RES.some(function (key) { return r.afterSpendGap[key] > r.gap[key]; });
      var note = tr(r.reforgeNow ? 'oppReforge' : r.optimalAtThreshold ? 'oppOptimal' : r.beatsCurrentPlan ? 'oppBeats' : 'oppBehind');
      function shortBy(gap) { return E.RES.filter(function (key) { return gap[key] > 0; }).map(function (key) { return fmt(gap[key]) + ' ' + tr(key + 'Unit'); }).join(' · '); }
      return '<article class="gear-opportunity">' +
        '<div class="gear-opportunity-head">' + view.gearImage(r.id, 'gear-opportunity-art') +
        '<div><strong>' + view.esc(view.name(r.id)) + ' · ' + view.esc(view.fullLevel(r.from)) + ' → ' + view.esc(view.fullLevel(r.to)) + '</strong>' +
        '<small>' + view.esc(tr('mithrilCheckpoint')) + ' · ' + view.gainPct(r.milestoneGain, baseline) + ' ' + view.esc(tr('weightedGain')) + '</small></div></div>' +
        '<p>' + view.esc(missing ? BH.fill(tr('oppShort'), { missing: missing }) : tr('oppAffordable')) + ' ' + view.esc(note) + '</p>' +
        (delayed ? '<p>' + view.esc(BH.fill(tr('oppDelayed'), { missing: shortBy(r.afterSpendGap) })) + '</p>' : '') +
        (r.futurePlan ? '<p>' + view.esc(BH.fill(tr('oppFuture'), { plan: view.gainPct(r.futurePlan.score - baseline, baseline), best: view.gainPct(r.futureBestScore - baseline, baseline) })) + '</p>' : '') +
        (r.reforgeNow ? '<p>' + view.esc(BH.fill(tr('oppReforgePlan'), { gain: view.gainPct(r.reforgeNow.score - baseline, baseline) })) + '</p>' : '') +
        '<button type="button" data-mode="plan">' + view.esc(tr('seeSavingCosts')) + ' →</button></article>';
    }).join('');
    host.innerHTML = cards ? '<section class="gear-saving-options"><h3 class="gear-subhead">' + view.esc(tr('budgetRoutes')) + '</h3>' + cards + '</section>' : '';
  }
  function paintResults() {
    paintOpportunities(strategyResult);
    if (!result) return;
    el('results').setAttribute('aria-busy', 'false');
    el('search-status').hidden = true;
    el('run').hidden = true;
    if (!result.changes.length) {
      var included = E.TYPES.filter(function (type) { return state.included[type]; });
      var message = !included.length ? 'noTroopsSelected' : included.every(function (type) { return state.weights[type].every(function (w) { return w === 0; }); }) ? 'noWeightsSelected' : E.RES.every(function (r) { return !state.resources[r]; }) && !state.reforge ? 'addBudgetHint' : 'noSpendMoves';
      el('results').innerHTML = '<div class="gear-empty">' +
        '<p class="gear-gloss">' + view.esc(tr(message)) + '</p>' +
        (message === 'noTroopsSelected' ? '<button type="button" class="gear-action" data-view="gear">' + view.esc(tr('chooseTroops')) + '</button>' : message === 'noWeightsSelected' ? '<button type="button" class="gear-action" data-show-weights="true">' + view.esc(tr('editWeights')) + '</button>' : '<button type="button" class="gear-action" data-mode="plan">' + view.esc(tr('seeSavingCosts')) + '</button>') + '</div>'; return;
    }
    if (!state.included[resultTroop]) resultTroop = result.changes[0].split('-')[0];
    var details = result.details, tabs = E.TYPES.filter(function (type) { return state.included[type]; }).map(function (type) { var count = details.filter(function (d) { return d.id.startsWith(type + '-'); }).length; return '<button type="button" data-result-troop="' + type + '" aria-pressed="' + (type === resultTroop) + '">' + view.esc(tr(type)) + ' <small>' + count + '</small>' +
      '</button>'; }).join('');
    var tiles = details.filter(function (d) { return d.id.startsWith(resultTroop + '-'); }).sort(function (a, b) {
      function priority(d) { return d.refund ? 2 : view.checkpoint(d.from, d.to) ? 0 : 1; }
      return priority(a) - priority(b) || b.gain - a.gain;
    }).map(function (detail) {
      return view.comparison(detail.id, detail.from, detail.to, detail);
    }).join('');
    var kept = E.SLOTS.filter(function (slot) { return !result.changes.includes(resultTroop + '-' + slot); });
    el('results').innerHTML = '<div class="gear-result-summary">' +
      '<strong>' + view.gainPct(result.gain, result.baseline) + '</strong>' +
      '<span>' + view.esc(tr('weightedGain')) + '</span>' +
      '<small>' + result.changes.length + ' ' + view.esc(tr('piecesChanged')) + '</small>' +
      '</div>' +
      view.kvkScore(result.spent, true) + '<div class="gear-rail gear-result-troops">' + tabs + '</div>' +
      '<div class="gear-result-grid">' + tiles + '</div>' +
      (kept.length ? '<p class="gear-kept">' + view.esc(tr('unchangedSlots')) + ': ' + kept.map(function (slot) { return view.esc(tr(slot)); }).join(' · ') + '</p>' : '') + (result.refund ? '<p class="gear-reforge-flow">↓ ' + fmt(result.refund) + ' XP ' + view.esc(tr('recoverXP')) + ' → ↑ ' + fmt(result.spent.xp) + ' XP ' + view.esc(tr('redistributeXP')) + '</p>' : '') + '<div class="gear-cost-title">' +
      '<strong>' + view.esc(tr('spend')) + '</strong>' +
      '</div>' +
      view.costStrip(result.spent) + view.kvkNote() + view.cavalryNote(state, result.pieces) + '<div class="gear-cost-title">' +
      '<strong>' + view.esc(tr('remaining')) + '</strong>' +
      '</div>' +
      view.costStrip(result.remaining) + '<div class="gear-record-action">' +
      '<button type="button" id="gear-apply-result" class="gear-primary gear-action" aria-describedby="gear-record-hint">' + view.esc(tr('applyResult')) + '</button>' +
      '<p id="gear-record-hint" class="gear-gloss">' + view.esc(tr('applyHint')) + '</p>' +
      '</div>';
  }
  function searchVisible() { return state.mode === 'optimise' && el('answer-panel').getClientRects().length > 0; }
  function cancelSearch() {
    clearTimeout(searchDelay); clearTimeout(searchTimer);
    if (searchWorker) searchWorker.terminate();
    searchWorker = null; running = false;
    el('results').setAttribute('aria-busy', 'false');
    el('search-status').hidden = true;
  }
  function scheduleSearch(delay) {
    if (!searchVisible()) { cancelSearch(); return; }
    if (result) { paintResults(); return; }
    el('run').hidden = !searchFailed;
    el('search-status').hidden = false;
    el('search-status').textContent = tr(searchFailed ? 'calculationFailed' : 'calculatingBudget');
    el('results').setAttribute('aria-busy', String(!searchFailed));
    if (searchFailed || running) return;
    clearTimeout(searchDelay);
    searchDelay = setTimeout(run, delay);
  }
  function run() {
    if (running || !searchVisible()) return;
    clearTimeout(searchDelay);
    searchFailed = false;
    running = true;
    el('run').hidden = true;
    el('search-status').hidden = false;
    el('search-status').textContent = tr('calculatingBudget');
    el('results').setAttribute('aria-busy', 'true');
    var currentRevision = revision, worker;
    function fail() {
      if ((worker && worker !== searchWorker) || currentRevision !== revision) return;
      cancelSearch(); searchFailed = true; scheduleSearch(0);
    }
    try {
      worker = searchWorker = new Worker(workerURL('hero-gear-worker.js'));
      searchTimer = setTimeout(fail, 60000);
      worker.onmessage = function (event) {
        if (worker !== searchWorker || currentRevision !== revision) return;
        if (!event.data || !event.data.ok || !event.data.result) { fail(); return; }
        cancelSearch();
        strategyResult = event.data.result;
        result = strategyResult.now;
        if (result.changes.length) {
          resultTroop = E.TYPES.filter(function (type) { return state.included[type]; }).sort(function (a, b) {
            function gain(type) { return result.details.reduce(function (sum, d) { return sum + (d.id.startsWith(type + '-') ? d.gain : 0); }, 0); }
            return gain(b) - gain(a);
          })[0];
        }
        paintResults();
      };
      worker.onerror = fail;
      worker.postMessage(copy(state));
    } catch (error) { fail(); }
  }
  function editWeights() {
    showPage('settings');
    el('weights').scrollIntoView({ block: 'nearest' });
    el('weights').querySelector('input').focus({ preventScroll: true });
  }
  function boot(api) {
    BH = api; state = E.defaults();
    try {
      ledger = window.Interactions.ledger();
      var saved = ledger.migrate(E), input = ledger.heroGear(E);
      ledgerRevision = saved.revision;
      state = E.normaliseState(input); readParts(input);
    } catch (error) { note('loadFailed'); el('save').textContent = tr('saveFailed'); }
    syncXP();
    paint();
    paintGuest();
    syncAddress();
    if (linkFailed) note('linkInvalid');
    if (ledger) ledger.subscribe(function (saved) {
      if (saving) return;
      ledgerRevision = saved.revision;
      var input = ledger.heroGear(E);
      state = E.normaliseState(input); readParts(input);
      previous = null; el('undo').hidden = true;
      cancelSearch(); revision++; result = null; strategyResult = null;
      el('results').textContent = ''; el('opportunities').textContent = '';
      paint();
    });
    window.addEventListener('player-ledger:error', function () { note('loadFailed'); cancelSearch(); });
    document.addEventListener('input', function (event) {
      var node = event.target;
      if (node.dataset.piece && node.dataset.field !== 'quality') {
        state.pieces[node.dataset.piece] = E.normalisePiece(Object.assign({}, state.pieces[node.dataset.piece], { [node.dataset.field]: Number(node.value) }));
        paintEditor();
        el('edit-fields').querySelector('.gear-edit-art').innerHTML = view.gearItem(node.dataset.piece, state.pieces[node.dataset.piece]) + '<span>' + view.esc(view.pieceLabel(state.pieces[node.dataset.piece])) + '</span>';
      } else if (node.dataset.weight) {
        state.profile = 'custom'; el('profile').value = 'custom';
        state.weights[node.dataset.weight][Number(node.dataset.stat)] = Math.min(100, Math.max(0, Number(node.value) || 0));
      } else return;
      changed({ resource: node.dataset.resource, piece: node.dataset.piece });
    });
    document.addEventListener('change', function (event) {
      var node = event.target;
      if (node.dataset.piece) {
        if (node.dataset.field === 'quality') state.pieces[node.dataset.piece] = E.normalisePiece(Object.assign({}, state.pieces[node.dataset.piece], { quality: node.value }));
        changed({ piece: node.dataset.piece }); paintEditor();
        if (node.dataset.field === 'quality') paintEdit();
        else node.value = state.pieces[node.dataset.piece][node.dataset.field];
      } else if (node.id === 'gear-include') { state.included[state.troop] = node.checked; changed(); }
      else if (node.id === 'gear-reforge') { state.reforge = node.checked; changed(); }
      else if (node.id === 'gear-profile') {
        state.profile = node.value;
        if (E.PROFILES[node.value]) state.weights = copy(E.PROFILES[node.value]);
        changed(); paintEditor();
        if (node.value === 'custom') editWeights();
      } else if (node.id === 'gear-selected') selectPiece(node.value);
    });
    el('forge').addEventListener('click', function (event) {
      var button = event.target.closest('button'); if (!button) return;
      if (button.dataset.showWeights) editWeights();
      else if (button.dataset.resultTroop) { resultTroop = button.dataset.resultTroop; paintResults(); }
      else if (button.dataset.route) { planIndex = Number(button.dataset.route); paintAnswer(); }
      else if (button.dataset.select && button.classList.contains('gear-row')) editPiece(button.dataset.select);
      else if (button.dataset.select) selectPiece(button.dataset.select);
      else if (button.dataset.editPiece) editPiece(button.dataset.editPiece);
      else if (button.dataset.view && !button.dataset.action) { state.view = button.dataset.view; activePage = 'planner'; persist(); paintView(); }
      else if (button.dataset.mode && !button.dataset.action) { state.mode = button.dataset.mode; persist(); paintAnswer(); scheduleSearch(0); }
      else if (button.dataset.goal) { state.goal = button.dataset.goal; persist(); paintAnswer(); }
      else if (button.id === 'gear-apply-result' && result) {
        var next = copy(state); next.pieces = result.pieces; next.resources = result.remaining;
        if (applyState(next, { source: 'plan' })) note('applied');
      } else if (button.id === 'gear-apply-milestone') {
        var target = nextTarget(); if (!target) return;
        var costs = E.cost(state.pieces[state.selected], target); if (!E.affordable(costs, state.resources)) return;
        var updated = copy(state); updated.pieces[state.selected] = target;
        E.RES.forEach(function (r) { updated.resources[r] -= costs[r]; });
        if (applyState(updated, { source: 'plan' })) note('applied');
      }
    });
    document.addEventListener('tabs:select', function (event) {
      if (![el('troops'), el('modes'), el('views')].includes(event.target)) return;
      var detail = event.detail;
      if (detail.binding === 'view' && (detail.value === 'gear' || detail.value === 'plan')) activePage = 'planner';
      else if (detail.binding === 'view') { showPage(detail.value); return; }
      if (detail.binding === 'troop') selectPiece(detail.value + '-' + state.selected.split('-')[1]);
      else if (detail.binding === 'view') { state.view = detail.value; persist(); paintView(); }
      else if (detail.binding === 'mode') { state.mode = detail.value; persist(); paintAnswer(); scheduleSearch(0); }
    });
    el('share').addEventListener('click', shareLink);
    el('close-edit').addEventListener('click', function () { el('edit-dialog').close(); });
    el('edit-dialog').addEventListener('close', function () {
      paintEditor(); paintAnswer();
      var button = document.querySelector('.gear-row[data-select="' + state.selected + '"]');
      if (button && button.getClientRects().length) button.focus();
      else { button = document.querySelector('.gear-upgrade'); if (button) button.focus(); }
    });
    el('run').addEventListener('click', run);
    window.addEventListener('resize', function () { scheduleSearch(250); });
    el('undo').addEventListener('click', function () {
      if (!previous) return;
      try {
        saving = true;
        var restored = ledger.importJSON(previous.ledger, E, ledgerRevision);
        ledgerRevision = restored.revision;
        var input = ledger.heroGear(E); state = E.normaliseState(input); readParts(input);
        previous = null; changed(); paint(); el('undo').hidden = true; note('undone');
      } catch (error) { note('loadFailed'); } finally { saving = false; }
    });
    document.addEventListener('player-save:imported', function (event) {
      if (event.target !== el('export').closest('[data-module]')) return;
      previous = { ledger: event.detail.before }; el('undo').hidden = false;
    });
    el('reset').addEventListener('click', function () { el('reset-dialog').showModal(); });
    el('cancel-reset').addEventListener('click', function () { el('reset-dialog').close(); });
    el('confirm-reset').addEventListener('click', function () { if (applyState(Object.assign(E.defaults(), { parts: { ten: 0, hundred: 0, remainder: 0 } }), { all: true, source: 'reset' })) { el('reset-dialog').close(); note('resetDone'); } });
  }
  window.BH.registerPage({ boot: boot, onChange: function () { if (!state) return; paint(); persist(); paintResults(); } });
})();

