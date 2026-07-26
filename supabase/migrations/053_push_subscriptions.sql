-- Migration 053: push subscriptions and the push dispatch ledger (WP-2.04)
--
-- ############################################################################
-- ##  NOT APPLIED. This file was written by WP-2.04 and has never been run   ##
-- ##  against any database — local, staging or production. Applying it is a  ##
-- ##  separate, deliberate act under docs/ops/RELEASE_RUNBOOK.md. Until it   ##
-- ##  is applied, POST /api/push/subscription FAILS CLOSED (no subscription  ##
-- ##  can be stored) and GET /api/ops/push-dispatch sends NOTHING, which is  ##
-- ##  the correct degradation direction: without the ledger there is no way  ##
-- ##  to guarantee one notification per subscriber per occurrence, and the   ##
-- ##  failure mode of guessing is buzzing somebody's phone twice.            ##
-- ############################################################################
--
-- ── THE CONSTITUTIONAL LIMIT, ENFORCED AT REST ─────────────────────────────
--
-- Push is permitted for EXACTLY TWO events: a Serpent settlement (§7.3) and a
-- new Signal (§7.2). §12.4 additionally names notification volume as a
-- FORBIDDEN response to a retention dip, which is why two is a ceiling and not
-- a starting point.
--
-- That limit is enforced in four independent places (src/lib/push/triggers.ts
-- documents all four). THIS FILE IS THE FOURTH AND LAST ONE: both
-- `push_subscriptions.triggers` and `push_dispatch_log.trigger_id` carry CHECK
-- constraints that enumerate the two ids as literals. A third trigger cannot
-- be consented to and cannot be logged; since the send path claims a log row
-- BEFORE it delivers, a third trigger cannot be sent even by a service-role
-- caller that bypasses every line of TypeScript above.
--
-- Adding a value to those CHECKs requires a migration, a review and a
-- Constitution amendment. That is the intended cost.
--
-- ── RULE 7: NO NOTIFICATION IS EVER COMMERCIAL ─────────────────────────────
--
-- Nothing that reads these tables may send a commercial message, and the
-- schema gives such a message nowhere to come from: there is no campaign
-- table, no message body column, no template id, no segment, no audience.
-- The copy for both triggers is authored in `src/lib/push/triggers.ts`, swept
-- for commercial AND loss vocabulary at send time, and refused rather than
-- softened if it trips.
--
-- ── WHAT IS DELIBERATELY NOT STORED ────────────────────────────────────────
--
--   - No open, no click, no delivery receipt beyond a coarse outcome. A push
--     is a notification, not a funnel, and Rule 7 forbids turning it into one.
--   - No user agent, no device name, no IP, no locale, no timezone. A
--     subscription is an endpoint and two keys; nothing here profiles anybody.
--   - No "last active", no engagement score, no lapse flag. A trigger that can
--     read a player's absence is the mechanism by which a notification becomes
--     a nag (Rule 5), and the schema gives it nothing to read.
--
-- ── WHY THE ENDPOINT IS STORED IN THE CLEAR ────────────────────────────────
--
-- Migration 040 stores only digests because it never needs the original. This
-- table does: the endpoint URL is the address the POST goes to, so it cannot
-- be hashed away. The digest column exists in ADDITION, as the unique key, so
-- that re-subscribing the same device updates one row instead of accumulating
-- rows — and so a lookup never needs an index over the URL itself.
--
-- RLS is on with no browser policies: every read and write goes through a
-- service-role API route. The subscription route authenticates the player and
-- writes on their behalf; the client never touches these tables (project rule:
-- server authority).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Subscriptions
-- ---------------------------------------------------------------------------

CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  -- The push service URL the encrypted body is POSTed to. https only: a
  -- plaintext endpoint would leak the fact of a notification in transit.
  endpoint TEXT NOT NULL CHECK (
    endpoint ~ '^https://' AND char_length(endpoint) BETWEEN 24 AND 2048
  ),

  -- SHA-256 hex of the endpoint. The unique key, so a device that
  -- re-subscribes updates its row rather than adding one.
  endpoint_hash TEXT NOT NULL CHECK (endpoint_hash ~ '^[0-9a-f]{64}$'),

  -- RFC 8291 client keys, base64url, exactly as the browser produced them.
  -- p256dh is an uncompressed P-256 point (65 bytes -> 87 base64url chars);
  -- auth is 16 bytes (-> 22 chars). The length bounds are belt and braces:
  -- a malformed key can only produce an undeliverable notification, but it
  -- should not be storable in the first place.
  p256dh TEXT NOT NULL CHECK (p256dh ~ '^[A-Za-z0-9_-]{80,120}$'),
  auth TEXT NOT NULL CHECK (auth ~ '^[A-Za-z0-9_-]{16,32}$'),

  -- ##########################################################################
  -- ##  THE TWO TRIGGERS. Enumerated as literals, on purpose.               ##
  -- ##  Constitution: push is permitted for a Serpent settlement and a new  ##
  -- ##  Signal, and for nothing else, ever. A third id cannot be consented  ##
  -- ##  to here and cannot be logged below.                                 ##
  -- ##########################################################################
  triggers TEXT[] NOT NULL DEFAULT '{}'::TEXT[] CHECK (
    triggers <@ ARRAY['serpent-settlement', 'signal-new']::TEXT[]
    AND array_length(triggers, 1) IS DISTINCT FROM 0
    AND COALESCE(array_length(triggers, 1), 0) <= 2
  ),

  -- Consent is an affirmative act with a timestamp, exactly as migration 040
  -- treats a confirmed address. A row with no consent timestamp is not a
  -- subscriber, and the CHECK below makes the status agree.
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Opt-out is a state, not a deletion, so a revoked row keeps its endpoint
  -- hash and can never be silently resurrected by a stale client retry.
  CONSTRAINT push_subscriptions_revoked_state CHECK (
    (status = 'revoked' AND revoked_at IS NOT NULL)
    OR (status <> 'revoked' AND revoked_at IS NULL)
  ),

  -- The sendable set is exactly `status = 'active' AND triggers <> '{}'`.
  -- An active row with no triggers is a player who turned both off; it is
  -- kept (so the device is remembered) and is not mailable.
  CONSTRAINT push_subscriptions_revoked_has_no_triggers CHECK (
    status <> 'revoked' OR triggers = '{}'::TEXT[]
  )
);

