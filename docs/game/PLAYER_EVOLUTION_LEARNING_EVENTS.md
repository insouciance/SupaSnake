# Learning-event catalog — one deterministic event per current-roster Gene

**Version:** 1.0 · 4 August 2026 · Package A evidence

**Authority:** subordinate to `PLAYER_EVOLUTION_ONBOARDING.md` §4.4, which requires
"one versioned `learning_event` per Gene … an event already present in the journal."
This document names that event for all 16 current-roster Genes, cites the producer
in code, and flags the two Genes that have no such event today.

**Method.** Every candidate was checked against the v2 journal union
(`src/shared/game/genomeV2.ts:636-799`) and the reducer sites that write the
resulting durable state. Nothing here is proposed new engine behaviour except where
a row is explicitly marked **GAP**. Line numbers are against `origin/main` `4fb6271`.

**Contract version.** The catalog ships as `learning_event_version = 1`. A Gene's
event may only change under a new version, and a completed resolution at an older
version stays completed — eligibility is monotonic (Constitution §8.3).

---

## 1. Resolution rule

A trial resolves when its named event occurs in **authoritative play**, whether the
outcome is success or failure (§4.4, boundary 7). Success and failure both count
because the lesson is "you now know what this does," not "you executed it well."

Resolution is detected **server-side at settlement from the validated run record**.
The client never claims it. Previewing in the Workbench, opening a tooltip, or
visiting a route is never proof.

## 2. The catalog

`Kind` distinguishes how the event is observed:

- **target** — a target whose `GenomeV2TargetState.kind` equals the Gene's ID
  reaches a terminal `lifecycle` (`completed` on success, `burnt`/`expired` on
  failure). Written at `genomeV2.ts:2862-2868` from the `target_resolved` event
  (`:722-735`). The exclusive-kind union is `:437-443`.
- **journal** — a dedicated event type exists for the Gene.
- **ledger** — the Gene's effect writes a named, durable field on the run state.

