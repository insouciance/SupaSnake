/** Server bridge from validator-accepted Genome records to migration 031. */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AcceptedGenome } from '@/lib/server/gameValidator';
import {
  sanitizeCodexDiscoveryResult,
  type CodexDiscoveryResult,
} from '@/shared/game/codex';

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

export function isMissingCodexInfra(
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
  return /player_codex|codex_first_discoveries|record_codex_discoveries|codex_discovery/i.test(
    error.message || ''
  );
}

/**
 * Record discoveries after a run has ended. Failure is intentionally
 * non-fatal to the already-completed payout path and pre-031 safe.
 */
export async function recordCodexDiscoveries(
  supabase: SupabaseClient,
  playerId: string,
  sessionId: string,
  genome: AcceptedGenome
): Promise<CodexDiscoveryResult | null> {
  try {
    const { data, error } = await supabase.rpc('record_codex_discoveries', {
      p_player_id: playerId,
      p_session_id: sessionId,
      p_genome: genome,
    });
    if (error) {
      if (!isMissingCodexInfra(error)) {
        console.error('Codex discovery grant error:', {
          playerId,
          sessionId,
          error,
        });
      }
      return null;
    }
    return sanitizeCodexDiscoveryResult(data);
  } catch (error) {
    console.error('Codex discovery grant error:', {
      playerId,
      sessionId,
      error,
    });
    return null;
  }
}
