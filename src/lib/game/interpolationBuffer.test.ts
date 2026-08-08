/**
 * Interpolation buffer - the fluidity core's math.
 *
 * These tests pin the exact contract the render loop depends on:
 * double-buffer copy semantics, growth seeding (prev = curr for new tail
 * indices), alpha clamping (incl. zero-interval and late ticks), reset,
 * and geometric growth beyond the 400-segment initial capacity.
 */

import { describe, it, expect } from '@jest/globals';
import {
  INTERPOLATION_CAPACITY,
  createInterpolationBuffer,
  getAlpha,
  getGlideX,
  getGlideZ,
  getInterpolatedX,
  getInterpolatedZ,
  recordTick,
  resetInterpolationBuffer,
  setHeadOutbound,
  type InterpolationBuffer,
} from './interpolationBuffer';
import {
  GLIDE_MOTION_AT_TICK_END,
  GLIDE_MOTION_AT_TICK_START,
  glideArrival,
} from './arrivalEasing';

const seg = (x: number, z: number) => ({ x, y: 0, z });

type Cell = readonly [number, number];

/** The snake occupying `length` cells of `path`, `step` moves in. */
function snakeAt(path: readonly Cell[], step: number, length: number) {
  const body = [];
  for (let i = 0; i < length; i += 1) {
    const [x, z] = path[Math.max(0, step - i)];
    body.push(seg(x, z));
  }
  return body;
}

/**
 * The unit direction of the move that lands on `path[step]`. Off either end of
 * the script there is no next move, which is the zero outbound the engine
 * publishes for a tick that moves the head nowhere.
 */
function headingInto(path: readonly Cell[], step: number): Cell {
  if (step <= 0 || step >= path.length) return [0, 0];
  const [px, pz] = path[step - 1];
  const [x, z] = path[step];
  const unit = (d: number) => (d > 1 ? -1 : d < -1 ? 1 : d);
  return [unit(x - px), unit(z - pz)];
}

/**
 * Walk `path` through the buffer as the game page does: stamp the tick, then
 * publish the direction the NEXT tick will move the head in.
 */
function playTo(
  buffer: InterpolationBuffer,
  path: readonly Cell[],
  step: number,
  length: number
): void {
  for (let k = 0; k <= step; k += 1) {
    recordTick(buffer, snakeAt(path, k, length), 100, k * 100);
    const [dx, dz] = headingInto(path, k + 1);
    setHeadOutbound(buffer, dx, dz, GLIDE_MOTION_AT_TICK_START);
  }
}

/** A straight run, a right turn, a straight, and a left turn. */
const CORNERS: readonly Cell[] = [
  [5, 5],
  [6, 5],
  [7, 5],
  [7, 6],
  [7, 7],
  [6, 7],
  [5, 7],
];

describe('createInterpolationBuffer', () => {
  it('preallocates both planes at capacity 400 by default', () => {
    const buffer = createInterpolationBuffer();
    expect(buffer.prev.length).toBe(INTERPOLATION_CAPACITY * 2);
    expect(buffer.curr.length).toBe(INTERPOLATION_CAPACITY * 2);
    expect(buffer.count).toBe(0);
    expect(buffer.prevCount).toBe(0);
    expect(buffer.initialized).toBe(false);
    expect(buffer.tickAt).toBe(0);
    expect(buffer.tickInterval).toBe(0);
  });
});

