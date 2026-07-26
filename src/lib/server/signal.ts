/**
 * The World Signal — server authority (Constitution §7.2, §7.1, §8.6, Rule 11).
 *
 * Three jobs, and nothing else. The API route, the session wiring and the
 * contracts cutover are other work packages; this module is the engine they
 * call.
 *
 *   `ensureCurrentSignalDay`   derive TODAY from the UTC calendar and make it
 *                              a row. The server-resolved id WP-0.01's charge
 *                              exemption has been waiting for.
 *   `claimSignalObjectiveRun`  take one of the day's three objectives for one
 *                              open run. The ONLY producer of the exemption
 *                              id, and it refuses an objective the day did not
 *                              derive.
 *   `readSignalObjectiveState` a player's standing in today's Signal: the
 *                              objective they chose, how far it got, whether
 *                              it completed, and the cumulative §7.2 marks.
 *   `settleSignalObjectiveRun` auto-settlement of one attempt, and
 *   `autoSettleSignalAttempts` the sweep over every attempt still due. Both
 *                              idempotent.
 *
 * THE DAY IS SERVER-DERIVED, ALWAYS (Rule 11)
 *
 * `ensureCurrentSignalDay` takes a clock and NOTHING else. There is no
 * parameter on it, or on anything it calls, through which a request could name
 * a day, a seed, a condition or an objective — every field goes into the RPC
 * from `describeSignalDay(now)`, which reads only `getUTC*`. A client that
 * asks for a different day is not refused; it is unable to ask. `signal.test.ts`
 * pins that the RPC payload equals the calendar derivation for a set of
 * timezone-shifted instants.
 *
 * ARCHIVE DAYS ARE NEVER RESOLVED HERE (Rule 5, §7.2)
 *
 * "a missed day costs that day's opportunity and nothing else; the day
 * archives as practice", and practice pays nothing. That is structural rather
 * than audited: this module resolves ONLY the day containing `now`, so an
 * archive day never becomes a `signal_days` row through any path here, an
 * archive run therefore never gets an attempt id, and with no attempt there is
 * nothing for settlement to find, nothing to complete and nothing to pay. A
 * missed day costs exactly that day.
 *
 * IDEMPOTENCY (the acceptance criterion)
 *
 * Settlement is a RECOMPUTE, on both sides of the boundary. This module reads
 * the session row back and re-derives the objective from the calendar every
 * time; the RPC lands progress through GREATEST, latches the completion with
 * COALESCE and pays the flat bonus through a compare-and-set under a row lock.
 * There is no `+=` in this file and none in migration 049's settlement path.
 * Run it twice, ten times, or after a crash halfway through, and the stored
 * answer is the same.
 *
 * PRE-MIGRATION-049 SAFE
 *
 * Until 049 applies, none of the tables, columns or RPCs exist.
 * `isMissingSignalInfra` recognises that and every entry point degrades to
 * "the Signal is not live". The degradation direction is the CLOSED one: with
 * no day row there is no server-resolved id, so no run can obtain a charge
 * exemption by asking.
 *
 * Rule 11: every Supabase `error` is checked and reported to Sentry.
 */

import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  describeSignalDay,
  resolveSignalObjective,
  settleSignalAttempt,
  signalDayKeyToDate,
  signalMilestonesReached,
  SIGNAL_FIRST_COMPLETION_BONUS_DNA,
  type SignalCondition,
  type SignalDayDefinition,
  type SignalObjective,
  type SignalRunFacts,
} from '@/shared/game/signal';
import type { ConditionClauseId } from '@/shared/game/worldCondition';
import { SIGNAL_V1_ENABLED } from '@/lib/signal/config';

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

/**
 * Is this failure just "migration 049 has not been applied here yet"?
 *
 * 42703 unknown column, 42P01 unknown table, 42883/PGRST202/PGRST204 unknown
 * function or unknown column in the PostgREST schema cache. The name test
 * catches drivers that report the same thing without a code.
 */
