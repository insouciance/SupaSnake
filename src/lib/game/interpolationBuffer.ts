/**
 * Tick-alpha interpolation buffer - the fluidity core of the game board.
 *
 * The engine ticks on a timer (getSpeed() ms); the renderer runs at display
 * refresh. Instead of lerp-chasing targets (which lags a full ease behind
 * every tick at high speeds), the renderer reads BOTH the previous and the
 * current tick's segment positions and blends them by exact elapsed-time
 * alpha, so the snake is always precisely between the two authoritative
 * grid states - no drift, no rubber-banding, no per-segment desync.
 *
 * Contract:
 * - Pure TS module (no three.js/React) - unit-tested in isolation.
 * - The buffer lives in a React ref, NEVER in zustand: writes happen every
 *   engine tick and reads happen every animation frame; neither may cause
 *   React work.
 * - Zero allocations while within capacity. If Rule-15 growth exceeds the
 *   current plane, `recordTick` grows both arrays geometrically rather than
 *   silently dropping the tail; that rare engine-tick allocation is safer
 *   than a fixed cap that becomes false as logical length exceeds board area.
 * - Growth safety: segments that appear this tick (eat/grow) seed
 *   prev = curr, so new tail pieces pop in at their cell instead of
 *   streaking across the board from stale memory.
 * - Pause/late-tick safety: `getAlpha` clamps to [0, 1], so a stalled or
 *   paused loop simply rests at the last authoritative state.
 * - `getAlpha` is elapsed-time truth and stays that way. WHEN inside the
 *   interval the head is drawn is a separate, re-timable decision that lives
 *   in `arrivalEasing.ts` (ET-1): renderers read `getAlpha`, map it through
 *   `arrivalMotion`/`arrivalTransition`, and pass the result here.
 * - Two position samplers, because ET-1b's glide needs an anchor prev/curr
 *   cannot supply. `getInterpolatedX/Z` blend prev -> curr and treat motion
 *   above 1 as a bounded overshoot; `getGlideX/Z` treat it as real travel
 *   toward the cell the segment is about to occupy. Handing a glide motion to
 *   the wrong one extrapolates along the INCOMING direction, which is wrong at
 *   exactly the corners that matter - so they are separate functions and the
 *   caller picks by mode rather than passing a flag.
 * - The outbound anchor is free for the body: index i moves to index i-1's
 *   current cell every tick, growth or not, so it is already in `curr`. Only
 *   the head has no segment ahead of it, and the page publishes its next
 *   direction through `setHeadOutbound`. That is a READ of engine intention;
 *   nothing here can write to the engine.
 *
 * This module imports one number from `arrivalEasing.ts` - glide's motion at
 * the end of a tick - because a turn admitted mid-glide has to finish bending
 * exactly when the interval does. It imports no curve: the timing decision
 * still belongs entirely to that module.
 */

import { GLIDE_MOTION_AT_TICK_END } from './arrivalEasing';
import type { Position } from './SnakeGameLogic';

/** Initial segment capacity. Logical length may exceed the 400 board cells. */
export const INTERPOLATION_CAPACITY = 400;

