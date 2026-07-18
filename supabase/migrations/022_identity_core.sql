-- ============================================================================
-- Migration 022: Identity Core (Player Identity v1, Phase I1)
-- PLAYER_IDENTITY_V1.md sections 3 (handles), 4 (Player Card read path),
-- 5 (cosmetics), 9.5 (run-event capture) - the plan-of-record is
-- "Identity v1" (investigate-this-repo-it-rosy-charm).
--
-- 1. HANDLES (section 3): players.handle - format CHECK
--    ^[A-Za-z0-9_]{3,16}$ (ASCII-only kills the Unicode-confusable
--    impersonation class at the type level), case-insensitive uniqueness
--    via a UNIQUE INDEX ON lower(handle) which doubles as the race
--    arbiter for concurrent claims. Guests get NO row state: the
--    identity view derives a stable handler-NNNN name from the player
--    UUID (section 3.2 - zero writes, deterministic, visually distinct
--    because real handles cannot contain '-').
-- 2. DENYLIST (section 3.5): reserved_handles, checked against the
--    LEET-NORMALIZED candidate (lowercase, strip '_', map 0->o 1->i 3->e
--    4->a 5->s 7->t 8->b $->s @->a). reserved = exact match,
--    profanity = substring match. Extendable by migration, no code change.
-- 3. claim_handle RPC (sections 3.3-3.5): format -> denylist -> 30-day
--    cooldown (first claim free) -> UPDATE catching unique_violation.
--    JSONB result: {success:true, handle} or
--    {error: 'invalid_format'|'reserved'|'cooldown'(+next_change_at)|'taken'}.
-- 4. admin_rename_handle (section 3.6): service-role only - resets the
--    handle to NULL (player renders as handler-NNNN again), records the
--    event, waives the next claim's cooldown (handle_changed_at = NULL).
-- 5. COSMETICS (section 5): cosmetic_definitions (slots title/banner/
--    badge/trail/board_accent/emblem; rarity common..legendary - visual
--    language only, never stats), player_cosmetics inventory,
--    player_loadout (badge positions 1-3, every other slot position 1 -
--    CHECK-enforced curation cap, section 6.5), equip_cosmetic RPC.
--    Seeds: the 8 Season 1 "Solstice" items (section 5.3), the 24
--    mastery-rung items (section 5.4, rung-for-rung with
--    MASTERY_UNLOCK_TRACK in src/shared/game/mastery.ts), the Founder
--    badge ("Founding Handler", one-time backfill, never grantable
--    again) and the default banner "Hatchery Standard" (section 5.5).
--    Record-tier and archetype badges are generated in 023/025 - NOT
--    seeded here.
-- 6. BACKFILLS: inventory from player_battle_pass_claims (the de-facto
--    ownership record for season cosmetics) and from player_mastery
--    (levels via level_for_xp). Forward grants: claim_season_tier (021
--    body) and grant_mastery_xp (019 body) are re-declared with
--    IDENTICAL signatures to also write player_cosmetics.
-- 7. player_identity_view (section 4): THE canonical identity read path
--    - public-safe by construction (no email). Exposes BOTH ids
--    (players.id and players.user_id - clan_members.player_id is the
--    auth uid). display_handle falls back to handler-NNNN; avatar =
--    favorited -> equipped -> newest collected snake with its dynasty;
--    title/banner/badges from the loadout; founder flag
--    (created_at < 2026-07-20); mastery summary via level_for_xp; clan
--    tag. get_player_identities(UUID[]) batch-reads it.
-- 8. The five COALESCE(username,'Anonymous') render sites are
--    re-declared onto the view with IDENTICAL signatures:
--    clan_top_contributors + gauntlet_top_contributors (current owners:
--    021 bodies), get_anomaly_board (021), and the scouting-roster +
--    tithe-list blocks inside get_gauntlet (020). players.username stays
--    a dead column - never written, never reintroduced.
-- 9. RUN-EVENT CAPTURE (section 9.5, lands in I1 so data accrues before
--    I4): game_sessions.run_events JSONB + game_sessions.death_cause.
--    Bounds are enforced by the API layer (<=600 events, <=32KB,
--    monotonic times); run events NEVER influence payouts, records or
--    leaderboards - display and Analyst input only. run_events prunes
--    after 90 days (opportunistic, no cron exists); death_cause is kept
--    forever.
--
-- The API layer is pre-022-safe throughout: a missing table/column/RPC
-- reads as "identity not live yet" (generated names, no cosmetics, no
-- run-event storage) and never fails a request.
-- economy_transactions: this migration adds NO faucets and NO sinks
-- (section 10.1) - the only economy_transactions statements below are
-- byte-identical carryovers inside the claim_season_tier re-declaration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. HANDLES: columns, format CHECK, case-insensitive unique index
-- ----------------------------------------------------------------------------

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS handle TEXT,
  ADD COLUMN IF NOT EXISTS handle_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handle_changes INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'players_handle_format'
  ) THEN
    ALTER TABLE players ADD CONSTRAINT players_handle_format
      CHECK (handle IS NULL OR handle ~ '^[A-Za-z0-9_]{3,16}$');
  END IF;
END $$;

-- Case-insensitive uniqueness + the race arbiter for concurrent claims
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_handle_lower
  ON players (lower(handle))
  WHERE handle IS NOT NULL;

COMMENT ON COLUMN players.handle IS
  'Unique player handle (Identity v1 section 3). NULL = unclaimed: renders as the derived handler-NNNN. players.username is dead - never read it.';

-- ----------------------------------------------------------------------------
-- 2. DENYLIST: reserved_handles + leet normalization (section 3.5)
--    Patterns are stored PRE-NORMALIZED; candidates are normalized in
--    the RPC before matching.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reserved_handles (
  pattern TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('reserved', 'profanity')),
  match_mode TEXT NOT NULL CHECK (match_mode IN ('exact', 'substring'))
);

ALTER TABLE reserved_handles ENABLE ROW LEVEL SECURITY;
-- No policies: deny-all - only the service role and SECURITY DEFINER
-- RPCs read the denylist (the list itself is not player-facing content).

-- Leet map (section 3.5): lowercase, strip '_', 0->o 1->i 3->e 4->a 5->s
-- 7->t 8->b $->s @->a. Mirrored by normalizeHandle in
-- src/lib/identity/handle.ts - keep in lockstep.
CREATE OR REPLACE FUNCTION normalize_handle(p_handle TEXT)
RETURNS TEXT AS $$
  SELECT translate(replace(lower(COALESCE(p_handle, '')), '_', ''),
                   '0134578$@', 'oieastbsa');
$$ LANGUAGE sql IMMUTABLE;