export function isMissingSignalInfra(
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
  return /signal_day|signal_days|signal_objective_run|signal_milestone|ensure_signal_day|begin_signal_objective_run|settle_signal_objective_run|signals_completed/i.test(
    error.message || ''
  );
}

function report(scope: string, error: unknown, extra: Record<string, unknown>) {
  console.error(`Signal ${scope} failed:`, { ...extra, error });
  Sentry.captureException(
    error instanceof Error ? error : new Error(`Signal ${scope} failed`),
    { extra: { scope, ...extra, error } }
  );
}

// ---------------------------------------------------------------------------
// The day
// ---------------------------------------------------------------------------

/** A Signal day once the database has given it an id. */
export interface SignalDayRow {
  id: string;
  /** The UTC date, `YYYY-MM-DD`. */
  day: string;
  startsAt: string;
  endsAt: string;
  seed: string;
  condition: SignalCondition;
  /** The day's clauses (WP-2.10b), derived — never read back from the row. */
  clauses: ConditionClauseId[];
  objectives: SignalObjective[];
}

/**
 * Marry the stored row's ID to the CALENDAR's derivation of everything else.
 *
 * The id is the only thing the database knows that the calendar does not, so
 * it is the only thing taken from the row. Condition and objectives come from
 * `describeSignalDay`, which every other reader in the codebase also calls —
 * so the panel, the settlement and the migration's drift tripwire cannot end
 * up looking at three different days. If the stored row and the derivation
 * ever disagree, `ensure_signal_day` has already raised inside the RPC.
 */
function toDayRow(
  row: Record<string, unknown> | null,
  derived: SignalDayDefinition
): SignalDayRow | null {
  if (!row || typeof row.id !== 'string') return null;
  return {
    id: row.id,
    day: derived.day,
    startsAt: derived.startsAt,
    endsAt: derived.endsAt,
    seed: derived.seed,
    condition: derived.condition,
    clauses: derived.clauses,
    objectives: derived.objectives,
  };
}

/**
 * Resolve — and if necessary create — the Signal day containing `now`.
 *
 * Every field is derived by `describeSignalDay` from the UTC calendar. The
 * request never contributes a byte: there is no parameter on this function
 * through which a client value could travel (Rule 11). The RPC refuses to
 * change a day that already exists, so two players starting a run at 00:00:00
 * UTC cannot produce two days or two seeds.
 *
 * Returns null when the Signal is not live — flag off, migration not applied,
 * or the RPC failed. Null is the CLOSED direction: no id means no charge
 * exemption and no run flagging.
 */
