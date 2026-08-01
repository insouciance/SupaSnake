/**
 * Tests for Snake Game Logic
 * Core game mechanics: movement, collision, growth, scoring
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  SnakeGameLogic,
  Direction,
  Position,
  GameState,
  GameOverData,
} from './SnakeGameLogic';
import {
  COSMIC_CONSTELLATION,
  CYBER_TICK_FLOOR_MS,
  PRIMAL_SPEED_MS,
  RULESETS,
  computeRunTotals,
  type DynastyName,
} from '@/shared/game/rulesets';
import { GAME_CONFIG } from '@/shared/config/game';
import { MUTATION_PHYSICS } from '@/shared/game/mutations';
import { placementKey, reachableFrom } from '@/shared/game/foodPlacement';

/**
 * Eat `count` foods deterministically: place the food directly in the
 * snake's path and tick. Callers pick a grid large enough for the march.
 */
function eatFoods(game: SnakeGameLogic, count: number): void {
  for (let i = 0; i < count; i++) {
    const state = game.getState();
    expect(state.isGameOver).toBe(false);
    expect(state.isDeathSequence).toBe(false);
    game.placeFood({ x: state.snake[0].x + 1, y: 0, z: state.snake[0].z });
    game.tick();
  }
}

/** Seeded mulberry32 PRNG: deterministic but able to escape rejection sampling. */
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

