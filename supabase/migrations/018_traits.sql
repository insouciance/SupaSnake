-- ============================================================================
-- Migration 018: Traits & Breeding Rework (Design v2 Phase 3A)
-- GAME_DESIGN_V2.md section 6 - traits replace generation stats: permanent,
-- snake-bound sidegrades. Breeding becomes trait crafting.
--
-- 1. trait_definitions: the Launch Eight (section 6.2), params JSONB carries
--    the tuning constants mirrored in src/shared/game/traits.ts
-- 2. collected_snakes.traits TEXT[] (slot order matters; hard cap 2)
--    + get_trait_slots(rarity, generation): common/uncommon 1, rare+ 2,
--    Gen 3+ always 2 (section 6.1 - generation = prestige + slot unlock)
-- 3. breed_snakes rework: offspring rolls ONE random trait from EACH
--    parent's pool (slot cap + dedupe respected, empty pools contribute
--    nothing); the roll and both parent pools are recorded in
--    breeding_history.trait_rolls so reroll can redraw from them later
-- 4. unlock_variant: wild rolls (section 6.3) - non-starter unlocks roll
--    1 trait (commons/uncommons) or 2 (rare+); starters stay traitless
-- 5. reroll_trait RPC + players.player_reroll_tokens (default 0; this
--    migration gifts 2 to every existing player - seasonal-track grants
--    arrive in Phase 4)
--
-- Randomness: gen_random_uuid()-derived (hashtextextended of a fresh
-- UUID), uniform over the pool. Breeding stays random per the doc; the
-- roll is recorded in breeding_history for audit + reroll.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TRAIT DEFINITIONS: the Launch Eight (section 6.2)
--    taxonomy: 'E' = economic (exact server recompute), 'P' = physical
--    (engine-only), 'mixed' = both sides
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS trait_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  taxonomy TEXT NOT NULL CHECK (taxonomy IN ('E', 'P', 'mixed')),
  params JSONB NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE trait_definitions ENABLE ROW LEVEL SECURITY;

-- Catalog data: readable by everyone, written only by service role
DROP POLICY IF EXISTS trait_definitions_select_all ON trait_definitions;
CREATE POLICY trait_definitions_select_all ON trait_definitions
  FOR SELECT USING (true);

INSERT INTO trait_definitions (id, name, description, taxonomy, params) VALUES
  ('scavenger', 'Scavenger',
   'First 15 foods +30% DNA. Tradeoff: foods after 50 pay −10%.',
   'E',
   '{"earlyFoods": 15, "earlyBonus": 1.3, "lateAfterFood": 50, "latePenalty": 0.9}'),
  ('gambler', 'Gambler',
   'Banked multiplier ×1.25 → ×1.35. Tradeoff: death salvage ×0.60 → ×0.45.',
   'E',
   '{"bankDelta": 0.10, "deathDelta": -0.15}'),
  ('ascetic', 'Ascetic',
   'All food ×1.4 base value. Tradeoff: mutation foods never spawn — no builds, pure snake.',
   'mixed',
   '{"foodBonus": 1.4, "mutationFoodSpawns": false}'),
  ('iron_scales', 'Iron Scales',
   'Survive one wall collision per run (bounce back one cell). Tradeoff: food −10% DNA.',
   'mixed',
   '{"wallSavesPerRun": 1, "bounceCells": 1, "foodPenalty": 0.9}'),
  ('magnetism', 'Magnetism',
   'Food within 1 cell is pulled toward the head. Tradeoff: exit portal interval +2 foods.',
   'P',
   '{"radius": 1, "portalIntervalPenalty": 2}'),
  ('sprinter', 'Sprinter',
   'First 10 foods ×1.2 (dynasty-agnostic by design). Tradeoff: foods after 50 ×0.9.',
   'E',
   '{"earlyFoods": 10, "earlyBonus": 1.2, "lateAfterFood": 50, "latePenalty": 0.9}'),
  ('patient', 'Patient',
   'Banked bonus +10% (×1.25 → ×1.35, stacks with Gambler to ×1.45). Tradeoff: mutation food spawn rate −50%.',
   'mixed',
   '{"bankDelta": 0.10, "mutationIntervalMultiplier": 2}'),
  ('hoarder', 'Hoarder',
   'Death salvage 70% (vs 60%). Tradeoff: bank bonus +15% (vs +25%) — low variance both ways.',
   'E',
   '{"bankDelta": -0.10, "deathDelta": 0.10}')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. COLLECTED_SNAKES: trait slots (section 6.1)
