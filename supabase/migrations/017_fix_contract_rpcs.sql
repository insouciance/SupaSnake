-- Migration 017: fix ambiguous column references in contract RPCs
-- RETURNS TABLE columns (contract_id, ...) are PL/pgSQL variables that
-- shadowed table columns (ON CONFLICT ... contract_id was ambiguous).
-- Re-creates each function with #variable_conflict use_column.
-- refresh_contract_progress is taken from migration 016 (it carries
-- the is_free_play exclusion filters) - NOT from 015.

CREATE OR REPLACE FUNCTION refresh_contract_progress(p_player_id UUID, p_date DATE)
RETURNS VOID AS $$
#variable_conflict use_column
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

CREATE OR REPLACE FUNCTION offer_daily_contracts(p_player_id UUID)
RETURNS TABLE (
  contract_id TEXT,
  contract_type TEXT,
  name TEXT,
  description TEXT,
  params JSONB,
  reward_dna INTEGER,
  reward_energy INTEGER,
  reward_xp INTEGER,
  offered_slot INTEGER,
  picked BOOLEAN,
  progress JSONB,
  completed_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ
) AS $$
#variable_conflict use_column
DECLARE
  v_date DATE := CURRENT_DATE;
BEGIN
  PERFORM 1 FROM players WHERE id = p_player_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM player_contracts pc
    WHERE pc.player_id = p_player_id AND pc.contract_date = v_date
  ) THEN
    INSERT INTO player_contracts (player_id, contract_date, contract_id, offered_slot)
    SELECT p_player_id, v_date, t.id, t.slot
    FROM (
      SELECT cd.id,
             ROW_NUMBER() OVER (
               ORDER BY md5(p_player_id::text || v_date::text || cd.id), cd.id
             )::int AS slot
      FROM contract_definitions cd
      WHERE cd.active
    ) t
    WHERE t.slot <= 3
    ON CONFLICT (player_id, contract_date, contract_id) DO NOTHING;
  END IF;

  PERFORM refresh_contract_progress(p_player_id, v_date);

  RETURN QUERY
  SELECT pc.contract_id, cd.contract_type, cd.name, cd.description, cd.params,
         cd.reward_dna, cd.reward_energy, cd.reward_xp,
         pc.offered_slot, pc.picked, pc.progress, pc.completed_at, pc.claimed_at
  FROM player_contracts pc
  JOIN contract_definitions cd ON cd.id = pc.contract_id
  WHERE pc.player_id = p_player_id AND pc.contract_date = v_date
  ORDER BY pc.offered_slot;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION pick_contracts(p_player_id UUID, p_contract_ids TEXT[])
RETURNS TABLE (
  contract_id TEXT,
  contract_type TEXT,
  name TEXT,
  description TEXT,
  params JSONB,
  reward_dna INTEGER,
  reward_energy INTEGER,
  reward_xp INTEGER,
  offered_slot INTEGER,
  picked BOOLEAN,
  progress JSONB,
  completed_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ
) AS $$
#variable_conflict use_column
DECLARE
  v_date DATE := CURRENT_DATE;
  v_count INTEGER := COALESCE(array_length(p_contract_ids, 1), 0);
  v_already INTEGER;
  v_pickable INTEGER;
BEGIN
  IF v_count < 1 OR v_count > 2 THEN
    RAISE EXCEPTION 'Pick 1 or 2 contracts';
  END IF;
  IF (SELECT COUNT(DISTINCT x) FROM unnest(p_contract_ids) x) <> v_count THEN
    RAISE EXCEPTION 'Duplicate contract ids';
  END IF;

  -- Row-lock today's board so concurrent picks serialize
  PERFORM 1 FROM player_contracts pc
  WHERE pc.player_id = p_player_id AND pc.contract_date = v_date
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No contracts offered today';
  END IF;

  SELECT COUNT(*)::int INTO v_already
  FROM player_contracts pc
  WHERE pc.player_id = p_player_id AND pc.contract_date = v_date AND pc.picked;

  IF v_already + v_count > 2 THEN
    RAISE EXCEPTION 'Pick limit reached (2 per day)';
  END IF;

  SELECT COUNT(*)::int INTO v_pickable
  FROM player_contracts pc
  WHERE pc.player_id = p_player_id AND pc.contract_date = v_date
    AND pc.contract_id = ANY(p_contract_ids)
    AND NOT pc.picked;

  IF v_pickable <> v_count THEN
    RAISE EXCEPTION 'Contract not offered today';
  END IF;

  UPDATE player_contracts pc SET picked = true, picked_at = NOW()
  WHERE pc.player_id = p_player_id AND pc.contract_date = v_date
    AND pc.contract_id = ANY(p_contract_ids);

  PERFORM refresh_contract_progress(p_player_id, v_date);

  RETURN QUERY
  SELECT pc.contract_id, cd.contract_type, cd.name, cd.description, cd.params,
         cd.reward_dna, cd.reward_energy, cd.reward_xp,
         pc.offered_slot, pc.picked, pc.progress, pc.completed_at, pc.claimed_at
  FROM player_contracts pc
  JOIN contract_definitions cd ON cd.id = pc.contract_id
  WHERE pc.player_id = p_player_id AND pc.contract_date = v_date
  ORDER BY pc.offered_slot;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION claim_contract(p_player_id UUID, p_contract_id TEXT)
