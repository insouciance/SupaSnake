# The Gameplay Proposal — pressure, price, and the build ladder

**Status: PROPOSAL. Not authority.** `docs/PRODUCT_CONSTITUTION.md` remains the
single design authority; nothing here is binding until the owner rules on it and
the relevant sections are amended. This document exists to be argued with.

**Provenance.** Written 2026-07-27 from eight investigations: two code audits of
the shipped catalog and difficulty curves, an in-character critique by a veteran
ARPG/arcade player, and five external research tracks (faction asymmetry, draft
and offer design, threshold systems, difficulty and skill ceilings, ARPG
retention and daily obligation). Every claim about SupaSnake below was verified
against code at the cited path. External claims carry their source. Where a
research agent flagged its own gaps, those gaps are reproduced in §9 rather than
smoothed over.

---

## 0. OWNER RULINGS (2026-07-27)

Four of the five decisions in §3 are ruled. **D1 remains open pending playtest**
(see `docs/game/WP_GROWTH_LAB.md`). The rulings below are binding on everything
downstream; §3 is retained as the reasoning that produced them.

**D2 — Difficulty ladder: ADOPTED.** A fixed, ordered, cumulative ladder
(Balatro Stakes / StS Ascension shape), **not** Hades-style pick-your-own
modifiers. 6–8 rungs, each adding one named rule. Unlock globally, record
per-dynasty. Note: **starting length is a natural rung** — one number, legible,
monotonic, and it compresses the run further at each step.

**D3 — Per-dynasty score curves: ADOPTED, with reduced scope.** The rationale
changed after D1's geometric terminus. When a run ends at an *occupancy* rather
than a clock, every dynasty ends at a comparable food count, so CYBER's 4×
eating-speed advantage stops converting into score. The residual gap is the
multiplier alone (~3×, not the ~10× measured today). Per-dynasty curves are
therefore about **shape** — CYBER front-loaded, PRIMAL back-loaded — integrating
to comparable totals. **Consequence: per-dynasty leaderboards are probably no
longer required, which dissolves the §12.2 collision.** Verify once curves are
drafted.

**D4 — Monotonic length: ADOPTED IN STRONG FORM.**

> **Length only ever increases. Free space only ever shrinks.**
> Nothing shortens the snake. Anything that costs the player costs **growth**.

