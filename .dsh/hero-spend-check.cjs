// Hero spending plan: star and widget curves, whole steps, general shard and chest sharing,
// unknowns, and the Heroes page wiring that shows it.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const S = require('../js/hero-spend.js'), Ledger = require('../js/player-ledger.js'), rules = require('../js/event-rules.js');
const storage = () => ({ getItem(k) { return this[k] ?? null; }, setItem(k, v) { this[k] = v; } });

// Curves: 0★ to 5★ is 1,065 shards in 30 steps; widget 0 to 10 is 275.
assert.equal(S.STAR_STEPS.length, Ledger.HERO.stars);
assert.equal(S.STAR_STEPS.reduce((a, b) => a + b), 1065);
assert.deepEqual([0, 6, 12, 18, 24].map(i => S.STAR_STEPS.slice(i, i + 6).reduce((a, b) => a + b)), [10, 40, 115, 300, 600]);
assert.equal(S.WIDGET_STEPS.length, Ledger.HERO.widget);
assert.equal(S.WIDGET_STEPS.reduce((a, b) => a + b), 275);
assert.equal(S.HEROES.length, 34);
for (const key of S.EXCLUSIVE) assert.equal(S.HEROES.find(h => h.key === key).rarity, 'legendary');
for (const id of S.ITEMS) assert.ok(rules.data.items.some(item => item.id === id), id);

// The allocation never beats an exhaustive search, and never wastes general pieces on a tie.
function totals(from, steps = S.STAR_STEPS) { const t = [0]; for (let i = from; i < steps.length; i++) t.push(t.at(-1) + steps[i]); return t; }
function brute(pool, groups) {
  let best = { consumed: -1, general: 0 };
  (function walk(at, general, consumed) {
    if (general > pool) return;
    if (at === groups.length) { if (consumed > best.consumed || consumed === best.consumed && general < best.general) best = { consumed, general }; return; }
    const g = groups[at];
    for (let j = 0; j < g.totals.length; j++) { const need = Math.max(0, g.totals[j] - g.own); if (need && !g.shared) break; walk(at + 1, general + need, consumed + g.totals[j]); }
  })(0, 0, 0);
  return best;
}
let seed = 7; const random = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
for (let trial = 0; trial < 300; trial++) {
  const groups = Array.from({ length: 1 + random(3) }, () => ({ totals: totals(18 + random(13)), own: random(250), shared: random(5) > 0 }));
  const pool = random(400), picks = S.allocate(pool, groups), want = brute(pool, groups);
  const consumed = picks.reduce((sum, p, i) => sum + groups[i].totals[p.steps], 0), general = picks.reduce((sum, p) => sum + p.general, 0);
  assert.ok(general <= pool);
  picks.forEach((p, i) => { assert.equal(p.general, Math.max(0, groups[i].totals[p.steps] - groups[i].own)); if (!groups[i].shared) assert.equal(p.general, 0); });
  assert.deepEqual({ consumed, general }, want, JSON.stringify({ pool, groups: groups.map(g => [g.totals.length, g.own, g.shared]) }));
}

// A plan from the ledger.
const store = Ledger.create(storage());
let plan = S.plan(store.snapshot());
assert.deepEqual(plan.unknown, ['heroes'], 'nothing recorded is unknown, not zero');
assert.equal(plan.items['mythic-hero-shard'].amount, 0);

// Whole steps only: 99 shards at 4★ 0/6 cannot pay the 100-shard step.
store.setHero('petra', { stars: 24, widget: 0 }); store.setBalance(Ledger.heroShardId('petra'), 99);
plan = S.plan(store.snapshot());
assert.equal(plan.heroes.petra.shards.spend, 0);
assert.ok(plan.unknown.includes('mythic-hero-shard') && plan.unknown.includes(Ledger.widgetChestId(3)) && plan.unknown.includes(Ledger.heroWidgetId('petra')));
store.setBalance('mythic-hero-shard', 1);
plan = S.plan(store.snapshot());
assert.deepEqual([plan.heroes.petra.shards.spend, plan.heroes.petra.shards.general, plan.heroes.petra.shards.to], [100, 1, 25]);
assert.equal(plan.items['mythic-hero-shard'].left, 0);

// A maxed hero spends nothing, however many shards it holds.
store.setHero('petra', { stars: 30, widget: 10 });
plan = S.plan(store.snapshot());
assert.deepEqual([plan.heroes.petra.shards.spend, plan.heroes.petra.shards.toMax, plan.items['mythic-hero-shard'].left], [0, 0, 1]);

