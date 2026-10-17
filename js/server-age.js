(function () {
  'use strict';
  var store, failure = false, last, transient;
  function blank() { return { position: null, generation: null, truegold: null, warAcademy: null }; }
  function dispatch(profile) {
    var encoded = JSON.stringify(profile);
    if (encoded === last) return;
    last = encoded;
    document.dispatchEvent(new CustomEvent('ks:server-age-change', { detail: profile.generation === null ? null : { generation: profile.generation } }));
    document.dispatchEvent(new CustomEvent('ks:kingdom-change', { detail: profile }));
  }
  try {
    store = window.PlayerLedger.shared();
    var saved = store.snapshot();
    if (saved.preferences.kingdom === undefined) {
      var raw = localStorage.getItem('ks_server_age'), parsed = raw;
      try { parsed = JSON.parse(raw); } catch (cause) {}
      var generation = Number(parsed && typeof parsed === 'object' ? parsed.generation : parsed);
      if (Number.isInteger(generation) && generation >= 1 && generation <= 99) {
        var profile = blank(); profile.generation = generation; store.setKingdom(profile, saved.revision);
        localStorage.removeItem('ks_server_age');
      }
    }
    store.subscribe(function () { dispatch(store.kingdom()); });
    last = JSON.stringify(store.kingdom());
  } catch (cause) { failure = true; }
  function get() { try { return store ? store.kingdom() : transient || blank(); } catch (cause) { return blank(); } }
  function set(profile) {
    if (failure || !store) throw new Error('Kingdom progression could not be saved');
    store.setKingdom(profile); return get();
  }
  function setGeneration(value) {
    var n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 99) return null;
    var profile = get(); profile.generation = n; profile.position = null;
    if (!store) { transient = profile; dispatch(profile); }
    else set(profile);
    return { generation: n };
  }
  function availability(requirements, profile) {
    profile = profile || get();
    var unknown = false, unavailable = false;
    Object.keys(requirements).forEach(function (key) {
      if (!['generation', 'truegold', 'warAcademy'].includes(key)) throw new Error('Unknown kingdom requirement');
      if (profile[key] === null) unknown = true;
      else if (key === 'warAcademy' ? profile[key] !== requirements[key] : profile[key] < requirements[key]) unavailable = true;
    });
    return unavailable ? 'upcoming' : unknown ? 'unknown' : 'available';
  }
  window.KingdomProgression = { get: get, set: set, blank: blank, availability: availability, writable: function () { return !failure; } };
  window.KS_SERVER_AGE = {
    key: window.PlayerLedger.KEY,
    get: function () { var n = get().generation; return n === null ? null : { generation: n }; },
    getGeneration: function () { return get().generation; },
    setGeneration: setGeneration,
    clear: function () { var profile = get(); profile.generation = null; profile.position = null; if (!store) { transient = profile; dispatch(profile); } else set(profile); }
  };
})();
