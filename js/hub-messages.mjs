/* The alliance hub's messages: text an R4 keeps to paste into game chat, with gaps the hub fills
   in. Pure, so the hub page and .dsh/hub-check.cjs share it.

   A gap is a word in braces:
     {today}   today's date, "Sun 15 Nov"
     {task}    the task the message is about
     {holder}  who holds that task ("Nobody yet" when no one does)
     {date}    the task's next date, "Fri 20 Nov"
     {when}    how far off it is: today, tomorrow, in 3 days
   A message with no task fills {task}, {holder}, {date} and {when} with nothing, and says so. */
import { splitParts, displayCells, LIMIT } from './event-cycle.mjs';

const LINE = 28;
const GAPS = ['today', 'task', 'holder', 'date', 'when'];
const label = ms => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
const DAY = 86400000;
const midnight = ms => Math.floor(ms / DAY) * DAY;
const away = (ms, now) => { const n = Math.round((midnight(ms) - midnight(now)) / DAY); return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : 'in ' + n + ' days'; };

// The gaps a body names, once each, in the order they first appear.
function gaps(body) { return [...new Set([...String(body).matchAll(/\{(\w+)\}/g)].map(m => m[1]))]; }

/* `context`: { now, task: { name, holders: [{ name, label }] } | null, next: 'YYYY-MM-DD' | null }.
   A gap with nothing to put there is left as it was, so the R4 sees what is missing. */
function fill(body, context) {
  const now = context.now, task = context.task, next = context.next ? Date.parse(context.next + 'T00:00:00Z') : NaN;
  const values = {
    today: label(now),
    task: task ? task.name : null,
    holder: task ? (task.holders.length ? task.holders.map(h => h.label ? h.name + ' (' + h.label + ')' : h.name).join(', ') : 'Nobody yet') : null,
    date: Number.isFinite(next) ? label(next) : null,
    when: Number.isFinite(next) ? away(next, now) : null
  };
  return String(body).replace(/\{(\w+)\}/g, (all, key) => values[key] == null ? all : values[key]);
}

// What the R4 should know before copying: gaps left open, lines too wide for chat, the part count.
function check(text) {
  const open = gaps(text), wide = text.split('\n').filter(l => displayCells(l) > LINE).length, parts = splitParts(text);
  return { open, wide, parts, chars: text.length, fits: parts.length === 1 };
}

export default { GAPS, LINE, LIMIT, fill, gaps, check, label };
export { GAPS, LINE, fill, gaps, check, label };
