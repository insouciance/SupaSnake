-- Local integration contract for migration 065.
-- Run only against an isolated `supabase db reset` database:
--   psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/065_genome_v2.sql

BEGIN;

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
      jsonb_build_object('instanceId', 'live-1', 'reason', 'recode', 'atFood', 18),
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
  IF v_ids IS DISTINCT FROM ARRAY['splice_dragon_hoard']::TEXT[] THEN
    RAISE EXCEPTION 'Splice projector disagrees with the terminal loci: %', v_ids;
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
  IF NOT has_table_privilege('anon', 'public.genome_gene_versions', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.genome_splice_versions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.genome_gene_versions', 'INSERT') THEN
    RAISE EXCEPTION 'Versioned catalog privilege boundary is wrong';
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

ROLLBACK;
