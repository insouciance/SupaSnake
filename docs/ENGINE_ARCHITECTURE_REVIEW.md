# The Definitive Supa Snake Engine — Architecture Review

*Principal Gameplay Engineer review, 2026-08-06. Independent judgment; code-verified
against the current tree (main @ a460a4e + fix/mobile-flick-lighting @ c47fe33).
Every claim below carries a file:line citation or a measurement.*

---

## Executive verdict

**The core architecture is fundamentally correct and worth keeping.** A deterministic
reducer, an input journal, and server-side replay validation
(SnakeGameLogic.ts:2909 `tick()`, :2443 `applyReplayTurn`) is the architecture a
trust-first competitive Snake *should* have — it is what makes every score provable.
Almost no browser game has this. Do not rewrite it.

**The trust failures live at four seams around that core, and all four are fixable
without touching determinism.** Ranked by player-trust impact:

1. **The render lies by one cell at the exact moment that decides life or death.**
2. **A player's honest reaction inside that lie is discarded by a hard tick boundary.**
3. **The scheduler (setInterval + full React commit per tick) injects jitter the
   player feels as "sometimes crisp, sometimes mushy."**
4. **The camera can rotate the meaning of the controls.**

The governor was correct engineering for a real regression, but the owner's instinct
is right: **it treats the cost of rendering, not the architecture of feel.** A Snake
at 6–10 ticks/second on 2026 hardware should never need a quality governor to stay
fluid. After the fixes below, the governor should be a dormant safety net whose
Sentry breadcrumbs almost never fire — that silence becomes its success metric.

---

## Root cause 1 — the render is one tick behind the deadline (THE trust killer)

**Mechanism, verified:**

- A tick consumes at most one queued turn, then moves the head, then resolves
  collisions (tick(): queue shift at :2953, head move at :2993-2995).
- The renderer animates the *previous* move across the following interval:
  `alpha = (now − tickAt) / tickInterval`, clamped [0,1]
  (interpolationBuffer.ts:141-147; recordTick call at game/page.tsx:3406).
- Therefore the visual head **arrives** at the logical cell exactly when the *next*
  tick fires. The rendered snake is up to one full cell behind the simulation at
  every instant.

**Consequence — the "I thought I had that" moment, exactly:** with a wall at X+1,
the player's true input deadline is the tick where the head leaves the last safe
cell X. But during the entire reaction window, the screen shows the head still
*traveling toward* X. At the moment the engine executes the fatal move, the player
sees a snake standing on the last safe cell — apparently one full cell of life left.
The eye's natural contract ("while the head is on the last safe cell, I can still
turn") is violated by construction. At CYBER's ~100–120ms cadence this forces the
player to input while the head *looks* ~1.5–2 cells from the wall. The player is not
wrong to feel they reacted in time. **They did. The picture was late.**

**Fix 1a — front-loaded arrival (hours of work, the single biggest feel win).**
Change the movement easing so the head arrives at the logical cell early in the
interval (arrive by α≈0.45, then settle/overshoot-squash for the remainder). The eye
then dwells on the *true* board state for most of every interval. Side effect: motion
reads as snappy cell-to-cell hops with character — which is the INK & AMBER comic
language anyway. Precedent: virtually every grid game with good feel (Nintendo motion
grammar: fast primary motion, long settle; fighting-game "startup vs recovery"
framing). The current smoothstep (InstancedSnake.tsx:468) spends its time budget
symmetrically — that symmetry is the lie's accomplice.

**Fix 1b — the coyote tick (1–2 days incl. replay + sim gates).** A fatal move may
be cancelled by an admissible turn that arrives within a small grace window *after*
the tick fired — `min(40ms, 0.25 × tickInterval)`, the exact mirror of the
`preTurnGrace` window that already exists on the *other* side of the boundary
(game.ts:65-69, SnakeGameLogic.ts:2615-2628). Deterministically journaled: the late
turn is recorded against the tick it retro-applies to; the server replays the same
rule and reaches the same board. Precedent: Pac-Man cornering, Celeste's coyote
frames, fighting-game input buffering — every genre that lives on trust ships this.
The engine already has the philosophical precedent: press-time admission
(:2420-2426 — "live play never validates a turn at consumption") established that
*when the player acted* is what counts. The coyote window extends that principle by
one perceptual beat, into precisely the zone where the render currently lies.

Together, 1a+1b change the perceptual contract to: **"if the head hasn't visibly
entered the wall, my turn counts."** That is the contract human vision assumes.

---

## Root cause 2 — the scheduler and the React-per-tick cascade

**Verified facts:**

- The loop is a bare `setInterval` (game/page.tsx:3465), re-armed on speed change
  (:3460). setInterval callbacks fire when the main thread allows, drift against
  vsync (beat frequencies between 100–175ms ticks and 16.7ms frames), and are
  silently *dropped* under load — the founding observation of the governor work.
- Every tick then executes `syncState()` — **~20 React setState calls** through a
  7,900-line page component (the dependency list at :3413 names them). React 18
  batches this into one commit, but that commit reconciles a monolithic tree at
  every single tick, *on the same thread the next tick needs*.
- Meanwhile the actual 3D snake needs none of it: the interpolation buffer is
  already a ref, "written every engine tick, read every animation frame — lives in
  a ref, NEVER in zustand" (:709-711). The architecture already knows the right
  pattern; the HUD path just doesn't use it.

**Fix 2a — take React out of the hot path (2–4 days, mechanical).** Ticks write to
the interpolation buffer (already true) and to a transient store; HUD leaves
subscribe to exactly the fields they render (zustand selectors, already in the
stack) or receive rAF-batched writes. The page component re-renders on *events*
(decision opens, death, portal), never on movement ticks. Expected effect: the
largest main-thread cost in the entire per-tick budget disappears — likely more
headroom than every governor tier combined. **This is the fix that makes the
governor dormant.**