export interface InterpolationBuffer {
  /** Positions at the PREVIOUS tick, packed [x0, z0, x1, z1, ...] */
  prev: Float32Array;
  /** Positions at the CURRENT tick, packed the same way */
  curr: Float32Array;
  /** Number of segments recorded in `curr` */
  count: number;
  /** Number of segments represented in `prev` (needed for cell transitions). */
  prevCount: number;
  /** Whether at least one authoritative snapshot has been recorded. */
  initialized: boolean;
  /** Timestamp (performance.now() domain) of the last recordTick */
  tickAt: number;
  /** Milliseconds until the next tick: the engine's getSpeed() read AFTER
   *  the tick ran, which is the exact interval the loop re-arms with */
  tickInterval: number;
  /**
   * Unit grid direction the NEXT tick will move the HEAD in - glide's outbound
   * anchor for segment 0 (ET-1b). Zero is a legitimate value: it means the
   * next tick moves the head nowhere (the phase gate's arrival beat), and the
   * head correctly comes to rest on its cell instead of leaning off it.
   */
  headOutboundX: number;
  headOutboundZ: number;
  /**
   * The outbound the head was aiming at when the current one was admitted, and
   * the motion at which that happened. A turn admitted while the head is
   * already past its cell centre would otherwise step the head sideways by up
   * to 0.7 cells in a single frame; instead the aim bends from here to there
   * over the interval's remainder, arriving exactly at the exit edge so the
   * next tick still starts where this one ended.
   */
  headOutboundPriorX: number;
  headOutboundPriorZ: number;
  headOutboundTurnAt: number;
  /**
   * Whether a producer declares the head's next move at all. Distinguishes
   * "the engine says the head stays put" (known, zero) from "nothing is
   * publishing" (the arena prototypes, which fall back to the live heading).
   */
  headOutboundKnown: boolean;
  /**
   * Whether the head changed cell on the most recent stamp.
   *
   * The outbound lead is only legitimate for a head that is actually
   * travelling. A stationary stamp - the first snapshot of a run, the ready
   * screen, a paused loop re-stamping an unmoved snake - must draw the head on
   * its tile centre, not half a cell along its facing. Anticipating a move
   * that is not happening is what put the head "already ahead by about half a
   * cell" at spawn.
   */
  headMoved: boolean;
  /**
   * Whether the board is at rest under a pause overlay.
   *
   * A paused loop keeps stamping an unmoved snake, and glide's lead is drawn
   * against a live alpha, so the picture kept re-animating a move that was not
   * happening. `headMoved` already stops the oscillation; this carries the
   * RATIFIED POSE on top of it - everything settles onto its tile centre, and
   * picks the glide back up when play resumes.
   */
  paused: boolean;
  /** When `paused` last changed, for the settle/resume blend. */
  pausedChangedAt: number;
}

export function createInterpolationBuffer(
  capacity: number = INTERPOLATION_CAPACITY
): InterpolationBuffer {
  return {
    prev: new Float32Array(capacity * 2),
    curr: new Float32Array(capacity * 2),
    count: 0,
    prevCount: 0,
    initialized: false,
    tickAt: 0,
    tickInterval: 0,
    headOutboundX: 0,
    headOutboundZ: 0,
    headOutboundPriorX: 0,
    headOutboundPriorZ: 0,
    headOutboundTurnAt: 1,
    headOutboundKnown: false,
    headMoved: false,
    paused: false,
    // Far enough in the past that a buffer nobody has paused reads as fully
    // settled - including in the first frames of a page, where
    // `performance.now()` is still smaller than the settle beat.
    pausedChangedAt: Number.NEGATIVE_INFINITY,
  };
}

/** Forget all recorded state (call on game start so the first tick of a
 *  new run never blends against the previous run's corpse). */
export function resetInterpolationBuffer(buffer: InterpolationBuffer): void {
  buffer.count = 0;
  buffer.prevCount = 0;
  buffer.initialized = false;
  buffer.tickAt = 0;
  buffer.tickInterval = 0;
  buffer.headOutboundX = 0;
  buffer.headOutboundZ = 0;
  buffer.headOutboundPriorX = 0;
  buffer.headOutboundPriorZ = 0;
  buffer.headOutboundTurnAt = 1;
  // A new run's first frames must not lean toward the dead snake's next cell.
  buffer.headOutboundKnown = false;
  buffer.headMoved = false;
  buffer.paused = false;
  buffer.pausedChangedAt = Number.NEGATIVE_INFINITY;
}

/**
 * Stamp one engine tick into the buffer.
 *
 * Swaps curr into prev (array swap - no copy, no allocation), writes the
 * new snake into curr, and seeds prev = curr for any segment index that
 * did not exist last tick (growth). `tickInterval` must be the engine's
 * getSpeed() AFTER this tick - the denominator the render alpha divides by.
 */
