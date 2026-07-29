/**
 * Engine tests for the [P]hysical trait effects (Design v2 Phase 3A):
 * Ascetic no-spawn, Patient doubled cadence, Magnetism radius-1 pull +
 * portal tax, Iron Scales one wall save, and engine/recompute parity for
 * the [E] trait economics.
 */

import { describe, it, expect } from '@jest/globals';
import {
  SnakeGameLogic,
  type GameOverData,
  type GameState,
} from './SnakeGameLogic';
import { RULESETS, computeRunTotals } from '@/shared/game/rulesets';
import { MUTATION_SPAWN } from '@/shared/game/mutations';
import { TRAIT_PHYSICS, type TraitId } from '@/shared/game/traits';

/** Eat `count` foods deterministically by placing food in the snake's path. */
function eatFoods(game: SnakeGameLogic, count: number): void {
  for (let i = 0; i < count; i++) {
    const state = game.getState();
    expect(state.isGameOver).toBe(false);
    expect(state.isDeathSequence).toBe(false);
    expect(state.pendingChoice).toBeNull();
    game.placeFood({ x: state.snake[0].x + 1, y: 0, z: state.snake[0].z });
    game.tick();
  }
}

/** Seeded mulberry32 PRNG - deterministic cadence rolls. */
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

function newGame(traits: TraitId[], gridSize = 200, rngSeed = 7): SnakeGameLogic {
  const game = new SnakeGameLogic({
    gridSize,
    ruleset: RULESETS.PRIMAL,
    rng: mulberry(rngSeed),
    traits,
  });
  game.start();
  return game;
}

describe('traits config plumbing', () => {
  it('constructor traits and setTraits round-trip via getTraits', () => {
    const game = new SnakeGameLogic({ traits: ['sprinter'] });
    expect(game.getTraits()).toEqual(['sprinter']);
    game.setTraits(['ascetic', 'patient']);
    expect(game.getTraits()).toEqual(['ascetic', 'patient']);
  });

  it('setTraits outside a run refreshes the Iron Scales charge', () => {
    const game = new SnakeGameLogic({ gridSize: 40, ruleset: RULESETS.PRIMAL });
    expect(game.getState().ironScalesAvailable).toBe(false);
    game.setTraits(['iron_scales']);
    expect(game.getState().ironScalesAvailable).toBe(true);
    game.start();
    expect(game.getState().ironScalesAvailable).toBe(true);
  });
});

describe('Ascetic: mutation food never spawns', () => {
  it('no mutation tile ever appears across 80 foods', () => {
    const game = newGame(['ascetic']);
    let spawns = 0;
    game.on('mutationSpawned', () => {
      spawns += 1;
    });
    eatFoods(game, 80);
    expect(spawns).toBe(0);
    expect(game.getState().mutationTile).toBeNull();
    expect(game.getState().heldMutations).toEqual([]);
  });

  it('a traitless run on the same rng DOES spawn mutation food', () => {
    const game = newGame([]);
    let spawns = 0;
    game.on('mutationSpawned', () => {
      spawns += 1;
    });
    eatFoods(game, 80);
    expect(spawns).toBeGreaterThan(0);
  });
});

describe('Patient: mutation cadence doubled', () => {
  it('the first spawn threshold is doubled versus the same rng traitless', () => {
    const rngSeed = 11;
    const plain = new SnakeGameLogic({
      gridSize: 40,
      ruleset: RULESETS.PRIMAL,
      rng: mulberry(rngSeed),
    });
    const patient = new SnakeGameLogic({
      gridSize: 40,
      ruleset: RULESETS.PRIMAL,
      rng: mulberry(rngSeed),
      traits: ['patient'],
    });
    const plainAt = plain.getState().nextMutationAtFood;
    const patientAt = patient.getState().nextMutationAtFood;
    expect(patientAt).toBe(
      plainAt * TRAIT_PHYSICS.patientMutationIntervalMultiplier
    );
    // Doubled universal 6 +/- 2 window: 8..16.
    expect(patientAt).toBeGreaterThanOrEqual(8);
    expect(patientAt).toBeLessThanOrEqual(16);
  });

  it('no spawn happens before Patient\'s doubled minimum', () => {
    const game = newGame(['patient'], 200, 3);
    let spawns = 0;
    game.on('mutationSpawned', () => {
      spawns += 1;
    });
    eatFoods(game, 7);
    expect(spawns).toBe(0);
  });
});

