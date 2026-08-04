-- =====================================================================
-- 068 — The settlement sweep becomes the primary settler (CE-2)
-- =====================================================================
--
-- Continuity & Engine Integrity, principle 2: "The server is the primary
-- settler; the client is an accelerator." Settlement must complete without
-- the player returning. Three scan-level defects stopped that from being
-- true, and all three live in SQL:
--
--   1. HEAD-OF-LINE BLOCKING BY PLAYER. `list_pending_game_progression_sessions`
--      selected `DISTINCT ON (gs.player_id)` (061:3043), so a player with a
--      backlog drained at exactly one run per cron pass, and a run that could
--      never settle starved every later run on that account forever.
--
--   2. NO BACKOFF. Every pass re-claimed the same permanently-failing rows
--      ahead of healthy ones, because the only ordering signal was
--      `progression_recovery_attempted_at` — which the claim itself rewrites.
--      `progression_recovery_attempts` (061:1085) was incremented and then
--      never read by anything.
--
--   3. NO SERVER DRIVER FOR A STRANDED TERMINAL RUN. A run the server has
--      already terminalized (`continuity_phase = 'terminal'`, `ended_at IS
--      NULL`) is invisible to every sweeper: `expire_stale_game_sessions`
--      skips continuity rows, `list_pending_game_session_ends` needs an
--      envelope this run never staged, and the progression scan above needs
--      `ended_at IS NOT NULL`. Its only driver was a browser re-posting
--      `action: 'end'` — so the value could not settle unless the player came
--      back. That is exactly the state that stranded the owner's run.
--
-- Nothing here weakens an existing guard. The chronology barrier
-- (`GAME_PROGRESSION_EARLIER_SESSION_PENDING`, 061:2423) is deliberately
-- untouched: reordering milestone attribution is its own design change.
-- What changes is that the barrier can no longer be reached by a *starved*
-- session — every eligible session is now offered to the settler each pass,
-- and the sweep isolates each one's failure from every other's.
--
-- NO PERMANENT GIVE-UP. Backoff spaces retries; it never retires a row.
-- The spacing is capped at 24 hours, so a row that has failed a thousand
-- times is still retried a thousand and first. A state with no exit is an
-- outage waiting for its first occupant.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Shared retry spacing
-- ---------------------------------------------------------------------
-- Exponential in the attempt count, capped at 24 hours.
--
-- THE FIRST RETRY IS IMMEDIATE. One attempt is not evidence of anything —
-- it is also the state of a run the sweep just claimed for an earlier stage
-- in this very invocation, which must stay eligible for the later stage or
-- a run absorbed at 12:00 would wait until 12:10 to be paid. Spacing starts
-- only once a row has actually failed twice: 2, 4, 8, 16, 32, 64 minutes,
-- then hours, then a 24-hour floor rate that continues forever.
--
-- The cron runs every 10 minutes, so the first four failures cost a row
-- nothing — a transient database blip still retries almost immediately.
-- Only a row that keeps failing starts yielding its slot to healthy work,
-- which is the whole point: one poisoned session must not consume the batch
-- that a hundred settleable ones are waiting in.
CREATE OR REPLACE FUNCTION settlement_recovery_backoff(p_attempts INTEGER)
RETURNS INTERVAL AS $$
  SELECT CASE
    WHEN COALESCE(p_attempts, 0) <= 1 THEN INTERVAL '0 minutes'
    ELSE LEAST(
           POWER(2, LEAST(COALESCE(p_attempts, 0) - 1, 12))::DOUBLE PRECISION,
           1440::DOUBLE PRECISION
         ) * INTERVAL '1 minute'
  END;
$$ LANGUAGE sql IMMUTABLE SET search_path = public;

COMMENT ON FUNCTION settlement_recovery_backoff(INTEGER) IS
  'Retry spacing for server-side settlement recovery: exponential in progression_recovery_attempts, capped at 24 hours. Never returns NULL and never signals give-up.';

