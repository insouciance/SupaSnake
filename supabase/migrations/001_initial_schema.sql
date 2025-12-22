-- SupaSnake Database Schema
-- Server Authority: All game state managed server-side
-- AAA 2026 Standard: No game progress in localStorage

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PLAYERS TABLE
-- ============================================================================
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT,

  -- Resources
  dna INTEGER NOT NULL DEFAULT 0,
  energy INTEGER NOT NULL DEFAULT 5,
  max_energy INTEGER NOT NULL DEFAULT 5,
  energy_regen_at TIMESTAMPTZ,

  -- Stats
  total_games_played INTEGER NOT NULL DEFAULT 0,
  total_dna_earned INTEGER NOT NULL DEFAULT 0,
  high_score INTEGER NOT NULL DEFAULT 0,
  breeds_completed INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id)
);

-- ============================================================================
-- COLLECTED_SNAKES TABLE
-- Player's snake collection (instances)
-- ============================================================================
CREATE TABLE collected_snakes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  -- Variant reference
  variant_id TEXT NOT NULL, -- e.g., "EMBER_1", "CRYSTAL_5"

  -- Breeding lineage
  generation INTEGER NOT NULL DEFAULT 1,
  parent1_id UUID REFERENCES collected_snakes(id) ON DELETE SET NULL,
  parent2_id UUID REFERENCES collected_snakes(id) ON DELETE SET NULL,

  -- Timestamps
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Indexes
  CONSTRAINT valid_generation CHECK (generation > 0)
);

CREATE INDEX idx_collected_snakes_player ON collected_snakes(player_id);
CREATE INDEX idx_collected_snakes_variant ON collected_snakes(variant_id);

-- ============================================================================
-- PLAYER_SETTINGS TABLE
-- Active snake, preferences, etc.
-- ============================================================================
CREATE TABLE player_settings (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,

  -- Active snake
  active_snake_id UUID REFERENCES collected_snakes(id) ON DELETE SET NULL,

  -- UI Preferences (can be in localStorage per AAA 2026)
  -- But tracking server-side for cross-device sync
  selected_dynasty TEXT DEFAULT 'EMBER',

  -- Timestamps
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- GAME_SESSIONS TABLE
-- Track individual game sessions for analytics
-- ============================================================================
CREATE TABLE game_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  -- Session info
  snake_used_id UUID REFERENCES collected_snakes(id) ON DELETE SET NULL,
  variant_id TEXT NOT NULL,

  -- Results
  score INTEGER NOT NULL DEFAULT 0,
  dna_earned INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  died BOOLEAN NOT NULL DEFAULT false,
  victory BOOLEAN NOT NULL DEFAULT false,

  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX idx_game_sessions_player ON game_sessions(player_id);
CREATE INDEX idx_game_sessions_started ON game_sessions(started_at DESC);

-- ============================================================================
-- BREEDING_HISTORY TABLE
-- Track all breeding events
-- ============================================================================
CREATE TABLE breeding_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  -- Parents
  parent1_id UUID NOT NULL REFERENCES collected_snakes(id) ON DELETE CASCADE,
  parent2_id UUID NOT NULL REFERENCES collected_snakes(id) ON DELETE CASCADE,

  -- Result
  child_id UUID REFERENCES collected_snakes(id) ON DELETE SET NULL,

  -- Cost
  dna_cost INTEGER NOT NULL,

  -- Timestamp
  bred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_breeding_history_player ON breeding_history(player_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE collected_snakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE breeding_history ENABLE ROW LEVEL SECURITY;

-- Players: Users can only see/edit their own data
CREATE POLICY players_select_own ON players
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY players_update_own ON players
  FOR UPDATE USING (auth.uid() = user_id);

-- Collected Snakes: Users can only see their own snakes
CREATE POLICY collected_snakes_select_own ON collected_snakes
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE POLICY collected_snakes_insert_own ON collected_snakes
  FOR INSERT WITH CHECK (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- Player Settings: Users can only see/edit their own settings
CREATE POLICY player_settings_select_own ON player_settings
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE POLICY player_settings_update_own ON player_settings
  FOR UPDATE USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- Game Sessions: Users can only see their own sessions
CREATE POLICY game_sessions_select_own ON game_sessions
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE POLICY game_sessions_insert_own ON game_sessions
  FOR INSERT WITH CHECK (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- Breeding History: Users can only see their own breeding history
CREATE POLICY breeding_history_select_own ON breeding_history
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE POLICY breeding_history_insert_own ON breeding_history
  FOR INSERT WITH CHECK (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Update player's updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables
CREATE TRIGGER players_updated_at
  BEFORE UPDATE ON players
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER player_settings_updated_at
  BEFORE UPDATE ON player_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- AUTO-CREATE PLAYER ON USER SIGNUP
-- ============================================================================

-- Function to create a player record when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.players (user_id, energy, max_energy, dna)
  VALUES (NEW.id, 5, 5, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users to auto-create player
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- INITIAL DATA / SEED
-- ============================================================================

-- Players are auto-created via the handle_new_user trigger
