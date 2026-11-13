/* The Battle Simulator (battle-simulator/). battle-simulator/index.html binds to it with
   x-data="simulator" on the console.

   One report read once, four fights answered from it:
   - Bear ratio: the lead's ideal troop mix (MATHS.md §4–5).
   - Bear march: your own march's split measured against that ratio.
   - Mystic Trial: the stage from its report, fought by the battle engine
     (js/battle-engine.mjs), plus a sweep of every mix of your march.
   - Battle: any two sides you can type, fought the same way.

   The sheet is `f`, every field's text keyed by its input's id, kept on this device under
   bh:sim:v1 as it always has been. Heroes join the fights (Mystic Trial and Battle): each side
   picks three leads and up to four joiners, and js/combat.mjs turns their skills into the
   engine's effects. Only skills are added — a hero's stats and gear are already in the
   report's Bonus Details. The bear modes stay hero-less: an ALL-TROOP skill cancels out of a
   bear split (SIM-PROPOSAL.md §10).

   The shared widgets stay where they are: the tabs widget reports a picked tab as
   tabs:select, the troop roster edits the save's troops, and the screenshot import hands a
   read report to the sheet as screen-import:sheet. */
import { Alpine, words } from '../alpine.mjs';
import E from '../battle-engine.mjs';
import Combat from '../combat.mjs';

const BH = () => globalThis.BH;
const lang = () => Alpine.store('i18n').v;
const ledger = () => globalThis.PlayerLedger.current();

// ── The three troop types, in troop-table order, and the report's four stat columns ──
const TYPES = [
  { key: 'inf', nameKey: 'sim.calc.inf', fallback: 'Infantry' },
  { key: 'cav', nameKey: 'sim.calc.cav', fallback: 'Cavalry' },
  { key: 'arc', nameKey: 'sim.calc.arc', fallback: 'Archery' }
];
const STATS = [
  { key: 'atk', save: 'attack', nameKey: 'sim.calc.atk', fallback: 'Attack %' },
  { key: 'let', save: 'lethality', nameKey: 'sim.calc.let', fallback: 'Lethality %' },
  { key: 'def', save: 'defense', nameKey: 'sim.load.def', fallback: 'Defense %' },
  { key: 'hea', save: 'health', nameKey: 'sim.load.hea', fallback: 'Health %' }
];
const MARCH = { n: ['sim.dmg.thCount', 'troops'], tier: ['sim.dmg.thTier', 'tier'], tg: ['sim.dmg.thTg', 'TG'] };
const SIDES = ['sim-', 'sim-foe-'];

const MODES = ['bear-ratio', 'bear-damage', 'mystic', 'battle'];
const DEFAULT_MODE = 'bear-ratio';
// Old links: the PvE bench became the battle mode, which fights beasts too.
const ALIASES = { pve: 'battle' };
// Which blocks each mode shows. ratio and bear-march carry the one line that differs between
// the two bear modes.
const GROUPS = {
  'bear-ratio': ['bear', 'ratio'],
  'bear-damage': ['bear', 'march', 'bear-march'],
  'mystic': ['fight', 'march', 'mystic'],
  'battle': ['fight', 'march', 'battle']
};

/* The Mystic Trial's rooms: the UTC weekdays each opens and its community starting ratio. The
   reset is 00:00 UTC, so "today" is UTC, not the reader's midnight. */
const ROOMS = [
  { key: 'coliseum', days: [1, 2], start: [50, 10, 40], fallback: 'Coliseum' },
  { key: 'forest', days: [3, 4], start: [50, 15, 35], fallback: 'Forest of Life' },
  { key: 'crystal', days: [3, 4], start: [60, 20, 20], fallback: 'Crystal Cave' },
  { key: 'nexus', days: [5, 6], start: [50, 20, 30], fallback: 'Knowledge Nexus' },
  { key: 'molten', days: [5, 6], start: [60, 15, 25], fallback: 'Molten Fort' },
  { key: 'spire', days: [0], start: [50, 15, 35], fallback: 'Radiant Spire' }
];
const roomName = room => words.t('sim.mystic.r.' + room.key, room.fallback);

// ── The bear weights (MATHS.md §2) ──
// The published weights at the table's reference row, T6/TG0 — exactly where ⅓ / 1 / 4.4⁄3
// comes from. Tier enters as ONE shared scale for the whole march, taken from the infantry
// series (attack 1 : 3 : 4, MATHS.md §6.2), so a uniform tier cancels exactly and the march
// panel can never disagree with the ratio panel; only a mixed-tier march moves the optimum.
const WEIGHTS = [1 / 3, 1, 4.4 / 3];
const REF_TIER = 6, REF_TG = 0;
const tierScale = (tier, tg) => E.baseAtk(0, tier, tg) / E.baseAtk(0, REF_TIER, REF_TG);
// The archers' second ×1.1 vs the all-infantry bear, from T7+ / TG3+ (MATHS.md §2); the flat
// ×1.1 is already inside WEIGHTS[2].
const typeWeight = (i, tier, tg) => WEIGHTS[i] * tierScale(tier, tg) * (i === 2 && E.hasSecondSkill(tier, tg) ? 1.1 : 1);

