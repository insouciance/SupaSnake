-- Migration 030: Buildcraft: The Genome - Lineage (BUILDCRAFT_GENOME_DESIGN.md §7)
--
-- Variants carry a strain affinity; collected snakes inherit and mix it
-- through breeding. The equipped snake's lineage (+ Heirloom traits)
-- grants STARTING STRAIN POINTS at run start - the bridge that finally
-- makes the collection meta shape run gameplay.
--
-- Model:
--   snake_variants.lineage_strain / affinity_strength: the variant's
--     INNATE affinity (dynasty-themed, rarity-scaled). The runtime
--     fallback when a collected snake has no explicit lineage.
--   collected_snakes.lineage JSONB: the snake's OWN lineage - written by
--     breeding (crafted) and lineage rerolls; NULL = derive from variant.
--     Shape: {"strains": ["FERAL"(, "VOLT")], "strength": 0..2,
--             ("primary": "FERAL")} - mirrored by
--     src/shared/game/lineage.ts sanitizeLineage (keep in lockstep).
--
-- Inheritance (breed_snakes v3 - 018 body + lineage roll):
--   - same strain (Purebred): strength = max(parents) + 1
--   - same dynasty, different strains: one parent's strain (50/50),
--     strength = max(parents)
--   - cross-dynasty (only when the server allows it): DUAL lineage - both
--     strains, strength = max(parents); the owner chooses primary pre-run
--   - clamp: min(rarity cap (common/uncommon 0, rare 1, epic+ 2)
--     + Gen3 prestige (+1), 2) - mirrors clampLineageStrength (lineage.ts)
--   - the roll lands in breeding_history.trait_rolls -> 'lineage' (audit)
--
-- Ownership changes:
--   breed_snakes                            018 -> 030 (+ lineage inheritance,
--                                           + optional p_allow_cross_dynasty)
--   economy_transactions_source_type_check  028 -> 030 (+ 'lineage_reroll')

-- ----------------------------------------------------------------------------
-- 1. Variant affinity columns + dynasty-themed seed
-- ----------------------------------------------------------------------------

ALTER TABLE snake_variants
  ADD COLUMN IF NOT EXISTS lineage_strain TEXT,
  ADD COLUMN IF NOT EXISTS affinity_strength SMALLINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN snake_variants.lineage_strain IS
  'Genome §7: the variant''s innate strain affinity (dynasty signature).';
COMMENT ON COLUMN snake_variants.affinity_strength IS
  'Genome §7: 0 = offer bias only, 1 = +1 strain point, 2 = +1 point + first-offer guarantee.';

-- Dynasty signature strains: PRIMAL->FERAL, CYBER->VOLT, COSMIC->FLUX;
-- strength by rarity: common/uncommon 0, rare 1, epic/legendary 2.
-- Idempotent: only rows still missing a lineage are stamped.
UPDATE snake_variants sv
SET lineage_strain = CASE d.name
      WHEN 'PRIMAL' THEN 'FERAL'
      WHEN 'CYBER' THEN 'VOLT'
      WHEN 'COSMIC' THEN 'FLUX'
    END,
    affinity_strength = CASE lower(sv.rarity)
      WHEN 'rare' THEN 1
      WHEN 'epic' THEN 2
      WHEN 'legendary' THEN 2
      ELSE 0
    END
FROM dynasties d
WHERE sv.dynasty_id = d.id
  AND sv.lineage_strain IS NULL
  AND d.name IN ('PRIMAL','CYBER','COSMIC');

-- The launch dynasty set is locked, so every catalog row must have an
-- affinity. Future variant inserts fail closed unless their lineage is set.
ALTER TABLE snake_variants ALTER COLUMN lineage_strain SET NOT NULL;
ALTER TABLE snake_variants DROP CONSTRAINT IF EXISTS snake_variants_lineage_strain_check;
ALTER TABLE snake_variants ADD CONSTRAINT snake_variants_lineage_strain_check
  CHECK (lineage_strain IN ('AURUM','VOLT','FERAL','FLUX','UMBRA'));
