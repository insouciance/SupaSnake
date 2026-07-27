/**
 * GROWTH PROFILES — the D1 instrument (WP-3.02).
 *
 * The one open decision of the Redesign Wave is **time-to-first-pressure**:
 * how long a run takes to reach the board occupancy where Snake becomes
 * Snake. It is answered by the owner playing, not by analysis, and this module
 * is what lets them play three answers back to back.
 *
 * WHY THIS EXISTS AT ALL. Across 144 production runs the median reaches **8%**
 * board occupancy and the best run ever recorded reaches ~43%. The board has
 * never been filled, so the difficulty curve Snake gets free from its own
 * geometry has never engaged. Growth is roughly five times too slow for a
 * 400-cell board.
 *
 * TWO RULES BIND EVERY LINE HERE.
 *
 * 1. **One function, both sides.** `baseGrowthForFood` is called by the engine
 *    (`SnakeGameLogic`) and by the server length model (`computeLengthTrace`).
 *    A second implementation would diverge, and a length divergence silently
 *    invalidates honest runs — the defect WP-2.05 existed to eliminate. The
 *    parity suite asserts equality across every profile.
 *
 * 2. **Never behind a build-time flag.** `NEXT_PUBLIC_*` are inlined at build
 *    time, so a client built with one curve and a server recomputing with
 *    another disagree on every length. The profile is therefore **stamped
 *    server-side into `run_context`** at run start and replayed from that
 *    stamp at settlement. The flag gates only whether the *selector* is shown.
 *    A run with no stamp is `baseline`, which is byte-identical to today.
 */

export type GrowthProfileId = 'baseline' | 'tuned' | 'aggressive';

export interface GrowthProfile {
  readonly id: GrowthProfileId;
  /** Player-facing, for the Run Setup selector. */
  readonly label: string;
  /** Player-facing one-liner: what this profile is trying to feel like. */
  readonly blurb: string;
  readonly initialLength: number;
  /**
   * Foods kept on the board at once.
   *
   * This is the traverse-time fix, not a generosity knob. On the owner's
   * record run seconds-per-food climbed from 3.0 to 6.9 (median) while the
   * MEAN quadrupled — most foods stayed quick and a few became enormous. It
   * is that tail that ends runs in irritation, and more foods on the board
   * kills the tail specifically.
   */
  readonly simultaneousFoods: number;
  /** Foods between gene offers. Re-based: a ~48-food run gets ~2 at 20. */
  readonly offerIntervalBase: number;
  /** Validator cadence bound; must track `offerIntervalBase` or honest runs flag. */
  readonly minFoodsPerPick: number;
  /** Base segments gained on eating the n-th food (1-indexed). */
  baseGrowth(n: number): number;
}

/**
 * The shape the owner arrived at by play: fast early, a plateau, then
 * acceleration.
 *
 * The plateau is the design, not a gap between the interesting parts — it
 * holds most of the run's foods and therefore dominates total time. Raising it
 * from +1 to +2 moves the projected run from 8.8 minutes to 5.8 on its own.
 * Non-monotonic difficulty curves have strong precedent: TGM's gravity table
 * climbs, drops back to its starting value at level 200 and re-climbs; NES
 * Tetris holds a flat plateau across levels 19–28, where all skilled play
 * lives; Pac-Man's speed peaks at level 5 of 255 and then decreases.
 */
function stepped(
  early: number,
  earlyUntil: number,
  plateau: number,
  plateauUntil: number,
  accelEvery: number,
  cap: number
): (n: number) => number {
  return (n: number) => {
    if (n < earlyUntil) return early;
    if (n < plateauUntil) return plateau;
    return Math.min(cap, plateau + Math.floor((n - plateauUntil) / accelEvery));
  };
}

export const GROWTH_PROFILES: Readonly<Record<GrowthProfileId, GrowthProfile>> = {
  /**
   * THE CONTROL. Byte-identical to the shipped game, and a test asserts it.
   * Note a baseline run still ends sooner than it used to, because Rule 15
   * made INFUSE grow the body — that is D4 doing its work, not a lab artefact.
   */
  baseline: {
    id: 'baseline',
    label: 'Classic',
    blurb: 'The game as it shipped: one food, one segment, no hurry.',
    initialLength: 3,
    simultaneousFoods: 1,
    offerIntervalBase: 20,
    minFoodsPerPick: 15,
    baseGrowth: () => 1,
  },

  /** Projected: pressure at ~1:06, run ending near 3:12, ~48 foods. */
  tuned: {
    id: 'tuned',
    label: 'Tuned',
    blurb: 'Grow fast, settle, then the board closes on you.',
    initialLength: 3,
    simultaneousFoods: 3,
    offerIntervalBase: 10,
    minFoodsPerPick: 8,
    baseGrowth: stepped(6, 12, 2, 32, 6, 8),
  },

  /** Projected: pressure at ~1:06, run ending near 2:48, ~42 foods. */
  aggressive: {
    id: 'aggressive',
    label: 'Aggressive',
    blurb: 'Short and vicious. The board fills before you are ready.',
    initialLength: 3,
    simultaneousFoods: 3,
    offerIntervalBase: 8,
    minFoodsPerPick: 6,
    baseGrowth: stepped(8, 10, 2, 28, 5, 10),
  },
} as const;

export const DEFAULT_GROWTH_PROFILE: GrowthProfileId = 'baseline';

/**
 * Total, and never throws. An unrecognised, absent or malformed id resolves to
 * `baseline` — the shipped behaviour — so a stamp written by a future build,
 * or no stamp at all, can never change how a run settles unexpectedly.
 */
export function resolveGrowthProfile(id: unknown): GrowthProfile {
  if (typeof id === 'string' && id in GROWTH_PROFILES) {
    return GROWTH_PROFILES[id as GrowthProfileId];
  }
  return GROWTH_PROFILES[DEFAULT_GROWTH_PROFILE];
}

export function isGrowthProfileId(value: unknown): value is GrowthProfileId {
  return typeof value === 'string' && value in GROWTH_PROFILES;
}

/**
 * Base segments gained on eating the n-th food, before gene and anomaly
 * extras (Overgrowth, Bulk Up, the `overgrown` condition) are added on top.
 *
 * THE ONE FUNCTION. Both the engine and `computeLengthTrace` call this. Do not
 * inline it, do not reimplement it, do not read the profile fields directly to
 * compute growth — a second copy is how the two models drift apart, and a
 * length drift is what takes a validated run away from a player who earned it.
 */
export function baseGrowthForFood(profile: GrowthProfile, n: number): number {
  if (!Number.isFinite(n) || n < 1) return profile.baseGrowth(1);
  return Math.max(0, Math.floor(profile.baseGrowth(n)));
}