describe('SnakeGameLogic', () => {
  let game: SnakeGameLogic;

  beforeEach(() => {
    // PRIMAL for the generic mechanics suites: the default (COSMIC) now
    // carries Flux wrap phases, so wall-collision behavior differs there.
    game = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
  });

  describe('Initialization', () => {
    it('should create game with default state', () => {
      const state = game.getState();
      expect(state.isPlaying).toBe(false);
      expect(state.isGameOver).toBe(false);
      expect(state.score).toBe(0);
      expect(state.dnaCollected).toBe(0);
    });

    it('should initialize snake with correct length', () => {
      game.start();
      const state = game.getState();
      expect(state.snake.length).toBe(3);
    });

    it('should place snake in center of grid', () => {
      game.start();
      const state = game.getState();
      const head = state.snake[0];
      expect(head.x).toBe(10);
      expect(head.z).toBe(10);
    });

    it('should spawn initial food', () => {
      game.start();
      const state = game.getState();
      expect(state.food).toBeDefined();
      expect(state.food.x).toBeGreaterThanOrEqual(0);
      expect(state.food.x).toBeLessThan(20);
    });

    it('should set initial direction to RIGHT', () => {
      game.start();
      const state = game.getState();
      expect(state.direction).toBe('RIGHT');
    });
  });

  describe('Movement', () => {
    beforeEach(() => {
      game.start();
    });

    it('should move snake head in current direction', () => {
      const initialHead = { ...game.getState().snake[0] };
      game.tick();
      const newHead = game.getState().snake[0];
      expect(newHead.x).toBe(initialHead.x + 1);
      expect(newHead.z).toBe(initialHead.z);
    });

    it('should move UP correctly', () => {
      game.setDirection('UP');
      const initialHead = { ...game.getState().snake[0] };
      game.tick();
      const newHead = game.getState().snake[0];
      expect(newHead.z).toBe(initialHead.z - 1);
    });

    it('should move DOWN correctly', () => {
      game.setDirection('DOWN');
      const initialHead = { ...game.getState().snake[0] };
      game.tick();
      const newHead = game.getState().snake[0];
      expect(newHead.z).toBe(initialHead.z + 1);
    });

    it('should move LEFT correctly', () => {
      // Snake starts moving RIGHT; a direct 180-degree reversal to LEFT is
      // blocked by the no-reverse rule, so turn DOWN first, then LEFT.
      game.setDirection('DOWN');
      game.tick();
      game.setDirection('LEFT');
      const initialHead = { ...game.getState().snake[0] };
      game.tick();
      const newHead = game.getState().snake[0];
      expect(newHead.x).toBe(initialHead.x - 1);
      expect(newHead.z).toBe(initialHead.z);
    });

    it('should move body segments to follow head', () => {
      const initialSnake = game.getState().snake.map(s => ({ ...s }));
      game.tick();
      const newSnake = game.getState().snake;

      expect(newSnake[1].x).toBe(initialSnake[0].x);
      expect(newSnake[1].z).toBe(initialSnake[0].z);
      expect(newSnake[2].x).toBe(initialSnake[1].x);
      expect(newSnake[2].z).toBe(initialSnake[1].z);
    });
  });

  describe('Direction Changes', () => {
    beforeEach(() => {
      game.start();
    });

    it('should change direction on the next tick when valid', () => {
      game.setDirection('UP');
      // Queued, not yet applied - the snake keeps its heading until the tick
      expect(game.getState().direction).toBe('RIGHT');
      game.tick();
      expect(game.getState().direction).toBe('UP');
    });

    it('should not allow reverse direction (RIGHT to LEFT)', () => {
      game.setDirection('LEFT');
      game.tick();
      expect(game.getState().direction).toBe('RIGHT');
    });

    it('should not allow reverse direction (UP to DOWN)', () => {
      game.setDirection('UP');
      game.tick();
      game.setDirection('DOWN');
      game.tick();
      expect(game.getState().direction).toBe('UP');
    });

    it('should allow perpendicular direction changes', () => {
      game.setDirection('UP');
      game.tick();
      expect(game.getState().direction).toBe('UP');
      game.setDirection('LEFT');
      game.tick();
      expect(game.getState().direction).toBe('LEFT');
    });

    describe('input buffering (fast successive moves)', () => {
      it('buffers two rapid inputs and executes both on consecutive ticks (S-turn)', () => {
        // Moving RIGHT: press UP then LEFT within the same tick window
        game.setDirection('UP');
        game.setDirection('LEFT');

        game.tick();
        expect(game.getState().direction).toBe('UP');
        game.tick();
        expect(game.getState().direction).toBe('LEFT');
      });

      it('rejects a reversal relative to the last queued direction', () => {
        // Moving RIGHT: queue UP, then DOWN would reverse the queued UP
        game.setDirection('UP');
        game.setDirection('DOWN');

        game.tick();
        expect(game.getState().direction).toBe('UP');
        game.tick();
        // DOWN was rejected - heading stays UP
        expect(game.getState().direction).toBe('UP');
      });

      it('allows a fast 180 via two perpendicular turns', () => {
        // Moving RIGHT: UP then LEFT queued back-to-back ends up heading LEFT
        // (a legal two-step reversal - the skill move the buffer enables)
        game.setDirection('UP');
        game.setDirection('LEFT');
        game.tick();
        game.tick();
        expect(game.getState().direction).toBe('LEFT');
      });

      it('skips duplicate inputs so the buffer is not wasted', () => {
        game.setDirection('UP');
        game.setDirection('UP');
        game.setDirection('LEFT');

        game.tick();
        expect(game.getState().direction).toBe('UP');
        game.tick();
        expect(game.getState().direction).toBe('LEFT');
      });

      it('caps the buffer at three queued directions', () => {
        // Moving RIGHT: queue UP, LEFT, DOWN (3 legal turns), then RIGHT is dropped
        game.setDirection('UP');
        game.setDirection('LEFT');
        game.setDirection('DOWN');
        game.setDirection('RIGHT');

        game.tick();
        expect(game.getState().direction).toBe('UP');
        game.tick();
        expect(game.getState().direction).toBe('LEFT');
        game.tick();
        expect(game.getState().direction).toBe('DOWN');
        game.tick();
        // Fourth input was dropped at the cap - heading stays DOWN
        expect(game.getState().direction).toBe('DOWN');
      });

      it('clears the buffer on restart', () => {
        game.setDirection('UP');
        game.setDirection('LEFT');
        game.start();
        game.tick();
        expect(game.getState().direction).toBe('RIGHT');
      });
    });

    describe('setDirection result reporting (touch feedback + debug)', () => {
      it('returns accepted when the input enters the buffer', () => {
        expect(game.setDirection('UP')).toBe('accepted');
        expect(game.getQueuedDirections()).toEqual(['UP']);
      });

      it('returns duplicate for the current heading with an empty queue', () => {
        // Snake starts moving RIGHT
        expect(game.setDirection('RIGHT')).toBe('duplicate');
        expect(game.getQueuedDirections()).toEqual([]);
      });

      it('returns duplicate relative to the last queued direction', () => {
        game.setDirection('UP');
        expect(game.setDirection('UP')).toBe('duplicate');
        expect(game.getQueuedDirections()).toEqual(['UP']);
      });

      it('returns reversal for a 180 against the heading', () => {
        expect(game.setDirection('LEFT')).toBe('reversal');
        expect(game.getQueuedDirections()).toEqual([]);
      });

      it('returns reversal against the last queued direction', () => {
        game.setDirection('UP');
        expect(game.setDirection('DOWN')).toBe('reversal');
        expect(game.getQueuedDirections()).toEqual(['UP']);
      });

      it('returns queue_full when the buffer is at capacity', () => {
        game.setDirection('UP');
        game.setDirection('LEFT');
        game.setDirection('DOWN');
        expect(game.setDirection('RIGHT')).toBe('queue_full');
        expect(game.getQueuedDirections()).toEqual(['UP', 'LEFT', 'DOWN']);
      });

      it('caps flick input at two unresolved turns without changing keyboard depth', () => {
        expect(game.setDirection('UP', 'flick')).toBe('accepted');
        expect(game.setDirection('LEFT', 'flick')).toBe('accepted');
        expect(game.setDirection('DOWN', 'flick')).toBe('queue_full');
        expect(game.getQueuedDirections()).toEqual(['UP', 'LEFT']);

        // Once the first turn resolves, a new flick can occupy the freed
        // slot; the cap limits unresolved intent, not the whole gesture/run.
        game.tick();
        expect(game.setDirection('DOWN', 'flick')).toBe('accepted');
        expect(game.getQueuedDirections()).toEqual(['LEFT', 'DOWN']);
      });

      it('still classifies duplicate and reversal flicks before the full-queue guard', () => {
        game.setDirection('UP', 'flick');
        game.setDirection('LEFT', 'flick');

        expect(game.setDirection('LEFT', 'flick')).toBe('duplicate');
        expect(game.setDirection('RIGHT', 'flick')).toBe('reversal');
        expect(game.getQueuedDirections()).toEqual(['UP', 'LEFT']);
      });

      it('reserves one full-queue intention inside the fractional pre-turn window', () => {
        game.setDirection('UP', 'flick');
        game.setDirection('LEFT', 'flick');

        expect(
          game.setDirection('DOWN', 'flick', { nextTickInMs: 8 })
        ).toBe('accepted');
        // The executable mobile queue remains capped at two. The intention
        // enters only after this imminent tick frees a slot.
        expect(game.getQueuedDirections()).toEqual(['UP', 'LEFT']);
        game.tick();
        expect(game.getQueuedDirections()).toEqual(['LEFT', 'DOWN']);
        game.tick();
        game.tick();
        expect(game.getState().direction).toBe('DOWN');
      });

      it('does not reserve a full-queue intention outside the small grace', () => {
        game.setDirection('UP', 'flick');
        game.setDirection('LEFT', 'flick');

        expect(
          game.setDirection('DOWN', 'flick', {
            nextTickInMs: GAME_CONFIG.controls.preTurnGrace.maxMs + 1,
          })
        ).toBe('queue_full');
        expect(game.getQueuedDirections()).toEqual(['UP', 'LEFT']);
      });

      it('keeps Slipstream as the stronger full-tick pre-turn grace', () => {
        game.grantMutation('slipstream', 0);
        game.setDirection('UP', 'flick');
        game.setDirection('LEFT', 'flick');

        expect(
          game.setDirection('DOWN', 'flick', {
            nextTickInMs: game.getSpeed() - 1,
          })
        ).toBe('accepted');
      });

      it('suppresses a rapid third mobile corner only when it enters the new neck', () => {
        const tight = new SnakeGameLogic({
          gridSize: 30,
          initialLength: 8,
          ruleset: RULESETS.PRIMAL,
        });
        tight.start();
        expect(tight.setDirection('UP', 'flick', {
          inputTimeMs: 0,
          gestureId: 1,
        })).toBe('accepted');
        tight.tick();
        expect(tight.setDirection('LEFT', 'flick', {
          inputTimeMs: 170,
          gestureId: 1,
        })).toBe('accepted');
        tight.tick();

        expect(tight.setDirection('DOWN', 'flick', {
          inputTimeMs: 340,
          gestureId: 1,
        })).toBe('micro_u');
        expect(tight.getQueuedDirections()).toEqual([]);
        tight.tick();
        expect(tight.getState().isDeathSequence).toBe(false);
        expect(tight.getState().direction).toBe('LEFT');
      });

      it('allows the same rapid turn phrase once geometry makes a larger U safe', () => {
        const roomyTurn = new SnakeGameLogic({
          gridSize: 30,
          initialLength: 5,
          ruleset: RULESETS.PRIMAL,
        });
        roomyTurn.start();
        roomyTurn.setDirection('UP', 'flick', { inputTimeMs: 0, gestureId: 7 });
        roomyTurn.tick();
        roomyTurn.setDirection('LEFT', 'flick', { inputTimeMs: 120, gestureId: 7 });
        roomyTurn.tick();
        // Deliberately create spatial separation before the third corner.
        roomyTurn.tick();
        roomyTurn.tick();

        expect(roomyTurn.setDirection('DOWN', 'flick', {
          inputTimeMs: 300,
          gestureId: 7,
        })).toBe('accepted');
        roomyTurn.tick();
        expect(roomyTurn.getState().isDeathSequence).toBe(false);
        expect(roomyTurn.getState().direction).toBe('DOWN');
      });

      it('does not forgive a slow deliberate tight self-collision', () => {
        const deliberate = new SnakeGameLogic({
          gridSize: 30,
          initialLength: 8,
          ruleset: RULESETS.PRIMAL,
        });
        deliberate.start();
        deliberate.setDirection('UP', 'flick', { inputTimeMs: 0, gestureId: 2 });
        deliberate.tick();
        deliberate.setDirection('LEFT', 'flick', { inputTimeMs: 300, gestureId: 2 });
        deliberate.tick();

        expect(deliberate.setDirection('DOWN', 'flick', {
          inputTimeMs: 1_000,
          gestureId: 2,
        })).toBe('accepted');
        deliberate.tick();
        expect(deliberate.getState().isDeathSequence).toBe(true);
      });

      it('returns inactive while paused', () => {
        game.pause();
        expect(game.setDirection('UP')).toBe('inactive');
        game.resume();
        expect(game.setDirection('UP')).toBe('accepted');
      });

      it('returns inactive before start', () => {
        const fresh = new SnakeGameLogic({ gridSize: 20 });
        expect(fresh.setDirection('UP')).toBe('inactive');
      });
    });

    describe('resumeWithDirection (post-pause safety gate)', () => {
      it('queues a legal direction before atomically resuming', () => {
        game.pause();

        expect(game.resumeWithDirection('UP')).toBe('accepted');
        expect(game.isPaused).toBe(false);
        expect(game.getQueuedDirections()).toEqual(['UP']);

        game.tick();
        expect(game.getState().direction).toBe('UP');
      });

      it('treats the current heading as deliberate and resumes', () => {
        game.pause();

        expect(game.resumeWithDirection('RIGHT')).toBe('duplicate');
        expect(game.isPaused).toBe(false);
        expect(game.getQueuedDirections()).toEqual([]);
      });

      it('keeps the board frozen after an unsafe reversal', () => {
        game.pause();
        const head = { ...game.getState().snake[0] };

        expect(game.resumeWithDirection('LEFT')).toBe('reversal');
        expect(game.isPaused).toBe(true);
        game.tick();
        expect(game.getState().snake[0]).toEqual(head);
      });

      it('buffers a rapid follow-up after the release command', () => {
        game.pause();

        expect(game.resumeWithDirection('UP')).toBe('accepted');
        expect(game.resumeWithDirection('LEFT')).toBe('accepted');
        expect(game.getQueuedDirections()).toEqual(['UP', 'LEFT']);

        game.tick();
        expect(game.getState().direction).toBe('UP');
        game.tick();
        expect(game.getState().direction).toBe('LEFT');
      });

      it('clears stale buffered turns whenever the game pauses', () => {
        game.setDirection('UP', 'flick');
        game.setDirection('LEFT', 'flick');
        expect(game.setDirection('DOWN', 'flick', { nextTickInMs: 1 })).toBe(
          'accepted'
        );
        expect(game.getQueuedDirections()).toEqual(['UP', 'LEFT']);

        game.pause();
        expect(game.getQueuedDirections()).toEqual([]);
        game.resume();
        game.tick();
        expect(game.getState().direction).toBe('RIGHT');
      });

    });

    describe('getQueuedDirections (aim telegraph read-only view)', () => {
      it('returns an empty array when nothing is buffered', () => {
        expect(game.getQueuedDirections()).toEqual([]);
      });

      it('returns buffered inputs in consumption order', () => {
        game.setDirection('UP');
        game.setDirection('LEFT');
        expect(game.getQueuedDirections()).toEqual(['UP', 'LEFT']);
      });

      it('reflects consumption - one entry leaves per tick', () => {
        game.setDirection('UP');
        game.setDirection('LEFT');
        game.tick();
        expect(game.getQueuedDirections()).toEqual(['LEFT']);
        game.tick();
        expect(game.getQueuedDirections()).toEqual([]);
      });

      it('returns a copy - mutating it does not affect the engine', () => {
        game.setDirection('UP');
        const queued = game.getQueuedDirections();
        queued.push('LEFT');
        expect(game.getQueuedDirections()).toEqual(['UP']);
      });

      it('does not include rejected inputs (reversals, duplicates)', () => {
        // Moving RIGHT: LEFT is a reversal, RIGHT a duplicate - both dropped
        game.setDirection('LEFT');
        game.setDirection('RIGHT');
        expect(game.getQueuedDirections()).toEqual([]);
      });
    });
  });

  describe('Food Collection', () => {
    beforeEach(() => {
      game.start();
    });

    it('should grow snake when eating food', () => {
      const state = game.getState();
      const initialLength = state.snake.length;

      game.placeFood({ x: state.snake[0].x + 1, y: 0, z: state.snake[0].z });
      game.tick();

      expect(game.getState().snake.length).toBe(initialLength + 1);
    });

    it('should increase score when eating food', () => {
      const state = game.getState();
      game.placeFood({ x: state.snake[0].x + 1, y: 0, z: state.snake[0].z });
      game.tick();

      expect(game.getState().score).toBeGreaterThan(0);
    });

    it('should increase DNA collected when eating food', () => {
      const state = game.getState();
      game.placeFood({ x: state.snake[0].x + 1, y: 0, z: state.snake[0].z });
      game.tick();

      expect(game.getState().dnaCollected).toBeGreaterThan(0);
    });

    it('should spawn new food after eating', () => {
      const state = game.getState();
      const oldFood = { ...state.food };
      game.placeFood({ x: state.snake[0].x + 1, y: 0, z: state.snake[0].z });
      game.tick();

      const newFood = game.getState().food;
      expect(newFood.x !== oldFood.x || newFood.z !== oldFood.z).toBe(true);
    });

    it('should emit onFoodCollected event', () => {
      let eventFired = false;
      game.on('foodCollected', () => {
        eventFired = true;
      });

      const state = game.getState();
      game.placeFood({ x: state.snake[0].x + 1, y: 0, z: state.snake[0].z });
      game.tick();

      expect(eventFired).toBe(true);
    });
  });

  describe('Collision Detection', () => {
    beforeEach(() => {
      game.start();
    });

    it('should detect wall collision (right)', () => {
      for (let i = 0; i < 20; i++) {
        if (!game.getState().isDeathSequence && !game.getState().isGameOver) {
          game.tick();
        }
      }
      // Death sequence starts on collision
      expect(game.getState().isDeathSequence).toBe(true);
    });

    it('should detect wall collision (top)', () => {
      game.setDirection('UP');
      for (let i = 0; i < 20; i++) {
        if (!game.getState().isDeathSequence && !game.getState().isGameOver) {
          game.tick();
        }
      }
      // Death sequence starts on collision
      expect(game.getState().isDeathSequence).toBe(true);
    });

    it('should detect self collision', () => {
      for (let i = 0; i < 5; i++) {
        game.placeFood({ x: game.getState().snake[0].x + 1, y: 0, z: game.getState().snake[0].z });
        game.tick();
      }

      game.setDirection('UP');
      game.tick();
      game.setDirection('LEFT');
      game.tick();
      game.setDirection('DOWN');
      game.tick();

      // Death sequence starts first, then isDeathSequence is true
      expect(game.getState().isDeathSequence).toBe(true);
    });

    it('should set isGameOver after death sequence completes', async () => {
      game.start();

      // Collect food to grow snake
      for (let i = 0; i < 5; i++) {
        game.placeFood({ x: game.getState().snake[0].x + 1, y: 0, z: game.getState().snake[0].z });
        game.tick();
      }

      game.setDirection('UP');
      game.tick();
      game.setDirection('LEFT');
      game.tick();
      game.setDirection('DOWN');
      game.tick();

      // Wait for death sequence to complete
      await new Promise(resolve => setTimeout(resolve, 900));

      expect(game.getState().isGameOver).toBe(true);
    });

    it('should emit deathSequence event on collision', () => {
      let deathSequenceFired = false;
      game.on('deathSequence', () => {
        deathSequenceFired = true;
      });

      for (let i = 0; i < 20; i++) {
        game.tick();
      }

      expect(deathSequenceFired).toBe(true);
    });

    it('should emit gameOver event after death sequence delay', async () => {
      let eventFired = false;
      game.on('gameOver', () => {
        eventFired = true;
      });

      for (let i = 0; i < 20; i++) {
        game.tick();
      }

      // Wait for death sequence timeout (800ms + buffer)
      await new Promise(resolve => setTimeout(resolve, 900));

      expect(eventFired).toBe(true);
    });
  });

  describe('Game State', () => {
    it('should not tick when not playing', () => {
      const initialState = game.getState();
      game.tick();
      expect(game.getState()).toEqual(initialState);
    });

    it('should not tick when in death sequence', () => {
      game.start();
      for (let i = 0; i < 20; i++) {
        game.tick();
      }
      // After collision, death sequence starts
      expect(game.getState().isDeathSequence).toBe(true);
      const deathState = { ...game.getState() };
      game.tick();
      // Snake should not move during death sequence
      expect(game.getState().snake).toEqual(deathState.snake);
    });

    it('should track game duration', () => {
      game.start();
      expect(game.getState().startTime).toBeDefined();
    });

    it('should reset state on restart', () => {
      game.start();
      game.tick();
      game.tick();
      game.start();

      const state = game.getState();
      expect(state.score).toBe(0);
      expect(state.snake.length).toBe(3);
    });
  });

  describe('Dynasty growth profile', () => {
    it.each(['CYBER', 'COSMIC'] as DynastyName[])('%s grows +1 throughout', (id) => {
      const engine = new SnakeGameLogic({
        gridSize: 200,
        ruleset: RULESETS[id],
        growthProfileId: 'dynasty',
        traits: ['ascetic'],
      });
      engine.start();
      eatFoods(engine, 20);
      expect(engine.getModelledLength()).toBe(23);
    });

    it('downshifts PRIMAL by modelled length from +4 to +1', () => {
      const engine = new SnakeGameLogic({
        gridSize: 200,
        ruleset: RULESETS.PRIMAL,
        growthProfileId: 'dynasty',
        traits: ['ascetic'],
      });
      engine.start();

      eatFoods(engine, 18);
      expect(engine.getModelledLength()).toBe(75);
      eatFoods(engine, 7);
      expect(engine.getModelledLength()).toBe(96);
      eatFoods(engine, 12);
      expect(engine.getModelledLength()).toBe(120);
      eatFoods(engine, 1);
      expect(engine.getModelledLength()).toBe(121);
    });
  });

  describe('Speed Progression (per ruleset)', () => {
    it('should have the COSMIC Flux fixed speed on start (COSMIC default)', () => {
      const cosmic = new SnakeGameLogic({ gridSize: 20 });
      cosmic.start();
      expect(cosmic.getSpeed()).toBe(160);
    });

    it('keeps speed fixed on the COSMIC ruleset', () => {
      const cosmic = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.COSMIC });
      cosmic.start();
      const initialSpeed = cosmic.getSpeed();
      const state = cosmic.getState();
      cosmic.placeFood({ x: state.snake[0].x + 1, y: 0, z: state.snake[0].z });
      cosmic.tick();

      expect(cosmic.getSpeed()).toBe(initialSpeed);
    });

    it('keeps speed fixed on PRIMAL regardless of foods eaten', () => {
      const primal = new SnakeGameLogic({ gridSize: 60, ruleset: RULESETS.PRIMAL });
      primal.start();
      eatFoods(primal, 10);
      // WP-3.08 moved PRIMAL's tempo to 175ms and out of GAME_CONFIG. Read the
      // constant, not the literal: the point of this test is that the number
      // does not move DURING a run, not what the number is.
      expect(primal.getSpeed()).toBe(PRIMAL_SPEED_MS);
    });

    it('ramps speed down with each food on CYBER', () => {
      const cyber = new SnakeGameLogic({ gridSize: 60, ruleset: RULESETS.CYBER });
      cyber.start();
      const speeds: number[] = [cyber.getSpeed()];
      for (let i = 0; i < 10; i++) {
        eatFoods(cyber, 1);
        speeds.push(cyber.getSpeed());
      }
      for (let i = 1; i < speeds.length; i++) {
        expect(speeds[i]).toBeLessThan(speeds[i - 1]);
      }
      // speed = ruleset.speedForFood(foodEaten) exactly
      expect(cyber.getSpeed()).toBe(RULESETS.CYBER.speedForFood(10));
    });

    it('never drops below the minimum speed on CYBER', () => {
      // This is a curve invariant, not a survival simulation. Marching a live
      // CYBER run through 60 foods also activates randomized arena blocks and
      // can end the run before the speed assertion, making the test flaky for
      // a reason unrelated to tempo.
      for (let foodEaten = 0; foodEaten <= 1_000; foodEaten++) {
        expect(RULESETS.CYBER.speedForFood(foodEaten)).toBeGreaterThanOrEqual(
          CYBER_TICK_FLOOR_MS
        );
      }
      expect(RULESETS.CYBER.speedForFood(1_000)).toBe(CYBER_TICK_FLOOR_MS);
    });

    it('setRuleset re-derives speed from the current food count', () => {
      game.start();
      game.setRuleset(RULESETS.CYBER);
      expect(game.getSpeed()).toBe(RULESETS.CYBER.speedForFood(0));
      game.setRuleset(RULESETS.PRIMAL);
      expect(game.getSpeed()).toBe(PRIMAL_SPEED_MS);
      expect(game.getRuleset().id).toBe('PRIMAL');
    });
  });

  describe('Food Spawning', () => {
    beforeEach(() => {
      game.start();
    });

    it('should not spawn food on snake body', () => {
      for (let i = 0; i < 100; i++) {
        const food = game.getState().food;
        const snake = game.getState().snake;
        const foodOnSnake = snake.some(s => s.x === food.x && s.z === food.z);
        expect(foodOnSnake).toBe(false);

        if (!game.getState().isGameOver) {
          game.placeFood({ x: game.getState().snake[0].x + 1, y: 0, z: game.getState().snake[0].z });
          game.tick();
        } else {
          break;
        }
      }
    });

    it('should spawn food within grid bounds', () => {
      for (let i = 0; i < 20; i++) {
        const food = game.getState().food;
        expect(food.x).toBeGreaterThanOrEqual(0);
        expect(food.x).toBeLessThan(20);
        expect(food.z).toBeGreaterThanOrEqual(0);
        expect(food.z).toBeLessThan(20);

        game.spawnFood();
      }
    });
  });

  describe('Event System', () => {
    it('should register and call event listeners', () => {
      const callback = jest.fn();
      game.on('gameStart', callback);
      game.start();
      expect(callback).toHaveBeenCalled();
    });

    it('should support multiple listeners', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      game.on('gameStart', callback1);
      game.on('gameStart', callback2);
      game.start();
      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should remove listeners with off()', () => {
      const callback = jest.fn();
      game.on('gameStart', callback);
      game.off('gameStart', callback);
      game.start();
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Pause System', () => {
    beforeEach(() => {
      game.start();
    });

    it('should pause the game', () => {
      game.pause();
      expect(game.getState().isPaused).toBe(true);
      expect(game.isPaused).toBe(true);
    });

    it('should resume the game', () => {
      game.pause();
      game.resume();
      expect(game.getState().isPaused).toBe(false);
      expect(game.isPaused).toBe(false);
    });

    it('should toggle pause state', () => {
      expect(game.isPaused).toBe(false);
      game.togglePause();
      expect(game.isPaused).toBe(true);
      game.togglePause();
      expect(game.isPaused).toBe(false);
    });

    it('should not tick when paused', () => {
      const initialSnake = [...game.getState().snake];
      game.pause();
      game.tick();
      expect(game.getState().snake).toEqual(initialSnake);
    });

    it('should not allow direction change when paused', () => {
      const initialDirection = game.getState().direction;
      game.pause();
      game.setDirection('UP');
      expect(game.getState().direction).toBe(initialDirection);
    });

    it('should emit pause event', () => {
      const callback = jest.fn();
      game.on('pause', callback);
      game.pause();
      expect(callback).toHaveBeenCalled();
    });

    it('should emit resume event', () => {
      const callback = jest.fn();
      game.on('resume', callback);
      game.pause();
      game.resume();
      expect(callback).toHaveBeenCalled();
    });

    it('should not pause if not playing', () => {
      const newGame = new SnakeGameLogic();
      newGame.pause();
      expect(newGame.isPaused).toBe(false);
    });

    it('should not pause during death sequence', () => {
      // Cause collision
      for (let i = 0; i < 20; i++) {
        game.tick();
      }
      expect(game.getState().isDeathSequence).toBe(true);
      game.pause();
      expect(game.isPaused).toBe(false);
    });
  });

  describe('Tactical hold budget', () => {
    const BASE = GAME_CONFIG.session.holds.base;

    beforeEach(() => {
      game.start();
    });

    it('opens with the base budget and nothing spent', () => {
      const state = game.getState();
      expect(state.holdBudget).toBe(BASE);
      expect(state.holdsUsed).toBe(0);
    });

    it('spends one hold per tactical pause and reports success', () => {
      expect(game.pause()).toBe(true);
      expect(game.getState().holdsUsed).toBe(1);
      game.resume();
      expect(game.getState().holdsUsed).toBe(1); // resuming refunds nothing
    });

    it('refuses a tactical hold once the budget is spent', () => {
      for (let i = 0; i < BASE; i++) {
        expect(game.pause()).toBe(true);
        game.resume();
      }
      expect(game.pause()).toBe(false);
      expect(game.isPaused).toBe(false);
      expect(game.getState().holdsUsed).toBe(BASE);
    });

    it('refuses a free decision hold without an engine-authored decision', () => {
      for (let i = 0; i < BASE; i++) {
        game.pause();
        game.resume();
      }
      expect(game.pause('decision')).toBe(false);
      expect(game.isPaused).toBe(false);
      expect(game.getState().holdsUsed).toBe(BASE);
    });

    it('grants exactly one same-tick free re-arm after a real choice', () => {
      const head = game.getState().snake[0];
      game.placeMutation({ x: head.x + 1, y: 0, z: head.z });
      game.tick();
      expect(game.getState().pendingChoice).not.toBeNull();
      expect(game.chooseMutation(0)).toBe(true);
      expect(game.pause('decision')).toBe(true);
      expect(game.getState().holdsUsed).toBe(0);
      game.resume();
      expect(game.pause('decision')).toBe(false);
      expect(game.getState().holdsUsed).toBe(0);
    });

    it('expires an unused decision re-arm at the next movement tick', () => {
      const head = game.getState().snake[0];
      game.placeMutation({ x: head.x + 1, y: 0, z: head.z });
      game.tick();
      expect(game.chooseMutation(0)).toBe(true);
      game.tick();
      expect(game.pause('decision')).toBe(false);
    });

    it('grants a hold at each length threshold and never takes one back', () => {
      const thresholds = GAME_CONFIG.session.holds.bonusAtLengths;
      const target = Math.max(...thresholds);
      // A board wide enough to eat in a straight line past the last threshold.
      const roomy = new SnakeGameLogic({ gridSize: 120, ruleset: RULESETS.PRIMAL });
      roomy.start();
      const seen: number[] = [];
      while (roomy.getState().snake.length < target && !roomy.getState().isGameOver) {
        const head = roomy.getState().snake[0];
        roomy.placeFood({ x: head.x + 1, y: 0, z: head.z });
        roomy.tick();
        if (roomy.getState().pendingChoice) roomy.declineMutation();
        seen.push(roomy.getState().holdBudget);
      }
      expect(roomy.getState().snake.length).toBeGreaterThanOrEqual(target);
      expect(roomy.getState().holdBudget).toBe(BASE + thresholds.length);
      // Monotonic: the budget only ever grows, so a shed can never strand a
      // player having already spent more holds than they are allowed.
      expect(seen).toEqual([...seen].sort((a, b) => a - b));
    });

    it('roughly doubles both opening and earned voluntary holds in COSMIC', () => {
      const cosmic = new SnakeGameLogic({
        gridSize: 120,
        ruleset: RULESETS.COSMIC,
        // COSMIC grows deterministic terrain. A fixed RNG keeps this hold
        // budget assertion about body thresholds rather than a random block
        // occasionally ending the straight-line fixture first.
        rng: () => 0.5,
      });
      cosmic.start();
      expect(cosmic.getState().holdBudget).toBe(
        GAME_CONFIG.session.holds.cosmic.base
      );

      const profile = GAME_CONFIG.session.holds.cosmic;
      const target = Math.max(...profile.bonusAtLengths);
      while (
        cosmic.getModelledLength() < target &&
        !cosmic.getState().isGameOver
      ) {
        const head = cosmic.getState().snake[0];
        cosmic.placeFood({ x: head.x + 1, y: 0, z: head.z });
        cosmic.tick();
        if (cosmic.getState().pendingChoice) cosmic.declineMutation();
      }
      expect(cosmic.getState().holdBudget).toBe(
        profile.base +
          profile.bonusAtLengths.length * profile.bonusPerThreshold
      );
    });
  });

  describe('Score Calculation', () => {
    beforeEach(() => {
      game.start();
    });

    it('should calculate DNA based on food value', () => {
      const state = game.getState();
      game.placeFood({ x: state.snake[0].x + 1, y: 0, z: state.snake[0].z });
      game.tick();

      expect(game.getState().dnaCollected).toBe(10);
    });

    it('tracks the raw food count separately from the display score', () => {
      const state = game.getState();
      game.placeFood({ x: state.snake[0].x + 1, y: 0, z: state.snake[0].z });
      game.tick();

      // Score is display points, now shaped per dynasty (WP-3.08): PRIMAL is
      // back-loaded and opens at x0.5, so food 1 pays 5 rather than the flat 10
      // it used to. `foodEaten` is the raw fact the server recomputes from, and
      // it is 1 under every curve — which is the separation being asserted.
      expect(game.getState().score).toBe(5);
      expect(game.getState().foodEaten).toBe(1);
    });
  });
  describe('Ruleset scoring parity (client mirrors server recompute)', () => {
    it.each<[DynastyName, number]>([
      ['PRIMAL', 12],
      ['CYBER', 12],
    ])('%s totals after %i foods match computeRunTotals exactly', (dynasty, foods) => {
      const engine = new SnakeGameLogic({
        gridSize: 60,
        ruleset: RULESETS[dynasty],
        rng: () => 0.999, // exit spawns far from the march row
      });
      engine.start();
      eatFoods(engine, foods);

      const expected = computeRunTotals(dynasty, foods);
      const state = engine.getState();
      expect(state.dnaCollected).toBe(expected.rawDna);
      expect(state.score).toBe(expected.score);
      expect(state.foodEaten).toBe(foods);
    });

    it('COSMIC totals equal the recompute exactly, with no bonus layer', () => {
      // Before WP-3.13 this test asserted a DECOMPOSITION - base plus a
      // reported combo bonus - because the combo was the one thing the
      // server could not derive. There is no decomposition any more.
      const engine = new SnakeGameLogic({
        gridSize: 60,
        ruleset: RULESETS.COSMIC,
        rng: () => 0.999,
      });
      engine.start();
      eatFoods(engine, 12);

      const expected = computeRunTotals('COSMIC', 12);
      const state = engine.getState();
      expect(state.dnaCollected).toBe(expected.rawDna);
      expect(state.score).toBe(expected.score);
      expect(state.foodEaten).toBe(12);
    });

    // Named for what it asserts: DNA. Since WP-3.08 gave each dynasty its own
    // score shape, "out-scores" and "out-yields" are different claims, and this
    // one is about Yield — the five-food DNA tier, which the score rework left
    // exactly where it was.
    it('CYBER out-yields PRIMAL for the same foods once tiers kick in', () => {
      const run = (dynasty: DynastyName) => {
        const engine = new SnakeGameLogic({ gridSize: 60, ruleset: RULESETS[dynasty] });
        engine.start();
        eatFoods(engine, 10);
        return engine.getState();
      };
      expect(run('CYBER').dnaCollected).toBeGreaterThan(run('PRIMAL').dnaCollected);
    });

    it('emits foodCollected with the running foodEaten count', () => {
      const engine = new SnakeGameLogic({ gridSize: 60, ruleset: RULESETS.PRIMAL });
      engine.start();
      const counts: number[] = [];
      engine.on('foodCollected', (data: any) => counts.push(data.foodEaten));
      eatFoods(engine, 3);
      expect(counts).toEqual([1, 2, 3]);
    });
  });

  describe('Extraction: exit portal spawn cadence', () => {
    it('spawns the first exit portal at 15 foods (not before)', () => {
      const engine = new SnakeGameLogic({
        gridSize: 60,
        ruleset: RULESETS.PRIMAL,
        rng: () => 0.999,
      });
      engine.start();
      let spawned: any = null;
      engine.on('exitSpawned', (data) => {
        spawned = data;
      });

      eatFoods(engine, 14);
      expect(spawned).toBeNull();
      expect(engine.getState().exitTile).toBeNull();

      eatFoods(engine, 1);
      expect(spawned).not.toBeNull();
      expect(spawned.ticksRemaining).toBe(90);
      expect(engine.getState().exitTile).not.toBeNull();
      expect(engine.getState().exitTicksRemaining).toBe(90);
    });

    it('places the exit off the snake and off the food', () => {
      // Seeded mulberry32 PRNG: deterministic but able to escape
      // rejection sampling (a constant rng cannot)
      let seed = 42;
      const rng = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const engine = new SnakeGameLogic({
        gridSize: 60,
        ruleset: RULESETS.PRIMAL,
        rng,
      });
      engine.start();
      eatFoods(engine, 15);

      const state = engine.getState();
      const exit = state.exitTile!;
      expect(exit).not.toBeNull();
      expect(
        state.snake.some((seg) => seg.x === exit.x && seg.z === exit.z)
      ).toBe(false);
      expect(exit.x === state.food.x && exit.z === state.food.z).toBe(false);
      expect(exit.x).toBeGreaterThanOrEqual(0);
      expect(exit.x).toBeLessThan(60);
    });

    it('never returns the sampler\'s blocked last guess as a portal', () => {
      // Exact screenshot regression: a constant stream repeatedly nominates
      // (0,0), which is already terrain. The former 1000-attempt sampler then
      // returned that same illegal cell and drew a portal through the block.
      const engine = new SnakeGameLogic({
        gridSize: 20,
        ruleset: RULESETS.CYBER,
        rng: () => 0,
      });
      engine.start();
      const harness = engine as unknown as {
        state: GameState;
        spawnExit: () => void;
      };
      harness.state.terrain.push({
        x: 0,
        z: 0,
        source: 'cyber',
        formingTicks: 0,
        formingTotal: 1,
        solid: true,
      });

      harness.spawnExit();

      const state = engine.getState();
      const exit = state.exitTile;
      expect(exit).not.toBeNull();
      expect(exit).not.toMatchObject({ x: 0, z: 0 });
      expect(
        state.terrain.some((block) => block.x === exit!.x && block.z === exit!.z)
      ).toBe(false);

      const blocked = new Set<string>();
      for (const segment of state.snake) {
        blocked.add(placementKey(segment.x, segment.z));
      }
      for (const block of state.terrain) {
        blocked.add(placementKey(block.x, block.z));
      }
      for (const food of state.foods) {
        blocked.add(placementKey(food.x, food.z));
      }
      expect(
        reachableFrom(20, state.snake[0], blocked).has(
          placementKey(exit!.x, exit!.z)
        )
      ).toBe(true);
    });

    it('does not spawn a second portal while one is live', () => {
      const engine = new SnakeGameLogic({
        gridSize: 100,
        ruleset: RULESETS.PRIMAL,
        rng: () => 0.999,
      });
      engine.start();
      let spawnCount = 0;
      engine.on('exitSpawned', () => {
        spawnCount += 1;
      });

      eatFoods(engine, 30); // well past a second threshold
      expect(spawnCount).toBe(1);
    });
  });

  describe('Extraction: despawn countdown', () => {
    it('counts down each tick and despawns at zero, rescheduling the next portal', () => {
      // rng => 0 makes the reschedule interval exactly 12 - 4 = 8 foods
      const engine = new SnakeGameLogic({
        gridSize: 60,
        ruleset: RULESETS.PRIMAL,
        rng: () => 0,
      });
      engine.start();
      let despawned = false;
      engine.on('exitDespawned', () => {
        despawned = true;
      });

      const head = engine.getState().snake[0];
      // Portal placed away from the march row with a short 5-tick fuse
      engine.placeExit({ x: 0, y: 0, z: head.z + 5 }, 5);
      engine.placeFood({ x: 0, y: 0, z: head.z + 10 }); // off the path - no eats

      for (let expected = 4; expected >= 1; expected--) {
        engine.tick();
        expect(engine.getState().exitTicksRemaining).toBe(expected);
        expect(engine.getState().exitTile).not.toBeNull();
      }

      engine.tick(); // reaches 0 -> despawn
      expect(despawned).toBe(true);
      const state = engine.getState();
      expect(state.exitTile).toBeNull();
      expect(state.exitTicksRemaining).toBe(0);
      // Next portal scheduled foodEaten + 8 (rng 0)
      expect(state.nextExitAtFood).toBe(state.foodEaten + 8);
    });

    it('a placeExit spawn keeps its full window on the spawn tick', () => {
      const engine = new SnakeGameLogic({ gridSize: 60, ruleset: RULESETS.PRIMAL });
      engine.start();
      const head = engine.getState().snake[0];
      engine.placeFood({ x: 0, y: 0, z: head.z + 10 });
      engine.placeExit({ x: 0, y: 0, z: head.z + 5 });
      expect(engine.getState().exitTicksRemaining).toBe(90);
      engine.tick();
      expect(engine.getState().exitTicksRemaining).toBe(89);
    });
  });

  describe('Extraction: exit collision ends the run banked', () => {
    function extractNow(engine: SnakeGameLogic): {
      events: string[];
      extractedPayload: any;
      gameOverPayload: GameOverData;
    } {
      const events: string[] = [];
      let extractedPayload: any = null;
      let gameOverPayload: any = null;
      engine.on('extracted', (data) => {
        events.push('extracted');
        extractedPayload = data;
      });
      engine.on('gameOver', (data) => {
        events.push('gameOver');
        gameOverPayload = data;
      });
      engine.on('deathSequence', () => {
        events.push('deathSequence');
      });

      const head = engine.getState().snake[0];
      engine.placeExit({ x: head.x + 1, y: 0, z: head.z });
      engine.tick();
      return { events, extractedPayload, gameOverPayload };
    }

    it('finalizes synchronously: extracted then gameOver, no death sequence', () => {
      const engine = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
      engine.start();
      const { events } = extractNow(engine);

      expect(events).toEqual(['extracted', 'gameOver']);
      const state = engine.getState();
      expect(state.isGameOver).toBe(true);
      expect(state.isPlaying).toBe(false);
      expect(state.isDeathSequence).toBe(false);
      expect(state.extracted).toBe(true);
      expect(state.exitTile).toBeNull();
    });

    it('gameOver payload carries raw totals + extraction flags', () => {
      const engine = new SnakeGameLogic({ gridSize: 60, ruleset: RULESETS.CYBER });
      engine.start();
      eatFoods(engine, 7);
      const { gameOverPayload, extractedPayload } = extractNow(engine);

      const expected = computeRunTotals('CYBER', 7);
      expect(gameOverPayload).toEqual({
        score: expected.score,
        dnaCollected: expected.rawDna, // RAW - the server applies the bank bonus
        foodEaten: 7,
        extracted: true,
        endReason: 'extracted',
        deathPosition: null,
        mutations: [],
        deathCause: 'extracted', // Identity v1 section 9.5
        phoenixTriggeredAtFood: null,
        genome: null, // legacy runs carry no genome payload
      });
      expect(extractedPayload).toEqual({
        score: expected.score,
        dnaCollected: expected.rawDna,
        foodEaten: 7,
      });
    });

    it('integration: spawned portal -> steer into it -> banked end (placeExit-free)', () => {
      // Fully driven flow: eat to the spawn threshold with a deterministic
      // rng, then walk to the portal the engine itself placed.
      const engine = new SnakeGameLogic({
        gridSize: 60,
        ruleset: RULESETS.PRIMAL,
        rng: () => 0.999,
      });
      engine.start();
      let gameOver: GameOverData | null = null;
      engine.on('gameOver', (data) => {
        gameOver = data as GameOverData;
      });

      eatFoods(engine, 15);
      const exit = engine.getState().exitTile!;
      expect(exit).not.toBeNull();

      // Steer on a clear row before approaching the exit. The safe placer is
      // allowed to reject the old fixed corner when the current food occupies
      // it, so this test follows the engine's chosen cell rather than pinning
      // an implementation-specific RNG draw.
      engine.placeFood({ x: 0, y: 0, z: 0 });
      let guard = 0;
      let head = engine.getState().snake[0];
      const needsBehindDetour = exit.z === head.z && exit.x < head.x;
      if (needsBehindDetour) {
        engine.setDirection('DOWN');
        engine.tick();
        engine.setDirection('LEFT');
        while (
          !engine.getState().isGameOver &&
          engine.getState().snake[0].x !== exit.x &&
          guard++ < 300
        ) {
          engine.tick();
        }
        engine.setDirection('UP');
        engine.tick();
      } else {
        if (head.z !== exit.z) {
          engine.setDirection(exit.z < head.z ? 'UP' : 'DOWN');
          while (
            !engine.getState().isGameOver &&
            engine.getState().snake[0].z !== exit.z &&
            guard++ < 300
          ) {
            engine.tick();
          }
        }
        head = engine.getState().snake[0];
        if (head.x !== exit.x) {
          engine.setDirection(exit.x < head.x ? 'LEFT' : 'RIGHT');
          while (
            !engine.getState().isGameOver &&
            engine.getState().snake[0].x !== exit.x &&
            guard++ < 300
          ) {
            engine.tick();
          }
        }
      }

      expect(gameOver).not.toBeNull();
      expect(gameOver!.extracted).toBe(true);
      expect(gameOver!.endReason).toBe('extracted');
      const expected = computeRunTotals('PRIMAL', 15);
      expect(gameOver!.dnaCollected).toBe(expected.rawDna);
      expect(gameOver!.foodEaten).toBe(15);
    });

    it('death still reports endReason died with extraction flags false', async () => {
      const engine = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
      engine.start();
      let gameOver: GameOverData | null = null;
      engine.on('gameOver', (data) => {
        gameOver = data as GameOverData;
      });

      for (let i = 0; i < 20; i++) {
        engine.tick(); // march into the wall
      }
      await new Promise((resolve) => setTimeout(resolve, 900));

      expect(gameOver).not.toBeNull();
      expect(gameOver!.extracted).toBe(false);
      expect(gameOver!.endReason).toBe('died');
      expect(gameOver!.deathPosition).not.toBeNull();
      expect(typeof gameOver!.foodEaten).toBe('number');
    });

    it('restart clears extraction state', () => {
      const engine = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
      engine.start();
      extractNow(engine);
      expect(engine.getState().extracted).toBe(true);

      engine.start();
      const state = engine.getState();
      expect(state.extracted).toBe(false);
      expect(state.exitTile).toBeNull();
      expect(state.foodEaten).toBe(0);
      expect(state.nextExitAtFood).toBe(15);
      expect(state.isPlaying).toBe(true);
    });
  });

  // =========================================================================
  // Design v2 Phase 2: Mutation Food
  // =========================================================================

  describe('Mutation food: spawn cadence', () => {
    it('first spawn lands between food 4 and 8, ticksRemaining 40', () => {
      const engine = new SnakeGameLogic({
        gridSize: 60,
        ruleset: RULESETS.PRIMAL,
        rng: mulberry(7),
      });
      engine.start();
      let spawned: any = null;
      engine.on('mutationSpawned', (data) => {
        spawned = { ...(data as object), atFood: engine.getState().foodEaten };
      });

      eatFoods(engine, 3);
      expect(spawned).toBeNull();
      expect(engine.getState().mutationTile).toBeNull();

      eatFoods(engine, 5); // through food 8 - the max threshold
      expect(spawned).not.toBeNull();
      expect(spawned.atFood).toBeGreaterThanOrEqual(4);
      expect(spawned.atFood).toBeLessThanOrEqual(8);
      expect(spawned.ticksRemaining).toBe(40);
    });

    it('never spawns while another mutation food is on the board', () => {
      const engine = new SnakeGameLogic({
        gridSize: 100,
        ruleset: RULESETS.PRIMAL,
        rng: () => 0.999, // threshold 8, tile parked at (99,99)
      });
      engine.start();
      let spawnCount = 0;
      engine.on('mutationSpawned', () => {
        spawnCount += 1;
      });
      eatFoods(engine, 40);
      expect(spawnCount).toBe(1);
    });

    it('never returns a terrain-blocked last guess as a gene opportunity', () => {
      const engine = new SnakeGameLogic({
        gridSize: 20,
        ruleset: RULESETS.PRIMAL,
        rng: () => 0,
      });
      engine.start();
      const harness = engine as unknown as {
        state: GameState;
        spawnMutationFood: () => void;
      };
      harness.state.terrain.push({
        x: 0,
        z: 0,
        source: 'cosmic',
        formingTicks: 0,
        formingTotal: 1,
        solid: true,
      });

      harness.spawnMutationFood();

      const state = engine.getState();
      expect(state.mutationTile).not.toBeNull();
      expect(state.mutationTile).not.toMatchObject({ x: 0, z: 0 });
      expect(
        state.terrain.some(
          (block) =>
            block.x === state.mutationTile!.x &&
            block.z === state.mutationTile!.z
        )
      ).toBe(false);
    });

    it('despawns after its tick window and reschedules 4-8 foods out', () => {
      const engine = new SnakeGameLogic({
        gridSize: 60,
        ruleset: RULESETS.PRIMAL,
        rng: () => 0.5, // reschedule roll = 6
      });
      engine.start();
      let despawned = false;
      engine.on('mutationDespawned', () => {
        despawned = true;
      });

      const head = engine.getState().snake[0];
      engine.placeFood({ x: 0, y: 0, z: 0 }); // off the march row
      engine.placeMutation({ x: 0, y: 0, z: head.z + 5 }, 5);

      for (let expected = 4; expected >= 1; expected--) {
        engine.tick();
        expect(engine.getState().mutationTicksRemaining).toBe(expected);
        expect(engine.getState().mutationTile).not.toBeNull();
      }
      engine.tick();
      expect(despawned).toBe(true);
      const state = engine.getState();
      expect(state.mutationTile).toBeNull();
      expect(state.nextMutationAtFood).toBe(state.foodEaten + 6);
    });

    it('stops spawning at the 4-held stacking cap', () => {
      const engine = new SnakeGameLogic({
        gridSize: 60,
        ruleset: RULESETS.PRIMAL,
        rng: () => 0.2, // threshold 5
      });
      engine.start();
      engine.grantMutation('wall_rush');
      engine.grantMutation('shed');
      engine.grantMutation('magnet_pulse');
      engine.grantMutation('mirror_wager');
      let spawnCount = 0;
      engine.on('mutationSpawned', () => {
        spawnCount += 1;
      });
      eatFoods(engine, 20);
      expect(spawnCount).toBe(0);
    });
  });

  describe('Mutation food: choice hold', () => {
    function openChoice(rng: () => number = () => 0.3): SnakeGameLogic {
      const engine = new SnakeGameLogic({
        gridSize: 20,
        ruleset: RULESETS.PRIMAL,
        rng,
      });
      engine.start();
      const head = engine.getState().snake[0];
      engine.placeFood({ x: 0, y: 0, z: 0 });
      engine.placeMutation({ x: head.x + 1, y: 0, z: head.z });
      engine.tick();
      return engine;
    }

    it('eating the helix opens a choice-of-2 without growth or DNA', () => {
      const engine = openChoice();
      const state = engine.getState();
      expect(state.pendingChoice).not.toBeNull();
      expect(state.pendingChoice![0]).not.toBe(state.pendingChoice![1]);
      expect(state.mutationTile).toBeNull();
      expect(state.snake.length).toBe(3); // not food - no growth
      expect(state.dnaCollected).toBe(0);
      expect(state.foodEaten).toBe(0);
    });

    it('emits mutationChoice with the two options', () => {
      const engine = new SnakeGameLogic({
        gridSize: 20,
        ruleset: RULESETS.PRIMAL,
        rng: () => 0.3,
      });
      engine.start();
      let options: any = null;
      engine.on('mutationChoice', (data: any) => {
        options = data.options;
      });
      const head = engine.getState().snake[0];
      engine.placeFood({ x: 0, y: 0, z: 0 });
      engine.placeMutation({ x: head.x + 1, y: 0, z: head.z });
      engine.tick();
      expect(options).toHaveLength(2);
      expect(engine.getState().pendingChoice).toEqual(options);
    });

    it('freezes the engine: ticks no-op, input is inactive, pause is refused', () => {
      const engine = openChoice();
      const before = engine.getState();
      engine.tick();
      engine.tick();
      expect(engine.getState().snake).toEqual(before.snake);
      expect(engine.setDirection('UP')).toBe('inactive');
      engine.pause();
      expect(engine.getState().isPaused).toBe(false); // NOT the pause state
    });

    it('chooseMutation holds the pick at the current food count and clears the choice hold', () => {
      const engine = openChoice();
      let picked: any = null;
      engine.on('mutationPicked', (data) => {
        picked = data;
      });
      const options = engine.getState().pendingChoice!;
      expect(engine.chooseMutation(0)).toBe(true);

      const state = engine.getState();
      expect(state.pendingChoice).toBeNull();
      expect(state.heldMutations).toEqual([{ id: options[0], atFood: 0 }]);
      expect(picked.id).toBe(options[0]);

      const headBefore = engine.getState().snake[0];
      engine.tick(); // the engine can advance unless its UI listener arms a gate
      expect(engine.getState().snake[0]).not.toEqual(headBefore);
    });

    it('can be synchronously gated by the mutationPicked listener before any tick', () => {
      const engine = openChoice();
      engine.on('mutationPicked', () => engine.pause());
      const headBefore = { ...engine.getState().snake[0] };

      expect(engine.chooseMutation(0)).toBe(true);
      expect(engine.isPaused).toBe(true);
      engine.tick();
      expect(engine.getState().snake[0]).toEqual(headBefore);
    });

    it('declining takes neither and clears the choice hold', () => {
      const engine = openChoice();
      let declined = false;
      engine.on('mutationDeclined', () => {
        declined = true;
      });
      engine.declineMutation();
      expect(declined).toBe(true);
      expect(engine.getState().pendingChoice).toBeNull();
      expect(engine.getState().heldMutations).toEqual([]);
    });

    it('can be synchronously gated by the mutationDeclined listener before any tick', () => {
      const engine = openChoice();
      engine.on('mutationDeclined', () => engine.pause());
      const headBefore = { ...engine.getState().snake[0] };

      engine.declineMutation();
      expect(engine.isPaused).toBe(true);
      engine.tick();
      expect(engine.getState().snake[0]).toEqual(headBefore);
    });

    it('chooseMutation is a no-op without a pending choice', () => {
      const engine = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
      engine.start();
      expect(engine.chooseMutation(0)).toBe(false);
      expect(engine.getState().heldMutations).toEqual([]);
    });

    it('offers never include already-held mutations', () => {
      for (let seed = 1; seed <= 20; seed++) {
        const engine = openChoice(mulberry(seed));
        engine.chooseMutation(0);
        const held = engine.getState().heldMutations[0].id;
        // Open a second choice
        const head = engine.getState().snake[0];
        engine.placeMutation({ x: head.x + 1, y: 0, z: head.z });
        engine.tick();
        const offer = engine.getState().pendingChoice!;
        expect(offer).not.toContain(held);
        expect(offer[0]).not.toBe(offer[1]);
      }
    });
  });

  describe('Mutation effects: physical behaviors', () => {
    it('Overgrowth grows +2 extra segments per food and pays +20%', () => {
      const engine = new SnakeGameLogic({ gridSize: 60, ruleset: RULESETS.PRIMAL });
      engine.start();
      engine.grantMutation('overgrowth');
      eatFoods(engine, 1);
      const state = engine.getState();
      expect(state.snake.length).toBe(3 + 1 + 2);
      expect(state.dnaCollected).toBe(12); // round(10 x 1.2)
    });

    it('Shed resets the tail to length 8 every 25 foods and pays -10%', () => {
      const engine = new SnakeGameLogic({
        gridSize: 60,
        ruleset: RULESETS.PRIMAL,
        rng: () => 0.999,
      });
      engine.start();
      engine.grantMutation('shed');
      eatFoods(engine, 24);
      expect(engine.getState().snake.length).toBe(3 + 24);
      eatFoods(engine, 1); // food 25 - the shed boundary
      const state = engine.getState();
      expect(state.snake.length).toBe(8);
      expect(state.dnaCollected).toBe(
        computeRunTotals('PRIMAL', 25, [{ id: 'shed', atFood: 0 }]).rawDna
      );
    });

    it('Wall Rush slides along the wall (clockwise preference) instead of dying', () => {
      const engine = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
      engine.start();
      engine.grantMutation('wall_rush');
      engine.placeFood({ x: 0, y: 0, z: 0 });

      for (let i = 0; i < 9; i++) engine.tick(); // head to (19,10)
      expect(engine.getState().snake[0]).toEqual({ x: 19, y: 0, z: 10 });

      engine.tick(); // into the wall -> slide
      const state = engine.getState();
      expect(state.isDeathSequence).toBe(false);
      expect(state.isGameOver).toBe(false);
      expect(state.direction).toBe('DOWN'); // clockwise of RIGHT
      expect(state.snake[0]).toEqual({ x: 19, y: 0, z: 11 });
    });

    it('Wall Rush slides around the corner too (DOWN -> LEFT)', () => {
      const engine = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
      engine.start();
      engine.grantMutation('wall_rush');
      engine.placeFood({ x: 0, y: 0, z: 0 });

      for (let i = 0; i < 10; i++) engine.tick(); // slide onto the right wall
      for (let i = 0; i < 20; i++) engine.tick(); // ride the wall down + around
      const state = engine.getState();
      expect(state.isGameOver).toBe(false);
      expect(state.direction).toBe('LEFT'); // clockwise of DOWN at the corner
      expect(state.snake[0].z).toBe(19);
    });

    it('Magnet Pulse pulls food within 2 cells one step toward the head', () => {
      const engine = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
      engine.start();
      engine.grantMutation('magnet_pulse');
      engine.placeFood({ x: 11, y: 0, z: 12 }); // 2 below next head cell

      engine.tick(); // head -> (11,10); food pulled (11,12) -> (11,11)
      expect(engine.getState().food).toEqual({ x: 11, y: 0, z: 11 });
    });

    it('Magnet Pulse ignores food beyond its 2-cell radius', () => {
      const engine = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
      engine.start();
      engine.grantMutation('magnet_pulse');
      engine.placeFood({ x: 11, y: 0, z: 14 });
      engine.tick();
      expect(engine.getState().food).toEqual({ x: 11, y: 0, z: 14 });
    });

    it('Magnet Pulse delays the next exit portal by 4 foods', () => {
      const engine = new SnakeGameLogic({
        gridSize: 60,
        ruleset: RULESETS.PRIMAL,
        rng: () => 0, // base reroll interval 8
      });
      engine.start();
      engine.grantMutation('magnet_pulse');
      const head = engine.getState().snake[0];
      engine.placeFood({ x: 0, y: 0, z: 0 });
      engine.placeExit({ x: 0, y: 0, z: head.z + 5 }, 1);
      engine.tick(); // portal despawns
      expect(engine.getState().exitTile).toBeNull();
      expect(engine.getState().nextExitAtFood).toBe(
        engine.getState().foodEaten + 8 + 4
      );
    });

    it('Time Dilation slows fixed-speed dynasties by 40ms', () => {
      const engine = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
      engine.start();
      expect(engine.getSpeed()).toBe(PRIMAL_SPEED_MS);
      engine.grantMutation('time_dilation');
      // The mutation adds a flat 40ms to whatever the dynasty's tick is, so it
      // follows PRIMAL's tempo rather than restating it (175 -> 215).
      expect(engine.getSpeed()).toBe(PRIMAL_SPEED_MS + 40);
    });

    it('Time Dilation runs CYBER one tier (5 foods) behind on the speed curve', () => {
      const engine = new SnakeGameLogic({
        gridSize: 60,
        ruleset: RULESETS.CYBER,
        rng: () => 0.999,
      });
      engine.start();
      eatFoods(engine, 10);
      expect(engine.getSpeed()).toBe(RULESETS.CYBER.speedForFood(10));
      engine.grantMutation('time_dilation');
      expect(engine.getSpeed()).toBe(RULESETS.CYBER.speedForFood(5));
    });

    it('Splitter spawns food in pairs, each worth 70%', () => {
      const engine = new SnakeGameLogic({ gridSize: 60, ruleset: RULESETS.PRIMAL });
      engine.start();
      engine.grantMutation('splitter');
      eatFoods(engine, 1); // wave empties -> pair spawns
      const state = engine.getState();
      expect(state.foods).toHaveLength(2);
      expect(state.dnaCollected).toBe(7); // round(10 x 0.7)
    });

    it('Gold Trail clamps the live portal to 60 ticks and shortens future ones', () => {
      const engine = new SnakeGameLogic({
        gridSize: 60,
        ruleset: RULESETS.PRIMAL,
        rng: () => 0.999,
      });
      engine.start();
      const head = engine.getState().snake[0];
      engine.placeExit({ x: 0, y: 0, z: head.z + 5 });
      expect(engine.getState().exitTicksRemaining).toBe(90);
      engine.grantMutation('gold_trail');
      expect(engine.getState().exitTicksRemaining).toBe(60);
    });

    it('Gold Trail portals spawned later open with the 60-tick window', () => {
      const engine = new SnakeGameLogic({
        gridSize: 60,
        ruleset: RULESETS.PRIMAL,
        rng: () => 0.999,
      });
      engine.start();
      engine.grantMutation('gold_trail');
      let ticksAtSpawn = 0;
      engine.on('exitSpawned', (data: any) => {
        ticksAtSpawn = data.ticksRemaining;
      });
      eatFoods(engine, 15);
      expect(ticksAtSpawn).toBe(60);
      // Golden math rides the shared modifier: foods 5,10,15 after pickup x3
      expect(engine.getState().dnaCollected).toBe(
        computeRunTotals('PRIMAL', 15, [{ id: 'gold_trail', atFood: 0 }]).rawDna
      );
    });
  });

  describe('Mutation effects: Phoenix', () => {
    it('absorbs exactly one death: rewound 3 cells, length UNCHANGED (Rule 15)', () => {
      const engine = new SnakeGameLogic({
        gridSize: 20,
        ruleset: RULESETS.PRIMAL,
        rng: () => 0.999,
      });
      engine.start();
      engine.grantMutation('phoenix');
      eatFoods(engine, 8); // length 11, head at (18,10)
      engine.placeFood({ x: 0, y: 0, z: 0 });
      let phoenixEvent: any = null;
      engine.on('phoenixTriggered', (data) => {
        phoenixEvent = data;
      });

      engine.tick(); // head to (19,10)
      engine.tick(); // into the wall -> phoenix
      const state = engine.getState();
      expect(phoenixEvent).not.toBeNull();
      expect(phoenixEvent.atFood).toBe(8);
      expect(state.isDeathSequence).toBe(false);
      expect(state.isGameOver).toBe(false);
      expect(state.phoenixAvailable).toBe(false);
      expect(state.phoenixTriggeredAtFood).toBe(8);
      // Rule 15 (v1.4): a revive grants SURVIVAL, not a clean slate. The
      // head backs up three cells along the body - positional mercy, so a
      // full-length snake can escape the jam that killed it - and the three
      // cells are restored at the tail, so the length is exactly what it was.
      // The old behaviour truncated to 8, which was the largest single
      // length-rewind in the game.
      expect(state.snake).toHaveLength(11);
      expect(state.snake[0]).toEqual({ x: 16, y: 0, z: 10 }); // rewound 3
      expect(state.direction).toBe('RIGHT'); // heading re-derived from the body
      expect(state.revivePhaseTicksRemaining).toBe(
        MUTATION_PHYSICS.revivePhaseTicks
      );

      // The phase is temporary: it buys twelve resolved moves (including a
      // boundary wrap), then the next collision is real.
      for (let i = 0; i < MUTATION_PHYSICS.revivePhaseTicks; i++) engine.tick();
      expect(engine.getState().revivePhaseTicksRemaining).toBe(0);
      for (let i = 0; i < 40 && !engine.getState().isDeathSequence; i++) {
        engine.tick();
      }
      expect(engine.getState().isDeathSequence).toBe(true);
    });

    it('voids economic benefits from the trigger food onward (exact parity)', () => {
      const engine = new SnakeGameLogic({
        gridSize: 20,
        ruleset: RULESETS.PRIMAL,
        rng: () => 0.999,
      });
      engine.start();
      engine.grantMutation('overgrowth');
      engine.grantMutation('phoenix');
      eatFoods(engine, 5); // head (15,10), trigger comes at food 5
      engine.placeFood({ x: 0, y: 0, z: 0 });
      for (let i = 0; i < 5; i++) engine.tick(); // wall at x=19 -> phoenix
      expect(engine.getState().phoenixTriggeredAtFood).toBe(5);

      eatFoods(engine, 3); // foods 6-8, post-trigger: +20% voided
      const picks = engine.getState().heldMutations;
      expect(engine.getState().dnaCollected).toBe(
        computeRunTotals('PRIMAL', 8, picks, 5).rawDna
      );
    });

    it('reports the trigger in the gameOver payload', async () => {
      const engine = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
      engine.start();
      engine.grantMutation('phoenix');
      engine.placeFood({ x: 0, y: 0, z: 0 });
      let gameOver: GameOverData | null = null;
      engine.on('gameOver', (data) => {
        gameOver = data as GameOverData;
      });

      for (let i = 0; i < 12; i++) engine.tick(); // wall -> phoenix -> retrace
      for (let i = 0; i < 25; i++) engine.tick(); // second wall -> real death
      await new Promise((resolve) => setTimeout(resolve, 900));

      expect(gameOver).not.toBeNull();
      expect(gameOver!.phoenixTriggeredAtFood).toBe(0);
      expect(gameOver!.mutations).toEqual([{ id: 'phoenix', atFood: 0 }]);
    });
  });

  describe('Phase 2 restart hygiene', () => {
    it('restart clears mutations, choice, phoenix and the constellation', () => {
      const engine = new SnakeGameLogic({
        gridSize: 60,
        ruleset: RULESETS.COSMIC,
        rng: () => 0.5,
      });
      engine.start();
      engine.grantMutation('phoenix');
      engine.grantMutation('overgrowth');
      eatFoods(engine, 3);
      const head = engine.getState().snake[0];
      engine.placeMutation({ x: head.x + 1, y: 0, z: head.z });
      engine.tick();
      expect(engine.getState().pendingChoice).not.toBeNull();

      engine.start();
      const state = engine.getState();
      expect(state.heldMutations).toEqual([]);
      expect(state.pendingChoice).toBeNull();
      expect(state.mutationTile).toBeNull();
      expect(state.phoenixAvailable).toBe(false);
      expect(state.phoenixTriggeredAtFood).toBeNull();
      expect(state.nextMutationAtFood).toBe(6); // rng 0.5 -> 6
      expect(state.foods).toHaveLength(COSMIC_CONSTELLATION.size);
      // A fresh run opens a fresh window - 8s at COSMIC's 160ms tick.
      expect(state.constellationWindowTicks).toBe(50);
      expect(state.constellationTicksRemaining).toBe(50);

      engine.spawnFood();
      expect(engine.getState().foods).toHaveLength(COSMIC_CONSTELLATION.size);

      // Starting again opens a normal live constellation with no planning
      // counter or forced-pause state attached to it.
      engine.start();
      expect(engine.getState().isPaused).toBe(false);
    });
  });
});
