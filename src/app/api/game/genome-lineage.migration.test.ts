/**
 * Migration 030 shape tests: lineage schema, inheritance, crafting RPCs,
 * deployment-compatible breed signature, and service-only mutation boundary.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DYNASTY_STRAINS, LINEAGE_REROLL_COST } from '@/shared/game/lineage';
import { STRAIN_IDS } from '@/shared/game/strains';

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/030_genome_lineage.sql'),
  'utf8'
);

describe('Migration 030: lineage schema', () => {
  it('adds mandatory variant affinity and constrained owned lineage', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS lineage_strain TEXT/);
    expect(sql).toMatch(/ALTER COLUMN lineage_strain SET NOT NULL/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS affinity_strength SMALLINT/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION lineage_is_valid/);
    expect(sql).toMatch(/CONSTRAINT collected_snakes_lineage_valid/);
  });

  it('keeps all strain and dynasty signatures in TS/SQL lockstep', () => {
    for (const strain of STRAIN_IDS) expect(sql).toContain(`'${strain}'`);
    for (const [dynasty, strain] of Object.entries(DYNASTY_STRAINS)) {
      expect(sql).toContain(`WHEN '${dynasty}' THEN '${strain}'`);
    }
  });
});

describe('Migration 030: breeding and crafting', () => {
  it('keeps legacy three-argument callers compatible while cross breeding defaults off', () => {
    expect(sql).toMatch(/p_allow_cross_dynasty BOOLEAN DEFAULT FALSE/);
    expect(sql).toMatch(/IF v_cross AND NOT p_allow_cross_dynasty/);
  });

  it('stores child parent links and audits the complete lineage roll', () => {
    expect(sql).toMatch(/generation, parent1_id, parent2_id,/);
    expect(sql).toMatch(/'lineage', jsonb_build_object\(/);
    expect(sql).toMatch(/'parent1', v_lin1/);
    expect(sql).toMatch(/'child', v_child_lineage/);
  });

  it('leaves cross-dynasty primary for the owner to select', () => {
    const crossBranch = sql.slice(
      sql.indexOf('Cross-dynasty: DUAL lineage'),
      sql.indexOf('Purebred: strength')
    );
    expect(crossBranch).not.toMatch(/'primary'/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION set_lineage_primary/);
  });

  it('rerolls for the TS cost without duplicating a dual partner', () => {
    expect(sql).toContain(`v_cost INTEGER := ${LINEAGE_REROLL_COST}`);
    expect(sql).toMatch(/NOT \(\(v_lineage -> 'strains'\) \? s\)/);
    expect(sql).toMatch(/ARRAY\['strains', v_target_index::TEXT\]/);
    expect(sql).toMatch(/'from', v_old_lineage/);
  });

  it('carries forward unlock wild traits and variant-affinity fallback', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION unlock_variant/);
    expect(sql).toMatch(/false, false, v_traits, NULL/);
  });
});

describe('Migration 030: authority boundary', () => {
  for (const signature of [
    'breed_snakes(UUID, UUID, UUID, BOOLEAN)',
    'unlock_variant(UUID, UUID)',
    'reroll_lineage(UUID, UUID)',
    'set_lineage_primary(UUID, UUID, TEXT)',
  ]) {
    it(`makes ${signature} service-role-only`, () => {
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION ${signature} FROM PUBLIC`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`);
    });
  }

  it('revokes direct authenticated collection writes', () => {
    expect(sql).toMatch(
      /REVOKE INSERT, UPDATE, DELETE ON TABLE collected_snakes FROM authenticated/
    );
  });
});
