/**
 * Migration 058 contract: a generation refund is one atomic, exact-receipt
 * exchange. These source-level checks complement the API tests and keep the
 * migration reviewable without a hosted database.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/058_lineage_downgrade_refund.sql'),
  'utf8'
);

describe('generation downgrade migration', () => {
  it('adds a complete immutable refund audit', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS refunded_child_id UUID/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS refund_snapshot JSONB/);
    expect(sql).toMatch(/breeding_history_refund_complete/);
    expect(sql).toMatch(/idx_breeding_history_refunded_child/);
  });

  it('preserves history when refunded ancestry is unwound repeatedly', () => {
    expect(sql).toMatch(
      /breeding_history_parent1_id_fkey[\s\S]*ON DELETE SET NULL/
    );
    expect(sql).toMatch(
      /breeding_history_parent2_id_fkey[\s\S]*ON DELETE SET NULL/
    );
    expect(sql).toMatch(/'child', jsonb_build_object/);
    expect(sql).toMatch(/'parent1', CASE[\s\S]*'parent2', CASE/);
  });

  it('refunds the stored receipt rather than recalculating a price', () => {
    const body = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION downgrade_snake_generation'));
    expect(body).toMatch(/FROM breeding_history bh/);
    expect(body).toMatch(/v_new_balance := v_player_dna \+ v_history\.dna_cost/);
    expect(body).toMatch(/'dna',[\s\S]*v_history\.dna_cost[\s\S]*'refund'/);
    expect(body).not.toMatch(/breeding_cost\s*\(/);
  });

  it('allows only a highest-generation leaf outside an active run', () => {
    expect(sql).toMatch(/newer\.generation > v_snake\.generation/);
    expect(sql).toMatch(/descendant\.parent1_id = p_snake_id/);
    expect(sql).toMatch(/descendant\.parent2_id = p_snake_id/);
    expect(sql).toMatch(/active_run\.ended_at IS NULL/);
  });

  it('serializes wallet/equipment and never leaves an equipped player empty', () => {
    expect(sql).toMatch(/pg_advisory_xact_lock/);
    expect(sql).toMatch(/SELECT dna INTO v_player_dna[\s\S]*FOR UPDATE/);
    expect(sql).toMatch(/SET is_equipped = FALSE[\s\S]*SET is_equipped = TRUE/);
    expect(sql).toMatch(/INSERT INTO player_settings/);
  });

  it('is service-role only and contains no random outcome', () => {
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION downgrade_snake_generation\(UUID, UUID\) FROM authenticated/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION downgrade_snake_generation\(UUID, UUID\) TO service_role/
    );
    expect(sql).not.toMatch(/\brandom\s*\(/i);
  });
});
