/* The Fantasy Theater page's controller: amulets in, expected tokens, the money price of a
   token, and the KvK points the shop turns tokens into. seasonal/index.html binds to it with
   x-data="theater". The maths is js/fantasy-theater.mjs. English only, like the Halloween
   page. */
import { Alpine } from '../alpine.mjs';
import Theater from '../fantasy-theater.mjs';

const RATE = Theater.tokensPerAmulet();
const CLIMB = Theater.climb();
const FORTRESS = Theater.climb(Theater.data.fortress);
const CLAIM_AT = [2, 3, 4, 5, 6, 7].map(floor => ({ floor, rate: Theater.tokensPerAmulet(floor) }));
const PACKS = Theater.packs(RATE);
const CUR = Theater.data.currency;
const ROWS = { gold: 'Gold row', purple: 'Purple row', blue: 'Blue row' };

const fmt = n => Math.round(n).toLocaleString('en-GB');
const money = (n, places = 2) => CUR + n.toFixed(places);
const whole = v => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };

Alpine.data('theater', () => ({
  amulets: 1000,
  example: true,
  used: 0,
  tokens: 0,
  pack: 'rare',
  mithrilFirst: true,
  left: {},
  fmt, money,
  rate: RATE,
  climbStats: CLIMB,
  fortressStats: FORTRESS,
  claimAt: CLAIM_AT,
  packs: PACKS,
  rows: ROWS,

  enter() { this.example = false; },
  get held() { return whole(this.amulets); },
  get expected() { return this.held * RATE; },
  get climbs() { return this.held / CLIMB.mean; },
  get fortressRuns() { return this.climbs * Theater.fanstarsPerClimb / Theater.data.fanstarsForFortress; },
  get safeClimbs() { return Math.floor(this.held / CLIMB.p90); },
  get milestones() { return Theater.track(whole(this.used), this.held); },
  get milestonePoints() { return this.milestones.reduce((sum, m) => sum + m.amount * m.kvkPoints, 0); },
  get chosen() { return PACKS.find(p => p.id === this.pack) || PACKS[0]; },
  get budget() { return whole(this.tokens) + Math.floor(this.expected); },
  get plan() { return Theater.spend(this.budget, this.left, this.mithrilFirst); },
  get shop() { return Theater.shop(this.left).sort((a, b) => b.perToken - a.perToken || a.price - b.price); },
  perMoney(line) { return line.perToken / this.chosen.perThousand * 1000; },
  setLeft(index, value) { this.left = { ...this.left, [index]: whole(value) }; },
  days(line) { return line.days.length ? 'Days ' + line.days.join(', ') : 'Not scored'; }
}));
