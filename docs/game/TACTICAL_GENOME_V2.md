# SupaSnake — Tactical Genome v2

**Version:** 2.5

**Date:** 4 August 2026

**Status:** APPROVED for production by the Product Owner; governed by Product
Constitution v1.14.

This contract supersedes the active catalog, tuning, FTUE, portal-Genome,
Strain, Splice, and outcome-cap rules in `BUILDCRAFT_GENOME_DESIGN.md` v1.1.
That document remains the historical foundation for the Genome vocabulary,
lineage, offer gravity, body expression, Research, and server-verification model.
Where the two disagree, this document and the Constitution win. Historical
Genome v1 sessions, records, and discoveries remain readable under their
original rules.

## 1. Product thesis

The Genome is the run's tactical centre. Snake execution creates the opportunity;
buildcraft determines how much a skilled player can extract from it. A good or
bad Genome is allowed to create a large Yield difference, provided the difference
comes from legible decisions, Dynasty fit, execution, risk, and opportunity cost.
The system does not normalize every build or recommend one optimal answer.

A gene must materially affect at least one of:

- Yield and compounding;
- banking, deferred value, or crash exposure;
- route execution;
- body growth and spatial pressure;
- movement or permanent terrain;
- survival and insurance;
- offer, slot, or Splice control.

Dynasty non-neutrality is intentional. Understanding which mechanic fits the
current Dynasty, board, length, speed, Carry, portal position, and clan threshold
is part of mastery. There must not be one terminal Genome that is correct for
every run.

## 2. Tactical Loom

An ordinary cadence opportunity begins as a physical board relic, not an offer
or modal. Only deliberate collection creates the Gene Offer and rolls its
candidates; merely reaching the food threshold never does either. The simulation
freezes only when the snake collects that relic; portal MUTATE freezes only after
the player deliberately opens MUTATE. In both cases the board remains visible as
decision context. The three offer verbs are:

- **THREAD** — take the focused candidate into an open locus;
- **FORK** — pursue the focused candidate through an explicit replacement when
  all six loci are occupied;
- **DECLINE** — spend the offer and keep the current Genome.

The first view has no preselected answer. It presents two equally weighted rune
choices, each with written Strain badge(s) and one highest-salience consequence,
plus a quiet DECLINE (or Back during portal inspection). Focus and hover never
select. Once the player selects a choice, one shared quick read names its trigger,
gain, and risk. Its job is immediate intuition, not catalog research.

An optional **UNFOLD DETAILS** action reveals the focused reaction, including
the small amount of future context required to understand that reaction:

- the gene's primary identity, concrete gain, meaningful risk, and trigger rhythm;
- the locus added or replaced;
- every explicit Strain name/rune on the candidate and the complete affected
  2/3/4 route, with the current transition visually dominant;
- every directly connected Splice branch, visibly marked as forming, future,
  closed, broken, locked, or requiring Recode;
- second-life exclusivity, Ash, and another direct socket conflict when relevant;
- body growth, permanent terrain, or changed target identity when relevant;
- the exact delta to Bonds, Escrow, Stake, Carry, Anchor, or another persistent
  liability when the action changes it.

It does not carry unrelated ladders, the full Splice catalog, unchanged ledgers,
broad BANK/crash projections, or a broad expert dashboard. The detail state is
ephemeral and resets closed for each offer. It never says `best`, `recommended`,
or supplies an automatic ranking. Mobile uses compact rune
choices and the same single focused reaction map rather than three long cards.
Every candidate and held/replacement locus makes Strain identity legible before
inspection through a compact badge containing rune, independent family color,
and the written name. Dual-Strain genes retain two distinct badges. Neither
color alone nor description copy is an acceptable substitute.
The first read must expose candidate identity, written Strain, one salient
consequence, and confirmation in a practical phone viewport. Selecting exposes
gain/risk and trigger; unfolding exposes the affected routes and immediate Splice
fate. A tapped rule may use the frozen surface's contained scroll rather than
truncating a material consequence; catalog exploration still belongs outside the
run.

