// Upgrade savings: daily rates come from rises between readings (falls are spending, kept apart),
// nothing shows before enough readings, imports and resets restart the chain, the next KvK prep and
// Strongest Governor come from the event cycle, and goal projections say reached, short or no rate.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const Savings = require('../js/upgrade-savings.js'), Goals = require('../js/upgrade-goals.js'), Ledger = require('../js/player-ledger.js'), Rules = require('../js/event-rules.js');
const DAY = 864e5, T0 = Date.UTC(2026, 9, 1);
const at = d => new Date(T0 + d * DAY).toISOString();
const log = (id, rows) => rows.map(([d, before, after, source]) => ({ at: at(d), id, before, after, source: source || 'manual' }));

// Rises are income, falls are spending; the rate is income over the days the readings span.
let r = Savings.rate(log('truegold', [[0, null, 100], [2, 100, 160], [5, 160, 40, 'plan'], [10, 40, 140]]));
assert.deepEqual([r.intervals, r.days, r.gained, r.spent, r.enough], [3, 10, 160, 120, true]);
assert.equal(r.perDay, 16);
// Not enough: two intervals inside three days, or one interval however long.
assert.equal(Savings.rate(log('truegold', [[0, null, 100], [1, 100, 110], [2, 110, 120]])).enough, false);
assert.equal(Savings.rate(log('truegold', [[0, null, 100], [9, 100, 190]])).perDay, null);
assert.equal(Savings.rate([]).enough, false);
// A file import, a legacy migration or a reset is a reading, not income: the chain restarts there.
r = Savings.rate(log('mithril', [[0, null, 10], [3, 10, 20], [4, 20, 900, 'file'], [7, 900, 930]]));
assert.deepEqual([r.intervals, r.gained, r.days], [2, 40, 6]);
// A balance read again after being unknown starts a new chain too.
r = Savings.rate(log('mithril', [[0, null, 10], [3, 10, 20], [4, null, 500], [8, 500, 540]]));
assert.deepEqual([r.intervals, r.gained, r.days], [2, 50, 7]);
// Only the last four weeks before the latest reading count.
r = Savings.rate(log('satin', [[0, null, 0], [5, 0, 1000], [40, 1000, 1100], [45, 1100, 1200], [50, 1200, 1300]]));
assert.deepEqual([r.intervals, r.gained, r.days], [2, 200, 10]);
// Rates for the whole history, keyed by id.
const rates = Savings.rates(log('truegold', [[0, null, 0], [5, 0, 50], [10, 50, 100]]).concat(log('wood', [[0, null, 5]])));
assert.deepEqual(Object.keys(rates).sort(), ['truegold', 'wood']);
assert.equal(rates.truegold.perDay, 10);
assert.equal(rates.wood.enough, false);

// The next scoring events: day 1 of KvK prep (cycle day 22) and Strongest Governor (cycle day 8), soonest first.
const now = Date.UTC(2026, 9, 24, 12);
const next = Savings.next(now);
assert.deepEqual(next.map(x => x.event), ['prep', 'sg']);
next.forEach(x => {
  assert.equal(x.at, Rules.opens(x.event, 1, now));
  assert.equal(((x.at - Rules.EPOCH) / DAY) % Rules.CYCLE + 1, Rules.cycleDay(x.event, 1));
  assert.ok(x.at >= Math.floor(now / DAY) * DAY && x.at - now < Rules.CYCLE * DAY);
});
assert.deepEqual(next.map(x => new Date(x.at).toISOString().slice(0, 10)), ['2026-11-02', '2026-11-16']);
assert.deepEqual(next.map(x => x.days), [9, 23]);
// On the opening day itself, today counts.
assert.equal(Savings.next(next[0].at + 3600e3).find(x => x.event === 'prep').days, 0);

