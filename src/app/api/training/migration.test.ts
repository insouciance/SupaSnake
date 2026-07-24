/** @jest-environment node */

import fs from 'fs';
import path from 'path';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/038_training_lab.sql'),
  'utf8'
);

describe('Migration 038: Training Lab persistence', () => {
  it('creates cascade-owned, deny-by-default training tables', () => {
    for (const table of [
      'training_attempts',
      'training_bests',
      'training_presets',
    ]) {
      expect(migration).toMatch(
        new RegExp(`CREATE TABLE ${table} \\([\\s\\S]*?player_id UUID NOT NULL REFERENCES players\\(id\\) ON DELETE CASCADE`)
      );
      expect(migration).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      expect(migration).toContain(
        `REVOKE ALL ON TABLE ${table} FROM PUBLIC, anon, authenticated;`
      );
    }
  });

  it('keeps verified attempts bounded and rewardless', () => {
    expect(migration).toContain('rating INTEGER NOT NULL CHECK (rating BETWEEN 0 AND 100)');
    expect(migration).toContain('ticks INTEGER NOT NULL CHECK (ticks BETWEEN 0 AND 240)');
    expect(migration).toContain('jsonb_array_length(trace) <= 241');
    expect(migration).not.toMatch(/UPDATE\s+players\s+SET/i);
    expect(migration).not.toMatch(/economy_transactions/i);
    expect(migration).not.toMatch(/game_sessions/i);
  });

  it('records attempts and compares bests atomically under a player-skill lock', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION record_training_attempt(');
    expect(migration).toContain("'training-attempt:' || p_player_id::TEXT");
    expect(migration).toContain('INSERT INTO training_attempts');
    expect(migration).toContain('ON CONFLICT (player_id, exercise_id, difficulty) DO UPDATE');
    expect(migration).toMatch(/CASE WHEN EXCLUDED\.completed THEN 1 ELSE 0 END[\s\S]*EXCLUDED\.accuracy[\s\S]*EXCLUDED\.efficiency[\s\S]*EXCLUDED\.consistency[\s\S]*-EXCLUDED\.ticks/);
  });

  it('serializes and caps presets while validating board geometry', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION save_training_preset(');
    expect(migration).toContain("'training-preset:' || p_player_id::TEXT");
    expect(migration).toContain('Training preset limit reached (20)');
    expect(migration).toContain('Training preset path cannot cross itself');
    expect(migration).toContain('Training preset path cells must be adjacent');
  });

  it('exposes both mutations only to the backend service role', () => {
    expect(migration).toMatch(/REVOKE EXECUTE ON FUNCTION record_training_attempt\([\s\S]*?FROM PUBLIC, anon, authenticated;/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION record_training_attempt\([\s\S]*?TO service_role;/);
    expect(migration).toMatch(/REVOKE EXECUTE ON FUNCTION save_training_preset\([\s\S]*?FROM PUBLIC, anon, authenticated;/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION save_training_preset\([\s\S]*?TO service_role;/);
  });
});
