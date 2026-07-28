/**
 * Terrain in the engine: CYBER's closing arena (WP-3.03) and PRIMAL's Fortress
 * (WP-3.11), which reach the same primitive by different routes.
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

  it("the closing RING is CYBER's identity — terrain itself is not", () => {
    // WP-3.11 rewrote this case rather than deleting it, because what it said
    // ("PRIMAL and COSMIC have no arena") stopped being what it MEANT the
    // moment PRIMAL's FERAL-2 Fortress started laying blocks. Fortress is not
    // an arena: it is not ring-selected, not schedule-placed, and not a
    // property of the ruleset - it petrifies the cells the body is already
    // standing on, on a build the player chose.
    //
    // So the assertion is now made in the terms it was always about: the
    // `arena` SCHEDULE - the board closing from the outside in - belongs to
    // CYBER alone, and a PRIMAL or COSMIC run with no such build stays clear.
    expect(RULESETS.CYBER.arena).toBeDefined();
    expect(RULESETS.PRIMAL.arena).toBeUndefined();
    expect(RULESETS.COSMIC.arena).toBeUndefined();
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

describe("PRIMAL's Fortress lays terrain without an arena (WP-3.11)", () => {
  /** A PRIMAL genome run whose FERAL Expression is live from food 0. */
  function fortress(gridSize = 160): SnakeGameLogic {
    const game = new SnakeGameLogic({
      gridSize,
      ruleset: RULESETS.PRIMAL,
      rng: () => 0.5,
      genome: { runSeed: 'fortress-engine', heirloom: {} },
    });
    game.start();
    game.grantMutation('overgrowth', 0);
    game.grantMutation('deep_roots', 0);
    game.grantMutation('glacial_reserve', 0);
    expect(game.getState().strainTiers.FERAL).toBe(2);
    return game;
  }

  it('FREE SPACE ONLY SHRINKS across a petrification — Rule 15 on the board', () => {
    // The claim the whole design rests on: at the instant the segments turn to
    // stone the count of occupied cells is UNCHANGED (the cells they vacated
    // are the cells the blocks took), and from then on it can only grow.
    const game = fortress();
    const occupied = () => {
      const cells = new Set<string>();
      for (const seg of game.getState().snake) cells.add(cellKey(seg.x, seg.z));
      for (const b of game.getState().terrain) cells.add(cellKey(b.x, b.z));
      return cells.size;
    };
    eat(game, 19, 160);
    const before = occupied();
    eat(game, 1, 160);
    expect(game.getState().terrain.length).toBeGreaterThan(0);
    // Food 20 grows the body by its own growth and petrifies six segments; the
    // occupied count therefore rises by the growth and never falls.
    expect(occupied()).toBeGreaterThanOrEqual(before);
  });

  it('terrain only ever grows, and a solid block never overlaps the snake', () => {
    const game = fortress(60);
    let previous = 0;
    for (let i = 0; i < 120; i++) {
      const state = game.getState();
      if (state.isGameOver || state.isDeathSequence) break;
      const head = state.snake[0];
      game.placeFood({ x: (head.x + 1) % 60, y: 0, z: head.z });
      game.tick();
      if (game.getState().pendingChoice) game.declineMutation();
      const after = game.getState();
      expect(after.terrain.length).toBeGreaterThanOrEqual(previous);
      previous = after.terrain.length;
      const solid = new Set(
        after.terrain.filter((b) => b.solid).map((b) => cellKey(b.x, b.z))
      );
      for (const seg of after.snake) {
        expect(solid.has(cellKey(seg.x, seg.z))).toBe(false);
      }
    }
    expect(previous).toBeGreaterThan(0);
  });

  it('the blocks it lays are drawn by the same renderer CYBER uses', () => {
    // Fortress needs no renderer of its own, and that is deliberate: it emits
    // the SAME `TerrainBlock` the arena does, into the same `state.terrain`,
    // which `TerrainBlocks` draws unconditionally. The structural check that
    // the renderer is mounted lives in `terrain.visible.test.ts`.
    const game = fortress();
    eat(game, 20, 160);
    const block = game.getState().terrain[0];
    expect(block).toEqual(
      expect.objectContaining({
        x: expect.any(Number),
        z: expect.any(Number),
        formingTicks: expect.any(Number),
        formingTotal: expect.any(Number),
        solid: false,
      })
    );
    expect(block.formingTotal).toBe(block.formingTicks);
  });
});
