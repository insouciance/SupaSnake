-- ############################################################################
-- ##                                                                        ##
-- ##  MIGRATION 049 — NOT APPLIED TO ANY DATABASE BY THIS WORK PACKAGE.     ##
-- ##                                                                        ##
-- ##  WP-1.03 wrote and reviewed this file and deliberately did NOT run     ##
-- ##  `supabase db push`, `db reset`, `link` or `start`. It is committed    ##
-- ##  as the schema half of the change; applying it to staging and then     ##
-- ##  production is an owner decision, taken with the release runbook       ##
-- ##  (docs/ops/RELEASE_RUNBOOK.md) in hand.                                ##
-- ##                                                                        ##
-- ############################################################################
--
-- Migration 049: The World Signal — the daily ritual, and the retirement of
-- Contracts
--
-- Authority: docs/PRODUCT_CONSTITUTION.md §7.2 (the Signal), §7.1 (the cadence
-- stack — the day boundary is 00:00 UTC, globally), §8.6 (the harvest
-- envelope — "the day's Signal objective run consumes no Energy and always
-- harvests full"), §12.2 (the Signal is the ONE daily surface), §13 (the kill
-- list — Contracts are retired), Rule 5 (absence is never destructive), Rule 6
-- (earned things are permanent) and Rule 11 (server authority).
--
-- WHAT CHANGES
--
--   1. `signal_days` — one row per UTC day: the seed, the condition and the
--      three objectives the whole world plays under. The row is DERIVED FROM
--      THE CALENDAR by `src/shared/game/signal.ts` and written by
--      `ensure_signal_day`, which refuses to change a day that already
--      exists. Nothing a client sends reaches any column (Rule 11).
--
--   2. `signal_objective_runs` — at most ONE row per (day, player). That
--      UNIQUE constraint is §8.6's "the day's Signal objective run" written
--      into the schema: the exemption cannot be granted twice in a day
--      because there is nowhere to record a second grant.
--
--   3. `game_sessions.signal_objective_run_id` — the server-resolved id
--      WP-0.01's `ChargeExemptionFacts.signalObjectiveRunId` has been waiting
--      for. Stamped by `begin_signal_objective_run` itself, inside the same
--      transaction that claims the day's attempt, so the id a route reads is
--      the id the row carries. Until it is stamped, a client claiming
--      `mode: 'signal'` gets an ordinary charged run.
--
--   4. `signal_milestones` + `players.signals_completed` — the cumulative,
--      NON-CONSECUTIVE marks of §7.2 (30, 100, 365). The count is a
--      RECOMPUTE (`COUNT(*)` over completed attempts) clamped upward with
--      GREATEST; the marks are uniquely keyed per (player, milestone) and
--      inserted ON CONFLICT DO NOTHING.
--
--   5. `settle_signal_objective_run` — auto-settlement (§7.2: "Rewards settle
--      automatically — no claim cascades, ever"). There is no claim endpoint
--      in this migration and no function a player can call to collect
--      anything.
--
--   6. CONTRACTS CUTOVER. `offer_daily_contracts`, `pick_contracts`,
--      `claim_contract` and `refresh_contract_progress` are DROPPED. The
--      tables `contract_definitions` and `player_contracts` and every row in
--      them are KEPT, untouched (Rule 6 — a claimed contract is history a
--      player earned, and §13 retires the mechanism, not the record).
--
-- HOW IDEMPOTENCY IS GUARANTEED (an acceptance criterion, in the schema)
--
--   Auto-settlement is a recompute, run as often as anything cares to run it:
--
--     progress            lands through GREATEST — never `progress + x`;
--     completed_at        is a LATCH set with COALESCE — once set it is never
--                         rewritten, so a re-settle cannot move the moment a
--                         player completed their Signal;
--     the bonus           is paid by a COMPARE-AND-SET: the UPDATE carries
--                         `WHERE bonus_paid_at IS NULL` under the row lock,
--                         so the second caller updates zero rows and pays
--                         nothing. A currency grant cannot be a GREATEST, so
--                         it is a one-shot state transition instead;
--     signals_completed   is `COUNT(*)` over the player's completed attempts,
--                         clamped with GREATEST — never `+ 1`;
--     milestones          are uniquely keyed and ON CONFLICT DO NOTHING.
--
--   Run the settlement twice, ten times, or after a crash halfway through, and
--   the answer is the same. A `+=` anywhere in here would break that, which is
--   why the only `+` in this file is the single guarded DNA credit.
--
-- HOW ABSENCE STAYS NON-DESTRUCTIVE (Rule 5)
--
--   Nothing in this file expires, decays, resets or confiscates. There is no
--   consecutive-day column, no streak column and no reset statement: a missed
--   day simply has no `signal_objective_runs` row, and `signals_completed` is
--   a count with no memory of gaps (§7.2: milestones are explicitly
--   non-consecutive). Section 1 SNAPSHOTS every player-owned aggregate before
--   the DDL and section 11 RAISEs if a single one moved downward — the pattern
--   041, 042 and 046 set.
--
-- WHY MONEY CANNOT REACH IT (Rule 3)
--
--   The only inputs to a completion are the run's own settled facts, passed in
--   by the caller's exact recompute. No statement in this file reads an
--   entitlement, a subscription, a purchase, a cosmetic or a premium flag, and
--   the bonus is a caller-supplied amount the function CLAMPS to the
--   Constitution's flat 150 (§7.2) so a bad caller cannot inflate it.
--
-- DOWN-NOTE (forward-only)
--
--   This migration is forward-only. It is additive except for the four
--   contract functions it drops. To roll the FEATURE back, unset
--   `NEXT_PUBLIC_SIGNAL_V1` — the flag is the rollback path and it is tested.
--   To roll the SCHEMA back (only ever correct before any Signal has settled,
--   since a completed Signal is an earned thing and Rule 6 forbids destroying
--   it):
--
--     DROP FUNCTION IF EXISTS settle_signal_objective_run(UUID, UUID, BOOLEAN, BIGINT, INTEGER);
--     DROP FUNCTION IF EXISTS begin_signal_objective_run(UUID, UUID, TEXT, BIGINT, UUID);
--     DROP FUNCTION IF EXISTS ensure_signal_day(DATE, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, JSONB);
--     ALTER TABLE game_sessions DROP COLUMN IF EXISTS signal_objective_run_id;
--     DROP TABLE IF EXISTS signal_milestones;
--     DROP TABLE IF EXISTS signal_objective_runs;
--     DROP TABLE IF EXISTS signal_days;
--     ALTER TABLE players DROP COLUMN IF EXISTS signals_completed;
--
--   The dropped contract functions are NOT restored by that block, and must
--   not be: §13 retires them. Their bodies remain in git (migrations 032, 044)
--   if history ever has to be read.
--
--   After a Signal has settled, the correct rollback is the flag, not the DDL.

--
-- HOW CONCURRENT SETTLEMENTS ARE SERIALIZED (the fix, recorded)
--
--   `settle_signal_objective_run` takes TWO row locks, in this order:
--
--     1. `players` (the settling player), then
--     2. `signal_objective_runs` (the attempt being settled).
--
--   Lock 2 alone is what an earlier draft of this file had, and it is not
--   enough. It serializes two settlements of the SAME attempt, but the
--   player's cumulative `signals_completed` and the §7.2 marks are computed
--   from a COUNT over ALL of that player's attempts — so two settlements of
--   DIFFERENT attempts by the same player (the end-of-run settle of today's
--   Signal racing the cron's re-settle of an older one) each counted their own
--   completion and neither saw the other's uncommitted one. Both then wrote
--   the same number through GREATEST, the higher of the two was lost, and a
--   30/100/365 mark that the recount would have crossed was never inserted.
--   GREATEST cannot repair that: it never writes downward, but it also never
--   discovers the count it was never shown. A later completion happens to heal
--   it; a player whose last Signal that was keeps the wrong number forever,
--   which Rule 6 does not permit.
--
--   Locking the PLAYER row first makes every settlement that touches a
--   player's cumulative state run one after the other, so each COUNT is taken
--   against a snapshot that already includes every earlier settlement's
--   committed completion. The order is fixed (player, then attempt) in the one
--   function that takes both, so it cannot deadlock against itself.

BEGIN;

-- ===========================================================================
-- 1. SNAPSHOT — the Rule 6 tripwire (pattern: migrations 041, 042, 046)
-- ===========================================================================
--
-- Everything this migration could conceivably move is captured first. Section
-- 11 compares and aborts the whole transaction if a single value moved down or
-- a single row of contract history disappeared.

CREATE TEMP TABLE signal_pre_migration_players ON COMMIT DROP AS
SELECT
  id,
  COALESCE(dna, 0)               AS dna,
  COALESCE(total_dna_earned, 0)  AS total_dna_earned,
  COALESCE(legacy_score, 0)      AS legacy_score,
  COALESCE(high_score, 0)        AS high_score
FROM players;

CREATE TEMP TABLE signal_pre_migration_sessions ON COMMIT DROP AS
SELECT
  id,
  COALESCE(dna_earned, 0) AS dna_earned,
  COALESCE(score, 0)      AS score,
  ended_at,
  end_reason
FROM game_sessions;

-- Contract HISTORY, counted before anything is dropped. §13 retires the
-- mechanism; Rule 6 keeps the record. These two numbers must not move.
CREATE TEMP TABLE signal_pre_migration_contracts ON COMMIT DROP AS
SELECT
  (SELECT COUNT(*) FROM player_contracts)                              AS player_contract_rows,
  (SELECT COUNT(*) FROM player_contracts WHERE claimed_at IS NOT NULL) AS claimed_rows,
  (SELECT COUNT(*) FROM contract_definitions)                          AS definition_rows;

-- ===========================================================================
-- 2. signal_days — the day, derived from the UTC calendar
-- ===========================================================================

CREATE TABLE IF NOT EXISTS signal_days (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The UTC date the day opens on. The natural key: one Signal per day,
  -- worldwide, forever. §12.2 caps daily ritual surfaces at ONE, and this
  -- UNIQUE constraint is the cap written into the schema.
  day          DATE        NOT NULL UNIQUE,
  starts_at    TIMESTAMPTZ NOT NULL,
  -- Exclusive: the next 00:00 UTC. §7.1: "Day boundary: 00:00 UTC, globally".
  ends_at      TIMESTAMPTZ NOT NULL,
  -- Deterministic; FNV-1a over `signal:<day>` (src/shared/game/signal.ts).
  seed         TEXT        NOT NULL,
  -- The condition drawn from the curated pool, and the gene-pool tilt it
  -- implies. Both derived; neither authored per day (§12.1 slot 1).
  modifier     TEXT        NOT NULL,
  strain_tilt  TEXT        NOT NULL,
  -- The three objectives, exactly as derived: [{kind,id,target,...}, ...].
  -- Stored so the drift tripwire has something to compare against and so a
  -- settled day can be read back without re-deriving it.
  objectives   JSONB       NOT NULL DEFAULT '[]'::JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT signal_day_window CHECK (ends_at > starts_at),
  CONSTRAINT signal_day_seed_shape CHECK (char_length(seed) BETWEEN 2 AND 64)
);

CREATE INDEX IF NOT EXISTS idx_signal_days_window ON signal_days (day DESC);

-- ===========================================================================
-- 3. signal_objective_runs — the day's attempt, one per player
-- ===========================================================================
--
-- The UNIQUE (day_id, player_id) is load-bearing three times over:
--
--   * §8.6 exempts "the day's Signal objective run" — singular. One row per
--     day per player is the whole bound on the exemption.
--   * §7.2 pays a FIRST-completion bonus. One row means one `bonus_paid_at`,
--     so "first" needs no separate ledger.
--   * §12.2 caps daily surfaces at one. A second row per day would be a
--     second daily opportunity by another name.
--
-- Archive days are deliberately ABSENT from this table. Rule 5 keeps a past
-- day playable as practice, and practice pays nothing — so a practice run
-- opens no row, is granted no id, and therefore cannot be exempt, cannot
-- complete and cannot be paid. "Pays nothing" is structural here, not audited.

CREATE TABLE IF NOT EXISTS signal_objective_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id        UUID NOT NULL REFERENCES signal_days(id) ON DELETE CASCADE,
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- One of the day's three derived objectives. Validated against the derived
  -- list by the caller before it ever reaches this column.
  objective_id  TEXT   NOT NULL,
  target        BIGINT NOT NULL CHECK (target > 0),
  -- The run that owns the day's attempt. The session row carries the mirror
  -- of this in `signal_objective_run_id`.
  session_id    UUID REFERENCES game_sessions(id) ON DELETE SET NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The best measurement seen. GREATEST-only (Rule 6).
  progress      BIGINT NOT NULL DEFAULT 0 CHECK (progress >= 0),
  -- A LATCH. Set once, with COALESCE; never cleared, never rewritten.
  completed_at  TIMESTAMPTZ,
  settled_at    TIMESTAMPTZ,
  -- The compare-and-set guard on the flat first-completion bonus (§7.2).
  bonus_dna     INTEGER NOT NULL DEFAULT 0 CHECK (bonus_dna >= 0),
  bonus_paid_at TIMESTAMPTZ,

  CONSTRAINT signal_objective_run_one_per_day UNIQUE (day_id, player_id),
  -- A bonus without a completion is not a thing this schema can hold.
  CONSTRAINT signal_bonus_requires_completion
    CHECK (bonus_paid_at IS NULL OR completed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_signal_objective_runs_player
  ON signal_objective_runs (player_id, day_id);
CREATE INDEX IF NOT EXISTS idx_signal_objective_runs_session
  ON signal_objective_runs (session_id) WHERE session_id IS NOT NULL;
-- The settlement scan: every unsettled attempt, cheaply.
CREATE INDEX IF NOT EXISTS idx_signal_objective_runs_unsettled
  ON signal_objective_runs (day_id) WHERE settled_at IS NULL;

-- ===========================================================================
-- 4. Run flagging — game_sessions.signal_objective_run_id
-- ===========================================================================
--
-- The server-resolved id the charge exemption requires. A NULL here is an
-- ordinary run; a value means "this run IS the day's Signal objective run".
-- It is written by `begin_signal_objective_run` in the same transaction that
-- claims the attempt, so the two can never disagree, and a replayed `end`
-- cannot turn an ordinary run into a Signal run.

ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS signal_objective_run_id UUID
    REFERENCES signal_objective_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_game_sessions_signal_objective_run
  ON game_sessions (signal_objective_run_id)
  WHERE signal_objective_run_id IS NOT NULL;

-- ===========================================================================
-- 5. The cumulative, non-consecutive marks (§7.2)
-- ===========================================================================
--
-- "a '365 Signals' mark means devotion, and *never* requires them
-- consecutive". There is no consecutive-day column here, and no statement in
-- this file reads the date of the previous completion — a streak requirement
-- could not be added without new schema (Rule 5).

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS signals_completed INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS signal_milestones (
  player_id  UUID    NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- 30 / 100 / 365 (SIGNAL_MILESTONES). Kept open rather than CHECKed to a
  -- literal list so adding a fourth mark is a config change, not a migration.
  milestone  INTEGER NOT NULL CHECK (milestone > 0),
  day_id     UUID REFERENCES signal_days(id) ON DELETE SET NULL,
  reached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (player_id, milestone)
);

CREATE INDEX IF NOT EXISTS idx_signal_milestones_player
  ON signal_milestones (player_id, reached_at DESC);

-- ===========================================================================
-- 6. ensure_signal_day — the day is written once, from the calendar
-- ===========================================================================
--
-- The caller derives every field from the UTC calendar (`describeSignalDay`).
-- This function's job is to make that derivation a ROW, exactly once, and then
-- to defend it:
--
--   * ON CONFLICT DO NOTHING — the first writer wins, exactly as
--     `ensure_serpent_week` (migration 046) does one cadence up. Two players
--     starting a run at 00:00:00 UTC cannot produce two days or two seeds.
--
--     Why DO NOTHING and not a no-op DO UPDATE: an earlier draft of this file
--     used `ON CONFLICT (day) DO UPDATE SET day = signal_days.day` on the
--     stated grounds that "DO NOTHING does not wait for the conflicting
--     transaction". That premise is false. Any ON CONFLICT insert detects the
--     conflict through a DIRTY-snapshot index probe, and when the conflicting
--     tuple belongs to an in-flight transaction the probe takes the xact lock
--     and WAITS for it — for DO NOTHING and DO UPDATE alike. Once the winner
--     commits, the loser's next statement takes a fresh READ COMMITTED
--     snapshot and reads the winning row. The fallback SELECT below is that
--     read, and it cannot come up empty for the race it exists to handle.
--
--     What the no-op DO UPDATE cost instead was real: it turned the ONE row
--     per UTC day into a write on every resolve. Every run start and every
--     panel load, for the whole world, would have taken an exclusive row lock
--     on the same tuple and written a new version of it — a global
--     serialization point and steady bloat on the hottest read in the
--     feature — and it made a row this file calls immutable into a row the
--     file itself updates. Resolving the day is a READ once the day exists,
--     and only the first caller of the day writes.
--   * If a day already exists with a DIFFERENT seed, modifier or objective
--     set, the function RAISEs. That can only mean the derivation changed
--     under a live day, which would silently re-write the conditions players
--     are playing under and break "same conditions worldwide". Failing loudly
--     is the only honest answer (Rule 11).
--
-- The client never reaches this function: it is revoked from PUBLIC, anon and
-- authenticated, and the API route that calls it passes calendar values, not
-- request values.

CREATE OR REPLACE FUNCTION ensure_signal_day(
  p_day         DATE,
  p_starts_at   TIMESTAMPTZ,
  p_ends_at     TIMESTAMPTZ,
  p_seed        TEXT,
  p_modifier    TEXT,
  p_strain_tilt TEXT,
  p_objectives  JSONB
)
RETURNS TABLE (
  id          UUID,
  day         DATE,
  starts_at   TIMESTAMPTZ,
  ends_at     TIMESTAMPTZ,
  seed        TEXT,
  modifier    TEXT,
  strain_tilt TEXT,
  objectives  JSONB
)
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row signal_days%ROWTYPE;
BEGIN
  IF p_day IS NULL OR p_seed IS NULL OR p_starts_at IS NULL
     OR p_ends_at IS NULL OR p_modifier IS NULL THEN
    RAISE EXCEPTION 'ensure_signal_day requires a fully derived day';
  END IF;

  INSERT INTO signal_days (day, starts_at, ends_at, seed, modifier, strain_tilt, objectives)
  VALUES (
    p_day, p_starts_at, p_ends_at, p_seed, p_modifier,
    COALESCE(p_strain_tilt, ''), COALESCE(p_objectives, '[]'::JSONB)
  )
  -- The day is written ONCE and never rewritten. A caller that loses the
  -- 00:00 UTC race inserts nothing and RETURNING gives it no row.
  ON CONFLICT (day) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    -- Either the day already existed, or we just lost the boundary race. In
    -- both cases the winning row is committed and visible by now: the INSERT
    -- above waited on the in-flight inserter's xact lock before deciding it
    -- had a conflict, and this is a new statement, so READ COMMITTED gives it
    -- a fresh snapshot. Reading the STORED row (never EXCLUDED) is also
    -- exactly what the drift tripwire below has to compare the caller's
    -- derivation against.
    SELECT * INTO v_row FROM signal_days d WHERE d.day = p_day;
  END IF;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'ensure_signal_day could not resolve day %', p_day;
  END IF;

  -- Drift tripwire. A live day's conditions are never rewritten.
  IF v_row.seed IS DISTINCT FROM p_seed THEN
    RAISE EXCEPTION
      'Signal day % already exists with seed % (caller derived %) — the day derivation changed under a live day',
      p_day, v_row.seed, p_seed;
  END IF;
  IF v_row.modifier IS DISTINCT FROM p_modifier THEN
    RAISE EXCEPTION
      'Signal day % already exists with a different condition — the day derivation changed under a live day',
      p_day;
  END IF;
  IF v_row.objectives IS DISTINCT FROM COALESCE(p_objectives, '[]'::JSONB) THEN
    RAISE EXCEPTION
      'Signal day % already exists with a different objective set — the day derivation changed under a live day',
      p_day;
  END IF;

  RETURN QUERY
  SELECT v_row.id, v_row.day, v_row.starts_at, v_row.ends_at,
         v_row.seed, v_row.modifier, v_row.strain_tilt, v_row.objectives;
END;
$$ LANGUAGE plpgsql VOLATILE;

REVOKE ALL ON FUNCTION ensure_signal_day(DATE, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION ensure_signal_day(DATE, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION ensure_signal_day(DATE, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION ensure_signal_day(DATE, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, JSONB) TO service_role;

-- ===========================================================================
-- 7. begin_signal_objective_run — the day's one attempt, claimed once
-- ===========================================================================
--
-- Called AFTER the session row exists, so a failed insert can never claim a
-- player's Signal for a run that did not happen.
--
-- Returns the attempt and whether THIS session owns it. `owns_attempt` is what
-- the route turns into a charge exemption:
--
--   * first run of the day with an objective chosen -> the INSERT lands, the
--     session id is stamped both here and on `game_sessions`, `owns_attempt`
--     is true, the run consumes no charge (§8.6);
--   * every later run that day -> the INSERT conflicts, the existing row is
--     returned unchanged, `owns_attempt` is false, and the run is an ordinary
--     charged run.
--
-- A client cannot reach this function, cannot choose which session owns the
-- attempt (the caller passes the session it just created), and cannot pass an
-- objective the day did not derive (the caller resolves it first).

CREATE OR REPLACE FUNCTION begin_signal_objective_run(
  p_player_id    UUID,
  p_day_id       UUID,
  p_objective_id TEXT,
  p_target       BIGINT,
  p_session_id   UUID
)
RETURNS TABLE (
  id           UUID,
  day_id       UUID,
  objective_id TEXT,
  target       BIGINT,
  session_id   UUID,
  progress     BIGINT,
  completed_at TIMESTAMPTZ,
  owns_attempt BOOLEAN
)
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row signal_objective_runs%ROWTYPE;
BEGIN
  IF p_player_id IS NULL OR p_day_id IS NULL OR p_session_id IS NULL
     OR p_objective_id IS NULL OR COALESCE(p_target, 0) <= 0 THEN
    RAISE EXCEPTION 'begin_signal_objective_run requires a resolved day, objective and session';
  END IF;

  -- The session must belong to the player and must be OPEN. A finished run
  -- cannot retroactively become the day's Signal attempt.
  PERFORM 1 FROM game_sessions gs
  WHERE gs.id = p_session_id AND gs.player_id = p_player_id AND gs.ended_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'begin_signal_objective_run: session % is not an open run for this player', p_session_id;
  END IF;

  INSERT INTO signal_objective_runs (day_id, player_id, objective_id, target, session_id)
  VALUES (p_day_id, p_player_id, p_objective_id, p_target, p_session_id)
  -- DO NOTHING, for the same reason `ensure_signal_day` uses it. A
  -- double-tapped Launch races two sessions at the SAME (day, player): the
  -- loser's insert waits on the winner's xact lock, finds the conflict, and
  -- writes nothing. Nothing is overwritten — the objective and target the
  -- player first chose stand.
  ON CONFLICT (day_id, player_id) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    -- The attempt already existed, or we just lost the double-tap race. Either
    -- way the winner is committed and this fresh statement snapshot sees it.
    -- The row we read carries the FIRST session's id, so `owns_attempt` below
    -- is false for the loser and its run is an ordinary charged run.
    SELECT * INTO v_row FROM signal_objective_runs r
    WHERE r.day_id = p_day_id AND r.player_id = p_player_id;
  END IF;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'begin_signal_objective_run could not resolve the attempt for day %', p_day_id;
  END IF;

  -- Mirror the id onto the session ONLY when this session owns the attempt.
  -- A second run of the day gets no stamp, so it gets no exemption.
  IF v_row.session_id = p_session_id THEN
    UPDATE game_sessions gs
    SET signal_objective_run_id = v_row.id
    WHERE gs.id = p_session_id AND gs.player_id = p_player_id;
  END IF;

  RETURN QUERY
  SELECT v_row.id, v_row.day_id, v_row.objective_id, v_row.target,
         v_row.session_id, v_row.progress, v_row.completed_at,
         (v_row.session_id = p_session_id);
END;
$$ LANGUAGE plpgsql VOLATILE;

REVOKE ALL ON FUNCTION begin_signal_objective_run(UUID, UUID, TEXT, BIGINT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION begin_signal_objective_run(UUID, UUID, TEXT, BIGINT, UUID) FROM anon;
REVOKE ALL ON FUNCTION begin_signal_objective_run(UUID, UUID, TEXT, BIGINT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION begin_signal_objective_run(UUID, UUID, TEXT, BIGINT, UUID) TO service_role;

-- ===========================================================================
-- 8. settle_signal_objective_run — auto-settlement, atomic and idempotent
-- ===========================================================================
--
-- §7.2: "Rewards settle automatically — no claim *cascades*, ever." There is
-- no claim endpoint anywhere in this work package; this function is called by
-- the server at the end of the run and by the daily cron, and a player has no
-- way to invoke it.
--
-- Input: the caller's EXACT RECOMPUTE of the run against the day's objective
-- (`src/shared/game/signal.ts`, re-applying every eligibility predicate the
-- query already applied — WP-0.05's two-gate shape).
--
-- WHAT IT CANNOT DO: it cannot pay more than the Constitution's flat bonus
-- (the amount is CLAMPED below, so a wrong caller under-pays at worst), it
-- cannot pay twice (the compare-and-set), it cannot pay a run that did not
-- complete (`p_completed` false pays nothing and the CHECK constraint forbids
-- the state anyway), and it cannot write a cosmetic, an entitlement, a
-- subscription or a charge — no such statement exists below.

CREATE OR REPLACE FUNCTION settle_signal_objective_run(
  p_run_id     UUID,
  p_player_id  UUID,
  p_completed  BOOLEAN,
  p_progress   BIGINT,
  p_bonus_dna  INTEGER
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- §7.2's flat first-completion bonus. The ceiling, not a parameter: a
  -- caller may ask for less (or nothing), never for more.
  c_max_bonus  CONSTANT INTEGER := 150;
  v_run        signal_objective_runs%ROWTYPE;
  v_bonus      INTEGER := 0;
  v_paid       INTEGER := 0;
  v_new_dna    INTEGER;
  v_completed  INTEGER;
  v_milestones INTEGER := 0;
  v_player_id  UUID;
BEGIN
  -- ---- LOCK 1: the player ----------------------------------------------
  --
  -- Taken FIRST, and taken even though nothing is read from it yet, because
  -- §8c recomputes `signals_completed` as a COUNT over ALL of this player's
  -- attempts and §8d derives the §7.2 marks from that count. Without this
  -- lock, two settlements of DIFFERENT attempts by the SAME player run
  -- concurrently, each counts its own uncommitted completion and not the
  -- other's, and the lower of the two identical answers wins through
  -- GREATEST — losing a completion from the cumulative count and, with it, a
  -- mark the recount would have crossed. Serializing here means every COUNT
  -- below is taken after every earlier settlement of this player committed.
  --
  -- The lock ORDER (player, then attempt) is fixed and this is the only
  -- function that takes both, so it cannot deadlock against itself.
  SELECT pl.id INTO v_player_id FROM players pl WHERE pl.id = p_player_id FOR UPDATE;
  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'settle_signal_objective_run: unknown player %', p_player_id;
  END IF;

  -- ---- LOCK 2: the attempt ---------------------------------------------
  --
  -- Serialize concurrent settlements of the SAME attempt. Two settlers then
  -- run one after the other, and because everything below is a recompute or a
  -- compare-and-set, the second produces the same answer and pays nothing.
  SELECT * INTO v_run FROM signal_objective_runs r
  WHERE r.id = p_run_id AND r.player_id = p_player_id
  FOR UPDATE;

  IF v_run.id IS NULL THEN
    RAISE EXCEPTION 'settle_signal_objective_run: unknown attempt % for this player', p_run_id;
  END IF;

  -- ---- 8a. Progress and the completion latch --------------------------
  --
  -- GREATEST on progress, COALESCE on the latch. Neither can move a stored
  -- value downward or rewrite a completion that already happened (Rule 6).
  UPDATE signal_objective_runs r
  SET progress     = GREATEST(r.progress, GREATEST(COALESCE(p_progress, 0), 0)),
      completed_at = COALESCE(
                       r.completed_at,
                       CASE WHEN COALESCE(p_completed, FALSE) THEN NOW() ELSE NULL END
                     ),
      settled_at   = NOW()
  WHERE r.id = p_run_id AND r.player_id = p_player_id
  RETURNING * INTO v_run;

  -- ---- 8b. The flat first-completion bonus, paid at most once ----------
  --
  -- A currency grant cannot be expressed as a GREATEST, so idempotency comes
  -- from a compare-and-set instead: the WHERE clause names `bonus_paid_at IS
  -- NULL`, and the row is already locked. A second settlement updates zero
  -- rows, so `v_paid` stays 0 and no DNA moves.
  IF v_run.completed_at IS NOT NULL THEN
    v_bonus := LEAST(GREATEST(COALESCE(p_bonus_dna, 0), 0), c_max_bonus);

    IF v_bonus > 0 THEN
      UPDATE signal_objective_runs r
      SET bonus_dna     = v_bonus,
          bonus_paid_at = NOW()
      WHERE r.id = p_run_id AND r.player_id = p_player_id AND r.bonus_paid_at IS NULL;
      GET DIAGNOSTICS v_paid = ROW_COUNT;
    END IF;

    IF v_paid > 0 THEN
      UPDATE players pl
      SET dna              = pl.dna + v_bonus,
          total_dna_earned = COALESCE(pl.total_dna_earned, 0) + v_bonus
      WHERE pl.id = p_player_id
      RETURNING pl.dna INTO v_new_dna;

      INSERT INTO economy_transactions
        (player_id, resource_type, amount, balance_after, source_type, source_id, metadata)
      VALUES (
        p_player_id, 'dna', v_bonus, COALESCE(v_new_dna, 0), 'signal_bonus', p_run_id,
        jsonb_build_object(
          'signal_day_id', v_run.day_id,
          'objective_id', v_run.objective_id,
          'target', v_run.target,
          'progress', v_run.progress
        )
      );
    END IF;
  END IF;

  -- ---- 8c. The cumulative count — a recompute, clamped upward ----------
  --
  -- COUNT(*) over the player's completed attempts, NOT `signals_completed +
  -- 1`. That is the whole idempotency argument, and it is also what makes the
  -- count non-consecutive by construction: it never looks at WHEN.
  SELECT COUNT(*)::INTEGER INTO v_completed
  FROM signal_objective_runs r
  WHERE r.player_id = p_player_id AND r.completed_at IS NOT NULL;

  UPDATE players pl
  SET signals_completed = GREATEST(COALESCE(pl.signals_completed, 0), v_completed)
  WHERE pl.id = p_player_id;

  -- ---- 8d. The marks — uniquely keyed, inserted once -------------------
  --
  -- Cosmetic marks (§7.2). They pay no currency: this INSERT is the entire
  -- reward, and there is no join from `signal_milestones` to anything that
  -- grants.
  WITH reached AS (
    SELECT m.milestone
    FROM (VALUES (30), (100), (365)) AS m(milestone)
    WHERE v_completed >= m.milestone
  ),
  marked AS (
    INSERT INTO signal_milestones (player_id, milestone, day_id)
    SELECT p_player_id, milestone, v_run.day_id FROM reached
    ON CONFLICT (player_id, milestone) DO NOTHING
    RETURNING milestone
  )
  SELECT COUNT(*)::INTEGER INTO v_milestones FROM marked;

  RETURN jsonb_build_object(
    'run_id', p_run_id,
    'completed', v_run.completed_at IS NOT NULL,
    'progress', v_run.progress,
    'target', v_run.target,
    'bonus_dna', CASE WHEN v_paid > 0 THEN v_bonus ELSE 0 END,
    'bonus_already_paid', v_run.bonus_paid_at IS NOT NULL AND v_paid = 0,
    'signals_completed', v_completed,
    'new_milestones', v_milestones
  );
END;
$$ LANGUAGE plpgsql VOLATILE;

REVOKE ALL ON FUNCTION settle_signal_objective_run(UUID, UUID, BOOLEAN, BIGINT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION settle_signal_objective_run(UUID, UUID, BOOLEAN, BIGINT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION settle_signal_objective_run(UUID, UUID, BOOLEAN, BIGINT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION settle_signal_objective_run(UUID, UUID, BOOLEAN, BIGINT, INTEGER) TO service_role;

-- The audit trail needs a name for what the Signal pays. Carried forward from
-- migration 047's list with `signal_bonus` added; nothing is removed.
ALTER TABLE economy_transactions DROP CONSTRAINT IF EXISTS economy_transactions_source_type_check;
ALTER TABLE economy_transactions ADD CONSTRAINT economy_transactions_source_type_check CHECK (source_type IN (
  'game_reward',
  'breeding_cost',
  'purchase',
  'daily_reward',
  'game_start',
  'energy_regen',
  'admin_grant',
  'refund',
  'achievement_reward',
  'streak_bonus',
  'battle_pass_reward',
  'offline_claim',
  'unlock_cost',
  'clan_tithe',
  'premium_stipend',
  'lineage_reroll',
  'codex_discovery',
  'reroll_token_conversion',
  'signal_bonus'
));

-- ===========================================================================
-- 9. Row-level security — the Signal's tables are server-mediated
-- ===========================================================================
--
-- RLS on, and no policy for anon or authenticated. Every read a player makes
-- goes through `GET /api/signal`, which runs on the service role. The day is
-- public information, but "public" means "rendered by a surface", not
-- "selectable by anyone with an anon key" — and an anon client that could
-- SELECT `signal_days` could read TOMORROW's conditions, which would break the
-- share property §7.2 depends on.

ALTER TABLE signal_days           ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_objective_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_milestones     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON signal_days           FROM anon, authenticated;
REVOKE ALL ON signal_objective_runs FROM anon, authenticated;
REVOKE ALL ON signal_milestones     FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON signal_days           TO service_role;
GRANT SELECT, INSERT, UPDATE ON signal_objective_runs TO service_role;
GRANT SELECT, INSERT         ON signal_milestones     TO service_role;

-- ===========================================================================
-- 10. CONTRACTS CUTOVER — the mechanism is retired, the history is kept
-- ===========================================================================
--
-- §7.2: "The Signal **replaces Contracts** (two-of-three picks, premium third
-- slot, claim ceremony — all retired, §13)." §12.2 permits ONE daily surface,
-- so the two cannot coexist for a single deploy.
--
-- The four functions go. They are the only way a contract could be offered,
-- picked, progressed or claimed, and `src/app/api/contracts` is deleted in the
-- same commit — so after this migration there is no route to call and no
-- function to call from it. `signal.migration.test.ts` and
-- `contractsCutover.test.ts` both pin that.
--
-- The TABLES stay, with every row (Rule 6, and §13 retires mechanisms rather
-- than records):
--
--   * `player_contracts` holds what players picked, completed and CLAIMED.
--     A claimed contract paid real DNA; deleting the row would erase the
--     receipt for a grant that is still in `economy_transactions`.
--   * `contract_definitions` is what those rows point at. Dropping it would
--     turn the history into orphaned ids. (WP-0.03 already deleted the six
--     definitions no player row referenced; the rest are load-bearing.)
--
-- Section 11 aborts this migration if a single row of either disappeared.

DROP FUNCTION IF EXISTS offer_daily_contracts(UUID);
DROP FUNCTION IF EXISTS pick_contracts(UUID, TEXT[]);
DROP FUNCTION IF EXISTS claim_contract(UUID, TEXT);
DROP FUNCTION IF EXISTS refresh_contract_progress(UUID, DATE);

-- ===========================================================================
-- 11. THE TRIPWIRE — abort if anything a player owns moved (Rule 6)
-- ===========================================================================
--
-- Everything above is additive except four dropped functions, so the expected
-- count is zero on every check. If it is not, something had a side effect
-- nobody intended, and the correct outcome is that production never sees it.

DO $$
DECLARE
  v_bad INT;
  v_pre RECORD;
  v_now BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_bad
  FROM signal_pre_migration_players pre
  JOIN players now_p ON now_p.id = pre.id
  WHERE COALESCE(now_p.dna, 0)              < pre.dna
     OR COALESCE(now_p.total_dna_earned, 0) < pre.total_dna_earned
     OR COALESCE(now_p.legacy_score, 0)     < pre.legacy_score
     OR COALESCE(now_p.high_score, 0)       < pre.high_score;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Migration 049 aborted: % player rows moved downward (Rule 6)', v_bad;
  END IF;

  SELECT COUNT(*) INTO v_bad
  FROM signal_pre_migration_players pre
  LEFT JOIN players now_p ON now_p.id = pre.id
  WHERE now_p.id IS NULL;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Migration 049 aborted: % player rows disappeared (Rule 6)', v_bad;
  END IF;

  SELECT COUNT(*) INTO v_bad
  FROM signal_pre_migration_sessions pre
  LEFT JOIN game_sessions now_s ON now_s.id = pre.id
  WHERE now_s.id IS NULL
     OR COALESCE(now_s.dna_earned, 0) < pre.dna_earned
     OR COALESCE(now_s.score, 0)      < pre.score
     OR now_s.ended_at   IS DISTINCT FROM pre.ended_at
     OR now_s.end_reason IS DISTINCT FROM pre.end_reason;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Migration 049 aborted: % session rows changed (Rule 6)', v_bad;
  END IF;

  -- Contract history: the cutover retires the mechanism and keeps the record.
  SELECT * INTO v_pre FROM signal_pre_migration_contracts;

  SELECT COUNT(*) INTO v_now FROM player_contracts;
  IF v_now <> v_pre.player_contract_rows THEN
    RAISE EXCEPTION
      'Migration 049 aborted: player_contracts went from % to % rows — contract history was destroyed (Rule 6)',
      v_pre.player_contract_rows, v_now;
  END IF;

  SELECT COUNT(*) INTO v_now FROM player_contracts WHERE claimed_at IS NOT NULL;
  IF v_now <> v_pre.claimed_rows THEN
    RAISE EXCEPTION
      'Migration 049 aborted: claimed contracts went from % to % — a settled claim was erased (Rule 6)',
      v_pre.claimed_rows, v_now;
  END IF;

  SELECT COUNT(*) INTO v_now FROM contract_definitions;
  IF v_now <> v_pre.definition_rows THEN
    RAISE EXCEPTION
      'Migration 049 aborted: contract_definitions went from % to % rows — history would be orphaned (Rule 6)',
      v_pre.definition_rows, v_now;
  END IF;

  -- The cutover is only real if nothing can offer, pick, progress or claim a
  -- contract afterwards. Assert the functions are gone rather than trusting
  -- the DROPs above to have matched the right signatures.
  SELECT COUNT(*) INTO v_bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'offer_daily_contracts', 'pick_contracts', 'claim_contract',
      'refresh_contract_progress'
    );
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'Migration 049 aborted: % contract function(s) survived the cutover — the daily-surface cap (§12.2) would be breached',
      v_bad;
  END IF;

  RAISE NOTICE 'Migration 049: World Signal schema added, contracts retired; no player-owned value moved.';
END;
$$;

COMMIT;