export async function ensureCurrentSignalDay(
  supabase: SupabaseClient,
  now: Date | number = Date.now(),
  options: { enabled?: boolean } = {}
): Promise<SignalDayRow | null> {
  if (!(options.enabled ?? SIGNAL_V1_ENABLED)) return null;

  const derived = describeSignalDay(now);
  const { data, error } = await supabase.rpc('ensure_signal_day', {
    p_day: derived.day,
    p_starts_at: derived.startsAt,
    p_ends_at: derived.endsAt,
    p_seed: derived.seed,
    p_modifier: derived.condition.id,
    p_strain_tilt: derived.condition.strainTilt,
    // Migration 056. Where 056 has NOT been applied the argument names a
    // parameter the stored function does not have, PostgREST answers PGRST202,
    // `isMissingSignalInfra` recognises it, and the day resolves to null — the
    // Signal goes dark rather than writing a day whose stored clause set is
    // silently empty. Null is the closed direction here as everywhere else.
    p_clauses: derived.clauses,
    p_objectives: derived.objectives,
  });

  if (error) {
    if (!isMissingSignalInfra(error)) {
      report('day resolution', error, { day: derived.day });
    }
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return toDayRow((row ?? null) as Record<string, unknown> | null, derived);
}

// ---------------------------------------------------------------------------
// The attempt
// ---------------------------------------------------------------------------

/** The day's one attempt for one player, as stored. */
export interface SignalAttemptRow {
  id: string;
  dayId: string;
  /** The attempt's day key, `YYYY-MM-DD`, from the joined `signal_days` row. */
  dayKey: string;
  playerId: string;
  objectiveId: string;
  /**
   * The target the player was shown when they claimed the attempt. The
   * AUTHORITY for that attempt even if the derived band later moves: a player
   * is judged against the number they played for (Rule 6).
   */
  target: number;
  sessionId: string | null;
  progress: number;
  completedAt: string | null;
  settledAt: string | null;
  bonusPaidAt: string | null;
}

const ATTEMPT_COLUMNS =
  'id, day_id, player_id, objective_id, target, session_id, progress, completed_at, settled_at, bonus_paid_at, signal_days(day)';

function toAttemptRow(row: Record<string, unknown> | null): SignalAttemptRow | null {
  if (!row || typeof row.id !== 'string') return null;
  const joined = row.signal_days as { day?: string } | null;
  return {
    id: row.id,
    dayId: String(row.day_id ?? ''),
    dayKey: String(joined?.day ?? '').slice(0, 10),
    playerId: String(row.player_id ?? ''),
    objectiveId: String(row.objective_id ?? ''),
    target: Number(row.target ?? 0),
    sessionId: (row.session_id as string | null) ?? null,
    progress: Number(row.progress ?? 0),
    completedAt: (row.completed_at as string | null) ?? null,
    settledAt: (row.settled_at as string | null) ?? null,
    bonusPaidAt: (row.bonus_paid_at as string | null) ?? null,
  };
}

/**
 * A player's attempt on one day, or null if they have not opened one.
 *
 * Null is a complete, ordinary answer — most players on most days have not
 * started their Signal yet — so it is never reported as a failure.
 */
export async function loadSignalAttempt(
  supabase: SupabaseClient,
  dayId: string,
  playerId: string
): Promise<SignalAttemptRow | null> {
  const { data, error } = await supabase
    .from('signal_objective_runs')
    .select(ATTEMPT_COLUMNS)
    .eq('day_id', dayId)
    .eq('player_id', playerId)
    .maybeSingle();

  if (error) {
    if (!isMissingSignalInfra(error)) {
      report('attempt read', error, { dayId, playerId });
    }
    return null;
  }

  return toAttemptRow((data ?? null) as Record<string, unknown> | null);
}

// ---------------------------------------------------------------------------
// The claim — the only path to an exemption id (§7.2, §8.6)
// ---------------------------------------------------------------------------

/** The outcome of a player taking one of the day's three objectives. */
export interface SignalClaimResult {
  /** False when the flag is off or migration 049 is not applied. */
  live: boolean;
  day: SignalDayRow | null;
  /** The objective as the DAY defines it, or null if the choice was refused. */
  objective: SignalObjective | null;
  /** The day's attempt id, whoever owns it. */
  runId: string | null;
  /** True when THIS session is the run that owns the day's attempt. */
  ownsAttempt: boolean;
  /**
   * The `ChargeExemptionFacts.signalObjectiveRunId` this claim earns — and
   * NOTHING else may be put in that field (§8.6).
   *
   * Non-null on exactly one condition: the server resolved today from its own
   * calendar, resolved the named objective against that day's derived three,
   * and the database confirmed that this session owns the attempt. A client
   * that names a day, invents an objective or asks a second time gets null
   * here, which is an ordinary charged run — the same closed-by-default shape
   * `mode: 'serpent'` already has.
   */
  exemptRunId: string | null;
  progress: number;
  completed: boolean;
  /** The named objective is not one of the day's three. A refusal, not a fault. */
  unknownObjective: boolean;
  /** The claim could not be recorded; the run continues as an ordinary run. */
  failed: boolean;
}

function emptyClaim(): SignalClaimResult {
  return {
    live: false,
    day: null,
    objective: null,
    runId: null,
    ownsAttempt: false,
    exemptRunId: null,
    progress: 0,
    completed: false,
    unknownObjective: false,
    failed: false,
  };
}

/**
 * A raise from inside `begin_signal_objective_run` — a refusal, not absence.
 *
 * The RPC raises when the session is not this player's open run. `RAISE
 * EXCEPTION` reports `P0001`, and its message names the function, so it would
 * otherwise be swallowed by `isMissingSignalInfra`'s name test and read as
 * "migration 049 is not applied". Checked FIRST so the two can never be
 * confused: a refusal is reported (Rule 11), absence is not.
 */
function isSignalClaimRefusal(error: SupabaseErrorLike | null | undefined): boolean {
  return error?.code === 'P0001';
}

/**
 * Take one of today's three objectives for one open run.
 *
 * Everything the database is told is derived here: the day comes from the UTC
 * calendar, and the objective and its target come from that day's derivation.
 * `objectiveId` is the ONLY thing the caller contributes and it is a *lookup
 * key*, not a definition — `resolveSignalObjective` either finds it among the
 * day's three or the claim is refused (Rule 11). There is no parameter through
 * which a client could name a day, a target or an objective of its own.
 *
 * Called AFTER the session row exists (the RPC checks the session is this
 * player's open run), so a failed insert can never claim a player's Signal for
 * a run that did not happen. Idempotent by the schema's one-attempt-per-day
 * unique constraint: a second call the same day returns the FIRST attempt
 * unchanged, with `ownsAttempt` false and no exemption.
 */
export async function claimSignalObjectiveRun(
  supabase: SupabaseClient,
  playerId: string,
  sessionId: string,
  objectiveId: unknown,
  now: Date | number = Date.now(),
  options: { enabled?: boolean } = {}
): Promise<SignalClaimResult> {
  const day = await ensureCurrentSignalDay(supabase, now, options);
  if (!day) return emptyClaim();

  const claim = emptyClaim();
  claim.live = true;
  claim.day = day;

  const objective = resolveSignalObjective(day, objectiveId);
  if (!objective) {
    // Not one of the day's three. Refused, and the run stays ordinary.
    return { ...claim, unknownObjective: true };
  }
  claim.objective = objective;

  const { data, error } = await supabase.rpc('begin_signal_objective_run', {
    p_player_id: playerId,
    p_day_id: day.id,
    p_objective_id: objective.id,
    p_target: objective.target,
    p_session_id: sessionId,
  });

  if (error) {
    if (isSignalClaimRefusal(error)) {
      report('objective claim refused', error, {
        playerId,
        sessionId,
        dayId: day.id,
        objectiveId: objective.id,
      });
      return { ...claim, failed: true };
    }
    // Migration 049 half-applied: the day resolved but the claim RPC is not
    // there. Not live, therefore no exemption — the closed direction.
    if (isMissingSignalInfra(error)) return emptyClaim();
    report('objective claim', error, { playerId, sessionId, dayId: day.id });
    return { ...claim, failed: true };
  }

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row || typeof row.id !== 'string') {
    report('objective claim', new Error('claim returned no attempt'), {
      playerId,
      sessionId,
      dayId: day.id,
    });
    return { ...claim, failed: true };
  }

  const ownsAttempt = row.owns_attempt === true;
  return {
    ...claim,
    runId: row.id,
    ownsAttempt,
    // The exemption is granted by the DATABASE's answer, never by the request.
    exemptRunId: ownsAttempt ? row.id : null,
    progress: Math.max(0, Number(row.progress ?? 0)),
    completed: (row.completed_at ?? null) !== null,
    // The stored objective wins: a second run of the day joins the attempt the
    // player already opened, whatever it names now.
    objective: resolveSignalObjective(day, row.objective_id) ?? objective,
  };
}

