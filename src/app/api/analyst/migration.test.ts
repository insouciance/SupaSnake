/**
 * Migration 025 shape tests (Identity v1 §9 — The Analyst).
 *
 * House pattern (022/023/024): the SQL file is asserted as text —
 * structure via regex, seed rows via literals, plus the standing
 * covenants (gen_random_uuid only, RLS on every new table, zero
 * economy faucets, no destructive statements, service-role-only RPCs).
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_025 = path.join(
  process.cwd(),
  'supabase/migrations/025_analyst.sql'
);
const sql = fs.readFileSync(MIGRATION_025, 'utf8');

describe('Migration 025: ai_insights cache (section 9.3)', () => {
  it('creates ai_insights with nullable player/clan owners and the at-least-one CHECK', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS ai_insights/);
    expect(sql).toMatch(/player_id UUID REFERENCES players\(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/clan_id UUID REFERENCES clans\(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(
      /CONSTRAINT ai_insights_owner_present CHECK \(player_id IS NOT NULL OR clan_id IS NOT NULL\)/
    );
  });

  it('constrains kind to exactly the five artifact kinds', () => {
    expect(sql).toMatch(
      /kind IN \('run_insight', 'archetype', 'weekly_digest', 'season_recall', 'scout_narration'\)/
    );
  });

  it('has the dedup unique index on (kind, scope_ref, COALESCE(owner))', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_insights_dedup\s*\n\s*ON ai_insights \(kind, scope_ref, COALESCE\(player_id, clan_id\)\)/
    );
  });

  it('tracks input_hash, model, content and token spend', () => {
    for (const column of ['scope_ref TEXT NOT NULL', 'input_hash TEXT', 'model TEXT', 'content JSONB NOT NULL', 'tokens_in INTEGER NOT NULL DEFAULT 0', 'tokens_out INTEGER NOT NULL DEFAULT 0']) {
      expect(sql).toContain(column);
    }
  });

  it('RLS: SELECT for own rows or clan members; writes stay server-only', () => {
    expect(sql).toMatch(
      /CREATE POLICY ai_insights_select_own_or_clan ON ai_insights\s*\n\s*FOR SELECT TO authenticated/
    );
    expect(sql).toMatch(
      /player_id IN \(SELECT id FROM players WHERE user_id = auth\.uid\(\)\)/
    );
    expect(sql).toMatch(
      /clan_id IN \(SELECT clan_id FROM clan_members WHERE player_id = auth\.uid\(\)\)/
    );
    // No write policies of any kind on ai_insights
    expect(sql).not.toMatch(/CREATE POLICY \S+ ON ai_insights\s*\n?\s*FOR (INSERT|UPDATE|DELETE)/);
    expect(sql).toContain('GRANT SELECT ON ai_insights TO authenticated;');
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL) ON ai_insights/);
  });
});

describe('Migration 025: ai_usage_daily circuit breaker (section 9.3)', () => {
  it('creates the day-keyed ledger under deny-all RLS', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS ai_usage_daily/);
    expect(sql).toMatch(/day DATE PRIMARY KEY/);
    expect(sql).toMatch(/tokens BIGINT NOT NULL DEFAULT 0/);
    expect(sql).toMatch(/calls INTEGER NOT NULL DEFAULT 0/);
    // Deny-all: RLS enabled, zero policies, zero grants
    expect(sql).toContain('ALTER TABLE ai_usage_daily ENABLE ROW LEVEL SECURITY;');
    expect(sql).not.toMatch(/CREATE POLICY \S+ ON ai_usage_daily/);
    expect(sql).not.toMatch(/GRANT \w+ ON ai_usage_daily/);
  });

  it('record_ai_usage: atomic upsert-increment, service-role only', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION record_ai_usage\(p_day DATE, p_tokens INTEGER\)/);
    expect(sql).toMatch(/ON CONFLICT \(day\) DO UPDATE/);
    expect(sql).toMatch(/tokens = ai_usage_daily\.tokens \+/);
    for (const role of ['PUBLIC', 'anon', 'authenticated']) {
      expect(sql).toContain(
        `REVOKE EXECUTE ON FUNCTION record_ai_usage(DATE, INTEGER) FROM ${role};`
      );
    }
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION record_ai_usage/);
  });
});

describe('Migration 025: prune_run_events (section 9.5 retention)', () => {
  it('nulls only run_events past the floor-guarded cutoff; death_cause untouched', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION prune_run_events\(p_days INTEGER DEFAULT 90\)/);
    expect(sql).toMatch(/SET run_events = NULL/);
    expect(sql).toMatch(/GREATEST\(COALESCE\(p_days, 90\), 30\)/);
    expect(sql).not.toMatch(/death_cause\s*=\s*NULL/i);
    for (const role of ['PUBLIC', 'anon', 'authenticated']) {
      expect(sql).toContain(
        `REVOKE EXECUTE ON FUNCTION prune_run_events(INTEGER) FROM ${role};`
      );
    }
  });
});

describe('Migration 025: email digest opt-in (player_settings, 012 pattern)', () => {
  it('adds the boolean column, default OFF', () => {
    expect(sql).toMatch(
      /ALTER TABLE player_settings\s*\n\s*ADD COLUMN IF NOT EXISTS email_digest_opt_in BOOLEAN NOT NULL DEFAULT false/
    );
  });
});

describe('Migration 025: archetype badges (sections 5.5/9.6)', () => {
  it('seeds all 9 archetype badge definitions, epic, season-stamped', () => {
    for (const slug of [
      'surgeon', 'daredevil', 'loyalist', 'polymath', 'alchemist',
      'purist', 'redliner', 'metronome', 'hatchling',
    ]) {
      expect(sql).toContain(`('archetype_${slug}',`);
    }
    // 9 badge rows, all epic, all badge slot, all render-stamped season 1
    const badgeRows = sql.match(/\('archetype_\w+',[^\n]+'badge', 'epic', 1,/g) || [];
    expect(badgeRows.length).toBe(9);
    const seasonStamps = sql.match(/"archetype":"\w+","season":1,"source":"system"/g) || [];
    expect(seasonStamps.length).toBe(9);
  });

  it('is idempotent (ON CONFLICT DO NOTHING)', () => {
    expect(sql).toMatch(/ON CONFLICT \(id\) DO NOTHING/);
  });
});

describe('Migration 025: rate limits', () => {
  it("re-declares the action CHECK carrying 023's list plus 'analyst'", () => {
    expect(sql).toContain(
      "CHECK (action_type IN ('game_start', 'breeding', 'purchase', 'handle_check', 'handle_claim', 'records_refresh', 'analyst'))"
    );
  });
});

describe('Migration 025: standing covenants', () => {
  it('uses gen_random_uuid, never uuid_generate_v4', () => {
    expect(sql).toMatch(/gen_random_uuid\(\)/);
    expect(sql).not.toMatch(/uuid_generate_v4/);
  });

  it('every new table enables RLS', () => {
    for (const table of ['ai_insights', 'ai_usage_daily']) {
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    }
  });

  it('adds zero economy faucets or sinks (section 10.1)', () => {
    expect(sql).not.toMatch(/INSERT INTO economy_transactions/);
    expect(sql).not.toMatch(/UPDATE players SET dna/);
    expect(sql).not.toMatch(/SET energy/);
  });

  it('contains no destructive statements', () => {
    expect(sql).not.toMatch(/\bDROP TABLE\b/);
    expect(sql).not.toMatch(/\bTRUNCATE\b/);
    expect(sql).not.toMatch(
      /DELETE FROM (players|game_sessions|economy_transactions|player_cosmetics|player_settings)/
    );
  });
});
