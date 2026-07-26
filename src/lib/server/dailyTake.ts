/**
 * The Daily Take — server authority (Constitution §7.2, §12.2, Rules 5, 6, 11).
 *
 * Two jobs, and nothing else:
 *
 *   `describeDailyTakeSlot`  what the day's Results slot should show — a
 *                            PREVIEW, read-only, never a grant.
 *   `collectDailyTake`       the collect itself. One RPC call; every decision
 *                            about the day, the tier and the amount is made
 *                            inside migration 050's transaction under a row
 *                            lock, not here.
 *
 * WHY THE MATH IS NOT DONE IN THIS FILE
 *
 * `src/shared/game/dailyTake.ts` has the ladder and is unit-tested against
 * every boundary, but it is used here ONLY to render a preview. The number
 * that gets paid is computed inside `collect_daily_take`, in the same
 * transaction that locks the row, claims the day and writes the audit entry.
 * A read-compute-write split across the network is exactly how a double
 * collect becomes possible; there is no such split on the paying path.
 *
 * THE GAME'S ONE CLAIM (§12.2)
 *
 * This module is the only thing in the product that calls
 * `collect_daily_take`, and `POST /api/daily-take/collect` is the only thing
 * that calls this module's `collectDailyTake`. §7.2 allows exactly one collect
 * moment and this is it — WP-0.03's `faucetPurge.test.ts` pins the count of
 * claim-shaped routes so the list can only ever shrink.
 *
 * PRE-MIGRATION-050 SAFE
 *
 * Until 050 applies, the RPC does not exist. `isMissingTakeInfra` recognises
 * that and every entry point degrades to "the Take is not live". The
 * degradation direction is the CLOSED one: no RPC means no grant, so a
 * deploy that runs ahead of its migration cannot pay a Take twice, or at all.
 *
 * Rule 11: every Supabase `error` is checked and reported to Sentry.
 */

import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  isTakeAvailable,
  normalizeTakeState,
  previewDailyTake,
  takeDayKey,
  takeMultiplierForTier,
  type TakeStreakState,
} from '@/shared/game/dailyTake';
import { DAILY_TAKE_V1_ENABLED } from '@/lib/dailyTake/config';

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

/**
 * Is this failure just "migration 050 (or 041) has not been applied here yet"?
 *
 * 42703 unknown column, 42P01 unknown table, 42883/PGRST202/PGRST204 unknown
 * function or unknown column in the PostgREST schema cache. The name test
 * catches drivers that report the same thing without a code.
 */
export function isMissingTakeInfra(
  error: SupabaseErrorLike | null | undefined
): boolean {
  if (!error) return false;
  if (
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === '42883' ||
    error.code === 'PGRST202' ||
    error.code === 'PGRST204'
  ) {
    return true;
  }
  return /collect_daily_take|take_streak_days|take_tier|take_longest_streak|take_last_claim_date|player_streaks/i.test(
    error.message || ''
  );
}

function report(scope: string, error: unknown, extra: Record<string, unknown>) {
  console.error(`Daily Take ${scope} failed:`, { ...extra, error });
  Sentry.captureException(
    error instanceof Error ? error : new Error(`Daily Take ${scope} failed`),
    { extra: { scope, ...extra, error } }
  );
}

/** The Take slot as the settlement and the collect endpoint both report it. */
export interface DailyTakeSlot {
  /** Whether the mechanism is armed at all (flag + migration 050). */
  live: boolean;
  /**
   * Whether this run may collect the day's Take.
   *
   * True until the day's Take is actually collected, not merely until the
   * day's first run ends: §7.2 forbids destructive absence, so a player who
   * closes the tab on their first Results has not lost the day (Rule 5). It
   * flips to false the instant a collect settles, which is what stops the
   * surface offering a second one.
   */
  firstRunOfDay: boolean;
  /** DNA this collect would pay, tier already applied. 0 once collected. */
  amount: number;
  /** The chain length this collect would leave behind. */
  streakDays: number;
  /** The §7.2 tier multiplier — applied to the Take's own base, nothing else. */
  multiplier: number;
  /** True once the day's Take is settled. */
  collected: boolean;
}

const OFF_SLOT: DailyTakeSlot = {
  live: false,
  firstRunOfDay: false,
  amount: 0,
  streakDays: 0,
  multiplier: 1,
  collected: false,
};

interface TakeRow {
  take_streak_days?: number | null;
  take_tier?: number | null;
  take_longest_streak?: number | null;
  take_last_claim_date?: string | null;
}

function stateFromRow(row: TakeRow | null): TakeStreakState {
  return normalizeTakeState({
    streakDays: row?.take_streak_days ?? 0,
    tier: row?.take_tier ?? 0,
    longestStreak: row?.take_longest_streak ?? 0,
    lastClaimDate: row?.take_last_claim_date ?? null,
  });
}

/**
 * Read a player's Take chain.
 *
 * Returns null when the Take is not live here — flag off, or migration 050/041
 * not applied. A missing `player_streaks` row is NOT an error: a player who
 * has never played has never collected, which is a valid state (the RPC
 * creates the row when they first do).
 */
