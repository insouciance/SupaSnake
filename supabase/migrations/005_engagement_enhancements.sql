-- Migration 005: Engagement Enhancements
-- Adds last_login_at for passive progress and dynasty tracking for leaderboards

-- ============================================================================
-- PASSIVE PROGRESS: Last Login Tracking
-- ============================================================================

-- Add last_login_at column for passive progress calculation
ALTER TABLE players
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill existing players with their updated_at value
UPDATE players SET last_login_at = updated_at WHERE last_login_at IS NULL;

-- ============================================================================
-- DYNASTY LEADERBOARDS: Track dynasty per game session
-- ============================================================================

-- Add dynasty column to game_sessions for filtering
ALTER TABLE game_sessions
ADD COLUMN IF NOT EXISTS dynasty TEXT;

-- Index for dynasty leaderboard queries
CREATE INDEX IF NOT EXISTS idx_game_sessions_dynasty_score
ON game_sessions(dynasty, score DESC);

-- Index for combined dynasty + time range queries
CREATE INDEX IF NOT EXISTS idx_game_sessions_dynasty_started
ON game_sessions(dynasty, started_at DESC);

-- ============================================================================
-- ECONOMY TRANSACTIONS: Add offline_claim source type
-- ============================================================================

-- Update check constraint to include offline_claim
-- First drop existing constraint, then add new one
ALTER TABLE economy_transactions
DROP CONSTRAINT IF EXISTS economy_transactions_source_type_check;

ALTER TABLE economy_transactions
ADD CONSTRAINT economy_transactions_source_type_check
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
  'offline_claim'
));
