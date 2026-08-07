/**
 * Server-side run observability (CE-5 + the dilation measurement).
 *
 * The continuity subsystem refused runs for a year with no queryable trace: the
 * only detector was a player writing in, which the doctrine names outright
 * (principle 6, "nothing is invisible"). This module is the one place those
 * refusals, the settlement latencies and the per-segment dilation ratios become
 * data.
 *
 * Everything here is ADVISORY. Nothing in this file may influence what a run
 * pays, whether it settles, or whether it may continue — the reporters return
 * `void`, take no decisions, and route through the fail-open primitive. That is
 * a deliberate reading of FM-3: the moment a measurement can refuse a run, it
 * has stopped being a measurement.
 */

import type { RunContinuityReason } from '@/lib/server/runContinuity';
import { SNAKE_RULES_VERSION } from '@/lib/game/SnakeGameLogic';
import { reportTelemetry, telemetryBreadcrumb } from '@/lib/telemetry/report';
import { summarizeSamples, type SampleSummary } from '@/lib/telemetry/percentiles';

/**
 * Where a continuity refusal happened, as a closed set.
 *
 * The `reason` says WHAT was wrong and the message says why; the site says
 * which operation the player was trying to complete, which is the axis a
 * dashboard actually slices on ("starts are fine, checkpoints are refusing").
 */
export type RunContinuitySite =
  | 'lease_assert'
  | 'replay_parse'
  | 'checkpoint_validate'
  | 'checkpoint_save'
  | 'start_lookup'
  | 'start_read'
  | 'start_stage'
  | 'start_resume'
  | 'start_finalize'
  | 'activate'
  | 'resume'
  | 'terminal_stage'
  | 'run_end_stage'
  | 'free_complete'
  | 'abandon'
  /** No call site named itself. The stack on the event still locates it. */
  | 'unclassified';

export interface RunContinuityRejectionContext {
  site?: RunContinuitySite;
  sessionId?: string | null;
  playerId?: string | null;
  /** `continuity_phase` as stored when the refusal happened. */
  phase?: string | null;
  /** `simulation_rules_version` on the row, for the FM-12 match check. */
  storedRulesVersion?: string | null;
  checkpointRevision?: number | null;
  /** Milliseconds from the run's server start to this refusal. */
  runAgeMs?: number | null;
  /** Milliseconds since the last accepted checkpoint. */
  checkpointAgeMs?: number | null;
  detail?: Record<string, unknown>;
}

/**
 * Refusals a healthy system produces constantly. A second tab, a double-tap on
 * PLAY, a resumed run whose start request the client re-sent — these are the
 * mechanism working. They are still reported (they are the denominator for
 * every other rate) but at `info`, so the ones that mean something stay
 * visible above them.
 */
const ROUTINE_REASONS: ReadonlySet<RunContinuityReason> = new Set<RunContinuityReason>([
  'request_conflict',
  'active_run',
  'lease_conflict',
  'invalid_request_id',
  'not_found',
]);

function rejectionLevel(reason: RunContinuityReason): 'info' | 'warning' | 'error' {
  if (ROUTINE_REASONS.has(reason)) return 'info';
  // `unavailable` is the server failing to answer — the only reason the client
  // is told to retry, and the one that means an outage rather than a verdict.
  return reason === 'unavailable' ? 'error' : 'warning';
}

/** ms between two ISO timestamps, or null when either is absent/unparseable. */
export function ageMsBetween(
  fromIso: string | null | undefined,
  toMs: number
): number | null {
  if (!fromIso) return null;
  const from = Date.parse(fromIso);
  return Number.isFinite(from) ? Math.max(0, toMs - from) : null;
}

/**
 * Report one continuity refusal. Never throws, never decides anything.
 *
 * Called from `RunContinuityError`'s constructor, so a refusal cannot be added
 * to that subsystem without becoming visible — the coverage guarantee is
 * structural rather than a checklist item that the sixty-ninth throw site
 * eventually misses.
 */
