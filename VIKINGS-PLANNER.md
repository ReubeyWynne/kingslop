# Vikings planner

The Vikings page has a personal march calculator and alliance rooms. A room belongs to one alliance and lasts from one Vikings to the next: it keeps its weekday and start time, its players and their troops, and the leader's marches.

## Rooms and sign-ups

A room stores `eventDay` (`tue` or `thu`) and `eventTime` (UTC `HH:MM`). Its current event, `eventAt`, is worked out on every read by `VikingsEngine.nextEvent`: the next matching event day of the fortnight, held until three hours after the start. After that the room has rolled on to the next event by itself.

Each registration remembers which event its player last answered (`signed_for`) and whether they are in (`attending`). Answers for an earlier event read as `null`, not answered, so sign-ups reset after every Vikings while the troops stay. A player opening their link sees last time's numbers, changes anything that moved and taps **I'm in**, or **Not this time**. A registration update that leaves `attending` out keeps the current answer.

Marches are live. Every role reads the leader's current assignments and HQ plan from `/board`; there is no publishing step. Saving marches or HQ checks only the board revision, because sign-ups keep arriving while a leader assigns, and the engine validates against the roster as it is now. The publish endpoint remains for older clients.

Rooms stay while they are used. Creation sets expiry 60 days ahead and any access pushes it 60 days ahead again (at most one write a day). An unused room is deleted by the daily cleanup.

Troops are entered and shown in thousands. The engine works in whole thousands whenever a player's counts and capacities are all multiples of 1,000, so splits and HQ shares never ask for 53,334 troops.

The calculator and sign-up form can read confirmed troop counts from the shared player ledger. They do not write troop counts back or upload the ledger. Registration sends only nickname, availability, troop totals, march size, march count and the answer for this event.

Access links are short enough for game chat: `https://dey.ci/vv/#join-<code>` (also `lead`, `view` and `me`). `/vv/` forwards to the planner with the fragment intact. Codes are 16 random bytes (22 base64url characters); the prefix only tells people which link is which, and the server decides the role from the code through `GET /v1/access`. Older `#access=<plan UUID>.<code>` links and 43-character codes still work. The early page script consumes either form before the shared deep-link code starts. Requests carry the credential in the Authorization header. JSON plan exports do not contain credentials. The management view can replace invitation/view links and delete the shared event.

## Returning to a room

Creating a room or joining one saves that leader or player link on the device (`bh:vikings-links:v1`, outside the player ledger), and the next visit reopens the room the device last led or joined (`bh:vikings-last:v1`). Opening a sign-up or viewing link never saves it; a viewer's next visit starts at the room list. A sign-up or viewing link for a room this device already leads or joined opens that role instead. **Switch** keeps the list and waits for a choice on the next visit. The leader signs up on the leader link: the sign-up's id is kept with it as `self`, and a sign-up made earlier on the same device with the sign-up link is taken over. A player can tell the device to forget the room; a saved room that has been deleted is removed with a message.

## Event days

Vikings opens every fourteen days on Tuesday and Thursday, server time (UTC); R4/R5 choose the hour. It runs in the Strongest Governor and KvK prep weeks of the 28-day wheel. `VikingsEngine.eventDays` counts from the Strongest Governor Tuesday of the wheel's first cycle, 25 August 2026 (`SCHEDULE.anchor` in `js/vikings-engine.js`). The page shows the next window; a new room picks Tuesday or Thursday and a start time in UTC, remembering the last time used on the device.

## Assignments

`js/vikings-engine.js` is the pure allocation and validation engine used by the browser and Worker. City splits fill available capacity with infantry, then cavalry, then archers when overflow requires prioritisation. With enough room, they send all troop types. Each type is distributed proportionally across the remaining queue capacities, with deterministic integer rounding.

Each player has up to six draft march rows. Every row names a queue, destination registration and three troop amounts. The Worker checks player membership, queue uniqueness, capacity, troop availability and self-reinforcement. The engine does not infer combat safety or points from troop counts.

The leader's march editor lists one line per march: who it goes to, its troop mix and its size. A march with no destination carries no troops and stays home, so the out and home totals count only sent marches. Choosing a destination fills that march from a split of the player's troops across their sent marches, after any march the leader has set by hand; tapping a march opens its destination and troop inputs, and typing into a march keeps it as set. **Even split** puts every sent march back on the split. Each destination in the list shows the cover that ally already has from others, and the totals with **Save** stay pinned to the bottom of the dialog.

HQ configuration names the effective cap, ratio and up to 15 participants with one reserved queue each. Integer contributions sum to the exact cap. In the HQ phase, each participant replaces their reserved city queue with the HQ share; the engine checks that troops still assigned to the other city queues plus HQ do not exceed the player's roster. The interface shows the recall/return instructions for waves 10 and 20. Online-wave rotations remain an alliance instruction rather than an automated schedule in this version.

Migration `0002_assignments.sql` adds per-queue capacities, roster revisions, draft assignments and a planning board. The migration is additive and backfills existing plans. The Worker also lazily creates a missing board for a plan created by the previous Worker during deployment.

The board endpoint reads the plan, roster, marches and HQ configuration in one atomic D1 batch. Registration insert/update/delete triggers advance the roster revision. Deleting a registration revokes its edit link and removes its own marches; the leader repairs any destinations or HQ references that pointed at it.

Migration `0003_rooms.sql` adds the room's weekday and time and each registration's answer. It is additive; a plan without a day and time keeps its fixed `eventAt`.

## API additions

| Method | Path suffix under `/v1/plans/:id` | Permission |
| --- | --- | --- |
| GET | `/status` | Any valid credential; lightweight revision signature for polling |
| GET | `/board` | Any valid plan credential; drafts only for management |
| PUT | `/assignments/:registrationId` | Management |
| PUT | `/hq` | Management |
| POST | `/publish` | Management |
| POST | `/rotate` | Management; `role` is `join` or `view` |

Assignment, HQ and publication bodies require `revision`, `rosterRevision` and `planRevision`. Assignment bodies add `marches`; HQ bodies add `hq`. Existing 8 KiB request limits remain. Saving one player's draft keeps large rosters out of individual write requests. Plan size remains capped at 120 registrations.

The page checks a small revision signature every 30 seconds while visible, and fetches the roster and board only after a change. Open editors pause polling. Failed refreshes back off to 90 seconds and preserve the last loaded plan.

## UI and verification

The new planner and compact rewritten guide are English in this first release. The surrounding site chrome retains the current language and layout direction. Dedicated UI checks cover English and RTL layouts at 320, 390, 768 and 1280 pixels, image loading, manual assignment editing, publication and no-JavaScript guide access. The general site onboarding prompt is skipped on this task-focused page.

Run `node --test .dsh/vikings-check.cjs api/test/*.test.mjs` for conservation, rounding, role boundaries, publication snapshots, stale roster writes, HQ phases and link revocation. API CI also checks all D1 migrations and the Worker bundle. After a Jekyll build, run `node .dsh/vikings-ui-check.cjs`.

Not included: automated assignment suggestions, CSV import, event archives, score forecasts, configured online-wave rotations or next-event copying. The deployed Worker test page remains available for compatibility; the polished planner is on dey.ci.
