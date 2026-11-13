/* The upgrade priority page's goals: the player's own targets (preferences.priority.goals)
   and what each still needs, from UpgradeGoals over the shared save. The editor picks a kind,
   a target and a level; one goal per target, so a new level replaces the old one. A balance a
   goal needs and the save does not hold can be recorded in place; blank stays unknown.
   upgrade-priority/index.html binds to it with x-data="upgradeGoals" on #goals. Goal titles,
   levels and item names (text) are shared with the savings section. */
import { Alpine } from '../alpine.mjs';
import UpgradeGoals from '../upgrade-goals.mjs';
import UpgradePriority from '../upgrade-priority.mjs';

const TOOLS = { building: ['town-centre/#town-buildings', 'town.nav', 'Town Centre'], hero: ['town-centre/#town-heroes', 'town.nav', 'Town Centre'], 'hero-gear': ['hero-gear/', 'ev.switch.gear', 'Gear'], 'governor-gear': ['governor-gear/#governor-planner', 'gov.nav', 'Governor'], 'governor-charm': ['governor-gear/#governor-planner', 'gov.nav', 'Governor'], pet: ['pets/#cage', 'pets.nav', 'Pets'], master: ['masters/', 'masters.nav', 'Masters'] };
const BLANK = { inventory: {}, preferences: {} };

/* Goal titles, levels and item names in the reader's language. */
export function text(api) {
  const t = (key, fallback) => api.tr('priority.' + key, fallback || key);
  const tpl = (key, vars) => api.fill(t(key), vars);
  const troop = type => api.tr('gear.' + type, type);
  const building = id => { const b = globalThis.BuildingData.buildings.find(x => x.id === id); return api.tr('town.building.' + id, b ? b.name : id); };
  const govPiece = id => {
    const p = globalThis.GovernorData.gear.pieces.find(x => x.id === id);
    return p ? api.fill(api.tr('gov.pieceTroop', '{slot} · {troop}'), { slot: api.tr('gov.slot.' + p.slot, p.slot), troop: troop(p.troop) }) : id;
  };
  const govLevel = index => {
    const row = globalThis.GovernorData.gear.levels[index - 1];
    return row ? api.tr('gov.tier.' + row.tier, row.tier) + (row.grade ? ' T' + api.fmt(row.grade) : '') + ' ' + api.fmt(row.stars) + '★' : api.fmt(index);
  };
  const stars = index => { const s = Math.floor(index / 6), tier = index % 6; return api.fmt(s) + '★' + (tier ? ' ' + api.fmt(tier) + '/6' : ''); };
  // The goal's subject and a level in its own units.
  function subject(kind, id) {
    const found = UpgradeGoals.targets(kind).find(x => x.id === id);
    if (kind === 'building') return building(id);
    if (kind === 'hero-gear') return found ? troop(found.troop) + ' · ' + api.tr('gear.' + found.slot, found.slot) : id;
    if (kind === 'governor-gear') return govPiece(id);
    if (kind === 'governor-charm') return found ? tpl('goal.charm', { piece: govPiece(found.piece), n: api.fmt(Number(id.slice(-1))) }) : id;
    return found ? found.name : id;
  }
  function level(kind, value) {
    if (kind === 'building') return String(value);
    if (kind === 'hero') return stars(value);
    if (kind === 'governor-gear') return govLevel(value);
    if (kind === 'master') return tpl('goal.affinity', { n: api.fmt(value) });
    return tpl('goal.lv', { n: api.fmt(value) });
  }
  function item(name) {
    if (name.kind === 'shards') return tpl(name.general ? 'item.shardsGeneral' : 'item.shards', { hero: name.hero });
    if (name.kind === 'emblems') return tpl('item.emblems', { master: name.master });
    return t('item.' + name.id);
  }
  const title = goal => tpl('goal.title', { what: subject(goal.kind, goal.target), level: level(goal.kind, goal.level) });
  return { t, tpl, building, subject, level, item, title };
}

