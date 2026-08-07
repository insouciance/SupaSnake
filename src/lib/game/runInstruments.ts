/**
 * ET-0 — trust instrumentation. The numbers every later Engine Trust package
 * cites, and nothing else.
 *
 * Three instruments live here, all of them pure accumulators with no clock, no
 * DOM and no Sentry import: the caller supplies every timestamp, and the caller
 * decides what to do with a summary. That keeps them unit-testable, keeps them
 * out of the render path, and — the reason that matters — keeps them incapable
 * of affecting the run they measure. ET-2 will rule on a rules-bearing grace
 * window using the coyote counter below; a measurement that could itself
 * perturb input timing would poison the ruling it exists to inform.
 *
 * A0 applies: every buffer here is bounded, because the longest runs are
 * precisely the ones whose numbers are worth having.
 */

import { SampleRing, summarizeSamples, type SampleSummary } from '@/lib/telemetry/percentiles';

/** Roughly ten minutes of turns at a brisk pace, and ~8 KB of numbers. */
const INPUT_SAMPLE_CAPACITY = 2_048;
/** Roughly twenty minutes of ticks at PRIMAL's 175 ms. */
const TICK_SAMPLE_CAPACITY = 4_096;

// ---------------------------------------------------------------------------
// (a) input-to-effect latency
// ---------------------------------------------------------------------------

/**
 * How long an accepted turn waited between the DOM event that carried it and
 * the tick that acted on it.
 *
 * This is the honest version of "input lag" for a fixed-tick game: the engine
 * consumes at most one buffered input per movement boundary, so a turn pressed
 * just after a tick waits nearly a whole interval by design. The distribution
 * is therefore expected to be roughly uniform across [0, tickInterval] plus
 * scheduling overhead — and it is the OVERHEAD, visible as the tail beyond the
 * interval, that ET-3 and ET-4 are trying to remove. Reporting the mean alone
 * would hide exactly that.
 */
export class InputLatencyMeter {
  private readonly samples = new SampleRing(INPUT_SAMPLE_CAPACITY);

  /**
   * @param inputTimeMs  DOM `event.timeStamp` of the accepted turn.
   * @param consumedAtMs `performance.now()` at the tick that consumed it.
   *
   * Both are on the same monotonic time origin in every browser that matters
   * (`event.timeStamp` has been `DOMHighResTimeStamp` since the removal of the
   * legacy epoch form), so the subtraction is meaningful. A negative or absurd
   * delta means they were NOT — a synthetic event, or a browser handing back
   * epoch milliseconds — and is dropped rather than allowed to corrupt the
   * percentiles with a 1.7-trillion-millisecond sample.
   */
  record(inputTimeMs: number, consumedAtMs: number): void {
    if (!Number.isFinite(inputTimeMs) || !Number.isFinite(consumedAtMs)) return;
    const latency = consumedAtMs - inputTimeMs;
    if (latency < 0 || latency > 60_000) return;
    this.samples.push(latency);
  }

  summary(): SampleSummary {
    return this.samples.summary();
  }

  /** Turns seen, including any the ring has since dropped. */
  get observed(): number {
    return this.samples.observed;
  }

  reset(): void {
    this.samples.reset();
  }
}

// ---------------------------------------------------------------------------
// (c) tick jitter
// ---------------------------------------------------------------------------

export interface TickJitterSummary extends SampleSummary {
  /** Ticks actually executed per second over the measured span. */
  realizedTicksPerSecond: number | null;
  /** The single worst gap between consecutive ticks, in ms. */
  worstGapMs: number | null;
  /** The interval those ticks were scheduled at when the worst gap happened. */
  worstGapScheduledMs: number | null;
}

/**
 * Scheduled-vs-actual tick delta.
 *
 * `setInterval` is a request, not a promise. What this measures is how much
 * later than its appointment each tick actually ran — the same starvation the
 * render governor infers from its own dropped callbacks, but measured on the
 * appointment that decides the game. ET-4 replaces the driver; this is the
 * before number, and re-running it is the after.
 *
 * Deltas are signed on the late side only: a tick cannot run early, so a
 * negative delta means the interval was changed between ticks (CYBER speeds up
 * with every food) and the sample belongs to neither interval. Those are
 * dropped, which is why the meter is told the scheduled interval rather than
 * inferring it.
 */
export class TickJitterMeter {
  private readonly deltas = new SampleRing(TICK_SAMPLE_CAPACITY);
  private lastTickAtMs: number | null = null;
  private firstTickAtMs: number | null = null;
  private ticks = 0;
  private worstGapMs: number | null = null;
  private worstGapScheduledMs: number | null = null;