-- Reserved words (exact match after normalization): system/staff names,
-- the guest prefix, dynasty names, the Analyst.
INSERT INTO reserved_handles (pattern, kind, match_mode) VALUES
  ('admin',     'reserved', 'exact'),
  ('mod',       'reserved', 'exact'),
  ('moderator', 'reserved', 'exact'),
  ('staff',     'reserved', 'exact'),
  ('support',   'reserved', 'exact'),
  ('system',    'reserved', 'exact'),
  ('supasnake', 'reserved', 'exact'),
  ('official',  'reserved', 'exact'),
  ('anonymous', 'reserved', 'exact'),
  ('handler',   'reserved', 'exact'),
  ('cyber',     'reserved', 'exact'),
  ('primal',    'reserved', 'exact'),
  ('cosmic',    'reserved', 'exact'),
  ('analyst',   'reserved', 'exact')
ON CONFLICT (pattern) DO NOTHING;

-- Profanity (substring match after normalization) - standard denylist,
-- extendable by migration without code changes.
INSERT INTO reserved_handles (pattern, kind, match_mode) VALUES
  ('fuck',    'profanity', 'substring'),
  ('shit',    'profanity', 'substring'),
  ('cunt',    'profanity', 'substring'),
  ('bitch',   'profanity', 'substring'),
  ('nigger',  'profanity', 'substring'),
  ('nigga',   'profanity', 'substring'),
  ('faggot',  'profanity', 'substring'),
  ('retard',  'profanity', 'substring'),
  ('rapist',  'profanity', 'substring'),
  ('hitler',  'profanity', 'substring'),
  ('nazi',    'profanity', 'substring'),
  ('kike',    'profanity', 'substring'),
  ('spic',    'profanity', 'substring'),
  ('chink',   'profanity', 'substring'),
  ('whore',   'profanity', 'substring'),
  ('slut',    'profanity', 'substring'),
  ('penis',   'profanity', 'substring'),
  ('vagina',  'profanity', 'substring'),
  ('porn',    'profanity', 'substring')
ON CONFLICT (pattern) DO NOTHING;

-- Handle audit log (claims + admin resets, section 3.6) - deny-all RLS,
-- service-role/RPC writes only.
CREATE TABLE IF NOT EXISTS handle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('claim', 'admin_reset')),
  old_handle TEXT,
  new_handle TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE handle_events ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. CLAIM RPC (sections 3.3-3.5): format -> denylist -> cooldown ->
--    UPDATE with the unique index as the race arbiter.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION claim_handle(p_player_id UUID, p_handle TEXT)
RETURNS JSONB AS $$
DECLARE
  v_player players%ROWTYPE;
  v_norm TEXT;
  v_next_change_at TIMESTAMPTZ;
BEGIN
  -- Format (section 3.1) - mirrors the players_handle_format CHECK
  IF p_handle IS NULL OR p_handle !~ '^[A-Za-z0-9_]{3,16}$' THEN
    RETURN jsonb_build_object('error', 'invalid_format');
  END IF;

  SELECT * INTO v_player FROM players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'player_not_found');
  END IF;

  -- Denylist (section 3.5): both kinds checked against the
  -- leet-normalized candidate
  v_norm := normalize_handle(p_handle);
  IF EXISTS (
    SELECT 1 FROM reserved_handles r
    WHERE (r.match_mode = 'exact' AND v_norm = r.pattern)
       OR (r.match_mode = 'substring' AND position(r.pattern IN v_norm) > 0)
  ) THEN
    RETURN jsonb_build_object('error', 'reserved');
  END IF;

  -- Cooldown (section 3.4): first claim free; changes wait 30 days.
  -- handle_changed_at = NULL also waives it (admin-reset victims,
  -- section 3.6).
  IF v_player.handle_changes > 0 AND v_player.handle_changed_at IS NOT NULL THEN
    v_next_change_at := v_player.handle_changed_at + INTERVAL '30 days';
    IF NOW() < v_next_change_at THEN
      RETURN jsonb_build_object(
        'error', 'cooldown',
        'next_change_at', v_next_change_at
      );
    END IF;
  END IF;

  -- The unique lower(handle) index arbitrates races - no app-level lock
  BEGIN
    UPDATE players
    SET handle = p_handle,
        handle_changed_at = NOW(),
        handle_changes = handle_changes + 1
    WHERE id = p_player_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'taken');
  END;

  INSERT INTO handle_events (player_id, action, old_handle, new_handle)
  VALUES (p_player_id, 'claim', v_player.handle, p_handle);

  RETURN jsonb_build_object('success', true, 'handle', p_handle);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 4. ADMIN RENAME (section 3.6): service-role only. Resets to NULL
