-- Migration 032: Buildcraft: The Genome - engagement systems
--
-- Completes BUILDCRAFT_GENOME_DESIGN.md sections 9 and 12:
--   * Genome-aware daily contracts (seeded dark for the rollout gate)
--   * a dedicated seasonal gene catalog (season_mutations stays frozen)
--   * the five-week anomaly rotation, including Overgrown
--   * Gauntlet gene/strain bans with legacy-client normalization
--
-- This migration deliberately owns the complete current bodies of
-- refresh_contract_progress (021) and submit_gauntlet_picks (021). Keep
-- their pre-existing guards intact when extending them.

-- ---------------------------------------------------------------------------
-- 1. GENOME CONTRACT DEFINITIONS
-- ---------------------------------------------------------------------------

ALTER TABLE contract_definitions
  DROP CONSTRAINT IF EXISTS contract_definitions_contract_type_check;

ALTER TABLE contract_definitions
  ADD CONSTRAINT contract_definitions_contract_type_check CHECK (contract_type IN (
    'extract_n',
    'food_n_single_run',
    'extract_tier',
    'combo_x',
    'mutations_held',
    'extract_pure',
    'food_total',
    'clan_contribute',
    'gauntlet_runs',
    'extract_fast',
    'extract_nth_portal',
    'anomaly_run',
    'expression_triggered',
    'genes_held',
    'splice_discovered',
    'apex_reached',
    'strain_genes_banked',
    'infuses_banked'
  ));

INSERT INTO contract_definitions
  (id, contract_type, name, description, params, reward_dna, reward_energy, reward_xp, active, sort_order)
VALUES
  ('showtime', 'expression_triggered', 'Showtime',
   'Trigger any Strain Expression',
   '{"count": 1}', 500, 0, 150, false, 13),
  ('full_helix', 'genes_held', 'Full Helix',
   'Bank a run holding 6 genes',
   '{"count": 6}', 550, 0, 150, false, 14),
  ('geneticist', 'splice_discovered', 'Geneticist',
   'Fuse any Splice',
   '{"count": 1}', 600, 0, 150, false, 15),
  ('apex_predator', 'apex_reached', 'Apex Predator',
   'Reach any Strain Apex',
   '{"count": 1}', 650, 0, 150, false, 16),
  ('purebred', 'strain_genes_banked', 'Purebred',
   'Bank with 3 or more genes from the same strain',
   '{"count": 3}', 500, 0, 150, false, 17),
  ('all_in', 'infuses_banked', 'All In',
   'Bank a run after infusing at least twice',
   '{"count": 2}', 600, 0, 150, false, 18)
ON CONFLICT (id) DO UPDATE SET
  contract_type = EXCLUDED.contract_type,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  params = EXCLUDED.params,
  reward_dna = EXCLUDED.reward_dna,
  reward_energy = EXCLUDED.reward_energy,
  reward_xp = EXCLUDED.reward_xp,
  sort_order = EXCLUDED.sort_order;

-- Full owner body from 021 plus six Genome branches. Only completed,
-- validated, earning sessions from the requested UTC day are eligible.
CREATE OR REPLACE FUNCTION refresh_contract_progress(p_player_id UUID, p_date DATE)
RETURNS VOID AS $$
#variable_conflict use_column
DECLARE
  v_row RECORD;
  v_current INTEGER;
  v_target INTEGER;
  v_dynasty TEXT;
  v_day_start TIMESTAMPTZ := (p_date::timestamp AT TIME ZONE 'UTC');
  v_day_end TIMESTAMPTZ := ((p_date + 1)::timestamp AT TIME ZONE 'UTC');
