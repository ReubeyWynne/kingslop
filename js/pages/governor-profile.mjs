/* The governor profile's controller (_includes/governor/profile.html), shared by the governor
   page and the Town Centre: the six pieces and their charms from the store the page works on,
   one piece edited in a dialog, and every piece set at once. x-data="govProfile" on the
   profile, x-data="govPiece('<id>', '<troop>')" on each piece. Arithmetic lives in
   governor-engine.mjs, art and level names in governor-view.js. */
import { Alpine, words } from '../alpine.mjs';
import Governor from '../governor-engine.mjs';

const EN = {
  'slot.hat': 'Hat', 'slot.amulet': 'Amulet', 'slot.armour': 'Armour', 'slot.trousers': 'Trousers', 'slot.ring': 'Ring', 'slot.staff': 'Staff',
  pieceTroop: '{slot} · {troop}', tileLabel: '{name}: {level}. Charms: {charms}.',
  statGear: '+{n}% attack & defence', charmTotal: '+{n}% health & lethality from these three',
  nextGear: 'Next: {level}', nextMax: 'Fully upgraded.', nextUnset: 'Pick the level you see in game.'
};
const TROOPS = { inf: 'Infantry', cav: 'Cavalry', arc: 'Archer' };
const lang = () => Alpine.store('i18n').v;

/** The levels of one kind ('gear' or 'charms') in the store the page works on; every piece
    unset when the store can't be read. */
export function levels(kind) {
  const store = Alpine.store('ledger').store;
  if (store) try { return store.governor(kind); } catch (cause) { /* unreadable: unset */ }
  return Object.fromEntries(Governor.items(kind).map(item => [item.id, null]));
}
/** The art and names, from governor-view.js, read in the language showing. */
export function viewer(art) {
  const view = globalThis.GovernorView.create(Governor, globalThis.BH, art, { emptyGemLabel: '' });
  return {
    state: view.state,
    level(kind, index) { lang(); return view.levelName(kind, index); },
    gearArt: view.gearArt,
    charmArt: view.charmArt,
    tier(index) { return view.card('', index).tier; },
    stars(index) { return view.card('', index).stars; },
    gemLabel(level) { lang(); return view.gem('', level).label; }
  };
}
const say = key => words.t('gov.' + key, EN[key]);
function pieceName(id) {
  const piece = Governor.data.gear.pieces.find(p => p.id === id);
  return words.t('gov.pieceTroop', EN.pieceTroop, { slot: say('slot.' + piece.slot), troop: words.t('gear.' + piece.troop, TROOPS[piece.troop]) });
}
function pct(n) { lang(); return new Intl.NumberFormat((globalThis.I18N && globalThis.I18N.locale) || 'en-GB', { maximumFractionDigits: 2 }).format(n); }

Alpine.data('govProfile', () => ({
  ...words,
  view: null,
  // The piece open in the dialog, or null.
  editing: null,
  init() { this.view = viewer(this.$el.dataset.art || '../img/governor/'); },
  get gear() { return levels('gear'); },
  get charms() { return levels('charms'); },
  pieceName,
  score(kind) {
    const known = Object.values(kind === 'gear' ? this.gear : this.charms).filter(level => level !== null).map(level => Governor.score(kind, level));
    return !known.length || known.includes(null) ? '—' : this.fmt(known.reduce((a, b) => a + b, 0));
  },
  // A gear level's name for the options of every gear select, in the language showing.
  option(index) { return this.view.level('gear', index); },

  set(kind, id, level) { const store = Alpine.store('ledger').store; if (store) store.setGovernor(kind, { [id]: level }); },
  // Applies as soon as a level is picked, then returns to its prompt.
  fillAll(kind, select) {
    if (select.value === '') return;
    const level = Number(select.value), store = Alpine.store('ledger').store;
    select.value = '';
    if (store) store.setGovernor(kind, Object.fromEntries(Governor.items(kind).map(item => [item.id, level])));
  },
  edit(id) { this.editing = id; const dialog = this.$refs.dialog; if (dialog && !dialog.open) dialog.showModal(); },

  // The dialog: one piece, its next level and what that costs, and its three charms.
  get piece() { return this.editing; },
  get index() { return this.editing ? this.gear[this.editing] : null; },
  get editStat() { return this.index ? this.t('gov.statGear', EN.statGear, { n: pct(Governor.stat('gear', this.index)) }) : ''; },
  get editNext() {
    const index = this.index;
    if (!this.editing) return null;
    if (index === null || index >= Governor.max('gear')) return { text: say(index === null ? 'nextUnset' : 'nextMax'), cost: [] };
    const cost = Governor.data.gear.levels[index].cost, art = this.$el.dataset.art || '../img/governor/';
    return {
      text: this.t('gov.nextGear', EN.nextGear, { level: this.view.level('gear', index + 1) }) + (Governor.verified('gear', index + 1) ? '' : ' ◇'),
      cost: Object.keys(cost).filter(id => cost[id]).map(id => { const m = Governor.data.materials.find(x => x.id === id); return { id, src: art + id + '.webp', n: this.fmt(cost[id]), title: this.t(m.key, m.label) }; })
    };
  },
  charmOf(c) { return this.editing ? this.charms[this.editing + '-' + c] : null; },
  get troop() { return this.editing ? this.editing.split('-')[0] : 'inf'; },
  get charmStat() {
    const total = [1, 2, 3].reduce((sum, c) => { const level = this.charmOf(c); return sum + (level ? Governor.stat('charms', level) : 0); }, 0);
    return total ? this.t('gov.charmTotal', EN.charmTotal, { n: pct(total) }) : '';
  },
  // A select in the dialog: 'gear', or a charm row 1–3.
  pick(which, value) {
    if (!this.editing) return;
    const level = value === '' ? null : Number(value);
    if (which === 'gear') this.set('gear', this.editing, level); else this.set('charms', this.editing + '-' + which, level);
  },
  step(which, by) {
    if (!this.editing) return;
    const kind = which === 'gear' ? 'gear' : 'charms', now = which === 'gear' ? this.index : this.charmOf(which);
    const next = Math.min(Governor.max(kind), Math.max(0, (now || 0) + by));
    if (now !== null && next === now) return;
    this.set(kind, which === 'gear' ? this.editing : this.editing + '-' + which, next);
  },
  // The value a select shows: '' for not set.
  value(level) { return level === null || level === undefined ? '' : String(level); }
}));

Alpine.data('govPiece', (id, troop) => ({
  get at() { return this.gear[id]; },
  get pieceState() { return this.view.state(this.at); },
  get levelName() { return this.view.level('gear', this.at); },
  gemAt(c) { return this.charms[id + '-' + c]; },
  get label() {
    const charms = [1, 2, 3].map(c => { const level = this.gemAt(c); return level === null ? '—' : this.fmt(level); });
    return this.t('gov.tileLabel', EN.tileLabel, { name: pieceName(id), level: this.levelName, charms: charms.join(', ') });
  },
  troop
}));
