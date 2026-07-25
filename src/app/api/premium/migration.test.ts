/**
 * Migration 028 shape tests - SupaSnake Premium subscription
 * (docs/game/MONETIZATION_DESIGN.md)
 *
 * Pins the design-doc rules into the SQL so a future edit cannot silently
 * drop them: the insert-first webhook idempotency (010 pattern) + the
 * event-ordering guard, the derived entitlement with its 7-day past_due
 * grace, the never-revoke covenant, the stipend's PK idempotency and
 * uncapped +3 energy, the 15-value economy_transactions CHECK, the
 * premium pick limit (2 free / 3 premium), the premium season-tier clause
 * with the season lock-in goodwill rule, cosmetic-only premium tiers, the
 * identity view flair flag, and service-role-only minting.
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { PREMIUM_CONFIG } from '@/shared/config/premium';
import { ENGAGEMENT_CONFIG } from '@/shared/config/engagement';

const MIGRATION_028 = path.join(
  process.cwd(),
  'supabase/migrations/028_premium_subscription.sql'
);

const sql = fs.readFileSync(MIGRATION_028, 'utf8');

// WP-0.09's own migration. 028 is unchanged history; the live rule is asserted
// against this file.
const MIGRATION_043 = path.join(
  process.cwd(),
  'supabase/migrations/043_commerce_removal.sql'
);

const sql042 = fs.readFileSync(MIGRATION_043, 'utf8');

describe('Migration 028: subscription state', () => {
  it('adds a durable Stripe customer mapping on players', () => {
    expect(sql).toMatch(/ALTER TABLE players ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT/);
    expect(sql).toMatch(/idx_players_stripe_customer/);
  });

  it('mirrors the full Stripe status vocabulary and one live sub per player', () => {
    for (const status of [
      'incomplete', 'incomplete_expired', 'trialing', 'active',
      'past_due', 'canceled', 'unpaid', 'paused',
    ]) {
      expect(sql).toContain(`'${status}'`);
    }
    expect(sql).toMatch(/stripe_subscription_id TEXT NOT NULL UNIQUE/);
    expect(sql).toMatch(/idx_premium_subs_player_live/);
    expect(sql).toMatch(/WHERE status IN \('trialing', 'active', 'past_due'\)/);
  });

  it('players may read their own subscription; writes are service-role only', () => {
    expect(sql).toMatch(/ALTER TABLE premium_subscriptions ENABLE ROW LEVEL SECURITY;/);
    expect(sql).toMatch(/premium_subscriptions_select_own/);
    expect(sql).not.toMatch(/premium_subscriptions\s+FOR (INSERT|UPDATE|DELETE)/);
  });
});

describe('Migration 028: has_premium entitlement', () => {
  it('derives entitlement from active/trialing or past_due within the grace window', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION has_premium\(p_player_id UUID\)/);
    expect(sql).toMatch(/status IN \('trialing', 'active'\)/);
    expect(sql).toMatch(
      new RegExp(`INTERVAL '${PREMIUM_CONFIG.graceDaysPastDue} days'`)
    );
  });

  it('stays executable by clients (player_identity_view calls it with caller privileges)', () => {
    expect(sql).not.toMatch(/REVOKE EXECUTE ON FUNCTION has_premium/);
  });
});

describe('Migration 028: apply_subscription_update lifecycle sync', () => {
  it('claims the event id FIRST (010 idempotency pattern)', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION apply_subscription_update');
    const body = sql.slice(
      start,
      sql.indexOf('CREATE OR REPLACE FUNCTION claim_premium_stipend', start)
    );
    const insertIdx = body.indexOf('INSERT INTO stripe_events');
    const upsertIdx = body.indexOf('INSERT INTO premium_subscriptions');
    expect(insertIdx).toBeGreaterThan(-1);
    expect(upsertIdx).toBeGreaterThan(insertIdx);
    expect(body).toMatch(/ON CONFLICT \(id\) DO NOTHING;/);
    expect(body).toMatch(/RETURN 'already_processed';/);
  });

  it('guards against out-of-order webhook delivery via event.created', () => {
    expect(sql).toMatch(/last_event_created/);
    expect(sql).toMatch(/RETURN 'stale_event';/);
  });

  it('never revokes on cancel: no destructive statements on grants', () => {
    expect(sql).not.toMatch(/DELETE FROM player_cosmetics/);
    expect(sql).not.toMatch(/DELETE FROM player_battle_pass/);
    // Nothing ever writes the season flag back to false
    expect(sql).not.toMatch(/SET is_premium = false/);
  });

  it('activation grants the supporter cosmetics + season premium flag idempotently', () => {
    expect(sql).toMatch(/'badge_premium_supporter', 'premium'/);
    expect(sql).toMatch(/'banner_premium_aurora', 'premium'/);
    expect(sql).toMatch(/premium_purchased_at = COALESCE\(player_battle_pass\.premium_purchased_at, NOW\(\)\)/);
  });

  it('is service-role only (writes subscription state)', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION apply_subscription_update[\s\S]*?FROM authenticated;/);
  });
});

/**
 * The stipend RPC these tests describe is DROPPED by migration 039
 * (Constitution §8.6/§10.4: Energy is never sold, gifted or stipended).
 * 028's file is unchanged and still contains the function text, so these
 * assertions remain accurate as a description of that historical migration
 * - they are kept so a future edit to 028 cannot silently rewrite history,
 * and the retirement itself is asserted in the 039 shape tests.
 *
 * The +3 amount is pinned as a literal here because PREMIUM_CONFIG no
 * longer carries `stipendEnergyPerDay`: the config value is gone precisely
 * so nothing live can read it.
 */
