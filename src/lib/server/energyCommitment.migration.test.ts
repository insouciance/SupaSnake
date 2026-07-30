import fs from 'fs';
import path from 'path';

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/059_energy_commitment_clan_battles.sql'),
  'utf8'
);

describe('migration 059 — Energy Commitment', () => {
  it('stores capped stock and a partial-recovery anchor without touching legacy ownership', () => {
    expect(sql).toMatch(/ADD COLUMN stored_energy SMALLINT/);
    expect(sql).toMatch(/ADD COLUMN energy_updated_at TIMESTAMPTZ/);
    // Product cap 6 is centralized in shared config; the schema permits the
    // RPC's guarded 1..24 tuning range without a destructive constraint edit.
    expect(sql).toMatch(/stored_energy BETWEEN 0 AND 24/);
    expect(sql).toMatch(/players\.energy IS|players\.energy\b|COMMENT ON COLUMN players\.energy/);
    expect(sql).not.toMatch(/DROP COLUMN (?:energy|max_energy|energy_regen_at)/i);
  });

  it('recovers against database NOW, preserves partial ticks and caps offline recovery', () => {
    const body = sql.match(/CREATE OR REPLACE FUNCTION read_player_energy[\s\S]+?REVOKE ALL ON FUNCTION read_player_energy/)?.[0] ?? '';
    expect(body).toMatch(/v_now TIMESTAMPTZ := NOW\(\)/);
    expect(body).toMatch(/FOR UPDATE/);
    expect(body).toMatch(/FLOOR\(EXTRACT\(EPOCH FROM \(v_now - v_anchor\)\) \/ v_interval\)/);
    expect(body).toMatch(/LEAST\(\s*v_capacity - v_energy/);
    expect(body).toMatch(/v_anchor \+ make_interval/);
  });

  it('keeps an old-app rollback on the new Energy stock instead of creating a second pool', () => {
    const body =
      sql.match(
        /CREATE OR REPLACE FUNCTION consume_run_charge[\s\S]+?REVOKE ALL ON FUNCTION consume_run_charge/
      )?.[0] ?? '';
    expect(body).toMatch(/p\.stored_energy, p\.energy_updated_at/);
    expect(body).toMatch(/FOR UPDATE/);
    expect(body).toMatch(/v_now TIMESTAMPTZ := NOW\(\)/);
    expect(body).toMatch(/stored_energy = v_energy/);
    expect(body).toMatch(/v_energy := v_energy - 1/);
    expect(body).not.toMatch(/v_used < v_per_day/);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION consume_run_charge\(UUID, INTEGER\) TO service_role/
    );
  });

  it('spends and stamps the session atomically and idempotently', () => {
    const body = sql.match(/CREATE OR REPLACE FUNCTION commit_run_energy[\s\S]+?REVOKE ALL ON FUNCTION commit_run_energy/)?.[0] ?? '';
    expect(body).toMatch(/FROM game_sessions gs[\s\S]+FOR UPDATE/);
    expect(body).toMatch(/IF v_locked_at IS NOT NULL THEN/);
    expect(body).toMatch(/insufficient_energy/);
    expect(body).toMatch(/p_commitment_multipliers_bps\[p_commitment\]/);
    expect(body).toMatch(/stored_energy = v_energy/);
    expect(body).toMatch(/energy_commitment_locked_at = v_now/);
    expect(body).toMatch(/constitution-allow: owned-row-downward/);
    expect(sql).toMatch(/game_sessions_energy_commitment_immutable/);
    expect(sql).toMatch(/NEW\.charge_state IS DISTINCT FROM OLD\.charge_state/);
  });

  it('keeps all Energy RPCs service-role only', () => {
    for (const fn of [
      'read_player_energy',
      'ensure_clan_energy_battle',
      'commit_run_energy',
      'record_clan_energy_contribution',
      'reconcile_clan_energy_contributions',
      'settle_clan_energy_battles',
    ]) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${fn}\\([\\s\\S]+?FROM authenticated`));
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${fn}\\([\\s\\S]+?TO service_role`));
    }
  });
});

describe('migration 059 — automatic clan battle', () => {
  it('locks each player to one clan per cycle and snapshots eligibility at start', () => {
    expect(sql).toMatch(/PRIMARY KEY \(cycle_index, player_id\)/);
    expect(sql).toMatch(/clan_energy_battle_id = v_battle/);
    expect(sql).toMatch(/clan_energy_battle_side_id = v_side/);
    expect(sql).toMatch(/clan_energy_clan_id = CASE/);
    expect(sql).toMatch(/started_at >= b\.starts_at/);
    expect(sql).toMatch(/started_at < b\.ends_at/);
  });

  it('uses full-strength Yield and never the nonlinear harvest payout as battle score', () => {
    const body = sql.match(/CREATE OR REPLACE FUNCTION record_clan_energy_contribution[\s\S]+?REVOKE ALL ON FUNCTION record_clan_energy_contribution/)?.[0] ?? '';
    expect(body).toMatch(/gs\.yield_dna/);
    expect(body).toMatch(/COALESCE\(v_session\.yield_dna, 0\)/);
    expect(body).not.toMatch(/dna_earned/);
    expect(body).not.toMatch(/commitment_multiplier_bps\s*\*/);
    expect(body).toMatch(/v_session\.extracted IS NOT TRUE/);
    expect(body).toMatch(/v_session\.ended_at > v_session\.started_at/);
  });

  it('retains all attempts but materializes exactly the configurable strongest set', () => {
    const body = sql.match(/CREATE OR REPLACE FUNCTION record_clan_energy_contribution[\s\S]+?REVOKE ALL ON FUNCTION record_clan_energy_contribution/)?.[0] ?? '';
    expect(sql).toMatch(/session_id UUID NOT NULL UNIQUE/);
    expect(body).toMatch(/ROW_NUMBER\(\) OVER \(ORDER BY c\.score DESC/);
    expect(body).toMatch(/r\.rn <= GREATEST\(1, p_best_count\)/);
    expect(body).toMatch(/v_delta := GREATEST\(0, v_new_sum - v_old_sum\)/);
    expect(body).toMatch(/SET score = v_side_total/);
    expect(body).toMatch(/IF FOUND THEN RETURN v_existing/);
  });

  it('awards bounded permanent honors without DNA or future power', () => {
    const body = sql.match(/CREATE OR REPLACE FUNCTION settle_clan_energy_battles[\s\S]+?REVOKE ALL ON FUNCTION settle_clan_energy_battles/)?.[0] ?? '';
    expect(body).toMatch(/clan_energy_honors/);
    expect(body).toMatch(/'victor'/);
    expect(body).toMatch(/'participant'/);
    expect(body).toMatch(/lifetime_depth/);
    expect(body).not.toMatch(/economy_transactions|total_dna_earned|\bdna\s*=/);
  });
});
