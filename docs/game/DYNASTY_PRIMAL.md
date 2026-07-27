# The PRIMAL ruleset

**Status: SPEC, from the owner's playtest and rulings of 2026-07-27.** Third of
three; companions are `docs/game/TERRAIN_AND_CYBER.md` and
`docs/game/DYNASTY_COSMIC.md`. Feeds WP-3.02 (the lab) and WP-3.03 (lock-in) in
`docs/ops/REDESIGN_WAVE.md`. Not scope until claimed.

PRIMAL is the dynasty this whole redesign was diagnosed from — the owner's
26-minute record run is the dataset behind every projection in
`docs/game/GAMEPLAY_PROPOSAL.md` §D1. This document consolidates what was
scattered across the proposal, the growth lab and the wave plan.

---

## 1 — What the playtest established

**The shipped curves are flat in every dimension that matters.** Tick is a
constant **200 ms forever** (`rulesets.ts:135`); `scoreMultiplier: () => 1`
(`:137`); and DNA per food grows **linearly and uncapped** (`:136`) — food 1 pays
10, food 100 pays 30, food 500 pays 110.

So PRIMAL pays you *more* the longer you stay and never gets harder. The only
escalating quantity in the entire dynasty is body length on a 400-cell board, and
`shed` existed to cancel even that.

**The consequence, measured.** In the owner's 180-food run:

| | Value |
|---|---|
| Duration | 26:26 wall-clock; **18.9 min** after trimming note-taking pauses |
| Final length | 171 = **42.8%** occupancy — an all-time record for the game |
| Seconds per food | **3.0 s** at 5% occupancy → **6.9 s** at 40% (median) |
| Traverse fit | `s/food ≈ 3.5 + 14.0 × occupancy` (2.3× slowdown end to end) |
| Model validation | predicts 19.8 min vs 18.9 actual — **within 5%** |

**The owner's verdict, which is the design thesis:**

> *"Before, it wasn't much fun — not boring, but the thrill was absent, because
> even if you die you always know it was because you weren't focused for a
> moment. **Focus isn't our fun-mechanism.** You need focus, but it should be more
> condensed."*

That run was **eight minutes of setup to earn two minutes of game.** And across
144 production runs the *median* reaches 8% occupancy — so for half of all runs
the game never starts at all.

**Two further findings, both about cost in the wrong unit:**

- **Coiling is taxed with dead time.** Coiling is PRIMAL's skill, and its price is
  a long walk across an empty region — *"it takes a long time to get to the next
  food when you coil up very elegantly."* The optimal strategy is more tedious
  than the suboptimal one, which trains players out of playing well. The owner set
  the record while explicitly *not* coiling optimally, because coiling was boring.
- **Enclosed pockets are taxed with waiting.** *"If the food spawns in that
  pocket, you have to wait until the body isn't in the way."* Avoiding
  self-enclosure is real skill; making the player wait for it is not.

> **The principle both share: pay in the currency of the game, never in waiting.**

---

## 2 — The identity

| Dynasty | Pressure from | Hazard | Verb |
|---|---|---|---|
| **PRIMAL** | **success** — you eat, you grow, the board closes | walls + your own body | **coils** |
| CYBER | time — the arena hardens on a schedule | closing ring + the clock | survives |
| COSMIC | failure — what you fail to collect calcifies | its own body + its own debris | terraforms |

**PRIMAL is the pure form.** It is Snake as the Nokia played it: fixed tempo,
bounded board, and the only thing that ever kills you is the consequence of having
succeeded. The other two dynasties are departures from it; PRIMAL is the thing
they depart from, and it should feel like the oldest game in the collection.

That is why its fixes are almost entirely **subtractive or corrective** — it does
not need a new mechanic, it needs its own curve to arrive in time.

### 2.1 Walls stay, and they are the scaffolding

PRIMAL keeps hard walls. They are not merely a hazard: **they are structure.**
Coiling works because a wall gives the body something to organise against, which
is exactly what COSMIC's torus denies (`DYNASTY_COSMIC.md` §2.1). The contrast is
deliberate and load-bearing — the same input produces opposite instincts on the
two dynasties, and on CYBER the wall comes to *you*.

### 2.2 Growth is the difficulty clock

Free space is `n² − L`. Under Rule 15 length only increases, so PRIMAL's entire
difficulty curve is the growth curve — and the shipped one (+1 per food, forever)
is roughly **five times too slow for the board**, which is why the native curve
has never engaged.

