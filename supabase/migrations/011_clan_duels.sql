-- ============================================================================
-- CLAN DUELS MIGRATION
-- Weekly head-to-head clan competition decided by DNA-per-energy efficiency.
--
-- Design (locked):
-- - ISO weeks (Mon 00:00 UTC boundaries)
-- - Score = sum of the clan's TOP 10 contributors, each counting only that
--   member's BEST 30 runs of the week (caps purchased-energy volume)
-- - ELO-ish clan rating: start 1000, K=32, winner takes from loser
-- - Winner earns a +5% clan-wide DNA multiplier for the NEXT week
-- - LAZY settlement: idempotent RPC invoked opportunistically by API reads,
--   advisory lock prevents double-settlement (no cron dependency)
-- ============================================================================

-- ============================================================================
-- CLANS: RATING + RECORD COLUMNS
-- ============================================================================
ALTER TABLE clans
  ADD COLUMN IF NOT EXISTS rating INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS duel_wins INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duel_losses INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_clans_rating ON clans(rating DESC);

-- ============================================================================
-- CLAN DUELS TABLE
-- One row per matchup per week. clan_b IS NULL means a bye week.
-- ============================================================================
CREATE TABLE IF NOT EXISTS clan_duels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,                 -- ISO week start (Monday, UTC)
  clan_a UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  clan_b UUID REFERENCES clans(id) ON DELETE CASCADE,  -- NULL = bye
  score_a INTEGER NOT NULL DEFAULT 0,
  score_b INTEGER NOT NULL DEFAULT 0,
  winner UUID REFERENCES clans(id) ON DELETE SET NULL, -- NULL = tie/bye/unsettled
  rating_delta INTEGER,                     -- points transferred to the winner
  status TEXT NOT NULL DEFAULT 'active',
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (week_start, clan_a),
  UNIQUE (week_start, clan_b),

  CONSTRAINT clan_duels_status CHECK (status IN ('active', 'settled', 'bye')),
  CONSTRAINT clan_duels_distinct_clans CHECK (clan_b IS NULL OR clan_b <> clan_a),
  CONSTRAINT clan_duels_bye_shape CHECK ((status = 'bye') = (clan_b IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_clan_duels_week_status ON clan_duels(week_start, status);
CREATE INDEX IF NOT EXISTS idx_clan_duels_clan_a ON clan_duels(clan_a, week_start);
CREATE INDEX IF NOT EXISTS idx_clan_duels_clan_b ON clan_duels(clan_b, week_start);
CREATE INDEX IF NOT EXISTS idx_clan_duels_winner_week ON clan_duels(winner, week_start)
  WHERE winner IS NOT NULL;

-- Supports the per-player best-runs window scan in clan_week_scores
CREATE INDEX IF NOT EXISTS idx_game_sessions_duel_scoring
  ON game_sessions(player_id, ended_at, dna_earned)
  WHERE ended_at IS NOT NULL AND dna_earned > 0;

ALTER TABLE clan_duels ENABLE ROW LEVEL SECURITY;

-- Read-only for players; all writes go through SECURITY DEFINER functions
DROP POLICY IF EXISTS clan_duels_select ON clan_duels;
CREATE POLICY clan_duels_select ON clan_duels
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================================
-- WEEK BOUNDARY HELPER (ISO week, Monday 00:00 UTC)
-- ============================================================================
CREATE OR REPLACE FUNCTION duel_week_start(p_at TIMESTAMPTZ DEFAULT NOW())
RETURNS DATE AS $$
  SELECT (date_trunc('week', p_at AT TIME ZONE 'UTC'))::date;
$$ LANGUAGE sql STABLE;

-- ============================================================================
-- SCORING
-- Per clan: SUM over its top 10 members of (each member's best 30 runs'
-- dna_earned inside [week_start, week_start + 7d)). Only completed sessions
-- (ended_at set) with dna_earned > 0 count.
--
-- Note on identity: clan_members.player_id references auth.users(id) while
-- game_sessions.player_id references players(id) - bridged via players.user_id.
-- ============================================================================
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

-- Top contributors for one clan in one week (for the duel UI)
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

-- ============================================================================
-- LAZY SETTLEMENT + PAIRING (idempotent)
-- - Settles any 'active' duels whose week has ended: final scores, winner,
--   ELO transfer (K=32), win/loss record. Ties: no rating change, no bonus.
-- - Pairs the current week if it has no rows: clans with >= 1 member sorted
--   by rating, adjacent pairing (1-2, 3-4, ...); odd clan out gets a bye.
-- - pg_advisory_xact_lock serializes concurrent invocations.
-- ============================================================================
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
    SELECT COALESCE(MAX(s.score) FILTER (WHERE s.clan_id = v_duel.clan_a), 0),
           COALESCE(MAX(s.score) FILTER (WHERE s.clan_id = v_duel.clan_b), 0)
    INTO v_score_a, v_score_b
    FROM clan_week_scores(v_duel.week_start) s
    WHERE s.clan_id IN (v_duel.clan_a, v_duel.clan_b);

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

  -- ---- Pair the current week (only once) --------------------------------
  IF NOT EXISTS (SELECT 1 FROM clan_duels WHERE week_start = v_week) THEN
    WITH ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (ORDER BY rating DESC, created_at ASC, id ASC) AS rn
      FROM clans
      WHERE member_count >= 1
    )
    INSERT INTO clan_duels (week_start, clan_a, clan_b, status)
    SELECT v_week,
           a.id,
           b.id,
           CASE WHEN b.id IS NULL THEN 'bye' ELSE 'active' END
    FROM ranked a
    LEFT JOIN ranked b ON b.rn = a.rn + 1
    WHERE a.rn % 2 = 1;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- DUEL READ MODEL (triggers lazy settlement first)
-- Returns the clan's current-week duel with LIVE scores + top contributors,
-- plus last week's settled result for the banner.
-- ============================================================================
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
    v_opponent_id := CASE
      WHEN v_duel.clan_a = p_clan_id THEN v_duel.clan_b
      ELSE v_duel.clan_a
    END;

    -- Live scores computed on read
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

    IF v_opponent_id IS NOT NULL THEN
      SELECT name, tag, rating INTO v_opponent FROM clans WHERE id = v_opponent_id;
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
      'top_contributors', v_contributors
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

-- ============================================================================
-- DUEL-WIN DNA BONUS
-- x1.05 if the player's clan WON its duel for the PREVIOUS week, else x1.0.
-- Accepts players.id (as used by the reward pipeline); falls back to treating
-- the argument as auth.users.id for robustness.
-- Settles lazily only when the previous week is still unsettled for the clan,
-- keeping the game-end hot path cheap.
-- ============================================================================
CREATE OR REPLACE FUNCTION clan_duel_bonus(p_player_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_user_id UUID;
  v_clan_id UUID;
  v_prev_week DATE := duel_week_start(NOW()) - 7;
BEGIN
  SELECT user_id INTO v_user_id FROM players WHERE id = p_player_id;
  IF v_user_id IS NULL THEN
    v_user_id := p_player_id;
  END IF;

  SELECT clan_id INTO v_clan_id FROM clan_members WHERE player_id = v_user_id;
  IF v_clan_id IS NULL THEN
    RETURN 1.0;
  END IF;

  -- Lazily settle if last week's duel for this clan hasn't been settled yet
  IF EXISTS (
    SELECT 1 FROM clan_duels
    WHERE week_start = v_prev_week
      AND status = 'active'
      AND (clan_a = v_clan_id OR clan_b = v_clan_id)
  ) THEN
    PERFORM settle_and_pair_duels();
  END IF;

  IF EXISTS (
    SELECT 1 FROM clan_duels
    WHERE week_start = v_prev_week
      AND status = 'settled'
      AND winner = v_clan_id
  ) THEN
    RETURN 1.05;
  END IF;

  RETURN 1.0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Players may read their own duel state / bonus via PostgREST if needed
GRANT EXECUTE ON FUNCTION duel_week_start(TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION clan_week_scores(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION clan_top_contributors(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION settle_and_pair_duels() TO authenticated;
GRANT EXECUTE ON FUNCTION get_clan_duel(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION clan_duel_bonus(UUID) TO authenticated;