--    All existing snakes (starters included) are seeded traitless.
-- ----------------------------------------------------------------------------

ALTER TABLE collected_snakes
  ADD COLUMN IF NOT EXISTS traits TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE collected_snakes DROP CONSTRAINT IF EXISTS collected_snakes_traits_cap;
ALTER TABLE collected_snakes ADD CONSTRAINT collected_snakes_traits_cap
  CHECK (COALESCE(array_length(traits, 1), 0) <= 2);

-- Slot rule (section 6.1): common/uncommon variants 1 slot, rare and above
-- 2 slots; at prestige Gen 3 a lineage gains its 2nd slot regardless of
-- rarity. Hard cap 2. Mirrors getTraitSlots in src/shared/game/traits.ts.
CREATE OR REPLACE FUNCTION get_trait_slots(p_rarity TEXT, p_generation INTEGER)
RETURNS INTEGER AS $$
  SELECT LEAST(2, CASE
    WHEN COALESCE(p_generation, 1) >= 3 THEN 2
    WHEN lower(COALESCE(p_rarity, 'common')) IN ('rare', 'epic', 'legendary') THEN 2
    ELSE 1
  END);
$$ LANGUAGE sql IMMUTABLE;

-- ----------------------------------------------------------------------------
-- 3. RANDOM TRAIT PICK: gen_random_uuid()-derived uniform index.
--    Randomness affects WHICH trait is inherited, never any payout math;
--    every roll is recorded in breeding_history.trait_rolls.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pick_random_trait(p_pool TEXT[])
RETURNS TEXT AS $$
DECLARE
  v_len INTEGER := COALESCE(array_length(p_pool, 1), 0);
  v_idx INTEGER;
BEGIN
  IF v_len = 0 THEN
    RETURN NULL;
  END IF;
  v_idx := 1 + (mod(abs(hashtextextended(gen_random_uuid()::text, 0)), v_len))::INTEGER;
  RETURN p_pool[v_idx];
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ----------------------------------------------------------------------------
-- 4. BREEDING HISTORY: record the trait roll (pools + result + rerolls)
-- ----------------------------------------------------------------------------

ALTER TABLE breeding_history
  ADD COLUMN IF NOT EXISTS trait_rolls JSONB;

-- ----------------------------------------------------------------------------
-- 5. PLAYERS: reroll tokens (earned on the free seasonal track from Phase
--    4; default 0). Starter gift: +2 to every existing player so the
--    crafting loop is testable at launch.
-- ----------------------------------------------------------------------------

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS player_reroll_tokens INTEGER NOT NULL DEFAULT 0
  CHECK (player_reroll_tokens >= 0);

UPDATE players SET player_reroll_tokens = player_reroll_tokens + 2;

