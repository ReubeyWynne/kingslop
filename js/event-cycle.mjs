/* The Event Cycle's days, as plain data: the 28-day wheel, each day's card (what scores, what
   to keep, the troop-day notes) and its KingShot copy. js/pages/events.mjs shows it on the
   page; the rule checks read it in Node.

   The copy blocks are built for KingShot chat: item icons ride in as <item_icon_N> tags, every
   line stays ≤28 display cells (a tag = 1 cell, a narrow char = 1 cell, a wide/full-width char
   = 2 cells), and a block stays ≤512 characters a message.

   Text comes from the words given to useWords (the page's translations); until then, the
   English fallbacks. eventCycle(rules) builds the same from another rule engine (the checks
   give it relabelled data); the exports are the site's own. */
import Rules from './event-rules.mjs';
import TroopSpend from './troop-spend.mjs';
import BuildingSpend from './building-spend.mjs';

const fill = (text, values) => values ? text.replace(/\{(\w+)\}/g, (all, key) => Object.hasOwn(values, key) ? values[key] : all) : text;
let text = { t: (key, fallback, values) => fill(fallback, values), fmt: n => n.toLocaleString('en-GB') };
export function useWords(next) { text = next; }
const t = (key, fallback, values) => text.t(key, fallback, values);
const fmt = n => text.fmt(n);

