-- Migration 035: production compliance operations
--
-- Makes the existing age-verification and account-deletion surfaces match
-- their documented behavior. All state-changing functions are service-only;
-- API routes authenticate the caller before passing an auth.users id.

BEGIN;

-- Age attempts are written by /api/age-verify through the service role. The
-- original public SELECT policy exposed every opaque verification record and
-- served no application purpose.
DROP POLICY IF EXISTS age_verifications_select ON age_verifications;
REVOKE ALL ON TABLE age_verifications FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE age_verifications TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS idx_age_verifications_hash
  ON age_verifications (verification_hash);

-- Durable deletion state. A scheduled request must survive auth-user erasure
-- as a non-identifying operational audit record.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ;

ALTER TABLE gdpr_requests
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE gdpr_requests
  DROP CONSTRAINT IF EXISTS gdpr_requests_status_check;
ALTER TABLE gdpr_requests
  ADD CONSTRAINT gdpr_requests_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));

ALTER TABLE gdpr_requests
  DROP CONSTRAINT IF EXISTS gdpr_requests_user_id_fkey;
ALTER TABLE gdpr_requests
  ADD CONSTRAINT gdpr_requests_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gdpr_delete_due
  ON gdpr_requests (scheduled_at)
  WHERE request_type = 'delete' AND status = 'pending';

-- Purchase rows retained for accounting must no longer identify a deleted
-- player or preserve provider lookup keys. Stripe remains the authoritative
-- payment/tax record; this table retains only non-identifying product totals.
ALTER TABLE purchase_history
  ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;
ALTER TABLE purchase_history
  ALTER COLUMN player_id DROP NOT NULL;
ALTER TABLE purchase_history
  DROP CONSTRAINT IF EXISTS purchase_history_player_id_fkey;
ALTER TABLE purchase_history
  ADD CONSTRAINT purchase_history_player_id_fkey
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION request_account_deletion(
  p_user_id UUID,
  p_scheduled_at TIMESTAMPTZ
) RETURNS UUID AS $$
DECLARE
  v_request_id UUID;
