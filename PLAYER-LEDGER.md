# Shared player ledger

The static site loads `js/player-ledger.js` before page scripts. `window.PlayerLedger.shared()` returns the shared store; the same module is available through CommonJS for domain checks. Player data remains in browser storage, with no network requests.

## Contract

`bh:player-ledger:v1` stores the `kingshot-player` format with `schemaVersion`, a monotonically increasing `revision`, `updatedAt`, inventory, hero gear, governor gear, governor charms, import history and preferences.

Inventory identifiers are stable, independent of translations. The hero-gear resource adapter uses:

| Engine resource | Inventory identifier | Unit |
| --- | --- | --- |
| `xp` | `hero-gear-xp` | XP, including any remainder |
| `hammers` | `forgehammer` | items |
| `mythic` | `spare-mythic-gear` | items |
| `mithril` | `mithril` | items |

An inventory entry contains `amount`, `status` and `provenance`. Confirmed amounts are nonnegative integers; unknown or unsupported values have a null amount and null provenance. A missing identifier is unknown. Use `balance(id)` or inspect confirmed entries in `snapshot().inventory`; never infer a confirmed zero from an absent entry.

Hero equipment facts live in `heroGear.pieces`, with provenance keyed by piece ID. Missing pieces are unknown; unread quality, enhancement or mastery fields remain null in confirmed screenshot records and equipment facts. The adapter supplies existing engine defaults for editing and calculation without writing those defaults as confirmed facts. `heroGear.parts` preserves the 10-XP/100-XP split and remainder when its total matches the confirmed XP balance. Governor equipment and charms have distinct sections. Each stays `unsupported` until a level is set, then becomes `tracked`: `governorGear.pieces` (`inf-1` … `arc-2`, level 0–58) and `governorCharms.slots` (`inf-1-1` … `arc-2-3`, level 0–22), each with provenance per item. Missing items are unknown. `governor(kind)`, `setGovernor(kind, levels, source)`, `setGovernorPreference(key, value)` and `resetGovernor()` read and write them; `preferences.governor` holds the planner's goal, troop focus and targets. Governor materials (`satin`, `gilded-threads`, `artisans-vision`, `charm-guide`, `charm-design`) are ordinary inventory balances.

Combat facts serve the battle simulator. `combat.stats` holds your Bonus Details percentages per troop type (`inf`, `cav`, `arc`), each row with all four of `attack`, `lethality`, `defense` and `health` and its own entry in `combat.provenance`. A missing type is unknown. Troops you own are ordinary inventory entries keyed `troop-{type}-t{tier}-tg{tg}` (tier 1–11, TG 0–5), so they share inventory's amount, status and provenance rules and its export/import. Saves written before the section existed have no `combat` key and stay valid; the next write adds it.

```js
store.combat(); // { stats, provenance, troops: [{ type, tier, tg, amount, provenance }] }, best tier first per type
store.setCombat({ stats: { inf: { attack: 250, lethality: 163, defense: 250, health: 163 } }, troops: [{ type: 'inf', tier: 10, tg: 0, amount: 120000 }] }, 'manual');
```

The simulator's `troop-roster` module edits the troop entries directly, one row per tier you own; clearing a row deletes its key rather than storing an unknown. Its `sim-player` module (`js/sim-player.js`) moves stats and troops between the save and the sheet. The simulator reads and writes these only in its fight modes (Mystic Trial, Battle), where the report's left column is you; a bear report's left column is the rally lead's. Loading fills your stats and, per type, the best tier you own; saving stores your stats and each march row as the troops you have at that tier. On a first visit, with no simulator sheet saved, it fills from the ledger automatically.

Hero collection facts serve the hero directory. `heroes.roster` holds the heroes you own, keyed by catalogue ID, each with `level` (1–200), `stars` (the catalogue's star index, 6 × stars + tier, 0–30), `widget` (0–10) and `skills` (one Expedition level 1–5 per skill, or null until every level is known), with its own entry in `heroes.provenance`. Unread fields are null; a hero missing from the roster is not owned. Per-hero shards are ordinary inventory entries keyed `hero-shards-{hero}`, so they can be counted before the hero is unlocked. General shards (`mythic-hero-shard`, `epic-hero-shard`, `rare-hero-shard`) and widget parts (`hero-widget`) are the same inventory balances the event planner reads. Saves without a `heroes` key stay valid.

```js
store.heroes(); // { roster: { amadeus: { level, stars, widget, skills } }, provenance, shards: { amadeus: 34 } }
store.setHero('amadeus', { level: 80, stars: 27, widget: 6, skills: [5, 4, 5] }); // null forgets the hero
store.setBalance(PlayerLedger.heroShardId('amadeus'), 34);
```

`preferences.heroGear` holds only optimisation/UI choices. Resource bags and piece lists are derived from the ledger, not duplicated in preferences. A write touches changed facts and explicitly edited fields, preserving unrelated inventory and provenance. `source` distinguishes manual, legacy, screenshot, plan, reset and file edits.

## Store API

```js
const store = window.PlayerLedger.shared();
const snapshot = store.snapshot();
const hammers = store.balance('forgehammer');
store.setBalance('forgehammer', 120);
store.setBalance('unreadable-item', null);
const unsubscribe = store.subscribe(next => render(next));
```

Writes notify subscribers and emit `player-ledger:change`. Browser storage events refresh other tabs, invalidate their pending plans and clear stale undo state. `player-ledger:error` reports an unreadable external storage update. Writes compare the expected revision to reject stale plans; localStorage does not provide an atomic compare-and-swap across simultaneously writing tabs.

`heroGear(engine)` projects equipment, resources and preferences into the existing engine format. `writeHeroGear(input, engine, options)` accepts `expectedRevision`, explicit `resource`/`piece` edits, provenance `source`, `all` for an intentional reset, and confirmed screenshot `records`.

## Migration and recovery

The first store read migrates a valid `bh:hero-gear:v1` save, even when a different tool accesses the store first. It retains gear, resource balances, XP parts and preferences. The original storage entry is kept unchanged, so migration is reversible and repeat reads do not import it again. Invalid legacy saves, corrupt unified saves, future schema versions and storage failures are surfaced without replacing the saved bytes with defaults.

`exportJSON()` exports the whole player ledger. The existing export button downloads `kingshot-player.json`. `importJSON(data, engine, expectedRevision)` validates a unified save before replacing it; it also accepts the old hero-gear format and updates only hero equipment, its resources and preferences. File import supports undo. Hero gear reset affects that tool's equipment, resources and preferences while retaining other inventory and import history.

Screenshot review remains explicit. SHA-256 hashes of the original uploaded files identify confirmed imports. Records contain source type, timestamp, confirmation state and equipment before/after deltas, including review corrections. Duplicate confirmed files cannot be applied again; unread fields retain previous values. Undo restores the prior ledger, including history, allowing the file to be reviewed again. This is the hero-gear adapter; backpack/governor adapters and the shared import shell remain milestone 6.

## Validation

Run `node .dsh/player-ledger-check.cjs` and `node .dsh/hero-gear-check.cjs`. Site CI also builds Jekyll and runs the existing visual and interaction checks, updated to read the shared store. Interaction coverage includes same-page notifications, cross-tab balances, export, rejected future-schema files, import, undo and reload.
