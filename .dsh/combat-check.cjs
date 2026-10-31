// Combat check — js/combat.js and the hero half of js/battle-engine.js.
// Pins the engine's copies of _data/combat.json, how skills scale and stack,
// the joiner rule, exclusive gear by role, and kingshotsim.com's worked round.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../js/battle-engine.js');
const C = require('../js/combat.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '_data', 'combat.json'), 'utf8'));

const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);

// The engine's constants are the data's.
assert.deepEqual(E.TG_HIGH, [6, 7, 8].map(tg => data.tgStatMultiplier[tg]), 'TG6–TG8 multipliers');
for (const [tg, at] of [['tg3', 0], ['tg5', 1]]) {
  const s = data.troopSkills[tg];
  assert.deepEqual(E.TRUEGOLD.inf[at].slice(1), [s.inf.chance, s.inf.damageTakenDownPct / 100], `${tg} infantry`);
  assert.deepEqual(E.TRUEGOLD.cav[at].slice(1), [s.cav.chance, s.cav.damageUpPct / 100], `${tg} cavalry`);
  assert.deepEqual(E.TRUEGOLD.arc[at].slice(1), [s.arc.chance, s.arc.damageUpPct / 100], `${tg} archers`);
}
const tg8 = data.troopSkills.tg8;
assert.equal(E.TRUEGOLD.infTg8, tg8.inf.extraDamageTakenDownPct / 100);
assert.equal(E.TRUEGOLD.arcTg8, tg8.arc.extraDamageUpPct / 100);
assert.deepEqual(E.TRUEGOLD.cavTg8, [tg8.cav.chance, tg8.cav.damageTakenDownPct / 100]);
assert.equal(E.TRUEGOLD.flatTg8, tg8.inf.defensePct);
assert.equal(E.TRUEGOLD.flatTg8, tg8.arc.attackPct);
for (const c of data.codes) assert.equal(['damageUp', 'defenseUp', 'enemyDamageDown', 'enemyDefenseDown'][E.family(c.code)], c.family, `family of ${c.code}`);
assert.equal(E.baseAtk(0, 10, 8), Math.round(472 * 1.464), 'TG8 is TG0 × its multiplier');

// Stacking, kingshotsim.com SkillMod: same code adds, codes multiply.
const fx = skills => E.compile(skills).flatMap(s => s.fx);
const joined = keys => C.side(data, { role: 'rally', joiners: keys.map(key => ({ key })) });
near(E.factor(fx(joined(['chenko', 'chenko', 'chenko', 'chenko'])), 0, 0, 0), 2.00, 'four Chenkos, one code');
near(E.factor(fx(joined(['chenko', 'chenko', 'amane', 'amane'])), 0, 0, 0), 2.25, 'two Chenkos and two Amanes');
near(E.factor(fx(joined(['gordon', 'gordon', 'gordon', 'howard'])), 1, 0, 0), 2.10, 'three Gordons and a Howard');
near(E.factor(fx(joined(['saul', 'saul', 'saul', 'saul'])), 1, 0, 0), 2.24, 'four Sauls, two codes in one skill');

// Levels scale the value, or the chance where the chance scales.
{
  const [ready, blade, strike] = C.leader(data, { key: 'amadeus', levels: [3, 1, 3] }, 'solo');
  near(ready.effects[0].pct, 15, 'Battle Ready at 3');
  near(blade.effects[0].pct, 5, 'Way of the Blade at 1');
  near(strike.chance, 0.24, 'Unrighteous Strike chance at 3');
  near(strike.effects[0].pct, 50, 'its +50% does not scale');
  assert.equal(C.leader(data, { key: 'amadeus', levels: [0, 0, 0] }, 'solo').length, 0, 'level 0 is no skill');
  const margot = C.leader(data, { key: 'margot', levels: [5, 5, 5] }, 'solo');
  assert.equal(margot.find(s => s.special === 'dodge').dodgePct, 20, "Margot's dodge");
  assert.equal(C.leader(data, { key: 'saul' }, 'solo').length, 2, "Saul's construction skill is not a fight skill");
}

// Exclusive gear: its skill only in its own role, 15% at level 10, a third at 2.
{
  const amadeus = role => C.leader(data, { key: 'amadeus', widget: 10 }, role).length;
  assert.equal(amadeus('rally'), 4, 'a rally widget fights in a rally');
  assert.equal(amadeus('defender'), 3, '… and not in a garrison');
  assert.equal(amadeus('solo'), 3, '… nor a solo march');
  const w = C.widget(data, 'zoe', 2, 'defender');
  near(w.effects[0].pct, 15 * data.widgetSkill.byLevel[2], 'widget level 2');
  assert.equal(w.effects[0].code, data.widgets.zoe.skill.code);
  assert.equal(C.widget(data, 'zoe', 1, 'defender'), null, 'widget level 1 has no skill');
}

