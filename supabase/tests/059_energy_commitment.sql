-- Local integration contract for migration 059.
-- Run against an isolated `supabase db reset` database only:
--   psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/059_energy_commitment.sql

BEGIN;

-- Post-061 every earning completion must cross the same durable service
-- ingress as production. The fixture builds a strict server snapshot, stores
-- it, commits that transaction boundary logically, and adopts separately.
CREATE OR REPLACE FUNCTION pg_temp.complete_atomic_test_session(
  p_session_id UUID,
  p_ended_at TIMESTAMPTZ DEFAULT clock_timestamp()
) RETURNS JSONB AS $$
DECLARE
  v_session game_sessions%ROWTYPE;
  v_user_id UUID;
  v_generation INTEGER := 1;
  v_snapshot JSONB;
  v_envelope JSONB;
  v_result JSONB;
BEGIN
  SELECT gs.* INTO v_session
  FROM game_sessions gs
  WHERE gs.id = p_session_id;
  IF NOT FOUND OR v_session.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'TEST_SESSION_NOT_OPEN';
  END IF;
  SELECT p.user_id INTO v_user_id FROM players p WHERE p.id = v_session.player_id;
  IF v_session.snake_used_id IS NOT NULL THEN
    SELECT GREATEST(COALESCE(cs.generation, 1), 1)
      INTO v_generation
      FROM collected_snakes cs WHERE cs.id = v_session.snake_used_id;
    v_generation := COALESCE(v_generation, 1);
  END IF;
  v_snapshot := jsonb_build_object(
    'v', 1, 'settledAt', p_ended_at, 'dynasty', v_session.dynasty,
    'extracted', COALESCE(v_session.extracted, FALSE),
    'died', COALESCE(v_session.died, FALSE),
    'validated', COALESCE(v_session.validated, FALSE),
    'score', GREATEST(COALESCE(v_session.score, 0), 0),
    'yieldDna', GREATEST(COALESCE(v_session.yield_dna, 0), 0),
    'dnaCredited', GREATEST(COALESCE(v_session.dna_earned, 0), 0),
    'energyCommitted', GREATEST(COALESCE(v_session.energy_committed, 0), 0),
    'commitmentMultiplierBps', GREATEST(
      COALESCE(v_session.energy_harvest_multiplier_bps, 0), 0
    ),
    'generation', v_generation, 'snakeId', v_session.snake_used_id,
    'masteryXp', 0, 'ladderRung', 0,
    'genome', COALESCE(v_session.genome, 'null'::JSONB),
    'rewardMetadata', '{}'::JSONB,
    'clan', jsonb_build_object(
      'bestCount', 5, 'completionGraceSeconds', 10800,
      'maxRunDurationSeconds', 10800
    )
  );
  v_envelope := jsonb_build_object(
    'kind', 'career_pending_end_v1', 'v', 1,
    'userId', v_user_id, 'playerId', v_session.player_id,
    'sessionId', v_session.id, 'capturedAt', p_ended_at,
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
      'durationSeconds', GREATEST(COALESCE(v_session.duration_seconds, 0), 0),
      'victory', COALESCE(v_session.victory, FALSE),
      'foodsCollected', GREATEST(COALESCE(v_session.foods_collected, 0), 0),
      'mutations', v_session.mutations, 'deathCause', v_session.death_cause,
      'runEvents', v_session.run_events,
      'validationErrors', v_session.validation_errors
    )
  );
  v_result := stage_pending_game_session_end(
    v_user_id, v_session.player_id, v_session.id, v_envelope
  );
  IF v_result ->> 'state' <> 'staged' THEN
    RAISE EXCEPTION 'TEST_STAGE_FAILED: %', v_result;
  END IF;
  v_result := adopt_pending_game_session_end(v_session.id);
  IF v_result ->> 'state' <> 'adopted' THEN
    RAISE EXCEPTION 'TEST_ADOPTION_FAILED: %', v_result;
  END IF;
  RETURN v_snapshot;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  v_user UUID := '05900000-0000-0000-0000-000000000001';
  v_player UUID := '05900000-0000-0000-0000-000000000002';
  v_clan UUID := '05900000-0000-0000-0000-000000000003';
  v_switched_clan UUID := '05900000-0000-0000-0000-000000000007';
  v_snake UUID := '05900000-0000-0000-0000-000000000004';
  v_session UUID := '05900000-0000-0000-0000-000000000005';
  v_variant UUID;
  v_read RECORD;
  v_legacy RECORD;
  v_commit RECORD;
  v_retry RECORD;
  v_run RECORD;
  v_result JSONB;
  v_first_contribution_session UUID;
  v_last_contribution_session UUID;
  v_before_count INTEGER;
  v_after_count INTEGER;
  v_counted_count INTEGER;
  v_counted_sum BIGINT;
  v_side_score BIGINT;
  v_i INTEGER;
