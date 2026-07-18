-- ============================================================================
-- Migration 024: Clan Identity & Discord (Player Identity v1, Phase I3)
-- PLAYER_IDENTITY_V1.md section 8 - the plan-of-record is "Identity v1"
-- (investigate-this-repo-it-rosy-charm).
--
-- 1. CLAN VISUAL IDENTITY (section 8.1): clans gains banner_id, emblem_id,
--    color_primary, color_secondary (hex-checked). update_clan_identity
--    RPC: caller must be owner/officer AND the clan must own the Heraldry
--    research (020 tree finally buys pixels):
--      heraldry_1 -> banner + emblem + both colors become editable
--      heraldry_2 -> victory fanfare at duel settlement (client render,
--                    no column - read from clan_research)
--      heraldry_3 -> board frame rendering in counted runs (client render)
--      heraldry_4 -> animated clan title (client render)
--    RLS on clans STAYS owner-only - officers mutate through the RPC.
-- 2. ROSTER & OFFICERS (section 8.2): set_clan_member_role (owner
--    promotes/demotes officer/member - NEVER owner transfer, that stays
--    on the existing ownership path) and respond_clan_invite (the 007
--    invites schema finally gets its UI): ATOMIC accept - member insert
--    + member_count bump + expire the player's other pending invites -
--    plus the decline path.
-- 3. DISCORD LINKS (section 8.3): discord_links - per-player OAuth grant.
--    Tokens are AES-256-GCM APP-LAYER ENCRYPTED (DISCORD_TOKEN_ENC_KEY;
--    pgsodium rejected - deprecated on Supabase and keeps decryption
--    in-DB). DENY-ALL RLS: no policies, service-role access only. Tokens
--    never reach the client, never appear in logs.
-- 4. CLAN SPACES (section 8.3, BOTH models): discord_clan_links - the
--    provisioned channel + role + webhook for a clan. guild_id rides
--    along: official-guild rows store the official guild id; the
--    clan-own-server model (Model B) stores the clan's guild. Clan
--    members may SELECT (channel/guild ids feed deep links + widget);
--    the webhook token column is app-layer encrypted so a member read
--    leaks nothing postable.
-- 5. EVENT OUTBOX (section 8.4): discord_event_outbox - settlement is
--    lazy in-SQL (no cron existed before this phase), so producers
--    (settlement SQL, session route) enqueue and the 5-minute Vercel
--    cron /api/discord/dispatch (+ opportunistic drains) consumes.
--    Dead-letter after 5 attempts. dedup_key makes every producer
--    idempotent. DENY-ALL RLS.
-- 6. PRODUCERS: gauntlet_try_unlock re-declared FROM THE 020 BODY
--    (current owner - 021/022/023 did not touch it) with an IDENTICAL
--    signature + the gauntlet_unlock enqueue; settle_and_pair_duels
--    re-declared FROM THE 023 BODY (current owner - it added
--    clan_rating_history to the 021 body) with an IDENTICAL signature +
--    the duel_settled enqueue at settlement and the season_champion
--    enqueue where champions are written (maintain_season_playoffs runs
--    inside it). Every other byte of both bodies is a carryover.
--
-- The API layer is pre-024-safe throughout: a missing table/column/RPC
-- reads as "clan identity / Discord not live yet" and never fails a
-- request. economy_transactions: this migration adds NO faucets and NO
-- sinks - identity and Discord pay prestige and presence, never DNA.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CLAN VISUAL IDENTITY (section 8.1): columns + hex checks
-- ----------------------------------------------------------------------------

ALTER TABLE clans
  ADD COLUMN IF NOT EXISTS banner_id TEXT,
  ADD COLUMN IF NOT EXISTS emblem_id TEXT,
  ADD COLUMN IF NOT EXISTS color_primary TEXT,
  ADD COLUMN IF NOT EXISTS color_secondary TEXT;