export function recordTick(
  buffer: InterpolationBuffer,
  snake: readonly Position[],
  tickInterval: number,
  now: number
): void {
  const oldCount = buffer.count;
  const hadSnapshot = buffer.initialized;
  ensureInterpolationCapacity(buffer, snake.length);
  const count = snake.length;

  // Double-buffer swap: last tick's curr becomes prev
  const swap = buffer.prev;
  buffer.prev = buffer.curr;
  buffer.curr = swap;

  const curr = buffer.curr;
  const prev = buffer.prev;
  for (let i = 0; i < count; i++) {
    curr[i * 2] = snake[i].x;
    curr[i * 2 + 1] = snake[i].z;
  }
  // Growth: new tail indices had no previous position - seed prev = curr
  // so they render at their cell instead of streaking from stale data
  for (let i = hadSnapshot ? oldCount : 0; i < count; i++) {
    prev[i * 2] = curr[i * 2];
    prev[i * 2 + 1] = curr[i * 2 + 1];
  }

  // The first snapshot seeds prev = curr, so it reads as stationary and the
  // head rests on its tile - which is the correct picture on the ready screen.
  buffer.headMoved =
    count > 0 && (curr[0] !== prev[0] || curr[1] !== prev[1]);

  buffer.count = count;
  // The first snapshot seeds prev === curr, so it is semantically stable, not
  // 400 entering cells. Thereafter this is the old authoritative count.
  buffer.prevCount = hadSnapshot ? oldCount : count;
  buffer.initialized = true;
  buffer.tickAt = now;
  buffer.tickInterval = tickInterval;
  // A bend admitted during the last interval finished when that interval did.
  // Carrying it across the boundary would bend the new one toward a cell the
  // engine has already moved past.
  buffer.headOutboundPriorX = buffer.headOutboundX;
  buffer.headOutboundPriorZ = buffer.headOutboundZ;
  buffer.headOutboundTurnAt = 1;
}

function ensureInterpolationCapacity(
  buffer: InterpolationBuffer,
  required: number
): void {
  const current = buffer.prev.length >> 1;
  if (required <= current) return;
  let next = Math.max(1, current);
  while (next < required) next *= 2;
  const prev = new Float32Array(next * 2);
  const curr = new Float32Array(next * 2);
  prev.set(buffer.prev);
  curr.set(buffer.curr);
  buffer.prev = prev;
  buffer.curr = curr;
}

/**
 * Blend factor for the current frame: 0 = at prev, 1 = at curr.
 * Clamped to [0, 1] so paused loops and late ticks rest at the current
 * authoritative state; a zero/negative interval (never armed) reads 1.
 */
export function getAlpha(buffer: InterpolationBuffer, now: number): number {
  if (buffer.tickInterval <= 0) return 1;
  const alpha = (now - buffer.tickAt) / buffer.tickInterval;
  if (alpha <= 0) return 0;
  if (alpha >= 1) return 1;
  return alpha;
}

/**
 * How far past `curr` a blend of `alpha > 1` may carry a segment.
 *
 * ET-1's settle overshoots the logical cell by a fraction of a cell and
 * springs back (see arrivalEasing.ts). Expressed as a plain lerp that
 * overshoot would be a fraction of the prev->curr DELTA, which is one cell
 * for an ordinary move but nearly the whole board for a COSMIC torus wrap -
 * 6% of nineteen cells is more than a full cell flung past the far edge.
 *
 * So the overshoot is denominated in CELLS along the travel axis and capped
 * at one: a normal move is bit-for-bit the old lerp, a wrap gets the same
 * small settle as everything else. For `alpha <= 1` this term is exactly
 * zero and the expression reduces to the original `p + (c - p) * alpha`.
 */
function boundedOvershoot(delta: number, alpha: number): number {
  if (alpha <= 1) return 0;
  const unit = delta > 1 ? 1 : delta < -1 ? -1 : delta;
  return unit * (alpha - 1);
}

/**
 * Interpolated world-grid X of segment `index` at blend `alpha`.
 *
 * `alpha` above 1 is ET-1's arrival overshoot, bounded as described above.
 */
export function getInterpolatedX(
  buffer: InterpolationBuffer,
  index: number,
  alpha: number
): number {
  const p = buffer.prev[index * 2];
  const delta = buffer.curr[index * 2] - p;
  return p + delta * (alpha < 1 ? alpha : 1) + boundedOvershoot(delta, alpha);
}

