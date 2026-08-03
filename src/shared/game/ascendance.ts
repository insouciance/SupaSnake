/**
 * Ascendance — permanent Yield progression for one snake lineage.
 *
 * Curve v1 is retained verbatim for runs that started while the original
 * capped curve was authoritative. Curve v2 is the current curve for newly
 * started runs: Gen1–3 are neutral and every later generation is worth 2%
 * more than the previous one.
 *
 * A run must freeze both its curve version and integer multiplier at start.
 * Settlement can then use `frozenMultiplierBps`, so a later balance change can
 * never alter an in-flight run. Score never enters this module.
 */

/** The first generation that earns an Ascendance multiplier. */
export const ASCENDANCE_START_GENERATION = 4;

export type AscendanceCurveVersion = 1 | 2;

/** New runs use v2. Historical/in-flight v1 runs must pass version 1. */
export const CURRENT_ASCENDANCE_CURVE_VERSION: AscendanceCurveVersion = 2;

/**
 * Ascendance multipliers are authoritative integers at 0.01% resolution.
 * This matches the resolution of the v1 curve and avoids float drift between
 * run start, preview, replay, and settlement.
 */
export const ASCENDANCE_MULTIPLIER_BPS = 10_000;

/** V2 compounds by 2% for every generation after Gen3. */
export const ASCENDANCE_V2_GENERATION_FACTOR = 1.02;

/** A visible evolution beat occurs at Gen5, Gen10, Gen15, and so on. */
export const ASCENDANCE_EVOLUTION_INTERVAL = 5;

// ---------------------------------------------------------------------------
// Curve v1 — retained for historical and already-started runs
// ---------------------------------------------------------------------------

/** @deprecated V1's +30% asymptote. Use an explicit curve version. */
export const ASCENDANCE_V1_YIELD_CEILING = 0.3;

/** @deprecated V1's first increment, at Gen4. */
export const ASCENDANCE_V1_FIRST_INCREMENT = 0.02;

/** @deprecated V1 geometric decay: 1 - 0.02/0.30 = 14/15. */
export const ASCENDANCE_V1_DECAY =
  1 - ASCENDANCE_V1_FIRST_INCREMENT / ASCENDANCE_V1_YIELD_CEILING;

/**
 * Legacy aliases are deliberately preserved for callers not yet migrated to
 * version-aware presentation. They describe v1, not the current v2 curve.
 */
export const ASCENDANCE_YIELD_CEILING = ASCENDANCE_V1_YIELD_CEILING;
export const ASCENDANCE_FIRST_INCREMENT = ASCENDANCE_V1_FIRST_INCREMENT;
export const ASCENDANCE_DECAY = ASCENDANCE_V1_DECAY;

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const MAX_MULTIPLIER_BPS = Number.MAX_SAFE_INTEGER;

function normalizeGeneration(generation: unknown): number {
  if (typeof generation !== 'number' || !Number.isFinite(generation)) return 1;
  return Math.min(MAX_SAFE_INTEGER, Math.max(1, Math.floor(generation)));
}

function normalizeYield(yieldDna: unknown): number {
  if (typeof yieldDna !== 'number' || !Number.isFinite(yieldDna)) return 0;
  return Math.min(MAX_SAFE_INTEGER, Math.max(0, Math.floor(yieldDna)));
}

function normalizeCurveVersion(version: unknown): AscendanceCurveVersion {
  return version === 1 || version === 2
    ? version
    : CURRENT_ASCENDANCE_CURVE_VERSION;
}

function normalizeMultiplierBps(multiplierBps: unknown): number | null {
  if (
    typeof multiplierBps !== 'number' ||
    !Number.isFinite(multiplierBps) ||
    multiplierBps < ASCENDANCE_MULTIPLIER_BPS
  ) {
    return null;
  }
  return Math.min(MAX_MULTIPLIER_BPS, Math.floor(multiplierBps));
}

/** Exact original v1 bonus semantics, including four-decimal rounding. */
export function ascendanceYieldBonusV1(generation: number): number {
  const gen = normalizeGeneration(generation);
  const steps = gen - (ASCENDANCE_START_GENERATION - 1);
  if (steps <= 0) return 0;
  const raw =
    ASCENDANCE_V1_YIELD_CEILING *
    (1 - Math.pow(ASCENDANCE_V1_DECAY, steps));
  return Math.min(
    ASCENDANCE_V1_YIELD_CEILING,
    Math.round(raw * ASCENDANCE_MULTIPLIER_BPS) /
      ASCENDANCE_MULTIPLIER_BPS
  );
}

