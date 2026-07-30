/**
 * Reading the World Report from the database (Constitution §7.5).
 *
 * The pure composer in `@/lib/report/worldReport` decides what a returning
 * player is told. This module decides only what it is told FROM: the player's
 * last run, monotonic Depth standing, and aggregate Clan Energy Battles that
 * settled while they were away. Every fact was already secured server-side;
 * none of these reads writes or claims anything.
 *
 * NO MIGRATION, AND WHY THERE MUST NOT BE ONE
 *
 *   Absence is measured from `game_sessions.started_at` — the most recent run
 *   the player opened. That column has existed since migration 001 and is
 *   already server-authoritative, so the World Report needs no new table, no
 *   new column, no `last_seen_at` and no write on page load. That matters
 *   beyond convenience: a `last_seen_at` column would be a row this feature
 *   WRITES, and the moment a return screen writes a row it acquires state that
 *   can be stale, wrong, or — the failure §7.5 exists to prevent — resettable.
 *   A report derived entirely from rows other systems already wrote cannot
 *   develop a debt, because it has no ledger of its own.
 *
 *   Measuring from the last RUN rather than the last VISIT is deliberate too:
 *   a player who opened the tab yesterday and did not play has still been away
 *   from the world for the purposes of §7.5, and no anonymous page view is
 *   trustworthy enough to gate a screen on.
 *
 * IT COSTS THE SAME NO MATTER HOW LONG THE ABSENCE (Rule 13)
 *
 *   The battle reader caps its settled-cycle query at four rows. A two-year
 *   return is therefore exactly as expensive as a two-week one, and the
 *   day-count check runs BEFORE any social read, so the overwhelmingly common
 *   case — somebody who played yesterday — costs one small query and stops.
 *
 * RULE 11
 *
 *   Every Supabase `error` is checked and reported to Sentry. A failed read
 *   returns `null`, never a partial report: a return screen composed from half
 *   the world would misreport it, and misreporting the world to somebody who
 *   was away is precisely the harm §7.5 is about.
 */

import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  WORLD_REPORT_MIN_ABSENT_DAYS,
  WORLD_REPORT_V1_ENABLED,
} from '@/lib/report/config';
import {
  composeWorldReport,
  daysAway,
  type WorldReport,
} from '@/lib/report/worldReport';
import { readWorldReportEnergyContext } from '@/lib/server/worldReportEnergy';

function report(scope: string, error: unknown, extra: Record<string, unknown> = {}) {
  console.error(`World Report ${scope} failed:`, { ...extra, error });
  Sentry.captureException(
    error instanceof Error ? error : new Error(`World Report ${scope} failed`),
    { extra: { scope, ...extra, error } }
  );
}

/**
 * When the player last opened a run, ISO, or `null` if never.
 *
 * `undefined` means the read failed and the caller must not compose: treating
 * a failed read as "never played" would silently withhold a real return
 * screen, and treating it as "away forever" would fabricate one.
 */
export async function readLastRunAt(
  supabase: SupabaseClient,
  playerId: string
): Promise<string | null | undefined> {
  const { data, error } = await supabase
    .from('game_sessions')
    .select('started_at')
    .eq('player_id', playerId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    report('last run read', error, { playerId });
    return undefined;
  }
  return (data?.started_at as string | undefined) ?? null;
}

/**
 * Compose this player's World Report, or `null` for "render nothing".
 *
 * `null` is the answer to every uninteresting case and every failure: flag
 * off, never played, back within three days, a read that failed, or copy that
 * tripped the Rule 5 sweep. The surface renders nothing in all of them, which
 * is the right default for a screen whose entire justification is that
 * returning should feel better than not returning.
 */
export async function buildWorldReport(
  supabase: SupabaseClient,
  playerId: string,
  now: Date | number = Date.now()
): Promise<WorldReport | null> {
  if (!WORLD_REPORT_V1_ENABLED) return null;

  const lastSeenAt = await readLastRunAt(supabase, playerId);
  if (lastSeenAt === undefined || lastSeenAt === null) return null;
  // Cheap gate first: the common case is a player who played yesterday, and
  // they cost one query and nothing else.
  if (daysAway(lastSeenAt, now) < WORLD_REPORT_MIN_ABSENT_DAYS) return null;

  const energyContext = await readWorldReportEnergyContext(
    supabase,
    playerId,
    lastSeenAt,
    now
  );
  if (!energyContext) return null;

  try {
    return composeWorldReport({ lastSeenAt, energyContext }, now);
  } catch (error) {
    // The Rule 5 sweep refused the copy. Loud, and no report rather than one
    // that tells a returning player they are in arrears.
    report('composition', error, { playerId, lastSeenAt });
    return null;
  }
}
