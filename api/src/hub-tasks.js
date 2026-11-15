// The tasks a new hub starts with, as [name, shown to members, cadence]. They are the alliance's own
// afterwards: the owner renames, adds, removes or hides any of them, and changes when they fall due.
// Alliance Championship opens each Monday at reset. A signup sheet locks at the end of the Thursday before
// its event, so Swordland (Sundays, days 7 and 21 of the Event Cycle wheel) falls due on days 4 and 18, and
// Tri-Alliance (the Saturday of Alliance Mobilization, day 20) on day 18. Sanctuary rewards are every
// Friday, and Vikings on Thursdays until the owner says Tuesdays.
export const STARTER_TASKS = [
  ['Alliance Championship Signups', true, { type: 'weekly', weekday: 1 }],
  ['Swordland Signups', true, { type: 'wheel', days: [4, 18] }],
  ['Tri-Alliance Signups', true, { type: 'wheel', days: [18] }],
  ['Vikings HQ Management', true, { type: 'vikings', day: 'thu' }],
  ['Vikings Strategy', true],
  ['Alliance Notices', true],
  ['Bear Management', true],
  ['Alliance Building Management', true],
  ['AFK Maintenance', false],
  ['NAP Diplomacy', false],
  ['NAP Enforcer', false],
  ['Cross-Server Diplomacy', false],
  ['Rules Enforcer', false],
  ['Co-ordinator', false],
  ['Sanctuary Negotiation', false],
  ['Sanctuary Reward Distribution', false, { type: 'weekly', weekday: 5 }]
];
