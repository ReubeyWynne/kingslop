/* The Town Centre: your inventory as shelves of tiles, one dialog that edits whatever was
   tapped, and the event points it can score, day by day. Arithmetic lives in
   town-centre-engine.mjs; every count lives in the shared player ledger, so the hero gear,
   governor and event pages see each edit made here. town-centre/index.html binds to it with
   x-data="townCentre" on <main>. The shelves and the event switch are the shared tabs widget,
   whose tabs:select picks the shelf, the troop board and the event. The governor shelf is
   the shared governor profile (js/pages/governor-profile.mjs); the hero and master shelves
   are their pages' rosters.

   Tiles look themselves up (count, duration, building, training, piece) in the view, worked
   out once per save, language switch or event choice. */
import { Alpine } from '../alpine.mjs';

const EN = {
  dayTitle: '{event}, day {day}', dayLabel: 'Day {n}', dayEmpty: 'No recorded inventory scores on this day.',
  complete: 'All required counts entered.', partial: 'Partial estimate. Missing counts or levels are excluded.',
  alsoNone: 'No other activities listed.', planEmpty: 'Record your inventory to see the best days.',
  planRow: '{item}: {points} points', bestDay: '{n}, best day', saved: 'Saved', saveFailed: 'Could not save', topRate: 'best {rate} each · {event} day {day}', topRateMinute: 'best {rate} a minute · {event} day {day}', noRate: 'No rate per item.',
  scoreGain: '+{n} score', govGear: 'Governor gear score', govCharms: 'Governor charm score',
  gainBoth: 'Available upgrades: +{gear} gear score · +{charms} charm score.',
  missingDetails: 'Missing details',
  missingSpeedup: '{kind} speedups',
  missingGovGear: 'Governor gear levels and materials',
  missingGovCharms: 'Governor charm levels and materials',
  pieces: '{n} of 12 pieces set', partialScore: '{n}*',
  'speedup.general': 'General', 'speedup.construction': 'Construction', 'speedup.research': 'Research', 'speedup.training': 'Training', 'speedup.learning': 'Learning', 'speedup.healing': 'Healing',
  'unit.d': 'd', 'unit.h': 'h', 'unit.m': 'm',
  heroAmount: '{n} usable', heroGearPieces: 'your hero gear',
  buildings: 'your buildings', buildingNamed: '{building} level', pastTG8: 'building costs past TG 8 (not verified yet)', notBuilt: 'not built',
  buildingTo: 'can reach {level}', buildingStuck: 'nothing it can take yet',
  buildingSpend: 'Following your priorities, your buildings take {gold} of {goldHave} Truegold and {tempered} of {temperedHave} Tempered Truegold, worth {points} KvK prep points.',
  buildingSpendMax: 'Spending for points only, they could take {gold} Truegold and {tempered} Tempered Truegold, worth {points} points.',
  buildingMax: 'Truegold follows your building priorities. Spending it for points only would score up to {points} ({extra} more).',
  setAllPick: 'choose a level', 'tier.1': 'Lead', 'tier.2': 'Keep up', 'tier.3': 'Spare', 'tier.0': 'Skip', moveUp: 'move {building} up', moveDown: 'move {building} down', tierFor: '{building} priority',
  buildingSpendUnknown: 'Set your building levels to see how much Truegold they can take.',
  buildingPlan: 'With what you have counted, this can reach {level}: {steps} steps, {gold} Truegold and {tempered} Tempered Truegold.',
  buildingPlanNone: 'Nothing more goes here in this plan. Your Truegold and resources pay for cheaper steps first, and each step waits for its Town Centre level, its prerequisites and every resource it costs.',
  'troopLine.batch': 'T{tier} troops, pre-trained', 'troopLine.training': 'T{tier} troops, training speedups', 'troopLine.general': 'T{tier} troops, general speedups',
  'training-tiers': 'the tier each camp trains', 'training-capacity': 'training capacity', 'training-speed': 'training speed', troopRate: 'T{tier} troop points for this event', troopCost: 'T{tier} training costs (not verified yet)',
  speedPercent: '{n}%', tierLabel: 'T{n}', batchOf: 'batch of {n}',
  speedUnit: 'training speed, %', speedHint: 'Bonus Overview, Training Speed, without the temporary buffs below.',
  positionHint: 'Noble Advisor or Chief Minister, never both. Each gives more while your kingdom holds the High King, which ends before KvK.',
  buffOff: '—', buffPercent: '+{n}%', planOn: 'on',
  capacityUnit: 'troops per batch', capacityHint: 'How many troops one camp trains at once, without the capacity buff.',
  tierHint: 'T10 and T11 Truegold troops train in the same time for the same cost as plain T10 and T11.',
  troopTitle: 'Best troop day: {event}, day {day}', 'troopLine.batchBuff': 'T{tier} troops, tripled batch',
  speedSame: '{n}%', speedSplit: '{batch}%, {day}% on the day', troopNoStart: 'set your training speed and capacity',
  troopUnchecked: 'T{tier} costs are not checked against your resources yet.'
};
const EVENTS = { prep: ['ks.today.kickerPrep', 'KvK prep'], sg: ['ks.governor.title', 'Strongest Governor'], brawl: ['ks.brawl.title', 'Alliance Brawl'] };
const TROOPS = { inf: 'Infantry', cav: 'Cavalry', arc: 'Archer' };
const ART = { inf: 'infantry', cav: 'cavalry', arc: 'archer' };

