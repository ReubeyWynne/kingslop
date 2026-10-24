// Pets: the data against the research tables, what the next Advance costs and scores,
// the care meters and moods, the ledger's pets section, and the page's wiring.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const data = require('../_data/pets.json'), Plan = require('../js/pet-plan.js'), Care = require('../js/pet-care.js'), Ledger = require('../js/player-ledger.js');

// Data: fourteen pets on five profiles, the totals the research publishes, one value per Advance.
assert.equal(data.pets.length, 14);
assert.deepEqual(Object.keys(data.profiles), ['gen1_50', 'gen1_60', 'gen2_70', 'gen3_80', 'gen4_100']);
assert.deepEqual(data.profiles.gen1_60.totals, { petFood: 83770, growthManual: 515, nutrientPotion: 100, promotionMedallion: 30 });
assert.deepEqual(data.profiles.gen3_80.totals, { petFood: 360420, growthManual: 1440, nutrientPotion: 290, promotionMedallion: 130 });
for (const pet of data.pets) {
  assert.equal(pet.maxLevel, data.profiles[pet.profile].maxLevel, pet.id);
  assert.equal(pet.advances, pet.maxLevel / 10, pet.id);
  for (const row of pet.skill.ladder) assert.equal(row.values.length, pet.advances, pet.id);
  assert.ok(pet.skill.say.length > 20, pet.id);
}
assert.equal(data.pets.find(p => p.id === 'ironclad-war-bear').verified, false);
assert.equal(data.points['100'].kvk, 875000); assert.equal(data.points['100'].brawl, 525000);
assert.ok(!JSON.stringify(data).includes('"stat"'), 'the one-source passive stat stays out');

// Plan: the Advance at a cap waits until it is marked done; to max sums every step left.
const wolf = Plan.find('gray-wolf'), rhino = Plan.find('giant-rhino');
assert.equal(Plan.skillLevel({ level: 9, advanced: false }), 0);
assert.equal(Plan.skillLevel({ level: 10, advanced: false }), 0);
assert.equal(Plan.skillLevel({ level: 10, advanced: true }), 1);
assert.equal(Plan.skillLevel({ level: 37, advanced: false }), 3);
assert.equal(Plan.skillLevel({ level: null, advanced: false }), null);
let next = Plan.nextAdvance(wolf, { level: 10, advanced: false });
assert.equal(next.level, 10); assert.equal(next.cost.petFood, 0); assert.equal(next.cost.growthManual, 15); assert.equal(next.cost.kvk, 25000);
next = Plan.nextAdvance(wolf, { level: 10, advanced: true });
assert.equal(next.level, 20); assert.equal(next.cost.advances, 1); assert.equal(next.cost.kvk, 50000);
assert.equal(next.cost.petFood, data.profiles.gen1_50.levels.slice(10, 20).reduce((a, l) => a + l.petFood, 0));
assert.deepEqual(Plan.toMax(wolf, { level: 1, advanced: false }), { petFood: 28865, growthManual: 240, nutrientPotion: 60, promotionMedallion: 10, advances: 5, score: 11000, kvk: 550000, brawl: 330000 });
assert.equal(Plan.nextAdvance(wolf, { level: 50, advanced: true }), null);
assert.equal(Plan.toMax(wolf, { level: 50, advanced: true }).advances, 0);
assert.equal(Plan.toMax(rhino, { level: 100, advanced: false }).kvk, 875000);
assert.equal(Plan.nextAdvance(wolf, { level: null, advanced: false }), null);
assert.deepEqual(Plan.skillAt(Plan.find('grizzly-bear'), 8), ['30%', '5.00%']);

