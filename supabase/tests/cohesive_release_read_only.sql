-- Hosted-safe post-bridge structural proof for the cohesive release. The
-- separate Genome v2 pre-release query proves the zero-session compatibility
-- premise. Both use the Management API's dedicated read-only endpoint as
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
    ('public.breeding_draft(uuid,uuid,uuid,boolean,uuid,text[],text)'::TEXT),
    ('public.genome_record_version(jsonb)'::TEXT),
    ('public.genome_record_items(jsonb)'::TEXT),
    ('public.genome_record_gene_ids(jsonb,text)'::TEXT),
    ('public.genome_record_splice_ids(jsonb)'::TEXT),
    ('public.genome_record_strain_milestones(jsonb,text)'::TEXT),
    ('public.genome_record_infuse_count(jsonb)'::TEXT),
    ('public.record_codex_discoveries(uuid,uuid,jsonb)'::TEXT),
    ('public.record_session_codex_discoveries(uuid,uuid,jsonb)'::TEXT),
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
genome_table_privilege_contract AS (
  SELECT
    COALESCE(pg_catalog.bool_and(
      pg_catalog.has_table_privilege(
        expected_read.role_name,
        expected_read.table_name,
        'SELECT'
      ) = expected_read.expected
    ), FALSE)
    AND NOT EXISTS (
      SELECT 1
      FROM (VALUES ('anon'::TEXT), ('authenticated'::TEXT)) AS roles(name)
      CROSS JOIN (
        VALUES
          ('public.genome_gene_versions'::TEXT),
          ('public.genome_splice_versions'::TEXT),
          ('public.player_codex'::TEXT),
          ('public.codex_first_discoveries'::TEXT)
      ) AS tables(name)
      CROSS JOIN (
        VALUES
          ('INSERT'::TEXT), ('UPDATE'::TEXT), ('DELETE'::TEXT),
          ('TRUNCATE'::TEXT), ('TRIGGER'::TEXT), ('REFERENCES'::TEXT)
      ) AS privileges(name)
      WHERE pg_catalog.has_table_privilege(
        roles.name, tables.name, privileges.name
      )
    ) AS genome_table_privileges_valid
  FROM (
    VALUES
      ('anon'::TEXT, 'public.genome_gene_versions'::TEXT, TRUE),
      ('authenticated', 'public.genome_gene_versions', TRUE),
      ('anon', 'public.genome_splice_versions', TRUE),
      ('authenticated', 'public.genome_splice_versions', TRUE),
      ('anon', 'public.player_codex', FALSE),
      ('authenticated', 'public.player_codex', TRUE),
      ('anon', 'public.codex_first_discoveries', TRUE),
      ('authenticated', 'public.codex_first_discoveries', TRUE)
  ) AS expected_read(role_name, table_name, expected)
),
genome_codex_version_contract AS (
  SELECT
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid =
            pg_catalog.to_regclass('public.player_codex')
        AND constraint_row.contype = 'p'
        AND ARRAY(
          SELECT attribute_row.attname::TEXT
          FROM pg_catalog.unnest(constraint_row.conkey) WITH ORDINALITY
            AS key_row(attnum, ordinal)
          JOIN pg_catalog.pg_attribute AS attribute_row
            ON attribute_row.attrelid = constraint_row.conrelid
           AND attribute_row.attnum = key_row.attnum
          ORDER BY key_row.ordinal
        ) = ARRAY[
          'player_id', 'rules_version', 'discovery_type', 'entry_id'
        ]::TEXT[]
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid =
            pg_catalog.to_regclass('public.codex_first_discoveries')
        AND constraint_row.contype = 'p'
        AND ARRAY(
          SELECT attribute_row.attname::TEXT
          FROM pg_catalog.unnest(constraint_row.conkey) WITH ORDINALITY
            AS key_row(attnum, ordinal)
          JOIN pg_catalog.pg_attribute AS attribute_row
            ON attribute_row.attrelid = constraint_row.conrelid
           AND attribute_row.attnum = key_row.attnum
          ORDER BY key_row.ordinal
        ) = ARRAY[
          'rules_version', 'discovery_type', 'entry_id'
        ]::TEXT[]
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attribute_row
      WHERE attribute_row.attrelid =
            pg_catalog.to_regclass('public.player_codex')
        AND attribute_row.attname = 'rules_version'
        AND attribute_row.attnotnull
        AND attribute_row.atthasdef
        AND NOT attribute_row.attisdropped
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attribute_row
      WHERE attribute_row.attrelid =
            pg_catalog.to_regclass('public.codex_first_discoveries')
        AND attribute_row.attname = 'rules_version'
        AND attribute_row.attnotnull
        AND attribute_row.atthasdef
        AND NOT attribute_row.attisdropped
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid =
            pg_catalog.to_regclass('public.player_codex')
        AND constraint_row.conname = 'player_codex_rules_version_valid'
        AND constraint_row.convalidated
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid =
            pg_catalog.to_regclass('public.codex_first_discoveries')
        AND constraint_row.conname =
            'codex_first_discoveries_rules_version_valid'
        AND constraint_row.convalidated
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS relation_row
      WHERE relation_row.oid = pg_catalog.to_regclass('public.player_codex')
        AND relation_row.relrowsecurity
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS relation_row
      WHERE relation_row.oid =
            pg_catalog.to_regclass('public.codex_first_discoveries')
        AND relation_row.relrowsecurity
    ) AS genome_codex_versions_valid
),
genome_definer_contract AS (
  SELECT COALESCE(pg_catalog.bool_and(
    procedure_row.oid IS NOT NULL
    AND procedure_row.prosecdef
    AND procedure_row.proconfig =
        ARRAY['search_path=public, pg_temp']::TEXT[]
  ), FALSE) AS genome_definers_hardened
  FROM (
    VALUES
      ('public.breeding_draft(uuid,uuid,uuid,boolean,uuid,text[],text)'::TEXT),
      ('public.record_codex_discoveries(uuid,uuid,jsonb)'::TEXT),
      ('public.record_session_codex_discoveries(uuid,uuid,jsonb)'::TEXT),
      ('public.get_genome_v2_capability()'::TEXT)
  ) AS required(signature)
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(required.signature)
),
-- Migration 066 widened one column CHECK and two settlement bounds to the
-- 262144 the terminal facts already accept. The column CHECK and the earning
-- ingress are rewritten unconditionally, but the practice-run bound is patched
-- by a DO block that returns quietly when it cannot find the old literal, so a
-- successful push is not by itself proof that the stranding bound is gone.
-- This asserts the applied result structurally, without invoking either
-- function.
settlement_bounds_contract AS (
  SELECT
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid =
            pg_catalog.to_regclass('public.pending_game_session_ends')
        AND constraint_row.contype = 'c'
        AND constraint_row.convalidated
        AND constraint_row.conname =
            'pending_game_session_ends_envelope_check'
        AND pg_catalog.pg_get_constraintdef(constraint_row.oid)
            LIKE '%262144%'
        AND pg_catalog.pg_get_constraintdef(constraint_row.oid)
            NOT LIKE '%65536%'
    )
    AND (
      SELECT COALESCE(pg_catalog.bool_and(
        procedure_row.oid IS NOT NULL
        AND pg_catalog.strpos(
          pg_catalog.regexp_replace(
            procedure_row.prosrc, '[[:space:]]+', '', 'g'
          ),
          required.settling_bound
        ) > 0
        AND pg_catalog.strpos(
          pg_catalog.regexp_replace(
            procedure_row.prosrc, '[[:space:]]+', '', 'g'
          ),
          required.stranding_bound
        ) = 0
      ), FALSE)
      FROM (
        VALUES
          (
            'public.store_pending_game_session_end(uuid,uuid,uuid,jsonb)'::TEXT,
            'octet_length(p_envelope::TEXT)NOTBETWEEN2AND262144'::TEXT,
            'octet_length(p_envelope::TEXT)NOTBETWEEN2AND65536'::TEXT
          ),
          (
            'public.complete_free_run_continuity(uuid,uuid,text,jsonb)',
            'octet_length(p_facts::TEXT)>262144',
            'octet_length(p_facts::TEXT)>65536'
          )
      ) AS required(signature, settling_bound, stranding_bound)
      LEFT JOIN pg_catalog.pg_proc AS procedure_row
        ON procedure_row.oid = pg_catalog.to_regprocedure(required.signature)
    ) AS settlement_bounds_aligned
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
    genome_contract.genome_catalog_valid,
    genome_table_privilege_contract.genome_table_privileges_valid,
    genome_codex_version_contract.genome_codex_versions_valid,
    genome_definer_contract.genome_definers_hardened,
    settlement_bounds_contract.settlement_bounds_aligned
  FROM execution_contract
  CROSS JOIN founding_bridge_contract
  CROSS JOIN function_contract
  CROSS JOIN constraint_contract
  CROSS JOIN index_contract
  CROSS JOIN trigger_contract
  CROSS JOIN favorite_contract
  CROSS JOIN genome_contract
  CROSS JOIN genome_table_privilege_contract
  CROSS JOIN genome_codex_version_contract
  CROSS JOIN genome_definer_contract
  CROSS JOIN settlement_bounds_contract
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
      AND cohesive_contract.genome_table_privileges_valid
      AND cohesive_contract.genome_codex_versions_valid
      AND cohesive_contract.genome_definers_hardened
      AND cohesive_contract.settlement_bounds_aligned
    THEN 'ready'
    ELSE 'invalid'
  END,
  'probe', 'cohesive_release_read_only_v4',
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
      cohesive_contract.genome_catalog_valid,
    'genomeTablePrivilegesValid',
      cohesive_contract.genome_table_privileges_valid,
    'genomeCodexVersionsValid',
      cohesive_contract.genome_codex_versions_valid,
    'genomeDefinersHardened',
      cohesive_contract.genome_definers_hardened,
    'settlementBoundsAligned',
      cohesive_contract.settlement_bounds_aligned
  )
) AS cohesive_release_probe
FROM cohesive_contract;