A short input lock prevents the flick or key that opened the decision from
selecting an action. After selection, a brief pointer-transparent callout names
what activated and what it boosts. Later trigger feedback remains legible without
consuming steering input. During ordinary live play, notifications and
celebration are likewise pointer-transparent.

The reducer is also the sole authority for the live board picture. Every active
exclusive target receives an in-world identity and, where relevant, its current
movement budget; a future Crown star is visibly ghosted and remains explicitly
non-edible and non-colliding. Phase Gate entry and exit cells are visible before
traversal. Coilkeeper Seals and used-gate Scars are rendered as raised solid
cells for exactly as long as they remain in `permanentTerrain`; they also enter
the Pathline obstacle inventory and the snake's packing read. A reducer-authored
lethal cell may never exist outside the rendered obstacle inventory. Every
collidable or lethal Genome-authored board cell is visible before contact.
Target, gate, route, and permanent-terrain visuals derive only from authoritative
reducer state, never from client-inferred decoration.

Gilded Fork is represented by two honest physical food cells under one target
identity: a neutral **SAFE** branch and a gold **GREED** branch. Both are edible
and colliding; eating either atomically removes the other. The entered cell is
the decision, so no modal, hidden toggle, or touch target participates. The two
cells, immutable target identity, and branch geometry survive checkpoint and
deterministic replay. If the board cannot fit two reachable, escape-capable
cells, the transform defers rather than presenting an unsafe or false choice.
Legacy Genome-v1 VOLT Arc is not part of the v2 ladder (v2 uses Relay), so it
cannot auto-collect, choose, or orphan any v2 target—especially a Fork branch.

The fixed cockpit rail carries only the highest-value live facts—such as a route
budget, Stake, Escrow, Bond count, Phoenix readiness, body-pressure rule, or
Anchor charge—and short acknowledgements when a canonical trigger resolves.
This feedback does not create, infer, or settle an effect. It explains the
effect already present in the reducer and never adds a pointer target over the
mobile flick surface.

At six occupied loci, FORK becomes a two-step **Recode**: select the incoming
gene, then select the held locus to replace. The pane previews the exact
before/after gain, loss, Strain delta, formed/broken Splice, and permanent growth
cost before confirmation. This is the narrow exception to the live Loom's
changed-facts-only rule because Recode is irreversible. The first Recode adds eight permanent
segments; every later Recode adds ten. Recode does not also pay the ordinary
portal-Genome growth cost. A replaced ID cannot be offered again in that run.
Recode stops future effects of the replaced gene but cannot erase already
earned value, outstanding liabilities, ledgers, Ash, body growth, Scars, or
sealed terrain.

## 3. Visible future depth and activation

Locked systems are visible and explained, with unlock state authored by the
server. The run-one player sees the complete portal choice in context and can
inspect every Strain rung in Research without receiving every verb immediately.

| Progress | Activation |
|---|---|
| 0 validated banks | Strain tags, Minor state, and all 2/3/4 ladders visible |
| 1 validated bank | CONTINUE at portals |
| 2 validated banks | Strain Expressions |
| 4 validated banks | MUTATE / portal Genome action |
| 6 validated banks | spawn inheritance and Splices |
| 10 validated banks, or existing M3 alternate | Apex |

The server returns the unmet condition and progress for every locked action.
The UI does not reproduce thresholds from literals.

### 3.1 Gene offer eligibility (v1.14 follow-on)

Feature activation and Gene offer eligibility are separate. The table above decides
whether a verb or reaction may operate; the account eligibility contract decides
which current-ruleset Genes may enter a new live offer. The complete roster and its
rules remain inspectable from run one.

