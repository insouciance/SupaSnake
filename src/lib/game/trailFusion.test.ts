/**
 * Trail fusion - the earned-packing metric (WP-3.07).
 *
 * The trail's whole claim is that its brightness and solidity are EARNED, so
 * the measurement has to be right before anything about the picture matters.
 * It is a pure module for exactly this reason: `AimRenderer.test.tsx` mocks
 * `useFrame` as a no-op, which means no component-level test of this shape ever
 * runs the render loop's body. If the metric were only reachable from inside
 * that loop it would be untestable in practice, which is how WP-3.03 shipped a
 * complete terrain model with nothing drawing it.
 *
 * The companion structural test (`src/components/game/trail.visible.test.ts`)
 * asserts the other half: that this metric is actually wired to a screen.
 */

import { describe, it, expect } from '@jest/globals';
import type { TerrainBlock } from '@/shared/game/terrain';
import {
  FUSION_HYSTERESIS_TICKS,
  FUSION_MAX,
  createTrailFusionState,
  getFusionLevel,
  resetTrailFusion,
  updateTrailFusion,
  type TrailFusionState,
} from './trailFusion';

const GRID = 20;

/** Pack `[x, z]` pairs the way the interpolation buffer does. */
function packCells(cells: readonly (readonly [number, number])[]): Float32Array {
  const packed = new Float32Array(cells.length * 2);
  for (let i = 0; i < cells.length; i++) {
    packed[i * 2] = cells[i][0];
    packed[i * 2 + 1] = cells[i][1];
  }
  return packed;
}

/** One tick, returning the committed level per segment index. */
function tick(
  state: TrailFusionState,
  cells: readonly (readonly [number, number])[],
  options: {
    terrain?: readonly TerrainBlock[];
    wrapActive?: boolean;
    elapsed?: number;
  } = {}
): number[] {
  updateTrailFusion(
    state,
    packCells(cells),
    cells.length,
    options.terrain ?? null,
    options.wrapActive ?? false,
    options.elapsed
  );
  return cells.map((_, i) => getFusionLevel(state, i));
}

function fresh(): TrailFusionState {
  return createTrailFusionState(GRID, 400);
}

function solidBlock(x: number, z: number): TerrainBlock {
  return { x, z, source: 'cyber', formingTicks: 0, formingTotal: 8, solid: true };
}

function formingBlock(x: number, z: number): TerrainBlock {
  return { x, z, source: 'cyber', formingTicks: 4, formingTotal: 8, solid: false };
}

describe('path neighbours never count - fusion is earned, not positional', () => {
  it('a straight snake in open space is entirely level 0', () => {
    // Every interior cell of a straight run has exactly two occupied
    // orthogonal neighbours and both are its path neighbours. Adjacency you
    // get for free by being a snake proves nothing about packing, so this is
    // the case the whole metric exists to score as zero.
    const levels = tick(fresh(), [
      [5, 5],
      [5, 6],
      [5, 7],
      [5, 8],
      [5, 9],
    ]);
    expect(levels).toEqual([0, 0, 0, 0, 0]);
  });

  it('a 2x2 loop is still level 0 - a minimal ring is all path neighbours', () => {
    const levels = tick(fresh(), [
      [5, 5],
      [6, 5],
      [6, 6],
      [5, 6],
    ]);
    // Head and tail each see the other's cell, which is NOT a path neighbour
    // of theirs, so the two open ends of the ring do score.
    expect(levels[1]).toBe(0);
    expect(levels[2]).toBe(0);
    expect(levels[0]).toBe(1);
    expect(levels[3]).toBe(1);
  });

  it('a folded 3x3 field puts its centre at the top level', () => {
    // Boustrophedon fill of a 3x3 block. The centre cell (6,6) sits between
    // its two path neighbours on the X axis and has body ABOVE and BELOW that
    // it did not have to be adjacent to - two earned neighbours.
    const levels = tick(fresh(), [
      [5, 5],
      [6, 5],
      [7, 5],
      [7, 6],
      [6, 6],
      [5, 6],
      [5, 7],
      [6, 7],
      [7, 7],
    ]);
    expect(levels[4]).toBe(2);
  });
});

