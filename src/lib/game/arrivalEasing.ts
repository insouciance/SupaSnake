/**
 * ET-1 - FRONT-LOADED ARRIVAL. The render stops lying by one cell.
 *
 * THE DEFECT (docs/ENGINE_ARCHITECTURE_REVIEW.md, root cause 1). The engine
 * ticks, moves the head, and resolves collisions; the renderer then animates
 * that already-executed move across the FOLLOWING interval
 * (`getAlpha` = (now - tickAt) / tickInterval). Blended linearly - or with a
 * symmetric smoothstep, which spends its time budget evenly around the
 * midpoint - the visual head only ARRIVES at its logical cell at the instant
 * the NEXT tick fires. For the whole reaction window the screen shows the head
 * still travelling toward a cell the simulation already left. With a wall one
 * cell ahead the player sees a snake standing on the last safe tile at the
 * exact moment the engine executes the fatal move. The owner's words: "the
 * head just starts to move when the tick is already on the next tile."
 *
 * THE FIX. Re-time the blend - not the tick, not the journal, not one byte of
 * the deterministic core - so the head COMPLETES its cell traversal early in
 * the interval and then settles. The eye therefore dwells on the true board
 * state for the majority of every interval, which is the contract human vision
 * already assumes.
 *
 * THE CURVE. Two phases, C1-continuous with each other AND across the tick
 * boundary (both ends of an interval have zero velocity, so hop N+1 begins
 * exactly where hop N stopped moving - no velocity step, no jerk, no
 * teleport-then-freeze):
 *
 *   DRIVE, alpha in [0, ARRIVAL_ALPHA], t = alpha / ARRIVAL_ALPHA:
 *     f(t) = t^2 * (a*t + b),  a = v1 - 2,  b = 3 - v1
 *     the unique cubic with f(0)=0, f'(0)=0, f(1)=1, f'(1)=v1.
 *     Peak speed ~3.2 cells per interval at t ~ 0.53 - fast primary motion
 *     with a real acceleration and deceleration in it, not a jump cut.
 *
 *   SETTLE, alpha in (ARRIVAL_ALPHA, 1], s = (alpha - ARRIVAL_ALPHA)/(1 - ARRIVAL_ALPHA):
 *     g(s) = 1 + K * s * (1 - s)^2
 *     the residual velocity v1 carries the head a hair PAST its cell and a
 *     spring pulls it back to rest exactly at the next tick. b(s)=s(1-s)^2
 *     peaks at s=1/3 with value 4/27, so K is solved backwards from the
 *     overshoot the designer actually wants (ARRIVAL_OVERSHOOT), and v1 is
 *     solved backwards from K. The two named constants are therefore the two
 *     things a human judges by eye - when it lands, and how hard - and every
 *     other coefficient is derived.
 *
 * WHY NOT AN EASE-OUT THAT SIMPLY STOPS. Arrival at rest with a dead
 * remainder reads as a strobe: pose, pose, pose. The overshoot-and-return is
 * what makes it a HOP with weight - fast primary motion, long settle, the
 * Nintendo grammar the review cites and the chunky INK & AMBER / 90s comic
 * language the board already speaks.
 *
 * WHY THE OVERSHOOT IS IN POSITION AND NOT IN SCALE. A squash on arrival was
 * considered and deliberately not taken: at 24px the head already carries
 * voxel eyes, cosmetics and a constant-world-width ink hull, and a
 * non-uniform scale visibly deforms that outline's silhouette mid-hop - it
 * would argue with the cube law the 90s pass just ratified. Position carries
 * the character at zero geometric risk.
 *
 * DETERMINISM. Nothing here is reachable from the engine. This module is
 * imported only by renderers; the tick loop, the journal and the server
 * replay never see it. ET-1 is byte-identical on the wire.
 *
 * Contract:
 * - Pure TS (no three.js, no React, no `window`) - unit-tested in isolation.
 *   The dev A/B reads `window.location.search` at its CALL SITE and hands the
 *   string in, so this module stays environment-free.
 * - `motion` may exceed 1 during the settle. That is the overshoot, and
 *   `getInterpolatedX/Z` bound the resulting extrapolation to one cell.
 * - `transition` (enter/leave scale, vacancy blends) is clamped to [0, 1]:
 *   a scale must never overshoot, or a growing cell pops past its own tile.
 */

/** Which arrival timing the renderers are using. */
export type ArrivalMode = 'front' | 'classic';

/**
 * The branch default, and the one ET-1 proposes to ship. `classic` exists so
 * the owner can A/B the two by playing them back to back; it reproduces the
 * pre-ET-1 timing exactly (raw linear head, symmetric smoothstep transitions).
 */
export const DEFAULT_ARRIVAL_MODE: ArrivalMode = 'front';

/**
 * The arrival fraction: the share of a tick interval spent travelling. The
 * review's recommendation is ~0.45, which leaves the remaining 55% of every
 * interval showing the head where the simulation actually put it.
 */
export const ARRIVAL_ALPHA = 0.45;