/** Interpolated world-grid Z of segment `index` at blend `alpha`. */
export function getInterpolatedZ(
  buffer: InterpolationBuffer,
  index: number,
  alpha: number
): number {
  const p = buffer.prev[index * 2 + 1];
  const delta = buffer.curr[index * 2 + 1] - p;
  return p + delta * (alpha < 1 ? alpha : 1) + boundedOvershoot(delta, alpha);
}

// -----------------------------------------------------------------------------
// ET-1b - the glide sampler
// -----------------------------------------------------------------------------

/**
 * One axis of a one-cell grid step, reduced to a unit and corrected for the
 * torus.
 *
 * A COSMIC wrap's raw delta is -(gridSize - 1) for a step of +1, so any
 * magnitude above one cell is a wrap and its true direction is the OPPOSITE of
 * its sign. Ordinary steps are already -1, 0 or +1 and pass through untouched.
 */
function unitStep(delta: number): number {
  if (delta > 1) return -1;
  if (delta < -1) return 1;
  return delta;
}

/**
 * The head's aim, part-way through a bend admitted mid-glide.
 *
 * Linear in motion and reaching `target` exactly at the exit edge: the tick
 * boundary stays continuous no matter when the press landed. Between two
 * perpendicular headings the blended vector is shorter than either (0.707 at
 * the midpoint), so the head eases through the corner rather than pivoting on
 * it - a bounded, sub-interval dip that reads as weight in a turn, and the
 * only place in glide where the drawn speed is not exactly one cell per tick.
 */
function turnBlend(
  prior: number,
  target: number,
  turnAt: number,
  motion: number
): number {
  const window = GLIDE_MOTION_AT_TICK_END - turnAt;
  if (window <= 0) return target;
  const progress = (motion - turnAt) / window;
  if (progress <= 0) return prior;
  if (progress >= 1) return target;
  return prior + (target - prior) * progress;
}

/**
 * Where segment `index` is heading next, per axis, as a unit grid direction.
 *
 * Body segments read it out of `curr`: index i occupies index i-1's current
 * cell on the next tick, growth or not, which is what makes the coil continue
 * across a tick boundary with no position step. The head has no segment ahead,
 * so it uses the admitted next direction when the page is publishing one and
 * otherwise keeps its current heading.
 */
function glideOutboundX(
  buffer: InterpolationBuffer,
  index: number,
  motion: number
): number {
  if (index > 0) {
    return unitStep(buffer.curr[(index - 1) * 2] - buffer.curr[index * 2]);
  }
  if (!buffer.headOutboundKnown) return unitStep(buffer.curr[0] - buffer.prev[0]);
  return turnBlend(
    buffer.headOutboundPriorX,
    buffer.headOutboundX,
    buffer.headOutboundTurnAt,
    motion
  );
}

function glideOutboundZ(
  buffer: InterpolationBuffer,
  index: number,
  motion: number
): number {
  if (index > 0) {
    return unitStep(
      buffer.curr[(index - 1) * 2 + 1] - buffer.curr[index * 2 + 1]
    );
  }
  if (!buffer.headOutboundKnown) return unitStep(buffer.curr[1] - buffer.prev[1]);
  return turnBlend(
    buffer.headOutboundPriorZ,
    buffer.headOutboundZ,
    buffer.headOutboundTurnAt,
    motion
  );
}

/**
 * World-grid X of segment `index` at glide `motion` (arrivalEasing's
 * `glideArrival`, in [0.5, 1.5]).
 *
 * Below 1 this is the existing prev -> curr blend, expression for expression -
 * including the way a torus wrap is presented, which glide deliberately does
 * not change. Above 1 it is travel toward the next cell at the same rate.
 */
export function getGlideX(
  buffer: InterpolationBuffer,
  index: number,
  motion: number
): number {
  const p = buffer.prev[index * 2];
  const c = buffer.curr[index * 2];
  if (motion <= 1) return p + (c - p) * motion;
  // A snake that did not move has nothing to lead toward.
  if (!buffer.headMoved) return c;
  return c + (motion - 1) * glideOutboundX(buffer, index, motion);
}

