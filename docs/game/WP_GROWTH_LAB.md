# WP-GL — The Growth Lab (playtest instrument)

**Status: SPEC, pending owner ruling on D1.** Not scope until approved. On
approval, fold into `docs/IMPLEMENTATION_HANDOFF.md` under the standard
branch/migration protocol and delete this file.

**Purpose.** Let the owner *play* three growth configurations and say which one
feels like Snake. This is an instrument for answering D1 in
`docs/game/GAMEPLAY_PROPOSAL.md`, not a balance change. Nothing here is intended
to ship to players in its current form.

**Why an instrument and not a tuning commit.** The model in D1 is calibrated to
exactly one run — one player, one dynasty, one 200 ms tick — and predicts that
run's duration to within 5%. That is enough to rank candidate configurations and
nowhere near enough to pick one. Ten minutes of the owner's hands settles what
the model cannot.

---

## 1. The architectural hazard, and the only safe resolution

**Do not gate length math behind a `NEXT_PUBLIC_*` flag.** Those are build-time
inlined, so a client built with one growth curve and a server recomputing with
another will disagree on every length, and `computeLengthTrace` parity breaks on
every run. WP-2.10a documented this exact hazard for payout math; length is
worse, because the validator derives claim caps from it. The failure mode is
mass run invalidation — the defect WP-2.05 existed to eliminate.

**Resolution: the profile is server-stamped into the run, never inferred.**

1. At run start the server resolves a `growthProfileId` and writes it into
   `game_sessions.run_context` (the column migration 054 already added).
2. The start response carries that id to the client; the engine configures
   itself from it.
3. Settlement reads the id back out of `run_context` and replays the length
   model with the same profile.
4. The `NEXT_PUBLIC_*` flag controls **only whether the profile selector is
   offered in the UI**. It never changes what any math does. A run started
   without a stamped profile uses `baseline` — which is today's behaviour,
   byte-identical.

This mirrors how `anomaly_id` and the world condition are already handled, and
it makes an old client physically incapable of desynchronising: it plays whatever
the server told it to play, or it plays baseline.

---

## 2. Deliverables

### 2.1 `src/shared/game/growth.ts` (new, pure)

The single source of truth. Both the engine and the server length model must
call it — no second implementation, per the WP-2.05 fold-parity rule.

```ts
export type GrowthProfileId = 'baseline' | 'tuned' | 'aggressive';

export interface GrowthProfile {
  id: GrowthProfileId;
  label: string;              // player-facing, for the selector
  initialLength: number;
  simultaneousFoods: number;  // traverse mitigation
  /** Base segments gained on eating the n-th food (1-indexed). */
  growthForFood(n: number): number;
}

export const GROWTH_PROFILES: Readonly<Record<GrowthProfileId, GrowthProfile>>;
export function resolveGrowthProfile(id: unknown): GrowthProfile; // total, never throws, unknown -> baseline
```

`growthForFood` returns the **base** growth only. Gene and anomaly modifiers
(Overgrowth +2, Bulk Up +3, `overgrown`) continue to be added on top at their
existing sites, unchanged.

### 2.2 The three profiles

| | `baseline` | `tuned` | `aggressive` |
|---|---|---|---|
| Initial length | 3 | 3 | 3 |
| Growth, foods 1–11 | +1 | **+6** | **+8** |
| Growth, foods 12–31 | +1 | **+2** | **+2** (to food 27) |
| Growth thereafter | +1 | **+1 per 6 foods, cap 8** | **+1 per 5 foods, cap 10** |
| Simultaneous foods | 1 | **3** | **3** |
| Projected foods to 45% | 177 | 53 | 47 |
| Projected pressure at | ~8:00 | **1:30** | **1:06** |
| Projected run end | ~19:48 | **~3:30** | **~3:06** |

Projections are from the D1 model with traverse mitigation applied. `baseline`
must be **byte-identical to today** — it is the control, and a test asserts it.

### 2.3 Engine — `src/lib/game/SnakeGameLogic.ts`

- Accept a `GrowthProfile` at construction; default `baseline`.
- Base growth at the eat site (~`:1470-1484`) becomes
  `profile.growthForFood(n)` instead of the implicit +1. **Order of operations
  is unchanged** — base growth, then extras, then shed cycles — because
  `computeLengthTrace` mirrors that order and the parity suite pins it.
- `spawnFoods()` (`:2460`) maintains `profile.simultaneousFoods` on the board,
  respecting existing placement rules (never on the snake, never on the exit).
- Starting length reads `profile.initialLength`.

### 2.4 Server length model — `src/shared/game/genome.ts`

`computeLengthTrace` (~`:321-328`) replaces `let growth = 1;` with
`let growth = profile.growthForFood(n);`. The profile arrives from
`run_context`. Everything downstream — shed cycles, the Molt floor, claim caps —
is untouched.

### 2.5 Validator — `src/lib/server/gameValidator.ts`

**`maxFoodPerSecond` must be widened, or the instrument will flag its own honest
runs.** With three simultaneous foods a player can legitimately eat faster than
`RULESETS.PRIMAL.validation.maxFoodPerSecond = 1.0` permits.

