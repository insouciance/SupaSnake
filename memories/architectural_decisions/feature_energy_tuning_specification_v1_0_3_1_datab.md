# feature_energy_tuning_specification_v1_0_3_1_datab

**Domain:** architecture
**Category:** context
**Captured:** 2026-01-26T09:26:38.405245+00:00
**Tags:** specification, context, documentation

## Summary

# Feature: Energy Tuning Specification v1.0: 3.1 Database Schema Updates

**Type:** specification
**Domain:** architecture
**Category:** context
**Source:** docs/game/specs/ENERGY_TUNING_spec.md
**Captured:** 2026-01-26 10:26



## Content

```sql
-- ENERGY SYSTEM ENHANCEMENTS
-- Assumes user_resources table exists with energy fields

-- Add bonus energy tracking
ALTER TABLE user_resources
ADD COLUMN IF NOT EXISTS bonus_energy INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS ad_refills_today INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS ad_refills_reset_date DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS last_energy_update TIMESTAMPTZ DEFAULT NOW();

-- Energy config table (for easy tuning - AAA architecture)
CREATE TABLE IF NOT EXISTS energy_config (
  key TEXT PRIMARY KEY,
  value FLOAT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed config values (all game balance in DB, not code)
INSERT INTO energy_config (key, value, description) VALUES
('max_energy', 5, 'Maximum natural energy capacity'),
('max_bonus_energy', 20, 'Maximum bonus energy from purchases'),
('regen_interval_minutes', 20, 'Minutes per 1 energy regeneration'),
('energy_per_game', 1, 'Energy cost to play one game'),
('ad_energy_reward', 1, 'Energy gained from watching ad'),
('ad_refills_per_day', 3, 'Maximum ad refills per day'),
('ad_cooldown_minutes', 30, 'Cooldown between ad watches'),
('base_dna_reward', 50, 'Minimum DNA for completing a game'),
('dna_per_score_point', 0.5, 'DNA per score point'),
('dna_per_survival_minute', 10, 'DNA bonus per minute survived'),
('dynasty_dna_bonus', 0.05, 'PRIMAL dynasty DNA generation bonus')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ENERGY FUNCTIONS

-- Calculate current energy (with offline regen)
CREATE OR REPLACE FUNCTION get_current_energy(p_user_id UUID)
RETURNS TABLE(natural_energy INT, bonus_energy INT, next_regen_at TIMESTAMPTZ) AS $$
DECLARE
  v_user user_resources;
  v_max_energy INT;
  v_regen_interval INT;
  v_minutes_elapsed INT;
  v_energy_gained INT;
  v_new_energy INT;
BEGIN
  -- Get user data
  SELECT * INTO v_user FROM user_resources WHERE user_id = p_user_id;

  -- Get config from DB
  SELECT value INTO v_max_energy FROM energy_config WHERE key = 'max_energy';
  SELECT value INTO v_regen_interval FROM energy_config WHERE key = 'regen_interval_minutes';

  -- Calculate offline regen
  v_minutes_elapsed := EXTRACT(EPOCH FROM (NOW() - v_user.last_energy_update)) / 60;
  v_energy_gained := FLOOR(v_minutes_elapsed / v_regen_interval);
  v_new_energy := LEAST(v_user.energy_balance + v_energy_gained, v_max_energy);

  -- Update if energy changed
  IF v_new_energy > v_user.energy_balance THEN
    UPDATE user_resources
    SET energy_balance = v_new_energy,
        last_energy_update = NOW() - ((v_minutes_elapsed % v_regen_interval) * INTERVAL '1 minute')
    WHERE user_id = p_user_id;
  END IF;

  RETURN QUERY SELECT
    v_new_energy as natural_energy,
    v_user.bonus_energy as bonus_energy,
    (v_user.last_energy_update + (v_regen_interval * INTERVAL '1 minute')) as next_regen_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Consume energy for game
CREATE OR REPLACE FUNCTION consume_energy(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_energy RECORD;
  v_cost INT;
BEGIN
  -- Get config from DB
  SELECT value INTO v_cost FROM energy_config WHERE key = 'energy_per_game';

  -- Get current energy (with regen calculation)
  SELECT * INTO v_energy FROM get_current_energy(p_user_id);

  -- Check total energy
  IF (v_energy.natural_energy + v_energy.bonus_energy) < v_cost THEN
    RETURN FALSE;
  END IF;

  -- Consume bonus first, then natural
  IF v_energy.bonus_energy >= v_cost THEN
    UPDATE user_resources SET bonus_energy = bonus_energy - v_cost WHERE user_id = p_user_id;
  ELSE
    UPDATE user_resources
    SET
      bonus_energy = 0,
      energy_balance = energy_balance - (v_cost - bonus_energy)
    WHERE user_id = p_user_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add energy from ad watch
CREATE OR REPLACE FUNCTION watch_ad_for_energy(p_user_id UUID)
RETURNS TABLE(success BOOLEAN, new_bonus INT, refills_remaining INT) AS $$
DECLARE
  v_user user_resources;
  v_max_refills INT;
  v_reward INT;
  v_max_bonus INT;
BEGIN
  -- Get user and reset daily counter if needed
  SELECT * INTO v_user FROM user_resources WHERE user_id = p_user_id;

  IF v_user.ad_refills_reset_date < CURRENT_DATE THEN
    UPDATE user_resources
    SET ad_refills_today = 0, ad_refills_reset_date = CURRENT_DATE
    WHERE user_id = p_user_id;
    v_user.ad_refills_today := 0;
  END IF;

  -- Get config from DB
  SELECT value INTO v_max_refills FROM energy_config WHERE key = 'ad_refills_per_day';
  SELECT value INTO v_reward FROM energy_config WHERE key = 'ad_energy_reward';
  SELECT value INTO v_max_bonus FROM energy_config WHERE key = 'max_bonus_energy';

  -- Check limit
  IF v_user.ad_refills_today >= v_max_refills THEN
    RETURN QUERY SELECT FALSE, v_user.bonus_energy, 0;
    RETURN;
  END IF;

  -- Grant energy
  UPDATE user_resources
  SET
    bonus_energy = LEAST(bonus_energy + v_reward, v_max_bonus),
    ad_refills_today = ad_refills_today + 1
  WHERE user_id = p_user_id
  RETURNING bonus_energy INTO v_user.bonus_energy;

  RETURN QUERY SELECT
    TRUE,
    v_user.bonus_energy,
    v_max_refills - (v_user.ad_refills_today + 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Calculate DNA reward (all values from config)
CREATE OR REPLACE FUNCTION calculate_dna_reward(
  p_score INT,
  p_survival_seconds INT,
  p_dynasty_type TEXT
) RETURNS INT AS $$
DECLARE
  v_base_dna FLOAT;
  v_per_score FLOAT;
  v_per_minute FLOAT;
  v_dynasty_bonus FLOAT;
  v_total_dna FLOAT;
  v_survival_minutes FLOAT;
BEGIN
  -- All values from config table (AAA architecture - no hardcoded values)
  SELECT value INTO v_base_dna FROM energy_config WHERE key = 'base_dna_reward';
  SELECT value INTO v_per_score FROM energy_config WHERE key = 'dna_per_score_point';
  SELECT value INTO v_per_minute FROM energy_config WHERE key = 'dna_per_survival_minute';
  SELECT value INTO v_dynasty_bonus FROM energy_config WHERE key = 'dynasty_dna_bonus';

  v_survival_minutes := LEAST(p_survival_seconds / 60.0, 3);
  v_total_dna := v_base_dna + (p_score * v_per_score) + (v_survival_minutes * v_per_minute);

  IF p_dynasty_type = 'dna_generation' THEN
    v_total_dna := v_total_dna * (1 + v_dynasty_bonus);
  END IF;

  RETURN FLOOR(v_total_dna);
END;
$$ LANGUAGE plpgsql;
```

---

*Automatically extracted from documentation.*


---
*Manually captured via /capture command*