// ---------------------------------------------------------------------------
// A player's objective state
// ---------------------------------------------------------------------------

export interface SignalObjectiveState {
  /** False when the flag is off or migration 049 is not applied. */
  live: boolean;
  day: SignalDayRow | null;
  /** Null until the player opens today's Signal. */
  attempt: SignalAttemptRow | null;
  /** The objective they chose, resolved against the day's derived three. */
  objective: SignalObjective | null;
  progress: number;
  target: number;
  completed: boolean;
  /** True once the flat first-completion bonus has settled (§7.2). */
  bonusPaid: boolean;
  /** Cumulative and NON-CONSECUTIVE (§7.2). A count, with no memory of gaps. */
  signalsCompleted: number;
  milestonesReached: number[];
}

/** The shape a flag-off, pre-migration or Signal-less player sees. */
export function emptySignalObjectiveState(): SignalObjectiveState {
  return {
    live: false,
    day: null,
    attempt: null,
    objective: null,
    progress: 0,
    target: 0,
    completed: false,
    bonusPaid: false,
    signalsCompleted: 0,
    milestonesReached: [],
  };
}

/**
 * Everything a caller needs to know about one player's standing in today's
 * Signal.
 *
 * Reads only. Nothing here settles, grants, claims or writes — §7.2's "rewards
 * settle automatically, no claim cascades, ever" is kept by there being no
 * write in this function to abuse.
 */