ALTER TABLE snake_variants DROP CONSTRAINT IF EXISTS snake_variants_affinity_strength_check;
ALTER TABLE snake_variants ADD CONSTRAINT snake_variants_affinity_strength_check
  CHECK (affinity_strength BETWEEN 0 AND 2);
ALTER TABLE snake_variants DROP CONSTRAINT IF EXISTS snake_variants_affinity_matches_rarity;
ALTER TABLE snake_variants ADD CONSTRAINT snake_variants_affinity_matches_rarity
  CHECK (affinity_strength = CASE lower(rarity)
    WHEN 'rare' THEN 1
    WHEN 'epic' THEN 2
    WHEN 'legendary' THEN 2
    ELSE 0
  END);

-- ----------------------------------------------------------------------------
-- 2. Collected snakes: explicit lineage (NULL = derive from the variant)
-- ----------------------------------------------------------------------------

ALTER TABLE collected_snakes
  ADD COLUMN IF NOT EXISTS lineage JSONB;

COMMENT ON COLUMN collected_snakes.lineage IS
  'Genome §7: the snake''s own lineage {strains, strength(, primary)}; NULL derives from the variant''s affinity. Written by breed_snakes / reroll_lineage.';

-- ----------------------------------------------------------------------------
-- 3. Lineage helpers + JSONB invariant (TS lockstep: lineage.ts)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION lineage_is_valid(p_lineage JSONB)
RETURNS BOOLEAN AS $$
DECLARE
  v_strains TEXT[];
BEGIN
  IF p_lineage IS NULL THEN
    RETURN true;
  END IF;
  IF jsonb_typeof(p_lineage) <> 'object'
     OR jsonb_typeof(p_lineage -> 'strains') <> 'array' THEN
    RETURN false;
  END IF;

  SELECT COALESCE(array_agg(value), '{}') INTO v_strains
  FROM jsonb_array_elements_text(p_lineage -> 'strains') AS strain(value);
  IF COALESCE(array_length(v_strains, 1), 0) NOT BETWEEN 1 AND 2
     OR EXISTS (
       SELECT 1 FROM unnest(v_strains) AS valueset(value)
       WHERE value NOT IN ('AURUM','VOLT','FERAL','FLUX','UMBRA')
     )
     OR COALESCE(array_length(v_strains, 1), 0) <>
        (SELECT COUNT(DISTINCT value) FROM unnest(v_strains) AS valueset(value)) THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(p_lineage -> 'strength') <> 'number'
     OR (p_lineage ->> 'strength') !~ '^[0-2]$' THEN
    RETURN false;
  END IF;

  IF p_lineage ? 'primary' THEN
    IF array_length(v_strains, 1) <> 2
       OR jsonb_typeof(p_lineage -> 'primary') <> 'string'
       OR NOT ((p_lineage ->> 'primary') = ANY(v_strains)) THEN
      RETURN false;
    END IF;
  END IF;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

ALTER TABLE collected_snakes DROP CONSTRAINT IF EXISTS collected_snakes_lineage_valid;
ALTER TABLE collected_snakes ADD CONSTRAINT collected_snakes_lineage_valid
  CHECK (lineage_is_valid(lineage));

CREATE OR REPLACE FUNCTION lineage_strength_cap(p_rarity TEXT)
RETURNS INTEGER AS $$
  SELECT CASE lower(COALESCE(p_rarity, ''))
    WHEN 'rare' THEN 1
    WHEN 'epic' THEN 2
    WHEN 'legendary' THEN 2
    ELSE 0
  END;
$$ LANGUAGE sql IMMUTABLE SET search_path = public;

-- strength = min(2, min(raw, rarity cap) + Gen3 prestige)
CREATE OR REPLACE FUNCTION clamp_lineage_strength(
  p_raw INTEGER,
  p_rarity TEXT,
  p_generation INTEGER
) RETURNS INTEGER AS $$
  SELECT LEAST(
    2,
    LEAST(GREATEST(COALESCE(p_raw, 0), 0), lineage_strength_cap(p_rarity))
      + CASE WHEN p_generation >= 3 THEN 1 ELSE 0 END
  );
