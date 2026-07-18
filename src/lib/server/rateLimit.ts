/**
 * Rate Limiter - Server-side rate limiting
 * Uses database-backed timestamps for persistence
 */

import { SupabaseClient } from '@supabase/supabase-js';

export type ActionType =
  | 'game_start'
  | 'breeding'
  | 'purchase'
  | 'handle_check'
  | 'handle_claim';

export const RATE_LIMITS: Record<ActionType, number> = {
  game_start: 5000,
  breeding: 5000,
  purchase: 1000,
  // Identity v1 (section 3): availability checks are debounced client-side
  // too, but the server holds its own line; claims are rare and deliberate.
  handle_check: 500,
  handle_claim: 3000,
};

interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

export async function checkRateLimit(
  supabase: SupabaseClient,
  playerId: string,
  action: ActionType
): Promise<RateLimitResult> {
  const limitMs = RATE_LIMITS[action];

  const { data: existing } = await supabase
    .from('rate_limits')
    .select('last_action_at')
    .eq('player_id', playerId)
    .eq('action_type', action)
    .single();

  if (existing) {
    const lastAction = new Date(existing.last_action_at).getTime();
    const now = Date.now();
    const elapsed = now - lastAction;

    if (elapsed < limitMs) {
      return { allowed: false, retryAfterMs: limitMs - elapsed };
    }
  }

  await supabase
    .from('rate_limits')
    .upsert(
      {
        player_id: playerId,
        action_type: action,
        last_action_at: new Date().toISOString(),
      },
      { onConflict: 'player_id,action_type' }
    );

  return { allowed: true };
}
