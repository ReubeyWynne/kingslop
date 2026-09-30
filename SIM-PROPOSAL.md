# Battle Simulator — multi-mode shape proposal

**Status:** built — §9 step 2 landed, plus the Mystic advisor and the PvE bench frame (the
owner chose "build all reachable modes"). Bear damage ships as ratio-only maths; gates A–C stay
open. The two deviations from this document are noted at the end of §9.
**Date:** 2026-09-10 (grounding fetched live: kingshotmastery mystic-trial guide 2026-08-15;
the Frakinator's sources mined 2026-09-10 — see `KINGSHOT-SOURCES.md`).
**Ground rules honoured:** AGENTS.md (copy voice, 17-dictionary propagation), DESIGN.md
(one-signal-per-page, manuscript grammar, ≤46rem, 1–3px radii, sharp-edge/ink-line inputs),
PRODUCT.md (static Jekyll, "grounded or absent" for gameplay numbers), the impeccable
shape process (discovery rounds → brief → confirmation; no code until confirmed).

The simulator page must **not be limited to Bear Hunt**. The design holds four fight modes
now — **Bear ratio, Bear damage→bracket, Mystic Trial advisor, PvE beasts** — with room
for more. Everything below was confirmed with the owner in two discovery rounds; the
remaining per-mode research gates are marked OPEN, nothing is invented.

---

## 1 · Confirmed decisions (owner, 2026-09-10)

- **Surface shape:** one page, in-page mode switch (`battle-simulator/` stays a single
  page; a mode rail at the top picks the fight; mode state deep-links via `?mode=…`).
- **Input spine:** **report-import first** — one screenshot = the loadout. The 12
  Bonus-Details values per side are already OCR-read (left = your/lead's column, right =
  opponent's), and the report's top strip carries per-type troop counts + level ("Lv.10.0").
  Modes add their own few extra fields. Manual entry stays the fallback; the form remains
  the source of truth; every imported value is editable (today's contract, kept).
- **Report semantics (bear):** a bear battle report's left green Bonus-Details column shows
  the **rally lead's shared stats** — every participant sees the same panel. Therefore any
  bear calc may assume OCR stats = the rally lead. The **damage calc takes user-entered
  troop quantities** (counts + tier per type), **ignoring the OCR troop strip** (that strip
  is the rally's troops, not yours).
- **Mystic fidelity:** **advisor + eventual clear-predictor (research-gated)**. The advisor
  ships first (room check + starting ratio + what to upgrade). The clear predictor is OPEN:
  we can OCR the **opponent's stats from the right column of a trial report**, which is the
  collection path for per-stage enemy tables.
- **Mode scope for the first design** (architecturally held now, shipped progressively):
  Bear Hunt ratio + joiners · Bear Hunt damage → bracket · Mystic Trial room advisor ·
  PvE beasts / monsters.

## 2 · Job and audience

A KingShot player, mid-event on a phone, with one question: **"for this fight, what do I
send — and what will it get me?"** They arrive with a report screenshot in hand (bear
rally, Mystic Trial stage, beast fight) or about to open one. Visitor mode: **Operate** —
a tool that answers, not a guide to read. The page is the site's arithmetic room; the
event guides keep their demystifying role and link out to it.

Success: the import → answer loop takes seconds, the answer is plain ("5/15/80 is the default
join preset; this lead's exact optimum is …", "your march lands bracket 9 — next hammer at
38.4B", "Forest of Life is open — pets are the check, start 50/15/35"), and the maths sits
behind the `❧` disclosure, never in front of the reader.

## 3 · Grounded facts the design leans on

### 3.1 Report layout (verified from real screenshots 2026-09-09/10)

A battle-report mail's **Bonus Details** panel is a 12-row table (3 troop types × Attack /
Defense / Lethality / Health) with **two value columns**: left mostly-green (your side /
the lead's shared side), right mostly-red (the opponent). One row colour-inverts per side
(health rows) — the column is the side, not the colour. Above the table: two troop strips
(left trio vs right trio) with per-type **counts + "Lv.X.0"** level.

Existing OCR (`js/sim.js`, PaddleOCR.js PP-OCRv6 tiny, self-hosted `/models/`) reads the 12
left-column values by row label. **New OCR work:** read the right (opponent) column, and
the per-type tier + count strip. Bear-damage mode deliberately ignores the strip.

### 3.2 Bear Hunt / Bear Trap (corrected by owner 2026-09-10)

"Bear Hunt" is the **event**; "Bear Trap" is the **map object** that spawns the bear. Each
alliance can run **2 mutually-exclusive traps**; a player joins **one of them every 48
hours** (matches the bear page's 48h chip). Reward brackets double 47M → 38.4B with one
extra Forgehammer per bracket (MATHS.md) — the bear page and the damage mode share this
ladder. Enemy-down buffs "do not apply vs Bear Trap"; only own-side attack/lethality
buffers help. (Full mined detail in `KINGSHOT-SOURCES.md` §2.)

### 3.3 Mystic Trial (kingshotmastery guide, fetched 2026-08-15 — community numbers)

Six rooms, each an **account check**, sharing one event screen; rooms open on a weekday
roster; **five rooms fix your troops at Level 10** (training more troops will not clear
them — improving the checked system will); only **Coliseum and Radiant Spire** let you
choose heroes.

| Room | Open | Checks | Start | Alt 1 |
|---|---|---|---|---|
| Coliseum | Mon–Tue | Heroes + Hero Gear | 50/10/40 | 55/15/30 |
| Forest of Life | Wed–Thu | Pets | 50/15/35 | 55/10/35 |
| Crystal Cave | Wed–Thu | Governor Charms | 60/20/20 | 65/15/20 |
| Knowledge Nexus | Fri–Sat | Academy + War Academy research | 50/20/30 | 55/15/30 |
| Molten Fort | Fri–Sat | Governor Gear | 60/15/25 | 65/15/20 |
| Radiant Spire | Sunday | Full combat build (own troops) | 50/15/35 | 55/10/35 |

Ratios are Infantry/Cavalry/Archers. Note: RESEARCH.md's older one-liner (Mon–Tue heroes,
Wed–Thu pets, Fri–Sat research + gov gear, Sun full check) is the *system* roster; the
Crystal Cave (charms) opening sits in the same Wed–Thu window as Forest of Life — the
room list above is the accurate six. First goal: clear Stage 1–10 per room → unlocks Raid
(+10 Trial Crystals per stage per week). Five attempts/room/day, refreshed 00:00 UTC; an
attempt is only spent on a **loss**. ⚠ Verify the Crystal Cave day against in-game before
copy ships; the mastery table and RESEARCH.md disagree on scope of the Wed–Thu window.

Shop/rewards: First-Win chests · weekly Raid Crystals · Mystic-XP milestones (Mithril,
Mythic shards, gear, decorations). TG Dust in the Trial Shop is the buy priority once it
appears (T11 need it in volume).

### 3.4 PvE beasts

World-map beasts/monsters fought with your own army + heroes (the sim site's "lovelorn"
family). Enemy stat tables are **not yet collected** — mode ships as a frame + bench state
(see §6) until grounded. OPEN.

## 4 · Selected direction

- **One page, one world, one signal.** The sim page already owns a theme
  (`data-page="sim"`, the war room: near-black night + antique gold, candle-rise dust).
  Modes are chapters of one ledger — mode identity rides on the rail + a one-line "what
  this fight checks" gloss, **never a hue swap**. Precedent for in-page stepping without
  breaking the world: kvksg's crown-gold SG sections, swordland's alternating duel blue —
  but the sim stays one hue because the *tool* is the frame, not the fight.
- **The mode rail** — a fight picker under the hero, in the `.ev-switch` grammar
  (uppercase, active = amber + ❧): Bear ratio · Bear damage · Mystic Trial · PvE beasts.
  Each item is a chip with an availability mark: **live** vs **on the bench**
  (research-gated). Bench modes are visible, selectable, and say plainly what's missing —
  the rail is the honest roadmap, and the page never reads as broken-empty.
- **The loadout strip** — one shared "import a report" prompt (existing client-side OCR
  pipeline + model warm-up), a status line, and a compact readout of what was read. Below
  it, **one active panel** swaps per mode: the mode's fields + the mode's ruled output.
- **Per-mode panel content:**
  - *Bear — ratio* (live, shipped behaviour): lead's atk/leth per type from the report →
    ideal troop mix `f_t ∝ (weight·A)²` + leader strength K (MATHS.md §4–5).
  - *Bear — damage → bracket* (OPEN fit): lead stats from report + **your march** — troop
    quantities **per type**, **tier per type**, joiner hero first skill → predicted damage
    → position on the 47M→38.4B bracket ladder + next Forgehammer threshold. Needs the
    absolute-scale constant fitted from real bear reports (see §8 gate A).
  - *Mystic — advisor*: room picker by weekday (today's open rooms auto-highlight). Output
    per room: what it checks, starting ratio + first alternate, upgrade pointer. Clear
    predictor = bench, fed by right-column opponent OCR (gate B).
  - *PvE beasts*: frame + import + honest bench state until enemy data is collected (gate C).
- **Deep-link & share:** `?mode=bear-ratio|bear-damage|mystic|pve` opens the right panel;
  the URL is the state. Alpha posture (the first-draft stamp) stays until the damage
  constant is fitted and bench modes are grounded.

## 5 · Scope and boundaries

- Fidelity: production screen for live modes (bear ratio now; bear damage + mystic advisor
  as their gates close), bench frames for the rest. No code this turn — this document is
  the confirmation artifact.
- Untouched: topbar/ledger/footer chrome (one `_data` edit only if a nav label changes —
  "Simulator" already exists), the event guides' pages and copy, the one-signal /
  ink-on-night / 46rem / sharp-edge rules, `MATHS.md` as formula source of truth.
- Anti-goals: no tabbed SaaS chrome, no per-mode colour worlds, no hero portraits as the
  spine, no fabricated stage/bracket predictions, no page that buries the import behind a
  wall of inputs.

## 6 · States and ranges

- Realistic data: 12 left + 12 right percents (0–1000%+), per-type tier L1–L11 × TG 0–5,
  per-type counts (0–1M). Damage readouts to 38.4B, locale-formatted.
- Material states: first-run (no import yet — prompt leads) · importing (model warm-up;
  data-saver skips preload) · unreadable shot (error line + manual fallback) · bench mode
  (gloss: what's missing) · live mode with stale import (re-derive per mode) · language
  switch mid-session (re-paint per existing i18n contract) · 320px phone → desktop.

## 7 · Interaction and layout

- Hero → mode rail → loadout strip → active panel → shared "the maths" disclosure.
  Everything in the 46rem column; the rail scrolls horizontally on phones, sits in the
  topbar rhythm on desktop.
- Mode switch changes only the panel + TOC highlight; scroll position and imported state
  persist. Output rows reuse the ruled `.sim-head/.sim-row` grammar; brackets reuse the
  bear page's reward-rank language.
- Feedback: import status line (ok/bad), computed answers in amber numerals, bench modes
  show their missing piece rather than a spinner.
- TOC: mode names replace/augment the current two links only as far as the rail needs; the
  page remains one scrollable ledger, not an SPA.

## 8 · Constraints, open decisions, research gates

- **Jekyll static, i18n across 17 dictionaries** — per-mode copy must be lean and reuse
  shared tool labels; new keys live in the `sim.*` namespace; `.dsh` verify harness
  extends per mode (see `verify-sim.mjs` pattern: every referenced key exists in en.js,
  all 17 dictionaries carry each `sim.*` key non-empty, HTML tags balanced).
- **OCR:** keep PaddleOCR.js client-side + self-hosted `/models/`. New reading: right
  (opponent) column; per-type tier + count strip. Bear-damage mode explicitly ignores OCR
  troop counts. The sim site's private `stats-parser` endpoints are **not** ours — do not
  build on them (KINGSHOT-SOURCES.md §2).
- **OPEN — gate A (bear damage scale):** fit the absolute damage constant from real bear
  reports (damage line + the lead's stats on the same report). Until fitted, the damage
  mode must not print absolute numbers.
- **OPEN — gate B (Mystic clear predictor):** collect per-room/per-stage enemy stat tables
  by OCR'ing the right column of trial reports. Until collected, advisor only.
- **OPEN — gate C (PvE beasts):** collect enemy stat data. Until collected, bench frame.
- **OPEN — verify:** Crystal Cave's exact open days in-game before copy ships; whether the
  sim's Bear Trap Level 0–5 / Valora Hunter Instinct (+30% damage points at L11) knobs
  belong on the damage panel (they are real in-game inputs per the sim site).
- Builder must not invent: mode availability rules, ratio tables beyond the mined
  community numbers, bracket thresholds beyond MATHS.md.

## 9 · Build order (once confirmed)

1. Land this doc (done). 2. Mode rail + loadout strip + bear ratio mode (structure first,
   then OCR right-column + strip reading). 3. Damage→bracket reader → predictor (gate A).
4. Mystic advisor (gate B collects beside it). 5. PvE bench frame (gate C).
Each step ships with its `sim.*` keys across all 17 dictionaries and the `.dsh` harness
extended; `jekyll build` + page checks against `_site/` before done.

### Progress

- **Step 2 — done.** Mode rail (in-page, `?mode=` deep-linked), shared report sheet taking all
  twelve Bonus Details values as editable fields, the OCR prefill filling all twelve, and the
  bear ratio panel. The page is one scrollable ledger: `#console` + `#maths` stay the two TOC
  chapters; the rail owns mode identity.
- **Step 3 — partly reachable, shipped without the constant.** The march panel takes counts and
  tier/TG per type and answers with the *split*: what share of this lead's potential the march
  converts (`Σ(b·A·√f) / √(Σ(b·A)²)`), the ideal split at that size, and the `√` growth law. No
  damage figure and no bracket position — gate A still holds those back, as §8 requires.
- **Step 4 — advisor done, predictor on the bench.** All six rooms with checks, opening window,
  starting ratio and first alternate; today's rooms marked in UTC (the 00:00 UTC reset). The
  Crystal Cave's window ships with the disagreement named in the copy. The clear predictor is
  still gate B.
- **Step 5 — bench frame done.** The PvE panel carries no numbers; it names the missing enemy
  tables and how they will be collected.
- **OCR:** the right-column and troop-strip reading was *not* built — nothing shipped this pass
  reads the right column (that is gate B's collection path) and the bear-damage mode takes
  user-entered counts by design. The existing left-column reader now fills all twelve cells
  instead of six.

### Deviations from this document

1. **The rail wraps instead of scrolling horizontally on phones** (§7). `js/common.js` starts
   the page-swipe gesture on any touch that does not land on an input, a select, `#ledger` or
   `#toc`; a horizontally scrollable rail would have to be added to that shared guard. Wrapping
   keeps every fight visible and leaves the shared gesture alone. Two rows of two on a phone.
2. **The damage panel's weights come from the troop table through one shared tier scale**
   (the infantry series at T6/TG0 as the reference, which is where ⅓ / 1 / 4.4⁄3 comes from)
   rather than from each type's own absolute base attack. The two agree for a uniform tier, but
   the shared scale makes a uniform tier cancel *exactly* — the ratio panel and the march panel
   can never disagree about the same lead, and the source table's per-type rounding stays out of
   the answer. Crossing the archers' own **T7+ / TG3+** line still moves the optimum: that ×1.1
   is a rule about archers, not about the tier scale, and the panel's copy names it as such.

---

## 10 · Hero layer — the input module (planned, gate D)

**Status:** OPEN — no code. This section records the model, which is now *mined*
rather than guessed (`KINGSHOT-SOURCES.md` §2, *Hero layer*), and the input shape
confirmed with the owner on 2026-09-11.

### The four layers a hero contributes

1. **Rank / star stat line** — attack and defence, always equal, on the hero's own
   troop type only: `ceiling × curve[6·stars + tiers]`.
2. **Exclusive gear (widget)** — a flat lethality+health pair for the hero's type,
   live in *both* roles, **plus** a role-gated skill (`rally | defender`). Both
   scale with the widget's level.
3. **Expedition skills** — passives and procs, at skill level `min(5, stars + 1)`,
   so **4★ is what unlocks Lv5**.
4. **Gear / charms / research** — the account "common" every hero sits on.

Fed in that order the module reproduces a real Bonus-Details panel; the three
independent checks are recorded in `KINGSHOT-SOURCES.md` §2.

### What the reader types — and what they don't

**Roster (per hero).** Hero, stars (`N★` + tier, i.e. the ladder index), widget
level or "no widget". Skill levels are **derived, not typed** — `min(5, stars + 1)`
— with an optional *lower* pin, because a hero can lag its cap (2★ Amadeus may
never have been fed skill books to Lv3). Never a higher one.

**Gear sets — per troop type, not per hero.** This is the owner's key constraint:
**hero gear is transferable, and a player realistically owns one levelled set per
troop type.** So the module stores three sets — infantry, cavalry, archer — each a
list of pieces with quality + level, and applies the set matching the equipped
hero's type. Swapping two heroes of the same type must not ask the reader to
re-enter gear. **Widgets are the opposite: hero-bound and never transferable**, so
the widget level lives on the roster entry, not on the set.

**March.** Three hero slots, the counts/tier/TG the march panel already takes, and
the **role — rally (attacking) or garrison (defending)**. Role is not cosmetic: it
decides which widget skills apply and which heroes are eligible at all. Zoe and
Hilde are defender-widget heroes; Amadeus and Marlin are rally-widget ones; the
same hero ranks differently by role.

### What it computes, and why it is its own module

`panel_type = common_type + curve[index] × ceiling` for the hero's own type, then
the widget's stat pair and its role-gated skill through the special-bonus form
`(100 + entered) × (1 + g/100) − 100`, then the skills as their own multiplier
layer. The output is **the same twelve values the report sheet takes**, so the hero
module *feeds* the existing ratio and march panels rather than replacing them.

It cannot be a factor inside the ratio panel: an all-troop skill cancels out of a
split, but a **type-specific** one does not (Rosa archers only, Thrud
infantry+archers, Alcar infantry). Only a module that knows *which hero* is in the
march can say whether the mix moved. The ratio panel's note now says exactly this.

### Data — all mined, nothing to invent

- **34 heroes** with full 31-point ladders and their `attackPct`/`defensePct`
  ceilings, in `kingshot.net/hero-stat-comparison`'s JS payload as `stats:[…]`
  arrays. The curve is shared, so per hero the module needs only the ceiling plus
  the skill values — the ladder itself is one 31-value constant.
- Skill values and per-hero widget definitions (`{troop_type, widget_type,
  widget_effect}` + the 0/5/7.5/10/12.5/15 ladder) — already in
  `KINGSHOT-SOURCES.md` §2, from the sim bundle's `dn`/`xi` tables and the
  optimizer's hero pages.
- Hero-gear stats: that site's quality ladder is the **base only**. In game the shown
  troop-stat is `base × (1 + 0.10 × mastery level)` — **Mastery Forging** is a second,
  multiplicative axis, and **Epic gear cannot be mastery forged**, so a built set is
  Mythic or Red. Four in-game screenshots fit exactly (`KINGSHOT-SOURCES.md` §2,
  *Hero gear*). Still missing `⚠`: the slot table — how many pieces a hero wears and
  which troop stat each carries.

### Gate D

**OPEN — gate D.** The module may print the twelve values, the resulting mix and
the split efficiency, but **no absolute damage and no bracket** until gate A's
constant is fitted: the hero layer changes the *stats*, not the missing constant.
Also OPEN: confirm skill levels are readable from a screenshot (they are on the
hero's Skills tab) before promising any import path — the roster is otherwise
manual. And the skill-level *derivation* both gates above assume should be
re-checked against a 5★ hero's panel.

### Build order

1. **Data first — landed 2026-09-11.** `_data/heroes.json` carries all **34** heroes:
   their 31-point ladders, ceilings, published `attackPct`/`defensePct`, expedition
   skill values and widget specs. `.dsh/verify-heroes.mjs` checks ladder length (31),
   monotonicity, ceiling parity, and the shared-curve claim — every normalised ladder
   reproduces `curve` within source rounding, and the only deviations beyond that are
   the three recorded gen-2 anomalies, asserted so a source fix shows up as a test
   change rather than silent drift. **Deferred to step 2:** the trimmed runtime subset.
   The file is the audit table and is deliberately not served. Two gaps it records
   rather than fills: 12 heroes have an empty widget row in the mined bundle
   (Chenko, Amane, Yeonwoo and the other early heroes — their exclusive gear exists
   in game, the spec was never in the bundle), and the four heroes marked
   `skillsSource: "kingshotoptimizer"` take their skill labels from their descriptions.
2. **Roster input** — hero picker, star, widget level, three slots, role toggle.
3. **Gear sets** — three per-type sets. A set is a list of pieces each carrying an
   **enhancement level and a mastery level**; a piece contributes
   `base(quality, level) × (1 + 0.10 × mastery)` on the troop stat it holds, matched to
   the equipped hero's type. **Epic is skipped** — it cannot be mastery forged, so the
   input only needs Mythic/Red. Blocked on `⚠` the slot table.
4. **Output** — the twelve-value panel feeding the existing ratio and march panels.
5. **Then** the roster becomes the collection grid for gate A: every rally report
   pins one hero × star × gear state, which is how the damage constant gets fitted.

Each step ships with its `sim.*` keys across all 17 dictionaries and the `.dsh`
harness extended; `jekyll build` + page checks against `_site/` before done.

