import { describe, expect, it } from '@jest/globals';
import { createInterpolationBuffer, recordTick } from './interpolationBuffer';
import {
  createTrailCellState,
  resetTrailCells,
  updateTrailCells,
} from './trailCells';

const at = (x: number, z: number) => ({ x, y: 0, z });

describe('cell-persistent trail state', () => {
  it('keeps stationary occupancy stable while segment identity advances', () => {
    const buffer = createInterpolationBuffer();
    const cells = createTrailCellState(20);
    recordTick(buffer, [at(5, 5), at(4, 5), at(3, 5), at(2, 5)], 100, 0);
    updateTrailCells(cells, buffer);
    recordTick(buffer, [at(6, 5), at(5, 5), at(4, 5), at(3, 5)], 100, 100);
    updateTrailCells(cells, buffer);

    expect(cells.currentCount).toBe(3);
    expect(cells.departingCount).toBe(1);
    const persistent = 5 * 20 + 4;
    expect(cells.previousMask[persistent]).toBe(1);
    expect(cells.currentMask[persistent]).toBe(1);
  });

  it('deduplicates stacked logical segments into one rendered cell', () => {
    const buffer = createInterpolationBuffer();
    const cells = createTrailCellState(20);
    recordTick(
      buffer,
      [at(5, 5), at(4, 5), at(3, 5), at(3, 5), at(3, 5)],
      100,
      0
    );
    updateTrailCells(cells, buffer);
    expect(cells.currentCount).toBe(2);
    expect(cells.currentRepresentative[5 * 20 + 3]).toBe(2);
  });

  it('holds deposited band phases on persistent coil cells', () => {
    const buffer = createInterpolationBuffer();
    const cells = createTrailCellState(20);
    recordTick(
      buffer,
      [at(5, 5), at(4, 5), at(3, 5), at(2, 5), at(1, 5), at(1, 6)],
      100,
      0
    );
    updateTrailCells(cells, buffer);
    const stable = 5 * 20 + 3;
    const phase = cells.bandPhase[stable];
    recordTick(
      buffer,
      [at(6, 5), at(5, 5), at(4, 5), at(3, 5), at(2, 5), at(1, 5)],
      100,
      100
    );
    updateTrailCells(cells, buffer);
    expect(cells.bandPhase[stable]).toBe(phase);
  });

  it('suppresses a body instance under an overlapped revive head', () => {
    const buffer = createInterpolationBuffer();
    const cells = createTrailCellState(20);
    recordTick(buffer, [at(5, 5), at(5, 5), at(4, 5)], 100, 0);
    updateTrailCells(cells, buffer);
    expect(cells.currentCount).toBe(1);
    expect(cells.currentMask[5 * 20 + 5]).toBe(0);
  });

  it('resets all carried occupancy and band history between runs', () => {
    const buffer = createInterpolationBuffer();
    const cells = createTrailCellState(20);
    recordTick(buffer, [at(5, 5), at(4, 5)], 100, 0);
    updateTrailCells(cells, buffer);
    resetTrailCells(cells);
    expect(cells.currentCount).toBe(0);
    expect(cells.initialized).toBe(false);
    expect(Array.from(cells.currentMask).some(Boolean)).toBe(false);
  });
});
