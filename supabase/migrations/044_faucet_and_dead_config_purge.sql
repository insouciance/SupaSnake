-- ############################################################################
-- ##                                                                        ##
-- ##  MIGRATION 044 — NOT APPLIED TO ANY DATABASE BY THIS WORK PACKAGE.     ##
-- ##                                                                        ##
-- ##  WP-0.03 wrote and reviewed this file and deliberately did NOT run     ##
-- ##  `supabase db push`, `db reset`, `link` or `start`. It is committed    ##
-- ##  as the schema half of the change; applying it to staging and then     ##
-- ##  production is an owner decision, taken with the release runbook       ##
-- ##  (docs/ops/RELEASE_RUNBOOK.md) in hand.                                ##
-- ##                                                                        ##
-- ############################################################################
--
-- Migration 044: Faucet and dead-configuration purge
--
-- Authority: docs/PRODUCT_CONSTITUTION.md §4 (Rules 5, 6, 11), §8.5 (one
-- currency), §12.2 (one daily surface, one claim); GROUND_TRUTH §9.7, §9.8
-- and §10 (the dead-configuration table). Build-log findings F-14, F-15, F-16.
--
-- THE ONE RULE THIS MIGRATION APPLIES, STATED ONCE
--
--   Delete mechanisms and pure configuration. Preserve player-owned rows,
--   unless a row is provably redundant with a surviving audit record.
--
--   Every disposition below is that rule applied. It is what keeps a purge
--   compatible with Rule 5 (absence is never destructive) and Rule 6
--   (everything earned is permanent): the faucet goes, the receipt stays.
--
-- WHAT CHANGES
--
--   1. THE 28-DAY CALENDAR (GT §9.8, kill #8). `claim_daily_reward` was a
--      fully functional DNA + energy faucet with zero UI callers that any
--      client holding a token could call. Its route (`/api/daily-rewards`)
--      is deleted in this same commit; the RPC, the `daily_reward_tiers`
--      catalogue it paid from and the `daily_logins` ledger it wrote are
--      dropped here. §12.2 allows the product ONE daily surface and ONE
--      claim; both belong to the Signal and the Daily Take (WP-1.03/1.04).
--
--   2. THE CLAN ENERGY BONUS (GT §9.7, F-14, kill #9). `claim_clan_energy_bonus`
--      (migration 007) had no caller in `src/`, granted energy that no longer
--      exists as a balance, and matched on `WHERE user_id = p_player_id`
--      while every other RPC in the schema keys on `players.id` — so on the
--      day something had called it, it would have paid the wrong player or
--      nobody. The clan page rendered its promise twice and a Claim button
--      with no handler. Rule 8 forbids a clan number that pays; the function
--      is dropped and the copy is gone from `src/app/clan/page.tsx`.
--
--   3. DEAD CONTRACT ROWS AND THE DEAD CONTRACT PURSE (GT §10). The six
--      contracts seeded `active = false` in migration 015 (plus the six more
--      in 032) were never offerable; the unreferenced ones are deleted.
--      `contract_definitions.reward_energy` — a column whose grant path
--      executed on every claim while every seeded row held 0 — is dropped,
--      along with the `energy_granted` output of `claim_contract` and the
--      `reward_energy` column of the two board RPCs.
--
--   4. SEASON-TIER CURRENCY REWARDS (GT §10). `battle_pass_tiers` permitted
--      `reward_type IN ('dna','energy')` by CHECK and no tier has ever used
--      either. The CHECK is tightened to what the track actually pays
--      (variant / cosmetic / title / reroll_token) and the two dead grant
--      branches leave `claim_season_tier`, so the season track can no longer
--      become a currency faucet by seeding one row.
--
--   5. THE BOOTSTRAP RESPONSE STOPS LYING (F-16). `bootstrap_player` still
--      returned `energy` and `maxEnergy` in its JSON after migration 039
--      retired the stock, and `FtueBootstrapResponse` no longer declares
--      them. Both keys are removed, and neither `bootstrap_player` nor
--      `handle_new_user` names the energy columns in its INSERT any more.
--
-- WHAT IS DELIBERATELY *NOT* DONE HERE
--
--   `players.energy`, `players.max_energy` and `players.energy_regen_at`
--   are STILL not dropped. Migration 039 retained them under Rule 6 and
--   assigned their removal to WP-0.03/WP-0.09; WP-0.03 has now removed the
--   last thing that could write them and rules that they stay.
--
--   The reasoning, for the record: Rule 6 forbids any code path that
--   reduces or confiscates what a player earned, and `DROP COLUMN` is
--   exactly such a path — executed once, irreversibly, against the only
--   per-player record of a resource that could be bought while the SKUs
--   existed. What this work package is chartered to kill is the MECHANISM,
--   and after this migration the mechanism is entirely gone: zero writers,
--   zero readers, three frozen integers carrying COMMENTs that say so. That
--   is the Rule 6 end state, not a step toward one. Retaining them costs
--   three columns on one table; dropping them would have required rewriting
--   five SECURITY DEFINER functions — including `handle_new_user`, the
--   signup trigger — with no database to test against, which is a signup
--   outage wagered against tidiness. Rule 12's preference for subtraction
--   is about systems, not about archives.
--
--   `player_daily_state` (the calendar's per-player position and cycle
--   count) and `clan_members.last_clan_bonus_at` are likewise retained and
--   commented as frozen. They are player-owned rows whose mechanisms are
--   gone. `daily_logins` is the one player-scoped table this migration does
--   drop, and only because section 2 proves every row in it is duplicated by
--   a surviving `economy_transactions` receipt — and backfills the receipt
--   first if it is not.
--
--   Nothing in `economy_transactions`, `purchase_history`, `player_records`,
--   `player_achievements` or `player_contracts` is modified, anywhere.
--
-- SECURITY DEFINER AUDIT
--
--   Functions dropped: `claim_daily_reward(UUID)`, `claim_clan_energy_bonus(UUID)`
--   — both SECURITY DEFINER, both now unreachable from any route.
--   Functions re-created SECURITY DEFINER: `offer_daily_contracts(UUID)`,
--   `pick_contracts(UUID, TEXT[])`, `claim_contract(UUID, TEXT)`,
--   `claim_season_tier(UUID, INTEGER)`, `bootstrap_player(UUID)`,
--   `handle_new_user()`. Every one keeps the definer rights and the exact
--   EXECUTE grants it had before (`service_role` only for the five callable
--   RPCs, re-stated below because DROP+CREATE does not preserve privileges);
--   none gains a new capability, and each strictly loses one (the ability to
--   write `players.energy`). `handle_new_user` remains a trigger on
--   `auth.users` and is never granted to a client role.
--
-- DOWN-NOTE (forward-only; this migration is not reversible in place)
--
--   To revert:
--     * re-create `daily_reward_tiers` and `daily_logins` from migration
--       003 lines 7-32 and 45-58 (including their RLS policies at 003:224-258)
--       and `claim_daily_reward` from 009:380-459;
--     * re-create `claim_clan_energy_bonus` from 007:131-172;
--     * re-seed the deleted inactive contracts from 015:71-118 and 032:42-71
--       (this migration RAISEs the exact id list into the deploy log before
--       deleting, so the revert can be checked against it);
--     * `ALTER TABLE contract_definitions ADD COLUMN reward_energy INTEGER
--       NOT NULL DEFAULT 0 CHECK (reward_energy >= 0)` and restore
--       `offer_daily_contracts` from 032:285-360, `pick_contracts` from
--       043:103-180 and `claim_contract` from 017:258-355;
--     * restore the `battle_pass_tiers` CHECK from 021:90-92 and
--       `claim_season_tier` from 028:514-635;
--     * restore `bootstrap_player` from 037:33-251 and `handle_new_user`
--       from 001:221-229.
--   No player-owned row is destroyed by this migration except `daily_logins`,
--   whose content is duplicated in `economy_transactions` (asserted in
--   section 2) and therefore survives a revert as audit history. Player DNA,
--   energy, records, contracts and claims are asserted unchanged in section 9.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Pre-write snapshot — the numbers section 9 asserts against
-- ---------------------------------------------------------------------------
--
-- Following migrations 041 and 042: take the picture BEFORE anything moves,
-- so "nothing was destroyed" is a proven statement rather than an intention.
-- ON COMMIT DROP: these exist only for the length of the transaction.

CREATE TEMP TABLE wp_0_03_player_pre ON COMMIT DROP AS
SELECT
  p.id            AS player_id,
  p.dna           AS dna_before,
  p.energy        AS energy_before,
  p.max_energy    AS max_energy_before,
  p.total_dna_earned AS total_dna_earned_before
FROM players p;

CREATE TEMP TABLE wp_0_03_counts_pre ON COMMIT DROP AS
SELECT
  (SELECT COUNT(*) FROM economy_transactions)                         AS economy_rows,
  (SELECT COUNT(*) FROM player_contracts)                             AS player_contract_rows,
  (SELECT COUNT(*) FROM player_battle_pass_claims)                    AS season_claim_rows,
  (SELECT COUNT(*) FROM daily_logins)                                 AS daily_login_rows,
  (SELECT COUNT(*) FROM daily_logins WHERE reward_claimed)            AS daily_login_claims,
  (SELECT COALESCE(SUM(reward_dna), 0) FROM daily_logins
     WHERE reward_claimed)                                            AS daily_login_dna,
  (SELECT COALESCE(SUM(reward_energy), 0) FROM daily_logins
     WHERE reward_claimed)                                            AS daily_login_energy;

-- ---------------------------------------------------------------------------
-- 2. Before the calendar's ledger is dropped: prove the receipts exist
-- ---------------------------------------------------------------------------
--
-- `claim_daily_reward` wrote TWO records of the same event: an
-- `economy_transactions` row (the audit) and a `daily_logins` row (the
-- calendar's own ledger). Only the audit is referenced by anything that
-- survives, so `daily_logins` is redundant — but "should be redundant" is
-- not "is redundant", and F-15 recorded that other grant paths bypassed the
-- audit entirely. So: backfill any claim whose receipt is missing, THEN
-- assert coverage, THEN drop. Rule 6 is satisfied by the receipt, not by
-- the ledger.
--
-- A backfilled row carries `reconstructed: true` in its metadata because
-- `balance_after` cannot be recovered for a historical grant — the amount,
-- the day and the date are exact; the running balance is the player's
-- current one and is labelled as such. An honest reconstruction beats both
-- a silent lie and a lost record.

INSERT INTO economy_transactions
  (player_id, resource_type, amount, balance_after, source_type, metadata)
SELECT
  dl.player_id,
  'dna',
  dl.reward_dna,
  p.dna,
  'daily_reward',
  jsonb_build_object(
    'day', dl.reward_day,
    'login_date', dl.login_date,
    'migration', '044_faucet_and_dead_config_purge',
    'reconstructed', true,
    'note', 'backfilled receipt for a 28-day calendar claim that predated or bypassed the audit; balance_after is the balance at backfill time, not at grant time'
  )
FROM daily_logins dl
JOIN players p ON p.id = dl.player_id
WHERE dl.reward_claimed
  AND dl.reward_dna > 0
  AND NOT EXISTS (
    SELECT 1
    FROM economy_transactions et
    WHERE et.player_id = dl.player_id
      AND et.source_type = 'daily_reward'
      AND et.resource_type = 'dna'
      AND et.metadata ? 'day'
      AND (et.metadata ->> 'day') = dl.reward_day::text
      AND et.created_at::date = dl.login_date
  );

INSERT INTO economy_transactions
  (player_id, resource_type, amount, balance_after, source_type, metadata)
SELECT
  dl.player_id,
  'energy',
  dl.reward_energy,
  p.energy,
  'daily_reward',
  jsonb_build_object(
    'day', dl.reward_day,
    'login_date', dl.login_date,
    'migration', '044_faucet_and_dead_config_purge',
    'reconstructed', true,
    'note', 'backfilled receipt for a 28-day calendar energy grant; the energy stock itself was retired by migration 039'
  )
FROM daily_logins dl
JOIN players p ON p.id = dl.player_id
WHERE dl.reward_claimed
  AND dl.reward_energy > 0
  AND NOT EXISTS (
    SELECT 1
    FROM economy_transactions et
    WHERE et.player_id = dl.player_id
      AND et.source_type = 'daily_reward'
      AND et.resource_type = 'energy'
      AND et.metadata ? 'day'
      AND (et.metadata ->> 'day') = dl.reward_day::text
      AND et.created_at::date = dl.login_date
  );

DO $$
DECLARE
  v_unreceipted BIGINT;
  v_backfilled  BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_unreceipted
  FROM daily_logins dl
  WHERE dl.reward_claimed
    AND dl.reward_dna > 0
    AND NOT EXISTS (
      SELECT 1 FROM economy_transactions et
      WHERE et.player_id = dl.player_id
        AND et.source_type = 'daily_reward'
        AND et.resource_type = 'dna'
        AND et.metadata ? 'day'
        AND (et.metadata ->> 'day') = dl.reward_day::text
    );

  SELECT v_unreceipted + COUNT(*) INTO v_unreceipted
  FROM daily_logins dl
  WHERE dl.reward_claimed
    AND dl.reward_energy > 0
    AND NOT EXISTS (
      SELECT 1 FROM economy_transactions et
      WHERE et.player_id = dl.player_id
        AND et.source_type = 'daily_reward'
        AND et.resource_type = 'energy'
        AND et.metadata ? 'day'
        AND (et.metadata ->> 'day') = dl.reward_day::text
    );

  IF v_unreceipted > 0 THEN
    RAISE EXCEPTION
      'WP-0.03 aborted: % daily calendar claim(s) still have no economy_transactions receipt — refusing to drop daily_logins while it is the only record of a grant (Rule 6)',
      v_unreceipted;
  END IF;

  SELECT COUNT(*) INTO v_backfilled
  FROM economy_transactions et
  WHERE et.metadata ->> 'migration' = '044_faucet_and_dead_config_purge';

  RAISE NOTICE
    'WP-0.03: % daily_logins row(s), % claimed, % DNA and % energy granted over the calendar''s lifetime; % receipt(s) backfilled before the ledger was dropped',
    (SELECT daily_login_rows FROM wp_0_03_counts_pre),
    (SELECT daily_login_claims FROM wp_0_03_counts_pre),
    (SELECT daily_login_dna FROM wp_0_03_counts_pre),
    (SELECT daily_login_energy FROM wp_0_03_counts_pre),
    v_backfilled;
END $$;

-- ---------------------------------------------------------------------------
-- 3. The 28-day calendar, removed (GT §9.8, kill #8)
-- ---------------------------------------------------------------------------
--
-- Order matters: the function first, so nothing can write the tables between
-- the drop of one and the drop of the other.

DROP FUNCTION IF EXISTS claim_daily_reward(UUID);

DROP TABLE IF EXISTS daily_logins;

-- Pure catalogue: 28 rows of DNA and energy amounts for a faucet that no
-- longer exists. No row in it belonged to a player.
DROP TABLE IF EXISTS daily_reward_tiers;

-- Retained (see the header's rule): this holds each player's position in the
-- retired cycle and how many cycles they completed. Nothing reads it now and
-- nothing writes it; it is history, and history stays.
COMMENT ON TABLE player_daily_state IS
  'FROZEN as of migration 044 (WP-0.03). Per-player position in the retired '
  '28-day login calendar. The calendar''s claim RPC, tier catalogue and login '
  'ledger were removed with the faucet; these rows are kept as history under '
  'Rule 6 and are read by nothing. Do not build on this table — the product''s '
  'one daily surface is the Signal and its one claim is the Daily Take (§12.2).';

-- ---------------------------------------------------------------------------
-- 4. The clan energy bonus, removed (GT §9.7, F-14, kill #9)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS claim_clan_energy_bonus(UUID);

COMMENT ON COLUMN clan_members.last_clan_bonus_at IS
  'FROZEN as of migration 044 (WP-0.03). Last claim time of the removed clan '
  'energy bonus (claim_clan_energy_bonus, migration 007 — an orphan faucet '
  'with no caller in src/, which also keyed on user_id where every other RPC '
  'keys on players.id). Retained as history; written and read by nothing. '
  'Rule 8: a clan never pays.';

-- ---------------------------------------------------------------------------
-- 5. Inactive contract rows (GT §10)
-- ---------------------------------------------------------------------------
--
-- `active = false` contracts are seeded with real DNA rewards and are never
-- offered — `offer_daily_contracts` filters on `cd.active`. They read as a
-- live pool to anyone opening the table.
--
-- A definition that some player_contracts row still points at is NOT deleted:
-- the FK is a plain reference with no ON DELETE, so removing it would either
-- fail or orphan a player's history. Those are deactivated in place and
-- named in the log instead. In practice no inactive contract can have been
-- offered, so the exclusion should match nothing — it is here so that the
-- statement is safe rather than merely lucky.

DO $$
DECLARE
  v_deletable TEXT[];
  v_referenced TEXT[];
BEGIN
  SELECT COALESCE(array_agg(cd.id ORDER BY cd.id), ARRAY[]::TEXT[])
  INTO v_deletable
  FROM contract_definitions cd
  WHERE cd.active IS NOT TRUE
    AND NOT EXISTS (
      SELECT 1 FROM player_contracts pc WHERE pc.contract_id = cd.id
    );

  SELECT COALESCE(array_agg(cd.id ORDER BY cd.id), ARRAY[]::TEXT[])
  INTO v_referenced
  FROM contract_definitions cd
  WHERE cd.active IS NOT TRUE
    AND EXISTS (
      SELECT 1 FROM player_contracts pc WHERE pc.contract_id = cd.id
    );

  DELETE FROM contract_definitions cd WHERE cd.id = ANY(v_deletable);

  RAISE NOTICE
    'WP-0.03: deleted % inactive contract definition(s): %. Retained % inactive definition(s) referenced by player history: %',
    COALESCE(array_length(v_deletable, 1), 0), v_deletable,
    COALESCE(array_length(v_referenced, 1), 0), v_referenced;
END $$;

-- ---------------------------------------------------------------------------
-- 6. The contract energy purse (GT §10)
-- ---------------------------------------------------------------------------
--
-- Every seeded row held 0, and the grant path ran anyway on every claim:
-- read the column, clamp it against `max_energy - energy`, write `players`,
-- write an audit row. Four operations to move zero. §8.6 leaves nothing for
-- it to move even in principle.
--
-- Dropping the column changes the return signature of three RPCs, so each is
-- DROPped and re-created rather than REPLACEd; the grants that DROP discards
-- are re-stated immediately after each one.

DO $$
DECLARE
  v_nonzero BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_nonzero
  FROM contract_definitions WHERE COALESCE(reward_energy, 0) <> 0;
  IF v_nonzero > 0 THEN
    RAISE EXCEPTION
      'WP-0.03 aborted: % contract definition(s) carry a non-zero reward_energy — a live purse, not dead config; escalate before dropping the column',
      v_nonzero;
  END IF;
END $$;

ALTER TABLE contract_definitions DROP COLUMN IF EXISTS reward_energy;

-- 6a. offer_daily_contracts — body carried over verbatim from migration 032
--     (lines 285-360). The only edits are the removal of `reward_energy`
--     from the RETURNS TABLE and from the final RETURN QUERY.

DROP FUNCTION IF EXISTS offer_daily_contracts(UUID);

CREATE FUNCTION offer_daily_contracts(p_player_id UUID)
RETURNS TABLE (
  contract_id TEXT,
  contract_type TEXT,
  name TEXT,
  description TEXT,
  params JSONB,
  reward_dna INTEGER,
  reward_xp INTEGER,
  offered_slot INTEGER,
  picked BOOLEAN,
  progress JSONB,
  completed_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ
) AS $$
#variable_conflict use_column
DECLARE
  v_date DATE := CURRENT_DATE;
  v_banked_runs INTEGER := 0;
  v_max_mastery INTEGER := 0;
BEGIN
  PERFORM 1 FROM players WHERE id = p_player_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  SELECT COUNT(*)::int INTO v_banked_runs
  FROM game_sessions gs
  WHERE gs.player_id = p_player_id
    AND gs.ended_at IS NOT NULL
    AND gs.validated IS TRUE
    AND gs.is_free_play IS NOT TRUE
    AND gs.extracted;

  SELECT COALESCE(MAX(level_for_xp(pm.xp)), 0)::int INTO v_max_mastery
  FROM player_mastery pm
  WHERE pm.player_id = p_player_id;

  IF NOT EXISTS (
    SELECT 1 FROM player_contracts pc
    WHERE pc.player_id = p_player_id AND pc.contract_date = v_date
  ) THEN
    INSERT INTO player_contracts (player_id, contract_date, contract_id, offered_slot)
    SELECT p_player_id, v_date, t.id, t.slot
    FROM (
      SELECT cd.id,
             ROW_NUMBER() OVER (
               ORDER BY md5(p_player_id::text || v_date::text || cd.id), cd.id
             )::int AS slot
      FROM contract_definitions cd
      WHERE cd.active
        AND CASE cd.contract_type
          WHEN 'strain_genes_banked' THEN v_banked_runs >= 4
          WHEN 'expression_triggered' THEN v_banked_runs >= 8
          WHEN 'infuses_banked' THEN v_banked_runs >= 10
          WHEN 'splice_discovered' THEN v_banked_runs >= 15
          WHEN 'apex_reached' THEN v_banked_runs >= 20 OR v_max_mastery >= 3
          ELSE TRUE
        END
    ) t
    WHERE t.slot <= 3
    ON CONFLICT (player_id, contract_date, contract_id) DO NOTHING;
  END IF;

  PERFORM refresh_contract_progress(p_player_id, v_date);

  RETURN QUERY
  SELECT pc.contract_id, cd.contract_type, cd.name, cd.description, cd.params,
         cd.reward_dna, cd.reward_xp,
         pc.offered_slot, pc.picked, pc.progress, pc.completed_at, pc.claimed_at
  FROM player_contracts pc
  JOIN contract_definitions cd ON cd.id = pc.contract_id
  WHERE pc.player_id = p_player_id AND pc.contract_date = v_date
  ORDER BY pc.offered_slot;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION offer_daily_contracts(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION offer_daily_contracts(UUID) TO service_role;

-- 6b. pick_contracts — body carried over verbatim from migration 043
--     (lines 103-180), including the flat `v_max := 2` that WP-0.09
--     established and the comment forbidding an entitlement branch. The only
--     edits are the two `reward_energy` removals.

DROP FUNCTION IF EXISTS pick_contracts(UUID, TEXT[]);

CREATE FUNCTION pick_contracts(p_player_id UUID, p_contract_ids TEXT[])
RETURNS TABLE (
  contract_id TEXT,
  contract_type TEXT,
  name TEXT,
  description TEXT,
  params JSONB,
  reward_dna INTEGER,
  reward_xp INTEGER,
  offered_slot INTEGER,
  picked BOOLEAN,
  progress JSONB,
  completed_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ
) AS $$
#variable_conflict use_column
DECLARE
  v_date DATE := CURRENT_DATE;
  v_count INTEGER := COALESCE(array_length(p_contract_ids, 1), 0);
  v_already INTEGER;
  v_pickable INTEGER;
  -- Flat for every player: no entitlement branch, and no call to the premium
  -- entitlement check. Constitution §10.4 puts progression rates on the
  -- never-sold list. Keep in lockstep with
  -- ENGAGEMENT_CONFIG.contracts.picksPerDay.
  v_max INTEGER := 2;
BEGIN
  IF v_count < 1 OR v_count > v_max THEN
    RAISE EXCEPTION 'Pick 1 to % contracts', v_max;
  END IF;
  IF (SELECT COUNT(DISTINCT x) FROM unnest(p_contract_ids) x) <> v_count THEN
    RAISE EXCEPTION 'Duplicate contract ids';
  END IF;

  -- Row-lock today's board so concurrent picks serialize
  PERFORM 1 FROM player_contracts pc
  WHERE pc.player_id = p_player_id AND pc.contract_date = v_date
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No contracts offered today';
  END IF;

  SELECT COUNT(*)::int INTO v_already
  FROM player_contracts pc
  WHERE pc.player_id = p_player_id AND pc.contract_date = v_date AND pc.picked;

  IF v_already + v_count > v_max THEN
    RAISE EXCEPTION 'Pick limit reached (% per day)', v_max;
  END IF;

  SELECT COUNT(*)::int INTO v_pickable
  FROM player_contracts pc
  WHERE pc.player_id = p_player_id AND pc.contract_date = v_date
    AND pc.contract_id = ANY(p_contract_ids)
    AND NOT pc.picked;

  IF v_pickable <> v_count THEN
    RAISE EXCEPTION 'Contract not offered today';
  END IF;

  UPDATE player_contracts pc SET picked = true, picked_at = NOW()
  WHERE pc.player_id = p_player_id AND pc.contract_date = v_date
    AND pc.contract_id = ANY(p_contract_ids);

  PERFORM refresh_contract_progress(p_player_id, v_date);

  RETURN QUERY
  SELECT pc.contract_id, cd.contract_type, cd.name, cd.description, cd.params,
         cd.reward_dna, cd.reward_xp,
         pc.offered_slot, pc.picked, pc.progress, pc.completed_at, pc.claimed_at
  FROM player_contracts pc
  JOIN contract_definitions cd ON cd.id = pc.contract_id
  WHERE pc.player_id = p_player_id AND pc.contract_date = v_date
  ORDER BY pc.offered_slot;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION pick_contracts(UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pick_contracts(UUID, TEXT[]) TO service_role;

-- 6c. claim_contract — body carried over verbatim from migration 017
--     (lines 258-355). Removed: `energy_granted` from the RETURNS TABLE, the
--     `v_energy_grant` clamp, the `energy = energy + v_energy_grant` write
--     and the energy audit row. Every lock, guard, exception string, the
--     server recompute and the season-XP block are carryovers. A contract
--     now grants DNA and season XP, and nothing else.

DROP FUNCTION IF EXISTS claim_contract(UUID, TEXT);

CREATE FUNCTION claim_contract(p_player_id UUID, p_contract_id TEXT)
RETURNS TABLE (
  contract_id TEXT,
  dna_granted INTEGER,
  xp_granted INTEGER
) AS $$
#variable_conflict use_column
DECLARE
  v_date DATE := CURRENT_DATE;
  v_pc player_contracts%ROWTYPE;
  v_def contract_definitions%ROWTYPE;
  v_player RECORD;
  v_season RECORD;
  v_new_dna INTEGER;
  v_xp INTEGER := 0;
BEGIN
  SELECT * INTO v_pc FROM player_contracts pc
  WHERE pc.player_id = p_player_id
    AND pc.contract_date = v_date
    AND pc.contract_id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not offered today';
  END IF;
  IF NOT v_pc.picked THEN
    RAISE EXCEPTION 'Contract not picked';
  END IF;
  IF v_pc.claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Contract already claimed';
  END IF;

  -- Server recompute at claim time - never trust cached progress
  PERFORM refresh_contract_progress(p_player_id, v_date);
  SELECT * INTO v_pc FROM player_contracts pc WHERE pc.id = v_pc.id;

  IF v_pc.completed_at IS NULL THEN
    RAISE EXCEPTION 'Contract not complete';
  END IF;

  SELECT * INTO v_def FROM contract_definitions cd WHERE cd.id = p_contract_id;

  SELECT * INTO v_player FROM players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  UPDATE players
  SET dna = dna + v_def.reward_dna
  WHERE id = p_player_id
  RETURNING dna INTO v_new_dna;

  IF v_def.reward_dna > 0 THEN
    INSERT INTO economy_transactions (player_id, resource_type, amount, balance_after, source_type, metadata)
    VALUES (p_player_id, 'dna', v_def.reward_dna, v_new_dna, 'daily_reward',
            jsonb_build_object('contract', p_contract_id, 'contract_date', v_date));
  END IF;

  -- Season-track XP: only when a season is live; nothing accrues (and
  -- nothing is lost - contracts remain daily) outside seasons.
  SELECT * INTO v_season FROM battle_pass_seasons s
  WHERE s.is_active AND NOW() >= s.starts_at AND NOW() < s.ends_at
  ORDER BY s.season_number DESC
  LIMIT 1;

  IF FOUND THEN
    v_xp := v_def.reward_xp;
    INSERT INTO player_battle_pass (player_id, season_id, current_xp, current_level)
    VALUES (
      p_player_id, v_season.id, v_xp,
      LEAST(v_season.max_level, 1 + v_xp / v_season.xp_per_level)
    )
    ON CONFLICT (player_id, season_id) DO UPDATE SET
      current_xp = player_battle_pass.current_xp + v_xp,
      current_level = LEAST(
        v_season.max_level,
        1 + (player_battle_pass.current_xp + v_xp) / v_season.xp_per_level
      ),
      updated_at = NOW();
  END IF;

  UPDATE player_contracts pc SET claimed_at = NOW() WHERE pc.id = v_pc.id;

  RETURN QUERY SELECT p_contract_id, v_def.reward_dna, v_xp;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION claim_contract(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_contract(UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Season tiers stop being able to pay currency (GT §10)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_currency_tiers BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_currency_tiers
  FROM battle_pass_tiers WHERE reward_type IN ('dna', 'energy');
  IF v_currency_tiers > 0 THEN
    RAISE EXCEPTION
      'WP-0.03 aborted: % season tier(s) actually pay dna/energy — that is a live faucet, not dead config; escalate before tightening the CHECK',
      v_currency_tiers;
  END IF;
END $$;

ALTER TABLE battle_pass_tiers DROP CONSTRAINT IF EXISTS battle_pass_tiers_reward_type_check;
ALTER TABLE battle_pass_tiers ADD CONSTRAINT battle_pass_tiers_reward_type_check
  CHECK (reward_type IN ('variant', 'cosmetic', 'title', 'reroll_token'));

COMMENT ON COLUMN battle_pass_tiers.reward_type IS
  'What a season tier pays. `dna` and `energy` were permitted by CHECK from '
  'migration 021 and used by no tier ever seeded (GROUND_TRUTH §10); WP-0.03 '
  'removed both, so the season track cannot become a currency faucet by '
  'seeding one row. The track pays identity and continuity: a variant, a '
  'cosmetic, a title, or a trait-reroll token.';

-- claim_season_tier — body carried over verbatim from migration 028
-- (lines 514-635). Removed: the `dna` and `energy` grant branches and the
-- `v_energy_grant` / `v_new_dna` locals they used. Every entitlement rule,
-- the lapsed-subscriber goodwill clause, the free-then-premium claim order,
-- the idempotency check and the cosmetic/title inventory grant are
-- carryovers. The signature is unchanged, so this is a REPLACE.

CREATE OR REPLACE FUNCTION claim_season_tier(p_player_id UUID, p_level INTEGER)
RETURNS JSONB AS $$
DECLARE
  v_season battle_pass_seasons%ROWTYPE;
  v_tier battle_pass_tiers%ROWTYPE;
  v_pbp player_battle_pass%ROWTYPE;
  v_player RECORD;
  v_tokens INTEGER;
  v_has_premium BOOLEAN;
BEGIN
  SELECT * INTO v_season FROM battle_pass_seasons s
  WHERE s.is_active AND NOW() >= s.starts_at AND NOW() < s.ends_at
  ORDER BY s.season_number DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_ACTIVE_SEASON';
  END IF;

  SELECT * INTO v_pbp FROM player_battle_pass pbp
  WHERE pbp.player_id = p_player_id AND pbp.season_id = v_season.id;

  v_has_premium := has_premium(p_player_id);

  -- Free tier at the level, else the premium tier when entitled
  SELECT * INTO v_tier FROM battle_pass_tiers t
  WHERE t.season_id = v_season.id AND t.level = p_level
    AND (
      t.is_premium = false
      OR v_has_premium
      OR (v_pbp.id IS NOT NULL AND v_pbp.is_premium)
    )
  ORDER BY t.is_premium ASC;  -- claim free first; a second call claims premium
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_TIER_AT_LEVEL';
  END IF;

  SELECT * INTO v_player FROM players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAYER_NOT_FOUND';
  END IF;

  IF v_pbp.id IS NULL OR v_pbp.current_level < p_level THEN
    RAISE EXCEPTION 'LEVEL_NOT_REACHED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM player_battle_pass_claims c
    WHERE c.player_id = p_player_id AND c.tier_id = v_tier.id
  ) THEN
    -- The free tier at this level is claimed - try the premium tier
    SELECT * INTO v_tier FROM battle_pass_tiers t
    WHERE t.season_id = v_season.id AND t.level = p_level AND t.is_premium = true
      AND (v_has_premium OR v_pbp.is_premium)
      AND NOT EXISTS (
        SELECT 1 FROM player_battle_pass_claims c
        WHERE c.player_id = p_player_id AND c.tier_id = t.id
      );
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ALREADY_CLAIMED';
    END IF;
  END IF;

  -- Lock in the season for subscribers claiming premium tiers (goodwill
  -- rule: a season entered premium stays premium for this player)
  IF v_tier.is_premium AND v_has_premium AND NOT v_pbp.is_premium THEN
    UPDATE player_battle_pass
    SET is_premium = true,
        premium_purchased_at = COALESCE(premium_purchased_at, NOW()),
        updated_at = NOW()
    WHERE id = v_pbp.id;
  END IF;

  -- The only quantity a tier can pay. WP-0.03 removed the `dna` and
  -- `energy` branches that stood here; the CHECK on reward_type no longer
  -- permits either, so re-adding a branch would grant a type that cannot
  -- be seeded.
  IF v_tier.reward_type = 'reroll_token' THEN
    UPDATE players
    SET player_reroll_tokens = player_reroll_tokens + COALESCE(v_tier.reward_amount, 1)
    WHERE id = p_player_id
    RETURNING player_reroll_tokens INTO v_tokens;
  END IF;

  -- Identity v1 (022): cosmetic/title rewards become INVENTORY the equip
  -- flow can read - the claim row remains the claim-idempotency record.
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
    'is_premium', v_tier.is_premium,
    'reward_type', v_tier.reward_type,
    'reward_id', v_tier.reward_id,
    'reward_amount', v_tier.reward_amount,
    'reroll_tokens', v_tokens
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 8. The bootstrap response stops lying (F-16)
-- ---------------------------------------------------------------------------
--
-- bootstrap_player — body carried over verbatim from migration 037
-- (lines 33-246). Two edits: `energy` and `maxEnergy` leave the returned
-- `player` object, and the new-player INSERT no longer names the energy
-- columns (they keep their table defaults, which nothing reads). Every lock,
-- repair decision, starter grant and equip normalization is a carryover.

CREATE OR REPLACE FUNCTION bootstrap_player(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_player players%ROWTYPE;
  v_settings player_settings%ROWTYPE;
  v_snake collected_snakes%ROWTYPE;
  v_variant snake_variants%ROWTYPE;
  v_dynasty dynasties%ROWTYPE;
  v_player_inserted BOOLEAN := false;
  v_settings_inserted BOOLEAN := false;
  v_had_snakes BOOLEAN := false;
  v_starter_granted BOOLEAN := false;
  v_equipment_repaired BOOLEAN := false;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  -- Transaction-scoped lock: repeated browser requests and concurrent edge
  -- instances serialize for one identity without blocking other players.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

  SELECT * INTO v_player
  FROM players
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO players (user_id, dna)
    VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING * INTO v_player;

    v_player_inserted := FOUND;

    IF NOT v_player_inserted THEN
      SELECT * INTO STRICT v_player
      FROM players
      WHERE user_id = p_user_id
      FOR UPDATE;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM collected_snakes WHERE player_id = v_player.id
  ) INTO v_had_snakes;

  SELECT * INTO v_settings
  FROM player_settings
  WHERE player_id = v_player.id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- If ownership already exists, infer the dynasty from the active/equipped
    -- or oldest snake rather than imposing the new-player default.
    SELECT d.name INTO v_dynasty.name
    FROM collected_snakes cs
    JOIN snake_variants sv ON sv.id = cs.snake_variant_id
    JOIN dynasties d ON d.id = sv.dynasty_id
    WHERE cs.player_id = v_player.id
    ORDER BY cs.is_equipped DESC, cs.acquired_at ASC, cs.id ASC
    LIMIT 1;

    INSERT INTO player_settings (player_id, selected_dynasty)
    VALUES (v_player.id, COALESCE(v_dynasty.name, 'PRIMAL'))
    ON CONFLICT (player_id) DO NOTHING
    RETURNING * INTO v_settings;

    v_settings_inserted := FOUND;

    IF NOT v_settings_inserted THEN
      SELECT * INTO STRICT v_settings
      FROM player_settings
      WHERE player_id = v_player.id
      FOR UPDATE;
    END IF;
  END IF;

  -- Preserve the current choice. active_snake_id is preferred when it is
  -- still owned; otherwise keep an equipped snake, then repair from existing
  -- ownership before considering a starter grant.
  SELECT cs.* INTO v_snake
  FROM collected_snakes cs
  WHERE cs.player_id = v_player.id
  ORDER BY
    CASE WHEN cs.id = v_settings.active_snake_id THEN 0 ELSE 1 END,
    CASE WHEN cs.is_equipped THEN 0 ELSE 1 END,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM snake_variants selected_sv
        JOIN dynasties selected_d ON selected_d.id = selected_sv.dynasty_id
        WHERE selected_sv.id = cs.snake_variant_id
          AND selected_d.name = v_settings.selected_dynasty
      ) THEN 0 ELSE 1
    END,
    cs.acquired_at ASC,
    cs.id ASC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT sv.* INTO v_variant
    FROM snake_variants sv
    JOIN dynasties d ON d.id = sv.dynasty_id
    WHERE d.name = 'PRIMAL'
      AND d.is_active = true
      AND sv.is_starter = true
      AND sv.is_active = true
    ORDER BY sv.sort_order ASC, sv.id ASC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Active PRIMAL starter is missing from the catalog';
    END IF;

    INSERT INTO collected_snakes (
      player_id,
      snake_variant_id,
      generation,
      acquired_method,
      is_equipped,
      is_favorited,
      traits,
      lineage
    ) VALUES (
      v_player.id,
      v_variant.id,
      1,
      'tutorial',
      true,
      false,
      ARRAY[]::TEXT[],
      NULL
    )
    RETURNING * INTO v_snake;

    v_starter_granted := true;
    v_equipment_repaired := true;

    SELECT * INTO STRICT v_dynasty
    FROM dynasties
    WHERE id = v_variant.dynasty_id;
  ELSE
    v_equipment_repaired :=
      v_settings.active_snake_id IS DISTINCT FROM v_snake.id
      OR NOT COALESCE(v_snake.is_equipped, false)
      OR EXISTS (
        SELECT 1
        FROM collected_snakes cs
        WHERE cs.player_id = v_player.id
          AND cs.is_equipped = true
          AND cs.id <> v_snake.id
      );

    SELECT sv.* INTO STRICT v_variant
    FROM snake_variants sv
    WHERE sv.id = v_snake.snake_variant_id;

    SELECT * INTO STRICT v_dynasty
    FROM dynasties
    WHERE id = v_variant.dynasty_id;
  END IF;

  -- A single statement normalizes accidental historical multi-equipped rows.
  UPDATE collected_snakes
  SET is_equipped = (id = v_snake.id)
  WHERE player_id = v_player.id
    AND is_equipped IS DISTINCT FROM (id = v_snake.id);

  UPDATE player_settings
  SET active_snake_id = v_snake.id,
      selected_dynasty = CASE
        WHEN v_starter_granted THEN 'PRIMAL'
        WHEN v_settings_inserted THEN v_dynasty.name
        ELSE selected_dynasty
      END
  WHERE player_id = v_player.id
  RETURNING * INTO v_settings;

  -- `energy` and `maxEnergy` used to be reported here. Migration 039
  -- retired the stock they described and FtueBootstrapResponse stopped
  -- declaring them; the keys outlived both (F-16). A charge allotment is
  -- DERIVED from (charges_day, charges_used) and is read from its own
  -- endpoint - it is never a field of the player object.
  RETURN jsonb_build_object(
    'player', jsonb_build_object(
      'id', v_player.id,
      'dna', v_player.dna,
      'highScore', v_player.high_score,
      'totalGamesPlayed', v_player.total_games_played
    ),
    'equippedSnake', jsonb_build_object(
      'id', v_snake.id,
      'variantId', v_variant.id,
      'name', v_variant.name,
      'dynasty', v_dynasty.name,
      'generation', v_snake.generation,
      'traits', COALESCE(to_jsonb(v_snake.traits), '[]'::JSONB),
      'lineage', COALESCE(
        v_snake.lineage,
        jsonb_build_object(
          'strains', jsonb_build_array(v_variant.lineage_strain),
          'strength', v_variant.affinity_strength
        )
      )
    ),
    'onboarding', jsonb_build_object(
      'version', 2,
      'isNewPlayer', v_player_inserted OR NOT v_had_snakes,
      'starterGranted', v_starter_granted,
      'equipmentRepaired', v_equipment_repaired,
      'hasCompletedFirstRun', v_player.total_games_played > 0,
      'needsStarterSelection', false
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION bootstrap_player(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION bootstrap_player(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION bootstrap_player(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION bootstrap_player(UUID) TO service_role;

-- handle_new_user — the signup trigger, carried over from migration 001
-- (lines 221-229) with the two energy columns removed from the INSERT.
-- Seeding a five-unit stock that nothing can spend, read or display is the
-- last remaining write to the retired model.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.players (user_id, dna)
  VALUES (NEW.id, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 9. The retired energy stock: frozen, not erased (Rule 6)
-- ---------------------------------------------------------------------------
--
-- Migration 039 marked these DEPRECATED and named the five faucets that
-- still wrote them. All five are now gone: `claim_premium_stipend` (039),
-- `grant_purchase_rewards` (043), and `claim_daily_reward`,
-- `claim_clan_energy_bonus` plus the energy branches of `claim_contract` and
-- `claim_season_tier` (this migration). The comments are updated to say
-- FROZEN rather than DEPRECATED, because the difference matters to the next
-- person who opens this table: deprecated invites removal, frozen states a
-- decision.

COMMENT ON COLUMN players.energy IS
  'FROZEN as of migration 044 (WP-0.03). The retired energy stock '
  '(Constitution §8.6). Zero writers and zero readers remain anywhere in the '
  'product: the last five faucets were removed by migrations 039, 043 and '
  '044. Retained, NOT dropped, because it records what a player held and '
  'could once have paid for, and Rule 6 makes that permanent. Do not read '
  'it, do not write it, and do not resurrect it: the day''s charges are '
  'DERIVED from (charges_day, charges_used) and cannot be granted.';

COMMENT ON COLUMN players.max_energy IS
  'FROZEN as of migration 044. Vestigial cap of the retired energy stock. '
  'See players.energy.';

COMMENT ON COLUMN players.energy_regen_at IS
  'FROZEN as of migration 044. One of the two competing restoration clocks '
  'recorded in GROUND_TRUTH §9.2; both are gone. The envelope has a single '
  'refill authority (the UTC date) and stores no timestamp at all.';

-- ---------------------------------------------------------------------------
-- 10. Preservation assertions — the transaction aborts if any of these fail
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_bad          BIGINT;
  v_pre          RECORD;
  v_backfilled   BIGINT;
BEGIN
  SELECT * INTO v_pre FROM wp_0_03_counts_pre;

  SELECT COUNT(*) INTO v_backfilled
  FROM economy_transactions et
  WHERE et.metadata ->> 'migration' = '044_faucet_and_dead_config_purge';

  -- (a) Rule 6, the headline: not one player's DNA moved. This migration
  --     removes faucets; it neither pays nor charges.
  SELECT COUNT(*) INTO v_bad
  FROM wp_0_03_player_pre pre
  JOIN players p ON p.id = pre.player_id
  WHERE p.dna <> pre.dna_before
     OR p.total_dna_earned <> pre.total_dna_earned_before;
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'WP-0.03 aborted: % player(s) had DNA written by a purge (Rule 6)', v_bad;
  END IF;

  -- (b) The frozen stock is frozen. If this fails, something still writes it.
  SELECT COUNT(*) INTO v_bad
  FROM wp_0_03_player_pre pre
  JOIN players p ON p.id = pre.player_id
  WHERE p.energy IS DISTINCT FROM pre.energy_before
     OR p.max_energy IS DISTINCT FROM pre.max_energy_before;
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'WP-0.03 aborted: % player(s) had the retired energy stock written', v_bad;
  END IF;

  -- (c) No player row was lost.
  SELECT COUNT(*) INTO v_bad
  FROM wp_0_03_player_pre pre
  LEFT JOIN players p ON p.id = pre.player_id
  WHERE p.id IS NULL;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'WP-0.03 aborted: % player row(s) disappeared', v_bad;
  END IF;

  -- (d) The audit only ever grows, and it grew by exactly the backfill.
  SELECT COUNT(*) INTO v_bad FROM economy_transactions;
  IF v_bad <> v_pre.economy_rows + v_backfilled THEN
    RAISE EXCEPTION
      'WP-0.03 aborted: economy_transactions went from % to % rows with % backfills — the audit was modified',
      v_pre.economy_rows, v_bad, v_backfilled;
  END IF;

  -- (e) Contract history is intact: deleting definitions must not have
  --     cascaded into a player's board or claim history.
  SELECT COUNT(*) INTO v_bad FROM player_contracts;
  IF v_bad <> v_pre.player_contract_rows THEN
    RAISE EXCEPTION
      'WP-0.03 aborted: player_contracts went from % to % rows — contract history was destroyed (Rule 6)',
      v_pre.player_contract_rows, v_bad;
  END IF;

  -- (f) Season claim history is intact.
  SELECT COUNT(*) INTO v_bad FROM player_battle_pass_claims;
  IF v_bad <> v_pre.season_claim_rows THEN
    RAISE EXCEPTION
      'WP-0.03 aborted: player_battle_pass_claims went from % to % rows (Rule 6)',
      v_pre.season_claim_rows, v_bad;
  END IF;

  -- (g) No orphan: every board row still resolves to a definition.
  SELECT COUNT(*) INTO v_bad
  FROM player_contracts pc
  LEFT JOIN contract_definitions cd ON cd.id = pc.contract_id
  WHERE cd.id IS NULL;
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'WP-0.03 aborted: % player contract row(s) no longer resolve to a definition', v_bad;
  END IF;

  RAISE NOTICE
    'WP-0.03 complete: two faucet RPCs dropped (claim_daily_reward, claim_clan_energy_bonus), two calendar tables dropped, the contract and season-tier energy purses removed. % player(s) checked; 0 DNA moved; % audit receipt(s) backfilled.',
    (SELECT COUNT(*) FROM wp_0_03_player_pre),
    v_backfilled;
END $$;

COMMIT;
