-- Migration 060: additive, backward-compatible durable ingress for validated
-- earning-run results. During rollout it bridges old in-flight runs; after 061
-- it remains the permanent acceptance boundary before atomic progression.

CREATE TABLE pending_game_session_ends (
  session_id UUID PRIMARY KEY REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  envelope JSONB NOT NULL CHECK (
    jsonb_typeof(envelope) = 'object'
    AND COALESCE((envelope ->> 'v')::INTEGER, 0) = 1
    AND envelope ->> 'kind' = 'career_pending_end_v1'
    AND octet_length(envelope::TEXT) BETWEEN 2 AND 65536
  ),
  state TEXT NOT NULL DEFAULT 'staged'
    CHECK (state IN ('staged', 'adopted', 'superseded_legacy', 'quarantined')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  captured_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_attempted_at TIMESTAMPTZ,
  adopted_at TIMESTAMPTZ,
  quarantine_reason TEXT CHECK (
    quarantine_reason IS NULL OR char_length(quarantine_reason) BETWEEN 1 AND 500
  ),
  CONSTRAINT pending_end_player_session UNIQUE(player_id, session_id),
  CONSTRAINT pending_end_terminal_state CHECK (
    (state = 'staged' AND adopted_at IS NULL AND quarantine_reason IS NULL)
    OR (state = 'adopted' AND adopted_at IS NOT NULL AND quarantine_reason IS NULL)
    OR (state = 'superseded_legacy' AND adopted_at IS NOT NULL AND quarantine_reason IS NULL)
    OR (state = 'quarantined' AND adopted_at IS NULL AND quarantine_reason IS NOT NULL)
  )
);

CREATE INDEX pending_game_session_ends_recovery_idx
  ON pending_game_session_ends(
    state, last_attempted_at NULLS FIRST, received_at, session_id
  )
  WHERE state = 'staged';
CREATE INDEX pending_game_session_ends_player_order_idx
  ON pending_game_session_ends(player_id, received_at, session_id)
  WHERE state IN ('staged', 'quarantined');

ALTER TABLE pending_game_session_ends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pending_game_session_ends FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE pending_game_session_ends FROM service_role;

-- Gameplay sessions are created and mutated only by the service-role API.
-- Remove the dead historical own-row INSERT policy and explicitly revoke DML
-- so hosted/default-ACL drift cannot reopen browser authority later.
DROP POLICY IF EXISTS game_sessions_insert_own ON game_sessions;
REVOKE INSERT, UPDATE, DELETE ON TABLE game_sessions FROM anon, authenticated;

COMMENT ON TABLE pending_game_session_ends IS
  'Permanent durable server authority for validated earning ends before atomic adoption. Callers use service-only RPCs; no browser role, table access, or browser storage participates.';

CREATE OR REPLACE FUNCTION guard_pending_game_session_end()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.session_id IS DISTINCT FROM OLD.session_id
     OR NEW.player_id IS DISTINCT FROM OLD.player_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.envelope IS DISTINCT FROM OLD.envelope
     OR NEW.captured_at IS DISTINCT FROM OLD.captured_at
     OR NEW.received_at IS DISTINCT FROM OLD.received_at THEN
    RAISE EXCEPTION 'PENDING_GAME_END_EVIDENCE_IMMUTABLE';
  END IF;
  IF NEW.attempt_count < OLD.attempt_count THEN
    RAISE EXCEPTION 'PENDING_GAME_END_ATTEMPTS_CANNOT_DECREASE';
  END IF;
  IF OLD.state <> 'staged' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'PENDING_GAME_END_TERMINAL';
  END IF;
  IF OLD.state = 'staged'
     AND NEW.state NOT IN ('staged', 'adopted', 'superseded_legacy', 'quarantined') THEN
    RAISE EXCEPTION 'INVALID_PENDING_GAME_END_TRANSITION';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION guard_pending_game_session_end()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER pending_game_session_end_guard
BEFORE UPDATE ON pending_game_session_ends
FOR EACH ROW EXECUTE FUNCTION guard_pending_game_session_end();

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
     OR octet_length(p_envelope::TEXT) NOT BETWEEN 2 AND 65536
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
      -- An outgoing schema-060 writer won the race. Its legacy path owns the
      -- payout; retain terminal evidence but never adopt/pay it a second time.
      v_initial_state := 'superseded_legacy';
    ELSIF v_session.end_reason IN ('expired', 'abandoned', 'disconnected')
          AND (p_envelope ->> 'capturedAt')::TIMESTAMPTZ <= v_session.ended_at THEN
      -- Validation finished before the lifecycle closer won. The immutable
      -- service envelope is stronger evidence than the later timeout close.
      v_recover_lifecycle_close := TRUE;
    ELSE
      RAISE EXCEPTION 'PENDING_GAME_END_SESSION_NOT_OPEN_EARNING';
    END IF;
  END IF;

  -- Bind the envelope to immutable start authority, not just three UUIDs.
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
    -- `completed` + NULL ended_at is the existing long-lived pending payout
    -- shape. If expiry/abandonment raced after server validation, reopen only
    -- that exact close; every other state mismatch aborts the transaction.
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

CREATE OR REPLACE FUNCTION stage_pending_game_session_end(
  p_user_id UUID,
  p_player_id UUID,
  p_session_id UUID,
  p_envelope JSONB
) RETURNS JSONB AS $$
  SELECT store_pending_game_session_end(
    p_user_id, p_player_id, p_session_id, p_envelope
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION stage_pending_game_session_end(UUID, UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION stage_pending_game_session_end(UUID, UUID, UUID, JSONB)
  TO service_role;

CREATE OR REPLACE FUNCTION list_pending_game_session_ends(
  p_limit INTEGER DEFAULT 100
) RETURNS TABLE(player_id UUID, session_id UUID, received_at TIMESTAMPTZ) AS $$
BEGIN
  RETURN QUERY
  WITH earliest_per_player AS (
    SELECT DISTINCT ON (pending.player_id)
      pending.session_id, pending.player_id, pending.received_at,
      pending.last_attempted_at
    FROM pending_game_session_ends pending
    WHERE pending.state = 'staged'
    ORDER BY pending.player_id, pending.received_at, pending.session_id
  ), candidates AS (
    SELECT pending.session_id
    FROM pending_game_session_ends pending
    JOIN earliest_per_player earliest ON earliest.session_id = pending.session_id
    ORDER BY pending.last_attempted_at NULLS FIRST,
             pending.received_at, pending.session_id
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
  ), claimed AS (
    UPDATE pending_game_session_ends pending
    SET attempt_count = pending.attempt_count + 1,
        last_attempted_at = clock_timestamp()
    FROM candidates c
    WHERE pending.session_id = c.session_id
    RETURNING pending.player_id, pending.session_id, pending.received_at,
              pending.last_attempted_at
  )
  SELECT claimed.player_id, claimed.session_id, claimed.received_at
  FROM claimed
  ORDER BY claimed.last_attempted_at, claimed.received_at, claimed.session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION list_pending_game_session_ends(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION list_pending_game_session_ends(INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION get_pending_game_session_end(
  p_player_id UUID,
  p_session_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_pending pending_game_session_ends%ROWTYPE;
BEGIN
  SELECT * INTO v_pending FROM pending_game_session_ends pending
  WHERE pending.player_id = p_player_id AND pending.session_id = p_session_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'sessionId', v_pending.session_id,
    'state', v_pending.state,
    'receivedAt', v_pending.received_at,
    'adoptedAt', v_pending.adopted_at,
    'quarantineReason', v_pending.quarantine_reason
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION get_pending_game_session_end(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_pending_game_session_end(UUID, UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION count_staged_pending_game_session_ends(
  p_player_id UUID
) RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM pending_game_session_ends pending
  WHERE pending.player_id = p_player_id
    AND pending.state IN ('staged', 'quarantined');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION count_staged_pending_game_session_ends(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION count_staged_pending_game_session_ends(UUID)
  TO service_role;

-- A staged, service-authored end is durable payout debt and cannot be expired
-- by the generic lifecycle sweeper while the 061 adopter is pending.
CREATE OR REPLACE FUNCTION expire_stale_game_sessions(
  p_open_max_minutes INTEGER DEFAULT 180,
  p_pending_max_minutes INTEGER DEFAULT 11520,
  p_batch_limit INTEGER DEFAULT 5000
) RETURNS INTEGER AS $$
DECLARE
  v_expired INTEGER;
BEGIN
  IF p_open_max_minutes IS NULL OR p_open_max_minutes < 1 THEN
    RAISE EXCEPTION 'expire_stale_game_sessions: p_open_max_minutes must be >= 1';
  END IF;
  IF p_pending_max_minutes IS NULL OR p_pending_max_minutes < p_open_max_minutes THEN
    RAISE EXCEPTION 'expire_stale_game_sessions: p_pending_max_minutes must be >= p_open_max_minutes';
  END IF;
  IF p_batch_limit IS NULL OR p_batch_limit < 1 THEN
    RAISE EXCEPTION 'expire_stale_game_sessions: p_batch_limit must be >= 1';
  END IF;

  WITH stale AS (
    SELECT gs.id
    FROM game_sessions gs
    WHERE gs.ended_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM pending_game_session_ends pending
        WHERE pending.session_id = gs.id
          AND pending.state IN ('staged', 'quarantined')
      )
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
  SET ended_at = NOW(), end_reason = 'expired'
  FROM stale
  WHERE gs.id = stale.id AND gs.ended_at IS NULL;
  GET DIAGNOSTICS v_expired = ROW_COUNT;
  RETURN v_expired;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION expire_stale_game_sessions(INTEGER, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION expire_stale_game_sessions(INTEGER, INTEGER, INTEGER)
  TO service_role;

COMMENT ON FUNCTION expire_stale_game_sessions(INTEGER, INTEGER, INTEGER) IS
  'Closes stale open sessions without rewards, but never expires accepted staged or quarantined Career debt. Security definer; service-role RPC only.';

COMMENT ON FUNCTION stage_pending_game_session_end(UUID, UUID, UUID, JSONB) IS
  'Service-only immutable acceptance boundary. Validates exact account/session/start bindings, stores one canonical server envelope, and never grants progress itself.';

CREATE OR REPLACE FUNCTION get_career_settlement_capability()
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'status', 'pending',
    'bridgeVersion', 1,
    'careerVersion', NULL
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION get_career_settlement_capability()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_career_settlement_capability()
  TO service_role;
