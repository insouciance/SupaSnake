-- Migration 059: Energy Commitment and automatic clan Energy Battles
--
-- Owner amendment, 29 July 2026. This replaces the fixed UTC-daily charge
-- envelope with server-time stored Energy (cap 6, one recovery tick/hour) and
-- makes an immutable 0..6 commitment part of every run. A positive commitment
-- automatically snapshots an active clan battle at START. Settlement records
-- the player's best five full-strength Yields; the commitment multiplier never
-- touches Score, Yield, clan score, fixed rewards, unlocks or mastery.

BEGIN;

-- Rule 6 tripwire: this migration may initialise a new pacing balance, but it
-- must not move any existing owned economy or settled-run value downward.
CREATE TEMP TABLE energy_commitment_pre_players ON COMMIT DROP AS
SELECT id, COALESCE(dna, 0) AS dna, COALESCE(total_dna_earned, 0) AS total_dna_earned
FROM players;

CREATE TEMP TABLE energy_commitment_pre_sessions ON COMMIT DROP AS
SELECT id, COALESCE(dna_earned, 0) AS dna_earned, COALESCE(yield_dna, 0) AS yield_dna
FROM game_sessions;

-- -------------------------------------------------------------------------
-- 1. Recovering stored Energy
-- -------------------------------------------------------------------------

ALTER TABLE players ADD COLUMN stored_energy SMALLINT;
ALTER TABLE players ADD COLUMN energy_updated_at TIMESTAMPTZ;

-- Preserve the remaining value of today's old envelope at the cutover. A
-- stale day was full under the old law and therefore starts full here too.
UPDATE players
SET stored_energy = CASE
      WHEN charges_day = (NOW() AT TIME ZONE 'utc')::DATE
        THEN GREATEST(0, 6 - LEAST(COALESCE(charges_used, 0), 6))
      ELSE 6
    END,
    energy_updated_at = NOW();