$$ LANGUAGE sql IMMUTABLE SET search_path = public;

-- The effective lineage of a collected snake row (own JSONB, else the
-- variant affinity), as the canonical JSONB shape - used by breeding.
CREATE OR REPLACE FUNCTION effective_lineage(
  p_lineage JSONB,
  p_variant_strain TEXT,
  p_variant_strength INTEGER
) RETURNS JSONB AS $$
  SELECT CASE
    WHEN p_lineage IS NOT NULL AND lineage_is_valid(p_lineage)
      THEN p_lineage
    WHEN p_variant_strain IS NOT NULL
      THEN jsonb_build_object(
        'strains', jsonb_build_array(p_variant_strain),
        'strength', GREATEST(LEAST(COALESCE(p_variant_strength, 0), 2), 0)
      )
    ELSE NULL
  END;
$$ LANGUAGE sql IMMUTABLE SET search_path = public;

-- ----------------------------------------------------------------------------
-- 4. breed_snakes v3: the 018 body + lineage inheritance. Compatible
--    through a default fourth parameter, so the existing API keeps working;
--    cross-dynasty breeding stays refused unless explicitly allowed.
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS breed_snakes(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION breed_snakes(
  p_player_id UUID,
  p_parent1_id UUID,
  p_parent2_id UUID,
  p_allow_cross_dynasty BOOLEAN DEFAULT FALSE
) RETURNS UUID AS $$
DECLARE
  v_parent1 RECORD;
  v_parent2 RECORD;
  v_dna_cost INTEGER;
  v_offspring_gen INTEGER;
  v_offspring_variant_id UUID;
  v_offspring_rarity TEXT;
  v_offspring_id UUID;
  v_player_dna INTEGER;
  v_new_balance INTEGER;
  v_pool1 TEXT[];
  v_pool2 TEXT[];
  v_slots INTEGER;
  v_roll1 TEXT;
  v_roll2 TEXT;
  v_traits TEXT[] := ARRAY[]::TEXT[];
  -- Lineage (Genome §7)
  v_lin1 JSONB;
  v_lin2 JSONB;
  v_strain1 TEXT;
  v_strain2 TEXT;
  v_str1 INTEGER;
  v_str2 INTEGER;
  v_child_strain TEXT;
  v_child_strength INTEGER;
  v_child_lineage JSONB;
  v_cross BOOLEAN;
BEGIN
  IF p_parent1_id = p_parent2_id THEN
    RAISE EXCEPTION 'Cannot breed snake with itself';
  END IF;

  SELECT cs.*, sv.dynasty_id AS v_dynasty_id, sv.id AS v_variant_id,
         sv.lineage_strain AS v_lineage_strain,
         sv.affinity_strength AS v_affinity_strength
  INTO v_parent1
  FROM collected_snakes cs
  JOIN snake_variants sv ON cs.snake_variant_id = sv.id
  WHERE cs.id = p_parent1_id AND cs.player_id = p_player_id
  FOR UPDATE OF cs;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent 1 not found or not owned';
  END IF;

  SELECT cs.*, sv.dynasty_id AS v_dynasty_id, sv.id AS v_variant_id,
         sv.lineage_strain AS v_lineage_strain,
         sv.affinity_strength AS v_affinity_strength
  INTO v_parent2
  FROM collected_snakes cs
  JOIN snake_variants sv ON cs.snake_variant_id = sv.id
  WHERE cs.id = p_parent2_id AND cs.player_id = p_player_id
  FOR UPDATE OF cs;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent 2 not found or not owned';
  END IF;

  v_cross := v_parent1.v_dynasty_id != v_parent2.v_dynasty_id;
  IF v_cross AND NOT p_allow_cross_dynasty THEN
    RAISE EXCEPTION 'Parents must be same dynasty';
  END IF;

  v_dna_cost := 200 + ((v_parent1.generation + v_parent2.generation) / 2) * 100;

  SELECT dna INTO v_player_dna FROM players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;
  IF v_player_dna < v_dna_cost THEN
    RAISE EXCEPTION 'Insufficient DNA: need %, have %', v_dna_cost, v_player_dna;
  END IF;

  v_offspring_gen := GREATEST(v_parent1.generation, v_parent2.generation) + 1;
  IF v_offspring_gen > 50 THEN
    RAISE EXCEPTION 'Maximum generation (50) reached';
  END IF;

  -- Offspring variant: 50/50 from the two parents (spec 2.1)
  IF random() < 0.5 THEN
    v_offspring_variant_id := v_parent1.v_variant_id;
  ELSE
    v_offspring_variant_id := v_parent2.v_variant_id;
  END IF;

  SELECT rarity INTO v_offspring_rarity
  FROM snake_variants WHERE id = v_offspring_variant_id;

  -- Trait inheritance (018, unchanged): one roll from each parent's pool
  SELECT COALESCE(array_agg(t ORDER BY ord), '{}') INTO v_pool1
  FROM unnest(COALESCE(v_parent1.traits, '{}')) WITH ORDINALITY AS u(t, ord)
  WHERE t IN (SELECT id FROM trait_definitions WHERE active);

  SELECT COALESCE(array_agg(t ORDER BY ord), '{}') INTO v_pool2
  FROM unnest(COALESCE(v_parent2.traits, '{}')) WITH ORDINALITY AS u(t, ord)
  WHERE t IN (SELECT id FROM trait_definitions WHERE active);

  v_slots := get_trait_slots(v_offspring_rarity, v_offspring_gen);
  v_roll1 := pick_random_trait(v_pool1);
  v_roll2 := pick_random_trait(v_pool2);

  IF v_roll1 IS NOT NULL THEN
    v_traits := array_append(v_traits, v_roll1);
  END IF;
  IF v_roll2 IS NOT NULL AND (v_roll2 <> ALL(v_traits)) THEN
    v_traits := array_append(v_traits, v_roll2);
  END IF;
  v_traits := v_traits[1:v_slots];

  -- Lineage inheritance (Genome §7) - TS lockstep: combineLineages
  v_lin1 := effective_lineage(v_parent1.lineage, v_parent1.v_lineage_strain,
                              v_parent1.v_affinity_strength);
  v_lin2 := effective_lineage(v_parent2.lineage, v_parent2.v_lineage_strain,
                              v_parent2.v_affinity_strength);
  -- Existing dual-lineage parents pass their selected primary; an unselected
  -- dual falls back deterministically to its first stored strain.
  v_strain1 := COALESCE(v_lin1 ->> 'primary', v_lin1 -> 'strains' ->> 0);
  v_strain2 := COALESCE(v_lin2 ->> 'primary', v_lin2 -> 'strains' ->> 0);
  v_str1 := COALESCE((v_lin1 ->> 'strength')::INTEGER, 0);
  v_str2 := COALESCE((v_lin2 ->> 'strength')::INTEGER, 0);

  IF v_strain1 IS NULL AND v_strain2 IS NULL THEN
    v_child_lineage := NULL;
  ELSIF v_cross AND v_strain1 IS NOT NULL AND v_strain2 IS NOT NULL
        AND v_strain1 <> v_strain2 THEN
    -- Cross-dynasty: DUAL lineage. Primary is deliberately omitted; rare+
    -- owners choose which strain receives the point/guarantee before a run.
    v_child_strength := clamp_lineage_strength(
      GREATEST(v_str1, v_str2), v_offspring_rarity, v_offspring_gen);
    v_child_lineage := jsonb_build_object(
      'strains', jsonb_build_array(v_strain1, v_strain2),
      'strength', v_child_strength
    );
  ELSIF v_strain1 IS NOT NULL AND v_strain1 = v_strain2 THEN
    -- Purebred: strength = max(parents) + 1 (then clamped)
    v_child_strength := clamp_lineage_strength(
      GREATEST(v_str1, v_str2) + 1, v_offspring_rarity, v_offspring_gen);
    v_child_lineage := jsonb_build_object(
      'strains', jsonb_build_array(v_strain1),
      'strength', v_child_strength
    );
  ELSE
    -- One parent's strain (50/50 when both exist)
    IF v_strain1 IS NULL OR (v_strain2 IS NOT NULL AND random() < 0.5) THEN
      v_child_strain := v_strain2;
    ELSE
      v_child_strain := v_strain1;
    END IF;
    v_child_strength := clamp_lineage_strength(
      GREATEST(v_str1, v_str2), v_offspring_rarity, v_offspring_gen);
    v_child_lineage := jsonb_build_object(
      'strains', jsonb_build_array(v_child_strain),
      'strength', v_child_strength
    );
  END IF;

  UPDATE players
  SET dna = dna - v_dna_cost,
      breeds_completed = COALESCE(breeds_completed, 0) + 1
  WHERE id = p_player_id
  RETURNING dna INTO v_new_balance;

  INSERT INTO economy_transactions (player_id, resource_type, amount, balance_after, source_type, metadata)
  VALUES (p_player_id, 'dna', -v_dna_cost, v_new_balance, 'breeding_cost',
          jsonb_build_object('parent1_id', p_parent1_id, 'parent2_id', p_parent2_id));

  INSERT INTO collected_snakes (
    player_id, snake_variant_id, generation, parent1_id, parent2_id,
    acquired_method, is_equipped, is_favorited, traits, lineage
  ) VALUES (
    p_player_id, v_offspring_variant_id, v_offspring_gen,
    p_parent1_id, p_parent2_id, 'bred', false, false, v_traits, v_child_lineage
  ) RETURNING id INTO v_offspring_id;

  INSERT INTO breeding_history (player_id, parent1_id, parent2_id, child_id, dna_cost, trait_rolls)
  VALUES (p_player_id, p_parent1_id, p_parent2_id, v_offspring_id, v_dna_cost,
          jsonb_build_object(
            'parent1_pool', to_jsonb(v_pool1),
            'parent2_pool', to_jsonb(v_pool2),
            'slots', v_slots,
            'rolled', to_jsonb(v_traits),
            'rerolls', '[]'::jsonb,
            'lineage', jsonb_build_object(
              'parent1', v_lin1,
              'parent2', v_lin2,
              'child', v_child_lineage
            )
          ));

  RETURN v_offspring_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION breed_snakes(UUID, UUID, UUID, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION breed_snakes(UUID, UUID, UUID, BOOLEAN) FROM anon;
REVOKE EXECUTE ON FUNCTION breed_snakes(UUID, UUID, UUID, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION breed_snakes(UUID, UUID, UUID, BOOLEAN) TO service_role;

-- ----------------------------------------------------------------------------
-- 5. unlock_variant v3: migration 018 wild-trait body, with lineage left
--    NULL so the canonical variant-affinity fallback remains authoritative.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION unlock_variant(
  p_player_id UUID,
  p_variant_id UUID
) RETURNS UUID AS $$
DECLARE
  v_variant RECORD;
  v_player RECORD;
  v_new_snake_id UUID;
  v_new_balance INTEGER;
  v_traits TEXT[] := ARRAY[]::TEXT[];
  v_slots INTEGER;
BEGIN
  SELECT * INTO v_variant
  FROM snake_variants
  WHERE id = p_variant_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variant not found or inactive';
  END IF;

  SELECT * INTO v_player
  FROM players
  WHERE id = p_player_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM collected_snakes
    WHERE player_id = p_player_id
      AND snake_variant_id = p_variant_id
      AND generation = 1
  ) THEN
    RAISE EXCEPTION 'Variant already owned';
  END IF;

  IF v_variant.unlock_cost_dna > 0 AND v_player.dna < v_variant.unlock_cost_dna THEN
    RAISE EXCEPTION 'Insufficient DNA. Need % but have %',
      v_variant.unlock_cost_dna, v_player.dna;
  END IF;

  IF v_variant.unlock_cost_dna > 0 THEN
    UPDATE players
    SET dna = dna - v_variant.unlock_cost_dna
    WHERE id = p_player_id
    RETURNING dna INTO v_new_balance;

    INSERT INTO economy_transactions (
      player_id, resource_type, amount, balance_after, source_type, metadata
    ) VALUES (
      p_player_id, 'dna', -v_variant.unlock_cost_dna, v_new_balance,
      'unlock_cost',
      jsonb_build_object('variant_id', p_variant_id, 'variant_name', v_variant.name)
    );
  END IF;

  IF NOT v_variant.is_starter THEN
    v_slots := get_trait_slots(v_variant.rarity, 1);
    SELECT COALESCE(array_agg(id), '{}') INTO v_traits
    FROM (
      SELECT id
      FROM trait_definitions
      WHERE active
      ORDER BY hashtextextended(gen_random_uuid()::text, 0)
      LIMIT v_slots
    ) wild;
  END IF;

  INSERT INTO collected_snakes (
    player_id, snake_variant_id, generation, acquired_method,
    is_equipped, is_favorited, traits, lineage
  ) VALUES (
    p_player_id, p_variant_id, 1,
    CASE WHEN v_variant.is_starter THEN 'tutorial' ELSE 'unlock' END,
    false, false, v_traits, NULL
  ) RETURNING id INTO v_new_snake_id;

  RETURN v_new_snake_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION unlock_variant(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION unlock_variant(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION unlock_variant(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION unlock_variant(UUID, UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- 6. reroll_lineage: redraw a snake's lineage STRAIN for 150 DNA (§7 - the
--    new sink). Keeps strength (and dual-ness: rerolls the PRIMARY strain
--    of a dual lineage). Refused when the snake has no lineage at all.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reroll_lineage(
  p_player_id UUID,
  p_snake_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_snake RECORD;
  v_lineage JSONB;
  v_old_lineage JSONB;
  v_current TEXT;
  v_new_strain TEXT;
  v_target_index INTEGER := 0;
  v_player_dna INTEGER;
  v_new_balance INTEGER;
  v_cost INTEGER := 150; -- TS lockstep: LINEAGE_REROLL_COST (lineage.ts)
  v_strains TEXT[] := ARRAY['AURUM','VOLT','FERAL','FLUX','UMBRA'];
  v_options TEXT[];
BEGIN
  SELECT cs.*, sv.lineage_strain AS v_lineage_strain,
         sv.affinity_strength AS v_affinity_strength
  INTO v_snake
  FROM collected_snakes cs
  JOIN snake_variants sv ON cs.snake_variant_id = sv.id
  WHERE cs.id = p_snake_id AND cs.player_id = p_player_id
  FOR UPDATE OF cs;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snake not found or not owned';
  END IF;

  v_lineage := effective_lineage(v_snake.lineage, v_snake.v_lineage_strain,
                                 v_snake.v_affinity_strength);
  IF v_lineage IS NULL THEN
    RAISE EXCEPTION 'Snake has no lineage to reroll';
  END IF;
  v_old_lineage := v_lineage;

  SELECT dna INTO v_player_dna FROM players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;
  IF v_player_dna < v_cost THEN
    RAISE EXCEPTION 'Insufficient DNA: need %, have %', v_cost, v_player_dna;
  END IF;

  v_current := COALESCE(v_lineage ->> 'primary', v_lineage -> 'strains' ->> 0);
  SELECT COALESCE(array_agg(s), '{}') INTO v_options
  FROM unnest(v_strains) AS s
  -- All five launch strains are available to every dynasty's gene pool.
  -- Excluding every existing lineage strain prevents duplicate duals.
  WHERE NOT ((v_lineage -> 'strains') ? s);
  v_new_strain := v_options[1 + floor(random() * array_length(v_options, 1))::INTEGER];

  -- Replace the (primary) strain, keep strength + dual partner
  IF jsonb_array_length(v_lineage -> 'strains') > 1 THEN
    IF v_lineage ? 'primary' THEN
      SELECT ordinality - 1 INTO v_target_index
      FROM jsonb_array_elements_text(v_lineage -> 'strains')
        WITH ORDINALITY AS strain(value, ordinality)
      WHERE value = v_current;
    END IF;
    v_lineage := jsonb_set(
      v_lineage,
      ARRAY['strains', v_target_index::TEXT],
      to_jsonb(v_new_strain),
      false
    );
    IF v_lineage ? 'primary' THEN
      v_lineage := jsonb_set(v_lineage, '{primary}', to_jsonb(v_new_strain));
    END IF;
  ELSE
    v_lineage := jsonb_set(v_lineage, '{strains,0}', to_jsonb(v_new_strain));
  END IF;

  UPDATE players SET dna = dna - v_cost
  WHERE id = p_player_id
  RETURNING dna INTO v_new_balance;

  INSERT INTO economy_transactions (player_id, resource_type, amount, balance_after, source_type, metadata)
  VALUES (p_player_id, 'dna', -v_cost, v_new_balance, 'lineage_reroll',
          jsonb_build_object(
            'snake_id', p_snake_id,
            'from', v_old_lineage,
            'to', v_lineage
          ));

  UPDATE collected_snakes SET lineage = v_lineage WHERE id = p_snake_id;

  RETURN v_lineage;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION reroll_lineage(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reroll_lineage(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION reroll_lineage(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION reroll_lineage(UUID, UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- 7. set_lineage_primary: persist the owner's pre-run choice for a dual
--    lineage. No economy mutation; single-lineage snakes are rejected.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_lineage_primary(
  p_player_id UUID,
  p_snake_id UUID,
  p_primary TEXT
) RETURNS JSONB AS $$
DECLARE
  v_lineage JSONB;
BEGIN
  SELECT lineage INTO v_lineage
  FROM collected_snakes
  WHERE id = p_snake_id AND player_id = p_player_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snake not found or not owned';
  END IF;
  IF v_lineage IS NULL
     OR jsonb_array_length(v_lineage -> 'strains') <> 2 THEN
    RAISE EXCEPTION 'Snake does not have a dual lineage';
  END IF;
  IF p_primary IS NULL
     OR NOT ((v_lineage -> 'strains') ? p_primary) THEN
    RAISE EXCEPTION 'Primary must be one of the snake''s lineage strains';
  END IF;

  v_lineage := jsonb_set(v_lineage, '{primary}', to_jsonb(p_primary));
  UPDATE collected_snakes
  SET lineage = v_lineage
  WHERE id = p_snake_id;

  RETURN v_lineage;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION set_lineage_primary(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_lineage_primary(UUID, UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION set_lineage_primary(UUID, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION set_lineage_primary(UUID, UUID, TEXT) TO service_role;

-- ----------------------------------------------------------------------------
-- 8. economy_transactions: extend source_type CHECK with 'lineage_reroll'
--    (030 is now the constraint owner - 028's 15 values + 1)
-- ----------------------------------------------------------------------------

ALTER TABLE economy_transactions DROP CONSTRAINT IF EXISTS economy_transactions_source_type_check;
ALTER TABLE economy_transactions ADD CONSTRAINT economy_transactions_source_type_check
  CHECK (source_type IN (
    'game_reward',
    'breeding_cost',
    'purchase',
    'daily_reward',
    'game_start',
    'energy_regen',
    'admin_grant',
    'refund',
    'achievement_reward',
    'streak_bonus',
    'battle_pass_reward',
    'offline_claim',
    'unlock_cost',
    'clan_tithe',
    'premium_stipend',
    'lineage_reroll'
  ));

-- ----------------------------------------------------------------------------
-- 9. Mutation boundary: collection/economy writes flow through server routes.
--    The routes use service_role after authenticating the bearer token; direct
--    authenticated table/RPC mutation would bypass feature and economy gates.
-- ----------------------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE ON TABLE collected_snakes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE collected_snakes FROM authenticated;

ALTER FUNCTION reroll_trait(UUID, UUID, INTEGER) SET search_path = public;
REVOKE EXECUTE ON FUNCTION reroll_trait(UUID, UUID, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reroll_trait(UUID, UUID, INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION reroll_trait(UUID, UUID, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION reroll_trait(UUID, UUID, INTEGER) TO service_role;
