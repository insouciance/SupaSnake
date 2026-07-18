-- ============================================================================
-- Migration 021: Seasons + Weekly Anomaly boards (Design v2 Phase 4B,
-- GAME_DESIGN_V2.md sections 7.2, 7.3, 8.3, 8.4)
--
-- SEASONS (section 7.2): 6-8 week windows - 7 WEEKS FIXED FOR LAUNCH
--   (Monday-aligned; the doc's 6-8 range is a tuning band, 7 is the
--   launch pick). SEASONS ADD AND NEVER WIPE - this migration only ever
--   inserts; nothing a player earned is removed or reset, and no future
--   season migration may delete or truncate player-facing state.
--   Season 1 "Solstice" starts Monday 2026-07-20 00:00 UTC (the Monday on
--   or after this migration's creation date, 2026-07-18) and ends Monday
--   2026-09-07 00:00 UTC (exclusive). Season 2+ content (mutations,
--   cosmetic line, window rows) ships with its own migration - seasons
--   are authored content, never auto-rolled.
--
-- SEASON TRACK (section 7.2 "free track"): the EXISTING battle pass
--   structure carries it (003 tables; claim_contract from 015/017 already
--   grants contract XP to the active battle_pass season - seeding the
--   Season 1 row is what turns that faucet on, ~150 XP/contract per
--   section 7.3). Free milestones only (no premium requirement):
--   cosmetics + trait-reroll tokens (players.player_reroll_tokens, 018).
--   battle_pass_tiers.reward_type gains 'reroll_token'.
--
-- SEASONAL MUTATIONS (section 7.2): 2-3 per season, in the offer pool all
--   season, then they JOIN THE PERMANENT POOL - implemented as "available
--   from season start, forever" (a season's start is its mutations' core
--   release date; PoE league-into-core). Season 1 ships Solstice Engine /
--   Glacial Reserve / Midnight Oil (definitions in
--   src/shared/game/mutations.ts - keep season_mutations in lockstep).
--
-- WEEKLY ANOMALY BOARD (section 7.2): one rotating modifier ruleset per
--   ISO week (Mon 00:00 UTC) with its own leaderboard, NORMAL DNA rules.
--   Launch pool (x4, rotation order): meteor_shower, gold_rush, blackout,
--   twin_exits. Rotation = weeks since Monday 2024-01-01 UTC, mod 4 -
--   mirrored by anomalyForWeek in src/shared/game/anomalies.ts
--   (lockstep). Anomaly runs are earning runs (energy + DNA + contracts +
--   streak) that additionally write to the week's board via
--   game_sessions.anomaly_id/anomaly_week; they are EXCLUDED from clan
--   duel/gauntlet counted scoring unless the clan picked the Anomaly
--   Doctrine research modifier (section 8.3 node protocols_1, x1.20 -
--   the ANOMALY_NOT_LIVE gate from 020 is retired here).
--
-- CONTRACTS (section 7.3): "Anomaly Tourist" (seeded inactive in 015)
--   activates; refresh_contract_progress is re-created FROM THE 017 BODY
--   (the current owner: #variable_conflict use_column + the is_free_play
--   exclusions from 016) with the anomaly_run case added.
--
-- SEASON PLAYOFFS (section 8.4): final 2 weeks, top 8 clans by rating,
--   single elimination on the weekly Gauntlet protocol. FORMAT RESOLUTION
--   (doc ambiguity - 8 clans need 3 rounds, the doc gives 2 weeks):
--   season week 6 = quarterfinals (1v8, 2v7, 3v6, 4v5); season week 7 =
--   CHAMPIONSHIP WEEK - both semifinals run the weekly protocol and the
--   champion is the semifinal winner with the higher counted score that
--   week (seed breaks ties). Champion gets cosmetics + banner history
--   (season_champions), NEVER economy rewards. Mirrored in
--   src/shared/game/season.ts (lockstep).
--
-- RIVALRY WINDOW: the Gauntlet's 8-week revenge-priority proxy (020)
--   is replaced by real season windows via rivalry_window_start (falls
--   back to the 8-week proxy only when no season covers the week).
--
-- economy_transactions: NO new source_type - season tier grants use the
--   pre-existing 'battle_pass_reward' source for dna/energy tiers, and
--   reroll tokens / cosmetics are not ledger resources. The CHECK from
--   020 (13 values + clan_tithe) is left untouched.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SEASONS (section 7.2) - windows are DATE (Monday, UTC) for the game
--    layer; the linked battle_pass_seasons row carries the XP track.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq INTEGER NOT NULL UNIQUE CHECK (seq >= 1),
  name TEXT NOT NULL,
  theme TEXT NOT NULL,
  starts_on DATE NOT NULL,                  -- Monday 00:00 UTC, inclusive
  ends_on DATE NOT NULL,                    -- Monday 00:00 UTC, exclusive
  battle_pass_season_id UUID REFERENCES battle_pass_seasons(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT seasons_window_valid CHECK (ends_on > starts_on),
  -- Doc band: 6-8 whole weeks (launch seasons use 7 = 49 days)
  CONSTRAINT seasons_window_band CHECK (
    (ends_on - starts_on) BETWEEN 42 AND 56 AND (ends_on - starts_on) % 7 = 0
  )
);

-- Battle pass tier rewards gain the trait-reroll token (018 tokens)
ALTER TABLE battle_pass_tiers DROP CONSTRAINT IF EXISTS battle_pass_tiers_reward_type_check;
ALTER TABLE battle_pass_tiers ADD CONSTRAINT battle_pass_tiers_reward_type_check
  CHECK (reward_type IN ('dna', 'energy', 'variant', 'cosmetic', 'title', 'reroll_token'));

-- Season 1 "Solstice": XP track sized for the free contract faucet -
-- ~150 XP/contract (section 7.3), 2 picks/day => 300 XP/day; 400 XP/level
-- x 30 levels = 12,000 XP ~= 40 committed days of a 49-day season.
INSERT INTO battle_pass_seasons
  (season_number, name, theme, starts_at, ends_at, max_level, xp_per_level, is_active)
VALUES
  (1, 'Season 1 — Solstice', 'solstice',
   TIMESTAMPTZ '2026-07-20 00:00:00+00', TIMESTAMPTZ '2026-09-07 00:00:00+00',
   30, 400, true)
ON CONFLICT (season_number) DO NOTHING;

INSERT INTO seasons (seq, name, theme, starts_on, ends_on, battle_pass_season_id)
SELECT 1, 'Season 1 — Solstice', 'solstice', DATE '2026-07-20', DATE '2026-09-07', bps.id
FROM battle_pass_seasons bps
WHERE bps.season_number = 1
ON CONFLICT (seq) DO NOTHING;