describe('Migration 028 (historical): daily stipend, retired by 039', () => {
  it('is idempotent by (player_id, claim_date) PK', () => {
    expect(sql).toMatch(/PRIMARY KEY \(player_id, claim_date\)/);
    expect(sql).toMatch(/ON CONFLICT \(player_id, claim_date\) DO NOTHING;/);
    expect(sql).toMatch(/'already_claimed'/);
  });

  it('granted +3 energy UNCAPPED (purchased-energy rule) and logged the ledger', () => {
    expect(sql).toMatch(/v_stipend INTEGER := 3;/);
    expect(sql).toMatch(/SET energy = energy \+ v_stipend/);
    // No max_energy cap anywhere in the stipend body
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION claim_premium_stipend');
    const body = sql.slice(
      start,
      sql.indexOf('CREATE OR REPLACE FUNCTION pick_contracts', start)
    );
    expect(body).not.toMatch(/max_energy/);
    expect(body).toMatch(/'premium_stipend'/);
  });

  it('requires the entitlement server-side', () => {
    expect(sql).toMatch(/IF NOT has_premium\(p_player_id\) THEN/);
    expect(sql).toMatch(/'premium_required'/);
  });

  it('delivers the monthly cosmetic drop on the first claim of the month', () => {
    expect(sql).toMatch(/premium_cosmetic_drops/);
    expect(sql).toMatch(/premium_drop_claims/);
    expect(sql).toMatch(/date_trunc\('month', CURRENT_DATE\)/);
  });

  it('is service-role only (mints energy)', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION claim_premium_stipend\(UUID\) FROM authenticated;/);
  });

  it('is dropped by migration 039, and unreachable from the app', () => {
    const sql039 = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/039_energy_envelope.sql'),
      'utf8'
    );
    expect(sql039).toMatch(/DROP FUNCTION IF EXISTS claim_premium_stipend\(UUID\)/);
    expect(PREMIUM_CONFIG as Record<string, unknown>).not.toHaveProperty(
      'stipendEnergyPerDay'
    );
  });
});

describe('Migration 028: economy_transactions CHECK (owner: 020 -> 028)', () => {
  it('re-creates the constraint with all 14 prior values + premium_stipend', () => {
    expect(sql).toMatch(/economy_transactions_source_type_check/);
    for (const source of [
      'game_reward', 'breeding_cost', 'purchase', 'daily_reward',
      'game_start', 'energy_regen', 'admin_grant', 'refund',
      'achievement_reward', 'streak_bonus', 'battle_pass_reward',
      'offline_claim', 'unlock_cost', 'clan_tithe', 'premium_stipend',
    ]) {
      expect(sql).toContain(`'${source}'`);
    }
    // Drop-before-add ordering (026 lesson)
    const dropIdx = sql.indexOf('DROP CONSTRAINT IF EXISTS economy_transactions_source_type_check');
    const addIdx = sql.indexOf('ADD CONSTRAINT economy_transactions_source_type_check');
    expect(dropIdx).toBeGreaterThan(-1);
    expect(addIdx).toBeGreaterThan(dropIdx);
  });
});

