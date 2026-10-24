// Upgrade priority: stages, Town Centre blockers, core heroes, and gear and governor picks that
// come from the same planners the gear and governor pages use. Then page wiring and dictionaries.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const P = require('../js/upgrade-priority.js'), Ledger = require('../js/player-ledger.js'), H = require('../js/hero-gear-engine.js'), G = require('../js/governor-engine.js');
const rules = require('../_data/upgrade_priority.json');
const storage = { getItem(k) { return this[k] ?? null; }, setItem(k, v) { this[k] = v; } };
const store = Ledger.create(storage);
const kinds = result => result.actions.map(a => a.kind);
const find = (result, kind) => result.actions.find(a => a.kind === kind);

// Stages follow the Town Centre ladder; hero gear opens at TC 15.
assert.equal(P.stageAt('14').id, 'foundation');
assert.equal(P.stageAt('15').id, 'gear');
assert.equal(P.stageAt('22').id, 'governor');
assert.equal(P.stageAt('30').id, 'truegold');
assert.equal(P.stageAt('TG 5').id, 'tempered');
assert.equal(rules.unlocks.heroGear, '15');

// Empty save: the Town Centre is asked for first, and nothing is guessed.
let result = P.evaluate(store.snapshot());
assert.equal(result.townCenter, null);
assert.equal(result.actions[0].kind, 'record');
assert.equal(result.actions[0].params.what, 'town-center');
assert.equal(result.role, 'joiner');
assert.equal(result.roleSaved, null);

// TC 24: the Embassy and Barracks block TC 25 and come first; the same building never shows twice.
store.setBuildings({ 'town-center': '24', embassy: '23', barracks: '22' });
store.setHero('jabel', { level: 60, stars: 10, widget: 2, skills: null });
store.setHero('amadeus', { level: 60, stars: 12, widget: 2, skills: null });
store.setHero('saul', { level: 60, stars: 8, widget: 0, skills: null });
store.setBalance('mythic-hero-shard', 200);
result = P.evaluate(store.snapshot());
assert.equal(result.stage, 'governor');
assert.deepEqual(result.actions.slice(0, 2).map(a => [a.kind, a.params.building, a.params.from, a.params.level]), [['tc-blocker', 'embassy', '23', '24'], ['tc-blocker', 'barracks', '22', '24']]);
assert.equal(result.actions.filter(a => a.params.building === 'barracks').length, 1);
assert.ok(!kinds(result).includes('tc-next'), 'no Town Centre step while it is blocked');

// Heroes: shards go to one core hero per troop type, never spread across the roster.
const core = P.core(store.snapshot());
assert.deepEqual(Object.keys(core).sort(), ['arc', 'cav', 'inf'].filter(t => core[t]).sort());
result.actions.filter(a => a.kind === 'hero-stars' || a.kind === 'hero-widget').forEach(a => assert.ok(Object.values(core).some(c => c && c.hero.name === a.params.hero), a.params.hero + ' is a core hero'));

// Governor: untracked asks to record; known levels without materials ask for the materials.
assert.equal(find(result, 'record') && result.actions.some(a => a.kind === 'record' && a.params.what === 'governor'), true);
store.setGovernor('gear', { 'inf-1': 30, 'inf-2': 30, 'cav-1': 30, 'cav-2': 30, 'arc-1': 30, 'arc-2': 30 });
result = P.evaluate(store.snapshot());
assert.ok(result.actions.some(a => a.kind === 'record' && a.params.what === 'governor-materials'));
assert.ok(!kinds(result).includes('governor-gear'));

// With materials, the step is Governor.plan's first step with the saved goal, not "keep level".
const bag = { satin: 800000, 'gilded-threads': 8000, 'artisans-vision': 2000 };
Object.entries(bag).forEach(([id, n]) => store.setBalance(id, n));
result = P.evaluate(store.snapshot());
const state = Object.fromEntries(G.items('gear').map(i => [i.id, 30]));
let plan = G.plan('gear', state, bag, { goal: 'stats', focus: 'all', limit: 60 });
let gov = find(result, 'governor-gear');
assert.ok(plan.steps.length > 0);
assert.deepEqual([gov.params.id, gov.params.from, gov.params.to, gov.params.steps, gov.params.goal], [plan.steps[0].id, plan.steps[0].from, plan.steps[0].to, plan.steps.length, 'stats']);
store.setGovernorPreference('goal', 'score');
plan = G.plan('gear', state, bag, { goal: 'score', focus: 'all', limit: 60 });
gov = find(P.evaluate(store.snapshot()), 'governor-gear');
assert.deepEqual([gov.params.id, gov.params.to, gov.params.goal], [plan.steps[0].id, plan.steps[0].to, 'score']);
store.setGovernorPreference('goal', 'stats');

