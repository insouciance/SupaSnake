import { describe, expect, it } from '@jest/globals';
import type { TerrainBlock } from './terrain';
import { boardPressureSnapshot } from './pressure';

const block = (
  x: number,
  z: number,
  solid: boolean
): TerrainBlock => ({
  x,
  z,
  source: 'cyber',
  formingTicks: solid ? 0 : 3,
  formingTotal: 3,
  solid,
});

describe('board pressure', () => {
  it('separates logical segments from unique live cells', () => {
    const body = [
      { x: 1, z: 1 },
      { x: 1, z: 2 },
      { x: 1, z: 2 },
      { x: 1, z: 2 },
    ];
    const pressure = boardPressureSnapshot(4, body, [], 11);
    expect(pressure.logicalSegments).toBe(11);
    expect(pressure.uniqueLiveCells).toBe(2);
    expect(pressure.physicalOccupiedCells).toBe(2);
    expect(pressure.committedOccupiedCells).toBe(2);
  });

  it('counts forming terrain as committed but not yet physically lethal', () => {
    const pressure = boardPressureSnapshot(
      4,
      [{ x: 1, z: 1 }],
      [block(2, 2, false)]
    );
    expect(pressure.physicalOccupiedCells).toBe(1);
    expect(pressure.committedOccupiedCells).toBe(2);
    expect(pressure.physicalFreeCells).toBe(15);
    expect(pressure.committedFreeCells).toBe(14);
  });

  it('uses unions, so terrain forming under the body does not double count', () => {
    const body = [{ x: 1, z: 1 }, { x: 1, z: 2 }];
    const pressure = boardPressureSnapshot(4, body, [
      block(1, 2, false),
      block(2, 2, true),
    ]);
    expect(pressure.uniqueLiveCells).toBe(2);
    expect(pressure.committedTerrainCells).toBe(2);
    expect(pressure.committedOccupiedCells).toBe(3);
    expect(pressure.physicalOccupiedCells).toBe(3);
  });

  it('ignores malformed/out-of-bounds cells instead of corrupting another tile', () => {
    const pressure = boardPressureSnapshot(
      4,
      [{ x: -1, z: 0 }, { x: 1.5, z: 1 }, { x: 0, z: 0 }],
      [block(4, 0, true), block(3, 3, true)]
    );
    expect(pressure.uniqueLiveCells).toBe(1);
    expect(pressure.solidTerrainCells).toBe(1);
    expect(pressure.physicalOccupiedCells).toBe(2);
  });

  it('never lets committed free space grow as terrain advances state', () => {
    const body = [{ x: 0, z: 0 }];
    const forming = boardPressureSnapshot(3, body, [block(1, 1, false)]);
    const solid = boardPressureSnapshot(3, body, [block(1, 1, true)]);
    expect(solid.committedFreeCells).toBe(forming.committedFreeCells);
    expect(solid.physicalFreeCells).toBeLessThan(forming.physicalFreeCells);
  });

  it('handles a degenerate board without NaN ratios', () => {
    const pressure = boardPressureSnapshot(0, [], [], 12);
    expect(pressure.logicalSegments).toBe(12);
    expect(pressure.physicalOccupancy).toBe(0);
    expect(pressure.committedOccupancy).toBe(0);
  });
});
