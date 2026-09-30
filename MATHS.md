# Bear damage maths — extracted from the Frakinator

Source: the **Frakinator** (Streamlit app by [685] Frak — "Bear ratio", "Bear damage", and
"Theory-crafting" tabs: <https://frakinator.streamlit.app/>).
These are the formulas the demystified site (and the old BearHunt app's `DamageCalc`) are pinned to.
Extracted from the app's KaTeX markup on 2026-08-20.
Corroborated 2026-09-10 against the Frakinator's acknowledged sources (the SoS
battle engine `unit_stats.json` + `Fight.java`, the SoS guide, and the KingShot
simulator's embedded troop table — see `KINGSHOT-SOURCES.md` §1): the base-stat
relations, the √ laws, and the A/D factor shapes below all check out against
engine data.

## Notation

| Symbol | Meaning |
|---|---|
| `N_t` | number of troops of type `t` (inf/cav/arc) in *your* march |
| `N_tot` | total squad size of your march (`N_inf + N_cav + N_arc`) |
| `f_t` | fraction of your march of type `t` (`f_inf + f_cav + f_arc = 1`) |
| `A_t` | **attack factor** of the rally *leader* for troop type `t` (theory-craft definition; damage is linear in the leader's attack *and* lethality) |
| `base_att` | base attack stat of the troops you send (tier-dependent) |

## 1. Per-troop-type damage

```
D = (1.2/1000) × √5000 × √N_troops × base_att × A
```

- **A** — attack factor of the rally leader for the troop type considered (theory-craft tab).
- **N_troops** — number of troops of one kind that you are sending.
- **base_att** — base attack of the troops you are sending.
- **(1.2/1000) × √5000** — numerical factor that represents an *effective bear defense and the army size of the bear troops*.

**Total bear damage = sum of the damage done independently by infantry, cavalry and archery.**

Per-troop properties:
- proportional **linearly** to the attack of the rally leader,
- proportional **linearly** to the lethality of the rally leader,
- proportional to **√(number of troops)** of a given type.

> *"Needless to say, this is the most basic formula. Multiplicative contributions from the skills of
> the lead and joining heroes have to be factored in as well."* — i.e. **hero skills multiply on top**.
> Current Bear-specific testing refines the scope: the lead's full hero kit is shared, and up to four
> locked joiner first-skills become **rally-wide skills used in every participant's individual Bear
> simulation**. Supplying a selected skill gives its owner no private bonus.

## 2. Simplified proportional form ("real" unit stats)

With the real unit stats folded in, total damage to the bear is *proportional* to:

```
(1/3)·A_inf·√f_inf  +  A_cav·√f_cav  +  (4/3)·A_arc·√f_arc × 1.1
```

- The **1.1** on the archery term: the bear troops are **full infantry**, and archers do **+10% damage
  to infantry troops**. "There can be an additional 1.1 factor to archer for T>6 and TG3+ troops."
- `f_inf + f_cav + f_arc = 1` (fractions of your march).

## 3. Full damage equation (valid for T6 troops)

```
D = L · [ (1/3)·A_inf·√f_inf  +  A_cav·√f_cav  +  (4.4/3)·A_arc·√f_arc ]
```

with:

```
L = (1.2 × √5000)/1000 × √N_tot × att_cav
```

Notes:
- `(4/3) × 1.1 = 4.4/3` — §2 and §3 are the same archer weight. ✓
- The `att_cav` factor inside `L` looks like a typo or an internal normalisation (the equivalent
  per-type formula in §1 uses `base_att` per type). It is **constant for a given march**, so it
  cancels out of every ratio/optimisation and never affects the split rules.

## 4. Optimal troop split (Lagrange multipliers)

We maximise `D` over the fractions, subject to `f_inf + f_cav + f_arc = 1`. The result:

```
f_inf = α² / (α² + β² + γ²)
f_cav = β² / (α² + β² + γ²)
f_arc = γ² / (α² + β² + γ²)
```

with:

```
α = L·A_inf / 3        β = L·A_cav        γ = (4.4·L·A_arc) / 3
```

`L` cancels out of the ratios, so the optimal mix is:

```
f_t ∝ (base_t·A_t)²   with weights (A_inf/3, A_cav, 4.4·A_arc/3), squared
```

The mix depends **only on the lead's attack factors** — not on your stats, not on march size.

## 5. Optimal damage at the optimal split

```
D* = L · √( (A_inf/3)² + A_cav² + (4.4·A_arc/3)² )
```

This is the "leader strength" `K = √((A_inf/3)² + A_cav² + (4.4·A_arc/3)²)` used to rank rally
leads, times the constant `L`.

## 6. Theory-crafting: the general battle model

From the Frakinator's "Theory-crafting" tab. Frak's own disclaimer: *"I do not claim that any of
the following is real nor accurate … I have done lots of tests, and I confidently believe that the
bulk of what I am writing here is a good representation of the game mechanics."*

### 6.1 Attack and defence factors

```
A = [1 + attack_bonus/100] × [1 + lethality_bonus/100]
D = [1 + defense_bonus/100] × [1 + health_bonus/100]
```

- The four bonuses are the player's stats from a battle report; each unit type has its own
  (`A^inf`, `D^arc`, …).
- Example: attack +250%, lethality +163% → `A = (1+2.5)(1+1.63) = 9.205` (the old app's `ExampleA`).
- In combat, `A` and `D` only ever appear as the **ratio** `A/D` (attacker / defender).

### 6.2 The simplified kill formula (one attacker type vs one defender type)

```
K(p2) ∝ √N(p1) × [ (base_att × base_let)_p1 / (base_def × base_hea)_p2 ] × [ A_p1 / D_p2 ]
```

- **√N**: kills ∝ √(troop count of the attacking type) — the source of every √ rule on the site.
  2× troops → ×√2 ≈ 1.4; 10× troops → ×√10 ≈ 3.1.
- **base_let and base_def are 10 for every troop and every tier, and they cancel out of the
  formula** — only **base_att** and **base_hea** survive, one pair per troop/tier. The values are
  taken from State of Survival fan data (the game appears to reuse those unit stats).
- The base-stat relations that produce the bear weights:

```
attack_inf = health_cav = (1/3)·health_inf = (1/3)·attack_cav
attack_inf = (4/3)·health_arc = (1/4)·attack_arc
```

  → base attack ratios **inf : cav : arc = 1 : 3 : 4**. Normalised to cavalry = 1, with the
  archer ×1.1 vs-infantry bonus (the bear is all infantry): **inf ⅓, cav 1, arc (4/3)×1.1 = 4.4/3**.
  That is exactly where the site's per-troop weights come from.

### 6.3 The army-min factor (√N₀)

The simplified formula is missing a factor `√N₀` that is common to both sides:

```
N₀ = min( attacker total troops, defender total troops )
```

- For Bear Hunt, the target is **5,000 special infantry**, so a normal attacking march is larger and
  `N₀ = 5000`. Each troop-type army factor is therefore `√(N_t × 5000)`. When the simplified
  formula is written in troop fractions, its `√N_tot` comes from substituting
  `N_t = f_t·N_tot`; it is not a separate rally-size multiplier.

### 6.4 Widgets (and similar buffs) are just multiplicative percentages

A widget's `w%` multiplies the attack factor: `1 + x/100 = (1 + 234.6/100) × (1 + 7.5/100)`
→ `x = 259.7%` effective. "Multiplicative and additive" is just how percentages compose.

### 6.5 Hero skills (as catalogued by Frakinator; tested = confident)

| Hero | Skills |
|---|---|
| Amane | AtkUp |
| Yeonwoo | LetUp |
| Chenko | LetUp (sk1), TknDown (sk2) |
| Saul | DefUp (sk1.1), HeaUp (sk1.2), LetUp (sk3) |
| Hilde | AtkUp (sk1.1), DefUp (sk1.2), SkDmg (sk2), TknDown (sk3) |
| Gordon | HeaUp (sk1), AtkUp (sk2) |
| Amadeus | LetUp (sk1), AtkUp (sk2), DmgUp (sk3) |

For bear, the lead wants heroes whose skills feed attack / lethality / damage (AtkUp, LetUp,
DmgUp); their effect multiplies into `A`, which everyone in the rally shares.

## Corrections this implies for the demystified site

1. **Archer weight origin**: it is `(4/3) × 1.1 = 4.4/3 ≈ 1.47`, not "4 × 1.1". The 1.1 is the
   archers' +10%-vs-infantry bonus, and it applies because **the bear is all infantry**.
2. **T7+ / TG3+ archers**: an *additional* ×1.1 → weight 4.84/3 ≈ 1.61. The old site's
   `DamageCalc` comment already flagged this ("flip to 4.84/3 when TG3+ archer bonus lands").
3. **Troop tier matters**: damage is ∝ `base_att` of the troops you send — send your highest tier.
   The site previously said nothing about tiers.
4. **Heroes multiply**: lead's hero skills (whole rally) and joining heroes' skills (their own
   march) are multiplicative on top of A. The site previously implied the leader's stats were the
   only personal factor.
5. **Absolute scale**: the reward brackets double from 47M to 38.4B
   (47M / 90M / 175M / 330M / 625M / 1.2B / 2.4B / 4.8B / 9.6B / 19.2B / 38.4B), one extra
   Forgehammer per bracket (8 at 47M → 18 at 38.4B), and sit on the full scale that includes the
   bear factor `(1.2/1000)·√5000`, `√N_tot`, `base_att`, and hero boosts. The √ / split /
   fair-share rules are scale-independent and hold regardless.
6. **Nothing changes the relative rules**: doubling a march is still +41%; Q marches are still
   √Q × one march; a full rally at fair share is still √j × a solo carry — because all of those
   are ratios and every constant cancels.
7. **The 10/10/80 heuristic**: the exact optimum (§4) is per-lead — it depends on that lead's
   attack factors. Since joiners sit in rallies from many different leads, the site teaches a
   fixed inf/cav/arc split of 10/10/80 once a player passes the ~350k ratio threshold (~65k fair
   share per rally slot × 5–6 march slots, +1 if leading) — "the per-lead perfect ratio is a
   fool's errand; 10/10/80 is close enough everywhere and doable." Below the threshold, equalised
   marches are best and the mix barely matters.
8. **The participant-cap line (~364k archers)**: an alliance cap on how many troops each march
   participant may send only touches players past **~364k archers** — 65k fair share per march ×
   80% archers × 7 marches (a rally lead with six queues fields all seven). Even there the nerf is
   slight (√), and because reward brackets double, a few percent almost never costs a bracket
   while rallies stay plentiful. Hence the monthly "God bear" after KvK: both hunt time slots'
   strongest players together, everyone within ~30s travel of the bear for a constant stream of
   rallies (super-low dwell times), cap off, everyone full-sends.

## Verified-consistent items

- Optimal split f_t ∝ (base_t·A_t)² matches the old app's `DamageCalc.TargetRatio`
  (`alpha_i² / Σ alpha_j²` with `alpha = (A_inf/3, A_cav, 4.4·A_arc/3)`).
- Optimal damage `L·√(Σ (base_t·A_t)²)` matches `DamageCalc.LeaderQuality` (`K`).
- No extra 1.1 on archers below T7/TG3 — matches the app's comment.

## VIP XP ladder — the calculator's table

The VIP calculator (`vip-calculator/`, `vip.js`) is pinned to the in-game VIP screen
(verified March 2026 patch, per the Kingshot Mastery VIP guide:
<https://kingshotmastery.com/guides/kingshot-vip-guide>). The ladder is a game-wide
constant — same on every server — and XP resets to 0 on each level-up.

| Reaching level | XP for that level | Cumulative |
|---|---|---|
| VIP 1 | 0 (you start there) | 0 |
| VIP 2 | 2,500 | 2,500 |
| VIP 3 | 5,000 | 7,500 |
| VIP 4 | 12,500 | 20,000 |
| VIP 5 | 30,000 | 50,000 |
| VIP 6 | 40,000 | 90,000 |
| VIP 7 | 60,000 | 150,000 |
| VIP 8 | 100,000 | 250,000 |
| VIP 9 | 350,000 | 600,000 |
| VIP 10 | 600,000 | 1,200,000 |
| VIP 11 | 1,200,000 | 2,400,000 |
| VIP 12 | 2,400,000 | 4,800,000 |

Past VIP 9 the ladder doubles per level. Free sources (daily logins, Alliance Store,
events, achievements) land around 200–500 XP/day, so the rate is the player's own.

### The date formula

```
earned  = cumulative(level) + progress
rate    = earned ÷ days played
date(T) = today + ceil((cumulative(T) − earned) ÷ rate)
```

Milestones for the copy: VIP 4 (construction +10%), VIP 6 (march queue +1 — the most
impactful perk), VIP 9 (construction +20%, first combat buff — the F2P ceiling).


## 9. Operational throughput model

For live Bear coordination, rally supply limits how often join queues can actually score.

```
H = L·S / (P·Q)
```

where `P` = participants, `L` = rally launchers per five-minute cycle, `S` = average joiners
that fit in each rally, and `Q` = join queues per player.

If everyone launches, `L=P`, so `H=S/Q`. With six join queues, 13–14 joiners per rally means
**2.17–2.33 supported hits per queue** even when physical march turnaround could support more.

The live guide therefore prioritises: everyone launching; preserving 13–14 joiner slots with a
conservative ~85k join cap; equalising scarce troops across join queues; converging on **5/15/80**
once queues hit the cap; and allowing designated outsized leads to full-send only their own lead march.
