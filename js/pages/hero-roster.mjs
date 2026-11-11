/* The hero roster's controller: the filters, and each hero's tile and "Your copy" form, read
   from and written to the store the page works on (heroes.roster and the hero-shards-{hero}
   and hero-widgets-{hero} balances). _includes/heroes/roster.html binds to it: x-data="heroRoster"
   around the roster, x-data="hero('<key>')" on each hero. Shared by the Heroes page and the
   Town Centre. The filter rules are js/hero-directory-engine.mjs. */
import { Alpine, words } from '../alpine.mjs';
import HeroDirectory from '../hero-directory-engine.mjs';
import { number, refused, save, opened } from '../roster-form.mjs';

const NONE = { roster: {}, shards: {}, widgets: {} };
const FILTERS = ['query', 'troop', 'role', 'mine', 'generation'];
// Browsing still works when storage is blocked; only the forms stay disabled.
function read(store) { try { return store ? store.heroes() : NONE; } catch (cause) { return NONE; } }
function blank() { return Object.fromEntries(FILTERS.map(key => [key, ''])); }

Alpine.data('heroRoster', () => ({
  ...words,
  filters: blank(),
  // The kingdom's generation, shared with every page; `kingdom` moves on any kingdom change.
  server: null, kingdom: 0,
  mine: NONE,
  heroes: [],
  init() {
    this.heroes = Array.from(this.$el.querySelectorAll('[data-hero]'), node => ({
      key: node.dataset.hero, name: node.dataset.name, type: node.dataset.troop,
      generation: Number(node.dataset.generation), roles: (node.dataset.roles || '').split(' ').filter(Boolean)
    }));
    this.server = globalThis.KS_SERVER_AGE.getGeneration();
    Alpine.effect(() => { this.mine = read(Alpine.store('ledger').store); });
  },
  serverChanged(detail) { this.server = detail ? detail.generation : null; this.kingdom++; },
  get any() { return Object.keys(this.mine.roster).length > 0; },
  // A generation picked in the filters shows that generation alone, whatever the kingdom's.
  shows(key) {
    const hero = this.heroes.find(entry => entry.key === key);
    const filters = { ...this.filters, server: this.filters.generation ? '' : this.server || '' };
    return !hero || HeroDirectory.matches({ ...hero, owned: Boolean(this.mine.roster[key]) }, filters);
  },
  get shown() { return this.heroes.filter(hero => this.shows(hero.key)).length; },
  get count() {
    const owned = this.heroes.filter(hero => this.mine.roster[hero.key]).length;
    const text = this.t('directory.count', '{n} of {total} heroes', { n: this.fmt(this.shown), total: this.fmt(this.heroes.length) });
    return owned ? text + ' · ' + this.t('directory.ownedCount', '{n} yours', { n: this.fmt(owned) }) : text;
  },
  reset() { this.filters = blank(); },

  // The kingdom's generation: one the list doesn't carry gets its own option.
  get extra() { return this.server && !this.heroes.some(hero => hero.generation === this.server) ? this.server : null; },
  placeServer(select) { const value = this.server ? String(this.server) : ''; this.extra; this.$nextTick(() => { select.value = value; }); },
  setServer(value) { if (value === '') globalThis.KS_SERVER_AGE.clear(); else globalThis.KS_SERVER_AGE.setGeneration(value); }
}));

Alpine.data('hero', key => ({
  key,
  // Skill levels picked before the whole list is known stay on screen until the rest are chosen.
  pending: null,
  seal: null, redraw: 0,
  get copy() { return this.mine.roster[key] || null; },
  get shards() { return Object.hasOwn(this.mine.shards, key) ? this.mine.shards[key] : null; },
  get upcoming() { this.kingdom; return globalThis.KingdomProgression.availability({ generation: Number(this.$root.dataset.generation) }) === 'upcoming'; },

  // The tile: level, stars, and shards for a hero not yet owned; the portrait's stars (five,
  // with the tier as six notches), widget level and own shards.
  get badge() {
    const copy = this.copy, parts = [];
    if (copy && copy.level !== null) parts.push({ kind: 'level', text: this.t('directory.lvl', 'Lv {n}', { n: this.fmt(copy.level) }) });
    if (copy && copy.stars !== null) { const at = HeroDirectory.stars(copy.stars); parts.push({ kind: 'stars', text: at.stars + '★' + (at.tier ? ' ' + at.tier + '/6' : '') }); }
    if (!copy && this.shards) parts.push({ kind: 'shards', text: this.t('directory.shardCount', '{n} shards', { n: this.fmt(this.shards) }) });
    return parts;
  },
  get stars() { return this.copy && this.copy.stars !== null ? HeroDirectory.stars(this.copy.stars) : null; },

  // The form's values, read back from the save.
  field(name) {
    this.redraw;
    const copy = this.copy, value = !copy ? null : copy[name];
    return value === null || value === undefined ? '' : value;
  },
  skill(at) {
    this.redraw;
    const list = this.copy && (this.copy.skills || this.pending), value = list ? list[at] : null;
    return value === null || value === undefined ? '' : value;
  },
  get shardsField() { this.redraw; return this.shards === null ? '' : this.shards; },
  get widgetsField() { this.redraw; return Object.hasOwn(this.mine.widgets, key) ? this.mine.widgets[key] : ''; },

  edit(input) {
    const store = Alpine.store('ledger').store, field = input.dataset.field;
    if (!field || !store || refused(input)) return;
    const Ledger = globalThis.PlayerLedger, current = Alpine.raw(this.mine.roster[key]);
    save(this, this.$root, 'hero-directory', () => {
      if (field === 'shards') store.setBalance(Ledger.heroShardId(key), number(input));
      else if (field === 'widgets') store.setBalance(Ledger.heroWidgetId(key), number(input));
      else if (field === 'owned') { this.pending = null; store.setHero(key, input.checked ? (current || {}) : null); }
      else {
        const copy = Object.assign({ level: null, stars: null, widget: null, skills: null }, current);
        if (field === 'skill') {
          const skills = (copy.skills || this.pending || []).slice(), size = Number(this.$root.dataset.skills);
          while (skills.length < size) skills.push(null);
          skills[Number(input.dataset.skill)] = number(input);
          // A skill list stays whole: any unread level forgets the list rather than storing gaps.
          copy.skills = skills.every(level => level !== null) ? skills : null;
          this.pending = copy.skills === null ? skills : null;
        } else copy[field] = number(input);
        store.setHero(key, copy);
      }
    });
  },
  opened
}));
