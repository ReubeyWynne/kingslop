(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HeroDirectory = factory();
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  function matches(hero, filters) {
    var query = String(filters.query || '').trim().toLowerCase();
    return (!query || (hero.name + ' ' + hero.key).toLowerCase().includes(query)) &&
      (!filters.troop || hero.type === filters.troop) &&
      (!filters.generation || hero.generation === Number(filters.generation)) &&
      (!filters.server || hero.generation <= Number(filters.server)) &&
      (!filters.role || hero.roles.includes(filters.role));
  }
  return { matches: matches };
});
