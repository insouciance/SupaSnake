/**
 * Migration 040 shape tests — the account multiplier stack, deleted
 * (Constitution §8.5, Rule 8, Rule 5, Rule 6; GROUND_TRUTH §3.1 faucets
 * #4-#6; build-log findings F-6b and F-10).
 *
 * Pins the structural guarantees into the SQL so a later edit cannot quietly
 * repeal them: that the clan-duel bonus RPC is gone rather than merely
 * unreferenced, that no tier table or cached column survives to re-feed a
 * streak multiplier, that the longest streak is banked into the `unbroken`
 * Legacy Record monotonically and the migration asserts that itself, and
 * that the Take-streak columns cannot represent a streak reset to zero.
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_040 = path.join(
  process.cwd(),
  'supabase/migrations/040_multiplier_stack_removal.sql'
);

const sql = fs.readFileSync(MIGRATION_040, 'utf8');

/**
 * The migration with every `--` comment stripped. Negative assertions run
 * against this: the header explains at length what the migration deletes and
 * why, and quoting a thing is not doing it.
 */
const code = sql.replace(/--[^\n]*/g, '');

describe('Migration 040: the clan-duel bonus (Rule 8, finding F-6b)', () => {
  it('drops the RPC itself, not just its call site', () => {
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS clan_duel_bonus\(UUID\);/);
  });

  it('never re-creates it under any guise', () => {
    expect(code).not.toMatch(/CREATE (?:OR REPLACE )?FUNCTION clan_duel_bonus/i);
    expect(code).not.toMatch(/GRANT EXECUTE ON FUNCTION clan_duel_bonus/i);
  });

  it('introduces no replacement intra-clan reward mathematics', () => {
    // Rule 8: no member's reward may change because of another member's
    // number. Nothing in this migration may reintroduce a clan-keyed payout.
    expect(code).not.toMatch(/1\.05/);
    expect(code).not.toMatch(/clan_members/);
  });
});

describe('Migration 040: the streak DNA multiplier', () => {
  it('drops the tier catalogue that priced it', () => {
    expect(sql).toMatch(/DROP TABLE IF EXISTS streak_bonus_tiers;/);
  });

  it('drops the per-player cached multiplier column', () => {
    expect(sql).toMatch(
      /ALTER TABLE player_streaks DROP COLUMN IF EXISTS streak_multiplier;/
    );
  });

  it('re-declares record_daily_play without any multiplier', () => {
    // The return type changes, so the old signature must be dropped first.
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS record_daily_play\(UUID\);/);
    const body = sql.slice(sql.indexOf('CREATE FUNCTION record_daily_play'));
    const declaration = body.slice(0, body.indexOf('$$ LANGUAGE plpgsql'));
    expect(declaration).not.toMatch(/streak_multiplier/);
    expect(declaration).not.toMatch(/streak_bonus_tiers/);
    expect(declaration).not.toMatch(/dna_multiplier/);
    expect(declaration).not.toMatch(/v_multiplier/);
  });

  it('keeps the streak advancing and its high-water mark monotonic', () => {
    expect(sql).toMatch(/longest_streak = GREATEST\(ps\.longest_streak, v_new_streak\)/);
    expect(sql).toMatch(/current_streak = v_new_streak/);
    expect(sql).toMatch(/grace_period_available/);
  });

  it('locks the SECURITY DEFINER streak RPC to the service role (Rule 11)', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION record_daily_play\(UUID\) FROM PUBLIC;/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION record_daily_play\(UUID\) FROM anon;/);
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION record_daily_play\(UUID\) FROM authenticated;/
    );
  });
});

