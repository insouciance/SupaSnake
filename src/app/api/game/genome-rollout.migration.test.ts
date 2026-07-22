import * as fs from 'fs';
import * as path from 'path';
import { GAME_CONFIG } from '@/shared/config/game';

const engagementSql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/032_genome_engagement.sql'),
  'utf8'
);
const rolloutSql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/033_genome_rollout.sql'),
  'utf8'
);

describe('Genome staged rollout', () => {
  it('ships the app flags through the server capability handshake', () => {
    expect(GAME_CONFIG.features.genome).toBe(true);
    expect(GAME_CONFIG.genome.crossDynastyBreeding).toBe(true);
  });

  it('keeps definitions dark in 032 and activates them only in 033', () => {
    expect(engagementSql).toMatch(/'all_in'[\s\S]*?600, 0, 150, false/);
    expect(engagementSql).not.toMatch(/SET active = TRUE/);
    for (const id of [
      'showtime', 'full_helix', 'geneticist',
      'apex_predator', 'purebred', 'all_in',
    ]) {
      expect(rolloutSql).toContain(`'${id}'`);
    }
  });

  it('filters contract offers at each system visibility gate', () => {
    expect(engagementSql).toMatch(/WHEN 'strain_genes_banked' THEN v_banked_runs >= 4/);
    expect(engagementSql).toMatch(/WHEN 'expression_triggered' THEN v_banked_runs >= 8/);
    expect(engagementSql).toMatch(/WHEN 'infuses_banked' THEN v_banked_runs >= 10/);
    expect(engagementSql).toMatch(/WHEN 'splice_discovered' THEN v_banked_runs >= 15/);
    expect(engagementSql).toMatch(/WHEN 'apex_reached' THEN v_banked_runs >= 20 OR v_max_mastery >= 3/);
  });

  it('keeps contract mutation RPCs service-role only', () => {
    expect(rolloutSql).toMatch(/REVOKE EXECUTE ON FUNCTION claim_contract\(UUID, TEXT\)/);
    expect(rolloutSql).toMatch(/GRANT EXECUTE ON FUNCTION claim_contract\(UUID, TEXT\) TO service_role/);
  });
});