describe('walls and terrain pack; open edges and decals do not', () => {
  it('a wall counts as a packing neighbour', () => {
    // A single cell against the top edge: (5,-1) is out of bounds and packs.
    expect(tick(fresh(), [[5, 0]])[0]).toBe(1);
  });

  it('an arena corner is fully fused on walls alone', () => {
    expect(tick(fresh(), [[0, 0]])[0]).toBe(2);
  });

  it('an OPEN edge does not pack - or the metric pays for hugging a seam', () => {
    // COSMIC's flux phase makes the border a passage. Touching a passage is
    // not spending space, and rewarding it would teach the wrong line.
    expect(tick(fresh(), [[0, 0]], { wrapActive: true })[0]).toBe(0);
  });

  it('SOLID terrain packs', () => {
    const levels = tick(fresh(), [[5, 5]], {
      terrain: [solidBlock(5, 4), solidBlock(4, 5)],
    });
    expect(levels[0]).toBe(2);
  });

  it('FORMING terrain does not pack - it is a decal you cross', () => {
    // A forming block promises nothing yet. Counting it would show a fusion
    // the player has not earned and cannot rely on.
    const levels = tick(fresh(), [[5, 5]], {
      terrain: [formingBlock(5, 4), formingBlock(4, 5)],
    });
    expect(levels[0]).toBe(0);
  });

  it('clamps at FUSION_MAX rather than extending the scale', () => {
    // Four packing neighbours (one wall + three solid blocks) is still 2.
    const levels = tick(fresh(), [[0, 5]], {
      terrain: [solidBlock(0, 4), solidBlock(0, 6), solidBlock(1, 5)],
    });
    expect(levels[0]).toBe(FUSION_MAX);
  });
});

describe('hysteresis - the metric may not strobe at the tick rate', () => {
  // The measurement is defined on the tick, and the tick lands in the 5-10 Hz
  // band. A raw level that alternates would put a brightness and size change
  // right in the worst place a flicker can be.
  const EDGE_SNAKE: readonly (readonly [number, number])[] = [
    [5, 0],
    [4, 0],
    [3, 0],
    [2, 0],
  ];

  it('an input alternating every tick never commits a change', () => {
    const state = fresh();
    // wrapActive false -> the top wall packs (level 1); true -> it does not.
    expect(tick(state, EDGE_SNAKE, { wrapActive: false })[1]).toBe(1);
    for (let i = 0; i < 12; i++) {
      const levels = tick(state, EDGE_SNAKE, { wrapActive: i % 2 === 0 });
      expect(levels[1]).toBe(1);
    }
  });

  it('a change that HOLDS commits after exactly FUSION_HYSTERESIS_TICKS', () => {
    const state = fresh();
    expect(tick(state, EDGE_SNAKE, { wrapActive: false })[1]).toBe(1);
    for (let held = 1; held < FUSION_HYSTERESIS_TICKS; held++) {
      expect(tick(state, EDGE_SNAKE, { wrapActive: true })[1]).toBe(1);
    }
    expect(tick(state, EDGE_SNAKE, { wrapActive: true })[1]).toBe(0);
  });

  it('the FIRST tick adopts its measurement immediately', () => {
    // Nothing to de-flicker yet, and a two-tick fade-in on run start would
    // read as the renderer catching up rather than as a readout.
    expect(tick(fresh(), [[0, 0]])[0]).toBe(2);
  });

  it('a cell keeps its history as the body slides past it', () => {
    // Hysteresis is keyed by CELL, not by instance index: the index -> cell
    // mapping shifts by one every tick as the body advances, so index keying
    // would smear each cell's history onto its neighbour and re-open the
    // flicker it exists to close. Cell (4,0) is index 1, then 2, then 3.
    const state = fresh();
    const t1 = tick(state, [[5, 0], [4, 0], [3, 0], [2, 0]], { wrapActive: false });
    expect(t1[1]).toBe(1);
    const t2 = tick(state, [[6, 0], [5, 0], [4, 0], [3, 0]], { wrapActive: true });
    expect(t2[2]).toBe(1); // pending, not committed
    const t3 = tick(state, [[7, 0], [6, 0], [5, 0], [4, 0]], { wrapActive: false });
    expect(t3[3]).toBe(1); // the alternation reset the streak
  });

  it('a cell re-entered after an absence does not inherit its old level', () => {
    const state = fresh();
    expect(tick(state, [[0, 0]])[0]).toBe(2); // corner: committed 2
    tick(state, [[10, 10]]); // the corner is vacated
    tick(state, [[10, 10]]);
    // Back to the corner cell, but now with an open edge: it must measure
    // fresh (0), not resume the 2 it committed on its earlier visit.
    expect(tick(state, [[0, 0]], { wrapActive: true })[0]).toBe(0);
  });
});

