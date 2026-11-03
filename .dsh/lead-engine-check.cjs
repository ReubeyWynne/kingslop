// Lead engine check — js/lead-engine.js, the Heroes page's lead finder.
// Pins how a hero's stars, widget and skills reach the Bonus Details, the
// Bear score, the stock megafauna opponents and the ranking.
const assert = require('node:assert/strict');
const L = require('../js/lead-engine.js');
const catalogue = require('../_data/heroes.json'), combat = require('../_data/combat.json'), megafauna = require('../_data/megafauna.json');
const data = {
  curve: catalogue.curve,
  heroes: Object.fromEntries(catalogue.heroes.map(h => [h.key, { name: h.name, type: h.type, generation: h.generation, ceiling: h.ceiling }])),
  heroSkills: combat.heroSkills, widgets: combat.widgets, widgetSkill: combat.widgetSkill, megafauna
};
const near = (a, b, what, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${what}: ${a} vs ${b}`);
const flat = pct => { const row = { attack: pct, lethality: pct, defense: pct, health: pct }; return { inf: row, cav: row, arc: row }; };
const tg5 = { tier: [10, 10, 10], tg: [5, 5, 5] };
const copy = (key, stars, widget, skills = null) => L.copyOf(key, { stars, widget, skills }, data);

// Stars: the shared curve times the hero's ceiling, on its own type only
// (KINGSHOT-SOURCES.md, Amadeus 2★ = 260.20 × 31.78%).
{
  const p = L.panel(flat(100), [copy('amadeus', 12, 0)], data);
  near(p.atk[0], 100 + 260.20 * 0.3178, 'Amadeus 2★ attack');
  near(p.def[0], p.atk[0], 'defence equals attack');
  assert.equal(p.atk[1], 100); assert.equal(p.atk[2], 100);
}
// Widgets: level / 10 of the top value, entered as (100 + overview) × (1 + g) − 100.
{
  const p = L.panel(flat(250), [copy('marlin', 30, 10)], data);
  near(p.let[2], 350 * 1.6 - 100, 'Marlin widget 10 lethality');
  near(p.hea[2], 350 * 1.6 - 100, 'Marlin widget 10 health');
  near(L.panel(flat(250), [copy('rosa', 24, 6)], data).let[2], 350 * (1 + 0.6 * 92.5 / 100) - 100, 'Rosa widget 6');
  assert.equal(copy('saul', 30, 10).widget, 10, 'a widget hero keeps its level');
  assert.equal(copy('chenko', 30, 10).widget, 0, 'a hero without a widget has none');
}
// Skill levels: the stars cap them; a lower roster level wins.
assert.deepEqual(copy('amadeus', 12, 0).levels, [3, 3, 3]);
assert.deepEqual(copy('amadeus', 5, 0).levels, [1, 0, 0]);
assert.deepEqual(copy('amadeus', 30, 0, [5, 2, 4]).levels, [5, 2, 4]);
assert.deepEqual(copy('amadeus', 12, 0, [5, 5, 5]).levels, [3, 3, 3]);
assert.equal(L.copyOf('amadeus', { stars: null }, data), null, 'no stars, no lead');
// Uptime of a chance skill over the Bear's ten rounds.
near(L.uptime({ kind: 'passive' }), 1, 'passive');
near(L.uptime({ kind: 'perRound', chance: 0.4 }), 0.4, 'per round');
near(L.uptime({ kind: 'perRound', chance: 0.2, turns: 2 }), 0.36, 'lasting two rounds');
near(L.uptime({ kind: 'everyN', every: 4, offset: 3, turns: 1 }), 0.2, 'every fourth round from the fourth');

// The Bear: Rosa against a 5★, widget-10 Marlin beside the same Amadeus and Petra.
{
  const lead = (key, stars, widget) => L.bear(flat(250), [copy('amadeus', 30, 10), copy('petra', 30, 10), copy(key, stars, widget)], tg5, data);
  const marlin = lead('marlin', 30, 10).score;
  const ratio = (s, w) => lead('rosa', s, w).score / marlin;
  assert.ok(ratio(24, 6) < 1, '4★ widget 6 Rosa is behind');
  assert.ok(ratio(24, 8) > 1, '4★ widget 8 Rosa is ahead');
  assert.ok(ratio(24, 7) > ratio(24, 6) && ratio(24, 8) > ratio(24, 7), 'each widget level helps');
  const mix = lead('marlin', 30, 10).mix;
  near(mix[0] + mix[1] + mix[2], 1, 'the ideal mix is whole');
  assert.ok(mix[2] > 0.5, 'archers carry the Bear');
}
// Defensive skills add no Bear damage: Rosa's Rose of War is enemy damage down.
assert.deepEqual(L.bearMod([{ kind: 'passive', effects: [{ code: 201, pct: 20 }] }]), [1, 1, 1]);

// Megafauna: four rising opponents for every generation.
assert.deepEqual(megafauna.foes.map(f => f.id), ['manta', 'shark', 'orca', 'whale']);
for (const gen of megafauna.generations) {
  const g = String(gen);
  for (const job of ['rally', 'garrison']) assert.deepEqual(megafauna.lineups[g][job].map(k => data.heroes[k].type), ['inf', 'cav', 'arc'], `gen ${g} ${job}`);
  assert.ok(megafauna.overview[g] > 0 && megafauna.troops[g].tier === 10);
  assert.ok(megafauna.lineups[g].rally.every(k => data.heroes[k].generation <= gen), `gen ${g} heroes exist by then`);
  const power = megafauna.foes.map(f => { const s = L.opponent(f, gen, 'rally', data).side; return s.atk[0] + s.let[0]; });
  for (let i = 1; i < power.length; i++) assert.ok(power[i] > power[i - 1], `gen ${g} opponents rise`);
}
for (const mix of Object.values(megafauna.mix)) for (const side of Object.values(mix)) near(side[0] + side[1] + side[2], 1, 'troop mix');
assert.deepEqual(L.opponent(megafauna.foes[0], 1, 'rally', data).side.tg, [0, 0, 0], 'Truegold never goes below 0');
assert.equal(L.opponent(megafauna.foes[3], 4, 'rally', data).lineup[2].key, 'jaeger', 'a rally faces their garrison lineup');
assert.equal(L.opponent(megafauna.foes[3], 4, 'garrison', data).lineup[2].key, 'rosa', 'a garrison faces their rally lineup');

// Candidates and lineups: one hero per type, an empty seat when a type has none.
{
  const roster = { amadeus: { stars: 30, widget: 10 }, helga: { stars: 6 }, marlin: { stars: 30, widget: 10 }, rosa: { stars: 24, widget: 6 }, zoe: { stars: null } };
  const by = L.candidates(roster, data);
  assert.deepEqual(by.inf.map(c => c.key), ['amadeus', 'helga']);
  assert.deepEqual(by.cav, [null]);
  assert.equal(L.lineups(by).length, 4);
  const bear = L.rank('bear', { overview: flat(250), roster, troops: tg5, gen: 4 }, data);
  assert.equal(bear[0].lineup[0].key, 'amadeus');
  assert.ok(bear.every((r, i) => i === 0 || r.score <= bear[i - 1].score), 'best first');
  const rally = L.rank('rally', { overview: flat(250), roster, troops: tg5, gen: 4, battles: 4 }, data);
  assert.equal(rally[0].foes.length, 4);
  assert.deepEqual(L.rank('rally', { overview: flat(250), roster, troops: tg5, gen: 4, battles: 4 }, data).map(r => r.score), rally.map(r => r.score), 'the same inputs give the same ranking');
  assert.equal(L.lineups(L.candidates({}, data)).length, 0, 'no heroes, no lineups');
}
console.log('Lead engine: stars, widgets, skill caps, Bear score, megafauna opponents and ranking pass.');
