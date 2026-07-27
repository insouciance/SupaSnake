/**
 * The run's WORLD CONDITION — server authority (Constitution §7.2, §7.3, Rule 11).
 *
 * One modifier owns a run. Three rituals can name it and they all name it from
 * the calendar, never from the request:
 *
 *   the Anomaly board  the week's rotation, stamped into `anomaly_id` at start
 *   the Serpent week   the week's condition-set, reached through `serpent_week_id`
 *   the Signal day     the day's condition, reached through `signal_objective_run_id`
 *
 * WHY THIS MODULE EXISTS (WP-2.10a)
 *
 * Before it, only the first of the three reached the engine or the payout. A
 * Serpent run stamped `serpent_week_id` and never `anomaly_id`, so the end path
 * read a null condition and recomputed the run under no condition at all —
 * `serpent_weeks.modifiers` was written, parsed and RENDERED, and consumed by
 * nothing. The Signal was worse: `signal_days.strain_tilt` was stored and the
 * surface told the player "the gene pool tilts today" while the tilt never
 * reached the offer draw. This module is the one answer both ends ask.
 *
 * THE SESSION ROW IS THE ONLY SOURCE
 *
 * `resolveSessionWorldCondition` takes a session row and reads three of its
 * columns. There is no parameter on it through which a client value could
 * travel, and no caller passes it a request field. Start resolves the same id
 * from the objects it just derived server-side; end re-derives it from the row
 * those objects were stamped onto. That is what makes the offer stream the
 * engine drew from and the stream `verifyOfferTrace` replays the same stream.
 *
 * NULL IS ALWAYS A COMPLETE ANSWER
 *
 * Nearly every run in the game is under no condition, and every degradation —
 * migration 021/046/049 unapplied, a flag off, a read failure, a week or day
 * the row no longer names — resolves null. Null is the condition-free
 * recompute the game already had, so a failure here can only ever return a run
 * to ordinary rules; it can never invent rules the run was not played under.
 *
 * Rule 11: the Supabase reads live in `serpent.ts` / `signal.ts`, which check
 * every `error` and report it to Sentry.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isAnomalyId } from '@/shared/game/anomalies';
import { loadSerpentWeekById, type SerpentWeekRow } from '@/lib/server/serpent';
import { loadSignalAttemptForSession } from '@/lib/server/signal';
import { describeSignalDay, signalDayKeyToDate } from '@/shared/game/signal';
import {
  NEUTRAL_CONDITION,
  conditionFromAnomaly,
  type WorldCondition,
} from '@/shared/game/worldCondition';

/**
 * WHAT WP-2.10b CHANGED HERE
 *
 * These three functions returned an `AnomalyId | null`. They now return a whole
 * `WorldCondition` — the anomaly AND the week's or day's clauses, composed into
 * the one interaction block the fold, the validator and the Workbench read. The
 * resolution rules are unchanged; what widened is what a condition can say.
 */

/**
 * The condition a Serpent week's stored set resolves to.
 *
 * `SERPENT_MODIFIERS_PER_WEEK` is 1 and the stored set is an array so that
 * raising it later is a tuning change. Until something defines how two
 * economic modifiers compose in the payout fold — a balance decision — a set of
 * any size resolves to its FIRST recognised anomaly. Deterministic, and never a
 * silent stack.
 *
 * CLAUSES DO compose, and all of them are kept: `composeConditionInteraction`
 * defines exactly how two clauses add, which is the thing the anomalies lack.
 */
export function serpentWeekCondition(
  week: Pick<SerpentWeekRow, 'modifiers' | 'clauses'> | null | undefined
): WorldCondition {
  if (!week) return NEUTRAL_CONDITION;
  let anomaly = null as Parameters<typeof conditionFromAnomaly>[0];
  for (const modifier of week.modifiers ?? []) {
    if (isAnomalyId(modifier.id)) {
      anomaly = modifier.id;
      break;
    }
  }
  return conditionFromAnomaly(
    anomaly,
    (week.clauses ?? []).map((clause) => clause.id)
  );
}

/**
 * A Signal day's condition, from the day key the attempt row carries.
 *
 * Re-derived rather than read out of `signal_days.modifier` / `.clauses`, which
 * is the discipline the rest of `signal.ts` keeps (`toDayRow` marries the stored
 * id to the calendar's derivation; `settleSignalObjectiveRun` re-derives the
 * objective the same way). The stored key pins WHICH day; `describeSignalDay`
 * is the single definition of what that day is, so the panel, the claim and
 * this call cannot end up looking at three different conditions.
 */
export function signalDayCondition(
  dayKey: string | null | undefined
): WorldCondition {
  const day = dayKey ? signalDayKeyToDate(dayKey) : null;
  if (day === null) return NEUTRAL_CONDITION;
  const derived = describeSignalDay(day);
  return conditionFromAnomaly(derived.condition.id, derived.clauses);
}

/**
 * The session-row columns a condition can be reached through, and no others.
 *
 * Typed as `unknown` because the route reads the row with `select('*')`: before
 * migration 021, 046 or 049 the columns simply are not there, and every one of
 * those absences has to read as "no condition" rather than as an error.
 */
export interface SessionConditionRow {
  anomaly_id?: unknown;
  serpent_week_id?: unknown;
  signal_objective_run_id?: unknown;
}

function stampedId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * The condition a finished run was played under, re-derived from its row.
 *
 * PRECEDENCE — anomaly, then Serpent, then Signal. `mode` is one string, so
 * the three stamps are disjoint by construction and at most one is ever set;
 * the order is here so that a row which somehow carried two would resolve the
 * same way on every call, including the outbox replay of the same run.
 *
 * The Signal arm keys on the session, not on the stamped attempt id: the
 * attempt id is mirrored onto `game_sessions` by `begin_signal_objective_run`
 * ONLY when the session owns the day's attempt, so its presence is the gate
 * and the read re-applies the ownership predicate behind it.
 */
export async function resolveSessionWorldCondition(
  supabase: SupabaseClient,
  session: SessionConditionRow,
  playerId: string,
  sessionId: string
): Promise<WorldCondition> {
  // The Anomaly board's own runs carry no clauses: the board is the weekly
  // rotation, not the Serpent's condition-set, and §12.2 caps the weekly
  // surfaces rather than layering them. `conditionFromAnomaly` says so.
  if (isAnomalyId(session.anomaly_id)) return conditionFromAnomaly(session.anomaly_id);

  const weekId = stampedId(session.serpent_week_id);
  if (weekId !== null) {
    return serpentWeekCondition(await loadSerpentWeekById(supabase, weekId));
  }

  if (stampedId(session.signal_objective_run_id) !== null) {
    const attempt = await loadSignalAttemptForSession(supabase, sessionId, playerId);
    return signalDayCondition(attempt?.dayKey ?? null);
  }

  return NEUTRAL_CONDITION;
}
