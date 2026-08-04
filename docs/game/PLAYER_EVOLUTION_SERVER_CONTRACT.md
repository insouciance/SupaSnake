# Curriculum server contract — state, API, stamping, migration, rollout

**Version:** 1.0 · 4 August 2026 · Package A specification

**Authority:** subordinate to `PLAYER_EVOLUTION_ONBOARDING.md` §4 and §8 and to
Constitution v1.14 §8.3. This document **specifies**; it implements nothing. No
migration file, runtime change, or flag exists on this branch. WP-B and WP-C build
from here and restate the final shapes in their PR descriptions before implementing
(contract-first parallelism, `AGENTS.md`).

**Verified against** `origin/main` `2fe33ca`. Every code and migration citation below
was read, not inferred.

---

## 1. Where eligibility lives

### 1.1 Not on `players`

`players` carries exactly one UPDATE policy, written in `001_initial_schema.sql:145`:

```sql
CREATE POLICY players_update_own ON players
  FOR UPDATE USING (auth.uid() = user_id);
```

There is no `WITH CHECK`, no column-level `REVOKE UPDATE`, and no later migration
narrows it. Postgres reuses `USING` for the new row, so a row cannot be re-owned —
but every other column on `players` is directly writable by an authenticated client.
Putting curriculum eligibility there would make the client the author of its own
Gene pool. It goes in a satellite table with no write policy at all.

### 1.2 `player_gene_eligibility`

Shape (WP-B writes the migration; the number is claimed at merge time, never at
branch time — `AGENTS.md`. The next free slot as of this survey was **066**):

```sql
CREATE TABLE IF NOT EXISTS player_gene_eligibility (
  player_id          UUID        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  rules_version      SMALLINT    NOT NULL,
  gene_id            TEXT        NOT NULL,
  state              TEXT        NOT NULL,
  source             TEXT        NOT NULL,
  first_eligible_at  TIMESTAMPTZ,
  trial_selected_at  TIMESTAMPTZ,
  trial_offers_seen  SMALLINT    NOT NULL DEFAULT 0,
  learning_event_version SMALLINT NOT NULL,
  resolved_session_id UUID       REFERENCES game_sessions(id) ON DELETE SET NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, rules_version, gene_id),
  CONSTRAINT gene_eligibility_state_check
    CHECK (state IN ('trial', 'offer_eligible')),
  CONSTRAINT gene_eligibility_source_check
    CHECK (source IN ('starter', 'trial_resolved', 'migration_credit', 'graduation')),
  CONSTRAINT gene_eligibility_trial_offers_check
    CHECK (trial_offers_seen >= 0 AND trial_offers_seen <= 3),
  CONSTRAINT gene_eligibility_eligible_shape
    CHECK (state <> 'offer_eligible' OR first_eligible_at IS NOT NULL)
);
```

**`visible_locked` is the absence of a row.** Three states in the doc, two in the
table: storing the locked state would mean writing 13–14 rows per account at signup
and keeping them correct through roster rotation. Absence is cheaper, is
self-healing when a Gene is shelved and returns, and makes the monotonicity
invariant trivially true — rows are only ever inserted or promoted.

`rules_version` is in the primary key so a future Genome v3 roster starts a fresh
curriculum without rewriting v2 history, exactly as
`GENOME_V2_SHARED_GENE_IDS` is a separate catalog from `GENE_POOL`.

`gene_id` is deliberately `TEXT` with no enum: the roster rotates within the §12.2
cap, and a schema change per rotation is a worse trade than validating in the RPC
against `isGenomeV2ActiveGeneId`.

### 1.3 RLS and grants — the `player_ladders` precedent

`057_player_ladders.sql:134-158` is the pattern to copy exactly:

```sql
ALTER TABLE player_gene_eligibility ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS player_gene_eligibility_select_own ON player_gene_eligibility;
CREATE POLICY player_gene_eligibility_select_own ON player_gene_eligibility
  FOR SELECT
  USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );
```