// Care: meters fall with real time, actions lift them, moods follow, night sends pets to sleep.
const H = 3600000, t0 = Date.UTC(2026, 9, 17, 12);
let care = Care.fresh(t0);
assert.deepEqual(Care.level(care, t0), { fullness: 60, affection: 50 });
assert.equal(Care.mood(care, t0, 12), 'content');
assert.equal(Math.round(Care.level(care, t0 + 4 * H).fullness), 35);
assert.equal(Math.round(Care.level(care, t0 + 4 * H).affection), 10);
assert.equal(Care.mood(care, t0 + 4 * H, 16), 'lonely');
assert.equal(Care.mood(care, t0 + 10 * H, 22), 'hungry');
assert.deepEqual(Care.level(care, t0 + 48 * H), { fullness: 0, affection: 0 });
let step = Care.pat(care, t0 + H);
assert.equal(step.react, 'pet'); assert.equal(Math.round(Care.level(step.record, t0 + H).affection), 60);
step = Care.feed(step.record, t0 + H);
assert.equal(step.react, 'feed'); assert.equal(Math.round(Care.level(step.record, t0 + H).fullness), 84);
assert.equal(Care.mood(step.record, t0 + H, 13), 'content');
step = Care.pat(Care.pat(step.record, t0 + H).record, t0 + H);
assert.equal(Care.mood(step.record, t0 + H, 13), 'delighted');
step = Care.feed(step.record, t0 + H);
assert.equal(step.react, 'feed'); assert.equal(Care.level(step.record, t0 + H).fullness, 100);
step = Care.feed(step.record, t0 + H);
assert.equal(step.react, 'full'); assert.equal(Care.level(step.record, t0 + H).fullness, 100);
assert.equal(Care.mood(step.record, t0 + H + 5 * 60000, 23), 'delighted', 'a pet you just touched stays awake');
assert.equal(Care.mood(step.record, t0 + H + 11 * 60000, 23), 'asleep');
assert.equal(Care.mood(step.record, t0 + H + 11 * 60000, 3), 'asleep');
assert.equal(Care.mood(step.record, t0 + H + 11 * 60000, 6), 'delighted');
let friend = Care.fresh(t0);
assert.equal(Care.bond(friend).days, 0);
friend = Care.befriend(friend, t0, false);
assert.equal(Care.bond(friend).days, 1);
assert.equal(Care.bond(Care.befriend(friend, t0 + H, true)).days, 1);
assert.equal(Care.bond(Care.befriend(friend, t0 + H, true)).favourite, true);
assert.equal(Care.bond(Care.befriend(friend, t0 + 13 * H)).days, 1);
assert.equal(Care.bond(Care.befriend(friend, t0 - 24 * H)).days, 1);
friend = Care.befriend(friend, t0 + 24 * H);
friend = Care.befriend(friend, t0 + 48 * H);
assert.equal(Care.stage(friend), 'familiar');
assert.equal(Care.bond(friend).days, 3);
let arrival = Care.visit(friend, t0 + 48 * H);
assert.equal(arrival.welcome, false);
assert.equal(Care.visit(arrival.record, t0 + 51 * H).welcome, false);
assert.equal(Care.visit(arrival.record, t0 + 52 * H).welcome, true);
assert.equal(Care.visit(arrival.record, t0 + 47 * H).welcome, false);
assert.equal(Care.bond(Care.visit(arrival.record, t0 + 47 * H).record).seen, t0 + 48 * H);
assert.equal(Care.bond(Care.befriend(friend, t0 + 200 * 24 * H)).days, 4);
assert.equal(Care.bond(friend).days, 3);
assert.deepEqual(Care.level(friend, t0 + 200 * 24 * H), { fullness: 0, affection: 0 });
for (const days of [7, 14]) assert.equal(Care.stage({ bond: { days } }), days === 7 ? 'close' : 'trusted');
for (const pet of data.pets) assert.equal(Care.SPOTS.filter(spot => Care.favourite(pet.id, spot)).length, 1);
assert.equal(Care.favourite('gray-wolf', 'cheeks'), true);
assert.equal(Care.favourite('grizzly-bear', 'chin'), true);
assert.equal(Care.bond({ bond: { days: -1, favourite: 'yes', seen: 'bad' } }).days, 0);
assert.equal(Care.bond({ bond: { favourite: 'yes' } }).favourite, false);
// Storage: a broken or foreign record is dropped, never thrown.
const store = new Map(), storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
Care.save(storage, { 'gray-wolf': care });
assert.deepEqual(Care.load(storage), { 'gray-wolf': care });
Care.save(storage, { 'gray-wolf': friend });
assert.deepEqual(Care.load(storage)['gray-wolf'], friend);
store.set(Care.KEY, JSON.stringify({ 'gray-wolf': { fullness: 3 }, lion: care, 'BAD KEY': care }));
assert.deepEqual(Object.keys(Care.load(storage)), ['lion']);
store.set(Care.KEY, '{nope'); assert.deepEqual(Care.load(storage), {});
store.set(Care.KEY, '[]'); assert.deepEqual(Care.load(storage), {});

