/* The governor page's controllers. Arithmetic lives in governor-engine.mjs; levels, choices
   and materials live in the page's own sheet (js/governor-sheet.js says what a sheet holds),
   and the profile beside the answer (js/pages/governor-profile.mjs) edits them.

   govSheet, on the page's section: a guest sheet looks like a loose leaf, each material says
   whether it is counted, and a screenshot read by the import dock lands on the sheet.

   govPlanner, the answer: where each piece ends up and one bill, never a queue of single
   steps. "With what I have" spends the bag by the chosen troop profile, "cost to reach" prices
   a target for every piece or one troop. */
import { Alpine, words } from '../alpine.mjs';
import Governor from '../governor-engine.mjs';
import { levels, viewer } from './governor-profile.mjs';

const EN = {
  'slot.hat': 'Hat', 'slot.amulet': 'Amulet', 'slot.armour': 'Armour', 'slot.trousers': 'Trousers', 'slot.ring': 'Ring', 'slot.staff': 'Staff',
  'profileNote.bear': 'Archers first: Bear Hunt runs every two days and pays back in hammers. Infantry keeps level with cavalry for Vikings, Alliance Championship and the rest.',
  'profileNote.custom': 'Your own weights: each troop\'s gains count that many times. A troop at 0 stays where it is.',
  'profileNote.score': 'The most governor score for the materials, for an event day.',
  billSpend: 'Spends', billReach: 'Needs', spendLeft: '{n} left', needShort: '{n} short', needEnough: 'enough',
  stays: 'stays', notSet: 'not set', scoreGain: '+{n} governor score', scoreNone: 'No published score for one of these levels.',
  kindGear: 'Gear', kindCharms: 'Charms',
  nothing: 'Nothing the materials can pay for yet. Count them, or set the level of each piece.',
  bagUnknown: 'Materials not counted count as none.',
  reached: 'Everything set is already there.', unverified: 'Includes a step only one table lists (◇).',
  pieceTroop: '{slot} · {troop}',
  applyGear: 'Mark gear applied', applyCharms: 'Mark charms applied', undoGear: 'Gear applied. Undo', undoCharms: 'Charms applied. Undo'
};
const TROOPS = { inf: 'Infantry', cav: 'Cavalry', arc: 'Archer' };
const ORDER = ['cav-1', 'cav-2', 'inf-1', 'inf-2', 'arc-1', 'arc-2'];
function t(key, values) { return words.t((/^slot\./.test(key) ? 'gov.' : 'gov.answer.') + key, EN[key], values); }
const store = () => Alpine.store('ledger').store;
const snapshot = () => Alpine.store('ledger').snapshot;
const confirmed = (id, known) => globalThis.PlayerLedger.confirmed(known || snapshot(), id);

Alpine.data('govSheet', () => ({
  // Each material shows whether it's counted: an empty dotted slot, a solid 0, or the number.
  inkBag(form) {
    const known = snapshot();
    if (!known) return;
    form.querySelectorAll('input[data-bind^="inventory."]').forEach(input => {
      const amount = confirmed(input.dataset.bind.slice(10), known);
      if (amount === null) input.dataset.tally = 'blank'; else if (amount === 0) input.dataset.tally = 'zero'; else delete input.dataset.tally;
    });
  },
  /* The bag's status is a seal: solid once saved, hollow on a sheet that only "Save as mine"
     writes back, struck when saving fails. ledger-form writes its words; the seal follows them. */
  sealBag(seal, form) {
    const mark = () => { seal.dataset.state = seal.textContent && seal.textContent === globalThis.BH.tr(form.dataset.saveFailedKey, '') ? 'failed' : Alpine.store('ledger').guest ? 'unsaved' : 'saved'; };
    new MutationObserver(mark).observe(seal, { childList: true, characterData: true, subtree: true });
    mark();
  },
  /* A Governor Profile read by the import dock (js/import-adapters/governor.js) lands on the
     sheet: values keyed 'gov-cav-1' (gear) and 'gov-cav-1-2' (a charm). `before` gets what
     each held, so the dock can undo. */
  importSheet(detail) {
    const values = detail.values, before = detail.before, now = { gear: levels('gear'), charms: levels('charms') }, change = { gear: {}, charms: {} };
    Object.keys(values).forEach(key => {
      const m = /^gov-([a-z]+-\d)(?:-(\d))?$/.exec(key), value = values[key];
      if (!m) return;
      const kind = m[2] ? 'charms' : 'gear', id = m[2] ? m[1] + '-' + m[2] : m[1];
      before[key] = now[kind][id];
      change[kind][id] = value === null || value === '' ? null : Number(value);
    });
    ['gear', 'charms'].forEach(kind => { if (Object.keys(change[kind]).length) store().setGovernor(kind, change[kind]); });
  }
}));

