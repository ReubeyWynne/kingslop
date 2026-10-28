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
const state = { goals: [{ building: 'town-center', level: 'TG 2' }, { building: 'barracks', level: 'TG 2' }], have: { 'house-1': '2', embassy: 'TG1-2' }, speed: 42.5 };
const query = E.encode(state);
assert.equal(query, 'goal=town-center:TG2,barracks:TG2&have=embassy:TG1-2,house-1:2&speed=42.5');
const back = E.decode(D, '?' + query);
assert.deepEqual({ goals: back.goals, have: back.have, speed: back.speed }, state);
assert.deepEqual(E.decode(D, '?goal=nope:3,town-center:99,embassy:5&have=embassy:99,house-1:2&speed=-4'), { goals: [{ building: 'embassy', level: '5' }], have: { 'house-1': '2' }, speed: null });
assert.equal(E.decode(D, '?goal=town-center:3').have, null);
// The first links carried one goal as b and to; they still open.
assert.deepEqual(E.decode(D, '?b=town-center&to=TG2').goals, [{ building: 'town-center', level: 'TG 2' }]);

// Several goals share their prerequisites: one plan, each step once, every goal reached.
const both = [{ building: 'town-center', level: 'TG 3' }, { building: 'barracks', level: 'TG 3' }];
const city = { 'town-center': 'TG 1', barracks: 'TG 1', embassy: 'TG 1', stable: 'TG 1', range: 'TG 1', academy: '30' };
p = E.plan(D, both, city);
assert.equal(p.state, 'plan');
const reached = Object.assign({}, p.current);
const seen = new Set();
for (const s of p.steps) { const id = s.building + ' ' + s.level; assert.ok(!seen.has(id), 'once: ' + id); seen.add(id); reached[s.building] = s.level; }
assert.equal(reached['town-center'], 'TG 3');
assert.equal(reached.barracks, 'TG 3');
const alone = E.plan(D, both[0], city), other = E.plan(D, both[1], city);
assert.ok(p.total.steps < alone.total.steps + other.total.steps, 'shared prerequisites are counted once');
assert.equal(p.runs[p.runs.length - 1].building, 'barracks', 'the goals come last, in the order given');
// Two goals on one building keep the higher; a met goal drops out of the plan, all met is met.
assert.deepEqual(E.goals(D, [{ building: 'embassy', level: '5' }, { building: 'embassy', level: '9' }]), [{ building: 'embassy', level: '9' }]);
p = E.plan(D, [{ building: 'academy', level: '5' }, { building: 'town-center', level: '12' }], { academy: '9', 'town-center': '11', embassy: '11', 'command-center': '1' });
assert.deepEqual(p.runs.map(r => r.building), ['town-center']);
assert.equal(E.plan(D, [{ building: 'academy', level: '5' }, { building: 'embassy', level: '3' }], { academy: '9', embassy: '8' }).state, 'met');

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
