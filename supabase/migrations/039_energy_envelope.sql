-- Migration 039: Energy, redefined as the daily harvest envelope
--
-- Constitution §8.6; fixes GROUND_TRUTH §9.1 (purchased energy destroyed by
-- offline claims) and §9.2 (two competing restoration authorities) by
-- deleting the system that had those defects rather than patching it.
--
-- WHAT CHANGES
--
--   Energy stops being a balance and becomes a day-scoped allotment. The old
--   model was a stock (`players.energy`) topped up by a 20-minute drip, an
--   offline restore, purchases, a premium stipend, contracts, achievements,
--   the daily calendar and season tiers -- eight faucets and two independent
--   clocks writing one integer. The new model has no stock and no faucet:
--   a player's charges are DERIVED from `(charges_day, charges_used)` as
--   `charges_per_day - charges_used_today`, and the day rolling over at
--   00:00 UTC is the one and only refill authority.
--
--   Because there is no balance, there is nothing to grant. No purchase,
--   perk, stipend, streak, achievement, contract or season tier can add a
--   charge -- not because each path was audited, but because "add a charge"
--   is not an operation this schema supports (Constitution §10.4, Rule 3).
--
--   Energy also stops gating play. There is no run-start check anywhere:
--   every run starts, Scores, ranks and counts. A run that finds the day's
--   allotment empty settles at the lean harvest factor instead -- lean,
--   never zero, and never blocked.
--
-- WHAT IS DELIBERATELY *NOT* DONE HERE
--
--   `players.energy`, `players.max_energy` and `players.energy_regen_at` are
--   NOT dropped and NOT zeroed. Nothing reads them after this migration, but
--   Rule 6 ("everything earned is permanent") and forward-only data
--   preservation both say a column recording something a player paid for
--   does not get erased on the way past. They are marked deprecated below.
--   Their removal, together with the SQL faucets that still write them
--   (claim_daily_reward, claim_contract, claim_season_tier,
--   claim_clan_energy_bonus, grant_purchase_rewards), belongs to WP-0.03
--   (faucet purge) and WP-0.09 (commerce removal), which own those objects.
--
-- DOWN-NOTE (forward-only; this migration is not reversible in place)
--
--   To revert: drop `consume_run_charge`, drop the four added columns
--   (`players.charges_day`, `players.charges_used`, `game_sessions.
--   charge_state`, `game_sessions.yield_dna`), and restore
--   `claim_premium_stipend` from migration 028 lines 330-414. Player-owned
--   data survives a revert because this migration only ADDS columns and
--   never writes to existing ones; the dropped stipend function is
--   re-creatable verbatim from 028 and its claim history in
--   `premium_stipend_claims` is left untouched precisely so a revert can
--   read it. No player row is modified by this migration.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The charge ledger -- two columns, no balance
-- ---------------------------------------------------------------------------
--
-- `charges_day` is the UTC date `charges_used` counts against. A row whose
-- `charges_day` is not today reads as a full, untouched day; that IS the
-- refill. There is no cron, no timer and no scheduled job -- which means
-- there is nothing that can fail to run and leave a player short, and
-- nothing that can run twice and leave them long.
--
-- Rule 5 (absence is never destructive): `charges_used` never carries over
-- and never accumulates as debt. A player returning after thirty days opens
-- their day with exactly the same allotment as a player who never left.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS charges_day DATE,
  ADD COLUMN IF NOT EXISTS charges_used INTEGER NOT NULL DEFAULT 0
    CHECK (charges_used >= 0);

COMMENT ON COLUMN players.charges_day IS
  'UTC date that charges_used counts against (Constitution §8.6). NULL, or '
  'any past date, means the day is untouched: the allotment is full. '
  'Rolling over at 00:00 UTC is the ONLY refill authority in the product.';