--    (handler-NNNN again), records the event, waives the victim's next
--    cooldown. NOT granted to authenticated/anon.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION admin_rename_handle(p_player_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_old TEXT;
BEGIN
  SELECT handle INTO v_old FROM players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'player_not_found');
  END IF;

  UPDATE players
  SET handle = NULL,
      handle_changed_at = NULL           -- cooldown waived for the next claim
  WHERE id = p_player_id;

  INSERT INTO handle_events (player_id, action, old_handle, new_handle, reason)
  VALUES (p_player_id, 'admin_reset', v_old, NULL, p_reason);

  RETURN jsonb_build_object('success', true, 'old_handle', v_old);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION admin_rename_handle(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_rename_handle(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION admin_rename_handle(UUID, TEXT) FROM authenticated;

-- ----------------------------------------------------------------------------
-- 5. RATE LIMITS: the handle surfaces get their own actions
--    (src/lib/server/rateLimit.ts RATE_LIMITS keys - keep in lockstep).
-- ----------------------------------------------------------------------------

ALTER TABLE rate_limits DROP CONSTRAINT IF EXISTS rate_limits_action_type_check;
ALTER TABLE rate_limits ADD CONSTRAINT rate_limits_action_type_check
  CHECK (action_type IN ('game_start', 'breeding', 'purchase', 'handle_check', 'handle_claim'));

-- ----------------------------------------------------------------------------
-- 6. COSMETICS: definitions catalog + inventory + loadout (section 5)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cosmetic_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slot TEXT NOT NULL CHECK (slot IN ('title', 'banner', 'badge', 'trail', 'board_accent', 'emblem')),
  rarity TEXT NOT NULL CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  dynasty TEXT CHECK (dynasty IN ('PRIMAL', 'CYBER', 'COSMIC')),
  season_seq INTEGER,
  -- Mastery-rung sourced items: the rung that grants them (backfill +
  -- the grant_mastery_xp forward grant key off this column)
  mastery_rung INTEGER CHECK (mastery_rung BETWEEN 1 AND 10),
  render JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cosmetic_definitions ENABLE ROW LEVEL SECURITY;

-- Catalog data: readable by everyone, written only by migrations
DROP POLICY IF EXISTS cosmetic_definitions_select_all ON cosmetic_definitions;
CREATE POLICY cosmetic_definitions_select_all ON cosmetic_definitions
  FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS player_cosmetics (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  cosmetic_id TEXT NOT NULL REFERENCES cosmetic_definitions(id) ON DELETE CASCADE,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT,
  PRIMARY KEY (player_id, cosmetic_id)
);

ALTER TABLE player_cosmetics ENABLE ROW LEVEL SECURITY;

-- Players read their own inventory; all writes go through SECURITY
-- DEFINER RPCs / the service role (grants are server-authoritative)
DROP POLICY IF EXISTS player_cosmetics_select_own ON player_cosmetics;
CREATE POLICY player_cosmetics_select_own ON player_cosmetics
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- Loadout: what is WORN. Badge slot has positions 1-3 (the section 6.5
-- pick-3 curation cap); every other slot has exactly position 1.
CREATE TABLE IF NOT EXISTS player_loadout (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  slot TEXT NOT NULL CHECK (slot IN ('title', 'banner', 'badge', 'trail', 'board_accent', 'emblem')),
  position INTEGER NOT NULL DEFAULT 1,
  cosmetic_id TEXT NOT NULL REFERENCES cosmetic_definitions(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, slot, position),
  CONSTRAINT player_loadout_position_valid CHECK (
    (slot = 'badge' AND position BETWEEN 1 AND 3)
    OR (slot <> 'badge' AND position = 1)
  )
);

ALTER TABLE player_loadout ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS player_loadout_select_own ON player_loadout;
CREATE POLICY player_loadout_select_own ON player_loadout
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 7. SEED CATALOG (sections 5.3-5.5). Record-tier badges (023) and
--    archetype badges (025) are generated later - not seeded here.
-- ----------------------------------------------------------------------------

-- Season 1 "Solstice" (section 5.3): 8 items, season-exclusive, never
-- returns. Sources: the 021 battle-pass track levels.
INSERT INTO cosmetic_definitions (id, name, slot, rarity, season_seq, render) VALUES
  ('solstice_trail_1',      'Solstice Trail I',      'trail',        'rare',      1, '{"kind":"trail","palette":["#facc15","#fb923c"]}'),
  ('solstice_badge',        'Solstice Badge',        'badge',        'rare',      1, '{"kind":"badge","glyph":"sun"}'),
  ('solstice_board_accent', 'Solstice Board Accent', 'board_accent', 'rare',      1, '{"kind":"board_accent","palette":["#facc15"]}'),
  ('solstice_trail_2',      'Solstice Trail II',     'trail',        'epic',      1, '{"kind":"trail","palette":["#facc15","#f43f5e"]}'),
  ('solstice_emblem',       'Solstice Emblem',       'emblem',       'epic',      1, '{"kind":"emblem","glyph":"sunburst"}'),
  ('solstice_trail_3',      'Solstice Trail III',    'trail',        'epic',      1, '{"kind":"trail","palette":["#fde68a","#f97316"],"animated":false}'),
  ('solstice_banner',       'Solstice Banner',       'banner',       'legendary', 1, '{"kind":"gradient","from":"#7c2d12","to":"#facc15","animated":true}'),
  ('solstice_sovereign',    'Solstice Sovereign',    'title',        'legendary', 1, '{"kind":"title","animated":true}')
ON CONFLICT (id) DO NOTHING;

-- Mastery rungs (section 5.4): 8 items per dynasty x 3, rung-for-rung
-- with MASTERY_UNLOCK_TRACK (M3/M6/M9 are mutation rungs - no cosmetic).
-- M8 trails and both M10 items are animated (animated = legendary/earned
-- visual language, section 5.6).
INSERT INTO cosmetic_definitions (id, name, slot, rarity, dynasty, mastery_rung, render) VALUES
  -- PRIMAL
  ('mastery_primal_emblem_1',         'Primal Emblem I',         'emblem',       'common',    'PRIMAL', 1,  '{"kind":"emblem","glyph":"leaf"}'),
  ('mastery_primal_trail_1',          'Primal Trail I',          'trail',        'common',    'PRIMAL', 2,  '{"kind":"trail","palette":["#2d5016"]}'),
  ('mastery_primal_board_accent',     'Primal Board Accent',     'board_accent', 'uncommon',  'PRIMAL', 4,  '{"kind":"board_accent","palette":["#2d5016","#8b4513"]}'),
  ('mastery_primal_trail_2',          'Primal Trail II',         'trail',        'uncommon',  'PRIMAL', 5,  '{"kind":"trail","palette":["#2d5016","#4a7c2a"]}'),
  ('mastery_primal_emblem_2',         'Primal Emblem II',        'emblem',       'rare',      'PRIMAL', 7,  '{"kind":"emblem","glyph":"grove"}'),
  ('mastery_primal_trail_3',          'Primal Trail III',        'trail',        'epic',      'PRIMAL', 8,  '{"kind":"trail","palette":["#4a7c2a","#a3e635"],"animated":true}'),
  ('mastery_primal_sovereign_emblem', 'Primal Sovereign Emblem', 'emblem',       'legendary', 'PRIMAL', 10, '{"kind":"emblem","glyph":"world_tree","animated":true}'),
  ('title_primal_sovereign',          'Primal Sovereign',        'title',        'legendary', 'PRIMAL', 10, '{"kind":"title","animated":true}'),
  -- CYBER
  ('mastery_cyber_emblem_1',          'Cyber Emblem I',          'emblem',       'common',    'CYBER',  1,  '{"kind":"emblem","glyph":"chip"}'),
  ('mastery_cyber_trail_1',           'Cyber Trail I',           'trail',        'common',    'CYBER',  2,  '{"kind":"trail","palette":["#00FFFF"]}'),
  ('mastery_cyber_board_accent',      'Cyber Board Accent',      'board_accent', 'uncommon',  'CYBER',  4,  '{"kind":"board_accent","palette":["#00FFFF","#FF00FF"]}'),
  ('mastery_cyber_trail_2',           'Cyber Trail II',          'trail',        'uncommon',  'CYBER',  5,  '{"kind":"trail","palette":["#00FFFF","#7df9ff"]}'),
  ('mastery_cyber_emblem_2',          'Cyber Emblem II',         'emblem',       'rare',      'CYBER',  7,  '{"kind":"emblem","glyph":"circuit"}'),
  ('mastery_cyber_trail_3',           'Cyber Trail III',         'trail',        'epic',      'CYBER',  8,  '{"kind":"trail","palette":["#7df9ff","#FF00FF"],"animated":true}'),
  ('mastery_cyber_sovereign_emblem',  'Cyber Sovereign Emblem',  'emblem',       'legendary', 'CYBER',  10, '{"kind":"emblem","glyph":"mainframe","animated":true}'),
  ('title_cyber_sovereign',           'Cyber Sovereign',         'title',        'legendary', 'CYBER',  10, '{"kind":"title","animated":true}'),
  -- COSMIC
  ('mastery_cosmic_emblem_1',         'Cosmic Emblem I',         'emblem',       'common',    'COSMIC', 1,  '{"kind":"emblem","glyph":"star"}'),
  ('mastery_cosmic_trail_1',          'Cosmic Trail I',          'trail',        'common',    'COSMIC', 2,  '{"kind":"trail","palette":["#4a0e4e"]}'),
  ('mastery_cosmic_board_accent',     'Cosmic Board Accent',     'board_accent', 'uncommon',  'COSMIC', 4,  '{"kind":"board_accent","palette":["#4a0e4e","#ffd700"]}'),
  ('mastery_cosmic_trail_2',          'Cosmic Trail II',         'trail',        'uncommon',  'COSMIC', 5,  '{"kind":"trail","palette":["#a855f7","#4a0e4e"]}'),
  ('mastery_cosmic_emblem_2',         'Cosmic Emblem II',        'emblem',       'rare',      'COSMIC', 7,  '{"kind":"emblem","glyph":"constellation"}'),
  ('mastery_cosmic_trail_3',          'Cosmic Trail III',        'trail',        'epic',      'COSMIC', 8,  '{"kind":"trail","palette":["#a855f7","#ffd700"],"animated":true}'),
  ('mastery_cosmic_sovereign_emblem', 'Cosmic Sovereign Emblem', 'emblem',       'legendary', 'COSMIC', 10, '{"kind":"emblem","glyph":"event_horizon","animated":true}'),
  ('title_cosmic_sovereign',          'Cosmic Sovereign',        'title',        'legendary', 'COSMIC', 10, '{"kind":"title","animated":true}')
ON CONFLICT (id) DO NOTHING;

-- Founder badge (section 5.5): "Founding Handler" - one-time backfill to
-- accounts created before Season 1 (2026-07-20). Never grantable again;
-- unbuyable at any price forever (section 10.2).
-- Default banner: "Hatchery Standard" - the banner every card renders
-- when nothing else is equipped (section 4.1).
INSERT INTO cosmetic_definitions (id, name, slot, rarity, render) VALUES
  ('badge_founder',            'Founding Handler',  'badge',  'legendary', '{"kind":"badge","glyph":"egg_crown","animated":true}'),
  ('banner_hatchery_standard', 'Hatchery Standard', 'banner', 'common',    '{"kind":"gradient","from":"#131a2a","to":"#0b0b12"}')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 8. BACKFILLS: what players already earned becomes inventory.
--    Idempotent (ON CONFLICT DO NOTHING) - safe to re-run.
-- ----------------------------------------------------------------------------

-- (a) Season-track claims: player_battle_pass_claims joined to its tier
--     row is the de-facto ownership record for cosmetic/title rewards.
INSERT INTO player_cosmetics (player_id, cosmetic_id, source)
SELECT c.player_id, t.reward_id, 'season_track'
FROM player_battle_pass_claims c
JOIN battle_pass_tiers t ON t.id = c.tier_id
JOIN cosmetic_definitions cd ON cd.id = t.reward_id
WHERE t.reward_type IN ('cosmetic', 'title')
  AND t.reward_id IS NOT NULL
ON CONFLICT (player_id, cosmetic_id) DO NOTHING;

-- (b) Mastery rungs: every rung at or below the player's current level
--     (levels derived via level_for_xp - never stored, never drifts).
INSERT INTO player_cosmetics (player_id, cosmetic_id, source)
SELECT pm.player_id, cd.id, 'mastery'
FROM player_mastery pm
JOIN cosmetic_definitions cd
  ON cd.dynasty = pm.dynasty
 AND cd.mastery_rung IS NOT NULL
 AND cd.mastery_rung <= level_for_xp(pm.xp)
ON CONFLICT (player_id, cosmetic_id) DO NOTHING;

-- (c) Founder badge: accounts created before Season 1 starts.
INSERT INTO player_cosmetics (player_id, cosmetic_id, source)
SELECT p.id, 'badge_founder', 'founder_backfill'
FROM players p
WHERE p.created_at < TIMESTAMPTZ '2026-07-20 00:00:00+00'
ON CONFLICT (player_id, cosmetic_id) DO NOTHING;

-- (d) Default banner: granted to all existing players. New players are
--     covered by the view's Hatchery Standard fallback + the identity
--     API treating it as owned-by-default.
INSERT INTO player_cosmetics (player_id, cosmetic_id, source)
SELECT p.id, 'banner_hatchery_standard', 'default'
FROM players p
ON CONFLICT (player_id, cosmetic_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 9. EQUIP RPC: ownership + slot match enforced server-side; NULL
--    cosmetic unequips the position. Badges cannot be worn twice.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION equip_cosmetic(
  p_player_id UUID,
  p_slot TEXT,
  p_position INTEGER,
  p_cosmetic_id TEXT
) RETURNS JSONB AS $$
DECLARE
  v_def cosmetic_definitions%ROWTYPE;
BEGIN
  IF p_slot NOT IN ('title', 'banner', 'badge', 'trail', 'board_accent', 'emblem')
     OR p_position IS NULL
     OR (p_slot = 'badge' AND p_position NOT BETWEEN 1 AND 3)
     OR (p_slot <> 'badge' AND p_position <> 1) THEN
    RETURN jsonb_build_object('error', 'invalid_slot');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM players WHERE id = p_player_id) THEN
    RETURN jsonb_build_object('error', 'player_not_found');
  END IF;

  -- NULL = unequip the position
  IF p_cosmetic_id IS NULL THEN
    DELETE FROM player_loadout
    WHERE player_id = p_player_id AND slot = p_slot AND position = p_position;
    RETURN jsonb_build_object('success', true, 'equipped', NULL);
  END IF;

  SELECT * INTO v_def FROM cosmetic_definitions WHERE id = p_cosmetic_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_owned');
  END IF;
  IF v_def.slot <> p_slot THEN
    RETURN jsonb_build_object('error', 'slot_mismatch');
  END IF;

  -- Ownership (the default banner is owned by everyone by definition)
  IF p_cosmetic_id <> 'banner_hatchery_standard' AND NOT EXISTS (
    SELECT 1 FROM player_cosmetics
    WHERE player_id = p_player_id AND cosmetic_id = p_cosmetic_id
  ) THEN
    RETURN jsonb_build_object('error', 'not_owned');
  END IF;

  -- A badge is worn once - curation means 3 DIFFERENT badges
  IF p_slot = 'badge' AND EXISTS (
    SELECT 1 FROM player_loadout
    WHERE player_id = p_player_id AND slot = 'badge'
      AND position <> p_position AND cosmetic_id = p_cosmetic_id
  ) THEN
    RETURN jsonb_build_object('error', 'already_equipped');
  END IF;

  INSERT INTO player_loadout (player_id, slot, position, cosmetic_id, updated_at)
  VALUES (p_player_id, p_slot, p_position, p_cosmetic_id, NOW())
  ON CONFLICT (player_id, slot, position)
  DO UPDATE SET cosmetic_id = EXCLUDED.cosmetic_id, updated_at = NOW();

  RETURN jsonb_build_object('success', true, 'equipped', p_cosmetic_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 10. FORWARD GRANT: claim_season_tier - re-created FROM THE 021 BODY
--     (same signature; economy branches byte-identical) with one
--     addition: cosmetic/title rewards also land in player_cosmetics.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION claim_season_tier(p_player_id UUID, p_level INTEGER)
RETURNS JSONB AS $$
DECLARE
  v_season battle_pass_seasons%ROWTYPE;
  v_tier battle_pass_tiers%ROWTYPE;
  v_pbp player_battle_pass%ROWTYPE;
  v_player RECORD;
  v_energy_grant INTEGER := 0;
  v_new_dna INTEGER;
  v_tokens INTEGER;
BEGIN
  SELECT * INTO v_season FROM battle_pass_seasons s
  WHERE s.is_active AND NOW() >= s.starts_at AND NOW() < s.ends_at
  ORDER BY s.season_number DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_ACTIVE_SEASON';
  END IF;

  SELECT * INTO v_tier FROM battle_pass_tiers t
  WHERE t.season_id = v_season.id AND t.level = p_level AND t.is_premium = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_TIER_AT_LEVEL';
  END IF;

  SELECT * INTO v_player FROM players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAYER_NOT_FOUND';
  END IF;

  SELECT * INTO v_pbp FROM player_battle_pass pbp
  WHERE pbp.player_id = p_player_id AND pbp.season_id = v_season.id;
  IF NOT FOUND OR v_pbp.current_level < p_level THEN
    RAISE EXCEPTION 'LEVEL_NOT_REACHED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM player_battle_pass_claims c
    WHERE c.player_id = p_player_id AND c.tier_id = v_tier.id
  ) THEN
    RAISE EXCEPTION 'ALREADY_CLAIMED';
  END IF;

  IF v_tier.reward_type = 'reroll_token' THEN
    UPDATE players
    SET player_reroll_tokens = player_reroll_tokens + COALESCE(v_tier.reward_amount, 1)
    WHERE id = p_player_id
    RETURNING player_reroll_tokens INTO v_tokens;
  ELSIF v_tier.reward_type = 'dna' THEN
    UPDATE players SET dna = dna + COALESCE(v_tier.reward_amount, 0)
    WHERE id = p_player_id
    RETURNING dna INTO v_new_dna;
    IF COALESCE(v_tier.reward_amount, 0) > 0 THEN
      INSERT INTO economy_transactions (player_id, resource_type, amount, balance_after, source_type, metadata)
      VALUES (p_player_id, 'dna', v_tier.reward_amount, v_new_dna, 'battle_pass_reward',
              jsonb_build_object('season', v_season.season_number, 'level', p_level));
    END IF;
  ELSIF v_tier.reward_type = 'energy' THEN
    v_energy_grant := LEAST(
      COALESCE(v_tier.reward_amount, 0),
      GREATEST(0, COALESCE(v_player.max_energy, 5) - v_player.energy)
    );
    IF v_energy_grant > 0 THEN
      UPDATE players SET energy = energy + v_energy_grant WHERE id = p_player_id;
      INSERT INTO economy_transactions (player_id, resource_type, amount, balance_after, source_type, metadata)
      VALUES (p_player_id, 'energy', v_energy_grant, v_player.energy + v_energy_grant, 'battle_pass_reward',
              jsonb_build_object('season', v_season.season_number, 'level', p_level));
    END IF;
  END IF;

  -- Identity v1 (section 5): cosmetic/title rewards become INVENTORY the
  -- equip flow can read - the claim row remains the claim-idempotency
  -- record. Unknown ids (future seasons seeded later) simply skip.
  IF v_tier.reward_type IN ('cosmetic', 'title') AND v_tier.reward_id IS NOT NULL THEN
    INSERT INTO player_cosmetics (player_id, cosmetic_id, source)
    SELECT p_player_id, v_tier.reward_id, 'season_track'
    WHERE EXISTS (SELECT 1 FROM cosmetic_definitions WHERE id = v_tier.reward_id)
    ON CONFLICT (player_id, cosmetic_id) DO NOTHING;
  END IF;

  INSERT INTO player_battle_pass_claims (player_id, season_id, tier_id)
  VALUES (p_player_id, v_season.id, v_tier.id);

  RETURN jsonb_build_object(
    'level', p_level,
    'reward_type', v_tier.reward_type,
    'reward_id', v_tier.reward_id,
    'reward_amount', v_tier.reward_amount,
    'reroll_tokens', v_tokens
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 11. FORWARD GRANT: grant_mastery_xp - re-created FROM THE 019 BODY
--     (same signature; XP math byte-identical) with one addition: every
--     cosmetic rung at or below the NEW level lands in player_cosmetics
--     (idempotent - a missed grant self-heals on the next XP tick).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION grant_mastery_xp(
  p_player_id UUID,
  p_dynasty TEXT,
  p_xp BIGINT
) RETURNS TABLE (xp_after BIGINT, level_after INTEGER) AS $$
DECLARE
  v_xp BIGINT;
BEGIN
  IF p_dynasty NOT IN ('PRIMAL', 'CYBER', 'COSMIC') THEN
    RAISE EXCEPTION 'Invalid dynasty %', p_dynasty;
  END IF;
  IF COALESCE(p_xp, 0) <= 0 THEN
    RAISE EXCEPTION 'Mastery XP grant must be positive (got %)', p_xp;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM players WHERE id = p_player_id) THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  INSERT INTO player_mastery (player_id, dynasty, xp, updated_at)
  VALUES (p_player_id, p_dynasty, p_xp, NOW())
  ON CONFLICT (player_id, dynasty)
  DO UPDATE SET xp = player_mastery.xp + EXCLUDED.xp, updated_at = NOW()
  RETURNING player_mastery.xp INTO v_xp;

  -- Identity v1 (section 5.4): rung cosmetics up to the new level become
  -- inventory. Recompute-from-total, never incremental - self-healing.
  INSERT INTO player_cosmetics (player_id, cosmetic_id, source)
  SELECT p_player_id, cd.id, 'mastery'
  FROM cosmetic_definitions cd
  WHERE cd.dynasty = p_dynasty
    AND cd.mastery_rung IS NOT NULL
    AND cd.mastery_rung <= level_for_xp(v_xp)
  ON CONFLICT (player_id, cosmetic_id) DO NOTHING;

  RETURN QUERY SELECT v_xp, level_for_xp(v_xp);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 12. PLAYER_IDENTITY_VIEW (section 4): the single canonical identity
--     read path. Public-safe by construction: no email, no auth
--     metadata. Exposes BOTH ids: player_id (players.id - game tables)
--     and user_id (auth uid - clan_members.player_id). display_handle
--     derives handler-NNNN for guests (section 3.2: last 4 hex digits of
--     the player UUID as an integer, mod 10000, zero-padded - mirrored
--     by generatedHandleFor in src/lib/identity/handle.ts).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW player_identity_view AS
SELECT
  p.id AS player_id,
  p.user_id,
  p.handle,
  COALESCE(
    p.handle,
    'handler-' || lpad(
      ((('x' || right(replace(p.id::text, '-', ''), 4))::bit(16)::int) % 10000)::text,
      4, '0'
    )
  ) AS display_handle,
  (p.handle IS NULL) AS is_generated_name,
  (p.created_at < TIMESTAMPTZ '2026-07-20 00:00:00+00') AS is_founder,
  p.created_at,
  title_def.id AS title_id,
  title_def.name AS title,
  COALESCE(banner_def.id, 'banner_hatchery_standard') AS banner_id,
  COALESCE(banner_def.render, default_banner.render) AS banner_render,
  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object(
       'id', bcd.id,
       'name', bcd.name,
       'rarity', bcd.rarity,
       'position', pl_badge.position
     ) ORDER BY pl_badge.position)
     FROM player_loadout pl_badge
     JOIN cosmetic_definitions bcd ON bcd.id = pl_badge.cosmetic_id
     WHERE pl_badge.player_id = p.id AND pl_badge.slot = 'badge'),
    '[]'::jsonb
  ) AS badges,
  avatar.variant_id AS avatar_variant_id,
  avatar.variant_name AS avatar_variant_name,
  avatar.rarity AS avatar_rarity,
  avatar.dynasty AS avatar_dynasty,
  avatar.generation AS avatar_generation,
  clan.tag AS clan_tag,
  clan.name AS clan_name,
  COALESCE(
    (SELECT jsonb_object_agg(pm.dynasty, level_for_xp(pm.xp))
     FROM player_mastery pm WHERE pm.player_id = p.id),
    '{}'::jsonb
  ) AS mastery
