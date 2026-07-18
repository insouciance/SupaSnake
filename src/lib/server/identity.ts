/**
 * Server-side identity reads (Player Identity v1, migration 022) - the
 * shared "is this just migration 022 not being applied yet" detector and
 * the own-identity lookup the session/leaderboard surfaces use.
 *
 * PRE-MIGRATION-022 SAFE: until 022 applies, player_identity_view, the
 * cosmetics tables and the claim/equip RPCs do not exist. Every helper
 * treats that as "identity not live yet" - identities read as generated
 * handler-NNNN names (derived in TS exactly as the view derives them),
 * cosmetics read empty - and never fails the request. Unexpected errors
 * are logged and degrade the same way.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { generatedHandleFor } from '@/lib/identity/handle';
import {
  identityFromRow,
  type PlayerIdentity,
  type PlayerIdentityRow,
} from '@/lib/identity/types';

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

/**
 * True when the error just means migration 022 has not been applied yet:
 * missing relation (42P01), missing column (42703), missing RPC
 * (PostgREST PGRST202/205 / 42883), or a message naming the identity
 * objects.
 */
export function isMissingIdentityInfra(
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
  return /player_identity_view|reserved_handles|cosmetic_definitions|player_cosmetics|player_loadout|claim_handle|equip_cosmetic|get_player_identities|\bhandle\b|run_events|death_cause/i.test(
    error.message || ''
  );
}

/**
 * A degraded identity for the pre-022 window (or a missing row): the
 * derived guest name, no cosmetics - exactly what the view would say
 * about a player with no identity state.
 */
export function fallbackIdentity(playerId: string): PlayerIdentity {
  return {
    playerId,
    userId: null,
    handle: null,
    displayHandle: generatedHandleFor(playerId),
    isGenerated: true,
    isFounder: false,
    title: null,
    bannerId: null,
    bannerRender: null,
    badges: [],
    avatar: null,
    clanTag: null,
    clanName: null,
    mastery: {},
  };
}

/**
 * The player's own identity row from the view, or null when migration
 * 022 has not been applied yet (or the read failed). Callers that need
 * "current behavior" pre-022 branch on the null; callers that always
 * need a value use getIdentityForPlayer. Never throws.
 */
export async function getLiveIdentityForPlayer(
  supabase: SupabaseClient,
  playerId: string
): Promise<PlayerIdentity | null> {
  try {
    const { data, error } = await supabase
      .from('player_identity_view')
      .select('*')
      .eq('player_id', playerId)
      .maybeSingle();

    if (error) {
      if (!isMissingIdentityInfra(error)) {
        console.error('Identity read error:', { playerId, error });
      }
      return null;
    }
    if (!data) return null;
    return identityFromRow(data as PlayerIdentityRow);
  } catch (err) {
    console.error('Identity read error:', { playerId, err });
    return null;
  }
}

/**
 * The player's identity, degrading to the derived handler-NNNN fallback
 * pre-022 / on any read failure. Never throws, never fails the caller.
 */
export async function getIdentityForPlayer(
  supabase: SupabaseClient,
  playerId: string
): Promise<PlayerIdentity> {
  return (
    (await getLiveIdentityForPlayer(supabase, playerId)) ??
    fallbackIdentity(playerId)
  );
}

/**
 * Batch identities for a set of player ids (players.id space), keyed by
 * player id. Contains ONLY rows the view returned: pre-022 (or on any
 * read failure) the map is empty and list surfaces keep their legacy
 * name fallbacks - exactly today's behavior.
 */
export async function getIdentitiesForPlayers(
  supabase: SupabaseClient,
  playerIds: string[]
): Promise<Map<string, PlayerIdentity>> {
  const unique = Array.from(new Set(playerIds.filter(Boolean)));
  const result = new Map<string, PlayerIdentity>();
  if (unique.length === 0) return result;

  try {
    const { data, error } = await supabase
      .from('player_identity_view')
      .select('*')
      .in('player_id', unique);

    if (error) {
      if (!isMissingIdentityInfra(error)) {
        console.error('Identity batch read error:', error);
      }
      return result;
    }
    for (const row of (data ?? []) as PlayerIdentityRow[]) {
      result.set(row.player_id, identityFromRow(row));
    }
  } catch (err) {
    console.error('Identity batch read error:', err);
  }
  return result;
}