COMMENT ON COLUMN players.charges_used IS
  'Charges consumed on charges_day. Written ONLY by consume_run_charge(). '
  'This is a usage counter, not a balance -- it is never credited, so no '
  'purchase, perk or reward can increase a player''s charges (§10.4).';

-- ---------------------------------------------------------------------------
-- 2. Deprecating the old model's columns (retained, not erased)
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN players.energy IS
  'DEPRECATED as of migration 039 (Constitution §8.6). No longer read or '
  'written by gameplay: runs are no longer gated by it and no longer '
  'consume it. Retained because it records purchased goods (Rule 6). '
  'Scheduled for removal with the faucets that write it (WP-0.03/WP-0.09).';

COMMENT ON COLUMN players.max_energy IS
  'DEPRECATED as of migration 039. Vestigial cap for the removed energy '
  'stock; nothing reads it. See players.energy.';

COMMENT ON COLUMN players.energy_regen_at IS
  'DEPRECATED as of migration 039. This was one of the two competing '
  'restoration clocks recorded in GROUND_TRUTH §9.2; both are gone. The '
  'envelope has a single refill authority (the UTC date) and stores no '
  'timestamp at all.';

-- ---------------------------------------------------------------------------
-- 3. How a run settled against the envelope, and what it was worth
-- ---------------------------------------------------------------------------
--
-- `charge_state` is stamped at run START from server-derived facts and read
-- back at settlement, so the outcome cannot drift if the ledger changes
-- mid-run and cannot be re-decided by a replayed end request.
--
-- NULL means the run started before this migration. Such a run settles at
-- FULL strength: a deploy boundary must never cut a player's harvest.
--
-- `yield_dna` is the run's full-strength economic total -- Yield (§6.2),
-- which is charge-independent by law. Depth, Mastery and every record read
-- this number; only the DNA actually credited is multiplied by the charge
-- factor. Recording it separately is what lets a lean run still count
-- full-strength everywhere it is supposed to.

ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS charge_state TEXT
    CHECK (charge_state IN ('charged', 'lean', 'exempt')),
  ADD COLUMN IF NOT EXISTS yield_dna INTEGER
    CHECK (yield_dna IS NULL OR yield_dna >= 0);

COMMENT ON COLUMN game_sessions.charge_state IS
  'How this run settles against the daily envelope (Constitution §8.6), '
  'stamped server-side at start. charged = a charge was consumed, full '
  'harvest. lean = the day''s allotment was empty; the run played and '
  'counted identically and harvested the lean factor. exempt = consumed no '
  'charge and harvested full strength (Signal objective run, Serpent '
  'attempt, or rewardless practice). NULL = run predates migration 039 and '
  'settles full-strength.';

COMMENT ON COLUMN game_sessions.yield_dna IS
  'Yield (Constitution §6.2): the run''s full-strength settled economic '
  'total, INDEPENDENT of charge state. Depth, Mastery and records read this '
  'number; game_sessions.dna_earned is what the balance was actually '
  'credited (Yield x the charge factor). On a charged or exempt run the two '
  'are equal; on a lean run dna_earned is the fraction and this stays whole.';

CREATE INDEX IF NOT EXISTS idx_game_sessions_charge_state
  ON game_sessions (player_id, charge_state)
  WHERE charge_state IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. consume_run_charge -- the only writer of the ledger
-- ---------------------------------------------------------------------------
--
-- Lazy: the day's reset happens here, on the first run of a new UTC day,
-- rather than on a schedule. Atomic: the row is locked FOR UPDATE so two
-- concurrent run starts can never both take the last charge.
--
-- This function NEVER blocks a run. When the allotment is spent it reports
-- charged = false and the caller starts the run anyway; the run then settles
-- lean. There is no failure mode in which a player is refused a game.
--
-- SECURITY DEFINER audit: this function writes `players.charges_used` for an
-- arbitrary player id, so it must not be reachable by a client. EXECUTE is
-- revoked from PUBLIC/anon/authenticated and granted only to service_role
-- (below), matching the service-role-only pattern used by the minting RPCs
-- in migrations 010 and 028. search_path is pinned so a caller-controlled
-- search_path cannot shadow `players`. p_charges_per_day is supplied by the
-- server from GAME_CONFIG (one source of truth for the [H] dial) and is
-- clamped to a sane floor here so a bad argument cannot silently zero the
-- day's allotment.

