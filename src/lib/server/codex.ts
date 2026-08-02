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
  // Rolling deploys deliberately tolerate only the exact database/schema-cache
  // signals for a table, column, or RPC that has not landed yet. Never infer
  // "missing infrastructure" from a message containing a Codex identifier:
  // permission, timeout, and connection errors include those names too and
  // must remain reportable under Rule 11.
  return new Set([
    '42P01', // undefined_table
    '42703', // undefined_column
    '42883', // undefined_function
    'PGRST202', // function absent from the PostgREST schema cache
    'PGRST204', // column absent from the PostgREST schema cache
    'PGRST205', // table absent from the PostgREST schema cache
  ]).has(error.code ?? '');
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
