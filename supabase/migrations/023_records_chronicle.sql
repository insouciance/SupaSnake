-- ============================================================================
-- Migration 023: Records & Chronicle (Player Identity v1, Phase I2)
-- PLAYER_IDENTITY_V1.md sections 6 (Records) and 7 (The Chronicle) - the
-- plan-of-record is "Identity v1" (investigate-this-repo-it-rosy-charm).
--
-- 1. RECORDS (section 6): record_definitions - the 21 authored records
--    across 6 categories (extraction / dynasty / collection / gauntlet /
--    veterancy / legacy), each with 5 tiers Bronze/Silver/Gold/Diamond/
--    Apex worth tier points {5, 10, 20, 35, 60} (cumulative banking:
--    a Gold record has banked 5+10+20 = 35 points). Thresholds are the
--    doc's section 6.1 tables, byte-for-byte. player_records holds the
--    per-player value + reached tier.
-- 2. LEGACY SCORE (section 6.2): players.legacy_score - the one-number
--    prestige summary (sum of banked tier points). DESC-indexed. It buys
--    nothing, multiplies nothing, and is never an input to any economy
--    or matchmaking formula.
-- 3. RECORD-TIER BADGES (section 5.5): every record x tier generates a
--    badge cosmetic def record_<id>_t<1..5> (21 x 5 = 105 rows) with
--    rarity mapped from tier: Bronze->common, Silver->uncommon,
--    Gold->rare, Diamond->epic, Apex->legendary (Apex is animated -
--    animated = legendary = earned, section 5.6). Generated, not
--    hand-seeded.
-- 4. CAPSTONE TITLES (section 6.4): 6 legendary titles, one per
--    category - unlocked when every record in the category reaches
--    Diamond (tier 4); the animated treatment is a render-time upgrade
--    once every record reaches Apex (the records data carries the fact).
-- 5. refresh_player_records(p_player_id) (section 6.3): IDEMPOTENT
--    recompute-from-aggregates - never incremental event-counting, so it
--    is self-healing after any backfill or bug. Reads session
--    aggregates, mastery XP, collection, gauntlet participation, the
--    tithes ledger, streaks, anomaly boards, season tracks and
--    championships; upserts player_records; grants newly reached tier
--    badges + capstone titles into player_cosmetics; recomputes
--    legacy_score. SERVICE-ROLE ONLY (revoked from anon/authenticated) -
--    the API calls it non-fatally at session end and rate-limited
--    (records_refresh, 60s) on own-Chronicle view.
-- 6. CLAN RATING HISTORY (section 7.1): clan_rating_history - appended
--    at settlement for both clans of every settled duel. PUBLIC READ
--    (it feeds the public Chronicle's clan graph). settle_and_pair_duels
--    is re-declared FROM THE 021 BODY (current owner - 022 did not touch
--    it) with an IDENTICAL signature; every non-history byte of the body
--    is a carryover.
-- 7. PB TIMELINE (section 7.1): chronicle_pb_timeline RPC - weekly
--    MAX(score) per dynasty over validated earning runs - plus the
--    missing (player_id, score DESC) index on game_sessions.
-- 8. player_identity_view re-declared with legacy_score APPENDED (the
--    full card renders it, section 6.2); get_player_identities
--    re-declared onto the new rowtype. All other columns byte-identical
--    to 022.
-- 9. RATE LIMITS: records_refresh joins the rate_limits CHECK
--    (src/lib/server/rateLimit.ts RATE_LIMITS - keep in lockstep).
-- 10. BACKFILL: one-time refresh_player_records over existing players so
--     launch-window careers render immediately (idempotent - safe to
--     re-run).
--
-- The API layer is pre-023-safe throughout: a missing table/column/RPC
-- reads as "records not live yet" (no records section, no legacy score)
-- and never fails a request.
-- economy_transactions: this migration adds NO faucets and NO sinks
-- (section 10.1) - records pay prestige, never DNA. Achievements (003)
-- are untouched: tables, checker and claim flow stay as they are; only
-- their DISPLAY surface retires into the Chronicle (section 6.6).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. LEGACY SCORE (section 6.2): players.legacy_score + DESC index
-- ----------------------------------------------------------------------------

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS legacy_score INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_players_legacy_score
  ON players (legacy_score DESC);

COMMENT ON COLUMN players.legacy_score IS
  'Sum of banked record tier points (Identity v1 section 6.2). Prestige only - never an economy or matchmaking input. Recomputed by refresh_player_records.';

-- ----------------------------------------------------------------------------
-- 2. RECORD DEFINITIONS (section 6.1): 21 records, 6 categories, 5-tier
--    thresholds, tier points {5,10,20,35,60}.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS record_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('extraction', 'dynasty', 'collection', 'gauntlet', 'veterancy', 'legacy')),
  dynasty TEXT CHECK (dynasty IN ('PRIMAL', 'CYBER', 'COSMIC')),
  measures TEXT NOT NULL,
  thresholds BIGINT[] NOT NULL CHECK (array_length(thresholds, 1) = 5),
  tier_points INTEGER[] NOT NULL DEFAULT '{5,10,20,35,60}' CHECK (array_length(tier_points, 1) = 5),
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE record_definitions ENABLE ROW LEVEL SECURITY;