CREATE OR REPLACE FUNCTION consume_run_charge(
  p_player_id UUID,
  p_charges_per_day INTEGER DEFAULT 6
)
RETURNS TABLE (
  charged BOOLEAN,
  charges_day DATE,
  charges_used INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'utc')::DATE;
  v_per_day INTEGER := GREATEST(1, COALESCE(p_charges_per_day, 6));
  v_stored_day DATE;
  v_used INTEGER;
  v_charged BOOLEAN;
BEGIN
  SELECT p.charges_day, p.charges_used
    INTO v_stored_day, v_used
    FROM players p
   WHERE p.id = p_player_id
     FOR UPDATE;

  IF NOT FOUND THEN
    -- The caller has already established the player exists; reaching here
    -- means the row vanished mid-request. Raise rather than return a false
    -- 'not charged', which would settle a real run lean for a data fault.
    RAISE EXCEPTION 'consume_run_charge: player % not found', p_player_id;
  END IF;

  -- Lazy day roll-over: a stored day that is not today (or is NULL) is a
  -- fresh, full allotment. Note this RESETS the counter -- it never adds to
  -- a previous day's remainder, so charges cannot be banked.
  IF v_stored_day IS DISTINCT FROM v_today THEN
    v_used := 0;
  END IF;

  -- Defensive clamp: a negative or over-large stored counter could only ever
  -- cost the player, so it is normalised into the honest range.
  v_used := LEAST(GREATEST(COALESCE(v_used, 0), 0), v_per_day);

  IF v_used < v_per_day THEN
    v_used := v_used + 1;
    v_charged := TRUE;
  ELSE
    v_charged := FALSE;
  END IF;

  -- The day is always stamped, even on a lean run, so the ledger keeps
  -- pointing at the day it describes.
  UPDATE players p
     SET charges_day = v_today,
         charges_used = v_used
   WHERE p.id = p_player_id;

  RETURN QUERY SELECT v_charged, v_today, v_used;
END;
$$;

COMMENT ON FUNCTION consume_run_charge(UUID, INTEGER) IS
  'Consume one daily charge for a starting run (Constitution §8.6). The only '
  'writer of players.charges_used. Lazy (resets on first run of a new UTC '
  'day, no cron), atomic (FOR UPDATE), and never blocking: returns '
  'charged=false when the allotment is spent and the run starts anyway, '
  'settling lean. Service role only.';

REVOKE ALL ON FUNCTION consume_run_charge(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION consume_run_charge(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION consume_run_charge(UUID, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION consume_run_charge(UUID, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Retiring the premium stipend
-- ---------------------------------------------------------------------------
--
-- §8.6: "Energy is never sold, gifted, stipended, or touched by any SKU or
-- perk." The stipend was the one path by which a subscription reached the
-- pacing layer, and it is dropped rather than left unreferenced so that no
-- future route can call it back into service.
--
-- `premium_stipend_claims` is intentionally KEPT. It is a historical record
-- of what was granted to whom, it is what a revert would read, and deleting
-- an audit table to remove a feature is exactly the kind of quiet data loss
-- Rule 6 exists to prevent. Nothing writes it after this migration.

DROP FUNCTION IF EXISTS claim_premium_stipend(UUID);

COMMENT ON TABLE premium_stipend_claims IS
  'HISTORICAL ONLY as of migration 039. The premium energy stipend was '
  'retired under Constitution §8.6 (Energy is never sold, gifted or '
  'stipended) and its RPC dropped. Retained as an audit record of grants '
  'already made; nothing writes this table.';

COMMIT;
