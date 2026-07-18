/**
 * Server-side season state (Design v2 Phase 4B, section 7.2) - the
 * seasonal-mutation offer-pool lookup the session API trusts, plus the
 * shared "is this just migration 021 not being applied yet" detector the
 * season/anomaly surfaces use to degrade to { live: false }.
 *
 * PRE-MIGRATION-021 SAFE: until 021 applies, the seasons/season_mutations
 * tables and the get_season/get_anomaly_board/claim_season_tier RPCs do
 * not exist. Every helper treats that as "seasons not live yet" -
 * seasonal pools read empty, reads report not-live - and never fails the
 * request. Unexpected errors are logged and degrade the same way.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isMutationId, type MutationId } from '@/shared/game/mutations';

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

/**
 * True when the error just means migration 021 has not been applied yet:
 * missing relation (42P01), missing column (42703), missing RPC
 * (PostgREST PGRST202 / 42883), or a message naming the season/anomaly
 * objects.
 */
export function isMissingSeasonInfra(
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
  return /season_mutations|season_playoff|season_champions|get_season|get_anomaly_board|claim_season_tier|anomaly_id|anomaly_week|\bseasons\b/i.test(
    error.message || ''
  );
}

/**
 * The seasonal mutation ids currently in the offer pool: every mutation
 * of a season whose window has STARTED (section 7.2 - in the pool all
 * season, then permanent, so "started" is the only gate). Empty pre-021,
 * before Season 1 starts, and on any read failure - the pool addition is
 * always non-fatal to a session.
 */
export async function getSeasonalMutationIds(
  supabase: SupabaseClient
): Promise<MutationId[]> {
  try {
    const { data, error } = await supabase
      .from('season_mutations')
      .select('mutation_id, seasons!inner(starts_on)')
      .lte('seasons.starts_on', new Date().toISOString().slice(0, 10));

    if (error) {
      if (!isMissingSeasonInfra(error)) {
        console.error('Seasonal mutation pool read error:', error);
      }
      return [];
    }

    const ids: MutationId[] = [];
    for (const row of data ?? []) {
      const id = (row as { mutation_id?: unknown }).mutation_id;
      if (isMutationId(id) && !ids.includes(id)) {
        ids.push(id);
      }
    }
    return ids;
  } catch (err) {
    console.error('Seasonal mutation pool read error:', err);
    return [];
  }
}