-- Catalog data: readable by everyone, written only by migrations
DROP POLICY IF EXISTS record_definitions_select_all ON record_definitions;
CREATE POLICY record_definitions_select_all ON record_definitions
  FOR SELECT USING (true);

-- Extraction (capstone: "Extractor Prime")
INSERT INTO record_definitions (id, name, category, measures, thresholds, sort_order) VALUES
  ('vault',          'The Vault',      'extraction', 'Lifetime DNA banked (extracted runs)',       '{5000,25000,100000,400000,1000000}', 1),
  ('high_water',     'High Water',     'extraction', 'Best single-run banked payout',              '{500,1200,2500,4500,6500}',          2),
  ('clean_getaways', 'Clean Getaways', 'extraction', 'Total extractions',                          '{10,50,250,1000,2500}',              3),
  ('cold_blood',     'Cold Blood',     'extraction', 'Deep extractions (banked at 63+ foods)',     '{1,10,50,200,500}',                  4)
ON CONFLICT (id) DO NOTHING;

-- Dynasty Depth (per-dynasty x3; capstone: "Apex Handler"). Tiers are
-- mastery levels M2/M4/M6/M8/M10 expressed as their level_for_xp
-- thresholds (019): 3,000 / 14,000 / 41,000 / 92,000 / 175,000 XP.
INSERT INTO record_definitions (id, name, category, dynasty, measures, thresholds, sort_order) VALUES
  ('primal_depth', 'Primal Depth', 'dynasty', 'PRIMAL', 'PRIMAL mastery XP', '{3000,14000,41000,92000,175000}', 5),
  ('cyber_depth',  'Cyber Depth',  'dynasty', 'CYBER',  'CYBER mastery XP',  '{3000,14000,41000,92000,175000}', 6),
  ('cosmic_depth', 'Cosmic Depth', 'dynasty', 'COSMIC', 'COSMIC mastery XP', '{3000,14000,41000,92000,175000}', 7)
ON CONFLICT (id) DO NOTHING;

-- Collection (capstone: "Grand Curator")
INSERT INTO record_definitions (id, name, category, measures, thresholds, sort_order) VALUES
  ('menagerie', 'The Menagerie', 'collection', 'Distinct variants collected (of 30)', '{5,12,20,26,30}',   8),
  ('bloodline', 'Bloodline',     'collection', 'Highest prestige generation bred',    '{2,3,5,8,12}',      9),
  ('geneflow',  'Geneflow',      'collection', 'Total breeds performed',              '{5,20,50,150,400}', 10)
ON CONFLICT (id) DO NOTHING;

-- Gauntlet (capstone: "Warmaster")
INSERT INTO record_definitions (id, name, category, measures, thresholds, sort_order) VALUES
  ('on_the_wall', 'On the Wall', 'gauntlet', 'Counted gauntlet runs (scored windows)',        '{10,50,200,600,1500}',        11),
  ('campaigner',  'Campaigner',  'gauntlet', 'Distinct duel/gauntlet weeks participated',     '{2,6,15,30,60}',              12),
  ('benefactor',  'Benefactor',  'gauntlet', 'Lifetime DNA tithed to clan research',          '{500,2500,8000,20000,50000}', 13)
ON CONFLICT (id) DO NOTHING;

