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
 * - Zero allocations after construction: `recordTick` swaps the two
 *   preallocated Float32Arrays and overwrites in place.
 * - Growth safety: segments that appear this tick (eat/grow) seed
 *   prev = curr, so new tail pieces pop in at their cell instead of
 *   streaking across the board from stale memory.
 * - Pause/late-tick safety: `getAlpha` clamps to [0, 1], so a stalled or
 *   paused loop simply rests at the last authoritative state.
 */

import type { Position } from './SnakeGameLogic';

/** Segment capacity - comfortably above any reachable snake length on a
 *  20x20 board (400 cells). Snakes longer than this clamp to capacity. */
export const INTERPOLATION_CAPACITY = 400;

export interface InterpolationBuffer {
  /** Positions at the PREVIOUS tick, packed [x0, z0, x1, z1, ...] */
  prev: Float32Array;
  /** Positions at the CURRENT tick, packed the same way */
  curr: Float32Array;
  /** Number of segments recorded in `curr` */
  count: number;
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
    tickAt: 0,
    tickInterval: 0,
  };
}

/** Forget all recorded state (call on game start so the first tick of a
 *  new run never blends against the previous run's corpse). */
export function resetInterpolationBuffer(buffer: InterpolationBuffer): void {
  buffer.count = 0;
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
  const capacity = buffer.prev.length >> 1;
  const prevCount = buffer.count;
  const count = Math.min(snake.length, capacity);

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
  for (let i = prevCount; i < count; i++) {
    prev[i * 2] = curr[i * 2];
    prev[i * 2 + 1] = curr[i * 2 + 1];
  }

  buffer.count = count;
  buffer.tickAt = now;
  buffer.tickInterval = tickInterval;
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

/** Interpolated world-grid X of segment `index` at blend `alpha`. */
export function getInterpolatedX(
  buffer: InterpolationBuffer,
  index: number,
  alpha: number
): number {
  const p = buffer.prev[index * 2];
  return p + (buffer.curr[index * 2] - p) * alpha;
}

/** Interpolated world-grid Z of segment `index` at blend `alpha`. */
export function getInterpolatedZ(
  buffer: InterpolationBuffer,
  index: number,
  alpha: number
): number {
  const p = buffer.prev[index * 2 + 1];
  return p + (buffer.curr[index * 2 + 1] - p) * alpha;
}
