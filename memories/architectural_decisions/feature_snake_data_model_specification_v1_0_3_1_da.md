# feature_snake_data_model_specification_v1_0_3_1_da

**Domain:** architecture
**Category:** context
**Captured:** 2026-01-26T09:26:39.474285+00:00
**Tags:** specification, context, documentation

## Summary

# Feature: Snake Data Model Specification v1.0: 3.1 Database Schema

**Type:** specification
**Domain:** architecture
**Category:** context
**Source:** docs/game/specs/SNAKE_DATA_MODEL_spec.md
**Captured:** 2026-01-26 10:26



## Content

```sql
-- =====================================================
-- DYNASTIES TABLE
-- Static reference data for dynasty themes
-- =====================================================
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
('COSMIC', 'Cosmic Dynasty', 'Born from collapsing stars, masters of celestial energy', '#4a0e4e', '#ffd700', 'size', 0.05, 3);

-- =====================================================
-- SNAKE VARIANTS TABLE
-- All possible snake variants (MVP: 5)
-- =====================================================
CREATE TABLE IF NOT EXISTS snake_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dynasty_id UUID NOT NULL REFERENCES dynasties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                  -- "CYBER SPARK", "PRIMAL SEED"
  rarity TEXT NOT NULL DEFAULT 'common',  -- "common", "uncommon", "rare", "epic", "legendary"
  lore_text TEXT,                      -- Flavor text for collection
  art_url TEXT,                        -- Supabase Storage URL
  base_stats JSONB NOT NULL DEFAULT '{"speed": 10, "size": 5, "hp": 100}'::jsonb,
  unlock_cost_dna INT NOT NULL DEFAULT 0,  -- 0 for starters
  is_starter BOOLEAN DEFAULT false,    -- Can be chosen in tutorial
  sort_order INT NOT NULL,             -- Order within dynasty
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(dynasty_id, name)
);

-- Seed MVP variants (5 total)
INSERT INTO snake_variants (dynasty_id, name, rarity, lore_text, base_stats, unlock_cost_dna, is_starter, sort_order) VALUES
-- CYBER Dynasty
((SELECT id FROM dynasties WHERE name = 'CYBER'),
 'CYBER SPARK', 'common',
 'The first light of digital awakening. CYBER SPARK embodies the nascent energy of a consciousness being born.',
 '{"speed": 10, "size": 5, "hp": 100}'::jsonb, 0, true, 1),
((SELECT id FROM dynasties WHERE name = 'CYBER'),
 'CYBER PULSE', 'common',
 'Rhythmic data flows through circuitry. The heartbeat of the network made flesh.',
 '{"speed": 10, "size": 5, "hp": 100}'::jsonb, 500, false, 2),
-- PRIMAL Dynasty
((SELECT id FROM dynasties WHERE name = 'PRIMAL'),
 'PRIMAL SEED', 'common',
 'The first sprout of life. From this tiny beginning, entire forests will grow.',
 '{"speed": 10, "size": 5, "hp": 100}'::jsonb, 0, true, 1),
((SELECT id FROM dynasties WHERE name = 'PRIMAL'),
 'PRIMAL VINE', 'common',
 'Winding tendrils of organic power reach toward the light, unstoppable in their growth.',
 '{"speed": 10, "size": 5, "hp": 100}'::jsonb, 500, false, 2),
-- COSMIC Dynasty
((SELECT id FROM dynasties WHERE name = 'COSMIC'),
 'COSMIC SPARK', 'common',
 'The first light of a new star. A point of infinite potential in the cosmic void.',
 '{"speed": 10, "size": 5, "hp": 100}'::jsonb, 0, true, 1);

-- =====================================================
-- PLAYER COLLECTION TABLE
-- Tracks which snakes each player owns
-- =====================================================
CREATE TABLE IF NOT EXISTS player_collection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES snake_variants(id) ON DELETE CASCADE,
  generation INT NOT NULL DEFAULT 1,   -- Gen 1, Gen 2, etc.
  parent1_id UUID REFERENCES player_collection(id),  -- NULL if unlocked (not bred)
  parent2_id UUID REFERENCES player_collection(id),  -- NULL if unlocked (not bred)
  acquired_at TIMESTAMPTZ DEFAULT NOW(),
  acquired_method TEXT DEFAULT 'unlock',  -- "tutorial", "unlock", "bred"
  is_equipped BOOLEAN DEFAULT false,   -- Currently selected for gameplay
  is_favorited BOOLEAN DEFAULT false,
  UNIQUE(user_id, variant_id, generation)  -- Can have same variant at different gens
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_variants_dynasty ON snake_variants(dynasty_id);
CREATE INDEX IF NOT EXISTS idx_variants_rarity ON snake_variants(rarity);
CREATE INDEX IF NOT EXISTS idx_collection_user ON player_collection(user_id);
CREATE INDEX IF NOT EXISTS idx_collection_variant ON player_collection(variant_id);
CREATE INDEX IF NOT EXISTS idx_collection_equipped ON player_collection(user_id, is_equipped) WHERE is_equipped = true;

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- Dynasties: Public read for all authenticated users
ALTER TABLE dynasties ENABLE ROW LEVEL SECURITY;
CREATE POLICY dynasties_select ON dynasties
  FOR SELECT TO authenticated USING (true);

-- Variants: Public read for all authenticated users
ALTER TABLE snake_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY variants_select ON snake_variants
  FOR SELECT TO authenticated USING (true);

-- Collection: Users can only see their own
ALTER TABLE player_collection ENABLE ROW LEVEL SECURITY;
CREATE POLICY collection_select ON player_collection
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY collection_insert ON player_collection
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY collection_update ON player_collection
  FOR UPDATE USING (auth.uid() = user_id);
```

---

*Automatically extracted from documentation.*


---
*Manually captured via /capture command*
