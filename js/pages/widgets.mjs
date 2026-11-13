/* The shared widgets, as Alpine controllers (x-data="<name>" on the widget's root). They sit in the
   site bundle because any page can use them, and keep their event contracts: a widget announces
   what happened with a bubbling event (tabs:select, ledger-form:edited, player-save:exported,
   player-save:imported, player-save:rejected, module:error) and the toasts listen for
   player-status on the document. Every name is prefixed with its widget's, because a widget's
   scope sits inside its page's and must not shadow the page's own names.

   tabs               a tablist: arrow keys, Home and End, and tabs:select for the page to hear.
   resultPanel(scope) the toast a player-status event of its scope writes to.
   ledgerForm         number fields bound to the save (data-bind="inventory.<id>"), with a seal.
   saveTransfer       download, choose and import the whole player save.
   troopRoster        the troops you own, one row per type, tier and TG. */
import { Alpine, words } from '../alpine.mjs';

const store = () => Alpine.store('ledger').store;
const Ledger = () => globalThis.PlayerLedger;

const tabsIn = root => Array.from(root.querySelectorAll('[role="tab"][data-value]')).filter(node => node.closest('[data-tabs-bind]') === root);
function choose(root, button) {
  tabsIn(root).forEach(node => { const active = node === button; node.setAttribute('aria-selected', String(active)); node.tabIndex = active ? 0 : -1; });
  root.dispatchEvent(new CustomEvent('tabs:select', { bubbles: true, detail: { binding: root.dataset.tabsBind, value: button.dataset.value } }));
}
// A tab pressed before Alpine has started (deep-link.js selecting the panel a link names) is
// chosen here; alpine.mjs announces the event again once the page's @tabs:select can hear it.
let started = false;
document.addEventListener('alpine:initialized', () => { started = true; }, { once: true });
document.addEventListener('click', event => {
  if (started) return;
  const button = event.target.closest && event.target.closest('[role="tab"][data-value]'), root = button && button.closest('[data-tabs-bind]');
  if (root) choose(root, button);
});

