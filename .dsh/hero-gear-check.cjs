const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const E = require('../js/hero-gear-engine.js');
const OCR = require('../js/hero-gear-ocr.js');
const View = require('../js/hero-gear-view.js');
const Ledger = require('../js/player-ledger.js');

function checkGuestLedger() {
  const memory = new Map();
  const persistent = Ledger.create({ getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) });
  persistent.setBalance('forgehammer', 50);
  const kingdom = { position: null, generation: 4, truegold: 5, warAcademy: true };
  persistent.setKingdom(kingdom);
  const before = persistent.exportJSON(), encoded = E.encodeLink(E.defaults());
  for (const search of ['?guest', '?gear=invalid', '?gear=' + encoded.gear + '&w=' + encoded.w]) {
    let reads = 0;
    const nodes = new Map();
    const shared = () => { reads++; return persistent; };
    const scope = {
      URL, URLSearchParams, location: { search },
      document: {
        currentScript: { src: 'https://dey.ci/js/hero-gear.js' },
        getElementById: id => {
          if (!nodes.has(id)) nodes.set(id, { dataset: {}, setAttribute() {} });
          return nodes.get(id);
        }
      },
      window: { HeroGear: E, HeroGearView: View, PlayerLedger: { ...Ledger, shared }, BH: { registerPage() {} } }
    };
    vm.runInNewContext(fs.readFileSync('js/interactions.js', 'utf8'), scope);
    vm.runInNewContext(fs.readFileSync('js/hero-gear.js', 'utf8'), scope);
    assert.equal(reads, 0, 'guest configuration does not read storage before module mount');
    const selected = scope.window.Interactions.ledger();
    assert.notEqual(selected, persistent);
    assert.equal(scope.window.Interactions.ledger(), selected);
    assert.equal(scope.window.PlayerLedger.shared, shared);
    if (search === '?guest') assert.equal(selected.balance('forgehammer').amount, 50, 'plain guest mode starts with saved facts');
    selected.setBalance('forgehammer', 90);
    const record = {
      id: 'guest-shot', sourceType: 'backpack', at: new Date().toISOString(), contentHash: 'f'.repeat(64), confirmation: 'confirmed',
      inventoryDelta: { mithril: { before: selected.balance('mithril').amount, after: 19 } }
    };
    selected.applyImport(record, selected.snapshot().revision);
    const backup = JSON.parse(selected.exportJSON());
    backup.inventory.forgehammer.amount = 120;
    selected.importJSON(backup, E, selected.snapshot().revision);
    assert.equal(selected.balance('forgehammer').amount, 120);
    assert.equal(selected.balance('mithril').amount, 19);
    assert.equal(selected.snapshot().imports.length, 1);
    assert.equal(persistent.exportJSON(), before, 'guest resources, screenshot imports and save transfers leave the persistent ledger intact');
    assert.deepEqual(scope.window.PlayerLedger.shared().kingdom(), kingdom, 'persistent kingdom facts remain available');
  }
}

checkGuestLedger();
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

// Spendable for event points: whole mastery steps (not on epic, up to 20) and red milestones
// paid with their XP, hammers and spare mythic gear; mithril routes go first.
let spend = E.spendable({ 'inf-helm': { quality: 'mythic', level: 100, mastery: 10 }, 'inf-boots': { quality: 'mythic', level: 0, mastery: 0 } }, { xp: 1e6, hammers: 200, mythic: 10, mithril: 10 });
assert.deepEqual(spend.spent, { xp: 52650, hammers: 170, mythic: 6, mithril: 10 });
assert.deepEqual(spend.pieces['inf-helm'], { quality: 'red', level: 120, mastery: 11 });
assert.equal(spend.points, 170 * E.KVK_RATES.hammers + 10 * E.KVK_RATES.mithril);
assert.equal(E.spendable({ 'inf-helm': { quality: 'epic', level: 10, mastery: 0 } }, { xp: 1e6, hammers: 5000, mythic: 5, mithril: 100 }).points, 0, 'epic gear takes no hammers or mithril');
assert.deepEqual(E.spendable({ 'inf-helm': { quality: 'mythic', level: 0, mastery: 0 } }, { xp: 0, hammers: 5000, mythic: 0, mithril: 100 }).spent, { xp: 0, hammers: 550, mythic: 0, mithril: 0 }, 'mastery past 10 needs spare mythic gear');
assert.equal(E.spendable({ 'inf-helm': { quality: 'red', level: 200, mastery: 20 } }, { xp: 1e6, hammers: 5000, mythic: 50, mithril: 500 }).points, 0, 'maxed gear spends nothing');
assert.ok(fs.readFileSync('hero-gear/index.html', 'utf8').includes('id="gear-kvk-bag"'));

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

