/**
 * Tests for the aim telegraph path projection.
 * The projection must mirror SnakeGameLogic tick semantics: one buffered
 * direction consumed per tick, walls truncate the lane.
 */

import { describe, it, expect } from '@jest/globals';
import {
  findAlignedTargets,
  findFirstTargetInLine,
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

describe('findFirstTargetInLine (deadeye lock)', () => {
  it('finds the target ahead in all four directions', () => {
    const targets = [
      target(15, 10), // right of head
      target(4, 10), // left of head
      target(10, 3), // up from head
      target(10, 17), // down from head
    ];
    expect(findFirstTargetInLine(head, 'RIGHT', targets, GRID)).toBe(targets[0]);
    expect(findFirstTargetInLine(head, 'LEFT', targets, GRID)).toBe(targets[1]);
    expect(findFirstTargetInLine(head, 'UP', targets, GRID)).toBe(targets[2]);
    expect(findFirstTargetInLine(head, 'DOWN', targets, GRID)).toBe(targets[3]);
  });

  it('ignores targets behind the head', () => {
    const behind = [target(4, 10)];
    expect(findFirstTargetInLine(head, 'RIGHT', behind, GRID)).toBeNull();
    expect(findFirstTargetInLine(head, 'LEFT', behind, GRID)).toBe(behind[0]);
  });

  it('ignores a target on the head cell itself', () => {
    expect(findFirstTargetInLine(head, 'RIGHT', [target(10, 10)], GRID)).toBeNull();
  });

  it('ignores off-line targets', () => {
    const offLine = [target(15, 11), target(9, 9)];
    expect(findFirstTargetInLine(head, 'RIGHT', offLine, GRID)).toBeNull();
  });

  it('stops at the wall: out-of-bounds targets never lock', () => {
    expect(findFirstTargetInLine(head, 'RIGHT', [target(20, 10)], GRID)).toBeNull();
    expect(findFirstTargetInLine(head, 'UP', [target(10, -1)], GRID)).toBeNull();
  });

  it('locks the NEAREST target first', () => {
    const targets = [target(17, 10), target(12, 10), target(14, 10)];
    expect(findFirstTargetInLine(head, 'RIGHT', targets, GRID)).toBe(targets[1]);
  });

  it('prefers food > portal > mutation on the same cell', () => {
    const cell: AimTarget[] = [
      target(13, 10, 'mutation'),
      target(13, 10, 'portal'),
      target(13, 10, 'food'),
    ];
    expect(findFirstTargetInLine(head, 'RIGHT', cell, GRID)?.kind).toBe('food');

    const noFood: AimTarget[] = [
      target(13, 10, 'mutation'),
      target(13, 10, 'portal'),
    ];
    expect(findFirstTargetInLine(head, 'RIGHT', noFood, GRID)?.kind).toBe('portal');
  });

  it('a nearer mutation still beats a farther food (priority is a tie-break only)', () => {
    const targets: AimTarget[] = [target(12, 10, 'mutation'), target(15, 10, 'food')];
    expect(findFirstTargetInLine(head, 'RIGHT', targets, GRID)?.kind).toBe('mutation');
  });

  it('returns null with no targets', () => {
    expect(findFirstTargetInLine(head, 'RIGHT', [], GRID)).toBeNull();
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
