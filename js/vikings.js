(function () {
  'use strict';

  function paint(BH) {
    var reinforcers = document.getElementById('vv-reinforcers');
    var outline = document.getElementById('vv-outline');
    if (!reinforcers || !outline) return;
    var n = Math.min(15, Math.max(1, parseInt(reinforcers.value, 10) || 1));
    outline.textContent = BH.fmt(10000) + ' ÷ ' + BH.fmt(n) + ' ≈ ' + BH.fmt(10000 / n);
  }

  BH.registerPage({
    boot: function (BH) {
      var reinforcers = document.getElementById('vv-reinforcers');
      if (reinforcers) reinforcers.addEventListener('input', function () { paint(BH); });
      paint(BH);
    },
    onChange: function () { paint(BH); }
  });
})();
