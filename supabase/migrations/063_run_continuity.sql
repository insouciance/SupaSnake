-- Migration 063: recoverable, idempotent run starts without browser storage.
--
-- A start request is a server-owned receipt. The immutable start manifest and
-- the Energy commitment are finalized in one transaction, so a lost HTTP
-- response can never turn a successful six-Energy commitment into an
-- unreachable session. Active runs additionally retain the latest bounded,
-- monotonic checkpoint accepted by the service so browser loss resumes from
-- server-held state rather than browser storage.

BEGIN;

ALTER TABLE game_sessions
  ADD COLUMN start_request_id UUID,
  ADD COLUMN start_request_fingerprint TEXT,
  ADD COLUMN start_manifest JSONB,
  ADD COLUMN start_manifest_draft JSONB,
  ADD COLUMN continuity_energy_commitment SMALLINT,
  ADD COLUMN continuity_exempt BOOLEAN,
  ADD COLUMN continuity_energy_visible BOOLEAN,
  ADD COLUMN simulation_seed UUID,
  ADD COLUMN simulation_version SMALLINT,
  ADD COLUMN continuity_phase TEXT,
  ADD COLUMN continuity_activated_at TIMESTAMPTZ,
  ADD COLUMN continuity_checkpoint JSONB,
  ADD COLUMN continuity_checkpoint_revision INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN continuity_checkpoint_saved_at TIMESTAMPTZ,
  ADD COLUMN continuity_checkpoint_digest TEXT,
  ADD COLUMN continuity_lease_hash TEXT,
  ADD COLUMN continuity_lease_epoch INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN continuity_lease_issued_at TIMESTAMPTZ;

ALTER TABLE game_sessions
  ADD CONSTRAINT game_sessions_start_request_pair
    CHECK (
      (start_request_id IS NULL AND start_request_fingerprint IS NULL)
      OR
      (start_request_id IS NOT NULL
       AND start_request_fingerprint ~ '^[0-9a-f]{64}$')
    ),
  ADD CONSTRAINT game_sessions_start_manifest_object
    CHECK (
      start_manifest IS NULL
      OR (
        jsonb_typeof(start_manifest) = 'object'
        AND octet_length(start_manifest::TEXT) <= 131072
      )
    ),
  ADD CONSTRAINT game_sessions_start_manifest_draft_shape
    CHECK (
      (start_manifest_draft IS NULL
       AND continuity_energy_commitment IS NULL
       AND continuity_exempt IS NULL
       AND continuity_energy_visible IS NULL)
      OR
      (jsonb_typeof(start_manifest_draft) = 'object'
       AND octet_length(start_manifest_draft::TEXT) <= 131072
       AND continuity_energy_commitment BETWEEN 0 AND 24
       AND continuity_exempt IS NOT NULL
       AND continuity_energy_visible IS NOT NULL)
    ),
  ADD CONSTRAINT game_sessions_continuity_phase_valid
    CHECK (
      continuity_phase IS NULL
      OR continuity_phase IN ('preparing', 'prepared', 'active')
    ),
  ADD CONSTRAINT game_sessions_continuity_checkpoint_shape
    CHECK (
      (continuity_checkpoint IS NULL
       AND continuity_checkpoint_revision = 0
       AND continuity_checkpoint_saved_at IS NULL
       AND continuity_checkpoint_digest IS NULL)
      OR
      (continuity_phase = 'active'
       AND jsonb_typeof(continuity_checkpoint) = 'object'
       AND octet_length(continuity_checkpoint::TEXT) <= 1048576
       AND continuity_checkpoint_revision > 0
       AND continuity_checkpoint_saved_at IS NOT NULL
       AND continuity_checkpoint_digest ~ '^[0-9a-f]{64}$')
    ),
  ADD CONSTRAINT game_sessions_continuity_lease_shape
    CHECK (
      (continuity_phase IS DISTINCT FROM 'active'
       AND continuity_lease_hash IS NULL
       AND continuity_lease_epoch = 0
       AND continuity_lease_issued_at IS NULL)
      OR
      (continuity_phase = 'active'
       AND continuity_lease_hash ~ '^[0-9a-f]{64}$'
       AND continuity_lease_epoch > 0
       AND continuity_lease_issued_at IS NOT NULL)
    ),
  ADD CONSTRAINT game_sessions_simulation_version_valid
    CHECK (
      (simulation_seed IS NULL AND simulation_version IS NULL)
      OR
      (simulation_seed IS NOT NULL AND simulation_version = 1)
    ),
  ADD CONSTRAINT game_sessions_continuity_shape
    CHECK (
      (continuity_phase IS NULL
       AND start_request_id IS NULL
       AND start_manifest IS NULL
       AND start_manifest_draft IS NULL
       AND simulation_seed IS NULL
       AND simulation_version IS NULL
       AND continuity_activated_at IS NULL)
      OR
      (continuity_phase = 'preparing'
       AND start_request_id IS NOT NULL
       AND start_manifest IS NULL
       AND simulation_seed IS NOT NULL
       AND simulation_version = 1
       AND continuity_activated_at IS NULL)
      OR
      (continuity_phase = 'prepared'
       AND start_request_id IS NOT NULL
       AND start_manifest IS NOT NULL
       AND start_manifest_draft IS NOT NULL
       AND simulation_seed IS NOT NULL
       AND simulation_version = 1
       AND continuity_activated_at IS NULL)
      OR
      (continuity_phase = 'active'
       AND start_request_id IS NOT NULL
       AND start_manifest IS NOT NULL
       AND start_manifest_draft IS NOT NULL
       AND simulation_seed IS NOT NULL
       AND simulation_version = 1
       AND continuity_activated_at IS NOT NULL)
    );