SELECT-only for the row's owner; **no INSERT, UPDATE, or DELETE policy at all**, so
a direct client write is refused by the database rather than by convention. Note the
column is `players.user_id`, not `auth_user_id` — every RLS policy in this schema
since `001` spells it that way, and the ladder migration's own comment records that
guessing otherwise aborted the migration with `42703`.

Writes go through `SECURITY DEFINER SET search_path = public` functions, with
`REVOKE ALL … FROM PUBLIC` and `GRANT EXECUTE … TO service_role` and **no grant to
`authenticated`** (`057:213-214`). `036_service_role_privileges.sql:11-21` already
grants service_role everything in `public`, so the table is service-writable the
moment it exists — the RPC boundary is the only real gate.

### 1.4 Monotonicity

Eligibility is never revoked (Constitution §8.3, "horizontal and monotonic"). The
RPCs enforce it in the same shape `record_ladder_rung` uses for `GREATEST`:

- `state` may go `absent → trial → offer_eligible` and `absent → offer_eligible`.
  It may never go backwards; an `ON CONFLICT DO UPDATE` that would demote is a
  no-op.
- `first_eligible_at` is written once and never overwritten.
- `trial_offers_seen` only increases, capped by the CHECK.
- A Gene leaving the roster leaves its row intact. If it returns under a compatible
  rule identity, the account does not repeat onboarding (§4.2).

## 2. RPCs

All are `SECURITY DEFINER`, service-role-only, idempotent, and take the *player* id
resolved from the caller's token by the route — never a client-supplied player id.

| RPC | Purpose | Idempotency key | Returns |
|---|---|---|---|
| `grant_starter_eligibility(p_player_id, p_rules_version, p_gene_ids[])` | Seed the seven starter Genes at first run-start | `(player_id, rules_version, gene_id)` PK | rows written |
| `select_gene_trial(p_player_id, p_rules_version, p_gene_id)` | Set or switch the chosen trial | replaces the single `state = 'trial'` row for that `(player, rules_version)` | the new trial row |
| `record_trial_offer(p_player_id, p_rules_version, p_gene_id, p_session_id)` | Increment the guarantee counter for a *collected offer that contained the trial* | `(player, rules_version, gene_id, session_id, offer_index)` — see §2.1 | remaining offers |
| `resolve_learning_event(p_player_id, p_rules_version, p_gene_id, p_session_id, p_learning_event_version)` | Promote `trial → offer_eligible` from a settled, validated run | `resolved_session_id` — a second call with the same session is a no-op | the promoted row |
| `graduate_full_roster(p_player_id, p_rules_version, p_gene_ids[])` | Grant the complete legal roster to a veteran | PK | rows written |
| `read_gene_eligibility(p_player_id, p_rules_version)` | Composition read at run start | pure read | the eligible set + the current trial |

**Only one trial at a time.** `select_gene_trial` demotes nothing: switching moves
the previous trial row back to *absent* only if it was never resolved and was never
`offer_eligible`. Switching costs nothing and loses nothing (§4.4). Concurrent calls
resolve by the row's `updated_at` under a single statement; the last writer wins and
the losing caller reads the winner's value back.

### 2.1 Guarantee counting

The guarantee is consumed by **collected offers that contained the trial**, not by
runs (§4.4). The natural idempotency key is therefore
`(player_id, rules_version, gene_id, session_id, offer_index)`, and `offer_index` is
already the authoritative offer cursor (`GenomeV2OfferState.offerIndex`,
`genomeV2.ts:384`). WP-B may either store the consumed keys in a small side table or
derive the count at settlement from the validated record — the second is preferred
because it needs no extra write path and cannot drift from the run.

Ascetic runs, Patient's stretched cadence, uncollected or expired relics, Free Play,
and runs that never produce a relic consume nothing, because none of them produces a
collected offer containing the trial.

## 3. Composition at run start

### 3.1 The replacement

`src/app/api/game/session/route.ts:1163` currently reads:

```ts
const genePool = genomeV2ActivePool(startDynasty);
```

WP-B replaces it with a pure function beside `genomeV2ActivePool`
(`src/shared/game/genes.ts:574`):

