// Town Centre: points from the whole ledger, page wiring and dictionaries.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const T = require('../js/town-centre-engine.js'), H = require('../js/hero-gear-engine.js'), Spend = require('../js/hero-spend.js'), Ledger = require('../js/player-ledger.js'), rules = require('../js/event-rules.js'), B = require('../js/building-spend.js');
const storage = { getItem(k) { return this[k] ?? null; }, setItem(k, v) { this[k] = v; } };
const store = Ledger.create(storage);

// Speedup rows: general counts wherever a speedup does; healing only where every kind does.
assert.deepEqual(T.speedupKinds('1 min construction / research / training / learning speedup'), ['general', 'construction', 'research', 'training', 'learning']);
assert.deepEqual(T.speedupKinds('1m construction / research / training / master speedup'), ['general', 'construction', 'research', 'training', 'learning']);
assert.equal(T.speedupKinds('1 min speedups (all kinds)').length, 6);
assert.equal(T.speedupKinds('1 min speedups').length, 6);
assert.equal(T.speedupKinds('Mithril'), null);
assert.equal(T.governorKind('Governor Charm max score +1'), 'charms');
assert.equal(T.governorKind('Governor Gear max score +1'), 'gear');
assert.equal(T.governorKind('Governor gear'), null);

// Empty ledger: nothing counted, everything unknown, never a confirmed zero.
let best = T.best(store.snapshot(), 'prep');
assert.equal(best.total, 0); assert.equal(best.complete, false);
assert.ok(best.unknown.includes('mithril') && best.unknown.includes('speedup-general') && best.unknown.includes('governor-charms'));

// Items match the shared event rules exactly. Hero shards and widgets are scored from the
// hero spending plan instead of the raw balance, so a bag widget with no heroes scores nothing.
store.setBalance('mithril', 10); store.setBalance('forgehammer', 25); store.setBalance('hero-widget', 3);
const usableIds = ['mithril', 'forgehammer', ...Spend.ITEMS, ...B.ITEMS];
store.setBalance('truegold', 7);
assert.equal(T.day(store.snapshot(), 'prep', 2).lines.filter(l => l.kind === 'item').reduce((s, l) => s + l.points, 0), rules.calculate(store.snapshot(), 'prep', 2, {}, null).items.filter(i => !usableIds.includes(i.id) && i.points).reduce((s, i) => s + i.points, 0));
assert.equal(T.day(store.snapshot(), 'prep', 4).lines.find(l => l.id === 'hero-widget'), undefined);
assert.ok(T.day(store.snapshot(), 'prep', 4).unknown.includes('heroes'));

// Forgehammers and mithril: only what the saved hero gear can take, in whole mastery steps and
// red milestones paid with the XP and spare mythic gear they need. No gear, nothing spendable.
assert.equal(T.day(store.snapshot(), 'prep', 4).lines.find(l => l.id === 'mithril'), undefined);
assert.ok(T.day(store.snapshot(), 'prep', 4).unknown.includes('hero-gear-pieces'));
const gear = store.heroGear(H); gear.pieces['inf-helm'] = H.normalisePiece({ quality: 'mythic', level: 100, mastery: 10 });
store.writeHeroGear(gear, H, { piece: 'inf-helm' });
assert.deepEqual(Object.keys(store.snapshot().heroGear.pieces), ['inf-helm']);
store.setBalance('hero-gear-xp', 0); store.setBalance('spare-mythic-gear', 0);
let gearDay = T.day(store.snapshot(), 'prep', 4);
assert.equal(gearDay.lines.find(l => l.id === 'mithril'), undefined, 'no XP to reach level 120, so no imbuement');
assert.equal(gearDay.lines.find(l => l.id === 'forgehammer'), undefined, 'mastery 11 needs a spare mythic piece and 110 hammers; 25 pay for nothing');
store.setBalance('hero-gear-xp', 1e6); store.setBalance('spare-mythic-gear', 10); store.setBalance('forgehammer', 200);
gearDay = T.day(store.snapshot(), 'prep', 4);
assert.deepEqual([gearDay.lines.find(l => l.id === 'mithril').amount, gearDay.lines.find(l => l.id === 'forgehammer').amount], [10, 110], 'red 120 at mastery 11; the 90 hammers left cannot pay mastery 12');
assert.equal(gearDay.lines.find(l => l.id === 'mithril').kind, 'usable');
assert.deepEqual(T.heroGearSpend(store.snapshot()).plan.spent, H.spendable(store.snapshot().heroGear.pieces, { xp: 1e6, hammers: 200, mythic: 10, mithril: 10 }).spent, 'the Town Centre and hero gear engine share one plan');
assert.ok(!gearDay.unknown.includes('hero-gear-pieces'));

