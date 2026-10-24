// Upgrade goals: each kind's shortfall comes from the planner its own page uses, unknown levels
// ask to be recorded, unknown balances leave the shortfall unknown (never zero), and the page's
// keys exist in every dictionary with matching placeholders.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const Goals = require('../js/upgrade-goals.js'), Ledger = require('../js/player-ledger.js');
const B = require('../js/building-spend.js'), HS = require('../js/hero-spend.js'), H = require('../js/hero-gear-engine.js'), G = require('../js/governor-engine.js'), PP = require('../js/pet-plan.js'), MS = require('../js/master-spend.js');
const rules = require('../_data/upgrade_priority.json');
function storage() { const values = new Map(); return { getItem: k => values.has(k) ? values.get(k) : null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) }; }
const store = Ledger.create(storage());
const one = goal => Goals.evaluate(store.snapshot(), goal);
const need = r => Object.fromEntries(r.lines.map(l => [l.id, l.need]));

// The editor's kinds are the engine's and the ledger's.
assert.deepEqual(rules.goalKinds, Goals.KINDS);
assert.deepEqual(Object.keys(Ledger.GOALS.kinds), Goals.KINDS);
Goals.KINDS.forEach(kind => { assert.ok(Goals.targets(kind).length, kind + ' targets'); Goals.targets(kind).forEach(t => Goals.levels(kind, t.id).forEach(level => assert.ok(Ledger.goal({ kind, target: t.id, level }), kind + ' ' + t.id + ' ' + level))); });

// Nothing recorded: every goal asks for its level, and no line claims a zero.
const goals = [
  { kind: 'building', target: 'town-center', level: 'TG 2' }, { kind: 'hero', target: 'amadeus', level: 24 }, { kind: 'hero-gear', target: 'inf-helm', level: 120 },
  { kind: 'governor-gear', target: 'inf-1', level: 40 }, { kind: 'governor-charm', target: 'cav-2-3', level: 10 }, { kind: 'pet', target: 'gray-wolf', level: 30 }, { kind: 'master', target: 'valora', level: 40 }
];
store.setPriorityGoals(goals);
Goals.all(store.snapshot()).forEach(r => { assert.equal(r.state, 'record', r.goal.kind); assert.deepEqual(r.lines, []); });

// Buildings: the target's own steps and every prerequisite step they name, each paid whole.
store.setBuildings({ 'town-center': '30', embassy: '30', academy: '29', barracks: '30', range: '30', stable: '30' });
let r = one(goals[0]);
const rows = Object.fromEntries(B.BUILDINGS.map(b => [b.id, b.rows]));
const steps = (id, from, to) => rows[id].slice(B.index(id, from) + 1, B.index(id, to) + 1);
const expected = {};
const include = [['town-center', '30', 'TG 2']].concat(r.includes.map(i => [i.building, i.from, i.level]));
include.forEach(([id, from, to]) => steps(id, from, to).forEach(row => Object.entries(row.cost).forEach(([k, n]) => { expected[k] = (expected[k] || 0) + n; })));
assert.deepEqual(need(r), expected);
assert.ok(r.includes.some(i => i.building === 'academy' && i.level === '30'), 'the Academy at 30 gates Truegold Town Centre steps');
// Every prerequisite of every counted step is met by the levels the goal raises things to.
include.forEach(([id, from, to]) => steps(id, from, to).forEach(row => (row.requires || []).forEach(req => {
  const raised = include.find(i => i[0] === req.building), at = raised ? raised[2] : store.snapshot().buildings.levels[req.building];
  assert.ok(B.index(req.building, at) >= B.index(req.building, req.level), id + ' ' + row.id + ' needs ' + req.building + ' ' + req.level);
})));
// Balances: unknown leaves the shortfall unknown, a known balance gives the gap.
assert.equal(r.state, 'unknown');
assert.ok(r.lines.every(l => l.have === null && l.short === null && l.unknown.length === 1));
['bread', 'wood', 'stone', 'iron'].forEach(id => store.setBalance(id, 1e9));
store.setBalance('truegold', 100);
r = one(goals[0]);
assert.equal(r.state, 'short');
assert.equal(r.lines.find(l => l.id === 'truegold').short, expected.truegold - 100);
store.setBalance('truegold', expected.truegold);
assert.equal(one(goals[0]).state, 'ready');
assert.equal(one({ kind: 'building', target: 'town-center', level: '25' }).state, 'met');
// An unrecorded prerequisite is asked for rather than counted as free.
store.setBuilding('academy', null);
r = one(goals[0]);
assert.ok(r.record.includes('academy'));
assert.notEqual(r.state, 'ready');
store.setBuilding('academy', '29');
// Past TG 8 no cost is published: the goal says so and is never ready.
store.setBuildings({ 'town-center': 'TG 8', embassy: 'TG 8', academy: 'TG 8', barracks: 'TG 8', range: 'TG 8', stable: 'TG 8', 'command-center': 'TG 8', infirmary: 'TG 8', 'war-academy': 'TG 8' });
['truegold', 'tempered-truegold'].forEach(id => store.setBalance(id, 1e9));
r = one({ kind: 'building', target: 'town-center', level: 'TG 10' });
assert.ok(r.beyond);
assert.notEqual(r.state, 'ready');
store.setBuildings({ 'town-center': '30', embassy: '30', academy: '29', barracks: '30', range: '30', stable: '30', 'command-center': null, infirmary: null, 'war-academy': null });

