-- Migration 050: The Daily Take — the game's one collect (WP-1.04)
--
-- Constitution §7.2: "The first run of each UTC day pays a bonus, collected
-- with one satisfying tap on that run's Results — attached to playing, never
-- to logging in. Base 100 DNA, multiplied by the Take streak: consecutive days
-- grow it through tiers — 3 / 7 / 14 / 30 days → ×1.25 / ×1.5 / ×2 / ×3. A
-- missed day cools the streak by one tier; it never resets to zero. The streak
-- multiplies the Take only — never run payouts, never Yield, never anything
-- else."
--
-- WHAT CHANGES
--
--   One function: `collect_daily_take(UUID)`. It is the ONLY thing in the
--   product that reads or writes migration 041's four `take_*` columns, and it
--   is the game's single sanctioned claim (§12.2). WP-0.02 built the shape;
--   this migration adds the behaviour and nothing else — no table, no column,
--   no trigger, no scheduled job.
--
--   `record_daily_play` is re-declared to close finding F-10, which the build
--   log assigns to this work package (§7 of `docs/ops/CONSTITUTION_BUILD_LOG.md`,
--   findings table). See section 4.
--
--   `economy_transactions.source_type` gains `daily_take` so the collect has an
--   audit row. The list is carried forward from migration 049 verbatim with one
--   value added; nothing is removed.
--
-- WHAT IS DELIBERATELY *NOT* DONE HERE
--
--   No second claim. §12.2 caps the game at one, and `faucetPurge.test.ts`
--   pins the pre-existing exception (`/api/player/claim-offline`) so the list
--   of claim-shaped routes can only shrink. This migration adds one RPC that
--   one route calls; it does not resurrect `claim_daily_reward`,
--   `claim_contract`, `claim_season_tier` or `claim_clan_energy_bonus`, all of
--   which were dropped by 043/044/049 and stay dropped.
--
--   No multiplier reaches settlement. The tier factor below is applied to the
--   literal constant `c_base` and to nothing else; there is no parameter on
--   `collect_daily_take` through which a run, a session, a Yield or a Score
--   could be passed, and the function contains no read of `game_sessions`.
--   WP-0.02 deleted the account multiplier stack precisely so no factor could
--   re-enter the fold, and this one structurally cannot.
--
--   No charge is granted, consumed or exempted. §8.6/§10.4: "add a charge" is
--   not an operation the schema supports, and this migration does not make it
--   one. `players.charges_day` and `players.charges_used` are not named below.
--
--   No player-owned row is read, written or backfilled AT APPLY TIME. Sections
--   1–5 create and re-create functions and adjust one CHECK constraint; there
--   is no UPDATE, INSERT or DELETE against `players`, `player_streaks` or any
--   other player-owned table outside a function body. A snapshot guard would
--   have nothing to snapshot, so section 1 asserts the *shape* this migration
--   depends on instead, and aborts the transaction if WP-0.02's constraints are
--   missing or have been relaxed.
--
-- DOWN-NOTE (forward-only; this migration is not reversible in place)
--
--   To revert: `DROP FUNCTION IF EXISTS collect_daily_take(UUID);`, restore
--   `record_daily_play` verbatim from migration 041 lines 157-217 (its
--   `ELSE v_new_streak := 1;` branch is the only difference), and re-apply
--   migration 049's `economy_transactions_source_type_check` list without
--   `daily_take`. Player-owned data survives a revert: no `take_*` column is
--   dropped, no `player_streaks` row is deleted, and every Take already
--   collected keeps its DNA, its `economy_transactions` row and its chain —
--   what a player has is permanent (Rule 6), including through a rollback.
--   Rows whose `source_type` is `daily_take` are NOT deleted on revert; the
--   CHECK is only enforced on write, so the history stays readable.

BEGIN;

-- ===========================================================================
-- 1. Pre-flight — WP-0.02's shape must be present and unrelaxed
-- ===========================================================================
--
-- Everything below is written to be caught by migration 041's CHECK
-- constraints if it is ever wrong: a cooling step that tried to write the
-- chain back to zero, or a tier the days had not earned, would raise rather
-- than corrupt. That safety net is only real if the constraints are actually
-- there, so this asserts them by name before defining anything that depends on
-- them. A missing one aborts the whole migration.