// Projections over UpgradeGoals' results.
function storage() { const values = new Map(); return { getItem: k => values.has(k) ? values.get(k) : null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) }; }
const store = Ledger.create(storage());
store.setBuildings({ 'town-center': '30', embassy: '30', academy: '30', barracks: '30', range: '30', stable: '30' });
['bread', 'wood', 'stone', 'iron'].forEach(id => store.setBalance(id, 1e9));
store.setBalance('truegold', 0); store.setBalance('tempered-truegold', 0);
const tg = { kind: 'building', target: 'town-center', level: 'TG 1' };
const base = Goals.evaluate(store.snapshot(), tg), tgLine = base.lines.find(l => l.id === 'truegold');
assert.equal(base.state, 'short');
const prep = next[0].at, until = (prep - now) / DAY;
// No history: the short line has no rate yet.
let p = Savings.project(base, {}, prep, now);
assert.equal(p.state, 'rate');
assert.deepEqual(p.lines.map(l => [l.id, l.short, l.perDay]), [['truegold', tgLine.short, null]]);
// A rate that covers the shortfall in time: reached, on the day the slowest line is covered.
const fast = { truegold: { enough: true, perDay: tgLine.short / 4 } };
p = Savings.project(base, fast, prep, now);
assert.equal(p.state, 'reached');
assert.equal(p.lines[0].left, 0);
assert.equal(p.lines[0].days, 4);
assert.equal(p.on, Math.floor(now / DAY) * DAY + 4 * DAY);
assert.ok(p.on <= prep);
// Too slow: short at the event by what the rate cannot cover.
const slow = { truegold: { enough: true, perDay: 1 } };
p = Savings.project(base, slow, prep, now);
assert.equal(p.state, 'short');
assert.equal(p.lines[0].gain, Math.floor(until));
assert.equal(p.lines[0].left, tgLine.short - Math.floor(until));
// A rate of zero never reaches.
assert.equal(Savings.project(base, { truegold: { enough: true, perDay: 0 } }, prep, now).state, 'short');
// A rate that is still learning is not a rate.
assert.equal(Savings.project(base, { truegold: { enough: false, perDay: null } }, prep, now).state, 'rate');
// Covered now, unknown balances, unrecorded levels, met and capped goals.
store.setBalance('truegold', 1e6);
assert.equal(Savings.project(Goals.evaluate(store.snapshot(), tg), {}, prep, now).state, 'covered');
store.setBalance('truegold', null);
assert.equal(Savings.project(Goals.evaluate(store.snapshot(), tg), fast, prep, now).state, 'unknown');
assert.equal(Savings.project(Goals.evaluate(store.snapshot(), { kind: 'pet', target: 'gray-wolf', level: 30 }), {}, prep, now).state, 'unknown');
assert.equal(Savings.project(Goals.evaluate(store.snapshot(), { kind: 'building', target: 'town-center', level: '25' }), {}, prep, now).state, 'skip');
// A pooled line (own shards, then general shards) needs a rate for both.
store.setHero('jabel', { level: 60, stars: 10, widget: 0, skills: null });
store.setBalance('hero-shards-jabel', 0); store.setBalance('mythic-hero-shard', 0);
const hero = Goals.evaluate(store.snapshot(), { kind: 'hero', target: 'jabel', level: 12 }), heroLine = hero.lines[0];
assert.equal(heroLine.pool, 'mythic-hero-shard');
assert.equal(Savings.project(hero, { 'hero-shards-jabel': { enough: true, perDay: 100 } }, prep, now).state, 'rate');
p = Savings.project(hero, { 'hero-shards-jabel': { enough: true, perDay: heroLine.short / 2 }, 'mythic-hero-shard': { enough: true, perDay: heroLine.short / 2 } }, prep, now);
assert.deepEqual([p.state, p.lines[0].perDay, p.lines[0].days], ['reached', heroLine.short, 1]);

// The ledger's own history feeds the rates, and all() keeps the goal order.
const live = storage(), ledger = Ledger.create(live);
ledger.setPriorityGoals([tg]);
live.setItem(Ledger.HISTORY_KEY, JSON.stringify({ schemaVersion: 1, entries: log('truegold', [[0, null, 0], [5, 0, 500], [10, 500, 1000]]) }));
['bread', 'wood', 'stone', 'iron'].forEach(id => ledger.setBalance(id, 1e9));
ledger.setBuildings({ 'town-center': '30', embassy: '30', academy: '30', barracks: '30', range: '30', stable: '30' });
ledger.setBalance('tempered-truegold', 0);
const out = Savings.all(Goals.all(ledger.snapshot()), ledger.history(), prep, now);
assert.equal(out.length, 1);
assert.equal(out[0].goal.target, 'town-center');
assert.equal(Savings.rates(ledger.history()).truegold.perDay, 100);

// Page wiring and dictionaries.
const pages = JSON.parse(fs.readFileSync('_data/pages.json', 'utf8'));
const page = Object.values(pages).find(x => x && x.token === 'priority');
const order = ['../js/event-rules.js', '../js/upgrade-goals.js', '../js/upgrade-savings.js', '../js/upgrade-goals-page.js', '../js/upgrade-savings-page.js'].map(s => page.scripts.indexOf(s));
assert.ok(order.every((n, i) => n >= 0 && (i === 0 || n > order[i - 1])), 'savings scripts load after the event rules and the goals');
const markup = fs.readFileSync('upgrade-priority/index.html', 'utf8'), script = fs.readFileSync('js/upgrade-savings-page.js', 'utf8');
assert.match(markup, /<section class="section" id="savings" data-module="upgrade-savings">/);
assert.match(markup, /<a href="#savings"/);
Savings.EVENTS.forEach(e => assert.match(markup, new RegExp('data-event="' + e + '"')));
const dict = lang => { const sandbox = { window: {} }; vm.runInNewContext(fs.readFileSync('i18n/' + lang + '.js', 'utf8'), sandbox); return sandbox.window.__BH_I18N_DATA[lang]; };
const en = dict('en'), used = new Set();
for (const m of markup.matchAll(/data-i18n="(priority\.savings[A-Za-z0-9.-]*)"/g)) used.add(m[1]);
for (const m of script.matchAll(/(?<![\w.])t(?:pl)?\('(savings[A-Za-z0-9.-]+)'/g)) if (!m[1].endsWith('.')) used.add('priority.' + m[1]);
['covered', 'reached', 'short', 'rate', 'unknown'].forEach(s => used.add('priority.savings.state.' + s));
Savings.EVENTS.forEach(e => used.add('priority.savings.event.' + e));
['', 'One', 'Today'].forEach(s => used.add('priority.savings.in' + s));
used.forEach(k => assert.ok(en[k], 'missing in en: ' + k));
const placeholders = text => (text.match(/\{\w+\}/g) || []).sort().join();
const keys = Object.keys(en).filter(k => k.startsWith('priority.savings'));
fs.readdirSync('i18n').filter(f => f.endsWith('.js') && f !== 'en.js').forEach(f => {
  const lang = f.slice(0, -3), d = dict(lang);
  keys.forEach(k => { assert.ok(d[k], lang + ' missing ' + k); assert.equal(placeholders(d[k]), placeholders(en[k]), lang + ' ' + k); });
});

console.log('Upgrade savings rates, spending, enough readings, chain breaks, next events, goal projections and ' + keys.length + ' keys in every language checked.');