// ── Numbers ──
const locale = () => (globalThis.I18N && I18N.locale) || 'en-GB';
// A fixed-precision number in the active locale's digits.
function numFmt(x, digits) {
  lang();
  try { return x.toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }); }
  catch (e) { return x.toFixed(digits); }
}
const pct = x => numFmt(x, 1) + '%';
const pct0 = x => numFmt(Math.round(x), 0) + '%';
// "50 / 15 / 35" — a mix in infantry / cavalry / archer order, always LTR.
const mixText = f => f.map(x => numFmt(Math.round(x * 1000) / 10, x * 1000 % 10 ? 1 : 0)).join(' / ');
const total = n => n[0] + n[1] + n[2];
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const t = (key, fallback, vars) => words.t(key, fallback, vars);

// ── The sheet: every field's starting text, and what a saved sheet may put back ──
const SHEET_KEY = 'bh:sim:v1';
function blankSheet() {
  const f = {};
  SIDES.forEach(p => {
    TYPES.forEach(ty => {
      f[p + 'n-' + ty.key] = '50000'; f[p + 'tier-' + ty.key] = '10'; f[p + 'tg-' + ty.key] = '0';
      STATS.forEach(s => { f[p + s.key + '-' + ty.key] = p === 'sim-foe-' ? '200' : s.key === 'atk' || s.key === 'def' ? '250' : '163'; });
      f[p + 'hero-' + ty.key] = ''; f[p + 'hero-lv-' + ty.key] = '5'; f[p + 'hero-gear-' + ty.key] = '0';
    });
    for (let i = 1; i <= Combat.MAX_JOINERS; i++) { f[p + 'join-' + i] = ''; f[p + 'join-lv-' + i] = '5'; }
  });
  return Object.assign(f, { 'sim-fight-role': 'solo', 'sim-sw-step': '0.05', 'sim-sw-battles': '50', 'sim-sw-mininf': '0', 'sim-sw-maxinf': '100', 'sim-sw-mincav': '0', 'sim-sw-maxcav': '100' });
}
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
const heroKeys = () => [''].concat(Object.keys((globalThis.CombatData && CombatData.heroSkills) || {}));
// A select takes back only one of its own options; a typed box takes any text.
const CHOICES = [
  [/^sim-(foe-)?tier-/, () => range(1, 11)], [/^sim-(foe-)?tg-/, () => range(0, 8)],
  [/-lv-/, () => range(1, 5)], [/-gear-/, () => range(0, 10)],
  [/^sim-(foe-)?(hero|join)-/, heroKeys],
  [/^sim-fight-role$/, () => ['solo', 'rally', 'defender']],
  [/^sim-sw-step$/, () => ['0.1', '0.05', '0.025', '0.02']],
  [/^sim-sw-battles$/, () => ['20', '50', '100', '250']]
];
function allowed(id, v) {
  const rule = CHOICES.find(c => c[0].test(id));
  return !rule || rule[1]().includes(v);
}
function stored() { try { const s = JSON.parse(localStorage.getItem(SHEET_KEY) || 'null'); return s && typeof s === 'object' ? s : null; } catch (e) { return null; } }
function hasSheet() { try { return localStorage.getItem(SHEET_KEY) !== null; } catch (e) { return true; } }

// ── The fight roles ──
// In a field fight both sides march alone; in a rally one side rallies and the other holds a
// garrison. Joiners only count in those two, and exclusive gear only in its own role.
const FOE_ROLE = { solo: 'solo', rally: 'defender', defender: 'rally' };

// ── The sweep ──
const FIGHT_BATTLES = 200;   // the fight as typed: a few milliseconds, so it keeps up with typing
const SWEEP_CAP = 100000;    // battles per sweep, mixes × battles
const BATTLE_CHOICES = [20, 50, 100, 250];
const NO_ROWS = Object.fromEntries(['inf', 'cav', 'arc', 'sum'].map(k => [k, { you: '', left: '', foe: '', foeLeft: '' }]));

// The triangle: barycentric, infantry top, cavalry bottom-left, archers bottom-right. One
// square rule cell per mix, the signal's opacity carrying the win chance.
const TRI = { inf: [160, 22], cav: [26, 254], arc: [294, 254] };
const triPoint = f => [f[0] * TRI.inf[0] + f[1] * TRI.cav[0] + f[2] * TRI.arc[0], f[0] * TRI.inf[1] + f[1] * TRI.cav[1] + f[2] * TRI.arc[1]];
const svg = (tag, attrs, text) => '<' + tag + Object.keys(attrs).map(k => ' ' + k + '="' + escape(attrs[k]) + '"').join('') + '>' + (text != null ? escape(text) : '') + '</' + tag + '>';

function readMode() {
  let m = (location.search.match(/[?&]mode=([^&]+)/) || [])[1];
  m = m ? decodeURIComponent(m) : '';
  m = ALIASES[m] || m;
  return MODES.includes(m) ? m : DEFAULT_MODE;
}
// ?mode=… opens a fight, and every other param (?lang=…) survives a switch.
function modeUrl(m) {
  const keep = location.search.replace(/^\?/, '').split('&').filter(kv => kv && !/^mode=/.test(kv));
  keep.push('mode=' + m);
  return location.pathname + '?' + keep.join('&') + location.hash;
}

