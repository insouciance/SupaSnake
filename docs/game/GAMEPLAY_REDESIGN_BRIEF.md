# Brief — gameplay redesign, implementation plan

**For the planning model. Read this first, then read the code it points at.**

---

## 1. The mission, and the bar

Produce the implementation plan for a gameplay redesign of SupaSnake. The
diagnosis is done and four of five design decisions are ruled. What is missing is
the plan: work packages, sequencing, migration protocol, test strategy.

**The acceptance bar is the owner's own judgement.** In their words: *"I will not
start campus-1 when I don't find the game compelling myself."* Campus-1 is the
first real audience. Every technical criterion below is subordinate to that one.

**You may and should explore the repo** — §5 is a targeted reading list so you
spend that effort on understanding gameplay rather than on rediscovering what has
already been measured. Do not re-derive §3; it is verified.

---

## 2. Read these, in this order

1. **`docs/PRODUCT_CONSTITUTION.md`** — the single design authority. 14
   Inviolable Rules. Not overridable by anything here.
2. **`docs/game/GAMEPLAY_PROPOSAL.md`** — the diagnosis, the owner rulings (§0),
   the evidence, and §9's list of refuted claims and research gaps.
3. **`docs/game/WP_GROWTH_LAB.md`** — the playtest instrument that answers the
   one open decision (D1).
4. **`CLAUDE.md`** — stack, layout, and the hard rules (server authority,
   Supabase error checking, no TODO/FIXME, the two score folds).
5. **`docs/IMPLEMENTATION_HANDOFF.md`** — the branch/migration/WP protocol this
   plan must follow.

---

## 3. Decided. Do not relitigate.

**D2 — difficulty ladder: adopted.** Fixed, ordered, cumulative (Balatro Stakes /
StS Ascension), **not** Hades pick-your-own — *"if you're Heat 20, there's no
telling what modifiers compose that."* 6–8 rungs, one named rule each, unlock
globally, record per-dynasty. Starting length is a natural rung.

**D3 — per-dynasty score curves: adopted, reduced scope.** Under a geometric
terminus the run ends at an occupancy, so speed stops converting into score and
the ~10× gap collapses to the multiplier alone (~3×). Curves are about *shape*
(CYBER front-loaded, PRIMAL back-loaded) with comparable totals. Per-dynasty
leaderboards are probably unnecessary — verify.

**D4 — monotonic length: adopted, strong form.**

> **Length only ever increases. Free space only ever shrinks.** Nothing shortens
> the snake. Anything that costs the player costs **growth**.

