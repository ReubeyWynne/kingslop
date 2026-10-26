/* Home's own corner, once the player's save holds something: today on the 28-day event clock,
   the next upgrade (next-step, across every kind), and what the save is holding, each linking
   to its page. It stays hidden on an empty save, under a guest or shared-link store, and
   without JavaScript, so a first visit sees the plain guide list. */
(function () {
  'use strict';
  var PARTS = ['items', 'heroes', 'masters', 'pets', 'gear'];
  function count(map, test) { return Object.keys(map || {}).filter(function (id) { return test(map[id]); }).length; }
  function confirmed(entry) { return Boolean(entry) && entry.status === 'confirmed'; }
  function known(entry) { return Boolean(entry) && entry.level !== null && entry.level !== undefined; }
  function any() { return true; }
  function roster(snapshot, section) { return count(snapshot[section] && snapshot[section].roster, any); }
  // The kvk.js weeks, by day of the cycle.
  function weekOf(day) { return day <= 7 ? 'brawl' : day <= 14 ? 'sg' : day <= 20 ? 'mob' : day === 21 ? 'gap' : day <= 26 ? 'prep' : 'battle'; }

  window.Interactions.register('home-yours', function (context) {
    var root = context.root, api = context.api, rules = window.EventRules, store = null;
    try { store = context.ledger === window.PlayerLedger.shared() ? context.ledger : null; if (store) store.snapshot(); } catch (cause) { store = null; }
    function held(snapshot) {
      return {
        items: count(snapshot.inventory, confirmed),
        heroes: roster(snapshot, 'heroes'),
        masters: roster(snapshot, 'masters'),
        pets: roster(snapshot, 'pets'),
        gear: count(snapshot.heroGear && snapshot.heroGear.pieces, known)
      };
    }
    // The game turns the wheel on UTC, so today is the UTC calendar date.
    function today() {
      var now = new Date(), since = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - rules.EPOCH) / rules.DAY_MS);
      return (since % rules.CYCLE + rules.CYCLE) % rules.CYCLE + 1;
    }
    function render() {
      var parts = store ? held(store.snapshot()) : null, shown = parts ? PARTS.filter(function (part) { return parts[part] > 0; }) : [];
      root.hidden = !shown.length;
      // Nothing to show: give back the space the head script held for it.
      if (!shown.length) { document.documentElement.classList.remove('has-save'); return; }
      var day = today(), week = weekOf(day);
      context.targets('today')[0].textContent = api.tpl('ks.today.dayOut', 'day {n} of 28', { n: day }) + ' · ' + (week === 'gap' ? api.tr('ks.today.between', 'Between weeks') : api.tr('ks.week.' + week, week));
      context.targets('held')[0].textContent = shown.map(function (part) { return api.tpl('home.yours.count.' + part, part + ': {n}', { n: api.fmt(parts[part]) }); }).join(' · ');
    }
    if (store) context.cleanup(store.subscribe(render));
    return { refresh: render };
  });
})();
