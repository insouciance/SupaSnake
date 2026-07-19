/**
 * Migration 026 shape tests (Aim systems v2).
 *
 * House pattern (022/023/024/025): the SQL file is asserted as text -
 * remap statements via literals, structure via regex, plus the standing
 * covenants (zero economy faucets, no destructive statements).
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_026 = path.join(
  process.cwd(),
  'supabase/migrations/026_aim_systems_v2.sql'
);
const sql = fs.readFileSync(MIGRATION_026, 'utf8');

describe('Migration 026: tier-aligned selection remap', () => {
  it('remaps pulse -> deadeye (always-unlocked tier preserved)', () => {
    expect(sql).toContain(
      "UPDATE player_settings SET aim_system = 'deadeye' WHERE aim_system = 'pulse';"
    );
  });

  it('remaps vector -> gridlock (both high score 15)', () => {
    expect(sql).toContain(
      "UPDATE player_settings SET aim_system = 'gridlock' WHERE aim_system = 'vector';"
    );
  });

  it('remaps sequence/radar/apex -> pathline in one statement', () => {
    expect(sql).toMatch(
      /UPDATE player_settings SET aim_system = 'pathline'\s*\n\s*WHERE aim_system IN \('sequence', 'radar', 'apex'\);/
    );
  });

  it('carries the idempotent WHERE NOT IN safety net for unexpected values', () => {
    expect(sql).toMatch(
      /UPDATE player_settings SET aim_system = 'deadeye'\s*\n\s*WHERE aim_system NOT IN \('deadeye', 'gridlock', 'pathline', 'firefly'\);/
    );
  });

  it('every remap targets only v1 values (idempotent re-runs match zero rows)', () => {
    // No UPDATE may match a v2 id in its WHERE clause - that would make a
    // second run rewrite already-migrated rows
    const updates = sql.match(/UPDATE player_settings[^;]+;/g) || [];
    expect(updates.length).toBe(4);
    for (const statement of updates) {
      const where = statement.slice(statement.indexOf('WHERE'));
      expect(where).not.toMatch(/aim_system = '(deadeye|gridlock|pathline|firefly)'/);
    }
  });
});

describe('Migration 026: CHECK constraint swap', () => {
  it('drops the v1 constraint inside an IF EXISTS DO-block', () => {
    expect(sql).toMatch(
      /IF EXISTS \(\s*\n\s*SELECT 1 FROM pg_constraint\s*\n\s*WHERE conname = 'player_settings_aim_system_check'\s*\n\s*\) THEN\s*\n\s*ALTER TABLE player_settings\s*\n\s*DROP CONSTRAINT player_settings_aim_system_check;/
    );
  });

  it('re-adds the constraint with exactly the four v2 ids', () => {
    expect(sql).toContain(
      "CHECK (aim_system IN ('deadeye', 'gridlock', 'pathline', 'firefly'))"
    );
    // The v1 id list must be gone from any CHECK
    expect(sql).not.toMatch(/CHECK \(aim_system IN \('pulse'/);
  });

  it('sets the column default to deadeye', () => {
    expect(sql).toMatch(
      /ALTER COLUMN aim_system SET DEFAULT 'deadeye';/
    );
  });
});

describe('Migration 026: standing covenants', () => {
  it('touches only player_settings.aim_system - zero economy statements', () => {
    expect(sql).not.toMatch(/INSERT INTO economy_transactions/);
    expect(sql).not.toMatch(/UPDATE players SET dna/);
    expect(sql).not.toMatch(/SET energy/);
    expect(sql).not.toMatch(/UPDATE players\b/);
  });

  it('contains no destructive statements', () => {
    expect(sql).not.toMatch(/\bDROP TABLE\b/);
    expect(sql).not.toMatch(/\bTRUNCATE\b/);
    expect(sql).not.toMatch(
      /DELETE FROM (players|game_sessions|economy_transactions|player_cosmetics|player_settings)/
    );
  });

  it('never uses uuid_generate_v4 (gen_random_uuid house rule)', () => {
    expect(sql).not.toMatch(/uuid_generate_v4/);
  });
});
