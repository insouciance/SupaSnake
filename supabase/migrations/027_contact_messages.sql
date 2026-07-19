-- Migration 027: Contact form inbox
--
-- Stores messages submitted via /contact. Written only by the service role
-- (API route); no client access. Categories cover support plus the legally
-- mandated channels: GDPR requests (Art. 12 ff.), DSA illegal-content
-- reports (Art. 12/16), accessibility complaints (BaFG) and billing.

CREATE TABLE IF NOT EXISTS contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  category TEXT NOT NULL CHECK (category IN (
    'general',
    'support',
    'privacy',
    'content_report',
    'billing',
    'accessibility',
    'legal'
  )),
  name TEXT,
  email TEXT NOT NULL,
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 5000),
  -- Set when the sender was signed in; lets support look up the account
  -- without asking. ON DELETE SET NULL so account deletion is not blocked.
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
    'new', 'in_progress', 'resolved'
  )),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_status
  ON contact_messages (status, created_at);

-- Deny-all RLS: only the service role (API route / back office) touches this.
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;
