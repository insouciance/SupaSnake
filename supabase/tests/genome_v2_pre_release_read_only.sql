-- Hosted-safe compatibility preflight for the first Genome v2 release.
-- The dedicated Management API read-only endpoint executes this one SELECT as
-- supabase_read_only_user. It returns aggregate counts only: never player or
-- session identifiers. A nonzero result means the 2/3/4 correction cannot ship
-- under rulesVersion 2 without a frozen threshold profile.

WITH session_rows AS (
  -- Whole-row JSON keeps this first-cutover proof compatible with the reviewed
  -- 062/063 recovery paths: keys for columns introduced by 063 simply resolve
  -- to NULL before that migration rather than making the SELECT fail to parse.
  SELECT to_jsonb(session_row) AS value
  FROM public.game_sessions AS session_row
),
evidence AS (
  SELECT
    COALESCE(
      value #>> '{run_context,genome,rulesVersion}' = '2',
      FALSE
    ) AS run_context_v2,
    COALESCE(
      value #>> '{start_manifest,genome,rulesVersion}' = '2',
      FALSE
    ) AS start_manifest_v2,
    COALESCE(
      value #>> '{start_manifest_draft,genome,rulesVersion}' = '2',
      FALSE
    ) AS start_manifest_draft_v2,
    COALESCE(
      value #>> '{continuity_checkpoint,config,genome,rulesVersion}' = '2'
      OR value #>> '{continuity_checkpoint,state,genomeV2,v}' = '2',
      FALSE
    ) AS checkpoint_v2,
    COALESCE(
      value #>> '{continuity_terminal_facts,genome,v}' = '2'
      OR value #>> '{continuity_terminal_facts,genome,genomeRulesVersion}' = '2'
      OR value #>> '{continuity_terminal_facts,genome,rules,version}' = '2',
      FALSE
    ) AS terminal_v2,
    COALESCE(
      value #>> '{genome,v}' = '2'
      OR value #>> '{genome,genomeRulesVersion}' = '2'
      OR value #>> '{genome,rules,version}' = '2',
      FALSE
    ) AS settled_v2
  FROM session_rows
),
summary AS (
  SELECT
    count(*) FILTER (
      WHERE run_context_v2
         OR start_manifest_v2
         OR start_manifest_draft_v2
         OR checkpoint_v2
         OR terminal_v2
         OR settled_v2
    ) AS v2_session_count,
    count(*) FILTER (WHERE run_context_v2) AS run_context_count,
    count(*) FILTER (WHERE start_manifest_v2) AS start_manifest_count,
    count(*) FILTER (WHERE start_manifest_draft_v2)
      AS start_manifest_draft_count,
    count(*) FILTER (WHERE checkpoint_v2) AS checkpoint_count,
    count(*) FILTER (WHERE terminal_v2) AS terminal_count,
    count(*) FILTER (WHERE settled_v2) AS settled_count
  FROM evidence
)
SELECT jsonb_build_object(
  'status',
    CASE WHEN v2_session_count = 0 THEN 'clear' ELSE 'blocked' END,
  'v2SessionCount', v2_session_count,
  'bySource', jsonb_build_object(
    'runContext', run_context_count,
    'startManifest', start_manifest_count,
    'startManifestDraft', start_manifest_draft_count,
    'checkpoint', checkpoint_count,
    'terminalFacts', terminal_count,
    'settledGenome', settled_count
  )
) AS genome_v2_preflight
FROM summary;
