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
} from './SnakeGameLogic';

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
      game.setDirection('LEFT');
      const initialHead = { ...game.getState().snake[0] };
      game.tick();
      const newHead = game.getState().snake[0];
      expect(newHead.x).toBe(initialHead.x - 1);
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

    it('should change direction when valid', () => {
      game.setDirection('UP');
      expect(game.getState().direction).toBe('UP');
    });

    it('should not allow reverse direction (RIGHT to LEFT)', () => {
      game.setDirection('LEFT');
      expect(game.getState().direction).toBe('RIGHT');
    });

    it('should not allow reverse direction (UP to DOWN)', () => {
      game.setDirection('UP');
      game.tick();
      game.setDirection('DOWN');
      expect(game.getState().direction).toBe('UP');
    });

    it('should allow perpendicular direction changes', () => {
      game.setDirection('UP');
      expect(game.getState().direction).toBe('UP');
      game.tick();
      game.setDirection('LEFT');
      expect(game.getState().direction).toBe('LEFT');
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

  describe('Speed Progression', () => {
    beforeEach(() => {
      game.start();
    });

    it('should have initial speed', () => {
      expect(game.getSpeed()).toBe(200);
    });

    it('should increase speed after eating food', () => {
      const initialSpeed = game.getSpeed();
      const state = game.getState();
      game.placeFood({ x: state.snake[0].x + 1, y: 0, z: state.snake[0].z });
      game.tick();

      expect(game.getSpeed()).toBeLessThan(initialSpeed);
    });

    it('should not exceed minimum speed', () => {
      for (let i = 0; i < 50; i++) {
        const state = game.getState();
        if (!state.isGameOver) {
          game.placeFood({ x: state.snake[0].x + 1, y: 0, z: state.snake[0].z });
          game.tick();
        }
      }
      expect(game.getSpeed()).toBeGreaterThanOrEqual(50);
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

    it('should increment score by 1 per food', () => {
      const state = game.getState();
      game.placeFood({ x: state.snake[0].x + 1, y: 0, z: state.snake[0].z });
      game.tick();

      expect(game.getState().score).toBe(1);
    });
  });
});