// Heroes: HeroSpend's star steps; own shards first, then general shards of the rarity.
store.setHero('amadeus', { level: 60, stars: 12, widget: 0, skills: null });
store.setHero('jabel', { level: 60, stars: 6, widget: 0, skills: null });
const starCost = (from, to) => HS.STAR_STEPS.slice(from, to).reduce((a, b) => a + b, 0);
r = one(goals[1]);
assert.deepEqual([r.state, r.lines[0].need, r.lines[0].unknown], ['unknown', starCost(12, 24), ['hero-shards-amadeus']]);
store.setBalance('hero-shards-amadeus', 100);
store.setBalance('mythic-hero-shard', 9999);
r = one(goals[1]);
assert.equal(r.lines[0].pool, null, 'Amadeus takes only his own shards');
assert.equal(r.lines[0].short, starCost(12, 24) - 100);
const jabel = { kind: 'hero', target: 'jabel', level: 18 };
store.setBalance('hero-shards-jabel', 10);
store.setBalance('mythic-hero-shard', null);
r = one(jabel);
assert.deepEqual([r.lines[0].pool, r.lines[0].have, r.lines[0].unknown], ['mythic-hero-shard', null, ['mythic-hero-shard']], 'general shards are asked for when own shards fall short');
store.setBalance('mythic-hero-shard', 20);
r = one(jabel);
assert.equal(r.lines[0].have, 30);
assert.equal(r.lines[0].short, starCost(6, 18) - 30);
store.setBalance('hero-shards-jabel', 9999);
store.setBalance('mythic-hero-shard', null);
assert.equal(one(jabel).state, 'ready', 'own shards that cover it never wait on the general pool');

// Hero gear: HeroGear.target and HeroGear.cost, including the mastery a red level needs.
const gear = H.defaults();
gear.pieces['inf-helm'] = { quality: 'mythic', level: 100, mastery: 10 };
store.writeHeroGear(gear, H, { piece: 'inf-helm' });
r = one(goals[2]);
const to = H.target(H.normalisePiece(gear.pieces['inf-helm']), 120, 0, false), cost = H.cost(gear.pieces['inf-helm'], to);
assert.deepEqual(need(r), Object.fromEntries(H.RES.filter(k => cost[k] > 0).map(k => [Ledger.ITEMS[k], cost[k]])));
assert.equal(r.mastery, to.mastery);
gear.pieces['inf-gloves'] = { quality: 'epic', level: 60, mastery: 0 };
store.writeHeroGear(gear, H, { piece: 'inf-gloves' });
assert.equal(one({ kind: 'hero-gear', target: 'inf-gloves', level: 100 }).state, 'cap', 'an epic piece stops at 80');

// Governor gear and charms: Governor.cost.
store.setGovernor('gear', { 'inf-1': 30 });
r = one(goals[3]);
assert.deepEqual(need(r), Object.fromEntries(Object.entries(G.cost('gear', 30, 40)).filter(([, n]) => n > 0)));
assert.equal(one(goals[4]).state, 'record', 'an untracked charm asks to be recorded');
store.setGovernor('charms', { 'cav-2-3': 4 });
assert.deepEqual(need(one(goals[4])), Object.fromEntries(Object.entries(G.cost('charms', 4, 10)).filter(([, n]) => n > 0)));

// Pets: PetPlan.cost with the Advance at the target done; past the pet's cap is refused.
store.setPet('gray-wolf', { level: 20, advanced: false });
r = one(goals[5]);
const wolf = PP.find('gray-wolf'), petCost = PP.cost(wolf, { level: 20, advanced: false }, 30);
assert.deepEqual(need(r), Object.fromEntries(PP.KEYS.filter(k => petCost[k] > 0).map(k => [{ petFood: 'pet-food', growthManual: 'growth-manual', nutrientPotion: 'nutrient-potion', promotionMedallion: 'promotion-medallion' }[k], petCost[k]])));
assert.equal(r.advances, 2);
assert.equal(one({ kind: 'pet', target: 'gray-wolf', level: 20 }).state, 'unknown', 'level 20 waits on its Advance');
store.setPet('gray-wolf', { level: 20, advanced: true });
assert.equal(one({ kind: 'pet', target: 'gray-wolf', level: 20 }).state, 'met');
assert.equal(one({ kind: 'pet', target: 'gray-wolf', level: wolf.maxLevel + 10 }).state, 'cap');

