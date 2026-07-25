-- ############################################################################
-- ##                                                                        ##
-- ##  MIGRATION 045 — NOT APPLIED TO ANY DATABASE BY THIS WORK PACKAGE.     ##
-- ##                                                                        ##
-- ##  WP-0.06 wrote and reviewed this file and deliberately did NOT run     ##
-- ##  `supabase db push`, `db reset`, `link` or `start`. It is committed    ##
-- ##  as the schema half of the change; applying it to staging and then     ##
-- ##  production is an owner decision, taken with the release runbook       ##
-- ##  (docs/ops/RELEASE_RUNBOOK.md) in hand.                                ##
-- ##                                                                        ##
-- ############################################################################
--
-- Migration 045: Session lifecycle & cohorts
--
-- Authority: docs/PRODUCT_CONSTITUTION.md Rule 2 (nothing about the account
-- reaches the score fold), Rule 6 (what a player earned is permanent) and
-- Rule 11 (server authority). Defects: docs/GROUND_TRUTH.md §9.6 (no stale
-- session lifecycle exists; ~30% of session rows are open forever) and §13
-- (415 player rows, 15 with a completed run — the rest is developer, QA and
-- fixture noise, with no cohort separation).
--
-- WHAT CHANGES
--
--   1. `game_sessions.end_reason` — how a session stopped being open. Four
--      values, each with exactly one writer:
--
--        'completed'    the settlement path in POST /api/game/session
--                       ('end'). The ONLY reason that can be attached to a
--                       run that paid out.
--        'abandoned'    the start-path sweep: the player began a new run
--                       while an older run of theirs had been open past the
--                       stale window. Server-observed; never client-claimed.
--        'disconnected' POST /api/game/session ('abandon') — the client
--                       forfeiting a run it can no longer finish. This path
--                       can only close a session for ZERO; it has no branch
--                       that grants anything.
--        'expired'      `expire_stale_game_sessions()`, run by the daily
--                       cron. Awards nothing, by construction: the function
--                       body writes two columns on `game_sessions` and
--                       touches no other table.
--
--      Legacy ended rows are backfilled to 'completed' — they settled through
--      the only end path that ever existed. This is an additive fill of a
--      column that did not exist a statement ago, not a rewrite of history.
--
--   2. `players.cohort` — 'player' (the default, and the only cohort any
--      public surface renders), plus 'dev', 'qa' and 'fixture'. This is a
--      READ-SIDE label. Rule 6: flagging an account never deletes it, never
--      lowers a balance, never removes a record and never revokes anything it
--      owns. The account keeps every run, every reward and every private
--      surface; strangers simply stop being shown it.
--
--      NOTHING IS FLAGGED BY THIS MIGRATION. There is no signal in the schema
--      that separates a developer's account from a real player's, and a
--      heuristic that guessed wrong would hide a genuine player from the
--      boards. Flagging is an explicit owner action (see OWNER PROCEDURE).
--
--   3. `expire_stale_game_sessions(integer, integer)` — the expiry sweep.
--
--   4. `get_anomaly_board(uuid)` is re-created so the weekly Anomaly board
--      obeys the same two exclusions the main boards now obey: no expired /
--      abandoned / disconnected run ranks, and no flagged cohort appears.
--      The body is migration 021's, with those two predicates added.
--
-- WHAT IS DELIBERATELY *NOT* DONE HERE
--
--   No run is deleted, no score is lowered, no `dna_earned`, `yield_dna`,
--   `validated` or `score` value is touched anywhere in this file. Expiring a
--   session writes `ended_at` and `end_reason` and nothing else — an expired
--   run therefore cannot become a payout, a Yield, or a record, because the
--   sweep has no statement that could make it one. `players.high_score` is not
--   read or written here (its poisoning is fixed on the write side, in the
--   route, by gating on `validation.valid`).
--
-- DOWN-NOTE (forward-only; not reversible in place)
--
--   Rolling back the CODE is safe and needs no schema change: the columns are
--   additive and every reader tolerates their absence, so the previous release
--   runs unchanged against this schema.
--
--   Rolling back the SCHEMA would be:
--     ALTER TABLE game_sessions DROP COLUMN end_reason;
--     ALTER TABLE players DROP COLUMN cohort;
--     DROP FUNCTION expire_stale_game_sessions(INTEGER, INTEGER);
--     -- and re-create get_anomaly_board from migration 021.
--   That destroys the cohort labels and the recorded end reasons. Do not do it
--   to fix a code bug; roll the code back instead.

