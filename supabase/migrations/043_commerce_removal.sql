-- ############################################################################
-- ##                                                                        ##
-- ##  MIGRATION 042 — NOT APPLIED TO ANY DATABASE BY THIS WORK PACKAGE.     ##
-- ##                                                                        ##
-- ##  WP-0.09 wrote and reviewed this file and deliberately did NOT run     ##
-- ##  `supabase db push`, `db reset`, `link` or `start`. It is committed    ##
-- ##  as the schema half of the change; applying it to staging and then     ##
-- ##  production is an owner decision, taken with the release runbook       ##
-- ##  (docs/ops/RELEASE_RUNBOOK.md) in hand.                                ##
-- ##                                                                        ##
-- ############################################################################
--
-- Migration 042: Commerce removal — the server side
--
-- Authority: docs/PRODUCT_CONSTITUTION.md §10.2 (what SupaSnake sells),
-- §10.4 (the never-sold list) and Rule 3 (money touches no computed number).
-- docs/game/MONETIZATION_DESIGN.md is SUPERSEDED (Constitution §15).
--
-- WHAT CHANGES
--
--   1. `grant_purchase_rewards` is dropped. It was the SQL faucet a one-time
--      purchase used to reach `players.energy`, `players.dna` and
--      `collected_snakes` — the exact three things §10.4 forbids selling.
--      Migration 039 named this function and assigned its removal to WP-0.09;
--      this is that removal. Its five callers-by-SKU (the energy packs and
--      the two bundles) no longer exist in code, and the webhook no longer
--      calls it: `checkout.session.completed` with `mode=payment` is now
--      recorded, escalated to Sentry and refused.
--
--   2. `pick_contracts` loses its entitlement branch. Migration 028 raised
--      the daily pick limit from 2 to 3 while `has_premium()`; §10.4 puts
--      progression rates on the never-sold list, so the limit is flat 2 for
--      everyone. The body below is migration 028's, byte-for-byte, with
--      exactly one line changed (`v_max`) — every lock, guard, exception
--      string and RETURN QUERY is a carryover. 042 is now the owner.
--
-- WHAT IS DELIBERATELY *NOT* DONE HERE
--
--   Nothing a player received is touched (Rule 6: everything earned is
--   permanent). `purchase_history`, `stripe_events`, `economy_transactions`,
--   `player_cosmetics`, `collected_snakes` and `premium_stipend_claims` are
--   read-only history and are not altered, deleted or rewritten. Removing a
--   SKU from sale is not confiscating what was sold. Stripe is in test mode
--   and no real purchase has settled, but the rule would hold either way.
--
--   `players.energy`, `players.max_energy` and `players.energy_regen_at`
--   stay deprecated-but-present, exactly as migration 039 left them.
--
--   The premium season track (`claim_season_tier`, `player_battle_pass.
--   is_premium`) is untouched. The false "Season Pass included" advertisement
--   is removed from the product copy in this work package because Season 1
--   seeds no premium tiers; the mechanism itself is real, harmless and is
--   Phase 3's to redesign under §10.2.
--
--   `premium_cosmetic_drops` / `premium_drop_claims` are untouched: the
--   monthly cosmetic drop is the one Keeper perk §10.2 keeps, and Phase 3
--   builds on this plumbing.
--
-- DOWN-NOTE (forward-only; not reversible in place)
--
--   To revert: re-create `grant_purchase_rewards` verbatim from migration
--   010 lines 38-167 (its text is unchanged history and its idempotency
--   guard reads `stripe_events`, which this migration does not touch), and
--   re-create `pick_contracts` verbatim from migration 028 lines 427-500.
--   No player row is read or written by this migration, so a revert loses
--   nothing.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The purchase faucet
-- ---------------------------------------------------------------------------
--
-- Dropped rather than left unreferenced, so that no future route can call it
-- back into service. The signature is spelled out in full because 010 is the
-- only migration that ever declared it and the argument list is the identity
-- of the function.

DROP FUNCTION IF EXISTS grant_purchase_rewards(
  TEXT, UUID, TEXT, INT, INT, TEXT[], TEXT, TEXT, INT, TEXT
);

COMMENT ON TABLE purchase_history IS
  'HISTORICAL as of migration 042. One-time SKUs were deleted under '
  'Constitution §10.4 and grant_purchase_rewards, the RPC that wrote this '
  'table, was dropped. Retained in full as the record of what each player '
  'bought and received (Rule 6); nothing writes it today. The Atelier '
  '(§10.2) will arrive with its own fulfilment path.';

-- ---------------------------------------------------------------------------
-- 2. Contracts: one pick limit for everyone
-- ---------------------------------------------------------------------------
--
-- Re-created FROM THE 028 BODY (identical signature) with the single change
-- `v_max`: CASE WHEN has_premium(...) THEN 3 ELSE 2 END -> 2. Keep in
-- lockstep with ENGAGEMENT_CONFIG.contracts.picksPerDay.

CREATE OR REPLACE FUNCTION pick_contracts(p_player_id UUID, p_contract_ids TEXT[])
RETURNS TABLE (
  contract_id TEXT,
  contract_type TEXT,
  name TEXT,
  description TEXT,
  params JSONB,
  reward_dna INTEGER,
  reward_energy INTEGER,
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
  -- Flat for every player. There is no entitlement branch here and no
  -- call to has_premium(): Constitution §10.4 puts progression rates on
  -- the never-sold list. Keep in lockstep with
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
         cd.reward_dna, cd.reward_energy, cd.reward_xp,
         pc.offered_slot, pc.picked, pc.progress, pc.completed_at, pc.claimed_at
  FROM player_contracts pc
  JOIN contract_definitions cd ON cd.id = pc.contract_id
  WHERE pc.player_id = p_player_id AND pc.contract_date = v_date
  ORDER BY pc.offered_slot;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- CREATE OR REPLACE preserves privileges, but the 033 grant is re-stated so
-- that this file is a complete description of the function's exposure.
REVOKE EXECUTE ON FUNCTION pick_contracts(UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pick_contracts(UUID, TEXT[]) TO service_role;

COMMIT;
