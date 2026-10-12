const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const E = require('../js/hero-gear-engine.js');
const OCR = require('../js/hero-gear-ocr.js');
assert.deepEqual(OCR.overviewLabels([{text:'Lv. 2',poly:[[0,120],[20,120],[20,140],[0,140]]}], 'mythic', 110, [false,true]), {level:0,mastery:2});
assert.deepEqual(OCR.overviewLabels([{text:'69',poly:[[0,10],[20,10],[20,30],[0,30]]}], 'mythic', 110, [true,false]), {level:69,mastery:0});

assert.equal(E.XP.length, 201);
assert.equal(E.CUM[80], 34820);
assert.equal(E.CUM[100], 73320);
assert.equal(E.CUM[120], 125970);
assert.equal(E.CUM[200], 574370);
const mythic = { quality: 'mythic', level: 100, mastery: 10 };
const ascension = E.milestone(mythic, 'red');
assert.deepEqual(E.cost(mythic, ascension), { xp: 0, hammers: 0, mythic: 2, mithril: 0 });
const first = E.milestone(mythic, 'mithril');
assert.deepEqual(first, { quality: 'red', level: 120, mastery: 11 });
assert.deepEqual(E.cost(mythic, first), { xp: 52650, hammers: 110, mythic: 6, mithril: 10 });
assert.deepEqual(E.cost({ quality: 'red', level: 119, mastery: 10 }, first), { xp: 0, hammers: 110, mythic: 4, mithril: 10 });
assert.deepEqual(E.cost(first, E.milestone(first, 'mithril')), { xp: 74100, hammers: 120, mythic: 7, mithril: 20 });
assert.deepEqual(E.cost(mythic, E.target(mythic, 200, 20, true)), { xp: 501050, hammers: 1550, mythic: 90, mithril: 150 });
assert.deepEqual(E.cost(E.normalisePiece(), E.target({}, 200, 20, true)), { xp: 574370, hammers: 2100, mythic: 90, mithril: 150 });
assert.equal(E.milestone({ quality: 'epic', level: 80 }, 'red'), null);
assert.equal(E.milestone({ quality: 'red', level: 200, mastery: 20 }, 'mithril'), null);
assert.equal(E.milestone(first, 'red'), null);
assert.equal(E.target({ quality: 'epic', level: 20 }, 100, 0), null);
assert.equal(E.normalisePiece({ quality: 'red', level: 200, mastery: 0 }).mastery, 15);
assert.equal(E.stats(mythic, 'helm').core, 100);
assert.equal(E.stats(first, 'helm').attack, 20);
assert.equal(E.stats(first, 'gloves').defense, 20);
assert.equal(E.stats({ quality: 'red', level: 200, mastery: 20 }, 'chest').attack, 70);
assert.deepEqual(E.gap({ xp: 10, hammers: 20, mythic: 5, mithril: 10 }, { xp: 20, hammers: 2, mythic: 3, mithril: 0 }), { xp: 0, hammers: 18, mythic: 2, mithril: 10 });
assert.deepEqual(E.normaliseState({ version: 1, weights: { inf: [2] } }).weights.inf, [2, 1.5]);
const ascensionOnly = E.defaults();
ascensionOnly.reforge = false;
ascensionOnly.pieces['inf-helm'] = mythic;
ascensionOnly.resources.mythic = 2;
const ascended = E.optimise(ascensionOnly);
assert.deepEqual(ascended.pieces['inf-helm'], { quality: 'red', level: 101, mastery: 10 });
assert.deepEqual(ascended.remaining, { xp: 0, hammers: 0, mythic: 0, mithril: 0 });

let seed = 2129;
function random(max) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; }
for (let i = 0; i < 40; i++) {
  const state = E.defaults();
  state.reforge = !!(i % 2);
  state.included.cav = !!(i % 3);
  for (const id of Object.keys(state.pieces)) {
    state.pieces[id] = E.normalisePiece({ quality: i % 4 ? 'mythic' : 'red', level: random(201), mastery: random(21) });
  }
  state.resources = { xp: random(700000), hammers: random(1200), mythic: random(40), mithril: random(100) };
  const result = E.optimise(state);
  assert.ok(result.score >= result.baseline - 1e-7);
  const spent = { xp: 0, hammers: 0, mythic: 0, mithril: 0 };
  for (const id of Object.keys(state.pieces)) {
    const from = state.pieces[id], to = result.pieces[id];
    assert.ok(to.mastery >= from.mastery);
    assert.deepEqual(to, E.normalisePiece(to));
    if (from.quality === 'red') assert.ok(to.level >= from.level);
    if (!state.included[id.split('-')[0]]) assert.deepEqual(to, from);
    spent.xp += E.CUM[to.level] - E.CUM[from.level];
    const start = Object.assign({}, from, { level: Math.min(from.level, to.level) });
    const costs = E.cost(start, to);
    for (const r of ['hammers', 'mythic', 'mithril']) spent[r] += costs[r];
  }
  for (const r of E.RES) {
    assert.ok(result.remaining[r] >= 0);
    assert.equal(state.resources[r] - spent[r], result.remaining[r]);
    assert.equal(state.resources[r] + (r === 'xp' ? result.refund : 0) - result.spent[r], result.remaining[r]);
  }
}

