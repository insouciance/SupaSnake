-- ############################################################################
-- ##                                                                        ##
-- ##  MIGRATION 046 — NOT APPLIED TO ANY DATABASE BY THIS WORK PACKAGE.     ##
-- ##                                                                        ##
-- ##  WP-1.01 wrote and reviewed this file and deliberately did NOT run     ##
-- ##  `supabase db push`, `db reset`, `link` or `start`. It is committed    ##
-- ##  as the schema half of the change; applying it to staging and then     ##
-- ##  production is an owner decision, taken with the release runbook       ##
-- ##  (docs/ops/RELEASE_RUNBOOK.md) in hand.                                ##
-- ##                                                                        ##
-- ############################################################################
--
-- Migration 046: The World Serpent — the weekly hunt and the home of Depth
--
-- Authority: docs/PRODUCT_CONSTITUTION.md §7.3 (the Serpent), §6.2 (Yield and
-- Depth), §8.6 (the harvest envelope — Serpent attempts consume no charge and
-- Depth always counts full-strength Yield), Rule 5 (absence is never
-- destructive), Rule 6 (earned things are permanent), Rule 8 (clans never
-- grade and never bill), Rule 10 / §12.2 (the Serpent is the ONE weekly
-- surface) and Rule 11 (server authority).
--
-- WHAT CHANGES
--
--   1. `serpent_weeks` — one row per ISO week: the seed and the modifier set
--      the whole world hunts under. The row is DERIVED FROM THE CALENDAR by
--      `src/shared/game/serpent.ts` and written by `ensure_serpent_week`,
--      which refuses to change a week that already exists. Nothing a client
--      sends reaches any column (Rule 11).
--
--   2. `game_sessions.serpent_week_id` — run flagging. Stamped by the server
--      at START, from the calendar, exactly like `charge_state` and
--      `anomaly_id` before it. This column is the server-resolved id that
--      WP-0.01's `ChargeExemptionFacts.serpentWeekId` has been waiting for:
--      until it is stamped, a client claiming `mode: 'serpent'` gets an
--      ordinary charged run. Once stamped, the attempt consumes no charge.
--
--   3. `serpent_week_players` / `serpent_week_clans` — the settled record of a
--      week. Personal weekly Depth is the sum of the best THREE eligible
--      Yields; clan weekly Depth is the plain SUM of its members' Depths.
--
--   4. `players.lifetime_depth` / `players.best_week_depth` and the same pair
--      on `clans` — the monotonic carry. Both are RECOMPUTED from the weekly
--      rows and then clamped upward with GREATEST. Never incremented.
--
--   5. `serpent_chronicle_entries` — the records settlement writes: a personal
--      best week and a clan best week (§7.3). Records only. There is no DNA
--      settlement bonus in this migration, because §7.3 forbids one: "Depth is
--      measured, not farmed."
--
--   6. `apply_serpent_week_settlement` — the settlement RPC. One transaction,
--      idempotent by construction, monotonic by construction.
--
-- HOW IDEMPOTENCY IS GUARANTEED (the acceptance criterion, in the schema)
--
--   Nothing in this migration increments anything. Every accumulated number is
--   a pure function of persisted rows:
--
--     weekly Depth   comes from the caller's exact recompute of the week's
--                    session rows, and lands through GREATEST — settling twice
--                    writes the same value twice;
--     clan Depth     is SUM(serpent_week_players.depth) for the week, computed
--                    inside the RPC from the rows it just wrote;
--     lifetime Depth is SUM(depth) over ALL of that player's (or clan's)
--                    settled weekly rows, clamped with GREATEST.
--
--   Run the cron twice, ten times, or after a crash halfway through, and the
--   answer is the same: the sum of what is stored. A `+=` anywhere in here
--   would break that, which is why there is none.
--
-- HOW MONOTONICITY IS GUARANTEED (Rules 5 and 6)
--
--   Every write to a carried number is `GREATEST(existing, recomputed)`. A
--   shrinking source — a session later invalidated, a member who left, a row a
--   GDPR erasure removed — can lower the recompute and can never lower the
--   stored number. A missed week costs that week's opportunity and nothing
--   else: no decay, no expiry, no reset. Sections 1 and 10 of this file
--   SNAPSHOT every player-owned aggregate before the DDL and RAISE an
--   exception if a single one moved downward — the pattern 041 and 042 set.
--
-- WHY NOTHING HERE CAN GRADE A CLAN (Rule 8)
--
--   Clan Depth is `SUM(depth)` and nothing else. There is no threshold column,
--   no minimum, no floor, no bar, no pass/fail state, no per-member
--   multiplier, no officer-visible evaluation column, and no reward table that
--   any clan number is an input to. The reviewer question — "can any member's
--   reward change because of another member's number?" — has a structural
--   answer: this migration creates no reward at all. Settlement pays records.
--   A clan of one settles the same way a clan of twelve does.
--
-- WHY MONEY CANNOT REACH DEPTH (Rule 3, §6.2)
--
--   The only input to `serpent_week_players.depth` is `game_sessions.yield_dna`
--   on rows that settled. No statement in this file reads an entitlement, a
--   subscription, a purchase, a cosmetic, a premium flag or `players.dna`.
--   Grep this file for `entitlement`, `premium`, `subscription` or `stripe`:
--   there is nothing to find, and `serpent.migration.test.ts` asserts it.
--
-- DOWN-NOTE (forward-only)
--
--   This migration is forward-only. It is additive: it creates four tables,
--   adds five columns and two functions, and alters nothing that exists. To
--   roll the FEATURE back, unset `NEXT_PUBLIC_SERPENT_V1` — the flag is the
--   rollback path and it is tested. To roll the SCHEMA back (only ever
--   correct before any week has settled, since a settled Depth is an earned
--   thing and Rule 6 forbids destroying it):
--
--     DROP FUNCTION IF EXISTS apply_serpent_week_settlement(UUID, JSONB);
--     DROP FUNCTION IF EXISTS ensure_serpent_week(DATE, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[]);
--     DROP TABLE IF EXISTS serpent_chronicle_entries;
--     DROP TABLE IF EXISTS serpent_week_clans;
--     DROP TABLE IF EXISTS serpent_week_players;
--     ALTER TABLE game_sessions DROP COLUMN IF EXISTS serpent_week_id;
--     DROP TABLE IF EXISTS serpent_weeks;
--     ALTER TABLE players DROP COLUMN IF EXISTS lifetime_depth,
--                         DROP COLUMN IF EXISTS best_week_depth;
--     ALTER TABLE clans   DROP COLUMN IF EXISTS lifetime_depth,
--                         DROP COLUMN IF EXISTS best_week_depth;
--
--   After a week has settled, the correct rollback is the flag, not the DDL.

