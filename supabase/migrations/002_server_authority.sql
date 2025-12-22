-- Migration 002: Server Authority & Anti-Cheat
-- Adds rate limiting, purchase history, and economy audit trail

-- ============================================================================
-- RATE LIMITING TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('game_start', 'breeding', 'purchase')),
  last_action_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(player_id, action_type)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_player_action ON rate_limits(player_id, action_type);

-- ============================================================================
-- PURCHASE HISTORY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS purchase_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  -- Stripe data
  stripe_session_id TEXT UNIQUE NOT NULL,
  stripe_payment_intent_id TEXT,

  -- Product data
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',

  -- Rewards granted
  rewards_granted JSONB NOT NULL,

  -- Status
  status TEXT NOT NULL CHECK (status IN ('completed', 'refunded', 'disputed')),
  refunded_at TIMESTAMPTZ,

  -- Timestamps
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_history_player ON purchase_history(player_id);
CREATE INDEX IF NOT EXISTS idx_purchase_history_stripe ON purchase_history(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_purchase_history_date ON purchase_history(purchased_at DESC);

-- ============================================================================
-- ECONOMY TRANSACTIONS AUDIT TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS economy_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  -- Transaction type
  resource_type TEXT NOT NULL CHECK (resource_type IN ('dna', 'energy')),
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,

  -- Source tracking
  source_type TEXT NOT NULL CHECK (source_type IN (
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
    'battle_pass_reward'
  )),
  source_id UUID,

  -- Metadata
  metadata JSONB,

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_economy_transactions_player ON economy_transactions(player_id);
CREATE INDEX IF NOT EXISTS idx_economy_transactions_type ON economy_transactions(resource_type);
CREATE INDEX IF NOT EXISTS idx_economy_transactions_source ON economy_transactions(source_type);
CREATE INDEX IF NOT EXISTS idx_economy_transactions_date ON economy_transactions(created_at DESC);

-- ============================================================================
-- GAME SESSION ENHANCEMENTS
-- ============================================================================
ALTER TABLE game_sessions
ADD COLUMN IF NOT EXISTS server_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS validated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS validation_errors JSONB,
ADD COLUMN IF NOT EXISTS foods_collected INTEGER DEFAULT 0;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE economy_transactions ENABLE ROW LEVEL SECURITY;

-- Rate limits: Service role only (API routes)
DROP POLICY IF EXISTS rate_limits_service_only ON rate_limits;
CREATE POLICY rate_limits_service_only ON rate_limits
  FOR ALL USING (false);

-- Purchase history: Users can read own history
DROP POLICY IF EXISTS purchase_history_select_own ON purchase_history;
CREATE POLICY purchase_history_select_own ON purchase_history
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- Economy transactions: Users can read own transactions
DROP POLICY IF EXISTS economy_transactions_select_own ON economy_transactions;
CREATE POLICY economy_transactions_select_own ON economy_transactions
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );
