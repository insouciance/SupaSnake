# feature_tutorial_system_specification_v1_0_3_1_dat

**Domain:** architecture
**Category:** context
**Captured:** 2026-01-26T09:26:21.553356+00:00
**Tags:** specification, context, documentation

## Summary

# Feature: Tutorial System Specification v1.0: 3.1 Database Schema

**Type:** specification
**Domain:** architecture
**Category:** context
**Source:** docs/game/specs/TUTORIAL_spec.md
**Captured:** 2026-01-26 10:26



## Content

```sql
-- =====================================================
-- TUTORIAL PROGRESS TABLE
-- Tracks each player's tutorial state
-- =====================================================
CREATE TABLE IF NOT EXISTS tutorial_progress (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_step TEXT NOT NULL DEFAULT 'not_started',
  chosen_dynasty_id UUID REFERENCES dynasties(id),
  starter_snake_id UUID REFERENCES player_collection(id),
  second_snake_id UUID REFERENCES player_collection(id),
  first_breed_offspring_id UUID REFERENCES player_collection(id),
  first_game_dna_earned INT DEFAULT 0,
  completion_bonus_claimed BOOLEAN DEFAULT false,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE tutorial_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY tutorial_own ON tutorial_progress
  FOR ALL USING (auth.uid() = user_id);

-- =====================================================
-- TUTORIAL FUNCTIONS
-- =====================================================

-- Initialize tutorial for new user
CREATE OR REPLACE FUNCTION init_tutorial()
RETURNS void AS $$
BEGIN
  INSERT INTO tutorial_progress (user_id, current_step, started_at)
  VALUES (auth.uid(), 'welcome', NOW())
  ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Advance tutorial step
CREATE OR REPLACE FUNCTION advance_tutorial(
  p_next_step TEXT,
  p_data JSONB DEFAULT '{}'::jsonb
) RETURNS tutorial_progress AS $$
DECLARE
  v_progress tutorial_progress;
BEGIN
  UPDATE tutorial_progress
  SET
    current_step = p_next_step,
    chosen_dynasty_id = COALESCE((p_data->>'dynasty_id')::uuid, chosen_dynasty_id),
    starter_snake_id = COALESCE((p_data->>'starter_snake_id')::uuid, starter_snake_id),
    second_snake_id = COALESCE((p_data->>'second_snake_id')::uuid, second_snake_id),
    first_breed_offspring_id = COALESCE((p_data->>'offspring_id')::uuid, first_breed_offspring_id),
    first_game_dna_earned = COALESCE((p_data->>'dna_earned')::int, first_game_dna_earned),
    completed_at = CASE WHEN p_next_step = 'completed' THEN NOW() ELSE completed_at END,
    updated_at = NOW()
  WHERE user_id = auth.uid()
  RETURNING * INTO v_progress;

  -- Grant completion bonus if completing
  IF p_next_step = 'completed' AND NOT v_progress.completion_bonus_claimed THEN
    UPDATE user_resources SET dna_balance = dna_balance + 500 WHERE user_id = auth.uid();
    UPDATE tutorial_progress SET completion_bonus_claimed = true WHERE user_id = auth.uid();
  END IF;

  RETURN v_progress;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

*Automatically extracted from documentation.*


---
*Manually captured via /capture command*
