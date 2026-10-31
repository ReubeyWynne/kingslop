(function () {
  'use strict';
  // The guide's wave map: city waves, the online-only waves and the two HQ waves.
  var ONLINE = [7, 14, 17], HQ = [10, 20];
  var DETAIL = {
    city: function (w) { return 'Wave ' + w + ': every city. Reinforce your assigned towns before the hit.'; },
    online: function (w) { return 'Wave ' + w + ': online cities only. Offline cities are skipped, so their cover waits for the next wave.'; },
    hq: function (w) { return 'HQ wave ' + w + ': send the agreed share after the wave before it. Return after the hit.'; }
  };
  function kindOf(w) { return HQ.includes(w) ? 'hq' : ONLINE.includes(w) ? 'online' : 'city'; }
  window.Interactions.register('vikings-guide', function (context) {
    var body = context.targets('waves')[0], detail = context.targets('waveDetail')[0];
    if (!body || !detail) return {};
    for (var w = 1; w <= 20; w++) {
      var kind = kindOf(w), b = document.createElement('button');
      b.type = 'button'; b.textContent = String(w); b.dataset.action = 'vikings-guide.wave'; b.dataset.wave = w; b.dataset.kind = kind; b.setAttribute('aria-pressed', w === 1 ? 'true' : 'false');
      var small = document.createElement('small'); small.textContent = kind === 'online' ? 'On' : kind === 'hq' ? 'HQ' : 'City'; b.appendChild(small);
      b.setAttribute('aria-label', 'Wave ' + w + ', ' + (kind === 'online' ? 'online cities only' : kind === 'hq' ? 'HQ' : 'every city'));
      body.appendChild(b);
    }
    detail.textContent = DETAIL.city(1);
    return { actions: { wave: { run: function (node) {
      body.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === node)); });
      detail.textContent = DETAIL[node.dataset.kind](node.dataset.wave);
    } } } };
  });
})();
