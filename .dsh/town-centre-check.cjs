// Town Centre: points from the whole ledger, page wiring and dictionaries.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const T = require('../js/town-centre-engine.js'), Ledger = require('../js/player-ledger.js'), rules = require('../js/event-rules.js');
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

// Items match the shared event rules exactly.
store.setBalance('mithril', 10); store.setBalance('forgehammer', 25); store.setBalance('hero-widget', 3);
assert.equal(T.day(store.snapshot(), 'prep', 4).lines.filter(l => l.kind === 'item').reduce((s, l) => s + l.points, 0), rules.calculate(store.snapshot(), 'prep', 4, {}, null).total);

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

// Page wiring: navigation, scripts, deck scene, dictionaries and copy keys.
const nav = require('../_data/nav.json'), pages = require('../_data/pages.json');
// The Town Centre sits outside the page ring: a fixed button in the deck and a ledger link, never a card.
assert.equal(nav.filter(n => n.self === 'town').length, 0);
assert.ok(!pages.town.swipePrev && !pages.town.swipeNext);
assert.ok(fs.readFileSync('_includes/page-deck.html', 'utf8').includes('class="deck-town" href="{{ p.depth }}town-centre/"'));
assert.ok(!fs.readFileSync('_includes/ascii/deck-scene.html', 'utf8').includes("'town'"));
for (const script of ['event-data.js', 'governor-data.js', 'event-rules.js', 'governor-engine.js', 'hero-gear-engine.js', 'town-centre-engine.js', 'town-centre.js']) assert.ok(pages.town.scripts.includes('../js/' + script), script);
assert.ok(pages.town.scripts.indexOf('../js/town-centre-engine.js') < pages.town.scripts.indexOf('../js/town-centre.js'));
const dictionaries = fs.readdirSync('i18n').filter(f => f.endsWith('.js')).map(file => { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync('i18n/' + file, 'utf8'), ctx); return [file, Object.values(ctx.window.__BH_I18N_DATA)[0]]; });
assert.equal(dictionaries.length, 17);
for (const [file, d] of dictionaries) for (const key of ['town.nav', 'town.title', 'town.cardLede', 'town.kicker']) assert.equal(typeof d[key], 'string', file + ' ' + key);
const en = dictionaries.find(([file]) => file === 'en.js')[1];
const html = fs.readFileSync('town-centre/index.html', 'utf8');
for (const match of html.matchAll(/data-i18n(?:-key)?="(town\.[a-zA-Z.]+)"/g)) assert.ok(en[match[1]], match[1]);
for (const kind of T.SPEEDUPS) assert.ok(en['town.speedup.' + kind.kind], kind.id);
const page = fs.readFileSync('js/town-centre.js', 'utf8');
const enBlock = page.slice(page.indexOf('var EN = {'), page.indexOf('};', page.indexOf('var EN = {')));
for (const match of enBlock.matchAll(/(?:^|[{,]\s*)'?([a-zA-Z.]+)'?: '/gm)) assert.ok(en['town.' + match[1]] !== undefined, 'town.' + match[1]);
assert.doesNotMatch(page, /innerHTML/);
for (const match of html.matchAll(/<details id="([^"]+)"/g)) assert.match(match[1], /^[a-z0-9-]+$/);
for (const panel of ['town-bag', 'town-speedups', 'town-resources', 'town-hero-gear', 'town-governor']) assert.ok(html.includes(`id="${panel}" role="tabpanel"`) && html.includes(`aria-controls="${panel}"`), panel);
console.log('Town Centre: item, speedup and governor points, best-day totals, navigation and dictionaries pass.');
