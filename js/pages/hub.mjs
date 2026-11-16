/* The alliance hub: one alliance per device, its rules, notes and event times, and who leads it,
   against the hub API (api/src/hub.js). hub/index.html binds to it with x-data="hub".
   The R5 owns the hub; R4s join through one shared invite link and wait to be let in; members
   read through one member link. Every view is worked out here from `state`, the last answer
   from the server; the markup only shows it. Links work like the Vikings planner's: the code
   rides in the fragment, the head script keeps it out of the address bar, and the server
   decides the role from the code. */
import { Alpine } from '../alpine.mjs';
import Cadence from '../hub-engine.mjs';
import Messages from '../hub-messages.mjs';
import { todayDay, present, splitParts } from '../event-cycle.mjs';

const API = 'https://kingslop.reubeycw.workers.dev';
const KEY = 'bh:hub:v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, CODE = /^[A-Za-z0-9_-]{22}$/;
// The link prefix names each code so leaders can tell them apart in chat; the server decides the role.
const PREFIX = { owner: 'own', invite: 'r4', member: 'ally', leader: 'me' };
// A device holds one hub, under the strongest code opened for it.
const RANK = { member: 1, invite: 2, waiting: 3, r4: 3, owner: 4 };
const TITLES = { rules: 'Rules', notes: 'Notes', times: 'Event times' };
const EMPTY = { rules: 'No rules written yet.', notes: 'No notes yet.', times: 'No times set yet.' };
const LABELS = { rules: 'Alliance rules', notes: 'Notes', times: 'Event times' };

