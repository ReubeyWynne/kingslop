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
// Bear first is the default: equal pieces go to archers first; infantry and cavalry weigh the same.
assert.equal(plan.profile, 'bear');
assert.deepEqual(plan.steps.map(s => s.id), ['arc-1', 'inf-1', 'inf-2', 'cav-1', 'cav-2', 'arc-1', 'arc-1']);
assert.equal(plan.levels['arc-1'], 3); assert.equal(plan.levels['inf-1'], 1);
const even = G.plan('gear', gear, bag, { profile: 'custom', weights: '1:1:1' });
assert.deepEqual(even.steps.slice(0, 5).map(s => s.id), ['inf-1', 'inf-2', 'cav-1', 'cav-2', 'arc-1']);
assert.deepEqual(G.plan('gear', gear, bag, { profile: 'even' }).steps, even.steps, 'an older save\'s even reads as a custom 1:1:1');
assert.deepEqual(G.plan('gear', gear, bag, { profile: 'defence' }).steps, G.plan('gear', gear, bag, { profile: 'custom', weights: '1:0.5:0.7' }).steps, 'an older save\'s defence keeps its weights');
assert.equal(G.plan('gear', gear, bag, { profile: 'custom', weights: '3:1:1' }).steps[0].troop, 'inf');
// Weights multiply each troop's gain. Bear first keeps infantry level with cavalry (owner, 30 Oct).
assert.deepEqual(G.weights({}), { inf: 1, cav: 1, arc: 3 });
assert.deepEqual(G.weights({ profile: 'custom', weights: '0.5:1:10' }), { inf: 0.5, cav: 1, arc: 10 });
assert.equal(G.weights({ profile: 'score' }), null);
for (const bad of ['1:1', '11:1:1', '0.55:1:1', '-1:1:1', '1:1:1:1']) assert.equal(G.parseWeights(bad), null, bad);
const meta = G.plan('gear', gear, { satin: 1e6, 'gilded-threads': 1e4, 'artisans-vision': 1e3 }, { profile: 'custom', weights: '1:0:1', limit: 200 });
assert.ok(meta.steps.length > 0 && meta.steps.every(s => s.troop !== 'cav'), 'a troop at 0 is left where it is');
assert.equal(G.plan('gear', gear, bag, { goal: 'score' }).profile, 'score', 'an older goal of score reads as the score profile');
assert.throws(() => G.plan('gear', gear, bag, { profile: 'whale' }));
assert.deepEqual(G.profiles(), ['bear', 'score', 'custom']);
assert.equal(plan.score, plan.steps.reduce((sum, step) => sum + step.score, 0));
assert.deepEqual(G.plan('gear', gear, bag, { focus: 'cav' }).steps.map(s => s.troop).filter(t => t !== 'cav'), []);
assert.equal(G.plan('gear', gear, { satin: 0, 'gilded-threads': 0, 'artisans-vision': 0 }).steps.length, 0);
assert.equal(G.plan('charms', {}, { 'charm-guide': 1e6, 'charm-design': 1e6 }).steps.length, 0);
const charms = Object.fromEntries(data.charms.slots.map(s => [s.id, 0]));
const scored = G.plan('charms', charms, { 'charm-guide': 500, 'charm-design': 500 }, { profile: 'score' });
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
const archers = G.toTarget('gear', gear, 4, {}, { troop: 'arc' });
assert.deepEqual(archers.unknown, ['arc-2']); assert.equal(archers.steps, 4); assert.equal(archers.levels['arc-1'], 4); assert.equal(archers.levels['inf-1'], 0);

// Events: score rows from the shared rules; Brawl gear 22 per score, charm 70 in prep.
assert.deepEqual(G.events('gear', 100).map(e => [e.event, e.day, e.rate]), [['brawl', 5, 22], ['brawl', 6, 22]]);
assert.equal(G.events('charms', 1).length, 11);
assert.ok(G.events('charms', 625).some(e => e.event === 'prep' && e.points === 43750));
assert.throws(() => G.events('unknown', 100));
assert.ok(G.events('gear', null).every(event => event.points === null));
const eventData = JSON.parse(JSON.stringify(require('../_data/event_rules.json')));
for (const days of Object.values(eventData.events)) for (const day of days) for (const row of day.rows) { row.label = '表示'; row.points = 'presentation'; }
const eventContext = { window: { EventRuleData: eventData, GovernorData: data } };
vm.runInNewContext(fs.readFileSync('js/event-rules.js', 'utf8'), eventContext);
vm.runInNewContext(fs.readFileSync('js/governor-engine.js', 'utf8'), eventContext);
for (const kind of ['gear', 'charms']) assert.deepEqual(JSON.parse(JSON.stringify(eventContext.window.Governor.events(kind, 625))), G.events(kind, 625), kind + ' scores from metadata when labels and display points change');

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
store.setGovernorPreference('weights', '1:0.5:3');
for (const bad of ['1:1', '1:1:1:1', '11:0:0', '60:40:0', 1]) assert.throws(() => store.setGovernorPreference('weights', bad), String(bad));
const saved = store.exportJSON(), copy = Ledger.create(storage());
copy.importJSON(saved);
assert.equal(copy.governor('gear')['inf-1'], 12);
assert.equal(copy.snapshot().preferences.governor.goal, 'score');
assert.equal(copy.snapshot().preferences.governor.weights, '1:0.5:3');
for (const mutate of [
  d => { d.governorGear.pieces['inf-1'].level = 70; },
  d => { d.governorGear.pieces['inf-1'].extra = 1; },
  d => { delete d.governorGear.provenance['inf-1']; },
  d => { d.governorCharms.status = 'unsupported'; },
  d => { d.preferences.governor.focus = 'mage'; },
  d => { d.preferences.governor.weights = '1:1'; }
]) { const bad = JSON.parse(saved); mutate(bad); assert.throws(() => copy.importJSON(bad)); }
store.setBalance('satin', 500);
store.resetGovernor();
assert.equal(store.snapshot().governorGear.status, 'unsupported');
assert.equal(store.snapshot().preferences.governor, undefined);
assert.equal(store.balance('satin').amount, 500);