const shared = E.defaults();
shared.pieces['arc-helm'] = {quality:'red',level:120,mastery:11};
shared.pieces['cav-chest'] = {quality:'epic',level:80,mastery:0};
shared.resources.hammers = 900;
const sharedLink = E.encodeLink(shared);
assert.equal(sharedLink.gear, 'm0.0-m0.0-m0.0-m0.0-m0.0-m0.0-e80.0-m0.0-r120.11-m0.0-m0.0-m0.0');
assert.equal(sharedLink.w, 'growth');
assert.deepEqual(E.readLink('?gear=' + sharedLink.gear + '&w=' + sharedLink.w).pieces, shared.pieces, 'links carry pieces, never the bag');
assert.equal(E.readLink('?lang=en'), null);
for (const bad of ['m0.0', 'x1.0' + '-m0.0'.repeat(11), 'e90.0' + '-m0.0'.repeat(11), 'm50.3' + '-m0.0'.repeat(10) + '-r110.2']) assert.deepEqual(E.readLink('?gear=' + bad), {invalid:true}, bad);
shared.profile = 'custom'; shared.weights.inf = [0.5, 2];
const customLink = E.encodeLink(shared);
assert.equal(customLink.w, '0.5,2,0.4,0.2,1.4,0.7');
assert.deepEqual(E.readLink('?gear=' + customLink.gear + '&w=' + customLink.w).weights, shared.weights);
assert.equal(E.readLink('?gear=' + customLink.gear + '&w=nope').weights, undefined);

const audit = E.defaults();
Object.assign(audit.pieces, {
  'inf-helm': {quality:'mythic',level:69,mastery:2}, 'inf-gloves': {quality:'red',level:120,mastery:11}, 'inf-chest': {quality:'mythic',level:100,mastery:6}, 'inf-boots': {quality:'mythic',level:72,mastery:3},
  'cav-helm': {quality:'mythic',level:20,mastery:20}, 'cav-gloves': {quality:'mythic',level:100,mastery:0}, 'cav-chest': {quality:'red',level:160,mastery:13}, 'cav-boots': {quality:'epic',level:80,mastery:0},
  'arc-helm': {quality:'red',level:200,mastery:20}, 'arc-gloves': {quality:'red',level:200,mastery:20}, 'arc-chest': {quality:'red',level:200,mastery:20}, 'arc-boots': {quality:'red',level:200,mastery:20}
});
const split = E.bestSplit(audit);
assert.deepEqual(split.map(set => set.type), ['inf','cav','arc']);
for (const set of split) {
  assert.ok(set.score >= set.current - 1e-9, set.type + ' best split never scores below the current gear');
  const spent = {xp:0,hammers:0,mythic:0,mithril:0};
  set.pieces.forEach(p => { assert.deepEqual(p.toCost, E.invested(p.to)); E.RES.forEach(r => spent[r] += p.toCost[r]); });
  E.RES.forEach(r => assert.ok(spent[r] <= set.budget[r], set.type + ' best split stays within invested ' + r));
  assert.equal(Math.abs(set.score - set.pieces.reduce((sum, p) => sum + E.score(p.id, p.to, audit.weights), 0)) < 1e-9, true);
}
assert.deepEqual(split[0].budget, {xp:245820,hammers:960,mythic:6,mithril:10});
assert.equal(split[2].score, split[2].current, 'a maxed set is already its best split');
assert.ok(split[1].score > split[1].current * 1.5, 'mastery 20 on a level 20 piece is badly placed');
assert.equal(split[1].pieces.find(p => p.id === 'cav-boots').to.quality, 'epic', 'epic pieces stay epic');
// Exhaustive check on two pieces: the best split matches brute force to within XP level rounding.
function every(epic) {
  const out = [];
  if (epic) { for (let l = 0; l <= 80; l += 4) out.push({quality:'epic',level:l,mastery:0}); return out; }
  for (let l = 0; l <= 100; l += 5) for (let m = 0; m <= 20; m += 2) out.push({quality:'mythic',level:l,mastery:m});
  for (let l = 100; l <= 200; l += 10) for (let m = Math.max(10, l < 120 ? 10 : 10 + Math.floor((l - 100) / 20)); m <= 20; m += 2) out.push({quality:'red',level:l,mastery:m});
  return out;
}
const pool = every(false), pairState = E.defaults();
for (let t = 0; t < 6; t++) {
  pairState.pieces['cav-helm'] = pool[(t * 97) % pool.length];
  pairState.pieces['cav-gloves'] = pool[(t * 131 + 7) % pool.length];
  const set = E.bestSet(['cav-helm','cav-gloves'], pairState.pieces, pairState.weights);
  const budget = set.budget, full = [];
  const all = q => { const o = []; for (let l = 0; l <= 100; l++) for (let m = 0; m <= 20; m++) o.push({quality:'mythic',level:l,mastery:m}); for (let l = 100; l <= 200; l++) for (let m = l < 120 ? 10 : 10 + Math.floor((l - 100) / 20); m <= 20; m++) o.push({quality:'red',level:l,mastery:m}); return o; };
  const states = all().map(p => ({p, c: E.invested(p)}));
  const A = states.map(o => Object.assign({v: E.score('cav-helm', o.p, pairState.weights)}, o)).filter(o => E.RES.every(r => o.c[r] <= budget[r]));
  const B = states.map(o => Object.assign({v: E.score('cav-gloves', o.p, pairState.weights)}, o)).filter(o => E.RES.every(r => o.c[r] <= budget[r]));
  B.sort((x, y) => y.v - x.v);
  let brute = 0;
  for (const a of A) for (const b of B) { if (a.v + b.v <= brute) break; if (E.RES.every(r => a.c[r] + b.c[r] <= budget[r])) { brute = a.v + b.v; break; } }
  assert.ok(set.score <= brute + 1e-9 && set.score >= brute * 0.997, 'best split within 0.3% of brute force: ' + set.score + ' vs ' + brute);
}

