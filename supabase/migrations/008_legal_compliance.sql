-- ============================================================================
-- LEGAL & COMPLIANCE MIGRATION
-- Version: 008 (Fixed version of skipped 003_legal_analytics.sql)
-- Purpose: GDPR compliance, age verification, consent management
-- ============================================================================

-- ==============================================================================
-- AGE VERIFICATION (COPPA Compliance - 13+ requirement)
-- ==============================================================================

-- Add age verification columns to players table
ALTER TABLE players
ADD COLUMN IF NOT EXISTS age_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS age_verification_hash TEXT,
ADD COLUMN IF NOT EXISTS age_verified_at TIMESTAMPTZ;

-- Create age_verifications table for session-based verification (before account creation)
CREATE TABLE IF NOT EXISTS age_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  age_verified BOOLEAN NOT NULL,
  verification_hash TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);

CREATE INDEX IF NOT EXISTS idx_age_verifications_session
ON age_verifications(session_id);

CREATE INDEX IF NOT EXISTS idx_age_verifications_expires
ON age_verifications(expires_at);

-- ==============================================================================
-- CONSENT MANAGEMENT (GDPR ePrivacy Directive)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('analytics', 'marketing', 'functional')),
  consented BOOLEAN NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL,
  withdrawn_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT,
  consent_version TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user
ON user_consents(user_id);

CREATE INDEX IF NOT EXISTS idx_user_consents_type
ON user_consents(consent_type);

CREATE INDEX IF NOT EXISTS idx_user_consents_active
ON user_consents(user_id, consent_type)
WHERE withdrawn_at IS NULL;

-- ==============================================================================
-- GDPR REQUEST LOGS (Audit Trail)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS gdpr_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('export', 'delete', 'correct', 'object')),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
  request_data JSONB,
  response_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gdpr_requests_user
ON gdpr_requests(user_id);

CREATE INDEX IF NOT EXISTS idx_gdpr_requests_status
ON gdpr_requests(status);

CREATE INDEX IF NOT EXISTS idx_gdpr_requests_type
ON gdpr_requests(request_type);

-- ==============================================================================
-- ANALYTICS EVENTS (Server-side backup storage)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  event_properties JSONB,
  user_properties JSONB,
  device_id TEXT,
  session_id TEXT,
  platform TEXT,
  app_version TEXT,
  sent_to_amplitude BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user
ON analytics_events(user_id);

CREATE INDEX IF NOT EXISTS idx_analytics_events_name
ON analytics_events(event_name);

CREATE INDEX IF NOT EXISTS idx_analytics_events_unsent
ON analytics_events(created_at)
WHERE sent_to_amplitude = FALSE;

-- ==============================================================================
-- ROW LEVEL SECURITY
-- ==============================================================================

ALTER TABLE age_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdpr_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Age verifications: Public read (for session-based verification)
DROP POLICY IF EXISTS age_verifications_select ON age_verifications;
CREATE POLICY age_verifications_select
  ON age_verifications FOR SELECT
  TO anon, authenticated
  USING (true);

-- User consents: Users can view/update own consents
DROP POLICY IF EXISTS user_consents_select ON user_consents;
CREATE POLICY user_consents_select
  ON user_consents FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_consents_insert ON user_consents;
CREATE POLICY user_consents_insert
  ON user_consents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_consents_update ON user_consents;
CREATE POLICY user_consents_update
  ON user_consents FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- GDPR requests: Users can view/create own requests
DROP POLICY IF EXISTS gdpr_requests_select ON gdpr_requests;
CREATE POLICY gdpr_requests_select
  ON gdpr_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS gdpr_requests_insert ON gdpr_requests;
CREATE POLICY gdpr_requests_insert
  ON gdpr_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Analytics events: Users can view own events
DROP POLICY IF EXISTS analytics_events_select ON analytics_events;
CREATE POLICY analytics_events_select
  ON analytics_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ==============================================================================
-- HELPER FUNCTIONS
-- ==============================================================================

