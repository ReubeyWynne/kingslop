(function () {
  'use strict';
  window.Interactions.register('seasonal', function (context) {
    var E = window.Halloween, data = E.data, store = context.ledger, occurrence = context.root.dataset.occurrence;
    var facts = store.seasonal(occurrence) || E.blank(), selected = Array(7).fill(0), passSelected = [false, false];
    var choice = { next: -1, remaining: 3, currency: 'USD', metric: 'points', variant: null };
    var future = { doors: 0, gathering: 0, beasts: 0, gems: 0, speedupMinutes: 0, other: 0, eventDay: 0, missionTarget: 0, missionClaimed: null };
    var worker, timer, token = 0, heldValue, totalValue, offers = [], passes = [], lastCandy;
    var incomeLabels = { doors: 'Trick or Treat (estimated)', gathering: 'Gathering', beasts: 'Beasts', gems: 'Gem spending', speedups: 'Speedups', missions: 'Prankster King', other: 'Other' };
    function node(key) { return context.targets(key)[0]; }
    function text(key, value) { node(key).textContent = value; }
    function esc(value) { return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function fmt(value, digits) { return new Intl.NumberFormat(document.documentElement.lang || 'en', { maximumFractionDigits: digits === undefined ? 1 : digits }).format(value); }
    function quantity(value) { return value > 0 && value < .01 ? '<0.01' : fmt(value, value < 1 ? 2 : 1); }
    function money(cents) { return new Intl.NumberFormat(document.documentElement.lang || 'en', { style: 'currency', currency: choice.currency }).format(cents / 100); }
    function candy() { return facts.candy === null ? 1000 : facts.candy; }
    function unit() { return choice.currency === 'USD' ? '$1' : '€1'; }
    function duration(minutes) { var rounded = Math.round(minutes); return rounded >= 60 ? fmt(Math.floor(rounded / 60), 0) + 'h' + (rounded % 60 ? ' ' + rounded % 60 + 'm' : '') : quantity(minutes) + 'm'; }
    function normalise(rewards) {
      var result = {};
      Object.entries(rewards).forEach(function (entry) {
        var name = entry[0], amount = entry[1], match = /^(\d+) (Minute|Hour|m) (.*Speedup)$/.exec(name);
        if (match) { name = match[3] === 'Speedup' ? 'General speedups' : match[3].replace(' Speedup', ' speedups'); amount *= Number(match[1]) * (match[2] === 'Hour' ? 60 : 1); }
        if (name === '10 Stamina') { name = 'Stamina'; amount *= 10; }
        if (name === '5k Hero XP') { name = 'Hero XP'; amount *= 5000; }
        if (name === '1,000 Hero XP') { name = 'Hero XP'; amount *= 1000; }
        result[name] = (result[name] || 0) + amount;
      });
      return result;
    }
    function rewardAmount(name, amount) { return name.endsWith('speedups') ? duration(amount) : quantity(amount); }
    function rewardTable(now, total) {
      var left = normalise(now.rewards), right = total ? normalise(total.rewards) : null;
      var priority = ['Gems', 'Forgehammer', 'Governor Gear Material Chest', 'Random Governor Charm Material Chest', 'Lucky Hero Gear Chest', 'General speedups', 'Construction speedups', 'Research speedups', 'Training speedups', 'Stamina', 'Hero XP'];
      var keys = Array.from(new Set(Object.keys(left).concat(right ? Object.keys(right) : []))).sort(function (a, b) { var ai = priority.indexOf(a), bi = priority.indexOf(b); return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi) || a.localeCompare(b); });
      var labels = { Forgehammer: 'Forgehammers', 'Governor Gear Material Chest': 'Gear material chests', 'Random Governor Charm Material Chest': 'Charm material chests', 'Lucky Hero Gear Chest': 'Lucky Hero Gear Chests' };
      return '<table class="candy-rewards"><caption>' + (total ? 'Held candy vs your full plan' : 'Expected items from this candy') + '</caption><thead><tr><th scope="col">Reward</th><th scope="col">' + (total ? 'Held' : 'Expected') + '</th>' + (total ? '<th scope="col">Total</th>' : '') + '</tr></thead><tbody>' + keys.map(function (key) { return '<tr><th scope="row">' + esc(labels[key] || key) + '</th><td>' + esc(rewardAmount(key, left[key] || 0)) + '</td>' + (right ? '<td>' + esc(rewardAmount(key, right[key] || 0)) + '</td>' : '') + '</tr>'; }).join('') + '</tbody></table>';
    }
    function valueMarkup(value, held) {
      return '<div class="candy-headline"><strong>≈ ' + esc(fmt(value.points)) + '</strong><span>' + (facts.points === null ? 'expected Prankster Points' : 'expected additional Prankster Points') + '</span></div>' + rewardTable(held || value, held ? value : null);
    }
    function metric(result) {
      if (choice.metric === 'points') return result.points;
      if (choice.metric === 'speedups') return Object.entries(normalise(result.rewards)).filter(function (entry) { return entry[0].endsWith('speedups'); }).reduce(function (n, entry) { return n + entry[1]; }, 0);
      return result.rewards[choice.metric] || 0;
    }
    function metricLabel() { return { points: 'points', speedups: 'speedup minutes', Forgehammer: 'Forgehammers', 'Governor Gear Material Chest': 'gear chests', 'Random Governor Charm Material Chest': 'charm chests', 'Lucky Hero Gear Chest': 'gear chests' }[choice.metric] || choice.metric; }
    function contents(rewards) { return Object.entries(rewards).filter(function (entry) { return entry[1] > .005; }).map(function (entry) { return esc(quantity(entry[1])) + ' × ' + esc(entry[0]); }).join(' · '); }
    function highlights(pack) {
      var preferred = pack.items.filter(function (item) { return ['Gems', 'Truegold', 'Halloween Custom Chest', '1 Hour Speedup'].includes(item.name); });
      return Object.fromEntries((preferred.length ? preferred : pack.items).slice(0, 3).map(function (item) { return [item.name, item.amount]; }));
    }
    function replaceOffers(key, html) {
      var root = node(key), active = document.activeElement, action = root.contains(active) ? active.dataset.action : null, index = action ? active.dataset.index : null;
      root.innerHTML = html;
      if (action && index !== undefined) { var replacement = root.querySelector('[data-action="' + action + '"][data-index="' + index + '"]'); if (replacement) replacement.focus({ preventScroll: true }); }
    }
    function renderOffers() {
      replaceOffers('offers', offers.length ? offers.map(function (offer) {
        var i = offer.index, count = selected[i], locked = choice.next < 0 || i > choice.next, available = choice.next >= 0 && choice.next < 7;
        return '<article class="candy-offer"><div class="candy-offer-heading"><h3>Pack ' + (i + 1) + (i === choice.next ? ' · next' : '') + '</h3><span class="candy-price">' + (offer.cents ? esc(money(offer.cents)) : 'Free') + '</span></div><div class="candy-offer-stats"><div><strong>' + esc(fmt(offer.candy, 0)) + '</strong><span>candy</span></div><div><strong>≈ ' + esc(fmt(offer.points)) + '</strong><span>additional points</span></div><div><strong>' + (offer.cents ? esc(quantity(metric(offer) / (offer.cents / 100))) : 'Free') + '</strong><span>' + esc(metricLabel()) + ' per ' + esc(unit()) + '</span></div>' + (choice.metric === 'points' ? '' : '<div><strong>' + esc(quantity(metric(offer))) + '</strong><span>' + esc(metricLabel()) + ' in total</span></div>') + '</div>' + (locked && choice.next >= 0 ? '<p class="candy-context">Requires earlier packs. Total from your next pack: ' + esc(money(offer.unlockCents)) + '.</p>' : '') + '<p class="candy-offer-items">Guaranteed: ' + contents(highlights(data.packs[i])) + '.</p><details id="pack-value-' + (i + 1) + '"><summary>All expected items from this purchase</summary>' + rewardTable({ rewards: offer.rewards }) + '</details><button type="button" class="seasonal-link" data-action="seasonal.addPack" data-index="' + i + '"' + (!available ? ' disabled' : '') + '>' + (count ? 'Included ×' + count : locked ? 'Include unlock sequence' : 'Include in total') + '</button>' + (count ? '<button type="button" class="seasonal-link" data-action="seasonal.removePack" data-index="' + i + '">Remove</button>' : '') + '</article>';
      }).join('') : '<p>All Candy Party packs have been bought.</p>');
      text('selection', selected.some(Boolean) ? 'Included: ' + selected.map(function (n, i) { return n ? 'Pack ' + (i + 1) + (n > 1 ? ' ×' + n : '') : ''; }).filter(Boolean).join(', ') + '. The total above includes their items and candy rewards.' : choice.next < 0 ? 'Choose your next available pack to include purchases. No purchases are assumed.' : 'No purchases included in your total.');
    }
    function renderPasses() {
      if (facts.points === null || choice.variant === null) { text('pass-offers', 'Enter current points and choose a reward variant to compare pass value.'); return; }
      replaceOffers('pass-offers', passes.map(function (offer, i) {
        var owned = facts.tracks[i] === true;
        if (owned) return '<article class="candy-offer"><h3>' + esc(offer.label) + ' · owned</h3><p class="candy-context">' + (facts.claimedPass[i + 1] === null ? 'Set your claimed level to include this track.' : esc(facts.claimedPass[i + 1]) + ' of 21 levels claimed. Remaining rewards are included above.') + '</p><button type="button" class="seasonal-link" data-action="seasonal.progress" data-panel="passes">Edit pass progress</button></article>';
        return '<article class="candy-offer"><div class="candy-offer-heading"><h3>' + esc(offer.label) + '</h3><span class="candy-price">' + esc(money(offer.cents)) + '</span></div><div class="candy-offer-stats"><div><strong>≈ ' + esc(fmt(offer.points)) + '</strong><span>additional points</span></div><div><strong>' + esc(quantity(metric(offer) / (offer.cents / 100))) + '</strong><span>' + esc(metricLabel()) + ' per ' + esc(unit()) + '</span></div></div><p class="candy-context">≈ ' + esc(fmt(offer.candy)) + ' pass candy unlocked, included in this value.</p><details id="pass-value-' + esc(offer.id) + '"><summary>Expected pass items and extra chest rewards</summary>' + rewardTable({ rewards: offer.rewards }) + '</details><button type="button" class="seasonal-link" data-action="seasonal.addPass" data-index="' + i + '"' + (owned ? ' disabled' : '') + '>' + (owned ? 'Already owned' : passSelected[i] ? 'Remove from total' : 'Include in total') + '</button><button type="button" class="seasonal-link" data-action="seasonal.owned" data-index="' + i + '">' + (owned ? 'Mark unowned' : 'I already own this') + '</button></article>';
      }).join(''));
    }
    function skin() {
      if (facts.points === null) { text('skin', 'Enter your current points to see the remaining gap.'); return; }
      var gap = Math.max(0, data.rules.skinPoints - facts.points);
      text('skin', !gap ? 'You have reached 12,500 points and qualified through the points route.' : fmt(gap, 0) + ' points remain.' + (totalValue ? ' Your full plan adds ≈ ' + fmt(totalValue.value.points) + ' points on average.' : '') + ' ' + fmt(Math.ceil(gap / 2) * 20, 0) + ' additional candy is sufficient even without free attacks.');
    }
    function availability() {
      var contextFacts = Object.assign({}, facts), level = store.buildings().levels['town-center'];
      if (contextFacts.townCenter === null && level && level !== '0') contextFacts.townCenter = level.startsWith('TG') || level.startsWith('30') ? 30 : Number(level);
      var progress = E.progressOptions(contextFacts); choice.variant = progress.variant;
      if (facts.packs.every(function (n) { return n === null; })) choice.next = -1;
      else { var next = facts.packs.findIndex(function (n, i) { return n === null || n < (i === 6 ? 3 : 1); }); choice.next = next < 0 ? 7 : next; choice.remaining = choice.next === 6 ? 3 - (facts.packs[6] || 0) : 3; }
    }
    function fill() {
      context.nodes('[data-fact]').forEach(function (field) { if (field !== document.activeElement) { var saved = field.dataset.index === undefined ? facts[field.dataset.fact] : facts[field.dataset.fact][Number(field.dataset.index)]; field.value = field.dataset.fact === 'candy' ? candy() : saved === null ? '' : saved; } });
      context.nodes('[data-choice]').forEach(function (field) { field.value = choice[field.dataset.choice] === null ? '' : choice[field.dataset.choice]; });
      node('last-pack-control').hidden = choice.next !== 6;
      text('example', facts.candy === null ? 'Example: 1,000 candy. Replace this with the amount you have.' : 'Your held candy. The expected rewards update automatically.');
      text('door-rate', fmt(E.doorDaily(), 0));
      var day = facts.daysLeft === null ? null : 9 - facts.daysLeft, progress = E.progressOptions(facts, choice.variant);
      text('score-summary', facts.points === null ? 'Points: set yours' : fmt(facts.points, 0) + ' points');
      text('day-summary', day ? 'Day ' + day : 'Day: set yours');
      text('pass-summary', facts.tracks.some(Boolean) ? data.passes.filter(function (_, i) { return facts.tracks[i]; }).map(function (p) { return p.label; }).join(' + ') : 'Passes: set yours');
      text('progress-note', progress.missing.length ? 'Owned pass rewards need ' + progress.missing.join(', ') + '. Tap Passes to set them.' : progress.options.passes.length ? 'Using saved pass progress; claimed levels are excluded.' : 'Set progress to include your pass rewards.');
      context.targets('pass-owned').forEach(function (button, i) { button.textContent = data.passes[i].label + ': ' + (facts.tracks[i] === null ? 'not set' : facts.tracks[i] ? 'owned' : 'not owned'); button.setAttribute('aria-pressed', String(facts.tracks[i] === true)); });
      node('event-day').value = day || '';
      node('today-claims').value = day && day <= 7 && facts.missions[day - 1] !== null ? facts.missions[day - 1] : '';
      if (day && day <= 8) { future.eventDay = day; future.missionClaimed = day <= 7 ? facts.missions[day - 1] : null; }
      context.nodes('[data-future="eventDay"]').forEach(function (field) { field.value = future.eventDay; });
      context.nodes('[data-future="missionClaimed"]').forEach(function (field) { field.value = future.missionClaimed === null ? '' : future.missionClaimed; });
      var remaining = E.remainingIncome(facts, future);
      ['gathering', 'beasts', 'doors'].forEach(function (key) { var limit = key === 'gathering' ? 3000 - (facts.gatheringCollected || 0) : key === 'beasts' ? 4000 - (facts.beastsCollected || 0) : Math.min(7, facts.doorDaysLeft === null ? 7 : facts.doorDaysLeft, facts.daysLeft === null ? 8 : facts.daysLeft); context.nodes('[data-future="' + key + '"]').forEach(function (field) { field.max = Math.max(0, limit); if (future[key] > limit) { future[key] = Math.max(0, limit); field.value = future[key]; } }); });
    }
    function clearStale() {
      node('held').setAttribute('aria-busy', 'true'); node('offers').setAttribute('aria-busy', 'true');
      node('total').setAttribute('aria-busy', 'true');
      text('status', 'Updating expected rewards…');
      heldValue = null; totalValue = null;
    }
    function calculate() {
      clearTimeout(timer); if (worker) worker.terminate(); token++; var id = token;
      clearStale(); skin();
      timer = setTimeout(function () {
        var input = { id: id, candy: candy(), options: E.progressOptions(facts, choice.variant).options, future: E.remainingIncome(facts, future), selected: selected, next: choice.next, remaining: choice.remaining, currency: choice.currency, points: facts.points, variant: choice.variant, topUpPoints: facts.topUpPoints, passes: data.passes.map(function (p, i) { return { track: p.id, variant: choice.variant, claimed: 0, selected: passSelected[i] && facts.points !== null && choice.variant !== null }; }) };
        try {
          worker = new Worker(new URL(context.root.dataset.worker, document.baseURI));
          worker.onmessage = function (event) {
            if (event.data.id !== token) return;
            var part = event.data.part, result = event.data.result;
            if (part === 'held') { heldValue = result; if (result.passCandy) text('progress-note', 'Includes ≈ ' + fmt(result.passCandy, 0) + ' candy from unclaimed or newly unlocked rewards on your owned tracks. Claimed levels are excluded.'); node('held').innerHTML = valueMarkup(result); node('held').removeAttribute('aria-busy'); text('status', ''); }
            if (part === 'total') {
              totalValue = result; node('total').removeAttribute('aria-busy');
              var extra = result.future.candy + result.purchaseCandy;
              text('income-summary', '+' + fmt(result.future.candy, 0) + ' future candy' + (future.doors ? ' (includes estimated door rewards)' : '') + '.');
              node('income-lines').innerHTML = '<p class="candy-context">' + result.future.lines.filter(function (line) { return line.candy; }).map(function (line) { return esc(incomeLabels[line.id]) + ': ' + esc(fmt(line.candy, 0)); }).join(' · ') + '</p>';
              node('total-section').hidden = !(extra || result.cents || passSelected.some(Boolean));
              text('total-context', fmt(result.held, 0) + ' held + ' + fmt(result.future.candy, 0) + ' future + ' + fmt(result.purchaseCandy, 0) + ' purchased candy' + (result.value.passCandy ? ' + ≈ ' + fmt(result.value.passCandy, 0) + ' pass candy' : '') + '. Additional spending: ' + money(result.cents) + '.');
              node('total').innerHTML = valueMarkup(result.value, heldValue); skin();
            }
            if (part === 'offers') { offers = result; node('offers').removeAttribute('aria-busy'); renderOffers(); }
            if (part === 'passes') { passes = result; renderPasses(); context.emit('seasonal:calculated', { held: heldValue, total: totalValue }); }
            if (part === 'error') { text('status', 'This calculation is too large or has an invalid input. Reduce the candy plan and try again.'); }
          };
          worker.onerror = function () { if (id !== token) return; text('status', 'The calculator could not start. Reload to try again.'); };
          worker.postMessage(input);
        } catch (cause) { text('status', 'This browser could not start the calculator.'); }
      }, 180);
    }
    function saveFacts(next) {
      try { store.setSeasonal(occurrence, next); }
      catch (cause) { text('status', 'Could not save progress. Your calculation still works for this visit.'); }
    }
    function refresh() { var next = store.seasonal(occurrence) || E.blank(); if (JSON.stringify(next) === JSON.stringify(facts)) return; facts = next; availability(); fill(); calculate(); }
    availability();
    context.cleanup(store.subscribe(refresh)); context.cleanup(function () { clearTimeout(timer); if (worker) worker.terminate(); });
    return { refresh: function () { fill(); calculate(); }, actions: {
      progress: { run: function (button) { var panel = button.dataset.panel; context.nodes('[data-progress-panel]').forEach(function (part) { part.hidden = part.dataset.progressPanel !== panel; }); text('progress-title', { score: 'Your current points', day: 'Where you are in the event', passes: 'Your pass progress', income: 'Candy already collected' }[panel]); node('progress-dialog').showModal(); } },
      closeProgress: { run: function () { node('progress-dialog').close(); } },
      eventDay: { events: ['change'], run: function (field) { facts.daysLeft = field.value === '' ? null : 9 - Number(field.value); future.eventDay = field.value === '' ? 0 : Number(field.value); future.missionClaimed = null; fill(); calculate(); saveFacts(facts); } },
      todayClaims: { events: ['change'], run: function (field) { var day = facts.daysLeft === null ? 0 : 9 - facts.daysLeft; if (day >= 1 && day <= 7) facts.missions[day - 1] = field.value === '' ? null : Number(field.value); fill(); calculate(); saveFacts(facts); } },
      remaining: { run: function () { if (facts.gatheringCollected !== null) future.gathering = Math.max(0, 3000 - facts.gatheringCollected); if (facts.beastsCollected !== null) future.beasts = Math.max(0, 4000 - facts.beastsCollected); if (facts.doorDaysLeft !== null) future.doors = facts.doorDaysLeft; if (facts.daysLeft !== null) future.missionTarget = 5; future = E.remainingIncome(facts, future); context.nodes('[data-future]').forEach(function (field) { var value = field.dataset.future === 'speedupHours' ? future.speedupMinutes / 60 : future[field.dataset.future]; field.value = value === null ? '' : value; }); fill(); calculate(); } },
      fact: { events: ['input', 'change'], run: function (field, event) {
        if (!field.validity.valid) { text('status', 'Use a whole number within the input limits.'); return; }
        var value = field.value === '' ? null : Number(field.value), index = field.dataset.index === undefined ? null : Number(field.dataset.index), previous = index === null ? facts[field.dataset.fact] : facts[field.dataset.fact][index], changed = value !== previous;
        if (index === null) facts[field.dataset.fact] = value; else facts[field.dataset.fact][index] = value;
        if (field.dataset.fact === 'points' && value === null) passSelected.fill(false);
        if (changed) { fill(); calculate(); }
        if (event.type === 'change') saveFacts(facts);
      } },
      future: { events: ['input', 'change'], run: function (field) {
        if (!field.validity.valid) return;
        var key = field.dataset.future, value = field.value === '' ? null : Number(field.value);
        if (key === 'missionClaimed') { future[key] = value; if (future.eventDay >= 1 && future.eventDay <= 7) { facts.missions[future.eventDay - 1] = value; saveFacts(facts); } }
        else if (key === 'speedupHours') future.speedupMinutes = Math.round((value || 0) * 60);
        else future[key] = value || 0;
        if (key === 'eventDay') { facts.daysLeft = value ? 9 - value : null; saveFacts(facts); }
        fill(); calculate();
      } },
      choice: { events: ['change'], run: function (field) {
        var key = field.dataset.choice; choice[key] = ['currency', 'metric'].includes(key) ? field.value : field.value === '' ? null : Number(field.value);
        if (key === 'metric') { renderOffers(); renderPasses(); return; }
        if (key === 'next' || key === 'remaining') {
          selected.fill(0);
          if (choice.next >= 0) { facts.packs = data.packs.map(function (_, i) { return i < choice.next ? i === 6 ? 3 : 1 : i === 6 && choice.next === 6 ? 3 - choice.remaining : 0; }); saveFacts(facts); }
        }
        if (key === 'variant') { passSelected.fill(false); facts.passVariant = choice.variant; saveFacts(facts); }
        fill(); calculate();
      } },
      addPack: { run: function (field) { var i = Number(field.dataset.index); if (choice.next < 0) return; selected[i] = Math.min(selected[i] + 1, i === 6 ? choice.next === 6 ? choice.remaining : 3 : 1); selected = E.purchaseSequence(choice.next, selected, choice.remaining); calculate(); } },
      removePack: { run: function (field) { var i = Number(field.dataset.index); if (i === 6 && selected[i] > 1) selected[i]--; else for (var j = i; j < 7; j++) selected[j] = 0; calculate(); } },
      addPass: { run: function (field) { var i = Number(field.dataset.index); if (facts.tracks[i]) return; passSelected[i] = !passSelected[i]; calculate(); } },
      owned: { run: function (field) { var i = Number(field.dataset.index); facts.tracks[i] = !facts.tracks[i]; passSelected[i] = false; fill(); calculate(); saveFacts(facts); } }
    } };
  });
})();
