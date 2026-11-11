/* The Halloween Party candy planner: what the candy you hold is worth, what the rest of the
   event and any packs or passes would add, and how far the permanent skin is. The expected
   values come from a worker (js/halloween-worker.js) running js/halloween-engine.js; the
   player's progress is the shared save's seasonal record, while future income and chosen
   purchases are plans for this visit only.

   _includes/seasonal/halloween-value.html binds to it with
   x-data="seasonal(occurrence, worker, depth)". A field hands itself to edit() and the
   other handlers, which read its value and validity and nothing else; the reward lists are
   built as markup strings by the pure functions below and placed with x-html. The page is
   English only. */
import { Alpine } from '../alpine.mjs';

const E = () => globalThis.Halloween;
const INCOME = { doors: 'Trick or Treat (estimated)', gathering: 'Gathering', beasts: 'Beasts', gems: 'Gem spending', speedups: 'Speedups', missions: 'Prankster King', other: 'Other' };
const PANELS = { score: 'Your current points', day: 'Where you are in the event', passes: 'Your pass progress', income: 'Candy already collected' };
const PRIORITY = ['Gems', 'Forgehammer', 'Governor Gear Material Chest', 'Random Governor Charm Material Chest', 'Lucky Hero Gear Chest', 'General speedups', 'Construction speedups', 'Research speedups', 'Training speedups', 'Stamina', 'Hero XP'];
const LABELS = { Forgehammer: 'Forgehammers', 'Governor Gear Material Chest': 'Gear material chests', 'Random Governor Charm Material Chest': 'Charm material chests', 'Lucky Hero Gear Chest': 'Lucky Hero Gear Chests' };
const ALIASES = { 'General speedups': '1 Hour Speedup', 'Construction speedups': '1 Hour Construction Speedup', 'Research speedups': '1 Hour Research Speedup', 'Training speedups': '1 Hour Training Speedup', Stamina: '10 Stamina', 'Hero XP': '5k Hero XP' };

