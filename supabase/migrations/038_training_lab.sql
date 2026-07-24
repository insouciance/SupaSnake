-- Migration 038: server-authoritative Training Lab persistence
--
-- Training is deliberately rewardless. These objects store verified practice
-- evidence and player-authored sandbox presets only; they never touch Energy,
-- DNA, mastery, contracts, seasons, streaks, or earning game sessions.
--
-- The application deployed immediately before this migration is backwards
-- compatible: it verifies attempts but degrades profile/preset persistence
-- until these objects are present.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Verified attempts, one current best per drill/difficulty, and presets
-- ---------------------------------------------------------------------------

CREATE TABLE training_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL CHECK (
    exercise_id IN ('trace', 'route', 'tempo', 'escape')
  ),
  difficulty TEXT NOT NULL CHECK (
    difficulty IN ('foundation', 'advanced', 'elite')
  ),
  scenario_version INTEGER NOT NULL CHECK (
    scenario_version BETWEEN 1 AND 32767
  ),
  scenario_seed TEXT NOT NULL CHECK (
    scenario_seed ~ '^[A-Za-z0-9._:-]{1,96}$'
  ),
  completed BOOLEAN NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 0 AND 100),
  medal TEXT NOT NULL CHECK (
    medal IN ('none', 'bronze', 'silver', 'gold', 'prismatic')
  ),
  accuracy INTEGER NOT NULL CHECK (accuracy BETWEEN 0 AND 100),
  efficiency INTEGER NOT NULL CHECK (efficiency BETWEEN 0 AND 100),
  consistency INTEGER NOT NULL CHECK (consistency BETWEEN 0 AND 100),
  ticks INTEGER NOT NULL CHECK (ticks BETWEEN 0 AND 240),
  metrics JSONB NOT NULL CHECK (jsonb_typeof(metrics) = 'object'),
  trace JSONB NOT NULL CHECK (
    jsonb_typeof(trace) = 'array'
    AND jsonb_array_length(trace) <= 241
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX training_attempts_player_recent_idx
  ON training_attempts(player_id, created_at DESC);
CREATE INDEX training_attempts_player_skill_recent_idx
  ON training_attempts(player_id, exercise_id, difficulty, created_at DESC);

CREATE TABLE training_bests (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL CHECK (
    exercise_id IN ('trace', 'route', 'tempo', 'escape')
  ),
  difficulty TEXT NOT NULL CHECK (
    difficulty IN ('foundation', 'advanced', 'elite')
  ),
  scenario_version INTEGER NOT NULL CHECK (
    scenario_version BETWEEN 1 AND 32767
  ),
  scenario_seed TEXT NOT NULL CHECK (
    scenario_seed ~ '^[A-Za-z0-9._:-]{1,96}$'
  ),
  completed BOOLEAN NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 0 AND 100),
  medal TEXT NOT NULL CHECK (
    medal IN ('none', 'bronze', 'silver', 'gold', 'prismatic')
  ),
  accuracy INTEGER NOT NULL CHECK (accuracy BETWEEN 0 AND 100),
  efficiency INTEGER NOT NULL CHECK (efficiency BETWEEN 0 AND 100),
  consistency INTEGER NOT NULL CHECK (consistency BETWEEN 0 AND 100),
  ticks INTEGER NOT NULL CHECK (ticks BETWEEN 0 AND 240),
  trace JSONB NOT NULL CHECK (
    jsonb_typeof(trace) = 'array'
    AND jsonb_array_length(trace) <= 241
  ),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, exercise_id, difficulty)
);

CREATE INDEX training_bests_player_updated_idx
  ON training_bests(player_id, updated_at DESC);