export async function readSignalObjectiveState(
  supabase: SupabaseClient,
  playerId: string,
  now: Date | number = Date.now(),
  options: { enabled?: boolean } = {}
): Promise<SignalObjectiveState> {
  const day = await ensureCurrentSignalDay(supabase, now, options);
  if (!day) return emptySignalObjectiveState();

  const state = emptySignalObjectiveState();
  state.live = true;
  state.day = day;

  const attempt = await loadSignalAttempt(supabase, day.id, playerId);
  if (attempt) {
    state.attempt = attempt;
    state.objective = resolveSignalObjective(day, attempt.objectiveId);
    state.progress = attempt.progress;
    state.target = attempt.target;
    state.completed = attempt.completedAt !== null;
    state.bonusPaid = attempt.bonusPaidAt !== null;
  }

  const { data: playerRow, error: playerError } = await supabase
    .from('players')
    .select('signals_completed')
    .eq('id', playerId)
    .maybeSingle();
  if (playerError && !isMissingSignalInfra(playerError)) {
    report('signals completed read', playerError, { playerId });
  }

  state.signalsCompleted = Math.max(0, Number(playerRow?.signals_completed ?? 0));
  state.milestonesReached = signalMilestonesReached(state.signalsCompleted);
  return state;
}

// ---------------------------------------------------------------------------
// Settlement — "rewards settle automatically, no claim cascades" (§7.2)
// ---------------------------------------------------------------------------

/**
 * How long after a day closes its attempts stay settleable.
 *
 * A run that settled but whose reward write failed is replayed by the offline
 * outbox for up to seven days (`STALE_PENDING_SETTLEMENT_MINUTES`, WP-0.06).
 * That replay writes real facts onto a real Signal attempt, and Rule 6 says
 * what it earned is the player's. So an attempt keeps being re-settled for
 * eight days, one day past the outbox's own horizon — free, because settlement
 * is a recompute clamped with GREATEST and a compare-and-set: a late arrival
 * can raise a progress and can never lower one, and an attempt with no late
 * arrivals recomputes to exactly what is already stored.
 */
export const SIGNAL_RESETTLE_WINDOW_MS = 8 * 24 * 60 * 60 * 1000;

/**
 * The session columns a Signal objective can depend on, and no others.
 *
 * Deliberately absent: `dna_earned` (the lean-adjusted number — §8.6 makes the
 * Signal run exempt and full-fat, so `yield_dna` is the only honest input),
 * `score` (Rule 2 — an objective must never become a reason to read the skill
 * number) and every account, entitlement and premium column (Rule 3).
 */
const SESSION_COLUMNS =
  'id, player_id, duration_seconds, extracted, yield_dna, genome, end_reason, validated, is_free_play';