-- ---------------------------------------------------------------------------
-- 0. Pre-write snapshot (WP-0.02 / WP-0.04 pattern)
--
--    Everything a player owns that could conceivably move, captured before any
--    statement runs. Section 6 asserts none of it moved downward and aborts the
--    transaction if it did.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE wp_0_06_player_pre ON COMMIT DROP AS
SELECT
  p.id            AS player_id,
  p.dna           AS dna_before,
  p.high_score    AS high_score_before,
  p.total_dna_earned AS total_dna_earned_before,
  p.total_games_played AS total_games_played_before
FROM players p;

CREATE TEMP TABLE wp_0_06_session_pre ON COMMIT DROP AS
SELECT
  gs.id           AS session_id,
  gs.score        AS score_before,
  gs.dna_earned   AS dna_earned_before,
  gs.validated    AS validated_before,
  gs.ended_at     AS ended_at_before
FROM game_sessions gs;

CREATE TEMP TABLE wp_0_06_counts_pre ON COMMIT DROP AS
SELECT
  (SELECT COUNT(*) FROM players)::BIGINT       AS players_before,
  (SELECT COUNT(*) FROM game_sessions)::BIGINT AS sessions_before;

-- ---------------------------------------------------------------------------
-- 1. game_sessions.end_reason
-- ---------------------------------------------------------------------------

ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS end_reason TEXT;

ALTER TABLE game_sessions
  DROP CONSTRAINT IF EXISTS game_sessions_end_reason_valid;
ALTER TABLE game_sessions
  ADD CONSTRAINT game_sessions_end_reason_valid
  CHECK (
    end_reason IS NULL
    OR end_reason IN ('completed', 'abandoned', 'disconnected', 'expired')
  );

COMMENT ON COLUMN game_sessions.end_reason IS
  'How the session stopped being open: completed (settled by the end path — '
  'the only reason a payout can carry), abandoned (superseded by a newer run '
  'from the same player), disconnected (client forfeit), expired (stale sweep). '
  'NULL means the session is still open, or was ended by the pre-045 code path.';

-- Legacy ended rows settled through the only end path that existed.
UPDATE game_sessions
SET end_reason = 'completed'
WHERE ended_at IS NOT NULL
  AND end_reason IS NULL;

-- The sweep's working set: open sessions, oldest first.
CREATE INDEX IF NOT EXISTS idx_game_sessions_open_started
  ON game_sessions(started_at)
  WHERE ended_at IS NULL;

-- Board eligibility now reads end_reason on every scan.
CREATE INDEX IF NOT EXISTS idx_game_sessions_end_reason
  ON game_sessions(end_reason)
  WHERE ended_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. players.cohort
-- ---------------------------------------------------------------------------

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS cohort TEXT NOT NULL DEFAULT 'player';

ALTER TABLE players
  DROP CONSTRAINT IF EXISTS players_cohort_valid;
ALTER TABLE players
  ADD CONSTRAINT players_cohort_valid
  CHECK (cohort IN ('player', 'dev', 'qa', 'fixture'));

