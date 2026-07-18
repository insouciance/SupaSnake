/**
 * Migration 024 shape tests - Clan Identity & Discord (Player Identity
 * v1, PLAYER_IDENTITY_V1.md section 8).
 *
 * Pins the doc-precise rules into the SQL so a future edit cannot
 * silently drop them: the clan identity columns with hex CHECKs, the
 * heraldry_1 research gate + owner/officer rule on update_clan_identity,
 * the never-owner rule on set_clan_member_role, the atomic invite
 * accept, the deny-all-RLS encrypted discord_links, the member-readable
 * discord_clan_links (with guild_id for the clan-own-server model), the
 * outbox with its pending partial index + dedup uniqueness, and the
 * IDENTICAL-signature re-declarations of gauntlet_try_unlock (020 body)
 * and settle_and_pair_duels (023 body - its clan_rating_history append
 * must survive, so the 023 pins are re-asserted here against 024). Plus
 * the project covenants: gen_random_uuid only, zero economy faucets,
 * no table drops, RLS everywhere.
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_024 = path.join(
  process.cwd(),
  'supabase/migrations/024_clan_discord.sql'
);

const sql = fs.readFileSync(MIGRATION_024, 'utf8');

describe('Migration 024: clan identity columns (section 8.1)', () => {
  it('adds banner/emblem/color columns to clans', () => {
    expect(sql).toMatch(/ALTER TABLE clans\s*\n\s*ADD COLUMN IF NOT EXISTS banner_id TEXT,\s*\n\s*ADD COLUMN IF NOT EXISTS emblem_id TEXT,\s*\n\s*ADD COLUMN IF NOT EXISTS color_primary TEXT,\s*\n\s*ADD COLUMN IF NOT EXISTS color_secondary TEXT/);
  });

  it('hex-checks both colors and format-checks both ids', () => {
    expect(sql).toMatch(/color_primary IS NULL OR color_primary ~ '\^#\[0-9a-fA-F\]\{6\}\$'/);
    expect(sql).toMatch(/color_secondary IS NULL OR color_secondary ~ '\^#\[0-9a-fA-F\]\{6\}\$'/);
    expect(sql).toMatch(/banner_id IS NULL OR banner_id ~ '\^\[a-z0-9_\]\{1,32\}\$'/);
    expect(sql).toMatch(/emblem_id IS NULL OR emblem_id ~ '\^\[a-z0-9_\]\{1,32\}\$'/);
  });
});

describe('Migration 024: update_clan_identity (section 8.1)', () => {
  it('requires owner/officer and gates on heraldry_1 research', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION update_clan_identity\(/);
    expect(sql).toMatch(/IF v_member\.role NOT IN \('owner', 'officer'\) THEN/);
    expect(sql).toMatch(/IF NOT clan_has_research\(v_member\.clan_id, 'heraldry_1'\) THEN/);
    expect(sql).toMatch(/'error', 'heraldry_locked'/);
  });

  it('documents heraldry_2/3/4 as render-time features off clan_research', () => {
    expect(sql).toMatch(/heraldry_2 -> victory fanfare/);
    expect(sql).toMatch(/heraldry_3 -> board frame rendering/);
    expect(sql).toMatch(/heraldry_4 -> animated clan title/);
  });

  it('is service-role only (RLS on clans stays owner-only; officers ride the RPC)', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION update_clan_identity\(UUID, TEXT, TEXT, TEXT, TEXT\) FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION update_clan_identity\(UUID, TEXT, TEXT, TEXT, TEXT\) FROM anon/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION update_clan_identity\(UUID, TEXT, TEXT, TEXT, TEXT\) FROM authenticated/);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION update_clan_identity/);
    // 024 never rewrites the 007 clans policies
    expect(sql).not.toMatch(/CREATE POLICY clans_/);
  });
});

describe('Migration 024: set_clan_member_role (section 8.2)', () => {
  it('owner-only, officer/member only - never an owner transfer', () => {
    expect(sql).toMatch(/IF p_role NOT IN \('officer', 'member'\) THEN/);
    expect(sql).toMatch(/IF v_caller\.role <> 'owner' THEN/);
    expect(sql).toMatch(/IF v_target\.role = 'owner' THEN/);
    expect(sql).toMatch(/'error', 'cannot_change_owner'/);
  });

  it('is service-role only', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION set_clan_member_role\(UUID, UUID, TEXT\) FROM authenticated/);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION set_clan_member_role/);
  });
});

describe('Migration 024: respond_clan_invite (section 8.2)', () => {
  it('locks the invite row and the clan row (atomic accept)', () => {
    expect(sql).toMatch(/FROM clan_invites\s*\n\s*WHERE id = p_invite_id AND player_id = p_user_id\s*\n\s*FOR UPDATE/);
    expect(sql).toMatch(/SELECT \* INTO v_clan FROM clans WHERE id = v_invite\.clan_id FOR UPDATE/);
  });

  it('accept = membership insert + member_count bump + expire the rest', () => {
    expect(sql).toMatch(/INSERT INTO clan_members \(clan_id, player_id, role\)\s*\n\s*VALUES \(v_invite\.clan_id, p_user_id, 'member'\)/);
    expect(sql).toMatch(/SET member_count = member_count \+ 1/);
    expect(sql).toMatch(/UPDATE clan_invites SET status = 'expired'\s*\n\s*WHERE player_id = p_user_id AND status = 'pending' AND id <> p_invite_id/);
  });

  it('refuses full clans, double-membership and non-pending invites', () => {
    expect(sql).toMatch(/'error', 'clan_full'/);
    expect(sql).toMatch(/'error', 'already_in_clan'/);
    expect(sql).toMatch(/'error', 'invite_not_pending'/);
    expect(sql).toMatch(/'error', 'invite_expired'/);
  });

  it('declines without touching membership and enqueues member_joined on accept', () => {
    expect(sql).toMatch(/UPDATE clan_invites SET status = 'declined' WHERE id = p_invite_id/);
    expect(sql).toMatch(/'member_joined:' \|\| p_invite_id::text/);
  });
});

describe('Migration 024: discord_links (sections 8.3, 8.5)', () => {
  it('stores ONLY encrypted token columns with revocation + usage stamps', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS discord_links/);
    expect(sql).toMatch(/access_token_enc TEXT NOT NULL/);
    expect(sql).toMatch(/refresh_token_enc TEXT NOT NULL/);
    expect(sql).toMatch(/last_used_at TIMESTAMPTZ/);
    expect(sql).toMatch(/revoked_at TIMESTAMPTZ/);
    // no plaintext token column may ever appear
    expect(sql).not.toMatch(/access_token TEXT/);
    expect(sql).not.toMatch(/refresh_token TEXT/);
  });

  it('one Discord account links one player', () => {
    expect(sql).toMatch(/discord_user_id TEXT NOT NULL UNIQUE/);
  });

  it('is deny-all RLS: enabled, zero policies, zero grants', () => {
    expect(sql).toContain('ALTER TABLE discord_links ENABLE ROW LEVEL SECURITY;');
    expect(sql).not.toMatch(/CREATE POLICY \S+ ON discord_links/);
    expect(sql).not.toMatch(/GRANT SELECT ON discord_links/);
  });

  it('documents AES-256-GCM app-layer encryption + the 30-day sweep', () => {
    expect(sql).toMatch(/AES-256-GCM/);
    expect(sql).toMatch(/30-day sweep/);
  });
});

describe('Migration 024: discord_clan_links (section 8.3, both models)', () => {
  it('carries guild_id (clan-own-server model) + both provisioned ids', () => {
    expect(sql).toMatch(/model TEXT NOT NULL CHECK \(model IN \('official', 'own'\)\)/);
    expect(sql).toMatch(/guild_id TEXT NOT NULL/);
    expect(sql).toMatch(/channel_id TEXT NOT NULL/);
    expect(sql).toMatch(/webhook_token_enc TEXT NOT NULL/);
  });

  it('clan members may SELECT; nobody else', () => {
    expect(sql).toContain('ALTER TABLE discord_clan_links ENABLE ROW LEVEL SECURITY;');
    expect(sql).toMatch(/CREATE POLICY discord_clan_links_select_members ON discord_clan_links\s*\n\s*FOR SELECT TO authenticated\s*\n\s*USING \(\s*\n\s*clan_id IN \(SELECT clan_id FROM clan_members WHERE player_id = auth\.uid\(\)\)/);
  });
});

describe('Migration 024: discord_event_outbox (section 8.4)', () => {
  it('accepts exactly the five doc event types', () => {
    expect(sql).toMatch(/'duel_settled', 'gauntlet_unlock', 'mastery_levelup',\s*\n\s*'season_champion', 'member_joined'/);
  });

  it('has the pending partial index and idempotent dedup keys', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_discord_event_outbox_pending\s*\n\s*ON discord_event_outbox \(created_at\) WHERE status = 'pending'/);
    expect(sql).toMatch(/dedup_key TEXT NOT NULL UNIQUE/);
  });

  it('tracks attempts toward the dead-letter (5) with pending/sent/dead states', () => {
    expect(sql).toMatch(/status IN \('pending', 'sent', 'dead'\)/);
    expect(sql).toMatch(/attempts INTEGER NOT NULL DEFAULT 0/);
  });

  it('is deny-all RLS: enabled, zero policies, zero grants', () => {
    expect(sql).toContain('ALTER TABLE discord_event_outbox ENABLE ROW LEVEL SECURITY;');
    expect(sql).not.toMatch(/CREATE POLICY \S+ ON discord_event_outbox/);
    expect(sql).not.toMatch(/GRANT SELECT ON discord_event_outbox/);
  });
});

describe('Migration 024: gauntlet_try_unlock re-declaration (020 carryover)', () => {
  it('keeps the IDENTICAL 020 signature', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION gauntlet_try_unlock\(p_clan_id UUID\)\s*\n\s*RETURNS TEXT/);
  });

  it('carries the 020 body: target/prereq/cost/pool flow, FOR UPDATE lock', () => {
    expect(sql).toMatch(/v_prereq := gauntlet_node_prereq\(v_target\)/);
    expect(sql).toMatch(/v_cost := gauntlet_node_cost\(v_target\)/);
    expect(sql).toMatch(/FROM clan_research_progress WHERE clan_id = p_clan_id FOR UPDATE/);
    expect(sql).toMatch(/SET dna_contributed = dna_contributed - v_cost, updated_at = NOW\(\)/);
    expect(sql).toMatch(/INSERT INTO clan_research \(clan_id, node_id\) VALUES \(p_clan_id, v_target\)\s*\n\s*ON CONFLICT DO NOTHING/);
  });

  it('enqueues gauntlet_unlock only for linked clans, idempotently', () => {
    expect(sql).toMatch(/'gauntlet_unlock:' \|\| p_clan_id::text \|\| ':' \|\| v_target/);
    expect(sql).toMatch(/AND EXISTS \(SELECT 1 FROM discord_clan_links l WHERE l\.clan_id = p_clan_id\)/);
  });
});

describe('Migration 024: settle_and_pair_duels re-declaration (023 carryover)', () => {
  it('keeps the IDENTICAL signature', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION settle_and_pair_duels\(\)\s*\n\s*RETURNS VOID/);
  });

  it('carries the 021 core: advisory lock, ELO K=32, playoffs, roster-locked pairing', () => {
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtext\('clan_duels_settle'\)\)/);
    expect(sql).toMatch(/v_expected_winner := 1\.0 \/ \(1\.0 \+ power\(10\.0, \(v_rating_b - v_rating_a\) \/ 400\.0\)\)/);
    expect(sql).toMatch(/v_delta := ROUND\(32 \* \(1 - v_expected_winner\)\)::INTEGER/);
    expect(sql).toMatch(/PERFORM maintain_season_playoffs\(\)/);
    expect(sql).toMatch(/PERFORM resolve_gauntlet\(v_duel\.id\)/);
    expect(sql).toMatch(/v_window_start := rivalry_window_start\(v_week\)/);
  });

  it('carries the 023 addition: the clan_rating_history append', () => {
    expect(sql).toMatch(/INSERT INTO clan_rating_history \(clan_id, week_start, rating_after, delta\)/);
    expect(sql).toMatch(/WHERE c\.id IN \(v_duel\.clan_a, v_duel\.clan_b\)\s*\n\s*ON CONFLICT \(clan_id, week_start\) DO NOTHING/);
  });

  it('enqueues duel_settled per linked clan with both scores + rating delta', () => {
    expect(sql).toMatch(/'duel_settled:' \|\| v_duel\.id::text \|\| ':' \|\| l\.clan_id::text/);
    expect(sql).toMatch(/'winner', v_winner,\s*\n\s*'rating_delta', v_delta/);
    expect(sql).toMatch(/WHERE l\.clan_id IN \(v_duel\.clan_a, v_duel\.clan_b\)/);
  });

  it('enqueues season_champion where champions are written', () => {
    // right after maintain_season_playoffs, which writes season_champions
    expect(sql).toMatch(/PERFORM maintain_season_playoffs\(\);[\s\S]{0,700}'season_champion:' \|\| sc\.season_id::text/);
    expect(sql).toMatch(/FROM season_champions sc\s*\n\s*JOIN seasons s ON s\.id = sc\.season_id/);
  });
});

describe('Migration 024: project covenants', () => {
  it('uses gen_random_uuid, never uuid_generate_v4', () => {
    expect(sql).not.toMatch(/uuid_generate_v4/);
    expect(sql).toMatch(/gen_random_uuid\(\)/);
  });

  it('adds ZERO economy faucets or sinks', () => {
    expect(sql).not.toMatch(/INSERT INTO economy_transactions/);
    expect(sql).not.toMatch(/UPDATE players SET dna/);
    expect(sql).not.toMatch(/SET energy/);
  });

  it('never wipes player state', () => {
    expect(sql).not.toMatch(/\bDROP TABLE\b/);
    expect(sql).not.toMatch(/\bTRUNCATE\b/);
    expect(sql).not.toMatch(/DELETE FROM (players|collected_snakes|player_mastery|player_battle_pass|player_cosmetics|game_sessions|clan_members)/);
  });

  it('enables RLS on every new table', () => {
    for (const table of ['discord_links', 'discord_clan_links', 'discord_event_outbox']) {
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    }
  });
});