Because once length is the difficulty clock, *removing* length is a reward — so
every effect priced in "segments removed" is a bonus paid for with a bonus.
Consequences: **INFUSE inverts to +8 segments**; `shed`, `splice_regenesis`,
`splice_molted_rebirth` are deleted; Ouroboros, Thick Hide and Molt are re-signed
to cost growth; **revives grant survival, never shrinkage** (Phoenix's "reborn at
8" is the largest violation). `Bulk Up` already obeys and is the template.

**D5 — daily obligation: keep.** A 24-hour window is not an appointment.
One carve-out: **show clan totals, not per-member attempt counts** —
`SerpentPanelMember` currently exposes zeros to teammates, which converts a
personal choice into a social debt. Churn is contagious.

**D1 — time-to-first-pressure: OPEN.** Answered by playtest, not analysis.

---

## 4. Measured. Do not re-derive.

All verified against code or production data on 2026-07-27.

**The core defect.** Board is 20×20 = 400 cells; length is `3 + foods`.
Across 144 completed production runs the **median run reaches 8% occupancy** and
the **best run ever recorded reaches ~43%**. The board has never been filled. The
geometric difficulty curve — the one thing Snake gets free — has never engaged.
Players die to attention lapses on an empty field.

**Owner's record run** (180 foods, 26:26, PRIMAL, score 1800): `run_events`
stores per-food stamps as `{e:'f', n, t}` where **t is deciseconds** (death at
15864 = `duration_seconds` 1586, exactly). After trimming two long pauses (196 s,
186 s — the owner writing notes) the run is **18.9 minutes of actual play**.

**Traverse cost, fitted from that run:**
`seconds_per_food ≈ 3.5 + 14.0 × occupancy` (4.2 s at 5% → 9.8 s at 45%; a 2.3×
slowdown). A simulation using this fit predicts **19.8 min** for today's config
against 18.9 actual — **within 5%**. Note the mean/median divergence past 25%
occupancy: most foods stay quick and a few become enormous. **The tail is the
problem, not the average** — which points at multi-food spawning rather than a
speed change.

**Curves per dynasty** (`rulesets.ts`): PRIMAL tick **200 ms constant** (`:135`),
`scoreMultiplier: () => 1` (`:137`), DNA per food grows linearly and **uncapped**
(`:136`). CYBER 200→50 ms over foods 0–100 (`:150-154`), multiplier caps ×3 and
DNA caps at 30, **both at food 20**. COSMIC 160 ms constant (`:220`),
`scoreMultiplier: () => 1` (`:222`), plus the only recurring lethal-state
oscillation in the game (walls ~12 s open / 8 s closed with a telegraph).

**Extraction is inert early.** `extractMultiplier: 1.25` vs `deathMultiplier: 0.6`
(`rulesets.ts:99,101`) — only 2.08× apart. First portal on PRIMAL needs ~4%
survival odds for PASS to be correct; on CYBER the break-even is negative. It
becomes a real wager only around food 51–63.

**Catalog** (34 genes + 15 strain tiers): 35% amplifiers, 29% converters, **24%
failure-state deletion**, **12% constraints**. Twelve deletion mechanics against
**two** real failure states (wall, self — extraction is the win condition).
**31 of 34 genes carry exactly one strain** (`genes.ts:74-96`; only
`ancient_grove`, `afterburner`, `solstice_engine` are dual) — so the strain
system is a partition, not a graph, and near-miss is pure draw luck.

**Input is not the problem.** 3-deep direction queue validated against the queue
tail (`SnakeGameLogic.ts:588-589,1121-1135,1279-1283`) — better than the depth-2
standard the research recommends. There is **no coyote time** anywhere.

**Thresholds are already correct.** 2/3/4 with `+1` spacing caps near-miss at one
pick, which is right for ~6 picks per run. Do not copy TFT's 2/4/6.

**Endowed progress is gated backwards.** Heirloom spawn points cap at 2 and tier 1
is 2 — but `spawnPointsUnlocked` needs **12 banked runs and 2+ owned variants**
(`genePool.ts:65`, `game.ts:170`). The strongest motivational device in the
literature (19%→34% completion, Nunes & Drèze 2006) is off for every new player.

---

## 5. Where gameplay actually lives

| File | What it holds |
|---|---|
| `src/shared/game/rulesets.ts` | The three dynasties: speed, score and DNA curves; extraction constants; **both score folds** (`:320`, `:517`) |
| `src/shared/game/genes.ts` + `mutations.ts` | The 34 genes; `MUTATION_STRAINS` at `:74-96` |
| `src/shared/game/strains.ts` | 5 strains, 15 tiers, thresholds, `STRAIN_PHYSICS` / `STRAIN_ECONOMICS` |
| `src/shared/game/splices.ts` | 10 splices, `fusePicks` (auto-fuses with no prompt) |
| `src/shared/game/genome.ts` | `computeLengthTrace` (`~:321`), shed cycles, `strainActivations` |
| `src/shared/game/traits.ts` | Traits, incl. Ascetic and Iron Scales |
| `src/shared/game/offerGravity.ts` | Offer weighting, pity window |
| `src/lib/game/SnakeGameLogic.ts` | The engine: growth (`~:1470`), collisions (`:1290-1400`), speed (`:2961-2998`), input queue, `spawnFoods` (`:2460`) |
| `src/lib/server/gameValidator.ts` | Server recompute, severity table, claim caps, `maxFoodPerSecond` bounds |
| `src/app/api/game/session/route.ts` | Run start/end; `run_context` stamping |
| `src/shared/config/game.ts` | `gridSize: 20` (`:24`), `initialLength: 3` (`:34`), FTUE gates (`:166-172`), hold budget |

---

## 6. Constraints you must not break

- **Rule 2 / `npm run verify:constitution`.** Both score folds may only do
  `score += Math.round(FOOD_BASE_SCORE * ruleset.scoreMultiplier(n))`. Score is a
  function of food count and ruleset — nothing else. Coiling, density, risk and
  build **cannot** pay in Score; they pay in Yield. This is CI-enforced over ~915
  files; do not weaken it.
- **Fold parity.** Any change to length or growth must live in **one shared
  function** called by both `SnakeGameLogic` and `computeLengthTrace`. A
  divergence silently invalidates honest runs — the defect WP-2.05 existed to
  kill. Write the parity test first.
- **Never gate length or payout math behind a `NEXT_PUBLIC_*` flag.** They are
  build-time inlined; client and server will desynchronise. Stamp the variant
  server-side into `run_context` (migration 054) and replay from the stamp. The
  flag may control only whether a selector is *offered*.
- **Bounds must know about mechanics that legitimately raise them.**
  Multi-food spawning beats `maxFoodPerSecond` (PRIMAL 1.0) and will flag honest
  runs unless derived, not guessed.
- **Server authority** — economy and progress mutate only via API routes and
  RPCs. **Check every Supabase `error`** and report to Sentry.
- **Migrations are forward-only**, applied by the deploy workflow *after* the app
  is promoted. Next free number is **057** (001–056 are hosted).
- **CI runs every flag-split e2e on its flag-OFF branch** while production now
  runs all flags ON. Any new player-visible surface needs its flag-on path
  covered or it ships untested.

---

## 7. What to produce

A sequenced implementation plan, as work packages under the handoff protocol,
covering:

1. **The growth lab** (`WP_GROWTH_LAB.md`) — first, because it answers D1 and
   because its projections must be **re-run against the inverted INFUSE cost**
   (+8 rather than −4; the owner's record run swings 36 segments, ending nearer
   52% than 43%).
2. **D4 catalog surgery** — delete the length-reducers, invert INFUSE, re-sign
   Ouroboros / Thick Hide / Molt, convert revives from shrinkage to survival.
3. **The insurance→constraint conversion** — twelve deletion mechanics down to
   one or two, using the five field-proven conversions in the proposal's §4/T4.
   Target mix: constraints 12%→40%, deletion 24%→5%, amplifiers 35%→15%.
4. **Dual-tagging the catalog** — a data change, probably a bigger unlock than
   any single gene rewrite.
5. **PASS pays, quoted before the choice; BANISH** — agency verbs. The near-miss
   research is unambiguous that pressure only motivates when the player *chose*
   it.
6. **Legibility** — strain progress on the offer card; ungate endowed progress.
   Cheapest high-impact work in the set, and it makes the owner's own playtests
   interpretable.
7. **Pick-rate instrumentation** — most time-sensitive item. Nearly free now,
   expensive to retrofit, and it makes the catalog empirically auditable the
   moment PASS ships. The population isn't there yet (415 player rows, 15
   completed runs); pre-launch is the window.
