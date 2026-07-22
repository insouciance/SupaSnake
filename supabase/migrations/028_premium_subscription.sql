-- ============================================================================
-- Migration 028: SupaSnake Premium (subscription)
--
-- EUR 9.99/month / EUR 89.99/year via Stripe Billing. Design doc:
-- docs/game/MONETIZATION_DESIGN.md (LOCKED). Never pay-to-win, no paid RNG:
-- perks are convenience/cosmetic/progression only, enforced server-side.
--
-- Perks wired here:
--   1. Season pass premium track while subscribed (claim_season_tier)
--   2. Daily stipend: +3 energy once per UTC day (claim_premium_stipend)
--   3. Contracts: pick 3 of 3 instead of 2 of 3 (pick_contracts)
--   4. Monthly exclusive cosmetic drop (delivered by the stipend claim)
--   5. Supporter badge + frame + is_premium flair (player_identity_view)
--   (Offline 48h cap + premium stats are API-side; breeding queue slots are
--    config-only until the queue feature ships.)
--
-- Ownership changes (re-declarations carry every non-premium byte forward):
--   economy_transactions_source_type_check  020 -> 028 (+ 'premium_stipend')
--   pick_contracts                          017 -> 028 (pick limit 2 -> v_max)
--   claim_season_tier                       022 -> 028 (premium tier clause)
--   get_season                              021 -> 028 (premium tiers in track)
--   player_identity_view                    022 -> 028 (+ is_premium)
--
-- Lifecycle model: premium_subscriptions mirrors Stripe subscription state.
-- Writes happen ONLY through apply_subscription_update (service role, called
-- from the webhook), idempotent by Stripe event id (stripe_events insert-first
-- guard from 010) and ordered by event.created (last_event_created guard -
-- Stripe does not guarantee delivery order). Entitlement is derived by
-- has_premium(): active/trialing, or past_due within a 7-day grace window
-- past the paid period (Stripe Smart Retries). Nothing already granted is
-- ever revoked on cancel - future claims are simply gated.
--
-- TS mirror of the perk constants lives in src/shared/config/premium.ts -
-- keep in lockstep.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PLAYERS: durable Stripe customer (subscriptions need a stable customer
--    for the Billing Portal and for webhook fallback resolution)
-- ----------------------------------------------------------------------------