A new account begins with a server-authored **seven-Gene** Dynasty starter pool that
contains its Dynasty Signature. After the first BANK it may choose a legal trial in
the Workbench. That trial occupies one bounded candidate position alongside an
ordinary alternative and DECLINE; resolving its versioned learning event through
success or failure grants ordinary eligibility. The exact starter lists, trial order,
guarantee, migration, pool-health proof, and rollout contract are owned by
`PLAYER_EVOLUTION_ONBOARDING.md`, with the measured evidence in
`PLAYER_EVOLUTION_STARTER_POOL_SIMULATION.md` and the data/API boundary in
`PLAYER_EVOLUTION_SERVER_CONTRACT.md`.

Two arithmetic constraints bind any future change to those lists. `rollGenomeV2Offer`
returns null once fewer than two unseen legal entries remain, and a null roll parks
`nextCadenceOfferAtFood` at `Number.MAX_SAFE_INTEGER` — relics stop for the rest of
the run. So (a) an eligible pool of *n* supports at most *n − 1* acquisitions, making
seven the floor for a six-locus Genome, and (b) because a Splice frees a locus, a
splicing run consumes more than six Genes and the eligible pool must reach nine before
Splices activate at six banks.

Section 9's promise that a Dynasty's signature is always part of its run's pool
becomes literally true under this contract: the `apexesUnlocked` offer filter is
deleted in WP-B. Apex *tier activation* keeps its existing ramp.

The run-start manifest stamps the actual eligible pool. Unlocking a Gene never changes
an in-flight run, and Codex history never substitutes for server eligibility. Existing
authoritative use grants migration credit; graduated veterans keep the complete legal
roster. Until the curriculum is explicitly rolled out—and whenever reviewed legacy
state is absent under rollback—the server retains the prior complete-pool behavior.

### 3.2 Research: the Genome Workbench

The Workbench is the one free Research destination reached from the Home
chamber's five-rune relic. The historical `/codex` path remains a compatibility
URL into it; players never choose between a duplicate Codex and Workbench. It
reveals depth without turning a live decision into coursework:

- **Workbench** is a direct-manipulation build toy. The player places genes into
  the six loci and immediately sees the reaction chain `locus → Strain rung →
  Splice`. Only the selected object and changed connections demand attention.
- Three optional plain-language lenses — **Yield**, **Risk**, and **Space** —
  recolor or annotate the same build. Exact arithmetic is available on demand in
  one shared readout rather than spread across permanent panels.
- Locked entries stay visible and can be explored. The system never recommends,
  ranks, solves, or declares an optimal Genome or Dynasty.
- Personal discovery, Genome Weaver progress, world-firsts, and legacy records
  remain available in one optional subordinate **Research Record**. It preserves
  ownership and history without reproducing the rules catalog.
- Results offers **Study this Genome**, loading the exact terminal build and run
  context into Workbench so play, feedback, and the next experiment form one loop.

Research remains a game surface: visual, responsive, and inviting to manipulate.
It must not become a glossary wall, university-course tree, spreadsheet, or SaaS
analytics dashboard. The authoritative Genome engine remains the single source
for every displayed reaction and calculation, and Workbench code remains outside
the live `/game` dependency graph.

Player-facing copy calls this instrument **Workbench** or **Genome Research**.
`Codex` survives only where compatibility requires it—the `/codex` route and
legacy/internal vocabulary such as `player_codex` and `CodexDiscoveryType`—and
never names a second player-facing product surface. This contract does not
require broad renaming of those compatibility identifiers.

Research discovery identity includes the Genome rules version. Existing discovery
history is retained as v1; it is never rewritten or bulk-promoted into v2. A v2
run can therefore discover a semantically revised entry whose stable text ID was
also used by v1, while both histories remain independently readable. The v1
one-time reward is never paid again as a v1 reward, but the distinct v2 discovery
may earn its configured one-time v2 reward. World-first records and Weaver
completion are likewise version-scoped; the Weaver cosmetic grant itself remains
account-idempotent.