-- Veterancy (capstone: "Old Guard")
INSERT INTO record_definitions (id, name, category, measures, thresholds, sort_order) VALUES
  ('tenure',   'Tenure',   'veterancy', 'Account age (days)',           '{30,90,365,730,1461}',    14),
  ('unbroken', 'Unbroken', 'veterancy', 'Longest login streak (days)',  '{7,14,30,60,120}',        15),
  ('mileage',  'Mileage',  'veterancy', 'Total earning runs completed', '{50,250,1000,3000,8000}', 16)
ON CONFLICT (id) DO NOTHING;

-- Legacy (seasonal; capstone: "Perennial")
INSERT INTO record_definitions (id, name, category, measures, thresholds, sort_order) VALUES
  ('stormchaser',       'Stormchaser',       'legacy', 'Distinct anomaly weeks with a board run', '{2,8,20,40,80}',   17),
  ('board_presence',    'Board Presence',    'legacy', 'Weekly anomaly-board top-10 finishes',    '{1,5,15,40,100}',  18),
  ('chronicler',        'Chronicler',        'legacy', 'Cumulative season-track levels reached',  '{10,30,75,150,300}', 19),
  ('dynast_of_seasons', 'Dynast of Seasons', 'legacy', 'Seasons with the track completed',        '{1,2,4,7,12}',     20),
  ('crowned',           'Crowned',           'legacy', 'Season championships',                    '{1,2,3,4,5}',      21)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. PLAYER RECORDS: value + reached tier per (player, record). Written
--    only by refresh_player_records / the service role.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS player_records (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  record_id TEXT NOT NULL REFERENCES record_definitions(id) ON DELETE CASCADE,
  value BIGINT NOT NULL DEFAULT 0,
  tier INTEGER NOT NULL DEFAULT 0 CHECK (tier BETWEEN 0 AND 5),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, record_id)
);

ALTER TABLE player_records ENABLE ROW LEVEL SECURITY;

-- Players read their own records; public profiles read via the service
-- role. All writes go through the SECURITY DEFINER refresh RPC.
DROP POLICY IF EXISTS player_records_select_own ON player_records;
CREATE POLICY player_records_select_own ON player_records
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 4. RECORD-TIER BADGE GENERATION (section 5.5): 21 records x 5 tiers =
--    105 badge defs record_<id>_t<tier>, rarity per the tier->rarity
--    map. Apex (t5) is animated (animated = legendary = earned).
-- ----------------------------------------------------------------------------

INSERT INTO cosmetic_definitions (id, name, slot, rarity, render)
SELECT
  'record_' || rd.id || '_t' || t.tier,
  rd.name || ' — ' || (ARRAY['Bronze', 'Silver', 'Gold', 'Diamond', 'Apex'])[t.tier],
  'badge',
  (ARRAY['common', 'uncommon', 'rare', 'epic', 'legendary'])[t.tier],
  jsonb_build_object(
    'kind', 'badge',
    'glyph', 'record_tier',
    'record', rd.id,
    'category', rd.category,
    'tier', t.tier,
    'animated', t.tier = 5
  )
FROM record_definitions rd
CROSS JOIN generate_series(1, 5) AS t(tier)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. CAPSTONE TITLES (section 6.4): 6 legendary titles, one per
--    category. Unlocked at all-Diamond; the animated treatment is a
--    render-time upgrade at all-Apex (driven by records data, not a
--    second cosmetic).
-- ----------------------------------------------------------------------------

INSERT INTO cosmetic_definitions (id, name, slot, rarity, render) VALUES
  ('title_extractor_prime', 'Extractor Prime', 'title', 'legendary', '{"kind":"title","capstone":"extraction"}'),
  ('title_apex_handler',    'Apex Handler',    'title', 'legendary', '{"kind":"title","capstone":"dynasty"}'),
  ('title_grand_curator',   'Grand Curator',   'title', 'legendary', '{"kind":"title","capstone":"collection"}'),
  ('title_warmaster',       'Warmaster',       'title', 'legendary', '{"kind":"title","capstone":"gauntlet"}'),
  ('title_old_guard',       'Old Guard',       'title', 'legendary', '{"kind":"title","capstone":"veterancy"}'),
  ('title_perennial',       'Perennial',       'title', 'legendary', '{"kind":"title","capstone":"legacy"}')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 6. CLAN RATING HISTORY (section 7.1): appended at settlement, public
--    read (it feeds the public Chronicle's clan graph).
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS clan_rating_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  rating_after INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clan_id, week_start)
);