-- Free milestone tiers (section 7.2: cosmetics + trait reroll tokens; the
-- L30 capstone is a title). No premium tiers - the track is free.
INSERT INTO battle_pass_tiers (season_id, level, is_premium, reward_type, reward_id, reward_amount)
SELECT bps.id, t.level, false, t.reward_type, t.reward_id, t.reward_amount
FROM battle_pass_seasons bps,
  (VALUES
    (1,  'cosmetic',     'solstice_trail_1',      NULL::integer),
    (3,  'cosmetic',     'solstice_badge',        NULL),
    (5,  'reroll_token', NULL,                    1),
    (8,  'cosmetic',     'solstice_board_accent', NULL),
    (10, 'reroll_token', NULL,                    1),
    (12, 'cosmetic',     'solstice_trail_2',      NULL),
    (15, 'reroll_token', NULL,                    1),
    (18, 'cosmetic',     'solstice_emblem',       NULL),
    (20, 'reroll_token', NULL,                    1),
    (22, 'cosmetic',     'solstice_trail_3',      NULL),
    (25, 'reroll_token', NULL,                    1),
    (28, 'cosmetic',     'solstice_banner',       NULL),
    (30, 'title',        'solstice_sovereign',    NULL)
  ) AS t(level, reward_type, reward_id, reward_amount)
WHERE bps.season_number = 1
ON CONFLICT (season_id, level, is_premium) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. SEASONAL MUTATIONS (section 7.2) - offer-pool availability catalog.
--    Available from the season's start FOREVER (they join the permanent
--    pool at season end by simply staying available).
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS season_mutations (
  mutation_id TEXT PRIMARY KEY,
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);

INSERT INTO season_mutations (mutation_id, season_id, name)
SELECT t.mutation_id, s.id, t.name
FROM seasons s,
  (VALUES
    ('solstice_engine', 'Solstice Engine'),
    ('glacial_reserve', 'Glacial Reserve'),
    ('midnight_oil',    'Midnight Oil')
  ) AS t(mutation_id, name)
WHERE s.seq = 1
ON CONFLICT (mutation_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. GAME SESSIONS: anomaly markers (server-stamped at session start; the
--    client never asserts them). NULL = not an anomaly run.
-- ----------------------------------------------------------------------------

ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS anomaly_id TEXT CHECK (anomaly_id IN (
    'meteor_shower', 'gold_rush', 'blackout', 'twin_exits'
  )),
  ADD COLUMN IF NOT EXISTS anomaly_week DATE;

COMMENT ON COLUMN game_sessions.anomaly_id IS
  'Weekly anomaly modifier for this run (Design v2 §7.2), server-derived at start. NULL = normal run.';
COMMENT ON COLUMN game_sessions.anomaly_week IS
  'Monday (UTC) of the anomaly week the run scores into. NULL = normal run.';

CREATE INDEX IF NOT EXISTS idx_game_sessions_anomaly_board
  ON game_sessions (anomaly_week, score DESC)
  WHERE anomaly_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. ANOMALY ROTATION - SQL mirror of anomalyForWeek (anomalies.ts):
--    weeks since Monday 2024-01-01 UTC, mod 4, over the launch pool.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION anomaly_for_week(p_week DATE)
RETURNS TEXT AS $$
  SELECT (ARRAY['meteor_shower', 'gold_rush', 'blackout', 'twin_exits'])[
    1 + mod(mod((p_week - DATE '2024-01-01') / 7, 4) + 4, 4)
  ];
$$ LANGUAGE sql IMMUTABLE;

-- ----------------------------------------------------------------------------
-- 5. ANOMALY BOARD READ MODEL - this week's rotation, top 10 by best
--    score (one row per player), and the caller's best/rank/run count.
--    Only validated, completed, non-free anomaly runs of the week count.
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
         'name', COALESCE(pl.username, 'Anonymous'),
         'score', r.best_score
       ) ORDER BY r.rank)
       FROM ranked r
       LEFT JOIN players pl ON pl.id = r.player_id
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
-- 6. CONTRACTS: activate "Anomaly Tourist" + re-create
--    refresh_contract_progress from the 017 body (its current owner:
--    #variable_conflict use_column + the is_free_play filters) with the
--    anomaly_run case. Anomaly runs are earning runs, so they also count
--    toward the generic contracts (Banker/Collector/...) exactly like any
--    other non-free session.
-- ----------------------------------------------------------------------------

UPDATE contract_definitions SET active = true WHERE id = 'anomaly_tourist';

CREATE OR REPLACE FUNCTION refresh_contract_progress(p_player_id UUID, p_date DATE)
RETURNS VOID AS $$
#variable_conflict use_column
DECLARE
  v_row RECORD;
  v_current INTEGER;
  v_target INTEGER;
  v_dynasty TEXT;
  v_day_start TIMESTAMPTZ := (p_date::timestamp AT TIME ZONE 'UTC');
  v_day_end TIMESTAMPTZ := ((p_date + 1)::timestamp AT TIME ZONE 'UTC');
BEGIN
  FOR v_row IN
    SELECT pc.id AS pc_id, cd.contract_type, cd.params
    FROM player_contracts pc
    JOIN contract_definitions cd ON cd.id = pc.contract_id
    WHERE pc.player_id = p_player_id
      AND pc.contract_date = p_date
      AND pc.picked
      AND pc.claimed_at IS NULL
  LOOP
    v_dynasty := v_row.params->>'dynasty';
    v_current := 0;
    v_target := 1;

    CASE v_row.contract_type
      WHEN 'extract_n' THEN
        -- Banker: banked extractions today
        v_target := COALESCE((v_row.params->>'count')::int, 1);
        SELECT COUNT(*)::int INTO v_current
        FROM game_sessions gs
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND gs.extracted;

      WHEN 'food_n_single_run' THEN
        -- Deep Run: best single-run food count (optionally dynasty-scoped)
        v_target := COALESCE((v_row.params->>'foods')::int, 1);
        SELECT COALESCE(MAX(gs.foods_collected), 0)::int INTO v_current
        FROM game_sessions gs
        LEFT JOIN snake_variants sv ON sv.id = gs.snake_variant_id
        LEFT JOIN dynasties d ON d.id = sv.dynasty_id
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND (v_dynasty IS NULL OR d.name = v_dynasty);

      WHEN 'extract_tier' THEN
        -- Redline: best BANKED food count in the dynasty; tier is a pure
        -- function of foods (floor(n/5) capped 4), so min_foods proves it.
        v_target := COALESCE((v_row.params->>'min_foods')::int, 1);
        SELECT COALESCE(MAX(gs.foods_collected), 0)::int INTO v_current
        FROM game_sessions gs
        LEFT JOIN snake_variants sv ON sv.id = gs.snake_variant_id
        LEFT JOIN dynasties d ON d.id = sv.dynasty_id
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND gs.extracted
          AND (v_dynasty IS NULL OR d.name = v_dynasty);

      WHEN 'food_total' THEN
        -- Collector: total foods across today's runs
        v_target := COALESCE((v_row.params->>'foods')::int, 1);
        SELECT COALESCE(SUM(gs.foods_collected), 0)::int INTO v_current
        FROM game_sessions gs
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end;

      WHEN 'extract_fast' THEN
        -- Sprinter: any bank within max_seconds of run start
        v_target := 1;
        SELECT COUNT(*)::int INTO v_current
        FROM game_sessions gs
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND gs.extracted
          AND gs.duration_seconds <= COALESCE((v_row.params->>'max_seconds')::int, 240);

      WHEN 'extract_nth_portal' THEN
        -- Nerve: conservative proof via worst-case portal cadence (see 015)
        v_target := 1;
        SELECT COUNT(*)::int INTO v_current
        FROM game_sessions gs
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND gs.extracted
          AND gs.foods_collected >= COALESCE((v_row.params->>'min_foods_proof')::int, 63);

      WHEN 'anomaly_run' THEN
        -- Anomaly Tourist (section 7.3): complete N anomaly-board runs
        -- today - banked OR crashed both count ("complete 1 anomaly run"),
        -- Free Play never does (it cannot start an anomaly session).
        v_target := COALESCE((v_row.params->>'count')::int, 1);
        SELECT COUNT(*)::int INTO v_current
        FROM game_sessions gs
        WHERE gs.player_id = p_player_id
          AND gs.ended_at IS NOT NULL AND gs.validated IS TRUE
          AND gs.is_free_play IS NOT TRUE
          AND gs.started_at >= v_day_start AND gs.started_at < v_day_end
          AND gs.anomaly_id IS NOT NULL;

      ELSE
        -- combo_x / mutations_held / extract_pure / clan_contribute /
        -- gauntlet_runs: facts not wired yet. These definitions remain
        -- inactive and are never offered; progress stays 0 defensively
        -- if one is ever force-picked.
        v_current := 0;
        v_target := 1;
    END CASE;

    UPDATE player_contracts pc SET
      progress = jsonb_build_object(
        'current', LEAST(v_current, v_target),
        'target', v_target
      ),
      completed_at = CASE
        WHEN v_current >= v_target AND pc.completed_at IS NULL THEN NOW()
        ELSE pc.completed_at
      END
    WHERE pc.id = v_row.pc_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 7. SEASON TRACK CLAIM (section 7.2): claim a reached free milestone.
--    Reroll tokens land on players.player_reroll_tokens (018); cosmetics
--    and titles are owned via the claim row itself; dna/energy tiers (not
--    seeded for Season 1, supported for future seasons) grant through the
--    pre-existing 'battle_pass_reward' economy source.
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
  -- cosmetic / title / variant: the claim row below is the ownership record

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
-- 8. SEASON PLAYOFFS (section 8.4) - bracket + banner history
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS season_playoff_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  round TEXT NOT NULL CHECK (round IN ('quarterfinal', 'semifinal')),
  slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 4),
  week_start DATE NOT NULL,
  clan_a UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  clan_b UUID REFERENCES clans(id) ON DELETE CASCADE,   -- NULL = bye
  seed_a INTEGER NOT NULL,
  seed_b INTEGER,
  duel_id UUID REFERENCES clan_duels(id),
  winner UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (season_id, round, slot)
);

