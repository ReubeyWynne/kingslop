/* server-age.js — shared persisted server-age preference for dey.ci pages. */
(function () {
  'use strict';

  var KEY = 'ks_server_age';

  function normaliseGeneration(value) {
    var n = Number(value);
    if (!isFinite(n)) return null;
    n = Math.round(n);
    return n >= 1 && n <= 99 ? n : null;
  }

  function read() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { return null; }
    if (!raw) return null;

    // Backwards-compatible with an early bare-number value if one ever exists.
    var parsed = raw;
    try { parsed = JSON.parse(raw); } catch (e) { /* bare string/number */ }

    var generation = normaliseGeneration(
      parsed && typeof parsed === 'object' ? parsed.generation : parsed
    );
    return generation ? { generation: generation } : null;
  }

  function dispatch(record) {
    var event;
    try {
      event = new CustomEvent('ks:server-age-change', { detail: record });
    } catch (e) {
      event = document.createEvent('CustomEvent');
      event.initCustomEvent('ks:server-age-change', false, false, record);
    }
    document.dispatchEvent(event);
  }

  function setGeneration(value) {
    var generation = normaliseGeneration(value);
    if (!generation) return null;
    var record = { generation: generation };
    try { localStorage.setItem(KEY, JSON.stringify(record)); } catch (e) { /* storage unavailable */ }
    dispatch(record);
    return record;
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
    dispatch(null);
  }

  var api = {
    key: KEY,
    get: read,
    getGeneration: function () {
      var record = read();
      return record ? record.generation : null;
    },
    setGeneration: setGeneration,
    clear: clear
  };

  window.KS_SERVER_AGE = api;

  // Keep other open dey.ci tabs/pages in sync as well.
  window.addEventListener('storage', function (event) {
    if (event.key === KEY) dispatch(read());
  });
})();
