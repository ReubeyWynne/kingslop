/* The Pets page's controllers.

   petDen owns the tabs, ledger view and selected animal. pet renders a planner dossier;
   petCare controls an animal; js/pet-habitat.js draws the shared world.
   Moods are worked out from the clock (PetCare) when the page opens, after each
   action, once a minute and whenever the tab comes back into view. A tamed pet is cared for by
   hand, or tapped to choose which animal to feed. Care lives in this browser's storage,
   not the save.

   petAdvances paints the KvK points table from the same roster. */
import { Alpine, words } from '../alpine.mjs';
import PetPlan from '../pet-plan.mjs';
import PetCare from '../pet-care.mjs';
import { number, refused, save, opened } from '../roster-form.mjs';

const EN = {
  count: '{n} pets', owned: '{n} tamed', lv: 'Lv {n}',
  tame: 'Tame', tamed: 'Tamed', enterLevel: 'Enter its current level to see the cost.',
  preview: 'From level 1 · {advance}',
  'mood.asleep': 'Asleep', 'mood.hungry': 'Hungry', 'mood.lonely': 'Lonely', 'mood.delighted': 'Delighted', 'mood.content': 'Content', 'mood.restless': 'Restless', pat: 'Pet',
  next: 'Next Advance at level {level}: {cost}. Worth {points} KvK prep points.', nextOnly: 'Next Advance at level {level}: {cost}.', top: 'Every Advance is done.',
  tomax: 'To level {max} with every Advance: {cost}, {n} Advances, {points} KvK prep points.',
  'm.petFood': '{n} Pet Food', 'm.growthManual': '{n} Growth Manuals', 'm.nutrientPotion': '{n} Nutrient Potions', 'm.promotionMedallion': '{n} Promotion Medallions', free: 'nothing more',
  skillNow: 'skill level {n}', total: '{points} KvK prep points from your next Advances',
  eventNext: 'Next Advances', eventMax: 'Every Advance',
  feedPet: 'Feed {pet}', playPet: 'Play with {pet}', petPet: 'Pet {pet}',
  play: 'Play', habitat: 'Back to habitat', choosePet: 'Choose a pet', 'mood.playing': 'Playing',
  'mood.full': 'Full', 'mood.eating': 'Eating',
  'bond.new': 'Getting acquainted', 'bond.familiar': 'Familiar', 'bond.close': 'Close companion', 'bond.trusted': 'Trusted friend',
  'spot.head': 'Head', 'spot.cheeks': 'Cheeks', 'spot.chin': 'Chin', favourite: 'Favourite spot: {spot}',
  explore: 'Use Up and Down to explore head, cheeks and chin; Enter to stroke.'
};
const NONE = { roster: {} };
function read(store) { try { return store ? store.pets() : NONE; } catch (cause) { return NONE; } }
// The pets' words, in the language showing: say('next', { … }).
const say = { say(key, values) { return words.t('pets.' + key, EN[key] || key, values); } };
function costText(cost) {
  const parts = PetPlan.KEYS.filter(key => cost[key] > 0).map(key => say.say('m.' + key, { n: words.fmt(cost[key]) }));
  return parts.length ? parts.join(', ') : say.say('free');
}

/* Care, kept outside Alpine's reactivity: `clock` is what bindings track, moved on by every
   action and tick. Storage blocked: the care lasts for this visit. */
let storage = null, den = {};
try { storage = globalThis.localStorage; den = PetCare.load(storage); } catch (cause) { storage = null; }
function persist() { if (storage) try { PetCare.save(storage, den); } catch (cause) { /* storage full or blocked */ } }
const FIRST_LEVEL = { level: 1, advanced: false };
const greeters = new Set();