const planning = E.defaults();
Object.assign(planning.pieces, {
  'inf-helm': {quality:'mythic',level:69,mastery:2},
  'inf-gloves': {quality:'red',level:120,mastery:11},
  'inf-chest': {quality:'mythic',level:100,mastery:6},
  'inf-boots': {quality:'mythic',level:72,mastery:3},
  'arc-helm': {quality:'mythic',level:100,mastery:6},
  'arc-gloves': {quality:'mythic',level:69,mastery:2},
  'arc-chest': {quality:'mythic',level:69,mastery:2},
  'arc-boots': {quality:'mythic',level:100,mastery:6},
  'cav-helm': {quality:'mythic',level:63,mastery:2},
  'cav-gloves': {quality:'mythic',level:39,mastery:1},
  'cav-chest': {quality:'mythic',level:40,mastery:1},
  'cav-boots': {quality:'mythic',level:63,mastery:1}
});
const untouched = JSON.stringify(planning);
assert.equal(E.kvkPoints({xp:52650,hammers:450,mythic:6,mithril:10}),2200000);
assert.equal(E.kvkPoints({xp:100000,hammers:0,mythic:10,mithril:0}),0);
assert.equal(E.kvkPoints({hammers:30,mithril:0}),120000);
assert.equal(E.kvkPoints({hammers:0,mithril:20}),800000);
assert.equal(E.kvkPoints(E.cost({quality:'mythic',level:100,mastery:10},{quality:'red',level:100,mastery:10})),0);
assert.equal(E.kvkPoints(E.cost({quality:'red',level:120,mastery:11},{quality:'red',level:160,mastery:13})),3000000);
const forecast = E.redPlans(planning);
assert.equal(JSON.stringify(planning), untouched);
assert.equal(forecast.routes.length, 3);
assert.ok(Math.abs(forecast.baseline - E.total(E.normaliseState(planning).pieces, E.normaliseState(planning))) < 1e-8 && forecast.baseline > 0);
assert.equal(forecast.routes[0].id, 'arc-helm');
assert.equal(forecast.routes[0].to.level, 120);
assert.equal(forecast.routes[1].id, 'inf-gloves');
assert.equal(forecast.routes[1].to.level, 160);
assert.deepEqual(forecast.routes[0].costs, {xp:52650,hammers:450,mythic:6,mithril:10});
for (let i = 0; i < forecast.routes.length; i++) {
  const route = forecast.routes[i];
  if (i) assert.ok(route.distance > forecast.routes[i-1].distance && route.gain > forecast.routes[i-1].gain);
  const budget = Object.fromEntries(E.RES.map(r=>[r,planning.resources[r]+route.distance*forecast.scale[r]+1e-7]));
  assert.ok(E.affordable(route.costs, budget));
  assert.ok(Math.abs(route.efficiency - route.gain/E.RES.reduce((sum,r)=>sum+route.costs[r]/forecast.scale[r],0)) < 1e-8);
}
planning.profile = 'garrison';planning.weights = E.PROFILES.garrison;
assert.ok(E.redPlans(planning).routes.every(route=>route.id.startsWith('inf-')));
planning.profile = 'rally';planning.weights = E.PROFILES.rally;
assert.ok(E.redPlans(planning).routes.every(route=>route.id.startsWith('arc-')));
planning.included.arc = false;
assert.ok(E.redPlans(planning).routes.every(route=>!route.id.startsWith('arc-')));
planning.weights = {inf:[0,0],cav:[0,0],arc:[0,0]};
assert.equal(E.redPlans(planning).routes.length,0);

