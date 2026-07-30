-- Real two-connection race for migration 060's player reward fold.
-- Run only against isolated local Supabase.
-- dblink requires the local `supabase_admin` superuser for this true
-- two-connection harness. Supply a local-only connection string explicitly:
--   psql ... -U supabase_admin -v dblink_conn='<local connection string>' -f ...
-- Never point this test at a hosted database.

\set ON_ERROR_STOP on

\if :{?dblink_conn}
\else
DO $$
BEGIN
  RAISE EXCEPTION
    'dblink_conn is required for the isolated local concurrency test';
END;
$$;
\endif

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

DO $$
DECLARE
  v_user UUID := '06000000-0000-0000-0000-000000000301';
  v_player UUID;
  v_variant UUID;
  v_snake UUID := '06000000-0000-0000-0000-000000000302';
BEGIN
  DELETE FROM auth.users WHERE id = v_user;
  INSERT INTO auth.users(id, aud, role, email, created_at, updated_at)
  VALUES (v_user, 'authenticated', 'authenticated', 'career-060-race@example.test', NOW(), NOW());
  SELECT id INTO v_player FROM players WHERE user_id = v_user;
  UPDATE players SET dna = 1000, total_games_played = 7,
    total_dna_earned = 5000, high_score = 500 WHERE id = v_player;
  SELECT id INTO v_variant FROM snake_variants ORDER BY created_at, id LIMIT 1;
  INSERT INTO collected_snakes(
    id, player_id, snake_variant_id, generation, acquired_method, is_equipped
  ) VALUES (v_snake, v_player, v_variant, 1, 'unlock', TRUE);
  INSERT INTO game_sessions(
    id, player_id, snake_used_id, snake_variant_id, dynasty,
    score, dna_earned, yield_dna, validated, extracted, ended_at, end_reason,
    energy_committed, energy_harvest_multiplier_bps
  ) VALUES
    ('06000000-0000-0000-0000-000000000303', v_player, v_snake, v_variant,
     'PRIMAL', 1000, 100, 100, TRUE, TRUE, NOW(), 'completed', 1, 10000),
    ('06000000-0000-0000-0000-000000000304', v_player, v_snake, v_variant,
     'PRIMAL', 2500, 200, 200, TRUE, TRUE, NOW(), 'completed', 1, 10000);
END;
$$;

SELECT extensions.dblink_connect(
  'career_reward_a',
  :'dblink_conn'
);
SELECT extensions.dblink_connect(
  'career_reward_b',
  :'dblink_conn'
);

-- Both statements are in flight before either result is consumed. They lock
-- different sessions, then serialize on the same player row.
SELECT extensions.dblink_send_query(
  'career_reward_a',
  $$SELECT settle_game_session_reward(
    (SELECT id FROM players WHERE user_id = '06000000-0000-0000-0000-000000000301'),
    '06000000-0000-0000-0000-000000000303', 100, 1000, TRUE,
    '{"race":"a"}'::JSONB
  )::TEXT$$
);
SELECT extensions.dblink_send_query(
  'career_reward_b',
  $$SELECT settle_game_session_reward(
    (SELECT id FROM players WHERE user_id = '06000000-0000-0000-0000-000000000301'),
    '06000000-0000-0000-0000-000000000304', 200, 2500, TRUE,
    '{"race":"b"}'::JSONB
  )::TEXT$$
);

CREATE TEMP TABLE career_reward_race_results(payload JSONB);
INSERT INTO career_reward_race_results(payload)
SELECT payload::JSONB
FROM extensions.dblink_get_result('career_reward_a') AS result(payload TEXT);
INSERT INTO career_reward_race_results(payload)
SELECT payload::JSONB
FROM extensions.dblink_get_result('career_reward_b') AS result(payload TEXT);

SELECT extensions.dblink_disconnect('career_reward_a');
SELECT extensions.dblink_disconnect('career_reward_b');

DO $$
DECLARE
  v_user UUID := '06000000-0000-0000-0000-000000000301';
  v_player UUID;
  v_before JSONB;
BEGIN
  SELECT id INTO v_player FROM players WHERE user_id = v_user;
  IF (SELECT dna FROM players WHERE id = v_player) <> 1300
     OR (SELECT total_games_played FROM players WHERE id = v_player) <> 9
     OR (SELECT total_dna_earned FROM players WHERE id = v_player) <> 5300
     OR (SELECT high_score FROM players WHERE id = v_player) <> 2500 THEN
    RAISE EXCEPTION 'concurrent distinct sessions lost a player aggregate update';
  END IF;
  IF (SELECT COUNT(*) FROM game_reward_settlements WHERE player_id = v_player) <> 2
     OR (SELECT COUNT(*) FROM economy_transactions
         WHERE player_id = v_player AND source_type = 'game_reward'
           AND source_id IN (
             '06000000-0000-0000-0000-000000000303',
             '06000000-0000-0000-0000-000000000304'
           )) <> 2 THEN
    RAISE EXCEPTION 'concurrent settlement omitted or duplicated ledger history';
  END IF;
  IF (SELECT COUNT(*) FROM career_reward_race_results
      WHERE payload ->> 'applied' = 'true') <> 2 THEN
    RAISE EXCEPTION 'one concurrent first application was misclassified as replay';
  END IF;

  v_before := jsonb_build_object(
    'dna', (SELECT dna FROM players WHERE id = v_player),
    'games', (SELECT total_games_played FROM players WHERE id = v_player),
    'earned', (SELECT total_dna_earned FROM players WHERE id = v_player),
    'transactions', (SELECT COUNT(*) FROM economy_transactions
      WHERE player_id = v_player AND source_type = 'game_reward')
  );
  IF settle_game_session_reward(
       v_player, '06000000-0000-0000-0000-000000000303',
       100, 1000, TRUE, '{"race":"replay"}'::JSONB
     ) ->> 'applied' <> 'false' THEN
    RAISE EXCEPTION 'same-session replay applied twice';
  END IF;
  IF v_before IS DISTINCT FROM jsonb_build_object(
    'dna', (SELECT dna FROM players WHERE id = v_player),
    'games', (SELECT total_games_played FROM players WHERE id = v_player),
    'earned', (SELECT total_dna_earned FROM players WHERE id = v_player),
    'transactions', (SELECT COUNT(*) FROM economy_transactions
      WHERE player_id = v_player AND source_type = 'game_reward')
  ) THEN
    RAISE EXCEPTION 'same-session replay mutated aggregate or audit history';
  END IF;

  DELETE FROM auth.users WHERE id = v_user;
END;
$$;
