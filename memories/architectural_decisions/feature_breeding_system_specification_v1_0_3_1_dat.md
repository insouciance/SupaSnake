# feature_breeding_system_specification_v1_0_3_1_dat

**Domain:** architecture
**Category:** context
**Captured:** 2026-01-26T09:26:36.390842+00:00
**Tags:** specification, context, documentation

## Summary

# Feature: Breeding System Specification v1.0: 3.1 Database Schema Additions

**Type:** specification
**Domain:** architecture
**Category:** context
**Source:** docs/game/specs/BREEDING_SYSTEM_spec.md
**Captured:** 2026-01-26 10:26



## Content

```sql
-- =====================================================
-- BREEDING HISTORY TABLE
-- Tracks all breeding events for lineage/audit
-- =====================================================
CREATE TABLE IF NOT EXISTS breeding_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent1_id UUID NOT NULL REFERENCES player_collection(id),
  parent2_id UUID NOT NULL REFERENCES player_collection(id),
  offspring_id UUID NOT NULL REFERENCES player_collection(id),
  dna_cost INT NOT NULL,
  bred_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_breeding_user ON breeding_history(user_id);
CREATE INDEX IF NOT EXISTS idx_breeding_offspring ON breeding_history(offspring_id);

-- RLS
ALTER TABLE breeding_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY breeding_select ON breeding_history
  FOR SELECT USING (auth.uid() = user_id);

-- =====================================================
-- BREEDING FUNCTION (Server-Side Logic)
-- Atomic: validates, deducts DNA, creates offspring
-- =====================================================
CREATE OR REPLACE FUNCTION breed_snakes(
  p_user_id UUID,
  p_parent1_id UUID,
  p_parent2_id UUID
) RETURNS UUID AS $$
DECLARE
  v_parent1 RECORD;
  v_parent2 RECORD;
  v_dna_cost INT;
  v_offspring_gen INT;
  v_offspring_variant_id UUID;
  v_offspring_id UUID;
  v_user_dna INT;
BEGIN
  -- Fetch parent 1
  SELECT pc.*, sv.dynasty_id, sv.id as variant_id
  INTO v_parent1
  FROM player_collection pc
  JOIN snake_variants sv ON pc.variant_id = sv.id
  WHERE pc.id = p_parent1_id AND pc.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent 1 not found or not owned';
  END IF;

  -- Fetch parent 2
  SELECT pc.*, sv.dynasty_id, sv.id as variant_id
  INTO v_parent2
  FROM player_collection pc
  JOIN snake_variants sv ON pc.variant_id = sv.id
  WHERE pc.id = p_parent2_id AND pc.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent 2 not found or not owned';
  END IF;

  -- Validate same dynasty
  IF v_parent1.dynasty_id != v_parent2.dynasty_id THEN
    RAISE EXCEPTION 'Parents must be same dynasty';
  END IF;

  -- Validate not same snake
  IF p_parent1_id = p_parent2_id THEN
    RAISE EXCEPTION 'Cannot breed snake with itself';
  END IF;

  -- Calculate DNA cost
  v_dna_cost := 200 + ((v_parent1.generation + v_parent2.generation) / 2) * 100;

  -- Check DNA balance (assumes dna_balance in user_resources table)
  SELECT dna_balance INTO v_user_dna
  FROM user_resources
  WHERE user_id = p_user_id;

  IF v_user_dna < v_dna_cost THEN
    RAISE EXCEPTION 'Insufficient DNA: need %, have %', v_dna_cost, v_user_dna;
  END IF;

  -- Calculate offspring generation
  v_offspring_gen := GREATEST(v_parent1.generation, v_parent2.generation) + 1;

  -- Check max generation
  IF v_offspring_gen > 50 THEN
    RAISE EXCEPTION 'Maximum generation (50) reached';
  END IF;

  -- Determine offspring variant (50/50)
  IF random() < 0.5 THEN
    v_offspring_variant_id := v_parent1.variant_id;
  ELSE
    v_offspring_variant_id := v_parent2.variant_id;
  END IF;

  -- Deduct DNA
  UPDATE user_resources
  SET dna_balance = dna_balance - v_dna_cost
  WHERE user_id = p_user_id;

  -- Create offspring
  INSERT INTO player_collection (
    user_id, variant_id, generation, parent1_id, parent2_id, acquired_method
  ) VALUES (
    p_user_id, v_offspring_variant_id, v_offspring_gen, p_parent1_id, p_parent2_id, 'bred'
  )
  RETURNING id INTO v_offspring_id;

  -- Record breeding history
  INSERT INTO breeding_history (
    user_id, parent1_id, parent2_id, offspring_id, dna_cost
  ) VALUES (
    p_user_id, p_parent1_id, p_parent2_id, v_offspring_id, v_dna_cost
  );

  RETURN v_offspring_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

*Automatically extracted from documentation.*


---
*Manually captured via /capture command*
