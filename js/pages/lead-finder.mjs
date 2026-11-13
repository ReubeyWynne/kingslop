/* The lead finder: your owned heroes ranked as a Bear, rally or garrison lead. The Heroes page
   shows all three jobs; the Bear Hunt page the Bear alone (_includes/lead-finder.html binds to
   it with x-data="leadFinder('<page>', '<inputs filled in here>')").

   LeadEngine does the maths (js/lead-engine.mjs); this controller reads the roster, Bonus
   Overview and pets from the store the page works on, keeps joiners and city buffs in this
   browser, and lays out the ranking as plain data for the markup. */
import { Alpine, words } from '../alpine.mjs';
import L from '../lead-engine.mjs';
import I from '../lead-inputs.mjs';
import A from '../lead-account.mjs';
import BattleEngine from '../battle-engine.mjs';

const BH = () => globalThis.BH;
const EN = {
  noHeroes: 'Mark the heroes you own, with their stars, in the roster above.',
  ready: 'Ranked from your {n} heroes that have stars.',
  working: 'Fighting {done} of {total} lineups…',
  best: 'best', no: 'No.', ofBest: '{n}% of your best', mix: 'Ideal mix {inf} / {cav} / {arc}',
  wins: 'Wins against {n} of {total}', kept: '{n}% of your troops left',
  'bestTitle.bear': 'Your best Bear lead', 'bestTitle.rally': 'Your best rally lead', 'bestTitle.garrison': 'Your best garrison lead',
  ahead: '{n}% more Bear damage than your next lineup', tie: 'Level with your next lineup', only: 'Your only lineup',
  beats: 'Beats {n} of {total} opponents', mixTitle: 'Send this troop mix',
  mixNote: 'The split that gets the most damage out of these three heroes and your stats.',
  damageTitle: 'Estimated Bear damage', damageNote: '{n} = 1/15 of a {cap} rally{est}{valora}. One hit can land about 20% either side.', valora: ', Valora +{n}%', estimated: ' (estimated: 15 × joiner cap)',
  troops: '{n} troops',
  damageBand: '80% of hits land between {lo} and {hi}', damageBin: '{n}% of hits from {lo} to {hi}',
  railTitle: 'Against each opponent', railNote: 'Win chance over repeated fights, and how much of your army is still standing.', win: '{n}%', empty: 'empty seat',
  foesNote: 'Generation {n} accounts, {total} troops a side.',
  kit: 'At generation {gen}: {stars}★ heroes, widgets at {widget}, {pct}% Bonus Overview, TG{tg}, {gear} hero gear, level {joiners} joiners, pets at {pets}, {city}.',
  'gear.epic': 'epic {n}', 'gear.mythic': 'mythic {n}', 'gear.red': 'red {n}',
  'city.0': 'no city buffs', 'city.ad': 'attack and defence city buffs at I', 'city.10': 'every city buff at I', 'city.20': 'every city buff at II',
  saved: 'Saved', saveFailed: 'Could not save',
  joinersFor: 'Joiners for the {job}', noPets: 'No pets in your save yet. Add them on the Pets page.', petsOff: 'Pets are left out.',
  pet: '{name} {level}: {stat}{pct}%', 'petStat.attack': 'attack +', 'petStat.defense': 'defence +', 'petStat.lethality': 'lethality +', 'petStat.health': 'health +',
  'petStat.enemyLethality': 'enemy lethality −', 'petStat.enemyHealth': 'enemy health −',
  'input.heroes': 'Heroes', 'input.overview': 'Bonus Overview', 'input.gear': 'Hero gear', 'input.town': 'Town Centre',
  'input.valora': 'Valora', 'input.troops': 'Troop tier', 'input.rally': 'Rally capacity', 'input.pets': 'Pets', est: 'Estimate', partOf: '{what}: {types}'
};
const STATS = ['attack', 'lethality', 'defense', 'health'], TYPES = ['inf', 'cav', 'arc'], ROWS = ['squads', 'inf', 'cav', 'arc'], TOP = 5, CHUNK = 4;
const CITY = ['attack', 'lethality', 'defense', 'health', 'enemyAttack', 'enemyDefense'];

