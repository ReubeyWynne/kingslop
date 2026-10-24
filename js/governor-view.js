(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GovernorView = factory();
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  var EN = {
    'tier.green': 'Green', 'tier.blue': 'Blue', 'tier.purple': 'Purple', 'tier.gold': 'Gold', 'tier.red': 'Red',
    notSet: 'not set', notCrafted: 'not crafted', noCharm: 'no charm', lv: 'Lv {n}'
  };
  function state(index) { return index === null || index === undefined ? 'unset' : index === 0 ? 'empty' : 'set'; }
  function setSrc(img, src) { if (img && img.getAttribute('src') !== src) img.setAttribute('src', src); }
  function create(engine, api, artBase, options) {
    options = options || {};
    var emptyGemLabel = options.emptyGemLabel === undefined ? '·' : options.emptyGemLabel;
    function t(key) { return api.tr('gov.' + key, EN[key]); }
    function gear(index) { return index ? engine.describe('gear', index) : { tier: 'green', grade: 0, stars: 0 }; }
    function levelName(which, index) {
      if (index === null || index === undefined) return t('notSet');
      if (which === 'charms') return index ? api.fill(t('lv'), { n: api.fmt(index) }) : t('noCharm');
      if (!index) return t('notCrafted');
      var d = gear(index), tier = api.tr('gov.tier.' + d.tier, options.tierFallback === 'id' ? d.tier : EN['tier.' + d.tier]);
      return tier + (d.grade ? ' T' + api.fmt(d.grade) : '') + ' ' + api.fmt(d.stars) + '★';
    }
    function gearArt(id, index) { var d = gear(index); return artBase + 'gear/' + id + '-' + d.tier + '-' + d.grade + '.webp'; }
    function charmArt(id, level) { return artBase + 'charms/' + id.split('-')[0] + '-' + Math.max(1, level || 1) + '.webp'; }
    function paintCard(card, id, index) {
      card.dataset.state = state(index);
      card.dataset.tier = index ? gear(index).tier : '';
      setSrc(card.querySelector('img'), gearArt(id, index));
      var stars = options.stars && card.querySelector(options.stars);
      if (stars) stars.textContent = '★'.repeat(index ? gear(index).stars : 0);
    }
    function paintGem(gem, id, level) {
      gem.dataset.state = state(level);
      setSrc(gem.querySelector('img'), charmArt(id, level));
      var label = gem.querySelector('b'); if (label) label.textContent = level ? api.fmt(level) : emptyGemLabel;
    }
    return { levelName: levelName, state: state, gearArt: gearArt, charmArt: charmArt, paintCard: paintCard, paintGem: paintGem };
  }
  return { create: create };
});