/**
 * 028 sold a progression rate: 3 daily contract picks while entitled, 2
 * without. Constitution §10.4 puts progression rates on the never-sold list,
 * so migration 043 re-declares `pick_contracts` flat for everyone and
 * PREMIUM_CONFIG no longer carries the quantity. 028's file is unchanged
 * history and is asserted as such; the live rule is asserted against 043.
 */
describe('Migration 028 (historical): paid pick limit, flattened by 043', () => {
  it('declared 3 premium / 2 free picks — the paid progression rate', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION pick_contracts\(p_player_id UUID, p_contract_ids TEXT\[\]\)/);
    expect(sql).toMatch(/CASE WHEN has_premium\(p_player_id\) THEN 3 ELSE 2 END/);
    expect(sql).toMatch(/IF v_already \+ v_count > v_max THEN/);
    // 017 carryovers survive
    expect(sql).toMatch(/#variable_conflict use_column/);
    expect(sql).toMatch(/FOR UPDATE;/);
    expect(sql).toMatch(/PERFORM refresh_contract_progress\(p_player_id, v_date\);/);
  });

  it('is re-declared by 043 with no entitlement branch at all', () => {
    expect(sql042).toMatch(/CREATE OR REPLACE FUNCTION pick_contracts\(p_player_id UUID, p_contract_ids TEXT\[\]\)/);
    expect(sql042).toMatch(
      new RegExp(`v_max INTEGER := ${ENGAGEMENT_CONFIG.contracts.picksPerDay};`)
    );
    // Not "has_premium returns the same number" — the call is gone.
    expect(sql042).not.toMatch(/has_premium/);
    // ...and every 017/028 guard is carried over verbatim, so flattening the
    // limit did not quietly drop a lock or a validation.
    expect(sql042).toMatch(/#variable_conflict use_column/);
    expect(sql042).toMatch(/FOR UPDATE;/);
    expect(sql042).toMatch(/IF v_already \+ v_count > v_max THEN/);
    expect(sql042).toMatch(/Duplicate contract ids/);
    expect(sql042).toMatch(/Contract not offered today/);
    expect(sql042).toMatch(/PERFORM refresh_contract_progress\(p_player_id, v_date\);/);
    expect(sql042).toMatch(/REVOKE EXECUTE ON FUNCTION pick_contracts\(UUID, TEXT\[\]\) FROM PUBLIC, anon, authenticated;/);
  });
});

/**
 * Migration 042 is the server half of WP-0.09's commerce removal. It is
 * committed but deliberately NOT applied by this work package.
 */
describe('Migration 043: commerce removal', () => {
  it('drops grant_purchase_rewards, the faucet a purchase reached DNA/energy through', () => {
    expect(sql042).toMatch(
      /DROP FUNCTION IF EXISTS grant_purchase_rewards\(\s*TEXT, UUID, TEXT, INT, INT, TEXT\[\], TEXT, TEXT, INT, TEXT\s*\);/
    );
  });

  it('confiscates nothing a player already received (Rule 6)', () => {
    expect(sql042).not.toMatch(/\bDROP TABLE\b/);
    expect(sql042).not.toMatch(/\bTRUNCATE\b/);
    expect(sql042).not.toMatch(/\bDELETE FROM\b/);
    expect(sql042).not.toMatch(/\bUPDATE players\b/);
    // purchase_history survives as the record of what was sold, re-labelled.
    expect(sql042).toMatch(/COMMENT ON TABLE purchase_history IS/);
  });

  it('runs as one transaction', () => {
    expect(sql042).toMatch(/^BEGIN;$/m);
    expect(sql042).toMatch(/^COMMIT;$/m);
  });
});