DO $$
DECLARE
  v_missing TEXT[] := ARRAY[]::TEXT[];
  v_name    TEXT;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'take_streak_days', 'take_tier', 'take_longest_streak', 'take_last_claim_date'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'player_streaks'
        AND column_name = v_name
    ) THEN
      v_missing := v_missing || v_name;
    END IF;
  END LOOP;

  FOREACH v_name IN ARRAY ARRAY[
    'player_streaks_take_tier_range',
    'player_streaks_take_tier_earned',
    'player_streaks_take_never_resets',
    'player_streaks_take_high_water'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'player_streaks' AND c.conname = v_name AND c.contype = 'c'
    ) THEN
      v_missing := v_missing || v_name;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'WP-1.04 aborted: migration 041''s Take shape is missing or relaxed (%). '
      'The Daily Take relies on those CHECK constraints to make a reset-to-zero '
      'and an unearned tier unrepresentable (Rule 5); do not restore them by '
      'weakening them.', array_to_string(v_missing, ', ');
  END IF;
END $$;

-- ===========================================================================
-- 2. The audit source — one new value, nothing removed
-- ===========================================================================
--
-- Carried forward from 049 verbatim, plus `daily_take`. A collect writes
-- exactly one `economy_transactions` row, in the same shape every other DNA
-- grant in the product writes, so the Take is auditable from the same ledger
-- as everything else and cannot become an off-book faucet.

ALTER TABLE economy_transactions DROP CONSTRAINT IF EXISTS economy_transactions_source_type_check;
ALTER TABLE economy_transactions ADD CONSTRAINT economy_transactions_source_type_check CHECK (source_type IN (
  'game_reward',
  'breeding_cost',
  'purchase',
  'daily_reward',
  'game_start',
  'energy_regen',
  'admin_grant',
  'refund',
  'achievement_reward',
  'streak_bonus',
  'battle_pass_reward',
  'offline_claim',
  'unlock_cost',
  'clan_tithe',
  'premium_stipend',
  'lineage_reroll',
  'codex_discovery',
  'reroll_token_conversion',
  'signal_bonus',
  'daily_take'
));

-- ===========================================================================
-- 3. `collect_daily_take` — the game's one claim
-- ===========================================================================
--
-- THE DAY IS DERIVED HERE, NOT PASSED IN (Rule 11)
--
-- The signature takes a player and nothing else. There is no parameter for a
-- date, an amount, a tier, a multiplier or a streak length, so a caller —
-- route, cron, replayed request or crafted payload — cannot name the day it
-- wants to collect, cannot ask for a bigger Take, and cannot back-collect a
-- day it missed. `v_today` comes from this transaction's own clock in UTC,
-- which is the §7.1 day boundary for the whole world.
--
-- A SECOND CALL GRANTS NOTHING (the acceptance criterion)
--
-- Three independent things have to fail before a double collect is possible:
--
--   1. The player row is locked FOR UPDATE first, so two concurrent collects
--      for the same player run one after the other rather than interleaving.
--   2. The `player_streaks` row is then locked FOR UPDATE, and the early
--      return below refuses a row whose `take_last_claim_date` is already
--      today (or, defensively, in the future).
--   3. The write itself is a COMPARE-AND-SET, not a blind UPDATE: its WHERE
--      clause re-states `take_last_claim_date IS NULL OR < v_today`, and the
--      DNA credit happens only if that UPDATE touched a row. There is no
--      `+=` anywhere in this function that is not guarded by that row count.
--
-- Nothing in the surface is trusted for any of it: a client that calls the
-- collect endpoint ten times in the same second gets one payment and nine
-- answers that say the day is settled.
--
-- WHAT IT CANNOT DO
--
-- It cannot pay more than ×3 of a hard-coded 100 (both the base and the
-- multiplier ladder are CONSTANTs here, not parameters). It cannot pay a run —
-- it never reads `game_sessions` and takes no session id. It cannot write a
-- cosmetic, an entitlement, a subscription, a charge or a Score: no such
-- statement exists below. And it cannot walk the chain to zero — the cooling
-- branch floors at one day, and migration 041's CHECK would raise if it
-- somehow did not.

