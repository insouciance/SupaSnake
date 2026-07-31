-- Real two-connection proof for durable receipt ordering and exactly-once
-- reward settlement. Isolated local Supabase only; never point dblink_conn at
-- hosted state.

\set ON_ERROR_STOP on

\if :{?dblink_conn}
\else
DO $$ BEGIN
  RAISE EXCEPTION 'dblink_conn is required for the isolated local concurrency test';
END $$;
\endif

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

-- Test-only service author. It emits the same strict envelope as the route and
-- lets the remote connection exercise the production per-player store lock.
CREATE OR REPLACE FUNCTION public.test_stage_career_end(
  p_session_id UUID,
  p_captured_at TIMESTAMPTZ,
  p_score INTEGER,
  p_dna INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_session game_sessions%ROWTYPE;
  v_user UUID;
  v_generation INTEGER := 1;
  v_snapshot JSONB;
  v_envelope JSONB;
BEGIN
  SELECT * INTO v_session FROM game_sessions WHERE id = p_session_id;
  SELECT p.user_id INTO v_user FROM players p WHERE p.id = v_session.player_id;
  IF v_session.snake_used_id IS NOT NULL THEN
    SELECT GREATEST(COALESCE(cs.generation, 1), 1)
      INTO v_generation FROM collected_snakes cs
      WHERE cs.id = v_session.snake_used_id;
  END IF;
  v_snapshot := jsonb_build_object(
    'v', 1, 'settledAt', p_captured_at, 'dynasty', v_session.dynasty,
    'extracted', TRUE, 'died', FALSE, 'validated', TRUE,
    'score', p_score, 'yieldDna', p_dna, 'dnaCredited', p_dna,
    'energyCommitted', COALESCE(v_session.energy_committed, 0),
    'commitmentMultiplierBps', COALESCE(v_session.energy_harvest_multiplier_bps, 0),
    'generation', v_generation, 'snakeId', v_session.snake_used_id,
    'masteryXp', 0, 'ladderRung', 0, 'genome', NULL,
    'rewardMetadata', jsonb_build_object('test', 'concurrency'),
    'clan', jsonb_build_object(
      'bestCount', 5, 'completionGraceSeconds', 10800,
      'maxRunDurationSeconds', 10800
    )
  );
  v_envelope := jsonb_build_object(
    'kind', 'career_pending_end_v1', 'v', 1,
    'userId', v_user, 'playerId', v_session.player_id,
    'sessionId', v_session.id, 'capturedAt', p_captured_at,
    'snapshot', v_snapshot,
    'binding', jsonb_build_object(
      'startedAt', v_session.started_at, 'dynasty', v_session.dynasty,
      'snakeId', v_session.snake_used_id,
      'snakeVariantId', v_session.snake_variant_id,
      'runSeed', v_session.run_seed, 'runContext', v_session.run_context,
      'energyCommitted', COALESCE(v_session.energy_committed, 0),
      'commitmentMultiplierBps', COALESCE(v_session.energy_harvest_multiplier_bps, 0),
      'signalRunId', v_session.signal_objective_run_id,
      'clanBattleId', v_session.clan_energy_battle_id,
      'clanBattleSideId', v_session.clan_energy_battle_side_id,
      'clanId', v_session.clan_energy_clan_id
    ),
    'sessionFacts', jsonb_build_object(
      'durationSeconds', 60, 'victory', FALSE, 'foodsCollected', 10,
      'mutations', NULL, 'deathCause', 'extracted', 'runEvents', NULL,
      'validationErrors', NULL
    )
  );
  RETURN stage_pending_game_session_end(
    v_user, v_session.player_id, v_session.id, v_envelope
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DO $$
DECLARE
  v_user UUID := '06100000-0000-0000-0000-000000000301';
  v_player UUID;
  v_variant UUID;
  v_snake UUID := '06100000-0000-0000-0000-000000000302';
BEGIN
  DELETE FROM auth.users WHERE id IN (
    v_user,
    '06100000-0000-0000-0000-000000000401'
  );
  INSERT INTO auth.users(id, aud, role, email, created_at, updated_at)
  VALUES (
    v_user, 'authenticated', 'authenticated',
    'career-061-race@example.test', NOW(), NOW()
  );
  SELECT id INTO v_player FROM players WHERE user_id = v_user;
  UPDATE players SET dna = 1000, total_games_played = 7,
    total_dna_earned = 5000, high_score = 0 WHERE id = v_player;
  SELECT id INTO v_variant FROM snake_variants ORDER BY created_at, id LIMIT 1;
  INSERT INTO collected_snakes(
    id, player_id, snake_variant_id, generation, acquired_method, is_equipped
  ) VALUES (v_snake, v_player, v_variant, 1, 'unlock', TRUE);
  INSERT INTO game_sessions(
    id, player_id, snake_used_id, snake_variant_id, dynasty,
    started_at, server_started_at, energy_committed,
    energy_harvest_multiplier_bps
  ) VALUES
    ('06100000-0000-0000-0000-000000000303', v_player, v_snake, v_variant,
     'PRIMAL', NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '5 minutes', 1, 10000),
    ('06100000-0000-0000-0000-000000000304', v_player, v_snake, v_variant,
     'PRIMAL', NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '5 minutes', 1, 10000);
END;
$$;

SELECT extensions.dblink_connect('career_store_a', :'dblink_conn');

-- A acquires the player lock, stores, then deliberately holds the transaction
-- open. B's store cannot receive an order stamp until A commits.
SELECT extensions.dblink_send_query(
  'career_store_a',
  $query$
    SELECT public.test_stage_career_end(
      '06100000-0000-0000-0000-000000000303',
      clock_timestamp() - INTERVAL '20 seconds', 1000, 100
    )::TEXT,
    pg_sleep(3)::TEXT
  $query$
);
SELECT pg_sleep(0.5);

SELECT public.test_stage_career_end(
  '06100000-0000-0000-0000-000000000304',
  clock_timestamp() - INTERVAL '10 seconds', 2500, 200
);

CREATE TEMP TABLE career_store_result(result JSONB);
INSERT INTO career_store_result(result)
SELECT result::JSONB
FROM extensions.dblink_get_result('career_store_a')
  AS remote(result TEXT, slept TEXT);
SELECT extensions.dblink_disconnect('career_store_a');

DO $$
DECLARE
  v_player UUID;
  v_a JSONB;
  v_b JSONB;
  v_before JSONB;
BEGIN
  SELECT id INTO v_player FROM players
  WHERE user_id = '06100000-0000-0000-0000-000000000301';
  IF NOT (
    (SELECT received_at FROM pending_game_session_ends
      WHERE session_id = '06100000-0000-0000-0000-000000000303')
    <
    (SELECT received_at FROM pending_game_session_ends
      WHERE session_id = '06100000-0000-0000-0000-000000000304')
  ) THEN
    RAISE EXCEPTION 'concurrent stores lost serialized DB receipt order';
  END IF;
  IF (SELECT result ->> 'state' FROM career_store_result) <> 'staged' THEN
    RAISE EXCEPTION 'remote store did not commit durable staged debt';
  END IF;

  -- Process A can die here. B is durable too, but cannot overtake A merely
  -- because B's request happens to reach the adopter first.
  BEGIN
    PERFORM adopt_pending_game_session_end(
      '06100000-0000-0000-0000-000000000304'
    );
    RAISE EXCEPTION 'later staged end overtook process-death debt';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'later staged end overtook process-death debt' THEN RAISE; END IF;
    IF POSITION('GAME_REWARD_EARLIER_PENDING_END' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;

  PERFORM adopt_pending_game_session_end(
    '06100000-0000-0000-0000-000000000303'
  );
  PERFORM adopt_pending_game_session_end(
    '06100000-0000-0000-0000-000000000304'
  );
  IF EXISTS (
    SELECT 1
    FROM game_sessions gs
    JOIN pending_game_session_ends pending ON pending.session_id = gs.id
    WHERE gs.id IN (
      '06100000-0000-0000-0000-000000000303',
      '06100000-0000-0000-0000-000000000304'
    ) AND gs.atomic_reward_observed_at IS DISTINCT FROM pending.received_at
  ) THEN RAISE EXCEPTION 'observed progression order diverged from DB receipt order'; END IF;

  BEGIN
    PERFORM settle_game_session_reward_from_snapshot(
      v_player, '06100000-0000-0000-0000-000000000304'
    );
    RAISE EXCEPTION 'later adopted reward overtook earlier unsettled reward';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'later adopted reward overtook earlier unsettled reward' THEN RAISE; END IF;
    IF POSITION('GAME_REWARD_EARLIER_SESSION_PENDING' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;

  v_a := settle_game_session_reward_from_snapshot(
    v_player, '06100000-0000-0000-0000-000000000303'
  );
  v_b := settle_game_session_reward_from_snapshot(
    v_player, '06100000-0000-0000-0000-000000000304'
  );
  IF v_a #>> '{personal_best,before}' <> '0'
     OR v_a #>> '{personal_best,after}' <> '1000'
     OR v_b #>> '{personal_best,before}' <> '1000'
     OR v_b #>> '{personal_best,after}' <> '2500' THEN
    RAISE EXCEPTION 'PB attribution diverged from receipt order: A %, B %', v_a, v_b;
  END IF;
  IF (SELECT dna FROM players WHERE id = v_player) <> 1300
     OR (SELECT total_games_played FROM players WHERE id = v_player) <> 9
     OR (SELECT total_dna_earned FROM players WHERE id = v_player) <> 5300
     OR (SELECT high_score FROM players WHERE id = v_player) <> 2500 THEN
    RAISE EXCEPTION 'ordered reward fold lost an aggregate update';
  END IF;

  v_before := jsonb_build_object(
    'dna', (SELECT dna FROM players WHERE id = v_player),
    'games', (SELECT total_games_played FROM players WHERE id = v_player),
    'ledger', (SELECT COUNT(*) FROM game_reward_settlements WHERE player_id = v_player)
  );
  IF settle_game_session_reward_from_snapshot(
       v_player, '06100000-0000-0000-0000-000000000303'
     ) ->> 'applied' <> 'false'
     OR v_before IS DISTINCT FROM jsonb_build_object(
       'dna', (SELECT dna FROM players WHERE id = v_player),
       'games', (SELECT total_games_played FROM players WHERE id = v_player),
       'ledger', (SELECT COUNT(*) FROM game_reward_settlements WHERE player_id = v_player)
     ) THEN
    RAISE EXCEPTION 'same-session reward replay was not idempotent';
  END IF;
END;
$$;

-- App capture time is audit truth, not queue order. If C captures earlier but
-- stalls before reaching Postgres, D may be received/adopted first; C cannot
-- later become a phantom predecessor and rewrite D's PB context.
DO $$
DECLARE
  v_user UUID := '06100000-0000-0000-0000-000000000401';
  v_player UUID;
  v_variant UUID;
  v_snake UUID := '06100000-0000-0000-0000-000000000402';
  v_c UUID := '06100000-0000-0000-0000-000000000403';
  v_d UUID := '06100000-0000-0000-0000-000000000404';
  v_c_result JSONB;
  v_d_result JSONB;
BEGIN
  INSERT INTO auth.users(id, aud, role, email, created_at, updated_at)
  VALUES (
    v_user, 'authenticated', 'authenticated',
    'career-061-arrival@example.test', NOW(), NOW()
  );
  SELECT id INTO v_player FROM players WHERE user_id = v_user;
  SELECT id INTO v_variant FROM snake_variants ORDER BY created_at, id LIMIT 1;
  INSERT INTO collected_snakes(
    id, player_id, snake_variant_id, generation, acquired_method, is_equipped
  ) VALUES (v_snake, v_player, v_variant, 1, 'unlock', TRUE);
  INSERT INTO game_sessions(
    id, player_id, snake_used_id, snake_variant_id, dynasty,
    started_at, server_started_at, energy_committed,
    energy_harvest_multiplier_bps
  ) VALUES
    (v_c, v_player, v_snake, v_variant, 'CYBER',
     NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '5 minutes', 1, 10000),
    (v_d, v_player, v_snake, v_variant, 'CYBER',
     NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '5 minutes', 1, 10000);

  -- C's capturedAt is earlier, but D reaches the server first.
  PERFORM public.test_stage_career_end(
    v_d, clock_timestamp() - INTERVAL '10 seconds', 800, 80
  );
  PERFORM adopt_pending_game_session_end(v_d);
  v_d_result := settle_game_session_reward_from_snapshot(v_player, v_d);
  PERFORM public.test_stage_career_end(
    v_c, clock_timestamp() - INTERVAL '20 seconds', 1200, 120
  );
  PERFORM adopt_pending_game_session_end(v_c);
  v_c_result := settle_game_session_reward_from_snapshot(v_player, v_c);

  IF NOT (
    (SELECT captured_at FROM pending_game_session_ends WHERE session_id = v_c)
      < (SELECT captured_at FROM pending_game_session_ends WHERE session_id = v_d)
    AND
    (SELECT received_at FROM pending_game_session_ends WHERE session_id = v_d)
      < (SELECT received_at FROM pending_game_session_ends WHERE session_id = v_c)
  ) THEN RAISE EXCEPTION 'crossed capture/receipt fixture is invalid'; END IF;
  IF v_d_result #>> '{personal_best,before}' <> '0'
     OR v_d_result #>> '{personal_best,after}' <> '800'
     OR v_c_result #>> '{personal_best,before}' <> '800'
     OR v_c_result #>> '{personal_best,after}' <> '1200' THEN
    RAISE EXCEPTION 'capture time incorrectly overrode DB receipt order: D %, C %',
      v_d_result, v_c_result;
  END IF;
END;
$$;

DROP FUNCTION public.test_stage_career_end(UUID, TIMESTAMPTZ, INTEGER, INTEGER);