CREATE INDEX IF NOT EXISTS idx_playoff_matches_week ON season_playoff_matches(week_start);

-- Banner history: champions persist forever (name snapshotted so the
-- banner survives clan deletion). Cosmetics only - never economy.
CREATE TABLE IF NOT EXISTS season_champions (
  season_id UUID PRIMARY KEY REFERENCES seasons(id) ON DELETE CASCADE,
  clan_id UUID,
  clan_name TEXT NOT NULL,
  clan_tag TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 9. RIVALRY WINDOW (section 8.4): real season windows replace the 020
--    8-week proxy; the proxy remains the fallback when no season covers
--    the week (should not happen post-seed, but never break pairing).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rivalry_window_start(p_week DATE)
RETURNS DATE AS $$
  SELECT COALESCE(
    (SELECT starts_on FROM seasons
     WHERE starts_on <= p_week AND ends_on > p_week
     ORDER BY seq DESC LIMIT 1),
    p_week - 56
  );
$$ LANGUAGE sql STABLE;

-- ----------------------------------------------------------------------------
-- 10. PLAYOFF MAINTENANCE (lazy, called inside settle_and_pair_duels
--     under its advisory lock): seed the QF bracket in season week 6,
--     fill winners from settled duels, build the semifinals in week 7,
--     and decide the champion from the championship-week scoreboard.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION maintain_season_playoffs()
RETURNS VOID AS $$
DECLARE
  v_week DATE := duel_week_start(NOW());
  v_season RECORD;
  v_qf_week DATE;
  v_sf_week DATE;
  v_match RECORD;
  v_winner UUID;
  v_w1_clan UUID;
  v_w1_seed INTEGER;
  v_w2_clan UUID;
  v_w2_seed INTEGER;
  v_champ RECORD;
BEGIN
  -- (a) Fill winners for playoff matches whose duel has settled. Tie ->
  --     the better (lower) seed advances.
  FOR v_match IN
    SELECT m.id, m.clan_a, m.clan_b, m.seed_a, m.seed_b, d.winner AS duel_winner
    FROM season_playoff_matches m
    JOIN clan_duels d ON d.id = m.duel_id
    WHERE m.winner IS NULL AND d.status = 'settled'
  LOOP
    v_winner := COALESCE(
      v_match.duel_winner,
      CASE WHEN COALESCE(v_match.seed_b, 999) >= v_match.seed_a
           THEN v_match.clan_a ELSE v_match.clan_b END
    );
    UPDATE season_playoff_matches SET winner = v_winner WHERE id = v_match.id;
  END LOOP;

  -- (b) Season containing the current week (if any)
  SELECT * INTO v_season FROM seasons
  WHERE starts_on <= v_week AND ends_on > v_week
  ORDER BY seq DESC LIMIT 1;

  IF FOUND THEN
    v_qf_week := v_season.ends_on - 14;      -- season week 6
    v_sf_week := v_season.ends_on - 7;       -- season week 7 (championship)

    -- Seed the quarterfinals once, at the QF week: top 8 by rating
    -- (1v8, 2v7, 3v6, 4v5; short fields give the TOP seeds byes)
    IF v_week >= v_qf_week AND v_week < v_sf_week
       AND NOT EXISTS (
         SELECT 1 FROM season_playoff_matches
         WHERE season_id = v_season.id AND round = 'quarterfinal'
       ) THEN
      WITH seeds AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY rating DESC, created_at ASC, id ASC) AS seed
        FROM clans
        WHERE member_count >= 1
        ORDER BY rating DESC, created_at ASC, id ASC
        LIMIT 8
      )
      INSERT INTO season_playoff_matches
        (season_id, round, slot, week_start, clan_a, clan_b, seed_a, seed_b, winner)
      SELECT
        v_season.id, 'quarterfinal', s.slot, v_qf_week,
        a.id, b.id, s.slot, CASE WHEN b.id IS NULL THEN NULL ELSE 9 - s.slot END,
        CASE WHEN b.id IS NULL THEN a.id END  -- bye: top seed advances now
      FROM (VALUES (1), (2), (3), (4)) AS s(slot)
      JOIN seeds a ON a.seed = s.slot
      LEFT JOIN seeds b ON b.seed = 9 - s.slot
      WHERE (SELECT COUNT(*) FROM seeds) >= 2;
    END IF;

    -- Build the semifinals once, in the championship week, from QF
    -- winners: SF1 = W(QF1) v W(QF4), SF2 = W(QF2) v W(QF3). A missing
    -- QF winner (short field) makes the present one a bye.
    IF v_week >= v_sf_week AND v_week < v_season.ends_on
       AND EXISTS (
         SELECT 1 FROM season_playoff_matches
         WHERE season_id = v_season.id AND round = 'quarterfinal'
       )
       AND NOT EXISTS (
         SELECT 1 FROM season_playoff_matches
         WHERE season_id = v_season.id AND round = 'semifinal'
       )
       AND NOT EXISTS (
         SELECT 1 FROM season_playoff_matches
         WHERE season_id = v_season.id AND round = 'quarterfinal' AND winner IS NULL
       ) THEN
      FOR v_match IN
        SELECT * FROM (VALUES (1, 1, 4), (2, 2, 3)) AS sf(slot, qf_hi, qf_lo)
      LOOP
        v_w1_clan := NULL; v_w1_seed := NULL;
        v_w2_clan := NULL; v_w2_seed := NULL;

        SELECT m.winner,
               CASE WHEN m.winner = m.clan_a THEN m.seed_a ELSE m.seed_b END
        INTO v_w1_clan, v_w1_seed
        FROM season_playoff_matches m
        WHERE m.season_id = v_season.id AND m.round = 'quarterfinal'
          AND m.slot = v_match.qf_hi;

        SELECT m.winner,
               CASE WHEN m.winner = m.clan_a THEN m.seed_a ELSE m.seed_b END
        INTO v_w2_clan, v_w2_seed
        FROM season_playoff_matches m
        WHERE m.season_id = v_season.id AND m.round = 'quarterfinal'
          AND m.slot = v_match.qf_lo;

        IF v_w1_clan IS NULL AND v_w2_clan IS NULL THEN
          CONTINUE;
        END IF;

        -- clan_a = the better (lower) seed of the pair
        IF v_w2_clan IS NULL OR (v_w1_clan IS NOT NULL AND v_w1_seed <= COALESCE(v_w2_seed, 999)) THEN
          INSERT INTO season_playoff_matches
            (season_id, round, slot, week_start, clan_a, clan_b, seed_a, seed_b, winner)
          VALUES
            (v_season.id, 'semifinal', v_match.slot, v_sf_week,
             v_w1_clan, v_w2_clan, v_w1_seed, v_w2_seed,
             CASE WHEN v_w2_clan IS NULL THEN v_w1_clan END);
        ELSE
          INSERT INTO season_playoff_matches
            (season_id, round, slot, week_start, clan_a, clan_b, seed_a, seed_b, winner)
          VALUES
            (v_season.id, 'semifinal', v_match.slot, v_sf_week,
             v_w2_clan, v_w1_clan, v_w2_seed, v_w1_seed,
             CASE WHEN v_w1_clan IS NULL THEN v_w2_clan END);
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- (c) Champion (any season with settled semifinals and no banner yet):
  --     the SF winner with the higher championship-week counted score;
  --     equal scores fall to the better seed. Cosmetic banner only.
  FOR v_champ IN
    SELECT s.id AS season_id
    FROM seasons s
    WHERE NOT EXISTS (SELECT 1 FROM season_champions c WHERE c.season_id = s.id)
      AND EXISTS (
        SELECT 1 FROM season_playoff_matches m
        WHERE m.season_id = s.id AND m.round = 'semifinal'
      )
      AND NOT EXISTS (
        SELECT 1 FROM season_playoff_matches m
        WHERE m.season_id = s.id AND m.round = 'semifinal' AND m.winner IS NULL
      )
  LOOP
    WITH sf AS (
      SELECT
        m.winner,
        CASE WHEN m.winner = m.clan_a THEN m.seed_a ELSE m.seed_b END AS seed,
        CASE
          WHEN d.id IS NULL THEN 0                       -- bye semifinal
          WHEN m.winner = d.clan_a THEN COALESCE(d.score_a, 0)
          ELSE COALESCE(d.score_b, 0)
        END AS week_score
      FROM season_playoff_matches m
      LEFT JOIN clan_duels d ON d.id = m.duel_id AND d.status = 'settled'
      WHERE m.season_id = v_champ.season_id AND m.round = 'semifinal'
    )
    INSERT INTO season_champions (season_id, clan_id, clan_name, clan_tag)
    SELECT v_champ.season_id, sf.winner, c.name, c.tag
    FROM sf
    JOIN clans c ON c.id = sf.winner
    ORDER BY sf.week_score DESC, sf.seed ASC
    LIMIT 1
    ON CONFLICT (season_id) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 11. DUEL SCORING: anomaly-board runs leave the counted pool (they score
--     on their own board) UNLESS the side picked Anomaly Doctrine.
--     Re-creates the 011 v1 scorers (anomaly exclusion) and the 020
--     rules-aware scorers (include_anomaly lens).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION clan_week_scores(p_week_start DATE)
RETURNS TABLE (clan_id UUID, score BIGINT) AS $$
  WITH member_runs AS (
    SELECT
      cm.clan_id,
      cm.player_id AS member_user_id,
      gs.dna_earned,
      ROW_NUMBER() OVER (
        PARTITION BY cm.clan_id, cm.player_id
        ORDER BY gs.dna_earned DESC, gs.ended_at ASC
      ) AS run_rank
    FROM clan_members cm
    JOIN players p ON p.user_id = cm.player_id
    JOIN game_sessions gs ON gs.player_id = p.id
    WHERE gs.ended_at IS NOT NULL
      AND gs.dna_earned > 0
      AND gs.anomaly_id IS NULL              -- anomaly runs: own board only
      AND gs.ended_at >= (p_week_start::timestamp AT TIME ZONE 'UTC')
      AND gs.ended_at <  ((p_week_start + 7)::timestamp AT TIME ZONE 'UTC')
  ),
  member_totals AS (
    SELECT clan_id, member_user_id, SUM(dna_earned) AS member_dna
    FROM member_runs
    WHERE run_rank <= 30                      -- best 30 runs per member
    GROUP BY clan_id, member_user_id
  ),
  ranked_members AS (
    SELECT
      clan_id,
      member_dna,
      ROW_NUMBER() OVER (
        PARTITION BY clan_id
        ORDER BY member_dna DESC
      ) AS member_rank
    FROM member_totals
  )
  SELECT clan_id, COALESCE(SUM(member_dna), 0)::BIGINT AS score
  FROM ranked_members
  WHERE member_rank <= 10                     -- top 10 contributors per clan
  GROUP BY clan_id;
