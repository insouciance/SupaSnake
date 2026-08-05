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
  source: 'cyber',
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

// ---------------------------------------------------------------------------
// THE CONNECTIVITY GUARANTEE (owner ruling, 2026-08-05)
// ---------------------------------------------------------------------------

/** Connected components of the free field (grid minus `solid`), 4-neighbour. */
function freeRegions(gridSize: number, solid: ReadonlySet<string>): number {
  const seen = new Set<string>();
  let regions = 0;
  for (let x = 0; x < gridSize; x++) {
    for (let z = 0; z < gridSize; z++) {
      const start = cellKey(x, z);
      if (solid.has(start) || seen.has(start)) continue;
      regions += 1;
      const queue = [{ x, z }];
      seen.add(start);
      while (queue.length > 0) {
        const cell = queue.pop()!;
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = cell.x + dx;
          const nz = cell.z + dz;
          if (nx < 0 || nz < 0 || nx >= gridSize || nz >= gridSize) continue;
          const key = cellKey(nx, nz);
          if (solid.has(key) || seen.has(key)) continue;
          seen.add(key);
          queue.push({ x: nx, z: nz });
        }
      }
    }
  }
  return regions;
}

/** An rng that records how many numbers it was asked for. */
function counting(seed: number): { rng: () => number; draws: () => number } {
  const inner = seeded(seed);
  let draws = 0;
  return {
    rng: () => {
      draws += 1;
      return inner();
    },
    draws: () => draws,
  };
}

describe('terrain: placement never splits the reachable field', () => {
  it('holds the invariant across a full CYBER arena run, six blocks at a time', () => {
    // The shipped schedule: six blocks every five foods, no ceiling. Driven to
    // the end of the board, asserting after EVERY batch that the free field is
    // still one region. This is the assertion FINDING BF-1 could not make.
    const rng = seeded(4242);
    const solid = new Set<string>();
    let batches = 0;
    for (; batches < 500; batches++) {
      const cells = nextTerrainCells(20, solid, 6, rng, { solid });
      if (cells.length === 0) break;
      for (const cell of cells) solid.add(cellKey(cell.x, cell.z));
      expect(freeRegions(20, solid)).toBeLessThanOrEqual(1);
    }
    // The board still closes all the way: unlimited ring progression stays, and
    // the guard is a placement ORDER, not a cap.
    expect(solid.size).toBe(400);
    expect(freeRegions(20, solid)).toBe(0);
    expect(batches).toBeLessThanOrEqual(400 / 6 + 2);
  });

  it('holds the invariant one block at a time, which is the harshest order', () => {
    const rng = seeded(77);
    const solid = new Set<string>();
    for (let step = 0; step < 400; step++) {
      const cells = nextTerrainCells(20, solid, 1, rng, { solid });
      expect(cells).toHaveLength(1);
      solid.add(cellKey(cells[0].x, cells[0].z));
      expect(freeRegions(20, solid)).toBeLessThanOrEqual(1);
    }
    expect(solid.size).toBe(400);
  });

  it('skips an articulation point, and takes it once the bridge is redundant', () => {
    // A 5x5 with column 2 solid except (2,2): that cell is the ONLY link
    // between the left and right halves.
    const bridgeSolid = new Set([
      cellKey(2, 0),
      cellKey(2, 1),
      cellKey(2, 3),
      cellKey(2, 4),
    ]);
    // Every cell but the bridge is excluded from candidacy, so the bridge is
    // the only thing placement could choose - and it must refuse.
    const onlyBridge = new Set<string>();
    for (let x = 0; x < 5; x++) {
      for (let z = 0; z < 5; z++) {
        if (x === 2 && z === 2) continue;
        onlyBridge.add(cellKey(x, z));
      }
    }
    expect(
      nextTerrainCells(5, onlyBridge, 1, seeded(1), { solid: bridgeSolid })
    ).toEqual([]);

    // Re-open one neighbour of the bridge: the halves now meet through row 1,
    // the cell is no longer an articulation point, and it is taken.
    const relieved = new Set(bridgeSolid);
    relieved.delete(cellKey(2, 1));
    expect(
      nextTerrainCells(5, onlyBridge, 1, seeded(1), { solid: relieved })
    ).toEqual([{ x: 2, z: 2 }]);
  });

  it('reads food and portals as walkable, not as walls', () => {
    // `blocked` carries cells placement must not bury; `solid` carries walls.
    // A food sitting in the only corridor must not make the corridor look
    // severed - the head walks over food, so the corridor is open.
    //
    // Column 2 is walled except (2,2) and (2,3). Everything but (2,2) is
    // excluded from candidacy, so the guard's verdict is the whole answer.
    const onlyCentre = new Set<string>();
    for (let x = 0; x < 5; x++) {
      for (let z = 0; z < 5; z++) {
        if (x === 2 && z === 2) continue;
        onlyCentre.add(cellKey(x, z));
      }
    }
    const withFood = new Set([cellKey(2, 0), cellKey(2, 1), cellKey(2, 4)]);
    // (2,3) holds a food: in `blocked`, deliberately absent from `solid`.
    expect(
      nextTerrainCells(5, onlyCentre, 1, seeded(9), { solid: withFood })
    ).toEqual([{ x: 2, z: 2 }]);

    // The same geometry with (2,3) walled instead of fed: now (2,2) really is
    // the only link, and it is refused.
    const walled = new Set(withFood);
    walled.add(cellKey(2, 3));
    expect(
      nextTerrainCells(5, onlyCentre, 1, seeded(9), { solid: walled })
    ).toEqual([]);
  });

  it('consumes no randomness of its own: the guard cannot move the stream', () => {
    // The seeded shuffle draws exactly (candidates - 1) per visited ring,
    // before any connectivity decision is made. Both cases visit ring 0 only.
    const open = counting(31);
    nextTerrainCells(20, new Set(), 6, open.rng, { solid: new Set() });
    expect(open.draws()).toBe(75); // 76 outer-ring cells

    const wall = new Set([cellKey(1, 0)]);
    const constrained = counting(31);
    nextTerrainCells(20, wall, 6, constrained.rng, { solid: wall });
    expect(constrained.draws()).toBe(74); // one fewer candidate, same rule
  });

  it('lays the same arena twice from the same seed, guard and all', () => {
    const solid = new Set([cellKey(0, 1), cellKey(1, 0), cellKey(19, 18)]);
    const a = nextTerrainCells(20, solid, 12, seeded(2026), { solid });
    const b = nextTerrainCells(20, solid, 12, seeded(2026), { solid });
    expect(a).toEqual(b);
  });

  it('wraps adjacency on a torus, so a seam neighbour is a neighbour', () => {
    // On a torus the outer ring is not a boundary: (0,0) still touches (19,0).
    // Sealing (1,0) and (0,1) therefore does NOT isolate it, and the cell is
    // legal - which it would not be on a walled board.
    const walls = new Set([cellKey(1, 0), cellKey(0, 1)]);
    const blocked = new Set(walls);
    for (let x = 0; x < 20; x++) {
      for (let z = 0; z < 20; z++) {
        if (x === 19 && z === 0) continue;
        blocked.add(cellKey(x, z));
      }
    }
    expect(
      nextTerrainCells(20, blocked, 1, seeded(5), { solid: walls, wrap: true })
    ).toEqual([{ x: 19, z: 0 }]);
    expect(
      nextTerrainCells(20, blocked, 1, seeded(5), { solid: walls })
    ).toEqual([]);
  });
});