function toRunFacts(row: Record<string, unknown>): SignalRunFacts {
  const genome = (row.genome ?? null) as { picks?: unknown } | null;
  const picks = Array.isArray(genome?.picks) ? genome.picks : [];
  return {
    durationSeconds: Math.max(0, Number(row.duration_seconds ?? 0)),
    extracted: row.extracted === true,
    yieldDna: Math.max(0, Number(row.yield_dna ?? 0)),
    genesAccepted: picks.length,
    endReason: (row.end_reason as string | null) ?? null,
    validated: (row.validated as boolean | null) ?? null,
    // Free Play pays nothing anywhere (§7.2, Rule 5). Archive days cannot
    // reach here at all — this module never resolves one, so they never get an
    // attempt row to settle.
    isPractice: row.is_free_play === true,
  };
}

/**
 * The run that owns an attempt, reduced to the facts an objective reads.
 *
 * `ownerPlayerId` is re-checked against the attempt: the session id stored on
 * the attempt was stamped inside `begin_signal_objective_run`'s transaction,
 * but re-applying the predicate here is WP-0.05's two-gate shape — a query
 * that drifted cannot feed one player's run into another player's objective.
 */
export async function loadSignalRunFacts(
  supabase: SupabaseClient,
  sessionId: string,
  playerId: string
): Promise<{ facts: SignalRunFacts | null; skipped: boolean; failed: boolean }> {
  const { data, error } = await supabase
    .from('game_sessions')
    .select(SESSION_COLUMNS)
    .eq('id', sessionId)
    .eq('player_id', playerId)
    .not('ended_at', 'is', null)
    .maybeSingle();

  if (error) {
    if (isMissingSignalInfra(error)) return { facts: null, skipped: true, failed: false };
    report('run facts read', error, { sessionId, playerId });
    return { facts: null, skipped: false, failed: true };
  }

  const row = (data ?? null) as Record<string, unknown> | null;
  // Gate two: the ownership predicate re-applied to whatever came back.
  if (!row || String(row.player_id ?? '') !== playerId) {
    return { facts: null, skipped: false, failed: false };
  }
  return { facts: toRunFacts(row), skipped: false, failed: false };
}

export interface SignalSettlementResult {
  runId: string;
  dayId: string;
  completed: boolean;
  progress: number;
  target: number;
  /** What THIS settlement paid. 0 on every re-settle (§7.2's flat bonus). */
  bonusDna: number;
  signalsCompleted: number;
  newMilestones: number;
  /** Migration 049 is not applied, or the attempt has no finished run yet. */
  skipped: boolean;
  /** The attempt could not be settled and must be retried. */
  failed: boolean;
}

function baseResult(attempt: SignalAttemptRow): SignalSettlementResult {
  return {
    runId: attempt.id,
    dayId: attempt.dayId,
    completed: attempt.completedAt !== null,
    progress: attempt.progress,
    target: attempt.target,
    bonusDna: 0,
    signalsCompleted: 0,
    newMilestones: 0,
    skipped: false,
    failed: false,
  };
}

/**
 * Settle ONE attempt: an EXACT SERVER RECOMPUTE (Rule 11), idempotent.
 *
 * Nothing is carried forward from a previous settlement. The objective is
 * re-derived from the calendar, the run is re-read from its session row, and
 * the pure fold is re-applied against the attempt's STORED state — so a re-run
 * after a partial failure converges on the same answer rather than compounding
 * one.
 *
 * Idempotency is guaranteed twice over, on purpose:
 *
 *   here     `settleSignalAttempt` folds the recompute against what is
 *            already stored. `progress` is a max, `completed` is a latch, and
 *            `payBonus` is false the moment `bonus_paid_at` is set — so the
 *            second call asks for a bonus of 0.
 *   in the   the RPC lands progress through GREATEST, latches `completed_at`
 *   RPC      with COALESCE, and pays through a compare-and-set under a row
 *            lock. Even a caller that asked for the bonus twice — a stale
 *            read, a replay, two crons at once — updates zero rows the second
 *            time and moves no DNA.
 *
 * Neither layer increments anything, so neither can double-apply.
 */
