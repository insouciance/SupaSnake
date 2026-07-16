-- ============================================================================
-- Migration 009: Dynasty Unification + Engagement RPCs
--
-- 1. Seed the remaining 25 snake variants (30 total per the LOCKED
--    DYNASTY_SYSTEM_specification_v1.0.md catalog)
-- 2. Retire the legacy EMBER/CRYSTAL/VOID TEXT id model:
--    collected_snakes.snake_variant_id becomes NOT NULL, legacy variant_id
--    TEXT columns are dropped, unlock_variant() stops writing them
-- 3. Extend economy_transactions source types (offline_claim + unlock_cost
--    were being rejected by the CHECK constraint -> silent audit loss)
-- 4. New RPCs: breed_snakes (atomic breeding per BREEDING_SYSTEM_spec),
--    record_daily_play (streak advancement), claim_daily_reward
--    (28-day calendar)
--
-- The database is a fresh project (no production players); progress tables
-- are empty, so no data migration is required.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ECONOMY TRANSACTIONS: extend source_type CHECK
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
    'unlock_cost'
  ));

-- ----------------------------------------------------------------------------
-- 2. SEED: complete the 30-variant catalog (extends migration 006's 5 rows)
--    Rarity -> base_stats: common {10,5,100} uncommon {11,5,105}
--    rare {12,6,110} epic {13,6,120} legendary {15,7,135}
-- ----------------------------------------------------------------------------

INSERT INTO snake_variants (dynasty_id, name, rarity, lore_text, base_stats, unlock_cost_dna, is_starter, sort_order)
SELECT
  d.id, v.name, v.rarity, v.lore_text, v.base_stats::jsonb, v.unlock_cost_dna, v.is_starter, v.sort_order
FROM dynasties d
CROSS JOIN (VALUES
  -- ===== CYBER (Spark and Pulse seeded in 006) =====
  ('CYBER', 'CYBER BLADE', 'common',
   'Sharp, angular, precision design. Blade-like scales honed on the cutting edge of technology.',
   '{"speed": 10, "size": 5, "hp": 100}', 500, false, 3),
  ('CYBER', 'CYBER NEXUS', 'uncommon',
   'Connection point of infinite networks. Every scale a node, every movement a handshake.',
   '{"speed": 11, "size": 5, "hp": 105}', 1000, false, 4),
  ('CYBER', 'CYBER STORM', 'uncommon',
   'Electric tempest of raw data. Lightning arcs across its body like a storm across the grid.',
   '{"speed": 11, "size": 5, "hp": 105}', 1000, false, 5),
  ('CYBER', 'CYBER PHANTOM', 'uncommon',
   'Ghostly presence in the digital realm. Semi-transparent, flickering between packets.',
   '{"speed": 11, "size": 5, "hp": 105}', 1500, false, 6),
  ('CYBER', 'CYBER VORTEX', 'rare',
   'Spiral of pure digital energy. Data streams bend around its swirling core.',
   '{"speed": 12, "size": 6, "hp": 110}', 2000, false, 7),
  ('CYBER', 'CYBER ZENITH', 'rare',
   'Peak of technological achievement. Pristine chrome, flawless circuitry, absolute precision.',
   '{"speed": 12, "size": 6, "hp": 110}', 2500, false, 8),
  ('CYBER', 'CYBER SINGULARITY', 'epic',
   'The convergence of all digital consciousness. Light cannot escape its event-horizon glow.',
   '{"speed": 13, "size": 6, "hp": 120}', 5000, false, 9),
  ('CYBER', 'CYBER OMEGA', 'legendary',
   'The final evolution of cyber existence. A transcendent being of pure light and data.',
   '{"speed": 15, "size": 7, "hp": 135}', 10000, false, 10),

  -- ===== PRIMAL (Seed and Vine seeded in 006) =====
  ('PRIMAL', 'PRIMAL ROOT', 'common',
   'Deep earth connection. Root-like scales anchor it to the oldest strata of the world.',
   '{"speed": 10, "size": 5, "hp": 100}', 500, false, 3),
  ('PRIMAL', 'PRIMAL BLOOM', 'uncommon',
   'Flowering expression of natural beauty. Petals unfurl along its body with every season.',
   '{"speed": 11, "size": 5, "hp": 105}', 1000, false, 4),
  ('PRIMAL', 'PRIMAL THORN', 'uncommon',
   'Nature''s defensive power. Thorny vines coil into protective spirals of spike and bark.',
   '{"speed": 11, "size": 5, "hp": 105}', 1000, false, 5),
  ('PRIMAL', 'PRIMAL GROVE', 'uncommon',
   'A living forest embodied. Entire ecosystems shelter in the canopy along its spine.',
   '{"speed": 11, "size": 5, "hp": 105}', 1500, false, 6),
  ('PRIMAL', 'PRIMAL VERDANT', 'rare',
   'Lush green perfection. Dense foliage and vibrant life radiate from every scale.',
   '{"speed": 12, "size": 6, "hp": 110}', 2000, false, 7),
  ('PRIMAL', 'PRIMAL ANCIENT', 'rare',
   'Wisdom of the old forest. Gnarled wood and moss remember the first dawn.',
   '{"speed": 12, "size": 6, "hp": 110}', 2500, false, 8),
  ('PRIMAL', 'PRIMAL COLOSSUS', 'epic',
   'A massive nature titan. Tree-trunk scales carry the weight of a forest giant.',
   '{"speed": 13, "size": 6, "hp": 120}', 5000, false, 9),
  ('PRIMAL', 'PRIMAL TITAN', 'legendary',
   'The eternal force of nature itself. A living world tree in serpent form.',
   '{"speed": 15, "size": 7, "hp": 135}', 10000, false, 10),

  -- ===== COSMIC (Spark seeded in 006) =====
  ('COSMIC', 'COSMIC NOVA', 'common',
   'Explosive birth of celestial power. Bright bursts of stellar fire ripple down its length.',
   '{"speed": 10, "size": 5, "hp": 100}', 500, false, 2),
  ('COSMIC', 'COSMIC NEBULA', 'common',
   'Clouds of cosmic dust and gas. Soft nebula swirls drift across its translucent body.',
   '{"speed": 10, "size": 5, "hp": 100}', 500, false, 3),
  ('COSMIC', 'COSMIC ORBIT', 'uncommon',
   'The circular dance of planetary motion. Ring systems revolve around its coils.',
   '{"speed": 11, "size": 5, "hp": 105}', 1000, false, 4),
  ('COSMIC', 'COSMIC PULSAR', 'uncommon',
   'Rhythmic pulse of distant stars. Its glow sweeps the void like a lighthouse beacon.',
   '{"speed": 11, "size": 5, "hp": 105}', 1000, false, 5),
  ('COSMIC', 'COSMIC AURORA', 'uncommon',
   'Dancing lights of celestial phenomena. Flowing color cascades along its scales.',
   '{"speed": 11, "size": 5, "hp": 105}', 1500, false, 6),
  ('COSMIC', 'COSMIC GALAXY', 'rare',
   'An entire galaxy embodied. Billions of stars spiral slowly across its body.',
   '{"speed": 12, "size": 6, "hp": 110}', 2000, false, 7),
  ('COSMIC', 'COSMIC VOID', 'rare',
   'The emptiness between stars. An event-horizon shimmer outlines its black-hole heart.',
   '{"speed": 12, "size": 6, "hp": 110}', 2500, false, 8),
  ('COSMIC', 'COSMIC SUPERNOVA', 'epic',
   'The explosive death of massive stars. It wears the remnant shockwave as a crown.',
   '{"speed": 13, "size": 6, "hp": 120}', 5000, false, 9),
  ('COSMIC', 'COSMIC SINGULARITY', 'legendary',
   'The point where all universes converge. Ultimate cosmic power in serpent form.',
   '{"speed": 15, "size": 7, "hp": 135}', 10000, false, 10)
) AS v(dynasty_name, name, rarity, lore_text, base_stats, unlock_cost_dna, is_starter, sort_order)
WHERE d.name = v.dynasty_name
ON CONFLICT (dynasty_id, name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. COLLECTED_SNAKES: retire legacy TEXT variant ids
-- ----------------------------------------------------------------------------

-- Defensive backfill (no-op on the fresh database): resolve any legacy rows
-- by matching variant name before enforcing NOT NULL.
UPDATE collected_snakes cs
SET snake_variant_id = sv.id
FROM snake_variants sv
WHERE cs.snake_variant_id IS NULL AND sv.name = cs.variant_id;

DELETE FROM collected_snakes WHERE snake_variant_id IS NULL;

ALTER TABLE collected_snakes ALTER COLUMN snake_variant_id SET NOT NULL;

DROP INDEX IF EXISTS idx_collected_snakes_variant;
ALTER TABLE collected_snakes DROP COLUMN IF EXISTS variant_id;
CREATE INDEX IF NOT EXISTS idx_collected_snakes_player_variant
  ON collected_snakes(player_id, snake_variant_id);

-- game_sessions: legacy TEXT variant id becomes a proper FK. The dynasty TEXT
-- column (from 005) stays - the weekly/daily leaderboard filters read it -
-- but now stores CYBER/PRIMAL/COSMIC names.
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS snake_variant_id UUID REFERENCES snake_variants(id);
ALTER TABLE game_sessions DROP COLUMN IF EXISTS variant_id;

-- player_settings default dynasty moves off the legacy names
ALTER TABLE player_settings ALTER COLUMN selected_dynasty SET DEFAULT 'CYBER';

-- ----------------------------------------------------------------------------
-- 4. unlock_variant: redefined without the legacy variant_id write,
--    now also logs the DNA spend to economy_transactions
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

  INSERT INTO collected_snakes (
    player_id, snake_variant_id, generation, acquired_method, is_equipped, is_favorited
  ) VALUES (
    p_player_id, p_variant_id, 1,
    CASE WHEN v_variant.is_starter THEN 'tutorial' ELSE 'unlock' END,
    false, false
  ) RETURNING id INTO v_new_snake_id;

  RETURN v_new_snake_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 5. breed_snakes: atomic breeding (BREEDING_SYSTEM_spec adapted to the
--    real schema: collected_snakes/players/breeding_history)
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
  v_offspring_id UUID;
  v_player_dna INTEGER;
  v_new_balance INTEGER;
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

  UPDATE players
  SET dna = dna - v_dna_cost,
      breeds_completed = COALESCE(breeds_completed, 0) + 1
  WHERE id = p_player_id
  RETURNING dna INTO v_new_balance;

  INSERT INTO economy_transactions (player_id, resource_type, amount, balance_after, source_type, metadata)
  VALUES (p_player_id, 'dna', -v_dna_cost, v_new_balance, 'breeding_cost',
          jsonb_build_object('parent1_id', p_parent1_id, 'parent2_id', p_parent2_id));

  INSERT INTO collected_snakes (
    player_id, snake_variant_id, generation, acquired_method, is_equipped, is_favorited
  ) VALUES (
    p_player_id, v_offspring_variant_id, v_offspring_gen, 'bred', false, false
  ) RETURNING id INTO v_offspring_id;

  INSERT INTO breeding_history (player_id, parent1_id, parent2_id, child_id, dna_cost)
  VALUES (p_player_id, p_parent1_id, p_parent2_id, v_offspring_id, v_dna_cost);

  RETURN v_offspring_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 6. record_daily_play: streak advancement at first validated session end
--    of the day. Grace: one missed day is forgiven if grace is available;
--    grace restores after 7 consecutive play days.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION record_daily_play(p_player_id UUID)
RETURNS TABLE (
  current_streak INTEGER,
  longest_streak INTEGER,
  streak_multiplier DECIMAL(3,2),
  grace_consumed BOOLEAN
) AS $$
DECLARE
  v_row player_streaks%ROWTYPE;
  v_today DATE := CURRENT_DATE;
  v_grace_consumed BOOLEAN := false;
  v_new_streak INTEGER;
  v_multiplier DECIMAL(3,2);
BEGIN
  INSERT INTO player_streaks (player_id, current_streak, longest_streak, last_play_date)
  VALUES (p_player_id, 0, 0, NULL)
  ON CONFLICT (player_id) DO NOTHING;

  SELECT * INTO v_row FROM player_streaks ps WHERE ps.player_id = p_player_id FOR UPDATE;

  IF v_row.last_play_date = v_today THEN
    v_new_streak := v_row.current_streak;             -- already counted today
  ELSIF v_row.last_play_date = v_today - 1 THEN
    v_new_streak := v_row.current_streak + 1;         -- consecutive day
  ELSIF v_row.last_play_date = v_today - 2 AND v_row.grace_period_available THEN
    v_new_streak := v_row.current_streak + 1;         -- one missed day forgiven
    v_grace_consumed := true;
  ELSIF v_row.last_play_date IS NULL THEN
    v_new_streak := 1;                                -- first ever play
  ELSE
    v_new_streak := 1;                                -- streak broken
  END IF;

  SELECT COALESCE(MAX(t.dna_multiplier), 1.0) INTO v_multiplier
  FROM streak_bonus_tiers t WHERE t.streak_days <= v_new_streak;

  UPDATE player_streaks ps SET
    current_streak = v_new_streak,
    longest_streak = GREATEST(ps.longest_streak, v_new_streak),
    last_play_date = v_today,
    streak_multiplier = v_multiplier,
    grace_period_available = CASE
      WHEN v_grace_consumed THEN false
      -- grace restores after 7 consecutive days of play
      WHEN v_new_streak >= 7 AND v_new_streak % 7 = 0 THEN true
      ELSE ps.grace_period_available
    END,
    grace_period_used = v_grace_consumed OR ps.grace_period_used,
    updated_at = NOW()
  WHERE ps.player_id = p_player_id;

  RETURN QUERY SELECT v_new_streak,
    (SELECT ps.longest_streak FROM player_streaks ps WHERE ps.player_id = p_player_id),
    v_multiplier, v_grace_consumed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 7. claim_daily_reward: atomic 28-day calendar claim. Soft cycle: missed
--    days do not reset calendar position; current_day advances per claim.
--    Energy grants cap at max_energy (purchased overfill is preserved).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION claim_daily_reward(p_player_id UUID)
RETURNS TABLE (
  day_claimed INTEGER,
  dna_granted INTEGER,
  energy_granted INTEGER,
  next_day INTEGER,
  cycle_completed BOOLEAN
) AS $$
DECLARE
  v_state player_daily_state%ROWTYPE;
  v_tier daily_reward_tiers%ROWTYPE;
  v_today DATE := CURRENT_DATE;
  v_player RECORD;
  v_energy_grant INTEGER;
  v_new_dna INTEGER;
  v_next_day INTEGER;
  v_cycle_completed BOOLEAN := false;
BEGIN
  INSERT INTO player_daily_state (player_id) VALUES (p_player_id)
  ON CONFLICT (player_id) DO NOTHING;

  SELECT * INTO v_state FROM player_daily_state s WHERE s.player_id = p_player_id FOR UPDATE;

  IF v_state.last_claim_date = v_today THEN
    RAISE EXCEPTION 'Daily reward already claimed today';
  END IF;

  SELECT * INTO v_tier FROM daily_reward_tiers t WHERE t.day_number = v_state.current_day;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No reward tier configured for day %', v_state.current_day;
  END IF;

  SELECT * INTO v_player FROM players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  -- Energy grant caps at max_energy; never reduces an existing overfill
  v_energy_grant := LEAST(
    v_tier.energy_amount,
    GREATEST(0, COALESCE(v_player.max_energy, 5) - v_player.energy)
  );

  UPDATE players
  SET dna = dna + v_tier.dna_amount,
      energy = energy + v_energy_grant
  WHERE id = p_player_id
  RETURNING dna INTO v_new_dna;

  IF v_tier.dna_amount > 0 THEN
    INSERT INTO economy_transactions (player_id, resource_type, amount, balance_after, source_type, metadata)
    VALUES (p_player_id, 'dna', v_tier.dna_amount, v_new_dna, 'daily_reward',
            jsonb_build_object('day', v_state.current_day));
  END IF;
  IF v_energy_grant > 0 THEN
    INSERT INTO economy_transactions (player_id, resource_type, amount, balance_after, source_type, metadata)
    VALUES (p_player_id, 'energy', v_energy_grant, v_player.energy + v_energy_grant, 'daily_reward',
            jsonb_build_object('day', v_state.current_day));
  END IF;

  INSERT INTO daily_logins (player_id, login_date, reward_claimed, reward_day, reward_dna, reward_energy)
  VALUES (p_player_id, v_today, true, v_state.current_day, v_tier.dna_amount, v_energy_grant);

  IF v_state.current_day >= 28 THEN
    v_next_day := 1;
    v_cycle_completed := true;
  ELSE
    v_next_day := v_state.current_day + 1;
  END IF;

  UPDATE player_daily_state s SET
    current_day = v_next_day,
    last_claim_date = v_today,
    total_cycles_completed = s.total_cycles_completed + CASE WHEN v_cycle_completed THEN 1 ELSE 0 END,
    cycle_start_date = CASE WHEN v_cycle_completed THEN v_today ELSE s.cycle_start_date END,
    updated_at = NOW()
  WHERE s.player_id = p_player_id;

  RETURN QUERY SELECT v_state.current_day, v_tier.dna_amount, v_energy_grant, v_next_day, v_cycle_completed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
