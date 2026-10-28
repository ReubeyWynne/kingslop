(function () {
  'use strict';
  window.Interactions.register('seasonal', function (context) {
    var engine = window.Halloween, data = engine.data, store = context.ledger, occurrence = context.root.dataset.occurrence;
    var scenario = engine.plan(), worker, revision = 0, known = currentFacts();
    var labels = { held: 'Candy held now', gems: 'Additional gem spending', speedups: 'Additional speedups', gathering: 'Additional gathering', beasts: 'Additional Beasts', doors: 'Trick or Treat (estimated)', missions: 'Unclaimed mission milestones', packs: 'Additional packs', other: 'Other additional candy' };
    var messages = {
      candy: 'Enter your held candy.', points: 'Enter your current points.', daysLeft: 'Enter the days remaining.',
      gathering: 'Gathering progress is unknown; planned gathering candy is excluded.', beasts: 'Beast progress is unknown; planned Beast candy is excluded.',
      doors: 'Remaining door days are unknown; planned door candy is excluded.', missions: 'Some planned mission claims are unknown; those milestones are excluded.',
      packUnknown: 'Record the purchase count for each pack you plan to buy.', packLimit: 'A planned pack exceeds its remaining purchase limit.', packOrder: 'Packs must be unlocked in tier order. Record or plan all earlier tiers.',
      trackUnknown: 'Record whether you already own the pass before planning its purchase.', trackOwned: 'An owned pass cannot be bought again.',
      doorLimit: 'Planned door days exceed the remaining days.', ended: 'No event days remain. Update the timer if the event is still open.', missionClosed: 'A planned mission stage has already closed.',
      passVariant: 'Kingdom age or Town Center level is unknown; pass rewards are excluded.', passClaims: 'Some active pass claims are unknown; those track rewards are excluded.'
    };
    function currentFacts() {
      var facts = store.seasonal(occurrence) || engine.blank(), level = store.buildings().levels['town-center'];
      if (facts.townCenter === null && level && level !== '0') facts.townCenter = level.startsWith('TG') || level.startsWith('30') ? 30 : Number(level);
      return facts;
    }
    var number = context.api.fmt;
    function target(key) { return context.targets(key)[0]; }
    function esc(value) { return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function price(cents) { return new Intl.NumberFormat(document.documentElement.lang || 'en', { style: 'currency', currency: scenario.currency }).format(cents / 100); }
    function say(key, message) { target(key).textContent = message; }
    function rewardList(rewards, expected) {
      var entries = Object.entries(rewards).sort(function (a, b) { return a[0].localeCompare(b[0]); });
      return entries.length ? '<ul class="seasonal-reward-list">' + entries.map(function (item) { return '<li>' + (expected ? '≈ ' : '') + esc(number(expected ? Math.round(item[1] * 10) / 10 : item[1])) + ' × ' + esc(item[0]) + '</li>'; }).join('') + '</ul>' : '<p>No additional rewards included yet.</p>';
    }
    function cancel() {
      revision++;
      if (worker) { worker.terminate(); worker = null; }
      target('forecast-result').replaceChildren(); say('forecast-status', '');
    }
    function fillFacts() {
      context.nodes('[data-fact]').forEach(function (node) {
        var value = known[node.dataset.fact]; if (node.dataset.index !== undefined) value = value[Number(node.dataset.index)];
        node.value = value === null ? '' : String(value);
      });
    }
    function render() {
      var b = engine.budget(known, scenario), issues = b.errors.concat(b.missing);
      var baseline = known.points === null ? null : known.points + Math.floor(b.total / data.rules.attackCandy) * data.rules.attackPoints;
      say('summary', b.errors.length ? 'Resolve the plan below before using these totals.' : known.points === null || known.candy === null ? 'Enter your current points and candy to calculate the gap.' : b.pointGap === 0 ? 'You have reached your points target.' : number(b.pointGap) + ' points still needed.');
      target('totals').innerHTML = [
        ['Candy in this plan', number(b.total) + (b.estimated ? ' ≈' : '')],
        ['Paid-attack finish', baseline === null ? '—' : number(baseline)],
        ['Candy gap before free attacks & pass rewards', b.paidCandy === null || known.candy === null ? '—' : number(Math.max(0, b.paidCandy - b.total))],
        ['Additional spending', price(b.packs.cents)]
      ].map(function (v) { return '<div><dt>' + esc(v[0]) + '</dt><dd>' + esc(v[1]) + '</dd></div>'; }).join('');
      say('issues', Array.from(new Set(issues)).map(function (id) { return messages[id]; }).filter(Boolean).join(' '));
      target('sources').innerHTML = b.lines.map(function (line) { return '<tr><th scope="row">' + esc(labels[line.id]) + '</th><td>' + (line.estimate ? '≈ ' : '') + esc(number(line.candy)) + '</td></tr>'; }).join('');
      say('daily', known.todayPoints === null ? 'Enter today’s points to see the daily chest gap.' : known.todayPoints >= data.rules.dailyPoints ? 'You have reached today’s daily chest threshold.' : number(data.rules.dailyPoints - known.todayPoints) + ' points (' + number(Math.ceil((data.rules.dailyPoints - known.todayPoints) / data.rules.attackPoints)) + ' hits) remain for today’s chest.');
      context.targets('pack-price').forEach(function (node) { node.textContent = price(Math.round(data.packs[Number(node.dataset.index)]['price' + scenario.currency] * 100)); });
      context.targets('pass-price').forEach(function (node) { node.textContent = price(Math.round(data.passes[Number(node.dataset.index)]['price' + scenario.currency] * 100)); });
      var stages = engine.missions(known.kingdomDay);
      context.targets('mission-name').forEach(function (node) { node.textContent = stages[Number(node.dataset.stage)].name; });
      say('spend', price(b.packs.cents) + ' additional · ' + number(b.packs.candy) + ' pack candy · ' + number(b.packs.topUp) + ' top-up points.' + (known.topUpPoints === null ? ' Top-up progress is unknown; top-up rewards are excluded.' : ' Previously unlocked top-up rewards are excluded.'));
      target('purchase-rewards').innerHTML = b.errors.length ? '<p>Resolve the purchase plan to see its rewards.</p>' : rewardList(engine.incrementalRewards(known, scenario), false);
      target('run').disabled = Boolean(b.errors.length || known.points === null || known.candy === null || !known.daysLeft);
    }
    function refresh() {
      known = currentFacts();
      cancel(); fillFacts(); render();
    }
    function read(node) {
      if (node.type === 'checkbox') return node.checked;
      if (node.value === '') return null;
      if (node.dataset.fact === 'tracks') return node.value === 'true';
      if (node.dataset.plan === 'currency') return node.value;
      return Number(node.value);
    }
    function assign(record, node, field, value) { if (node.dataset.index === undefined) record[field] = value; else record[field][Number(node.dataset.index)] = value; }
    context.cleanup(store.subscribe(refresh));
    context.cleanup(function () { if (worker) worker.terminate(); });
    context.listen(context.root, 'player-save:imported', function () { say('transfer-status', 'Player save imported. Your temporary plan is unchanged.'); });
    context.listen(context.root, 'player-save:rejected', function () { say('transfer-status', 'Could not import that player save. Your saved progress was not replaced.'); });
    return { refresh: function () { fillFacts(); render(); }, actions: {
      fact: { events: ['change'], run: function (node) {
        if (!node.validity.valid) { say('status', 'Enter a whole number within the shown limits.'); return; }
        var snapshot = store.snapshot(), next = store.seasonal(occurrence) || engine.blank();
        assign(next, node, node.dataset.fact, read(node));
        try { store.setSeasonal(occurrence, next, snapshot.revision); say('status', 'Progress saved.'); }
        catch (cause) { say('status', 'Could not save progress. Check browser storage or reload the latest player save.'); fillFacts(); }
      } },
      plan: { events: ['change'], run: function (node) {
        if (!node.validity.valid || (node.type !== 'checkbox' && node.value === '')) { say('status', 'Enter a whole number within the shown limits.'); return; }
        var next = JSON.parse(JSON.stringify(scenario)); assign(next, node, node.dataset.plan, read(node));
        try { engine.budget(known, next); scenario = next; cancel(); render(); say('status', 'Plan updated. Saved inventory is unchanged.'); }
        catch (cause) { say('status', 'That value is outside the plan limits.'); }
      } },
      forecast: { run: function () {
        cancel(); var token = revision;
        say('forecast-status', 'Running 200 forecasts…'); target('run').disabled = true;
        try {
          worker = new Worker(new URL(context.root.dataset.worker, document.baseURI));
          worker.onmessage = function (event) {
            if (token !== revision) return;
            worker.terminate(); worker = null; render();
            if (event.data.error) { say('forecast-status', 'Could not calculate this plan. Check the progress fields.'); return; }
            var result = event.data.result;
            if (result.truncated) { say('forecast-status', 'This plan exceeds the simulation limit. Reduce the planned candy before forecasting.'); return; }
            say('forecast-status', number(result.median) + ' points at the median · ' + number(Math.round(result.chance * 100)) + '% of runs reached your target.');
            target('forecast-result').innerHTML = (result.withoutPurchases === undefined ? '' : '<p>Without these additional purchases: ' + esc(number(result.withoutPurchases)) + ' points at the median. With them: ' + esc(number(result.median)) + '.</p>') + '<dl class="seasonal-facts"><div><dt>10th–90th percentile finish</dt><dd>' + esc(number(result.low)) + '–' + esc(number(result.high)) + '</dd></div><div><dt>Expected additional pass candy</dt><dd>≈ ' + esc(number(Math.round(result.passCandy))) + '</dd></div></dl><p class="note">' + esc(result.missing.map(function (id) { return messages[id]; }).filter(Boolean).join(' ')) + '</p>' + (result.truncated ? '<p>The simulation reached its attack limit. Reduce the candy plan.</p>' : '') + '<details id="forecast-rewards"><summary>Expected chest and unclaimed pass rewards</summary>' + rewardList(result.rewards, true) + '</details>';
            context.emit('seasonal:forecast', result);
          };
          worker.onerror = function () { if (token !== revision) return; worker.terminate(); worker = null; render(); say('forecast-status', 'The forecast could not start. Your candy budget is still available.'); };
          worker.postMessage({ facts: known, plan: scenario });
        } catch (cause) { render(); say('forecast-status', 'This browser could not start the forecast. Your candy budget is still available.'); }
      } }
    } };
  });
})();