Ordinary cadence opportunities use a deterministic **6 ± 2-food interval
(4–8)** independent of Dynasty and body growth. Patient doubles the sampled
interval; Ascetic receives no ordinary relic. A due opportunity places one
physical relic on a reachable, survivable free cell for **40 resolved movement
ticks**. If no honest cell exists, placement retries after later food rather
than creating an impossible objective.

Only collecting the relic rolls and reveals the candidate pair. Ignoring it or
letting it expire advances the separate opportunity cursor without creating an
offer, DECLINE, PASS, Bond, or hidden candidate history. Portal MUTATE still
opens its candidates immediately after the player deliberately chooses that
verb. The next ordinary interval is sampled and begins only when the current
relic resolves through collection or expiry; foods eaten during the relic's
lifetime do not count toward that next interval. A revealed DECLINE is a real
lost build opportunity; the offer algorithm must therefore normally present two
viable but strategically different categories, while preserving a deliberate
wildcard and deterministic surprise.

## 4. Active v2 gene roster

The v2 ruleset roster contains 13 shared genes plus each Dynasty signature. CYBER
excludes Time Dilation, so its legal roster is 13; PRIMAL and COSMIC each have 14.
Under the v1.14 follow-on, a new run receives the server-stamped intersection of that
legal roster, current rotation/World Condition, and the account's offer-eligible
subset; existing full-pool behavior remains the rollout and malformed-state fallback.
Rotation may replace catalog entries inside the constitutional 12–16 bound, never
append past it. Magnetism and magnet-derived mechanics are not active in v2.

| Gene | Strain | Primary identity |
|---|---|---|
| Gold Trail | AURUM | recurring timed Yield execution |
| Compound Interest | AURUM | offer opportunity compounded at BANK |
| Loan Shark | AURUM + UMBRA | deferred portal contract and forfeitable Escrow |
| Live Wire | VOLT | topology-scaled route execution |
| Circuit Run | VOLT + FLUX | ordered linked route execution |
| Time Dilation | VOLT + FERAL | slower planning bought with growth; PRIMAL/COSMIC only |
| Overgrowth | FERAL | scalable Yield bought with body pressure |
| Coilkeeper | FERAL + FLUX | territorial sealing and permanent constriction |
| Wall Rush | FLUX + VOLT | deliberate wall redirect and follow-up route |
| Phase Gate | FLUX | optional shortcut bought with permanent Scars |
| Mirror Wager | UMBRA | visible Stake separated from ordinary salvage |
| Phoenix | UMBRA + FERAL | one second life that consumes a locus into Ash |
| Loom Anchor | AURUM + UMBRA | deterministic control of the next offer |
| Heartwood | FERAL | PRIMAL coiling, temptation, and territorial recovery |
| Zenith Protocol | VOLT | CYBER player-controlled REDLINE with proportional Yield |
| Constellation Crown | FLUX | COSMIC perfect-wave planning with explicit star states |

The TypeScript runtime catalog is the arithmetic/copy source used by engine,
projection, Workbench, and results. SQL carries a versioned mirror for durable
history and deployment compatibility. A parity test must reject ID, recipe,
tag, or rules-version drift.

## 5. Shared gene rules

### Gold Trail

Every fifth eligible target after acquisition becomes visibly Gilded. The
player has six simulation seconds to collect it. Success pays ×3; missing the
window leaves the target ordinary rather than adding a hidden penalty. The
description always says the trigger recurs. The engine converts the window to
ticks from the stamped speed, so the rule is deterministic while Dynasty and
speed fit remain meaningful.

When Gold Trail fuses with Overgrowth into **Gilded Fork**, the timed target is
replaced—not stacked—with the two-cell SAFE/GREED rule above. SAFE pays the
ordinary ×1 target value and adds no Fork growth; GREED pays ×4 and adds two
permanent segments. There is no timer. The unchosen branch disappears on the
same simulation boundary.

### Compound Interest

