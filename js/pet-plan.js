/* What a pet still needs. A pet levels with Pet Food; at every tenth level the cap breaks
   only after an Advance, paid in Growth Manuals, Nutrient Potions and Promotion Medallions,
   and the skill level is the number of Advances done. Each Advance scores Pet Advancement
   points in KvK prep, Strongest Governor and Brawl; Pet Food levelling scores next to nothing.

   Costs come from _data/pets.json (.dsh/build-pets.py): `petFood` on a level is the price of
   reaching it, `advance` the extra price of breaking its cap. An unread level counts as nothing. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../_data/pets.json'));
  else root.PetPlan = factory(root.PetData);
})(typeof window === 'object' ? window : globalThis, function (data) {
  'use strict';
  var PETS = (data && data.pets) || [], KEYS = ['petFood', 'growthManual', 'nutrientPotion', 'promotionMedallion'];
  function find(id) { return PETS.find(function (pet) { return pet.id === id; }) || null; }
  function levels(pet) { return data.profiles[pet.profile].levels; }
  // Advances done at this level: one per cap passed, and the one at this level if it is done.
  function skillLevel(record) {
    if (!record || record.level === null) return null;
    return Math.floor(record.level / 10) - (record.level % 10 === 0 && !record.advanced ? 1 : 0);
  }
  // The cost from where the pet stands up to `target` with the Advance at `target` done.
  function cost(pet, record, target) {
    var sum = { petFood: 0, growthManual: 0, nutrientPotion: 0, promotionMedallion: 0, advances: 0, score: 0, kvk: 0, brawl: 0 };
    if (!record || record.level === null) return null;
    levels(pet).forEach(function (row) {
      if (row.level > target) return;
      if (row.level > record.level) sum.petFood += row.petFood;
      var pending = row.advance && (row.level > record.level || row.level === record.level && !record.advanced);
      if (!pending) return;
      sum.growthManual += row.advance.growthManual; sum.nutrientPotion += row.advance.nutrientPotion; sum.promotionMedallion += row.advance.promotionMedallion;
      sum.advances += 1; sum.score += row.score;
      var points = data.points[String(row.level)];
      sum.kvk += points.kvk; sum.brawl += points.brawl;
    });
    return sum;
  }
  // The next Advance (the one at this level if it waits, else the next cap), or null at the top.
  function nextAdvance(pet, record) {
    if (!record || record.level === null) return null;
    var at = record.level % 10 === 0 && !record.advanced ? record.level : Math.ceil((record.level + 1) / 10) * 10;
    return at > pet.maxLevel ? null : { level: at, cost: cost(pet, record, at) };
  }
  function toMax(pet, record) { return cost(pet, record, pet.maxLevel); }
  // The skill's values at a level: one value per ladder row, or null before the first Advance.
  function skillAt(pet, level) {
    if (!level) return null;
    return pet.skill.ladder.map(function (row) { return row.values[level - 1]; });
  }
  return { PETS: PETS, KEYS: KEYS, find: find, skillLevel: skillLevel, cost: cost, nextAdvance: nextAdvance, toMax: toMax, skillAt: skillAt };
});
