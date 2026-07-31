-- Hosted-safe structural proof for the cohesive release. This is the only SQL
-- contract permitted to run against the linked project. The Management API
-- request also sets read_only=true; keep this independent database guard.

BEGIN TRANSACTION READ ONLY;

DO $$
DECLARE
  v_result JSONB;
  v_expected JSONB := jsonb_build_object(
    'error', 'founding_confirmation_required',
    'retryable', TRUE
  );
  v_required_constraints TEXT[] := ARRAY[
    'game_sessions_start_request_pair',
    'game_sessions_start_manifest_object',
    'game_sessions_start_manifest_draft_shape',
    'game_sessions_continuity_phase_valid',
    'game_sessions_continuity_checkpoint_shape',
    'game_sessions_continuity_lease_shape',
    'game_sessions_simulation_version_valid',
    'game_sessions_continuity_shape'
  ];
  v_required_indexes TEXT[] := ARRAY[
    'game_sessions_player_start_request_unique',
    'game_sessions_one_open_nonsettling_per_player',
    'idx_collected_favorited_player'
  ];
  v_release_versions TEXT[];
  v_signature TEXT;
BEGIN
  SELECT ARRAY_AGG(version::TEXT ORDER BY version::TEXT)
  INTO v_release_versions
  FROM supabase_migrations.schema_migrations
  WHERE version::TEXT IN ('062', '063', '064');
  IF v_release_versions IS DISTINCT FROM ARRAY['062', '063', '064']::TEXT[] THEN
    RAISE EXCEPTION 'cohesive migration ledger is not exact: %', v_release_versions;
  END IF;

  -- The outgoing seven-argument writer must resolve successfully yet remain
  -- incapable of spending or creating anything. The nonexistent user makes
  -- this call safe even if its implementation regresses; READ ONLY then turns
  -- any attempted mutation into a hard failure.
  v_result := found_clan(
    '00000000-0000-0000-0000-000000000000',
    'Release Probe', 'RLP', NULL, NULL, NULL, NULL
  );
  IF v_result IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'seven-argument founding bridge returned %', v_result;
  END IF;

  IF to_regprocedure(
       'public.found_clan(uuid,text,text,text,text,text,text,integer)'
     ) IS NULL THEN
    RAISE EXCEPTION 'quoted eight-argument founding function is absent';
  END IF;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.found_clan(uuid,text,text,text,text,text,text)',
    'public.found_clan(uuid,text,text,text,text,text,text,integer)',
    'public.set_dynasty_favorite(uuid,uuid,boolean)',
    'public.get_cohesive_release_capability()',
    'public.finalize_run_continuity_start(uuid,uuid,uuid,text,jsonb,boolean,integer,boolean,integer,integer,integer[],timestamp with time zone,integer,integer,integer)',
    'public.activate_run_continuity(uuid,uuid,jsonb,text,text,text,integer)',
    'public.resume_run_continuity(uuid,uuid,text,text)',
    'public.save_run_continuity_checkpoint(uuid,uuid,integer,jsonb,text,text,integer)',
    'public.stage_continuity_game_session_end(uuid,uuid,uuid,text,jsonb)',
    'public.complete_free_run_continuity(uuid,uuid,text,jsonb)',
    'public.abandon_run_continuity(uuid,uuid,text,text)'
  ] LOOP
    IF to_regprocedure(v_signature) IS NULL THEN
      RAISE EXCEPTION 'required service-only function is absent: %', v_signature;
    END IF;
    IF has_function_privilege('anon', v_signature, 'EXECUTE')
       OR has_function_privilege('authenticated', v_signature, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'service-only function boundary is invalid: %', v_signature;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM collected_snakes cs
    JOIN snake_variants sv ON sv.id = cs.snake_variant_id
    WHERE cs.is_favorited = TRUE
    GROUP BY cs.player_id, sv.dynasty_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate player/dynasty favorites remain';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger trigger_row
    WHERE trigger_row.tgrelid = 'public.collected_snakes'::REGCLASS
      AND trigger_row.tgname = 'trg_single_dynasty_favorite'
      AND trigger_row.tgfoid =
        'public.enforce_single_dynasty_favorite()'::REGPROCEDURE
      AND trigger_row.tgenabled = 'O'
      AND NOT trigger_row.tgisinternal
  ) THEN
    RAISE EXCEPTION 'favorite trigger is absent, disabled, or misbound';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid = 'public.game_sessions'::REGCLASS
      AND constraint_row.contype = 'c'
      AND constraint_row.convalidated
      AND constraint_row.conname = ANY(v_required_constraints)
  ) <> cardinality(v_required_constraints) THEN
    RAISE EXCEPTION 'one or more continuity constraints are absent/unvalidated';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM pg_indexes index_row
    WHERE index_row.schemaname = 'public'
      AND index_row.indexname = ANY(v_required_indexes)
  ) <> cardinality(v_required_indexes) THEN
    RAISE EXCEPTION 'one or more cohesive indexes are absent';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger trigger_row
    WHERE trigger_row.tgrelid = 'public.game_sessions'::REGCLASS
      AND trigger_row.tgname = 'game_sessions_run_continuity_immutable'
      AND trigger_row.tgfoid =
        'public.protect_run_continuity()'::REGPROCEDURE
      AND trigger_row.tgenabled = 'O'
      AND NOT trigger_row.tgisinternal
  ) THEN
    RAISE EXCEPTION 'continuity immutability trigger is absent or misbound';
  END IF;

  v_result := get_cohesive_release_capability();
  IF v_result ->> 'status' <> 'ready'
     OR (v_result ->> 'version')::INTEGER <> 1
     OR (v_result ->> 'foundingBridgeVersion')::INTEGER <> 1
     OR (v_result ->> 'continuityVersion')::INTEGER <> 1
     OR (v_result ->> 'favoriteInvariantVersion')::INTEGER <> 1 THEN
    RAISE EXCEPTION 'cohesive release capability is incomplete: %', v_result;
  END IF;
END;
$$;

SELECT jsonb_build_object(
  'status', 'ready',
  'probe', 'cohesive_release_read_only_v1'
) AS cohesive_release_probe;

COMMIT;
