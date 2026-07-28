/**
 * Engine tests for per-dynasty Mastery (Design v2 section 7.1):
 * - the offer RNG draws ONLY from the injected unlocked pool
 * - the [P]hysical sides of the nine mastery mutations (portal windows,
 *   Starweaver's extra star + shorter window, Gravity Well pull, Event
 *   Horizon's slower calcification + wider scatter)
 * - engine/recompute parity for the Deep Roots flat [E] bonus
 */

import { describe, it, expect } from '@jest/globals';
import { SnakeGameLogic } from './SnakeGameLogic';
import {
  COSMIC_CONSTELLATION,
  COSMIC_SPEED_MS,
  RULESETS,
  computeRunTotals,
} from '@/shared/game/rulesets';
import {
  MUTATION_PHYSICS,
  MUTATION_POOL,
  type MutationId,
} from '@/shared/game/mutations';

/** Eat `count` foods deterministically by placing food in the snake's path. */
function eatFoods(game: SnakeGameLogic, count: number): void {
  for (let i = 0; i < count; i++) {
    const state = game.getState();
    expect(state.isGameOver).toBe(false);
    expect(state.pendingChoice).toBeNull();
    game.placeFood({ x: state.snake[0].x + 1, y: 0, z: state.snake[0].z });
    game.tick();
  }
}

/** Seeded mulberry32 PRNG - deterministic cadence rolls + offers. */
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

function newGame(
  options: {
    ruleset?: (typeof RULESETS)[keyof typeof RULESETS];
    mutationPool?: MutationId[];
    seed?: number;
  } = {}
): SnakeGameLogic {
  const game = new SnakeGameLogic({
    gridSize: 200,
    ruleset: options.ruleset ?? RULESETS.PRIMAL,
    rng: mulberry(options.seed ?? 7),
    ...(options.mutationPool ? { mutationPool: options.mutationPool } : {}),
  });
  game.start();
  return game;
}

describe('mutation pool plumbing', () => {
  it('defaults to the base pool; constructor + setMutationPool round-trip', () => {
    const game = new SnakeGameLogic({});
    expect(game.getMutationPool()).toEqual(MUTATION_POOL);
    game.setMutationPool([...MUTATION_POOL, 'deep_roots']);
    expect(game.getMutationPool()).toEqual([...MUTATION_POOL, 'deep_roots']);
  });

  it('an empty pool falls back to the base ten (defensive)', () => {
    const game = new SnakeGameLogic({ mutationPool: [] });
    expect(game.getMutationPool()).toEqual(MUTATION_POOL);
    game.setMutationPool([]);
    expect(game.getMutationPool()).toEqual(MUTATION_POOL);
  });
});

describe('offer RNG draws only from the injected pool', () => {
  it('a 2-mutation pool always offers exactly those two', () => {
    const game = newGame({
      mutationPool: ['deep_roots', 'ancient_grove'],
    });
    const head = game.getState().snake[0];
    game.placeMutation({ x: head.x + 1, y: 0, z: head.z });
    game.tick();
    const choice = game.getState().pendingChoice;
    expect(choice).not.toBeNull();
    expect([...(choice as [MutationId, MutationId])].sort()).toEqual([
      'ancient_grove',
      'deep_roots',
    ]);
  });

  it('held mutations are excluded; fewer than 2 remaining => no offer', () => {
    const game = newGame({
      mutationPool: ['deep_roots', 'ancient_grove', 'tectonic_patience'],
    });
    game.grantMutation('deep_roots');
    game.grantMutation('ancient_grove');
    const head = game.getState().snake[0];
    game.placeMutation({ x: head.x + 1, y: 0, z: head.z });
    game.tick();
    // Only tectonic_patience remains - a choice-of-2 cannot be formed
    expect(game.getState().pendingChoice).toBeNull();
  });

  it('the default pool never offers a mastery mutation', () => {
    // 40 independent offer draws across seeds: every offered id must be
    // one of the Launch Ten (the base pool simply does not contain the
    // mastery ids, so this documents the gating end-to-end).
    for (let seed = 1; seed <= 40; seed++) {
      const game = newGame({ seed });
      const head = game.getState().snake[0];
      game.placeMutation({ x: head.x + 1, y: 0, z: head.z });
      game.tick();
      const choice = game.getState().pendingChoice;
      expect(choice).not.toBeNull();
      for (const id of choice as [MutationId, MutationId]) {
        expect(MUTATION_POOL).toContain(id);
      }
    }
  });
});

describe('portal-window physics (Deep Roots / Afterburner / Tectonic Patience)', () => {
  const place = (game: SnakeGameLogic) => {
    game.placeExit({ x: 190, y: 0, z: 190 });
    return game.getState().exitTicksRemaining;
  };

  it('Deep Roots: portals despawn 10 ticks sooner (90 -> 80)', () => {
    const game = newGame({});
    game.grantMutation('deep_roots');
    expect(place(game)).toBe(80);
  });

  it('Afterburner: portals despawn 20 ticks sooner (90 -> 70)', () => {
    const game = newGame({});
    game.grantMutation('afterburner');
    expect(place(game)).toBe(70);
  });

  it('Tectonic Patience: portals linger 30 ticks longer (90 -> 120)', () => {
    const game = newGame({});
    game.grantMutation('tectonic_patience');
    expect(place(game)).toBe(120);
  });

  it('stacks with Gold Trail: 60-tick cap, then -10 Deep Roots => 50', () => {
    const game = newGame({});
    game.grantMutation('gold_trail');
    game.grantMutation('deep_roots');
    expect(place(game)).toBe(50);
  });

  it('a live portal is clamped down when a window-cost mutation is picked', () => {
    const game = newGame({});
    game.placeExit({ x: 190, y: 0, z: 190 });
    expect(game.getState().exitTicksRemaining).toBe(90);
    game.grantMutation('afterburner');
    expect(game.getState().exitTicksRemaining).toBe(70);
  });

  it('a live portal is NOT extended by Tectonic Patience mid-window', () => {
    const game = newGame({});
    game.placeExit({ x: 190, y: 0, z: 190 });
    game.grantMutation('tectonic_patience');
    expect(game.getState().exitTicksRemaining).toBe(90);
  });
});