describe('degenerate inputs the engine actually produces', () => {
  it('a growth tick duplicates the tail cell without corrupting it', () => {
    // `recordTick` seeds prev = curr for a new tail index, so two indices
    // legitimately name one cell for a tick. The second visit must READ the
    // cell's level, never re-run its hysteresis step.
    const state = fresh();
    const levels = tick(state, [
      [5, 5],
      [5, 6],
      [5, 6],
    ]);
    expect(levels[1]).toBe(levels[2]);
  });

  it('a single-segment snake has no path neighbours to exclude', () => {
    expect(tick(fresh(), [[5, 5]])[0]).toBe(0);
  });

  it('an empty snake is a no-op', () => {
    const state = fresh();
    expect(() => tick(state, [])).not.toThrow();
    expect(state.count).toBe(0);
  });

  it('out-of-bounds cells are ignored rather than corrupting memory', () => {
    // Cannot happen with a sane engine, but a typed-array write off the end
    // of the occupancy grid would be silent and would corrupt an unrelated
    // cell's level.
    const state = fresh();
    expect(() => tick(state, [[-1, -1], [5, 5]])).not.toThrow();
    expect(getFusionLevel(state, 0)).toBe(0);
  });

  it('walks occupancy beyond output capacity without writing past the output', () => {
    const state = createTrailFusionState(GRID, 4);
    const cells: (readonly [number, number])[] = [];
    for (let i = 0; i < 10; i++) cells.push([5, i]);
    updateTrailFusion(state, packCells(cells), cells.length, null, false);
    // `levels` is a compatibility array and remains capacity-bounded, but the
    // cell-keyed representation must still see segment 9.
    expect(state.count).toBe(4);
    expect(state.body[9 * GRID + 5]).toBe(1);
  });

  it('getFusionLevel is 0 outside the recorded range', () => {
    const state = fresh();
    tick(state, [[5, 5]]);
    expect(getFusionLevel(state, -1)).toBe(0);
    expect(getFusionLevel(state, 99)).toBe(0);
  });
});

describe('reset - a new run never inherits the dead one', () => {
  it('drops every committed level and restarts the tick counter', () => {
    const state = fresh();
    tick(state, [[0, 0]]);
    expect(getFusionLevel(state, 0)).toBe(2);
    resetTrailFusion(state);
    expect(state.count).toBe(0);
    expect(getFusionLevel(state, 0)).toBe(0);
    expect(Array.from(state.sealStartedAt).every((value) => value === -1)).toBe(
      true
    );
    expect(Array.from(state.sealMask).every((value) => value === 0)).toBe(true);
    // And the first tick after a reset still adopts immediately - the tick
    // counter must not restart on the value `lastBodyTick` uses for "never".
    expect(tick(state, [[0, 0]])[0]).toBe(2);
  });
});

describe('coil seal events', () => {
  const centre: readonly (readonly [number, number])[] = [[5, 5]];
  const packed = [solidBlock(4, 5), solidBlock(5, 4)];
  const cell = 5 * GRID + 5;

  it('does not celebrate level-2 cells on the opening snapshot', () => {
    const state = fresh();
    tick(state, [[0, 0]], { elapsed: 10 });
    expect(state.committed[0]).toBe(2);
    expect(state.sealStartedAt[0]).toBe(-1);
    expect(state.sealMask[0]).toBe(0);
  });

  it('stamps one seal when a held change reaches full fusion', () => {
    const state = fresh();
    tick(state, centre, { elapsed: 1 });
    expect(state.sealStartedAt[cell]).toBe(-1);

    tick(state, centre, { terrain: packed, elapsed: 2 });
    expect(state.committed[cell]).toBe(0);
    expect(state.sealStartedAt[cell]).toBe(-1);

    tick(state, centre, { terrain: packed, elapsed: 3 });
    expect(state.committed[cell]).toBe(2);
    expect(state.sealStartedAt[cell]).toBe(3);
    // -X and -Z contacts are both recorded; the renderer can zip the actual
    // seams instead of drawing a generic halo around the cell.
    expect(state.sealMask[cell] & (1 << 1)).not.toBe(0);
    expect(state.sealMask[cell] & (1 << 3)).not.toBe(0);

    tick(state, centre, { terrain: packed, elapsed: 4 });
    expect(state.sealStartedAt[cell]).toBe(3);
  });

  it('never stamps while the raw level alternates', () => {
    const state = fresh();
    tick(state, centre, { elapsed: 0 });
    for (let index = 0; index < 10; index += 1) {
      tick(state, centre, {
        terrain: index % 2 === 0 ? packed : [],
        elapsed: index + 1,
      });
    }
    expect(state.sealStartedAt[cell]).toBe(-1);
  });

  it('stamps a newly entered tight cell after initialization', () => {
    const state = fresh();
    tick(state, [[10, 10]], { elapsed: 0 });
    tick(state, centre, { terrain: packed, elapsed: 1 });
    expect(state.committed[cell]).toBe(2);
    expect(state.sealStartedAt[cell]).toBe(1);
  });
});