ALTER TABLE clans DROP CONSTRAINT IF EXISTS clans_banner_id_format;
ALTER TABLE clans ADD CONSTRAINT clans_banner_id_format
  CHECK (banner_id IS NULL OR banner_id ~ '^[a-z0-9_]{1,32}$');

ALTER TABLE clans DROP CONSTRAINT IF EXISTS clans_emblem_id_format;
ALTER TABLE clans ADD CONSTRAINT clans_emblem_id_format
  CHECK (emblem_id IS NULL OR emblem_id ~ '^[a-z0-9_]{1,32}$');

ALTER TABLE clans DROP CONSTRAINT IF EXISTS clans_color_primary_hex;
ALTER TABLE clans ADD CONSTRAINT clans_color_primary_hex
  CHECK (color_primary IS NULL OR color_primary ~ '^#[0-9a-fA-F]{6}$');

ALTER TABLE clans DROP CONSTRAINT IF EXISTS clans_color_secondary_hex;
ALTER TABLE clans ADD CONSTRAINT clans_color_secondary_hex
  CHECK (color_secondary IS NULL OR color_secondary ~ '^#[0-9a-fA-F]{6}$');

COMMENT ON COLUMN clans.banner_id IS
  'Clan banner (Identity v1 section 8.1). Editable via update_clan_identity once heraldry_1 is researched.';