The weaker draft ("no gene may increase free space, except as a paid capped
exchange") was rejected by the owner on the following reasoning, which is
correct and generalises: *once length is the difficulty clock, removing length is
a **reward**, so any effect priced in "segments removed" is a bonus paid for with
a bonus.* Consequences:

- **INFUSE inverts: pay +8 segments, not −4.** Power bought with board space.
- `shed`, `splice_regenesis`, `splice_molted_rebirth` are **deleted**.
- Ouroboros, Thick Hide and FERAL Molt are **re-signed** to cost growth.
- **Revives must grant survival, not shrinkage.** Phoenix's "reborn at length 8"
  is the largest single violation in the catalog. A second chance should let the
  player *live* (brief self-overlap immunity), never reset their size.
- `Bulk Up` is already the template — *"+3 segments per food, +2 DNA per 10
  segments; cost: the length itself."* It is the only gene that already obeys.
- FERAL's stated identity ("Body — length as a resource") becomes coherent for
  the first time: the strain that grows fastest and profits from being enormous.

**D5 — Daily obligation: KEEP AS IS, with one carve-out.** Owner's reasoning,
accepted: a 24-hour window is not an appointment; the reset time is not a
required login time; and withholding a reward from someone who did not play is
natural rather than punitive. The research supports this — no evidence was found
that weekly beats daily, and the target cohort *accepts a daily as a ceiling and
rejects it as a floor*.

**The carve-out — the clan roster.** The owner's argument covers the *individual*
reward and holds there. It does not cover the *social* one: `SerpentPanelMember`
ships each member's attempts and depth, so **teammates can see a zero**. That
converts a personal choice into a social debt, and the cost lands on people who
did not choose it. Churn is contagious (Kawale et al., IEEE SocialCom 2009, on
EverQuest II). **Show clan totals, not per-member attempt counts.**

**Still to test, not decided:** one-day charge carryover (ceiling 12) against the
current no-carryover rule. §17.

---

## 1. How to read this

Read §2, then §3, then stop and rule on §3. Everything after §3 is contingent on
those rulings and can wait.

The temptation is to start tuning numbers. Resist it for one round: right now we
cannot distinguish "PRIMAL is too easy" from "PRIMAL is fine but six of them a
day is too many," and those have opposite fixes. §8 is how we tell them apart.

---

## 2. The diagnosis

### 2.1 Three facts that explain nearly everything

**Fact one: reward and pressure are decoupled, in opposite directions.**

| Dynasty | Tick interval | Score multiplier | DNA per food |
|---|---|---|---|
| PRIMAL | **200 ms, constant forever** (`rulesets.ts:135`) | **×1, constant** (`:137`) | grows linearly, **never caps** (`:136`) |
| CYBER | 200 → 50 ms across foods 0–100 (`:150-154`) | caps ×3 at **food 20** (`:119-126`) | caps at 30 DNA at **food 20** (`:155`) |
| COSMIC | **160 ms, constant** (`:220`) | **×1, constant** (`:222`) | — |

PRIMAL pays more the longer you stay and never gets harder. CYBER gets four
times harder between foods 20 and 100 while per-food reward is pinned. (Throughput
does rise on CYBER because you eat faster — the defect there is *legibility*, not
arithmetic: the HUD shows ×3 and then freezes for eighty foods while the game
visibly tightens.)

**The consequence is that the central mechanic is inert.** BANK / PASS / INFUSE
is only a decision if the answer isn't known in advance. With `extractMultiplier:
1.25` against `deathMultiplier: 0.6` (`rulesets.ts:99,101`) — only 2.08× apart —
the first portal on PRIMAL needs roughly a **4% survival chance** for PASS to be
correct. On CYBER the break-even is *negative*: dying later pays more than
banking now. It doesn't become a real wager until food 51–63, four minutes into a
PRIMAL run.

A central mechanic that trains its own irrelevance.

**Fact two: the catalog deletes the only difficulty curve Snake has.**

Classic Snake's difficulty ramp is the body: free space is `n² − L`, falling
hyperbolically on a fixed tick. The game gets harder *because you succeeded*. No
designer authored it and it can never desync from player power, because it **is**
player power. Every comparable roguelite has to bolt this on — Hades needed the
Pact of Punishment, Slay the Spire twenty Ascension levels, Vampire Survivors
sells Curse and Charm, Risk of Rain 2 a time coefficient, Dead Cells Malaise.

We get it free from geometry, and then spend it. Classification of all 49 catalog
entries (34 genes + 15 strain tiers):

| Bucket | Count | Share |
|---|---|---|
| Amplifier — multiplies a number, changes nothing | 17 | 35% |
| Converter — trades one resource for another | 14 | 29% |
| **Insurance — deletes a failure state** | **12** | **24%** |
| **Constraint — adds a rule you must play around** | **6** | **12%** |

**Twelve deletion mechanics against two real failure states** (wall, self —
extraction is the win condition, not a failure). A Rift Aura build makes all four
walls wrap permanently; add Phantom Coil, Serpentine and a revive and the run has
no reachable terminal condition at all.

**And the deepest damage is second-order.** `shed` (`mutations.ts:92-98`) resets
the tail to length 8 flat, every 25 foods, for −10% food DNA. INFUSE is priced in
body length. **If length can be safely discarded, length is not a cost, and
INFUSE becomes free.** Shed is not an overpowered gene; it is a *price control*
that de-prices the mechanic every other decision is denominated against.

Note WP-2.09 fixed **Molt** (FERAL tier 2, every 20 foods, now proportional with a
compounding speed cost) and left `shed`, `splice_regenesis` and
`splice_molted_rebirth` on absolute resets to 8.

**Fact three: the leaderboard measures dynasty choice.**

Both PRIMAL and COSMIC ship `scoreMultiplier: () => 1`. Only CYBER has a curve.
Combined with CYBER's 4× faster floor, score per minute differs by roughly an
**order of magnitude**. Rule 2 passes mechanically — the fold reads only food
events and the ruleset — but its stated purpose ("Score measures the pilot") is
not served. Two of three dynasties cannot post a competitive number under any
circumstances.

### 2.2 The strategic finding

Quantic Foundry (Nick Yee, n > 140,000): *"Among the 12 motivations we measure,
the interest in Competition changes the most with age"* — and Competition and
Community are **positively correlated (r = .45)**, loading on a single social
factor. **Strategy is the most age-stable motivation.**

The standard move — a leaderboard for competitive players, a clan for social ones
— is therefore incoherent for a 35–45 audience. They are the same axis, and it is
the axis that fades fastest with age. Retention weight belongs on **Strategy**.

Which makes the following the sharpest warning in the research:

> Devil Daggers — one achievement, earned by **0.4%** of owners, community-reported
> churn at *"7 to 10 hours at best."* Super Hexagon's negative reviews: *"There
> really is no feedback loop or incentive to keep playing"* / *"your only reward
> for doing good is a new high score."*
>
> **Because Score is build-independent by law, these two games are what SupaSnake
> becomes if the build ladder is never built.**

The veteran-persona critique reached the same place independently and refused to
blame Rule 2 for it: *"Yield is not a ceiling, it's income. There is nothing my
build lets me do that a bad build can't. There is only more of the same."*

**The problem is not that builds don't move Score. It is that builds have nothing
to defeat.**

---

## 3. Decisions only the owner can make

Everything in §4 onward is contingent on these. Ranked by how much else depends
on them.

### D1 — Time-to-first-pressure *(blocks everything)*

**Reframed 2026-07-27 by owner playtest and production measurement. The original
framing — "target run length" — was wrong, and is kept below for the record.**

**The measurement.** 144 completed runs from production:

| Dynasty | Median foods | Median duration | Best run ever |
|---|---|---|---|
| PRIMAL | 30 | 2:41 | 149 foods |
| CYBER | 31 | 1:39 | 84 foods |
| COSMIC | 29 | 1:13 | 161 foods |

The board is 20×20 = 400 cells and length is `3 + foods`, so:

- **median run = 8% board occupancy**
- **best run ever recorded = 41%**

**Nobody has ever filled the board, or come close.** The geometric difficulty
curve — the one thing Snake gets for free — has never engaged in production.
Players die at 8% occupancy, which means they die to attention lapses on an
essentially empty field.

**The owner's finding, playing a 10-minute PRIMAL run to 119 foods (30%):**

> *"Before, it wasn't much fun — not boring, but the thrill was absent, because
> even if you die you always know it was because you weren't focused for a
> moment. **Focus isn't our fun-mechanism.** You need focus, but it should be
> more condensed."*

Attention is a *precondition* for play, not a source of it. That run was **eight
minutes of setup to earn two minutes of game**.

**So the design target is not run length — median duration is already 1–3
minutes, inside the intended band. The target is TIME-TO-FIRST-PRESSURE.**
Pressure appears to begin around 30% occupancy; today that takes ~8 minutes, so
for half of all runs the game never starts.

**Proposed: pressure from ≈0:30, median run ≈3 min.** Then the whole run is game.

Three changes, all small, none of them a new system, none touching the economy:

1. **Growth rate up** — this sets time-to-pressure and is the headline change.
   ~+3 length/food reaches 30% occupancy inside ~40 foods on the current board;
   ~+1.5 does it on a 14×14. Board size (`gridSize: 20`, `game.ts:24-27`) and
   growth trade off against each other; a 16×16 with +2 splits the difference.
   Note growth alone cannot produce both a tight median and a large tail —
   occupancy scales with food count, so the median:best ratio is capped by the
   food-count ratio (~5×). Accelerating growth (+1 early, +2 past 25, +3 past 50)
   terminates the run sharply rather than asymptotically and is the most
   Snake-native shape.
2. **PRIMAL tick slightly faster** (200 ms → ~170–180; COSMIC is already 160).
   This attacks the *dead walk*, not the difficulty.
3. **Unreachable food expires and respawns.** See the pocket mechanic below.

**The pocket mechanic — emergent, unauthored, and worth protecting.** The owner,
late in a long run: *"it becomes about leaving escape routes and leaving no
spaces, because if food spawns in that pocket you have to wait until the body
isn't in the way."* Avoiding self-enclosure is real skill. But its price is
**dead time**, which is the same defect as the long walk. Keep the lesson, change
the price: an unreachable food should expire and respawn, so enclosing space
costs yield and tempo but never seconds of the player's life.

**The general principle these share:** *pay in the currency of the game, never in
waiting.* Coiling is currently taxed with long traverses; pockets are taxed with
dead waits. Both are correct skills priced in the wrong unit.

#### D1 modelled against real run data (2026-07-27)

**Source.** The owner's record run — 180 foods, score 1800, PRIMAL, 26:26 — read
from `game_sessions.run_events`, which stores per-food stamps as
`{e:'f', n:<index>, t:<deciseconds>}`. Unit confirmed: the death event at
`t=15864` is exactly `duration_seconds = 1586`. Final length was **171 (42.8% of
the 400-cell board)** after three infuses at −4 segments each — not 46%.

**No length resets were active** (`expressions: {}`, no shed/molt gene), so
occupancy tracks `3 + n − 4·infuses` cleanly. The run held `wall_rush` and
`pocket_rift` — two wall-death removers — and ended on a **self**-collision.

**Traverse cost, measured.** Six gaps were owner pauses to write session notes
(196 s and 186 s at foods 133 and 120). Trimming gaps > 45 s leaves 177 foods and
**18.9 minutes of actual play**. Robust fit over the trimmed set:

> **seconds-per-food ≈ 3.5 + 14.0 × occupancy**
> (4.2 s at 5% → 7.0 s at 25% → 9.8 s at 45%; a **2.3×** slowdown, not the 4×
> the uncorrected data suggested)

**Model validation: predicts 19.8 min for today's configuration against 18.9 min
actually played — within 5%.** Everything below uses the same fit.

**Projections.** "@20%" is minutes until pressure begins; "end" is minutes to the
45% occupancy where the owner died; "+fix" holds seconds-per-food at 4.0 via
traverse mitigation (multi-food spawning and/or tick scaling with length).

| Configuration | Foods | @20% | end | end +fix |
|---|---|---|---|---|
| **TODAY** — 400 cells, start 3, +1 | 177 | — | **19.8** | 11.8 |
| start 60, +1 | 120 | — | 15.4 | 8.0 |
| start 60, accelerate +1/10 foods (cap 6) | 44 | — | 5.3 | 2.9 |
| start 30, +3 flat | 50 | — | 6.0 | 3.3 |
| 14×14 = 196, start 20, accel +1/15 (cap 4) | 38 | — | 4.4 | 2.5 |
| owner's shape, as first stated: +5 <15, +1 <45, accel/10 | 79 | 1.9 | 9.2 | 5.3 |
| owner's shape, tightened: +6 <12, **+2** <32, accel/6 (cap 8) | 53 | **1.5** | 6.2 | **3.5** |
| owner's shape, aggressive: +8 <10, +2 <28, accel/5 (cap 10) | 47 | **1.1** | 5.6 | **3.1** |

**Three conclusions.**

1. **Neither change alone is sufficient.** Geometry alone lands at 5.5–6 minutes;
   traverse mitigation alone leaves today's config at ~12. **Together they land
   at 3.1–3.5** — the target band, from two changes neither of which is a system.
2. **The owner's fast-plateau-accelerate shape works, but the plateau must be +2,
   not +1.** The plateau holds most of the run's foods, so it dominates total
   time: raising it from +1 to +2 moves the run from 9.2 to 6.2 minutes on its
   own. Non-monotonic growth curves have strong precedent (TGM's relief plateaus
   and false summit; NES Tetris's flat levels 19–28, "where all skilled play
   lives"; Pac-Man's speed peaking at level 5 of 255).
3. **Pressure should begin around 1.5 minutes**, which the tightened shape
   delivers. Today it begins at roughly minute eight, which is why half of all
   runs — median 8% occupancy — never reach the game at all.

**Recommended starting point for playtest:** board unchanged at 20×20, start
length 3, growth **+6 for foods 1–11, +2 for foods 12–31, then +1 per 6 foods to
a cap of 8**, plus traverse mitigation. Projected: 53 foods, pressure at 1:30,
run ends near 3:30. Put it behind a flag and let the owner's hands confirm or
reject it — the model is calibrated to one player on one dynasty and should not
be trusted past that.

**Caveat carried forward:** the fit is drawn from a single PRIMAL run at a fixed
200 ms tick by an expert player. CYBER's ramp and COSMIC's wall cycle will
produce different traverse curves, and a weaker player's curve is unknown.

---

*Original framing, superseded but retained:*

### D1-old — Target run length

Nothing can be balanced against an unstated target. Current reality: PRIMAL is a
**10–20 minute** run at its optimum (it only out-earns CYBER per minute past
~food 551, roughly forty minutes in). The Constitution's own first sentence says
**"a three-minute precision snake game"** (`PRODUCT_CONSTITUTION.md:44`).

Industry benchmark (GameAnalytics 2025, 11,600 apps, 1.48bn MAU): median session
**5–6 min**, ~4 sessions/day, **median total daily playtime 22 minutes**. Six runs
at five minutes is **30 minutes of indivisible mandatory play against a 22-minute
daily budget** — before any Lab, breeding or shop time.

**Recommendation: median run 90 s, skilled ceiling ~2:30, authored terminator
4:00.** Six runs ≈ 12–14 minutes. Your Constitution's thesis was right; the code
never obeyed it.

*Ruling needed: accept, or state a different target.*

### D2 — Does the game get a difficulty ladder? *(the retention decision)*

Per §2.2, this is the difference between a game with a three-week ceiling and one
with a two-year one. Evidence favours a **fixed, ordered, cumulative ladder**
(Balatro Stakes / StS Ascension shape) over pick-your-own modifiers. A Hades
player, unprompted: *"The heat system is too sandbox-y… I sort of feel I'm
cheesing it."* And: *"If you're 'Heat 20', there's no telling what modifiers
compose that."* A20 became a community identity marker; Heat 20 never did.

Ladder attrition by depth: Slay the Spire (long runs, 20 rungs) → **7.3%** reach
the top; Brotato (~20-min runs, 6 rungs) → **36.2%**; Peglin (20 rungs) → **1.9%**.

**Recommendation: 6–8 rungs, each adding one named rule, per dynasty. Unlock
globally, record per-dynasty** — Slay the Spire's loudest ten-year complaint is
the per-character re-climb.

*Ruling needed: build it, or accept the score-attack ceiling.*

### D3 — Do the three dynasties get different score curves?

`scoreMultiplier(n)` is exactly what `verify:constitution` permits the fold to
read, so per-dynasty curves are **legal today** and are the cheapest fix for §2.1
fact three. But differing curves likely force **per-dynasty leaderboards**,
which collides with §12.2's cap on public numbers.

*Ruling needed: per-dynasty curves + per-dynasty boards, or leave the 10× gap.*

### D4 — Does the Constitution adopt the free-space invariant?

> **No gene may increase free space.** A gene may move length, transform it,
> borrow against it, or change what collides with it — but the board must never
> get emptier.

One line, checkable at review, and it would have prevented this entire class of
problem. Candidate for the Inviolable Rules.

*Ruling needed: adopt as a Rule, adopt as guidance, or reject.*

### D5 — Is the daily obligation reshaped?

Facing it squarely: Zagal, Björk & Lewis (FDG 2013) define **Playing by
Appointment** as *"games… requiring that players play at specific times as
defined by the game rather than the players."* A 00:00 UTC refill plus a Daily
Take streak is taxonomically that pattern. The Constitution's mitigations are
real — one-tier cooling, never a reset to zero, nothing owned ever lost — but the
design should know the name of what it is doing.

Two evidence-backed adjustments:

1. **Charge bankability.** §8.6 says charges "never accumulate, never carry
   over." Three franchises independently converged on an overflow bank past the
   daily cap (Genshin Condensed Resin, HSR Reserved Power, Warframe Medallions)
   and all read positive; FFXIV, which has no bank, draws *"disrespecting player
   time."* Our 25% soft tail is probably what protects us — the cap never blocks
   play. Worth testing a **one-day carryover (ceiling 12)** against the current
   rule.
2. **Strip the implicit ranking from the clan roster.** `SerpentPanelMember`
   ships each member's depth and attempts, so **zeros are visible to teammates**.
   That is the single most FOMO-capable object in the engagement stack. Churn is
   contagious — Kawale et al. (IEEE SocialCom 2009, EverQuest II): *"the
   probability of churn increases with the number of churner neighbors"* — and
   Ducheneaut et al. (CHI 2006) found **21% of observed guilds gone within a
   month**. The six-run pressure you felt is *perceived*, not designed: Serpent is
   best-of-three, costs no Energy, pays no DNA, and Rule 8 forbids thresholds.

*Ruling needed on each.*

---

## 4. The changes, ranked by leverage

Contingent on §3. Each states its evidence and whether it is a subtraction
(Rule 12 prefers those).

### T1 — Convert `shed` into terrain *(subtraction-shaped; fixes two systems)*

**Shed converts the shed tail into inert static obstacles that remain on the
board.** You lose the *self*-collision hazard for those segments and gain a
*terrain* hazard. `n² − L` is preserved exactly, the difficulty clock never
rewinds, and length becomes a real cost again — which re-prices INFUSE as a side
effect. It reads instantly on screen.

Apply the same treatment to `splice_regenesis` and `splice_molted_rebirth`.

### T2 — Make PASS pay, in length, and quote it before the choice

Declining is currently a null action, and loss aversion guarantees a null action
feels like a loss. Every game that solved this converted refusal into a *gain*:
Vampire Survivors' Skip grants XP; Slay the Spire's Singing Bowl adds a literal
third button; Balatro pays interest so restraint compounds.

**PASS grants body length** — the exact inverse of INFUSE, making the portal one
coherent axis. And because length compounds difficulty through `n² − L`, **taking
the safe option makes the game harder.** That is a self-balancing loop available
to no other game in the genre.

Show the value **on the portal, before committing** (Balatro's tag preview).

### T3 — Dual-tag the gene catalog *(data change, not a mechanic)*

**31 of 34 genes carry exactly one strain** (`genes.ts:74-96`; only
`ancient_grove`, `afterburner`, `solstice_engine` are dual). TFT gives every unit
2–3 traits — verified across sets, ~60 units × ~2.2 traits ≈ 130 memberships over
~27 traits — because that is what manufactures near-miss continuously, for free,
with no RNG, and what makes pivoting cheap. (Auto Chess and Underlords are
reported to have used exactly 2, but see §9 — that comparison is unverified.)

> With one trait per pick, a synergy system is **a partition, not a graph**, and
> near-miss becomes pure draw luck.

Probably a bigger unlock than any individual gene rewrite, and it is a data edit.

### T4 — Convert insurance into constraint, five ways

Not "delete nine of twelve" — convert. Each is field-proven:

| | Conversion | Source |
|---|---|---|
| C1 | Consumable **and slot-occupying** | Balatro Mr. Bones — self-destructs, while occupying 1 of 5 slots the whole time it waits |
| C2 | Costed in the currency it protects | Isaac Devil Deals — bought with health |
| C3 | **Rule-swap, not deletion** | Isaac Cursed Eye / Tiny Planet / Brimstone |
| C4 | Cost scales with your own power | Isaac Ipecac — half a heart under 85 damage, a full heart at 85+ |
| C5 | Categorical constraint attached | StS boss relics — +1 Energy for a deleted subsystem |

**The rule:** a defensive upgrade should change **which** mistakes kill you, never
**whether** mistakes kill you.

For wall-bounce, C3: *"walls no longer kill — you exit the opposite side, but your
tail does not follow for 0.5 s, leaving a gap you must navigate."* Note plain
bounce also silently makes the arena a torus, deleting corner-trapping.

Target mix: constraints **12% → 40%**, deletion **24% → 5%**, amplifiers
**35% → 15%**.

### T5 — Put strain progress on the offer card

*"VOLT 4/6 → tier 2 unlocks: [effect]"*, with locked tiers greyed rather than
hidden. **Three independent research tracks recommended this.** Magic killed a
Delirium variant purely because *"it's a lot harder to track"*; Coven flopped for
requiring a derived property; GGG deleted an entire item class for being too
*"subtle."*

The test: *if a player cannot say aloud where they stand without doing
arithmetic, the mechanic is already failing regardless of balance.*

At six picks the whole state fits on screen — an advantage TFT cannot use, and
which it pays for with a cottage industry of third-party overlays. This is also
the same defect that made the Workbench unreadable (a gene's strain invisible
until selected).

### T6 — Ungate endowed progress

Nunes & Drèze (2006): an 8-stamp blank loyalty card → **19%** completion; a
10-stamp card with **2 pre-stamped** → **34%**. Identical work. A **79% relative
lift from framing alone.**

Heirloom spawn points cap at 2 and tier 1 is at 2, so an endowed snake starts
exactly at the first rung — textbook. But `spawnPointsUnlocked` requires
**12 banked runs and 2+ owned variants** (`genePool.ts:65`, `game.ts:170`). The
strongest motivational device in the literature is switched **off for every new
player** and on only for veterans who no longer need it.

### T7 — Add BANISH

Of the four curation verbs — skip, banish, lock, remove — banish is the highest
value and costs **zero new content**. "PASS" versus "NEVER." Every purge is a
declaration of build intent, so every later offer gets denser.

Ship reroll **last or never**: Vampire Survivors prices rejection at 100g and
re-draw at 1,000g, and the mobile clones that kept only reroll did so because
reroll is sellable. That is a monetisation artefact, not a design improvement.

### T8 — Cap CYBER at a reaction-safe floor; escalate density instead

Below ~250 ms per decision a game stops being reactive. Applying Canabalt's rule
(visible runway ≥ 3× simple reaction time ≈ 190 ms), the floor for a grid game is
**~100–120 ms per cell**. **CYBER's floor is 50 ms** — roughly twice as fast as
the human reaction floor.

Do not fix this by ramping differently. Pac-Man's speed **peaks at level 5 of 255
and then goes down**; NES Tetris plateaus flat for ten levels; Geometry Dash's
entire speed range is 2.29× with no in-run ramp; Flappy Bird has none. Tetris
holds 20G constant from level 500 and escalates by compressing windows instead.

And **do not tighten leniency as speed rises** — StepMania uses identical judgment
windows for a 3-footer and a 19-footer. Constant leniency plus escalating demand
is the difference between "fast and skilful" and "fast and random."

Input is **not** the problem: the engine ships a 3-deep direction queue validated
against the queue tail (`SnakeGameLogic.ts:588-589,1121-1135,1279-1283`), which
exceeds the depth-2 standard the research recommends. The two levers left are
Pac-Man-style pre-turn (reward an early turn with a fractional-cell head start)
and coyote time, of which there is currently **none**.

### T9 — Instrument pick rate *(most time-sensitive)*

Slay the Spire ran a metrics server **from prototype stage**, on two numbers:
**pick rate** and win rate. Giovannetti: *"too low and it's basically not a card
in our game at that point."*

The moment PASS ships, the offer pool becomes **empirically auditable** — we would
know within a week which of the 34 genes are dead weight instead of arguing. The
population isn't there yet (415 rows, 15 completed runs), but instrumentation is
nearly free now and expensive to retrofit. **Pre-launch is the window.**

---

## 5. Dynasty asymmetry — the second wave

Today the three dynasties differ along **one axis** (rate) applied to **one
pressure vector** (speed) with **one failure mode** (collision). That is the
definition of stat variation.

The substrate is unusually rich: **body length is simultaneously the score proxy,
the difficulty source and the INFUSE currency.** Asymmetry should reroute *which
of those three roles dominates* — a re-weighting, not a new system.

**Three bets:**

1. **Different failure modes.** CYBER dies to reflex; PRIMAL to spatial
   strangulation (its body never shrinks, the arena closes); COSMIC to a decay
   clock, never to a wall. Architecture, not tuning.
2. **Remove a portal verb from each.** One boolean each: one cannot BANK, one
   cannot INFUSE, one can only INFUSE. Three different portal games from three
   booleans, score-neutral, and it is *subtraction* (Rule 12). Hades' Aspect of
   Beowulf is the proof that deleting a capability creates more identity than
   adding one.
3. **Tax Yield by body length** — Warcraft III upkeep, transplanted. A long snake
   earns almost nothing, so the only way to keep earning is to spend length at
   INFUSE. **Endless becomes unprofitable rather than lethal** — no wall, no
   hazard, no forced ending, and INFUSE becomes an economic engine.

**COSMIC may already be the template**: constant 160 ms, but the only recurring
lethal-state oscillation in the game (walls cycle ~12 s open / 8 s closed with a
telegraph). Authored rhythm rather than a monotonic ramp.

---

## 6. Traps

- **Adding more genes.** 34 is not too few. RoR2 has ~120 items and produces
  fewer decisions than Balatro's 150, because Balatro has five slots. Content is
  not the bottleneck; constraint is.
- **Renumbering the flat multipliers.** Retuning 35% of the catalog leaves the
  category still differentiated *in degree*. Rewriting a third of them as rule
  changes is less work and fixes the actual problem. Better still: demote them to
  the common tier and make them the rarity that **advances the pity counter** —
  filler becomes the disappointment the system measures.
- **Cranking synergy-aware offer weighting.** Soren Johnson: unlimited choice
  *reduces* variety, because players converge. RoR2's Artifact of Command is the
  live experiment — hugely popular, universally acknowledged to make the game
  worse. Keep one offer slot that never bends to the player's build.
- **Escrowed or deferred BANK.** Hades can revoke a payoff because you can dodge;
  Snake death is a 200 ms input error with no recovery frame. Keep BANK
  instantaneous and inviolable.
- **New core verbs per dynasty.** Highest ceiling in the taxonomy, but three
  control-feel tuning problems and 3× QA in a 3D game, and it destroys the shared
  muscle memory that makes trying a second dynasty feel good. Post-launch.
- **Threshold tiers that only add numbers.** Riot's own Set 5 post-mortem: *"So
  many big verticals were just stat buffs… none of the traits felt truly
  transformative."* Capstones must be a new verb.
- **A second "escape a death" gene.** There are twelve. At most one should
  survive, as a C1 consumable.
- **Small-upside/small-downside genes.** Losses loom ~2× larger than equivalent
  gains, so a *mathematically fair* tradeoff is systematically refused. **Tune
  tradeoff genes generous** or the pattern will look like it doesn't work.
- **Hiding the cost in a tooltip.** Brotato prints it in red on the card. A
  portal is on screen for about two seconds.
- **A global top-100 leaderboard.** Yu-kai Chou: *"Most leaderboards kill
  motivation for 90% of their users."* Mekler et al. (2017) found points, levels
  and leaderboards moved performance but **not intrinsic motivation**. The
  you-centred ±5 default is correct and should stay. Relatedly,
  server-authoritative settlement is a genuine competitive differentiator:
  client-trusted scores are the most-cited reason players quit Slay the Spire's
  dailies.

---

## 7. What is already right

Worth stating, because most of this document is criticism.

- **Every gene has a printed cost.** A discipline most shipped games lack.
- **Every gene works without its threshold.** PoE's threshold jokers carry a real
  stat line under the conditional; Rosewater's fix for parasitic design is that
  energy cards "in a vacuum" are still playable. Diablo 3 is the counterexample —
  4-piece and 6-piece bonuses differ by 10–100×, and Blizzard had to bolt on
  Legacy of Dreams to make setless builds survivable. We got this right.
- **Threshold spacing (2/3/4) is correct for six picks.** `+1` spacing caps the
  near-miss at one pick. Riot's Set 3 post-mortem names the alternative failure:
  *"Cybernetic required an early 3 and then you were locked into 6 or you weren't
  playing it."*
- **The extraction mechanic itself.** INFUSE is a Devil Deal denominated in the
  game's real currency — the structure Isaac spent a decade proving works. Most
  roguelites must *invent* a currency that hurts to spend; Snake gets one free.
- **The economy's ethics.** The veteran critique called it *"the least predatory
  implementation of its type I have seen in a live codebase"* — no minting path,
  lean-never-zero, a DB CHECK making a streak reset structurally impossible, the
  banned-word lint on Ascension copy, the Workbench refusing to quote a
  probability it cannot compute honestly. Its closing advice was: **fix the wall,
  fix the salvage curve, fix the insurance stack — do not touch the ethics.**
- **Low restart latency.** ≤2 taps from Results to REPLAY is the right answer to
  a documented problem (Baijens' study of 152 Overwatch players found people
  intending another game and leaving *during* the post-match screen).

---

## 8. The feedback instrument

Only the owner can say what is fun. Free-form "that felt boring" is unusable; a
long questionnaire dies by the third run. Three questions per session, in
feelings rather than design vocabulary:

1. **When did you feel most in control?** (flow peak)
2. **When did you first stop caring?** (the single most valuable datum)
3. **What did you want to do that the game wouldn't let you?** (agency gap)

**The multiplier: a rough timestamp or food count with each answer.** Every run
already stores its events, duration and food count, so *"it got boring in the
middle"* becomes *"food 47, tick 90 ms, length 38, three molts in"* — a tuning
problem instead of an opinion.

Two protocol rules: play the same dynasty back-to-back when judging it (mood
varies more than the build does), and **record the boring runs** — the ones not
worth reporting are the ones carrying the signal.

---

## 9. Provenance and gaps

Honest limits, reproduced from the research rather than hidden:

- **Diablo 2 partial-set ladders** — unverified; every database blocked. Do not
  cite the incremental-ramp claim as established.
- **Hades boon/Chaos/duo specifics** — the Hades sub-agent never reported. Death
  Defiance's charge structure and the Pact's per-weapon bounty structure were
  verified directly; Chaos "curse then blessing" numbers are model knowledge.
- **Hearthstone and Slay the Spire relic counters** — nothing verified.
- **Post-2016 near-miss replication failures** — not retrieved. The supported
  claim is that near-misses are *simultaneously arousing and unpleasant and the
  motivational half depends on perceived agency*; **not** that they reliably
  increase persistence.
- **Whether TFT has a purchase-time trait-activation preview** — unconfirmed.
- **Build-diversity and chase-item research** — that stream failed outright.
- **Fabricated source flagged:** `gamepulse.best` served quotable LocalThunk
  material and appears to be fabricated. Do not cite it.
- **Fabricated attribution flagged, inside our own research.** The threshold
  research agent self-reported that it had earlier claimed to receive sub-agent
  outputs on **Dota Underlords** and **Monster Train** which never arrived, and
  that *"the specifics I attributed to them were not real."* Consequently:
  every **Underlords** claim in this document and in the research summaries is
  **unverified** — including the Champion alliance's per-Alliance breadth payoff
  ("3% bonus damage and 8% max health per active Alliance") and the trait-panel
  comparison (Underlords' right-side tabs, Auto Chess having no panel). The
  *idea* of a per-distinct-trait breadth payoff as a solo-compatible
  anti-stacking lever is sound on its own terms; the attribution and the numbers
  are not evidence. Verify before citing or implementing. The TFT material is
  unaffected — it arrived separately, sourced to Riot patch notes and
  `wiki.leagueoflegends.com`.
- Corrections absorbed: "orthogonal unit differentiation" is **Harvey Smith,
  GDC 2003**, not Soren Johnson; Slay the Spire's Neow has no "lose 33% max HP"
  option; Balatro has no official daily challenge; the WoW rested-XP inversion
  story is folklore with no named Blizzard source.

**Four of my own claims were refuted during this work and are recorded here so
they are not repeated:**

1. That CYBER's problem was dropped inputs — the queue is 3-deep and validated
   against the queue tail, exceeding the depth-2 standard the research
   recommends.
2. That CYBER foods 20–100 give no additional reward — per-food reward is flat,
   but throughput rises with tick rate. A legibility defect, not a balance one.
3. **That the run needs an economic horizon** (decaying per-food value, decaying
   salvage, length-taxed yield) to terminate. Withdrawn: it is a second
   difficulty system bolted on to substitute for the native one, which exists and
   simply arrives too late. The owner's objection — *"the point of snake was
   always to get long, and the longer you are the more difficult it gets; that
   should be the natural cutoff"* — is correct, and the production measurement
   in D1 supports it. Fix the geometry, not the payout curve.
4. **That food spawns should be biased toward the occupied region** to shorten
   traverses. Withdrawn: it would increase enclosed-pocket spawns, converting a
   good tension into dead waiting. The corrected version is in D1.

A wall-clock run bound was also considered and rejected: value scales with
foods/minute, so a seconds-based bound makes CYBER (50 ms floor) strictly
dominant over PRIMAL (200 ms) by roughly 4× and reduces the slow dynasties to
handicaps. Any horizon must be indexed to foods, portals or board state — never
to seconds.

---

## 10. Suggested sequencing

1. **Rule on §3.** D1 gates everything.
2. **T5 + T6** — legibility and ungating endowed progress. Cheap, no balance risk,
   and they make the owner's own playtests interpretable.
3. **§8** — stand up the feedback log; play PRIMAL and CYBER back-to-back.
4. **T9** — instrument pick rate before the population arrives.
5. **T1 + T2 + T4** — the pricing changes, together, since they interact.
6. **T3 + T7** — dual-tagging and BANISH.
7. **T8** — the CYBER floor, measured against the owner's session data rather
   than in the abstract.
8. **§5** — dynasty asymmetry, as its own wave.

Nothing here is a work package yet. Work packages come after the rulings.
