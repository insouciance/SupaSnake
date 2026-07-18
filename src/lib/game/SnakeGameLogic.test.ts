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
  RULESETS,
  computeRunTotals,
  type DynastyName,
} from '@/shared/game/rulesets';

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

describe('SnakeGameLogic', () => {
  let game: SnakeGameLogic;

  beforeEach(() => {
    game = new SnakeGameLogic({ gridSize: 20 });
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

  describe('Speed Progression (per ruleset)', () => {
    it('should have the COSMIC Flux fixed speed on start (COSMIC default)', () => {
      game.start();
      expect(game.getSpeed()).toBe(160);
    });

    it('keeps speed fixed on the COSMIC ruleset', () => {
      game.start();
      const initialSpeed = game.getSpeed();
      const state = game.getState();
      game.placeFood({ x: state.snake[0].x + 1, y: 0, z: state.snake[0].z });
      game.tick();

      expect(game.getSpeed()).toBe(initialSpeed);
    });

    it('keeps speed fixed on PRIMAL regardless of foods eaten', () => {
      const primal = new SnakeGameLogic({ gridSize: 60, ruleset: RULESETS.PRIMAL });
      primal.start();
      eatFoods(primal, 10);
      expect(primal.getSpeed()).toBe(200);
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
      const cyber = new SnakeGameLogic({ gridSize: 200, ruleset: RULESETS.CYBER });
      cyber.start();
      eatFoods(cyber, 60);
      expect(cyber.getSpeed()).toBeGreaterThanOrEqual(50);
    });

    it('setRuleset re-derives speed from the current food count', () => {
      game.start();
      game.setRuleset(RULESETS.CYBER);
      expect(game.getSpeed()).toBe(RULESETS.CYBER.speedForFood(0));
      game.setRuleset(RULESETS.PRIMAL);
      expect(game.getSpeed()).toBe(200);
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

      // Score is display points (10/food on the flat placeholder ruleset);
      // foodEaten is the raw fact the server recomputes from
      expect(game.getState().score).toBe(10);
      expect(game.getState().foodEaten).toBe(1);
    });
  });
  describe('Ruleset scoring parity (client mirrors server recompute)', () => {
    it.each<[DynastyName, number]>([
      ['PRIMAL', 12],
      ['CYBER', 12],
      ['COSMIC', 12],
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

    it('CYBER out-scores PRIMAL for the same foods once tiers kick in', () => {
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
        rng: () => 0.999, // exit lands at (59, 59)
      });
      engine.start();
      let gameOver: GameOverData | null = null;
      engine.on('gameOver', (data) => {
        gameOver = data as GameOverData;
      });

      eatFoods(engine, 15);
      const exit = engine.getState().exitTile!;
      expect(exit).toEqual({ x: 59, y: 0, z: 59 });

      // Steer to the exit column, then down its row. Park food far away
      // (grid corner opposite) so no accidental eats reschedule anything.
      engine.placeFood({ x: 0, y: 0, z: 0 });
      let guard = 0;
      while (engine.getState().snake[0].x < exit.x && guard++ < 100) {
        engine.tick(); // heading RIGHT
      }
      engine.setDirection('DOWN');
      while (!engine.getState().isGameOver && guard++ < 300) {
        engine.tick();
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
});
