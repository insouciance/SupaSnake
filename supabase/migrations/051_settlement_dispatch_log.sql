-- Migration 051: the settlement-dispatch send ledger (WP-1.09)
--
-- ############################################################################
-- ##  NOT APPLIED. This file was written by WP-1.09 and has never been run   ##
-- ##  against any database — local, staging or production. Applying it is a  ##
-- ##  separate, deliberate act under docs/ops/RELEASE_RUNBOOK.md. Until it   ##
-- ##  is applied, GET /api/ops/settlement-dispatch FAILS CLOSED and sends    ##
-- ##  no email at all, which is the correct degradation direction: without   ##
-- ##  this ledger there is no way to guarantee one email per recipient per   ##
-- ##  week, and the failure mode of guessing is mailing somebody twice.      ##
-- ############################################################################
--
-- WHY A MIGRATION IS GENUINELY NEEDED HERE
--
-- The weekly settlement email (Constitution §7.6) is sent by a cron. Crons
-- retry, double-fire, and get replayed by hand after a partial failure. Every
-- other cron in this codebase is idempotent because its writes converge —
-- Serpent settlement is an exact recompute landed through GREATEST, Chronicle
-- entries are uniquely indexed and inserted ON CONFLICT DO NOTHING. An EMAIL
-- cannot be recomputed: once it is delivered it is delivered. Idempotency
-- therefore has to be a row, claimed BEFORE the send, and that row needs a
-- table.
--
-- Rule 7 (commerce stays in its district): nothing that reads or writes this
-- table may send a commercial message. It records that a settlement email was
-- attempted, and nothing else — no open, no click, no engagement score, no
-- profile. There is no tracking pixel anywhere in this feature.
--
-- WHAT IS DELIBERATELY NOT STORED
--
--   - No raw email address. A Dispatch recipient is recorded as the SHA-256
--     digest of its address, the same posture migration 040 takes with its
--     tokens: a leaked ledger identifies nobody.
--   - No message body, no subject, no rendered HTML. The message is a pure
--     function of the settled week; it can always be recomposed and never
--     needs to be kept.
--   - No open or click event. §11.6's channel is a weekly summary, not a
--     funnel, and Rule 7 forbids turning it into one.

BEGIN;

CREATE TABLE settlement_dispatch_sends (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Monday of the Serpent week the message described, `YYYY-MM-DD`.
  week_start DATE NOT NULL,

  -- 'player'   → a registered player who opted in (recipient_key = players.id)
  -- 'dispatch' → a confirmed Dispatch address (recipient_key = sha256(email))
  recipient_kind TEXT NOT NULL CHECK (recipient_kind IN ('player', 'dispatch')),

  -- Opaque by construction: a player UUID as text, or a SHA-256 hex digest.
  -- Never a raw email address.
  recipient_key TEXT NOT NULL CHECK (
    char_length(recipient_key) BETWEEN 16 AND 128
    AND recipient_key !~ '@'
  ),

  -- Outcome, for operational reading only. Never a player-facing number.
  outcome TEXT NOT NULL DEFAULT 'claimed' CHECK (
    outcome IN ('claimed', 'sent', 'failed', 'refused')
  ),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- THE IDEMPOTENCY CONTRACT.
--
-- The route INSERTs this row with ON CONFLICT DO NOTHING and sends only if the
-- insert returned a row. A second cron pass in the same week conflicts,
-- returns nothing, and sends nothing. A row that failed to send stays as
-- `failed` and is deliberately NOT retried automatically — a retry loop on an
-- email endpoint is how a bounce becomes a mailbomb.
CREATE UNIQUE INDEX settlement_dispatch_sends_once_idx
  ON settlement_dispatch_sends (week_start, recipient_kind, recipient_key);

-- The operational read: what happened this week.
CREATE INDEX settlement_dispatch_sends_week_idx
  ON settlement_dispatch_sends (week_start, outcome);

COMMENT ON TABLE settlement_dispatch_sends IS
  'One row per settlement email per recipient per Serpent week (WP-1.09, Constitution §7.6). Claimed before the send, so a cron replay cannot mail anybody twice. Never commercial (Rule 7); carries no address, no body and no open/click event.';
COMMENT ON COLUMN settlement_dispatch_sends.recipient_key IS
  'players.id for a player, SHA-256 hex of the address for a Dispatch subscriber. Never a raw email address.';

CREATE OR REPLACE FUNCTION touch_settlement_dispatch_sends()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER settlement_dispatch_sends_touch
  BEFORE UPDATE ON settlement_dispatch_sends
  FOR EACH ROW EXECUTE FUNCTION touch_settlement_dispatch_sends();

-- All access is through the service-role cron route. RLS on with no browser
-- policy is a deny-by-default boundary even if table privileges change.
ALTER TABLE settlement_dispatch_sends ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE settlement_dispatch_sends FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE settlement_dispatch_sends TO service_role;

REVOKE EXECUTE ON FUNCTION touch_settlement_dispatch_sends()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION touch_settlement_dispatch_sends() TO service_role;

COMMIT;
