// Lead engine check — js/lead-engine.mjs, the Heroes page's lead finder.
// Pins how a hero's stars, widget and skills reach the Bonus Details, the
// Bear score, the stock megafauna opponents and the ranking.
const assert = require('node:assert/strict');
const L = require('../js/lead-engine.mjs');
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
  // Battle reports against Bonus Overviews read just before them, on three accounts (no buffs
  // running): Bonus Details = (100 + overview + Squads' + Hero Stats + Town Centre TG)
  //   × (1 + the lead's widget skills in their role) − 100.
  // Masters (Cassia's affinity and skills included) are already in the overview; the Town
  // Centre's Truegold bonus is not. Joiners' skills never show in Bonus Details.
  const lineup = [copy('amadeus', 22, 4), copy('petra', 27, 3), copy('marlin', 30, 10)];
  assert.deepEqual(L.townLayer('TG 4'), { atk: 4, def: 4, let: 9, hea: 9, tg: 4, known: true });
  assert.deepEqual(L.townLayer('TG4-2'), L.townLayer('TG 4'), 'sub-levels read as their TG level');
  assert.deepEqual(L.townLayer('TG 3'), { atk: 0, def: 0, let: 0, hea: 0, tg: 3, known: false }, 'an unread level adds nothing and says so');
  assert.deepEqual(L.townLayer('25'), { atk: 0, def: 0, let: 0, hea: 0, tg: 0, known: true }, 'before Truegold, nothing');
  const sum = (ov) => Object.fromEntries(['inf', 'cav', 'arc'].map(t => [t, Object.fromEntries(['attack', 'defense', 'lethality', 'health'].map((s, i) => [s, ov.sq[i] + ov[t][i]]))]));
  const fits = (what, ov, line, set, tg, want) => {
    const r = L.reportPanel(L.panel(sum(ov), line, data, set.inf ? set : L.gearLayer(set), L.townLayer(tg)), line, 'rally', data);
    for (const f of Object.keys(want)) want[f].forEach((v, t) => assert.ok(Math.abs(r[f][t] - v) < 0.25, `${what} ${f} ${t}: ${r[f][t].toFixed(2)} vs ${v}`));
  };
  // The owner's Bonus Overview with the Squads' row already added to each type.
  const owner = { sq: [0, 0, 0, 0], inf: [389.3, 373.6, 264.2, 257.0], cav: [326.5, 330.1, 244.0, 218.0], arc: [345.7, 349.3, 303.8, 296.6] };
  // The owner, TG4, rally on Titan Roc 2026-11-04 16:21 (a second report later the same day was identical).
  fits('owner TG4', owner, lineup, gear, 'TG 4',
    { atk: [631.5, 654.9, 698.6], def: [554.5, 574.5, 593.4], let: [468.7, 415.7, 693.9], hea: [515.7, 307.2, 453.7] });
  const piece = (q, l, ma) => ({ quality: q, level: l, mastery: ma });
  const four = (t, [h, g, c, b]) => ({ [t + '-helm']: h, [t + '-gloves']: g, [t + '-chest']: c, [t + '-boots']: b });
  // An alliance member at TG5: the same three heroes, read off the report (a red piece's "+N" is level 100 + N).
  fits('TG5', { sq: [180.2, 159.7, 51.1, 39.0], inf: [211.8, 194.3, 203.5, 206.4], cav: [216.6, 209.1, 176.0, 176.0], arc: [234.9, 213.2, 187.5, 190.7] },
    [copy('amadeus', 24, 3), copy('petra', 29, 3), copy('marlin', 26, 6)],
    { ...four('inf', [piece('red', 106, 10), piece('red', 103, 11), piece('red', 103, 10), piece('mythic', 93, 7)]), ...four('cav', [piece('mythic', 90, 2), piece('red', 103, 10), piece('mythic', 100, 2), piece('mythic', 83, 2)]), ...four('arc', [piece('mythic', 82, 7), piece('red', 101, 10), piece('red', 101, 10), piece('red', 101, 10)]) },
    'TG 5', { atk: [648.5, 748.6, 682.4], def: [542.4, 643.4, 569.0], let: [529.4, 415.7, 518.1], hea: [487.3, 411.1, 479.7] });
  // And one at TG2: Zoe, Chenko and Marlin.
  fits('TG2', { sq: [142.5, 136.0, 44.5, 34.3], inf: [151.8, 141.6, 176.4, 164.0], cav: [131.6, 123.1, 166.6, 164.7], arc: [132.6, 123.1, 197.5, 188.5] },
    [copy('zoe', 30, 3), copy('chenko', 30, 0), copy('marlin', 24, 4)],
    { ...four('inf', [piece('mythic', 50, 2), piece('mythic', 60, 3), piece('mythic', 51, 3), piece('mythic', 50, 2)]), ...four('cav', [piece('mythic', 100, 3), piece('mythic', 50, 2), piece('mythic', 50, 2), piece('mythic', 61, 3)]), ...four('arc', [piece('red', 121, 11), piece('mythic', 61, 3), piece('mythic', 60, 2), piece('mythic', 90, 4)]) },
    'TG 2', { atk: [538.5, 418.3, 465.7], def: [521.8, 403.3, 429.7], let: [348.3, 355.2, 500.0], hea: [305.8, 277.0, 337.2] });
  const r = L.reportPanel(L.panel(sum(owner), lineup, data, gear, L.townLayer('TG 4')), lineup, 'rally', data);
  assert.deepEqual(L.reportPanel(r, lineup, 'defender', data), r, 'rally widgets do nothing in a garrison');
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
// One Bear model: the lead finder's score is js/battle-engine.mjs bearExpect, the exact
// expectation of the ten-round hunt the damage card samples. A skill's worth is its
// damage with it over without it, so skill(...) is that factor for a 2/16/82 march.
{
  const E = require('../js/battle-engine.mjs');
  const side = (skills, n = [2000, 16000, 82000]) => ({ n, tier: [10, 10, 10], tg: [0, 0, 0], atk: [300, 300, 300], let: [300, 300, 300], skills });
  const skill = (skills, n) => E.bearExpect(side(skills, n)).mean / E.bearExpect(side([], n)).mean;
  near(skill([{ kind: 'passive', effects: [{ code: 102, pct: 25 }] }]), 1.25, 'passive');
  near(skill([{ kind: 'perRound', chance: 0.4, effects: [{ code: 102, pct: 50 }] }]), 1.2, 'per round');
  near(skill([{ kind: 'everyN', every: 4, offset: 3, turns: 1, effects: [{ code: 102, pct: 100 }] }]), 1 + 100 * (0.9998 + 0.9992) / 100 / (10 - 0.0055), 'every fourth round from the fourth', 1e-4);
  // Evil Eye and Infinite Arsenal: 50% on each type's attack, one success holds +50% enemy
  // damage taken for the whole turn, and 211 does nothing on turn 1 (Strat Game Sloth,
  // 2026-11-12): 0.875 × 50% over nine of ten rounds is about +39%. Archers alone roll once.
  const evil = { kind: 'anyAttack', chance: 0.5, effects: [{ code: 211, pct: 50 }] };
  near(skill([evil]), 1 + 0.875 * 0.5 * 0.9, 'Evil Eye', 1e-3);
  near(skill([evil], [0, 0, 100000]), 1 + 0.5 * 0.5 * 0.9, 'Evil Eye with archers alone', 1e-3);
  near(skill([{ kind: 'passive', effects: [{ code: 211, pct: 25 }] }]), 1 + 0.25 * 0.9, '211 is dead on turn 1', 1e-3);
  near(skill([evil, { ...evil }]), skill([evil]), 'Petra and Zoe together: the duplicate is dead');
  // The expectation and the simulation are one model: their means agree.
  const C = require('../js/combat.mjs');
  const kit = C.side(data, { role: 'rally', heroes: [{ key: 'amadeus', widget: 10 }, { key: 'petra', widget: 10 }, { key: 'yang', widget: 10 }], joiners: ['amane', 'amane', 'chenko', 'vivian'].map(key => ({ key, level: 5 })) });
  const full = { ...side(kit), tg: [5, 5, 5] };
  near(E.bearHunt(full, 20000, 3).mean / E.bearExpect(full).mean, 1, 'simulated mean = expected', 0.005);
}

