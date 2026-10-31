# Vikings planner

The Vikings page has a personal march calculator and alliance rooms. A room belongs to one alliance and lasts from one Vikings to the next: it keeps its weekday and start time, its players and their troops, and the leader's marches.

## Rooms and sign-ups

A room stores `eventDay` (`tue` or `thu`) and `eventTime` (UTC `HH:MM`). Its current event, `eventAt`, is worked out on every read by `VikingsEngine.nextEvent`: the next matching event day of the fortnight, held until three hours after the start. After that the room has rolled on to the next event by itself.

Each registration remembers which event its player last answered (`signed_for`) and whether they are in (`attending`). Answers for an earlier event read as `null`, not answered, so sign-ups reset after every Vikings while the troops stay. A player opening their link sees last time's numbers, changes anything that moved and taps **I'm in**, or **Not this time**. Once in, **Withdraw sign-up** asks before marking them out. A registration update that leaves `attending` out keeps the current answer.

Marches are live. Every role reads the leader's current assignments and HQ plan from `/board`; there is no publishing step. Saving marches or HQ checks only the board revision, because sign-ups keep arriving while a leader assigns, and the engine validates against the roster as it is now. The publish endpoint remains for older clients.

Rooms stay while they are used. Creation sets expiry 60 days ahead and any access pushes it 60 days ahead again (at most one write a day). An unused room is deleted by the daily cleanup.

Troops are entered and shown in thousands. The engine works in whole thousands whenever a player's counts and capacities are all multiples of 1,000, so splits and HQ shares never ask for 53,334 troops.

The calculator and sign-up form read troop counts from the shared player ledger and write edits back to it, unless the page is opened with `?guest`. The ledger itself is never uploaded. Registration sends only nickname, availability, troop totals, march size, march count and the answer for this event.

Access links are short enough for game chat: `https://dey.ci/vv/#join-<code>` (also `lead`, `view` and `me`). `/vv/` forwards to the planner with the fragment intact. Codes are 16 random bytes (22 base64url characters); the prefix only tells people which link is which, and the server decides the role from the code through `GET /v1/access`. Older `#access=<plan UUID>.<code>` links and 43-character codes still work. The early page script consumes either form before the shared deep-link code starts. Requests carry the credential in the Authorization header. JSON plan exports do not contain credentials. The management view can replace invitation/view links and delete the shared event.

## Keys and the device

Each alliance has three keys, each including the ones below it: **manage** (leader, for R4s), **sign-up** (for alliance chat) and **view** (who goes where). Keys name no player, so a leader link can be shared between R4s. Signing up returns a private player code, which the device keeps beside the key; it is never shown as a link.

A device holds one alliance (`bh:vikings-alliance:v1`: plan, key, role, name and the player's id and code). Opening a link for the same alliance only ever upgrades the key. A link for another alliance asks before replacing it. **Leave** forgets the alliance on this device. Older saved link lists (`bh:vikings-links:v1`) are migrated to the strongest key on first visit.

Everyone who can sign up gets the same **My troops** tab. Viewers get the Alliance tab only. The Worker redacts troop counts, capacities and notes of other players for every key but manage: viewers and members see who sends to whom and who covers them, and counts only for their own marches. Duplicate names are kept, and the leader sees when each sign-up was made and last saved.

## Guide

The guide is its own page, `/vikings-vengeance/guide/`, the other side of the Vikings card: it shares the Vikings deck cover (no extra card), and each page has a link to flip to the other. Its wave map marks the online-only waves. Old planner links to a guide section (`#online`, `#hq` and the rest) are sent on to the guide page.

## Event days

Vikings opens every fourteen days on Tuesday and Thursday, server time (UTC); R4/R5 choose the hour. It runs in the Strongest Governor and KvK prep weeks of the 28-day wheel. `VikingsEngine.eventDays` counts from the Strongest Governor Tuesday of the wheel's first cycle, 25 August 2026 (`SCHEDULE.anchor` in `js/vikings-engine.js`). The page shows the next window; a new room picks Tuesday or Thursday and a start time in UTC, remembering the last time used on the device.

## Assignments

`js/vikings-engine.js` is the pure allocation and validation engine used by the browser and Worker. City splits fill available capacity with infantry, then cavalry, then archers when overflow requires prioritisation. With enough room, they send all troop types. Each type is distributed proportionally across the remaining queue capacities, with deterministic integer rounding.

Each player has up to six draft march rows. Every row names a queue, destination registration and three troop amounts. The Worker checks player membership, queue uniqueness, capacity, troop availability and self-reinforcement. The engine does not infer combat safety or points from troop counts.

A player sends at most one march to each city: the engine (and so the Worker) rejects two of a player's marches with the same destination, and the editor greys out a player another march already goes to. Players say whether they expect to be online (`availability`); the roster, the march editor and its destination list show it. Offline players still send their marches before logging off and are still covered; only waves 7, 14 and 17 skip offline cities. Players can also give their garrison capacity (`garrisonCapacity`, migration `0004_garrison.sql`, optional; an update that leaves it out keeps it), and the HQ editor lists players largest garrison first so the leader can pick the HQ captain.

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