  /**
   * @param tickAtMs      `performance.now()` at this tick's commit.
   * @param scheduledMs   the interval this tick was scheduled at.
   */
  record(tickAtMs: number, scheduledMs: number): void {
    if (!Number.isFinite(tickAtMs) || !Number.isFinite(scheduledMs) || scheduledMs <= 0) {
      return;
    }
    this.ticks += 1;
    if (this.firstTickAtMs === null) this.firstTickAtMs = tickAtMs;
    const previous = this.lastTickAtMs;
    this.lastTickAtMs = tickAtMs;
    if (previous === null) return;
    const gap = tickAtMs - previous;
    if (gap < 0) return;
    if (this.worstGapMs === null || gap > this.worstGapMs) {
      this.worstGapMs = gap;
      this.worstGapScheduledMs = scheduledMs;
    }
    const delta = gap - scheduledMs;
    // A tick that ran EARLY by more than a millisecond means the interval
    // changed underneath it; that sample describes no single appointment.
    if (delta < -1) return;
    this.deltas.push(Math.max(0, delta));
  }

  summary(): TickJitterSummary {
    const span =
      this.firstTickAtMs !== null && this.lastTickAtMs !== null
        ? this.lastTickAtMs - this.firstTickAtMs
        : 0;
    return {
      ...this.deltas.summary(),
      realizedTicksPerSecond:
        span > 0 ? ((this.ticks - 1) * 1_000) / span : null,
      worstGapMs: this.worstGapMs,
      worstGapScheduledMs: this.worstGapScheduledMs,
    };
  }

  get tickCount(): number {
    return this.ticks;
  }

  reset(): void {
    this.deltas.reset();
    this.lastTickAtMs = null;
    this.firstTickAtMs = null;
    this.ticks = 0;
    this.worstGapMs = null;
    this.worstGapScheduledMs = null;
  }
}

// ---------------------------------------------------------------------------
// (b) death forensics — the coyote-zone counter
// ---------------------------------------------------------------------------

export type DeathForensicsCause = 'wall' | 'self' | 'other';

/**
 * THE number ET-2's ruling needs.
 *
 * The claim ET-2 exists to answer is "I thought I had that" — the player turned,
 * the turn was legal, and it arrived a hair after the boundary that killed
 * them. `coyoteZone` is true when an admissible turn landed within
 * `COYOTE_OBSERVATION_MS` AFTER the fatal tick. Counting that population is the
 * whole point: if it is rare, ET-2's grace window is a solution to a problem
 * nobody has, and the rules bump does not happen.
 *
 * Everything here is OBSERVATION. No field feeds a payout, a score, or the
 * validator, and the fatal tick has already resolved by the time this is built
 * — the record cannot change the death it describes.
 */
export interface DeathForensics {
  cause: DeathForensicsCause;
  /**
   * Interpolation alpha at the last input before death, in [0, 1]: where the
   * visual head sat within its tick when the player committed. ET-1 moves this
   * distribution deliberately; ET-2 needs to know whether deaths cluster at a
   * particular phase of the interval.
   */
  alphaAtLastInput: number | null;
  /** Manhattan cell distance from head to the fatal cell at that input. */
  cellDistanceAtInput: number | null;
  /** ms from the last accepted input to the fatal tick. Negative if after. */
  inputToFatalTickMs: number | null;
  /**
   * ms from the fatal tick to the next admissible turn, when one arrived
   * inside the observation window. Null when none did.
   */
  turnAfterFatalTickMs: number | null;
  /** The counter: an admissible turn arrived inside the window, post-mortem. */
  coyoteZone: boolean;
  tick: number;
  dynasty: string | null;
  tickIntervalMs: number | null;
}

/**
 * The observation window. NOT the grace window — ET-2 will rule on that, and
 * the recommendation on the table is `min(40ms, 0.25 × tick)`. This is wider on
 * purpose: measuring only inside the window you already intend to ship would
 * make the data agree with the proposal by construction, and the owner needs
 * to see the shape of the cluster to size it.
 */
export const COYOTE_OBSERVATION_MS = 60;

export interface DeathForensicsInput {
  cause: DeathForensicsCause;
  tick: number;
  dynasty?: string | null;
  tickIntervalMs?: number | null;
  fatalTickAtMs: number;
  lastInputAtMs?: number | null;
  alphaAtLastInput?: number | null;
  cellDistanceAtInput?: number | null;
  /** Timestamp of the first admissible turn after the fatal tick, if any. */
  turnAfterFatalTickAtMs?: number | null;
}

