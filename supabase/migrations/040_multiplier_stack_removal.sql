-- Migration 040: The account multiplier stack, deleted
--
-- Constitution §8.5 ("Deleted jobs: passive attendance income, set bonuses,
-- global streak multipliers, clan-duel multipliers"), Rule 8 (clans never
-- grade and never bill), Rule 12 (default to subtraction).
-- Closes GROUND_TRUTH §3.1 faucets #4-#6 and build-log finding F-6b.
--
-- WHAT CHANGES
--
--   A settled run is now worth its raw fold times the extraction outcome
--   multiplier -- BANK x1.25 or SALVAGE x0.60, plus the mutation/trait
--   shaping the ruleset already applies -- and nothing else. Three of the
--   four ways to raise DNA income had nothing to do with playing well:
--
--     * the streak tier   (x1.05 / x1.10 / x1.20 / x1.35 for showing up),
--     * the collection set bonus (+10% per fully-owned dynasty), and
--     * the clan-duel bonus (x1.05 clan-wide the week after a duel win).
--
--   All three are removed here and in `src/lib/server/dnaMultipliers.ts`,
--   which is deleted outright in the same change. The SQL objects that
--   existed only to feed them go with them, so the factors cannot be
--   re-wired into settlement by anyone who does not first re-add the
--   schema: there is no tier table to read and no bonus RPC to call.
--
--   `clan_duel_bonus` in particular was a live exploit, not merely dead
--   weight (F-6b). It resolved the bonus from CURRENT clan membership, so
--   a player could leave their clan, join whichever clan won last week,
--   and harvest +5% DNA they had not contributed to -- repeatable every
--   week. Rule 8 forbids intra-clan reward mathematics outright, which is
--   why the fix is deletion rather than a membership-at-settlement patch.
--
--   The play streak itself SURVIVES as a count and as a permanent record.
--   Only its payout factor dies. Its high-water mark is banked into the
--   `unbroken` Legacy Record below, and this migration asserts, before it
--   commits, that no player's banked value moved downward.
--
--   The Daily Take streak columns (§7.2) are added as SCHEMA ONLY -- no
--   trigger, no function, no default behaviour. WP-1.04 owns the Take.
--
-- WHAT IS DELIBERATELY *NOT* DONE HERE
--
--   `record_daily_play` still sets a broken streak to 1 rather than cooling
--   it by one tier (build-log F-10, Rule 5). That is WP-1.04's fix and its
--   logic is carried across byte-for-byte below; only the multiplier is
--   removed. `refresh_player_records` still upserts with
--   `SET value = EXCLUDED.value` and no `GREATEST()` (F-6) -- that is
--   WP-0.04's fix and is untouched here, which is exactly why the Legacy
--   Record backfill below banks its value directly and monotonically
--   instead of delegating to that function.
--
--   `get_clan_duel` still emits a `last_week.bonus_active` key. Its live
--   definition is a 200-line function owned by the gauntlet/season work;
--   re-declaring it to drop one JSONB key is not worth the risk. Nothing
--   reads the key any more (the API type marks it vestigial and the "+5%
--   DNA this week" badge is deleted from `DuelPanel.tsx`).
--
-- DEPLOY ORDER
--
--   Ship the application code FIRST, then apply this migration. The new
--   code neither selects `player_streaks.streak_multiplier` nor reads a
--   `streak_multiplier` column off the `record_daily_play` result, so
--   code-then-migration is safe in both directions; migration-then-code
--   would 500 `GET /api/daily-rewards` for the length of the deploy.
--
-- DOWN-NOTE (forward-only; this migration is not reversible in place)
--
--   To revert: re-create `clan_duel_bonus` verbatim from
--   `011_clan_duels.sql:399-437` plus its GRANT at :445; re-create
--   `streak_bonus_tiers` from `003_engagement_features.sql:142-153` with
--   the `013_design_v2_phase1.sql:55-58` retune applied; re-add
--   `player_streaks.streak_multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.0`;
--   and restore `record_daily_play` from `009_dynasty_unification.sql:
--   317-372`. The restored multiplier column would read 1.0 for every
--   player until the next `record_daily_play` call recomputed it -- an
--   acceptable loss because it is a derived cache of a catalogue table,
--   never an earned balance. NO PLAYER-OWNED VALUE IS DESTROYED BY THIS
--   MIGRATION: `current_streak`, `longest_streak`, `last_play_date`, the
--   grace flags and every `player_records` row are preserved, and the
--   `unbroken` backfill only ever writes upward.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Preservation snapshot -- taken BEFORE anything is written
-- ---------------------------------------------------------------------------
--
-- Rule 6 says no code path writes a player-owned row downward. This
-- migration proves it rather than asserting it in a comment: the pre-state
-- of every longest-streak value and every existing `unbroken` record is
-- captured here, and section 6 re-reads it and aborts the transaction if
-- anything ended lower than it started.

CREATE TEMP TABLE wp_0_02_streak_pre ON COMMIT DROP AS
SELECT
  ps.player_id,
  ps.longest_streak,
  COALESCE(pr.value, 0) AS record_value_before,
  COALESCE(pr.tier, 0)  AS record_tier_before
FROM player_streaks ps
LEFT JOIN player_records pr
  ON pr.player_id = ps.player_id
 AND pr.record_id = 'unbroken';

-- ---------------------------------------------------------------------------
-- 2. The clan-duel bonus -- deleted, RPC and all (Rule 8, finding F-6b)
-- ---------------------------------------------------------------------------
--
-- Dropping the function is safe for duel settlement: `clan_duel_bonus` only
-- ever called `settle_and_pair_duels()` opportunistically, and that function
-- is also driven from `get_clan_duel`, `join_clan`, the season maintenance
-- path and the premium stipend path (020:1119, 020:1420, 021:1338, 021:1487,
-- 022:973, 028:682). Nothing else in the schema references it.

DROP FUNCTION IF EXISTS clan_duel_bonus(UUID);

-- ---------------------------------------------------------------------------
-- 3. The streak DNA multiplier -- tier table and cached column, deleted
-- ---------------------------------------------------------------------------
--
-- `streak_bonus_tiers` is catalogue data (days -> DNA multiplier -> energy
-- bonus), not player property: no row in it belongs to anyone. Its only
-- reader was `record_daily_play`, re-declared in section 4 without it. The
-- energy bonus it also carried is doubly dead -- migration 039 removed the
-- energy stock those bonuses topped up.

DROP TABLE IF EXISTS streak_bonus_tiers;

-- `player_streaks.streak_multiplier` was a per-player CACHE of the row above,
-- recomputed from scratch on every play. It is not an earned balance and
-- nothing a player did or paid for is recorded in it. Dropping it is what
-- makes "no streak factor can re-enter settlement" structural rather than a
-- convention: there is no longer a column to read.

ALTER TABLE player_streaks DROP COLUMN IF EXISTS streak_multiplier;

-- ---------------------------------------------------------------------------
-- 4. record_daily_play -- the streak advances, it just stops paying
-- ---------------------------------------------------------------------------
--
-- Carried over from `009_dynasty_unification.sql:317-372` with exactly two
-- changes: the `streak_bonus_tiers` lookup and the `streak_multiplier`
-- write/return are gone. Every other line -- the advisory insert, the
-- FOR UPDATE lock, the consecutive/grace/broken branches, the
-- GREATEST(longest_streak, ...) high-water guard, the grace restoration
-- rule -- is byte-equivalent to the 009 body.
--
-- The return type changes (4 columns -> 3), so the old signature must be
-- dropped before the new one is created; CREATE OR REPLACE cannot do it.
--
-- F-10 (a broken streak resets to 1 instead of cooling one tier) is
-- PRESERVED here on purpose: Rule 5's forgiveness curve is WP-1.04's work,
-- and silently changing streak advancement inside a multiplier-removal
-- migration would hide it.

DROP FUNCTION IF EXISTS record_daily_play(UUID);

CREATE FUNCTION record_daily_play(p_player_id UUID)
RETURNS TABLE (
  current_streak INTEGER,
  longest_streak INTEGER,
  grace_consumed BOOLEAN
) AS $$
DECLARE
  v_row player_streaks%ROWTYPE;
  v_today DATE := CURRENT_DATE;
  v_grace_consumed BOOLEAN := false;
  v_new_streak INTEGER;
BEGIN
  INSERT INTO player_streaks (player_id, current_streak, longest_streak, last_play_date)
  VALUES (p_player_id, 0, 0, NULL)
  ON CONFLICT (player_id) DO NOTHING;

  SELECT * INTO v_row FROM player_streaks ps WHERE ps.player_id = p_player_id FOR UPDATE;

  IF v_row.last_play_date = v_today THEN
    v_new_streak := v_row.current_streak;             -- already counted today
  ELSIF v_row.last_play_date = v_today - 1 THEN
    v_new_streak := v_row.current_streak + 1;         -- consecutive day
  ELSIF v_row.last_play_date = v_today - 2 AND v_row.grace_period_available THEN
    v_new_streak := v_row.current_streak + 1;         -- one missed day forgiven
    v_grace_consumed := true;
  ELSIF v_row.last_play_date IS NULL THEN
    v_new_streak := 1;                                -- first ever play
  ELSE
    v_new_streak := 1;                                -- streak broken (F-10: WP-1.04)
  END IF;

  UPDATE player_streaks ps SET
    current_streak = v_new_streak,
    -- The high-water mark only ever rises (Rule 6). The `unbroken` Legacy
    -- Record is banked from this column, so this GREATEST is load-bearing.
    longest_streak = GREATEST(ps.longest_streak, v_new_streak),
    last_play_date = v_today,
    grace_period_available = CASE
      WHEN v_grace_consumed THEN false
      -- grace restores after 7 consecutive days of play
      WHEN v_new_streak >= 7 AND v_new_streak % 7 = 0 THEN true
      ELSE ps.grace_period_available
    END,
    grace_period_used = v_grace_consumed OR ps.grace_period_used,
    updated_at = NOW()
  WHERE ps.player_id = p_player_id;

  RETURN QUERY SELECT v_new_streak,
    (SELECT ps.longest_streak FROM player_streaks ps WHERE ps.player_id = p_player_id),
    v_grace_consumed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SECURITY DEFINER audit (Rule 11): advancing a streak is a progress
-- mutation, so it belongs to the server alone. 009 left this function with
-- Postgres' default PUBLIC execute grant, which let any authenticated
-- session advance its own streak directly through PostgREST. The only
-- caller is the service-role client in `POST /api/game/session`, which is
-- unaffected by these revocations.
REVOKE EXECUTE ON FUNCTION record_daily_play(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION record_daily_play(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION record_daily_play(UUID) FROM authenticated;

COMMENT ON FUNCTION record_daily_play(UUID) IS
  'Advances the daily play streak. WP-0.02: returns a COUNT only - the DNA tier multiplier it used to return was deleted with the account multiplier stack (Constitution §8.5). Service-role only.';

-- ---------------------------------------------------------------------------
-- 5. The longest streak, banked as a Legacy Record (Rule 6)
-- ---------------------------------------------------------------------------
--
-- The multiplier dies; the achievement does not. `unbroken` ("Longest login
-- streak (days)", veterancy, thresholds 7/14/30/60/120) already exists in
-- `record_definitions` from 023, but for most players it has only ever been
-- materialised as a side effect of a session ending. This backfills it for
-- every player who has ever held a streak, so the record is banked at the
-- moment its multiplier is taken away rather than at some later session.
--
-- The upsert is MONOTONIC by construction: `GREATEST` on both value and
-- tier. That matters because `refresh_player_records` (F-6, WP-0.04) still
-- overwrites with EXCLUDED and would happily write a shrinking aggregate
-- downward -- this migration deliberately does not depend on it.

INSERT INTO player_records (player_id, record_id, value, tier, updated_at)
SELECT
  ps.player_id,
  rd.id,
  ps.longest_streak,
  (SELECT COUNT(*) FROM unnest(rd.thresholds) th WHERE ps.longest_streak >= th),
  NOW()
FROM player_streaks ps
CROSS JOIN record_definitions rd
WHERE rd.id = 'unbroken'
  AND ps.longest_streak > 0
ON CONFLICT (player_id, record_id) DO UPDATE
  SET value      = GREATEST(player_records.value, EXCLUDED.value),
      tier       = GREATEST(player_records.tier, EXCLUDED.tier),
      updated_at = NOW();

-- Every tier the banked value has reached also owes its badge cosmetic.
-- Cumulative and idempotent, exactly as `refresh_player_records` grants them.
INSERT INTO player_cosmetics (player_id, cosmetic_id, source)
SELECT pr.player_id, 'record_unbroken_t' || t.tier, 'records'
FROM player_records pr
CROSS JOIN generate_series(1, 5) AS t(tier)
WHERE pr.record_id = 'unbroken'
  AND t.tier <= pr.tier
  AND EXISTS (
    SELECT 1 FROM cosmetic_definitions cd
    WHERE cd.id = 'record_unbroken_t' || t.tier
  )
ON CONFLICT (player_id, cosmetic_id) DO NOTHING;

-- Legacy score is the sum of banked tier points. Recomputed only for the
-- players this migration touched, and only ever upward.
UPDATE players p
SET legacy_score = GREATEST(p.legacy_score, banked.total)
FROM (
  SELECT pr.player_id,
         COALESCE(SUM(banked_tiers.points), 0)::INTEGER AS total
  FROM player_records pr
  JOIN record_definitions rd ON rd.id = pr.record_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(p), 0) AS points
    FROM unnest(rd.tier_points[1:pr.tier]) AS p
  ) banked_tiers
  WHERE pr.player_id IN (SELECT player_id FROM wp_0_02_streak_pre WHERE longest_streak > 0)
  GROUP BY pr.player_id
) banked
WHERE p.id = banked.player_id;

-- ---------------------------------------------------------------------------
-- 6. Preservation assertions -- the transaction aborts if any of these fail
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_lowered   BIGINT;
  v_missing   BIGINT;
  v_short     BIGINT;
BEGIN
  -- (a) Rule 6: nothing this migration wrote moved an owned row downward.
  SELECT COUNT(*) INTO v_lowered
  FROM wp_0_02_streak_pre pre
  JOIN player_records pr
    ON pr.player_id = pre.player_id AND pr.record_id = 'unbroken'
  WHERE pr.value < pre.record_value_before
     OR pr.tier  < pre.record_tier_before;
  IF v_lowered > 0 THEN
    RAISE EXCEPTION
      'WP-0.02 aborted: % unbroken record(s) would be written downward (Rule 6)', v_lowered;
  END IF;

  -- (b) Every player who ever held a streak now has the record banked.
  SELECT COUNT(*) INTO v_missing
  FROM wp_0_02_streak_pre pre
  WHERE pre.longest_streak > 0
    AND NOT EXISTS (
      SELECT 1 FROM player_records pr
      WHERE pr.player_id = pre.player_id AND pr.record_id = 'unbroken'
    );
  IF v_missing > 0 THEN
    RAISE EXCEPTION
      'WP-0.02 aborted: % player(s) lost their longest streak in the migration', v_missing;
  END IF;

  -- (c) The banked value is at least the streak it was migrated from.
  SELECT COUNT(*) INTO v_short
  FROM wp_0_02_streak_pre pre
  JOIN player_records pr
    ON pr.player_id = pre.player_id AND pr.record_id = 'unbroken'
  WHERE pr.value < pre.longest_streak;
  IF v_short > 0 THEN
    RAISE EXCEPTION
      'WP-0.02 aborted: % unbroken record(s) below the streak they were banked from', v_short;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Take-streak columns -- schema only, consumed by WP-1.04
-- ---------------------------------------------------------------------------
--
-- Constitution §7.2, the Daily Take: the first run of each UTC day pays a
-- bonus collected with one tap on that run's Results. Base 100 DNA,
-- multiplied by the Take streak -- 3 / 7 / 14 / 30 consecutive days ->
-- x1.25 / x1.5 / x2 / x3. A missed day cools the streak by ONE TIER and
-- never resets it to zero (Rule 5). The streak multiplies the Take ONLY:
-- never a run payout, never Yield, never anything else. Re-introducing it
-- as a global multiplier would re-create exactly what section 3 deleted.
--
-- NO BEHAVIOUR IS ADDED HERE. There is no trigger, no default write and no
-- function that touches these columns; WP-1.04 owns all of it. What this
-- section does contribute is the shape that makes Rule 5 hard to break:
-- the constraints below make "reset the streak to zero" and "claim a tier
-- you have not reached" unrepresentable, not merely discouraged.

ALTER TABLE player_streaks
  ADD COLUMN IF NOT EXISTS take_streak_days     INTEGER  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS take_tier            SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS take_longest_streak  INTEGER  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS take_last_claim_date DATE;

-- Tier 0 is the base Take (x1). Tiers 1-4 are the §7.2 ladder.
ALTER TABLE player_streaks
  DROP CONSTRAINT IF EXISTS player_streaks_take_tier_range;
ALTER TABLE player_streaks
  ADD CONSTRAINT player_streaks_take_tier_range
  CHECK (take_tier BETWEEN 0 AND 4);

-- A tier is never held without the days that earn it. Index is 1-based, so
-- tier 0 -> 0 days, tier 1 -> 3, tier 2 -> 7, tier 3 -> 14, tier 4 -> 30.
ALTER TABLE player_streaks
  DROP CONSTRAINT IF EXISTS player_streaks_take_tier_earned;
ALTER TABLE player_streaks
  ADD CONSTRAINT player_streaks_take_tier_earned
  CHECK (take_streak_days >= (ARRAY[0, 3, 7, 14, 30])[take_tier + 1]);

-- Rule 5, made structural: a player who has ever collected a Take has a
-- last-claim date, and a player who has a last-claim date has at least one
-- streak day. Cooling can therefore only ever walk the ladder down one rung
-- at a time -- it can never write the chain back to zero, because zero days
-- with a claim date on the row is not a state this table can hold.
ALTER TABLE player_streaks
  DROP CONSTRAINT IF EXISTS player_streaks_take_never_resets;
ALTER TABLE player_streaks
  ADD CONSTRAINT player_streaks_take_never_resets
  CHECK ((take_last_claim_date IS NULL) = (take_streak_days = 0));

-- Rule 6: the high-water mark is permanent and can never sit below the
-- current chain, so no cooling step can quietly erode it.
ALTER TABLE player_streaks
  DROP CONSTRAINT IF EXISTS player_streaks_take_high_water;
ALTER TABLE player_streaks
  ADD CONSTRAINT player_streaks_take_high_water
  CHECK (take_longest_streak >= take_streak_days AND take_longest_streak >= 0);

COMMENT ON COLUMN player_streaks.take_streak_days IS
  'Daily Take streak length in consecutive UTC days (Constitution §7.2). A missed day cools this to the previous tier threshold, never to 0 (Rule 5). WP-1.04 owns the write path.';
COMMENT ON COLUMN player_streaks.take_tier IS
  'Reached Take tier: 0 = base x1, 1-4 = the 3/7/14/30-day ladder (x1.25/x1.5/x2/x3). A missed day decrements by exactly 1, floored at 0.';
COMMENT ON COLUMN player_streaks.take_longest_streak IS
  'Permanent high-water mark of the Take streak (Rule 6). Only ever written upward.';
COMMENT ON COLUMN player_streaks.take_last_claim_date IS
  'UTC date of the last collected Daily Take. NULL means the player has never collected one; it is never cleared once set.';

COMMIT;