// The Bear: Rosa against a 5★, widget-10 Marlin beside the same Amadeus and Petra.
{
  const lead = (key, stars, widget) => L.bear(you(flat(250)), [copy('amadeus', 30, 10), copy('petra', 30, 10), copy(key, stars, widget)], data);
  const marlin = lead('marlin', 30, 10).score;
  const ratio = (s, w) => lead('rosa', s, w).score / marlin;
  // Marlin's chance skills do not stack with Amadeus's and Petra's of the same code;
  // they are dead duplicates. Rosa's fixed ones do stack, which moves the breakpoint
  // down to a 4★ widget-5 Rosa. Marlin's damage-dealt chances (104) multiply with
  // Petra's attack-up one (102) rather than dying behind it.
  assert.ok(ratio(24, 4) < 1, '4★ widget 4 Rosa is behind');
  assert.ok(ratio(24, 5) > 1, '4★ widget 5 Rosa is ahead');
  assert.ok(ratio(24, 5) > ratio(24, 4) && ratio(24, 6) > ratio(24, 5), 'each widget level helps');
  const mix = lead('marlin', 30, 10).mix;
  near(mix[0] + mix[1] + mix[2], 1, 'the ideal mix is whole');
  assert.ok(mix[2] > 0.5, 'archers carry the Bear');
}
// Bear damage on the game's Damage Points: √N in the march size, Valora's talent on top.
{
  const plain = n => ({ n, tier: [10, 10, 10], tg: [0, 0, 0], atk: [300, 300, 300], let: [300, 300, 300], skills: [] });
  const E = require('../js/battle-engine.mjs');
  near(E.bearHunt(plain([0, 0, 400000]), 1).mean / E.bearHunt(plain([0, 0, 100000]), 1).mean, 2, 'four times the troops, twice the damage', 0.01);
  near(E.bearHunt(plain([0, 0, 100000]), 1, 1, 30).mean / E.bearHunt(plain([0, 0, 100000]), 1).mean, 1.3, 'Valora at +30%');
  assert.equal(E.bearHunt(plain([0, 0, 100000]), 500).hunts, 500, 'archers volley, so hunts differ');
}
assert.equal(L.valoraPoints({ affinity: 90, ready: true, skills: [0, 0, 0, 0] }), 24, 'a class waiting at 90 is still level 9');
assert.equal(L.valoraPoints({ affinity: 100, ready: false, skills: [0, 0, 0, 0] }), 30);
assert.equal(L.valoraPoints(null), 0);
// Chance effects of one code never stack: only the strongest is active, duplicates are dead; fixed ones add.
{
  const E = require('../js/battle-engine.mjs');
  const side = skills => ({ n: [2000, 16000, 82000], tier: [10, 10, 10], tg: [0, 0, 0], atk: [300, 300, 300], let: [300, 300, 300], skills });
  const skill = skills => E.bearExpect(side(skills)).mean / E.bearExpect(side([])).mean;
  near(skill([{ kind: 'perRound', chance: 1, effects: [{ code: 102, pct: 50 }] }, { kind: 'perRound', chance: 1, effects: [{ code: 102, pct: 40 }] }]), 1.5, 'two sure chance skills: the larger');
  near(skill([{ kind: 'perRound', chance: 0.5, effects: [{ code: 102, pct: 50 }] }, { kind: 'perRound', chance: 0.5, effects: [{ code: 102, pct: 50 }] }]), 1.25, 'two coin flips: the duplicate is dead');
  near(skill([{ kind: 'passive', effects: [{ code: 102, pct: 25 }] }, { kind: 'passive', effects: [{ code: 102, pct: 25 }] }]), 1.5, 'fixed ones add');
  near(skill([{ kind: 'passive', effects: [{ code: 102, pct: 25 }] }, { kind: 'perRound', chance: 1, effects: [{ code: 102, pct: 50 }] }]), 1.75, 'a fixed and a chance one add');
  // Defensive skills add no Bear damage: Rosa's Rose of War is enemy damage down.
  near(skill([{ kind: 'passive', effects: [{ code: 201, pct: 20 }] }]), 1, 'no damage from a defensive skill');
}

