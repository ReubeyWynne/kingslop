var RARITY = ['legendary', 'epic', 'rare'], TROOPS = ['inf', 'cav', 'arc'];
function matches(hero, filters) {
  var query = String(filters.query || '').trim().toLowerCase();
  return (!query || (hero.name + ' ' + hero.key).toLowerCase().includes(query)) &&
    (!filters.troop || hero.type === filters.troop) &&
    (!filters.generation || hero.generation === Number(filters.generation)) &&
    (!filters.server || hero.generation <= Number(filters.server)) &&
    (!filters.role || hero.roles.includes(filters.role)) &&
    (!filters.mine || (filters.mine === 'owned') === Boolean(hero.owned));
}
// Roster order: generation, then rarity tier (only generation 1 mixes tiers), then infantry, cavalry, archers.
function compare(a, b) {
  return a.generation - b.generation || RARITY.indexOf(a.rarity) - RARITY.indexOf(b.rarity) || TROOPS.indexOf(a.type) - TROOPS.indexOf(b.type) || a.name.localeCompare(b.name);
}
// Star index as in _data/heroes.json: 6 × stars + tier, so 27 is 4★ with 3 of 6 tiers.
function stars(index) { return { stars: Math.floor(index / 6), tier: index % 6 }; }

// The exports as one object: the default export, what the page's classic scripts read as
// window.HeroDirectory and what require() returns to the CommonJS checks.
const api = { matches: matches, compare: compare, stars: stars, RARITY: RARITY.slice(), TROOPS: TROOPS.slice() };
const exportedRARITY = api.RARITY;
const exportedTROOPS = api.TROOPS;
export { matches, compare, stars, exportedRARITY as RARITY, exportedTROOPS as TROOPS };
export { api as default, api as 'module.exports' };
