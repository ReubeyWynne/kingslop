/* The Vikings planner: one alliance per device, its sign-ups, marches and HQ, against the
   planner API (api/). vikings-vengeance/index.html binds to it with x-data="vikings"; the
   dialog's forms, the player rows and the march rows are includes beside it
   (_includes/vikings-*.html). Every view is worked out here from `state`; the markup only
   shows it. The planner reads your troops from the save the page works on ($store.ledger)
   and writes a changed count back where the save keeps that troop in one tier. */
import { Alpine } from '../alpine.mjs';
import E from '../vikings-engine.mjs';

const API = 'https://kingslop.reubeycw.workers.dev';
const ALLIANCE = 'bh:vikings-alliance:v1', LINKS = 'bh:vikings-links:v1', LAST = 'bh:vikings-last:v1', TIME = 'bh:vikings-time:v1';
const TYPES = E.types, LABELS = { infantry: 'Infantry', cavalry: 'Cavalry', archers: 'Archers' };
const SYMBOLS = { infantry: 'inf', cavalry: 'cav', archers: 'arc' }, ART = { infantry: 'barracks', cavalry: 'stable', archers: 'range' };
const TROOPS = TYPES.map(k => ({ k, label: LABELS[k], art: '../img/buildings/' + ART[k] + '.webp', href: '#troop-' + SYMBOLS[k] }));
// Short links name their role so a player can tell them apart in chat; the server decides the role from the code.
const PREFIX = { manage: 'lead', join: 'join', view: 'view', registration: 'me' }, ROLES = { manage: 'Leader', join: 'Member', view: 'Viewer', registration: 'Member' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, CODE = /^(?:[A-Za-z0-9_-]{22}|[A-Za-z0-9_-]{43})$/, DAY = 86400000, K = 1000;
const PRESENCE = { online: 'Online', offline: 'Offline', unknown: 'Online?' };
// One alliance per device, held by the strongest link opened for it: a leader link also signs up and views,
// a sign-up link also views. The device's own sign-up rides beside it as `player`.
const RANK = { view: 1, join: 2, registration: 2, manage: 3 };
const GUEST = new URLSearchParams(location.search).has('guest');

function read(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; } }
function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } }
function drop(key) { try { localStorage.removeItem(key); } catch (_) {} }
const total = p => E.sum(p);
function id() { if (crypto.randomUUID) return crypto.randomUUID(); const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128; const h = Array.from(b, n => n.toString(16).padStart(2, '0')).join(''); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20); }
const dayLabel = ms => new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const utcDay = ms => Math.floor(ms / DAY) * DAY;
function until(ms) { const d = Math.round((utcDay(ms) - utcDay(Date.now())) / DAY); return d === 0 ? 'today' : d === 1 ? 'tomorrow' : d > 1 ? 'in ' + d + ' days' : d === -1 ? 'yesterday' : -d + ' days ago'; }
const utcTime = ms => new Date(ms).toISOString().slice(11, 16);
function utcWhen(iso) { const t = Date.parse(iso); return dayLabel(t) + ' ' + utcTime(t) + ' UTC'; }
const localWhen = iso => new Date(iso).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' });
// Troops show as 240k or 1.2M. A player's own counts use the site's unit inputs (js/unit-input.js), thousands
// until they pick another unit; the leader's march editor works in thousands.
function kfmt(n) { n = n || 0; return n >= 1e6 ? +(n / 1e6).toFixed(2) + 'M' : n >= K ? Math.round(n / K).toLocaleString() + 'k' : String(n); }
const toK = n => n == null || n === '' ? '' : +(n / K).toFixed(1);
const fromK = v => Math.round(Number(v) * K);
const text = v => v == null ? '' : String(v);
const count = v => v === '' ? NaN : Number(v);
function ago(iso) {
  const t = Date.parse(iso); if (!t) return '';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago';
}
function stored() {
  let c = read(ALLIANCE);
  if (c && UUID.test(c.planId) && CODE.test(c.code) && RANK[c.role]) return c;
  // Saved by an earlier version as a list of links: keep the leader link if there was one, with this device's sign-up.
  let old = read(LINKS); if (!Array.isArray(old)) return null;
  old = old.filter(o => o && UUID.test(o.planId) && CODE.test(o.code) && RANK[o.role]);
  const pick = old.find(o => o.role === 'manage') || old.find(o => o.role === 'registration'); if (!pick) return null;
  const own = old.find(o => o.planId === pick.planId && o.role === 'registration');
  c = { planId: pick.planId, code: pick.code, role: pick.role, codes: pick.codes, name: pick.name, player: own ? { id: own.id || null, code: own.code } : pick.self ? { id: pick.self, code: null } : null };
  write(ALLIANCE, c); drop(LINKS); drop(LAST); return c;
}
function parseLink(value) {
  const t = String(value || '').trim(), short = /#(?:lead|join|view|me)-([A-Za-z0-9_-]{22}|[A-Za-z0-9_-]{43})\s*$/.exec(t), long = /#access=([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})\s*$/.exec(t);
  if (short) return { planId: null, code: short[1] };
  if (long && UUID.test(long[1])) return { planId: long[1], code: long[2] };
  return null;
}
const shareUrl = (role, code) => new URL('../vv/#' + PREFIX[role] + '-' + code, location.href).href;
// A march as the march rows show it (_includes/vikings-march.html).
const march = (row, label, note, plain) => ({ queue: row.queue, hq: row.destination === 'hq', label, total: kfmt(total(row)), row, note: note || '', plain: !!plain });
const ledger = () => globalThis.PlayerLedger.current();

