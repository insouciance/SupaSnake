# The COSMIC ruleset

**Status: SPEC, from the owner's playtest and rulings of 2026-07-27.** Companion
to `docs/game/TERRAIN_AND_CYBER.md`; feeds WP-3.02 (lab dials) and WP-3.04
(dynasty curves) in `docs/ops/REDESIGN_WAVE.md`. Not scope until claimed.

---

## 0 — Constellation read (owner ruling, 2026-07-29)

Every fresh constellation after the opening wave receives a **bounded native
planning window**. This is dynasty grammar, not a gene: charging a build slot or
random offer for the minimum time needed to read COSMIC's five simultaneous
targets would make baseline readability conditional power.

- The simulation freezes for at least **1.0 second** and at most **2.0 seconds**.
- During the guaranteed first second, keyboard input may stage the normal route
  buffer and mobile may stage its existing two-turn L-route. The body does not
  move early.
- If the player has committed a direction/route, movement begins when the first
  second closes. After that second, a new direction resumes immediately.
- With no input, the current heading automatically continues at two seconds.
- The read spends no tactical hold, adds no gene, changes no constellation
  window tick, and cannot become an indefinite free pause.
- Opening wave 1 receives no extra freeze because Ready already provides
  unlimited pre-movement reading time. A strategic gene/portal/surge choice on
  the same tick owns the decision surface and supersedes this window.

This preserves COSMIC's tempo and the need to execute under pressure while
making the actual route choice perceptible at the moment the board changes.

## 1 — The verdict this starts from

The owner, playing COSMIC as shipped:

> *"I don't really get COSMIC. It's not really fun to get the combos, it's just
> boring, has no thrill factor."*
> *"The wall cycle is pretty useless — I never really use it, and for what?"*
> *"It just makes it difficult to survive, because on the other side you'll need
> to reorient for a sec and might crash or intuitively hit a wrong button. It's
> more a risk, the wall."*

Three defects underneath that, two of them provable from the code.

**1.1 The combo cap is mathematically unreachable.** Foods spawn as groups of
three sharing one glyph (`groupSize: 3`; one `constellationGlyph` per wave), and
the combo is ×1.2 at chain 2, +0.2 per food, **capped ×2.4 at chain 8**. A wave
holds three foods, so a reliable chain is **three** — ×1.4. Reaching chain 8 needs
consecutive waves to roll the same glyph (1 in 3, uncontrollable) *and* be
reachable inside 8 ticks. The cap sits at a chain length the game does not
produce.

**1.2 The reward is invisible.** `scoreMultiplier: () => 1` — the combo touches
Score not at all. Perfect execution of COSMIC's only skill layer yields +40% DNA
on three foods, on a number nobody ranks.

**1.3 The combo is not a decision.** `groupRadius: 4` — the foods are a pile.
"Chaining" means eating three adjacent things in the order they happen to lie in.
Meier's test for a non-decision is *obvious*, and this is the default path with a
bonus attached.

**1.4 The wall cycle is a constraint with no opportunity.** The open phase does
not *give* the player anything — it removes a punishment for hitting walls, which
a player with food clustered mid-board was never going to do. Compare Pac-Man's
power pellet, which *inverts* the goal for a window. And the owner's deeper point:
wrapping is a **cost**, not a benefit, because emerging on the far side forces a
spatial-model reload.

**The specific culprit is intermittency.** Players adapt to wrap-around boards
easily when wrapping is *constant* — it becomes part of the spatial model. They
cannot adapt to a rule that toggles every 8–12 seconds. Consistent rules produce
skill; toggling rules produce confusion. The cycle was not adding rhythm, it was
preventing learning.

---

## 2 — The identity

Each dynasty must differ in **what generates the pressure**, not merely in flavour
— and free space must still only ever shrink (Rule 15). Three different hands on
the same valve:

| Dynasty | Pressure comes from | Hazard |
|---|---|---|
| **PRIMAL** | **success** — you eat, you grow, the board closes | walls + your body |
| **CYBER** | **time** — the arena hardens on a schedule you don't control | closing arena + the clock |
| **COSMIC** | **failure** — what you fail to collect calcifies | your body + your own debris |

> **PRIMAL coils. CYBER survives. COSMIC terraforms.**
>
> *(Routing is how COSMIC terraforms — see §2.4. The earlier framing, "COSMIC
> routes," described the action and missed the point: the route is the means, and
> the placement of debris is the end.)*

### 2.1 No walls, ever

**The board is a torus. Wrapping is permanent.** The wall cycle
(`COSMIC_FLUX`) is deleted outright — Rule 12's default-to-subtraction, removing
the mechanic the owner never used.