FROM players p
LEFT JOIN player_loadout pl_title
  ON pl_title.player_id = p.id AND pl_title.slot = 'title' AND pl_title.position = 1
LEFT JOIN cosmetic_definitions title_def ON title_def.id = pl_title.cosmetic_id
LEFT JOIN player_loadout pl_banner
  ON pl_banner.player_id = p.id AND pl_banner.slot = 'banner' AND pl_banner.position = 1
LEFT JOIN cosmetic_definitions banner_def ON banner_def.id = pl_banner.cosmetic_id
LEFT JOIN cosmetic_definitions default_banner ON default_banner.id = 'banner_hatchery_standard'
LEFT JOIN LATERAL (
  -- Avatar (section 4.1): favorited -> equipped -> newest collected
  SELECT sv.id AS variant_id, sv.name AS variant_name, sv.rarity,
         d.name AS dynasty, cs.generation
  FROM collected_snakes cs
  JOIN snake_variants sv ON sv.id = cs.snake_variant_id
  JOIN dynasties d ON d.id = sv.dynasty_id
  WHERE cs.player_id = p.id
  ORDER BY cs.is_favorited DESC NULLS LAST,
           cs.is_equipped DESC NULLS LAST,
           cs.acquired_at DESC
  LIMIT 1
) avatar ON true
LEFT JOIN LATERAL (
  -- Clan tag: clan_members.player_id is the AUTH uid (007), bridge via
  -- players.user_id
  SELECT c.tag, c.name
  FROM clan_members cm
  JOIN clans c ON c.id = cm.clan_id
  WHERE cm.player_id = p.user_id
  LIMIT 1
) clan ON true;

