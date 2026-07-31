import * as fs from 'fs';
import * as path from 'path';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/061_career_spine.sql'),
  'utf8'
);
const code = migration.replace(/--[^\n]*/g, '');

describe('migration 061 Career Spine', () => {
  it('folds player rewards and audit history atomically once per session', () => {
    const start = code.indexOf('CREATE OR REPLACE FUNCTION settle_game_session_reward');
    const end = code.indexOf('$$ LANGUAGE plpgsql SECURITY DEFINER', start);
    const body = code.slice(start, end);
    expect(code).toMatch(/CREATE TABLE game_reward_settlements \(\s*session_id UUID PRIMARY KEY/);
    expect(body).toMatch(/FROM game_sessions gs[\s\S]*FOR UPDATE/);
    expect(body).toMatch(/FROM players p[\s\S]*FOR UPDATE/);
    expect(body.indexOf('FROM game_sessions gs')).toBeLessThan(body.indexOf('FROM players p'));
    expect(body).toMatch(/dna = COALESCE\(dna, 0\) \+ p_final_dna/);
    expect(body).toMatch(/high_score = v_high_after/);
    expect(body).toMatch(/INSERT INTO game_reward_settlements/);
    expect(body).toMatch(/INSERT INTO economy_transactions/);
    expect(body).toMatch(/IF FOUND THEN/);
    expect(code).toMatch(
      /REVOKE ALL ON FUNCTION settle_game_session_reward\([\s\S]*FROM PUBLIC, anon, authenticated/
    );
    expect(code).toMatch(/CREATE TRIGGER run_impact_receipt_server_truth/);
    expect(code).toMatch(/v_reward\.high_score_before/);
    expect(code).toMatch(/RAISE EXCEPTION 'RUN_IMPACT_REWARD_TRUTH_MISMATCH'/);
    expect(code).toMatch(/RAISE EXCEPTION 'INVALID_RUN_CANNOT_CLAIM_LINEAGE'/);
  });

  it('auto-secures only catalog-backed Season identity and tombstones rolling claims', () => {
    const start = code.indexOf('CREATE OR REPLACE FUNCTION secure_reached_season_entitlements');
    const end = code.indexOf('$$ LANGUAGE plpgsql SECURITY DEFINER', start);
    const body = code.slice(start, end);
    expect(body).toMatch(/t\.level <= v_pass\.current_level/);
    expect(body).toMatch(/NOT t\.is_premium OR v_has_premium/);
    expect(body).toMatch(/INSERT INTO player_cosmetics/);
    expect(body).toMatch(/t\.reward_type IN \('cosmetic', 'title'\)/);
    expect(body).toMatch(/INSERT INTO player_battle_pass_claims/);
    expect(body.match(/JOIN cosmetic_definitions cd ON cd\.id = t\.reward_id/g)).toHaveLength(2);
    expect(body).toMatch(/ON CONFLICT \(player_id, tier_id\) DO NOTHING/);
    expect(body).not.toMatch(/UPDATE players|economy_transactions|reward_type = 'dna'|reward_type = 'energy'/);
    expect(code).not.toMatch(/DROP FUNCTION IF EXISTS claim_season_tier\(UUID, INTEGER\)/);
    expect(code).toMatch(/CREATE OR REPLACE FUNCTION claim_season_tier\([\s\S]*'secured', TRUE/);
    expect(code).toMatch(
      /REVOKE ALL ON FUNCTION claim_season_tier\(UUID, INTEGER\)\s+FROM PUBLIC, anon, authenticated/
    );
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION claim_season_tier\(UUID, INTEGER\) TO service_role/);
    expect(code).toMatch(/AFTER INSERT ON player_battle_pass/);
    expect(code).toMatch(/AFTER UPDATE OF current_level, is_premium ON player_battle_pass/);
    expect(code).toMatch(
      /REVOKE ALL ON FUNCTION secure_reached_season_entitlements\(UUID, UUID\)\s+FROM PUBLIC, anon, authenticated/
    );
  });

  it('owns one canonical versioned receipt per session', () => {
    expect(code).toMatch(/CREATE TABLE run_impact_receipts/);
    expect(code).toMatch(/session_id UUID PRIMARY KEY REFERENCES game_sessions/);
    expect(code).toMatch(/version SMALLINT NOT NULL/);
    expect(code).toMatch(/envelope ->> 'sessionId' = session_id::TEXT/);
  });

  it('persists receipt, moments and milestone attention in one RPC transaction', () => {
    const start = code.indexOf('CREATE OR REPLACE FUNCTION persist_run_impact_envelope');
    const end = code.indexOf('$$ LANGUAGE plpgsql SECURITY DEFINER', start);
    const body = code.slice(start, end);
    expect(body).toMatch(/INSERT INTO run_impact_receipts/);
    expect(body).toMatch(/ON CONFLICT \(session_id\) DO NOTHING/);
    expect(body).toMatch(/INSERT INTO progression_moments/);
    expect(body).toMatch(/INSERT INTO player_attention_items/);
    expect(body).toMatch(/v_significance IN \('milestone', 'historic'\)/);
    expect(body).not.toMatch(/UPDATE players|economy_transactions/);
    expect(code).toMatch(/ALTER COLUMN artifact_ref SET NOT NULL/);
    expect(code).toMatch(/char_length\(BTRIM\(artifact_ref\)\) BETWEEN 1 AND 300/);
  });

  it('keeps recognition separate from action terminal states', () => {
    expect(code).toMatch(/attention_kind = 'action' OR status NOT IN \('resolved', 'dismissed'\)/);
    expect(code).toMatch(/v_item\.attention_kind <> 'action'/);
    expect(code).toMatch(/RAISE EXCEPTION 'INVALID_ATTENTION_TRANSITION'/);
  });

  it('makes every progress table server-write-only with own-row reads', () => {
    for (const table of [
      'run_impact_receipts',
      'progression_moments',
      'player_attention_items',
      'player_pinned_pursuits',
      'lineage_dossiers',
      'lineage_specimens',
      'lineage_specimen_runs',
    ]) {
      expect(code).toMatch(new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`));
      expect(code).toMatch(new RegExp(`CREATE POLICY ${table}_[a-z_]*select_own`, 'i'));
    }
    expect(code).not.toMatch(/CREATE POLICY [^\n]+(?:insert|update|delete)/i);
  });

  it('preserves exact refunded specimen identity but never active ownership', () => {
    expect(code).toMatch(/status TEXT NOT NULL CHECK \(status IN \('active', 'retired_refunded'\)\)/);
    expect(code).toMatch(/SET status = 'retired_refunded'/);
    expect(code).toMatch(/bh\.refunded_child_id/);
    expect(code).toMatch(/identity_snapshot = COALESCE\(v_history\.refund_snapshot -> 'child'/);
  });

  it('counts a specimen run once by session across settlement replay', () => {
    expect(code).toMatch(/CREATE TABLE lineage_specimen_runs \(\s*session_id UUID PRIMARY KEY/);
    expect(code).toMatch(/session_id UUID PRIMARY KEY REFERENCES game_sessions\(id\) ON DELETE CASCADE/);
    expect(code).toMatch(/specimen_id UUID NOT NULL REFERENCES lineage_specimens\(specimen_id\) ON DELETE CASCADE/);
    expect(code).toMatch(/ON CONFLICT \(session_id\) DO NOTHING/);
    expect(code).toMatch(/IF v_inserted IS NULL THEN RETURN FALSE/);
    expect(code).toMatch(/gs\.validated IS TRUE/);
    expect(code).toMatch(/CREATE TRIGGER clan_contribution_sync_lineage_depth/);
    expect(code).toMatch(/CREATE OR REPLACE FUNCTION sync_lineage_session_clan_depth/);
    expect(code).toMatch(/SET clan_depth_delivered = COALESCE\(\(/);
  });

  it('keeps all mutation functions service-role only', () => {
    for (const fn of [
      'record_lineage_specimen_run\\(UUID\\)',
      'persist_run_impact_envelope\\(UUID, UUID, JSONB\\)',
      'transition_player_attention\\(UUID, UUID, TEXT\\)',
    ]) {
      expect(code).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC, anon, authenticated`));
      expect(code).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${fn} TO service_role`));
    }
  });
});
