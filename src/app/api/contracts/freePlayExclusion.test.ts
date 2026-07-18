/**
 * Free Play exclusion from contract progress (Design v2 §7.4)
 *
 * Migration 016 re-creates refresh_contract_progress (from migration 015)
 * with `gs.is_free_play IS NOT TRUE` on every game_sessions read: free
 * sessions are validated but must never advance a contract. These tests pin
 * the shape of the replaced RPC so a future edit cannot silently drop the
 * exclusion from one of the per-contract-type queries.
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_016 = path.join(
  process.cwd(),
  'supabase/migrations/016_free_play.sql'
);
const MIGRATION_015 = path.join(
  process.cwd(),
  'supabase/migrations/015_contracts.sql'
);

describe('Migration 016: Free Play exclusion from contracts', () => {
  const sql = fs.readFileSync(MIGRATION_016, 'utf8');

  it('adds the is_free_play marker with a safe backfill default', () => {
    expect(sql).toMatch(/ALTER TABLE game_sessions/);
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS is_free_play BOOLEAN NOT NULL DEFAULT FALSE/
    );
  });

  it('replaces refresh_contract_progress (same signature as migration 015)', () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION refresh_contract_progress\(p_player_id UUID, p_date DATE\)/
    );
    expect(sql).toMatch(/RETURNS VOID/);
    expect(sql).toMatch(/LANGUAGE plpgsql SECURITY DEFINER/);
  });

  it('excludes free sessions from EVERY game_sessions read in the RPC', () => {
    // Each per-contract-type query reads FROM game_sessions gs; each must
    // carry the free-play exclusion alongside the validated filter.
    const reads = sql.match(/FROM game_sessions gs/g) || [];
    const exclusions = sql.match(/AND gs\.is_free_play IS NOT TRUE/g) || [];

    expect(reads.length).toBeGreaterThanOrEqual(6); // 6 active contract types
    expect(exclusions.length).toBe(reads.length);
  });

  it('keeps the validated-only principle from migration 015', () => {
    const validatedFilters = sql.match(/gs\.validated IS TRUE/g) || [];
    const reads = sql.match(/FROM game_sessions gs/g) || [];
    expect(validatedFilters.length).toBe(reads.length);
  });

  it('covers every contract type migration 015 evaluates from game_sessions', () => {
    const sql015 = fs.readFileSync(MIGRATION_015, 'utf8');
    const typeCase = /WHEN '(extract_n|food_n_single_run|extract_tier|food_total|extract_fast|extract_nth_portal)' THEN/g;

    const types015 = new Set(
      Array.from(sql015.matchAll(typeCase), (m) => m[1])
    );
    const types016 = new Set(Array.from(sql.matchAll(typeCase), (m) => m[1]));

    // The replaced function must handle exactly the same active types
    expect(types016).toEqual(types015);
    expect(types016.size).toBe(6);
  });

  it('simulates the RPC filter: free sessions never advance progress', () => {
    // Behavioral mirror of the SQL predicate chain for extract_n (Banker)
    const sessions = [
      { ended_at: '2026-07-18T10:00:00Z', validated: true, extracted: true, is_free_play: false },
      { ended_at: '2026-07-18T11:00:00Z', validated: true, extracted: true, is_free_play: true }, // free bank - must not count
      { ended_at: '2026-07-18T12:00:00Z', validated: false, extracted: true, is_free_play: false }, // flagged - never counts
      { ended_at: null, validated: true, extracted: true, is_free_play: false }, // unfinished
    ];

    const counted = sessions.filter(
      (gs) =>
        gs.ended_at !== null &&
        gs.validated === true &&
        gs.is_free_play !== true &&
        gs.extracted
    );

    expect(counted).toHaveLength(1);
  });
});