export function eventCycle(EventRules) {
  // ── The 28-day wheel ───────────────────────────────────
  // Brawl week (1-7) → Strongest Governor (8-14) → Alliance Mobilization (15-20) → a quiet gap
  // (21) → KvK prep (22-26) + battle weekend (27-28).
  const CYCLE_LEN = EventRules.CYCLE;
  const LEGACY = EventRules.data.legacy;
  // The alliance's prep chart: 16 materials × the 5 prep days, each cell best|ok|no.
  const MATRIX = LEGACY.MATRIX, PTS = LEGACY.PTS;
  const KOP_THEMES = LEGACY.KOP_THEMES, SG_THEMES = LEGACY.SG_THEMES, BRAWL_THEMES = LEGACY.BRAWL_THEMES;
  // Canonical tracked items, the prep chart's 16 materials; ids are the MATRIX row names.
  const VITEMS = LEGACY.VITEMS;
  // The light weeks: inside each (days 1–7 and 15–20) the Armament Competition and the Officer
  // Project each run twice, and every run's task set changes with the day it started.
  const ARMAMENT_RUNS = LEGACY.ARMAMENT_RUNS, OFFICER_RUNS = LEGACY.OFFICER_RUNS;

  // Relative to the page (events/), as the reference tables' own icons are.
  const KS_IMG = '../img/kingshot/';
  const ksIco = file => '<img class="ks-ico" loading="eager" src="' + KS_IMG + file + '" alt="" decoding="async">';
  const ITEM_GLYPH = {
    'Truegold': ksIco('truegold.png'), 'Tempered TG': ksIco('truegold.png'),
    'Hero shard': ksIco('hero-shard.png'), 'Master emblem': '⭐',
    'Building': ksIco('construction-speedup.png'), 'Troop': ksIco('training-speedup.png'),
    'Research': ksIco('research-speedup.png'), 'Hero roulette': ksIco('gem.png'),
    'Gathering': '🌾', 'Intel missions': ksIco('energy-booster.png'),
    'Pets advance': '🐾', 'Gov charm': '💍',
    'Gov gear': '🛡️', 'Widget gear': '⚙️',
    'Mithril': '⛏️', 'Forgehammer': ksIco('forgehammer.png')
  };

  // Which run (if any) is live on cycle day d. Armament and Officer never overlap.
  function liveRun(d) {
    for (let i = 0; i < ARMAMENT_RUNS.length; i++) if (d >= ARMAMENT_RUNS[i].start && d <= ARMAMENT_RUNS[i].end) return { event: 'armament', run: ARMAMENT_RUNS[i] };
    for (let i = 0; i < OFFICER_RUNS.length; i++) if (d >= OFFICER_RUNS[i].start && d <= OFFICER_RUNS[i].end) return { event: 'officer', run: OFFICER_RUNS[i] };
    return null;
  }

  // "Today" is the UTC calendar date: the game runs the wheel on UTC, so a reader's local clock
  // must not shift the day. Cycle day 1 is always a Monday, anchored to one global date.
  function todayDay() {
    const n = new Date();
    const ms = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) - EventRules.EPOCH;
    return ((Math.floor(ms / EventRules.DAY_MS) % CYCLE_LEN) + CYCLE_LEN) % CYCLE_LEN + 1;
  }
  function weekOf(d) {
    if (d <= 7) return 'brawl';
    if (d <= 14) return 'sg';
    if (d <= 20) return 'mob';
    if (d === 21) return 'gap';   // quiet day: Officer Project Type B + Swordland's Sunday
    if (d <= 26) return 'prep';
    return 'battle';
  }
  const prepDayOf = d => d - 21;   // 22-26 → 1-5
  const sgDayOf = d => d - 7;      // 8-14 → 1-7
  const brawlThemeIdx = d => d > 6 ? 6 : d;

  // ── The at-a-glance value list ─────────────────────────
  // Only KvK prep can produce 'best', and only on the prep day where an item hits its best
  // MATRIX cell. A brawl/SG day where the item is a top scorer → 'ok'. Asked for only by a live
  // run → 'low'. Everything else → 'hold'. Free actions list separately.
  function valueOf(id, ctx) {
    if (ctx.prepN) {
      const row = MATRIX.find(r => r[0] === id), st = row ? row[1][ctx.prepN - 1] : null;
      if (st === 'best') return 'best';
      if (st === 'ok') return 'ok';
    } else if (ctx.sgN) {
      if (ctx.sgIds.has(id)) return 'ok';
    } else if (ctx.brawlIds) {
      if (ctx.brawlIds.has(id)) return 'ok';
    }
    if (ctx.lowIds.has(id)) return 'low';
    return 'hold';
  }
  // Live-run task rows that map to a tracked item: the day's lows.
  function runLowIds(day) {
    const run = liveRun(day), out = new Set();
    if (!run) return out;
    EventRules.tasks(run.event, run.run.type).forEach(task => { if (task.category && task.category !== 'free') out.add(task.category); });
    return out;
  }
  const points = value => typeof value === 'number' ? fmt(value) : String(value);
  const VALUE_ORDER = ['best', 'ok', 'low', 'hold'];

  /* The day's value list as zones (open) and folds (details), in order. */
  function valueList(day, ctx) {
    const zones = [];
    if (ctx.freeActions && ctx.freeActions.length) zones.push({ fold: false, label: t('ks.today.actions', 'Daily tasks'), rows: ctx.freeActions.map(a => ({ glyph: '✅', name: a.label, pts: a.pts, value: '' })) });
    const groups = { best: [], ok: [], low: [], hold: [] };
    VITEMS.forEach(id => {
      const val = valueOf(id, ctx);
      let pts = (val === 'best' || val === 'ok') && ctx.ptsById[id] ? ctx.ptsById[id] : '';
      if (val === 'low' && !ctx.prepN && !ctx.sgN && !ctx.brawlIds) {
        const run = liveRun(day), task = EventRules.tasks(run.event, run.run.type).find(task => task.category === id);
        if (task) pts = points(task.points);
      }
      if (['Hero shard', 'Pets advance', 'Gathering', 'Gov charm', 'Gov gear'].includes(id) || (id === 'Troop' && !ctx.prepN)) pts = '';
      groups[val].push({ glyph: ITEM_GLYPH[id], name: id, pts, value: 'v-' + val });
    });
    const labels = {
      best: t('ks.today.priorities', 'Our prep priorities'),
      ok: t('ks.today.scoring', 'Also scores'),
      low: t('ks.today.otherTasks', 'Other event tasks'),
      hold: t('ks.today.save', 'Keep for later')
    };
    VALUE_ORDER.forEach(state => {
      if (!groups[state].length) return;
      const fold = state === 'hold' || (state === 'low' && !!(ctx.prepN || ctx.sgN || ctx.brawlIds));
      zones.push({ fold, glyph: fold ? (state === 'hold' ? ITEM_GLYPH.Truegold + ITEM_GLYPH['Hero shard'] : '📋 ') : '', label: labels[state], rows: groups[state] });
    });
    return { zones, units: groups.best.length || groups.ok.length ? t('ks.today.units', 'Points shown are per task unit. Use the day’s table for the exact units and unlocked tiers.') : '' };
  }

  function context(day, extra) {
    return Object.assign({ prepN: null, sgN: null, brawlIds: null, sgIds: new Set(), lowIds: runLowIds(day), ptsById: {}, freeActions: null }, extra);
  }

  /* Each week's card: its kicker, title, meta line, value list and KingShot copy. */
  function prepCard(day) {
    const n = prepDayOf(day);
    return {
      kicker: t('ks.today.kickerPrep', 'KvK prep') + ' · ' + t('ks.today.day', 'day') + ' ' + n,
      title: KOP_THEMES[n - 1],
      meta: t('ks.today.prepGuide', 'Check today’s tasks and reward milestones in game.'),
      ctx: context(day, { prepN: n, ptsById: PTS }),
      copy: dayBlock(n)
    };
  }
  function sgCard(day) {
    const n = sgDayOf(day), sgIds = new Set(), ptsById = {};
    EventRules.tasks('sg', n).forEach(row => {
      const id = row.category;
      if (!id || id === 'free') return;   // e.g. 'Speedups' → null: not tracked
      if (!sgIds.has(id)) ptsById[id] = points(row.points);
      sgIds.add(id);
    });
    return {
      kicker: t('ks.today.kickerSg', 'Strongest Governor') + ' · ' + t('ks.today.day', 'day') + ' ' + n,
      title: SG_THEMES[n - 1],
      meta: t('ks.today.sgMeta', 'daily rank closes at 00:00 UTC — two challenge medals a day'),
      ctx: context(day, { sgN: n, sgIds, ptsById }),
      copy: sgCopy(n)
    };
  }
  function battleCard(day) {
    return {
      kicker: t('ks.today.kickerBattle', 'KvK') + ' · ' + t('ks.today.battleSub', 'battle weekend'),
      title: t('ks.today.battleTitle', 'The Castle'), meta: '',
      ctx: context(day, { lowIds: new Set() }),
      copy: battleCopy()
    };
  }
  // The brawl's six themed days: five 24-hour challenge days, then the ~36-hour Full-Scale
  // finale spilling from day 6 into Sunday day 7.
  function brawlCard(day) {
    const n = brawlThemeIdx(day), det = EventRules.rules('brawl', n), brawlIds = new Set(), ptsById = {}, freeActions = [];
    if (det && det.rows.length) det.rows.forEach(row => {
      const id = row.category, numeric = Number(row.points.replace(/,/g, '')), pts = Number.isFinite(numeric) ? fmt(numeric) : row.points;
      if (id === 'free') { freeActions.push({ label: row.label, pts }); return; }
      if (!id) return;
      if (!brawlIds.has(id)) ptsById[id] = pts;
      brawlIds.add(id);
    });
    return {
      kicker: 'Alliance Brawl · day ' + n + ' of the week',
      title: det.title,
      meta: t('ks.today.brawlMeta', 'Your personal ranking is against your alliance members. Check any agreed ranking before pushing your score.'),
      ctx: context(day, { brawlIds, ptsById, freeActions }),
      copy: ''
    };
  }
  function mobCard(day) {
    let meta = t('ks.today.mobMeta', 'Accept a mission before completing its task. Check overlapping Armament or Officer tasks before a planned spend.');
    if (day === 20) meta = t('ks.today.mobLast', 'last day of mobilization — ') + meta;
    return { kicker: 'Alliance Mobilization · week 3', title: t('ks.today.mobTitle', 'Alliance missions'), meta, ctx: context(day), copy: '' };
  }
  function gapCard(day) {
    return {
      kicker: t('ks.today.between', 'Between weeks') + ' · ' + t('ks.today.day', 'day') + ' 21',
      title: t('ks.today.beforePrep', 'Before prep tomorrow'), meta: '',
      ctx: context(day), copy: ''
    };
  }
  const CARDS = { brawl: brawlCard, mob: mobCard, gap: gapCard, prep: prepCard, sg: sgCard, battle: battleCard };

  function daySummary(d) {
    const phase = weekOf(d);
    if (phase === 'prep') return t('ks.today.kickerPrep', 'KvK prep') + ' · ' + t('ks.today.day', 'day') + ' ' + prepDayOf(d) + ': ' + KOP_THEMES[prepDayOf(d) - 1];
    if (phase === 'sg') return t('ks.today.kickerSg', 'Strongest Governor') + ' · ' + t('ks.today.day', 'day') + ' ' + sgDayOf(d) + ': ' + SG_THEMES[sgDayOf(d) - 1];
    if (phase === 'brawl') return t('ks.brawl.title', 'Alliance Brawl') + ': ' + BRAWL_THEMES[brawlThemeIdx(d) - 1];
    if (phase === 'mob') return t('ks.mob.title', 'Alliance Mobilization');
    if (phase === 'gap') return t('ks.today.beforePrep', 'Before prep tomorrow');
    return t('ks.week.battle', 'KvK battle weekend');
  }

  /* Troop days: when to buy the 3,000-gem capacity buff and start the tripled batch so it is
     ready to collect when the day opens, from the training saved in the Town Centre
     (TroopSpend.batch). Shown on the two days before the latest start, while the troop day is
     still ahead, and as a collect reminder on the day itself. Each note's text may hold a link. */
  const TROOP_EVENTS = [['brawl', 'ks.brawl.title', 'Alliance Brawl'], ['sg', 'ks.today.kickerSg', 'Strongest Governor'], ['prep', 'ks.today.kickerPrep', 'KvK prep']];
  function troopActions(day, followingToday, snapshot) {
    const R = TroopSpend, E = EventRules, notes = [];
    if (!snapshot) return notes;
    const used = BuildingSpend.plan(snapshot).resources;
    const now = Date.now(), dayMs = E.DAY_MS, selected = Math.floor(now / dayMs) * dayMs + (day - todayDay()) * dayMs, ref = followingToday ? now : selected;
    const locale = (globalThis.I18N && I18N.locale) || 'en-GB';
    const when = ms => new Date(ms).toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }) + ' UTC';
    const note = html => notes.push({ glyph: ITEM_GLYPH.Troop, html, troop: true });
    TROOP_EVENTS.forEach(entry => {
      // A camp holds one batch at a time, so each event gets one: on its troop day that scores most (the first on a tie).
      let pick = null;
      E.days(entry[0]).forEach(rules => {
        const found = R.rates(rules.rows, entry[0]);
        if (!found) return;
        const opens = E.opens(entry[0], rules.day, selected), batch = R.batch(snapshot, found.rates, used, opens, entry[0]);
        if (!pick || batch.buffed.points > pick.batch.buffed.points) pick = { day: rules.day, opens, batch };
      });
      if (!pick) return;
      const { day: d, opens, batch } = pick, b = batch.buffed, values = { event: t(entry[1], entry[2]), day: fmt(d) };
      if (E.cycleDay(entry[0], d) === day) { note(t('ks.today.troopCollect', 'Troop day: collect the batch you started before today, then train with speedups.', values)); return; }
      if (b.start === null || !b.troops) {
        if (opens - selected === dayMs) note(t('ks.today.troopSetup', '{event} day {day} tomorrow is a troop day. <a href="../town-centre/#town-troops">Set your training</a> to get a start time for a tripled batch.', values));
        return;
      }
      if (b.start >= selected + 2 * dayMs) return;
      Object.assign(values, { size: fmt(b.size), points: fmt(b.points), extra: fmt(batch.extra), time: when(b.start), plainSize: fmt(batch.plain.size), plainTime: when(batch.plain.start) });
      if (b.start >= ref) note(t('ks.today.troopStart', 'Buy the capacity buff (3,000 gems) and start {size} troops in each camp by {time}, ready for {event} day {day}. That batch scores {points} points, {extra} more than a normal one.', values));
      else if (batch.plain.start >= ref) note(t('ks.today.troopLatePlain', 'Too late for a tripled batch before {event} day {day}. Start a normal batch of {plainSize} per camp by {plainTime}.', values));
      else note(t('ks.today.troopLate', 'The latest start for {event} day {day} was {time}. Start what you can now and finish it with speedups on the day.', values));
    });
    return notes;
  }
  function weekActions(day, followingToday, snapshot) {
    const notes = troopActions(day, followingToday, snapshot);
    const intel = ITEM_GLYPH['Intel missions'], marked = glyph => '<span aria-hidden="true">' + glyph + '</span> ';
    if (day === 21) notes.push({ glyph: intel, html: t('ks.today.holdIntel', 'Hold intel from 08:00 UTC for tomorrow’s prep.') });
    if (day === 7 || day === 21) notes.push({ glyph: marked('⚔️'), html: t('ks.today.swordSunday', 'Swordland: check your alliance’s one-hour battle time.') });
    if (day === 20) {
      notes.push({ glyph: intel, html: t('ks.today.intelTomorrow', 'Tomorrow, hold intel from 08:00 UTC for prep on day 22.') });
      notes.push({ glyph: ITEM_GLYPH.Truegold, html: t('ks.today.prepPlan', 'Plan your KvK spending before prep starts on day 22.') });
      notes.push({ glyph: marked('🏰'), html: t('ks.today.matchmaking', 'KvK matchmaking window: check the opponent reveal in game.') });
    }
    return notes;
  }

  // ── KingShot copy ──────────────────────────────────────
  // KingShot chat has a fixed width and a line cap: the full prep chart comes back from a paste
  // with its rows merged. So every copy block is compact: lines stay aligned in ≤28 display
  // cells, no blank lines, short chat labels, and a whole block ≤512 characters.
  const SHORT = {
    'Truegold': 'Truegold', 'Tempered TG': 'temp TG', 'Hero shard': 'Hero shard',
    'Master emblem': 'Master Emblem', 'Building': 'Building', 'Troop': 'Troop', 'Research': 'Research',
    'Hero roulette': 'Roulette', 'Gathering': 'Gathering', 'Intel missions': 'Intel',
    'Pets advance': 'Pets', 'Gov charm': 'Gov charm', 'Gov gear': 'Gov gear',
    'Widget gear': 'Widget', 'Mithril': 'Mithril', 'Forgehammer': 'Hammer'
  };

  // A wide/full-width char (CJK, full-width digits １, full-width ｜, emoji) is 2 display cells.
  function isWideCode(cp) {
    return (
      (cp >= 0x1100 && cp <= 0x115F) || (cp >= 0x2E80 && cp <= 0x303E) || (cp >= 0x3041 && cp <= 0x33FF) ||
      (cp >= 0x3400 && cp <= 0x4DBF) || (cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0xA000 && cp <= 0xA4CF) ||
      (cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0xFE30 && cp <= 0xFE4F) ||
      (cp >= 0xFF00 && cp <= 0xFF60) || (cp >= 0xFFE0 && cp <= 0xFFE6) || (cp >= 0x2600 && cp <= 0x27BF) ||
      (cp >= 0x1F000 && cp <= 0x1FAFF) || (cp >= 0x20000 && cp <= 0x2FFFD) || (cp >= 0x30000 && cp <= 0x3FFFD)
    );
  }
  function cellsOf(seg) {
    let n = 0;
    for (const ch of seg) {
      const cp = ch.codePointAt(0);
      if (cp === 0x200D || (cp >= 0xFE00 && cp <= 0xFE0F)) continue; // zero-width (ZWJ, VS16)
      n += isWideCode(cp) ? 2 : 1;
    }
    return n;
  }
  // A line's display width: every <item_icon_N> tag is 1 cell, wide chars 2, the rest 1.
  function displayCells(str) {
    const s = String(str), re = /<item_icon_[A-Za-z0-9_]+>/g;
    let n = 0, last = 0, m;
    while ((m = re.exec(s)) !== null) { n += cellsOf(s.slice(last, m.index)) + 1; last = re.lastIndex; }
    return n + cellsOf(s.slice(last));
  }
  function itemTag(category) {
    const entry = EventRules.data.categories[category];
    return entry && entry.icon ? '<item_icon_' + entry.icon + '>' : '';
  }
  // Wrap items into ≤maxCells display lines, full-width ｜ between them. Each line ends with the
  // group's mark (✅/🆗/🚫), so a wrapped group keeps its verdict on every row it spans.
  function packRows(ids, mark, maxCells) {
    const lines = [], sep = '｜';
    let cur = '';
    ids.forEach(id => {
      const tag = itemTag(id), name = SHORT[id] || id, piece = tag ? tag + ' ' + name : name;
      if (cur && displayCells(cur + sep + piece + ' ' + mark) > maxCells) { lines.push(cur + ' ' + mark); cur = piece; }
      else cur = (cur ? cur + sep : '') + piece;
    });
    if (cur) lines.push(cur + ' ' + mark);
    return lines;
  }
  function dayBlock(n) {
    const groups = { best: [], ok: [], no: [] };
    MATRIX.forEach(row => groups[row[1][n - 1]].push(row[0]));
    let lines = ['👑KVK PREP · DAY ' + n + '👑', KOP_THEMES[n - 1]];
    lines = lines.concat(packRows(groups.best, '✅', 28), packRows(groups.ok, '🆗', 28));
    if (groups.no.length > 4) lines.push('🚫 save the rest 🚫');
    else lines = lines.concat(packRows(groups.no, '🚫', 28));
    return lines.join('\n');
  }
  function sgCopy(n) {
    const tasks = EventRules.tasks('sg', n).sort((a, b) => b.points - a.points);
    const pieces = tasks.map(task => task.points.toLocaleString('en-GB') + ' ' + (task.icon ? '<item_icon_' + task.icon + '>' : '') + task.copyLabel);
    const lines = ['👑SG DAY ' + n + '👑', SG_THEMES[n - 1]], sep = '｜';
    let cur = '';
    pieces.forEach(piece => {
      const add = (cur ? sep : '') + piece;
      if (cur && displayCells(cur + add) > 28) { lines.push(cur); cur = piece; }
      else cur += add;
    });
    if (cur) lines.push(cur);
    if (tasks.some(task => task.id === 'hero-roulette')) lines.push('roulette costs gems');
    return lines.join('\n');
  }
  function battleCopy() {
    return ['👑KVK BATTLE WEEKEND👑', 'castle: 5h contest', '2.5h continuous = early win', 'else most hold time',
      '10-22 UTC: teleports + kills', 'chat rules', '4 turrets · triage 30% → 90%', 'SHIELD · essential offline'].join('\n');
  }
  function reminderCopy(w, day) {
    if (w === 'brawl') return ['ALLIANCE BRAWL · DAY ' + day, BRAWL_THEMES[brawlThemeIdx(day) - 1], 'Check agreed alliance ranks', 'Then check your next chest', 'Trucks: Merchant overlap', 'where available'].join('\n');
    if (w === 'gap') return ['BEFORE KVK PREP', itemTag('Intel missions') + 'Hold intel from 08:00 UTC', 'Prep begins next reset', 'Swordland: alliance time', 'Keep prep materials'].join('\n');
    if (day === 20) return ['BEFORE KVK PREP', 'Plan spending for day 22', 'Tomorrow: hold intel', 'from 08:00 UTC', 'Check KvK matchmaking', 'Finish Mobilization missions'].join('\n');
    return ['ALLIANCE MOBILIZATION', 'Accept mission before task', 'Check overlapping events', 'Keep planned prep materials'].join('\n');
  }
  // Split into ≤512-char messages at line boundaries.
  const LIMIT = 512;
  function splitParts(text) {
    const parts = [];
    let rest = text;
    while (rest.length > LIMIT) {
      let cut = rest.lastIndexOf('\n', LIMIT);
      if (cut < 1) cut = LIMIT;
      parts.push(rest.slice(0, cut));
      rest = rest.slice(cut).replace(/^\n+/, '');
    }
    parts.push(rest);
    return parts;
  }

  const DOWS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const JUMPS = [{ first: 1, end: 7 }, { first: 8, end: 14 }, { first: 15, end: 20 }, { first: 22, end: 28 }];

  /* Today's card for a day, as plain text and the few glyphs and translated lines that carry
     markup (icons, a link, bold figures). */
  function present(day, following, snapshot) {
    const w = weekOf(day), info = CARDS[w](day), run = liveRun(day), list = valueList(day, info.ctx);
    return {
      kicker: info.kicker, title: info.title, meta: info.meta,
      run: run ? { glyph: run.event === 'armament' ? '🛡️ ' : '🎖️ ', name: (run.event === 'armament' ? 'Armament Competition' : 'Officer Project') + ' · ' + run.run.type, line: t('ks.today.sideRun', 'check its tasks before a planned spend.') } : null,
      actions: weekActions(day, following, snapshot),
      zones: list.zones.filter(zone => !zone.fold), folds: list.zones.filter(zone => zone.fold), units: list.units,
      copy: info.copy || reminderCopy(w, day)
    };
  }

  return { todayDay, weekOf, prepDayOf, daySummary, present, splitParts, LIMIT, CYCLE_LEN, DOWS, JUMPS, displayCells };
}

const site = eventCycle(Rules);
export const { todayDay, weekOf, prepDayOf, daySummary, present, splitParts, LIMIT, CYCLE_LEN, DOWS, JUMPS, displayCells } = site;
