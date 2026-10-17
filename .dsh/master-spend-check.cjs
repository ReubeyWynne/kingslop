// Masters: canonical data, art, the shared ledger section, the spending plan, Town Centre totals and page wiring.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const data = require('../_data/masters.json'), Ledger = require('../js/player-ledger.js'), S = require('../js/master-spend.js');
const T = require('../js/town-centre-engine.js'), rules = require('../js/event-rules.js'), pages = require('../_data/pages.json'), nav = require('../_data/nav.json');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function storage(seed = {}) { const values = new Map(Object.entries(seed)); return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; }
const sum = list => list.reduce((total, n) => total + n, 0);
const confirmed = amount => ({ amount, status: 'confirmed', provenance: null });

// Data: eight masters in unlock order, complete ladders and skills, totals that add up.
const ids = ['valora', 'pan', 'roman', 'cassia', 'guinevere', 'wilson', 'aena', 'isnor'];
assert.deepEqual(data.masters.map(m => m.id), ids);
assert.deepEqual([...new Set(data.masters.map(m => m.unlockDay))], [113, 155, 197, 281]);
for (const m of data.masters) {
  assert.equal(m.affinity.toNext.length, 101, m.id); assert.equal(m.affinity.percent.length, 101, m.id);
  assert.deepEqual(m.affinity.classes.map(c => c.level), [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], m.id);
  assert.equal(m.affinity.classes[0].emblems, 0, m.id);
  assert.equal(m.emblemsToMax, sum(m.affinity.classes.map(c => c.emblems)), m.id);
  assert.equal(m.talent.levels.length, 11, m.id);
  assert.equal(m.skills.length, 4, m.id);
  for (const skill of m.skills) {
    assert.equal(skill.levels.length, skill.max, m.id + ' ' + skill.name);
    assert.equal(skill.manuscripts, sum(skill.levels.map(l => l.manuscripts)), m.id + ' ' + skill.name);
    assert(skill.levels[0].requires && Number.isInteger(skill.levels[0].requires.affinity), m.id + ' ' + skill.name + ' unlock');
  }
  assert.equal(m.verified, m.sources.length >= 2, m.id);
  assert(['infantry', 'cavalry', 'archery', 'all'].includes(m.focus), m.id);
  for (const file of [m.id + '.webp', 'emblem-' + m.id + '.webp', 'talent-' + m.id + '.webp', ...[1, 2, 3, 4].map(n => 'skills/' + m.id + '-' + n + '.webp')]) assert(fs.existsSync(path.join(__dirname, '..', 'img/masters', file)), file);
}
assert.deepEqual(data.masters.filter(m => !m.verified).map(m => m.id), ['aena', 'isnor']);
// Every master says what it is for, and every talent and skill has a plain sentence with its values filled in.
for (const m of data.masters) {
  for (const text of [m.scope, m.summary, m.who, m.talent.say, m.talent.ramp, ...m.skills.flatMap(s => [s.where, s.say, s.ramp])]) assert(typeof text === 'string' && text.length > 1 && !/[{}]/.test(text), m.id + ': ' + text);
  m.skills.forEach(s => s.levels.at(-1).effects.forEach(e => assert(s.say.includes(e.value.toLocaleString('en-US') + (e.percent ? '%' : '')), m.id + ' ' + s.name + ' names ' + e.stat)));
}
assert(!JSON.stringify(data).includes('specialResearch'), 'Special Research stays out until its emblem cost is confirmed');

// Ledger: a typed masters section; ready only at a class gate.
const store = Ledger.create(storage());
store.setMaster('valora', { affinity: 29, ready: true, skills: [3, 2, 0, null] });
assert.deepEqual(store.masters().roster.valora, { affinity: 29, ready: true, skills: [3, 2, 0, null] });
store.setMaster('valora', { affinity: 30, ready: true, skills: [3, 2, 0, null] });
assert.equal(store.masters().roster.valora.ready, false);
store.setMaster('pan', {});
assert.deepEqual(store.masters().roster.pan, { affinity: null, ready: false, skills: [null, null, null, null] });
for (const bad of [{ affinity: 101 }, { affinity: 2.5 }, { skills: [1, 2, 3] }, { skills: [21, 0, 0, 0] }, { ready: 'yes' }, { power: 1 }]) assert.throws(() => store.setMaster('roman', bad), JSON.stringify(bad));
store.setBalance(Ledger.masterEmblemId('valora'), 12);
assert.deepEqual(store.masters().emblems, { valora: 12 });
store.setMaster('pan', null);
assert.equal(store.masters().roster.pan, undefined);
assert.throws(() => Ledger.create(storage()).importJSON(JSON.stringify(Object.assign(Ledger.empty(), { masters: { roster: { valora: { affinity: 9, ready: true, skills: [0, 0, 0, 0], extra: 1 } }, provenance: {} } }))));