BEGIN
  FOR v_row IN
    SELECT pc.id AS pc_id, cd.contract_type, cd.params
    FROM player_contracts pc
    JOIN contract_definitions cd ON cd.id = pc.contract_id
    WHERE pc.player_id = p_player_id
      AND pc.contract_date = p_date
      AND pc.picked
      AND pc.claimed_at IS NULL
  LOOP
    v_dynasty := v_row.params->>'dynasty';
    v_current := 0;
    v_target := 1;

    CASE v_row.contract_type
      WHEN 'extract_n' THEN
        v_target := COALESCE((v_row.params->>'count')::int, 1);
        SELECT COUNT(*)::int INTO v_current
        FROM game_sessions gs
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND gs.extracted;

      WHEN 'food_n_single_run' THEN
        v_target := COALESCE((v_row.params->>'foods')::int, 1);
        SELECT COALESCE(MAX(gs.foods_collected), 0)::int INTO v_current
        FROM game_sessions gs
        LEFT JOIN snake_variants sv ON sv.id = gs.snake_variant_id
        LEFT JOIN dynasties d ON d.id = sv.dynasty_id
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND (v_dynasty IS NULL OR d.name = v_dynasty);

      WHEN 'extract_tier' THEN
        v_target := COALESCE((v_row.params->>'min_foods')::int, 1);
        SELECT COALESCE(MAX(gs.foods_collected), 0)::int INTO v_current
        FROM game_sessions gs
        LEFT JOIN snake_variants sv ON sv.id = gs.snake_variant_id
        LEFT JOIN dynasties d ON d.id = sv.dynasty_id
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND gs.extracted
          AND (v_dynasty IS NULL OR d.name = v_dynasty);

      WHEN 'food_total' THEN
        v_target := COALESCE((v_row.params->>'foods')::int, 1);
        SELECT COALESCE(SUM(gs.foods_collected), 0)::int INTO v_current
        FROM game_sessions gs
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end;

      WHEN 'extract_fast' THEN
        v_target := 1;
        SELECT COUNT(*)::int INTO v_current
        FROM game_sessions gs
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND gs.extracted
          AND gs.duration_seconds <= COALESCE((v_row.params->>'max_seconds')::int, 240);

      WHEN 'extract_nth_portal' THEN
        v_target := 1;
        SELECT COUNT(*)::int INTO v_current
        FROM game_sessions gs
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND gs.extracted
          AND gs.foods_collected >= COALESCE((v_row.params->>'min_foods_proof')::int, 63);

      WHEN 'anomaly_run' THEN
        v_target := COALESCE((v_row.params->>'count')::int, 1);
        SELECT COUNT(*)::int INTO v_current
        FROM game_sessions gs
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND gs.anomaly_id IS NOT NULL;

      WHEN 'expression_triggered' THEN
        v_target := COALESCE((v_row.params->>'count')::int, 1);
        SELECT COUNT(*)::int INTO v_current
        FROM game_sessions gs
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND gs.genome->>'v' = '1'
          AND jsonb_typeof(gs.genome->'expressions') = 'object'
          AND gs.genome->'expressions' <> '{}'::jsonb;

      WHEN 'genes_held' THEN
        v_target := COALESCE((v_row.params->>'count')::int, 1);
        SELECT COALESCE(MAX(
          CASE WHEN jsonb_typeof(gs.genome->'picks') = 'array'
            THEN jsonb_array_length(gs.genome->'picks') ELSE 0 END
        ), 0)::int INTO v_current
        FROM game_sessions gs
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND gs.extracted
          AND gs.genome->>'v' = '1';

      WHEN 'splice_discovered' THEN
        v_target := COALESCE((v_row.params->>'count')::int, 1);
        SELECT COUNT(*)::int INTO v_current
        FROM game_sessions gs
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND gs.genome->>'v' = '1'
          AND jsonb_typeof(gs.genome->'splices') = 'array'
          AND jsonb_array_length(gs.genome->'splices') > 0;

      WHEN 'apex_reached' THEN
        v_target := COALESCE((v_row.params->>'count')::int, 1);
        SELECT COUNT(*)::int INTO v_current
        FROM game_sessions gs
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND gs.genome->>'v' = '1'
          AND jsonb_typeof(gs.genome->'apexes') = 'object'
          AND gs.genome->'apexes' <> '{}'::jsonb;

      WHEN 'strain_genes_banked' THEN
        v_target := COALESCE((v_row.params->>'count')::int, 1);
        SELECT COALESCE(MAX(per_strain.gene_count), 0)::int INTO v_current
        FROM (
          SELECT gs.id, strain.id, COUNT(*)::int AS gene_count
          FROM game_sessions gs
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(gs.genome->'picks') = 'array'
              THEN gs.genome->'picks' ELSE '[]'::jsonb END
          ) AS pick(value)
          JOIN gene_definitions gd ON gd.id = pick.value->>'id' AND gd.active
          CROSS JOIN LATERAL unnest(gd.strains) AS strain(id)
          WHERE gs.player_id = p_player_id
            AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
            AND gs.is_free_play IS NOT TRUE
            AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
            AND gs.extracted
            AND gs.genome->>'v' = '1'
          GROUP BY gs.id, strain.id
        ) per_strain;

      WHEN 'infuses_banked' THEN
        v_target := COALESCE((v_row.params->>'count')::int, 1);
        SELECT COALESCE(MAX(
          CASE WHEN jsonb_typeof(gs.genome->'infuses') = 'array'
            THEN jsonb_array_length(gs.genome->'infuses') ELSE 0 END
        ), 0)::int INTO v_current
        FROM game_sessions gs
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND gs.extracted
          AND gs.genome->>'v' = '1';

      ELSE
        -- Legacy facts that still have no accepted session representation:
        -- combo_x / mutations_held / extract_pure / clan_contribute /
        -- gauntlet_runs. Their definitions remain inactive.
        v_current := 0;
        v_target := 1;
    END CASE;

    UPDATE player_contracts pc SET
      progress = jsonb_build_object(
        'current', LEAST(v_current, v_target),
        'target', v_target
      ),
      completed_at = CASE
        WHEN v_current >= v_target AND pc.completed_at IS NULL THEN NOW()
        ELSE pc.completed_at
      END
    WHERE pc.id = v_row.pc_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- FTUE-aware deterministic offers. Activating Genome definitions globally
