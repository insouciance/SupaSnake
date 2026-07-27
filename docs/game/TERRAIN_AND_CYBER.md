# Terrain, and the CYBER ruleset

**Status: SPEC, from the owner's playtest of 2026-07-27.** Feeds WP-3.02 (the
lab) and WP-3.04 (dynasty curves) in `docs/ops/REDESIGN_WAVE.md`. Not scope until
those WPs are claimed.

Two things, in one document because the second is the first's first consumer.

---

## Part 1 — The terrain primitive

**A block is an occupied, lethal cell.** That is the whole idea. It is not a
hazard system, an entity, or a mode: it is a cell that behaves like wall.

**Why one primitive and not three mechanics** (Rule 12 asks what existing system
could not do the job): nothing in the engine can currently occupy a cell
lethally — the board holds food, extra foods, molt foods, exit portals, the
mutation helix and gilded cells, and **none of them is lethal**. So this is
genuinely new. But it is *one* new thing, and it replaces three separately
proposed mechanics:

| Consumer | Uses blocks for |
|---|---|
| **CYBER** (Part 2) | the arena hardens from the outside in |
| **PRIMAL / FERAL-2** | the shed rewrite — your tail petrifies instead of vanishing (kill-list row 26) |
| **The ladder** (§8.6a) | a rung can start the run with a ring already placed |

A shrinking *board* was considered first and rejected: it changes grid geometry,
which threads through food placement, portal placement, the camera and every
collision bound — and it removes cells the player can already see, so it cannot
create the "get out of the outer lane, now" pressure that a block forming
*under* you can.

### 1.1 Lifecycle

Two states, and the first is the design:

1. **Forming** — visible, animating, **non-lethal**. The snake may occupy and
   pass through it. Duration [H: ~2 s, expressed in *seconds* and converted by
   the live tick — see §2.3 for why ticks are the wrong unit].
2. **Solid** — lethal on head contact, permanent.

The forming phase is not a courtesy. It is what makes the mechanic a *positioning
problem* rather than a random death, and it is the owner's own telegraph idea
(from the earlier speed-burst sketch) applied to the arena.

### 1.2 Determinism — the shippability constraint

**Block placement must be replayable server-side or this cannot ship.**

- **Cadence is food-indexed**, never time-indexed: *K blocks every M foods*. Food
  index is already the spine of every replay (`run_events` stamps `{e:'f', n, t}`;
  `verifyOfferTrace` replays from food counts).
