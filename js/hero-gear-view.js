(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HeroGearView = factory();
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  function create(options) {
    var E = options.engine, tr = options.tr, fmt = options.fmt, art = options.art, fill = options.fill;
    var troopArt = { inf: 'infantry', cav: 'cavalry', arc: 'archer' };
    var resourceArt = { xp: 'xp-part-100', hammers: 'forgehammer', mythic: 'mythic-gear', mithril: 'mithril' };

    function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function name(id) { var p = id.split('-'); return tr(p[0]) + ' · ' + tr(p[1]); }
    function quality(q) { return tr(q === 'mythic' ? 'mythicQuality' : q); }
    function image(filename, cls) { return '<img class="' + cls + '" src="' + new URL(filename + '.webp', art).href + '" alt="" width="256" height="256">'; }
    function gearImage(id, cls) { var p = id.split('-'); return image(troopArt[p[0]] + '-' + p[1], cls); }
    function gearItem(id, p) {
      return '<span class="gear-item" data-quality="' + p.quality + '" role="img" aria-label="' + esc(pieceLabel(p)) + '">' + gearImage(id, 'gear-art') + '<strong class="gear-item-level" aria-hidden="true">' + levelLabel(p) + '</strong>' +
        '<span class="gear-item-mastery" aria-hidden="true">' + image('forgehammer', 'gear-mastery-art') + p.mastery + '</span>' +
        '<span class="gear-item-rarity" aria-hidden="true">' + esc(quality(p.quality)) + '</span>' +
        '</span>';
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
      return '<span class="gear-kvk-points' + (summary ? ' gear-kvk-summary' : '') + '" data-kvk-points="' + points + '" title="' + esc(tr('kvkWindow')) + '">' +
        '<strong>' + fmt(points) + '</strong> <span>' +
        esc(tr('kvkPoints')) + '</span>' +
        (summary ? '<small>' + esc(tr('kvkWindow')) + '</small>' : '') + '</span>';
    }
    // Explanations live on the Theory tab; results link to their section instead of folding them in.
    function theoryLink(id, key) { return '<a class="gear-theory-link" href="#' + id + '">' + esc(tr(key)) + ' →</a>'; }
    function kvkNote() { return theoryLink('kvk-points', 'kvkScoring'); }
    function pieceInfo(slot, p) {
      return '<span class="gear-piece-info">' +
        '<span class="gear-slot">' + esc(tr(slot)) + '</span>' +
        '<span class="gear-rarity gear-rarity-' + p.quality + '">' + esc(quality(p.quality)) + '</span>' +
      '</span>';
    }
    function beforeAfter(id, from, to, before, after) {
      return '<div class="gear-before-after">' +
        '<span class="gear-state"><small>' + esc(tr(before)) + '</small>' + gearItem(id, from) + '</span>' +
        '<span class="gear-change-arrow" aria-hidden="true">' +
          '<svg viewBox="0 0 20 20" focusable="false">' +
            '<path d="M2 10h15m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5"' +
              ' stroke-linecap="round" stroke-linejoin="round"></path>' +
          '</svg>' +
        '</span>' +
        '<span class="gear-state"><small>' + esc(tr(after)) + '</small>' + gearItem(id, to) + '</span>' +
      '</div>';
    }
    function comparison(id, from, to, detail) {
      var direction = detail.refund ? 'down' : detail.costs.xp ? 'up' : 'same', mark = checkpoint(from, to);
      var resources = E.RES.filter(function (r) { return r !== 'xp' && detail.costs[r]; }).map(function (r) {
        return '<span class="gear-row-cost" role="img" aria-label="' + esc(fmt(detail.costs[r]) + ' ' + tr(r)) + '" title="' + esc(tr(r)) + '">' + image(resourceArt[r], 'gear-resource-art') + '<span aria-hidden="true">' + fmt(detail.costs[r]) + '</span>' +
          '</span>';
      }).join('');
      var xp = direction === 'same' ? '' : '<span class="gear-xp-flow">' + (direction === 'down' ? '↓ ' + fmt(detail.refund) + ' XP · ' + esc(tr('recoverXP')) : '↑ ' + fmt(detail.costs.xp) + ' XP · ' + esc(tr('redistributeXP'))) + '</span>';
      if (detail.hammerRefund) xp += '<span class="gear-xp-flow" data-hammer-refund="' + detail.hammerRefund + '">↓ ' + fmt(detail.hammerRefund) + ' ' + esc(tr('recoverHammers')) + '</span>';
      return '<article class="gear-row gear-change" data-direction="' + direction + '" data-changed="true" data-checkpoint="' + (mark ? mark.kind : '') + '" data-piece-id="' + id + '">' +
        beforeAfter(id, from, to, 'before', 'after') +
        '<div class="gear-change-info">' +
        '<strong class="gear-change-name">' + esc(tr(id.split('-')[1])) + '</strong>' +
        checkpointLabel(mark) + '<div class="gear-row-costs">' + xp + resources + kvkScore(detail.costs) + '</div>' +
        '<small class="gear-tile-impact">' + esc(statText(detail.delta).replace(tr('core'), tr(id.split('-')[1] === 'helm' || id.split('-')[1] === 'boots' ? 'lethality' : 'health'))) + '</small>' +
        '</div>' +
        '</article>';
    }
    function fullLevel(p) { return (p.quality === 'red' ? quality('red') + ' ' : '') + levelLabel(p); }
    function levelLabel(p) { return '+' + (p.quality === 'red' ? p.level - 100 : p.level); }
    function pieceLabel(p) { return quality(p.quality) + ' ' + (p.quality === 'red' ? '+' + (p.level - 100) : p.level) + ' · ' + tr('mastery') + ' ' + p.mastery; }
    function numberInput(id, key, p, max) {
      return '<label>' +
        '<span>' + esc(tr(key)) + '</span>' +
        '<input type="number" inputmode="numeric" min="' + (key === 'level' && p.quality === 'red' ? 100 : 0) + '" max="' + max + '" step="1" data-piece="' + id + '" data-field="' + key + '" value="' + p[key] + '" aria-label="' + esc(name(id) + ' · ' + tr(key)) + '"' + (key === 'mastery' && p.quality === 'epic' ? ' disabled' : '') + '>' +
        '</label>';
    }
    function costTable(costs, resources) {
      var gaps = E.gap(costs, resources);
      return '<div class="gear-cost-ledger" role="list">' + E.RES.map(function (r) {
        var progress = costs[r] ? Math.min(100, resources[r] / costs[r] * 100) : 100;
        return '<div class="gear-cost-row" data-cost-resource="' + r + '" role="listitem">' + image(resourceArt[r], 'gear-resource-art') + '<div class="gear-cost-info">' +
          '<span>' + esc(tr(r)) + '</span>' +
          '<progress max="100" value="' + progress + '" aria-label="' + esc(tr(r)) + '">' +
          '</progress>' +
          '<small>' + esc(tr('have')) + ' ' + fmt(resources[r]) + '</small>' +
          '</div>' +
          '<div class="gear-cost-numbers">' +
          '<strong>' + fmt(costs[r]) + '</strong>' +
          '<small class="' + (gaps[r] ? 'gear-short' : 'gear-ready') + '">' + (gaps[r] ? fmt(gaps[r]) + ' ' + esc(tr('missingShort')) : esc(tr('readyShort'))) + '</small>' +
          '</div>' +
          '</div>';
      }).join('') + '</div>';
    }
    function statText(delta) {
      return ['core', 'attack', 'defense'].filter(function (key) { return Math.abs(delta[key]) > .01; }).map(function (key) {
        return (delta[key] > 0 ? '+' : '') + (Math.abs(delta[key]) < 10 ? delta[key].toFixed(1) : Math.round(delta[key])) + ' ' + tr(key);
      }).join(' · ') || tr('noStatChange');
    }
    function costText(costs) {
      return E.RES.filter(function (r) { return costs[r]; }).map(function (r) { return fmt(costs[r]) + ' ' + tr(r); }).join(' · ') || tr('noCost');
    }
    function gainPct(gain, baseline) { return '+' + (baseline > 0 ? gain / baseline * 100 : 0).toFixed(1) + '%'; }
    function roleText(type) { return tr(type === 'arc' ? 'archerRole' : type === 'inf' ? 'infantryRole' : 'cavalryRole'); }
    function costStrip(costs, remaining) {
      return '<div class="gear-cost-strip">' + E.RES.map(function (r) { return '<div data-cost-resource="' + r + '">' + image(resourceArt[r], 'gear-resource-art') + '<strong>' + fmt(costs[r]) + '</strong>' +
        '<small>' + esc(tr(r + 'Unit')) + '</small>' +
        (remaining ? '<span>' + (remaining[r] ? fmt(remaining[r]) + ' ' + esc(tr('missingShort')) : esc(tr('readyShort'))) + '</span>' : '') + '</div>'; }).join('') + '</div>';
    }
    // What the bag spends, with what is left of each under it.
    function spendStrip(spent, left) {
      return '<div class="gear-cost-strip gear-spend-strip">' + E.RES.map(function (r) { return '<div data-cost-resource="' + r + '">' + image(resourceArt[r], 'gear-resource-art') + '<strong>' + fmt(spent[r]) + '</strong>' +
        '<small>' + esc(tr(r + 'Unit')) + '</small><small class="gear-left">' + esc(fill(tr('leftShort'), { n: fmt(left[r]) })) + '</small></div>'; }).join('') + '</div>';
    }
    // One step of Spend now: which troop's piece, from what to what, and what it takes or gives back.
    function stepRow(d, n) {
      var slot = d.id.split('-')[1], mark = checkpoint(d.from, d.to), direction = d.refund ? 'down' : d.costs.xp ? 'up' : 'same';
      var flows = [];
      if (d.refund) flows.push('<span class="gear-xp-flow">↓ ' + esc(fill(tr('xpBack'), { n: fmt(d.refund) })) + '</span>');
      else if (d.costs.xp) flows.push('<span class="gear-xp-flow">' + fmt(d.costs.xp) + ' XP</span>');
      if (d.hammerRefund) flows.push('<span class="gear-xp-flow" data-hammer-refund="' + d.hammerRefund + '">↓ ' + fmt(d.hammerRefund) + ' ' + esc(tr('recoverHammers')) + '</span>');
      E.RES.filter(function (r) { return r !== 'xp' && d.costs[r]; }).forEach(function (r) {
        flows.push('<span class="gear-row-cost" role="img" aria-label="' + esc(fmt(d.costs[r]) + ' ' + tr(r)) + '" title="' + esc(tr(r)) + '">' + image(resourceArt[r], 'gear-resource-art') + '<span aria-hidden="true">' + fmt(d.costs[r]) + '</span></span>');
      });
      var points = E.kvkPoints(d.costs);
      if (points) flows.push(kvkScore(d.costs));
      var stat = statText(d.delta).replace(tr('core'), tr(slot === 'helm' || slot === 'boots' ? 'lethality' : 'health'));
      var mastery = d.to.mastery !== d.from.mastery ? ' · ' + esc(tr('mastery')) + ' ' + d.from.mastery + ' → ' + d.to.mastery : '';
      return '<article class="gear-row gear-change gear-step-row" data-direction="' + direction + '" data-changed="true" data-checkpoint="' + (mark ? mark.kind : '') + '" data-piece-id="' + d.id + '">' +
        '<span class="gear-step-num" aria-hidden="true">' + n + '</span>' +
        '<span class="gear-step-art">' + gearItem(d.id, d.from) + '<span class="gear-change-arrow" aria-hidden="true">→</span>' + gearItem(d.id, d.to) + '</span>' +
        '<div class="gear-change-info"><strong class="gear-change-name">' + esc(name(d.id)) + '</strong>' + checkpointLabel(mark) +
        '<span class="gear-step-levels">' + esc(fullLevel(d.from)) + ' → ' + esc(fullLevel(d.to)) + mastery + ' <span class="gear-tile-impact">' + esc(stat) + '</span></span>' +
        '<div class="gear-row-costs">' + flows.join('') + '</div></div></article>';
    }
    function splitChip(r, from, to) {
      if (!from && !to) return '';
      var over = from - to;
      return '<span class="gear-split-chip" data-split-resource="' + r + '"' + (over > 0 ? ' data-over="true"' : '') + ' role="img" aria-label="' + esc(tr(r) + ' ' + fmt(from) + ' → ' + fmt(to)) + '" title="' + esc(tr(r)) + '">' + image(resourceArt[r], 'gear-resource-art') + '<span aria-hidden="true">' + fmt(from) + ' → ' + fmt(to) + '</span>' +
        '</span>';
    }
    function splitSet(set) {
      var gain = set.score - set.current, moved = set.pieces.filter(function (p) { return JSON.stringify(p.from) !== JSON.stringify(p.to); });
      var over = ['hammers', 'mithril'].map(function (r) {
        var heavy = set.pieces.filter(function (p) { return p.fromCost[r] > p.toCost[r]; });
        return heavy.length ? fill(tr('splitOver'), { amount: fmt(heavy.reduce(function (sum, p) { return sum + p.fromCost[r] - p.toCost[r]; }, 0)), resource: tr(r + 'Unit'), pieces: heavy.map(function (p) { return tr(p.id.split('-')[1]); }).join(', ') }) : '';
      }).filter(Boolean);
      var matched = gain <= set.current * 5e-4;
      var rows = matched ? '' : moved.map(function (p) {
        return '<article class="gear-row gear-change gear-split-row" data-piece-id="' + p.id + '">' +
          beforeAfter(p.id, p.from, p.to, 'splitNow', 'splitBest') +
          '<div class="gear-change-info">' +
          '<strong class="gear-change-name">' + esc(tr(p.id.split('-')[1])) + '</strong>' +
          '<div class="gear-row-costs">' + ['hammers', 'mithril', 'mythic'].map(function (r) { return splitChip(r, p.fromCost[r], p.toCost[r]); }).join('') + '</div>' +
          '</div>' +
          '</article>';
      }).join('');
      return '<section class="gear-split" data-split-troop="' + set.type + '">' +
        '<div class="gear-result-summary">' +
        '<strong>' + (matched ? '✓' : gainPct(gain, set.current)) + '</strong>' +
        '<span>' + esc(tr(set.type)) + '</span>' +
        '<small>' + esc(tr(matched ? 'splitMatches' : 'splitGain')) + '</small>' +
        '</div>' +
        (matched ? '' : over.map(function (line) { return '<p class="gear-split-over">' + esc(line) + '</p>'; }).join('') + '<div class="gear-result-grid">' + rows + '</div>') + '</section>';
    }
    function splitOutput(sets) {
      if (!sets.length) return '<p class="gear-gloss">' + esc(tr('noTroopsSelected')) + '</p>';
      return '<p class="gear-gloss">' + esc(tr('splitIntro')) + '</p>' + sets.map(splitSet).join('') + theoryLink('best-split-method', 'splitMethodTitle');
    }
    function editorFields(id, p) {
      return '<div class="gear-edit-art">' + gearItem(id, p) + '<span>' + esc(pieceLabel(p)) + '</span>' +
        '</div>' +
        '<div class="gear-edit-inputs">' +
        '<label>' +
        '<span>' + esc(tr('quality')) + '</span>' +
        '<select data-piece="' + id + '" data-field="quality">' + ['epic','mythic','red'].map(function (q) { return '<option value="' + q + '"' + (q === p.quality ? ' selected' : '') + '>' + esc(quality(q)) + '</option>'; }).join('') + '</select>' +
        '</label>' +
        numberInput(id, 'level', p, E.cap(p)) + numberInput(id, 'mastery', p, 20) + '</div>';
    }
    function preview(id, from, to) {
      return '<button type="button" data-view="plan" class="gear-preview-button">' + gearImage(id, 'gear-preview-art') + '<span>' +
        '<strong>' + esc(name(id)) + '</strong>' +
        '<span>' + levelLabel(from) + (to ? ' → ' + levelLabel(to) : '') + '</span>' +
        '</span>' +
        '<span class="gear-preview-link">' + esc(tr('viewPlan')) + ' →</span>' +
        '</button>';
    }
    function cavalryNote(state, pieces) {
      if (!state.included.cav) return '';
      pieces = pieces || state.pieces;
      function core(type) { return E.SLOTS.reduce(function (sum, slot) { return sum + E.stats(pieces[type + '-' + slot], slot).core; }, 0); }
      var leaders = ['inf','arc'].filter(function (type) { return state.included[type]; });
      var lag = leaders.length && core('cav') < .65 * Math.min.apply(null, leaders.map(core));
      return lag ? '<p class="gear-catchup">' + esc(tr('cavalryCatchup')) + '</p>' : '';
    }
    function planOutput(state, forecast, planIndex) {
      var routes = forecast.routes;
      if (!routes.length) return '<p class="gear-gloss">' + esc(tr('noRedRoutes')) + '</p>';
      var active = routes[planIndex], slot = active.id.split('-')[1], w = state.weights[active.id.split('-')[0]];
      var cards = routes.map(function (route, i) {
        var mark = checkpoint(route.from, route.to);
        return '<button type="button" class="gear-route" data-route="' + i + '" data-checkpoint="' + (mark ? mark.kind : '') + '" aria-pressed="' + (i === planIndex) + '">' + gearItem(route.id, route.to) + '<span class="gear-route-piece">' +
          '<small>' + esc(tr(route.distance === 0 ? 'readyShort' : ['nearBudget','largerBudget','furtherBudget'][i])) + '</small>' +
          '<strong>' + esc(name(route.id)) + '</strong>' +
          checkpointLabel(mark) + '<span class="gear-route-levels">' + levelLabel(route.from) + ' → <b class="gear-rarity-red">' + esc(quality('red')) + ' ' + levelLabel(route.to) + '</b>' +
          '<small>' + esc(tr('mastery')) + ' ' + route.from.mastery + ' → ' + route.to.mastery + '</small>' +
          '</span>' +
          '</span>' +
          '<span class="gear-route-metrics">' +
          '<span aria-label="' + esc(tr('weightedGain')) + '">' +
          '<b>' + gainPct(route.gain, forecast.baseline) + '</b>' +
          '</span>' +
          '<span aria-label="' + esc(tr('perCostUnit')) + '">' +
          '<b>' + route.efficiency.toFixed(1) + '</b>' +
          '</span>' +
          '</span>' +
          '</button>';
      }).join('');
      return '<p class="gear-gloss gear-route-caption">' + esc(tr('savingChoices')) + '</p>' +
        '<div class="gear-route-head">' +
        '<span>' + esc(tr('upgradeChoice')) + '</span>' +
        '<div class="gear-route-metrics">' +
        '<small>' + esc(tr('weightedGain')) + '</small>' +
        '<small>' + esc(tr('perCostUnit')) + '</small>' +
        '</div>' +
        '</div>' +
        '<div class="gear-routes">' + cards + '</div>' +
        '<div class="gear-route-detail">' +
        '<p class="gear-route-impact">' + esc(statText(active.delta).replace(tr('core'), tr(slot === 'helm' || slot === 'boots' ? 'lethality' : 'health'))) + '</p>' +
        '<div class="gear-cost-title">' +
        '<strong>' + esc(tr('totalCost')) + '</strong>' +
        '<small>' + esc(tr('shortfalls')) + '</small>' +
        '</div>' +
        costStrip(active.costs, active.gap) + '</div>' +
        kvkScore(active.costs, true) + kvkNote() + cavalryNote(state) + '<p class="gear-role">' + esc(roleText(active.id.split('-')[0])) + '</p>' +
        '<p class="gear-gloss">' + esc(tr('pieceWeights')) + ': ' + w[slot === 'helm' || slot === 'boots' ? 0 : 1] + ' × ' + esc(tr(slot === 'helm' || slot === 'boots' ? 'lethality' : 'health')) + ', ' + w[0] + ' × ' + esc(tr('attack')) + ', ' + w[1] + ' × ' + esc(tr('defense')) + '.</p>' +
        theoryLink('ranking', 'scoreCostExplained');
    }
    function nearList(state) {
      var candidates = Object.keys(state.pieces).filter(function (id) { return state.included[id.split('-')[0]]; }).map(function (id) {
        var to = E.milestone(state.pieces[id], state.goal);
        if (!to) return null;
        var costs = E.cost(state.pieces[id], to), gap = E.gap(costs, state.resources);
        var distance = E.RES.reduce(function (sum, r) { return sum + gap[r] / Math.max(1, costs[r]); }, 0);
        return { id: id, to: to, gap: gap, distance: distance };
      }).filter(Boolean).sort(function (a, b) { return a.distance - b.distance || a.id.localeCompare(b.id); });
      return '<section class="gear-near-list"><h3 class="gear-subhead">' + esc(tr('comparePieces')) + '</h3>' + candidates.map(function (c) {
        var missing = E.RES.filter(function (r) { return c.gap[r]; }).map(function (r) { return fmt(c.gap[r]) + ' ' + tr(r); }).join(' · ');
        return '<button type="button" class="gear-near-piece" data-select="' + c.id + '">' +
          '<span>' + esc(name(c.id)) + ' → ' + (c.to.quality === 'red' ? '+' + (c.to.level - 100) : c.to.level) + '</span>' +
          '<span>' + esc(missing || tr('readyShort')) + '</span>' +
          '</button>';
      }).join('') + '</section>';
    }
    return {
      esc: esc,
      name: name,
      quality: quality,
      image: image,
      gearImage: gearImage,
      gearItem: gearItem,
      checkpoint: checkpoint,
      checkpointLabel: checkpointLabel,
      kvkScore: kvkScore,
      theoryLink: theoryLink,
      kvkNote: kvkNote,
      pieceInfo: pieceInfo,
      beforeAfter: beforeAfter,
      comparison: comparison,
      fullLevel: fullLevel,
      levelLabel: levelLabel,
      pieceLabel: pieceLabel,
      numberInput: numberInput,
      costTable: costTable,
      statText: statText,
      costText: costText,
      gainPct: gainPct,
      roleText: roleText,
      costStrip: costStrip,
      spendStrip: spendStrip,
      stepRow: stepRow,
      splitChip: splitChip,
      splitSet: splitSet,
      splitOutput: splitOutput,
      editorFields: editorFields,
      preview: preview,
      cavalryNote: cavalryNote,
      planOutput: planOutput,
      nearList: nearList
    };
  }
  return { create: create };
});