-- must not reveal a system before that player can use it.
CREATE OR REPLACE FUNCTION offer_daily_contracts(p_player_id UUID)
RETURNS TABLE (
  contract_id TEXT,
  contract_type TEXT,
  name TEXT,
  description TEXT,
  params JSONB,
  reward_dna INTEGER,
  reward_energy INTEGER,
  reward_xp INTEGER,
  offered_slot INTEGER,
  picked BOOLEAN,
  progress JSONB,
  completed_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ
) AS $$
#variable_conflict use_column
DECLARE
  v_date DATE := CURRENT_DATE;
  v_banked_runs INTEGER := 0;
  v_max_mastery INTEGER := 0;
BEGIN
  PERFORM 1 FROM players WHERE id = p_player_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  SELECT COUNT(*)::int INTO v_banked_runs
  FROM game_sessions gs
  WHERE gs.player_id = p_player_id
    AND gs.ended_at IS NOT NULL
    AND gs.validated IS TRUE
    AND gs.is_free_play IS NOT TRUE
    AND gs.extracted;

  SELECT COALESCE(MAX(level_for_xp(pm.xp)), 0)::int INTO v_max_mastery
  FROM player_mastery pm
  WHERE pm.player_id = p_player_id;

  IF NOT EXISTS (
    SELECT 1 FROM player_contracts pc
    WHERE pc.player_id = p_player_id AND pc.contract_date = v_date
  ) THEN
    INSERT INTO player_contracts (player_id, contract_date, contract_id, offered_slot)
    SELECT p_player_id, v_date, t.id, t.slot
    FROM (
      SELECT cd.id,
             ROW_NUMBER() OVER (
               ORDER BY md5(p_player_id::text || v_date::text || cd.id), cd.id
             )::int AS slot
      FROM contract_definitions cd
      WHERE cd.active
        AND CASE cd.contract_type
          WHEN 'strain_genes_banked' THEN v_banked_runs >= 4
          WHEN 'expression_triggered' THEN v_banked_runs >= 8
          WHEN 'infuses_banked' THEN v_banked_runs >= 10
          WHEN 'splice_discovered' THEN v_banked_runs >= 15
          WHEN 'apex_reached' THEN v_banked_runs >= 20 OR v_max_mastery >= 3
          ELSE TRUE
        END
    ) t
    WHERE t.slot <= 3
    ON CONFLICT (player_id, contract_date, contract_id) DO NOTHING;
  END IF;

  PERFORM refresh_contract_progress(p_player_id, v_date);

  RETURN QUERY
  SELECT pc.contract_id, cd.contract_type, cd.name, cd.description, cd.params,
         cd.reward_dna, cd.reward_energy, cd.reward_xp,
         pc.offered_slot, pc.picked, pc.progress, pc.completed_at, pc.claimed_at
  FROM player_contracts pc
  JOIN contract_definitions cd ON cd.id = pc.contract_id
  WHERE pc.player_id = p_player_id AND pc.contract_date = v_date
  ORDER BY pc.offered_slot;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 2. SEASONAL GENES
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS season_genes (
  gene_id TEXT PRIMARY KEY REFERENCES gene_definitions(id),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);

