-- Migration 047: WP-1.05 - Lineage rework (Constitution §8.2, §6.2)
--
-- The shipped breeding system contradicted its own fantasy three times with
-- random(): the offspring variant was a coin flip, the lineage strain was a
-- coin flip, and the lineage reroll was a die roll. §8.2 replaces all three
-- with a DETERMINISTIC DRAFT:
--
--   * the player CHOOSES the child's variant line from the parents' lines
--   * the player DRAFTS inherited traits into the child's bounded slots -
--     taking one is not taking another, and that forced choice is the
--     sacrifice the design asks for
--   * the player CHOOSES the lineage strain from the parents' strains
--
-- Nothing material is hidden past payment (P6; §10's "outcome fully known"
-- made mechanical). The preview a player is shown IS the child they get:
-- `breeding_draft` computes the whole outcome and `breed_snakes` calls
-- exactly that function and persists exactly its answer. There is no second
-- code path, so there is nothing for the two to disagree about.
--
-- Ascendance (§8.2, owner ruling v1.2, reversing the Gen3 cap):
--   * generations are UNCAPPED - the `> 50` refusal is deleted
--   * from Gen4 each generation permanently raises the snake's YIELD by
--     0.30 * (1 - (14/15)^(gen-3)) - +2% at Gen4, decaying toward +30%,
--     never reaching it. Existing Gen>3 snakes enter the curve AT their
--     current generation: the bonus is a pure function of the generation
--     column and nothing is reset or recomputed backwards (Rule 6).
--   * the breeding cost curve steepens 1.25x per generation past Gen3, so
--     the lane spans months rather than day one. A child of Gen1-3 costs
--     exactly what it costs today - nobody's plan got more expensive.
--   * Score never reads any of this (Rule 2); Depth does, because Depth is
--     accumulated Yield (§6.2) - which is where investment is SUPPOSED to
--     pay. No euro reaches it: generation only rises by spending DNA, and
--     DNA is never sold (Rule 3, §10.4).
--
-- Reroll retirement (§8.2: "nothing random remains to reroll"):
--   * reroll_lineage and reroll_trait become tombstones that raise, with
--     every EXECUTE grant revoked
--   * pick_random_trait, the RNG they and the old breed_snakes shared, is
--     dropped
--   * held player_reroll_tokens convert to 150 DNA each - their old price.
--     This is a conversion, not a confiscation: the migration snapshots
--     every balance first and ABORTS if any player ends with less value
--     than they started with (Rule 6)
--   * the season track stops minting them; the five unclaimed Season 1
--     reroll-token milestones are removed rather than left advertising a
--     retired reward. Claimed rows are untouched - they are history.
--
-- Ownership changes:
--   breed_snakes                            030 -> 047 (deterministic draft)
--   reroll_lineage                          030 -> 047 (retired)
--   reroll_trait                            018 -> 047 (retired)
--   claim_season_tier                       044 -> 047 (-reroll_token grant)
--   economy_transactions_source_type_check  031 -> 047 (+ conversion source)
--
-- DOWN NOTE (forward-only, per the migration protocol): there is no down
-- migration. Reversing this would mean re-minting reroll tokens out of DNA
-- players may already have spent, and restoring random() to a path the
-- Constitution forbids. To roll back the SURFACE, revert the application
-- code: the RPCs added here are additive and the retired ones raise a named
-- exception rather than misbehaving. The token conversion is permanent by
-- design; `economy_transactions` rows with
-- metadata->>'migration' = '047_deterministic_lineage_draft' are the audit
-- trail of exactly what every player received.

-- ---------------------------------------------------------------------------
-- 1. Ascendance: the Yield curve (§8.2, §6.2)
-- ---------------------------------------------------------------------------
--
-- TS lockstep: src/shared/game/ascendance.ts (ascendanceYieldBonus).
-- CEILING 0.30 and the +2% first increment are the Constitution's stated
-- numbers; DECAY is derived from them (1 - 0.02/0.30 = 14/15) rather than
-- tuned separately, which is what makes bonus(4) exactly 0.02 and the sum of
-- every increment exactly 0.30.

CREATE OR REPLACE FUNCTION ascendance_yield_bonus(p_generation INTEGER)
RETURNS NUMERIC AS $$
  SELECT CASE
    WHEN COALESCE(p_generation, 1) < 4 THEN 0::NUMERIC
    ELSE LEAST(
      0.30::NUMERIC,
      round(
        0.30::NUMERIC * (
          1::NUMERIC - power(
            14::NUMERIC / 15::NUMERIC,
            -- Clamped at 500 steps: (14/15)^500 < 1e-15, so the bonus has
            -- already rounded to its ceiling and the exponentiation stays
            -- cheap. Both sides of the lockstep answer 0.3000 there.
            LEAST(GREATEST(COALESCE(p_generation, 1) - 3, 0), 500)::NUMERIC
          )
        ),
        4
      )
    )
  END;
