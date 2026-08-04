-- Local integration contract for migration 067.
-- Run only against an isolated `supabase db reset` database:
--   psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/067_player_gene_eligibility.sql

BEGIN;

-- Settle an earning run through the same trigger-authored atomic observation
-- production settlement uses. `guard_atomic_reward_transition` refuses a
-- directly-inserted completed earning session, and rightly so: an eligibility
-- promotion must never be provable with a fabricated settled row.
CREATE OR REPLACE FUNCTION pg_temp.settle_atomic_session(
  p_session_id UUID,
  p_ended_at   TIMESTAMPTZ DEFAULT clock_timestamp()
) RETURNS VOID AS $$
DECLARE
  v_session game_sessions%ROWTYPE;
  v_user_id UUID;
  v_result  JSONB;
BEGIN
  SELECT * INTO v_session FROM game_sessions WHERE id = p_session_id;
  IF NOT FOUND OR v_session.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'ELIGIBILITY_TEST_SESSION_NOT_OPEN';
  END IF;
  SELECT player.user_id INTO v_user_id
  FROM players AS player WHERE player.id = v_session.player_id;

  v_result := stage_pending_game_session_end(
    v_user_id,
    v_session.player_id,
    v_session.id,
    jsonb_build_object(
      'kind', 'career_pending_end_v1',
      'v', 1,
      'userId', v_user_id,
      'playerId', v_session.player_id,
      'sessionId', v_session.id,
      'capturedAt', p_ended_at,
      'snapshot', jsonb_build_object(
        'v', 1,
        'settledAt', p_ended_at,
        'dynasty', v_session.dynasty,
        'extracted', COALESCE(v_session.extracted, FALSE),
        'died', COALESCE(v_session.died, FALSE),
        'validated', COALESCE(v_session.validated, FALSE),
        'score', 0,
        'yieldDna', 0,
        'dnaCredited', 0,
        'energyCommitted', COALESCE(v_session.energy_committed, 0),
        'commitmentMultiplierBps', COALESCE(
          v_session.energy_harvest_multiplier_bps, 10000
        ),
        'generation', 1,
        'snakeId', v_session.snake_used_id,
        'masteryXp', 0,
        'ladderRung', 0,
        'genome', 'null'::JSONB,
        'rewardMetadata', '{}'::JSONB,
        'clan', jsonb_build_object(
          'bestCount', 5,
          'completionGraceSeconds', 10800,
          'maxRunDurationSeconds', 10800
        )
      ),
      'binding', jsonb_build_object(
        'startedAt', v_session.started_at,
        'dynasty', v_session.dynasty,
        'snakeId', v_session.snake_used_id,
        'snakeVariantId', v_session.snake_variant_id,
        'runSeed', v_session.run_seed,
        'runContext', v_session.run_context,
        'energyCommitted', COALESCE(v_session.energy_committed, 0),
        'commitmentMultiplierBps', COALESCE(
          v_session.energy_harvest_multiplier_bps, 10000
        ),
        'signalRunId', v_session.signal_objective_run_id,
        'clanBattleId', v_session.clan_energy_battle_id,
        'clanBattleSideId', v_session.clan_energy_battle_side_id,
        'clanId', v_session.clan_energy_clan_id
      ),
      'sessionFacts', jsonb_build_object(
        'durationSeconds', 60,
        'victory', FALSE,
        'foodsCollected', 0,
        'mutations', v_session.mutations,
        'deathCause', v_session.death_cause,
        'runEvents', v_session.run_events,
        'validationErrors', v_session.validation_errors
      )
    )
  );
  IF v_result ->> 'state' <> 'staged' THEN
    RAISE EXCEPTION 'ELIGIBILITY_TEST_STAGE_FAILED: %', v_result;
  END IF;
  v_result := adopt_pending_game_session_end(v_session.id);
  IF v_result ->> 'state' <> 'adopted' THEN
    RAISE EXCEPTION 'ELIGIBILITY_TEST_ADOPTION_FAILED: %', v_result;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 1. Shape, RLS and privilege boundary
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_columns TEXT[];
  v_policies TEXT[];
  v_signature TEXT;