$$ LANGUAGE sql STABLE;

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
    COALESCE(pl.username, 'Anonymous') AS player_name,
    mt.member_dna::BIGINT AS counted_dna
  FROM member_totals mt
  LEFT JOIN players pl ON pl.user_id = mt.member_user_id
  ORDER BY mt.member_dna DESC
  LIMIT 10;
$$ LANGUAGE sql STABLE;

-- Effective side rules gain include_anomaly (Anomaly Doctrine: anomaly
-- runs count, x1.20). Same signature as 020 - resolve_gauntlet keeps
-- calling it unchanged.
CREATE OR REPLACE FUNCTION gauntlet_build_side(
  p_clan_id UUID,
  p_dynasty TEXT,
  p_dynasty_2 TEXT,
  p_modifier TEXT,
  p_banned_against TEXT
) RETURNS JSONB AS $$
DECLARE
  v_top INTEGER := 10;
  v_best INTEGER := 30;
  v_weight NUMERIC := 1.0;
  v_extracted BOOLEAN := false;
  v_include_anomaly BOOLEAN := false;
  v_plus_one BOOLEAN := clan_has_research(p_clan_id, 'logistics_4');
BEGIN
  IF p_modifier = 'vanguard' THEN
    v_top := 8; v_weight := 1.10;
  ELSIF p_modifier = 'deep_bench' THEN
    v_top := 12; v_best := 25;
  ELSIF p_modifier = 'extraction_doctrine' THEN
    v_extracted := true; v_weight := 1.15;
  ELSIF p_modifier = 'anomaly_doctrine' THEN
    v_include_anomaly := true; v_weight := 1.20;
  ELSIF p_modifier = 'sudden_death' THEN
    v_best := 10; v_weight := 1.40;
  END IF;

  -- +1 counted run applies to the 30-run base only (doc: "30 -> 31")
  IF v_plus_one AND v_best = 30 THEN
    v_best := 31;
  END IF;

  RETURN jsonb_build_object(
    'dynasty', p_dynasty,
    'dynasty2', p_dynasty_2,
    'modifier', p_modifier,
    'top_members', v_top,
    'best_runs', v_best,
    'weight', v_weight,
    'extracted_only', v_extracted,
    'include_anomaly', v_include_anomaly,
    'banned', p_banned_against
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION gauntlet_side_score(
  p_week_start DATE,
  p_clan_id UUID,
  p_side JSONB,
  p_roster UUID[]
) RETURNS BIGINT AS $$
DECLARE
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ := ((p_week_start + 7)::timestamp AT TIME ZONE 'UTC');
  v_dyn TEXT;
  v_dyn2 TEXT;
  v_top INTEGER := 10;
  v_best INTEGER := 30;
  v_weight NUMERIC := 1.0;
  v_extracted BOOLEAN := false;
  v_incl_anomaly BOOLEAN := false;
  v_score BIGINT;
BEGIN
  IF p_side IS NULL THEN
    v_from := (p_week_start::timestamp AT TIME ZONE 'UTC');
  ELSE
    -- Scored window: Thu 00:00 - Sun 24:00 (counted runs only inside it)
    v_from := ((p_week_start + 3)::timestamp AT TIME ZONE 'UTC');
    v_dyn := p_side->>'dynasty';
    v_dyn2 := p_side->>'dynasty2';
    v_top := COALESCE((p_side->>'top_members')::integer, 10);
    v_best := COALESCE((p_side->>'best_runs')::integer, 30);
    v_weight := COALESCE((p_side->>'weight')::numeric, 1.0);
    v_extracted := COALESCE((p_side->>'extracted_only')::boolean, false);
    v_incl_anomaly := COALESCE((p_side->>'include_anomaly')::boolean, false);
  END IF;

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
  ),
  ranked_members AS (
    SELECT member_dna,
           ROW_NUMBER() OVER (ORDER BY member_dna DESC) AS member_rank
    FROM member_totals
  )
  SELECT COALESCE(FLOOR(SUM(member_dna) * v_weight), 0)::BIGINT
  INTO v_score
  FROM ranked_members
  WHERE member_rank <= v_top;

  RETURN COALESCE(v_score, 0);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

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
    COALESCE(pl.username, 'Anonymous') AS player_name,
    mt.member_dna::BIGINT AS counted_dna
  FROM member_totals mt
  LEFT JOIN players pl ON pl.user_id = mt.member_user_id
  ORDER BY mt.member_dna DESC
  LIMIT v_top;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 12. SUBMIT PICKS (same signature as 020): Anomaly Doctrine is now