- **It is learnable.** One consistent rule, so wrapping becomes a tool instead of
  a hazard.
- **It matches what already kills COSMIC players.** COSMIC is the most
  self-collision-skewed dynasty in production: self 11 / wall 6, against CYBER's
  wall-heavy 11/9 and PRIMAL's even 7/7.
- **It removes the scaffolding.** PRIMAL's coiling uses walls as structure. A
  torus has no edges to organise around and no corners to trap you — so managing
  your own body is *harder*, not easier, and it is the only thing to manage.

### 2.2 Uncollected stars calcify

**A constellation appears scattered across the board with a window. Every star
not collected before the window closes becomes permanent debris.**

This is the mechanism, and everything good about COSMIC follows from it:

- **The decision is sharp and unusual.** You can reach three of five in the
  window. The question is not "how fast can I eat" but ***"which do I abandon,
  and where will its corpse sit for the rest of my run?"*** The player is
  choosing the placement of their own future obstacles.
- **Difficulty is self-balancing and legible.** A good router leaves a clean
  board; a poor one builds their own coffin, one abandoned star at a time, and can
  see exactly which choices did it.
- **The wrap finally earns its place.** Crossing the seam is how a distant star
  becomes reachable inside the window — so the torus is the tool that lets you
  *avoid* creating debris. Wrapping stops being a disorientation tax and becomes
  the thing that saves you.
- **It reuses the terrain primitive** (`TERRAIN_AND_CYBER.md` §1) — third
  consumer after CYBER's closing arena and the shed rewrite. No new machinery.
- **It is free thematically.** A constellation you failed to trace leaves dead
  matter behind.

### 2.3 No imposed order (owner ruling: option A)

Stars are collected in **whatever sequence the player chooses**. The route is the
skill — a travelling-salesman problem under a clock — and the order is *emergent*,
never dictated.

*Rejected, recorded:* **an imposed 1-2-3 sequence** produces the moment where you
stand beside the last star and must walk away from it, which reads as pedantry
rather than difficulty — constraint without decision. **Competing simultaneous
constellations** (commit to one, the rest calcify) moves the abandonment decision
up a level but discards so much food per wave that debris would outrun skill.

**Consequently glyphs stop being a chaining rule.** They become what they always
visually were: the *shape of the constellation being traced*. One less system, and
§1.1's unreachable cap dies with it — chain length is bounded by the constellation
size and the window, both of which are honest dials.

### 2.4 The strategic layer — terraforming (owner ruling, 2026-07-27)

**The problem this solves.** If the stars are interchangeable, "which do I
abandon" resolves to "the farthest one" — an optimisation with a computable
answer, not a strategy. That is Meier's *obvious* failure, and it is precisely
what is wrong with COSMIC today. Something must make two equidistant stars into
genuinely different choices.

On a torus the usual answer is unavailable: there is no centre and no edge, and
every cell is topologically identical. That absence is the opening.

> **On a borderless board, debris is the only structure that exists.**
>
> **The player is not choosing what to lose. They are choosing where to build.**

PRIMAL has walls to coil against; CYBER has a closing ring; COSMIC has nothing —
which is why the torus is harder to manage (§2.1) and what makes abandonment
interesting. Scatter your debris and you fragment your own space into pockets you
cannot use. Leave it in a **line**, wave after wave, and you have built the
scaffolding the torus denied you, exactly where you wanted it.

So the question becomes *"which corpse lands where I want a wall, and which lands
in the middle of where I intend to live?"* — a decision with no computable answer,
because it depends on a plan only the player holds.

**COSMIC's verb is terraforming. Routing is how it is done.**

**This defuses the death-spiral risk in §4.** A skilled player's debris makes the
board *more* navigable even as free space shrinks, because structure beats
emptiness for a snake. A poor player's debris fragments the board and kills them.
Same mechanic; the difference is entirely intent — which is the definition of a
skill.

**Design consequences, binding on the dials in §3:**

- **Debris is exactly one block, on the missed star's own cell.** Placement must
  be fully predictable or it cannot be planned, and an unplannable punishment is
  the death spiral this frame exists to avoid.
- **Stars must be individually identifiable before the route is committed**, so
  the player is choosing *this* corpse's location rather than discovering it.

### 2.5 The ratio is an outcome, not a dial

The owner's two framings — *"the window is tight enough that only a perfect route
collects them all"* and *"you can reach 3 of 5, maybe 4 of 5"* — are the same
design at different points in the run, and the reconciliation is the difficulty
curve:

**Fix the window. Let the achievable count degrade with length.**

Early, while the snake is short, a perfect route collects all five. As it grows,
**the snake's own body blocks the optimal path**, so the reachable count falls on
its own — 5, then 4, then 3, then 2. Nothing tunes "how many can they get";
length answers it.

That gives COSMIC a **self-accelerating terminus for free**: the longer the run,
the more stars are abandoned per wave, so debris arrives faster and faster until
the board closes. Rule 15 with a built-in ending, and no schedule anywhere in it.

*Consequently the dial is the window, and the ratio is an observation.* §3's
"constellation size" and "window length" are tuned so the 5→2 degradation lands
across the intended run, not so a particular ratio holds.

### 2.6 Tempo

**COSMIC stays the slow one** (~160 ms). The tick is not a difficulty setting
here; it is the thinking time the routing problem requires. Speed is CYBER's axis
and must not be borrowed.

### 2.7 Score

Per D3 (§6.1): a **mid-weighted** shape with an integral comparable to PRIMAL's
and CYBER's at the terminus. This answers the owner's *"low score because low
difficulty is the opposite of fun"* — a good COSMIC run scores like a good CYBER
run; it simply earns it by routing rather than by surviving.

---

## 3 — Dials for the lab

All [H], all for the owner's hands rather than for argument:

| Dial | Question it answers | Note |
|---|---|---|
| Constellation size | how many stars appear per wave | must exceed what the window allows, or nothing is ever abandoned and the mechanic is inert |
| Window length | how much routing pressure | the tuning dial if calcification feels punishing — **not** the mechanic |
| Scatter radius | how far apart the stars sit | drives whether the wrap is ever the right route |
| Debris per missed star | 1 block, or the star's cell plus neighbours | starts at 1 |
| Base growth | COSMIC's share of the shared growth curve | deliberately *not* combo-linked — that would be PRIMAL's mechanism with a different trigger |

**The invariant to hold while tuning:** the window must make abandonment
*common but not total*. If a competent player collects everything, there is no
decision; if they collect almost nothing, it is a death spiral rather than a
route.

**And the shape to tune toward (§2.5):** a short snake on a perfect route collects
all five; the reachable count degrades to two or three by the intended terminus,
under its own body rather than under a schedule. Measure the degradation curve in
the lab from `run_events` — stars offered against stars collected, by length — the
same way the traverse curve was derived from the owner's record run.

---

## 4 — The risk, stated plainly

**Punishing failure can death-spiral** — miss one, the board tightens, miss more.
That is fatal when the cause is random and acceptable when it is legible. Here it
is fully legible: the window is visible, the abandonment is chosen, the debris
lands where it was left. And a run that spirals is a run that *ends*, which is the
goal.

If it feels punishing in the lab, the fix is the **window**, not the mechanic.

**Also rejected, and worth recording:** a *persistent trail* — fighting where you
have been rather than where you are. Genuinely nobody's mechanic and attractive
for it, but a decaying trail means free space *increases*, which breaks Rule 15;
and a non-decaying trail is the block primitive with extra steps.

---

## 5 — What this deletes

- `COSMIC_FLUX` (`openTicks`, `closedTicks`, `telegraphTicks`) and the wrap-phase
  branch in the collision chain — COSMIC wraps unconditionally.
- The glyph-matching chain rule and `comboCap` as a payout ceiling.
- `groupRadius: 4` clustering, replaced by scatter.

`constellation_crown` (COSMIC's signature gene, "combo cap ×2.4 → ×2.8") loses its
referent and must be re-authored in the same package — flagged for the catalog
pass rather than silently orphaned.

## 6 — Tests

- **Debris determinism.** The set of calcified cells for a given seed and food
  sequence is identical server-side. Same constraint as CYBER's arena: without it
  the run cannot be validated.
- **Rule 15.** Free space non-increasing across every tick; debris never cleared
  by any gene, tier, revive or rung.
- **Overlap invariant** (`TERRAIN_AND_CYBER.md` §1.1) holds on a torus, including
  across the seam.
- **Wrap continuity.** Body segments crossing the seam remain contiguous for
  collision purposes; the head emerging at the far edge cannot land inside its own
  tail undetected.
- **Window honesty.** A scripted perfect route collects the intended maximum and
  leaves the intended debris count, over a seeded sweep.
- **Rate bound.** Scattered stars change the achievable eat rate; COSMIC's
  `maxFoodPerSecond` must be re-derived, not inherited. *(Fourth bound in this
  wave found denominated against an assumption that changed — see the standing
  review question in `REDESIGN_WAVE.md`.)*
