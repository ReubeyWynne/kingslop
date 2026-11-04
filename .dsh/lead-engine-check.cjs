// Lead engine check — js/lead-engine.js, the Heroes page's lead finder.
// Pins how a hero's stars, widget and skills reach the Bonus Details, the
// Bear score, the stock megafauna opponents and the ranking.
const assert = require('node:assert/strict');
const L = require('../js/lead-engine.js');
const catalogue = require('../_data/heroes.json'), combat = require('../_data/combat.json'), megafauna = require('../_data/megafauna.json'), petData = require('../_data/pets.json');
const data = {
  curve: catalogue.curve,
  heroes: Object.fromEntries(catalogue.heroes.map(h => [h.key, { name: h.name, type: h.type, generation: h.generation, ceiling: h.ceiling }])),
  heroSkills: combat.heroSkills, widgets: combat.widgets, widgetSkill: combat.widgetSkill, megafauna,
  // js/lead-data.liquid's pets: the combat layer's stat and side, the pet's last ladder row.
  pets: combat.layers.pet.map(layer => { const pet = petData.pets.find(p => p.id === layer.pet); return { id: layer.pet, name: pet.name, stat: layer.stat, side: layer.side, generation: pet.generation, maxLevel: pet.maxLevel, values: pet.skill.ladder.at(-1).values.map(parseFloat) }; })
};
const near = (a, b, what, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${what}: ${a} vs ${b}`);
const flat = pct => { const row = { attack: pct, lethality: pct, defense: pct, health: pct }; return { inf: row, cav: row, arc: row }; };
const tg5 = { tier: [10, 10, 10], tg: [5, 5, 5] };
const copy = (key, stars, widget, skills = null) => L.copyOf(key, { stars, widget, skills }, data);
const you = (overview, extra = {}) => ({ overview, troops: tg5, joiners: [], city: L.blank(), pets: L.blank(), ...extra });

// Stars: the shared curve times the hero's ceiling, on its own type only
// (KINGSHOT-SOURCES.md, Amadeus 2★ = 260.20 × 31.78%).
{
  const p = L.panel(flat(100), [copy('amadeus', 12, 0)], data);
  near(p.atk[0], 100 + 260.20 * 0.3178, 'Amadeus 2★ attack');
  near(p.def[0], p.atk[0], 'defence equals attack');
  assert.equal(p.atk[1], 100); assert.equal(p.atk[2], 100);
}
// Widgets add level / 10 of the top value to lethality and health; hero gear adds its core
// (helm and boots lethality, gloves and chest health) and red milestones. Checked against the
// game's Hero Stats, Expedition block, for the owner's heroes on 4 November 2026:
//   Marlin 5★, Mistweaver 10, helm red 131 M11, gloves 62 M2, chest 62 M2, boots 100 M6
//     → Archer Attack 260.19, Defense 240.19, Lethality 277.55, Health 148.08
//   Amadeus 3★ 4/6, Aegis of Fate 4, helm 61 M3, gloves red 133 M11, chest 100 M7, boots 65 M3
//     → Infantry 156.92, 176.92, 121.33, 249.65
//   Petra 4★ 3/6, Fate's Writ 3, helm 51 M2, gloves 34 M1, chest 34 M1, boots 48 M1
//     → Cavalry 240.48, 240.48, 95.40, 80.18
{
  const m = q => ({ quality: q[0], level: q[1], mastery: q[2] });
  const set = (type, [helm, gloves, chest, boots]) => ({ [type + '-helm']: m(helm), [type + '-gloves']: m(gloves), [type + '-chest']: m(chest), [type + '-boots']: m(boots) });
  const gear = L.gearLayer({
    ...set('arc', [['red', 131, 11], ['mythic', 62, 2], ['mythic', 62, 2], ['mythic', 100, 6]]),
    ...set('inf', [['mythic', 61, 3], ['red', 133, 11], ['mythic', 100, 7], ['mythic', 65, 3]]),
    ...set('cav', [['mythic', 51, 2], ['mythic', 34, 1], ['mythic', 34, 1], ['mythic', 48, 1]])
  });
  const p = L.panel(flat(0), [copy('amadeus', 22, 4), copy('petra', 27, 3), copy('marlin', 30, 10)], data, gear);
  const game = { atk: [156.92, 240.48, 260.19], def: [176.92, 240.48, 240.19], let: [121.33, 95.40, 277.55], hea: [249.65, 80.18, 148.08] };
  for (const f of Object.keys(game)) game[f].forEach((want, t) => assert.ok(Math.abs(p[f][t] - want) < 0.02, `${f} ${t}: ${p[f][t]} vs the game's ${want}`));
  // A battle report with that lineup and the overview + Squads' rows matches its defence to
  // within 4.4 points and its health to within 9.2 on every type (the rest are live buffs).
  const ov = { inf: { attack: 380.9, defense: 373.2, lethality: 264.1, health: 256.8 }, cav: { attack: 318.1, defense: 329.7, lethality: 243.9, health: 218.0 }, arc: { attack: 337.3, defense: 348.9, lethality: 303.7, health: 296.5 } };
  const r = L.panel(ov, [copy('amadeus', 22, 4), copy('petra', 27, 3), copy('marlin', 30, 10)], data, gear);
  [554.5, 574.5, 593.4].forEach((want, t) => assert.ok(want - r.def[t] >= 0 && want - r.def[t] < 4.5, 'report defence ' + t));
  [515.7, 307.2, 453.7].forEach((want, t) => assert.ok(want - r.hea[t] >= 0 && want - r.hea[t] < 9.3, 'report health ' + t));
  // No gear saved adds nothing; a widget alone adds its stat.
  near(L.panel(flat(250), [copy('marlin', 30, 10)], data).let[2], 310, 'Marlin widget 10 lethality, no gear');
  near(L.panel(flat(250), [copy('rosa', 24, 6)], data).hea[2], 250 + 0.6 * 92.5, 'Rosa widget 6');
  assert.deepEqual(L.gearLayer({}).arc, { atk: 0, def: 0, let: 0, hea: 0 });
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
  const lead = (key, stars, widget) => L.bear(you(flat(250)), [copy('amadeus', 30, 10), copy('petra', 30, 10), copy(key, stars, widget)], data);
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
  const power = megafauna.foes.map(f => { const o = L.opponent(f, gen, 'rally', data), s = L.battleSide(o, o.lineup, o.role, you(flat(0)), data); return (1 + s.atk[0] / 100) * (1 + s.let[0] / 100); });
  for (let i = 1; i < power.length; i++) assert.ok(power[i] > power[i - 1], `gen ${g} opponents rise`);
}
for (const mix of Object.values(megafauna.mix)) for (const side of Object.values(mix)) near(side[0] + side[1] + side[2], 1, 'troop mix');
assert.deepEqual(L.opponent(megafauna.foes[0], 1, 'rally', data).troops.tg, [0, 0, 0], 'Truegold never goes below 0');
assert.equal(L.opponent(megafauna.foes[3], 4, 'rally', data).lineup[2].key, 'jaeger', 'a rally faces their garrison lineup');
assert.equal(L.opponent(megafauna.foes[3], 4, 'garrison', data).lineup[2].key, 'rosa', 'a garrison faces their rally lineup');

// Candidates and lineups: one hero per type, an empty seat when a type has none.
{
  const roster = { amadeus: { stars: 30, widget: 10 }, helga: { stars: 6 }, marlin: { stars: 30, widget: 10 }, rosa: { stars: 24, widget: 6 }, zoe: { stars: null } };
  const by = L.candidates(roster, data);
  assert.deepEqual(by.inf.map(c => c.key), ['amadeus', 'helga']);
  assert.deepEqual(by.cav, [null]);
  assert.equal(L.lineups(by).length, 4);
  const bear = L.rank('bear', you(flat(250)), data, { roster, gen: 4 });
  assert.equal(bear[0].lineup[0].key, 'amadeus');
  assert.ok(bear.every((r, i) => i === 0 || r.score <= bear[i - 1].score), 'best first');
  const rally = L.rank('rally', you(flat(250)), data, { roster, gen: 4, battles: 4 });
  assert.equal(rally[0].foes.length, 4);
  assert.deepEqual(L.rank('rally', you(flat(250)), data, { roster, gen: 4, battles: 4 }).map(r => r.score), rally.map(r => r.score), 'the same inputs give the same ranking');
  assert.equal(L.lineups(L.candidates({}, data)).length, 0, 'no heroes, no lineups');
}

// Joiners: their first skills join the lead's, four at most, highest level first.
{
  const lineup = [copy('amadeus', 30, 10), copy('petra', 30, 10), copy('marlin', 30, 10)];
  const alone = L.bear(you(flat(250)), lineup, data).score;
  const joined = L.bear(you(flat(250), { joiners: [{ key: 'chenko', level: 5 }, { key: 'amane', level: 5 }] }), lineup, data).score;
  near(joined / alone > 1 ? 1 : 0, 1, 'attack joiners add Bear damage');
  const five = [1, 2, 3, 4, 5].map(level => ({ key: 'chenko', level }));
  near(L.bear(you(flat(250), { joiners: five.slice(1) }), lineup, data).score, L.bear(you(flat(250), { joiners: five }), lineup, data).score, 'only four joiners count');
  near(L.bear(you(flat(250), { joiners: [{ key: 'saul', level: 5 }] }), lineup, data).score, alone, 'defensive joiners add no Bear damage');
}
// Pets: a skill steps every ten levels; the kingdom's generation gates them.
{
  const rhino = data.pets.find(p => p.id === 'giant-rhino');
  assert.equal(L.petLevelPct(rhino, 0), 0); assert.equal(L.petLevelPct(rhino, 1), 2.5); assert.equal(L.petLevelPct(rhino, 10), 2.5);
  assert.equal(L.petLevelPct(rhino, 11), 3); assert.equal(L.petLevelPct(rhino, 100), 10);
  const layer = L.petLayer({ 'giant-rhino': 100, 'grizzly-bear': 80, 'moose': 70 }, data);
  assert.equal(layer.attack, 10); assert.equal(layer.enemyLethality, 5); assert.equal(layer.enemyHealth, 5);
  assert.equal(L.petLayer({ 'giant-rhino': 100 }, data, 3).attack, 0, 'no Rhino before generation 4');
}
// Layers: each multiplies the stat; an enemy debuff cancels only in its own layer.
{
  const p = { atk: [100, 100, 100], let: [100, 100, 100], def: [100, 100, 100], hea: [100, 100, 100] };
  const own = { city: L.cityLayer({ attack: 20 }), pet: { ...L.blank(), attack: 10 } };
  near(L.layered(p, own, null).atk[0], 200 * 1.2 * 1.1 - 100, 'city and pet attack multiply');
  near(L.layered(p, { city: L.cityLayer({ defense: 20 }), pet: L.blank() }, null).def[0], 100, 'no defence layer against the Bear');
  const foe = { city: L.cityLayer({ enemyAttack: 20 }), pet: L.blank() };
  near(L.layered(p, own, foe).atk[0], 200 * 1.0 * 1.1 - 100, 'their attack-down cancels your city attack, not your pet');
}
// Stock opponents carry their joiners, pets and city buffs.
{
  const whale = L.opponent(megafauna.foes[3], 6, 'rally', data), manta = L.opponent(megafauna.foes[0], 6, 'rally', data);
  assert.equal(whale.joiners.length, 4); assert.equal(whale.joiners[0].level, 5);
  assert.equal(whale.pets.health, 10); assert.equal(whale.city.attack, 20);
  assert.equal(manta.pets.attack, 0); assert.equal(manta.city.attack, 0);
}
console.log('Lead engine: stars, widgets, skill caps, Bear score, joiners, pets, city layers, megafauna opponents and ranking pass.');