COMMENT ON TABLE season_genes IS
  'Genome-era seasonal offer catalog. season_mutations remains frozen for legacy clients.';

CREATE INDEX IF NOT EXISTS idx_season_genes_season ON season_genes(season_id);

ALTER TABLE season_genes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS season_genes_public_read ON season_genes;
CREATE POLICY season_genes_public_read ON season_genes
  FOR SELECT USING (TRUE);

-- Every existing seasonal mutation is also a valid Genome gene. Copying
-- from the frozen table preserves season ownership and future backfills.
INSERT INTO season_genes (gene_id, season_id, name)
SELECT sm.mutation_id, sm.season_id, gd.name
FROM season_mutations sm
JOIN gene_definitions gd ON gd.id = sm.mutation_id
ON CONFLICT (gene_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. FIVE-WEEK ANOMALY ROTATION
-- ---------------------------------------------------------------------------

ALTER TABLE game_sessions
  DROP CONSTRAINT IF EXISTS game_sessions_anomaly_id_check;
ALTER TABLE game_sessions
  ADD CONSTRAINT game_sessions_anomaly_id_check CHECK (anomaly_id IN (
    'meteor_shower', 'gold_rush', 'blackout', 'twin_exits', 'overgrown'
  ));

CREATE OR REPLACE FUNCTION anomaly_for_week(p_week DATE)
RETURNS TEXT AS $$
  SELECT (ARRAY[
    'meteor_shower', 'gold_rush', 'blackout', 'twin_exits', 'overgrown'
  ])[1 + mod(mod((p_week - DATE '2024-01-01') / 7, 5) + 5, 5)];
$$ LANGUAGE sql IMMUTABLE;

-- ---------------------------------------------------------------------------
-- 4. GAUNTLET GENOME BANS
-- ---------------------------------------------------------------------------

-- Normalize historical rows before enforcing the new wire domain. The RPC
-- below also accepts bare ids during the rolling-deploy window, but stores
-- only canonical gene:<id> / strain:<STRAIN> values.
UPDATE gauntlet_picks
SET mutation_ban = 'gene:' || mutation_ban
WHERE mutation_ban IS NOT NULL
  AND mutation_ban NOT LIKE 'gene:%'
  AND mutation_ban NOT LIKE 'strain:%';

ALTER TABLE gauntlet_picks
  DROP CONSTRAINT IF EXISTS gauntlet_picks_genome_ban_check;
ALTER TABLE gauntlet_picks
  ADD CONSTRAINT gauntlet_picks_genome_ban_check CHECK (
    mutation_ban IS NULL
    OR mutation_ban ~ '^gene:[a-z][a-z0-9_]*$'
    OR mutation_ban IN (
      'strain:AURUM', 'strain:VOLT', 'strain:FERAL',
      'strain:FLUX', 'strain:UMBRA'
    )
  );

COMMENT ON COLUMN gauntlet_picks.mutation_ban IS
  'Genome ban selected by a clan: gene:<gene id> removes an offer; strain:<STRAIN> suppresses that strain above Minor.';

CREATE OR REPLACE FUNCTION submit_gauntlet_picks(
  p_user_id UUID,
  p_dynasty TEXT,
  p_modifier TEXT DEFAULT NULL,
  p_ban TEXT DEFAULT NULL,
  p_dynasty_2 TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_member RECORD;
  v_week DATE := duel_week_start(NOW());
  v_duel RECORD;
  v_deadline TIMESTAMPTZ;
  v_ban TEXT := NULL;
  v_gene_id TEXT;
BEGIN
  SELECT clan_id, role INTO v_member
  FROM clan_members WHERE player_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_IN_CLAN';
  END IF;
  IF v_member.role NOT IN ('owner', 'officer') THEN
    RAISE EXCEPTION 'NOT_AN_OFFICER';
  END IF;

  SELECT * INTO v_duel FROM clan_duels
  WHERE week_start = v_week
    AND (clan_a = v_member.clan_id OR clan_b = v_member.clan_id)
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_DUEL_THIS_WEEK';
  END IF;
  IF v_duel.clan_b IS NULL THEN
    RAISE EXCEPTION 'BYE_WEEK';
  END IF;

  v_deadline := ((v_duel.week_start + 2)::timestamp AT TIME ZONE 'UTC');
  IF NOW() >= v_deadline THEN
    RAISE EXCEPTION 'PICKS_CLOSED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM gauntlet_picks
    WHERE duel_id = v_duel.id AND clan_id = v_member.clan_id
  ) THEN
    RAISE EXCEPTION 'ALREADY_LOCKED';
  END IF;

  IF p_dynasty IS NULL OR p_dynasty NOT IN ('PRIMAL', 'CYBER', 'COSMIC') THEN
    RAISE EXCEPTION 'INVALID_DYNASTY';
  END IF;

  IF p_dynasty_2 IS NOT NULL THEN
    IF p_dynasty_2 NOT IN ('PRIMAL', 'CYBER', 'COSMIC') OR p_dynasty_2 = p_dynasty THEN
      RAISE EXCEPTION 'INVALID_DYNASTY_SPLIT';
    END IF;
    IF NOT clan_has_research(v_member.clan_id, 'protocols_4') THEN
      RAISE EXCEPTION 'SPLIT_PICK_LOCKED';
    END IF;
  END IF;

  IF p_modifier IS NOT NULL THEN
    IF p_modifier NOT IN ('vanguard', 'deep_bench', 'extraction_doctrine',
                          'anomaly_doctrine', 'sudden_death') THEN
      RAISE EXCEPTION 'INVALID_MODIFIER';
    END IF;
    IF p_modifier = 'anomaly_doctrine'
       AND NOT clan_has_research(v_member.clan_id, 'protocols_1') THEN
      RAISE EXCEPTION 'MODIFIER_LOCKED:protocols_1';
    END IF;
    IF p_modifier = 'sudden_death'
       AND NOT clan_has_research(v_member.clan_id, 'protocols_2') THEN
      RAISE EXCEPTION 'MODIFIER_LOCKED:protocols_2';
    END IF;
  END IF;

  IF p_ban IS NOT NULL THEN
    IF p_ban LIKE 'strain:%' THEN
      IF p_ban NOT IN (
        'strain:AURUM', 'strain:VOLT', 'strain:FERAL',
        'strain:FLUX', 'strain:UMBRA'
      ) THEN
        RAISE EXCEPTION 'INVALID_BAN';
      END IF;
      v_ban := p_ban;
    ELSE
      -- New clients send gene:<id>; pre-032 clients send the bare id.
      v_gene_id := CASE
        WHEN p_ban LIKE 'gene:%' THEN substring(p_ban FROM 6)
        ELSE p_ban
      END;
      IF v_gene_id IS NULL OR v_gene_id = '' OR NOT EXISTS (
        SELECT 1 FROM gene_definitions gd
        WHERE gd.id = v_gene_id AND gd.active
      ) THEN
        RAISE EXCEPTION 'INVALID_BAN';
      END IF;
      v_ban := 'gene:' || v_gene_id;
    END IF;
  END IF;

  INSERT INTO gauntlet_picks
    (duel_id, clan_id, dynasty_pick, dynasty_pick_2, modifier_pick, mutation_ban, submitted_by)
  VALUES
    (v_duel.id, v_member.clan_id, p_dynasty, p_dynasty_2, p_modifier, v_ban, p_user_id);

  RETURN jsonb_build_object(
    'locked', true,
    'dynasty', p_dynasty,
    'dynasty_2', p_dynasty_2,
    'modifier', p_modifier,
    'ban', v_ban,
    'reveal_at', v_deadline
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
