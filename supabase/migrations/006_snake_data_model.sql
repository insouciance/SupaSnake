-- ============================================================================
-- SNAKE DATA MODEL MIGRATION
-- Sprint 1: Dynasties, Snake Variants, Collection Extensions
-- ============================================================================

-- ============================================================================
-- DYNASTIES TABLE
-- Static reference data for dynasty themes (3 records for MVP)
-- ============================================================================
CREATE TABLE IF NOT EXISTS dynasties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,           -- "CYBER", "PRIMAL", "COSMIC"
  display_name TEXT NOT NULL,          -- "Cyber Dynasty"
  description TEXT,                    -- Lore description
  color_primary TEXT NOT NULL,         -- "#00FFFF" (UI theming)
  color_secondary TEXT NOT NULL,       -- "#FF00FF"
  stat_bonus_type TEXT NOT NULL,       -- "speed", "dna_generation", "size"
  stat_bonus_value FLOAT NOT NULL DEFAULT 0.05,  -- 0.05 = 5%
  sort_order INT NOT NULL,             -- Display order (1, 2, 3)
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed MVP dynasties
INSERT INTO dynasties (name, display_name, description, color_primary, color_secondary, stat_bonus_type, stat_bonus_value, sort_order) VALUES
('CYBER', 'Cyber Dynasty', 'Born from electric storms, masters of digital precision', '#00FFFF', '#FF00FF', 'speed', 0.05, 1),
('PRIMAL', 'Primal Dynasty', 'Ancient guardians of nature, masters of organic evolution', '#2d5016', '#8b4513', 'dna_generation', 0.05, 2),
('COSMIC', 'Cosmic Dynasty', 'Born from collapsing stars, masters of celestial energy', '#4a0e4e', '#ffd700', 'size', 0.05, 3)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- SNAKE VARIANTS TABLE
-- Catalog of all possible snake variants (5 records for MVP)
-- ============================================================================
CREATE TABLE IF NOT EXISTS snake_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dynasty_id UUID NOT NULL REFERENCES dynasties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                  -- "CYBER SPARK", "PRIMAL SEED"
  rarity TEXT NOT NULL DEFAULT 'common',  -- "common", "uncommon", "rare", "epic", "legendary"
  lore_text TEXT,                      -- Flavor text for collection
  art_url TEXT,                        -- Supabase Storage URL (null = use placeholder)
  base_stats JSONB NOT NULL DEFAULT '{"speed": 10, "size": 5, "hp": 100}'::jsonb,
  unlock_cost_dna INT NOT NULL DEFAULT 0,  -- 0 for starters
  is_starter BOOLEAN DEFAULT false,    -- Can be chosen in tutorial
  sort_order INT NOT NULL,             -- Order within dynasty
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(dynasty_id, name)
);

-- Indexes for variants
CREATE INDEX IF NOT EXISTS idx_variants_dynasty ON snake_variants(dynasty_id);
CREATE INDEX IF NOT EXISTS idx_variants_rarity ON snake_variants(rarity);
CREATE INDEX IF NOT EXISTS idx_variants_starter ON snake_variants(is_starter) WHERE is_starter = true;

-- Seed MVP variants (5 total: 3 starters + 2 unlockables)
INSERT INTO snake_variants (dynasty_id, name, rarity, lore_text, base_stats, unlock_cost_dna, is_starter, sort_order)
SELECT
  d.id,
  v.name,
  v.rarity,
  v.lore_text,
  v.base_stats::jsonb,
  v.unlock_cost_dna,
  v.is_starter,
  v.sort_order
FROM dynasties d
CROSS JOIN (VALUES
  -- CYBER Dynasty variants
  ('CYBER', 'CYBER SPARK', 'common',
   'The first light of digital awakening. CYBER SPARK embodies the nascent energy of a consciousness being born.',
   '{"speed": 10, "size": 5, "hp": 100}', 0, true, 1),
  ('CYBER', 'CYBER PULSE', 'common',
   'Rhythmic data flows through circuitry. The heartbeat of the network made flesh.',
   '{"speed": 10, "size": 5, "hp": 100}', 500, false, 2),
  -- PRIMAL Dynasty variants
  ('PRIMAL', 'PRIMAL SEED', 'common',
   'The first sprout of life. From this tiny beginning, entire forests will grow.',
   '{"speed": 10, "size": 5, "hp": 100}', 0, true, 1),
  ('PRIMAL', 'PRIMAL VINE', 'common',
   'Winding tendrils of organic power reach toward the light, unstoppable in their growth.',
   '{"speed": 10, "size": 5, "hp": 100}', 500, false, 2),
  -- COSMIC Dynasty variants
  ('COSMIC', 'COSMIC SPARK', 'common',
   'The first light of a new star. A point of infinite potential in the cosmic void.',
   '{"speed": 10, "size": 5, "hp": 100}', 0, true, 1)
) AS v(dynasty_name, name, rarity, lore_text, base_stats, unlock_cost_dna, is_starter, sort_order)
WHERE d.name = v.dynasty_name
ON CONFLICT (dynasty_id, name) DO NOTHING;

-- ============================================================================
-- EXTEND COLLECTED_SNAKES TABLE
-- Add new columns for equipment status, favorites, and acquisition method
-- ============================================================================

