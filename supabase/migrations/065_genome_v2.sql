-- Migration 065: Genome rules v2 compatibility bridge
--
-- Genome v1 is durable history. Its unversioned catalog rows, Ascendance
-- functions, and accepted records remain valid and unchanged. Genome v2 is
-- additive: versioned display catalogs sit beside the v1 tables, pure helper
-- functions understand either accepted record envelope, and Ascendance v2 has
-- new names so an in-flight v1 run can never acquire new settlement math.
--
-- `game_sessions.genome` and the continuity checkpoint are already JSONB. They
-- can carry v2 stable instances, six slots, retired/Ash state, the deterministic
-- event journal, durable Splice/Strain discovery history, and itemized
-- settlement without speculative nullable columns.
--
-- Down/rollback note: this repository is forward-only. Do not drop the v2
-- catalogs, version columns, discovery identities, or functions after a v2 run
-- has been issued; they are required to resume and settle immutable history.
-- Operational rollback is a reviewed forward deployment of the same
-- dual-version runtime with NEXT_PUBLIC_GENOME_V2 non-true for new starts,
-- while retaining this additive schema and all earned discovery/progression
-- rows. A schema correction must likewise be a new forward migration.

BEGIN;

COMMENT ON COLUMN game_sessions.genome IS
  'Validator-accepted, version-stamped Genome record. v1 retains picks/splices/strain milestones; v2 carries stable instances, six slots, retired/Ash state, durable Splice/Strain discoveries, deterministic event journal, liabilities, and itemized settlement in this existing JSONB envelope.';

-- ---------------------------------------------------------------------------
-- 1. Versioned display catalogs (TypeScript/replay remains math authority)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS genome_gene_versions (
  gene_id TEXT NOT NULL REFERENCES gene_definitions(id),
  rules_version SMALLINT NOT NULL CHECK (rules_version IN (1, 2)),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('E', 'P', 'EP')),
  strains TEXT[] NOT NULL CHECK (
    array_length(strains, 1) BETWEEN 1 AND 2
    AND strains <@ ARRAY['AURUM','VOLT','FERAL','FLUX','UMBRA']::TEXT[]
  ),
  effect TEXT NOT NULL,
  cost TEXT NOT NULL,
  economics TEXT NOT NULL CHECK (economics IN ('pure', 'path', 'none')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (gene_id, rules_version)
);

COMMENT ON TABLE genome_gene_versions IS
  'Versioned Genome display catalog. Runtime and settlement authority remains in version-stamped TypeScript replay; legacy gene_definitions rows are preserved.';

CREATE TABLE IF NOT EXISTS genome_splice_versions (
  splice_id TEXT NOT NULL,
  rules_version SMALLINT NOT NULL CHECK (rules_version IN (1, 2)),
  name TEXT NOT NULL,
  gene_a TEXT NOT NULL REFERENCES gene_definitions(id),
  gene_b TEXT NOT NULL REFERENCES gene_definitions(id),
  effect TEXT NOT NULL,
  cost TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (splice_id, rules_version),
  CHECK (gene_a <> gene_b)
);

CREATE UNIQUE INDEX IF NOT EXISTS genome_splice_versions_pair_idx
  ON genome_splice_versions (
    rules_version,
    LEAST(gene_a, gene_b),
    GREATEST(gene_a, gene_b)
  );

COMMENT ON TABLE genome_splice_versions IS
  'Versioned Genome Splice display catalog. It does not replace splice_definitions, which remains the exact v1 catalog.';

ALTER TABLE genome_gene_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE genome_splice_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS genome_gene_versions_public_read
  ON genome_gene_versions;
CREATE POLICY genome_gene_versions_public_read ON genome_gene_versions
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS genome_splice_versions_public_read
  ON genome_splice_versions;
CREATE POLICY genome_splice_versions_public_read ON genome_splice_versions
  FOR SELECT USING (TRUE);

-- Supabase may install broad default table grants for API roles. RLS blocks
-- row DML, but TRUNCATE bypasses RLS entirely, so replace inherited privileges
-- with the one intentional public capability instead of merely adding SELECT.
REVOKE ALL ON genome_gene_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON genome_splice_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON genome_gene_versions TO anon, authenticated;
GRANT SELECT ON genome_splice_versions TO anon, authenticated;

-- A reused catalog id is not the same discovery when its rules change. The
-- existing unversioned rows are authentic v1 history, so the additive bridge
-- stamps them v1 and makes rules_version part of both durable identities.
-- There is deliberately no retroactive v2 backfill: only a validator-accepted
-- v2 run may create and reward a v2 discovery.
ALTER TABLE player_codex
  ADD COLUMN rules_version SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE player_codex
  ADD CONSTRAINT player_codex_rules_version_valid
    CHECK (rules_version IN (1, 2));
ALTER TABLE player_codex DROP CONSTRAINT player_codex_pkey;
ALTER TABLE player_codex
  ADD PRIMARY KEY (player_id, rules_version, discovery_type, entry_id);

ALTER TABLE codex_first_discoveries
  ADD COLUMN rules_version SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE codex_first_discoveries
  ADD CONSTRAINT codex_first_discoveries_rules_version_valid
    CHECK (rules_version IN (1, 2));
ALTER TABLE codex_first_discoveries
  DROP CONSTRAINT codex_first_discoveries_pkey;
ALTER TABLE codex_first_discoveries
  ADD PRIMARY KEY (rules_version, discovery_type, entry_id);

COMMENT ON COLUMN player_codex.rules_version IS
  'Rules identity of the accepted discovery. Rows predating migration 065 are v1; v2 is earned only from accepted v2 runs.';
COMMENT ON COLUMN codex_first_discoveries.rules_version IS
  'Rules-scoped world-first identity. Reused ids with redesigned semantics have independent v1 and v2 history.';

-- Retain the established read surfaces while replacing any inherited API-role
-- DML privileges. RLS remains the row-ownership boundary for player history;
-- the privacy-safe first-discovery ledger remains publicly readable.
REVOKE ALL ON player_codex FROM PUBLIC, anon, authenticated;
REVOKE ALL ON codex_first_discoveries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON player_codex TO authenticated;
GRANT SELECT ON codex_first_discoveries TO anon, authenticated;

