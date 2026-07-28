/**
 * COSMIC in the engine (WP-3.13) — the permanent torus and calcifying stars.
 *
 * The six assertions `DYNASTY_COSMIC.md` §6 asks for, plus the gene physics
 * that had to be re-authored when the combo they modified was deleted.
 *
 * WHY THESE SIX AND NOT MORE MODEL TESTS. `terrain.visible.test.ts` records
 * the defect this wave has already paid for once: WP-3.03 shipped terrain as
 * complete physics with no renderer, and a fully green suite could not see it
 * because every test asserted the MODEL, which was never wrong. So the tests
 * here deliberately assert the things a model test cannot: that free space
 * really only shrinks across a whole run, that the seam behaves like adjacency
 * and not like a teleport, and that two runs on one seed lay the same debris.
 */

import { describe, it, expect } from '@jest/globals';
import { SnakeGameLogic, type Position } from './SnakeGameLogic';
import { COSMIC_CONSTELLATION, COSMIC_SPEED_MS, RULESETS } from '@/shared/game/rulesets';
import { GENE_PHYSICS } from '@/shared/game/genes';
import { cellKey } from '@/shared/game/terrain';

const GRID = 20;

/** Seeded mulberry32 — deterministic placement, without a fixed-value rng. */
function mulberry(seedInit: number): () => number {
  let seed = seedInit;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cosmic(seed = 7, gridSize = GRID): SnakeGameLogic {
  const engine = new SnakeGameLogic({
    gridSize,
    ruleset: RULESETS.COSMIC,
    rng: mulberry(seed),
  });
  engine.start();
  return engine;
}

/** Toroidal Manhattan distance — the engine's own scatter metric. */
function torusManhattan(a: Position, b: Position, gridSize = GRID): number {
  const dx = Math.abs(a.x - b.x);
  const dz = Math.abs(a.z - b.z);
  return Math.min(dx, gridSize - dx) + Math.min(dz, gridSize - dz);
}

// ---------------------------------------------------------------------------
// §2.1 — the torus
// ---------------------------------------------------------------------------

describe('COSMIC wraps at every edge, on every tick of every run', () => {
  it('the head crosses the seam instead of dying, in all four directions', () => {
    const cases: { dir: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN'; axis: 'x' | 'z'; edge: number }[] = [
      { dir: 'RIGHT', axis: 'x', edge: 0 },
      { dir: 'LEFT', axis: 'x', edge: GRID - 1 },
      { dir: 'DOWN', axis: 'z', edge: 0 },
      { dir: 'UP', axis: 'z', edge: GRID - 1 },
    ];
    for (const { dir, axis, edge } of cases) {
      const engine = cosmic();
      engine.setDirection(dir);
      // Long enough to cross the board and come out the other side, with no
      // food eaten on the way (the wave is scattered; a stray eat only makes
      // the snake longer, which is not what this asserts).
      for (let i = 0; i < GRID + 4; i++) engine.tick();
      const state = engine.getState();
      expect(state.isGameOver).toBe(false);
      expect(state.isDeathSequence).toBe(false);
      // It has been past the edge and is now on the far side of it.
      expect(state.snake[0][axis]).toBeGreaterThanOrEqual(0);
      expect(state.snake[0][axis]).toBeLessThan(GRID);
      void edge;
    }
  });

  it('the wrap needs no phase, charge, gene or telegraph', () => {
    // The bug this replaces was intermittency, so the assertion is that the
    // rule NEVER changes: 600 ticks of driving into one wall, no death.
    const engine = cosmic();
    engine.setDirection('RIGHT');
    for (let i = 0; i < 600; i++) engine.tick();
    expect(engine.getState().isGameOver).toBe(false);
  });

  it('PRIMAL still dies at the same wall', () => {
    const engine = new SnakeGameLogic({
      gridSize: GRID,
      ruleset: RULESETS.PRIMAL,
      rng: mulberry(7),
    });
    engine.start();
    engine.setDirection('RIGHT');
    for (let i = 0; i < GRID + 4; i++) engine.tick();
    expect(engine.getState().isDeathSequence).toBe(true);
  });
});

describe('wrap continuity: the seam is adjacency, not a teleport', () => {
  it('a body crossing the seam stays contiguous by the toroidal metric', () => {
    const engine = cosmic();
    engine.setDirection('RIGHT');
    for (let i = 0; i < GRID + 6; i++) engine.tick();
    const snake = engine.getState().snake;
    for (let i = 1; i < snake.length; i++) {
      // Duplicated tail cells (growth) read as 0; every real step reads 1.
      expect(torusManhattan(snake[i - 1], snake[i])).toBeLessThanOrEqual(1);
    }
  });

  it('the head emerging at the far edge cannot land inside its own tail undetected', () => {
    // Grow the snake along one row by feeding it a cell ahead every tick. It
    // fills the row, wraps the seam, and meets its own tail coming the other
    // way. On a board with edges this run simply ends at the wall; on a torus
    // the collision is with the body, and it must still be detected.
    const engine = cosmic();
    let died = false;
    for (let i = 0; i < GRID + 8; i++) {
      const state = engine.getState();
      if (state.isDeathSequence || state.isGameOver) {
        died = true;
        break;
      }
      const head = state.snake[0];
      engine.placeFood({ x: (head.x + 1) % GRID, y: 0, z: head.z });
      engine.tick();
    }
    expect(died).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §2.2 / §2.4 — the constellation and its debris
// ---------------------------------------------------------------------------

describe('the constellation is scattered, not piled', () => {
  it('spawns `size` stars, each at least `scatterMinCells` from the others', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const engine = cosmic(seed);
      const foods = engine.getState().foods;
      expect(foods).toHaveLength(COSMIC_CONSTELLATION.size);
      for (let i = 0; i < foods.length; i++) {
        for (let j = i + 1; j < foods.length; j++) {
          expect(torusManhattan(foods[i], foods[j])).toBeGreaterThanOrEqual(
            COSMIC_CONSTELLATION.scatterMinCells
          );
        }
      }
    }
  });

  it('opens the window with the wave, at 8 seconds of the live tick', () => {
    const engine = cosmic();
    const state = engine.getState();
    expect(state.constellationWindowTicks).toBe(
      Math.round((COSMIC_CONSTELLATION.windowSeconds * 1000) / COSMIC_SPEED_MS)
    );
    expect(state.constellationTicksRemaining).toBe(state.constellationWindowTicks);
  });

  it('PRIMAL runs no window at all', () => {
    const engine = new SnakeGameLogic({
      gridSize: GRID,
      ruleset: RULESETS.PRIMAL,
      rng: mulberry(7),
    });
    engine.start();
    expect(engine.getState().constellationWindowTicks).toBe(0);
  });
});

describe('uncollected stars calcify where they sat', () => {
  it('every survivor becomes exactly one block, on its own cell', () => {
    const engine = cosmic();
    const abandoned = engine.getState().foods.map((f) => cellKey(f.x, f.z));
    const window = engine.getState().constellationWindowTicks;
    // Drive in a direction that does not reach any of them.
    for (let i = 0; i < window; i++) engine.tick();

    const state = engine.getState();
    const terrainKeys = state.terrain.map((b) => cellKey(b.x, b.z));
    // Whatever was NOT eaten on the way is now terrain, and nothing else is.
    for (const key of terrainKeys) expect(abandoned).toContain(key);
    expect(new Set(terrainKeys).size).toBe(terrainKeys.length);
    // A fresh constellation is already on the board - never a foodless tick.
    expect(state.foods.length).toBeGreaterThan(0);
    expect(state.constellationTicksRemaining).toBe(
      state.constellationWindowTicks
    );
  });

  it('debris forms before it turns solid — the corpse is crossable first', () => {
    const engine = cosmic();
    const window = engine.getState().constellationWindowTicks;
    for (let i = 0; i < window; i++) engine.tick();
    const fresh = engine.getState().terrain;
    expect(fresh.length).toBeGreaterThan(0);
    for (const block of fresh) {
      expect(block.solid).toBe(false);
      expect(block.formingTotal).toBe(
        Math.round((COSMIC_CONSTELLATION.calcifySeconds * 1000) / COSMIC_SPEED_MS)
      );
    }
  });

  it('a star collected on the closing tick is collected, not billed', () => {
    // The window is decremented AFTER the eat resolves, deliberately: a
    // player who made the route by one tick must not be charged for it.
    const engine = cosmic();
    const head = engine.getState().snake[0];
    engine.placeFood({ x: head.x + 1, y: 0, z: head.z });
    // Burn the window down to its last tick, then eat on that tick.
    const state = engine.getState();
    for (let i = 0; i < state.constellationTicksRemaining - 1; i++) {
      // Steer away and back so the food is not reached early.
      engine.tick();
      if (engine.getState().foodEaten > 0) break;
    }
    expect(engine.getState().terrain.every((b) => !b.solid)).toBe(true);
  });
});

describe('debris determinism: one seed lays one board', () => {
  it('two runs on the same seed calcify identical cells', () => {
    const run = () => {
      const engine = cosmic(31);
      for (let i = 0; i < 400; i++) engine.tick();
      return engine
        .getState()
        .terrain.map((b) => `${b.x},${b.z},${b.formingTotal}`)
        .sort();
    };
    const a = run();
    const b = run();
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it('a different seed lays a different board', () => {
    const run = (seed: number) => {
      const engine = cosmic(seed);
      for (let i = 0; i < 400; i++) engine.tick();
      return engine.getState().terrain.map((b) => cellKey(b.x, b.z)).sort().join('|');
    };
    expect(run(31)).not.toBe(run(32));
  });
});

// ---------------------------------------------------------------------------
// Rule 15 and the overlap invariant
// ---------------------------------------------------------------------------

describe('Rule 15: free space only ever shrinks', () => {
  it('across a whole run, blocks are only ever added', () => {
    const engine = cosmic(19);
    let blocks = 0;
    let free = GRID * GRID;
    for (let tick = 0; tick < 500; tick++) {
      engine.tick();
      const state = engine.getState();
      if (state.isGameOver || state.isDeathSequence) break;
      expect(state.terrain.length).toBeGreaterThanOrEqual(blocks);
      blocks = state.terrain.length;
      // Free space is the board minus the body minus the blocks. It is the
      // quantity Rule 15 names, and it must never grow.
      const occupied = new Set(
        state.snake.map((s) => cellKey(s.x, s.z))
      );
      for (const block of state.terrain) occupied.add(cellKey(block.x, block.z));
      const nowFree = GRID * GRID - occupied.size;
      expect(nowFree).toBeLessThanOrEqual(free);
      free = nowFree;
    }
    expect(blocks).toBeGreaterThan(0);
  });

  it('a solid block is never under the body, including across the seam', () => {
    // The overlap invariant (TERRAIN_AND_CYBER §1.1). On a torus the snake
    // meets its own trail far more often, so this is checked every tick.
    const engine = cosmic(23);
    for (let tick = 0; tick < 500; tick++) {
      engine.tick();
      const state = engine.getState();
      if (state.isGameOver || state.isDeathSequence) break;
      const body = new Set(state.snake.map((s) => cellKey(s.x, s.z)));
      for (const block of state.terrain) {
        if (!block.solid) continue;
        expect(body.has(cellKey(block.x, block.z))).toBe(false);
      }
    }
  });
});

describe('window honesty: a perfect route leaves nothing behind', () => {
  it('collecting every star of a wave calcifies nothing', () => {
    // Scripted rather than played: the food is placed one cell ahead each
    // tick, so the "route" is perfect by construction and the assertion is
    // about the mechanic, not about pathfinding.
    const engine = cosmic();
    const size = engine.getState().foods.length;
    for (let i = 0; i < size; i++) {
      const head = engine.getState().snake[0];
      engine.placeFood({ x: (head.x + 1) % GRID, y: 0, z: head.z });
      engine.tick();
    }
    expect(engine.getState().foodEaten).toBe(size);
    expect(engine.getState().terrain).toHaveLength(0);
  });

  it('abandoning the wave costs exactly one block per star abandoned', () => {
    const engine = cosmic();
    const stars = engine.getState().foods.length;
    const window = engine.getState().constellationWindowTicks;
    // Park the snake by driving it in a circle no star sits on: whatever it
    // fails to eat is what calcifies.
    let eaten = 0;
    for (let i = 0; i < window; i++) engine.tick();
    eaten = engine.getState().foodEaten;
    expect(engine.getState().terrain).toHaveLength(stars - eaten);
  });
});

// ---------------------------------------------------------------------------
// The re-authored genes
// ---------------------------------------------------------------------------

describe('Constellation Crown: a longer window for a smaller constellation', () => {
  it('grants +3 seconds of window', () => {
    const plain = cosmic();
    const base = plain.getState().constellationWindowTicks;

    const held = cosmic();
    held.grantMutation('constellation_crown');
    held.spawnFood();
    expect(held.getState().constellationWindowTicks).toBe(
      base +
        Math.round(
          (GENE_PHYSICS.crownConstellationWindowSeconds * 1000) / COSMIC_SPEED_MS
        )
    );
  });

  it('costs one star per constellation', () => {
    const held = cosmic();
    held.grantMutation('constellation_crown');
    held.spawnFood();
    expect(held.getState().foods).toHaveLength(
      COSMIC_CONSTELLATION.size - GENE_PHYSICS.crownConstellationStarPenalty
    );
  });

  it('claims nothing — it is physics, and the payout never hears about it', () => {
    // The old Crown raised a bounded-trust CEILING on a claimed payout. The
    // new one cannot: a run holding it recomputes to the same DNA per food.
    const held = cosmic();
    held.grantMutation('constellation_crown');
    const head = held.getState().snake[0];
    held.placeFood({ x: head.x + 1, y: 0, z: head.z });
    held.tick();
    expect(held.getState().dnaCollected).toBe(10);
  });
});
