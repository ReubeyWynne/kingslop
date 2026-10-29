# Vikings planner

The Vikings page now opens a local march calculator. Alliance plans use the same allocation engine, with graphical city rows, manual march assignments, HQ shares and a separate published version for players.

## Local and shared data

Local drafts use `bh:vikings-local:v1`. Creating or editing one does not call the API. Enable shared sign-ups creates a shared event, copies the local roster and assignments, and retains the local draft as a backup. The management link is saved before copying the roster, so a failed transfer leaves recoverable access. Partial transfers require reviewing the shared roster; they are not retried automatically.

The calculator and registration form can read confirmed troop counts from the shared player ledger. They do not write troop counts back or upload the ledger. Unknown troop types remain blank until entered. Player registration sends only nickname, availability, troop totals, capacity, queue count, optional per-queue capacities and notes.

Access links use `#access=<plan UUID>.<code>`. The early page script consumes this before the shared deep-link code starts. Requests carry the credential in the Authorization header. Current access stays in sessionStorage; remembering a link explicitly saves it separately from the player ledger. JSON plan exports do not contain credentials. The management view can replace invitation/view links and delete the shared event.

## Assignments and publication

`js/vikings-engine.js` is the pure allocation and validation engine used by the browser and Worker. City splits fill available capacity with infantry, then cavalry, then archers when overflow requires prioritisation. With enough room, they send all troop types. Each type is distributed proportionally across the remaining queue capacities, with deterministic integer rounding.

Each player has up to six draft march rows. Every row names a queue, destination registration and three troop amounts. The Worker checks player membership, queue uniqueness, capacity, troop availability and self-reinforcement. Draft gaps are warnings that a leader must explicitly review before publishing. The engine does not infer combat safety or points from troop counts.

HQ configuration names the effective cap, ratio and up to 15 participants with one reserved queue each. Integer contributions sum to the exact cap. In the HQ phase, each participant replaces their reserved city queue with the HQ share; the engine checks that troops still assigned to the other city queues plus HQ do not exceed the player's roster. The interface shows the recall/return instructions for waves 10 and 20. Online-wave rotations remain an alliance instruction rather than an automated schedule in this version.

Migration `0002_assignments.sql` adds per-queue capacities, roster revisions, draft assignments and a planning board. The migration is additive and backfills existing plans. The Worker also lazily creates a missing board for a plan created by the previous Worker during deployment.

The board endpoint reads the plan, roster, draft and HQ configuration in one atomic D1 batch. Saving a draft checks the assignment, roster and plan revisions. Publishing validates the whole plan, then uses a conditional SQL update to check those revisions again before replacing the published snapshot. A registration change between validation and the update prevents publication. Registration insert/update/delete triggers advance the roster revision.

Viewing, invitation and player-edit credentials receive only the published assignments. Management credentials receive the draft and current roster. A published snapshot stays unchanged while the leader edits. Deleting a registration revokes its edit link and removes its own draft rows; the leader must repair any destinations/HQ references before publishing again.

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
