/**
 * Migration 039 shape tests — the energy envelope (Constitution §8.6).
 *
 * Pins the structural guarantees into the SQL so a later edit cannot quietly
 * repeal them: that the ledger is a usage counter and not a balance, that
 * only one function writes it and only the service role may call that
 * function, that the roll-over RESETS rather than accrues, that the stipend
 * RPC is gone, and that no player-owned data is destroyed on the way past.
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_039 = path.join(
  process.cwd(),
  'supabase/migrations/039_energy_envelope.sql'
);

const sql = fs.readFileSync(MIGRATION_039, 'utf8');

describe('Migration 039: the charge ledger', () => {
  it('adds a day key and a usage counter, both additively', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS charges_day DATE/);
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS charges_used INTEGER NOT NULL DEFAULT 0/
    );
    expect(sql).toMatch(/CHECK \(charges_used >= 0\)/);
  });

  it('stores no balance and no regeneration timestamp', () => {
    // If either concept reappears in this migration, the stock model is
    // back and with it the GT §9.1/§9.2 defect surface.
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS charges_balance/i);
    expect(sql).not.toMatch(/charges_regen_at/i);
    expect(sql).not.toMatch(/max_charges/i);
  });

  it('records the charge state and the full-strength Yield on the run', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS charge_state TEXT/);
    expect(sql).toMatch(
      /CHECK \(charge_state IN \('charged', 'lean', 'exempt'\)\)/
    );
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS yield_dna INTEGER/);
  });
});

describe('Migration 039: consume_run_charge is the only writer', () => {
  it('locks the player row so two starts cannot take the same charge', () => {
    expect(sql).toMatch(/FOR UPDATE/);
  });

  it('resets on a new UTC day rather than accruing (Rule 5: no backlog)', () => {
    expect(sql).toMatch(/IF v_stored_day IS DISTINCT FROM v_today THEN/);
    expect(sql).toMatch(/v_used := 0;/);
    // The roll-over must not add the previous day's remainder.
    expect(sql).not.toMatch(/v_used := v_used \+ v_per_day/);
  });

  it('derives the day in UTC, never in server-local time', () => {
    expect(sql).toMatch(/\(NOW\(\) AT TIME ZONE 'utc'\)::DATE/);
  });

  it('reports charged=false instead of raising when the day is spent', () => {
    // The function must never be able to block a run (§8.6).
    expect(sql).toMatch(/v_charged := FALSE;/);
    expect(sql).toMatch(/v_charged := TRUE;/);
  });

  it('is service-role only, with a pinned search_path', () => {
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION consume_run_charge\(UUID, INTEGER\) FROM PUBLIC/
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION consume_run_charge\(UUID, INTEGER\) FROM anon/
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION consume_run_charge\(UUID, INTEGER\) FROM authenticated/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION consume_run_charge\(UUID, INTEGER\) TO service_role/
    );
  });

  it('defaults the allotment to the same [H] dial the server sends', () => {
    expect(sql).toMatch(
      new RegExp(
        'p_charges_per_day INTEGER DEFAULT 6'
      )
    );
  });

  it('clamps a bad allotment argument to a floor of 1', () => {
    expect(sql).toMatch(/GREATEST\(1, COALESCE\(p_charges_per_day, 6\)\)/);
  });
});

describe('Migration 039: no grant path exists (§10.4, Rule 3)', () => {
  it('never increments charges_used from a purchase, perk or reward', () => {
    // The ledger is written in exactly one place. Any statement of the form
    // "charges_used = charges_used + N" outside consume_run_charge would be
    // a faucet; there must be none at all beyond the single consume step.
    const increments = sql.match(/charges_used\s*=\s*charges_used\s*\+/gi) ?? [];
    expect(increments).toHaveLength(0);
  });

  it('exposes no function that credits the ledger', () => {
    expect(sql).not.toMatch(/grant_charges/i);
    expect(sql).not.toMatch(/add_charges/i);
    expect(sql).not.toMatch(/refill_charges/i);
    expect(sql).not.toMatch(/claim_charges/i);
  });

  it('drops the premium stipend RPC', () => {
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS claim_premium_stipend\(UUID\)/);
  });
});

describe('Migration 039: forward-only and non-destructive', () => {
  it('carries an explicit down-note', () => {
    expect(sql).toMatch(/DOWN-NOTE/);
    expect(sql).toMatch(/forward-only/i);
  });

  it('destroys no player data: no DROP COLUMN, DELETE, TRUNCATE or reset', () => {
    // Rule 6. The deprecated energy columns record purchased goods and are
    // retained; the stipend claim history is retained as an audit record.
    expect(sql).not.toMatch(/DROP COLUMN/i);
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/TRUNCATE/i);
    expect(sql).not.toMatch(/DELETE FROM/i);
    expect(sql).not.toMatch(/UPDATE players\s+SET\s+energy/i);
  });

  it('marks the retired columns deprecated rather than deleting them', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN players\.energy IS/);
    expect(sql).toMatch(/COMMENT ON COLUMN players\.max_energy IS/);
    expect(sql).toMatch(/COMMENT ON COLUMN players\.energy_regen_at IS/);
    expect(sql).toMatch(/DEPRECATED/);
  });

  it('is transactional', () => {
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/^COMMIT;/m);
  });
});