// Ledger: pets.roster with a level and the Advance at a cap; saves without pets stay valid.
const memory = new Map(), local = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) };
const ledger = Ledger.create(local);
ledger.setPet('gray-wolf', {});
assert.deepEqual(ledger.pets().roster, { 'gray-wolf': { level: null, advanced: false } });
ledger.setPet('gray-wolf', { level: 20, advanced: true });
assert.deepEqual(ledger.pets().roster['gray-wolf'], { level: 20, advanced: true });
ledger.setPet('gray-wolf', { level: 21, advanced: true });
assert.equal(ledger.pets().roster['gray-wolf'].advanced, false, 'the Advance only exists at a cap');
assert.throws(() => ledger.setPet('gray-wolf', { level: 0 }));
assert.throws(() => ledger.setPet('gray-wolf', { level: 101 }));
assert.throws(() => ledger.setPet('gray-wolf', { mood: 'happy' }));
assert.throws(() => ledger.setPet('Gray Wolf', {}));
ledger.setPet('lion', { level: 80 });
const saved = JSON.parse(ledger.exportJSON());
assert.equal(saved.pets.provenance.lion.source, 'manual');
assert.doesNotThrow(() => Ledger.validate(saved));
for (const bad of [s => { s.pets.roster.lion.advanced = 'yes'; }, s => { delete s.pets.provenance.lion; }, s => { s.pets.roster.lion.level = 1.5; }]) {
  const copy = JSON.parse(JSON.stringify(saved)); bad(copy); assert.throws(() => Ledger.validate(copy));
}
const old = JSON.parse(JSON.stringify(saved)); delete old.pets; assert.doesNotThrow(() => Ledger.validate(old));
ledger.setPet('lion', null);
assert.deepEqual(Object.keys(ledger.pets().roster), ['gray-wolf']);

// The scene: every pet has a pen, four bodies and a place for its marks.
const frames = ['css/ascii-frames.css', 'css/ascii-frames-pets.css'].map(read).join('\n');
// A pet drawn from its model has a portrait instead: one span per ink, each with
// the same poses, and the pens page gives it those spans.
const portraits = fs.readdirSync(path.join(__dirname, 'pet-portraits')).map(file => file.replace(/\.json$/, ''));
const pens = read('pets/index.html');
for (const id of portraits) {
  const baked = JSON.parse(read(`.dsh/pet-portraits/${id}.json`));
  assert.ok(pens.includes(`{% assign portraits = '${portraits.join(',')}' | split: ',' %}`), id + ' listed on the page');
  assert.ok(pens.includes(`{% for ink in (0..${baked.inks.length - 1}) %}`), id + ' one span per ink');
  baked.inks.forEach((ink, i) => {
    for (const mood of ['', '-low', '-happy']) assert.ok(frames.includes(`@keyframes ascii-portrait-${id}${mood}-${i}{`), `${id}${mood} ink ${i}`);
    assert.ok(frames.includes(`.ascii-mini--pet[data-mood="asleep"] > .ascii-mini--portrait[data-pet="${id}"] > [data-ink="${i}"]::before{`), `${id} asleep ink ${i}`);
  });
  assert.match(frames, new RegExp(`\\.ascii-mini--pet\\[data-pet="${id}"\\]\\{--marks:\\d+\\}`));
}
for (const pet of data.pets.filter(pet => !portraits.includes(pet.id))) {
  assert.ok(frames.includes(`@keyframes ascii-pet-${pet.id}{`), pet.id);
  assert.ok(frames.includes(`@keyframes ascii-pet-${pet.id}-low{`), pet.id + ' low');
  assert.ok(frames.includes(`.ascii-mini--pet[data-pet="${pet.id}"]:is([data-react="pet"], [data-react="feed"], [data-sniff])[data-mood]::before{`), pet.id + ' happy');
  assert.ok(frames.includes(`.ascii-mini--pet[data-pet="${pet.id}"][data-mood="asleep"]::before{`), pet.id + ' asleep');
  assert.match(frames, new RegExp(`\\.ascii-mini--pet\\[data-pet="${pet.id}"\\]\\{--marks:\\d+\\}`));
}
for (const mood of ['asleep', 'hungry', 'lonely', 'delighted']) assert.ok(frames.includes(`@keyframes ascii-pet-marks-${mood}{`), mood);
for (const react of ['pet', 'feed', 'full']) assert.ok(frames.includes(`.ascii-mini--pet[data-react="${react}"]::after{`), react);