GRANT SELECT ON player_identity_view TO authenticated;
GRANT SELECT ON player_identity_view TO anon;

-- Batch read for list surfaces (leaderboards, rosters): accepts either
-- id space - player ids (game tables) or auth uids (clan tables).
CREATE OR REPLACE FUNCTION get_player_identities(p_ids UUID[])
RETURNS SETOF player_identity_view AS $$
  SELECT * FROM player_identity_view
  WHERE player_id = ANY(p_ids) OR user_id = ANY(p_ids);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 13. RENDER-SITE RE-DECLARATIONS (section 4.1): every SQL surface that
--     said COALESCE(username,'Anonymous') now renders display_handle
--     from player_identity_view. Signatures are IDENTICAL to their
--     current owners; every non-name byte of the bodies is a carryover.
--
-- 13a. clan_top_contributors - re-created FROM THE 021 BODY (anomaly
--      exclusion intact).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION clan_top_contributors(p_clan_id UUID, p_week_start DATE)
RETURNS TABLE (player_name TEXT, counted_dna BIGINT) AS $$
  WITH member_runs AS (
    SELECT
      cm.player_id AS member_user_id,
      gs.dna_earned,
      ROW_NUMBER() OVER (
        PARTITION BY cm.player_id
        ORDER BY gs.dna_earned DESC, gs.ended_at ASC
      ) AS run_rank
    FROM clan_members cm
    JOIN players p ON p.user_id = cm.player_id
    JOIN game_sessions gs ON gs.player_id = p.id
    WHERE cm.clan_id = p_clan_id
      AND gs.ended_at IS NOT NULL
      AND gs.dna_earned > 0
      AND gs.anomaly_id IS NULL              -- anomaly runs: own board only
      AND gs.ended_at >= (p_week_start::timestamp AT TIME ZONE 'UTC')
      AND gs.ended_at <  ((p_week_start + 7)::timestamp AT TIME ZONE 'UTC')
  ),
  member_totals AS (
    SELECT member_user_id, SUM(dna_earned) AS member_dna
    FROM member_runs
    WHERE run_rank <= 30
    GROUP BY member_user_id
  )
  SELECT
    COALESCE(piv.display_handle, 'Anonymous') AS player_name,
    mt.member_dna::BIGINT AS counted_dna
  FROM member_totals mt
  LEFT JOIN player_identity_view piv ON piv.user_id = mt.member_user_id
  ORDER BY mt.member_dna DESC
  LIMIT 10;