Alpine.data('petDen', () => ({
  ...words, ...say,
  mine: NONE, clock: Date.now(), petView: 'roster', pickedPet: null,
  init() {
    Alpine.effect(() => {
      this.mine = read(Alpine.store('ledger').store);
      this.tick();
      this.$nextTick(() => greeters.forEach(greet => greet()));
    });
    const canvas = this.$el.querySelector('#pet-play canvas');
    const greet = () => greeters.forEach(fn => fn());
    new IntersectionObserver(([entry]) => { if (entry.isIntersecting) greet(); }).observe(canvas);
    canvas.addEventListener('pet:habitat-ready', greet);
    setInterval(() => { this.tick(); greet(); }, 60000);
  },
  changeView({ binding, value }) {
    if (binding !== 'pet-view') return;
    this.petView = value;
    if (value !== 'pen') this.pickedPet = null;
  },
  get activePet() { return this.pickedPet || PetPlan.PETS.find(pet => this.tamed(pet.id))?.id || PetPlan.PETS[0].id; },
  get activeName() { return PetPlan.find(this.activePet)?.name || ''; },
  get activeStatus() { return this.statusByPet[this.activePet]; },
  statusByPet: {},
  choosePet(id, moveFocus = false) {
    this.pickedPet = id;
    if (moveFocus) {
      const back = this.$el.closest('#pet-play').querySelector('[data-back-to-habitat]');
      this.$nextTick(() => back.focus({ preventScroll: true }));
    }
  },
  leavePet() {
    const from = this.pickedPet;
    this.pickedPet = null;
    this.$nextTick(() => {
      const target = this.$root.querySelector('#pen-' + from + ' button');
      (target?.getClientRects().length ? target : this.$root.querySelector('[data-pet-choices]')).focus({ preventScroll: true });
    });
  },
  careFor(kind) { this.$root.querySelector('#pen-' + this.pickedPet)?.dispatchEvent(new CustomEvent('pet:care', { detail: kind })); },
  // Moods move with the clock; a newly tamed pet starts fresh care.
  tick() {
    const now = Date.now();
    Object.keys(Alpine.raw(this.mine).roster).forEach(id => { if (!den[id]) den[id] = PetCare.fresh(now); });
    persist();
    this.clock = now;
  },
  visible() { if (!document.hidden) { this.tick(); greeters.forEach(greet => greet()); } },
  tamed(id) { return Object.hasOwn(this.mine.roster, id); },
  moodOf(id) { const now = this.clock; return this.tamed(id) && den[id] ? PetCare.mood(den[id], now, new Date(now).getHours()) : 'content'; },
  get count() {
    const n = PetPlan.PETS.length, owned = Object.keys(this.mine.roster).length;
    return this.say('count', { n: this.fmt(n) }) + (owned ? ' · ' + this.say('owned', { n: this.fmt(owned) }) : '');
  }
}));

Alpine.data('petCare', id => {
  let timer = null, visited = false;
  return {
    reactionVersion: 0,
    id,
    get isTamed() { return this.tamed(id); },
    reaction: null, spot: null,
    init() {
      const canvas = this.$el.closest('#pet-play').querySelector('canvas');
      greeters.add(() => this.greet(canvas));
      Alpine.effect(() => { this.statusByPet[id] = this.careStatus; });
      document.addEventListener('visibilitychange', () => { if (document.hidden) visited = false; });
    },
    get mood() {
      // A care action can land on the same clock tick; its reaction also invalidates the mood.
      this.reaction;
      return this.moodOf(id);
    },
    get careStatus() {
      const action = this.reaction?.kind;
      const mood = action === 'full' ? 'full' : action === 'feed' ? 'eating' : action === 'play' ? 'playing' : this.mood;
      const record = den[id];
      const bond = this.isTamed && record && PetCare.stage(record);
      return this.say('mood.' + mood) + (bond && bond !== 'new' ? ' · ' + this.say('bond.' + bond) : '') + (this.spot ? ' · ' + this.say('spot.' + this.spot) : '');
    },
    // A reaction shows on the pen for a moment, then the mood's own marks come back.
    react(kind, favourite, welcome) {
      clearTimeout(timer);
      this.reaction = { kind, version: ++this.reactionVersion, favourite: Boolean(favourite), welcome: Boolean(welcome) };
      timer = setTimeout(() => { this.reaction = null; this.tick(); }, 2400);
    },
    act(kind) {
      if (kind === 'next-spot' || kind === 'previous-spot') { this.explore(kind === 'next-spot'); return; }
      const spot = this.spot || 'head';
      if (!this.isTamed) { this.react(kind === 'pat' ? 'pet' : kind); return; }
      const now = Date.now(), result = (kind === 'feed' ? PetCare.feed : PetCare.pat)(den[id] || PetCare.fresh(now), now);
      const favourite = kind === 'pat' && PetCare.favourite(id, spot);
      den[id] = result.react === 'full' ? result.record : PetCare.befriend(result.record, now, favourite);
      this.tick();
      this.react(kind === 'play' ? 'play' : result.react, favourite);
    },
    explore(down) {
      const at = PetCare.SPOTS.indexOf(this.spot);
      this.spot = PetCare.SPOTS[(at + (down ? 1 : at < 0 ? 0 : 2)) % 3];
    },
    // A first sight of a tamed pet after a while away, awake and between reactions, welcomes you.
    greet(canvas) {
      if (document.hidden || this.petView !== 'pen' || !this.isTamed || !canvas.hasAttribute('data-ready')) return;
      const box = canvas.getBoundingClientRect();
      if (box.bottom <= 0 || box.top >= innerHeight) return;
      const seen = visited;
      visited = true;
      const now = Date.now(), result = PetCare.visit(den[id] || PetCare.fresh(now), now);
      den[id] = result.record; persist();
      if (!seen && result.welcome && PetCare.mood(result.record, now, new Date(now).getHours()) !== 'asleep' && !this.reaction) this.react('pet', false, true);
    },
  };
});