**Shape (owner's, tuned against the model):** fast early, a plateau, then
acceleration.

```
  +6 for foods 1–11        get to a real size immediately
  +2 for foods 12–31       the plateau: this is where the game is played
  +1 per 6 foods thereafter, cap 8      the endgame closes fast
```

Two things make this shape right rather than arbitrary:

- **Non-monotonic difficulty curves have strong precedent.** TGM's gravity table
  climbs, *drops back to its starting value at level 200*, re-climbs, falls again,
  then cliffs at 500. NES Tetris holds a flat plateau across levels 19–28 — "where
  all skilled play lives." Pac-Man's speed peaks at level 5 of 255 and then
  decreases.
- **The plateau dominates total run time**, because it holds most of the run's
  foods. Raising it from +1 to +2 moves the projected run from 8.8 minutes to 5.8
  on its own — the single highest-leverage number in the curve.

**Projection** (with D4's +8 INFUSE and traverse mitigation): **48 foods, pressure
at ~1:06, run ending near 3:12.**

### 2.3 Growth should be carried by the food, not by a schedule

A hidden growth schedule is a gotcha: the owner's own example was *"your tail just
jumps in length and you might crash into it if you didn't plan for that."* A
schedule the player cannot see is, in the near-miss literature's terms, the
**computer-chosen** condition — pressure that happens *to* you, which is arousing
without being motivating.

**So the growth value rides on the food and is visible before it is eaten.** A big
food looks big and reads `+5`; a small one reads `+1`.

Everything the schedule was for survives, and the gotcha does not:

- fast early growth — weight spawns toward big foods early
- the plateau — mixed spawns, where the player *chooses* their pace
- acceleration — late, the big ones are all that is left, or all that is near

And the sudden-jump difficulty remains, but as *"I saw it was +6 and took it
anyway"* — a decision the player owns rather than a surprise sprung on them.

**Make the big ones pay more, and every food becomes a micro-extraction:** more
yield, more body, less room. That is BANK-versus-PASS at the scale of a single
bite, hundreds of times a run — the game's thesis (*your reward is your problem*)
made literal.

**Constitutional note:** Rule 2 confines the Score fold to
`FOOD_BASE_SCORE × scoreMultiplier(n)`, a function of food *count*. So a
chosen-value food **cannot** vary Score. The variance lives in **Yield**, which is
the correct split anyway: *Score measures how far you got; Yield measures how much
risk you took to get there.*

### 2.4 The traverse fixes

Both of §1's dead-time defects are fixed here, and neither touches coiling itself:

- **Multiple foods on the board.** The nearest is always close, which collapses
  the traverse tail — and it is the *tail* that ruins the run, not the average:
  past 25% occupancy the median seconds-per-food barely moves while the mean
  quadruples. `spawnFoods` (`SnakeGameLogic.ts:2460`) already computes a wave
  target for COSMIC's groups and Splitter, so this is one more term in an existing
  sum, plus a **maintain-N** rule (respawn one per eat) so a depleted wave never
  recreates the long walk.
- **Unreachable food expires and respawns.** The pocket lesson survives — enclosing
  space still costs you yield and tempo — but never seconds of the player's life.

*Explicitly rejected:* biasing food spawns toward the occupied region to shorten
walks. It would increase enclosed-pocket spawns, converting a good tension into
dead waiting.

### 2.5 Tempo

**~170–180 ms**, a small increase from the shipped 200 (COSMIC sits at 160). This
attacks the dead walk, not the difficulty: every traverse gets shorter in
wall-clock while no individual turn gets harder. Speed is CYBER's axis and must
not be borrowed further than this.

### 2.6 Score

Per D3 (§6.1): a **back-loaded** shape — PRIMAL earns by depth — with an integral
comparable to CYBER's and COSMIC's at the terminus. Today's flat `() => 1` is half
of why the leaderboard measures dynasty choice rather than skill.

### 2.7 FERAL tier 2 — the Molt replacement

Molt cannot be re-priced under Rule 15, because **its shed *is* its effect**
(Constitution §13, row 26). PRIMAL's signature gene `heartwood` triggers on shed
events and is orphaned with it.

**Recommended replacement — "Fortress":** every 20 foods, the snake's oldest 6
segments **petrify** — they stop following, become fixed terrain, and each pays 5
DNA [H]. Length still counts them, so the clock never rewinds; free space is
unchanged; the *live* tail shortens while the board hardens. Pressure transforms
rather than resets, and `heartwood` re-triggers on petrification.

It is the fourth consumer of the terrain primitive, and it gives PRIMAL a
deliberate way to build structure — the same verb COSMIC gets from failure, here
earned through a strain commitment.

*Alternative if a simpler world is preferred:* FERAL-2 becomes a pure
growth-economy tier (+2 flat DNA per food while above a length threshold), and
`heartwood` re-targets to FERAL expression generally. **Owner ruling required at
WP-3.03.**

---

## 3 — Dials for the lab

| Dial | Note |
|---|---|
| Growth curve | the three lab profiles; `baseline` must be byte-identical to today |
| Per-food growth values | the visible `+N` on the food, and its spawn weighting by run stage |
| Simultaneous foods | starts at 3; the traverse-tail fix |
| Tick | 200 → ~170–180 |
| Unreachable-food expiry | ticks before a walled-off food relocates |
| Fortress cadence / segments / DNA | if Fortress is chosen at WP-3.03 |

**Measure from `run_events`, as §1's curve was measured:** seconds-per-food against
occupancy, per profile. If multi-food flattens the `3.5 + 14.0 × occupancy` fit,
the traverse problem is solved and the tick change may not be needed at all.

---

## 4 — Tests

- **Fold parity, written first.** Growth changes live in one shared function
  called by both `SnakeGameLogic` and `computeLengthTrace`. This is the defect
  class that invalidated the owner's real runs once already.
- **Rule 15.** Free space non-increasing across every tick; no path reduces length
  — `shed`, `regenesis` and `molted_rebirth` are deleted, and Fortress petrifies
  without shortening.
- **Growth visibility.** Every food's growth value is knowable before it is eaten;
  a source scan asserts no hidden growth path.
- **Rate bound.** Multi-food and the faster tick both raise the achievable eat
  rate; `maxFoodPerSecond` must be re-derived rather than inherited.
- **Expiry honesty.** A food walled into a pocket relocates within the stated
  window, over a seeded sweep.

---

## 5 — What this deletes

`shed`, `splice_regenesis`, `splice_molted_rebirth` (Constitution §13 rows 23–24),
Molt's shed as FERAL-2's effect (row 26), and the flat `scoreMultiplier`. The
`maxDuration` ceiling was already deleted in WP-2.05 and stays deleted — **a long
run is still a good run; it simply cannot be a *quiet* one any more.**
