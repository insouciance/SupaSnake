# Energy Commitment and Clan Energy Battles

**Status:** authoritative implementation contract
**Owner ruling:** 29 July 2026
**Constitution:** v1.5 §6.2, §7.3, §8.6, §9

## Outcome

Energy accumulates on server time. Before an ordinary earning run, the player
chooses how much recovered Energy to expose. Higher commitment multiplies the
normal run harvest nonlinearly, but all of it is consumed at start and a crash
does not return it. During an active World Serpent Clan Energy Battle, the same
ordinary run is assigned automatically and can become one of the player's five
contributing results only if it is successfully banked.

This is one loop, not a battle mode:

> Commit. Execute. Decide when the run is valuable enough to protect. Bank—or
> lose the potential clan result.

## Confirmed prior production rules

The repository did not match the owner's initial understanding before this
change:

- Migration 039 implemented six UTC-daily charges. One ordinary earning run
  consumed one charge; after six, ordinary run harvest fell to 25%. There was
  no hourly recovery or stored partial progress.
- Free Play, the daily Signal objective, and explicit World Serpent attempts
  were exempt.
- Migration 011 still contained an older weekly clan-duel system whose scoring
  used up to thirty DNA results per player. It was behind a population gate and
  was not the active player-facing clan loop.
- Migrations 046/048 implemented the newer World Serpent: a separate explicit
  attempt, no Energy cost, best three full-strength Yields per member, weekly
  cooperative Depth, and no DNA settlement reward.
- Clan membership already capped at twelve members.
- The game has one final BANK/extraction settlement, not a partial multi-bank
  economy. “Multiple banks” therefore has no current calculation to multiply;
  every existing settlement/retry path uses the immutable commitment instead.

Migration 059 retires the fixed envelope and the player-facing explicit Serpent
attempt. Historical Serpent sessions, weeks, artifacts, and honors remain
readable and settle under their original stamped rules.

## Configurable launch values

Energy/battle timing values originate in `src/shared/config/game.ts`; bounded
clan economy values originate in `src/lib/clan/config.ts`. The server passes
both sets into the authoritative RPCs:

| Dial | Launch value |
|---|---:|
| Stored Energy cap | 6 |
| Minimum positive commitment | 1 |
| Maximum commitment | 6 |
| Recovery interval | 3,600 seconds per Energy |
| Lean run harvest | ×0.25 |
| Commitment curve | ×1.0 / ×2.2 / ×3.6 / ×5.2 / ×7.2 / ×10.0 |
| Battle active window | 259,200 seconds (3 days) |
| Intermission | 86,400 seconds (1 day) |
| Counted results/member | 5 |
| Completion grace | 10,800 seconds (3 hours) |
| Maximum clan-eligible run duration | 10,800 seconds (3 hours) |
| Cycle epoch | 2026-07-27 00:00 UTC |
| Eligible contributor participation reward | 100 DNA |
| Victor outcome bonus | +100 DNA (200 total) |
| Stalemate outcome bonus | +50 DNA (150 total) |
| Unmatched-side reward | 100 DNA participation only |

Storage constraints permit a guarded 1–24 range so a reviewed config change
does not require a destructive schema rewrite. The product limit is six until
the config and curve are deliberately changed together.

## Authoritative Energy lifecycle

`players.stored_energy` is the materialized stock and
`players.energy_updated_at` is the partial-tick anchor. `read_player_energy`
locks the player row, uses database `NOW()`, applies whole elapsed ticks, keeps
the remainder, clamps future anchors, discards time above cap, persists the
result, and returns a server timestamp. Timezone and device clock never enter
the mutation.

`commit_run_energy` locks the open session and player row in one transaction:

1. Reconcile recovery.
2. Validate 0–6 and available stock.
3. Consume the full positive commitment.
4. Stamp commitment, basis-point multiplier, recovery facts, and clan
   eligibility on the session.
5. Lock those properties against later mutation.

Calling the RPC again for the same session reconciles recovery but returns the
original commitment snapshot without consuming twice. Concurrent starts
serialize on the player row, so the available balance cannot be overspent.

Zero means an explicit lean run. Free/Training and the one daily Signal
objective remain reward-exempt. A legacy client that asks for `mode: serpent`
is normalized to an ordinary Energy run; it no longer opens a separate ruleset.

Maximum commitment is deliberately guarded twice: the selector needs two taps
before it can set six, and the API rejects six without `confirmMaxEnergy: true`.
Replay never repeats a multi-Energy exposure silently; it uses one recovered
Energy, or lean when none is available.

## Reward formula

Let:

- `Y` = full-strength server-settled run Yield after genes, traits, condition,
  generation/Ascendance, and extraction or crash outcome;
- `c` = immutable Energy committed at start;
- `M(c)` = stored basis-point commitment multiplier.

Then normal credited run DNA is:

```text
credited_DNA = floor(Y × M(c))
```

For a lean run, `M(0) = 0.25` and positive Yield credits at least 1 DNA.

The multiplier applies only to ordinary run harvest. It does not apply to
Score, `yield_dna`, Mastery XP, Signal/Take bonuses, achievements, fixed
unlocks, quests, rare fixed drops, ladder values, or clan Depth. The client
previews the same integer basis-point formula and Results reports `Y`,
commitment, multiplier, and authoritative credited DNA.

A crash may still receive the game's existing personal salvage, multiplied by
the committed harvest factor. It does not preserve a clan contribution. This
is why banking, rather than merely reaching a high provisional value, protects
the social result.

## Clan eligibility and edge rules

Eligibility is determined at start and stored immutably. A run is assigned
when all of these are true:

- positive Energy was committed;
- a Clan Energy Battle is active;
- the player is a current member of a non-disbanded clan;
- the player is not cycle-locked to a different clan.

It contributes only when all of these are later true:

- the normal server validation passes;
- the run is banked/extracted;
- the start was inside the active window;
- total run duration is no more than three hours;
- completion is no later than battle end plus the three-hour grace;
- the session has not already been recorded.

Consequences:

- A run started before the deadline and banked within the grace counts.
- Longer personal runs still settle normally, but stop being clan-eligible
  after the competitive three-hour anti-delay bound.
- A run begun after the deadline never counts.
- Leaving or removal during a run does not rewrite its start snapshot.
- Joining during a battle is allowed from the first Energy run if the player
  has no lock for another clan in that cycle.
- Switching clans cannot redirect attempts or score twice; the new clan is
  available next cycle.
- Confirmed abandonment closes with no refund and no contribution. Refresh,
  disconnect, tab/browser closure, or client failure leave the run recoverable from
  its latest accepted server checkpoint and are never interpreted as abandonment.
- Revives do not change commitment or eligibility; only the eventual bank does.
- Duplicate completion is idempotent. The hourly reconciler catches a valid
  settled session if the non-fatal clan overlay failed after personal payout.
- Settlement waits until the completion grace has elapsed.
- Generation upgrades remain available. Each contribution records the
  run-start generation; there is no launch snapshot or progression lock.

## Clan scoring

For each eligible banked session `s`:

```text
run_contribution(s) = session.yield_dna
player_depth = sum(highest 5 run_contribution values)
clan_depth = sum(player_depth for all contributing members)
```

Ties order by earlier completion, then stable session id. All eligible attempts
remain auditable; only five are marked counted. A new result re-ranks that
player's set, drops the weakest beyond five, computes the nonnegative delta,
and updates the side total while holding a side-row lock. The session unique
constraint and stored result payload make retries idempotent.

Energy does not multiply clan score. This preserves one coherent investment
result—full-strength Yield—and prevents a 6-Energy run from receiving an
automatic ×10 competitive advantage. Commitment matters through personal
economic exposure, scarcity, confidence, and banking behavior. An exceptional
1-Energy run can beat a cautious 6-Energy run.

The player sees their five, fifth-best line (zero until all five slots are
filled), commitment and generation for each result, replacement, and clan
delta. Clan members also see the roster's server-verified best-five totals,
ranks, and relevant run context so contribution and improvement are legible.
No leader or client can edit those facts.

