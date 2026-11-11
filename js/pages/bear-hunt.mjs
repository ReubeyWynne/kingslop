/* The Bear Hunt page (bear-hunt/): your hunt's size and the plan it gives, the march builder
   that splits your troops between your rally and your joins, and the joiner heroes for your
   server's generation. bear-hunt/index.html binds to it with x-data="bearHunt" on <main>, so
   every sentence that carries the hunt's numbers reads the same state. The lead finder on the
   page (js/pages/lead-finder.mjs) offers its best Bear mix to the builder.

   The plan's arithmetic is js/bear-hunt-plan.mjs, the builder's js/bear-allocator.mjs. */
import { Alpine, words } from '../alpine.mjs';
import HuntPlan from '../bear-hunt-plan.mjs';
import Allocator from '../bear-allocator.mjs';
import { leadMix } from './lead-finder.mjs';

const BH = () => globalThis.BH;
const fmt = n => words.fmt(n);
const locale = () => (globalThis.I18N && I18N.locale) || 'en-GB';
// ?guest reads this device's choices but never writes them.
const guest = /(?:^|[?&])guest(?:=|&|$)/.test(location.search);
function stored(key) { try { const saved = JSON.parse(localStorage.getItem(key) || 'null'); return saved && typeof saved === 'object' ? saved : null; } catch (ignored) { return null; } }
function keep(key, value) { if (guest) return; try { localStorage.setItem(key, JSON.stringify(value)); } catch (ignored) { /* private mode, full storage */ } }
const usable = value => typeof value === 'string' && value !== '' && isFinite(Number(value));
// A field's number the way the page has always read it: Number() of its text, else the fallback.
const number = (value, fallback) => { const n = Number(value); return isFinite(n) ? n : fallback; };
// A whole number in a field's range, or blank: what the field's own validity allows.
const whole = (value, min, max) => value === '' || (Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max);

/* The hunt: how many players turn up, the biggest rally's capacity and its leader's march.
   js/bear-hunt-plan.mjs works out the rest. */
const HUNT_KEY = 'bh:hunt:v1', DEFAULT_RALLY = 1360000;
const HUNT_RANGE = { players: [5, 100], rally: [16, 1e9], march: [1, 1e9] };
function huntPlan(players, rally, march) {
  return HuntPlan.plan(isFinite(players) ? players : 15, isFinite(rally) && rally > 0 ? rally : DEFAULT_RALLY, isFinite(march) && march > 0 ? march : 0);
}
const planOf = hunt => huntPlan(parseFloat(hunt.players), parseFloat(hunt.rally), parseFloat(hunt.march));

/* The cap, shown on one rally, as fractions of its capacity. The rally's leader sends their
   biggest march (2/15 of the rally unless the reader says otherwise). With the cap, the S
   joiners each send up to the cap. Without it, joiners send their usual march, about 80% of the
   leader's, until the rally is full: one last join fills what room is left and everyone after
   it is left out. A march's damage grows with the square root of its troops, so the gain is
   fewer joins and fewer troops per √, together. */
const UNCAPPED_SHARE = 0.8;
function capCompare(plan) {
  const S = plan.joiners, lead = plan.march / plan.rally, join = UNCAPPED_SHARE * lead, fit = [];
  let room = 1 - lead;
  const even = Math.min(join, plan.cap / plan.rally);
  while (fit.length < S && room > 1e-9) { const size = Math.min(join, room); fit.push(size); room -= size; }
  const root = (sum, x) => sum + Math.sqrt(x);
  const without = fit.reduce(root, Math.sqrt(lead)), withCap = Math.sqrt(lead) + S * Math.sqrt(even);
  return { lead, join, even, fit, out: S - fit.length, gain: Math.max(0, Math.round(100 * (withCap / without - 1))) };
}

/* The march builder's fields, by their ids (also the keys of the saved builder). The troops
   you enter are kept on this device, like the simulator's sheet, so a reload or a later visit
   opens on your own marches. */
const BUILDER_KEY = 'bh:bear-allocator:v1';
const FIELDS = { 'infantry-total': '29750', 'cavalry-total': '89250', 'archer-total': '476000', 'join-queues': '6', 'join-cap': '85000', 'own-cap': '130000', 'own-infantry': '5', 'own-cavalry': '15', 'own-archers': '80' };
const SUFFIX = { infantry: 'inf', cavalry: 'cav', archers: 'arc' };

