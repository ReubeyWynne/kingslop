/* The Heroes page's break-point finder (x-data="heroBreakpoint" on #breakpoint in heroes/index.html):
   two heroes of one troop type, each at its own stars, widget and skills, and how far either has
   to be built to catch the other. LeadEngine does the maths (js/lead-engine.mjs: score, walker);
   this controller reads the choices and the account, walks a few scores at a time, and lays out
   two star-by-widget tables as plain data for the markup. */
import { Alpine, words } from '../alpine.mjs';
import L from '../lead-engine.mjs';

const EN = {
  sameHero: 'Pick two different heroes.',
  working: '{n}%…',
  'verdict.bear': '{winner} +{n}% Bear damage',
  'verdict.fight': '{winner} +{n} pts army kept',
  'verdict.level': 'Level',
  'catch.title': '{hero} catches {rival}',
  'catch.at': 'from {stars} W{widget}',
  'catch.bare': 'from {stars}, no widget',
  'catch.never': 'never',
  starN: '{n}★', tier: '{n}/6', w: 'W{n}', yes: '✓', no: '—'
};
const PREFS = 'ks.hero-breakpoint.v1', LEAD_PREFS = 'ks.lead-finder.v1';
const STATS = ['attack', 'lethality', 'defense', 'health'], TYPES = ['inf', 'cav', 'arc'], CHUNK = 3;
const data = () => globalThis.LeadData;
const store = () => Alpine.store('ledger').store;
const read = key => { try { const v = JSON.parse(localStorage.getItem(key) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (cause) { return {}; } };
const roster = () => { try { return store() ? store().heroes().roster : {}; } catch (cause) { return {}; } };
const combat = () => { try { return store() ? store().combat() : { overview: {}, troops: [] }; } catch (cause) { return { overview: {}, troops: [] }; } };
const stockGen = gen => Math.max(1, Math.min(data().megafauna.generations.length, gen | 0));
const sides = ['a', 'b'];

// ---- The two heroes -------------------------------------------------------------
function newestOf(type, not) {
  const heroes = data().heroes;
  let best = null;
  Object.keys(heroes).forEach(key => {
    const h = heroes[key];
    if (h.type !== type || key === not) return;
    if (!best || h.generation > heroes[best].generation || (h.generation === heroes[best].generation && h.ceiling > heroes[best].ceiling)) best = key;
  });
  return best;
}
// A fresh visit starts from your strongest owned hero that a newer one of its type could replace,
// against the newest of that type; nothing owned starts with archers.
function defaults() {
  const d = data(), owned = roster();
  let pick = null;
  Object.keys(owned).forEach(key => {
    const copy = L.copyOf(key, owned[key], d);
    if (!copy || newestOf(copy.type) === key) return;
    if (!pick || L.statLine(copy, d) > L.statLine(pick, d)) pick = copy;
  });
  const top = newestOf('arc');
  const a = pick ? pick.key : Object.keys(d.heroes).filter(k => d.heroes[k].type === 'arc' && d.heroes[k].ceiling >= 200 && k !== top).sort((x, y) => d.heroes[y].generation - d.heroes[x].generation)[0];
  return { a, b: newestOf(d.heroes[a].type, a) };
}
function investment(key) {
  const mine = roster()[key];
  if (mine && mine.stars !== null && mine.stars !== undefined) return { stars: mine.stars | 0, widget: mine.widget | 0, skills: mine.skills || null };
  return { stars: 24, widget: data().widgets[key] ? 4 : 0, skills: null };
}
const blank = () => ({ key: '', stars: '24', widget: '0', skills: ['', '', ''] });

// ---- The account ----------------------------------------------------------------
// Yours: the lead finder's sources, read the same way (js/pages/lead-finder.mjs).
function mine(gen, which) {
  const d = data(), saved = combat(), typical = d.megafauna.overview[String(gen)], rows = saved.overview || {}, out = {};
  const whole = row => row && STATS.every(k => typeof row[k] === 'number');
  const squads = whole(rows.squads) ? rows.squads : null;
  TYPES.forEach(type => {
    if (whole(rows[type])) { out[type] = {}; STATS.forEach(k => { out[type][k] = rows[type][k] + (squads ? squads[k] : 0); }); }
    else out[type] = { attack: typical, lethality: typical, defense: typical, health: typical };
  });
  let best = null;
  (saved.troops || []).forEach(row => { if (!best || row.tier > best.tier || (row.tier === best.tier && row.tg > best.tg)) best = row; });
  const stock = d.megafauna.troops[String(gen)], tier = best ? best.tier : stock.tier, tg = best ? best.tg : stock.tg;
  const prefs = read(LEAD_PREFS), joiners = prefs.joiners && Array.isArray(prefs.joiners[which])
    ? prefs.joiners[which].filter(j => j && d.heroes[j.key]).map(j => ({ key: j.key, level: Math.max(1, Math.min(5, j.level | 0)) }))
    : (d.megafauna.joiners[which][String(gen)] || []).map(key => ({ key, level: 5 }));
  const levels = {}, city = {};
  let pieces = {}, town = null;
  const s = store();
  try { const pets = s ? s.pets().roster : {}; Object.keys(pets).forEach(id => { levels[id] = pets[id].level; }); } catch (cause) { /* no pets */ }
  try { pieces = s ? s.snapshot().heroGear.pieces : {}; } catch (cause) { pieces = {}; }
  try { town = s ? s.buildings().levels['town-center'] : null; } catch (cause) { town = null; }
  Object.keys(prefs.city || {}).forEach(k => { city[k] = Number(prefs.city[k]) || 0; });
  // Your strongest owned hero in each other seat; a type you own none of takes the Dolphin's meta
  // hero for the generation, so no seat is left empty.
  const by = L.candidates(roster(), d, 1), dolphin = L.stockAccount(d.megafauna.foes[1], gen, which, d);
  return {
    account: {
      overview: out, troops: { tier: [tier, tier, tier], tg: [tg, tg, tg] }, joiners,
      city: L.cityLayer(city), pets: prefs.usePets === false ? L.blank() : L.petLayer(levels, d),
      gear: L.gearLayer(pieces), town: L.townLayer(town)
    },
    lineup: TYPES.map((type, i) => by[type][0] || dolphin.lineup[i])
  };
}

Alpine.data('heroBreakpoint', () => ({
  ...words,
  ready: false,
  job: 'bear', account: 'mine', gen: '4',
  a: blank(), b: blank(),
  // The last run: the two heroes as scored, the verdict inputs and each direction's walk.
  status: '', shown: null, ticket: 0,

  say(key, values) { return this.t('bp.' + key, EN[key], values); },
  init() {
    this.restore();
    this.ready = true;
    this.$watch(() => this.$store.ledger.v, () => this.run());
    this.run();
  },
  hasWidget(side) { return Boolean(data().widgets[this[side].key]); },
  type(side) { return data().heroes[this[side].key].type; },

  setHero(side, key) {
    const inv = investment(key), hero = this[side];
    hero.key = key;
    hero.stars = String(inv.stars);
    hero.widget = String(data().widgets[key] ? Math.min(10, inv.widget) : 0);
    hero.skills = [0, 1, 2].map(i => inv.skills && inv.skills[i] != null ? String(inv.skills[i]) : '');
  },
  // The second hero lists only the first one's troop type.
  narrow() {
    const type = this.type('a');
    if (data().heroes[this.b.key].type !== type || this.b.key === this.a.key) this.setHero('b', newestOf(type, this.a.key));
    sides.forEach(side => { if (!this.hasWidget(side)) this[side].widget = '0'; });
  },
  copyOf(side) {
    const hero = this[side], skills = hero.skills.map(v => v === '' ? null : Number(v));
    return L.copyOf(hero.key, { stars: Number(hero.stars), widget: Number(hero.widget), skills: skills.some(v => v !== null) ? skills.map(v => v === null ? 5 : v) : null }, data());
  },
  remember() {
    const v = { job: this.job, account: this.account, gen: this.gen };
    sides.forEach(side => { const h = this[side]; v[side] = { key: h.key, stars: h.stars, widget: h.widget, skills: h.skills.slice() }; });
    try { localStorage.setItem(PREFS, JSON.stringify(v)); } catch (cause) { /* kept for this visit */ }
  },
  restore() {
    const d = data(), v = read(PREFS), start = defaults();
    sides.forEach(side => {
      const saved = v[side];
      if (saved && d.heroes[saved.key]) {
        this[side] = {
          key: saved.key,
          stars: String(Math.max(0, Math.min(30, saved.stars | 0))),
          widget: String(Math.max(0, Math.min(10, saved.widget | 0))),
          skills: [0, 1, 2].map(i => { const s = saved.skills && saved.skills[i]; return s === '' || s === undefined || s === null ? '' : String(Math.max(0, Math.min(5, s | 0))); })
        };
      } else this.setHero(side, start[side]);
    });
    this.job = v.job || 'bear';
    this.account = v.account || (Object.keys(combat().overview || {}).length ? 'mine' : 'dolphin');
    // Your kingdom's generation when the page knows it, else the newest hero you own, else the
    // newer of the two heroes.
    const owned = roster();
    let ownedGen = 0;
    Object.keys(owned).forEach(key => { if (d.heroes[key] && L.copyOf(key, owned[key], d)) ownedGen = Math.max(ownedGen, d.heroes[key].generation); });
    const age = globalThis.KS_SERVER_AGE;
    this.gen = String(stockGen(v.gen || (age && age.getGeneration()) || ownedGen || Math.max(d.heroes[this.a.key].generation, d.heroes[this.b.key].generation)));
    this.narrow();
  },
  pick(side, key) { this.setHero(side, key); this.run(); },
  aged() { const age = globalThis.KS_SERVER_AGE, gen = age && age.getGeneration(); if (gen) this.gen = String(stockGen(gen)); this.run(); },

  accountFor(gen, which) {
    const d = data();
    if (this.account === 'mine') return mine(gen, which);
    const foe = d.megafauna.foes.find(f => f.id === this.account) || d.megafauna.foes[1], acc = L.stockAccount(foe, gen, which, d);
    return { account: acc, lineup: acc.lineup };
  },

  run() {
    const ticket = this.ticket += 1, which = this.job, gen = stockGen(Number(this.gen) || 4), d = data();
    this.narrow(); this.remember();
    const a = this.copyOf('a'), b = this.copyOf('b');
    if (a.key === b.key) { this.shown = null; this.status = this.say('sameHero'); return; }
    const acc = this.accountFor(gen, which), you = acc.account, lineup = acc.lineup, opts = {};
    // B against A as set, then A against B as set: two walks, a few scores per tick.
    const walks = [L.walker(which, you, lineup, a, b.key, gen, d, opts), L.walker(which, you, lineup, b, a.key, gen, d, opts)];
    const sa = L.score(which, you, L.seated(lineup, a), gen, d, opts), sb = L.score(which, you, L.seated(lineup, b), gen, d, opts);
    let at = 0;
    const chunk = which === 'bear' ? 400 : CHUNK;
    const step = () => {
      if (ticket !== this.ticket) return;
      for (let i = 0; i < chunk && at < 2; i++) if (!walks[at].next()) at += 1;
      if (at < 2) { this.status = this.say('working', { n: this.fmt(Math.round((at + walks[at].progress()) * 50)) }); setTimeout(step, 0); return; }
      this.status = '';
      this.shown = { which, a, b, sa, sb, b_vs_a: walks[0].result(), a_vs_b: walks[1].result() };
    };
    step();
  },

  // ---- What the last run shows --------------------------------------------------
  get done() { return Boolean(this.shown); },
  face(side) { return this.shown ? '../img/heroes/' + this.shown[side].key + '.webp' : ''; },
  starsText(s) { const whole = Math.floor(s / 6), tier = s % 6; return this.say('starN', { n: this.fmt(whole) }) + (tier ? ' ' + this.say('tier', { n: this.fmt(tier) }) : ''); },
  label(copy) { return data().heroes[copy.key].name + ' ' + this.starsText(copy.stars) + (copy.widget ? ' ' + this.say('w', { n: this.fmt(copy.widget) }) : ''); },
  get verdict() {
    const s = this.shown;
    if (!s) return '';
    const diff = s.which === 'bear' ? Math.abs(s.sa / s.sb - 1) * 100 : Math.abs(s.sa - s.sb) * 100;
    if (diff < 0.05) return this.say('verdict.level');
    return this.say(s.which === 'bear' ? 'verdict.bear' : 'verdict.fight', { winner: this.label(s.sa > s.sb ? s.a : s.b), n: this.fmt(Math.round(diff * 10) / 10) });
  },
  // One block: the sentence, then the 0★–4★ rows of six tiers and the 5★ cell. Side 'b' is B
  // catching A as set.
  grid(side) {
    const s = this.shown;
    if (!s) return { title: '', line: '', tiers: [], rows: [] };
    const hero = s[side], rival = s[side === 'b' ? 'a' : 'b'], r = side === 'b' ? s.b_vs_a : s.a_vs_b;
    const first = L.firstBreak(r.widgets), parts = [];
    if (first.any && first.any.widget > 0) parts.push(this.say('catch.at', { stars: this.starsText(first.any.stars), widget: this.fmt(first.any.widget) }));
    if (first.bare) parts.push(this.say('catch.bare', { stars: this.starsText(first.bare.stars) }));
    const rows = [];
    for (let whole = 0; whole <= 5; whole++) {
      const cells = [];
      for (let step = 0; step < (whole < 5 ? 6 : 1); step++) {
        const at = whole * 6 + step, w = r.widgets[at];
        cells.push({
          at, state: w === null ? 'no' : w === 0 ? 'yes' : 'widget', first: Boolean(first.any && at === first.any.stars), title: this.starsText(at),
          need: String(w === null ? 0 : 1 - w / 11), text: w === null ? this.say('no') : w === 0 ? this.say('yes') : this.say('w', { n: this.fmt(w) })
        });
      }
      rows.push({ whole, name: this.say('starN', { n: this.fmt(whole) }), cells });
    }
    return {
      title: this.say('catch.title', { hero: data().heroes[hero.key].name, rival: this.label(rival) }),
      line: parts.length ? parts.join(' · ') : this.say('catch.never'),
      tiers: [0, 1, 2, 3, 4, 5].map(tier => tier ? this.say('tier', { n: this.fmt(tier) }) : '—'),
      rows
    };
  }
}));
