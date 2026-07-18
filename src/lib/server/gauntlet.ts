/**
 * Server-side Clan Gauntlet state (Design v2 section 8) - the mutation-ban
 * lookup the session API trusts for offer-pool filtering (section 8.2
 * item 3: the banned mutation is removed from the opponents' offer pools
 * in their counted runs).
 *
 * PRE-MIGRATION-020 SAFE: until 020 applies, the player_gauntlet_ban RPC
 * does not exist. Every helper treats that as "gauntlet not live yet" -
 * ban reads return null (=> unfiltered pool) - and never fails the
 * request. Unexpected errors are logged and degrade the same way (the
 * gauntlet is always non-fatal to a session).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isMutationId, type MutationId } from '@/shared/game/mutations';
import type { DynastyName } from '@/shared/game/rulesets';

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

/**
 * True when the error just means migration 020 has not been applied yet:
 * missing relation (42P01), missing RPC (PostgREST PGRST202 / 42883), or
 * a message naming the gauntlet objects.
 */
export function isMissingGauntletInfra(
  error: SupabaseErrorLike | null | undefined
): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === '42883' || error.code === 'PGRST202') {
    return true;
  }
  return /player_gauntlet_ban|gauntlet_picks|clan_research|clan_tithes|get_gauntlet|contribute_tithe/i.test(
    error.message || ''
  );
}

/**
 * The mutation banned AGAINST the player's clan for this run, or null.
 * Null legitimately means: no clan, no duel, rules not resolved, the run
 * is outside the Thu-Sun counted window, the run's dynasty is not the
 * clan's picked dynasty, no ban was submitted - or migration 020 is not
 * applied yet. Callers filter the offer pool with the result; Free Play
 * must never call this (practice pools are never banned).
 *
 * @param at The run's SERVER start time - the end path passes the
 *           session's server_started_at so a run straddling Wed->Thu
 *           validates against the pool it was actually offered.
 */
export async function getGauntletBan(
  supabase: SupabaseClient,
  playerId: string,
  dynasty: DynastyName,
  at?: string | Date
): Promise<MutationId | null> {
  try {
    const { data, error } = await supabase.rpc('player_gauntlet_ban', {
      p_player_id: playerId,
      p_dynasty: dynasty,
      ...(at
        ? { p_at: at instanceof Date ? at.toISOString() : at }
        : {}),
    });

    if (error) {
      if (!isMissingGauntletInfra(error)) {
        console.error('Gauntlet ban read error:', { playerId, dynasty, error });
      }
      return null;
    }

    return isMutationId(data) ? data : null;
  } catch (err) {
    console.error('Gauntlet ban read error:', { playerId, dynasty, err });
    return null;
  }
}
