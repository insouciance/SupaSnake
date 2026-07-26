/**
 * Migration 046 shape tests — the World Serpent (Constitution §7.3, §6.2,
 * Rules 3, 6, 8 and 11).
 *
 * Three of this work package's guarantees are properties of the SQL rather
 * than of any runtime check, and a property nobody watches is a property that
 * quietly stops being true:
 *
 *   IDEMPOTENT — no accumulated number is ever incremented. Every one is a
 *     recompute (SUM over persisted rows) landing through GREATEST.
 *   MONOTONIC  — no player-owned number can be written downward, and the
 *     migration aborts itself if one moves.
 *   UNGRADED   — clan Depth is a plain SUM with no threshold anywhere near it,
 *     and settlement pays no DNA, no cosmetic and no entitlement.
 */

import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION = path.join(process.cwd(), 'supabase/migrations/046_world_serpent.sql');
const sql = fs.readFileSync(MIGRATION, 'utf8');

/**
 * The migration with every `--` comment stripped. Negative assertions run
 * against this: the header explains at length what settlement must never do,
 * and naming a thing is not doing it.
 */
const code = sql.replace(/--[^\n]*/g, '');

const settlementBody = (() => {
  const start = code.indexOf('CREATE OR REPLACE FUNCTION apply_serpent_week_settlement');
  const end = code.indexOf('$$ LANGUAGE plpgsql VOLATILE;', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return code.slice(start, end);
})();

const ensureBody = (() => {
  const start = code.indexOf('CREATE OR REPLACE FUNCTION ensure_serpent_week');
  const end = code.indexOf('$$ LANGUAGE plpgsql VOLATILE;', start);
  expect(start).toBeGreaterThan(-1);
  return code.slice(start, end);
})();

describe('the migration is additive and forward-only', () => {
  it('is one transaction', () => {
    expect(code).toMatch(/^\s*BEGIN;/m);
    expect(code.trimEnd().endsWith('COMMIT;')).toBe(true);
  });

  it('creates the four Serpent tables and alters nothing that existed', () => {
    for (const table of [
      'serpent_weeks',
      'serpent_week_players',
      'serpent_week_clans',
      'serpent_chronicle_entries',
    ]) {
      expect(code).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
    }
    // The only ALTERs are ADD COLUMN IF NOT EXISTS and ENABLE ROW LEVEL SECURITY.
    const alters = [...code.matchAll(/ALTER TABLE\s+(\w+)([\s\S]*?);/g)];
    expect(alters.length).toBeGreaterThan(0);
    for (const alter of alters) {
      expect(alter[2]).toMatch(/ADD COLUMN IF NOT EXISTS|ENABLE ROW LEVEL SECURITY/);
      expect(alter[2]).not.toMatch(/DROP COLUMN|ALTER COLUMN|RENAME/);
    }
  });

  it('destroys nothing', () => {
    expect(code).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(code).not.toMatch(/\bTRUNCATE\b/i);
    expect(code).not.toMatch(/\bDROP\s+TABLE\b/i);
  });

  it('carries an explicit down-note', () => {
    expect(sql).toMatch(/DOWN-NOTE \(forward-only\)/);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS apply_serpent_week_settlement/);
  });
});

describe('IDEMPOTENT — nothing is incremented, everything is recomputed', () => {
  it('no accumulator is ever written as itself plus something', () => {
    // `col = col + x` in any form is the one shape that would break a re-run.
    expect(settlementBody).not.toMatch(/\b(lifetime_depth|best_week_depth|depth)\s*=\s*[\w.]*\1\s*\+/i);
    expect(settlementBody).not.toMatch(/lifetime_depth\s*=\s*\w*\.?lifetime_depth\s*\+/i);
  });

  it('lifetime Depth is a SUM over the persisted weekly rows', () => {
    expect(settlementBody).toMatch(/SUM\(swp\.depth\)/);
    expect(settlementBody).toMatch(/SUM\(swc\.depth\)/);
    expect(settlementBody).toMatch(/lifetime_depth\s*=\s*GREATEST\(/i);
  });

  it('clan Depth is a SUM of member Depths — the additive rule, in SQL', () => {
    expect(settlementBody).toMatch(/FROM serpent_week_players swp[\s\S]{0,400}GROUP BY swp\.clan_id/);
  });

  it('the week is stamped with COALESCE, so a re-run cannot rewrite it', () => {
    expect(settlementBody).toMatch(/settled_at\s*=\s*COALESCE\(w\.settled_at,\s*NOW\(\)\)/);
  });

  it('Chronicle entries are uniquely indexed and inserted ON CONFLICT DO NOTHING', () => {
    expect(code).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_serpent_chronicle_personal/);
    expect(code).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_serpent_chronicle_clan/);
    const inserts = [
      ...settlementBody.matchAll(/INSERT INTO serpent_chronicle_entries[\s\S]{0,700}?(?=;)/g),
    ];
    expect(inserts.length).toBe(2);
    for (const insert of inserts) {
      expect(insert[0]).toMatch(/ON CONFLICT DO NOTHING/);
    }
  });

  it('serializes concurrent settlements of the same week', () => {
    expect(settlementBody).toMatch(/FROM serpent_weeks w WHERE w\.id = p_week_id FOR UPDATE/);
  });
});

