# Island compression experiments

Isolated experiments for the `islands` branch. No editor code or research files are changed.

The canonical model has a board byte and two independent anchor layers. Each record is `[position, catalogueId, orientation, variant]`. Position is `row * 60 + column`; orientation is 0–3; variant and catalogue ID are unsigned 16-bit values. Each layer has at most one anchor at each cell. Catalogue v1 is frozen in `catalogue-v1.json`; existing indices must never be reassigned. Unknown numeric IDs survive encoding. Their rendering requires a compatible catalogue.

Source adapters retain every explicit piece, surface and direction. A missing variant is zero. Layout names, source IDs, editor settings, seeds and role-binding scaffolding are not visual placement state. No placed source path is treated as fixed game terrain. Footprint legality and progression are outside the codec.

`core.mjs`, `structural.mjs` and `browser.mjs` are plain ES modules without dependencies. `node-codec.mjs` supplies Node compression adapters for comparative experiments. Further results, reproducibility instructions and wire rules follow in the completed report.
