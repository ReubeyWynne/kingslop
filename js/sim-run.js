/* ═══════════════════════════════════════════════════════════
   The simulator's run meter (battle-simulator/, INTERACTIONS.md)

   A `sim-run` interaction module on the console. The sweep in js/sim.js
   knows nothing about the meter: it fires `sim:sweep` with
   { phase: start|progress|done|fail, done, of, battles, planned, ms }, and
   this module draws it into the markup:

     [data-target="sim-run.bar"]     a <progress>, one step per mix
     [data-target="sim-run.meter"]   the live line: battles of the plan,
                                     the rate, the time left; on done the
                                     totals
     data-run on the root            running | done, for the loader

   Every progress message repaints the line, so a long sweep counts up as
   it goes instead of answering all at once.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  window.Interactions.register('sim-run', function (context) {
    var api = context.api;

    function number(v, digits) {
      var locale = (window.I18N && window.I18N.locale) || 'en-GB';
      return v.toLocaleString(locale, { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 });
    }

    function line(d) {
      var seconds = Math.max(0.001, d.ms / 1000);
      var rate = d.battles / seconds;
      if (d.phase === 'done') {
        return api.tpl('sim.review.metrics', '{battles} battles · {rate}/s · {seconds}s', {
          battles: number(d.battles), rate: number(Math.round(rate)), seconds: number(seconds, 1)
        });
      }
      // Time left from the pace so far; blank until the first mix lands.
      var left = d.done > 0 ? seconds * (d.of - d.done) / d.done : NaN;
      return api.tpl('sim.run.live', '{battles} of {planned} battles · {rate}/s · about {left}s left', {
        battles: number(d.battles), planned: number(d.planned),
        rate: d.battles ? number(Math.round(rate)) : '—', left: isFinite(left) ? number(Math.ceil(left)) : '—'
      });
    }

    context.listen(context.root, 'sim:sweep', function (event) {
      var d = event.detail || {};
      var failed = d.phase === 'fail';
      context.root.dataset.run = d.phase === 'done' || failed ? 'done' : 'running';
      context.targets('bar').forEach(function (bar) {
        bar.hidden = failed;
        bar.max = Math.max(1, d.of || 0);
        bar.value = Math.min(bar.max, d.done || 0);
      });
      context.targets('meter').forEach(function (meter) {
        meter.hidden = failed;
        if (!failed) meter.textContent = line(d);
      });
    });

    return {};
  });
})();