ALTER TABLE clan_rating_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clan_rating_history_public_read ON clan_rating_history;
CREATE POLICY clan_rating_history_public_read ON clan_rating_history
  FOR SELECT USING (true);

-- ----------------------------------------------------------------------------
-- 7. PB TIMELINE SUPPORT (section 7.1): the missing per-player score
--    index + the weekly MAX(score)-per-dynasty read.
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_game_sessions_player_score
  ON game_sessions (player_id, score DESC);

-- Weekly personal bests per dynasty over validated earning runs. The
-- Chronicle annotates these weeks with cosmetic acquisition moments
-- (record tiers, mastery rungs) from player_cosmetics.acquired_at.
CREATE OR REPLACE FUNCTION chronicle_pb_timeline(p_player_id UUID)
RETURNS TABLE (week_start DATE, dynasty TEXT, best_score INTEGER, runs INTEGER) AS $$
  SELECT
    duel_week_start(gs.ended_at) AS week_start,
    UPPER(COALESCE(gs.dynasty, 'CYBER')) AS dynasty,
    MAX(gs.score)::INTEGER AS best_score,
    COUNT(*)::INTEGER AS runs
  FROM game_sessions gs
  WHERE gs.player_id = p_player_id
    AND gs.ended_at IS NOT NULL
    AND gs.validated IS TRUE
    AND gs.is_free_play IS NOT TRUE
  GROUP BY 1, 2
  ORDER BY 1 ASC, 2 ASC;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION chronicle_pb_timeline(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION chronicle_pb_timeline(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION chronicle_pb_timeline(UUID) FROM authenticated;

-- ----------------------------------------------------------------------------
-- 8. RATE LIMITS: the lazy own-Chronicle refresh gets its action
--    (records_refresh, 60s in src/lib/server/rateLimit.ts - lockstep).
-- ----------------------------------------------------------------------------

ALTER TABLE rate_limits DROP CONSTRAINT IF EXISTS rate_limits_action_type_check;
ALTER TABLE rate_limits ADD CONSTRAINT rate_limits_action_type_check
  CHECK (action_type IN ('game_start', 'breeding', 'purchase', 'handle_check', 'handle_claim', 'records_refresh'));

-- ----------------------------------------------------------------------------
-- 9. REFRESH RPC (section 6.3): idempotent recompute-from-aggregates.
--    SERVICE-ROLE ONLY. Sources (all pre-existing telemetry - no record
--    waits on new instrumentation):
--
--    - Extraction + Mileage: game_sessions (ended, validated, non-free).
--      dna_earned is the chosen banked-DNA source over the
--      economy_transactions game_reward ledger: BOTH are server-written
--      at session end, but dna_earned is the per-run validated payout
--      the duel/gauntlet scorers already trust (011/020/021), it needs
--      no metadata parsing, and it is indexed. The ledger stays the
--      audit trail; the session row stays the aggregate source.
--    - Dynasty Depth: player_mastery.xp (levels derived, never stored).
--    - Collection: collected_snakes (+ distinct snake_variant_id).
--    - Geneflow: breeding_history.
--    - Gauntlet: clan_duels rosters/weeks (auth-uid space) + clan_tithes.
--      "Counted" runs are earning runs inside the scored window of a
--      duel week the player was rostered for (Thu-Sun once rules exist,
--      the whole week for pre-rules duels) - the per-side dynasty/lens
--      picks are not replayed here: the record measures participation
--      volume, per the doc's roster/weeks sourcing.
--    - Veterancy: players.created_at, player_streaks.longest_streak.
--    - Legacy: anomaly boards (finished weeks only - a "finish" needs a
--      closed board), player_battle_pass vs the season's max_level,
--      season_champions joined through the championship duel roster
--      (bye championships fall back to current membership).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION refresh_player_records(p_player_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user UUID;
  v_created TIMESTAMPTZ;
  -- extraction + mileage
  v_vault BIGINT := 0;
  v_high_water BIGINT := 0;
  v_getaways BIGINT := 0;
  v_cold_blood BIGINT := 0;
  v_mileage BIGINT := 0;
  -- dynasty
  v_primal_xp BIGINT := 0;
  v_cyber_xp BIGINT := 0;
  v_cosmic_xp BIGINT := 0;
  -- collection
  v_menagerie BIGINT := 0;
  v_bloodline BIGINT := 0;
  v_geneflow BIGINT := 0;
  -- gauntlet
  v_on_the_wall BIGINT := 0;
  v_campaigner BIGINT := 0;
  v_benefactor BIGINT := 0;
  -- veterancy
  v_tenure BIGINT := 0;
  v_unbroken BIGINT := 0;
  -- legacy
  v_stormchaser BIGINT := 0;
  v_board_presence BIGINT := 0;
  v_chronicler BIGINT := 0;
  v_dynast BIGINT := 0;
  v_crowned BIGINT := 0;
  v_legacy_score INTEGER := 0;
BEGIN
  SELECT user_id, created_at INTO v_user, v_created
  FROM players WHERE id = p_player_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'player_not_found');
  END IF;

  -- ---- Extraction + Mileage (one pass over the player's sessions) ------
  SELECT
    COALESCE(SUM(gs.dna_earned) FILTER (WHERE gs.extracted), 0),
    COALESCE(MAX(gs.dna_earned) FILTER (WHERE gs.extracted), 0),
    COUNT(*) FILTER (WHERE gs.extracted),
    COUNT(*) FILTER (WHERE gs.extracted AND gs.foods_collected >= 63),
    COUNT(*)
  INTO v_vault, v_high_water, v_getaways, v_cold_blood, v_mileage
  FROM game_sessions gs
  WHERE gs.player_id = p_player_id
    AND gs.ended_at IS NOT NULL
    AND gs.validated IS TRUE
    AND gs.is_free_play IS NOT TRUE;

  -- ---- Dynasty Depth ---------------------------------------------------
  SELECT
    COALESCE(MAX(pm.xp) FILTER (WHERE pm.dynasty = 'PRIMAL'), 0),
    COALESCE(MAX(pm.xp) FILTER (WHERE pm.dynasty = 'CYBER'), 0),
    COALESCE(MAX(pm.xp) FILTER (WHERE pm.dynasty = 'COSMIC'), 0)
  INTO v_primal_xp, v_cyber_xp, v_cosmic_xp
  FROM player_mastery pm
  WHERE pm.player_id = p_player_id;

  -- ---- Collection ------------------------------------------------------
  SELECT COUNT(DISTINCT cs.snake_variant_id), COALESCE(MAX(cs.generation), 0)
  INTO v_menagerie, v_bloodline
  FROM collected_snakes cs
  WHERE cs.player_id = p_player_id;

  SELECT COUNT(*) INTO v_geneflow
  FROM breeding_history bh
  WHERE bh.player_id = p_player_id;

  -- ---- Gauntlet (auth-uid space; guests have no clan surface) ----------
  IF v_user IS NOT NULL THEN
    SELECT COUNT(DISTINCT d.week_start) INTO v_campaigner
    FROM clan_duels d
    WHERE v_user = ANY(d.roster_a) OR v_user = ANY(COALESCE(d.roster_b, '{}'));

    SELECT COUNT(*) INTO v_on_the_wall
    FROM clan_duels d
    JOIN game_sessions gs
      ON gs.player_id = p_player_id
     AND gs.ended_at IS NOT NULL
     AND gs.dna_earned > 0
     AND gs.is_free_play IS NOT TRUE
     AND gs.ended_at >= CASE WHEN d.effective_rules IS NOT NULL
           THEN ((d.week_start + 3)::timestamp AT TIME ZONE 'UTC')
           ELSE (d.week_start::timestamp AT TIME ZONE 'UTC') END
     AND gs.ended_at < ((d.week_start + 7)::timestamp AT TIME ZONE 'UTC')
    WHERE d.clan_b IS NOT NULL
      AND (v_user = ANY(d.roster_a) OR v_user = ANY(COALESCE(d.roster_b, '{}')));

    SELECT COALESCE(SUM(ct.amount), 0) INTO v_benefactor
    FROM clan_tithes ct
    WHERE ct.player_id = v_user;
  END IF;

  -- ---- Veterancy -------------------------------------------------------
  v_tenure := GREATEST(0, (NOW()::date - v_created::date));

  SELECT COALESCE(MAX(ps.longest_streak), 0) INTO v_unbroken
  FROM player_streaks ps
  WHERE ps.player_id = p_player_id;

  -- ---- Legacy ----------------------------------------------------------
  SELECT COUNT(DISTINCT gs.anomaly_week) INTO v_stormchaser
  FROM game_sessions gs
  WHERE gs.player_id = p_player_id
    AND gs.anomaly_id IS NOT NULL
    AND gs.anomaly_week IS NOT NULL
    AND gs.ended_at IS NOT NULL
    AND gs.validated IS TRUE
    AND gs.is_free_play IS NOT TRUE;

  -- Top-10 finishes on FINISHED weekly boards (get_anomaly_board's exact
  -- eligibility + ordering; the running week is not yet a finish).
  WITH board AS (
    SELECT gs.anomaly_week, gs.player_id, MAX(gs.score) AS best_score
    FROM game_sessions gs
    WHERE gs.anomaly_id IS NOT NULL
      AND gs.anomaly_week IS NOT NULL
      AND gs.anomaly_week < duel_week_start(NOW())
      AND gs.ended_at IS NOT NULL
      AND gs.validated IS TRUE
      AND gs.is_free_play IS NOT TRUE
    GROUP BY gs.anomaly_week, gs.player_id
  ),
  ranked AS (
    SELECT board.anomaly_week, board.player_id,
           ROW_NUMBER() OVER (
             PARTITION BY board.anomaly_week
             ORDER BY board.best_score DESC, board.player_id ASC
           ) AS rank
    FROM board
  )
  SELECT COUNT(*) INTO v_board_presence
  FROM ranked r
  WHERE r.player_id = p_player_id AND r.rank <= 10;

  SELECT COALESCE(SUM(pbp.current_level), 0),
         COUNT(*) FILTER (WHERE pbp.current_level >= bps.max_level)
  INTO v_chronicler, v_dynast
  FROM player_battle_pass pbp
  JOIN battle_pass_seasons bps ON bps.id = pbp.season_id
  WHERE pbp.player_id = p_player_id;

  -- Crowned: rostered member of the champion clan at settlement - the
  -- championship (semifinal-round) duel's locked roster is the record of
  -- who was on the wall; a bye championship (no duel) falls back to
  -- current membership.
  IF v_user IS NOT NULL THEN
    SELECT COUNT(*) INTO v_crowned
    FROM season_champions sc
    JOIN season_playoff_matches m
      ON m.season_id = sc.season_id
     AND m.round = 'semifinal'
     AND m.winner = sc.clan_id
    LEFT JOIN clan_duels d ON d.id = m.duel_id
    WHERE (
      (d.id IS NOT NULL AND v_user = ANY(
        CASE WHEN d.clan_a = sc.clan_id THEN d.roster_a ELSE COALESCE(d.roster_b, '{}') END
      ))
      OR
      (d.id IS NULL AND EXISTS (
        SELECT 1 FROM clan_members cm
        WHERE cm.clan_id = sc.clan_id AND cm.player_id = v_user
      ))
    );
  END IF;

  -- ---- Upsert all 21 records with their reached tiers ------------------
  WITH vals(record_id, value) AS (
    VALUES
      ('vault',             v_vault),
      ('high_water',        v_high_water),
      ('clean_getaways',    v_getaways),
      ('cold_blood',        v_cold_blood),
      ('primal_depth',      v_primal_xp),
      ('cyber_depth',       v_cyber_xp),
      ('cosmic_depth',      v_cosmic_xp),
      ('menagerie',          v_menagerie),
      ('bloodline',         v_bloodline),
      ('geneflow',          v_geneflow),
      ('on_the_wall',       v_on_the_wall),
      ('campaigner',        v_campaigner),
      ('benefactor',        v_benefactor),
      ('tenure',            v_tenure),
      ('unbroken',          v_unbroken),
      ('mileage',           v_mileage),
      ('stormchaser',       v_stormchaser),
      ('board_presence',    v_board_presence),
      ('chronicler',        v_chronicler),
      ('dynast_of_seasons', v_dynast),
      ('crowned',           v_crowned)
  )
  INSERT INTO player_records (player_id, record_id, value, tier, updated_at)
  SELECT
    p_player_id,
    rd.id,
    v.value,
    (SELECT COUNT(*) FROM unnest(rd.thresholds) th WHERE v.value >= th),
    NOW()
  FROM vals v
  JOIN record_definitions rd ON rd.id = v.record_id
  ON CONFLICT (player_id, record_id) DO UPDATE
    SET value = EXCLUDED.value,
        tier = EXCLUDED.tier,
        updated_at = NOW();

  -- ---- Grant every reached tier's badge (cumulative, idempotent) -------
  INSERT INTO player_cosmetics (player_id, cosmetic_id, source)
  SELECT p_player_id, 'record_' || pr.record_id || '_t' || t.tier, 'records'
  FROM player_records pr
  CROSS JOIN generate_series(1, 5) AS t(tier)
  WHERE pr.player_id = p_player_id
    AND t.tier <= pr.tier
    AND EXISTS (
      SELECT 1 FROM cosmetic_definitions cd
      WHERE cd.id = 'record_' || pr.record_id || '_t' || t.tier
    )
  ON CONFLICT (player_id, cosmetic_id) DO NOTHING;

  -- ---- Capstone titles: every record in the category at Diamond+ -------
  INSERT INTO player_cosmetics (player_id, cosmetic_id, source)
  SELECT p_player_id, cap.title_id, 'records'
  FROM (VALUES
    ('extraction', 'title_extractor_prime'),
    ('dynasty',    'title_apex_handler'),
    ('collection', 'title_grand_curator'),
    ('gauntlet',   'title_warmaster'),
    ('veterancy',  'title_old_guard'),
    ('legacy',     'title_perennial')
  ) AS cap(category, title_id)
  WHERE (
    SELECT MIN(pr.tier)
    FROM record_definitions rd
    JOIN player_records pr
      ON pr.record_id = rd.id AND pr.player_id = p_player_id
    WHERE rd.category = cap.category
  ) >= 4
  ON CONFLICT (player_id, cosmetic_id) DO NOTHING;

  -- ---- Legacy Score: sum of banked tier points (cumulative) ------------
  SELECT COALESCE(SUM(banked.points), 0)::INTEGER INTO v_legacy_score
  FROM player_records pr
  JOIN record_definitions rd ON rd.id = pr.record_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(p), 0) AS points
    FROM unnest(rd.tier_points[1:pr.tier]) AS p
  ) banked
  WHERE pr.player_id = p_player_id;

  UPDATE players SET legacy_score = v_legacy_score WHERE id = p_player_id;

  RETURN jsonb_build_object(
    'success', true,
    'legacy_score', v_legacy_score,
    'records', (
      SELECT jsonb_object_agg(pr.record_id, jsonb_build_object('value', pr.value, 'tier', pr.tier))
      FROM player_records pr WHERE pr.player_id = p_player_id
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Service-role only (section 6.3): recomputes state and grants inventory
-- - never callable by players directly.
REVOKE EXECUTE ON FUNCTION refresh_player_records(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION refresh_player_records(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION refresh_player_records(UUID) FROM authenticated;

-- ----------------------------------------------------------------------------
-- 10. settle_and_pair_duels - re-created FROM THE 021 BODY (current
--     owner; 022 did not re-declare it) with an IDENTICAL signature.
--     ONE addition: the clan_rating_history append after each duel
--     settles. Every other byte of the body is a carryover.
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
  END LOOP;

  -- ---- Season playoffs: fill winners, seed brackets, decide champions --
  PERFORM maintain_season_playoffs();

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

-- ----------------------------------------------------------------------------
-- 11. player_identity_view - re-declared with legacy_score APPENDED as
--     the last column (CREATE OR REPLACE VIEW appends only); every other
--     column is byte-identical to the 022 declaration. The full Player
--     Card and the leaderboard identity object read it from here.
--     get_player_identities is re-declared onto the new rowtype.
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
  ) AS mastery,
  p.legacy_score
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

GRANT EXECUTE ON FUNCTION get_player_identities(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_player_identities(UUID[]) TO anon;

-- ----------------------------------------------------------------------------
-- 12. BACKFILL: recompute every existing player's records once so
--     launch-window careers render immediately. Idempotent.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_id UUID;
BEGIN
  FOR v_id IN SELECT id FROM players LOOP
    PERFORM refresh_player_records(v_id);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 13. GRANTS (PostgREST parity; the API uses the service role)
-- ----------------------------------------------------------------------------

GRANT SELECT ON record_definitions TO authenticated;
GRANT SELECT ON record_definitions TO anon;
GRANT SELECT ON player_records TO authenticated;
GRANT SELECT ON clan_rating_history TO authenticated;
GRANT SELECT ON clan_rating_history TO anon;