export function buildDeathForensics(input: DeathForensicsInput): DeathForensics {
  const inputToFatalTickMs =
    input.lastInputAtMs != null && Number.isFinite(input.lastInputAtMs)
      ? input.fatalTickAtMs - input.lastInputAtMs
      : null;
  const rawAfter =
    input.turnAfterFatalTickAtMs != null && Number.isFinite(input.turnAfterFatalTickAtMs)
      ? input.turnAfterFatalTickAtMs - input.fatalTickAtMs
      : null;
  const turnAfterFatalTickMs =
    rawAfter !== null && rawAfter >= 0 && rawAfter <= COYOTE_OBSERVATION_MS
      ? rawAfter
      : null;
  return {
    cause: input.cause,
    alphaAtLastInput:
      input.alphaAtLastInput != null && Number.isFinite(input.alphaAtLastInput)
        ? Math.min(1, Math.max(0, input.alphaAtLastInput))
        : null,
    cellDistanceAtInput: input.cellDistanceAtInput ?? null,
    inputToFatalTickMs,
    turnAfterFatalTickMs,
    coyoteZone: turnAfterFatalTickMs !== null,
    tick: input.tick,
    dynasty: input.dynasty ?? null,
    tickIntervalMs: input.tickIntervalMs ?? null,
  };
}

// ---------------------------------------------------------------------------
// Governor tier ledger (Wave 3 item 4)
// ---------------------------------------------------------------------------

export interface RenderTierSummary {
  /** Worst (highest) tier the run ever reached. 0 is the full look. */
  maxTier: number;
  /** Tier the run ended on. */
  finalTier: number;
  /** Times the governor stepped DOWN in quality (tier number up). */
  demotions: number;
  /** Times it recovered a tier. */
  promotions: number;
  /** Milliseconds spent at each tier, keyed by tier number. */
  msAtTier: Record<number, number>;
  /** Total time the governor was sampling. */
  sampledMs: number;
}

/**
 * Per-run accumulation of what the governor did.
 *
 * Tier changes already emit a breadcrumb, which answers "did this device
 * degrade" for one session at a time and answers nothing about the population.
 * The summary is what makes tier distribution across real devices queryable —
 * and it is the trigger the plan parks the engine-in-worker decision behind, so
 * it needs to be a number somebody can chart, not a trail somebody can read.
 *
 * ADVISORY, and structurally so: this observes a RENDER decision. Two players
 * at different tiers play a byte-identical game (`renderQuality.ts:35-38`), and
 * nothing in this ledger reaches the engine, the checkpoint or the fold.
 */
export class RenderTierLedger {
  private readonly msAtTier: Record<number, number> = {};
  private currentTier = 0;
  private maxTier = 0;
  private demotions = 0;
  private promotions = 0;
  private lastMarkMs: number | null = null;

  /** Begin (or restart) accounting at `nowMs`, at tier 0. */
  start(nowMs: number): void {
    this.reset();
    this.lastMarkMs = nowMs;
  }

  /**
   * Attribute elapsed time to the tier that was live, then move to `tier`.
   * Called on every governor transition; the caller already has the timestamp.
   */
  recordTierChange(from: number, to: number, nowMs: number): void {
    this.accrue(nowMs);
    if (to > from) this.demotions += 1;
    else if (to < from) this.promotions += 1;
    this.currentTier = to;
    if (to > this.maxTier) this.maxTier = to;
  }

  /** Close the open interval without changing tier (run ended, board hidden). */
  mark(nowMs: number): void {
    this.accrue(nowMs);
  }

  private accrue(nowMs: number): void {
    if (this.lastMarkMs === null || !Number.isFinite(nowMs)) {
      this.lastMarkMs = nowMs;
      return;
    }
    const elapsed = Math.max(0, nowMs - this.lastMarkMs);
    this.msAtTier[this.currentTier] = (this.msAtTier[this.currentTier] ?? 0) + elapsed;
    this.lastMarkMs = nowMs;
  }

  summary(): RenderTierSummary {
    const sampledMs = Object.values(this.msAtTier).reduce(
      (total, value) => total + value,
      0
    );
    return {
      maxTier: this.maxTier,
      finalTier: this.currentTier,
      demotions: this.demotions,
      promotions: this.promotions,
      msAtTier: { ...this.msAtTier },
      sampledMs,
    };
  }

  reset(): void {
    for (const key of Object.keys(this.msAtTier)) {
      delete this.msAtTier[Number(key)];
    }
    this.currentTier = 0;
    this.maxTier = 0;
    this.demotions = 0;
    this.promotions = 0;
    this.lastMarkMs = null;
  }
}

/** Convenience for overlays: "p50/p95/max (n)" in one short string. */
export function formatSummary(summary: SampleSummary, unit = 'ms'): string {
  if (summary.count === 0) return 'no samples';
  const round = (value: number | null) =>
    value === null ? '-' : Math.round(value).toString();
  return `p50 ${round(summary.p50Ms)}${unit} · p95 ${round(summary.p95Ms)}${unit} · max ${round(
    summary.maxMs
  )}${unit} · n=${summary.count}`;
}

export { summarizeSamples };