function words(lines) { return lines.map((text, i) => ({ text, poly: [[0,i*30],[250,i*30],[250,i*30+20],[0,i*30+20]] })); }
const redRead = OCR.parse(words(['Infantry Helm', 'Lv. +19', 'Forge Mastery 10', '120 → 140', 'XP 1,234 / 2,500']));
assert.equal(redRead.troop, 'inf');
assert.equal(redRead.slot, 'helm');
assert.equal(redRead.quality, 'red');
assert.equal(redRead.level, 119);
assert.equal(redRead.mastery, 10);
assert.equal(OCR.parse(words(['Cavalry Gauntlet', 'Enhancement Level 80', 'Mastery 8'])).level, 80);
assert.equal(OCR.parse(words(['Attack 250%', 'XP 100 / 200', '10 → 11'])).level, null);
assert.equal(OCR.parse(words(['Helm', 'Boots'])).slot, null);
const portuguese = OCR.parse(words(['Elmo', 'Nv. +4', 'Maestria Nv. 10']));
assert.equal(portuguese.level, 104);
assert.equal(portuguese.mastery, 10);
assert.equal(OCR.parse(words(['Nv. 10'])).mastery, null, 'a plain Nv. label is not mastery outside its visual band');
assert.equal(OCR.parse(words(['Maestria Nv. 21'])).mastery, null);
assert.equal(OCR.parse(words(['Maestria Nv. 101'])).mastery, null, 'do not accept a mastery prefix of a longer number');
assert.equal(OCR.parse(words(['Lv. 2'])).mastery, null, 'a level label alone is not a mastery label');
assert.equal(OCR.parse(words(['Nv. +2C'])).level, null, 'reject enhancement numbers followed by OCR letters');
assert.equal(OCR.parse(words(['invalidlevel +4'])).level, null, 'level labels must be whole words');
assert.equal(OCR.parse(words(['invalidlevel 4'])).level, null, 'level labels must be whole words');
assert.equal(OCR.parse(words(['Aprimoramento Nv. +4', 'Maestria Nv. 1'])).level, 104);
assert.equal(OCR.parse(words(['Aprimoramento Nv. +4', 'Maestria Nv. 1'])).mastery, 1);
const bidiDigits = OCR.parse(words(['Maestria Nv. \u200f١٠']));
assert.equal(bidiDigits.mastery, 10);
assert.match(bidiDigits.text, /١٠/, 'raw OCR text keeps localized digits');
const tileWords = [
  { text: '+20', poly: [[20,12],[180,12],[180,70],[20,70]] },
  { text: 'Lv. 11', poly: [[20,130],[180,130],[180,200],[20,200]] }
];
assert.deepEqual(OCR.overviewLabels(tileWords, 'red', 110), { level: 120, mastery: 11 });
assert.deepEqual(OCR.overviewLabels(words(['+4','Nv. 10']), 'red', 15, [true,true]), { level: 104, mastery: 10 });
assert.deepEqual(OCR.overviewLabels(words(['+54','Nv. 1']), 'mythic', 15, [true,true]), { level: 54, mastery: 1 });
assert.deepEqual(OCR.overviewLabels(words(['+100','Nv. 4']), 'mythic', 15, [true,true]), { level: 100, mastery: 4 });
assert.deepEqual(OCR.overviewLabels(words(['+54','1 Nv.']), 'mythic', 15, [true,true]), { level: 54, mastery: 1 });
assert.deepEqual(OCR.overviewLabels(words(['+54','Lw. 2']), 'mythic', 15, [true,true]), { level: 54, mastery: 2 });
assert.deepEqual(OCR.overviewLabels(words(['+4','Nv. 21']), 'red', 15, [true,true]), { level: 104, mastery: null });
assert.deepEqual(OCR.overviewLabels(words(['+4','Nv. 101']), 'red', 15, [true,true]), { level: 104, mastery: null });
assert.deepEqual(OCR.overviewLabels(words(['+4','101 Nv.']), 'red', 15, [true,true]), { level: 104, mastery: null });
assert.deepEqual(OCR.overviewLabels(words(['+4','21 Nv.']), 'red', 15, [true,true]), { level: 104, mastery: null });
assert.deepEqual(OCR.overviewLabels(words(['+4','a1 Nv.']), 'red', 15, [true,true]), { level: 104, mastery: null });
assert.deepEqual(OCR.overviewLabels(words(['+4','Nv.10abc']), 'red', 15, [true,true]), { level: 104, mastery: null });
assert.deepEqual(OCR.overviewLabels(words(['+4','invalidlevel 2']), 'red', 15, [true,true]), { level: 104, mastery: null });
assert.deepEqual(OCR.overviewLabels(words(['+４','Nv. ۱۰']), 'red', 15, [true,true]), { level: 104, mastery: 10 });
assert.deepEqual(OCR.overviewLabels([{ text: '+2C', poly: tileWords[0].poly }], 'red', 110, [true,false]), { level: null, mastery: 0 });
assert.deepEqual(OCR.overviewLabels([], 'mythic', 110), { level: 0, mastery: 0 });
assert.deepEqual(OCR.overviewLabels([], 'mythic', 110, [true,true]), { level: null, mastery: null });
assert.deepEqual(OCR.overviewLabels([{ text: ': 11 .', poly: tileWords[1].poly }], 'red', 110, [false,true]), { level: 100, mastery: 11 });
assert.deepEqual(OCR.overviewLabels([{ text: '?', poly: tileWords[0].poly }], 'mythic', 110), { level: null, mastery: 0 });
assert.deepEqual(OCR.overviewLabels([{ text: '+99', poly: tileWords[0].poly }], 'epic', 110), { level: null, mastery: 0 });
assert.equal(OCR.detect({ width: 16, height: 16, data: new Uint8Array(16*16*4) }), null);
const scope = { window: {} };
vm.runInNewContext(fs.readFileSync('i18n/en.js', 'utf8'), scope);
const dict = scope.window.__BH_I18N_DATA.en;
for (const match of fs.readFileSync('hero-gear/index.html', 'utf8').matchAll(/data-i18n(?:-key)?="(gear\.[^"]+)"/g)) assert.ok(dict[match[1]], match[1]);
const ptScope = { window: {} };
vm.runInNewContext(fs.readFileSync('i18n/pt-BR.js', 'utf8'), ptScope);
const ptDict = ptScope.window.__BH_I18N_DATA['pt-BR'];
const tokens = value => (value.match(/\{\{?[\w.-]+\}?\}/g) || []).sort();
const tags = value => (value.match(/<\/?[a-z][^>]*>/gi) || []).sort();
const gearKeys = Object.keys(dict).filter(key => key.startsWith('gear.'));
for (const key of gearKeys) {
  assert.equal(typeof ptDict[key], 'string', `missing Portuguese copy: ${key}`);
  assert.ok(ptDict[key].trim(), `empty Portuguese copy: ${key}`);
  assert.deepEqual(tokens(ptDict[key]), tokens(dict[key]), `placeholder mismatch: ${key}`);
  assert.deepEqual(tags(ptDict[key]), tags(dict[key]), `HTML tag mismatch: ${key}`);
}

