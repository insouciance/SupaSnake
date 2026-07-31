-- Additive schema-060 durable server-only earning-end ingress. This file uses
-- no 061 object: it can run before the hard Career migration. Cross-process
-- store→adopt survival and canonical adoption order are proved by the 061
-- dblink concurrency test.

BEGIN;

DO $$
DECLARE
  v_user UUID := '06010000-0000-0000-0000-000000000001';
  v_player UUID;
  v_variant UUID;
  v_snake UUID := '06010000-0000-0000-0000-000000000002';
  v_session UUID := '06010000-0000-0000-0000-000000000003';
  v_started TIMESTAMPTZ := clock_timestamp() - INTERVAL '90 seconds';
  v_captured TIMESTAMPTZ := clock_timestamp();
  v_snapshot JSONB;
  v_envelope JSONB;
  v_stage JSONB;
  v_retry JSONB;
  v_before_dna BIGINT;
BEGIN
  -- No browser or service client gets direct table authority. All access is
  -- through narrow service-only functions; RLS is defense in depth.
  IF has_table_privilege('anon', 'pending_game_session_ends', 'SELECT')
     OR has_table_privilege('anon', 'pending_game_session_ends', 'INSERT')
     OR has_table_privilege('authenticated', 'pending_game_session_ends', 'SELECT')
     OR has_table_privilege('authenticated', 'pending_game_session_ends', 'INSERT')
     OR has_table_privilege('service_role', 'pending_game_session_ends', 'SELECT')
     OR has_table_privilege('service_role', 'pending_game_session_ends', 'INSERT') THEN
    RAISE EXCEPTION 'pending end table leaked direct role privilege';
  END IF;
  IF has_table_privilege('anon', 'game_sessions', 'INSERT')
     OR has_table_privilege('authenticated', 'game_sessions', 'INSERT')
     OR has_table_privilege('authenticated', 'game_sessions', 'UPDATE') THEN
    RAISE EXCEPTION 'browser role can manufacture or mutate a game session';
  END IF;
  IF has_function_privilege(
       'authenticated',
       'stage_pending_game_session_end(uuid,uuid,uuid,jsonb)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'stage_pending_game_session_end(uuid,uuid,uuid,jsonb)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'store_pending_game_session_end(uuid,uuid,uuid,jsonb)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'pending end RPC privilege boundary is wrong';
  END IF;

  SELECT id INTO v_variant FROM snake_variants ORDER BY created_at, id LIMIT 1;
  INSERT INTO auth.users(id, aud, role, email, created_at, updated_at)
  VALUES (
    v_user, 'authenticated', 'authenticated',
    'pending-060@example.test', NOW(), NOW()
  );
  SELECT id INTO v_player FROM players WHERE user_id = v_user;
  INSERT INTO collected_snakes(
    id, player_id, snake_variant_id, generation, acquired_method, is_equipped
  ) VALUES (v_snake, v_player, v_variant, 4, 'bred', TRUE);
  INSERT INTO game_sessions(
    id, player_id, snake_used_id, snake_variant_id, dynasty,
    started_at, server_started_at, energy_committed,
    energy_harvest_multiplier_bps
  ) VALUES (
    v_session, v_player, v_snake, v_variant, 'PRIMAL',
    v_started, v_started, 2, 22000
  );
  SELECT dna INTO v_before_dna FROM players WHERE id = v_player;

  v_snapshot := jsonb_build_object(
    'v', 1, 'settledAt', v_captured, 'dynasty', 'PRIMAL',
    'extracted', TRUE, 'died', FALSE, 'validated', TRUE,
    'score', 900, 'yieldDna', 500, 'dnaCredited', 1100,
    'energyCommitted', 2, 'commitmentMultiplierBps', 22000,
    'generation', 4, 'snakeId', v_snake, 'masteryXp', 12,
    'ladderRung', 2, 'genome', NULL,
    'rewardMetadata', jsonb_build_object('food_count', 10),
    'clan', jsonb_build_object(
      'bestCount', 5, 'completionGraceSeconds', 10800,
      'maxRunDurationSeconds', 10800
    )
  );
  v_envelope := jsonb_build_object(
    'kind', 'career_pending_end_v1', 'v', 1,
    'userId', v_user, 'playerId', v_player, 'sessionId', v_session,
    'capturedAt', v_captured, 'snapshot', v_snapshot,
    'binding', jsonb_build_object(
      'startedAt', v_started, 'dynasty', 'PRIMAL', 'snakeId', v_snake,
      'snakeVariantId', v_variant, 'runSeed', NULL, 'runContext', NULL,
      'energyCommitted', 2, 'commitmentMultiplierBps', 22000,
      'signalRunId', NULL, 'clanBattleId', NULL,
      'clanBattleSideId', NULL, 'clanId', NULL
    ),
    'sessionFacts', jsonb_build_object(
      'durationSeconds', 75, 'victory', FALSE, 'foodsCollected', 10,
      'mutations', NULL, 'deathCause', 'extracted',
      'runEvents', jsonb_build_object(
        'v', 1, 'events', jsonb_build_array(),
        'truncated', FALSE, 'suspect', FALSE
      ),
      'validationErrors', NULL
    )
  );

  v_stage := stage_pending_game_session_end(
    v_user, v_player, v_session, v_envelope
  );
  IF v_stage ->> 'state' <> 'staged'
     OR (v_stage ->> 'inserted')::BOOLEAN IS NOT TRUE THEN
    RAISE EXCEPTION 'first durable stage failed: %', v_stage;
  END IF;
  IF (SELECT ended_at FROM game_sessions WHERE id = v_session) IS NOT NULL
     OR (SELECT end_reason FROM game_sessions WHERE id = v_session) <> 'completed'
     OR (SELECT dna FROM players WHERE id = v_player) <> v_before_dna THEN
    RAISE EXCEPTION 'stage mutated completion/progress before adoption';
  END IF;

  v_retry := stage_pending_game_session_end(
    v_user, v_player, v_session, v_envelope
  );
  IF v_retry ->> 'state' <> 'staged'
     OR (v_retry ->> 'inserted')::BOOLEAN IS NOT FALSE
     OR (SELECT COUNT(*) FROM pending_game_session_ends WHERE session_id = v_session) <> 1 THEN
    RAISE EXCEPTION 'identical stage retry was not idempotent: %', v_retry;
  END IF;
  BEGIN
    PERFORM stage_pending_game_session_end(
      v_user, v_player, v_session,
      jsonb_set(v_envelope, '{snapshot,score}', '901'::JSONB)
    );
    RAISE EXCEPTION 'mismatched replay unexpectedly replaced evidence';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'mismatched replay unexpectedly replaced evidence' THEN RAISE; END IF;
    IF POSITION('PENDING_GAME_END_REPLAY_MISMATCH' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;

  -- The live ladder currently has rungs 0..7. A service bug cannot smuggle a
  -- future rung into a durable result and silently clamp it to power later.
  INSERT INTO game_sessions(
    id, player_id, snake_used_id, snake_variant_id, dynasty,
    started_at, server_started_at, energy_committed,
    energy_harvest_multiplier_bps
  ) VALUES (
    '06010000-0000-0000-0000-000000000004', v_player, v_snake, v_variant,
    'PRIMAL', v_started, v_started, 1, 10000
  );
  BEGIN
    PERFORM stage_pending_game_session_end(
      v_user, v_player, '06010000-0000-0000-0000-000000000004',
      jsonb_set(
        jsonb_set(v_envelope, '{sessionId}',
          '"06010000-0000-0000-0000-000000000004"'::JSONB),
        '{snapshot,ladderRung}', '8'::JSONB
      )
    );
    RAISE EXCEPTION 'out-of-range ladder rung was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'out-of-range ladder rung was accepted' THEN RAISE; END IF;
    IF POSITION('INVALID_PENDING_GAME_END_RESULT' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
  IF EXISTS (
    SELECT 1 FROM pending_game_session_ends
    WHERE session_id = '06010000-0000-0000-0000-000000000004'
  ) THEN RAISE EXCEPTION 'rejected envelope left durable state'; END IF;
END;
$$;

ROLLBACK;
