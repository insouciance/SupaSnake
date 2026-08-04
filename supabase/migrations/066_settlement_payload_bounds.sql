-- 066 — Align the settlement payload byte caps with the terminal-facts cap.
--
-- THE INCIDENT
--
-- `game_sessions.continuity_terminal_facts` accepts up to 262,144 bytes
-- (063:117 on the column CHECK, 063:801 in `stage_run_continuity_terminal`).
-- The server therefore happily FREEZES a large terminal outcome. But the two
-- functions that then SETTLE it capped their payload at 65,536 bytes:
--
--   store_pending_game_session_end   (060:105)  earning runs
--   complete_free_run_continuity     (063:968)  practice runs
--
-- plus the `pending_game_session_ends.envelope` column CHECK (060:13), which
-- enforces the same 65,536 independently of the function.
--
-- A run long enough to exceed the smaller cap is written to disk and then can
-- never settle. The rejection is deterministic — the payload is rebuilt
-- identically from the frozen facts on every attempt — so the session keeps
-- `ended_at IS NULL`, `readActiveRun` keeps returning it, and every future
-- `action: 'start'` on that account answers 409 forever. Two production
-- accounts were locked out of play entirely this way, with 795-point and
-- 655-point runs stranded at 70,113 and 71,547 bytes respectively.
--
-- WHAT THIS CHANGES
--
-- Only the bound. Every other validation clause in both functions is
-- reproduced verbatim, so nothing about WHICH payloads are considered
-- well-formed changes — only how large a well-formed payload may be. The new
-- bound is the same 262,144 the terminal facts already allow, which makes the
-- freeze and the settle agree: anything the server was willing to record, it
-- is now willing to settle.
--
-- Companion application change: the settlement payload no longer embeds the
-- unbounded per-tick `journal`/`targets` arrays (see
-- `src/shared/game/settlementGenome.ts`), so new runs land far below even the
-- old cap. This migration is the safety margin that stops a future long run
-- from wedging an account again, and it is what lets the already-stranded rows
-- settle at their existing size.
--
-- Forward-only. Both functions are CREATE OR REPLACE with identical
-- signatures, so re-running is safe. The column CHECK is dropped and re-added
-- under the same name; widening a CHECK cannot invalidate a stored row.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The envelope column bound
-- ---------------------------------------------------------------------------

ALTER TABLE pending_game_session_ends
  DROP CONSTRAINT IF EXISTS pending_game_session_ends_envelope_check;

ALTER TABLE pending_game_session_ends
  ADD CONSTRAINT pending_game_session_ends_envelope_check CHECK (
    jsonb_typeof(envelope) = 'object'
    AND COALESCE((envelope ->> 'v')::INTEGER, 0) = 1
    AND envelope ->> 'kind' = 'career_pending_end_v1'
    AND octet_length(envelope::TEXT) BETWEEN 2 AND 262144
  );

-- ---------------------------------------------------------------------------
-- 2. The earning ingress bound
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION store_pending_game_session_end(
  p_user_id UUID,
  p_player_id UUID,
  p_session_id UUID,
  p_envelope JSONB
) RETURNS JSONB AS $$
DECLARE
  v_session game_sessions%ROWTYPE;
  v_existing pending_game_session_ends%ROWTYPE;
  v_snapshot JSONB;
  v_binding JSONB;
  v_facts JSONB;
  v_inserted_count INTEGER := 0;
  v_initial_state TEXT := 'staged';
  v_recover_lifecycle_close BOOLEAN := FALSE;
