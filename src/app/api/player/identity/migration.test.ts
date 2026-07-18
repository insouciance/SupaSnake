/**
 * Migration 022 shape tests - Identity Core (Player Identity v1,
 * PLAYER_IDENTITY_V1.md sections 3, 4, 5, 9.5)
 *
 * Pins the doc-precise rules into the SQL so a future edit cannot
 * silently drop them: the handle format CHECK + case-insensitive unique
 * index (the race arbiter), the leet-normalized denylist, the
 * first-claim-free 30-day cooldown, the cosmetics catalog (8 Solstice +
 * 24 mastery-rung + Founder + default banner - record-tier/archetype
 * badges are 023/025 material), the inventory backfills, the
 * identical-signature re-declarations of every render site and forward
 * grant, the identity view, and the run-event columns. And the two
 * project-wide covenants: gen_random_uuid (never uuid_generate_v4) and
 * zero new economy faucets.
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_022 = path.join(
  process.cwd(),
  'supabase/migrations/022_identity_core.sql'
);

const sql = fs.readFileSync(MIGRATION_022, 'utf8');

describe('Migration 022: handles (section 3)', () => {
  it('adds handle columns with the ASCII format CHECK', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS handle TEXT/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS handle_changed_at TIMESTAMPTZ/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS handle_changes INTEGER NOT NULL DEFAULT 0/);
    expect(sql).toMatch(/handle ~ '\^\[A-Za-z0-9_\]\{3,16\}\$'/);
  });

  it('case-insensitive uniqueness via a UNIQUE INDEX ON lower(handle) - the race arbiter', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_players_handle_lower\s*\n\s*ON players \(lower\(handle\)\)/);
  });

  it('leet normalization strips _ and maps 0/1/3/4/5/7/8/$/@ (section 3.5)', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION normalize_handle\(p_handle TEXT\)/);
    expect(sql).toMatch(/'0134578\$@', 'oieastbsa'/);
    expect(sql).toMatch(/replace\(lower\(COALESCE\(p_handle, ''\)\), '_', ''\)/);
  });

  it('denylist: reserved = exact, profanity = substring, both seeded', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS reserved_handles/);
    expect(sql).toMatch(/kind IN \('reserved', 'profanity'\)/);
    expect(sql).toMatch(/match_mode IN \('exact', 'substring'\)/);
    for (const word of ['admin', 'supasnake', 'anonymous', 'handler', 'cyber', 'primal', 'cosmic', 'analyst']) {
      expect(sql).toContain(`('${word}',`);
    }
  });

  it('claim_handle: format -> denylist -> cooldown (first claim free) -> unique_violation = taken', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION claim_handle\(p_player_id UUID, p_handle TEXT\)/);
    expect(sql).toMatch(/'error', 'invalid_format'/);
    expect(sql).toMatch(/'error', 'reserved'/);
    expect(sql).toMatch(/'error', 'cooldown',\s*\n\s*'next_change_at'/);
    expect(sql).toMatch(/EXCEPTION WHEN unique_violation THEN\s*\n\s*RETURN jsonb_build_object\('error', 'taken'\)/);
    // First claim free: cooldown only applies after a change
    expect(sql).toMatch(/handle_changes > 0 AND v_player\.handle_changed_at IS NOT NULL/);
    expect(sql).toMatch(/INTERVAL '30 days'/);
  });

  it('admin_rename_handle is service-role only and waives the victim cooldown (section 3.6)', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION admin_rename_handle/);
    expect(sql).toMatch(/handle_changed_at = NULL/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION admin_rename_handle\(UUID, TEXT\) FROM authenticated/);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION admin_rename_handle/);
  });

  it('extends the rate_limits CHECK with the handle actions', () => {
    expect(sql).toMatch(/'game_start', 'breeding', 'purchase', 'handle_check', 'handle_claim'/);
  });
});

describe('Migration 022: cosmetics (section 5)', () => {
  it('six slots, five rarities, badge positions 1-3 CHECK-enforced (section 6.5 cap)', () => {
    expect(sql).toMatch(/slot IN \('title', 'banner', 'badge', 'trail', 'board_accent', 'emblem'\)/);
    expect(sql).toMatch(/rarity IN \('common', 'uncommon', 'rare', 'epic', 'legendary'\)/);
    expect(sql).toMatch(/\(slot = 'badge' AND position BETWEEN 1 AND 3\)\s*\n\s*OR \(slot <> 'badge' AND position = 1\)/);
  });

  it('seeds all 8 Season 1 Solstice items (section 5.3)', () => {
    for (const id of [
      'solstice_trail_1', 'solstice_badge', 'solstice_board_accent',
      'solstice_trail_2', 'solstice_emblem', 'solstice_trail_3',
      'solstice_banner', 'solstice_sovereign',
    ]) {
      expect(sql).toContain(`('${id}',`);
    }
  });

  it('seeds all 24 mastery-rung items - 8 per dynasty, rungs 1/2/4/5/7/8/10 (section 5.4)', () => {
    for (const dynasty of ['primal', 'cyber', 'cosmic']) {
      for (const item of [
        `mastery_${dynasty}_emblem_1`, `mastery_${dynasty}_trail_1`,
        `mastery_${dynasty}_board_accent`, `mastery_${dynasty}_trail_2`,
        `mastery_${dynasty}_emblem_2`, `mastery_${dynasty}_trail_3`,
        `mastery_${dynasty}_sovereign_emblem`, `title_${dynasty}_sovereign`,
      ]) {
        expect(sql).toContain(`('${item}',`);
      }
    }
    // M3/M6/M9 are mutation rungs - never cosmetic rungs
    expect(sql).not.toMatch(/mastery_rung.*(?:'|\s)3(?:'|,)\s*'\{"kind"/);
  });

  it('seeds the Founder badge and the default banner (section 5.5)', () => {
    expect(sql).toContain("('badge_founder',");
    expect(sql).toContain('Founding Handler');
    expect(sql).toContain("('banner_hatchery_standard',");
    expect(sql).toContain('Hatchery Standard');
  });

  it('does NOT seed record-tier or archetype badges (they are 023/025)', () => {
    expect(sql).not.toMatch(/record_.*_t[1-5]/);
    expect(sql).not.toMatch(/archetype_/);
  });

  it('equip_cosmetic enforces ownership + slot match; NULL unequips', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION equip_cosmetic\(/);
    expect(sql).toMatch(/'error', 'not_owned'/);
    expect(sql).toMatch(/'error', 'slot_mismatch'/);
    expect(sql).toMatch(/IF p_cosmetic_id IS NULL THEN\s*\n\s*DELETE FROM player_loadout/);
  });
});

describe('Migration 022: backfills', () => {
  it('inventory from battle-pass claims (cosmetic/title rewards)', () => {
    expect(sql).toMatch(/FROM player_battle_pass_claims c\s*\n\s*JOIN battle_pass_tiers t ON t\.id = c\.tier_id/);
    expect(sql).toMatch(/t\.reward_type IN \('cosmetic', 'title'\)/);
  });

  it('inventory from mastery levels via level_for_xp (derived, never stored)', () => {
    expect(sql).toMatch(/FROM player_mastery pm\s*\n\s*JOIN cosmetic_definitions cd/);
    expect(sql).toMatch(/cd\.mastery_rung <= level_for_xp\(pm\.xp\)/);
  });

  it('Founder backfill: created before Season 1 (2026-07-20), one time only', () => {
    expect(sql).toMatch(/'badge_founder', 'founder_backfill'\s*\n\s*FROM players p\s*\n\s*WHERE p\.created_at < TIMESTAMPTZ '2026-07-20 00:00:00\+00'/);
  });

  it('every backfill is idempotent (ON CONFLICT DO NOTHING)', () => {
    const backfills = sql.match(/INSERT INTO player_cosmetics[\s\S]*?ON CONFLICT \(player_id, cosmetic_id\) DO NOTHING/g) || [];
    expect(backfills.length).toBeGreaterThanOrEqual(4);
  });
});

describe('Migration 022: identical-signature re-declarations', () => {
  it('claim_season_tier keeps the 021 signature and gains the inventory grant', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION claim_season_tier\(p_player_id UUID, p_level INTEGER\)/);
    expect(sql).toMatch(/v_tier\.reward_type IN \('cosmetic', 'title'\) AND v_tier\.reward_id IS NOT NULL/);
    // Economy branches must be byte-carryovers: the pre-existing source only
    expect(sql).toMatch(/'battle_pass_reward'/);
  });

  it('grant_mastery_xp keeps the 019 signature and gains the rung grant', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION grant_mastery_xp\(\s*\n\s*p_player_id UUID,\s*\n\s*p_dynasty TEXT,\s*\n\s*p_xp BIGINT\s*\n\) RETURNS TABLE \(xp_after BIGINT, level_after INTEGER\)/);
    expect(sql).toMatch(/cd\.mastery_rung <= level_for_xp\(v_xp\)/);
  });

  it('clan_top_contributors keeps the 011/021 signature, renders from the view', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION clan_top_contributors\(p_clan_id UUID, p_week_start DATE\)\s*\n\s*RETURNS TABLE \(player_name TEXT, counted_dna BIGINT\)/);
  });

  it('gauntlet_top_contributors keeps the 020/021 signature, renders from the view', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION gauntlet_top_contributors\(\s*\n\s*p_week_start DATE,\s*\n\s*p_clan_id UUID,\s*\n\s*p_side JSONB,\s*\n\s*p_roster UUID\[\]\s*\n\) RETURNS TABLE \(player_name TEXT, counted_dna BIGINT\)/);
  });

  it('get_anomaly_board keeps the 021 signature, renders from the view', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION get_anomaly_board\(p_player_id UUID\)\s*\n\s*RETURNS JSONB/);
  });

  it('get_gauntlet keeps the 020 signature, renders from the view', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION get_gauntlet\(p_clan_id UUID, p_user_id UUID\)\s*\n\s*RETURNS JSONB/);
  });

  it('every COALESCE(username, ...) render site is gone from 022', () => {
    expect(sql).not.toMatch(/COALESCE\(pl\.username/);
    expect(sql).not.toMatch(/COALESCE\(p\.username/);
    // The dead column is never written either
    expect(sql).not.toMatch(/SET username/);
  });

  it('anomaly exclusions and lens gates survive the contributor re-declarations', () => {
    expect(sql).toMatch(/gs\.anomaly_id IS NULL\s+-- anomaly runs: own board only/);
    expect(sql).toMatch(/\(v_incl_anomaly OR gs\.anomaly_id IS NULL\)/);
  });
});

describe('Migration 022: player_identity_view (section 4)', () => {
  it('creates the view exposing BOTH ids (players.id + auth uid)', () => {
    expect(sql).toMatch(/CREATE OR REPLACE VIEW player_identity_view AS/);
    expect(sql).toMatch(/p\.id AS player_id/);
    expect(sql).toMatch(/p\.user_id/);
  });

  it('derives handler-NNNN from the player UUID (section 3.2: last 4 hex, mod 10000)', () => {
    expect(sql).toMatch(/'handler-' \|\| lpad\(/);
    expect(sql).toMatch(/right\(replace\(p\.id::text, '-', ''\), 4\)/);
    expect(sql).toMatch(/% 10000/);
  });

  it('avatar = favorited -> equipped -> newest collected, with dynasty', () => {
    expect(sql).toMatch(/ORDER BY cs\.is_favorited DESC NULLS LAST,\s*\n\s*cs\.is_equipped DESC NULLS LAST,\s*\n\s*cs\.acquired_at DESC/);
  });

  it('founder = created before Season 1; mastery via level_for_xp; clan via user_id bridge', () => {
    expect(sql).toMatch(/p\.created_at < TIMESTAMPTZ '2026-07-20 00:00:00\+00'\) AS is_founder/);
    expect(sql).toMatch(/jsonb_object_agg\(pm\.dynasty, level_for_xp\(pm\.xp\)\)/);
    expect(sql).toMatch(/WHERE cm\.player_id = p\.user_id/);
  });

  it('is readable by authenticated AND anon (public-safe by construction), with the batch RPC', () => {
    expect(sql).toMatch(/GRANT SELECT ON player_identity_view TO authenticated/);
    expect(sql).toMatch(/GRANT SELECT ON player_identity_view TO anon/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION get_player_identities\(p_ids UUID\[\]\)\s*\n\s*RETURNS SETOF player_identity_view/);
  });

  it('never exposes email or auth metadata', () => {
    const viewBody = sql.slice(
      sql.indexOf('CREATE OR REPLACE VIEW player_identity_view'),
      sql.indexOf('GRANT SELECT ON player_identity_view')
    );
    expect(viewBody).not.toMatch(/email/i);
    expect(viewBody).not.toMatch(/auth\.users/);
  });
});

describe('Migration 022: run-event capture (section 9.5)', () => {
  it('adds death_cause with the doc cause list + run_events JSONB', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS death_cause TEXT CHECK \(death_cause IN \('wall', 'self', 'timeout', 'extracted'\)\)/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS run_events JSONB/);
  });

  it('documents the never-payout-input covenant on the columns', () => {
    expect(sql).toMatch(/never payouts\/records\/leaderboards|Never payout input/i);
  });
});

describe('Migration 022: project covenants', () => {
  it('uses gen_random_uuid, never uuid_generate_v4', () => {
    expect(sql).not.toMatch(/uuid_generate_v4/);
    expect(sql).toMatch(/gen_random_uuid\(\)/);
  });

  it('adds ZERO economy faucets: economy_transactions appears only inside the claim_season_tier carryover', () => {
    const outsideCarryover =
      sql.slice(0, sql.indexOf('FUNCTION claim_season_tier')) +
      sql.slice(sql.indexOf('12. PLAYER_IDENTITY_VIEW'));
    expect(outsideCarryover).not.toMatch(/INSERT INTO economy_transactions/);
    expect(sql).not.toMatch(/UPDATE players SET dna = dna \+ (?!COALESCE\(v_tier)/);
  });

  it('never wipes player state', () => {
    expect(sql).not.toMatch(/\bDROP TABLE\b/);
    expect(sql).not.toMatch(/\bTRUNCATE\b/);
    expect(sql).not.toMatch(/DELETE FROM (players|collected_snakes|player_mastery|player_battle_pass)/);
  });

  it('enables RLS on every new table', () => {
    for (const table of [
      'reserved_handles', 'handle_events', 'cosmetic_definitions',
      'player_cosmetics', 'player_loadout',
    ]) {
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    }
  });
});
