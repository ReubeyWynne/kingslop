/* The VIP calculator's controller: level, progress and days played in, the dates for every
   remaining level out, at the player's own rate. vip-calculator/index.html binds to it with
   x-data="vip" in two places (the calculator and the milestone cards), which share one
   state. The maths is js/vip-ladder.mjs. */
import { shared, words } from '../alpine.mjs';
import { forecast, MAX } from '../vip-ladder.mjs';

const TAGS = { 4: 'construction', 6: 'march queue', 9: 'f2p ceiling' };

shared('vip', {
  ...words,
  MAX,
  // The page's starting example; the inputs carry the same values for no-JavaScript readers.
  level: 5, xp: 12000, days: 120,
  get plan() { return forecast(this.level, this.xp, this.days); },
  tag(level) { return this.t('vip.calc.tag' + level, TAGS[level] || ''); },

  get headline() {
    const p = this.plan;
    if (p.status === 'top') return this.t('vip.calc.atTop', 'You’re at <b>VIP 12</b>, the highest level.');
    if (p.status === 'noDays') return this.t('vip.calc.noDays', 'Enter your <b>days played</b>.');
    if (p.status === 'noRate') return this.t('vip.calc.noRate', 'No rate yet: you’ve earned <b>0 VIP XP</b>. Play a few days and come back.');
    const n = p.nextLevel.days;
    return this.count('vip.calc.rateLine', n, [
      'At <b>{rate}</b> VIP XP a day, you already have the XP for your next level — <b>today</b>.',
      'At <b>{rate}</b> VIP XP a day, your next level lands <b>{date}</b>, <b>tomorrow</b>.',
      'At <b>{rate}</b> VIP XP a day, your next level lands <b>{date}</b>, <b>{n} days</b> from today.'
    ], { rate: this.fmt(p.rate), date: this.date(p.nextLevel.date), n: this.fmt(n) });
  },

  // The milestone card's line: behind you, a dash while there is no rate, else the date.
  milestone(level) {
    const m = this.plan.milestones.find(x => x.level === level);
    if (m.done) return this.t('vip.targets.done', 'behind you');
    if (m.days === undefined) return '—';
    return this.count('vip.targets.out', m.days, [
      'your date: <b>{date}</b> · <b>today</b>',
      'your date: <b>{date}</b> · <b>tomorrow</b>',
      'your date: <b>{date}</b> · <b>{n} days</b>'
    ], { date: this.date(m.date), n: this.fmt(m.days) });
  }
});