/* The page's words, in the reader's language. */
function words(api) {
  const t = key => api.tr('town.' + key, EN[key]);
  const fill = (key, values) => api.fill(t(key), values);
  const eventName = event => api.tr(EVENTS[event][0], EVENTS[event][1]);
  const locale = () => document.documentElement.lang || undefined;
  function duration(minutes) {
    const d = Math.floor(minutes / 1440), h = Math.floor(minutes % 1440 / 60), m = minutes % 60, out = [];
    if (d) out.push(api.fmt(d) + t('unit.d'));
    if (h) out.push(api.fmt(h) + t('unit.h'));
    if (m || !out.length) out.push(api.fmt(m) + t('unit.m'));
    return out.join(' ');
  }
  const buildingName = building => api.tr('town.building.' + building.id, building.name);
  function name(id) {
    const item = globalThis.EventRuleData.items.find(entry => entry.id === id);
    if (item) return api.tr(item.key, item.label);
    if (/^speedup-/.test(id)) return t('speedup.' + id.slice(8));
    if (id === 'governor-gear') return t('govGear');
    if (id === 'governor-charms') return t('govCharms');
    if (id === 'hero-gear-xp') return api.tr('gear.xpTotal', 'XP total');
    if (id === 'spare-mythic-gear') return api.tr('gear.mythic', 'Spare mythic gear');
    if (id === 'hero-gear-pieces') return t('heroGearPieces');
    const site = globalThis.BuildingSpend.missing(id);
    if (site) return site.kind === 'building' ? fill('buildingNamed', { building: buildingName(site.building) }) : t(site.kind);
    const troop = /^troops-(batch|training|general)-t(\d+)$/.exec(id);
    if (troop) return fill('troopLine.' + troop[1], { tier: troop[2] });
    const train = globalThis.TroopSpend.missing(id);
    if (train) return train.tier === null ? t(train.kind) : fill(train.kind === 'rate' ? 'troopRate' : 'troopCost', { tier: train.tier });
    const need = globalThis.HeroSpend.missing(id);
    if (need) return globalThis.HeroPoints.missing(api, need);
    if (id === globalThis.MasterSpend.GENERAL) return api.tr('masters.generalEmblem', 'General Master Emblems');
    const master = globalThis.MasterSpend.missing(id);
    if (master) return globalThis.MasterPoints.missing(api, master);
    return id;
  }
  // Training time from seconds, rounded up to the minute so a batch is never started too late.
  const seconds = secs => duration(Math.ceil(secs / 60));
  const amount = line => line.kind === 'speedup' ? duration(line.amount) : line.kind === 'governor' ? fill('scoreGain', { n: api.fmt(line.amount) }) : line.kind === 'usable' ? fill('heroAmount', { n: api.fmt(line.amount) }) : api.fmt(line.amount);
  const percent = n => new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(n);
  const quality = q => api.tr(q === 'mythic' ? 'gear.mythicQuality' : 'gear.' + q, q.charAt(0).toUpperCase() + q.slice(1));
  return { api, t, fill, eventName, duration, name, seconds, amount, percent, quality, locale };
}

