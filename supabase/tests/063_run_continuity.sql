-- Local integration contract for migration 063.
-- Run only against an isolated `supabase db reset` database:
--   psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/063_run_continuity.sql

BEGIN;

DO $$
DECLARE
  v_user UUID := '06300000-0000-0000-0000-000000000001';
  v_player UUID;
  v_variant UUID;
  v_snake UUID := '06300000-0000-0000-0000-000000000002';
  v_orphan UUID := '06300000-0000-0000-0000-000000000003';
  v_session UUID := '06300000-0000-0000-0000-000000000004';
  v_start_request UUID := '06300000-0000-4000-8000-000000000005';
  v_started TIMESTAMPTZ := clock_timestamp() - INTERVAL '10 seconds';
  v_captured TIMESTAMPTZ;
  v_manifest_base JSONB := jsonb_build_object(
    'runSnake', jsonb_build_object('dynasty', 'PRIMAL')
  );
  v_manifest JSONB;
  v_retry_manifest JSONB;
  v_opening JSONB;
  v_checkpoint JSONB;
  v_activation JSONB;
  v_resume JSONB;
  v_saved JSONB;
  v_saved_retry JSONB;
  v_snapshot JSONB;
  v_envelope JSONB;
  v_terminal_facts JSONB;
  v_terminal_intent JSONB;
  v_terminal_intent_retry JSONB;
  v_terminal JSONB;
  v_terminal_retry JSONB;
  v_energy_before INTEGER;
  v_energy_after INTEGER;
  v_first_saved_at TEXT;
  v_current_lease TEXT := repeat('c', 64);
  v_old_lease TEXT := repeat('b', 64);
  v_opening_digest TEXT := repeat('a', 64);
  v_checkpoint_digest TEXT := repeat('d', 64);
  v_signature TEXT;
