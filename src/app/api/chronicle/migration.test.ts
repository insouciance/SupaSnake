/**
 * Migration 023 shape tests - Records & Chronicle (Player Identity v1,
 * PLAYER_IDENTITY_V1.md sections 6 + 7)
 *
 * Pins the doc-precise rules into the SQL so a future edit cannot
 * silently drop them: the 21 record definitions with their authored
 * thresholds, the {5,10,20,35,60} tier points, the 105-badge generation
 * with the tier->rarity map, the 6 capstone titles, legacy_score (+DESC
 * index), the service-role-only refresh RPC, clan_rating_history + the
 * IDENTICAL-signature settle_and_pair_duels re-declaration, the
 * legacy_score-appended identity view, the PB-timeline index, and the
 * records_refresh rate-limit action. Plus the project covenants:
 * gen_random_uuid only, zero economy faucets, achievements untouched by
 * THIS migration (they were retired later, by 042 - see
 * src/lib/server/achievementsToRecords.migration.test.ts).
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_023 = path.join(
  process.cwd(),
  'supabase/migrations/023_records_chronicle.sql'
);

const sql = fs.readFileSync(MIGRATION_023, 'utf8');

describe('Migration 023: legacy score (section 6.2)', () => {
  it('adds players.legacy_score with a DESC index', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS legacy_score INTEGER NOT NULL DEFAULT 0/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_players_legacy_score\s*\n\s*ON players \(legacy_score DESC\)/);
  });

  it('documents legacy score as prestige-only (never economy/matchmaking input)', () => {
    expect(sql).toMatch(/never an economy or matchmaking input/i);
  });
});

describe('Migration 023: record definitions (section 6.1)', () => {
  it('creates record_definitions with the 6 categories and 5-slot arrays', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS record_definitions/);
    expect(sql).toMatch(/category IN \('extraction', 'dynasty', 'collection', 'gauntlet', 'veterancy', 'legacy'\)/);
    expect(sql).toMatch(/array_length\(thresholds, 1\) = 5/);
    expect(sql).toMatch(/array_length\(tier_points, 1\) = 5/);
  });

  it('tier points are {5,10,20,35,60} (cumulative banking)', () => {
    expect(sql).toMatch(/DEFAULT '\{5,10,20,35,60\}'/);
  });

  it('seeds all 21 records', () => {
    for (const id of [
      'vault', 'high_water', 'clean_getaways', 'cold_blood',
      'primal_depth', 'cyber_depth', 'cosmic_depth',
      'menagerie', 'bloodline', 'geneflow',
      'on_the_wall', 'campaigner', 'benefactor',
      'tenure', 'unbroken', 'mileage',
      'stormchaser', 'board_presence', 'chronicler', 'dynast_of_seasons', 'crowned',
    ]) {
      expect(sql).toContain(`('${id}',`);
    }
  });

  it('extraction thresholds match the doc byte-for-byte', () => {
    expect(sql).toContain("'{5000,25000,100000,400000,1000000}'"); // The Vault
    expect(sql).toContain("'{500,1200,2500,4500,6500}'"); // High Water
    expect(sql).toContain("'{10,50,250,1000,2500}'"); // Clean Getaways
    expect(sql).toContain("'{1,10,50,200,500}'"); // Cold Blood
    expect(sql).toMatch(/banked at 63\+ foods/); // the >=3-portals proof
  });

  it('dynasty depth tiers are the M2/M4/M6/M8/M10 XP thresholds', () => {
    const matches = sql.match(/\{3000,14000,41000,92000,175000\}/g) || [];
    expect(matches.length).toBe(3); // one per dynasty
  });

  it('collection, gauntlet, veterancy and legacy thresholds match the doc', () => {
    expect(sql).toContain("'{5,12,20,26,30}'"); // Menagerie (of 30)
    expect(sql).toContain("'{2,3,5,8,12}'"); // Bloodline
    expect(sql).toContain("'{5,20,50,150,400}'"); // Geneflow
    expect(sql).toContain("'{10,50,200,600,1500}'"); // On the Wall
    expect(sql).toContain("'{2,6,15,30,60}'"); // Campaigner
    expect(sql).toContain("'{500,2500,8000,20000,50000}'"); // Benefactor
    expect(sql).toContain("'{30,90,365,730,1461}'"); // Tenure
    expect(sql).toContain("'{7,14,30,60,120}'"); // Unbroken
    expect(sql).toContain("'{50,250,1000,3000,8000}'"); // Mileage
    expect(sql).toContain("'{2,8,20,40,80}'"); // Stormchaser
    expect(sql).toContain("'{1,5,15,40,100}'"); // Board Presence
    expect(sql).toContain("'{10,30,75,150,300}'"); // Chronicler
    expect(sql).toContain("'{1,2,4,7,12}'"); // Dynast of Seasons
    expect(sql).toContain("'{1,2,3,4,5}'"); // Crowned
  });

  it('player_records: PK (player, record), tier 0-5, RLS with select-own', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS player_records/);
    expect(sql).toMatch(/tier BETWEEN 0 AND 5/);
    expect(sql).toMatch(/PRIMARY KEY \(player_id, record_id\)/);
    expect(sql).toContain('ALTER TABLE player_records ENABLE ROW LEVEL SECURITY;');
    expect(sql).toMatch(/CREATE POLICY player_records_select_own/);
  });
});

describe('Migration 023: record-tier badges + capstones (sections 5.5, 6.4)', () => {
  it('generates the 105 badge defs (21 records x 5 tiers) from record_definitions', () => {
    expect(sql).toMatch(/'record_' \|\| rd\.id \|\| '_t' \|\| t\.tier/);
    expect(sql).toMatch(/FROM record_definitions rd\s*\n\s*CROSS JOIN generate_series\(1, 5\) AS t\(tier\)/);
  });

  it('maps tier to rarity: Bronze->common ... Apex->legendary; Apex animated', () => {
    expect(sql).toMatch(/ARRAY\['common', 'uncommon', 'rare', 'epic', 'legendary'\]/);
    expect(sql).toMatch(/ARRAY\['Bronze', 'Silver', 'Gold', 'Diamond', 'Apex'\]/);
    expect(sql).toMatch(/'animated', t\.tier = 5/);
  });

  it('seeds the 6 capstone titles, all legendary, one per category', () => {
    for (const [id, category] of [
      ['title_extractor_prime', 'extraction'],
      ['title_apex_handler', 'dynasty'],
      ['title_grand_curator', 'collection'],
      ['title_warmaster', 'gauntlet'],
      ['title_old_guard', 'veterancy'],
      ['title_perennial', 'legacy'],
    ]) {
      expect(sql).toContain(`('${id}',`);
      expect(sql).toContain(`"capstone":"${category}"`);
    }
    const capstoneRows = sql.match(/\('title_\w+',\s+'[^']+',\s+'title', 'legendary'/g) || [];
    expect(capstoneRows.length).toBe(6);
  });

  it('capstones unlock at all-Diamond (MIN tier >= 4 per category)', () => {
    expect(sql).toMatch(/SELECT MIN\(pr\.tier\)/);
    expect(sql).toMatch(/\) >= 4/);
  });
});

describe('Migration 023: refresh_player_records (section 6.3)', () => {
  it('is service-role only: revoked from PUBLIC/anon/authenticated, never granted', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION refresh_player_records\(UUID\) FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION refresh_player_records\(UUID\) FROM anon/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION refresh_player_records\(UUID\) FROM authenticated/);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION refresh_player_records/);
  });

  it('recomputes from aggregates over server-trusted sources only', () => {
    // banked DNA from validated non-free sessions (dna_earned, the
    // duel-scorer-trusted column), never client input
    expect(sql).toMatch(/SUM\(gs\.dna_earned\) FILTER \(WHERE gs\.extracted\)/);
    expect(sql).toMatch(/MAX\(gs\.dna_earned\) FILTER \(WHERE gs\.extracted\)/);
    expect(sql).toMatch(/gs\.foods_collected >= 63/);
    expect(sql).toMatch(/gs\.validated IS TRUE/);
    expect(sql).toMatch(/gs\.is_free_play IS NOT TRUE/);
  });

  it('tier = count of thresholds reached; upsert is idempotent', () => {
    expect(sql).toMatch(/SELECT COUNT\(\*\) FROM unnest\(rd\.thresholds\) th WHERE v\.value >= th/);
    expect(sql).toMatch(/ON CONFLICT \(player_id, record_id\) DO UPDATE/);
  });

  it('grants every reached tier badge cumulatively and idempotently', () => {
    expect(sql).toMatch(/'record_' \|\| pr\.record_id \|\| '_t' \|\| t\.tier, 'records'/);
    expect(sql).toMatch(/t\.tier <= pr\.tier/);
    const grants = sql.match(/INSERT INTO player_cosmetics[\s\S]*?ON CONFLICT \(player_id, cosmetic_id\) DO NOTHING/g) || [];
    expect(grants.length).toBeGreaterThanOrEqual(2); // tier badges + capstones
  });

  it('legacy score = sum of banked tier points; board presence counts finished weeks only', () => {
    expect(sql).toMatch(/unnest\(rd\.tier_points\[1:pr\.tier\]\)/);
    expect(sql).toMatch(/UPDATE players SET legacy_score = v_legacy_score WHERE id = p_player_id/);
    expect(sql).toMatch(/gs\.anomaly_week < duel_week_start\(NOW\(\)\)/);
  });

  it('Crowned reads the championship duel roster (bye falls back to membership)', () => {
    expect(sql).toMatch(/FROM season_champions sc/);
    expect(sql).toMatch(/m\.round = 'semifinal'/);
    expect(sql).toMatch(/m\.winner = sc\.clan_id/);
  });

  it('backfills every existing player once (idempotent)', () => {
    expect(sql).toMatch(/FOR v_id IN SELECT id FROM players LOOP\s*\n\s*PERFORM refresh_player_records\(v_id\);/);
  });
});

describe('Migration 023: clan rating history + settlement (section 7.1)', () => {
  it('creates clan_rating_history with public read RLS (it feeds public profiles)', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS clan_rating_history/);
    expect(sql).toMatch(/UNIQUE \(clan_id, week_start\)/);
    expect(sql).toContain('ALTER TABLE clan_rating_history ENABLE ROW LEVEL SECURITY;');
    expect(sql).toMatch(/CREATE POLICY clan_rating_history_public_read ON clan_rating_history\s*\n\s*FOR SELECT USING \(true\)/);
    expect(sql).toMatch(/GRANT SELECT ON clan_rating_history TO anon/);
  });

  it('re-declares settle_and_pair_duels with the IDENTICAL 021 signature', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION settle_and_pair_duels\(\)\s*\n\s*RETURNS VOID/);
  });

  it('carries the 021 body: advisory lock, ELO K=32 block, playoffs, roster-locked pairing', () => {
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtext\('clan_duels_settle'\)\)/);
    expect(sql).toMatch(/v_expected_winner := 1\.0 \/ \(1\.0 \+ power\(10\.0, \(v_rating_b - v_rating_a\) \/ 400\.0\)\)/);
    expect(sql).toMatch(/v_delta := ROUND\(32 \* \(1 - v_expected_winner\)\)::INTEGER/);
    expect(sql).toMatch(/PERFORM maintain_season_playoffs\(\)/);
    expect(sql).toMatch(/PERFORM resolve_gauntlet\(v_duel\.id\)/);
    expect(sql).toMatch(/v_window_start := rivalry_window_start\(v_week\)/);
  });

  it('appends the rating-history point for both clans after each settlement', () => {
    expect(sql).toMatch(/INSERT INTO clan_rating_history \(clan_id, week_start, rating_after, delta\)/);
    expect(sql).toMatch(/WHERE c\.id IN \(v_duel\.clan_a, v_duel\.clan_b\)\s*\n\s*ON CONFLICT \(clan_id, week_start\) DO NOTHING/);
  });
});

describe('Migration 023: identity view + PB timeline + rate limits', () => {
  it('re-declares player_identity_view with legacy_score appended last', () => {
    expect(sql).toMatch(/CREATE OR REPLACE VIEW player_identity_view AS/);
    expect(sql).toMatch(/AS mastery,\s*\n\s*p\.legacy_score\s*\nFROM players p/);
  });

  it('re-declares get_player_identities onto the new rowtype', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION get_player_identities\(p_ids UUID\[\]\)\s*\n\s*RETURNS SETOF player_identity_view/);
  });

  it('adds the missing (player_id, score DESC) index for the PB timeline', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_game_sessions_player_score\s*\n\s*ON game_sessions \(player_id, score DESC\)/);
  });

  it('chronicle_pb_timeline: weekly MAX(score) per dynasty, validated earning runs, service-role only', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION chronicle_pb_timeline\(p_player_id UUID\)\s*\n\s*RETURNS TABLE \(week_start DATE, dynasty TEXT, best_score INTEGER, runs INTEGER\)/);
    expect(sql).toMatch(/duel_week_start\(gs\.ended_at\) AS week_start/);
    expect(sql).toMatch(/MAX\(gs\.score\)::INTEGER AS best_score/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION chronicle_pb_timeline\(UUID\) FROM authenticated/);
  });

  it('extends the rate_limits CHECK with records_refresh', () => {
    expect(sql).toMatch(/'game_start', 'breeding', 'purchase', 'handle_check', 'handle_claim', 'records_refresh'/);
  });
});

describe('Migration 023: project covenants', () => {
  it('uses gen_random_uuid, never uuid_generate_v4', () => {
    expect(sql).not.toMatch(/uuid_generate_v4/);
    expect(sql).toMatch(/gen_random_uuid\(\)/);
  });

  it('adds ZERO economy faucets or sinks - records pay prestige, never DNA', () => {
    expect(sql).not.toMatch(/INSERT INTO economy_transactions/);
    expect(sql).not.toMatch(/UPDATE players SET dna/);
    expect(sql).not.toMatch(/SET energy/);
  });

  // 023 left the achievement tables alone; only their DISPLAY surface moved
  // into the Chronicle. The mechanism itself was retired by migration 042
  // (WP-0.04), which is where that change belongs and is asserted. This test
  // pins 023's scope, not the current state of the world.
  it('never touches the achievements tables (section 6.6: display retires here, mechanism dies in 042)', () => {
    expect(sql).not.toMatch(/achievement_definitions/);
    expect(sql).not.toMatch(/player_achievements/);
  });

  it('never wipes player state', () => {
    expect(sql).not.toMatch(/\bDROP TABLE\b/);
    expect(sql).not.toMatch(/\bTRUNCATE\b/);
    expect(sql).not.toMatch(/DELETE FROM (players|collected_snakes|player_mastery|player_battle_pass|player_cosmetics|game_sessions)/);
  });

  it('enables RLS on every new table', () => {
    for (const table of ['record_definitions', 'player_records', 'clan_rating_history']) {
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    }
  });
});
