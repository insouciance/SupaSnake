import fs from 'fs';
import path from 'path';

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/034_gdpr_rpc_hardening.sql'),
  'utf8'
);

describe('Migration 034: GDPR RPC hardening', () => {
  it('applies the hardening atomically', () => {
    expect(sql).toMatch(/^\s*--[\s\S]*\nBEGIN;/);
    expect(sql).toMatch(/COMMIT;\s*$/);
  });

  it('removes the unused arbitrary-user SECURITY DEFINER entry points', () => {
    expect(sql).toMatch(
      /DROP FUNCTION IF EXISTS public\.export_user_data\(UUID\)/i
    );
    expect(sql).toMatch(
      /DROP FUNCTION IF EXISTS public\.delete_user_data\(UUID\)/i
    );
  });

  it.each([
    'get_user_consent\\(UUID, TEXT\\)',
    'cleanup_expired_age_verifications\\(\\)',
  ])('makes %s unavailable to browser roles', (signature) => {
    expect(sql).toMatch(
      new RegExp(
        `ALTER FUNCTION public\\.${signature}\\s+SET search_path = public, pg_temp`,
        'i'
      )
    );
    expect(sql).toMatch(
      new RegExp(
        `REVOKE EXECUTE ON FUNCTION public\\.${signature}\\s+FROM PUBLIC, anon, authenticated`,
        'i'
      )
    );
    expect(sql).toMatch(
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${signature}\\s+TO service_role`,
        'i'
      )
    );
  });
});
