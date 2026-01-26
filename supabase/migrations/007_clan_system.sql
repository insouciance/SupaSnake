-- ============================================================================
-- CLAN SYSTEM MIGRATION
-- Per SO-001: 40% of DAU target in clans
-- Per SO-002: No daily requirements
-- ============================================================================

-- ============================================================================
-- CLANS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS clans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tag TEXT NOT NULL UNIQUE,              -- 2-6 uppercase alphanumeric
  description TEXT DEFAULT '',
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_count INT NOT NULL DEFAULT 1,
  max_members INT NOT NULL DEFAULT 50,   -- 20-50 per game docs
  total_score INT NOT NULL DEFAULT 0,
  weekly_score INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT clan_name_length CHECK (char_length(name) >= 3 AND char_length(name) <= 20),
  CONSTRAINT clan_tag_format CHECK (tag ~ '^[A-Z0-9]{2,6}$'),
  CONSTRAINT clan_member_limits CHECK (max_members >= 20 AND max_members <= 50)
);

-- Indexes for clans
CREATE INDEX IF NOT EXISTS idx_clans_owner ON clans(owner_id);
CREATE INDEX IF NOT EXISTS idx_clans_member_count ON clans(member_count DESC);
CREATE INDEX IF NOT EXISTS idx_clans_weekly_score ON clans(weekly_score DESC);
CREATE INDEX IF NOT EXISTS idx_clans_tag ON clans(tag);

-- ============================================================================
-- CLAN MEMBERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS clan_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',   -- 'owner', 'officer', 'member'
  weekly_contribution INT NOT NULL DEFAULT 0,
  total_contribution INT NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_clan_bonus_at TIMESTAMPTZ,        -- For energy bonus tracking (SO-001)

  -- Each player can only be in one clan
  UNIQUE(player_id),

  -- Role validation
  CONSTRAINT valid_clan_role CHECK (role IN ('owner', 'officer', 'member'))
);

-- Indexes for clan_members
CREATE INDEX IF NOT EXISTS idx_clan_members_clan ON clan_members(clan_id);
CREATE INDEX IF NOT EXISTS idx_clan_members_player ON clan_members(player_id);
CREATE INDEX IF NOT EXISTS idx_clan_members_role ON clan_members(clan_id, role);
CREATE INDEX IF NOT EXISTS idx_clan_members_contribution ON clan_members(clan_id, weekly_contribution DESC);

-- ============================================================================
-- CLAN INVITES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS clan_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),

  -- Prevent duplicate pending invites
  UNIQUE(clan_id, player_id, status),

  -- Status validation
  CONSTRAINT valid_invite_status CHECK (status IN ('pending', 'accepted', 'declined', 'expired'))
);