/**
 * Peak settle overshoot, in CELLS past the logical cell. 0.06 of a cell is
 * ~1.4px at the 24px cube size the board reads at - felt as weight, never
 * read as a wrong position, and far inside the head's own half-width (0.45)
 * so the cube cannot appear to leave its tile.
 */
export const ARRIVAL_OVERSHOOT = 0.06;

/** Maximum of b(s) = s(1-s)^2 on [0,1], attained at s = 1/3. */
const SETTLE_BUMP_PEAK = 4 / 27;

/**
 * Drive-phase exit slope (in drive-local time), solved so the settle's peak
 * is exactly ARRIVAL_OVERSHOOT. Derivation:
 *   overshoot = K * SETTLE_BUMP_PEAK  and  K = v1 * (1 - A) / A
 *   => v1 = overshoot * A / ((1 - A) * SETTLE_BUMP_PEAK)
 */
const DRIVE_EXIT_SLOPE =
  (ARRIVAL_OVERSHOOT * ARRIVAL_ALPHA) /
  ((1 - ARRIVAL_ALPHA) * SETTLE_BUMP_PEAK);

/** Settle gain K, fixed by velocity continuity at the arrival instant. */
const SETTLE_GAIN = (DRIVE_EXIT_SLOPE * (1 - ARRIVAL_ALPHA)) / ARRIVAL_ALPHA;

/** Cubic coefficients of the drive phase (see the header derivation). */
const DRIVE_CUBIC = DRIVE_EXIT_SLOPE - 2;
const DRIVE_QUADRATIC = 3 - DRIVE_EXIT_SLOPE;

/**
 * The ET-1 movement curve. 0 at alpha 0, exactly 1 at ARRIVAL_ALPHA, then a
 * single soft overshoot that returns to exactly 1 (at rest) by alpha 1.
 *
 * Monotone on the drive phase - the head never backs up on its way to the
 * cell - and never further than ARRIVAL_OVERSHOOT from the cell afterwards.
 */
export function frontLoadedArrival(alpha: number): number {
  if (alpha <= 0) return 0;
  if (alpha >= 1) return 1;
  if (alpha <= ARRIVAL_ALPHA) {
    const t = alpha / ARRIVAL_ALPHA;
    return t * t * (DRIVE_CUBIC * t + DRIVE_QUADRATIC);
  }
  const s = (alpha - ARRIVAL_ALPHA) / (1 - ARRIVAL_ALPHA);
  const rest = 1 - s;
  return 1 + SETTLE_GAIN * s * rest * rest;
}

/** Today's symmetric smoothstep - the transition curve `classic` restores. */
export function symmetricSmoothstep(alpha: number): number {
  if (alpha <= 0) return 0;
  if (alpha >= 1) return 1;
  return alpha * alpha * (3 - 2 * alpha);
}

/**
 * Position blend for the head (and anything glued to it). May exceed 1 during
 * the settle; `getInterpolatedX/Z` bound that extrapolation to one cell so a
 * COSMIC torus wrap - whose prev/curr differ by most of the board - cannot
 * fling the head past the far edge.
 */
export function arrivalMotion(alpha: number, mode: ArrivalMode): number {
  return mode === 'classic' ? alpha : frontLoadedArrival(alpha);
}

/**
 * Blend for everything denominated in [0,1] rather than in cells: the
 * enter/leave scale of trail cells and the vacancy/representative taper.
 *
 * It is the SAME clock as the head - a body that eased on a different curve
 * would accordion against a head that has already landed - just clamped,
 * because a scale that overshoots reads as a cell popping out of its tile.
 */
export function arrivalTransition(alpha: number, mode: ArrivalMode): number {
  if (mode === 'classic') return symmetricSmoothstep(alpha);
  const value = frontLoadedArrival(alpha);
  return value > 1 ? 1 : value;
}

// -----------------------------------------------------------------------------
// The dev A/B pin
// -----------------------------------------------------------------------------

let activeMode: ArrivalMode = DEFAULT_ARRIVAL_MODE;

/** The mode every renderer reads, once per frame. */
export function getArrivalMode(): ArrivalMode {
  return activeMode;
}

export function setArrivalMode(mode: ArrivalMode): void {
  activeMode = mode;
}

/** Restore the shipped default (run start, and test teardown). */
export function resetArrivalMode(): void {
  activeMode = DEFAULT_ARRIVAL_MODE;
}

export function parseArrivalMode(
  value: string | null | undefined
): ArrivalMode | null {
  return value === 'front' || value === 'classic' ? value : null;
}

/**
 * Dev A/B: honour `?arrival=classic|front`. An unrecognised or absent value
 * leaves the active mode alone, so a URL that says nothing about arrival gets
 * the shipped easing.
 *
 * Callers gate this on a non-production build. The pin is a judgement
 * instrument for the owner's feel session, never a player-facing switch: what
 * ships is one ratified motion grammar, identical for everyone.
 */
export function applyArrivalModeFromSearch(
  search: string | null | undefined
): ArrivalMode {
  const params = new URLSearchParams(search ?? '');
  const mode = parseArrivalMode(params.get('arrival'));
  if (mode) setArrivalMode(mode);
  return activeMode;
}
