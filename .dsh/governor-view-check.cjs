const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const G = require('../js/governor-engine.mjs');
const GovernorView = require('../js/governor-view.js');

let dictionary = {}, locale = 'en-GB';
const api = {
  tr: (key, fallback) => dictionary[key] === undefined ? fallback : dictionary[key],
  fmt: value => new Intl.NumberFormat(locale).format(value),
  fill: (text, values) => text.replace(/\{(\w+)\}/g, (_, key) => values[key])
};
const view = GovernorView.create(G, api, '/governor/');
const town = GovernorView.create(G, api, '../img/governor/', { emptyGemLabel: '', tierFallback: 'id' });

for (const which of ['gear', 'charms']) {
  for (const level of [null, undefined]) {
    assert.equal(view.state(level), 'unset');
    assert.equal(view.levelName(which, level), 'not set');
  }
  assert.equal(view.state(0), 'empty');
  assert.equal(view.state(1), 'set');
  assert.equal(view.levelName(which, 0), which === 'gear' ? 'not crafted' : 'no charm');
}
assert.equal(view.levelName('gear', 1), 'Green 0★');
assert.equal(town.levelName('gear', 1), 'green 0★');
assert.equal(view.levelName('gear', G.max('gear')), 'Red T6 3★');
assert.equal(view.levelName('charms', G.max('charms')), 'Lv 22');
assert.throws(() => view.levelName('gear', G.max('gear') + 1), /Unsupported governor level/);

for (const file of fs.readdirSync(path.resolve(__dirname, '../i18n')).filter(file => file.endsWith('.js'))) {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../i18n', file), 'utf8'), context);
  dictionary = Object.values(context.window.__BH_I18N_DATA)[0];
  locale = file.slice(0, -3);
  for (const which of ['gear', 'charms']) {
    assert.equal(view.levelName(which, null), api.tr('gov.notSet', 'not set'), file);
    assert.equal(view.levelName(which, 0), which === 'gear' ? api.tr('gov.notCrafted', 'not crafted') : api.tr('gov.noCharm', 'no charm'), file);
  }
  G.data.gear.levels.forEach((row, at) => {
    const suffix = (row.grade ? ' T' + api.fmt(row.grade) : '') + ' ' + api.fmt(row.stars) + '★';
    const title = row.tier.charAt(0).toUpperCase() + row.tier.slice(1);
    assert.equal(view.levelName('gear', at + 1), api.tr('gov.tier.' + row.tier, title) + suffix, file + ' gear ' + (at + 1));
    assert.equal(town.levelName('gear', at + 1), api.tr('gov.tier.' + row.tier, row.tier) + suffix, file + ' Town gear ' + (at + 1));
  });
  assert.equal(view.levelName('charms', 22), api.fill(api.tr('gov.lv', 'Lv {n}'), { n: api.fmt(22) }), file);
}
dictionary = {}; locale = 'en-GB';

for (const level of [null, undefined, 0]) {
  assert.equal(view.gearArt('cav-1', level), '/governor/gear/cav-1-green-0.webp');
  assert.equal(view.charmArt('arc-2-3', level), '/governor/charms/arc-1.webp');
  assert.equal(town.charmArt('arc', level), '../img/governor/charms/arc-1.webp');
}
assert.equal(view.gearArt('inf-2', 58), '/governor/gear/inf-2-red-6.webp');
assert.equal(view.charmArt('cav-1-2', 22), '/governor/charms/cav-22.webp');

// What a card and a gem show, for the controllers to bind.
for (const painter of [view, town]) {
  for (const level of [58, 0, null, undefined, 1]) {
    assert.deepEqual(painter.card('inf-1', level), { state: painter.state(level), tier: level ? G.describe('gear', level).tier : '', src: painter.gearArt('inf-1', level), stars: '★'.repeat(level ? G.describe('gear', level).stars : 0) });
  }
  for (const level of [22, 0, null, undefined, 1]) {
    assert.deepEqual(painter.gem('cav-2-3', level), { state: painter.state(level), src: painter.charmArt('cav-2-3', level), label: level ? api.fmt(level) : painter === town ? '' : '·' });
  }
}

dictionary = { 'gov.notSet': 'inconnu', 'gov.tier.red': 'Rouge', 'gov.lv': 'Niveau {n}' }; locale = 'ar';
assert.equal(view.levelName('gear', null), 'inconnu');
assert.equal(view.levelName('gear', 58), 'Rouge T' + api.fmt(6) + ' ' + api.fmt(3) + '★');
assert.equal(view.levelName('charms', 22), 'Niveau ' + api.fmt(22));
assert.equal(view.gem('inf', 22).label, api.fmt(22));

const browser = { window: {} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../js/governor-view.js'), 'utf8'), browser);
assert.equal(browser.window.GovernorView.create(G, api, '/art/').levelName('gear', null), 'inconnu');
console.log('Governor view: unknown/zero levels, tier and star formatting, 10 translations, explicit art bases, cards and gems and live locale changes pass.');