BEGIN
  -- These RPCs carry Energy, resumable run state, or terminal evidence. Only
  -- the trusted application service may call them; browser roles receive no
  -- direct execution authority.
  FOREACH v_signature IN ARRAY ARRAY[
    'public.finalize_run_continuity_start(uuid,uuid,uuid,text,jsonb,boolean,integer,boolean,integer,integer,integer[],timestamp with time zone,integer,integer,integer)',
    'public.activate_run_continuity(uuid,uuid,jsonb,text,text,text,integer)',
    'public.resume_run_continuity(uuid,uuid,text,text)',
    'public.save_run_continuity_checkpoint(uuid,uuid,integer,jsonb,text,text,integer)',
    'public.stage_run_continuity_terminal(uuid,uuid,integer,text,jsonb,text)',
    'public.stage_continuity_game_session_end(uuid,uuid,uuid,text,jsonb)',
    'public.complete_free_run_continuity(uuid,uuid,text,jsonb)',
    'public.abandon_run_continuity(uuid,uuid,text,text)'
  ] LOOP
    IF has_function_privilege('authenticated', v_signature, 'EXECUTE')
       OR has_function_privilege('anon', v_signature, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'continuity RPC privilege boundary is wrong: %', v_signature;
    END IF;
  END LOOP;

  SELECT id INTO v_variant FROM snake_variants ORDER BY created_at, id LIMIT 1;
  IF v_variant IS NULL THEN
    RAISE EXCEPTION '063 test fixture requires one seeded snake variant';
  END IF;

  INSERT INTO auth.users(id, aud, role, email, created_at, updated_at)
  VALUES (
    v_user, 'authenticated', 'authenticated',
    'continuity-063@example.test', NOW(), NOW()
  );
  SELECT id INTO v_player FROM players WHERE user_id = v_user;
  UPDATE players
     SET username = 'continuity_063', handle = 'continuity_063',
         stored_energy = 6, energy_updated_at = NOW()
   WHERE id = v_player;
  INSERT INTO collected_snakes(
    id, player_id, snake_variant_id, generation, acquired_method, is_equipped
  ) VALUES (v_snake, v_player, v_variant, 3, 'bred', TRUE);

  -- A process may die after inserting the idempotency shell but before it can
  -- stage a manifest. Preparing has spent zero Energy and is explicitly
  -- releasable without a fabricated lease.
  SELECT stored_energy INTO v_energy_before FROM players WHERE id = v_player;
  INSERT INTO game_sessions(
    id, player_id, snake_used_id, snake_variant_id, dynasty,
    started_at, server_started_at, start_request_id,
    start_request_fingerprint, simulation_seed, simulation_version,
    simulation_rules_version, continuity_start_intent, continuity_phase
  ) VALUES (
    v_orphan, v_player, v_snake, v_variant, 'PRIMAL',
    v_started, v_started, '06300000-0000-4000-8000-000000000006',
    repeat('1', 64), '06300000-0000-4000-8000-000000000007', 1,
    'snake-rules-2026-07-31.2', jsonb_build_object(
      'v', 1, 'startRequestId', '06300000-0000-4000-8000-000000000006',
      'mode', 'earn', 'snakeId', v_snake, 'energyCommitment', 1,
      'confirmMaxEnergy', FALSE, 'signalObjectiveId', NULL, 'ladderRung', NULL
    ), 'preparing'
  );
  PERFORM abandon_run_continuity(
    v_player, v_orphan, NULL, 'snake-rules-2026-07-31.2'
  );
  IF (SELECT end_reason FROM game_sessions WHERE id = v_orphan) <> 'abandoned'
     OR (SELECT energy_committed FROM game_sessions WHERE id = v_orphan) <> 0
     OR (SELECT stored_energy FROM players WHERE id = v_player) <> v_energy_before THEN
    RAISE EXCEPTION 'zero-spend preparing orphan was not released safely';
  END IF;

  -- Prepare one charged run. The manifest and Energy transition are one
  -- transaction; replaying the same request returns the same JSON and spends
  -- nothing a second time.
  INSERT INTO game_sessions(
    id, player_id, snake_used_id, snake_variant_id, dynasty,
    started_at, server_started_at, start_request_id,
    start_request_fingerprint, continuity_start_intent, start_manifest_draft,
    continuity_energy_commitment, continuity_exempt,
    continuity_energy_visible, simulation_seed, simulation_version,
    simulation_rules_version, continuity_phase
  ) VALUES (
    v_session, v_player, v_snake, v_variant, 'PRIMAL',
    v_started, v_started, v_start_request, repeat('2', 64), jsonb_build_object(
      'v', 1, 'startRequestId', v_start_request, 'mode', 'earn',
      'snakeId', v_snake, 'energyCommitment', 1,
      'confirmMaxEnergy', FALSE, 'signalObjectiveId', NULL, 'ladderRung', NULL
    ), v_manifest_base,
    1, FALSE, TRUE, '06300000-0000-4000-8000-000000000008', 1,
    'snake-rules-2026-07-31.2', 'preparing'
  );
  SELECT stored_energy INTO v_energy_before FROM players WHERE id = v_player;
  v_manifest := finalize_run_continuity_start(
    v_player, v_session, v_start_request, repeat('2', 64), v_manifest_base,
    TRUE, 1, FALSE, 6, 3600,
    ARRAY[10000, 22000, 36000, 52000, 72000, 100000],
    '2026-07-27T00:00:00.000Z', 259200, 86400, 5
  );
  SELECT stored_energy INTO v_energy_after FROM players WHERE id = v_player;
  v_retry_manifest := finalize_run_continuity_start(
    v_player, v_session, v_start_request, repeat('2', 64), v_manifest_base,
    TRUE, 1, FALSE, 6, 3600,
    ARRAY[10000, 22000, 36000, 52000, 72000, 100000],
    '2026-07-27T00:00:00.000Z', 259200, 86400, 5
  );
  IF v_manifest IS DISTINCT FROM v_retry_manifest
     OR v_manifest ->> 'sessionId' IS DISTINCT FROM v_session::TEXT
     OR v_manifest #>> '{energy,committed}' IS DISTINCT FROM '1'
     OR v_energy_after <> v_energy_before - 1
     OR (SELECT stored_energy FROM players WHERE id = v_player) <> v_energy_after
     OR (SELECT continuity_phase FROM game_sessions WHERE id = v_session) <> 'prepared' THEN
    RAISE EXCEPTION 'prepared transition was not atomic/idempotent: %', v_manifest;
  END IF;

  v_opening := jsonb_build_object(
    'version', 1,
    'engineVersion', 'snake-engine-v1',
    'rulesVersion', 'snake-rules-2026-07-31.2',
    'config', '{}'::JSONB,
    'state', jsonb_build_object(
      'isPlaying', TRUE, 'isGameOver', FALSE, 'isDeathSequence', FALSE,
      'score', 0
    ),
    'privateState', '{}'::JSONB
  );
  v_activation := activate_run_continuity(
    v_player, v_session, v_opening, v_opening_digest, v_old_lease,
    'snake-rules-2026-07-31.2', 1048576
  );
  IF v_activation ->> 'continuity_phase' <> 'active'
     OR (v_activation ->> 'continuity_checkpoint_revision')::INTEGER <> 1
     OR (SELECT continuity_lease_hash FROM game_sessions WHERE id = v_session) <> v_old_lease THEN
    RAISE EXCEPTION 'prepared-to-active transition was not atomic: %', v_activation;
  END IF;

  -- Resume rotates exclusive authority. The stale lease can no longer save a
  -- checkpoint; the new lease owns monotonic compare-and-swap writes.
  v_resume := resume_run_continuity(
    v_player, v_session, v_current_lease, 'snake-rules-2026-07-31.2'
  );
  IF (v_resume ->> 'continuity_lease_epoch')::INTEGER <> 2
     OR (SELECT continuity_lease_hash FROM game_sessions WHERE id = v_session) <> v_current_lease THEN
    RAISE EXCEPTION 'resume did not rotate the exclusive lease: %', v_resume;
  END IF;
  BEGIN
    PERFORM save_run_continuity_checkpoint(
      v_player, v_session, 1, v_opening, repeat('e', 64), v_old_lease, 1048576
    );
    RAISE EXCEPTION 'stale lease unexpectedly saved a checkpoint';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'stale lease unexpectedly saved a checkpoint' THEN RAISE; END IF;
    IF POSITION('run_lease_conflict' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;

  v_checkpoint := jsonb_set(v_opening, '{state,score}', '1'::JSONB);
  v_saved := save_run_continuity_checkpoint(
    v_player, v_session, 1, v_checkpoint, v_checkpoint_digest,
    v_current_lease, 1048576
  );
  v_first_saved_at := v_saved ->> 'savedAt';
  v_saved_retry := save_run_continuity_checkpoint(
    v_player, v_session, 1, v_checkpoint, v_checkpoint_digest,
    v_current_lease, 1048576
  );
  IF (v_saved ->> 'revision')::INTEGER <> 2
     OR (v_saved_retry ->> 'revision')::INTEGER <> 2
     OR v_saved_retry ->> 'savedAt' IS DISTINCT FROM v_first_saved_at
     OR (SELECT continuity_checkpoint_revision FROM game_sessions WHERE id = v_session) <> 2 THEN
    RAISE EXCEPTION 'checkpoint CAS retry was not idempotent: %, %', v_saved, v_saved_retry;
  END IF;
  BEGIN
    PERFORM save_run_continuity_checkpoint(
      v_player, v_session, 1, v_checkpoint, repeat('f', 64),
      v_current_lease, 1048576
    );
    RAISE EXCEPTION 'stale checkpoint revision unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'stale checkpoint revision unexpectedly succeeded' THEN RAISE; END IF;
    IF POSITION('checkpoint_revision_conflict' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;

  -- Replay-derived terminal facts are frozen first. The browser lease may be
  -- gone after a reload; the service-only terminal→pending fold therefore
  -- needs no browser capability once this immutable phase exists.
  v_captured := clock_timestamp();
  v_snapshot := jsonb_build_object(
    'v', 1, 'settledAt', v_captured, 'dynasty', 'PRIMAL',
    'extracted', TRUE, 'died', FALSE, 'validated', TRUE,
    'score', 1, 'yieldDna', 10, 'dnaCredited', 10,
    'energyCommitted', 1, 'commitmentMultiplierBps', 10000,
    'generation', 3, 'snakeId', v_snake, 'masteryXp', 0,
    'ladderRung', 0, 'genome', NULL,
    'rewardMetadata', '{}'::JSONB,
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
      'energyCommitted', 1, 'commitmentMultiplierBps', 10000,
      'signalRunId', NULL, 'clanBattleId', NULL,
      'clanBattleSideId', NULL, 'clanId', NULL
    ),
    'sessionFacts', jsonb_build_object(
      'durationSeconds', 10, 'victory', FALSE, 'foodsCollected', 1,
      'mutations', NULL, 'deathCause', 'extracted',
      'runEvents', jsonb_build_object(
        'v', 1, 'events', jsonb_build_array(),
        'truncated', FALSE, 'suspect', FALSE
      ),
      'validationErrors', NULL
    )
  );
  v_terminal_facts := jsonb_build_object(
    'score', 1, 'dna_earned', 10, 'duration_seconds', 10,
    'food_count', 1, 'extracted', TRUE, 'died', FALSE,
    'victory', FALSE, 'mutations', NULL,
    'phoenix_triggered_at_food', NULL, 'genome', NULL,
    'death_cause', 'extracted',
    'run_events', jsonb_build_object(
      'v', 1, 'events', jsonb_build_array(), 'truncated', FALSE
    )
  );
  BEGIN
    PERFORM stage_run_continuity_terminal(
      v_player, v_session, 2, v_current_lease,
      v_terminal_facts || jsonb_build_object('padding', repeat('x', 262145)),
      repeat('7', 64)
    );
    RAISE EXCEPTION 'oversized terminal facts unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'oversized terminal facts unexpectedly succeeded' THEN RAISE; END IF;
    IF POSITION('invalid_terminal_intent' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
  v_terminal_intent := stage_run_continuity_terminal(
    v_player, v_session, 2, v_current_lease,
    v_terminal_facts, repeat('9', 64)
  );
  v_terminal_intent_retry := stage_run_continuity_terminal(
    v_player, v_session, 2, v_current_lease,
    v_terminal_facts, repeat('9', 64)
  );
  IF (v_terminal_intent ->> 'inserted')::BOOLEAN IS DISTINCT FROM TRUE
     OR (v_terminal_intent_retry ->> 'inserted')::BOOLEAN IS DISTINCT FROM FALSE
     OR (SELECT continuity_phase FROM game_sessions WHERE id = v_session) <> 'terminal' THEN
    RAISE EXCEPTION 'terminal intent was not immutable/idempotent: %, %',
      v_terminal_intent, v_terminal_intent_retry;
  END IF;
  BEGIN
    PERFORM stage_run_continuity_terminal(
      v_player, v_session, 2, v_current_lease,
      jsonb_set(v_terminal_facts, '{score}', '2'::JSONB), repeat('8', 64)
    );
    RAISE EXCEPTION 'changed terminal intent unexpectedly replaced evidence';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'changed terminal intent unexpectedly replaced evidence' THEN RAISE; END IF;
    IF POSITION('terminal_intent_conflict' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;

  -- Simulate process/tab loss: no lease is available after reopening, but
  -- terminal facts are already server-derived and cannot be resumed/changed.
  v_terminal := stage_continuity_game_session_end(
    v_user, v_player, v_session, NULL, v_envelope
  );
  v_terminal_retry := stage_continuity_game_session_end(
    v_user, v_player, v_session, NULL, v_envelope
  );
  IF v_terminal ->> 'state' <> 'staged'
     OR (v_terminal ->> 'inserted')::BOOLEAN IS DISTINCT FROM TRUE
     OR v_terminal_retry ->> 'state' <> 'staged'
     OR (v_terminal_retry ->> 'inserted')::BOOLEAN IS DISTINCT FROM FALSE
     OR (SELECT end_reason FROM game_sessions WHERE id = v_session) <> 'completed'
     OR (SELECT ended_at FROM game_sessions WHERE id = v_session) IS NOT NULL
     OR (SELECT COUNT(*) FROM pending_game_session_ends WHERE session_id = v_session) <> 1 THEN
    RAISE EXCEPTION 'terminal settling transition was not exactly once: %, %',
      v_terminal, v_terminal_retry;
  END IF;
  BEGIN
    PERFORM stage_continuity_game_session_end(
      v_user, v_player, v_session, NULL,
      jsonb_set(v_envelope, '{snapshot,score}', '2'::JSONB)
    );
    RAISE EXCEPTION 'changed terminal replay unexpectedly replaced evidence';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'changed terminal replay unexpectedly replaced evidence' THEN RAISE; END IF;
    IF POSITION('run_not_terminalizable' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM abandon_run_continuity(
      v_player, v_session, v_current_lease, 'snake-rules-2026-07-31.2'
    );
    RAISE EXCEPTION 'settling run unexpectedly became abandonable';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'settling run unexpectedly became abandonable' THEN RAISE; END IF;
    IF POSITION('run_not_terminalizable' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
END;
$$;

ROLLBACK;