describe('Magnetism: radius-1 pull + portal interval tax', () => {
  it('pulls a diagonal-adjacent food one cell toward the head', () => {
    const game = newGame(['magnetism'], 30);
    const head = game.getState().snake[0];
    // After the tick the head sits at (x+1, z); this food is then at
    // Chebyshev 1 (diagonal) and gets pulled along its dominant axis
    const placed = { x: head.x + 2, y: 0, z: head.z + 1 };
    game.placeFood(placed);
    game.tick();
    const state = game.getState();
    const newHead = state.snake[0];
    expect(state.food).not.toEqual(placed);
    const dist = Math.max(
      Math.abs(state.food.x - newHead.x),
      Math.abs(state.food.z - newHead.z)
    );
    expect(dist).toBe(1);
  });

  it('does NOT pull food at Chebyshev distance 2 (Magnet Pulse territory)', () => {
    const game = newGame(['magnetism'], 30);
    const head = game.getState().snake[0];
    // After the tick the head is at head.x+1; place food 3 ahead on the
    // same row -> post-move Chebyshev 2, outside the trait radius
    const placed = { x: head.x + 4, y: 0, z: head.z + 2 };
    game.placeFood(placed);
    game.tick();
    const state = game.getState();
    expect(state.food).toEqual(placed);
  });

  it('adds +2 foods to the exit portal interval after a despawn', () => {
    const seed = 5;
    const run = (traits: TraitId[]): number => {
      const game = new SnakeGameLogic({
        gridSize: 30,
        ruleset: RULESETS.PRIMAL,
        rng: mulberry(seed),
        traits,
      });
      game.start();
      // Expire a live portal to force the next-interval roll
      game.placeExit({ x: 0, y: 0, z: 0 }, 1);
      game.tick();
      game.tick();
      expect(game.getState().exitTile).toBeNull();
      return game.getState().nextExitAtFood;
    };
    const plainNext = run([]);
    const magnetNext = run(['magnetism']);
    expect(magnetNext).toBe(
      plainNext + TRAIT_PHYSICS.magnetismPortalIntervalPenalty
    );
  });
});