// Amadeus and Helga take only their own shards; general shards go to everyone else of the rarity.
store.setHero('petra', null); store.setBalance(Ledger.heroShardId('petra'), null);
store.setHero('helga', { stars: 0 }); store.setBalance(Ledger.heroShardId('helga'), 0); store.setBalance('mythic-hero-shard', 1000);
plan = S.plan(store.snapshot());
assert.equal(plan.heroes.helga.shards.spend, 0);
assert.equal(plan.items['mythic-hero-shard'].left, 1000);
assert.ok(!plan.unknown.includes('mythic-hero-shard'));

// Rarity matters: epic general shards never reach a mythic hero.
store.setHero('helga', null); store.setHero('chenko', { stars: 0 }); store.setBalance(Ledger.heroShardId('chenko'), 0); store.setBalance('epic-hero-shard', 4);
plan = S.plan(store.snapshot());
assert.deepEqual([plan.heroes.chenko.shards.spend, plan.items['epic-hero-shard'].left, plan.items['mythic-hero-shard'].amount], [4, 0, 0]);

// Widgets: per hero, plus that generation's choose-a-hero chests and nobody else's.
store.setHero('chenko', null);
store.setHero('amadeus', { stars: 30, widget: 0 }); store.setBalance(Ledger.heroShardId('amadeus'), 0); store.setBalance(Ledger.heroWidgetId('amadeus'), 4);
store.setHero('zoe', { stars: 30, widget: 0 }); store.setBalance(Ledger.heroShardId('zoe'), 0); store.setBalance(Ledger.heroWidgetId('zoe'), 0);
store.setBalance(Ledger.widgetChestId(1), 1); store.setBalance(Ledger.widgetChestId(2), 0);
plan = S.plan(store.snapshot());
assert.deepEqual([plan.heroes.amadeus.widget.spend, plan.heroes.amadeus.widget.general, plan.heroes.zoe.widget.spend], [5, 1, 0]);
assert.equal(plan.items['hero-widget'].amount, 5);
store.setBalance(Ledger.widgetChestId(2), 15);
plan = S.plan(store.snapshot());
assert.deepEqual([plan.heroes.zoe.widget.spend, plan.heroes.zoe.widget.to, plan.items['hero-widget'].left], [15, 2, 0]);

// The budget hands event rules the spendable counts, and points use each item's best day.
const budget = S.budget(store.snapshot(), plan);
assert.equal(budget.inventory['hero-widget'].amount, 20);
assert.equal(rules.calculate(budget, 'prep', 4, {}, null).items.find(i => i.id === 'hero-widget').points, 20 * 8000);
assert.deepEqual(S.rate(rules, 'prep', 'mythic-hero-shard'), { day: 2, rate: 3040 });
assert.equal(S.points(rules, 'prep', plan.heroes.zoe).total, 15 * 8000);
assert.deepEqual(S.missing('hero-stars-zoe'), { kind: 'stars', hero: S.HEROES.find(h => h.key === 'zoe') });
assert.deepEqual(S.missing('hero-widget-chest-gen4'), { kind: 'chest', hero: null, generation: 4 });
assert.equal(S.missing('mithril'), null);

// Heroes page: the panel, its scripts in order, a deep-linkable section and English copy.
const pages = require('../_data/pages.json'), html = fs.readFileSync('heroes/index.html', 'utf8');
const order = ['event-data.js', 'event-rules.js', 'hero-data.js', 'hero-spend.js', 'hero-directory-engine.js', 'hero-points.js'].map(f => pages.heroes.scripts.indexOf('../js/' + f));
assert.ok(order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1])), order.join());
assert.ok(html.includes('id="kvk-points" data-module="hero-points"') && html.includes('href="#kvk-points"'));
assert.equal(fs.readFileSync('_includes/heroes/roster.html', 'utf8').match(/data-field="widgets"/g).length, 1);
const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync('i18n/en.js', 'utf8'), ctx);
const en = ctx.window.__BH_I18N_DATA.en, source = fs.readFileSync('js/hero-points.js', 'utf8');
for (const match of (html + fs.readFileSync('_includes/heroes/roster.html', 'utf8')).matchAll(/data-i18n="(spend\.[a-zA-Z.]+)"/g)) assert.ok(en[match[1]], match[1]);
const block = source.slice(source.indexOf('var EN = {'), source.indexOf('};', source.indexOf('var EN = {')));
for (const match of block.matchAll(/'([a-zA-Z.]+)': '/g)) assert.ok(en['spend.' + match[1]] !== undefined, 'spend.' + match[1]);
for (const match of block.matchAll(/(?:^|[{,]\s*)([a-zA-Z]+): '/gm)) assert.ok(en['spend.' + match[1]] !== undefined, 'spend.' + match[1]);
assert.doesNotMatch(source, /innerHTML/);
console.log('Hero spending: curves, whole steps, shared shards and chests, exclusives, unknowns, budgets and the Heroes page pass.');
