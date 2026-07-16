-- Migration 010: Payment Hardening
-- Webhook idempotency ledger + atomic purchase reward grant RPC.
--
-- stripe_events records every Stripe event the webhook acts on, keyed by the
-- Stripe event id. grant_purchase_rewards uses it as an idempotency guard so
-- Stripe retries (same event id) can never double-grant.

-- ============================================================================
-- STRIPE EVENTS TABLE (webhook idempotency ledger)
-- ============================================================================
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,                          -- Stripe event id (evt_...)
  type TEXT NOT NULL,                           -- Stripe event type
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,                     -- NULL until fully processed
  payload_summary JSONB                         -- Minimal summary, never the full payload
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_events(type);
CREATE INDEX IF NOT EXISTS idx_stripe_events_created ON stripe_events(created_at DESC);

-- Service role only: no client access
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stripe_events_service_only ON stripe_events;
CREATE POLICY stripe_events_service_only ON stripe_events
  FOR ALL USING (false);

-- ============================================================================
-- ATOMIC PURCHASE REWARD GRANT
-- Replaces the webhook's read-modify-write + per-variant loop with a single
-- idempotent transaction. Called with the service role from the Stripe
-- webhook handler after signature verification.
--
-- Returns: 'already_processed' if the event id was seen before, else
--          'processed'.
-- ============================================================================
CREATE OR REPLACE FUNCTION grant_purchase_rewards(
  p_event_id TEXT,
  p_player_id UUID,
  p_product_id TEXT,
  p_energy INT,
  p_dna INT,
  p_variant_names TEXT[],
  p_session_id TEXT,
  p_product_name TEXT DEFAULT NULL,
  p_price_cents INT DEFAULT 0,
  p_currency TEXT DEFAULT 'usd'
) RETURNS TEXT AS $$
DECLARE
  v_new_energy INTEGER;
  v_new_dna INTEGER;
  v_purchase_id UUID;
  v_variant_id UUID;
  v_variant_name TEXT;
  v_granted_variants TEXT[] := '{}';
BEGIN
  -- Idempotency guard: claim the event id first. If another (earlier or
  -- concurrent) call already claimed it, do nothing. A concurrent claimer
  -- that later fails rolls back its insert, releasing the id for retries.
  INSERT INTO stripe_events (id, type, payload_summary)
  VALUES (
    p_event_id,
    'checkout.session.completed',
    jsonb_build_object(
      'player_id', p_player_id,
      'product_id', p_product_id,
      'session_id', p_session_id,
      'energy', p_energy,
      'dna', p_dna,
      'variants', to_jsonb(COALESCE(p_variant_names, '{}'))
    )
  )
  ON CONFLICT (id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN 'already_processed';
  END IF;

  -- Lock the player row for the whole grant
  PERFORM 1 FROM players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found: %', p_player_id;
  END IF;

  -- Grant resources. Energy overfill past max_energy is allowed by design
  -- (purchased energy is not capped).
  UPDATE players
  SET energy = energy + GREATEST(COALESCE(p_energy, 0), 0),
      dna = dna + GREATEST(COALESCE(p_dna, 0), 0),
      updated_at = NOW()
  WHERE id = p_player_id
  RETURNING energy, dna INTO v_new_energy, v_new_dna;

  -- Purchase history (audit trail; stripe_session_id is UNIQUE - a second
  -- distinct event for the same session fails loudly instead of double
  -- granting)
  INSERT INTO purchase_history (
    player_id, stripe_session_id, product_id, product_name,
    price_cents, currency, rewards_granted, status
  ) VALUES (
    p_player_id, p_session_id, p_product_id, COALESCE(p_product_name, p_product_id),
    GREATEST(COALESCE(p_price_cents, 0), 0), COALESCE(p_currency, 'usd'),
    jsonb_build_object(
      'energy', p_energy,
      'dna', p_dna,
      'variants', to_jsonb(COALESCE(p_variant_names, '{}'))
    ),
    'completed'
  ) RETURNING id INTO v_purchase_id;

  -- Economy audit trail
  IF COALESCE(p_energy, 0) > 0 THEN
    INSERT INTO economy_transactions (player_id, resource_type, amount, balance_after, source_type, source_id, metadata)
    VALUES (p_player_id, 'energy', p_energy, v_new_energy, 'purchase', v_purchase_id,
            jsonb_build_object('product_id', p_product_id, 'event_id', p_event_id));
  END IF;

  IF COALESCE(p_dna, 0) > 0 THEN
    INSERT INTO economy_transactions (player_id, resource_type, amount, balance_after, source_type, source_id, metadata)
    VALUES (p_player_id, 'dna', p_dna, v_new_dna, 'purchase', v_purchase_id,
            jsonb_build_object('product_id', p_product_id, 'event_id', p_event_id));
  END IF;

  -- Variant rewards: resolve names to snake_variants, grant if not owned.
  -- Unknown names are skipped (recorded in payload_summary via the granted
  -- list) rather than failing the whole grant.
  FOREACH v_variant_name IN ARRAY COALESCE(p_variant_names, '{}') LOOP
    SELECT id INTO v_variant_id
    FROM snake_variants
    WHERE name = v_variant_name AND is_active = true;

    IF v_variant_id IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM collected_snakes
      WHERE player_id = p_player_id AND snake_variant_id = v_variant_id
    ) THEN
      INSERT INTO collected_snakes (
        player_id, snake_variant_id, generation, acquired_method, is_equipped, is_favorited
      ) VALUES (
        p_player_id, v_variant_id, 1, 'unlock', false, false
      );
      v_granted_variants := array_append(v_granted_variants, v_variant_name);
    END IF;

    v_variant_id := NULL;
  END LOOP;

  UPDATE stripe_events
  SET processed_at = NOW(),
      payload_summary = payload_summary || jsonb_build_object(
        'granted_variants', to_jsonb(v_granted_variants),
        'purchase_id', v_purchase_id
      )
  WHERE id = p_event_id;

  RETURN 'processed';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- This function mints currency: service role only.
REVOKE EXECUTE ON FUNCTION grant_purchase_rewards(TEXT, UUID, TEXT, INT, INT, TEXT[], TEXT, TEXT, INT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION grant_purchase_rewards(TEXT, UUID, TEXT, INT, INT, TEXT[], TEXT, TEXT, INT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION grant_purchase_rewards(TEXT, UUID, TEXT, INT, INT, TEXT[], TEXT, TEXT, INT, TEXT) FROM authenticated;
