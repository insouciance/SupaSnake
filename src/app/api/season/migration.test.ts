/**
 * Migration 021 shape tests - Seasons + Weekly Anomaly boards (Design v2
 * Phase 4B, sections 7.2 / 7.3 / 8.3 / 8.4)
 *
 * Pins the doc-precise rules into the SQL so a future edit cannot
 * silently drop them: the 7-week Season 1 window and its "add, never
 * wipe" covenant, the free track carried by the battle pass tables with
 * reroll-token milestones, the 4-anomaly rotation mirror, normal-DNA
 * anomaly sessions with their own board, the Anomaly Tourist activation
 * inside the 017-derived refresh_contract_progress, the retirement of
 * ANOMALY_NOT_LIVE (Anomaly Doctrine now gates on protocols_1), anomaly
 * exclusion from counted duel scoring, the top-8 playoff bracket on the
 * weekly protocol, and the season rivalry window replacing the 8-week
 * proxy.
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_021 = path.join(
  process.cwd(),
  'supabase/migrations/021_seasons_anomaly.sql'
);

const sql = fs.readFileSync(MIGRATION_021, 'utf8');

describe('Migration 021: seasons (section 7.2)', () => {
  it('creates the seasons table with Monday-aligned whole-week windows', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS seasons \(/);
    expect(sql).toMatch(/seq INTEGER NOT NULL UNIQUE/);
    expect(sql).toMatch(/starts_on DATE NOT NULL/);
    expect(sql).toMatch(/ends_on DATE NOT NULL/);
    // 6-8 week doc band, whole weeks only
    expect(sql).toMatch(/BETWEEN 42 AND 56/);
    expect(sql).toMatch(/% 7 = 0/);
  });

  it('seeds Season 1 as a 7-week window starting Monday 2026-07-20 UTC', () => {
    expect(sql).toMatch(/DATE '2026-07-20', DATE '2026-09-07'/);
    expect(sql).toMatch(/Season 1 — Solstice/);
  });

  it('seasons ADD and never wipe: no destructive statements on player state', () => {
    expect(sql).not.toMatch(/\bDROP TABLE\b/);
    expect(sql).not.toMatch(/\bTRUNCATE\b/);
    expect(sql).not.toMatch(/DELETE FROM (players|collected_snakes|player_battle_pass|player_mastery|player_contracts)/);
  });

  it('links the game season to the battle pass season that carries the track', () => {
    expect(sql).toMatch(/battle_pass_season_id UUID REFERENCES battle_pass_seasons\(id\)/);
    expect(sql).toMatch(/INSERT INTO battle_pass_seasons/);
    expect(sql).toMatch(/ON CONFLICT \(season_number\) DO NOTHING/);
  });
});

describe('Migration 021: free season track (sections 7.2 + 7.3)', () => {
  it('extends battle_pass_tiers rewards with reroll_token, keeping every prior type', () => {
    expect(sql).toMatch(/battle_pass_tiers_reward_type_check/);
    for (const type of ['dna', 'energy', 'variant', 'cosmetic', 'title', 'reroll_token']) {
      expect(sql).toContain(`'${type}'`);
    }
  });

  it('seeds FREE milestones only (cosmetic line + reroll tokens + capstone title)', () => {
    expect(sql).toMatch(/'reroll_token', NULL,\s+1\)/);
    expect(sql).toMatch(/'solstice_sovereign'/);
    // Every seeded tier is free - no premium track
    expect(sql).toMatch(/SELECT bps\.id, t\.level, false, t\.reward_type/);
    expect(sql).not.toMatch(/, true, t\.reward_type/);
  });

  it('claim_season_tier grants tokens to players.player_reroll_tokens (018)', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION claim_season_tier\(p_player_id UUID, p_level INTEGER\)/);
    expect(sql).toMatch(/player_reroll_tokens = player_reroll_tokens \+ COALESCE\(v_tier\.reward_amount, 1\)/);
    expect(sql).toMatch(/LEVEL_NOT_REACHED/);
    expect(sql).toMatch(/ALREADY_CLAIMED/);
    // Future dna/energy tiers ride the PRE-EXISTING source type - the 020
    // economy_transactions CHECK is not re-created by this migration
    expect(sql).toMatch(/'battle_pass_reward'/);
    expect(sql).not.toMatch(/economy_transactions_source_type_check/);
  });
});

describe('Migration 021: seasonal mutations (section 7.2)', () => {
  it('seeds the Season 1 trio into season_mutations', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS season_mutations \(/);
    for (const id of ['solstice_engine', 'glacial_reserve', 'midnight_oil']) {
      expect(sql).toContain(`'${id}'`);
    }
  });

  it('seasonal mutations are bannable in the Gauntlet pick RPC', () => {
    expect(sql).toMatch(/SELECT 1 FROM season_mutations WHERE mutation_id = p_ban/);
    // ...alongside the existing catalogs
    expect(sql).toMatch(/SELECT 1 FROM mastery_mutations WHERE mutation_id = p_ban/);
  });
});

describe('Migration 021: weekly anomaly board (section 7.2)', () => {
  it('marks sessions with a server-derived anomaly id + week', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS anomaly_id TEXT CHECK \(anomaly_id IN \(/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS anomaly_week DATE/);
    for (const id of ['meteor_shower', 'gold_rush', 'blackout', 'twin_exits']) {
      expect(sql).toContain(`'${id}'`);
    }
  });

  it('rotation mirror: weeks since Monday 2024-01-01, mod 4, launch order', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION anomaly_for_week\(p_week DATE\)/);
    expect(sql).toMatch(/ARRAY\['meteor_shower', 'gold_rush', 'blackout', 'twin_exits'\]/);
    expect(sql).toMatch(/DATE '2024-01-01'\) \/ 7, 4\)/);
  });

  it('board reads: top 10 best-score-per-player, validated non-free runs only', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION get_anomaly_board\(p_player_id UUID\)/);
    expect(sql).toMatch(/MAX\(gs\.score\) AS best_score/);
    expect(sql).toMatch(/gs\.validated IS TRUE/);
    expect(sql).toMatch(/gs\.is_free_play IS NOT TRUE/);
    expect(sql).toMatch(/WHERE r\.rank <= 10/);
  });
});

describe('Migration 021: contracts (section 7.3)', () => {
  it('activates Anomaly Tourist', () => {
    expect(sql).toMatch(/UPDATE contract_definitions SET active = true WHERE id = 'anomaly_tourist';/);
  });

  it('refresh_contract_progress derives from 017: #variable_conflict + free-play filters intact', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION refresh_contract_progress\(p_player_id UUID, p_date DATE\)/);
    expect(sql).toMatch(/#variable_conflict use_column/);
    // The 016/017 free-play exclusion must survive on EVERY session read
    const refreshBody = sql.slice(
      sql.indexOf('refresh_contract_progress'),
      sql.indexOf('claim_season_tier')
    );
    const sessionReads = refreshBody.match(/FROM game_sessions gs/g) || [];
    const freePlayFilters = refreshBody.match(/gs\.is_free_play IS NOT TRUE/g) || [];
    expect(sessionReads.length).toBeGreaterThanOrEqual(7);
    expect(freePlayFilters.length).toBe(sessionReads.length);
  });

  it('anomaly_run counts completed anomaly sessions (banked or crashed)', () => {
    expect(sql).toMatch(/WHEN 'anomaly_run' THEN/);
    expect(sql).toMatch(/AND gs\.anomaly_id IS NOT NULL;/);
  });
});

describe('Migration 021: gauntlet integration (sections 8.2 + 8.3)', () => {
  it('retires ANOMALY_NOT_LIVE: Anomaly Doctrine gates on protocols_1', () => {
    expect(sql).not.toMatch(/RAISE EXCEPTION 'ANOMALY_NOT_LIVE'/);
    expect(sql).toMatch(/IF p_modifier = 'anomaly_doctrine'\s*\n\s*AND NOT clan_has_research\(v_member\.clan_id, 'protocols_1'\) THEN\s*\n\s*RAISE EXCEPTION 'MODIFIER_LOCKED:protocols_1';/);
  });

  it('anomaly_doctrine lens: include anomaly runs, weight x1.20', () => {
    expect(sql).toMatch(/ELSIF p_modifier = 'anomaly_doctrine' THEN\s*\n\s*v_include_anomaly := true; v_weight := 1\.20;/);
    expect(sql).toMatch(/'include_anomaly', v_include_anomaly/);
  });

  it('anomaly runs leave EVERY other counted pool (v1 + rules-aware scorers)', () => {
    // v1 scorers: hard exclusion
    const v1Blocks = sql.match(/gs\.anomaly_id IS NULL\s+-- anomaly runs: own board only/g) || [];
    expect(v1Blocks.length).toBe(2); // clan_week_scores + clan_top_contributors
    // rules-aware scorers: doctrine-gated inclusion
    const gated = sql.match(/\(v_incl_anomaly OR gs\.anomaly_id IS NULL\)/g) || [];
    expect(gated.length).toBe(2); // gauntlet_side_score + gauntlet_top_contributors
  });

  it('keeps the 020 lens numbers and the logistics_4 +1 run intact', () => {
    expect(sql).toMatch(/v_top := 8; v_weight := 1\.10;/);
    expect(sql).toMatch(/v_top := 12; v_best := 25;/);
    expect(sql).toMatch(/v_extracted := true; v_weight := 1\.15;/);
    expect(sql).toMatch(/v_best := 10; v_weight := 1\.40;/);
    expect(sql).toMatch(/IF v_plus_one AND v_best = 30 THEN\s*\n\s*v_best := 31;/);
  });
});

describe('Migration 021: season playoffs (section 8.4)', () => {
  it('bracket tables: matches (QF/SF, seeds, duel link) + champion banner history', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS season_playoff_matches \(/);
    expect(sql).toMatch(/round TEXT NOT NULL CHECK \(round IN \('quarterfinal', 'semifinal'\)\)/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS season_champions \(/);
    expect(sql).toMatch(/clan_name TEXT NOT NULL/); // survives clan deletion
  });

  it('seeds top 8 by rating at season week 6: 1v8, 2v7, 3v6, 4v5', () => {
    expect(sql).toMatch(/ROW_NUMBER\(\) OVER \(ORDER BY rating DESC, created_at ASC, id ASC\) AS seed/);
    expect(sql).toMatch(/LIMIT 8/);
    expect(sql).toMatch(/9 - s\.slot/);
    expect(sql).toMatch(/v_season\.ends_on - 14/);
  });

  it('championship week: SF re-bracket W(QF1)vW(QF4), W(QF2)vW(QF3)', () => {
    expect(sql).toMatch(/VALUES \(1, 1, 4\), \(2, 2, 3\)/);
    expect(sql).toMatch(/v_season\.ends_on - 7/);
  });

  it('champion = higher championship-week score among SF winners, seed tiebreak', () => {
    expect(sql).toMatch(/ORDER BY sf\.week_score DESC, sf\.seed ASC/);
    expect(sql).toMatch(/INSERT INTO season_champions/);
  });

  it('playoff weeks ride the weekly protocol: bracket pairs become clan_duels first', () => {
    expect(sql).toMatch(/WHERE week_start = v_week AND duel_id IS NULL AND clan_b IS NOT NULL/);
    expect(sql).toMatch(/UPDATE season_playoff_matches\s*\n\s*SET duel_id = v_new_duel_id/);
    expect(sql).toMatch(/v_used := v_used \|\| v_match\.clan_a \|\| v_match\.clan_b;/);
  });

  it('champion rewards are cosmetic: no economy grant anywhere near the champion path', () => {
    const championBlock = sql.slice(
      sql.indexOf('-- (c) Champion'),
      sql.indexOf('11. DUEL SCORING')
    );
    expect(championBlock).not.toMatch(/UPDATE players SET dna/);
    expect(championBlock).not.toMatch(/economy_transactions/);
  });
});

describe('Migration 021: season rivalry window (section 8.4)', () => {
  it('rivalry_window_start prefers the covering season, 8-week proxy fallback', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION rivalry_window_start\(p_week DATE\)/);
    expect(sql).toMatch(/p_week - 56/);
  });

  it('settle_and_pair_duels and get_clan_duel use the season window', () => {
    expect(sql).toMatch(/week_start >= v_window_start/);
    expect(sql).toMatch(/week_start >= rivalry_window_start\(v_week\)/);
    // The raw 8-week proxy survives only inside the fallback helper
    expect(sql).not.toMatch(/v_week - 56/);
    const proxyUses = sql.match(/p_week - 56/g) || [];
    expect(proxyUses.length).toBe(1);
  });
});

describe('Migration 021: RLS + payout invariants', () => {
  it('enables RLS on every new table', () => {
    for (const table of [
      'seasons', 'season_mutations', 'season_playoff_matches', 'season_champions',
    ]) {
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    }
  });

  it('never touches the DNA payout multipliers (clan_duel_bonus untouched)', () => {
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION clan_duel_bonus/);
    expect(sql).not.toMatch(/streak_multiplier/);
  });
});
