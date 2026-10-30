# Mechanics and confidence

Captured 30 October 2026 from KS Companion release `67e43244b12e412f621eb42a`. These are observations about the tool and its datasets. They are not independent validation of the current game client.

## What the source actually provides

| Subject | Evidence | Confidence and use |
| --- | --- | --- |
| Island extent | Catalogue layouts and terrain specify 60 × 60 | Strong agreement within this source; use for a prototype |
| Piece geometry | Every catalogue record has width, height, mask cells and block cells | All 104 masks are rectangular and all extra block-cell lists are empty in this release |
| Rotation | Selected Fountain exposes Move, Rotate, Delete and a direction value | A source editor capability; do not infer that every piece can rotate |
| Piece limits | `build_limit` and `effect_limit` are separate fields | The UI renders `build_limit: 0` as unlimited. Do not treat an unlimited building as unlimited buffs |
| Prosperity | `prosper` exists on catalogue records | Base values only. There are no level costs, level-dependent prosperity or complete buff tables here |
| Piece availability | 10 records are marked retired; two visible pieces are marked locked in game | Do not show all 104 entries as currently buyable |
| Terrain | 3,479 tree records, model IDs, tiers and raw offsets | Source claims decoded game map provenance; drawing scale and offset are explicitly approximate |
| Clearing areas | `area_groups` is empty | No clearing boundary/cost model can be recovered from this file |
| Templates | 13 dataset entries, of which five are labelled Kingshot 8900–8904 | Their names are source claims. This does not independently establish official provenance |
| Chest locations | 55 distinct coordinate pairs | Source UI explicitly calls them community-mapped and unverified |
| Chest progress | UI toggle and counter | Session-only. The route still includes opened chests |
| Chest route | Coordinate sorting and nearest-target calculation in the public bundle, checked against visible results | A deterministic geometric heuristic. It is not a clearing-time optimiser |

## Coordinates

Keep these coordinate systems separate in any implementation or import adapter.

| Context | Range and conversion |
| --- | --- |
| Community chest coordinates | X and Y each run from 1 to 60 |
| Internal grid | Subtract one from each coordinate; index = `row * 60 + column` |
| Chest-reference Reservoir anchor | X and Y each run from 1 to 59 because its footprint is 2 × 2 |
| Source game-map world origin | Terrain and template settings use 45 |
| Live layout status example | Selecting the centre Fountain showed Local 31,31 and Kingshot 75,75; Properties showed anchor 28,28 |

The status position and the piece anchor describe different things. Do not import the tapped cell as a building anchor. Do not add 45 to a one-based displayed position: the observed local/world display offset is 44. Store zero-based row/column plus an explicitly named conversion at the boundary.

## Chest-route calculation

The public bundle first sorts all chest targets by X, then Y. It keeps one current endpoint per Reservoir. At each round it processes Reservoir 1, then Reservoir 2 if present. Each Reservoir takes the remaining target with the smallest Manhattan distance from its current endpoint, removes that target from the common pool, and adopts it as its new endpoint. Ties keep the first target in the sorted remaining list.

`distance = abs(target.x - endpoint.x) + abs(target.y - endpoint.y)`

With one Reservoir the UI has 55 rounds. With two it has 28 rounds; the final round has one target. This alternation is not a global assignment of the nearest available Reservoir to each chest. Changing Reservoir order can therefore change who receives a target.

Visible checks from the default one-Reservoir position (1,1):

| Round | Branch from | Target | Grid distance |
| --- | --- | --- | --- |
| 1 | (1,1) | (6,9) | 13 |
| 2 | (6,9) | (4,12) | 5 |

`data/route-fixtures.json` records independently reconstructed numerical results for these inputs and a two-Reservoir example. `scripts/validate_research.py` checks the fixture invariants. The first two one-Reservoir rows were checked in the browser; the full route and two-Reservoir fixture are calculations from the recovered rule, not a manual verification of every UI step.

The source excludes obstacles, clearing time and rewards. A target point is not an exact legal Reservoir placement. It also keeps all 55 chests in the route after the user marks some opened. Any Kingslop feature that answers which chest to pursue next needs a different objective and more data.

## Placement facts versus renderer choices