/** Exact original v1 multiplier semantics. */
export function ascendanceYieldMultiplierV1(generation: number): number {
  return 1 + ascendanceYieldBonusV1(generation);
}

/** Frozen integer representation of the original v1 multiplier. */
export function ascendanceYieldMultiplierBpsV1(generation: number): number {
  return Math.round(
    ascendanceYieldMultiplierV1(generation) * ASCENDANCE_MULTIPLIER_BPS
  );
}

// ---------------------------------------------------------------------------
// Curve v2 — current, compounding and meaningfully expandable
// ---------------------------------------------------------------------------

/**
 * Compute v2 directly in fixed-point form. The representation guard is many
 * orders of magnitude beyond practical play; it exists solely to prevent
 * Infinity/unsafe-integer propagation for corrupt or adversarial input.
 */
export function ascendanceYieldMultiplierBpsV2(generation: number): number {
  const gen = normalizeGeneration(generation);
  const steps = gen - (ASCENDANCE_START_GENERATION - 1);
  if (steps <= 0) return ASCENDANCE_MULTIPLIER_BPS;

  const logScaled =
    Math.log(ASCENDANCE_MULTIPLIER_BPS) +
    steps * Math.log(ASCENDANCE_V2_GENERATION_FACTOR);
  if (logScaled >= Math.log(MAX_MULTIPLIER_BPS)) {
    return MAX_MULTIPLIER_BPS;
  }

  const scaled =
    ASCENDANCE_MULTIPLIER_BPS *
    Math.pow(ASCENDANCE_V2_GENERATION_FACTOR, steps);
  return Math.max(
    ASCENDANCE_MULTIPLIER_BPS,
    Math.min(MAX_MULTIPLIER_BPS, Math.round(scaled))
  );
}

/** V2 multiplier as a display-friendly number. Settlement uses integer BPS. */
export function ascendanceYieldMultiplierV2(generation: number): number {
  return (
    ascendanceYieldMultiplierBpsV2(generation) /
    ASCENDANCE_MULTIPLIER_BPS
  );
}

/** V2 Yield bonus as a fraction (0.02 = +2%). */
export function ascendanceYieldBonusV2(generation: number): number {
  return ascendanceYieldMultiplierV2(generation) - 1;
}

/** Resolve a generation to its authoritative integer multiplier. */
export function ascendanceYieldMultiplierBps(
  generation: number,
  curveVersion: AscendanceCurveVersion = CURRENT_ASCENDANCE_CURVE_VERSION
): number {
  return normalizeCurveVersion(curveVersion) === 1
    ? ascendanceYieldMultiplierBpsV1(generation)
    : ascendanceYieldMultiplierBpsV2(generation);
}

/**
 * Current-by-default Yield bonus. Pass version 1 explicitly when replaying a
 * historical run.
 */
export function ascendanceYieldBonus(
  generation: number,
  curveVersion: AscendanceCurveVersion = CURRENT_ASCENDANCE_CURVE_VERSION
): number {
  return normalizeCurveVersion(curveVersion) === 1
    ? ascendanceYieldBonusV1(generation)
    : ascendanceYieldBonusV2(generation);
}

/** Current-by-default multiplier. Authoritative settlement uses BPS. */
export function ascendanceYieldMultiplier(
  generation: number,
  curveVersion: AscendanceCurveVersion = CURRENT_ASCENDANCE_CURVE_VERSION
): number {
  return (
    ascendanceYieldMultiplierBps(generation, curveVersion) /
    ASCENDANCE_MULTIPLIER_BPS
  );
}

/**
 * Format a Yield multiplier with 0.01% resolution while keeping the neutral
 * value explicit (`1.00`).
 */
export function formatYieldMultiplier(multiplier: number): string {
  const safe = Number.isFinite(multiplier) && multiplier >= 1 ? multiplier : 1;
  const [whole, rawFraction = ''] = safe.toFixed(4).split('.');
  const fraction = rawFraction.replace(/0+$/, '').padEnd(2, '0');
  return `${whole}.${fraction}`;
}

/** Player-facing multiplier for a snake generation. */
export function formatAscendanceYieldMultiplier(
  generation: number,
  curveVersion: AscendanceCurveVersion = CURRENT_ASCENDANCE_CURVE_VERSION
): string {
  return formatYieldMultiplier(
    ascendanceYieldMultiplier(generation, curveVersion)
  );
}

