# The Redesign Wave — WP-3.00 … WP-3.10

**Status: PLAN, awaiting owner approval.** On approval, `docs/IMPLEMENTATION_HANDOFF.md`
gains its §6c pointer and this becomes the authoritative scope, per the protocol
that governed the Playtest Wave. Until then nothing here is claimable.

**Authority.** `docs/PRODUCT_CONSTITUTION.md` v1.3 remains the single design
authority. This wave *changes* the Constitution (WP-3.00 drafts v1.4), so the
amendment is sequenced first and every code WP checks against v1.4, not v1.3.

**The bar**, in the owner's words: *"I will not start campus-1 when I don't find
the game compelling myself."* The wave is therefore shaped around getting a
**felt answer into the owner's hands at the earliest possible WP** (3.02), not
around finishing the catalog first. Everything after 3.02 is re-plannable
against what the owner's hands report.

**Inputs.** `docs/game/GAMEPLAY_REDESIGN_BRIEF.md` (rulings D2–D5, measurements),
`docs/game/GAMEPLAY_PROPOSAL.md` (diagnosis + evidence), `docs/game/WP_GROWTH_LAB.md`
(the D1 instrument, absorbed here as WP-3.02). All code references below were
verified against `main` on 2026-07-27.

---

## §1 What planning caught — six findings that change the scope

Planning against the actual code surfaced things the proposal could not see.
Recorded first because several *change rulings' implementations* and one
corrects the proposal itself.

### 1.1 T2 ("PASS pays length") is dead under D4 — the sign flipped

The proposal's T2 predates the D4 inversion. It reasoned: INFUSE *pays* length
for power, so PASS should *grant* length — one axis. Under D4, INFUSE **costs +8
growth**. Growth is now the price of everything. If PASS also granted growth,
declining and accepting would both grow you and the axis collapses; if PASS
granted *less* growth, "less growth" is a length-reduction-shaped reward — the
exact currency D4 just outlawed.

**Re-derived PASS reward (WP-3.05):** PASS pays in **Yield and offer quality**,
never in body: a small flat DNA payment quoted on the portal before the choice
[H: `PASS_DNA ≈ 8`], plus **next-offer escalation** (the declined portal
guarantees the next offer draws from a higher weight band — the Balatro tag
shape, deferred and visible). Both are server-recomputable: passes are already
derivable at settlement because `verifyOfferTrace` replays the offer sequence
from `run_seed` + context, and a pass is an offer with `picked: null` — the
shipped contract that must not change (no `passed: true` field; pinned since
WP-2.09).

### 1.2 Molt cannot be "re-signed" — its shed IS the effect

D4's ruling says Ouroboros, Thick Hide and Molt are "re-signed to cost growth."
For Ouroboros and Thick Hide that works: their *effects* (flat DNA; survive one
collision) survive with the cost re-denominated in growth. Molt's effect **is
the shed** — remove the shed and nothing remains. FERAL tier 2 therefore needs a
**replacement effect**, not a new price, and `heartwood` (PRIMAL's signature —
"each Shed/Molt event drops a golden food", `genes.ts:197-204`) dangles from the
same hook and must be re-triggered in the same WP.

**Correction of record (WP-3.11).** WP-3.01's plan below says Molt would be
"removed from activation (tier 2 grants nothing)" until its replacement landed.
**That quarantine was never implemented.** WP-3.01 retired the `shed` GENE and
inverted INFUSE, but FERAL's Molt cycle stayed live in both
`SnakeGameLogic.applyShedMoves` and `computeLengthTrace`, and the lexicon went
on describing the shed — so a Rule 15 violation shipped in main from 2026-07-27
until WP-3.11 removed the cycle outright. `rule15.test.ts` did not catch it
because it asserted the retirement of the `shed` gene, not the absence of shed
*cycles*; it now asserts both.