DECLINE creates one prospective +8% BANK Bond, maximum three. Bonds pay nothing
on crash. Declining an anchored offer does not mint a Bond. Recode can stop
future Bond creation but cannot erase accrued Bonds.

### Loan Shark

An explicit portal CONTINUE starts a six-food contract only when none is active.
Contract food pays nothing immediately and routes ×2 of its canonical value into
visible Escrow. The sixth food releases the full Escrow into bankable Yield.
BANK or crash before completion loses it. Another CONTINUE while active neither
resets nor stacks the contract. Portal expiry never starts a voluntary contract.
Recode cannot cancel an outstanding liability.

### Live Wire

Every third eligible target receives a visible, topology-derived route budget.
Success pays ×3; failure pays zero for that target while normal growth still
occurs. The route budget is derived from the spawned board, legal path, and
stamped movement state rather than an arbitrary fixed move count.

### Circuit Run

Every fourth eligible target becomes an ordered two-part route. Completing both
inside the visible route budget pays ×4 total; breaking the route pays zero.
The pair produces one normal unit of growth, not two independent food-growth
events.

### Time Dilation

World speed is reduced by 12%. Every fourth food adds one extra permanent
segment. The gene is excluded from CYBER's pool. It changes planning and body
economics without charging a flat Yield penalty for control.

### Overgrowth

Every food adds one extra permanent segment. Its Yield multiplier scales
deterministically with current committed board pressure from approximately
×1.4 toward ×2.5. The Loom shows the present factor and projected occupancy.
The upside grows with the danger instead of becoming inefficient in long runs.

### Coilkeeper

After an eight-food charge, closing a newly enclosed region of at least four
cells can seal it. Those cells become permanent terrain for the rest of the
run. The next exclusive target pays ×4, ×5, or ×6 according to the canonical
sealed area tier. Existing enclosure does not repeatedly retrigger without a
new charge and newly enclosed space.

### Wall Rush

A charged, deliberate wall impact redirects the head along a previewed legal
tangent. It does not forgive self-collision or an illegal destination. The next
armed target must be collected inside six moves for approximately ×2.5; the
charge is spent even on failure.

### Phase Gate

Every fifth eligible food can charge an optional, previewed pair of safe gate
cells. Using the shortcut makes its target worth ×3. Used gate cells become
permanent Scars. A gate is never offered if its entry, exit, target, or escape
route is invalid.

### Mirror Wager

An explicit portal CONTINUE may divert 40% of subsequent leg Yield into a
visible Stake at the current Carry state. BANK doubles the Stake; crash loses
the Stake while ordinary non-Stake salvage remains unchanged. It never turns an
already-small salvage payout into an irrelevant fraction.

### Phoenix

Phoenix supplies one revive: rewind three body cells, phase for twelve movement
ticks, and add ten permanent segments. It then becomes Ash occupying its locus
and contributes no Strain. It is mutually exclusive with every other second
life. Triggering it does not wipe unrelated ledgers or accrued Genome value.

### Loom Anchor

Once charged, one DECLINE may pin a declined candidate into the next THREAD
slot. It has one charge and recharges only after an explicit portal CONTINUE.
It changes offer control, not Yield directly.

## 6. Strains, Splices, and signatures

All Strain ladders use visible thresholds at 2, 3, and 4 points, mapped to Minor,
Expression, and Apex. A ladder deepens
its family's strategic identity; it does not duplicate a shared gene. Threshold
effects are qualitative rules with visible state and authoritative activation.
No tier imposes an unconditional speed increase or exchanges ordinary banking
for a negligible salvage improvement.

The five identities are:

- **AURUM:** contracts, compounding, stored value, and BANK conversion;
- **VOLT:** prediction, route budgets, voluntary overclock, and execution chains;
- **FERAL:** growth, body geometry, territorial pressure, and coiling;
- **FLUX:** legal vectors, shortcuts, redirection, and permanent topology;
- **UMBRA:** visible stakes, deferred loss, insurance, and one coherent afterlife.

