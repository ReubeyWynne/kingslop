/* bear-hunt.js — Bear Hunt page toys.
   Registers the calculators (rally fill, march split, throughput) as declared groups
   with js/bind.js: the page's markup says which inputs feed which figures, the
   group says what the figures are, and the dictionary sentence carries only
   `{tokens}` — no id, no value. Nothing here re-queries an input or holds an
   output node, so a language switch is just a repaint: the tokens resolve
   against the inputs as they stand, in the active locale. */
(function () {
  'use strict';

  // ── Rally-fill calculator ──────────────────────────────
  // A blank or negative capacity has no fair share: the dash says "no answer
  // yet", where a coerced 0 would read as "the answer is zero".
  BH.group('rally', {
    inputs: ['cap', 'players'],
    values: function (v, BH) {
      var T = isFinite(v.cap) && v.cap > 0 ? v.cap : NaN;
      var j = Math.min(15, Math.max(1, v.players || 1));
      return { n: j, share: BH.fmt(T / j), mult: BH.mult(Math.sqrt(j)) };
    }
  });

  // ── March-split calculator ─────────────────────────────
  // Same rule as the rally: no answer is a dash, not a zero.
  BH.group('march', {
    inputs: ['pool', 'q'],
    values: function (v, BH) {
      var P = isFinite(v.pool) && v.pool > 0 ? v.pool : NaN;
      var q = Math.min(6, Math.max(1, v.q || 1));
      return { n: q, share: BH.fmt(P / q), mult: BH.mult(Math.sqrt(q)) };
    }
  });

  // ── Rally-throughput calculator ────────────────────────
  BH.group('throughput', {
    inputs: ['participants', 'launchers', 'joiners', 'queues'],
    values: function (v, BH) {
      var p = Math.max(1, Math.round(v.participants || 1));
      var l = Math.min(p, Math.max(1, Math.round(v.launchers || 1)));
      var s = Math.min(14, Math.max(1, Math.round(v.joiners || 1)));
      var q = Math.min(6, Math.max(1, Math.round(v.queues || 1)));
      var slots = l * s;
      return {
        slots: BH.fmt(slots),
        hits: (slots / (p * q)).toFixed(2) + '×',
        spacing: Math.round(300 / l) + 's'
      };
    }
  });

  // ── The ❦ in the margin ────────────────────────────────
  // The mark beside "the four rules" is the fifth rule's own whisper: pressing
  // it reveals the rule the page keeps for whoever reads the margin. The copy
  // and the row shipped with the page; only the listener was missing, which
  // left a focusable button that did nothing.
  function wireMarginMark() {
    var mark = document.getElementById('hedera');
    var five = document.getElementById('rulefive');
    if (!mark || !five) return;
    mark.setAttribute('aria-expanded', 'false');
    mark.setAttribute('aria-controls', 'rulefive');
    mark.addEventListener('click', function () {
      var open = five.hidden;
      five.hidden = !open;
      mark.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  wireMarginMark();
})();