```ts
genomeV2PlayableVocabulary(dynasty, facts): GenomeV2ActiveGeneId[]
```

`facts` carries the eligibility rows, the selected trial, `bankedRuns`, and
`masteryLevel` — all already in scope at that line (`bankedRuns` and `prevRunDied`
destructured at `:1150`, `masteryLevel` at `:1090`).

**Hard invariant:** the result must satisfy
`result ⊆ genomeV2ActivePool(dynasty)`. `createGenomeV2State` already enforces the
ceiling (`genomeV2.ts:1066-1074` — a supplied pool may be a subset but never exceed
the catalog), and `strictV2GenePool` (`src/lib/game/genomeCapability.ts:166-174`)
rejects a malformed or duplicated pool by returning null, which routes the client
through the legacy engine path. Neither guard is weakened.

### 3.2 The stamp

`RunStartGenomeV2Context` (`src/lib/server/runContext.ts:110-120`) and the manifest
genome block (`route.ts:1167-1174`) both gain the same three fields:

```ts
eligibilityContractVersion: number;   // this document's contract, currently 1
learningEventVersion: number;         // the catalog's version, currently 1
eligibilityInputs: {
  eligibleGeneIds: GenomeV2ActiveGeneId[];  // sorted, from the satellite table
  trialGeneId: GenomeV2ActiveGeneId | null;
  bankedRuns: number;
  masteryLevel: number;
};
```

**Never trust a bare array.** The verification pattern is
`genomeV2FtueFromPresentation` (`genomeV2.ts:966-990`): the server re-derives the
presentation from its declared inputs and deep-compares, throwing if they disagree.
`genomeV2PlayableVocabulary` must be re-derivable from `eligibilityInputs` the same
way, and `strictV2GenePool` parses the new block strictly, rejecting anything it
cannot re-derive.

`RUN_CONTEXT_VERSION` (`runContext.ts:67`) increments. Parsing stays strict per its
own contract: a NULL column is a pre-migration run and falls back silently; a
malformed blob takes the same fallback and raises an `error`-level alert.

### 3.3 What does not change

**Replay, checkpoint, and settlement need zero changes.** All three already compare
against the stamped context rather than re-deriving. `runContext.ts:1-36` exists
precisely because settlement used to re-derive the gene pool and a transient read
failure could silently shrink a payout. **Vocabulary is never recomputed at
settlement.** A later eligibility change applies only to a later run (TGv2 §10).

## 4. Learning-event resolution

### 4.1 Why not a journal scan

The run journal compacts above 256 entries (`genomeV2.ts:1606-1618`) and resolved
targets above 96 (`:1620-1641`); the compacted entries survive only as a fold
digest. A settlement-time scan for "did event X happen" therefore returns false for
long runs in which the event happened early. Several durable facts are also
non-monotone within a run (`wallRushCharges` restored at `:2613`, `overclock`
cleared, `anchor.pinnedGeneId` cleared at `:2525-2527`, `ledger.mirrorStake` zeroed
at `:3218`).

### 4.2 The required shape

The reducer that emits a Gene's learning event also appends its ID to a **bounded
monotone field on the run state**:

```ts
/** Append-only; at most one entry per roster Gene; never cleared. */
learningEventsResolved: GenomeV2ActiveGeneId[];
```

At most 16 short strings — a few hundred bytes against the 384 KiB persistence bound
(`GENOME_V2_CONFIG.persistence.maximumSerializedBytes`). It is written by the pure
reducer, so it is identical under live play and under replay, and
`assertGenomeV2PersistenceBound` continues to hold.

Settlement reads that field from the **validated** record and calls
`resolve_learning_event` once per newly resolved Gene, gated by:

- the run is validated (not practice, not Free Play);
- the Gene is the account's current `trial`;
- at most **one** Gene completes eligibility per run (§4.4).

Success and failure both resolve (boundary 7). The per-Gene events, their producers,
and the two Genes that have no event today are in
`PLAYER_EVOLUTION_LEARNING_EVENTS.md`.

