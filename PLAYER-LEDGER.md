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

Hero collection facts serve the hero directory. `heroes.roster` holds the heroes you own, keyed by catalogue ID, each with `level` (1–200), `stars` (the catalogue's star index, 6 × stars + tier, 0–30), `widget` (0–10) and `skills` (one Expedition level 1–5 per skill, or null until every level is known), with its own entry in `heroes.provenance`. Unread fields are null; a hero missing from the roster is not owned. Per-hero shards are ordinary inventory entries keyed `hero-shards-{hero}`, so they can be counted before the hero is unlocked. Per-hero widgets are `hero-widgets-{hero}` (`PlayerLedger.heroWidgetId`) and choose-a-hero widget chests are `hero-widget-chest-gen{n}` (`PlayerLedger.widgetChestId`). General shards (`mythic-hero-shard`, `epic-hero-shard`, `rare-hero-shard`) and widget parts (`hero-widget`) are the same inventory balances the event planner reads. Saves without a `heroes` key stay valid.

```js
store.heroes(); // { roster: { amadeus: { level, stars, widget, skills } }, provenance, shards: { amadeus: 34 } }
store.setHero('amadeus', { level: 80, stars: 27, widget: 6, skills: [5, 4, 5] }); // null forgets the hero
store.setBalance(PlayerLedger.heroShardId('amadeus'), 34);
```

Master facts serve the Masters page and the Town Centre's Masters shelf. `masters.roster` holds the masters you have unlocked, keyed by ID (`_data/masters.json`), each with `affinity` (0–100 or null), `ready` (true only at affinity 9, 19 … 99, when the affinity bar is full and the next class waits on emblems; any other level clears it) and `skills` (four levels, each 0–20 or null until read), with its own entry in `masters.provenance`. Per-master emblems are inventory entries keyed `master-emblems-{master}` (`PlayerLedger.masterEmblemId`); General Master Emblems are `general-master-emblem` and manuscripts `masters-manuscript`. Saves without a `masters` key stay valid.

```js
store.setMaster('valora', { affinity: 29, ready: true, skills: [3, 2, 0, null] });
store.masters(); // { roster: { valora: { affinity, ready, skills } }, provenance, emblems: { valora: 10 } }
```

Pet facts serve the Pets page. `pets.roster` holds the pets you have tamed, keyed by ID (`_data/pets.json`), each with `level` (1–100 or null until read) and `advanced` (true only at levels 10, 20 … 100, once the Advance that breaks that level cap is done; any other level clears it), with its own entry in `pets.provenance`. How hungry and fond each pet is lives apart from the ledger (`PetCare`, key `ks.pet-care.v1`), because it is play rather than a game fact. Saves without a `pets` key stay valid.

```js
store.setPet('gray-wolf', { level: 20, advanced: true });
store.pets(); // { roster: { 'gray-wolf': { level, advanced } }, provenance }
```

Building levels serve the Town Centre. `buildings.levels` maps a building ID (`town-center`, `embassy`, `barracks`, `range`, `stable`, `command-center`, `infirmary`, `war-academy`, `academy`, as in `_data/buildings.json`) to the game's own level ID: `0` (not built), `1`…`30`, `30-1`…`30-4`, `TG 1`, `TG1-1`…`TG1-4`, … `TG 10` (`PlayerLedger.buildingLevel` checks one). Each level has its own entry in `buildings.provenance`. A building missing from the map has not been counted yet. Truegold, Tempered Truegold and the four resources stay ordinary inventory balances. Upgrade priorities live in `preferences.buildings`: `tiers` maps a building to 1 (Lead), 2 (Keep up), 3 (Spare) or 0 (Skip), and `order` is the tie-break order. Missing entries take the defaults in `BuildingSpend.DEFAULT_TIERS`. Saves without a `buildings` key stay valid.

```js
store.buildings(); // { levels: { 'town-center': 'TG 3' }, provenance }
store.setBuilding('town-center', 'TG3-1'); // null forgets the level
store.setBuildings({ embassy: 'TG 3', barracks: 'TG 3' }); // several at once, one revision
store.setBuildingPriorities({ tiers: { infirmary: 0, 'command-center': 2 }, order: ['range', 'barracks', 'stable'] });
```

Training facts serve the Town Centre's troop days. `training.facts` holds `speed` (the Bonus Overview Training Speed without temporary buffs, a percentage), `capacity` (troops one camp trains per batch, at least 1) and a tier from 1 to 11 for each camp, keyed by troop type (`inf`, `cav`, `arc`), each with its own entry in `training.provenance`. A missing fact has not been counted yet. `preferences.training` holds the plans: `buff: true` to use the 3,000-gem capacity buff, `position` (`advisor` for Noble Advisor or `minister` for Chief Minister), `highKing: true` when your kingdom holds the High King, and `mobilize: true` when your king uses Mobilize on event days. Each is absent when off. Saves without a `training` key stay valid.

```js
store.training(); // { facts: { speed: 182.5, capacity: 1150, inf: 10 }, provenance, buff: false, position: null, highKing: false, mobilize: false }
store.setTraining('arc', 11); // null forgets the fact
store.setTrainingBuff(true);
store.setTrainingPlan('position', 'advisor'); // null or false turns a plan off
```

`preferences.priority` holds the Upgrade priority page's choices. `role` is `lead`, `joiner` or `farm`, absent until a player picks one (the page then assumes a joiner). `goals` is the player's ordered list of upgrade goals, at most 20, one per target: `{ kind, target, level }` where `kind` is `building` (target a building id, level a level id such as `TG 5`), `hero` (a hero key and star index 1–30), `hero-gear` (a piece id and enhancement level 1–200), `governor-gear` (`inf-1` … `arc-2`, level 1–58), `governor-charm` (`inf-1-1` … `arc-2-3`, level 1–22), `pet` (a pet id and level 1–100) or `master` (a master id and affinity 1–100). Each part is absent when unset, and the section is absent when both are. See [UPGRADE-PRIORITY.md](UPGRADE-PRIORITY.md#goals).

```js
store.priority(); // { role: 'lead', goals: [{ kind: 'building', target: 'town-center', level: 'TG 5' }] } or { role: null, goals: [] }
store.setPriorityRole('farm'); // null forgets it; anything else is rejected
store.setPriorityGoals([{ kind: 'pet', target: 'gray-wolf', level: 50 }]); // the whole list; [] forgets it
```

`preferences.heroGear` holds only optimisation/UI choices. Resource bags and piece lists are derived from the ledger, not duplicated in preferences. A write touches changed facts and explicitly edited fields, preserving unrelated inventory and provenance. `source` distinguishes manual, legacy, screenshot, plan, reset and file edits.

## Kingdom context

`preferences.kingdom` stores manually selected kingdom unlocks independently of owned account facts. `kingdom()` / `setKingdom(profile, expectedRevision)` read and write it. See [KINGDOM-PROGRESSION.md](KINGDOM-PROGRESSION.md) for its nullable fields, legacy generation migration, shared availability resolver and first consumers.

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

`exportJSON()` exports the whole player ledger with its inventory history beside it, as a top-level `history` (`{ schemaVersion: 1, entries }`, see [Inventory history](#inventory-history)). The existing export button downloads `kingshot-player.json`. `importJSON(data, engine, expectedRevision)` validates a unified save before replacing it; it also accepts the old hero-gear format and updates only hero equipment, its resources and preferences. A file's `history` is validated whole and replaces the local history (folded and capped like a live one), and the import itself is not recorded as a change; another history schema version or a malformed entry rejects the file and changes nothing. A file exported before the history was included has no `history`: it imports as before, the local history is kept and the import is recorded like any other write. The history never lands inside the stored save. `backup()` returns the same object `exportJSON()` serialises; save-file import and screenshot import keep it for undo, so undo restores the history too. File import supports undo. Hero gear reset affects that tool's equipment, resources and preferences while retaining other inventory and import history.

Screenshot review remains explicit. SHA-256 hashes of the original uploaded files identify confirmed imports. Records contain source type, timestamp, confirmation state and equipment before/after deltas, including review corrections. Duplicate confirmed files cannot be applied again; unread fields retain previous values. Undo restores the prior ledger, including history, allowing the file to be reviewed again. Records have `sourceType` `hero-gear` (equipment `itemDelta`) `backpack` (inventory `inventoryDelta`, `{ id: { before, after } }`) or `pets` (levels `petDelta`, same shape; a level marks the pet tamed and keeps its Advance only when the level is unchanged). `applyImport(record, expectedRevision)` writes a reviewed record's inventory, pet levels and equipment with `screenshot` provenance and its `importId`, and refuses a content hash already in the history. Every record comes from the shared import panel; its adapters are described in [SCREENSHOT-IMPORT.md](SCREENSHOT-IMPORT.md). Battle reports are the exception: they fill the simulator's sheet and leave no record.

## Inventory history

Every committed write also appends confirmed inventory changes to a separate key, `bh:player-history:v1` (`{ schemaVersion: 1, entries }`). An entry is `{ at, id, before, after, source }`: the save's `updatedAt`, the inventory id, the confirmed amount before (`null` when it was unknown) and after, and the write's provenance source. Becoming unknown is not recorded, and nothing outside `inventory` is. Entries from the last 28 days are kept whole; older ones fold to the first and last change per id per UTC day, and the log keeps at most 8,000 entries. The history is written after the save and inside its own `try`, so a full or failing storage never blocks a save, and an unreadable history starts again empty. `history(id)` returns the entries, oldest first, optionally for one id.

It travels with the save file (see [Migration and recovery](#migration-and-recovery)). The Upgrade priority page's savings section reads it for daily income rates and projections to the next KvK prep or Strongest Governor (see [UPGRADE-PRIORITY.md](UPGRADE-PRIORITY.md#savings)).

## Validation

Run `node .dsh/player-ledger-check.cjs` and `node .dsh/hero-gear-check.cjs`. Site CI also builds Jekyll and runs the existing visual and interaction checks, updated to read the shared store. Interaction coverage includes same-page notifications, cross-tab balances, export, rejected future-schema files, import, undo and reload.
