/* The alliance hub's cadences: when a task falls due. Pure, in UTC dates ("YYYY-MM-DD"), shared by
   the hub page and the Worker (api/src/hub.js), checked by .dsh/hub-check.cjs.

   A cadence is one of
     { type: 'weekly', weekday }        every Sunday (0) to Saturday (6)
     { type: 'every', weeks, from }     every N weeks, on the weekday of the date it starts from
     { type: 'wheel', days }            on these days (1–28) of the 28-day Event Cycle wheel
     { type: 'vikings', day }           on Vikings days, Tuesdays ('tue') or Thursdays ('thu')
     { type: 'date', date }             once
   The wheel is the one in js/event-rules.mjs: cycle day 1 is Monday 2026-08-17. Vikings opens on
   cycle days 9 and 23 (Tuesday) and 11 and 25 (Thursday), as js/vikings-engine.mjs counts them. */
const DAY = 86400000, CYCLE = 28, EPOCH = Date.UTC(2026, 7, 17), WINDOW = 28;
const VIKINGS = { tue: [9, 23], thu: [11, 25] }, VIKINGS_NAME = { tue: 'Tuesdays', thu: 'Thursdays' };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const KEYS = { weekly: ['type', 'weekday'], every: ['type', 'weeks', 'from'], wheel: ['type', 'days'], vikings: ['type', 'day'], date: ['type', 'date'] };

const iso = ms => new Date(ms).toISOString().slice(0, 10);
// A real calendar date as UTC midnight, or NaN.
function parse(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(text)) return NaN;
  const ms = Date.parse(text + 'T00:00:00Z');
  return Number.isFinite(ms) && iso(ms) === text ? ms : NaN;
}
function wheelDay(ms) { const since = Math.floor((ms - EPOCH) / DAY); return ((since % CYCLE) + CYCLE) % CYCLE + 1; }
const whole = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;

// null when the cadence is well formed, otherwise what is wrong with it.
function validate(c) {
  if (c === null) return null;
  if (!c || typeof c !== 'object' || Array.isArray(c) || !KEYS[c.type]) return 'Choose when it falls due.';
  if (Object.keys(c).some(k => !KEYS[c.type].includes(k))) return 'That cadence has fields it should not.';
  if (c.type === 'weekly' && !whole(c.weekday, 0, 6)) return 'Pick a day of the week.';
  if (c.type === 'every' && (!whole(c.weeks, 1, 12) || Number.isNaN(parse(c.from)))) return 'Pick how many weeks (1 to 12) and the date it starts.';
  if (c.type === 'wheel' && !(Array.isArray(c.days) && c.days.length >= 1 && c.days.length <= CYCLE && c.days.every(d => whole(d, 1, CYCLE)) && new Set(c.days).size === c.days.length)) return 'Pick days from 1 to 28.';
  if (c.type === 'vikings' && !VIKINGS[c.day]) return 'Pick Tuesday or Thursday.';
  if (c.type === 'date' && Number.isNaN(parse(c.date))) return 'Pick a date.';
  return null;
}

// Whether a task with this cadence is due on the UTC day starting at `ms`.
function due(c, ms) {
  if (!c) return false;
  if (c.type === 'weekly') return new Date(ms).getUTCDay() === c.weekday;
  if (c.type === 'every') { const from = parse(c.from), gap = (ms - from) / DAY; return gap >= 0 && gap % (7 * c.weeks) === 0; }
  if (c.type === 'wheel') return c.days.includes(wheelDay(ms));
  if (c.type === 'vikings') return VIKINGS[c.day].includes(wheelDay(ms));
  return ms === parse(c.date);
}

// The days it falls due in the `days` UTC days from today (default four weeks), oldest first.
function upcoming(c, now, days = WINDOW) {
  const start = Math.floor(now / DAY) * DAY, out = [];
  for (let i = 0; i < days; i++) if (due(c, start + i * DAY)) out.push(iso(start + i * DAY));
  return out;
}

function describe(c) {
  if (!c) return 'No set day';
  if (c.type === 'weekly') return 'Every ' + WEEKDAYS[c.weekday];
  if (c.type === 'every') return 'Every ' + (c.weeks === 1 ? 'week' : c.weeks + ' weeks') + ' on ' + WEEKDAYS[new Date(parse(c.from)).getUTCDay()] + 's from ' + c.from;
  if (c.type === 'wheel') return 'Event Cycle day' + (c.days.length === 1 ? ' ' : 's ') + c.days.join(', ');
  if (c.type === 'vikings') return 'Vikings, ' + VIKINGS_NAME[c.day];
  return 'On ' + c.date;
}

const api = { CYCLE, EPOCH, WINDOW, WEEKDAYS, iso, parse, wheelDay, validate, due, upcoming, describe };
export default api;
export { CYCLE, EPOCH, WINDOW, WEEKDAYS, iso, parse, wheelDay, validate, due, upcoming, describe };
