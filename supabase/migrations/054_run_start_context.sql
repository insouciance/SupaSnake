-- ############################################################################
-- ##                                                                        ##
-- ##  MIGRATION 054 — NOT APPLIED TO ANY DATABASE BY THIS WORK PACKAGE.     ##
-- ##                                                                        ##
-- ##  WP-2.05 wrote and reviewed this file and deliberately did NOT run     ##
-- ##  `supabase db push`, `db reset`, `link` or `start`. It is committed    ##
-- ##  as the schema half of the change; applying it to staging and then     ##
-- ##  production is an owner decision, taken with the release runbook       ##
-- ##  (docs/ops/RELEASE_RUNBOOK.md) in hand.                                ##
-- ##                                                                        ##
-- ##  RELEASE ORDER: deploy the app -> apply 054 -> apply 055. The app is   ##
-- ##  deployable before this migration: the session route's insert steps    ##
-- ##  down a retry ladder when `run_context` is missing, and settlement     ##
-- ##  falls back to re-deriving exactly as it does today when the column    ##
-- ##  is absent or NULL.                                                    ##
-- ##                                                                        ##
-- ############################################################################
--
-- Migration 054: the run-start context, and what `validated` actually means
--
-- Authority: docs/PRODUCT_CONSTITUTION.md Rule 6 (what a player earned is
-- permanent), Rule 11 (server authority) and the owner ruling of 2026-07-26
-- recorded in docs/ops/PLAYTEST_WAVE.md — "in no way can that score be taken
-- away". Work package: WP-2.05, Player Truth.
--
-- WHAT CHANGES
--
--   1. `game_sessions.run_context JSONB` — the server-derived rules a run
--      STARTED under, written once at start and read at settlement.
--
--      Settlement used to RE-DERIVE all of it: the snake's traits and
--      generation, the mutation pool, the gene pool, the heirloom strain
--      points, the lineage offer bias, the FTUE tier cap, the splice gate and
--      the Gauntlet strain suppression. Six or seven separate reads, each one
--      a fresh chance to answer differently from what the run was played
--      under — and, because `validation.adjustedDna` is computed from
--      `heirloom` and `tierCap`, each one a chance to PAY LESS. A transient
--      database error took money off a finished run.
--
--      Three properties follow from storing it instead:
--
--        a. a read failure at settlement can no longer change what a run
--           pays, because settlement no longer performs those reads;
--        b. `verifyOfferTrace` replays the seeded offer stream against the
--           pool, bias and cap the engine actually drew from, retiring a
--           class of false `OFFER_SEED_MISMATCH`;
--        c. re-equipping, breeding or a mastery level-up mid-run can no
--           longer re-decide how a run already in flight settles.
--
--      The blob is SERVER-DERIVED. No field of POST /api/game/session can
--      reach it; the client cannot propose, amend or read it back.
--
--      The run's WORLD CONDITION is deliberately NOT in it.
--      `resolveSessionWorldCondition` (WP-2.10a) re-derives that from the
--      session row's own `anomaly_id` / `serpent_week_id` /
--      `signal_objective_run_id` stamps, which is authoritative. Two stored
--      sources for one fact is how they come to disagree.
--
--      NULL is a legitimate, permanent state: every row that already exists,
--      and every run started before the app deploy that writes it. The
--      settlement path treats NULL as "re-derive", which is today's
--      behaviour, so no backfill of this column is possible or wanted.
--
--   2. `COMMENT ON COLUMN game_sessions.validated` — the semantics of the
--      flag, written where the next author composing a
--      `WHERE gs.validated IS TRUE` predicate will actually find it.
--
--      This migration does NOT add an `eligible` column, and the reason is
--      worth recording. There are 53 `validated IS TRUE` predicates across 12
--      migration files, most of them inside live SECURITY DEFINER RPCs that
--      would each need re-declaring in one forward-only migration against
--      daily-only backups. A half-migrated state there is worse than either
--      end state. The severity distinction is therefore made in TypeScript,
--      at the single site that stamps the column
--      (`src/lib/server/gameValidator.ts`), and this comment is how SQL
--      readers learn what the stamp now means.
--
-- WHAT DOES NOT CHANGE
--
--   No row's `validated`, `score`, `dna_earned`, `yield_dna`,
--   `duration_seconds`, `ended_at` or `end_reason` is touched here. This
--   migration adds one nullable column and one comment. The re-stamping of
--   historical rows is migration 055, in a separate file, so that an abort
--   there leaves this one applied and harmless.
--
-- DELIBERATELY ABSENT: THE 045 LIFECYCLE ASSERTION
--
--   Migration 045 documents the pair (`ended_at IS NULL`,
--   `end_reason = 'completed'`) as the marker for "this run settled and an
--   outbox replay still owes the player DNA". WP-2.05 makes the session route
--   write that marker on EVERY settlement-blocking read failure, so the two
--   columns are now legitimately out of step far more often than they were.
--   No constraint, trigger or assertion here may claim otherwise: that pair
--   is what buys the row the 8-day pending-settlement window instead of the
--   3-hour open one, and it is the mechanism that stops expiry destroying a
--   payout the player earned (Rule 6).
--
-- DOWN-NOTE (forward-only): to reverse, run
--   `ALTER TABLE game_sessions DROP COLUMN IF EXISTS run_context;`
--   The app tolerates the column's absence by design (the retry ladder), so
--   a rollback needs no coordinated redeploy.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The run-start context
-- ---------------------------------------------------------------------------

ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS run_context JSONB;