-- ---------------------------------------------------------------------
-- 2. The progression scan, without per-player head-of-line blocking
-- ---------------------------------------------------------------------
-- The return type gains `recovery_attempts` so the sweep can report a row
-- that has been failing for a long time instead of silently re-trying it
-- into the void, so the signature must be dropped rather than replaced.
DROP FUNCTION IF EXISTS list_pending_game_progression_sessions(INTEGER);

CREATE FUNCTION list_pending_game_progression_sessions(
  p_limit INTEGER DEFAULT 100
) RETURNS TABLE(
  player_id UUID,
  session_id UUID,
  reward_protocol TEXT,
  recovery_attempts INTEGER
) AS $$
BEGIN
  RETURN QUERY
  -- Selection is ATTEMPT-AWARE: healthy work outranks chronically failing
  -- work for a place in the batch.
  WITH eligible AS (
    SELECT gs.id,
           gs.atomic_reward_observed_at,
           gs.progression_recovery_attempts
    FROM game_sessions gs
    LEFT JOIN run_impact_receipts rir ON rir.session_id = gs.id
    WHERE gs.ended_at IS NOT NULL
      AND gs.end_reason = 'completed'
      AND NOT COALESCE(gs.is_free_play, FALSE)
      AND rir.session_id IS NULL
      AND gs.reward_protocol = 'atomic_v1'
      AND gs.atomic_reward_observed_at IS NOT NULL
      AND (
        gs.progression_recovery_attempted_at IS NULL
        OR gs.progression_recovery_attempted_at
             <= clock_timestamp()
                - settlement_recovery_backoff(gs.progression_recovery_attempts)
      )
    ORDER BY gs.progression_recovery_attempts,
             gs.atomic_reward_observed_at,
             gs.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
  ), candidates AS (
    -- Lock only game_sessions. `FOR UPDATE` may not be applied to the
    -- nullable side of the outer join above, which is why the receipt
    -- anti-join and the row lock are separate steps.
    SELECT gs.id
    FROM game_sessions gs
    JOIN eligible e ON e.id = gs.id
    ORDER BY e.progression_recovery_attempts,
             e.atomic_reward_observed_at,
             e.id
    FOR UPDATE OF gs SKIP LOCKED
  ), claimed AS (
    UPDATE game_sessions gs
    SET progression_recovery_attempted_at = clock_timestamp(),
        progression_recovery_attempts = gs.progression_recovery_attempts + 1
    FROM candidates c
    WHERE gs.id = c.id
    RETURNING gs.player_id, gs.id, gs.reward_protocol,
              gs.progression_recovery_attempts,
              gs.atomic_reward_observed_at
  )
  -- Execution is CHRONOLOGICAL. Selection may admit several sessions of one
  -- player in a single batch; the ordered settlement RPCs still require the
  -- earlier one to settle first, so hand them back oldest-first and a whole
  -- backlog drains inside one pass instead of one run per ten minutes.
  SELECT claimed.player_id, claimed.id, claimed.reward_protocol,
         claimed.progression_recovery_attempts
  FROM claimed
  ORDER BY claimed.atomic_reward_observed_at, claimed.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION list_pending_game_progression_sessions(INTEGER) IS
  'Claim a bounded batch of completed atomic_v1 sessions with no impact receipt. Attempt-aware selection, chronological execution, no per-player DISTINCT ON.';

