-- Hosted-safe structural proof for the cohesive release. This is the only SQL
-- contract permitted to run against the linked project. The Management API's
-- dedicated read-only endpoint executes this statement as
-- supabase_read_only_user. Keep the probe to one SELECT, schema-qualify every
-- relation, and never invoke an application or SECURITY DEFINER function.

WITH
required_functions(signature) AS (
  VALUES
    ('public.found_clan(uuid,text,text,text,text,text,text)'::TEXT),
    ('public.found_clan(uuid,text,text,text,text,text,text,integer)'::TEXT),
    ('public.set_dynasty_favorite(uuid,uuid,boolean)'::TEXT),
    ('public.get_cohesive_release_capability()'::TEXT),
    ('public.get_genome_v2_capability()'::TEXT),
    ('public.finalize_run_continuity_start(uuid,uuid,uuid,text,jsonb,boolean,integer,boolean,integer,integer,integer[],timestamp with time zone,integer,integer,integer)'::TEXT),
    ('public.activate_run_continuity(uuid,uuid,jsonb,text,text,text,integer)'::TEXT),
    ('public.resume_run_continuity(uuid,uuid,text,text)'::TEXT),
    ('public.save_run_continuity_checkpoint(uuid,uuid,integer,jsonb,text,text,integer)'::TEXT),
    ('public.stage_run_continuity_terminal(uuid,uuid,integer,text,jsonb,text)'::TEXT),
    ('public.stage_continuity_game_session_end(uuid,uuid,uuid,text,jsonb)'::TEXT),
    ('public.complete_free_run_continuity(uuid,uuid,text,jsonb)'::TEXT),
    ('public.abandon_run_continuity(uuid,uuid,text,text)'::TEXT)
),
resolved_functions AS (
  SELECT
    required_functions.signature,
    pg_catalog.to_regprocedure(required_functions.signature) AS function_oid
  FROM required_functions
),
function_contract AS (
  SELECT
    COALESCE(
      pg_catalog.bool_and(resolved_functions.function_oid IS NOT NULL),
      FALSE
    ) AS required_functions_present,
    COALESCE(
      pg_catalog.bool_and(
        CASE
          WHEN resolved_functions.function_oid IS NULL THEN FALSE
          ELSE
            NOT pg_catalog.has_function_privilege(
              'anon', resolved_functions.function_oid, 'EXECUTE'
            )
            AND NOT pg_catalog.has_function_privilege(
              'authenticated', resolved_functions.function_oid, 'EXECUTE'
            )
            AND pg_catalog.has_function_privilege(
              'service_role', resolved_functions.function_oid, 'EXECUTE'
            )
            AND NOT pg_catalog.has_function_privilege(
              resolved_functions.function_oid, 'EXECUTE'
            )
        END
      ),
      FALSE
    ) AS required_functions_service_only
  FROM resolved_functions
),
execution_contract AS (
  SELECT
    CURRENT_USER = 'supabase_read_only_user'
    AND pg_catalog.current_setting('transaction_read_only')::BOOLEAN
      AS read_only_execution
),
founding_bridge_contract AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_language AS language_row
      ON language_row.oid = procedure_row.prolang
    WHERE procedure_row.oid = pg_catalog.to_regprocedure(
      'public.found_clan(uuid,text,text,text,text,text,text)'
    )
      AND language_row.lanname = 'sql'
      AND procedure_row.provolatile = 'v'
      AND procedure_row.prosecdef
      AND procedure_row.proconfig =
          ARRAY['search_path=public, pg_temp']::TEXT[]
      AND procedure_row.prorettype = pg_catalog.to_regtype('pg_catalog.jsonb')
      AND pg_catalog.regexp_replace(
        procedure_row.prosrc,
        '[[:space:]]+',
        '',
        'g'
      ) = 'SELECTjsonb_build_object(''error'',''founding_confirmation_required'',''retryable'',TRUE);'
  ) AS founding_bridge_safe
),
required_constraints(constraint_name) AS (
  VALUES
    ('game_sessions_start_request_pair'::TEXT),
    ('game_sessions_start_manifest_object'::TEXT),
    ('game_sessions_start_manifest_draft_shape'::TEXT),
    ('game_sessions_start_intent_shape'::TEXT),
    ('game_sessions_continuity_phase_valid'::TEXT),
    ('game_sessions_continuity_checkpoint_shape'::TEXT),
    ('game_sessions_continuity_lease_shape'::TEXT),
    ('game_sessions_continuity_terminal_shape'::TEXT),
    ('game_sessions_simulation_version_valid'::TEXT),
    ('game_sessions_continuity_shape'::TEXT)
),
constraint_contract AS (
  SELECT COALESCE(
    pg_catalog.bool_and(
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_row
        WHERE constraint_row.conrelid =
              pg_catalog.to_regclass('public.game_sessions')
          AND constraint_row.contype = 'c'
          AND constraint_row.convalidated
          AND constraint_row.conname = required_constraints.constraint_name
      )
    ),
    FALSE
  ) AS continuity_constraints_valid
  FROM required_constraints
),
required_indexes(index_name) AS (
  VALUES
    ('game_sessions_player_start_request_unique'::TEXT),
    ('game_sessions_one_open_nonsettling_per_player'::TEXT),
    ('idx_collected_favorited_player'::TEXT)
),
index_contract AS (
  SELECT COALESCE(
    pg_catalog.bool_and(
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_indexes AS index_row
        WHERE index_row.schemaname = 'public'
          AND index_row.indexname = required_indexes.index_name
      )
    ),
    FALSE
  ) AS required_indexes_present
  FROM required_indexes
),
trigger_contract AS (
  SELECT
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger AS trigger_row
      WHERE trigger_row.tgrelid =
            pg_catalog.to_regclass('public.collected_snakes')
        AND trigger_row.tgname = 'trg_single_dynasty_favorite'
        AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
          'public.enforce_single_dynasty_favorite()'
        )
        AND trigger_row.tgenabled = 'O'
        AND NOT trigger_row.tgisinternal
    ) AS favorite_trigger_valid,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger AS trigger_row
      WHERE trigger_row.tgrelid =
            pg_catalog.to_regclass('public.game_sessions')
        AND trigger_row.tgname = 'game_sessions_run_continuity_immutable'
        AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
          'public.protect_run_continuity()'
        )
        AND trigger_row.tgenabled = 'O'
        AND NOT trigger_row.tgisinternal
    ) AS continuity_trigger_valid
),
favorite_contract AS (
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.collected_snakes AS collected_snake
    JOIN public.snake_variants AS snake_variant
      ON snake_variant.id = collected_snake.snake_variant_id
    WHERE collected_snake.is_favorited = TRUE
    GROUP BY collected_snake.player_id, snake_variant.dynasty_id
    HAVING pg_catalog.count(*) > 1
  ) AS favorite_rows_valid
),
genome_contract AS (
  SELECT
    pg_catalog.to_regprocedure(
      'public.ascendance_yield_multiplier_bps_v2(integer)'
    ) IS NOT NULL
    AND pg_catalog.to_regprocedure(
      'public.ascendance_yield_multiplier_v2(integer)'
    ) IS NOT NULL
    AND pg_catalog.to_regprocedure(
      'public.ascendance_yield_bonus_v2(integer)'
    ) IS NOT NULL AS genome_ascendance_functions_valid,
    COALESCE((
      SELECT pg_catalog.array_agg(
        versioned.gene_id ORDER BY versioned.gene_id
      ) = ARRAY[
        'circuit_run',
        'coilkeeper',
        'compound_interest',
        'constellation_crown',
        'gold_trail',
        'heartwood',
        'live_wire',
        'loan_shark',
        'loom_anchor',
        'mirror_wager',
        'overgrowth',
        'phase_gate',
        'phoenix',
        'time_dilation',
        'wall_rush',
        'zenith_protocol'
      ]::TEXT[]
      FROM public.genome_gene_versions AS versioned
      WHERE versioned.rules_version = 2
        AND versioned.active
    ), FALSE)
    AND COALESCE((
      SELECT pg_catalog.array_agg(
        versioned.splice_id ORDER BY versioned.splice_id
      ) = ARRAY[
        'splice_ashen_stake',
        'splice_dragon_hoard',
        'splice_gilded_fork',
        'splice_loom_bond',
        'splice_perfect_circuit',
        'splice_riftline',
        'splice_styx_contract',
        'splice_worldcoil'
      ]::TEXT[]
      FROM public.genome_splice_versions AS versioned
      WHERE versioned.rules_version = 2
        AND versioned.active
    ), FALSE) AS genome_catalog_valid
),
cohesive_contract AS (
  SELECT
    execution_contract.read_only_execution,
    founding_bridge_contract.founding_bridge_safe,
    function_contract.required_functions_present,
    function_contract.required_functions_service_only,
    constraint_contract.continuity_constraints_valid,
    index_contract.required_indexes_present,
    trigger_contract.favorite_trigger_valid,
    trigger_contract.continuity_trigger_valid,
    favorite_contract.favorite_rows_valid,
    genome_contract.genome_ascendance_functions_valid,
    genome_contract.genome_catalog_valid
  FROM execution_contract
  CROSS JOIN founding_bridge_contract
  CROSS JOIN function_contract
  CROSS JOIN constraint_contract
  CROSS JOIN index_contract
  CROSS JOIN trigger_contract
  CROSS JOIN favorite_contract
  CROSS JOIN genome_contract
)
SELECT pg_catalog.jsonb_build_object(
  'status', CASE
    WHEN
      cohesive_contract.read_only_execution
      AND cohesive_contract.founding_bridge_safe
      AND cohesive_contract.required_functions_present
      AND cohesive_contract.required_functions_service_only
      AND cohesive_contract.continuity_constraints_valid
      AND cohesive_contract.required_indexes_present
      AND cohesive_contract.favorite_trigger_valid
      AND cohesive_contract.continuity_trigger_valid
      AND cohesive_contract.favorite_rows_valid
      AND cohesive_contract.genome_ascendance_functions_valid
      AND cohesive_contract.genome_catalog_valid
    THEN 'ready'
    ELSE 'invalid'
  END,
  'probe', 'cohesive_release_read_only_v2',
  'checks', pg_catalog.jsonb_build_object(
    'readOnlyExecution',
      cohesive_contract.read_only_execution,
    'foundingBridgeSafe',
      cohesive_contract.founding_bridge_safe,
    'requiredFunctionsPresent',
      cohesive_contract.required_functions_present,
    'requiredFunctionsServiceOnly',
      cohesive_contract.required_functions_service_only,
    'continuityConstraintsValid',
      cohesive_contract.continuity_constraints_valid,
    'requiredIndexesPresent',
      cohesive_contract.required_indexes_present,
    'favoriteTriggerValid',
      cohesive_contract.favorite_trigger_valid,
    'continuityTriggerValid',
      cohesive_contract.continuity_trigger_valid,
    'favoriteRowsValid',
      cohesive_contract.favorite_rows_valid,
    'genomeAscendanceFunctionsValid',
      cohesive_contract.genome_ascendance_functions_valid,
    'genomeCatalogValid',
      cohesive_contract.genome_catalog_valid
  )
) AS cohesive_release_probe
FROM cohesive_contract;