$$ LANGUAGE sql IMMUTABLE SET search_path = public;

COMMENT ON FUNCTION ascendance_yield_bonus(INTEGER) IS
  'Constitution §8.2: 0.30 * (1 - (14/15)^(gen-3)) for gen >= 4, else 0. '
  'Asymptotic at +30%; +2% at Gen4. Never exceeds 0.30.';

CREATE OR REPLACE FUNCTION ascendance_yield_multiplier(p_generation INTEGER)
RETURNS NUMERIC AS $$
  SELECT 1::NUMERIC + ascendance_yield_bonus(p_generation);
$$ LANGUAGE sql IMMUTABLE SET search_path = public;

COMMENT ON FUNCTION ascendance_yield_multiplier(INTEGER) IS
  'The multiplier a run''s full-strength Yield is scaled by. Always >= 1: '
  'Ascendance can only raise a number (Rule 6).';

-- ---------------------------------------------------------------------------
-- 2. Breeding cost: the shipped curve, steepened past Gen3 (§8.2)
-- ---------------------------------------------------------------------------
--
-- TS lockstep: src/shared/game/ascendance.ts (breedingCost).
--   base = 200 + floor((gen1 + gen2) / 2) * 100        [the shipped curve]
--   cost = base * 1.25^max(0, childGeneration - 3)
-- The exponent is 0 for a Gen1-3 child, so today's prices are unchanged.
-- The 1e9 ceiling is an INTEGER-overflow guard, not a design dial.

CREATE OR REPLACE FUNCTION breeding_cost(p_gen1 INTEGER, p_gen2 INTEGER)
RETURNS INTEGER AS $$
DECLARE
  v_g1    INTEGER := GREATEST(COALESCE(p_gen1, 1), 1);
  v_g2    INTEGER := GREATEST(COALESCE(p_gen2, 1), 1);
  v_base  NUMERIC;
  v_steps INTEGER;
BEGIN
  v_base := 200 + ((v_g1 + v_g2) / 2) * 100;
  v_steps := LEAST(GREATEST((GREATEST(v_g1, v_g2) + 1) - 3, 0), 200);
  RETURN LEAST(
    1000000000::NUMERIC,
    ceil(v_base * power(1.25::NUMERIC, v_steps::NUMERIC))
  )::INTEGER;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

COMMENT ON FUNCTION breeding_cost(INTEGER, INTEGER) IS
  'Constitution §8.2: the shipped cost curve, multiplied by 1.25 per '
  'generation past Gen3 so Ascendance spans months. Gen1-3 unchanged.';

-- ---------------------------------------------------------------------------
-- 3. The lineage draft options (§8.2)
-- ---------------------------------------------------------------------------
--
-- TS lockstep: src/shared/game/lineage.ts (lineageDraftOptions). Strength is
-- clamped HERE by the child's rarity and generation, so the strength shown
-- in the preview is the strength written to the row - the old "preview shows
-- uncapped intent, reveal shows the capped roll" gap is closed.