// Joiners: the four highest skill levels, join order breaking ties; a second
// copy of a chance skill takes a place but does not roll again.
{
  const order = C.joiners([{ key: 'a', level: 3 }, { key: 'b', level: 5 }, { key: 'c', level: 3 }, { key: 'd', level: 4 }, { key: 'e', level: 5 }]);
  assert.deepEqual(order.map(j => j.key), ['b', 'e', 'd', 'a']);
  const jabels = C.joinerSkills(data, [{ key: 'jabel' }, { key: 'jabel' }, { key: 'jabel' }, { key: 'jabel' }, { key: 'chenko' }]);
  assert.equal(jabels.length, 1, 'four Jabels are one roll, and Chenko is the fifth');
  assert.equal(C.side(data, { role: 'solo', joiners: [{ key: 'chenko' }] }).length, 0, 'a solo march has no joiners');
  assert.equal(C.joinerSkills(data, [{ key: 'diana' }]).length, 0, 'Diana joins without a combat skill');
}

// kingshotsim.com's worked round: 40,233 T10 TG1 infantry, 293.66% attack,
// 251.82% lethality, in a 120,789 army against 78,872, defender per troop
// 2,557.9 and SkillMod 1.26 → 189 dead. The engine counts its first round as
// 1 (fatigue × 0.9999); their round 0 has none; both give 189.
{
  const you = E.prepare({ n: [40233, 40278, 40278], tier: [10, 10, 10], tg: [1, 1, 1], atk: [293.66, 0, 0], let: [251.82, 0, 0] });
  const armyMin = Math.min(120789, 78872);
  const D = 2557.9 * 100 / 10;            // their per-troop figure carries base defence 10 and ÷100
  assert.equal(E.dead(40233, armyMin, you.A[0], D, 1.26, 0), 189);
  assert.equal(E.dead(40233, armyMin, you.A[0], D, 1.26, 1), 189);
  const mod = E.factor(fx([{ effects: [{ code: 102, pct: 26 }] }]), 0, 0, 0);
  near(mod, 1.26, 'a +26% damage up is SkillMod 1.26');
}

// Heroes change fights; a side without skills or Truegold fights as before.
{
  const side = (skills, tg = 0) => ({ n: [50000, 30000, 40000], tier: [10, 10, 10], tg: [tg, tg, tg], atk: [250, 250, 250], let: [200, 200, 200], def: [250, 250, 250], hea: [200, 200, 200], skills });
  const even = E.run(side([]), side([]), 50, 3);
  assert.ok(even.win > 0.2 && even.win < 0.8, 'a mirror fight is a coin toss');
  const lead = C.side(data, { role: 'rally', heroes: [{ key: 'charles' }, { key: 'ava' }, { key: 'weewoo' }], joiners: [{ key: 'chenko' }, { key: 'amane' }] });
  assert.ok(E.run(side(lead), side([]), 50, 3).win > 0.95, 'a Gen 7 lead with joiners wins the mirror');
  assert.ok(E.run(side([]), side(lead), 50, 3).win < 0.05, '… and holds it from the other side');
  const passive = C.side(data, { role: 'solo', heroes: [{ key: 'charles' }] });
  assert.equal(E.run({ ...side(passive), tier: [6, 6, 6] }, { ...side([]), tier: [6, 6, 6] }, 50, 3).random, false, 'passive skills alone are no chance');
  assert.equal(E.run({ ...side([], 3), tier: [6, 6, 6] }, { ...side([]), tier: [6, 6, 6] }, 50, 3).random, true, 'Truegold troops roll');
  assert.equal(E.run({ ...side([], 3), tier: [6, 6, 6], truegold: false }, { ...side([]), tier: [6, 6, 6] }, 50, 3).random, true, 'TG3 still brings the T7 skills');
  const tg8 = E.prepare(side([], 8)), off = E.prepare({ ...side([], 8), truegold: false });
  near(tg8.D[0] / off.D[0], 3.54 / 3.5, 'TG8 infantry +4% defence');
  near(tg8.A[2] / off.A[2], 3.54 / 3.5, 'TG8 archers +4% attack');
  assert.equal(tg8.A[0], off.A[0]);
}

// The sweep carries the skills into every mix.
{
  const foe = { n: [40000, 20000, 30000], tier: [10, 10, 10], tg: [0, 0, 0], atk: [250, 250, 250], let: [200, 200, 200], def: [250, 250, 250], hea: [200, 200, 200] };
  const you = { ...foe, n: [0, 0, 0] };
  const lead = C.side(data, { role: 'solo', heroes: [{ key: 'charles' }, { key: 'ava' }, { key: 'weewoo' }] });
  const bare = E.sweep(you, foe, { total: 90000, step: 0.25, battles: 5, seed: 2 });
  const led = E.sweep({ ...you, skills: lead }, foe, { total: 90000, step: 0.25, battles: 5, seed: 2 });
  assert.ok(E.best(led.cells).win > E.best(bare.cells).win, 'heroes reach the sweep');
}

console.log('combat ok');
