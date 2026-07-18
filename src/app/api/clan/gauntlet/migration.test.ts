/**
 * Migration 020 shape tests - Clan Gauntlet (Design v2 section 8)
 *
 * Pins the doc-precise rules into the SQL so a future edit cannot silently
 * drop them: the per-side dynasty resolution (section 8.2 - EACH clan's
 * counted runs must be in ITS OWN picked dynasty, no coin flip), the
 * Thu-Sun scored window, the blind-pick lock/reveal, the tithe cap, the
 * 12-node tree with the doc's tier costs, the single +1-counted-run
 * numeric node, and the duels-v1 legacy path for no-pick weeks.
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_020 = path.join(
  process.cwd(),
  'supabase/migrations/020_gauntlet.sql'
);

const sql = fs.readFileSync(MIGRATION_020, 'utf8');

describe('Migration 020: research schema (section 8.3)', () => {
  it('creates the research tables with the pooled-progress + target model', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS clan_research \(/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS clan_research_progress \(/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS clan_research_target \(/);
    expect(sql).toMatch(/PRIMARY KEY \(clan_id, node_id\)/);
  });

  it('checks node_id against exactly the 12 doc nodes (3 branches x 4)', () => {
    for (const branch of ['protocols', 'logistics', 'heraldry']) {
      for (const tier of [1, 2, 3, 4]) {
        expect(sql).toContain(`'${branch}_${tier}'`);
      }
    }
  });

  it("uses the doc's tier costs 6000/14000/24000/40000", () => {
    expect(sql).toMatch(/WHEN right\(p_node_id, 1\) = '1' THEN 6000/);
    expect(sql).toMatch(/WHEN right\(p_node_id, 1\) = '2' THEN 14000/);
    expect(sql).toMatch(/WHEN right\(p_node_id, 1\) = '3' THEN 24000/);
    expect(sql).toMatch(/WHEN right\(p_node_id, 1\) = '4' THEN 40000/);
  });

  it('enforces the 500 DNA/member/week tithe cap in table AND RPC', () => {
    // Row-level: a member's tithe in one clan can never exceed the cap
    expect(sql).toMatch(/amount > 0 AND amount <= 500/);
    // RPC-level: summed ACROSS clans (clan-hopping cannot reset the cap)
    expect(sql).toMatch(/FROM clan_tithes WHERE player_id = p_user_id AND week_start = v_week/);
    expect(sql).toMatch(/IF v_already \+ p_amount > 500 THEN/);
    expect(sql).toMatch(/TITHE_CAP_EXCEEDED/);
  });

  it('funds research through economy_transactions with the new clan_tithe source', () => {
    expect(sql).toMatch(/'clan_tithe'/);
    expect(sql).toMatch(/economy_transactions_source_type_check/);
    // The re-created CHECK must keep every pre-020 source type
    for (const source of [
      'game_reward', 'breeding_cost', 'purchase', 'daily_reward',
      'game_start', 'energy_regen', 'admin_grant', 'refund',
      'achievement_reward', 'streak_bonus', 'battle_pass_reward',
      'offline_claim', 'unlock_cost',
    ]) {
      expect(sql).toContain(`'${source}'`);
    }
  });

  it('officers SELECT the researched node; tithes auto-unlock the target', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION set_research_target\(p_user_id UUID, p_node_id TEXT\)/);
    expect(sql).toMatch(/NOT_AN_OFFICER/);
    expect(sql).toMatch(/gauntlet_try_unlock/);
    // Sequential prerequisite within a branch
    expect(sql).toMatch(/gauntlet_node_prereq/);
    expect(sql).toMatch(/PREREQ_LOCKED/);
  });
});

describe('Migration 020: blind picks (section 8.2)', () => {
  it('one pick row per clan per duel, dynasty mandatory', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS gauntlet_picks \(/);
    expect(sql).toMatch(/UNIQUE \(duel_id, clan_id\)/);
    expect(sql).toMatch(/dynasty_pick TEXT NOT NULL CHECK \(dynasty_pick IN \('PRIMAL', 'CYBER', 'COSMIC'\)\)/);
  });

  it('RLS keeps picks blind: own clan always, opponent only after both locked or Wed', () => {
    expect(sql).toMatch(/gauntlet_picks_select_blind/);
    expect(sql).toMatch(/clan_id IN \(SELECT clan_id FROM clan_members WHERE player_id = auth\.uid\(\)\)/);
    // Reveal condition: Wed 00:00 (week_start + 2) OR both clans locked
    expect(sql).toMatch(/d\.week_start \+ 2/);
    expect(sql).toMatch(/COUNT\(\*\) FROM gauntlet_picks gp2 WHERE gp2\.duel_id = d\.id\) = 2/);
  });

  it('submission locks at Wed 00:00 UTC and is final', () => {
    expect(sql).toMatch(/v_deadline := \(\(v_duel\.week_start \+ 2\)::timestamp AT TIME ZONE 'UTC'\)/);
    expect(sql).toMatch(/PICKS_CLOSED/);
    expect(sql).toMatch(/ALREADY_LOCKED/);
  });

  it('gates research modifiers and the split pick on unlocked nodes', () => {
    expect(sql).toMatch(/SPLIT_PICK_LOCKED/);
    expect(sql).toMatch(/'protocols_4'/);
    expect(sql).toMatch(/MODIFIER_LOCKED:protocols_2/);
    expect(sql).toMatch(/ANOMALY_NOT_LIVE/);
  });

  it('validates the ban against the full mutation catalog (base ten + mastery)', () => {
    for (const id of [
      'gold_trail', 'overgrowth', 'wall_rush', 'shed', 'mirror_wager',
      'magnet_pulse', 'time_dilation', 'splitter', 'phoenix', 'compound_interest',
    ]) {
      expect(sql).toContain(`'${id}'`);
    }
    expect(sql).toMatch(/SELECT 1 FROM mastery_mutations WHERE mutation_id = p_ban/);
  });
});

describe('Migration 020: resolution rule (section 8.2 - doc-precise)', () => {
  it('resolves PER SIDE: each clan gets its own dynasty/modifier lens - no coin flip', () => {
    // Side A is built from pick A (its own dynasty), banned by pick B; and
    // vice versa. There is no shared "resolved dynasty".
    expect(sql).toMatch(/v_side_a := gauntlet_build_side\(\s*v_duel\.clan_a/);
    expect(sql).toMatch(/v_side_b := gauntlet_build_side\(\s*v_duel\.clan_b/);
    expect(sql).toMatch(/CASE WHEN v_has_b THEN v_pick_b\.mutation_ban END/);
    expect(sql).toMatch(/CASE WHEN v_has_a THEN v_pick_a\.mutation_ban END/);
    expect(sql).not.toMatch(/coin_flip|random\(\)/i);
  });

  it('never resolves before Wed 00:00 and never for no-pick (legacy) weeks', () => {
    expect(sql).toMatch(/IF NOW\(\) < \(\(v_duel\.week_start \+ 2\)::timestamp AT TIME ZONE 'UTC'\) THEN\s*\n\s*RETURN;/);
    expect(sql).toMatch(/IF NOT v_has_a AND NOT v_has_b THEN\s*\n\s*RETURN;/);
  });

  it("bakes the doc's modifier lenses into effective rules", () => {
    // Vanguard: top 8, x1.10 | Deep Bench: 12 members, best 25 |
    // Extraction Doctrine: banked only, x1.15 | Sudden Death: best 10, x1.40
    expect(sql).toMatch(/IF p_modifier = 'vanguard' THEN\s*\n\s*v_top := 8; v_weight := 1\.10;/);
    expect(sql).toMatch(/ELSIF p_modifier = 'deep_bench' THEN\s*\n\s*v_top := 12; v_best := 25;/);
    expect(sql).toMatch(/ELSIF p_modifier = 'extraction_doctrine' THEN\s*\n\s*v_extracted := true; v_weight := 1\.15;/);
    expect(sql).toMatch(/ELSIF p_modifier = 'sudden_death' THEN\s*\n\s*v_best := 10; v_weight := 1\.40;/);
  });

  it('logistics_4 is the ONLY numeric node: +1 counted run on the base-30 lens', () => {
    expect(sql).toMatch(/clan_has_research\(p_clan_id, 'logistics_4'\)/);
    expect(sql).toMatch(/IF v_plus_one AND v_best = 30 THEN\s*\n\s*v_best := 31;/);
  });
});

describe('Migration 020: scoring (sections 8.1 + 8.2)', () => {
  it('counted runs only inside Thu 00:00 - Sun 24:00 once rules resolve', () => {
    // Scored window = [week_start + 3, week_start + 7)
    expect(sql).toMatch(/v_from := \(\(p_week_start \+ 3\)::timestamp AT TIME ZONE 'UTC'\)/);
    expect(sql).toMatch(/v_to TIMESTAMPTZ := \(\(p_week_start \+ 7\)::timestamp AT TIME ZONE 'UTC'\)/);
  });

  it('unresolved (legacy/pre-020) weeks keep the duels-v1 full-week scoring', () => {
    // p_side NULL => full week from Monday
    expect(sql).toMatch(/IF p_side IS NULL THEN\s*\n\s*v_from := \(p_week_start::timestamp AT TIME ZONE 'UTC'\);/);
    // Settlement falls back to the v1 scorer when no rules were resolved
    expect(sql).toMatch(/FROM clan_week_scores\(v_duel\.week_start\) s/);
  });

  it("counts only the side's own picked dynasty (or split pair)", () => {
    expect(sql).toMatch(/v_dyn IS NULL OR UPPER\(gs\.dynasty\) = v_dyn OR UPPER\(gs\.dynasty\) = v_dyn2/);
  });

  it('locks the roster at Monday pairing (anti-mercenary) and scores against it', () => {
    expect(sql).toMatch(/roster_a UUID\[\]/);
    expect(sql).toMatch(/ARRAY\(SELECT player_id FROM clan_members WHERE clan_id = v_a\)/);
    expect(sql).toMatch(/p_roster IS NULL OR cm\.player_id = ANY\(p_roster\)/);
  });

  it('applies the modifier weight to SCORING only (floor of sum x weight)', () => {
    expect(sql).toMatch(/FLOOR\(SUM\(member_dna\) \* v_weight\)/);
    // clan_duel_bonus (DNA payout path) is untouched by this migration
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION clan_duel_bonus/);
  });

  it('keeps ELO settlement (K=32) and the tie split from duels v1', () => {
    expect(sql).toMatch(/power\(10\.0, \(v_rating_b - v_rating_a\) \/ 400\.0\)/);
    expect(sql).toMatch(/ROUND\(32 \* \(1 - v_expected_winner\)\)/);
  });
});

describe('Migration 020: pool ban (section 8.2 item 3)', () => {
  it('exposes player_gauntlet_ban for session-start pool filtering', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION player_gauntlet_ban\(/);
    // Ban only inside the counted window...
    expect(sql).toMatch(/p_at < \(\(v_duel\.week_start \+ 3\)::timestamp AT TIME ZONE 'UTC'\)/);
    // ...and only for counted-dynasty runs
    expect(sql).toMatch(/v_dyn := v_side->>'dynasty';/);
  });

  it('accepts players.id with an auth.users.id fallback (clan_duel_bonus pattern)', () => {
    expect(sql).toMatch(/SELECT user_id INTO v_user_id FROM players WHERE id = p_player_id;/);
  });
});

describe('Migration 020: rivalry + revenge (section 8.4)', () => {
  it('derives clan_rivalries as a VIEW over settled clan_duels', () => {
    expect(sql).toMatch(/CREATE OR REPLACE VIEW clan_rivalries AS/);
    expect(sql).toMatch(/LEAST\(clan_a, clan_b\) AS clan_x/);
    expect(sql).toMatch(/GREATEST\(clan_a, clan_b\) AS clan_y/);
    expect(sql).toMatch(/\(ARRAY_AGG\(winner ORDER BY week_start DESC\)\)\[1\] AS last_winner/);
  });

  it('pairing prefers a revenge rematch when tied or trailing (season window)', () => {
    expect(sql).toMatch(/week_start >= v_week - 56/);
    expect(sql).toMatch(/<= \(COUNT\(\*\) FILTER \(WHERE winner = v_cand\)\)/);
  });
});

describe('Migration 020: v1 compatibility', () => {
  it('replaces settle_and_pair_duels and get_clan_duel with the SAME signatures', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION settle_and_pair_duels\(\)/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION get_clan_duel\(p_clan_id UUID\)/);
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtext\('clan_duels_settle'\)\)/);
  });

  it('adds only nullable/defaulted columns to clan_duels (v1 rows untouched)', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS effective_rules JSONB/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS rules_resolved_at TIMESTAMPTZ/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS gauntlet_meta JSONB NOT NULL DEFAULT '\{\}'/);
  });

  it('enables RLS on every new table', () => {
    for (const table of [
      'clan_research', 'clan_research_progress', 'clan_research_target',
      'clan_tithes', 'gauntlet_picks',
    ]) {
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    }
  });
});
