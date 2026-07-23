import fs from 'fs';
import path from 'path';

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/037_ftue_v2_player_flow.sql'),
  'utf8'
);

describe('Migration 037: FTUE v2 player bootstrap', () => {
  it('is one transactional migration with PRIMAL as the settings default', () => {
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/i);
    expect(sql).toMatch(
      /ALTER TABLE player_settings[\s\S]*selected_dynasty SET DEFAULT 'PRIMAL'/i
    );
  });

  it('serializes repeated and concurrent bootstrap calls per user', () => {
    expect(sql).toMatch(
      /bootstrap_player\(p_user_id UUID\)[\s\S]*pg_advisory_xact_lock\(hashtextextended\(p_user_id::TEXT, 0\)\)/i
    );
    expect(sql).toMatch(/INSERT INTO players[\s\S]*ON CONFLICT \(user_id\) DO NOTHING/i);
    expect(sql).toMatch(
      /INSERT INTO player_settings[\s\S]*ON CONFLICT \(player_id\) DO NOTHING/i
    );
  });

  it('discovers the active PRIMAL starter from catalog data only for zero-snake players', () => {
    expect(sql).toMatch(
      /IF NOT FOUND THEN[\s\S]*FROM snake_variants sv[\s\S]*d\.name = 'PRIMAL'[\s\S]*sv\.is_starter = true[\s\S]*sv\.is_active = true/i
    );
    expect(sql).toMatch(/INSERT INTO collected_snakes[\s\S]*'tutorial'/i);
    expect(sql).not.toMatch(/snake_variant_id[^\n]*=[^\n]*'[0-9a-f]{8}-/i);
  });

  it('preserves existing choices, repairs equipment, and enforces one equipped snake', () => {
    expect(sql).toMatch(/CASE WHEN cs\.id = v_settings\.active_snake_id THEN 0/i);
    expect(sql).toMatch(/WHEN v_starter_granted THEN 'PRIMAL'[\s\S]*ELSE selected_dynasty/i);
    expect(sql).toMatch(/SET is_equipped = \(id = v_snake\.id\)/i);
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_collected_one_equipped_per_player[\s\S]*WHERE is_equipped = true/i
    );
  });

  it('backfills through the runtime operation without changing progress resources', () => {
    expect(sql).toMatch(/FOR v_user_id IN[\s\S]*PERFORM bootstrap_player\(v_user_id\)/i);
    expect(sql).not.toMatch(/UPDATE players\s+SET\s+(dna|energy|high_score|total_games_played)/i);
    expect(sql).not.toMatch(/DELETE FROM (players|collected_snakes|player_settings)/i);
  });

  it('exposes bootstrap and equip only to the service role', () => {
    for (const signature of [
      'bootstrap_player\\(UUID\\)',
      'equip_snake\\(UUID, UUID\\)',
      'unlock_and_equip_variant\\(UUID, UUID\\)',
    ]) {
      expect(sql).toMatch(
        new RegExp(`REVOKE EXECUTE ON FUNCTION ${signature} FROM authenticated`, 'i')
      );
      expect(sql).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`, 'i')
      );
    }
  });

  it('offers atomic Lab unlock-and-equip without duplicating economy logic', () => {
    expect(sql).toMatch(
      /unlock_and_equip_variant\([\s\S]*v_snake_id := unlock_variant\(p_player_id, p_variant_id\)[\s\S]*PERFORM equip_snake\(p_player_id, v_snake_id\)/i
    );
  });
});