export async function settleSignalObjectiveRun(
  supabase: SupabaseClient,
  attempt: SignalAttemptRow
): Promise<SignalSettlementResult> {
  const base = baseResult(attempt);

  // An attempt whose run never finished has nothing to measure yet. Not a
  // failure — the sweep will find it again when the run ends.
  if (!attempt.sessionId) return { ...base, skipped: true };

  const dayDate = signalDayKeyToDate(attempt.dayKey);
  if (!dayDate) {
    report('attempt day key', new Error('unreadable Signal day key'), {
      runId: attempt.id,
      dayKey: attempt.dayKey,
    });
    return { ...base, failed: true };
  }

  const day = describeSignalDay(dayDate);
  const derived = resolveSignalObjective(day, attempt.objectiveId);
  if (!derived) {
    // The stored objective is not one of that day's three. Only a derivation
    // change under a live day can produce this, and it is exactly what the
    // migration's drift tripwire exists to shout about — so shout here too
    // rather than settling against a guess.
    report('objective resolution', new Error('unknown Signal objective'), {
      runId: attempt.id,
      dayKey: attempt.dayKey,
      objectiveId: attempt.objectiveId,
    });
    return { ...base, failed: true };
  }

  const { facts, skipped, failed } = await loadSignalRunFacts(
    supabase,
    attempt.sessionId,
    attempt.playerId
  );
  if (skipped) return { ...base, skipped: true };
  if (failed) return { ...base, failed: true };
  if (!facts) return { ...base, skipped: true };

  // The band may have moved since the attempt opened; the player is judged
  // against the number they were shown (Rule 6), so the STORED target wins.
  const settlement = settleSignalAttempt(
    { kind: derived.kind, target: attempt.target },
    facts,
    {
      progress: attempt.progress,
      completed: attempt.completedAt !== null,
      bonusPaid: attempt.bonusPaidAt !== null,
    }
  );

  const { data, error } = await supabase.rpc('settle_signal_objective_run', {
    p_run_id: attempt.id,
    p_player_id: attempt.playerId,
    p_completed: settlement.completed,
    p_progress: settlement.progress,
    p_bonus_dna: settlement.bonusDna,
  });

  if (error) {
    if (isMissingSignalInfra(error)) return { ...base, skipped: true };
    report('settlement apply', error, { runId: attempt.id, dayId: attempt.dayId });
    return { ...base, failed: true };
  }

  const summary = (data ?? {}) as Record<string, unknown>;
  return {
    ...base,
    completed: summary.completed === undefined ? settlement.completed : summary.completed === true,
    progress: Number(summary.progress ?? settlement.progress),
    target: Number(summary.target ?? attempt.target),
    bonusDna: Number(summary.bonus_dna ?? 0),
    signalsCompleted: Number(summary.signals_completed ?? 0),
    newMilestones: Number(summary.new_milestones ?? 0),
  };
}

/**
 * Every attempt that is still due settlement.
 *
 * "Due" is deliberately generous: an attempt is settleable from the moment it
 * opens until `SIGNAL_RESETTLE_WINDOW_MS` after its day closed. Re-settling is
 * free (see above), and the alternative — settling once, at one moment — is
 * what strands a run whose reward write failed. A missed cron, a failed deploy
 * or an outage therefore converges on the next sweep instead of costing a
 * player a Signal they completed: Rule 5's promise that absence costs nothing
 * applies to the operator's absence too.
 */
export async function loadSettleableSignalAttempts(
  supabase: SupabaseClient,
  now: Date | number = Date.now()
): Promise<{ attempts: SignalAttemptRow[]; skipped: boolean }> {
  const cutoff = new Date(new Date(now).getTime() - SIGNAL_RESETTLE_WINDOW_MS)
    .toISOString();

  const { data, error } = await supabase
    .from('signal_objective_runs')
    .select(ATTEMPT_COLUMNS)
    .not('session_id', 'is', null)
    .gte('started_at', cutoff)
    .order('started_at', { ascending: true });

  if (error) {
    if (isMissingSignalInfra(error)) return { attempts: [], skipped: true };
    report('settleable attempt scan', error, {});
    return { attempts: [], skipped: false };
  }

  const attempts = ((data ?? []) as Array<Record<string, unknown>>)
    .map(toAttemptRow)
    .filter((attempt): attempt is SignalAttemptRow => attempt !== null)
    // Gate two: an attempt with no readable day key cannot have its objective
    // re-derived, so it is not settleable in code either.
    .filter((attempt) => signalDayKeyToDate(attempt.dayKey) !== null);

  return { attempts, skipped: false };
}