COMMENT ON COLUMN game_sessions.run_context IS
  'WP-2.05. The SERVER-DERIVED rules this run started under, written once at '
  'session start and read back at settlement instead of re-deriving them: '
  '{ v, snake: { id, generation, traits }, mutationPool, freePlay, '
  'genome: { genePool, heirloom, lineage, tierCap, suppressedStrains, '
  'splicesUnlocked, prevRunDied, crownAllowed } | null }. '
  'Never client-supplied and never client-readable. NULL means "started '
  'before this existed" and settlement re-derives, which is the pre-WP-2.05 '
  'behaviour. The run world condition is NOT here: it is re-derived from '
  'anomaly_id / serpent_week_id / signal_objective_run_id (WP-2.10a).';

-- Settlement reads this by primary key on a row it has already loaded, so no
-- index is needed for the read path. A partial index supports the operational
-- question the column exists to answer ("which settled runs carry a stored
-- context?") without paying for the majority of rows, which have none.
CREATE INDEX IF NOT EXISTS idx_game_sessions_run_context_present
  ON game_sessions (player_id, ended_at)
  WHERE run_context IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. What `validated` means, stated where SQL authors will read it
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN game_sessions.validated IS
  'WP-2.05 REDEFINED THIS FLAG. It now means: the server could BOUND this '
  'run''s physics within the session it observed. It does NOT mean "the '
  'claim matched the recompute" and it never means "the payout was trusted" '
  '- the payout is ALWAYS the server recompute, whatever this column says. '
  'FALSE is set by exactly two validator codes: INVALID_DURATION (the '
  'client-vs-server elapsed bound, from which the food-rate bound is derived) '
  'and SPLICE_CLAIMED_DIRECTLY (forgery - splices are derived by fusePicks '
  'and can never be claimed). Every other finding - DNA_MISMATCH, '
  'SCORE_MISMATCH, every clamp, TRAIT_CONFLICT, OFFER_SEED_MISMATCH, every '
  'bound repair - is ADVISORY: the run is repaired, paid, counted and '
  'reported to Sentry, and it keeps this flag TRUE. '
  'The authoritative table is VALIDATION_CODE_SEVERITY in '
  'src/lib/server/gameValidator.ts, pinned by a source scan. '
  'BEFORE ADDING ANOTHER `validated IS TRUE` PREDICATE: this flag is an '
  'anti-cheat physics bound, not a quality score. Gating a reward, a board or '
  'a count on it excludes runs whose only sin was a rounding difference '
  'against the server''s own arithmetic - which is precisely the defect '
  'WP-2.05 and migration 055 exist to repair.';

COMMIT;
