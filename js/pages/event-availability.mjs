/* The Event Cycle page's available points (events/#availability): what the bag's confirmed
   counts score on a chosen event day, less what the reader keeps for later, against a point
   target. events/index.html binds to it with x-data="eventAvailability". The arithmetic is the
   Town Centre's (TownCentre.forLedger); the counts themselves are edited through the shared
   ledger-form module, and the backup through save-transfer. */
import { Alpine, words } from '../alpine.mjs';
import EventRules from '../event-rules.mjs';
import TownCentre from '../town-centre-engine.mjs';

const t = (key, fallback, values) => words.t(key, fallback, values);
const fmt = n => words.fmt(n);
const NAMES = Object.fromEntries(EventRules.data.items.map(item => [item.id, item]));
// Items whose count is kept elsewhere (Heroes, Masters), so they have no keep-for-later field.
const NO_RESERVE = new Set(['hero-widget', 'master-emblem']);

function lineName(line) {
  if (line.kind === 'speedup') return t('town.missingSpeedup', '{kind} speedups', { kind: t('town.speedup.' + line.id.slice(8), line.id.slice(8)) });
  if (line.kind === 'governor') return t(line.id === 'governor-gear' ? 'town.govGear' : 'town.govCharms', line.id);
  if (line.kind === 'troops') return t('town.troopLine.' + line.training, 'T{tier} troops', { tier: fmt(line.tier) });
  return line.id;
}

// The Town Centre's sums over the store the page works on, the one $store.ledger follows.
let calculator;
function sums() {
  if (calculator === undefined) {
    try { calculator = TownCentre.forLedger(globalThis.Interactions.ledger()); } catch (cause) { calculator = null; }
  }
  return calculator;
}
// What the reader keeps for later, by item: never more than they hold, so it follows the bag.
const held = Object.create(null);

Alpine.data('eventAvailability', () => ({
  event: 'prep', day: 1, target: null, all: false,
  result: null, seals: {},
  init() { Alpine.effect(() => { Alpine.store('ledger').v; Alpine.store('i18n').v; this.compute(); }); },
  compute() {
    if (!sums()) return;
    const result = calculator.available(this.event, this.day, held, this.target);
    result.items.forEach(item => { if (!NO_RESERVE.has(item.id)) held[item.id] = item.reserved || 0; });
    this.result = result;
  },
  get days() { return EventRules.days(this.event).map(entry => entry.day); },
  dayLabel(d) { return t('ks.today.day', 'day') + ' ' + fmt(d); },
  pickEvent(value) { this.day = Math.min(this.day, EventRules.days(value).length); this.event = value; },
  setTarget(value, valid) { this.target = value === '' || !valid ? null : Number(value); },
  // A valid count is kept; an invalid one is put back to the last good count once the field is left.
  reserve(id, value, valid, done) {
    if (valid) { held[id] = value === '' ? 0 : Number(value); this.compute(); }
    else if (done) this.result = Object.assign({}, this.result);
  },
  // Each bag count's seal: solid once the count is saved, struck when saving fails.
  seal(id, state) { this.seals = Object.assign({}, this.seals, { [id]: state }); },
  failed(id, detail) { if (detail && detail.module === 'ledger-form') this.seal(id, 'failed'); },
  // The figures. A total still waiting on counts stays open, and the counts it waits on follow.
  get total() { return this.result ? fmt(this.result.total) : '—'; },
  get reserved() { return this.result ? fmt(this.result.reservedPoints) : '—'; },
  get shortfall() { return !this.result || this.result.shortfall === null ? '—' : fmt(this.result.shortfall); },
  get blank() { return this.result ? this.result.items.filter(item => item.eligible && item.points === null) : []; },
  get open() { return this.blank.length ? '' : null; },
  get coverage() {
    const names = this.blank.slice(0, 3).map(item => NAMES[item.id] ? t(NAMES[item.id].key, NAMES[item.id].label) : item.id);
    if (this.blank.length > 3) names.push(t('spend.more', '{n} more', { n: fmt(this.blank.length - 3) }));
    return names;
  },
  get additional() {
    if (!this.result) return [];
    return this.result.lines.filter(line => !this.result.items.some(item => item.id === line.id)).map(line => lineName(line) + ' · ' + fmt(line.points));
  },
  get unquantified() { return this.result ? this.result.unquantified.map(row => row.label + ' · ' + row.points) : []; },
  // One item's row.
  item(id) { return this.result && this.result.items.find(item => item.id === id); },
  eligible(id) { const item = this.item(id); return item ? String(item.eligible) : null; },
  hide(id) { const item = this.item(id); return !!item && !item.eligible && !this.all; },
  rate(id) { const item = this.item(id); return item && item.eligible ? fmt(item.rate) : '—'; },
  points(id) { const item = this.item(id); return !item ? '—' : !item.eligible ? '—' : item.points === null ? '' : fmt(item.points); },
  pointsTally(id) { const item = this.item(id); return item && item.eligible && item.points === null ? 'unknown' : null; },
  // A bag count not entered yet is an empty dotted slot; none is a solid 0.
  bagTally(id) {
    const snapshot = Alpine.store('ledger').snapshot, entry = snapshot && snapshot.inventory[id];
    const count = entry && entry.status === 'confirmed' ? entry.amount : null;
    return count === null ? 'blank' : count === 0 ? 'zero' : null;
  },
  keep(id) { const item = this.item(id); return item ? item.reserved || 0 : 0; },
  keepMax(id) { const item = this.item(id); return item && item.amount !== null ? item.amount : 0; },
  keepOff(id) { const item = this.item(id); return !item || item.amount === null; }
}));