const lang = () => document.documentElement.lang || 'en';
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (value, digits) => new Intl.NumberFormat(lang(), { maximumFractionDigits: digits === undefined ? 1 : digits }).format(value);
const compact = value => new Intl.NumberFormat(lang(), { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const quantity = value => value > 0 && value < .01 ? '<0.01' : fmt(value, value < 1 ? 2 : 1);
const duration = minutes => { const rounded = Math.round(minutes); return rounded >= 60 ? fmt(Math.floor(rounded / 60), 0) + 'h' + (rounded % 60 ? ' ' + rounded % 60 + 'm' : '') : quantity(minutes) + 'm'; };
const badge = (name, amount) => name.endsWith('speedups') ? duration(amount) : amount >= 10000 ? compact(amount) : amount >= 100 ? fmt(amount, 0) : quantity(amount);

/* Speedups of every size as minutes, stamina and hero XP as single units. */
function normalise(rewards) {
  const result = {};
  Object.entries(rewards).forEach(([key, value]) => {
    let name = key, amount = value;
    const match = /^(\d+) (Minute|Hour|m) (.*Speedup)$/.exec(name);
    if (match) { name = match[3] === 'Speedup' ? 'General speedups' : match[3].replace(' Speedup', ' speedups'); amount *= Number(match[1]) * (match[2] === 'Hour' ? 60 : 1); }
    if (name === '10 Stamina') { name = 'Stamina'; amount *= 10; }
    if (name === '5k Hero XP') { name = 'Hero XP'; amount *= 5000; }
    if (name === '1,000 Hero XP') { name = 'Hero XP'; amount *= 1000; }
    result[name] = (result[name] || 0) + amount;
  });
  return result;
}

/* The markup for reward lists, from the event's art. */
function markup(depth) {
  const data = E().data;
  function art(name, size) {
    const path = data.art[name] || data.art[ALIASES[name]];
    return path ? '<img src="' + esc(depth + path) + '" width="' + size + '" height="' + size + '" alt="" loading="lazy" decoding="async">' : '';
  }
  // One item as the game shows it: the cut-out icon with its count set on the corner, the name beneath.
  // Items with no clean icon keep the same cell with a muted fleuron in the icon's place.
  function item(name, count, label, extra) {
    return '<li class="candy-item"><span class="candy-item-art">' + (art(name, 44) || '<span class="candy-item-blank" aria-hidden="true">❧</span>') + '<b>' + esc(count) + '</b></span><span class="candy-item-name">' + esc(label) + '</span>' + (extra || '') + '</li>';
  }
  function rewardTable(now, total) {
    const left = normalise(now.rewards), right = total ? normalise(total.rewards) : null;
    const keys = Array.from(new Set(Object.keys(left).concat(right ? Object.keys(right) : []))).sort((a, b) => { const ai = PRIORITY.indexOf(a), bi = PRIORITY.indexOf(b); return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi) || a.localeCompare(b); });
    return '<p class="candy-items-caption">' + (total ? 'Held candy · Total with your plan' : 'Expected items from this candy') + '</p><ul class="candy-items">' + keys.filter(key => left[key] > 0 || (right && right[key] > 0)).map(key => {
      const shown = right ? right[key] || 0 : left[key], label = LABELS[key] || key;
      return item(key, badge(key, shown), label, right ? '<small>held ' + esc(badge(key, left[key] || 0)) + '</small>' : '');
    }).join('') + '</ul>';
  }
  function fixedItems(rewards) {
    return '<ul class="candy-items candy-fixed-items">' + Object.entries(rewards).filter(entry => entry[1] > 0).map(entry => item(entry[0], entry[1] >= 10000 ? compact(entry[1]) : quantity(entry[1]), entry[0])).join('') + '</ul>';
  }
  function value(result, held, points) {
    return '<div class="candy-headline"><strong>≈ ' + esc(fmt(result.points)) + '</strong><span>' + (points === null ? 'expected Prankster Points' : 'expected additional Prankster Points') + '</span></div>' + '<p class="candy-item-ev">Item EV: ≈ ' + esc(compact(E().valueRewards(result.rewards).gems)) + ' <a href="#item-values">gem-equivalent</a></p>' + rewardTable(held || result, held ? result : null);
  }
  return { art, rewardTable, fixedItems, value };
}

const ledger = () => { try { const store = globalThis.Interactions.ledger(); store.snapshot(); return store; } catch (cause) { return null; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

Alpine.data('seasonal', (occurrence, workerURL, depth) => {
  // Kept out of Alpine's reactivity: the running worker, its start timer and its token.
  let worker = null, timer = null, token = 0;
  return {
  facts: E().blank(), selected: Array(7).fill(0), passSelected: [false, false],
  choice: { next: -1, remaining: 3, currency: 'USD', variant: null },
  future: { dailyDoors: false, doors: 0, gathering: 0, beasts: 0, gems: 0, speedupMinutes: 0, other: 0, eventDay: 0, missionTarget: 0, missionClaimed: null },
  // offers stays null until the first calculation lands.
  held: null, total: null, offers: null, passes: [], passNote: '', message: '', panel: 'score', busy: { held: true, offers: true, total: false },

  init() {
    this.html = markup(depth);
    this.load(true);
    // The save, in this tab or another: a different record replaces the facts.
    this.$watch('$store.ledger.v', () => this.load(false));
  },
  destroy() { clearTimeout(timer); if (worker) worker.terminate(); },
  load(first) {
    const store = ledger(), next = (store && store.seasonal(occurrence)) || E().blank();
    if (!first && same(next, this.facts)) return;
    this.facts = next; this.availability(); this.touch(); this.calculate();
  },

  // ── What the page reads ──────────────────────────────────────────────
  get candy() { return this.facts.candy === null ? 1000 : this.facts.candy; },
  get unit() { return this.choice.currency === 'USD' ? '$1' : '€1'; },
  get day() { return this.facts.daysLeft === null ? null : E().data.rules.eventDays + 1 - this.facts.daysLeft; },
  money(cents) { return new Intl.NumberFormat(lang(), { style: 'currency', currency: this.choice.currency }).format(cents / 100); },
  // A field's value as text: blank for unknown, the example candy when none is held.
  value(key, index) {
    if (key === 'candy') return String(this.candy);
    const saved = index === undefined ? this.facts[key] : this.facts[key][index];
    return saved === null || saved === undefined ? '' : String(saved);
  },
  planned(key) { const value = key === 'speedupHours' ? this.future.speedupMinutes / 60 : this.future[key]; return value === null || value === undefined ? '' : String(value); },
  chosen(key) { return this.choice[key] === null ? '' : String(this.choice[key]); },
  get example() { return this.facts.candy === null ? 'Example: 1,000 candy. Replace this with the amount you have.' : 'Your held candy. The expected rewards update automatically.'; },
  get doorRate() { return fmt(E().doorDaily(), 0); },
  get scoreSummary() { return this.facts.points === null ? 'Points: set yours' : fmt(this.facts.points, 0) + ' points'; },
  get daySummary() { const day = this.day; return day ? 'Day ' + day + ' · ' + this.facts.daysLeft + (this.facts.daysLeft === 1 ? ' day left' : ' days left') : 'Day: set yours'; },
  get missionDay() { return this.day ? 'Event day ' + this.day + ' · edit' : 'Set event day'; },
  get doorDays() {
    const left = E().eventTiming(this.facts).doorDaysLeft;
    return left === null ? 'Set your event day; remaining days are calculated automatically.' : left + (left === 1 ? ' door day remaining' : ' door days remaining') + ' · doors end on day 7.';
  },
  get passSummary() { const data = E().data; return this.facts.tracks.some(Boolean) ? data.passes.filter((_, i) => this.facts.tracks[i]).map(p => p.label).join(' + ') : 'Passes: set yours'; },
  get progressNote() {
    if (this.passNote) return this.passNote;
    const progress = E().progressOptions(this.facts, this.choice.variant);
    return progress.missing.length ? 'Owned pass rewards need ' + progress.missing.join(', ') + '. Tap Passes to set them.' : progress.options.passes.length ? 'Using saved pass progress; claimed levels are excluded.' : 'Set progress to include your pass rewards.';
  },
  owned(i) { const track = this.facts.tracks[i]; return E().data.passes[i].label + ': ' + (track === null ? 'not set' : track ? 'owned' : 'not owned'); },
  ownedPressed(i) { return String(this.facts.tracks[i] === true); },
  get eventDay() { const day = this.day; return String(day > 8 ? 8 : day || ''); },
  get todayClaims() { const day = this.day; return day && day <= 7 && this.facts.missions[day - 1] !== null ? String(this.facts.missions[day - 1]) : ''; },
  // Future income stops at what is left: the event caps, less what is already collected.
  limit(key) { return Math.max(0, key === 'gathering' ? 3000 - (this.facts.gatheringCollected || 0) : 4000 - (this.facts.beastsCollected || 0)); },
  get title() { return PANELS[this.panel]; },
  get skin() {
    if (this.facts.points === null) return 'Enter your current points to see the remaining gap.';
    const gap = Math.max(0, E().data.rules.skinPoints - this.facts.points);
    return !gap ? 'You have reached 12,500 points and qualified through the points route.' : fmt(gap, 0) + ' points remain.' + (this.total ? ' Your full plan adds ≈ ' + fmt(this.total.value.points) + ' points on average.' : '') + ' ' + fmt(Math.ceil(gap / 2) * 20, 0) + ' additional candy is sufficient even without free attacks.';
  },
  get heldMarkup() { return this.held ? this.html.value(this.held, null, this.facts.points) : '<p>Calculating expected rewards…</p>'; },
  get totalMarkup() { return this.total ? this.html.value(this.total.value, this.held, this.facts.points) : ''; },
  get incomeSummary() { const t = this.total; return t ? '+' + fmt(t.future.candy, 0) + ' future candy' + (t.future.lines.some(line => line.id === 'doors' && line.candy) ? ' (includes estimated door rewards)' : '') + '.' : ''; },
  get incomeLines() { const t = this.total; return t ? '<p class="candy-context">' + t.future.lines.filter(line => line.candy).map(line => esc(INCOME[line.id]) + ': ' + esc(fmt(line.candy, 0))).join(' · ') + '</p>' : ''; },
  get totalShown() { const t = this.total; return Boolean(t && (t.future.candy + t.purchaseCandy || t.cents || this.passSelected.some(Boolean))); },
  get totalContext() { const t = this.total; return t ? fmt(t.held, 0) + ' held + ' + fmt(t.future.candy, 0) + ' future + ' + fmt(t.purchaseCandy, 0) + ' purchased candy' + (t.value.passCandy ? ' + ≈ ' + fmt(t.value.passCandy, 0) + ' pass candy' : '') + '. Additional spending: ' + this.money(t.cents) + '.' : ''; },
  get selection() {
    const selected = this.selected;
    return selected.some(Boolean) ? 'Included: ' + selected.map((n, i) => n ? 'Pack ' + (i + 1) + (n > 1 ? ' ×' + n : '') : '').filter(Boolean).join(', ') + '. The total above includes their fixed items and candy rewards.' : this.choice.next < 0 ? 'Choose your next available pack to include purchases. No purchases are assumed.' : 'No purchases included in your total.';
  },
  get comparison() {
    const offers = this.offers || [], unit = esc(this.unit), next = this.choice.next;
    if (!offers.length) return '';
    const best = offers.filter(offer => offer.cents > 0).sort((a, b) => b.valuation.gems / b.cents - a.valuation.gems / a.cents)[0];
    return '<p class="candy-items-caption">Remaining packs · item EV per ' + unit + ' in gem-equivalents</p><ul class="candy-packs">' + offers.map(offer => {
      const i = offer.index, per = offer.cents / 100, isBest = best && best.index === i;
      return '<li><a href="#pack-' + (i + 1) + '"' + (isBest ? ' data-best="true"' : '') + '><span class="candy-pack-name">Pack ' + (i + 1) + (isBest ? ' · best' : i === next ? ' · next' : '') + '</span><strong>' + (offer.cents ? esc(compact(offer.valuation.gems / per)) : 'Free') + '</strong><span class="candy-pack-price">' + (offer.cents ? esc(this.money(offer.cents)) : 'Free') + '</span><small>' + (offer.cents ? esc(fmt(offer.points / per)) + ' pts/' + unit : '≈ ' + esc(fmt(offer.points)) + ' pts') + '</small></a></li>';
    }).join('') + '</ul>';
  },
  // One card per remaining pack: its value, what it unlocks, and whether the total counts it.
  get packs() {
    const E1 = E(), html = this.html, next = this.choice.next, unit = this.unit, available = next >= 0 && next < 7;
    return (this.offers || []).map(offer => {
      const i = offer.index, count = this.selected[i], locked = next < 0 || i > next, per = offer.cents / 100;
      const fixed = E1.valueRewards(offer.fixed), candy = E1.valueRewards(offer.candyRewards), bonus = E1.valueRewards(offer.bonus);
      return {
        i, id: 'pack-' + (i + 1), value: 'pack-value-' + (i + 1),
        heading: html.art('Candy Party Pack', 36) + 'Pack ' + (i + 1) + (i === next ? ' · next' : ''),
        price: offer.cents ? this.money(offer.cents) : 'Free',
        stats: [
          ['≈ ' + compact(offer.valuation.gems), 'overall item EV · gem-equivalent'],
          [offer.cents ? compact(offer.valuation.gems / per) : 'Free', 'gem-equivalent EV per ' + unit],
          ['≈ ' + fmt(offer.points), 'additional Prankster Points'],
          [offer.cents ? fmt(offer.points / per) : '—', 'points per ' + unit]
        ],
        split: compact(fixed.gems) + ' fixed items + ≈ ' + compact(candy.gems) + ' from candy' + (bonus.gems ? ' + ' + compact(bonus.gems) + ' top-up bonus' : '') + ' = ≈ ' + compact(offer.valuation.gems) + ' gem-equivalent EV.',
        unlock: locked && next >= 0 ? 'Requires earlier packs. Total from your next pack: ' + this.money(offer.unlockCents) + '.' : '',
        fixed: html.fixedItems(offer.fixed),
        bonus: html.art('Halloween Candy', 28) + esc(fmt(offer.candy, 0)) + ' candy adds ≈ ' + esc(fmt(offer.points)) + ' points and its expected chest rewards.',
        unpriced: offer.valuation.unpriced.length ? 'Shown but unpriced in EV: ' + offer.valuation.unpriced.join(', ') + '.' : '',
        rewards: html.rewardTable({ rewards: offer.rewards }),
        available, count,
        add: count ? 'Included ×' + count : locked ? 'Include unlock sequence' : 'Include in total'
      };
    });
  },
  // A pass card: an owned track says how much of it is claimed; an unowned one what it adds.
  get passCards() {
    const E1 = E(), html = this.html;
    return this.passes.map((offer, i) => {
      const owned = this.facts.tracks[i] === true, value = E1.valueRewards(offer.rewards), claimed = this.facts.claimedPass[i + 1];
      return {
        i, owned, id: 'pass-value-' + offer.id,
        heading: html.art(offer.label, 32) + esc(offer.label) + (owned ? ' · owned' : ''),
        claimed: claimed === null ? 'Set your claimed level to include this track.' : claimed + ' of 21 levels claimed. Remaining rewards are included above.',
        price: this.money(offer.cents),
        stats: [['≈ ' + fmt(offer.points), 'additional points'], ['≈ ' + compact(value.gems), 'overall item EV · gem-equivalent'], [compact(value.gems / (offer.cents / 100)), 'gem-equivalent EV per ' + this.unit]],
        candy: '≈ ' + fmt(offer.candy) + ' pass candy unlocked, included in this value.',
        rewards: html.rewardTable({ rewards: offer.rewards }),
        add: this.passSelected[i] ? 'Remove from total' : 'Include in total'
      };
    });
  },
  get passesReady() { return this.facts.points !== null && this.choice.variant !== null; },

  // ── The save and the worker ──────────────────────────────────────────
  // The reward variant, and the next pack from the packs the save says were bought.
  availability() {
    const facts = Object.assign({}, this.facts), store = ledger(), level = store ? store.buildings().levels['town-center'] : null;
    if (facts.townCenter === null && level && level !== '0') facts.townCenter = level.startsWith('TG') || level.startsWith('30') ? 30 : Number(level);
    this.choice.variant = E().progressOptions(facts).variant;
    if (this.facts.packs.every(n => n === null)) this.choice.next = -1;
    else { const next = this.facts.packs.findIndex((n, i) => n === null || n < (i === 6 ? 3 : 1)); this.choice.next = next < 0 ? 7 : next; this.choice.remaining = this.choice.next === 6 ? 3 - (this.facts.packs[6] || 0) : 3; }
  },
  // After an edit: today's milestones follow the event day, and planned income stops at its cap.
  touch() {
    this.passNote = '';
    const day = this.day;
    if (day && day <= 8) { this.future.eventDay = day; this.future.missionClaimed = day <= 7 ? this.facts.missions[day - 1] : null; }
    ['gathering', 'beasts'].forEach(key => { if (this.future[key] > this.limit(key)) this.future[key] = this.limit(key); });
  },
  save() {
    const store = ledger();
    try { store.setSeasonal(occurrence, JSON.parse(JSON.stringify(this.facts))); }
    catch (cause) { this.message = 'Could not save progress. Your calculation still works for this visit.'; }
  },
  calculate() {
    clearTimeout(timer); if (worker) worker.terminate();
    const id = ++token;
    this.busy = { held: true, offers: true, total: true };
    this.message = 'Updating expected rewards…';
    this.held = null; this.total = null;
    timer = setTimeout(() => {
      const E1 = E(), facts = JSON.parse(JSON.stringify(this.facts)), choice = this.choice, passSelected = this.passSelected;
      const input = { id, candy: this.candy, options: E1.progressOptions(facts, choice.variant).options, future: E1.remainingIncome(facts, JSON.parse(JSON.stringify(this.future))), selected: this.selected.slice(), next: choice.next, remaining: choice.remaining, currency: choice.currency, points: facts.points, variant: choice.variant, topUpPoints: facts.topUpPoints, passes: E1.data.passes.map((p, i) => ({ track: p.id, variant: choice.variant, claimed: 0, selected: passSelected[i] && facts.points !== null && choice.variant !== null })) };
      try {
        worker = new Worker(new URL(workerURL, document.baseURI));
        worker.onmessage = event => {
          if (event.data.id !== token) return;
          const part = event.data.part, result = event.data.result;
          if (part === 'held') { this.held = result; if (result.passCandy) this.passNote = 'Includes ≈ ' + fmt(result.passCandy, 0) + ' candy from unclaimed or newly unlocked rewards on your owned tracks. Claimed levels are excluded.'; this.busy.held = false; this.message = ''; }
          if (part === 'total') { this.total = result; this.busy.total = false; }
          if (part === 'offers') { this.offers = result; this.busy.offers = false; }
          if (part === 'passes') this.passes = result;
          if (part === 'error') this.message = 'This calculation is too large or has an invalid input. Reduce the candy plan and try again.';
        };
        worker.onerror = () => { if (id === token) this.message = 'The calculator could not start. Reload to try again.'; };
        worker.postMessage(input);
      } catch (cause) { this.message = 'This browser could not start the calculator.'; }
    }, 180);
  },

  // ── Edits ────────────────────────────────────────────────────────────
  openProgress(panel) { this.panel = panel; },
  // A saved fact: recalculated as it is typed, saved once it is committed.
  edit(key, field, index, commit) {
    if (!field.validity.valid) { this.message = 'Use a whole number within the input limits.'; return; }
    const value = field.type === 'checkbox' ? field.checked : field.value === '' ? null : Number(field.value);
    const previous = index === undefined ? this.facts[key] : this.facts[key][index];
    if (index === undefined) this.facts[key] = value; else this.facts[key][index] = value;
    if (key === 'points' && value === null) this.passSelected = [false, false];
    if (value !== previous) { this.touch(); this.calculate(); }
    if (commit) this.save();
  },
  // A plan for the rest of the event; only today's milestones and the event day are saved.
  plan(key, field) {
    if (!field.validity.valid) return;
    const value = field.type === 'checkbox' ? field.checked : field.value === '' ? null : Number(field.value), data = E().data;
    if (key === 'dailyDoors') { this.future.dailyDoors = value; this.touch(); this.calculate(); return; }
    if (key === 'missionClaimed') { this.future[key] = value; if (this.future.eventDay >= 1 && this.future.eventDay <= 7) { this.facts.missions[this.future.eventDay - 1] = value; this.save(); } }
    else if (key === 'speedupHours') this.future.speedupMinutes = Math.round((value || 0) * 60);
    else this.future[key] = value || 0;
    if (key === 'eventDay') { this.facts.daysLeft = value ? data.rules.eventDays + 1 - value : null; this.save(); }
    this.touch(); this.calculate();
  },
  setEventDay(raw) {
    const data = E().data, facts = this.facts, nextDays = raw === '' ? null : data.rules.eventDays + 1 - Number(raw);
    if (facts.daysLeft !== null && nextDays !== facts.daysLeft) { facts.doorsDoneToday = false; facts.doorDaysLeft = null; }
    facts.daysLeft = nextDays; this.future.eventDay = raw === '' ? 0 : Number(raw); this.future.missionClaimed = null;
    this.touch(); this.calculate(); this.save();
  },
  setTodayClaims(raw) {
    const day = this.facts.daysLeft === null ? 0 : E().data.rules.eventDays + 1 - this.facts.daysLeft;
    if (day >= 1 && day <= 7) this.facts.missions[day - 1] = raw === '' ? null : Number(raw);
    this.touch(); this.calculate(); this.save();
  },
  // Everything still collectable this event, at its cap.
  remaining() {
    const facts = this.facts, future = this.future;
    if (facts.gatheringCollected !== null) future.gathering = Math.max(0, 3000 - facts.gatheringCollected);
    if (facts.beastsCollected !== null) future.beasts = Math.max(0, 4000 - facts.beastsCollected);
    if (E().eventTiming(facts).doorDaysLeft !== null) future.dailyDoors = true;
    if (facts.daysLeft !== null) future.missionTarget = 5;
    this.future = E().remainingIncome(facts, JSON.parse(JSON.stringify(future)));
    this.touch(); this.calculate();
  },
  choose(key, raw) {
    const choice = this.choice, data = E().data;
    choice[key] = key === 'currency' ? raw : raw === '' ? null : Number(raw);
    if (key === 'next' || key === 'remaining') {
      this.selected = Array(7).fill(0);
      if (choice.next >= 0) { this.facts.packs = data.packs.map((_, i) => i < choice.next ? i === 6 ? 3 : 1 : i === 6 && choice.next === 6 ? 3 - choice.remaining : 0); this.save(); }
    }
    if (key === 'variant') { this.passSelected = [false, false]; this.facts.passVariant = choice.variant; this.save(); }
    this.touch(); this.calculate();
  },
  addPack(i) {
    const choice = this.choice;
    if (choice.next < 0) return;
    const selected = this.selected.slice();
    selected[i] = Math.min(selected[i] + 1, i === 6 ? choice.next === 6 ? choice.remaining : 3 : 1);
    this.selected = E().purchaseSequence(choice.next, selected, choice.remaining);
    this.calculate();
  },
  removePack(i) {
    const selected = this.selected.slice();
    if (i === 6 && selected[i] > 1) selected[i]--; else for (let j = i; j < 7; j++) selected[j] = 0;
    this.selected = selected; this.calculate();
  },
  addPass(i) { if (this.facts.tracks[i]) return; this.passSelected[i] = !this.passSelected[i]; this.calculate(); },
  toggleOwned(i) { this.facts.tracks[i] = !this.facts.tracks[i]; this.passSelected[i] = false; this.touch(); this.calculate(); this.save(); }
  };
});