Treat `build_id`, dimensions, limits, prosperity, mask and passability as source claims about game data. Treat `sprite_scale`, `sprite_height`, `swatch`, offsets and the chosen default layouts as presentation settings. The catalogue alone does not establish the semantics of `needs_gap`, `tile_links`, `enable_direct`, `quality`, `build_class` or `build_type`; retain them without inventing user-facing explanations.

The road file contains 10 tile families and ordered matching rules with required/empty neighbour masks. Families cover roads, water, hedges, fences and decorative connections. Most have 16 rules; water has 47 and family 12 has 17. Preserve rule order. A rule matches when `(mask & required) == required` and `(mask & empty) == 0`. The source uses the first matching rule, with the family's default sprite as fallback. Some rules offer more than one visual variant.

`data/road-neighbours.json` recovers the source renderer's bit order. These are grid offsets, not screen directions on the isometric board:

| Bit | Delta row | Delta column |
| --- | --- | --- |
| 1 | +1 | -1 |
| 2 | +1 | 0 |
| 4 | +1 | +1 |
| 8 | 0 | -1 |
| 16 | 0 | +1 |
| 32 | -1 | -1 |
| 64 | -1 | 0 |
| 128 | -1 | +1 |

Visual connection also depends on compatible tile families, group membership and building connection points. The source treats `meadow` and build ID 7088 as family 12. Therefore matching equal neighbouring slugs alone will not reproduce its joins. Compare rendered examples before adopting these source conventions as game truth.

## Findings for the editor engineering proposal

The separate [engineering proposal](../../ISLAND-EDITOR-ENGINEERING.md) prioritises a cactus-free island editor. The recovered data does not establish a cactus-free playable mask. Every one of the five game-labelled layouts has `cells_rle: rle:3600x255`. In the source this is a role-binding grid: 255 means no role binding. It is not evidence that every cell is unlocked, cleared or legally buildable. All five have empty role lists. `kingshot_playable_terrain.json` contains tree render records and no area groups, despite its filename.

No cactus name or cactus-specific rule was found in the inspected catalogue or public bundle. That absence is not a rule defining a board variant. Until a game capture or primary configuration establishes the restriction, keep the board variant and legal-placement mask as explicit unresolved inputs.

Additional source editor behaviours, useful for comparison rather than copying:

- The source stores facilities and underlying surfaces separately. A road beneath a building is not necessarily a collision.
- It tests occupied cells and board bounds. Some placement paths let a building cover non-building decorations, while other paths reject any occupied object. A Kingslop implementation should choose and document its own consistent replacement rule.
- The source transposes mask X/Y for odd direction values. All masks here are rectangular, so the dataset cannot prove the correct rotation of an asymmetric footprint.
- The importer reads but does not retain `effect_limit`, `needs_gap`, `quality`, `build_class`, `build_type` or `prosper` in its live piece model. Their presence in JSON does not mean the tool validates those game rules.
- Imported layout state serialises `templateSlug`, `name`, `bindings`, `pieces`, `surfaces`, `directions`, `edits`, `seed`, `settings`, `forkedFrom` and `templateSnapshot`. Keys for cell maps are decimal grid indices. This is an observed data model, not a verified share-code specification.

The source also contradicts its own catalogue limits in three game-labelled presets. Layout 8900 contains 767 Whispering Path cells, layout 8901 contains 1,255 Garden Path cells, and layout 8902 contains 908 Garden Path cells. The catalogue limit for each type is 500. See `data/source-limit-conflicts.json`. This could represent preset exceptions or inconsistent source data; the evidence does not choose between them. Imported designs need an explicit excess-limit state rather than silent deletion.

## Data that is still missing

- Fountain levels, unlock conditions, construction costs, upgrade durations and collection/storage limits.
- Complete building buff tables, stacking rules, effect limits at different levels and ownership prerequisites.
- Acquisition sources, currencies, event/paid availability and kingdom-age restrictions.
- Reservoir clearing geometry, clearing speed, legal placements, tree-tier costs and simultaneous operation rules.
- Chest rewards, tier differences, exact positions, completeness and variations across game versions or players.
- Whether clearing a route creates a reusable corridor, and how that affects a useful optimisation objective.

Do not estimate days, income, ROI or the best upgrade from the current spatial catalogue. Those would require additional evidence.