COMMENT ON COLUMN game_sessions.start_request_id IS
  'Client-generated UUID naming one deliberate start intent. Server-unique per player and immutable; retries return this session instead of spending again.';
COMMENT ON COLUMN game_sessions.start_request_fingerprint IS
  'SHA-256 of the normalized player-selected start intent. Same id with a different fingerprint is rejected.';
COMMENT ON COLUMN game_sessions.start_manifest IS
  'Immutable, client-safe server start response. Stored in the same transaction that commits Energy; never browser-persisted.';
COMMENT ON COLUMN game_sessions.start_manifest_draft IS
  'Server-only client-safe manifest base staged before Energy finalization. Lets the same start intent recover a transient pre-commit failure without trusting the browser.';
COMMENT ON COLUMN game_sessions.simulation_seed IS
  'Server-issued seed for the complete deterministic client simulation. Immutable and domain-separated from the genome offer seed.';
COMMENT ON COLUMN game_sessions.simulation_version IS
  'Version of the deterministic simulation contract used by this run.';
COMMENT ON COLUMN game_sessions.continuity_phase IS
  'preparing before atomic Energy+manifest finalization, prepared while safely continuable before first input, active after explicit activation.';
COMMENT ON COLUMN game_sessions.continuity_checkpoint IS
  'Latest service-accepted live simulation checkpoint. Continuation-only; payout remains server-recomputed from immutable session facts.';
COMMENT ON COLUMN game_sessions.continuity_checkpoint_revision IS
  'Monotonic compare-and-swap revision for idempotent checkpoint writes.';
COMMENT ON COLUMN game_sessions.continuity_lease_hash IS
  'SHA-256 of the current in-memory resume lease. Rotated at activation/resume so an older tab cannot fork or settle the run.';

CREATE UNIQUE INDEX game_sessions_player_start_request_unique
  ON game_sessions(player_id, start_request_id)
  WHERE start_request_id IS NOT NULL;

-- This is the concurrency guard for the new continuity protocol. Historical
-- open rows are deliberately left untouched: a migration is not verified
-- death, banking, or explicit abandonment and therefore cannot terminalize a
-- staked run. The start route reads any legacy open row before inserting, while
-- this partial index closes the race between two new continuity requests.
CREATE UNIQUE INDEX game_sessions_one_open_nonsettling_per_player
  ON game_sessions(player_id)
  WHERE ended_at IS NULL
    AND end_reason IS NULL
    AND start_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION protect_run_continuity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.start_request_id IS NOT NULL AND (
       NEW.start_request_id IS DISTINCT FROM OLD.start_request_id
    OR NEW.start_request_fingerprint IS DISTINCT FROM OLD.start_request_fingerprint
    OR NEW.simulation_seed IS DISTINCT FROM OLD.simulation_seed
    OR NEW.simulation_version IS DISTINCT FROM OLD.simulation_version
  ) THEN
    RAISE EXCEPTION 'run_continuity_start_intent_immutable';
  END IF;

  IF OLD.start_manifest IS NOT NULL
     AND NEW.start_manifest IS DISTINCT FROM OLD.start_manifest THEN
    RAISE EXCEPTION 'run_continuity_manifest_immutable';
  END IF;

  IF OLD.start_manifest_draft IS NOT NULL AND (
       NEW.start_manifest_draft IS DISTINCT FROM OLD.start_manifest_draft
    OR NEW.continuity_energy_commitment IS DISTINCT FROM OLD.continuity_energy_commitment
    OR NEW.continuity_exempt IS DISTINCT FROM OLD.continuity_exempt
    OR NEW.continuity_energy_visible IS DISTINCT FROM OLD.continuity_energy_visible
  ) THEN
    RAISE EXCEPTION 'run_continuity_manifest_draft_immutable';
  END IF;

  IF OLD.continuity_phase = 'prepared'
     AND NEW.continuity_phase IS DISTINCT FROM 'prepared'
     AND NEW.continuity_phase IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'run_continuity_phase_cannot_reverse';
  END IF;
  IF OLD.continuity_phase = 'active'
     AND NEW.continuity_phase IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'run_continuity_phase_cannot_reverse';
  END IF;
  IF OLD.continuity_phase IS NULL
     AND NEW.continuity_phase IS NOT NULL THEN
    RAISE EXCEPTION 'legacy_session_cannot_gain_continuity';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER game_sessions_run_continuity_immutable