-- Indexes for clan_invites
CREATE INDEX IF NOT EXISTS idx_clan_invites_player ON clan_invites(player_id, status);
CREATE INDEX IF NOT EXISTS idx_clan_invites_clan ON clan_invites(clan_id, status);
CREATE INDEX IF NOT EXISTS idx_clan_invites_expires ON clan_invites(expires_at) WHERE status = 'pending';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to safely decrement clan members (called when player leaves)
CREATE OR REPLACE FUNCTION decrement_clan_members(p_clan_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE clans
  SET member_count = GREATEST(member_count - 1, 0),
      updated_at = NOW()
  WHERE id = p_clan_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add contribution to clan (called after game session)
CREATE OR REPLACE FUNCTION add_clan_contribution(
  p_player_id UUID,
  p_score INT
)
RETURNS VOID AS $$
DECLARE
  v_clan_id UUID;
BEGIN
  -- Get player's clan
  SELECT clan_id INTO v_clan_id
  FROM clan_members
  WHERE player_id = p_player_id;

  IF v_clan_id IS NOT NULL THEN
    -- Update member contribution
    UPDATE clan_members
    SET weekly_contribution = weekly_contribution + p_score,
        total_contribution = total_contribution + p_score
    WHERE player_id = p_player_id;

    -- Update clan scores
    UPDATE clans
    SET weekly_score = weekly_score + p_score,
        total_score = total_score + p_score,
        updated_at = NOW()
    WHERE id = v_clan_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to claim clan energy bonus (SO-001: +1 energy every 6 hours)
CREATE OR REPLACE FUNCTION claim_clan_energy_bonus(p_player_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_member RECORD;
  v_hours_since_claim FLOAT;
  v_bonus_interval_hours INT := 6;
BEGIN
  -- Get membership info
  SELECT * INTO v_member
  FROM clan_members
  WHERE player_id = p_player_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not in a clan');
  END IF;

  -- Check if bonus available
  IF v_member.last_clan_bonus_at IS NOT NULL THEN
    v_hours_since_claim := EXTRACT(EPOCH FROM (NOW() - v_member.last_clan_bonus_at)) / 3600;

    IF v_hours_since_claim < v_bonus_interval_hours THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Bonus not ready',
        'next_available_in_hours', v_bonus_interval_hours - v_hours_since_claim
      );
    END IF;
  END IF;

  -- Grant bonus
  UPDATE players
  SET energy = LEAST(energy + 1, max_energy + 1)  -- Allow +1 over max from clan bonus
  WHERE user_id = p_player_id;

  -- Update last claim time
  UPDATE clan_members
  SET last_clan_bonus_at = NOW()
  WHERE player_id = p_player_id;

  RETURN jsonb_build_object('success', true, 'energy_granted', 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reset weekly scores (should be called by cron job)
CREATE OR REPLACE FUNCTION reset_weekly_clan_scores()
RETURNS VOID AS $$
BEGIN
  UPDATE clans SET weekly_score = 0, updated_at = NOW();
  UPDATE clan_members SET weekly_contribution = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at on clans
CREATE TRIGGER clans_updated_at
  BEFORE UPDATE ON clans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all clan tables
ALTER TABLE clans ENABLE ROW LEVEL SECURITY;
ALTER TABLE clan_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE clan_invites ENABLE ROW LEVEL SECURITY;

-- Clans: Anyone can read, only owner can modify
DROP POLICY IF EXISTS clans_select ON clans;
CREATE POLICY clans_select ON clans
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS clans_insert ON clans;
CREATE POLICY clans_insert ON clans
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS clans_update ON clans;
CREATE POLICY clans_update ON clans
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS clans_delete ON clans;
CREATE POLICY clans_delete ON clans
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Clan Members: Anyone can read, only own membership can be modified
DROP POLICY IF EXISTS clan_members_select ON clan_members;
CREATE POLICY clan_members_select ON clan_members
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS clan_members_insert ON clan_members;
CREATE POLICY clan_members_insert ON clan_members
  FOR INSERT TO authenticated
  WITH CHECK (player_id = auth.uid());

DROP POLICY IF EXISTS clan_members_delete ON clan_members;
CREATE POLICY clan_members_delete ON clan_members
  FOR DELETE TO authenticated
  USING (player_id = auth.uid());

-- Clan Invites: Can see own invites, officers/owners can create
DROP POLICY IF EXISTS clan_invites_select ON clan_invites;
CREATE POLICY clan_invites_select ON clan_invites
  FOR SELECT TO authenticated
  USING (
    player_id = auth.uid() OR
    invited_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM clan_members cm
      WHERE cm.clan_id = clan_invites.clan_id
      AND cm.player_id = auth.uid()
      AND cm.role IN ('owner', 'officer')
    )
  );

DROP POLICY IF EXISTS clan_invites_insert ON clan_invites;
CREATE POLICY clan_invites_insert ON clan_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clan_members cm
      WHERE cm.clan_id = clan_invites.clan_id
      AND cm.player_id = auth.uid()
      AND cm.role IN ('owner', 'officer')
    )
  );

DROP POLICY IF EXISTS clan_invites_update ON clan_invites;
CREATE POLICY clan_invites_update ON clan_invites
  FOR UPDATE TO authenticated
  USING (player_id = auth.uid());
