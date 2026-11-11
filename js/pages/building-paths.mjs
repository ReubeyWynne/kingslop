/* Building requirements: a goal (one or more {building, level}) answered at once with every upgrade it takes,
   from BuildingPathsEngine.plan over the levels the reader has given. A level they have not given
   is assumed at the least their city can hold. The goal is a strip of building tiles; the plan is
   one card per building with its art, its level and the level it must reach. Tapping a level opens
   one small grid of levels (no long select), so the answer sharpens one building at a time.
   buildings/index.html binds to it with x-data="buildingPaths" on <main>.

   Levels are the shared save's buildings.levels (any building, numbered copies as house-1), so the
   Town Centre and Upgrade priority see them. ?guest, or a link carrying levels (have=), runs on the
   shared guest sheet (js/page-sheet.js, set up in js/building-paths-sheet.js) instead: the address bar then follows every edit and
   nothing reaches the save until Save as mine. The guest switch beside the goal reloads the page
   into or out of it. The goals and the construction speed settings ride in the address and,
   outside guest mode, are kept on this device (bh:building-goals, bh:construction) so the page
   opens as it was left. */
import { Alpine } from '../alpine.mjs';

// Read when the page starts: the engine, its data and the sheet are classic scripts listed after
// this module, which runs earlier.
let E, D, link, sheet, guest;
function load() {
  E = globalThis.BuildingPathsEngine; D = globalThis.BuildingPaths; sheet = globalThis.BuildingPathsSheet;
  link = sheet.link; guest = sheet.guest;
}
const PLANNED = ['town-center', 'embassy', 'barracks', 'range', 'stable', 'command-center', 'infirmary', 'war-academy', 'academy'];
const NAMES = { 'hero-hall': 'Hero Hall', watchtower: 'Watchtower' };
const ICONS = { bread: 'img/items/bread.webp', wood: 'img/items/wood.webp', stone: 'img/items/stone.webp', iron: 'img/items/iron.webp', truegold: 'img/kingshot/truegold.png', 'tempered-truegold': 'img/items/tempered-truegold.webp' };

function stored(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (ignored) { return null; } }
function keep(key, value) { if (!guest) try { localStorage.setItem(key, JSON.stringify(value)); } catch (ignored) {} }
const store = () => globalThis.Interactions.ledger();
const tier = id => { const m = /^TG ?(\d+)/.exec(id); return m ? Number(m[1]) : 0; };

/* The page's words, in the reader's language. */
function words(api) {
  function t(key, fallback, vars) { const text = api.tr('reqs.' + key, fallback); return vars ? api.fill(text, vars) : text; }
  function name(k) {
    const part = E.split(k), b = E.building(D, k), base = api.tr('town.building.' + part.id, (b && b.name) || NAMES[part.id] || part.id);
    return part.n ? t('numbered', '{building} {n}', { building: base, n: api.fmt(part.n) }) : base;
  }
  function levelName(k, id) {
    const b = E.building(D, k);
    if (b && b.single) return id === '0' ? t('notBuilt', 'not built') : t('built', 'built');
    return id === '0' ? t('notBuilt', 'not built') : id;
  }
  function duration(s) {
    const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), parts = [];
    if (d) parts.push(t('days', '{n}d', { n: api.fmt(d) }));
    if (h) parts.push(t('hours', '{n}h', { n: api.fmt(h) }));
    if (m && !d) parts.push(t('minutes', '{n}m', { n: api.fmt(m) }));
    if (!parts.length) parts.push(t('seconds', '{n}s', { n: api.fmt(s % 60) }));
    return parts.join(' ');
  }
  const item = r => api.tr('priority.item.' + r, r);
  const arrow = () => document.documentElement.dir === 'rtl' ? ' ← ' : ' → ';
  return { api, t, name, levelName, duration, item, arrow };
}

