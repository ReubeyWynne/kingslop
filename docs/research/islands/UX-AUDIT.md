# UX findings for the planning agent

This is a research handoff, not a settled Kingslop design. Desktop interactions were inspected live at approximately 1363 × 936. Phone layout and touch gestures were not independently tested.

The parallel [engineering proposal](../../ISLAND-EDITOR-ENGINEERING.md) now prioritises the spatial editor. Treat the task alternatives below as research context, not a request to reopen that decision or expand the first implementation into an upgrade planner.

## The first useful distinction

The source answers several different questions in one workspace: how an island looks, where a piece fits, which decorative template to start from, and where community-mapped chests lie. It does not answer which island purchase or upgrade gives a player the most value. Decide which player task Kingslop should answer before choosing the default view.

## Observed interaction inventory

| Surface | Observed behaviour | Implication |
| --- | --- | --- |
| Entry view | Opens a richly decorated example island called My island | A new player can mistake an example for their own saved state |
| Canvas | Isometric and flat grid views; pan, zoom, fit, select, move, rotate and erase | A spatial editor is viable, but requires explicit modes and accurate touch handling |
| Piece shelf | Small image buttons, names, dimensions for larger pieces and used/limit counts | Game art gives recognition; details and limits need a readable selected state |
| Properties | Selected Fountain shows footprint, direction, anchor and placed count, plus duplicate Move/Rotate/Delete controls | Mostly editor internals. No upgrade cost or buff outcome appears here |
| Roles tab | No content appeared in the inspected templates; all 13 dataset role lists are empty | Do not copy an unexplained empty top-level tab |
| Limits tab | Lists counts as progress bars, including unlimited buildings and decorative tiles | A large list of unlimited counters has little value without a capacity or effect question |
| Templates | Menu exposes Forest Rings, Fountain Courtyard, Garden Court, two numbered Kingshot layouts and Maze Quarters | Numerical names give no reason to choose a layout. The menu exposes fewer entries than the dataset |
| Template selection | Choosing Kingshot Layout 8901 replaced the workspace without an observed confirmation | Make replacement, save state and undo easy to understand |
| Generator | Feature toggles for lake/garden/chessboard/yard/grove; density slider; symmetry; seed | It generates decoration, not a verified progression recommendation |
| Chest routes | A separate map with one/two Reservoirs, coordinate inputs, numbered route steps and opened flags | Its geometric output looks more prescriptive than its evidence supports |
| Sharing | Signed-out users are offered an island code; publishing a public link requires sign-in | Editing and transferable data can work without account creation |
| Import | A dedicated import-code action exists; tutorial describes replacing the current workspace after confirmation | Keep import validation and replacement explicit |
| Animation | Play/pause and speed controls for animated game artwork and a chest shine | These are source features. Kingslop animation rules still apply |
| Persistence | Cookie message distinguishes device-saved work from optional appearance preferences | Good separation, but the actual save state needs a persistent visible explanation |

## Problems worth solving

| Priority | Finding | A better outcome to design for |
| --- | --- | --- |
| High | The user reaches a large map before choosing their task | Let a player quickly reach planning, collection or decoration work with clear task names |
| High | An example island is called My island before the user supplies anything | Label example, owned state and proposed plan distinctly |
| High | Unlimited placement appears beside effect-limited buildings | Explain which placements contribute effects and flag redundant copies when relevant |
| High | Suggested chest routes omit the constraints that determine effort | Use a reference-map label until legal placement and clearing effort are verified |
| High | Marking a chest opened does not remove it from suggested routes and is lost on reload | Keep confirmed progress separately and use it when producing the next useful action |
| Medium | Large parts of the toolbar are icon-only | Give frequent actions visible names; put uncommon controls in a labelled secondary menu |
| Medium | Selected actions appear in both the canvas bar and Properties | Put editing controls near the selected object or in one stable inspector |
| Medium | Empty Roles and large Limits lists add navigation without a clear answer | Surface counts and rules only where they change the player's decision |
| Medium | Status mixes local positions, game positions, direction and dimensions | Show game coordinates when useful; keep technical anchor values in an advanced inspector |
| Medium | Numbered templates and generator parameters lack expected outcomes | Offer a preview and explain what each preset is for |
| Medium | Much of the factual information is drawn inside a Flutter canvas | Keep forms, tables, help and catalogue content in semantic HTML with keyboard access |

## Useful features to retain

Game-art thumbnails, search and category filters, a quick fit action, undo, a flat grid for precision, separate imported copies, and a small list of comprehensible templates are all useful. They do not require copying the source's entire workspace.

For Kingslop, task-specific output should lead. If the chosen task is an upgrade comparison, show the current effect, proposed effect and cost before a map. If it is chest collection, show verified remaining targets and the reason for the next choice. If it is decoration, a canvas can be the main surface. These are alternatives for planning, not an instruction to build three large tools.

## Validation to carry into implementation

- On a narrow phone, a player can recognise a piece, choose it, place it, correct it and undo without losing the island behind permanent panels.
- Scrolling the page and panning the island do not compete accidentally.
- Keyboard users can select pieces and edit positions without dragging.
- Imported/shared plans cannot silently replace the player's confirmed state.
- Reload preserves the state the UI says is saved. Unknown ownership stays unknown rather than becoming zero.
- No-JavaScript and reduced-motion views still explain the feature and show meaningful reference content.
- The first useful result arrives without loading every full-size sprite, animation or road variant.

See `evidence/` for captured views and the catalogue contact sheet. Findings based on absent or delayed content are limited to the inspected release; they are not claims about every device.