RETURNS TABLE (
  contract_id TEXT,
  dna_granted INTEGER,
  energy_granted INTEGER,
  xp_granted INTEGER
) AS $$
#variable_conflict use_column
DECLARE
  v_date DATE := CURRENT_DATE;
  v_pc player_contracts%ROWTYPE;
  v_def contract_definitions%ROWTYPE;
  v_player RECORD;
  v_season RECORD;
  v_energy_grant INTEGER;
  v_new_dna INTEGER;
  v_xp INTEGER := 0;
BEGIN
  SELECT * INTO v_pc FROM player_contracts pc
  WHERE pc.player_id = p_player_id
    AND pc.contract_date = v_date
    AND pc.contract_id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not offered today';
  END IF;
  IF NOT v_pc.picked THEN
    RAISE EXCEPTION 'Contract not picked';
  END IF;
  IF v_pc.claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Contract already claimed';
  END IF;

  -- Server recompute at claim time - never trust cached progress
  PERFORM refresh_contract_progress(p_player_id, v_date);
  SELECT * INTO v_pc FROM player_contracts pc WHERE pc.id = v_pc.id;

  IF v_pc.completed_at IS NULL THEN
    RAISE EXCEPTION 'Contract not complete';
  END IF;

  SELECT * INTO v_def FROM contract_definitions cd WHERE cd.id = p_contract_id;

  SELECT * INTO v_player FROM players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  v_energy_grant := LEAST(
    v_def.reward_energy,
    GREATEST(0, COALESCE(v_player.max_energy, 5) - v_player.energy)
  );

  UPDATE players
  SET dna = dna + v_def.reward_dna,
      energy = energy + v_energy_grant
  WHERE id = p_player_id
  RETURNING dna INTO v_new_dna;

  IF v_def.reward_dna > 0 THEN
    INSERT INTO economy_transactions (player_id, resource_type, amount, balance_after, source_type, metadata)
    VALUES (p_player_id, 'dna', v_def.reward_dna, v_new_dna, 'daily_reward',
            jsonb_build_object('contract', p_contract_id, 'contract_date', v_date));
  END IF;
  IF v_energy_grant > 0 THEN
    INSERT INTO economy_transactions (player_id, resource_type, amount, balance_after, source_type, metadata)
    VALUES (p_player_id, 'energy', v_energy_grant, v_player.energy + v_energy_grant, 'daily_reward',
            jsonb_build_object('contract', p_contract_id, 'contract_date', v_date));
  END IF;

  -- Season-track XP: only when a season is live; nothing accrues (and
  -- nothing is lost - contracts remain daily) outside seasons.
  SELECT * INTO v_season FROM battle_pass_seasons s
  WHERE s.is_active AND NOW() >= s.starts_at AND NOW() < s.ends_at
  ORDER BY s.season_number DESC
  LIMIT 1;

  IF FOUND THEN
    v_xp := v_def.reward_xp;
    INSERT INTO player_battle_pass (player_id, season_id, current_xp, current_level)
    VALUES (
      p_player_id, v_season.id, v_xp,
      LEAST(v_season.max_level, 1 + v_xp / v_season.xp_per_level)
    )
    ON CONFLICT (player_id, season_id) DO UPDATE SET
      current_xp = player_battle_pass.current_xp + v_xp,
      current_level = LEAST(
        v_season.max_level,
        1 + (player_battle_pass.current_xp + v_xp) / v_season.xp_per_level
      ),
      updated_at = NOW();
  END IF;

  UPDATE player_contracts pc SET claimed_at = NOW() WHERE pc.id = v_pc.id;

  RETURN QUERY SELECT p_contract_id, v_def.reward_dna, v_energy_grant, v_xp;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
