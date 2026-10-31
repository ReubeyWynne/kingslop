# Evidence and clarification queue

The parallel proposal establishes a fast mobile island editor as the first goal. These questions are ordered by what could change that implementation. They do not need to block browsing the catalogue or prototyping the renderer.

| Priority | Question | What would resolve it | Consequence |
| --- | --- | --- | --- |
| Before enforcing legality | What exactly makes the requested board cactus-free, and which cells are legally buildable? | A current game view showing the board boundary and blocked areas, or primary game configuration with a documented version | Determines board variant and placement mask; the recovered 255 grid cannot answer this |
| Before enforcing legality | Must trees be cleared before a building can occupy a cell, and should the first editor model cleared or uncleared land? | A current game placement example and the intended scope from the planning conversation | Prevents decoration state from being confused with progression |
| Before enforcing legality | Can buildings touch directly, and are there per-building blocked or access cells outside their visible footprint? | Game placement examples for Fountain, Floating Market, Reservoir and a 3 × 3 building | Decides whether rectangular masks alone are sufficient |
| Before enforcing limits | Do game presets have exceptions to normal tile limits? | A current game preset showing its path counts and subsequent editing rules | Three source presets exceed the source's 500-cell catalogue limits; do not silently trim imported layouts |
| Before implementing rotation | Which pieces rotate, and what changes besides footprint? | A game capture of a directional piece through its available rotations | Separates mirrored/rotated art, connection points and occupancy |
| Before implementing connected surfaces | Do roads pass under buildings, and which families connect through which buildings? | Short in-game road and water arrangements, including a junction and building entrance | Checks recovered bit rules, pivots, connection points and replacement behaviour |
| Before production art use | Which game art source and reuse terms will Kingslop rely on? | A recorded source/reuse decision consistent with the site's existing art practice | Determines which research images can move into production assets |
| Before a completeness claim | Which retired, locked and recent pieces are available to the target kingdoms? | Current game shop/category screenshots or a versioned primary catalogue | Prevents unavailable items being presented as obtainable |
| Optional compatibility work | Should Kingslop import KS Companion codes? | Product decision plus a successfully exported code and verified round trip | Avoids coupling the first version to an unverified codec |
| Separate gameplay feature | Are chest locations fixed and complete, and what do their rewards and clearing constraints mean? | Independently corroborated coordinates and current game mechanics | Needed before recommending next chests or an optimal route |
| Separate progression feature | What are the Fountain/building costs, buffs, collection rates and stacking rules? | Per-level primary tables or current game evidence | Needed for an upgrade optimiser, not for a purely spatial editor |

## Evidence already available

- Source 60 × 60 board dimensions and five game-labelled templates.
- 104 catalogue records with masks, limits, base prosperity and renderer settings.
- Road family rules, sprite frame/pivot metadata and recovered neighbour-bit order.
- 3,479 terrain drawing records, without a playable-area or clearing-cost model.
- 55 unverified community chest coordinates and a documented geometric route heuristic.
- The other agent's engineering proposal, including the chat-sharing budget and phone-first interaction goals.

## Research limits

Web search returned errors throughout this session. Direct checks of Kingshot Wiki post/page/event/building sitemaps, the Kingshot Data sitemap, and links on the Kingshot.net homepage did not reveal an island-specific source. This is a recorded coverage limit, not proof that no other guide exists.

No sign-in, public island publication, game-account access or real-player progress import was used. Desktop canvas interaction was inspected live; phone gestures, a code-sharing round trip and the current game rules remain unverified.
