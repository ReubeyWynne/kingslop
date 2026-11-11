/* The Pets page's controllers.

   petDen, the Beast Cage: every pet's pen, the care you give the ones you have tamed, and the
   "Your pet" form saved in the store the page works on (pets.roster). pets/index.html binds to
   it: x-data="petDen" around the cage, x-data="pet('<id>')" on each pet. The pen's scene is
   chosen by mood through data attributes; CSS (and js/pet-live.js, where it runs) does all of
   the drawing. Moods are worked out from the clock (PetCare) when the page opens, after each
   action, once a minute and whenever the tab comes back into view. A tamed pet is cared for by
   hand: rub it back and forth, or stroke it with a finger or a held button, to pet it; drag
   the food from its bowl onto it to feed it. The food follows the pointer a whole character
   cell at a time. From the keyboard, the pen and the bowl are buttons. A reaction shows for a
   moment. Care lives in this browser's storage, not the save.

   petAdvances paints the KvK points table from the same roster. */
import { Alpine, words } from '../alpine.mjs';
import PetPlan from '../pet-plan.mjs';
import PetCare from '../pet-care.mjs';
import { number, refused, save, opened } from '../roster-form.mjs';

const EN = {
  count: '{n} pets', owned: '{n} tamed', needs: '{n} need you', lv: 'Lv {n}',
  'mood.asleep': 'Asleep', 'mood.hungry': 'Hungry', 'mood.lonely': 'Lonely', 'mood.delighted': 'Delighted', 'mood.content': 'Content', 'mood.restless': 'Restless', pat: 'Pet',
  next: 'Next Advance at level {level}: {cost}. Worth {points} KvK prep points.', nextOnly: 'Next Advance at level {level}: {cost}.', top: 'Every Advance is done.',
  tomax: 'To level {max} with every Advance: {cost}, {n} Advances, {points} KvK prep points.',
  'm.petFood': '{n} Pet Food', 'm.growthManual': '{n} Growth Manuals', 'm.nutrientPotion': '{n} Nutrient Potions', 'm.promotionMedallion': '{n} Promotion Medallions', free: 'nothing more',
  skillNow: 'skill level {n}', total: '{points} KvK prep points from your next Advances',
  eventNext: 'Next Advances', eventMax: 'Every Advance',
  'bond.new': 'Getting acquainted', 'bond.familiar': 'Familiar', 'bond.close': 'Close companion', 'bond.trusted': 'Trusted friend',
  bondDays: 'Care days: {n}', bondHint: 'Grows with care on different days. Never lost when you are away.',
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
const greeters = new Set();

Alpine.data('petDen', () => ({
  ...words, ...say,
  mine: NONE, clock: Date.now(), ids: [],
  init() {
    this.ids = Array.from(this.$el.querySelectorAll('.pet-card[data-pet]'), node => node.dataset.pet);
    Alpine.effect(() => { this.mine = read(Alpine.store('ledger').store); this.tick(); this.$nextTick(() => greeters.forEach(greet => greet())); });
    setInterval(() => { this.tick(); greeters.forEach(greet => greet()); }, 60000);
  },
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
  get owned() { return this.ids.filter(id => this.tamed(id)).length; },
  get count() {
    const needy = this.ids.filter(id => this.tamed(id) && ['hungry', 'lonely'].includes(this.moodOf(id))).length;
    let text = this.say('count', { n: this.fmt(this.ids.length) });
    if (this.owned) text += ' · ' + this.say('owned', { n: this.fmt(this.owned) });
    if (needy) text += ' · ' + this.say('needs', { n: this.fmt(needy) });
    return text;
  }
}));

Alpine.data('pet', id => {
  const pet = PetPlan.find(id);
  let timer = null, strokes = {}, carry = null, visited = false;
  return {
    id,
    seal: null, redraw: 0,
    // A reaction showing on the pen ({ kind, favourite, welcome }), the spot the keyboard is
    // on, and whether carried food is over the pet.
    reaction: null, spot: null, sniff: false,
    init() {
      const pen = this.$el.querySelector('[data-pen]'), greet = () => this.greet(pen);
      greeters.add(greet);
      new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) greet(); })).observe(pen);
      document.addEventListener('visibilitychange', () => { if (document.hidden) visited = false; });
    },
    get copy() { return this.mine.roster[id] || null; },
    get isTamed() { return this.tamed(id); },
    get mood() { return this.moodOf(id); },
    get care() { this.clock; return this.isTamed && den[id] ? den[id] : null; },
    get shown() { return this.isTamed ? this.reaction : null; },

    // The care panel: the bond, a favourite spot once found, and the two meters.
    get bond() {
      const care = this.care;
      if (!care) return '';
      const bond = PetCare.bond(care);
      return this.say('bond.' + PetCare.stage(care)) + (bond.days ? ' · ' + this.say('bondDays', { n: this.fmt(bond.days) }) : '');
    },
    get favourite() {
      const care = this.care;
      if (!care || !PetCare.bond(care).favourite) return null;
      return this.say('favourite', { spot: this.say('spot.' + PetCare.SPOTS.find(spot => PetCare.favourite(id, spot))) });
    },
    meter(name) { const care = this.care; return care ? Math.round(PetCare.level(care, this.clock)[name]) : 0; },
    get strokeLabel() { return this.say('pat') + ' · ' + this.say('mood.' + this.mood) + (this.spot ? ' · ' + this.say('spot.' + this.spot) : ''); },

    // The dossier: the ladder reached, the Advance waiting at a gate, and what comes next.
    reached(level) { const skill = PetPlan.skillLevel(this.copy); return skill !== null && level <= skill; },
    get gate() { const copy = this.copy; return Boolean(copy) && copy.level !== null && copy.level % 10 === 0; },
    get next() {
      const copy = this.copy;
      if (!copy || copy.level === null) return '';
      const next = PetPlan.nextAdvance(pet, copy);
      return !next ? this.say('top') : this.say('next', { level: this.fmt(next.level), cost: costText(next.cost), points: this.fmt(next.cost.kvk) });
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

    // A reaction shows on the pen for a moment, then the mood's own marks come back.
    react(kind, favourite, welcome) {
      clearTimeout(timer);
      this.reaction = { kind, favourite: Boolean(favourite), welcome: Boolean(welcome) };
      timer = setTimeout(() => { this.reaction = null; this.tick(); }, 2400);
    },
    act(kind, spot) {
      if (!this.isTamed) return;
      const now = Date.now(), result = (kind === 'feed' ? PetCare.feed : PetCare.pat)(den[id] || PetCare.fresh(now), now);
      const favourite = kind === 'pat' && PetCare.favourite(id, spot);
      den[id] = result.react === 'full' ? result.record : PetCare.befriend(result.record, now, favourite);
      this.tick();
      this.react(result.react, favourite);
    },
    // Only a keyboard press (a click with no pointer behind it) pets or feeds outright.
    press(event, kind) { if (!event.detail) this.act(kind, kind === 'pat' ? this.spot || 'head' : undefined); },
    explore(down) {
      const at = PetCare.SPOTS.indexOf(this.spot);
      this.spot = PetCare.SPOTS[(at + (down ? 1 : at < 0 ? 0 : 2)) % 3];
    },
    // A first sight of a tamed pet after a while away, awake and between reactions, welcomes you.
    greet(pen) {
      if (document.hidden || !this.isTamed) return;
      const box = pen.getBoundingClientRect();
      if (box.bottom <= 0 || box.top >= window.innerHeight) return;
      const seen = visited;
      visited = true;
      const now = Date.now(), result = PetCare.visit(den[id] || PetCare.fresh(now), now);
      den[id] = result.record; persist();
      if (!seen && result.welcome && PetCare.mood(result.record, now, new Date(now).getHours()) !== 'asleep' && !this.reaction) this.react('pet', false, true);
    },

    // Petting is a rub: three turns back and forth over the pet, each at least a tenth of its
    // width, or, with a finger or a held button, half its width of stroking. Keep going and it
    // counts again.
    stroke(event) {
      const surface = event.currentTarget;
      let touch = strokes[event.pointerId];
      if (!touch) touch = strokes[event.pointerId] = { x: event.clientX, dir: 0, run: 0, travel: 0, turns: 0, zones: { head: 0, cheeks: 0, chin: 0 } };
      const dx = event.clientX - touch.x, box = surface.getBoundingClientRect(), width = box.width;
      touch.x = event.clientX;
      if (!dx || !width) return;
      const dir = dx > 0 ? 1 : -1;
      if (dir !== touch.dir) { if (touch.run >= width / 10) touch.turns++; touch.dir = dir; touch.run = 0; }
      touch.run += Math.abs(dx); touch.travel += Math.abs(dx);
      const x = (event.clientX - box.left) / box.width, y = (event.clientY - box.top) / box.height, spots = surface.parentElement.querySelector('[data-pen]').petCareSpots;
      let zone = PetCare.spot(y);
      if (spots) {
        const near = spots.map(p => ({ name: p.name, distance: Math.hypot((x - p.x) / 0.18, (y - p.y) / 0.14) })).sort((a, b) => a.distance - b.distance)[0];
        zone = near && near.distance <= 1 ? near.name : null;
      }
      if (zone) touch.zones[zone] += Math.abs(dx);
      const held = event.pointerType !== 'mouse' || event.buttons > 0;
      if (touch.turns >= 3 || (held && touch.travel >= width / 2)) {
        const spot = PetCare.SPOTS.find(name => touch.zones[name] >= touch.travel * 0.6);
        touch.turns = 0; touch.travel = 0; touch.zones = { head: 0, cheeks: 0, chin: 0 };
        this.act('pat', spot);
      }
    },
    unstroke(event) { delete strokes[event.pointerId]; },

    // Feeding: the food leaves its bowl under the pointer, steps cell by cell, and is eaten if
    // it is let go over the pet; otherwise it drops back into the bowl.
    lift(event) {
      const food = event.currentTarget;
      if (carry || event.button > 0) return;
      event.preventDefault();
      const glyph = food.firstElementChild.getBoundingClientRect();
      carry = { food, pen: food.closest('.pet-card').querySelector('[data-pen]'), id: event.pointerId, x: event.clientX, y: event.clientY, w: glyph.width || 8, h: glyph.height || 16, moved: false };
      try { food.setPointerCapture(event.pointerId); } catch (cause) { /* already released */ }
      food.toggleAttribute('data-carried', true);
    },
    over(pen, event) { const box = pen.getBoundingClientRect(); return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom; },
    move(event) {
      if (!carry || event.pointerId !== carry.id) return;
      const dx = Math.round((event.clientX - carry.x) / carry.w), dy = Math.round((event.clientY - carry.y) / carry.h);
      if (dx || dy) carry.moved = true;
      carry.food.style.setProperty('--cx', dx);
      carry.food.style.setProperty('--cy', dy);
      this.sniff = this.over(carry.pen, event);
    },
    drop(event) {
      if (!carry || event.pointerId !== carry.id) return;
      const done = carry;
      carry = null;
      done.food.removeAttribute('data-carried');
      done.food.style.removeProperty('--cx');
      done.food.style.removeProperty('--cy');
      this.sniff = false;
      if (event.type === 'pointerup' && done.moved && this.over(done.pen, event)) this.act('feed');
    },
    opened
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