**Derive it, do not guess:** the achievable rate scales with the number of
simultaneous foods, so the bound becomes
`maxFoodPerSecond × profile.simultaneousFoods`. Write the derivation in the
comment. This is the same defect class as the `VOLT_RATE_ALLOWANCE_FACTOR` bug
WP-2.05 fixed — a bound that did not know about a mechanic that legitimately
raised the rate.

### 2.6 Run start — `src/app/api/game/session/route.ts`

Resolve and stamp `growthProfileId` into `run_context`, strictly server-side.
Never read it from the request body. Unknown or absent → `baseline`.

### 2.7 Selector — Run Setup

Behind `NEXT_PUBLIC_GROWTH_LAB_V1` (new, default **off**). A three-way control
rendering `profile.label`. Absent flag → no control, no stamp, baseline.

---

## 3. Interactions that will corrupt the experiment if ignored

**Superseded by D4 (2026-07-27), which simplifies this section considerably.**
The owner has ruled **length monotonic — it only ever increases**. So the
length-reducing mechanics are not "suppressed in lab profiles"; they are
**deleted from the game**, and the lab runs on the post-D4 catalog. Playtesting
a configuration that will never ship would answer the wrong question.

- **Delete** `shed`, `splice_regenesis`, `splice_molted_rebirth`
  (`mutations.ts:360-361`, `splices.ts:208-210,252-253`). No suppression logic
  is needed once they are gone, which removes the `genePoolBlockedByTraits`
  plumbing this WP previously required.
- **INFUSE inverts to +8 segments** (from −4). This materially changes the model:
  the owner's record run took three infuses, so under D4 it carries **+24
  segments instead of −12** — a 36-segment swing, finishing at ~52% occupancy
  rather than 42.8%. **The §D1 projections must be re-run against the inverted
  cost before the profiles are tuned**; they currently assume −4.
- **FERAL Molt** and **Ouroboros** need re-signing to cost growth. Until they
  are, exclude them from lab offers — not as a design statement, but because a
  half-converted mechanic measures nothing.
- **Revives** must grant survival, not shrinkage. Phoenix's "reborn at length 8"
  is the largest D4 violation in the catalog; for the lab, exclude any revive
  that resets length.
- **Score rescales.** ~53 foods instead of ~180 means run scores drop roughly
  3×. **Lab runs must not enter the leaderboard or Records.** Mark them
  non-ranking at settlement, the way free-play runs already are, so boards stay
  comparable and the wave's restored `high_score` values are not buried.
- **Yield and DNA are unaffected by design.** No economy change is in scope.

---

## 4. Tests

- **Parity, the load-bearing one.** For every profile, the engine's live length
  trace must equal `computeLengthTrace` **exactly**, across the WP-2.05
  adversarial axes (last_gasp boundary, bulk_up bucket edge, stacked growth,
  overgrowth + arcs, tithe before the pick, Regenesis cycling, Molt, Thick Hide,
  infuse before a boundary food) plus a fixed-seed randomized sweep that prints
  its seed on failure. Write this **first**.
- **`baseline` is byte-identical to today.** Golden test over a recorded run:
  same lengths, same score, same DNA, same validator errors.
- **Profile resolution is total** — unknown id, null, malformed → `baseline`,
  never a throw.
- **Rate bound** — a scripted 3-food run at the maximum honest rate produces
  **zero** `INVALID_FOOD_RATE`.
- **Suppression** — `shed`, `regenesis` and `molted_rebirth` never appear in a
  `tuned` or `aggressive` offer, over a large seeded sweep.
- **Stamp round-trip** — profile written at start is the profile read at
  settlement; a run with no stamp settles as `baseline`.
- **`verify:constitution` green.** Growth touches length, never the score fold;
  `rulesets.ts:320,517` must remain byte-identical.

---

## 5. Acceptance

**Automated:** all of §4, plus lint, typecheck and the existing suite.

**Manual — this is the actual deliverable.** The owner plays **two runs per
profile on PRIMAL**, then repeats on CYBER, and answers the three session
questions from §8 of the proposal for each:

1. When did you feel most in control?
2. When did you first stop caring?
3. What did you want to do that the game wouldn't let you?

Recorded with a food count against each answer, so notes can be correlated to
`run_events`. **Log the boring runs** — those carry the signal.

**The measurement to take afterwards**, from `run_events` exactly as D1 was
derived: seconds-per-food against occupancy per profile, and whether the
`3.5 + 14.0 × occupancy` traverse fit still holds when three foods are on the
board. If multi-food flattens that curve, the traverse problem is solved and the
speed-scaling idea can be dropped entirely.

---

## 6. Out of scope

No economy change, no salvage-decay, no shed rewrite beyond suppression in lab
profiles, no dynasty asymmetry, no difficulty ladder, no board-size change. Board
stays 20×20; if the owner wants to feel a smaller board, that is a second
profile axis and a second instrument.

**This work package does not decide anything.** It produces the evidence for D1
and is expected to be deleted or rewritten once D1 is ruled.
