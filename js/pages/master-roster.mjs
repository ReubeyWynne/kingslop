/* The master roster's controller: each master's tile, dossier lines and "Your master" form,
   read from and written to the store the page works on (masters.roster and the
   master-emblems-{master} balances). _includes/masters/roster.html binds to it:
   x-data="masterRoster" around the roster, x-data="master('<id>')" on each master. Shared by
   the Masters page and the Town Centre's Masters shelf. The classes and talents are
   js/master-spend.mjs. */
import { Alpine, words } from '../alpine.mjs';
import MasterSpend from '../master-spend.mjs';
import { number, refused, save, opened } from '../roster-form.mjs';

const NONE = { roster: {}, emblems: {} };
const EN = {
  count: '{n} masters', owned: '{n} yours', level: 'Lv {n}', next: 'Next class: {name} at affinity {level}, {cost} emblems.', waiting: 'Next class: {name} at affinity {level}, {cost} emblems. Relationship Advancement is waiting on emblems now.',
  soul: 'Kindred Soul reached. Special Research takes emblems from here.', locked: 'Not unlocked yet.', talentNow: 'Yours now, level {n} of 11: {effects}', talentNone: 'Starts at affinity 1.'
};
function read(store) { try { return store ? store.masters() : NONE; } catch (cause) { return NONE; } }

/* Blank, zero and unknown ink: an empty box hasn't been counted, 0 is none, and a skill still
   on ? is unknown. */
export function tally(value, select) { return value === '' ? (select ? 'unknown' : 'blank') : Number(value) === 0 ? 'zero' : null; }

Alpine.data('masterRoster', () => ({
  ...words,
  say(key, values) { return this.t('masters.' + key, EN[key], values); },
  // Moves on every kingdom change, for the upcoming labels.
  kingdom: 0,
  mine: NONE,
  ids: [],
  init() {
    this.ids = Array.from(this.$el.querySelectorAll('[data-master]'), node => node.dataset.master);
    Alpine.effect(() => { this.mine = read(Alpine.store('ledger').store); });
  },
  get any() { return Object.keys(this.mine.roster).length > 0; },
  get count() {
    const owned = this.ids.filter(id => this.mine.roster[id]).length, text = this.say('count', { n: this.fmt(this.ids.length) });
    return owned ? text + ' · ' + this.say('owned', { n: this.fmt(owned) }) : text;
  },
  // The ink of a box being typed in, before it is saved.
  ink(input) { if (input.type === 'checkbox') return; const mark = tally(input.value, input.tagName === 'SELECT'); if (mark) input.dataset.tally = mark; else delete input.dataset.tally; },
  tally
}));

Alpine.data('master', id => {
  const spec = MasterSpend.find(id), data = globalThis.MasterData.masters.find(entry => entry.id === id);
  return {
    id,
    seal: null, redraw: 0,
    get copy() { return this.mine.roster[id] || null; },
    get affinity() { return this.copy ? this.copy.affinity : null; },
    get talent() { return MasterSpend.classAt(spec, this.affinity, this.copy && this.copy.ready); },
    get upcoming() {
      this.kingdom;
      const need = {};
      Object.keys(this.$root.dataset).forEach(key => { const m = /^kingdom(Generation|Truegold)$/.exec(key); if (m) need[m[1].toLowerCase()] = Number(this.$root.dataset[key]); });
      return globalThis.KingdomProgression.availability(need) === 'upcoming';
    },
    get known() { return Boolean(this.copy) && this.affinity !== null; },

    // The tile: affinity and the class reached, one to a line.
    get badge() {
      const parts = [];
      if (this.known) parts.push(this.say('level', { n: this.fmt(this.affinity) }));
      if (this.copy && this.talent) parts.push(data.affinity.classes[this.talent - 1].name);
      return parts.join('\n');
    },
    get soul() { return Boolean(this.copy) && this.affinity === 100 && !this.copy.ready; },
    // Values only, in the order of the talent sentence above them: "6% · 6%".
    get talentNow() {
      if (!this.known) return '';
      if (!this.talent) return this.say('talentNone');
      const effects = data.talent.levels[this.talent - 1].map(effect => this.fmt(effect.value) + (effect.percent ? '%' : '')).join(' · ');
      return this.say('talentNow', { n: this.fmt(this.talent), effects });
    },
    reached(level) { return this.known && level <= this.affinity && !(this.copy.ready && level === this.affinity); },
    get next() {
      const copy = this.copy, affinity = this.affinity;
      if (!copy) return this.say('locked');
      if (affinity === null) return '';
      if (affinity >= 100 && !copy.ready) return this.say('soul');
      const next = data.affinity.classes.find(entry => copy.ready ? entry.level >= affinity : entry.level > affinity);
      return this.say(copy.ready ? 'waiting' : 'next', { name: next.name, level: this.fmt(next.level), cost: this.fmt(next.emblems) });
    },
    // The class at a gate (10, 20 … 100) can still be waiting on emblems.
    get gate() { return this.known && this.affinity >= 10 && this.affinity % 10 === 0; },
    skillLevel(at) { const value = this.copy ? this.copy.skills[at] : null; return value ? this.say('level', { n: this.fmt(value) }) : ''; },

    // The form's values, read back from the save.
    field(name) {
      this.redraw;
      const value = !this.copy ? null : name === 'emblems' ? null : this.copy[name];
      return value === null || value === undefined ? '' : value;
    },
    skill(at) { this.redraw; const value = this.copy ? this.copy.skills[at] : null; return value === null || value === undefined ? '' : value; },
    get emblems() { this.redraw; return Object.hasOwn(this.mine.emblems, id) ? this.mine.emblems[id] : ''; },

    edit(input) {
      const store = Alpine.store('ledger').store, field = input.dataset.field;
      if (!field || !store || refused(input)) return;
      const current = Alpine.raw(this.mine.roster[id]);
      save(this, this.$root, 'master-directory', () => {
        if (field === 'emblems') store.setBalance(globalThis.PlayerLedger.masterEmblemId(id), number(input));
        else if (field === 'owned') store.setMaster(id, input.checked ? (current || {}) : null);
        else {
          const copy = Object.assign({ affinity: null, ready: false, skills: [null, null, null, null] }, current);
          copy.skills = copy.skills.slice();
          if (field === 'skill') copy.skills[Number(input.dataset.skill)] = number(input);
          else if (field === 'ready') copy.ready = input.checked;
          else copy.affinity = number(input);
          store.setMaster(id, copy);
        }
      });
    },
    opened
  };
});
