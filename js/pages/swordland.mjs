/* The Swordland Showdown 180,000-line calculator: minutes at full occupation and enemy power
   defeated in, personal points against the line out. swordland-showdown/index.html binds to it
   with x-data="swordland".

   Honest by design: it only sums what the event publishes, occupation income and combat
   points. Loot crates are randomised and undercellers are slower, so they stay out of the sum
   (the note under the calculator says so). */
import { Alpine, words } from '../alpine.mjs';

// From the transcript: best-case occupation income is 3,000 personal a minute (shrine + 2
// sanctums + 3 abbeys); combat scores 80 per 10,000 power defeated attacking, 40 defending;
// the personal line is 180,000 and a match runs 55 minutes.
const OCC_PER_MIN = 3000, ATTACK_RATE = 80, DEFENCE_RATE = 40, TARGET = 180000, MAX_MINUTES = 55;
const whole = value => Math.max(0, parseInt(value, 10) || 0);

Alpine.data('swordland', () => ({
  ...words,
  // The inputs' starting values, which no-JavaScript readers see too.
  minutes: 25, attack: 0, defence: 0,
  get points() {
    const m = Math.min(MAX_MINUTES, whole(this.minutes)), k = whole(this.attack), d = whole(this.defence);
    const total = m * OCC_PER_MIN + Math.round(k / 10000 * ATTACK_RATE) + Math.round(d / 10000 * DEFENCE_RATE);
    return { m, k, d, total, pct: total / TARGET * 100 };
  },
  get line() {
    const p = this.points;
    return this.t('sw.target.out', '<b id="sw-total">{total}</b> personal points, <b id="sw-pct">{pct}</b> of the 180,000 line.', { total: this.fmt(p.total), pct: this.fmt(p.pct) + '%' });
  }
}));