BEGIN;

-- ===========================================================================
-- 1. SNAPSHOT — the Rule 6 tripwire (pattern: migrations 041, 042)
-- ===========================================================================
--
-- Everything this migration could conceivably move is captured first. Section
-- 10 compares and aborts the whole transaction if a single value moved down.
-- The migration is additive, so the expected diff is exactly zero rows.

CREATE TEMP TABLE serpent_pre_migration_players ON COMMIT DROP AS
SELECT
  id,
  COALESCE(dna, 0)               AS dna,
  COALESCE(total_dna_earned, 0)  AS total_dna_earned,
  COALESCE(legacy_score, 0)      AS legacy_score,
  COALESCE(high_score, 0)        AS high_score
FROM players;

CREATE TEMP TABLE serpent_pre_migration_sessions ON COMMIT DROP AS
SELECT
  id,
  COALESCE(dna_earned, 0) AS dna_earned,
  COALESCE(score, 0)      AS score,
  ended_at,
  end_reason
FROM game_sessions;

CREATE TEMP TABLE serpent_pre_migration_records ON COMMIT DROP AS
SELECT player_id, record_id, COALESCE(value, 0) AS value, COALESCE(tier, 0) AS tier
FROM player_records;

-- ===========================================================================
-- 2. serpent_weeks — the week, derived from the calendar
-- ===========================================================================