/* Rule 5 and the hero explorer: the joiner heroes each generation has. */
const HEROES = {
  chenko: { name: 'Chenko', type: 'cav', whyJoin: 'Raises attack by 25%. A simple, reliable shared offensive skill.' },
  yeonwoo: { name: 'Yeonwoo', type: 'inf', whyJoin: 'Raises attack by 25%. It shares an effect family with Chenko, so their bonuses add together.' },
  amane: { name: 'Amane', type: 'arc', whyJoin: 'Raises attack by 25% in a different effect family from Chenko and Yeonwoo, so it multiplies with their shared attack stack.' },
  margotJoin: { name: 'Margot', key: 'margot', type: 'cav', whyJoin: 'Raises attack by 25% in the same effect family as Amane. Another strong shared offensive option from Generation IV.' },
  vivianJoin: { name: 'Vivian', key: 'vivian', type: 'arc', whyJoin: 'Raises enemy damage taken by 25%. It uses a different effect family from the common attack bonuses, so it multiplies with them.' },
  avaJoin: { name: 'Ava', key: 'ava', type: 'cav', whyJoin: 'Reduces enemy defence in its own effect family. Strong shared value when Ava is not leading the rally.' },
  weewooJoin: { name: 'Wee & Woo', key: 'weewoo', type: 'arc', whyJoin: 'Their first skill splits its bonus between attack and lethality. Those effect families multiply, giving slightly more combined value than a flat 25% bonus.' }
};
const JOINER_S_BY_GEN = {
  1: ['chenko', 'yeonwoo', 'amane'], 2: ['chenko', 'yeonwoo', 'amane'], 3: ['chenko', 'yeonwoo', 'amane'],
  4: ['chenko', 'yeonwoo', 'amane', 'margotJoin'],
  5: ['chenko', 'yeonwoo', 'amane', 'margotJoin', 'vivianJoin'], 6: ['chenko', 'yeonwoo', 'amane', 'margotJoin', 'vivianJoin'],
  7: ['avaJoin', 'weewooJoin']
};
const APPROVED_BACKUPS = {
  1: ['Amadeus when he is not your lead'], 2: ['Amadeus if available'], 3: ['Amadeus if available'],
  4: ['Amadeus if available', 'Rosa'], 5: ['Amadeus if available', 'Rosa'], 6: ['Amadeus if available', 'Rosa', 'Yang'],
  7: ['Earlier recommended joiners remain usable', 'Rosa', 'Yang', 'one Petra per rally']
};
const LATEST = 7;
const heroImage = key => '../img/heroes/' + (HEROES[key] && HEROES[key].key ? HEROES[key].key : key) + '.webp';
// The explorer's copy is translated under a key made from its English (bh.dynamic.*).
function dynamicKey(source) {
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return 'bh.dynamic.' + (hash >>> 0).toString(36);
}
const said = source => words.t(dynamicKey(source), source);
const serverAge = () => globalThis.KS_SERVER_AGE;