/* Each goal as plain text, from a ledger snapshot. */
function present(snapshot) {
  const api = globalThis.BH, words = text(api), t = words.t, tpl = words.tpl;
  const figures = l => l.have === null ? tpl('goal.needUnknown', { need: api.fmt(l.need) })
    : tpl(l.short ? 'goal.needShort' : 'goal.needCovered', { need: api.fmt(l.need), have: api.fmt(l.have), short: api.fmt(l.short) });
  return UpgradeGoals.all(snapshot || BLANK).map((r, at) => {
    const g = r.goal, unknown = r.lines.some(l => l.have === null), notes = [], tool = TOOLS[g.kind];
    const state = r.state === 'short' && (unknown || r.beyond || r.record.length) ? 'shortSoFar' : r.state;
    if (r.includes.length) notes.push(tpl('goal.includes', { list: r.includes.map(b => tpl('goal.includeOne', { building: words.building(b.building), from: b.from, level: b.level })).join(', ') }));
    r.record.filter(id => !(r.state === 'record' && id === g.target)).forEach(id => { notes.push(tpl('goal.recordOther', { what: words.building(id) })); });
    if (r.mastery) notes.push(tpl('goal.mastery', { n: api.fmt(r.mastery) }));
    if (r.beyond) notes.push(t('goal.beyond'));
    if (r.unverified) notes.push(t('goal.unverified'));
    if (g.kind === 'master' && r.state !== 'met' && r.state !== 'record') notes.push(t('goal.affinityNote'));
    const linked = r.state === 'record' || r.record.length;
    return {
      key: g.kind + ':' + g.target, at, state: r.state,
      title: words.title(g),
      said: r.state === 'met' || r.state === 'cap' ? tpl('goal.state.' + state, { level: words.level(g.kind, r.from) }) : t('goal.state.' + state),
      lines: r.lines.map((l, n) => ({
        key: n, state: l.have === null ? 'unknown' : l.short ? 'short' : 'covered', item: words.item(l.name), figures: figures(l),
        record: l.unknown.map(id => ({ id, label: tpl('goal.have', { item: id === l.pool ? t('item.' + id) : words.item(l.name) }) }))
      })),
      notes: notes.join(' '),
      href: linked ? '../' + tool[0] : null, link: linked ? api.fill(t('openIn'), { tool: api.tr(tool[1], tool[2]) }) : '',
      remove: tpl('goal.removeOne', { goal: words.subject(g.kind, g.target) })
    };
  });
}

// Edits go to the store the page works on, the one $store.ledger follows.
const ledger = () => globalThis.PlayerLedger.current();

Alpine.data('upgradeGoals', () => ({
  goals: [], kind: UpgradePriority.rules.goalKinds[0], target: '', level: '', seal: '', sealState: null,
  // The goal whose Remove button takes focus after a removal; -1 is the editor.
  focusAt: null,
  init() {
    this.pickKind(this.kind);
    Alpine.effect(() => { Alpine.store('i18n').v; this.goals = present(Alpine.store('ledger').snapshot); });
  },
  get readable() { return Alpine.store('ledger').ready; },
  get full() { return this.goals.length >= globalThis.PlayerLedger.GOALS.max; },
  get targets() { Alpine.store('i18n').v; const words = text(globalThis.BH); return UpgradeGoals.targets(this.kind).map(x => ({ id: x.id, name: words.subject(this.kind, x.id) })); },
  get levels() { Alpine.store('i18n').v; const words = text(globalThis.BH); return UpgradeGoals.levels(this.kind, this.target).map(v => ({ id: String(v), name: words.level(this.kind, v) })); },
  pickKind(kind) { this.kind = kind; const first = UpgradeGoals.targets(kind)[0]; this.pickTarget(first ? first.id : ''); },
  // A new target offers the level after the one the save holds.
  pickTarget(target) {
    this.target = target;
    const values = UpgradeGoals.levels(this.kind, target).map(String), snapshot = Alpine.store('ledger').snapshot;
    const held = snapshot ? UpgradeGoals.current(snapshot, this.kind, target) : null, at = held === null ? -1 : values.indexOf(String(held));
    this.level = at >= 0 && at + 1 < values.length ? values[at + 1] : values[0] || '';
  },
  say(key) { this.seal = text(globalThis.BH).t(key); this.sealState = key === 'saved' ? 'saved' : 'failed'; },
  save(list) {
    try { ledger().setPriorityGoals(list); this.say('saved'); return true; } catch (cause) { this.say('saveFailed'); return false; }
  },
  add() {
    if (!this.readable || !this.target || !this.level) return;
    const kind = this.kind, target = this.target, goal = { kind, target, level: kind === 'building' ? this.level : Number(this.level) }, list = ledger().priority().goals;
    const at = list.findIndex(g => g.kind === kind && g.target === target);
    if (at >= 0) list[at] = goal; else if (list.length < globalThis.PlayerLedger.GOALS.max) list.push(goal); else return;
    this.save(list);
  },
  // Focus moves to the goal that took its place, else the one before, else the editor.
  remove(at) {
    const list = ledger().priority().goals;
    list.splice(at, 1);
    if (!this.save(list)) return;
    this.focusAt = at < list.length ? at : list.length ? at - 1 : -1;
    this.$nextTick(() => { this.focusAt = null; });
  },
  // A balance recorded from a goal's line; blank leaves it unknown, never zero.
  record(id, value, valid) {
    if (!this.readable || value === '' || !valid) return;
    try { ledger().setBalance(id, Number(value)); this.say('saved'); } catch (cause) { this.say('saveFailed'); }
  }
}));