Alpine.data('govPlanner', () => {
 // The answer worked out once per change of the save, the question or the language, kept out
 // of Alpine's reactivity: a binding that reads `plan` tracks those inputs itself, so it never
 // reads an answer one change behind.
 let memo = { key: null, value: null };
 return {
  ...words,
  mode: 'spend', reachTroop: 'all',
  // An apply stays undoable until either side of it changes: { gear: { before, after } }.
  undo: {},
  view: null, art: '',
  init() {
    this.art = this.$el.dataset.art || '../img/governor/';
    this.view = viewer(this.art);
  },
  get plan() {
    const key = [Alpine.store('ledger').v, Alpine.store('i18n').v, this.mode, this.reachTroop].join('|');
    if (memo.key !== key) memo = { key, value: this.work() };
    return memo.value;
  },
  say: t,
  get prefs() {
    const known = snapshot(), saved = (known && known.preferences.governor) || {};
    const out = Object.assign(Governor.prefDefaults(), saved.goal === 'score' ? { profile: 'score' } : {}, saved);
    const retired = { even: '1:1:1', defence: '1:0.5:0.7' };
    if (Object.hasOwn(retired, out.profile)) { out.weights = out.weights || retired[out.profile]; out.profile = 'custom'; }
    return out;
  },
  get bag() {
    const amounts = {};
    let unknown = false;
    Governor.data.materials.forEach(m => { amounts[m.id] = snapshot() ? confirmed(m.id) : null; if (amounts[m.id] === null) unknown = true; });
    return { amounts, unknown };
  },
  // What one kind holds now: its levels and the bag of its own materials.
  held(kind) {
    const bag = {};
    Governor.data[kind].materials.forEach(id => { bag[id] = snapshot() ? confirmed(id) : null; });
    return { levels: levels(kind), bag };
  },
  undoable(kind) { return Boolean(this.undo[kind]) && JSON.stringify(this.held(kind)) === JSON.stringify(this.undo[kind].after); },

  // The whole answer: where each piece ends up, the bill, the score and the notes.
  work() {
    const gear = levels('gear'), charms = levels('charms'), options = this.prefs, materials = this.bag, mode = this.mode;
    const result = {}, cost = {};
    let scoreTotal = 0, scoreKnown = true;
    ['gear', 'charms'].forEach(kind => {
      const state = kind === 'gear' ? gear : charms;
      if (mode === 'spend') {
        const plan = Governor.plan(kind, state, materials.amounts, { profile: options.profile, weights: options.weights, limit: 1000 });
        result[kind] = { from: state, to: plan.levels, cost: plan.spent, score: plan.score, steps: plan.steps.length, unverified: plan.steps.some(s => !s.verified) };
      } else {
        const target = Governor.toTarget(kind, state, kind === 'gear' ? options.gearTarget : options.charmTarget, materials.amounts, { troop: this.reachTroop });
        result[kind] = { from: state, to: target.levels, cost: target.cost, score: target.score, steps: target.steps, unverified: target.unverified };
      }
      Object.keys(result[kind].cost).forEach(id => { cost[id] = result[kind].cost[id]; });
      if (result[kind].score === null) scoreKnown = false; else scoreTotal += result[kind].score;
    });
    const steps = result.gear.steps + result.charms.steps, notes = [];
    if (!steps) notes.push(t(mode === 'spend' ? 'nothing' : 'reached'));
    if (mode === 'spend' && materials.unknown) notes.push(t('bagUnknown'));
    if (steps && !scoreKnown) notes.push(t('scoreNone'));
    if (result.gear.unverified || result.charms.unverified) notes.push(t('unverified'));
    return {
      result, cost, amounts: materials.amounts, steps, options,
      rows: ORDER.map(id => this.row(id, result.gear, result.charms)),
      score: steps && scoreKnown ? t('scoreGain', { n: this.fmt(scoreTotal) }) : '',
      notes: notes.join(' ')
    };
  },
  // One row per piece: the card it ends on, gear from → to, and each charm from → to.
  row(id, gear, charms) {
    const piece = Governor.data.gear.pieces.find(p => p.id === id), from = gear.from[id], to = gear.to[id], view = this.view;
    const gems = [1, 2, 3].map(c => {
      const cid = id + '-' + c, a = charms.from[cid], b = charms.to[cid];
      return { c, state: view.state(b), src: view.charmArt(piece.troop, b), moved: String(a !== b), text: a === null ? '?' : a === b ? this.fmt(a) : this.fmt(a) + '→' + this.fmt(b) };
    });
    return {
      id, moved: String(from !== to || gems.some(gem => gem.moved === 'true')),
      card: { state: view.state(to), tier: view.tier(to), src: view.gearArt(id, to), stars: view.stars(to) },
      name: t('pieceTroop', { slot: t('slot.' + piece.slot), troop: this.t('gear.' + piece.troop, TROOPS[piece.troop]) }),
      gear: from === null ? t('notSet') : from === to ? view.level('gear', from) + ' · ' + t('stays') : view.level('gear', from) + ' → ' + view.level('gear', to),
      unset: from === null,
      gems
    };
  },
  // The bill: one tile per material, what is left or short beneath it (? until counted).
  get bill() {
    const plan = this.plan, need = this.mode === 'reach', api = globalThis.BH;
    return Governor.data.materials.map(m => {
      const have = plan.amounts[m.id], n = plan.cost[m.id] || 0, out = api.tileText(n, true);
      const line = (key, value, cls) => { const text = api.tileText(value); return { text: t(key, { n: text.text }), title: text.title ? t(key, { n: text.title }) : null, cls }; };
      let below;
      if (!need) below = line('spendLeft', have === null ? null : Math.max(0, have - n), 'sheet-left');
      else { const short = have === null ? null : Math.max(0, n - have); below = short === 0 ? { text: t('needEnough'), title: null, cls: '' } : line('needShort', short, short > 0 ? 'sheet-short' : ''); }
      return { id: m.id, title: this.t(m.key, m.label) + ': ' + this.fmt(n), src: this.art + m.id + '.webp', text: out.text, exact: out.title || null, below };
    });
  },
  // Gear and charms score on different days, so each has its own row. The table is
  // event-points.js's, so it is placed rather than bound.
  placeEvents(el) {
    const plan = this.plan;
    el.replaceChildren();
    if (!plan.steps || !globalThis.EventPoints) return;
    const rows = ['gear', 'charms'].map(kind => ({ label: t(kind === 'gear' ? 'kindGear' : 'kindCharms'), cells: globalThis.EventPoints.forGovernor(kind, plan.result[kind].score) }));
    el.appendChild(globalThis.EventPoints.table(globalThis.BH, rows, 'gov-event-points'));
  },
  // Gear and charms are marked applied apart.
  applyState(kind) { const back = this.undoable(kind); return { back, show: back || this.plan.result[kind].steps > 0 }; },
  applyLabel(kind) { return t(this.applyState(kind).back ? (kind === 'gear' ? 'undoGear' : 'undoCharms') : (kind === 'gear' ? 'applyGear' : 'applyCharms')); },
  get anyApply() { return this.applyState('gear').show || this.applyState('charms').show; },
  apply(kind) {
    if (this.undoable(kind)) { const back = this.undo[kind]; this.undo = { ...this.undo, [kind]: null }; store().applyGovernor(kind, back.before.levels, back.before.bag, 'manual'); return; }
    const planned = this.plan.result[kind];
    if (!planned.steps) return;
    const before = this.held(kind), bag = {};
    Governor.data[kind].materials.forEach(id => { const have = before.bag[id]; if (have !== null) bag[id] = Math.max(0, have - (planned.cost[id] || 0)); });
    store().applyGovernor(kind, planned.to, bag);
    this.undo = { ...this.undo, [kind]: { before, after: this.held(kind) } };
  },

  get profileNote() { const key = 'profileNote.' + this.plan.options.profile; return Object.hasOwn(EN, key) ? t(key) : ''; },
  get weights() { return Governor.weights(this.plan.options); },
  select(event) {
    if (event.detail.binding === 'governor-mode') this.mode = event.detail.value === 'reach' ? 'reach' : 'spend';
  },
  setProfile(select, fold) {
    // Custom starts from the weights on show, so a tweak is one number away.
    const now = this.prefs, seed = select.value === 'custom' && now.profile !== 'custom' && Governor.weights(now);
    if (seed) store().setGovernorPreference('weights', [seed.inf, seed.cav, seed.arc].join(':'));
    store().setGovernorPreference('profile', select.value);
    // As on Hero gear: choosing Custom opens the weights.
    if (select.value === 'custom') { fold.open = true; fold.scrollIntoView({ block: 'nearest' }); const input = fold.querySelector('input'); if (input) input.focus({ preventScroll: true }); }
  },
  setWeight(input) {
    // A change that lands after another profile was picked (the field losing focus) is not an edit.
    const shown = Governor.weights(this.prefs), n = Math.round(Number(input.value) * 10) / 10;
    if (!shown || shown[input.dataset.troop] === n) return;
    const weights = shown;
    if (input.value !== '' && Number.isFinite(n)) weights[input.dataset.troop] = Math.min(10, Math.max(0, n));
    store().setGovernorPreference('weights', [weights.inf, weights.cav, weights.arc].join(':'));
    store().setGovernorPreference('profile', 'custom');
  },
  setOption(select) { store().setGovernorPreference(select.dataset.option, Number(select.value)); }
 };
});
