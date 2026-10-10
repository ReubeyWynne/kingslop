const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const data = require('../_data/governor.json');
const G = require('../js/governor-engine.js');
const Ledger = require('../js/player-ledger.js');

// Data: sourced, monotonic, and agreeing with the cross-checked totals.
assert.equal(data.gear.levels.length, 58);
assert.equal(data.charms.levels.length, 22);
assert.equal(data.gear.pieces.length, 6);
assert.equal(data.charms.slots.length, 18);
for (const kind of ['gear', 'charms']) {
  const levels = data[kind].levels;
  levels.forEach((row, i) => {
    assert.ok(row.sources.length >= 1 && row.sources.every(s => data.sources[s] && data.sources[s][kind]), kind + ' ' + i);
    for (const id of data[kind].materials) assert.ok(Number.isSafeInteger(row.cost[id]) && row.cost[id] >= 0, kind + ' ' + i + ' ' + id);
    if (i) assert.ok(row.stat > levels[i - 1].stat, kind + ' stat rises at ' + i);
    if (i && row.score !== null && levels[i - 1].score !== null) assert.ok(row.score > levels[i - 1].score, kind + ' score rises at ' + i);
  });
}
// Only the last gear step (Red T6 3★) rests on one table; charm level 22 is in three.
assert.deepEqual(data.gear.levels.map((row, i) => row.sources.length < 2 ? i + 1 : 0).filter(Boolean), [58]);
assert.ok(data.charms.levels.every(row => row.sources.length >= 2));
assert.deepEqual(G.cost('gear', 0, 57), { satin: 9348500, 'gilded-threads': 93490, 'artisans-vision': 19045 });
assert.deepEqual(G.cost('charms', 0, 21), { 'charm-guide': 9775, 'charm-design': 16800 });
assert.deepEqual(G.cost('charms', 0, 11), { 'charm-guide': 2025, 'charm-design': 2700 });
assert.deepEqual(data.gear.levels[4].cost, { satin: 1000, 'gilded-threads': 10, 'artisans-vision': 45 });
assert.deepEqual(G.describe('gear', 58), { index: 58, tier: 'red', grade: 6, stars: 3 });
assert.equal(G.stat('gear', 1), 9.35);
assert.equal(G.stat('charms', 22), 99);
assert.throws(() => G.cost('gear', 0, 59));

// Plans: affordable, ordered, explainable, and never touching unset items.
const gear = { 'inf-1': 0, 'inf-2': 0, 'cav-1': 0, 'cav-2': 0, 'arc-1': 0, 'arc-2': null };
const bag = { satin: 20000, 'gilded-threads': 200, 'artisans-vision': 0 };
const plan = G.plan('gear', gear, bag);
assert.ok(plan.steps.length > 0);
assert.ok(plan.steps.every(step => step.id !== 'arc-2'));
for (const id of Object.keys(bag)) { assert.equal(plan.spent[id] + plan.left[id], bag[id]); assert.ok(plan.left[id] >= 0); }
assert.deepEqual(plan.steps.slice(0, 5).map(s => s.id), ['inf-1', 'inf-2', 'cav-1', 'cav-2', 'arc-1']);
assert.equal(plan.score, plan.steps.reduce((sum, step) => sum + step.score, 0));
assert.deepEqual(G.plan('gear', gear, bag, { focus: 'cav' }).steps.map(s => s.troop).filter(t => t !== 'cav'), []);
assert.equal(G.plan('gear', gear, { satin: 0, 'gilded-threads': 0, 'artisans-vision': 0 }).steps.length, 0);
assert.equal(G.plan('charms', {}, { 'charm-guide': 1e6, 'charm-design': 1e6 }).steps.length, 0);
const charms = Object.fromEntries(data.charms.slots.map(s => [s.id, 0]));
const scored = G.plan('charms', charms, { 'charm-guide': 500, 'charm-design': 500 }, { goal: 'score' });
assert.ok(scored.steps.every(step => step.score > 0));
const maxed = Object.fromEntries(data.charms.slots.map(s => [s.id, 22]));
assert.equal(G.plan('charms', maxed, { 'charm-guide': 1e9, 'charm-design': 1e9 }).steps.length, 0);

// Targets: unknowns listed, missing materials only when the bag is known.
const target = G.toTarget('gear', gear, 4, { satin: 1000, 'gilded-threads': null });
assert.deepEqual(target.unknown, ['arc-2']);
assert.deepEqual(target.cost, { satin: 5 * (1500 + 3800 + 7000 + 9700), 'gilded-threads': 5 * (15 + 40 + 70 + 95), 'artisans-vision': 0 });
assert.equal(target.missing.satin, target.cost.satin - 1000);
assert.equal(target.missing['gilded-threads'], null);
assert.equal(G.toTarget('gear', { 'inf-1': 57 }, 58, {}).unverified, true);

