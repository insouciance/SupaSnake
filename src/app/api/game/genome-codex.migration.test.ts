import * as fs from 'fs';
import * as path from 'path';
import { CODEX_DISCOVERY_REWARDS } from '@/shared/game/codex';

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/031_codex.sql'),
  'utf8'
);

describe('Migration 031: Genome Codex', () => {
  it('keeps personal discoveries private and world-first rows anonymous', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS player_codex/);
    expect(sql).toMatch(/player_codex_select_own/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS codex_first_discoveries/);
    const firstTable = sql.slice(
      sql.indexOf('CREATE TABLE IF NOT EXISTS codex_first_discoveries'),
      sql.indexOf('ALTER TABLE codex_first_discoveries')
    );
    expect(firstTable).not.toMatch(/player_id/);
  });

  it('derives entries from accepted Genome fields and grants exact rewards', () => {
    expect(sql).toMatch(/p_genome -> 'picks'/);
    expect(sql).toMatch(/p_genome -> 'splices'/);
    expect(sql).toMatch(/p_genome -> 'expressions'/);
    expect(sql).toMatch(/p_genome -> 'apexes'/);
    expect(sql).toContain(`WHEN 'splice' THEN ${CODEX_DISCOVERY_REWARDS.splice}`);
    expect(sql).toContain(
      `WHEN 'expression' THEN ${CODEX_DISCOVERY_REWARDS.expression}`
    );
    expect(sql).toContain(`WHEN 'apex' THEN ${CODEX_DISCOVERY_REWARDS.apex}`);
  });

  it('is idempotent, earning-run-only, audited, and service-role-only', () => {
    expect(sql).toMatch(/gs\.validated IS TRUE/);
    expect(sql).toMatch(/COALESCE\(gs\.is_free_play, false\) = false/);
    expect(sql).toMatch(/ON CONFLICT \(player_id, discovery_type, entry_id\) DO NOTHING/);
    expect(sql).toMatch(/'codex_discovery', p_session_id/);
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION record_codex_discoveries\(UUID, UUID, JSONB\)[\s\S]*FROM authenticated/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION record_codex_discoveries\(UUID, UUID, JSONB\)[\s\S]*TO service_role/
    );
  });

  it('records nothing before the 15-bank Codex FTUE unlock', () => {
    expect(sql).toMatch(/SELECT COUNT\(\*\)[\s\S]*gs\.validated IS TRUE[\s\S]*gs\.is_free_play IS NOT TRUE[\s\S]*gs\.extracted[\s\S]*\) < 15 THEN/);
  });

  it('grants Genome Weaver only after the full active catalog and tiers', () => {
    expect(sql).toContain("'genome_weaver'");
    expect(sql).toMatch(/FROM gene_definitions gd[\s\S]*gd\.active/);
    expect(sql).toMatch(/FROM splice_definitions sd[\s\S]*sd\.active/);
    expect(sql).toMatch(/pc\.discovery_type = 'expression'/);
    expect(sql).toMatch(/pc\.discovery_type = 'apex'/);
  });
});
