/**
 * Migration 029 shape tests - Buildcraft: The Genome core.
 *
 * Pins the TS<->SQL lockstep: every gene id in the TypeScript catalog is
 * seeded, every splice recipe matches splices.ts pair-for-pair, the
 * session columns exist, the catalogs are public-read + idempotent.
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { GENES, type GeneId } from '@/shared/game/genes';
import { SPLICES, SPLICE_IDS } from '@/shared/game/splices';

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/029_genome.sql'),
  'utf8'
);

describe('Migration 029: session columns', () => {
  it('adds run_seed + genome to game_sessions (idempotent)', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS run_seed UUID/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS genome JSONB/);
  });
});

describe('Migration 029: catalogs', () => {
  it('creates public-read catalogs with RLS enabled', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS gene_definitions/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS splice_definitions/);
    expect(sql).toMatch(/gene_definitions ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/splice_definitions ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/gene_definitions_public_read/);
    expect(sql).toMatch(/splice_definitions_public_read/);
  });

  it('seeds EVERY gene id from the TypeScript catalog (lockstep)', () => {
    for (const id of Object.keys(GENES) as GeneId[]) {
      expect(sql).toContain(`('${id}',`);
    }
  });

  it('seeds every splice with the exact parents from splices.ts', () => {
    for (const id of SPLICE_IDS) {
      const def = SPLICES[id];
      const row = new RegExp(
        `\\('${id}',\\s*'[^']+',\\s*'${def.parents[0]}',\\s*'${def.parents[1]}'`
      );
      expect(sql).toMatch(row);
    }
  });

  it('seeds are idempotent (ON CONFLICT DO NOTHING) and pairs unique', () => {
    expect((sql.match(/ON CONFLICT \(id\) DO NOTHING/g) ?? []).length).toBe(2);
    expect(sql).toMatch(/LEAST\(gene_a, gene_b\), GREATEST\(gene_a, gene_b\)/);
  });

  it('strain CHECK covers exactly the five strains', () => {
    expect(sql).toMatch(
      /ARRAY\['AURUM','VOLT','FERAL','FLUX','UMBRA'\]::TEXT\[\]/
    );
  });
});
