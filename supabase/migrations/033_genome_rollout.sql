-- Migration 033: Genome rollout gate
--
-- Deployment order is intentional:
--   1. deploy the capability-handshake application (it supports pre-029),
--   2. apply 029-032 (schema/RPCs; Genome contracts remain inactive),
--   3. apply this migration to admit FTUE-eligible Genome contracts.
--
-- This avoids offering impossible contracts during a migration-first
-- rolling deploy. offer_daily_contracts (032) filters every new contract
-- against the player's server-derived FTUE state.

UPDATE contract_definitions
SET active = TRUE
WHERE id IN (
  'showtime',
  'full_helix',
  'geneticist',
  'apex_predator',
  'purebred',
  'all_in'
);

-- These SECURITY DEFINER functions are called only by service-key API
-- routes. Do not expose player-id-parameterized mutation entry points to
-- browser roles.
REVOKE EXECUTE ON FUNCTION refresh_contract_progress(UUID, DATE) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION offer_daily_contracts(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION pick_contracts(UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION claim_contract(UUID, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION refresh_contract_progress(UUID, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION offer_daily_contracts(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION pick_contracts(UUID, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION claim_contract(UUID, TEXT) TO service_role;