const t = key => BH().tr('leads.' + key, EN[key]);
const fill = (key, values) => BH().fill(t(key), values);
const fmt = n => BH().fmt(n);
const pct = x => fmt(Math.round(x * 100));
const sign = x => { const r = Math.round(x * 10) / 10; return (r < 0 ? '−' : '+') + fmt(Math.abs(r)) + '%'; };
const typeName = type => BH().tr('sim.calc.' + type, type);
const inputLabel = id => t('input.' + id);
const names = ids => ids.map(inputLabel).join(' · ');
const cityKey = c => !c.attack ? 'city.0' : !c.lethality ? 'city.ad' : c.attack >= 20 ? 'city.20' : 'city.10';
// A Bonus Overview box: blank or out of its field's range (0–100,000, in steps of 0.1) is unknown.
const statValue = v => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100000 && Math.abs(Math.round(n * 10) - n * 10) < 1e-6 ? n : null;
};
function writePrefs(v) { try { localStorage.setItem(A.PREFS, JSON.stringify(v)); } catch (cause) { /* kept for this visit */ } }

// The best lineup's troop mix, for the Bear Hunt page's march builder.
export const leadMix = Alpine.reactive({ mix: null });

/* A lineup as three roster tiles, infantry → cavalry → archers; an empty seat stays dashed. */
function seats(lineup, data) {
  return lineup.map((copy, i) => {
    const s = copy ? Math.floor(copy.stars / 6) : 0, tier = copy ? copy.stars % 6 : 0;
    return {
      type: TYPES[i], copy: !!copy,
      img: copy ? '../img/heroes/' + copy.key + '.webp' : '',
      widget: copy && copy.widget ? fmt(copy.widget) : '',
      stars: [0, 1, 2, 3, 4].map(n => n < s), notches: [0, 1, 2, 3, 4, 5].map(n => n < tier),
      name: copy ? data.heroes[copy.key].name : t('empty'),
      small: copy ? fmt(s) + '★' + (tier ? ' ' + fmt(tier) + '/6' : '') + (copy.widget ? ' · W' + fmt(copy.widget) : '') : typeName(TYPES[i])
    };
  });
}
function rail(r, data) {
  return r.foes.map(f => {
    const foe = data.megafauna.foes.find(x => x.id === f.id);
    return { yes: f.win >= 0.5 ? 'yes' : 'no', style: '--win: ' + f.win, name: BH().tr('leads.foe.' + f.id, foe ? foe.name : f.id), win: fill('win', { n: pct(f.win) }), kept: fill('kept', { n: pct(f.left) }) };
  });
}
const wonOf = r => r.foes.filter(f => f.win >= 0.5).length;
// The spread of simulated hunts: 24 bins from the 1st to the 99th percentile, the 80% band lit.
function histogram(sorted, lo, hi) {
  const a = BattleEngine.quantile(sorted, 0.01), b = BattleEngine.quantile(sorted, 0.99), bins = 24, width = (b - a) / bins || 1, counts = new Array(bins).fill(0);
  sorted.forEach(x => { if (x >= a && x <= b) counts[Math.min(bins - 1, Math.floor((x - a) / width))]++; });
  const top = Math.max(...counts) || 1;
  return counts.map((c, i) => {
    const from = a + i * width, to = from + width;
    return { style: '--h: ' + c / top, band: to > lo && from < hi, title: fill('damageBin', { n: fmt(Math.round(c / sorted.length * 1000) / 10), lo: BH().compact(from), hi: BH().compact(to) }) };
  });
}

