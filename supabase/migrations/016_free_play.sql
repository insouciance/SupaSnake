-- ============================================================================
-- Migration 016: Free Play (Design v2 §7.4)
-- ============================================================================
-- Free Play is unlimited, energy-free, and rewardless practice. Sessions are
-- still written and validated (server authority is unchanged) but marked with
-- is_free_play so every economy/progression read excludes them:
--   * DNA payout / total_dna_earned / achievements / streak - route-level skip
--   * Contract progress - refresh_contract_progress re-created below with an
--     is_free_play exclusion on every game_sessions read
--   * Leaderboards - /api/leaderboard weekly/daily queries filter it out
-- ============================================================================

-- 1. Free-play marker on sessions. NOT NULL DEFAULT FALSE backfills every
--    existing row as an earning run.
ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS is_free_play BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN game_sessions.is_free_play IS
  'TRUE for Free Play practice runs (Design v2 §7.4): no energy cost, no DNA, no contracts, no leaderboards.';

-- ============================================================================
-- 2. Contract progress recompute (migration 015) - re-created with the free
--    play exclusion (gs.is_free_play IS NOT TRUE) on every game_sessions
--    query. Everything else is byte-identical to 015.
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_contract_progress(p_player_id UUID, p_date DATE)
RETURNS VOID AS $$
DECLARE
  v_row RECORD;
  v_current INTEGER;
  v_target INTEGER;
  v_dynasty TEXT;
  v_day_start TIMESTAMPTZ := (p_date::timestamp AT TIME ZONE 'UTC');
  v_day_end TIMESTAMPTZ := ((p_date + 1)::timestamp AT TIME ZONE 'UTC');
BEGIN
  FOR v_row IN
    SELECT pc.id AS pc_id, cd.contract_type, cd.params
    FROM player_contracts pc
    JOIN contract_definitions cd ON cd.id = pc.contract_id
    WHERE pc.player_id = p_player_id
      AND pc.contract_date = p_date
      AND pc.picked
      AND pc.claimed_at IS NULL
  LOOP
    v_dynasty := v_row.params->>'dynasty';
    v_current := 0;
    v_target := 1;

    CASE v_row.contract_type
      WHEN 'extract_n' THEN
        -- Banker: banked extractions today
        v_target := COALESCE((v_row.params->>'count')::int, 1);
        SELECT COUNT(*)::int INTO v_current
        FROM game_sessions gs
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND gs.extracted;

      WHEN 'food_n_single_run' THEN
        -- Deep Run: best single-run food count (optionally dynasty-scoped)
        v_target := COALESCE((v_row.params->>'foods')::int, 1);
        SELECT COALESCE(MAX(gs.foods_collected), 0)::int INTO v_current
        FROM game_sessions gs
        LEFT JOIN snake_variants sv ON sv.id = gs.snake_variant_id
        LEFT JOIN dynasties d ON d.id = sv.dynasty_id
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND (v_dynasty IS NULL OR d.name = v_dynasty);

      WHEN 'extract_tier' THEN
        -- Redline: best BANKED food count in the dynasty; tier is a pure
        -- function of foods (floor(n/5) capped 4), so min_foods proves it.
        v_target := COALESCE((v_row.params->>'min_foods')::int, 1);
        SELECT COALESCE(MAX(gs.foods_collected), 0)::int INTO v_current
        FROM game_sessions gs
        LEFT JOIN snake_variants sv ON sv.id = gs.snake_variant_id
        LEFT JOIN dynasties d ON d.id = sv.dynasty_id
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND gs.extracted
          AND (v_dynasty IS NULL OR d.name = v_dynasty);

      WHEN 'food_total' THEN
        -- Collector: total foods across today's runs
        v_target := COALESCE((v_row.params->>'foods')::int, 1);
        SELECT COALESCE(SUM(gs.foods_collected), 0)::int INTO v_current
        FROM game_sessions gs
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end;

      WHEN 'extract_fast' THEN
        -- Sprinter: any bank within max_seconds of run start
        v_target := 1;
        SELECT COUNT(*)::int INTO v_current
        FROM game_sessions gs
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND gs.extracted
          AND gs.duration_seconds <= COALESCE((v_row.params->>'max_seconds')::int, 240);

      WHEN 'extract_nth_portal' THEN
        -- Nerve: conservative proof via worst-case portal cadence (see seed)
        v_target := 1;
        SELECT COUNT(*)::int INTO v_current
        FROM game_sessions gs
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND gs.extracted
          AND gs.foods_collected >= COALESCE((v_row.params->>'min_foods_proof')::int, 63);

      ELSE
        -- combo_x / mutations_held / extract_pure / clan_contribute /
        -- gauntlet_runs / anomaly_run: facts not on game_sessions yet.
        -- These definitions are seeded inactive and are never offered;
        -- progress stays 0 defensively if one is ever force-picked.
        v_current := 0;
        v_target := 1;
    END CASE;

    UPDATE player_contracts pc SET
      progress = jsonb_build_object(
        'current', LEAST(v_current, v_target),
        'target', v_target
      ),
      completed_at = CASE
        WHEN v_current >= v_target AND pc.completed_at IS NULL THEN NOW()
        ELSE pc.completed_at
      END
    WHERE pc.id = v_row.pc_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