BEGIN
  SELECT array_agg(attribute_row.attname::TEXT ORDER BY key_row.ordinal)
    INTO v_columns
  FROM pg_constraint AS constraint_row
  CROSS JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY
    AS key_row(attnum, ordinal)
  JOIN pg_attribute AS attribute_row
    ON attribute_row.attrelid = constraint_row.conrelid
   AND attribute_row.attnum = key_row.attnum
  WHERE constraint_row.conrelid = 'public.player_gene_eligibility'::REGCLASS
    AND constraint_row.contype = 'p';
  IF v_columns IS DISTINCT FROM ARRAY[
       'player_id', 'rules_version', 'gene_id'
     ]::TEXT[] THEN
    RAISE EXCEPTION 'Gene eligibility identity is not rules-versioned: %', v_columns;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.player_gene_eligibility'::REGCLASS AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Gene eligibility table does not enforce row level security';
  END IF;

  -- SELECT-only for the owning player, and NO write policy at all. A direct
  -- client write must be refused by the database, not by a convention.
  SELECT array_agg(policyname::TEXT ORDER BY policyname) INTO v_policies
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'player_gene_eligibility';
  IF v_policies IS DISTINCT FROM ARRAY['player_gene_eligibility_select_own']::TEXT[] THEN
    RAISE EXCEPTION 'Gene eligibility has policies beyond the own-row read: %', v_policies;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'player_gene_eligibility'
      AND cmd = 'SELECT'
      AND qual LIKE '%user_id = auth.uid()%'
  ) THEN
    RAISE EXCEPTION 'Gene eligibility read policy is not scoped to the owning player';
  END IF;

  -- Browser roles may read their own rows and nothing else; every mutation
  -- verb is closed to them at the grant level as well as the policy level.
  IF NOT has_table_privilege('authenticated', 'public.player_gene_eligibility', 'SELECT')
     OR has_table_privilege('anon', 'public.player_gene_eligibility', 'SELECT')
     OR EXISTS (
       SELECT 1
       FROM (VALUES ('anon'), ('authenticated')) AS roles(role_name)
       CROSS JOIN (
         VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
                ('TRIGGER'), ('REFERENCES')
       ) AS privileges(privilege_name)
       WHERE has_table_privilege(
         roles.role_name,
         'public.player_gene_eligibility',
         privileges.privilege_name
       )
     ) THEN
    RAISE EXCEPTION 'Gene eligibility table privilege boundary is wrong';
  END IF;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.genome_eligibility_active_gene_ids(smallint,text[])',
    'public.grant_starter_eligibility(uuid,smallint,text[])',
    'public.select_gene_trial(uuid,smallint,text)',
    'public.record_trial_offer(uuid,smallint,text,uuid)',
    'public.resolve_learning_event(uuid,smallint,text,uuid,smallint)',
    'public.graduate_full_roster(uuid,smallint,text[])',
    'public.read_gene_eligibility(uuid,smallint)'
  ]::TEXT[] LOOP
    IF to_regprocedure(v_signature) IS NULL
       OR has_function_privilege('authenticated', v_signature, 'EXECUTE')
       OR has_function_privilege('anon', v_signature, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'Gene eligibility service function boundary is wrong: %', v_signature;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc
      WHERE oid = v_signature::REGPROCEDURE
        AND prosecdef
        AND 'search_path=public' = ANY(COALESCE(proconfig, ARRAY[]::TEXT[]))
    ) THEN
      RAISE EXCEPTION 'Gene eligibility function is not SECURITY DEFINER with a pinned search_path: %', v_signature;
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Behaviour: seeding, trials, resolution, graduation
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user           UUID := '06700000-0000-4000-8000-000000000101';
  v_other_user     UUID := '06700000-0000-4000-8000-000000000102';
  v_player         UUID;
  v_other_player   UUID;
  v_free_session   UUID := '06700000-0000-4000-8000-000000000201';
  v_invalid_session UUID := '06700000-0000-4000-8000-000000000202';
  v_valid_session  UUID := '06700000-0000-4000-8000-000000000203';
  v_started        TIMESTAMPTZ := clock_timestamp() - INTERVAL '90 seconds';
  v_starters       TEXT[] := ARRAY[
    'zenith_protocol', 'live_wire', 'gold_trail', 'compound_interest',
    'phoenix', 'overgrowth', 'phase_gate'
  ];
  v_written        INTEGER;
  v_result         JSONB;
  v_state          TEXT;
  v_source         TEXT;
  v_first_at       TIMESTAMPTZ;
  v_remaining      INTEGER;
  v_roster         INTEGER;
