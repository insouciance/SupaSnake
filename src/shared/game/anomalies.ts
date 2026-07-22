/**
 * Weekly Anomaly boards - Design v2 Phase 4B (GAME_DESIGN_V2.md section 7.2)
 *
 * One rotating modifier ruleset per ISO week with its own leaderboard,
 * normal DNA rules. The four launch anomalies plus the Genome-era
 * Overgrown board:
 *
 *   Meteor Shower  [P]  food despawns after 60 ticks
 *   Gold Rush      [E/P] all food x1.5 DNA; portal interval +6 foods
 *   Blackout       [P]  visibility radius 6 cells around the head
 *   Twin Exits     [E/P] two portals live at once; bank x1.15 only
 *
 * Taxonomy discipline (same as mutations, section 5.2): [E] effects are
 * pure functions of the food index / run outcome and are recomputed
 * EXACTLY by the server (Gold Rush food x1.5, Twin Exits bank x1.15);
 * [P] effects change survival/spawn/visibility rules inside the engine or
 * renderer only and never touch the payout formula.
 *
 * Score discipline (resolved like mutations, section "computeRunTotals"
 * note): anomaly [E] modifiers shape the ECONOMY only - the display score
 * stays the pure ruleset number, so every player on a week's board is
 * ranked under identical scoring math.
 *
 * Rotation: a deterministic function of the ISO week (Monday 00:00 UTC)
 * over the 5-anomaly pool - mirrored by anomaly_for_week in migration 032
 * (keep in lockstep). No RNG, no state: client, server, and SQL all agree
 * on the week's anomaly from the calendar alone.
 */

export type AnomalyId =
  | 'meteor_shower'
  | 'gold_rush'
  | 'blackout'
  | 'twin_exits'
  | 'overgrown';

/** Effect kind: E = economic (server-recomputed), P = physical/render. */
export type AnomalyKind = 'E' | 'P' | 'EP';

export interface AnomalyDef {
  id: AnomalyId;
  name: string;
  kind: AnomalyKind;
  /** One-line modifier description - readable on the board entry. */
  effect: string;
  /** Genome offer tilt for this week (+100 weight). */
  strainBias: 'AURUM' | 'VOLT' | 'FERAL' | 'FLUX' | 'UMBRA';
}

export const ANOMALIES: Record<AnomalyId, AnomalyDef> = {
  meteor_shower: {
    id: 'meteor_shower',
    name: 'Meteor Shower',
    kind: 'P',
    effect: 'Food despawns after 60 ticks — eat it before it burns up',
    strainBias: 'VOLT',
  },
  gold_rush: {
    id: 'gold_rush',
    name: 'Gold Rush',
    kind: 'EP',
    effect: 'All food ×1.5 DNA — exit portals spawn 6 foods later',
    strainBias: 'AURUM',
  },
  blackout: {
    id: 'blackout',
    name: 'Blackout',
    kind: 'P',
    effect: 'Visibility radius 6 cells around your head',
    strainBias: 'UMBRA',
  },
  twin_exits: {
    id: 'twin_exits',
    name: 'Twin Exits',
    kind: 'EP',
    effect: 'Two portals live at once — bank ×1.15 only',
    strainBias: 'FLUX',
  },
  overgrown: {
    id: 'overgrown',
    name: 'Overgrown',
    kind: 'P',
    effect: 'Every food grows one extra segment — Molt food pays 10 DNA',
    strainBias: 'FERAL',
  },
};

/**
 * The rotation pool, in rotation order (section 7.2 listing order).
 * Week N's anomaly is ANOMALY_ROTATION[weeksSinceEpoch(N) % 5].
 */
export const ANOMALY_ROTATION: readonly AnomalyId[] = [
  'meteor_shower',
  'gold_rush',
  'blackout',
  'twin_exits',
  'overgrown',
] as const;

export function isAnomalyId(value: unknown): value is AnomalyId {
  return typeof value === 'string' && value in ANOMALIES;
}

/**
 * Genome strain weeks (BUILDCRAFT_GENOME_DESIGN.md §9): each anomaly
 * week tilts gene offers toward one strain (+100 offer weight). The
 * mechanics of the anomalies themselves are unchanged.
 */
export const ANOMALY_STRAINS: Record<
  AnomalyId,
  'AURUM' | 'VOLT' | 'FERAL' | 'FLUX' | 'UMBRA'