Recommendation carried in WP-3.03, decided by the owner there: FERAL-2 becomes
**"Fortress"** — *every 20 foods, your oldest 6 segments petrify: they stop
following, becoming fixed terrain, and each pays 5 DNA* [H]. Length keeps
counting them (the clock never rewinds), free space is unchanged, the snake's
*live* tail shortens while the board hardens — pressure transforms rather than
resets. Heartwood re-triggers on petrify events. If the owner prefers a simpler
world: FERAL-2 becomes a pure growth-economy tier ("+2 flat DNA per food while
above 60% of spawn-relative length") and heartwood triggers on Fortress-less
FERAL expression instead. Either way the decision is explicit, not silent.

### 1.3 Every food-indexed dial in the catalog is tuned for a run length that no longer exists

The catalog's windows were authored against 150–180-food runs. D1's candidate
median is **~48 foods**. Affected, with current values:

| Dial | Today | Under 48-food runs | Re-base target [H] |
|---|---|---|---|
| `GENOME_SPAWN.intervalBase` (gene offer cadence) | 20 ± jitter | ~2 offers/run — the draft dies | **~10 ± 3** |
| `MIN_FOODS_PER_PICK` (validator cadence bound, `gameValidator.ts:454,505`) | 15 (30 Patient) | caps picks at 3 | **~8** (16 Patient) |
| Hold bonus lengths (`game.ts:124-129`) | 25, 40 | reached at foods ~4 and ~7 under +6 growth | re-express as **% of terminus length** (~35%, ~60%) |
| `deep_roots` ramp | +1 per 25 foods | ~2 ticks/run | per **12** |
| `ancient_grove` window | foods after 40 | never activates | after **20** |
| `midnight_oil` window | first 15 foods | ~⅓ of the run | first **8** |
| `loan_shark` windows | 10 / 11–30 | half the run | 6 / 7–18 |
| `glacial_reserve` cap | +1%/food to +30% | fine (scale-free rate, long cap) | cap +20% |
| CYBER speed floor | reached at food 100 | **unreachable** | superseded by D3 curves (WP-3.04) |
| Per-N-th genes (gold_trail 5th, afterburner 10th, tithe 10th, solstice 4th) | — | scale-free, fine | untouched |

**The good consequence:** at the re-based cadence, offers per run (~7–8) exceed
`GENOME_SPAWN.maxHeld = 6` (`gameValidator.ts:924`) **for the first time**. Slot
scarcity — the precondition the draft research named for PASS/BANISH meaning
anything — arrives as a side effect of pacing, with no new mechanic.

### 1.4 Multi-food is not new machinery

`spawnFoods` (`SnakeGameLogic.ts:2460`) already computes a wave target —
`constellation.groupSize + splitter + starweaver` — and places it through a
seeded rejection sampler ("a seeded run must lay out identical food waves on
every replay"). COSMIC already plays 3-food waves. The lab's `simultaneousFoods`
is one more term in that sum, **plus one semantic decision**: COSMIC's waves are
replaced whole (constellation chains depend on wave identity); PRIMAL/CYBER need
**maintain-N** (respawn one on each eat) or the last food of a depleted wave
recreates the traverse tail we're killing. Validator impact is confined to the
rate bound (§WP-3.02); food *positions* are not replayed server-side.

### 1.5 The revive conversion is one engine site plus one trace branch

`rebirthBody()` (`SnakeGameLogic.ts:2749`) is the single truncation site for
"Phoenix and every genome revive kind" — rewind head 3 cells, truncate to 8.
The server mirror is the `reviveAt` reset inside `computeLengthTrace`
(`genome.ts:319`). D4's "survival, never shrinkage" is therefore: keep the
3-cell rewind, delete the truncation, add a **phase window** (~12 ticks of
self+wall immunity [H]) so the revived snake can escape the jam that killed it
at full length. Engine change ≈ 10 lines; trace change ≈ 1 branch; every revive
kind (Phoenix, Styx, Molted-Rebirth†, Second Sun) inherits it through the one
funnel. († Molted Rebirth is deleted with its parent `shed` — see 1.6.)

### 1.6 The deletion ripple, mapped exactly

Deleting `shed` removes, by parentage: `splice_regenesis`
(`overgrowth`+`shed`, `splices.ts:54`) and `splice_molted_rebirth`
(`shed`+`phoenix`, `:110`) — splice catalog 10 → 8. `MUTATION_POOL` (the Launch
Ten, `mutations.ts:242`) drops to nine; the replacement slot goes to
**`static_charge`** [H] — the catalog's best-designed gene, currently
genome-era-only. Old share links carrying deleted ids already fail safe
(`buildCode` refuses unknown genes → 404); Codex/lexicon entries are removed;
`player_codex` rows with dead ids are left in place and filtered on read
(harmless, pre-launch). Tests pinning shed cadence
(`mutations.ts:360-361` dials) migrate with the WP.

---

## §2 The wave at a glance

| WP | Name | Depends on | Hot-core lock† | Owner gate |
|---|---|---|---|---|
| 3.00 | Constitution v1.4 + rails riders | — | no | **approve v1.4 text** |
| 3.01 | D4 surgery | 3.00 | **yes** | — |
| 3.02 | The Growth Lab | 3.01 | **yes** | **play; rule D1** |
| 3.03 | D1 lock-in + re-basing + FERAL-2 | D1 ruling | **yes** | Molt replacement choice |
| 3.04 | D3 score curves + CYBER pressure + boards cutover | 3.03 | rulesets only | curve feel; epoch-vs-wipe |
| 3.05 | PASS pays + offer-card truth + pick-rate | 3.03 | **yes** | PASS reward dials |
| 3.06 | BANISH | 3.05 | verifier only | — |
| 3.07 | Legibility riders: FTUE ungate, CYBER HUD, locked tiers | 3.03 | no (client + genePool) | — |
| 3.08 | Dual-tagging | 3.05 | no (data + tests) | tag list |
| 3.09 | Insurance → constraint conversion | 3.03, 3.08 | **yes** | per-gene rulings |
| 3.10 | D2 ladder | 3.03, 3.04 | no (stamp pattern) | rung list |

† Hot core = `SnakeGameLogic.ts` + `genome.ts` + `gameValidator.ts` +
`session/route.ts`. **WPs marked yes are strictly serial** — this wave, unlike
the Playtest Wave, is mostly a pipeline through the engine/settlement core, and
pretending otherwise will produce merge disasters. Parallel lanes exist only for
3.00, 3.04 (rulesets file is disjoint from 3.05's files), 3.07, 3.08, 3.10.

**Sequence:** 3.00 → 3.01 → 3.02 → **[owner plays — D1 ruled]** → 3.03 →
{3.04 ∥ 3.05 → 3.06 ∥ 3.07 ∥ 3.08} → 3.09 → 3.10 → phase-gate replay.

**Migrations:** 057 (ladder), 058 (offer stats), 059 (boards cutover, shape
depends on the owner's epoch-vs-wipe call). Claimed at merge per protocol; the
deploy workflow applies them after promotion, as always.

**Branches:** `wp/3-00-constitution-v14` … `wp/3-10-ladder` onto
`constitution/build`.

---

## §3 The work packages

### WP-3.00 — Constitution v1.4 + rails riders

*The amendment is the first artifact because the Constitution is the authority
and this wave contradicts v1.3 in four places.*

**v1.4 draft contents:**
- **New Inviolable Rule (the owner's words made law):** *"Length only ever
  increases and free space only ever shrinks. Nothing shortens the snake;
  anything that costs the player costs growth. No mechanic, purchase, or
  content of any kind may rewind board pressure."* With the derivation recorded:
  once length is the difficulty clock, removing length is a reward, and a
  reward cannot price a reward.
- §6.1 gains D3's frame: per-dynasty `scoreMultiplier` *shapes* with comparable
  integrals; Rule 2's mechanism unchanged and CI-enforced.
- §8 gains D2's ladder (fixed, ordered, cumulative; unlock globally, record
  per-dynasty).
- §7.3 amended per D5: clan surfaces show **totals, not per-member attempt
  counts**; check Rule 8's reviewer checklist for member-visibility language and
  amend it in the same stroke (the zeros-visible argument is retired by this
  ruling).
- §13 kill-list additions: `shed`, `splice_regenesis`, `splice_molted_rebirth`,
  length-resetting revives, and (standing) any duration ceiling.
- §17 gains the wave's [H] dials: growth profile, INFUSE +8, PASS reward, cadence
  re-base table (§1.3), hold re-base, phase-window ticks, ladder rungs, curve
  shapes, charge-carryover test (from D5's deferred question).
- §15 Overturn Record rows for D3's scope reduction and T2's death (§1.1).

**Riders (small, no hot files, ride the same PR or their own):**
- e2e **flag-on matrix leg** (pending task #14) — mandatory before this wave's
  new flags ship; every existing spec currently exercises flag-off only.
- Serpent roster carve-out: `api/serpent/panel/route.ts:45` stops shipping
  per-member `depth`/`attempts`; clan card carries totals + the viewer's own
  row. Client `SerpentWeekPanel` follows. (Rider here because it is independent
  of the hot core and D5 is already ruled.)
- Ops riders from the release: 055 tripwire wording (task #12), rollback-ID
  capture in `deploy-production.yml` (task #13).

**Gate:** owner approves v1.4 text. Code WPs do not merge before it.

---

### WP-3.01 — D4 surgery (the minimal, mechanical cut)

*Everything ruled and unambiguous; no design decisions inside.*

- **Delete** `shed` + both dependent splices (§1.6 ripple: pool, lexicon, codex
  read-filter, tests). Launch-pool replacement `static_charge` [H].
- **Invert INFUSE:** `infuseSegmentCost: 4` (`strains.ts:309`) becomes
  `infuseGrowth: 8` [H]. Engine `performInfuse` (`SnakeGameLogic.ts:1891`) stops
  slicing and pushes segments; `genome.ts:317` moves infuses from `losses` to
  the growth side of `computeLengthTrace`; `infuseMinLength: 8` becomes
  redundant (nothing shrinks) and is deleted; the "max 3 per run" cap stays.
  Lexicon/Workbench copy: *"absorb the gene — your body grows 8 segments."*
- **Re-sign Thick Hide:** survive one collision; cost changes from "−5 tail
  segments" to **+8 growth on trigger** [H] — survival makes you bigger.
- **Re-sign Ouroboros:** tail bite pays 30 flat DNA and **+2 growth** [H]
  (eating yourself makes you longer — the ouroboros, literally); the "eats 3
  segments" line dies.
- **Revive conversion** per §1.5: rewind stays, truncation deleted, phase window
  added; `computeLengthTrace` revive branch stops resetting; `lossEvents` shape
  keeps `revive` for the *event* (payout logic unchanged) with no length delta.
- **Molt: interim quarantine.** FERAL-2's replacement is a design decision
  (§1.2) that belongs to 3.03; until then Molt is removed from activation
  (tier 2 grants nothing) with lexicon copy saying so honestly. Shipping a
  known-dead tier for one WP beats shipping a wrong redesign.

**Files:** `mutations.ts`, `genes.ts`, `splices.ts`, `strains.ts`, `genome.ts`,
`SnakeGameLogic.ts`, `gameValidator.ts` (loss-event caps), `lexicon.ts`, tests.
**Migration:** none. **Tests:** parity suite re-run with infuse-as-growth
(write the inverted-infuse parity cases FIRST); deletion sweep (no offer, no
codex entry, no crash on legacy blobs containing dead ids — settle a recorded
pre-D4 run fixture and assert it still settles under the legacy path);
`verify:constitution` green.

---

### WP-3.02 — The Growth Lab (absorbs `docs/game/WP_GROWTH_LAB.md`)

As specced there, with the verifications from this planning pass folded in:

- `src/shared/game/growth.ts` — profiles `baseline` / `tuned` / `aggressive`
  exactly as tabled (baseline byte-identical to today's curve; note baseline
  still shortens ~10:12 because INFUSE now grows — that is D4, not the lab).
- Multi-food via the **existing wave sampler** (§1.4): `simultaneousFoods` joins
  the target sum; **maintain-N** for PRIMAL/CYBER, wave semantics preserved on
  COSMIC; Splitter stays additive as it already is.
- **Cadence rides the profile** (§1.3): `intervalBase` and `MIN_FOODS_PER_PICK`
  become profile fields, re-based for `tuned`/`aggressive`, unchanged in
  `baseline` — the lab must test the draft at the new pacing or it measures a
  build system that won't exist.
- **Standing review question for this wave, earned the hard way:** *what unit is
  this bound in, and what happens to it when the thing it depends on changes?*
  Three bounds were found denominated in the wrong unit in a single day —
  `maxFoodPerSecond` (blind to multi-food, and soon to board occupancy), the
  extraction window (ticks, so it shrinks fourfold as CYBER accelerates), and the
  hold-bonus thresholds (absolute lengths, now reached within seconds). Every
  bound this wave touches gets that question asked of it in review.
- Rate bound derived, not guessed: `maxFoodPerSecond × simultaneousFoods`
  (`gameValidator.ts` food-rate branch), with the derivation in the comment.
- Profile server-stamped into `run_context`; flag `NEXT_PUBLIC_GROWTH_LAB_V1`
  gates only the selector; unknown/absent → baseline. Lab runs ride
  `is_free_play = true` (verified fully plumbed: no charge consumed, excluded
  from boards/economy/contracts, `session/route.ts:301,627`).
- Hold thresholds re-expressed per profile (§1.3) so pause economics don't
  distort the reading.

**Tests:** per-profile parity (engine trace === `computeLengthTrace`, exact,
adversarial axes + seeded sweep); baseline golden; stamp round-trip; rate-bound
at max honest speed; cadence bound honesty (a `tuned` run picking at the new
cadence produces zero `MUTATION_BOUND`/`GENE_BOUND`).

**Gate — the wave's hinge:** owner plays 2 runs × 3 profiles on PRIMAL, then
CYBER; three session questions with food counts; boring runs logged. Then D1 is
ruled and §1.3's targets are confirmed or re-fit from the new `run_events`
(the deciseconds encoding gives per-food timing for free).

---

### WP-3.03 — D1 lock-in, the re-basing pass, FERAL-2

- Chosen profile becomes the shipped baseline; lab scaffolding retired (selector
  gone; profiles kept as the **substrate for ladder rungs** — see 3.10).
- The §1.3 re-base table lands as one reviewed commit across
  `mutations.ts`/`genes.ts`/`strains.ts`/`game.ts`, every dial annotated with
  its derivation from the terminus length.
- **FERAL-2 replacement** per §1.2 — owner chooses Fortress (petrify) or the
  economy tier; `heartwood` re-triggered accordingly.
- GT-delta note recorded (run shape changes globally).

**Files:** shared config + catalog + the same hot core. **Migration:** none.

---

### WP-3.04 — D3 score curves, CYBER pressure, boards cutover

**Grown by the owner's CYBER playtest (2026-07-27) — see
`docs/game/TERRAIN_AND_CYBER.md` for the full spec and its evidence.** Three
additions, all measured rather than guessed:

- **The terrain primitive** — a block is an occupied, lethal cell, forming
  (non-lethal, telegraphed) then solid, added and never removed. Food-indexed
  cadence and seeded cell choice so the server can replay it; without that it
  cannot be validated and must not ship. **Shared machinery**: it is also the
  shed rewrite (FERAL-2 / kill-list row 26) and a future ladder rung, so it
  moves *earlier* than 3.04 if 3.03's FERAL-2 ruling needs it first.
- **CYBER's tick floor rises to ~100 ms [H]** from 50. The owner's three
  in-run calls (94 ms "approaching sensible", 97 ms "stops being fun", 84 ms
  "way too fast") bracket the same value the Canabalt-derived bound predicts
  (100–120 ms), and the banked run showed ticks-per-food climbing **18 → 113**
  past the floor — speed stops being difficulty and becomes inefficiency.
- **CYBER gets its own `ExtractionConfig`, authored in seconds.** The shared
  `despawnTicks: 90` gives PRIMAL an 18 s portal window and CYBER 4.5 s at its
  floor. Fix the unit, not the number.

- `scoreMultiplier` per dynasty becomes a *shape*: CYBER front-loaded, PRIMAL
  back-loaded, COSMIC mid-weighted [H formulas drafted for owner feel-check —
  e.g. CYBER `1 + 0.5·min(4,⌊n/4⌋)` decaying tail; PRIMAL
  `0.5 + 0.05·min(n,30)`; integrals within ±10% at the terminus]. Rule 2's
  mechanism untouched; `verify:constitution` green by construction.
- CYBER's tick curve re-derived for ~48-food runs with the floor at the
  **reaction-safe bound (~110 ms)** [H]; difficulty past the floor comes from
  the board (which now actually fills), not the clock. The frozen-×3 HUD
  legibility defect fixed here (multiplier display tracks the new curve).
- **Boards cutover** [owner decision]: (a) `score_epoch` column + board RPCs
  filter current epoch — clean, ~4 RPC touches, migration 059; or (b)
  owner-sanctioned dev-noise wipe recorded in the migration header — one
  statement, honest pre-launch, but writes player scalars downward and needs
  the authorization stated in-file. **Recommendation: (a)**, cheap insurance if
  campus-1 slips past more dev play.

**Files:** `rulesets.ts` + tests (score/speed pins migrate), board RPCs
(migration 059), HUD multiplier component. Disjoint from 3.05's files — may run
parallel.

---

### WP-3.05 — PASS pays, the offer card tells the truth, pick-rate lands

- **PASS reward** per §1.1: quoted flat DNA [H: ~8] + next-offer escalation
  [H: +1 weight band], both printed on the portal *before* the choice.
  Settlement recomputes pass count from the offer replay (`verifyOfferTrace`
  already reconstructs offers; passes = `picked: null`); pass DNA joins the
  deterministic Yield fold (never Score). Contract pins: no `passed` field;
  `data-testid="gene-decline"` and Escape survive.
- **Offer card rewrite** (one pass, one owner): each gene shows its strain
  chip(s), **strain progress** ("VOLT 4/6 → tier 2: [effect]"), effect+cost in
  the established inline grammar, and the PASS line with its quoted reward.
  Locked tiers greyed, not hidden.
- **Pick-rate instrumentation** — the time-sensitive item. At settlement, the
  replayed offer sequence emits `(gene_id, offered, picked, passed)` aggregate
  upserts into `gene_offer_stats` (migration 058: counters by gene × dynasty ×
  ISO-week; no per-player rows). One read-only ops route reports the table.
  From the moment this merges, the catalog is empirically auditable.

**Files:** `GeneChoiceOverlay.tsx`, engine decline path (reward event),
`genome.ts` (pass DNA in outcome), `gameValidator.ts`/`offerVerifier.ts`
(recompute), `session/route.ts` (settlement emit), migration 058.

---

### WP-3.06 — BANISH

Second decline verb: "never again this run." Engine removes the id from the
live pool; the banish is recorded in the trace (a `b` event beside `m`/`i`) so
`verifyOfferTrace` replays the same shrinking pool — **the verifier is the real
scope here**, and this lands only after 3.05 stabilizes the offer replay.
Banishes per run capped [H: 2]. UI: long-press or secondary action on PASS,
copy "PASS · NEVER". Reroll is deliberately **not** shipped (research: the
monetisation-shaped verb, and the weakest).

---

### WP-3.07 — Legibility riders

- **Endowed progress ungated:** `spawnPointsAt: 12 → 0` and the
  `ownedVariants >= 2` clause dropped (`game.ts:170`, `genePool.ts:65-66`).
  The natural gate remains — spawn points come from lineage and traits, which a
  starter snake doesn't have; the artificial one dies. FTUE copy updated.
- Locked-tier grey treatment in Codex/Workbench (share the 3.05 component).
- CYBER HUD multiplier legibility if not fully covered in 3.04.

Client + `genePool.ts` only; parallel-safe.

---

### WP-3.08 — Dual-tagging

Data pass on `MUTATION_STRAINS` (`genes.ts:74-96`) + `NEW_GENES` strains:
target **~16 of 34 dual-tagged** [H: exact list for owner review], signatures
stay single. Consequences handled in-WP: dual tags feed both strains' points
*and* both in-run gene-count gates (`expressionMinGenes`/`apexMinGenes`) — a
tier-reachability simulation (via the Workbench's own math, `toBe`-shared)
asserts expression stays reachable in ≥X% and apex in ≤Y% of seeded runs
[H: X≈70, Y≈25] so the graph doesn't collapse the thresholds. Splices inherit
tags automatically (`spliceStrains` unions parents). Offer weights shift
(`geneWeightBreakdown` strain term) — pinned by the same sweep.

---

### WP-3.09 — Insurance → constraint conversion

The design-heavy WP: the remaining death-deleters (post-3.01: `wall_rush`,
`pocket_rift`, `serpentine`, Warp Skin, Rift Aura, Phantom Coil, Iron Scales,
Shadow-Skin-family salvage riders) are individually re-ruled through the five
conversions (C1 consumable-and-slot-occupying · C2 costed-in-protected-currency
· C3 rule-swap · C4 power-scaled cost · C5 categorical constraint), with the
owner ruling per gene on a one-page sheet — **at most one deletion-class effect
survives, as a C1 consumable**. FLUX loses its four-stacked-wall-pardons
identity and is re-founded on *space manipulation that cuts both ways* (C3
examples drafted in the proposal: exit-opposite-side with tail lag; contact
spawns terrain — terrain spawns are D4-legal and D4-synergistic). Amplifier
demotion rides along: flat multipliers become the pity-advancing common band
(offer-gravity change, small). Target mix: constraints ≈40%, deletion ≤5%.

Hot core lock again (collision chain `SnakeGameLogic.ts:1290-1400` + validator
caps + lexicon). Sequenced after 3.08 so conversions are authored against final
tags.

---

### WP-3.10 — D2 ladder

- `src/shared/game/ladder.ts`: 6–8 rungs [H], each **one named rule**, built
  from the substrates this wave already created — rung examples: +1 starting
  band (growth profile step), −1 hold, portal window −15 ticks, INFUSE growth
  +4, PASS DNA halved, one banish fewer, salvage −0.05, "the Serpent's week
  clause is always hostile." Fixed order, cumulative, same for everyone.
- Rung server-stamped into `run_context` (the growth-profile pattern verbatim);
  settlement validates the run under the rung's parameters.
- **Migration 057:** `player_ladders(player_id, dynasty, best_rung, updated_at)`,
  PK (player_id, dynasty), RPC updates via `GREATEST` (Rule 6 by construction).
  Unlock globally: the *attempt* gate reads `MAX(best_rung) across dynasties`;
  the *record* stays per-dynasty — the anti-re-climb ruling.
- Surfaces: Run Setup rung selector (≤1 tap added, §5's 3-tap law holds),
  profile/lab rung display. Ladder feeds Ascendance later — out of scope here.

---

## §4 Migrations

| # | WP | Contents | Applied-state risk |
|---|---|---|---|
| 057 | 3.10 | `player_ladders` + GREATEST RPC | additive; app tolerates absence (ladder dark until flag) |
| 058 | 3.05 | `gene_offer_stats` counters + upsert RPC | additive; settlement emit is try/catch + Sentry, never blocks payout |
| 059 | 3.04 | boards cutover (epoch column **or** sanctioned wipe) | epoch: additive + RPC filter swap. wipe: downward writes, owner authorization recorded in-file |

All forward-only, applied by the deploy workflow after promotion, dry-run list
checked against exactly this table (runbook precondition 5).

## §5 What this wave does NOT do, deliberately

- **No new genes.** 34 is enough; constraint, not content, is the bottleneck.
- **No reroll verb.** The weakest curation verb and the monetisation-shaped one.
- **No synergy-forcing offer AI.** Gravity keeps one slot that never bends.
- **No per-dynasty leaderboards** unless 3.04's comparable-integral check fails.
- **No charge carryover** — §17 test, not a change.
- **No board-size change.** Growth does the work; `gridSize: 20` stands until
  the owner's hands say otherwise in the lab.
- **No coyote time / pre-turn.** Input already exceeds the researched standard;
  revisit only if the lab's CYBER runs still read as unfair at the new floor.
- **No dynasty asymmetry** (removed verbs, distinct failure modes, length-taxed
  Yield) — that is the *next* wave, designed against a game whose pacing is
  finally real. Planning it now would anchor on numbers 3.02 is about to change.
- **No Ascetic/monetisation/PWA/social changes** of any kind.

## §6 Owner sign-off sheet (everything needing your word, in one place)

1. **WP-3.00:** Constitution v1.4 text — especially the new Rule's wording.
2. **WP-3.01 [H]:** INFUSE +8; Thick Hide +8-on-trigger; Ouroboros +2/bite;
   `static_charge` into the Launch pool.
3. **WP-3.02:** play the lab → **rule D1.**
4. **WP-3.03:** FERAL-2 — Fortress (petrify) or economy tier.
5. **WP-3.04 [H]:** curve shapes (feel-check on staging); epoch vs wipe.
6. **WP-3.05 [H]:** PASS reward (≈8 DNA + one weight band).
7. **WP-3.08 [H]:** the dual-tag list.
8. **WP-3.09:** per-gene conversion sheet (one page, one sitting).
9. **WP-3.10 [H]:** the rung list.

## §7 Release shape

Two phase-scoped production releases, both dark-by-default per standing policy:
**R-A** after 3.02 (surgery + lab; the lab flag on in production is acceptable
pre-launch — there is no audience to see the selector, and the owner plays on
the real account so the D1 data lands in `run_events` exactly like the record
run did). **R-B** after 3.09/3.10 with the phase-gate: a full simulated week on
the new game — found clan → Signal with a PASS and a BANISH → Serpent under a
hostile clause at rung 2 → settlement → Depth → share — plus the owner's
replay of the §6 feel-checks, before campus-1. Stripe stays test. PITR
purchase precedes campus-1 seeding, per the standing trigger.
