/* vip-ladder.mjs — the VIP ladder and the dates it gives at a player's own rate. No DOM.

   The XP ladder is a game-wide constant, from the in-game VIP screen (March 2026 patch), per
   the Kingshot Mastery VIP guide; only the rate is the player's. XP[L] is the XP needed to
   REACH level L (VIP 1 costs 0: you start there). Each level's progress resets to 0 on
   arrival, and VIP 10+ doubles per level. */
export const XP = [null, 0, 2500, 5000, 12500, 30000, 40000, 60000, 100000, 350000, 600000, 1200000, 2400000];
export const MAX = XP.length - 1;
export const MILESTONES = [4, 6, 9];
const CUM = [null, 0];
for (let level = 2; level <= MAX; level++) CUM[level] = CUM[level - 1] + XP[level];

function addDays(from, n) { const d = new Date(from.getTime()); d.setDate(d.getDate() + n); return d; }
const whole = value => parseInt(value, 10) || 0;

/** The forecast for a level, the XP banked toward the next, and days played, each clamped to
    what the game allows. `status` is 'top' (VIP 12), 'noDays', 'noRate' or 'ok'; `rows` and the
    milestones' dates are filled only when it is 'ok'. */
export function forecast(level, xp, days, today = new Date()) {
  const L = Math.min(MAX, Math.max(1, whole(level) || 1));
  const next = XP[L + 1] || 0;
  const p = Math.min(next, Math.max(0, whole(xp)));
  const D = Math.max(0, whole(days));
  const earned = CUM[L] + p, rate = D > 0 ? earned / D : 0;
  const status = L === MAX ? 'top' : D < 1 ? 'noDays' : earned < 1 ? 'noRate' : 'ok';
  const reach = target => { const n = Math.ceil((CUM[target] - earned) / rate); return { days: n, date: addDays(today, n) }; };
  const rows = [];
  if (status === 'ok') for (let T = L + 1; T <= MAX; T++) rows.push({ level: T, need: CUM[T] - earned, milestone: MILESTONES.includes(T), ...reach(T) });
  const milestones = MILESTONES.map(level => ({ level, done: level <= L, ...(level > L && status === 'ok' ? reach(level) : {}) }));
  return { L, p, D, next, earned, rate, status, nextLevel: status === 'ok' ? reach(L + 1) : null, rows, milestones };
}

export default { XP, MAX, MILESTONES, forecast };