// Plan: nothing recorded is unknown, not zero.
function snapshot(roster, bag) { const s = Ledger.empty(); s.masters = { roster, provenance: {} }; for (const id of Object.keys(bag)) s.inventory[id] = confirmed(bag[id]); return s; }
let plan = S.plan(Ledger.empty());
assert.deepEqual(plan.unknown, ['masters']); assert.equal(plan.items[S.EMBLEM].amount, 0); assert.equal(plan.items[S.MANUSCRIPT].amount, 0);

// Emblems pay one class per full bar: own emblems first, then general ones.
plan = S.plan(snapshot({ valora: { affinity: 29, ready: true, skills: [0, 0, 0, 0] } }, { 'master-emblems-valora': 10, 'general-master-emblem': 10, 'masters-manuscript': 0 }));
assert.deepEqual(plan.masters.valora.emblems, { from: 29, to: 30, className: 'Acquaintance 3', cost: 15, spend: 15, own: 10, ownUsed: 10, general: 5 });
assert.equal(plan.items[S.EMBLEM].amount, 15); assert.equal(plan.items[S.EMBLEM].left, 5); assert.deepEqual(plan.unknown, []);
// Too few emblems for the whole class: nothing scores, nothing is used.
plan = S.plan(snapshot({ valora: { affinity: 29, ready: true, skills: [0, 0, 0, 0] } }, { 'master-emblems-valora': 4, 'general-master-emblem': 10, 'masters-manuscript': 0 }));
assert.equal(plan.masters.valora.emblems.spend, 0); assert.equal(plan.items[S.EMBLEM].left, 10);
// A bar that is not full takes no emblems, so they do not score.
plan = S.plan(snapshot({ valora: { affinity: 25, ready: false, skills: [0, 0, 0, 0] } }, { 'master-emblems-valora': 500, 'general-master-emblem': 500, 'masters-manuscript': 0 }));
assert.equal(plan.masters.valora.emblems, null); assert.equal(plan.items[S.EMBLEM].amount, 0);
// Two waiting masters share the general emblems; the plan never spends more than it has.
plan = S.plan(snapshot({ valora: { affinity: 99, ready: true, skills: [0, 0, 0, 0] }, cassia: { affinity: 49, ready: true, skills: [0, 0, 0, 0] } }, { 'master-emblems-valora': 0, 'master-emblems-cassia': 0, 'general-master-emblem': 200, 'masters-manuscript': 0 }));
assert.equal(plan.masters.valora.emblems.spend + plan.masters.cassia.emblems.spend, plan.items[S.EMBLEM].amount);
assert(plan.items[S.EMBLEM].used <= 200); assert.equal(plan.items[S.EMBLEM].left, 200 - plan.items[S.EMBLEM].used);
assert.equal(plan.items[S.EMBLEM].amount, 160, 'cassia 160 fits, valora 50 alone would score less');
// Unknown own emblems and general emblems are listed.
plan = S.plan(snapshot({ valora: { affinity: 9, ready: true, skills: [0, 0, 0, 0] } }, { 'masters-manuscript': 0 }));
assert.deepEqual(plan.unknown.sort(), ['general-master-emblem', 'master-emblems-valora']);

// Manuscripts: whole steps, cheapest first, gated by affinity and skill totals.
const valora = data.masters[0];
plan = S.plan(snapshot({ valora: { affinity: 29, ready: false, skills: [0, 0, 0, 0] } }, { 'masters-manuscript': 1e6 }));
const opened = plan.masters.valora.manuscripts.to;
valora.skills.forEach((skill, at) => {
  const level = opened[at];
  if (level < skill.max) { const need = skill.levels[level].requires; assert(need && (need.affinity > 29 || need.total > sum(opened)), skill.name + ' stopped without a gate'); }
  assert.equal(plan.masters.valora.manuscripts.from[at], 0);
});
assert.equal(opened[2], 0, 'Weapon Obsession opens at affinity 30');
assert.equal(plan.masters.valora.manuscripts.spend, sum(valora.skills.map((skill, at) => sum(skill.levels.slice(0, opened[at]).map(l => l.manuscripts)))));
// The class the emblems pay opens the next skill in the same plan.
plan = S.plan(snapshot({ valora: { affinity: 29, ready: true, skills: [0, 0, 0, 0] } }, { 'master-emblems-valora': 15, 'general-master-emblem': 0, 'masters-manuscript': 1e6 }));
assert(plan.masters.valora.manuscripts.to[2] > 0);
// A small pool buys only whole steps.
plan = S.plan(snapshot({ valora: { affinity: 29, ready: false, skills: [0, 0, 0, 0] } }, { 'masters-manuscript': 7 }));
assert(plan.items[S.MANUSCRIPT].amount <= 7); assert.equal(plan.items[S.MANUSCRIPT].left, 7 - plan.items[S.MANUSCRIPT].amount);
// Unread skill levels leave that master's manuscripts out.
plan = S.plan(snapshot({ valora: { affinity: 29, ready: false, skills: [1, null, 0, 0] } }, { 'masters-manuscript': 100 }));
assert.equal(plan.masters.valora.manuscripts, null); assert.deepEqual(plan.unknown, ['master-skills-valora']);
assert.deepEqual(S.missing('master-skills-valora'), { kind: 'skills', master: S.find('valora') });
assert.deepEqual(S.missing('masters'), { kind: 'masters', master: null });
assert.equal(S.missing('hero-shards-amadeus'), null);

