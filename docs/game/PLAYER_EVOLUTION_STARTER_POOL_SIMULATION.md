# Starter-pool and eligibility-prefix simulation — results

**Version:** 1.0 · 4 August 2026 · Package A evidence

**Authority:** subordinate to `PLAYER_EVOLUTION_ONBOARDING.md` §4.3 and §4.5 and
to Constitution v1.14 §8.3 and §17 items 33–35. This document reports what the
harness measured; the contract documents decide what to do about it.

**Harness:** `src/shared/simulation/starterPool.ts`, pinned by
`src/shared/simulation/starterPool.test.ts`, run with
`npm run simulate:starter-pools`. It imports the shipped engine — `createGenomeV2State`,
`rollGenomeV2Offer`, `reduceGenomeV2Event`, `genomeV2StrainPoints`,
`genomeV2SpliceForPair` — and reimplements none of it. Everything below is
deterministic and offline; the same seeds replay to the same numbers.

**Reproduction:** `npm run simulate:starter-pools`. Every headline number in this
document is asserted by that suite, so a change to weighting, legality, cadence,
or the roster fails the build rather than silently invalidating a ratified
decision.

---

## 1. How the offer engine was modelled

Each traversal builds a run state on a candidate pool and repeatedly asks the real
`rollGenomeV2Offer` for an offer, resolving each by a fixed policy, until the loci
fill or the roll returns null. Five deterministic policies span the choice space —
`first`, `second`, `strain-focus`, `category-spread`, `decline-alternate` (the last
mints Bonds and therefore moves the active-liability weight). 64 seeds × 5 policies
= **320 traversals** per pool per cohort; the prefix sweeps use 16 seeds.

Five cohorts stand in for the run states §4.3 requires:

| Cohort | Banks | Notable state |
|---|---|---|
| `bank0` | 0 | Nothing unlocked; splice weighting inert |
| `bank2` | 2 | CONTINUE + Expressions |
| `bank6-splices` | 6 | Splices active — the only cohort where splice weighting can pay |
| `bank10-tilt` | 10 | Everything unlocked, plus an AURUM World Condition tilt |
| `bank0-signature-locked` | 0 | Today's shipped filter, which withholds the Signature until Apex |

**Modelling the Signature ruling.** Owner ruling 1 deletes the `apexesUnlocked`
disjunct from the offer filter (`genomeV2.ts:3950-3951`). The harness reproduces
the post-deletion filter exactly by setting `ftue.apexesUnlocked = true`, which
makes that disjunct unconditionally true — the same thing deleting it does. Offer
weighting never reads `apexesUnlocked`, so the substitution is exact for everything
measured here. The pre-ruling behaviour is measured separately in the last cohort.

**The gate metric.** `starvedBeforeFullGenome` is the share of traversals where the
offer stream died while a locus was still empty. That is not cosmetic:
`GenomeV2Runtime.openCadenceOffer` (`src/lib/game/genomeV2Runtime.ts:750-755`)
answers a null roll by setting `nextCadenceOfferAtFood = Number.MAX_SAFE_INTEGER`.
Relics stop spawning for the rest of the run, permanently, and portals open with
`genomeOffer: null` so MUTATE has nothing to show. A starved run is a run whose
Genome content silently ends.

---

## 2. Headline: six Genes cannot work

`rollGenomeV2Offer` returns null once fewer than two unseen legal pool entries
remain (`genomeV2.ts:3954`), and `seen` is built from **all** instances including
`replaced` and `ash` (`:3944-3946`), so every acquisition *and every Recode*
permanently consumes one entry. An eligible pool of *n* therefore supports at most
*n − 1* acquisitions.

| Pool size | Legal entries | Max acquisitions | Fills 6 loci? | Recode headroom |
|---|---|---|---|---|
| 5 | 5 | 4 | no | 0 |
| **6** | 6 | **5** | **no** | 0 |
| **7** | 7 | **6** | **yes** | 0 |
| 8 | 8 | 6 | yes | 1 |
| 9 | 9 | 6 | yes | 2 |
| 13 (CYBER roster) | 13 | 6 | yes | 6 |
| 14 (PRIMAL/COSMIC roster) | 14 | 6 | yes | 7 |

With today's Signature lock still in place, a pool containing the Signature loses
one more entry: a 7-pool behaves like a 6-pool and a 6-pool like a 5-pool. **Ruling 1
is load-bearing, not decorative** — seven only works because the Signature is legal.

Measured, across all five cohorts and all 320 traversals each:

| Pool | `starvedBeforeFullGenome` | `filledAllLoci` | `meanAcquisitions` |
|---|---|---|---|
| every 6-Gene candidate, every cohort | **1.000** | **0.000** | 4–5 |
| every 7-Gene recommendation, Signature legal | **0.000** | **1.000** | 6.00 |
| every 7-Gene recommendation, Signature locked | **1.000** | 0.000 | 5.00 |
| complete roster (13/14), any cohort | **0.000** | **1.000** | 6.00–8.33 |