const nearMilestone = E.defaults();
Object.assign(nearMilestone.pieces, {
  'inf-helm': {quality:'mythic',level:69,mastery:2},
  'inf-gloves': {quality:'red',level:120,mastery:11},
  'inf-chest': {quality:'mythic',level:100,mastery:6},
  'inf-boots': {quality:'mythic',level:72,mastery:3},
  'cav-helm': {quality:'mythic',level:63,mastery:2},
  'cav-gloves': {quality:'mythic',level:39,mastery:1},
  'cav-chest': {quality:'mythic',level:40,mastery:1},
  'cav-boots': {quality:'mythic',level:63,mastery:1},
  'arc-helm': {quality:'red',level:111,mastery:11},
  'arc-gloves': {quality:'mythic',level:69,mastery:2},
  'arc-chest': {quality:'mythic',level:69,mastery:2},
  'arc-boots': {quality:'mythic',level:100,mastery:6}
});
nearMilestone.resources = {xp:23000,hammers:84,mythic:7,mithril:10};
nearMilestone.reforge = false;
const comparison = E.strategyComparison(nearMilestone);
const archer = comparison.alternatives.find(route => route.id === 'arc-helm');
assert.ok(archer);
assert.deepEqual(archer.gap, {xp:2400,hammers:0,mythic:0,mithril:0});
assert.equal(archer.afterSpendGap.xp, 6410);
assert.ok(archer.reforgeNow);
assert.equal(archer.optimalAtThreshold, true);
assert.ok(archer.futurePlan.score >= comparison.now.score);
assert.equal(E.defaults().mode, 'optimise');
assert.equal(E.defaults().reforge, true);

console.log('Gear costs, milestones, 40 optimiser conservation cases, OCR parsing and copy checks passed.');
