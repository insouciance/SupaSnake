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
import { GAME_CONFIG } from '@/shared/config/game';

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
        game.setDirection('UP');
        game.setDirection('LEFT');
        expect(game.getQueuedDirections()).toEqual(['UP', 'LEFT']);

        game.pause();
        expect(game.getQueuedDirections()).toEqual([]);
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

    it('never charges a decision hold, even with the budget exhausted', () => {
      for (let i = 0; i < BASE; i++) {
        game.pause();
        game.resume();
      }
      // The run's own decisions are Rule 1 territory: always free, always
      // granted. This is the re-arm the page performs after a gene, portal
      // or surge choice resolves.
      expect(game.pause('decision')).toBe(true);
      expect(game.isPaused).toBe(true);
      expect(game.getState().holdsUsed).toBe(BASE);
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

    it('COSMIC totals equal the base recompute plus the reported combo bonus', () => {
      const engine = new SnakeGameLogic({
        gridSize: 60,
        ruleset: RULESETS.COSMIC,
        rng: () => 0.999,
      });
      engine.start();
      eatFoods(engine, 12);

      const expected = computeRunTotals('COSMIC', 12);
      const state = engine.getState();
      // Bounded-trust bookkeeping: totals decompose exactly into base + bonus
      expect(state.dnaCollected).toBe(expected.rawDna + state.comboDnaBonus);
      expect(state.score).toBe(expected.score + state.comboScoreBonus);
      expect(state.foodEaten).toBe(12);
      // Eating every tick with one glyph builds the full chain:
      // per-food values 10,12,14,16,18,20,22 then 24 from chain 8 on
      expect(state.maxChain).toBe(12);
      expect(state.dnaCollected).toBe(232);
      expect(state.comboDnaBonus).toBe(112);
      expect(state.comboScoreBonus).toBe(112);
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
        mutations: [],
        deathCause: 'extracted', // Identity v1 section 9.5
        phoenixTriggeredAtFood: null,
        cosmic: null, // non-COSMIC runs carry no combo claim
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

  // =========================================================================
  // Design v2 Phase 2: Mutation Food
  // =========================================================================

  describe('Mutation food: spawn cadence', () => {
    it('first spawn lands between food 15 and 25, ticksRemaining 40', () => {
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

      eatFoods(engine, 14);
      expect(spawned).toBeNull();
      expect(engine.getState().mutationTile).toBeNull();

      eatFoods(engine, 11); // through food 25 - the max threshold
      expect(spawned).not.toBeNull();
      expect(spawned.atFood).toBeGreaterThanOrEqual(15);
      expect(spawned.atFood).toBeLessThanOrEqual(25);
      expect(spawned.ticksRemaining).toBe(40);
    });

    it('never spawns while another mutation food is on the board', () => {
      const engine = new SnakeGameLogic({
        gridSize: 100,
        ruleset: RULESETS.PRIMAL,
        rng: () => 0.999, // threshold 25, tile parked at (99,99)
      });
      engine.start();
      let spawnCount = 0;
      engine.on('mutationSpawned', () => {
        spawnCount += 1;
      });
      eatFoods(engine, 40);
      expect(spawnCount).toBe(1);
    });

    it('despawns after its tick window and reschedules 15-25 foods out', () => {
      const engine = new SnakeGameLogic({
        gridSize: 60,
        ruleset: RULESETS.PRIMAL,
        rng: () => 0.5, // reschedule roll = 20
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
      expect(state.nextMutationAtFood).toBe(state.foodEaten + 20);
    });

    it('stops spawning at the 4-held stacking cap', () => {
      const engine = new SnakeGameLogic({
        gridSize: 60,
        ruleset: RULESETS.PRIMAL,
        rng: () => 0.2, // threshold 17
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
      expect(engine.getSpeed()).toBe(200);
      engine.grantMutation('time_dilation');
      expect(engine.getSpeed()).toBe(240);
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

      // The second death is real
      for (let i = 0; i < 4; i++) engine.tick(); // back into the wall
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

  // =========================================================================
  // Design v2 Phase 2: COSMIC Flux
  // =========================================================================

  describe('COSMIC Flux: constellation groups + combo chain', () => {
    function cosmicEngine(rng: () => number = () => 0.999): SnakeGameLogic {
      const engine = new SnakeGameLogic({
        gridSize: 60,
        ruleset: RULESETS.COSMIC,
        rng,
      });
      engine.start();
      return engine;
    }

    it('spawns foods as clustered glyph groups of 3', () => {
      const engine = cosmicEngine(mulberry(11));
      const state = engine.getState();
      expect(state.foods).toHaveLength(3);
      expect(state.constellationGlyph).toBeGreaterThanOrEqual(0);
      expect(state.constellationGlyph).toBeLessThan(3);
      const anchor = state.foods[0];
      for (const food of state.foods) {
        expect(Math.abs(food.x - anchor.x)).toBeLessThanOrEqual(4);
        expect(Math.abs(food.z - anchor.z)).toBeLessThanOrEqual(4);
        expect(
          state.snake.some((s) => s.x === food.x && s.z === food.z)
        ).toBe(false);
      }
    });

    it('Splitter widens COSMIC groups to 4', () => {
      const engine = cosmicEngine();
      engine.grantMutation('splitter');
      engine.placeFood({ x: engine.getState().snake[0].x + 1, y: 0, z: 30 });
      engine.tick(); // eat the single placed food -> new wave
      expect(engine.getState().foods).toHaveLength(4);
    });

    it('chains same-glyph eats within the 8-tick window: x1.2 -> x2.4', () => {
      const engine = cosmicEngine();
      const z = engine.getState().snake[0].z;

      engine.placeFood({ x: 31, y: 0, z }, 2);
      engine.tick(); // eat 1: chain 1, 10 DNA
      expect(engine.getState().chainLength).toBe(1);
      expect(engine.getState().dnaCollected).toBe(10);

      engine.placeFood({ x: 33, y: 0, z }, 2);
      engine.tick();
      engine.tick(); // eat 2 after a 2-tick gap: chain 2, +12
      const state = engine.getState();
      expect(state.chainLength).toBe(2);
      expect(state.comboMultiplier).toBeCloseTo(1.2, 10);
      expect(state.dnaCollected).toBe(22);
      expect(state.comboDnaBonus).toBe(2);
      expect(state.score).toBe(22);
    });

    it('a different glyph resets the chain', () => {
      const engine = cosmicEngine();
      const z = engine.getState().snake[0].z;

      engine.placeFood({ x: 31, y: 0, z }, 0);
      engine.tick(); // chain 1
      engine.placeFood({ x: 32, y: 0, z }, 0);
      engine.tick(); // chain 2
      expect(engine.getState().chainLength).toBe(2);

      engine.placeFood({ x: 33, y: 0, z }, 1); // wrong glyph
      engine.tick();
      expect(engine.getState().chainLength).toBe(1);
      expect(engine.getState().comboMultiplier).toBe(1);
    });

    it('more than 8 ticks between eats breaks the chain', () => {
      const engine = cosmicEngine();
      const z = engine.getState().snake[0].z;

      engine.placeFood({ x: 31, y: 0, z }, 2);
      engine.tick(); // chain 1 at x=31
      engine.placeFood({ x: 41, y: 0, z }, 2); // 10 cells away: 10-tick gap
      for (let i = 0; i < 10; i++) engine.tick();
      expect(engine.getState().foodEaten).toBe(2);
      expect(engine.getState().chainLength).toBe(1); // window missed

      // But an 8-tick gap keeps it alive
      engine.placeFood({ x: 49, y: 0, z }, 2); // 8 cells -> 8-tick gap
      for (let i = 0; i < 8; i++) engine.tick();
      expect(engine.getState().foodEaten).toBe(3);
      expect(engine.getState().chainLength).toBe(2);
    });

    it('caps the combo at x2.4 from chain 8 (10,12,...,24 then flat 24)', () => {
      const engine = cosmicEngine();
      eatFoods(engine, 10);
      const state = engine.getState();
      expect(state.maxChain).toBe(10);
      expect(state.comboMultiplier).toBe(2.4);
      // 10+12+14+16+18+20+22+24+24+24
      expect(state.dnaCollected).toBe(184);
      expect(state.comboDnaBonus).toBe(84);
    });
  });

  describe('COSMIC Flux: wrap phases', () => {
    function parkedCosmic(gridSize = 20): SnakeGameLogic {
      const engine = new SnakeGameLogic({
        gridSize,
        ruleset: RULESETS.COSMIC,
        rng: () => 0.999,
      });
      engine.start();
      engine.placeFood({ x: 0, y: 0, z: 0 }); // off the march row
      return engine;
    }

    it('opens every run with a full open-phase window', () => {
      const engine = parkedCosmic();
      const state = engine.getState();
      expect(state.fluxPhase).toBe('open');
      expect(state.fluxTicksRemaining).toBe(75);
      expect(state.fluxTelegraph).toBe(false);
    });

    it('non-COSMIC dynasties have no flux phase', () => {
      const engine = new SnakeGameLogic({ gridSize: 20, ruleset: RULESETS.PRIMAL });
      engine.start();
      expect(engine.getState().fluxPhase).toBeNull();
    });

    it('wraps the snake across the edge while the walls are open', () => {
      const engine = parkedCosmic();
      for (let i = 0; i < 10; i++) engine.tick(); // (10,10) -> wraps at 19
      const state = engine.getState();
      expect(state.isGameOver).toBe(false);
      expect(state.isDeathSequence).toBe(false);
      expect(state.snake[0]).toEqual({ x: 0, y: 0, z: 10 });
    });

    it('raises the telegraph ~2s before the phase flips, then flips closed', () => {
      const engine = parkedCosmic();
      const telegraphs: any[] = [];
      const changes: any[] = [];
      engine.on('fluxTelegraph', (data) => telegraphs.push(data));
      engine.on('fluxPhaseChange', (data) => changes.push(data));

      for (let i = 0; i < 63; i++) engine.tick(); // remaining hits 12
      expect(telegraphs).toHaveLength(1);
      expect(telegraphs[0].nextPhase).toBe('closed');
      expect(engine.getState().fluxTelegraph).toBe(true);
      expect(changes).toHaveLength(0);

      for (let i = 0; i < 12; i++) engine.tick(); // remaining hits 0 -> flip
      expect(changes).toHaveLength(1);
      expect(changes[0].phase).toBe('closed');
      const state = engine.getState();
      expect(state.fluxPhase).toBe('closed');
      expect(state.fluxTicksRemaining).toBe(50);
      expect(state.fluxTelegraph).toBe(false);
    });

    it('walls kill while closed', () => {
      const engine = parkedCosmic();
      for (let i = 0; i < 75; i++) engine.tick(); // phase -> closed, head (5,10)
      expect(engine.getState().fluxPhase).toBe('closed');
      for (let i = 0; i < 15; i++) engine.tick(); // march into the wall
      expect(engine.getState().isDeathSequence).toBe(true);
    });

    it('Wall Rush still slides during the closed phase', () => {
      const engine = parkedCosmic();
      engine.grantMutation('wall_rush');
      for (let i = 0; i < 75; i++) engine.tick(); // closed, head (5,10)
      for (let i = 0; i < 15; i++) engine.tick(); // wall -> slide
      const state = engine.getState();
      expect(state.isDeathSequence).toBe(false);
      expect(state.direction).toBe('DOWN');
    });

    it('cycles back to open after the closed window', () => {
      const engine = new SnakeGameLogic({
        gridSize: 60,
        ruleset: RULESETS.COSMIC,
        rng: () => 0.999,
      });
      engine.start();
      engine.placeFood({ x: 0, y: 0, z: 0 });
      const changes: any[] = [];
      engine.on('fluxPhaseChange', (data) => changes.push(data));

      for (let i = 0; i < 75; i++) engine.tick(); // open -> closed, head (45,30)
      engine.setDirection('DOWN');
      for (let i = 0; i < 25; i++) engine.tick();
      engine.setDirection('LEFT');
      for (let i = 0; i < 25; i++) engine.tick(); // closed window survived

      expect(changes.map((c) => c.phase)).toEqual(['closed', 'open']);
      const state = engine.getState();
      expect(state.fluxPhase).toBe('open');
      expect(state.fluxTicksRemaining).toBe(75);
      expect(state.isGameOver).toBe(false);
    });

    it('the choice hold freezes the flux clock (deterministic pause)', () => {
      const engine = parkedCosmic();
      const head = engine.getState().snake[0];
      engine.placeMutation({ x: head.x + 1, y: 0, z: head.z });
      engine.tick(); // opens the choice
      expect(engine.getState().pendingChoice).not.toBeNull();
      const frozen = engine.getState().fluxTicksRemaining;
      for (let i = 0; i < 5; i++) engine.tick();
      expect(engine.getState().fluxTicksRemaining).toBe(frozen);
      engine.chooseMutation(0);
      engine.tick();
      expect(engine.getState().fluxTicksRemaining).toBe(frozen - 1);
    });
  });

  describe('Phase 2 restart hygiene', () => {
    it('restart clears mutations, choice, phoenix, combo, and flux state', () => {
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
      expect(state.chainLength).toBe(0);
      expect(state.comboDnaBonus).toBe(0);
      expect(state.maxChain).toBe(0);
      expect(state.fluxPhase).toBe('open');
      expect(state.fluxTicksRemaining).toBe(75);
      expect(state.nextMutationAtFood).toBe(20); // rng 0.5 -> 20
      expect(state.foods).toHaveLength(3);
    });
  });
});