// Events: score rows from the shared rules; Brawl gear 22 per score, charm 70 in prep.
assert.deepEqual(G.events('gear', 100).map(e => [e.event, e.day, e.rate]), [['brawl', 5, 22], ['brawl', 6, 22]]);
assert.equal(G.events('charms', 1).length, 11);
assert.ok(G.events('charms', 625).some(e => e.event === 'prep' && e.points === 43750));

// Ledger: governor sections stay unsupported until written, then validate strictly.
function storage(seed = {}) { const v = new Map(Object.entries(seed)); return { getItem: k => v.has(k) ? v.get(k) : null, setItem: (k, x) => v.set(k, x), removeItem: k => v.delete(k) }; }
const disk = storage(), store = Ledger.create(disk);
assert.equal(store.snapshot().governorGear.status, 'unsupported');
assert.equal(store.governor('gear')['inf-1'], null);
store.setGovernor('gear', { 'inf-1': 12, 'cav-2': 0 });
store.setGovernor('charms', { 'arc-2-3': 22 });
assert.equal(Ledger.create(disk).governor('gear')['inf-1'], 12);
assert.equal(store.governor('gear')['cav-2'], 0);
assert.equal(store.governor('charms')['arc-2-3'], 22);
assert.equal(store.snapshot().governorGear.provenance['inf-1'].source, 'manual');
store.setGovernor('gear', { 'cav-2': null });
assert.equal(store.governor('gear')['cav-2'], null);
assert.throws(() => store.setGovernor('gear', { 'inf-1': 59 }));
assert.throws(() => store.setGovernor('gear', { helm: 1 }));
assert.throws(() => store.setGovernor('charms', { 'inf-1-4': 1 }));
store.setGovernorPreference('goal', 'score');
store.setGovernorPreference('gearTarget', 30);
assert.throws(() => store.setGovernorPreference('goal', 'luck'));
assert.throws(() => store.setGovernorPreference('charmTarget', 23));
const saved = store.exportJSON(), copy = Ledger.create(storage());
copy.importJSON(saved);
assert.equal(copy.governor('gear')['inf-1'], 12);
assert.equal(copy.snapshot().preferences.governor.goal, 'score');
for (const mutate of [
  d => { d.governorGear.pieces['inf-1'].level = 70; },
  d => { d.governorGear.pieces['inf-1'].extra = 1; },
  d => { delete d.governorGear.provenance['inf-1']; },
  d => { d.governorCharms.status = 'unsupported'; },
  d => { d.preferences.governor.focus = 'mage'; }
]) { const bad = JSON.parse(saved); mutate(bad); assert.throws(() => copy.importJSON(bad)); }
store.setBalance('satin', 500);
store.resetGovernor();
assert.equal(store.snapshot().governorGear.status, 'unsupported');
assert.equal(store.snapshot().preferences.governor, undefined);
assert.equal(store.balance('satin').amount, 500);

// Page integration: navigation, dictionaries and static fallback copy.
const nav = require('../_data/nav.json'), pages = require('../_data/pages.json');
assert.equal(nav.filter(n => n.self === 'governor').length, 1);
assert.ok(pages.governor.scripts.includes('../js/event-data.js') && pages.governor.scripts.includes('../js/governor-data.js'));
const dictionaries = fs.readdirSync('i18n').filter(f => f.endsWith('.js')).map(file => { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync('i18n/' + file, 'utf8'), ctx); return [file, Object.values(ctx.window.__BH_I18N_DATA)[0]]; });
assert.equal(dictionaries.length, 17);
for (const [file, d] of dictionaries) for (const key of ['gov.nav', 'ev.deck.lede.governor', 'gov.title', 'gov.cardLede', 'gov.kicker']) assert.equal(typeof d[key], 'string', file + ' ' + key);
const en = dictionaries.find(([file]) => file === 'en.js')[1];
const html = fs.readFileSync('governor-gear/index.html', 'utf8');
for (const match of html.matchAll(/data-i18n(?:-key)?="(gov\.[a-zA-Z.]+)"/g)) assert.ok(en[match[1]], match[1]);
for (const material of data.materials) assert.ok(en[material.key], material.key);
const planner = fs.readFileSync('js/governor-planner.js', 'utf8');
for (const match of planner.matchAll(/^\s+'?([a-zA-Z.]+)'?: '/gm)) if (en['gov.' + match[1]] !== undefined) assert.ok(en['gov.' + match[1]]);
assert.doesNotMatch(planner, /innerHTML/);
console.log('Governor gear: sourced tables, plans, targets, event rates, ledger sections, navigation and dictionaries pass.');