8. **D2 ladder** and **D3 curves**.
9. **Dynasty asymmetry** — different failure modes, a removed portal verb each,
   length-taxed yield. Its own wave, after the above.

**Sequencing constraint:** hot files are `session/route.ts`, `gameValidator.ts`,
`game/page.tsx`, `SnakeGameLogic.ts`. Packages touching the same hot file must
not be in flight together.

---

## 8. Do not repeat these

Recorded in the proposal's §9. The load-bearing ones:

- **CYBER's problem is not dropped inputs.** The queue is 3-deep and correct.
- **CYBER foods 20–100 are not unrewarded.** Per-food reward is flat but
  throughput rises with tick rate — a legibility defect, not a balance one.
- **An economic horizon was proposed and rejected by the owner**, correctly: it
  is a second difficulty system substituting for the native one. Fix the
  geometry, not the payout curve.
- **A wall-clock run bound fails**: value scales with foods/minute, so a
  seconds-based bound hands CYBER a ~4× advantage and makes the slow dynasties
  handicaps. Any horizon must be indexed to foods, portals or board state.
- **Biasing food spawns toward the occupied region** was proposed and withdrawn —
  it increases enclosed-pocket spawns, converting tension into dead waiting.
- **All Underlords claims in the research are unverified** — a research agent
  fabricated the attribution. The *idea* of a per-distinct-trait breadth payoff
  is sound; the numbers are not evidence.

---

## 9. The two principles the owner arrived at, which outrank the research

**"Focus isn't our fun-mechanism."** Attention is a precondition for play, not a
source of it. A game that kills you for one lapse on an empty board is testing
endurance of concentration. The design target is therefore *time-to-pressure*,
not run length — median duration is already 1–3 minutes and fine; the problem is
that those minutes are empty.

**"Pay in the currency of the game, never in waiting."** Coiling is currently
taxed with long traverses and enclosed pockets with dead waits. Both are correct
skills priced in the wrong unit. Every proposed cost should be checked against
this.
