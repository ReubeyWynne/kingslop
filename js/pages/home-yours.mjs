/* Home's own corner, once the player's save holds something: today on the 28-day event clock
   and what the save is holding, each linking to its page. It stays hidden on an empty save,
   when the save cannot be read, and without JavaScript, so a first visit sees the plain guide
   list.

   It loads after paint, and only for a returning player (pages.json lateScripts), so Alpine
   has already started: the corner is a store, $store.yours, which index.html reads with
   optional chaining until it lands. `empty` tells the stylesheet to give back the space the
   head script held for the corner. */
import { Alpine, words } from '../alpine.mjs';
import EventRules from '../event-rules.mjs';

const PARTS = ['items', 'heroes', 'masters', 'pets', 'gear'];
const count = (map, test) => Object.keys(map || {}).filter(id => test(map[id])).length;
const confirmed = entry => Boolean(entry) && entry.status === 'confirmed';
const known = entry => Boolean(entry) && entry.level !== null && entry.level !== undefined;
const roster = (snapshot, section) => count(snapshot[section] && snapshot[section].roster, () => true);
// The kvk.js weeks, by day of the cycle.
const weekOf = day => day <= 7 ? 'brawl' : day <= 14 ? 'sg' : day <= 20 ? 'mob' : day === 21 ? 'gap' : day <= 26 ? 'prep' : 'battle';

function held(snapshot) {
  return {
    items: count(snapshot.inventory, confirmed),
    heroes: roster(snapshot, 'heroes'),
    masters: roster(snapshot, 'masters'),
    pets: roster(snapshot, 'pets'),
    gear: count(snapshot.heroGear && snapshot.heroGear.pieces, known)
  };
}
// The game turns the wheel on UTC, so today is the UTC calendar date.
function today() {
  const now = new Date(), since = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - EventRules.EPOCH) / EventRules.DAY_MS);
  return (since % EventRules.CYCLE + EventRules.CYCLE) % EventRules.CYCLE + 1;
}

Alpine.store('yours', {
  get parts() { const snapshot = Alpine.store('ledger').snapshot; return snapshot ? held(snapshot) : null; },
  get shown() { const parts = this.parts; return parts ? PARTS.filter(part => parts[part] > 0) : []; },
  get empty() { return !this.shown.length; },
  get today() {
    const day = today(), week = weekOf(day);
    return words.t('ks.today.dayOut', 'day {n} of 28', { n: day }) + ' · ' + (week === 'gap' ? words.t('ks.today.between', 'Between weeks') : words.t('ks.week.' + week, week));
  },
  get held() { const parts = this.parts; return this.shown.map(part => words.t('home.yours.count.' + part, part + ': {n}', { n: words.fmt(parts[part]) })).join(' · '); }
});
