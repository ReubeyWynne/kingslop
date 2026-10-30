# Island research

Start with [HANDOFF.md](HANDOFF.md). The public-site investigation and asset capture are complete for this pass, captured on 30 October 2026. Current-game mechanics that were not established remain explicitly open.

The `islands` branch was created first from main. Research lives in this directory. The parallel [island editor engineering proposal](../../ISLAND-EDITOR-ENGINEERING.md) remains separate and owns the implementation plan.

## Contents

| File | Purpose |
| --- | --- |
| [HANDOFF.md](HANDOFF.md) | What is ready, what could change implementation, and where to start |
| [STATUS.md](STATUS.md) | Completed checkpoints and validation |
| [MECHANICS.md](MECHANICS.md) | Observed rules, coordinates, source calculations and confidence |
| [UX-AUDIT.md](UX-AUDIT.md) | Workflow inventory and UX findings |
| [ASSETS.md](ASSETS.md) | Artwork, connected tiles, provenance and retrieval commands |
| [KINGSLOP-INTEGRATION.md](KINGSLOP-INTEGRATION.md) | Existing site conventions and integration points |
| [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) | Ordered evidence and clarification queue |
| [data/](data/) | Catalogue, derived indexes, maps, terrain, chest coordinates, road rules, fixtures and manifests |
| [assets/](assets/) | 186 piece images and five lossless tile atlases |
| [evidence/](evidence/) | Desktop captures and a labelled contact sheet |
| [scripts/](scripts/) | Original-source retrieval and data/artifact validation |

## Evidence policy

Source: https://ks-companion.com/island, release `67e43244b12e412f621eb42a`. Record source claims separately from independent game verification. Public assets are reference material until their reuse basis is established. This pack contains factual datasets and assets with provenance, not a copy of the source application implementation.

The source layouts' 255 cells are empty role bindings, not a legal-placement mask. The 55 chest locations are community claims explicitly marked unverified by the source. Neither should silently become authoritative game rules.

## Collaboration

Preserve unrelated work on `islands` and do not rewrite its history. Research commits only update this directory. Planning can reference the handoff and continue independently. No website code is implemented by this research pass.
