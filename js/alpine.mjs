/* alpine.mjs — Alpine.js for pages whose view is declared in their markup.

   It runs in the site bundle, so every page shares one cached copy, read by the page's own
   modules through its global (SiteAlpine). A page's controller (js/pages/<page>.mjs) imports
   { Alpine } from here, registers its state with Alpine.data, and the page's template binds to it with x-data, x-text, x-model and the
   rest. This file adds what every controller shares, then starts Alpine once the active
   dictionary has arrived and every deferred script has run, the same moment common.js boots
   the page, so a controller registered anywhere in the page's bundle is in place.

   Two stores:
   - $store.i18n: `v` changes on every language or number-format switch. Anything that reads
     it re-renders then. Controllers spread `words` into their state, whose helpers read it
     for them.
   - $store.ledger: the latest snapshot of the store the page works on (your save, or a shared
     sheet's copy), replaced on every save, in this tab or another. `snapshot` is null when the
     ledger cannot be read (storage blocked). `store` is that ledger itself, for the forms that
     write to it, and null then too.

   Static copy stays on data-i18n, painted by i18n.js. Only text that depends on state is
   bound here, and never on a node that also carries data-i18n. */
import Alpine from 'alpinejs';
import PlayerLedger from './player-ledger.mjs';

const BH = () => globalThis.BH;

Alpine.store('i18n', { v: 0 });
document.addEventListener('i18n:change', () => { Alpine.store('i18n').v++; });

// The snapshot is kept outside Alpine's reactivity (a large object, never edited here);
// `v` is what bindings track. Filled in at start, from the store the page works on.
let snapshot = null, guest = false, store = null;
Alpine.store('ledger', {
  v: 0,
  get snapshot() { this.v; return snapshot; },
  get ready() { this.v; return snapshot !== null; },
  // True on a shared link or ?guest: the page works on a sheet, not your save.
  get guest() { this.v; return guest; },
  // The ledger to write to: setHero, setBalance and the rest. Writes come back through `v`.
  get store() { this.v; return store; }
});
/* The store the page works on: your save, or a sheet's in-memory copy when the page is on a
   shared link or ?guest (page-sheet.js chooses before the page starts). */
function connect() {
  let ledger = null;
  try { ledger = globalThis.Interactions ? Interactions.ledger() : PlayerLedger.shared(); snapshot = ledger.snapshot(); guest = ledger !== PlayerLedger.shared(); }
  catch (cause) { ledger = null; snapshot = null; }
  store = ledger && snapshot ? ledger : null;
  if (store) store.subscribe(next => { snapshot = next; Alpine.store('ledger').v++; });
  Alpine.store('ledger').v++;
}

/* Text helpers for controllers and templates. Each reads $store.i18n.v, so a binding that
   uses one re-renders on a language switch. */
const lang = () => Alpine.store('i18n').v;
export const words = {
  t(key, fallback, values) { lang(); const text = BH().tr(key, fallback); return values ? BH().fill(text, values) : text; },
  count(key, n, fallbacks, values) { lang(); return BH().fill(BH().trCount(key, n, fallbacks), values || {}); },
  fmt(n) { lang(); return BH().fmt(n); },
  date(d) {
    lang();
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    try { return new Intl.DateTimeFormat((globalThis.I18N && I18N.locale) || 'en-GB', options).format(d); }
    catch (e) { return d.toLocaleDateString('en-GB', options); }
  }
};

/* One state for several regions of a page (x-data="<name>" on each): Alpine gives each x-data
   its own object, so each gets a view whose fields and methods forward to the shared state. */
export function shared(name, definition) {
  const state = Alpine.reactive(definition);
  Alpine.data(name, () => {
    const view = {};
    for (const key of Object.getOwnPropertyNames(definition)) {
      if (typeof Object.getOwnPropertyDescriptor(definition, key).value === 'function') view[key] = (...args) => state[key](...args);
      else Object.defineProperty(view, key, { get: () => state[key], set: value => { state[key] = value; }, enumerable: true, configurable: true });
    }
    return view;
  });
  return state;
}

/* Started once the active dictionary has arrived and every deferred script has run (the page's
   own bundle, with its controllers, too), the moment common.js boots the page. This file runs in
   the site bundle, ahead of i18n.js and common.js, so it waits for DOMContentLoaded before
   asking either: readyState alone cannot say that the deferred scripts have all run. */
// A tab chosen before Alpine starts (deep-link.js selecting the panel a link names) is announced
// again once it has, so the page's @tabs:select hears it.
const early = [];
const hold = event => { early.push(event); };
document.addEventListener('tabs:select', hold);
function start() {
  connect(); globalThis.Alpine = Alpine; Alpine.start();
  document.removeEventListener('tabs:select', hold);
  early.splice(0).forEach(event => event.target.dispatchEvent(new CustomEvent('tabs:select', { bubbles: true, detail: event.detail })));
}
function begin() { if (globalThis.I18N) I18N.onReady(start); else start(); }
const nav = globalThis.performance && performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
if (document.readyState === 'complete' || (document.readyState === 'interactive' && nav && nav.domContentLoadedEventStart > 0)) begin();
else document.addEventListener('DOMContentLoaded', begin, { once: true });

export { Alpine };
export default Alpine;