describe('MONOTONIC — no earned number can be written downward (Rules 5, 6)', () => {
  it('every carried number lands through GREATEST', () => {
    for (const column of ['lifetime_depth', 'best_week_depth', 'depth', 'attempts', 'best_yield']) {
      const assignments = [
        ...settlementBody.matchAll(new RegExp(`${column}\\s*=\\s*([^,\\n]+)`, 'g')),
      ].map((match) => match[1]);
      expect(assignments.length).toBeGreaterThan(0);
      for (const assignment of assignments) {
        // Either a GREATEST clamp, or the initial value of an INSERT column list.
        expect(
          /GREATEST\(/i.test(assignment) ||
            /COALESCE\(/i.test(assignment) ||
            /^\s*(0|EXCLUDED\.|CASE)/i.test(assignment)
        ).toBe(true);
      }
    }
  });

  it('the migration aborts itself if a player-owned value moved down', () => {
    expect(code).toMatch(/CREATE TEMP TABLE serpent_pre_migration_players/);
    expect(code).toMatch(/CREATE TEMP TABLE serpent_pre_migration_sessions/);
    expect(code).toMatch(/CREATE TEMP TABLE serpent_pre_migration_records/);
    const raises = code.match(/RAISE EXCEPTION 'Migration 046 aborted/g) ?? [];
    expect(raises.length).toBeGreaterThanOrEqual(4);
  });

  it('checks DNA, lifetime earnings, legacy score, high score, sessions and records', () => {
    for (const column of [
      'dna',
      'total_dna_earned',
      'legacy_score',
      'high_score',
      'dna_earned',
      'end_reason',
    ]) {
      expect(code).toContain(column);
    }
  });
});

describe('UNGRADED — Rule 8 has no place to hide in this schema', () => {
  it('there is no threshold, minimum, floor, quota or requirement column', () => {
    for (const forbidden of [
      'threshold',
      'minimum',
      'min_depth',
      'floor',
      'quota',
      'required_depth',
      'cut_line',
      'pass_fail',
    ]) {
      expect(code.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('settlement never writes a currency, an entitlement or a cosmetic', () => {
    for (const forbidden of [
      'economy_transactions',
      'player_cosmetics',
      'entitlement',
      'premium',
      'subscription',
      'stripe',
      'charges_used',
      'total_dna_earned',
    ]) {
      expect(settlementBody.toLowerCase()).not.toContain(forbidden);
    }
    expect(settlementBody).not.toMatch(/UPDATE players[\s\S]{0,200}\bdna\b\s*=/i);
  });

  it('does not read a clan role, so no officer lever can exist', () => {
    expect(settlementBody.toLowerCase()).not.toContain('role');
    expect(settlementBody.toLowerCase()).not.toContain('officer');
  });

  it('never touches the legacy graded contribution columns', () => {
    expect(code).not.toContain('weekly_contribution');
    expect(code).not.toContain('total_contribution');
  });
});

describe('SERVER AUTHORITY — both RPCs are service-role only (Rule 11)', () => {
  const signatures = [
    'ensure_serpent_week(DATE, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[])',
    'apply_serpent_week_settlement(UUID, JSONB)',
  ];

  it.each(signatures)('%s is SECURITY DEFINER with a pinned search_path', (signature) => {
    const name = signature.split('(')[0];
    const body = name === 'ensure_serpent_week' ? ensureBody : settlementBody;
    expect(body).toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/SET search_path = public, pg_temp/);
  });

  it.each(signatures)('%s is revoked from everyone but service_role', (signature) => {
    const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const role of ['PUBLIC', 'anon', 'authenticated']) {
      expect(code).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${escaped} FROM ${role};`));
    }
    expect(code).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${escaped} TO service_role;`));
  });

  it('every Serpent table has RLS on and no anon/authenticated grant', () => {
    for (const table of [
      'serpent_weeks',
      'serpent_week_players',
      'serpent_week_clans',
      'serpent_chronicle_entries',
    ]) {
      expect(code).toMatch(new RegExp(`ALTER TABLE ${table}\\s+ENABLE ROW LEVEL SECURITY;`));
      expect(code).toMatch(new RegExp(`REVOKE ALL ON ${table}\\s+FROM anon, authenticated;`));
    }
    expect(code).not.toMatch(/CREATE POLICY[\s\S]{0,200}TO (anon|authenticated)/);
  });

  it('the week refuses to be rewritten once it exists', () => {
    expect(ensureBody).toMatch(/ON CONFLICT \(week_start\) DO NOTHING/);
    expect(ensureBody).toMatch(/RAISE EXCEPTION[\s\S]{0,200}already exists with seed/);
    expect(ensureBody).toMatch(/RAISE EXCEPTION[\s\S]{0,200}different modifier set/);
  });

  it('one Serpent per calendar week — §12.2, as a UNIQUE constraint', () => {
    expect(code).toMatch(/week_start\s+DATE\s+NOT NULL UNIQUE/);
  });
});

describe('run flagging', () => {
  it('adds the column the charge exemption needs, referencing the week', () => {
    expect(code).toMatch(
      /ALTER TABLE game_sessions\s+ADD COLUMN IF NOT EXISTS serpent_week_id UUID\s+REFERENCES serpent_weeks\(id\)/
    );
  });

  it('indexes the settlement scan', () => {
    expect(code).toMatch(/idx_game_sessions_serpent_week/);
  });
});