CREATE TABLE IF NOT EXISTS serpent_weeks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The Monday (UTC) the week opens on. The natural key: one Serpent per
  -- week, worldwide, forever. §12.2 caps weekly surfaces at ONE, and this
  -- UNIQUE constraint is the cap written into the schema.
  week_start   DATE        NOT NULL UNIQUE,
  starts_at    TIMESTAMPTZ NOT NULL,
  -- Exclusive. Monday 00:00 UTC of the following week — "Sunday midnight UTC
  -- it submerges" (§7.3) is the end of Sunday.
  ends_at      TIMESTAMPTZ NOT NULL,
  -- Deterministic; FNV-1a over the week key (src/shared/game/serpent.ts).
  seed         TEXT        NOT NULL,
  -- The condition-set, drawn from the curated modifier pool. An array so the
  -- draw size is a tuning constant rather than a migration.
  modifiers    TEXT[]      NOT NULL DEFAULT '{}',
  -- Stamped by the first successful settlement; never cleared.
  settled_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT serpent_week_window CHECK (ends_at > starts_at),
  CONSTRAINT serpent_week_seed_shape CHECK (char_length(seed) BETWEEN 2 AND 64)
);

CREATE INDEX IF NOT EXISTS idx_serpent_weeks_window
  ON serpent_weeks (ends_at DESC);
CREATE INDEX IF NOT EXISTS idx_serpent_weeks_unsettled
  ON serpent_weeks (ends_at) WHERE settled_at IS NULL;

-- ===========================================================================
-- 3. Run flagging — game_sessions.serpent_week_id
-- ===========================================================================
--
-- The server-resolved id WP-0.01's exemption hook requires. A NULL here is an
-- ordinary run; a value means "this run was launched as an attempt in that
-- week", stamped at START from server facts. Because it is stamped at start,
-- a replayed `end` cannot turn an ordinary run into a Serpent attempt, and a
-- week that has submerged cannot retroactively acquire runs.

ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS serpent_week_id UUID
    REFERENCES serpent_weeks(id) ON DELETE SET NULL;

-- The settlement scan: every attempt in a week, cheaply.
CREATE INDEX IF NOT EXISTS idx_game_sessions_serpent_week
  ON game_sessions (serpent_week_id, player_id)
  WHERE serpent_week_id IS NOT NULL;

-- ===========================================================================
-- 4. The settled record of a week
-- ===========================================================================

