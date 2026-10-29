(function () {
  'use strict';
  window.Interactions.register('seasonal', function (context) {
    var E = window.Halloween, data = E.data, store = context.ledger, occurrence = context.root.dataset.occurrence;
    var facts = store.seasonal(occurrence) || E.blank(), selected = Array(7).fill(0), passSelected = [false, false];
    var choice = { next: -1, remaining: 3, currency: 'USD', variant: null };
    var future = { dailyDoors: false, doors: 0, gathering: 0, beasts: 0, gems: 0, speedupMinutes: 0, other: 0, eventDay: 0, missionTarget: 0, missionClaimed: null };
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
    function rewardKeys(left, right) {
      var priority = ['Gems', 'Forgehammer', 'Governor Gear Material Chest', 'Random Governor Charm Material Chest', 'Lucky Hero Gear Chest', 'General speedups', 'Construction speedups', 'Research speedups', 'Training speedups', 'Stamina', 'Hero XP'];
      return Array.from(new Set(Object.keys(left).concat(right ? Object.keys(right) : []))).sort(function (a, b) { var ai = priority.indexOf(a), bi = priority.indexOf(b); return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi) || a.localeCompare(b); });
    }
    function rewardTable(now, total) {
      var left = normalise(now.rewards), right = total ? normalise(total.rewards) : null;
      var labels = { Forgehammer: 'Forgehammers', 'Governor Gear Material Chest': 'Gear material chests', 'Random Governor Charm Material Chest': 'Charm material chests', 'Lucky Hero Gear Chest': 'Lucky Hero Gear Chests' };
      return '<p class="candy-grid-caption">' + (total ? 'Held → Total · your full plan’s expected items' : 'Expected items from this candy') + '</p><ul class="candy-grid">' + rewardKeys(left, right).filter(function (key) { return (left[key] || 0) > 0 || (right && right[key] > 0); }).map(function (key) {
        var shown = right ? right[key] || 0 : left[key], label = labels[key] || key;
        return tile(key, badge(key, shown), label, (right ? 'held ' + rewardAmount(key, left[key] || 0) + ', total ' : '') + rewardAmount(key, shown) + ' × ' + label, right ? '<small>held ' + esc(badge(key, left[key] || 0)) + '</small>' : '');
      }).join('') + '</ul>';
    }
    // Game-style item tiles: the icon on a quality-coloured square, its count printed over the corner.
    function quality(name) {
      var aliases = { 'General speedups': '1 Hour Speedup', 'Construction speedups': '1 Hour Construction Speedup', 'Research speedups': '1 Hour Research Speedup', 'Training speedups': '1 Hour Training Speedup', Stamina: '10 Stamina', 'Hero XP': '5k Hero XP', 'Candy Party Pack': null, 'Halloween Candy': null };
      if (name === 'Gems') return 'epic';
      var weight = data.valuation.items[name] === undefined ? data.valuation.items[aliases[name]] : data.valuation.items[name];
      if (weight === undefined) return aliases[name] === null ? 'rare' : 'mythic';
      return weight >= 2500 ? 'mythic' : weight >= 1000 ? 'epic' : weight >= 200 ? 'rare' : 'common';
    }
    function badge(name, amount) { return name.endsWith('speedups') ? duration(amount) : amount >= 10000 ? compact(amount) : amount >= 100 ? fmt(amount, 0) : quantity(amount); }
    function tile(name, count, label, title, extra) {
      return '<li class="candy-tile" data-quality="' + quality(name) + '" title="' + esc(title) + '"><span class="candy-tile-art">' + art(name, 48) + '<b>' + esc(count) + '</b></span><span class="candy-tile-name">' + esc(label) + '</span>' + (extra || '') + '</li>';
    }
    function valueMarkup(value, held) {
      return '<div class="candy-headline"><strong>≈ ' + esc(fmt(value.points)) + '</strong><span>' + (facts.points === null ? 'expected Prankster Points' : 'expected additional Prankster Points') + '</span></div>' + '<p class="candy-item-ev">Item EV: ≈ ' + esc(compact(E.valueRewards(value.rewards).gems)) + ' <a href="#item-values">gem-equivalent</a></p>' + rewardTable(held || value, held ? value : null);
    }
    function compact(value) { return new Intl.NumberFormat(document.documentElement.lang || 'en', { notation: 'compact', maximumFractionDigits: 1 }).format(value); }
    function art(name, size) {
      var aliases = { 'General speedups': '1 Hour Speedup', 'Construction speedups': '1 Hour Construction Speedup', 'Research speedups': '1 Hour Research Speedup', 'Training speedups': '1 Hour Training Speedup', Stamina: '10 Stamina', 'Hero XP': '5k Hero XP' };
      var path = data.art[name] || data.art[aliases[name]];
      return path ? '<img src="' + esc(context.root.dataset.depth + path) + '" width="' + size + '" height="' + size + '" alt="" loading="lazy" decoding="async">' : '';
    }
    function fixedItems(rewards) {
      return '<ul class="candy-grid candy-fixed-items">' + Object.entries(rewards).filter(function (entry) { return entry[1] > 0; }).map(function (entry) { return tile(entry[0], entry[1] >= 10000 ? compact(entry[1]) : quantity(entry[1]), entry[0], fmt(entry[1]) + ' × ' + entry[0]); }).join('') + '</ul>';
    }
    function packQuality(i) { return ['common', 'rare', 'rare', 'epic', 'epic', 'mythic', 'mythic'][i]; }
    function replaceOffers(key, html) {
      var root = node(key), active = document.activeElement, action = root.contains(active) ? active.dataset.action : null, index = action ? active.dataset.index : null;
      root.innerHTML = html;
      if (action && index !== undefined) { var replacement = root.querySelector('[data-action="' + action + '"][data-index="' + index + '"]'); if (replacement) replacement.focus({ preventScroll: true }); }
    }
    function renderOffers() {
      var best = offers.filter(function (offer) { return offer.cents > 0; }).sort(function (a, b) { return b.valuation.gems / b.cents - a.valuation.gems / a.cents; })[0];
      node('pack-comparison').innerHTML = offers.length ? '<p class="candy-grid-caption">Remaining packs · item EV per ' + esc(unit()) + ' in gem-equivalents · tap a pack for its rewards</p><ul class="candy-pack-grid">' + offers.map(function (offer) {
        var i = offer.index, isBest = best && best.index === i, per = offer.cents / 100;
        return '<li><a class="candy-pack-tile" href="#pack-' + (i + 1) + '"' + (isBest ? ' data-best="true"' : '') + (i === choice.next ? ' data-next="true"' : '') + ' title="' + esc('Pack ' + (i + 1) + ': ≈ ' + compact(offer.valuation.gems) + ' total item EV') + '"><span class="candy-tile-art" data-quality="' + packQuality(i) + '">' + art('Candy Party Pack', 48) + '<i>' + (i + 1) + '</i><b>' + (offer.cents ? esc(money(offer.cents)) : 'Free') + '</b>' + (isBest ? '<em>Best</em>' : '') + '</span><span class="candy-pack-rate"><strong>' + (offer.cents ? esc(compact(offer.valuation.gems / per)) : 'Free') + '</strong>' + (offer.cents ? '/' + esc(unit()) : '') + '</span><span class="candy-pack-points">' + (offer.cents ? esc(fmt(offer.points / per)) + ' pts/' + esc(unit()) : '≈ ' + esc(fmt(offer.points)) + ' pts') + '</span>' + (i === choice.next ? '<span class="candy-pack-next">next</span>' : '') + '</a></li>';
      }).join('') + '</ul>' : '';
      replaceOffers('offers', offers.length ? offers.map(function (offer) {
        var i = offer.index, count = selected[i], locked = choice.next < 0 || i > choice.next, available = choice.next >= 0 && choice.next < 7;
        var fixed = E.valueRewards(offer.fixed), candyEV = E.valueRewards(offer.candyRewards), bonus = E.valueRewards(offer.bonus);
        return '<article class="candy-offer" id="pack-' + (i + 1) + '"><div class="candy-offer-heading"><span class="candy-tile-art" data-quality="' + packQuality(i) + '">' + art('Candy Party Pack', 48) + '<i>' + (i + 1) + '</i></span><h3>Pack ' + (i + 1) + (i === choice.next ? ' · next' : '') + '</h3><span class="candy-price">' + (offer.cents ? esc(money(offer.cents)) : 'Free') + '</span></div><div class="candy-offer-stats"><div><strong>≈ ' + esc(compact(offer.valuation.gems)) + '</strong><span>overall item EV</span></div><div><strong>' + (offer.cents ? esc(compact(offer.valuation.gems / (offer.cents / 100))) : 'Free') + '</strong><span>EV per ' + esc(unit()) + '</span></div><div><strong>≈ ' + esc(fmt(offer.points)) + '</strong><span>points</span></div><div><strong>' + (offer.cents ? esc(fmt(offer.points / (offer.cents / 100))) : '—') + '</strong><span>points per ' + esc(unit()) + '</span></div></div><p class="candy-value-split">' + esc(compact(fixed.gems)) + ' fixed items + ≈ ' + esc(compact(candyEV.gems)) + ' from candy' + (bonus.gems ? ' + ' + esc(compact(bonus.gems)) + ' top-up bonus' : '') + ' = ≈ ' + esc(compact(offer.valuation.gems)) + ' gem-equivalent EV.</p>' + (locked && choice.next >= 0 ? '<p class="candy-context">Requires earlier packs. Total from your next pack: ' + esc(money(offer.unlockCents)) + '.</p>' : '') + '<h4>Fixed rewards · guaranteed</h4>' + fixedItems(offer.fixed) + '<p class="candy-currency-bonus">' + art('Halloween Candy', 28) + 'The ' + esc(fmt(offer.candy, 0)) + ' candy adds ≈ ' + esc(fmt(offer.points)) + ' points and its expected chest rewards.</p>' + (offer.valuation.unpriced.length ? '<p class="candy-context">Shown but unpriced in EV: ' + esc(offer.valuation.unpriced.join(', ')) + '.</p>' : '') + '<details id="pack-value-' + (i + 1) + '"><summary>Combined items: fixed rewards + candy EV</summary>' + rewardTable({ rewards: offer.rewards }) + '</details><button type="button" class="seasonal-link" data-action="seasonal.addPack" data-index="' + i + '"' + (!available ? ' disabled' : '') + '>' + (count ? 'Included ×' + count : locked ? 'Include unlock sequence' : 'Include in total') + '</button>' + (count ? '<button type="button" class="seasonal-link" data-action="seasonal.removePack" data-index="' + i + '">Remove</button>' : '') + '</article>';
      }).join('') : '<p>All Candy Party packs have been bought.</p>');
      text('selection', selected.some(Boolean) ? 'Included: ' + selected.map(function (n, i) { return n ? 'Pack ' + (i + 1) + (n > 1 ? ' ×' + n : '') : ''; }).filter(Boolean).join(', ') + '. The total above includes their fixed items and candy rewards.' : choice.next < 0 ? 'Choose your next available pack to include purchases. No purchases are assumed.' : 'No purchases included in your total.');
    }
    function renderPasses() {
      if (facts.points === null || choice.variant === null) { text('pass-offers', 'Enter current points and choose a reward variant to compare pass value.'); return; }
      replaceOffers('pass-offers', passes.map(function (offer, i) {
        var owned = facts.tracks[i] === true, value = E.valueRewards(offer.rewards);
        if (owned) return '<article class="candy-offer"><div class="candy-offer-heading"><span class="candy-tile-art" data-quality="mythic">' + art(offer.label, 48) + '</span><h3>' + esc(offer.label) + ' · owned</h3></div><p class="candy-context">' + (facts.claimedPass[i + 1] === null ? 'Set your claimed level to include this track.' : esc(facts.claimedPass[i + 1]) + ' of 21 levels claimed. Remaining rewards are included above.') + '</p><button type="button" class="seasonal-link" data-action="seasonal.progress" data-panel="passes">Edit pass progress</button></article>';
        return '<article class="candy-offer"><div class="candy-offer-heading"><span class="candy-tile-art" data-quality="mythic">' + art(offer.label, 48) + '</span><h3>' + esc(offer.label) + '</h3><span class="candy-price">' + esc(money(offer.cents)) + '</span></div><div class="candy-offer-stats"><div><strong>≈ ' + esc(fmt(offer.points)) + '</strong><span>additional points</span></div><div><strong>≈ ' + esc(compact(value.gems)) + '</strong><span>overall item EV</span></div><div><strong>' + esc(compact(value.gems / (offer.cents / 100))) + '</strong><span>EV per ' + esc(unit()) + '</span></div></div><p class="candy-context">≈ ' + esc(fmt(offer.candy)) + ' pass candy unlocked, included in this value.</p><details id="pass-value-' + esc(offer.id) + '"><summary>Expected pass items and extra chest rewards</summary>' + rewardTable({ rewards: offer.rewards }) + '</details><button type="button" class="seasonal-link" data-action="seasonal.addPass" data-index="' + i + '"' + (owned ? ' disabled' : '') + '>' + (owned ? 'Already owned' : passSelected[i] ? 'Remove from total' : 'Include in total') + '</button><button type="button" class="seasonal-link" data-action="seasonal.owned" data-index="' + i + '">' + (owned ? 'Mark unowned' : 'I already own this') + '</button></article>';
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
      context.nodes('[data-fact]').forEach(function (field) { if (field !== document.activeElement) { var saved = field.dataset.index === undefined ? facts[field.dataset.fact] : facts[field.dataset.fact][Number(field.dataset.index)]; if (field.type === 'checkbox') field.checked = Boolean(saved); else field.value = field.dataset.fact === 'candy' ? candy() : saved === null ? '' : saved; } });
      context.nodes('[data-choice]').forEach(function (field) { field.value = choice[field.dataset.choice] === null ? '' : choice[field.dataset.choice]; });
      node('last-pack-control').hidden = choice.next !== 6;
      text('example', facts.candy === null ? 'Example: 1,000 candy. Replace this with the amount you have.' : 'Your held candy. The expected rewards update automatically.');
      text('door-rate', fmt(E.doorDaily(), 0));
      var day = facts.daysLeft === null ? null : data.rules.eventDays + 1 - facts.daysLeft, progress = E.progressOptions(facts, choice.variant);
      text('score-summary', facts.points === null ? 'Points: set yours' : fmt(facts.points, 0) + ' points');
      text('day-summary', day ? 'Day ' + day + ' · ' + facts.daysLeft + (facts.daysLeft === 1 ? ' day left' : ' days left') : 'Day: set yours');
      text('mission-day', day ? 'Event day ' + day + ' · edit' : 'Set event day');
      var timing = E.eventTiming(facts);
      text('door-days', timing.doorDaysLeft === null ? 'Set your event day; remaining days are calculated automatically.' : timing.doorDaysLeft + (timing.doorDaysLeft === 1 ? ' door day remaining' : ' door days remaining') + ' · doors end on day 7.');
      text('pass-summary', facts.tracks.some(Boolean) ? data.passes.filter(function (_, i) { return facts.tracks[i]; }).map(function (p) { return p.label; }).join(' + ') : 'Passes: set yours');
      text('progress-note', progress.missing.length ? 'Owned pass rewards need ' + progress.missing.join(', ') + '. Tap Passes to set them.' : progress.options.passes.length ? 'Using saved pass progress; claimed levels are excluded.' : 'Set progress to include your pass rewards.');
      context.targets('pass-owned').forEach(function (button, i) { button.textContent = data.passes[i].label + ': ' + (facts.tracks[i] === null ? 'not set' : facts.tracks[i] ? 'owned' : 'not owned'); button.setAttribute('aria-pressed', String(facts.tracks[i] === true)); });
      node('event-day').value = day > 8 ? 8 : day || '';
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
              text('income-summary', '+' + fmt(result.future.candy, 0) + ' future candy' + (result.future.lines.some(function (line) { return line.id === 'doors' && line.candy; }) ? ' (includes estimated door rewards)' : '') + '.');
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
      eventDay: { events: ['change'], run: function (field) { var nextDays = field.value === '' ? null : data.rules.eventDays + 1 - Number(field.value); if (facts.daysLeft !== null && nextDays !== facts.daysLeft) { facts.doorsDoneToday = false; facts.doorDaysLeft = null; } facts.daysLeft = nextDays; future.eventDay = field.value === '' ? 0 : Number(field.value); future.missionClaimed = null; fill(); calculate(); saveFacts(facts); } },
      todayClaims: { events: ['change'], run: function (field) { var day = facts.daysLeft === null ? 0 : data.rules.eventDays + 1 - facts.daysLeft; if (day >= 1 && day <= 7) facts.missions[day - 1] = field.value === '' ? null : Number(field.value); fill(); calculate(); saveFacts(facts); } },
      remaining: { run: function () { if (facts.gatheringCollected !== null) future.gathering = Math.max(0, 3000 - facts.gatheringCollected); if (facts.beastsCollected !== null) future.beasts = Math.max(0, 4000 - facts.beastsCollected); if (E.eventTiming(facts).doorDaysLeft !== null) future.dailyDoors = true; if (facts.daysLeft !== null) future.missionTarget = 5; future = E.remainingIncome(facts, future); context.nodes('[data-future]').forEach(function (field) { var value = field.dataset.future === 'speedupHours' ? future.speedupMinutes / 60 : future[field.dataset.future]; if (field.type === 'checkbox') field.checked = Boolean(value); else field.value = value === null ? '' : value; }); fill(); calculate(); } },
      fact: { events: ['input', 'change'], run: function (field, event) {
        if (!field.validity.valid) { text('status', 'Use a whole number within the input limits.'); return; }
        var value = field.type === 'checkbox' ? field.checked : field.value === '' ? null : Number(field.value), index = field.dataset.index === undefined ? null : Number(field.dataset.index), previous = index === null ? facts[field.dataset.fact] : facts[field.dataset.fact][index], changed = value !== previous;
        if (index === null) facts[field.dataset.fact] = value; else facts[field.dataset.fact][index] = value;
        if (field.dataset.fact === 'points' && value === null) passSelected.fill(false);
        if (changed) { fill(); calculate(); }
        if (event.type === 'change') saveFacts(facts);
      } },
      future: { events: ['input', 'change'], run: function (field) {
        if (!field.validity.valid) return;
        var key = field.dataset.future, value = field.type === 'checkbox' ? field.checked : field.value === '' ? null : Number(field.value);
        if (key === 'dailyDoors') { future.dailyDoors = value; fill(); calculate(); return; }
        if (key === 'missionClaimed') { future[key] = value; if (future.eventDay >= 1 && future.eventDay <= 7) { facts.missions[future.eventDay - 1] = value; saveFacts(facts); } }
        else if (key === 'speedupHours') future.speedupMinutes = Math.round((value || 0) * 60);
        else future[key] = value || 0;
        if (key === 'eventDay') { facts.daysLeft = value ? data.rules.eventDays + 1 - value : null; saveFacts(facts); }
        fill(); calculate();
      } },
      choice: { events: ['change'], run: function (field) {
        var key = field.dataset.choice; choice[key] = key === 'currency' ? field.value : field.value === '' ? null : Number(field.value);

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
