-- Local integration contract for migration 065.
-- Run only against an isolated `supabase db reset` database:
--   psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/065_genome_v2.sql

BEGIN;

-- Produce the same trigger-authored atomic observation required by production
-- settlement. The Codex contract must never be proved with a fabricated
-- completed row or a manually supplied atomic_reward_observed_at timestamp.
CREATE OR REPLACE FUNCTION pg_temp.complete_atomic_genome_session(
  p_session_id UUID,
  p_ended_at TIMESTAMPTZ DEFAULT clock_timestamp()
) RETURNS VOID AS $$
DECLARE
  v_session game_sessions%ROWTYPE;
  v_user_id UUID;
  v_payload JSONB;
  v_envelope JSONB;
  v_result JSONB;
BEGIN
  SELECT * INTO v_session
  FROM game_sessions
  WHERE id = p_session_id;
  IF NOT FOUND OR v_session.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'GENOME_TEST_SESSION_NOT_OPEN';
  END IF;
  SELECT player.user_id INTO v_user_id
  FROM players AS player
  WHERE player.id = v_session.player_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'GENOME_TEST_PLAYER_HAS_NO_USER';
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
    'generation', 1,
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
    'kind', 'career_pending_end_v1',
    'v', 1,
    'userId', v_user_id,
    'playerId', v_session.player_id,
    'sessionId', v_session.id,
    'capturedAt', p_ended_at,
    'snapshot', v_payload,
    'binding', jsonb_build_object(
      'startedAt', v_session.started_at,
      'dynasty', v_session.dynasty,
      'snakeId', v_session.snake_used_id,
      'snakeVariantId', v_session.snake_variant_id,
      'runSeed', v_session.run_seed,
      'runContext', v_session.run_context,
      'energyCommitted', COALESCE(v_session.energy_committed, 0),
      'commitmentMultiplierBps', COALESCE(
        v_session.energy_harvest_multiplier_bps, 0
      ),
      'signalRunId', v_session.signal_objective_run_id,
      'clanBattleId', v_session.clan_energy_battle_id,
      'clanBattleSideId', v_session.clan_energy_battle_side_id,
      'clanId', v_session.clan_energy_clan_id
    ),
    'sessionFacts', jsonb_build_object(
      'durationSeconds', GREATEST(COALESCE(v_session.duration_seconds, 0), 0),
      'victory', COALESCE(v_session.victory, FALSE),
      'foodsCollected', GREATEST(COALESCE(v_session.foods_collected, 0), 0),
      'mutations', v_session.mutations,
      'deathCause', v_session.death_cause,
      'runEvents', v_session.run_events,
      'validationErrors', v_session.validation_errors
    )
  );

  v_result := stage_pending_game_session_end(
    v_user_id, v_session.player_id, v_session.id, v_envelope
  );
  IF v_result ->> 'state' <> 'staged' THEN
    RAISE EXCEPTION 'GENOME_TEST_STAGE_FAILED: %', v_result;
  END IF;
  v_result := adopt_pending_game_session_end(v_session.id);
  IF v_result ->> 'state' <> 'adopted' THEN
    RAISE EXCEPTION 'GENOME_TEST_ADOPTION_FAILED: %', v_result;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM game_sessions AS settled
    WHERE settled.id = v_session.id
      AND settled.ended_at = p_ended_at
      AND settled.reward_protocol = 'atomic_v1'
      AND settled.atomic_reward_observed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'GENOME_TEST_ATOMIC_OBSERVATION_MISSING';
  END IF;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  v_record JSONB := jsonb_build_object(
    'v', 2,
    'dynasty', 'PRIMAL',
    'runSeed', 'sql-contract-run-seed-065',
    'genePool', jsonb_build_array(
      'gold_trail', 'compound_interest', 'live_wire', 'coilkeeper', 'phoenix'
    ),
    'instances', jsonb_build_object(
      'gold-1', jsonb_build_object(
        'instanceId', 'gold-1', 'geneId', 'gold_trail', 'status', 'spliced', 'slot', 0
      ),
      'compound-1', jsonb_build_object(
        'instanceId', 'compound-1', 'geneId', 'compound_interest', 'status', 'spliced', 'slot', 1
      ),
      'live-1', jsonb_build_object(
        'instanceId', 'live-1', 'geneId', 'live_wire', 'status', 'replaced', 'slot', 2
      ),
      'coil-1', jsonb_build_object(
        'instanceId', 'coil-1', 'geneId', 'coilkeeper', 'status', 'active', 'slot', 2
      ),
      'phoenix-1', jsonb_build_object(
        'instanceId', 'phoenix-1', 'geneId', 'phoenix', 'status', 'ash', 'slot', 3
      )
    ),
    'retired', jsonb_build_array(
      jsonb_build_object(
        'instanceId', 'live-1', 'reason', 'splice', 'atFood', 18,
        'spliceId', 'splice_styx_contract'
      ),
      jsonb_build_object('instanceId', 'phoenix-1', 'reason', 'phoenix', 'atFood', 27)
    ),
    'slots', jsonb_build_array(
      jsonb_build_object(
        'index', 0,
        'occupant', jsonb_build_object(
          'kind', 'splice',
          'spliceId', 'splice_dragon_hoard',
          'parentInstanceIds', jsonb_build_array('gold-1', 'compound-1')
        )
      ),
      jsonb_build_object('index', 1, 'occupant', NULL),
      jsonb_build_object(
        'index', 2,
        'occupant', jsonb_build_object('kind', 'gene', 'instanceId', 'coil-1')
      ),
      jsonb_build_object(
        'index', 3,
        'occupant', jsonb_build_object('kind', 'ash', 'sourceInstanceId', 'phoenix-1')
      ),
      jsonb_build_object('index', 4, 'occupant', NULL),
      jsonb_build_object('index', 5, 'occupant', NULL)
    ),
    'activeSplices', jsonb_build_array('splice_dragon_hoard'),
    'discoveredSplices', jsonb_build_array('splice_dragon_hoard'),
    'expressions', jsonb_build_object('AURUM', 0, 'FERAL', 18),
    'apexes', jsonb_build_object('FERAL', 27),
    'journal', jsonb_build_array(
      jsonb_build_object(
        'index', 1, 'type', 'portal_infuse', 'geneId', 'live_wire',
        'instanceId', 'live-1', 'growthCharged', 3
      ),
      jsonb_build_object(
        'index', 2, 'type', 'offer_recoded', 'replacementGeneId', 'coilkeeper',
        'instanceId', 'coil-1', 'growthCharged', 8
      )
    ),
    'infuseCount', 1,
    'settlement', jsonb_build_object(
      'v', 2, 'terminal', 'bank', 'harvestEligibleYield', 420000,
      'ineligibleFixedRewards', 0
    )
  );
  v_ids TEXT[];
  v_result JSONB;
  v_count INTEGER;
  v_definition TEXT;
  v_signature TEXT;
  v_ids_expected TEXT[];