CREATE OR REPLACE FUNCTION lineage_draft_options(
  p_lineage1 JSONB,
  p_lineage2 JSONB,
  p_cross_dynasty BOOLEAN,
  p_rarity TEXT,
  p_generation INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_s1       TEXT;
  v_s2       TEXT;
  v_max      INTEGER;
  v_options  JSONB := '[]'::JSONB;
BEGIN
  v_s1 := COALESCE(p_lineage1 ->> 'primary', p_lineage1 -> 'strains' ->> 0);
  v_s2 := COALESCE(p_lineage2 ->> 'primary', p_lineage2 -> 'strains' ->> 0);
  v_max := GREATEST(
    COALESCE((p_lineage1 ->> 'strength')::INTEGER, 0),
    COALESCE((p_lineage2 ->> 'strength')::INTEGER, 0)
  );

  IF v_s1 IS NULL AND v_s2 IS NULL THEN
    RETURN v_options;
  END IF;

  -- Purebred: the parents agree. One option, strength max(parents) + 1 -
  -- the shipped rule, with nothing left to choose and nothing to roll.
  IF v_s1 IS NOT NULL AND v_s1 = v_s2 THEN
    RETURN jsonb_build_array(jsonb_build_object(
      'kind', 'purebred',
      'strains', jsonb_build_array(v_s1),
      'strength', clamp_lineage_strength(v_max + 1, p_rarity, p_generation)
    ));
  END IF;

  -- Cross-dynasty keeps the shipped DUAL line, first and default. The two
  -- pure lines are offered beside it: §8.2 says the player chooses the
  -- lineage strain from the parents' strains, and refusing the choice would
  -- be the old system wearing a menu.
  IF COALESCE(p_cross_dynasty, FALSE) AND v_s1 IS NOT NULL AND v_s2 IS NOT NULL THEN
    v_options := v_options || jsonb_build_array(jsonb_build_object(
      'kind', 'dual',
      'strains', jsonb_build_array(v_s1, v_s2),
      'strength', clamp_lineage_strength(v_max, p_rarity, p_generation)
    ));
  END IF;

  IF v_s1 IS NOT NULL THEN
    v_options := v_options || jsonb_build_array(jsonb_build_object(
      'kind', 'parent1',
      'strains', jsonb_build_array(v_s1),
      'strength', clamp_lineage_strength(v_max, p_rarity, p_generation)
    ));
  END IF;

  IF v_s2 IS NOT NULL THEN
    v_options := v_options || jsonb_build_array(jsonb_build_object(
      'kind', 'parent2',
      'strains', jsonb_build_array(v_s2),
      'strength', clamp_lineage_strength(v_max, p_rarity, p_generation)
    ));
  END IF;

  RETURN v_options;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- ---------------------------------------------------------------------------
-- 4. breeding_draft: the whole outcome, before payment (§8.2, R11)
-- ---------------------------------------------------------------------------
--
-- The single source of truth for what a pairing produces. STABLE and
-- writeless: it can be called for a preview as often as the UI likes, and
-- `breed_snakes` calls it for the commit. Given the same parents and the
-- same choices it returns the same JSONB every time - there is no seed, no
-- clock and no RNG anywhere in it, because a draft has nothing to randomize.
--
-- Choice arguments are optional. Omitting one selects the FIRST option in
-- canonical order, which is itself deterministic and is published in the
-- `defaults` block, so a client that sends no choices still sees exactly
-- what it will get.

CREATE OR REPLACE FUNCTION breeding_draft(
  p_player_id UUID,
  p_parent1_id UUID,
  p_parent2_id UUID,
  p_allow_cross_dynasty BOOLEAN DEFAULT FALSE,
  p_variant_choice UUID DEFAULT NULL,
  p_trait_draft TEXT[] DEFAULT NULL,
  p_lineage_kind TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_parent1        RECORD;
  v_parent2        RECORD;
  v_cross          BOOLEAN;
  v_generation     INTEGER;
  v_cost           INTEGER;
  v_lin1           JSONB;
  v_lin2           JSONB;
  v_trait_pool     JSONB := '[]'::JSONB;
  v_pool_ids       TEXT[];
  v_variants       JSONB := '[]'::JSONB;
  v_variant        RECORD;
  v_slots          INTEGER;
  v_lineage_opts   JSONB;
  v_chosen_variant UUID;
  v_chosen_rarity  TEXT;
  v_chosen_slots   INTEGER;
  v_chosen_opts    JSONB;
  v_chosen_lineage JSONB;
  v_lineage_kind   TEXT;
  v_default_traits TEXT[];
  v_traits         TEXT[];
  v_trait          TEXT;
BEGIN
  IF p_parent1_id = p_parent2_id THEN
    RAISE EXCEPTION 'Cannot breed snake with itself';
  END IF;

  SELECT cs.id, cs.generation, cs.traits, cs.lineage,
         sv.id AS variant_id, sv.name AS variant_name, sv.rarity AS rarity,
         sv.dynasty_id AS dynasty_id, sv.lineage_strain AS lineage_strain,
         sv.affinity_strength AS affinity_strength
  INTO v_parent1
  FROM collected_snakes cs
  JOIN snake_variants sv ON cs.snake_variant_id = sv.id
  WHERE cs.id = p_parent1_id AND cs.player_id = p_player_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent 1 not found or not owned';
  END IF;

  SELECT cs.id, cs.generation, cs.traits, cs.lineage,
         sv.id AS variant_id, sv.name AS variant_name, sv.rarity AS rarity,
         sv.dynasty_id AS dynasty_id, sv.lineage_strain AS lineage_strain,
         sv.affinity_strength AS affinity_strength
  INTO v_parent2
  FROM collected_snakes cs
  JOIN snake_variants sv ON cs.snake_variant_id = sv.id
  WHERE cs.id = p_parent2_id AND cs.player_id = p_player_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent 2 not found or not owned';
  END IF;

  v_cross := v_parent1.dynasty_id IS DISTINCT FROM v_parent2.dynasty_id;
  IF v_cross AND NOT COALESCE(p_allow_cross_dynasty, FALSE) THEN
    RAISE EXCEPTION 'Parents must be same dynasty';
  END IF;

  -- Generations are UNCAPPED (§8.2). The old `> 50` refusal is gone.
  v_generation := GREATEST(v_parent1.generation, v_parent2.generation) + 1;
  v_cost := breeding_cost(v_parent1.generation, v_parent2.generation);

  v_lin1 := effective_lineage(v_parent1.lineage, v_parent1.lineage_strain,
                              v_parent1.affinity_strength);
  v_lin2 := effective_lineage(v_parent2.lineage, v_parent2.lineage_strain,
                              v_parent2.affinity_strength);

  -- The draft board: the union of both parents' ACTIVE traits, ordered by
  -- first appearance - parent 1's stored order, then parent 2's additions.
  -- Offsetting parent 2's ordinality by 1e6 makes "parent 1 first" a
  -- property of the data rather than of the query plan.
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object('trait_id', pool.trait_id, 'source', pool.source)
             ORDER BY pool.ord
           ),
           '[]'::JSONB
         ),
         COALESCE(array_agg(pool.trait_id ORDER BY pool.ord), ARRAY[]::TEXT[])
  INTO v_trait_pool, v_pool_ids
  FROM (
    SELECT u.t AS trait_id,
           MIN(u.ord) AS ord,
           CASE
             WHEN bool_or(u.side = 1) AND bool_or(u.side = 2) THEN 'both'
             WHEN bool_or(u.side = 1) THEN 'parent1'
             ELSE 'parent2'
           END AS source
    FROM (
      SELECT t, ord, 1 AS side
      FROM unnest(COALESCE(v_parent1.traits, ARRAY[]::TEXT[]))
        WITH ORDINALITY AS p1(t, ord)
      UNION ALL
      SELECT t, ord + 1000000, 2
      FROM unnest(COALESCE(v_parent2.traits, ARRAY[]::TEXT[]))
        WITH ORDINALITY AS p2(t, ord)
    ) u
    WHERE u.t IN (SELECT id FROM trait_definitions WHERE active)
    GROUP BY u.t
  ) pool;

  -- One entry per selectable variant line, each carrying everything that
  -- follows from choosing it: slot count and lineage options at that rarity.
  FOR v_variant IN
    SELECT * FROM (
      SELECT 1 AS ord, v_parent1.variant_id AS id, v_parent1.variant_name AS name,
             v_parent1.rarity AS rarity, v_parent1.dynasty_id AS dynasty_id
      UNION ALL
      SELECT 2, v_parent2.variant_id, v_parent2.variant_name,
             v_parent2.rarity, v_parent2.dynasty_id
      WHERE v_parent2.variant_id <> v_parent1.variant_id
    ) lines ORDER BY ord
  LOOP
    v_slots := get_trait_slots(v_variant.rarity, v_generation);
    v_lineage_opts := lineage_draft_options(v_lin1, v_lin2, v_cross,
                                            v_variant.rarity, v_generation);
    v_variants := v_variants || jsonb_build_array(jsonb_build_object(
      'variant_id', v_variant.id,
      'name', v_variant.name,
      'rarity', v_variant.rarity,
      'dynasty_id', v_variant.dynasty_id,
      'trait_slots', v_slots,
      'lineage_options', v_lineage_opts
    ));
  END LOOP;

  -- ---- resolve the choices -------------------------------------------------
  v_chosen_variant := COALESCE(p_variant_choice,
                               (v_variants -> 0 ->> 'variant_id')::UUID);
  SELECT opt.value ->> 'rarity',
         (opt.value ->> 'trait_slots')::INTEGER,
         opt.value -> 'lineage_options'
  INTO v_chosen_rarity, v_chosen_slots, v_chosen_opts
  FROM jsonb_array_elements(v_variants) AS opt(value)
  WHERE (opt.value ->> 'variant_id')::UUID = v_chosen_variant;
  IF v_chosen_rarity IS NULL THEN
    RAISE EXCEPTION 'Variant % is not one of the parents'' lines', v_chosen_variant;
  END IF;

  v_default_traits := (COALESCE(v_pool_ids, ARRAY[]::TEXT[]))[1:v_chosen_slots];

  IF p_trait_draft IS NULL THEN
    v_traits := v_default_traits;
  ELSE
    v_traits := ARRAY[]::TEXT[];
    FOREACH v_trait IN ARRAY p_trait_draft LOOP
      IF NOT (v_trait = ANY(COALESCE(v_pool_ids, ARRAY[]::TEXT[]))) THEN
        RAISE EXCEPTION 'Trait % is not in the parents'' draft pool', v_trait;
      END IF;
      IF v_trait = ANY(v_traits) THEN
        RAISE EXCEPTION 'Trait % drafted twice', v_trait;
      END IF;
      v_traits := array_append(v_traits, v_trait);
    END LOOP;
    IF COALESCE(array_length(v_traits, 1), 0) > v_chosen_slots THEN
      RAISE EXCEPTION 'Drafted % traits into % slot(s)',
        array_length(v_traits, 1), v_chosen_slots;
    END IF;
  END IF;

  IF jsonb_array_length(v_chosen_opts) = 0 THEN
    IF p_lineage_kind IS NOT NULL THEN
      RAISE EXCEPTION 'This pairing has no lineage to draft';
    END IF;
    v_chosen_lineage := NULL;
    v_lineage_kind := NULL;
  ELSE
    v_lineage_kind := COALESCE(p_lineage_kind, v_chosen_opts -> 0 ->> 'kind');
    SELECT jsonb_build_object('strains', opt.value -> 'strains',
                              'strength', (opt.value ->> 'strength')::INTEGER)
    INTO v_chosen_lineage
    FROM jsonb_array_elements(v_chosen_opts) AS opt(value)
    WHERE opt.value ->> 'kind' = v_lineage_kind;
    IF v_chosen_lineage IS NULL THEN
      RAISE EXCEPTION 'Lineage option % is not available for this pairing',
        v_lineage_kind;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'parent1_id', p_parent1_id,
    'parent2_id', p_parent2_id,
    'cross_dynasty', v_cross,
    'generation', v_generation,
    'dna_cost', v_cost,
    'ascendance', jsonb_build_object(
      'generation', v_generation,
      'yield_bonus', ascendance_yield_bonus(v_generation),
      'yield_multiplier', ascendance_yield_multiplier(v_generation)
    ),
    'trait_pool', v_trait_pool,
    'variant_options', v_variants,
    'defaults', jsonb_build_object(
      'variant_id', (v_variants -> 0 ->> 'variant_id'),
      'traits', to_jsonb(
        (COALESCE(v_pool_ids, ARRAY[]::TEXT[]))[
          1:(v_variants -> 0 ->> 'trait_slots')::INTEGER]),
      'lineage_kind', (v_variants -> 0 -> 'lineage_options' -> 0 ->> 'kind')
    ),
    -- THE PREVIEW. breed_snakes writes this object and nothing else.
    'preview', jsonb_build_object(
      'variant_id', v_chosen_variant,
      'rarity', v_chosen_rarity,
      'generation', v_generation,
      'trait_slots', v_chosen_slots,
      'traits', to_jsonb(v_traits),
      'lineage', v_chosen_lineage,
      'lineage_kind', v_lineage_kind,
      'dna_cost', v_cost
    ),
    'parents', jsonb_build_object(
      'parent1', jsonb_build_object('generation', v_parent1.generation,
                                    'lineage', v_lin1),
      'parent2', jsonb_build_object('generation', v_parent2.generation,
                                    'lineage', v_lin2)
    )
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION breeding_draft(UUID, UUID, UUID, BOOLEAN, UUID, TEXT[], TEXT) IS
  'Constitution §8.2: the deterministic breeding draft. Enumerates every '
  'option and resolves the chosen one. No RNG, no seed, no clock - '
  'breed_snakes persists this function''s `preview` verbatim.';