describe('recordTick copy semantics', () => {
  it('moves last tick into prev and writes the new snake into curr', () => {
    const buffer = createInterpolationBuffer(8);
    recordTick(buffer, [seg(5, 5), seg(4, 5)], 200, 1000);
    recordTick(buffer, [seg(6, 5), seg(5, 5)], 200, 1200);

    // prev holds tick 1, curr holds tick 2
    expect(Array.from(buffer.prev.subarray(0, 4))).toEqual([5, 5, 4, 5]);
    expect(Array.from(buffer.curr.subarray(0, 4))).toEqual([6, 5, 5, 5]);
    expect(buffer.count).toBe(2);
    expect(buffer.tickAt).toBe(1200);
    expect(buffer.tickInterval).toBe(200);
  });

  it('swaps arrays instead of allocating (zero-allocation contract)', () => {
    const buffer = createInterpolationBuffer(8);
    const a = buffer.prev;
    const b = buffer.curr;
    recordTick(buffer, [seg(1, 1)], 100, 0);
    // The two preallocated arrays are still the only two in play (swapped)
    expect(buffer.prev).toBe(b);
    expect(buffer.curr).toBe(a);
    recordTick(buffer, [seg(2, 1)], 100, 100);
    expect(buffer.prev).toBe(a);
    expect(buffer.curr).toBe(b);
  });

  it('seeds prev = curr for segments that appear on growth (no streaking)', () => {
    const buffer = createInterpolationBuffer(8);
    recordTick(buffer, [seg(5, 5), seg(4, 5)], 200, 0);
    // Snake grows by one: the new tail index must NOT inherit stale memory
    recordTick(buffer, [seg(6, 5), seg(5, 5), seg(4, 5)], 200, 200);

    expect(buffer.count).toBe(3);
    // Existing segments interpolate normally...
    expect(getInterpolatedX(buffer, 0, 0)).toBe(5);
    expect(getInterpolatedX(buffer, 0, 1)).toBe(6);
    // ...the grown tail is pinned at its cell for the whole tick
    expect(getInterpolatedX(buffer, 2, 0)).toBe(4);
    expect(getInterpolatedX(buffer, 2, 0.5)).toBe(4);
    expect(getInterpolatedZ(buffer, 2, 0.37)).toBe(5);
  });

  it('seeds every index on the first tick after creation or reset', () => {
    const buffer = createInterpolationBuffer(8);
    recordTick(buffer, [seg(9, 3), seg(8, 3), seg(7, 3)], 150, 50);
    for (let i = 0; i < 3; i++) {
      expect(getInterpolatedX(buffer, i, 0)).toBe(getInterpolatedX(buffer, i, 1));
      expect(getInterpolatedZ(buffer, i, 0)).toBe(getInterpolatedZ(buffer, i, 1));
    }
  });

  it('shrinks cleanly when the snake gets shorter (reset/new run)', () => {
    const buffer = createInterpolationBuffer(8);
    recordTick(buffer, [seg(1, 1), seg(2, 1), seg(3, 1)], 100, 0);
    recordTick(buffer, [seg(1, 2)], 100, 100);
    expect(buffer.count).toBe(1);
  });

  it('grows geometrically when the snake exceeds capacity', () => {
    const buffer = createInterpolationBuffer(4);
    const snake = Array.from({ length: 10 }, (_, i) => seg(i, 0));
    recordTick(buffer, snake, 100, 0);
    expect(buffer.count).toBe(10);
    expect(buffer.prev.length).toBe(16 * 2);
    expect(buffer.curr.length).toBe(16 * 2);
    expect(getInterpolatedX(buffer, 9, 1)).toBe(9);
  });

  it('growth seeding still applies while capacity expands', () => {
    const buffer = createInterpolationBuffer(4);
    recordTick(buffer, [seg(0, 0), seg(1, 0)], 100, 0);
    const grown = Array.from({ length: 10 }, (_, i) => seg(i + 5, 2));
    recordTick(buffer, grown, 100, 100);
    expect(buffer.count).toBe(10);
    // Every new index is pinned at its cell.
    expect(getInterpolatedX(buffer, 2, 0)).toBe(7);
    expect(getInterpolatedX(buffer, 2, 1)).toBe(7);
    expect(getInterpolatedZ(buffer, 3, 0.5)).toBe(2);
    expect(getInterpolatedX(buffer, 9, 0.25)).toBe(14);
  });

  it('records the previous plane count across growth and shrink', () => {
    const buffer = createInterpolationBuffer(4);
    recordTick(buffer, [seg(0, 0), seg(1, 0)], 100, 0);
    expect(buffer.prevCount).toBe(2); // first snapshot is seeded stable
    recordTick(buffer, [seg(1, 0), seg(0, 0), seg(0, 0)], 100, 100);
    expect(buffer.prevCount).toBe(2);
    recordTick(buffer, [seg(2, 0)], 100, 200);
    expect(buffer.prevCount).toBe(3);
  });
});