Splices replace their parents with one new strategic rule rather than applying
`A + B + bonus`. The exact active v2 recipes are:

| ID | Splice | Parents |
|---|---|---|
| `splice_dragon_hoard` | Dragon Hoard | Gold Trail + Compound Interest |
| `splice_gilded_fork` | Gilded Fork | Gold Trail + Overgrowth |
| `splice_styx_contract` | Styx Contract | Mirror Wager + Phoenix |
| `splice_perfect_circuit` | Perfect Circuit | Live Wire + Circuit Run |
| `splice_worldcoil` | Worldcoil | Coilkeeper + Overgrowth |
| `splice_riftline` | Riftline | Wall Rush + Phase Gate |
| `splice_loom_bond` | Loom Bond | Compound Interest + Loom Anchor |
| `splice_ashen_stake` | Ashen Stake | Loan Shark + Phoenix |

Recipes and effects may be discovered, but rules and consequences are never
hidden. The live Loom shows every directly connected branch for the focused
choice and its exact current fate; Research exposes the complete catalog,
unrelated recipes, experiments, and arithmetic so players can prepare without
memorizing a reference catalog.

Dynasty signatures are always part of their run's pool:

- **Heartwood / PRIMAL** converts coiling and territorial temptation into a
  high-value decision while preserving the need to recover into a safe route.
- **Zenith Protocol / CYBER** exposes a voluntary REDLINE meter. The player
  chooses a bounded speed burst, never receives an automatic death-sentence
  speed reward. The cap is 1.8× unless later telemetry changes it.
- **Constellation Crown / COSMIC** visibly distinguishes current edible Stars,
  ghost/future Stars, and Crown Stars. Perfect wave clears build a visible
  streak from ×2 toward ×5. Objects that cannot currently be eaten or collided
  with never masquerade as active targets.

## 7. Portal Genome and Carry

Every portal visibly presents:

- **BANK** — secure the current run;
- **CONTINUE** — pass the portal, advance Carry, and accept deeper crash loss;
- **MUTATE** — consume the portal to acquire build power, when unlocked.

The first, second, and third ordinary portal Genome actions add +3, +4, and +5
permanent segments. Recode uses +8, then +10 for later Recode actions, without
also adding the ordinary cost. There are at most three portal Genome actions in
one run. Length never decreases and permanent terrain never becomes free.

Carry has no late-run reward cap:

- BANK multipliers for zero through five passed portals are
  `1.25^(passes + 1)`: ×1.25, ×1.5625, ×1.953125, ×2.44140625,
  ×3.0517578125, and ×3.814697265625;
- after five passes, each further pass adds ×0.40;
- crash salvage is `0.35 + 0.65 × 0.6^passes`, with pass zero at ×1;
- an expired portal advances Carry but never starts Loan Shark, Mirror Wager,
  or another voluntary CONTINUE effect.

There is no hidden ×1.75 BANK clamp or ×0.90 salvage clamp in v2.

## 8. Deterministic reward order

The authoritative fold is:

1. Dynasty base Yield;
2. the one exclusive target transformation;
3. continuous Genome effects;
4. Loan Shark routing and Escrow release or loss;
5. Bonds and Mirror Stake;
6. BANK or crash Carry;
7. remaining account-independent Carry rules;
8. Ascendance;
9. Energy Commitment, applied only to credited DNA.

Score is never multiplied by Genome, Carry, Ascendance, or Energy. Achievements,
fixed unlocks, mastery, rare fixed drops, and unrelated progression rewards are
not silently multiplied. The server response carries the exact itemized result
that the client displays.

Target transformations are exclusive. Simultaneous triggers enter one stable,
deterministic FIFO queue in acquisition order. One target cannot silently be
Gold, Live Wire, Circuit, Coilkeeper, Wall Rush, and Phase Gate at once.

## 9. Ascendance v2

New runs freeze both the curve version and exact multiplier at start:

