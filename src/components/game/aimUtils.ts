/**
 * Aim telegraph math - pure helpers for the pro path projection.
 *
 * Mirrors SnakeGameLogic tick semantics exactly: the engine consumes one
 * buffered direction per tick (queued[i] applies on tick i), so the
 * projected lane is the true path the snake will take if no further input
 * arrives. Kept free of three.js/React so it unit-tests in isolation.
 */

import type { Direction, Position } from '@/lib/game/SnakeGameLogic';

export interface AimCell {
  x: number;
  z: number;
  /** Heading the snake will have when entering this cell */
  direction: Direction;
  /** True when a queued turn executes entering this cell */
  isTurn: boolean;
}

export const DIRECTION_DELTAS: Record<Direction, { x: number; z: number }> = {
  UP: { x: 0, z: -1 },
  DOWN: { x: 0, z: 1 },
  LEFT: { x: -1, z: 0 },
  RIGHT: { x: 1, z: 0 },
};

/**
 * Yaw (rotation.y) that points the chevron geometry (authored tip-forward
 * along -Z after its flat -PI/2 X-rotation) toward each grid direction.
 */
export const DIRECTION_YAW: Record<Direction, number> = {
  UP: 0,
  RIGHT: -Math.PI / 2,
  DOWN: Math.PI,
  LEFT: Math.PI / 2,
};

/**
 * Project the snake's true upcoming path from the head.
 *
 * Step i takes queued[i] when buffered (matching one-input-per-tick
 * consumption), otherwise continues the last heading. Projection stops at
 * the arena wall - a truncated lane is itself a danger read for the player.
 */
export function projectAimPath(
  head: Position,
  direction: Direction,
  queued: readonly Direction[],
  gridSize: number,
  length = 5
): AimCell[] {
  const cells: AimCell[] = [];
  let x = head.x;
  let z = head.z;
  let heading = direction;

  for (let i = 0; i < length; i++) {
    const next = queued[i] ?? heading;
    const delta = DIRECTION_DELTAS[next];
    x += delta.x;
    z += delta.z;
    if (x < 0 || x >= gridSize || z < 0 || z >= gridSize) break;
    cells.push({ x, z, direction: next, isTurn: next !== heading });
    heading = next;
  }

  return cells;
}