BEGIN
  INSERT INTO auth.users(id, aud, role, email, created_at, updated_at)
  VALUES
    (v_user, 'authenticated', 'authenticated',
     'eligibility-067@example.test', NOW(), NOW()),
    (v_other_user, 'authenticated', 'authenticated',
     'eligibility-067-other@example.test', NOW(), NOW());
  SELECT id INTO v_player FROM players WHERE user_id = v_user;
  SELECT id INTO v_other_player FROM players WHERE user_id = v_other_user;
  IF v_player IS NULL OR v_other_player IS NULL THEN
    RAISE EXCEPTION 'Gene eligibility 067 player provisioning failed';
  END IF;

  -- An account with no rows composes to "no curriculum state", which the
  -- server resolves to the complete legal Dynasty roster.
  v_result := read_gene_eligibility(v_player, 2::SMALLINT);
  IF v_result IS DISTINCT FROM jsonb_build_object(
       'eligibleGeneIds', '[]'::JSONB, 'trialGeneId', NULL
     ) THEN
    RAISE EXCEPTION 'Empty eligibility projection is wrong: %', v_result;
  END IF;

  -- The starter seven, seeded once. A repeat call writes nothing.
  v_written := grant_starter_eligibility(v_player, 2::SMALLINT, v_starters);
  IF v_written <> 7 THEN
    RAISE EXCEPTION 'Starter seed wrote % rows, expected 7', v_written;
  END IF;
  IF grant_starter_eligibility(v_player, 2::SMALLINT, v_starters) <> 0 THEN
    RAISE EXCEPTION 'Starter seed is not idempotent';
  END IF;
  v_result := read_gene_eligibility(v_player, 2::SMALLINT);
  IF jsonb_array_length(v_result -> 'eligibleGeneIds') <> 7
     OR v_result -> 'trialGeneId' <> 'null'::JSONB THEN
    RAISE EXCEPTION 'Starter projection is wrong: %', v_result;
  END IF;

  -- An unknown or shelved id is dropped rather than raising: a rotated roster
  -- must never be able to fail a run start.
  IF grant_starter_eligibility(
       v_player, 2::SMALLINT, ARRAY['not_a_gene', 'still_not_a_gene']
     ) <> 0 THEN
    RAISE EXCEPTION 'Unknown gene ids were written as eligibility';
  END IF;

  -- Selecting a trial. Only one exists at a time, and switching costs nothing.
  v_result := select_gene_trial(v_player, 2::SMALLINT, 'circuit_run');
  IF (v_result ->> 'state') <> 'trial' OR (v_result ->> 'changed')::BOOLEAN IS NOT TRUE THEN
    RAISE EXCEPTION 'Trial selection is wrong: %', v_result;
  END IF;
  PERFORM select_gene_trial(v_player, 2::SMALLINT, 'loom_anchor');
  IF (SELECT COUNT(*) FROM player_gene_eligibility
      WHERE player_id = v_player AND rules_version = 2 AND state = 'trial') <> 1
     OR EXISTS (
       SELECT 1 FROM player_gene_eligibility
       WHERE player_id = v_player AND rules_version = 2 AND gene_id = 'circuit_run'
     ) THEN
    RAISE EXCEPTION 'Switching a trial did not leave exactly one trial';
  END IF;
  v_result := read_gene_eligibility(v_player, 2::SMALLINT);
  IF (v_result ->> 'trialGeneId') <> 'loom_anchor'
     OR jsonb_array_length(v_result -> 'eligibleGeneIds') <> 7 THEN
    RAISE EXCEPTION 'Projection after a switch is wrong: %', v_result;
  END IF;

  -- A trial cannot reach an already-earned row. Selecting a starter as a trial
  -- is answered, not obeyed.
  v_result := select_gene_trial(v_player, 2::SMALLINT, 'gold_trail');
  IF (v_result ->> 'state') <> 'offer_eligible'
     OR (v_result ->> 'changed')::BOOLEAN IS NOT FALSE THEN
    RAISE EXCEPTION 'An earned Gene was accepted as a trial: %', v_result;
  END IF;
  SELECT state, source INTO v_state, v_source
  FROM player_gene_eligibility
  WHERE player_id = v_player AND rules_version = 2 AND gene_id = 'gold_trail';
  IF v_state <> 'offer_eligible' OR v_source <> 'starter' THEN
    RAISE EXCEPTION 'An earned Gene was rewritten by a trial selection';
  END IF;

  -- Free Play and an unvalidated run are not resolution authority.
  -- Free Play can be completed directly because it has no economy transition.
  INSERT INTO game_sessions(
    id, player_id, dynasty, started_at, server_started_at, ended_at,
    end_reason, validated, extracted, is_free_play
  ) VALUES (
    v_free_session, v_player, 'CYBER', v_started, v_started,
    clock_timestamp() - INTERVAL '40 seconds', 'completed', TRUE, TRUE, TRUE
  );

  -- The guarantee is consumed by collected offers, and never past three.
  v_remaining := record_trial_offer(
    v_player, 2::SMALLINT, 'loom_anchor', v_free_session
  );
  IF v_remaining <> 2 THEN
    RAISE EXCEPTION 'First trial appearance left % guaranteed, expected 2', v_remaining;
  END IF;
  PERFORM record_trial_offer(v_player, 2::SMALLINT, 'loom_anchor', v_free_session);
  PERFORM record_trial_offer(v_player, 2::SMALLINT, 'loom_anchor', v_free_session);
  IF record_trial_offer(v_player, 2::SMALLINT, 'loom_anchor', v_free_session) <> 0 THEN
    RAISE EXCEPTION 'The trial guarantee ran past three appearances';
  END IF;
  IF (SELECT trial_offers_seen FROM player_gene_eligibility
      WHERE player_id = v_player AND rules_version = 2
        AND gene_id = 'loom_anchor') <> 3
     OR (SELECT resolved_session_id FROM player_gene_eligibility
         WHERE player_id = v_player AND rules_version = 2
           AND gene_id = 'loom_anchor') IS NOT NULL THEN
    RAISE EXCEPTION 'Trial appearances are miscounted or claim a resolution';
  END IF;

  -- Another player's run cannot consume this player's guarantee.
  BEGIN
    PERFORM record_trial_offer(
      v_other_player, 2::SMALLINT, 'loom_anchor', v_free_session
    );
    RAISE EXCEPTION 'A foreign session unexpectedly consumed a guarantee';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'A foreign session unexpectedly consumed a guarantee' THEN RAISE; END IF;
    IF POSITION('GENE_ELIGIBILITY_SESSION_NOT_AUTHORITATIVE' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
  -- The two earning runs settle through the atomic path. The second is a
  -- CRASH: success and failure both resolve (boundary 7).
  -- One at a time: `guard_one_open_game_session` allows a player exactly one
  -- open run, which is the same rule production plays under.
  INSERT INTO game_sessions(
    id, player_id, dynasty, started_at, server_started_at,
    validated, extracted, is_free_play, energy_committed,
    energy_harvest_multiplier_bps
  ) VALUES (
    v_invalid_session, v_player, 'CYBER', v_started, v_started,
    FALSE, TRUE, FALSE, 1, 10000
  );
  PERFORM pg_temp.settle_atomic_session(
    v_invalid_session, clock_timestamp() - INTERVAL '30 seconds'
  );
  INSERT INTO game_sessions(
    id, player_id, dynasty, started_at, server_started_at,
    validated, extracted, is_free_play, energy_committed,
    energy_harvest_multiplier_bps
  ) VALUES (
    v_valid_session, v_player, 'CYBER', v_started, v_started,
    TRUE, FALSE, FALSE, 1, 10000
  );
  PERFORM pg_temp.settle_atomic_session(
    v_valid_session, clock_timestamp() - INTERVAL '20 seconds'
  );

  BEGIN
    PERFORM resolve_learning_event(
      v_player, 2::SMALLINT, 'loom_anchor', v_free_session, 1::SMALLINT
    );
    RAISE EXCEPTION 'Free Play unexpectedly resolved a learning event';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Free Play unexpectedly resolved a learning event' THEN RAISE; END IF;
    IF POSITION('GENE_ELIGIBILITY_SESSION_NOT_AUTHORITATIVE' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM resolve_learning_event(
      v_player, 2::SMALLINT, 'loom_anchor', v_invalid_session, 1::SMALLINT
    );
    RAISE EXCEPTION 'An unvalidated run unexpectedly resolved a learning event';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'An unvalidated run unexpectedly resolved a learning event' THEN RAISE; END IF;
    IF POSITION('GENE_ELIGIBILITY_SESSION_NOT_AUTHORITATIVE' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
  -- Another player's session is not this player's authority either.
  BEGIN
    PERFORM resolve_learning_event(
      v_other_player, 2::SMALLINT, 'loom_anchor', v_valid_session, 1::SMALLINT
    );
    RAISE EXCEPTION 'A foreign session unexpectedly resolved a learning event';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'A foreign session unexpectedly resolved a learning event' THEN RAISE; END IF;
    IF POSITION('GENE_ELIGIBILITY_SESSION_NOT_AUTHORITATIVE' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
  IF (SELECT state FROM player_gene_eligibility
      WHERE player_id = v_player AND rules_version = 2
        AND gene_id = 'loom_anchor') <> 'trial' THEN
    RAISE EXCEPTION 'A rejected resolution still changed eligibility state';
  END IF;

  -- A validated crash promotes exactly once.
  v_result := resolve_learning_event(
    v_player, 2::SMALLINT, 'loom_anchor', v_valid_session, 1::SMALLINT
  );
  IF (v_result ->> 'promoted')::BOOLEAN IS NOT TRUE THEN
    RAISE EXCEPTION 'A validated crash did not resolve its learning event: %', v_result;
  END IF;
  SELECT state, source, first_eligible_at INTO v_state, v_source, v_first_at
  FROM player_gene_eligibility
  WHERE player_id = v_player AND rules_version = 2 AND gene_id = 'loom_anchor';
  IF v_state <> 'offer_eligible' OR v_source <> 'trial_resolved'
     OR v_first_at IS NULL THEN
    RAISE EXCEPTION 'Resolved eligibility row is wrong: % / % / %',
      v_state, v_source, v_first_at;
  END IF;
  v_result := resolve_learning_event(
    v_player, 2::SMALLINT, 'loom_anchor', v_valid_session, 1::SMALLINT
  );
  IF (v_result ->> 'promoted')::BOOLEAN IS NOT FALSE
     OR (SELECT first_eligible_at FROM player_gene_eligibility
         WHERE player_id = v_player AND rules_version = 2
           AND gene_id = 'loom_anchor') <> v_first_at THEN
    RAISE EXCEPTION 'A replayed settlement promoted twice or rewrote its timestamp';
  END IF;

  -- A run whose event never fired is not promoted by asking again.
  IF (resolve_learning_event(
        v_player, 2::SMALLINT, 'coilkeeper', v_valid_session, 1::SMALLINT
      ) ->> 'promoted')::BOOLEAN IS NOT FALSE
     OR EXISTS (
       SELECT 1 FROM player_gene_eligibility
       WHERE player_id = v_player AND rules_version = 2 AND gene_id = 'coilkeeper'
     ) THEN
    RAISE EXCEPTION 'Resolution invented an eligibility row';
  END IF;

  -- Graduation grants the whole roster and never rewrites an earned row.
  SELECT COUNT(*) INTO v_roster
  FROM genome_gene_versions WHERE rules_version = 2 AND active;
  PERFORM select_gene_trial(v_player, 2::SMALLINT, 'coilkeeper');
  v_written := graduate_full_roster(
    v_player, 2::SMALLINT,
    (SELECT array_agg(gene_id) FROM genome_gene_versions
     WHERE rules_version = 2 AND active)
  );
  IF (SELECT COUNT(*) FROM player_gene_eligibility
      WHERE player_id = v_player AND rules_version = 2) <> v_roster
     OR EXISTS (
       SELECT 1 FROM player_gene_eligibility
       WHERE player_id = v_player AND rules_version = 2 AND state <> 'offer_eligible'
     ) THEN
    RAISE EXCEPTION 'Graduation did not grant the complete roster as eligible';
  END IF;
  SELECT source, first_eligible_at INTO v_source, v_first_at
  FROM player_gene_eligibility
  WHERE player_id = v_player AND rules_version = 2 AND gene_id = 'loom_anchor';
  IF v_source <> 'trial_resolved' THEN
    RAISE EXCEPTION 'Graduation overwrote how a Gene was actually earned';
  END IF;
  IF graduate_full_roster(
       v_player, 2::SMALLINT,
       (SELECT array_agg(gene_id) FROM genome_gene_versions
        WHERE rules_version = 2 AND active)
     ) <> 0 THEN
    RAISE EXCEPTION 'Graduation is not idempotent';
  END IF;

  -- One account's curriculum is never another's.
  IF (SELECT COUNT(*) FROM player_gene_eligibility
      WHERE player_id = v_other_player) <> 0 THEN
    RAISE EXCEPTION 'Eligibility leaked across accounts';
  END IF;

  -- A different rules version is a separate curriculum, untouched by v2.
  IF (SELECT COUNT(*) FROM player_gene_eligibility
      WHERE player_id = v_player AND rules_version = 1) <> 0
     OR read_gene_eligibility(v_player, 1::SMALLINT) IS DISTINCT FROM
        jsonb_build_object('eligibleGeneIds', '[]'::JSONB, 'trialGeneId', NULL) THEN
    RAISE EXCEPTION 'Rules versions are not independent curricula';
  END IF;
END;
$$;

ROLLBACK;
