/**
 * Server-side records access (Player Identity v1 section 6, migration
 * 023) - the "is this just migration 023 not being applied yet" detector
 * and the non-fatal refresh wrapper.
 *
 * PRE-MIGRATION-023 SAFE: until 023 applies, record_definitions,
 * player_records, refresh_player_records, chronicle_pb_timeline,
 * clan_rating_history and players.legacy_score do not exist. Every
 * helper treats that as "records not live yet" and never fails the
 * caller. Unexpected errors are logged and degrade the same way.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

/**
 * True when the error just means migration 023 has not been applied yet:
 * missing relation (42P01), missing column (42703), missing function
 * (42883), PostgREST missing-RPC/relation (PGRST202/205), or a message
 * naming the records objects.
 */
export function isMissingRecordsInfra(
  error: SupabaseErrorLike | null | undefined
): boolean {
  if (!error) return false;
  if (
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === '42883' ||
    error.code === 'PGRST202' ||
    error.code === 'PGRST205'
  ) {
    return true;
  }
  return /record_definitions|player_records|refresh_player_records|chronicle_pb_timeline|clan_rating_history|legacy_score/i.test(
    error.message || ''
  );
}

export interface RecordsRefreshResult {
  legacyScore: number;
  records: Record<string, { value: number; tier: number }>;
  previousRecords: Record<string, { value: number; tier: number }> | null;
}

/**
 * Read the exact pre-refresh record state so settlement can report tier/value
 * transitions rather than silently replacing them. Missing infrastructure and
 * read failures remain non-fatal, matching `refreshPlayerRecords`.
 */
export async function readPlayerRecords(
  supabase: SupabaseClient,
  playerId: string
): Promise<Record<string, { value: number; tier: number }> | null> {
  try {
    const { data, error } = await supabase
      .from('player_records')
      .select('record_id, value, tier')
      .eq('player_id', playerId);
    if (error) {
      if (!isMissingRecordsInfra(error)) {
        console.error('player_records read error:', { playerId, error });
      }
      return null;
    }
    const records: Record<string, { value: number; tier: number }> = {};
    for (const row of data ?? []) {
      if (typeof row.record_id !== 'string') continue;
      const value = Number(row.value ?? 0);
      const tier = Number(row.tier ?? 0);
      records[row.record_id] = {
        value: Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0,
        tier: Number.isFinite(tier)
          ? Math.max(0, Math.min(5, Math.floor(tier)))
          : 0,
      };
    }
    return records;
  } catch (error) {
    console.error('player_records read error:', { playerId, error });
    return null;
  }
}

/**
 * Idempotent recompute-from-aggregates via refresh_player_records
 * (service-role client required - the RPC is revoked from players).
 * Returns null pre-023 or on any failure - NEVER throws, never fails
 * the caller (section 6.3: the session-end call is non-fatal).
 */
export async function refreshPlayerRecords(
  supabase: SupabaseClient,
  playerId: string
): Promise<RecordsRefreshResult | null> {
  try {
    const previousRecords = await readPlayerRecords(supabase, playerId);
    const { data, error } = await supabase.rpc('refresh_player_records', {
      p_player_id: playerId,
    });

    if (error) {
      if (!isMissingRecordsInfra(error)) {
        console.error('refresh_player_records error:', { playerId, error });
      }
      return null;
    }

    const result = data as
      | { success?: boolean; legacy_score?: number; records?: Record<string, { value: number; tier: number }>; error?: string }
      | null;
    if (!result || result.success !== true) {
      if (result?.error) {
        console.error('refresh_player_records rejected:', { playerId, error: result.error });
      }
      return null;
    }

    return {
      legacyScore: result.legacy_score ?? 0,
      records: result.records ?? {},
      previousRecords,
    };
  } catch (err) {
    console.error('refresh_player_records error:', { playerId, err });
    return null;
  }
}