Alpine.data('pet', id => {
  const pet = PetPlan.find(id);
  return {
    seal: null, redraw: 0, opened,
    get copy() { return this.mine.roster[id] || null; },
    get isTamed() { return this.tamed(id); },
    get badge() {
      const level = this.copy?.level;
      return this.say('tamed') + (level == null ? '' : ' · ' + this.say('lv', { n: this.fmt(level) }));
    },
    // Show the first Advance for a preview, or plan from the tamed pet's recorded level.
    reached(level) { const skill = PetPlan.skillLevel(this.copy); return skill !== null && level <= skill; },
    get gate() { const copy = this.copy; return Boolean(copy) && copy.level !== null && copy.level % 10 === 0; },
    get next() {
      const copy = this.copy;
      if (copy?.level === null) return this.say('enterLevel');
      const next = PetPlan.nextAdvance(pet, copy || FIRST_LEVEL);
      if (!next) return this.say('top');
      const advance = this.say('next', { level: this.fmt(next.level), cost: costText(next.cost), points: this.fmt(next.cost.kvk) });
      return copy ? advance : this.say('preview', { advance });
    },
    get tomax() {
      const copy = this.copy, max = copy && PetPlan.toMax(pet, copy);
      return max && max.advances ? this.say('tomax', { max: this.fmt(pet.maxLevel), cost: costText(max), n: this.fmt(max.advances), points: this.fmt(max.kvk) }) : '';
    },
    get level() { this.redraw; const copy = this.copy; return copy && copy.level !== null ? copy.level : ''; },

    edit(input) {
      const store = Alpine.store('ledger').store, field = input.dataset.field;
      if (!field || !store || refused(input)) return;
      const current = Alpine.raw(this.mine.roster[id]);
      save(this, this.$root, 'pet-den', () => {
        if (field === 'owned') store.setPet(id, input.checked ? (current || {}) : null);
        else {
          const copy = Object.assign({ level: null, advanced: false }, current);
          if (field === 'advanced') copy.advanced = input.checked; else copy.level = number(input);
          store.setPet(id, copy);
        }
      });
    },
  };
});

/* The answer: each tamed pet's next Advance and what it scores. Tamed pets without a level
   leave the total open, and each one waits as a ? beneath it. */
function present(roster) {
  const rows = [], unread = [];
  let total = 0, nextScore = 0, maxScore = 0;
  PetPlan.PETS.forEach(pet => {
    if (!Object.hasOwn(roster, pet.id)) return;
    const copy = roster[pet.id];
    if (copy.level === null) { unread.push(pet.name); return; }
    const next = PetPlan.nextAdvance(pet, copy), max = PetPlan.toMax(pet, copy);
    total += next ? next.cost.kvk : 0;
    if (next) nextScore += next.cost.score;
    if (max) maxScore += max.score;
    rows.push({
      key: pet.id, name: pet.name,
      now: say.say('lv', { n: words.fmt(copy.level) }) + ' · ' + say.say('skillNow', { n: words.fmt(PetPlan.skillLevel(copy)) }),
      cells: [next ? say.say('lv', { n: words.fmt(next.level) }) : '—', next ? words.fmt(next.cost.kvk) : '—', words.fmt(max.advances)]
    });
  });
  // The same three-event table as every calculator: the next Advances, and every Advance to the cap.
  const events = [];
  if (nextScore) events.push({ label: say.say('eventNext'), cells: globalThis.EventPoints.forPets(nextScore) });
  if (maxScore) events.push({ label: say.say('eventMax'), cells: globalThis.EventPoints.forPets(maxScore) });
  return { rows, unread, events, total: rows.length ? say.say('total', { points: words.fmt(total) }) : '—', open: rows.length > 0 && unread.length > 0 ? '' : null };
}

Alpine.data('petAdvances', () => ({
  view: present({}),
  init() { Alpine.effect(() => { Alpine.store('i18n').v; this.view = present(read(Alpine.store('ledger').store).roster); }); },
  // The shared event table is built by event-points.js, so it is placed rather than bound.
  placeEvents(el) { const events = this.view.events; el.replaceChildren(...(events.length ? [globalThis.EventPoints.table(globalThis.BH, events, 'hero-event-points')] : [])); }
}));