Alpine.data('vikings', api => {
  const ROOT = api || API;
  let timer = null, disposed = false;
  return {
    troops: TROOPS,
    state: null, credential: null, pending: null, mode: 'my-plan', busy: false, opened: false,
    message: '', error: false,
    dialog: null, dialogMessage: '',
    // Each dialog's form keeps its own model, so swapping one dialog for another never hands a form the wrong shape.
    forms: { player: null, room: null, sends: null, hq: null, link: '' },
    answer: null, typing: false, focused: null,
    // Counts renders of the plan: the folded lists close again on each, as the plan is drawn afresh.
    renders: 0,
    calc: { infantry: '', cavalry: '', archers: '', marchCapacity: '', marches: '5' }, split: null,

    init() {
      Alpine.effect(() => { Alpine.store('ledger').v; queueMicrotask(() => this.fillCalculator()); });
      // A link just followed wins; otherwise the alliance this phone keeps.
      const initial = globalThis.VikingsAccess, mine = stored();
      this.render();
      // The head script hides the start screen while a remembered plan opens, so the page doesn't jump.
      const opening = c => this.run(async () => { try { await this.open(c.c, c.fromLink); } finally { this.opened = true; } });
      if (initial && CODE.test(initial.code) && (initial.planId === null || UUID.test(initial.planId))) opening({ c: Object.assign({}, initial), fromLink: !!initial.fromLink });
      else if (mine) opening({ c: Object.assign({}, mine), fromLink: false });
      else this.opened = true;
      this.schedule(30000);
    },
    destroy() { disposed = true; clearTimeout(timer); },

    /* ---- reading the plan ---- */
    get viewer() { return !!this.state && this.state.access === 'view'; },
    get manager() { return !!this.state && this.state.access === 'manage'; },
    get me() { const s = this.state; return s && s.registrationId ? s.roster.find(r => r.id === s.registrationId) : null; },
    get when() { return this.state.plan.eventAt ? dayLabel(Date.parse(this.state.plan.eventAt)) : 'the next Vikings'; },
    name(playerId) { const p = ((this.state && this.state.roster) || []).find(r => r.id === playerId); return p ? p.nickname : 'Player removed'; },
    presence: p => PRESENCE[p.availability] || PRESENCE.unknown,
    counts: p => TROOPS.map(t => ({ href: t.href, text: ' ' + kfmt(p[t.k]), label: kfmt(p[t.k]) + ' ' + t.label })),
    ago,
    // Tuesday and Thursday of one fortnight are alternatives; a later fortnight is the one after.
    get nextLine() {
      if (this.state) return null;
      const days = E.eventDays(Date.now(), 2), pair = days[1] - days[0] <= 2 * DAY;
      return { when: pair ? dayLabel(days[0]) + ' or ' + dayLabel(days[1]) : dayLabel(days[0]), dim: until(days[0]) + (pair ? '' : ' · then ' + dayLabel(days[1])) };
    },
    get bar() {
      const s = this.state; if (!s) return null;
      const mine = this.me, at = s.plan.eventAt;
      return { label: s.example ? 'Example' : ROLES[s.access] + (mine ? ' · ' + mine.nickname : ''), name: s.plan.name, utc: at ? utcWhen(at) : 'No day set', local: at ? localWhen(at) + ' your time · ' + until(Date.parse(at)) : '', setIt: !at && this.manager };
    },
    // The same tab for everyone who can sign up, leaders included.
    get personal() {
      const s = this.state; if (!s || s.access === 'view') return { kind: 'none' };
      const mine = this.me, asking = 'In for ' + this.when + '?';
      if (!mine) {
        if (s.access === 'registration') return { kind: 'flag', heading: asking, flag: 'You’re no longer on the list. Ask your leader for the sign-up link.' };
        if (s.plan.closed && !this.manager) return { kind: 'flag', heading: asking, flag: 'Sign-ups are closed. Ask your leader to add you.' };
        return { kind: 'answer', heading: asking };
      }
      if (mine.attending === null) return { kind: 'answer', heading: asking, lede: 'Your troops from last time. Change anything that’s moved.' };
      if (mine.attending === false) return { kind: 'out', heading: 'You’re out for ' + this.when, lede: 'Your leader plans without you. Changed your mind? Sign up again before it starts.' };
      return { kind: 'marches', heading: 'Your marches' };
    },
    // Your marches, or the empty queues while nothing is set, so the tab has the same shape it will have.
    get plan() {
      const s = this.state, p = this.me, rows = (s.assignments[p.id] || []).filter(r => r.destination && total(r));
      if (!rows.length) return { waiting: true, lede: this.manager ? 'Not set yet.' : 'Not set yet. Your leader will fill these in before ' + this.when + '.', slots: Array.from({ length: p.marches || 0 }, (_, i) => ({ q: i + 1, cap: kfmt(E.capacity(p, i + 1)) + ' march' })) };
      const used = { infantry: 0, cavalry: 0, archers: 0 }; rows.forEach(r => TYPES.forEach(k => { used[k] += r[k]; }));
      const home = {}; TYPES.forEach(k => { home[k] = Math.max(0, p[k] - used[k]); });
      // Exact counts matter when troops stay home; otherwise even marches with everything in them are the plan.
      const even = !total(home) && TYPES.every(k => { const v = rows.map(r => r[k]); return Math.max(...v) - Math.min(...v) <= K; });
      const lede = even ? 'Send everything, split evenly across ' + rows.length + ' march' + (rows.length === 1 ? '' : 'es') + '.' : kfmt(total(used)) + ' out' + (total(home) ? ' · ' + kfmt(total(home)) + ' stay home' : '') + '. Send these exact numbers.';
      const h = E.hqRows(s.hq || E.emptyHQ()).find(r => r.playerId === p.id);
      // Members see who covers them; how many troops is the sender's and the leader's business.
      const cover = [];
      Object.keys(s.assignments).forEach(sender => (s.assignments[sender] || []).forEach(r => { if (r.destination === p.id && (r.infantry == null || total(r))) cover.push({ name: this.name(sender), total: r.infantry == null ? null : kfmt(total(r)) }); }));
      return {
        waiting: false, lede, marches: rows.map(r => march(r, this.name(r.destination), null, even)), cover,
        hq: h ? march({ queue: h.queue, destination: 'hq', infantry: h.infantry, cavalry: h.cavalry, archers: h.archers }, 'Alliance HQ', 'After wave 9 and 19: recall march ' + h.queue + ', send this, return it after the hit.') : null
      };
    },
    get bringing() { const p = this.me; return p.marches + ' marches' + (p.capacities && p.capacities.length ? '' : ' of ' + kfmt(p.marchCapacity)); },
    get team() {
      const s = this.state; if (!s) return null;
      const inn = s.roster.filter(p => p.attending), waiting = s.roster.filter(p => p.attending === null), out = s.roster.filter(p => p.attending === false);
      const sentOf = p => (s.assignments[p.id] || []).filter(r => r.destination && total(r)).length;
      const check = E.validate(inn, s.assignments, s.hq), codes = (this.credential && this.credential.codes) || {}, hq = s.hq;
      return {
        inn, waiting, out, check,
        queues: inn.reduce((n, p) => n + p.marches, 0), sent: inn.reduce((n, p) => n + sentOf(p), 0),
        joinText: codes.join ? this.shareText('join', codes.join) : '',
        hqLine: hq.participants.length ? hq.participants.length + ' players · ' + kfmt(hq.capacity) + ' · ' + hq.infantryPercent + '/' + hq.cavalryPercent + '/' + (100 - hq.infantryPercent - hq.cavalryPercent) : 'Not set'
      };
    },
    routes(p) { return (this.state.assignments[p.id] || []).filter(r => r.destination && (r.infantry == null || total(r))); },
    // Who sends where, without troop counts: what members and viewers see of the alliance.
    routeLine(p) {
      const to = this.routes(p).map(r => this.name(r.destination)), from = this.state.roster.filter(o => o.id !== p.id && this.routes(o).some(r => r.destination === p.id)).map(o => o.nickname);
      return (to.length ? 'Sends to ' + to.join(', ') : 'No marches yet') + (from.length ? ' · covered by ' + from.join(', ') : '');
    },
    rowLine(p) {
      const sent = (this.state.assignments[p.id] || []).filter(r => r.destination && total(r)).length, incoming = this.team.check.incoming[p.id] || [];
      return kfmt(total(p)) + ' · sends ' + sent + '/' + p.marches + ' · covered by ' + incoming.length;
    },
    gaps(p) {
      if (!p.attending) return '';
      const sent = (this.state.assignments[p.id] || []).filter(r => r.destination && total(r)).length, incoming = this.team.check.incoming[p.id] || [], gaps = [];
      if (!incoming.length) gaps.push('no cover'); if (sent < p.marches) gaps.push(p.marches - sent + ' free');
      return gaps.join(' · ');
    },
    // Two players can share a name; when each last saved tells a leader which entry is which.
    stamp: p => 'Signed up ' + new Date(p.createdAt).toLocaleString() + ', last saved ' + new Date(p.updatedAt).toLocaleString(),
    shareText(role, code) {
      const url = shareUrl(role, code);
      if (role === 'join') return 'Vikings' + (this.state.plan.eventAt ? ' ' + utcWhen(this.state.plan.eventAt) : '') + ': in? Tap and confirm your troops ' + url;
      if (role === 'view') return 'Vikings marches: ' + url;
      return url;
    },
    get shareRows() {
      const codes = (this.credential && this.credential.codes) || {};
      return [['join', 'Sign-up', 'for alliance chat'], ['view', 'Viewing', 'who goes where'], ['manage', 'Leader', 'for R4s']].map(([role, title, note]) => {
        const code = role === 'manage' ? this.credential.code : codes[role];
        return { role, title, note, code, text: code ? this.shareText(role, code) : '' };
      });
    },
    get localTime() { const t = this.forms.room && this.forms.room.time; return t ? localWhen('2026-01-01T' + t + ':00Z') + ' your time' : ''; },

    /* ---- your troops in the save ---- */
    /* Your own troops follow the save the page works on: read from it, and written back where the save has one
       tier of that troop. Guest mode (?guest) leaves the save alone. */
    fromSave() {
      Alpine.store('ledger').v;
      if (GUEST) return null;
      let troops; try { troops = ledger().combat().troops; } catch (_) { return null; }
      const out = { totals: {}, rows: {} }, map = { inf: 'infantry', cav: 'cavalry', arc: 'archers' }; let any = false;
      TYPES.forEach(k => { out.totals[k] = null; out.rows[k] = []; });
      troops.forEach(t => { const k = map[t.type]; if (!k || !Number.isFinite(t.amount)) return; out.totals[k] = (out.totals[k] || 0) + t.amount; out.rows[k].push(t); any = true; });
      return any ? out : null;
    },
    get sync() {
      if (GUEST) return { text: 'Guest mode: your saved troops aren’t used. ', link: 'Leave guest mode', href: location.pathname + location.search.replace(/[?&]guest(=[^&]*)?/, '').replace(/^&/, '?') };
      return this.fromSave() ? { text: 'Synced with your saved troops. ', link: 'Guest mode', href: location.pathname + '?guest' } : null;
    },
    syncBack(data) {
      const save = this.fromSave(), list = [], tiers = []; if (!save) return '';
      TYPES.forEach(k => {
        if (save.totals[k] === null || data[k] === save.totals[k]) return;
        if (save.rows[k].length === 1) { const t = save.rows[k][0]; list.push({ type: t.type, tier: t.tier, tg: t.tg, amount: data[k] }); } else tiers.push(LABELS[k].toLowerCase());
      });
      if (list.length) try { ledger().setCombat({ troops: list }, 'manual'); } catch (_) { return 'Your save couldn’t be updated.'; }
      return tiers.length ? 'Your save splits ' + tiers.join(' and ') + ' by tier, so change it there too.' : '';
    },
    fillCalculator() {
      const save = this.fromSave(); if (!save) return;
      TYPES.forEach(k => { if (save.totals[k] !== null && this.focused !== k) this.calc[k] = String(save.totals[k]); });
    },
    // A player's troops, march size and marches as a form's model, quick to change. Your own start from the save.
    playerModel(p, withName, own) {
      if (own) { const save = this.fromSave(); if (save) { p = Object.assign({}, p); TYPES.forEach(k => { if (save.totals[k] !== null) p[k] = save.totals[k]; }); } }
      return { id: p.id || '', withName, own: !!own, nickname: p.nickname || '', availability: p.availability || 'unknown', infantry: text(p.infantry), cavalry: text(p.cavalry), archers: text(p.archers), marchCapacity: text(p.marchCapacity), marches: String(p.marches || 5), garrisonCapacity: text(p.garrisonCapacity) };
    },
    fromModel(m) {
      const data = { nickname: m.nickname, availability: m.availability, marches: Number(m.marches) };
      TYPES.concat('marchCapacity').forEach(k => { data[k] = count(m[k]); });
      const garrison = count(m.garrisonCapacity); data.garrisonCapacity = isNaN(garrison) ? null : garrison;
      return data;
    },

    /* ---- the view's state ---- */
    // Forms on the page start again from the plan whenever it changes, as the planner shows it.
    render() {
      const kind = this.personal.kind, mine = this.me;
      this.answer = kind === 'answer' ? this.playerModel(mine || { marches: 5 }, !mine, true) : null;
      this.renders++; this.tab(this.mode);
    },
    tab(next) {
      // Viewers only see the alliance.
      if (this.viewer && next === 'my-plan') next = 'alliance-plan';
      this.mode = next;
    },
    // Arrow keys move between the two tabs; the markup focuses the one this returns.
    flip(to) { this.tab(to || (this.mode === 'my-plan' ? 'alliance-plan' : 'my-plan')); return this.mode; },
    say(message, error) { this.message = message; this.error = !!error; if (this.dialog) this.dialogMessage = error ? message : ''; },
    modal(kind, title, extra) { this.dialog = Object.assign({ kind, title }, extra); this.dialogMessage = ''; },
    close() { this.dialog = null; },
    // A select a leader opens for a march still unsent opens its list too, where the browser allows it.
    reveal(select, row) { row.focus = false; this.$nextTick(() => { select.focus(); try { select.showPicker(); } catch (e) { /* not every browser opens a select from script */ } }); },

    /* ---- talking to the planner ---- */
    persist() { const c = this.credential; return !!c && write(ALLIANCE, Object.assign({}, c, { name: this.state ? this.state.plan.name : c.name })); },
    // Reads use the player's own code when there is one, so a member sees their own troops in full.
    readToken() { const c = this.credential; return c.role !== 'manage' && c.player && c.player.code ? c.player.code : c.code; },
    expected() { const s = this.state; return { revision: s.revision, rosterRevision: s.rosterRevision, planRevision: s.planRevision }; },
    async request(path, method, data, token) {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000), bearer = token || (this.credential && this.credential.code);
      try {
        const response = await fetch(ROOT + path, { method: method || 'GET', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal, headers: Object.assign({}, bearer ? { Authorization: 'Bearer ' + bearer } : {}, data ? { 'Content-Type': 'application/json' } : {}), body: data ? JSON.stringify(data) : undefined });
        const result = response.status === 204 ? null : await response.json();
        if (!response.ok) { const error = new Error((result && result.error) || 'That didn’t save. Try again.'); error.status = response.status; throw error; }
        return result;
      } catch (cause) { if (cause.name === 'AbortError') throw new Error('Timed out. Refresh to check whether it saved.'); throw cause; }
      finally { clearTimeout(timeout); }
    },
    async run(fn) {
      if (this.busy) return;
      this.busy = true;
      try { await fn(); }
      catch (cause) { this.say(cause.message || 'Can’t reach the planner. Showing the last copy.', true); }
      finally { this.busy = false; }
    },
    async load() {
      const c = this.credential, planId = c.planId, token = this.readToken(); let data, board;
      try { data = await this.request('/v1/plans/' + planId, 'GET', null, token); board = await this.request('/v1/plans/' + planId + '/board', 'GET', null, token); }
      catch (cause) {
        // A sign-up the leader removed takes its code with it; carry on with the alliance link.
        if (cause.status === 401 && token !== c.code) { c.player = null; this.persist(); return this.load(); }
        throw cause;
      }
      if (disposed || this.credential !== c || c.planId !== planId) return;
      if (c.player && !c.player.id) c.player.id = data.registrationId || null;
      const state = { plan: board.plan || data.plan, roster: board.roster || data.registrations, assignments: board.assignments || {}, hq: board.hq || E.emptyHQ(), revision: board.revision, rosterRevision: board.rosterRevision, planRevision: board.planRevision, publicationRevision: board.publicationRevision || 0, access: c.role, registrationId: null };
      const mine = c.player && c.player.id;
      if (mine && state.roster.some(p => p.id === mine)) state.registrationId = mine;
      else if (mine && c.role === 'manage') c.player = null;
      this.state = state;
      this.persist(); this.render();
    },
    // Open a link or the alliance saved here. A link never lowers what this device holds for that alliance.
    async open(c, fromLink, confirmed) {
      if (!c.planId || !c.role) { const found = await this.request('/v1/access', 'GET', null, c.code); c = { planId: found.planId, code: c.code, role: found.access }; }
      const have = stored();
      if (have && have.planId !== c.planId && fromLink && !confirmed) {
        this.pending = c;
        this.modal('switch', 'Open another alliance?', { text: 'This phone keeps one alliance. ' + (have.name || 'The one here') + ' will be forgotten on it.', keep: 'Keep ' + (have.name || 'mine') });
        return;
      }
      let next = c;
      if (have && have.planId === c.planId) {
        next = Object.assign({}, have);
        if (c.role === 'registration') { if (!next.player || next.player.code !== c.code) next.player = { id: null, code: c.code }; }
        else if (RANK[c.role] > RANK[have.role] || (have.role === 'registration' && c.role === 'join')) { next.code = c.code; next.role = c.role; if (c.codes) next.codes = c.codes; }
      } else if (c.role === 'registration') next = { planId: c.planId, code: c.code, role: 'registration', player: { id: null, code: c.code } };
      this.credential = next;
      try { await this.load(); }
      catch (cause) {
        if (cause.status === 401 || cause.status === 404) { if (!fromLink) drop(ALLIANCE); this.credential = null; this.state = null; this.render(); throw new Error(fromLink ? 'This link no longer works. Ask your leader for a new one.' : 'That alliance plan has expired.'); }
        throw cause;
      }
      if (!this.persist()) this.say('This browser can’t save, so keep your link.', true); else this.say('');
      this.mode = this.state.access === 'manage' || this.state.access === 'view' ? 'alliance-plan' : 'my-plan'; this.render();
    },
    schedule(delay) {
      clearTimeout(timer); timer = setTimeout(() => {
        if (disposed) return;
        const s = this.state;
        if (!this.credential || !s || s.example || document.hidden || this.dialog || this.busy || this.typing) return this.schedule(30000);
        this.run(async () => {
          try {
            const status = await this.request('/v1/plans/' + s.plan.id + '/status'), signature = [s.plan.revision, s.plan.rosterRevision || 0, s.publicationRevision || 0, s.revision || 1, s.plan.eventAt || ''].join(':');
            if (status.signature !== signature) await this.load(); this.schedule(30000);
          } catch (cause) { this.say('Offline. Showing the last copy.', true); this.schedule(90000); }
        });
      }, delay);
    },
    async savePlayer(p, data) {
      if (this.state.example) { Object.assign(p, data); this.render(); return; }
      const c = this.credential, token = !this.manager && c.player && p.id === this.state.registrationId ? c.player.code : undefined;
      const full = { nickname: p.nickname, availability: p.availability, infantry: p.infantry, cavalry: p.cavalry, archers: p.archers, marchCapacity: p.marchCapacity, marches: p.marches, notes: p.notes || '', capacities: p.capacities || null, garrisonCapacity: p.garrisonCapacity ?? null };
      await this.request('/v1/plans/' + this.state.plan.id + '/registrations/' + p.id, 'PUT', Object.assign(full, data, { revision: p.revision }), token);
      await this.load();
    },
    async attend(value) { const mine = this.me; if (!mine) return; await this.savePlayer(mine, { attending: value }); this.say(value ? 'You’re in.' : 'Withdrawn.'); },
    async copyText(value) {
      try { await navigator.clipboard.writeText(value); this.say('Copied.'); }
      catch (_) { this.modal('copy', 'Copy', { value }); }
    },

    /* ---- the dialogs ---- */
    playerEditor(playerId, title, own) {
      const p = this.state.roster.find(r => r.id === playerId) || { nickname: '', marches: 5 };
      this.forms.player = this.playerModel(p, true, own);
      this.modal('player', title || (playerId ? p.nickname : 'Add a player'));
    },
    roomEditor() {
      const p = this.state ? this.state.plan : {}, upcoming = E.eventDays(Date.now(), 4);
      const days = [['tue', 2], ['thu', 4]].map(([value, weekday]) => ({ value, label: dayLabel(upcoming.find(t => new Date(t).getUTCDay() === weekday)) }));
      this.forms.room = { name: p.name || '', day: p.eventDay || 'tue', time: p.eventTime || read(TIME) || '', closed: p.closed ? 'true' : 'false', days };
      this.modal('room', this.state ? 'Settings' : 'Set up Vikings');
    },
    // March editor: who each march goes to comes first; troops follow the split, and a tapped march opens to change its own.
    assignmentEditor(playerId) {
      const s = this.state, p = s.roster.find(r => r.id === playerId); if (!p) return;
      const check = E.validate(s.roster, s.assignments, s.hq), saved = s.assignments[p.id] || [], hq = E.hqRows(s.hq).find(r => r.playerId === p.id);
      // Each ally with the cover they already have from others, so the leader sends where it is missing.
      const targets = [{ value: '', label: 'Not sent' }].concat(s.roster.filter(r => r.id !== p.id && r.attending !== false).map(r => {
        const cover = (check.incoming[r.id] || []).filter(c => c.playerId !== p.id).reduce((n, c) => n + c.troops, 0);
        return { value: r.id, label: r.nickname + (r.attending ? '' : ' (not answered)') + (r.availability === 'unknown' || !r.availability ? '' : ' · ' + r.availability) + ' · ' + (cover ? kfmt(cover) + ' in' : 'no cover') };
      }));
      const rows = Array.from({ length: p.marches }, (_, i) => {
        const q = i + 1, row = saved.find(r => r.queue === q) || { queue: q, destination: null }, sent = !!row.destination, options = targets.slice();
        if (row.destination && !targets.some(t => t.value === row.destination)) options.push({ value: row.destination, label: this.name(row.destination) + ' (out)' });
        const send = { queue: q, destination: row.destination || '', auto: !sent, open: null, focus: false, hq: !!hq && hq.queue === q, options };
        TYPES.forEach(k => { send[k] = String(toK(sent ? row[k] : 0)); });
        return send;
      });
      this.forms.sends = { id: p.id, player: p, cover: (check.incoming[p.id] || []).map(r => ({ id: r.playerId, label: this.name(r.playerId) + ' ' + kfmt(r.troops) })), label: 'Sends ' + p.marches + ' march' + (p.marches === 1 ? '' : 'es'), rows };
      this.modal('sends', p.nickname);
    },
    // One march's line while the leader types: its troops against its size. Only a sent march carries any.
    line(send) {
      const p = this.forms.sends.player, cap = E.capacity(p, send.queue), sent = !!send.destination, row = {}; let sum = 0;
      TYPES.forEach(k => { const v = send[k], n = v === '' || !sent ? 0 : fromK(v); row[k] = n; sum += n; });
      return {
        sent, name: sent ? this.name(send.destination) : 'Not sent', over: String(sum > cap),
        mix: TROOPS.map((t, i) => ({ sep: i ? ' · ' : '', href: t.href, text: ' ' + toK(row[t.k]) })),
        cap: sent ? kfmt(sum) + ' / ' + kfmt(cap) : '+ Send', width: 'width: ' + (cap ? Math.min(100, sum / cap * 100) : 0) + '%'
      };
    },
    // Live totals: what goes out and what stays home. One march per city, so a player can't be picked twice.
    get sendsStatus() {
      const f = this.forms.sends, p = f.player, used = { infantry: 0, cavalry: 0, archers: 0 };
      f.rows.forEach(s => { if (s.destination) TYPES.forEach(k => { used[k] += s[k] === '' ? 0 : fromK(s[k]); }); });
      const chosen = f.rows.map(s => s.destination), twice = chosen.filter((v, i) => v && chosen.indexOf(v) !== i);
      const short = TYPES.filter(k => used[k] > p[k]), home = TYPES.reduce((n, k) => n + Math.max(0, p[k] - used[k]), 0);
      let line = kfmt(total(used)) + ' out · ' + kfmt(home) + ' home';
      if (short.length) line += ' · more ' + short.map(k => LABELS[k].toLowerCase()).join(' and ') + ' than they have';
      if (twice.length) line += ' · two marches to ' + this.name(twice[0]);
      return { line, error: String(!!(short.length || twice.length)) };
    },
    taken(i, value) { return !!value && this.forms.sends.rows.some((s, j) => j !== i && s.destination === value); },
    toggle(send) {
      this.forms.sends.rows.forEach(s => { s.open = String(s === send && s.open !== 'true'); });
      send.focus = send.open === 'true' && !send.destination;
    },
    // Spread what is left after hand-set marches across the sent marches still on the split. Unsent marches carry nothing.
    balance() {
      const f = this.forms.sends, p = f.player, left = {}, auto = [];
      TYPES.forEach(k => { left[k] = p[k]; });
      f.rows.forEach(s => {
        if (!s.destination) { TYPES.forEach(k => { s[k] = '0'; }); s.auto = true; return; }
        if (s.auto) { auto.push(s); return; }
        TYPES.forEach(k => { left[k] = Math.max(0, left[k] - fromK(s[k] || 0)); });
      });
      if (!auto.length) return;
      const share = E.split(Object.assign({}, left, { marches: auto.length, marchCapacity: p.marchCapacity, capacities: auto.map(s => E.capacity(p, s.queue)) }));
      share.rows.forEach((r, i) => TYPES.forEach(k => { auto[i][k] = String(toK(r[k])); }));
    },
    evenSplit() { this.forms.sends.rows.forEach(s => { s.auto = true; }); this.balance(); },
    hqEditor() {
      const s = this.state, hq = s.hq;
      // Largest garrison first: that player captains the HQ.
      const people = s.roster.filter(p => p.attending !== false).sort((a, b) => (b.garrisonCapacity || 0) - (a.garrisonCapacity || 0)), largest = people[0] && people[0].garrisonCapacity ? people[0].id : null;
      this.forms.hq = {
        capacity: text(hq.capacity), infantryPercent: text(hq.infantryPercent), cavalryPercent: text(hq.cavalryPercent),
        people: people.map(p => {
          const entry = hq.participants.find(e => e.playerId === p.id);
          return { id: p.id, nickname: p.nickname, on: !!entry, queue: String(entry ? entry.queue : 1), queues: Array.from({ length: p.marches }, (_, i) => ({ value: String(i + 1), label: 'March ' + (i + 1) })), note: p.garrisonCapacity ? 'Garrison ' + kfmt(p.garrisonCapacity) + (p.id === largest ? ' · largest' : '') : 'Garrison not given' };
        })
      };
      this.modal('hq', 'HQ · waves 10 and 20');
    },
    ask(title, question, label, yes, cls) { this.modal('ask', title, { text: question, label, cls, yes: () => this.run(yes) }); },

    async submit(kind) {
      const s = this.state;
      if (kind === 'room') {
        const raw = this.forms.room, data = { name: raw.name.trim() || 'Vikings', eventDay: raw.day, eventTime: raw.time };
        if (s) data.closed = raw.closed === 'true';
        write(TIME, raw.time);
        if (s && s.example) { Object.assign(s.plan, data, { eventAt: new Date(E.nextEvent(data.eventDay, data.eventTime, Date.now())).toISOString() }); this.close(); this.render(); return; }
        if (s) { await this.request('/v1/plans/' + s.plan.id, 'PATCH', Object.assign(data, { revision: s.plan.revision })); await this.load(); this.close(); this.say('Saved.'); return; }
        const created = await this.request('/v1/plans', 'POST', Object.assign(data, { eventAt: null, closed: false }));
        this.credential = { planId: created.plan.id, code: created.codes.manage, codes: created.codes, role: 'manage', player: null };
        await this.load(); if (!this.persist()) this.say('This browser can’t save. Copy your leader link.', true);
        this.mode = 'alliance-plan'; this.render(); this.modal('share', 'Links'); return;
      }
      if (kind === 'player' || kind === 'answer') {
        const m = kind === 'answer' ? this.answer : this.forms.player, data = this.fromModel(m), previous = s.roster.find(p => p.id === m.id);
        if (kind === 'answer') data.attending = true;
        const note = m.own && !s.example ? this.syncBack(data) : '';
        if (s.example) {
          if (previous) Object.assign(previous, data); else s.roster.push(Object.assign({ id: id(), attending: true, revision: 1, notes: '', capacities: null }, data));
          this.close(); this.render(); this.say('Saved.'); return;
        }
        if (previous) { await this.savePlayer(previous, data); this.close(); this.say(note || (kind === 'answer' ? 'You’re in.' : 'Saved.')); return; }
        const response = await this.request('/v1/plans/' + s.plan.id + '/registrations', 'POST', Object.assign({ notes: '' }, data, { attending: true }));
        if (kind === 'answer') { this.credential.player = { id: response.registration.id, code: response.editCode }; this.persist(); await this.load(); this.close(); this.mode = 'my-plan'; this.render(); this.say(note || 'You’re in.'); return; }
        await this.load(); this.close(); this.say('Added.'); return;
      }
      if (kind === 'sends') {
        const f = this.forms.sends, rows = f.rows.map(send => { const row = { queue: send.queue, destination: send.destination || null }; TYPES.forEach(k => { row[k] = row.destination ? fromK(send[k]) : 0; }); return row; });
        const check = E.validate(s.roster, { [f.id]: rows }, E.emptyHQ()); if (check.errors.length) throw new Error(check.errors[0]);
        if (s.example) { s.assignments[f.id] = rows; this.close(); this.render(); this.say('Saved.'); return; }
        await this.request('/v1/plans/' + s.plan.id + '/assignments/' + f.id, 'PUT', Object.assign(this.expected(), { marches: rows })); await this.load(); this.close(); this.say('Saved.'); return;
      }
      if (kind === 'hq') {
        const f = this.forms.hq, hq = { capacity: count(f.capacity), infantryPercent: Number(f.infantryPercent), cavalryPercent: Number(f.cavalryPercent), participants: f.people.filter(p => p.on).map(p => ({ playerId: p.id, queue: Number(p.queue) })) };
        if (hq.infantryPercent + hq.cavalryPercent > 100 || hq.participants.length > 15) throw new Error('Use a ratio up to 100% and at most 15 players.');
        if (s.example) { s.hq = hq; this.close(); this.render(); return; }
        await this.request('/v1/plans/' + s.plan.id + '/hq', 'PUT', Object.assign(this.expected(), { hq })); await this.load(); this.close(); this.say('Saved.'); return;
      }
      if (kind === 'open') { const c = parseLink(this.forms.link); if (!c) throw new Error('Paste the whole link, starting with https.'); this.close(); await this.open(c, true); }
    },
    demo() {
      this.credential = null;
      const plan = { id: id(), name: 'Vikings', eventDay: 'tue', eventTime: '20:00', closed: false };
      plan.eventAt = new Date(E.nextEvent('tue', '20:00', Date.now())).toISOString();
      const state = { plan, roster: [], assignments: {}, hq: E.emptyHQ(), access: 'manage', example: true };
      [['Rowan', true], ['Ash', true], ['Fern', true], ['Willow', true], ['Hazel', null], ['Birch', false]].forEach(([nickname, attending], i) => state.roster.push({ id: id(), nickname, attending, availability: i === 3 ? 'offline' : i === 4 ? 'unknown' : 'online', infantry: 240000, cavalry: 160000, archers: 120000, marchCapacity: 180000, marches: 3, capacities: null, garrisonCapacity: [820000, 960000, 750000, 1100000, null, 700000][i], notes: '', revision: 1 }));
      const inn = state.roster.slice(0, 4);
      inn.forEach((p, i) => { state.assignments[p.id] = E.split(p).rows.map((r, q) => Object.assign({}, r, { destination: inn[(i + q + 1) % 4].id })); });
      state.hq = { capacity: 300000, infantryPercent: 75, cavalryPercent: 25, participants: inn.slice(0, 3).map(p => ({ playerId: p.id, queue: 1 })) };
      state.registrationId = state.roster[0].id;
      this.state = state; this.mode = 'alliance-plan'; this.render(); this.say('Example. You’re Rowan. Nothing is saved.');
    },
    home() { this.say(''); this.state = null; this.credential = null; this.pending = null; this.close(); this.mode = 'my-plan'; this.render(); },

    /* ---- what the page's buttons do ---- */
    calculate() {
      return this.run(async () => {
        const c = this.calc, p = { marches: Number(c.marches) }; TYPES.concat('marchCapacity').forEach(k => { p[k] = count(c[k]); });
        const result = E.split(p);
        this.split = { lede: kfmt(result.total) + ' out' + (total(result.home) ? ' · ' + kfmt(total(result.home)) + ' stay home' : ''), marches: result.rows.map(r => march(r, 'March ' + r.queue)) };
      });
    },
    send(kind) { return this.run(() => this.submit(kind)); },
    create() { return this.run(() => { if (this.state) throw new Error('Switch first.'); this.roomEditor(); }); },
    settings() { return this.run(() => this.roomEditor()); },
    example() { return this.run(() => this.demo()); },
    paste() { return this.run(() => { this.forms.link = ''; this.modal('open', 'Open a link'); }); },
    addPlayer() { return this.run(() => this.playerEditor(null)); },
    editPlayer(playerId) { return this.run(() => this.playerEditor(playerId)); },
    editMine() { return this.run(() => this.playerEditor(this.state.registrationId, 'My troops', true)); },
    notIn() { return this.run(() => this.attend(false)); },
    imIn() { return this.run(() => this.attend(true)); },
    withdraw() { return this.run(() => this.ask('Withdraw from ' + this.when + '?', 'Your leader will see you as out and plan without you. You can sign up again before it starts.', 'Withdraw', async () => { this.close(); await this.attend(false); }, 'vv-primary')); },
    assign(playerId) { return this.run(() => this.assignmentEditor(playerId)); },
    hq() { return this.run(() => this.hqEditor()); },
    share() { return this.run(() => this.modal('share', 'Links')); },
    copy(value) { return this.run(() => this.copyText(value)); },
    copyInstructions() { return this.run(() => this.copyText(E.instructions(this.state, this.state.registrationId))); },
    confirmSwitch() { return this.run(async () => { const c = this.pending; this.pending = null; this.close(); if (c) await this.open(c, true, true); }); },
    keepCurrent() { return this.run(async () => { this.pending = null; this.close(); const c = stored(); if (c && !this.state) await this.open(c, false); }); },
    rotate(role) {
      return this.run(() => this.ask('Replace the ' + (role === 'join' ? 'sign-up' : 'marches') + ' link?', 'The old link stops working.', 'Replace', async () => {
        const result = await this.request('/v1/plans/' + this.state.plan.id + '/rotate', 'POST', { role }), c = this.credential;
        c.codes = Object.assign({}, c.codes, { [result.role]: result.code }); this.persist(); this.render(); this.modal('share', 'Links');
      }, 'vv-primary'));
    },
    removePlayer(playerId) {
      return this.run(() => this.ask('Remove ' + this.name(playerId) + '?', 'Their troops, marches and link go too.', 'Remove', async () => {
        const s = this.state;
        if (s.example) { s.roster = s.roster.filter(p => p.id !== playerId); delete s.assignments[playerId]; this.close(); this.render(); return; }
        await this.request('/v1/plans/' + s.plan.id + '/registrations/' + playerId, 'DELETE'); await this.load(); this.close();
      }, 'vv-danger'));
    },
    deletePlan() { return this.run(() => this.ask('Delete ' + this.state.plan.name + '?', 'Removes it for everyone.', 'Delete for everyone', async () => { await this.request('/v1/plans/' + this.state.plan.id, 'DELETE'); drop(ALLIANCE); this.home(); this.say('Deleted.'); }, 'vv-danger')); },
    refresh() { return this.run(() => this.load()); },
    // Leaving forgets the alliance on this phone only; any sign-up stays on the alliance's list.
    leave() { return this.run(() => { if (this.state && this.state.example) { this.home(); return; } this.ask('Leave ' + this.state.plan.name + '?', 'It’s forgotten on this phone. Your sign-up stays on the list.', 'Leave', async () => { drop(ALLIANCE); this.home(); }, 'vv-primary'); }); }
  };
});