- **Cell choice is seeded** from `run_seed` — the same injectable-rng discipline
  `sampleFoodCell` already follows (*"a seeded run must lay out identical food
  waves on every replay"*). Never `Math.random()`.
- The server derives the block set for food *n* independently and identically.

### 1.3 Rules

- **Blocks are added, never removed.** No gene, tier, splice, revive, or ladder
  rung may clear one. Clearing terrain would be `shed` reinvented with extra
  steps, and it is a Rule 15 violation — free space would grow.
- **Food and portals never spawn on a block.** `sampleFoodCell` already rejects
  occupied cells; blocks join that predicate.
- **A forming block may appear under the snake.** That is the interesting case,
  and §4 lists it as the open ruling.

---

## Part 2 — CYBER

### 2.1 What the playtest established

All from the owner's session of 2026-07-27, and all of it new information:

| Finding | Evidence |
|---|---|
| **Speed stops being fun at ~95–100 ms** | owner at score 880 = food 37 = **94 ms**: *"approaching what is a sensible terminal speed"*; at score 800 = food 35 = **97 ms**: *"speed ends being fun"*; at 1150 = food 46 = **84 ms**: *"way too fast"* |
| Independent agreement | the Canabalt-derived bound for a grid game is **~100–120 ms** (visible runway ≥ 3× simple reaction time ~190 ms) |
| **Past the floor, speed destroys travel efficiency** | on the banked run, ticks-per-food went **18 → 113** between the first and last ten foods — on a board that was 86% empty. You can no longer take the short line. |
| **The board has never been CYBER's difficulty** | banked run ended at **13.5%** occupancy; all-time CYBER ceiling is **21.8%** against PRIMAL's 45.8% |
| CYBER dies to *walls*, the others to *themselves* | wall 11 / self 9 on CYBER; self 11 / wall 6 on COSMIC; 7/7 on PRIMAL |
| **The extraction window is denominated in the wrong unit** | `despawnTicks: 90` is shared by all three dynasties, so the window is **18.0 s** on PRIMAL and **4.5 s** at CYBER's floor |

The last one is a structural bug, not tuning: food has no deadline, so eating
stays possible exactly as banking becomes impossible. The central mechanic of the
game is inoperative on CYBER at both ends — earlier analysis showed BANK is never
mathematically correct at the first portal, and now we know it is barely reachable
at the last.

### 2.2 The ruleset

**Tick.** Keep the hyperbolic decay, **floor at ~100 ms [H]** instead of 50.
Under the shipped curve 100 ms arrives at food 33 and the remaining 65 foods run
below playable — roughly two thirds of the speed curve is dead. Re-shape so the
floor is reached near the *terminus* (food ~30 under the new pacing), not a third
of the way in.

**Arena.** **6 blocks every 5 foods [H]**, filling the outermost free ring. The
outer ring is 76 cells (19% of the board), so it completes around food 65 — which
lands on the terminus. A second ring is a ladder rung, not base content.

**Growth.** The accelerating curve shared with the lab profiles (+6 for foods
1–11, +2 through 31, then +1 per 6 to a cap of 8 [H]).

Combined projection:

```
  food 10:  len  63 +  12 blocks =  19%   <- pressure begins
  food 20:  len  87 +  24 blocks =  28%
  food 30:  len 107 +  36 blocks =  36%
  food 40:  len 130 +  48 blocks =  45%
  food 50:  len 168 +  60 blocks =  57%
  food 60:  len 223 +  72 blocks =  74%
  food 70:                          95%   <- terminus
```

Terminus around food 65–70, in roughly **3 to 3½ minutes** — faster in wall-clock
than the owner's 51-food, 4:10 banked run, because the closing arena also shortens
every traverse. **That is the point:** the block schedule is simultaneously the
difficulty source and the cure for the efficiency collapse measured in §2.1.

**Score.** Front-loaded shape per D3 (§6.1), integral within ±10% of PRIMAL's and
COSMIC's at the terminus.

### 2.3 Extraction — CYBER gets its own config

`EXTRACTION_DEFAULTS` (`rulesets.ts:110-116`) is shared by all three dynasties and
denominates the portal window in **ticks**. Fix the unit, not the number:

> **The window is authored in seconds and converted by the live tick.**

Target ~14–18 s of real time, matching PRIMAL. Authoring in seconds means the
window cannot silently rot when WP-3.04 re-tunes the speed curve — which is
exactly how it rotted in the first place.

*(This is the third bound found today denominated in the wrong unit, after
`maxFoodPerSecond` versus multi-food and hold thresholds versus run length. Worth
a standing review question: **what unit is this bound in, and what happens to it
when the thing it depends on changes?**)*

### 2.4 The identity this produces

- **PRIMAL** — constant tempo, geometry throughout. Optimal play is **coiling
  tight against the walls**. Long, spatial, patient.
- **CYBER** — hard ramp to the reaction floor by ~food 30, then the arena closes.
  **Hugging the wall is how you die**, because the wall comes to you. Short,
  intense.
- **COSMIC** — the wall cycle as its own axis (unchanged this pass).

Same input, opposite instincts, on the same board. That is a different *failure
mode* per dynasty — the top-ranked asymmetry technique — reached from play rather
than from a taxonomy.

---

## 3 — Tests

- **Replay determinism.** Server-derived block set for food *n* equals the
  engine's, over a seeded sweep. This is the gate: without it the feature cannot
  be validated and must not ship.
- **Rule 15 monotonicity.** Free space is non-increasing across every tick of
  every scripted run; block count never decreases.
- **Placement exclusion.** Over a long seeded run, no food and no portal ever
  spawns on a solid block; no block spawns on the exit portal.
- **Rate bound.** A scripted CYBER run collecting at the maximum honest rate on a
  50%-occupied board produces zero `INVALID_FOOD_RATE`. The bound must account for
  **occupancy**, not just food count — traverses shorten as the arena closes.
- **Window parity.** The portal window in real seconds is within tolerance across
  all three dynasties at every point on their speed curves.
- **Fold parity.** Growth changes live in the one shared function; parity test
  written first (standing rule).

## 4 — Open rulings for the owner

1. **Head-only, or does a block obstruct the tail too?** Head-only reads exactly
   like a wall and is simplest. But blocks can form *under* the body during the
   telegraph, so the tail needs a stated rule either way. *Recommendation:
   head-only lethality; the tail passes over a block it was already lying on, and
   the block simply exists beneath it.*
2. **Forming duration** [H: ~2 s]. Long enough to reposition at 100 ms/cell,
   short enough that the ring still completes on schedule.
3. **Tick floor** [H: ~100 ms] — the owner's own three data points bracket
   95–100; the research bound says 100–120. Confirm by playing the lab.
4. **Does the ring fill inward or outward?** Outermost-free-ring-first gives the
   "closing in" read. The alternative — scattered interior blocks — is a
   different game and should not be smuggled in as a tuning value.