describe('PREMIUM_CONFIG declares no quantity a subscription delivers (§10.4)', () => {
  it('carries billing plumbing and nothing else', () => {
    expect(Object.keys(PREMIUM_CONFIG).sort()).toEqual([
      'enabled',
      'graceDaysPastDue',
      'plans',
    ]);
  });

  it('has no progression, energy or offline perk left to read', () => {
    for (const removed of [
      'contracts',
      'passiveProgress',
      'breeding',
      'stipendEnergyPerDay',
      'energy',
      'dnaMultiplier',
    ]) {
      expect(PREMIUM_CONFIG as Record<string, unknown>).not.toHaveProperty(removed);
    }
  });
});

describe('Migration 028: premium season track (owner of claim_season_tier: 022 -> 028)', () => {
  it('premium tiers claimable while entitled OR when the season was locked in', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION claim_season_tier\(p_player_id UUID, p_level INTEGER\)/);
    expect(sql).toMatch(/t\.is_premium = false\s*\n\s*OR v_has_premium/);
    expect(sql).toMatch(/v_pbp\.is_premium/);
  });

  it('locks the season in when a subscriber claims a premium tier (goodwill rule)', () => {
    expect(sql).toMatch(/IF v_tier\.is_premium AND v_has_premium AND NOT v_pbp\.is_premium THEN/);
  });

  it('keeps the 022 economy + cosmetic-grant branches intact', () => {
    expect(sql).toMatch(/player_reroll_tokens = player_reroll_tokens \+ COALESCE\(v_tier\.reward_amount, 1\)/);
    expect(sql).toMatch(/'battle_pass_reward'/);
    expect(sql).toMatch(/'season_track'/);
    expect(sql).toMatch(/LEVEL_NOT_REACHED/);
    expect(sql).toMatch(/ALREADY_CLAIMED/);
  });

  it('seeds Season 1 premium tiers as COSMETICS ONLY (no economy faucet)', () => {
    const seedBlock = sql.slice(
      sql.indexOf('10. SEASON 1 PREMIUM TIERS'),
      sql.indexOf('11. GET_SEASON')
    );
    expect(seedBlock).toMatch(/SELECT bps\.id, t\.level, true, t\.reward_type/);
    expect(seedBlock).not.toMatch(/'dna'/);
    expect(seedBlock).not.toMatch(/'energy'/);
    expect(seedBlock).not.toMatch(/'reroll_token'/);
  });
});

describe('Migration 028: identity flair (owner of player_identity_view: 023 -> 028)', () => {
  it('adds is_premium to the view and keeps it public-safe', () => {
    expect(sql).toMatch(/has_premium\(p\.id\) AS is_premium/);
    // No billing columns leak into the public identity read path
    const viewBlock = sql.slice(
      sql.indexOf('CREATE OR REPLACE VIEW player_identity_view'),
      sql.indexOf('13. STATUS READ')
    );
    expect(viewBlock).not.toMatch(/stripe_customer_id/);
    expect(viewBlock).not.toMatch(/current_period_end/);
  });

  it('keeps the 022 view contract (founder flag, badges, avatar, clan bridge)', () => {
    expect(sql).toMatch(/AS is_founder/);
    expect(sql).toMatch(/AS badges/);
    expect(sql).toMatch(/cm\.player_id = p\.user_id/);
  });

  it('preserves the 023 column order and appends premium after legacy_score', () => {
    expect(sql).toMatch(
      /AS mastery,\s*\n\s*p\.legacy_score,\s*\n\s*has_premium\(p\.id\) AS is_premium\s*\nFROM players p/
    );
  });
});

describe('Migration 028: never pay-to-win / no paid RNG', () => {
  it('adds no stat, score or multiplier advantages anywhere', () => {
    expect(sql).not.toMatch(/base_stats/);
    expect(sql).not.toMatch(/score_multiplier/i);
    expect(sql).not.toMatch(/streak_multiplier/);
  });

  it('contains no randomized paid rewards', () => {
    expect(sql).not.toMatch(/random\(\)/i);
  });

  it('seasons never wipe: no destructive statements on player state', () => {
    expect(sql).not.toMatch(/\bDROP TABLE\b/);
    expect(sql).not.toMatch(/\bTRUNCATE\b/);
    expect(sql).not.toMatch(/DELETE FROM (players|collected_snakes|player_battle_pass|player_cosmetics)/);
  });
});