export function reportRunContinuityRejection(
  reason: RunContinuityReason,
  message: string,
  retryable: boolean,
  context: RunContinuityRejectionContext = {}
): void {
  const site = context.site ?? 'unclassified';
  const rulesVersionMatch =
    context.storedRulesVersion == null
      ? null
      : context.storedRulesVersion === SNAKE_RULES_VERSION;
  reportTelemetry({
    channel: 'run-continuity',
    message: `run continuity refused at ${site}: ${reason}`,
    level: rejectionLevel(reason),
    tags: {
      continuity_site: site,
      continuity_reason: reason,
      continuity_phase: context.phase ?? 'unknown',
      continuity_retryable: retryable,
      // The FM-12 axis. A refusal cluster that is entirely
      // rules_version_match=false is a deploy stranding open runs, not a bug
      // in the check that refused them.
      rules_version_match: rulesVersionMatch ?? 'unknown',
    },
    // One issue per (site, reason). The message carries the specific complaint
    // and would otherwise shatter the grouping.
    fingerprint: ['run-continuity', site, reason],
    data: {
      reason,
      detail: message,
      retryable,
      phase: context.phase ?? null,
      sessionId: context.sessionId ?? null,
      playerId: context.playerId ?? null,
      storedRulesVersion: context.storedRulesVersion ?? null,
      expectedRulesVersion: SNAKE_RULES_VERSION,
      rulesVersionMatch,
      checkpointRevision: context.checkpointRevision ?? null,
      runAgeMs: context.runAgeMs ?? null,
      checkpointAgeMs: context.checkpointAgeMs ?? null,
      ...(context.detail ?? {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Settlement age + recovery path
// ---------------------------------------------------------------------------

/**
 * Which driver actually settled the run.
 *
 * CE-2 ratified that the sweep is the PRIMARY settler and the browser only an
 * accelerator. Nothing measured whether that is true in production. This is
 * the field that answers it.
 */
export type SettlementPath =
  | 'client_accelerated'
  | 'sweep_stranded_terminal'
  | 'sweep_progression_resume'
  | 'sweep_pending_end_adoption'
  | 'start_path_absorb';

export interface SettlementAgeReport {
  path: SettlementPath;
  sessionId: string;
  playerId?: string | null;
  dynasty?: string | null;
  outcome?: 'settled' | 'staged' | 'rejected' | 'failed';
  /** Age of the run itself at settlement (server start → settled). */
  runAgeMs?: number | null;
  /** How long the finished run waited to settle (terminal → settled). */
  terminalAgeMs?: number | null;
  /** How stale the last accepted checkpoint was at settlement. */
  checkpointAgeMs?: number | null;
  /** Server-side recovery attempts already spent on this row. */
  attempts?: number | null;
  detail?: Record<string, unknown>;
}

/**
 * Coarse buckets so the distribution is a tag (groupable, cheap to chart)
 * rather than only an unindexed number.
 */
export function settlementAgeBucket(ageMs: number | null | undefined): string {
  if (ageMs == null || !Number.isFinite(ageMs)) return 'unknown';
  if (ageMs < 10_000) return 'under_10s';
  if (ageMs < 60_000) return 'under_1m';
  if (ageMs < 600_000) return 'under_10m';
  if (ageMs < 3_600_000) return 'under_1h';
  if (ageMs < 86_400_000) return 'under_1d';
  return 'over_1d';
}

/**
 * Record that a run settled, how old it was, and which path did it.
 *
 * Emitted for EVERY settlement, not only slow ones: the question the data week
 * has to answer is what the distribution looks like, and a reporter that fires
 * only past a threshold can only ever confirm the threshold.
 */
export function reportSettlementAge(report: SettlementAgeReport): void {
  const terminalBucket = settlementAgeBucket(report.terminalAgeMs);
  reportTelemetry({
    channel: 'run-settlement',
    message: `run settled via ${report.path}`,
    // Settlement is the happy path. It is `info` even when it was slow — the
    // bucket tag carries the severity, and an issue stream full of warnings
    // for successful settlements would train everyone to mute it.
    level: 'info',
    tags: {
      settlement_path: report.path,
      settlement_outcome: report.outcome ?? 'settled',
      settlement_terminal_age: terminalBucket,
      settlement_run_age: settlementAgeBucket(report.runAgeMs),
      dynasty: report.dynasty ?? 'unknown',
    },
    fingerprint: ['run-settlement', report.path],
    data: {
      sessionId: report.sessionId,
      playerId: report.playerId ?? null,
      runAgeMs: report.runAgeMs ?? null,
      terminalAgeMs: report.terminalAgeMs ?? null,
      checkpointAgeMs: report.checkpointAgeMs ?? null,
      attempts: report.attempts ?? null,
      ...(report.detail ?? {}),
    },
  });
}

/** One sweep pass, summarised where an operator and Sentry both see it. */
export interface SweepPassReport {
  settled: number;
  staged: number;
  strandedTerminalScanned: number;
  strandedTerminalFailed: number;
  strandedTerminalRejected: number;
  quarantined: number;
  deferred: number;
  failed: number;
  attentionRows: number;
  /** Terminal→settled ages observed in this pass, in ms. */
  terminalAges: number[];
  elapsedMs: number;
  budgetExhausted: boolean;
}

export function reportSweepPass(report: SweepPassReport): SampleSummary {
  const ages = summarizeSamples(report.terminalAges);
  reportTelemetry({
    channel: 'run-settlement',
    message: 'settlement sweep pass',
    level: report.failed > 0 || report.quarantined > 0 ? 'warning' : 'info',
    tags: {
      sweep_had_failures: report.failed > 0,
      sweep_had_quarantine: report.quarantined > 0,
      sweep_budget_exhausted: report.budgetExhausted,
      sweep_p95_age: settlementAgeBucket(ages.p95Ms),
    },
    fingerprint: ['run-settlement', 'sweep-pass'],
    data: { ...report, terminalAges: undefined, terminalAgeDistribution: ages },
  });
  return ages;
}

// ---------------------------------------------------------------------------
// Dilation — server-observed wall clock vs the cadence the ticks imply
// ---------------------------------------------------------------------------

/**
 * PURE MEASUREMENT. Read this before extending it.
 *
 * A segment is the interval between two consecutive SERVER-ACCEPTED checkpoint
 * writes on one session (the head segment runs from activation to the first
 * checkpoint). For each we hold two independent quantities:
 *
 *   expectedMs — ticks in the segment × the tick interval those ticks ran at.
 *                Both numbers come from the CANONICAL checkpoints, which are
 *                what `validateRunCheckpoint` returns after replaying the
 *                client's actions through a server-side engine. They are
 *                server-derived, so a client cannot inflate them, and because
 *                the canonical engine applies Time Dilation, VOLT Tempo and
 *                Overclock itself, genome speed effects are already in them.
 *   observedMs — server clock now, minus the server timestamp the previous
 *                checkpoint was written at. No client value participates.
 *
 * `dilationRatio = observedMs / expectedMs`. About 1.0 is a run playing at the
 * speed its own rules imply. Above 1 the wall clock ran longer than the ticks
 * account for (a backgrounded tab, a throttled timer, a paused decision — all
 * ordinary). Below 1 is the direction that cannot happen honestly: more ticks
 * than wall-clock time allows.
 *
 * KNOWN APPROXIMATION, stated rather than hidden: the interval is taken as the
 * mean of the two endpoint speeds. For PRIMAL and COSMIC (fixed tempo) that is
 * exact. For CYBER, whose interval falls with every food, it is a trapezoid
 * over a convex curve and therefore slightly OVERSTATES `expectedMs`, biasing
 * CYBER's ratio marginally low. Sizing a tolerance band per dynasty rather than
 * globally is the answer, and is the owner's call in the data week.
 *
 * THIS IS NOT ENFORCEMENT. Nothing reads the ratio back. No run is flagged, no
 * player is marked, no payout moves. The epoch ruling this feeds is a human
 * decision made from a distribution, and it does not exist yet.
 */
export interface RunDilationSegment {
  sessionId: string;
  playerId?: string | null;
  dynasty?: string | null;
  /** Cumulative replay ticks at the start and end of the segment. */
  fromTick: number;
  toTick: number;
  /** Server-derived tick interval (ms) at each endpoint. */
  fromSpeedMs: number;
  toSpeedMs: number;
  /** Server wall-clock milliseconds the segment actually took. */
  observedMs: number;
  /** The engine's own play-clock delta across the segment, for comparison. */
  claimedElapsedMs?: number | null;
  checkpointRevision?: number | null;
}

export interface RunDilationResult {
  ticks: number;
  expectedMs: number;
  observedMs: number;
  /** null when the segment carried no ticks — nothing to compare. */
  dilationRatio: number | null;
  /** The client's own clock against the same expectation. */
  claimedRatio: number | null;
  band: DilationBand;
}

/**
 * Advisory buckets. Deliberately wide, and deliberately not thresholds:
 * nothing branches on them, they exist so the distribution is groupable before
 * anyone has ruled on what "too much" means.
 */
export type DilationBand =
  | 'no_ticks'
  | 'compressed'
  | 'nominal'
  | 'slow'
  | 'stalled';

export function dilationBand(ratio: number | null): DilationBand {
  if (ratio === null || !Number.isFinite(ratio)) return 'no_ticks';
  if (ratio < 0.9) return 'compressed';
  if (ratio <= 1.5) return 'nominal';
  if (ratio <= 4) return 'slow';
  return 'stalled';
}

export function computeRunDilation(segment: RunDilationSegment): RunDilationResult {
  const ticks = Math.max(0, segment.toTick - segment.fromTick);
  const meanIntervalMs = (segment.fromSpeedMs + segment.toSpeedMs) / 2;
  const expectedMs = ticks * meanIntervalMs;
  const usable = ticks > 0 && expectedMs > 0 && Number.isFinite(segment.observedMs);
  const dilationRatio = usable ? segment.observedMs / expectedMs : null;
  const claimedRatio =
    usable && segment.claimedElapsedMs != null && Number.isFinite(segment.claimedElapsedMs)
      ? segment.claimedElapsedMs / expectedMs
      : null;
  return {
    ticks,
    expectedMs,
    observedMs: segment.observedMs,
    dilationRatio,
    claimedRatio,
    band: dilationBand(dilationRatio),
  };
}

/**
 * Record one segment. A breadcrumb, not an event: checkpoints are frequent and
 * this must cost nothing on the save path. The crumbs ride along on whatever
 * the session reports next, and the compressed tail — the only band worth
 * waking anyone for, and still only worth LOOKING at — is promoted to an event.
 */
export function reportRunDilationSegment(
  segment: RunDilationSegment
): RunDilationResult {
  const result = computeRunDilation(segment);
  const data = {
    sessionId: segment.sessionId,
    playerId: segment.playerId ?? null,
    dynasty: segment.dynasty ?? null,
    fromTick: segment.fromTick,
    toTick: segment.toTick,
    ticks: result.ticks,
    meanIntervalMs: (segment.fromSpeedMs + segment.toSpeedMs) / 2,
    expectedMs: Math.round(result.expectedMs),
    observedMs: Math.round(result.observedMs),
    dilationRatio: result.dilationRatio,
    claimedRatio: result.claimedRatio,
    checkpointRevision: segment.checkpointRevision ?? null,
  };
  telemetryBreadcrumb({
    channel: 'run-dilation',
    message: `segment ${segment.fromTick}->${segment.toTick} ratio ${
      result.dilationRatio === null ? 'n/a' : result.dilationRatio.toFixed(3)
    }`,
    level: result.band === 'compressed' ? 'warning' : 'info',
    data,
  });
  if (result.band === 'compressed') {
    reportTelemetry({
      channel: 'run-dilation',
      message: 'run segment ran faster than its own cadence allows',
      // ADVISORY. This is the band that cannot happen honestly, and it still
      // only produces a warning with no consequence attached — the tolerance
      // band is an owner ruling that has not been made.
      level: 'warning',
      tags: {
        dilation_band: result.band,
        dynasty: segment.dynasty ?? 'unknown',
      },
      fingerprint: ['run-dilation', 'compressed'],
      data,
    });
  }
  return result;
}