// Masters: the emblems every class on the way costs; own first, then general.
store.setMaster('valora', { affinity: 29, ready: true, skills: [0, 0, 0, null] });
const valora = MS.find('valora'), emblems = valora.classes.filter(c => c.level > 29 && c.level <= 40).reduce((a, c) => a + c.emblems, 0);
r = one(goals[6]);
assert.deepEqual([r.lines[0].need, r.lines[0].pool, r.classes], [emblems, 'general-master-emblem', 2]);
store.setBalance('master-emblems-valora', 5); store.setBalance('general-master-emblem', 100);
assert.equal(one(goals[6]).state, 'ready');

// The editor's starting level is read from the same facts.
assert.equal(Goals.current(store.snapshot(), 'building', 'town-center'), '30');
assert.equal(Goals.current(store.snapshot(), 'pet', 'gray-wolf'), 20);
assert.equal(Goals.current(store.snapshot(), 'governor-charm', 'cav-2-3'), 4);
assert.equal(Goals.current(store.snapshot(), 'master', 'lyra'), null);

// Unknown targets survive in the save but are flagged, so a renamed id can be removed.
assert.equal(one({ kind: 'pet', target: 'unicorn', level: 10 }).state, 'gone');

// Goal lists round-trip through export and import.
const copy = Ledger.create(storage());
copy.importJSON(store.exportJSON());
assert.deepEqual(copy.priority().goals, goals);

// Page wiring and dictionaries.
const pages = JSON.parse(fs.readFileSync('_data/pages.json', 'utf8'));
const page = Object.values(pages).find(p => p && p.token === 'priority');
['../js/building-spend.js', '../js/pet-plan.js', '../js/upgrade-goals.js', '../js/upgrade-goals-page.js'].forEach(s => assert.ok(page.scripts.includes(s), s));
assert.ok(page.scripts.indexOf('../js/upgrade-goals.js') > page.scripts.indexOf('../js/pet-plan.js'));
const markup = fs.readFileSync('upgrade-priority/index.html', 'utf8'), script = fs.readFileSync('js/upgrade-goals-page.js', 'utf8');
assert.match(markup, /data-module="upgrade-goals"/);
const dict = lang => { const sandbox = { window: {} }; vm.runInNewContext(fs.readFileSync('i18n/' + lang + '.js', 'utf8'), sandbox); return sandbox.window.__BH_I18N_DATA[lang]; };
const en = dict('en'), used = new Set();
for (const m of markup.matchAll(/data-i18n="(priority\.goal[A-Za-z0-9.-]*)"/g)) used.add(m[1]);
for (const m of script.matchAll(/(?<![\w.])t(?:pl)?\('([A-Za-z0-9.-]+)'/g)) if (!m[1].endsWith('.')) used.add('priority.' + m[1]);
rules.goalKinds.forEach(k => used.add('priority.goal.kind.' + k));
['met', 'ready', 'short', 'shortSoFar', 'unknown', 'record', 'cap', 'gone'].forEach(s => used.add('priority.goal.state.' + s));
['bread', 'wood', 'stone', 'iron', 'truegold', 'tempered-truegold', 'satin', 'gilded-threads', 'artisans-vision', 'charm-guide', 'charm-design', 'mythic-hero-shard', 'epic-hero-shard', 'rare-hero-shard', 'general-master-emblem']
  .concat(Object.values(Ledger.ITEMS), ['pet-food', 'growth-manual', 'nutrient-potion', 'promotion-medallion']).forEach(id => used.add('priority.item.' + id));
G.data.gear.materials.concat(G.data.charms.materials).forEach(id => assert.ok(used.has('priority.item.' + id), id));
used.forEach(k => assert.ok(en[k], 'missing in en: ' + k));
const placeholders = text => (text.match(/\{\w+\}/g) || []).sort().join();
const keys = Object.keys(en).filter(k => k.startsWith('priority.goal') || k.startsWith('priority.item.'));
fs.readdirSync('i18n').filter(f => f.endsWith('.js') && f !== 'en.js').forEach(f => {
  const lang = f.slice(0, -3), d = dict(lang);
  keys.forEach(k => { assert.ok(d[k], lang + ' missing ' + k); assert.equal(placeholders(d[k]), placeholders(en[k]), lang + ' ' + k); });
});

console.log('Upgrade goals for buildings, heroes, hero gear, governor gear and charms, pets and masters, unknowns, export and ' + keys.length + ' keys in every language checked.');
