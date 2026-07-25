-- Migration 039: the Dispatch waitlist (double opt-in)
--
-- Constitution §11.6: "The Dispatch — the opt-in news and settlement list.
-- On the landing page as a one-field waitlist from Phase 0, so spike traffic
-- is captured before the habit surfaces exist."
--
-- Three invariants this schema enforces at rest, not merely in application
-- code, because an address that was never confirmed must never be mailable:
--
--   1. A row is confirmed only when it carries a confirmation timestamp, and
--      a pending or unsubscribed row can never carry one. The mailable set is
--      exactly `status = 'confirmed'`, and the CHECK makes the two agree.
--   2. Raw tokens are never stored. Only SHA-256 hex digests are, so a leaked
--      table cannot be used to confirm or unsubscribe anybody.
--   3. One row per address, case-insensitively. Re-subscribing an address
--      re-issues a confirmation; it never silently resurrects consent.
--
-- Rule 7 (commerce stays in its district): nothing that reads this table may
-- send a commercial message. The Dispatch carries product news and settlement
-- results only, and every message carries the unsubscribe link built from
-- `unsubscribe_token_hash`.
--
-- No player data is joined here: a waitlist address is not an account, and
-- this table deliberately has no foreign key to `players`.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The waitlist
-- ---------------------------------------------------------------------------

CREATE TABLE dispatch_waitlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Stored already normalised (trimmed + lowercased) by the API route; the
  -- CHECK re-asserts it so a direct write cannot introduce a duplicate that
  -- only differs by case.
  email TEXT NOT NULL CHECK (
    email = LOWER(BTRIM(email))
    AND char_length(email) BETWEEN 6 AND 254
    AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),

  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'confirmed', 'unsubscribed')
  ),

  -- SHA-256 hex of the single-use confirmation token. NULL once consumed.
  confirmation_token_hash TEXT CHECK (
    confirmation_token_hash ~ '^[0-9a-f]{64}$'
  ),
  confirmation_sent_at TIMESTAMPTZ,
  confirmation_expires_at TIMESTAMPTZ,

  -- SHA-256 hex of the long-lived unsubscribe token. Every Dispatch message
  -- must carry the link this backs.
  unsubscribe_token_hash TEXT NOT NULL CHECK (
    unsubscribe_token_hash ~ '^[0-9a-f]{64}$'
  ),

  confirmed_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,

  -- Attribution, coarse and optional (§11.5). A channel label and a landing
  -- path only — never a full referring URL, never an IP address.
  channel TEXT CHECK (channel IS NULL OR char_length(channel) <= 96),
  landing_path TEXT CHECK (landing_path IS NULL OR char_length(landing_path) <= 128),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- The double-opt-in invariant, in the schema.
  CONSTRAINT dispatch_waitlist_confirmed_state CHECK (
    (status = 'confirmed' AND confirmed_at IS NOT NULL)
    OR (status <> 'confirmed' AND confirmed_at IS NULL)
  ),
  CONSTRAINT dispatch_waitlist_unsubscribed_state CHECK (
    (status = 'unsubscribed' AND unsubscribed_at IS NOT NULL)
    OR (status <> 'unsubscribed' AND unsubscribed_at IS NULL)
  ),
  -- A pending row is only actionable while it holds an unexpired token.
  CONSTRAINT dispatch_waitlist_pending_token CHECK (
    status <> 'pending'
    OR (confirmation_token_hash IS NOT NULL AND confirmation_expires_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX dispatch_waitlist_email_key
  ON dispatch_waitlist (email);

-- Confirmation lookups are by token hash and must be unique and fast.
CREATE UNIQUE INDEX dispatch_waitlist_confirmation_token_idx
  ON dispatch_waitlist (confirmation_token_hash)
  WHERE confirmation_token_hash IS NOT NULL;

CREATE UNIQUE INDEX dispatch_waitlist_unsubscribe_token_idx
  ON dispatch_waitlist (unsubscribe_token_hash);

-- The send query: confirmed subscribers, oldest first.
CREATE INDEX dispatch_waitlist_confirmed_idx
  ON dispatch_waitlist (confirmed_at)
  WHERE status = 'confirmed';

COMMENT ON TABLE dispatch_waitlist IS
  'Double-opt-in Dispatch waitlist (Constitution §11.6). Mailable set is exactly status = ''confirmed''. Never commercial (Rule 7); every message carries the unsubscribe link.';
COMMENT ON COLUMN dispatch_waitlist.confirmation_token_hash IS
  'SHA-256 hex of the single-use confirmation token. Raw tokens are never stored and exist only in the confirmation email.';
COMMENT ON COLUMN dispatch_waitlist.unsubscribe_token_hash IS
  'SHA-256 hex of the long-lived unsubscribe token. Required on every Dispatch message.';
COMMENT ON COLUMN dispatch_waitlist.channel IS
  'Coarse acquisition channel (utm_source or referrer host). Never a full URL, never an IP.';

-- All access is through service-role API routes. Enabling RLS without browser
-- policies creates a deny-by-default boundary even if table privileges change.
ALTER TABLE dispatch_waitlist ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE dispatch_waitlist FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE dispatch_waitlist TO service_role;

-- ---------------------------------------------------------------------------
-- 2. updated_at maintenance
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION touch_dispatch_waitlist()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER dispatch_waitlist_touch
  BEFORE UPDATE ON dispatch_waitlist
  FOR EACH ROW EXECUTE FUNCTION touch_dispatch_waitlist();

REVOKE EXECUTE ON FUNCTION touch_dispatch_waitlist() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION touch_dispatch_waitlist() TO service_role;

COMMIT;
