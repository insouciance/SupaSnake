/**
 * The world roll-up — one settled Serpent week at world scale.
 *
 * §11.6 asks for "top clans, record Depths, world-firsts, the week's named
 * conditions". WP-1.09 wrote that read inside the settlement-dispatch cron;
 * WP-2.02 (the World Report, §7.5) needs the same four facts for every week a
 * returning player was away for. So the read lives here, imported by both,
 * rather than existing twice with two chances to disagree about what a week
 * did.
 *
 * IT IS A READ AND NOTHING ELSE
 *
 *   No write, no upsert, no settlement, no publish. It reads three settled
 *   tables — `serpent_weeks`, `serpent_week_clans`, `serpent_chronicle_entries`
 *   — all of which are written by settlement and never by a surface. Reading
 *   the same week twice therefore returns the same numbers, which is what lets
 *   the operator's post and a player's World Report describe one week
 *   identically.
 *
 * IT FAILS CLOSED, NEVER LOUD, NEVER INVENTED (Rule 11)
 *
 *   Every Supabase `error` is checked. A missing-table error (pre-046) returns
 *   `null` silently — that is a database state, not an incident. Any other
 *   error is reported to Sentry and also returns `null`, because a partial
 *   roll-up would understate a week and a fabricated one would misreport it.
 *   `null` means "no reading available", and both callers render nothing
 *   rather than a wrong week.
 *
 * RULE 8
 *
 *   `clans` comes back ordered by Depth because a post has to print in some
 *   order, and truncated at `WORLD_ROLLUP_CLAN_LIMIT` because a post has a
 *   length. Neither is a position, a cut line or a qualification, and no field
 *   here carries a rank, a bar or a threshold for a surface to render as one.
 */

import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { WorldSettlement, WorldSettlementClan } from '@/lib/growth/settlementPost';
import { isMissingSerpentInfra } from '@/lib/server/serpent';

/**
 * How many clans a roll-up names. A post length, not a cut line: a clan below
 * it is not excluded from anything, loses nothing and is told nothing.
 */
export const WORLD_ROLLUP_CLAN_LIMIT = 5;

/** The roll-up minus the week key the caller already knows. */
export type WorldRollup = Omit<WorldSettlement, 'weekKey'>;

function report(scope: string, error: unknown, extra: Record<string, unknown> = {}) {
  console.error(`World rollup ${scope} failed:`, { ...extra, error });
  Sentry.captureException(
    error instanceof Error ? error : new Error(`World rollup ${scope} failed`),
    { extra: { scope, ...extra, error } }
  );
}

/** A week that exists but settled nothing. Honest, and not an error. */
function emptyRollup(): WorldRollup {
  return { clans: [], personalRecords: 0, clanRecords: 0, clanFirsts: 0 };
}

/**
 * Read one settled week at world scale.
 *
 * Returns `null` when the Serpent tables are not there yet (pre-046) or when a
 * read failed — the caller then composes nothing rather than inventing a week.
 * Returns an empty roll-up when the week row exists but nobody settled a
 * Depth: that is a real, quiet week and it deserves a real, quiet reading.
 */
export async function readWorldRollup(
  supabase: SupabaseClient,
  weekStart: string
): Promise<WorldRollup | null> {
  const { data: week, error: weekError } = await supabase
    .from('serpent_weeks')
    .select('id')
    .eq('week_start', weekStart)
    .maybeSingle();
  if (weekError) {
    if (!isMissingSerpentInfra(weekError)) report('week read', weekError, { weekStart });
    return null;
  }
  if (!week?.id) return emptyRollup();

  const { data: clanRows, error: clanError } = await supabase
    .from('serpent_week_clans')
    .select('depth, contributing_members, clans(name, tag)')
    .eq('week_id', week.id)
    .gt('depth', 0)
    .order('depth', { ascending: false })
    .limit(WORLD_ROLLUP_CLAN_LIMIT);
  if (clanError) {
    if (!isMissingSerpentInfra(clanError)) report('clan read', clanError, { weekStart });
    return null;
  }

  const clans: WorldSettlementClan[] = (clanRows ?? []).map((row) => {
    const clan = row.clans as unknown as { name?: string; tag?: string | null } | null;
    return {
      name: clan?.name ?? 'A clan',
      tag: clan?.tag ?? null,
      depth: Number(row.depth ?? 0),
      contributingMembers: Number(row.contributing_members ?? 0),
    };
  });

  const { data: records, error: recordError } = await supabase
    .from('serpent_chronicle_entries')
    .select('kind, previous_depth')
    .eq('week_id', week.id);
  if (recordError) {
    if (!isMissingSerpentInfra(recordError)) {
      report('chronicle read', recordError, { weekStart });
    }
    // The clans are already read and already true. Reporting them with zero
    // records understates the week; refusing the whole week erases it. The
    // clans are the week's substance, so they are kept.
    return { clans, personalRecords: 0, clanRecords: 0, clanFirsts: 0 };
  }

  let personalRecords = 0;
  let clanRecords = 0;
  let clanFirsts = 0;
  for (const row of records ?? []) {
    if (row.kind === 'personal_best_week') personalRecords += 1;
    else if (row.kind === 'clan_best_week') {
      clanRecords += 1;
      if (Number(row.previous_depth ?? 0) === 0) clanFirsts += 1;
    }
  }
  return { clans, personalRecords, clanRecords, clanFirsts };
}
