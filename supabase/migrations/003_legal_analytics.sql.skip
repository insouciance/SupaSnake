-- Migration: Legal & Analytics Infrastructure
-- Version: 003
-- Created: 2025-10-19
-- Purpose: Add GDPR compliance, age verification, consent management, and analytics tracking

-- ==============================================================================
-- AGE VERIFICATION (COPPA Compliance)
-- ==============================================================================

-- Add age verification columns to player_profiles
ALTER TABLE player_profiles
ADD COLUMN IF NOT EXISTS age_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS age_verification_hash TEXT,
ADD COLUMN IF NOT EXISTS age_verified_at TIMESTAMPTZ;

-- Create age_verifications table for session-based verification
-- (before user creates account)
CREATE TABLE IF NOT EXISTS age_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Create cleanup function for expired verifications
CREATE OR REPLACE FUNCTION cleanup_expired_age_verifications()
RETURNS void AS $$
BEGIN
  DELETE FROM age_verifications WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- CONSENT MANAGEMENT (GDPR ePrivacy Directive)
-- ==============================================================================

-- Create user_consents table
CREATE TABLE IF NOT EXISTS user_consents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Create gdpr_requests table for tracking data subject requests
CREATE TABLE IF NOT EXISTS gdpr_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
-- ANALYTICS EVENTS (Optional - for server-side event storage)
-- ==============================================================================

-- Create analytics_events table for local event storage
-- (Amplitude/Statsig are primary, this is backup/offline queue)
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
-- ROW LEVEL SECURITY (RLS)
-- ==============================================================================

-- Enable RLS on all new tables
ALTER TABLE age_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdpr_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Age verifications: Public read (no auth), service role write
CREATE POLICY "Anyone can read age verifications"
  ON age_verifications FOR SELECT
  TO anon, authenticated
  USING (true);

-- User consents: Users can view/update own consents
CREATE POLICY "Users can view own consents"
  ON user_consents FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own consents"
  ON user_consents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own consents"
  ON user_consents FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- GDPR requests: Users can view/create own requests
CREATE POLICY "Users can view own GDPR requests"
  ON gdpr_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create GDPR requests"
  ON gdpr_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Analytics events: Users can view own events
CREATE POLICY "Users can view own analytics events"
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

-- Function to create GDPR export data
CREATE OR REPLACE FUNCTION export_user_data(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'user_id', p_user_id,
    'exported_at', NOW(),
    'data', jsonb_build_object(
      'profile', (
        SELECT jsonb_build_object(
          'username', username,
          'created_at', created_at,
          'age_verified', age_verified,
          'age_verified_at', age_verified_at
        )
        FROM player_profiles
        WHERE user_id = p_user_id
      ),
      'game_data', (
        SELECT jsonb_build_object(
          'dna', dna,
          'level', level,
          'experience', experience,
          'energy', energy,
          'updated_at', updated_at
        )
        FROM player_stats ps
        JOIN player_profiles pp ON ps.player_id = pp.id
        WHERE pp.user_id = p_user_id
      ),
      'variants', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'variant_id', variant_id,
            'rarity', rarity,
            'generation', generation,
            'acquired_at', acquired_at
          )
        )
        FROM player_variants pv
        JOIN player_profiles pp ON pv.player_id = pp.id
        WHERE pp.user_id = p_user_id
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

-- Function to hard delete user data (GDPR Article 17)
CREATE OR REPLACE FUNCTION delete_user_data(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_player_id UUID;
BEGIN
  -- Get player_id
  SELECT id INTO v_player_id
  FROM player_profiles
  WHERE user_id = p_user_id;

  -- Delete game data (cascades via foreign keys)
  DELETE FROM player_variants WHERE player_id = v_player_id;
  DELETE FROM player_stats WHERE player_id = v_player_id;
  DELETE FROM game_sessions WHERE player_id = v_player_id;

  -- Delete legal/compliance data
  DELETE FROM age_verifications WHERE session_id IN (
    SELECT session_id FROM player_profiles WHERE user_id = p_user_id
  );
  DELETE FROM user_consents WHERE user_id = p_user_id;
  DELETE FROM analytics_events WHERE user_id = p_user_id;

  -- Delete GDPR requests (keep audit log for legal requirement)
  -- UPDATE gdpr_requests SET response_data = jsonb_build_object('deleted_at', NOW())
  -- WHERE user_id = p_user_id;

  -- Delete player profile
  DELETE FROM player_profiles WHERE user_id = p_user_id;

  -- Return summary
  v_result := jsonb_build_object(
    'deleted', true,
    'deleted_at', NOW(),
    'user_id', p_user_id
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- COMMENTS (Documentation)
-- ==============================================================================

COMMENT ON TABLE age_verifications IS 'COPPA compliance: Age verification records (13+ requirement)';
COMMENT ON TABLE user_consents IS 'GDPR/ePrivacy: User consent for analytics, marketing, functional cookies';
COMMENT ON TABLE gdpr_requests IS 'GDPR Article 15-20: Audit trail for data subject requests';
COMMENT ON TABLE analytics_events IS 'Optional: Local analytics event storage (backup for Amplitude)';

COMMENT ON FUNCTION cleanup_expired_age_verifications() IS 'Scheduled cleanup: Remove age verifications older than 7 days';
COMMENT ON FUNCTION get_user_consent(UUID, TEXT) IS 'Get current consent status for user and type';
COMMENT ON FUNCTION export_user_data(UUID) IS 'GDPR Article 15: Export all user data in JSON format';
COMMENT ON FUNCTION delete_user_data(UUID) IS 'GDPR Article 17: Hard delete all user data (right to be forgotten)';

-- ==============================================================================
-- SCHEDULED JOBS (pg_cron or Supabase Edge Functions)
-- ==============================================================================

-- Note: Requires pg_cron extension or Supabase Edge Function
-- Uncomment if pg_cron is available:

-- SELECT cron.schedule(
--   'cleanup-expired-age-verifications',
--   '0 2 * * *', -- Run daily at 2 AM
--   $$SELECT cleanup_expired_age_verifications()$$
-- );

-- ==============================================================================
-- MIGRATION COMPLETE
-- ==============================================================================

-- Verify tables exist
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'age_verifications') = 1,
    'age_verifications table not created';
  ASSERT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'user_consents') = 1,
    'user_consents table not created';
  ASSERT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'gdpr_requests') = 1,
    'gdpr_requests table not created';
  ASSERT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'analytics_events') = 1,
    'analytics_events table not created';

  RAISE NOTICE 'Migration 003: Legal & Analytics Infrastructure - COMPLETE';
END $$;