## 5. Trial guarantee inside the deterministic roll

The trial occupies one candidate position without breaking offer determinism. The
precedent already exists in the same function: `state.anchor.pinnedGeneId`
(`genomeV2.ts:3957-3958`) forces a specific gene into slot one when it is legal, and
the second slot still draws normally with the different-category rule applied.

WP-C extends `rollGenomeV2Offer` to read a **stamped** trial candidate from run
state, applied exactly like the anchor pin:

- the trial takes slot one only when it is in `legal`;
- slot two draws ordinarily, so one ordinary candidate always survives;
- DECLINE is untouched;
- the guarantee stops after three collected offers containing the trial, or on
  resolution;
- when the trial's action is unteachable in this run (§5 of the catalog), it is
  suppressed and the guarantee is **not** decremented.

`assertGenomeV2OfferMatchesRoll` (`genomeV2.ts:3987-4001`) must keep passing
server-side: since the trial comes from the immutable start stamp and not from a
request field, the server reproduces the same roll from the same state, and the
parity guard is unaffected.

**Signature lock deletion.** The `(state.ftue.apexesUnlocked || geneId !== signature)`
disjunct at `genomeV2.ts:3950-3951` is deleted in WP-B (owner ruling 1). The
`ensureActivePool` guard at `:1663-1667`, which throws when a signature is acquired
before Apex, is deleted with it — they are the same rule expressed twice. `tierCap`
in `startGenomeContext` (`route.ts:1181-1185`) is **not** touched: Apex *tier
activation* keeps its ramp.

## 6. Migration, backfill, and credit

Forward-only, idempotent, and never rewriting a historical run, payout, Codex fact,
or Splice discovery.

1. **Create** the table, policies, RPCs, and grants.
2. **Graduate veterans.** An account with `≥10` banked runs **or** Mastery `≥3` in
   any Dynasty receives the complete legal current roster with
   `source = 'graduation'`. Those are the existing Apex thresholds
   (`GENOME_V2_CONFIG.ftue.apexAtBankedRuns = 10`, `apexAtMastery = 3`), reused so
   the curriculum introduces no new progression number.
3. **Credit history.** For every other account, insert `source = 'migration_credit'`
   rows for each Gene with an authoritative use record. The floor is `player_codex`
   (`031_codex.sql:12-21`), whose `discovery_type IN ('gene','splice','expression','apex')`
   rows are the durable, already-indexed record of what a player actually used; a
   `splice` row credits **both** parents via `GENOME_V2_SPLICES[id].parents`. A scan
   of `game_sessions.genome` may add rows where feasible, but it is a best-effort
   improvement and never a precondition — the migration must complete without it.
4. **Seed starters.** Every account below the graduation threshold receives its
   Dynasty starter seven with `source = 'starter'`, unioned with its credit rows.
   The union is what makes step 3 safe: credit can only add.
5. **No re-onboarding.** An account with `total_games_played > 0` is never moved
   backward, never assigned a trial it has already resolved, and never counted in
   the new-account cohort for analytics (Constitution §11.5 cohort separation).

The migration is re-runnable: every insert is `ON CONFLICT … DO NOTHING` or a
monotone `DO UPDATE`.

## 7. Absent infrastructure and rollback

Two different failure modes, two different answers.

**Absent infrastructure** (table or RPC not yet applied — the app deploys before the
migration). The established pattern is `isMissingLadderInfra`
(`src/lib/server/ladderRecords.ts:71-83`), which recognises
`42P01/42703/PGRST202/PGRST204/PGRST205` and degrades quietly. The curriculum reader
does the same and returns "no curriculum state," which composes to the **legacy full
Dynasty pool** — current behaviour, never an empty or partial pool.

Note the deliberate contrast with `src/lib/server/genome.ts:64-83`: that function
*refuses* to degrade, because its `bankedRuns` read feeds `tierCap` and
`adjustedDna` and a swallowed error silently pays the player less. Curriculum
eligibility has no payout consequence, so quiet degradation to the full pool is safe
where a smaller FTUE tier would not be. Do not copy the wrong one.

