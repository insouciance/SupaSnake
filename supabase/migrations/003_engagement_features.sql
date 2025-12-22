-- Migration 003: Engagement Features
-- Daily rewards, achievements, streaks, and battle pass

-- ============================================================================
-- DAILY REWARDS - Configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS daily_reward_tiers (
  day_number INTEGER PRIMARY KEY,
  dna_amount INTEGER NOT NULL,
  energy_amount INTEGER NOT NULL DEFAULT 0,
  bonus_type TEXT CHECK (bonus_type IN ('milestone', 'cycle_complete', NULL))
);

-- Seed daily rewards (28-day cycle)
INSERT INTO daily_reward_tiers (day_number, dna_amount, energy_amount, bonus_type) VALUES
(1, 50, 0, NULL), (2, 50, 0, NULL), (3, 50, 0, NULL),
(4, 50, 0, NULL), (5, 50, 0, NULL), (6, 50, 0, NULL),
(7, 200, 2, 'milestone'),
(8, 75, 0, NULL), (9, 75, 0, NULL), (10, 75, 0, NULL),
(11, 75, 0, NULL), (12, 75, 0, NULL), (13, 75, 0, NULL),
(14, 300, 3, 'milestone'),
(15, 100, 0, NULL), (16, 100, 0, NULL), (17, 100, 0, NULL),
(18, 100, 0, NULL), (19, 100, 0, NULL), (20, 100, 0, NULL),
(21, 500, 5, 'milestone'),
(22, 150, 0, NULL), (23, 150, 0, NULL), (24, 150, 0, NULL),
(25, 150, 0, NULL), (26, 150, 0, NULL), (27, 150, 0, NULL),
(28, 1000, 10, 'cycle_complete')
ON CONFLICT (day_number) DO NOTHING;

