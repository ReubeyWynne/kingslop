# Vikings planning API

This Worker stores Vikings event plans and player registrations in D1. It accepts no player inventory, gear, screenshots, or general account saves. The small page at the Worker address exercises the API before integration with the main site.

## Deploy from GitHub

In Cloudflare, open Workers & Pages, create an application, and import `ReubeyWynne/kingslop` from GitHub. Choose the branch containing this API.

Set these build settings:

| Setting | Value |
| --- | --- |
| Worker name | `kingslop` |
| Root directory | `api` |
| Build command | `npm test` |
| Deploy command | `npm run deploy` |

For non-production branches, set **Non-production deploy command** to `npm run preview`. Keep **Root directory** as `api` and **Build command** as `npm test` for those builds too. The preview command resolves or creates `kingslop-vikings-preview`, applies migrations to that database, and runs Wrangler with complete preview bindings. Production and previews use separate databases and rate-limit namespaces. The same staging database is shared by branch previews.

The committed `previews` block declares the preview resources. The deployment script supplies the database ID in a temporary configuration. Bare `npx wrangler preview` skips that setup and the migrations.

The deploy script finds or creates the D1 database named `kingslop-vikings`, applies pending migrations, then deploys. It stops if any step fails. Its deployment token needs Workers Scripts Edit and D1 Edit for the selected account. Cloudflare's build settings allow choosing a token with these permissions. The all-zero database ID in the committed configuration is only a local-development placeholder. The deployment script replaces it in a temporary configuration with the real database ID. No runtime secret or player account provider is required.

Open the deployed `workers.dev` URL. The page checks `/health`, lets you create a plan, and displays the three access codes. Save the management code. Open the same plan with its invitation code in another tab to test registration. Save the private edit code returned after registering. The viewing code cannot change anything.

For local deployment after signing in through Wrangler:

```sh
cd api
npm ci
npx wrangler login
npm run deploy
```

To develop locally, run `npm run dev`. To run the API checks, run `npm test` with Node 24. The tests execute the production migration and SQL queries against Node's SQLite database. CI also checks migration application and Worker bundling with Wrangler.

## Access codes

Send codes in `Authorization: Bearer <code>`. Codes contain 16 random bytes encoded as base64url (22 characters); codes issued before short links contain 32 bytes and keep working. Only SHA-256 hashes are stored in D1. Codes never belong in API query strings or request logs. The test page keeps its current code in sessionStorage, for that browser tab, and uses no analytics or third-party scripts.

| Code | Permissions |
| --- | --- |
| Management | Read and edit the plan, manage registrations, delete the plan |
| Invitation | Read the plan and create registrations while registration is open |
| Viewing | Read the plan and registrations |
| Player edit | Read the plan and edit or delete that player's registration while registration is open |

There are no user accounts or identity checks. Anyone holding a code has that code's permissions. Lost management codes cannot be recovered. Invitation rotation and recovery are outside this first version.

## API

All JSON bodies reject unknown properties and have an 8 KiB limit. API responses cannot be cached. Browser requests are allowed from the Worker itself and the origins in `ALLOWED_ORIGINS`, initially `https://dey.ci` and `https://www.dey.ci`. CORS is not authentication; every protected endpoint checks its access code.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/health` | Check the database schema is reachable |
| GET | `/v1/access` | Resolve the bearer code to its plan ID and role, so a link can carry the code alone |
| POST | `/v1/plans` | Create a plan and return management, invitation, and viewing codes once |
| GET | `/v1/plans/:id` | Read the plan, registrations, and current access role |
| PATCH | `/v1/plans/:id` | Change plan fields with a management code and expected revision |
| DELETE | `/v1/plans/:id` | Delete a plan and all its registrations and codes |
| POST | `/v1/plans/:id/registrations` | Register a player and return their edit code once |
| PUT | `/v1/plans/:id/registrations/:id` | Replace registration fields with an edit or management code and expected revision |
| DELETE | `/v1/plans/:id/registrations/:id` | Remove a registration and its edit code |

Plan fields: `name`, `eventDay` (`tue`, `thu` or null), `eventTime` (UTC `HH:MM` or null), `eventAt` (ISO timestamp with timezone or null; with a day and time set, responses report the room's current event instead), `difficulty` (integer or null), `notes`, and `closed`. Updates require `revision` from the latest response. Registration fields: `nickname`, `availability` (`online`, `offline`, or `unknown`), `infantry`, `cavalry`, `archers`, `marchCapacity`, `marches`, `notes` and `attending` (true, false or null: the answer for the room's current event). `capacities` optionally supplies one march capacity per queue. Troop counts default to zero, availability to unknown, marches to five, and notes to empty. A registration update requires `nickname` and `revision`; omitted optional fields return to their defaults.

Stale revisions return 409. A database trigger enforces the 120-player cap, including concurrent registrations. Cloudflare's native rate limit bindings allow 120 API requests and five plan creations per IP per minute per Cloudflare location. These limits are approximate and are not a global quota or a defence against distributed abuse.

Plans (alliance rooms) expire 60 days after they were last used: any access moves expiry 60 days ahead. Expired plans are inaccessible immediately. The daily scheduled handler deletes up to 100 expired plans and cascades deletion to registrations and credentials. Manual deletion also cascades. Cloudflare's backup retention still applies. The main-site planner adds city assignments and HQ planning. See [VIKINGS-PLANNER.md](../VIKINGS-PLANNER.md) for its data model and the additional endpoints. There is no event archive, billing, account synchronisation or automatic group assignment.

Use backwards-compatible migrations: the previous Worker may still be serving requests while a deployment runs. Cloudflare deployments and D1 migrations are separate operations; rolling back Worker code does not undo schema changes.