CREATE UNIQUE INDEX push_subscriptions_endpoint_hash_key
  ON push_subscriptions (endpoint_hash);

CREATE INDEX push_subscriptions_player_idx
  ON push_subscriptions (player_id);

-- The send query: active subscribers who consented to one particular trigger.
CREATE INDEX push_subscriptions_sendable_idx
  ON push_subscriptions USING GIN (triggers)
  WHERE status = 'active';

COMMENT ON TABLE push_subscriptions IS
  'Web Push subscriptions (WP-2.04). Opt-in only; sendable set is exactly status = ''active'' with a matching trigger. Push is permitted for exactly two events — a Serpent settlement and a new Signal — and the triggers CHECK enumerates them. Never commercial (Rule 7).';
COMMENT ON COLUMN push_subscriptions.triggers IS
  'Consented triggers, a subset of {serpent-settlement, signal-new}. The CHECK is the schema-level statement of the Constitution''s two-trigger limit; adding a value requires a migration and an amendment.';
COMMENT ON COLUMN push_subscriptions.endpoint IS
  'The push service URL. Stored in the clear because it IS the destination; endpoint_hash is the unique key so lookups never index the URL.';

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE push_subscriptions TO service_role;

-- ---------------------------------------------------------------------------
-- 2. The dispatch ledger
-- ---------------------------------------------------------------------------
--
-- Same reasoning as migration 051's email ledger: a cron retries, double-fires
-- and gets replayed by hand after a partial failure, and a DELIVERED
-- notification cannot be recomputed. Idempotency therefore has to be a row,
-- claimed BEFORE the send.

CREATE TABLE push_dispatch_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- ##########################################################################
  -- ##  THE TWO TRIGGERS AGAIN — and this is the load-bearing one.          ##
  -- ##  The send path claims a row here BEFORE it delivers, so a trigger    ##
  -- ##  this CHECK rejects can never be sent, whatever the application code ##
  -- ##  above it believes.                                                  ##
  -- ##########################################################################
  trigger_id TEXT NOT NULL CHECK (
    trigger_id IN ('serpent-settlement', 'signal-new')
  ),

  -- The occurrence this notification is about: the Monday of a settled Serpent
  -- week, or a Signal day. `YYYY-MM-DD`. Together with trigger_id and the
  -- subscription it is the once-only key.
  occurrence_key TEXT NOT NULL CHECK (occurrence_key ~ '^\d{4}-\d{2}-\d{2}$'),

  subscription_id UUID NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,

  -- Operational only, never player-facing. 'gone' means the push service
  -- returned 404/410 and the subscription was revoked as a result.
  outcome TEXT NOT NULL DEFAULT 'claimed' CHECK (
    outcome IN ('claimed', 'sent', 'failed', 'gone')
  ),

  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  CONSTRAINT push_dispatch_log_completed_state CHECK (
    (outcome = 'claimed' AND completed_at IS NULL)
    OR (outcome <> 'claimed' AND completed_at IS NOT NULL)
  )
);

-- The idempotency key. `INSERT ... ON CONFLICT DO NOTHING RETURNING id` is the
-- claim: exactly one caller gets a row back, and the losers send nothing.
CREATE UNIQUE INDEX push_dispatch_log_once_idx
  ON push_dispatch_log (trigger_id, occurrence_key, subscription_id);

CREATE INDEX push_dispatch_log_claimed_idx
  ON push_dispatch_log (claimed_at);

COMMENT ON TABLE push_dispatch_log IS
  'One row per (trigger, occurrence, subscription), claimed before the send (WP-2.04). Records that a notification was attempted and nothing else — no open, no click, no engagement score. There is no tracking pixel and no equivalent anywhere in this feature.';

ALTER TABLE push_dispatch_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE push_dispatch_log FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE push_dispatch_log TO service_role;

-- ---------------------------------------------------------------------------
-- 3. updated_at maintenance
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION touch_push_subscriptions()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER push_subscriptions_touch
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION touch_push_subscriptions();

REVOKE EXECUTE ON FUNCTION touch_push_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION touch_push_subscriptions() TO service_role;

COMMIT;