BEFORE UPDATE ON game_sessions
FOR EACH ROW EXECUTE FUNCTION protect_run_continuity();

CREATE OR REPLACE FUNCTION finalize_run_continuity_start(
  p_player_id UUID,
  p_session_id UUID,
  p_start_request_id UUID,
  p_start_request_fingerprint TEXT,
  p_manifest_base JSONB,
  p_energy_visible BOOLEAN,
  p_commitment INTEGER,
  p_exempt BOOLEAN,
  p_capacity INTEGER,
  p_recovery_interval_seconds INTEGER,
  p_commitment_multipliers_bps INTEGER[],
  p_battle_epoch TIMESTAMPTZ,
  p_battle_active_seconds INTEGER,
  p_battle_intermission_seconds INTEGER,
  p_battle_best_count INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_charge RECORD;
  v_capacity INTEGER := GREATEST(1, LEAST(COALESCE(p_capacity, 6), 24));
  v_interval INTEGER := GREATEST(60, COALESCE(p_recovery_interval_seconds, 3600));
  v_recovery_started TIMESTAMPTZ;
  v_next_recovery TIMESTAMPTZ;
  v_progress NUMERIC;
  v_energy JSONB;
  v_manifest JSONB;
BEGIN
  IF p_start_request_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'start_request_conflict';
  END IF;
  IF p_manifest_base IS NULL OR jsonb_typeof(p_manifest_base) <> 'object' THEN
    RAISE EXCEPTION 'invalid_start_manifest';
  END IF;
  IF p_manifest_base ?| ARRAY['sessionId', 'energy', 'charge', 'clanBattle'] THEN
    RAISE EXCEPTION 'invalid_start_manifest_reserved_key';
  END IF;

  SELECT gs.id, gs.player_id, gs.ended_at, gs.end_reason,
         gs.start_request_id, gs.start_request_fingerprint,
         gs.start_manifest, gs.start_manifest_draft,
         gs.continuity_energy_commitment, gs.continuity_exempt,
         gs.continuity_energy_visible, gs.continuity_phase
    INTO v_session
    FROM game_sessions gs
   WHERE gs.id = p_session_id
     AND gs.player_id = p_player_id
   FOR UPDATE;

  IF NOT FOUND OR v_session.ended_at IS NOT NULL OR v_session.end_reason IS NOT NULL THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;
  IF v_session.start_request_id IS DISTINCT FROM p_start_request_id
     OR v_session.start_request_fingerprint IS DISTINCT FROM p_start_request_fingerprint THEN
    RAISE EXCEPTION 'start_request_conflict';
  END IF;

  IF v_session.start_manifest_draft IS DISTINCT FROM p_manifest_base
     OR v_session.continuity_energy_commitment IS DISTINCT FROM p_commitment
     OR v_session.continuity_exempt IS DISTINCT FROM p_exempt
     OR v_session.continuity_energy_visible IS DISTINCT FROM p_energy_visible THEN
    RAISE EXCEPTION 'start_request_conflict';
  END IF;

  -- A response retry returns the byte-for-byte same JSON value and does not
  -- enter the Energy RPC again.
  IF v_session.start_manifest IS NOT NULL THEN
    RETURN v_session.start_manifest;
  END IF;
  IF v_session.continuity_phase IS DISTINCT FROM 'preparing' THEN
    RAISE EXCEPTION 'run_not_preparing';
  END IF;

  SELECT * INTO STRICT v_charge
    FROM commit_run_energy(
      p_player_id,
      p_session_id,
      p_commitment,
      p_exempt,
      v_capacity,
      v_interval,
      p_commitment_multipliers_bps,
      p_battle_epoch,
      p_battle_active_seconds,
      p_battle_intermission_seconds,
      p_battle_best_count
    );

  IF v_charge.energy_available >= v_capacity THEN
    v_recovery_started := v_charge.server_now;
    v_next_recovery := NULL;
    v_progress := 1;
  ELSE
    v_recovery_started := v_charge.energy_updated_at;
    v_next_recovery := v_charge.energy_updated_at + make_interval(secs => v_interval);
    v_progress := LEAST(
      1::NUMERIC,
      GREATEST(
        0::NUMERIC,
        EXTRACT(EPOCH FROM (v_charge.server_now - v_charge.energy_updated_at))
          / v_interval
      )
    );
  END IF;

  v_energy := jsonb_build_object(
    'state', v_charge.run_state,
    'available', v_charge.energy_available,
    'capacity', v_capacity,
    'recoveryIntervalSeconds', v_interval,
    'recoveryStartedAt', v_recovery_started,
    'nextRecoveryAt', v_next_recovery,
    'recoveryProgress', v_progress,
    'serverNow', v_charge.server_now,
    'remaining', v_charge.energy_available,
    'perDay', v_capacity,
    'usedToday', v_capacity - v_charge.energy_available,
    'day', TO_CHAR(v_charge.server_now AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
    'refillsAt', v_next_recovery,
    'committed', v_charge.energy_committed,
    'commitmentMultiplierBps', v_charge.commitment_multiplier_bps,
    'energyAvailableBefore', v_charge.energy_available_before,
    'energyRecoveredAtStart', v_charge.energy_recovered,
    'visible', COALESCE(p_energy_visible, FALSE)
  );

  v_manifest := p_manifest_base
    || jsonb_build_object(
         'sessionId', p_session_id,
         'energy', v_energy,
         'charge', v_energy
       );

  IF v_charge.clan_battle_id IS NOT NULL
     AND v_charge.clan_id IS NOT NULL
     AND v_charge.clan_battle_ends_at IS NOT NULL THEN
    v_manifest := v_manifest || jsonb_build_object(
      'clanBattle', jsonb_build_object(
        'eligible', TRUE,
        'battleId', v_charge.clan_battle_id,
        'clanId', v_charge.clan_id,
        'endsAt', v_charge.clan_battle_ends_at,
        'fifthBestToBeat', v_charge.clan_fifth_threshold
      )
    );
  END IF;

  UPDATE game_sessions gs
     SET start_manifest = v_manifest,
         continuity_phase = 'prepared'
   WHERE gs.id = p_session_id
     AND gs.player_id = p_player_id
     AND gs.ended_at IS NULL
     AND gs.end_reason IS NULL
     AND gs.start_manifest IS NULL
     AND gs.continuity_phase = 'preparing';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_start_finalize_race';
  END IF;

  RETURN v_manifest;
END;
$$;

REVOKE ALL ON FUNCTION finalize_run_continuity_start(
  UUID, UUID, UUID, TEXT, JSONB, BOOLEAN, INTEGER, BOOLEAN, INTEGER, INTEGER,
  INTEGER[], TIMESTAMPTZ, INTEGER, INTEGER, INTEGER
) FROM PUBLIC;
REVOKE ALL ON FUNCTION finalize_run_continuity_start(
  UUID, UUID, UUID, TEXT, JSONB, BOOLEAN, INTEGER, BOOLEAN, INTEGER, INTEGER,
  INTEGER[], TIMESTAMPTZ, INTEGER, INTEGER, INTEGER
) FROM anon;
REVOKE ALL ON FUNCTION finalize_run_continuity_start(
  UUID, UUID, UUID, TEXT, JSONB, BOOLEAN, INTEGER, BOOLEAN, INTEGER, INTEGER,
  INTEGER[], TIMESTAMPTZ, INTEGER, INTEGER, INTEGER
) FROM authenticated;
GRANT EXECUTE ON FUNCTION finalize_run_continuity_start(
  UUID, UUID, UUID, TEXT, JSONB, BOOLEAN, INTEGER, BOOLEAN, INTEGER, INTEGER,
  INTEGER[], TIMESTAMPTZ, INTEGER, INTEGER, INTEGER
) TO service_role;

CREATE OR REPLACE FUNCTION activate_run_continuity(
  p_player_id UUID,
  p_session_id UUID,
  p_lease_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
BEGIN
  IF p_lease_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_run_lease';
  END IF;
  SELECT gs.* INTO v_session
    FROM game_sessions gs
   WHERE gs.id = p_session_id
     AND gs.player_id = p_player_id
   FOR UPDATE;

  IF NOT FOUND OR v_session.ended_at IS NOT NULL OR v_session.end_reason IS NOT NULL THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;
  IF v_session.start_manifest IS NULL
     OR v_session.continuity_phase NOT IN ('prepared', 'active') THEN
    RAISE EXCEPTION 'run_not_prepared';
  END IF;

  IF v_session.continuity_phase = 'prepared' THEN
    UPDATE game_sessions
       SET continuity_phase = 'active',
           continuity_activated_at = NOW(),
           continuity_lease_hash = p_lease_hash,
           continuity_lease_epoch = 1,
           continuity_lease_issued_at = NOW()
     WHERE id = p_session_id;
  ELSIF v_session.continuity_checkpoint IS NULL THEN
    -- The activation response may have disappeared before the client could
    -- save checkpoint 1. A retry rotates the empty-run lease; no physics state
    -- exists to fork yet, and the newest response becomes the sole holder.
    UPDATE game_sessions
       SET continuity_lease_hash = p_lease_hash,
           continuity_lease_epoch = continuity_lease_epoch + 1,
           continuity_lease_issued_at = NOW()
     WHERE id = p_session_id;
  ELSIF v_session.continuity_lease_hash IS DISTINCT FROM p_lease_hash THEN
    RAISE EXCEPTION 'run_lease_conflict';
  END IF;

  SELECT gs.* INTO STRICT v_session
    FROM game_sessions gs
   WHERE gs.id = p_session_id;

  RETURN jsonb_build_object(
    'id', v_session.id,
    'start_request_id', v_session.start_request_id,
    'start_request_fingerprint', v_session.start_request_fingerprint,
    'start_manifest', v_session.start_manifest,
    'continuity_phase', v_session.continuity_phase,
    'continuity_activated_at', v_session.continuity_activated_at,
    'continuity_checkpoint', v_session.continuity_checkpoint,
    'continuity_checkpoint_revision', v_session.continuity_checkpoint_revision,
    'continuity_checkpoint_saved_at', v_session.continuity_checkpoint_saved_at,
    'continuity_checkpoint_digest', v_session.continuity_checkpoint_digest,
    'continuity_lease_epoch', v_session.continuity_lease_epoch,
    'started_at', v_session.started_at,
    'server_started_at', v_session.server_started_at,
    'energy_committed', v_session.energy_committed
  );
END;
$$;

REVOKE ALL ON FUNCTION activate_run_continuity(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION activate_run_continuity(UUID, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION activate_run_continuity(UUID, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION activate_run_continuity(UUID, UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION resume_run_continuity(
  p_player_id UUID,
  p_session_id UUID,
  p_lease_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session game_sessions%ROWTYPE;
BEGIN
  IF p_lease_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_run_lease';
  END IF;
  SELECT * INTO v_session
    FROM game_sessions
   WHERE id = p_session_id
     AND player_id = p_player_id
   FOR UPDATE;
  IF NOT FOUND OR v_session.ended_at IS NOT NULL OR v_session.end_reason IS NOT NULL THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;
  IF v_session.continuity_phase IS DISTINCT FROM 'active'
     OR v_session.continuity_checkpoint IS NULL THEN
    RAISE EXCEPTION 'run_not_resumable';
  END IF;

  UPDATE game_sessions
     SET continuity_lease_hash = p_lease_hash,
         continuity_lease_epoch = continuity_lease_epoch + 1,
         continuity_lease_issued_at = NOW()
   WHERE id = p_session_id
   RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'id', v_session.id,
    'start_manifest', v_session.start_manifest,
    'continuity_phase', v_session.continuity_phase,
    'continuity_activated_at', v_session.continuity_activated_at,
    'continuity_checkpoint', v_session.continuity_checkpoint,
    'continuity_checkpoint_revision', v_session.continuity_checkpoint_revision,
    'continuity_checkpoint_saved_at', v_session.continuity_checkpoint_saved_at,
    'continuity_checkpoint_digest', v_session.continuity_checkpoint_digest,
    'continuity_lease_epoch', v_session.continuity_lease_epoch,
    'started_at', v_session.started_at,
    'server_started_at', v_session.server_started_at,
    'energy_committed', v_session.energy_committed
  );
END;
$$;

REVOKE ALL ON FUNCTION resume_run_continuity(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION resume_run_continuity(UUID, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION resume_run_continuity(UUID, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION resume_run_continuity(UUID, UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION save_run_continuity_checkpoint(
  p_player_id UUID,
  p_session_id UUID,
  p_expected_revision INTEGER,
  p_checkpoint JSONB,
  p_checkpoint_digest TEXT,
  p_lease_hash TEXT,
  p_max_bytes INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session game_sessions%ROWTYPE;
  v_max_bytes INTEGER := GREATEST(65536, LEAST(COALESCE(p_max_bytes, 1048576), 1048576));
BEGIN
  IF p_expected_revision < 0
     OR p_checkpoint IS NULL
     OR jsonb_typeof(p_checkpoint) <> 'object'
     OR octet_length(p_checkpoint::TEXT) > v_max_bytes
     OR p_checkpoint_digest !~ '^[0-9a-f]{64}$'
     OR p_lease_hash !~ '^[0-9a-f]{64}$'
     OR (p_checkpoint->>'version') IS DISTINCT FROM '1'
     OR (p_checkpoint->>'engineVersion') IS DISTINCT FROM 'snake-engine-v1'
     OR jsonb_typeof(p_checkpoint->'config') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_checkpoint->'state') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_checkpoint->'privateState') IS DISTINCT FROM 'object'
     OR (p_checkpoint->'state'->>'isPlaying') IS DISTINCT FROM 'true'
     OR (p_checkpoint->'state'->>'isGameOver') IS DISTINCT FROM 'false'
     OR (p_checkpoint->'state'->>'isDeathSequence') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'invalid_checkpoint';
  END IF;

  SELECT * INTO v_session
    FROM game_sessions
   WHERE id = p_session_id
     AND player_id = p_player_id
   FOR UPDATE;

  IF NOT FOUND OR v_session.ended_at IS NOT NULL OR v_session.end_reason IS NOT NULL THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;
  IF v_session.continuity_phase IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'run_not_active';
  END IF;
  IF v_session.continuity_lease_hash IS DISTINCT FROM p_lease_hash THEN
    RAISE EXCEPTION 'run_lease_conflict';
  END IF;

  -- A lost response may retry the exact proposal. Return the existing receipt
  -- without advancing the revision or rewriting its timestamp.
  IF v_session.continuity_checkpoint_revision = p_expected_revision + 1
     AND v_session.continuity_checkpoint_digest = p_checkpoint_digest THEN
    RETURN jsonb_build_object(
      'revision', v_session.continuity_checkpoint_revision,
      'savedAt', v_session.continuity_checkpoint_saved_at,
      'digest', v_session.continuity_checkpoint_digest
    );
  END IF;

  IF v_session.continuity_checkpoint_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'checkpoint_revision_conflict';
  END IF;

  UPDATE game_sessions
     SET continuity_checkpoint = p_checkpoint,
         continuity_checkpoint_revision = continuity_checkpoint_revision + 1,
         continuity_checkpoint_saved_at = NOW(),
         continuity_checkpoint_digest = p_checkpoint_digest
   WHERE id = p_session_id
   RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'revision', v_session.continuity_checkpoint_revision,
    'savedAt', v_session.continuity_checkpoint_saved_at,
    'digest', v_session.continuity_checkpoint_digest
  );
END;
$$;

REVOKE ALL ON FUNCTION save_run_continuity_checkpoint(
  UUID, UUID, INTEGER, JSONB, TEXT, TEXT, INTEGER
) FROM PUBLIC;
REVOKE ALL ON FUNCTION save_run_continuity_checkpoint(
  UUID, UUID, INTEGER, JSONB, TEXT, TEXT, INTEGER
) FROM anon;
REVOKE ALL ON FUNCTION save_run_continuity_checkpoint(
  UUID, UUID, INTEGER, JSONB, TEXT, TEXT, INTEGER
) FROM authenticated;
GRANT EXECUTE ON FUNCTION save_run_continuity_checkpoint(
  UUID, UUID, INTEGER, JSONB, TEXT, TEXT, INTEGER
) TO service_role;

COMMIT;