## Settlement rewards

A valid participant receives a permanent history honor:

- `victor` for a winning paired side;
- `participant` for a losing side or an unmatched side;
- `stalemate` for a tie.

The victor mark is the stronger prestige outcome. Everyone who actually
contributed receives permanent identity/history. Settlement credits each
eligible contributor 100 DNA. A contributor on the winning side receives a
further 100 DNA (200 total); a contributor in a genuine stalemate receives a
further 50 DNA (150 total). An unmatched side receives participation only—no
phantom victory and no victory bonus. The three live dials are independently
bounded to 0–1,000 DNA in application config and SQL.

One immutable `clan_energy_battle_reward_ledger` row snapshots the exact base,
bonus, outcome, counted Depth, run counts, Energy committed, side score, and
opponent score for each eligible player/battle. Its unique player+battle key
and the linked `economy_transactions` row make retries idempotent; a later tune
cannot reprice history. Settlement also writes one Career moment and one
server-backed Compete recognition item keyed to that ledger row. The Energy
Battle panel shows the exact receipt, and viewing that exact artifact clears
the badge. Glory rewards use their separate bounded ledger but the same
discoverable receipt/attention grammar. None of these credits change Energy,
Yield, the same battle's score, or leaderboard values.

The contract is forward-only. `clan_energy_battles.reward_terms_version = 1`
is stamped by default only on battles created after the migration cutover;
pre-cutover rows remain `NULL` and are never back-paid. The settlement repair
pass therefore covers interrupted rolling-deploy payouts without minting DNA
for historical outcomes that never promised it.

At settlement, each participant's best-five Depth and each side's clan Depth
are banked once into the existing monotonic personal/clan Depth history. That
is preservation of performance already earned by the runs, not an outcome
reward; both victor and participant sides bank their exact achieved Depth.

## Economy impact model

Use `H` as the expected credited value of one successful ×1 Energy run. The
old six-charge system yielded, before exempt rituals:

```text
old(n runs/day) = min(n, 6)H + max(n - 6, 0) × 0.25H
```

The new system is unavoidably more generous under high activity:

| Behavior | Old relative harvest | New relative harvest | Change |
|---|---:|---:|---:|
| 1 one-Energy run/day | 1H | 1H | unchanged |
| 6 one-Energy runs/day | 6H | 6H | unchanged |
| 12 one-Energy runs/day | 7.5H | up to 12H | +60% |
| 24 one-Energy runs/day | 10.5H | up to 24H | +129% |
| Spend six at once, one comparable success | 1H for that one old run / 6H if all six old charges were separately played | 10H | +900% per attempt / +67% vs six separate charged successes |
| Four successful 6-Energy runs across a fully harvested day | 10.5H at 24 old runs | 40H | +281% |

The nonlinear curve pays per Energy at ×1.00, ×1.10, ×1.20, ×1.30, ×1.44,
and ×1.67 respectively. Concentrating six units increases variance and
psychological pressure, but it does not mathematically cancel the premium; it
is an explicit progression accelerator when the player succeeds.

The six-unit cap preserves the old supply for a once-daily player who empties
it and returns a day later. It does not preserve the old economy for someone
who returns throughout the day, and a once-daily player who commits all six to
one successful run receives 10H rather than the old 6H available across six
runs. The release accepts that risk rather than hiding a base-harvest nerf.

No broad DNA cost or reward retune ships with migration 059. If live data shows
unacceptable acceleration, change one visible dial at a time in this order:

1. Recovery interval.
2. Commitment premium curve, especially five/six.
3. Stored cap only if session cadence—not reward/Energy—is the problem.
4. Lean factor only if unlimited tail farming is the problem.

Do not weaken ordinary base Yield, introduce a daily ceiling silently, alter
controls, or apply high-commitment difficulty to compensate. The contemplated
×12 at six is not considered until the ×10 cohort is measured.

## Telemetry contract

No consent-bypassing behavioral tracker is required. Server-authoritative rows
already persist the analysis facts:

- `players`: stock and recovery anchor;
- `game_sessions`: availability before, recovered at start, commitment, basis
  points, run-start build/generation, duration, events/bank timing, outcome,
  revive/genome context, full Yield, credited DNA, battle snapshot, and
  fifth-best line at start;
- `economy_transactions`: credited reward and Energy/battle metadata;
- `clan_energy_contributions`: every eligible bank, counted state, rank,
  replacement, threshold, score delta, completion time, Energy, and generation;
- `clan_energy_battle_sides` / `clan_energy_battles`: totals, timing, pairing,
  outcome, and settlement;
- `clan_energy_cycle_memberships`: membership/switch lock;
- `clan_energy_honors`: participant/winner history;
- `clan_energy_battle_reward_ledger`: exact participation/outcome payout,
  contribution context, economy transaction, and idempotency boundary;
- `clan_glory_reward_ledger`, `progression_moments`, and
  `player_attention_items`: exact Glory receipts plus cross-device Compete
  recognition;
- breeding/economy history: DNA earned/spent and generation changes by day.

Required live queries answer:

- commitment mix, bank/crash rate, bank timing, run duration, revive use, and
  effective credited DNA per Energy;
- recovery utilization, time at cap, sessions/day, and DNA/day by activity and
  progression cohort;
- top-five fill/replacement rate, start threshold, commitment and generation
  distribution among counted/non-counted attempts, contribution delta, and
  attempts by battle day;
- final-day clustering, postponed six-Energy attempts, generation changes,
  participation/member, repeat winners, and victor/participant progression.

The first balance review should specifically determine whether high commitment
causes earlier banking, whether caution reduces the realized premium, whether
six becomes a social expectation despite score independence, whether skilled
one-Energy runs remain present in top fives, and whether hourly recovery bends
generation pacing beyond the intended curve.

## Architectural decisions

- Recovery and consumption are database RPCs using `NOW()` and row locks.
- Commitment and clan identity are one immutable session snapshot.
- Personal reward settlement stays primary; clan recording is a non-fatal
  overlay with an hourly reconciler.
- Basis points provide exact integer rounding across preview and settlement.
- Clan side locking plus top-five re-ranking provides atomic aggregate deltas.
- Service-only RPC grants and RLS prevent clients from writing balances,
  commitments, battle assignment, or contributions.
- Battle outcome, contributor reward, economy audit, Career moment, and Compete
  attention settle atomically for a newly closed battle. The same RPC repairs
  a previously settled battle with a missing receipt without duplicating DNA.
- Existing normal run validation, physics, Genome, revives, and progression are
  reused. No speculative queue, second wallet, or battle ruleset exists.
- The compatibility layer supports a safe app-before-migration deployment:
  lean/exempt and default one-Energy starts work; larger commitments return a
  clear temporary-unavailable result rather than receiving incorrect value.
- Migration 059 also replaces the old `consume_run_charge` body with an
  emergency rollback bridge. If the application is rolled back after the
  schema cutover, the old one-charge caller recovers and consumes the new
  stored Energy atomically instead of reviving the retired daily counter as a
  second pool. This intentionally degrades to one-Energy/lean runs until the
  current application is restored; it cannot express commitments or clan
  assignment that did not exist in the old request contract.

## Values requiring live playtesting

1. One-hour recovery versus 90/120 minutes.
2. ×10 at six versus a lower premium; ×12 is explicitly deferred.
3. Five counted results versus four.
4. Three active days and one intermission day.
5. Three-hour completion grace and exploit-resistant maximum run duration.
6. Whether banked crash salvage should remain personal-only (launch ruling) or
   any future partial-bank system needs an explicit clan rule.
7. Commitment default 1 and two-tap maximum comprehension.
8. Whether unlocked progression produces material final-day dominance.
9. Pairing quality once enough clans exist for size/activity bands.
10. Whether the 100 / 200 / 150 DNA participation/victor/stalemate totals are
    large enough to feel consequential without causing repeat-winner
    progression snowball; tune one bounded differential at a time from live
    contributor, repeat-win, and generation-velocity cohorts.
