# Redesign Wave — current state and handoff

Companion to `REDESIGN_WAVE.md`, which is the PLAN. This file is the STATE:
what has shipped, what was ruled since the plan was written, and what a fresh
session needs in order to continue without reconstructing any of it.

Last updated 2026-07-28.

---

## THE MANDATE — owner instruction, 2026-07-28

**Build out the entire remaining wave, including every refinement recorded here,
before the next playtest.** The owner's words: *"it only makes sense to test the
full product when it's done, not parts of it."*

So do NOT ship the remaining items one at a time and ask for a playtest between
each. Everything in §6 lands, then the owner plays the complete design once.

This has direct consequences for how to work:

- **D1 cannot be ruled until then**, and neither can anything downstream of it.
  Do not ask the owner to judge time-to-first-pressure on a partial build.
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
context: **in code comments, WP-3.05 means PR #18's work.** The planned
PASS-pays package is called **the carry** throughout this document and needs a
fresh number when it is scheduled.

---

## §1 What has shipped to production

| Deploy | Contents |
|---|---|
| `91cebb0` (PR #16) | WP-3.03 — CYBER's closing arena, growth readout |
| `b2f0c92` (PR #17) | Readout fix, CYBER 100ms tick floor, 18s extraction window |
| `741699f` (PR #18) | Terrain renderer, arena re-armed, offer cadence wired, INFUSE sign fix |

`NEXT_PUBLIC_GROWTH_LAB_V1` is **on** in production, confirmed by the selector
rendering.

**Verify the PR #18 deploy completed** — `gh run list --workflow=deploy-production.yml
--limit 3` — before assuming production has the terrain renderer. It was still
`in_progress` when this document was written.

### Open PRs

- **#19** — this document. Docs only.

### Parked branches

- **`wp/3-06-food-placement`** — one food + the new placer. See §4. Does not sit
  on a green suite; carries a deliberately-labelled WIP commit.
- `wp/3-05-cadence-and-food`, `wp/3-03-arena-and-readout` — merged, safe to
  delete.

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

**NEVER VISUALLY VERIFIED.** `TerrainBlocks.tsx` is structurally tested but no
human has looked at it. Block height, decal fill rate and the slate against the
floor are unverified judgement calls. Get the owner's eyes on it early.

---

## §3 Owner rulings since the plan was written

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

The current growth rate must be visible **during** play, plus a transient notice
when the step changes. Rule 1 boundary: a passive readout does not intrude, but
the notice must be non-blocking, auto-dismissing, take no input, and never
swallow a steering input or pause the tick. Must read
`baseGrowthForFood(profile, n)` — never a second copy of the curve.

### 3.4 One food

*"What I certainly don't like are the 3 foods on the screen."* Ruled. Not yet
shipped — see §4.

---

## §4 The food-placement regression — UNRESOLVED, and how to resume

Branch: **`wp/3-06-food-placement`** (commits `dade2b6` + `0e87413`).

**The design is right; the implementation is too slow to ship.**

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

### Next step: PROFILE, do not guess a fifth time

Add a call counter and a timer around `sampleFoodCell`, or run node with
`--prof`, and find where the time actually goes before changing anything.

**Verify one assumption that has never been checked:** that `spawnFoods` /
`sampleFoodCell` is called once per eaten food. A 32× gap is hard to explain
from ~400 operations per spawn, which suggests it may be called far more often
than assumed. Start there.

---

## §5 Findings recorded, not fixed

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
- **COSMIC's Yield is ~2.4x short of its design target.** Raised by WP-3.13 and
  deliberately NOT closed there. The balance harness modelled the deleted combo
  as a flat x2.4 over a whole run — itself fiction, since the cap needed a chain
  of 8 a wave of 3 could not produce — and without it the COSMIC archetype pays
  2077 against a 5400 target, roughly a third of the other four. `foodDnaValue`
  is still a flat 10. `genome.balance.test.ts` records the number exactly under
  `openYieldGap` so it cannot drift. Closing it is a Yield decision (D3 owns the
  Score half only) and wants the owner's playtest first.
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

1. **Food placement** (§4) — profile first.
2. **The carry**, after the portal-seeding fix (§3.1). Needs a WP number.
3. **The trail** (§3.2). Unblocked — terrain's visual language is settled.
4. **In-run growth readout** (§3.3).
5. ~~**COSMIC** — permanent torus, calcifying stars, delete `COSMIC_FLUX`.~~
   Shipped as **WP-3.13**, and it settled the combo: `DYNASTY_COSMIC.md` §5
   lists the chain rule and `comboCap` for deletion, and §2.3 retires glyphs to
   pure decoration. What replaced the combo as COSMIC's decision is which star
   you abandon and therefore where its corpse lands. The consequences worth
   knowing: COSMIC now claims NOTHING the server cannot recompute (the bounded
   -trust clamp, `COSMIC_TRUST_MAX_BONUS_RATIO` and the Constellation Crown's
   permission to raise it are all gone), three genes were re-authored rather
   than orphaned, and the Yield gap above is open.
6. **PRIMAL** — Fortress replacing FERAL-2 Molt, tempo 200 → ~170-180ms.
7. **D3** — per-dynasty score curves with comparable integrals.
8. **D2 ladder** (WP-3.10).
9. **Repair the legacy flag-on e2e specs** and make the production leg blocking.

**D1 remains unruled.** The owner must play the complete design before judging
time-to-first-pressure. Their earlier Tuned-over-Aggressive preference is
explicitly **stale** — food count is upstream of segments-per-food, traverse
time, offer cadence and run length, so the profiles must be re-derived by play.

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

### Method

The two most expensive mistakes in this wave were the same mistake twice:
**asserting the model instead of the connection** (terrain shipped lethal and
invisible under a fully green suite), and **reasoning about performance instead
of measuring it** (food placement, four wrong diagnoses in a row; the bisect that
identified the commit took two minutes and was run fourth).

When something is slow, profile it. When something is wired, assert the wire.