// Hero gear: the next step is the gear page's red-plan route for the saved build profile.
const gear = H.defaults();
Object.keys(gear.pieces).forEach(k => { gear.pieces[k] = { quality: 'mythic', level: 100, mastery: 10 }; });
store.writeHeroGear(gear, H, { all: true });
[['hero-gear-xp', 60000], ['forgehammer', 500], ['spare-mythic-gear', 6], ['mithril', 10]].forEach(([id, n]) => store.setBalance(id, n));
result = P.evaluate(store.snapshot());
const next = find(result, 'gear-next');
const expected = H.normaliseState(Object.assign(H.defaults(), store.snapshot().preferences.heroGear || {}));
Object.keys(expected.pieces).forEach(k => { expected.pieces[k] = H.normalisePiece(store.snapshot().heroGear.pieces[k]); });
Object.assign(expected.resources, { xp: 60000, hammers: 500, mythic: 6, mithril: 10 });
const route = H.redPlans(expected).routes[0];
assert.ok(next && route);
assert.equal(next.params.id, route.id);
assert.equal(next.params.level, route.to.level);
assert.equal(next.params.profile, expected.profile);
next.params.short.forEach(s => assert.equal(s.amount, route.gap[s.id]));

// Truegold lead: a troop building a whole tier behind, the War Academy towards T11, the role saved.
store.setBuildings({ 'town-center': 'TG 5', embassy: 'TG 5', academy: '30', barracks: 'TG 3', range: 'TG 5', stable: 'TG 5', 'command-center': 'TG 2', 'war-academy': 'TG 2' });
store.setPriorityRole('lead');
result = P.evaluate(store.snapshot());
assert.deepEqual([result.stage, result.role, result.roleSaved], ['tempered', 'lead', 'lead']);
assert.equal(result.actions[0].params.building, 'barracks', 'the Barracks blocks TG 6 and lags a tier');
assert.ok(result.actions.some(a => a.kind === 'war-academy' && a.params.level === 'TG 5'));
assert.ok(result.actions.some(a => a.kind === 'command-center'));
store.setPriorityRole('farm');
result = P.evaluate(store.snapshot());
assert.ok(!kinds(result).includes('troop-lag') && !kinds(result).includes('command-center'), 'farms skip combat buildings');
assert.equal(find(result, 'research').params.focus, 'economy');

// A preview changes the stage only; weights are sorted high to low.
result = P.evaluate(store.snapshot(), { stage: 'foundation' });
assert.equal(result.stage, 'foundation');
assert.equal(result.own, 'tempered');
for (let i = 1; i < result.actions.length; i++) assert.ok(result.actions[i - 1].weight >= result.actions[i].weight);

// Rules: every weight kind has all stages, every ladder rung names known sources.
const stages = rules.stages.map(s => s.id);
Object.entries(rules.weights).forEach(([kind, row]) => assert.deepEqual(Object.keys(row).sort(), [...stages].sort(), kind));
rules.ladders.forEach(l => l.rungs.forEach(r => r.sources.forEach(s => assert.ok(rules.sources[s], s))));

// Page wiring and dictionaries: every priority key the page or rules use exists in all languages.
const pages = JSON.parse(fs.readFileSync('_data/pages.json', 'utf8'));
const page = (Array.isArray(pages) ? pages : Object.values(pages).flat()).find(p => p && p.token === 'priority');
assert.ok(page, 'priority page registered');
['../js/upgrade-priority.js', '../js/upgrade-priority-page.js', '../js/governor-engine.js', '../js/hero-gear-engine.js'].forEach(s => assert.ok(page.scripts.includes(s), s));
assert.match(fs.readFileSync('_includes/topbar.html', 'utf8'), /upgrade-priority\//);
const dict = lang => { const sandbox = { window: {} }; vm.runInNewContext(fs.readFileSync('i18n/' + lang + '.js', 'utf8'), sandbox); return sandbox.window.__BH_I18N_DATA[lang]; };
const en = dict('en'), keys = Object.keys(en).filter(k => k.startsWith('priority.'));
const used = new Set();
const markup = fs.readFileSync('upgrade-priority/index.html', 'utf8') + fs.readFileSync('js/upgrade-priority-page.js', 'utf8');
for (const m of markup.matchAll(/data-i18n="(priority\.[A-Za-z0-9.-]+)"/g)) used.add(m[1]);
for (const m of fs.readFileSync('js/upgrade-priority-page.js', 'utf8').matchAll(/t(?:pl)?\('([A-Za-z0-9.-]+)'/g)) if (!m[1].endsWith('.')) used.add('priority.' + m[1]);
rules.ladders.forEach(l => { used.add(l.titleKey); l.rungs.forEach(r => used.add(r.key)); });
stages.forEach(s => ['stage.', 'stageNote.'].forEach(p => used.add('priority.' + p + s)));
rules.roles.forEach(r => ['role.', 'roleNote.'].forEach(p => used.add('priority.' + p + r)));
Object.values(rules.research).concat('economy').forEach(f => used.add('priority.a.research.' + f));
['stats', 'score'].forEach(g => used.add('priority.a.govWhy.' + g));
used.forEach(k => assert.ok(en[k], 'missing in en: ' + k));
const placeholders = text => (text.match(/\{\w+\}/g) || []).sort().join();
fs.readdirSync('i18n').filter(f => f.endsWith('.js') && f !== 'en.js').forEach(f => {
  const lang = f.slice(0, -3), d = dict(lang);
  keys.forEach(k => { assert.ok(d[k], lang + ' missing ' + k); assert.equal(placeholders(d[k]), placeholders(en[k]), lang + ' ' + k); });
});

console.log('Upgrade priority stages, blockers, core heroes, gear and governor planner picks, wiring and ' + keys.length + ' keys in every language checked.');