CREATE TABLE IF NOT EXISTS serpent_week_players (
  week_id         UUID NOT NULL REFERENCES serpent_weeks(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- Weekly Depth: the sum of the best three eligible Yields, in segments.
  depth           BIGINT NOT NULL DEFAULT 0 CHECK (depth >= 0),
  -- Eligible attempts. Unlimited by law (§7.3) — recorded, never limited,
  -- never a threshold, never an input to any number but itself.
  attempts        INT    NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  best_yield      BIGINT NOT NULL DEFAULT 0 CHECK (best_yield >= 0),
  -- The Yields that made the number, descending. Shown so a player can see
  -- WHICH runs counted; never read back by any computation.
  counted_yields  BIGINT[] NOT NULL DEFAULT '{}',
  -- The clan the member was in AT SETTLEMENT. Frozen deliberately: a member
  -- who leaves afterwards never retroactively removes Depth the clan already
  -- reached (Rule 6).
  clan_id         UUID REFERENCES clans(id) ON DELETE SET NULL,
  settled_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (week_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_serpent_week_players_player
  ON serpent_week_players (player_id, week_id);
CREATE INDEX IF NOT EXISTS idx_serpent_week_players_clan
  ON serpent_week_players (week_id, clan_id) WHERE clan_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS serpent_week_clans (
  week_id               UUID NOT NULL REFERENCES serpent_weeks(id) ON DELETE CASCADE,
  clan_id               UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  -- The plain SUM of member Depths. Rule 8: additive participation. There is
  -- no companion column here for a threshold, a bar, a minimum or a rank
  -- reward, and adding one would be a constitutional amendment, not a feature.
  depth                 BIGINT NOT NULL DEFAULT 0 CHECK (depth >= 0),
  -- Informational only. A clan of one with one hunting member is a complete,
  -- meaningful week (§7.3).
  contributing_members  INT NOT NULL DEFAULT 0 CHECK (contributing_members >= 0),
  member_count          INT NOT NULL DEFAULT 0 CHECK (member_count >= 0),
  settled_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (week_id, clan_id)
);

CREATE INDEX IF NOT EXISTS idx_serpent_week_clans_clan
  ON serpent_week_clans (clan_id, week_id);

-- ===========================================================================
-- 5. The monotonic carry
-- ===========================================================================
--
-- Depth is a public number (§12.2 caps public numbers at two: Score and
-- Depth). These four columns are that one number carried across weeks — not a
-- fifth currency, not a second weekly surface, not a rating.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS lifetime_depth  BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_week_depth BIGINT NOT NULL DEFAULT 0;

ALTER TABLE clans
  ADD COLUMN IF NOT EXISTS lifetime_depth  BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_week_depth BIGINT NOT NULL DEFAULT 0;

-- ===========================================================================
-- 6. serpent_chronicle_entries — what settlement writes into the record
-- ===========================================================================
--
-- §7.3: settlement adds "a Chronicle entry for records (personal best week,
-- clan best week)". Two kinds, both records, neither paying anything.
--
-- The uniqueness constraints are half of the idempotency guarantee: a
-- re-settled week cannot write a second entry for the same milestone.

CREATE TABLE IF NOT EXISTS serpent_chronicle_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id        UUID NOT NULL REFERENCES serpent_weeks(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,
  player_id      UUID REFERENCES players(id) ON DELETE CASCADE,
  clan_id        UUID REFERENCES clans(id) ON DELETE CASCADE,
  -- The Depth the entry commemorates, and what it beat.
  depth          BIGINT NOT NULL CHECK (depth >= 0),
  previous_depth BIGINT NOT NULL DEFAULT 0 CHECK (previous_depth >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT serpent_chronicle_kind
    CHECK (kind IN ('personal_best_week', 'clan_best_week')),
  -- A personal entry names a player; a clan entry names a clan.
  CONSTRAINT serpent_chronicle_subject CHECK (
    (kind = 'personal_best_week' AND player_id IS NOT NULL) OR
    (kind = 'clan_best_week'     AND clan_id   IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_serpent_chronicle_personal
  ON serpent_chronicle_entries (week_id, player_id, kind)
  WHERE player_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_serpent_chronicle_clan
  ON serpent_chronicle_entries (week_id, clan_id, kind)
  WHERE clan_id IS NOT NULL AND kind = 'clan_best_week';

CREATE INDEX IF NOT EXISTS idx_serpent_chronicle_player
  ON serpent_chronicle_entries (player_id, created_at DESC)
  WHERE player_id IS NOT NULL;

-- ===========================================================================
-- 7. ensure_serpent_week — the week is written once, from the calendar
-- ===========================================================================
--
-- The caller derives every field from the UTC calendar
-- (`describeSerpentWeek`). This function's job is to make that derivation a
-- ROW, exactly once, and then to defend it:
--
--   * ON CONFLICT DO NOTHING — the first writer wins. Two concurrent run
--     starts on Monday morning cannot produce two weeks or two seeds.
--   * If a week already exists with a DIFFERENT seed or modifier set, the
--     function RAISEs. That can only mean the derivation changed under a live
--     week, which would silently re-write the conditions players are hunting
--     under. Failing loudly is the only honest answer (Rule 11).
--
-- The client never reaches this function: it is revoked from PUBLIC, anon and
-- authenticated, and the API route that calls it passes calendar values, not
-- request values.

CREATE OR REPLACE FUNCTION ensure_serpent_week(
  p_week_start DATE,
  p_starts_at  TIMESTAMPTZ,
  p_ends_at    TIMESTAMPTZ,
  p_seed       TEXT,
  p_modifiers  TEXT[]
)
RETURNS TABLE (
  id         UUID,
  week_start DATE,
  starts_at  TIMESTAMPTZ,
  ends_at    TIMESTAMPTZ,
  seed       TEXT,
  modifiers  TEXT[],
  settled_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row serpent_weeks%ROWTYPE;
BEGIN
  IF p_week_start IS NULL OR p_seed IS NULL OR p_starts_at IS NULL OR p_ends_at IS NULL THEN
    RAISE EXCEPTION 'ensure_serpent_week requires a fully derived week';
  END IF;

  INSERT INTO serpent_weeks (week_start, starts_at, ends_at, seed, modifiers)
  VALUES (p_week_start, p_starts_at, p_ends_at, p_seed, COALESCE(p_modifiers, '{}'))
  ON CONFLICT (week_start) DO NOTHING;

  SELECT * INTO v_row FROM serpent_weeks w WHERE w.week_start = p_week_start;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'ensure_serpent_week could not resolve week %', p_week_start;
  END IF;

  -- Drift tripwire. A live week's conditions are never rewritten.
  IF v_row.seed IS DISTINCT FROM p_seed THEN
    RAISE EXCEPTION
      'Serpent week % already exists with seed % (caller derived %) — the week derivation changed under a live week',
      p_week_start, v_row.seed, p_seed;
  END IF;
  IF v_row.modifiers IS DISTINCT FROM COALESCE(p_modifiers, '{}') THEN
    RAISE EXCEPTION
      'Serpent week % already exists with a different modifier set — the week derivation changed under a live week',
      p_week_start;
  END IF;

  RETURN QUERY
  SELECT v_row.id, v_row.week_start, v_row.starts_at, v_row.ends_at,
         v_row.seed, v_row.modifiers, v_row.settled_at;
END;
$$ LANGUAGE plpgsql VOLATILE;

REVOKE ALL ON FUNCTION ensure_serpent_week(DATE, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION ensure_serpent_week(DATE, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[]) FROM anon;
REVOKE ALL ON FUNCTION ensure_serpent_week(DATE, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION ensure_serpent_week(DATE, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[]) TO service_role;

-- ===========================================================================
-- 8. apply_serpent_week_settlement — the settlement, atomic and idempotent
-- ===========================================================================
--
-- Input: the week, and the caller's EXACT RECOMPUTE of every member's weekly
-- Depth (`p_players`, a JSONB array of
-- `{player_id, clan_id, depth, attempts, best_yield, counted_yields}`).
--
-- The recompute happens in `src/lib/server/serpent.ts` against the session
-- rows, under the same eligibility predicates the query applies and the pure
-- fold re-applies (WP-0.05's two-gate shape). This function owns everything
-- that must be atomic and everything that must be monotonic.
--
-- WHAT IT CANNOT DO: there is no INSERT into `economy_transactions`, no UPDATE
-- of `players.dna` or `total_dna_earned`, and no write to any cosmetic,
-- entitlement or premium table anywhere below. Settlement pays records
-- (§7.3), and this function has no statement through which it could pay
-- anything else.

CREATE OR REPLACE FUNCTION apply_serpent_week_settlement(
  p_week_id UUID,
  p_players JSONB
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_week          serpent_weeks%ROWTYPE;
  v_player_rows   INT := 0;
  v_clan_rows     INT := 0;
  v_chronicle_new INT := 0;
BEGIN
  -- Serialize concurrent settlements of the SAME week. Two crons firing at
  -- once then run one after the other, and because every number below is a
  -- recompute rather than an increment, the second produces the same answer.
  SELECT * INTO v_week FROM serpent_weeks w WHERE w.id = p_week_id FOR UPDATE;
  IF v_week.id IS NULL THEN
    RAISE EXCEPTION 'apply_serpent_week_settlement: unknown week %', p_week_id;
  END IF;

  -- ---- 8a. Member rows -------------------------------------------------
  --
  -- GREATEST on every carried number (Rule 6). `counted_yields` follows the
  -- depth it explains, so the stored list always matches the stored number.
  WITH incoming AS (
    SELECT
      (entry->>'player_id')::UUID                                   AS player_id,
      NULLIF(entry->>'clan_id', '')::UUID                           AS clan_id,
      GREATEST(COALESCE((entry->>'depth')::BIGINT, 0), 0)           AS depth,
      GREATEST(COALESCE((entry->>'attempts')::INT, 0), 0)           AS attempts,
      GREATEST(COALESCE((entry->>'best_yield')::BIGINT, 0), 0)      AS best_yield,
      COALESCE(
        ARRAY(
          SELECT GREATEST((value)::BIGINT, 0)
          FROM jsonb_array_elements_text(COALESCE(entry->'counted_yields', '[]'::JSONB))
        ),
        '{}'::BIGINT[]
      )                                                             AS counted_yields
    FROM jsonb_array_elements(COALESCE(p_players, '[]'::JSONB)) AS entry
  ),
  -- Only members that still exist. A GDPR erasure removed the player; the
  -- settlement simply has nobody to credit.
  present AS (
    SELECT i.* FROM incoming i JOIN players pl ON pl.id = i.player_id
  ),
  upserted AS (
    INSERT INTO serpent_week_players AS swp
      (week_id, player_id, depth, attempts, best_yield, counted_yields, clan_id)
    SELECT p_week_id, player_id, depth, attempts, best_yield, counted_yields, clan_id
    FROM present
    ON CONFLICT (week_id, player_id) DO UPDATE SET
      depth          = GREATEST(swp.depth, EXCLUDED.depth),
      attempts       = GREATEST(swp.attempts, EXCLUDED.attempts),
      best_yield     = GREATEST(swp.best_yield, EXCLUDED.best_yield),
      counted_yields = CASE
                         WHEN EXCLUDED.depth >= swp.depth THEN EXCLUDED.counted_yields
                         ELSE swp.counted_yields
                       END,
      -- Membership is recorded once, at first settlement, and never rewritten.
      clan_id        = COALESCE(swp.clan_id, EXCLUDED.clan_id)
    RETURNING swp.player_id
  )
  SELECT COUNT(*) INTO v_player_rows FROM upserted;

  -- ---- 8b. Personal best-week Chronicle entries ------------------------
  --
  -- Written BEFORE the standings move, so "what it beat" is the real previous
  -- best. Strictly greater: equalling your best week is not a new record.
  -- ON CONFLICT DO NOTHING makes a re-settlement write nothing at all.
  WITH candidates AS (
    SELECT swp.player_id, swp.depth, pl.best_week_depth AS previous_depth
    FROM serpent_week_players swp
    JOIN players pl ON pl.id = swp.player_id
    WHERE swp.week_id = p_week_id
      AND swp.depth > 0
      AND swp.depth > pl.best_week_depth
  ),
  inserted AS (
    INSERT INTO serpent_chronicle_entries (week_id, kind, player_id, depth, previous_depth)
    SELECT p_week_id, 'personal_best_week', player_id, depth, previous_depth
    FROM candidates
    ON CONFLICT DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO v_chronicle_new FROM inserted;

  -- ---- 8c. Player standings — recompute, then clamp upward -------------
  --
  -- lifetime_depth is the SUM over the player's settled weeks, NOT
  -- `lifetime_depth + this week`. That is the whole idempotency argument.
  UPDATE players pl
  SET lifetime_depth  = GREATEST(pl.lifetime_depth, totals.lifetime),
      best_week_depth = GREATEST(pl.best_week_depth, totals.best)
  FROM (
    SELECT swp.player_id,
           COALESCE(SUM(swp.depth), 0) AS lifetime,
           COALESCE(MAX(swp.depth), 0) AS best
    FROM serpent_week_players swp
    WHERE swp.player_id IN (
      SELECT s.player_id FROM serpent_week_players s WHERE s.week_id = p_week_id
    )
    GROUP BY swp.player_id
  ) AS totals
  WHERE pl.id = totals.player_id;

  -- ---- 8d. Clan rows — the additive sum, and nothing else --------------
  WITH clan_totals AS (
    SELECT swp.clan_id,
           COALESCE(SUM(swp.depth), 0)                        AS depth,
           COUNT(*) FILTER (WHERE swp.depth > 0)::INT         AS contributing_members,
           COUNT(*)::INT                                      AS member_count
    FROM serpent_week_players swp
    WHERE swp.week_id = p_week_id AND swp.clan_id IS NOT NULL
    GROUP BY swp.clan_id
  ),
  present_clans AS (
    SELECT ct.* FROM clan_totals ct JOIN clans c ON c.id = ct.clan_id
  ),
  clan_upserted AS (
    INSERT INTO serpent_week_clans AS swc
      (week_id, clan_id, depth, contributing_members, member_count)
    SELECT p_week_id, clan_id, depth, contributing_members, member_count
    FROM present_clans
    ON CONFLICT (week_id, clan_id) DO UPDATE SET
      depth                = GREATEST(swc.depth, EXCLUDED.depth),
      contributing_members = GREATEST(swc.contributing_members, EXCLUDED.contributing_members),
      member_count         = GREATEST(swc.member_count, EXCLUDED.member_count)
    RETURNING swc.clan_id
  )
  SELECT COUNT(*) INTO v_clan_rows FROM clan_upserted;

  -- ---- 8e. Clan best-week Chronicle entries ----------------------------
  INSERT INTO serpent_chronicle_entries (week_id, kind, clan_id, depth, previous_depth)
  SELECT p_week_id, 'clan_best_week', swc.clan_id, swc.depth, c.best_week_depth
  FROM serpent_week_clans swc
  JOIN clans c ON c.id = swc.clan_id
  WHERE swc.week_id = p_week_id
    AND swc.depth > 0
    AND swc.depth > c.best_week_depth
  ON CONFLICT DO NOTHING;

  -- ---- 8f. Clan standings — recompute, then clamp upward ---------------
  UPDATE clans c
  SET lifetime_depth  = GREATEST(c.lifetime_depth, totals.lifetime),
      best_week_depth = GREATEST(c.best_week_depth, totals.best)
  FROM (
    SELECT swc.clan_id,
           COALESCE(SUM(swc.depth), 0) AS lifetime,
           COALESCE(MAX(swc.depth), 0) AS best
    FROM serpent_week_clans swc
    WHERE swc.clan_id IN (
      SELECT s.clan_id FROM serpent_week_clans s WHERE s.week_id = p_week_id
    )
    GROUP BY swc.clan_id
  ) AS totals
  WHERE c.id = totals.clan_id;

  -- ---- 8g. Stamp the week ----------------------------------------------
  -- COALESCE, never overwrite: the first settlement is the one that happened.
  UPDATE serpent_weeks w
  SET settled_at = COALESCE(w.settled_at, NOW())
  WHERE w.id = p_week_id;

  RETURN jsonb_build_object(
    'week_id', p_week_id,
    'players', v_player_rows,
    'clans', v_clan_rows,
    'chronicle_entries', v_chronicle_new
  );
END;
$$ LANGUAGE plpgsql VOLATILE;

REVOKE ALL ON FUNCTION apply_serpent_week_settlement(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION apply_serpent_week_settlement(UUID, JSONB) FROM anon;
REVOKE ALL ON FUNCTION apply_serpent_week_settlement(UUID, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION apply_serpent_week_settlement(UUID, JSONB) TO service_role;

-- ===========================================================================
-- 9. Row-level security — the Serpent's tables are server-mediated
-- ===========================================================================
--
-- RLS on, and no policy for anon or authenticated. Every read a player makes
-- goes through `GET /api/serpent/panel`, which runs on the service role and
-- applies the cohort filter (§13 / WP-0.06 — clan and Serpent standings are
-- public surfaces). Depth is a public number, but "public" means "rendered by
-- a surface that filters", not "selectable by anyone with an anon key".

ALTER TABLE serpent_weeks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE serpent_week_players      ENABLE ROW LEVEL SECURITY;
ALTER TABLE serpent_week_clans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE serpent_chronicle_entries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON serpent_weeks             FROM anon, authenticated;
REVOKE ALL ON serpent_week_players      FROM anon, authenticated;
REVOKE ALL ON serpent_week_clans        FROM anon, authenticated;
REVOKE ALL ON serpent_chronicle_entries FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON serpent_weeks             TO service_role;
GRANT SELECT, INSERT, UPDATE ON serpent_week_players      TO service_role;
GRANT SELECT, INSERT, UPDATE ON serpent_week_clans        TO service_role;
GRANT SELECT, INSERT         ON serpent_chronicle_entries TO service_role;

-- ===========================================================================
-- 10. THE TRIPWIRE — abort if anything a player owns moved downward (Rule 6)
-- ===========================================================================
--
-- This migration is additive and the expected count is zero on every check.
-- If it is not, something in the DDL above had a side effect nobody intended,
-- and the correct outcome is that production never sees it.

DO $$
DECLARE
  v_bad INT;
BEGIN
  SELECT COUNT(*) INTO v_bad
  FROM serpent_pre_migration_players pre
  JOIN players now_p ON now_p.id = pre.id
  WHERE COALESCE(now_p.dna, 0)              < pre.dna
     OR COALESCE(now_p.total_dna_earned, 0) < pre.total_dna_earned
     OR COALESCE(now_p.legacy_score, 0)     < pre.legacy_score
     OR COALESCE(now_p.high_score, 0)       < pre.high_score;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Migration 046 aborted: % player rows moved downward (Rule 6)', v_bad;
  END IF;

  SELECT COUNT(*) INTO v_bad
  FROM serpent_pre_migration_players pre
  LEFT JOIN players now_p ON now_p.id = pre.id
  WHERE now_p.id IS NULL;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Migration 046 aborted: % player rows disappeared (Rule 6)', v_bad;
  END IF;

  SELECT COUNT(*) INTO v_bad
  FROM serpent_pre_migration_sessions pre
  LEFT JOIN game_sessions now_s ON now_s.id = pre.id
  WHERE now_s.id IS NULL
     OR COALESCE(now_s.dna_earned, 0) < pre.dna_earned
     OR COALESCE(now_s.score, 0)      < pre.score
     OR now_s.ended_at   IS DISTINCT FROM pre.ended_at
     OR now_s.end_reason IS DISTINCT FROM pre.end_reason;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Migration 046 aborted: % session rows changed (Rule 6)', v_bad;
  END IF;

  SELECT COUNT(*) INTO v_bad
  FROM serpent_pre_migration_records pre
  LEFT JOIN player_records now_r
    ON now_r.player_id = pre.player_id AND now_r.record_id = pre.record_id
  WHERE now_r.player_id IS NULL
     OR COALESCE(now_r.value, 0) < pre.value
     OR COALESCE(now_r.tier, 0)  < pre.tier;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Migration 046 aborted: % record rows moved downward (Rule 6)', v_bad;
  END IF;

  RAISE NOTICE 'Migration 046: World Serpent schema added; no player-owned value moved.';
END;
$$;

COMMIT;
