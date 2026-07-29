# Terrain, and the CYBER ruleset

**Status: IMPLEMENTED, updated 2026-07-28.** The original playtest reasoning is
retained; implementation authority lives in `src/shared/game/terrain.ts`, the
rulesets, and `SnakeGameLogic`. The visual grammar in §1.2 is the current
cross-source contract.

Two things, in one document because the second is the first's first consumer.

---

## Part 1 — The terrain primitive

**A block is a permanently locked board cell.** That is the whole idea. It is
not a hazard system, an entity, or a mode: it is a board cell transformed into
wall. The rendered metaphor is deliberately not a loose concrete object.

**Why one primitive and not three mechanics** (Rule 12 asks what existing system
could not do the job): nothing in the engine can currently occupy a cell
lethally — the board holds food, constellation stars, exit portals, the
mutation helix and gilded cells, and **none of them is lethal**. So this is
genuinely new. But it is *one* new thing, and it replaces three separately
proposed mechanics:

| Consumer | Uses blocks for |
|---|---|
| **CYBER** (Part 2) | the arena hardens from the outside in |
| **PRIMAL / FERAL-2** | the shed rewrite — your tail petrifies instead of vanishing (kill-list row 26) |
| **COSMIC** | uncollected constellation stars calcify where they were abandoned |
| **The ladder** (§8.6a) | a rung can start the run with a ring already placed |

A shrinking *board* was considered first and rejected: it changes grid geometry,
which threads through food placement, portal placement, the camera and every
collision bound — and it removes cells the player can already see, so it cannot
create the "get out of the outer lane, now" pressure that a block forming
*under* you can.

### 1.1 Lifecycle — three states (owner ruling, 2026-07-27)

1. **Forming** — a **floor decal**, non-lethal. The snake passes freely over it.
   Duration [H: ~2 s, expressed in *seconds* and converted by the live tick —
   see §2.3 for why ticks are the wrong unit].
2. **Pending** — forming has finished but the cell is still occupied by the
   snake. It stays a decal and waits.
3. **Solid** — extrudes the moment the cell is clear. **Lethal to the head only.**
   Permanent.

The forming phase is not a courtesy; it is what makes this a positioning problem
rather than a random death, and it is the owner's own telegraph idea (from the
speed-burst sketch) applied to the arena.

**The invariant that falls out, and it is worth stating as a law:**

> **A solid block is never overlapped by any part of the snake.**

In Snake the body strictly follows the head — every segment was previously a head
position (the engine unshifts the head and pops the tail; growth duplicates the
tail cell). So if the head can never *enter* a solid cell, no segment can ever
*occupy* one. Head-only lethality plus clear-cell solidification therefore makes
the overlap case **structurally impossible**, not merely rare: the artist never
has to solve it, and there is no unfair-death case to tune. The revive path is
safe for the same reason — it rewinds the head three cells *along the body*, onto
cells the snake already occupies.

*Rejected alternative:* simply skipping occupied cells when placing a forming
block. Tidier, but a snake coiled along the ring would prevent the ring from
filling — which would **reward** wall-hugging on the one dynasty designed to
punish it. Waiting to solidify keeps the pressure and removes the unfairness.

*Non-exploit, checked:* a player cannot camp cells to stall the arena. A cell
occupied by the body is not free space either; whether it holds snake or is
committed to locking, it cannot be used. The pressure is identical.

### 1.2 Visual grammar — one lifecycle, sourced signatures

Terrain is a **transformation of the board**, not a collection of props placed
on it. All causes share the same categorical safety language:

- **Forming/pending:** low warm-amber fill plus four perimeter rails. The fill
  closes across the cell as the safe window elapses; the whole outlined cell is
  already committed and unavailable to placement. It remains passable.
- **Solid:** a raised, matte, permanently still cell with no ambient pulse. Raised
  and still means lethal and permanent in every dynasty.
- **Cause:** a quiet top inlay survives into the solid cell—CYBER shutter,
  Fortress scale plate, COSMIC star scar, ladder seal. Cause may alter inlay
  silhouette/orientation, never collision shape, height, or lifecycle. It does
  not require a separate colour family.

Forming fill/rails, solid bases, and all source reliefs use three instanced
meshes—not one material/mesh family per cause. Source is carried by relief
silhouette rather than colour, so none of it borrows the active snake's dynasty
glow; player identity and board restriction do not compete.

### 1.3 Determinism — replayability, not payout

Terrain changes physics, never payout. Settlement bounds the facts terrain can
influence—duration and food count—but does not replay player movement or block
positions. Seeded placement exists for challenge/replay parity, not as a new
economic claim surface.

- **Cadence is food-indexed**, never time-indexed: *K blocks every M foods*. Food
  index is already the spine of every replay (`run_events` stamps `{e:'f', n, t}`;
  `verifyOfferTrace` replays from food counts).
- **Cell choice is seeded** from `run_seed` — the same injectable-rng discipline
  `sampleFoodCell` already follows (*"a seeded run must lay out identical food
  waves on every replay"*). Never `Math.random()`.
- Same-seed engine runs derive the scheduled block set for food *n*
  independently and identically.

### 1.4 Rules

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

- **Replay determinism.** Two engines with the same seeded schedule choose the
  same arena cells at food *n*.
- **Rule 15 monotonicity.** Committed free space is non-increasing across every
  scripted transition; block count never decreases. Forming cells count as
  committed even before they are physically lethal.
- **The overlap invariant (§1.1).** Over a long seeded run, assert that **no
  snake segment ever occupies a solid block** — including across revives, growth
  spurts and infuses. This is the test that lets the renderer assume the case
  cannot happen; if it ever fails, head-only lethality is wrong somewhere.
- **Placement exclusion.** Over a long seeded run, no food and no portal ever
  spawns on a solid block; no block spawns on the exit portal.
- **Presentation connection.** Every terrain-producing path reaches
  `TerrainBlocks`; all four sources survive into the renderer; forming reads
  `formingTotal`; full-board capacity is not silently truncated.
- **Rate bound.** A scripted CYBER run collecting at the maximum honest rate on
  a 50%-occupied board produces zero `INVALID_FOOD_RATE`.
- **Window parity.** The portal window in real seconds is within tolerance across
  all three dynasties at every point on their speed curves.
- **Fold parity.** Growth changes live in the one shared function; parity test
  written first (standing rule).

## 4 — Open rulings for the owner

1. ~~Head-only, or does a block obstruct the tail?~~ **RULED 2026-07-27:
   head-only, with clear-cell solidification** (§1.1). The owner's reasoning:
   tail lethality would make the transition kill unintendedly and feel unfair,
   and a solid block sharing a tile with the tail looks wrong even briefly.
   Both concerns are resolved structurally by the invariant in §1.1.
2. ~~**Forming duration** [H: ~2 s].~~ **IMPLEMENTED:** CYBER 2 seconds;
   Fortress 3 seconds because it forms behind the player's focus.
3. ~~**Tick floor** [H: ~100 ms].~~ **IMPLEMENTED:** CYBER 100 ms. D1 still
   requires owner playtest; do not silently retune it from telemetry-free feel.
4. ~~**Does the ring fill inward or outward?**~~ **RULED:**
   outermost-free-ring first. Scattered interior blocks remain a different game.
5. **Pending-state ceiling.** If a cell stays occupied for a long time the ring
   falls behind schedule. Cheapest answer is none at all — the schedule is
   food-indexed, so a delayed block still arrives and the count self-corrects.
   Worth watching in the lab rather than pre-solving.
