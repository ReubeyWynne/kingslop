/* sim.js — the Battle Simulator page (battle-simulator/).
   Registers with common.js via window.BH.registerPage.

   One report read once, four fights answered from it: the lead's bear ratio
   (MATHS.md §4–5), your own march's split measured against that ratio, the
   Mystic Trial room roster, and the PvE bench. Strings come from the active
   dictionary (sim.* keys, English fallback) and the page re-paints on
   i18n:change, so a language switch mid-session shows the new language and
   locale-formatted numbers.

   Two deliberate omissions. Heroes: only the lead's attack factors and the
   troops' base attacks enter a split — an ALL-TROOP hero skill multiplies the
   whole march and cancels out of every ratio, so it belongs with the damage
   constant rather than here. A TYPE-SPECIFIC skill is the exception: it lifts
   one troop type only, so it does not cancel and it moves the mix. That, plus
   the star/skill/gear model now mined in KINGSHOT-SOURCES.md §6, is why heroes
   get their own module (SIM-PROPOSAL.md §10) instead of a factor here. And the
   constant itself: absolute damage carries the bear's defence, the troops' base
   attack and the lead's hero skills, and it is not fitted yet — so the march
   panel prints a ratio and never a damage figure or a reward bracket. */
(function () {
  'use strict';

  // ── The three troop types, in troop-table order ───────
  // block = the row label on a battle report (what the OCR reads), key = the
  // internal id behind every input, nameKey/fallback = the translated label.
  var TYPES = [
    { key: 'inf', block: 'Infantry', nameKey: 'sim.calc.inf', fallback: 'Infantry' },
    { key: 'cav', block: 'Cavalry', nameKey: 'sim.calc.cav', fallback: 'Cavalry' },
    { key: 'arc', block: 'Archer', nameKey: 'sim.calc.arc', fallback: 'Archery' }
  ];

  // The report sheet's four stat columns, in Bonus-Details order. ocr = the
  // row label on the report (what the OCR matches), key = the internal id
  // behind every input.
  var STATS = [
    { key: 'atk', ocr: 'Attack', nameKey: 'sim.calc.atk', fallback: 'Attack %' },
    { key: 'let', ocr: 'Lethality', nameKey: 'sim.calc.let', fallback: 'Lethality %' },
    { key: 'def', ocr: 'Defense', nameKey: 'sim.load.def', fallback: 'Defense %' },
    { key: 'hea', ocr: 'Health', nameKey: 'sim.load.hea', fallback: 'Health %' }
  ];

  var MODES = ['bear-ratio', 'bear-damage', 'mystic', 'pve'];
  var DEFAULT_MODE = 'bear-ratio';

  // ── The troop table (KINGSHOT-SOURCES.md §1) ──────────
  // Base attack per type × tier 1–11 × TG 0–5, in source order: infantry
  // (tier-major, TG-minor), then cavalry, then archers. The attack ratios are
  // 1 : 3 : 4 in every row, so one tier across a march is a common factor that
  // cancels out of every share — tier only bites when a march mixes tiers.
  var TROOP_ATK = [
    63, 66, 69, 72, 76, 80, 94, 98, 103, 108, 113, 119,
    132, 137, 144, 151, 159, 167, 172, 179, 188, 197, 207, 217,
    206, 214, 225, 236, 248, 260, 243, 253, 265, 279, 293, 307,
    287, 298, 313, 329, 346, 363, 339, 353, 370, 389, 408, 429,
    400, 416, 437, 459, 482, 506, 472, 491, 515, 541, 568, 597,
    566, 589, 618, 649, 681, 716, 189, 197, 206, 217, 228, 239,
    283, 294, 309, 324, 341, 358, 397, 413, 434, 455, 478, 502,
    516, 537, 563, 592, 621, 652, 619, 644, 676, 710, 745, 782,
    730, 759, 797, 837, 879, 923, 862, 896, 941, 988, 1038, 1090,
    1017, 1058, 1111, 1166, 1224, 1286, 1200, 1248, 1310, 1376, 1445, 1517,
    1416, 1473, 1546, 1624, 1705, 1790, 1699, 1767, 1855, 1948, 2045, 2148,
    252, 262, 275, 289, 303, 319, 378, 393, 413, 433, 455, 478,
    529, 550, 578, 607, 637, 669, 688, 716, 751, 789, 828, 870,
    825, 858, 901, 946, 993, 1043, 974, 1013, 1064, 1117, 1173, 1231,
    1149, 1195, 1255, 1317, 1383, 1452, 1356, 1410, 1481, 1555, 1633, 1714,
    1600, 1664, 1747, 1835, 1926, 2023, 1888, 1964, 2062, 2165, 2273, 2387,
    2266, 2357, 2474, 2598, 2728, 2865,
  ];
  var ROWS = 66; // 11 tiers × 6 TG groups, per type

  function baseAtk(t, tier, tg) {
    return TROOP_ATK[t * ROWS + (tier - 1) * 6 + tg] || 0;
  }

  // The published weights (MATHS.md §2) at the table's reference row, T6/TG0 —
  // which is exactly where ⅓ / 1 / 4.4⁄3 comes from. Tier then enters as ONE
  // shared scale for the whole march, taken from the table's infantry series —
  // the base every other type is derived from (attack 1 : 3 : 4, MATHS.md §6.2).
  // So a uniform tier multiplies all three weights by the same factor and
  // cancels exactly, and the march panel can never disagree with the ratio
  // panel about the same lead; only a mixed-tier march moves the optimum.
  var WEIGHTS = [1 / 3, 1, 4.4 / 3];
  var REF_TIER = 6, REF_TG = 0;

  function tierScale(tier, tg) {
    return baseAtk(0, tier, tg) / baseAtk(0, REF_TIER, REF_TG);
  }

  // The archers' second ×1.1 vs the all-infantry bear, from T7+ / TG3+
  // (MATHS.md §2); the flat ×1.1 is already inside WEIGHTS[2].
  function typeWeight(i, tier, tg) {
    return WEIGHTS[i] * tierScale(tier, tg) * (i === 2 && (tier >= 7 || tg >= 3) ? 1.1 : 1);
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

  // The lead's A factor per type, straight off the report sheet. A negative
  // percentage is not a stat — a report never carries one, and letting it
  // through produced "A factor −23.64×" with a negative weight and a nonsense
  // share. Floored at zero.
  function leadA() {
    var A = {};
    TYPES.forEach(function (t) {
      A[t.key] = (1 + Math.max(0, num('sim-atk-' + t.key)) / 100) * (1 + Math.max(0, num('sim-let-' + t.key)) / 100);
    });
    return A;
  }

  // Has the reader entered any Bonus Details value at all? An empty sheet is
  // not a lead with zeroes — it is no answer yet, and the headline already
  // carries the sentence for that ("Fill in the lead's attack and lethality
  // above"). Without this the ratio table printed a confident 8/25/67% split
  // from an empty form, because A = 1 for every type.
  function anyStatEntered() {
    var found = false;
    STATS.forEach(function (s) {
      TYPES.forEach(function (t) {
        var e = el('sim-' + s.key + '-' + t.key);
        var v = e ? parseFloat(e.value) : NaN;
        if (isFinite(v) && v > 0) found = true;
      });
    });
    return found;
  }

  // ── The ratio (MATHS.md §4–5) ─────────────────────────
  // A_t = (1 + attack/100)(1 + lethality/100)
  // w = (A_inf/3, A_cav, 4.4·A_arc/3)      f_t ∝ w_t²      K = √(Σ w_t²)
  function ratioCompute() {
    var A = leadA(), w = {}, share = {}, sum = 0;
    w.inf = A.inf / 3;
    w.cav = A.cav;
    w.arc = (4.4 * A.arc) / 3;
    sum = w.inf * w.inf + w.cav * w.cav + w.arc * w.arc;
    if (sum > 0) {
      share.inf = (w.inf * w.inf) / sum;
      share.cav = (w.cav * w.cav) / sum;
      share.arc = (w.arc * w.arc) / sum;
    } else {
      share.inf = share.cav = share.arc = 0;
    }
    return { A: A, w: w, share: share, k: Math.sqrt(sum), ok: sum > 0 && anyStatEntered() };
  }

  // ── The march (MATHS.md §1–3) ─────────────────────────
  // Damage per type is √N_t · base_t · A_t, summed over the three types, so
  // the best a march of N troops can do for a given lead is √N · K_b with
  // K_b = √(Σ (base_t·A_t)²) — and the ratio between the two is the cosine
  // between (base_t·A_t) and the square roots of your shares. It reads 100%
  // exactly when your split is the lead's optimum, at any march size, which
  // is what lets the panel answer without the absolute constant.
  function marchCompute(A) {
    var n = [], q = [], total = 0, dot = 0, kk = 0;
    TYPES.forEach(function (t, i) {
      var count = Math.max(0, num('sim-n-' + t.key));
      var tier = pick('sim-tier-' + t.key, 6);
      var tg = pick('sim-tg-' + t.key, 0);
      n[i] = count;
      total += count;
      q[i] = typeWeight(i, tier, tg) * A[t.key];
      dot += q[i] * Math.sqrt(count);
      kk += q[i] * q[i];
    });
    var K = Math.sqrt(kk);
    var share = [];
    TYPES.forEach(function (t, i) {
      share[i] = kk > 0 ? (q[i] * q[i]) / kk : 0;
    });
    return { n: n, share: share, total: total, eff: (total > 0 && K > 0) ? dot / (Math.sqrt(total) * K) : 0, ok: total > 0 && K > 0 && anyStatEntered() };
  }

  // ── Painting ──────────────────────────────────────────
  // The visible labels live in the markup; this only keeps the composed
  // accessible names (type + stat) in the active language.
  function paintNames(BH) {
    TYPES.forEach(function (t) {
      STATS.forEach(function (s) {
        var e = el('sim-' + s.key + '-' + t.key);
        if (e) e.setAttribute('aria-label', BH.tr(t.nameKey, t.fallback) + ' — ' + BH.tr(s.nameKey, s.fallback));
      });
      var count = el('sim-n-' + t.key), tier = el('sim-tier-' + t.key), tg = el('sim-tg-' + t.key);
      if (count) count.setAttribute('aria-label', BH.tr(t.nameKey, t.fallback) + ' — ' + BH.tr('sim.dmg.thCount', 'troops'));
      if (tier) tier.setAttribute('aria-label', BH.tr(t.nameKey, t.fallback) + ' — ' + BH.tr('sim.dmg.thTier', 'tier'));
      if (tg) tg.setAttribute('aria-label', BH.tr(t.nameKey, t.fallback) + ' — ' + BH.tr('sim.dmg.thTg', 'TG'));
    });
  }

  function paintRatio(BH) {
    var s = ratioCompute();

    var headline = el('sim-headline');
    if (headline) {
      if (!s.ok) {
        headline.innerHTML = BH.tr('sim.calc.noStats',
          'Fill in the lead\u2019s <b>attack</b> and <b>lethality</b> above — the ratio comes from their stats.');
      } else {
        headline.innerHTML = BH.tpl('sim.calc.headline',
          'With this lead, the ideal march is <b>{inf}</b> infantry, <b>{cav}</b> cavalry, <b>{arc}</b> archers.',
          { inf: pct(s.share.inf * 100), cav: pct(s.share.cav * 100), arc: pct(s.share.arc * 100) });
      }
    }

    var out = el('sim-out');
    if (out) {
      var html = '';
      if (s.ok) {
        html = '<div class="sim-head" role="row">' +
          '<span role="columnheader">' + BH.tr('sim.calc.thType', 'Troop') + '</span>' +
          '<span role="columnheader">' + BH.tr('sim.calc.thA', 'A factor') + '</span>' +
          '<span role="columnheader">' + BH.tr('sim.calc.thWeight', 'weight') + '</span>' +
          '<span role="columnheader">' + BH.tr('sim.calc.thShare', 'ideal share') + '</span></div>';
        TYPES.forEach(function (t) {
          html += '<div class="sim-row" role="row">' +
            '<span class="sim-type" role="cell">' + BH.tr(t.nameKey, t.fallback) + '</span>' +
            '<span class="sim-a" role="cell">' + numFmt(s.A[t.key], 2) + '\u00D7</span>' +
            '<span class="sim-w" role="cell">' + numFmt(s.w[t.key], 2) + '</span>' +
            '<span class="sim-share" role="cell">' + pct(s.share[t.key] * 100) + '</span></div>';
        });
      }
      out.innerHTML = html;
      out.hidden = html === '';
    }

    var kEl = el('sim-k');
    if (kEl) {
      kEl.innerHTML = s.ok
        ? BH.tpl('sim.calc.k', 'Leader strength K = <b>{k}</b>', { k: numFmt(s.k, 2) })
        : '';
    }
  }

  function paintMarch(BH) {
    var m = marchCompute(leadA());

    var headline = el('sim-dmg-headline');
    if (headline) {
      headline.innerHTML = m.ok
        ? BH.tpl('sim.dmg.headline',
          'Your split converts <b>{eff}</b> of what these troops could do for this lead.',
          { eff: pct(m.eff * 100) })
        : BH.tr('sim.dmg.noStats',
          'Fill in the lead\u2019s stats above and your troop counts — the split needs both.');
    }

    var out = el('sim-dmg-out');
    if (out) {
      var html = '';
      if (m.ok) {
        html = '<div class="sim-head" role="row">' +
          '<span role="columnheader">' + BH.tr('sim.calc.thType', 'Troop') + '</span>' +
          '<span role="columnheader">' + BH.tr('sim.dmg.thCount', 'troops') + '</span>' +
          '<span role="columnheader">' + BH.tr('sim.dmg.thYours', 'your share') + '</span>' +
          '<span role="columnheader">' + BH.tr('sim.dmg.thIdeal', 'ideal share') + '</span></div>';
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
          'Split the lead\u2019s way, that same march is <b>\u2248{inf}</b> infantry, <b>\u2248{cav}</b> cavalry, <b>\u2248{arc}</b> archers.',
          {
            inf: numFmt(Math.round(m.total * m.share[0]), 0),
            cav: numFmt(Math.round(m.total * m.share[1]), 0),
            arc: numFmt(Math.round(m.total * m.share[2]), 0)
          })
        : '';
    }
  }

  // ── The rooms (Mystic Trial) ──────────────────────────
  // Rooms open on a weekday roster; the reset is 00:00 UTC, so "today" is
  // UTC, not the reader's midnight. The roster itself is markup + i18n; this
  // only marks today's rows and names them in the line above.
  function paintMystic(BH) {
    var day = new Date().getUTCDay();
    var rows = document.querySelectorAll('#sim-rooms .sim-row');
    var open = [];
    Array.prototype.forEach.call(rows, function (row) {
      var days = (row.getAttribute('data-days') || '').split(/\s+/);
      var on = days.indexOf(String(day)) !== -1;
      row.classList.toggle('today', on);
      var holder = row.querySelector('.room-name');
      var old = holder && holder.querySelector('.room-today');
      if (old) holder.removeChild(old);
      if (!on || !holder) return;
      var label = holder.querySelector('span');
      if (label && label.textContent) open.push(label.textContent);
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
    line.innerHTML = BH.fill(BH.tr('sim.mystic.todayLine', 'Open today: <b>{rooms}</b>.'),
      { rooms: '<span class="room-slot"></span>' });
    var slot = line.querySelector('.room-slot');
    if (slot) slot.textContent = open.join(' \u00B7 ');
  }

  function paint(BH) {
    paintNames(BH);
    paintRatio(BH);
    paintMarch(BH);
    paintMystic(BH);
  }

  // ── Modes — the rail, the panels, the URL ─────────────
  // The URL is the state: ?mode=… opens a fight, and every other param
  // (?lang=…) survives a switch. Applied synchronously when this file runs,
  // so a deep link never flashes the default panel.
  function readMode() {
    var m = (location.search.match(/[?&]mode=([^&]+)/) || [])[1];
    m = m ? decodeURIComponent(m) : '';
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
    var report = document.getElementById('sim-load');
    if (report) report.hidden = m === 'mystic' || m === 'pve';
    MODES.forEach(function (k) {
      var panel = document.querySelector('.sim-panel[data-mode="' + k + '"]');
      if (panel) panel.hidden = k !== m;
      var link = document.querySelector('.mode-rail a[data-mode="' + k + '"]');
      if (!link) return;
      if (k === m) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
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

  // ── The march controls (tier + TG, built from the table) ──
  function buildMarch(BH) {
    TYPES.forEach(function (t) {
      var tier = el('sim-tier-' + t.key), tg = el('sim-tg-' + t.key);
      var i;
      if (tier && !tier.options.length) {
        for (i = 1; i <= 11; i++) tier.appendChild(new Option('T' + i, String(i)));
        tier.value = '6';
      }
      if (tg && !tg.options.length) {
        for (i = 0; i <= 5; i++) tg.appendChild(new Option('TG' + i, String(i)));
        tg.value = '0';
      }
      [tier, tg].forEach(function (s) {
        if (s) s.addEventListener('change', function () { paint(BH); });
      });
    });
  }

  function wireInputs(BH) {
    TYPES.forEach(function (t) {
      STATS.forEach(function (s) {
        var e = el('sim-' + s.key + '-' + t.key);
        if (e) e.addEventListener('input', function () { paint(BH); });
      });
      var n = el('sim-n-' + t.key);
      if (n) n.addEventListener('input', function () { paint(BH); });
    });
  }

  function boot(BH) {
    buildMarch(BH);
    wireInputs(BH);
    wireOcr(BH);
    paint(BH);
  }

  // ── The engine, on intent ─────────────────────────────
  // Warming costs ~14 MB (models + wasm + OpenCV) and used to start on
  // page-idle, so every reader of this page paid it — the ones who came for the
  // ratio included, and on a phone on cellular data that is the heaviest thing
  // the site does. It now waits for the reader's own first move towards the
  // feature — a tap or a key focus on the button — and says so on the status
  // line while it runs, so the wait is visible rather than the button seeming
  // to hang. The worker keeps the engine, so a warm and a click race to the
  // same download, not two. All of it runs in the worker: warming costs the
  // page thread nothing. Skipped on data-saver / 2G — those readers still get
  // OCR, it just pays the download on the click.
  var warmState = 'idle'; // idle | warming | ready
  function warmOcr(BH) {
    if (warmState !== 'idle') return;
    var conn = navigator.connection;
    if (conn && (conn.saveData || /2g/i.test(conn.effectiveType || ''))) return;
    warmState = 'warming';
    if (!ocrBusy) {
      ocrStatus(BH, 'sim.ocr.warm',
        'Warming the reader \u2014 the first read downloads about 14 MB of models, once per device.', 'busy');
    }
    loadPaddle().then(function () {
      warmState = 'ready';
      if (ocrBusy) return; // a read is driving the status line; it owns it now
      ocrStatus(BH, 'sim.ocr.ready', 'The reader is ready.', 'ok');
      // The line has done its job — put the page back to rest.
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

  // ── OCR prefill — read a battle-report screenshot, fill the sheet ──
  // The whole pipeline runs client-side (static site, no server). The engine
  // itself lives in js/ocr-worker.js: PaddleOCR.js (PP-OCRv6 tiny) plus ONNX
  // Runtime and OpenCV are megabytes of JS and a wasm session compile, and
  // running them here froze the page for seconds mid-read. This side only
  // posts the picked file and parses what comes back — each recognised word
  // carries a box, so the 12 Bonus Details values are mapped by their row label
  // (block + stat) and column (left = your green value). boot() warms the
  // engine once the page is idle (warmOcr) so the first click doesn't also pay
  // the download. The sheet stays the source of truth — this is a prefill, and
  // every value is editable.

  // Site root from this file's own URL (same trick as i18n.js), so the worker
  // path resolves from any page depth.
  function scriptBase() {
    var s = document.currentScript;
    var src = s && s.src;
    if (!src) {
      var tags = document.getElementsByTagName('script');
      for (var i = 0; i < tags.length; i++) {
        if ((tags[i].src || '').indexOf('js/sim.js') !== -1) { src = tags[i].src; break; }
      }
    }
    return src ? src.replace(/js\/sim\.js[^/]*$/, '') : '';
  }

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
  // this is a hang-breaker, not a deadline. Without it a worker that dies
  // mid-read leaves the status and the button stuck for good.
  var ASK_TIMEOUT_MS = 120000;

  // One request, one reply, matched by id. 'warm' builds the engine; 'predict'
  // implies it.
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
    var el2 = el('sim-ocr-status');
    if (!el2) return;
    if (!key) { el2.hidden = true; el2.textContent = ''; return; }
    el2.hidden = false;
    el2.textContent = BH.fill(BH.tr(key, fb), vars);
    el2.className = 'sim-ocr-status' + (cls ? ' ' + cls : '');
  }

  // ── Reading the sheet ─────────────────────────────────
  var BLOCKS = TYPES.map(function (t) { return t.block; });
  var STATS_EN = STATS.map(function (s) { return s.ocr; });

  // OCR misreads a letter here and there ("lnfantry", "Letha1ity"), and often
  // returns a whole row label as one box ("Infantry Attack") rather than two.
  // Fold the usual digit/letter lookalikes and keep the spaces: both the row and
  // the wanted words go through the same fold, so exact matches stay exact.
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

  // Group recognised words into visual rows, then read the left (your) column of
  // every troop-type stat row. Returns { 'Block|Stat': value }.
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
      boxes.push({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, h: y1 - y0, text: text });
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

    var out = {};
    rows.forEach(function (r) {
      r.items.sort(function (a, b) { return a.cx - b.cx; });
      var joined = r.items.map(function (b) { return b.text; }).join(' ');
      var folded = fold(joined);
      var block = wordIn(folded, BLOCKS);
      var stat = wordIn(folded, STATS_EN);
      if (!block || !stat) return;
      var label = block + '|' + stat;
      if (label in out) return; // first (topmost) row wins
      // The green (your) column sits left of the label and the red one right of
      // it, so the value we want is the last percentage *before* the label —
      // that survives the OCR fusing two numbers into one box. Joining the row
      // first also survives it splitting "+457.5" and "%" apart.
      var at = joined.search(new RegExp(block, 'i'));
      var m = null;
      if (at === -1) {
        m = joined.match(/[+\-]?\d+(?:\.\d+)?\s*%/);
      } else {
        var pctRe = /[+\-]?\d+(?:\.\d+)?\s*%/g, hit;
        while ((hit = pctRe.exec(joined)) !== null) {
          if (hit.index >= at) break;
          m = hit;
        }
        if (!m) m = joined.match(/[+\-]?\d+(?:\.\d+)?\s*%/);
      }
      if (!m) return;
      var v = parseFloat(m[0]);
      if (isFinite(v)) out[label] = v;
    });
    return out;
  }

  // All twelve sheet cells are fillable; the modes each read their own slice
  // (bear fights want attack + lethality, and nothing reads defense or health
  // against a bear — they are on the sheet for the fights that do). One entry
  // per cell, keyed by the report's own row label.
  var FIELDS = [];
  TYPES.forEach(function (t) {
    STATS.forEach(function (s) {
      FIELDS.push({ label: t.block + '|' + s.ocr, id: 'sim-' + s.key + '-' + t.key });
    });
  });

  // Set every value we read and let the caller repaint once. Dispatching an
  // `input` event per field repainted the whole console twelve times for one
  // import (twelve style/layout invalidations for ~2 ms of work that costs
  // ~0.3 ms).
  function fill(vals) {
    var filled = 0;
    FIELDS.forEach(function (f) {
      var e = el(f.id);
      var v = vals[f.label];
      if (e && v !== undefined && isFinite(v)) {
        e.value = String(Math.round(v * 10) / 10);
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

    // The shot we just read, so the filled numbers can be checked against it.
    // The inline preview is painted from the bitmap the worker already decoded
    // (transferred, so nothing is copied or re-encoded); the link opens the
    // original full size in a new tab, where its decode can't land on this
    // page's thread.
    var shotEl = el('sim-ocr-shot');
    var shotCanvas = el('sim-ocr-preview');
    var shotLink = el('sim-ocr-shot-link');
    var shotUrl = null;

    function showShot(f, preview) {
      if (!shotEl || !shotCanvas || !shotLink) return;
      if (shotUrl) URL.revokeObjectURL(shotUrl);
      shotUrl = URL.createObjectURL(f);
      shotLink.href = shotUrl;
      if (preview) {
        shotCanvas.width = preview.width;
        shotCanvas.height = preview.height;
        shotCanvas.getContext('2d').drawImage(preview, 0, 0);
        preview.close();
      }
      shotEl.hidden = false;
    }

    // One read: ask the worker, then fill whatever labels we recognise.
    function readOnce(f) {
      return askWorker('predict', f).then(function (res) {
        return { filled: fill(parseItems(res.items)), preview: res.preview };
      });
    }

    // A phone's GPU can run the engine without throwing and still hand back
    // nothing usable — a failure mode a desktop's GPU driver doesn't show, and
    // one the worker can't detect because it doesn't know which words matter.
    // So if a read yields no values at all, drop the GPU for the session and
    // read the shot once more on wasm before reporting failure. That second
    // read is what made the phone work.
    function readShot(f) {
      return readOnce(f).then(function (first) {
        if (first.filled > 0) return first;
        return askWorker('useWasm')
          .then(function () { return readOnce(f); })
          .then(function (second) { return second.filled > 0 ? second : first; },
            function () { return first; });
      });
    }

    // The reader's first move towards the feature starts the engine (see
    // warmOcr): a tap, a hover, or arriving by keyboard. Never on page-idle —
    // the engine is far too heavy to hand to someone who never asked for it.
    ['pointerdown', 'mouseenter', 'focus'].forEach(function (ev) {
      btn.addEventListener(ev, function () { warmOcr(BH); });
    });

    btn.addEventListener('click', function () { file.click(); });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      // Clear the picker so choosing the same screenshot twice still fires.
      file.value = '';
      if (!f || ocrBusy) return;
      ocrBusy = true;
      ocrStatus(BH, 'sim.ocr.loading', 'Reading the screenshot\u2026', 'busy');
      readShot(f)
        .then(function (out) {
          if (out.filled) paint(BH);
          showShot(f, out.preview);
          if (out.filled === FIELDS.length) {
            ocrStatus(BH, 'sim.ocr.done', 'Filled from your report \u2014 double-check the numbers.', 'ok');
          } else if (out.filled > 0) {
            // A partial read is still useful: keep what we got and say so,
            // rather than discarding it behind a flat "couldn't read that".
            // Amber like a full read — values landed; the count is the caveat.
            ocrStatus(BH, 'sim.ocr.partial',
              'Read {n} of 12 values \u2014 fill in the rest above.', 'ok', { n: out.filled });
          } else {
            ocrStatus(BH, 'sim.ocr.fail', 'Couldn\u2019t read that screenshot. Try a clearer shot, or enter the numbers above.', 'bad');
          }
        })
        .catch(function (err) {
          // A failed read still hands back the shot it saw, so the user can see
          // what we were looking at.
          if (window.console && console.error) console.error('[sim-ocr]', (err && err.message) || err);
          showShot(f, err && err.preview);
          ocrStatus(BH, 'sim.ocr.fail', 'Couldn\u2019t read that screenshot. Try a clearer shot, or enter the numbers above.', 'bad');
        })
        .then(function () { ocrBusy = false; });
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
