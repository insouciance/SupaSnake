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
  getInterpolatedX,
  getInterpolatedZ,
  recordTick,
  resetInterpolationBuffer,
} from './interpolationBuffer';

const seg = (x: number, z: number) => ({ x, y: 0, z });

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