-- ----------------------------------------------------------------------------
-- 6. breed_snakes: same signature + economics as migration 009, now with
--    trait inheritance (section 6.3):
--    - offspring rolls ONE random trait from EACH parent's trait pool
--      (slot 1 from parent A, slot 2 - if unlocked - from parent B)
--    - duplicates collapse, the slot cap truncates, an empty-pool parent
--      contributes nothing (the other parent's roll then leads)
--    - pools, slots, and the rolled result land in
--      breeding_history.trait_rolls for audit + reroll
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION breed_snakes(
  p_player_id UUID,
  p_parent1_id UUID,
  p_parent2_id UUID
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
  v_traits TEXT[] := '{}';
BEGIN
  IF p_parent1_id = p_parent2_id THEN
    RAISE EXCEPTION 'Cannot breed snake with itself';
  END IF;

  SELECT cs.*, sv.dynasty_id AS v_dynasty_id, sv.id AS v_variant_id
  INTO v_parent1
  FROM collected_snakes cs
  JOIN snake_variants sv ON cs.snake_variant_id = sv.id
  WHERE cs.id = p_parent1_id AND cs.player_id = p_player_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent 1 not found or not owned';
  END IF;

  SELECT cs.*, sv.dynasty_id AS v_dynasty_id, sv.id AS v_variant_id
  INTO v_parent2
  FROM collected_snakes cs
  JOIN snake_variants sv ON cs.snake_variant_id = sv.id
  WHERE cs.id = p_parent2_id AND cs.player_id = p_player_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent 2 not found or not owned';
  END IF;

  IF v_parent1.v_dynasty_id != v_parent2.v_dynasty_id THEN
    RAISE EXCEPTION 'Parents must be same dynasty';
  END IF;

  v_dna_cost := 200 + ((v_parent1.generation + v_parent2.generation) / 2) * 100;

  SELECT dna INTO v_player_dna FROM players WHERE id = p_player_id FOR UPDATE;
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

  -- Trait inheritance (section 6.3): parent pools restricted to active
  -- trait definitions (defensive - the app never writes unknown ids)
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

  UPDATE players
  SET dna = dna - v_dna_cost,
      breeds_completed = COALESCE(breeds_completed, 0) + 1
  WHERE id = p_player_id
  RETURNING dna INTO v_new_balance;

  INSERT INTO economy_transactions (player_id, resource_type, amount, balance_after, source_type, metadata)
  VALUES (p_player_id, 'dna', -v_dna_cost, v_new_balance, 'breeding_cost',
          jsonb_build_object('parent1_id', p_parent1_id, 'parent2_id', p_parent2_id));

  INSERT INTO collected_snakes (
    player_id, snake_variant_id, generation, acquired_method, is_equipped, is_favorited, traits
  ) VALUES (
    p_player_id, v_offspring_variant_id, v_offspring_gen, 'bred', false, false, v_traits
  ) RETURNING id INTO v_offspring_id;

  INSERT INTO breeding_history (player_id, parent1_id, parent2_id, child_id, dna_cost, trait_rolls)
  VALUES (p_player_id, p_parent1_id, p_parent2_id, v_offspring_id, v_dna_cost,
          jsonb_build_object(
            'parent1_pool', to_jsonb(v_pool1),
            'parent2_pool', to_jsonb(v_pool2),
            'slots', v_slots,
            'rolled', to_jsonb(v_traits),
            'rerolls', '[]'::jsonb
          ));

  RETURN v_offspring_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 7. unlock_variant: wild rolls (section 6.3) - a newly unlocked variant
--    rolls 1 random trait (common/uncommon) or 2 distinct (rare+) from the
--    active pool. Starters stay traitless (the tutorial pick is a clean
--    slate; the player learns traits through breeding).
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
  v_traits TEXT[] := '{}';
  v_slots INTEGER;
BEGIN
  SELECT * INTO v_variant FROM snake_variants WHERE id = p_variant_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variant not found or inactive';
  END IF;

  SELECT * INTO v_player FROM players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM collected_snakes
    WHERE player_id = p_player_id AND snake_variant_id = p_variant_id AND generation = 1
  ) THEN
    RAISE EXCEPTION 'Variant already owned';
  END IF;

  IF v_variant.unlock_cost_dna > 0 AND v_player.dna < v_variant.unlock_cost_dna THEN
    RAISE EXCEPTION 'Insufficient DNA. Need % but have %', v_variant.unlock_cost_dna, v_player.dna;
  END IF;

  IF v_variant.unlock_cost_dna > 0 THEN
    UPDATE players SET dna = dna - v_variant.unlock_cost_dna
    WHERE id = p_player_id
    RETURNING dna INTO v_new_balance;

    INSERT INTO economy_transactions (player_id, resource_type, amount, balance_after, source_type, metadata)
    VALUES (p_player_id, 'dna', -v_variant.unlock_cost_dna, v_new_balance, 'unlock_cost',
            jsonb_build_object('variant_id', p_variant_id, 'variant_name', v_variant.name));
  END IF;

  -- Wild roll (section 6.3): starters traitless; unlocks roll
  -- get_trait_slots(rarity, 1) distinct traits from the active pool
  IF NOT v_variant.is_starter THEN
    v_slots := get_trait_slots(v_variant.rarity, 1);
    SELECT COALESCE(array_agg(id), '{}') INTO v_traits
    FROM (
      SELECT id FROM trait_definitions
      WHERE active
      ORDER BY hashtextextended(gen_random_uuid()::text, 0)
      LIMIT v_slots
    ) wild;
  END IF;

  INSERT INTO collected_snakes (
    player_id, snake_variant_id, generation, acquired_method, is_equipped, is_favorited, traits
  ) VALUES (
    p_player_id, p_variant_id, 1,
    CASE WHEN v_variant.is_starter THEN 'tutorial' ELSE 'unlock' END,
    false, false, v_traits
  ) RETURNING id INTO v_new_snake_id;

  RETURN v_new_snake_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 8. reroll_trait: redraw ONE inherited trait from the combined parent
--    pool recorded at breed time (section 6.3 - "breed toward the pair
--    you want, token the miss"). Consumes one reroll token. The token is
--    only spent when a redraw is actually possible: validation failures
--    raise (and roll back) before the decrement.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reroll_trait(
  p_player_id UUID,
  p_snake_id UUID,
  p_slot INTEGER
) RETURNS TEXT[] AS $$
DECLARE
  v_snake RECORD;
  v_history RECORD;
  v_tokens INTEGER;
  v_pool TEXT[];
  v_candidates TEXT[] := '{}';
  v_current TEXT;
  v_new TEXT;
  v_traits TEXT[];
  t TEXT;
BEGIN
  SELECT * INTO v_snake
  FROM collected_snakes
  WHERE id = p_snake_id AND player_id = p_player_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snake not found or not owned';
  END IF;

  v_traits := COALESCE(v_snake.traits, '{}');
  IF p_slot IS NULL OR p_slot < 1 OR p_slot > COALESCE(array_length(v_traits, 1), 0) THEN
    RAISE EXCEPTION 'Invalid trait slot %', p_slot;
  END IF;
  v_current := v_traits[p_slot];

  -- The redraw pool is the COMBINED parent pool recorded at breed time
  SELECT * INTO v_history
  FROM breeding_history
  WHERE child_id = p_snake_id AND player_id = p_player_id
  ORDER BY bred_at DESC
  LIMIT 1;
  IF NOT FOUND OR v_history.trait_rolls IS NULL THEN
    RAISE EXCEPTION 'Snake has no recorded breeding roll to redraw from';
  END IF;

  SELECT COALESCE(array_agg(x), '{}') INTO v_pool
  FROM (
    SELECT jsonb_array_elements_text(COALESCE(v_history.trait_rolls->'parent1_pool', '[]'::jsonb)) AS x
    UNION ALL
    SELECT jsonb_array_elements_text(COALESCE(v_history.trait_rolls->'parent2_pool', '[]'::jsonb))
  ) pools
  WHERE x IN (SELECT id FROM trait_definitions WHERE active);

  -- Candidates: the combined pool minus every trait the snake already has
  -- (rerolling into the same trait or a duplicate slot is never possible)
  FOREACH t IN ARRAY v_pool LOOP
    IF (t <> ALL(v_traits)) AND (t <> ALL(v_candidates)) THEN
      v_candidates := array_append(v_candidates, t);
    END IF;
  END LOOP;
  IF COALESCE(array_length(v_candidates, 1), 0) = 0 THEN
    RAISE EXCEPTION 'No alternative trait available in the parent pool';
  END IF;

  SELECT player_reroll_tokens INTO v_tokens
  FROM players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;
  IF COALESCE(v_tokens, 0) < 1 THEN
    RAISE EXCEPTION 'No reroll tokens available';
  END IF;

  v_new := pick_random_trait(v_candidates);
  v_traits[p_slot] := v_new;

  UPDATE players
  SET player_reroll_tokens = player_reroll_tokens - 1
  WHERE id = p_player_id;

  UPDATE collected_snakes SET traits = v_traits WHERE id = p_snake_id;

  UPDATE breeding_history
  SET trait_rolls = jsonb_set(
    trait_rolls,
    '{rerolls}',
    COALESCE(trait_rolls->'rerolls', '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('slot', p_slot, 'from', v_current, 'to', v_new, 'at', NOW())
    )
  )
  WHERE id = v_history.id;

  RETURN v_traits;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
