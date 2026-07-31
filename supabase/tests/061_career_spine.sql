-- Local integration contract for migration 061.
-- Run only against the isolated local Supabase database.

BEGIN;

-- Test-only server stamp. Production authors the same immutable payload in
-- the guarded session end request; fixtures must never bypass the protocol by
-- inserting an already-completed earning row.
CREATE OR REPLACE FUNCTION pg_temp.complete_atomic_test_session(
  p_session_id UUID,
  p_ended_at TIMESTAMPTZ DEFAULT clock_timestamp()
) RETURNS JSONB AS $$
DECLARE
  v_session game_sessions%ROWTYPE;
  v_user_id UUID;
  v_generation INTEGER := 1;
  v_payload JSONB;
  v_envelope JSONB;
  v_result JSONB;
BEGIN
  SELECT * INTO v_session FROM game_sessions WHERE id = p_session_id;
  IF NOT FOUND OR v_session.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'TEST_SESSION_NOT_OPEN';
  END IF;
  SELECT p.user_id INTO v_user_id FROM players p WHERE p.id = v_session.player_id;
  IF v_session.snake_used_id IS NOT NULL THEN
    SELECT GREATEST(COALESCE(cs.generation, 1), 1)
      INTO v_generation
      FROM collected_snakes cs
      WHERE cs.id = v_session.snake_used_id;
    v_generation := COALESCE(v_generation, 1);
  END IF;
  v_payload := jsonb_build_object(
    'v', 1,
    'settledAt', p_ended_at,
    'dynasty', v_session.dynasty,
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
    'generation', v_generation,
    'snakeId', v_session.snake_used_id,
    'masteryXp', 0,
    'ladderRung', 0,
    'genome', COALESCE(v_session.genome, 'null'::JSONB),
    'rewardMetadata', '{}'::JSONB,
    'clan', jsonb_build_object(
      'bestCount', 5,
      'completionGraceSeconds', 10800,
      'maxRunDurationSeconds', 10800
    )
  );
  v_envelope := jsonb_build_object(
    'kind', 'career_pending_end_v1', 'v', 1,
    'userId', v_user_id, 'playerId', v_session.player_id,
    'sessionId', v_session.id, 'capturedAt', p_ended_at,
    'snapshot', v_payload,
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
  RETURN v_payload;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.capture_test_progression(
  p_player_id UUID,
  p_session_id UUID
) RETURNS VOID AS $$
BEGIN
  PERFORM settle_game_session_progression_core(p_player_id, p_session_id);
  PERFORM prepare_game_session_signal_stage(p_player_id, p_session_id);
  PERFORM capture_game_session_signal_result(p_player_id, p_session_id);
  PERFORM capture_game_session_clan_result(p_player_id, p_session_id);
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  v_user UUID := '06000000-0000-0000-0000-000000000001';
  v_player UUID;
  v_variant UUID;
  v_snake UUID := '06000000-0000-0000-0000-000000000002';
  v_parent2 UUID := '06000000-0000-0000-0000-000000000003';
  v_child UUID := '06000000-0000-0000-0000-000000000004';
  v_session UUID := '06000000-0000-0000-0000-000000000005';
  v_history UUID := '06000000-0000-0000-0000-000000000006';
  v_attention UUID;
  v_envelope JSONB;
  v_first JSONB;
  v_second JSONB;
  v_transition JSONB;
  v_reward JSONB;
BEGIN
  SELECT id INTO v_variant FROM snake_variants ORDER BY created_at, id LIMIT 1;
  IF v_variant IS NULL THEN RAISE EXCEPTION '060 requires a seeded variant'; END IF;

  INSERT INTO auth.users(id, aud, role, email, created_at, updated_at)
  VALUES (v_user, 'authenticated', 'authenticated', 'career-060@example.test', NOW(), NOW());
  SELECT id INTO v_player FROM players WHERE user_id = v_user;
  IF v_player IS NULL THEN RAISE EXCEPTION 'player provisioning failed'; END IF;

  INSERT INTO collected_snakes(
    id, player_id, snake_variant_id, generation, acquired_method, is_equipped
  ) VALUES (v_snake, v_player, v_variant, 5, 'bred', TRUE);

  IF NOT EXISTS (
    SELECT 1 FROM lineage_specimens
    WHERE specimen_id = v_snake AND status = 'active'
  ) THEN RAISE EXCEPTION 'active specimen trigger did not archive the snake'; END IF;

  INSERT INTO game_sessions(
    id, player_id, snake_used_id, snake_variant_id, dynasty,
    score, dna_earned, yield_dna, validated, extracted,
    energy_committed, energy_harvest_multiplier_bps
  ) VALUES (
    v_session, v_player, v_snake, v_variant, 'PRIMAL',
    1200, 1760, 800, TRUE, TRUE, 2, 22000
  );

  PERFORM pg_temp.complete_atomic_test_session(v_session);
  v_reward := settle_game_session_reward_from_snapshot(
    v_player, v_session
  );
  PERFORM pg_temp.capture_test_progression(v_player, v_session);

  v_envelope := jsonb_build_object(
    'version', 1,
    'sessionId', v_session,
    'settledAt', NOW(),
    'outcome', 'extracted',
    'dynasty', 'PRIMAL',
    'receipt', jsonb_build_object(
      'validated', true, 'score', 1200, 'yieldDna', 800, 'dnaCredited', 1760,
      'energyCommitted', 2, 'commitmentMultiplierBps', 22000,
      'generation', 5, 'personalBest', v_reward -> 'personal_best'
    ),
    'impacts', jsonb_build_array(
      jsonb_build_object(
        'key', 'lineage:' || v_snake || ':run', 'pillar', 'lineage',
        'kind', 'lineage_run', 'significance', 'routine',
        'headline', 'Gen 5 history advanced', 'destination', 'lineage'
      ),
      jsonb_build_object(
        'key', 'mastery:PRIMAL:level:3', 'pillar', 'mastery',
        'kind', 'mastery_level', 'significance', 'milestone',
        'headline', 'PRIMAL Mastery M3', 'destination', 'mastery',
        'before', 2, 'after', 3, 'delta', 1, 'artifactRef', 'PRIMAL'
      )
    ),
    'featuredImpactKeys', jsonb_build_array('mastery:PRIMAL:level:3'),
    'recommendedAction', jsonb_build_object(
      'headline', 'Review PRIMAL Mastery M3', 'destination', 'mastery'
    )
  );

  BEGIN
    PERFORM persist_run_impact_envelope(
      v_player,
      v_session,
      jsonb_set(v_envelope, '{impacts,1,artifactRef}', '"   "'::JSONB)
    );
    RAISE EXCEPTION 'blank artifact reference was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'blank artifact reference was accepted' THEN RAISE; END IF;
    IF SQLSTATE <> '23514' THEN RAISE; END IF;
  END;

  v_first := persist_run_impact_envelope(v_player, v_session, v_envelope);
  v_second := persist_run_impact_envelope(v_player, v_session, v_envelope);
  IF v_first IS DISTINCT FROM v_second OR v_first IS DISTINCT FROM v_envelope THEN
    RAISE EXCEPTION 'receipt retry did not return its canonical first answer';
  END IF;
  IF (SELECT COUNT(*) FROM run_impact_receipts WHERE session_id = v_session) <> 1
     OR (SELECT COUNT(*) FROM progression_moments WHERE source_id = v_session::TEXT) <> 1
     OR (SELECT COUNT(*) FROM player_attention_items WHERE source_id = v_session::TEXT) <> 1 THEN
    RAISE EXCEPTION 'receipt replay duplicated a receipt, moment or attention item';
  END IF;
  IF (SELECT runs_completed FROM lineage_specimens WHERE specimen_id = v_snake) <> 1
     OR (SELECT best_yield FROM lineage_specimens WHERE specimen_id = v_snake) <> 800 THEN
    RAISE EXCEPTION 'specimen run ledger was not idempotent';
  END IF;

  SELECT id INTO v_attention FROM player_attention_items
  WHERE source_id = v_session::TEXT;
  v_transition := transition_player_attention(v_player, v_attention, 'seen');
  IF v_transition ->> 'status' <> 'seen' THEN
    RAISE EXCEPTION 'recognition was not marked seen';
  END IF;
  BEGIN
    PERFORM transition_player_attention(v_player, v_attention, 'resolved');
    RAISE EXCEPTION 'recognition unexpectedly resolved as an action';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'recognition unexpectedly resolved as an action' THEN RAISE; END IF;
    IF POSITION('INVALID_ATTENTION_TRANSITION' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;

  -- A voluntary refund deletion keeps a non-owned historical specimen.
  INSERT INTO collected_snakes(id, player_id, snake_variant_id, generation, acquired_method)
  VALUES (v_parent2, v_player, v_variant, 1, 'unlock');
  INSERT INTO collected_snakes(
    id, player_id, snake_variant_id, generation, parent1_id, parent2_id, acquired_method
  ) VALUES (v_child, v_player, v_variant, 6, v_snake, v_parent2, 'bred');
  INSERT INTO breeding_history(
    id, player_id, parent1_id, parent2_id, child_id, dna_cost, bred_at
  ) VALUES (v_history, v_player, v_snake, v_parent2, v_child, 1000, NOW());
  IF (SELECT breeding_history_id FROM lineage_specimens WHERE specimen_id = v_child)
     IS DISTINCT FROM v_history THEN
    RAISE EXCEPTION 'active bred specimen did not attach its breeding receipt';
  END IF;

  UPDATE breeding_history
  SET refunded_at = NOW(), refunded_child_id = v_child,
      refund_snapshot = jsonb_build_object(
        'child', jsonb_build_object(
          'id', v_child, 'variant_id', v_variant, 'generation', 6,
          'traits', '[]'::JSONB, 'lineage', NULL
        ),
        'parent1', NULL, 'parent2', NULL
  )
  WHERE id = v_history;
  -- constitution-allow: owned-row-downward test fixture simulates the production refund RPC and verifies permanent archival
  DELETE FROM collected_snakes WHERE id = v_child;

  IF NOT EXISTS (
    SELECT 1 FROM lineage_specimens
    WHERE specimen_id = v_child
      AND status = 'retired_refunded'
      AND retired_at IS NOT NULL
      AND breeding_history_id = v_history
  ) THEN RAISE EXCEPTION 'refunded specimen history was lost or remained active'; END IF;
  IF EXISTS (SELECT 1 FROM collected_snakes WHERE id = v_child) THEN
    RAISE EXCEPTION 'refunded specimen remained owned';
  END IF;
END;
$$;

-- Atomic player aggregate: distinct sessions add, a replay does not, and an
-- invalid run can settle its non-confiscated DNA without claiming PB/lineage.
DO $$
DECLARE
  v_user UUID := '06000000-0000-0000-0000-000000000201';
  v_player UUID;
  v_snake UUID := '06000000-0000-0000-0000-000000000205';
  v_variant UUID;
  v_session_a UUID := '06000000-0000-0000-0000-000000000202';
  v_session_b UUID := '06000000-0000-0000-0000-000000000203';
  v_session_invalid UUID := '06000000-0000-0000-0000-000000000204';
  v_initial_dna INTEGER;
  v_initial_games INTEGER;
  v_initial_earned INTEGER;
  v_initial_high INTEGER;
  v_lineage_runs INTEGER;
  v_first JSONB;
  v_replay JSONB;
  v_invalid_impact JSONB;
BEGIN
  INSERT INTO auth.users(id, aud, role, email, created_at, updated_at)
  VALUES (v_user, 'authenticated', 'authenticated', 'career-060-reward@example.test', NOW(), NOW());
  SELECT id, dna, total_games_played, total_dna_earned, high_score
  INTO v_player, v_initial_dna, v_initial_games, v_initial_earned, v_initial_high
  FROM players WHERE user_id = v_user;
  SELECT id INTO v_variant FROM snake_variants ORDER BY created_at, id LIMIT 1;
  INSERT INTO collected_snakes(
    id, player_id, snake_variant_id, generation, acquired_method, is_equipped
  ) VALUES (v_snake, v_player, v_variant, 1, 'unlock', TRUE);

  -- Migration 063 permits one open run per player. These are distinct completed
  -- runs, so fixture them in the same chronological order the server accepts.
  INSERT INTO game_sessions(
    id, player_id, snake_used_id, snake_variant_id, dynasty,
    score, dna_earned, yield_dna, validated, extracted, died,
    energy_committed, energy_harvest_multiplier_bps
  ) VALUES (v_session_a, v_player, v_snake, v_variant, 'PRIMAL',
            1000, 100, 100, TRUE, TRUE, FALSE, 1, 10000);
  PERFORM pg_temp.complete_atomic_test_session(v_session_a);

  INSERT INTO game_sessions(
    id, player_id, snake_used_id, snake_variant_id, dynasty,
    score, dna_earned, yield_dna, validated, extracted, died,
    energy_committed, energy_harvest_multiplier_bps
  ) VALUES (v_session_b, v_player, v_snake, v_variant, 'PRIMAL',
            2500, 200, 200, TRUE, TRUE, FALSE, 1, 10000);
  PERFORM pg_temp.complete_atomic_test_session(v_session_b);

  INSERT INTO game_sessions(
    id, player_id, snake_used_id, snake_variant_id, dynasty,
    score, dna_earned, yield_dna, validated, extracted, died,
    energy_committed, energy_harvest_multiplier_bps
  ) VALUES (v_session_invalid, v_player, v_snake, v_variant, 'PRIMAL',
            9999, 50, 50, FALSE, FALSE, TRUE, 1, 10000);
  PERFORM pg_temp.complete_atomic_test_session(v_session_invalid);
  v_first := settle_game_session_reward_from_snapshot(v_player, v_session_a);
  PERFORM settle_game_session_reward_from_snapshot(v_player, v_session_b);
  v_replay := settle_game_session_reward_from_snapshot(v_player, v_session_a);

  IF v_first ->> 'applied' <> 'true' OR v_replay ->> 'applied' <> 'false' THEN
    RAISE EXCEPTION 'same-session reward replay did not preserve exactly-once truth';
  END IF;
  IF (SELECT dna FROM players WHERE id = v_player) <> v_initial_dna + 300
     OR (SELECT total_games_played FROM players WHERE id = v_player) <> v_initial_games + 2
     OR (SELECT total_dna_earned FROM players WHERE id = v_player) <> v_initial_earned + 300
     OR (SELECT high_score FROM players WHERE id = v_player) <> GREATEST(v_initial_high, 2500) THEN
    RAISE EXCEPTION 'distinct session rewards lost or overwrote a player aggregate';
  END IF;
  IF (SELECT COUNT(*) FROM game_reward_settlements WHERE player_id = v_player) <> 2
     OR (SELECT COUNT(*) FROM economy_transactions
         WHERE player_id = v_player AND source_type = 'game_reward'
           AND source_id IN (v_session_a, v_session_b)) <> 2 THEN
    RAISE EXCEPTION 'reward replay duplicated or omitted its ledger/audit row';
  END IF;

  SELECT runs_completed INTO v_lineage_runs
  FROM lineage_specimens WHERE specimen_id = v_snake;
  PERFORM settle_game_session_reward_from_snapshot(v_player, v_session_invalid);
  IF (SELECT high_score FROM players WHERE id = v_player) <> GREATEST(v_initial_high, 2500) THEN
    RAISE EXCEPTION 'invalid run claimed a personal best';
  END IF;

  v_invalid_impact := jsonb_build_object(
    'version', 1, 'sessionId', v_session_invalid, 'settledAt', NOW(),
    'outcome', 'crashed', 'dynasty', 'PRIMAL',
    'receipt', jsonb_build_object(
      'validated', false, 'score', 9999, 'yieldDna', 50, 'dnaCredited', 50,
      'energyCommitted', 1, 'commitmentMultiplierBps', 10000, 'generation', 1,
      'personalBest', jsonb_build_object(
        'eligible', false, 'before', GREATEST(v_initial_high, 2500),
        'after', GREATEST(v_initial_high, 2500), 'improved', false
      )
    ),
    'impacts', jsonb_build_array(jsonb_build_object(
      'key', 'lineage:' || v_snake || ':run', 'pillar', 'lineage',
      'kind', 'lineage_run', 'significance', 'routine',
      'headline', 'must not count', 'destination', 'lineage'
    )),
    'featuredImpactKeys', '[]'::JSONB, 'recommendedAction', NULL
  );
  PERFORM pg_temp.capture_test_progression(v_player, v_session_a);
  PERFORM pg_temp.capture_test_progression(v_player, v_session_b);
  PERFORM pg_temp.capture_test_progression(v_player, v_session_invalid);
  BEGIN
    PERFORM persist_run_impact_envelope(
      v_player,
      v_session_invalid,
      jsonb_set(v_invalid_impact, '{receipt,personalBest,improved}', 'true'::JSONB)
    );
    RAISE EXCEPTION 'impact accepted invented personal-best truth';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'impact accepted invented personal-best truth' THEN RAISE; END IF;
    IF POSITION('RUN_IMPACT_REWARD_TRUTH_MISMATCH' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM persist_run_impact_envelope(v_player, v_session_invalid, v_invalid_impact);
    RAISE EXCEPTION 'invalid run impact claimed lineage';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'invalid run impact claimed lineage' THEN RAISE; END IF;
    IF POSITION('INVALID_RUN_CANNOT_CLAIM_LINEAGE' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
  PERFORM persist_run_impact_envelope(
    v_player,
    v_session_invalid,
    jsonb_set(v_invalid_impact, '{impacts}', '[]'::JSONB)
  );
  IF (SELECT runs_completed FROM lineage_specimens WHERE specimen_id = v_snake)
     IS DISTINCT FROM v_lineage_runs THEN
    RAISE EXCEPTION 'invalid run advanced lineage history';
  END IF;
END;
$$;

-- A best-set replacement can cross snakes. Specimen Clan Depth follows the
-- final counted set and removes the displaced run instead of accumulating
-- every run that was briefly counted.
DO $$
DECLARE
  v_user UUID := '06000000-0000-0000-0000-000000000401';
  v_player UUID;
  v_clan UUID := '06000000-0000-0000-0000-000000000402';
  v_battle UUID := '06000000-0000-0000-0000-000000000403';
  v_side UUID := '06000000-0000-0000-0000-000000000404';
  v_snake_a UUID := '06000000-0000-0000-0000-000000000405';
  v_snake_b UUID := '06000000-0000-0000-0000-000000000406';
  v_session_a UUID := '06000000-0000-0000-0000-000000000407';
  v_session_b UUID := '06000000-0000-0000-0000-000000000408';
  v_failed_session UUID := '06000000-0000-0000-0000-000000000409';
  v_variant UUID;
BEGIN
  INSERT INTO auth.users(id, aud, role, email, created_at, updated_at)
  VALUES (v_user, 'authenticated', 'authenticated', 'career-060-depth@example.test', NOW(), NOW());
  SELECT id INTO v_player FROM players WHERE user_id = v_user;
  SELECT id INTO v_variant FROM snake_variants ORDER BY created_at, id LIMIT 1;
  INSERT INTO collected_snakes(
    id, player_id, snake_variant_id, generation, acquired_method, is_equipped
  ) VALUES
    (v_snake_a, v_player, v_variant, 2, 'unlock', TRUE),
    (v_snake_b, v_player, v_variant, 3, 'bred', FALSE);

  INSERT INTO clans(id, name, tag, owner_id)
  VALUES (v_clan, 'Career Depth Test', 'C60D', v_user);
  INSERT INTO clan_energy_battles(
    id, cycle_index, starts_at, ends_at, intermission_ends_at
  ) VALUES (
    v_battle, 600401, NOW() - INTERVAL '1 hour',
    NOW() + INTERVAL '2 days', NOW() + INTERVAL '3 days'
  );
  INSERT INTO clan_energy_battle_sides(id, battle_id, cycle_index, clan_id, slot)
  VALUES (v_side, v_battle, 600401, v_clan, 1);

  INSERT INTO game_sessions(
    id, player_id, snake_used_id, snake_variant_id, dynasty,
    started_at, validated, extracted, score,
    dna_earned, yield_dna, energy_committed,
    energy_harvest_multiplier_bps, energy_commitment_locked_at,
    clan_energy_battle_id, clan_energy_battle_side_id, clan_energy_clan_id
  ) VALUES (v_session_a, v_player, v_snake_a, v_variant, 'PRIMAL',
            NOW() - INTERVAL '3 minutes', TRUE, TRUE, 100, 100, 100, 1, 10000,
            NOW() - INTERVAL '3 minutes', v_battle, v_side, v_clan);
  PERFORM pg_temp.complete_atomic_test_session(
    v_session_a, NOW() - INTERVAL '2 minutes'
  );

  INSERT INTO game_sessions(
    id, player_id, snake_used_id, snake_variant_id, dynasty,
    started_at, validated, extracted, score,
    dna_earned, yield_dna, energy_committed,
    energy_harvest_multiplier_bps, energy_commitment_locked_at,
    clan_energy_battle_id, clan_energy_battle_side_id, clan_energy_clan_id
  ) VALUES (v_session_b, v_player, v_snake_b, v_variant, 'PRIMAL',
            NOW() - INTERVAL '2 minutes', TRUE, TRUE, 200, 200, 200, 1, 10000,
            NOW() - INTERVAL '2 minutes', v_battle, v_side, v_clan);
  PERFORM pg_temp.complete_atomic_test_session(
    v_session_b, NOW() - INTERVAL '1 minute'
  );

  INSERT INTO game_sessions(
    id, player_id, snake_used_id, snake_variant_id, dynasty,
    started_at, validated, extracted, score,
    dna_earned, yield_dna, energy_committed,
    energy_harvest_multiplier_bps, energy_commitment_locked_at,
    clan_energy_battle_id, clan_energy_battle_side_id, clan_energy_clan_id
  ) VALUES (v_failed_session, v_player, v_snake_b, v_variant, 'PRIMAL',
            NOW() - INTERVAL '1 minute', TRUE, FALSE, 300, 0, 0, 6, 100000,
            NOW() - INTERVAL '1 minute', NULL, NULL, NULL);

  PERFORM record_clan_energy_contribution(v_session_a, 1, 10800, 10800);
  PERFORM record_lineage_specimen_run(v_session_a);
  IF (SELECT clan_depth_delivered FROM lineage_specimens WHERE specimen_id = v_snake_a) <> 100 THEN
    RAISE EXCEPTION 'first counted run did not reach its specimen';
  END IF;

  PERFORM record_clan_energy_contribution(v_session_b, 1, 10800, 10800);
  PERFORM record_lineage_specimen_run(v_session_b);
  IF (SELECT clan_depth_delivered FROM lineage_specimens WHERE specimen_id = v_snake_a) <> 0
     OR (SELECT clan_depth_delivered FROM lineage_specimens WHERE specimen_id = v_snake_b) <> 200
     OR (SELECT clan_depth_delivered FROM lineage_specimen_runs WHERE session_id = v_session_a) <> 0
     OR (SELECT clan_depth_delivered FROM lineage_specimen_runs WHERE session_id = v_session_b) <> 200
     OR (SELECT score FROM clan_energy_battle_sides WHERE id = v_side) <> 200 THEN
    RAISE EXCEPTION 'cross-specimen replacement diverged from final Clan Depth';
  END IF;

  PERFORM pg_temp.complete_atomic_test_session(v_failed_session, NOW());
  PERFORM record_lineage_specimen_run(v_failed_session);
  IF (SELECT highest_energy FROM lineage_specimens WHERE specimen_id = v_snake_b) <> 1 THEN
    RAISE EXCEPTION 'failed run inflated extraction-only Energy prestige';
  END IF;
END;
$$;

-- Season 1 is a read-only chapter: reached identity is secured without a
-- player claim, premium goodwill is retained, and replay changes nothing.
DO $$
DECLARE
  v_free_user UUID := '06000000-0000-0000-0000-000000000101';
  v_premium_user UUID := '06000000-0000-0000-0000-000000000102';
  v_free_player UUID;
  v_premium_player UUID;
  v_season UUID;
  v_existing_tier UUID;
  v_existing_time TIMESTAMPTZ := TIMESTAMPTZ '2026-07-21 09:30:00+00';
  v_free_claims INTEGER;
  v_free_inventory INTEGER;
  v_premium_claims INTEGER;
  v_premium_inventory INTEGER;
  v_second JSONB;
  v_compat JSONB;
BEGIN
  SELECT id INTO v_season FROM battle_pass_seasons WHERE season_number = 1;
  IF v_season IS NULL THEN RAISE EXCEPTION 'Season 1 is missing'; END IF;

  INSERT INTO auth.users(id, aud, role, email, created_at, updated_at) VALUES
    (v_free_user, 'authenticated', 'authenticated', 'career-060-free@example.test', NOW(), NOW()),
    (v_premium_user, 'authenticated', 'authenticated', 'career-060-premium@example.test', NOW(), NOW());
  SELECT id INTO v_free_player FROM players WHERE user_id = v_free_user;
  SELECT id INTO v_premium_player FROM players WHERE user_id = v_premium_user;

  -- An old receipt is history: settlement may repair its missing inventory,
  -- but it may neither duplicate nor rewrite that timestamp.
  SELECT t.id INTO v_existing_tier
  FROM battle_pass_tiers t
  JOIN cosmetic_definitions cd ON cd.id = t.reward_id
  WHERE t.season_id = v_season AND t.is_premium IS FALSE
    AND t.reward_type IN ('cosmetic', 'title')
  ORDER BY t.level LIMIT 1;
  INSERT INTO player_battle_pass_claims(
    player_id, season_id, tier_id, claimed_at
  ) VALUES (v_free_player, v_season, v_existing_tier, v_existing_time);

  -- Inserts settle the reached free rows automatically. A later premium
  -- activation settles the premium rows without asking the player to claim.
  INSERT INTO player_battle_pass(
    player_id, season_id, current_xp, current_level, is_premium
  ) VALUES
    (v_free_player, v_season, 12000, 30, FALSE),
    (v_premium_player, v_season, 12000, 30, FALSE);

  INSERT INTO premium_subscriptions(
    player_id, stripe_customer_id, stripe_subscription_id, status,
    billing_interval, current_period_start, current_period_end
  ) VALUES (
    v_premium_player, 'cus_060_premium', 'sub_060_premium', 'active',
    'month', NOW() - INTERVAL '1 day', NOW() + INTERVAL '29 days'
  );
  UPDATE player_battle_pass
  SET is_premium = TRUE, premium_purchased_at = NOW(), updated_at = NOW()
  WHERE player_id = v_premium_player AND season_id = v_season;

  IF EXISTS (
    SELECT 1 FROM battle_pass_tiers t
    JOIN cosmetic_definitions cd ON cd.id = t.reward_id
    WHERE t.season_id = v_season AND t.level <= 30 AND NOT t.is_premium
      AND t.reward_type IN ('cosmetic', 'title')
      AND NOT EXISTS (
        SELECT 1 FROM player_battle_pass_claims c
        WHERE c.player_id = v_free_player AND c.tier_id = t.id
      )
  ) THEN RAISE EXCEPTION 'free reached tier was not secured'; END IF;
  IF EXISTS (
    SELECT 1 FROM player_battle_pass_claims c
    JOIN battle_pass_tiers t ON t.id = c.tier_id
    WHERE c.player_id = v_free_player AND t.is_premium
  ) THEN RAISE EXCEPTION 'free player received premium tier'; END IF;
  IF EXISTS (
    SELECT 1 FROM battle_pass_tiers t
    JOIN cosmetic_definitions cd ON cd.id = t.reward_id
    WHERE t.season_id = v_season AND t.level <= 30
      AND t.reward_type IN ('cosmetic', 'title')
      AND NOT EXISTS (
        SELECT 1 FROM player_battle_pass_claims c
        WHERE c.player_id = v_premium_player AND c.tier_id = t.id
      )
  ) THEN RAISE EXCEPTION 'premium reached tier was not secured'; END IF;
  IF EXISTS (
    SELECT 1 FROM player_battle_pass_claims c
    JOIN battle_pass_tiers t ON t.id = c.tier_id
    LEFT JOIN cosmetic_definitions cd ON cd.id = t.reward_id
    WHERE c.player_id IN (v_free_player, v_premium_player)
      AND (t.reward_type NOT IN ('cosmetic', 'title') OR cd.id IS NULL)
  ) THEN RAISE EXCEPTION 'season settlement secured a non-catalog identity receipt'; END IF;

  IF EXISTS (
    SELECT 1 FROM battle_pass_tiers t
    WHERE t.season_id = v_season AND t.level <= 30 AND NOT t.is_premium
      AND t.reward_type IN ('cosmetic', 'title') AND t.reward_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM player_cosmetics pc
        WHERE pc.player_id = v_free_player AND pc.cosmetic_id = t.reward_id
      )
  ) THEN RAISE EXCEPTION 'free identity inventory was not granted'; END IF;
  IF EXISTS (
    SELECT 1 FROM battle_pass_tiers t
    WHERE t.season_id = v_season AND t.level <= 30
      AND t.reward_type IN ('cosmetic', 'title') AND t.reward_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM player_cosmetics pc
        WHERE pc.player_id = v_premium_player AND pc.cosmetic_id = t.reward_id
      )
  ) THEN RAISE EXCEPTION 'premium identity inventory was not granted'; END IF;
  IF NOT (SELECT is_premium FROM player_battle_pass
          WHERE player_id = v_premium_player AND season_id = v_season) THEN
    RAISE EXCEPTION 'premium goodwill was not locked into Season 1';
  END IF;
  IF (SELECT claimed_at FROM player_battle_pass_claims
      WHERE player_id = v_free_player AND tier_id = v_existing_tier)
     IS DISTINCT FROM v_existing_time THEN
    RAISE EXCEPTION 'existing season receipt timestamp was rewritten';
  END IF;

  SELECT COUNT(*) INTO v_free_claims FROM player_battle_pass_claims
  WHERE player_id = v_free_player AND season_id = v_season;
  SELECT COUNT(*) INTO v_free_inventory FROM player_cosmetics
  WHERE player_id = v_free_player AND source = 'season_track';
  SELECT COUNT(*) INTO v_premium_claims FROM player_battle_pass_claims
  WHERE player_id = v_premium_player AND season_id = v_season;
  SELECT COUNT(*) INTO v_premium_inventory FROM player_cosmetics
  WHERE player_id = v_premium_player AND source = 'season_track';

  v_second := secure_reached_season_entitlements(v_free_player, v_season);
  IF (v_second ->> 'secured_receipts')::INTEGER <> 0
     OR (v_second ->> 'identity_grants')::INTEGER <> 0 THEN
    RAISE EXCEPTION 'season settlement replay was not idempotent';
  END IF;
  PERFORM secure_reached_season_entitlements(v_premium_player, v_season);
  v_compat := claim_season_tier(v_free_player, 1);
  IF COALESCE((v_compat ->> 'secured')::BOOLEAN, FALSE) IS NOT TRUE
     OR COALESCE((v_compat ->> 'compatibility')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'rolling season compatibility call did not return secured truth';
  END IF;

  IF v_free_claims <> (SELECT COUNT(*) FROM player_battle_pass_claims
                       WHERE player_id = v_free_player AND season_id = v_season)
     OR v_free_inventory <> (SELECT COUNT(*) FROM player_cosmetics
                             WHERE player_id = v_free_player AND source = 'season_track')
     OR v_premium_claims <> (SELECT COUNT(*) FROM player_battle_pass_claims
                            WHERE player_id = v_premium_player AND season_id = v_season)
     OR v_premium_inventory <> (SELECT COUNT(*) FROM player_cosmetics
                               WHERE player_id = v_premium_player AND source = 'season_track') THEN
    RAISE EXCEPTION 'season settlement replay duplicated receipts or inventory';
  END IF;
END;
$$;

-- Observation proof is authored only by the matching store→adopt transition.
-- Even a privileged accidental write cannot pre-stamp an open row.
DO $$
DECLARE
  v_player UUID;
  v_session UUID := '06100000-0000-0000-0000-000000000099';
BEGIN
  SELECT id INTO v_player FROM players ORDER BY created_at, id LIMIT 1;
  INSERT INTO game_sessions(id, player_id, dynasty)
  VALUES (v_session, v_player, 'PRIMAL');
  BEGIN
    UPDATE game_sessions
    SET atomic_reward_observed_at = clock_timestamp()
    WHERE id = v_session;
    RAISE EXCEPTION 'forged atomic observation was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'forged atomic observation was accepted' THEN RAISE; END IF;
    IF POSITION('ATOMIC_REWARD_OBSERVATION_TRIGGER_AUTHORED' IN SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;
END;
$$;

-- Runtime privilege checks: browser roles read through RLS but cannot invoke
-- settlement mutations. The server role retains the rolling API surface.
DO $$
DECLARE
  v_signature TEXT;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'claim_season_tier(uuid,integer)',
    'secure_reached_season_entitlements(uuid,uuid)',
    'settle_game_session_reward_from_snapshot(uuid,uuid)',
    'settle_game_session_progression_core(uuid,uuid)',
    'prepare_game_session_signal_stage(uuid,uuid)',
    'capture_game_session_signal_result(uuid,uuid)',
    'capture_game_session_clan_result(uuid,uuid)',
    'list_pending_game_progression_sessions(integer)',
    'stage_pending_game_session_end(uuid,uuid,uuid,jsonb)',
    'list_pending_game_session_ends(integer)',
    'get_pending_game_session_end(uuid,uuid)',
    'count_staged_pending_game_session_ends(uuid)',
    'adopt_pending_game_session_end(uuid)',
    'get_career_settlement_capability()',
    'record_game_session_play_day(uuid,uuid)',
    'record_lineage_specimen_run(uuid)',
    'persist_run_impact_envelope(uuid,uuid,jsonb)',
    'transition_player_attention(uuid,uuid,text)'
  ] LOOP
    IF has_function_privilege('anon', v_signature, 'EXECUTE')
       OR has_function_privilege('authenticated', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'browser role can execute server mutation %', v_signature;
    END IF;
    IF NOT has_function_privilege('service_role', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'service role cannot execute server mutation %', v_signature;
    END IF;
  END LOOP;
  IF has_function_privilege(
       'service_role',
       'settle_game_session_reward(uuid,uuid,integer,integer,boolean,jsonb)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'service role can bypass the snapshot reward entry point';
  END IF;
  IF has_function_privilege(
       'anon', 'store_pending_game_session_end(uuid,uuid,uuid,jsonb)', 'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated', 'store_pending_game_session_end(uuid,uuid,uuid,jsonb)', 'EXECUTE'
     )
     OR has_function_privilege(
       'service_role', 'store_pending_game_session_end(uuid,uuid,uuid,jsonb)', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'internal pending-end store is directly executable';
  END IF;
END;
$$;

ROLLBACK;
