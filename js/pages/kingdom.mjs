/* The kingdom's controllers, in the site bundle because the kingdom link sits on every page.

   kingdomContext: the link in the top bar that says where the kingdom stands ("Gen 3", or
   "Set progression"). kingdomTimeline: the Kingdom timeline page's fields, chapter cards and
   reset. Both read and write window.KingdomProgression (server-age.js), and follow it through
   the ks:kingdom-change event, from this tab or another. */
import { Alpine, words } from '../alpine.mjs';

const progression = () => globalThis.KingdomProgression;

Alpine.data('kingdomContext', () => ({
  ...words,
  // Moves on every kingdom change.
  clock: 0,
  get summary() {
    this.clock; this.t('kingdom.unset', '');
    const P = progression(), profile = P.get();
    if (!P.writable()) return this.t('kingdom.saveFailed', 'Could not save kingdom progression. Check browser storage or your player save.');
    return profile.generation === null ? this.t('kingdom.unset', 'Set progression') : this.t('directory.genShort', 'Gen') + ' ' + this.fmt(profile.generation);
  }
}));

Alpine.data('kingdomTimeline', () => ({
  ...words,
  clock: 0, status: null,
  stages: [],
  init() { this.stages = globalThis.KingdomData.stages; },
  get profile() { this.clock; return progression().get(); },
  get writable() { this.clock; return progression().writable(); },
  get hasProfile() { const profile = this.profile; return ['generation', 'truegold', 'warAcademy'].some(key => profile[key] !== null); },
  // A field's value as the select shows it: '' for not set.
  value(key) { const value = this.profile[key]; return value === null ? '' : String(value); },
  word(key) { return this.t('kingdom.' + key, key); },
  get statusText() { return this.status ? this.word(this.status) : (this.writable ? '' : this.word('saveFailed')); },
  get statusState() { return this.status ? (this.status === 'saveFailed' ? 'failed' : 'saved') : (this.writable ? null : 'failed'); },

  // A chapter card: where the kingdom stands against it.
  cardState(id) {
    const stage = this.stages.find(entry => entry.id === id), profile = this.profile, requirements = { generation: stage.profile.generation };
    if (stage.profile.truegold) requirements.truegold = stage.profile.truegold;
    if (stage.profile.warAcademy) requirements.warAcademy = true;
    return profile.position === id ? 'current' : progression().availability(requirements, profile);
  },
  cardLabel(id) { return this.hasProfile ? this.word(this.cardState(id)) : ''; },

  save(profile) {
    try { progression().set(profile); this.status = 'saved'; } catch (cause) { this.status = 'saveFailed'; }
    this.clock++;
  },
  choose(id) { this.save(this.stages.find(entry => entry.id === id).profile); },
  edit(select) {
    const profile = progression().get(), key = select.dataset.field;
    profile.position = null;
    profile[key] = select.value === '' ? null : key === 'warAcademy' ? select.value === 'true' : Number(select.value);
    this.save(profile);
  },
  reset() { this.save(progression().blank()); }
}));