Alpine.data('buildingPaths', () => ({
  goals: [], cs: null, memory: {}, saveState: 'saved', picking: null, message: '', view: null,
  focusLevel: null, focusBack: null, guest: false,

  init() {
    load();
    this.guest = guest;
    const lastGoals = Array.isArray(stored('bh:building-goals')) ? E.goals(D, stored('bh:building-goals').map(x => Array.isArray(x) ? { building: x[0], level: x[1] } : null)) : [];
    this.goals = link.goals.length ? link.goals : lastGoals.length ? lastGoals : [{ building: 'town-center', level: null }];
    // Construction speed: the Bonus Overview figure or its parts, the boosts running when an upgrade
    // starts, and Pan's Master Architect level (from the save's Masters when it is not set here).
    const cs = { mode: 'overview', overview: null, vip: 0, saul: 0, research: null, wolf: 0, position: '', groundWorks: false, kvk: false, doubleTime: false, pan: null };
    if (link.speed !== null || link.doubleTime || link.pan !== null || link.saul !== null) Object.assign(cs, { overview: link.speed, doubleTime: link.doubleTime, pan: link.pan, saul: link.saul || 0 });
    else {
      const savedSpeed = stored('bh:construction');
      if (savedSpeed && typeof savedSpeed === 'object') Object.keys(cs).forEach(k => { if (k in savedSpeed) cs[k] = savedSpeed[k]; });
      else cs.overview = Number(stored('bh:construction-speed')) || null;
    }
    const snapshot = Alpine.store('ledger').snapshot;
    if (cs.pan === null && snapshot) {
      const architect = ((((snapshot.masters || {}).roster || {}).pan || {}).skills || [])[2];
      if (architect > 0) cs.pan = Math.min(5, architect);
    }
    this.cs = cs;
    this.normalise();
    Alpine.effect(() => {
      Alpine.store('i18n').v; Alpine.store('ledger').v;
      const next = this.present();
      // While the plan is unknown the page keeps what it showed.
      if (next) this.view = next;
      else if (!this.view) this.view = Object.freeze({ say: words(globalThis.BH), headline: '', total: [], time: '', points: { top: 0, sum: '', table: '' }, rows: [], steps: [], saul: '', flag: '', canAdd: false, speedSum: '' });
    });
    // The address follows the goal and speed; the shared sheet keeps the levels (have=) in step.
    Alpine.effect(() => { this.view; this.syncAddress(); });
  },

  readable() { return Alpine.store('ledger').ready; },
  have() {
    if (!this.readable()) return Object.assign({}, this.memory);
    const levels = (Alpine.store('ledger').snapshot.buildings || {}).levels || {}, out = {};
    Object.keys(levels).forEach(k => { if (E.building(D, k)) out[k] = levels[k]; });
    return out;
  },
  // What the save holds of an item, by the ledger's one rule: a confirmed amount or null.
  held(id) { const snapshot = Alpine.store('ledger').snapshot; if (!snapshot) return null; try { return globalThis.PlayerLedger.confirmed(snapshot, id); } catch (ignored) { return null; } },
  // The level after the one the save holds, else the second level on the path.
  nextLevel(k) {
    const list = E.levels(D, k), saved = this.have()[k], at = saved ? list.indexOf(saved) : -1;
    return list[Math.min(list.length - 1, Math.max(1, at + 1))];
  },
  // Every goal names a level on its path; the goals are kept for the next visit.
  normalise() {
    this.goals.forEach(g => { if (!g.level || E.levels(D, g.building).indexOf(g.level) < 0) g.level = this.nextLevel(g.building); });
    keep('bh:building-goals', this.goals.map(g => [g.building, g.level]));
  },

  // ── The answer ───────────────────────────────────────────────────────
  // Everything the page shows, as plain values, or null while the plan is unknown.
  present() {
    const api = globalThis.BH, say = words(api), t = say.t, cs = JSON.parse(JSON.stringify(this.cs)), goals = this.goals.map(g => ({ building: g.building, level: g.level }));
    const levels = this.have(), result = E.plan(D, goals, levels);
    if (result.state === 'unknown') return null;
    const boost = E.boost(cs), paid = list => E.discount(list, cs.saul);
    const time = steps => E.timed(steps, boost).time;
    const amount = n => api.compact(n);
    // A bill tile: the short form, with the exact figure in the tile's title. withHave puts what
    // you hold under each cost, and marks a cost you cannot cover yet.
    const costs = (total, small, withHave) => total.resources.map(r => {
      const have = withHave ? this.held(r) : null, short = have !== null && have < total.cost[r];
      return {
        r, art: '../' + ICONS[r], size: small ? 18 : 28, amount: amount(total.cost[r]) + (total.unverified[r] ? '◇' : ''), name: say.item(r),
        title: api.fmt(total.cost[r]) + ' ' + say.item(r) + (have !== null ? ' · ' + t('haveTitle', 'you have {n}', { n: api.fmt(have) }) : ''),
        short: have === null ? null : String(short),
        have: have === null ? '' : t(short ? 'haveShort' : 'haveEnough', short ? 'have {n}' : 'have {n} ✓', { n: amount(have) })
      };
    });
    const boostList = () => {
      const out = [];
      if (boost.speed) out.push('+' + api.fmt(boost.speed) + '%');
      if (boost.doubleTime) out.push(t('doubleTime', 'Double Time'));
      if (boost.pan) out.push(t('panShort', 'Pan −{h}h', { h: api.fmt(boost.pan) }));
      return out.join(' · ');
    };
    // Construction and general speedups the save holds, in minutes, beside the plan's time.
    const speedups = seconds => {
      const building = this.held('speedup-construction'), general = this.held('speedup-general');
      if (building === null && general === null) return '';
      const minutes = (building || 0) + (general || 0), need = Math.ceil(seconds / 60);
      return t(minutes >= need ? 'speedupsEnough' : 'speedupsShort', minutes >= need ? 'Your construction and general speedups ({time}) cover it.' : 'Your construction and general speedups: {time}.', { time: say.duration(minutes * 60) });
    };
    // Event points the plan scores, in the shared table (js/event-points.js): what spending its
    // Truegold scores, and that plus speeding up its whole time, at each event's best days.
    const points = (cost, steps) => {
      const P = globalThis.EventPoints, minutes = steps ? Math.floor(time(steps) / 60) : 0, rows = [];
      rows.push({ label: t('pointsSpent', 'Spent'), cells: P.forItems(cost) });
      if (minutes) rows.push({ label: t('pointsSpedUp', 'Sped up'), cells: P.forItems(cost, { construction: minutes }) });
      const top = P.most(rows);
      return { top, sum: top ? t('pointsUpTo', 'up to {n}', { n: api.fmt(top) }) : '', table: top ? P.table(api, rows, 'reqs-points').innerHTML : '' };
    };

    const mine = {}, goalName = result.goals.map(g => { mine[g.building] = true; return say.name(g.building) + ' ' + say.levelName(g.building, g.level); }).join(' + ');
    const out = { say, result, goalName };
    if (result.state === 'met') {
      Object.assign(out, { headline: t('met', 'Your {goal} is already done.', { goal: goalName }), total: costs(result.total), time: '', points: points({}, null) });
    } else {
      const allSteps = result.steps.map(x => x.step), paidTotal = E.total(paid(allSteps)), cover = speedups(time(allSteps));
      const timeText = say.duration(time(allSteps)) + (result.total.unverified.time ? '◇' : ''), list = boostList();
      Object.assign(out, {
        headline: t('headline', '{goal} · upgrades: {n}', { goal: goalName, n: api.fmt(result.total.steps) }),
        total: costs(paidTotal, false, true),
        time: (list ? t('timeWith', '{time} with {boosts}', { time: timeText, boosts: list }) : t('timeBase', '{time} base time, before construction speed', { time: timeText })) + (cover ? ' ' + cover : ''),
        points: points(paidTotal.cost, allSteps)
      });
    }

    // One row per building the plan raises, plus any level the reader gave that the goal's
    // path names, so a level set too high can be set back. Prerequisites first, the goal last.
    const keys = [], want = result.want || {}, why = result.why || {}, involved = E.involved(D, goals);
    (result.runs || []).forEach(r => { if (keys.indexOf(r.building) < 0 && !mine[r.building]) keys.push(r.building); });
    involved.forEach(k => { if (levels[k] !== undefined && keys.indexOf(k) < 0 && !mine[k]) keys.push(k); });
    result.goals.forEach(g => keys.push(g.building));
    const arrow = say.arrow().trim();
    out.rows = keys.map(k => {
      const at = result.current[k] || '0', to = want[k], part = E.steps(D, k, at, to || at), goalAt = goals.findIndex(g => g.building === k), known = levels[k] !== undefined;
      const state = !to || E.rank(to) <= E.rank(at) ? 'done' : known ? 'known' : 'assumed', done = state === 'done', name = say.name(k);
      const row = {
        key: k, state, goal: goalAt >= 0, name, tag: t('goalTag', 'goal'), art: '../img/buildings/' + E.split(k).id + '.webp',
        have: { text: say.levelName(k, known ? levels[k] : at), value: known ? levels[k] : '', ghost: !known, label: t('yourLevel', 'Your {building} level', { building: name }) + ': ' + (known ? say.levelName(k, levels[k]) : t('unsure', 'not sure ({level})', { level: say.levelName(k, at) })) },
        arrow: done ? '✓' : goalAt >= 0 ? arrow : arrow + ' ' + say.levelName(k, to),
        target: goalAt < 0 ? null : { text: say.levelName(k, goals[goalAt].level), value: goals[goalAt].level, index: String(goalAt), label: t('goalLevel', '{building} goal level', { building: name }) + ': ' + say.levelName(k, goals[goalAt].level) },
        tick: done ? null : { level: to, label: t('markDone', 'Mark {building} {level} done', { building: name, level: say.levelName(k, to) }) },
        reason: '', costs: null, time: ''
      };
      // Why a prerequisite goes this high, and which prerequisites a goal pulls in, so a goal
      // whose total jumps (Command Center TG 4 needs Embassy TG 4) says where the jump is.
      if (goalAt < 0 && why[k]) row.reason = t('neededFor', 'for {list}', { list: why[k].map(b => say.name(b.building) + ' ' + say.levelName(b.building, b.level)).join(', ') });
      else if (goalAt >= 0) {
        const pulled = Object.keys(why).filter(p => why[p].some(b => b.building === k));
        if (pulled.length) row.reason = t('pullsIn', 'needs {list}', { list: pulled.map(p => say.name(p) + ' ' + say.levelName(p, want[p])).join(', ') });
      }
      if (part.length) {
        const sub = E.total(paid(part));
        row.costs = costs(sub, true);
        if (sub.time) row.time = say.duration(time(part)) + (sub.unverified.time ? '◇' : '');
      }
      return row;
    });
    out.steps = (result.runs || []).map((r, at) => ({ key: 'run' + at, blocked: false, text: say.name(r.building) + ' ' + say.levelName(r.building, r.from) + say.arrow() + say.levelName(r.building, r.level), time: ' · ' + say.duration(time(r.steps)) }))
      .concat((result.blocked || []).map((b, at) => ({ key: 'blocked' + at, blocked: true, text: say.name(b.building) + ' ' + b.level + ' · ' + t('blocked', 'no source lists what this step needs'), time: '' })));
    const saulP = E.BOOST.saul[cs.saul || 0] || 0, any = Object.keys(result.total.unverified || {}).length;
    out.saul = saulP && result.state !== 'met' ? t('saulCost', 'Saul −{p}% on bread, wood, stone and iron', { p: api.fmt(saulP) }) : '';
    out.flag = any ? t('oneSource', '◇ Only one source gives this figure.') : '';
    out.canAdd = !guest && this.readable() && this.plannedGoals().length > 0 && result.state !== 'met';
    out.speedSum = boostList() ? '(' + boostList() + ')' : '';
    return Object.freeze(out);
  },
  // Your own levels carry the saved seal and the dots of the pages that read them; a guest
  // sheet is a loose leaf instead.
  get own() { return !guest && this.readable(); },
  get sealText() {
    if (!this.own) return '';
    return this.saveState === 'failed' ? this.view.say.t('saveFailed', 'Could not save that.') : this.view.say.api.tr('leads.saved', 'Saved');
  },
  get sharedLabel() { const api = this.view.say.api; return api.tr('town.nav', 'Town Centre') + ', ' + api.tr('priority.title', 'Upgrade priority'); },
  // The goal tiles: pressed for each goal, with the goal level on its badge.
  goalOf(k) { return this.goals.find(g => g.building === k); },
  pressed(k) { return String(Boolean(this.goalOf(k))); },
  badge(k) { const g = this.goalOf(k); return g ? E.short(g.level) : ''; },

  // ── Construction speed ───────────────────────────────────────────────
  // A choice of where the base figure comes from, then one row of chips per boost. Every chip is
  // a button; the two figures are number fields.
  get chips() {
    const api = this.view.say.api, t = this.view.say.t, cs = this.cs, none = t('none', 'none');
    const chip = (key, value, text, on, label) => ({ key, value: String(value), text, on: String(on), label: label || null, toggle: false });
    const minister = api.tr('town.training.minister', 'Chief Minister');
    return {
      mode: [chip('mode', 'overview', t('speedFrom', 'Bonus Overview'), cs.mode !== 'parts'), chip('mode', 'parts', t('speedAddUp', 'Add it up'), cs.mode === 'parts')],
      vip: [chip('vip', 0, '—', !cs.vip, none), chip('vip', 4, 'VIP 4–8 · +10%', cs.vip === 4), chip('vip', 9, 'VIP 9+ · +20%', cs.vip === 9)],
      saul: E.BOOST.saul.map((p, i) => chip('saul', i, i ? api.fmt(p) + '%' : '—', (cs.saul || 0) === i, i ? t('skillLevel', 'level {n}', { n: i }) + ', ' + api.fmt(p) + '%' : none)),
      wolf: E.BOOST.wolf.map((p, i) => chip('wolf', i, i ? '+' + api.fmt(p) + '%' : '—', (cs.wolf || 0) === i, i ? t('skillLevel', 'level {n}', { n: i }) + ', +' + p + '%' : none)),
      position: [chip('position', '', '—', !cs.position, none), chip('position', 'minister', minister + ' · +10%', cs.position === 'minister'),
        chip('position', 'highKing', minister + ' + ' + api.tr('town.training.highKing', 'High King') + ' · +15%◇', cs.position === 'highKing')],
      toggles: [['groundWorks', t('groundWorks', 'Ground Works') + ' · +10%'], ['kvk', 'KvK · +5%'], ['doubleTime', t('doubleTime', 'Double Time') + ' · −20%']].map(x => Object.assign(chip(x[0], '', x[1], Boolean(cs[x[0]])), { toggle: true })),
      pan: E.BOOST.pan.map((h, i) => chip('pan', i, i ? '−' + api.fmt(h) + 'h' : '—', (cs.pan || 0) === i, i ? t('skillLevel', 'level {n}', { n: i }) + ', −' + h + 'h' : none))
    };
  },
  setChip(chip) {
    if (chip.toggle) this.cs[chip.key] = !this.cs[chip.key];
    else this.cs[chip.key] = chip.key === 'mode' || chip.key === 'position' ? chip.value : Number(chip.value);
    keep('bh:construction', this.cs);
  },
  figure(field) { return this.cs[field] === null ? '' : String(this.cs[field]); },
  setFigure(field, raw) {
    const n = Number(raw);
    this.cs[field] = raw !== '' && isFinite(n) && n >= 0 && n <= 1000 ? n : null;
    keep('bh:construction', this.cs);
  },

  // ── The level grid ───────────────────────────────────────────────────
  // Up to 30 levels show at once; past that, one tab for levels 1–30 (and 30-1…30-4) and one per
  // TG, so every level is two taps away at most and nothing scrolls.
  get picker() {
    const p = this.picking, say = this.view.say, t = say.t;
    if (!p) return { title: '', art: null, tiers: [], extra: [], drop: '', grid: [] };
    const k = p.building, list = E.levels(D, k).slice(1), tiers = [];
    list.forEach(id => { if (tiers.indexOf(tier(id)) < 0) tiers.push(tier(id)); });
    const choice = (value, text, wide) => ({ value, text, wide, pressed: String(value === p.value) });
    return {
      title: p.kind === 'goal' ? t('goalLevel', '{building} goal level', { building: say.name(k) }) : t('yourLevel', 'Your {building} level', { building: say.name(k) }),
      art: '../img/buildings/' + E.split(k).id + '.webp',
      tiers: tiers.length > 1 ? tiers.map(n => ({ n, text: n ? 'TG' + n : '1–30', pressed: String(n === p.tier) })) : [],
      extra: p.kind === 'have' ? [choice('', t('unsureShort', 'not sure'), true), choice('0', say.levelName(k, '0'), true)] : [],
      drop: p.kind === 'goal' && this.goals.length > 1 ? t('removeFromGoal', 'Remove from goal') : '',
      grid: list.filter(id => tiers.length < 2 || tier(id) === p.tier).map(id => choice(id, E.building(D, k).single ? say.levelName(k, id) : E.short(id), false))
    };
  },
  openPicker(kind, k, value, index, fromTile) {
    const now = value === undefined ? '' : value;
    this.picking = { kind, building: k, value: now, index, fromTile: Boolean(fromTile), tier: now && now !== '0' ? tier(now) : 0 };
    // The level the reader has takes focus, else the grid's first.
    const shown = this.picker, on = shown.grid.concat(shown.extra).find(c => c.pressed === 'true');
    this.focusLevel = on ? on.value : shown.grid.length ? shown.grid[0].value : null;
    this.$nextTick(() => { this.focusLevel = null; });
  },
  focused(value) { return this.focusLevel !== null && this.focusLevel === value; },
  // A tile opens its goal level at once: a new building joins the goal first, one already in it
  // can be removed from the grid.
  pick(k) {
    let at = this.goals.findIndex(g => g.building === k);
    if (at < 0) { this.goals.push({ building: k, level: null }); at = this.goals.length - 1; this.normalise(); }
    this.openPicker('goal', k, this.goals[at].level, at, true);
  },
  open(kind, k) {
    const row = this.view.rows.find(r => r.key === k);
    if (kind === 'goal') this.openPicker('goal', k, row.target.value, Number(row.target.index));
    else this.openPicker('have', k, row.have.value, null);
  },
  // A TG tab shows that tier's levels; tapping it again (a double tap) takes the TG level itself.
  chooseTier(n) {
    if (!this.picking) return;
    if (n && this.picking.tier === n && E.levels(D, this.picking.building).indexOf('TG ' + n) >= 0) { this.choose('TG ' + n); return; }
    this.picking.tier = n;
  },
  choose(value) {
    const p = this.picking;
    if (!p) return;
    this.closePicker();
    if (p.kind === 'goal') { this.goals[p.index].level = value; this.normalise(); }
    else this.setLevel(p.building, value === '' ? null : value);
  },
  drop() {
    if (!this.picking || this.goals.length < 2) return;
    const index = this.picking.index;
    this.closePicker();
    this.goals.splice(index, 1);
    this.normalise();
  },
  // Focus goes back to what opened the grid: the tile, or the card's level.
  closePicker() {
    const back = this.picking;
    if (!back) return;
    this.picking = null;
    this.focusBack = back.fromTile ? { kind: 'tile', building: back.building } : { kind: back.kind, building: back.building };
    this.$nextTick(() => { this.$nextTick(() => { this.focusBack = null; }); });
  },
  refocus(kind, k) { return Boolean(this.focusBack) && this.focusBack.kind === kind && this.focusBack.building === k; },

  // ── Writes ───────────────────────────────────────────────────────────
  setLevel(k, value) {
    if (!this.readable()) { const next = Object.assign({}, this.memory); if (value === null) delete next[k]; else next[k] = value; this.memory = next; return; }
    try { store().setBuilding(k, value, 'manual'); this.saveState = 'saved'; } catch (cause) { this.saveState = 'failed'; }
  },
  // A card's tick accepts that upgrade as done: the building's level becomes the one the plan
  // needs, and the plan shrinks by it.
  markDone(k, level) { this.setLevel(k, level); },
  plannedGoals() { return E.goals(D, this.goals).filter(g => PLANNED.indexOf(g.building) >= 0); },
  addGoal() {
    const t = this.view.say.t;
    try {
      const target = store(), mineNow = this.plannedGoals();
      const list = target.priority().goals.filter(g => !(g.kind === 'building' && mineNow.some(m => m.building === g.target)));
      mineNow.forEach(g => list.push({ kind: 'building', target: g.building, level: g.level }));
      target.setPriorityGoals(list);
      this.message = t('goalAdded', 'Added to your goals on Upgrade priority.');
    } catch (cause) { this.message = t('saveFailed', 'Could not save that.'); }
  },
  address(withLevels) {
    const b = E.boost(this.cs), goals = this.goals.map(g => ({ building: g.building, level: g.level }));
    const state = { goals, speed: b.speed, doubleTime: b.doubleTime, pan: this.cs.pan || 0, saul: this.cs.saul || 0 };
    if (withLevels) { const h = this.have(); state.have = {}; E.involved(D, goals).forEach(k => { if (h[k] !== undefined) state.have[k] = h[k]; }); }
    return E.encode(state);
  },
  syncAddress() {
    const kept = new URLSearchParams(location.search), was = kept.getAll('have')[0];
    ['b', 'to', 'goal', 'have', 'speed', 'dt', 'pan', 'saul'].forEach(k => kept.delete(k));
    const rest = kept.toString().replace(/(^|&)guest=(&|$)/, '$1guest$2'), levels = was === undefined ? '' : '&have=' + was;
    try { history.replaceState(history.state, '', location.pathname + '?' + (rest ? rest + '&' : '') + this.address(false) + levels + location.hash); } catch (ignored) {}
    sheet.sync(this.goals.map(g => ({ building: g.building, level: g.level })));
  },
  copy() {
    const url = new URL(location.pathname + '?' + this.address(false), location.href).href;
    const done = () => { this.message = this.view.say.t('copied', 'Link copied.'); };
    try { navigator.clipboard.writeText(url).then(done, () => { this.message = url; }); } catch (ignored) { this.message = url; }
  }
}));
