/**
 * Server-side mastery state (Design v2 section 7.1) - the ONLY source the
 * session API trusts for a player's mastery XP and unlocked mutation pool.
 * The client never asserts its own pool; the server recomputes it from
 * player_mastery here.
 *
 * PRE-MIGRATION-019 SAFE: until 019 applies, the player_mastery table and
 * grant_mastery_xp RPC do not exist. Every helper treats that as "mastery
 * not live yet" - XP reads return 0 (=> base pool), grants quietly no-op -
 * and never fails the request. Unexpected errors are logged and degrade
 * the same way (mastery is always non-fatal to a session).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DynastyName } from '@/shared/game/rulesets';

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

/**
 * True when the error just means migration 019 has not been applied yet:
 * missing relation (42P01), missing RPC (PostgREST PGRST202 / 42883), or
 * a message naming the mastery objects.
 */
export function isMissingMasteryInfra(
  error: SupabaseErrorLike | null | undefined
): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === '42883' || error.code === 'PGRST202') {
    return true;
  }
  return /player_mastery|grant_mastery_xp|level_for_xp/i.test(
    error.message || ''
  );
}

/**
 * The player's banked mastery XP for a dynasty. 0 when no row exists yet
 * (a fresh dynasty) AND when migration 019 has not been applied - both
 * legitimately mean "level 0, base pool".
 */
export async function getMasteryXp(
  supabase: SupabaseClient,
  playerId: string,
  dynasty: DynastyName
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('player_mastery')
      .select('xp')
      .eq('player_id', playerId)
      .eq('dynasty', dynasty)
      .maybeSingle();

    if (error) {
      if (!isMissingMasteryInfra(error)) {
        console.error('Mastery XP read error:', { playerId, dynasty, error });
      }
      return 0;
    }
    const xp = Number(data?.xp ?? 0);
    return Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  } catch (err) {
    console.error('Mastery XP read error:', { playerId, dynasty, err });
    return 0;
  }
}

/**
 * Result of a strict mastery read: either the XP, or the read error.
 *
 * `ok: true` still covers the pre-migration-019 window (no table, no rows) —
 * "mastery is not live here" and "this player has no XP yet" both honestly
 * mean level 0. What it no longer covers is a REAL read failure.
 */
export type MasteryXpResult =
  | { ok: true; xp: number }
  | { ok: false; error: unknown };

/**
 * The strict variant, for SETTLEMENT.
 *
 * WP-2.05: `getMasteryXp` below returns 0 on any error, and 0 XP is not a
 * neutral default at settlement — it narrows `unlockedMutationPool`, which
 * makes the validator drop legally-offered picks with `MUTATION_LOCKED` /
 * `GENE_LOCKED`, which shrinks the recompute, which shrinks
 * `validation.adjustedDna`, WHICH IS THE PAYOUT. A transient blip on
 * `player_mastery` therefore took DNA off a finished run.
 *
 * Settlement calls this and answers 503 on `ok: false` so the outbox
 * retries. The lenient reader stays for paths where a narrower pool is a
 * display concern rather than a payout one.
 */
export async function getMasteryXpStrict(
  supabase: SupabaseClient,
  playerId: string,
  dynasty: DynastyName
): Promise<MasteryXpResult> {
  try {
    const { data, error } = await supabase
      .from('player_mastery')
      .select('xp')
      .eq('player_id', playerId)
      .eq('dynasty', dynasty)
      .maybeSingle();

    if (error) {
      // Pre-019 is not a failure - it is "mastery is not live yet".
      if (isMissingMasteryInfra(error)) return { ok: true, xp: 0 };
      return { ok: false, error };
    }
    const xp = Number(data?.xp ?? 0);
    return {
      ok: true,
      xp: Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0,
    };
  } catch (err) {
    return { ok: false, error: err };
  }
}

/**
 * Grant banked mastery XP via the grant_mastery_xp RPC (upsert-add).
 * Returns the new XP total, or null when the grant could not be made
 * (pre-019 window: quiet; anything else: logged). Never throws.
 */
export async function grantMasteryXp(
  supabase: SupabaseClient,
  playerId: string,
  dynasty: DynastyName,
  xp: number
): Promise<{ xpAfter: number } | null> {
  if (!Number.isFinite(xp) || xp <= 0) return null;
  try {
    const { data, error } = await supabase.rpc('grant_mastery_xp', {
      p_player_id: playerId,
      p_dynasty: dynasty,
      p_xp: Math.floor(xp),
    });

    if (error) {
      if (!isMissingMasteryInfra(error)) {
        console.error('Mastery XP grant error:', {
          playerId,
          dynasty,
          xp,
          error,
        });
      }
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;
    const xpAfter = Number(
      (row as { xp_after?: unknown } | null)?.xp_after ?? Number.NaN
    );
    if (!Number.isFinite(xpAfter)) {
      console.error('Mastery XP grant returned no total:', {
        playerId,
        dynasty,
        xp,
        data,
      });
      return null;
    }
    return { xpAfter };
  } catch (err) {
    console.error('Mastery XP grant error:', { playerId, dynasty, xp, err });
    return null;
  }
}
