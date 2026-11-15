const test = require('node:test'), assert = require('node:assert/strict'), H = require('../js/hub-engine.mjs');
const day = s => Date.parse(s + 'T00:00:00Z');
test('weekly, every-N-weeks and one-off cadences fall on the right UTC days', () => {
  assert.deepEqual(H.upcoming({ type: 'weekly', weekday: 5 }, day('2026-11-15') + 3e7), ['2026-11-20', '2026-11-27', '2026-12-04', '2026-12-11']);
  assert.deepEqual(H.upcoming({ type: 'weekly', weekday: 1 }, day('2026-11-16')).slice(0, 2), ['2026-11-16', '2026-11-23'], 'today counts while it lasts');
  assert.deepEqual(H.upcoming({ type: 'every', weeks: 2, from: '2026-11-02' }, day('2026-11-15')), ['2026-11-16', '2026-11-30']);
  assert.deepEqual(H.upcoming({ type: 'every', weeks: 2, from: '2026-12-07' }, day('2026-11-15')), ['2026-12-07']);
  assert.deepEqual(H.upcoming({ type: 'date', date: '2026-12-05' }, day('2026-11-15')), ['2026-12-05']);
  assert.deepEqual(H.upcoming({ type: 'date', date: '2026-11-14' }, day('2026-11-15')), []);
  assert.deepEqual(H.upcoming(null, day('2026-11-15')), []);
});
test('the wheel matches the Event Cycle: day 1 is Monday 2026-08-17, Swordland Sundays are 7 and 21, Tri-Alliance Saturday is 20', () => {
  const R = require('../js/event-rules.mjs');
  assert.equal(H.EPOCH, R.EPOCH); assert.equal(H.CYCLE, R.CYCLE);
  assert.equal(H.wheelDay(day('2026-08-17')), 1); assert.equal(H.wheelDay(day('2026-09-13')), 28); assert.equal(H.wheelDay(day('2026-09-14')), 1); assert.equal(H.wheelDay(day('2026-08-16')), 28);
  for (const [days, weekday] of [[[7, 21], 0], [[20], 6]]) {
    const hits = H.upcoming({ type: 'wheel', days }, day('2026-08-17'), 56);
    assert.equal(hits.length, days.length * 2); assert(hits.every(d => new Date(day(d)).getUTCDay() === weekday));
  }
});
test('Vikings days agree with the Vikings engine for a year', () => {
  const V = require('../js/vikings-engine.mjs');
  for (const [name, weekday] of [['tue', 2], ['thu', 4]]) {
    const mine = []; for (let t = day('2026-08-17'); t < day('2027-08-17'); t += 864e5) if (H.due({ type: 'vikings', day: name }, t)) mine.push(H.iso(t));
    const theirs = []; for (let n = 0, t = day('2026-08-17'); n < 60; n++) { const [a, b] = V.eventDays(t, 1); if (a >= day('2027-08-17')) break; if (new Date(a).getUTCDay() === weekday) theirs.push(H.iso(a)); t = a + 864e5; }
    assert.deepEqual(mine, [...new Set(theirs)]);
  }
});
test('cadences validate strictly', () => {
  for (const ok of [null, { type: 'weekly', weekday: 0 }, { type: 'every', weeks: 12, from: '2026-02-28' }, { type: 'wheel', days: [7, 21] }, { type: 'vikings', day: 'thu' }, { type: 'date', date: '2028-02-29' }]) assert.equal(H.validate(ok), null, JSON.stringify(ok));
  for (const bad of [undefined, 'weekly', [], {}, { type: 'daily' }, { type: 'weekly', weekday: 7 }, { type: 'weekly', weekday: 1.5 }, { type: 'weekly', weekday: 1, extra: 1 }, { type: 'every', weeks: 0, from: '2026-11-01' }, { type: 'every', weeks: 13, from: '2026-11-01' }, { type: 'every', weeks: 2, from: '2026-02-30' }, { type: 'every', weeks: 2, from: 'soon' }, { type: 'wheel', days: [] }, { type: 'wheel', days: [29] }, { type: 'wheel', days: [3, 3] }, { type: 'wheel', days: '7' }, { type: 'vikings', day: 'wed' }, { type: 'date', date: '2026-13-01' }]) assert.notEqual(H.validate(bad), null, JSON.stringify(bad));
});
test('cadences describe themselves', () => {
  assert.equal(H.describe(null), 'No set day'); assert.equal(H.describe({ type: 'weekly', weekday: 5 }), 'Every Friday');
  assert.equal(H.describe({ type: 'every', weeks: 2, from: '2026-11-02' }), 'Every 2 weeks on Mondays from 2026-11-02');
  assert.equal(H.describe({ type: 'wheel', days: [7, 21] }), 'Event Cycle days 7, 21'); assert.equal(H.describe({ type: 'wheel', days: [20] }), 'Event Cycle day 20');
  assert.equal(H.describe({ type: 'vikings', day: 'thu' }), 'Vikings, Thursdays'); assert.equal(H.describe({ type: 'date', date: '2026-12-05' }), 'On 2026-12-05');
});