// Four rising spender tiers for every generation, each with its own loadout there.
assert.deepEqual(megafauna.foes.map(f => f.id), ['f2p', 'dolphin', 'whale', 'kraken']);
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
  const kraken = L.opponent(megafauna.foes[3], 6, 'rally', data), f2p = L.opponent(megafauna.foes[0], 6, 'rally', data);
  assert.equal(kraken.joiners.length, 4); assert.equal(kraken.joiners[0].level, 5);
  assert.equal(kraken.pets.health, 10); assert.equal(kraken.city.attack, 20);
  assert.equal(f2p.city.attack, 0);
  assert.ok(kraken.gear.inf.let > f2p.gear.inf.let, 'the Kraken wears better hero gear');
  assert.ok(kraken.town.tg > f2p.town.tg, 'and is further along Truegold');
  // A tier's loadout changes with the generation: a Gen 3 Dolphin is not a Gen 4 Dolphin.
  const d3 = L.loadout(megafauna.foes[1], 3, data), d4 = L.loadout(megafauna.foes[1], 4, data);
  assert.notDeepEqual(d3, d4);
  // F2P fields last generation's meta heroes.
  assert.deepEqual(L.opponent(megafauna.foes[0], 4, 'garrison', data).lineup.map(c => c.key), megafauna.lineups['3'].rally);
}