--     PICKABLE - the board is live - gated on protocols_1 like any
--     research option (ANOMALY_NOT_LIVE retired). The mutation-ban
--     catalog gains the seasonal mutations.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION submit_gauntlet_picks(
  p_user_id UUID,
  p_dynasty TEXT,
  p_modifier TEXT DEFAULT NULL,
  p_ban TEXT DEFAULT NULL,
  p_dynasty_2 TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_member RECORD;
  v_week DATE := duel_week_start(NOW());
  v_duel RECORD;
  v_deadline TIMESTAMPTZ;
BEGIN
  SELECT clan_id, role INTO v_member
  FROM clan_members WHERE player_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_IN_CLAN';
  END IF;
  IF v_member.role NOT IN ('owner', 'officer') THEN
    RAISE EXCEPTION 'NOT_AN_OFFICER';
  END IF;

  SELECT * INTO v_duel FROM clan_duels
  WHERE week_start = v_week
    AND (clan_a = v_member.clan_id OR clan_b = v_member.clan_id)
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_DUEL_THIS_WEEK';
  END IF;
  IF v_duel.clan_b IS NULL THEN
    RAISE EXCEPTION 'BYE_WEEK';
  END IF;

  -- Blind lock deadline: Wed 00:00 UTC (week_start + 2 days)
  v_deadline := ((v_duel.week_start + 2)::timestamp AT TIME ZONE 'UTC');
  IF NOW() >= v_deadline THEN
    RAISE EXCEPTION 'PICKS_CLOSED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM gauntlet_picks
    WHERE duel_id = v_duel.id AND clan_id = v_member.clan_id
  ) THEN
    RAISE EXCEPTION 'ALREADY_LOCKED';
  END IF;

  -- Dynasty pick (mandatory; counted runs must be in it)
  IF p_dynasty IS NULL OR p_dynasty NOT IN ('PRIMAL', 'CYBER', 'COSMIC') THEN
    RAISE EXCEPTION 'INVALID_DYNASTY';
  END IF;

  -- Dynasty split pick needs protocols_4
  IF p_dynasty_2 IS NOT NULL THEN
    IF p_dynasty_2 NOT IN ('PRIMAL', 'CYBER', 'COSMIC') OR p_dynasty_2 = p_dynasty THEN
      RAISE EXCEPTION 'INVALID_DYNASTY_SPLIT';
    END IF;
    IF NOT clan_has_research(v_member.clan_id, 'protocols_4') THEN
      RAISE EXCEPTION 'SPLIT_PICK_LOCKED';
    END IF;
  END IF;

  -- Modifier: base three always available; research options gated.
  -- Anomaly Doctrine is live (Phase 4B) - it gates on protocols_1.
  IF p_modifier IS NOT NULL THEN
    IF p_modifier NOT IN ('vanguard', 'deep_bench', 'extraction_doctrine',
                          'anomaly_doctrine', 'sudden_death') THEN
      RAISE EXCEPTION 'INVALID_MODIFIER';
    END IF;
    IF p_modifier = 'anomaly_doctrine'
       AND NOT clan_has_research(v_member.clan_id, 'protocols_1') THEN
      RAISE EXCEPTION 'MODIFIER_LOCKED:protocols_1';
    END IF;
    IF p_modifier = 'sudden_death'
       AND NOT clan_has_research(v_member.clan_id, 'protocols_2') THEN
      RAISE EXCEPTION 'MODIFIER_LOCKED:protocols_2';
    END IF;
  END IF;

  -- Mutation ban: base ten + mastery mutations + seasonal mutations
  IF p_ban IS NOT NULL THEN
    IF p_ban NOT IN ('gold_trail', 'overgrowth', 'wall_rush', 'shed',
                     'mirror_wager', 'magnet_pulse', 'time_dilation',
                     'splitter', 'phoenix', 'compound_interest')
       AND NOT EXISTS (SELECT 1 FROM mastery_mutations WHERE mutation_id = p_ban)
       AND NOT EXISTS (SELECT 1 FROM season_mutations WHERE mutation_id = p_ban) THEN
      RAISE EXCEPTION 'INVALID_BAN';
    END IF;
  END IF;

  INSERT INTO gauntlet_picks
    (duel_id, clan_id, dynasty_pick, dynasty_pick_2, modifier_pick, mutation_ban, submitted_by)
  VALUES
    (v_duel.id, v_member.clan_id, p_dynasty, p_dynasty_2, p_modifier, p_ban, p_user_id);

  RETURN jsonb_build_object(
    'locked', true,
    'dynasty', p_dynasty,
    'dynasty_2', p_dynasty_2,
    'modifier', p_modifier,
    'ban', p_ban,
    'reveal_at', v_deadline
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 13. SETTLEMENT + PAIRING (replaces the 020 body; same signature).
--     Changes vs 020:
--     (a) maintain_season_playoffs() runs after settlement (winners fill,
--         bracket/semifinal creation, champion decision);
--     (b) playoff matches of the current week are paired FIRST - bracket
--         beats rating adjacency for the qualified clans;
--     (c) revenge priority uses the real season window
--         (rivalry_window_start) instead of the 8-week proxy.
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
-- 14. SEASON READ MODEL - one RPC for /api/season: the live season +
--     week index + playoff phase, the caller's free track (tiers, XP,
--     claims, reroll tokens), the current bracket, and the banner history.
--     Lazily maintains duels/playoffs first (idempotent, advisory-locked).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_season(p_player_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_week DATE := duel_week_start(NOW());
  v_season RECORD;
  v_bps battle_pass_seasons%ROWTYPE;
  v_pbp player_battle_pass%ROWTYPE;
  v_season_json JSONB := NULL;
  v_track JSONB := NULL;
  v_playoffs JSONB := NULL;
  v_champions JSONB;
  v_week_index INTEGER;
  v_phase TEXT := 'none';
BEGIN
  PERFORM settle_and_pair_duels();

  SELECT * INTO v_season FROM seasons
  WHERE starts_on <= v_week AND ends_on > v_week
  ORDER BY seq DESC LIMIT 1;

  IF FOUND THEN
    v_week_index := 1 + (v_week - v_season.starts_on) / 7;
    IF v_week >= v_season.ends_on - 7 THEN
      v_phase := 'championship';
    ELSIF v_week >= v_season.ends_on - 14 THEN
      v_phase := 'quarterfinal';
    END IF;

    v_season_json := jsonb_build_object(
      'seq', v_season.seq,
      'name', v_season.name,
      'theme', v_season.theme,
      'starts_at', (v_season.starts_on::timestamp AT TIME ZONE 'UTC'),
      'ends_at', (v_season.ends_on::timestamp AT TIME ZONE 'UTC'),
      'week', v_week_index,
      'weeks', (v_season.ends_on - v_season.starts_on) / 7,
      'playoff_phase', v_phase,
      'mutations', COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('id', sm.mutation_id, 'name', sm.name))
         FROM season_mutations sm WHERE sm.season_id = v_season.id),
        '[]'::jsonb
      )
    );

    -- Free track (linked battle pass season)
    IF v_season.battle_pass_season_id IS NOT NULL THEN
      SELECT * INTO v_bps FROM battle_pass_seasons WHERE id = v_season.battle_pass_season_id;
      IF FOUND THEN
        SELECT * INTO v_pbp FROM player_battle_pass
        WHERE player_id = p_player_id AND season_id = v_bps.id;

        -- level 0 = no track row yet (first contract claim creates it) -
        -- keeps the read model consistent with claim_season_tier's
        -- LEVEL_NOT_REACHED gate
        v_track := jsonb_build_object(
          'xp', COALESCE(v_pbp.current_xp, 0),
          'level', COALESCE(v_pbp.current_level, 0),
          'max_level', v_bps.max_level,
          'xp_per_level', v_bps.xp_per_level,
          'reroll_tokens', COALESCE(
            (SELECT player_reroll_tokens FROM players WHERE id = p_player_id), 0
          ),
          'tiers', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
               'level', t.level,
               'reward_type', t.reward_type,
               'reward_id', t.reward_id,
               'reward_amount', t.reward_amount,
               'claimed', EXISTS (
                 SELECT 1 FROM player_battle_pass_claims c
                 WHERE c.player_id = p_player_id AND c.tier_id = t.id
               )
             ) ORDER BY t.level)
             FROM battle_pass_tiers t
             WHERE t.season_id = v_bps.id AND t.is_premium = false),
            '[]'::jsonb
          )
        );
      END IF;
    END IF;

    -- Current bracket (QF + SF as they exist)
    v_playoffs := COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'round', m.round,
         'slot', m.slot,
         'week_start', m.week_start,
         'seed_a', m.seed_a,
         'seed_b', m.seed_b,
         'clan_a', (SELECT jsonb_build_object('id', c.id, 'name', c.name, 'tag', c.tag) FROM clans c WHERE c.id = m.clan_a),
         'clan_b', (SELECT jsonb_build_object('id', c.id, 'name', c.name, 'tag', c.tag) FROM clans c WHERE c.id = m.clan_b),
         'score_a', CASE WHEN d.clan_a = m.clan_a THEN d.score_a ELSE d.score_b END,
         'score_b', CASE WHEN d.clan_a = m.clan_a THEN d.score_b ELSE d.score_a END,
         'settled', d.status = 'settled',
         'winner', m.winner
       ) ORDER BY m.round ASC, m.slot)  -- 'quarterfinal' sorts before 'semifinal'
       FROM season_playoff_matches m
       LEFT JOIN clan_duels d ON d.id = m.duel_id
       WHERE m.season_id = v_season.id),
      '[]'::jsonb
    );
  END IF;

  -- Banner history: every decided champion, newest first
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'seq', s.seq,
      'season', s.name,
      'clan_name', c.clan_name,
      'clan_tag', c.clan_tag,
      'decided_at', c.decided_at
    ) ORDER BY s.seq DESC),
    '[]'::jsonb
  )
  INTO v_champions
  FROM season_champions c
  JOIN seasons s ON s.id = c.season_id;

  RETURN jsonb_build_object(
    'now', v_now,
    'season', v_season_json,
    'track', v_track,
    'playoffs', v_playoffs,
    'champions', v_champions
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 15. GET_CLAN_DUEL: re-created from the 020 body with the season rivalry
--     window (rivalry_window_start) replacing the two 8-week proxies.
--     Everything else is byte-identical to 020.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_clan_duel(p_clan_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_week DATE;
  v_prev_week DATE;
  v_clan RECORD;
  v_duel RECORD;
  v_opponent_id UUID;
  v_opponent RECORD;
  v_my_score BIGINT := 0;
  v_their_score BIGINT := 0;
  v_contributors JSONB := '[]'::jsonb;
  v_duel_json JSONB := NULL;
  v_last RECORD;
  v_last_json JSONB := NULL;
  v_my_delta INTEGER;
  v_my_side TEXT;
  v_my_rules JSONB;
  v_their_rules JSONB;
  v_my_roster UUID[];
  v_their_roster UUID[];
  v_phase TEXT;
  v_revealed BOOLEAN;
  v_my_picks JSONB;
  v_their_picks JSONB;
  v_rivalry JSONB := NULL;
  v_revenge BOOLEAN := false;
  v_gauntlet JSONB := NULL;
BEGIN
  PERFORM settle_and_pair_duels();

  v_week := duel_week_start(NOW());
  v_prev_week := v_week - 7;

  SELECT id, name, tag, rating, duel_wins, duel_losses
  INTO v_clan
  FROM clans
  WHERE id = p_clan_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Clan not found');
  END IF;

  -- Current-week duel (clan may be unpaired if created after pairing ran)
  SELECT * INTO v_duel
  FROM clan_duels
  WHERE week_start = v_week
    AND (clan_a = p_clan_id OR clan_b = p_clan_id)
  LIMIT 1;

  IF FOUND THEN
    -- Lazy rules resolution (no-op before Wed / without picks / on byes)
    PERFORM resolve_gauntlet(v_duel.id);
    SELECT * INTO v_duel FROM clan_duels WHERE id = v_duel.id;

    v_my_side := CASE WHEN v_duel.clan_a = p_clan_id THEN 'a' ELSE 'b' END;
    v_opponent_id := CASE
      WHEN v_duel.clan_a = p_clan_id THEN v_duel.clan_b
      ELSE v_duel.clan_a
    END;
    v_my_rules := v_duel.effective_rules -> v_my_side;
    v_their_rules := v_duel.effective_rules -> (CASE WHEN v_my_side = 'a' THEN 'b' ELSE 'a' END);
    v_my_roster := CASE WHEN v_my_side = 'a' THEN v_duel.roster_a ELSE v_duel.roster_b END;
    v_their_roster := CASE WHEN v_my_side = 'a' THEN v_duel.roster_b ELSE v_duel.roster_a END;

    -- Live scores computed on read - rules-aware once resolved
    IF v_duel.effective_rules IS NOT NULL THEN
      v_my_score := gauntlet_side_score(v_duel.week_start, p_clan_id, v_my_rules, v_my_roster);
      IF v_opponent_id IS NOT NULL THEN
        v_their_score := gauntlet_side_score(v_duel.week_start, v_opponent_id, v_their_rules, v_their_roster);
      END IF;

      SELECT COALESCE(
        jsonb_agg(jsonb_build_object('name', c.player_name, 'dna', c.counted_dna)),
        '[]'::jsonb
      )
      INTO v_contributors
      FROM gauntlet_top_contributors(v_duel.week_start, p_clan_id, v_my_rules, v_my_roster) c;
    ELSE
      SELECT COALESCE(MAX(s.score) FILTER (WHERE s.clan_id = p_clan_id), 0),
             COALESCE(MAX(s.score) FILTER (WHERE s.clan_id = v_opponent_id), 0)
      INTO v_my_score, v_their_score
      FROM clan_week_scores(v_week) s
      WHERE s.clan_id IN (p_clan_id, v_opponent_id);

      SELECT COALESCE(
        jsonb_agg(jsonb_build_object('name', c.player_name, 'dna', c.counted_dna)),
        '[]'::jsonb
      )
      INTO v_contributors
      FROM clan_top_contributors(p_clan_id, v_week) c;
    END IF;

    IF v_opponent_id IS NOT NULL THEN
      SELECT name, tag, rating INTO v_opponent FROM clans WHERE id = v_opponent_id;

      -- Gauntlet block: phase + picks (blind-gated) + rivalry + revenge
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

      -- Rivalry record vs this opponent (persistent head-to-head)
      SELECT jsonb_build_object(
        'wins', CASE WHEN r.clan_x = p_clan_id THEN r.wins_x ELSE r.wins_y END,
        'losses', CASE WHEN r.clan_x = p_clan_id THEN r.wins_y ELSE r.wins_x END,
        'ties', r.ties,
        'meetings', r.meetings,
        'last_winner_me', r.last_winner = p_clan_id
      ) INTO v_rivalry
      FROM clan_rivalries r
      WHERE r.clan_x = LEAST(p_clan_id, v_opponent_id)
        AND r.clan_y = GREATEST(p_clan_id, v_opponent_id);

      -- Revenge pairing: we met inside the SEASON window and we're not
      -- leading (8-week proxy only without a covering season)
      SELECT COUNT(*) >= 1
             AND (COUNT(*) FILTER (WHERE winner = p_clan_id))
                 <= (COUNT(*) FILTER (WHERE winner = v_opponent_id))
      INTO v_revenge
      FROM clan_duels
      WHERE status = 'settled'
        AND week_start >= rivalry_window_start(v_week)
        AND ((clan_a = p_clan_id AND clan_b = v_opponent_id)
             OR (clan_a = v_opponent_id AND clan_b = p_clan_id));

      v_gauntlet := jsonb_build_object(
        'phase', v_phase,
        'picks_deadline', ((v_week + 2)::timestamp AT TIME ZONE 'UTC'),
        'window_from', ((v_week + 3)::timestamp AT TIME ZONE 'UTC'),
        'window_to', ((v_week + 7)::timestamp AT TIME ZONE 'UTC'),
        'revealed', v_revealed,
        'my_picks', v_my_picks,
        'their_picks', v_their_picks,
        'my_rules', v_my_rules,
        'their_rules', v_their_rules,
        'rivalry', v_rivalry,
        'revenge', COALESCE(v_revenge, false)
      );
    END IF;

    v_duel_json := jsonb_build_object(
      'week_start', v_week,
      'ends_at', ((v_week + 7)::timestamp AT TIME ZONE 'UTC'),
      'status', v_duel.status,
      'is_bye', v_duel.clan_b IS NULL,
      'my_score', v_my_score,
      'their_score', v_their_score,
      'opponent', CASE
        WHEN v_opponent_id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'id', v_opponent_id,
          'name', v_opponent.name,
          'tag', v_opponent.tag,
          'rating', v_opponent.rating
        )
      END,
      'top_contributors', v_contributors,
      'gauntlet', v_gauntlet
    );
  END IF;

  -- Last week's settled result (for the banner + bonus indicator)
  SELECT d.*,
         CASE WHEN d.clan_a = p_clan_id THEN d.clan_b ELSE d.clan_a END AS opp_id
  INTO v_last
  FROM clan_duels d
  WHERE d.week_start = v_prev_week
    AND (d.clan_a = p_clan_id OR d.clan_b = p_clan_id)
    AND d.status = 'settled'
  LIMIT 1;

  IF FOUND THEN
    v_my_delta := CASE
      WHEN v_last.winner = p_clan_id THEN COALESCE(v_last.rating_delta, 0)
      WHEN v_last.winner IS NULL THEN 0
      ELSE -COALESCE(v_last.rating_delta, 0)
    END;

    v_last_json := jsonb_build_object(
      'result', CASE
        WHEN v_last.winner = p_clan_id THEN 'won'
        WHEN v_last.winner IS NULL THEN 'tie'
        ELSE 'lost'
      END,
      'rating_delta', v_my_delta,
      'opponent_name', (SELECT name FROM clans WHERE id = v_last.opp_id),
      'my_score', CASE WHEN v_last.clan_a = p_clan_id THEN v_last.score_a ELSE v_last.score_b END,
      'their_score', CASE WHEN v_last.clan_a = p_clan_id THEN v_last.score_b ELSE v_last.score_a END,
      'bonus_active', v_last.winner = p_clan_id
    );
  END IF;

  RETURN jsonb_build_object(
    'rating', v_clan.rating,
    'record', jsonb_build_object('wins', v_clan.duel_wins, 'losses', v_clan.duel_losses),
    'duel', v_duel_json,
    'last_week', v_last_json
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 16. RLS - new tables are public-read config/history (the board and
--     bracket are spectator surfaces); all writes go through SECURITY
--     DEFINER RPCs / the service role.
-- ----------------------------------------------------------------------------

ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_playoff_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_champions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seasons_public_read ON seasons;
CREATE POLICY seasons_public_read ON seasons FOR SELECT USING (true);

DROP POLICY IF EXISTS season_mutations_public_read ON season_mutations;
CREATE POLICY season_mutations_public_read ON season_mutations FOR SELECT USING (true);

DROP POLICY IF EXISTS season_playoff_matches_public_read ON season_playoff_matches;
CREATE POLICY season_playoff_matches_public_read ON season_playoff_matches FOR SELECT USING (true);

DROP POLICY IF EXISTS season_champions_public_read ON season_champions;
CREATE POLICY season_champions_public_read ON season_champions FOR SELECT USING (true);

-- ----------------------------------------------------------------------------
-- 17. GRANTS (PostgREST parity with 020; the API uses the service role)
-- ----------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION anomaly_for_week(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_anomaly_board(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION claim_season_tier(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_season(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION rivalry_window_start(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION maintain_season_playoffs() TO authenticated;
GRANT SELECT ON seasons TO authenticated;
GRANT SELECT ON season_mutations TO authenticated;
GRANT SELECT ON season_playoff_matches TO authenticated;
GRANT SELECT ON season_champions TO authenticated;
