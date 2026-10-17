const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const Ledger = require('../js/player-ledger.js');
const stages = require('../_data/kingdom_progression.json').stages;
function fixture(seed = {}) {
  const values = new Map(Object.entries(seed)), events = [], listeners = {};
  const storage = { getItem: k => values.has(k) ? values.get(k) : null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const window = { addEventListener: (k, fn) => { listeners[k] = fn; }, dispatchEvent: () => {} };
  const store = Ledger.create(storage, window);
  window.PlayerLedger = { ...Ledger, shared: () => store };
  const context = { window, localStorage: storage, document: { dispatchEvent: e => events.push(e) }, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } };
  vm.runInNewContext(fs.readFileSync('js/server-age.js', 'utf8'), context);
  return { profile: window.KingdomProgression, age: window.KS_SERVER_AGE, storage, store, events, listeners };
}
const legacy = fixture({ ks_server_age: '{"generation":3}' });
assert.equal(legacy.profile.get().generation, 3);
assert.equal(legacy.profile.get().truegold, null);
assert.equal(legacy.storage.getItem('ks_server_age'), null);
assert.equal(legacy.store.snapshot().preferences.kingdom.generation, 3);
const data = legacy.store.exportJSON();
legacy.store.setBalance('forgehammer', 17);
legacy.store.importJSON(data);
assert.equal(legacy.profile.get().generation, 3);
legacy.age.clear();
assert.equal(legacy.age.getGeneration(), null);
assert.equal(legacy.store.balance('forgehammer').amount, null);
assert.equal(fixture({ ks_server_age: '2' }).age.getGeneration(), 2);
assert.equal(fixture({ ks_server_age: '{bad' }).age.getGeneration(), null);
const f = fixture();
f.store.setBalance('forgehammer', 17);
f.store.setHero('zoe', { level: 80, stars: 27 });
for (const stage of stages) {
  f.profile.set(stage.profile);
  assert.equal(f.age.getGeneration(), stage.profile.generation);
  assert.equal(f.store.balance('forgehammer').amount, 17);
  assert.equal(f.store.heroes().roster.zoe.stars, 27);
}
f.profile.set(stages.find(s => s.id === 'war-academy').profile);
f.age.setGeneration(2);
assert.equal(f.profile.get().warAcademy, true);
assert.equal(f.profile.get().position, null);
assert.equal(f.profile.availability({ generation: 3 }), 'upcoming');
assert.equal(f.profile.availability({ warAcademy: true }), 'available');
f.profile.set(f.profile.blank());
assert.equal(f.profile.availability({ generation: 2 }), 'unknown');
f.age.setGeneration(1);
assert.equal(f.profile.availability({ generation: 2, truegold: 3 }), 'upcoming');
assert.equal(f.profile.availability({ generation: 1, truegold: 3 }), 'unknown');
assert.throws(() => f.profile.availability({ typo: 3 }));
for (const invalid of [{ generation: 0 }, { generation: 1.5 }, { truegold: 6 }, { warAcademy: 'true' }, { position: '<script>' }, { extra: true }]) {
  assert.throws(() => f.store.setKingdom({ ...JSON.parse(JSON.stringify(f.profile.blank())), ...invalid }));
}
const revision = f.store.snapshot().revision;
f.store.setBalance('mithril', 2);
assert.throws(() => f.store.setKingdom(JSON.parse(JSON.stringify(f.profile.blank())), revision));
const external = f.store.snapshot(); external.preferences.kingdom = stages[2].profile;
f.storage.setItem(Ledger.KEY, JSON.stringify(external)); f.listeners.storage({ key: Ledger.KEY });
assert.equal(f.events.at(-1).type, 'ks:kingdom-change');
assert.equal(f.events.at(-1).detail.truegold, 3);
assert.equal(f.events.at(-2).detail.generation, 2);
const blank = Ledger.empty();
f.store.importJSON(blank);
assert.equal(f.age.getGeneration(), null);
const exported = f.store.exportJSON();
const restored = fixture({ [Ledger.KEY]: exported });
assert.equal(restored.age.getGeneration(), null);
const corrupt = fixture({ [Ledger.KEY]: '{bad', ks_server_age: '3' });
assert.equal(corrupt.profile.writable(), false);
assert.throws(() => corrupt.age.setGeneration(2));
assert.equal(corrupt.storage.getItem(Ledger.KEY), '{bad');
assert.equal(corrupt.storage.getItem('ks_server_age'), '3');
const dictionaries = fs.readdirSync('i18n').filter(name => name.endsWith('.js')).map(name => {
  const context = { window: {} }; vm.runInNewContext(fs.readFileSync('i18n/' + name, 'utf8'), context);
  return Object.values(context.window.__BH_I18N_DATA)[0];
});
const keys = Object.keys(dictionaries[0]).filter(key => key.startsWith('kingdom.'));
assert.equal(keys.length, 34);
for (const dictionary of dictionaries) for (const key of keys) assert.equal(typeof dictionary[key], 'string', key);
for (const stage of stages) {
  assert.equal(stage.id, stage.profile.position);
  Ledger.create({ getItem: () => null, setItem: () => {} }).setKingdom(stage.profile);
  if (stage.titleKey) for (const dictionary of dictionaries) assert.equal(typeof dictionary[stage.titleKey], 'string');
  for (const dictionary of dictionaries) assert.equal(typeof dictionary[stage.noteKey], 'string');
}
console.log('Kingdom progression: migration, unknown unlocks, independent corrections, save transfer, revisions and cross-tab events pass.');