BEGIN
  IF p_user_id IS NULL OR p_player_id IS NULL OR p_session_id IS NULL
     OR p_envelope IS NULL OR jsonb_typeof(p_envelope) <> 'object'
     -- 066: was 65536, now aligned with the terminal-facts cap.
     OR octet_length(p_envelope::TEXT) NOT BETWEEN 2 AND 262144
     OR p_envelope ->> 'kind' IS DISTINCT FROM 'career_pending_end_v1'
     OR COALESCE((p_envelope ->> 'v')::INTEGER, 0) <> 1
     OR p_envelope ->> 'userId' IS DISTINCT FROM p_user_id::TEXT
     OR p_envelope ->> 'playerId' IS DISTINCT FROM p_player_id::TEXT
     OR p_envelope ->> 'sessionId' IS DISTINCT FROM p_session_id::TEXT
     OR jsonb_typeof(p_envelope -> 'snapshot') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_envelope -> 'binding') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_envelope -> 'sessionFacts') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'INVALID_PENDING_GAME_END_ENVELOPE';
  END IF;
  v_snapshot := p_envelope -> 'snapshot';
  v_binding := p_envelope -> 'binding';
  v_facts := p_envelope -> 'sessionFacts';
  IF COALESCE((v_snapshot ->> 'v')::INTEGER, 0) <> 1
     OR jsonb_typeof(v_snapshot -> 'settledAt') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_envelope -> 'capturedAt') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_binding -> 'startedAt') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_snapshot -> 'validated') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(v_snapshot -> 'extracted') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(v_snapshot -> 'died') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(v_snapshot -> 'score') IS DISTINCT FROM 'number'
     OR (v_snapshot ->> 'score') !~ '^[0-9]+$'
     OR (v_snapshot ->> 'score')::BIGINT < 0
     OR (v_snapshot ->> 'score')::BIGINT > 2147483647
     OR jsonb_typeof(v_snapshot -> 'yieldDna') IS DISTINCT FROM 'number'
     OR (v_snapshot ->> 'yieldDna') !~ '^[0-9]+$'
     OR (v_snapshot ->> 'yieldDna')::BIGINT < 0
     OR (v_snapshot ->> 'yieldDna')::BIGINT > 2147483647
     OR jsonb_typeof(v_snapshot -> 'dnaCredited') IS DISTINCT FROM 'number'
     OR (v_snapshot ->> 'dnaCredited') !~ '^[0-9]+$'
     OR (v_snapshot ->> 'dnaCredited')::BIGINT < 0
     OR (v_snapshot ->> 'dnaCredited')::BIGINT > 2147483647
     OR jsonb_typeof(v_snapshot -> 'energyCommitted') IS DISTINCT FROM 'number'
     OR (v_snapshot ->> 'energyCommitted') !~ '^[0-9]+$'
     OR (v_snapshot ->> 'energyCommitted')::INTEGER NOT BETWEEN 0 AND 24
     OR jsonb_typeof(v_snapshot -> 'commitmentMultiplierBps') IS DISTINCT FROM 'number'
     OR (v_snapshot ->> 'commitmentMultiplierBps') !~ '^[0-9]+$'
     OR (v_snapshot ->> 'commitmentMultiplierBps')::INTEGER NOT BETWEEN 0 AND 200000
     OR jsonb_typeof(v_snapshot -> 'generation') IS DISTINCT FROM 'number'
     OR (v_snapshot ->> 'generation') !~ '^[1-9][0-9]*$'
     OR (v_snapshot ->> 'generation')::BIGINT > 10000
     OR jsonb_typeof(v_snapshot -> 'masteryXp') IS DISTINCT FROM 'number'
     OR (v_snapshot ->> 'masteryXp') !~ '^[0-9]+$'
     OR (v_snapshot ->> 'masteryXp')::BIGINT > 2147483647
     OR jsonb_typeof(v_snapshot -> 'ladderRung') IS DISTINCT FROM 'number'
     OR (v_snapshot ->> 'ladderRung') !~ '^[0-9]+$'
     OR (v_snapshot ->> 'ladderRung')::BIGINT > 7
     OR jsonb_typeof(v_snapshot -> 'rewardMetadata') IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_snapshot -> 'clan') IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_facts -> 'durationSeconds') IS DISTINCT FROM 'number'
     OR (v_facts ->> 'durationSeconds') !~ '^[0-9]+$'
     OR (v_facts ->> 'durationSeconds')::BIGINT < 0
     OR (v_facts ->> 'durationSeconds')::BIGINT > 2147483647
     OR jsonb_typeof(v_facts -> 'victory') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(v_facts -> 'foodsCollected') IS DISTINCT FROM 'number'
     OR (v_facts ->> 'foodsCollected') !~ '^[0-9]+$'
     OR (v_facts ->> 'foodsCollected')::BIGINT < 0
     OR (v_facts ->> 'foodsCollected')::BIGINT > 2147483647
     OR (
       COALESCE(jsonb_typeof(v_facts -> 'deathCause'), 'null') <> 'null'
       AND (
         jsonb_typeof(v_facts -> 'deathCause') IS DISTINCT FROM 'string'
         OR v_facts ->> 'deathCause' NOT IN (
           'wall', 'self', 'timeout', 'extracted'
         )
       )
     )
     OR (
       COALESCE(jsonb_typeof(v_facts -> 'runEvents'), 'null') <> 'null'
       AND (
         jsonb_typeof(v_facts -> 'runEvents') IS DISTINCT FROM 'object'
         OR octet_length((v_facts -> 'runEvents')::TEXT) > 32768
       )
     )
     OR (
       COALESCE(jsonb_typeof(v_facts -> 'validationErrors'), 'null') <> 'null'
       AND (
         jsonb_typeof(v_facts -> 'validationErrors') IS DISTINCT FROM 'array'
         OR jsonb_array_length(v_facts -> 'validationErrors') > 64
         OR octet_length((v_facts -> 'validationErrors')::TEXT) > 8192
       )
     )
     OR (v_snapshot ->> 'settledAt')::TIMESTAMPTZ IS DISTINCT FROM
       (p_envelope ->> 'capturedAt')::TIMESTAMPTZ
     OR (p_envelope ->> 'capturedAt')::TIMESTAMPTZ <
       (v_binding ->> 'startedAt')::TIMESTAMPTZ
     OR (p_envelope ->> 'capturedAt')::TIMESTAMPTZ > clock_timestamp() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'INVALID_PENDING_GAME_END_RESULT';
  END IF;

  SELECT * INTO v_session
  FROM game_sessions gs
  WHERE gs.id = p_session_id AND gs.player_id = p_player_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PENDING_GAME_END_SESSION_NOT_FOUND'; END IF;
  PERFORM 1 FROM players p
  WHERE p.id = p_player_id AND p.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PENDING_GAME_END_OWNER_MISMATCH';
  END IF;

  SELECT * INTO v_existing
  FROM pending_game_session_ends pending
  WHERE pending.session_id = p_session_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.player_id IS DISTINCT FROM p_player_id
       OR v_existing.user_id IS DISTINCT FROM p_user_id
       OR v_existing.envelope IS DISTINCT FROM p_envelope THEN
      RAISE EXCEPTION 'PENDING_GAME_END_REPLAY_MISMATCH';
    END IF;
    IF v_existing.state = 'quarantined' THEN
      RAISE EXCEPTION 'PENDING_GAME_END_QUARANTINED: %', v_existing.quarantine_reason;
    END IF;
    RETURN jsonb_build_object(
      'accepted', TRUE,
      'inserted', FALSE,
      'sessionId', p_session_id,
      'state', v_existing.state,
      'receivedAt', v_existing.received_at
    );
  END IF;

  IF COALESCE(v_session.is_free_play, FALSE) THEN
    RAISE EXCEPTION 'PENDING_GAME_END_SESSION_NOT_OPEN_EARNING';
  END IF;
  IF (p_envelope ->> 'capturedAt')::TIMESTAMPTZ >
     v_session.started_at + INTERVAL '8 days' THEN
    RAISE EXCEPTION 'PENDING_GAME_END_OUTSIDE_RECOVERY_HORIZON';
  END IF;
  IF v_session.ended_at IS NOT NULL THEN
    IF v_session.end_reason = 'completed' THEN
      v_initial_state := 'superseded_legacy';
    ELSIF v_session.end_reason IN ('expired', 'abandoned', 'disconnected')
          AND (p_envelope ->> 'capturedAt')::TIMESTAMPTZ <= v_session.ended_at THEN
      v_recover_lifecycle_close := TRUE;
    ELSE
      RAISE EXCEPTION 'PENDING_GAME_END_SESSION_NOT_OPEN_EARNING';
    END IF;
  END IF;

  IF (v_binding ->> 'startedAt')::TIMESTAMPTZ IS DISTINCT FROM v_session.started_at
     OR v_binding ->> 'dynasty' IS DISTINCT FROM v_session.dynasty
     OR v_binding -> 'snakeId' IS DISTINCT FROM
       COALESCE(to_jsonb(v_session.snake_used_id), 'null'::JSONB)
     OR v_binding -> 'snakeVariantId' IS DISTINCT FROM
       COALESCE(to_jsonb(v_session.snake_variant_id), 'null'::JSONB)
     OR v_binding -> 'runSeed' IS DISTINCT FROM COALESCE(to_jsonb(v_session.run_seed), 'null'::JSONB)
     OR v_binding -> 'runContext' IS DISTINCT FROM COALESCE(v_session.run_context, 'null'::JSONB)
     OR (v_binding ->> 'energyCommitted')::INTEGER IS DISTINCT FROM
       COALESCE(v_session.energy_committed, 0)
     OR (v_binding ->> 'commitmentMultiplierBps')::INTEGER IS DISTINCT FROM
       COALESCE(v_session.energy_harvest_multiplier_bps, 0)
     OR v_binding -> 'signalRunId' IS DISTINCT FROM
       COALESCE(to_jsonb(v_session.signal_objective_run_id), 'null'::JSONB)
     OR v_binding -> 'clanBattleId' IS DISTINCT FROM
       COALESCE(to_jsonb(v_session.clan_energy_battle_id), 'null'::JSONB)
     OR v_binding -> 'clanBattleSideId' IS DISTINCT FROM
       COALESCE(to_jsonb(v_session.clan_energy_battle_side_id), 'null'::JSONB)
     OR v_binding -> 'clanId' IS DISTINCT FROM
       COALESCE(to_jsonb(v_session.clan_energy_clan_id), 'null'::JSONB)
     OR v_snapshot ->> 'dynasty' IS DISTINCT FROM v_session.dynasty
     OR v_snapshot -> 'snakeId' IS DISTINCT FROM
       COALESCE(to_jsonb(v_session.snake_used_id), 'null'::JSONB)
     OR (v_snapshot ->> 'energyCommitted')::INTEGER IS DISTINCT FROM
       COALESCE(v_session.energy_committed, 0)
     OR (v_snapshot ->> 'commitmentMultiplierBps')::INTEGER IS DISTINCT FROM
       COALESCE(v_session.energy_harvest_multiplier_bps, 0) THEN
    RAISE EXCEPTION 'PENDING_GAME_END_START_BINDING_MISMATCH';
  END IF;
  IF (v_facts ->> 'durationSeconds')::BIGINT > GREATEST(
       FLOOR(EXTRACT(EPOCH FROM (
         (p_envelope ->> 'capturedAt')::TIMESTAMPTZ
         - COALESCE(v_session.server_started_at, v_session.started_at)
       )))::BIGINT + 15,
       15
     ) THEN
    RAISE EXCEPTION 'PENDING_GAME_END_DURATION_MISMATCH';
  END IF;

  INSERT INTO pending_game_session_ends(
    session_id, player_id, user_id, envelope, captured_at, state, adopted_at
  ) VALUES (
    p_session_id, p_player_id, p_user_id, p_envelope,
    (p_envelope ->> 'capturedAt')::TIMESTAMPTZ, v_initial_state,
    CASE WHEN v_initial_state = 'superseded_legacy' THEN clock_timestamp() ELSE NULL END
  ) ON CONFLICT (session_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  SELECT * INTO v_existing FROM pending_game_session_ends pending
  WHERE pending.session_id = p_session_id FOR UPDATE;
  IF NOT FOUND OR v_existing.envelope IS DISTINCT FROM p_envelope THEN
    RAISE EXCEPTION 'PENDING_GAME_END_REPLAY_MISMATCH';
  END IF;

  IF v_initial_state = 'staged' THEN
    UPDATE game_sessions
    SET ended_at = NULL, end_reason = 'completed'
    WHERE id = p_session_id AND player_id = p_player_id
      AND (
        (NOT v_recover_lifecycle_close AND ended_at IS NULL)
        OR (v_recover_lifecycle_close AND ended_at IS NOT DISTINCT FROM v_session.ended_at
            AND end_reason IS NOT DISTINCT FROM v_session.end_reason)
      );
    IF NOT FOUND THEN RAISE EXCEPTION 'PENDING_GAME_END_SESSION_RACE'; END IF;
  END IF;

  RETURN jsonb_build_object(
    'accepted', TRUE,
    'inserted', v_inserted_count > 0,
    'sessionId', p_session_id,
    'state', v_existing.state,
    'receivedAt', v_existing.received_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION store_pending_game_session_end(UUID, UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The practice-run bound
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_body TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_body
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'complete_free_run_continuity';

  IF v_body IS NULL THEN
    RAISE EXCEPTION '066: complete_free_run_continuity is missing';
  END IF;
  IF position('octet_length(p_facts::TEXT) > 65536' IN v_body) = 0 THEN
    -- Already widened (re-run, or a later migration owns it). Nothing to do.
    RAISE NOTICE '066: complete_free_run_continuity already past the 65536 bound';
    RETURN;
  END IF;

  EXECUTE replace(
    v_body,
    'octet_length(p_facts::TEXT) > 65536',
    'octet_length(p_facts::TEXT) > 262144'
  );
  RAISE NOTICE '066: complete_free_run_continuity p_facts bound raised to 262144';
END;
$$;

COMMENT ON CONSTRAINT pending_game_session_ends_envelope_check
  ON pending_game_session_ends IS
  'Envelope bound aligned with continuity_terminal_facts (262144) in migration 066: '
  'a run the server was willing to freeze must be a run it is willing to settle.';

COMMIT;