// The break point: the staircase walk gives what scoring every star and widget step gives.
{
  const team = [copy('amadeus', 30, 10), copy('petra', 30, 10), null], me = you(flat(250));
  const brute = (rival, key, line = team) => {
    const target = L.score('bear', me, L.seated(line, rival), 4, data), top = data.widgets[key] ? 10 : 0, out = [];
    for (let s = 0; s <= 30; s++) { let found = null; for (let w = 0; w <= top; w++) if (L.score('bear', me, L.seated(line, copy(key, s, w)), 4, data) >= target) { found = w; break; } out.push(found); }
    return out;
  };
  const rosa = L.breakpoint('bear', me, team, copy('marlin', 30, 10), 'rosa', 4, data, {});
  assert.deepEqual(rosa.widgets, brute(copy('marlin', 30, 10), 'rosa'), 'Rosa catching a 5★ widget-10 Marlin');
  assert.equal(rosa.widgets[24], 5, 'the same 4★ widget-5 break point as above');
  assert.ok(rosa.scores < 60, 'a staircase, not every cell');
  assert.deepEqual(L.breakpoint('bear', me, team, copy('rosa', 24, 4), 'marlin', 4, data, {}).widgets, brute(copy('rosa', 24, 4), 'marlin'), 'and the other way round');
  const infantry = [null, copy('petra', 30, 10), copy('rosa', 30, 10)];
  assert.deepEqual(L.breakpoint('bear', me, infantry, copy('amadeus', 18, 4), 'alcar', 4, data, {}).widgets, brute(copy('amadeus', 18, 4), 'alcar', infantry), 'another seat');
  assert.deepEqual(L.firstBreak(rosa.widgets), { any: { stars: rosa.widgets.findIndex(w => w !== null), widget: rosa.widgets.find(w => w !== null) }, bare: rosa.widgets.indexOf(0) < 0 ? null : { stars: rosa.widgets.indexOf(0), widget: 0 } });
  // A stock tier as your own account: its own job's lineup, and the Bear joiners for the Bear.
  const whale = L.stockAccount(megafauna.foes[2], 5, 'garrison', data);
  assert.deepEqual(whale.lineup.map(c => c.key), megafauna.lineups['5'].garrison);
  assert.deepEqual(L.stockAccount(megafauna.foes[2], 5, 'bear', data).joiners.map(j => j.key), megafauna.joiners.bear['5']);
  // Rally fights walk the same way.
  const acc = L.stockAccount(megafauna.foes[1], 4, 'rally', data), fight = L.breakpoint('rally', acc, acc.lineup, copy('marlin', 30, 10), 'rosa', 4, data, { battles: 4 });
  assert.equal(fight.widgets.length, 31);
  assert.ok(fight.widgets[30] !== null, 'a 5★ Rosa catches Marlin in a rally');
}