BEGIN
  IF p_scheduled_at < NOW() - INTERVAL '5 minutes'
     OR p_scheduled_at > NOW() + INTERVAL '31 days' THEN
    RAISE EXCEPTION 'Invalid account deletion schedule';
  END IF;

  -- Serialize requests for one account and prove that the user owns a player.
  PERFORM 1 FROM players WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  SELECT id INTO v_request_id
  FROM gdpr_requests
  WHERE user_id = p_user_id
    AND request_type = 'delete'
    AND status = 'pending'
  ORDER BY requested_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_request_id IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM gdpr_requests
      WHERE user_id = p_user_id
        AND request_type = 'delete'
        AND status = 'processing'
    ) THEN
      RAISE EXCEPTION 'Account deletion is already processing';
    END IF;

    INSERT INTO gdpr_requests (
      user_id, request_type, status, requested_at, scheduled_at, request_data
    ) VALUES (
      p_user_id,
      'delete',
      'pending',
      NOW(),
      p_scheduled_at,
      jsonb_build_object(
        'grace_period_days',
        GREATEST(0, CEIL(EXTRACT(EPOCH FROM (p_scheduled_at - NOW())) / 86400.0))
      )
    )
    RETURNING id INTO v_request_id;
  ELSE
    UPDATE gdpr_requests
    SET status = 'pending',
        requested_at = NOW(),
        scheduled_at = p_scheduled_at,
        cancelled_at = NULL,
        completed_at = NULL,
        response_data = NULL,
        updated_at = NOW()
    WHERE id = v_request_id;
  END IF;

  UPDATE players
  SET deletion_scheduled_at = p_scheduled_at,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN v_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION cancel_account_deletion(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_request_id UUID;
BEGIN
  -- Taking the request lock serializes cancellation against a worker claim.
  -- Once a worker owns a non-stale processing request, cancellation must not
  -- claim success while external Auth deletion may already be underway.
  SELECT id INTO v_request_id
  FROM gdpr_requests
  WHERE user_id = p_user_id
    AND request_type = 'delete'
    AND status = 'pending'
  ORDER BY requested_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_request_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE gdpr_requests
  SET status = 'cancelled',
      cancelled_at = NOW(),
      completed_at = NOW(),
      updated_at = NOW()
  WHERE id = v_request_id;

  UPDATE players
  SET deletion_scheduled_at = NULL,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION claim_due_account_deletions(p_limit INTEGER DEFAULT 25)
RETURNS TABLE(request_id UUID, user_id UUID, auth_deleted BOOLEAN) AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
  v_claimed INTEGER := 0;
BEGIN
  -- A successful sign-in creates a new auth.sessions row. This server-side
  -- check makes cancellation durable even if the browser's best-effort PATCH
  -- was interrupted. A stale processing lease is also safe to cancel.
  WITH reactivated AS (
    SELECT gr.id, gr.user_id
    FROM gdpr_requests gr
    WHERE gr.request_type = 'delete'
      AND (
        gr.status = 'pending'
        OR (
          gr.status = 'processing'
          AND gr.updated_at <= NOW() - INTERVAL '15 minutes'
        )
      )
      AND EXISTS (
        SELECT 1
        FROM auth.sessions s
        WHERE s.user_id = gr.user_id
          AND s.created_at > COALESCE(gr.requested_at, gr.created_at)
      )
    FOR UPDATE OF gr SKIP LOCKED
  ), cancelled AS (
    UPDATE gdpr_requests gr
    SET status = 'cancelled',
        cancelled_at = NOW(),
        completed_at = NOW(),
        updated_at = NOW()
    FROM reactivated r
    WHERE gr.id = r.id
    RETURNING gr.user_id
  )
  UPDATE players p
  SET deletion_scheduled_at = NULL,
      updated_at = NOW()
  FROM cancelled c
  WHERE p.user_id = c.user_id;

  -- Recover a process that deleted Auth successfully but stopped before the
  -- retained accounting rows and audit record were finalized.
  RETURN QUERY
  WITH recoverable AS (
    SELECT gr.id
    FROM gdpr_requests gr
    WHERE gr.request_type = 'delete'
      AND gr.status = 'processing'
      AND gr.user_id IS NULL
      AND gr.updated_at <= NOW() - INTERVAL '15 minutes'
    ORDER BY gr.updated_at, gr.id
    LIMIT v_limit
    FOR UPDATE OF gr SKIP LOCKED
  )
  UPDATE gdpr_requests gr
  SET updated_at = NOW()
  FROM recoverable r
  WHERE gr.id = r.id
  RETURNING gr.id, NULL::UUID, TRUE;

  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed >= v_limit THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT gr.id
    FROM gdpr_requests gr
    JOIN players p ON p.user_id = gr.user_id
    WHERE gr.request_type = 'delete'
      AND (
        gr.status = 'pending'
        OR (
          gr.status = 'processing'
          AND gr.updated_at <= NOW() - INTERVAL '15 minutes'
        )
      )
      AND gr.scheduled_at <= NOW()
      AND p.deletion_scheduled_at <= NOW()
      AND NOT EXISTS (
        SELECT 1
        FROM auth.sessions s
        WHERE s.user_id = gr.user_id
          AND s.created_at > COALESCE(gr.requested_at, gr.created_at)
      )
    ORDER BY gr.scheduled_at, gr.id
    LIMIT (v_limit - v_claimed)
    FOR UPDATE OF gr, p SKIP LOCKED
  )
  UPDATE gdpr_requests gr
  SET status = 'processing',
      updated_at = NOW()
  FROM due
  WHERE gr.id = due.id
  RETURNING gr.id, gr.user_id, FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION claim_account_deletion(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_request_id UUID;
BEGIN
  UPDATE gdpr_requests
  SET status = 'processing',
      updated_at = NOW()
  WHERE id = (
    SELECT gr.id
    FROM gdpr_requests gr
    JOIN players p ON p.user_id = gr.user_id
    WHERE gr.user_id = p_user_id
      AND gr.request_type = 'delete'
      AND gr.status = 'pending'
      AND gr.scheduled_at <= NOW()
      AND p.deletion_scheduled_at <= NOW()
    ORDER BY gr.scheduled_at, gr.id
    LIMIT 1
    FOR UPDATE OF gr, p
  )
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION prepare_account_deletion(
  p_request_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_player_id UUID;
BEGIN
  PERFORM 1
  FROM gdpr_requests
  WHERE id = p_request_id
    AND user_id = p_user_id
    AND request_type = 'delete'
    AND status = 'processing'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO v_player_id
  FROM players
  WHERE user_id = p_user_id
    AND deletion_scheduled_at <= NOW()
  FOR UPDATE;
  IF v_player_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION finalize_account_deletion(p_request_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- auth.users deletion changes this request's user_id to NULL. Require that
  -- proof before destroying the retained Stripe lookup references.
  PERFORM 1
  FROM gdpr_requests
  WHERE id = p_request_id
    AND request_type = 'delete'
    AND status = 'processing'
    AND user_id IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- player_id becomes NULL through the players FK only after the account has
  -- been erased. Cleaning every unfinished orphan also heals a prior worker
  -- crash without persisting payment identifiers in the GDPR audit row.
  UPDATE purchase_history
  SET stripe_session_id = 'deleted_' || replace(gen_random_uuid()::TEXT, '-', ''),
      stripe_payment_intent_id = NULL,
      anonymized_at = NOW()
  WHERE player_id IS NULL
    AND anonymized_at IS NULL;

  UPDATE gdpr_requests
  SET status = 'completed',
      completed_at = NOW(),
      response_data = jsonb_build_object('outcome', 'erased'),
      updated_at = NOW()
  WHERE id = p_request_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION request_account_deletion(UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION cancel_account_deletion(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION claim_due_account_deletions(INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION claim_account_deletion(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION prepare_account_deletion(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION finalize_account_deletion(UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION request_account_deletion(UUID, TIMESTAMPTZ)
  TO service_role;
GRANT EXECUTE ON FUNCTION cancel_account_deletion(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION claim_due_account_deletions(INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION claim_account_deletion(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION prepare_account_deletion(UUID, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION finalize_account_deletion(UUID)
  TO service_role;

COMMENT ON FUNCTION request_account_deletion(UUID, TIMESTAMPTZ) IS
  'Service-only: schedule or replace an authenticated account erasure request.';
COMMENT ON FUNCTION claim_due_account_deletions(INTEGER) IS
  'Service-only cron claim using row locks; claimed requests become processing.';
COMMENT ON FUNCTION prepare_account_deletion(UUID, UUID) IS
  'Service-only: verify that a claimed account is still eligible for erasure.';
COMMENT ON FUNCTION finalize_account_deletion(UUID) IS
  'Service-only: anonymize orphaned purchase references and complete the audit after auth erasure.';

COMMIT;