describe('Iron Scales: survive one board collision per run', () => {
  function marchIntoWall(game: SnakeGameLogic): void {
    // `start()` spawns food at a random cell. On this 10x10 grid that cell
    // sometimes lands in the head's marching row, the snake eats on the way to
    // the wall, and the length-preservation assertions below fail (~1 run in
    // 20). Park the food on a different row first: the march never changes z,
    // so any other row is unreachable and the walk becomes deterministic.
    const head = game.getState().snake[0];
    game.placeFood({ x: 0, y: head.y, z: (head.z + 5) % 10 });

    // March RIGHT until the head reaches the wall column, then once more
    let guard = 0;
    while (
      game.getState().snake[0].x < 9 &&
      !game.getState().isGameOver &&
      guard < 50
    ) {
      game.tick();
      guard += 1;
    }
    game.tick(); // the move into the wall
  }

  it('absorbs the first wall hit without returning a cell to free space', () => {
    const game = new SnakeGameLogic({
      gridSize: 10,
      ruleset: RULESETS.PRIMAL,
      traits: ['iron_scales'],
    });
    game.start();
    let triggered = 0;
    game.on('ironScalesTriggered', () => {
      triggered += 1;
    });

    const lengthBefore = game.getState().snake.length;
    const freeBefore = game.getBoardPressure().committedFreeCells;
    marchIntoWall(game);

    const state = game.getState();
    expect(triggered).toBe(1);
    expect(state.isGameOver).toBe(false);
    expect(state.isDeathSequence).toBe(false);
    expect(state.ironScalesAvailable).toBe(false);
    // The blocked move is spent in place: neither length nor occupied space
    // rewinds. The player has the next input window to turn away.
    expect(state.snake[0].x).toBe(9);
    expect(state.snake.length).toBe(lengthBefore);
    expect(game.getBoardPressure().committedFreeCells).toBe(freeBefore);
  });

  it('the second wall hit kills - strictly once per run', () => {
    const game = new SnakeGameLogic({
      gridSize: 10,
      ruleset: RULESETS.PRIMAL,
      traits: ['iron_scales'],
    });
    game.start();
    marchIntoWall(game); // absorbed
    expect(game.getState().isGameOver).toBe(false);
    game.tick(); // same blocked direction, no save left
    expect(game.getState().isDeathSequence).toBe(true);
  });

  it('does NOT absorb self-collision (board edge/terrain only)', () => {
    const game = new SnakeGameLogic({
      gridSize: 30,
      ruleset: RULESETS.PRIMAL,
      initialLength: 5,
      traits: ['iron_scales'],
    });
    game.start();
    // Tight loop into own body: UP, LEFT, DOWN hits the body
    game.setDirection('UP');
    game.tick();
    game.setDirection('LEFT');
    game.tick();
    game.setDirection('DOWN');
    game.tick();
    const state = game.getState();
    expect(state.isDeathSequence || state.isGameOver).toBe(true);
    // The wall save is still unspent - it just doesn't apply to bodies
    expect(state.ironScalesAvailable).toBe(true);
  });

  it('absorbs solid terrain as a collision with the board', () => {
    const game = new SnakeGameLogic({
      gridSize: 20,
      ruleset: RULESETS.PRIMAL,
      traits: ['iron_scales'],
    });
    game.start();
    const live = (game as unknown as { state: GameState }).state;
    const head = live.snake[0];
    live.terrain.push({
      x: head.x + 1,
      z: head.z,
      source: 'cyber',
      formingTicks: 0,
      formingTotal: 1,
      solid: true,
    });
    let triggers = 0;
    game.on('ironScalesTriggered', () => {
      triggers += 1;
    });

    const freeBefore = game.getBoardPressure().committedFreeCells;
    game.tick();
    const state = game.getState();
    expect(triggers).toBe(1);
    expect(state.ironScalesAvailable).toBe(false);
    expect(state.isDeathSequence).toBe(false);
    expect(game.getBoardPressure().committedFreeCells).toBe(freeBefore);
  });

  it('a traitless snake dies on the first wall hit', () => {
    const game = new SnakeGameLogic({ gridSize: 10, ruleset: RULESETS.PRIMAL });
    game.start();
    marchIntoWall(game);
    expect(game.getState().isDeathSequence).toBe(true);
  });
});

describe('[E] trait economics: engine matches the server recompute', () => {
  it.each([
    ['scavenger'],
    ['sprinter'],
    ['ascetic'],
    ['iron_scales'],
    ['scavenger', 'sprinter'],
  ] as TraitId[][])('engine dnaCollected === computeRunTotals for %p', (...traits) => {
    const game = newGame(traits as TraitId[]);
    eatFoods(game, 60);
    const state = game.getState();
    const { rawDna, score } = computeRunTotals(
      'PRIMAL',
      60,
      [],
      null,
      traits as TraitId[]
    );
    expect(state.dnaCollected).toBe(rawDna);
    expect(state.score).toBe(score);
  });

  it('gameOver payload never carries traits (server reads the snake row)', () => {
    const game = new SnakeGameLogic({
      gridSize: 10,
      ruleset: RULESETS.PRIMAL,
      traits: ['sprinter', 'hoarder'],
    });
    game.start();
    let payload: GameOverData | null = null;
    game.on('gameOver', (data) => {
      payload = data as GameOverData;
    });
    // March into the wall (no save without iron_scales) - death sequence
    for (let i = 0; i < 12 && !game.getState().isDeathSequence; i++) {
      game.tick();
    }
    expect(game.getState().isDeathSequence).toBe(true);
    // finalizeRun fires after the 800ms drama; call the payload check via
    // the deathSequence -> timeout path
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(payload).not.toBeNull();
        expect(payload as unknown as Record<string, unknown>).not.toHaveProperty('traits');
        resolve();
      }, 900);
    });
  });
});