export interface AscendanceSettlementTerms {
  /** Curve frozen when the run started. Defaults to the current curve. */
  curveVersion?: AscendanceCurveVersion;
  /**
   * Exact multiplier frozen when the run started. When supplied, this wins
   * over recomputing from generation and protects the run from later tuning.
   */
  frozenMultiplierBps?: number;
}

/** Immutable run-start stamp stored at `run_context.snake.ascendance`. */
export interface AscendanceRunStamp {
  curveVersion: AscendanceCurveVersion;
  multiplierBps: number;
}

export function createAscendanceRunStamp(
  generation: number,
  curveVersion: AscendanceCurveVersion = CURRENT_ASCENDANCE_CURVE_VERSION
): AscendanceRunStamp {
  return {
    curveVersion,
    multiplierBps: ascendanceYieldMultiplierBps(generation, curveVersion),
  };
}

/**
 * The exact server-authoritative explanation of Ascendance's contribution to
 * one run. `multiplierBps` is the settlement value; `multiplier` is display.
 */
export interface AscendanceYieldBreakdown {
  generation: number;
  curveVersion: AscendanceCurveVersion;
  baseYield: number;
  multiplierBps: number;
  multiplier: number;
  bonusYield: number;
  totalYield: number;
}

function multiplyYieldByBps(baseYield: number, multiplierBps: number): number {
  const product = BigInt(baseYield) * BigInt(multiplierBps);
  const total = product / BigInt(ASCENDANCE_MULTIPLIER_BPS);
  const max = BigInt(MAX_SAFE_INTEGER);
  return total > max ? MAX_SAFE_INTEGER : Number(total);
}

/**
 * Compute settlement and its exact explanation. Authoritative DNA is an
 * integer and multiplication occurs with integer arithmetic, then floors once.
 */
export function ascendanceYieldBreakdown(
  yieldDna: number,
  generation: number,
  terms: AscendanceSettlementTerms = {}
): AscendanceYieldBreakdown {
  const normalizedGeneration = normalizeGeneration(generation);
  const curveVersion = normalizeCurveVersion(terms.curveVersion);
  const baseYield = normalizeYield(yieldDna);
  const frozen = normalizeMultiplierBps(terms.frozenMultiplierBps);
  const multiplierBps =
    frozen ??
    ascendanceYieldMultiplierBps(normalizedGeneration, curveVersion);
  const totalYield = multiplyYieldByBps(baseYield, multiplierBps);

  return {
    generation: normalizedGeneration,
    curveVersion,
    baseYield,
    multiplierBps,
    multiplier: multiplierBps / ASCENDANCE_MULTIPLIER_BPS,
    bonusYield: totalYield - baseYield,
    totalYield,
  };
}

/** Apply Ascendance to integer Yield. Score is deliberately not accepted. */
export function applyAscendanceYield(
  yieldDna: number,
  generation: number,
  terms: AscendanceSettlementTerms = {}
): number {
  return ascendanceYieldBreakdown(yieldDna, generation, terms).totalYield;
}

/** Explicit historical settlement path for v1 run envelopes. */
export function ascendanceYieldBreakdownV1(
  yieldDna: number,
  generation: number,
  frozenMultiplierBps?: number
): AscendanceYieldBreakdown {
  return ascendanceYieldBreakdown(yieldDna, generation, {
    curveVersion: 1,
    frozenMultiplierBps,
  });
}

/** Explicit historical payout helper for v1 run envelopes. */
export function applyAscendanceYieldV1(
  yieldDna: number,
  generation: number,
  frozenMultiplierBps?: number
): number {
  return ascendanceYieldBreakdownV1(
    yieldDna,
    generation,
    frozenMultiplierBps
  ).totalYield;
}

export interface AscendanceEvolutionMilestone {
  generation: number;
  ordinal: number;
  curveVersion: AscendanceCurveVersion;
  multiplierBps: number;
  multiplier: number;
}

export interface AscendanceEvolutionProgress {
  interval: number;
  current: AscendanceEvolutionMilestone | null;
  next: AscendanceEvolutionMilestone | null;
  generationsUntilNext: number;
}