// Speedups: minutes × the row's rate, each kind once per day.
store.setBalance('speedup-general', 100); store.setBalance('speedup-healing', 50); store.setBalance('speedup-construction', 10);
let day = T.day(store.snapshot(), 'prep', 1);
assert.equal(day.lines.find(l => l.id === 'speedup-general').points, 3000);
assert.equal(day.lines.find(l => l.id === 'speedup-construction').points, 300);
assert.equal(day.lines.find(l => l.id === 'speedup-healing'), undefined, 'healing is not a construction / research / training / learning speedup');
assert.equal(T.day(store.snapshot(), 'prep', 2).lines.find(l => l.id === 'speedup-healing').points, 1500);
assert.equal(T.day(store.snapshot(), 'brawl', 1).lines.find(l => l.id === 'speedup-general').rate, 18);
assert.ok(T.day(store.snapshot(), 'prep', 1).unquantified.every(r => !T.speedupKinds(r.label) && !T.governorKind(r.label) && !r.items));

// Governor score: the planner's score gain × the row's rate; unknown until levels and materials are known.
assert.equal(T.governorGain(store.snapshot(), 'charms').score, null);
store.setGovernor('charms', { 'inf-1-1': 0 });
assert.equal(T.governorGain(store.snapshot(), 'charms').score, null, 'materials not entered');
store.setBalance('charm-guide', 5); store.setBalance('charm-design', 5);
const gain = T.governorGain(store.snapshot(), 'charms').score;
assert.ok(gain > 0);
assert.equal(T.day(store.snapshot(), 'sg', 1).lines.find(l => l.id === 'governor-charms').points, gain * 70);
assert.equal(T.day(store.snapshot(), 'sg', 6).lines.find(l => l.id === 'governor-charms').points, gain * 36);

// Best total: each holding once, on its best day; never the sum of the days.
best = T.best(store.snapshot(), 'sg');
const days = best.days.reduce((s, d) => s + d.total, 0);
assert.ok(best.total <= days);
assert.equal(best.lines.filter(l => l.id === 'mithril').length, 1);
assert.equal(best.lines.find(l => l.id === 'mithril').points, 400000);
assert.equal(best.lines.find(l => l.id === 'governor-charms').rate, 70);
for (const event of Object.keys(rules.data.events)) for (const d of T.best(store.snapshot(), event).days) assert.ok(Number.isSafeInteger(d.total));
assert.deepEqual(T.topRate('mithril'), { event: 'prep', day: 4, rate: 40000 });
assert.equal(T.topRate('bread'), null);

// Hero shards and widgets: only what owned heroes can consume, from the same plan as the Heroes page.
store.setBalance('mythic-hero-shard', 500);
store.setHero('jabel', { stars: 24 }); store.setBalance(Ledger.heroShardId('jabel'), 60);
store.setHero('amadeus', { stars: 12, widget: 3 }); store.setBalance(Ledger.heroShardId('amadeus'), 200); store.setBalance(Ledger.heroWidgetId('amadeus'), 30); store.setBalance(Ledger.widgetChestId(1), 0);
const heroDay = T.day(store.snapshot(), 'prep', 2), shardLine = heroDay.lines.find(l => l.id === 'mythic-hero-shard');
assert.equal(shardLine.kind, 'usable');
assert.equal(shardLine.amount, 695, 'Amadeus 195 of his own (2★ to 3★ 2/6), Jabel 60 own + 440 general (4★ to 4★ 5/6)');
assert.equal(shardLine.points, 695 * 3040);
assert.equal(T.best(store.snapshot(), 'prep').lines.find(l => l.id === 'hero-widget').points, 20 * 8000, 'widget 3 to 4 costs 20 of Amadeus’s 30');
const plan = T.best(store.snapshot(), 'prep').heroes;
assert.equal(plan.items['mythic-hero-shard'].left, 60);
assert.equal(Spend.points(rules, 'prep', plan.heroes.jabel).total, 500 * 3040, 'the Heroes page scores each hero from the same plan');

