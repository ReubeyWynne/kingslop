/* kvk.js — the Event Cycle page toys (events/): the live
   28-day clock, today's card (what's efficient, what to save), and the
   KingShot copy generator. Registers with common.js via window.BH.registerPage.
   The copy blocks are built for KingShot chat: item icons ride in as
   <item_icon_N> tags, every line stays ≤28 display cells (a tag = 1 cell,
   a narrow char = 1 cell, a wide/full-width char = 2 cells), and a block
   stays ≤512 characters a message. */
(function () {
  'use strict';

  // ── The 28-day wheel ───────────────────────────────────
  // Brawl week (1-7) → Strongest Governor (8-14) → Alliance
  // Mobilization (15-20) → a quiet gap (21) → KvK prep (22-26)
  // + battle weekend (27-28).
  var CYCLE_LEN = 28;

  // The alliance's prep chart, validated against the community tables:
  // 16 materials × the 5 prep days, each cell best|ok|no.
  var MATRIX = [
    ['Truegold',        ['best', 'ok',  'no',   'no',   'ok']],
    ['Tempered TG',     ['best', 'ok',  'no',   'no',   'ok']],
    ['Hero shard',      ['no',   'best', 'best', 'no',   'no']],
    ['Master emblem',   ['no',   'best', 'best', 'no',   'no']],
    ['Building',        ['ok',   'best', 'no',   'no',   'no']],
    ['Troop',           ['no',   'no',   'no',   'best', 'ok']],
    ['Research',        ['ok',   'best', 'no',   'no',   'ok']],
    ['Hero roulette',   ['no',   'best', 'best', 'no',   'no']],
    ['Gathering',       ['no',   'best', 'no',   'best', 'best']],
    ['Intel missions',  ['best', 'no',   'best', 'no',   'best']],
    ['Pets advance',    ['no',   'no',   'best', 'no',   'best']],
    ['Gov charm',       ['best', 'no',   'best', 'best', 'no']],
    ['Gov gear',        ['no',   'no',   'no',   'no',   'best']],
    ['Widget gear',     ['no',   'no',   'no',   'best', 'best']],
    ['Mithril',         ['no',   'no',   'no',   'best', 'best']],
    ['Forgehammer',     ['no',   'no',   'no',   'best', 'best']]
  ];

  // A representative points-per-unit per material (for the today card).
  var PTS = {
    'Truegold': '2,000', 'Tempered TG': '30,000', 'Hero shard': '3,040+',
    'Master emblem': '6,000', 'Building': '30/min', 'Troop': '75 (T11)',
    'Research': '30/min', 'Hero roulette': '8,000', 'Gathering': '2',
    'Intel missions': '6,000', 'Pets advance': '15,000', 'Gov charm': '70',
    'Gov gear': '—', 'Widget gear': '8,000', 'Mithril': '40,000', 'Forgehammer': '4,000'
  };

  var GLYPH = { best: '\u2705', ok: '\uD83C\uDD97', no: '\uD83D\uDEAB' }; // ✅ 🆗 🚫

  var KOP_THEMES = ['City Construction', 'Basic Skills Up', 'Pet Training', 'Gear & Troops', 'Combined'];
  /* The daily reward thresholds are not stated here: they scale with the
     server and Town Center level, so the goal is always the 200k chest. */

  // Top-value tasks per prep day, for the "best value today" line.
  var KOP_TOPS = [
    ['Tempered Truegold', 30000], ['Intel missions', 6000], ['Truegold', 2000],
    ['Hero Roulette', 8000], ['Master emblem', 6000], ['Mythic shard', 3040], ['Truegold', 2000],
    ['Advanced Taming Mark', 15000], ['Hero Roulette', 8000], ['Intel missions', 6000],
    ['Mithril', 40000], ['Widget gear', 8000], ['Forgehammer', 4000], ['T11 troop', 75],
    ['Gov gear', 0], ['Truegold', 2000], ['Mithril', 40000], ['Intel missions', 6000]
  ];
  function kopTops(day) { // day 1-5
    var ranges = [[0, 3], [3, 7], [7, 10], [10, 14], [14, 18]];
    var r = ranges[day - 1];
    return KOP_TOPS.slice(r[0], r[1]);
  }

  var SG_THEMES = ['City Construction', 'Hero Development', 'Skill Up', 'Combat Training', 'Skill Up', 'Combat Training', 'Hero Development'];
  var SG_TASKS = [
    [['Tempered Truegold', 30000], ['Truegold', 2000], ['Gov charm', 70], ['Speedups', 30]],
    [['Mithril', 40000], ['Widget gear', 8000], ['Hero Roulette', 8000], ['Forgehammer', 4000], ['Mythic shard', 3040], ['Truegold', 2000], ['Epic shard', 1220], ['Rare shard', 350]],
    [['Advanced Taming Mark', 15000], ['Hero Roulette', 8000], ['Master emblem', 6000], ['Mythic shard', 3040], ['Epic shard', 1220], ['Common Taming Mark', 1150], ['Rare shard', 350], ['Gov charm', 70], ['Pet Advancement', 50]],
    [['Mithril', 40000], ['Widget gear', 8000], ['Forgehammer', 4000], ['Gov charm', 70], ['T10 troops', 39]],
    [['Mithril', 40000], ['Widget gear', 8000], ['Forgehammer', 4000], ['Truegold', 2000], ['Speedups', 30]],
    [['Gov charm', 36], ['T10 troops', 39]],
    [['Advanced Taming Mark', 15000], ['Mythic shard', 3040], ['Truegold', 2000], ['Epic shard', 1220], ['Common Taming Mark', 1150], ['Rare shard', 350], ['Pet Advancement', 50], ['Gathering', 3]]
  ];
  // Canonical tracked items — the prep chart's 16 materials. Every row shown
  // in any phase maps back to one of these; ids ARE the MATRIX row names.
  var VITEMS = ['Truegold','Tempered TG','Hero shard','Master emblem','Building',
    'Troop','Research','Hero roulette','Gathering','Intel missions','Pets advance',
    'Gov charm','Gov gear','Widget gear','Mithril','Forgehammer'];

  var KS_IMG = (function () {
    try {
      return new URL('../img/kingshot/', (document.currentScript && document.currentScript.src) || location.href).href;
    } catch (e) { return '../img/kingshot/'; }
  })();
  function ksIco(file) {
    return '<img class="ks-ico" loading="eager" src="' + KS_IMG + file + '" alt="" decoding="async">';
  }
  var ITEM_GLYPH = {
    'Truegold': ksIco('truegold.png'), 'Tempered TG': ksIco('truegold.png'),
    'Hero shard': ksIco('hero-shard.png'), 'Master emblem': '\u2B50',
    'Building': ksIco('construction-speedup.png'), 'Troop': ksIco('training-speedup.png'),
    'Research': ksIco('research-speedup.png'), 'Hero roulette': ksIco('gem.png'),
    'Gathering': '\uD83C\uDF3E', 'Intel missions': ksIco('energy-booster.png'),
    'Pets advance': '\uD83D\uDC3E', 'Gov charm': '\uD83D\uDC8D',
    'Gov gear': '\uD83D\uDEE1\uFE0F', 'Widget gear': '\u2699\uFE0F',
    'Mithril': '\u26CF\uFE0F', 'Forgehammer': ksIco('forgehammer.png')
  };

  // Map any row label (prep/SG/brawl tables, run task rows) back to a tracked
  // item: an id, 'free' (nothing from the hoard), or null (skip — not a
  // tracked material). Lowercased, first match wins in this order.
  function labelToItemId(label) {
    var l = String(label).toLowerCase();
    if (/truck|beast|terror|rally and hunt|wilderness/.test(l)) return 'free';
    if (/tempered truegold|temp tg/.test(l)) return 'Tempered TG';
    if (/mithril/.test(l)) return 'Mithril';
    if (/widget/.test(l)) return 'Widget gear';
    if (/forgehammer|hammer/.test(l)) return 'Forgehammer';
    if (/governor charm|charm/.test(l)) return 'Gov charm';
    if (/governor gear|gear max score|gov gear/.test(l)) return 'Gov gear';
    if (/master emblem/.test(l)) return 'Master emblem';
    if (/mythic|epic|rare|hero shard|shard/.test(l)) return 'Hero shard';
    if (/roulette/.test(l)) return 'Hero roulette';
    if (/taming mark|pet advancement|pet refinement|pets/.test(l)) return 'Pets advance';
    if (/intel mission/.test(l)) return 'Intel missions';
    if (/truegold dust/.test(l)) return null; // dust is not a tracked material
    if (/t10|t11|t[0-9] troop|troop training|training/.test(l)) return 'Troop';
    if (/construction/.test(l)) return 'Building';
    if (/research/.test(l)) return 'Research';
    if (/gather/.test(l)) return 'Gathering';
    if (/truegold/.test(l)) return 'Truegold';
    if (/master\u2019s manuscript|manuscript/.test(l)) return null;
    return null;
  }

  // ── The light weeks — day-aware runs, orthogonal to the phase axis ──
  // Owner-confirmed schedule. Alliance Brawl fills week 1 (days 1–7, the
  // week right after KvK). Inside each light week (days 1–7 and 15–20;
  // Officer Type B spills across day 21 into the next week's day 1),
  // the Armament Competition and the Officer Project each run twice:
  // Armament Type 1 from the week's Monday (days 1–2, 15–16), Type 2 from
  // its Friday (days 5–6, 19–20); Officer Type A from Wednesday (days
  // 3–4, 17–18), Type B from Sunday (days 7–8, 21–22) — Type B's second
  // day spills into Strongest Governor day 1 (day 8) and KvK prep day 1
  // (day 22). Every run's task set changes with the day it started.
  var ARMAMENT_RUNS = [
    { start: 1,  end: 2,  type: 1, label: 'Type 1' },
    { start: 5,  end: 6,  type: 2, label: 'Type 2' },
    { start: 15, end: 16, type: 1, label: 'Type 1' },
    { start: 19, end: 20, type: 2, label: 'Type 2' }
  ];
  var OFFICER_RUNS = [
    { start: 3,  end: 4,  type: 'A', label: 'Type A' },
    { start: 7,  end: 8,  type: 'B', label: 'Type B' },
    { start: 17, end: 18, type: 'A', label: 'Type A' },
    { start: 21, end: 22, type: 'B', label: 'Type B' }
  ];

  // Points per action for each run type — owner-confirmed task tables; the
  // page sections carry the same numbers. Row = [task label, points] (a
  // string points value is used verbatim, e.g. the officer troop ladder).
  var ARM_TASKS = {
    1: [
      ['Tempered Truegold (building upgrade)', 1500], ['Mythic hero shard', 125],
      ['Truegold (building upgrade)', 100], ['Epic hero shard', 50],
      ['Truegold Dust (tech research)', 50], ['Rare hero shard', 15],
      ['Governor Gear max score +1', 3], ['1m construction / research / training speedup', 1]
    ],
    2: [
      ['Mithril', 8000], ['Widget', 1600], ['Tempered Truegold (building upgrade)', 1500],
      ['Forgehammer', 800], ['Truegold (building upgrade)', 100],
      ['Truegold Dust (tech research)', 50], ['Governor Gear max score +1', 3],
      ['1m construction / research / training speedup', 1]
    ]
  };
  var OFF_TASKS = {
    A: [
      ['Widget', 12000], ['Forgehammer', 6000], ['Mithril', 60000],
      ['Governor Charm max score +1', 70], ['Troop training (T1\u2013T11)', '1\u201337']
    ],
    B: [
      ['Widget', 12000], ['Forgehammer', 6000], ['Mythic hero shard', 3040],
      ['Epic hero shard', 1220], ['Rare hero shard', 350],
      ['Governor Gear max score +1', 70]
    ]
  };
  // Which run (if any) is live on cycle day d. Armament and Officer never
  // overlap in the confirmed schedule, so at most one is returned.
  function liveRun(d) {
    var i;
    for (i = 0; i < ARMAMENT_RUNS.length; i++) {
      if (d >= ARMAMENT_RUNS[i].start && d <= ARMAMENT_RUNS[i].end) {
        return { event: 'armament', run: ARMAMENT_RUNS[i], n: i + 1, dayNo: d - ARMAMENT_RUNS[i].start + 1 };
      }
    }
    for (i = 0; i < OFFICER_RUNS.length; i++) {
      if (d >= OFFICER_RUNS[i].start && d <= OFFICER_RUNS[i].end) {
        return { event: 'officer', run: OFFICER_RUNS[i], n: i + 1, dayNo: d - OFFICER_RUNS[i].start + 1 };
      }
    }
    return null;
  }

  // ── Short task names for the KingShot copy (keeps lines under the width cap).
  var SG_SHORT = {
    'Hero Roulette': 'Roulette', 'Widget gear': 'Widget', 'Mythic shard': 'Mythic',
    'Epic shard': 'Epic', 'Rare shard': 'Rare', 'Advanced Taming Mark': 'Adv Taming',
    'Common Taming Mark': 'Taming', 'Pet Advancement': 'Pets', 'T10 troops': 'T10',
    'Gathering': 'Gather', 'Tempered Truegold': 'temp TG', 'Speedups': 'spd'
  };

  // ── State — the schedule is GLOBAL: one wheel, anchored to dates ──
  // Cycle day 1 is always a Monday. The default anchor is Monday
  // 2026-08-17, so 2026-09-01 is day 16 and 2026-09-02 (a Wednesday) is
  // day 17 — the day Officer Project's Type A run is live. KvK prep opens
  // on day 22 (2026-09-07); the battle weekend is days 27–28. Every
  // kingdom turns the same wheel on the same day, anchored to a fixed,
  // global day 1 — there is no per-reader calibration.
  var EPOCH = new Date(2026, 7, 17); // month 7 = August; day 1 is a Monday

  // "Today" is the UTC calendar date — the game runs the wheel on UTC, so a
  // reader's local clock must not shift the day (commentary on the widget).
  function todayDay() {
    var n = new Date();
    var ms = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) -
             Date.UTC(EPOCH.getFullYear(), EPOCH.getMonth(), EPOCH.getDate());
    return ((Math.floor(ms / 86400000) % CYCLE_LEN) + CYCLE_LEN) % CYCLE_LEN + 1;
  }

  var day = todayDay();
  var followingToday = true;

  function setDay(n, BH) {
    followingToday = false;
    day = ((n - 1 + CYCLE_LEN) % CYCLE_LEN) + 1;
    render(BH);
  }

  function weekOf(d) {
    if (d <= 7) return 'brawl';
    if (d <= 14) return 'sg';
    if (d <= 20) return 'mob';
    if (d === 21) return 'gap';   // quiet day: Officer Project Type B + Swordland's Sunday
    if (d <= 26) return 'prep';
    return 'battle';
  }
  function prepDayOf(d) { return d - 21; }          // 22-26 → 1-5
  function sgDayOf(d) { return d - 7; }             // 8-14 → 1-7

  // ── The wheel ──────────────────────────────────────────
  function paintCycle(BH) {
    var box = document.getElementById('ks-cycle');
    if (!box) return;
    var tday = todayDay();
    if (!box.children.length) {
      for (var d = 1; d <= CYCLE_LEN; d++) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'cell ' + weekOf(d);
        button.dataset.cycleDay = d;
        button.addEventListener('click', function () { setDay(Number(this.dataset.cycleDay), window.BH); });
        box.appendChild(button);
      }
    }
    box.className = 'cycle-bar';
    Array.prototype.forEach.call(box.children, function (button) {
      var d = Number(button.dataset.cycleDay);
      button.textContent = BH.fmt(d);
      button.classList.toggle('now', d === day);
      button.classList.toggle('mark', d === tday && d !== day);
      button.setAttribute('aria-pressed', String(d === day));
      button.setAttribute('aria-label', BH.tpl('ks.today.dayOut', 'day {n} of 28', { n: BH.fmt(d) }) + ' · ' + (weekOf(d) === 'gap' ? BH.tr('ks.today.between', 'Between weeks') : BH.tr('ks.week.' + weekOf(d), 'KvK')) + (d === tday ? ' · ' + BH.tr('ks.today.title', 'Today') : ''));
      if (d === tday) button.setAttribute('aria-current', 'date');
      else button.removeAttribute('aria-current');
    });
  }

  // ── The today card ─────────────────────────────────────
  function rowHTML(mark, name, pts, extra, vClass) {
    return '<div class="trow' + (mark === GLYPH.no ? ' dont' : '') + (extra ? ' keep' : '') + (vClass ? ' ' + vClass : '') + '"><span class="tmark">' + mark + '</span>' +
      '<span class="tname">' + name + '</span>' +
      (pts ? '<span class="tpts">' + pts + '</span>' : '<span class="tpts"></span>') +
      (extra ? '<span class="tkeep">' + extra + '</span>' : '') + '</div>';
  }

  function zone(title, html) {
    return '<div class="today-zone"><h4>' + title + '</h4>' + html + '</div>';
  }

  // ── The unified at-a-glance value list ─────────────────
  // ctx: { prepN (1-5) | sgN (1-7) | brawlIds (Set|null), sgIds (Set),
  //        lowIds (Set), ptsById (id → display pts), freeActions (array|null) }
  // Owner rules (locked): only KvK prep can produce 'best', and only on the
  // prep day where an item hits its best MATRIX cell. A brawl/SG day where
  // the item is a top scorer → 'ok'. Asked for only by a live run → 'low'.
  // Everything else → 'hold'. Free actions list separately, never inside.
  function valueOf(id, ctx) {
    var st = null, i;
    if (ctx.prepN) {
      for (i = 0; i < MATRIX.length; i++) {
        if (MATRIX[i][0] === id) { st = MATRIX[i][1][ctx.prepN - 1]; break; }
      }
      if (st === 'best') return 'best';
      if (st === 'ok') return 'ok';     // 'no' falls through to low/hold
    } else if (ctx.sgN) {
      if (ctx.sgIds.has(id)) return 'ok';
    } else if (ctx.brawlIds) {
      if (ctx.brawlIds.has(id)) return 'ok';
    }
    if (ctx.lowIds.has(id)) return 'low';
    return 'hold';
  }

  // Live-run task rows that map to a tracked item — those are the day's lows.
  function runLowIds() {
    var run = liveRun(day);
    var out = new Set();
    if (!run) return out;
    var tasks = run.event === 'armament' ? ARM_TASKS[run.run.type] : OFF_TASKS[run.run.type];
    for (var i = 0; i < tasks.length; i++) {
      var id = labelToItemId(tasks[i][0]);
      if (id && id !== 'free') out.add(id);
    }
    return out;
  }

  // The hold mark is drawn, not an emoji: the ⏸️ chip renders in the same
  // blue family as the ok 🆗 at row size, and the two are easy to blur
  // together. Amber bars read as the theme's caution/save-it tone instead.
  // (Copy lines keep emoji marks — those must paste into KingShot chat.)
  var HOLD_ICO = '<svg class="hold-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.3 5.1v13.8M15.7 5.1v13.8" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/></svg>';
  var VALUE_MARK = { best: GLYPH.best, ok: GLYPH.ok, low: '\uD83D\uDD3B', hold: HOLD_ICO };
  var VALUE_TAG = { best: 'best value', ok: 'ok value', low: 'low value', hold: 'hold' };
  var VALUE_ORDER = ['best', 'ok', 'low', 'hold'];

  function todayValueHtml(ctx, BH) {
    var html = '';
    if (ctx.freeActions && ctx.freeActions.length) {
      var freeRows = '';
      for (var i = 0; i < ctx.freeActions.length; i++) {
        freeRows += rowHTML('✅', ctx.freeActions[i].label, ctx.freeActions[i].pts, '');
      }
      html += zone(BH.tr('ks.today.actions', 'Daily tasks'), freeRows);
    }
    var groups = { best: '', ok: '', low: '', hold: '' };
    for (var v = 0; v < VITEMS.length; v++) {
      var id = VITEMS[v];
      var val = valueOf(id, ctx);
      var pts = (val === 'best' || val === 'ok') && ctx.ptsById[id] ? ctx.ptsById[id] : '';
      if (val === 'low' && !ctx.prepN && !ctx.sgN && !ctx.brawlIds) {
        var run = liveRun(day);
        var tasks = run.event === 'armament' ? ARM_TASKS[run.run.type] : OFF_TASKS[run.run.type];
        for (var t = 0; t < tasks.length; t++) {
          if (labelToItemId(tasks[t][0]) === id) { pts = typeof tasks[t][1] === 'number' ? BH.fmt(tasks[t][1]) : String(tasks[t][1]); break; }
        }
      }
      if (['Hero shard', 'Pets advance', 'Gathering', 'Gov charm', 'Gov gear'].indexOf(id) !== -1) pts = '';
      groups[val] += rowHTML(ITEM_GLYPH[id], id, pts, '', 'v-' + val);
    }
    var labels = {
      best: BH.tr('ks.today.priorities', 'Our prep priorities'),
      ok: BH.tr('ks.today.scoring', 'Also scores'),
      low: BH.tr('ks.today.otherTasks', 'Other event tasks'),
      hold: BH.tr('ks.today.save', 'Keep for later')
    };
    for (var j = 0; j < VALUE_ORDER.length; j++) {
      var state = VALUE_ORDER[j];
      if (!groups[state]) continue;
      if (state === 'hold' || (state === 'low' && (ctx.prepN || ctx.sgN || ctx.brawlIds))) {
        html += '<details class="today-stored"><summary>' + (state === 'hold' ? ITEM_GLYPH.Truegold + ITEM_GLYPH['Hero shard'] : '📋 ') + labels[state] + '</summary>' + groups[state] + '</details>';
      } else html += zone(labels[state], groups[state]);
    }
    if (groups.best || groups.ok) html += '<p class="today-meta">' + BH.tr('ks.today.units', 'Points shown are per task unit. Use the day’s table for the exact units and unlocked tiers.') + '</p>';
    return '<div class="today-value">' + html + '</div>';
  }

  function prepCard(n, BH) {
    var theme = KOP_THEMES[n - 1];
    var head = '<p class="today-kicker">' + BH.tr('ks.today.kickerPrep', 'KvK prep') + ' \u00B7 ' + BH.tr('ks.today.day', 'day') + ' ' + n + '</p>' +
      '<p class="today-title">' + theme + '</p>' +
      '<p class="today-meta">' + BH.tr('ks.today.chest', 'the daily goal is the 200,000-point chest') + '</p>';

    var ctx = { prepN: n, sgN: null, brawlIds: null, sgIds: new Set(), lowIds: runLowIds(), ptsById: PTS, freeActions: null };
    var body = todayValueHtml(ctx, BH);

    return { head: head, body: body, copy: dayBlock(n), copyTitle: BH.tr('ks.today.copyToday', 'copy today for KingShot') };
  }

  function sgCard(n, BH) {
    var sgIds = new Set();
    var ptsById = {};
    var dayRows = SG_TASKS[n - 1];
    var i;
    for (i = 0; i < dayRows.length; i++) {
      var id = labelToItemId(dayRows[i][0]);
      if (!id || id === 'free') continue;   // e.g. 'Speedups' → null: not tracked
      if (!sgIds.has(id)) ptsById[id] = typeof dayRows[i][1] === 'number' ? BH.fmt(dayRows[i][1]) : String(dayRows[i][1]);
      sgIds.add(id);
    }
    var head = '<p class="today-kicker">' + BH.tr('ks.today.kickerSg', 'Strongest Governor') + ' \u00B7 ' + BH.tr('ks.today.day', 'day') + ' ' + n + '</p>' +
      '<p class="today-title">' + SG_THEMES[n - 1] + '</p>' +
      '<p class="today-meta">' + BH.tr('ks.today.sgMeta', 'daily rank closes at 00:00 UTC \u2014 two challenge medals a day') + '</p>';
    var ctx = { prepN: null, sgN: n, brawlIds: null, sgIds: sgIds, lowIds: runLowIds(), ptsById: ptsById, freeActions: null };
    var body = todayValueHtml(ctx, BH);
    return { head: head, body: body, copy: sgCopy(n), copyTitle: BH.tr('ks.today.copySg', 'copy this day for KingShot') };
  }

  function battleCard(BH) {
    var head = '<p class="today-kicker">' + BH.tr('ks.today.kickerBattle', 'KvK') + ' \u00B7 ' + BH.tr('ks.today.battleSub', 'battle weekend') + '</p>' +
      '<p class="today-title">' + BH.tr('ks.today.battleTitle', 'The Castle') + '</p>';
    var ctx = { prepN: null, sgN: null, brawlIds: null, sgIds: new Set(), lowIds: new Set(), ptsById: {}, freeActions: null };
    var body = todayValueHtml(ctx, BH);
    return { head: head, body: body, copy: battleCopy(BH), copyTitle: BH.tr('ks.today.copyBattle', 'copy the battle reminder for KingShot') };
  }

  // ── The light weeks — day-aware cards ──────────────────
  // The brawl's six themed days: five 24-hour challenge days, then the
  // ~36-hour Full-Scale finale spilling from day 6 into Sunday day 7.
  var BRAWL_THEMES = ['Rise of the City', 'Hero Development', 'Pet Training', 'Gear Enhancement', 'Trade Baron', 'Full-Scale Competition'];
  function brawlThemeIdx(d) { return d > 6 ? 6 : d; }

  // ── The week's main event feeds the card (single source: the section DOM) ──
  function brawlDayDetails(n) {
    var sec = document.getElementById('brawl');
    if (!sec) return null;
    var days = sec.querySelectorAll('details.day');
    if (!days.length) return null;
    var i = (n - 1) % days.length;
    var d = days[i];
    if (!d) return null;
    var rows = [];
    var trs = d.querySelectorAll('table.pt tbody tr');
    for (var r = 0; r < trs.length; r++) {
      var cells = trs[r].querySelectorAll('td');
      if (cells.length < 2) continue;
      var label = cells[0].textContent.replace(/\s+/g, ' ').trim();
      var p = cells[1].textContent.replace(/,/g, '').trim();
      var pts = /^\d+$/.test(p) ? parseInt(p, 10) : p;
      rows.push({ label: label, pts: pts });
    }
    var v = d.querySelector('.bd-verdict');
    return { title: d.querySelector('.day-title') ? d.querySelector('.day-title').textContent.replace(/\s+/g, ' ').trim() : '', verdict: v ? v.textContent.replace(/\s+/g, ' ').trim() : null, rows: rows };
  }

  function brawlCard(BH) {
    var n = brawlThemeIdx(day);
    var kicker = 'Alliance Brawl \u00B7 day ' + n + ' of the week';
    var det = brawlDayDetails(n);
    var title = det ? det.title : (BRAWL_THEMES[n - 1] || '');
    var meta = BH.tr('ks.today.brawlMeta', 'Your personal ranking is against your alliance members. Check any agreed ranking before pushing your score.');
    var brawlIds = new Set();
    var ptsById = {};
    var freeActions = [];
    if (det && det.rows.length) {
      for (var i = 0; i < det.rows.length; i++) {
        var row = det.rows[i];
        var id = labelToItemId(row.label);
        var ptsTxt = typeof row.pts === 'number' ? BH.fmt(row.pts) : String(row.pts);
        if (id === 'free') { freeActions.push({ label: row.label, pts: ptsTxt }); continue; }
        if (!id) continue;
        if (!brawlIds.has(id)) ptsById[id] = ptsTxt;
        brawlIds.add(id);
      }
    }
    var ctx = { prepN: null, sgN: null, brawlIds: brawlIds, sgIds: new Set(), lowIds: runLowIds(), ptsById: ptsById, freeActions: freeActions };
    var body = todayValueHtml(ctx, BH);
    var head = '<p class="today-kicker">' + kicker + '</p>' +
      '<p class="today-title">' + title + '</p>' +
      '<p class="today-meta">' + meta + '</p>';
    return { head: head, body: body, copy: '', copyTitle: '' };
  }

  function mobCard(BH) {
    var kicker = 'Alliance Mobilization \u00B7 week 3';
    var title = BH.tr('ks.today.mobTitle', 'Alliance missions');
    var meta = BH.tr('ks.today.mobMeta', 'Accept a mission before completing its task. Check overlapping Armament or Officer tasks before a planned spend.');
    if (day === 20) meta = BH.tr('ks.today.mobLast', 'last day of mobilization \u2014 ') + meta;
    var head = '<p class="today-kicker">' + kicker + '</p>' +
      '<p class="today-title">' + title + '</p>' +
      '<p class="today-meta">' + meta + '</p>';
    var ctx = { prepN: null, sgN: null, brawlIds: null, sgIds: new Set(), lowIds: runLowIds(), ptsById: {}, freeActions: null };
    var body = todayValueHtml(ctx, BH);
    return { head: head, body: body, copy: '', copyTitle: '' };
  }

  function sideRun(run, BH) {
    var name = run.event === 'armament' ? 'Armament Competition' : 'Officer Project';
    var gly = run.event === 'armament' ? '🛡️ ' : '🎖️ ';
    return '<p class="side-run">' + gly + '<b>' + name + ' · ' + run.run.type + '</b> — ' + BH.tr('ks.today.sideRun', 'check its tasks before a planned spend.') + '</p>';
  }

  function gapCard(BH) {
    // Day 21: nothing of its own — Officer Project Type B and Swordland's
    // Sunday battle are the only things live (weekNotes + sideRun carry them).
    var head = '<p class="today-kicker">' + BH.tr('ks.today.between', 'Between weeks') + ' · ' + BH.tr('ks.today.day', 'day') + ' 21</p>' +
      '<p class="today-title">' + BH.tr('ks.today.beforePrep', 'Before prep tomorrow') + '</p>' +
      '<p class="today-meta">' + BH.tr('ks.today.gapMeta', 'KvK prep opens tomorrow. Hold intel from 08:00 UTC and check your alliance’s Swordland time.') + '</p>';
    var ctx = { prepN: null, sgN: null, brawlIds: null, sgIds: new Set(), lowIds: runLowIds(), ptsById: {}, freeActions: null };
    var body = todayValueHtml(ctx, BH);
    return { head: head, body: body, copy: '', copyTitle: '' };
  }

  // ── Day-driven page ────────────────────────────────────
  var PHASE_FIRST = { brawl: 1, sg: 8, mob: 15, prep: 22, battle: 27 };
  var PHASE_NAME = {
    brawl: 'Alliance Brawl', sg: 'Strongest Governor', mob: 'Alliance Mobilization',
    prep: 'KvK prep', battle: 'the battle weekend'
  };
  function paintDaySections() {
    var w = weekOf(day);
    var secs = document.querySelectorAll('section[data-phase]');
    for (var i = 0; i < secs.length; i++) {
      secs[i].hidden = false;
      secs[i].classList.toggle('current-phase', secs[i].dataset.phase === w);
    }
  }

  function daySummary(d, BH) {
    var phase = weekOf(d);
    if (phase === 'prep') return BH.tr('ks.today.kickerPrep', 'KvK prep') + ' · ' + BH.tr('ks.today.day', 'day') + ' ' + prepDayOf(d) + ': ' + KOP_THEMES[prepDayOf(d) - 1];
    if (phase === 'sg') return BH.tr('ks.today.kickerSg', 'Strongest Governor') + ' · ' + BH.tr('ks.today.day', 'day') + ' ' + sgDayOf(d) + ': ' + SG_THEMES[sgDayOf(d) - 1];
    if (phase === 'brawl') return BH.tr('ks.brawl.title', 'Alliance Brawl') + ': ' + BRAWL_THEMES[brawlThemeIdx(d) - 1];
    if (phase === 'mob') return BH.tr('ks.mob.title', 'Alliance Mobilization');
    if (phase === 'gap') return BH.tr('ks.today.beforePrep', 'Before prep tomorrow');
    return BH.tr('ks.week.battle', 'KvK battle weekend');
  }

  function render(BH) {
    paintDaySections();
    document.getElementById('ks-view-title').textContent = followingToday ? BH.tr('ks.today.title', 'Today') : BH.tr('ks.today.selected', 'Selected day');
    var now = new Date();
    var offset = day - todayDay();
    var date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
    document.getElementById('ks-date').textContent = date.toLocaleDateString((window.I18N && window.I18N.locale) || 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) + ' · UTC';
    document.getElementById('ks-today').setAttribute('aria-pressed', String(followingToday));
    var nextDay = day % CYCLE_LEN + 1;
    document.getElementById('ks-next-day').textContent = BH.tr('ks.today.nextUp', 'Next day') + ' · ' + daySummary(nextDay, BH);
    var out = document.getElementById('ks-day-out');
    if (out) {
      var dows = BH.tr('ks.today.dows', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
      var uw = (day - 1) % 7;
      var weekday = (Array.isArray(dows) ? dows[uw] : '') ||
        ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][uw];
      out.textContent = weekday + ' \u00B7 ' + BH.tpl('ks.today.dayOut', 'day {n} of 28', { n: day }) +
        (followingToday ? ' ' + BH.tr('ks.today.isToday', '\u00B7 today') : '');
    }
    paintCycle(BH);
    highlightMatrix(BH);

    var card = document.getElementById('ks-card');
    if (!card) return;
    var w = weekOf(day);
    var run = liveRun(day);
    var info;
    if (w === 'brawl') info = brawlCard(BH);
    else if (w === 'mob') info = mobCard(BH);
    else if (w === 'gap') info = gapCard(BH);
    else if (w === 'prep') info = prepCard(prepDayOf(day), BH);
    else if (w === 'sg') info = sgCard(sgDayOf(day), BH);
    else info = battleCard(BH);
    if (run) info.head += sideRun(run, BH);
    if (!info.copy) info.copy = reminderCopy(w, BH);
    info.copyTitle = BH.tr('ks.today.copyRun', 'copy for KingShot');

    var html = info.head + weekActions(BH) + copyBoxHTML(info.copy, info.copyTitle) + info.body;
    card.innerHTML = html;
    wireCopy(BH, info.copy);
  }

  function weekActions(BH) {
    var notes = '';
    if (day === 21) notes += '<p class="today-action">' + ITEM_GLYPH['Intel missions'] + BH.tr('ks.today.holdIntel', 'from 08:00 today, stop collecting intel missions. They bank and cash in for prep points.') + '</p>';
    if (day === 7 || day === 21) notes += '<p class="today-action"><span aria-hidden="true">⚔️</span> ' + BH.tr('ks.today.swordSunday', 'Swordland Showdown’s one-hour battle runs today, the Sunday of this week.') + '</p>';
    if (day === 20) notes += '<p class="today-action"><span aria-hidden="true">🏰</span> ' + BH.tr('ks.today.matchmaking', 'KvK matchmaking window: check the opponent reveal in game.') + '</p>';
    return notes ? '<div class="today-actions">' + notes + '</div>' : '';
  }

  function reminderCopy(w) {
    if (w === 'brawl') return ['ALLIANCE BRAWL · DAY ' + day, BRAWL_THEMES[brawlThemeIdx(day) - 1], 'Check agreed alliance ranks', 'Then check your next chest', 'Trucks: Merchant overlap', 'where available'].join('\n');
    if (w === 'gap') return ['BEFORE KVK PREP', itemTag('Intel') + 'Hold intel from 08:00 UTC', 'Prep begins next reset', 'Swordland: alliance time', 'Keep prep materials'].join('\n');
    return ['ALLIANCE MOBILIZATION', 'Accept mission before task', 'Check overlapping events', 'Keep planned prep materials'].join('\n');
  }

  // ── The matrix highlight ───────────────────────────────
  function highlightMatrix(BH) {
    var table = document.getElementById('ks-matrix');
    if (!table) return;
    var w = weekOf(day);
    var n = w === 'prep' ? prepDayOf(day) : 0;
    var heads = table.querySelectorAll('thead th');
    var cells = table.querySelectorAll('td[data-d]');
    for (var i = 0; i < heads.length; i++) heads[i].classList.toggle('today', n > 0 && i === n);
    for (var j = 0; j < cells.length; j++) {
      cells[j].classList.toggle('today', n > 0 && parseInt(cells[j].getAttribute('data-d'), 10) === n);
    }
  }

  // ── KingShot copy ──────────────────────────────────────
  // KingShot chat has a fixed width and a LINE CAP — the full prep chart
  // comes back from a paste with its rows merged (the alliance's own test
  // showed it). So every copy block is compact: lines stay aligned in ≤28
  // display cells (item icons ride in as <item_icon_N> tags), no blank
  // lines, short chat labels, and a whole block ≤512 characters. One prep
  // day = one message.

  // Short chat labels — the alliance's own chart words.
  var SHORT = {
    'Truegold': 'Truegold', 'Tempered TG': 'temp TG', 'Hero shard': 'Hero shard',
    'Master emblem': 'Master Emblem', 'Building': 'Building', 'Troop': 'Troop', 'Research': 'Research',
    'Hero roulette': 'Roulette', 'Gathering': 'Gathering', 'Intel missions': 'Intel',
    'Pets advance': 'Pets', 'Gov charm': 'Gov charm', 'Gov gear': 'Gov gear',
    'Widget gear': 'Widget', 'Mithril': 'Mithril', 'Forgehammer': 'Hammer'
  };

  // ── Display-width helpers for the KingShot copy ────────
  // KingShot renders an <item_icon_N> tag as a single glyph (1 display cell),
  // a narrow char as 1 cell, and a wide/full-width char (CJK, full-width
  // digits １, full-width ｜, emoji) as 2 cells. displayCells() measures a
  // line's true display width; every copy line must stay ≤28 cells.
  function isWideCode(cp) {
    return (
      (cp >= 0x1100 && cp <= 0x115F) ||   // Hangul Jamo
      (cp >= 0x2E80 && cp <= 0x303E) ||   // CJK radicals .. CJK symbols
      (cp >= 0x3041 && cp <= 0x33FF) ||   // Hiragana .. CJK compatibility
      (cp >= 0x3400 && cp <= 0x4DBF) ||   // CJK ext A
      (cp >= 0x4E00 && cp <= 0x9FFF) ||   // CJK unified ideographs
      (cp >= 0xA000 && cp <= 0xA4CF) ||   // Yi
      (cp >= 0xAC00 && cp <= 0xD7A3) ||   // Hangul syllables
      (cp >= 0xF900 && cp <= 0xFAFF) ||   // CJK compat ideographs
      (cp >= 0xFE30 && cp <= 0xFE4F) ||   // CJK compat forms
      (cp >= 0xFF00 && cp <= 0xFF60) ||   // Full-width forms (｜, １, …)
      (cp >= 0xFFE0 && cp <= 0xFFE6) ||   // Full-width signs
      (cp >= 0x2600 && cp <= 0x27BF) ||   // Misc symbols / dingbats (✅, marks)
      (cp >= 0x1F000 && cp <= 0x1FAFF) || // Emoji (🆗, 🚫, 👑, 🛡, 🎖)
      (cp >= 0x20000 && cp <= 0x2FFFD) || // CJK ext B+
      (cp >= 0x30000 && cp <= 0x3FFFD)
    );
  }
  function cellsOf(seg) {
    var n = 0;
    for (var i = 0; i < seg.length; i++) {
      var cp = seg.charCodeAt(i);
      if (cp >= 0xD800 && cp <= 0xDBFF && i + 1 < seg.length) {
        var lo = seg.charCodeAt(i + 1);
        if (lo >= 0xDC00 && lo <= 0xDFFF) { cp = (cp - 0xD800) * 0x400 + (lo - 0xDC00) + 0x10000; i++; }
      }
      if (cp === 0x200D || (cp >= 0xFE00 && cp <= 0xFE0F)) continue; // zero-width (ZWJ, VS16)
      n += isWideCode(cp) ? 2 : 1;
    }
    return n;
  }
  // A line's display width: every <item_icon_N> tag counts 1 cell, wide
  // chars count 2, everything else 1. Used where the old code used .length.
  function displayCells(str) {
    var s = String(str);
    var n = 0;
    var last = 0;
    var re = /<item_icon_[A-Za-z0-9_]+>/g;
    var m;
    while ((m = re.exec(s)) !== null) {
      n += cellsOf(s.slice(last, m.index));
      n += 1; // the whole tag renders as one icon glyph
      last = re.lastIndex;
    }
    n += cellsOf(s.slice(last));
    return n;
  }

  // Map a copy label to its KingShot item-icon tag, returned as an inline
  // <item_icon_N> tag ('' when the item has no icon). The tag, not the raw
  // PUA codepoint, is the reliable in-game notation — the game font aliases
  // the raw codepoints and pasting them produces duplicate glyphs.
  function itemTag(label) {
    var l = String(label).toLowerCase();
    if (/dust/.test(l)) return '';                                          // Truegold Dust → no icon
    if (/temp(ered)?\s*tg/.test(l)) return '<item_icon_100081>';             // Tempered TG / temp TG
    if (/truegold/.test(l)) return '<item_icon_100081>';                     // KINGSHOT TRUEGOLD
    if (/speedup|\bspd\b/.test(l)) return '<item_icon_200101>';              // GENERAL SPEEDUP (combined)
    if (/hero shard|shard/.test(l)) return '<item_icon_500220>';            // KINGSHOT HERO SHARD
    if (/building|construction/.test(l)) return '<item_icon_200201>';       // BUILDING SPEEDUP
    if (/troop|t1[01]|train|promot/.test(l)) return '<item_icon_200301>';   // TROOP SPEEDUP
    if (/research/.test(l)) return '<item_icon_200401>';                    // RESEARCH SPEEDUP
    if (/intel/.test(l)) return '<item_icon_620163>';                       // INTEL MISSIONS — owner: the Energy Booster icon
    if (/roulette/.test(l)) return '<item_icon_101>';                  // HERO ROULETTE — spins cost GEMS (KINGSHOT GEM)
    if (/wheel coin/.test(l)) return '<item_icon_109>';                 // WHEEL COIN
    if (/forgehammer|hammer/.test(l)) return '<item_icon_500240>';          // FORGEHAMMER
    return '';  // Mithril, Widget, emblem/manuscript, Gov charm/gear, intel,
                // gathering, pets, trucks/beasts/terror → no Kingshot icon.
  }

  // Wrap items into ≤maxCells display lines. Every line of a group is marked
  // (✅/🆗/🚫) so a wrapped continuation is unambiguous. Icons are already
  // embedded in each item (a tag costs 1 cell). Full-width ｜ separators keep
  // the rows matrix-aligned; they already cost less than " · " (2 vs 3 cells).
  // Each emitted line ends with the group's mark (✅/🆗/🚫) rather than leading
  // with it, so a wrapped group keeps its verdict on every row it spans.
  // Packing uses the game's own count (each char, each tag = 1 cell — the
  // layout the alliance tested in chat): icon tag + space = 2, label chars =
  // their length, ｜ separator = 1, trailing space + verdict = 2. Budget 28.
  function packRows(ids, mark, maxCells) {
    var lines = [];
    var cur = '';
    var cells = 0;
    var sep = '\uFF5C';
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var t = itemTag(id);
      var name = SHORT[id] || id;
      var piece = t ? (t + ' ' + name) : name;
      var pc = (t ? 2 : 0) + name.length;
      var sepCost = cur ? 1 : 0;
      if (cur && cells + sepCost + pc + 2 > maxCells) { lines.push(cur + ' ' + mark); cur = piece; cells = pc; }
      else { cur = (cur ? cur + sep : '') + piece; cells += sepCost + pc; }
    }
    if (cur) lines.push(cur + ' ' + mark);
    return lines;
  }

  function dayBlock(n) {
    var groups = { best: [], ok: [], no: [] };
    for (var i = 0; i < MATRIX.length; i++) {
      groups[MATRIX[i][1][n - 1]].push(MATRIX[i][0]);
    }
    var lines = ['\uD83D\uDC51KVK PREP \u00B7 DAY ' + n + '\uD83D\uDC51', KOP_THEMES[n - 1]];
    lines = lines.concat(packRows(groups.best, '\u2705', 28), packRows(groups.ok, '\uD83C\uDD97', 28));
    if (groups.no.length > 4) lines.push('\uD83D\uDEAB everything else, save it \uD83D\uDEAB');
    else lines = lines.concat(packRows(groups.no, '\uD83D\uDEAB', 28));
    return lines.join('\n');
  }

  function sgCopy(n) {
    var tasks = SG_TASKS[n - 1].slice().sort(function (a, b) { return b[1] - a[1]; });
    var pieces = [];
    for (var i = 0; i < tasks.length; i++) {
      var label = tasks[i][0];
      pieces.push(tasks[i][1].toLocaleString('en-GB') + ' ' + itemTag(label) + (SG_SHORT[label] || label));
    }
    var lines = ['\uD83D\uDC51SG DAY ' + n + '\uD83D\uDC51', SG_THEMES[n - 1]];
    var cur = '';
    var sep = '\uFF5C';
    for (var j = 0; j < pieces.length; j++) {
      var add = (cur ? sep : '') + pieces[j];
      if (cur && displayCells(cur + add) > 28) { lines.push(cur); cur = pieces[j]; }
      else cur += add;
    }
    if (cur) lines.push(cur);
    if (tasks.some(function (task) { return task[0] === 'Hero Roulette'; })) lines.push('roulette costs gems');
    return lines.join('\n');
  }

  function battleCopy(BH) {
    return [
      '\uD83D\uDC51KVK BATTLE WEEKEND\uD83D\uDC51',
      'castle: 5h contest',
      '2.5h continuous = early win',
      'else most hold time',
      '10-22 UTC: teleports + kills',
      'chat rules',
      '4 turrets \u00B7 triage 30% \u2192 90%',
      'SHIELD \u00B7 essential offline'
    ].join('\n');
  }

  // Split into ≤512-char messages at line boundaries.
  var LIMIT = 512;
  function splitParts(text) {
    var parts = [];
    var rest = text;
    while (rest.length > LIMIT) {
      var cut = rest.lastIndexOf('\n', LIMIT);
      if (cut < 1) cut = LIMIT;
      parts.push(rest.slice(0, cut));
      rest = rest.slice(cut).replace(/^\n+/, '');
    }
    parts.push(rest);
    return parts;
  }

  function copyBoxHTML(text, title) {
    return '<div class="copy-box"><div class="copy-btns">' +
      '<button type="button" id="ks-copy-btn" class="kb copy-primary">📋 ' + window.BH.tr('ks.today.copyRun', 'copy for KingShot') + '</button>' +
      '<span id="ks-copy-status" role="status"></span><span id="ks-copy-parts" class="cycle-quick"></span></div>' +
      '<details id="ks-copy-preview"><summary>' + window.BH.tr('ks.today.preview', 'Message preview') + '</summary><div class="copy-inner">' +
      '<textarea id="ks-copy-out" readonly spellcheck="false" aria-label="' + title + '"></textarea>' +
      '<p class="copy-meta" id="ks-copy-meta"></p><p class="copy-note">' + window.BH.tr('ks.today.copyNote', 'Shaped for KingShot chat: item icons ride in as &lt;item_icon_N&gt; tags, every line stays inside 28 display cells, and a block stays under 512 characters. If a block runs over one message, it comes split into parts; paste them in order.') + '</p></div></details></div>';
  }

  function wireCopy(BH, text) {
    var out = document.getElementById('ks-copy-out');
    var meta = document.getElementById('ks-copy-meta');
    var btn = document.getElementById('ks-copy-btn');
    var partsWrap = document.getElementById('ks-copy-parts');
    if (!out || !meta || !btn) return;

    var parts = splitParts(text);
    var idx = 0;

    function paint() {
      out.value = parts[idx];
      var len = parts[idx].length;
      var fits = len <= LIMIT;
      meta.innerHTML = BH.tpl('ks.today.chars', '<b>{n}</b> / 512 characters', { n: BH.fmt(len) }) +
        (fits ? ' \u2014 ' + BH.tr('ks.today.fits', 'fits one message') : ' \u2014 <span class="over">' + BH.tpl('ks.today.over', 'split into {n} messages', { n: parts.length }) + '</span>');
      btn.textContent = '📋 ' + (parts.length > 1 ? BH.tpl('ks.today.part', 'part {n}', { n: idx + 1 }) + ' \u00B7 ' : '') + BH.tr('ks.today.copyRun', 'copy for KingShot');
      document.getElementById('ks-copy-status').textContent = '';
      if (partsWrap) {
        partsWrap.innerHTML = '';
        if (parts.length === 1) return;
        for (var i = 0; i < parts.length; i++) {
          (function (pi) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'kb' + (pi === idx ? ' on' : '');
            b.textContent = BH.tpl('ks.today.part', 'part {n}', { n: pi + 1 });
            b.addEventListener('click', function () { idx = pi; paint(); });
            partsWrap.appendChild(b);
          })(i);
        }
      }
    }

    async function doCopy() {
      var copied = false;
      var value = out.value;
      var status = document.getElementById('ks-copy-status');
      btn.disabled = true;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(value);
          copied = true;
        }
      } catch (e) {}
      if (!copied) {
        document.getElementById('ks-copy-preview').open = true;
        out.focus();
        out.select();
        try { copied = document.execCommand('copy'); } catch (e) {}
      }
      btn.disabled = false;
      status.textContent = copied ? BH.tr('ks.today.copied', 'copied. paste it straight into KingShot.') : BH.tr('ks.today.copyFailed', 'Select and copy the message below.');
    }

    btn.addEventListener('click', doCopy);
    paint();
  }

  // ── Registration ───────────────────────────────────────
  function boot(BH) {
    var prev = document.getElementById('ks-prev');
    var next = document.getElementById('ks-next');
    if (prev) prev.addEventListener('click', function () { setDay(day - 1, BH); });
    if (next) next.addEventListener('click', function () { setDay(day + 1, BH); });
    var today = document.getElementById('ks-today');
    if (today) today.addEventListener('click', function () { followingToday = true; day = todayDay(); render(BH); });
    var quicks = document.querySelectorAll('[data-jump]');
    for (var i = 0; i < quicks.length; i++) {
      (function (b) {
        b.addEventListener('click', function () { setDay(parseInt(b.getAttribute('data-jump'), 10), BH); });
      })(quicks[i]);
    }
    var toggles = document.querySelectorAll('.reference-toggle');
    Array.prototype.forEach.call(toggles, function (button) {
      var body = document.getElementById(button.getAttribute('aria-controls'));
      body.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      button.querySelector('.reference-mark').textContent = '+';
      button.addEventListener('click', function () {
        body.hidden = !body.hidden;
        button.setAttribute('aria-expanded', String(!body.hidden));
        button.querySelector('.reference-mark').textContent = body.hidden ? '+' : '−';
      });
    });
    function openHash() {
      var section = document.getElementById(location.hash.slice(1));
      if (!section) return;
      var body = section.querySelector('.reference-body');
      var button = section.querySelector('.reference-toggle');
      if (body && button) { body.hidden = false; button.setAttribute('aria-expanded', 'true'); button.querySelector('.reference-mark').textContent = '−'; }
    }
    window.addEventListener('hashchange', openHash);
    document.querySelectorAll('.toc a').forEach(function (link) {
      link.addEventListener('click', function () {
        var section = document.getElementById(link.hash.slice(1));
        var button = section && section.querySelector('.reference-toggle');
        if (button && button.getAttribute('aria-expanded') === 'false') button.click();
      });
    });
    openHash();
    // The today display is live on the UTC date: if the cycle day rolls over
    // while the page is open (or the tab sat backgrounded overnight), catch
    // up on focus/visibility instead of showing a stale day. No-op whenever
    // the selected day already matches today.
    function refreshToday() {
      var t = todayDay();
      if (followingToday && t !== day) { day = t; render(BH); }
    }
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refreshToday();
    });
    window.addEventListener('focus', refreshToday);
    render(BH);
  }

  BH.registerPage({
    boot: boot,
    onChange: function () { render(window.BH); }
  });
})();
