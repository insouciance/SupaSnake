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
 */

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

  buffer.count = count;
  // The first snapshot seeds prev === curr, so it is semantically stable, not
  // 400 entering cells. Thereafter this is the old authoritative count.
  buffer.prevCount = hadSnapshot ? oldCount : count;
  buffer.initialized = true;
  buffer.tickAt = now;
  buffer.tickInterval = tickInterval;
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