// Truegold and Tempered Truegold: only what the recorded buildings can take, in whole steps
// paid with every resource they list, once their prerequisites are met. No buildings, nothing.
assert.equal(T.day(store.snapshot(), 'prep', 2).lines.find(l => l.id === 'truegold'), undefined);
assert.ok(T.day(store.snapshot(), 'prep', 2).unknown.includes('buildings'));
for (const [id, level] of Object.entries({ 'town-center': 'TG 3', embassy: 'TG 3', barracks: 'TG 3', range: 'TG 3', stable: 'TG 3', 'command-center': 'TG 3', infirmary: 'TG 3', 'war-academy': 'TG 3', academy: '30' })) store.setBuilding(id, level);
store.setBalance('truegold', 1000); store.setBalance('tempered-truegold', 50);
assert.equal(T.day(store.snapshot(), 'prep', 2).lines.find(l => l.id === 'truegold'), undefined, 'resources not counted, so no step can be paid');
for (const id of B.RESOURCES) store.setBalance(id, 1e9);
const tgDay = T.day(store.snapshot(), 'prep', 2), tgLine = tgDay.lines.find(l => l.id === 'truegold');
const tcSteps = B.data.buildings[0].levels.filter(l => ['TG3-1', 'TG3-2', 'TG3-3'].includes(l.id)).reduce((s, l) => s + l.cost.truegold, 0);
assert.deepEqual([tgLine.kind, tgLine.amount, tgLine.points], ['usable', tcSteps, tcSteps * 2000], 'every other building waits on the Town Centre, which takes three TG3 steps');
assert.equal(tgDay.lines.find(l => l.id === 'tempered-truegold'), undefined, 'nothing before TG 5 takes Tempered Truegold');
assert.ok(!tgDay.unknown.some(id => /^building|^buildings/.test(id)));
assert.equal(T.best(store.snapshot(), 'prep').buildings.items.truegold.left, 1000 - tcSteps);
for (const id of [...B.RESOURCES, 'truegold', 'tempered-truegold']) store.setBalance(id, null);
store.setBuilding('academy', null);
const chestStore = Ledger.create({ getItem(k) { return this[k] ?? null; }, setItem(k, v) { this[k] = v; } });
chestStore.setHero('amadeus', { stars: 30, widget: 0 });
chestStore.setBalance(Ledger.heroShardId('amadeus'), 0);
chestStore.setBalance(Ledger.heroWidgetId('amadeus'), 0);
chestStore.setBalance(Ledger.widgetChestId(1), 16);
chestStore.setBalance(Ledger.widgetChestId(2), 100);
const chestPlan = Spend.plan(chestStore.snapshot());
assert.equal(chestPlan.heroes.amadeus.widget.general, 15);
assert.equal(chestPlan.items['hero-widget'].left, 1);
const chestPoints = Spend.points(rules, 'prep', chestPlan.heroes.amadeus).total;
assert.equal(chestPoints, 15 * 8000);
assert.equal(T.best(chestStore.snapshot(), 'prep').lines.find(l => l.id === 'hero-widget').points, chestPoints);
for (let gen = 1; gen <= 7; gen++) assert.deepEqual(T.topRate(Ledger.widgetChestId(gen)), T.topRate('hero-widget'));