-- ============================================================================
-- DAILY REWARDS - Player State
-- ============================================================================
CREATE TABLE IF NOT EXISTS player_daily_state (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  current_day INTEGER NOT NULL DEFAULT 1,
  cycle_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  last_claim_date DATE,
  total_cycles_completed INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- DAILY REWARDS - Login History
-- ============================================================================
CREATE TABLE IF NOT EXISTS daily_logins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  login_date DATE NOT NULL,
  reward_claimed BOOLEAN NOT NULL DEFAULT false,
  reward_day INTEGER NOT NULL,
  reward_dna INTEGER NOT NULL DEFAULT 0,
  reward_energy INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(player_id, login_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_logins_player_date ON daily_logins(player_id, login_date DESC);

-- ============================================================================
-- ACHIEVEMENTS - Definitions
-- ============================================================================
CREATE TABLE IF NOT EXISTS achievement_definitions (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('games', 'dna', 'breeding', 'collection', 'score', 'streak')),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  tier INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 3),
  requirement_value INTEGER NOT NULL,
  reward_dna INTEGER NOT NULL DEFAULT 0,
  reward_energy INTEGER NOT NULL DEFAULT 0,
  hidden BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Seed achievements
INSERT INTO achievement_definitions (id, category, name, description, icon, tier, requirement_value, reward_dna, reward_energy, sort_order) VALUES
-- Games played achievements
('games_10', 'games', 'Beginner', 'Play 10 games', 'game', 1, 10, 100, 1, 1),
('games_50', 'games', 'Regular', 'Play 50 games', 'game', 2, 50, 300, 2, 2),
('games_100', 'games', 'Dedicated', 'Play 100 games', 'game', 3, 100, 1000, 5, 3),
-- DNA achievements
('dna_1000', 'dna', 'Collector', 'Earn 1,000 DNA', 'dna', 1, 1000, 100, 0, 10),
('dna_10000', 'dna', 'Gatherer', 'Earn 10,000 DNA', 'dna', 2, 10000, 500, 2, 11),
('dna_50000', 'dna', 'Hoarder', 'Earn 50,000 DNA', 'dna', 3, 50000, 2000, 5, 12),
-- Breeding achievements
('breed_5', 'breeding', 'Breeder', 'Breed 5 snakes', 'breed', 1, 5, 200, 1, 20),
('breed_20', 'breeding', 'Geneticist', 'Breed 20 snakes', 'breed', 2, 20, 500, 3, 21),
('breed_50', 'breeding', 'Master Breeder', 'Breed 50 snakes', 'breed', 3, 50, 1500, 5, 22),
-- Collection achievements
('collect_10', 'collection', 'Collector', 'Collect 10 unique variants', 'collection', 1, 10, 300, 2, 30),
('collect_20', 'collection', 'Curator', 'Collect 20 unique variants', 'collection', 2, 20, 800, 3, 31),
('collect_30', 'collection', 'Completionist', 'Collect all 30 variants', 'collection', 3, 30, 3000, 10, 32),
-- Score achievements
('score_50', 'score', 'Scorer', 'Reach score 50 in a game', 'score', 1, 50, 150, 1, 40),
('score_100', 'score', 'Champion', 'Reach score 100 in a game', 'score', 2, 100, 500, 3, 41),
('score_150', 'score', 'Legend', 'Reach score 150 in a game', 'score', 3, 150, 2000, 5, 42),
-- Streak achievements
('streak_3', 'streak', 'Consistent', 'Play 3 days in a row', 'streak', 1, 3, 100, 1, 50),
('streak_7', 'streak', 'Devoted', 'Play 7 days in a row', 'streak', 2, 7, 400, 2, 51),
('streak_30', 'streak', 'Unstoppable', 'Play 30 days in a row', 'streak', 3, 30, 2000, 10, 52)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- ACHIEVEMENTS - Player Progress
-- ============================================================================
CREATE TABLE IF NOT EXISTS player_achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES achievement_definitions(id),
  progress INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  reward_claimed BOOLEAN NOT NULL DEFAULT false,
  reward_claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(player_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_player_achievements_player ON player_achievements(player_id);
CREATE INDEX IF NOT EXISTS idx_player_achievements_unclaimed ON player_achievements(player_id) WHERE completed = true AND reward_claimed = false;

-- ============================================================================
-- STREAKS
-- ============================================================================
CREATE TABLE IF NOT EXISTS player_streaks (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_play_date DATE,
  streak_multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.0,
  grace_period_used BOOLEAN NOT NULL DEFAULT false,
  grace_period_available BOOLEAN NOT NULL DEFAULT true,
  streak_frozen_until DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Streak bonus tiers
CREATE TABLE IF NOT EXISTS streak_bonus_tiers (
  streak_days INTEGER PRIMARY KEY,
  dna_multiplier DECIMAL(3,2) NOT NULL,
  energy_bonus INTEGER NOT NULL DEFAULT 0
);

INSERT INTO streak_bonus_tiers (streak_days, dna_multiplier, energy_bonus) VALUES
(3, 1.10, 0),
(7, 1.25, 1),
(14, 1.50, 2),
(30, 2.00, 3)
ON CONFLICT (streak_days) DO NOTHING;

-- ============================================================================
-- BATTLE PASS - Seasons
-- ============================================================================
CREATE TABLE IF NOT EXISTS battle_pass_seasons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_number INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  theme TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  max_level INTEGER NOT NULL DEFAULT 50,
  xp_per_level INTEGER NOT NULL DEFAULT 1000,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- BATTLE PASS - Tier Rewards
-- ============================================================================
CREATE TABLE IF NOT EXISTS battle_pass_tiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES battle_pass_seasons(id) ON DELETE CASCADE,
  level INTEGER NOT NULL,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  reward_type TEXT NOT NULL CHECK (reward_type IN ('dna', 'energy', 'variant', 'cosmetic', 'title')),
  reward_id TEXT,
  reward_amount INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(season_id, level, is_premium)
);

CREATE INDEX IF NOT EXISTS idx_battle_pass_tiers_season ON battle_pass_tiers(season_id, level);

-- ============================================================================
-- BATTLE PASS - Player Progress
-- ============================================================================
CREATE TABLE IF NOT EXISTS player_battle_pass (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season_id UUID NOT NULL REFERENCES battle_pass_seasons(id) ON DELETE CASCADE,
  current_xp INTEGER NOT NULL DEFAULT 0,
  current_level INTEGER NOT NULL DEFAULT 1,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  premium_purchased_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(player_id, season_id)
);

CREATE INDEX IF NOT EXISTS idx_player_battle_pass_season ON player_battle_pass(player_id, season_id);

-- ============================================================================
-- BATTLE PASS - Claimed Rewards
-- ============================================================================
CREATE TABLE IF NOT EXISTS player_battle_pass_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season_id UUID NOT NULL REFERENCES battle_pass_seasons(id) ON DELETE CASCADE,
  tier_id UUID NOT NULL REFERENCES battle_pass_tiers(id) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(player_id, tier_id)
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE daily_reward_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_daily_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logins ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievement_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE streak_bonus_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_pass_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_pass_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_battle_pass ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_battle_pass_claims ENABLE ROW LEVEL SECURITY;

-- Public read for configuration tables
DROP POLICY IF EXISTS daily_reward_tiers_public_read ON daily_reward_tiers;
CREATE POLICY daily_reward_tiers_public_read ON daily_reward_tiers FOR SELECT USING (true);

DROP POLICY IF EXISTS achievement_definitions_public_read ON achievement_definitions;
CREATE POLICY achievement_definitions_public_read ON achievement_definitions FOR SELECT USING (true);

DROP POLICY IF EXISTS streak_bonus_tiers_public_read ON streak_bonus_tiers;
CREATE POLICY streak_bonus_tiers_public_read ON streak_bonus_tiers FOR SELECT USING (true);

DROP POLICY IF EXISTS battle_pass_seasons_public_read ON battle_pass_seasons;
CREATE POLICY battle_pass_seasons_public_read ON battle_pass_seasons FOR SELECT USING (true);

DROP POLICY IF EXISTS battle_pass_tiers_public_read ON battle_pass_tiers;
CREATE POLICY battle_pass_tiers_public_read ON battle_pass_tiers FOR SELECT USING (true);

-- User can read own progress
DROP POLICY IF EXISTS player_daily_state_select_own ON player_daily_state;
CREATE POLICY player_daily_state_select_own ON player_daily_state
  FOR SELECT USING (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS daily_logins_select_own ON daily_logins;
CREATE POLICY daily_logins_select_own ON daily_logins
  FOR SELECT USING (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS player_achievements_select_own ON player_achievements;
CREATE POLICY player_achievements_select_own ON player_achievements
  FOR SELECT USING (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS player_streaks_select_own ON player_streaks;
CREATE POLICY player_streaks_select_own ON player_streaks
  FOR SELECT USING (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS player_battle_pass_select_own ON player_battle_pass;
CREATE POLICY player_battle_pass_select_own ON player_battle_pass
  FOR SELECT USING (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS player_battle_pass_claims_select_own ON player_battle_pass_claims;
CREATE POLICY player_battle_pass_claims_select_own ON player_battle_pass_claims
  FOR SELECT USING (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()));