// % of optimal: the best layout never spends more than the gear already holds (plus the bag,
// when counted), never scores below the gear, leaves excluded troops alone, and the bag only helps.
{
  const sheet = Object.assign(E.defaults(), E.readLink('?gear=m69.2-r120.11-m100.6-m72.3-m20.20-m100.0-r160.13-e80.0-r200.20-r200.20-r200.20-r200.20&w=growth'));
  sheet.resources = { xp: 52650, hammers: 110, mythic: 6, mithril: 10 };
  sheet.included.arc = false;
  const now = E.optimal(sheet), plan = E.optimal(sheet, { bag: true }), state = E.normaliseState(sheet);
  for (const [result, bag] of [[now, false], [plan, true]]) {
    assert.ok(result.share > 0 && result.share <= 1, 'share is a fraction');
    assert.ok(result.score >= result.current - 1e-9, 'never below the gear itself');
    const used = { xp: 0, hammers: 0, mythic: 0, mithril: 0 }, held = { xp: 0, hammers: 0, mythic: 0, mithril: 0 };
    for (const id of Object.keys(state.pieces)) {
      if (id.startsWith('arc-')) { assert.deepEqual(result.pieces[id], state.pieces[id], 'an excluded troop is left alone'); continue; }
      const a = E.invested(result.pieces[id]), b = E.invested(state.pieces[id]);
      for (const r of E.RES) { used[r] += a[r]; held[r] += b[r]; }
    }
    for (const r of E.RES) assert.ok(used[r] <= held[r] + (bag ? sheet.resources[r] : 0), r + ' stays within what is invested' + (bag ? ' and in the bag' : ''));
  }
  assert.ok(now.share < 1 && now.changes.length > 0, 'a sheet with wasted mastery is short of optimal');
  assert.ok(plan.score >= now.score - 1e-9, 'counting the bag never lowers the optimum');
  assert.ok(plan.score >= E.optimise(sheet).score - 1e-9, 'Spend now never beats the optimum with the bag');
  const fit = E.profileFit(sheet);
  assert.deepEqual(Object.keys(fit).sort(), Object.keys(E.PROFILES).sort());
  Object.values(fit).forEach(share => assert.ok(share > 0 && share <= 1));
}
// Hammer reforge: a reset mastery gives back half its hammers, never mythic; red is never reset;
// every hammer is accounted for; and it only runs when allowed.
{
  const sheet = Object.assign(E.defaults(), E.readLink('?gear=m69.2-r120.11-m100.6-m72.3-m20.20-m100.0-r160.13-e80.0-r200.20-r200.20-r200.20-r200.20&w=growth'));
  const off = E.optimise(sheet);
  assert.equal(off.hammerRefund, 0, 'no hammer reforge unless allowed');
  sheet.hammerReforge = true;
  const on = E.optimise(sheet);
  assert.ok(on.score >= off.score - 1e-9, 'allowing hammer reforge never makes the answer worse');
  assert.ok(on.hammerRefund > 0, 'mastery 20 on a level 20 piece is worth reforging');
  for (const d of on.details) {
    if (d.from.quality === 'red') assert.equal(d.hammerRefund, 0, 'red gear is never reforged');
    if (d.hammerRefund) assert.equal(d.hammerRefund, Math.floor(5 * d.from.mastery * (d.from.mastery + 1) / 2), 'half the hammers back, rounded down');
  }
  assert.equal(on.remaining.hammers, sheet.resources.hammers + on.hammerRefund - on.spent.hammers, 'every hammer is accounted for');
  assert.equal(on.remaining.mythic, sheet.resources.mythic - on.spent.mythic, 'reforging never returns spare mythic gear');
}
console.log('Guest ledger isolation, gear costs, milestones, 40 optimiser conservation cases, OCR parsing, share links, best split, hammer reforge, % of optimal with and without the bag, profile fit and copy checks passed.');
