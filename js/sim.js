/* sim.js — the Battle Simulator page (battle-simulator/).
   Registers with common.js via window.BH.registerPage.

   One report read once, four fights answered from it:
   - Bear ratio: the lead's ideal troop mix (MATHS.md §4–5).
   - Bear march: your own march's split measured against that ratio.
   - Mystic Trial: the stage from its report, fought by the battle engine
     (js/battle-engine.js), plus a sweep of every mix of your march.
   - Battle: any two sides you can type, fought the same way.
   Strings come from the active dictionary (sim.* keys, English fallback) and
   the page re-paints on i18n:change, so a language switch mid-session shows
   the new language and locale-formatted numbers.

   Heroes are the deliberate omission. In a bear split an ALL-TROOP skill
   cancels out, a TYPE-SPECIFIC one does not (SIM-PROPOSAL.md §10); in a
   battle every skill counts. The engine fights troops and stats only — the
   Frakinator's own scope for the hero-less Mystic Trial rooms — and the copy
   says so wherever heroes would change the answer. */
(function () {
  'use strict';

  var E = window.BattleEngine;

  // ── The three troop types, in troop-table order ───────
  // block = the row label on a battle report (what the OCR reads), key = the
  // internal id behind every input, nameKey/fallback = the translated label.
  var TYPES = [
    { key: 'inf', block: 'Infantry', nameKey: 'sim.calc.inf', fallback: 'Infantry' },
    { key: 'cav', block: 'Cavalry', nameKey: 'sim.calc.cav', fallback: 'Cavalry' },
    { key: 'arc', block: 'Archer', nameKey: 'sim.calc.arc', fallback: 'Archery' }
  ];

  // The report sheet's four stat columns, in Bonus-Details order. ocr = the
  // row label on the report (what the OCR matches).
  var STATS = [
    { key: 'atk', ocr: 'Attack', nameKey: 'sim.calc.atk', fallback: 'Attack %' },
    { key: 'let', ocr: 'Lethality', nameKey: 'sim.calc.let', fallback: 'Lethality %' },
    { key: 'def', ocr: 'Defense', nameKey: 'sim.load.def', fallback: 'Defense %' },
    { key: 'hea', ocr: 'Health', nameKey: 'sim.load.hea', fallback: 'Health %' }
  ];

  var MODES = ['bear-ratio', 'bear-damage', 'mystic', 'battle'];
  var DEFAULT_MODE = 'bear-ratio';
  // Old links: the PvE bench became the battle mode, which fights beasts too.
  var ALIASES = { pve: 'battle' };

  // Which blocks each mode shows (.sim-for[data-for]). ratio and bear-march
  // carry the one line that differs between the two bear modes.
  var GROUPS = {
    'bear-ratio': ['bear', 'ratio'],
    'bear-damage': ['bear', 'march', 'bear-march'],
    'mystic': ['fight', 'march', 'mystic'],
    'battle': ['fight', 'march', 'battle']
  };

  // ── The bear weights (MATHS.md §2) ────────────────────
  // The published weights at the table's reference row, T6/TG0 — exactly
  // where ⅓ / 1 / 4.4⁄3 comes from. Tier enters as ONE shared scale for the
  // whole march, taken from the infantry series (attack 1 : 3 : 4, MATHS.md
  // §6.2), so a uniform tier cancels exactly and the march panel can never
  // disagree with the ratio panel; only a mixed-tier march moves the optimum.
  var WEIGHTS = [1 / 3, 1, 4.4 / 3];
  var REF_TIER = 6, REF_TG = 0;

  function tierScale(tier, tg) {
    return E.baseAtk(0, tier, tg) / E.baseAtk(0, REF_TIER, REF_TG);
  }

  // The archers' second ×1.1 vs the all-infantry bear, from T7+ / TG3+
  // (MATHS.md §2); the flat ×1.1 is already inside WEIGHTS[2].
  function typeWeight(i, tier, tg) {
    return WEIGHTS[i] * tierScale(tier, tg) * (i === 2 && E.hasSecondSkill(tier, tg) ? 1.1 : 1);
  }

  function el(id) { return document.getElementById(id); }

  function num(id) {
    var e = el(id);
    var v = parseFloat(e ? e.value : '');
    return isFinite(v) ? v : 0;
  }

  function pick(id, fallback) {
    var e = el(id);
    var v = e ? parseInt(e.value, 10) : NaN;
    return isFinite(v) ? v : fallback;
  }

  function locale() {
    return (window.I18N && window.I18N.locale) || 'en-GB';
  }

  // A fixed-precision number in the active locale's digits.
  function numFmt(x, digits) {
    try {
      return x.toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
    } catch (e) {
      return x.toFixed(digits);
    }
  }

  function pct(x) { return numFmt(x, 1) + '%'; }
  function pct0(x) { return numFmt(Math.round(x), 0) + '%'; }

  // "50 / 15 / 35" — a mix in infantry / cavalry / archer order, always LTR.
  function mixText(f) {
    return f.map(function (x) { return numFmt(Math.round(x * 1000) / 10, x * 1000 % 10 ? 1 : 0); }).join(' / ');
  }

  // ── Reading the sheets ────────────────────────────────
  // The lead's A factor per type, straight off the report sheet. A negative
  // percentage is not a stat — floored at zero.
  function leadA() {
    var A = {};
    TYPES.forEach(function (t) {
      A[t.key] = (1 + Math.max(0, num('sim-atk-' + t.key)) / 100) * (1 + Math.max(0, num('sim-let-' + t.key)) / 100);
    });
    return A;
  }

  // Has the reader entered any Bonus Details value at all? An empty sheet is
  // not a lead with zeroes — it is no answer yet.
  function anyStatEntered(prefix) {
    var found = false;
    STATS.forEach(function (s) {
      TYPES.forEach(function (t) {
        var e = el(prefix + s.key + '-' + t.key);
        var v = e ? parseFloat(e.value) : NaN;
        if (isFinite(v) && v > 0) found = true;
      });
    });
    return found;
  }

  // One side as the engine takes it. prefix 'sim-' is you, 'sim-foe-' them.
  function readSide(prefix) {
    var side = { n: [], tier: [], tg: [], atk: [], let: [], def: [], hea: [] };
    TYPES.forEach(function (t, i) {
      side.n[i] = Math.max(0, Math.floor(num(prefix + 'n-' + t.key)));
      side.tier[i] = pick(prefix + 'tier-' + t.key, 10);
      side.tg[i] = pick(prefix + 'tg-' + t.key, 0);
      STATS.forEach(function (s) { side[s.key][i] = Math.max(0, num(prefix + s.key + '-' + t.key)); });
    });
    return side;
  }

  function total(n) { return n[0] + n[1] + n[2]; }

  // ── The ratio (MATHS.md §4–5) ─────────────────────────
  // w = (A_inf/3, A_cav, 4.4·A_arc/3)      f_t ∝ w_t²      K = √(Σ w_t²)
  function ratioCompute() {
    var A = leadA(), w = {}, share = {}, sum;
    w.inf = A.inf / 3;
    w.cav = A.cav;
    w.arc = (4.4 * A.arc) / 3;
    sum = w.inf * w.inf + w.cav * w.cav + w.arc * w.arc;
    TYPES.forEach(function (t) { share[t.key] = sum > 0 ? (w[t.key] * w[t.key]) / sum : 0; });
    return { A: A, w: w, share: share, k: Math.sqrt(sum), ok: sum > 0 && anyStatEntered('sim-') };
  }

  // ── The bear march (MATHS.md §1–3) ────────────────────
  // Damage per type is √N_t · base_t · A_t, so the best a march of N troops
  // can do for a given lead is √N · K_b with K_b = √(Σ (base_t·A_t)²) — and
  // the ratio between the two is the cosine between (base_t·A_t) and the
  // square roots of your shares. 100% exactly at the lead's optimum, at any
  // march size, which is what lets the panel answer without a damage scale.
  function marchCompute(A) {
    var n = [], q = [], sum = 0, dot = 0, kk = 0;
    TYPES.forEach(function (t, i) {
      var count = Math.max(0, num('sim-n-' + t.key));
      n[i] = count;
      sum += count;
      q[i] = typeWeight(i, pick('sim-tier-' + t.key, 10), pick('sim-tg-' + t.key, 0)) * A[t.key];
      dot += q[i] * Math.sqrt(count);
      kk += q[i] * q[i];
    });
    var K = Math.sqrt(kk);
    var share = q.map(function (x) { return kk > 0 ? (x * x) / kk : 0; });
    return { n: n, share: share, total: sum, eff: (sum > 0 && K > 0) ? dot / (Math.sqrt(sum) * K) : 0, ok: sum > 0 && K > 0 && anyStatEntered('sim-') };
  }

  // ── Painting: names ───────────────────────────────────
  // The visible labels live in the markup; this keeps the composed accessible
  // names (side + type + stat) in the active language.
  function paintNames(BH) {
    var foe = BH.tr('sim.foe.title', 'The opponent');
    TYPES.forEach(function (t) {
      var name = BH.tr(t.nameKey, t.fallback);
      STATS.forEach(function (s) {
        var label = BH.tr(s.nameKey, s.fallback);
        var mine = el('sim-' + s.key + '-' + t.key), theirs = el('sim-foe-' + s.key + '-' + t.key);
        if (mine) mine.setAttribute('aria-label', name + ' — ' + label);
        if (theirs) theirs.setAttribute('aria-label', foe + ' — ' + name + ' — ' + label);
      });
      [['n-', 'sim.dmg.thCount', 'troops'], ['tier-', 'sim.dmg.thTier', 'tier'], ['tg-', 'sim.dmg.thTg', 'TG']].forEach(function (c) {
        var label = BH.tr(c[1], c[2]);
        var mine = el('sim-' + c[0] + t.key), theirs = el('sim-foe-' + c[0] + t.key);
        if (mine) mine.setAttribute('aria-label', name + ' — ' + label);
        if (theirs) theirs.setAttribute('aria-label', foe + ' — ' + name + ' — ' + label);
      });
    });
  }

  function head(cells) {
    return '<div class="sim-head" role="row">' + cells.map(function (c) {
      return '<span role="columnheader">' + c + '</span>';
    }).join('') + '</div>';
  }

  function paintRatio(BH) {
    var s = ratioCompute();

    var headline = el('sim-headline');
    if (headline) {
      headline.innerHTML = !s.ok
        ? BH.tr('sim.calc.noStats', 'Fill in the lead’s <b>attack</b> and <b>lethality</b> above — the ratio comes from their stats.')
        : BH.tpl('sim.calc.headline',
          'With this lead, the ideal march is <b>{inf}</b> infantry, <b>{cav}</b> cavalry, <b>{arc}</b> archers.',
          { inf: pct(s.share.inf * 100), cav: pct(s.share.cav * 100), arc: pct(s.share.arc * 100) });
    }

    var out = el('sim-out');
    if (out) {
      var html = '';
      if (s.ok) {
        html = head([BH.tr('sim.calc.thType', 'Troop'), BH.tr('sim.calc.thA', 'A factor'),
          BH.tr('sim.calc.thWeight', 'weight'), BH.tr('sim.calc.thShare', 'ideal share')]);
        TYPES.forEach(function (t) {
          html += '<div class="sim-row" role="row">' +
            '<span class="sim-type" role="cell">' + BH.tr(t.nameKey, t.fallback) + '</span>' +
            '<span class="sim-a" role="cell">' + numFmt(s.A[t.key], 2) + '×</span>' +
            '<span class="sim-w" role="cell">' + numFmt(s.w[t.key], 2) + '</span>' +
            '<span class="sim-share" role="cell">' + pct(s.share[t.key] * 100) + '</span></div>';
        });
      }
      out.innerHTML = html;
      out.hidden = html === '';
    }

    var kEl = el('sim-k');
    if (kEl) kEl.innerHTML = s.ok ? BH.tpl('sim.calc.k', 'Leader strength K = <b>{k}</b>', { k: numFmt(s.k, 2) }) : '';
  }

  function paintMarch(BH) {
    var m = marchCompute(leadA());

    var headline = el('sim-dmg-headline');
    if (headline) {
      headline.innerHTML = m.ok
        ? BH.tpl('sim.dmg.headline', 'Your split converts <b>{eff}</b> of what these troops could do for this lead.', { eff: pct(m.eff * 100) })
        : BH.tr('sim.dmg.noStats', 'Fill in the lead’s stats above and your troop counts — the split needs both.');
    }

    var out = el('sim-dmg-out');
    if (out) {
      var html = '';
      if (m.ok) {
        html = head([BH.tr('sim.calc.thType', 'Troop'), BH.tr('sim.dmg.thCount', 'troops'),
          BH.tr('sim.dmg.thYours', 'your share'), BH.tr('sim.dmg.thIdeal', 'ideal share')]);
        TYPES.forEach(function (t, i) {
          html += '<div class="sim-row" role="row">' +
            '<span class="sim-type" role="cell">' + BH.tr(t.nameKey, t.fallback) + '</span>' +
            '<span class="sim-n" role="cell">' + numFmt(m.n[i], 0) + '</span>' +
            '<span class="sim-a" role="cell">' + pct(m.total ? (m.n[i] / m.total) * 100 : 0) + '</span>' +
            '<span class="sim-share" role="cell">' + pct(m.share[i] * 100) + '</span></div>';
        });
      }
      out.innerHTML = html;
      out.hidden = html === '';
    }

    var ideal = el('sim-dmg-ideal');
    if (ideal) {
      ideal.innerHTML = m.ok
        ? BH.tpl('sim.dmg.ideal',
          'Split the lead’s way, that same march is <b>≈{inf}</b> infantry, <b>≈{cav}</b> cavalry, <b>≈{arc}</b> archers.',
          {
            inf: numFmt(Math.round(m.total * m.share[0]), 0),
            cav: numFmt(Math.round(m.total * m.share[1]), 0),
            arc: numFmt(Math.round(m.total * m.share[2]), 0)
          })
        : '';
    }
  }

  function paintTotal(BH) {
    var line = el('sim-total');
    if (!line) return;
    var n = readSide('sim-').n, sum = total(n);
    line.innerHTML = sum > 0
      ? BH.tpl('sim.march.total', 'March total <b>{n}</b> — {mix} as typed.', { n: numFmt(sum, 0), mix: '<span class="mix">' + mixText(n.map(function (x) { return x / sum; })) + '</span>' })
      : '';
  }

  // ── The rooms (Mystic Trial) ──────────────────────────
  // Rooms open on a weekday roster; the reset is 00:00 UTC, so "today" is
  // UTC, not the reader's midnight. The roster itself is markup + i18n; this
  // marks today's rows, the picked room, and names today's in the line above.
  var pickedRoom = null;

  function roomRows() { return document.querySelectorAll('#sim-rooms .sim-row[data-room]'); }

  function roomStart(row) {
    var f = (row.getAttribute('data-start') || '').split(/\s+/).map(Number);
    return f.length === 3 ? f.map(function (x) { return x / 100; }) : null;
  }

  function roomName(row) {
    var label = row.querySelector('.room-pick span');
    return label ? label.textContent : '';
  }

  // The room a sweep compares against: the one tapped, else today's only
  // room (Monday's Coliseum, Sunday's Spire), else none.
  function activeRoom() {
    var rows = roomRows(), today = [];
    for (var i = 0; i < rows.length; i++) {
      if (pickedRoom && rows[i].getAttribute('data-room') === pickedRoom) return rows[i];
      if (rows[i].classList.contains('today')) today.push(rows[i]);
    }
    return !pickedRoom && today.length === 1 ? today[0] : null;
  }

  function paintMystic(BH) {
    var day = new Date().getUTCDay();
    var open = [];
    Array.prototype.forEach.call(roomRows(), function (row) {
      var days = (row.getAttribute('data-days') || '').split(/\s+/);
      var on = days.indexOf(String(day)) !== -1;
      var picked = row.getAttribute('data-room') === pickedRoom;
      row.classList.toggle('today', on);
      row.classList.toggle('picked', picked);
      var btn = row.querySelector('.room-pick');
      if (btn) btn.setAttribute('aria-pressed', picked ? 'true' : 'false');
      var holder = row.querySelector('.room-name');
      var old = holder && holder.querySelector('.room-today');
      if (old) holder.removeChild(old);
      if (!on || !holder) return;
      if (roomName(row)) open.push(roomName(row));
      var tag = document.createElement('span');
      tag.className = 'room-today';
      tag.textContent = BH.tr('sim.mystic.today', 'open today');
      holder.appendChild(tag);
    });

    var line = el('sim-mystic-today');
    if (!line) return;
    line.textContent = '';
    if (!open.length) return;
    // Keep the template's markup and put the names in as text: the labels come
    // from the dictionary, so they must never be parsed as HTML.
    line.innerHTML = BH.fill(BH.tr('sim.mystic.todayLine', 'Open today: <b>{rooms}</b>.'), { rooms: '<span class="room-slot"></span>' });
    var slot = line.querySelector('.room-slot');
    if (slot) slot.textContent = open.join(' · ');
  }

  // ── The fight, as typed ───────────────────────────────
  // Fought on every edit: a few hundred battles of a few dozen rounds is a
  // few milliseconds, so the answer keeps up with the typing.
  var FIGHT_BATTLES = 200;

  function fightReady() {
    return total(readSide('sim-').n) > 0 && total(readSide('sim-foe-').n) > 0;
  }

  function paintFight(BH) {
    var headline = el('sim-fight-headline'), out = el('sim-fight-out');
    if (!headline || !out) return;
    if (!fightReady()) {
      headline.innerHTML = BH.tr('sim.fight.empty', 'Give both sides some troops — the fight needs two armies.');
      out.hidden = true;
      out.innerHTML = '';
      return;
    }
    var you = readSide('sim-'), foe = readSide('sim-foe-');
    var r = E.run(you, foe, FIGHT_BATTLES, E.seedOf([you, foe]));
    var win = r.win * 100;
    var key, fb;
    if (!r.random) {
      key = r.win ? 'sim.fight.sure' : 'sim.fight.never';
      fb = r.win ? 'You <b>win</b> — every time, in <b>{rounds}</b> rounds. Nothing in this fight is chance.'
        : 'You <b>lose</b> — every time, in <b>{rounds}</b> rounds. Nothing in this fight is chance.';
    } else {
      key = 'sim.fight.odds';
      fb = 'You win <b>{win}</b> of {n} battles, in about <b>{rounds}</b> rounds.';
    }
    headline.innerHTML = BH.tpl(key, fb, { win: pct0(win), n: numFmt(r.battles, 0), rounds: numFmt(Math.round(r.rounds), 0) });

    var html = head([BH.tr('sim.calc.thType', 'Troop'), BH.tr('sim.fight.thYou', 'you'),
      BH.tr('sim.fight.thLeft', 'left'), BH.tr('sim.fight.thFoe', 'them'), BH.tr('sim.fight.thLeft', 'left')]);
    TYPES.forEach(function (t, i) {
      html += '<div class="sim-row" role="row">' +
        '<span class="sim-type" role="cell">' + BH.tr(t.nameKey, t.fallback) + '</span>' +
        '<span class="sim-n" role="cell">' + numFmt(r.startA[i], 0) + '</span>' +
        '<span class="sim-share" role="cell">' + numFmt(Math.round(r.a[i]), 0) + '</span>' +
        '<span class="sim-n" role="cell">' + numFmt(r.startB[i], 0) + '</span>' +
        '<span class="sim-left-foe" role="cell">' + numFmt(Math.round(r.b[i]), 0) + '</span></div>';
    });
    html += '<div class="sim-row sim-sum" role="row">' +
      '<span class="sim-type" role="cell">' + BH.tr('sim.fight.total', 'Total') + '</span>' +
      '<span class="sim-n" role="cell">' + numFmt(total(r.startA), 0) + '</span>' +
      '<span class="sim-share" role="cell">' + numFmt(Math.round(total(r.a)), 0) + '</span>' +
      '<span class="sim-n" role="cell">' + numFmt(total(r.startB), 0) + '</span>' +
      '<span class="sim-left-foe" role="cell">' + numFmt(Math.round(total(r.b)), 0) + '</span></div>';
    out.innerHTML = html;
    out.hidden = false;
  }

  // ── The sweep — every mix of your march ───────────────
  var SWEEP_CAP = 100000;   // battles per sweep, mixes × battles
  var lastSweep = null;     // { key, result, opts }

  function sweepOpts() {
    function frac(id, fb) {
      var v = parseFloat((el(id) || {}).value);
      return isFinite(v) ? Math.min(1, Math.max(0, v / 100)) : fb;
    }
    var you = readSide('sim-');
    return {
      step: parseFloat((el('sim-sw-step') || {}).value) || 0.05,
      battles: parseInt((el('sim-sw-battles') || {}).value, 10) || 50,
      minInf: frac('sim-sw-mininf', 0), maxInf: frac('sim-sw-maxinf', 1),
      minCav: frac('sim-sw-mincav', 0), maxCav: frac('sim-sw-maxcav', 1),
      total: total(you.n)
    };
  }

  function sweepKey(you, foe, o) {
    // The mix is what the sweep varies, so only the total enters the key.
    var y = JSON.parse(JSON.stringify(you));
    y.n = [o.total];
    return JSON.stringify([y, foe, o]);
  }

  // Battles per mix the grid can afford: an option that would push the sweep
  // past the cap is switched off, and a selection above it steps down to the
  // largest one that fits, so the console never asks for a sweep it refuses.
  function fitBattles(cells) {
    var select = el('sim-sw-battles');
    if (!select) return;
    var fits = null;
    Array.prototype.forEach.call(select.options, function (opt) {
      var ok = !cells || cells * parseInt(opt.value, 10) <= SWEEP_CAP;
      opt.disabled = !ok;
      if (ok) fits = opt;
    });
    var picked = select.options[select.selectedIndex];
    if (fits && picked && picked.disabled) { select.value = fits.value; save(); }
  }

  function paintSweepSize(BH) {
    var line = el('sim-sweep-size'), btn = el('sim-sweep-btn');
    if (!line || !btn) return;
    var cells = E.grid(sweepOpts()).cells.length;
    fitBattles(cells);
    var o = sweepOpts();
    if (!cells) {
      line.textContent = BH.tr('sim.sweep.none', 'no mix fits those limits');
      btn.disabled = true;
    } else {
      line.textContent = BH.tpl('sim.sweep.size', '{mixes} mixes × {battles} battles', { mixes: numFmt(cells, 0), battles: numFmt(o.battles, 0) });
      btn.disabled = sweepBusy;
    }
  }

  function sweepStatus(BH, key, fb, cls, vars) {
    var s = el('sim-sweep-status');
    if (!s) return;
    if (!key) { s.hidden = true; s.textContent = ''; s.className = 'sim-ocr-status'; return; }
    s.hidden = false;
    s.textContent = BH.fill(BH.tr(key, fb), vars);
    s.className = 'sim-ocr-status' + (cls ? ' ' + cls : '');
  }

  // The worker keeps a long sweep off the page's thread. If it cannot start
  // (an old browser, a blocked file:// worker), the same engine runs here.
  function scriptBase() {
    var tags = document.getElementsByTagName('script');
    for (var i = 0; i < tags.length; i++) {
      var src = tags[i].src || '';
      if (src.indexOf('js/sim.js') !== -1) return src.replace(/js\/sim\.js[^/]*$/, '');
    }
    return '';
  }

  var sweepWorker = null, sweepSeq = 0, sweepBusy = false;

  function runSweep(you, foe, o, onProgress) {
    return new Promise(function (resolve, reject) {
      var id = ++sweepSeq;
      function local() {
        try {
          var g = E.grid(o), cells = [], battles = 0, c = 0;
          function batch() {
            try {
              var until = performance.now() + 25;
              while (c < g.cells.length && performance.now() < until) {
                var cell = g.cells[c], f = cell.map(function (v) { return v / g.k; });
                var ni = Math.round(o.total * cell[0] / g.k), nc = Math.round(o.total * cell[1] / g.k);
                var n = [ni, nc, Math.max(0, o.total - ni - nc)];
                var side = Object.assign({}, you, { n: n });
                var r = E.run(side, foe, o.battles, (o.seed || 1) + c * 7919);
                cells.push({ cell: cell, f: f, n: n, win: r.win, left: total(r.a), foe: total(r.b), rounds: r.rounds });
                battles += r.battles;
                c++;
              }
              onProgress(c, g.cells.length, battles);
              if (c < g.cells.length) setTimeout(batch, 0);
              else resolve({ k: g.k, total: o.total, cells: cells, battles: battles });
            } catch (err) { reject(err); }
          }
          batch();
        } catch (e) { reject(e); }
      }
      try {
        if (!sweepWorker) {
          var v = window.__BH_BUILD ? '?v=' + encodeURIComponent(window.__BH_BUILD) : '';
          sweepWorker = new Worker(scriptBase() + 'js/sim-worker.js' + v);
        }
      } catch (e) {
        sweepWorker = null;
        setTimeout(local, 30);
        return;
      }
      sweepWorker.onmessage = function (e) {
        var m = e.data || {};
        if (m.id !== id) return;
        if (m.type === 'progress') onProgress(m.done, m.of, m.battles);
        else if (m.type === 'done') resolve(m.result);
        else if (m.type === 'error') reject(new Error(m.error));
      };
      sweepWorker.onerror = function (e) {
        if (e && e.preventDefault) e.preventDefault();
        try { sweepWorker.terminate(); } catch (err) { /* already gone */ }
        sweepWorker = null;
        setTimeout(local, 30);
      };
      sweepWorker.postMessage({ id: id, you: you, foe: foe, opts: o });
    });
  }

  // The run meter (js/sim-run.js) draws the bar and the live line from these.
  function sweepEvent(phase, detail) {
    var root = el('console');
    detail.phase = phase;
    if (root) root.dispatchEvent(new CustomEvent('sim:sweep', { bubbles: true, detail: detail }));
  }

  function sweepReady(o, foe) {
    return o.total > 0 && total(foe.n) > 0 && E.grid(o).cells.length > 0;
  }

  // `fresh` is a reader's tap: it reports missing troops and brings the
  // answer into view. A re-run after an edit does neither.
  function startSweep(BH, fresh) {
    if (sweepBusy) { sweepAgain = true; return; }
    var you = readSide('sim-'), foe = readSide('sim-foe-'), o = sweepOpts();
    if (!sweepReady(o, foe)) {
      if (fresh) sweepStatus(BH, 'sim.fight.empty', 'Give both sides some troops — the fight needs two armies.', 'bad');
      return;
    }
    sweepStatus(BH);
    var key = sweepKey(you, foe, o);
    o.seed = E.seedOf([you.tier, you.tg, you.atk, you.let, you.def, you.hea, foe, o.total]);
    sweepBusy = true;
    sweepAgain = false;
    var started = performance.now(), mixes = E.grid(o).cells.length;
    var planned = mixes * o.battles;
    var answer = el('sim-answer');
    if (answer) answer.setAttribute('aria-busy', 'true');
    function report(phase, done, battles) {
      sweepEvent(phase, { done: done, of: mixes, battles: battles, planned: planned, ms: performance.now() - started });
    }
    report('start', 0, 0);
    paintSweepSize(BH);
    paintSweep(BH);
    runSweep(you, foe, o, function (done, of, battles) {
      report('progress', done, battles);
    }).then(function (result) {
      lastSweep = { key: key, result: result, you: you, foe: foe, opts: o };
      sweepBusy = false;
      report('done', result.cells.length, result.battles);
      paintSweep(BH);
      var res = el('sim-sweep-result');
      if (fresh && res && res.scrollIntoView && !inView(res)) res.scrollIntoView({ block: 'nearest' });
    }, function (err) {
      if (window.console && console.error) console.error('[sim-sweep]', (err && err.message) || err);
      report('fail', 0, 0);
      sweepStatus(BH, 'sim.sweep.fail', 'The sweep stopped before it finished. Try a coarser grid.', 'bad');
    }).then(function () {
      sweepBusy = false;
      if (answer) answer.removeAttribute('aria-busy');
      paintSweepSize(BH);
      paintSweep(BH);
      if (sweepAgain) queueSweep(BH);
    });
  }

  // Once a sweep has answered, an edit to either army re-runs it: the result
  // follows the sheet instead of going stale. Bear modes never sweep.
  var queueTimer = null, sweepAgain = false;
  function queueSweep(BH) {
    clearTimeout(queueTimer);
    if (!lastSweep || GROUPS[mode].indexOf('fight') === -1) return;
    var you = readSide('sim-'), foe = readSide('sim-foe-'), o = sweepOpts();
    if (!sweepReady(o, foe) || sweepKey(you, foe, o) === lastSweep.key) return;
    if (sweepBusy) { sweepAgain = true; return; }
    queueTimer = setTimeout(function () { startSweep(BH, false); }, 700);
  }

  function inView(node) {
    var r = node.getBoundingClientRect();
    return r.top >= 0 && r.top < (window.innerHeight || 0);
  }

  // ── The triangle — every mix on one ruled grid ────────
  // Barycentric: infantry top, cavalry bottom-left, archers bottom-right. One
  // square rule cell per mix, the signal's opacity carrying the win chance.
  var TRI = { inf: [160, 22], cav: [26, 254], arc: [294, 254] };
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function triPoint(f) {
    return [
      f[0] * TRI.inf[0] + f[1] * TRI.cav[0] + f[2] * TRI.arc[0],
      f[0] * TRI.inf[1] + f[1] * TRI.cav[1] + f[2] * TRI.arc[1]
    ];
  }

  function svg(tag, attrs, text) {
    var node = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) node.setAttribute(k, attrs[k]);
    if (text != null) node.textContent = text;
    return node;
  }

  function paintTriangle(BH, result, top, room) {
    var root = el('sim-tri-svg');
    if (!root) return;
    while (root.firstChild) root.removeChild(root.firstChild);
    root.appendChild(svg('polygon', {
      class: 'tri-frame',
      points: [TRI.inf, TRI.cav, TRI.arc].map(function (p) { return p.join(','); }).join(' ')
    }));
    var size = Math.max(3, (TRI.arc[0] - TRI.cav[0]) / result.k * 0.62);
    result.cells.forEach(function (c) {
      var p = triPoint(c.f);
      var cell = svg('rect', {
        class: 'tri-cell', x: (p[0] - size / 2).toFixed(1), y: (p[1] - size / 2).toFixed(1),
        width: size.toFixed(1), height: size.toFixed(1), 'fill-opacity': (0.08 + 0.92 * c.win).toFixed(3)
      });
      cell.appendChild(svg('title', {}, mixText(c.f) + ' — ' + pct0(c.win * 100)));
      root.appendChild(cell);
    });
    if (room) {
      var rp = triPoint(room.f);
      root.appendChild(svg('circle', { class: 'tri-room', cx: rp[0].toFixed(1), cy: rp[1].toFixed(1), r: (size * 0.9).toFixed(1) }));
    }
    if (top) {
      var bp = triPoint(top.f);
      root.appendChild(svg('rect', {
        class: 'tri-best', x: (bp[0] - size).toFixed(1), y: (bp[1] - size).toFixed(1),
        width: (size * 2).toFixed(1), height: (size * 2).toFixed(1)
      }));
      root.appendChild(svg('text', { class: 'tri-fleuron', x: (bp[0] + size * 1.3).toFixed(1), y: (bp[1] + 4).toFixed(1) }, '❧'));
    }
    root.appendChild(svg('text', { class: 'tri-label', x: TRI.inf[0], y: TRI.inf[1] - 8, 'text-anchor': 'middle' }, BH.tr('sim.calc.inf', 'Infantry')));
    root.appendChild(svg('text', { class: 'tri-label', x: TRI.cav[0], y: TRI.cav[1] + 22, 'text-anchor': 'start' }, BH.tr('sim.calc.cav', 'Cavalry')));
    root.appendChild(svg('text', { class: 'tri-label', x: TRI.arc[0], y: TRI.arc[1] + 22, 'text-anchor': 'end' }, BH.tr('sim.calc.arc', 'Archery')));
  }

  function paintSweep(BH) {
    var box = el('sim-sweep-result');
    if (!box) return;
    if (!lastSweep) { box.hidden = true; return; }
    // While a re-run is under way, or the sheet has moved on, the last answer
    // stays up, dimmed, until the new one lands.
    var stale = sweepBusy || sweepKey(readSide('sim-'), readSide('sim-foe-'), sweepOpts()) !== lastSweep.key;
    box.toggleAttribute('data-stale', stale);
    var result = lastSweep.result;
    var top = E.best(result.cells);

    var headline = el('sim-sweep-headline');
    if (headline && top) {
      var n = top.n;
      var vars = {
        mix: '<span class="mix">' + mixText(top.f) + '</span>', win: pct0(top.win * 100),
        inf: numFmt(n[0], 0), cav: numFmt(n[1], 0), arc: numFmt(n[2], 0), left: numFmt(Math.round(top.left), 0)
      };
      headline.innerHTML = top.win > 0
        ? BH.tpl('sim.sweep.best', 'Best mix <b>{mix}</b> — it wins <b>{win}</b> of the time: <b>{inf}</b> infantry, <b>{cav}</b> cavalry, <b>{arc}</b> archers, about {left} left standing.', vars)
        : BH.tpl('sim.sweep.noWin', 'No mix wins yet. The closest is <b>{mix}</b> — the system the room checks needs upgrading before the stage falls.', vars);
    }

    // The room the reader picked (or today's only room), fought at its own
    // starting ratio on the same total — the community line, tested.
    var row = activeRoom(), room = null;
    if (row) {
      var f = roomStart(row);
      if (f) {
        var you = lastSweep.you, o = lastSweep.opts;
        var sideA = JSON.parse(JSON.stringify(you));
        var ni = Math.round(o.total * f[0]), nc = Math.round(o.total * f[1]);
        sideA.n = [ni, nc, Math.max(0, o.total - ni - nc)];
        var r = E.run(sideA, lastSweep.foe, o.battles, o.seed + 104729);
        room = { f: f, win: r.win, name: roomName(row) };
      }
    }

    paintTriangle(BH, result, top, room);

    var table = el('sim-sweep-out');
    if (table) {
      var ranked = result.cells.slice().sort(function (a, b) {
        return b.win - a.win || b.left - a.left || a.foe - b.foe;
      }).slice(0, 5);
      var html = head([BH.tr('sim.sweep.thMix', 'mix'), BH.tr('sim.sweep.thWin', 'win chance'), BH.tr('sim.sweep.thLeft', 'left standing')]);
      ranked.forEach(function (c) {
        html += '<div class="sim-row" role="row">' +
          '<span class="mix" role="cell">' + mixText(c.f) + '</span>' +
          '<span class="sim-share" role="cell">' + pct0(c.win * 100) + '</span>' +
          '<span class="sim-n" role="cell">' + numFmt(Math.round(c.left), 0) + '</span></div>';
      });
      table.innerHTML = html;
    }

    var roomLine = el('sim-sweep-room');
    if (roomLine) {
      roomLine.textContent = '';
      if (room) {
        roomLine.innerHTML = BH.fill(BH.tr('sim.sweep.room', 'The <b>{room}</b> starting ratio, <b>{mix}</b>, wins <b>{win}</b> of the time on this stage.'),
          { room: '<span class="room-slot"></span>', mix: '<span class="mix">' + mixText(room.f) + '</span>', win: pct0(room.win * 100) });
        var slot = roomLine.querySelector('.room-slot');
        if (slot) slot.textContent = room.name;
      }
    }
    box.hidden = false;
  }

  function paint(BH) {
    paintNames(BH);
    paintRatio(BH);
    paintMarch(BH);
    paintTotal(BH);
    paintMystic(BH);
    paintFight(BH);
    paintSweepSize(BH);
    paintSweep(BH);
    queueSweep(BH);
    // The army tiles (js/sim-army.js) mirror the sheet after every repaint,
    // including the ones a screenshot read or a restore set without events.
    var root = el('console');
    if (root) root.dispatchEvent(new CustomEvent('sim:paint', { bubbles: true }));
  }

  // ── Modes — the rail, the panels, the URL ─────────────
  // The URL is the state: ?mode=… opens a fight, and every other param
  // (?lang=…) survives a switch. Applied synchronously when this file runs,
  // so a deep link never flashes the default panel.
  var mode = DEFAULT_MODE;

  function readMode() {
    var m = (location.search.match(/[?&]mode=([^&]+)/) || [])[1];
    m = m ? decodeURIComponent(m) : '';
    m = ALIASES[m] || m;
    return MODES.indexOf(m) !== -1 ? m : DEFAULT_MODE;
  }

  function modeUrl(m) {
    var keep = [];
    location.search.replace(/^\?/, '').split('&').forEach(function (kv) {
      if (kv && !/^mode=/.test(kv)) keep.push(kv);
    });
    keep.push('mode=' + m);
    return location.pathname + '?' + keep.join('&') + location.hash;
  }

  function setMode(m, push) {
    mode = m;
    var groups = GROUPS[m] || [];
    Array.prototype.forEach.call(document.querySelectorAll('.sim-for'), function (node) {
      node.hidden = groups.indexOf(node.getAttribute('data-for')) === -1;
    });
    MODES.forEach(function (k) {
      var panel = document.querySelector('.sim-panel[data-mode="' + k + '"]');
      if (panel) panel.hidden = k !== m;
      var link = document.querySelector('.mode-rail a[data-mode="' + k + '"]');
      if (!link) return;
      if (k === m) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
    var root = el('console');
    if (root) root.dispatchEvent(new CustomEvent('sim:mode', { bubbles: true, detail: { mode: m } }));
    if (!push) return;
    try {
      history.pushState({ mode: m }, '', modeUrl(m));
    } catch (e) { /* file:// or a blocked history — the panel still switched */ }
  }

  function wireRail() {
    var links = document.querySelectorAll('.mode-rail a');
    Array.prototype.forEach.call(links, function (a) {
      a.addEventListener('click', function (e) {
        // Leave modified clicks alone — those open a new tab.
        if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        setMode(a.getAttribute('data-mode'), true);
      });
    });
    window.addEventListener('popstate', function () { setMode(readMode(), false); });
  }

  // ── Remembering the sheets ────────────────────────────
  // Every sheet value is kept in this browser, so a reload or tomorrow's
  // stage starts from the last report. A convenience only: storage can be
  // missing or full, and the page works the same without it.
  // The player save (your stats, the troops you own) is a separate concern:
  // js/sim-player.js reads the same key off #console[data-sheet-key] to know
  // whether this sheet has a save of its own before filling from it.
  var STORE_KEY = 'bh:sim:v1';

  function fields() {
    return document.querySelectorAll('#console input[id^="sim-"]:not([type="file"]), #console select[id^="sim-"]');
  }

  function restore() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { saved = null; }
    if (!saved || typeof saved !== 'object') return;
    Array.prototype.forEach.call(fields(), function (f) {
      var v = saved[f.id];
      if (typeof v !== 'string') return;
      if (f.tagName === 'SELECT') {
        for (var i = 0; i < f.options.length; i++) if (f.options[i].value === v) { f.value = v; return; }
      } else {
        f.value = v;
      }
    });
    if (typeof saved.room === 'string') pickedRoom = saved.room || null;
  }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var out = { room: pickedRoom || '' };
      Array.prototype.forEach.call(fields(), function (f) { out[f.id] = f.value; });
      try { localStorage.setItem(STORE_KEY, JSON.stringify(out)); } catch (e) { /* private mode, full storage */ }
    }, 250);
  }

  // ── Wiring ────────────────────────────────────────────
  var paintTimer = null;
  function wireInputs(BH) {
    function later() {
      clearTimeout(paintTimer);
      paintTimer = setTimeout(function () { paint(BH); }, 60);
      save();
    }
    Array.prototype.forEach.call(fields(), function (f) {
      f.addEventListener(f.tagName === 'SELECT' ? 'change' : 'input', later);
    });
    Array.prototype.forEach.call(document.querySelectorAll('#sim-rooms .room-pick'), function (btn) {
      btn.addEventListener('click', function () {
        var row = btn.closest('.sim-row');
        var id = row && row.getAttribute('data-room');
        pickedRoom = pickedRoom === id ? null : id;
        save();
        paintMystic(BH);
        paintSweep(BH);
      });
    });
    var go = el('sim-sweep-btn');
    if (go) go.addEventListener('click', function () { startSweep(BH, true); });
  }

  function boot(BH) {
    restore();
    wireInputs(BH);
    wireOcr(BH);
    paint(BH);
  }

  // ── The engine, on intent ─────────────────────────────
  // Warming costs ~14 MB (models + wasm + OpenCV), so it waits for the
  // reader's own first move towards the feature — a tap or a key focus on the
  // button — and says so on the status line while it runs. The worker keeps
  // the engine, so a warm and a click race to the same download, not two.
  // Skipped on data-saver / 2G — those readers still get OCR, it just pays the
  // download on the click.
  var warmState = 'idle'; // idle | warming | ready
  function warmOcr(BH) {
    if (warmState !== 'idle') return;
    var conn = navigator.connection;
    if (conn && (conn.saveData || /2g/i.test(conn.effectiveType || ''))) return;
    warmState = 'warming';
    if (!ocrBusy) {
      ocrStatus(BH, 'sim.ocr.warm', 'Warming the reader — the first read downloads about 14 MB of models, once per device.', 'busy');
    }
    loadPaddle().then(function () {
      warmState = 'ready';
      if (ocrBusy) return; // a read is driving the status line; it owns it now
      ocrStatus(BH, 'sim.ocr.ready', 'The reader is ready.', 'ok');
      setTimeout(function () {
        if (!ocrBusy && warmState === 'ready') ocrStatus(BH, null);
      }, 6000);
    }, function () {
      // A failed warm gets no line of its own: the click reports its own
      // failure, and the worker cleared its engine cache, so the next attempt
      // is a real retry either way.
      warmState = 'idle';
      if (!ocrBusy) ocrStatus(BH, null);
    });
  }

  // ── OCR prefill — read a battle-report screenshot, fill the sheets ──
  // The whole pipeline runs client-side (static site, no server). The engine
  // itself lives in js/ocr-worker.js: PaddleOCR.js (PP-OCRv6 tiny) plus ONNX
  // Runtime and OpenCV. This side only posts the picked file and parses what
  // comes back — each recognised word carries a box, so the Bonus Details
  // values are mapped by their row label (block + stat) and column: left of
  // the label is your green value, right of it the opponent's. The sheets stay
  // the source of truth — this is a prefill, and every value is editable.
  var worker = null, seq = 0, pending = {};

  // Drop the worker and fail everything in flight. A worker that a phone kills
  // for memory never replies and never fires an error, so this is the only way
  // the page learns it is gone.
  function killWorker(err) {
    var p = pending;
    pending = {};
    Object.keys(p).forEach(function (id) { p[id].reject(err); });
    if (worker) {
      try { worker.terminate(); } catch (e) { /* already gone */ }
      worker = null;
    }
  }

  function ocrWorker() {
    if (worker) return worker;
    worker = new Worker(scriptBase() + 'js/ocr-worker.js' + (window.__BH_BUILD ? '?v=' + encodeURIComponent(window.__BH_BUILD) : ''), { type: 'module' });
    worker.onmessage = function (e) {
      var m = e.data || {}, p = pending[m.id];
      if (!p) return;
      delete pending[m.id];
      if (m.ok) {
        p.resolve(m);
      } else {
        var err = new Error(m.error || 'ocr failed');
        err.preview = m.preview;
        p.reject(err);
      }
    };
    worker.onerror = function (e) { killWorker(new Error((e && e.message) || 'ocr worker error')); };
    worker.onmessageerror = function () { killWorker(new Error('ocr worker message error')); };
    return worker;
  }

  // Long enough that a slow phone on a cold model download is never cut off —
  // this is a hang-breaker, not a deadline.
  var ASK_TIMEOUT_MS = 120000;

  function askWorker(type, blob) {
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      var timer = setTimeout(function () {
        delete pending[id];
        killWorker(new Error('ocr worker timed out'));
        reject(new Error('ocr worker timed out'));
      }, ASK_TIMEOUT_MS);
      pending[id] = {
        resolve: function (v) { clearTimeout(timer); resolve(v); },
        reject: function (e) { clearTimeout(timer); reject(e); }
      };
      try {
        ocrWorker().postMessage({ id: id, type: type, blob: blob });
      } catch (e) {
        clearTimeout(timer);
        delete pending[id];
        killWorker(e);
        reject(e);
      }
    });
  }

  function loadPaddle() {
    return askWorker('warm').then(function () { return true; });
  }

  function ocrStatus(BH, key, fb, cls, vars) {
    var s = el('sim-ocr-status');
    if (!s) return;
    if (!key) { s.hidden = true; s.textContent = ''; return; }
    s.hidden = false;
    s.textContent = BH.fill(BH.tr(key, fb), vars);
    s.className = 'sim-ocr-status' + (cls ? ' ' + cls : '');
  }

  // ── Reading the sheet ─────────────────────────────────
  var BLOCKS = TYPES.map(function (t) { return t.block; });
  var STATS_EN = STATS.map(function (s) { return s.ocr; });

  // OCR misreads a letter here and there ("lnfantry", "Letha1ity"), and often
  // returns a whole row label as one box ("Infantry Attack"). Fold the usual
  // digit/letter lookalikes and keep the spaces: both the row and the wanted
  // words go through the same fold, so exact matches stay exact.
  function fold(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
      .replace(/[1li]/g, 'i').replace(/0/g, 'o').replace(/5/g, 's')
      .replace(/\s+/g, ' ').trim();
  }

  function withinOneEdit(a, b) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    var i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length > b.length) i++;
      else if (a.length < b.length) j++;
      else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  }

  // Which of `list`'s words this (already folded) row carries: as a run of text
  // anywhere in the row, or as a single misspelt token.
  function wordIn(folded, list) {
    var i, j;
    for (i = 0; i < list.length; i++) if (folded.indexOf(fold(list[i])) !== -1) return list[i];
    var tokens = folded.split(' ');
    for (i = 0; i < tokens.length; i++) {
      if (tokens[i].length < 5) continue;
      for (j = 0; j < list.length; j++) {
        if (withinOneEdit(tokens[i], fold(list[j]))) return list[j];
      }
    }
    return null;
  }

  // The panel row's own height sets the row tolerance: a fixed pixel figure is
  // wrong the moment the screenshot isn't the size it was tuned on.
  function rowTolerance(boxes) {
    if (!boxes.length) return 8;
    var hs = boxes.map(function (b) { return b.h; }).sort(function (a, b) { return a - b; });
    return Math.max(8, hs[Math.floor(hs.length / 2)] * 0.55);
  }

  var PCT = /[+\-]?\d+(?:[.,]\d+)?\s*%/g;
  function pctValue(s) { return parseFloat(String(s).replace(',', '.')); }

  // A troop count: a whole number, grouped in thousands or not ("12,345",
  // "12.345", "12 345" with a narrow space, "1234"). Never a percentage, a
  // decimal, or the 10 of "T10" or "Lv.10" — group 1 eats the character before.
  var COUNT = /(^|[^0-9A-Za-z.,])(\d{1,3}(?:[,.\u00a0\u202f]\d{3})+|\d+)(?![\d%.,]|\s*%)/g;
  function countHits(text) {
    var hits = [], hit;
    COUNT.lastIndex = 0;
    while ((hit = COUNT.exec(text)) !== null) {
      hits.push({ index: hit.index + hit[1].length, value: parseInt(hit[2].replace(/[^0-9]/g, ''), 10) });
    }
    return hits;
  }

  // The value the green (your) column holds sits left of the label and the
  // red one right of it: the last hit before the label is yours, the first
  // after it is theirs. With no label position, the first and last hits.
  function sides(hits, at) {
    var left = null, right = null;
    if (at === -1) {
      left = hits[0] || null;
      right = hits.length > 1 ? hits[hits.length - 1] : null;
    } else {
      hits.forEach(function (h) {
        if (h.index < at) left = h;
        else if (!right) right = h;
      });
      if (!left && !right) left = hits[0] || null;
    }
    return { left: left, right: right };
  }

  // The report's troop rows carry a block name and no stat ("12,345
  // Infantry 23,456"); its totals row says "Troops".
  var TROOPS = 'Troops';

  // Group recognised words into visual rows, then read both columns of every
  // troop-type stat row. Returns { 'L|Block|Stat': value, 'R|Block|Stat': value }.
  function parseItems(items) {
    var boxes = [];
    items.forEach(function (it) {
      if (!it || !it.text || !it.poly) return;
      var text = String(it.text).trim();
      if (!text) return;
      var xs = it.poly.map(function (p) { return p[0]; });
      var ys = it.poly.map(function (p) { return p[1]; });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
      var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      boxes.push({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, x: x0, y: y0, w: x1 - x0, h: y1 - y0, text: text });
    });

    var tol = rowTolerance(boxes);
    boxes.sort(function (a, b) { return a.cy - b.cy; });
    var rows = [];
    boxes.forEach(function (b) {
      var row = rows.length ? rows[rows.length - 1] : null;
      if (row && Math.abs(b.cy - row.cy) <= tol) {
        row.items.push(b);
        row.cy = (row.cy * (row.items.length - 1) + b.cy) / row.items.length;
      } else {
        rows.push({ cy: b.cy, items: [b] });
      }
    });

    var out = {}, snippets = {};
    function snip(label, r) {
      var y0 = Math.min.apply(null, r.items.map(function (b) { return b.y; }));
      var y1 = Math.max.apply(null, r.items.map(function (b) { return b.y + b.h; }));
      snippets[label] = { y: y0, h: y1 - y0 };
    }
    function put(label, pair, value) {
      if (pair.left && isFinite(value(pair.left))) out['L|' + label] = value(pair.left);
      if (pair.right && isFinite(value(pair.right))) out['R|' + label] = value(pair.right);
    }
    rows.forEach(function (r) {
      r.items.sort(function (a, b) { return a.cx - b.cx; });
      var joined = r.items.map(function (b) { return b.text; }).join(' ');
      var folded = fold(joined);
      var block = wordIn(folded, BLOCKS);
      var stat = wordIn(folded, STATS_EN);
      var label;
      // A troop row: counts either side of the block name, or of "Troops"
      // on the totals row. Power, kills and losses rows are not troops.
      if (!stat) {
        if (/power|kill|loss|lost|injur|wound|surviv/.test(joined.toLowerCase())) return;
        label = block ? block + '|' + TROOPS : (wordIn(folded, [TROOPS]) ? TROOPS : null);
        if (!label || snippets[label]) return;
        var counts = countHits(joined);
        if (!counts.length) return;
        snip(label, r);
        put(label, sides(counts, joined.search(new RegExp(block || 'troop', 'i'))), function (h) { return h.value; });
        return;
      }
      if (!block) return;
      label = block + '|' + stat;
      if (snippets[label]) return; // first (topmost) row wins
      // Joining the row first survives the OCR splitting "+457.5" and "%"
      // apart; searching from the label survives it fusing two numbers into
      // one box.
      snip(label, r);
      var at = joined.search(new RegExp(block, 'i'));
      var hits = [], hit;
      PCT.lastIndex = 0;
      while ((hit = PCT.exec(joined)) !== null) hits.push(hit);
      if (!hits.length) return;
      put(label, sides(hits, at), function (h) { return pctValue(h[0]); });
    });
    spreadTotals(out);
    return { values: out, snippets: snippets };
  }

  // A report that gives only each side's total keeps the mix on the sheet:
  // the total is shared out in the proportions already typed. With nothing
  // typed there is no mix to keep, and the counts stay unread.
  function spreadTotals(out) {
    ['L', 'R'].forEach(function (side) {
      var whole = out[side + '|' + TROOPS];
      delete out[side + '|' + TROOPS];
      if (!(whole > 0)) return;
      var labels = TYPES.map(function (t) { return side + '|' + t.block + '|' + TROOPS; });
      if (labels.some(function (l) { return out[l] !== undefined; })) return;
      var prefix = side === 'L' ? 'sim-n-' : 'sim-foe-n-';
      var now = TYPES.map(function (t) { return Math.max(0, num(prefix + t.key)); });
      var sum = total(now);
      if (!sum) return;
      var given = 0;
      labels.forEach(function (l, i) {
        var n = i < labels.length - 1 ? Math.round(whole * now[i] / sum) : whole - given;
        out[l] = n;
        given += n;
      });
    });
  }

  // One entry per sheet cell, both columns, keyed by the report's own label:
  // the troop count first, then the four stats.
  var COUNT_ROW = { key: 'n', ocr: TROOPS, nameKey: 'sim.review.count', fallback: 'Troops' };
  var FIELDS = [];
  TYPES.forEach(function (t) {
    FIELDS.push({ label: 'L|' + t.block + '|' + TROOPS, id: 'sim-n-' + t.key, count: true });
    FIELDS.push({ label: 'R|' + t.block + '|' + TROOPS, id: 'sim-foe-n-' + t.key, count: true });
    STATS.forEach(function (s) {
      FIELDS.push({ label: 'L|' + t.block + '|' + s.ocr, id: 'sim-' + s.key + '-' + t.key });
      FIELDS.push({ label: 'R|' + t.block + '|' + s.ocr, id: 'sim-foe-' + s.key + '-' + t.key });
    });
  });

  // Set every value we read and let the caller repaint once.
  function fill(vals) {
    var filled = 0;
    FIELDS.forEach(function (f) {
      var e = el(f.id);
      var v = vals[f.label];
      if (e && v !== undefined && isFinite(v)) {
        e.value = String(f.count ? Math.round(v) : Math.round(v * 10) / 10);
        filled++;
      }
    });
    return filled;
  }

  var ocrBusy = false;
  function wireOcr(BH) {
    var btn = el('sim-ocr-btn');
    var file = el('sim-ocr-file');
    if (!btn || !file) return;

    var shotEl = el('sim-ocr-shot');
    var review = el('sim-review-dialog'), reviewFields = el('sim-review-fields');
    var shotCanvas = document.createElement('canvas');
    var shotUrl = null, snippets = {}, reviewTroop = 'inf';

    function relevantFields() {
      // The bear ratio needs the lead's attack and lethality; the bear march
      // adds your own counts; a fight reads every cell on both sides.
      return FIELDS.filter(function (f) {
        if (mode.indexOf('bear') !== 0) return true;
        if (f.label[0] !== 'L') return false;
        return /\|(Attack|Lethality)$/.test(f.label) || (f.count && mode === 'bear-damage');
      });
    }

    function countMissing() {
      var fields = relevantFields();
      var missing = fields.filter(function (f) { return el(f.id).dataset.ocr === 'missing'; }).length;
      el('sim-ocr-review-count').textContent = BH.tpl('sim.review.missing', '{n} values to check', { n: numFmt(missing, 0) });
      return missing;
    }

    function renderReview() {
      if (!reviewFields) return;
      reviewFields.innerHTML = '';
      reviewFields.setAttribute('aria-labelledby', 'sim-review-tab-' + reviewTroop);
      var type = TYPES.filter(function (t) { return t.key === reviewTroop; })[0];
      [COUNT_ROW].concat(STATS).forEach(function (stat) {
        var fields = relevantFields().filter(function (f) {
          return f.label.slice(2) === type.block + '|' + stat.ocr;
        });
        if (!fields.length) return;
        var row = document.createElement('div');
        row.className = 'sim-review-row';
        var title = document.createElement('h3');
        title.textContent = BH.tr(stat.nameKey, stat.fallback);
        row.appendChild(title);
        var crop = snippets[type.block + '|' + stat.ocr] || (stat === COUNT_ROW ? snippets[TROOPS] : null);
        if (crop && shotCanvas.width) {
          var y = Math.max(0, Math.floor(crop.y - crop.h * 0.5));
          var height = Math.min(shotCanvas.height - y, Math.ceil(crop.h * 2));
          var canvas = document.createElement('canvas');
          canvas.width = shotCanvas.width;
          canvas.height = height;
          canvas.className = 'sim-review-snippet';
          canvas.setAttribute('aria-hidden', 'true');
          canvas.getContext('2d').drawImage(shotCanvas, 0, y, canvas.width, height, 0, 0, canvas.width, height);
          var viewport = document.createElement('div');
          viewport.className = 'sim-review-crop';
          viewport.appendChild(canvas);
          row.appendChild(viewport);
        } else {
          var hint = document.createElement('small');
          hint.textContent = BH.tr('sim.review.noRow', 'Row not found — check the full screenshot below.');
          row.appendChild(hint);
        }
        var inputs = document.createElement('div');
        inputs.className = 'sim-review-values';
        fields.forEach(function (f) {
          var source = el(f.id), label = document.createElement('label'), name = document.createElement('span');
          label.className = 'sim-field';
          name.textContent = f.label[0] === 'L'
            ? BH.tr(mode.indexOf('bear') === 0 ? 'sim.army.lead' : 'sim.army.you', mode.indexOf('bear') === 0 ? 'The rally lead' : 'You')
            : BH.tr('sim.foe.title', 'The opponent');
          var input = source.cloneNode(false);
          input.removeAttribute('id');
          input.removeAttribute('data-player-stat');
          input.removeAttribute('data-troop');
          input.dataset.source = source.id;
          input.value = source.value;
          var flag = document.createElement('small');
          flag.textContent = source.dataset.ocr === 'missing' ? BH.tr('sim.review.notRead', 'Not read · previous value') : '';
          label.append(name, input, flag);
          inputs.appendChild(label);
        });
        row.appendChild(inputs);
        reviewFields.appendChild(row);
      });
    }

    function openReview() {
      renderReview();
      if (!review.open) review.showModal();
      var missing = reviewFields.querySelector('[data-ocr="missing"]');
      if (missing) missing.focus({ preventScroll: true });
    }

    el('sim-ocr-review-btn').addEventListener('click', openReview);
    review.addEventListener('tabs:select', function (event) {
      if (event.detail.binding !== 'review') return;
      reviewTroop = event.detail.value;
      renderReview();
    });
    reviewFields.addEventListener('input', function (event) {
      var input = event.target, source = el(input.dataset.source);
      if (!source || !input.validity.valid || input.value === '') return;
      source.value = input.value;
      source.dataset.ocr = input.dataset.ocr = 'corrected';
      input.nextElementSibling.textContent = '';
      source.dispatchEvent(new Event('input', { bubbles: true }));
      countMissing();
    });
    reviewFields.addEventListener('change', function (event) {
      var input = event.target, source = el(input.dataset.source);
      if (!source || (input.validity.valid && input.value !== '')) return;
      input.value = source.value;
    });
    FIELDS.forEach(function (f) {
      el(f.id).addEventListener('input', function () {
        if (!shotUrl) return;
        this.dataset.ocr = 'corrected';
        countMissing();
      });
    });
    el('console').addEventListener('sim:mode', function () { if (shotUrl) countMissing(); });

    function showShot(f, preview, parsed) {
      if (shotUrl) URL.revokeObjectURL(shotUrl);
      shotUrl = URL.createObjectURL(f);
      el('sim-review-image').src = shotUrl;
      shotCanvas.width = shotCanvas.height = 0;
      if (preview) {
        shotCanvas.width = preview.width;
        shotCanvas.height = preview.height;
        shotCanvas.getContext('2d').drawImage(preview, 0, 0);
        preview.close();
      }
      snippets = parsed ? parsed.snippets : {};
      var values = parsed ? parsed.values : {};
      FIELDS.forEach(function (field) {
        el(field.id).dataset.ocr = values[field.label] !== undefined ? 'read' : 'missing';
      });
      shotEl.hidden = false;
      countMissing();
      var first = relevantFields().filter(function (f) { return el(f.id).dataset.ocr === 'missing'; })[0];
      reviewTroop = first ? first.id.split('-').pop() : 'inf';
      var tab = review.querySelector('[data-value="' + reviewTroop + '"]');
      if (tab) tab.click();
      openReview();
    }

    function readOnce(f) {
      return askWorker('predict', f).then(function (res) {
        var parsed = parseItems(res.items);
        return { filled: fill(parsed.values), preview: res.preview, parsed: parsed };
      });
    }

    // A phone's GPU can run the engine without throwing and still hand back
    // nothing usable. If a read yields no values at all, drop the GPU for the
    // session and read the shot once more on wasm before reporting failure.
    function readShot(f) {
      return readOnce(f).then(function (first) {
        if (first.filled > 0) return first;
        return askWorker('useWasm')
          .then(function () { return readOnce(f); })
          .then(function (second) {
            if (second.filled > 0) { if (first.preview) first.preview.close(); return second; }
            if (second.preview) second.preview.close();
            return first;
          },
            function () { return first; });
      });
    }

    function read(f) {
      if (!f || ocrBusy) return;
      ocrBusy = true;
      btn.disabled = true;
      ocrStatus(BH, 'sim.ocr.loading', 'Reading the screenshot…', 'busy');
      readShot(f)
        .then(function (out) {
          if (out.filled) { paint(BH); save(); }
          showShot(f, out.preview, out.parsed);
          if (out.filled > 0) {
            var relevant = relevantFields();
            var readCount = relevant.filter(function (field) { return el(field.id).dataset.ocr === 'read'; }).length;
            ocrStatus(BH, 'sim.review.summary', '{n} of {total} values read — review the highlighted fields.', 'ok', { n: numFmt(readCount, 0), total: numFmt(relevant.length, 0) });
          } else {
            ocrStatus(BH, 'sim.ocr.fail', 'Couldn’t read that screenshot. Try a clearer shot, or tap a troop to type the numbers.', 'bad');
          }
        })
        .catch(function (err) {
          if (window.console && console.error) console.error('[sim-ocr]', (err && err.message) || err);
          showShot(f, err && err.preview);
          ocrStatus(BH, 'sim.ocr.fail', 'Couldn’t read that screenshot. Try a clearer shot, or tap a troop to type the numbers.', 'bad');
        })
        .then(function () { ocrBusy = false; btn.disabled = false; });
    }

    // The reader's first move towards the feature starts the engine (see
    // warmOcr). Never on page-idle.
    ['pointerdown', 'mouseenter', 'focus'].forEach(function (ev) {
      btn.addEventListener(ev, function () { warmOcr(BH); });
    });

    btn.addEventListener('click', function () { file.click(); });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      // Clear the picker so choosing the same screenshot twice still fires.
      file.value = '';
      read(f);
    });

    // A screenshot pasted anywhere on the page reads the same way — the
    // quickest path from the game's share sheet on a desktop.
    document.addEventListener('paste', function (e) {
      var target = e.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && /^image\//.test(items[i].type)) {
          var f = items[i].getAsFile();
          if (f) { e.preventDefault(); warmOcr(BH); read(f); }
          return;
        }
      }
    });
  }

  // ── Boot ──────────────────────────────────────────────
  // The rail is live before the dictionary lands: a deep link applies to the
  // DOM at parse time, so the right panel is the one that first paints.
  wireRail();
  setMode(readMode(), false);

  BH.registerPage({
    boot: boot,
    onChange: function () { paint(BH); }
  });
})();