COMMENT ON COLUMN players.cohort IS
  'Read-side audience label (GT §13). Only ''player'' is rendered on public '
  'surfaces — boards, public counts, public profiles, the Anomaly board. '
  '''dev'', ''qa'' and ''fixture'' accounts keep every run, reward, record and '
  'private surface (Rule 6); they are simply not shown to strangers.';

-- Only the flagged minority is ever scanned, so the partial index is the whole
-- working set.
CREATE INDEX IF NOT EXISTS idx_players_cohort_excluded
  ON players(id)
  WHERE cohort <> 'player';

-- OWNER PROCEDURE — flagging and unflagging (both are single statements, and
-- both are reversible; neither touches anything the account owns):
--
--   UPDATE players SET cohort = 'dev' WHERE id = '<players.id>';
--   UPDATE players SET cohort = 'player' WHERE id = '<players.id>';
--
-- Run them with the service role. There is deliberately no RPC and no admin
-- endpoint: an audience label changed a handful of times by the person who
-- knows which accounts are theirs does not need an API surface that a
-- compromised token could turn into a censorship tool.

-- ---------------------------------------------------------------------------
-- 3. expire_stale_game_sessions — the expiry sweep
--
--    THIS FUNCTION CANNOT AWARD ANYTHING. It contains exactly one statement,
--    an UPDATE of two columns on `game_sessions`. It does not read or write
--    `players`, `economy_transactions`, `player_records`, `player_mastery`,
--    `collected_snakes` or any other table, and it does not touch `score`,
--    `dna_earned`, `yield_dna` or `validated` on the rows it closes.
--
--    Two windows, because there are two kinds of open row:
--
--      end_reason IS NULL      — never settled. Stale after p_open_max_minutes
--                                (the route passes 180: longer than any real
--                                run, short enough that the count decays).
--
--      end_reason IS NOT NULL  — settled by the client, but the reward write
--                                failed and the route re-opened the row so the
--                                offline outbox can replay it. That replay is
--                                worth real DNA for as long as the outbox
--                                keeps the entry (7 days), so this row is not
--                                stale until p_pending_max_minutes (the route
--                                passes 8 days) has passed. Closing it earlier
--                                would destroy a payout the player earned —
--                                Rule 6.
--
--    SECURITY INVOKER on purpose (no SECURITY DEFINER to audit): the only
--    caller holds the service role, which already bypasses RLS, so definer
--    rights would buy nothing and widen the blast radius. EXECUTE is revoked
--    from everyone except the service role, so no logged-in client can reach
--    it — Rule 11: the client never closes a session for reward purposes, and
--    here it cannot close one at all.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION expire_stale_game_sessions(
  p_open_max_minutes    INTEGER DEFAULT 180,
  p_pending_max_minutes INTEGER DEFAULT 11520,
  p_batch_limit         INTEGER DEFAULT 5000
)
RETURNS INTEGER AS $$
DECLARE
  v_expired INTEGER;
BEGIN
  IF p_open_max_minutes IS NULL OR p_open_max_minutes < 1 THEN
    RAISE EXCEPTION 'expire_stale_game_sessions: p_open_max_minutes must be >= 1';
  END IF;
  IF p_pending_max_minutes IS NULL OR p_pending_max_minutes < p_open_max_minutes THEN
    RAISE EXCEPTION
      'expire_stale_game_sessions: p_pending_max_minutes must be >= p_open_max_minutes';
  END IF;
  IF p_batch_limit IS NULL OR p_batch_limit < 1 THEN
    RAISE EXCEPTION 'expire_stale_game_sessions: p_batch_limit must be >= 1';
  END IF;

  WITH stale AS (
    SELECT gs.id
    FROM game_sessions gs
    WHERE gs.ended_at IS NULL
      AND (
        (gs.end_reason IS NULL
          AND gs.started_at < NOW() - make_interval(mins => p_open_max_minutes))
        OR
        (gs.end_reason IS NOT NULL
          AND gs.started_at < NOW() - make_interval(mins => p_pending_max_minutes))
      )
    ORDER BY gs.started_at
    LIMIT p_batch_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE game_sessions gs
  SET ended_at   = NOW(),
      end_reason = 'expired'
  FROM stale
  WHERE gs.id = stale.id
    AND gs.ended_at IS NULL;

  GET DIAGNOSTICS v_expired = ROW_COUNT;
  RETURN v_expired;
END;
$$ LANGUAGE plpgsql VOLATILE;

REVOKE ALL ON FUNCTION expire_stale_game_sessions(INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION expire_stale_game_sessions(INTEGER, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION expire_stale_game_sessions(INTEGER, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION expire_stale_game_sessions(INTEGER, INTEGER, INTEGER) TO service_role;

COMMENT ON FUNCTION expire_stale_game_sessions(INTEGER, INTEGER, INTEGER) IS
  'Closes stale open sessions with end_reason = ''expired'' (GT §9.6). Writes '
  'ended_at and end_reason only — an expired run settles to nothing and can '
  'never grant DNA, Yield or a record. Service role only.';

-- ---------------------------------------------------------------------------
-- 4. get_anomaly_board — the same two exclusions as the main boards
--
--    Body carried over from migration 021 verbatim except for the two added
--    predicates, both inside the `board` CTE:
--      * gs.end_reason IS NULL OR gs.end_reason = 'completed'
--      * the player's cohort is 'player'
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_anomaly_board(p_player_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_week DATE := duel_week_start(NOW());
  v_anomaly TEXT := anomaly_for_week(v_week);
  v_top JSONB;
  v_my JSONB;
BEGIN
  WITH board AS (
    SELECT
      gs.player_id,
      MAX(gs.score) AS best_score,
      COUNT(*)::int AS runs
    FROM game_sessions gs
    JOIN players bp ON bp.id = gs.player_id
    WHERE gs.anomaly_id = v_anomaly
      AND gs.anomaly_week = v_week
      AND gs.ended_at IS NOT NULL
      AND gs.validated IS TRUE
      AND gs.is_free_play IS NOT TRUE
      -- WP-0.06: only a run that ended by completing may rank. An expired,
      -- abandoned or disconnected run settled to nothing and is not a result.
      AND (gs.end_reason IS NULL OR gs.end_reason = 'completed')
      -- WP-0.06: dev / QA / fixture accounts are not shown to strangers
      -- (GT §13). Read-side only — their runs and rewards are untouched.
      AND bp.cohort = 'player'
    GROUP BY gs.player_id
  ),
  ranked AS (
    SELECT
      board.player_id,
      board.best_score,
      board.runs,
      ROW_NUMBER() OVER (ORDER BY board.best_score DESC, board.player_id ASC) AS rank
    FROM board
  )
  SELECT
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'rank', r.rank,
         'name', COALESCE(pl.username, 'Anonymous'),
         'score', r.best_score
       ) ORDER BY r.rank)
       FROM ranked r
       LEFT JOIN players pl ON pl.id = r.player_id
       WHERE r.rank <= 10),
      '[]'::jsonb
    ),
    (SELECT jsonb_build_object(
       'best', r.best_score,
       'rank', r.rank,
       'runs', r.runs
     ) FROM ranked r WHERE r.player_id = p_player_id)
  INTO v_top, v_my;

  RETURN jsonb_build_object(
    'anomaly_id', v_anomaly,
    'week_start', v_week,
    'ends_at', ((v_week + 7)::timestamp AT TIME ZONE 'UTC'),
    'top', v_top,
    'my', v_my
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Migration 021's grant, restated so the re-created function keeps it.
REVOKE ALL ON FUNCTION get_anomaly_board(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_anomaly_board(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_anomaly_board(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Preservation assertions — the transaction aborts if any of these fail
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_lowered      BIGINT;
  v_sessions     BIGINT;
  v_reason_gap   BIGINT;
  v_lost_players BIGINT;
  v_lost_runs    BIGINT;
BEGIN
  -- (a) Rule 6: no player-owned scalar moved downward.
  SELECT COUNT(*) INTO v_lowered
  FROM wp_0_06_player_pre pre
  JOIN players p ON p.id = pre.player_id
  WHERE p.dna                < pre.dna_before
     OR p.high_score         < pre.high_score_before
     OR p.total_dna_earned   < pre.total_dna_earned_before
     OR p.total_games_played < pre.total_games_played_before;
  IF v_lowered > 0 THEN
    RAISE EXCEPTION
      'WP-0.06 aborted: % player row(s) would be written downward (Rule 6)', v_lowered;
  END IF;

  -- (b) No settled run lost its score, its payout, or its validation.
  SELECT COUNT(*) INTO v_sessions
  FROM wp_0_06_session_pre pre
  JOIN game_sessions gs ON gs.id = pre.session_id
  WHERE gs.score      < pre.score_before
     OR gs.dna_earned < pre.dna_earned_before
     OR gs.validated  IS DISTINCT FROM pre.validated_before
     OR gs.ended_at   IS DISTINCT FROM pre.ended_at_before;
  IF v_sessions > 0 THEN
    RAISE EXCEPTION
      'WP-0.06 aborted: % session row(s) had a settled value rewritten', v_sessions;
  END IF;

  -- (c) Every already-ended run carries a reason; no open run was closed.
  SELECT COUNT(*) INTO v_reason_gap
  FROM game_sessions
  WHERE (ended_at IS NOT NULL AND end_reason IS NULL)
     OR (ended_at IS NULL AND end_reason IS NOT NULL);
  IF v_reason_gap > 0 THEN
    RAISE EXCEPTION
      'WP-0.06 aborted: % session row(s) have ended_at and end_reason out of step',
      v_reason_gap;
  END IF;

  -- (d) Nothing was deleted.
  SELECT c.players_before - (SELECT COUNT(*) FROM players) INTO v_lost_players
  FROM wp_0_06_counts_pre c;
  SELECT c.sessions_before - (SELECT COUNT(*) FROM game_sessions) INTO v_lost_runs
  FROM wp_0_06_counts_pre c;
  IF v_lost_players <> 0 OR v_lost_runs <> 0 THEN
    RAISE EXCEPTION
      'WP-0.06 aborted: % player row(s) and % session row(s) disappeared (Rule 6)',
      v_lost_players, v_lost_runs;
  END IF;
END $$;