| # | Gene | Category / Strains | Learning event | Kind | Producer (file:line) | Success vs failure | Unteachable when |
|---|---|---|---|---|---|---|---|
| 1 | `gold_trail` | yield · AURUM | A Gilded target resolves, or its premium window expires | target + journal | event `genomeV2.ts:722`, `:743` (`target_window_expired`); lifecycle `:2862-2868` | collected in-window = `completed`; window expiry or miss = `burnt`/`expired` | — |
| 2 | `compound_interest` | banking · AURUM | A deliberate Loom DECLINE mints a Bond | journal + ledger | event `:645`; write `:2485-2487` (`state.bonds + 1`) | the Bond exists either way; crash simply pays nothing | — |
| 3 | `loan_shark` | banking · AURUM/UMBRA | A portal CONTINUE opens the six-food Escrow contract | journal + ledger | event `:667`; write `:2344` (`state.loan`), `:2195` (`loanEscrowDeposited`) | released (`:2204`) = success; BANK/crash before completion = failure | CONTINUE locked (< 1 validated bank) |
| 4 | `live_wire` | execution · VOLT | A Live Wire route test resolves | target | `:722`; lifecycle `:2862-2868`; kind `:439` | within `moveBudget` = `completed`; over budget = `burnt` | — |
| 5 | `circuit_run` | execution · VOLT/FLUX | A linked Circuit route resolves | target | `:722` (`circuitLegsCompleted`, `:734`); lifecycle `:2862-2868` | both legs = `completed`; broken route = `burnt` | — |
| 6 | `time_dilation` | body · VOLT/FERAL | **GAP — none exists** | — | growth only, `:2303-2307`; no journal event, no named ledger field | n/a | CYBER (excluded from the roster, `genes.ts:577-579`) |
| 7 | `overgrowth` | body · FERAL | **GAP — none attributable** | — | growth `:2300-2302`; Yield folds into `ledger.continuousDelta` `:2162`, `:3157`, which is shared with other continuous mechanics | n/a | — |
| 8 | `coilkeeper` | terrain · FERAL/FLUX | A coil seals territory | journal + ledger | event `:747` (`coil_sealed`); write `:2917`/`:2954` (`permanentTerrain`, `source: 'coilkeeper_seal'`) | the seal itself is the lesson; the empowered target that follows is the payoff | — |
| 9 | `wall_rush` | terrain · FLUX/VOLT | A charged wall impact redirects along its previewed tangent | journal | event `:758` (`wall_redirected`); write `:2973` (charge spent) | armed route resolved = success; missed = failure, charge still spent | No charge available (`state.wallRushCharges < 1`, `:2969`) |
| 10 | `phase_gate` | terrain · FLUX | A gate shortcut is taken | journal + ledger | event `:752` (`phase_gate_used`); write `permanentTerrain`, `source: 'phase_gate_scar'` | taking the gate is the lesson; the Scar is its cost | — |
| 11 | `mirror_wager` | banking · UMBRA | A portal CONTINUE freezes a visible Stake | journal + ledger | event `:667` with `activateMirror: true` (`:670`); write `:2360` (`state.mirrorLeg`), `:2268` (`ledger.mirrorStake`) | BANK doubles it; crash loses only the Stake — both resolve | CONTINUE locked (< 1 validated bank) |
| 12 | `phoenix` | survival · UMBRA/FERAL | The second life is consumed | journal | event `:797` (`phoenix_triggered`); write `:3246` (Ash occupies the socket) | there is no failure mode: firing is the lesson | **`externalSecondLife !== null`** — an equipped outside revive (`iron_scales`) excludes Phoenix from the offer filter entirely (`:3935`) |
| 13 | `loom_anchor` | genome · AURUM/UMBRA | A pinned candidate is delivered into the next offer | journal | pin on `offer_declined.pinGeneId` (`:648`); delivery on `offer_opened.pinnedGeneId` (`:642`), honoured at `:2442-2449` | delivery = success; the run ending before the next offer = unresolved, not failed | Fewer than two offers remain reachable in the run |
| 14 | `heartwood` | body · FERAL · PRIMAL signature | Deliberate body geometry claims territory | journal + ledger | event `:762` with `source: 'heartwood'` (`:766`); write `:2998` (`state.territories`) | the claim is the lesson | Non-PRIMAL run |
| 15 | `zenith_protocol` | execution · VOLT · CYBER signature | An overclock window opens | journal | event `:769` with `source: 'zenith_protocol'` (`:771`); write `:3025` (`state.overclock`); closes at `:774` | mistimed overclock still teaches; both resolve | Non-CYBER run |
| 16 | `constellation_crown` | execution · FLUX · COSMIC signature | A Crown wave closes | journal | event `:792` with `outcome: 'perfect' \| 'failed'` (`:794`) | **both outcomes resolve** — this is the clearest failure-teaches case in the roster | Non-COSMIC run |

**14 of 16 Genes map to an existing deterministic event. Two do not.**

## 3. The two gaps — WP-B work items

### GAP-1 · `time_dilation`

Its entire effect is passive: world speed ×0.88, and one extra segment on every
fourth food (`genomeV2.ts:2303-2307`, physics table `:4089-4095`). The reducer emits
no event and writes no named field. There is nothing in the journal or the settled
record that says "this player experienced Time Dilation."

*Recommended resolution (WP-B):* count the extra segments the Gene caused into a
named durable counter and resolve on the first one. That is the moment the rule
becomes visible — the snake grew when the player did not expect it — and it is the
Gene's actual cost. The alternative, resolving on acquisition, is not a learning
event at all and must be rejected.

*Interim option if WP-B cannot afford the counter:* schedule `time_dilation` late in
the curriculum (it already is: last-but-one for PRIMAL and COSMIC, absent for CYBER)
and resolve it on the first `target_resolved` at least four foods after acquisition.
That is derivable from retained state without new fields, but it is weaker evidence
and should be recorded as such.

### GAP-2 · `overgrowth`

Its growth is written at `:2300-2302` and its Yield folds into
`ledger.continuousDelta` (`:2162`, `:3157`) — a field the comment explicitly
describes as covering "scalable continuous mechanics such as Overgrowth," i.e. more
than one source. It is not attributable to the Gene.

