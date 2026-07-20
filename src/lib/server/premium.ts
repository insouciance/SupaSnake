/**
 * Server-side premium entitlement helpers (migration 028).
 *
 * PRE-MIGRATION-028 SAFE: until 028 applies, the premium tables/RPCs do
 * not exist. Every helper treats that as "not premium" and never fails
 * the request - premium perks simply stay off.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

/**
 * True when the error just means migration 028 has not been applied yet:
 * missing relation (42P01), missing column (42703), missing RPC
 * (PostgREST PGRST202 / 42883), or a message naming the premium objects.
 */
export function isMissingPremiumInfra(
  error: SupabaseErrorLike | null | undefined
): boolean {
  if (!error) return false;
  if (
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === '42883' ||
    error.code === 'PGRST202'
  ) {
    return true;
  }
  return /premium_subscriptions|premium_stipend_claims|premium_cosmetic_drops|premium_drop_claims|has_premium|claim_premium_stipend|get_premium_status|apply_subscription_update/i.test(
    error.message || ''
  );
}

/**
 * Whether the player currently holds the premium entitlement (active or
 * trialing subscription, or past_due within the 7-day grace window - the
 * has_premium() SQL function is the single source of truth). False on any
 * failure: a read error must never accidentally grant perks, and missing
 * infra means premium is not live yet.
 */
export async function hasPremium(
  supabase: SupabaseClient,
  playerId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('has_premium', {
      p_player_id: playerId,
    });
    if (error) {
      if (!isMissingPremiumInfra(error)) {
        console.error('has_premium RPC error:', error);
      }
      return false;
    }
    return data === true;
  } catch (err) {
    console.error('has_premium RPC error:', err);
    return false;
  }
}
