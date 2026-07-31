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
  ADD COLUMN continuity_start_intent JSONB,
  ADD COLUMN start_manifest JSONB,
  ADD COLUMN start_manifest_draft JSONB,
  ADD COLUMN continuity_energy_commitment SMALLINT,
  ADD COLUMN continuity_exempt BOOLEAN,
  ADD COLUMN continuity_energy_visible BOOLEAN,
  ADD COLUMN simulation_seed UUID,
  ADD COLUMN simulation_version SMALLINT,
  ADD COLUMN simulation_rules_version TEXT,
  ADD COLUMN continuity_phase TEXT,
  ADD COLUMN continuity_activated_at TIMESTAMPTZ,
  ADD COLUMN continuity_checkpoint JSONB,
  ADD COLUMN continuity_checkpoint_revision INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN continuity_checkpoint_saved_at TIMESTAMPTZ,
  ADD COLUMN continuity_checkpoint_digest TEXT,
  ADD COLUMN continuity_lease_hash TEXT,
  ADD COLUMN continuity_lease_epoch INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN continuity_lease_issued_at TIMESTAMPTZ,
  ADD COLUMN continuity_terminal_facts JSONB,
  ADD COLUMN continuity_terminal_digest TEXT,
  ADD COLUMN continuity_terminal_at TIMESTAMPTZ;

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
  ADD CONSTRAINT game_sessions_start_intent_shape
    CHECK (
      continuity_start_intent IS NULL
      OR (
        jsonb_typeof(continuity_start_intent) = 'object'
        AND octet_length(continuity_start_intent::TEXT) <= 4096
        AND continuity_start_intent->>'v' = '1'
        AND continuity_start_intent->>'startRequestId' = start_request_id::TEXT
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
      OR continuity_phase IN ('preparing', 'prepared', 'active', 'terminal')
    ),
  ADD CONSTRAINT game_sessions_continuity_checkpoint_shape
    CHECK (
      (continuity_phase NOT IN ('active', 'terminal')
       AND continuity_checkpoint IS NULL
       AND continuity_checkpoint_revision = 0
       AND continuity_checkpoint_saved_at IS NULL
       AND continuity_checkpoint_digest IS NULL)
      OR
      (continuity_phase IN ('active', 'terminal')
       AND jsonb_typeof(continuity_checkpoint) = 'object'
       AND octet_length(continuity_checkpoint::TEXT) <= 1048576
       AND continuity_checkpoint_revision > 0
       AND continuity_checkpoint_saved_at IS NOT NULL
       AND continuity_checkpoint_digest ~ '^[0-9a-f]{64}$')
    ),
  ADD CONSTRAINT game_sessions_continuity_lease_shape
    CHECK (
      (continuity_phase NOT IN ('active', 'terminal')
       AND continuity_lease_hash IS NULL
       AND continuity_lease_epoch = 0
       AND continuity_lease_issued_at IS NULL)
      OR
      (continuity_phase IN ('active', 'terminal')
       AND continuity_lease_hash ~ '^[0-9a-f]{64}$'
       AND continuity_lease_epoch > 0
       AND continuity_lease_issued_at IS NOT NULL)
    ),
  ADD CONSTRAINT game_sessions_continuity_terminal_shape
    CHECK (
      (continuity_phase IS DISTINCT FROM 'terminal'
       AND continuity_terminal_facts IS NULL
       AND continuity_terminal_digest IS NULL
       AND continuity_terminal_at IS NULL)
      OR
      (continuity_phase = 'terminal'
       AND jsonb_typeof(continuity_terminal_facts) = 'object'
       AND octet_length(continuity_terminal_facts::TEXT) <= 262144
       AND continuity_terminal_digest ~ '^[0-9a-f]{64}$'
       AND continuity_terminal_at IS NOT NULL)
    ),
  ADD CONSTRAINT game_sessions_simulation_version_valid
    CHECK (
      (simulation_seed IS NULL
       AND simulation_version IS NULL
       AND simulation_rules_version IS NULL)
      OR
      (simulation_seed IS NOT NULL
       AND simulation_version = 1
       AND simulation_rules_version ~ '^snake-rules-[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+$')
    ),
  ADD CONSTRAINT game_sessions_continuity_shape
    CHECK (
      (continuity_phase IS NULL
       AND start_request_id IS NULL
       AND continuity_start_intent IS NULL
       AND start_manifest IS NULL
       AND start_manifest_draft IS NULL
       AND simulation_seed IS NULL
       AND simulation_version IS NULL
       AND simulation_rules_version IS NULL
       AND continuity_activated_at IS NULL)
      OR
      (continuity_phase = 'preparing'
       AND start_request_id IS NOT NULL
       AND continuity_start_intent IS NOT NULL
       AND start_manifest IS NULL
       AND simulation_seed IS NOT NULL
       AND simulation_version = 1
       AND simulation_rules_version IS NOT NULL
       AND continuity_activated_at IS NULL)
      OR
      (continuity_phase = 'prepared'
       AND start_request_id IS NOT NULL
       AND continuity_start_intent IS NOT NULL
       AND start_manifest IS NOT NULL
       AND start_manifest_draft IS NOT NULL
       AND simulation_seed IS NOT NULL
       AND simulation_version = 1
       AND simulation_rules_version IS NOT NULL
       AND continuity_activated_at IS NULL)
      OR
      (continuity_phase = 'active'
       AND start_request_id IS NOT NULL
       AND continuity_start_intent IS NOT NULL
       AND start_manifest IS NOT NULL
       AND start_manifest_draft IS NOT NULL
       AND simulation_seed IS NOT NULL
       AND simulation_version = 1
       AND simulation_rules_version IS NOT NULL
       AND continuity_checkpoint IS NOT NULL
       AND continuity_checkpoint_revision > 0
       AND continuity_activated_at IS NOT NULL)
      OR
      (continuity_phase = 'terminal'
       AND start_request_id IS NOT NULL
       AND continuity_start_intent IS NOT NULL
       AND start_manifest IS NOT NULL
       AND start_manifest_draft IS NOT NULL
       AND simulation_seed IS NOT NULL
       AND simulation_version = 1
       AND simulation_rules_version IS NOT NULL
       AND continuity_checkpoint IS NOT NULL
       AND continuity_checkpoint_revision > 0
       AND continuity_activated_at IS NOT NULL
       AND continuity_terminal_facts IS NOT NULL)
    );

COMMENT ON COLUMN game_sessions.start_request_id IS
  'Client-generated UUID naming one deliberate start intent. Server-unique per player and immutable; retries return this session instead of spending again.';
COMMENT ON COLUMN game_sessions.start_request_fingerprint IS
  'SHA-256 of the normalized player-selected start intent. Same id with a different fingerprint is rejected.';
COMMENT ON COLUMN game_sessions.continuity_start_intent IS
  'Immutable normalized launch choices used only to retry a zero-spend preparing shell after reload.';
COMMENT ON COLUMN game_sessions.start_manifest IS
  'Immutable, client-safe server start response. Stored in the same transaction that commits Energy; never browser-persisted.';
COMMENT ON COLUMN game_sessions.start_manifest_draft IS
  'Server-only client-safe manifest base staged before Energy finalization. Lets the same start intent recover a transient pre-commit failure without trusting the browser.';
COMMENT ON COLUMN game_sessions.simulation_seed IS
  'Server-issued seed for the complete deterministic client simulation. Immutable and domain-separated from the genome offer seed.';
COMMENT ON COLUMN game_sessions.simulation_version IS
  'Version of the deterministic simulation contract used by this run.';
COMMENT ON COLUMN game_sessions.simulation_rules_version IS
  'Immutable rules/content version required to interpret and resume the deterministic simulation safely.';
COMMENT ON COLUMN game_sessions.continuity_phase IS
  'preparing before atomic Energy+manifest finalization, prepared before first input, active after activation, terminal once replay-derived outcome evidence is durable.';
COMMENT ON COLUMN game_sessions.continuity_checkpoint IS
  'Latest service-accepted live simulation checkpoint. Continuation-only; payout remains server-recomputed from immutable session facts.';
COMMENT ON COLUMN game_sessions.continuity_checkpoint_revision IS
  'Monotonic compare-and-swap revision for idempotent checkpoint writes.';
COMMENT ON COLUMN game_sessions.continuity_lease_hash IS
  'SHA-256 of the current in-memory resume lease. Rotated at activation/resume so an older tab cannot fork or settle the run.';
COMMENT ON COLUMN game_sessions.continuity_terminal_facts IS
  'Service-derived immutable terminal facts replayed from the last canonical checkpoint. Never client-authored payout authority.';

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

-- The partial index above serializes two continuity writers, but a stale
-- application artifact could otherwise insert a legacy-shaped open row beside
-- a continuity run.  Serialize every future open insert per player and refuse
-- the second row without rewriting historical sessions.
CREATE OR REPLACE FUNCTION guard_one_open_game_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.ended_at IS NOT NULL OR NEW.end_reason IS NOT NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.player_id::TEXT, 0));
  IF EXISTS (
    SELECT 1
      FROM game_sessions gs
     WHERE gs.player_id = NEW.player_id
       AND gs.ended_at IS NULL
       AND gs.end_reason IS NULL
       AND gs.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'active_run_exists',
      ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER game_sessions_one_open_insert
BEFORE INSERT ON game_sessions
FOR EACH ROW EXECUTE FUNCTION guard_one_open_game_session();

CREATE OR REPLACE FUNCTION protect_run_continuity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.start_request_id IS NOT NULL AND (
       NEW.start_request_id IS DISTINCT FROM OLD.start_request_id
    OR NEW.start_request_fingerprint IS DISTINCT FROM OLD.start_request_fingerprint
    OR NEW.continuity_start_intent IS DISTINCT FROM OLD.continuity_start_intent
    OR NEW.simulation_seed IS DISTINCT FROM OLD.simulation_seed
    OR NEW.simulation_version IS DISTINCT FROM OLD.simulation_version
    OR NEW.simulation_rules_version IS DISTINCT FROM OLD.simulation_rules_version
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

  IF OLD.continuity_terminal_facts IS NOT NULL AND (
       NEW.continuity_terminal_facts IS DISTINCT FROM OLD.continuity_terminal_facts
    OR NEW.continuity_terminal_digest IS DISTINCT FROM OLD.continuity_terminal_digest
    OR NEW.continuity_terminal_at IS DISTINCT FROM OLD.continuity_terminal_at
  ) THEN
    RAISE EXCEPTION 'run_continuity_terminal_immutable';
  END IF;

  IF OLD.continuity_phase = 'prepared'
     AND NEW.continuity_phase IS DISTINCT FROM 'prepared'
     AND NEW.continuity_phase IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'run_continuity_phase_cannot_reverse';
  END IF;
  IF OLD.continuity_phase = 'active'
     AND NEW.continuity_phase IS DISTINCT FROM 'active'
     AND NEW.continuity_phase IS DISTINCT FROM 'terminal' THEN
    RAISE EXCEPTION 'run_continuity_phase_cannot_reverse';
  END IF;
  IF OLD.continuity_phase = 'terminal'
     AND NEW.continuity_phase IS DISTINCT FROM 'terminal' THEN
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
  p_checkpoint JSONB,
  p_checkpoint_digest TEXT,
  p_lease_hash TEXT,
  p_rules_version TEXT,
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
  IF p_lease_hash !~ '^[0-9a-f]{64}$'
     OR p_checkpoint_digest !~ '^[0-9a-f]{64}$'
     OR p_checkpoint IS NULL
     OR jsonb_typeof(p_checkpoint) <> 'object'
     OR octet_length(p_checkpoint::TEXT) > v_max_bytes
     OR (p_checkpoint->>'version') IS DISTINCT FROM '1'
     OR (p_checkpoint->>'engineVersion') IS DISTINCT FROM 'snake-engine-v1'
     OR (p_checkpoint->>'rulesVersion') IS DISTINCT FROM p_rules_version
     OR jsonb_typeof(p_checkpoint->'config') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_checkpoint->'state') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_checkpoint->'privateState') IS DISTINCT FROM 'object'
     OR (p_checkpoint->'state'->>'isPlaying') IS DISTINCT FROM 'true'
     OR (p_checkpoint->'state'->>'isGameOver') IS DISTINCT FROM 'false'
     OR (p_checkpoint->'state'->>'isDeathSequence') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'invalid_checkpoint';
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
     OR v_session.continuity_phase IS DISTINCT FROM 'prepared' THEN
    RAISE EXCEPTION 'run_not_prepared';
  END IF;
  IF v_session.simulation_rules_version IS DISTINCT FROM p_rules_version THEN
    RAISE EXCEPTION 'run_rules_version_mismatch';
  END IF;

  -- The opening snapshot and exclusive lease become authoritative together.
  -- There is no observable active/no-checkpoint state, including when the HTTP
  -- response disappears after commit.
  UPDATE game_sessions
     SET continuity_phase = 'active',
         continuity_activated_at = NOW(),
         continuity_checkpoint = p_checkpoint,
         continuity_checkpoint_revision = 1,
         continuity_checkpoint_saved_at = NOW(),
         continuity_checkpoint_digest = p_checkpoint_digest,
         continuity_lease_hash = p_lease_hash,
         continuity_lease_epoch = 1,
         continuity_lease_issued_at = NOW()
   WHERE id = p_session_id
     AND continuity_phase = 'prepared'
   RETURNING * INTO v_session;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_activation_race';
  END IF;

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
    'simulation_rules_version', v_session.simulation_rules_version,
    'started_at', v_session.started_at,
    'server_started_at', v_session.server_started_at,
    'energy_committed', v_session.energy_committed
  );