-- Snapshot the outgoing catalogs as rules v1 before adding v2-only parent
-- rows. ON CONFLICT keeps the bridge safe if a partial deploy is retried.
INSERT INTO genome_gene_versions (
  gene_id, rules_version, name, kind, strains, effect, cost, economics, active
)
SELECT id, 1, name, kind, strains, effect, cost, economics, active
FROM gene_definitions
ON CONFLICT (gene_id, rules_version) DO NOTHING;

INSERT INTO genome_splice_versions (
  splice_id, rules_version, name, gene_a, gene_b, effect, cost, active
)
SELECT id, 1, name, gene_a, gene_b, effect, cost, active
FROM splice_definitions
ON CONFLICT (splice_id, rules_version) DO NOTHING;

-- These rows satisfy existing foreign keys. They remain dark on the global
-- v1 catalog so a migration-first rolling deploy cannot offer an id the old
-- application does not know. Their version-2 rows below are active.
INSERT INTO gene_definitions (
  id, name, kind, strains, effect, cost, economics, active
) VALUES
  ('live_wire', 'Live Wire', 'EP', ARRAY['VOLT'],
   'Every third eligible target becomes a topology-scaled route test worth ×3',
   'Missing the route budget burns that target to zero Yield', 'path', FALSE),
  ('circuit_run', 'Circuit Run', 'EP', ARRAY['VOLT','FLUX'],
   'Every fourth eligible target becomes an ordered linked route worth ×4',
   'Breaking the route pays zero while normal body growth remains', 'path', FALSE),
  ('coilkeeper', 'Coilkeeper', 'EP', ARRAY['FERAL','FLUX'],
   'Charge through eight foods, then seal territory to empower the next target',
   'The enclosed cells become permanent terrain for the run', 'path', FALSE),
  ('phase_gate', 'Phase Gate', 'EP', ARRAY['FLUX'],
   'Charge an optional safe gate shortcut that empowers its target to ×3',
   'Used gate cells become permanent Scars', 'path', FALSE),
  ('loom_anchor', 'Loom Anchor', 'P', ARRAY['AURUM','UMBRA'],
   'Pin one declined option into the next Thread slot',
   'One charge, restored only by an explicit portal CONTINUE', 'none', FALSE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO genome_gene_versions (
  gene_id, rules_version, name, kind, strains, effect, cost, economics, active
) VALUES
  ('gold_trail', 2, 'Gold Trail', 'EP', ARRAY['AURUM'],
   'Every fifth target after acquisition is Gilded and pays ×3 inside its visible six-second window.',
   'Missing the window forfeits the Gilded bonus.', 'path', TRUE),
  ('compound_interest', 2, 'Compound Interest', 'E', ARRAY['AURUM'],
   'Each deliberate Loom DECLINE creates a Bond worth +8% at BANK, up to three.',
   'Bonds pay nothing on crash, and every DECLINE gives up a build opportunity.', 'pure', TRUE),
  ('loan_shark', 2, 'Loan Shark', 'E', ARRAY['AURUM','UMBRA'],
   'A portal CONTINUE starts a six-food contract whose completed Escrow pays twice its routed value.',
   'BANK or crash before completion loses the visible Escrow.', 'path', TRUE),
  ('live_wire', 2, 'Live Wire', 'EP', ARRAY['VOLT'],
   'Every third eligible target becomes a topology-scaled route test worth ×3.',
   'Missing the route budget burns that target to zero Yield.', 'path', TRUE),
  ('circuit_run', 2, 'Circuit Run', 'EP', ARRAY['VOLT','FLUX'],
   'Every fourth eligible target begins an ordered linked route worth ×4 total.',
   'Breaking the route pays zero while normal body growth remains.', 'path', TRUE),
  ('time_dilation', 2, 'Time Dilation', 'EP', ARRAY['VOLT','FERAL'],
   'World speed is reduced by 12%.',
   'Every fourth food adds one extra segment; unavailable in CYBER.', 'path', TRUE),
  ('overgrowth', 2, 'Overgrowth', 'EP', ARRAY['FERAL'],
   'Food Yield scales from ×1.4 toward ×2.5 with deterministic board pressure.',
   'Every food adds one extra body segment.', 'path', TRUE),
  ('coilkeeper', 2, 'Coilkeeper', 'EP', ARRAY['FERAL','FLUX'],
   'After eight foods, sealing territory empowers the next target from ×4 to ×6 by enclosed area.',
   'The enclosed cells become permanent terrain for the run.', 'path', TRUE),
  ('wall_rush', 2, 'Wall Rush', 'EP', ARRAY['FLUX','VOLT'],
   'A charged deliberate wall impact redirects along a previewed legal tangent and arms a ×2.5 route.',
   'The charge is spent even when the armed route is missed.', 'path', TRUE),
  ('phase_gate', 2, 'Phase Gate', 'EP', ARRAY['FLUX'],
   'Every fifth food can charge an optional gate shortcut that makes its target worth ×3.',
   'Used gate cells become permanent Scars.', 'path', TRUE),
  ('mirror_wager', 2, 'Mirror Wager', 'E', ARRAY['UMBRA'],
   'On an explicit portal CONTINUE, optionally freeze 40% of that leg at its current Carry as visible Stake; BANK doubles it.',
   'A crash loses only the Stake while ordinary salvage remains intact.', 'pure', TRUE),
  ('phoenix', 2, 'Phoenix', 'P', ARRAY['UMBRA','FERAL'],
   'Survive one death with a three-cell rewind, twelve phase ticks, and ten added segments.',
   'After firing, Ash occupies the socket and contributes no Strain.', 'none', TRUE),
  ('loom_anchor', 2, 'Loom Anchor', 'P', ARRAY['AURUM','UMBRA'],
   'Pin one declined option into the next Thread slot.',
   'One charge, restored only by an explicit portal CONTINUE.', 'none', TRUE),
  ('heartwood', 2, 'Heartwood', 'EP', ARRAY['FERAL'],
   'PRIMAL territorial play converts deliberate body geometry into escalating Yield opportunities.',
   'Its value requires spatial pressure and a safe recovery route.', 'path', TRUE),
  ('zenith_protocol', 2, 'Zenith Protocol', 'EP', ARRAY['VOLT'],
   'CYBER precision builds player-controlled overclock windows with proportional Yield upside.',
   'Mistimed overclock creates execution pressure; speed is never imposed automatically.', 'path', TRUE),
  ('constellation_crown', 2, 'Constellation Crown', 'EP', ARRAY['FLUX'],
   'COSMIC reveals current, future, and Crown Stars for high-value perfect clears.',
   'Only clearly marked current stars are edible or colliding.', 'path', TRUE)
ON CONFLICT (gene_id, rules_version) DO UPDATE SET
  name = EXCLUDED.name,
  kind = EXCLUDED.kind,
  strains = EXCLUDED.strains,
  effect = EXCLUDED.effect,
  cost = EXCLUDED.cost,
  economics = EXCLUDED.economics,
  active = EXCLUDED.active;

-- V2 recipes have versioned identities and never overwrite the ten durable v1
-- definitions. Each is a new rule produced by its parents, not A + B + a flat
-- bonus. Runtime derivation remains deterministic; loci and unique recipes,
-- not a hidden active-Splice ceiling, constrain the build.
INSERT INTO genome_splice_versions (
  splice_id, rules_version, name, gene_a, gene_b, effect, cost, active
) VALUES
  ('splice_dragon_hoard', 2, 'Dragon Hoard',
   'gold_trail', 'compound_interest',
   'A completed Gilded target forges its bonus into a Crown Bond that compounds only at BANK.',
   'Missing the Gilded window breaks that Bond; DECLINE still gives up the offer.', TRUE),
  ('splice_gilded_fork', 2, 'Gilded Fork',
   'gold_trail', 'overgrowth',
   'Every fifth target offers one exclusive branch: ordinary growth, or ×4 Yield with two extra segments.',
   'Eating either removes the other; the greedy branch permanently raises body pressure.', TRUE),
  ('splice_styx_contract', 2, 'Styx Contract',
   'mirror_wager', 'phoenix',
   'The visible Stake can fund Phoenix; unused Ash-bound Stake doubles on BANK.',
   'Using Phoenix consumes the Stake and permanently Ashes its socket.', TRUE),
  ('splice_perfect_circuit', 2, 'Perfect Circuit',
   'live_wire', 'circuit_run',
   'Successful Live routes arm a linked return leg with a larger shared payout.',
   'Either failed leg burns the whole circuit.', TRUE),
  ('splice_worldcoil', 2, 'Worldcoil',
   'coilkeeper', 'overgrowth',
   'Sealed territory converts Overgrowth pressure into a higher next-target tier.',
   'The seal is permanent and Overgrowth keeps adding body.', TRUE),
  ('splice_riftline', 2, 'Riftline',
   'wall_rush', 'phase_gate',
   'A deliberate redirect can open a one-use riftline to the empowered target.',
   'The traversed gate cells become permanent Scars.', TRUE),
  ('splice_loom_bond', 2, 'Loom Bond',
   'compound_interest', 'loom_anchor',
   'Pinning a declined gene preserves it and binds that DECLINE into a Bond.',
   'The Anchor stays empty until a later explicit portal CONTINUE.', TRUE),
  ('splice_ashen_stake', 2, 'Ashen Stake',
   'loan_shark', 'phoenix',
   'A completed Loan can fund Phoenix and preserve the run instead of paying its Escrow.',
   'The conversion pays no contract Yield and leaves Ash in the Phoenix socket.', TRUE)
ON CONFLICT (splice_id, rules_version) DO UPDATE SET
  name = EXCLUDED.name,
  gene_a = EXCLUDED.gene_a,
  gene_b = EXCLUDED.gene_b,
  effect = EXCLUDED.effect,
  cost = EXCLUDED.cost,
  active = EXCLUDED.active;

-- ---------------------------------------------------------------------------
-- 2. Ascendance v2 — new names, v1 functions from migration 047 untouched
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ascendance_yield_multiplier_bps_v2(
  p_generation INTEGER
) RETURNS BIGINT AS $$
  SELECT CASE
    WHEN GREATEST(COALESCE(p_generation, 1), 1) <= 3 THEN 10000::BIGINT
    WHEN ln(10000::NUMERIC)
         + (GREATEST(COALESCE(p_generation, 1), 1) - 3)::NUMERIC
           * ln(1.02::NUMERIC)
         >= ln(9007199254740991::NUMERIC)
      THEN 9007199254740991::BIGINT
    ELSE round(
      10000::NUMERIC * power(
        1.02::NUMERIC,
        (GREATEST(COALESCE(p_generation, 1), 1) - 3)::NUMERIC
      )
    )::BIGINT
  END;
$$ LANGUAGE sql IMMUTABLE SET search_path = public;

COMMENT ON FUNCTION ascendance_yield_multiplier_bps_v2(INTEGER) IS
  'Genome v2 frozen Ascendance multiplier in integer basis points: Gen1-3 ×1; Gen4+ rounds 10000 × 1.02^(gen-3). Existing v1 functions are intentionally untouched.';

CREATE OR REPLACE FUNCTION ascendance_yield_multiplier_v2(
  p_generation INTEGER
) RETURNS NUMERIC AS $$
  SELECT ascendance_yield_multiplier_bps_v2(p_generation)::NUMERIC
         / 10000::NUMERIC;
$$ LANGUAGE sql IMMUTABLE SET search_path = public;

COMMENT ON FUNCTION ascendance_yield_multiplier_v2(INTEGER) IS
  'Genome v2 display multiplier derived from the same frozen integer BPS used at run start and settlement.';

CREATE OR REPLACE FUNCTION ascendance_yield_bonus_v2(
  p_generation INTEGER
) RETURNS NUMERIC AS $$
  SELECT ascendance_yield_multiplier_v2(p_generation) - 1::NUMERIC;
$$ LANGUAGE sql IMMUTABLE SET search_path = public;

COMMENT ON FUNCTION ascendance_yield_bonus_v2(INTEGER) IS
  'Genome v2 additive Yield bonus: ascendance_yield_multiplier_v2(generation) - 1.';

-- Keep the original deterministic draft callable as an internal historical
-- implementation, then put a version-aware v2 presentation wrapper back at
-- the stable public signature. `breed_snakes` resolves the function name at
-- execution time, so preview and committed audit history continue to consume
-- the exact same draft object without copying its large deterministic body.
DO $$
BEGIN
  IF to_regprocedure(
    'public.breeding_draft_v1(uuid,uuid,uuid,boolean,uuid,text[],text)'
  ) IS NULL THEN
    ALTER FUNCTION public.breeding_draft(
      UUID, UUID, UUID, BOOLEAN, UUID, TEXT[], TEXT
    ) RENAME TO breeding_draft_v1;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.breeding_draft(
  p_player_id UUID,
  p_parent1_id UUID,
  p_parent2_id UUID,
  p_allow_cross_dynasty BOOLEAN DEFAULT FALSE,
  p_variant_choice UUID DEFAULT NULL,
  p_trait_draft TEXT[] DEFAULT NULL,
  p_lineage_kind TEXT DEFAULT NULL
) RETURNS JSONB AS $$
  WITH draft AS (
    SELECT public.breeding_draft_v1(
      p_player_id,
      p_parent1_id,
      p_parent2_id,
      p_allow_cross_dynasty,
      p_variant_choice,
      p_trait_draft,
      p_lineage_kind
    ) AS value
  ), generation AS (
    SELECT value, GREATEST(COALESCE((value ->> 'generation')::INTEGER, 1), 1) AS n
    FROM draft
  )
  SELECT value || jsonb_build_object(
    'ascendance', jsonb_build_object(
      'generation', n,
      'curve_version', 2,
      'multiplier_bps', public.ascendance_yield_multiplier_bps_v2(n),
      'yield_bonus', public.ascendance_yield_bonus_v2(n),
      'yield_multiplier', public.ascendance_yield_multiplier_v2(n)
    )
  )
  FROM generation;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.breeding_draft(
  UUID, UUID, UUID, BOOLEAN, UUID, TEXT[], TEXT
) IS
  'Deterministic Genome v2 breeding preview. Child choices come verbatim from breeding_draft_v1; only the versioned Ascendance explanation is replaced.';

REVOKE EXECUTE ON FUNCTION public.breeding_draft_v1(
  UUID, UUID, UUID, BOOLEAN, UUID, TEXT[], TEXT
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.breeding_draft(
  UUID, UUID, UUID, BOOLEAN, UUID, TEXT[], TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.breeding_draft(
  UUID, UUID, UUID, BOOLEAN, UUID, TEXT[], TEXT
) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Version-aware accepted-record projectors
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION genome_record_version(p_genome JSONB)
RETURNS SMALLINT AS $$
  SELECT CASE COALESCE(
    p_genome ->> 'v',
    p_genome ->> 'genomeRulesVersion',
    p_genome #>> '{rules,version}'
  )
    WHEN '1' THEN 1::SMALLINT
    WHEN '2' THEN 2::SMALLINT
    ELSE NULL::SMALLINT
  END;
$$ LANGUAGE sql IMMUTABLE SET search_path = public;

CREATE OR REPLACE FUNCTION genome_record_items(p_value JSONB)
RETURNS SETOF JSONB AS $$
  SELECT item.value
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(p_value) = 'array'
      THEN p_value ELSE '[]'::JSONB END
  ) AS item(value)
  UNION ALL
  SELECT item.value
  FROM jsonb_each(
    CASE WHEN jsonb_typeof(p_value) = 'object'
      THEN p_value ELSE '{}'::JSONB END
  ) AS item(key, value);
$$ LANGUAGE sql IMMUTABLE SET search_path = public;

-- `p_scope = discovered` includes retired/replaced instances and journaled
-- acquisitions. `held` includes only contributors present in the terminal
-- six-slot board; Splice parents may retain `spliced` status because a Splice
-- contributes both parents' Strain points. Ash and retired instances do not.
CREATE OR REPLACE FUNCTION genome_record_gene_ids(
  p_genome JSONB,
  p_scope TEXT DEFAULT 'held'
) RETURNS TABLE (gene_id TEXT) AS $$
  WITH envelope AS (
    SELECT
      genome_record_version(p_genome) AS rules_version,
      CASE
        WHEN jsonb_typeof(p_genome -> 'eventJournal') IN ('array', 'object')
          THEN p_genome -> 'eventJournal'
        WHEN jsonb_typeof(p_genome -> 'events') IN ('array', 'object')
          THEN p_genome -> 'events'
        ELSE p_genome -> 'journal'
      END AS journal
  ),
  instances AS (
    SELECT
      COALESCE(
        item ->> 'geneId',
        item ->> 'gene_id',
        item #>> '{gene,id}',
        CASE WHEN item ->> 'kind' = 'gene' THEN item ->> 'id' END
      ) AS id,
      COALESCE(item ->> 'status', item ->> 'state', 'active') AS status
    FROM genome_record_items(p_genome -> 'instances') AS item
  ),
  slots AS (
    SELECT
      COALESCE(
        item ->> 'geneId',
        item ->> 'gene_id',
        item #>> '{gene,id}',
        item #>> '{occupant,geneId}',
        item #>> '{occupant,gene_id}',
        CASE WHEN item ->> 'kind' = 'gene' THEN item ->> 'id' END
      ) AS id,
      COALESCE(
        item ->> 'status',
        item ->> 'state',
        item #>> '{occupant,status}',
        item #>> '{occupant,state}',
        'active'
      ) AS status
    FROM genome_record_items(p_genome -> 'slots') AS item
  ),
  picks AS (
    SELECT COALESCE(item ->> 'id', item ->> 'geneId', item ->> 'gene_id') AS id
    FROM genome_record_items(p_genome -> 'picks') AS item
  ),
  journal_genes AS (
    SELECT COALESCE(
      item ->> 'geneId',
      item ->> 'gene_id',
      item #>> '{payload,geneId}',
      item #>> '{payload,gene_id}',
      CASE WHEN COALESCE(item ->> 'type', item ->> 'kind') IN (
        'gene_acquired', 'gene_infused', 'gene_recoded', 'infuse', 'recode'
      ) THEN item ->> 'id' END
    ) AS id
    FROM envelope
    CROSS JOIN LATERAL genome_record_items(envelope.journal) AS item
  ),
  candidates AS (
    SELECT id FROM instances
    WHERE p_scope = 'discovered'
       OR status IN ('active', 'held', 'spliced')
    UNION ALL
    SELECT id FROM slots
    WHERE status IN ('active', 'held', 'spliced')
    UNION ALL
    SELECT id FROM picks
    WHERE (SELECT rules_version FROM envelope) = 1
       OR NOT EXISTS (SELECT 1 FROM instances WHERE id IS NOT NULL)
    UNION ALL
    SELECT id FROM journal_genes WHERE p_scope = 'discovered'
  )
  SELECT DISTINCT candidates.id
  FROM candidates
  WHERE candidates.id IS NOT NULL
    AND candidates.id ~ '^[a-z][a-z0-9_]*$';
$$ LANGUAGE sql IMMUTABLE SET search_path = public;

CREATE OR REPLACE FUNCTION genome_record_splice_ids(p_genome JSONB)
RETURNS TABLE (splice_id TEXT) AS $$
  WITH journal AS (
    SELECT CASE
      WHEN jsonb_typeof(p_genome -> 'eventJournal') IN ('array', 'object')
        THEN p_genome -> 'eventJournal'
      WHEN jsonb_typeof(p_genome -> 'events') IN ('array', 'object')
        THEN p_genome -> 'events'
      ELSE p_genome -> 'journal'
    END AS value
  ),
  candidates AS (
    SELECT COALESCE(
      item ->> 'id',
      item ->> 'spliceId',
      item ->> 'splice_id',
      item #>> '{}'
    ) AS id
    FROM genome_record_items(p_genome -> 'discoveredSplices') AS item
    UNION ALL
    SELECT COALESCE(
      item ->> 'id',
      item ->> 'spliceId',
      item ->> 'splice_id',
      item #>> '{}'
    ) AS id
    FROM genome_record_items(p_genome -> 'activeSplices') AS item
    UNION ALL
    SELECT COALESCE(item ->> 'id', item ->> 'spliceId', item ->> 'splice_id') AS id
    FROM genome_record_items(p_genome -> 'splices') AS item
    UNION ALL
    SELECT COALESCE(
      item ->> 'spliceId',
      item ->> 'splice_id',
      item #>> '{splice,id}'
    ) AS id
    FROM genome_record_items(p_genome -> 'retired') AS item
    WHERE COALESCE(item ->> 'reason', item ->> 'state') = 'splice'
    UNION ALL
    SELECT COALESCE(
      item ->> 'spliceId',
      item ->> 'splice_id',
      item #>> '{splice,id}',
      item #>> '{occupant,spliceId}',
      CASE WHEN item ->> 'kind' = 'splice' THEN item ->> 'id' END
    )
    FROM genome_record_items(p_genome -> 'slots') AS item
    WHERE COALESCE(item ->> 'status', item ->> 'state', 'active')
      IN ('active', 'held')
    UNION ALL
    SELECT COALESCE(
      item ->> 'spliceId',
      item ->> 'splice_id',
      item #>> '{payload,spliceId}',
      item #>> '{payload,splice_id}',
      CASE WHEN COALESCE(item ->> 'type', item ->> 'kind') IN (
        'splice_created', 'splice_discovered'
      ) THEN item ->> 'id' END
    )
    FROM journal
    CROSS JOIN LATERAL genome_record_items(journal.value) AS item
  )
  SELECT DISTINCT candidates.id
  FROM candidates
  WHERE candidates.id IS NOT NULL
    AND candidates.id ~ '^splice_[a-z][a-z0-9_]*$';
$$ LANGUAGE sql IMMUTABLE SET search_path = public;

CREATE OR REPLACE FUNCTION genome_record_strain_milestones(
  p_genome JSONB,
  p_kind TEXT
) RETURNS TABLE (strain TEXT) AS $$
  WITH direct AS (
    SELECT item.key AS strain
    FROM jsonb_each(
      CASE
        WHEN p_kind = 'expression'
             AND jsonb_typeof(p_genome -> 'expressions') = 'object'
          THEN p_genome -> 'expressions'
        WHEN p_kind = 'apex'
             AND jsonb_typeof(p_genome -> 'apexes') = 'object'
          THEN p_genome -> 'apexes'
        ELSE '{}'::JSONB
      END
    ) AS item(key, value)
  ),
  journal AS (
    SELECT CASE
      WHEN jsonb_typeof(p_genome -> 'eventJournal') IN ('array', 'object')
        THEN p_genome -> 'eventJournal'
      WHEN jsonb_typeof(p_genome -> 'events') IN ('array', 'object')
        THEN p_genome -> 'events'
      ELSE p_genome -> 'journal'
    END AS value
  ),
  journaled AS (
    SELECT COALESCE(
      item ->> 'strain',
      item #>> '{payload,strain}'
    ) AS strain
    FROM journal
    CROSS JOIN LATERAL genome_record_items(journal.value) AS item
    WHERE COALESCE(item ->> 'type', item ->> 'kind') IN (
      p_kind,
      'strain_' || p_kind,
      p_kind || '_triggered',
      p_kind || '_reached'
    )
  )
  SELECT DISTINCT candidates.strain
  FROM (
    SELECT strain FROM direct
    UNION ALL
    SELECT strain FROM journaled
  ) AS candidates
  WHERE candidates.strain IN ('AURUM','VOLT','FERAL','FLUX','UMBRA');
$$ LANGUAGE sql IMMUTABLE SET search_path = public;

CREATE OR REPLACE FUNCTION genome_record_infuse_count(p_genome JSONB)
RETURNS INTEGER AS $$
  WITH direct AS (
    SELECT COUNT(*)::INTEGER AS count
    FROM genome_record_items(p_genome -> 'infuses')
  ),
  journal AS (
    SELECT CASE
      WHEN jsonb_typeof(p_genome -> 'eventJournal') IN ('array', 'object')
        THEN p_genome -> 'eventJournal'
      WHEN jsonb_typeof(p_genome -> 'events') IN ('array', 'object')
        THEN p_genome -> 'events'
      ELSE p_genome -> 'journal'
    END AS value
  ),
  journaled AS (
    SELECT COUNT(*)::INTEGER AS count
    FROM journal
    CROSS JOIN LATERAL genome_record_items(journal.value) AS item
    WHERE COALESCE(item ->> 'type', item ->> 'kind') IN (
      'infuse', 'portal_infuse', 'gene_infused'
    )
  )
  SELECT CASE
    WHEN direct.count > 0 THEN direct.count
    ELSE journaled.count
  END
  FROM direct CROSS JOIN journaled;
$$ LANGUAGE sql IMMUTABLE SET search_path = public;

-- Helpers accept only already-loaded JSON and expose no player data. Keep them
-- service-only nonetheless so they cannot become an accidental public API.
REVOKE ALL ON FUNCTION genome_record_version(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION genome_record_items(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION genome_record_gene_ids(JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION genome_record_splice_ids(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION genome_record_strain_milestones(JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION genome_record_infuse_count(JSONB) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION genome_record_version(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION genome_record_items(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION genome_record_gene_ids(JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION genome_record_splice_ids(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION genome_record_strain_milestones(JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION genome_record_infuse_count(JSONB) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Codex recorder — one durable discovery history across v1 and v2
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION record_codex_discoveries(
  p_player_id UUID,
  p_session_id UUID,
  p_genome JSONB
) RETURNS JSONB AS $$
DECLARE
  v_rules_version SMALLINT;
  v_candidate RECORD;
  v_inserted INTEGER;
  v_world_first BOOLEAN;
  v_reward INTEGER;
  v_reward_total INTEGER := 0;
  v_balance INTEGER;
  v_discoveries JSONB := '[]'::JSONB;
  v_weaver_unlocked BOOLEAN := FALSE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM game_sessions gs
    WHERE gs.id = p_session_id
      AND gs.player_id = p_player_id
      AND gs.ended_at IS NOT NULL
      AND gs.validated IS TRUE
      AND COALESCE(gs.is_free_play, FALSE) = FALSE
  ) THEN
    RAISE EXCEPTION 'Completed earning session not found';
  END IF;

  v_rules_version := genome_record_version(p_genome);
  IF p_genome IS NULL
     OR jsonb_typeof(p_genome) <> 'object'
     OR v_rules_version NOT IN (1, 2) THEN
    RETURN jsonb_build_object(
      'discoveries', v_discoveries,
      'rewardDna', 0,
      'genomeWeaverUnlocked', FALSE
    );
  END IF;

  -- Preserve v1's original fifteen-bank discovery gate byte-for-byte in
  -- behavior. Genome v2's Codex is visible from bank zero and begins recording
  -- accepted discoveries immediately; unlock gates still control offerability.
  IF v_rules_version = 1 AND (
    SELECT COUNT(*)
    FROM game_sessions gs
    WHERE gs.player_id = p_player_id
      AND gs.ended_at IS NOT NULL
      AND gs.validated IS TRUE
      AND gs.is_free_play IS NOT TRUE
      AND gs.extracted
  ) < 15 THEN
    RETURN jsonb_build_object(
      'discoveries', v_discoveries,
      'rewardDna', 0,
      'genomeWeaverUnlocked', FALSE
    );
  END IF;

  FOR v_candidate IN
    WITH candidates(discovery_type, entry_id) AS (
      SELECT 'gene'::TEXT, discovered.gene_id
      FROM genome_record_gene_ids(p_genome, 'discovered') AS discovered
      UNION
      SELECT 'splice'::TEXT, discovered.splice_id
      FROM genome_record_splice_ids(p_genome) AS discovered
      UNION
      SELECT 'expression'::TEXT, milestone.strain
      FROM genome_record_strain_milestones(p_genome, 'expression') AS milestone
      UNION
      SELECT 'apex'::TEXT, milestone.strain
      FROM genome_record_strain_milestones(p_genome, 'apex') AS milestone
    )
    SELECT DISTINCT c.discovery_type, c.entry_id
    FROM candidates c
    WHERE c.entry_id IS NOT NULL
      AND (
        (c.discovery_type = 'gene' AND EXISTS (
          SELECT 1
          FROM genome_gene_versions versioned
          WHERE versioned.gene_id = c.entry_id
            AND versioned.rules_version = v_rules_version
            AND versioned.active
        ))
        OR (c.discovery_type = 'splice' AND EXISTS (
          SELECT 1
          FROM genome_splice_versions versioned
          WHERE versioned.splice_id = c.entry_id
            AND versioned.rules_version = v_rules_version
            AND versioned.active
        ))
        OR (
          c.discovery_type IN ('expression', 'apex')
          AND c.entry_id IN ('AURUM','VOLT','FERAL','FLUX','UMBRA')
        )
      )
    ORDER BY c.discovery_type, c.entry_id
  LOOP
    INSERT INTO player_codex (
      player_id, rules_version, discovery_type, entry_id, first_session_id
    ) VALUES (
      p_player_id,
      v_rules_version,
      v_candidate.discovery_type,
      v_candidate.entry_id,
      p_session_id
    )
    ON CONFLICT (
      player_id, rules_version, discovery_type, entry_id
    ) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted = 1 THEN
      v_reward := CASE v_candidate.discovery_type
        WHEN 'splice' THEN 250
        WHEN 'expression' THEN 150
        WHEN 'apex' THEN 400
        ELSE 0
      END;
      v_reward_total := v_reward_total + v_reward;

      INSERT INTO codex_first_discoveries (
        rules_version, discovery_type, entry_id
      ) VALUES (
        v_rules_version, v_candidate.discovery_type, v_candidate.entry_id
      )
      ON CONFLICT (rules_version, discovery_type, entry_id) DO NOTHING;
      GET DIAGNOSTICS v_inserted = ROW_COUNT;
      v_world_first := v_inserted = 1;

      v_discoveries := v_discoveries || jsonb_build_array(
        jsonb_build_object(
          'type', v_candidate.discovery_type,
          'entryId', v_candidate.entry_id,
          'rewardDna', v_reward,
          'worldFirst', v_world_first,
          'rulesVersion', v_rules_version
        )
      );
    END IF;
  END LOOP;

  IF v_reward_total > 0 THEN
    UPDATE players
    SET dna = dna + v_reward_total
    WHERE id = p_player_id
    RETURNING dna INTO v_balance;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Player not found';
    END IF;

    INSERT INTO economy_transactions (
      player_id, resource_type, amount, balance_after,
      source_type, source_id, metadata
    ) VALUES (
      p_player_id, 'dna', v_reward_total, v_balance,
      'codex_discovery', p_session_id,
      jsonb_build_object(
        'discoveries', v_discoveries,
        'genomeRulesVersion', v_rules_version
      )
    );
  END IF;

  -- Completion is evaluated against the catalog belonging to this accepted
  -- run's rules version. Shared gene identities stay one durable discovery;
  -- redesigned display/math does not erase a player's authentic history.
  IF NOT EXISTS (
       SELECT 1
       FROM genome_gene_versions versioned
       WHERE versioned.rules_version = v_rules_version
         AND versioned.active
         AND NOT EXISTS (
           SELECT 1 FROM player_codex pc
           WHERE pc.player_id = p_player_id
             AND pc.rules_version = v_rules_version
             AND pc.discovery_type = 'gene'
             AND pc.entry_id = versioned.gene_id
         )
     )
     AND NOT EXISTS (
       SELECT 1
       FROM genome_splice_versions versioned
       WHERE versioned.rules_version = v_rules_version
         AND versioned.active
         AND NOT EXISTS (
           SELECT 1 FROM player_codex pc
           WHERE pc.player_id = p_player_id
             AND pc.rules_version = v_rules_version
             AND pc.discovery_type = 'splice'
             AND pc.entry_id = versioned.splice_id
         )
     )
     AND 5 = (
       SELECT COUNT(*) FROM player_codex pc
       WHERE pc.player_id = p_player_id
         AND pc.rules_version = v_rules_version
         AND pc.discovery_type = 'expression'
         AND pc.entry_id IN ('AURUM','VOLT','FERAL','FLUX','UMBRA')
     )
     AND 5 = (
       SELECT COUNT(*) FROM player_codex pc
       WHERE pc.player_id = p_player_id
         AND pc.rules_version = v_rules_version
         AND pc.discovery_type = 'apex'
         AND pc.entry_id IN ('AURUM','VOLT','FERAL','FLUX','UMBRA')
     ) THEN
    INSERT INTO player_cosmetics (player_id, cosmetic_id, source)
    VALUES (p_player_id, 'genome_weaver', 'codex_completion')
    ON CONFLICT (player_id, cosmetic_id) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_weaver_unlocked := v_inserted = 1;
  END IF;

  RETURN jsonb_build_object(
    'discoveries', v_discoveries,
    'rewardDna', v_reward_total,
    'genomeWeaverUnlocked', v_weaver_unlocked
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION record_codex_discoveries(UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_codex_discoveries(UUID, UUID, JSONB)
  TO service_role;

-- Migration 061 routes settlement through this observed-session wrapper. V1
-- keeps its exact fifteen-bank reveal; v2's Codex is visible from bank zero,
-- so an accepted v2 envelope proceeds immediately. The atomic observation
-- cutoff remains mandatory for both versions.
CREATE OR REPLACE FUNCTION record_session_codex_discoveries(
  p_player_id UUID,
  p_session_id UUID,
  p_genome JSONB
) RETURNS JSONB AS $$
DECLARE
  v_session game_sessions%ROWTYPE;
  v_count BIGINT;
  v_rules_version SMALLINT;
BEGIN
  SELECT * INTO v_session FROM game_sessions gs
  WHERE gs.id = p_session_id AND gs.player_id = p_player_id;
  IF NOT FOUND
     OR v_session.reward_protocol IS DISTINCT FROM 'atomic_v1'
     OR v_session.atomic_reward_observed_at IS NULL THEN
    RAISE EXCEPTION 'CODEX_SESSION_CUTOFF_NOT_ATOMIC';
  END IF;

  v_rules_version := genome_record_version(p_genome);
  IF v_rules_version = 2 THEN
    RETURN record_codex_discoveries(p_player_id, p_session_id, p_genome);
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM game_sessions gs
  WHERE gs.player_id = p_player_id
    AND gs.ended_at IS NOT NULL
    AND gs.validated IS TRUE
    AND gs.is_free_play IS NOT TRUE
    AND gs.extracted
    AND (
      gs.reward_protocol IS NULL
      OR (
        gs.atomic_reward_observed_at IS NOT NULL
        AND (
          gs.atomic_reward_observed_at < v_session.atomic_reward_observed_at
          OR (
            gs.atomic_reward_observed_at = v_session.atomic_reward_observed_at
            AND gs.id::TEXT <= v_session.id::TEXT
          )
        )
      )
    );

  IF v_count < 15 THEN
    RETURN jsonb_build_object(
      'discoveries', '[]'::JSONB,
      'rewardDna', 0,
      'genomeWeaverUnlocked', FALSE
    );
  END IF;
  RETURN record_codex_discoveries(p_player_id, p_session_id, p_genome);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION record_session_codex_discoveries(UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_session_codex_discoveries(UUID, UUID, JSONB)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Retired daily contracts remain retired
-- ---------------------------------------------------------------------------
-- Migration 049 intentionally tombstoned refresh_contract_progress. Genome v2
-- reads accepted records through the pure projectors above and never revives
-- that superseded player-facing system.

-- ---------------------------------------------------------------------------
-- 6. Release capability probe (server/deploy tooling only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_genome_v2_capability()
RETURNS JSONB AS $$
  WITH catalog AS (
    SELECT
      COALESCE((
        SELECT array_agg(versioned.gene_id ORDER BY versioned.gene_id)
        FROM public.genome_gene_versions AS versioned
        WHERE versioned.rules_version = 2 AND versioned.active
      ), ARRAY[]::TEXT[]) = ARRAY[
        'circuit_run', 'coilkeeper', 'compound_interest',
        'constellation_crown', 'gold_trail', 'heartwood', 'live_wire',
        'loan_shark', 'loom_anchor', 'mirror_wager', 'overgrowth',
        'phase_gate', 'phoenix', 'time_dilation', 'wall_rush',
        'zenith_protocol'
      ]::TEXT[] AS genes_exact,
      COALESCE((
        SELECT array_agg(versioned.splice_id ORDER BY versioned.splice_id)
        FROM public.genome_splice_versions AS versioned
        WHERE versioned.rules_version = 2 AND versioned.active
      ), ARRAY[]::TEXT[]) = ARRAY[
        'splice_ashen_stake', 'splice_dragon_hoard',
        'splice_gilded_fork', 'splice_loom_bond',
        'splice_perfect_circuit', 'splice_riftline',
        'splice_styx_contract', 'splice_worldcoil'
      ]::TEXT[] AS splices_exact
  ), projector_fixture AS (
    SELECT jsonb_build_object(
      'v', 2,
      'instances', jsonb_build_object(
        'retired-live-wire', jsonb_build_object(
          'instanceId', 'retired-live-wire',
          'geneId', 'live_wire',
          'status', 'replaced'
        )
      ),
      'retired', jsonb_build_array(
        jsonb_build_object(
          'instanceId', 'retired-live-wire',
          'reason', 'splice',
          'spliceId', 'splice_styx_contract',
          'atFood', 12
        )
      ),
      'activeSplices', jsonb_build_array(),
      'discoveredSplices', jsonb_build_array(),
      'expressions', jsonb_build_object('AURUM', 7),
      'apexes', jsonb_build_object('UMBRA', 19)
    ) AS value
  ), projectors AS (
    SELECT
      public.genome_record_version(projector_fixture.value) = 2
      AND ARRAY(
        SELECT projected.gene_id
        FROM public.genome_record_gene_ids(
          projector_fixture.value, 'discovered'
        ) AS projected
        ORDER BY projected.gene_id
      ) = ARRAY['live_wire']::TEXT[]
      AND ARRAY(
        SELECT projected.splice_id
        FROM public.genome_record_splice_ids(
          projector_fixture.value
        ) AS projected
        ORDER BY projected.splice_id
      ) = ARRAY['splice_styx_contract']::TEXT[]
      AND ARRAY(
        SELECT projected.strain
        FROM public.genome_record_strain_milestones(
          projector_fixture.value, 'expression'
        ) AS projected
        ORDER BY projected.strain
      ) = ARRAY['AURUM']::TEXT[]
      AND ARRAY(
        SELECT projected.strain
        FROM public.genome_record_strain_milestones(
          projector_fixture.value, 'apex'
        ) AS projected
        ORDER BY projected.strain
      ) = ARRAY['UMBRA']::TEXT[] AS exact
    FROM projector_fixture
  ), required_service_functions(signature) AS (
    VALUES
      ('public.breeding_draft(uuid,uuid,uuid,boolean,uuid,text[],text)'::TEXT),
      ('public.genome_record_version(jsonb)'::TEXT),
      ('public.genome_record_items(jsonb)'::TEXT),
      ('public.genome_record_gene_ids(jsonb,text)'::TEXT),
      ('public.genome_record_splice_ids(jsonb)'::TEXT),
      ('public.genome_record_strain_milestones(jsonb,text)'::TEXT),
      ('public.genome_record_infuse_count(jsonb)'::TEXT),
      ('public.record_codex_discoveries(uuid,uuid,jsonb)'::TEXT),
      ('public.record_session_codex_discoveries(uuid,uuid,jsonb)'::TEXT),
      ('public.get_genome_v2_capability()'::TEXT)
  ), service_functions AS (
    SELECT COALESCE(bool_and(
      resolved.function_oid IS NOT NULL
      AND pg_catalog.has_function_privilege(
        'service_role', resolved.function_oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'anon', resolved.function_oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'authenticated', resolved.function_oid, 'EXECUTE'
      )
    ), FALSE) AS exact
    FROM (
      SELECT pg_catalog.to_regprocedure(required.signature) AS function_oid
      FROM required_service_functions AS required
    ) AS resolved
  ), table_reads(role_name, table_name, expected) AS (
    VALUES
      ('anon'::TEXT, 'public.genome_gene_versions'::TEXT, TRUE),
      ('authenticated', 'public.genome_gene_versions', TRUE),
      ('anon', 'public.genome_splice_versions', TRUE),
      ('authenticated', 'public.genome_splice_versions', TRUE),
      ('anon', 'public.player_codex', FALSE),
      ('authenticated', 'public.player_codex', TRUE),
      ('anon', 'public.codex_first_discoveries', TRUE),
      ('authenticated', 'public.codex_first_discoveries', TRUE)
  ), table_privileges AS (
    SELECT
      COALESCE(bool_and(
        pg_catalog.has_table_privilege(
          table_reads.role_name, table_reads.table_name, 'SELECT'
        ) = table_reads.expected
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
      ) AS exact
    FROM table_reads
  ), versioned_codex AS (
    SELECT
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_row
        WHERE constraint_row.conrelid =
              pg_catalog.to_regclass('public.player_codex')
          AND constraint_row.contype = 'p'
          AND ARRAY(
            SELECT attribute_row.attname::TEXT
            FROM unnest(constraint_row.conkey) WITH ORDINALITY
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
            FROM unnest(constraint_row.conkey) WITH ORDINALITY
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
      ) AS exact
  ), ascendance AS (
    SELECT
      pg_catalog.to_regprocedure(
        'public.ascendance_yield_multiplier_bps_v2(integer)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.ascendance_yield_multiplier_v2(integer)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.ascendance_yield_bonus_v2(integer)'
      ) IS NOT NULL
      AND public.ascendance_yield_multiplier_bps_v2(1) = 10000
      AND public.ascendance_yield_multiplier_bps_v2(4) = 10200
      AND public.ascendance_yield_multiplier_v2(4) = 1.02
      AND public.ascendance_yield_bonus_v2(4) = 0.02 AS exact
  ), contract AS (
    SELECT
      catalog.genes_exact
      AND catalog.splices_exact
      AND projectors.exact
      AND service_functions.exact
      AND table_privileges.exact
      AND versioned_codex.exact
      AND ascendance.exact
      AND pg_catalog.to_regprocedure(
        'public.breeding_draft_v1(uuid,uuid,uuid,boolean,uuid,text[],text)'
      ) IS NOT NULL
      AND NOT pg_catalog.has_function_privilege(
        'service_role',
        'public.breeding_draft_v1(uuid,uuid,uuid,boolean,uuid,text[],text)',
        'EXECUTE'
      ) AS ready
    FROM catalog
    CROSS JOIN projectors
    CROSS JOIN service_functions
    CROSS JOIN table_privileges
    CROSS JOIN versioned_codex
    CROSS JOIN ascendance
  )
  SELECT jsonb_build_object(
    'status', CASE WHEN contract.ready THEN 'ready' ELSE 'incomplete' END,
    'schemaVersion', 2,
    'catalogVersion', 2,
    'ascendanceVersion', 2,
    'spliceCount', 8
  )
  FROM contract;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION get_genome_v2_capability() IS
  'Service-only release probe for the complete Genome v2 database contract.';

REVOKE ALL ON FUNCTION get_genome_v2_capability()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_genome_v2_capability()
  TO service_role;

COMMIT;