Alpine.data('bearHunt', () => {
  const savedHunt = stored(HUNT_KEY) || {}, savedBuilder = stored(BUILDER_KEY);
  const hunt = { players: '15', rally: '', march: '' };
  Object.keys(hunt).forEach(name => { if (usable(savedHunt[name])) hunt[name] = savedHunt[name]; });
  const fields = Object.assign({}, FIELDS);
  // Older saves kept two boxes, or a Joining/Leading switch.
  let own = 'even';
  if (savedBuilder) {
    own = savedBuilder['own-rally'] || (savedBuilder['own-token'] === true ? 'token' : savedBuilder['own-priority'] === true || savedBuilder.mode === 'lead' ? 'first' : 'even');
    Object.keys(fields).forEach(id => { if (usable(savedBuilder[id])) fields[id] = savedBuilder[id]; });
  }
  return {
    ...words,
    hunt, fields, own,
    // The hunt as of its last valid input: the bars, the builder and the saved hunt follow it.
    plan: planOf(hunt),
    // The builder: the marches it worked out, whether they are yours yet, and the form's state.
    result: null, personalized: !!savedBuilder, builderOpen: false, ratioChecked: false,
    generation: null, explorerGen: '', picked: null,
    init() {
      const generation = serverAge() && serverAge().getGeneration();
      this.generation = generation || null;
      if (generation) this.explorerGen = String(Math.min(LATEST, generation));
      try { this.result = Allocator.allocate(this.options()); }
      // A saved ratio that does not add up to 100: show the equal split until it is fixed.
      catch (ignored) { this.result = Allocator.allocate(Object.assign(this.options(), { priority: false })); }
      if (!savedBuilder) this.follow(this.plan);
      this.publish();
      // A language switch draws the explorer afresh, its open hero folded away.
      Alpine.effect(() => { Alpine.store('i18n').v; this.picked = null; });
    },
    // What the page's checks and other scripts read: the hunt and the marches as they stand.
    publish() { globalThis.BH_HUNT = this.plan; globalThis.BH_MARCHES = this.result; },

    // ── The hunt ──
    huntInput(name, valid) {
      if (!valid) return;
      this.plan = planOf(this.hunt);
      keep(HUNT_KEY, Object.assign({}, this.hunt));
      this.follow(this.plan);
      this.publish();
    },
    huntValid(name, value) { return whole(value, HUNT_RANGE[name][0], HUNT_RANGE[name][1]); },
    // The figures every hunt sentence carries, from the fields as they stand.
    get figures() {
      const p = planOf(this.hunt), cap = p.cap, hits = Math.round(p.hits * 100) / 100, cc = capCompare(p);
      return {
        players: fmt(p.players), march: fmt(p.march), joiners: fmt(p.joiners), fill: fmt(p.fill), divisor: fmt(p.divisor),
        joins: fmt(p.joins), marches: fmt(p.marches), marches2: fmt(p.marches + 1),
        cap: fmt(cap), hits: hits.toLocaleString(locale(), { maximumFractionDigits: 2 }),
        first: fmt(p.first), open: fmt(p.players * p.joins), out: fmt(cc.out), gain: fmt(cc.gain),
        capInf: fmt(cap * 0.05), capCav: fmt(cap * 0.15), capArc: fmt(cap * 0.8),
        totInf: fmt(cap * 0.05 * p.joins), totCav: fmt(cap * 0.15 * p.joins), totArc: fmt(cap * 0.8 * p.joins)
      };
    },
    say(key) { return BH().fill(this.t(key, ''), this.figures); },
    // The usual rally, and 2/15 of whatever rally is in play, as ghost ink.
    get rallyGhost() { return fmt(DEFAULT_RALLY); },
    get marchGhost() { const rally = this.plan.rally; return fmt(Math.round((rally > 0 ? rally : DEFAULT_RALLY) * 2 / 15)); },
    // The same rally twice: who fits without a cap, and with one. When every usual march
    // already fits, the cap changes nothing: one rally, no comparison.
    get cap() { return capCompare(this.plan); },
    get same() { return this.cap.out === 0 && this.cap.gain === 0 ? '' : null; },
    capBar(on) {
      const cc = this.cap, sizes = on ? new Array(this.plan.joiners).fill(cc.even) : cc.fit.slice();
      if (!on) for (let k = 0; k < cc.out; k++) sizes.push(-cc.join);
      return [cc.lead].concat(sizes).map((size, i) => ({ lead: i === 0 ? '' : null, out: size < 0 ? '' : null, style: '--w: ' + Math.abs(size) }));
    },
    capOuts(on) { return '--outs: ' + (on ? 0 : this.cap.out); },
    // One bar for each join you send, as tall as the cap: smaller hunts send fewer, bigger joins.
    get joinBars() { return Array.from({ length: this.plan.joins }, (_, i) => i); },
    get joinsTall() { return '--tall: ' + Math.min(1, 8 / this.plan.divisor); },
    // Rule 5: the joiner heroes your generation has, then the empty slot for "none".
    get joinerImages() { return (JOINER_S_BY_GEN[Math.min(7, this.generation | 0)] || JOINER_S_BY_GEN[1]).slice(0, 4).map(heroImage); },
    ageChanged(detail) {
      const generation = detail && detail.generation;
      this.generation = generation || null;
      if (!generation) return;
      const g = String(Math.min(LATEST, generation));
      if (this.explorerGen !== g) { this.explorerGen = g; this.picked = null; }
    },

    // ── The march builder ──
    // Your own rally: one troop, the same as a join, or filled first at its own mix.
    options() {
      const f = this.fields, token = this.own === 'token';
      return {
        infantry: number(f['infantry-total'], 0), cavalry: number(f['cavalry-total'], 0), archers: number(f['archer-total'], 0),
        queues: number(f['join-queues'], 6), joinCap: number(f['join-cap'], 85000),
        ownCap: token ? 1 : number(f['own-cap'], 130000), priority: this.own === 'first',
        ratio: { infantry: number(f['own-infantry'], 5), cavalry: number(f['own-cavalry'], 15), archers: number(f['own-archers'], 80) }
      };
    },
    saveBuilder() { keep(BUILDER_KEY, Object.assign({}, this.fields, { 'own-rally': this.own })); },
    get toggleLabel() { return this.personalized ? this.t('bh.alloc.edit', 'Edit troops') : this.t('bh.alloc.open', 'Use my troops'); },
    get example() { return this.personalized ? null : this.t('bh.example', 'Example'); },
    // A one-troop rally has no size to set; only a rally filled first has a mix of its own.
    get ownCapOff() { return this.own === 'token'; },
    get ratioOff() { return this.own !== 'first'; },
    // The three percentages must add up to 100, checked when the builder is applied.
    get ratioError() {
      const r = this.options().ratio;
      return this.ratioChecked && this.own === 'first' && Math.abs(r.infantry + r.cavalry + r.archers - 100) > 0.000001 ? this.t('bh.alloc.ratioError', 'The three percentages must add up to 100.') : '';
    },
    // Opening the builder puts the reader in its first field, and applying it reports the
    // form's own validity: the two places this controller touches the page, from the markup.
    toggle(first) { this.builderOpen = !this.builderOpen; if (this.builderOpen) Alpine.nextTick(() => first.focus()); },
    // Applying checks the form first, the ratio's own message on its last box.
    apply(form, button, ratioBox) {
      this.ratioChecked = true;
      ratioBox.setCustomValidity(this.ratioError);
      if (!form.reportValidity()) return;
      this.result = Allocator.allocate(this.options());
      this.personalized = true;
      this.publish();
      this.builderOpen = false;
      button.focus();
    },
    // The hunt above sets how many joins to send and how big: a change there carries into the
    // builder, and a first visit starts from it.
    follow(plan) {
      this.fields['join-queues'] = String(plan.joins);
      if (plan.cap) this.fields['join-cap'] = String(plan.cap);
      this.saveBuilder();
      try { this.result = Allocator.allocate(this.options()); } catch (ignored) { /* a ratio that doesn't add up waits for the reader */ }
    },
    // The marches drawn: each bar as tall as its march against the biggest, split by troop type.
    get tallest() { return this.result ? Math.max(this.result.own.total, this.result.join.total, 1) : 1; },
    stack(march) { return 'height: ' + (100 * march.total / this.tallest) + '%'; },
    part(march, type) { return 'height: ' + (march.total ? 100 * march[type] / march.total : 0) + '%'; },
    get queues() { return this.result ? Array.from({ length: this.result.queues }, (_, i) => fmt(i + 1)) : []; },
    troop(who, type) { return this.result ? fmt(this.result[who][type]) : ''; },
    get homeTotal() { const h = this.result.home; return fmt(h.infantry + h.cavalry + h.archers); },
    // The lead finder's best Bear mix, offered for a leader's own rally.
    get mix() {
      const m = leadMix.mix;
      if (!m || m.length !== 3) return null;
      const percent = n => Math.round(n * 1000) / 10, inf = percent(m[0]), cav = percent(m[1]);
      return { infantry: inf, cavalry: cav, archers: Math.round((100 - inf - cav) * 10) / 10 };
    },
    get mixText() { const m = this.mix; return m ? [m.infantry, m.cavalry, m.archers].map(n => n.toLocaleString(locale())).join(' / ') : ''; },
    useMix() {
      const m = this.mix;
      if (!m) return;
      Object.assign(this.fields, { 'own-infantry': String(m.infantry), 'own-cavalry': String(m.cavalry), 'own-archers': String(m.archers) });
      this.ratioChecked = false;
      this.saveBuilder();
    },

    // ── The hero explorer: the joiner heroes your server's generation has ──
    said,
    get explorerGeneration() { const n = Number(this.explorerGen); return isFinite(n) && n >= 1 ? Math.min(LATEST, Math.round(n)) : null; },
    pickGeneration() {
      const generation = this.explorerGeneration;
      this.picked = null;
      if (generation && serverAge()) serverAge().setGeneration(generation);
    },
    get joinerCards() {
      const g = this.explorerGeneration;
      return g && JOINER_S_BY_GEN[g] ? JOINER_S_BY_GEN[g].map(key => ({ key, name: HEROES[key].name, img: heroImage(key), label: HEROES[key].name + ': ' + said('show recommendation details') })) : [];
    },
    get pickedHero() { const hero = HEROES[this.picked]; return hero ? { name: hero.name, img: heroImage(this.picked), why: said(hero.whyJoin) } : null; },
    get backups() {
      const list = APPROVED_BACKUPS[this.explorerGeneration] || [];
      return (list.length ? list.map(said).join(' · ') + '. ' : '') + said('Hilde is excluded from the default list because alliance policies vary. Use her only if your alliance allows her. If no approved hero is available, send no hero.');
    }
  };
});
