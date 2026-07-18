/**
 * Engine tests for the weekly anomaly modifiers (Design v2 Phase 4B,
 * section 7.2): Meteor Shower food fuse, Gold Rush economy + portal tax,
 * Twin Exits portal pair, Blackout as a render-only concern - and
 * engine/recompute parity for the [E] anomaly economics.
 */

import { describe, it, expect } from '@jest/globals';
import { SnakeGameLogic } from './SnakeGameLogic';
import { RULESETS, computeRunTotals } from '@/shared/game/rulesets';
import { ANOMALY_PHYSICS, type AnomalyId } from '@/shared/game/anomalies';

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

function newGame(
  anomaly: AnomalyId | null,
  gridSize = 200,
  rngSeed = 7
): SnakeGameLogic {
  const game = new SnakeGameLogic({
    gridSize,
    ruleset: RULESETS.PRIMAL,
    rng: mulberry(rngSeed),
    anomaly,
  });
  game.start();
  return game;
}

describe('anomaly config plumbing', () => {
  it('constructor anomaly and setAnomaly round-trip via getAnomaly', () => {
    const game = new SnakeGameLogic({ anomaly: 'gold_rush' });
    expect(game.getAnomaly()).toBe('gold_rush');
    game.setAnomaly('blackout');
    expect(game.getAnomaly()).toBe('blackout');
    game.setAnomaly(null);
    expect(game.getAnomaly()).toBeNull();
  });

  it('setAnomaly is refused mid-run - an anomaly owns the whole run', () => {
    const game = newGame(null, 40);
    game.setAnomaly('twin_exits');
    expect(game.getAnomaly()).toBeNull();
  });
});

describe('Meteor Shower: the food wave burns up after 60 ticks', () => {
  it('an untouched wave despawns and respawns exactly on the fuse', () => {
    const game = newGame('meteor_shower');
    expect(game.getState().foodTicksRemaining).toBe(
      ANOMALY_PHYSICS.meteorShowerFoodDespawnTicks
    );
    let despawns = 0;
    game.on('foodDespawned', () => {
      despawns += 1;
    });
    // Park the food far off the straight-line path (200-cell grid) so
    // nothing is eaten while the fuse burns down
    game.placeFood({ x: 0, y: 0, z: 0 });
    for (let i = 0; i < ANOMALY_PHYSICS.meteorShowerFoodDespawnTicks - 1; i++) {
      game.tick();
    }
    expect(despawns).toBe(0);
    game.tick();
    expect(despawns).toBe(1);
    // The respawned wave carries a fresh fuse
    expect(game.getState().foodTicksRemaining).toBe(
      ANOMALY_PHYSICS.meteorShowerFoodDespawnTicks
    );
    expect(game.getState().foods.length).toBeGreaterThan(0);
  });

  it('eating the wave restarts the fuse; other anomalies have no fuse', () => {
    const game = newGame('meteor_shower');
    eatFoods(game, 3);
    expect(game.getState().foodTicksRemaining).toBe(
      ANOMALY_PHYSICS.meteorShowerFoodDespawnTicks
    );
    const plain = newGame(null);
    expect(plain.getState().foodTicksRemaining).toBe(0);
    const blackout = newGame('blackout');
    expect(blackout.getState().foodTicksRemaining).toBe(0);
  });
});

describe('Gold Rush: x1.5 food DNA, exit portals 6 foods later', () => {
  it('engine DNA matches the server recompute exactly across 30 foods', () => {
    const game = newGame('gold_rush');
    eatFoods(game, 30);
    const state = game.getState();
    const expected = computeRunTotals('PRIMAL', 30, [], null, [], 'gold_rush');
    expect(state.dnaCollected).toBe(expected.rawDna);
    // Score is never anomaly-shaped
    expect(state.score).toBe(computeRunTotals('PRIMAL', 30).score);
  });

  it('the portal interval after a despawn is +6 vs the same-rng plain run', () => {
    const seed = 13;
    const plain = newGame(null, 200, seed);
    const rush = newGame('gold_rush', 200, seed);
    for (const game of [plain, rush]) {
      eatFoods(game, RULESETS.PRIMAL.extraction.firstExitAtFood);
      expect(game.getState().exitTile).not.toBeNull();
      // Park the food far away and let the portal window expire
      game.placeFood({ x: 0, y: 0, z: 0 });
      for (let i = 0; i < RULESETS.PRIMAL.extraction.despawnTicks + 1; i++) {
        game.tick();
        if (i % 12 === 5) game.setDirection(game.getState().direction === 'RIGHT' ? 'DOWN' : 'RIGHT');
      }
      expect(game.getState().exitTile).toBeNull();
    }
    expect(rush.getState().nextExitAtFood).toBe(
      plain.getState().nextExitAtFood +
        ANOMALY_PHYSICS.goldRushPortalIntervalPenalty
    );
  });
});

describe('Twin Exits: two portals, either banks, one shared window', () => {
  it('spawns a distinct pair when the portal threshold hits', () => {
    const game = newGame('twin_exits');
    eatFoods(game, RULESETS.PRIMAL.extraction.firstExitAtFood);
    const state = game.getState();
    expect(state.exitTile).not.toBeNull();
    expect(state.exitTile2).not.toBeNull();
    expect(
      state.exitTile!.x !== state.exitTile2!.x ||
        state.exitTile!.z !== state.exitTile2!.z
    ).toBe(true);
  });

  it('entering the SECOND portal extracts the run', () => {
    const game = newGame('twin_exits', 40);
    eatFoods(game, 5);
    const head = game.getState().snake[0];
    game.placeExit(
      { x: 0, y: 0, z: 39 },
      undefined,
      { x: head.x + 1, y: 0, z: head.z }
    );
    game.tick();
    const state = game.getState();
    expect(state.isGameOver).toBe(true);
    expect(state.extracted).toBe(true);
  });

  it('the pair despawns together when the shared window closes', () => {
    const game = newGame('twin_exits', 40);
    eatFoods(game, 5);
    const head = game.getState().snake[0];
    game.placeExit(
      { x: 0, y: 0, z: 39 },
      2,
      { x: 0, y: 0, z: 38 }
    );
    game.placeFood({ x: 39, y: 0, z: 0 });
    expect(head).toBeDefined();
    game.tick();
    game.tick();
    const state = game.getState();
    expect(state.exitTile).toBeNull();
    expect(state.exitTile2).toBeNull();
  });

  it('plain runs never carry a second portal', () => {
    const game = newGame(null);
    eatFoods(game, RULESETS.PRIMAL.extraction.firstExitAtFood);
    expect(game.getState().exitTile).not.toBeNull();
    expect(game.getState().exitTile2).toBeNull();
  });
});

describe('Blackout: render-layer only - engine math is untouched', () => {
  it('DNA and score equal the plain recompute (no [E] effect)', () => {
    const game = newGame('blackout');
    eatFoods(game, 20);
    const expected = computeRunTotals('PRIMAL', 20);
    expect(game.getState().dnaCollected).toBe(expected.rawDna);
    expect(game.getState().score).toBe(expected.score);
    // The visibility radius is a constant the renderer consumes
    expect(ANOMALY_PHYSICS.blackoutVisibilityRadius).toBe(6);
  });
});