Alpine.data('tabs', () => ({
  tabsButtons() { return tabsIn(this.$root); },
  tabsSelect(button) { choose(this.$root, button); },
  tabsKey(event) {
    const root = this.$root, nodes = this.tabsButtons(), index = nodes.indexOf(event.target), vertical = root.getAttribute('aria-orientation') === 'vertical';
    const forward = vertical ? 'ArrowDown' : 'ArrowRight', back = vertical ? 'ArrowUp' : 'ArrowLeft';
    if (index < 0 || ![forward, back, 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const direction = root.closest('[dir]'), rtl = !vertical && (direction ? direction.dir : document.documentElement.dir) === 'rtl';
    let step = event.key === forward ? 1 : -1;
    if (rtl) step *= -1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? nodes.length - 1 : (index + step + nodes.length) % nodes.length;
    this.tabsSelect(nodes[next]); nodes[next].focus();
  }
}));

Alpine.data('resultPanel', (scope = 'player') => ({
  panelMessage: null,
  panelHear(event) { if (event.detail && event.detail.scope === scope) this.panelMessage = event.detail; },
  get panelText() {
    const message = this.panelMessage;
    return message && message.key ? words.t(message.key, message.fallback || message.key, message.values || {}) : '';
  }
}));

Alpine.data('ledgerForm', () => ({
  formTick: 0, formPhase: null,
  // The seal under the form: what the last write did, as the root's saved/failed keys say.
  get formNote() {
    this.formTick; const root = this.$root.dataset;
    return this.formPhase ? words.t(this.formPhase === 'failed' ? root.saveFailedKey : root.savedKey, '') : '';
  },
  // A saved seal (css/motifs.css) is solid on your save and hollow on a guest sheet.
  get formMark() { return this.formPhase === 'failed' ? 'failed' : this.formPhase ? (this.$store.ledger.guest || this.$root.dataset.guest ? 'unsaved' : 'saved') : null; },
  formAmount(key) {
    this.$store.ledger.v; this.formTick;
    const s = store();
    if (!s) return null;
    const snapshot = s.snapshot();
    if (key.startsWith('inventory.')) { const entry = snapshot.inventory[key.slice(10)]; return entry && entry.status === 'confirmed' ? entry.amount : null; }
    if (/^heroGear\.parts\.(ten|hundred)$/.test(key)) {
      const xp = snapshot.inventory['hero-gear-xp'];
      if (!xp || xp.status !== 'confirmed') return null;
      const parts = snapshot.heroGear.parts || { ten: Math.floor(xp.amount % 100 / 10), hundred: Math.floor(xp.amount / 100) };
      return parts[key.split('.')[2]];
    }
    return null;
  },
  formValue(key) { const amount = this.formAmount(key); return amount === null ? '' : amount; },
  formState(key) { return this.formAmount(key) === null ? 'unknown' : 'confirmed'; },
  formShow(key, unknown) { const amount = this.formAmount(key); return amount === null ? (unknown || '—') : words.fmt(amount); },
  formNormalize() { this.formTick++; },
  formSet(input) {
    if (!input.matches('input[type="number"]') || !input.validity.valid) return;
    const key = input.dataset.bind, amount = input.value === '' ? null : Number(input.value), s = store();
    try {
      if (key && key.startsWith('inventory.')) s.setBalance(key.slice(10), amount);
      else if (key && /^heroGear\.parts\.(ten|hundred)$/.test(key)) { if (amount === null) return; s.setHeroGearPart(key.split('.')[2], amount); }
      else return;
    } catch (cause) {
      this.formTick++; this.formPhase = 'failed';
      input.dispatchEvent(new CustomEvent('module:error', { bubbles: true, detail: { module: 'ledger-form', message: cause.message || String(cause) } }));
      return;
    }
    this.formPhase = 'saved';
    input.dispatchEvent(new CustomEvent('ledger-form:edited', { bubbles: true, detail: { binding: key, amount } }));
  }
}));

Alpine.data('saveTransfer', () => ({
  transferSequence: 0, transferTick: 0,
  init() { try { Ledger().shared().subscribe(() => { this.transferTick++; }); } catch (cause) { /* no store: the seal already says so */ } },
  // The seal is your own save on this device, even on a guest sheet.
  get transferSeal() {
    this.transferTick;
    try { return Ledger().shared().snapshot().revision > 0 ? 'saved' : 'unsaved'; } catch (cause) { return 'failed'; }
  },
  get transferSealText() {
    const text = { saved: ['notes.sealSaved', 'Saved'], unsaved: ['notes.sealUnsaved', 'Nothing saved yet'], failed: ['notes.sealFailed', 'This browser can’t save'] }[this.transferSeal];
    return words.t(text[0], text[1]);
  },
  transferStatus(key) { this.$root.dispatchEvent(new CustomEvent('player-status', { bubbles: true, detail: { scope: this.$root.dataset.statusScope || 'player', key } })); },
  transferExport() {
    const url = URL.createObjectURL(new Blob([store().exportJSON()], { type: 'application/json' })), link = document.createElement('a');
    link.href = url; link.download = 'kingshot-player.json'; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.$root.dispatchEvent(new CustomEvent('player-save:exported', { bubbles: true, detail: {} }));
  },
  async transferImport(input) {
    const file = input.files[0], token = ++this.transferSequence, root = this.$root, s = store();
    input.value = '';
    if (!file) return;
    try {
      // The backup carries the history too, so undoing an import restores both.
      const before = s.backup ? s.backup() : s.snapshot();
      if (file.size > 1024 * 1024) throw new Error('Too large');
      const data = JSON.parse(await file.text());
      if (token !== this.transferSequence || !root.isConnected) return;
      const after = s.importJSON(data, globalThis.HeroGear, before.revision);
      this.transferStatus(root.dataset.importSuccess);
      root.dispatchEvent(new CustomEvent('player-save:imported', { bubbles: true, detail: { before, after } }));
    } catch (cause) {
      if (token === this.transferSequence && root.isConnected) {
        this.transferStatus(root.dataset.importFailure);
        root.dispatchEvent(new CustomEvent('player-save:rejected', { bubbles: true, detail: { message: cause.message } }));
      }
    }
  }
}));

// Troops you own, by type, tier and TG, kept in the shared player save. A row you have just added
// has no amount yet, so it waits in `rosterPending` until one is typed.
const parse = key => { const m = /^troop-(inf|cav|arc)-t(\d+)-tg(\d)$/.exec(key); return m && { type: m[1], tier: +m[2], tg: +m[3] }; };
Alpine.data('troopRoster', () => ({
  rosterPending: {},
  rosterList() {
    this.$store.ledger.v;
    const list = {}, s = store();
    if (s) s.combat().troops.forEach(row => { list[Ledger().troopId(row.type, row.tier, row.tg)] = row.amount; });
    Object.keys(this.rosterPending).forEach(key => { if (!Object.hasOwn(list, key)) list[key] = null; });
    return list;
  },
  rosterRows(type) {
    const list = this.rosterList();
    return Object.keys(list).filter(key => parse(key).type === type).sort((a, b) => { const x = parse(a), y = parse(b); return y.tier - x.tier || y.tg - x.tg; })
      .map(key => ({ key, tier: parse(key).tier, tg: parse(key).tg, amount: list[key] === null ? '' : list[key] }));
  },
  get rosterTotal() {
    const list = this.rosterList(), values = Object.values(list).filter(amount => amount !== null), root = this.$root.dataset;
    return values.length ? words.t(root.totalKey, '{troops} troops', { troops: words.fmt(values.reduce((a, b) => a + b, 0)) }) : words.t(root.emptyKey, '');
  },
  rosterWrite(list) { store().setCombat({ troops: list }, 'manual'); },
  rosterAdd(type) {
    const list = this.rosterList(), used = {};
    let lowest = 11;
    Object.keys(list).forEach(key => { const at = parse(key); if (at.type === type) { used[key] = true; lowest = Math.min(lowest, at.tier); } });
    const start = Object.keys(used).length ? lowest - 1 : 10;
    let key = null;
    for (let step = 0; step < 11 && !key; step++) {
      const tier = ((start - 1 - step + 22) % 11) + 1;
      for (let tg = 0; tg < 6 && !key; tg++) if (!used[Ledger().troopId(type, tier, tg)]) key = Ledger().troopId(type, tier, tg);
    }
    if (!key) return;
    this.rosterPending = Object.assign({}, this.rosterPending, { [key]: true });
    this.$nextTick(() => { const box = this.$root.querySelector('[data-key="' + key + '"] [data-field="amount"]'); if (box) box.focus(); });
  },
  rosterSet(input, row) {
    if (!input.validity.valid) return;
    const amount = input.value === '' ? null : Number(input.value);
    if (amount !== null && !(Number.isSafeInteger(amount) && amount >= 0)) return;
    if (amount === null) this.rosterPending = Object.assign({}, this.rosterPending, { [row.key]: true });
    this.rosterWrite([{ type: parse(row.key).type, tier: row.tier, tg: row.tg, amount }]);
    input.dispatchEvent(new CustomEvent('troop-roster:edited', { bubbles: true, detail: { type: parse(row.key).type, tier: row.tier, tg: row.tg, amount } }));
  },
  rosterMove(select, row) {
    const item = select.closest('[data-key]'), from = parse(row.key), list = this.rosterList();
    const to = { type: from.type, tier: +item.querySelector('[data-field="tier"]').value, tg: +item.querySelector('[data-field="tg"]').value }, key = Ledger().troopId(to.type, to.tier, to.tg);
    if (key === row.key) return;
    let amount = list[row.key];
    const there = Object.hasOwn(list, key) ? list[key] : null;
    if (amount !== null && there !== null) amount += there; else if (amount === null) amount = there;
    const pending = Object.assign({}, this.rosterPending);
    delete pending[row.key];
    if (amount === null) { pending[key] = true; this.rosterPending = pending; return; }
    this.rosterPending = pending;
    this.rosterWrite([{ type: from.type, tier: from.tier, tg: from.tg, amount: null }, { type: to.type, tier: to.tier, tg: to.tg, amount }]);
  },
  rosterRemove(row) {
    const pending = Object.assign({}, this.rosterPending), at = parse(row.key);
    delete pending[row.key];
    this.rosterPending = pending;
    if (this.rosterList()[row.key] === null || this.rosterList()[row.key] === undefined) return;
    this.rosterWrite([{ type: at.type, tier: at.tier, tg: at.tg, amount: null }]);
  }
}));
