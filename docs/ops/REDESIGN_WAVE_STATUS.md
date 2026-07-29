# Redesign Wave — current state and handoff

Companion to `REDESIGN_WAVE.md`, which is the PLAN. This file is the STATE:
what has shipped, what was ruled since the plan was written, and what a fresh
session needs in order to continue without reconstructing any of it.

Last updated 2026-07-29 (D1 ruling, pressure feedback, and CYBER tempo ruling).

---

## D3 CYBER TEMPO CLOSED — owner ruling, 2026-07-29

CYBER keeps its 200 ms opening and hyperbolic acceleration, but the per-food
decay is 0.02 and the floor is 120 ms (×1.67). This reaches ×1.6 at food 30 and
the floor at food 33, preserving the existing acceleration horizon while
removing the reaction-dominated ×2 terminal band. Growth remains +1; portal
duration, arena pressure, Yield, and Score are unchanged.

---

## D1 CLOSED — owner ruling, 2026-07-29

The owner played CYBER and COSMIC in the complete wave and found both fun and
thrilling, but ruled that their normal body growth must remain classic **+1**.
CYBER owns speed pressure; COSMIC owns route/space pressure. PRIMAL owns the
degressive body-pressure curve: +4 below modelled length 75, +3 below 96, +2
below 120, then +1. Gene cadence is no longer coupled to any of those shapes:
offers use 6 ± 2 foods (4–8), doubled by Patient, so skipping a poor offer does
not make a significant build practically unreachable.

The Growth Lab selector and rollout code are retired. Growth leaves setup and
the permanent HUD; one transparent, non-blocking board inscription announces
the opening value and later stage changes. CYBER speed changes use the same
event grammar. The visual follow-up also replaces ambiguous block lines/Xs with
Genome-derived source runes and adds a one-shot seal effect for newly completed
tight coils while smoothing tail-boundary interpolation.

This section supersedes older statements below that call D1 open or require
`NEXT_PUBLIC_GROWTH_LAB_V1`; those passages are retained only where they explain
the chronology of the wave. The ruling and feedback changes shipped as
`b15b5c3` in production workflow `30460660086` on 2026-07-29.

---

## THE MANDATE — owner instruction, 2026-07-28

**Build out the entire remaining wave, including every refinement recorded here,
before the next playtest.** The owner's words: *"it only makes sense to test the
full product when it's done, not parts of it."*

So do NOT ship the remaining items one at a time and ask for a playtest between
each. Everything in §6 lands, then the owner plays the complete design once.

**STATUS: DISCHARGED on the build side.** All nine of §6's items are merged to
`main` (§1). Nothing has been deployed. What is left is §6a — three owner
decisions, two owner-only flag flips, and one release.

This had direct consequences for how the work was done, and they still govern
the next wave:

- **D1 could not be ruled until then.** That sequencing condition was satisfied;
  the completed-wave playtest produced the 2026-07-29 ruling above.
- **Intermediate deploys are for verification, not for evaluation.** Deploying a
  half-built wave invites judgement on a design that is not finished, and the
  owner has already had two playtests distorted by exactly that (a decorative
  growth selector, then a lying readout).
- **Sequence around blockers, not around shippability.** The carry needs portal
  seeding; the trail needs terrain's visual language (now settled). Order the
  work by what unblocks what, not by what could be released soonest.
- **The one exception is a live production defect.** Terrain shipping lethal and
  invisible was fixed and deployed immediately, correctly. Anything of that class
  jumps the queue; nothing else does.

---

## §0 Numbering — read this first

**`WP-3.05` is used for two different things and the collision is mine.**

`REDESIGN_WAVE.md` §3 defines WP-3.05 as *"PASS pays, the offer card tells the
truth, pick-rate lands"*. The commits merged as PR #18 also say WP-3.05, for the
offer cadence, terrain renderer and INFUSE copy fix.

The commits are merged, so they are not being rewritten. Read the label by
context: **in code comments, WP-3.05 means PR #18's work.**

The build-out then took the next free numbers, which do NOT line up with
`REDESIGN_WAVE.md` §3's plan numbers. The mapping, once and for all:

| As built | What it is | Plan's number |
|---|---|---|
| WP-3.06 | One food + the rewritten placer | — (this doc's §4) |
| WP-3.07 | The trail — earned fusion | — (this doc's §3.2) |
| WP-3.08 | D3 Score curves + PRIMAL's own tempo | part of plan 3.04 |
| WP-3.09 | The in-run growth readout | — (this doc's §3.3) |
| WP-3.10 | The carry + the seeded portal schedule | "the carry" |
| WP-3.11 | PRIMAL Fortress (FERAL-2), and the e2e leg | plan 3.03's FERAL-2 |
| WP-3.12 | The D2 ladder | plan 3.10 |
| WP-3.13 | COSMIC — torus + calcifying stars | — (this doc's §6.5) |

**Plan 3.05 (PASS pays / offer-card / pick-rate) and plan 3.06 (BANISH) were
NOT built and are not in this wave.** Portal PASS now pays through the carry,
which is a different mechanism reaching the same goal; the gene-offer PASS
reward, the offer-card rewrite, pick-rate instrumentation and BANISH all remain
unbuilt.

---

## §1 What has shipped to production

| Deploy | Contents |
|---|---|
| `91cebb0` (PR #16) | WP-3.03 — CYBER's closing arena, growth readout |
| `b2f0c92` (PR #17) | Readout fix, CYBER 100ms tick floor, 18s extraction window |
| `741699f` (PR #18) | Terrain renderer, arena re-armed, offer cadence wired, INFUSE sign fix |

`NEXT_PUBLIC_GROWTH_LAB_V1` is **on** in production, confirmed by the selector
rendering.

### Merged to `main`, NOT YET DEPLOYED

The whole wave is on `main` and has never run in production. Three squashes:

| Commit | Contents |
|---|---|
| `55b0f2c` (PR #25) | Part 1 — WP-3.06 one food + the rewritten placer, 3.07 the trail, 3.08 D3 curves + PRIMAL's tempo, 3.09 the growth readout, 3.10 the carry + the seeded portal schedule |
| `8d5f42e` (PR #29) | Part 2 — WP-3.11 Fortress, 3.12 the ladder, and the e2e leg repaired and made blocking |
| `292624e` (PR #28) | WP-3.13 — COSMIC's permanent torus and calcifying stars |

**Migration 057 (`player_ladders`) is pending and has never been applied.**
Release order is stated in the file itself: deploy the app, then apply 057. The
app is correct without it — the ladder reader treats a missing table as "no
ladder", every run is rung 0, and rung 0 is byte-identical to the shipped game.

### Why the wave merged in three squashes rather than nine PRs

Branch protection requires every branch to be up to date with `main`, so each
merge costs a full CI cycle (~20 minutes, dominated by e2e). Nine work packages
merged serially would have been most of a day of CI. Bundling is also the
repo's own precedent — PR #11 bundled WP-2.05 … WP-2.10b.

**Integrating before merging earned its keep three times**, on collisions no
single branch could see:

- WP-3.09 asserted `aggressive` puts three foods on the board while WP-3.06 set
  every profile to one, the same afternoon. Both were green alone.
- Migration 057's RLS policy named `players.auth_user_id`, a column that has
  never existed. See §2.1 — this one would have failed the production deploy.
- Fortress and COSMIC each added a terrain-placement path, so the codebase
  briefly held three copies of "dedupe by cell, stamp a forming phase, push a
  block". They were converged into `placeTerrainAt` at merge, and
  `terrain.visible.test.ts` now asserts that composition — one proof of the
  renderer connection that holds for every consumer, including rungs nobody has
  written yet.

---

## §2 The terrain defect — post-mortem worth keeping

WP-3.03 shipped terrain as **complete physics with no renderer**. Blocks were
scheduled (`placeDueTerrain`), solidified (`tickTerrain`), and lethal in the
collision chain; nothing in the UI drew them. `arena: CYBER_ARENA` therefore put
six invisible instant-death blocks on the outer ring every five foods, live in
production from the WP-3.03 deploy — on PRIMAL first, on CYBER after PR #17
moved the arena where it was specced.

**The whole test suite was green throughout.** Every terrain test asserts the
MODEL — `blocksDueAt`, `formingTicksFor`, `ringOf`, `nextTerrainCells`, engine
lethality — and the model was never wrong. The defect lived in the gap between a
correct model and a screen, and nothing asserted anything in that gap.

`terrain.visible.test.ts` now asserts the connection, including the general
rule: **any dynasty that schedules terrain must have the renderer mounted.**

The generalisable lesson: *a primitive that can kill the player needs an
assertion binding it to something drawn.* Physics-complete is not
feature-complete, and a model test cannot tell the difference.

### Terrain's visual language (settled — the trail must differ from it)

- **forming** — flat floor decal that FILLS as it forms. Warm amber (`#f5a742`).
  Harmless, crossable. Drawn as area, not a hidden countdown.
- **solid** — raised block, cold slate (`#8fa3b8`), static, casts a shadow.
  Lethal, permanent, deliberately non-blooming.

The axis is **categorical** (flat-and-changing vs raised-and-still), not
palette, so it survives anyone retuning colours. Deliberately not a dynasty
colour: dynasty hues mean "you" everywhere else on the board.

**STILL NEVER VISUALLY VERIFIED IN A LIVE RUN.** `TerrainBlocks.tsx` is
structurally tested and now has three consumers (CYBER's ring, Fortress's
petrified segments, COSMIC's calcified stars), but no human has watched a block
form and turn lethal. Block height, decal fill rate and the slate against the
floor remain unverified judgement calls.

The trail got its first look on 2026-07-28 via `/dev/perf` under software GL —
no console errors, 58 draw calls, and the fusion contrast reads (packed rows
merge into a slab, gapped regions stay discrete voxels with dark seams). That
page uses its own camera and a scripted circuit, so head-zone expressiveness,
the tail's ticks-until-vacancy encoding, and the trail AGAINST terrain are all
still unseen.

### §2.1 The same defect shape, twice more

Two things this wave found that no test asserted, both the same shape as the
invisible terrain — the test checked the thing rather than its consequence:

- **A Rule 15 violation had been shipping since 2026-07-27.** WP-3.01 was
  recorded as having quarantined Molt. It had not: FERAL's shed cycle was still
  running in the engine AND in `computeLengthTrace`, still compounding tempo,
  still described to players. `rule15.test.ts` missed it because it asserted the
  retirement of the `shed` GENE rather than the absence of shed CYCLES. It now
  asserts both, plus the Molt dials by name.
- **Migration 057 would have failed the production deploy.** Its RLS policy
  named `players.auth_user_id`; every policy in this schema since 001 reads
  `players.user_id`. WP-3.12 deliberately did not apply its own migration — a
  defensible call — but the consequence was that the file had never been
  EXECUTED by anything, and its first execution would have been the deploy's
  migration step, which runs AFTER promotion. It was caught because the same
  wave made the e2e leg blocking, and that leg applies every migration in order
  against an isolated Supabase. The gate paid for itself on its first run.

---

## §3 Owner rulings since the plan was written — ALL IMPLEMENTED

Kept in full because the rulings are the authority, and because several were
harder to implement than they read. Where an entry's premise turned out to be
wrong, the correction sits with it rather than replacing it.

### 3.1 The carry — bank and salvage drift apart (2026-07-28)

Both multipliers **start at 1/1** and separate from the first portal: bank
climbs, salvage decays toward a **floor**, never near-zero. *"That large prize
the player eyed for is gone on death"* — but the run was still worth playing.

Sketch with a 0.35 floor: portal 1 ≈ 1.25 bank / 1.00 salvage; portal 5 ≈ 3.05 /
0.44, so banking pays about seven times a crash while a crash still returns over
a third.

**Yield only, never Score** — Rule 2 makes Score structurally unable to read the
extraction outcome, so this is mandated rather than merely prudent.

The shape is a strict improvement at the shallow end: today's flat salvage is
`0.6`, so a player dying at the first portal is currently punished harder than
this design would. The stake rises without the punishment rising — §12.3's
*"it may pull, it may never punish"*.

**Economy consequence, flagged not buried:** total DNA per run rises at the
shallow end. Acceptable while Stripe is test-mode and no purchase has settled,
but it is an economy change.

**Constitutional grounding:** §8.6a names *"PASS reward"* and *"salvage"* as
escalation substrates. PASS reward is named as an existing substrate and **has
never existed in code** — `portalsPassed`, `passCount`, `portalCount`,
`exitCount`, `passesUsed` all return zero hits.

#### The blocker, verified

**Portal intervals are rolled from unseeded `Math.random`.**
`SnakeGameLogic.ts` — `this.rng = options.rng ?? Math.random` — and
`game/page.tsx` supplies a seeded stream **only for challenge runs**. So the
server cannot replay the portal schedule and cannot know how many portals were
passed.

Fix: seed the portal roll from the existing `runSeed` using the shipped
`mulberry32(fnv1a(...))` pattern **with a domain prefix** (e.g.
`portal:${runSeed}:${index}`). The gene-offer stream already does exactly this;
the Signal/Serpent Monday key collision is the precedent for why domain
separation is mandatory rather than merely tidy. Then:

```
portalsPassed = portalsEncountered − infuses − (extracted ? 1 : 0)
```

needs **no new client claim at all**.

#### Two different things are called PASS

Do not conflate them:

1. **Gene-offer PASS** ("take neither") — already implemented end to end, and
   already server-replayable via `verifyOfferTrace` (`picked: null`). This is
   what `REDESIGN_WAVE.md` §3's WP-3.05 describes.
2. **Portal PASS** (decline to bank) — the carry the owner ruled on above. This
   is the one with the seeding blocker.

### 3.2 The snake's appearance — three passes

**Pass 1 — head zone is a creature, the trail is what it leaves behind.**
Head zone (~first 5 segments) expressive and animated; the middle a simplified
continuous form, Tetris's settled stack — unambiguous about blocked tiles,
quieter than the head, but **not lower contrast**. Tail zone encodes
**imminent vacancy**, denominated in TICKS-until-vacancy, not segment count.

**Pass 2 — fusion is EARNED, not positional** (owner's idea, and the keystone).
Per body cell, count orthogonal neighbours that are occupied but are NOT its two
path neighbours: 0 = running free (discrete voxels, visible gaps), 1 = fusing at
the edges, 2 = fully fused and brightest. **Walls and terrain count** as packing
neighbours — otherwise the metric rewards coiling in open space, which is bad
play. **Needs hysteresis** or it flickers at 5–10 Hz.

This makes the visual a **readout of wasted space**: a cell left behind and now
unfillable shows as a dark seam in an otherwise solid field. It also settles the
terrain-confusion problem on the strongest axis — terrain never moves again, the
coil responds to how you are playing.

**Pass 3 — why coiling deserves the reward, stated precisely.**
Coiling does **not** change the number of spawnable cells: free space is
`n² − L` for any shape. It changes their **geometry** — one large contiguous
reachable region with short direct paths, versus the same count shredded into
corridors, slivers and sealed pockets.

**Line not to cross:** do not shade the free region or show the largest
contiguous open area. Feedback on how well *you* packed builds intuition;
showing where the safe space is replaces it.

#### Implementation, scout-verified

Keep the single `InstancedMesh`; emit one instance per **joint** using the
per-instance quaternion (currently a hardcoded identity) and non-uniform scale
(currently uniform) — both free and unused. Plus a cap instance at interior
corners. No new draw call, no allocation, no React work; 400 instances are
preallocated. ~40–60 lines in the existing loop at `InstancedSnake.tsx:199-209`.

- **Never snap the middle to the grid** — 5–10 Hz is the worst flicker band, and
  the head/trail junction would gap a full cell per tick.
- Because the engine unshifts and pops, `curr[i] === prev[i-1]`: straight runs
  are exactly 1.0 apart at every interpolation alpha and tile seamlessly;
  corners compress to 0.707 mid-tick, giving an outer notch. Joint links plus
  caps solve it exactly.
- **Guard the COSMIC wrap seam** or an unguarded join draws a bar across the
  arena. Idiom exists at `SnakeGameLogic.ts:2918-2925`.
- Do not buy "quiet" with brightness — `getSegmentEnergy` already dims the
  middle (`ENERGY_MIN = 0.55`, which also makes the cells about to free up the
  hardest to see, backwards on gameplay grounds). Take it from height and
  emissive. Flattening forfeits the cast shadow, a real occupancy cue.

### 3.3 In-run growth readout

**Superseded by the 2026-07-29 owner ruling.** Growth is event information, not
permanent telemetry. It is absent from setup and the HUD. A transparent,
non-blocking typographic notice appears after the opening movement and whenever
the stage changes; CYBER speed tiers use the same mechanism. It auto-dismisses,
takes no input, never pauses the tick, and reads the shared growth/speed rules
rather than copying either curve into UI code.

### 3.4 One food

*"What I certainly don't like are the 3 foods on the screen."* Ruled. Not yet
shipped — see §4.

---

## §4 The food-placement regression — RESOLVED, and the diagnosis was wrong five times

Shipped as **WP-3.06** in `55b0f2c`. The parked branch is gone.

**The design was right. The implementation was not too slow to ship — the test
HARNESS was, and the shipped game was never affected at all.**

The instruction below ("PROFILE, do not guess a fifth time") was followed, and
it overturned the section's own conclusion. The measurement, before touching
anything:

| board | rng | ms per call |
|---|---|---|
| 20x20 | constant | 0.0352 |
| 20x20 | random | 0.0012 |
| **400x400** | **constant** | **12.9019** |
| 400x400 | random | 0.0007 |

Two facts all four earlier guesses missed:

1. **`gridSize` is 20 — 400 cells.** `foldParity.test.ts` sets `GRID = 400`,
   i.e. **160,000 cells**, to keep its length arithmetic clear of walls. The
   regression was 400x, not 32x, and it lived entirely inside a harness.
2. **The fast path never survived that harness.** `foldParity` injects
   `rng: () => 0.5`. A placer that sampled the whole board and *then* rejected
   on radius drew the same cell 24 times and fell through to a full flood fill
   on every spawn. Gating on occupancy alone and on attempt-exhaustion alone
   were each **half** of the trigger — which is why fixes 3 and 4 both failed.

The fix was three changes, not a gate: sample **inside** the legal window
(clamped to the board, so the radius can never reject a draw); make the exact
path **expand** a window around the head rather than sweep the board; and
**allocate nothing** (module-level scratch with a generation stamp, and the
occupancy grid built once per WAVE rather than once per food).

`foldParity` is back to **10.6s**. The pathological path costs 40ms per 1000
calls where the parked version needed ~13,000ms, and a cost-bound test now pins
it — the assertion whose absence let a 400x regression ship and then be
misdiagnosed four times.

**The red test was right about a real bug.** *"returns the ONLY free cell when
exactly one remains"* failed because both flood fills seeded from the head's
*neighbours* but nothing stopped the BFS walking back into the head's own cell.
In the engine the head is always in the blocked grid, so it surfaced only on a
board blocked down to two cells.

The historical record of the four wrong diagnoses is kept below, because the
pattern is the lesson.

---

### The state as it was recorded before the measurement

One food per profile, and a placer (`foodPlacement.ts`) that enumerates free
cells instead of rejection-sampling — which fixes a genuine shipped bug where
`sampleFoodCell` tried 1000 random cells and then **returned its last guess
whatever it was**, potentially on top of the snake. Unobservable at the 8%
occupancy the game has always had; reachable once this wave drives runs toward a
full board.

**The cost:** `foldParity.test.ts` went from **11s to ~356s** (32×). CI's `test`
job runs `--coverage --runInBand` and was **cancelled at the 15-minute
timeout** — it was never an assertion failure.

**Bisect is conclusive:** 11s at the cadence commit, 11s at the terrain commit,
356s at the food commit. Restoring `simultaneousFoods: 3` made it *worse*, so
the cost scales with placer calls per spawn.

**Root constraint:** reachability is Ω(free cells) — you cannot know a cell is
reachable without walking there — and the engine spawns a wave per eaten food.
`foldParity` runs roughly 20,000 spawns. The shipped sampler was ~3 operations.

### Four fixes attempted, none landed

Every one was diagnosed by reasoning about the code rather than measuring it,
and every one was wrong. Recorded so they are not retried:

1. **Removed an O(gridSize² × terrain) probe loop** in `sampleFoodCell` (it
   called `isPositionOnTerrain`, a scan, for every cell). Real waste, not the
   cause.
2. **Replaced template-literal `Set` keys with an integer `Uint8Array` grid.**
   Real waste — roughly four million string allocations across the sweep — not
   the cause.
3. **Occupancy threshold for the exact path.** Wrong trigger: a baseline
   100-food run sits at ~26% occupancy, so the gate opened almost immediately.
4. **Sample-first with attempt-exhaustion as the trigger.** Still 359s.

One test on that branch is still red: *"returns the ONLY free cell when exactly
one remains"*.

### Requirement on the rewrite: food count must stay a dial

Owner instruction, 2026-07-28: *"the food placement module should allow for
different food counts, as we might need to adjust that in the future and I don't
want to have such huge and long tasks resulting from it."*

So `simultaneousFoods` must remain a **cheap configuration change**, never a
rewrite. Concretely, the module and its callers must handle N ≥ 1 without
special-casing N = 1:

- The placer takes the already-placed cells and excludes them, so a wave of N is
  N calls with no branch on the count.
- COSMIC's constellation group and the Splitter / Starweaver bonuses already add
  to the count independently of the profile — anything that assumes exactly one
  food is a latent bug (`applyMagnetPulse` spreading `foods[0]` is one; the
  single-food `DynamicLights` spotlight is another).
- The validator's food-rate bound already scales by `simultaneousFoods` via the
  stamped profile. Keep that coupling — it is what stops a raised count from
  flagging honest runs.
- Whatever performance fix lands, it must not be one that only works because
  there is a single food. If the answer is caching, the cache has to survive N
  placements within one wave.

A future rung, a dynasty, or a weekly clause may want a different count. The
owner should be able to change one number.

**To be unambiguous: the target for THIS wave is one food on CYBER and PRIMAL.**
`simultaneousFoods: 1` on all three growth profiles. The requirement above is
about keeping the count cheap to change later — it is not a reason to leave it
at three now, and not a reason to build a configuration surface nobody asked
for. One food ships; N stays easy.

#### COSMIC KEEPS MULTIPLE FOODS — owner-confirmed

> **Superseded in its detail by WP-3.13, and CONFIRMED in its conclusion.**
> COSMIC still does not read `simultaneousFoods`, and its wave is still bigger
> than one — but it is five SCATTERED stars on a calcification window rather
> than a clustered group of three feeding a combo. The warning below was
> right about the thing that mattered: collapsing the wave to one food deletes
> a dynasty. Read the rest as history.

COSMIC does not read `simultaneousFoods` at all, and must not start.
`COSMIC_CONSTELLATION` places a **group of 3** (`groupSize: 3`, `glyphCount: 3`,
`groupRadius: 4`); the combo chain is built by collecting that group in sequence
inside a timing window, and Starweaver (COSMIC M3) adds a fourth. **The group IS
the combo mechanic** — reduce it to one food and COSMIC has no combo.

Owner confirmed 2026-07-28: *"we have combos on the cosmic, right? … so we need
multiple foods there, just to make sure."*

So the engine must keep reading `constellation.groupSize` ahead of the profile,
exactly as it does today, and the placer's `anchor` parameter exists precisely
to keep that group clustered and chaseable. **A rewrite that collapses the wave
to one food unconditionally silently deletes a dynasty's identity** — this is
the single most likely way to get the food work wrong.

Two ride-along consequences of multi-food that are currently broken and belong
with this work: `DynamicLights` spotlights only `foods[0]`, so COSMIC's other
glyphs are unlit, and `applyMagnetPulse` spreads `this.state.foods[0]` without a
guard, so it corrupts a `Position` when the wave is empty.

**SETTLED by WP-3.13, deliberately and not by inertia.** The owner's ruling
that the combos are not fun — *"it's not really fun to get the combos, it's
just boring, has no thrill factor"* — was taken at face value: the chain rule
is deleted, not reshaped, and the group was reconsidered here as this note
asked. It went 3 → 5, and the size is now load-bearing rather than arbitrary,
because a constellation must be bigger than its window allows or nothing is
ever abandoned.

The server note that stood here is discharged: there is no COSMIC claim left to
clamp. `COSMIC_TRUST_MAX_BONUS_RATIO`, `sanitizeCosmicClaim`, the `cosmic`
field on the validator input and result, `crownAllowed` in the run context and
`crownHeld` in the claim caps are all deleted, and
`scripts/verify-constitution.mjs` inverted with them — it used to pin the
clamp's SHAPE and now forbids a clamp existing at all.

### Next step: PROFILE, do not guess a fifth time — DONE, see the top of §4

This instruction was the right one and it worked. Recorded here as written,
because the habit it names is worth more than the bug it solved.

The unchecked assumption it flagged — that `spawnFoods` is called once per
eaten food — turned out to be **false in the other direction**: `spawnFoods`
fires only when the wave is EMPTY, so three foods meant one spawn per three
eats and moving to one food tripled the spawn count. That was never the cost
either. The cost was the board size and a degenerate rng.

---

## §5 Findings recorded, not fixed

### §5.1 THE YIELD CURVES HAVE NEVER BEEN BALANCED AGAINST EACH OTHER — owner ruling owed

**This predates the Redesign Wave entirely. Nothing in this wave introduced it,
and nothing in this wave is what you would change to fix it.** It was found
while closing COSMIC's Yield gap (WP-3.13) only because that was the first time
anyone went looking for the Yield equivalent of WP-3.08's Score discipline, and
discovered there isn't one.

Cumulative DNA at the **48-food terminus**, from the shipped `foodDnaValue`
functions:

| Dynasty | Yield at 48 | vs the lowest |
|---|---|---|
| **PRIMAL** | 705 | — |
| **COSMIC** | 931 | 1.32x |
| **CYBER** | 1210 | **1.72x** |

*(COSMIC's 931 is post-WP-3.13. It was 480 before, and the spread was 2.52x —
but even removing COSMIC entirely, PRIMAL and CYBER sit 1.72x apart on their
own, and always have.)*

**Why this is not obviously a bug.** WP-3.08 held the three SCORE curves to
+/-10% at the terminus, and that was correct and deliberate: Score is the
ranked number, so a dynasty that out-scores the others makes the leaderboard
measure dynasty choice rather than skill (Constitution §6.1, Inviolable Rule 2).
Yield is the ECONOMY, not the ranking, and run LENGTH compensates for the
spread — CYBER runs are short and fast, PRIMAL's are long — so the five
archetypes in `genome.balance.test.ts` do all land within +/-15% of target
despite it. It may be exactly right.

**Why it still needs a ruling.** It has never been *stated* as a decision, or
tested as one. There is no Yield analogue of `score.curves.test.ts`: nothing
anywhere asserts what the spread should be, so nobody can tell an intended 1.72x
from a drifted one, and the next dynasty-tuning package will face the same
question with the same absence of an answer. The archetype gate catches the
composite outcome, not the curve.

**The question for the owner, in one line:** *should a dynasty's DNA per food
be comparable to the others at a fixed food count, or is compensating through
run length the intended design?* Either answer is cheap to encode; not
answering is what costs.

Recorded 2026-07-28. See §6 item 10.


- ~~**COSMIC always places 3 foods**~~ — RULED and shipped in WP-3.13. The
  constellation is now **five scattered stars** on a window, and the count is
  the mechanic rather than a leftover: it must exceed what the window allows or
  nothing is ever abandoned and nothing ever calcifies.
- ~~**COSMIC Singularity's food pull is not implemented.**~~ — FIXED in
  WP-3.13. `singularityPullRadius` now has a call site
  (`applySingularityPull`), fired at the same food index the flat DNA is paid
  on. It was chosen over deleting the promise because the player was already
  being paid for the event, and `genome.ts`'s own comment ("+10 flat per pull
  event") described a fiction otherwise.
- ~~**COSMIC's Yield is ~2.4x short of its design target.**~~ — RAISED and
  CLOSED inside WP-3.13, after the deferral was overruled. The reason for
  overruling it is worth keeping, because it generalises: this wave's mandate
  is that **everything lands before a single playtest**, and a dynasty paying a
  third of parity cannot produce a usable playtest signal. Deferring a decision
  to the playtest only works if the playtest can answer it.
  `foodDnaValue` is now `round(10 x min(3, 1 + 0.04(n-1)))` — double PRIMAL's
  compounding slope to CYBER's x3 ceiling, reached at food 51 rather than food
  20. The archetype lands at **-3.5%** of target (re-measured after the
  Fortress merge, which reshaped the claim surface; it was -2.4% before) and
  `genome.balance.test.ts` gates all five with no exemptions.

  **Closing it surfaced something bigger, which is NOT COSMIC's and not this
  wave's — see §5.1.**
- **`normalizeDynastyName` fell back to COSMIC as "the conservative payout
  floor"**, and WP-3.13's Yield re-base made that false. It now falls back to
  PRIMAL, which is the floor at every horizon a run reaches. The fallback is
  defensive only — every write path stamps one of the three names — so it fires
  on malformed or legacy rows (the deprecated EMBER/CRYSTAL/VOID trio) and
  nothing else.
- **Only `foods[0]` is spotlit** — `DynamicLights` takes a single position, so
  extra foods are unlit.
- **`applyMagnetPulse` crashes on an empty `foods`** — spreads
  `this.state.foods[0]` when undefined.
- **The e2e production leg is `continue-on-error`** with known failures in
  `auth.spec.ts`, `engagement.spec.ts` and `run-flow.spec.ts`. All are 60-second
  **timeouts**, and which specs get reached varies run to run, so the exact list
  differs between PRs. Pre-existing; repairing them and making the leg blocking
  is still owed.

---

## §6 Still owed by the wave

**Every build item below is done, and all nine are in production.** The list is
kept struck-through rather than deleted because several entries record *how* the
thing was settled, and that reasoning is the part a future session needs.

Items 6-8 went un-struck for a day after they shipped, and the doc therefore
read as though a third of the wave was outstanding. Recorded because this file
IS the handoff: a stale status line here is not cosmetic, it is the artifact
lying to whoever reads it next.

What remains is in §6a, and none of it is a build item.

1. ~~**Food placement** (§4) — profile first.~~ Shipped as **WP-3.06**. The
   profiling instruction was followed and it overturned the diagnosis — see §4.
2. ~~**The carry**, after the portal-seeding fix (§3.1).~~ Shipped as
   **WP-3.10**. The seeding turned out to be a harder blocker than §3.1
   assumed: the schedule also had to stop depending on when a portal
   *resolved*, which is tick timing no settlement can reconstruct.
3. ~~**The trail** (§3.2).~~ Shipped as **WP-3.07**.
4. ~~**In-run growth readout** (§3.3).~~ Shipped as **WP-3.09**. Note the
   readout §3.3 asked for did not exist at all — WP-3.03's shipped one was
   pre-run only and unmounted the moment a run started.
5. ~~**COSMIC** — permanent torus, calcifying stars, delete `COSMIC_FLUX`.~~
   Shipped as **WP-3.13**, and it settled the combo: `DYNASTY_COSMIC.md` §5
   lists the chain rule and `comboCap` for deletion, and §2.3 retires glyphs to
   pure decoration. What replaced the combo as COSMIC's decision is which star
   you abandon and therefore where its corpse lands. The consequences worth
   knowing: COSMIC now claims NOTHING the server cannot recompute (the bounded
   -trust clamp, `COSMIC_TRUST_MAX_BONUS_RATIO` and the Constellation Crown's
   permission to raise it are all gone), three genes were re-authored rather
   than orphaned, and the Yield gap above is open.
6. ~~**PRIMAL** — Fortress replacing FERAL-2 Molt, tempo 200 → ~170-180ms.~~
   Shipped as **WP-3.11** (Fortress) and **WP-3.08** (tempo, `PRIMAL_SPEED_MS
   = 175` — its own constant, because `GAME_CONFIG.snake.initialSpeed` is also
   CYBER's curve numerator). Fortress found that WP-3.01 never actually
   quarantined Molt: a Rule 15 violation had been shipping since 2026-07-27.
7. ~~**D3** — per-dynasty score curves with comparable integrals.~~ Shipped as
   **WP-3.08**. PRIMAL back-loaded, CYBER a front-loaded tent, COSMIC
   mid-weighted; integrals 73.5 / 73.5 / 72.0 over n=1..48, a 2.08% spread
   against the ±10% tolerance, with a second test pinning that the three curves
   actually DIFFER so equal integrals cannot be met by three copies of one
   curve.
8. ~~**D2 ladder**~~ — the plan called this WP-3.10; it shipped as **WP-3.12**,
   because WP-3.10 was taken by the carry (see §0). Eight rungs, migration 057,
   and it found that the Rule 6 gate was blind to every snake_case column it
   was meant to protect.
9. ~~**Repair the legacy flag-on e2e specs** and make the production leg
   blocking.~~ Shipped with part 2 (`8d5f42e`); the production leg passes and
   **blocks** now, with `GROWTH_LAB_V1` and `LADDER_V1` armed. A red production
   leg is a real signal from here on, not the known-noise it used to be.
10. **An owner ruling on the Yield spread** (§5.1). Not a build item — a
    question only the owner can answer, and the answer decides whether a Yield
    parity gate gets written at all.

**D1 was ruled on 2026-07-29.** See the decision record at the top. Tuned and
Aggressive remain valid only for historical stamped sessions and explicit
ladder diagnostics; neither is selectable for a new normal run.

---

## §6a What is actually left

### Historical owner-only release steps

Flag state exists **only in the Vercel dashboard**, is build-time inlined, and
is unreadable from a dev session (`VERCEL_TOKEN` is a GitHub Actions secret).
A flip is inert until `deploy-production.yml` is re-dispatched, so the order is
**set the flags, THEN deploy** — the other order ships the wave dark and wastes
the release.

1. Set **`NEXT_PUBLIC_LADDER_V1=true`**. Without it WP-3.12 ships dark and
   cannot be played. (Safe, just useless: an unstamped rung resolves to Ground
   on both sides.) Note CI already arms it, so the e2e leg is deliberately one
   flag ahead of production until this is done.
2. ~~Confirm `NEXT_PUBLIC_GROWTH_LAB_V1=true` for the D1 instrument.~~ Completed
   for the historical playtest; the selector and flag code are now retired.

### Owner decisions, none of them taken here

3. **The carry raises shallow-end DNA.** Salvage at zero passed doors is 1.0,
   up from 0.6 — dying before you have declined anything now costs nothing.
   That is §3.1's ruling as written, but it is an economy change.
4. **The leaderboard epoch.** The new per-dynasty Score curves make existing
   board entries incomparable. `src/lib/leaderboard/eligibility.ts` instructs
   bumping `LEADERBOARD_CONTENT_VERSION`, which retires every existing entry.
   This is WP-3.04's epoch-vs-wipe call, deliberately not taken inside a curve
   change.
5. **The Yield spread** (§5.1). Predates this wave; the answer decides whether
   a Yield parity gate is written at all.

### Done

6. ~~**Deploy.**~~ Released 2026-07-28. The owner set `NEXT_PUBLIC_LADDER_V1`
   in Vercel first — flags are build-time inlined, so setting them after a
   deploy does nothing — and the dry-run named exactly `057_player_ladders.sql`.
   Four defect fixes followed from the first playtest (§8).
7. ~~**Play it, and rule D1.**~~ Ruled 2026-07-29; see the top decision record.

---

## §7 Operating constraints

### Test execution — this crashed the machine once

A prior session crashed the development machine by leaving **five concurrent
full `npm test` runs** in the background. 8 cores, jest defaulting to ~7 workers
each, ~35 workers competing; the 15-minute load average reached 13.04.

**Run at most one suite at a time, with `--maxWorkers=3`.** Use targeted
`npx jest <path>` while iterating and save the full run for immediately before a
commit. A full constrained run takes ~49 minutes; CI's `--runInBand --coverage`
run must finish inside **15 minutes** or the job is cancelled.

## §8 The first playtest — four defects, and the same mistake three more times

Everything below was found by the owner playing, within an hour of the release.

**The trail z-fought the floor.** `ArenaFloor`'s platform is a 0.1-tall slab
centred at -0.05, so its top face is at exactly **y = 0**, and the trail drew
every cube base-on-floor spanning `[0, height]`. Two coplanar surfaces at
identical depth over the cube's whole footprint: horizontal bands across the
lower part of every face.

I diagnosed it twice from reading geometry and shipped both. First coplanar
link tops (inset the link — changed the render, fixed nothing). Then the joint
links themselves (deleted them — justified by a control render taken at a zoom
where this banding was invisible). **The owner found it**: *"to me it looks
like the cubes are cut by the floor - maybe your z positioning is center and
not bottom."*

The clue I had and did not use was theirs too: *"going east-west it's not
flickering, going north-south it is."* A direction-dependent artifact means a
conflict with a FIXED plane — moving along Z changes the depth slope against
that plane, moving along X leaves it constant. That points away from the snake
and at the floor, and it would have saved two deploys.

`FLOOR_CLEARANCE` now lifts anything standing on the platform. **Terrain had
the identical bug** — solid blocks span `[0, 0.62]` — and nobody had seen it
because terrain has still never been visually verified.

**Food was placed where it could not be survived.** Two separate causes:

- *Reachability was best-effort.* The placer only checked it once random
  sampling exhausted, which on a sparse board never happens. The justification
  was that a pocket sealed by your own BODY is transient. Terrain voids that —
  Rule 15 forbids removing a block, so a terrain-sealed pocket is permanent.
  Now checked on every placement, bounded to 33x33 so it is exact on the
  shipped board and cannot revive the 400x cost of §4.
- *Food baited the closing ring.* The arena is not unfair on its own: a block
  telegraphs for two seconds and only turns lethal once the cell is clear, so
  entering the ring is a choice. Food is not a choice. Placing it inside the
  closing front is the difference between a hazard and a trap. The active ring
  is now excluded from placement; the schedule closes at the same rate.

**Reachable is not survivable**, and the owner had to correct me mid-fix:
*"that food was reachable, but you couldn't get out alive - there was no escape
path."* A region-size check was added, and its limits are stated in the code
rather than implied: it catches food stranded in a board-fragment or placed
when the snake is already boxed in, and it does NOT prove survivability in
general, because a pocket with a mouth measures as part of the whole open
region even though the body may seal that mouth behind it.

Two latent bugs fell out of the work: the placer's last-resort sweep could
return the head's own cell (never fired in-game, because the engine always
blocks it — the same shape as the original placer's latent bug), and the joint
links are gone for good.

### Watch this

`foldParity.test.ts` now runs ~100s locally against an ~11s baseline, from the
Fortress and COSMIC additions. Comfortably inside CI's 15-minute budget, so it
is not urgent — but it is the suite that blew that budget once already, and the
number is written here so the next person notices before CI does.

---

### Method

The two most expensive mistakes in this wave were the same mistake twice:
**asserting the model instead of the connection** (terrain shipped lethal and
invisible under a fully green suite), and **reasoning about performance instead
of measuring it** (food placement, four wrong diagnoses in a row; the bisect that
identified the commit took two minutes and was run fourth).

When something is slow, profile it. When something is wired, assert the wire.

The playtest added a third, and it is the same shape: **when something looks
wrong, isolate one variable and look at it.** Three graphics diagnoses were
made by reading geometry and two of them were wrong; the control render that
settled it took two minutes. A render CHANGING is not a render being RIGHT,
which is the specific trap I fell into.
