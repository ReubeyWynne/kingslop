/* Looking after your pets: how full and how fond each one is, and the mood that follows.
   Both meters run from 0 to 100 and fall with real time, whether or not the page is open:
   only the value and when it was set are kept, and the current value is worked out from
   the clock. Pet Food fills a pet up; a pat makes it fonder. At night (23:00–06:00 on your
   clock) a pet left alone for ten minutes is asleep.

   The care is kept on this device under its own key (ks.pet-care.v1), apart from the
   player ledger: it is play, not a game fact, so it stays out of saves and the event maths. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PetCare = factory();
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  var KEY = 'ks.pet-care.v1', HOUR = 3600000, MINUTE = 60000;
  // Hours from full to empty: hunger is slower than loneliness.
  var EMPTY = { fullness: 16, affection: 10 };
  var FEED = 30, PAT = 20, STUFFED = 90, START = { fullness: 60, affection: 50 };
  var MOODS = ['asleep', 'hungry', 'lonely', 'delighted', 'content', 'restless'];
  function clamp(value) { return Math.max(0, Math.min(100, value)); }
  function fresh(now) { return { fullness: { value: START.fullness, at: now }, affection: { value: START.affection, at: now }, touched: 0 }; }
  function meter(record, name, now) {
    var entry = record[name], hours = Math.max(0, now - entry.at) / HOUR;
    return clamp(entry.value - hours * 100 / EMPTY[name]);
  }
  function level(record, now) { return { fullness: meter(record, 'fullness', now), affection: meter(record, 'affection', now) }; }
  function night(hour) { return hour >= 23 || hour < 6; }
  function mood(record, now, hour) {
    // Whole points, as the meters show them, so a mood never disagrees with its bars.
    var raw = level(record, now), at = { fullness: Math.round(raw.fullness), affection: Math.round(raw.affection) };
    if (night(hour) && now - record.touched > 10 * MINUTE) return 'asleep';
    if (at.fullness < 25) return 'hungry';
    if (at.affection < 25) return 'lonely';
    if (at.fullness >= 70 && at.affection >= 70) return 'delighted';
    if ((at.fullness + at.affection) / 2 >= 45) return 'content';
    return 'restless';
  }
  // Each action returns the new record and the reaction to show: a full pet turns food down.
  function feed(record, now) {
    var at = meter(record, 'fullness', now);
    if (at > STUFFED) return { record: Object.assign({}, record, { touched: now }), react: 'full' };
    return { record: Object.assign({}, record, { fullness: { value: clamp(at + FEED), at: now }, touched: now }), react: 'feed' };
  }
  function pat(record, now) {
    return { record: Object.assign({}, record, { affection: { value: clamp(meter(record, 'affection', now) + PAT), at: now }, touched: now }), react: 'pet' };
  }
  function valid(record) {
    function entry(e) { return e && typeof e === 'object' && Number.isFinite(e.value) && e.value >= 0 && e.value <= 100 && Number.isFinite(e.at); }
    return record && typeof record === 'object' && entry(record.fullness) && entry(record.affection) && Number.isFinite(record.touched);
  }
  // The whole den from storage; anything unreadable starts again rather than breaking the page.
  function load(storage) {
    try {
      var value = JSON.parse(storage.getItem(KEY) || '{}'), den = {};
      if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
      Object.keys(value).forEach(function (id) { if (/^[a-z][a-z-]{0,39}$/.test(id) && valid(value[id])) den[id] = value[id]; });
      return den;
    } catch (cause) { return {}; }
  }
  function save(storage, den) { storage.setItem(KEY, JSON.stringify(den)); }
  return { KEY: KEY, EMPTY: EMPTY, FEED: FEED, PAT: PAT, STUFFED: STUFFED, MOODS: MOODS, fresh: fresh, level: level, mood: mood, feed: feed, pat: pat, valid: valid, load: load, save: save };
});
