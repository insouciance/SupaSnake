/**
 * The terrain primitive (WP-3.03).
 *
 * Terrain is physics, not payout, so these cover the properties the ENGINE
 * relies on: the arena closes from the outside in, placement is replayable
 * from a seed, and free space only ever shrinks (Rule 15).
 */

import { describe, it, expect } from '@jest/globals';
import {
  blocksDueAt,
  cellKey,
  formingTicksForSeconds,
  nextTerrainCells,
  ringOf,
  type TerrainSchedule,
} from './terrain';

const CYBER_ARENA: TerrainSchedule = {
  blocksPerInterval: 6,
  intervalFoods: 5,
  formingSeconds: 2,
};

/** A deterministic rng, so "seeded" means something in these cases. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('terrain: the schedule', () => {
  it('is food-indexed, so it is replayable', () => {
    expect(blocksDueAt(CYBER_ARENA, 0)).toBe(0);
    expect(blocksDueAt(CYBER_ARENA, 4)).toBe(0);
    expect(blocksDueAt(CYBER_ARENA, 5)).toBe(6);
    expect(blocksDueAt(CYBER_ARENA, 50)).toBe(60);
  });

  it('never goes backwards — free space only shrinks (Rule 15)', () => {
    let previous = 0;
    for (let foods = 0; foods <= 200; foods++) {
      const due = blocksDueAt(CYBER_ARENA, foods);
      expect(due).toBeGreaterThanOrEqual(previous);
      previous = due;
    }
  });

  it('tolerates a degenerate schedule instead of dividing by zero', () => {
    expect(blocksDueAt({ ...CYBER_ARENA, intervalFoods: 0 }, 50)).toBe(0);
    expect(blocksDueAt(CYBER_ARENA, -5)).toBe(0);
  });
});

describe('terrain: the forming window is authored in seconds', () => {
  it('holds its real duration as the tick changes', () => {
    // The defect this avoids: a window in TICKS silently shrinks as a dynasty
    // accelerates. CYBER's extraction window lost 75% of its real duration
    // exactly this way.
    const forming = CYBER_ARENA.formingSeconds;
    expect(formingTicksForSeconds(forming, 200)).toBe(10); // 2s at 200ms
    expect(formingTicksForSeconds(forming, 100)).toBe(20); // 2s at 100ms
    expect(formingTicksForSeconds(forming, 50)).toBe(40); // 2s at 50ms
  });

  it('never rounds down to zero ticks', () => {
    expect(formingTicksForSeconds(0, 200)).toBe(1);
    expect(formingTicksForSeconds(CYBER_ARENA.formingSeconds, 0)).toBeGreaterThan(0);
  });
});

describe('terrain: the arena closes from the outside in', () => {
  it('ringOf reads 0 at the edge and grows inward', () => {
    expect(ringOf({ x: 0, z: 0 }, 20)).toBe(0);
    expect(ringOf({ x: 19, z: 5 }, 20)).toBe(0);
    expect(ringOf({ x: 1, z: 1 }, 20)).toBe(1);
    expect(ringOf({ x: 9, z: 9 }, 20)).toBe(9);
  });

  it('fills the outermost free ring before touching the next', () => {
    const cells = nextTerrainCells(20, new Set(), 76, seeded(1));
    expect(cells).toHaveLength(76); // the whole outer ring of a 20x20
    expect(cells.every((c) => ringOf(c, 20) === 0)).toBe(true);
  });

  it('moves inward only once the outer ring is full', () => {
    const outer = new Set<string>();
    for (const c of nextTerrainCells(20, new Set(), 76, seeded(2))) {
      outer.add(cellKey(c.x, c.z));
    }
    const next = nextTerrainCells(20, outer, 4, seeded(3));
    expect(next).toHaveLength(4);
    expect(next.every((c) => ringOf(c, 20) === 1)).toBe(true);
  });

  it('never returns a blocked cell, and never a duplicate', () => {
    const blocked = new Set([cellKey(0, 0), cellKey(0, 1), cellKey(19, 19)]);
    const cells = nextTerrainCells(20, blocked, 30, seeded(4));
    const keys = cells.map((c) => cellKey(c.x, c.z));
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of blocked) expect(keys).not.toContain(key);
  });
});

describe('terrain: placement is replayable', () => {
  it('the same seed lays the same arena', () => {
    const a = nextTerrainCells(20, new Set(), 12, seeded(99));
    const b = nextTerrainCells(20, new Set(), 12, seeded(99));
    expect(a).toEqual(b);
  });

  it('different seeds lay different arenas', () => {
    const a = nextTerrainCells(20, new Set(), 12, seeded(1));
    const b = nextTerrainCells(20, new Set(), 12, seeded(2));
    expect(a).not.toEqual(b);
  });

  it('asking for more than the board holds returns what exists, not a crash', () => {
    const cells = nextTerrainCells(5, new Set(), 10_000, seeded(7));
    expect(cells.length).toBe(25);
    expect(new Set(cells.map((c) => cellKey(c.x, c.z))).size).toBe(25);
  });

  it('a degenerate request is empty rather than an error', () => {
    expect(nextTerrainCells(20, new Set(), 0, seeded(1))).toEqual([]);
    expect(nextTerrainCells(0, new Set(), 5, seeded(1))).toEqual([]);
  });
});