REVOKE EXECUTE ON FUNCTION breeding_draft(UUID, UUID, UUID, BOOLEAN, UUID, TEXT[], TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION breeding_draft(UUID, UUID, UUID, BOOLEAN, UUID, TEXT[], TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION breeding_draft(UUID, UUID, UUID, BOOLEAN, UUID, TEXT[], TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION breeding_draft(UUID, UUID, UUID, BOOLEAN, UUID, TEXT[], TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. breed_snakes v4: pay for the draft you were shown (§8.2, R11)
-- ---------------------------------------------------------------------------
--
-- The old 3- and 4-argument signatures are dropped: a caller that named no
-- choices used to get a coin flip, and silently keeping that door open would
-- keep the randomness reachable. The new signature defaults every choice, so
-- an unchanged caller now gets the FIRST option in canonical order - a
-- documented, previewable outcome instead of a hidden one.

DROP FUNCTION IF EXISTS breed_snakes(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS breed_snakes(UUID, UUID, UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION breed_snakes(
  p_player_id UUID,
  p_parent1_id UUID,
  p_parent2_id UUID,
  p_allow_cross_dynasty BOOLEAN DEFAULT FALSE,
  p_variant_choice UUID DEFAULT NULL,
  p_trait_draft TEXT[] DEFAULT NULL,
  p_lineage_kind TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_draft       JSONB;
  v_preview     JSONB;
  v_cost        INTEGER;
  v_player_dna  INTEGER;
  v_new_balance INTEGER;
  v_traits      TEXT[];
  v_lineage     JSONB;
  v_offspring   UUID;
BEGIN
  -- Lock the parents for the duration; the draft below reads them again and
  -- cannot see a concurrent edit between the preview and the write.
  PERFORM 1 FROM collected_snakes
  WHERE id IN (p_parent1_id, p_parent2_id) AND player_id = p_player_id
  FOR UPDATE;

  -- ONE computation of the outcome, shared with the preview endpoint.
  v_draft := breeding_draft(p_player_id, p_parent1_id, p_parent2_id,
                            p_allow_cross_dynasty, p_variant_choice,
                            p_trait_draft, p_lineage_kind);
  v_preview := v_draft -> 'preview';
  v_cost := (v_preview ->> 'dna_cost')::INTEGER;

  SELECT dna INTO v_player_dna FROM players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;
  IF v_player_dna < v_cost THEN
    RAISE EXCEPTION 'Insufficient DNA: need %, have %', v_cost, v_player_dna;
  END IF;

  SELECT COALESCE(array_agg(drafted.value ORDER BY drafted.ord), ARRAY[]::TEXT[])
  INTO v_traits
  FROM jsonb_array_elements_text(v_preview -> 'traits')
    WITH ORDINALITY AS drafted(value, ord);

  v_lineage := CASE WHEN jsonb_typeof(v_preview -> 'lineage') = 'object'
                    THEN v_preview -> 'lineage' ELSE NULL END;

  UPDATE players
  SET dna = dna - v_cost,
      breeds_completed = COALESCE(breeds_completed, 0) + 1
  WHERE id = p_player_id
  RETURNING dna INTO v_new_balance;

  INSERT INTO economy_transactions (player_id, resource_type, amount, balance_after, source_type, metadata)
  VALUES (p_player_id, 'dna', -v_cost, v_new_balance, 'breeding_cost',
          jsonb_build_object('parent1_id', p_parent1_id, 'parent2_id', p_parent2_id));

  INSERT INTO collected_snakes (
    player_id, snake_variant_id, generation, parent1_id, parent2_id,
    acquired_method, is_equipped, is_favorited, traits, lineage
  ) VALUES (
    p_player_id,
    (v_preview ->> 'variant_id')::UUID,
    (v_preview ->> 'generation')::INTEGER,
    p_parent1_id, p_parent2_id, 'bred', false, false, v_traits, v_lineage
  ) RETURNING id INTO v_offspring;

  -- The audit row records the DRAFT, not a roll: `trait_rolls` keeps its
  -- column name (applied history is not editable) but now holds the board
  -- the player was shown and the choices they made.
  INSERT INTO breeding_history (player_id, parent1_id, parent2_id, child_id, dna_cost, trait_rolls)
  VALUES (p_player_id, p_parent1_id, p_parent2_id, v_offspring, v_cost,
          jsonb_build_object(
            'draft', jsonb_build_object(
              'trait_pool', v_draft -> 'trait_pool',
              'variant_options', v_draft -> 'variant_options'
            ),
            'slots', (v_preview ->> 'trait_slots')::INTEGER,
            'chosen', to_jsonb(v_traits),
            'lineage', jsonb_build_object(
              'parent1', v_draft -> 'parents' -> 'parent1' -> 'lineage',
              'parent2', v_draft -> 'parents' -> 'parent2' -> 'lineage',
              'child', v_lineage,
              'kind', v_preview ->> 'lineage_kind'
            ),
            'preview', v_preview
          ));

  RETURN v_offspring;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION breed_snakes(UUID, UUID, UUID, BOOLEAN, UUID, TEXT[], TEXT) IS
  'Constitution §8.2: persists breeding_draft()''s preview verbatim. The '
  'child a player receives is the child they were shown.';

REVOKE EXECUTE ON FUNCTION breed_snakes(UUID, UUID, UUID, BOOLEAN, UUID, TEXT[], TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION breed_snakes(UUID, UUID, UUID, BOOLEAN, UUID, TEXT[], TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION breed_snakes(UUID, UUID, UUID, BOOLEAN, UUID, TEXT[], TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION breed_snakes(UUID, UUID, UUID, BOOLEAN, UUID, TEXT[], TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. The rerolls are retired (§8.2)
-- ---------------------------------------------------------------------------
--
-- Tombstones rather than DROPs: the names stay resolvable so a stale client
-- or a stale PostgREST schema cache gets a named refusal instead of a
-- confusing 404, and the live definition of each is visibly free of RNG for
-- anyone (or any gate) reading the migration history forward.

CREATE OR REPLACE FUNCTION reroll_lineage(
  p_player_id UUID,
  p_snake_id UUID
) RETURNS JSONB AS $$
BEGIN
  RAISE EXCEPTION
    'LINEAGE_REROLL_RETIRED: breeding is a deterministic draft (Constitution §8.2); '
    'held reroll tokens were converted to DNA by migration 047';
END;
$$ LANGUAGE plpgsql SET search_path = public;

REVOKE EXECUTE ON FUNCTION reroll_lineage(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reroll_lineage(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION reroll_lineage(UUID, UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION reroll_lineage(UUID, UUID) FROM service_role;

CREATE OR REPLACE FUNCTION reroll_trait(
  p_player_id UUID,
  p_snake_id UUID,
  p_slot INTEGER
) RETURNS TEXT[] AS $$
BEGIN
  RAISE EXCEPTION
    'TRAIT_REROLL_RETIRED: traits are drafted at breeding time (Constitution §8.2); '
    'held reroll tokens were converted to DNA by migration 047';
END;
$$ LANGUAGE plpgsql SET search_path = public;

REVOKE EXECUTE ON FUNCTION reroll_trait(UUID, UUID, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reroll_trait(UUID, UUID, INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION reroll_trait(UUID, UUID, INTEGER) FROM authenticated;
REVOKE EXECUTE ON FUNCTION reroll_trait(UUID, UUID, INTEGER) FROM service_role;

-- The RNG the old breeding path shared. Nothing calls it after this file.
DROP FUNCTION IF EXISTS pick_random_trait(TEXT[]);

-- ---------------------------------------------------------------------------
-- 7. Reroll tokens -> 150 DNA (§8.2: "their old price"). A CONVERSION.
-- ---------------------------------------------------------------------------

ALTER TABLE economy_transactions DROP CONSTRAINT IF EXISTS economy_transactions_source_type_check;
ALTER TABLE economy_transactions ADD CONSTRAINT economy_transactions_source_type_check CHECK (source_type IN (
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
  'lineage_reroll',
  'codex_discovery',
  'reroll_token_conversion'
));

-- Snapshot first. Everything after this is checked against it.
CREATE TEMP TABLE wp_1_05_tokens_pre ON COMMIT DROP AS
SELECT id AS player_id,
       dna AS dna_before,
       COALESCE(player_reroll_tokens, 0) AS tokens_before,
       COALESCE(player_reroll_tokens, 0) * 150 AS owed_dna
FROM players;

CREATE INDEX ON wp_1_05_tokens_pre (player_id);

UPDATE players p
SET dna = p.dna + pre.owed_dna,
    player_reroll_tokens = 0
FROM wp_1_05_tokens_pre pre
WHERE p.id = pre.player_id
  AND pre.tokens_before > 0;

INSERT INTO economy_transactions (
  player_id, resource_type, amount, balance_after, source_type, metadata
)
SELECT pre.player_id, 'dna', pre.owed_dna, p.dna, 'reroll_token_conversion',
       jsonb_build_object(
         'migration', '047_deterministic_lineage_draft',
         'tokens', pre.tokens_before,
         'rate_dna_per_token', 150
       )
FROM wp_1_05_tokens_pre pre
JOIN players p ON p.id = pre.player_id
WHERE pre.tokens_before > 0;

DO $$
DECLARE
  v_bad        BIGINT;
  v_owed_total BIGINT;
  v_paid_total BIGINT;
BEGIN
  -- (a) THE ACCEPTANCE CRITERION. Every player's DNA rose by EXACTLY the
  --     converted value of the tokens they held. A shortfall is value
  --     confiscated (Rule 6); a surplus is value minted (Rule 3).
  SELECT COUNT(*) INTO v_bad
  FROM wp_1_05_tokens_pre pre
  JOIN players p ON p.id = pre.player_id
  WHERE p.dna <> pre.dna_before + pre.owed_dna;
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'WP-1.05 aborted: % player(s) settled to the wrong DNA balance - reroll token value was NOT preserved', v_bad;
  END IF;

  -- (b) No player is poorer than they started. Stated separately from (a)
  --     so the intent survives any future edit to the rate.
  SELECT COUNT(*) INTO v_bad
  FROM wp_1_05_tokens_pre pre
  JOIN players p ON p.id = pre.player_id
  WHERE p.dna < pre.dna_before;
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'WP-1.05 aborted: % player(s) lost DNA in a conversion (Rule 6)', v_bad;
  END IF;

  -- (c) The ledger says the same thing in aggregate, so the deploy log
  --     carries the number that was granted.
  SELECT COALESCE(SUM(owed_dna), 0) INTO v_owed_total FROM wp_1_05_tokens_pre;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid_total
  FROM economy_transactions
  WHERE source_type = 'reroll_token_conversion'
    AND metadata ->> 'migration' = '047_deterministic_lineage_draft';
  IF v_paid_total <> v_owed_total THEN
    RAISE EXCEPTION
      'WP-1.05 aborted: conversion ledger records % DNA but % DNA was owed', v_paid_total, v_owed_total;
  END IF;

  -- (d) No token survives the conversion; none was invented.
  SELECT COUNT(*) INTO v_bad
  FROM players WHERE COALESCE(player_reroll_tokens, 0) <> 0;
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'WP-1.05 aborted: % player(s) still hold reroll tokens after conversion', v_bad;
  END IF;

  RAISE NOTICE 'WP-1.05: converted % DNA of reroll tokens across % player(s)',
    v_owed_total,
    (SELECT COUNT(*) FROM wp_1_05_tokens_pre WHERE tokens_before > 0);
END $$;

COMMENT ON COLUMN players.player_reroll_tokens IS
  'RETIRED (Constitution §8.2, migration 047). Zeroed and converted to DNA '
  'at 150 each; nothing mints tokens after this migration. The column is '
  'kept so the conversion ledger can be reconciled against a real balance.';

-- ---------------------------------------------------------------------------
-- 8. The season track stops minting a retired reward (§8.2)
-- ---------------------------------------------------------------------------
--
-- Five Season 1 free-track milestones (levels 5, 10, 15, 20, 25) paid a
-- trait-reroll token. Unclaimed rows are removed rather than left offering
-- something that no longer exists; CLAIMED rows stay exactly where they are,
-- because a claim is history and history is never rewritten (Rule 6). The
-- reward_type CHECK is left intact for the same reason: claimed rows still
-- carry the value.

DELETE FROM battle_pass_tiers t
WHERE t.reward_type = 'reroll_token'
  AND NOT EXISTS (
    SELECT 1 FROM player_battle_pass_claims c WHERE c.tier_id = t.id
  );

-- claim_season_tier - body carried over verbatim from migration 044
-- (lines 715-817). One edit: the `reroll_token` grant branch is removed
-- along with the `v_tokens` local it filled, and the returned
-- `reroll_tokens` key becomes a constant 0 so the response shape is
-- unchanged for any client still reading it. Every entitlement rule, the
-- lapsed-subscriber goodwill clause, the free-then-premium claim order, the
-- idempotency check and the cosmetic/title inventory grant are carryovers.

CREATE OR REPLACE FUNCTION claim_season_tier(p_player_id UUID, p_level INTEGER)
RETURNS JSONB AS $$
DECLARE
  v_season battle_pass_seasons%ROWTYPE;
  v_tier battle_pass_tiers%ROWTYPE;
  v_pbp player_battle_pass%ROWTYPE;
  v_player RECORD;
  v_has_premium BOOLEAN;
BEGIN
  SELECT * INTO v_season FROM battle_pass_seasons s
  WHERE s.is_active AND NOW() >= s.starts_at AND NOW() < s.ends_at
  ORDER BY s.season_number DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_ACTIVE_SEASON';
  END IF;

  SELECT * INTO v_pbp FROM player_battle_pass pbp
  WHERE pbp.player_id = p_player_id AND pbp.season_id = v_season.id;

  v_has_premium := has_premium(p_player_id);

  -- Free tier at the level, else the premium tier when entitled
  SELECT * INTO v_tier FROM battle_pass_tiers t
  WHERE t.season_id = v_season.id AND t.level = p_level
    AND (
      t.is_premium = false
      OR v_has_premium
      OR (v_pbp.id IS NOT NULL AND v_pbp.is_premium)
    )
  ORDER BY t.is_premium ASC;  -- claim free first; a second call claims premium
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_TIER_AT_LEVEL';
  END IF;

  SELECT * INTO v_player FROM players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAYER_NOT_FOUND';
  END IF;

  IF v_pbp.id IS NULL OR v_pbp.current_level < p_level THEN
    RAISE EXCEPTION 'LEVEL_NOT_REACHED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM player_battle_pass_claims c
    WHERE c.player_id = p_player_id AND c.tier_id = v_tier.id
  ) THEN
    -- The free tier at this level is claimed - try the premium tier
    SELECT * INTO v_tier FROM battle_pass_tiers t
    WHERE t.season_id = v_season.id AND t.level = p_level AND t.is_premium = true
      AND (v_has_premium OR v_pbp.is_premium)
      AND NOT EXISTS (
        SELECT 1 FROM player_battle_pass_claims c
        WHERE c.player_id = p_player_id AND c.tier_id = t.id
      );
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ALREADY_CLAIMED';
    END IF;
  END IF;

  -- Lock in the season for subscribers claiming premium tiers (goodwill
  -- rule: a season entered premium stays premium for this player)
  IF v_tier.is_premium AND v_has_premium AND NOT v_pbp.is_premium THEN
    UPDATE player_battle_pass
    SET is_premium = true,
        premium_purchased_at = COALESCE(premium_purchased_at, NOW()),
        updated_at = NOW()
    WHERE id = v_pbp.id;
  END IF;

  -- WP-0.03 removed the `dna` and `energy` grant branches; WP-1.05 removes
  -- the `reroll_token` branch (§8.2: rerolls are retired). The track pays
  -- identity only: a variant, a cosmetic, or a title.

  -- Identity v1 (022): cosmetic/title rewards become INVENTORY the equip
  -- flow can read - the claim row remains the claim-idempotency record.
  IF v_tier.reward_type IN ('cosmetic', 'title') AND v_tier.reward_id IS NOT NULL THEN
    INSERT INTO player_cosmetics (player_id, cosmetic_id, source)
    SELECT p_player_id, v_tier.reward_id, 'season_track'
    WHERE EXISTS (SELECT 1 FROM cosmetic_definitions WHERE id = v_tier.reward_id)
    ON CONFLICT (player_id, cosmetic_id) DO NOTHING;
  END IF;

  INSERT INTO player_battle_pass_claims (player_id, season_id, tier_id)
  VALUES (p_player_id, v_season.id, v_tier.id);

  RETURN jsonb_build_object(
    'level', p_level,
    'is_premium', v_tier.is_premium,
    'reward_type', v_tier.reward_type,
    'reward_id', v_tier.reward_id,
    'reward_amount', v_tier.reward_amount,
    'reroll_tokens', 0
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