BEGIN
  IF genome_record_version(v_record) <> 2
     OR genome_record_version(jsonb_build_object('v', 1)) <> 1
     OR genome_record_version('{}'::JSONB) IS NOT NULL THEN
    RAISE EXCEPTION 'Genome record version projector is not exact';
  END IF;

  SELECT array_agg(gene_id ORDER BY gene_id) INTO v_ids
  FROM genome_record_gene_ids(v_record, 'held');
  IF v_ids IS DISTINCT FROM ARRAY['coilkeeper','compound_interest','gold_trail']::TEXT[] THEN
    RAISE EXCEPTION 'Held gene projector disagrees with v2 loci: %', v_ids;
  END IF;

  SELECT array_agg(gene_id ORDER BY gene_id) INTO v_ids
  FROM genome_record_gene_ids(v_record, 'discovered');
  IF v_ids IS DISTINCT FROM ARRAY[
    'coilkeeper','compound_interest','gold_trail','live_wire','phoenix'
  ]::TEXT[] THEN
    RAISE EXCEPTION 'Discovered gene projector lost retired/Ash history: %', v_ids;
  END IF;

  SELECT array_agg(splice_id ORDER BY splice_id) INTO v_ids
  FROM genome_record_splice_ids(v_record);
  IF v_ids IS DISTINCT FROM ARRAY[
    'splice_dragon_hoard','splice_styx_contract'
  ]::TEXT[] THEN
    RAISE EXCEPTION 'Splice projector lost durable formation history: %', v_ids;
  END IF;

  SELECT array_agg(strain ORDER BY strain) INTO v_ids
  FROM genome_record_strain_milestones(v_record, 'expression');
  IF v_ids IS DISTINCT FROM ARRAY['AURUM','FERAL']::TEXT[] THEN
    RAISE EXCEPTION 'Expression projector lost durable threshold history: %', v_ids;
  END IF;
  SELECT array_agg(strain ORDER BY strain) INTO v_ids
  FROM genome_record_strain_milestones(v_record, 'apex');
  IF v_ids IS DISTINCT FROM ARRAY['FERAL']::TEXT[] THEN
    RAISE EXCEPTION 'Apex projector lost durable threshold history: %', v_ids;
  END IF;

  IF genome_record_infuse_count(v_record) <> 1 THEN
    RAISE EXCEPTION 'Infuse projector does not recognize canonical portal_infuse';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM genome_gene_versions
  WHERE rules_version = 2 AND active;
  IF v_count <> 16 THEN
    RAISE EXCEPTION 'Genome v2 active gene catalog count is %, expected 16', v_count;
  END IF;
  SELECT COUNT(*) INTO v_count
  FROM genome_splice_versions
  WHERE rules_version = 2 AND active;
  IF v_count <> 8 THEN
    RAISE EXCEPTION 'Genome v2 active Splice catalog count is %, expected 8', v_count;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM genome_gene_versions
    WHERE rules_version = 2 AND gene_id = 'loan_shark'
      AND effect LIKE 'A portal CONTINUE%'
  ) OR NOT EXISTS (
    SELECT 1 FROM genome_splice_versions
    WHERE rules_version = 2 AND splice_id = 'splice_perfect_circuit'
      AND gene_a = 'live_wire' AND gene_b = 'circuit_run'
  ) THEN
    RAISE EXCEPTION 'Versioned Genome catalog contents are stale';
  END IF;

  IF ascendance_yield_multiplier_bps_v2(1) <> 10000
     OR ascendance_yield_multiplier_bps_v2(3) <> 10000
     OR ascendance_yield_multiplier_bps_v2(4) <> 10200
     OR ascendance_yield_multiplier_v2(4) <> 1.02
     OR ascendance_yield_bonus_v2(4) <> 0.02 THEN
    RAISE EXCEPTION 'Ascendance v2 functions disagree at the frozen boundary';
  END IF;
  IF ascendance_yield_multiplier_bps_v2(20) <> round(
    10000::NUMERIC * power(1.02::NUMERIC, 17::NUMERIC)
  )::BIGINT THEN
    RAISE EXCEPTION 'Ascendance v2 long curve is not deterministic';
  END IF;

  SELECT pg_get_functiondef(
    'public.breeding_draft(uuid,uuid,uuid,boolean,uuid,text[],text)'::REGPROCEDURE
  ) INTO v_definition;
  IF POSITION('breeding_draft_v1' IN v_definition) = 0
     OR POSITION('ascendance_yield_multiplier_bps_v2' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Breeding preview is not routed through the v2 Ascendance wrapper';
  END IF;
  IF has_function_privilege(
       'service_role',
       'public.breeding_draft_v1(uuid,uuid,uuid,boolean,uuid,text[],text)',
       'EXECUTE'
     ) OR NOT has_function_privilege(
       'service_role',
       'public.breeding_draft(uuid,uuid,uuid,boolean,uuid,text[],text)',
       'EXECUTE'
     ) OR has_function_privilege(
       'authenticated',
       'public.breeding_draft(uuid,uuid,uuid,boolean,uuid,text[],text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Breeding v1/v2 wrapper privilege boundary is wrong';
  END IF;

  v_result := get_genome_v2_capability();
  IF v_result IS DISTINCT FROM jsonb_build_object(
    'status', 'ready',
    'schemaVersion', 2,
    'catalogVersion', 2,
    'ascendanceVersion', 2,
    'spliceCount', 8
  ) THEN
    RAISE EXCEPTION 'Genome v2 release capability is incomplete: %', v_result;
  END IF;

  IF has_function_privilege(
       'authenticated', 'public.get_genome_v2_capability()', 'EXECUTE'
     ) OR has_function_privilege(
       'anon', 'public.get_genome_v2_capability()', 'EXECUTE'
     ) OR NOT has_function_privilege(
       'service_role', 'public.get_genome_v2_capability()', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Genome capability privilege boundary is wrong';
  END IF;
  IF has_function_privilege(
       'authenticated', 'public.genome_record_gene_ids(jsonb,text)', 'EXECUTE'
     ) OR has_function_privilege(
       'anon', 'public.genome_record_gene_ids(jsonb,text)', 'EXECUTE'
     ) OR NOT has_function_privilege(
       'service_role', 'public.genome_record_gene_ids(jsonb,text)', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Genome record projector privilege boundary is wrong';
  END IF;
  FOREACH v_signature IN ARRAY ARRAY[
    'public.breeding_draft(uuid,uuid,uuid,boolean,uuid,text[],text)',
    'public.genome_record_version(jsonb)',
    'public.genome_record_items(jsonb)',
    'public.genome_record_gene_ids(jsonb,text)',
    'public.genome_record_splice_ids(jsonb)',
    'public.genome_record_strain_milestones(jsonb,text)',
    'public.genome_record_infuse_count(jsonb)',
    'public.record_codex_discoveries(uuid,uuid,jsonb)',
    'public.record_session_codex_discoveries(uuid,uuid,jsonb)',
    'public.get_genome_v2_capability()'
  ]::TEXT[] LOOP
    IF to_regprocedure(v_signature) IS NULL
       OR has_function_privilege('authenticated', v_signature, 'EXECUTE')
       OR has_function_privilege('anon', v_signature, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'Genome service function boundary is wrong: %', v_signature;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('anon', 'public.genome_gene_versions', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.genome_splice_versions', 'SELECT')
     OR EXISTS (
       SELECT 1
       FROM (VALUES ('anon'), ('authenticated')) AS roles(role_name)
       CROSS JOIN (
         VALUES ('public.genome_gene_versions'), ('public.genome_splice_versions')
       ) AS tables(table_name)
       CROSS JOIN (
         VALUES
           ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
           ('TRIGGER'), ('REFERENCES')
       ) AS privileges(privilege_name)
       WHERE has_table_privilege(
         roles.role_name,
         tables.table_name,
         privileges.privilege_name
       )
     ) THEN
    RAISE EXCEPTION 'Versioned catalog privilege boundary is wrong';
  END IF;

  IF has_table_privilege('anon', 'public.player_codex', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.player_codex', 'SELECT')
     OR NOT has_table_privilege('anon', 'public.codex_first_discoveries', 'SELECT')
     OR NOT has_table_privilege(
       'authenticated', 'public.codex_first_discoveries', 'SELECT'
     ) OR EXISTS (
       SELECT 1
       FROM (VALUES ('anon'), ('authenticated')) AS roles(role_name)
       CROSS JOIN (
         VALUES ('public.player_codex'), ('public.codex_first_discoveries')
       ) AS tables(table_name)
       CROSS JOIN (
         VALUES
           ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
           ('TRIGGER'), ('REFERENCES')
       ) AS privileges(privilege_name)
       WHERE has_table_privilege(
         roles.role_name, tables.table_name, privileges.privilege_name
       )
     ) THEN
    RAISE EXCEPTION 'Versioned Codex table privilege boundary is wrong';
  END IF;

  SELECT array_agg(attribute_row.attname::TEXT ORDER BY key_row.ordinal)
    INTO v_ids_expected
  FROM pg_constraint AS constraint_row
  CROSS JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY
    AS key_row(attnum, ordinal)
  JOIN pg_attribute AS attribute_row
    ON attribute_row.attrelid = constraint_row.conrelid
   AND attribute_row.attnum = key_row.attnum
  WHERE constraint_row.conrelid = 'public.player_codex'::REGCLASS
    AND constraint_row.contype = 'p';
  IF v_ids_expected IS DISTINCT FROM ARRAY[
       'player_id', 'rules_version', 'discovery_type', 'entry_id'
     ]::TEXT[] THEN
    RAISE EXCEPTION 'Player Codex identity is not rules-versioned: %', v_ids_expected;
  END IF;
  SELECT array_agg(attribute_row.attname::TEXT ORDER BY key_row.ordinal)
    INTO v_ids_expected
  FROM pg_constraint AS constraint_row
  CROSS JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY
    AS key_row(attnum, ordinal)
  JOIN pg_attribute AS attribute_row
    ON attribute_row.attrelid = constraint_row.conrelid
   AND attribute_row.attnum = key_row.attnum
  WHERE constraint_row.conrelid = 'public.codex_first_discoveries'::REGCLASS
    AND constraint_row.contype = 'p';
  IF v_ids_expected IS DISTINCT FROM ARRAY[
       'rules_version', 'discovery_type', 'entry_id'
     ]::TEXT[] THEN
    RAISE EXCEPTION 'World-first Codex identity is not rules-versioned: %', v_ids_expected;
  END IF;

  IF to_regprocedure('public.refresh_contract_progress(uuid,date)') IS NULL
     OR has_function_privilege(
       'service_role', 'public.refresh_contract_progress(uuid,date)', 'EXECUTE'
     ) OR has_function_privilege(
       'authenticated', 'public.refresh_contract_progress(uuid,date)', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Retired contract tombstone privilege boundary changed';
  END IF;
  BEGIN
    PERFORM refresh_contract_progress(
      '06500000-0000-0000-0000-000000000001'::UUID,
      CURRENT_DATE
    );
    RAISE EXCEPTION 'Retired contract refresh unexpectedly executed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Retired contract refresh unexpectedly executed' THEN RAISE; END IF;
    IF POSITION('CONTRACTS_RETIRED' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
END;
$$;

DO $$
DECLARE
  v_user UUID := '06500000-0000-4000-8000-000000000101';
  v_player UUID;
  v_invalid_session UUID := '06500000-0000-4000-8000-000000000102';
  v_free_session UUID := '06500000-0000-4000-8000-000000000103';
  v_valid_session UUID := '06500000-0000-4000-8000-000000000104';
  v_started TIMESTAMPTZ := clock_timestamp() - INTERVAL '90 seconds';
  v_record JSONB := jsonb_build_object(
    'v', 2,
    'dynasty', 'PRIMAL',
    'runSeed', 'sql-stateful-codex-065',
    'instances', jsonb_build_object(
      'mirror-parent', jsonb_build_object(
        'instanceId', 'mirror-parent', 'geneId', 'mirror_wager',
        'status', 'replaced', 'slot', 0
      ),
      'phoenix-parent', jsonb_build_object(
        'instanceId', 'phoenix-parent', 'geneId', 'phoenix',
        'status', 'replaced', 'slot', 1
      )
    ),
    'retired', jsonb_build_array(
      jsonb_build_object(
        'instanceId', 'mirror-parent', 'reason', 'splice', 'atFood', 12,
        'spliceId', 'splice_styx_contract'
      ),
      jsonb_build_object(
        'instanceId', 'phoenix-parent', 'reason', 'splice', 'atFood', 12,
        'spliceId', 'splice_styx_contract'
      )
    ),
    'activeSplices', jsonb_build_array(),
    'discoveredSplices', jsonb_build_array(),
    'expressions', jsonb_build_object('AURUM', 8),
    'apexes', jsonb_build_object('UMBRA', 21),
    'journal', jsonb_build_array(),
    'settlement', jsonb_build_object(
      'v', 2, 'terminal', 'bank', 'harvestEligibleYield', 10000,
      'ineligibleFixedRewards', 0
    )
  );
  v_before_dna INTEGER;
  v_first JSONB;
  v_second JSONB;
  v_count INTEGER;
BEGIN
  INSERT INTO auth.users(id, aud, role, email, created_at, updated_at)
  VALUES (
    v_user, 'authenticated', 'authenticated',
    'genome-stateful-065@example.test', NOW(), NOW()
  );
  SELECT player.id INTO v_player
  FROM players AS player
  WHERE player.user_id = v_user;
  IF v_player IS NULL THEN
    RAISE EXCEPTION 'Genome 065 player provisioning failed';
  END IF;
  SELECT dna INTO v_before_dna FROM players WHERE id = v_player;

  -- An atomically observed but validator-rejected earning run is still not an
  -- earning authority for Codex progress.
  INSERT INTO game_sessions(
    id, player_id, dynasty, started_at, server_started_at,
    validated, extracted, is_free_play, energy_committed,
    energy_harvest_multiplier_bps, genome
  ) VALUES (
    v_invalid_session, v_player, 'PRIMAL', v_started, v_started,
    FALSE, TRUE, FALSE, 1, 10000, v_record
  );
  PERFORM pg_temp.complete_atomic_genome_session(
    v_invalid_session, clock_timestamp() - INTERVAL '30 seconds'
  );
  BEGIN
    PERFORM record_session_codex_discoveries(
      v_player, v_invalid_session, v_record
    );
    RAISE EXCEPTION 'Unvalidated session unexpectedly recorded Codex progress';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Unvalidated session unexpectedly recorded Codex progress' THEN
      RAISE;
    END IF;
    IF POSITION('Completed earning session not found' IN SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;

  -- Free Play can be completed directly because it has no economy transition,
  -- but neither the raw recorder nor the atomic wrapper may accept it.
  INSERT INTO game_sessions(
    id, player_id, dynasty, started_at, server_started_at, ended_at,
    end_reason, validated, extracted, is_free_play, genome
  ) VALUES (
    v_free_session, v_player, 'PRIMAL', v_started, v_started,
    clock_timestamp() - INTERVAL '20 seconds', 'completed',
    TRUE, TRUE, TRUE, v_record
  );
  BEGIN
    PERFORM record_codex_discoveries(v_player, v_free_session, v_record);
    RAISE EXCEPTION 'Free session unexpectedly recorded Codex progress';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Free session unexpectedly recorded Codex progress' THEN RAISE; END IF;
    IF POSITION('Completed earning session not found' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM record_session_codex_discoveries(
      v_player, v_free_session, v_record
    );
    RAISE EXCEPTION 'Non-atomic session unexpectedly crossed Codex cutoff';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Non-atomic session unexpectedly crossed Codex cutoff' THEN RAISE; END IF;
    IF POSITION('CODEX_SESSION_CUTOFF_NOT_ATOMIC' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
  IF (SELECT dna FROM players WHERE id = v_player) <> v_before_dna
     OR EXISTS (SELECT 1 FROM player_codex WHERE player_id = v_player)
     OR EXISTS (
       SELECT 1 FROM economy_transactions
       WHERE player_id = v_player AND source_type = 'codex_discovery'
     ) THEN
    RAISE EXCEPTION 'Rejected sessions changed Codex or economy state';
  END IF;

  INSERT INTO game_sessions(
    id, player_id, dynasty, started_at, server_started_at,
    validated, extracted, is_free_play, energy_committed,
    energy_harvest_multiplier_bps, genome
  ) VALUES (
    v_valid_session, v_player, 'PRIMAL', v_started, v_started,
    TRUE, TRUE, FALSE, 1, 10000, v_record
  );

  -- Represent already-paid v1 history under the same textual ids. It must
  -- remain visible and must not suppress the semantically distinct v2 awards.
  INSERT INTO player_codex(
    player_id, rules_version, discovery_type, entry_id, first_session_id
  ) VALUES
    (v_player, 1, 'splice', 'splice_styx_contract', v_valid_session),
    (v_player, 1, 'expression', 'AURUM', v_valid_session),
    (v_player, 1, 'apex', 'UMBRA', v_valid_session);
  INSERT INTO codex_first_discoveries(
    rules_version, discovery_type, entry_id
  ) VALUES
    (1, 'splice', 'splice_styx_contract'),
    (1, 'expression', 'AURUM'),
    (1, 'apex', 'UMBRA');

  -- Seed every other v2 catalog requirement so this accepted record completes
  -- Genome Weaver through exactly one Splice, one Expression, and one Apex.
  INSERT INTO player_codex(
    player_id, rules_version, discovery_type, entry_id, first_session_id
  )
  SELECT v_player, 2, 'gene', versioned.gene_id, v_valid_session
  FROM genome_gene_versions AS versioned
  WHERE versioned.rules_version = 2 AND versioned.active;

  INSERT INTO player_codex(
    player_id, rules_version, discovery_type, entry_id, first_session_id
  )
  SELECT v_player, 2, 'splice', versioned.splice_id, v_valid_session
  FROM genome_splice_versions AS versioned
  WHERE versioned.rules_version = 2
    AND versioned.active
    AND versioned.splice_id <> 'splice_styx_contract';

  INSERT INTO player_codex(
    player_id, rules_version, discovery_type, entry_id, first_session_id
  ) VALUES
    (v_player, 2, 'expression', 'VOLT', v_valid_session),
    (v_player, 2, 'expression', 'FERAL', v_valid_session),
    (v_player, 2, 'expression', 'FLUX', v_valid_session),
    (v_player, 2, 'expression', 'UMBRA', v_valid_session),
    (v_player, 2, 'apex', 'AURUM', v_valid_session),
    (v_player, 2, 'apex', 'VOLT', v_valid_session),
    (v_player, 2, 'apex', 'FERAL', v_valid_session),
    (v_player, 2, 'apex', 'FLUX', v_valid_session);

  PERFORM pg_temp.complete_atomic_genome_session(
    v_valid_session, clock_timestamp() - INTERVAL '10 seconds'
  );
  v_first := record_session_codex_discoveries(
    v_player, v_valid_session, v_record
  );
  IF (v_first ->> 'rewardDna')::INTEGER <> 800
     OR (v_first ->> 'genomeWeaverUnlocked')::BOOLEAN IS NOT TRUE
     OR jsonb_array_length(v_first -> 'discoveries') <> 3
     OR NOT (v_first -> 'discoveries') @> jsonb_build_array(
       jsonb_build_object(
         'type', 'splice', 'entryId', 'splice_styx_contract',
         'rewardDna', 250, 'rulesVersion', 2
       )
     )
     OR NOT (v_first -> 'discoveries') @> jsonb_build_array(
       jsonb_build_object(
         'type', 'expression', 'entryId', 'AURUM',
         'rewardDna', 150, 'rulesVersion', 2
       )
     )
     OR NOT (v_first -> 'discoveries') @> jsonb_build_array(
       jsonb_build_object(
         'type', 'apex', 'entryId', 'UMBRA',
         'rewardDna', 400, 'rulesVersion', 2
       )
     ) THEN
    RAISE EXCEPTION 'Stateful v2 Codex result is wrong: %', v_first;
  END IF;

  IF (SELECT dna FROM players WHERE id = v_player) <> v_before_dna + 800 THEN
    RAISE EXCEPTION 'Stateful Codex did not credit exactly 800 DNA once';
  END IF;
  SELECT COUNT(*) INTO v_count
  FROM economy_transactions
  WHERE player_id = v_player
    AND source_type = 'codex_discovery'
    AND source_id = v_valid_session
    AND resource_type = 'dna'
    AND amount = 800
    AND balance_after = v_before_dna + 800
    AND metadata ->> 'genomeRulesVersion' = '2';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Stateful Codex ledger is not one exact v2 transaction';
  END IF;

  IF (SELECT COUNT(*) FROM player_codex
      WHERE player_id = v_player
        AND discovery_type = 'splice'
        AND entry_id = 'splice_styx_contract') <> 2
     OR (SELECT COUNT(*) FROM player_codex
         WHERE player_id = v_player
           AND discovery_type = 'expression'
           AND entry_id = 'AURUM') <> 2
     OR (SELECT COUNT(*) FROM player_codex
         WHERE player_id = v_player
           AND discovery_type = 'apex'
           AND entry_id = 'UMBRA') <> 2
     OR (SELECT COUNT(*) FROM codex_first_discoveries
         WHERE discovery_type = 'splice'
           AND entry_id = 'splice_styx_contract') <> 2 THEN
    RAISE EXCEPTION 'v1 and v2 Codex identities did not coexist';
  END IF;
  IF (SELECT COUNT(*) FROM player_cosmetics
      WHERE player_id = v_player AND cosmetic_id = 'genome_weaver') <> 1 THEN
    RAISE EXCEPTION 'Genome Weaver cosmetic was not granted exactly once';
  END IF;

  v_second := record_session_codex_discoveries(
    v_player, v_valid_session, v_record
  );
  IF v_second IS DISTINCT FROM jsonb_build_object(
       'discoveries', '[]'::JSONB,
       'rewardDna', 0,
       'genomeWeaverUnlocked', FALSE
     )
     OR (SELECT dna FROM players WHERE id = v_player) <> v_before_dna + 800
     OR (SELECT COUNT(*) FROM economy_transactions
         WHERE player_id = v_player
           AND source_type = 'codex_discovery'
           AND source_id = v_valid_session) <> 1
     OR (SELECT COUNT(*) FROM player_cosmetics
         WHERE player_id = v_player
           AND cosmetic_id = 'genome_weaver') <> 1 THEN
    RAISE EXCEPTION 'Sequential Codex replay was not idempotent: %', v_second;
  END IF;
END;
$$;

ROLLBACK;