/** Metadata for an exact Gen5/10/15… evolution milestone. */
export function ascendanceEvolutionMilestone(
  generation: number,
  curveVersion: AscendanceCurveVersion = CURRENT_ASCENDANCE_CURVE_VERSION
): AscendanceEvolutionMilestone | null {
  const gen = normalizeGeneration(generation);
  if (
    gen < ASCENDANCE_EVOLUTION_INTERVAL ||
    gen % ASCENDANCE_EVOLUTION_INTERVAL !== 0
  ) {
    return null;
  }
  const version = normalizeCurveVersion(curveVersion);
  const multiplierBps = ascendanceYieldMultiplierBps(gen, version);
  return {
    generation: gen,
    ordinal: gen / ASCENDANCE_EVOLUTION_INTERVAL,
    curveVersion: version,
    multiplierBps,
    multiplier: multiplierBps / ASCENDANCE_MULTIPLIER_BPS,
  };
}

/** Current and next evolution beat for compact UI/progression surfaces. */
export function ascendanceEvolutionProgress(
  generation: number,
  curveVersion: AscendanceCurveVersion = CURRENT_ASCENDANCE_CURVE_VERSION
): AscendanceEvolutionProgress {
  const gen = normalizeGeneration(generation);
  const version = normalizeCurveVersion(curveVersion);
  const currentGeneration =
    Math.floor(gen / ASCENDANCE_EVOLUTION_INTERVAL) *
    ASCENDANCE_EVOLUTION_INTERVAL;
  const safeCurrent =
    currentGeneration >= ASCENDANCE_EVOLUTION_INTERVAL
      ? currentGeneration
      : null;
  const candidateNextGeneration =
    safeCurrent === null
      ? ASCENDANCE_EVOLUTION_INTERVAL
      : safeCurrent + ASCENDANCE_EVOLUTION_INTERVAL;
  const nextGeneration = Number.isSafeInteger(candidateNextGeneration)
    ? candidateNextGeneration
    : null;

  return {
    interval: ASCENDANCE_EVOLUTION_INTERVAL,
    current:
      safeCurrent === null
        ? null
        : ascendanceEvolutionMilestone(safeCurrent, version),
    next:
      nextGeneration === null
        ? null
        : ascendanceEvolutionMilestone(nextGeneration, version),
    generationsUntilNext:
      nextGeneration === null ? 0 : Math.max(0, nextGeneration - gen),
  };
}

// =============================================================================
// BREEDING COST — shipped curve, intentionally unchanged
// =============================================================================

/** Base DNA cost of any breeding. */
export const BREEDING_BASE_COST = 200;

/** DNA added per averaged parent generation. */
export const BREEDING_COST_PER_GEN = 100;

/** Cost multiplier per generation past Gen3. */
export const ASCENDANCE_COST_STEEPENING = 1.25;

/** Guard the exponentiation before the hard cost ceiling takes over. */
const MAX_STEEPENING_STEPS = 200;

/** Hard ceiling on a single breed, an overflow guard rather than a design dial. */
export const BREEDING_COST_CEILING = 1_000_000_000;

/** Offspring generation: one above the highest parent generation. Uncapped. */
export function offspringGeneration(gen1: number, gen2: number): number {
  return Math.min(
    MAX_SAFE_INTEGER,
    Math.max(normalizeGeneration(gen1), normalizeGeneration(gen2)) + 1
  );
}

/**
 * DNA cost to breed two parents.
 *
 *   base = 200 + floor((gen1 + gen2) / 2) * 100
 *   cost = base * 1.25^max(0, childGeneration - 3)
 */
export function breedingCost(gen1: number, gen2: number): number {
  const g1 = normalizeGeneration(gen1);
  const g2 = normalizeGeneration(gen2);
  const averagedGeneration = Math.floor(g1 / 2 + g2 / 2);
  const base = Math.min(
    BREEDING_COST_CEILING,
    BREEDING_BASE_COST + averagedGeneration * BREEDING_COST_PER_GEN
  );
  const steps = Math.min(
    Math.max(0, offspringGeneration(g1, g2) - (ASCENDANCE_START_GENERATION - 1)),
    MAX_STEEPENING_STEPS
  );
  const cost = base * Math.pow(ASCENDANCE_COST_STEEPENING, steps);
  return Math.min(BREEDING_COST_CEILING, Math.ceil(cost));
}

/** True once a snake has entered Ascendance (Gen4+). */
export function isAscended(generation: number): boolean {
  return normalizeGeneration(generation) >= ASCENDANCE_START_GENERATION;
}