// Points use the event rules' best day; the Town Centre scores the same spendable pieces.
const ready = snapshot({ valora: { affinity: 29, ready: true, skills: [3, 2, 0, 0] } }, { 'master-emblems-valora': 10, 'general-master-emblem': 100, 'masters-manuscript': 1000 });
plan = S.plan(ready);
const points = S.points(rules, 'prep', plan.masters.valora);
assert.equal(points.emblems, 15 * 6000); assert.equal(points.manuscripts, plan.masters.valora.manuscripts.spend * 60);
const best = T.best(ready, 'prep'), lines = Object.fromEntries(best.lines.filter(l => /^master/.test(l.id)).map(l => [l.id, l]));
assert.equal(lines['master-emblem'].kind, 'usable'); assert.equal(lines['master-emblem'].points, points.emblems);
assert.equal(lines['masters-manuscript'].points, points.manuscripts);
assert.equal(T.best(ready, 'brawl').lines.find(l => l.id === 'master-emblem').points, 15 * 3600);
assert.equal(T.topRate('general-master-emblem').rate, 6000);
assert(T.best(Ledger.empty(), 'prep').unknown.includes('masters'));
// A raw master-emblem balance no longer scores on its own: only what masters can take.
const raw = Ledger.empty(); raw.inventory['master-emblem'] = confirmed(1000);
assert(!T.best(raw, 'prep').lines.some(l => l.id === 'master-emblem' && l.points > 0));

// Wiring: the Masters page, its place in the ring, the Town Centre shelf, translations.
const at = nav.findIndex(n => n.self === 'masters');
assert.equal(nav[at - 1].self, 'heroes'); assert.equal(nav[at + 1].self, 'gear');
assert.equal(pages.masters.swipePrev.page, 'heroes'); assert.equal(pages.masters.swipeNext.page, 'gear');
assert.equal(pages.heroes.swipeNext.page, 'masters'); assert.equal(pages.gear.swipePrev.page, 'masters');
for (const page of ['masters', 'town']) {
  const scripts = pages[page].scripts.map(s => s.replace('../js/', ''));
  for (const need of ['hero-spend.js', 'master-data.js', 'master-spend.js', 'master-directory.js']) assert(scripts.includes(need), page + ' loads ' + need);
  assert(scripts.indexOf('master-spend.js') > scripts.indexOf('master-data.js') && scripts.indexOf('master-spend.js') > scripts.indexOf('hero-spend.js'), page + ' script order');
  assert(pages[page].css.includes('../css/masters.css'), page + ' css');
}
const town = pages.town.scripts.map(s => s.replace('../js/', ''));
assert(town.indexOf('master-spend.js') < town.indexOf('town-centre-engine.js'));
assert(town.indexOf('master-points.js') < town.indexOf('town-centre.js'));
const townPage = read('town-centre/index.html');
assert.match(townPage, /aria-controls="town-masters"/); assert.match(townPage, /id="town-masters"[^>]*data-shelf="masters"/);
assert.match(townPage, /data-module="master-directory">\s*{% include masters\/roster.html bag="off" %}/);
assert.match(townPage, /data-count="general-master-emblem"/);
assert.match(townPage, /item.id == "master-emblem" %}{% continue %}/);
const sources = ['masters/index.html', '_includes/masters/roster.html', 'town-centre/index.html', 'index.html'].map(read).join('\n');
const keys = [...sources.matchAll(/data-i18n(?:-key)?="([^"{]+)"/g)].map(m => m[1]).filter(k => /^(masters|masterPoints|town\.(shelf\.masters|mastersNote|planMasters))/.test(k));
const window = {}; new Function('window', read('i18n/en.js'))(window); const en = window.__BH_I18N_DATA.en;
for (const key of new Set(keys)) assert(Object.hasOwn(en, key), 'en.js lacks ' + key);
for (const focus of ['infantry', 'cavalry', 'archery', 'all']) assert(Object.hasOwn(en, 'masters.focus.' + focus), focus);
for (const file of fs.readdirSync(path.join(__dirname, '../i18n')).filter(f => f.endsWith('.js'))) {
  const text = read('i18n/' + file);
  for (const key of ['masters.nav', 'ev.deck.lede.masters', 'masters.title', 'masters.cardLede', 'masters.kicker', 'masters.metaTitle']) assert(text.includes('"' + key + '"'), file + ' lacks ' + key);
}
assert.match(read('masters/index.html'), /masterPoints.research/, 'the page says Special Research is not counted');
for (const m of data.masters) assert.match(read('_includes/masters/roster.html'), /data-deep-link="master-{{ master.id }}"/);

console.log('Masters: data totals, art, ledger section, class gates, shared general emblems, whole-step manuscripts, unknowns, Town Centre totals, navigation and dictionaries pass.');
