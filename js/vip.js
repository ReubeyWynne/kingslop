/* vip.js — the VIP calculator page toys.
   Registers with common.js via window.BH.registerPage: the date calculator
   (level + progress + days played → expected dates for every remaining level
   at the player's own rate). The XP ladder is a game-wide constant — the
   in-game VIP screen (March 2026 patch), per the Kingshot Mastery VIP guide;
   only the rate is the player's. Strings are read lazily from the active
   dictionary (vip.* keys, English fallback) and the page re-paints on
   i18n:change, so a language switch mid-session shows the new language and
   locale-formatted numbers and dates. */
(function () {
  'use strict';

  // ── The ladder ─────────────────────────────────────────
  // XP[L] = XP needed to REACH level L (VIP 1 costs 0 — you start there);
  // each level's progress resets to 0 on arrival. VIP 10+ doubles per level.
  // Source: in-game VIP screen (March 2026 patch), Kingshot Mastery guide.
  var XP = [null, 0, 2500, 5000, 12500, 30000, 40000, 60000, 100000,
            350000, 600000, 1200000, 2400000];
  var MAX = XP.length - 1;             // 12
  var CUM = [null];
  for (var i = 1; i <= MAX; i++) CUM[i] = CUM[i - 1] + XP[i];
  var MILESTONES = [4, 6, 9];

  function fmtDate(d) {
    var loc = (window.I18N && window.I18N.locale) || 'en-GB';
    try {
      return new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
    } catch (e) {
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }

  function addDays(base, n) {
    var d = new Date(base.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }

  function milestoneTag(BH, level) {
    var key = 'vip.calc.tag' + level;
    var fallback = { 4: 'construction', 6: 'march queue', 9: 'f2p ceiling' }[level] || '';
    return BH.tr(key, fallback);
  }

  // ── The calculator ─────────────────────────────────────
  // Elements are re-queried on every paint: the i18n loader replaces
  // innerHTML on other nodes, so stale references must never be trusted.
  function computeState(BH) {
    var levelEl = document.getElementById('vip-level');
    var xpEl = document.getElementById('vip-xp');
    var daysEl = document.getElementById('vip-days');
    if (!levelEl || !xpEl || !daysEl) return null;
    var L = Math.min(MAX, Math.max(1, parseInt(levelEl.value, 10) || 1));
    var next = XP[L + 1] || 0;
    var p = Math.min(next, Math.max(0, parseInt(xpEl.value, 10) || 0));
    var D = Math.max(0, parseInt(daysEl.value, 10) || 0);

    // Mirror the clamped values back into the controls.
    xpEl.max = next;
    xpEl.disabled = L === MAX;
    var lOut = document.getElementById('vip-l-out');
    if (lOut) lOut.textContent = L + '/' + MAX;
    var xpOut = document.getElementById('vip-xp-out');
    if (xpOut) xpOut.textContent = BH.fmt(p) + ' / ' + BH.fmt(next);

    var earned = CUM[L] + p;
    var rate = D > 0 ? earned / D : 0;
    return { L: L, p: p, D: D, next: next, earned: earned, rate: rate, ok: L < MAX };
  }

  function paint(BH) {
    var s = computeState(BH);
    if (!s) return;
    var headline = document.getElementById('vip-headline');
    var out = document.getElementById('vip-out');

    if (!s.ok) {
      if (headline) headline.innerHTML = BH.tr('vip.calc.atTop',
        'You\u2019re at <b>VIP 12</b>, the highest level. There are no more dates to work out.');
    } else if (s.D < 1) {
      if (headline) headline.innerHTML = BH.tr('vip.calc.noDays',
        'Enter <b>days played</b>. The rate is your earned XP divided by your time.');
    } else if (s.earned < 1) {
      if (headline) headline.innerHTML = BH.tr('vip.calc.noRate',
        'No rate yet. You\u2019ve earned <b>0 VIP XP</b>, so there\u2019s nothing to divide. Play for a few days and come back.');
    } else {
      var nDays = Math.ceil((CUM[s.L + 1] - s.earned) / s.rate);
      var dateTxt = fmtDate(addDays(new Date(), nDays));
      if (headline) {
        headline.innerHTML = BH.fill(BH.trCount('vip.calc.rateLine', nDays, [
          'At <b>{rate}</b> VIP XP a day, you already have the XP for your next level \u2014 <b>today</b>.',
          'At <b>{rate}</b> VIP XP a day, your next level lands <b>{date}</b>, <b>tomorrow</b>.',
          'At <b>{rate}</b> VIP XP a day, your next level lands <b>{date}</b>, <b>{n} days</b> from today.'
        ]), { rate: BH.fmt(s.rate), date: dateTxt, n: BH.fmt(nDays) });
      }
    }

    if (out) {
      var html = '';
      if (s.ok && s.D >= 1 && s.earned >= 1) {
        html = '<div class="vip-head" role="row">' +
          '<span role="columnheader">' + BH.tr('vip.calc.thLevel', 'Level') + '</span>' +
          '<span class="vip-need" role="columnheader">' + BH.tr('vip.calc.thNeed', 'XP still needed') + '</span>' +
          '<span role="columnheader">' + BH.tr('vip.calc.thDays', 'Days') + '</span>' +
          '<span role="columnheader">' + BH.tr('vip.calc.thDate', 'Date') + '</span></div>';
        for (var T = s.L + 1; T <= MAX; T++) {
          var need = CUM[T] - s.earned;
          var days = Math.ceil(need / s.rate);
          var date = addDays(new Date(), days);
          var ms = MILESTONES.indexOf(T) !== -1;
          html += '<div class="vip-row' + (ms ? ' milestone' : '') + '" role="row">' +
            '<span role="cell" class="vip-lvl">VIP ' + T + (ms ? '<small>' + milestoneTag(BH, T) + '</small>' : '') + '</span>' +
            '<span role="cell" class="vip-need">' + BH.fmt(need) + '</span>' +
            '<span role="cell" class="vip-days">' + BH.fmt(days) + '</span>' +
            '<span role="cell" class="vip-date">' + fmtDate(date) + '</span></div>';
        }
      }
      out.innerHTML = html;
      out.hidden = html === '';
    }

    paintTargets(BH, s);
  }

  // ── The milestone cards — your date for VIP 4 / 6 / 9 ──
  function paintTargets(BH, s) {
    if (!s) return;
    MILESTONES.forEach(function (m) {
      var slot = document.getElementById('vip-target-' + m);
      if (!slot) return;
      if (m <= s.L) {
        slot.className = 'vip-target-date done';
        slot.innerHTML = BH.tr('vip.targets.done', 'behind you');
      } else if (!s.ok || s.D < 1 || s.earned < 1) {
        slot.className = 'vip-target-date';
        slot.textContent = '\u2014';
      } else {
        var days = Math.ceil((CUM[m] - s.earned) / s.rate);
        var date = fmtDate(addDays(new Date(), days));
        slot.className = 'vip-target-date';
        slot.innerHTML = BH.fill(BH.trCount('vip.targets.out', days, [
          'your date: <b>{date}</b> \u00B7 <b>today</b>',
          'your date: <b>{date}</b> \u00B7 <b>tomorrow</b>',
          'your date: <b>{date}</b> \u00B7 <b>{n} days</b>'
        ]), { date: date, n: BH.fmt(days) });
      }
    });
  }

  function boot(BH) {
    var level = document.getElementById('vip-level');
    var xp = document.getElementById('vip-xp');
    var days = document.getElementById('vip-days');
    if (level) level.addEventListener('input', function () { paint(BH); });
    if (xp) xp.addEventListener('input', function () { paint(BH); });
    if (days) days.addEventListener('input', function () { paint(BH); });
    paint(BH);
  }

  BH.registerPage({
    boot: boot,
    onChange: function () { paint(BH); }
  });
})();