ALTER TABLE players
  ALTER COLUMN stored_energy SET DEFAULT 6,
  ALTER COLUMN stored_energy SET NOT NULL,
  ALTER COLUMN energy_updated_at SET DEFAULT NOW(),
  ALTER COLUMN energy_updated_at SET NOT NULL,
  -- The live cap is 6 in shared configuration. A wider storage invariant lets
  -- that balance dial move (within the RPC's guarded 1..24 range) without a
  -- destructive schema rewrite.
  ADD CONSTRAINT players_stored_energy_bounds CHECK (stored_energy BETWEEN 0 AND 24);

COMMENT ON COLUMN players.stored_energy IS
  'Recovering Energy Commitment stock. Server-authoritative, cap 6. Energy is never sold, granted, gifted or included in a paid entitlement; recovery is its only source.';
COMMENT ON COLUMN players.energy_updated_at IS
  'Server-time anchor for partial Energy recovery. Whole elapsed ticks are applied lazily; partial progress survives offline and across devices.';
COMMENT ON COLUMN players.charges_day IS
  'HISTORICAL after migration 059. Previous fixed UTC-daily envelope. The new runtime never reads it; the consume_run_charge rollback bridge updates it only as a projection of stored Energy for an emergency old-app rollback.';
COMMENT ON COLUMN players.charges_used IS
  'HISTORICAL after migration 059. Previous fixed UTC-daily usage. The new runtime never reads it; the consume_run_charge rollback bridge updates it only as a projection of stored Energy for an emergency old-app rollback.';

CREATE OR REPLACE FUNCTION read_player_energy(
  p_player_id UUID,
  p_capacity INTEGER DEFAULT 6,
  p_recovery_interval_seconds INTEGER DEFAULT 3600
)
RETURNS TABLE (
  energy_available INTEGER,
  energy_updated_at TIMESTAMPTZ,
  energy_recovered INTEGER,
  server_now TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_capacity INTEGER := GREATEST(1, LEAST(COALESCE(p_capacity, 6), 24));
  v_interval INTEGER := GREATEST(60, COALESCE(p_recovery_interval_seconds, 3600));
  v_energy INTEGER;
  v_anchor TIMESTAMPTZ;
  v_recovered INTEGER := 0;
BEGIN
  SELECT p.stored_energy, p.energy_updated_at
    INTO v_energy, v_anchor
    FROM players p
   WHERE p.id = p_player_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'read_player_energy: player % not found', p_player_id;
  END IF;

  v_energy := LEAST(v_capacity, GREATEST(0, COALESCE(v_energy, v_capacity)));
  v_anchor := CASE
    WHEN v_anchor IS NULL OR v_anchor > v_now THEN v_now
    ELSE v_anchor
  END;

  IF v_energy >= v_capacity THEN
    -- Time above cap is discarded. Spending from full starts a fresh tick.
    v_anchor := v_now;
  ELSE
    v_recovered := LEAST(
      v_capacity - v_energy,
      FLOOR(EXTRACT(EPOCH FROM (v_now - v_anchor)) / v_interval)::INTEGER
    );
    IF v_recovered > 0 THEN
      v_energy := v_energy + v_recovered;
      IF v_energy >= v_capacity THEN
        v_anchor := v_now;
      ELSE
        v_anchor := v_anchor + make_interval(secs => v_recovered * v_interval);
      END IF;
    END IF;
  END IF;

  UPDATE players p
     SET stored_energy = v_energy,
         energy_updated_at = v_anchor
   WHERE p.id = p_player_id;

  RETURN QUERY SELECT v_energy, v_anchor, v_recovered, v_now;
END;
$$;

REVOKE ALL ON FUNCTION read_player_energy(UUID, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION read_player_energy(UUID, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION read_player_energy(UUID, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION read_player_energy(UUID, INTEGER, INTEGER) TO service_role;

-- Deployment is intentionally app-before-schema. The inverse operation -- an
-- emergency application rollback after this migration -- can briefly put the
-- migration-039 caller back in service. Preserve that caller's exact RPC
-- contract, but make it consume one unit from the NEW recovering stock. This
-- prevents the deprecated daily ledger from becoming a second Energy pool.
--
-- The bridge cannot expose multi-E commitments or clan assignment because the
-- old application has no such request contract. It is a safe one-Energy/lean
-- degradation only. The current application never calls this RPC once
-- commit_run_energy exists. Its one-hour interval is the launch default baked
-- into the old signature solely for rollback safety; all current behavior uses
-- the configurable interval passed to the new RPCs.
CREATE OR REPLACE FUNCTION consume_run_charge(
  p_player_id UUID,
  p_charges_per_day INTEGER DEFAULT 6
)
RETURNS TABLE (
  charged BOOLEAN,
  charges_day DATE,
  charges_used INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_today DATE := (NOW() AT TIME ZONE 'utc')::DATE;
  v_capacity INTEGER := GREATEST(1, LEAST(COALESCE(p_charges_per_day, 6), 24));
  v_interval INTEGER := 3600;
  v_energy INTEGER;
  v_anchor TIMESTAMPTZ;
  v_recovered INTEGER := 0;
  v_charged BOOLEAN := FALSE;
  v_projected_used INTEGER;
BEGIN
  SELECT p.stored_energy, p.energy_updated_at
    INTO v_energy, v_anchor
    FROM players p
   WHERE p.id = p_player_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'consume_run_charge: player % not found', p_player_id;
  END IF;

  v_energy := LEAST(v_capacity, GREATEST(0, COALESCE(v_energy, v_capacity)));
  v_anchor := CASE
    WHEN v_anchor IS NULL OR v_anchor > v_now THEN v_now
    ELSE v_anchor
  END;

  IF v_energy >= v_capacity THEN
    v_anchor := v_now;
  ELSE
    v_recovered := LEAST(
      v_capacity - v_energy,
      FLOOR(EXTRACT(EPOCH FROM (v_now - v_anchor)) / v_interval)::INTEGER
    );
    IF v_recovered > 0 THEN
      v_energy := v_energy + v_recovered;
      IF v_energy >= v_capacity THEN
        v_anchor := v_now;
      ELSE
        v_anchor := v_anchor + make_interval(secs => v_recovered * v_interval);
      END IF;
    END IF;
  END IF;

  IF v_energy > 0 THEN
    v_energy := v_energy - 1; -- constitution-allow: owned-row-downward -- committed Energy is consumed at run start
    v_charged := TRUE;
  END IF;

  v_projected_used := v_capacity - v_energy;
  UPDATE players p
     SET stored_energy = v_energy,
         energy_updated_at = v_anchor,
         charges_day = v_today,
         charges_used = v_projected_used
   WHERE p.id = p_player_id;

  RETURN QUERY SELECT v_charged, v_today, v_projected_used;
END;
$$;

COMMENT ON FUNCTION consume_run_charge(UUID, INTEGER) IS
  'Emergency old-app rollback bridge after migration 059. Atomically recovers and consumes one unit from stored Energy, never from the retired daily ledger. Returns the migration-039 result shape; current application code uses commit_run_energy instead.';

REVOKE ALL ON FUNCTION consume_run_charge(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION consume_run_charge(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION consume_run_charge(UUID, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION consume_run_charge(UUID, INTEGER) TO service_role;

-- -------------------------------------------------------------------------
-- 2. Battle cycles and sides
-- -------------------------------------------------------------------------

CREATE TABLE clan_energy_battles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_index BIGINT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  intermission_ends_at TIMESTAMPTZ NOT NULL,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT clan_energy_battle_window CHECK (
    ends_at > starts_at AND intermission_ends_at > ends_at
  )
);

CREATE INDEX idx_clan_energy_battles_cycle ON clan_energy_battles(cycle_index, starts_at);
CREATE INDEX idx_clan_energy_battles_unsettled
  ON clan_energy_battles(ends_at) WHERE settled_at IS NULL;

CREATE TABLE clan_energy_battle_sides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID NOT NULL REFERENCES clan_energy_battles(id) ON DELETE CASCADE,
  cycle_index BIGINT NOT NULL,
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE RESTRICT,
  slot SMALLINT NOT NULL CHECK (slot IN (1, 2)),
  score BIGINT NOT NULL DEFAULT 0 CHECK (score >= 0),
  outcome TEXT NOT NULL DEFAULT 'pending'
    CHECK (outcome IN ('pending', 'victor', 'participant', 'stalemate', 'bye')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (battle_id, slot),
  UNIQUE (battle_id, clan_id),
  UNIQUE (cycle_index, clan_id)
);

CREATE INDEX idx_clan_energy_battle_sides_battle ON clan_energy_battle_sides(battle_id);

-- A player is attached to at most one clan for a cycle. Leaving and joining a
-- second clan cannot redirect attempts or double-score.
CREATE TABLE clan_energy_cycle_memberships (
  cycle_index BIGINT NOT NULL,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE RESTRICT,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cycle_index, player_id)
);

CREATE INDEX idx_clan_energy_cycle_memberships_clan
  ON clan_energy_cycle_memberships(cycle_index, clan_id);

CREATE OR REPLACE FUNCTION ensure_clan_energy_battle(
  p_clan_id UUID,
  p_epoch TIMESTAMPTZ,
  p_active_seconds INTEGER,
  p_intermission_seconds INTEGER
)
RETURNS TABLE (
  battle_id UUID,
  side_id UUID,
  cycle_index BIGINT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  intermission_ends_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_cycle_seconds BIGINT;
  v_cycle BIGINT;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_intermission_end TIMESTAMPTZ;
  v_battle UUID;
  v_side UUID;
  v_slot SMALLINT;
BEGIN
  v_cycle_seconds := GREATEST(1, p_active_seconds) + GREATEST(1, p_intermission_seconds);
  v_cycle := FLOOR(EXTRACT(EPOCH FROM (v_now - p_epoch)) / v_cycle_seconds)::BIGINT;
  v_start := p_epoch + make_interval(secs => (v_cycle * v_cycle_seconds)::DOUBLE PRECISION);
  v_end := v_start + make_interval(secs => GREATEST(1, p_active_seconds));
  v_intermission_end := v_end + make_interval(secs => GREATEST(1, p_intermission_seconds));

  IF v_now < v_start OR v_now >= v_end THEN
    RETURN;
  END IF;

  -- One pairing writer per cycle. This covers lazy creation and simultaneous
  -- starts from different clans without a separate matchmaking queue.
  PERFORM pg_advisory_xact_lock(hashtextextended('energy-battle:' || v_cycle::TEXT, 0));

  SELECT s.battle_id, s.id
    INTO v_battle, v_side
    FROM clan_energy_battle_sides s
   WHERE s.cycle_index = v_cycle AND s.clan_id = p_clan_id;

  IF v_side IS NOT NULL THEN
    RETURN QUERY SELECT v_battle, v_side, v_cycle, v_start, v_end, v_intermission_end;
    RETURN;
  END IF;

  SELECT b.id
    INTO v_battle
    FROM clan_energy_battles b
   WHERE b.cycle_index = v_cycle
     AND (SELECT COUNT(*) FROM clan_energy_battle_sides s WHERE s.battle_id = b.id) = 1
   ORDER BY b.created_at, b.id
   LIMIT 1
   FOR UPDATE;

  IF v_battle IS NULL THEN
    INSERT INTO clan_energy_battles(
      cycle_index, starts_at, ends_at, intermission_ends_at
    ) VALUES (v_cycle, v_start, v_end, v_intermission_end)
    RETURNING id INTO v_battle;
    v_slot := 1;
  ELSE
    v_slot := 2;
  END IF;

  INSERT INTO clan_energy_battle_sides(battle_id, cycle_index, clan_id, slot)
  VALUES (v_battle, v_cycle, p_clan_id, v_slot)
  RETURNING id INTO v_side;

  RETURN QUERY SELECT v_battle, v_side, v_cycle, v_start, v_end, v_intermission_end;
END;
$$;

REVOKE ALL ON FUNCTION ensure_clan_energy_battle(UUID, TIMESTAMPTZ, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION ensure_clan_energy_battle(UUID, TIMESTAMPTZ, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION ensure_clan_energy_battle(UUID, TIMESTAMPTZ, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION ensure_clan_energy_battle(UUID, TIMESTAMPTZ, INTEGER, INTEGER) TO service_role;

-- -------------------------------------------------------------------------
-- 3. Immutable start-time run snapshot
-- -------------------------------------------------------------------------

ALTER TABLE game_sessions
  ADD COLUMN energy_committed SMALLINT NOT NULL DEFAULT 0
    CHECK (energy_committed BETWEEN 0 AND 24),
  ADD COLUMN energy_harvest_multiplier_bps INTEGER NOT NULL DEFAULT 10000
    CHECK (energy_harvest_multiplier_bps BETWEEN 0 AND 200000),
  ADD COLUMN energy_available_before SMALLINT
    CHECK (energy_available_before IS NULL OR energy_available_before BETWEEN 0 AND 24),
  ADD COLUMN energy_recovered_at_start SMALLINT NOT NULL DEFAULT 0
    CHECK (energy_recovered_at_start BETWEEN 0 AND 24),
  ADD COLUMN energy_recovery_anchor_at TIMESTAMPTZ,
  ADD COLUMN energy_commitment_locked_at TIMESTAMPTZ,
  ADD COLUMN clan_energy_battle_id UUID REFERENCES clan_energy_battles(id) ON DELETE SET NULL,
  ADD COLUMN clan_energy_battle_side_id UUID REFERENCES clan_energy_battle_sides(id) ON DELETE SET NULL,
  ADD COLUMN clan_energy_clan_id UUID REFERENCES clans(id) ON DELETE SET NULL,
  ADD COLUMN clan_fifth_threshold_at_start BIGINT NOT NULL DEFAULT 0 CHECK (clan_fifth_threshold_at_start >= 0);

UPDATE game_sessions
SET energy_harvest_multiplier_bps = CASE
      WHEN charge_state = 'lean' THEN 2500
      ELSE 10000
    END
WHERE energy_commitment_locked_at IS NULL;

COMMENT ON COLUMN game_sessions.energy_committed IS
  'Immutable Energy consumed at run start. 0 means exempt or explicit lean run; 1..6 means Energy-funded. Never client-editable after start.';
COMMENT ON COLUMN game_sessions.energy_harvest_multiplier_bps IS
  'Immutable start-time harvest multiplier in basis points. Applies only to credited run DNA, never Score, Yield, fixed rewards, mastery, unlocks or clan score.';
COMMENT ON COLUMN game_sessions.clan_energy_battle_id IS
  'Automatic battle eligibility snapshot at run start. NULL for non-Energy runs, players without an active clan battle, or cycle-locked clan switchers.';

CREATE INDEX idx_game_sessions_energy_commitment
  ON game_sessions(player_id, started_at DESC) WHERE energy_committed > 0;
CREATE INDEX idx_game_sessions_clan_energy_battle
  ON game_sessions(clan_energy_battle_id, player_id) WHERE clan_energy_battle_id IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_energy_commitment_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.energy_commitment_locked_at IS NOT NULL AND (
       NEW.charge_state IS DISTINCT FROM OLD.charge_state
    OR NEW.energy_committed IS DISTINCT FROM OLD.energy_committed
    OR NEW.energy_harvest_multiplier_bps IS DISTINCT FROM OLD.energy_harvest_multiplier_bps
    OR NEW.energy_available_before IS DISTINCT FROM OLD.energy_available_before
    OR NEW.energy_recovered_at_start IS DISTINCT FROM OLD.energy_recovered_at_start
    OR NEW.energy_recovery_anchor_at IS DISTINCT FROM OLD.energy_recovery_anchor_at
    OR NEW.energy_commitment_locked_at IS DISTINCT FROM OLD.energy_commitment_locked_at
    OR NEW.clan_energy_battle_id IS DISTINCT FROM OLD.clan_energy_battle_id
    OR NEW.clan_energy_battle_side_id IS DISTINCT FROM OLD.clan_energy_battle_side_id
    OR NEW.clan_energy_clan_id IS DISTINCT FROM OLD.clan_energy_clan_id
    OR NEW.clan_fifth_threshold_at_start IS DISTINCT FROM OLD.clan_fifth_threshold_at_start
  ) THEN
    RAISE EXCEPTION 'energy_commitment_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER game_sessions_energy_commitment_immutable
BEFORE UPDATE ON game_sessions
FOR EACH ROW EXECUTE FUNCTION prevent_energy_commitment_mutation();

-- All eligible attempts are retained for audit and telemetry. `counted` is a
-- materialized top-five view maintained transactionally by the recorder RPC.
CREATE TABLE clan_energy_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID NOT NULL REFERENCES clan_energy_battles(id) ON DELETE CASCADE,
  side_id UUID NOT NULL REFERENCES clan_energy_battle_sides(id) ON DELETE CASCADE,
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE RESTRICT,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  session_id UUID NOT NULL UNIQUE REFERENCES game_sessions(id) ON DELETE RESTRICT,
  score BIGINT NOT NULL CHECK (score >= 0),
  energy_committed SMALLINT NOT NULL CHECK (energy_committed BETWEEN 1 AND 24),
  commitment_multiplier_bps INTEGER NOT NULL CHECK (commitment_multiplier_bps >= 10000),
  snake_generation INTEGER NOT NULL DEFAULT 1 CHECK (snake_generation >= 1),
  threshold_before BIGINT NOT NULL DEFAULT 0 CHECK (threshold_before >= 0),
  counted BOOLEAN NOT NULL DEFAULT FALSE,
  contribution_rank SMALLINT,
  replaced_session_id UUID REFERENCES game_sessions(id) ON DELETE SET NULL,
  score_delta BIGINT NOT NULL DEFAULT 0 CHECK (score_delta >= 0),
  result_payload JSONB,
  completed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clan_energy_contributions_player
  ON clan_energy_contributions(battle_id, player_id, score DESC, completed_at);
CREATE INDEX idx_clan_energy_contributions_counted
  ON clan_energy_contributions(side_id, player_id, score DESC) WHERE counted IS TRUE;

-- Permanent prestige only: both sides receive a record, while victory has a
-- distinct stronger honor. No DNA or future scoring power is awarded here.
CREATE TABLE clan_energy_honors (
  battle_id UUID NOT NULL REFERENCES clan_energy_battles(id) ON DELETE RESTRICT,
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE RESTRICT,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  honor TEXT NOT NULL CHECK (honor IN ('victor', 'participant', 'stalemate')),
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (battle_id, player_id)
);

CREATE INDEX idx_clan_energy_honors_player
  ON clan_energy_honors(player_id, awarded_at DESC);

-- -------------------------------------------------------------------------
-- 4. Atomic and idempotent commitment + battle snapshot
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION commit_run_energy(
  p_player_id UUID,
  p_session_id UUID,
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
RETURNS TABLE (
  run_state TEXT,
  energy_available INTEGER,
  energy_updated_at TIMESTAMPTZ,
  energy_recovered INTEGER,
  server_now TIMESTAMPTZ,
  energy_available_before INTEGER,
  energy_committed INTEGER,
  commitment_multiplier_bps INTEGER,
  clan_battle_id UUID,
  clan_battle_side_id UUID,
  clan_id UUID,
  clan_battle_ends_at TIMESTAMPTZ,
  clan_fifth_threshold BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_capacity INTEGER := GREATEST(1, LEAST(COALESCE(p_capacity, 6), 24));
  v_interval INTEGER := GREATEST(60, COALESCE(p_recovery_interval_seconds, 3600));
  v_energy INTEGER;
  v_anchor TIMESTAMPTZ;
  v_recovered INTEGER := 0;
  v_before INTEGER;
  v_commit INTEGER;
  v_bps INTEGER;
  v_state TEXT;
  v_user_id UUID;
  v_locked_at TIMESTAMPTZ;
  v_session_player UUID;
  v_session_ended TIMESTAMPTZ;
  v_current_clan UUID;
  v_locked_clan UUID;
  v_battle UUID;
  v_side UUID;
  v_cycle BIGINT;
  v_cycle_seconds BIGINT;
  v_cycle_start TIMESTAMPTZ;
  v_battle_end TIMESTAMPTZ;
  v_threshold BIGINT := 0;
  v_existing_state TEXT;
  v_existing_commit INTEGER;
  v_existing_bps INTEGER;
  v_existing_before INTEGER;
  v_existing_recovered INTEGER;
  v_existing_anchor TIMESTAMPTZ;
  v_existing_battle UUID;
  v_existing_side UUID;
  v_existing_clan UUID;
BEGIN
  SELECT gs.player_id, gs.ended_at, gs.energy_commitment_locked_at,
         gs.charge_state, gs.energy_committed,
         gs.energy_harvest_multiplier_bps, gs.energy_available_before,
         gs.energy_recovered_at_start, gs.energy_recovery_anchor_at,
         gs.clan_energy_battle_id, gs.clan_energy_battle_side_id,
         gs.clan_energy_clan_id
    INTO v_session_player, v_session_ended, v_locked_at,
         v_existing_state, v_existing_commit,
         v_existing_bps, v_existing_before,
         v_existing_recovered, v_existing_anchor,
         v_existing_battle, v_existing_side,
         v_existing_clan
    FROM game_sessions gs
   WHERE gs.id = p_session_id
   FOR UPDATE;

  IF NOT FOUND OR v_session_player IS DISTINCT FROM p_player_id OR v_session_ended IS NOT NULL THEN
    RAISE EXCEPTION 'commit_run_energy: session is not an open run for player';
  END IF;

  SELECT p.user_id, p.stored_energy, p.energy_updated_at
    INTO v_user_id, v_energy, v_anchor
    FROM players p
   WHERE p.id = p_player_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'commit_run_energy: player not found';
  END IF;

  v_energy := LEAST(v_capacity, GREATEST(0, COALESCE(v_energy, v_capacity)));
  v_anchor := CASE WHEN v_anchor IS NULL OR v_anchor > v_now THEN v_now ELSE v_anchor END;
  IF v_energy >= v_capacity THEN
    v_anchor := v_now;
  ELSE
    v_recovered := LEAST(
      v_capacity - v_energy,
      FLOOR(EXTRACT(EPOCH FROM (v_now - v_anchor)) / v_interval)::INTEGER
    );
    IF v_recovered > 0 THEN
      v_energy := v_energy + v_recovered;
      IF v_energy >= v_capacity THEN
        v_anchor := v_now;
      ELSE
        v_anchor := v_anchor + make_interval(secs => v_recovered * v_interval);
      END IF;
    END IF;
  END IF;

  IF v_locked_at IS NOT NULL THEN
    -- A retried start must never consume Energy twice, but it still performs
    -- the same server-clock recovery reconciliation as any other Energy read.
    -- Persisting that reconciliation keeps an hours-late reconnect from
    -- repeatedly reporting the same recovered unit without advancing its
    -- recovery anchor.
    UPDATE players p
       SET stored_energy = v_energy,
           energy_updated_at = v_anchor
     WHERE p.id = p_player_id;

    RETURN QUERY SELECT
      COALESCE(v_existing_state, 'charged')::TEXT,
      v_energy, v_anchor, 0, v_now,
      COALESCE(v_existing_before, v_energy)::INTEGER,
      COALESCE(v_existing_commit, 0)::INTEGER,
      COALESCE(v_existing_bps, 10000)::INTEGER,
      v_existing_battle,
      v_existing_side,
      v_existing_clan,
      (SELECT b.ends_at FROM clan_energy_battles b WHERE b.id = v_existing_battle),
      COALESCE((SELECT gs.clan_fifth_threshold_at_start FROM game_sessions gs WHERE gs.id = p_session_id), 0);
    RETURN;
  END IF;

  v_before := v_energy;
  IF COALESCE(p_exempt, FALSE) THEN
    v_state := 'exempt';
    v_commit := 0;
    v_bps := 10000;
  ELSIF COALESCE(p_commitment, 0) = 0 THEN
    v_state := 'lean';
    v_commit := 0;
    v_bps := 2500;
  ELSE
    IF p_commitment < 1 OR p_commitment > v_capacity THEN
      RAISE EXCEPTION 'invalid_energy_commitment';
    END IF;
    IF COALESCE(array_length(p_commitment_multipliers_bps, 1), 0) < v_capacity THEN
      RAISE EXCEPTION 'invalid_energy_curve';
    END IF;
    IF v_energy < p_commitment THEN
      RAISE EXCEPTION 'insufficient_energy';
    END IF;
    v_state := 'charged';
    v_commit := p_commitment;
    v_bps := p_commitment_multipliers_bps[p_commitment];
    IF v_bps < 10000 THEN RAISE EXCEPTION 'invalid_energy_curve'; END IF;
    v_energy := v_energy - v_commit; -- constitution-allow: owned-row-downward — deliberate player commitment consumed at START.
  END IF;

  UPDATE players p
     SET stored_energy = v_energy,
         energy_updated_at = v_anchor
   WHERE p.id = p_player_id;

  IF v_commit > 0 THEN
    SELECT cm.clan_id
      INTO v_current_clan
      FROM clan_members cm
      JOIN clans c ON c.id = cm.clan_id AND c.disbanded_at IS NULL
     WHERE cm.player_id = v_user_id;

    IF v_current_clan IS NOT NULL THEN
      -- Establish/check the player's cycle lock BEFORE creating a side. A
      -- player who switched clans must not be able to manufacture an empty
      -- opponent or consume a pairing slot for the new clan.
      v_cycle_seconds := GREATEST(1, p_battle_active_seconds)
        + GREATEST(1, p_battle_intermission_seconds);
      v_cycle := FLOOR(
        EXTRACT(EPOCH FROM (v_now - p_battle_epoch)) / v_cycle_seconds
      )::BIGINT;
      v_cycle_start := p_battle_epoch
        + make_interval(secs => (v_cycle * v_cycle_seconds)::DOUBLE PRECISION);

      IF v_now >= v_cycle_start
         AND v_now < v_cycle_start + make_interval(secs => GREATEST(1, p_battle_active_seconds)) THEN
        INSERT INTO clan_energy_cycle_memberships(cycle_index, player_id, clan_id)
        VALUES (v_cycle, p_player_id, v_current_clan)
        ON CONFLICT (cycle_index, player_id) DO NOTHING;

        SELECT m.clan_id INTO v_locked_clan
          FROM clan_energy_cycle_memberships m
         WHERE m.cycle_index = v_cycle
           AND m.player_id = p_player_id;

        IF v_locked_clan = v_current_clan THEN
          SELECT e.battle_id, e.side_id, e.cycle_index, e.ends_at
            INTO v_battle, v_side, v_cycle, v_battle_end
            FROM ensure_clan_energy_battle(
              v_current_clan, p_battle_epoch,
              p_battle_active_seconds, p_battle_intermission_seconds
            ) e;

          IF FOUND AND v_battle IS NOT NULL THEN
            SELECT CASE
                     WHEN COUNT(*) >= GREATEST(1, p_battle_best_count)
                       THEN COALESCE(MIN(c.score), 0)
                     ELSE 0
                   END
              INTO v_threshold
              FROM clan_energy_contributions c
             WHERE c.battle_id = v_battle
               AND c.player_id = p_player_id
               AND c.counted IS TRUE;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  UPDATE game_sessions gs
     SET charge_state = v_state,
         energy_committed = v_commit,
         energy_harvest_multiplier_bps = v_bps,
         energy_available_before = v_before,
         energy_recovered_at_start = v_recovered,
         energy_recovery_anchor_at = v_anchor,
         energy_commitment_locked_at = v_now,
         clan_energy_battle_id = v_battle,
         clan_energy_battle_side_id = v_side,
         clan_energy_clan_id = CASE WHEN v_battle IS NULL THEN NULL ELSE v_current_clan END,
         clan_fifth_threshold_at_start = v_threshold
   WHERE gs.id = p_session_id;

  RETURN QUERY SELECT
    v_state, v_energy, v_anchor, v_recovered, v_now, v_before,
    v_commit, v_bps, v_battle, v_side,
    CASE WHEN v_battle IS NULL THEN NULL ELSE v_current_clan END,
    v_battle_end, v_threshold;
END;
$$;

REVOKE ALL ON FUNCTION commit_run_energy(UUID, UUID, INTEGER, BOOLEAN, INTEGER, INTEGER, INTEGER[], TIMESTAMPTZ, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION commit_run_energy(UUID, UUID, INTEGER, BOOLEAN, INTEGER, INTEGER, INTEGER[], TIMESTAMPTZ, INTEGER, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION commit_run_energy(UUID, UUID, INTEGER, BOOLEAN, INTEGER, INTEGER, INTEGER[], TIMESTAMPTZ, INTEGER, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION commit_run_energy(UUID, UUID, INTEGER, BOOLEAN, INTEGER, INTEGER, INTEGER[], TIMESTAMPTZ, INTEGER, INTEGER, INTEGER) TO service_role;

-- -------------------------------------------------------------------------
-- 5. Atomic best-five contribution recorder
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION record_clan_energy_contribution(
  p_session_id UUID,
  p_best_count INTEGER DEFAULT 5,
  p_completion_grace_seconds INTEGER DEFAULT 10800,
  p_max_run_duration_seconds INTEGER DEFAULT 10800
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_battle RECORD;
  v_existing JSONB;
  v_threshold BIGINT := 0;
  v_old_sum BIGINT := 0;
  v_new_sum BIGINT := 0;
  v_delta BIGINT := 0;
  v_side_total BIGINT := 0;
  v_inserted UUID;
  v_entered BOOLEAN := FALSE;
  v_replaced UUID;
  v_old_counted UUID[] := '{}';
  v_top_five JSONB := '[]'::JSONB;
  v_result JSONB;
BEGIN
  SELECT gs.id, gs.player_id, gs.yield_dna, gs.energy_committed,
         gs.energy_harvest_multiplier_bps, gs.clan_energy_battle_id,
         gs.clan_energy_battle_side_id, gs.clan_energy_clan_id,
         gs.started_at, gs.ended_at, gs.end_reason, gs.validated, gs.extracted,
         COALESCE(
           CASE
             WHEN jsonb_typeof(gs.run_context -> 'snake' -> 'generation') = 'number'
              AND (gs.run_context #>> '{snake,generation}') ~ '^[1-9][0-9]*$'
               THEN (gs.run_context #>> '{snake,generation}')::INTEGER
             ELSE NULL
           END,
           cs.generation,
           1
         ) AS snake_generation
    INTO v_session
    FROM game_sessions gs
    LEFT JOIN collected_snakes cs ON cs.id = gs.snake_used_id
   WHERE gs.id = p_session_id;

  IF NOT FOUND OR v_session.clan_energy_battle_id IS NULL THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'not_clan_eligible');
  END IF;

  SELECT * INTO v_battle
    FROM clan_energy_battles b
   WHERE b.id = v_session.clan_energy_battle_id
   FOR UPDATE;

  IF v_battle.settled_at IS NOT NULL
     OR v_session.ended_at IS NULL
     OR v_session.validated IS NOT TRUE
     OR v_session.end_reason IS DISTINCT FROM 'completed'
     OR v_session.extracted IS NOT TRUE
     OR COALESCE(v_session.energy_committed, 0) < 1
     OR v_session.started_at < v_battle.starts_at
     OR v_session.started_at >= v_battle.ends_at
     OR v_session.ended_at > v_session.started_at
          + make_interval(secs => GREATEST(60, p_max_run_duration_seconds))
     OR v_session.ended_at > v_battle.ends_at
          + make_interval(secs => GREATEST(0, p_completion_grace_seconds)) THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'validation_or_timing');
  END IF;

  -- Serialize all contributions to a side, so aggregate replacement and the
  -- clan total cannot lose a concurrent member's update.
  PERFORM 1 FROM clan_energy_battle_sides s
   WHERE s.id = v_session.clan_energy_battle_side_id
   FOR UPDATE;

  SELECT c.result_payload INTO v_existing
    FROM clan_energy_contributions c WHERE c.session_id = p_session_id;
  IF FOUND THEN RETURN v_existing; END IF;

  SELECT COALESCE(array_agg(c.session_id), '{}'),
         COALESCE(SUM(c.score), 0),
         CASE
           WHEN COUNT(*) >= GREATEST(1, p_best_count) THEN COALESCE(MIN(c.score), 0)
           ELSE 0
         END
    INTO v_old_counted, v_old_sum, v_threshold
    FROM clan_energy_contributions c
   WHERE c.battle_id = v_session.clan_energy_battle_id
     AND c.player_id = v_session.player_id
     AND c.counted IS TRUE;

  INSERT INTO clan_energy_contributions(
    battle_id, side_id, clan_id, player_id, session_id, score,
    energy_committed, commitment_multiplier_bps, snake_generation,
    threshold_before, completed_at
  ) VALUES (
    v_session.clan_energy_battle_id, v_session.clan_energy_battle_side_id,
    v_session.clan_energy_clan_id, v_session.player_id, v_session.id,
    GREATEST(0, COALESCE(v_session.yield_dna, 0)),
    v_session.energy_committed, v_session.energy_harvest_multiplier_bps,
    v_session.snake_generation, v_threshold, v_session.ended_at
  ) RETURNING id INTO v_inserted;

  WITH ranked AS (
    SELECT c.id,
           ROW_NUMBER() OVER (ORDER BY c.score DESC, c.completed_at ASC, c.id ASC) AS rn
      FROM clan_energy_contributions c
     WHERE c.battle_id = v_session.clan_energy_battle_id
       AND c.player_id = v_session.player_id
  )
  UPDATE clan_energy_contributions c
     SET counted = r.rn <= GREATEST(1, p_best_count),
         contribution_rank = CASE
           WHEN r.rn <= GREATEST(1, p_best_count) THEN r.rn::SMALLINT
           ELSE NULL
         END
    FROM ranked r
   WHERE c.id = r.id;

  SELECT c.counted INTO v_entered FROM clan_energy_contributions c WHERE c.id = v_inserted;
  SELECT COALESCE(SUM(c.score), 0),
         COALESCE(jsonb_agg(jsonb_build_object(
           'sessionId', c.session_id,
           'score', c.score,
           'rank', c.contribution_rank,
           'energyCommitted', c.energy_committed,
           'generation', c.snake_generation
         ) ORDER BY c.contribution_rank), '[]'::JSONB)
    INTO v_new_sum, v_top_five
    FROM clan_energy_contributions c
   WHERE c.battle_id = v_session.clan_energy_battle_id
     AND c.player_id = v_session.player_id
     AND c.counted IS TRUE;

  v_delta := GREATEST(0, v_new_sum - v_old_sum);
  SELECT old_id INTO v_replaced
    FROM unnest(v_old_counted) old_id
   WHERE NOT EXISTS (
     SELECT 1 FROM clan_energy_contributions c
      WHERE c.session_id = old_id AND c.counted IS TRUE
   )
   LIMIT 1;

  SELECT COALESCE(SUM(c.score), 0) INTO v_side_total
    FROM clan_energy_contributions c
   WHERE c.side_id = v_session.clan_energy_battle_side_id AND c.counted IS TRUE;

  UPDATE clan_energy_battle_sides s SET score = v_side_total
   WHERE s.id = v_session.clan_energy_battle_side_id;

  v_result := jsonb_build_object(
    'eligible', TRUE,
    'enteredTopFive', v_entered,
    'replacedSessionId', v_replaced,
    'scoreDelta', v_delta,
    'clanTotal', v_side_total,
    'thresholdBefore', v_threshold,
    'fifthBest', CASE
      WHEN jsonb_array_length(v_top_five) >= GREATEST(1, p_best_count)
        THEN (v_top_five -> (GREATEST(1, p_best_count) - 1) ->> 'score')::BIGINT
      ELSE 0
    END,
    'topFive', v_top_five
  );

  UPDATE clan_energy_contributions c
     SET replaced_session_id = v_replaced,
         score_delta = v_delta,
         result_payload = v_result
   WHERE c.id = v_inserted;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION record_clan_energy_contribution(UUID, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_clan_energy_contribution(UUID, INTEGER, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION record_clan_energy_contribution(UUID, INTEGER, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION record_clan_energy_contribution(UUID, INTEGER, INTEGER, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION reconcile_clan_energy_contributions(
  p_best_count INTEGER DEFAULT 5,
  p_completion_grace_seconds INTEGER DEFAULT 10800,
  p_max_run_duration_seconds INTEGER DEFAULT 10800
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_recorded INTEGER := 0;
BEGIN
  FOR v_session IN
    SELECT gs.id
      FROM game_sessions gs
      JOIN clan_energy_battles b ON b.id = gs.clan_energy_battle_id
     WHERE gs.ended_at IS NOT NULL
       AND gs.end_reason = 'completed'
       AND gs.validated IS TRUE
       AND gs.extracted IS TRUE
       AND gs.energy_committed > 0
       AND gs.started_at >= b.starts_at
       AND gs.started_at < b.ends_at
       AND gs.ended_at <= gs.started_at
            + make_interval(secs => GREATEST(60, p_max_run_duration_seconds))
       AND gs.ended_at <= b.ends_at
            + make_interval(secs => GREATEST(0, p_completion_grace_seconds))
       AND NOT EXISTS (
         SELECT 1 FROM clan_energy_contributions c WHERE c.session_id = gs.id
       )
     ORDER BY gs.ended_at
  LOOP
    PERFORM record_clan_energy_contribution(
      v_session.id, p_best_count, p_completion_grace_seconds,
      p_max_run_duration_seconds
    );
    v_recorded := v_recorded + 1;
  END LOOP;
  RETURN v_recorded;
END;
$$;

REVOKE ALL ON FUNCTION reconcile_clan_energy_contributions(INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION reconcile_clan_energy_contributions(INTEGER, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION reconcile_clan_energy_contributions(INTEGER, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION reconcile_clan_energy_contributions(INTEGER, INTEGER, INTEGER) TO service_role;

-- -------------------------------------------------------------------------
-- 6. Idempotent settlement and bounded non-power honors
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settle_clan_energy_battles(
  p_completion_grace_seconds INTEGER DEFAULT 10800
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_battle RECORD;
  v_side_one RECORD;
  v_side_two RECORD;
  v_settled INTEGER := 0;
BEGIN
  FOR v_battle IN
    SELECT b.* FROM clan_energy_battles b
     WHERE b.settled_at IS NULL
       AND b.ends_at + make_interval(secs => GREATEST(0, p_completion_grace_seconds)) <= NOW()
     ORDER BY b.ends_at
     FOR UPDATE
  LOOP
    SELECT s.* INTO v_side_one FROM clan_energy_battle_sides s
     WHERE s.battle_id = v_battle.id ORDER BY s.slot LIMIT 1;
    SELECT s.* INTO v_side_two FROM clan_energy_battle_sides s
     WHERE s.battle_id = v_battle.id ORDER BY s.slot OFFSET 1 LIMIT 1;

    IF v_side_two.id IS NULL THEN
      UPDATE clan_energy_battle_sides SET outcome = 'bye' WHERE id = v_side_one.id;
    ELSIF v_side_one.score = v_side_two.score THEN
      UPDATE clan_energy_battle_sides SET outcome = 'stalemate' WHERE battle_id = v_battle.id;
    ELSIF v_side_one.score > v_side_two.score THEN
      UPDATE clan_energy_battle_sides SET outcome = 'victor' WHERE id = v_side_one.id;
      UPDATE clan_energy_battle_sides SET outcome = 'participant' WHERE id = v_side_two.id;
    ELSE
      UPDATE clan_energy_battle_sides SET outcome = 'participant' WHERE id = v_side_one.id;
      UPDATE clan_energy_battle_sides SET outcome = 'victor' WHERE id = v_side_two.id;
    END IF;

    INSERT INTO clan_energy_honors(battle_id, clan_id, player_id, honor)
    SELECT DISTINCT c.battle_id, c.clan_id, c.player_id,
      CASE s.outcome
        WHEN 'victor' THEN 'victor'
        WHEN 'stalemate' THEN 'stalemate'
        ELSE 'participant'
      END
      FROM clan_energy_contributions c
      JOIN clan_energy_battle_sides s ON s.id = c.side_id
     WHERE c.battle_id = v_battle.id
    ON CONFLICT (battle_id, player_id) DO NOTHING;

    -- Depth is earned by the runs, not awarded for the outcome. Bank each
    -- participant's best-five total and each clan's side total exactly once,
    -- guarded by the battle row's settled_at lock. Both updates are monotonic
    -- and keep historical World Serpent Depth intact.
    WITH player_depth AS (
      SELECT c.player_id, COALESCE(SUM(c.score), 0)::BIGINT AS depth
        FROM clan_energy_contributions c
       WHERE c.battle_id = v_battle.id AND c.counted IS TRUE
       GROUP BY c.player_id
    )
    UPDATE players p
       SET lifetime_depth = p.lifetime_depth + d.depth,
           best_week_depth = GREATEST(p.best_week_depth, d.depth)
      FROM player_depth d
     WHERE p.id = d.player_id;

    UPDATE clans c
       SET lifetime_depth = c.lifetime_depth + s.score,
           best_week_depth = GREATEST(c.best_week_depth, s.score)
      FROM clan_energy_battle_sides s
     WHERE s.battle_id = v_battle.id
       AND s.clan_id = c.id
       AND s.score > 0;

    UPDATE clan_energy_battles SET settled_at = NOW() WHERE id = v_battle.id;
    v_settled := v_settled + 1;
  END LOOP;
  RETURN v_settled;
END;
$$;

REVOKE ALL ON FUNCTION settle_clan_energy_battles(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION settle_clan_energy_battles(INTEGER) FROM anon;
REVOKE ALL ON FUNCTION settle_clan_energy_battles(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION settle_clan_energy_battles(INTEGER) TO service_role;

-- -------------------------------------------------------------------------
-- 7. Read isolation and Rule 6 verification
-- -------------------------------------------------------------------------

ALTER TABLE clan_energy_battles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clan_energy_battle_sides ENABLE ROW LEVEL SECURITY;
ALTER TABLE clan_energy_cycle_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE clan_energy_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clan_energy_honors ENABLE ROW LEVEL SECURITY;

-- All reads/writes flow through authenticated API routes and service-only
-- RPCs, which can redact other members' attempt-level performance.
CREATE POLICY clan_energy_battles_service_only ON clan_energy_battles FOR ALL USING (FALSE);
CREATE POLICY clan_energy_battle_sides_service_only ON clan_energy_battle_sides FOR ALL USING (FALSE);
CREATE POLICY clan_energy_cycle_memberships_service_only ON clan_energy_cycle_memberships FOR ALL USING (FALSE);
CREATE POLICY clan_energy_contributions_service_only ON clan_energy_contributions FOR ALL USING (FALSE);
CREATE POLICY clan_energy_honors_service_only ON clan_energy_honors FOR ALL USING (FALSE);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM energy_commitment_pre_players pre
    JOIN players p USING (id)
    WHERE p.dna < pre.dna OR p.total_dna_earned < pre.total_dna_earned
  ) OR EXISTS (
    SELECT 1 FROM energy_commitment_pre_sessions pre
    JOIN game_sessions gs USING (id)
    WHERE gs.dna_earned < pre.dna_earned OR COALESCE(gs.yield_dna, 0) < pre.yield_dna
  ) THEN
    RAISE EXCEPTION 'Migration 059 Rule 6 tripwire: an earned value moved downward';
  END IF;
END;
$$;

COMMIT;
