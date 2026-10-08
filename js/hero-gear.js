(function () {
  'use strict';
  var E = window.HeroGear, BH, state, previous, result, running = false, revision = 0, planIndex = 0, resultTroop = 'inf', strategyResult = null;
  var searchWorker, searchTimer, searchDelay, searchFailed = false;
  var ledger, ledgerRevision = 0, saving = false, imports = [], reader, readerSequence = 0, readerPending = {}, importSequence = 0;
  var scriptURL = new URL(document.currentScript.src);
  var base = new URL('./', scriptURL);
  var art = new URL('../img/hero-gear/', base), troopArt = { inf: 'infantry', cav: 'cavalry', arc: 'archer' };
  var resourceArt = { xp: 'xp-part-100', hammers: 'forgehammer', mythic: 'mythic-gear', mithril: 'mithril' };
  var parts = { ten: 0, hundred: 0, remainder: 0 };
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
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return BH.fmt(n); }
  function copy(s) { return JSON.parse(JSON.stringify(s)); }
  function name(id) { var p = id.split('-'); return tr(p[0]) + ' · ' + tr(p[1]); }
  function quality(q) { return tr(q === 'mythic' ? 'mythicQuality' : q); }
  function image(filename, cls) { return '<img class="' + cls + '" src="' + new URL(filename + '.webp', art).href + '" alt="" width="256" height="256">'; }
  function gearImage(id, cls) { var p = id.split('-'); return image(troopArt[p[0]] + '-' + p[1], cls); }
  function gearItem(id, p) {
    return '<span class="gear-item" data-quality="' + p.quality + '" role="img" aria-label="' + esc(pieceLabel(p)) + '">' + gearImage(id, 'gear-art') + '<strong class="gear-item-level" aria-hidden="true">' + levelLabel(p) + '</strong><span class="gear-item-mastery" aria-hidden="true">' + image('forgehammer', 'gear-mastery-art') + p.mastery + '</span><span class="gear-item-rarity" aria-hidden="true">' + esc(quality(p.quality)) + '</span></span>';
  }
  function checkpoint(from, to) {
    if (to.quality !== 'red') return null;
    if (from.quality !== 'red') return { kind: 'ascension', label: tr('ascend') };
    if ([120, 160, 200].some(function (level) { return from.level < level && to.level >= level; })) return { kind: 'mithril', label: tr('mithrilCheckpoint') };
    if (to.mastery > from.mastery) return { kind: 'mastery', label: tr('redMasteryUpgrade') };
    return null;
  }
  function checkpointLabel(mark) { return mark ? '<span class="gear-checkpoint-label">' + esc(mark.label) + '</span>' : ''; }
  function kvkScore(costs, summary) {
    var points = E.kvkPoints(costs);
    return '<span class="gear-kvk-points' + (summary ? ' gear-kvk-summary' : '') + '" data-kvk-points="' + points + '" title="' + esc(tr('kvkWindow')) + '"><strong>' + fmt(points) + '</strong> <span>' + esc(tr('kvkPoints')) + '</span>' + (summary ? '<small>' + esc(tr('kvkWindow')) + '</small>' : '') + '</span>';
  }
  function kvkNote() { return '<details class="gear-kvk-note"><summary>' + esc(tr('kvkScoring')) + '</summary><p class="gear-gloss">' + esc(BH.fill(tr('kvkFormula'), { hammers: fmt(E.KVK_RATES.hammers), mithril: fmt(E.KVK_RATES.mithril) })) + '</p><p class="gear-gloss">' + esc(tr('kvkOnlySpend')) + '</p><a href="../events/#days">' + esc(tr('kvkGuide')) + '</a></details>'; }
  function pieceInfo(slot, p) { return '<span class="gear-piece-info"><span class="gear-slot">' + esc(tr(slot)) + '</span><span class="gear-rarity gear-rarity-' + p.quality + '">' + esc(quality(p.quality)) + '</span></span>'; }
  function comparison(id, from, to, detail) {
    var direction = detail.refund ? 'down' : detail.costs.xp ? 'up' : 'same', mark = checkpoint(from, to);
    var resources = E.RES.filter(function (r) { return r !== 'xp' && detail.costs[r]; }).map(function (r) {
      return '<span class="gear-row-cost" role="img" aria-label="' + esc(fmt(detail.costs[r]) + ' ' + tr(r)) + '" title="' + esc(tr(r)) + '">' + image(resourceArt[r], 'gear-resource-art') + '<span aria-hidden="true">' + fmt(detail.costs[r]) + '</span></span>';
    }).join('');
    var xp = direction === 'same' ? '' : '<span class="gear-xp-flow">' + (direction === 'down' ? '↓ ' + fmt(detail.refund) + ' XP · ' + esc(tr('recoverXP')) : '↑ ' + fmt(detail.costs.xp) + ' XP · ' + esc(tr('redistributeXP'))) + '</span>';
    return '<article class="gear-row gear-change" data-direction="' + direction + '" data-changed="true" data-checkpoint="' + (mark ? mark.kind : '') + '" data-piece-id="' + id + '"><div class="gear-before-after"><span class="gear-state"><small>' + esc(tr('before')) + '</small>' + gearItem(id, from) + '</span><span class="gear-change-arrow" aria-hidden="true"><svg viewBox="0 0 20 20" focusable="false"><path d="M2 10h15m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg></span><span class="gear-state"><small>' + esc(tr('after')) + '</small>' + gearItem(id, to) + '</span></div><div class="gear-change-info"><strong class="gear-change-name">' + esc(tr(id.split('-')[1])) + '</strong>' + checkpointLabel(mark) + '<div class="gear-row-costs">' + xp + resources + kvkScore(detail.costs) + '</div><small class="gear-tile-impact">' + esc(statText(detail.delta).replace(tr('core'), tr(id.split('-')[1] === 'helm' || id.split('-')[1] === 'boots' ? 'lethality' : 'health'))) + '</small></div></article>';
  }
  function levelLabel(p) { return '+' + (p.quality === 'red' ? p.level - 100 : p.level); }
  function pieceLabel(p) { return quality(p.quality) + ' ' + (p.quality === 'red' ? '+' + (p.level - 100) : p.level) + ' · ' + tr('mastery') + ' ' + p.mastery; }
  function note(key) { el('status').hidden = false; el('status').textContent = tr(key); }
  function persist(options) {
    try {
      saving = true;
      var saved = ledger.writeHeroGear(Object.assign({}, state, { parts: parts }), E, Object.assign({ expectedRevision: ledgerRevision }, options));
      ledgerRevision = saved.revision;
      el('save').textContent = tr('saved');
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
    el('status').hidden = true;
    var saved = persist(options);
    paintAnswer();
    return saved;
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
    scheduleSearch(0);
  }
  function paintEdit() {
    var id = state.selected, p = state.pieces[id];
    el('edit-title').textContent = name(id);
    el('edit-fields').innerHTML = '<div class="gear-edit-art">' + gearItem(id, p) + '<span>' + esc(pieceLabel(p)) + '</span></div><div class="gear-edit-inputs"><label><span>' + esc(tr('quality')) + '</span><select data-piece="' + id + '" data-field="quality">' + ['epic','mythic','red'].map(function (q) { return '<option value="' + q + '"' + (q === p.quality ? ' selected' : '') + '>' + esc(quality(q)) + '</option>'; }).join('') + '</select></label>' + numberInput(id, 'level', p, E.cap(p)) + numberInput(id, 'mastery', p, 20) + '</div>';
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
      return '<button type="button" class="gear-row" data-select="' + id + '" data-selected="' + (state.selected === id) + '" aria-pressed="' + (state.selected === id) + '" aria-label="' + esc(name(id) + ' · ' + pieceLabel(p)) + '">' + gearItem(id, p) + pieceInfo(slot, p) + '</button>';
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
    return E.milestone(p, state.goal);
  }
  function statText(delta) {
    return ['core', 'attack', 'defense'].filter(function (key) { return Math.abs(delta[key]) > .01; }).map(function (key) {
      return (delta[key] > 0 ? '+' : '') + (Math.abs(delta[key]) < 10 ? delta[key].toFixed(1) : Math.round(delta[key])) + ' ' + tr(key);
    }).join(' · ') || tr('noStatChange');
  }
  function costText(costs) {
    return E.RES.filter(function (r) { return costs[r]; }).map(function (r) { return fmt(costs[r]) + ' ' + tr(r); }).join(' · ') || tr('noCost');
  }
  function roleText(type) { return tr(type === 'arc' ? 'archerRole' : type === 'inf' ? 'infantryRole' : 'cavalryRole'); }
  function costStrip(costs, remaining) {
    return '<div class="gear-cost-strip">' + E.RES.map(function (r) { return '<div data-cost-resource="' + r + '">' + image(resourceArt[r], 'gear-resource-art') + '<strong>' + fmt(costs[r]) + '</strong><small>' + esc(tr(r + 'Unit')) + '</small>' + (remaining ? '<span>' + (remaining[r] ? fmt(remaining[r]) + ' ' + esc(tr('missingShort')) : esc(tr('readyShort'))) + '</span>' : '') + '</div>'; }).join('') + '</div>';
  }
  function cavalryNote(pieces) {
    if (!state.included.cav) return '';
    pieces = pieces || state.pieces;
    function core(type) { return E.SLOTS.reduce(function (sum, slot) { return sum + E.stats(pieces[type + '-' + slot], slot).core; }, 0); }
    var leaders = ['inf','arc'].filter(function (type) { return state.included[type]; });
    var lag = leaders.length && core('cav') < .65 * Math.min.apply(null, leaders.map(core));
    return lag ? '<p class="gear-catchup">' + esc(tr('cavalryCatchup')) + '</p>' : '';
  }
  function planOutput() {
    var forecast = E.redPlans(state), routes = forecast.routes;
    planIndex = Math.min(planIndex, Math.max(0, routes.length - 1));
    if (!routes.length) return '<p class="gear-gloss">' + esc(tr('noRedRoutes')) + '</p>';
    var active = routes[planIndex], slot = active.id.split('-')[1], w = state.weights[active.id.split('-')[0]];
    var cards = routes.map(function (route, i) {
      var mark = checkpoint(route.from, route.to);
      return '<button type="button" class="gear-route" data-route="' + i + '" data-checkpoint="' + (mark ? mark.kind : '') + '" aria-pressed="' + (i === planIndex) + '">' + gearItem(route.id, route.to) + '<span class="gear-route-piece"><small>' + esc(tr(route.distance === 0 ? 'readyShort' : ['nearBudget','largerBudget','furtherBudget'][i])) + '</small><strong>' + esc(name(route.id)) + '</strong>' + checkpointLabel(mark) + '<span class="gear-route-levels">' + levelLabel(route.from) + ' → <b class="gear-rarity-red">' + esc(quality('red')) + ' ' + levelLabel(route.to) + '</b><small>' + esc(tr('mastery')) + ' ' + route.from.mastery + ' → ' + route.to.mastery + '</small></span></span><span class="gear-route-metrics"><span aria-label="' + esc(tr('weightedGain')) + '"><b>+' + route.gain.toFixed(1) + '</b></span><span aria-label="' + esc(tr('perCostUnit')) + '"><b>' + route.efficiency.toFixed(1) + '</b></span></span></button>';
    }).join('');
    return '<p class="gear-gloss gear-route-caption">' + esc(tr('savingChoices')) + '</p><div class="gear-route-head"><span>' + esc(tr('upgradeChoice')) + '</span><div class="gear-route-metrics"><small>' + esc(tr('weightedGain')) + '</small><small>' + esc(tr('perCostUnit')) + '</small></div></div><div class="gear-routes">' + cards + '</div><div class="gear-route-detail"><p class="gear-route-impact">' + esc(statText(active.delta).replace(tr('core'), tr(slot === 'helm' || slot === 'boots' ? 'lethality' : 'health'))) + '</p><div class="gear-cost-title"><strong>' + esc(tr('totalCost')) + '</strong><small>' + esc(tr('shortfalls')) + '</small></div>' + costStrip(active.costs, active.gap) + '</div>' + kvkScore(active.costs, true) + kvkNote() + cavalryNote() + '<details class="gear-score-explainer"><summary>' + esc(tr('scoreCostExplained')) + '</summary><p class="gear-role">' + esc(roleText(active.id.split('-')[0])) + '</p><p class="gear-gloss">' + esc(tr('budgetMethod')) + '</p><p class="gear-gloss">' + esc(tr('scoreFormula')) + '</p><p class="gear-gloss">' + esc(tr('pieceWeights')) + ': ' + w[slot === 'helm' || slot === 'boots' ? 0 : 1] + ' × ' + esc(tr(slot === 'helm' || slot === 'boots' ? 'lethality' : 'health')) + ', ' + w[0] + ' × ' + esc(tr('attack')) + ', ' + w[1] + ' × ' + esc(tr('defense')) + '.</p><p class="gear-gloss">' + esc(tr('costUnitFormula')) + ': ' + costText(forecast.scale) + '.</p><p class="gear-gloss">' + esc(tr('budgetGrowthFormula')) + '</p></details>';
  }
  function paintAnswer() {
    var isOptimise = state.mode === 'optimise', isPlan = state.mode === 'plan';
    el('modes').querySelectorAll('[data-mode]').forEach(function (button) {
      var active = button.dataset.mode === state.mode;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    });
    el('answer-panel').setAttribute('aria-labelledby', 'gear-mode-' + state.mode);
    el('piece-select').hidden = isOptimise || isPlan;
    el('goals').hidden = isOptimise || isPlan;
    el('optimise-panel').hidden = !isOptimise;
    el('milestone-out').hidden = isOptimise;
    el('goals').querySelectorAll('[data-goal]').forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.goal === state.goal)); });
    if (isOptimise) { paintPreview(state.pieces[state.selected], null); scheduleSearch(250); return; }
    cancelSearch();
    if (isPlan) { paintPreview(state.pieces[state.selected], nextTarget()); el('milestone-out').innerHTML = planOutput(); return; }
    var from = state.pieces[state.selected], to = nextTarget(), out = el('milestone-out');
    paintPreview(from, to);
    if (!to) { out.innerHTML = '<p class="gear-gloss">' + esc(tr(from.quality === 'epic' ? 'epicBlocked' : state.goal === 'red' ? 'alreadyRed' : 'maxed')) + '</p>' + nearList(); return; }
    var costs = E.cost(from, to), ready = E.affordable(costs, state.resources);
    out.innerHTML = '<h3>' + esc(name(state.selected)) + '</h3><button type="button" class="gear-upgrade" data-edit-piece="' + state.selected + '" aria-label="' + esc(tr('editPiece')) + '">' + gearImage(state.selected, 'gear-upgrade-art') + '<span><span class="gear-upgrade-levels">' + levelLabel(from) + ' <span>→</span> ' + levelLabel(to) + '</span><small>' + esc(tr('mastery')) + ' ' + from.mastery + ' → ' + to.mastery + '</small><small>' + esc(quality(from.quality)) + (from.quality !== to.quality ? ' → ' + esc(quality(to.quality)) : '') + '</small></span></button>' + kvkScore(costs, true) + costTable(costs) + kvkNote() +
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
    var alternatives = comparison && comparison.alternatives || [];
    var cards = alternatives.filter(function (r) {
      return E.RES.some(function (key) { return r.gap[key] > 0; }) || r.reforgeNow;
    }).map(function (r) {
      var missing = E.RES.filter(function (key) { return r.gap[key] > 0; })
        .map(function (key) { return fmt(r.gap[key]) + ' ' + esc(tr(key)); }).join(' · ');
      var delayed = r.afterSpendGap && E.RES.some(function (key) { return r.afterSpendGap[key] > r.gap[key]; });
      var note = r.reforgeNow ? 'Reforging can reach this milestone now. Compare the full plan before applying it.' :
        r.optimalAtThreshold ? 'This milestone is part of a highest-scoring plan at that budget.' :
        r.beatsCurrentPlan ? 'A milestone-first plan beats today’s spend-now score once these resources are available, but other plans may do better.' :
        'Reaching this milestone does not currently outperform the spend-now result.';
      return '<article class="gear-opportunity">' +
        '<div class="gear-opportunity-head">' + gearImage(r.id, 'gear-opportunity-art') +
        '<div><strong>' + esc(name(r.id)) + ' · ' + r.from.level + ' → ' + r.to.level + '</strong>' +
        '<small>' + esc(tr('mithrilCheckpoint')) + ' · +' + r.milestoneGain.toFixed(1) + ' ' + esc(tr('weightedGain')) + '</small></div></div>' +
        '<p>' + (missing ? esc(missing) + ' short. ' : 'Affordable now. ') + esc(note) + '</p>' +
        (delayed ? '<p>Spending now increases the milestone shortfall to ' + E.RES.filter(function (key) { return r.afterSpendGap[key]; }).map(function (key) { return fmt(r.afterSpendGap[key]) + ' ' + esc(tr(key)); }).join(' · ') + '.</p>' : '') +
        (r.futurePlan ? '<p>At this resource threshold: +' + (r.futurePlan.score - r.futurePlan.baseline).toFixed(1) + ' weighted gain for the milestone-first plan; best found +' + (r.futureBestScore - r.futurePlan.baseline).toFixed(1) + '.</p>' : '') +
        (r.reforgeNow ? '<p>Reforge plan: +' + (r.reforgeNow.score - r.reforgeNow.baseline).toFixed(1) + ' weighted gain, including changes to other gear.</p>' : '') +
        '<button type="button" data-mode="plan">' + esc(tr('seeSavingCosts')) + ' →</button></article>';
    }).join('');
    host.innerHTML = cards ? '<details class="gear-saving-options"><summary>' + esc(tr('budgetRoutes')) + '</summary>' + cards + '</details>' : '';
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
      el('results').innerHTML = '<div class="gear-empty"><p class="gear-gloss">' + esc(tr(message)) + '</p>' + (message === 'noTroopsSelected' ? '<button type="button" class="gear-action" data-view="gear">' + esc(tr('chooseTroops')) + '</button>' : message === 'noWeightsSelected' ? '<button type="button" class="gear-action" data-show-weights="true">' + esc(tr('editWeights')) + '</button>' : '<button type="button" class="gear-action" data-mode="plan">' + esc(tr('seeSavingCosts')) + '</button>') + '</div>'; return;
    }
    if (!state.included[resultTroop]) resultTroop = result.changes[0].split('-')[0];
    var details = result.details, tabs = E.TYPES.filter(function (type) { return state.included[type]; }).map(function (type) { var count = details.filter(function (d) { return d.id.startsWith(type + '-'); }).length; return '<button type="button" data-result-troop="' + type + '" aria-pressed="' + (type === resultTroop) + '">' + esc(tr(type)) + ' <small>' + count + '</small></button>'; }).join('');
    var tiles = details.filter(function (d) { return d.id.startsWith(resultTroop + '-'); }).sort(function (a, b) {
      function priority(d) { return d.refund ? 2 : checkpoint(d.from, d.to) ? 0 : 1; }
      return priority(a) - priority(b) || b.gain - a.gain;
    }).map(function (detail) {
      return comparison(detail.id, detail.from, detail.to, detail);
    }).join('');
    var kept = E.SLOTS.filter(function (slot) { return !result.changes.includes(resultTroop + '-' + slot); });
    el('results').innerHTML = '<div class="gear-result-summary"><strong>+' + result.gain.toFixed(1) + '</strong><span>' + esc(tr('weightedGain')) + '</span><small>' + result.changes.length + ' ' + esc(tr('piecesChanged')) + '</small></div>' + kvkScore(result.spent, true) + '<div class="gear-rail gear-result-troops">' + tabs + '</div><div class="gear-result-grid">' + tiles + '</div>' + (kept.length ? '<p class="gear-kept">' + esc(tr('unchangedSlots')) + ': ' + kept.map(function (slot) { return esc(tr(slot)); }).join(' · ') + '</p>' : '') + (result.refund ? '<p class="gear-reforge-flow">↓ ' + fmt(result.refund) + ' XP ' + esc(tr('recoverXP')) + ' → ↑ ' + fmt(result.spent.xp) + ' XP ' + esc(tr('redistributeXP')) + '</p>' : '') + '<div class="gear-cost-title"><strong>' + esc(tr('spend')) + '</strong></div>' + costStrip(result.spent) + kvkNote() + cavalryNote(result.pieces) + '<details><summary>' + esc(tr('remaining')) + '</summary>' + costStrip(result.remaining) + '</details><div class="gear-record-action"><button type="button" id="gear-apply-result" class="gear-primary gear-action" aria-describedby="gear-record-hint">' + esc(tr('applyResult')) + '</button><p id="gear-record-hint" class="gear-gloss">' + esc(tr('applyHint')) + '</p></div>';
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
    el('settings').open = true;
    el('settings').scrollIntoView({ block: 'nearest' });
    el('weights').querySelector('input').focus({ preventScroll: true });
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
          var url = workerURL('ocr-worker.js'); url.searchParams.set('backend', 'wasm');
          reader = new Worker(url, { type: 'module' });
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
    importSequence++;
    killReader();
    imports.forEach(function (item) { URL.revokeObjectURL(item.url); }); imports = [];
    el('import-review').textContent = ''; el('read-status').textContent = ''; el('apply-import').disabled = true;
    el('images').value = ''; el('images').disabled = false;
    el('import-pick').hidden = false; el('replace-images').hidden = true;
    el('import-dialog').removeAttribute('aria-busy');
    el('import-scroll').scrollTop = 0;
  }
  function fitImportViewport() {
    var viewport = window.visualViewport, dialog = el('import-dialog');
    if (!viewport || !dialog.open) return;
    dialog.style.setProperty('--gear-view-height', Math.round(viewport.height) + 'px');
    dialog.style.setProperty('--gear-view-top', Math.round(viewport.offsetTop) + 'px');
  }
  function importItem(item, index) {
    function input(key, max) { var value = item[key] === null ? '' : item[key] - (key === 'level' && item.quality === 'red' ? 100 : 0); return '<label><span>' + esc(tr(key === 'level' ? 'importEnhancement' : key)) + '</span><input type="number" inputmode="numeric" min="0" max="' + max + '" step="1" data-import-index="' + index + '" data-import-field="' + key + '" value="' + value + '" placeholder="' + esc(tr('unread')) + '"></label>'; }
    function select(key, values) { return '<label><span>' + esc(tr(key)) + '</span><select data-import-index="' + index + '" data-import-field="' + key + '">' + values.map(function (v) { return '<option value="' + v + '"' + (item[key] === v ? ' selected' : '') + '>' + esc(v === '' ? tr('chooseTroop') : v === 'mythic' ? tr('mythicQuality') : tr(v)) + '</option>'; }).join('') + '</select></label>'; }
    return '<div class="gear-import-item" data-review-index="' + index + '"><div class="gear-import-source"><img src="' + esc(item.url) + '" alt="' + esc(item.filename) + '"><label class="gear-include"><input type="checkbox" checked data-import-index="' + index + '" data-import-field="included"><span>' + esc(tr('includeImport')) + '</span></label></div><div class="gear-import-fields"><strong class="gear-import-name">' + esc((item.troop ? tr(item.troop) : tr('chooseTroop')) + ' · ' + tr(item.slot)) + '<small>' + esc(quality(item.quality)) + '</small></strong>' + input('level', item.quality === 'epic' ? 80 : 100) + input('mastery', 20) + '<details class="gear-import-identity"' + (!item.troop ? ' open' : '') + '><summary>' + esc(tr('changeImportPiece')) + '</summary><div>' + select('troop', item.overview ? [''].concat(E.TYPES) : E.TYPES) + select('slot', E.SLOTS) + select('quality', ['keep','epic','mythic','red']) + '</div></details>' + (item.level === null || item.mastery === null ? '<p class="gear-import-warning">' + esc(tr(item.failed ? 'importReaderFailed' : 'importUnread')) + '</p>' : '') + '</div></div>';
  }
  async function readImages() {
    var files = Array.from(el('images').files || []);
    clearImports();
    if (!files.length) return;
    if (files.length > 12 || files.some(function (file) { return !file.type.startsWith('image/') || file.size > 20 * 1024 * 1024; })) { el('read-status').textContent = tr('imageLimit'); return; }
    var sequence = importSequence;
    el('images').disabled = true;
    el('import-pick').hidden = true; el('replace-images').hidden = false; el('replace-images').disabled = true;
    el('import-dialog').setAttribute('aria-busy', 'true');
    try {
      for (var i = 0; i < files.length; i++) {
        el('read-status').textContent = BH.fill(tr('reading'), { n: i + 1, total: files.length });
        var pieces, contentHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await files[i].arrayBuffer()))).map(function (n) { return n.toString(16).padStart(2, '0'); }).join('');
        try { pieces = await window.HeroGearOCR.overview(files[i], function (file) { if (sequence !== importSequence) return Promise.reject(new Error('Cancelled')); return read(file); }); }
        catch (error) { pieces = null; }
        if (sequence !== importSequence) return;
        try {
          if (!pieces) pieces = [window.HeroGearOCR.parse((await read(files[i])).items)];
        } catch (error) { pieces = [{ level: null, mastery: null, failed: true }]; }
        if (sequence !== importSequence) return;
        el('import-review').insertAdjacentHTML('beforeend', '<p class="gear-import-file">' + esc(files[i].name) + '</p>');
        pieces.forEach(function (parsed) {
          var item = Object.assign({}, parsed, { troop: parsed.overview ? parsed.troop || '' : parsed.troop || state.troop, slot: parsed.slot || state.selected.split('-')[1], quality: parsed.quality || 'keep', filename: files[i].name, contentHash: contentHash, url: URL.createObjectURL(parsed.preview || files[i]), included: true });
          delete item.preview;
          imports.push(item);
          el('import-review').insertAdjacentHTML('beforeend', importItem(item, imports.length - 1));
        });
      }
      el('read-status').textContent = BH.fill(tr('importReady'), { n: imports.length });
      el('apply-import').disabled = false;
    } catch (error) {
      if (sequence === importSequence) { el('read-status').textContent = tr('importReaderFailed'); el('apply-import').disabled = true; }
    } finally {
      if (sequence === importSequence) { el('images').disabled = false; el('replace-images').disabled = false; el('import-dialog').removeAttribute('aria-busy'); }
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
      ledger = window.PlayerLedger.shared();
      var saved = ledger.migrate(E), input = ledger.heroGear(E);
      ledgerRevision = saved.revision;
      state = E.normaliseState(input); readParts(input);
    } catch (error) { note('loadFailed'); el('save').textContent = tr('saveFailed'); }
    syncXP();
    paint();
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
      if (node.dataset.resourcePart) {
        parts[node.dataset.resourcePart] = Math.min(1e7, Math.max(0, Math.floor(Number(node.value) || 0)));
        syncXP(); paintParts(); changed({ resource: 'xp' }); return;
      } else if (node.dataset.resource) state.resources[node.dataset.resource] = Math.min(1e9, Math.max(0, Math.floor(Number(node.value) || 0)));
      else if (node.dataset.piece && node.dataset.field !== 'quality') {
        state.pieces[node.dataset.piece] = E.normalisePiece(Object.assign({}, state.pieces[node.dataset.piece], { [node.dataset.field]: Number(node.value) }));
        paintEditor();
        el('edit-fields').querySelector('.gear-edit-art').innerHTML = gearItem(node.dataset.piece, state.pieces[node.dataset.piece]) + '<span>' + esc(pieceLabel(state.pieces[node.dataset.piece])) + '</span>';
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
      } else if (node.dataset.resourcePart) { node.value = parts[node.dataset.resourcePart]; }
      else if (node.dataset.resource) node.value = state.resources[node.dataset.resource];
      else if (node.id === 'gear-include') { state.included[state.troop] = node.checked; changed(); }
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
      else if (button.dataset.troop) selectPiece(button.dataset.troop + '-' + state.selected.split('-')[1]);
      else if (button.dataset.select && button.classList.contains('gear-row')) editPiece(button.dataset.select);
      else if (button.dataset.select) selectPiece(button.dataset.select);
      else if (button.dataset.editPiece) editPiece(button.dataset.editPiece);
      else if (button.dataset.view) { state.view = button.dataset.view; persist(); paintView(); }
      else if (button.dataset.mode) { state.mode = button.dataset.mode; persist(); paintAnswer(); scheduleSearch(0); }
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
    el('export').addEventListener('click', function () {
      try {
        var blob = new Blob([ledger.exportJSON()], { type: 'application/json' }), url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = 'kingshot-player.json'; link.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      } catch (error) { note('loadFailed'); }
    });
    el('load').addEventListener('click', function () { el('save-file').click(); });
    el('save-file').addEventListener('change', async function () {
      var file = this.files[0]; this.value = ''; if (!file) return;
      try {
        if (file.size > 1024 * 1024) throw new Error('Too large');
        var data = JSON.parse(await file.text()), before = ledger.snapshot();
        saving = true;
        var loaded = ledger.importJSON(data, E, ledgerRevision);
        ledgerRevision = loaded.revision;
        var input = ledger.heroGear(E); state = E.normaliseState(input); readParts(input);
        previous = { ledger: before }; cancelSearch(); revision++; result = null; strategyResult = null;
        el('results').textContent = ''; el('opportunities').textContent = '';
        paint(); el('undo').hidden = false; note('loaded');
      } catch (error) { note('invalidSave'); } finally { saving = false; }
    });
    el('reset').addEventListener('click', function () { el('reset-dialog').showModal(); });
    el('cancel-reset').addEventListener('click', function () { el('reset-dialog').close(); });
    el('confirm-reset').addEventListener('click', function () { if (applyState(Object.assign(E.defaults(), { parts: { ten: 0, hundred: 0, remainder: 0 } }), { all: true, source: 'reset' })) { el('reset-dialog').close(); note('resetDone'); } });
    el('import').addEventListener('click', function () { clearImports(); document.documentElement.classList.add('gear-import-open'); el('import-dialog').showModal(); fitImportViewport(); });
    if (window.visualViewport) { window.visualViewport.addEventListener('resize', fitImportViewport); window.visualViewport.addEventListener('scroll', fitImportViewport); }
    ['close-import', 'cancel-import'].forEach(function (id) { el(id).addEventListener('click', function () { clearImports(); el('import-dialog').close(); }); });
    el('import-dialog').addEventListener('close', function () { document.documentElement.classList.remove('gear-import-open'); });
    el('import-dialog').addEventListener('cancel', clearImports);
    el('images').addEventListener('change', readImages);
    el('replace-images').addEventListener('click', function () { el('images').click(); });
    el('import-review').addEventListener('input', function (event) {
      var node = event.target, i = node.dataset.importIndex, field = node.dataset.importField;
      if (i === undefined || !field) return;
      var item = imports[i]; if (!item) return;
      if (field === 'quality' && item.level !== null) item.level += (node.value === 'red' ? 100 : 0) - (item.quality === 'red' ? 100 : 0);
      item[field] = field === 'included' ? node.checked : field === 'level' || field === 'mastery' ? (node.value === '' ? null : Math.max(0, Math.min(field === 'level' ? item.quality === 'epic' ? 80 : 100 : 20, Math.floor(Number(node.value) || 0))) + (field === 'level' && item.quality === 'red' ? 100 : 0)) : node.value;
      var row = node.closest('.gear-import-item');
      row.dataset.included = String(item.included);
      if (['troop', 'slot', 'quality'].includes(field)) {
        row.querySelector('.gear-import-name').innerHTML = esc((item.troop ? tr(item.troop) : tr('chooseTroop')) + ' · ' + tr(item.slot)) + '<small>' + esc(quality(item.quality)) + '</small>';
        row.querySelector('[data-import-field="level"]').max = item.quality === 'epic' ? 80 : 100;
      }
    });
    el('apply-import').addEventListener('click', function () {
      var invalidInput = Array.from(el('import-review').querySelectorAll('input[type="number"]')).find(function (node) { return imports[node.dataset.importIndex].included && !node.validity.valid; });
      if (invalidInput) { el('read-status').textContent = tr('overviewConflict'); invalidInput.reportValidity(); return; }
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
      next.selected = Object.keys(seen)[0];
      next.troop = next.selected.split('-')[0];
      next.view = 'gear';
      var records = {}, snapshot;
      try { snapshot = ledger.snapshot(); } catch (error) { note('loadFailed'); return; }
      imports.filter(function (item) { return item.included; }).forEach(function (item) {
        var hash = item.contentHash, id = item.troop + '-' + item.slot;
        if (!records[hash]) records[hash] = { id: 'gear-' + hash, sourceType: 'hero-gear', at: new Date().toISOString(), contentHash: hash, confirmation: 'confirmed', itemDelta: {} };
        records[hash].itemDelta[id] = { before: snapshot.heroGear.pieces[id] || null, after: copy(next.pieces[id]) };
      });
      if (snapshot.imports.some(function (record) { return records[record.contentHash]; })) { el('read-status').textContent = tr('overviewConflict'); return; }
      if (applyState(next, { source: 'screenshot', records: Object.values(records) })) { el('import-dialog').close(); clearImports(); note('imported'); }
    });
  }
  window.BH.registerPage({ boot: boot, onChange: function () { if (!state) return; paint(); persist(); paintResults(); } });
})();

