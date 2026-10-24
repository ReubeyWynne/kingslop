(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SimulatorSheet = factory();
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  function create(options) {
    var root = options.root, key = root.dataset.sheetKey || 'bh:sim:v1';

    function fields() {
      return root.querySelectorAll('input[id^="sim-"]:not([type="file"]), select[id^="sim-"]');
    }

    function restore() {
      var saved = null;
      try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { saved = null; }
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
      if (typeof saved.room === 'string') options.setRoom(saved.room || null);
    }

    var saveTimer = null;
    function save() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        var out = { room: options.getRoom() || '' };
        Array.prototype.forEach.call(fields(), function (f) { out[f.id] = f.value; });
        try { localStorage.setItem(key, JSON.stringify(out)); } catch (e) { /* private mode, full storage */ }
      }, 250);
    }
    return { fields: fields, restore: restore, save: save };
  }
  return { create: create };
});