CREATE OR REPLACE FUNCTION collect_daily_take(p_player_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- §7.2's ladder, byte-identical to `src/shared/game/dailyTake.ts` and to
  -- migration 041's `player_streaks_take_tier_earned` CHECK. Postgres arrays
  -- are 1-based, so tier N reads index N+1.
  c_base         CONSTANT INTEGER   := 100;
  c_thresholds   CONSTANT INTEGER[] := ARRAY[0, 3, 7, 14, 30];
  c_multipliers  CONSTANT NUMERIC[] := ARRAY[1, 1.25, 1.5, 2, 3];

  v_today        DATE := (NOW() AT TIME ZONE 'utc')::DATE;
  v_player_id    UUID;
  v_row          player_streaks%ROWTYPE;
  v_prior_days   INTEGER;
  v_prior_tier   INTEGER;
  v_cooled_tier  INTEGER;
  v_days         INTEGER;
  v_tier         INTEGER;
  v_longest      INTEGER;
  v_cooled       BOOLEAN := FALSE;
  v_amount       INTEGER := 0;
  v_written      INTEGER := 0;
  v_new_dna      INTEGER;
BEGIN
  -- ---- LOCK 1: the player -----------------------------------------------
  --
  -- Taken first and always, even on the already-collected path, because the
  -- DNA credit below reads and writes this row. The lock ORDER (player, then
  -- chain) matches `settle_signal_objective_run`, the only other function that
  -- takes both, so the two cannot deadlock against each other.
  SELECT pl.id INTO v_player_id FROM players pl WHERE pl.id = p_player_id FOR UPDATE;
  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'collect_daily_take: unknown player %', p_player_id;
  END IF;

  -- The chain row, created if this player has never had one. DO NOTHING, so
  -- an existing chain is never overwritten by the act of collecting.
  INSERT INTO player_streaks (player_id, current_streak, longest_streak, last_play_date)
  VALUES (p_player_id, 0, 0, NULL)
  ON CONFLICT (player_id) DO NOTHING;

  -- ---- LOCK 2: the chain -------------------------------------------------
  SELECT * INTO v_row FROM player_streaks ps
  WHERE ps.player_id = p_player_id
  FOR UPDATE;

  -- ---- Guard: the day is already settled ---------------------------------
  --
  -- `>=` rather than `=` on purpose: a stored date in the future (clock skew,
  -- a restored backup, a hand-edited row) must not become a free Take. The
  -- defensive direction is always "grant nothing" — an unpaid Take is
  -- recoverable on the next call, a twice-paid one is not.
  IF v_row.take_last_claim_date IS NOT NULL AND v_row.take_last_claim_date >= v_today THEN
    SELECT COALESCE(MAX(i - 1), 0) INTO v_prior_tier
    FROM generate_subscripts(c_thresholds, 1) AS i
    WHERE c_thresholds[i] <= v_row.take_streak_days;

    RETURN jsonb_build_object(
      'collected',         FALSE,
      'already_collected', TRUE,
      'amount',            0,
      'tier',              v_prior_tier,
      'multiplier',        c_multipliers[v_prior_tier + 1],
      'streak_days',       v_row.take_streak_days,
      'longest_streak',    v_row.take_longest_streak,
      'cooled',            FALSE,
      'day',               v_today,
      'dna',               (SELECT pl.dna FROM players pl WHERE pl.id = p_player_id)
    );
  END IF;

  -- ---- The transition ----------------------------------------------------
  --
  -- The prior tier is RE-DERIVED from the stored day count rather than read
  -- from `take_tier`. The column and the derivation agree by CHECK, but a
  -- derived value cannot be nudged upward by a bad write, and cooling is the
  -- one place where reading a too-high tier would over-pay.
  v_prior_days := GREATEST(COALESCE(v_row.take_streak_days, 0), 0);
  SELECT COALESCE(MAX(i - 1), 0) INTO v_prior_tier
  FROM generate_subscripts(c_thresholds, 1) AS i
  WHERE c_thresholds[i] <= v_prior_days;

  IF v_row.take_last_claim_date IS NULL THEN
    -- The first Take a player ever collects. One day, tier 0, ×1 — never
    -- zero days, which `player_streaks_take_never_resets` forbids alongside a
    -- claim date.
    v_days := 1;
  ELSIF v_row.take_last_claim_date = v_today - 1 THEN
    v_days := v_prior_days + 1;
  ELSE
    -- Rule 5, one rung, however long the absence was. §7.1 prices a missed
    -- day at "the day's Take, its charges, and one streak tier" — singular —
    -- so a player back after a month loses one tier, not thirty. The chain
    -- restarts at the cooled tier's own threshold, floored at one day so the
    -- write is a state this table can hold.
    v_cooled      := TRUE;
    v_cooled_tier := GREATEST(v_prior_tier - 1, 0);
    v_days        := GREATEST(c_thresholds[v_cooled_tier + 1], 1);
  END IF;

  SELECT COALESCE(MAX(i - 1), 0) INTO v_tier
  FROM generate_subscripts(c_thresholds, 1) AS i
  WHERE c_thresholds[i] <= v_days;

  -- The tier multiplies THIS constant and nothing else in the database.
  v_amount := FLOOR(c_base * c_multipliers[v_tier + 1])::INTEGER;

  -- ---- The compare-and-set ----------------------------------------------
  --
  -- The WHERE clause is the idempotency anchor, not the guard above: even if
  -- the guard were removed, a second call in the same day would match zero
  -- rows here and pay nothing. `take_longest_streak` moves only upward
  -- (Rule 6), so cooling can never erode the high-water mark.
  UPDATE player_streaks ps SET
    take_streak_days     = v_days,
    take_tier            = v_tier,
    take_longest_streak  = GREATEST(COALESCE(ps.take_longest_streak, 0), v_days),
    take_last_claim_date = v_today,
    updated_at           = NOW()
  WHERE ps.player_id = p_player_id
    AND (ps.take_last_claim_date IS NULL OR ps.take_last_claim_date < v_today);
  GET DIAGNOSTICS v_written = ROW_COUNT;

  IF v_written = 0 THEN
    -- Lost the race to a concurrent collect that committed first. Nothing is
    -- granted; the caller is told the day is settled, exactly as a replay is.
    RETURN jsonb_build_object(
      'collected',         FALSE,
      'already_collected', TRUE,
      'amount',            0,
      'tier',              v_prior_tier,
      'multiplier',        c_multipliers[v_prior_tier + 1],
      'streak_days',       v_prior_days,
      'longest_streak',    COALESCE(v_row.take_longest_streak, 0),
      'cooled',            FALSE,
      'day',               v_today,
      'dna',               (SELECT pl.dna FROM players pl WHERE pl.id = p_player_id)
    );
  END IF;

  SELECT ps.take_longest_streak INTO v_longest
  FROM player_streaks ps WHERE ps.player_id = p_player_id;

  -- ---- The credit --------------------------------------------------------
  --
  -- Reached only when the compare-and-set above claimed the day. DNA is the
  -- product's one currency (§12.2); this adds to the balance and to the
  -- lifetime total, in the same shape `settle_signal_objective_run` uses.
  UPDATE players pl
  SET dna              = pl.dna + v_amount,
      total_dna_earned = COALESCE(pl.total_dna_earned, 0) + v_amount
  WHERE pl.id = p_player_id
  RETURNING pl.dna INTO v_new_dna;

  INSERT INTO economy_transactions
    (player_id, resource_type, amount, balance_after, source_type, source_id, metadata)
  VALUES (
    p_player_id, 'dna', v_amount, COALESCE(v_new_dna, 0), 'daily_take', NULL,
    jsonb_build_object(
      'day',          v_today,
      'base_dna',     c_base,
      'tier',         v_tier,
      'multiplier',   c_multipliers[v_tier + 1],
      'streak_days',  v_days,
      'cooled',       v_cooled
    )
  );

  RETURN jsonb_build_object(
    'collected',         TRUE,
    'already_collected', FALSE,
    'amount',            v_amount,
    'tier',              v_tier,
    'multiplier',        c_multipliers[v_tier + 1],
    'streak_days',       v_days,
    'longest_streak',    COALESCE(v_longest, v_days),
    'cooled',            v_cooled,
    'day',               v_today,
    'dna',               COALESCE(v_new_dna, 0)
  );
END;
$$ LANGUAGE plpgsql;

-- SECURITY DEFINER audit (Rule 11). This function moves DNA, so it belongs to
-- the server alone: an `authenticated` PostgREST session that could execute it
-- would be able to collect its own Take without ever playing, which is exactly
-- the "attached to logging in" shape §7.2 rules out. Its only caller is the
-- service-role client in `POST /api/daily-take/collect`, unaffected by these
-- revocations.
REVOKE ALL ON FUNCTION collect_daily_take(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION collect_daily_take(UUID) FROM anon;
REVOKE ALL ON FUNCTION collect_daily_take(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION collect_daily_take(UUID) TO service_role;

COMMENT ON FUNCTION collect_daily_take(UUID) IS
  'The Daily Take (Constitution §7.2) — the game''s ONE claim (§12.2). Derives today from its own UTC clock, cools a missed chain by exactly one tier and never to zero (Rule 5), and pays 100 DNA times the tier multiplier through a compare-and-set under a row lock, so a second call in the same day grants nothing. Service-role only.';

-- ===========================================================================
-- 4. Finding F-10 — a broken play streak cooled, not reset
-- ===========================================================================
--
-- `docs/ops/CONSTITUTION_BUILD_LOG.md` findings table, F-10: "record_daily_play
-- (009:347) resets a broken streak to 1. Rule 5 allows the loss of exactly one
-- tier, never a reset to zero. → WP-1.04 (owns Take streak)". Migration 041
-- carried the defect forward UNCHANGED and said so in a comment, because
-- burying a Rule 5 change inside a multiplier-removal migration would have
-- hidden it. This is the work package it was left for.
--
-- The fix is the ONE branch that was wrong, and it applies the Take's own
-- ladder rather than inventing a second forgiveness curve (§14 forbids a
-- second streak layer, and two different cooling rules for two streaks would
-- be exactly that): a broken chain drops to the previous tier's threshold
-- instead of to 1.
--
-- Every other line is byte-equivalent to 041's body — the advisory insert, the
-- FOR UPDATE lock, the consecutive and grace branches, the GREATEST high-water
-- guard, the grace restoration rule, the return shape. The signature and
-- return type are unchanged, so `CREATE OR REPLACE` is enough and no caller
-- moves.
--
-- The change can only write the streak UP relative to today's behaviour (a
-- broken 30-day chain lands on 14 where it used to land on 1), so it cannot
-- reduce anything a player holds. `longest_streak` still passes through
-- GREATEST, so the `unbroken` Legacy Record is untouched either way (Rule 6).

CREATE OR REPLACE FUNCTION record_daily_play(p_player_id UUID)
RETURNS TABLE (
  current_streak INTEGER,
  longest_streak INTEGER,
  grace_consumed BOOLEAN
) AS $$
DECLARE
  -- The same ladder `collect_daily_take` uses. One forgiveness curve, not two.
  c_thresholds CONSTANT INTEGER[] := ARRAY[0, 3, 7, 14, 30];
  v_row player_streaks%ROWTYPE;
  v_today DATE := CURRENT_DATE;
  v_grace_consumed BOOLEAN := false;
  v_new_streak INTEGER;
  v_broken_tier INTEGER;
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
    -- F-10, closed: cool by ONE tier to that tier's threshold. Floored at 1,
    -- so a broken chain is never written to zero (Rule 5).
    SELECT COALESCE(MAX(i - 1), 0) INTO v_broken_tier
    FROM generate_subscripts(c_thresholds, 1) AS i
    WHERE c_thresholds[i] <= GREATEST(COALESCE(v_row.current_streak, 0), 0);
    v_new_streak := GREATEST(c_thresholds[GREATEST(v_broken_tier, 1)], 1);
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

-- Migration 041's revocations are re-stated, because CREATE OR REPLACE keeps
-- existing grants but a future reader must not have to know that to be sure.
REVOKE EXECUTE ON FUNCTION record_daily_play(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION record_daily_play(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION record_daily_play(UUID) FROM authenticated;

COMMENT ON FUNCTION record_daily_play(UUID) IS
  'Advances the daily play streak. WP-0.02: returns a COUNT only - the DNA tier multiplier it used to return was deleted with the account multiplier stack (Constitution §8.5). WP-1.04 (F-10): a broken chain now cools by one tier to that tier''s threshold instead of resetting to 1 (Rule 5). Service-role only.';

COMMIT;