> = {
  gold_rush: 'AURUM',
  meteor_shower: 'VOLT',
  blackout: 'UMBRA',
  twin_exits: 'FLUX',
  overgrown: 'FERAL',
};

/** Economic tuning ([E] - exact server recompute), exported for tests + UI. */
export const ANOMALY_ECONOMICS = {
  /** Gold Rush: every food pays x1.5 DNA. */
  goldRushFoodMultiplier: 1.5,
  /** Twin Exits: the banked outcome multiplier is x1.15 (vs the base x1.25). */
  twinExitsBankMultiplier: 1.15,
  /** Overgrown FERAL-week buff: Molt pickups pay 10 instead of 5 flat. */
  overgrownMoltFoodFlat: 10,
} as const;

/** Physical tuning ([P] - engine/renderer side), exported for tests. */
export const ANOMALY_PHYSICS = {
  /** Meteor Shower: a food wave despawns (and respawns) after this many ticks. */
  meteorShowerFoodDespawnTicks: 60,
  /** Gold Rush cost: exit portal interval +6 foods. */
  goldRushPortalIntervalPenalty: 6,
  /** Blackout: visibility radius in cells around the head (render layer). */
  blackoutVisibilityRadius: 6,
  /** Twin Exits: portals spawn as a pair sharing one despawn window. */
  twinExitsPortalCount: 2,
  /** Overgrown: every ordinary food adds one extra body segment. */
  overgrownExtraSegments: 1,
} as const;

/**
 * Per-food [E] value modifier under the week's anomaly - the anomaly
 * counterpart of foodValueModifier/traitFoodValueModifier, folded into the
 * SAME single per-food round by the engine and computeRunTotals so the
 * server recompute stays exact. Pure in (anomaly, n); n is accepted for
 * signature symmetry (Gold Rush applies to every food).
 */
export function anomalyFoodValueModifier(
  anomaly: AnomalyId | null | undefined,
  _n: number
): number {
  return anomaly === 'gold_rush'
    ? ANOMALY_ECONOMICS.goldRushFoodMultiplier
    : 1;
}

/**
 * The anomaly's replacement for the BASE banked multiplier, or null when
 * the anomaly leaves it alone. Twin Exits: bank x1.15 only - the price of
 * having two doors. Applied BEFORE mutation/trait outcome shaping, so
 * Mirror Wager's absolute x1.50 (an [E] mutation that SETS the bank) still
 * behaves identically on and off the board, and additive trait deltas
 * stack on the anomaly base exactly as they do on x1.25. Salvage is never
 * anomaly-shaped.
 */
export function anomalyBankOverride(
  anomaly: AnomalyId | null | undefined
): number | null {
  return anomaly === 'twin_exits'
    ? ANOMALY_ECONOMICS.twinExitsBankMultiplier
    : null;
}

// ---------------------------------------------------------------------------
// Weekly rotation (deterministic, ISO week, UTC)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Rotation epoch: Monday 2024-01-01 00:00 UTC. Any fixed Monday works -
 * this one is mirrored by anomaly_for_week in migration 021 (lockstep).
 */
export const ANOMALY_EPOCH_UTC = Date.UTC(2024, 0, 1);

/** Monday 00:00 UTC of the ISO week containing `at` (duel_week_start mirror). */
export function anomalyWeekStart(at: Date = new Date()): Date {
  const utcMidnight = Date.UTC(
    at.getUTCFullYear(),
    at.getUTCMonth(),
    at.getUTCDate()
  );
  const daysSinceMonday = (at.getUTCDay() + 6) % 7; // 0 = Sunday
  return new Date(utcMidnight - daysSinceMonday * DAY_MS);
}

/** [Mon 00:00, next Mon 00:00) UTC - the board's scoring window. */
export function anomalyWeekEnd(weekStart: Date): Date {
  return new Date(weekStart.getTime() + WEEK_MS);
}

/**
 * The week's anomaly: index = whole weeks since the epoch Monday, mod 5.
 * Deterministic for any date, past or future - no state, no RNG.
 */
export function anomalyForWeek(at: Date = new Date()): AnomalyId {
  const weekStart = anomalyWeekStart(at);
  const weeks = Math.floor((weekStart.getTime() - ANOMALY_EPOCH_UTC) / WEEK_MS);
  const index = ((weeks % ANOMALY_ROTATION.length) + ANOMALY_ROTATION.length) %
    ANOMALY_ROTATION.length;
  return ANOMALY_ROTATION[index];
}
