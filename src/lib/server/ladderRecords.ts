/**
 * The ladder's records (WP-3.12, migration 057).
 *
 * Two questions and one answer each:
 *
 *   readLadderRecords   — which rungs has this player banked, per dynasty, and
 *                         therefore which rung may they ATTEMPT?
 *   recordLadderRung    — this run banked at rung N; keep it if it is a record.
 *
 * UNLOCK GLOBALLY, RECORD PER-DYNASTY. The attempt gate reads MAX(best_rung)
 * across dynasties; the record stays per-dynasty. A player who beat rung 4 on
 * PRIMAL does not re-climb on CYBER, but their CYBER record is still their
 * CYBER record. `highestAttemptableRung` in `ladder.ts` is the one place that
 * arithmetic lives.
 *
 * THE TABLE'S ABSENCE IS A LEGITIMATE, SILENT STATE.
 *
 * The runbook requires the app to be deployable before its migrations apply, so
 * every read here answers "no ladder" when 057 has not landed: no rung is
 * offered, none is stamped, every run is rung 0, and rung 0 is byte-identical
 * to the shipped game. This is the same tolerance `isMissingRunContextInfra`
 * carries for migration 054, and it is why `available` is a field on the result
 * rather than an exception.
 *
 * A REAL error is different from a missing table and is reported as such — but
 * it still never blocks a run from starting or a settlement from paying. The
 * ladder is a difficulty record; losing one costs a record, and Rule 6 is about
 * what a player earned, not about what a convenience read returned. A run that
 * refused to settle because a ladder read failed would be the far worse bug.
 */

import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_LADDER_RUNG,
  highestAttemptableRung,
  resolveLadderRung,
} from '@/shared/game/ladder';
import type { DynastyName } from '@/shared/game/rulesets';

/** The dynasties a record may exist for. Mirrors the table's CHECK. */
const DYNASTIES: readonly DynastyName[] = ['CYBER', 'PRIMAL', 'COSMIC'];

export interface LadderRecords {
  /**
   * False when migration 057 has not been applied here. The ladder is DARK:
   * no rung is offered and none is stamped. Distinguished from "applied, but
   * this player has no rows", which is `available: true` with every best at 0.
   */
  available: boolean;
  /** Best banked rung per dynasty. Absent rows read as 0 — see the migration. */
  best: Record<DynastyName, number>;
  /** MAX(best_rung) across dynasties: the input to the attempt gate. */
  maxBest: number;
  /** The highest rung this player may open a run at, on any dynasty. */
  attemptable: number;
}

const NO_LADDER: LadderRecords = {
  available: false,
  best: { CYBER: DEFAULT_LADDER_RUNG, PRIMAL: DEFAULT_LADDER_RUNG, COSMIC: DEFAULT_LADDER_RUNG },
  maxBest: DEFAULT_LADDER_RUNG,
  attemptable: DEFAULT_LADDER_RUNG,
};

/**
 * True when a Supabase error just means migration 057 has not been applied
 * here yet: unknown table/column (42P01, 42703) or PostgREST's schema-cache
 * equivalents. Mirrors `isMissingRunContextInfra`.
 */
export function isMissingLadderInfra(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  if (
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === 'PGRST202' ||
    error.code === 'PGRST204' ||
    error.code === 'PGRST205'
  ) {
    return true;
  }
  return /player_ladders|record_ladder_rung/i.test(error.message || '');
}

/**
 * Read a player's ladder records.
 *
 * Never throws and never blocks. On a missing table the ladder is dark; on a
 * real read failure it is dark AND reported, because a player who quietly loses
 * access to rungs they earned would otherwise see nothing but a shrunken
 * selector.
 */
export async function readLadderRecords(
  supabase: SupabaseClient,
  playerId: string
): Promise<LadderRecords> {
  const { data, error } = await supabase
    .from('player_ladders')
    .select('dynasty, best_rung')
    .eq('player_id', playerId);

  if (error) {
    if (!isMissingLadderInfra(error)) {
      console.error('Ladder records read failed:', { playerId, error });
      Sentry.captureException(
        new Error(`player_ladders read failed: ${error.message}`),
        { level: 'warning', extra: { playerId }, tags: { wp: 'wp-3.12' } }
      );
    }
    return NO_LADDER;
  }

  const best: Record<DynastyName, number> = {
    CYBER: DEFAULT_LADDER_RUNG,
    PRIMAL: DEFAULT_LADDER_RUNG,
    COSMIC: DEFAULT_LADDER_RUNG,
  };
  for (const row of (data ?? []) as { dynasty?: unknown; best_rung?: unknown }[]) {
    const dynasty = typeof row.dynasty === 'string' ? row.dynasty.toUpperCase() : '';
    if (!(DYNASTIES as readonly string[]).includes(dynasty)) continue;
    // `resolveLadderRung` answers 0 for a stored rung this build does not know
    // — an older client meeting a ladder that has grown. It reads as Ground
    // rather than as a rung it cannot render, which is the same lenient posture
    // the run-context stamp takes.
    best[dynasty as DynastyName] = Math.max(
      best[dynasty as DynastyName],
      resolveLadderRung(row.best_rung)
    );
  }

  const maxBest = DYNASTIES.reduce((max, dynasty) => Math.max(max, best[dynasty]), 0);
  return {
    available: true,
    best,
    maxBest,
    attemptable: highestAttemptableRung(maxBest),
  };
}

/**
 * Record a banked run's rung. Returns the record in force afterwards, or null
 * when nothing could be written.
 *
 * The RPC updates via GREATEST, so calling this with a lower rung than the
 * player already holds is a no-op rather than a demotion — Rule 6 by
 * construction, in the database, not in this file. That is deliberate: a
 * TypeScript guard here would be a convention, and a convention can be
 * bypassed by the next caller.
 *
 * NEVER BLOCKS SETTLEMENT. The caller treats a null exactly like a success it
 * did not need: a lost difficulty record is a lost record, and refusing to pay
 * a banked run over one would be a far larger failure than the one it reports.
 */
export async function recordLadderRung(
  supabase: SupabaseClient,
  playerId: string,
  dynasty: DynastyName,
  rung: number
): Promise<number | null> {
  const { data, error } = await supabase.rpc('record_ladder_rung', {
    p_player_id: playerId,
    p_dynasty: dynasty,
    p_rung: resolveLadderRung(rung),
  });

  if (error) {
    if (!isMissingLadderInfra(error)) {
      console.error('Ladder rung record failed:', { playerId, dynasty, rung, error });
      Sentry.captureException(
        new Error(`record_ladder_rung failed: ${error.message}`),
        {
          level: 'warning',
          extra: { playerId, dynasty, rung },
          tags: { wp: 'wp-3.12' },
        }
      );
    }
    return null;
  }

  return typeof data === 'number' ? data : resolveLadderRung(data);
}