export async function readTakeState(
  supabase: SupabaseClient,
  playerId: string
): Promise<TakeStreakState | null> {
  if (!DAILY_TAKE_V1_ENABLED) return null;

  const { data, error } = await supabase
    .from('player_streaks')
    .select('take_streak_days, take_tier, take_longest_streak, take_last_claim_date')
    .eq('player_id', playerId)
    .maybeSingle();

  if (error) {
    if (isMissingTakeInfra(error)) return null;
    report('chain read', error, { playerId });
    return null;
  }

  return stateFromRow((data as TakeRow | null) ?? null);
}

/**
 * The Take slot for a settled run.
 *
 * READ-ONLY. This function has no write in it: it cannot grant, cannot advance
 * a chain and cannot mark a day collected. That matters because it runs on the
 * run-settlement path, which is the hottest write path in the product — the
 * Take must never be able to make a run fail, and it must never be paid as a
 * side effect of finishing one. §7.2 is explicit that the Take is collected
 * with a tap, not automatically.
 *
 * Every failure resolves to "no slot", which the Results layer renders as no
 * Take offered. That is the safe direction: an unoffered Take is still
 * collectable through the endpoint on the next run of the same day.
 */
export async function describeDailyTakeSlot(
  supabase: SupabaseClient,
  playerId: string,
  now: Date = new Date()
): Promise<DailyTakeSlot | null> {
  if (!DAILY_TAKE_V1_ENABLED) return null;

  const state = await readTakeState(supabase, playerId);
  if (!state) return null;

  const available = isTakeAvailable(state.lastClaimDate, now);
  if (!available) {
    return {
      live: true,
      firstRunOfDay: false,
      amount: 0,
      streakDays: state.streakDays,
      multiplier: takeMultiplierForTier(state.tier),
      collected: true,
    };
  }

  const preview = previewDailyTake(state, now);
  return {
    live: true,
    firstRunOfDay: true,
    amount: preview.amount,
    streakDays: preview.streakDays,
    multiplier: preview.multiplier,
    collected: false,
  };
}

export type DailyTakeCollectResult =
  | { status: 'off'; slot: DailyTakeSlot }
  | { status: 'collected'; slot: DailyTakeSlot; amount: number; cooled: boolean; dna: number }
  | { status: 'already'; slot: DailyTakeSlot }
  | { status: 'failed' };

interface CollectRpcRow {
  collected?: boolean;
  already_collected?: boolean;
  amount?: number;
  tier?: number;
  multiplier?: number | string;
  streak_days?: number;
  longest_streak?: number;
  cooled?: boolean;
  day?: string;
  dna?: number;
}

function numeric(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/**
 * Collect the day's Take. The game's one claim (§12.2).
 *
 * ONE round trip, and no read-then-write. Everything that decides whether
 * anything is granted — the day, the lock, the compare-and-set, the tier, the
 * amount, the audit row — happens inside migration 050's transaction. This
 * function contributes a player id and interprets the answer.
 *
 * A second call is therefore safe by construction rather than by convention:
 * there is no state here to get out of date, and no branch in this file that
 * can decide to pay. `already` is a success, not an error — a replayed request,
 * a double tap and a second device all land on it, and none of them are told
 * anything went wrong.
 */
export async function collectDailyTake(
  supabase: SupabaseClient,
  playerId: string,
  now: Date = new Date()
): Promise<DailyTakeCollectResult> {
  if (!DAILY_TAKE_V1_ENABLED) return { status: 'off', slot: OFF_SLOT };

  const { data, error } = await supabase.rpc('collect_daily_take', {
    p_player_id: playerId,
  });

  if (error) {
    if (isMissingTakeInfra(error)) return { status: 'off', slot: OFF_SLOT };
    report('collect', error, { playerId, day: takeDayKey(now) });
    return { status: 'failed' };
  }

  const row = (Array.isArray(data) ? data[0] : data) as CollectRpcRow | null;
  if (!row) {
    report('collect', new Error('collect_daily_take returned no row'), {
      playerId,
      day: takeDayKey(now),
    });
    return { status: 'failed' };
  }

  const amount = Math.max(0, Math.floor(numeric(row.amount, 0)));
  const streakDays = Math.max(0, Math.floor(numeric(row.streak_days, 0)));
  const multiplier = Math.max(1, numeric(row.multiplier, 1));
  const collected = row.collected === true;

  const slot: DailyTakeSlot = {
    live: true,
    // The day is settled either way once this returns: whatever happens next,
    // this run can no longer collect.
    firstRunOfDay: false,
    amount: collected ? amount : 0,
    streakDays,
    multiplier,
    collected: true,
  };

  if (!collected) return { status: 'already', slot };

  return {
    status: 'collected',
    slot,
    amount,
    cooled: row.cooled === true,
    dna: Math.max(0, Math.floor(numeric(row.dna, 0))),
  };
}