describe('Starweaver (COSMIC M3): one more star, one second less', () => {
  it('constellations spawn an extra star', () => {
    const game = newGame({ ruleset: RULESETS.COSMIC });
    expect(game.getState().foods).toHaveLength(COSMIC_CONSTELLATION.size);
    game.grantMutation('starweaver');
    game.spawnFood();
    expect(game.getState().foods).toHaveLength(
      COSMIC_CONSTELLATION.size + MUTATION_PHYSICS.starweaverExtraGroupFood
    );
  });

  it('and the window that has to cover them is a second shorter', () => {
    const game = newGame({ ruleset: RULESETS.COSMIC });
    const base = game.getState().constellationWindowTicks;
    game.grantMutation('starweaver');
    game.spawnFood();
    // 1 second at COSMIC's 160ms tick is 6.25 ticks, rounded to the tick.
    expect(game.getState().constellationWindowTicks).toBeLessThan(base);
    expect(base - game.getState().constellationWindowTicks).toBe(
      Math.round(
        (COSMIC_CONSTELLATION.windowSeconds * 1000) / COSMIC_SPEED_MS
      ) -
        Math.round(
          ((COSMIC_CONSTELLATION.windowSeconds -
            MUTATION_PHYSICS.starweaverWindowSecondsPenalty) *
            1000) /
            COSMIC_SPEED_MS
        )
    );
  });

  it('does nothing outside COSMIC (no constellation)', () => {
    const game = newGame({ ruleset: RULESETS.PRIMAL });
    game.grantMutation('starweaver');
    game.spawnFood();
    expect(game.getState().foods).toHaveLength(1);
  });
});

describe('Gravity Well (COSMIC M6): radius-3 pull', () => {
  it('pulls food 3 cells away toward the head (Magnet Pulse would not)', () => {
    const game = newGame({});
    game.grantMutation('gravity_well');
    const head = game.getState().snake[0];
    // 3 cells ahead of where the head will be after this tick
    game.placeFood({ x: head.x + 4, y: 0, z: head.z });
    game.tick();
    const state = game.getState();
    // Head advanced 1; food was 3 away post-move and pulled 1 closer
    expect(state.foods[0].x).toBe(head.x + 3);
  });

  it('Magnet Pulse alone does not reach distance 3', () => {
    const game = newGame({});
    game.grantMutation('magnet_pulse');
    const head = game.getState().snake[0];
    game.placeFood({ x: head.x + 4, y: 0, z: head.z });
    game.tick();
    expect(game.getState().foods[0].x).toBe(head.x + 4);
  });
});

describe('Event Horizon (COSMIC M9): slower corpses, longer routes', () => {
  /** Run the live constellation's window out and return the new terrain. */
  function calcify(game: SnakeGameLogic) {
    const before = game.getState().terrain.length;
    let guard = 0;
    while (game.getState().terrain.length === before && guard < 400) {
      game.tick();
      guard += 1;
    }
    return game.getState().terrain.slice(before);
  }

  it('missed stars spend 4 more seconds forming with the mutation held', () => {
    const plain = newGame({ ruleset: RULESETS.COSMIC });
    const plainForming = calcify(plain)[0].formingTotal;

    const held = newGame({ ruleset: RULESETS.COSMIC });
    held.grantMutation('event_horizon');
    held.spawnFood(); // re-roll the wave so the scatter reflects the gene
    const heldForming = calcify(held)[0].formingTotal;

    expect(heldForming).toBeGreaterThan(plainForming);
    expect(heldForming - plainForming).toBe(
      Math.round(
        (MUTATION_PHYSICS.eventHorizonCalcifySecondsBonus * 1000) /
          COSMIC_SPEED_MS
      )
    );
  });

  it('and the stars sit further apart, so the same window buys less', () => {
    const held = newGame({ ruleset: RULESETS.COSMIC, seed: 4 });
    held.grantMutation('event_horizon');
    held.spawnFood();
    const foods = held.getState().foods;
    const min = COSMIC_CONSTELLATION.scatterMinCells +
      MUTATION_PHYSICS.eventHorizonScatterPenalty;
    for (let i = 0; i < foods.length; i++) {
      for (let j = i + 1; j < foods.length; j++) {
        const dx = Math.abs(foods[i].x - foods[j].x);
        const dz = Math.abs(foods[i].z - foods[j].z);
        expect(
          Math.min(dx, 200 - dx) + Math.min(dz, 200 - dz)
        ).toBeGreaterThanOrEqual(min);
      }
    }
  });
});

describe('Deep Roots engine/recompute parity ([E] exactness)', () => {
  it('engine dnaCollected equals computeRunTotals with the flat bonus', () => {
    const game = newGame({});
    game.grantMutation('deep_roots'); // atFood 0
    eatFoods(game, 30);
    const expected = computeRunTotals('PRIMAL', 30, [
      { id: 'deep_roots', atFood: 0 },
    ]).rawDna;
    expect(game.getState().dnaCollected).toBe(expected);
    // And the flat bonus actually paid: +1 for each of foods 25..30
    const base = computeRunTotals('PRIMAL', 30).rawDna;
    expect(expected).toBe(base + 6);
  });
});