-- Function to get current user consent
CREATE OR REPLACE FUNCTION get_user_consent(p_user_id UUID, p_consent_type TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_consented BOOLEAN;
BEGIN
  SELECT consented INTO v_consented
  FROM user_consents
  WHERE user_id = p_user_id
    AND consent_type = p_consent_type
    AND withdrawn_at IS NULL
  ORDER BY consented_at DESC
  LIMIT 1;

  RETURN COALESCE(v_consented, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create GDPR export data (GDPR Article 15)
CREATE OR REPLACE FUNCTION export_user_data(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_player_id UUID;
BEGIN
  -- Get player_id from players table
  SELECT id INTO v_player_id
  FROM players
  WHERE user_id = p_user_id;

  SELECT jsonb_build_object(
    'user_id', p_user_id,
    'exported_at', NOW(),
    'data', jsonb_build_object(
      'profile', (
        SELECT jsonb_build_object(
          'username', username,
          'dna', dna,
          'energy', energy,
          'total_games_played', total_games_played,
          'high_score', high_score,
          'breeds_completed', breeds_completed,
          'age_verified', age_verified,
          'age_verified_at', age_verified_at,
          'created_at', created_at
        )
        FROM players
        WHERE user_id = p_user_id
      ),
      'snakes', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'variant_id', variant_id,
            'snake_variant_id', snake_variant_id,
            'generation', generation,
            'is_equipped', is_equipped,
            'is_favorited', is_favorited,
            'acquired_method', acquired_method,
            'acquired_at', acquired_at
          )
        )
        FROM collected_snakes
        WHERE player_id = v_player_id
      ),
      'game_sessions', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'score', score,
            'duration_seconds', duration_seconds,
            'dna_earned', dna_earned,
            'started_at', started_at,
            'ended_at', ended_at
          )
        )
        FROM game_sessions
        WHERE player_id = v_player_id
        ORDER BY started_at DESC
        LIMIT 100  -- Last 100 sessions
      ),
      'consents', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'type', consent_type,
            'consented', consented,
            'consented_at', consented_at,
            'withdrawn_at', withdrawn_at,
            'version', consent_version
          )
        )
        FROM user_consents
        WHERE user_id = p_user_id
      ),
      'gdpr_requests', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'type', request_type,
            'requested_at', requested_at,
            'completed_at', completed_at,
            'status', status
          )
        )
        FROM gdpr_requests
        WHERE user_id = p_user_id
      )
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to hard delete user data (GDPR Article 17 - Right to be Forgotten)
CREATE OR REPLACE FUNCTION delete_user_data(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_player_id UUID;
BEGIN
  -- Get player_id
  SELECT id INTO v_player_id
  FROM players
  WHERE user_id = p_user_id;

  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object('deleted', false, 'error', 'Player not found');
  END IF;

  -- Delete game data (order matters for foreign keys)
  DELETE FROM breeding_history WHERE parent1_id IN (
    SELECT id FROM collected_snakes WHERE player_id = v_player_id
  ) OR parent2_id IN (
    SELECT id FROM collected_snakes WHERE player_id = v_player_id
  );
  DELETE FROM collected_snakes WHERE player_id = v_player_id;
  DELETE FROM game_sessions WHERE player_id = v_player_id;
  DELETE FROM player_achievements WHERE player_id = v_player_id;
  DELETE FROM player_streaks WHERE player_id = v_player_id;
  DELETE FROM player_daily_state WHERE player_id = v_player_id;
  DELETE FROM player_battle_pass WHERE player_id = v_player_id;
  DELETE FROM player_settings WHERE player_id = v_player_id;

  -- Delete clan membership
  DELETE FROM clan_members WHERE player_id = p_user_id;

  -- Delete legal/compliance data
  DELETE FROM user_consents WHERE user_id = p_user_id;
  DELETE FROM analytics_events WHERE user_id = p_user_id;

  -- Mark GDPR requests as completed (keep for audit)
  UPDATE gdpr_requests
  SET status = 'completed',
      completed_at = NOW(),
      response_data = jsonb_build_object('deleted_at', NOW())
  WHERE user_id = p_user_id AND status = 'pending';

  -- Delete player profile
  DELETE FROM players WHERE user_id = p_user_id;

  -- Return summary
  v_result := jsonb_build_object(
    'deleted', true,
    'deleted_at', NOW(),
    'user_id', p_user_id
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup function for expired age verifications
CREATE OR REPLACE FUNCTION cleanup_expired_age_verifications()
RETURNS void AS $$
BEGIN
  DELETE FROM age_verifications WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- COMMENTS
-- ==============================================================================

COMMENT ON TABLE age_verifications IS 'COPPA compliance: Age verification records (13+ requirement)';
COMMENT ON TABLE user_consents IS 'GDPR/ePrivacy: User consent for analytics, marketing, functional cookies';
COMMENT ON TABLE gdpr_requests IS 'GDPR Article 15-20: Audit trail for data subject requests';
COMMENT ON TABLE analytics_events IS 'Optional: Local analytics event storage (backup for Amplitude)';

COMMENT ON FUNCTION get_user_consent(UUID, TEXT) IS 'Get current consent status for user and type';
COMMENT ON FUNCTION export_user_data(UUID) IS 'GDPR Article 15: Export all user data in JSON format';
COMMENT ON FUNCTION delete_user_data(UUID) IS 'GDPR Article 17: Hard delete all user data (right to be forgotten)';