// The Bear (js/battle-engine.mjs BEAR, fitted by .dsh/bear-reports-check.cjs) against the
// Frakinator's battle-engine Bear on 5 November 2026: the owner's rally report stats, T10 TG4 /
// TG3 / TG4, Amadeus, Petra, Marlin with every skill at 5, Chenko ×2 and Amane ×2, Valora 24% →
// 51.6M at 10/32/58, and 54.6M with 80% of hunts in 46.3M–63.2M at its best mix, 2/12/86.
{
  const E = require('../js/battle-engine.mjs'), C = require('../js/combat.mjs');
  const lineup = [copy('amadeus', 22, 4), copy('petra', 27, 3), copy('marlin', 30, 10)];
  const report = { atk: [631.5, 654.9, 698.6], let: [468.7, 415.7, 693.9] }, tg = [4, 3, 4];
  const skills = levels => C.side(data, { role: 'rally', heroes: lineup.map((c, i) => ({ key: c.key, levels: levels[i], widget: 0 })), joiners: ['chenko', 'chenko', 'amane', 'amane'].map(key => ({ key, level: 5 })) });
  const go = (n, levels) => E.bearHunt({ n, tier: [10, 10, 10], tg, ...report, skills: skills(levels) }, 10000, 7, 24);
  const max = [[5, 5, 5], [5, 5, 5], [5, 5, 5]];
  const input = go([9000, 28500, 52500], max), best = go([1800, 10800, 77400], max);
  near(input.mean / 51.6e6, 1, 'the Frakinator at 10/32/58', 0.06);
  near(best.mean / 54.6e6, 1, 'and at its best mix', 0.06);
  near(E.quantile(best.totals, 0.1) / 46.3e6, 1, 'its 80% band, low end', 0.06);
  near(E.quantile(best.totals, 0.9) / 63.2e6, 1, 'its 80% band, high end', 0.08);

  // The owner's own five hits that day (Hunting Trap 2, joiners unknown, Amadeus's skills at 4),
  // through the whole page path: Bonus Overview, gear, TG4 town, report stats.
  const m = q => ({ quality: q[0], level: q[1], mastery: q[2] });
  const set = (type, [helm, gloves, chest, boots]) => ({ [type + '-helm']: m(helm), [type + '-gloves']: m(gloves), [type + '-chest']: m(chest), [type + '-boots']: m(boots) });
  const gear = L.gearLayer({ ...set('arc', [['red', 131, 11], ['mythic', 62, 2], ['mythic', 62, 2], ['mythic', 100, 6]]), ...set('inf', [['mythic', 61, 3], ['red', 133, 11], ['mythic', 100, 7], ['mythic', 65, 3]]), ...set('cav', [['mythic', 51, 2], ['mythic', 34, 1], ['mythic', 34, 1], ['mythic', 48, 1]]) });
  const row = (a, d, l, h) => ({ attack: a, defense: d, lethality: l, health: h });
  const overview = { inf: row(389.3, 373.6, 264.2, 257.0), cav: row(326.5, 330.1, 244.0, 218.0), arc: row(345.7, 349.3, 303.8, 296.6) };
  const owner = { overview, troops: { tier: [10, 10, 10], tg }, joiners: ['chenko', 'chenko', 'amane', 'amane'].map(key => ({ key, level: 5 })), city: L.blank(), pets: L.blank(), gear, town: L.townLayer('TG 4') };
  const r = L.bear(owner, lineup, data);
  r.panel.atk.forEach((v, t) => assert.ok(Math.abs(v - report.atk[t]) < 0.25 && Math.abs(r.panel.let[t] - report.let[t]) < 0.25, 'the Bear reads the report stats'));
  const hits = [40185881, 50653325, 41701585, 57194303, 44869569], mean = hits.reduce((a, b) => a + b) / hits.length;
  const sent = L.hunt(owner, lineup, [9000, 28500, 52500], data, { hunts: 10000, pointsPct: 24 });
  assert.ok(Math.abs(sent.mean / mean - 1) < 0.08, `the owner's rallies: ${(sent.mean / 1e6).toFixed(1)}M against ${(mean / 1e6).toFixed(1)}M`);
  const lo = E.quantile(sent.totals, 0.05), hi = E.quantile(sent.totals, 0.95);
  assert.ok(hits.every(h => h >= lo && h <= hi), 'every hit inside the 90% band');
  const ideal = L.hunt(owner, lineup, r.mix.map(f => Math.round(90000 * f)), data, { hunts: 10000, pointsPct: 24 });
  assert.ok(ideal.mean > sent.mean, 'the ideal mix beats the one sent');
}
console.log('Lead engine: stars, widgets, skill caps, Bear score, joiners, pets, city layers, megafauna opponents, ranking and break points pass.');