describe('Migration 040: the longest streak becomes a Legacy Record (Rule 6)', () => {
  it('banks player_streaks.longest_streak into the `unbroken` record', () => {
    expect(sql).toMatch(/INSERT INTO player_records \(player_id, record_id, value, tier, updated_at\)/);
    expect(sql).toMatch(/rd\.id = 'unbroken'/);
    expect(sql).toMatch(/ps\.longest_streak/);
  });

  it('writes the record upward only, never downward', () => {
    // F-6 lives in refresh_player_records (WP-0.04) — this migration must
    // not inherit it. Both value and tier are GREATEST-guarded.
    expect(sql).toMatch(/SET value\s+= GREATEST\(player_records\.value, EXCLUDED\.value\)/);
    expect(sql).toMatch(/tier\s+= GREATEST\(player_records\.tier, EXCLUDED\.tier\)/);
    expect(code).not.toMatch(/SET value\s*=\s*EXCLUDED\.value/);
  });

  it('does not delegate the banked value to refresh_player_records', () => {
    expect(code).not.toMatch(/refresh_player_records/i);
  });

  it('grants the reached tier badges and never lowers legacy_score', () => {
    expect(sql).toMatch(/INSERT INTO player_cosmetics/);
    expect(sql).toMatch(/'record_unbroken_t' \|\| t\.tier/);
    expect(sql).toMatch(/ON CONFLICT \(player_id, cosmetic_id\) DO NOTHING/);
    expect(sql).toMatch(/legacy_score = GREATEST\(p\.legacy_score, banked\.total\)/);
  });

  it('asserts preservation inside the migration and aborts if it fails', () => {
    // A snapshot taken before any write, re-read after, inside one
    // transaction — the proof is in the file, not in a reviewer's head.
    expect(sql).toMatch(/CREATE TEMP TABLE wp_0_02_streak_pre ON COMMIT DROP AS/);
    expect(sql).toMatch(/record_value_before/);
    expect(sql).toMatch(/RAISE EXCEPTION[\s\S]{0,120}written downward \(Rule 6\)/);
    expect(sql).toMatch(/RAISE EXCEPTION[\s\S]{0,120}lost their longest streak/);
    expect(sql).toMatch(/RAISE EXCEPTION[\s\S]{0,160}below the streak they were banked from/);
    expect(sql.indexOf('BEGIN;')).toBeLessThan(sql.indexOf('wp_0_02_streak_pre'));
    expect(sql.indexOf('RAISE EXCEPTION')).toBeLessThan(sql.lastIndexOf('COMMIT;'));
  });

  it('destroys no player-owned streak data', () => {
    expect(code).not.toMatch(/DROP TABLE IF EXISTS player_streaks/i);
    expect(code).not.toMatch(/DELETE FROM player_streaks/i);
    expect(code).not.toMatch(/DELETE FROM player_records/i);
    expect(code).not.toMatch(/DROP COLUMN IF EXISTS longest_streak/i);
    expect(code).not.toMatch(/DROP COLUMN IF EXISTS current_streak/i);
  });
});

describe('Migration 040: the Take-streak columns (§7.2, Rule 5)', () => {
  it('adds the four columns additively', () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS take_streak_days\s+INTEGER\s+NOT NULL DEFAULT 0/
    );
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS take_tier\s+SMALLINT NOT NULL DEFAULT 0/
    );
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS take_longest_streak\s+INTEGER\s+NOT NULL DEFAULT 0/
    );
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS take_last_claim_date DATE/);
  });

  it('bounds the tier to the §7.2 ladder', () => {
    expect(sql).toMatch(/CHECK \(take_tier BETWEEN 0 AND 4\)/);
    expect(sql).toMatch(
      /CHECK \(take_streak_days >= \(ARRAY\[0, 3, 7, 14, 30\]\)\[take_tier \+ 1\]\)/
    );
  });

  it('makes a reset to zero unrepresentable once a Take has been collected', () => {
    // Rule 5: a missed day costs one tier, never the chain. A row with a
    // claim date and zero days is exactly the state cooling must never
    // produce — so the table refuses to hold it.
    expect(sql).toMatch(
      /CHECK \(\(take_last_claim_date IS NULL\) = \(take_streak_days = 0\)\)/
    );
  });

  it('keeps the Take high-water mark permanent (Rule 6)', () => {
    expect(sql).toMatch(
      /CHECK \(take_longest_streak >= take_streak_days AND take_longest_streak >= 0\)/
    );
  });

  it('adds schema only — no behaviour, which belongs to WP-1.04', () => {
    const takeSection = code.slice(code.indexOf('take_streak_days'));
    expect(takeSection).not.toMatch(/CREATE (?:OR REPLACE )?FUNCTION/i);
    expect(takeSection).not.toMatch(/CREATE TRIGGER/i);
    expect(takeSection).not.toMatch(/UPDATE player_streaks/i);
  });

  it('does not implement the Take payout anywhere in the migration', () => {
    expect(code).not.toMatch(/claim_daily_take|record_daily_take|daily_take/i);
    expect(code).not.toMatch(/\b100 DNA\b/);
  });
});

describe('Migration 040: hygiene', () => {
  it('runs as one transaction so a failed assertion reverts everything', () => {
    expect(sql.trimStart().startsWith('-- Migration 040')).toBe(true);
    expect(sql).toMatch(/^BEGIN;$/m);
    expect(sql).toMatch(/^COMMIT;$/m);
  });

  it('carries an explicit down-note', () => {
    expect(sql).toMatch(/DOWN-NOTE \(forward-only/);
    expect(sql).toMatch(/011_clan_duels\.sql:399-437/);
    expect(sql).toMatch(/009_dynasty_unification\.sql:/);
  });

  it('adds no new SECURITY DEFINER surface beyond the one it re-declares', () => {
    const definers = code.match(/SECURITY DEFINER/g) ?? [];
    expect(definers).toHaveLength(1);
  });
});
