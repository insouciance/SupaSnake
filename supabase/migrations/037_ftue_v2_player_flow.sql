-- Migration 037: FTUE v2 authoritative player bootstrap
--
-- Player-flow invariants:
--   * PRIMAL is the production onboarding default.
--   * bootstrap_player is atomic, concurrent-safe, and idempotent.
--   * Existing ownership/equipment/dynasty choices always win.
--   * Zero-snake players receive the active PRIMAL catalog starter.
--   * Every bootstrapped player finishes with exactly one equipped snake.

BEGIN;

ALTER TABLE player_settings
  ALTER COLUMN selected_dynasty SET DEFAULT 'PRIMAL';

-- Historical sessions that predate a dynasty stamp display under the current
-- beginner default. Existing stamped runs remain untouched.
CREATE OR REPLACE FUNCTION chronicle_pb_timeline(p_player_id UUID)
RETURNS TABLE (week_start DATE, dynasty TEXT, best_score INTEGER, runs INTEGER) AS $$
  SELECT
    duel_week_start(gs.ended_at) AS week_start,
    UPPER(COALESCE(gs.dynasty, 'PRIMAL')) AS dynasty,
    MAX(gs.score)::INTEGER AS best_score,
    COUNT(*)::INTEGER AS runs
  FROM game_sessions gs
  WHERE gs.player_id = p_player_id
    AND gs.ended_at IS NOT NULL
    AND gs.validated IS TRUE
    AND gs.is_free_play IS NOT TRUE
  GROUP BY 1, 2
  ORDER BY 1 ASC, 2 ASC;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION bootstrap_player(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_player players%ROWTYPE;
  v_settings player_settings%ROWTYPE;
  v_snake collected_snakes%ROWTYPE;
  v_variant snake_variants%ROWTYPE;
  v_dynasty dynasties%ROWTYPE;
  v_player_inserted BOOLEAN := false;
  v_settings_inserted BOOLEAN := false;
  v_had_snakes BOOLEAN := false;
  v_starter_granted BOOLEAN := false;
  v_equipment_repaired BOOLEAN := false;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  -- Transaction-scoped lock: repeated browser requests and concurrent edge
  -- instances serialize for one identity without blocking other players.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

  SELECT * INTO v_player
  FROM players
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO players (user_id, dna, energy, max_energy)
    VALUES (p_user_id, 0, 5, 5)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING * INTO v_player;

    v_player_inserted := FOUND;

    IF NOT v_player_inserted THEN
      SELECT * INTO STRICT v_player
      FROM players
      WHERE user_id = p_user_id
      FOR UPDATE;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM collected_snakes WHERE player_id = v_player.id
  ) INTO v_had_snakes;

  SELECT * INTO v_settings
  FROM player_settings
  WHERE player_id = v_player.id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- If ownership already exists, infer the dynasty from the active/equipped
    -- or oldest snake rather than imposing the new-player default.
    SELECT d.name INTO v_dynasty.name
    FROM collected_snakes cs
    JOIN snake_variants sv ON sv.id = cs.snake_variant_id
    JOIN dynasties d ON d.id = sv.dynasty_id
    WHERE cs.player_id = v_player.id
    ORDER BY cs.is_equipped DESC, cs.acquired_at ASC, cs.id ASC
    LIMIT 1;

    INSERT INTO player_settings (player_id, selected_dynasty)
    VALUES (v_player.id, COALESCE(v_dynasty.name, 'PRIMAL'))
    ON CONFLICT (player_id) DO NOTHING
    RETURNING * INTO v_settings;

    v_settings_inserted := FOUND;

    IF NOT v_settings_inserted THEN
      SELECT * INTO STRICT v_settings
      FROM player_settings
      WHERE player_id = v_player.id
      FOR UPDATE;
    END IF;
  END IF;

  -- Preserve the current choice. active_snake_id is preferred when it is
  -- still owned; otherwise keep an equipped snake, then repair from existing
  -- ownership before considering a starter grant.
  SELECT cs.* INTO v_snake
  FROM collected_snakes cs
  WHERE cs.player_id = v_player.id
  ORDER BY
    CASE WHEN cs.id = v_settings.active_snake_id THEN 0 ELSE 1 END,
    CASE WHEN cs.is_equipped THEN 0 ELSE 1 END,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM snake_variants selected_sv
        JOIN dynasties selected_d ON selected_d.id = selected_sv.dynasty_id
        WHERE selected_sv.id = cs.snake_variant_id
          AND selected_d.name = v_settings.selected_dynasty
      ) THEN 0 ELSE 1
    END,
    cs.acquired_at ASC,
    cs.id ASC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT sv.* INTO v_variant
    FROM snake_variants sv
    JOIN dynasties d ON d.id = sv.dynasty_id
    WHERE d.name = 'PRIMAL'
      AND d.is_active = true
      AND sv.is_starter = true
      AND sv.is_active = true
    ORDER BY sv.sort_order ASC, sv.id ASC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Active PRIMAL starter is missing from the catalog';
    END IF;

    INSERT INTO collected_snakes (
      player_id,
      snake_variant_id,
      generation,
      acquired_method,
      is_equipped,
      is_favorited,
      traits,
      lineage
    ) VALUES (
      v_player.id,
      v_variant.id,
      1,
      'tutorial',
      true,
      false,
      ARRAY[]::TEXT[],
      NULL
    )
    RETURNING * INTO v_snake;

    v_starter_granted := true;
    v_equipment_repaired := true;

    SELECT * INTO STRICT v_dynasty
    FROM dynasties
    WHERE id = v_variant.dynasty_id;
  ELSE
    v_equipment_repaired :=
      v_settings.active_snake_id IS DISTINCT FROM v_snake.id
      OR NOT COALESCE(v_snake.is_equipped, false)
      OR EXISTS (
        SELECT 1
        FROM collected_snakes cs
        WHERE cs.player_id = v_player.id
          AND cs.is_equipped = true
          AND cs.id <> v_snake.id
      );

    SELECT sv.* INTO STRICT v_variant
    FROM snake_variants sv
    WHERE sv.id = v_snake.snake_variant_id;

    SELECT * INTO STRICT v_dynasty
    FROM dynasties
    WHERE id = v_variant.dynasty_id;
  END IF;

  -- A single statement normalizes accidental historical multi-equipped rows.
  UPDATE collected_snakes
  SET is_equipped = (id = v_snake.id)
  WHERE player_id = v_player.id
    AND is_equipped IS DISTINCT FROM (id = v_snake.id);

  UPDATE player_settings
  SET active_snake_id = v_snake.id,
      selected_dynasty = CASE
        WHEN v_starter_granted THEN 'PRIMAL'
        WHEN v_settings_inserted THEN v_dynasty.name
        ELSE selected_dynasty
      END
  WHERE player_id = v_player.id
  RETURNING * INTO v_settings;

  RETURN jsonb_build_object(
    'player', jsonb_build_object(
      'id', v_player.id,
      'dna', v_player.dna,
      'energy', v_player.energy,
      'maxEnergy', v_player.max_energy,
      'highScore', v_player.high_score,
      'totalGamesPlayed', v_player.total_games_played
    ),
    'equippedSnake', jsonb_build_object(
      'id', v_snake.id,
      'variantId', v_variant.id,
      'name', v_variant.name,
      'dynasty', v_dynasty.name,
      'generation', v_snake.generation,
      'traits', COALESCE(to_jsonb(v_snake.traits), '[]'::JSONB),
      'lineage', COALESCE(
        v_snake.lineage,
        jsonb_build_object(
          'strains', jsonb_build_array(v_variant.lineage_strain),
          'strength', v_variant.affinity_strength
        )
      )
    ),
    'onboarding', jsonb_build_object(
      'version', 2,
      'isNewPlayer', v_player_inserted OR NOT v_had_snakes,
      'starterGranted', v_starter_granted,
      'equipmentRepaired', v_equipment_repaired,
      'hasCompletedFirstRun', v_player.total_games_played > 0,
      'needsStarterSelection', false
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION bootstrap_player(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION bootstrap_player(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION bootstrap_player(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION bootstrap_player(UUID) TO service_role;

-- Repair existing zero-snake/missing-equipment states through the exact same
-- operation used at runtime. Existing choices and resources remain untouched.
DO $$
DECLARE
  v_user_id UUID;
BEGIN
  FOR v_user_id IN
    SELECT user_id FROM players WHERE user_id IS NOT NULL ORDER BY created_at
  LOOP
    PERFORM bootstrap_player(v_user_id);
  END LOOP;
END;
$$;

-- The backfill above has normalized historical rows, so enforce the invariant
-- for every future code path as a final database boundary.
CREATE UNIQUE INDEX IF NOT EXISTS idx_collected_one_equipped_per_player
  ON collected_snakes(player_id)
  WHERE is_equipped = true;

-- Equipment is one atomic server operation and keeps Home/Lab/game dynasty
-- state aligned. The advisory lock also makes simultaneous equip actions safe.
CREATE OR REPLACE FUNCTION equip_snake(
  p_player_id UUID,
  p_snake_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_dynasty_name TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_player_id::TEXT, 0));

  SELECT d.name INTO v_dynasty_name
  FROM collected_snakes cs
  JOIN snake_variants sv ON sv.id = cs.snake_variant_id
  JOIN dynasties d ON d.id = sv.dynasty_id
  WHERE cs.id = p_snake_id
    AND cs.player_id = p_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snake not owned by player';
  END IF;

  UPDATE collected_snakes
  SET is_equipped = (id = p_snake_id)
  WHERE player_id = p_player_id
    AND is_equipped IS DISTINCT FROM (id = p_snake_id);

  INSERT INTO player_settings (player_id, active_snake_id, selected_dynasty)
  VALUES (p_player_id, p_snake_id, v_dynasty_name)
  ON CONFLICT (player_id) DO UPDATE
  SET active_snake_id = EXCLUDED.active_snake_id,
      selected_dynasty = EXCLUDED.selected_dynasty;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION equip_snake(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION equip_snake(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION equip_snake(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION equip_snake(UUID, UUID) TO service_role;

-- A Lab unlock can become the active snake in the same transaction. Calling
-- the existing authority functions keeps DNA deduction, ownership, equipment,
-- and selected dynasty all-or-nothing.
CREATE OR REPLACE FUNCTION unlock_and_equip_variant(
  p_player_id UUID,
  p_variant_id UUID
) RETURNS UUID AS $$
DECLARE
  v_snake_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_player_id::TEXT, 0));
  v_snake_id := unlock_variant(p_player_id, p_variant_id);
  PERFORM equip_snake(p_player_id, v_snake_id);
  RETURN v_snake_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION unlock_and_equip_variant(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION unlock_and_equip_variant(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION unlock_and_equip_variant(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION unlock_and_equip_variant(UUID, UUID) TO service_role;

COMMIT;