// Wiring: the page closes the ring after Governor gear, loads its scripts in order, and every key is translated.
const nav = require('../_data/nav.json'), pages = require('../_data/pages.json');
assert.equal(nav.at(-1).self, 'pets'); assert.equal(nav.at(-2).self, 'governor');
assert.equal(pages.pets.swipePrev.page, 'governor'); assert.equal(pages.pets.swipeNext.page, 'home');
assert.equal(pages.governor.swipeNext.page, 'pets'); assert.equal(pages.home.swipePrev.page, 'pets');
const petScripts = pages.pets.scripts.map(script => script.split('/').at(-1));
for (const [dependency, consumer] of [['pet-data.js', 'pet-plan.js'], ['pet-plan.js', 'pet-den.js'], ['pet-care.js', 'pet-den.js'], ['roster-editor.js', 'pet-den.js'], ['pet-den.js', 'pet-live.js']]) {
  assert.ok(petScripts.indexOf(dependency) >= 0 && petScripts.indexOf(consumer) > petScripts.indexOf(dependency), dependency + ' before ' + consumer);
}
// Every pet with a portrait is drawn live from its model (pets/models/<id>.bin and .json) and keeps its baked portrait as the fallback.
for (const id of portraits) {
  const model = JSON.parse(read(`pets/models/${id}.json`));
  for (const key of ['inks', 'fur', 'regions', 'head', 'ramp', 'eyes', 'rest', 'camera', 'lights', 'mouth', 'top', 'cheeks', 'pivots', 'weights']) assert.ok(key in model, `${id} model has ${key}`);
  assert.equal(model.inks.length, 7, id + ' seven inks');
  const mesh = fs.readFileSync(path.join(__dirname, '..', 'pets/models', id + '.bin'));
  assert.ok(mesh.length < 16384 && mesh.readUInt32LE(4) % 3 === 0 && mesh.readUInt32LE(4) <= 3600, id + ' model is small');
}
assert.doesNotMatch(read('js/pet-live.js'), /innerHTML/);
assert.ok(pages.pets.css.includes('../css/pets.css') && pages.pets.css.includes('../css/heroes.css'));
assert.match(read('_includes/ascii/deck-scene.html'), /{% when 'pets' %}\n<span class="ascii-mini ascii-mini--pet" data-pet="gray-wolf"/);
const page = read('pets/index.html');
for (const pet of data.pets) assert.match(page, /data-deep-link="pet-{{ pet.id }}"/);
assert.doesNotMatch(read('js/pet-den.js'), /innerHTML/);
const dictionaries = fs.readdirSync(path.join(__dirname, '../i18n')).filter(f => f.endsWith('.js')).map(file => { const ctx = { window: {} }; vm.runInNewContext(read('i18n/' + file), ctx); return [file, Object.values(ctx.window.__BH_I18N_DATA)[0]]; });
assert.equal(dictionaries.length, 17);
for (const [file, d] of dictionaries) for (const key of ['pets.nav', 'ev.deck.lede.pets', 'pets.title', 'pets.cardLede', 'pets.kicker', 'pets.metaTitle']) assert.equal(typeof d[key], 'string', file + ' ' + key);
const en = dictionaries.find(([file]) => file === 'en.js')[1];
for (const [, key] of (page + read('index.html')).matchAll(/data-i18n(?:-key)?="(pets\.[^"{]+)"/g)) assert.ok(Object.hasOwn(en, key), 'en.js lacks ' + key);
const den = read('js/pet-den.js');
const keys = [...den.match(/var EN = \{([\s\S]*?)\n  \};/)[1].matchAll(/'?([\w.]+)'?: '/g)].map(m => m[1]);
for (const key of keys) if (key !== 'nextOnly') assert.ok(Object.hasOwn(en, 'pets.' + key), 'en.js lacks pets.' + key);
for (const [file, d] of dictionaries) for (const key of ['bond.new', 'bond.familiar', 'bond.close', 'bond.trusted', 'bondDays', 'bondHint', 'spot.head', 'spot.cheeks', 'spot.chin', 'favourite', 'explore']) assert.equal(typeof d['pets.' + key], 'string', file + ' pets.' + key);
console.log('Pets: research totals, Advance costs and points, care meters and moods, the ledger section, the pens, navigation and dictionaries pass.');
