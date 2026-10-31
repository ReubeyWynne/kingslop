(function () {
  'use strict';
  /* One page: your gear as three troop cards (a troop opens on its own, laid out as in the
     game; a piece opens its editor and what its next steps cost), then one answer: how near
     the gear is to optimal for what it holds, what the bag buys now, and the red upgrades
     worth saving for. Profile and weights are an advanced fold. */
  var E = window.HeroGear, BH, state, previous, result = null, optimum = null, planned = null, fit = null, running = false, revision = 0;
  var searchWorker, searchTimer, searchDelay, searchFailed = false, showOptimal = false, detail = null;
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
  /* Your own gear saves as you go, and the page says nothing about it. A link, ?guest or
     Start blank opens a sheet of its own that only Save as mine writes back; a slim notice
     above the workspace says so. Load mine and Start blank reload on the other kind. */
  function sheetTr(key, fallback) { return BH.tr('gov.sheet.' + key, fallback); }
  function blankSheet() { var d = E.defaults(); return Object.keys(d.pieces).every(function (id) { return JSON.stringify(state.pieces[id]) === JSON.stringify(d.pieces[id]); }); }
  function paintSheet() {
    var blank = guest && blankSheet();
    el('sheet').hidden = !guest;
    el('sheet-source').textContent = linkFailed ? tr('linkInvalid') : blank ? sheetTr('sourceBlank', 'A blank sheet.') : link ? sheetTr('sourceLink', 'A shared sheet.') : sheetTr('sourceChanged', 'Changed on this page only.');
    el('sheet-hint').textContent = sheetTr('untouched', 'Your save is untouched.');
    el('save-mine').hidden = !guest || blank;
    el('blank').hidden = blank;
  }
  function go(query) { var kept = keptParams(), rest = [kept, query].filter(Boolean).join('&'); location.assign(location.pathname + (rest ? '?' + rest : '') + location.hash); }
  function startBlank() { go('gear=' + E.encodeLink(E.defaults()).gear); }
  function loadMine() { go(''); }
  // Pieces and priority replace yours; a material this sheet left at 0 keeps your number.
  function saveMine() {
    try {
      var own = window.PlayerLedger.shared(), mine = own.heroGear(E), next = Object.assign({}, mine, copy(state), { resources: copy(mine.resources), parts: mine.parts });
      if (E.RES.some(function (r) { return state.resources[r] > 0; })) E.RES.forEach(function (r) { if (state.resources[r] > 0) next.resources[r] = state.resources[r]; });
      if (state.resources.xp > 0) next.parts = copy(parts);
      own.writeHeroGear(next, E, { source: 'manual' });
    } catch (error) { note('saveFailed'); return; }
    loadMine();
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
      shareReset = setTimeout(function () { button.textContent = sheetTr('copy', 'Copy share link'); delete button.dataset.copied; el('share-status').textContent = ''; }, 2500);
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
  // An old link to a note (#kvk-points, #weights, #save-backups) opens the fold it sits in.
  function openHash() {
    var id = decodeURIComponent(location.hash.slice(1)), node = id && document.getElementById(id), fold = node && node.closest('details');
    if (!node) return;
    if (fold) fold.open = true;
    node.scrollIntoView({ block: 'start' });
  }
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
    searchFailed = false;
    result = null;
    optimum = null; planned = null; fit = null;
    note(null);
    var saved = persist(options);
    paint();
    return saved;
  }

  // ── Your gear ──────────────────────────────────────────────────────────
  function shown() { return showOptimal && optimum ? optimum.pieces : state.pieces; }
  function tile(id) {
    var p = shown()[id], was = state.pieces[id], moved = showOptimal && optimum && JSON.stringify(p) !== JSON.stringify(was);
    return '<button type="button" class="gear-row" data-select="' + id + '"' + (moved ? ' data-moved="true"' : '') + ' aria-label="' + view.esc(view.name(id) + ' · ' + view.pieceLabel(p)) + '">' +
      view.gearItem(id, p) +
      '<span class="gear-tile-name">' + view.esc(tr(id.split('-')[1])) + '</span>' +
      (moved ? '<small class="gear-tile-was">' + view.esc(tr('splitNow')) + ' ' + view.levelLabel(was) + ' · ' + was.mastery + '</small>' : '') +
      '</button>';
  }
  function include(type) {
    return '<label class="gear-include"><input type="checkbox" data-include="' + type + '"' + (state.included[type] ? ' checked' : '') + '><span>' + view.esc(tr('counted')) + '</span></label>';
  }
  // A troop's share of optimal, from the same search as the whole.
  function troopShare(type) {
    if (!optimum) return null;
    var now = 0, best = 0;
    E.SLOTS.forEach(function (slot) { var id = type + '-' + slot; now += E.score(id, state.pieces[id], state.weights); best += E.score(id, optimum.pieces[id], state.weights); });
    return best > 0 ? Math.min(1, now / best) : 1;
  }
  // Rounded down to a tenth, so gear short of optimal never reads as 100%.
  function pct(share) { return share === null ? '…' : (Math.floor(share * 1000 + 1e-6) / 10).toFixed(1).replace(/\.0$/, '') + '%'; }
  function paintGear() {
    el('cards').hidden = !!detail;
    el('detail').hidden = !detail;
    if (!detail) {
      el('cards').innerHTML = E.TYPES.map(function (type) {
        return '<section class="gear-card" data-troop="' + type + '" data-included="' + state.included[type] + '">' +
          '<div class="gear-card-head"><button type="button" class="gear-card-open" data-open="' + type + '">' + view.esc(tr(type)) + ' <span aria-hidden="true">›</span></button>' +
          (state.included[type] ? '<small>' + pct(troopShare(type)) + ' ' + view.esc(tr('ofOptimal')) + '</small>' : '') + '</div>' +
          '<div class="gear-card-grid">' + E.SLOTS.map(function (slot) { return tile(type + '-' + slot); }).join('') + '</div>' +
          '</section>';
      }).join('');
      return;
    }
    // One troop as the game lays it out: helm and chest on the left, gloves and boots on the right.
    var share = state.included[detail] ? troopShare(detail) : null;
    el('detail').innerHTML = '<div class="gear-detail-head"><button type="button" class="gear-back" data-open="">‹ ' + view.esc(tr('allTroops')) + '</button><h3>' + view.esc(tr(detail)) + '</h3>' + include(detail) + '</div>' +
      '<div class="gear-board" data-troop="' + detail + '">' +
      '<div class="gear-board-side">' + tile(detail + '-helm') + tile(detail + '-chest') + '</div>' +
      '<div class="gear-board-centre"><span class="sheet-label">' + view.esc(tr('ofOptimal')) + '</span><strong>' + (state.included[detail] ? pct(share) : '—') + '</strong><small>' + view.esc(view.roleText(detail)) + '</small></div>' +
      '<div class="gear-board-side">' + tile(detail + '-gloves') + tile(detail + '-boots') + '</div>' +
      '</div>';
  }

  // ── A piece: its levels, then what its next steps cost ──────────────────
  function stepCost(id, goal) {
    var from = state.pieces[id], to = E.milestone(from, goal);
    if (!to) return '';
    var costs = E.cost(from, to), ready = E.affordable(costs, state.resources);
    return '<section class="gear-step" data-goal="' + goal + '">' +
      '<h3>' + view.esc(tr(goal === 'red' ? 'ascend' : 'nextMithril')) + ' <span>' + view.levelLabel(from) + ' → ' + view.esc(view.fullLevel(to)) + '</span></h3>' +
      view.costStrip(costs, E.gap(costs, state.resources)) + view.kvkScore(costs) +
      (ready ? '<button type="button" class="gear-primary" data-apply-goal="' + goal + '">' + view.esc(tr('applyMilestone')) + '</button>' : '') +
      '</section>';
  }
  function steps(id) {
    var p = state.pieces[id], mithril = E.milestone(p, 'mithril'), red = E.milestone(p, 'red');
    // Ascension comes first in game, so its bill does too; the mithril step goes past it.
    return (red && (!mithril || JSON.stringify(red) !== JSON.stringify(mithril)) ? stepCost(id, 'red') : '') + stepCost(id, 'mithril') +
      (!mithril && !red ? '<p class="gear-gloss">' + view.esc(tr(p.quality === 'epic' ? 'epicBlocked' : 'maxed')) + '</p>' : '');
  }
  function paintEdit() {
    var id = state.selected;
    el('edit-title').textContent = view.name(id);
    el('edit-fields').innerHTML = view.editorFields(id, state.pieces[id]) + '<div class="gear-steps">' + steps(id) + '</div>' + view.theoryLink('cost-includes', 'costIncludes');
  }
  function editPiece(id) { state.selected = id; persist(); paintEdit(); el('edit-dialog').showModal(); }

  // ── The answer ─────────────────────────────────────────────────────────
  function paintAdvanced() {
    el('profile').value = state.profile;
    el('reforge').checked = state.reforge;
    el('weights-grid').innerHTML = '<span id="gear-weights-label" class="sheet-label">' + view.esc(BH.tr('gov.weights', 'Weights')) + '</span>' +
      '<div class="gear-weight-grid"><span></span>' + E.TYPES.map(function (type) { return '<span>' + view.esc(tr(type)) + '</span>'; }).join('') +
      [0, 1].map(function (i) {
        var label = tr(i ? 'health' : 'lethality');
        return '<span class="gear-weight-stat">' + view.esc(label) + '</span>' + E.TYPES.map(function (type) {
          return '<input type="number" min="0" max="100" step="0.1" inputmode="decimal" data-weight="' + type + '" data-stat="' + i + '" value="' + state.weights[type][i] + '" aria-label="' + view.esc(tr(type) + ' · ' + label) + '">';
        }).join('');
      }).join('') + '</div>';
  }
  // Your gear: how close what is already in it is to its best layout. The bag is not counted.
  function paintOptimal() {
    var host = el('optimal');
    if (!optimum) { host.innerHTML = ''; el('optimal-rows').innerHTML = ''; return; }
    var rows = optimum.changes.filter(function (id) { return state.included[id.split('-')[0]]; }).map(function (id) {
      var from = state.pieces[id], to = optimum.pieces[id], slot = id.split('-')[1], a = E.stats(from, slot), b = E.stats(to, slot);
      return '<article class="gear-row gear-change" data-piece-id="' + id + '">' + view.beforeAfter(id, from, to, 'splitNow', 'optimalShort') +
        '<div class="gear-change-info"><strong class="gear-change-name">' + view.esc(view.name(id)) + '</strong>' +
        '<small class="gear-tile-impact">' + view.esc(view.statText({ core: b.core - a.core, attack: b.attack - a.attack, defense: b.defense - a.defense }).replace(tr('core'), tr(slot === 'helm' || slot === 'boots' ? 'lethality' : 'health'))) + '</small></div></article>';
    }).join('');
    var gap = optimum.current > 0 ? (optimum.score - optimum.current) / optimum.current * 100 : 0;
    host.innerHTML = '<div class="gear-headline"><strong>' + pct(optimum.share) + '</strong><span>' + view.esc(tr('ofOptimalInvested')) + '</span></div>' +
      '<p class="gear-gloss">' + view.esc(optimum.changes.length ? BH.fill(tr('optimalGap'), { gain: gap.toFixed(1) }) : tr('optimalAlready')) + ' ' + view.theoryLink('best-split-method', 'optimalMethodTitle') + '</p>' +
      (optimum.changes.length ? '<label class="gear-include gear-switch"><input type="checkbox" id="gear-show-optimal"' + (showOptimal ? ' checked' : '') + '><span>' + view.esc(tr('showOptimal')) + '</span></label>' : '');
    el('optimal-rows').innerHTML = showOptimal ? rows : '';
  }
  // The answer: the same measure with the bag counted, before and after Spend now.
  function paintPlanShare() {
    var host = el('plan-share');
    if (!planned || !result) { host.innerHTML = ''; return; }
    var before = planned.score > 0 ? Math.min(1, planned.current / planned.score) : 1, after = planned.score > 0 ? Math.min(1, result.score / planned.score) : 1;
    host.innerHTML = '<div class="gear-headline gear-before-after-share"><strong>' + pct(before) + '</strong><span aria-hidden="true">→</span><strong>' + pct(after) + '</strong></div>' +
      '<p class="gear-gloss">' + view.esc(tr('planShare')) + '</p>';
  }
  // Which priority profile the gear already fits best; one tap uses it.
  function paintFit() {
    var node = el('fit'), names = fit ? Object.keys(fit) : [];
    if (!names.length) { node.hidden = true; return; }
    var best = names.reduce(function (a, b) { return fit[b] > fit[a] + 1e-9 ? b : a; });
    if (best === state.profile) { node.hidden = true; return; }
    var option = el('profile').querySelector('option[value="' + best + '"]');
    node.hidden = false;
    node.innerHTML = view.esc(BH.fill(tr('fitBest'), { profile: option ? option.textContent : best, share: pct(fit[best]) })) +
      ' <button type="button" data-use-profile="' + best + '">' + view.esc(tr('useProfile')) + '</button>';
  }
  function paintResults() {
    el('results').setAttribute('aria-busy', 'false');
    el('search-status').hidden = true;
    el('run').hidden = true;
    if (!result) { el('results').innerHTML = ''; return; }
    if (!result.changes.length) {
      var included = E.TYPES.filter(function (type) { return state.included[type]; });
      var message = !included.length ? 'noTroopsSelected' : included.every(function (type) { return state.weights[type].every(function (w) { return w === 0; }); }) ? 'noWeightsSelected' : E.RES.every(function (r) { return !state.resources[r]; }) && !state.reforge ? 'addBudgetHint' : 'noSpendMoves';
      el('results').innerHTML = '<div class="gear-empty"><p class="gear-gloss">' + view.esc(tr(message)) + '</p>' +
        (message === 'noWeightsSelected' ? '<button type="button" class="gear-action" data-show-weights="true">' + view.esc(tr('editWeights')) + '</button>' : '') + '</div>';
      return;
    }
    // Every changed piece in one list, troop by troop: milestones first, then by gain.
    var order = E.TYPES.reduce(function (o, type, i) { o[type] = i; return o; }, {});
    var tiles = result.details.slice().sort(function (a, b) {
      function rank(d) { return d.refund ? 2 : view.checkpoint(d.from, d.to) ? 0 : 1; }
      return order[a.id.split('-')[0]] - order[b.id.split('-')[0]] || rank(a) - rank(b) || b.gain - a.gain;
    }).map(function (d) { return view.comparison(d.id, d.from, d.to, d); }).join('');
    el('results').innerHTML = '<div class="gear-result-summary"><strong>' + view.gainPct(result.gain, result.baseline) + '</strong><span>' + view.esc(tr('weightedGain')) + '</span><small>' + result.changes.length + ' ' + view.esc(tr('piecesChanged')) + '</small></div>' +
      view.kvkScore(result.spent, true) +
      '<div class="gear-result-grid">' + tiles + '</div>' +
      (result.refund ? '<p class="gear-reforge-flow">↓ ' + fmt(result.refund) + ' XP ' + view.esc(tr('recoverXP')) + ' → ↑ ' + fmt(result.spent.xp) + ' XP ' + view.esc(tr('redistributeXP')) + '</p>' : '') +
      '<div class="gear-cost-title"><strong>' + view.esc(tr('spend')) + '</strong></div>' + view.costStrip(result.spent) + view.kvkNote() + view.cavalryNote(state, result.pieces) +
      '<div class="gear-cost-title"><strong>' + view.esc(tr('remaining')) + '</strong></div>' + view.costStrip(result.remaining) +
      '<div class="gear-record-action"><button type="button" id="gear-apply-result" class="gear-primary gear-action" aria-describedby="gear-record-hint">' + view.esc(tr('applyResult')) + '</button>' +
      '<p id="gear-record-hint" class="gear-gloss">' + view.esc(tr('applyHint')) + '</p></div>';
  }
  // Red upgrades ranked by stats per resource, with how far the bag is from each.
  function paintSaving() {
    var forecast = E.redPlans(state), baseline = forecast.baseline;
    el('saving').innerHTML = forecast.routes.length ? '<h3 class="gear-subhead">' + view.esc(tr('worthSaving')) + '</h3><p class="gear-gloss">' + view.esc(tr('worthSavingHint')) + '</p>' +
      forecast.routes.map(function (r) {
        var missing = E.RES.filter(function (k) { return r.gap[k] > 0; }).map(function (k) { return fmt(r.gap[k]) + ' ' + tr(k + 'Unit'); }).join(' · ');
        return '<button type="button" class="gear-route" data-edit-piece="' + r.id + '">' + view.gearItem(r.id, r.to) +
          '<span class="gear-route-piece"><strong>' + view.esc(view.name(r.id)) + '</strong>' +
          '<span class="gear-route-levels">' + view.levelLabel(r.from) + ' → <b class="gear-rarity-red">' + view.esc(view.fullLevel(r.to)) + '</b></span>' +
          '<small>' + view.esc(missing ? BH.fill(tr('oppShort'), { missing: missing }) : tr('readyShort')) + '</small></span>' +
          '<span class="gear-route-metrics"><span><b>' + view.gainPct(r.gain, baseline) + '</b><small>' + view.esc(tr('weightedGain')) + '</small></span>' +
          '<span><b>' + r.efficiency.toFixed(1) + '</b><small>' + view.esc(tr('perCostUnit')) + '</small></span></span></button>';
      }).join('') + view.theoryLink('ranking', 'scoreCostExplained') : '';
  }
  function paint() {
    paintGear(); paintAdvanced(); paintOptimal(); paintPlanShare(); paintFit(); paintResults(); paintSaving(); paintTheory(); paintSheet();
    scheduleSearch(250);
  }
  function applyState(next, options) {
    previous = { state: copy(state), parts: copy(parts), ledger: ledger.snapshot() };
    state = E.normaliseState(next);
    readParts(next);
    syncXP();
    var saved = changed(options); el('undo').hidden = !saved;
    return saved;
  }

  // ── The search, in a worker: what the bag buys now, and the optimal set ──
  function cancelSearch() {
    clearTimeout(searchDelay); clearTimeout(searchTimer);
    if (searchWorker) searchWorker.terminate();
    searchWorker = null; running = false;
    el('results').setAttribute('aria-busy', 'false');
    el('search-status').hidden = true;
  }
  function scheduleSearch(delay) {
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
    if (running) return;
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
        if (event.data && event.data.ok && event.data.fit) { fit = event.data.fit; cancelSearch(); paintFit(); return; }
        if (!event.data || !event.data.ok || !event.data.result || !event.data.result.now) { fail(); return; }
        // The answer is in; the worker stays on to say which profile the gear fits best.
        clearTimeout(searchTimer); running = false;
        el('results').setAttribute('aria-busy', 'false');
        el('search-status').hidden = true;
        result = event.data.result.now;
        optimum = event.data.result.optimal || null;
        planned = event.data.result.planned || null;
        paintGear(); paintOptimal(); paintPlanShare(); paintResults();
      };
      worker.onerror = fail;
      worker.postMessage(copy(state));
    } catch (error) { fail(); }
  }
  function editWeights() {
    var fold = document.getElementById('weights');
    fold.open = true;
    fold.scrollIntoView({ block: 'nearest' });
    el('weights-grid').querySelector('input').focus({ preventScroll: true });
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
    syncAddress();
    openHash();
    window.addEventListener('hashchange', openHash);
    if (ledger) ledger.subscribe(function (saved) {
      if (saving) return;
      ledgerRevision = saved.revision;
      var input = ledger.heroGear(E);
      state = E.normaliseState(input); readParts(input);
      previous = null; el('undo').hidden = true;
      cancelSearch(); revision++; result = null; optimum = null; planned = null; fit = null;
      paint();
    });
    window.addEventListener('player-ledger:error', function () { note('loadFailed'); cancelSearch(); });
    document.addEventListener('input', function (event) {
      var node = event.target;
      if (node.dataset.piece && node.dataset.field !== 'quality') {
        state.pieces[node.dataset.piece] = E.normalisePiece(Object.assign({}, state.pieces[node.dataset.piece], { [node.dataset.field]: Number(node.value) }));
        paintGear();
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
        changed({ piece: node.dataset.piece });
        if (node.dataset.field === 'quality') paintEdit();
        else { node.value = state.pieces[node.dataset.piece][node.dataset.field]; var list = el('edit-fields').querySelector('.gear-steps'); if (list) list.innerHTML = steps(node.dataset.piece); }
      } else if (node.dataset.include) { state.included[node.dataset.include] = node.checked; changed(); }
      else if (node.id === 'gear-show-optimal') { showOptimal = node.checked; paintGear(); paintOptimal(); }
      else if (node.id === 'gear-reforge') { state.reforge = node.checked; changed(); }
      else if (node.id === 'gear-profile') {
        state.profile = node.value;
        if (E.PROFILES[node.value]) state.weights = copy(E.PROFILES[node.value]);
        changed();
        if (node.value === 'custom') editWeights();
      }
    });
    el('forge').addEventListener('click', function (event) {
      var button = event.target.closest('button'); if (!button) return;
      if (button.dataset.showWeights) editWeights();
      else if (button.dataset.useProfile) { state.profile = button.dataset.useProfile; state.weights = copy(E.PROFILES[state.profile]); changed(); el('profile').focus(); }
      else if (button.dataset.open !== undefined) {
        detail = button.dataset.open || null; paintGear();
        var focus = detail ? el('detail').querySelector('.gear-back') : el('cards').querySelector('[data-open="' + button.dataset.open + '"]');
        if (focus) focus.focus();
      }
      else if (button.dataset.select) editPiece(button.dataset.select);
      else if (button.dataset.editPiece) editPiece(button.dataset.editPiece);
      else if (button.id === 'gear-apply-result' && result) {
        var next = copy(state); next.pieces = result.pieces; next.resources = result.remaining;
        if (applyState(next, { source: 'plan' })) note('applied');
      }
    });
    el('edit-dialog').addEventListener('click', function (event) {
      var button = event.target.closest('[data-apply-goal]'); if (!button) return;
      var from = state.pieces[state.selected], target = E.milestone(from, button.dataset.applyGoal); if (!target) return;
      var costs = E.cost(from, target); if (!E.affordable(costs, state.resources)) return;
      var updated = copy(state); updated.pieces[state.selected] = target;
      E.RES.forEach(function (r) { updated.resources[r] -= costs[r]; });
      if (applyState(updated, { source: 'plan' })) { note('applied'); paintEdit(); }
    });
    el('share').addEventListener('click', shareLink);
    el('blank').addEventListener('click', startBlank);
    el('load-mine').addEventListener('click', loadMine);
    el('save-mine').addEventListener('click', function () { el('save-dialog').showModal(); });
    el('cancel-save').addEventListener('click', function () { el('save-dialog').close(); });
    el('confirm-save').addEventListener('click', saveMine);
    el('close-edit').addEventListener('click', function () { el('edit-dialog').close(); });
    el('edit-dialog').addEventListener('close', function () {
      paintGear();
      var button = document.querySelector('.gear-row[data-select="' + state.selected + '"]');
      if (button && button.getClientRects().length) button.focus();
    });
    el('run').addEventListener('click', run);
    el('undo').addEventListener('click', function () {
      if (!previous) return;
      try {
        saving = true;
        var restored = ledger.importJSON(previous.ledger, E, ledgerRevision);
        ledgerRevision = restored.revision;
        var input = ledger.heroGear(E); state = E.normaliseState(input); readParts(input);
        previous = null; changed(); el('undo').hidden = true; note('undone');
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
  window.BH.registerPage({ boot: boot, onChange: function () { if (!state) return; paint(); persist(); } });
})();