Alpine.data('simulator', options => {
  // The leads' names by key, from the page (data-heroes="key:Name|…").
  const names = {};
  String(options.heroes || '').split('|').forEach(pair => { const at = pair.indexOf(':'); if (at > 0) names[pair.slice(0, at)] = pair.slice(at + 1); });
  // Outside Alpine's reactivity: the fight's memo, the last sweep and its worker. `rev` is
  // what bindings of the last sweep track.
  let fightMemo = { key: null, r: null }, roomMemo = { key: null, room: null };
  let lastSweep = null, worker = null, seq = 0, again = false, queueTimer = 0, saveTimer = 0;

  return {
    f: blankSheet(),
    mode: readMode(), view: 'armies', room: null,
    dialog: null, troop: { you: 'inf', foe: 'inf' },
    jump: 0, reveal: 0, rev: 0,
    busy: false, run: null, note: null,
    sealed: null, ledgerNote: null,

    init() {
      const saved = stored();
      if (saved) {
        Object.keys(saved).forEach(id => { const v = saved[id]; if (typeof v === 'string' && id in this.f && allowed(id, v)) this.f[id] = v; });
        if (typeof saved.room === 'string') this.room = saved.room || null;
      }
      // On a first visit (no sheet saved yet) in a fight mode, the sheet starts from your save.
      else if (!hasSheet() && this.shows('fight')) this.load();
      // A selection the grid can't afford steps down to the largest one that fits.
      Alpine.effect(() => this.fitBattles());
    },
    destroy() { clearTimeout(queueTimer); clearTimeout(saveTimer); if (worker) worker.terminate(); },

    // ── Reading the sheet ──
    num(id) { const v = parseFloat(this.f[id]); return isFinite(v) ? v : 0; },
    pick(id, fallback) { const v = parseInt(this.f[id], 10); return isFinite(v) ? v : fallback; },
    // The lead's A factor per type. A negative percentage is not a stat — floored at zero.
    leadA() {
      const A = {};
      TYPES.forEach(ty => { A[ty.key] = (1 + Math.max(0, this.num('sim-atk-' + ty.key)) / 100) * (1 + Math.max(0, this.num('sim-let-' + ty.key)) / 100); });
      return A;
    },
    // An empty sheet is not a lead with zeroes — it is no answer yet.
    anyStat(prefix) { return STATS.some(s => TYPES.some(ty => { const v = parseFloat(this.f[prefix + s.key + '-' + ty.key]); return isFinite(v) && v > 0; })); },
    // One side as the engine takes it.
    side(prefix) {
      const side = { n: [], tier: [], tg: [], atk: [], let: [], def: [], hea: [] };
      TYPES.forEach((ty, i) => {
        side.n[i] = Math.max(0, Math.floor(this.num(prefix + 'n-' + ty.key)));
        side.tier[i] = this.pick(prefix + 'tier-' + ty.key, 10);
        side.tg[i] = this.pick(prefix + 'tg-' + ty.key, 0);
        STATS.forEach(s => { side[s.key][i] = Math.max(0, this.num(prefix + s.key + '-' + ty.key)); });
      });
      side.skills = globalThis.CombatData ? Combat.side(CombatData, this.lineup(prefix)) : [];
      return side;
    },
    role(prefix) {
      const mine = FOE_ROLE[this.f['sim-fight-role']] ? this.f['sim-fight-role'] : 'solo';
      return prefix === 'sim-foe-' ? FOE_ROLE[mine] : mine;
    },
    lineup(prefix) {
      const heroes = TYPES.filter(ty => this.f[prefix + 'hero-' + ty.key]).map(ty => ({
        key: this.f[prefix + 'hero-' + ty.key],
        levels: [0, 1, 2].map(() => this.pick(prefix + 'hero-lv-' + ty.key, 5)),
        widget: this.pick(prefix + 'hero-gear-' + ty.key, 0)
      }));
      const joiners = [];
      for (let i = 1; i <= Combat.MAX_JOINERS; i++) if (this.f[prefix + 'join-' + i]) joiners.push({ key: this.f[prefix + 'join-' + i], level: this.pick(prefix + 'join-lv-' + i, 5) });
      return { role: this.role(prefix), heroes, joiners };
    },

    // ── Modes: the rail, the blocks each shows, the URL ──
    shows(group) { return GROUPS[this.mode].includes(group); },
    current(m) { return this.mode === m ? 'true' : null; },
    go(event, m) {
      // Leave modified clicks alone — those open a new tab.
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      this.mode = m;
      try { history.pushState({ mode: m }, '', modeUrl(m)); } catch (e) { /* file:// or a blocked history — the panel still switched */ }
    },
    popped() { this.mode = readMode(); },

    // ── The views, tabs and dialogs ──
    // A tab's state: the tabs widget moves focus and reports the pick as tabs:select.
    // group is 'view' (the phone's two halves) or a dialog's side, 'you' or 'foe'.
    tab(group, value) {
      const on = () => (group === 'view' ? this.view : this.troop[group]) === value;
      return { ':aria-selected'() { return String(on()); }, ':tabindex'() { return on() ? 0 : -1; } };
    },
    picked(detail) {
      if (detail.binding === 'view') this.view = detail.value;
    },
    pickTroop(side, detail) { if (detail.binding === 'troop') this.troop[side] = detail.value; },
    edit(id, side, troop) {
      if (troop) this.troop[side] = troop;
      this.dialog = id;
    },
    // A tap on the backdrop closes a dialog: the backdrop's clicks land on the dialog itself,
    // outside its box.
    outside(event, box) { return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom; },
    answer() { this.view = 'answer'; this.jump++; },

    // ── The army tiles ──
    count(id) { const n = Math.max(0, Math.floor(this.num(id))); return n > 0 ? words.fmt(n) : t('sim.army.none', 'none'); },
    stat(id) { lang(); return Math.max(0, this.num(id)).toLocaleString(locale(), { maximumFractionDigits: 1 }) + '%'; },
    tier(prefix, key) { return 'T' + this.num(prefix + 'tier-' + key) + ' · TG' + this.num(prefix + 'tg-' + key); },
    // A troop type the march leaves out reads dimmer on its tile.
    empty(id) { return this.num(id) <= 0 ? '' : null; },
    // The composed accessible names: side, type and stat, in the active language.
    label(prefix, type, field) {
      const ty = TYPES.find(x => x.key === type), s = STATS.find(x => x.key === field), m = MARCH[field];
      const name = t(ty.nameKey, ty.fallback) + ' — ' + (s ? t(s.nameKey, s.fallback) : t(m[0], m[1]));
      return prefix === 'sim-foe-' ? t('sim.foe.title', 'The opponent') + ' — ' + name : name;
    },
    // The card's line: the leads by name, and how many joiners count.
    heroLine(prefix) {
      const l = this.lineup(prefix), shown = TYPES.map(ty => this.f[prefix + 'hero-' + ty.key]).filter(Boolean).map(key => names[key] || key);
      const joined = l.role === 'solo' ? 0 : Math.min(Combat.MAX_JOINERS, l.joiners.length);
      if (joined) shown.push(t('sim.heroes.joined', '{n} joiners', { n: numFmt(joined, 0) }));
      return shown.join(' · ');
    },

    // ── The ratio (MATHS.md §4–5) ──
    // w = (A_inf/3, A_cav, 4.4·A_arc/3)      f_t ∝ w_t²      K = √(Σ w_t²)
    get ratio() {
      const A = this.leadA(), w = { inf: A.inf / 3, cav: A.cav, arc: (4.4 * A.arc) / 3 };
      const sum = w.inf * w.inf + w.cav * w.cav + w.arc * w.arc, rows = {};
      TYPES.forEach(ty => { rows[ty.key] = { a: numFmt(A[ty.key], 2) + '×', w: numFmt(w[ty.key], 2), share: pct(sum > 0 ? (w[ty.key] * w[ty.key]) / sum * 100 : 0) }; });
      const ok = sum > 0 && this.anyStat('sim-');
      return {
        ok, rows,
        headline: !ok ? t('sim.calc.noStats', 'Fill in the lead’s <b>attack</b> and <b>lethality</b> above — the ratio comes from their stats.')
          : t('sim.calc.headline', 'With this lead, the ideal march is <b>{inf}</b> infantry, <b>{cav}</b> cavalry, <b>{arc}</b> archers.', { inf: rows.inf.share, cav: rows.cav.share, arc: rows.arc.share }),
        k: ok ? t('sim.calc.k', 'Leader strength K = <b>{k}</b>', { k: numFmt(Math.sqrt(sum), 2) }) : ''
      };
    },

    // ── The bear march (MATHS.md §1–3) ──
    // Damage per type is √N_t · base_t · A_t, so the best a march of N troops can do for a given
    // lead is √N · K_b with K_b = √(Σ (base_t·A_t)²) — and the ratio between the two is the
    // cosine between (base_t·A_t) and the square roots of your shares. 100% exactly at the
    // lead's optimum, at any march size, which is what lets the panel answer without a damage scale.
    get march() {
      const A = this.leadA(), n = [], q = [];
      let sum = 0, dot = 0, kk = 0;
      TYPES.forEach((ty, i) => {
        n[i] = Math.max(0, this.num('sim-n-' + ty.key));
        sum += n[i];
        q[i] = typeWeight(i, this.pick('sim-tier-' + ty.key, 10), this.pick('sim-tg-' + ty.key, 0)) * A[ty.key];
        dot += q[i] * Math.sqrt(n[i]);
        kk += q[i] * q[i];
      });
      const K = Math.sqrt(kk), share = q.map(x => kk > 0 ? (x * x) / kk : 0);
      const ok = sum > 0 && K > 0 && this.anyStat('sim-'), eff = ok ? dot / (Math.sqrt(sum) * K) : 0, rows = {};
      TYPES.forEach((ty, i) => { rows[ty.key] = { n: numFmt(n[i], 0), yours: pct(sum ? (n[i] / sum) * 100 : 0), ideal: pct(share[i] * 100) }; });
      return {
        ok, rows,
        headline: ok ? t('sim.dmg.headline', 'Your split converts <b>{eff}</b> of what these troops could do for this lead.', { eff: pct(eff * 100) })
          : t('sim.dmg.noStats', 'Fill in the lead’s stats above and your troop counts — the split needs both.'),
        ideal: ok ? t('sim.dmg.ideal', 'Split the lead’s way, that same march is <b>≈{inf}</b> infantry, <b>≈{cav}</b> cavalry, <b>≈{arc}</b> archers.',
          { inf: numFmt(Math.round(sum * share[0]), 0), cav: numFmt(Math.round(sum * share[1]), 0), arc: numFmt(Math.round(sum * share[2]), 0) }) : ''
      };
    },
    get totalLine() {
      const n = this.side('sim-').n, sum = total(n);
      return sum > 0 ? t('sim.march.total', 'March total <b>{n}</b> — {mix} as typed.', { n: numFmt(sum, 0), mix: '<span class="mix">' + mixText(n.map(x => x / sum)) + '</span>' }) : '';
    },

    // ── The rooms (Mystic Trial) ──
    today(key) { return ROOMS.find(r => r.key === key).days.includes(new Date().getUTCDay()); },
    pressed(key) { return String(this.room === key); },
    toggleRoom(key) { this.room = this.room === key ? null : key; this.save(); },
    get todayLine() {
      const open = ROOMS.filter(r => this.today(r.key)).map(roomName);
      return open.length ? t('sim.mystic.todayLine', 'Open today: <b>{rooms}</b>.', { rooms: '<span class="room-slot">' + escape(open.join(' · ')) + '</span>' }) : '';
    },
    // The room a sweep compares against: the one tapped, else today's only room (Monday's
    // Coliseum, Sunday's Spire), else none.
    activeRoom() {
      if (this.room) return ROOMS.find(r => r.key === this.room) || null;
      const today = ROOMS.filter(r => this.today(r.key));
      return today.length === 1 ? today[0] : null;
    },

    // ── The fight, as typed ──
    // Fought on every edit: a few hundred battles of a few dozen rounds is a few milliseconds.
    get fight() {
      const you = this.side('sim-'), foe = this.side('sim-foe-');
      if (!(total(you.n) > 0 && total(foe.n) > 0)) return { ready: false, headline: t('sim.fight.empty', 'Give both sides some troops — the fight needs two armies.'), rows: NO_ROWS };
      const key = JSON.stringify([you, foe]);
      if (fightMemo.key !== key) fightMemo = { key, r: E.run(you, foe, FIGHT_BATTLES, E.seedOf([you, foe])) };
      const r = fightMemo.r, vars = { win: pct0(r.win * 100), n: numFmt(r.battles, 0), rounds: numFmt(Math.round(r.rounds), 0) };
      const headline = !r.random
        ? r.win ? t('sim.fight.sure', 'You <b>win</b> — every time, in <b>{rounds}</b> rounds. Nothing in this fight is chance.', vars)
          : t('sim.fight.never', 'You <b>lose</b> — every time, in <b>{rounds}</b> rounds. Nothing in this fight is chance.', vars)
        : t('sim.fight.odds', 'You win <b>{win}</b> of {n} battles, in about <b>{rounds}</b> rounds.', vars);
      const row = (you, youLeft, them, themLeft) => ({ you: numFmt(you, 0), left: numFmt(Math.round(youLeft), 0), foe: numFmt(them, 0), foeLeft: numFmt(Math.round(themLeft), 0) });
      const rows = {};
      TYPES.forEach((ty, i) => { rows[ty.key] = row(r.startA[i], r.a[i], r.startB[i], r.b[i]); });
      rows.sum = row(total(r.startA), total(r.a), total(r.startB), total(r.b));
      return { ready: true, headline, rows };
    },
    // The active fight's headline, copied onto the phone's "see the answer" button.
    get peek() { return this.mode === 'bear-ratio' ? this.ratio.headline : this.mode === 'bear-damage' ? this.march.headline : this.fight.headline; },

    // ── The sweep — every mix of your march ──
    frac(id, fallback) { const v = parseFloat(this.f[id]); return isFinite(v) ? Math.min(1, Math.max(0, v / 100)) : fallback; },
    opts() {
      return {
        step: parseFloat(this.f['sim-sw-step']) || 0.05,
        battles: parseInt(this.f['sim-sw-battles'], 10) || 50,
        minInf: this.frac('sim-sw-mininf', 0), maxInf: this.frac('sim-sw-maxinf', 1),
        minCav: this.frac('sim-sw-mincav', 0), maxCav: this.frac('sim-sw-maxcav', 1),
        total: TYPES.reduce((sum, ty) => sum + Math.max(0, Math.floor(this.num('sim-n-' + ty.key))), 0)
      };
    },
    // The mix is what the sweep varies, so only the total enters the key.
    sweepKey(you, foe, o) { return JSON.stringify([Object.assign({}, you, { n: [o.total] }), foe, o]); },
    get cells() { return E.grid(this.opts()).cells.length; },
    // An option that would push the sweep past the cap is switched off.
    fits(battles) { const cells = this.cells; return !cells || cells * battles <= SWEEP_CAP; },
    fitBattles() {
      const fit = BATTLE_CHOICES.filter(b => this.fits(b)).pop();
      if (fit && !this.fits(parseInt(this.f['sim-sw-battles'], 10))) { this.f['sim-sw-battles'] = String(fit); this.save(); }
    },
    get sweepSize() {
      const cells = this.cells;
      return cells ? t('sim.sweep.size', '{mixes} mixes × {battles} battles', { mixes: numFmt(cells, 0), battles: numFmt(this.opts().battles, 0) }) : t('sim.sweep.none', 'no mix fits those limits');
    },
    get noteClass() { return this.note ? this.note[2] : ''; },
    get noteText() { return this.note ? t(this.note[0], this.note[1]) : ''; },
    ready(o, foe) { return o.total > 0 && total(foe.n) > 0 && E.grid(o).cells.length > 0; },
    // `fresh` is a reader's tap: it reports missing troops and brings the answer into view. A
    // re-run after an edit does neither.
    sweep(fresh) {
      if (this.busy) { again = true; return; }
      const you = this.side('sim-'), foe = this.side('sim-foe-'), o = this.opts();
      if (!this.ready(o, foe)) {
        if (fresh) this.note = ['sim.fight.empty', 'Give both sides some troops — the fight needs two armies.', 'bad'];
        return;
      }
      this.note = null;
      const key = this.sweepKey(you, foe, o);
      o.seed = E.seedOf([you.tier, you.tg, you.atk, you.let, you.def, you.hea, you.skills, foe, o.total]);
      this.busy = true;
      again = false;
      const started = performance.now(), mixes = E.grid(o).cells.length, planned = mixes * o.battles;
      const report = (phase, done, battles) => { this.run = { phase, done, of: mixes, battles, planned, ms: performance.now() - started }; };
      report('start', 0, 0);
      this.runSweep(you, foe, o, (done, of, battles) => report('progress', done, battles)).then(result => {
        lastSweep = { key, result, you, foe, opts: o };
        this.busy = false;
        this.rev++;
        report('done', result.cells.length, result.battles);
        if (fresh) this.reveal++;
      }, err => {
        if (globalThis.console && console.error) console.error('[sim-sweep]', (err && err.message) || err);
        report('fail', 0, 0);
        this.note = ['sim.sweep.fail', 'The sweep stopped before it finished. Try a coarser grid.', 'bad'];
      }).then(() => {
        this.busy = false;
        if (again) this.queue();
      });
    },
    // The worker keeps a long sweep off the page's thread. If it cannot start (an old browser,
    // a blocked file:// worker), the same engine runs here.
    runSweep(you, foe, o, onProgress) {
      return new Promise((resolve, reject) => {
        const id = ++seq;
        const local = () => {
          try {
            const g = E.grid(o), cells = [];
            let battles = 0, c = 0;
            const batch = () => {
              try {
                const until = performance.now() + 25;
                while (c < g.cells.length && performance.now() < until) {
                  const cell = g.cells[c], f = cell.map(v => v / g.k);
                  const ni = Math.round(o.total * cell[0] / g.k), nc = Math.round(o.total * cell[1] / g.k);
                  const n = [ni, nc, Math.max(0, o.total - ni - nc)];
                  const r = E.run(Object.assign({}, you, { n }), foe, o.battles, (o.seed || 1) + c * 7919);
                  cells.push({ cell, f, n, win: r.win, left: total(r.a), foe: total(r.b), rounds: r.rounds });
                  battles += r.battles;
                  c++;
                }
                onProgress(c, g.cells.length, battles);
                if (c < g.cells.length) setTimeout(batch, 0);
                else resolve({ k: g.k, total: o.total, cells, battles });
              } catch (err) { reject(err); }
            };
            batch();
          } catch (e) { reject(e); }
        };
        try { if (!worker) worker = new Worker(options.worker); }
        catch (e) { worker = null; setTimeout(local, 30); return; }
        worker.onmessage = e => {
          const m = e.data || {};
          if (m.id !== id) return;
          if (m.type === 'progress') onProgress(m.done, m.of, m.battles);
          else if (m.type === 'done') resolve(m.result);
          else if (m.type === 'error') reject(new Error(m.error));
        };
        worker.onerror = e => {
          if (e && e.preventDefault) e.preventDefault();
          try { worker.terminate(); } catch (err) { /* already gone */ }
          worker = null;
          setTimeout(local, 30);
        };
        worker.postMessage({ id, you, foe, opts: o });
      });
    },
    // Once a sweep has answered, an edit to either army re-runs it: the result follows the
    // sheet instead of going stale. Bear modes never sweep.
    queue() {
      clearTimeout(queueTimer);
      if (!lastSweep || !this.shows('fight')) return;
      const you = this.side('sim-'), foe = this.side('sim-foe-'), o = this.opts();
      if (!this.ready(o, foe) || this.sweepKey(you, foe, o) === lastSweep.key) return;
      if (this.busy) { again = true; return; }
      queueTimer = setTimeout(() => this.sweep(false), 700);
    },
    // The run meter: the bar's steps and the live line, then the totals.
    get meter() {
      const d = this.run;
      if (!d) return '';
      const n = (v, digits) => numFmt(v, digits || 0), seconds = Math.max(0.001, d.ms / 1000), rate = d.battles / seconds;
      if (d.phase === 'done') return t('sim.review.metrics', '{battles} battles · {rate}/s · {seconds}s', { battles: n(d.battles), rate: n(Math.round(rate)), seconds: n(seconds, 1) });
      // Time left from the pace so far; blank until the first mix lands.
      const left = d.done > 0 ? seconds * (d.of - d.done) / d.done : NaN;
      return t('sim.run.live', '{battles} of {planned} battles · {rate}/s · about {left}s left', {
        battles: n(d.battles), planned: n(d.planned), rate: d.battles ? n(Math.round(rate)) : '—', left: isFinite(left) ? n(Math.ceil(left)) : '—'
      });
    },
    get runState() { return !this.run ? null : this.run.phase === 'done' || this.run.phase === 'fail' ? 'done' : 'running'; },
    get barMax() { return Math.max(1, (this.run && this.run.of) || 0); },
    get barValue() { return Math.min(this.barMax, (this.run && this.run.done) || 0); },
    get runHidden() { return !this.run || this.run.phase === 'fail'; },

    // The last sweep, dimmed while a re-run is under way or the sheet has moved on.
    get swept() { this.rev; return !!lastSweep; },
    get stale() { this.rev; return !!lastSweep && (this.busy || this.sweepKey(this.side('sim-'), this.side('sim-foe-'), this.opts()) !== lastSweep.key); },
    get best() { this.rev; return lastSweep ? E.best(lastSweep.result.cells) : null; },
    get bestLine() {
      const top = this.best;
      if (!top) return '';
      const vars = {
        mix: '<span class="mix">' + mixText(top.f) + '</span>', win: pct0(top.win * 100),
        inf: numFmt(top.n[0], 0), cav: numFmt(top.n[1], 0), arc: numFmt(top.n[2], 0), left: numFmt(Math.round(top.left), 0)
      };
      return top.win > 0
        ? t('sim.sweep.best', 'Best mix <b>{mix}</b> — it wins <b>{win}</b> of the time: <b>{inf}</b> infantry, <b>{cav}</b> cavalry, <b>{arc}</b> archers, about {left} left standing.', vars)
        : t('sim.sweep.noWin', 'No mix wins yet. The closest is <b>{mix}</b> — the system the room checks needs upgrading before the stage falls.', vars);
    },
    // The room picked (or today's only room), fought at its own starting ratio on the same
    // total — the community line, tested.
    get roomFight() {
      this.rev;
      const room = this.activeRoom();
      if (!lastSweep || !room) return null;
      const key = room.key + '|' + lastSweep.key;
      if (roomMemo.key !== key) {
        const f = room.start.map(x => x / 100), o = lastSweep.opts, side = JSON.parse(JSON.stringify(lastSweep.you));
        const ni = Math.round(o.total * f[0]), nc = Math.round(o.total * f[1]);
        side.n = [ni, nc, Math.max(0, o.total - ni - nc)];
        roomMemo = { key, room: { f, win: E.run(side, lastSweep.foe, o.battles, o.seed + 104729).win } };
      }
      return Object.assign({ name: roomName(room) }, roomMemo.room);
    },
    get roomLine() {
      const room = this.roomFight;
      return room ? t('sim.sweep.room', 'The <b>{room}</b> starting ratio, <b>{mix}</b>, wins <b>{win}</b> of the time on this stage.',
        { room: '<span class="room-slot">' + escape(room.name) + '</span>', mix: '<span class="mix">' + mixText(room.f) + '</span>', win: pct0(room.win * 100) }) : '';
    },
    get ranked() {
      this.rev;
      if (!lastSweep) return [];
      return lastSweep.result.cells.slice().sort((a, b) => b.win - a.win || b.left - a.left || a.foe - b.foe).slice(0, 5)
        .map((c, i) => ({ i, mix: mixText(c.f), win: pct0(c.win * 100), left: numFmt(Math.round(c.left), 0) }));
    },
    // Every mix on one ruled grid, as the triangle's markup.
    get triangle() {
      this.rev;
      if (!lastSweep) return '';
      const result = lastSweep.result, top = this.best, room = this.roomFight;
      const size = Math.max(3, (TRI.arc[0] - TRI.cav[0]) / result.k * 0.62);
      let out = svg('polygon', { class: 'tri-frame', points: [TRI.inf, TRI.cav, TRI.arc].map(p => p.join(',')).join(' ') });
      result.cells.forEach(c => {
        const p = triPoint(c.f);
        out += '<rect class="tri-cell" x="' + (p[0] - size / 2).toFixed(1) + '" y="' + (p[1] - size / 2).toFixed(1) + '" width="' + size.toFixed(1) + '" height="' + size.toFixed(1) +
          '" fill-opacity="' + (0.08 + 0.92 * c.win).toFixed(3) + '">' + svg('title', {}, mixText(c.f) + ' — ' + pct0(c.win * 100)) + '</rect>';
      });
      if (room) {
        const rp = triPoint(room.f);
        out += svg('circle', { class: 'tri-room', cx: rp[0].toFixed(1), cy: rp[1].toFixed(1), r: (size * 0.9).toFixed(1) });
      }
      if (top) {
        const bp = triPoint(top.f);
        out += svg('rect', { class: 'tri-best', x: (bp[0] - size).toFixed(1), y: (bp[1] - size).toFixed(1), width: (size * 2).toFixed(1), height: (size * 2).toFixed(1) });
        out += svg('text', { class: 'tri-fleuron', x: (bp[0] + size * 1.3).toFixed(1), y: (bp[1] + 4).toFixed(1) }, '❧');
      }
      out += svg('text', { class: 'tri-label', x: TRI.inf[0], y: TRI.inf[1] - 8, 'text-anchor': 'middle' }, t('sim.calc.inf', 'Infantry'));
      out += svg('text', { class: 'tri-label', x: TRI.cav[0], y: TRI.cav[1] + 22, 'text-anchor': 'start' }, t('sim.calc.cav', 'Cavalry'));
      out += svg('text', { class: 'tri-label', x: TRI.arc[0], y: TRI.arc[1] + 22, 'text-anchor': 'end' }, t('sim.calc.arc', 'Archery'));
      return out;
    },

    // ── Saving the sheet ──
    edited() { this.save(); this.queue(); },
    save() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const out = Object.assign({ room: this.room || '' }, this.f);
        try { localStorage.setItem(SHEET_KEY, JSON.stringify(out)); } catch (e) { /* private mode, full storage */ }
      }, 250);
    },
    put(id, value) { if (value !== undefined && value !== null) this.f[id] = String(value); },

    // ── A battle report from the import panel ──
    // The site-wide screenshot import reads the report and, once reviewed, hands its values to
    // the sheet: { values: { fieldId: n }, before }. A side's total ('sim-n-total',
    // 'sim-foe-n-total') is shared out in the mix already typed; with nothing typed there is no
    // mix to keep. `before` gets what each field held, so the panel can undo.
    imported(detail) {
      const values = Object.assign({}, detail.values), before = detail.before;
      [['sim-n-total', 'sim-n-'], ['sim-foe-n-total', 'sim-foe-n-']].forEach(([key, prefix]) => {
        const whole = values[key];
        delete values[key];
        if (!(whole > 0)) return;
        const ids = TYPES.map(ty => prefix + ty.key);
        if (ids.some(id => values[id] !== undefined)) return;
        const now = ids.map(id => Math.max(0, this.num(id))), sum = total(now);
        if (!sum) return;
        let given = 0;
        ids.forEach((id, i) => { const n = i < ids.length - 1 ? Math.round(whole * now[i] / sum) : whole - given; values[id] = n; given += n; });
      });
      Object.keys(values).forEach(id => {
        const v = values[id];
        if (!(id in this.f) || v === '' || v === null || !isFinite(v)) return;
        before[id] = this.f[id];
        this.f[id] = String(/-n-/.test(id) ? Math.round(v) : Math.round(v * 10) / 10);
      });
      this.edited();
    },

    // ── Your player save (PLAYER-LEDGER.md) ──
    // Only the fight modes show it: a bear report's left column is the rally lead's, not yours.
    get combat() { Alpine.store('ledger').v; try { return ledger().combat(); } catch (e) { return null; } },
    get saveStatus() {
      const data = this.combat;
      if (!data) return '';
      const types = Object.keys(data.stats).length, troops = data.troops.reduce((sum, row) => sum + row.amount, 0);
      // Four states, four keys: neither, stats only, troops only, both.
      const key = types && troops ? 'sim.ledger.has' : types ? 'sim.ledger.hasStats' : troops ? 'sim.ledger.hasTroops' : 'sim.ledger.empty';
      let text = t(key, '', { types: words.fmt(types), troops: words.fmt(troops) });
      if (this.ledgerNote) text += ' ' + t('sim.ledger.' + this.ledgerNote, '');
      return text;
    },
    get nothingSaved() { const data = this.combat; return !data || (!Object.keys(data.stats).length && !data.troops.some(row => row.amount)); },
    get sealText() { return this.sealed === null ? '' : this.sealed === 'saved' ? t('sim.ledger.saved', 'Saved') : t('sim.ledger.notSaved', 'Not saved'); },
    // Your stats per type, and the best tier you own per type: a march fights at one tier per
    // type. Returns whether the save had anything.
    load() {
      const data = this.combat;
      if (!data) return false;
      let any = false;
      TYPES.forEach(ty => {
        const row = data.stats[ty.key];
        if (row) { any = true; STATS.forEach(s => this.put('sim-' + s.key + '-' + ty.key, row[s.save])); }
        const best = data.troops.find(r => r.type === ty.key);
        if (!best) return;
        any = true;
        this.put('sim-tier-' + ty.key, best.tier); this.put('sim-tg-' + ty.key, best.tg); this.put('sim-n-' + ty.key, best.amount);
      });
      if (any) this.edited();
      return any;
    },
    loadMine() { if (this.load()) this.ledgerNote = 'loaded'; },
    // Your stats (when any are entered), and each march row as the troops you have at that tier.
    store() {
      let bag = {}, entered = false;
      const troops = [];
      TYPES.forEach(ty => STATS.forEach(s => {
        let v = parseFloat(this.f['sim-' + s.key + '-' + ty.key]);
        v = isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
        if (v > 0) entered = true;
        (bag[ty.key] = bag[ty.key] || {})[s.save] = v;
      }));
      TYPES.forEach(ty => {
        const n = Math.floor(parseFloat(this.f['sim-n-' + ty.key]));
        if (isFinite(n) && n > 0) troops.push({ type: ty.key, tier: +this.f['sim-tier-' + ty.key], tg: +this.f['sim-tg-' + ty.key], amount: n });
      });
      if (!entered) bag = {};
      if (!troops.length && !entered) return false;
      ledger().setCombat({ stats: bag, troops }, 'manual');
      return true;
    },
    saveMine() {
      let ok = false;
      try { ok = this.store(); } catch (e) { ok = false; }
      this.ledgerNote = ok ? null : 'failed';
      this.sealed = ok ? 'saved' : 'failed';
    }
  };
});