REVOKE ALL ON FUNCTION list_pending_game_progression_sessions(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION list_pending_game_progression_sessions(INTEGER)
  TO service_role;

-- ---------------------------------------------------------------------
-- 3. The state nothing covered: a stranded terminal run
-- ---------------------------------------------------------------------
-- `continuity_phase = 'terminal'` with `ended_at IS NULL` is a run whose
-- outcome the SERVER derived and durably locked (063's terminal shape
-- constraint guarantees `continuity_terminal_facts`, digest and timestamp
-- are all present). Nothing about it depends on the client any more — only
-- its settlement did. This scan makes it reachable by a server driver.
--
-- `p_min_age_seconds` is a grace window, not a gate: a browser that is
-- actively settling gets its own ~13 seconds of client retry first, so the
-- sweep does not race it for no reason. Settlement is idempotent by session
-- either way; the grace only keeps the logs honest about who settled what.
CREATE OR REPLACE FUNCTION list_stranded_terminal_runs(
  p_limit INTEGER DEFAULT 20,
  p_min_age_seconds INTEGER DEFAULT 120
) RETURNS TABLE(
  player_id UUID,
  user_id UUID,
  session_id UUID,
  recovery_attempts INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH eligible AS (
    SELECT gs.id,
           gs.continuity_terminal_at,
           gs.progression_recovery_attempts
    FROM game_sessions gs
    WHERE gs.ended_at IS NULL
      AND gs.end_reason IS NULL
      AND gs.continuity_phase = 'terminal'
      AND gs.continuity_terminal_facts IS NOT NULL
      AND gs.continuity_terminal_at
            <= clock_timestamp()
               - (GREATEST(COALESCE(p_min_age_seconds, 120), 0) * INTERVAL '1 second')
      AND (
        gs.progression_recovery_attempted_at IS NULL
        OR gs.progression_recovery_attempted_at
             <= clock_timestamp()
                - settlement_recovery_backoff(gs.progression_recovery_attempts)
      )
    ORDER BY gs.progression_recovery_attempts,
             gs.continuity_terminal_at,
             gs.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 200)
  ), candidates AS (
    SELECT gs.id
    FROM game_sessions gs
    JOIN eligible e ON e.id = gs.id
    ORDER BY e.progression_recovery_attempts,
             e.continuity_terminal_at,
             e.id
    FOR UPDATE OF gs SKIP LOCKED
  ), claimed AS (
    -- The same counter the progression scan uses. One run has one recovery
    -- history whichever stage it is stuck in, and the terminal stage is
    -- strictly earlier than the progression stage, so the count never
    -- restarts and the backoff never resets.
    --
    -- `protect_run_continuity` (063:265) refuses any change to the terminal
    -- facts, digest, timestamp or phase. This UPDATE touches none of them.
    UPDATE game_sessions gs
    SET progression_recovery_attempted_at = clock_timestamp(),
        progression_recovery_attempts = gs.progression_recovery_attempts + 1
    FROM candidates c
    WHERE gs.id = c.id
    RETURNING gs.player_id, gs.id,
              gs.progression_recovery_attempts,
              gs.continuity_terminal_at
  )
  SELECT claimed.player_id, p.user_id, claimed.id,
         claimed.progression_recovery_attempts
  FROM claimed
  JOIN players p ON p.id = claimed.player_id
  ORDER BY claimed.continuity_terminal_at, claimed.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION list_stranded_terminal_runs(INTEGER, INTEGER) IS
  'Claim a bounded batch of server-terminalized runs that were never settled. The state that had no server driver before CE-2.';

REVOKE ALL ON FUNCTION list_stranded_terminal_runs(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION list_stranded_terminal_runs(INTEGER, INTEGER)
  TO service_role;

REVOKE ALL ON FUNCTION settlement_recovery_backoff(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION settlement_recovery_backoff(INTEGER)
  TO service_role;

-- ---------------------------------------------------------------------
-- 4. Index for the new scan
-- ---------------------------------------------------------------------
-- Partial on the stranded shape, ordered exactly as the scan orders, so the
-- sweep never sequentially scans game_sessions to find nothing.
CREATE INDEX IF NOT EXISTS game_sessions_stranded_terminal_idx
  ON game_sessions(progression_recovery_attempts, continuity_terminal_at, id)
  WHERE ended_at IS NULL
    AND end_reason IS NULL
    AND continuity_phase = 'terminal';

COMMIT;
