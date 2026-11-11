/* Castle Battle's lessons: which lesson and which leader duty are open (the shared tabs widget
   reports each choice as tabs:select), the roster stage the lineups are shown for, and the
   reader's own copy of each hero from their saved roster. castle-battle/index.html binds to
   it with x-data="castleBattle". The page is English only. */
import { Alpine } from '../alpine.mjs';

const STATUS = { event: 'The event', formation: 'Troops', joiners: 'Joiners', combat: 'Combat' };

Alpine.data('castleBattle', () => ({
  view: 'event', role: 'defense', stage: 'mature', status: '',
  select(detail) {
    if (detail.binding === 'role') this.role = detail.value;
    if (detail.binding === 'view') { this.view = detail.value; this.status = STATUS[detail.value]; }
  },
  showing(role, stage) { return this.role === role && this.stage === stage; },
  get roster() { const saved = Alpine.store('ledger').snapshot; return (saved && saved.heroes && saved.heroes.roster) || {}; },
  get known() { return Object.keys(this.roster).length > 0; },
  // "Your copy · 4★ · Skills 5 / 4 / 3 · Widget 6" for a hero in the reader's roster.
  mine(key) {
    const copy = this.roster[key];
    if (!copy) return 'Not recorded in your roster';
    const parts = [];
    if (copy.stars !== null && copy.stars !== undefined) parts.push(Math.floor(copy.stars / 6) + '★' + (copy.stars % 6 ? ' ' + copy.stars % 6 + '/6' : ''));
    parts.push(copy.skills ? 'Skills ' + copy.skills.join(' / ') : 'Skills not recorded');
    if (copy.widget !== null && copy.widget !== undefined) parts.push('Widget ' + copy.widget);
    return 'Your copy · ' + parts.join(' · ');
  }
}));
