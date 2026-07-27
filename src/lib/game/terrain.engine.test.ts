/**
 * CYBER's closing arena, in the engine (WP-3.03).
 *
 * `terrain.test.ts` covers the schedule and the placement rule as pure
 * functions. This covers what the ENGINE does with them, and in particular the
 * two properties the design rests on:
 *
 *   1. a solid block is never overlapped by any part of the snake, and
 *   2. free space only ever shrinks (Rule 15).
 */

import { describe, it, expect } from '@jest/globals';
import { SnakeGameLogic } from './SnakeGameLogic';
import { RULESETS } from '@/shared/game/rulesets';
import { cellKey } from '@/shared/game/terrain';

function cyber(gridSize = 20): SnakeGameLogic {
  const game = new SnakeGameLogic({
    gridSize,
    ruleset: RULESETS.CYBER,
    rng: () => 0.5,
  });
  game.start();
  return game;
}

/** Eat straight ahead until the runway ends; the caller asserts on the result. */
function eat(game: SnakeGameLogic, count: number, gridSize = 20): void {
  for (let i = 0; i < count; i++) {
    const head = game.getState().snake[0];
    const x = head.x + 1;
    if (x >= gridSize - 1) return;
    game.placeFood({ x, y: 0, z: head.z });
    game.tick();
  }
}

describe('the arena closes (CYBER)', () => {
  it('places nothing before the first interval', () => {
    const game = cyber();
    eat(game, 4);
    expect(game.getState().terrain).toHaveLength(0);
  });

  it('places a batch once the interval is reached', () => {
    const game = cyber();
    eat(game, 5);
    expect(game.getState().terrain.length).toBe(6);
  });

  it('blocks arrive FORMING, not lethal', () => {
    const game = cyber();
    eat(game, 5);
    const terrain = game.getState().terrain;
    expect(terrain.every((b) => !b.solid)).toBe(true);
    expect(terrain.every((b) => b.formingTicks > 0)).toBe(true);
  });

  it('a forming block solidifies after its window', () => {
    // A wide board so the snake has runway to outlast the forming window
    // without turning into a wall - the window is ~2s, i.e. ~10 ticks at
    // CYBER's early tick, and each tick advances the head one cell.
    const game = cyber(60);
    eat(game, 5, 60);
    expect(game.getState().terrain.length).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) {
      const state = game.getState();
      if (state.isGameOver || state.isDeathSequence) break;
      game.placeFood({ x: 0, y: 0, z: 0 });
      game.tick();
    }
    expect(game.getState().terrain.some((b) => b.solid)).toBe(true);
  });

  it('NEVER overlaps the snake once solid — the structural invariant', () => {
    const game = cyber(12);
    for (let i = 0; i < 200; i++) {
      const state = game.getState();
      if (state.isGameOver || state.isDeathSequence) break;
      const head = state.snake[0];
      game.placeFood({ x: (head.x + 1) % 12, y: 0, z: head.z });
      game.tick();

      const solid = new Set(
        game
          .getState()
          .terrain.filter((b) => b.solid)
          .map((b) => cellKey(b.x, b.z))
      );
      for (const seg of game.getState().snake) {
        expect(solid.has(cellKey(seg.x, seg.z))).toBe(false);
      }
    }
  });

  it('terrain only ever grows — Rule 15 in the engine', () => {
    const game = cyber(12);
    let previous = 0;
    for (let i = 0; i < 200; i++) {
      const state = game.getState();
      if (state.isGameOver || state.isDeathSequence) break;
      const head = state.snake[0];
      game.placeFood({ x: (head.x + 1) % 12, y: 0, z: head.z });
      game.tick();
      const count = game.getState().terrain.length;
      expect(count).toBeGreaterThanOrEqual(previous);
      previous = count;
    }
  });

  it('food never spawns inside terrain', () => {
    const game = cyber(12);
    for (let i = 0; i < 120; i++) {
      const state = game.getState();
      if (state.isGameOver || state.isDeathSequence) break;
      game.spawnFood();
      const blocked = new Set(
        game.getState().terrain.map((b) => cellKey(b.x, b.z))
      );
      for (const food of game.getState().foods) {
        expect(blocked.has(cellKey(food.x, food.z))).toBe(false);
      }
      const head = game.getState().snake[0];
      game.placeFood({ x: (head.x + 1) % 12, y: 0, z: head.z });
      game.tick();
    }
  });

  it('PRIMAL and COSMIC have no arena — this is CYBER\'s identity', () => {
    for (const id of ['PRIMAL', 'COSMIC'] as const) {
      const game = new SnakeGameLogic({
        gridSize: 20,
        ruleset: RULESETS[id],
        rng: () => 0.5,
      });
      game.start();
      eat(game, 15);
      expect(game.getState().terrain).toHaveLength(0);
    }
  });
});
