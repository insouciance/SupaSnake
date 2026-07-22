-- Migration 034: GDPR RPC hardening and legacy cleanup
--
-- Migration 008 shipped two SECURITY DEFINER functions that accepted an
-- arbitrary auth.users id and retained PostgreSQL's default PUBLIC execute
-- privilege. The application has never called either function: authenticated
-- server routes own export and deletion. Migration 009 later removed the
-- legacy collected_snakes.variant_id column, leaving export_user_data broken.
--
-- Remove the unused privileged entry points instead of preserving duplicate
-- compliance implementations. Keep the two remaining helpers service-only.
-- DROP IF EXISTS makes this safe after the production containment hotfix.

BEGIN;

DROP FUNCTION IF EXISTS public.export_user_data(UUID);
DROP FUNCTION IF EXISTS public.delete_user_data(UUID);

ALTER FUNCTION public.get_user_consent(UUID, TEXT)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.cleanup_expired_age_verifications()
  SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.get_user_consent(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_age_verifications()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_user_consent(UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_age_verifications()
  TO service_role;

COMMENT ON FUNCTION public.get_user_consent(UUID, TEXT) IS
  'Service-only consent lookup. Browser reads use user_consents RLS.';
COMMENT ON FUNCTION public.cleanup_expired_age_verifications() IS
  'Service-only maintenance helper for expired verification rows.';

COMMIT;