**Flag off** (`NEXT_PUBLIC_PLAYER_EVOLUTION_V1` unset or `false`). New curriculum
assignment stops. Composition falls back to `genomeV2ActivePool(dynasty)`. Existing
eligibility rows are **not** deleted, existing runs stay readable, and their stamped
pools continue to settle exactly as stamped. Flag-off is a dual-version fallback,
not a data migration.

Malformed eligibility state fails closed to the same legacy full-pool behaviour and
raises an `error`-level alert. It never fails to an empty or client-selected pool.

## 8. Rollout

| Step | Change | Gate |
|---|---|---|
| 1 | Migration applied; flag off | Table exists; RLS verified; backfill row counts reconcile with `player_codex` |
| 2 | Flag on for a bounded new-account cohort | No account below the graduation threshold sees a starved run; offer-diversity telemetry matches the simulation |
| 3 | Flag on generally | §9.4 decision thresholds pass |

**Flag mechanics.** `NEXT_PUBLIC_PLAYER_EVOLUTION_V1` is added to
`config/production-public-surface.json`, taking the manifest from 22 flags to 23 and
changing the public-surface hash — which makes it a reviewed release by construction.
No separate edit to `scripts/production-env-validation.cjs` is needed: its
`REQUIRED_VARIABLES` list splices `...PRODUCTION_PUBLIC_FLAGS` (`:55`), which
`production-public-surface.cjs` builds from that same manifest, and every flag in it
is both required-present (`:90-102`) and asserted `=== 'true'` in production
(`:168-170`).

**E2E.** Four flag shapes must be exercised and none inferred from an omission:
curriculum on/off × Genome v2 on/off. A curriculum-off leg proves the legacy
full-pool path still works; a curriculum-on veteran leg proves no re-onboarding.

## 9. What this contract deliberately does not add

- No new currency, account level, tutorial XP, daily, or mode.
- No browser-persisted curriculum state of any kind. `verify:constitution`'s
  `local-progress` gate runs with `honourBaseline: false`, so any `localStorage`,
  `sessionStorage`, `indexedDB`, `caches`, or `document.cookie` use in this feature
  fails the build outright.
- No change to Score. `computeRunTotals` (`rulesets.ts:312`) and
  `computeGenomeRunTotals` (`:499`) are untouched; the curriculum never reaches
  either fold.
- No change to Yield, Energy, Lineage, Ascendance, or Clan Energy Battle settlement.
- No client-supplied eligibility. There is no request field through which any of it
  could arrive, exactly as `runContext.ts:24-36` requires of the run-start context.

## 10. Adjacent defects this contract touches

Found while surveying; both are folded into named packages rather than fixed here.

1. **Anonymous accounts can found and own clans.** `grep -rn "is_anonymous"` returns
   zero hits across `src/app/api/clan/` and all of `supabase/migrations/`. The
   `found` action (`src/app/api/clan/route.ts:618-670`) validates name, tag, banner,
   emblem, colours and DNA cost but never the account type, and `found_clan`
   (`062_competitive_clans.sql:797`) guards only a null user id. The pattern to copy
   is `src/app/api/checkout/route.ts:70-78`. → **Package E.**
2. **OAuth "upgrade" orphans anonymous accounts.** `AccountUpgrade.tsx:118-124`
   calls `signInWithOAuth`, which starts a fresh sign-in rather than linking the
   identity onto the existing anonymous user; `linkIdentity` has zero occurrences in
   `src/`. The email path (`:109`, `upgradeAnonymousToEmail`) is correct. Since the
   curriculum's very first Results action is `save-progress`, an upgrade path that
   loses the account is directly in this feature's way. → **Package E.**

Also observed, not owned by any package here: the comment at
`ClanFoundingPrompt.tsx:27-28` claims the prompt "lives on the two surfaces it is
about — the clan page and the Serpent battle," but only the `/clan` mount exists
(`src/app/clan/page.tsx:457`). Package E updates that comment when it records the
ruling.
