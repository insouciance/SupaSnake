/**
 * Tests for the aim telegraph path projection.
 * The projection must mirror SnakeGameLogic tick semantics: one buffered
 * direction consumed per tick, walls truncate the lane.
 */

import { describe, it, expect } from '@jest/globals';
import { projectAimPath } from './aimUtils';

const head = { x: 10, y: 0, z: 10 };
const GRID = 20;

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