$$ LANGUAGE sql STABLE;

-- ----------------------------------------------------------------------------
-- 13b. gauntlet_top_contributors - re-created FROM THE 021 BODY
--      (include_anomaly lens intact).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION gauntlet_top_contributors(
  p_week_start DATE,
  p_clan_id UUID,
  p_side JSONB,
  p_roster UUID[]
) RETURNS TABLE (player_name TEXT, counted_dna BIGINT) AS $$
DECLARE
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ := ((p_week_start + 7)::timestamp AT TIME ZONE 'UTC');
  v_dyn TEXT;
  v_dyn2 TEXT;
  v_top INTEGER := 10;
  v_best INTEGER := 30;
  v_extracted BOOLEAN := false;
  v_incl_anomaly BOOLEAN := false;
BEGIN
  IF p_side IS NULL THEN
    v_from := (p_week_start::timestamp AT TIME ZONE 'UTC');
  ELSE
    v_from := ((p_week_start + 3)::timestamp AT TIME ZONE 'UTC');
    v_dyn := p_side->>'dynasty';
    v_dyn2 := p_side->>'dynasty2';
    v_top := COALESCE((p_side->>'top_members')::integer, 10);
    v_best := COALESCE((p_side->>'best_runs')::integer, 30);
    v_extracted := COALESCE((p_side->>'extracted_only')::boolean, false);
    v_incl_anomaly := COALESCE((p_side->>'include_anomaly')::boolean, false);
  END IF;

  RETURN QUERY
  WITH member_runs AS (
    SELECT
      cm.player_id AS member_user_id,
      gs.dna_earned,
      ROW_NUMBER() OVER (
        PARTITION BY cm.player_id
        ORDER BY gs.dna_earned DESC, gs.ended_at ASC
      ) AS run_rank
    FROM clan_members cm
    JOIN players p ON p.user_id = cm.player_id
    JOIN game_sessions gs ON gs.player_id = p.id
    WHERE cm.clan_id = p_clan_id
      AND (p_roster IS NULL OR cm.player_id = ANY(p_roster))
      AND gs.ended_at IS NOT NULL
      AND gs.dna_earned > 0
      AND gs.ended_at >= v_from
      AND gs.ended_at < v_to
      AND (v_incl_anomaly OR gs.anomaly_id IS NULL)
      AND (v_dyn IS NULL OR UPPER(gs.dynasty) = v_dyn OR UPPER(gs.dynasty) = v_dyn2)
      AND (NOT v_extracted OR gs.extracted IS TRUE)
  ),
  member_totals AS (
    SELECT member_user_id, SUM(dna_earned) AS member_dna
    FROM member_runs
    WHERE run_rank <= v_best
    GROUP BY member_user_id
  )
  SELECT
    COALESCE(piv.display_handle, 'Anonymous') AS player_name,
    mt.member_dna::BIGINT AS counted_dna
  FROM member_totals mt
  LEFT JOIN player_identity_view piv ON piv.user_id = mt.member_user_id
  ORDER BY mt.member_dna DESC
  LIMIT v_top;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 13c. get_anomaly_board - re-created FROM THE 021 BODY. Rows keep