// Troops: a pre-trained batch per camp, then what training and general speedups can train with
// the resources left. Rates come from the day's "T{n} troop" rows, then the cross-checked table.
const R = require('../js/troop-spend.js');
assert.deepEqual(Object.keys(R.TIERS).map(Number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
for (const tier of Object.values(R.TIERS)) assert.ok(tier.seconds > 0 && R.TYPES.every(type => tier.cost[type.id]), 'T' + tier.tier);
assert.deepEqual(R.rates(rules.rules('prep', 4).rows, 'prep').rates, { 1: 3, 2: 4, 3: 5, 4: 8, 5: 12, 6: 18, 7: 25, 8: 35, 9: 45, 10: 60, 11: 75 });
assert.deepEqual(R.rates(rules.rules('sg', 4).rows, 'sg').rates, { 1: 1, 2: 2, 3: 3, 6: 11, 7: 16, 8: 23, 9: 30, 10: 39 }, 'the two sources disagree on T4, T5 and T11');
assert.equal(R.rates(rules.rules('brawl', 4).rows, 'brawl').rates[1], 1);
assert.equal(R.rates(rules.rules('prep', 1).rows, 'prep'), null);
const troopStore = Ledger.create({ getItem(k) { return this[k] ?? null; }, setItem(k, v) { this[k] = v; } });
let troopDay = T.day(troopStore.snapshot(), 'prep', 4);
assert.ok(troopDay.unknown.includes('training-tiers') && !troopDay.lines.some(l => l.kind === 'troops'));
assert.ok(troopDay.unquantified.every(row => !/troop/i.test(row.label)), 'troop rows are counted, not listed');
assert.throws(() => troopStore.setTraining('inf', 12)); assert.throws(() => troopStore.setTraining('capacity', 0)); assert.throws(() => troopStore.setTraining('march', 1));
troopStore.setTraining('speed', 100); troopStore.setTraining('capacity', 500); troopStore.setTraining('inf', 10);
for (const id of B.RESOURCES) troopStore.setBalance(id, 1e9);
troopStore.setBalance('speedup-training', 600);
troopDay = T.day(troopStore.snapshot(), 'prep', 4);
const troopLine = id => troopDay.lines.find(l => l.id === id);
assert.deepEqual([troopLine('troops-batch-t10').amount, troopLine('troops-batch-t10').points], [500, 500 * 60]);
assert.equal(troopLine('troops-training-t10').amount, 532, '600 minutes at 67.6 s a troop (152 s, 125% faster: KvK prep adds 25%)');
assert.ok(troopDay.unknown.includes('speedup-general') && !troopDay.unknown.includes('training-tiers'));
assert.equal(troopDay.troops.batch.seconds, Math.ceil(500 * 152 / 2.25));
assert.equal(T.day(troopStore.snapshot(), 'sg', 4).troops.batch.seconds, 500 * 76, 'no KvK buff outside KvK prep');
troopStore.setTrainingBuff(true);
troopDay = T.day(troopStore.snapshot(), 'prep', 4);
assert.deepEqual([troopLine('troops-batch-t10').amount, troopLine('troops-training-t10').amount], [1500, 532], 'the buff triples the batch and adds nothing on the day');
assert.equal(troopDay.troops.gems, 3000);
// Speed buffs: a castle position counts for the batch and the day, at its High King speed outside
// KvK prep when the kingdom holds the High King; KvK prep gives everyone +25% instead; Mobilize
// counts only on the day.
troopStore.setTrainingPlan('position', 'advisor'); troopStore.setTrainingPlan('highKing', true); troopStore.setTrainingPlan('mobilize', true);
const troopPlans = () => troopStore.snapshot().preferences.training;
assert.deepEqual(troopPlans(), { buff: true, position: 'advisor', highKing: true, mobilize: true });
assert.deepEqual(R.speeds(troopStore.snapshot().training.facts, troopPlans(), 'prep'), { base: 100, batch: 175, day: 205, kvk: 25, position: 50, highKing: false, mobilize: 30 });
assert.deepEqual(R.speeds(troopStore.snapshot().training.facts, troopPlans(), 'sg'), { base: 100, batch: 175, day: 205, kvk: 0, position: 75, highKing: true, mobilize: 30 });
troopStore.setTrainingPlan('position', 'minister');
assert.deepEqual([R.speeds({ speed: 100 }, troopPlans(), 'sg').batch, R.speeds({ speed: 100 }, troopPlans(), 'prep').batch], [115, 135]);
troopStore.setTrainingPlan('position', 'advisor'); troopStore.setTrainingPlan('highKing', false);
assert.equal(R.speeds({ speed: 100 }, troopPlans(), 'sg').position, 50, 'without the High King an Advisor gives +50%');
troopDay = T.day(troopStore.snapshot(), 'prep', 4);
assert.equal(troopDay.troops.batch.seconds, Math.ceil(1500 * 152 * 100 / 275), '1,500 T10 at 175% faster');
assert.equal(troopLine('troops-training-t10').amount, Math.floor(36000 * 305 / 15200), '600 minutes at 205% faster');
assert.equal(troopDay.troops.batch.troops, 1500, 'the buff plan survives the other plans');
for (const key of ['position', 'mobilize']) troopStore.setTrainingPlan(key, null);
assert.throws(() => troopStore.setTrainingPlan('position', 'king')); assert.throws(() => troopStore.setTrainingPlan('march', true));
// Resources: the batch is paid first, and nothing is trained that the bag cannot pay for.
troopStore.setBalance('bread', 2788 * 300 + 100);
troopDay = T.day(troopStore.snapshot(), 'prep', 4);
assert.deepEqual([troopLine('troops-batch-t10').amount, troopLine('troops-training-t10')], [300, undefined]);
troopStore.setBalance('bread', null);
assert.ok(T.day(troopStore.snapshot(), 'prep', 4).unknown.includes('bread'));
troopStore.setBalance('bread', 1e9);
// Speedups are spent once: training speedups score on the troop day or as minutes, never both.
const troopBest = T.best(troopStore.snapshot(), 'prep');
assert.equal(troopBest.lines.find(l => l.id === 'speedup-training'), undefined, '532 T10 for 31,920 beat 600 minutes at 30');
assert.equal(troopBest.lines.find(l => l.id === 'troops-training-t10').day, 4);
troopStore.setBalance('speedup-training', 100000); troopStore.setTraining('speed', 0);
assert.equal(T.best(troopStore.snapshot(), 'prep').lines.find(l => l.id === 'speedup-training' || l.id === 'troops-training-t10').id, 'speedup-training', 'at base speed the minutes score more as speedups');
// T11: the timer is cross-checked but its costs are not, so they are flagged and do not limit the plan.
troopStore.setTraining('arc', 11); troopStore.setTraining('speed', 100);
troopDay = T.day(troopStore.snapshot(), 'prep', 4);
assert.deepEqual(troopDay.troops.unverified, ['troops-t11-cost']);
assert.equal(troopLine('troops-batch-t11').amount, 1500);
assert.ok(T.day(troopStore.snapshot(), 'sg', 4).unknown.includes('troops-t11-rate'));
assert.deepEqual(R.missing('troops-t11-rate'), { kind: 'rate', tier: 11 });

// Page wiring: navigation, scripts, deck scene, dictionaries and copy keys.
const nav = require('../_data/nav.json'), pages = require('../_data/pages.json');
// The Town Centre sits outside the page ring: a fixed button in the deck and a ledger link, never a card.
assert.equal(nav.filter(n => n.self === 'town').length, 0);
assert.ok(!pages.town.swipePrev && !pages.town.swipeNext);
assert.ok(fs.readFileSync('_includes/page-deck.html', 'utf8').includes('class="deck-town" href="{{ p.depth }}town-centre/"'));
assert.ok(!fs.readFileSync('_includes/ascii/deck-scene.html', 'utf8').includes("'town'"));
for (const script of ['event-data.js', 'governor-data.js', 'event-rules.js', 'governor-engine.js', 'hero-gear-engine.js', 'hero-data.js', 'hero-spend.js', 'building-data.js', 'building-spend.js', 'troop-data.js', 'troop-spend.js', 'town-centre-engine.js', 'hero-points.js', 'town-centre.js']) assert.ok(pages.town.scripts.includes('../js/' + script), script);
assert.ok(pages.town.scripts.indexOf('../js/town-centre-engine.js') < pages.town.scripts.indexOf('../js/town-centre.js'));
assert.ok(pages.town.scripts.indexOf('../js/hero-spend.js') < pages.town.scripts.indexOf('../js/town-centre-engine.js'));
assert.ok(pages.town.scripts.indexOf('../js/building-data.js') < pages.town.scripts.indexOf('../js/building-spend.js') && pages.town.scripts.indexOf('../js/building-spend.js') < pages.town.scripts.indexOf('../js/town-centre-engine.js'));
const dictionaries = fs.readdirSync('i18n').filter(f => f.endsWith('.js')).map(file => { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync('i18n/' + file, 'utf8'), ctx); return [file, Object.values(ctx.window.__BH_I18N_DATA)[0]]; });
assert.equal(dictionaries.length, 17);
for (const [file, d] of dictionaries) for (const key of ['town.nav', 'town.title', 'town.cardLede', 'town.kicker']) assert.equal(typeof d[key], 'string', file + ' ' + key);
const en = dictionaries.find(([file]) => file === 'en.js')[1];
for (const b of B.BUILDINGS) assert.ok(en['town.building.' + b.id], b.id);
const html = fs.readFileSync('town-centre/index.html', 'utf8');
assert.ok(html.includes('../img/items/healing-speedup.svg'));
assert.ok(html.includes('../img/items/hero-widget-chest.svg'));
assert.ok(!html.includes('data-rate="hero-widget-chest-gen'));
for (const match of html.matchAll(/data-i18n(?:-key)?="(town\.[a-zA-Z.]+)"/g)) assert.ok(en[match[1]], match[1]);
for (const kind of T.SPEEDUPS) assert.ok(en['town.speedup.' + kind.kind], kind.id);
const page = fs.readFileSync('js/town-centre.js', 'utf8');
const enBlock = page.slice(page.indexOf('var EN = {'), page.indexOf('};', page.indexOf('var EN = {')));
for (const match of enBlock.matchAll(/(?:^|[{,]\s*)'?([a-zA-Z.]+)'?: '/gm)) assert.ok(en['town.' + match[1]] !== undefined, 'town.' + match[1]);
assert.doesNotMatch(page, /innerHTML/);
for (const match of html.matchAll(/<details id="([^"]+)"/g)) assert.match(match[1], /^[a-z0-9-]+$/);
for (const panel of ['town-bag', 'town-speedups', 'town-resources', 'town-buildings', 'town-troops', 'town-hero-gear', 'town-governor']) assert.ok(html.includes(`id="${panel}" role="tabpanel"`) && html.includes(`aria-controls="${panel}"`), panel);
console.log('Town Centre: item, speedup, governor and troop points, best-day totals, navigation and dictionaries pass.');