// Sheet links: 24 characters for the levels, the bag in table order, only choices that differ.
const sheet = { gear: { 'inf-1': 0, 'inf-2': 58, 'cav-1': null, 'cav-2': 9, 'arc-1': 35, 'arc-2': 1 }, charms: { 'inf-1-1': 22, 'cav-2-3': 0 }, bag: { satin: 400000, 'gilded-threads': 0, 'charm-design': 1e9 }, prefs: { profile: 'score', charmTarget: 8 } };
const encoded = G.encodeLink(sheet);
assert.deepEqual(encoded, { gov: '0W.9z1' + 'm' + '.'.repeat(10) + '0' + '.'.repeat(6), bag: '400000.0...1000000000', p: 'score', ct: '8' });
const query = '?' + new URLSearchParams(encoded).toString(), back = G.readLink(query);
assert.equal(back.gear['inf-2'], 58); assert.equal(back.gear['cav-1'], null); assert.equal(back.charms['inf-1-1'], 22); assert.equal(back.charms['cav-2-3'], 0); assert.equal(back.charms['arc-2-3'], null);
assert.deepEqual(back.bag, { satin: 400000, 'gilded-threads': 0, 'artisans-vision': null, 'charm-guide': null, 'charm-design': 1e9 });
assert.deepEqual(back.prefs, { profile: 'score', charmTarget: 8 });
assert.equal(G.encodeLink({ gear: {}, charms: {}, prefs: { goal: 'score' } }).p, 'score', 'an older saved goal of score carries over');
assert.equal(G.encodeLink({ gear: {}, charms: {}, prefs: { profile: 'bear' } }).p, undefined, 'the default profile stays out of the link');
assert.deepEqual(G.encodeLink({ gear: {}, charms: {}, prefs: { profile: 'custom', weights: '1.5:0:3' } }), { gov: '.'.repeat(24), p: 'custom', w: '1.5_0_3' }, 'custom weights travel as w');
assert.equal(G.encodeLink({ gear: {}, charms: {}, prefs: { profile: 'score', weights: '1:0:1' } }).w, undefined, 'a preset leaves custom weights behind');
assert.deepEqual(G.readLink('?gov=' + '.'.repeat(24) + '&p=custom&w=1_0_1').prefs, { profile: 'custom', weights: '1:0:1' });
assert.deepEqual(G.readLink('?gov=' + '.'.repeat(24) + '&p=even').prefs, { profile: 'custom', weights: '1:1:1' }, 'an older even link still opens');
assert.deepEqual(G.readLink('?gov=' + '.'.repeat(24) + '&p=defence').prefs, { profile: 'custom', weights: '1:0.5:0.7' }, 'and an older defence link');
assert.deepEqual(G.encodeLink(back), encoded, 'a link reads back to itself');
assert.equal(G.readLink('?lang=en'), null);
for (const bad of ['?gov=short', '?gov=' + 'X'.repeat(24), '?gov=' + '.'.repeat(6) + 'n' + '.'.repeat(17), '?gov=' + '.'.repeat(24) + '&bag=1.2', '?gov=' + '.'.repeat(24) + '&bag=1000000001....', '?gov=' + '.'.repeat(24) + '&p=whale', '?gov=' + '.'.repeat(24) + '&w=1_1', '?gov=' + '.'.repeat(24) + '&w=11_0_0', '?gov=' + '.'.repeat(24) + '&gt=59'])
  assert.deepEqual(G.readLink(bad), { invalid: true }, bad);

// In-game chat takes 512 UTF-16 units (measured by the owner), so a full sheet's link must fit with room to spare.
const fullest = G.encodeLink({ gear: Object.fromEntries(G.items('gear').map(i => [i.id, 57])), charms: Object.fromEntries(G.items('charms').map(i => [i.id, 21])), bag: Object.fromEntries(G.data.materials.map(m => [m.id, 1e9])), prefs: { profile: 'custom', weights: '9.5:9.5:9.5', gearTarget: 57, charmTarget: 21 } });
const fullestURL = 'https://dey.ci/governor-gear/?' + new URLSearchParams(fullest).toString();
assert.ok(fullestURL.length <= 160, 'a full sheet link stays short: ' + fullestURL.length);

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
// Art: a card for every piece at every tier and grade, a gem for every charm level, an icon per material.
for (const piece of data.gear.pieces) for (const row of data.gear.levels) assert.ok(fs.existsSync(`img/governor/gear/${piece.id}-${row.tier}-${row.grade}.webp`), piece.id + ' ' + row.tier + row.grade);
for (const troop of data.troops) for (let level = 1; level <= data.charms.levels.length; level += 1) assert.ok(fs.existsSync(`img/governor/charms/${troop}-${level}.webp`), troop + ' charm ' + level);
for (const material of data.materials) assert.ok(fs.existsSync(`img/governor/${material.id}.webp`), material.id);
assert.deepEqual(data.gear.pieces.map(p => p.slot), ['armour', 'trousers', 'hat', 'amulet', 'ring', 'staff']);
for (const piece of data.gear.pieces) assert.ok(en['gov.slot.' + piece.slot], piece.slot);
console.log('Governor gear: sourced tables, plans, targets, event rates, ledger sections, navigation and dictionaries pass.');