-- ----------------------------------------------------------------------------
-- 2. update_clan_identity (section 8.1): owner/officer via RPC; the clans
--    RLS update policy stays owner-only. Heraldry gate: heraldry_1
--    unlocks all four stored fields (heraldry_2/3/4 are render-time
--    features driven by clan_research directly). NULL args leave the
--    field unchanged. SERVICE-ROLE ONLY - the API verifies the JWT and
--    passes the auth uid.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_clan_identity(
  p_user_id UUID,
  p_banner_id TEXT DEFAULT NULL,
  p_emblem_id TEXT DEFAULT NULL,
  p_color_primary TEXT DEFAULT NULL,
  p_color_secondary TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_member RECORD;
  v_clan RECORD;
BEGIN
  SELECT cm.clan_id, cm.role INTO v_member
  FROM clan_members cm WHERE cm.player_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_in_clan');
  END IF;
  IF v_member.role NOT IN ('owner', 'officer') THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  -- Heraldry research gate (section 8.1): pixels are bought, not given
  IF NOT clan_has_research(v_member.clan_id, 'heraldry_1') THEN
    RETURN jsonb_build_object('error', 'heraldry_locked', 'requires', 'heraldry_1');
  END IF;

  IF p_banner_id IS NOT NULL AND p_banner_id !~ '^[a-z0-9_]{1,32}$' THEN
    RETURN jsonb_build_object('error', 'invalid_banner');
  END IF;
  IF p_emblem_id IS NOT NULL AND p_emblem_id !~ '^[a-z0-9_]{1,32}$' THEN
    RETURN jsonb_build_object('error', 'invalid_emblem');
  END IF;
  IF p_color_primary IS NOT NULL AND p_color_primary !~ '^#[0-9a-fA-F]{6}$' THEN
    RETURN jsonb_build_object('error', 'invalid_color');
  END IF;
  IF p_color_secondary IS NOT NULL AND p_color_secondary !~ '^#[0-9a-fA-F]{6}$' THEN
    RETURN jsonb_build_object('error', 'invalid_color');
  END IF;

  UPDATE clans
  SET banner_id = COALESCE(p_banner_id, banner_id),
      emblem_id = COALESCE(p_emblem_id, emblem_id),
      color_primary = COALESCE(p_color_primary, color_primary),
      color_secondary = COALESCE(p_color_secondary, color_secondary),
      updated_at = NOW()
  WHERE id = v_member.clan_id
  RETURNING id, banner_id, emblem_id, color_primary, color_secondary INTO v_clan;

  RETURN jsonb_build_object(
    'success', true,
    'clan_id', v_clan.id,
    'banner_id', v_clan.banner_id,
    'emblem_id', v_clan.emblem_id,
    'color_primary', v_clan.color_primary,
    'color_secondary', v_clan.color_secondary
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION update_clan_identity(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_clan_identity(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION update_clan_identity(UUID, TEXT, TEXT, TEXT, TEXT) FROM authenticated;

-- ----------------------------------------------------------------------------
-- 3. set_clan_member_role (section 8.2): owner promotes/demotes between
--    officer and member. NEVER owner - ownership transfer stays on its
--    existing path. SERVICE-ROLE ONLY.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_clan_member_role(
  p_user_id UUID,
  p_target_user_id UUID,
  p_role TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_caller RECORD;
  v_target RECORD;
BEGIN
  IF p_role NOT IN ('officer', 'member') THEN
    -- 'owner' is deliberately NOT assignable here (no owner transfer)
    RETURN jsonb_build_object('error', 'invalid_role');
  END IF;

  SELECT cm.clan_id, cm.role INTO v_caller
  FROM clan_members cm WHERE cm.player_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_in_clan');
  END IF;
  IF v_caller.role <> 'owner' THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  SELECT cm.id, cm.role INTO v_target
  FROM clan_members cm
  WHERE cm.player_id = p_target_user_id AND cm.clan_id = v_caller.clan_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'target_not_in_clan');
  END IF;
  IF v_target.role = 'owner' THEN
    RETURN jsonb_build_object('error', 'cannot_change_owner');
  END IF;

  UPDATE clan_members SET role = p_role WHERE id = v_target.id;

  RETURN jsonb_build_object('success', true, 'role', p_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION set_clan_member_role(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_clan_member_role(UUID, UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION set_clan_member_role(UUID, UUID, TEXT) FROM authenticated;

-- ----------------------------------------------------------------------------
-- 4. DISCORD TABLES (sections 8.3-8.5). Created BEFORE the RPCs and
--    producer re-declarations that reference them.
--
--    discord_links: tokens app-layer AES-256-GCM encrypted
--    (iv||tag||ciphertext, base64) - the DB never sees plaintext.
--    DENY-ALL RLS (no policies): service role only. UNIQUE
--    discord_user_id: one Discord account links one player (the
--    callback answers 409 otherwise). revoked_at: refresh-failure
--    degradation marker - the 30-day sweep deletes stale grants.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS discord_links (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL UNIQUE,
  discord_username TEXT,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT NOT NULL DEFAULT 'identify guilds.join role_connections.write',
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

-- DENY-ALL RLS: enabled with NO policies - only the service role reads
-- or writes token rows. Never GRANT SELECT on this table.
ALTER TABLE discord_links ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE discord_links IS
  'Per-player Discord OAuth grant (Identity v1 section 8.3). Tokens AES-256-GCM app-layer encrypted; deny-all RLS; service-role access only. Unlink revokes at Discord and deletes the row; refresh failure sets revoked_at and the 30-day sweep deletes stale grants.';

-- discord_clan_links: the provisioned clan space. One row per clan,
-- either model ('official' = per-clan channel+role in the official
-- guild, 'own' = the clan''s own server). Clan members may SELECT (ids
-- feed the widget + deep links); the webhook token is encrypted so the
-- readable row leaks nothing postable.
CREATE TABLE IF NOT EXISTS discord_clan_links (
  clan_id UUID PRIMARY KEY REFERENCES clans(id) ON DELETE CASCADE,
  model TEXT NOT NULL CHECK (model IN ('official', 'own')),
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  role_id TEXT,
  webhook_id TEXT NOT NULL,
  webhook_token_enc TEXT NOT NULL,
  invite_url TEXT,
  linked_by UUID,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE discord_clan_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discord_clan_links_select_members ON discord_clan_links;
CREATE POLICY discord_clan_links_select_members ON discord_clan_links
  FOR SELECT TO authenticated
  USING (
    clan_id IN (SELECT clan_id FROM clan_members WHERE player_id = auth.uid())
  );

GRANT SELECT ON discord_clan_links TO authenticated;

-- discord_event_outbox: produced in-SQL at settlement (duel_settled,
-- season_champion), at research unlock (gauntlet_unlock), at invite
-- accept (member_joined) and from the session route (mastery_levelup,
-- M5+ only). Consumed by /api/discord/dispatch. dedup_key makes every
-- producer idempotent; dead after 5 attempts.
CREATE TABLE IF NOT EXISTS discord_event_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'duel_settled', 'gauntlet_unlock', 'mastery_levelup',
    'season_champion', 'member_joined'
  )),
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  dedup_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

-- The consumer's scan: pending rows oldest-first
CREATE INDEX IF NOT EXISTS idx_discord_event_outbox_pending
  ON discord_event_outbox (created_at) WHERE status = 'pending';

-- DENY-ALL RLS: enabled with NO policies - producers are SECURITY
-- DEFINER SQL + the service role; the consumer is the service role.
ALTER TABLE discord_event_outbox ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 5. respond_clan_invite (section 8.2): the 007 invites schema gets its
--    accept/decline path. ATOMIC accept: row lock -> membership insert +
--    member_count bump -> this invite accepted -> the player's OTHER
--    pending invites expired - all in one transaction. Enqueues
--    member_joined when the clan has a Discord space. SERVICE-ROLE ONLY.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION respond_clan_invite(
  p_user_id UUID,
  p_invite_id UUID,
  p_accept BOOLEAN
)
RETURNS JSONB AS $$
DECLARE
  v_invite RECORD;
  v_clan RECORD;
  v_handle TEXT;
BEGIN
  SELECT * INTO v_invite
  FROM clan_invites
  WHERE id = p_invite_id AND player_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invite_not_found');
  END IF;
  IF v_invite.status <> 'pending' THEN
    RETURN jsonb_build_object('error', 'invite_not_pending');
  END IF;
  IF v_invite.expires_at < NOW() THEN
    -- Clear same-status history first: UNIQUE(clan_id, player_id, status)
    DELETE FROM clan_invites
    WHERE clan_id = v_invite.clan_id AND player_id = p_user_id
      AND status = 'expired' AND id <> p_invite_id;
    UPDATE clan_invites SET status = 'expired' WHERE id = p_invite_id;
    RETURN jsonb_build_object('error', 'invite_expired');
  END IF;

  IF NOT p_accept THEN
    DELETE FROM clan_invites
    WHERE clan_id = v_invite.clan_id AND player_id = p_user_id
      AND status = 'declined' AND id <> p_invite_id;
    UPDATE clan_invites SET status = 'declined' WHERE id = p_invite_id;
    RETURN jsonb_build_object('success', true, 'accepted', false);
  END IF;

  -- ---- Accept: membership + count + expiry of the rest, atomically ----
  IF EXISTS (SELECT 1 FROM clan_members WHERE player_id = p_user_id) THEN
    RETURN jsonb_build_object('error', 'already_in_clan');
  END IF;

  SELECT * INTO v_clan FROM clans WHERE id = v_invite.clan_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'clan_not_found');
  END IF;
  IF v_clan.member_count >= v_clan.max_members THEN
    RETURN jsonb_build_object('error', 'clan_full');
  END IF;

  INSERT INTO clan_members (clan_id, player_id, role)
  VALUES (v_invite.clan_id, p_user_id, 'member');

  UPDATE clans
  SET member_count = member_count + 1, updated_at = NOW()
  WHERE id = v_invite.clan_id;

  DELETE FROM clan_invites
  WHERE clan_id = v_invite.clan_id AND player_id = p_user_id
    AND status = 'accepted' AND id <> p_invite_id;
  UPDATE clan_invites SET status = 'accepted' WHERE id = p_invite_id;

  -- Expire every other pending invite for this player (they're in a
  -- clan now). Same-status uniqueness: drop stale expired rows first.
  DELETE FROM clan_invites ci
  WHERE ci.player_id = p_user_id AND ci.status = 'expired'
    AND EXISTS (
      SELECT 1 FROM clan_invites p
      WHERE p.player_id = p_user_id AND p.status = 'pending'
        AND p.clan_id = ci.clan_id AND p.id <> p_invite_id
    );
  UPDATE clan_invites SET status = 'expired'
  WHERE player_id = p_user_id AND status = 'pending' AND id <> p_invite_id;

  -- member_joined feed event (section 8.4) when the clan has a space
  SELECT piv.display_handle INTO v_handle
  FROM player_identity_view piv WHERE piv.user_id = p_user_id
  LIMIT 1;

  INSERT INTO discord_event_outbox (event_type, clan_id, dedup_key, payload)
  SELECT 'member_joined', v_invite.clan_id,
         'member_joined:' || p_invite_id::text,
         jsonb_build_object(
           'handle', COALESCE(v_handle, 'A new handler'),
           'clan_name', v_clan.name,
           'clan_tag', v_clan.tag
         )
  WHERE EXISTS (
    SELECT 1 FROM discord_clan_links l WHERE l.clan_id = v_invite.clan_id
  )
  ON CONFLICT (dedup_key) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'accepted', true,
    'clan_id', v_invite.clan_id,
    'clan_name', v_clan.name,
    'clan_tag', v_clan.tag
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION respond_clan_invite(UUID, UUID, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION respond_clan_invite(UUID, UUID, BOOLEAN) FROM anon;
REVOKE EXECUTE ON FUNCTION respond_clan_invite(UUID, UUID, BOOLEAN) FROM authenticated;

-- ----------------------------------------------------------------------------
-- 6. gauntlet_try_unlock - re-created FROM THE 020 BODY (current owner;
--    021/022/023 did not re-declare it) with an IDENTICAL signature.
--    ONE addition: the gauntlet_unlock enqueue when the researched node
--    completes and the clan has a Discord space. Every other byte of
--    the body is a carryover.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION gauntlet_try_unlock(p_clan_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_target TEXT;
  v_cost INTEGER;
  v_prereq TEXT;
  v_pool BIGINT;
BEGIN
  SELECT node_id INTO v_target FROM clan_research_target WHERE clan_id = p_clan_id;
  IF v_target IS NULL THEN
    RETURN NULL;
  END IF;

  IF clan_has_research(p_clan_id, v_target) THEN
    DELETE FROM clan_research_target WHERE clan_id = p_clan_id;
    RETURN NULL;
  END IF;

  v_prereq := gauntlet_node_prereq(v_target);
  IF v_prereq IS NOT NULL AND NOT clan_has_research(p_clan_id, v_prereq) THEN
    RETURN NULL;                            -- target set ahead of prereq: wait
  END IF;

  v_cost := gauntlet_node_cost(v_target);
  SELECT dna_contributed INTO v_pool
  FROM clan_research_progress WHERE clan_id = p_clan_id FOR UPDATE;

  IF v_pool IS NULL OR v_pool < v_cost THEN
    RETURN NULL;
  END IF;

  INSERT INTO clan_research (clan_id, node_id) VALUES (p_clan_id, v_target)
  ON CONFLICT DO NOTHING;

  UPDATE clan_research_progress
  SET dna_contributed = dna_contributed - v_cost, updated_at = NOW()
  WHERE clan_id = p_clan_id;

  DELETE FROM clan_research_target WHERE clan_id = p_clan_id;

  -- Identity v1 I3 (section 8.4): research node completed -> feed event
  -- for clans with a Discord space. Idempotent per (clan, node).
  INSERT INTO discord_event_outbox (event_type, clan_id, dedup_key, payload)
  SELECT 'gauntlet_unlock', p_clan_id,
         'gauntlet_unlock:' || p_clan_id::text || ':' || v_target,
         jsonb_build_object('node_id', v_target, 'clan_name', c.name, 'clan_tag', c.tag)
  FROM clans c
  WHERE c.id = p_clan_id
    AND EXISTS (SELECT 1 FROM discord_clan_links l WHERE l.clan_id = p_clan_id)
  ON CONFLICT (dedup_key) DO NOTHING;

  RETURN v_target;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 7. settle_and_pair_duels - re-created FROM THE 023 BODY (current
--    owner; 023 added the clan_rating_history append to the 021 body)
--    with an IDENTICAL signature. TWO additions: the duel_settled
--    enqueue after each settlement (one row per linked clan of the
--    duel) and the season_champion enqueue right after
--    maintain_season_playoffs() - the call that writes
--    season_champions. Every other byte of the body is a carryover.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settle_and_pair_duels()
RETURNS VOID AS $$
DECLARE
  v_week DATE := duel_week_start(NOW());
  v_duel RECORD;
  v_score_a BIGINT;
  v_score_b BIGINT;
  v_rating_a INTEGER;
  v_rating_b INTEGER;
  v_winner UUID;
  v_loser UUID;
  v_expected_winner NUMERIC;
  v_delta INTEGER;
  v_rules JSONB;
  -- pairing
  v_clans UUID[];
  v_used UUID[] := '{}';
  v_len INTEGER;
  v_a UUID;
  v_b UUID;
  v_first UUID;
  v_cand UUID;
  v_seen INTEGER;
  v_revenge BOOLEAN;
  v_match RECORD;
  v_new_duel_id UUID;
  v_window_start DATE;
  i INTEGER;
  j INTEGER;
BEGIN
  -- Serialize settlement/pairing across concurrent API reads
  PERFORM pg_advisory_xact_lock(hashtext('clan_duels_settle'));

  -- ---- Settle finished weeks -------------------------------------------
  FOR v_duel IN
    SELECT d.*
    FROM clan_duels d
    WHERE d.status = 'active'
      AND d.week_start < v_week
    ORDER BY d.week_start ASC
  LOOP
    -- Stamp effective rules if picks exist and it never resolved on-read.
    -- Pre-020 weeks have no picks: they settle on the legacy path below.
    PERFORM resolve_gauntlet(v_duel.id);
    SELECT effective_rules INTO v_rules FROM clan_duels WHERE id = v_duel.id;

    IF v_rules IS NOT NULL THEN
      v_score_a := gauntlet_side_score(v_duel.week_start, v_duel.clan_a, v_rules->'a', v_duel.roster_a);
      v_score_b := gauntlet_side_score(v_duel.week_start, v_duel.clan_b, v_rules->'b', v_duel.roster_b);
    ELSE
      SELECT COALESCE(MAX(s.score) FILTER (WHERE s.clan_id = v_duel.clan_a), 0),
             COALESCE(MAX(s.score) FILTER (WHERE s.clan_id = v_duel.clan_b), 0)
      INTO v_score_a, v_score_b
      FROM clan_week_scores(v_duel.week_start) s
      WHERE s.clan_id IN (v_duel.clan_a, v_duel.clan_b);
    END IF;

    IF v_score_a = v_score_b THEN
      -- Tie: split - no rating change, no bonus
      v_winner := NULL;
      v_delta := 0;
    ELSE
      IF v_score_a > v_score_b THEN
        v_winner := v_duel.clan_a;
        v_loser := v_duel.clan_b;
      ELSE
        v_winner := v_duel.clan_b;
        v_loser := v_duel.clan_a;
      END IF;

      SELECT rating INTO v_rating_a FROM clans WHERE id = v_winner;
      SELECT rating INTO v_rating_b FROM clans WHERE id = v_loser;

      -- ELO: expected = 1 / (1 + 10^((Rloser - Rwinner) / 400)), K = 32
      v_expected_winner := 1.0 / (1.0 + power(10.0, (v_rating_b - v_rating_a) / 400.0));
      v_delta := ROUND(32 * (1 - v_expected_winner))::INTEGER;

      UPDATE clans
      SET rating = rating + v_delta,
          duel_wins = duel_wins + 1,
          updated_at = NOW()
      WHERE id = v_winner;

      UPDATE clans
      SET rating = rating - v_delta,
          duel_losses = duel_losses + 1,
          updated_at = NOW()
      WHERE id = v_loser;
    END IF;

    UPDATE clan_duels
    SET score_a = v_score_a,
        score_b = v_score_b,
        winner = v_winner,
        rating_delta = v_delta,
        status = 'settled',
        settled_at = NOW()
    WHERE id = v_duel.id;

    -- Identity v1 I2 (section 7.1): append the rating-history point for
    -- both clans of the settled duel - the Chronicle's clan graph. Ties
    -- record delta 0. Idempotent per (clan_id, week_start).
    INSERT INTO clan_rating_history (clan_id, week_start, rating_after, delta)
    SELECT c.id, v_duel.week_start, c.rating,
           CASE
             WHEN v_winner IS NULL THEN 0
             WHEN c.id = v_winner THEN v_delta
             ELSE -v_delta
           END
    FROM clans c
    WHERE c.id IN (v_duel.clan_a, v_duel.clan_b)
    ON CONFLICT (clan_id, week_start) DO NOTHING;

    -- Identity v1 I3 (section 8.4): duel_settled feed event - one row
    -- per LINKED clan of the duel (each clan's channel gets its own
    -- post). Idempotent per (duel, clan).
    INSERT INTO discord_event_outbox (event_type, clan_id, dedup_key, payload)
    SELECT 'duel_settled', l.clan_id,
           'duel_settled:' || v_duel.id::text || ':' || l.clan_id::text,
           jsonb_build_object(
             'week_start', v_duel.week_start,
             'clan_a', jsonb_build_object(
               'id', v_duel.clan_a, 'name', ca.name, 'tag', ca.tag, 'score', v_score_a
             ),
             'clan_b', jsonb_build_object(
               'id', v_duel.clan_b, 'name', cb.name, 'tag', cb.tag, 'score', v_score_b
             ),
             'winner', v_winner,
             'rating_delta', v_delta
           )
    FROM discord_clan_links l
    JOIN clans ca ON ca.id = v_duel.clan_a
    JOIN clans cb ON cb.id = v_duel.clan_b
    WHERE l.clan_id IN (v_duel.clan_a, v_duel.clan_b)
    ON CONFLICT (dedup_key) DO NOTHING;
  END LOOP;

  -- ---- Season playoffs: fill winners, seed brackets, decide champions --
  PERFORM maintain_season_playoffs();

  -- Identity v1 I3 (section 8.4): season_champion feed event where
  -- champions are written (maintain_season_playoffs just ran). One row
  -- per season, only for linked champion clans. Idempotent per season.
  INSERT INTO discord_event_outbox (event_type, clan_id, dedup_key, payload)
  SELECT 'season_champion', sc.clan_id,
         'season_champion:' || sc.season_id::text,
         jsonb_build_object(
           'season_name', s.name,
           'clan_name', sc.clan_name,
           'clan_tag', sc.clan_tag
         )
  FROM season_champions sc
  JOIN seasons s ON s.id = sc.season_id
  WHERE sc.clan_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM discord_clan_links l WHERE l.clan_id = sc.clan_id)
  ON CONFLICT (dedup_key) DO NOTHING;

  -- ---- Pair the current week (only once) --------------------------------
  IF NOT EXISTS (SELECT 1 FROM clan_duels WHERE week_start = v_week) THEN
    -- Playoff matches first: the bracket owns its clans' pairings this
    -- week; bye matches (clan_b NULL) already carry their winner and
    -- never get a duel row. The bracket clans still get normal duels? No:
    -- a playoff week IS the clan's weekly protocol (section 8.4).
    FOR v_match IN
      SELECT * FROM season_playoff_matches
      WHERE week_start = v_week AND duel_id IS NULL AND clan_b IS NOT NULL
      ORDER BY round, slot
    LOOP
      INSERT INTO clan_duels (week_start, clan_a, clan_b, status, roster_a, roster_b)
      VALUES (
        v_week,
        v_match.clan_a,
        v_match.clan_b,
        'active',
        ARRAY(SELECT player_id FROM clan_members WHERE clan_id = v_match.clan_a),
        ARRAY(SELECT player_id FROM clan_members WHERE clan_id = v_match.clan_b)
      )
      RETURNING id INTO v_new_duel_id;

      UPDATE season_playoff_matches
      SET duel_id = v_new_duel_id
      WHERE id = v_match.id;

      v_used := v_used || v_match.clan_a || v_match.clan_b;
    END LOOP;

    -- Bye-side playoff clans sit the week out of the bracket but still
    -- get a regular duel pairing below (they are not in v_used).

    SELECT ARRAY_AGG(id ORDER BY rating DESC, created_at ASC, id ASC)
    INTO v_clans
    FROM clans
    WHERE member_count >= 1;

    v_len := COALESCE(array_length(v_clans, 1), 0);
    v_window_start := rivalry_window_start(v_week);

    i := 1;
    WHILE i <= v_len LOOP
      IF v_clans[i] = ANY(v_used) THEN
        i := i + 1;
        CONTINUE;
      END IF;

      v_a := v_clans[i];
      v_b := NULL;
      v_first := NULL;
      v_seen := 0;

      -- Revenge priority among the next 2 rating-adjacent candidates:
      -- prefer a rematch vs a clan we are tied with or trailing against
      -- inside the CURRENT SEASON window (8-week proxy only when no
      -- season covers this week).
      j := i + 1;
      WHILE j <= v_len AND v_seen < 2 LOOP
        IF NOT (v_clans[j] = ANY(v_used)) THEN
          v_cand := v_clans[j];
          v_seen := v_seen + 1;
          IF v_first IS NULL THEN
            v_first := v_cand;
          END IF;

          SELECT COUNT(*) >= 1
                 AND (COUNT(*) FILTER (WHERE winner = v_a))
                     <= (COUNT(*) FILTER (WHERE winner = v_cand))
          INTO v_revenge
          FROM clan_duels
          WHERE status = 'settled'
            AND week_start >= v_window_start
            AND ((clan_a = v_a AND clan_b = v_cand)
                 OR (clan_a = v_cand AND clan_b = v_a));

          IF v_revenge THEN
            v_b := v_cand;
            EXIT;
          END IF;
        END IF;
        j := j + 1;
      END LOOP;

      v_b := COALESCE(v_b, v_first);
      v_used := v_used || v_a;
      IF v_b IS NOT NULL THEN
        v_used := v_used || v_b;
      END IF;

      -- Roster lock (anti-mercenary): counted rosters snapshot at pairing
      INSERT INTO clan_duels (week_start, clan_a, clan_b, status, roster_a, roster_b)
      VALUES (
        v_week,
        v_a,
        v_b,
        CASE WHEN v_b IS NULL THEN 'bye' ELSE 'active' END,
        ARRAY(SELECT player_id FROM clan_members WHERE clan_id = v_a),
        CASE WHEN v_b IS NULL THEN NULL
             ELSE ARRAY(SELECT player_id FROM clan_members WHERE clan_id = v_b) END
      );

      i := i + 1;
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
