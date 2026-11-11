/* Hero gear: your gear as three troop cards (a troop opens on its own, laid out as in the game;
   a piece opens its editor and what its next steps cost), then one answer: how near the gear is
   to optimal for what it holds, what the bag buys now, and the red upgrades worth saving for.
   Profile and weights are an advanced fold. hero-gear/index.html binds to it with
   x-data="heroGear" on the box around <main> and its dialogs.

   The gear lives in the store the page works on (your save, or the guest sheet that
   js/hero-gear-sheet.js sets up for ?guest and links). The bag's fields are the shared
   ledger-form widget. The searches (what the bag buys now, the optimal layout, which profile
   the gear fits) run in js/hero-gear-worker.js. Pieces and results are drawn by
   js/hero-gear-view.mjs as markup without controls, placed with x-html; every control is in
   the template. */
import { Alpine } from '../alpine.mjs';
import E from '../hero-gear-engine.mjs';
import HeroGearView from '../hero-gear-view.mjs';

// The worker and the art sit beside the script that carries this module.
const scriptURL = new URL(document.currentScript ? document.currentScript.src : new URL('../js/', location.href).href, location.href);
const base = new URL('./', scriptURL);
function workerURL(filename) { const url = new URL(filename, base); url.search = scriptURL.search; return url; }

const BH = () => globalThis.BH;
const lang = () => Alpine.store('i18n').v;
function tr(key) { lang(); return BH().tr('gear.' + key, key); }
function fmt(n) { lang(); return BH().fmt(n); }
const view = HeroGearView.create({
  engine: E, tr, fmt, tileText: (n, nothing) => { lang(); return BH().tileText(n, nothing); },
  art: new URL('../img/hero-gear/', base),
  fill: (text, values) => BH().fill(text, values)
});
const esc = view.esc;
const copy = s => JSON.parse(JSON.stringify(s));
// The priority profiles, as _includes/priority-options.html names them.
const PROFILE_NAMES = { bear: ['gear.bearProfile', 'Bear first'], growth: ['gear.growth', 'Early growth'], combat: ['gear.combat', 'Early combat'], gen4: ['gear.gen4', 'Generation 4+'], garrison: ['gear.garrisonProfile', 'Garrison lead'], equal: ['gear.equal', 'Equal stats'], custom: ['gear.custom', 'Custom'] };
// Rounded down to a tenth, so gear short of optimal never reads as 100%.
function pct(share) { return share === null ? '…' : (Math.floor(share * 1000 + 1e-6) / 10).toFixed(1).replace(/\.0$/, '') + '%'; }
// The toast (result-panel), a shared widget that listens on the document.
function note(key) { document.dispatchEvent(new CustomEvent('player-status', { detail: { scope: 'hero-gear', key: key ? 'gear.' + key : null } })); }

// The store, the undo copy and the search live outside Alpine: none of them is shown.
let ledger = null, ledgerRevision = 0, previous = null, revision = 0, importedRevision = null;
let searchWorker = null, searchTimer = null, searchDelay = null, undoTimer = null;

