/**
 * Tests for the aim telegraph path projection.
 * The projection must mirror SnakeGameLogic tick semantics: one buffered
 * direction consumed per tick, walls truncate the lane.
 */

import { describe, it, expect } from '@jest/globals';
import {
  findAlignedTargets,
  projectAimPath,
  projectDangerPath,
  type AimTarget,
} from './aimUtils';

const head = { x: 10, y: 0, z: 10 };
const GRID = 20;

const target = (x: number, z: number, kind: AimTarget['kind'] = 'food'): AimTarget => ({
  x,
  z,
  kind,
});

describe('projectAimPath', () => {
  it('projects a straight lane along the current heading with no queue', () => {
    const path = projectAimPath(head, 'RIGHT', [], GRID, 5);
    expect(path).toHaveLength(5);
    expect(path.map(c => c.x)).toEqual([11, 12, 13, 14, 15]);
    expect(path.every(c => c.z === 10)).toBe(true);
    expect(path.every(c => c.direction === 'RIGHT')).toBe(true);
    expect(path.every(c => !c.isTurn)).toBe(true);
  });

  it('applies a queued turn on the first step and marks it as a turn', () => {
    const path = projectAimPath(head, 'RIGHT', ['UP'], GRID, 4);
    // UP consumed immediately (next tick), then heading continues UP
    expect(path[0]).toEqual({ x: 10, z: 9, direction: 'UP', isTurn: true });
    expect(path[1]).toEqual({ x: 10, z: 8, direction: 'UP', isTurn: false });
    expect(path[2].z).toBe(7);
    expect(path[3].z).toBe(6);
  });

  it('projects an S-turn from two queued directions on consecutive steps', () => {
    const path = projectAimPath(head, 'RIGHT', ['UP', 'LEFT'], GRID, 4);
    expect(path[0]).toEqual({ x: 10, z: 9, direction: 'UP', isTurn: true });
    expect(path[1]).toEqual({ x: 9, z: 9, direction: 'LEFT', isTurn: true });
    // Buffer exhausted - continue along the last heading
    expect(path[2]).toEqual({ x: 8, z: 9, direction: 'LEFT', isTurn: false });
    expect(path[3]).toEqual({ x: 7, z: 9, direction: 'LEFT', isTurn: false });
  });

  it('truncates the lane at the arena wall', () => {
    const nearWall = { x: 17, y: 0, z: 10 };
    const path = projectAimPath(nearWall, 'RIGHT', [], GRID, 5);
    // Cells 18, 19 fit; 20 is out of bounds
    expect(path).toHaveLength(2);
    expect(path.map(c => c.x)).toEqual([18, 19]);
  });

  it('returns an empty lane when the head faces the wall from the edge', () => {
    const atWall = { x: 19, y: 0, z: 10 };
    expect(projectAimPath(atWall, 'RIGHT', [], GRID, 5)).toEqual([]);
  });

  it('respects a custom projection length', () => {
    expect(projectAimPath(head, 'DOWN', [], GRID, 3)).toHaveLength(3);
  });
});

describe('projectDangerPath (radar danger sense)', () => {
  it('reports no impact on an open straight path', () => {
    const result = projectDangerPath(head, 'RIGHT', [head], GRID, 5);
    expect(result.impact).toBe(false);
    expect(result.cells).toHaveLength(5);
    expect(result.cells.map(c => c.x)).toEqual([11, 12, 13, 14, 15]);
  });

  it('detects a wall impact within range (cells lead up to the wall)', () => {
    const nearWall = { x: 17, y: 0, z: 10 };
    const result = projectDangerPath(nearWall, 'RIGHT', [nearWall], GRID, 5);
    expect(result.impact).toBe(true);
    expect(result.cells.map(c => c.x)).toEqual([18, 19]);
  });

  it('detects an immediate wall impact with no lead-up cells', () => {
    const atWall = { x: 19, y: 0, z: 10 };
    const result = projectDangerPath(atWall, 'RIGHT', [atWall], GRID, 5);
    expect(result.impact).toBe(true);
    expect(result.cells).toEqual([]);
  });

  it('detects a body impact and includes the impact cell', () => {
    const snake = [
      head,
      { x: 13, y: 0, z: 10 }, // body segment 3 cells ahead
      { x: 13, y: 0, z: 11 },
    ];
    const result = projectDangerPath(head, 'RIGHT', snake, GRID, 5);
    expect(result.impact).toBe(true);
    expect(result.cells).toEqual([
      { x: 11, z: 10 },
      { x: 12, z: 10 },
      { x: 13, z: 10 },
    ]);
  });

  it('ignores the queue: projects the committed heading only', () => {
    // Same as straight projection - the danger read answers "what if I do
    // nothing", so buffered turns are not considered
    const result = projectDangerPath(head, 'UP', [head], GRID, 5);
    expect(result.cells.every(c => c.x === head.x)).toBe(true);
  });

  it('reports no impact when the obstacle is beyond the scan range', () => {
    const snake = [head, { x: 16, y: 0, z: 10 }]; // 6 cells ahead
    const result = projectDangerPath(head, 'RIGHT', snake, GRID, 5);
    expect(result.impact).toBe(false);
    expect(result.cells).toHaveLength(5);
  });
});

describe('findAlignedTargets (gridlock rails)', () => {
  it('finds the nearest target per axis, looking both ways', () => {
    const targets = [
      target(2, 10), // row, 8 left
      target(14, 10), // row, 4 right (nearer)
      target(10, 18), // col, 8 down
      target(10, 7), // col, 3 up (nearer)
    ];
    const aligned = findAlignedTargets(head, targets);
    expect(aligned.row).toBe(targets[1]);
    expect(aligned.col).toBe(targets[3]);
  });

  it('reports null per axis when nothing is aligned', () => {
    const aligned = findAlignedTargets(head, [target(3, 4), target(15, 12)]);
    expect(aligned.row).toBeNull();
    expect(aligned.col).toBeNull();
  });

  it('a single target aligned on both axes is impossible off-cell; the head cell is ignored', () => {
    const aligned = findAlignedTargets(head, [target(10, 10)]);
    expect(aligned.row).toBeNull();
    expect(aligned.col).toBeNull();
  });

  it('breaks equal-distance ties by food > portal > mutation', () => {
    const aligned = findAlignedTargets(head, [
      target(6, 10, 'portal'), // 4 left
      target(14, 10, 'food'), // 4 right
    ]);
    expect(aligned.row?.kind).toBe('food');
  });

  it('row and column are independent scans', () => {
    const targets = [target(1, 10, 'portal'), target(10, 2, 'mutation')];
    const aligned = findAlignedTargets(head, targets);
    expect(aligned.row).toBe(targets[0]);
    expect(aligned.col).toBe(targets[1]);
  });
});