**Fix 2b — rAF-driven fixed-timestep accumulator (1–2 days + soak).** Replace
setInterval with the standard game-loop: accumulate rAF delta, execute ticks when
the accumulator crosses the interval (Gaffer on Games, "Fix Your Timestep" — the
industry-canonical loop for 20+ years; id/Valve/Nintendo engines are all variants).
Effects: tick execution aligns with frames (no timer-vs-vsync beat), late frames
catch up bounded-and-deterministically instead of dropping browser timer callbacks,
and tick timing becomes *observable* (we decide the policy, the browser doesn't).
The journal is untouched — tick count and content are identical; only *when* ticks
execute changes. Under genuine sustained starvation the policy remains today's
fair one: uniform slow-down, never tick-bursting through a stall (a precision game
must never teleport the snake three cells after a hitch).

**Explicitly rejected: moving the engine to a Web Worker now.** It's the textbook
answer and the wrong next move: input events arrive on the main thread (added
postMessage latency on the most latency-critical path), the deterministic journal
and checkpoint/continuity stack is the most safety-critical code we own and was
stabilized this week, and after 2a+2b the main thread has nothing left that
threatens a 6–10Hz simulation. Native iOS/Android builds get real threads anyway.
File it with the checkpoint trust boundary: a designed migration, if telemetry ever
demands it.

---

## Root cause 3 — the camera can rotate the meaning of the controls

**Verified:** flick direction is interpreted through live camera azimuth, frozen
per gesture (game/page.tsx:700-702) — because the camera *can* rotate, every flick
first answers "which way is up right now?" Muscle memory cannot form against a
moving basis. (The mobile incident — flicks rotating the board — was this coupling
failing open.)

**The canonical-viewpoint decision: correct. Endorse without reservation, and go
further.** Three independent arguments, any one sufficient:

1. **Input mapping stability** — a fixed azimuth makes flick axes *equal* board
   axes, permanently. Steering becomes spinal, not computed.
2. **Trained spatial constancy** — distance and speed judgments transfer across
   runs only if perspective is constant. Every skill sport fixes the field.
3. **Competitive fairness** — one viewpoint means every leaderboard run read the
   same information. The camera becomes part of the ruleset, like the tick rate.

**The critique you asked for — one real risk:** a canonical view chosen for beauty
instead of legibility would entrench a handicap. The slab's drama wants pitch;
foreshortening compresses the far rows and makes far-wall distances harder to
read — the exact judgment our trust problem lives in. Acceptance test for the
canonical angle: **screen height of a far-row cell ≥ ~0.7× a near-row cell**, and
equal input-to-death outcomes for walls on all four sides in the sim harness.
Free camera survives in replays, the chamber, and spectating. On the live
board, remove OrbitControls entirely — dead code after this, and it was the
incident's accomplice.

---

## Root cause 4 — silent boundaries (perception layer)

Small, dignity-preserving signals, none of which add HUD noise:

- **Death forensics micro-replay**: on wall/self death, 600ms replaying the final
  two ticks at half speed with the player's actual input timing marked. Converts
  every "I thought I had that" into visible truth — either "my flick was 30ms late"
  (trust preserved, skill lesson delivered) or a bug report with a reproduction
  attached. This is the single best trust *repair* feature; it also makes deaths
  shareable.
- Optional, only if 1a lands: a one-frame anticipation squash when the head's next
  cell is lethal. Readable at speed, no text, no UI.

---

## What a modern engine for this game looks like (the clean-sheet answer)

Exactly four layers, three of which we already have:

| Layer | Definitive form | Today |
|---|---|---|
| **Deterministic core** | Pure reducer, integer board, journaled inputs, server replay | ✅ Already right (keep byte-identical) |
| **Scheduler** | rAF fixed-timestep accumulator; input stamped at DOM-event time, bound to boundaries by rule (incl. coyote window); uniform slow-down under starvation | ❌ setInterval + hard boundary |
| **Presentation** | Reads sim via ref/buffer only; front-loaded arrival easing; HUD on transient subscriptions; canonical camera; render *cannot* touch the loop | ⚠️ Buffer exists; easing symmetric; React in hot path; camera free |
| **Trust instruments** | Input-latency histogram, death forensics, tick-jitter overlay, governor-as-sentinel | ⚠️ Partial (?debug=input, ?perf, breadcrumbs) |

The definitive engine is **this engine with the scheduler and presentation seams
redone** — not a new one.

## Instrumentation first — prove it before building it (½ day, do this as step 0)

1. **Input-to-effect histogram** (dev flag): DOM `event.timeStamp` → consuming tick,
   in ms. Today this number is invisible; it is the game's real latency.
2. **Death forensics log**: on every wall/self death, record α-at-last-input,
   distance-at-input, and whether a turn arrived within 60ms *after* the fatal
   tick. **Prediction: a large cluster lands in 0–40ms post-tick — the coyote zone.**
   That cluster is the measured size of the "I thought I had that" population.
3. **Tick-jitter overlay** in ?perf: scheduled-vs-actual tick time, worst frame gap.
   Before/after 2a gives the React-decoupling win as a number.
4. Ship 1a behind the dev fixture first; A/B strips on the same seed.

## Migration roadmap (impact ÷ cost, in order)

| # | Change | Cost | Trust impact |
|---|---|---|---|
| 0 | Instrumentation trio | ½ day | Turns every hypothesis into a number |
| 1 | Front-loaded arrival easing | Hours | **Highest per line of code in the codebase** |
| 2 | Coyote grace window (journaled) | 1–2 days | Eliminates the named trust-breaking death class |
| 3 | React out of the hot path | 2–4 days | Jitter class gone; governor goes dormant |
| 4 | rAF accumulator loop | 1–2 days + soak | Timing becomes ours, not the browser's |
| 5 | Canonical camera + OrbitControls removal | 1 day | Controls become spinal; fairness codified |
| — | Worker engine / native threads | Parked | Post-telemetry, with the trust-boundary item |

Items 1, 2, 4 change gameplay-adjacent behavior → one SNAKE_RULES_VERSION-adjacent
review each (2 definitely journals a new rule; 1 and 4 are render/scheduling only
but get sim-gate runs anyway). Item 3 is behavior-neutral and can ship in a Look &
Feel train. Constitution check: the coyote window must be framed as *input
admission* (a legal input honored), never as score assistance — it applies
identically to every player and is dynasty-independent.

---

*Filed by the session's principal-engineer review; measurements and citations from
the live tree. The sharpest sentence in this document is the owner's own brief:
"design the engine around the player, not around the technology." The core already
serves the server honestly. These four seams make it serve the player's eye and
hand with the same honesty.*

---

# The Engine Trust block — work packages ET-0…ET-5

*Decomposition of the roadmap above, in the house WP grammar. One PR train per
package; doctrine prior-art gate applies to ET-2/ET-4 (input/scheduling are
system-shaped). On ratification this section merges into
docs/IMPLEMENTATION_HANDOFF.md and this file is committed alongside it.*

## ET-0 — Trust instrumentation (do first; everything else cites its numbers)
**Scope:** (1) input-to-effect latency histogram: DOM `event.timeStamp` of every
accepted turn → the tick that consumed it, dev-flagged (`?debug=input` extends the
existing InputDebugState, game/page.tsx:703-706); (2) death forensics log: on every
wall/self death record α-at-last-input, cell-distance-at-input, and any admissible
turn arriving ≤60ms after the fatal tick (the coyote-zone counter) — Sentry
breadcrumb + dev overlay; (3) tick-jitter overlay in `?perf`: scheduled-vs-actual
tick delta, worst frame gap, ticks-per-second realized.
**Rules impact:** none. **Owner ruling:** none. **Gates:** standard local set; no
e2e contract changes. **Effort:** S (~½ day). **Exit criterion:** one week of play
produces the coyote-zone cluster size — the measured population of "I thought I
had that."

## ET-1 — Front-loaded arrival (the honest picture)
**Scope:** movement easing so the visual head arrives at its logical cell by
α≈0.45 with a settle for the remainder (InstancedSnake.tsx easing at :468/:565;
body/head treated per the file's head-vs-body contract). Tune on the dev fixture
with A/B strips on a fixed seed; the `?tier=`-style pin pattern is the precedent.
**Process:** concept-first on the dev server — this changes motion character, the
owner judges it like any look change. **Rules impact:** none (render only).
**Gates:** cockpit verifiers ×3 (motion contracts re-expressed if any pin
symmetric easing), jest, both e2e legs. **Depends on:** nothing (ET-0 parallel).
**Effort:** S (hours + owner review). **Exit criterion:** owner approves feel;
the head visibly dwells on true position for ≥50% of every interval.

## ET-2 — The coyote tick (rules-bearing; the named death class dies here)
**Scope:** a fatal move is cancellable by an admissible turn arriving within
`min(40ms, 0.25 × tickInterval)` after the tick boundary — the mirror of
`preTurnGrace` (game.ts:65-69). Engine: fatal resolution enters a one-boundary
pending state that a grace input retro-resolves; the turn journals against the
tick it applies to; `applyReplayTurn`/the server validator replay the identical
rule (SnakeGameLogic.ts:2443 family). Sim-gate suite: seeded runs proving (a) no
score/economy delta absent a grace input, (b) byte-identical replay with grace
inputs, (c) dynasty-independence incl. PRIMAL 175ms cap behavior, (d) board-fill
and Side-Door arrival-beat interactions (the beat consumes no input — grace must
not either, :2935-2960).
**Rules impact:** SNAKE_RULES_VERSION bump (own train, no cohabitants).
**Constitution:** framed as *input admission* — a legal input honored, identical
for every player; checklist run; §13-style row recording the window constants.
**Owner ruling required:** window size ratified against ET-0's measured cluster
(recommendation stands at 40ms/0.25-tick until data says otherwise).
**Depends on:** ET-0 (data), ideally after ET-1 (the two together define the new
perceptual contract). **Effort:** M (1–2 days incl. validator + sim gates).
**Exit criterion:** coyote-zone deaths → near zero in forensics; zero replay
rejections attributable to grace turns.

## ET-3 — React out of the hot path (the governor goes dormant)
**Scope:** per-tick `syncState()` (~20 setStates, game/page.tsx:3392-3413) is
dismantled: movement-tick data flows only through the interpolation buffer (already
a ref) and a transient store; HUD leaves subscribe to exactly their fields
(zustand selector pattern already in-stack); the page component re-renders on
events (decision open/close, death, portal, eat that changes a tray number) —
never on a movement tick. Deliverable includes a before/after from ET-0's jitter
overlay and a re-run of the 6× throttle retention measurement.
**Rules impact:** none (behavior-neutral refactor; jest suite must stay green
untouched — any test edit is a red flag reviewed individually).
**Owner ruling:** none. **Depends on:** ET-0 (the number that proves it).
**Effort:** M-L (2–4 days; mechanical but wide in game/page.tsx).
**Exit criterion:** tick commit cost ≈ 0 React work during steady movement;
governor breadcrumbs silent on the dev machine under 4× throttle.

## ET-4 — The rAF fixed-timestep accumulator (timing becomes ours)
**Scope:** replace the `setInterval` driver (game/page.tsx:3429-3466) with an
rAF-driven accumulator: ticks execute when accumulated delta crosses the live
interval; bounded catch-up (cap: 1 tick per frame — uniform slow-down beyond,
preserving today's fairness stance: never burst through a stall); speed changes
re-base the accumulator (the :3453-3461 re-arm logic ports over); background-tab
behavior explicitly specified (rAF stops → sim pauses → continuity absorbs, as
today). Interactions handled: interpolation `tickAt`/`tickInterval` stamps
(recordTick at :3406) now come from the loop's own clock; the governor's probe
keeps its independent `setInterval` (it measures thread health, not the loop);
`?perf` jitter overlay validates the before/after.
**Prior-art brief:** required (Gaffer fixed-timestep + browser rAF specifics —
throttling, display-rate variance, 120Hz devices).
**Rules impact:** none to the journal (tick count/content identical); sim-gate
run proving byte-identical journals on seeded runs under artificial stalls.
**Owner ruling:** none. **Depends on:** ET-3 (land the cheap thread first so the
soak measures the new loop, not old React noise). **Effort:** M (1–2 days + a
soak window). **Exit criterion:** tick-jitter overlay: p99 tick delta within
±1 frame at 60Hz on desktop and mid-tier mobile; zero dropped-tick windows in a
full run.

## ET-5 — The canonical viewpoint — AT PR #98 (2026-08-07, auto-merge armed; Constitution v1.16 row 38)
**Scope:** one fixed competitive camera on the live board: azimuth locked (flick
basis becomes constant — the cameraAzimuthRef gesture-freeze at game/page.tsx:700
collapses to a constant), pitch chosen by the legibility acceptance test
(far-row cell screen-height ≥ 0.7× near-row; equal four-wall input-to-death
outcomes in the sim harness), zoom presets replacing free zoom if the test
demands. OrbitControls removed from the live board entirely (input-competition
class closed for good). Free camera remains in replays/chamber/spectate.
**Process:** candidate angles on the dev fixture → owner ratifies THE viewpoint
(this is a competitive-language decision, recorded like a rules ruling).
**Rules impact:** none mechanical; record the ratified viewpoint in the
Constitution's competitive-conditions territory (§5-adjacent) so it cannot drift
silently. **Depends on:** ET-1 (judge the angle with the honest easing in).
**Effort:** M (1 day + ruling). **Exit criterion:** flick axes ≡ board axes in
code; acceptance test green; verifiers pin the canonical angle.

## Sequencing and trains
```
ET-0 ──┬────────────► ET-2 (rules train, own bump)
       │
ET-1 ──┴─(owner feel approval)──► ET-5 (owner viewpoint ruling)
ET-0 ────► ET-3 ────► ET-4 (soak)
```
Three independent lanes; nothing here migrates the database (no Track A). ET-2 is
the only rules bump. Recommended calendar: ET-0+ET-1 immediately behind the
Wave-2 deploy (both small); ET-3 as the next solo train; ET-2 and ET-4 after
their dependencies; ET-5 rides whenever the owner sits for the viewpoint session.
**Interleaving with the design program:** Wave 3 (DROP redesign) is concept-first
and owner-gated anyway — the ET lanes fill the build capacity while concepts
await judgment. Nothing in ET blocks Wave 3/5, and ET-1/ET-5 sit in the same
"owner judges on dev server" sessions the design waves already use.

## Standing constraints (apply to every package)
Deterministic core untouched except ET-2's journaled rule; no TODO/FIXME; exit
codes on every gate; mock-weaker-than-reality forbidden (FM catalog); e2e flag
matrices explicit; any test contract change argued from spec, never from green.