/** World-grid Z of segment `index` at glide `motion`. */
export function getGlideZ(
  buffer: InterpolationBuffer,
  index: number,
  motion: number
): number {
  const p = buffer.prev[index * 2 + 1];
  const c = buffer.curr[index * 2 + 1];
  if (motion <= 1) return p + (c - p) * motion;
  if (!buffer.headMoved) return c;
  return c + (motion - 1) * glideOutboundZ(buffer, index, motion);
}

/**
 * How long the board takes to compose itself onto tile centres when play
 * stops, and to pick the glide back up when it starts. Short enough to read as
 * the board settling rather than as an animation of its own.
 */
export const REST_SETTLE_MS = 180;

/**
 * How far the drawn board is toward its rest pose: 0 = the live glide,
 * 1 = everything composed on tile centres.
 *
 * Smoothstepped, and that is not a contradiction of ET-1b's no-easing law:
 * the law governs the per-tick MOTION clock, which must stay constant-rate
 * because it repeats forever at the tick rate. This is a one-shot transition
 * between two poses, and easing both ends is what keeps the pause and the
 * resume from being the two snaps the settle exists to remove.
 */
export function getRestSettle(buffer: InterpolationBuffer, now: number): number {
  const elapsed = now - buffer.pausedChangedAt;
  let t = REST_SETTLE_MS > 0 ? elapsed / REST_SETTLE_MS : 1;
  if (t <= 0) t = 0;
  else if (t >= 1) t = 1;
  const eased = t * t * (3 - 2 * t);
  return buffer.paused ? eased : 1 - eased;
}

/** Declare whether the board is at rest. Idempotent - re-declaring the same
 *  state does not restart the settle. */
export function setPaused(
  buffer: InterpolationBuffer,
  paused: boolean,
  now: number
): void {
  if (buffer.paused === paused) return;
  buffer.paused = paused;
  buffer.pausedChangedAt = now;
}

/**
 * Blend a drawn value toward its rest pose. Every surface glued to the head
 * settles through this one function, or the guide detaches from the creature
 * for the length of the settle.
 */
export function settleToward(
  value: number,
  rest: number,
  settle: number
): number {
  if (settle <= 0) return value;
  if (settle >= 1) return rest;
  return value + (rest - value) * settle;
}

/**
 * The unit direction of the head's most recent move, wrap-corrected.
 *
 * This is the travel axis the cell behind the head extrudes along - not the
 * outbound (where it is going next) but the inbound (how it got here), which
 * is the axis the vacated tile has to be filled along.
 */
export function getHeadStepX(buffer: InterpolationBuffer): number {
  return unitStep(buffer.curr[0] - buffer.prev[0]);
}

export function getHeadStepZ(buffer: InterpolationBuffer): number {
  return unitStep(buffer.curr[1] - buffer.prev[1]);
}

/**
 * Publish the direction the next tick will move the head in.
 *
 * `motion` is the glide motion at the moment of the call, so a turn admitted
 * after the head has passed its cell centre bends from the aim it is actually
 * drawing rather than snapping to the new one. Called once per tick and once
 * per admitted press - never on the render path, and never with anything the
 * engine reads back.
 */
export function setHeadOutbound(
  buffer: InterpolationBuffer,
  x: number,
  z: number,
  motion: number
): void {
  if (
    buffer.headOutboundKnown &&
    x === buffer.headOutboundX &&
    z === buffer.headOutboundZ
  ) {
    return;
  }
  if (buffer.headOutboundKnown && motion > 1) {
    // Mid-glide retarget: freeze the aim as currently drawn, then bend from it.
    const priorX = glideOutboundX(buffer, 0, motion);
    const priorZ = glideOutboundZ(buffer, 0, motion);
    buffer.headOutboundPriorX = priorX;
    buffer.headOutboundPriorZ = priorZ;
    buffer.headOutboundTurnAt = motion;
  } else {
    buffer.headOutboundPriorX = x;
    buffer.headOutboundPriorZ = z;
    buffer.headOutboundTurnAt = 1;
  }
  buffer.headOutboundX = x;
  buffer.headOutboundZ = z;
  buffer.headOutboundKnown = true;
}