CREATE TABLE training_presets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (
    char_length(BTRIM(name)) BETWEEN 1 AND 40
  ),
  dynasty TEXT NOT NULL CHECK (dynasty IN ('PRIMAL', 'CYBER', 'COSMIC')),
  tick_ms INTEGER NOT NULL CHECK (tick_ms BETWEEN 50 AND 250),
  start_length INTEGER NOT NULL CHECK (start_length BETWEEN 3 AND 8),
  path JSONB NOT NULL CHECK (
    jsonb_typeof(path) = 'array'
    AND jsonb_array_length(path) BETWEEN 5 AND 120
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX training_presets_player_updated_idx
  ON training_presets(player_id, updated_at DESC);

COMMENT ON TABLE training_attempts IS
  'Server-replayed rewardless Training Lab attempts. No economy or progression effects.';
COMMENT ON TABLE training_bests IS
  'Current server-verified Training Lab best per player, drill, and difficulty.';
COMMENT ON TABLE training_presets IS
  'Player-owned Training Lab sandbox geometry, capped to 20 rows per player.';

-- All access is through service-role API routes. Enabling RLS without browser
-- policies creates a deny-by-default boundary even if table privileges change.
ALTER TABLE training_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_bests ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_presets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE training_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE training_bests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE training_presets FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE training_attempts TO service_role;
GRANT ALL PRIVILEGES ON TABLE training_bests TO service_role;
GRANT ALL PRIVILEGES ON TABLE training_presets TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Atomic verified-attempt recorder and deterministic PB comparison
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION record_training_attempt(
  p_player_id UUID,
  p_exercise_id TEXT,
  p_difficulty TEXT,
  p_scenario_version INTEGER,
  p_scenario_seed TEXT,
  p_completed BOOLEAN,
  p_rating INTEGER,
  p_medal TEXT,
  p_accuracy INTEGER,
  p_efficiency INTEGER,
  p_consistency INTEGER,
  p_ticks INTEGER,
  p_metrics JSONB,
  p_trace JSONB
) RETURNS JSONB AS $$
DECLARE
  v_attempt_id UUID;
  v_best training_bests%ROWTYPE;
BEGIN
  IF p_player_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM players WHERE id = p_player_id
  ) THEN
    RAISE EXCEPTION 'Training player not found';
  END IF;
  IF p_exercise_id NOT IN ('trace', 'route', 'tempo', 'escape') THEN
    RAISE EXCEPTION 'Invalid training exercise';
  END IF;
  IF p_difficulty NOT IN ('foundation', 'advanced', 'elite') THEN
    RAISE EXCEPTION 'Invalid training difficulty';
  END IF;
  IF p_scenario_version IS NULL OR p_scenario_version NOT BETWEEN 1 AND 32767 THEN
    RAISE EXCEPTION 'Invalid training scenario version';
  END IF;
  IF p_scenario_seed IS NULL
     OR p_scenario_seed !~ '^[A-Za-z0-9._:-]{1,96}$' THEN
    RAISE EXCEPTION 'Invalid training scenario seed';
  END IF;
  IF p_completed IS NULL
     OR p_rating IS NULL OR p_rating NOT BETWEEN 0 AND 100
     OR p_accuracy IS NULL OR p_accuracy NOT BETWEEN 0 AND 100
     OR p_efficiency IS NULL OR p_efficiency NOT BETWEEN 0 AND 100
     OR p_consistency IS NULL OR p_consistency NOT BETWEEN 0 AND 100
     OR p_ticks IS NULL OR p_ticks NOT BETWEEN 0 AND 240
     OR p_medal IS NULL
     OR p_medal NOT IN ('none', 'bronze', 'silver', 'gold', 'prismatic') THEN
    RAISE EXCEPTION 'Invalid training metrics';
  END IF;
  IF p_metrics IS NULL
     OR jsonb_typeof(p_metrics) IS DISTINCT FROM 'object'
     OR octet_length(p_metrics::TEXT) > 65536 THEN
    RAISE EXCEPTION 'Invalid training metric payload';
  END IF;
  IF p_trace IS NULL
     OR jsonb_typeof(p_trace) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_trace) > 241
     OR octet_length(p_trace::TEXT) > 131072 THEN
    RAISE EXCEPTION 'Invalid training trace payload';
  END IF;

  -- Serialize a player's result writes so simultaneous verification requests
  -- cannot race the PB comparison or return different winning rows.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'training-attempt:' || p_player_id::TEXT || ':' ||
      p_exercise_id || ':' || p_difficulty,
      0
    )
  );

  INSERT INTO training_attempts (
    player_id,
    exercise_id,
    difficulty,
    scenario_version,
    scenario_seed,
    completed,
    rating,
    medal,
    accuracy,
    efficiency,
    consistency,
    ticks,
    metrics,
    trace
  ) VALUES (
    p_player_id,
    p_exercise_id,
    p_difficulty,
    p_scenario_version,
    p_scenario_seed,
    p_completed,
    p_rating,
    p_medal,
    p_accuracy,
    p_efficiency,
    p_consistency,
    p_ticks,
    p_metrics,
    p_trace
  )
  RETURNING id INTO v_attempt_id;

  -- Product contract: completion wins first, followed by accuracy,
  -- efficiency, consistency, and finally fewer ticks. Rating remains the
  -- compact display summary but cannot promote a faster sloppy line.
  INSERT INTO training_bests (
    player_id,
    exercise_id,
    difficulty,
    scenario_version,
    scenario_seed,
    completed,
    rating,
    medal,
    accuracy,
    efficiency,
    consistency,
    ticks,
    trace
  ) VALUES (
    p_player_id,
    p_exercise_id,
    p_difficulty,
    p_scenario_version,
    p_scenario_seed,
    p_completed,
    p_rating,
    p_medal,
    p_accuracy,
    p_efficiency,
    p_consistency,
    p_ticks,
    p_trace
  )
  ON CONFLICT (player_id, exercise_id, difficulty) DO UPDATE
  SET scenario_version = EXCLUDED.scenario_version,
      scenario_seed = EXCLUDED.scenario_seed,
      completed = EXCLUDED.completed,
      rating = EXCLUDED.rating,
      medal = EXCLUDED.medal,
      accuracy = EXCLUDED.accuracy,
      efficiency = EXCLUDED.efficiency,
      consistency = EXCLUDED.consistency,
      ticks = EXCLUDED.ticks,
      trace = EXCLUDED.trace,
      updated_at = NOW()
  WHERE ROW(
      CASE WHEN EXCLUDED.completed THEN 1 ELSE 0 END,
      EXCLUDED.accuracy,
      EXCLUDED.efficiency,
      EXCLUDED.consistency,
      -EXCLUDED.ticks
    ) > ROW(
      CASE WHEN training_bests.completed THEN 1 ELSE 0 END,
      training_bests.accuracy,
      training_bests.efficiency,
      training_bests.consistency,
      -training_bests.ticks
    );

  SELECT * INTO STRICT v_best
  FROM training_bests
  WHERE player_id = p_player_id
    AND exercise_id = p_exercise_id
    AND difficulty = p_difficulty;

  RETURN jsonb_build_object(
    'attemptId', v_attempt_id,
    'best', to_jsonb(v_best)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION record_training_attempt(
  UUID, TEXT, TEXT, INTEGER, TEXT, BOOLEAN, INTEGER, TEXT,
  INTEGER, INTEGER, INTEGER, INTEGER, JSONB, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_training_attempt(
  UUID, TEXT, TEXT, INTEGER, TEXT, BOOLEAN, INTEGER, TEXT,
  INTEGER, INTEGER, INTEGER, INTEGER, JSONB, JSONB
) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Concurrent-safe, bounded preset creation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION save_training_preset(
  p_player_id UUID,
  p_name TEXT,
  p_dynasty TEXT,
  p_tick_ms INTEGER,
  p_start_length INTEGER,
  p_path JSONB
) RETURNS JSONB AS $$
DECLARE
  v_preset training_presets%ROWTYPE;
BEGIN
  IF p_player_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM players WHERE id = p_player_id
  ) THEN
    RAISE EXCEPTION 'Training player not found';
  END IF;
  IF p_name IS NULL OR char_length(BTRIM(p_name)) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Invalid training preset name';
  END IF;
  IF p_dynasty NOT IN ('PRIMAL', 'CYBER', 'COSMIC')
     OR p_tick_ms IS NULL OR p_tick_ms NOT BETWEEN 50 AND 250
     OR p_start_length IS NULL OR p_start_length NOT BETWEEN 3 AND 8 THEN
    RAISE EXCEPTION 'Invalid training preset configuration';
  END IF;
  IF p_path IS NULL
     OR jsonb_typeof(p_path) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_path) NOT BETWEEN 5 AND 120
     OR octet_length(p_path::TEXT) > 32768 THEN
    RAISE EXCEPTION 'Invalid training preset path';
  END IF;

  -- Validate types before numeric casts so malformed JSON produces the same
  -- bounded application error rather than a partially evaluated insert.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_path) AS cell
    WHERE jsonb_typeof(cell) IS DISTINCT FROM 'object'
       OR jsonb_typeof(cell -> 'x') IS DISTINCT FROM 'number'
       OR jsonb_typeof(cell -> 'z') IS DISTINCT FROM 'number'
  ) THEN
    RAISE EXCEPTION 'Invalid training preset path cell';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_path) AS cell
    WHERE (cell ->> 'x')::NUMERIC <> TRUNC((cell ->> 'x')::NUMERIC)
       OR (cell ->> 'z')::NUMERIC <> TRUNC((cell ->> 'z')::NUMERIC)
       OR (cell ->> 'x')::NUMERIC NOT BETWEEN 0 AND 19
       OR (cell ->> 'z')::NUMERIC NOT BETWEEN 0 AND 19
  ) THEN
    RAISE EXCEPTION 'Training preset path leaves the board';
  END IF;

  IF EXISTS (
    WITH cells AS (
      SELECT
        ordinality,
        (cell ->> 'x')::INTEGER AS x,
        (cell ->> 'z')::INTEGER AS z
      FROM jsonb_array_elements(p_path) WITH ORDINALITY AS point(cell, ordinality)
    )
    SELECT 1 FROM cells GROUP BY x, z HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Training preset path cannot cross itself';
  END IF;

  IF EXISTS (
    WITH cells AS (
      SELECT
        ordinality,
        (cell ->> 'x')::INTEGER AS x,
        (cell ->> 'z')::INTEGER AS z
      FROM jsonb_array_elements(p_path) WITH ORDINALITY AS point(cell, ordinality)
    ), pairs AS (
      SELECT
        ordinality,
        x,
        z,
        LAG(x) OVER (ORDER BY ordinality) AS previous_x,
        LAG(z) OVER (ORDER BY ordinality) AS previous_z
      FROM cells
    )
    SELECT 1
    FROM pairs
    WHERE ordinality > 1
      AND ABS(x - previous_x) + ABS(z - previous_z) <> 1
  ) THEN
    RAISE EXCEPTION 'Training preset path cells must be adjacent';
  END IF;

  -- The lock makes the 20-row cap authoritative under concurrent saves.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('training-preset:' || p_player_id::TEXT, 0)
  );

  IF (SELECT COUNT(*) FROM training_presets WHERE player_id = p_player_id) >= 20 THEN
    RAISE EXCEPTION 'Training preset limit reached (20)';
  END IF;

  INSERT INTO training_presets (
    player_id,
    name,
    dynasty,
    tick_ms,
    start_length,
    path
  ) VALUES (
    p_player_id,
    BTRIM(p_name),
    p_dynasty,
    p_tick_ms,
    p_start_length,
    p_path
  )
  RETURNING * INTO v_preset;

  RETURN to_jsonb(v_preset);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION save_training_preset(
  UUID, TEXT, TEXT, INTEGER, INTEGER, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION save_training_preset(
  UUID, TEXT, TEXT, INTEGER, INTEGER, JSONB
) TO service_role;

COMMIT;
