/* The alliance hub: one alliance per device, its rules, notes and event times, and who leads it,
   against the hub API (api/src/hub.js). hub/index.html binds to it with x-data="hub".
   The R5 owns the hub; R4s join through one shared invite link and wait to be let in; members
   read through one member link. Every view is worked out here from `state`, the last answer
   from the server; the markup only shows it. Links work like the Vikings planner's: the code
   rides in the fragment, the head script keeps it out of the address bar, and the server
   decides the role from the code. */
import { Alpine } from '../alpine.mjs';

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
function ago(iso) {
  const t = Date.parse(iso); if (!t) return '';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago';
}
const linkTo = (kind, code) => location.origin + location.pathname + '#' + PREFIX[kind] + '-' + code;

Alpine.data('hub', api => {
  const ROOT = api || API;
  let timer = null, disposed = false;
  return {
    state: null, credential: null, pending: null, busy: false, opened: false, message: '', error: false,
    dialog: null, dialogMessage: '', renders: 0,
    forms: { link: '', create: null, settings: null, section: null, join: '', claim: null, task: null },

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
    get owner() { return this.access === 'owner'; },
    get canEdit() { return this.owner || this.access === 'r4'; },
    get mine() { return { text: this.state && this.state.me && this.credential ? 'Open ' + this.state.hub.name + ': ' + linkTo('leader', this.credential.code) : '' }; },
    get bar() {
      const s = this.state, who = { owner: 'Owner · ' + s.hub.ownerName, r4: 'R4 · ' + (s.me ? s.me.name : ''), waiting: 'Waiting · ' + (s.me ? s.me.name : ''), invite: 'Invitation', member: 'Member' }[s.access];
      return { label: who, line: s.hub.ownerName + (s.access === 'owner' ? '' : ' leads this alliance') };
    },
    get sections() {
      const s = this.state; if (!s) return [];
      return ['rules', 'notes', 'times'].map(key => {
        const x = s.sections[key];
        return { key, title: TITLES[key], body: x.body, empty: EMPTY[key], by: x.editedBy ? 'Edited by ' + x.editedBy + ' · ' + ago(x.editedAt) : '' };
      });
    },
    get leadership() { return this.owner || this.access === 'r4'; },
    // Who I am on a task: the owner holds as 'owner', an R4 under their own id.
    get myId() { return this.owner ? 'owner' : this.state && this.state.me ? this.state.me.id : null; },
    get tasks() {
      const s = this.state; if (!s) return [];
      return (s.tasks || []).map(t => ({ ...t, mine: t.holders.some(h => h.id && h.id === this.myId), nobody: this.leadership && !t.holders.length, line: t.holders.length ? t.holders.map(h => h.label ? h.name + ' (' + h.label + ')' : h.name).join(' · ') : 'Nobody yet' }));
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
    close() { this.dialog = null; },
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
        } else if (kind === 'claim') {
          const f = this.forms.claim; await this.request('/v1/hubs/' + this.state.hub.id + '/tasks/' + f.id + '/claims/me', 'PUT', { label: f.label });
          await this.load(); this.close();
        } else if (kind === 'task') {
          const f = this.forms.task, base = '/v1/hubs/' + this.state.hub.id + '/tasks', body = { name: f.name, note: f.note, public: !!f.public };
          const id = f.id ? f.id : (await this.request(base, 'POST', body)).id;
          if (f.id) await this.request(base + '/' + id, 'PATCH', body);
          for (const p of f.people) {
            if (p.on && (!p.was || p.label !== p.was_label)) await this.request(base + '/' + id + '/claims/' + p.id, 'PUT', { label: p.label });
            else if (!p.on && p.was) await this.request(base + '/' + id + '/claims/' + p.id, 'DELETE');
          }
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
    take(t) { return this.mutate('/tasks/' + t.id + '/claims/me', 'PUT', { label: '' }); },
    claim(t) { const mine = t.holders.find(h => h.id === this.myId); this.forms.claim = { id: t.id, label: mine ? mine.label : '' }; this.modal('claim', t.name); },
    drop(id) { return this.run(async () => { await this.request('/v1/hubs/' + this.state.hub.id + '/tasks/' + id + '/claims/me', 'DELETE'); this.close(); await this.load(); }); },
    starter() { return this.mutate('/tasks/template', 'POST', {}); },
    editTask(t) {
      const people = [{ id: 'owner', name: this.state.hub.ownerName }].concat(this.leaders.filter(l => l.status === 'approved').map(l => ({ id: l.id, name: l.name })));
      this.forms.task = { id: t ? t.id : '', name: t ? t.name : '', note: t ? t.note : '', public: t ? t.public : false, people: people.map(p => { const h = t && t.holders.find(x => x.id === p.id); return { id: p.id, name: p.name, on: !!h, was: !!h, label: h ? h.label : '', was_label: h ? h.label : '' }; }) };
      this.modal('task', t ? t.name : 'New task');
    },
    removeTask(f) { return this.ask('Remove ' + f.name + '?', 'Everyone holding it is let go.', 'Remove', async () => { await this.request('/v1/hubs/' + this.state.hub.id + '/tasks/' + f.id, 'DELETE'); this.close(); await this.load(); this.say('Removed.'); }); },
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
        const link = linkTo('owner', made.code); this.forget();
        this.modal('copy', 'New owner link', { value: link, after: () => this.close() });
      });
    },
  };
});
