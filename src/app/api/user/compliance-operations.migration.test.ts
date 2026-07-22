import * as fs from 'fs';
import * as path from 'path';

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/035_compliance_operations.sql'),
  'utf8'
);

describe('migration 035 compliance operations', () => {
  it('removes public access to age-verification records', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS age_verifications_select/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE age_verifications FROM anon, authenticated/);
  });

  it('makes deletion state durable and purchase retention non-identifying', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ/);
    expect(sql).toMatch(/gdpr_requests_user_id_fkey[\s\S]*ON DELETE SET NULL/);
    expect(sql).toMatch(/purchase_history_player_id_fkey[\s\S]*ON DELETE SET NULL/);
    expect(sql).toMatch(/finalize_account_deletion[\s\S]*stripe_session_id = 'deleted_'[\s\S]*gen_random_uuid/);
    expect(sql).toMatch(/stripe_payment_intent_id = NULL/);
  });

  it('serializes cancellation, recognizes a fresh sign-in, and recovers interrupted work', () => {
    expect(sql).toMatch(/cancel_account_deletion[\s\S]*status = 'pending'[\s\S]*FOR UPDATE/);
    expect(sql).toMatch(/FROM auth\.sessions s[\s\S]*s\.created_at >/);
    expect(sql).toMatch(/FOR UPDATE OF gr, p SKIP LOCKED/);
    expect(sql).toMatch(/RETURNS TABLE\(request_id UUID, user_id UUID, auth_deleted BOOLEAN\)/);
    expect(sql).toMatch(/gr\.user_id IS NULL/);
    expect(sql).toMatch(/NOW\(\) - INTERVAL '15 minutes'/);
  });

  it('exposes every deletion mutation only to service_role', () => {
    for (const signature of [
      'request_account_deletion\\(UUID, TIMESTAMPTZ\\)',
      'cancel_account_deletion\\(UUID\\)',
      'claim_due_account_deletions\\(INTEGER\\)',
      'claim_account_deletion\\(UUID\\)',
      'prepare_account_deletion\\(UUID, UUID\\)',
      'finalize_account_deletion\\(UUID\\)',
    ]) {
      expect(sql).toMatch(
        new RegExp(`REVOKE EXECUTE ON FUNCTION ${signature}[\\s\\S]*?FROM PUBLIC, anon, authenticated`)
      );
      expect(sql).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION ${signature}[\\s\\S]*?TO service_role`)
      );
    }
  });
});
