// Lead inputs check — js/lead-inputs.js: what a lineup's result is worked out
// from, read from a save, and when the result is provisional.
const assert = require('node:assert/strict');
const I = require('../js/lead-inputs.js');
const L = require('../js/lead-engine.mjs');
const row = { attack: 300, lethality: 280, defense: 300, health: 270 };
const piece = { quality: 'mythic', level: 40, mastery: 5 };
// A stand-in for PlayerLedger.shared(): only the reads gather() makes.
const store = (save = {}) => ({
  snapshot: () => ({ heroGear: { pieces: save.pieces || {} } }),
  heroes: () => ({ roster: save.roster || {} }),
  combat: () => ({ overview: save.overview || {}, troops: save.troops || [] }),
  buildings: () => ({ levels: save.levels || {} }),
  masters: () => ({ roster: save.masters || {} }),
  pets: () => ({ roster: save.pets || {} })
});
const states = r => Object.fromEntries(r.items.map(i => [i.id, i.have]));
const opts = { townKnown: L.TOWN_TG };

// Nothing saved: no heroes, typical stats stand in, everything else missing.
let facts = I.gather(store());
let bear = I.assess('bear', facts, opts);
assert.deepEqual(states(bear), { heroes: 'no', overview: 'est', gear: 'no', town: 'no', valora: 'no', troops: 'est', rally: 'est', pets: 'no' });
assert.equal(bear.provisional, true);
assert.deepEqual(bear.open, ['gear', 'town', 'valora', 'pets'], 'missing heroes is the status line\'s job, not an open total');
assert.deepEqual(bear.estimated, ['overview', 'troops', 'rally']);

// Valora and the rally capacity only matter to the Bear.
const rally = I.assess('rally', facts, opts);
assert.deepEqual(rally.items.map(i => i.id), ['heroes', 'overview', 'gear', 'town', 'troops', 'pets']);

// Pets switched off are a choice, not a gap.
assert.equal(I.assess('bear', I.gather(store(), { usePets: false }), opts).items.some(i => i.id === 'pets'), false);

// Everything in: nothing open, nothing stood in for, not provisional.
const full = {
  roster: { amadeus: { stars: 30, widget: 10 } },
  overview: { squads: row, inf: row, cav: row, arc: row },
  pieces: { 'inf-helm': piece, 'cav-gloves': piece, 'arc-boots': piece },
  levels: { 'town-center': 'TG4' }, masters: { valora: { affinity: 90, ready: true } },
  pets: { 'giant-rhino': { level: 60 } }, troops: [{ tier: 10, tg: 4 }]
};
bear = I.assess('bear', I.gather(store(full), { rallyTyped: true }), opts);
assert.equal(bear.provisional, false);
assert.deepEqual(bear.open, []);
assert.deepEqual(bear.estimated, []);
assert.equal(['inf', 'cav', 'arc'].some(bear.typeShort), false);

// Rows typed on the page but not saved yet count; a part-typed row doesn't.
facts = I.gather(store(full), { overview: { squads: row, inf: row, cav: { attack: 1 }, arc: row }, rallyTyped: true });
bear = I.assess('bear', facts, opts);
assert.equal(states(bear).overview, 'est');
assert.deepEqual(bear.items.find(i => i.id === 'overview').missing, ['cav']);
assert.equal(bear.typeShort('cav'), true);
assert.equal(bear.typeShort('inf'), false);

// Gear missing for one troop type leaves that type short.
bear = I.assess('bear', I.gather(store({ ...full, pieces: { 'inf-helm': piece, 'arc-boots': piece } }), { rallyTyped: true }), opts);
assert.equal(states(bear).gear, 'no');
assert.deepEqual(bear.items.find(i => i.id === 'gear').missing, ['cav']);
assert.deepEqual(bear.open, ['gear']);

// A Truegold level whose Town Centre bonus isn't known is an estimate; a plain level is in.
assert.equal(states(I.assess('bear', I.gather(store({ ...full, levels: { 'town-center': 'TG3' } })), opts)).town, 'est');
assert.equal(states(I.assess('bear', I.gather(store({ ...full, levels: { 'town-center': '30' } })), opts)).town, 'yes');

// A store that throws reads as an empty save.
const broken = { snapshot() { throw new Error('blocked'); }, heroes() { throw new Error('blocked'); } };
assert.equal(I.gather(broken).heroes, 0);

// Links: an anchor on the page itself, otherwise the page beside it.
assert.equal(I.href('overview', 'heroes'), '#bonus-overview');
assert.equal(I.href('overview', 'bear-hunt'), '../heroes/#bonus-overview');
assert.equal(I.href('gear', 'heroes'), '../hero-gear/');
assert.equal(I.href('valora', 'heroes'), '../masters/#master-valora');

console.log('Lead inputs: save reads, per-job inputs, provisional, open and estimated sets, troop-type gaps and links pass.');