--      'name' (now display_handle) and gain an 'identity' object for the
--      Player Card row variant.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_anomaly_board(p_player_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_week DATE := duel_week_start(NOW());
  v_anomaly TEXT := anomaly_for_week(v_week);
  v_top JSONB;
  v_my JSONB;
BEGIN
  WITH board AS (
    SELECT
      gs.player_id,
      MAX(gs.score) AS best_score,
      COUNT(*)::int AS runs
    FROM game_sessions gs
    WHERE gs.anomaly_id = v_anomaly
      AND gs.anomaly_week = v_week
      AND gs.ended_at IS NOT NULL
      AND gs.validated IS TRUE
      AND gs.is_free_play IS NOT TRUE
    GROUP BY gs.player_id
  ),
  ranked AS (
    SELECT
      board.player_id,
      board.best_score,
      board.runs,
      ROW_NUMBER() OVER (ORDER BY board.best_score DESC, board.player_id ASC) AS rank
    FROM board
  )
  SELECT
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'rank', r.rank,
         'name', COALESCE(piv.display_handle, 'Anonymous'),
         'score', r.best_score,
         'identity', CASE WHEN piv.player_id IS NULL THEN NULL ELSE jsonb_build_object(
           'handle', piv.display_handle,
           'is_generated', piv.is_generated_name,
           'title', piv.title,
           'clan_tag', piv.clan_tag,
           'founder', piv.is_founder,
           'badges', piv.badges
         ) END
       ) ORDER BY r.rank)
       FROM ranked r
       LEFT JOIN player_identity_view piv ON piv.player_id = r.player_id
       WHERE r.rank <= 10),
      '[]'::jsonb
    ),
    (SELECT jsonb_build_object(
       'best', r.best_score,
       'rank', r.rank,
       'runs', r.runs
     ) FROM ranked r WHERE r.player_id = p_player_id)
  INTO v_top, v_my;

  RETURN jsonb_build_object(
    'anomaly_id', v_anomaly,
    'week_start', v_week,
    'ends_at', ((v_week + 7)::timestamp AT TIME ZONE 'UTC'),
    'top', v_top,
    'my', v_my
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 13d. get_gauntlet - re-created FROM THE 020 BODY. Two name sites
--      change: the tithe list and the scouting roster (which also gains
--      an 'identity' object per member). Everything else is a carryover.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_gauntlet(p_clan_id UUID, p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_week DATE;
  v_duel RECORD;
  v_opponent_id UUID;
  v_revealed BOOLEAN := false;
  v_my_picks JSONB;
  v_their_picks JSONB;
  v_phase TEXT;
  v_research JSONB;
  v_scouting JSONB := NULL;
  v_gauntlet JSONB := NULL;
  v_has_detail BOOLEAN;
  v_has_early BOOLEAN;
  v_preview JSONB := NULL;
  v_my_role TEXT;
BEGIN
  PERFORM settle_and_pair_duels();
  v_week := duel_week_start(NOW());

  SELECT role INTO v_my_role
  FROM clan_members WHERE player_id = p_user_id AND clan_id = p_clan_id;

  v_has_detail := clan_has_research(p_clan_id, 'logistics_1');
  v_has_early := clan_has_research(p_clan_id, 'logistics_3');

  -- ---- Research block ---------------------------------------------------
  SELECT jsonb_build_object(
    'pool', COALESCE((SELECT dna_contributed FROM clan_research_progress WHERE clan_id = p_clan_id), 0),
    'target', (SELECT node_id FROM clan_research_target WHERE clan_id = p_clan_id),
    'unlocked', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('node_id', node_id, 'unlocked_at', unlocked_at) ORDER BY unlocked_at)
       FROM clan_research WHERE clan_id = p_clan_id),
      '[]'::jsonb
    ),
    'tithe_cap', 500,
    'my_tithe_this_week', COALESCE(
      (SELECT SUM(amount) FROM clan_tithes WHERE player_id = p_user_id AND week_start = v_week), 0
    ),
    'recent_tithes', COALESCE(
      (SELECT jsonb_agg(t ORDER BY t->>'week_start' DESC)
       FROM (
         SELECT jsonb_build_object(
           'name', COALESCE(piv.display_handle, 'Anonymous'),
           'amount', ct.amount,
           'week_start', ct.week_start
         ) AS t
         FROM clan_tithes ct
         LEFT JOIN player_identity_view piv ON piv.user_id = ct.player_id
         WHERE ct.clan_id = p_clan_id
         ORDER BY ct.week_start DESC, ct.updated_at DESC
         LIMIT 10
       ) recent),
      '[]'::jsonb
    )
  ) INTO v_research;

  -- ---- Current duel + scouting ------------------------------------------
  SELECT * INTO v_duel
  FROM clan_duels
  WHERE week_start = v_week
    AND (clan_a = p_clan_id OR clan_b = p_clan_id)
  LIMIT 1;

  IF FOUND AND v_duel.clan_b IS NOT NULL THEN
    PERFORM resolve_gauntlet(v_duel.id);
    SELECT * INTO v_duel FROM clan_duels WHERE id = v_duel.id;

    v_opponent_id := CASE WHEN v_duel.clan_a = p_clan_id THEN v_duel.clan_b ELSE v_duel.clan_a END;

    v_phase := CASE
      WHEN NOW() < ((v_week + 2)::timestamp AT TIME ZONE 'UTC') THEN 'picks_open'
      WHEN NOW() < ((v_week + 3)::timestamp AT TIME ZONE 'UTC') THEN 'locked'
      ELSE 'scoring'
    END;

    v_revealed := NOW() >= ((v_week + 2)::timestamp AT TIME ZONE 'UTC')
      OR (SELECT COUNT(*) FROM gauntlet_picks WHERE duel_id = v_duel.id) = 2;

    SELECT jsonb_build_object(
      'dynasty', gp.dynasty_pick,
      'dynasty_2', gp.dynasty_pick_2,
      'modifier', gp.modifier_pick,
      'ban', gp.mutation_ban,
      'locked_at', gp.locked_at
    ) INTO v_my_picks
    FROM gauntlet_picks gp
    WHERE gp.duel_id = v_duel.id AND gp.clan_id = p_clan_id;

    IF v_revealed THEN
      SELECT jsonb_build_object(
        'dynasty', gp.dynasty_pick,
        'dynasty_2', gp.dynasty_pick_2,
        'modifier', gp.modifier_pick,
        'ban', gp.mutation_ban,
        'locked_at', gp.locked_at
      ) INTO v_their_picks
      FROM gauntlet_picks gp
      WHERE gp.duel_id = v_duel.id AND gp.clan_id = v_opponent_id;
    END IF;

    -- Scouting (open all week from Mon pairing): opponent's locked roster
    -- with per-dynasty mastery levels + their last 3 weeks' picks.
    -- Identity v1: roster members render as Player Cards - 'name' is the
    -- display handle and 'identity' carries the card fields.
    SELECT jsonb_build_object(
      'roster', COALESCE(
        (SELECT jsonb_agg(m ORDER BY (m->>'name'))
         FROM (
           SELECT jsonb_build_object(
             'name', COALESCE(piv.display_handle, 'Anonymous'),
             'identity', CASE WHEN piv.player_id IS NULL THEN NULL ELSE jsonb_build_object(
               'handle', piv.display_handle,
               'is_generated', piv.is_generated_name,
               'title', piv.title,
               'clan_tag', piv.clan_tag,
               'founder', piv.is_founder,
               'badges', piv.badges,
               'avatar_dynasty', piv.avatar_dynasty
             ) END,
             'mastery', COALESCE(
               (SELECT jsonb_object_agg(pm.dynasty,
                  CASE WHEN v_has_detail
                       THEN jsonb_build_object('level', level_for_xp(pm.xp), 'xp', pm.xp)
                       ELSE jsonb_build_object('level', level_for_xp(pm.xp))
                  END)
                FROM player_mastery pm WHERE pm.player_id = pl.id),
               '{}'::jsonb
             )
           ) AS m
           FROM unnest(
             CASE WHEN v_duel.clan_a = p_clan_id THEN v_duel.roster_b ELSE v_duel.roster_a END
           ) AS roster_user(user_id)
           JOIN players pl ON pl.user_id = roster_user.user_id
           LEFT JOIN player_identity_view piv ON piv.player_id = pl.id
         ) members),
        '[]'::jsonb
      ),
      'last_picks', COALESCE(
        (SELECT jsonb_agg(p ORDER BY (p->>'week_start') DESC)
         FROM (
           SELECT jsonb_build_object(
             'week_start', d.week_start,
             'dynasty', gp.dynasty_pick,
             'dynasty_2', gp.dynasty_pick_2,
             'modifier', gp.modifier_pick,
             'ban', gp.mutation_ban
           ) AS p
           FROM gauntlet_picks gp
           JOIN clan_duels d ON d.id = gp.duel_id
           WHERE gp.clan_id = v_opponent_id
             AND d.week_start < v_week
           ORDER BY d.week_start DESC
           LIMIT 3
         ) hist),
        '[]'::jsonb
      ),
      'detail', v_has_detail
    ) INTO v_scouting;

    v_gauntlet := jsonb_build_object(
      'duel_id', v_duel.id,
      'week_start', v_duel.week_start,
      'phase', v_phase,
      'picks_deadline', ((v_week + 2)::timestamp AT TIME ZONE 'UTC'),
      'window_from', ((v_week + 3)::timestamp AT TIME ZONE 'UTC'),
      'window_to', ((v_week + 7)::timestamp AT TIME ZONE 'UTC'),
      'opponent', (SELECT jsonb_build_object('id', c.id, 'name', c.name, 'tag', c.tag, 'rating', c.rating)
                   FROM clans c WHERE c.id = v_opponent_id),
      'revealed', v_revealed,
      'my_picks', v_my_picks,
      'their_picks', v_their_picks,
      'my_rules', v_duel.effective_rules -> (CASE WHEN v_duel.clan_a = p_clan_id THEN 'a' ELSE 'b' END),
      'their_rules', CASE WHEN v_revealed
        THEN v_duel.effective_rules -> (CASE WHEN v_duel.clan_a = p_clan_id THEN 'b' ELSE 'a' END)
        ELSE NULL END,
      'scouting', v_scouting,
      'can_substitute', clan_has_research(p_clan_id, 'logistics_2')
        AND NOT COALESCE((v_duel.gauntlet_meta ->>
          ('substituted_' || (CASE WHEN v_duel.clan_a = p_clan_id THEN 'a' ELSE 'b' END)))::boolean, false)
    );
  END IF;

  -- Early scouting (logistics_3): from Sun 12:00, preview the projected
  -- next-week opponent (rating-adjacent neighbor)
  IF v_has_early
     AND NOW() >= (((v_week + 6)::timestamp AT TIME ZONE 'UTC') + INTERVAL '12 hours') THEN
    WITH ranked AS (
      SELECT id, name, tag, rating,
             ROW_NUMBER() OVER (ORDER BY rating DESC, created_at ASC, id ASC) AS rn
      FROM clans WHERE member_count >= 1
    ),
    me AS (SELECT rn FROM ranked WHERE id = p_clan_id)
    SELECT jsonb_build_object('name', r.name, 'tag', r.tag, 'rating', r.rating)
    INTO v_preview
    FROM ranked r, me
    WHERE r.id <> p_clan_id
    ORDER BY ABS(r.rn - me.rn) ASC, r.rn ASC
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'is_officer', v_my_role IN ('owner', 'officer'),
    'research', v_research,
    'gauntlet', v_gauntlet,
    'early_preview', v_preview
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 14. RUN-EVENT CAPTURE (section 9.5): death_cause + run_events on
--     game_sessions. The API validates bounds (<=600 events, <=32KB,
--     monotonic deciseconds, counts vs validated facts) and stores the
--     {v:1, events, truncated, suspect} envelope - or NULL on any
--     violation, with the run completing normally. NEVER an input to
--     payouts, records, or leaderboards.
-- ----------------------------------------------------------------------------

ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS death_cause TEXT CHECK (death_cause IN ('wall', 'self', 'timeout', 'extracted')),
  ADD COLUMN IF NOT EXISTS run_events JSONB;

COMMENT ON COLUMN game_sessions.death_cause IS
  'How the run ended (Identity v1 section 9.5): wall | self | timeout | extracted. Kept forever - feeds Chronicle + archetypes. Never payout input.';
COMMENT ON COLUMN game_sessions.run_events IS
  'Compact discrete-event envelope {v:1, events, truncated, suspect} (Identity v1 section 9.5). Display + Analyst input ONLY - never payouts/records/leaderboards. Prune rows older than 90 days.';

-- ----------------------------------------------------------------------------
-- 15. GRANTS (PostgREST parity; the API uses the service role)
-- ----------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION normalize_handle(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION claim_handle(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION equip_cosmetic(UUID, TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_player_identities(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_player_identities(UUID[]) TO anon;
GRANT SELECT ON cosmetic_definitions TO authenticated;
GRANT SELECT ON cosmetic_definitions TO anon;
