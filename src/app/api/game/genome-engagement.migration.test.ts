/** Migration 032 lockstep and compatibility checks. */

import * as fs from 'fs';
import * as path from 'path';
import { ANOMALY_ROTATION } from '@/shared/game/anomalies';
import { STRAIN_IDS } from '@/shared/game/strains';

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/032_genome_engagement.sql'),
  'utf8'
);

describe('Migration 032: Genome contracts', () => {
  it('seeds every design contract dark with the documented rewards', () => {
    for (const [id, reward] of [
      ['showtime', 500],
      ['full_helix', 550],
      ['geneticist', 600],
      ['apex_predator', 650],
      ['purebred', 500],
      ['all_in', 600],
    ] as const) {
      expect(sql).toContain(`('${id}',`);
      expect(sql).toMatch(new RegExp(`\\('${id}'[\\s\\S]*?${reward}, 0, 150, false`));
    }
  });

  it('derives progress only from accepted earning sessions', () => {
    expect(sql).toContain("gs.genome->>'v' = '1'");
    expect(sql).toMatch(/gs\.ended_at IS NOT NULL AND gs\.validated IS TRUE/g);
    expect(sql).toMatch(/gs\.is_free_play IS NOT TRUE/g);
    for (const branch of [
      'expression_triggered', 'genes_held', 'splice_discovered',
      'apex_reached', 'strain_genes_banked', 'infuses_banked',
    ]) {
      expect(sql).toContain(`WHEN '${branch}' THEN`);
    }
  });

  it('guards malformed JSON before arrays are expanded or measured', () => {
    expect(sql).toMatch(/jsonb_typeof\(gs\.genome->'picks'\) = 'array'/);
    expect(sql).toMatch(/jsonb_typeof\(gs\.genome->'infuses'\) = 'array'/);
    expect(sql).toMatch(/ELSE '\[\]'::jsonb END/);
  });
});

describe('Migration 032: season and anomalies', () => {
  it('adds the seasonal gene catalog without replacing the legacy table', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS season_genes/);
    expect(sql).toMatch(/FROM season_mutations sm/);
    expect(sql).not.toMatch(/DROP TABLE(?: IF EXISTS)? season_mutations/);
  });

  it('keeps the exact TS rotation order and a mod-five SQL function', () => {
    const functionBody = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION anomaly_for_week'));
    let cursor = -1;
    for (const id of ANOMALY_ROTATION) {
      const next = functionBody.indexOf(`'${id}'`, cursor + 1);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }
    expect(functionBody).toMatch(/, 5\) \+ 5, 5\)/);
    expect(sql).toContain("'overgrown'");
  });
});

describe('Migration 032: Gauntlet deployment compatibility', () => {
  it('backfills old bans before installing the canonical domain check', () => {
    expect(sql.indexOf("SET mutation_ban = 'gene:' || mutation_ban")).toBeLessThan(
      sql.indexOf('ADD CONSTRAINT gauntlet_picks_genome_ban_check')
    );
    expect(sql).toContain("mutation_ban ~ '^gene:[a-z][a-z0-9_]*$'");
    for (const strain of STRAIN_IDS) expect(sql).toContain(`'strain:${strain}'`);
  });

  it('accepts bare old-client ids but persists only a prefixed gene id', () => {
    expect(sql).toMatch(/WHEN p_ban LIKE 'gene:%' THEN substring\(p_ban FROM 6\)/);
    expect(sql).toContain("v_ban := 'gene:' || v_gene_id");
    expect(sql).toMatch(/FROM gene_definitions gd[\s\S]*gd\.active/);
    expect(sql).toMatch(/p_modifier = 'anomaly_doctrine'[\s\S]*protocols_1/);
  });
});
