// Building requirements: the generated paths, the planner, links and page wiring.
// Run: node .dsh/building-paths-check.cjs
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const E = require(path.join(root, 'js/building-paths.js'));
const D = JSON.parse(fs.readFileSync(path.join(root, '_data/building_paths.json'), 'utf8'));

// Data: 20 buildings, every prerequisite names a known building and one of its levels.
assert.equal(D.buildings.length, 20);
for (const b of D.buildings) for (const l of b.levels) for (const need of l.needs || []) {
  const k = E.key(need), target = E.building(D, k);
  assert.ok(target, b.id + ' ' + l.id + ' names ' + k);
  if (!target.single) assert.ok(E.levels(D, k).includes(need[1]), b.id + ' ' + l.id + ' needs ' + k + ' ' + need[1]);
}
// The planner table is a subset: every planner cost cell matches the full path.
const planner = JSON.parse(fs.readFileSync(path.join(root, '_data/buildings.json'), 'utf8'));
for (const b of planner.buildings) for (const l of b.levels) if (l.cost) for (const [r, v] of Object.entries(l.cost)) {
  assert.equal(D.buildings.find(x => x.id === b.id).levels.find(x => x.id === l.id).cost[r], v, b.id + ' ' + l.id + ' ' + r);
}

// Ranks follow the game's order.
assert.deepEqual(['0', '1', '30', '30-1', '30-4', 'TG 1', 'TG1-1', 'TG 2', 'TG 10'].map(E.rank), [0, 1, 30, 31, 34, 35, 36, 40, 80]);

// The question that started it: Town Center 2 → 3 needs House 1 at 2.
let p = E.plan(D, { building: 'town-center', level: '3' }, { 'town-center': '2', 'house-1': '1' });
assert.equal(p.state, 'plan');
assert.deepEqual(p.runs.map(r => [r.building, r.from, r.level]), [['house-1', '1', '2'], ['town-center', '2', '3']]);
assert.deepEqual(p.total.cost, { wood: 35 + 805 });
assert.equal(p.total.unverified.wood, true, 'House costs are one source');

// A known level ends that building's part; the goal building's level defaults to the one below.
p = E.plan(D, { building: 'town-center', level: '15' }, { embassy: '14', stable: '14' });
assert.deepEqual(p.runs.map(r => r.building), ['town-center']);
assert.equal(p.current['town-center'], '14');
assert.ok(!p.assumed.embassy && p.assumed.barracks);

// Unknown prerequisites are assumed at the least the city holds, so they never inflate the plan
// past what the goal's own path implies; a given level wins over the assumption.
p = E.plan(D, { building: 'town-center', level: 'TG 2' }, { 'town-center': 'TG1-4' });
assert.deepEqual(p.runs.map(r => r.building), ['town-center']);
p = E.plan(D, { building: 'town-center', level: 'TG 2' }, { 'town-center': 'TG1-4', embassy: '30' });
assert.deepEqual(p.runs.map(r => r.building), ['embassy', 'town-center']);
assert.equal(p.runs[0].level, 'TG 1');

// Prerequisites come before the step that needs them, and nothing is left blocked to TG 8.
p = E.plan(D, { building: 'barracks', level: 'TG 8' }, { 'town-center': '30', barracks: '30', embassy: '30', range: '30', stable: '30', academy: '30' });
assert.equal(p.state, 'plan');
const at = Object.assign({}, p.current);
for (const s of p.steps) { for (const n of s.step.needs || []) assert.ok(E.rank(at[E.key(n)]) >= E.rank(n[1]), s.building + ' ' + s.level + ' before ' + E.key(n)); at[s.building] = s.level; }
assert.equal(at.barracks, 'TG 8');

// Met goals, speed, links.
assert.equal(E.plan(D, { building: 'academy', level: '5' }, { academy: '9' }).state, 'met');
assert.equal(E.atSpeed(3600, 100), 1800);
const state = { building: 'town-center', level: 'TG 2', have: { 'house-1': '2', embassy: 'TG1-2' }, speed: 42.5 };
const query = E.encode(state);
assert.equal(query, 'b=town-center&to=TG2&have=embassy:TG1-2,house-1:2&speed=42.5');
const back = E.decode(D, '?' + query);
assert.deepEqual({ building: back.building, level: back.level, have: back.have, speed: back.speed }, state);
assert.deepEqual(E.decode(D, '?b=nope&to=3&have=embassy:99,house-1:2&speed=-4'), { have: { 'house-1': '2' }, speed: null });
assert.equal(E.decode(D, '?b=town-center').have, null);

// Page wiring and dictionaries.
const page = fs.readFileSync(path.join(root, 'buildings/index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'js/building-paths-page.js'), 'utf8');
const pages = JSON.parse(fs.readFileSync(path.join(root, '_data/pages.json'), 'utf8'));
assert.ok(pages.buildings.scripts.indexOf('../js/building-paths-page.js') > pages.buildings.scripts.indexOf('../js/building-paths.js'));
assert.ok(!pages.home.scripts.some(s => s.includes('building-paths')), 'home never loads the paths');
for (const target of script.matchAll(/one\('(\w+)'\)/g)) assert.ok(page.includes('building-paths.' + target[1] + '"'), 'target ' + target[1]);
const keys = new Set([...page.matchAll(/data-i18n(?:-html)?="(reqs\.[\w.]+)"/g)].map(m => m[1]).concat(
  [...script.matchAll(/t\('(\w+)'/g)].map(m => 'reqs.' + m[1]),
  [...D.buildings.map(b => 'town.building.' + b.id), ...D.single.map(id => 'town.building.' + id)]));
const en = {};
for (const file of fs.readdirSync(path.join(root, 'i18n')).filter(f => f.endsWith('.js')).sort((a, b) => (b === 'en.js') - (a === 'en.js'))) {
  const window = {}; new Function('window', fs.readFileSync(path.join(root, 'i18n', file), 'utf8'))(window);
  const dict = Object.values(window.__BH_I18N_DATA)[0];
  if (file === 'en.js') Object.assign(en, dict);
  for (const key of keys) {
    assert.ok(dict[key], file + ' ' + key);
    for (const token of (en[key] || dict[key]).match(/\{\w+\}/g) || []) assert.ok(dict[key].includes(token), file + ' ' + key + ' ' + token);
  }
}
console.log('building paths ok:', D.buildings.reduce((n, b) => n + b.levels.length, 0), 'levels,', keys.size, 'keys');
