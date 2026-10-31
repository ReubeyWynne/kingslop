# Artwork and resource inventory

The assets in this directory are research material from KS Companion's public release, captured 30 October 2026. Original source URLs and hashes are recorded. Availability does not establish a licence to redistribute game art; record the reuse decision before moving a selected subset into production.

## Ready to inspect

| Resource | Location | Contents |
| --- | --- | --- |
| Piece catalogue | `data/garden_catalogue.json` | 104 source records, including 10 retired records |
| Derived piece index | `data/piece-index.json` | IDs, local art paths and labels with their evidence; unresolved names remain marked |
| CSV index | `data/pieces.csv` | Names where supplied, IDs, dimensions, limits, prosperity and original art references |
| Compact icons | `assets/icons/` | 92 transparent WebP files, bounded to 128px |
| Piece sprites | `assets/tiles/` | 94 transparent WebP files, bounded to 512px |
| Contact sheet | `evidence/piece-contact-sheet.jpg` | 91 non-retired catalogue entries with available icons; names are shortened only on this preview |
| Connected tile atlases | `assets/atlases/`, `data/tile-atlases.json` | 271 source autotile images and four additional tile/chest images, packed without scaling or pixel changes |
| Road placement metadata | `data/garden_road_rules.json` | 260 named sprite records with pivots, frame sizes, raster offsets and family rules |
| Neighbour convention | `data/road-neighbours.json` | Exact source renderer grid-offset/bit mapping |
| Animation references | `data/asset-manifest.json` | 65 public animation URLs; animations are not copied or loaded by this research |
| Raw source provenance | `data/sources.json` | Deployment ID, source sizes, hashes and supplementary research outcomes |

The standalone icons and sprites use lossy WebP quality 90 for practical review and prototyping. Their manifests retain the original PNG URLs, SHA-256 values and dimensions. Some source PNGs already have a small native resolution, so a 512px bound does not imply every sprite is 512px.

The derived piece index and CSV preserve source spelling, including questionable spellings. Generated fallback labels are marked unresolved. In particular, builds 7108 and 7112 lack a recovered English name, and build 7084 shares a model/name key with 7080 but has no source icon URL. Do not silently merge those IDs or invent names for them.

The tile atlases use lossless WebP with transparent padding. Each frame has its source asset path, original PNG hash, RGBA pixel hash and atlas rectangle. Read the original road sprite pivot/frame metadata when positioning a frame. Atlas packing coordinates describe storage, not world placement.

## Retrieving original files

The helper downloads to a separate destination and checks hashes where known. It does not overwrite the research snapshots. It uses the inherited network settings and curl's normal TLS verification.

```sh
python3 docs/research/islands/scripts/fetch_sources.py /tmp/island-sources --group data
python3 docs/research/islands/scripts/fetch_sources.py /tmp/island-sources --group art
python3 docs/research/islands/scripts/fetch_sources.py /tmp/island-sources --group tiles
```

`--group animations` is available for offline research if needed. Those files may be large and have no recorded content hash because this investigation only collected their public references. The repository's animation restrictions still apply.

The source layout download contains all 13 layouts, including eight Companion-authored showcases. This research commits only an index of those eight and the five game-labelled records. Do not silently convert another tool's showcase designs into Kingslop templates.

## Integrity check

```sh
python3 docs/research/islands/scripts/validate_research.py
```

The standard-library checks validate JSON/CSV counts, IDs, geometry, map bounds, chest and route fixtures, file hashes and rule coverage. When Pillow is available, the same command also decodes the images and checks every packed frame's pixel hash.
