-- Local integration contract for migration 060.
-- Run only against the isolated local Supabase database.

BEGIN;

DO $$
DECLARE
  v_user UUID := '06000000-0000-0000-0000-000000000001';
  v_player UUID;
  v_variant UUID;
  v_snake UUID := '06000000-0000-0000-0000-000000000002';
  v_parent2 UUID := '06000000-0000-0000-0000-000000000003';
  v_child UUID := '06000000-0000-0000-0000-000000000004';
  v_session UUID := '06000000-0000-0000-0000-000000000005';
  v_history UUID := '06000000-0000-0000-0000-000000000006';
  v_attention UUID;
  v_envelope JSONB;
  v_first JSONB;
  v_second JSONB;
  v_transition JSONB;
BEGIN
  SELECT id INTO v_variant FROM snake_variants ORDER BY created_at, id LIMIT 1;
  IF v_variant IS NULL THEN RAISE EXCEPTION '060 requires a seeded variant'; END IF;

  INSERT INTO auth.users(id, aud, role, email, created_at, updated_at)
  VALUES (v_user, 'authenticated', 'authenticated', 'career-060@example.test', NOW(), NOW());
  SELECT id INTO v_player FROM players WHERE user_id = v_user;
  IF v_player IS NULL THEN RAISE EXCEPTION 'player provisioning failed'; END IF;

  INSERT INTO collected_snakes(
    id, player_id, snake_variant_id, generation, acquired_method, is_equipped
  ) VALUES (v_snake, v_player, v_variant, 5, 'bred', TRUE);

  IF NOT EXISTS (
    SELECT 1 FROM lineage_specimens
    WHERE specimen_id = v_snake AND status = 'active'
  ) THEN RAISE EXCEPTION 'active specimen trigger did not archive the snake'; END IF;

  INSERT INTO game_sessions(
    id, player_id, snake_used_id, snake_variant_id, dynasty,
    score, dna_earned, yield_dna, validated, extracted, ended_at, end_reason,
    energy_committed, energy_harvest_multiplier_bps
  ) VALUES (
    v_session, v_player, v_snake, v_variant, 'PRIMAL',
    1200, 1760, 800, TRUE, TRUE, NOW(), 'completed', 2, 22000
  );

  v_envelope := jsonb_build_object(
    'version', 1,
    'sessionId', v_session,
    'settledAt', NOW(),
    'outcome', 'extracted',
    'dynasty', 'PRIMAL',
    'receipt', jsonb_build_object(
      'score', 1200, 'yieldDna', 800, 'dnaCredited', 1760,
      'energyCommitted', 2, 'commitmentMultiplierBps', 22000,
      'generation', 5
    ),
    'impacts', jsonb_build_array(
      jsonb_build_object(
        'key', 'lineage:' || v_snake || ':run', 'pillar', 'lineage',
        'kind', 'lineage_run', 'significance', 'routine',
        'headline', 'Gen 5 history advanced', 'destination', 'lineage'
      ),
      jsonb_build_object(
        'key', 'mastery:PRIMAL:level:3', 'pillar', 'mastery',
        'kind', 'mastery_level', 'significance', 'milestone',
        'headline', 'PRIMAL Mastery M3', 'destination', 'mastery',
        'before', 2, 'after', 3, 'delta', 1
      )
    ),
    'featuredImpactKeys', jsonb_build_array('mastery:PRIMAL:level:3'),
    'recommendedAction', jsonb_build_object(
      'headline', 'Review PRIMAL Mastery M3', 'destination', 'mastery'
    )
  );

  v_first := persist_run_impact_envelope(v_player, v_session, v_envelope);
  v_second := persist_run_impact_envelope(v_player, v_session, v_envelope);
  IF v_first IS DISTINCT FROM v_second OR v_first IS DISTINCT FROM v_envelope THEN
    RAISE EXCEPTION 'receipt retry did not return its canonical first answer';
  END IF;
  IF (SELECT COUNT(*) FROM run_impact_receipts WHERE session_id = v_session) <> 1
     OR (SELECT COUNT(*) FROM progression_moments WHERE source_id = v_session::TEXT) <> 1
     OR (SELECT COUNT(*) FROM player_attention_items WHERE source_id = v_session::TEXT) <> 1 THEN
    RAISE EXCEPTION 'receipt replay duplicated a receipt, moment or attention item';
  END IF;
  IF (SELECT runs_completed FROM lineage_specimens WHERE specimen_id = v_snake) <> 1
     OR (SELECT best_yield FROM lineage_specimens WHERE specimen_id = v_snake) <> 800 THEN
    RAISE EXCEPTION 'specimen run ledger was not idempotent';
  END IF;

  SELECT id INTO v_attention FROM player_attention_items
  WHERE source_id = v_session::TEXT;
  v_transition := transition_player_attention(v_player, v_attention, 'seen');
  IF v_transition ->> 'status' <> 'seen' THEN
    RAISE EXCEPTION 'recognition was not marked seen';
  END IF;
  BEGIN
    PERFORM transition_player_attention(v_player, v_attention, 'resolved');
    RAISE EXCEPTION 'recognition unexpectedly resolved as an action';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'recognition unexpectedly resolved as an action' THEN RAISE; END IF;
    IF POSITION('INVALID_ATTENTION_TRANSITION' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;

  -- A voluntary refund deletion keeps a non-owned historical specimen.
  INSERT INTO collected_snakes(id, player_id, snake_variant_id, generation, acquired_method)
  VALUES (v_parent2, v_player, v_variant, 1, 'unlock');
  INSERT INTO collected_snakes(
    id, player_id, snake_variant_id, generation, parent1_id, parent2_id, acquired_method
  ) VALUES (v_child, v_player, v_variant, 6, v_snake, v_parent2, 'bred');
  INSERT INTO breeding_history(
    id, player_id, parent1_id, parent2_id, child_id, dna_cost, bred_at
  ) VALUES (v_history, v_player, v_snake, v_parent2, v_child, 1000, NOW());
  IF (SELECT breeding_history_id FROM lineage_specimens WHERE specimen_id = v_child)
     IS DISTINCT FROM v_history THEN
    RAISE EXCEPTION 'active bred specimen did not attach its breeding receipt';
  END IF;

  UPDATE breeding_history
  SET refunded_at = NOW(), refunded_child_id = v_child,
      refund_snapshot = jsonb_build_object(
        'child', jsonb_build_object(
          'id', v_child, 'variant_id', v_variant, 'generation', 6,
          'traits', '[]'::JSONB, 'lineage', NULL
        ),
        'parent1', NULL, 'parent2', NULL
      )
  WHERE id = v_history;
  DELETE FROM collected_snakes WHERE id = v_child;

  IF NOT EXISTS (
    SELECT 1 FROM lineage_specimens
    WHERE specimen_id = v_child
      AND status = 'retired_refunded'
      AND retired_at IS NOT NULL
      AND breeding_history_id = v_history
  ) THEN RAISE EXCEPTION 'refunded specimen history was lost or remained active'; END IF;
  IF EXISTS (SELECT 1 FROM collected_snakes WHERE id = v_child) THEN
    RAISE EXCEPTION 'refunded specimen remained owned';
  END IF;
END;
$$;

-- Season 1 is a read-only chapter: reached identity is secured without a
-- player claim, premium goodwill is retained, and replay changes nothing.
DO $$
DECLARE
  v_free_user UUID := '06000000-0000-0000-0000-000000000101';
  v_premium_user UUID := '06000000-0000-0000-0000-000000000102';
  v_free_player UUID;
  v_premium_player UUID;
  v_season UUID;
  v_existing_tier UUID;
  v_existing_time TIMESTAMPTZ := TIMESTAMPTZ '2026-07-21 09:30:00+00';
  v_free_claims INTEGER;
  v_free_inventory INTEGER;
  v_premium_claims INTEGER;
  v_premium_inventory INTEGER;
  v_second JSONB;
BEGIN
  IF to_regprocedure('claim_season_tier(uuid,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'manual season claim RPC still exists';
  END IF;

  SELECT id INTO v_season FROM battle_pass_seasons WHERE season_number = 1;
  IF v_season IS NULL THEN RAISE EXCEPTION 'Season 1 is missing'; END IF;

  INSERT INTO auth.users(id, aud, role, email, created_at, updated_at) VALUES
    (v_free_user, 'authenticated', 'authenticated', 'career-060-free@example.test', NOW(), NOW()),
    (v_premium_user, 'authenticated', 'authenticated', 'career-060-premium@example.test', NOW(), NOW());
  SELECT id INTO v_free_player FROM players WHERE user_id = v_free_user;
  SELECT id INTO v_premium_player FROM players WHERE user_id = v_premium_user;

  -- An old receipt is history: settlement may repair its missing inventory,
  -- but it may neither duplicate nor rewrite that timestamp.
  SELECT id INTO v_existing_tier
  FROM battle_pass_tiers
  WHERE season_id = v_season AND is_premium IS FALSE
    AND reward_type IN ('cosmetic', 'title')
  ORDER BY level LIMIT 1;
  INSERT INTO player_battle_pass_claims(
    player_id, season_id, tier_id, claimed_at
  ) VALUES (v_free_player, v_season, v_existing_tier, v_existing_time);

  -- Inserts settle the reached free rows automatically. A later premium
  -- activation settles the premium rows without asking the player to claim.
  INSERT INTO player_battle_pass(
    player_id, season_id, current_xp, current_level, is_premium
  ) VALUES
    (v_free_player, v_season, 12000, 30, FALSE),
    (v_premium_player, v_season, 12000, 30, FALSE);

  INSERT INTO premium_subscriptions(
    player_id, stripe_customer_id, stripe_subscription_id, status,
    billing_interval, current_period_start, current_period_end
  ) VALUES (
    v_premium_player, 'cus_060_premium', 'sub_060_premium', 'active',
    'month', NOW() - INTERVAL '1 day', NOW() + INTERVAL '29 days'
  );
  UPDATE player_battle_pass
  SET is_premium = TRUE, premium_purchased_at = NOW(), updated_at = NOW()
  WHERE player_id = v_premium_player AND season_id = v_season;

  IF EXISTS (
    SELECT 1 FROM battle_pass_tiers t
    WHERE t.season_id = v_season AND t.level <= 30 AND NOT t.is_premium
      AND NOT EXISTS (
        SELECT 1 FROM player_battle_pass_claims c
        WHERE c.player_id = v_free_player AND c.tier_id = t.id
      )
  ) THEN RAISE EXCEPTION 'free reached tier was not secured'; END IF;
  IF EXISTS (
    SELECT 1 FROM player_battle_pass_claims c
    JOIN battle_pass_tiers t ON t.id = c.tier_id
    WHERE c.player_id = v_free_player AND t.is_premium
  ) THEN RAISE EXCEPTION 'free player received premium tier'; END IF;
  IF EXISTS (
    SELECT 1 FROM battle_pass_tiers t
    WHERE t.season_id = v_season AND t.level <= 30
      AND NOT EXISTS (
        SELECT 1 FROM player_battle_pass_claims c
        WHERE c.player_id = v_premium_player AND c.tier_id = t.id
      )
  ) THEN RAISE EXCEPTION 'premium reached tier was not secured'; END IF;

  IF EXISTS (
    SELECT 1 FROM battle_pass_tiers t
    WHERE t.season_id = v_season AND t.level <= 30 AND NOT t.is_premium
      AND t.reward_type IN ('cosmetic', 'title') AND t.reward_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM player_cosmetics pc
        WHERE pc.player_id = v_free_player AND pc.cosmetic_id = t.reward_id
      )
  ) THEN RAISE EXCEPTION 'free identity inventory was not granted'; END IF;
  IF EXISTS (
    SELECT 1 FROM battle_pass_tiers t
    WHERE t.season_id = v_season AND t.level <= 30
      AND t.reward_type IN ('cosmetic', 'title') AND t.reward_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM player_cosmetics pc
        WHERE pc.player_id = v_premium_player AND pc.cosmetic_id = t.reward_id
      )
  ) THEN RAISE EXCEPTION 'premium identity inventory was not granted'; END IF;
  IF NOT (SELECT is_premium FROM player_battle_pass
          WHERE player_id = v_premium_player AND season_id = v_season) THEN
    RAISE EXCEPTION 'premium goodwill was not locked into Season 1';
  END IF;
  IF (SELECT claimed_at FROM player_battle_pass_claims
      WHERE player_id = v_free_player AND tier_id = v_existing_tier)
     IS DISTINCT FROM v_existing_time THEN
    RAISE EXCEPTION 'existing season receipt timestamp was rewritten';
  END IF;

  SELECT COUNT(*) INTO v_free_claims FROM player_battle_pass_claims
  WHERE player_id = v_free_player AND season_id = v_season;
  SELECT COUNT(*) INTO v_free_inventory FROM player_cosmetics
  WHERE player_id = v_free_player AND source = 'season_track';
  SELECT COUNT(*) INTO v_premium_claims FROM player_battle_pass_claims
  WHERE player_id = v_premium_player AND season_id = v_season;
  SELECT COUNT(*) INTO v_premium_inventory FROM player_cosmetics
  WHERE player_id = v_premium_player AND source = 'season_track';

  v_second := secure_reached_season_entitlements(v_free_player, v_season);
  IF (v_second ->> 'secured_receipts')::INTEGER <> 0
     OR (v_second ->> 'identity_grants')::INTEGER <> 0 THEN
    RAISE EXCEPTION 'season settlement replay was not idempotent';
  END IF;
  PERFORM secure_reached_season_entitlements(v_premium_player, v_season);

  IF v_free_claims <> (SELECT COUNT(*) FROM player_battle_pass_claims
                       WHERE player_id = v_free_player AND season_id = v_season)
     OR v_free_inventory <> (SELECT COUNT(*) FROM player_cosmetics
                             WHERE player_id = v_free_player AND source = 'season_track')
     OR v_premium_claims <> (SELECT COUNT(*) FROM player_battle_pass_claims
                            WHERE player_id = v_premium_player AND season_id = v_season)
     OR v_premium_inventory <> (SELECT COUNT(*) FROM player_cosmetics
                               WHERE player_id = v_premium_player AND source = 'season_track') THEN
    RAISE EXCEPTION 'season settlement replay duplicated receipts or inventory';
  END IF;
END;
$$;

ROLLBACK;