Alpine.data('leadFinder', (self, here) => ({
  ...words,
  ready: false,
  // The inputs, as the fields hold them.
  job: 'bear', tier: '10', tg: '0', cap: '', usePets: true,
  stats: Object.fromEntries(ROWS.flatMap(row => STATS.map(stat => [row + '.' + stat, '']))),
  joiners: [0, 1, 2, 3].map(() => ({ key: '', level: '5' })),
  city: Object.fromEntries(CITY.map(id => [id, '0'])),
  overviewOpen: false,
  // What the page shows, worked out by run().
  status: '', saved: '', savedState: null, chips: [], pets: '', joinersTitle: 'Joiners',
  overview: null, best: null, list: [], foes: false, foesNote: '', kits: {},
  init() {
    const data = globalThis.LeadData, store = (() => { try { const s = globalThis.PlayerLedger.current(); s.snapshot(); return s; } catch (cause) { return null; } })();
    // Kept out of Alpine's reactivity: the engine's data and the store are large and never bound.
    this.engine = () => ({ data, store });
    this.prefs = A.prefs();
    this.tierPicked = false;
    this.ticket = 0;
    this.ready = true;
    // On a save (here or in another tab) or a language switch, the fields catch up and the ranking runs again.
    Alpine.effect(() => { Alpine.store('ledger').v; Alpine.store('i18n').v; queueMicrotask(() => { this.load(); this.run(); }); });
  },

  // Joiners, city buffs and the pets switch: choices, not game facts, so they stay in this browser.
  extras() {
    const prefs = this.prefs;
    prefs.joiners[this.job] = this.joiners.filter(j => j.key).map(j => ({ key: j.key, level: Number(j.level) || 5 }));
    prefs.city = {};
    CITY.forEach(id => { if (Number(this.city[id])) prefs.city[id] = Number(this.city[id]); });
    prefs.usePets = this.usePets;
    const cap = Number(this.cap);
    if (this.cap !== '' && Number.isSafeInteger(cap) && cap >= 15 && cap <= 1e8) prefs.rallyCap = cap; else delete prefs.rallyCap;
    writePrefs(prefs);
    this.run(true);
  },
  resetJoiners() { delete this.prefs.joiners[this.job]; writePrefs(this.prefs); this.run(); },
  pickTier() { this.tierPicked = true; this.run(); },
  edit() { clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.save(), 400); this.run(); },

  // The typed rows; a type with any blank uses the generation's typical stats.
  typed() {
    const rows = {};
    ROWS.forEach(row => { rows[row] = {}; STATS.forEach(stat => { rows[row][stat] = statValue(this.stats[row + '.' + stat]); }); });
    return rows;
  },
  // The saved Bonus Overview fills its boxes; a row not saved yet keeps what is typed so far.
  load() {
    const { store } = this.engine(), saved = A.combat(store).overview || {};
    ROWS.forEach(row => STATS.forEach(stat => {
      const value = saved[row] && saved[row][stat];
      if (value !== undefined && statValue(this.stats[row + '.' + stat]) !== value) this.stats[row + '.' + stat] = String(value);
    }));
  },
  save() {
    const { store } = this.engine();
    if (!store) return;
    const rows = this.typed(), whole = {};
    ROWS.forEach(type => { const row = rows[type]; if (STATS.every(k => row[k] !== null)) whole[type] = row; });
    if (!Object.keys(whole).length) return;
    try { store.setCombat({ overview: whole }, 'manual'); this.saved = t('saved'); this.savedState = 'saved'; }
    catch (cause) { this.saved = t('saveFailed'); this.savedState = 'failed'; }
  },
  // Bonus Overview screenshots read by the import dock arrive as 'ov-{row}-{stat}'; `before`
  // gets what each box held, so the dock can undo.
  importSheet(detail) {
    Object.keys(detail.values).forEach(key => {
      const at = key.replace(/^ov-/, '').replace('-', '.');
      if (!Object.hasOwn(this.stats, at)) return;
      detail.before[key] = this.stats[at] === '' ? null : Number(this.stats[at]);
      const value = detail.values[key];
      this.stats[at] = value === null || value === undefined ? '' : String(value);
    });
    this.overviewOpen = true;
    this.save(); this.run();
  },

  // The Bonus Overview table shows what the ranking assumes: a troop type it fills with the
  // generation's typical stats carries them as ghost values in its blank boxes, and a row it
  // still needs (a part-typed type, or the Squads' row once any type is in) is marked unknown.
  ghost(row) { return !!this.overview && this.overview.missing.includes(row); },
  holder(row) { return this.ghost(row) ? fmt(this.overview.typical) : '?'; },
  unknownRow(row) {
    if (!this.overview) return null;
    const typed = this.typed()[row], some = STATS.some(k => typed[k] !== null);
    return (row === 'squads' ? this.overview.noSquads : this.overview.missing.includes(row) && some) ? '' : null;
  },
  kit(id) { return this.kits[id] || ''; },

  run(fromExtras) {
    const { data, store } = this.engine(), prefs = this.prefs, mine = this.ticket += 1;
    const owned = A.roster(store), gen = A.generation(owned, data, globalThis.KS_SERVER_AGE && KS_SERVER_AGE.getGeneration());
    const job = this.job;
    // Troop tier and Truegold: the best you have saved, else the generation's usual.
    if (!this.tierPicked) {
      let best = null;
      (A.combat(store).troops || []).forEach(row => { if (!best || row.tier > best.tier || (row.tier === best.tier && row.tg > best.tg)) best = row; });
      const stock = data.megafauna.troops[String(gen)];
      this.tier = String(best ? best.tier : stock.tier); this.tg = String(best ? best.tg : stock.tg);
    }
    const typed = this.typed(), ov = A.overview(typed, gen, data), list = L.lineups(L.candidates(owned, data));
    // What the ranking is worked out from (js/lead-inputs.mjs): a chip for each input, solid when it's in, ◇ when a typical value stands in, dashed when missing.
    const facts = I.gather(store, { overview: typed, usePets: prefs.usePets !== false, rallyTyped: prefs.rallyCap > 0, tierPicked: this.tierPicked });
    const inputs = I.assess(job, facts, { townKnown: L.TOWN_TG }), herePage = (here || '').split(' ');
    this.chips = inputs.items.map(item => ({ id: item.id, have: item.have, core: item.core ? '' : null, href: I.href(item.id, self || 'heroes', herePage), label: inputLabel(item.id) }));
    this.extrasFrom(gen, fromExtras);
    if (!list.length) { this.best = null; this.list = []; this.foes = false; this.status = t('noHeroes'); return; }
    this.overview = { missing: ov.missing, typical: ov.typical, noSquads: ov.noSquads };
    const ready = fill('ready', { n: fmt(Object.keys(owned).filter(k => L.copyOf(k, owned[k], data)).length) });
    const you = { overview: ov.rows, troops: A.troops(Number(this.tier) || 10, Number(this.tg) || 0), joiners: A.joiners(prefs, job, gen, data), city: L.cityLayer(A.city(prefs)), pets: A.pets(store, data, prefs.usePets), gear: A.gear(store), town: A.town(store) };
    if (job === 'bear') {
      const scored = list.map(lineup => Object.assign(L.bear(you, lineup, data), { lineup }));
      scored.sort((a, b) => b.score - a.score);
      this.status = ready;
      this.paint(scored, gen, you, inputs);
      return;
    }
    // A fight takes a few milliseconds per lineup, so they run a few at a time.
    const done = [];
    let at = 0;
    const step = () => {
      if (mine !== this.ticket) return;
      for (let i = 0; i < CHUNK && at < list.length; i++, at++) done.push(Object.assign(L.fight(you, list[at], job, gen, data, { gen }), { lineup: list[at] }));
      if (at < list.length) { this.status = fill('working', { done: fmt(at), total: fmt(list.length) }); setTimeout(step, 0); return; }
      done.sort((a, b) => b.score - a.score);
      this.status = ready;
      this.paint(done, gen, you, inputs);
    };
    step();
  },
  // The extras' fields follow the saved choices, and the pets line says what they add.
  extrasFrom(gen, fromExtras) {
    const { data, store } = this.engine(), prefs = this.prefs, list = A.joiners(prefs, this.job, gen, data);
    this.joinersTitle = BH().fill(t('joinersFor'), { job: BH().tr('leads.job.' + this.job, this.job) });
    this.joiners = [0, 1, 2, 3].map(i => ({ key: list[i] ? list[i].key : '', level: String(list[i] ? list[i].level : 5) }));
    const city = A.city(prefs);
    this.city = Object.fromEntries(CITY.map(id => [id, String(city[id] || 0)]));
    this.usePets = prefs.usePets !== false;
    if (!fromExtras) this.cap = prefs.rallyCap ? String(prefs.rallyCap) : '';
    this.capHolder = fmt(A.rallyCap(prefs).cap);
    const levels = A.petLevels(store);
    const lines = data.pets.filter(pet => L.petLevelPct(pet, levels[pet.id]) > 0).map(pet => {
      const key = pet.side === 'enemy' ? 'enemy' + pet.stat.charAt(0).toUpperCase() + pet.stat.slice(1) : pet.stat;
      return BH().fill(t('pet'), { name: BH().tr('pets.name.' + pet.id, pet.name), level: fmt(levels[pet.id]), stat: t('petStat.' + key), pct: fmt(L.petLevelPct(pet, levels[pet.id])) });
    });
    this.pets = prefs.usePets === false ? t('petsOff') : lines.length ? lines.join(' · ') : t('noPets');
  },
  capHolder: '',

  // The best lineup gets the dossier treatment; the next four follow as a ranked list.
  paint(results, gen, you, inputs) {
    const { data, store } = this.engine(), r = results[0], next = results[1], job = this.job;
    const best = {
      job, provisional: inputs.provisional ? '' : null,
      title: t('bestTitle.' + job),
      estimated: inputs.estimated.length > 0, estNames: names(inputs.estimated),
      // A result short of a core input keeps a dashed frame; what it leaves out follows as ? marks.
      unknowns: inputs.open.map(id => {
        const item = inputs.items.find(i => i.id === id), some = item.missing && item.missing.length && item.missing.length < TYPES.length;
        return some ? fill('partOf', { what: inputLabel(id), types: item.missing.map(typeName).join(', ') }) : inputLabel(id);
      }),
      verdict: job !== 'bear' ? fill('beats', { n: fmt(wonOf(r)), total: fmt(r.foes.length) })
        : !next ? t('only') : r.score / next.score - 1 < 0.005 ? t('tie') : fill('ahead', { n: fmt(Math.round((r.score / next.score - 1) * 1000) / 10) }),
      seats: seats(r.lineup, data), mix: null, damage: null, rail: null, panel: []
    };
    if (job === 'bear') {
      best.mix = TYPES.map((type, i) => ({ type, style: '--part: ' + r.mix[i], pct: fmt(Math.round(r.mix[i] * 100)) + '%', name: typeName(type) }));
      // The Bear Hunt page's march builder can fill a leader's own rally with this mix.
      leadMix.mix = r.mix.slice();
      const rc = A.rallyCap(this.prefs), march = Math.floor(rc.cap / 15), counts = TYPES.map((type, i) => Math.round(march * r.mix[i])), valora = A.valora(store);
      const sim = L.hunt(you, r.lineup, counts, data, { hunts: 2000, pointsPct: valora });
      const lo = BattleEngine.quantile(sim.totals, 0.1), hi = BattleEngine.quantile(sim.totals, 0.9), tile = BH().tileText(sim.mean);
      best.damage = {
        // Anything left out only adds damage, so the number stays open until it's in.
        value: tile.text, title: tile.title || null, open: inputs.open.length ? '' : null,
        band: fill('damageBand', { lo: BH().compact(lo), hi: BH().compact(hi) }),
        bins: histogram(sim.totals, lo, hi),
        split: TYPES.map((type, i) => ({ type, n: fmt(counts[i]) })),
        note: fill('damageNote', { n: fill('troops', { n: fmt(march) }), cap: fmt(rc.cap), est: rc.estimated ? t('estimated') : '', valora: valora ? fill('valora', { n: fmt(valora) }) : '' })
      };
    } else best.rail = rail(r, data);
    const p = L.reportPanel(L.layered(L.panel(you.overview, r.lineup, data, you.gear, you.town), { city: you.city, pet: you.pets }, { city: L.blank(), pet: L.blank() }), r.lineup, job === 'garrison' ? 'defender' : 'rally', data);
    best.panel = TYPES.map((type, i) => ({ name: typeName(type), unknown: inputs.typeShort(type) ? '' : null, cells: ['atk', 'let', 'def', 'hea'].map(field => sign(p[field][i])) }));
    this.best = best;
    this.list = results.slice(1, TOP).map((row, at) => ({
      rank: fmt(at + 2), seats: seats(row.lineup, data),
      bear: job === 'bear',
      score: job === 'bear' ? fill('ofBest', { n: pct(row.score / r.score) }) : fill('wins', { n: fmt(wonOf(row)), total: fmt(row.foes.length) }),
      mix: job === 'bear' ? fill('mix', { inf: pct(row.mix[0]), cav: pct(row.mix[1]), arc: pct(row.mix[2]) }) : '',
      share: '--share: ' + row.score / r.score,
      rail: job === 'bear' ? [] : rail(row, data)
    }));
    this.foes = job !== 'bear' && results.length > 0;
    this.foesNote = fill('foesNote', { n: fmt(gen), total: fmt(data.megafauna.total) });
    // Each tier's loadout at your generation, under its summary.
    const kits = {};
    data.megafauna.foes.forEach(foe => {
      const kit = L.loadout(foe, gen, data), at = String(Math.max(1, Math.min(gen | 0, data.megafauna.generations.length)));
      const stars = Math.floor(kit.stars / 6) + (kit.stars % 6 ? ' ' + (kit.stars % 6) + '/6' : '');
      kits[foe.id] = fill('kit', {
        gen: fmt(+at), stars, widget: fmt(kit.widget), pct: fmt(Math.round(data.megafauna.overview[at] * kit.overview)),
        tg: fmt(kit.tg), gear: fill('gear.' + kit.gear.quality, { n: fmt(kit.gear.level) }), joiners: fmt(kit.joinerLevel),
        pets: fmt(kit.petLevel), city: t(cityKey(kit.city))
      });
    });
    this.kits = kits;
  }
}));