ALTER TABLE players ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_players_stripe_customer
  ON players(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. PREMIUM SUBSCRIPTIONS: local mirror of Stripe subscription state
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS premium_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT NOT NULL UNIQUE,   -- upsert key for lifecycle sync
  -- Mirror of Stripe subscription statuses
  status TEXT NOT NULL CHECK (status IN (
    'incomplete', 'incomplete_expired', 'trialing', 'active',
    'past_due', 'canceled', 'unpaid', 'paused'
  )),
  tier TEXT NOT NULL DEFAULT 'premium' CHECK (tier = 'premium'),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('month', 'year')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  -- Out-of-order webhook guard: updates only apply when the incoming Stripe
  -- event is newer than the one that last wrote this row
  last_event_created TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_premium_subs_player ON premium_subscriptions(player_id);

-- At most one live subscription per player
CREATE UNIQUE INDEX IF NOT EXISTS idx_premium_subs_player_live
  ON premium_subscriptions(player_id)
  WHERE status IN ('trialing', 'active', 'past_due');

ALTER TABLE premium_subscriptions ENABLE ROW LEVEL SECURITY;

-- Players read their own subscription state; all writes are service-role only
DROP POLICY IF EXISTS premium_subscriptions_select_own ON premium_subscriptions;
CREATE POLICY premium_subscriptions_select_own ON premium_subscriptions
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 3. ENTITLEMENT: has_premium - the single source of truth every perk reads.
--    past_due keeps perks for 7 days past the paid period (payment-retry
--    grace; keep in lockstep with PREMIUM_CONFIG.graceDaysPastDue).
--    NOT revoked from anon/authenticated: player_identity_view calls it with
--    the querying user's privileges, and it exposes only a boolean.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION has_premium(p_player_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM premium_subscriptions ps
    WHERE ps.player_id = p_player_id
      AND (
        ps.status IN ('trialing', 'active')
        OR (ps.status = 'past_due'
            AND NOW() < COALESCE(ps.current_period_end, NOW()) + INTERVAL '7 days')
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ----------------------------------------------------------------------------
-- 4. SUPPORTER + SEASON 1 PREMIUM COSMETICS (cosmetic-only, never stats).
--    Monthly drops are season-agnostic premium exclusives; the "Solstice
--    Gilded" set is the Season 1 premium track (never returns, like the
--    free Solstice set).
-- ----------------------------------------------------------------------------

INSERT INTO cosmetic_definitions (id, name, slot, rarity, render) VALUES
  ('badge_premium_supporter',  'Lab Patron',     'badge',  'epic',
   '{"kind":"badge","glyph":"helix_heart","animated":true}'),
  ('banner_premium_aurora',    'Patron Aurora',  'banner', 'epic',
   '{"kind":"gradient","from":"#0e7490","to":"#7c3aed","animated":true}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO cosmetic_definitions (id, name, slot, rarity, season_seq, render) VALUES
  ('solstice_gilded_trail_1',      'Gilded Trail I',        'trail',        'rare',      1, '{"kind":"trail","palette":["#fde68a","#eab308"]}'),
  ('solstice_gilded_badge',        'Gilded Badge',          'badge',        'rare',      1, '{"kind":"badge","glyph":"gilded_sun"}'),
  ('solstice_gilded_board_accent', 'Gilded Board Accent',   'board_accent', 'epic',      1, '{"kind":"board_accent","palette":["#eab308","#f59e0b"]}'),
  ('solstice_gilded_emblem',       'Gilded Emblem',         'emblem',       'epic',      1, '{"kind":"emblem","glyph":"gilded_sunburst"}'),
  ('solstice_gilded_trail_2',      'Gilded Trail II',       'trail',        'legendary', 1, '{"kind":"trail","palette":["#fef3c7","#eab308"],"animated":true}'),
  ('solstice_gilded_banner',       'Gilded Banner',         'banner',       'legendary', 1, '{"kind":"gradient","from":"#78350f","to":"#fde68a","animated":true}')
ON CONFLICT (id) DO NOTHING;

-- Monthly exclusive drops (launch months). One row per calendar month; the
-- first stipend claim of the month delivers it - no cron required.
INSERT INTO cosmetic_definitions (id, name, slot, rarity, render) VALUES
  ('premium_trail_ion_wake',    'Ion Wake',    'trail',  'epic',
   '{"kind":"trail","palette":["#22d3ee","#a78bfa"],"animated":true}'),
  ('premium_emblem_helix_core', 'Helix Core',  'emblem', 'epic',
   '{"kind":"emblem","glyph":"helix_core","animated":true}')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS premium_cosmetic_drops (
  drop_month DATE PRIMARY KEY,                   -- first day of month (UTC)
  cosmetic_id TEXT NOT NULL REFERENCES cosmetic_definitions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT premium_drop_month_normalized CHECK (drop_month = date_trunc('month', drop_month))
);

ALTER TABLE premium_cosmetic_drops ENABLE ROW LEVEL SECURITY;

-- Catalog data: readable by everyone (the shop shows this month's drop)
DROP POLICY IF EXISTS premium_cosmetic_drops_select_all ON premium_cosmetic_drops;
CREATE POLICY premium_cosmetic_drops_select_all ON premium_cosmetic_drops
  FOR SELECT USING (true);

INSERT INTO premium_cosmetic_drops (drop_month, cosmetic_id) VALUES
  (DATE '2026-07-01', 'premium_trail_ion_wake'),
  (DATE '2026-08-01', 'premium_emblem_helix_core')
ON CONFLICT (drop_month) DO NOTHING;

CREATE TABLE IF NOT EXISTS premium_drop_claims (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  drop_month DATE NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, drop_month)
);

ALTER TABLE premium_drop_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS premium_drop_claims_select_own ON premium_drop_claims;
CREATE POLICY premium_drop_claims_select_own ON premium_drop_claims
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 5. ECONOMY TRANSACTIONS: extend source_type CHECK with 'premium_stipend'
--    (028 is now the constraint owner - 020's 14 values + 1)
-- ----------------------------------------------------------------------------

ALTER TABLE economy_transactions DROP CONSTRAINT IF EXISTS economy_transactions_source_type_check;
ALTER TABLE economy_transactions ADD CONSTRAINT economy_transactions_source_type_check
  CHECK (source_type IN (
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
    'premium_stipend'
  ));

-- ----------------------------------------------------------------------------
-- 6. LIFECYCLE SYNC: apply_subscription_update - the ONLY writer of
--    premium_subscriptions. Called with the service role from the Stripe
--    webhook for checkout.session.completed (subscription mode) and
--    customer.subscription.created/updated/deleted.
--
--    Returns: 'already_processed' | 'stale_event' | 'processed'
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION apply_subscription_update(
  p_event_id TEXT,
  p_event_type TEXT,
  p_event_created TIMESTAMPTZ,
  p_player_id UUID,
  p_customer_id TEXT,
  p_subscription_id TEXT,
  p_status TEXT,
  p_interval TEXT,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ,
  p_cancel_at_period_end BOOLEAN
) RETURNS TEXT AS $$
DECLARE
  v_existing premium_subscriptions%ROWTYPE;
  v_now_premium BOOLEAN;
  v_bps battle_pass_seasons%ROWTYPE;
BEGIN
  -- Idempotency guard: claim the event id first (010 pattern). A concurrent
  -- claimer that later fails rolls back its insert, releasing the id.
  INSERT INTO stripe_events (id, type, payload_summary)
  VALUES (
    p_event_id,
    p_event_type,
    jsonb_build_object(
      'player_id', p_player_id,
      'subscription_id', p_subscription_id,
      'status', p_status,
      'interval', p_interval,
      'period_end', p_period_end,
      'cancel_at_period_end', p_cancel_at_period_end
    )
  )
  ON CONFLICT (id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN 'already_processed';
  END IF;

  -- Durable customer mapping (webhook fallback resolution + Billing Portal)
  UPDATE players
  SET stripe_customer_id = p_customer_id, updated_at = NOW()
  WHERE id = p_player_id
    AND (stripe_customer_id IS NULL OR stripe_customer_id <> p_customer_id);

  SELECT * INTO v_existing FROM premium_subscriptions
  WHERE stripe_subscription_id = p_subscription_id
  FOR UPDATE;

  -- Ordering guard: Stripe does not guarantee delivery order. A stale event
  -- is recorded in stripe_events (so retries stay idempotent) but must not
  -- regress the subscription state.
  IF FOUND AND v_existing.last_event_created IS NOT NULL
     AND v_existing.last_event_created >= p_event_created THEN
    UPDATE stripe_events SET processed_at = NOW() WHERE id = p_event_id;
    RETURN 'stale_event';
  END IF;

  INSERT INTO premium_subscriptions (
    player_id, stripe_customer_id, stripe_subscription_id,
    status, billing_interval, current_period_start, current_period_end,
    cancel_at_period_end, last_event_created
  ) VALUES (
    p_player_id, p_customer_id, p_subscription_id,
    p_status, p_interval, p_period_start, p_period_end,
    COALESCE(p_cancel_at_period_end, false), p_event_created
  )
  ON CONFLICT (stripe_subscription_id) DO UPDATE SET
    status = EXCLUDED.status,
    billing_interval = EXCLUDED.billing_interval,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    cancel_at_period_end = EXCLUDED.cancel_at_period_end,
    last_event_created = EXCLUDED.last_event_created,
    stripe_customer_id = EXCLUDED.stripe_customer_id,
    updated_at = NOW();

  -- Activation grants (idempotent - safe on every event while premium):
  --   a) supporter badge + frame become inventory
  --   b) the active battle-pass season is marked premium for this player
  --      (the flag is what keeps THIS season's premium track claimable
  --      after a later lapse - see claim_season_tier)
  -- Nothing is ever revoked here on cancel/unpaid: future claims are gated
  -- by has_premium instead (seasons never wipe - 021 house rule).
  v_now_premium := p_status IN ('trialing', 'active');

  IF v_now_premium THEN
    INSERT INTO player_cosmetics (player_id, cosmetic_id, source)
    VALUES
      (p_player_id, 'badge_premium_supporter', 'premium'),
      (p_player_id, 'banner_premium_aurora', 'premium')
    ON CONFLICT (player_id, cosmetic_id) DO NOTHING;

    SELECT * INTO v_bps FROM battle_pass_seasons s
    WHERE s.is_active AND NOW() >= s.starts_at AND NOW() < s.ends_at
    ORDER BY s.season_number DESC
    LIMIT 1;

    IF FOUND THEN
      INSERT INTO player_battle_pass (player_id, season_id, current_xp, current_level, is_premium, premium_purchased_at)
      VALUES (p_player_id, v_bps.id, 0, 1, true, NOW())
      ON CONFLICT (player_id, season_id) DO UPDATE SET
        is_premium = true,
        premium_purchased_at = COALESCE(player_battle_pass.premium_purchased_at, NOW()),
        updated_at = NOW();
    END IF;
  END IF;

  UPDATE stripe_events SET processed_at = NOW() WHERE id = p_event_id;

  RETURN 'processed';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Writes subscription state: service role only.
REVOKE EXECUTE ON FUNCTION apply_subscription_update(TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION apply_subscription_update(TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) FROM anon;
REVOKE EXECUTE ON FUNCTION apply_subscription_update(TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) FROM authenticated;

-- ----------------------------------------------------------------------------
-- 7. DAILY STIPEND: +3 energy once per UTC day while premium. The
--    (player_id, claim_date) PK is the idempotency guard. Energy overfill
--    past max_energy is allowed by design (same rule as purchased energy,
--    010). The first claim of a month also delivers that month's exclusive
--    cosmetic drop.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS premium_stipend_claims (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  claim_date DATE NOT NULL,                      -- UTC day, idempotency key
  energy_granted INTEGER NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, claim_date)
);

ALTER TABLE premium_stipend_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS premium_stipend_claims_select_own ON premium_stipend_claims;
CREATE POLICY premium_stipend_claims_select_own ON premium_stipend_claims
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION claim_premium_stipend(p_player_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_stipend INTEGER := 3;  -- keep in lockstep with PREMIUM_CONFIG.stipendEnergyPerDay
  v_new_energy INTEGER;
  v_month DATE := date_trunc('month', CURRENT_DATE)::date;
  v_drop premium_cosmetic_drops%ROWTYPE;
  v_drop_granted TEXT := NULL;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM players WHERE id = p_player_id) THEN
    RETURN jsonb_build_object('error', 'player_not_found');
  END IF;

  IF NOT has_premium(p_player_id) THEN
    RETURN jsonb_build_object('error', 'premium_required');
  END IF;

  -- Idempotency: the PK claim is the gate
  INSERT INTO premium_stipend_claims (player_id, claim_date, energy_granted)
  VALUES (p_player_id, CURRENT_DATE, v_stipend)
  ON CONFLICT (player_id, claim_date) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'already_claimed');
  END IF;

  PERFORM 1 FROM players WHERE id = p_player_id FOR UPDATE;

  UPDATE players
  SET energy = energy + v_stipend, updated_at = NOW()
  WHERE id = p_player_id
  RETURNING energy INTO v_new_energy;

  INSERT INTO economy_transactions (player_id, resource_type, amount, balance_after, source_type, metadata)
  VALUES (p_player_id, 'energy', v_stipend, v_new_energy, 'premium_stipend',
          jsonb_build_object('claim_date', CURRENT_DATE));

  -- Monthly cosmetic drop piggyback: first stipend claim of the month
  SELECT * INTO v_drop FROM premium_cosmetic_drops WHERE drop_month = v_month;
  IF FOUND AND NOT EXISTS (
    SELECT 1 FROM premium_drop_claims
    WHERE player_id = p_player_id AND drop_month = v_month
  ) THEN
    INSERT INTO player_cosmetics (player_id, cosmetic_id, source)
    VALUES (p_player_id, v_drop.cosmetic_id, 'premium_drop')
    ON CONFLICT (player_id, cosmetic_id) DO NOTHING;

    INSERT INTO premium_drop_claims (player_id, drop_month)
    VALUES (p_player_id, v_month)
    ON CONFLICT (player_id, drop_month) DO NOTHING;

    v_drop_granted := v_drop.cosmetic_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'energy', v_new_energy,
    'granted_energy', v_stipend,
    'drop_granted', v_drop_granted
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Mints energy: service role only.
REVOKE EXECUTE ON FUNCTION claim_premium_stipend(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_premium_stipend(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION claim_premium_stipend(UUID) FROM authenticated;

-- ----------------------------------------------------------------------------
-- 8. CONTRACTS: pick_contracts - re-created FROM THE 017 BODY (identical
--    signature; every non-limit byte is a carryover) with the pick limit
--    2 -> v_max (3 while premium). 028 is now the owner.
-- ----------------------------------------------------------------------------

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
  -- Premium perk: 3 picks per day instead of 2 (keep in lockstep with
  -- PREMIUM_CONFIG.contracts.picksPerDayPremium)
  v_max INTEGER := CASE WHEN has_premium(p_player_id) THEN 3 ELSE 2 END;
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

-- ----------------------------------------------------------------------------
-- 9. SEASON TRACK: claim_season_tier - re-created FROM THE 022 BODY
--    (identical signature; economy + cosmetic-grant branches byte-identical)
--    with the premium tier clause: premium tiers are claimable while
--    has_premium() OR when this season was entered premium
--    (player_battle_pass.is_premium - the "lapsed subscriber keeps the
--    season" goodwill rule). Claiming a premium tier while subscribed also
--    stamps the season flag, so yearly subscribers (few webhook events)
--    still lock in each season they play. 028 is now the owner.
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

-- ----------------------------------------------------------------------------
-- 10. SEASON 1 PREMIUM TIERS: the Gilded track (cosmetics only - honors the
--     021 stance that season tiers add no economy faucet beyond the free
--     track; premium adds prestige, not power).
-- ----------------------------------------------------------------------------

INSERT INTO battle_pass_tiers (season_id, level, is_premium, reward_type, reward_id, reward_amount)
SELECT bps.id, t.level, true, t.reward_type, t.reward_id, t.reward_amount
FROM battle_pass_seasons bps,
  (VALUES
    (5,  'cosmetic', 'solstice_gilded_trail_1',      NULL::integer),
    (10, 'cosmetic', 'solstice_gilded_badge',        NULL),
    (15, 'cosmetic', 'solstice_gilded_board_accent', NULL),
    (20, 'cosmetic', 'solstice_gilded_emblem',       NULL),
    (25, 'cosmetic', 'solstice_gilded_trail_2',      NULL),
    (30, 'cosmetic', 'solstice_gilded_banner',       NULL)
  ) AS t(level, reward_type, reward_id, reward_amount)
WHERE bps.season_number = 1
ON CONFLICT (season_id, level, is_premium) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 11. GET_SEASON: re-created FROM THE 021 BODY (identical signature; every
--     non-track byte is a carryover) with two changes: the track's tier
--     list now includes premium tiers (each row gains is_premium) and the
--     track gains a premium object (entitlement + season lock-in) so the
--     client renders the premium row without a second request. 028 is now
--     the owner.
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

    -- Track (linked battle pass season): free + premium tiers
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
          'premium', jsonb_build_object(
            'is_premium', has_premium(p_player_id),
            'season_locked_in', COALESCE(v_pbp.is_premium, false)
          ),
          'tiers', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
               'level', t.level,
               'is_premium', t.is_premium,
               'reward_type', t.reward_type,
               'reward_id', t.reward_id,
               'reward_amount', t.reward_amount,
               'claimed', EXISTS (
                 SELECT 1 FROM player_battle_pass_claims c
                 WHERE c.player_id = p_player_id AND c.tier_id = t.id
               )
             ) ORDER BY t.level, t.is_premium)
             FROM battle_pass_tiers t
             WHERE t.season_id = v_bps.id),
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
-- 12. PLAYER_IDENTITY_VIEW: re-created FROM THE 023 BODY (every non-premium
--     byte is a carryover) with one APPENDED addition: is_premium - the supporter
--     flair flag every identity surface (PlayerCard, leaderboard, clan
--     roster) renders from. Public-safe: a boolean, no billing data.
--     PostgreSQL only permits CREATE OR REPLACE VIEW to append columns, so
--     legacy_score must remain in its 023 position. 028 is now the owner.
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
  p.legacy_score,
  has_premium(p.id) AS is_premium
FROM players p
LEFT JOIN player_loadout pl_title
  ON pl_title.player_id = p.id AND pl_title.slot = 'title' AND pl_title.position = 1
LEFT JOIN cosmetic_definitions title_def ON title_def.id = pl_title.cosmetic_id
LEFT JOIN player_loadout pl_banner
  ON pl_banner.player_id = p.id AND pl_banner.slot = 'banner' AND pl_banner.position = 1
LEFT JOIN cosmetic_definitions banner_def ON banner_def.id = pl_banner.cosmetic_id
LEFT JOIN cosmetic_definitions default_banner ON default_banner.id = 'banner_hatchery_standard'
LEFT JOIN LATERAL (
  -- Avatar (022 section 4.1): favorited -> equipped -> newest collected
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

-- ----------------------------------------------------------------------------
-- 13. STATUS READ: get_premium_status - convenience aggregate for
--     /api/premium/status (service role; the API authenticates the user
--     and resolves the player row first).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_premium_status(p_player_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_sub premium_subscriptions%ROWTYPE;
  v_month DATE := date_trunc('month', CURRENT_DATE)::date;
  v_drop RECORD;
BEGIN
  SELECT * INTO v_sub FROM premium_subscriptions ps
  WHERE ps.player_id = p_player_id
  ORDER BY (ps.status IN ('trialing', 'active', 'past_due')) DESC,
           ps.updated_at DESC
  LIMIT 1;

  SELECT pcd.cosmetic_id, cd.name, cd.slot, cd.rarity,
         EXISTS (
           SELECT 1 FROM premium_drop_claims dc
           WHERE dc.player_id = p_player_id AND dc.drop_month = v_month
         ) AS claimed
  INTO v_drop
  FROM premium_cosmetic_drops pcd
  JOIN cosmetic_definitions cd ON cd.id = pcd.cosmetic_id
  WHERE pcd.drop_month = v_month;

  RETURN jsonb_build_object(
    'is_premium', has_premium(p_player_id),
    'status', v_sub.status,
    'billing_interval', v_sub.billing_interval,
    'current_period_end', v_sub.current_period_end,
    'cancel_at_period_end', COALESCE(v_sub.cancel_at_period_end, false),
    'stipend_claimed_today', EXISTS (
      SELECT 1 FROM premium_stipend_claims sc
      WHERE sc.player_id = p_player_id AND sc.claim_date = CURRENT_DATE
    ),
    'current_drop', CASE WHEN v_drop.cosmetic_id IS NULL THEN NULL ELSE
      jsonb_build_object(
        'id', v_drop.cosmetic_id,
        'name', v_drop.name,
        'slot', v_drop.slot,
        'rarity', v_drop.rarity,
        'claimed', v_drop.claimed
      )
    END
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION get_premium_status(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_premium_status(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION get_premium_status(UUID) FROM authenticated;