Three six-Gene shapes were tried per Dynasty, including a terrain-leaning variant
and a `live_wire`-for-`circuit_run` swap for COSMIC. All nine failed identically.
No arrangement of six can pass; the constraint is on the count, not the contents.

---

## 3. The recommended starter pools

| Dynasty | Starter pool (7) |
|---|---|
| **CYBER** | `zenith_protocol` · `live_wire` · `gold_trail` · `compound_interest` · `phoenix` · `overgrowth` · `phase_gate` |
| **PRIMAL** | `heartwood` · `live_wire` · `gold_trail` · `compound_interest` · `phoenix` · `overgrowth` · `phase_gate` |
| **COSMIC** | `constellation_crown` · `circuit_run` · `gold_trail` · `compound_interest` · `phoenix` · `overgrowth` · `phase_gate` |

Scorecard against the six §4.3 constraints — identical for all three:

| Property | CYBER | PRIMAL | COSMIC |
|---|---|---|---|
| Includes the Signature | yes | yes | yes |
| Strains reaching Minor (coherent directions) | 3 | 2 | 3 |
| Signature's own Strain reaches Minor | yes (VOLT 2) | yes (FERAL 3) | yes (FLUX 3) |
| Acquisitions to a first Minor | 2 | 2 | 2 |
| Genes needing a still-locked verb | none | none | none |
| Genes not observable in a typical early run | none | none | none |
| Decision categories covered | 6 of 7 | 6 of 7 | 6 of 7 |
| Reachable Splices | 2 | 2 | 2 |
| `starvedBeforeFullGenome`, all cohorts | 0.000 | 0.000 | 0.000 |
| Distinct-category offer rate | 0.985–0.988 | 0.989–0.991 | 0.989–0.992 |

Categories present in all three: `banking`, `body`, `execution`, `survival`,
`terrain`, `yield`. The absent seventh is `genome` — occupied solely by
`loom_anchor`, a Gene about manipulating offers, which is the wrong first lesson
and is therefore the second curriculum unlock instead.

Reachable Splices in all three: **Dragon Hoard** (`gold_trail` + `compound_interest`)
and **Gilded Fork** (`gold_trail` + `overgrowth`). Both are AURUM/FERAL economy
recipes reachable by the time Splices activate at six banks.

Strain points available (maximum, if a player took every member):

| | AURUM | VOLT | FERAL | FLUX | UMBRA |
|---|---|---|---|---|---|
| CYBER-7 | 2 | 2 | 2 | 1 | 1 |
| PRIMAL-7 | 2 | 1 | 3 | 1 | 1 |
| COSMIC-7 | 2 | 1 | 2 | 3 | 1 |

Each Dynasty's own Strain is its deepest, and every Dynasty has at least two
independent Minor routes. UMBRA sits at 1 in all three because its only starter
member is `phoenix`; its partners (`mirror_wager`, `loan_shark`, `loom_anchor`) are
curriculum unlocks, and the visible ladder must say so truthfully.

**Why these Genes.** `gold_trail` (a ×3 window on every fifth target),
`compound_interest` (DECLINE has value, BANK secures it), `overgrowth` (body cost
against a visible yield ramp), `phoenix` (crash exposure taught without requiring a
BANK) and `phase_gate` (an optional route with a permanent cost) each express one
observable rule. `loan_shark` and `mirror_wager` are excluded because both rules
read "portal CONTINUE," which does not activate until one validated bank
(`GENOME_V2_CONFIG.ftue.continueAtBankedRuns = 1`) — neither can teach anything in
run one. `coilkeeper` (eight charging foods before a seal pays) and `wall_rush` (a
deliberate charged wall impact) are excluded as too slow or too advanced to be
observed inside a typical early run.

---

## 4. Splices consume pool depth: the nine-by-six-banks rule

A Splice fuses two instances into one occupant and sets the vacated slot's occupant
to `null` (`genomeV2.ts:1735-1740`). A splicing run therefore keeps asking for more
Genes than it has loci. The complete roster shows this directly:

| Cohort | CYBER (13) | PRIMAL (14) | COSMIC (14) |
|---|---|---|---|
| `bank0` mean acquisitions | 6.00 | 6.00 | 6.00 |
| `bank6-splices` mean acquisitions | **8.33** | **7.86** | **7.88** |
| `bank10-tilt` mean acquisitions | 8.27 | 7.89 | 8.01 |

A 7-Gene pool at the six-bank cohort still never starves before a full Genome
(`starved = 0.000`, `filled = 1.000`), but it goes dry immediately after the first
Splice frees a locus — `minExhaustion = 6`. The player keeps the Genome they built
and loses the ability to rebuild.

**Recommendation:** the curriculum must make **≥9 Genes offer-eligible by six
validated banks** — the starter seven plus two resolved trials. A 9-entry pool
supports 8 acquisitions, matching roster behaviour at that cohort. This is a pacing
floor on the trial schedule, not a change to the starter pool.

---

## 5. Eligibility prefixes

Recommended curriculum order after the starter seven:

| Dynasty | Order |
|---|---|
| CYBER | `circuit_run` → `loom_anchor` → `coilkeeper` → `mirror_wager` → `wall_rush` → `loan_shark` |
| PRIMAL | `circuit_run` → `loom_anchor` → `coilkeeper` → `mirror_wager` → `wall_rush` → `time_dilation` → `loan_shark` |
| COSMIC | `live_wire` → `loom_anchor` → `coilkeeper` → `mirror_wager` → `wall_rush` → `time_dilation` → `loan_shark` |

The two CONTINUE-dependent Genes (`mirror_wager`, `loan_shark`) sit after CONTINUE
activates; `loan_shark` is last because its rule is the longest-horizon contract in
the roster. `loom_anchor` is second because it is the Gene that teaches the offer
system itself, and it completes the Loom Bond Splice with the starter
`compound_interest`.

Every prefix, in every cohort, with the Signature legal:

| Metric | Worst value observed |
|---|---|
| `starvedBeforeFullGenome` | **0.000** |
| `filledAllLoci` | **1.000** |
| Decision categories reachable | 6 (rising to 7 at the second unlock) |
| Distinct-category offer rate | 0.939 |
| Reachable Splices | 2 → 3 → 4 → 5 → 6 → 7 → 8 (monotone) |

Splice reachability is monotone across every prefix in every Dynasty: an unlock
never removes a reachable recipe.

**Order independence.** The player chooses trial order, so a single canonical
sequence proves nothing. Sweeping every rotation of the curriculum remainder
(6 orders for CYBER, 7 each for PRIMAL and COSMIC):

| Dynasty | Worst `starved` | Worst `filledAllLoci` | Worst distinct-category rate | Worst categories |
|---|---|---|---|---|
| CYBER | 0.000 | 1.000 | 0.945 | 6 |
| PRIMAL | 0.000 | 1.000 | 0.963 | 6 |
| COSMIC | 0.000 | 1.000 | 0.939 | 6 |

No order produces a starved prefix.

---

## 6. Full-pool fairness

§4.5 forbids a prefix from holding a persistent probability advantage over the
complete roster. Two concentration metrics test it: the share of served offers
containing an immediate Splice completion, and the share advancing the traversal's
leading Strain. Positive means the smaller pool is *better*.

| Pool | Cohort | Splice advantage | Strain advantage | Loci advantage |
|---|---|---|---|---|
| CYBER-7 | `bank0` | −0.008 | −0.240 | 0.000 |
| CYBER-7 | `bank6-splices` | **−0.208** | −0.194 | 0.000 |
| PRIMAL-7 | `bank0` | +0.065 | −0.062 | 0.000 |
| PRIMAL-7 | `bank6-splices` | **−0.141** | −0.042 | 0.000 |
| COSMIC-7 | `bank0` | +0.045 | −0.080 | 0.000 |
| COSMIC-7 | `bank6-splices` | **−0.143** | −0.066 | 0.000 |
| any 6-pool | either | +0.04 … +0.10 / −0.12 … −0.18 | mixed | **−1.000** |

Reading it honestly: at `bank0` two of the three 7-pools show a small positive
splice-pairing figure (+0.045, +0.065). That is a *structural* measurement of how
often an offer contains a gene that would pair with one already held — and at bank 0
it cannot pay, because `splicesEnabled` is false, `spliceCompletionForCandidate`
returns null (`genomeV2.ts:4008`), and the `immediateSpliceWeight` never applies.

In the only cohort where the advantage could be live, `bank6-splices`, **every
prefix is worse than the complete roster** on both metrics, by 0.14–0.21 and
0.04–0.19 respectively. The complete roster also reaches every category (7 vs 6) and
every Splice (8 vs 2), and never starves. There is no state in which a player is
better off refusing an unlock, and the 6-pools are catastrophically worse on the one
metric that matters most (−1.000 on reaching a complete Genome).

**Conclusion: the fairness gate passes for the seven-Gene pools and every prefix of
the recommended orders, and fails outright for every six-Gene pool.**

---

## 7. What this simulation does not settle

- **Legibility.** It proves that seven Genes keep the offer stream alive; it says
  nothing about whether a novice can read seven Gene cards. §9.1 comprehension
  testing still gates rollout.
- **Teaching order quality.** It proves no order starves. Which order teaches best
  is a research question.
- **Real run length.** Traversals run until the pool is exhausted, which is the
  worst case. A short real run collects fewer relics and never approaches the cliff.
- **Recode and INFUSE pressure.** Both consume pool entries the same way, and both
  activate at four banks. The recode-headroom column in §2 is the budget; a player
  with 7 eligible Genes has none, which is another argument for the nine-by-six-banks
  pacing floor.

## 8. Operating cost

This harness is permanent maintenance, and the §13 decision table records it as
such. Any change to `GENOME_V2_GENES`, `GENOME_V2_SPLICES`, the offer weighting in
`GENOME_V2_CONFIG.offers`, the legality filter, the FTUE ramp, or the starter and
curriculum constants requires re-running `npm run simulate:starter-pools` and
updating this document. The pinned assertions are deliberately strict so that
omission is loud.
