/**
 * Food placement (WP-3.05).
 *
 * The shipped sampler rejection-sampled 1000 random cells and then RETURNED
 * ITS LAST GUESS whatever it was. On a board that is 8% full — the median
 * production run — the chance of 1000 consecutive misses is around 1e-46, so
 * the bug was unobservable. This wave deliberately drives runs toward a full
 * board, and the failure mode arrives with it: food inside your own body, on
 * the portal, or inside a terrain block.
 *
 * So the first two tests below are the ones that matter, and they are stated
 * as absolutes rather than as probabilities.
 */

import { describe, it, expect } from '@jest/globals';
import {
  FOOD_RADIUS_MIN,
  chooseFoodCell,
  foodSearchRadius,
  placementKey,
  reachableFrom,
} from './foodPlacement';

const GRID = 20;

/** A deterministic stand-in for the engine's seeded stream. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function blockAll(except: Array<[number, number]>): Set<string> {
  const free = new Set(except.map(([x, z]) => placementKey(x, z)));
  const blocked = new Set<string>();
  for (let x = 0; x < GRID; x++) {
    for (let z = 0; z < GRID; z++) {
      const key = placementKey(x, z);
      if (!free.has(key)) blocked.add(key);
    }
  }
  return blocked;
}

describe('the placer never returns an illegal cell', () => {
  it('never lands on a blocked cell, at any occupancy', () => {
    const rng = seeded(7);
    // Sweep occupancy from empty to nearly full, blocking a growing prefix.
    for (let filled = 0; filled < GRID * GRID - 2; filled += 37) {
      const blocked = new Set<string>();
      for (let i = 0; i < filled; i++) {
        blocked.add(placementKey(i % GRID, Math.floor(i / GRID)));
      }
      const head = { x: GRID - 1, z: GRID - 1 };
      blocked.add(placementKey(head.x, head.z));
      const cell = chooseFoodCell(GRID, head, blocked, filled / 400, rng);
      if (cell === null) continue;
      expect(blocked.has(placementKey(cell.x, cell.z))).toBe(false);
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.x).toBeLessThan(GRID);
      expect(cell.z).toBeGreaterThanOrEqual(0);
      expect(cell.z).toBeLessThan(GRID);
    }
  });

  it('returns the ONLY free cell when exactly one remains', () => {
    // The case the rejection sampler had a real chance of failing: one free
    // cell in 400, so a uniform guess misses 99.75% of the time.
    const blocked = blockAll([
      [3, 3],
      [3, 4],
    ]);
    const cell = chooseFoodCell(GRID, { x: 3, z: 4 }, blocked, 399 / 400, seeded(1));
    expect(cell).toEqual({ x: 3, z: 3 });
  });

  it('returns null only when the board holds no free cell', () => {
    const blocked = blockAll([]);
    expect(chooseFoodCell(GRID, { x: 0, z: 0 }, blocked, 1, seeded(1))).toBeNull();
  });

  it('a zero-size board is null, not a crash', () => {
    expect(chooseFoodCell(0, { x: 0, z: 0 }, new Set(), 0, seeded(1))).toBeNull();
  });
});

describe('reachability', () => {
  it('excludes a pocket sealed by the body', () => {
    // A 1-cell pocket at (0,0) walled off by blocked cells. The head sits far
    // away with open space around it.
    const blocked = new Set<string>([
      placementKey(1, 0),
      placementKey(0, 1),
      placementKey(1, 1),
    ]);
    const reach = reachableFrom(GRID, { x: 10, z: 10 }, blocked);
    expect(reach.has(placementKey(0, 0))).toBe(false);
    expect(reach.has(placementKey(10, 11))).toBe(true);
  });

  it('never places food in a sealed pocket while open space exists', () => {
    const blocked = new Set<string>([
      placementKey(1, 0),
      placementKey(0, 1),
      placementKey(1, 1),
    ]);
    const rng = seeded(99);
    for (let i = 0; i < 300; i++) {
      const cell = chooseFoodCell(GRID, { x: 10, z: 10 }, blocked, 0.02, rng);
      expect(cell).not.toEqual({ x: 0, z: 0 });
    }
  });

  it('falls back to any free cell when the head is fully sealed in', () => {
    // Head boxed into a single cell. Refusing to place food would freeze a run
    // that is ending anyway; placing it somewhere unreachable at least lets
    // the run finish.
    const head = { x: 5, z: 5 };
    const blocked = new Set<string>([
      placementKey(5, 5),
      placementKey(4, 5),
      placementKey(6, 5),
      placementKey(5, 4),
      placementKey(5, 6),
    ]);
    const cell = chooseFoodCell(GRID, head, blocked, 0.02, seeded(3));
    expect(cell).not.toBeNull();
    expect(blocked.has(placementKey(cell!.x, cell!.z))).toBe(false);
  });
});

describe('the search radius is the traverse fix', () => {
  it('spans the whole board while the board is empty', () => {
    // The opening must be byte-identical in feel to the shipped game: at a
    // median run's 8% occupancy the radius still covers every cell.
    expect(foodSearchRadius(GRID, 0)).toBeGreaterThanOrEqual(GRID);
    expect(foodSearchRadius(GRID, 0.08)).toBeGreaterThanOrEqual(GRID - 3);
  });

  it('tightens as the board fills, and never below the floor', () => {
    const empty = foodSearchRadius(GRID, 0.05);
    const half = foodSearchRadius(GRID, 0.5);
    const full = foodSearchRadius(GRID, 0.9);
    expect(half).toBeLessThan(empty);
    expect(full).toBeLessThan(half);
    expect(full).toBe(FOOD_RADIUS_MIN);
  });

  it('is monotonic — a fuller board never widens the search', () => {
    let previous = Infinity;
    for (let o = 0; o <= 1.0001; o += 0.05) {
      const r = foodSearchRadius(GRID, o);
      expect(r).toBeLessThanOrEqual(previous);
      previous = r;
    }
  });

  it('keeps food inside the radius on a crowded board', () => {
    // Fill the top half, head bottom-left. Every placement should land within
    // the tightened radius rather than across the board.
    const blocked = new Set<string>();
    for (let x = 0; x < GRID; x++) {
      for (let z = 0; z < GRID / 2; z++) blocked.add(placementKey(x, z));
    }
    const head = { x: 0, z: GRID - 1 };
    blocked.add(placementKey(head.x, head.z));
    const radius = foodSearchRadius(GRID, 0.5);
    const rng = seeded(11);
    for (let i = 0; i < 200; i++) {
      const cell = chooseFoodCell(GRID, head, blocked, 0.5, rng)!;
      const distance = Math.max(
        Math.abs(cell.x - head.x),
        Math.abs(cell.z - head.z)
      );
      expect(distance).toBeLessThanOrEqual(radius);
    }
  });
});

describe('determinism and clustering', () => {
  it('the same seed lays out the same food', () => {
    // Replayability, not validation: challenge links and same-seed runs must
    // reproduce the board exactly (the discipline terrain.ts follows).
    const blocked = new Set<string>([placementKey(0, 0)]);
    const a = Array.from({ length: 20 }, (_, i) =>
      chooseFoodCell(GRID, { x: 0, z: 0 }, blocked, 0.05, seeded(42 + i))
    );
    const b = Array.from({ length: 20 }, (_, i) =>
      chooseFoodCell(GRID, { x: 0, z: 0 }, blocked, 0.05, seeded(42 + i))
    );
    expect(a).toEqual(b);
  });

  it('an anchor clusters the placement, for COSMIC groups', () => {
    const blocked = new Set<string>([placementKey(19, 19)]);
    const anchor = { cell: { x: 4, z: 4 }, radius: 4 };
    const rng = seeded(5);
    for (let i = 0; i < 200; i++) {
      const cell = chooseFoodCell(
        GRID,
        { x: 19, z: 19 },
        blocked,
        0.02,
        rng,
        anchor
      )!;
      expect(Math.abs(cell.x - 4)).toBeLessThanOrEqual(4);
      expect(Math.abs(cell.z - 4)).toBeLessThanOrEqual(4);
    }
  });

  it('a crowded anchor neighbourhood falls back instead of failing', () => {
    // Block everything within the anchor radius. The old sampler burned 500
    // attempts here and then fell through to a uniform guess; this must simply
    // place a legal cell elsewhere.
    const blocked = new Set<string>();
    for (let x = 0; x <= 8; x++) {
      for (let z = 0; z <= 8; z++) blocked.add(placementKey(x, z));
    }
    const cell = chooseFoodCell(
      GRID,
      { x: 15, z: 15 },
      blocked,
      0.2,
      seeded(8),
      { cell: { x: 4, z: 4 }, radius: 4 }
    );
    expect(cell).not.toBeNull();
    expect(blocked.has(placementKey(cell!.x, cell!.z))).toBe(false);
  });
});
