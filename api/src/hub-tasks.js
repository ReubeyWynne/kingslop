// The tasks a new hub starts with, as [name, shown to members, cadence]. They are the alliance's own
// afterwards: the owner renames, adds, removes or hides any of them, and changes when they fall due.
// Alliance Championship opens each Monday at reset. A signup sheet locks at the end of the Thursday before
// its event, so Swordland (Sundays, days 7 and 21 of the Event Cycle wheel) falls due on days 4 and 18, and
// Tri-Alliance (the Saturday of Alliance Mobilization, day 20) on day 18. Sanctuary rewards are every
// Friday, and Vikings on Thursdays until the owner says Tuesdays.
export const STARTER_TASKS = [
  ['Run Alliance Championship signups', true, { type: 'weekly', weekday: 1 }],
  ['Run Swordland signups', true, { type: 'wheel', days: [4, 18] }],
  ['Run Tri-Alliance signups', true, { type: 'wheel', days: [18] }],
  ['Pick the Vikings HQ lineup', true, { type: 'vikings', day: 'thu' }],
  ['Set the Vikings strategy', true],
  ['Post alliance notices', true],
  ['Run the Bear traps', true],
  ['Manage alliance buildings', true],
  ['Clear out AFK members', false],
  ['Negotiate NAPs', false],
  ['Enforce NAPs', false],
  ['Handle cross-server diplomacy', false],
  ['Enforce the rules', false],
  ['Coordinate the leaders', false],
  ['Negotiate the Sanctuary', false],
  ['Hand out Sanctuary rewards', false, { type: 'weekly', weekday: 5 }]
];

// Roles bundle tasks, so an R4 can enlist for a whole kind of work at once. They sit on top of the tasks: a role has no holders
// of its own; whoever holds all of its tasks is covering it. Named by task, matched when a hub is made.
export const STARTER_ROLES = [
  ['Signups desk', ['Run Alliance Championship signups', 'Run Swordland signups', 'Run Tri-Alliance signups']],
  ['Vikings', ['Pick the Vikings HQ lineup', 'Set the Vikings strategy']],
  ['Bears and buildings', ['Run the Bear traps', 'Manage alliance buildings']],
  ['Diplomacy', ['Negotiate NAPs', 'Enforce NAPs', 'Handle cross-server diplomacy']],
  ['Sanctuary', ['Negotiate the Sanctuary', 'Hand out Sanctuary rewards']],
  ['Order', ['Enforce the rules', 'Clear out AFK members', 'Post alliance notices', 'Coordinate the leaders']]
];