/* The points section, for the chosen event and day. */
function points(say, results, event, chosen) {
  const api = say.api, T = globalThis.TownCentre, result = results[event];
  const mine = T.buildingPoints(result.buildings, event), most = T.buildingPoints(result.buildingsMax, event);
  const top = Math.max(...result.days.map(day => day.total).concat([1]));
  const selected = result.days[chosen - 1];
  return {
    totals: Object.fromEntries(Object.keys(EVENTS).map(key => [key, { text: api.fmt(results[key].total), partial: String(!results[key].complete) }])),
    buildingMax: most > mine ? say.fill('buildingMax', { points: api.fmt(most), extra: api.fmt(most - mine) }) : '',
    coverage: say.t(result.complete ? 'complete' : 'partial'),
    complete: result.complete,
    missing: result.unknown.map(id => /^speedup-/.test(id) ? say.fill('missingSpeedup', { kind: say.name(id) }) : id === 'governor-gear' ? say.t('missingGovGear') : id === 'governor-charms' ? say.t('missingGovCharms') : say.name(id)),
    days: result.days.map(day => ({ day: day.day, label: say.fill('dayLabel', { n: api.fmt(day.day) }), total: api.fmt(day.total), pressed: String(day.day === chosen), style: '--share: ' + (day.total / top).toFixed(3) })),
    dayTitle: say.fill('dayTitle', { event: say.eventName(event), day: api.fmt(selected.day) }),
    lines: selected.lines.map((line, at) => ({ key: at, name: say.name(line.id), amount: say.amount(line), rate: api.fmt(line.rate), points: api.fmt(line.points) })),
    dayEmpty: selected.lines.length ? '' : say.t('dayEmpty'),
    also: selected.unquantified.length ? selected.unquantified.map(row => row.label + ' · ' + row.points) : [say.t('alsoNone')],
    // Each item carries the event's day strip, its own scoring day marked.
    plan: result.lines.length ? result.lines.map((line, at) => ({
      key: at, text: say.fill('planRow', { item: say.name(line.id), points: api.fmt(line.points) }),
      strip: result.days.map(day => ({ n: api.fmt(day.day), best: day.day === line.day ? '' : null, label: day.day === line.day ? say.fill('bestDay', { n: api.fmt(day.day) }) : null }))
    })) : [{ key: 0, text: say.t('planEmpty'), strip: [] }]
  };
}

/* Troops: the training facts, and the best troop day for the selected event, with when to
   start the batch above its lines. */
function troops(say, snapshot, found, event) {
  const api = say.api, R = globalThis.TroopSpend, plan = found && found.plan, shown = Boolean(plan && plan.troops);
  const facts = (snapshot.training || { facts: {} }).facts || {}, plans = snapshot.preferences.training || {};
  const buff = Boolean(plans.buff), size = Object.hasOwn(facts, 'capacity') ? facts.capacity * (buff ? R.BUFF : 1) : null;
  const out = { shown, buff, buffText: '×' + api.fmt(buff ? R.BUFF : 1), speeds: R.speeds(facts, plans, event), plans, facts, size, waiting: [], note: '' };
  if (shown) {
    let start = '—';
    if (plan.batch.seconds) {
      const opens = globalThis.EventRules.opens(event, found.day, Date.now()), at = new Date(opens - plan.batch.seconds * 1000);
      start = at.toLocaleString(say.locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }) + ' UTC';
    }
    const speed = plan.speed;
    Object.assign(out, {
      title: say.fill('troopTitle', { event: say.eventName(event), day: api.fmt(found.day) }),
      startAt: start,
      takes: plan.batch.seconds ? say.seconds(plan.batch.seconds) : say.t('troopNoStart'),
      speed: speed.batch === null ? '?' : speed.batch === speed.day ? say.fill('speedSame', { n: say.percent(speed.batch) }) : say.fill('speedSplit', { batch: say.percent(speed.batch), day: say.percent(speed.day) }),
      lines: plan.lines.filter(line => line.troops).map((line, at) => ({ key: at, name: say.fill('troopLine.' + (line.group === 'batch' && plan.buff ? 'batchBuff' : line.group), { tier: line.tier }), cells: [line.troops, line.rate, line.points].map(n => api.fmt(n)) })),
      count: api.fmt(plan.troops), points: api.fmt(plan.points),
      note: plan.unverified.map(id => say.fill('troopUnchecked', { tier: R.missing(id).tier })).join(' ')
    });
  } else {
    if (!Object.hasOwn(facts, 'speed')) out.waiting.push(say.t('training-speed'));
    if (!Object.hasOwn(facts, 'capacity')) out.waiting.push(say.t('training-capacity'));
    if (!R.TYPES.some(type => Object.hasOwn(facts, type.id))) out.waiting.push(say.t('training-tiers'));
  }
  return out;
}