-- Add new columns if they don't exist
DO $$
BEGIN
  -- Add snake_variant_id as proper FK (new column to eventually replace variant_id TEXT)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'collected_snakes' AND column_name = 'snake_variant_id') THEN
    ALTER TABLE collected_snakes ADD COLUMN snake_variant_id UUID REFERENCES snake_variants(id);
  END IF;

  -- Add is_equipped flag
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'collected_snakes' AND column_name = 'is_equipped') THEN
    ALTER TABLE collected_snakes ADD COLUMN is_equipped BOOLEAN DEFAULT false;
  END IF;

  -- Add is_favorited flag
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'collected_snakes' AND column_name = 'is_favorited') THEN
    ALTER TABLE collected_snakes ADD COLUMN is_favorited BOOLEAN DEFAULT false;
  END IF;

  -- Add acquired_method
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'collected_snakes' AND column_name = 'acquired_method') THEN
    ALTER TABLE collected_snakes ADD COLUMN acquired_method TEXT DEFAULT 'unlock';
  END IF;
END $$;

-- Index for equipped snake lookup
CREATE INDEX IF NOT EXISTS idx_collected_equipped ON collected_snakes(player_id, is_equipped) WHERE is_equipped = true;

-- ============================================================================
-- ROW LEVEL SECURITY FOR NEW TABLES
-- ============================================================================

-- Dynasties: Public read for all authenticated users
ALTER TABLE dynasties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dynasties_select ON dynasties;
CREATE POLICY dynasties_select ON dynasties
  FOR SELECT TO authenticated USING (true);

-- Variants: Public read for all authenticated users
ALTER TABLE snake_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS variants_select ON snake_variants;
CREATE POLICY variants_select ON snake_variants
  FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to compute effective stats with generation scaling and dynasty bonus
CREATE OR REPLACE FUNCTION compute_effective_stats(
  p_base_stats JSONB,
  p_generation INT,
  p_dynasty_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_gen_multiplier FLOAT;
  v_dynasty RECORD;
  v_speed FLOAT;
  v_size FLOAT;
  v_hp FLOAT;
BEGIN
  -- Generation scaling: base * (1 + (generation - 1) * 0.05)
  v_gen_multiplier := 1.0 + (p_generation - 1) * 0.05;

  -- Get dynasty bonus
  SELECT stat_bonus_type, stat_bonus_value INTO v_dynasty
  FROM dynasties WHERE id = p_dynasty_id;

  -- Calculate base stats with generation multiplier
  v_speed := (p_base_stats->>'speed')::FLOAT * v_gen_multiplier;
  v_size := (p_base_stats->>'size')::FLOAT * v_gen_multiplier;
  v_hp := (p_base_stats->>'hp')::FLOAT * v_gen_multiplier;

  -- Apply dynasty bonus
  IF v_dynasty.stat_bonus_type = 'speed' THEN
    v_speed := v_speed * (1 + v_dynasty.stat_bonus_value);
  ELSIF v_dynasty.stat_bonus_type = 'size' THEN
    v_size := v_size * (1 + v_dynasty.stat_bonus_value);
  END IF;
  -- Note: dna_generation bonus affects rewards, not stats

  RETURN jsonb_build_object(
    'speed', ROUND(v_speed::NUMERIC, 2),
    'size', ROUND(v_size::NUMERIC, 2),
    'hp', ROUND(v_hp::NUMERIC, 2)
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to unlock a variant for a player
CREATE OR REPLACE FUNCTION unlock_variant(
  p_player_id UUID,
  p_variant_id UUID
) RETURNS UUID AS $$
DECLARE
  v_variant RECORD;
  v_player RECORD;
  v_new_snake_id UUID;
BEGIN
  -- Get variant info
  SELECT * INTO v_variant FROM snake_variants WHERE id = p_variant_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variant not found or inactive';
  END IF;

  -- Get player info
  SELECT * INTO v_player FROM players WHERE id = p_player_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  -- Check if already owned
  IF EXISTS (
    SELECT 1 FROM collected_snakes
    WHERE player_id = p_player_id AND snake_variant_id = p_variant_id AND generation = 1
  ) THEN
    RAISE EXCEPTION 'Variant already owned';
  END IF;

  -- Check DNA balance (starters are free)
  IF v_variant.unlock_cost_dna > 0 AND v_player.dna < v_variant.unlock_cost_dna THEN
    RAISE EXCEPTION 'Insufficient DNA. Need % but have %', v_variant.unlock_cost_dna, v_player.dna;
  END IF;

  -- Deduct DNA
  IF v_variant.unlock_cost_dna > 0 THEN
    UPDATE players SET dna = dna - v_variant.unlock_cost_dna WHERE id = p_player_id;
  END IF;

  -- Create the snake
  INSERT INTO collected_snakes (
    player_id,
    variant_id,
    snake_variant_id,
    generation,
    acquired_method,
    is_equipped,
    is_favorited
  ) VALUES (
    p_player_id,
    v_variant.name,  -- Keep TEXT variant_id for backward compat
    p_variant_id,    -- New UUID FK
    1,               -- Gen 1 for unlocks
    CASE WHEN v_variant.is_starter THEN 'tutorial' ELSE 'unlock' END,
    false,
    false
  ) RETURNING id INTO v_new_snake_id;

  RETURN v_new_snake_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to equip a snake
CREATE OR REPLACE FUNCTION equip_snake(
  p_player_id UUID,
  p_snake_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM collected_snakes WHERE id = p_snake_id AND player_id = p_player_id
  ) THEN
    RAISE EXCEPTION 'Snake not owned by player';
  END IF;

  -- Unequip all other snakes for this player
  UPDATE collected_snakes SET is_equipped = false WHERE player_id = p_player_id;

  -- Equip the selected snake
  UPDATE collected_snakes SET is_equipped = true WHERE id = p_snake_id;

  -- Also update player_settings if it exists
  UPDATE player_settings SET active_snake_id = p_snake_id WHERE player_id = p_player_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- UPDATED_AT TRIGGERS FOR NEW TABLES
-- ============================================================================

CREATE TRIGGER dynasties_updated_at
  BEFORE UPDATE ON dynasties
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER snake_variants_updated_at
  BEFORE UPDATE ON snake_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
