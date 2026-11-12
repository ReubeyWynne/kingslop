/* The site guide's controller (_includes/site-guide.html): two notes that teach the page deck,
   then a short door card. The page note says a sideways swipe (or ❧ and the arrow keys) opens
   every page; it retires when the deck or the ledger opens, or on "got it". The rail note sits
   under the deck's rail and retires on the first scrub. The door card asks the kingdom's
   generation and the player's role, saved where the site already keeps them, and offers three
   ways in; it follows "got it", or comes on a later visit, and retires on a way in or "just
   looking". Anything never acted on stops after SHOWINGS visits. "Show me how" in the deck (or
   a link to #site-guide) brings all three back. The rail note and the deck belong to the deck's
   own markup, so they are touched here by id. */
import { Alpine, words } from '../alpine.mjs';

const KEY = 'bh:guide', SHOWINGS = 3, DELAY = 3000;
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (cause) { return {}; } };
const age = () => globalThis.KS_SERVER_AGE;
const ledger = () => Alpine.store('ledger').store;
const role = () => { try { const store = ledger(); return store ? store.priority().role : null; } catch (cause) { return null; } };

Alpine.data('siteGuide', () => ({
  ...words,
  note: false, door: false,
  input: 'keys', generation: '', role: null, saved: '',
  state: load(), timer: 0, replaying: false,

  init() {
    const doc = document, ledgerBtn = doc.getElementById('ledger-btn'), touch = matchMedia('(hover: none) and (pointer: coarse)');
    this.input = touch.matches ? 'touch' : 'keys';
    touch.addEventListener('change', () => { this.input = touch.matches ? 'touch' : 'keys'; });
    doc.addEventListener('deck:open', () => {
      this.retireNote(); this.door = false;
      if (this.due('rail')) { this.count('rail'); this.showRail(); }
    });
    doc.addEventListener('deck:close', () => {
      this.hideRail();
      if (this.replaying) { this.replaying = false; this.start(); }
    });
    doc.addEventListener('deck:scrub', () => { const rail = doc.getElementById('guide-rail'); if (rail && !rail.hidden) { this.retire('rail'); this.hideRail(); } });
    // Where the deck cannot open (no dialog support), ❧ opens the ledger; that teaches it too.
    if (ledgerBtn) ledgerBtn.addEventListener('click', () => { if (this.note) this.retireNote(); });
    doc.addEventListener('click', event => {
      const link = event.target.closest && event.target.closest('[data-guide-replay]');
      if (!link) return;
      event.preventDefault();
      this.replay();
    });
    doc.addEventListener('ks:kingdom-change', () => { if (this.door) this.paintDoor(); });

    if (location.hash === '#site-guide') { this.replay(); return; }
    if (this.state.door !== 'done' && this.known()) this.retire('door');
    let next = this.needed() && this.due('swipe') ? 'swipe' : this.due('door') ? 'door' : null;
    if (next) this.timer = setTimeout(() => {
      if (next === 'swipe' && !this.needed()) next = this.due('door') ? 'door' : null;
      if (!next) return;
      this.count(next);
      if (next === 'swipe') this.showNote(); else this.showDoor();
    }, DELAY);
  },

  due(name) { const seen = this.state[name]; return !seen || (seen !== 'done' && seen < SHOWINGS); },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (cause) { /* private mode: the guide just shows again */ } },
  count(name) { if (this.state[name] !== 'done') { this.state[name] = (this.state[name] || 0) + 1; this.save(); } },
  retire(name) { this.state[name] = 'done'; this.save(); },
  get deck() { return document.getElementById('page-deck'); },
  // Where ❧ is hidden (the widest screens), the topbar already lists every page.
  needed() { const button = document.getElementById('ledger-btn'); return Boolean(this.deck && button && button.getClientRects().length); },

  showNote() { if (!this.needed() || this.deck.open) return; this.door = false; this.note = true; },
  retireNote() { this.retire('swipe'); clearTimeout(this.timer); this.note = false; },
  dismiss() { this.retireNote(); if (this.due('door')) { this.count('door'); this.showDoor(); } },

  // The door asks only what the save does not know yet; a player who has already set both has
  // found their way in.
  known() { return age().getGeneration() !== null && role() !== null; },
  paintDoor() { const generation = age().getGeneration(); this.generation = generation === null ? '' : String(generation); this.role = role(); },
  showDoor() { if (this.deck && this.deck.open) return; this.paintDoor(); this.saved = ''; this.note = false; this.door = true; },
  skip() { this.retire('door'); this.door = false; },
  go() { this.retire('door'); },
  say(ok) { this.saved = ok ? this.t('guide.door.saved', 'Saved.') : this.t('guide.door.saveFailed', 'Could not save. Check browser storage.'); },
  setGeneration(value) {
    try { if (value === '') age().clear(); else age().setGeneration(Number(value)); this.say(globalThis.KingdomProgression.writable()); } catch (cause) { this.say(false); }
  },
  setRole(value) {
    try { ledger().setPriorityRole(value); this.say(true); } catch (cause) { this.say(false); }
    this.paintDoor();
  },

  showRail() {
    const rail = document.getElementById('guide-rail'), bar = document.querySelector('.deck-rail');
    if (!rail) return;
    rail.hidden = false;
    if (this.deck) this.deck.setAttribute('data-guide', 'rail');
    if (bar && !matchMedia('(prefers-reduced-motion: reduce)').matches) { bar.classList.remove('is-waking'); void bar.offsetWidth; bar.classList.add('is-waking'); }
  },
  hideRail() {
    const rail = document.getElementById('guide-rail'), bar = document.querySelector('.deck-rail');
    if (rail) rail.hidden = true;
    if (this.deck) this.deck.removeAttribute('data-guide');
    if (bar) bar.classList.remove('is-waking');
  },

  // The page note first, where it is needed; otherwise the door.
  start() { if (this.needed()) { this.count('swipe'); this.showNote(); } else { this.count('door'); this.showDoor(); } },
  replay() {
    delete this.state.swipe; delete this.state.rail; delete this.state.door;
    this.save();
    const button = document.getElementById('ledger-btn');
    if (button && button.getAttribute('aria-expanded') === 'true' && !(this.deck && this.deck.open)) button.click();
    if (this.deck && this.deck.open) { this.replaying = true; this.showRail(); return; }
    this.start();
  }
}));