export interface SignalAutoSettleResult {
  settled: SignalSettlementResult[];
  /** True when migration 049 is not applied — expected, not an error. */
  skipped: boolean;
  /** True when at least one attempt failed and must be retried next run. */
  failed: boolean;
  /** DNA this sweep paid. 0 on a re-run over the same attempts. */
  bonusDnaPaid: number;
}

/**
 * Auto-settle every attempt still due (§7.2: "Rewards settle automatically —
 * no claim cascades, ever").
 *
 * This is the whole reward path. There is no claim endpoint in this work
 * package and no function here a player can invoke; the sweep runs on the
 * server's own schedule and at the end of a run.
 *
 * Running it twice produces an identical result — the acceptance criterion.
 * The second pass re-reads the attempts, sees the completion latched and
 * `bonus_paid_at` set, asks for a bonus of 0, and the RPC would refuse it
 * anyway. `bonusDnaPaid` is therefore the honest test of the property: it is a
 * positive number on the first sweep and exactly 0 on every one after.
 */
export async function autoSettleSignalAttempts(
  supabase: SupabaseClient,
  now: Date | number = Date.now()
): Promise<SignalAutoSettleResult> {
  const { attempts, skipped } = await loadSettleableSignalAttempts(supabase, now);
  if (skipped) return { settled: [], skipped: true, failed: false, bonusDnaPaid: 0 };

  const settled: SignalSettlementResult[] = [];
  let failed = false;
  let bonusDnaPaid = 0;
  for (const attempt of attempts) {
    const result = await settleSignalObjectiveRun(supabase, attempt);
    settled.push(result);
    if (result.failed) failed = true;
    bonusDnaPaid += result.bonusDna;
  }

  return { settled, skipped: false, failed, bonusDnaPaid };
}

/**
 * The attempt one run owns, if it owns one.
 *
 * Keyed on the session, because that is the direction every end-of-run caller
 * asks from: it has a finished run and wants to know what the Signal made of
 * it. Null means the run was not the day's Signal objective run — the ordinary
 * case, and not a failure.
 *
 * The `player_id` predicate rides along for the same reason it does in
 * `loadSignalRunFacts`: one player's run must never be able to reach another
 * player's attempt, whatever the join does.
 */
export async function loadSignalAttemptForSession(
  supabase: SupabaseClient,
  sessionId: string,
  playerId: string
): Promise<SignalAttemptRow | null> {
  const { data, error } = await supabase
    .from('signal_objective_runs')
    .select(ATTEMPT_COLUMNS)
    .eq('session_id', sessionId)
    .eq('player_id', playerId)
    .maybeSingle();

  if (error) {
    if (!isMissingSignalInfra(error)) {
      report('session attempt read', error, { sessionId, playerId });
    }
    return null;
  }

  return toAttemptRow((data ?? null) as Record<string, unknown> | null);
}

/**
 * Auto-settle the attempt one finished run owns, if it owns one.
 *
 * The end-of-run entry point: a route that has just settled a session calls
 * this and the day's Signal settles with it, in the same request, with no
 * claim step anywhere. Null means the run was not the day's Signal objective
 * run — the ordinary case, and not a failure.
 */
export async function settleSignalAttemptForSession(
  supabase: SupabaseClient,
  sessionId: string,
  playerId: string
): Promise<SignalSettlementResult | null> {
  const attempt = await loadSignalAttemptForSession(supabase, sessionId, playerId);
  if (!attempt) return null;
  return settleSignalObjectiveRun(supabase, attempt);
}

export { SIGNAL_FIRST_COMPLETION_BONUS_DNA };
export type { SignalObjective, SignalRunFacts };