const HERO = Object.freeze({ shown: { quality: '', level: '', mastery: '', masteryHidden: true, band: '' }, art: '../img/hero-gear/infantry-helm.webp', quality: null, level: '', mastery: '', max: 200, masteryRow: false });
const store = () => globalThis.Interactions.ledger();
// Unknown counts show a dim ?, none a solid 0.
const tally = n => n === null || n === undefined ? 'unknown' : n === 0 ? 'zero' : null;

Alpine.data('townCentre', () => ({
  event: 'prep', chosen: { prep: null, sg: null, brawl: null }, shelf: 'bag', troop: 'inf',
  editing: null, seal: 'saved', view: null, focusMove: null, focusField: null,

  init() {
    Alpine.effect(() => {
      Alpine.store('i18n').v; Alpine.store('ledger').v;
      const event = this.event, chosen = this.chosen[event];
      this.view = this.present(event, chosen);
      // The day first shown stays chosen while counts change, until another is picked.
      if (!chosen) this.chosen[event] = this.view.day;
    });
  },
  // Everything the page shows, as plain values. Kept frozen, so Alpine leaves it unwrapped.
  present(event, chosen) {
    const api = globalThis.BH, say = words(api), T = globalThis.TownCentre, calculator = T.forLedger(store());
    const calculation = calculator.all(), results = calculation.results, result = results[event];
    const day = chosen || result.days.reduce((best, d) => d.total > best.total ? d : best, result.days[0]).day;
    const snapshot = calculator.snapshot(), shared = calculator.context();
    return Object.freeze({
      api, say, snapshot, shared, day,
      points: points(say, results, event, day),
      troops: troops(say, snapshot, results[event].troops, event)
    });
  },
  get pick() { return this.view.day; },
  select(detail) {
    if (detail.binding === 'town-event' && Object.hasOwn(EVENTS, detail.value)) this.event = detail.value;
    else if (detail.binding === 'town-shelf') this.shelf = detail.value;
    else if (detail.binding === 'town-troop') this.troop = detail.value;
  },
  chooseDay(day) { this.chosen[this.event] = day; },

  // ── Tiles ────────────────────────────────────────────────────────────
  count(id) {
    const amount = globalThis.PlayerLedger.confirmed(this.view.snapshot, id), shown = this.view.api.tileText(amount);
    return { state: amount === null ? 'unknown' : 'confirmed', tally: tally(amount), text: shown.text, title: shown.title || null };
  },
  duration(id) {
    const minutes = globalThis.PlayerLedger.confirmed(this.view.snapshot, id);
    return { state: minutes === null ? 'unknown' : 'confirmed', tally: tally(minutes), text: minutes === null ? '?' : this.view.say.duration(minutes) };
  },
  building(id) {
    const levels = (this.view.snapshot.buildings && this.view.snapshot.buildings.levels) || {}, level = Object.hasOwn(levels, id) ? levels[id] : null, step = this.view.shared.buildings.buildings[id], say = this.view.say;
    return {
      state: level === null ? 'unknown' : 'confirmed', tally: tally(level === null ? null : level === '0' ? 0 : 1),
      text: level === null ? '?' : level === '0' ? '—' : level,
      plan: !step ? '' : step.steps ? say.fill('buildingTo', { level: step.to }) : say.t('buildingStuck')
    };
  },
  get buildingSpend() {
    const api = this.view.api, say = this.view.say, T = globalThis.TownCentre, plan = this.view.shared.buildings, most = this.view.shared.buildingsMax;
    const gold = plan.items.truegold, tempered = plan.items['tempered-truegold'], amount = item => item.amount === null ? '—' : api.fmt(item.amount);
    let text = !plan.recorded ? say.t('buildingSpendUnknown') : say.fill('buildingSpend', {
      gold: amount(gold), goldHave: gold.pool === null ? '?' : api.fmt(gold.pool),
      tempered: amount(tempered), temperedHave: tempered.pool === null ? '?' : api.fmt(tempered.pool), points: api.fmt(T.buildingPoints(plan, 'prep'))
    });
    if (plan.recorded && T.buildingPoints(most, 'prep') > T.buildingPoints(plan, 'prep')) text += ' ' + say.fill('buildingSpendMax', { gold: amount(most.items.truegold), tempered: amount(most.items['tempered-truegold']), points: api.fmt(T.buildingPoints(most, 'prep')) });
    return text;
  },
  buildingLabel(id) { const b = globalThis.BuildingSpend.BUILDINGS.find(entry => entry.id === id); return this.view.api.tr('town.building.' + id, b ? b.name : id); },
  // One row per building in tie-break order: art, name, priority and move buttons.
  get priorities() {
    const prefs = this.view.shared.buildings.priorities, say = this.view.say;
    return prefs.order.map((id, at) => {
      const name = this.buildingLabel(id);
      return { id, at, name, tier: String(prefs.tiers[id]), label: say.fill('tierFor', { building: name }), up: say.fill('moveUp', { building: name }), down: say.fill('moveDown', { building: name }), first: at === 0, last: at === prefs.order.length - 1 };
    });
  },
  get tiers() { const say = this.view.say; return globalThis.BuildingSpend.TIERS.map(tier => ({ id: String(tier), name: say.t('tier.' + tier) })); },
  get setAllOptions() { return [{ id: '', name: this.view.say.t('setAllPick') }].concat(globalThis.BuildingSpend.options('town-center').map(id => ({ id, name: id }))); },
  // After a move, the same button in its new row takes focus back.
  refocus(id, step) { return Boolean(this.focusMove) && this.focusMove.id === id && this.focusMove.step === step; },
  training(key) {
    const troops = this.view.troops, say = this.view.say, api = this.view.api, facts = troops.facts;
    if (key === 'position') return { state: troops.plans.position ? 'confirmed' : 'off', tally: null, text: troops.plans.position ? say.fill('buffPercent', { n: say.percent(troops.speeds.position) }) : say.t('buffOff') };
    const fact = Object.hasOwn(facts, key) ? facts[key] : undefined;
    return {
      state: fact === undefined ? 'unknown' : 'confirmed', tally: tally(fact === undefined ? null : fact),
      text: fact === undefined ? '?' : key === 'speed' ? say.fill('speedPercent', { n: say.percent(fact) }) : key === 'capacity' ? api.fmt(fact) : say.fill('tierLabel', { n: fact }),
      camp: fact !== undefined && troops.size !== null ? say.fill('batchOf', { n: api.fmt(troops.size) }) : ''
    };
  },
  plan(key) {
    const on = Boolean(this.view.troops.plans[key]), say = this.view.say;
    return { pressed: String(on), state: on ? 'on' : 'off', text: !on ? say.t('buffOff') : key === 'mobilize' ? say.fill('buffPercent', { n: say.percent(globalThis.TroopSpend.BUFFS.mobilize) }) : say.t('planOn') };
  },
  piece(id) {
    const pieces = this.view.snapshot.heroGear.pieces, piece = Object.hasOwn(pieces, id) ? pieces[id] : null, api = this.view.api;
    return {
      state: piece ? 'set' : 'unset', quality: piece ? piece.quality : '',
      level: piece ? '+' + api.fmt(piece.quality === 'red' ? piece.level - 100 : piece.level) : '',
      mastery: piece ? api.fmt(piece.mastery) : '', masteryHidden: !piece || piece.quality === 'epic',
      band: piece ? this.view.say.quality(piece.quality) : api.tr('gov.notSet', 'not set'), piece
    };
  },
  get pieces() { const all = this.view.snapshot.heroGear.pieces, set = Object.keys(all).filter(id => all[id]).length; return this.view.say.fill('pieces', { n: this.view.api.fmt(set) }); },
  get gain() {
    const score = this.view.shared.score, api = this.view.api, gear = score.gear.score, charms = score.charms.score;
    return this.view.say.fill('gainBoth', { gear: gear === null ? '?' : api.fmt(gear), charms: charms === null ? '?' : api.fmt(charms) });
  },
  get sealText() { return this.view.say.t(this.seal === 'failed' ? 'saveFailed' : 'saved'); },

  // ── The dialog ───────────────────────────────────────────────────────
  // A tile opens the editor for its kind; the title is the tile's own name.
  edit(kind, id, key, n) {
    const api = this.view.api, type = kind === 'training' ? (id === 'position' ? 'position' : /^(speed|capacity)$/.test(id) ? 'training' : 'tier') : kind;
    let title = api.fill(api.tr(key, key), { n });
    if (type === 'hero') title = api.tr('gear.' + id.split('-')[0], TROOPS[id.split('-')[0]]) + ' · ' + title;
    this.editing = { type, id, title };
    // The editor's first field takes focus, except under the hero art.
    this.focusField = type === 'hero' ? null : type;
    this.$nextTick(() => { this.focusField = null; });
  },
  get panel() { return this.editing ? this.editing.type : null; },
  rate(id) {
    const T = globalThis.TownCentre, top = T.topRate(id), say = this.view.say;
    if (!top) return say.t('noRate');
    return say.fill(/^speedup-/.test(id) ? 'topRateMinute' : 'topRate', { rate: this.view.api.fmt(top.rate), event: say.eventName(top.event), day: this.view.api.fmt(top.day) });
  },
  // The editor's values, as text for its fields.
  get form() {
    const e = this.editing;
    if (!e) return {};
    const snapshot = this.view.snapshot, say = this.view.say, text = v => v === null || v === undefined ? '' : String(v);
    const facts = (snapshot.training && snapshot.training.facts) || {};
    if (e.type === 'count' || e.type === 'duration') return { value: text(globalThis.PlayerLedger.confirmed(snapshot, e.id)), rate: this.rate(e.id) };
    if (e.type === 'hero') {
      const shown = this.piece(e.id), piece = shown.piece, [troop, slot] = e.id.split('-');
      return { shown, art: '../img/hero-gear/' + ART[troop] + '-' + slot + '.webp', quality: piece ? piece.quality : null, level: text(piece ? piece.level : null), mastery: text(piece ? piece.mastery : null), max: piece && piece.quality === 'epic' ? 80 : piece && piece.quality === 'mythic' ? 100 : 200, masteryRow: Boolean(piece) && piece.quality === 'epic' };
    }
    if (e.type === 'training') {
      const speed = e.id === 'speed';
      return { value: text(Object.hasOwn(facts, e.id) ? facts[e.id] : null), step: speed ? 'any' : '1', min: speed ? '0' : '1', mode: speed ? 'decimal' : 'numeric', unit: say.t(speed ? 'speedUnit' : 'capacityUnit'), hint: say.t(speed ? 'speedHint' : 'capacityHint') };
    }
    if (e.type === 'position') return { value: (snapshot.preferences.training && snapshot.preferences.training.position) || '', hint: say.t('positionHint') };
    if (e.type === 'tier') return { value: Object.hasOwn(facts, e.id) ? String(facts[e.id]) : '', hint: say.t('tierHint') };
    if (e.type === 'building') {
      const levels = snapshot.buildings && snapshot.buildings.levels, step = this.view.shared.buildings.buildings[e.id], api = this.view.api;
      return {
        value: levels && Object.hasOwn(levels, e.id) ? levels[e.id] : '',
        options: [{ id: '', name: api.tr('gov.notSet', 'not set') }].concat(globalThis.BuildingSpend.options(e.id).map(id => ({ id, name: id === '0' ? say.t('notBuilt') : id }))),
        plan: !step ? '' : step.steps ? say.fill('buildingPlan', { level: step.to, steps: api.fmt(step.steps), gold: api.fmt(step.truegold), tempered: api.fmt(step.tempered) }) : say.t('buildingPlanNone')
      };
    }
    return {};
  },

  // The hero editor's fields, blank while another editor is open.
  get hero() { return this.panel === 'hero' ? this.form : HERO; },
  qualityPressed(quality) { return String(this.hero.quality === quality); },

  // ── Writes ───────────────────────────────────────────────────────────
  // A failed write shows on the seal; the tiles still show the save as it is.
  write(fn) { try { fn(store()); this.seal = 'saved'; } catch (cause) { this.seal = 'failed'; } },
  setBalance(raw, valid) { if (!this.editing || !valid) return; this.write(s => s.setBalance(this.editing.id, raw === '' ? null : Number(raw))); },
  writePiece(change) {
    const H = globalThis.HeroGear, s = store(), id = this.editing.id, snapshot = s.snapshot(), old = Object.hasOwn(snapshot.heroGear.pieces, id) ? snapshot.heroGear.pieces[id] : null;
    const next = Object.assign({ quality: 'mythic', level: 0, mastery: 0 }, old || {}, change), state = s.heroGear(H);
    state.pieces[id] = H.normalisePiece(next);
    this.write(st => st.writeHeroGear(state, H, { piece: id }));
  },
  setQuality(quality) { if (this.editing) this.writePiece({ quality }); },
  setPiece(field, raw, valid) { if (!this.editing || !valid || raw === '') return; this.writePiece({ [field]: Number(raw) }); },
  stepPiece(field, step) { if (!this.editing) return; this.writePiece({ [field]: Math.max(0, (Number(this.form[field]) || 0) + step) }); },
  setTraining(raw, valid) {
    if (!this.editing || !valid) return;
    const fact = raw === '' ? null : Number(raw), id = this.editing.id;
    if (fact !== null && (id === 'capacity' ? !Number.isSafeInteger(fact) || fact < 1 || fact > 1e9 : !(fact >= 0 && fact <= 100000))) return;
    this.write(s => s.setTraining(id, fact));
  },
  setTier(raw) { if (this.editing) this.write(s => s.setTraining(this.editing.id, raw === '' ? null : Number(raw))); },
  toggleBuff() { this.write(s => s.setTrainingBuff(!s.training().buff)); },
  togglePlan(key) { this.write(s => s.setTrainingPlan(key, !s.training()[key])); },
  setPosition(raw) { this.write(s => s.setTrainingPlan('position', raw || null)); },
  setBuilding(raw) { if (this.editing) this.write(s => s.setBuilding(this.editing.id, raw === '' ? null : raw)); },
  stepBuilding(step) {
    if (!this.editing) return;
    const B = globalThis.BuildingSpend, id = this.editing.id, options = B.options(id), levels = store().buildings().levels, now = Object.hasOwn(levels, id) ? options.indexOf(levels[id]) : -1;
    const next = Math.min(options.length - 1, Math.max(0, now + step));
    if (now !== -1 && next === now) return;
    this.write(s => s.setBuilding(id, options[now === -1 ? 0 : next]));
  },
  setAll(level) {
    const B = globalThis.BuildingSpend, levels = {};
    if (!level) return;
    B.BUILDINGS.forEach(b => { levels[b.id] = B.clamp(b.id, level); });
    this.write(s => s.setBuildings(levels));
  },
  setTierFor(id, raw) { this.write(s => s.setBuildingPriorities({ tiers: { [id]: Number(raw) } })); },
  move(id, step) {
    const order = globalThis.BuildingSpend.priorities(store().snapshot()).order, at = order.indexOf(id), to = at + step;
    if (at < 0 || to < 0 || to >= order.length) return;
    order.splice(to, 0, order.splice(at, 1)[0]);
    this.write(s => s.setBuildingPriorities({ order }));
    this.focusMove = { id, step };
    this.$nextTick(() => { this.focusMove = null; });
  },
  clear() {
    const e = this.editing;
    if (!e) return;
    if (e.type === 'building') this.write(s => s.setBuilding(e.id, null));
    else if (e.type === 'position') this.write(s => s.setTrainingPlan('position', null));
    else if (e.type === 'training' || e.type === 'tier') this.write(s => s.setTraining(e.id, null));
    else if (e.type !== 'hero') this.write(s => s.setBalance(e.id, null));
  }
}));