describe('getAlpha', () => {
  const buffer = createInterpolationBuffer(4);
  recordTick(buffer, [seg(0, 0)], 200, 1000);

  it('is 0 at the tick instant and 1 at the next tick', () => {
    expect(getAlpha(buffer, 1000)).toBe(0);
    expect(getAlpha(buffer, 1200)).toBe(1);
  });

  it('is linear in between (exact interval denominator)', () => {
    expect(getAlpha(buffer, 1050)).toBeCloseTo(0.25);
    expect(getAlpha(buffer, 1100)).toBeCloseTo(0.5);
    expect(getAlpha(buffer, 1150)).toBeCloseTo(0.75);
  });

  it('clamps late ticks to 1 (pause/stall safety - rest at curr)', () => {
    expect(getAlpha(buffer, 5000)).toBe(1);
  });

  it('clamps clock skew before the tick to 0', () => {
    expect(getAlpha(buffer, 900)).toBe(0);
  });

  it('reads 1 when the interval is zero or was never armed', () => {
    const fresh = createInterpolationBuffer(4);
    expect(getAlpha(fresh, 123)).toBe(1);
    recordTick(fresh, [seg(0, 0)], 0, 100);
    expect(getAlpha(fresh, 150)).toBe(1);
    recordTick(fresh, [seg(0, 0)], -5, 100);
    expect(getAlpha(fresh, 150)).toBe(1);
  });
});

describe('resetInterpolationBuffer', () => {
  it('clears count and timing so a new run starts from scratch', () => {
    const buffer = createInterpolationBuffer(4);
    recordTick(buffer, [seg(3, 3), seg(2, 3)], 200, 500);
    resetInterpolationBuffer(buffer);
    expect(buffer.count).toBe(0);
    expect(buffer.prevCount).toBe(0);
    expect(buffer.initialized).toBe(false);
    expect(buffer.tickAt).toBe(0);
    expect(buffer.tickInterval).toBe(0);
    expect(getAlpha(buffer, 999)).toBe(1);

    // The first tick of the new run seeds prev = curr for every index
    recordTick(buffer, [seg(10, 10)], 200, 1000);
    expect(getInterpolatedX(buffer, 0, 0)).toBe(10);
    expect(getInterpolatedX(buffer, 0, 1)).toBe(10);
  });
});

describe('interpolated reads', () => {
  it('blends prev -> curr by alpha per axis', () => {
    const buffer = createInterpolationBuffer(4);
    recordTick(buffer, [seg(4, 8)], 100, 0);
    recordTick(buffer, [seg(5, 8)], 100, 100);
    expect(getInterpolatedX(buffer, 0, 0.5)).toBeCloseTo(4.5);
    expect(getInterpolatedZ(buffer, 0, 0.5)).toBeCloseTo(8);
  });

  /**
   * ET-1 feeds these a blend above 1 during the arrival settle. The contract
   * is deliberately NOT "extrapolate freely": see the module note.
   */
  describe('the arrival settle (alpha above 1)', () => {
    it('extrapolates an ordinary move exactly as a lerp would', () => {
      const buffer = createInterpolationBuffer(4);
      recordTick(buffer, [seg(4, 8)], 100, 0);
      recordTick(buffer, [seg(5, 8)], 100, 100);
      // One cell of travel: 6% past the cell is 0.06 of a cell, which is what
      // an unbounded lerp gives and what the settle is specified in.
      expect(getInterpolatedX(buffer, 0, 1.06)).toBeCloseTo(5.06, 12);
      expect(getInterpolatedZ(buffer, 0, 1.06)).toBeCloseTo(8, 12);
    });

    it('bounds a torus wrap to one cell instead of flinging the head off the board', () => {
      // COSMIC's permanent wrap records prev and curr nineteen cells apart.
      // Scaled by the delta, a 6% settle would carry the head 1.14 cells past
      // the far edge - a real artefact, and the reason the overshoot is
      // denominated in cells rather than in "fraction of whatever just moved".
      const buffer = createInterpolationBuffer(4);
      recordTick(buffer, [seg(19, 4)], 100, 0);
      recordTick(buffer, [seg(0, 4)], 100, 100);
      expect(getInterpolatedX(buffer, 0, 1)).toBe(0);
      expect(getInterpolatedX(buffer, 0, 1.06)).toBeCloseTo(-0.06, 12);
    });

    it('carries a stationary segment nowhere at all', () => {
      // Growth seeds prev = curr; a settle must not invent motion for a tail
      // piece that never moved.
      const buffer = createInterpolationBuffer(4);
      recordTick(buffer, [seg(5, 5), seg(4, 5)], 100, 0);
      recordTick(buffer, [seg(6, 5), seg(5, 5), seg(4, 5)], 100, 100);
      expect(getInterpolatedX(buffer, 2, 1.06)).toBe(4);
      expect(getInterpolatedZ(buffer, 2, 1.06)).toBe(5);
    });

    it('leaves every alpha at or below 1 bit-for-bit unchanged', () => {
      const buffer = createInterpolationBuffer(4);
      recordTick(buffer, [seg(3, 11)], 100, 0);
      recordTick(buffer, [seg(3, 12)], 100, 100);
      for (const alpha of [0, 0.13, 0.45, 0.5, 0.9999, 1]) {
        expect(getInterpolatedZ(buffer, 0, alpha)).toBe(11 + alpha);
      }
    });
  });
});

