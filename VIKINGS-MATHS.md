# Vikings Vengeance: scoring and deployment

Updated 2026-10-05. This is a community scoring model and an alliance execution
policy, not an official combat simulator. Do not import Bear Hunt's damage
optimisation into Vikings or call equal marches a proven Vikings optimum.

## Evidence

- [Ralyvora](https://ralyvora.com/games/kingshot/knowledge/article/viking-vengeance-ultimate-guide-2),
  updated 2026-09-29, distinguishes town and reinforcement scores and reports an
  approximately 50% reinforcement budget for ordinary town waves. Rounding is unknown.
- [Kingshot Guides](https://kingshotguides.com/guide/viking-vengeance-expert-guide-beginner-to-advanced/)
  distinguishes the 50% kill threshold for successful defense from the 100% kill
  target for maximum points.
- [Kingshot Guide's calculator](https://www.kingshotguide.org/calculator/viking-vengeance-calculator)
  assumes equal kills, identical towns and a 50% reinforcement value. It does not
  validate combat attribution or equal troop splits. Its surrounding prose contains
  inconsistent team-efficiency claims; derive comparisons from the model.

No official scoring specification or controlled alliance report dataset was
available. The user's deployment and HQ plan are the alliance's practical baseline.
Recheck coefficients and allocations in game.

## Town scoring model

For one town hit at a fixed difficulty and wave:

| Symbol | Meaning |
| --- | --- |
| B | Maximum town-defense points |
| V | Attacking Viking count |
| K | Total Vikings killed, including owner kills |
| k_j | Kills credited to reinforcer j |
| q = K / V | Total clear fraction |
| o | Fraction of attacking Vikings killed by owner troops |
| R | Full reinforcement budget; approximately B/2 in the community model |

Town score ≈ B × K / V.

Reinforcer j score ≈ R × k_j / V.

Combined score ≈ B × q + R × (q − o).

A reinforcement-only full clear yields B + R ≈ 1.5B. Owner-only full clears yield
B. Survival does not establish the full reward: a 50% clear is a successful
defense under the cited guide, but is not a full clear. Confirm partial-clear
behavior and rounding against reports before treating approximations as exact
predictions. HQ has its own wave budget; do not add a town-owner reward to HQ.

## Fewer reinforcers and more queues

For n equal-kill reinforcers at a fully cleared, empty town, each receives R/n.
Changing n changes the split, not the total R. More troops can change an individual
kill share or raise a partial clear to a full clear; there is no universal troop
count beyond which reinforcement is useless.

In a symmetric network of M towns, each player sending q equal-kill marches gets
q × (R/q) = R reinforcement points per ordinary wave. Six queues are not six
times the points of one queue. Every queue remains useful for deploying troops,
covering towns and raising clear rates. Use as few reinforcers as reliably needed
per town while keeping the network covered. Concentrating a fixed pool at fewer
players is individual score funneling, not extra alliance output.

If N senders each use q queues across M defended towns, average incoming marches
are Nq/M. This counts distinct players only if each sender uses different towns.
When N=M and q=5–6, the mean is 5–6, not a per-town lower bound. Offline senders
whose towns are not defended can make N>M. If every offline town is also covered,
that increase need not occur. HQ transfers temporarily reduce city queues.

## Practical baseline

- Deploy all troop types, including archers, across all available march queues.
  Divide each available troop type evenly across city marches, keeping the same
  composition in each. Equal ratio across marches does not require equal numbers
  of the three troop types. Do not leave troops behind to force 1:1:1.
- The carrying limit is the sum of actual march/deployment capacities, or capacity
  × queues when equal. Rally/HQ garrison capacity is a different limit. If all
  troops cannot fit, prioritize infantry and cavalry; surplus archers may remain
  and may score owner kills on later waves.
  For equal caps, 5 × 160k = 800k and 6 × 150k = 900k illustrate why
  overflow can begin around 800–900k troops. These are capacity examples, not
  a universal troop threshold. Very large armies without an archer-heavy troop
  mix may also need to leave cavalry after archers.
- Towns with unavoidable owner kills are lower priority for reinforcement scoring:
  those kills cannot earn allies reinforcement points. Prefer empty or less
  contested towns, while preserving enough coverage for full clears and continued
  wave eligibility. Lower scoring priority does not mean leaving a town uncovered.
- The HQ whitelist reserves one queue per player and an exact share of the largest
  player's effective HQ garrison cap, using 75/25/0. Share = cap ÷ assigned players
  (15 only for a full whitelist). Officers reconcile whole-troop and ratio rounding
  and check march limits. Keep that queue earning city kills until the preceding
  city hit resolves, then transfer to HQ and return after HQ resolves.
- Offline players can send troops out before logging off. Online players cover
  their empty towns for all-member waves and rotate to online towns for 7/14/17,
  then return. Avoid uncovered empty towns; travel time matters.
- At harder relative difficulties, preserve clear percentage, survival and future
  eligibility. More support or a different allocation can beat the baseline.

## Report checks needed

Record wave, difficulty, Viking count, all kills, owner kills, each reinforcer's
kills and points, town points, troop counts/types/tiers, garrison stats and active
skills. Compare points-per-kill within one report; check town score against total
clear percentage. Compare equal and unequal splits on matched waves with the same
troops, towns, stats and skills. Town count alone cannot predict points; observed
kill shares cannot be replaced with troop-count shares.

All non-English edits in this change are AI translations requiring native review
under AGENTS.md.