BEGIN
  SELECT id INTO v_variant FROM snake_variants ORDER BY created_at, id LIMIT 1;
  IF v_variant IS NULL THEN
    RAISE EXCEPTION '059 test fixture requires one seeded snake variant';
  END IF;

  INSERT INTO auth.users(id, aud, role, email, created_at, updated_at)
  VALUES (v_user, 'authenticated', 'authenticated', 'energy-059@example.test', NOW(), NOW());

  -- The auth trigger provisions the canonical player row.
  SELECT id INTO v_player FROM players WHERE user_id = v_user;
  UPDATE players
     SET username = 'energy_059', handle = 'energy_059', stored_energy = 2,
         energy_updated_at = NOW() - INTERVAL '90 minutes'
   WHERE id = v_player;

  INSERT INTO collected_snakes(id, player_id, snake_variant_id, generation, is_equipped)
  VALUES (v_snake, v_player, v_variant, 7, TRUE);

  INSERT INTO clans(id, name, tag, owner_id)
  VALUES (v_clan, 'Energy Contract Clan', 'E59', v_user);

  INSERT INTO clan_members(clan_id, player_id, role)
  VALUES (v_clan, v_user, 'owner');

  -- Ninety minutes offline restores exactly one unit and preserves the
  -- remaining thirty minutes of partial progress in the server-time anchor.
  SELECT * INTO v_read FROM read_player_energy(v_player, 6, 3600);
  IF v_read.energy_available <> 3 OR v_read.energy_recovered <> 1 THEN
    RAISE EXCEPTION 'offline/partial recovery mismatch: %', row_to_json(v_read);
  END IF;
  IF v_read.server_now - v_read.energy_updated_at < INTERVAL '29 minutes 59 seconds'
     OR v_read.server_now - v_read.energy_updated_at > INTERVAL '30 minutes 1 second' THEN
    RAISE EXCEPTION 'partial recovery anchor was not preserved: %', row_to_json(v_read);
  END IF;

  INSERT INTO game_sessions(id, player_id, snake_used_id, snake_variant_id, dynasty)
  VALUES (v_session, v_player, v_snake, v_variant, 'PRIMAL');

  SELECT * INTO v_commit FROM commit_run_energy(
    v_player, v_session, 2, FALSE, 6, 3600,
    ARRAY[10000, 22000, 36000, 52000, 72000, 100000],
    NOW() - INTERVAL '1 hour', 259200, 86400, 5
  );

  IF v_commit.energy_available_before <> 3
     OR v_commit.energy_available <> 1
     OR v_commit.energy_committed <> 2
     OR v_commit.commitment_multiplier_bps <> 22000
     OR v_commit.clan_battle_id IS NULL THEN
    RAISE EXCEPTION 'commitment snapshot mismatch: %', row_to_json(v_commit);
  END IF;

  -- Starting the same session twice is idempotent and cannot spend twice.
  SELECT * INTO v_retry FROM commit_run_energy(
    v_player, v_session, 2, FALSE, 6, 3600,
    ARRAY[10000, 22000, 36000, 52000, 72000, 100000],
    NOW() - INTERVAL '1 hour', 259200, 86400, 5
  );
  IF v_retry.energy_available <> 1 OR v_retry.energy_committed <> 2 THEN
    RAISE EXCEPTION 'idempotent retry changed Energy: %', row_to_json(v_retry);
  END IF;

  -- Migration 063 permits only one open run per player. Close the first run
  -- through the same no-refund abandonment state before modelling a distinct
  -- later start; the player stock remains the concurrency assertion.
  UPDATE game_sessions
     SET ended_at = NOW(), end_reason = 'abandoned', validated = TRUE
   WHERE id = v_session;
  IF (SELECT stored_energy FROM players WHERE id = v_player) <> 1 THEN
    RAISE EXCEPTION 'abandonment incorrectly refunded committed Energy';
  END IF;

  -- A distinct later start cannot spend stock consumed by the first session.
  -- The player-row lock remains the live concurrency serialization boundary;
  -- migration 063 independently rejects two simultaneously open runs.
  INSERT INTO game_sessions(id, player_id, snake_used_id, snake_variant_id, dynasty)
  VALUES ('05900000-0000-0000-0000-000000000006', v_player, v_snake, v_variant, 'PRIMAL');
  BEGIN
    PERFORM * FROM commit_run_energy(
      v_player, '05900000-0000-0000-0000-000000000006', 2, FALSE, 6, 3600,
      ARRAY[10000, 22000, 36000, 52000, 72000, 100000],
      NOW() - INTERVAL '1 hour', 259200, 86400, 5
    );
    RAISE EXCEPTION 'insufficient distinct start unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'insufficient distinct start unexpectedly succeeded' THEN RAISE; END IF;
    IF POSITION('insufficient_energy' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
  IF (SELECT stored_energy FROM players WHERE id = v_player) <> 1 THEN
    RAISE EXCEPTION 'rejected distinct start changed Energy';
  END IF;
  UPDATE game_sessions SET ended_at = NOW(), end_reason = 'abandoned'
   WHERE id = '05900000-0000-0000-0000-000000000006';

  -- Locked commitment properties cannot be rewritten by a later client or
  -- settlement path.
  BEGIN
    UPDATE game_sessions SET energy_committed = 6 WHERE id = v_session;
    RAISE EXCEPTION 'immutable commitment update unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'immutable commitment update unexpectedly succeeded' THEN RAISE; END IF;
    IF POSITION('energy_commitment_immutable' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;

  -- A future client-influenced timestamp is clamped to authoritative NOW()
  -- and can never manufacture recovery. Long offline recovery stops at cap.
  UPDATE players SET stored_energy = 2, energy_updated_at = NOW() + INTERVAL '1 day'
   WHERE id = v_player;
  SELECT * INTO v_read FROM read_player_energy(v_player, 6, 3600);
  IF v_read.energy_available <> 2 OR v_read.energy_updated_at > v_read.server_now THEN
    RAISE EXCEPTION 'future anchor manipulation was not clamped: %', row_to_json(v_read);
  END IF;

  UPDATE players SET stored_energy = 5, energy_updated_at = NOW() - INTERVAL '10 hours'
   WHERE id = v_player;
  SELECT * INTO v_read FROM read_player_energy(v_player, 6, 3600);
  IF v_read.energy_available <> 6 OR v_read.energy_recovered <> 1 THEN
    RAISE EXCEPTION 'recovery cap mismatch: %', row_to_json(v_read);
  END IF;

  -- An emergency rollback to the migration-039 app must not revive the old
  -- daily envelope as a second stock. Its unchanged RPC consumes exactly one
  -- unit from recovering Energy, and a second call correctly reports lean.
  UPDATE players SET stored_energy = 1, energy_updated_at = NOW()
   WHERE id = v_player;
  SELECT * INTO v_legacy FROM consume_run_charge(v_player, 6);
  IF v_legacy.charged IS NOT TRUE
     OR v_legacy.charges_used <> 6
     OR (SELECT stored_energy FROM players WHERE id = v_player) <> 0 THEN
    RAISE EXCEPTION 'legacy rollback bridge did not consume stored Energy: %', row_to_json(v_legacy);
  END IF;
  SELECT * INTO v_legacy FROM consume_run_charge(v_player, 6);
  IF v_legacy.charged IS TRUE
     OR (SELECT stored_energy FROM players WHERE id = v_player) <> 0 THEN
    RAISE EXCEPTION 'legacy rollback bridge manufactured a second pool: %', row_to_json(v_legacy);
  END IF;

  -- Six eligible normal runs prove automatic assignment, top-five insertion,
  -- replacement, atomic side totals, idempotence, and that the ×10 harvest
  -- multiplier is NOT silently applied to clan score.
  FOR v_i IN 1..6 LOOP
    v_last_contribution_session := ('05900000-0000-0000-0001-' || LPAD(v_i::TEXT, 12, '0'))::UUID;
    IF v_i = 1 THEN v_first_contribution_session := v_last_contribution_session; END IF;

    UPDATE players SET stored_energy = 6, energy_updated_at = NOW() WHERE id = v_player;
    INSERT INTO game_sessions(
      id, player_id, snake_used_id, snake_variant_id, dynasty, started_at,
      run_context
    ) VALUES (
      v_last_contribution_session, v_player, v_snake, v_variant, 'PRIMAL', NOW(),
      jsonb_build_object('snake', jsonb_build_object('generation', 7))
    );

    SELECT * INTO v_run FROM commit_run_energy(
      v_player, v_last_contribution_session,
      CASE WHEN v_i = 6 THEN 6 ELSE 1 END,
      FALSE, 6, 3600,
      ARRAY[10000, 22000, 36000, 52000, 72000, 100000],
      NOW() - INTERVAL '1 hour', 259200, 86400, 5
    );

    IF v_run.clan_battle_id IS DISTINCT FROM v_commit.clan_battle_id THEN
      RAISE EXCEPTION 'eligible runs were not assigned to the same active battle';
    END IF;

    -- Simulate a generation change in another tab after the first run starts.
    -- Every contribution must keep the generation in its own start context.
    IF v_i = 1 THEN
      UPDATE collected_snakes SET generation = 11 WHERE id = v_snake;
    END IF;

    UPDATE game_sessions
       SET started_at = NOW() - INTERVAL '60 seconds', validated = TRUE,
           extracted = TRUE,
           duration_seconds = 60, score = v_i * 100,
           yield_dna = v_i * 100, dna_earned = v_i * 100
     WHERE id = v_last_contribution_session;
    PERFORM pg_temp.complete_atomic_test_session(v_last_contribution_session);

    v_result := record_clan_energy_contribution(v_last_contribution_session, 5, 10800, 10800);
    IF COALESCE((v_result ->> 'eligible')::BOOLEAN, FALSE) IS NOT TRUE THEN
      RAISE EXCEPTION 'valid contribution rejected: %', v_result;
    END IF;
  END LOOP;

  SELECT COUNT(*), COALESCE(SUM(score), 0)
    INTO v_counted_count, v_counted_sum
    FROM clan_energy_contributions
   WHERE player_id = v_player AND counted IS TRUE;
  IF v_counted_count <> 5 OR v_counted_sum <> 2000 THEN
    RAISE EXCEPTION 'best-five set mismatch: count %, sum %', v_counted_count, v_counted_sum;
  END IF;

  IF (SELECT counted FROM clan_energy_contributions WHERE session_id = v_first_contribution_session) IS TRUE THEN
    RAISE EXCEPTION 'sixth result did not replace the weakest result';
  END IF;

  SELECT score INTO v_side_score
    FROM clan_energy_battle_sides
   WHERE id = v_run.clan_battle_side_id;
  IF v_side_score <> 2000 THEN
    RAISE EXCEPTION 'atomic clan side total mismatch: %', v_side_score;
  END IF;

  SELECT * INTO v_run
    FROM clan_energy_contributions
   WHERE session_id = v_last_contribution_session;
  IF v_run.energy_committed <> 6
     OR v_run.commitment_multiplier_bps <> 100000
     OR v_run.snake_generation <> 7
     OR v_run.score <> 600
     OR v_run.score_delta <> 500
     OR v_run.replaced_session_id IS DISTINCT FROM v_first_contribution_session THEN
    RAISE EXCEPTION 'replacement or score-independence mismatch: %', row_to_json(v_run);
  END IF;

  SELECT COUNT(*) INTO v_before_count FROM clan_energy_contributions;
  v_result := record_clan_energy_contribution(v_last_contribution_session, 5, 10800, 10800);
  SELECT COUNT(*) INTO v_after_count FROM clan_energy_contributions;
  IF v_before_count <> v_after_count OR (v_result ->> 'scoreDelta')::BIGINT <> 500 THEN
    RAISE EXCEPTION 'duplicate completion was not idempotent: %', v_result;
  END IF;

  -- Once five results exist the immutable start snapshot exposes the actual
  -- fifth-best score, so setup can state exactly what the next run must beat.
  UPDATE players SET stored_energy = 1, energy_updated_at = NOW() WHERE id = v_player;
  v_last_contribution_session := '05900000-0000-0000-0002-000000000001';
  INSERT INTO game_sessions(id, player_id, snake_used_id, snake_variant_id, dynasty)
  VALUES (v_last_contribution_session, v_player, v_snake, v_variant, 'PRIMAL');
  SELECT * INTO v_run FROM commit_run_energy(
    v_player, v_last_contribution_session, 1, FALSE, 6, 3600,
    ARRAY[10000, 22000, 36000, 52000, 72000, 100000],
    NOW() - INTERVAL '1 hour', 259200, 86400, 5
  );
  IF v_run.clan_fifth_threshold <> 200 THEN
    RAISE EXCEPTION 'fifth-best start threshold mismatch: %', row_to_json(v_run);
  END IF;

  -- A crash may still pay personal salvage, but it does not preserve the
  -- potential clan result. Banking/extraction is what locks a contribution.
  UPDATE game_sessions
     SET started_at = NOW() - INTERVAL '60 seconds', validated = TRUE,
         extracted = FALSE, yield_dna = 9999, dna_earned = 2499,
         duration_seconds = 60
   WHERE id = v_last_contribution_session;
  PERFORM pg_temp.complete_atomic_test_session(v_last_contribution_session);
  v_result := record_clan_energy_contribution(v_last_contribution_session, 5, 10800, 10800);
  IF COALESCE((v_result ->> 'eligible')::BOOLEAN, FALSE) IS TRUE
     OR EXISTS (
       SELECT 1 FROM clan_energy_contributions
        WHERE session_id = v_last_contribution_session
     ) THEN
    RAISE EXCEPTION 'crashed run incorrectly preserved a clan contribution: %', v_result;
  END IF;

  -- Personal long runs remain valid, but an excessively delayed completion
  -- cannot be held open to exploit a later clan result.
  UPDATE players SET stored_energy = 1, energy_updated_at = NOW() WHERE id = v_player;
  v_last_contribution_session := '05900000-0000-0000-0003-000000000001';
  INSERT INTO game_sessions(id, player_id, snake_used_id, snake_variant_id, dynasty)
  VALUES (v_last_contribution_session, v_player, v_snake, v_variant, 'PRIMAL');
  SELECT * INTO v_run FROM commit_run_energy(
    v_player, v_last_contribution_session, 1, FALSE, 6, 3600,
    ARRAY[10000, 22000, 36000, 52000, 72000, 100000],
    NOW() - INTERVAL '1 hour', 259200, 86400, 5
  );
  UPDATE game_sessions
     SET started_at = NOW() - INTERVAL '2 minutes',
         validated = TRUE, extracted = TRUE, duration_seconds = 120,
         yield_dna = 10000, dna_earned = 10000
   WHERE id = v_last_contribution_session;
  PERFORM pg_temp.complete_atomic_test_session(v_last_contribution_session);
  v_result := record_clan_energy_contribution(v_last_contribution_session, 5, 10800, 60);
  IF COALESCE((v_result ->> 'eligible')::BOOLEAN, FALSE) IS TRUE THEN
    RAISE EXCEPTION 'overlong run incorrectly remained clan-eligible: %', v_result;
  END IF;

  -- Settlement banks non-power Depth/history for both sides exactly once.
  UPDATE clan_energy_battles
     SET starts_at = NOW() - INTERVAL '8 hours',
         ends_at = NOW() - INTERVAL '4 hours',
         intermission_ends_at = NOW() + INTERVAL '20 hours'
   WHERE id = v_commit.clan_battle_id;
  v_i := settle_clan_energy_battles(10800);
  IF v_i <> 1 THEN
    RAISE EXCEPTION 'due battle did not settle exactly once: %', v_i;
  END IF;
  IF (SELECT lifetime_depth FROM players WHERE id = v_player) <> 2000
     OR (SELECT best_week_depth FROM players WHERE id = v_player) <> 2000
     OR (SELECT lifetime_depth FROM clans WHERE id = v_clan) <> 2000
     OR (SELECT best_week_depth FROM clans WHERE id = v_clan) <> 2000 THEN
    RAISE EXCEPTION 'settlement did not bank exact player/clan Depth';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM clan_energy_honors
     WHERE battle_id = v_commit.clan_battle_id
       AND player_id = v_player
       AND honor = 'participant'
  ) THEN
    RAISE EXCEPTION 'unmatched contributor did not receive participation honor';
  END IF;
  IF settle_clan_energy_battles(10800) <> 0
     OR (SELECT lifetime_depth FROM players WHERE id = v_player) <> 2000 THEN
    RAISE EXCEPTION 'settlement retry was not idempotent';
  END IF;

  -- Switching clans during the same cycle cannot redirect later attempts or
  -- even create an empty side/pairing for the new clan.
  INSERT INTO clans(id, name, tag, owner_id)
  VALUES (v_switched_clan, 'Switched Energy Clan', 'S59', v_user);
  UPDATE clan_members SET clan_id = v_switched_clan WHERE player_id = v_user;
  UPDATE players SET stored_energy = 1, energy_updated_at = NOW() WHERE id = v_player;
  v_last_contribution_session := '05900000-0000-0000-0004-000000000001';
  INSERT INTO game_sessions(id, player_id, snake_used_id, snake_variant_id, dynasty)
  VALUES (v_last_contribution_session, v_player, v_snake, v_variant, 'PRIMAL');
  SELECT * INTO v_run FROM commit_run_energy(
    v_player, v_last_contribution_session, 1, FALSE, 6, 3600,
    ARRAY[10000, 22000, 36000, 52000, 72000, 100000],
    NOW() - INTERVAL '1 hour', 259200, 86400, 5
  );
  IF v_run.clan_battle_id IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM clan_energy_battle_sides s
        WHERE s.clan_id = v_switched_clan
     ) THEN
    RAISE EXCEPTION 'clan switch redirected the run or created a pairing side';
  END IF;
END;
$$;

ROLLBACK;
