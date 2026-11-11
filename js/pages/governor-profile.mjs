/* The governor profile (_includes/governor/profile.html), shared by the governor page and the
   Town Centre: the six pieces and their charms from the store the page works on (the sheet on
   the governor page, the save on the Town Centre), one dialog that edits a piece, and pickers
   that set every piece at once. The include binds to it with x-data="governorProfile".
   Arithmetic lives in governor-engine.mjs, art and level names in governor-view.js. */
import { Alpine } from '../alpine.mjs';

const EN = {
  'slot.hat': 'Hat', 'slot.amulet': 'Amulet', 'slot.armour': 'Armour', 'slot.trousers': 'Trousers', 'slot.ring': 'Ring', 'slot.staff': 'Staff',
  pieceTroop: '{slot} · {troop}', tileLabel: '{name}: {level}. Charms: {charms}.',
  statGear: '+{n}% attack & defence', charmTotal: '+{n}% health & lethality from these three',
  nextGear: 'Next: {level}', nextMax: 'Fully upgraded.', nextUnset: 'Pick the level you see in game.'
};
const TROOPS = { inf: 'Infantry', cav: 'Cavalry', arc: 'Archer' };
const store = () => globalThis.Interactions.ledger();
const G = () => globalThis.Governor;

Alpine.data('governorProfile', (art = '../img/governor/') => ({
  editing: null, view: null, fills: 0,

  init() {
    Alpine.effect(() => {
      Alpine.store('i18n').v; Alpine.store('ledger').v;
      const api = globalThis.BH, s = store();
      this.view = Object.freeze({
        api, look: globalThis.GovernorView.create(G(), api, art, { emptyGemLabel: '' }),
        gear: s.governor('gear'), charms: s.governor('charms')
      });
    });
  },
  t(key) { return this.view.api.tr('gov.' + key, EN[key]); },
  fill(key, values) { return this.view.api.fill(this.t(key), values); },
  pct(n) { return new Intl.NumberFormat((globalThis.I18N && I18N.locale) || 'en-GB', { maximumFractionDigits: 2 }).format(n); },
  name(id) {
    const piece = G().data.gear.pieces.find(p => p.id === id);
    return this.fill('pieceTroop', { slot: this.t('slot.' + piece.slot), troop: this.view.api.tr('gear.' + piece.troop, TROOPS[piece.troop]) });
  },
  // A gear card: its state, tier, art and stars.
  card(id, index) {
    const look = this.view.look, d = index ? G().describe('gear', index) : null;
    return { state: look.state(index), tier: d ? d.tier : '', art: look.gearArt(id, index), stars: '★'.repeat(d ? d.stars : 0) };
  },
  gem(troop, level) { return { state: this.view.look.state(level), art: this.view.look.charmArt(troop, level), text: level ? this.view.api.fmt(level) : '' }; },
  gearName(index) { return this.view.look.levelName('gear', index); },

  // ── The board ────────────────────────────────────────────────────────
  piece(id, troop) {
    const index = this.view.gear[id], level = this.gearName(index), charms = [1, 2, 3].map(c => this.view.charms[id + '-' + c]);
    return {
      card: this.card(id, index), level, tally: index === null ? 'unknown' : null,
      gems: charms.map(n => this.gem(troop, n)),
      label: this.fill('tileLabel', { name: this.name(id), level, charms: charms.map(n => n === null ? '—' : this.view.api.fmt(n)).join(', ') })
    };
  },
  score(kind) {
    const levels = this.view[kind], values = Object.keys(levels).filter(id => levels[id] !== null).map(id => G().score(kind, levels[id]));
    return !values.length || values.includes(null) ? '—' : this.view.api.fmt(values.reduce((a, b) => a + b, 0));
  },

  // ── The editor ───────────────────────────────────────────────────────
  get form() {
    const id = this.editing || 'inf-1', index = this.editing ? this.view.gear[id] : null, troop = id.split('-')[0];
    let next = { text: this.t(index === null ? 'nextUnset' : 'nextMax'), costs: null };
    if (index !== null && index < G().max('gear')) {
      const cost = G().data.gear.levels[index].cost, api = this.view.api;
      next = {
        text: this.fill('nextGear', { level: this.gearName(index + 1) }) + (G().verified('gear', index + 1) ? '' : ' ◇'),
        costs: Object.keys(cost).filter(m => cost[m]).map(m => { const material = G().data.materials.find(x => x.id === m); return { id: m, art: art + m + '.webp', n: api.fmt(cost[m]), title: api.tr(material.key, material.label) }; })
      };
    }
    let total = 0;
    const charms = [1, 2, 3].map(c => {
      const level = this.editing ? this.view.charms[id + '-' + c] : null;
      if (level) total += G().stat('charms', level);
      return { c, id: id + '-' + c, value: level === null || level === undefined ? '' : String(level), gem: this.gem(troop, level) };
    });
    return {
      title: this.editing ? this.name(id) : '', card: this.card(id, index), level: this.editing ? this.gearName(index) : '',
      stat: index ? this.fill('statGear', { n: this.pct(G().stat('gear', index)) }) : '', next,
      value: index === null || index === undefined ? '' : String(index), charms,
      charmStat: total ? this.fill('charmTotal', { n: this.pct(total) }) : ''
    };
  },

  // ── Writes ───────────────────────────────────────────────────────────
  set(kind, id, raw) { if (id) store().setGovernor(kind, { [id]: raw === '' ? null : Number(raw) }); },
  step(kind, id, step) {
    if (!id) return;
    const now = this.view[kind][id], next = Math.min(G().max(kind), Math.max(0, (now || 0) + step));
    if (now !== null && now !== undefined && next === now) return;
    store().setGovernor(kind, { [id]: next });
  },
  // "All gear" and "All charms" apply as soon as a level is picked, then return to their prompt.
  get allGear() { this.fills; return ''; },
  set allGear(raw) { this.fillAll('gear', raw); },
  get allCharms() { this.fills; return ''; },
  set allCharms(raw) { this.fillAll('charms', raw); },
  fillAll(kind, raw) {
    this.fills++;
    if (raw === '') return;
    const change = {};
    G().items(kind).forEach(item => { change[item.id] = Number(raw); });
    store().setGovernor(kind, change);
  }
}));