*Recommended resolution (WP-B):* resolve on the first `target_resolved` after
acquisition whose `pressureBps` is high enough that the multiplier has visibly risen
off its `minYieldMultiplierBps` floor. `pressureBps` is already a canonical fact on
the event (`:729`), so this needs a threshold constant and a durable flag, not new
telemetry. The threshold is a tuning value and belongs in `GENOME_V2_CONFIG`.

Both gaps are catalog items, not blockers: the recommended starter pools contain
`overgrowth` (all three) but not `time_dilation`, and a starter Gene is
OFFER_ELIGIBLE from run one and therefore never needs a learning event. GAP-2 only
becomes load-bearing if a future roster change moves `overgrowth` into the
curriculum.

## 4. Why detection must not scan the journal

The run journal is compacted: once it exceeds 256 entries the oldest 64 are folded
into a digest and discarded (`genomeV2.ts:1582-1594`), and resolved targets compact
the same way above 96 (`:1596-1617`). A settlement-time scan for "did event X
happen" therefore returns **false for a long run** in which the event happened
early — the exact runs an engaged learner produces.

Several of the durable facts above are also non-monotone within a run:
`wallRushCharges` is restored by a portal CONTINUE (`:2589`), `state.overclock`
returns to null when the window ends (`:774`), `crownWave` closes, `anchor.pinnedGeneId`
clears on delivery (`:2513-2515`), and `ledger.mirrorStake` is zeroed when Phoenix
consumes it (`:3201`). None of them can be read at settlement as "this happened."

**Required design (WP-B/C):** the reducer that emits the event also records the
resolution on a **bounded monotone field of the run state** — at most 16 Gene IDs,
append-only, never cleared. It is deterministic, identical under replay, survives
compaction, and stays far inside the 384 KiB persistence bound
(`GENOME_V2_CONFIG.persistence.maximumSerializedBytes`). Settlement reads that
field from the validated record and nothing else. `PLAYER_EVOLUTION_SERVER_CONTRACT.md`
§4 specifies the shape.

## 5. Unteachable conditions, collected

A trial must be **suppressed rather than consumed** whenever its event cannot
occur. Suppression means the trial does not enter the roll for that run and the
three-offer guarantee is not decremented.

| Condition | Genes suppressed | Source |
|---|---|---|
| `externalSecondLife !== null` (equipped `iron_scales` or other outside revive) | `phoenix` | `genomeV2.ts:3935` — already excluded from `legal` by the shipped filter |
| Dynasty ≠ PRIMAL | `heartwood` | `genes.ts:580-586` |
| Dynasty ≠ CYBER | `zenith_protocol` | `genes.ts:580-586` |
| Dynasty ≠ COSMIC | `constellation_crown` | `genes.ts:580-586` |
| Dynasty = CYBER | `time_dilation` | `genes.ts:577-579` — not in the CYBER roster at all |
| CONTINUE not yet activated (< 1 validated bank) | `loan_shark`, `mirror_wager` | `GENOME_V2_CONFIG.ftue.continueAtBankedRuns = 1` |
| MUTATE not yet activated (< 4 validated banks) | any trial intended to be met at a portal | `ftue.portalGenomeAtBankedRuns = 4` |
| Free Play | all trials | `PLAYER_EVOLUTION_ONBOARDING.md` §4.4 |
| No relic collected in the run | all trials | Relics open the Loom only on deliberate collection (Constitution v1.13 Overturn #34) |

`wall_rush` is a partial case: its charge starts at 1 and is restored only by a
portal CONTINUE (`GENOME_V2_CONFIG.wallRush.recharge = 'portal_continue'`). It is
teachable in run one but only once, so its trial should not be scheduled before
CONTINUE activates.

## 6. Operating cost

This catalog is maintained by hand and must be re-derived whenever the journal
union, the reducer's durable writes, or the roster changes. Every row cites a line
number precisely so that drift is detectable by review rather than by a player
noticing a Gene that never unlocks. A Gene added to the roster without a learning
event cannot enter the curriculum — it must ship as a starter-pool entry or wait.