```text
Gen 1–3: multiplier = 1.00
Gen 4+:  multiplier = 1.02^(generation - 3)
```

Representative fixed-point values are Gen4 ×1.0200, Gen10 ×1.1487, Gen20
×1.4002, Gen30 ×1.7069, and Gen50 ×2.5363. Settlement uses integer basis
points and floors once. The existing breeding cost continues to grow by ×1.25
per generation. Every fifth generation is a visible evolution and prestige
milestone. There is no ordinary design cap and no diminishing marginal reward;
only an unreachable numeric representation guard.

Genome v1 or Ascendance v1 runs that were already in flight retain their
start-stamped v1 arithmetic. Missing version fields on a legacy session resolve
to v1, never to the newest default. New history never rewrites old payouts.

## 10. Authority, continuity, and validation

The server stamps Genome rules version, interaction sub-version, eligibility-contract
version, the actual eligible pool, the account curriculum provenance that produced it,
FTUE, Ascendance curve and multiplier, Dynasty, build seed, and all immutable run
facts. The client cannot add a locked Gene or change any of them after start. A later
eligibility change applies only to a later run. Interaction v2 (physical relic)
requires an explicit client capability at run start. Omitted and historical
stamps remain interaction v1 (automatic offer), are fingerprint-compatible with
their original start request, and retain that behavior through replay and
checkpoint recovery.

The live engine and authoritative replay consume the same deterministic event
journal. Stable IDs bind offers, instances, targets, portal decisions, terrain,
and settlement. Reconnect and recovery restore the stamped interaction
sub-version; the ordinary opportunity cursor and next-due food; any outstanding
relic's authoritative cell, placement/spawn state, and remaining expiry ticks;
all six loci; retired/Ash state; any revealed outstanding offer; target queue;
Bonds, Escrow, Stake, Carry, permanent terrain, RNG cursor, and latest accepted
active-play elapsed time. Offline wall time is a validation ceiling, not run
progress; resuming after hours offline cannot make the next legitimate checkpoint
appear to rewind.

Every save and completion is idempotent. A duplicate request cannot consume an
offer twice, add growth twice, release Escrow twice, settle twice, or write a
second version-scoped Research discovery record. Invalid client-authored Genome
multipliers, target resolutions, or reward totals are rejected; the server
derives them from replay.

Terminal presentation retains a non-economic contact diagnostic alongside the
persisted wall/self cause: exact cell plus border, own body, ordinary permanent
terrain source, Coilkeeper Seal, or Phase Gate Scar. It changes neither
collision rules nor settlement; it makes a reported "invisible crash"
falsifiable and gives board-render regressions a precise source to investigate.

## 11. Required telemetry and balance proof

Track the start-stamped interaction sub-version; sampled opportunity interval and
cursor; relic placement attempt, retry, and success; relic collection and expiry;
foods eaten during each live relic lifetime; offer category diversity; eligibility
prefix and contract version; trial invitation, Show me/Not now, trial selection and
switch, guarantee consumption, learning-event resolution, full-roster graduation;
THREAD/FORK/DECLINE; UNFOLD DETAILS open/close and focused reaction; Recode
source/target and cost; Strain and Splice paths; gene state activation/miss;
target queue depth; body/committed occupancy; terrain creation; portal actions;
Carry, Bonds, Escrow, Stake, Phoenix/Ash, BANK/crash, Genome contribution,
Ascendance, and final Yield.

Balance tests must model early, middle, and late runs across all Dynasties and
skill bands. The intended observed spread is deliberately broad:

- poor or misplayed Genome: approximately ×0.7–×1.2;
- coherent Genome: approximately ×1.4–×2;
- strong Genome: approximately ×2–×3;
- exceptional mastered execution: approximately ×4–×6 or higher when the
  player accepts and survives the corresponding risk.

These are telemetry targets, not clamps or guarantees. Tune the trigger,
cadence, route budget, and cost that produces the result; do not silently
normalize the final reward or erase Dynasty fit.