/**
 * ET-1b. The profile's own contracts live in arrivalEasing.test.ts; these are
 * the POSITION contracts - what the two-anchor sampler actually draws, and the
 * three properties the owner's design law reduces to.
 */
describe('the glide sampler', () => {
  const SAMPLES = 401;
  const alphas = Array.from({ length: SAMPLES }, (_, i) => i / (SAMPLES - 1));

  it('never draws a segment outside the cell the simulation is on', () => {
    // Constraint 2, in world units and for EVERY segment, not just the head.
    // This is the invariant that makes glide safe: the pre-ET-1 lag put the
    // head a full cell behind the simulation and killed players unfairly.
    const buffer = createInterpolationBuffer(8);
    for (let step = 1; step < CORNERS.length; step += 1) {
      playTo(buffer, CORNERS, step, 4);
      for (let index = 0; index < buffer.count; index += 1) {
        const cx = buffer.curr[index * 2];
        const cz = buffer.curr[index * 2 + 1];
        for (const alpha of alphas) {
          const motion = glideArrival(alpha);
          expect(
            Math.abs(getGlideX(buffer, index, motion) - cx)
          ).toBeLessThanOrEqual(0.5 + 1e-12);
          expect(
            Math.abs(getGlideZ(buffer, index, motion) - cz)
          ).toBeLessThanOrEqual(0.5 + 1e-12);
        }
      }
    }
  });

  it('moves at one unvarying speed, including through the m = 1 junction', () => {
    // Constraint 1. The junction is where the anchor changes from prev->curr
    // to curr->next; a speed step there would be a per-tick tick-tock at the
    // interval's midpoint, which is exactly the artefact ET-1b removes.
    const buffer = createInterpolationBuffer(8);
    playTo(buffer, CORNERS, 2, 4);
    const step = 1 / 512;
    for (let alpha = 0; alpha + step <= 1; alpha += step) {
      const ax = getGlideX(buffer, 0, glideArrival(alpha));
      const az = getGlideZ(buffer, 0, glideArrival(alpha));
      const bx = getGlideX(buffer, 0, glideArrival(alpha + step));
      const bz = getGlideZ(buffer, 0, glideArrival(alpha + step));
      expect(Math.hypot(bx - ax, bz - az) / step).toBeCloseTo(1, 9);
    }
  });

  it('joins consecutive ticks with no position step - straights and corners', () => {
    // C0 across the tick boundary, for every segment. A body segment's
    // end-of-tick position is midpoint(curr_i, curr_i-1), and index i occupies
    // index i-1's cell on the next tick, so the next interval starts at that
    // same world point. Nothing eases; nothing pops.
    const buffer = createInterpolationBuffer(8);
    for (let step = 1; step < CORNERS.length - 1; step += 1) {
      playTo(buffer, CORNERS, step, 4);
      const exitX: number[] = [];
      const exitZ: number[] = [];
      for (let index = 0; index < buffer.count; index += 1) {
        exitX.push(getGlideX(buffer, index, GLIDE_MOTION_AT_TICK_END));
        exitZ.push(getGlideZ(buffer, index, GLIDE_MOTION_AT_TICK_END));
      }

      recordTick(buffer, snakeAt(CORNERS, step + 1, 4), 100, (step + 1) * 100);
      const [dx, dz] = headingInto(CORNERS, step + 2);
      setHeadOutbound(buffer, dx, dz, GLIDE_MOTION_AT_TICK_START);

      for (let index = 0; index < buffer.count; index += 1) {
        expect(getGlideX(buffer, index, GLIDE_MOTION_AT_TICK_START)).toBe(
          exitX[index]
        );
        expect(getGlideZ(buffer, index, GLIDE_MOTION_AT_TICK_START)).toBe(
          exitZ[index]
        );
      }
    }
  });

  it('is the existing blend, expression for expression, below m = 1', () => {
    // Glide re-times the first half; it does not redraw it. That includes the
    // way a COSMIC wrap is presented, which is deliberately left alone.
    const buffer = createInterpolationBuffer(4);
    recordTick(buffer, [seg(19, 4), seg(18, 4)], 100, 0);
    recordTick(buffer, [seg(0, 4), seg(19, 4)], 100, 100);
    for (const motion of [0.5, 0.6, 0.75, 0.9, 1]) {
      expect(getGlideX(buffer, 0, motion)).toBe(
        getInterpolatedX(buffer, 0, motion)
      );
      expect(getGlideZ(buffer, 0, motion)).toBe(
        getInterpolatedZ(buffer, 0, motion)
      );
    }
  });

  it('reads a torus wrap as the one-cell step it is, not a board-width jump', () => {
    // The raw delta across a wrap is -19 for a step of +1. Sign-corrected and
    // capped, the outbound carries the head half a cell past the far edge it
    // just entered - and the body segment still on the old edge half a cell
    // toward the seam it is about to cross.
    const buffer = createInterpolationBuffer(4);
    recordTick(buffer, [seg(19, 4), seg(18, 4)], 100, 0);
    recordTick(buffer, [seg(0, 4), seg(19, 4)], 100, 100);
    expect(getGlideX(buffer, 0, GLIDE_MOTION_AT_TICK_END)).toBeCloseTo(0.5, 12);
    expect(getGlideX(buffer, 1, GLIDE_MOTION_AT_TICK_END)).toBeCloseTo(19.5, 12);
    expect(getGlideZ(buffer, 0, GLIDE_MOTION_AT_TICK_END)).toBe(4);
  });

  it('renders a segment that appeared this tick at its own cell', () => {
    // Growth seeds prev = curr. The first half must draw the new tail piece on
    // its cell rather than streaking it in from stale memory.
    const buffer = createInterpolationBuffer(4);
    recordTick(buffer, [seg(5, 5), seg(4, 5)], 100, 0);
    recordTick(buffer, [seg(6, 5), seg(5, 5), seg(4, 5)], 100, 100);
    for (const motion of [0.5, 0.7, 1]) {
      expect(getGlideX(buffer, 2, motion)).toBe(4);
      expect(getGlideZ(buffer, 2, motion)).toBe(5);
    }
    // ...and its second half still aims at the segment ahead, because a new
    // tail index moves to index 1's cell on the very next tick like any other.
    expect(getGlideX(buffer, 2, GLIDE_MOTION_AT_TICK_END)).toBeCloseTo(4.5, 12);
  });

  describe('the head outbound', () => {
    it('honours the admitted direction over the current heading', () => {
      // The bend begins when the press is admitted, not when the tick executes
      // it. Travelling +x with a turn to -z queued, the head leans into the
      // corner through the second half.
      const buffer = createInterpolationBuffer(4);
      recordTick(buffer, [seg(5, 5)], 100, 0);
      recordTick(buffer, [seg(6, 5)], 100, 100);
      setHeadOutbound(buffer, 0, -1, GLIDE_MOTION_AT_TICK_START);
      expect(getGlideX(buffer, 0, GLIDE_MOTION_AT_TICK_END)).toBe(6);
      expect(getGlideZ(buffer, 0, GLIDE_MOTION_AT_TICK_END)).toBeCloseTo(4.5, 12);
    });

    it('falls back to the live heading when nothing is publishing', () => {
      // The arena prototypes drive a buffer with no engine behind it.
      const buffer = createInterpolationBuffer(4);
      recordTick(buffer, [seg(5, 5)], 100, 0);
      recordTick(buffer, [seg(6, 5)], 100, 100);
      expect(buffer.headOutboundKnown).toBe(false);
      expect(getGlideX(buffer, 0, GLIDE_MOTION_AT_TICK_END)).toBeCloseTo(6.5, 12);
      expect(getGlideZ(buffer, 0, GLIDE_MOTION_AT_TICK_END)).toBe(5);
    });

    it('rests the head where it is told the next tick moves it nowhere', () => {
      // A zero outbound is a real answer, not a missing one: the phase gate's
      // arrival beat holds the snake still for a tick, and a head that leaned
      // off its cell anyway would snap back when that tick fired.
      const buffer = createInterpolationBuffer(4);
      recordTick(buffer, [seg(5, 5)], 100, 0);
      recordTick(buffer, [seg(6, 5)], 100, 100);
      setHeadOutbound(buffer, 0, 0, GLIDE_MOTION_AT_TICK_START);
      expect(buffer.headOutboundKnown).toBe(true);
      expect(getGlideX(buffer, 0, GLIDE_MOTION_AT_TICK_END)).toBe(6);
      expect(getGlideZ(buffer, 0, GLIDE_MOTION_AT_TICK_END)).toBe(5);
    });

    it('comes to rest on the obstacle edge when the engine stops', () => {
      // Death: no further ticks, alpha clamps at 1, and the head is left
      // touching the wall it hit rather than a cell short of it.
      const buffer = createInterpolationBuffer(4);
      recordTick(buffer, [seg(18, 4)], 100, 0);
      recordTick(buffer, [seg(19, 4)], 100, 100);
      setHeadOutbound(buffer, 1, 0, GLIDE_MOTION_AT_TICK_START);
      const resting = glideArrival(getAlpha(buffer, 100_000));
      expect(getGlideX(buffer, 0, resting)).toBeCloseTo(19.5, 12);
    });

    it('bends a late press over the interval instead of stepping sideways', () => {
      // Worst case for a mid-glide retarget: the aim is frozen as drawn at the
      // press (no step at all) and reaches the new direction exactly at the
      // exit edge, so the next tick still starts where this one ended.
      const buffer = createInterpolationBuffer(4);
      recordTick(buffer, [seg(5, 5)], 100, 0);
      recordTick(buffer, [seg(6, 5)], 100, 100);
      setHeadOutbound(buffer, 1, 0, GLIDE_MOTION_AT_TICK_START);

      const beforeX = getGlideX(buffer, 0, 1.25);
      const beforeZ = getGlideZ(buffer, 0, 1.25);
      setHeadOutbound(buffer, 0, -1, 1.25);
      expect(getGlideX(buffer, 0, 1.25)).toBeCloseTo(beforeX, 12);
      expect(getGlideZ(buffer, 0, 1.25)).toBeCloseTo(beforeZ, 12);

      expect(getGlideX(buffer, 0, GLIDE_MOTION_AT_TICK_END)).toBe(6);
      expect(getGlideZ(buffer, 0, GLIDE_MOTION_AT_TICK_END)).toBeCloseTo(4.5, 12);

      // The bend stays inside the cell the whole way through.
      for (let m = 1.25; m <= GLIDE_MOTION_AT_TICK_END; m += 0.01) {
        expect(Math.abs(getGlideX(buffer, 0, m) - 6)).toBeLessThanOrEqual(
          0.5 + 1e-12
        );
        expect(Math.abs(getGlideZ(buffer, 0, m) - 5)).toBeLessThanOrEqual(
          0.5 + 1e-12
        );
      }
    });

    it('does not carry a bend across the tick that ended it', () => {
      const buffer = createInterpolationBuffer(4);
      recordTick(buffer, [seg(5, 5)], 100, 0);
      recordTick(buffer, [seg(6, 5)], 100, 100);
      setHeadOutbound(buffer, 1, 0, GLIDE_MOTION_AT_TICK_START);
      setHeadOutbound(buffer, 0, -1, 1.4);
      recordTick(buffer, [seg(6, 4)], 100, 200);
      expect(buffer.headOutboundTurnAt).toBe(1);
      expect(buffer.headOutboundPriorX).toBe(0);
      expect(buffer.headOutboundPriorZ).toBe(-1);
    });
  });

  it('is cleared by a reset, so a new run never leans toward the dead one', () => {
    const buffer = createInterpolationBuffer(4);
    recordTick(buffer, [seg(5, 5)], 100, 0);
    setHeadOutbound(buffer, 1, 0, GLIDE_MOTION_AT_TICK_START);
    resetInterpolationBuffer(buffer);
    expect(buffer.headOutboundKnown).toBe(false);
    expect(buffer.headOutboundX).toBe(0);
    expect(buffer.headOutboundZ).toBe(0);
  });
});