function read() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (_) { return null; } }
function write(value) { try { localStorage.setItem(KEY, JSON.stringify(value)); return true; } catch (_) { return false; } }
function drop() { try { localStorage.removeItem(KEY); } catch (_) {} }
function stored() { const c = read(); return c && UUID.test(c.hubId) && CODE.test(c.code) && RANK[c.role] ? c : null; }
function parseLink(value) { const m = /#(?:own|r4|ally|me)-([A-Za-z0-9_-]{22})\s*$/.exec(String(value || '').trim()); return m ? { code: m[1] } : null; }
const dateLabel = d => new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
function until(d) { const n = Math.round((Date.parse(d + 'T00:00:00Z') - Math.floor(Date.now() / 86400000) * 86400000) / 86400000); return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : 'in ' + n + ' days'; }
function ago(iso) {
  const t = Date.parse(iso); if (!t) return '';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago';
}
// A date as weekday and day number, for a row in a week; and the Monday that starts its week.
const dayLabel = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
const weekStart = d => { const t = Date.parse(d + 'T00:00:00Z'), back = (new Date(t).getUTCDay() + 6) % 7; return new Date(t - back * 86400000).toISOString().slice(0, 10); };
const linkTo = (kind, code) => location.origin + location.pathname + '#' + PREFIX[kind] + '-' + code;

Alpine.data('hub', api => {
  const ROOT = api || API;
  let timer = null, disposed = false;
  return {
    state: null, credential: null, pending: null, busy: false, opened: false, message: '', error: false,
    dialog: null, dialogMessage: '', renders: 0, tab: '', asMember: false,
    forms: { link: '', create: null, settings: null, section: null, join: '', claim: null, task: null, duty: null, template: null, role: null },
    weekdays: Cadence.WEEKDAYS.map((label, value) => ({ value: String(value), label })),

    init() {
      // A link just followed wins; otherwise the hub this phone keeps.
      const initial = globalThis.HubAccess, mine = stored();
      if (initial && CODE.test(initial.code)) this.run(async () => { try { await this.open({ code: initial.code }, true); } finally { this.opened = true; } });
      else if (mine) this.run(async () => { try { await this.open(Object.assign({}, mine), false); } finally { this.opened = true; } });
      else this.opened = true;
      this.schedule(60000);
    },
    destroy() { disposed = true; clearTimeout(timer); },

    /* ---- reading the hub ---- */
    get access() { return this.state ? this.state.access : null; },
    // A leader can look at the hub as a member does: the same panes, read only, nothing of the leaders' own.
    get leader() { return this.access === 'owner' || this.access === 'r4'; },
    get owner() { return this.access === 'owner' && !this.asMember; },
    get r4() { return this.access === 'r4' && !this.asMember; },
    get canEdit() { return this.owner || this.r4; },
    preview() { this.asMember = !this.asMember; this.tab = ''; this.close(); window.scrollTo(0, 0); },
    get mine() { return { text: this.state && this.state.me && this.credential ? 'Open ' + this.state.hub.name + ': ' + linkTo('leader', this.credential.code) : '' }; },
    get bar() {
      const s = this.state, who = this.asMember ? 'Member view' : { owner: 'Owner · ' + s.hub.ownerName, r4: 'R4 · ' + (s.me ? s.me.name : ''), waiting: 'Waiting · ' + (s.me ? s.me.name : ''), invite: 'Invitation', member: 'Member' }[s.access];
      return { label: who, line: s.hub.ownerName + (s.access === 'owner' && !this.asMember ? '' : ' leads this alliance') };
    },
    get sections() {
      const s = this.state; if (!s) return [];
      return ['rules', 'notes', 'times'].map(key => {
        const x = s.sections[key];
        return { key, title: TITLES[key], body: x.body, empty: EMPTY[key], by: x.editedBy ? 'Edited by ' + x.editedBy + ' · ' + ago(x.editedAt) : '' };
      });
    },
    // The page is one pane at a time: what an R4 works in, or what a member reads.
    get tabs() {
      if (!this.state) return [];
      const list = [];
      if (this.leadership) {
        if (this.duties.length) list.push({ key: 'up', label: 'Up next' });
        if (this.tasks.length || this.owner) list.push({ key: 'tasks', label: 'Tasks' });
        list.push({ key: 'messages', label: 'Messages' }, { key: 'info', label: 'Info' });
        if (this.leaders.length || this.owner) list.push({ key: 'leaders', label: 'Leaders' });
      } else {
        list.push({ key: 'info', label: 'Info' });
        if (this.tasks.length) list.push({ key: 'tasks', label: 'Who to ask' });
      }
      return list;
    },
    get view() { return this.tabs.some(t => t.key === this.tab) ? this.tab : this.tabs[0].key; },
    get leadership() { return this.owner || this.r4; },
    // Who I am on a task: the owner holds as 'owner', an R4 under their own id.
    get myId() { return this.owner ? 'owner' : this.state && this.state.me ? this.state.me.id : null; },
    get tasks() {
      const s = this.state; if (!s) return [];
      // As a member sees it: only the public tasks somebody holds.
      return (s.tasks || []).filter(t => !this.asMember || (t.public && t.holders.length)).map(t => ({ ...t, mine: t.holders.some(h => h.id && h.id === this.myId), nobody: this.leadership && !t.holders.length, line: t.holders.map(h => h.label ? h.name + ' (' + h.label + ')' : h.name).join(' · ') }));
    },
    // Roles bundle tasks. Whoever holds every task in one is covering it, so the page works that out from the tasks.
    get roles() {
      if (!this.leadership || !this.state) return [];
      const tasks = this.tasks;
      return (this.state.roles || []).map(r => {
        const own = r.taskIds.map(id => tasks.find(t => t.id === id)).filter(Boolean);
        const covering = own.length ? own[0].holders.filter(h => h.id && own.every(t => t.holders.some(x => x.id === h.id))) : [];
        return { ...r, count: own.length, line: own.map(t => t.name).join(' · '), covering: covering.map(h => h.name).join(' · '), mine: covering.some(h => h.id === this.myId), empty: !own.length };
      });
    },
    get duties() { return this.leadership && this.state ? (this.state.duties || []).map(d => ({ ...d, day: dayLabel(d.date), when: dateLabel(d.date), until: until(d.date), mine: !!d.taker && d.taker.id === this.myId, line: d.owners.join(' · ') })) : []; },
    // The dates in the order they fall, grouped by week: this week, next week, then "Week of …".
    get weeks() {
      const today = new Date(Math.floor(Date.now() / 86400000) * 86400000).toISOString().slice(0, 10), here = weekStart(today), out = [];
      for (const d of this.duties) {
        const key = weekStart(d.date); let w = out[out.length - 1];
        if (!w || w.key !== key) {
          const n = Math.round((Date.parse(key + 'T00:00:00Z') - Date.parse(here + 'T00:00:00Z')) / 604800000);
          w = { key, label: n <= 0 ? 'This week' : n === 1 ? 'Next week' : 'Week of ' + dayLabel(key).replace(/^\w+ /, '') + ' ' + new Date(key + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }), items: [] };
          out.push(w);
        }
        w.items.push(d);
      }
      return out;
    },
    get soonWeeks() { return this.weeks.slice(0, 2); },
    get laterWeeks() { return this.weeks.slice(2); },
    get laterCount() { return this.laterWeeks.reduce((n, w) => n + w.items.length, 0); },
    // Messages to paste into game chat: today's Event Cycle card, then the R4s' own, gaps filled in.
    get messages() {
      if (!this.leadership || !this.state) return [];
      const day = todayDay(), card = present(day, true, null), rows = [{ id: 'cycle', fixed: true, title: 'Event Cycle · day ' + day + ' · ' + card.title, text: card.copy, task: '' }];
      for (const m of this.state.templates || []) rows.push({ id: m.id, title: m.title, text: this.fillTemplate(m.body, m.taskId), task: this.taskName(m.taskId), by: m.editedBy ? m.editedBy + ' · ' + ago(m.editedAt) : '' });
      return rows.map(r => { const c = Messages.check(r.text); return { ...r, parts: c.parts, wide: c.wide, open: r.fixed ? [] : c.open, chars: c.chars }; });
    },
    taskName(id) { const t = id && (this.state.tasks || []).find(x => x.id === id); return t ? t.name : ''; },
    // A message with its gaps filled from the task it is about: its holders and its next date.
    fillTemplate(body, taskId) {
      const task = taskId && (this.state.tasks || []).find(x => x.id === taskId), now = Date.now();
      const next = task ? (this.duties.find(d => d.taskId === taskId && !d.done) || {}).date || Cadence.upcoming(task.cadence, now)[0] || null : null;
      return Messages.fill(body, { now, task: task ? { name: task.name, holders: task.holders } : null, next });
    },
    get leaders() { return (this.state && this.state.leaders) || []; },
    get shareRows() {
      const c = this.credential, codes = (c && c.codes) || {}, name = this.state.hub.name;
      const rows = [['owner', 'Owner', 'only for you', c.code], ['invite', 'R4 invite', 'for leadership chat', codes.invite], ['member', 'Member', 'for alliance chat', codes.member]];
      return rows.map(([role, title, note, code]) => ({ role, title, note, code, text: code ? this.shareText(role, code, name) : '' }));
    },
    shareText(role, code, name) {
      const url = linkTo(role, code);
      return role === 'invite' ? name + ' leadership: tap to ask to join ' + url : role === 'member' ? name + ': rules and notes ' + url : url;
    },
    ago,

    /* ---- talking to the hub ---- */
    say(message, error) { this.message = message; this.error = !!error; if (this.dialog) this.dialogMessage = error ? message : ''; },
    modal(kind, title, extra) { this.dialog = Object.assign({ kind, title }, extra); this.dialogMessage = ''; },
    // Closing a dialog, by any way, runs what it asked to run on closing.
    close() { const d = this.dialog; this.dialog = null; if (d && d.onclose) d.onclose(); },
    persist() { const c = this.credential; return !!c && write({ hubId: c.hubId, code: c.code, role: c.role, codes: c.codes || null, name: this.state ? this.state.hub.name : c.name }); },
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
      catch (cause) { this.say(cause.message || 'Can’t reach the hub. Showing the last copy.', true); }
      finally { this.busy = false; }
    },
    async load() {
      const c = this.credential, data = await this.request('/v1/hubs/' + c.hubId);
      if (disposed || this.credential !== c) return;
      c.role = data.access; c.name = data.hub.name;
      this.state = data; this.renders++; this.persist();
    },
    // Open a link or the hub saved here. A link never lowers what this device holds for that hub.
    async open(c, fromLink, confirmed) {
      if (!c.hubId) { const found = await this.request('/v1/hubs/access', 'GET', null, c.code); c = { hubId: found.hubId, code: c.code, role: found.access }; }
      const have = stored();
      if (have && have.hubId !== c.hubId && fromLink && !confirmed) {
        this.pending = c;
        this.modal('switch', 'Open another alliance?', { text: 'This phone keeps one alliance. ' + (have.name || 'The one here') + ' will be forgotten on it.', keep: 'Keep ' + (have.name || 'mine') });
        return;
      }
      let next = c;
      if (have && have.hubId === c.hubId) {
        next = Object.assign({}, have);
        if (RANK[c.role] > RANK[have.role]) { next.code = c.code; next.role = c.role; }
      }
      this.credential = next;
      try { await this.load(); }
      catch (cause) {
        if (cause.status === 401 || cause.status === 404) { if (!fromLink) drop(); this.credential = null; this.state = null; throw new Error(fromLink || cause.status === 401 ? 'This link no longer works. Ask the R5 for a new one.' : 'That hub has expired.'); }
        throw cause;
      }
      if (!this.persist()) this.say('This browser can’t save, so keep your link.', true); else this.say('');
    },
    schedule(delay) {
      clearTimeout(timer); timer = setTimeout(() => {
        if (disposed) return;
        if (!this.credential || !this.state || document.hidden || this.dialog || this.busy) return this.schedule(60000);
        this.run(async () => { try { await this.load(); this.schedule(60000); } catch (cause) { this.say('Offline. Showing the last copy.', true); this.schedule(120000); } });
      }, delay);
    },
    forget() { drop(); this.credential = null; this.state = null; this.close(); this.say(''); },
    ask(title, question, label, yes, cls) { this.modal('ask', title, { text: question, label, cls, yes: () => this.run(yes) }); },
    async copyText(value) {
      try { await navigator.clipboard.writeText(value); this.say('Copied.'); }
      catch (_) { this.modal('copy', 'Copy', { value }); }
    },

    /* ---- actions ---- */
    create() { this.forms.create = { name: '', ownerName: '' }; this.modal('create', 'Set up your alliance'); },
    paste() { this.forms.link = ''; this.modal('open', 'Paste a link'); },
    settings() { const h = this.state.hub; this.forms.settings = { name: h.name, ownerName: h.ownerName }; this.modal('settings', 'Settings'); },
    edit(key) { const x = this.state.sections[key]; this.forms.section = { key, body: x.body, revision: x.revision }; this.modal('section', LABELS[key], { label: LABELS[key] }); },
    share() { this.modal('share', 'Links'); },
    copy(value) { return this.run(() => this.copyText(value)); },
    refresh() { return this.run(async () => { await this.load(); this.say('Up to date.'); }); },
    confirmSwitch() { return this.run(async () => { const c = this.pending; this.pending = null; this.close(); if (c) await this.open(c, true, true); }); },
    async send(kind) {
      if (kind === 'open') {
        const link = parseLink(this.forms.link);
        if (!link) { this.say('That isn’t a hub link.', true); return; }
        return this.run(async () => { this.close(); await this.open(link, true); });
      }
      return this.run(async () => {
        if (kind === 'create') {
          const f = this.forms.create, made = await this.request('/v1/hubs', 'POST', { name: f.name, ownerName: f.ownerName });
          this.credential = { hubId: made.hub.id, code: made.codes.owner, role: 'owner', codes: { invite: made.codes.invite, member: made.codes.member } };
          await this.load(); this.close(); this.say('Set up.');
          if (!this.persist()) this.say('This browser can’t save, so copy your owner link.', true);
        } else if (kind === 'settings') {
          const f = this.forms.settings; await this.request('/v1/hubs/' + this.state.hub.id, 'PATCH', { name: f.name, ownerName: f.ownerName, revision: this.state.hub.revision });
          await this.load(); this.close(); this.say('Saved.');
        } else if (kind === 'duty') {
          const f = this.forms.duty, body = { done: !!f.done };
          if (f.taker !== f.was) body.taker = f.taker === '' ? 'none' : f.taker === this.myId ? 'me' : f.taker;
          await this.request('/v1/hubs/' + this.state.hub.id + '/tasks/' + f.taskId + '/duties/' + f.date, 'PUT', body);
          await this.load(); this.close();
        } else if (kind === 'claim') {
          const f = this.forms.claim; await this.request('/v1/hubs/' + this.state.hub.id + '/tasks/' + f.id + '/claims/me', 'PUT', { label: f.label });
          await this.load(); this.close();
        } else if (kind === 'task') {
          const f = this.forms.task, base = '/v1/hubs/' + this.state.hub.id + '/tasks', cadence = this.cadenceOf(f), problem = Cadence.validate(cadence);
          if (problem) { this.say(problem, true); return; }
          const body = { name: f.name, note: f.note, public: !!f.public, cadence, dutyRule: f.dutyRule };
          const id = f.id ? f.id : (await this.request(base, 'POST', body)).id;
          if (f.id) await this.request(base + '/' + id, 'PATCH', body);
          for (const p of f.people) {
            if (p.on && (!p.was || p.label !== p.was_label)) await this.request(base + '/' + id + '/claims/' + p.id, 'PUT', { label: p.label });
            else if (!p.on && p.was) await this.request(base + '/' + id + '/claims/' + p.id, 'DELETE');
          }
          await this.load(); this.close(); this.say('Saved.');
        } else if (kind === 'role') {
          const f = this.forms.role, base = '/v1/hubs/' + this.state.hub.id + '/roles', body = { name: f.name, taskIds: f.tasks.filter(t => t.on).map(t => t.id) };
          await this.request(f.id ? base + '/' + f.id : base, f.id ? 'PUT' : 'POST', body);
          await this.load(); this.close(); this.say('Saved.');
        } else if (kind === 'template') {
          const f = this.forms.template, base = '/v1/hubs/' + this.state.hub.id + '/templates', body = { title: f.title, body: f.body, taskId: f.taskId || null };
          await this.request(f.id ? base + '/' + f.id : base, f.id ? 'PUT' : 'POST', body);
          await this.load(); this.close(); this.say('Saved.');
        } else if (kind === 'section') {
          const f = this.forms.section;
          try { await this.request('/v1/hubs/' + this.state.hub.id + '/sections/' + f.key, 'PUT', { body: f.body, revision: f.revision }); }
          catch (cause) { if (cause.status === 409) await this.load(); throw cause; }
          await this.load(); this.close(); this.say('Saved.');
        }
      });
    },
    mutate(path, method, data, done) { return this.run(async () => { await this.request('/v1/hubs/' + this.state.hub.id + path, method, data); await this.load(); if (done) this.say(done); }); },
    // Copy one part of a message; the cycle card and the notes are plain text either way.
    copyPart(m, i) { return this.run(async () => { await this.copyText(m.parts[i]); }); },
    editTemplate(m) {
      const found = m && this.state.templates.find(x => x.id === m.id);
      this.forms.template = { id: found ? found.id : '', title: found ? found.title : '', body: found ? found.body : '', taskId: found ? found.taskId || '' : '' };
      this.modal('template', found ? found.title : 'New message');
    },
    get draft() {
      const f = this.forms.template; if (!f || !this.state) return null;
      const text = this.fillTemplate(f.body, f.taskId || null), c = Messages.check(text);
      return { text, wide: c.wide, parts: c.parts.length, open: Messages.gaps(f.body).filter(g => !Messages.GAPS.includes(g)), left: 1000 - f.body.length, gaps: Messages.GAPS.map(g => '{' + g + '}').join(' ') };
    },
    removeTemplate(f) { return this.ask('Remove ' + f.title + '?', 'Everyone leading loses this message.', 'Remove', async () => { await this.request('/v1/hubs/' + this.state.hub.id + '/templates/' + f.id, 'DELETE'); this.close(); await this.load(); this.say('Removed.'); }); },
    enlist(r) { return this.mutate('/roles/' + r.id + '/enlist/me', 'PUT'); },
    stepBack(r) { return this.mutate('/roles/' + r.id + '/enlist/me', 'DELETE'); },
    editRole(r) {
      const found = r && this.state.roles.find(x => x.id === r.id);
      this.forms.role = { id: found ? found.id : '', name: found ? found.name : '', tasks: this.tasks.map(t => ({ id: t.id, name: t.name, on: !!found && found.taskIds.includes(t.id) })) };
      this.modal('role', found ? found.name : 'New role');
    },
    removeRole(f) { return this.ask('Remove ' + f.name + '?', 'Its tasks and who holds them stay.', 'Remove', async () => { await this.request('/v1/hubs/' + this.state.hub.id + '/roles/' + f.id, 'DELETE'); this.close(); await this.load(); this.say('Removed.'); }); },
    take(t) { return this.mutate('/tasks/' + t.id + '/claims/me', 'PUT', { label: '' }); },
    claim(t) { const mine = t.holders.find(h => h.id === this.myId); this.forms.claim = { id: t.id, label: mine ? mine.label : '' }; this.modal('claim', t.name); },
    drop(id) { return this.run(async () => { await this.request('/v1/hubs/' + this.state.hub.id + '/tasks/' + id + '/claims/me', 'DELETE'); this.close(); await this.load(); }); },
    starter() { return this.mutate('/tasks/template', 'POST', {}); },
    editTask(t) {
      const people = [{ id: 'owner', name: this.state.hub.ownerName }].concat(this.leaders.filter(l => l.status === 'approved').map(l => ({ id: l.id, name: l.name })));
      this.forms.task = { id: t ? t.id : '', name: t ? t.name : '', note: t ? t.note : '', public: t ? t.public : false, ...this.cadenceForm(t && t.cadence), dutyRule: t ? t.dutyRule || 'usual' : 'usual', people: people.map(p => { const h = t && t.holders.find(x => x.id === p.id); return { id: p.id, name: p.name, on: !!h, was: !!h, label: h ? h.label : '', was_label: h ? h.label : '' }; }) };
      this.modal('task', t ? t.name : 'New task');
    },
    // The task dialog's cadence fields, and back: one object the engine validates.
    cadenceForm(c) {
      const today = new Date().toISOString().slice(0, 10), f = { cadenceType: c ? c.type : '', weekday: '5', weeks: '2', from: today, days: '', vikingsDay: 'thu', date: today };
      if (c && c.type === 'weekly') f.weekday = String(c.weekday);
      if (c && c.type === 'every') { f.weeks = String(c.weeks); f.from = c.from; }
      if (c && c.type === 'wheel') f.days = c.days.join(', ');
      if (c && c.type === 'vikings') f.vikingsDay = c.day;
      if (c && c.type === 'date') f.date = c.date;
      return f;
    },
    cadenceOf(f) {
      if (f.cadenceType === 'weekly') return { type: 'weekly', weekday: Number(f.weekday) };
      if (f.cadenceType === 'every') return { type: 'every', weeks: Number(f.weeks), from: f.from };
      if (f.cadenceType === 'wheel') return { type: 'wheel', days: String(f.days).split(/[\s,]+/).filter(Boolean).map(Number) };
      if (f.cadenceType === 'vikings') return { type: 'vikings', day: f.vikingsDay };
      if (f.cadenceType === 'date') return { type: 'date', date: f.date };
      return null;
    },
    removeTask(f) { return this.ask('Remove ' + f.name + '?', 'Everyone holding it is let go.', 'Remove', async () => { await this.request('/v1/hubs/' + this.state.hub.id + '/tasks/' + f.id, 'DELETE'); this.close(); await this.load(); this.say('Removed.'); }); },
    takeDuty(d) { return this.mutate('/tasks/' + d.taskId + '/duties/' + d.date, 'PUT', { taker: 'me' }); },
    editDuty(d) {
      const mine = this.myId, options = [];
      if (this.owner) options.push({ value: '', label: 'Usual' }, { value: 'owner', label: this.state.hub.ownerName }, ...this.leaders.filter(l => l.status === 'approved').map(l => ({ value: l.id, label: l.name })));
      else { if (d.taker && d.taker.id !== mine) options.push({ value: d.taker.id, label: d.taker.name, fixed: true }); else options.push({ value: '', label: 'Usual' }); options.push({ value: mine, label: 'Me' }); }
      const taker = d.taker ? d.taker.id : '';
      this.forms.duty = { taskId: d.taskId, date: d.date, was: taker, taker, done: d.done, options };
      this.modal('duty', d.task + ' · ' + d.when);
    },
    join() {
      return this.run(async () => {
        const made = await this.request('/v1/hubs/' + this.state.hub.id + '/leaders', 'POST', { name: this.forms.join });
        this.credential = { hubId: this.state.hub.id, code: made.code, role: 'waiting' };
        this.forms.join = ''; await this.load(); this.say('Asked.');
      });
    },
    approve(l) { return this.run(async () => { await this.request('/v1/hubs/' + this.state.hub.id + '/leaders/' + l.id + '/approve', 'POST'); await this.load(); this.say(l.name + ' is in.'); }); },
    remove(l) {
      return this.ask('Remove ' + l.name + '?', 'Their sign-in stops working.', 'Remove', async () => {
        await this.request('/v1/hubs/' + this.state.hub.id + '/leaders/' + l.id, 'DELETE'); this.close(); await this.load(); this.say('Removed.');
      });
    },
    leave() {
      const o = this.owner;
      return this.ask('Leave ' + this.state.hub.name + '?', o ? 'Your owner link stays on this phone only. Copy it from Links first.' : 'Open your link again to come back.', 'Leave', async () => {
        if (this.access === 'r4' || this.access === 'waiting') await this.request('/v1/hubs/' + this.state.hub.id + '/leaders/' + this.state.me.id, 'DELETE').catch(() => {});
        this.forget();
      });
    },
    rotate(role) {
      return this.ask('Replace the ' + (role === 'invite' ? 'R4 invite' : 'member') + ' link?', 'The old link stops working.', 'Replace', async () => {
        const made = await this.request('/v1/hubs/' + this.state.hub.id + '/rotate', 'POST', { role });
        this.credential.codes = Object.assign({}, this.credential.codes, { [role]: made.code }); this.persist(); this.modal('share', 'Links'); this.say('Replaced.');
      });
    },
    deleteHub() {
      return this.ask('Delete ' + this.state.hub.name + '?', 'Removes it for everyone.', 'Delete for everyone', async () => {
        await this.request('/v1/hubs/' + this.state.hub.id, 'DELETE'); this.forget(); this.say('Deleted.');
      }, 'vv-danger');
    },
    handover() {
      return this.ask('Hand over ' + this.state.hub.name + '?', 'You get one new owner link to give them. Your own owner link stops working.', 'Hand over', async () => {
        const made = await this.request('/v1/hubs/' + this.state.hub.id + '/handover', 'POST', {});
        // The page keeps the hub open until the new link is dealt with, then lets go of this device's old one.
        this.modal('copy', 'New owner link', { value: linkTo('owner', made.code), after: () => this.close(), onclose: () => this.forget() });
      });
    },
  };
});