Alpine.data('heroGear', () => ({
  state: null, parts: { ten: 0, hundred: 0, remainder: 0 },
  result: null, optimum: null, planned: null, fit: null, running: false, searchFailed: false,
  showOptimal: false, detail: null, editing: false, resetOpen: false, undoShown: false, guest: false,
  seal: 'saved', typing: null, focusOpen: null, focusTile: null, focusView: null, weightsAsk: 0, viewTurn: 0, lastNote: null,

  init() {
    this.guest = globalThis.HeroGearSheet.guest;
    this.seal = this.guest ? 'unsaved' : 'saved';
    let state = E.defaults(), input = null;
    try {
      ledger = globalThis.Interactions.ledger();
      const saved = ledger.migrate(E);
      input = ledger.heroGear(E);
      ledgerRevision = saved.revision;
      state = E.normaliseState(input);
    } catch (error) { ledger = null; this.say('loadFailed'); this.seal = 'failed'; }
    this.state = state;
    if (input) this.readParts(input);
    this.syncXP();
    // A save in another tab, a screenshot read or the bag's fields: the gear follows the store.
    this.$watch('$store.ledger.v', () => this.reload());
    globalThis.addEventListener('player-ledger:error', () => { this.say('loadFailed'); this.cancelSearch(); });
    // The page writes its gear back once it has read it, and again on a language switch, so the
    // save holds the normalised gear (as the page always has).
    this.$watch('$store.i18n.v', () => { this.persist(); this.schedule(250); });
    this.persist();
    this.schedule(250);
  },
  say(key) { this.lastNote = key; note(key); },
  reload() {
    if (!ledger) return;
    let snapshot;
    try { snapshot = ledger.snapshot(); } catch (error) { return; }
    // This page's own write has already been taken in.
    if (snapshot.revision === ledgerRevision) return;
    ledgerRevision = snapshot.revision;
    const input = ledger.heroGear(E);
    this.state = E.normaliseState(input); this.readParts(input);
    // A loaded backup keeps its undo; any other change elsewhere drops it.
    if (snapshot.revision !== importedRevision) { previous = null; this.undoShown = false; }
    this.cancelSearch(); revision++; this.clearResults();
    this.schedule(250);
  },

  // ── XP parts: the bag counts 10s and 100s, the engine one XP total ─────
  partsTotal() { return Math.min(1e9, this.parts.ten * 10 + this.parts.hundred * 100 + (this.parts.remainder || 0)); },
  readParts(input) {
    const saved = input.parts || {}, xp = this.state.resources.xp, whole = n => Math.max(0, Math.floor(Number(n) || 0));
    this.parts = { ten: Math.min(1e7, whole(saved.ten)), hundred: Math.min(1e7, whole(saved.hundred)), remainder: Math.min(9, whole(saved.remainder)) };
    if (this.partsTotal() !== xp) { const x = whole(xp); this.parts = { ten: Math.floor((x % 100) / 10), hundred: Math.floor(x / 100), remainder: x % 10 }; }
  },
  syncXP() { this.state.resources.xp = this.partsTotal(); },

  // ── Saving ───────────────────────────────────────────────────────────
  persist(options) {
    if (!ledger) return false;
    try {
      const saved = ledger.writeHeroGear(Object.assign({}, copy(this.state), { parts: copy(this.parts) }), E, Object.assign({ expectedRevision: ledgerRevision }, options));
      ledgerRevision = saved.revision;
      this.seal = this.guest ? 'unsaved' : 'saved';
      return true;
    } catch (error) {
      this.seal = 'failed';
      try { const restored = ledger.heroGear(E); this.state = E.normaliseState(restored); this.readParts(restored); ledgerRevision = ledger.snapshot().revision; } catch (ignored) {}
      return false;
    }
  },
  get sealText() { return tr(this.seal === 'failed' ? 'saveFailed' : this.guest ? 'guestSaved' : 'saved'); },
  clearResults() { this.result = null; this.optimum = null; this.planned = null; this.fit = null; },
  changed(options) {
    this.cancelSearch();
    revision++;
    this.searchFailed = false;
    this.clearResults();
    // A new change closes the toast; an apply or a reset opens it again with its undo.
    this.say(null); this.undoShown = false;
    const saved = this.persist(options);
    this.schedule(250);
    return saved;
  },
  applyState(next, options) {
    previous = { state: copy(this.state), parts: copy(this.parts), ledger: ledger.snapshot() };
    this.state = E.normaliseState(next);
    this.readParts(next);
    this.syncXP();
    const saved = this.changed(options); this.undoShown = saved;
    return saved;
  },
  undo() {
    if (!previous) return;
    try {
      const restored = ledger.importJSON(previous.ledger, E, ledgerRevision);
      ledgerRevision = restored.revision;
      const input = ledger.heroGear(E); this.state = E.normaliseState(input); this.readParts(input);
      previous = null; this.changed(); this.undoShown = false; this.say('undone');
      // With nothing left to undo, the toast closes on its own.
      clearTimeout(undoTimer);
      undoTimer = setTimeout(() => { if (!this.undoShown && this.lastNote === 'undone') this.say(null); }, 4000);
    } catch (error) { this.say('loadFailed'); }
  },
  // A backup loaded from the save fold can be undone the same way.
  imported(detail) { previous = { ledger: detail.before }; this.undoShown = true; importedRevision = detail.after ? detail.after.revision : null; },
  reset() {
    if (this.applyState(Object.assign(E.defaults(), { parts: { ten: 0, hundred: 0, remainder: 0 } }), { all: true, source: 'reset' })) { this.resetOpen = false; this.say('resetDone'); }
  },

  // ── Your gear ────────────────────────────────────────────────────────
  shown() { return this.showOptimal && this.optimum ? this.optimum.pieces : this.state.pieces; },
  tile(id) {
    const p = this.shown()[id], was = this.state.pieces[id], moved = this.showOptimal && this.optimum && JSON.stringify(p) !== JSON.stringify(was);
    return {
      moved: moved ? 'true' : null, label: view.name(id) + ' · ' + view.pieceLabel(p),
      html: view.gearItem(id, p) + '<span class="gear-tile-name">' + esc(tr(id.split('-')[1])) + '</span>' +
        (moved ? '<small class="gear-tile-was">' + esc(tr('splitNow')) + ' ' + view.levelLabel(was) + ' · ' + was.mastery + '</small>' : '')
    };
  },
  // A troop's share of optimal, from the same search as the whole.
  troopShare(type) {
    if (!this.optimum) return null;
    let now = 0, best = 0;
    E.SLOTS.forEach(slot => { const id = type + '-' + slot; now += E.score(id, this.state.pieces[id], this.state.weights); best += E.score(id, this.optimum.pieces[id], this.state.weights); });
    return best > 0 ? Math.min(1, now / best) : 1;
  },
  get cards() {
    return E.TYPES.map(type => ({
      type, included: String(this.state.included[type]), open: esc(tr(type)) + ' <span aria-hidden="true">›</span>',
      share: this.state.included[type] ? pct(this.troopShare(type)) + ' ' + tr('ofOptimal') : '',
      ids: E.SLOTS.map(slot => type + '-' + slot)
    }));
  },
  // One troop as the game lays it out: helm and chest on the left, gloves and boots on the right.
  get board() {
    const type = this.detail;
    if (!type) return { name: '', back: '', counted: '', included: false, of: '', share: '', role: '', left: [], right: [] };
    return {
      name: tr(type), back: '‹ ' + tr('allTroops'), counted: tr('counted'), included: Boolean(this.state.included[type]),
      of: tr('ofOptimal'), share: this.state.included[type] ? pct(this.troopShare(type)) : '—', role: view.roleText(type),
      left: [type + '-helm', type + '-chest'], right: [type + '-gloves', type + '-boots']
    };
  },
  // Opening a troop puts focus on its way back; going back, on the troop's card.
  openTroop(type) {
    const from = this.detail;
    this.detail = type || null;
    this.focusOpen = type ? 'back' : from;
    this.$nextTick(() => { this.$nextTick(() => { this.focusOpen = null; }); });
  },
  include(type, on) { this.state.included[type] = on; this.changed(); },

  // ── A piece: its levels, then what its next steps cost ─────────────────
  editPiece(id) { this.state.selected = id; this.persist(); this.editing = true; },
  closedEdit() {
    this.editing = false; this.typing = null;
    this.focusTile = this.state.selected;
    this.$nextTick(() => { this.$nextTick(() => { this.focusTile = null; }); });
  },
  stepCost(id, goal) {
    const from = this.state.pieces[id], to = E.milestone(from, goal);
    if (!to) return null;
    const costs = E.cost(from, to);
    return {
      goal, head: esc(tr(goal === 'red' ? 'ascend' : 'nextMithril')) + ' <span>' + view.levelLabel(from) + ' → ' + esc(view.fullLevel(to)) + '</span>',
      bill: view.costStrip(costs, E.gap(costs, this.state.resources)) + view.kvkScore(costs),
      ready: E.affordable(costs, this.state.resources), apply: tr('applyMilestone')
    };
  },
  get editor() {
    const id = this.state.selected, p = this.state.pieces[id], mithril = E.milestone(p, 'mithril'), red = E.milestone(p, 'red');
    // Ascension comes first in game, so its bill does too; the mithril step goes past it.
    const steps = [];
    if (red && (!mithril || JSON.stringify(red) !== JSON.stringify(mithril))) steps.push(this.stepCost(id, 'red'));
    if (mithril) steps.push(this.stepCost(id, 'mithril'));
    return {
      id, title: view.name(id), art: view.gearItem(id, p) + '<span>' + esc(view.pieceLabel(p)) + '</span>',
      qualityLabel: tr('quality'), qualities: ['epic', 'mythic', 'red'].map(q => ({ id: q, name: view.quality(q), selected: q === p.quality })),
      levelLabel: tr('level'), level: String(p.level), levelMin: p.quality === 'red' ? 100 : 0, levelMax: E.cap(p), levelAria: view.name(id) + ' · ' + tr('level'),
      masteryLabel: tr('mastery'), mastery: String(p.mastery), masteryOff: p.quality === 'epic', masteryAria: view.name(id) + ' · ' + tr('mastery'),
      steps, blocked: !mithril && !red ? tr(p.quality === 'epic' ? 'epicBlocked' : 'maxed') : '',
      theory: tr('costIncludes') + ' →'
    };
  },
  // A field being typed in keeps what the reader typed until they move on.
  held(key, value, typed) { return this.typing === key ? typed : value; },
  setPiece(field, raw) {
    const id = this.state.selected;
    this.typing = field;
    this.state.pieces[id] = E.normalisePiece(Object.assign({}, this.state.pieces[id], { [field]: Number(raw) }));
    this.changed({ piece: id });
  },
  settlePiece() { this.typing = null; this.changed({ piece: this.state.selected }); },
  setQuality(quality) {
    const id = this.state.selected;
    this.state.pieces[id] = E.normalisePiece(Object.assign({}, this.state.pieces[id], { quality }));
    this.changed({ piece: id });
  },
  applyGoal(goal) {
    const id = this.state.selected, from = this.state.pieces[id], target = E.milestone(from, goal);
    if (!target) return;
    const costs = E.cost(from, target);
    if (!E.affordable(costs, this.state.resources)) return;
    const updated = copy(this.state); updated.pieces[id] = target;
    E.RES.forEach(r => { updated.resources[r] -= costs[r]; });
    if (this.applyState(updated, { source: 'plan' })) this.say('applied');
  },

  // ── The answer ───────────────────────────────────────────────────────
  // Your gear: how close what is already in it is to its best layout. The bag is not counted.
  get optimal() {
    const o = this.optimum;
    if (!o) return null;
    const gap = o.current > 0 ? (o.score - o.current) / o.current * 100 : 0;
    return {
      share: pct(o.share), label: tr('ofOptimalInvested'),
      gloss: esc(o.changes.length ? BH().fill(tr('optimalGap'), { gain: gap.toFixed(1) }) : tr('optimalAlready')) + ' ' + view.theoryLink('best-split-method', 'optimalMethodTitle'),
      toggle: o.changes.length > 0, toggleText: tr('showOptimal')
    };
  },
  get optimalRows() {
    const o = this.optimum;
    if (!o || !this.showOptimal) return '';
    return o.changes.filter(id => this.state.included[id.split('-')[0]]).map(id => {
      const from = this.state.pieces[id], to = o.pieces[id], slot = id.split('-')[1], a = E.stats(from, slot), b = E.stats(to, slot);
      return '<article class="gear-row gear-change" data-piece-id="' + id + '">' + view.beforeAfter(id, from, to, 'splitNow', 'optimalShort') +
        '<div class="gear-change-info"><strong class="gear-change-name">' + esc(view.name(id)) + '</strong>' +
        '<small class="gear-tile-impact">' + esc(view.statText({ core: b.core - a.core, attack: b.attack - a.attack, defense: b.defense - a.defense }).replace(tr('core'), tr(slot === 'helm' || slot === 'boots' ? 'lethality' : 'health'))) + '</small></div></article>';
    }).join('');
  },
  // The answer: the same measure with the bag counted, before and after Spend now.
  get planShare() {
    const planned = this.planned, result = this.result;
    if (!planned || !result) return '';
    const before = planned.score > 0 ? Math.min(1, planned.current / planned.score) : 1, after = planned.score > 0 ? Math.min(1, result.score / planned.score) : 1;
    return '<div class="gear-headline gear-before-after-share"><strong>' + pct(before) + '</strong><span aria-hidden="true">→</span><strong>' + pct(after) + '</strong></div>' +
      '<p class="gear-gloss">' + esc(tr('planShare')) + '</p>';
  },
  // Which priority profile the gear already fits best; one tap uses it. Only worth a line when
  // it fits clearly better: two points or more over the chosen profile.
  get fitLine() {
    const fit = this.fit, names = fit ? Object.keys(fit) : [], profile = this.state.profile;
    const none = { shown: false, text: '', profile: '', button: '' };
    if (!names.length) return none;
    const best = names.reduce((a, b) => fit[b] > fit[a] + 1e-9 ? b : a);
    if (best === profile || (fit[profile] !== undefined && fit[best] - fit[profile] < 0.02)) return none;
    lang();
    const label = PROFILE_NAMES[best] ? BH().tr(PROFILE_NAMES[best][0], PROFILE_NAMES[best][1]) : best;
    return { shown: true, text: BH().fill(tr('fitBest'), { profile: label, share: pct(fit[best]) }), profile: best, button: tr('useProfile') };
  },
  get searchText() { return tr(this.searchFailed ? 'calculationFailed' : 'calculatingBudget'); },
  // Until the answer is in, a line says it is coming (or failed, with a retry).
  get searching() { return !this.result; },
  get retryShown() { return !this.result && this.searchFailed; },
  get busy() { return String(!this.result && !this.searchFailed); },
  // Spend now: the steps in the order to do them in game (reforges first, as they free the XP
  // and hammers, then upgrades, each troop in turn, helm to boots), what it spends, and its points.
  get answer() {
    const result = this.result, state = this.state;
    if (!result) return null;
    if (!result.changes.length) {
      const included = E.TYPES.filter(type => state.included[type]);
      const message = !included.length ? 'noTroopsSelected' : included.every(type => state.weights[type].every(w => w === 0)) ? 'noWeightsSelected' : E.RES.every(r => !state.resources[r]) && !state.reforge ? 'addBudgetHint' : 'noSpendMoves';
      return { empty: true, message: tr(message), weights: message === 'noWeightsSelected', weightsText: tr('editWeights') };
    }
    const order = {}; E.TYPES.forEach((type, i) => { E.SLOTS.forEach((slot, j) => { order[type + '-' + slot] = i * 4 + j; }); });
    const sorted = result.details.slice().sort((a, b) => order[a.id] - order[b.id]);
    const back = sorted.filter(d => d.refund || d.hammerRefund), up = sorted.filter(d => !d.refund && !d.hammerRefund);
    let n = 0;
    const group = (list, key) => list.length ? '<h4 class="gear-step-head">' + esc(tr(key)) + '</h4>' + list.map(d => view.stepRow(d, ++n)).join('') : '';
    return {
      empty: false,
      body: '<div class="gear-result-summary"><strong>' + view.gainPct(result.gain, result.baseline) + '</strong><span>' + esc(tr('weightedGain')) + '</span><small>' + result.changes.length + ' ' + esc(tr('piecesChanged')) + '</small></div>' +
        '<div class="gear-result-grid">' + group(back, 'stepsReforge') + group(up, back.length ? 'stepsUpgrade' : 'stepsUpgradeOnly') + '</div>' +
        '<div class="gear-cost-title"><strong>' + esc(tr('spend')) + '</strong></div>' + view.spendStrip(result.spent, result.remaining) + this.eventPoints(result.spent) + view.kvkNote() + view.cavalryNote(state, result.pieces),
      apply: tr('applyResult'), hint: tr('applyHint')
    };
  },
  // The same event points table as Governor gear: what Spend now's hammers and mithril score.
  eventPoints(spent) {
    const P = globalThis.EventPoints;
    if (!P) return '';
    const cells = P.forItems({ forgehammer: spent.hammers || 0, mithril: spent.mithril || 0 });
    return P.table(BH(), [{ label: tr('spendNow'), cells }], 'gear-event-points').outerHTML;
  },
  applyResult() {
    if (!this.result) return;
    const next = copy(this.state); next.pieces = copy(this.result.pieces); next.resources = copy(this.result.remaining);
    if (this.applyState(next, { source: 'plan' })) this.say('applied');
  },
  // Red upgrades ranked by stats per resource, with how far the bag is from each.
  get saving() {
    const forecast = E.redPlans(this.state), baseline = forecast.baseline;
    return {
      title: tr('worthSaving'), hint: tr('worthSavingHint'), theory: view.theoryLink('ranking', 'scoreCostExplained'),
      routes: forecast.routes.map(r => {
        const missing = E.RES.filter(k => r.gap[k] > 0).map(k => fmt(r.gap[k]) + ' ' + tr(k + 'Unit')).join(' · ');
        return {
          id: r.id,
          html: view.gearItem(r.id, r.to) +
            '<span class="gear-route-piece"><strong class="inkwell">' + esc(view.name(r.id)) + '</strong>' +
            '<span class="gear-route-levels">' + view.levelLabel(r.from) + ' → <b class="gear-rarity-red">' + esc(view.fullLevel(r.to)) + '</b></span>' +
            '<small>' + esc(missing ? BH().fill(tr('oppShort'), { missing }) : tr('readyShort')) + '</small></span>' +
            '<span class="gear-route-metrics"><span><b>' + view.gainPct(r.gain, baseline) + '</b><small>' + esc(tr('weightedGain')) + '</small></span>' +
            '<span><b>' + r.efficiency.toFixed(1) + '</b><small>' + esc(tr('perCostUnit')) + '</small></span></span>'
        };
      })
    };
  },

  // ── Settings ─────────────────────────────────────────────────────────
  setProfile(profile) {
    this.state.profile = profile;
    if (E.PROFILES[profile]) this.state.weights = copy(E.PROFILES[profile]);
    this.changed();
    if (profile === 'custom') this.editWeights();
  },
  useProfile(profile) { this.state.profile = profile; this.state.weights = copy(E.PROFILES[profile]); this.changed(); },
  setOption(key, on) { this.state[key] = on; this.changed(); },
  typeName(type) { return tr(type); },
  get weightsLabel() { lang(); return BH().tr('gov.weights', 'Weights'); },
  weightName(stat) { return tr(stat ? 'health' : 'lethality'); },
  weight(type, stat) { return String(this.state.weights[type][stat]); },
  weightAria(type, stat) { return tr(type) + ' · ' + this.weightName(stat); },
  setWeight(type, stat, raw) {
    this.typing = 'w-' + type + '-' + stat;
    this.state.profile = 'custom';
    this.state.weights[type][stat] = Math.min(100, Math.max(0, Number(raw) || 0));
    this.changed();
  },
  // The weights fold opens with its first field in focus.
  editWeights() { this.weightsAsk++; },

  // ── On a phone the two columns are two tabs, Your gear and The answer; the choice is kept ──
  get plan() { return this.state.view === 'plan'; },
  setView(next) {
    if (this.state.view === next) return;
    this.state.view = next; this.persist(); this.viewTurn++;
  },
  flipView() {
    const next = this.plan ? 'gear' : 'plan';
    this.setView(next); this.focusView = next;
    this.$nextTick(() => { this.focusView = null; });
  },

  // ── Theory notes ─────────────────────────────────────────────────────
  get costUnits() { return view.costText(E.redPlans(this.state).scale); },
  get kvkFormula() { return BH().fill(tr('kvkFormula'), { hammers: fmt(E.KVK_RATES.hammers), mithril: fmt(E.KVK_RATES.mithril) }); },
  // The same spending plan the Town Centre scores: what this bag can actually put into this gear.
  get kvkBag() { const spend = E.spendable(this.state.pieces, this.state.resources); return BH().fill(tr('kvkBag'), { hammers: fmt(spend.spent.hammers), mithril: fmt(spend.spent.mithril), points: fmt(spend.points) }); },
  get roles() { return E.TYPES.map(type => '<li><strong>' + esc(tr(type)) + '</strong> ' + esc(view.roleText(type)) + '</li>').join(''); },

  // ── The search, in a worker: what the bag buys now, and the optimal set ──
  cancelSearch() {
    clearTimeout(searchDelay); clearTimeout(searchTimer);
    if (searchWorker) searchWorker.terminate();
    searchWorker = null; this.running = false;
  },
  schedule(delay) {
    if (this.result || this.searchFailed || this.running) return;
    clearTimeout(searchDelay);
    searchDelay = setTimeout(() => this.run(), delay);
  },
  run() {
    if (this.running) return;
    clearTimeout(searchDelay);
    this.searchFailed = false;
    this.running = true;
    const currentRevision = revision;
    let worker = null;
    const fail = () => {
      if ((worker && worker !== searchWorker) || currentRevision !== revision) return;
      this.cancelSearch(); this.searchFailed = true;
    };
    try {
      worker = searchWorker = new Worker(workerURL('hero-gear-worker.js'));
      searchTimer = setTimeout(fail, 60000);
      worker.onmessage = event => {
        if (worker !== searchWorker || currentRevision !== revision) return;
        const data = event.data;
        if (data && data.ok && data.fit) { this.fit = Object.freeze(data.fit); this.cancelSearch(); return; }
        if (!data || !data.ok || !data.result || !data.result.now) { fail(); return; }
        // The answer is in; the worker stays on to say which profile the gear fits best.
        clearTimeout(searchTimer); this.running = false;
        this.result = Object.freeze(data.result.now);
        this.optimum = data.result.optimal ? Object.freeze(data.result.optimal) : null;
        this.planned = data.result.planned ? Object.freeze(data.result.planned) : null;
      };
      worker.onerror = fail;
      worker.postMessage(copy(this.state));
    } catch (error) { fail(); }
  },
  retry() { this.searchFailed = false; this.run(); }
}));