END;
$$;

REVOKE ALL ON FUNCTION activate_run_continuity(UUID, UUID, JSONB, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION activate_run_continuity(UUID, UUID, JSONB, TEXT, TEXT, TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION activate_run_continuity(UUID, UUID, JSONB, TEXT, TEXT, TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION activate_run_continuity(UUID, UUID, JSONB, TEXT, TEXT, TEXT, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION resume_run_continuity(
  p_player_id UUID,
  p_session_id UUID,
  p_lease_hash TEXT,
  p_rules_version TEXT
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
  IF v_session.simulation_rules_version IS DISTINCT FROM p_rules_version
     OR (v_session.continuity_checkpoint->>'rulesVersion') IS DISTINCT FROM p_rules_version THEN
    RAISE EXCEPTION 'run_rules_version_mismatch';
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
    'simulation_rules_version', v_session.simulation_rules_version,
    'started_at', v_session.started_at,
    'server_started_at', v_session.server_started_at,
    'energy_committed', v_session.energy_committed
  );
END;
$$;

REVOKE ALL ON FUNCTION resume_run_continuity(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION resume_run_continuity(UUID, UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION resume_run_continuity(UUID, UUID, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION resume_run_continuity(UUID, UUID, TEXT, TEXT) TO service_role;

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
     OR (p_checkpoint->>'rulesVersion') IS NULL
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
  IF (p_checkpoint->>'rulesVersion') IS DISTINCT FROM v_session.simulation_rules_version THEN
    RAISE EXCEPTION 'run_rules_version_mismatch';
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

-- The browser may disappear between collision/bank and the full progression
-- fold. First lock the replay-derived terminal facts under the active lease;
-- from this commit onward the run cannot resume, checkpoint, or abandon.
CREATE OR REPLACE FUNCTION stage_run_continuity_terminal(
  p_player_id UUID,
  p_session_id UUID,
  p_expected_revision INTEGER,
  p_lease_hash TEXT,
  p_terminal_facts JSONB,
  p_terminal_digest TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session game_sessions%ROWTYPE;
  v_inserted BOOLEAN := FALSE;
BEGIN
  IF p_expected_revision < 1
     OR p_lease_hash !~ '^[0-9a-f]{64}$'
     OR p_terminal_digest !~ '^[0-9a-f]{64}$'
     OR p_terminal_facts IS NULL
     OR jsonb_typeof(p_terminal_facts) <> 'object'
     OR octet_length(p_terminal_facts::TEXT) > 262144 THEN
    RAISE EXCEPTION 'invalid_terminal_intent';
  END IF;

  SELECT gs.* INTO v_session
    FROM game_sessions gs
   WHERE gs.id = p_session_id
     AND gs.player_id = p_player_id
   FOR UPDATE;

  IF NOT FOUND OR v_session.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;
  IF v_session.continuity_lease_hash IS DISTINCT FROM p_lease_hash THEN
    RAISE EXCEPTION 'run_lease_conflict';
  END IF;
  IF v_session.continuity_checkpoint_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'checkpoint_revision_conflict';
  END IF;

  IF v_session.continuity_phase = 'terminal' THEN
    IF v_session.continuity_terminal_digest IS DISTINCT FROM p_terminal_digest
       OR v_session.continuity_terminal_facts IS DISTINCT FROM p_terminal_facts THEN
      RAISE EXCEPTION 'terminal_intent_conflict';
    END IF;
  ELSIF v_session.continuity_phase = 'active'
        AND v_session.end_reason IS NULL THEN
    UPDATE game_sessions gs
       SET continuity_phase = 'terminal',
           continuity_terminal_facts = p_terminal_facts,
           continuity_terminal_digest = p_terminal_digest,
           continuity_terminal_at = clock_timestamp()
     WHERE gs.id = p_session_id
     RETURNING gs.* INTO v_session;
    v_inserted := TRUE;
  ELSE
    RAISE EXCEPTION 'run_not_terminalizable';
  END IF;

  RETURN jsonb_build_object(
    'accepted', TRUE,
    'inserted', v_inserted,
    'sessionId', v_session.id,
    'terminalAt', v_session.continuity_terminal_at,
    'digest', v_session.continuity_terminal_digest
  );
END;
$$;

REVOKE ALL ON FUNCTION stage_run_continuity_terminal(
  UUID, UUID, INTEGER, TEXT, JSONB, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION stage_run_continuity_terminal(
  UUID, UUID, INTEGER, TEXT, JSONB, TEXT
) TO service_role;

-- Terminal transitions share the checkpoint lease's row lock. The HTTP
-- handler performs expensive validation first, so an application-only lease
-- check is a TOCTOU bug: another tab can resume during that work. This wrapper
-- holds the row lock while the immutable pending envelope is staged.
CREATE OR REPLACE FUNCTION stage_continuity_game_session_end(
  p_user_id UUID,
  p_player_id UUID,
  p_session_id UUID,
  p_lease_hash TEXT,
  p_envelope JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session game_sessions%ROWTYPE;
  v_pending pending_game_session_ends%ROWTYPE;
BEGIN
  IF p_lease_hash IS NOT NULL AND p_lease_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'run_lease_conflict';
  END IF;

  SELECT gs.* INTO v_session
    FROM game_sessions gs
   WHERE gs.id = p_session_id
     AND gs.player_id = p_player_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;
  IF v_session.ended_at IS NOT NULL
     OR (v_session.end_reason IS NOT NULL
         AND v_session.end_reason IS DISTINCT FROM 'completed')
     OR v_session.continuity_phase NOT IN ('active', 'terminal')
     OR v_session.continuity_checkpoint IS NULL
     OR v_session.continuity_checkpoint_revision < 1 THEN
    RAISE EXCEPTION 'run_not_terminalizable';
  END IF;
  IF v_session.continuity_phase = 'active' THEN
    IF p_lease_hash IS NULL OR
       v_session.continuity_lease_hash IS DISTINCT FROM p_lease_hash THEN
      RAISE EXCEPTION 'run_lease_conflict';
    END IF;
  ELSIF p_lease_hash IS NOT NULL AND
        v_session.continuity_lease_hash IS DISTINCT FROM p_lease_hash THEN
    RAISE EXCEPTION 'run_lease_conflict';
  END IF;

  -- The first store changes the row to `completed` before adoption. A second
  -- request that was already waiting on this lock must receive the exact
  -- durable receipt instead of a spurious 409. `completed` without the
  -- matching immutable envelope is an invariant failure, never permission to
  -- manufacture a replacement terminal claim.
  IF v_session.end_reason = 'completed' THEN
    SELECT pending.* INTO v_pending
      FROM pending_game_session_ends pending
     WHERE pending.session_id = p_session_id
     FOR UPDATE;
    IF NOT FOUND
       OR v_pending.user_id IS DISTINCT FROM p_user_id
       OR v_pending.player_id IS DISTINCT FROM p_player_id
       OR v_pending.envelope IS DISTINCT FROM p_envelope THEN
      RAISE EXCEPTION 'run_not_terminalizable';
    END IF;
    RETURN jsonb_build_object(
      'accepted', TRUE,
      'inserted', FALSE,
      'sessionId', p_session_id,
      'state', v_pending.state,
      'receivedAt', v_pending.received_at
    );
  END IF;

  -- The inner function locks this same row again in this transaction. The
  -- outer lock remains held, making lease validation and the pending terminal
  -- transition indivisible to resume and abandon.
  RETURN store_pending_game_session_end(
    p_user_id, p_player_id, p_session_id, p_envelope
  );
END;
$$;

REVOKE ALL ON FUNCTION stage_continuity_game_session_end(
  UUID, UUID, UUID, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION stage_continuity_game_session_end(
  UUID, UUID, UUID, TEXT, JSONB
) TO service_role;

-- Rewardless practice does not enter the durable Career queue, but it still
-- needs the same lease/terminal atomicity.
CREATE OR REPLACE FUNCTION complete_free_run_continuity(
  p_player_id UUID,
  p_session_id UUID,
  p_lease_hash TEXT,
  p_facts JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session game_sessions%ROWTYPE;
BEGIN
  IF (p_lease_hash IS NOT NULL AND p_lease_hash !~ '^[0-9a-f]{64}$')
     OR p_facts IS NULL
     OR jsonb_typeof(p_facts) <> 'object'
     OR octet_length(p_facts::TEXT) > 65536
     OR (p_facts->>'score') !~ '^[0-9]+$'
     OR (p_facts->>'dnaEarned') !~ '^0$'
     OR (p_facts->>'yieldDna') !~ '^[0-9]+$'
     OR (p_facts->>'durationSeconds') !~ '^[0-9]+$'
     OR (p_facts->>'foodsCollected') !~ '^[0-9]+$'
     OR jsonb_typeof(p_facts->'died') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_facts->'victory') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_facts->'extracted') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_facts->'validated') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_facts->'endedAt') IS DISTINCT FROM 'string'
     OR (p_facts->>'endedAt')::TIMESTAMPTZ > clock_timestamp() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'invalid_free_run_facts';
  END IF;

  SELECT gs.* INTO v_session
    FROM game_sessions gs
   WHERE gs.id = p_session_id
     AND gs.player_id = p_player_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;
  IF v_session.ended_at IS NOT NULL OR v_session.end_reason IS NOT NULL
     OR v_session.continuity_phase NOT IN ('active', 'terminal')
     OR v_session.continuity_checkpoint IS NULL
     OR v_session.continuity_checkpoint_revision < 1
     OR NOT COALESCE(v_session.is_free_play, FALSE) THEN
    RAISE EXCEPTION 'run_not_terminalizable';
  END IF;
  IF v_session.continuity_phase = 'active' THEN
    IF p_lease_hash IS NULL OR
       v_session.continuity_lease_hash IS DISTINCT FROM p_lease_hash THEN
      RAISE EXCEPTION 'run_lease_conflict';
    END IF;
  ELSIF p_lease_hash IS NOT NULL AND
        v_session.continuity_lease_hash IS DISTINCT FROM p_lease_hash THEN
    RAISE EXCEPTION 'run_lease_conflict';
  END IF;

  UPDATE game_sessions gs
     SET score = (p_facts->>'score')::INTEGER,
         dna_earned = 0,
         yield_dna = (p_facts->>'yieldDna')::INTEGER,
         duration_seconds = (p_facts->>'durationSeconds')::INTEGER,
         died = (p_facts->>'died')::BOOLEAN,
         victory = (p_facts->>'victory')::BOOLEAN,
         extracted = (p_facts->>'extracted')::BOOLEAN,
         ended_at = (p_facts->>'endedAt')::TIMESTAMPTZ,
         validated = (p_facts->>'validated')::BOOLEAN,
         validation_errors = NULLIF(p_facts->'validationErrors', 'null'::JSONB),
         foods_collected = (p_facts->>'foodsCollected')::INTEGER,
         mutations = NULLIF(p_facts->'mutations', 'null'::JSONB),
         genome = NULLIF(p_facts->'genome', 'null'::JSONB),
         end_reason = 'completed'
   WHERE gs.id = p_session_id
   RETURNING gs.* INTO v_session;

  RETURN jsonb_build_object(
    'accepted', TRUE,
    'sessionId', v_session.id,
    'endReason', v_session.end_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION complete_free_run_continuity(UUID, UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_free_run_continuity(UUID, UUID, TEXT, JSONB)
  TO service_role;

-- Explicit abandonment is the only player-requested zero-reward terminal
-- transition. Disconnection, reload and tab closure retain the open row.
CREATE OR REPLACE FUNCTION abandon_run_continuity(
  p_player_id UUID,
  p_session_id UUID,
  p_lease_hash TEXT,
  p_rules_version TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session game_sessions%ROWTYPE;
BEGIN
  SELECT gs.* INTO v_session
    FROM game_sessions gs
   WHERE gs.id = p_session_id
     AND gs.player_id = p_player_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;
  IF v_session.ended_at IS NOT NULL OR v_session.end_reason IS NOT NULL THEN
    RAISE EXCEPTION 'run_not_terminalizable';
  END IF;

  IF v_session.continuity_phase = 'preparing' THEN
    -- The service may stop after inserting the idempotency shell but before
    -- staging its manifest draft. No Energy has moved in `preparing`, so the
    -- player can explicitly release that orphan without a fabricated lease.
    IF v_session.start_manifest IS NOT NULL
       OR v_session.continuity_checkpoint IS NOT NULL
       OR v_session.continuity_checkpoint_revision <> 0
       OR v_session.continuity_lease_hash IS NOT NULL
       OR COALESCE(v_session.energy_committed, 0) <> 0
       OR p_lease_hash IS NOT NULL THEN
      RAISE EXCEPTION 'run_not_terminalizable';
    END IF;
  ELSIF v_session.continuity_phase = 'prepared' THEN
    -- A prepared run has spent Energy but has never moved. Explicitly
    -- abandoning it must not require manufacturing an opening tick or lease.
    IF v_session.continuity_checkpoint IS NOT NULL
       OR v_session.continuity_checkpoint_revision <> 0
       OR v_session.continuity_lease_hash IS NOT NULL
       OR p_lease_hash IS NOT NULL THEN
      RAISE EXCEPTION 'run_not_terminalizable';
    END IF;
  ELSIF v_session.continuity_phase = 'active' THEN
    IF v_session.continuity_checkpoint IS NULL
       OR v_session.continuity_checkpoint_revision < 1 THEN
      RAISE EXCEPTION 'run_not_terminalizable';
    END IF;
    IF v_session.simulation_rules_version IS DISTINCT FROM p_rules_version THEN
      -- This deployment cannot resume an older rules contract. The owner can
      -- still deliberately release it without a fake lease; no other terminal
      -- action or implicit navigation reaches this branch.
      IF p_lease_hash IS NOT NULL THEN
        RAISE EXCEPTION 'run_not_terminalizable';
      END IF;
    ELSIF p_lease_hash !~ '^[0-9a-f]{64}$'
          OR v_session.continuity_lease_hash IS DISTINCT FROM p_lease_hash THEN
      RAISE EXCEPTION 'run_lease_conflict';
    END IF;
  ELSE
    RAISE EXCEPTION 'run_not_terminalizable';
  END IF;

  UPDATE game_sessions gs
     SET ended_at = clock_timestamp(),
         end_reason = 'abandoned'
   WHERE gs.id = p_session_id
   RETURNING gs.* INTO v_session;

  RETURN jsonb_build_object(
    'accepted', TRUE,
    'sessionId', v_session.id,
    'endReason', v_session.end_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION abandon_run_continuity(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION abandon_run_continuity(UUID, UUID, TEXT, TEXT)
  TO service_role;

-- Continuity sessions are durable player state, not stale analytics rows. The
-- legacy sweep remains useful for pre-063 artifacts; continuity rows have no
-- age horizon and require verified completion or explicit abandonment.
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
       AND gs.start_request_id IS NULL
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
  'Closes stale legacy rows only. Continuity runs never age-expire; they require verified completion or explicit abandonment.';

COMMIT;
